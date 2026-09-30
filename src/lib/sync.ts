import { useSyncExternalStore } from 'react'
import { MAX_PUSH, type SyncChange, type SyncRequest, type SyncResponse } from '../shared/sync'
import { asRemote, db, onLocalChange } from './db'
import { useSettings } from './settings'
import { KINDS, type Kind, type Wine } from './types'

/**
 * Offline-first sync with the Worker. Local IndexedDB is always the source the UI reads.
 *  push: records whose updatedAt > lastPush, plus tombstones
 *  pull: server changes with rev > cursor, applied last-write-wins by updatedAt
 * Photos travel separately (PUT/GET /api/photo/:wineId).
 */

export interface SyncState {
  available: boolean // a MioVino server answered /api/health
  scan: boolean // server can scan labels (has an API key)
  status: 'idle' | 'syncing' | 'error' | 'offline' | 'signed-out'
  lastSync?: number
  error?: string
}

let state: SyncState = { available: false, scan: false, status: 'idle' }
const listeners = new Set<() => void>()
const set = (patch: Partial<SyncState>) => {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}
export function useSync(): SyncState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )
}

/** True when labels can be scanned: via the server, or with a key saved on this device. */
export function useCanScan(): boolean {
  const s = useSync()
  const settings = useSettings()
  return s.scan || !!settings.apiKey
}

let statusPromise: Promise<{ available: boolean; scan: boolean }> | undefined
/** Checks once whether this app is served by the MioVino Worker (vs plain static hosting / offline). */
export function serverStatus(force = false) {
  if (!statusPromise || force) {
    statusPromise = fetch('/api/health', { headers: { accept: 'application/json' } })
      .then(async (r) => {
        if (!r.ok || !r.headers.get('content-type')?.includes('json')) return { available: false, scan: false }
        const j = (await r.json()) as { ok?: boolean; scan?: boolean }
        return { available: !!j.ok, scan: !!j.scan }
      })
      .catch(() => ({ available: false, scan: false }))
      .then((s) => {
        set({ available: s.available, scan: s.scan })
        return s
      })
  }
  return statusPromise
}

async function getMeta<T>(key: string, fallback: T): Promise<T> {
  return ((await db.meta.get(key))?.value as T) ?? fallback
}
const setMeta = (key: string, value: unknown) => db.meta.put({ key, value })

class SignedOut extends Error {}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, redirect: 'manual', credentials: 'same-origin' })
  // Cloudflare Access answers an expired session with a redirect to its login page.
  if (res.type === 'opaqueredirect' || res.status === 401 || res.status === 403) throw new SignedOut()
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`)
  return (await res.json()) as T
}

function toChange(kind: Kind, rec: Record<string, unknown>): SyncChange {
  const { photo, ...data } = rec as Record<string, unknown> & { photo?: Blob }
  if (kind === 'wines') data.hasPhoto = !!photo || !!data.hasPhoto
  return { kind, id: rec.id as string, updatedAt: (rec.updatedAt as number) ?? 0, deleted: false, data }
}

let running: Promise<void> | undefined
/** Runs one full sync (push then pull until caught up). Concurrent calls share the same run. */
export function syncNow(): Promise<void> {
  if (!running) running = doSync().finally(() => (running = undefined))
  return running
}

async function doSync() {
  const { available } = await serverStatus()
  if (!available) return
  if (navigator.onLine === false) return set({ status: 'offline' })
  set({ status: 'syncing', error: undefined })
  try {
    const startedAt = Date.now()
    const lastPush = await getMeta<number>('lastPush', 0)
    let cursor = await getMeta<number>('cursor', 0)

    // 1. Collect local changes since the last push.
    const changes: SyncChange[] = []
    const photosToUpload: Wine[] = []
    for (const kind of KINDS) {
      const recs = (await db.table_(kind).where('updatedAt').above(lastPush).toArray()) as unknown as Record<string, unknown>[]
      for (const r of recs) {
        changes.push(toChange(kind, r))
        if (kind === 'wines' && (r as unknown as Wine).photo) photosToUpload.push(r as unknown as Wine)
      }
    }
    for (const t of await db.tombstones.where('deletedAt').above(lastPush).toArray()) {
      changes.push({ kind: t.kind, id: t.id, updatedAt: t.deletedAt, deleted: true, data: null })
    }

    // 2. Photos first, so another device never sees hasPhoto without the file being there.
    for (const w of photosToUpload) {
      await fetch(`/api/photo/${w.id}`, { method: 'PUT', body: w.photo, headers: { 'content-type': 'image/jpeg' }, redirect: 'manual' })
    }

    // 3. Push in chunks, pulling as we go, then keep pulling until caught up.
    let pending = changes
    let more = true
    const pulled: SyncChange[] = []
    while (pending.length || more) {
      const chunk = pending.slice(0, MAX_PUSH)
      pending = pending.slice(MAX_PUSH)
      const res = await api<SyncResponse>('/api/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cursor, changes: chunk } satisfies SyncRequest),
      })
      pulled.push(...res.changes)
      cursor = res.cursor
      more = res.more
    }

    // 4. Apply pulled changes, last write wins.
    await applyRemote(pulled)
    await setMeta('cursor', cursor)
    await setMeta('lastPush', startedAt)
    const lastSync = Date.now()
    await setMeta('lastSync', lastSync)
    set({ status: 'idle', lastSync })
    void fetchMissingPhotos()
  } catch (e) {
    if (e instanceof SignedOut) set({ status: 'signed-out', error: 'Your sign-in expired. Reload to sign in again.' })
    else set({ status: navigator.onLine ? 'error' : 'offline', error: (e as Error).message })
  }
}

export async function applyRemote(changes: SyncChange[]) {
  if (!changes.length) return
  await asRemote(() =>
    db.transaction('rw', [db.wines, db.bottles, db.tastings, db.locations, db.tombstones], async () => {
      for (const c of changes) {
        const table = db.table_(c.kind)
        const local = (await table.get(c.id)) as (Record<string, unknown> & { updatedAt?: number; photo?: Blob }) | undefined
        if (local && (local.updatedAt ?? 0) > c.updatedAt) continue // our copy is newer; it will be pushed
        if (c.deleted) {
          if (local) await table.delete(c.id)
          continue
        }
        const next = { ...c.data, id: c.id, updatedAt: c.updatedAt } as Record<string, unknown>
        if (local?.photo && next.hasPhoto) next.photo = local.photo // keep the cached image
        await table.put(next as never)
      }
    }),
  )
}

/** Downloads photos for wines that have one on the server but not on this device. */
async function fetchMissingPhotos() {
  const wines = await db.wines.filter((w) => !!w.hasPhoto && !w.photo).toArray()
  for (const w of wines) {
    const res = await fetch(`/api/photo/${w.id}`, { redirect: 'manual' }).catch(() => undefined)
    if (!res?.ok) continue
    const blob = await res.blob()
    await asRemote(() => db.wines.update(w.id!, { photo: blob }))
  }
}

/** Starts background sync: now, on focus/online, shortly after local edits, and every 5 minutes. */
export function startSync() {
  void db.meta.get('lastSync').then((m) => m && set({ lastSync: m.value as number }))
  void serverStatus().then(({ available }) => {
    if (!available) return
    void syncNow()
    let timer: ReturnType<typeof setTimeout> | undefined
    onLocalChange(() => {
      clearTimeout(timer)
      timer = setTimeout(() => void syncNow(), 2000)
    })
    window.addEventListener('online', () => void syncNow())
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && void syncNow())
    setInterval(() => void syncNow(), 5 * 60 * 1000)
  })
}

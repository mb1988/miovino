import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import Dexie from 'dexie'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SyncChange } from '../shared/sync'
import type { Db, Stmt } from '../../worker/sync'

/** node:sqlite wrapped in the slice of the D1 API the Worker uses. */
function sqliteD1(): Db & { raw: DatabaseSync } {
  const raw = new DatabaseSync(':memory:')
  raw.exec(readFileSync(new URL('../../migrations/0001_init.sql', import.meta.url), 'utf8'))
  const stmt = (sql: string, params: unknown[] = []): Stmt => ({
    bind: (...v: unknown[]) => stmt(sql, v),
    all: async <T,>() => ({ results: raw.prepare(sql).all(...(params as never[])) as T[] }),
    run: async () => ({ meta: { changes: Number(raw.prepare(sql).run(...(params as never[])).changes) } }),
  })
  return {
    raw,
    prepare: (sql) => stmt(sql),
    batch: async (stmts) => {
      raw.exec('BEGIN')
      try {
        const out = []
        for (const s of stmts) out.push(await s.run())
        raw.exec('COMMIT')
        return out
      } catch (e) {
        raw.exec('ROLLBACK')
        throw e
      }
    },
  }
}

const wine = (id: string, updatedAt: number, name = 'Barolo'): SyncChange => ({ kind: 'wines', id: `wine-${id}-0000`, updatedAt, deleted: false, data: { producer: 'Vietti', name, vintage: 2016 } })

describe('server sync (D1 schema on SQLite)', async () => {
  const { sync, validate } = await import('../../worker/sync')

  it('stores pushes and returns them to a fresh device', async () => {
    const db = sqliteD1()
    const r1 = await sync(db, { cursor: 0, changes: [wine('a', 100), wine('b', 100)] })
    expect(r1.accepted).toBe(2)
    expect(r1.cursor).toBe(2)
    const fresh = await sync(db, { cursor: 0, changes: [] })
    expect(fresh.changes.map((c) => c.id)).toEqual(['wine-a-0000', 'wine-b-0000'])
    expect(db.raw.prepare('SELECT producer, vintage FROM wines').all()).toEqual([
      { producer: 'Vietti', vintage: 2016 },
      { producer: 'Vietti', vintage: 2016 },
    ])
  })

  it('last write wins: an older edit never overwrites a newer one', async () => {
    const db = sqliteD1()
    await sync(db, { cursor: 0, changes: [wine('a', 200, 'New name')] })
    const r = await sync(db, { cursor: 1, changes: [wine('a', 100, 'Old name')] })
    expect(r.accepted).toBe(0)
    expect(r.changes).toEqual([]) // nothing new since cursor 1
    const all = await sync(db, { cursor: 0, changes: [] })
    expect(all.changes[0].data).toMatchObject({ name: 'New name' })
  })

  it('propagates deletions as tombstones', async () => {
    const db = sqliteD1()
    await sync(db, { cursor: 0, changes: [wine('a', 100)] })
    await sync(db, { cursor: 1, changes: [{ kind: 'wines', id: 'wine-a-0000', updatedAt: 150, deleted: true, data: null }] })
    const r = await sync(db, { cursor: 1, changes: [] })
    expect(r.changes).toEqual([{ kind: 'wines', id: 'wine-a-0000', updatedAt: 150, deleted: true, data: null }])
    expect(db.raw.prepare('SELECT COUNT(*) AS n FROM wines').get()).toEqual({ n: 0 })
  })

  it('pages large pulls', async () => {
    const db = sqliteD1()
    const many = Array.from({ length: 450 }, (_, i) => wine(String(i).padStart(4, '0'), 1))
    for (let i = 0; i < 3; i++) await sync(db, { cursor: 0, changes: many.map((c) => ({ ...c, id: c.id.replace('wine-', `w${i}-`) })) })
    const first = await sync(db, { cursor: 0, changes: [] })
    expect(first.changes).toHaveLength(1000)
    expect(first.more).toBe(true)
    const second = await sync(db, { cursor: first.cursor, changes: [] })
    expect(second.changes).toHaveLength(350)
    expect(second.more).toBe(false)
  })

  it('rejects malformed requests', () => {
    expect(() => validate({ cursor: -1, changes: [] })).toThrow()
    expect(() => validate({ cursor: 0, changes: [{ kind: 'users', id: 'x'.repeat(10), updatedAt: 1, deleted: false, data: {} }] })).toThrow()
    expect(() => validate({ cursor: 0, changes: [{ kind: 'wines', id: "'; DROP TABLE records; --", updatedAt: 1, deleted: false, data: {} }] })).toThrow()
  })
})

describe('two devices syncing through the Worker', () => {
  let server: ReturnType<typeof sqliteD1>
  const photos = new Map<string, ArrayBuffer>()

  beforeEach(async () => {
    server = sqliteD1()
    photos.clear()
    // Loaded by path so the browser tsconfig doesn't typecheck Worker-only globals (D1Database, R2Bucket…).
    const workerPath = new URL('../../worker/index.ts', import.meta.url).href
    const worker = ((await import(/* @vite-ignore */ workerPath)) as { default: { fetch: (req: Request, env: unknown) => Promise<Response> } }).default
    const env = {
      DB: server,
      ALLOW_NO_AUTH: 'true',
      ASSETS: { fetch: async () => new Response('index') },
      PHOTOS: {
        put: async (k: string, v: ArrayBuffer) => void photos.set(k, v),
        get: async (k: string) => (photos.has(k) ? { body: photos.get(k), httpEtag: '"1"' } : null),
        delete: async (keys: string[]) => keys.forEach((k) => photos.delete(k)),
      },
    }
    vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
      const res = await worker.fetch(new Request(new URL(input, 'https://cellar.test'), init), env)
      return res
    })
  })

  /** Loads a fresh copy of the app modules backed by its own IndexedDB = one device. */
  async function device() {
    vi.resetModules()
    // Dexie (an external dependency) survives resetModules and caches its IndexedDB, so swap it explicitly.
    Dexie.dependencies.indexedDB = new IDBFactory()
    Dexie.dependencies.IDBKeyRange = IDBKeyRange
    const dbm = await import('./db')
    const syncm = await import('./sync')
    return { ...dbm, ...syncm }
  }

  it('a wine added on the phone shows up on the laptop, and edits/deletes flow back', async () => {
    const phone = await device()
    const id = await phone.addWineWithBottles({ producer: 'Vietti', name: 'Barolo Castiglione', vintage: 2016, type: 'red', grapes: ['Nebbiolo'], bottleSize: 750, external: [], favourite: false, tags: [] }, 2, { location: 'Rack A' })
    await phone.syncNow()

    const laptop = await device()
    await laptop.syncNow()
    expect((await laptop.db.wines.get(id))?.name).toBe('Barolo Castiglione')
    expect(await laptop.db.bottles.where('wineId').equals(id).count()).toBe(2)
    expect(await laptop.db.locations.count()).toBe(1)

    // Laptop drinks a bottle; the phone sees it after its next sync.
    await new Promise((r) => setTimeout(r, 5))
    await laptop.drinkBottle(id, { date: '2026-09-30', rating: 4.5, notes: 'Lovely' })
    await laptop.syncNow()
    await phone.syncNow()
    const phoneBottles = await phone.db.bottles.where('wineId').equals(id).toArray()
    expect(phoneBottles.filter((b) => b.status === 'drunk')).toHaveLength(1)
    expect((await phone.db.tastings.toArray())[0]).toMatchObject({ rating: 4.5, notes: 'Lovely' })
  })

  it('deleting a wine removes it on the other device', async () => {
    const a = await device()
    const id = await a.addWineWithBottles({ producer: 'Gaja', name: 'Dagromis', vintage: 2016, type: 'red', grapes: [], bottleSize: 750, external: [], favourite: false, tags: [] }, 1)
    await a.syncNow()
    await new Promise((r) => setTimeout(r, 5))
    await a.deleteWine(id)
    await new Promise((r) => setTimeout(r, 20)) // tombstones are written after the delete transaction
    await a.syncNow()

    const b = await device()
    await b.syncNow()
    expect(await b.db.wines.count()).toBe(0)
    expect(await b.db.bottles.count()).toBe(0)
    expect(server.raw.prepare('SELECT COUNT(*) AS n FROM wines').get()).toEqual({ n: 0 })
  })
})

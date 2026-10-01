import Dexie, { type EntityTable, type Table } from 'dexie'
import { DEMO } from './demo'
import { KINDS, type Bottle, type Kind, type Location, type Tasting, type Tombstone, type Wine, type WineWithBottles, type WishItem } from './types'

/** Key/value store for sync bookkeeping (cursor, last push time). */
interface Meta {
  key: string
  value: unknown
}

export class MioVinoDB extends Dexie {
  wines!: EntityTable<Wine, 'id'>
  bottles!: EntityTable<Bottle, 'id'>
  tastings!: EntityTable<Tasting, 'id'>
  locations!: EntityTable<Location, 'id'>
  wishlist!: EntityTable<WishItem, 'id'>
  tombstones!: EntityTable<Tombstone, 'key'>
  meta!: EntityTable<Meta, 'key'>

  constructor(name = 'miovino2') {
    super(name)
    // String UUID primary keys so records created on different devices never collide.
    this.version(1).stores({
      wines: 'id, producer, vintage, type, country, region, favourite, updatedAt',
      bottles: 'id, wineId, status, location, updatedAt',
      tastings: 'id, wineId, bottleId, date, rating, updatedAt',
      locations: 'id, name, order, updatedAt',
      tombstones: 'key, deletedAt',
      meta: 'key',
    })
    this.version(2).stores({ wishlist: 'id, done, wineId, updatedAt' })
    for (const kind of KINDS) trackChanges(this, kind)
  }

  table_(kind: Kind): Table<Wine | Bottle | Tasting | Location | WishItem, string> {
    return this[kind] as unknown as Table<Wine | Bottle | Tasting | Location | WishItem, string>
  }
}

/** While true, hooks don't stamp updatedAt or write tombstones (we're applying server data verbatim). */
let applyingRemote = false
export async function asRemote<T>(fn: () => Promise<T>): Promise<T> {
  applyingRemote = true
  try {
    return await fn()
  } finally {
    applyingRemote = false
  }
}

const changeListeners = new Set<() => void>()
/** Fires after any local (non-remote) change; the sync engine listens to schedule a push. */
export function onLocalChange(fn: () => void) {
  changeListeners.add(fn)
  return () => changeListeners.delete(fn)
}
const notify = () => changeListeners.forEach((l) => l())

function trackChanges(database: MioVinoDB, kind: Kind) {
  const table = database[kind] as unknown as Table<{ id?: string; updatedAt?: number }, string>
  table.hook('creating', function (_key, obj) {
    if (!obj.id) obj.id = crypto.randomUUID()
    if (!applyingRemote) {
      obj.updatedAt = Date.now()
      this.onsuccess = notify
    }
    return obj.id
  })
  table.hook('updating', function (mods) {
    if (applyingRemote || 'updatedAt' in mods) return undefined
    this.onsuccess = notify
    return { updatedAt: Date.now() }
  })
  table.hook('deleting', function (key, _obj, tx) {
    if (applyingRemote) return
    const ts = Date.now()
    tx.on('complete', () => {
      database.tombstones.put({ key: `${kind}:${key}`, kind, id: key, deletedAt: ts }).then(notify)
    })
  })
}

// The demo (/demo) gets its own database so it can never mix with the real cellar.
export const db = new MioVinoDB(DEMO ? 'miovino-demo' : 'miovino2')

export function now() {
  return Date.now()
}

export function today() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Joins wines with their bottles and tastings — the shape every screen works with. */
export async function loadCellar(database: MioVinoDB = db): Promise<WineWithBottles[]> {
  const [wines, bottles, tastings] = await Promise.all([database.wines.toArray(), database.bottles.toArray(), database.tastings.toArray()])
  const bottlesBy = groupBy(bottles, (b) => b.wineId)
  const tastingsBy = groupBy(tastings, (t) => t.wineId)
  return wines.map((w) => joinWine(w, bottlesBy.get(w.id!) ?? [], tastingsBy.get(w.id!) ?? []))
}

export function joinWine(w: Wine, bottles: Bottle[], tastings: Tasting[]): WineWithBottles {
  const rated = tastings.filter((t) => t.rating != null)
  return {
    ...w,
    id: w.id!,
    bottles,
    inCellar: bottles.filter((b) => b.status === 'cellar').length,
    tastings: [...tastings].sort((a, b) => b.date.localeCompare(a.date)),
    avgRating: rated.length ? rated.reduce((s, t) => s + t.rating!, 0) / rated.length : undefined,
  }
}

function groupBy<T, K>(items: T[], key: (t: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>()
  for (const it of items) {
    const k = key(it)
    const arr = m.get(k)
    if (arr) arr.push(it)
    else m.set(k, [it])
  }
  return m
}

export async function addWineWithBottles(
  wine: Omit<Wine, 'id' | 'createdAt' | 'updatedAt'>,
  count: number,
  bottle: Partial<Omit<Bottle, 'id' | 'wineId'>> = {},
  database: MioVinoDB = db,
): Promise<string> {
  return database.transaction('rw', database.wines, database.bottles, database.locations, async () => {
    const wineId = (await database.wines.add({ ...wine, createdAt: now() } as Wine)) as string
    await addBottles(wineId, count, bottle, database)
    return wineId
  })
}

export async function addBottles(wineId: string, count: number, bottle: Partial<Omit<Bottle, 'id' | 'wineId'>> = {}, database: MioVinoDB = db) {
  const ts = now()
  const rows: Bottle[] = Array.from({ length: count }, () => ({ status: 'cellar' as const, ...bottle, wineId, createdAt: ts }))
  await database.bottles.bulkAdd(rows)
  if (bottle.location) await ensureLocation(bottle.location, database)
}

export async function ensureLocation(name: string, database: MioVinoDB = db) {
  const trimmed = name.trim()
  if (!trimmed) return
  const existing = await database.locations.where('name').equals(trimmed).first()
  if (!existing) await database.locations.add({ name: trimmed, order: await database.locations.count() })
}

export async function updateWine(id: string, patch: Partial<Wine>) {
  await db.wines.update(id, patch)
}

export async function deleteWine(id: string) {
  await db.transaction('rw', db.wines, db.bottles, db.tastings, async () => {
    await db.bottles.where('wineId').equals(id).delete()
    await db.tastings.where('wineId').equals(id).delete()
    await db.wines.delete(id)
  })
}

/** Deletes everything, recording tombstones so the deletion syncs to other devices. */
export async function deleteAllData() {
  await db.transaction('rw', [db.wines, db.bottles, db.tastings, db.locations, db.wishlist], async () => {
    for (const kind of KINDS) await db.table_(kind).toCollection().delete()
  })
}

/** Marks one cellar bottle as drunk and records the tasting in one step. */
export async function drinkBottle(wineId: string, tasting: Omit<Tasting, 'id' | 'wineId' | 'bottleId' | 'createdAt'>, bottleId?: string): Promise<string> {
  return db.transaction('rw', db.bottles, db.tastings, async () => {
    let bottle = bottleId != null ? await db.bottles.get(bottleId) : undefined
    if (!bottle) bottle = await db.bottles.where({ wineId, status: 'cellar' }).first()
    const tastingId = (await db.tastings.add({ ...tasting, wineId, bottleId: bottle?.id, createdAt: now() })) as string
    if (bottle) await db.bottles.update(bottle.id!, { status: 'drunk', consumedAt: tasting.date, tastingId, slot: undefined })
    return tastingId
  })
}

/**
 * One-time move from the first local database (numeric ids) to this one (UUIDs).
 * Runs on startup; does nothing if there is no old database or the new one already has data.
 */
export async function migrateLegacy(): Promise<number> {
  if (!(await Dexie.exists('miovino'))) return 0
  if ((await db.wines.count()) > 0) return 0
  const old = new Dexie('miovino')
  old.version(1).stores({ wines: '++id', bottles: '++id', tastings: '++id', locations: '++id' })
  type Old = Record<string, unknown> & { id: number }
  const [wines, bottles, tastings, locations] = (await Promise.all([old.table('wines').toArray(), old.table('bottles').toArray(), old.table('tastings').toArray(), old.table('locations').toArray()])) as Old[][]
  const wineIds = new Map(wines.map((w) => [w.id, crypto.randomUUID()]))
  const bottleIds = new Map(bottles.map((b) => [b.id, crypto.randomUUID()]))
  const tastingIds = new Map(tastings.map((t) => [t.id, crypto.randomUUID()]))
  await db.transaction('rw', db.wines, db.bottles, db.tastings, db.locations, async () => {
    await db.wines.bulkAdd(wines.map((w) => ({ ...w, id: wineIds.get(w.id)! }) as unknown as Wine))
    await db.bottles.bulkAdd(
      bottles.map((b) => ({ ...b, id: bottleIds.get(b.id)!, wineId: wineIds.get(b.wineId as number)!, tastingId: b.tastingId ? tastingIds.get(b.tastingId as number) : undefined }) as unknown as Bottle),
    )
    await db.tastings.bulkAdd(
      tastings.map((t) => ({ ...t, id: tastingIds.get(t.id)!, wineId: wineIds.get(t.wineId as number)!, bottleId: t.bottleId ? bottleIds.get(t.bottleId as number) : undefined }) as unknown as Tasting),
    )
    await db.locations.bulkAdd(locations.map((l) => ({ ...l, id: crypto.randomUUID() }) as unknown as Location))
  })
  old.close()
  await Dexie.delete('miovino')
  return wines.length
}

import Dexie, { type EntityTable } from 'dexie'
import type { Bottle, Location, Tasting, Wine, WineWithBottles } from './types'

export class MioVinoDB extends Dexie {
  wines!: EntityTable<Wine, 'id'>
  bottles!: EntityTable<Bottle, 'id'>
  tastings!: EntityTable<Tasting, 'id'>
  locations!: EntityTable<Location, 'id'>

  constructor(name = 'miovino') {
    super(name)
    this.version(1).stores({
      wines: '++id, producer, vintage, type, country, region, favourite, updatedAt',
      bottles: '++id, wineId, status, location',
      tastings: '++id, wineId, bottleId, date, rating',
      locations: '++id, &name, order',
    })
  }
}

export const db = new MioVinoDB()

export function now() {
  return Date.now()
}

export function today() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Joins wines with their bottles and tastings — the shape every screen works with. */
export async function loadCellar(database: MioVinoDB = db): Promise<WineWithBottles[]> {
  const [wines, bottles, tastings] = await Promise.all([
    database.wines.toArray(),
    database.bottles.toArray(),
    database.tastings.toArray(),
  ])
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
): Promise<number> {
  return database.transaction('rw', database.wines, database.bottles, database.locations, async () => {
    const ts = now()
    const wineId = (await database.wines.add({ ...wine, createdAt: ts, updatedAt: ts } as Wine)) as number
    await addBottles(wineId, count, bottle, database)
    return wineId
  })
}

export async function addBottles(
  wineId: number,
  count: number,
  bottle: Partial<Omit<Bottle, 'id' | 'wineId'>> = {},
  database: MioVinoDB = db,
) {
  const ts = now()
  const rows: Bottle[] = Array.from({ length: count }, () => ({
    status: 'cellar' as const,
    ...bottle,
    wineId,
    createdAt: ts,
  }))
  await database.bottles.bulkAdd(rows)
  if (bottle.location) await ensureLocation(bottle.location, database)
}

export async function ensureLocation(name: string, database: MioVinoDB = db) {
  const trimmed = name.trim()
  if (!trimmed) return
  const existing = await database.locations.where('name').equals(trimmed).first()
  if (!existing) await database.locations.add({ name: trimmed, order: await database.locations.count() })
}

export async function updateWine(id: number, patch: Partial<Wine>) {
  await db.wines.update(id, { ...patch, updatedAt: now() })
}

export async function deleteWine(id: number) {
  await db.transaction('rw', db.wines, db.bottles, db.tastings, async () => {
    await db.bottles.where('wineId').equals(id).delete()
    await db.tastings.where('wineId').equals(id).delete()
    await db.wines.delete(id)
  })
}

/** Marks one cellar bottle as drunk and records the tasting in one step. */
export async function drinkBottle(
  wineId: number,
  tasting: Omit<Tasting, 'id' | 'wineId' | 'bottleId' | 'createdAt'>,
  bottleId?: number,
): Promise<number> {
  return db.transaction('rw', db.bottles, db.tastings, db.wines, async () => {
    let bottle = bottleId != null ? await db.bottles.get(bottleId) : undefined
    if (!bottle) bottle = await db.bottles.where({ wineId, status: 'cellar' }).first()
    const tastingId = (await db.tastings.add({
      ...tasting,
      wineId,
      bottleId: bottle?.id,
      createdAt: now(),
    })) as number
    if (bottle) await db.bottles.update(bottle.id!, { status: 'drunk', consumedAt: tasting.date, tastingId })
    await db.wines.update(wineId, { updatedAt: now() })
    return tastingId
  })
}

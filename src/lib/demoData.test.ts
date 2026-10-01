import Dexie from 'dexie'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'
import { demoData } from './demoData'
import { drinkStatus } from './status'

Dexie.dependencies.indexedDB = new IDBFactory()
Dexie.dependencies.IDBKeyRange = IDBKeyRange
const { layout } = await import('./rack')

describe('demo data', () => {
  const now = new Date('2026-10-01T12:00:00Z')
  const d = demoData(now)

  it('is the same every time', () => {
    expect(demoData(now)).toEqual(d)
  })

  it('only references things that exist', () => {
    const wines = new Set(d.wines.map((w) => w.id))
    const tastings = new Set(d.tastings.map((x) => x.id))
    const locs = new Set(d.locations.map((l) => l.name))
    for (const b of d.bottles) {
      expect(wines.has(b.wineId)).toBe(true)
      if (b.tastingId) expect(tastings.has(b.tastingId)).toBe(true)
      if (b.location) expect(locs.has(b.location)).toBe(true)
    }
    for (const x of d.tastings) expect(wines.has(x.wineId)).toBe(true)
    expect(new Set(d.bottles.map((b) => b.id)).size).toBe(d.bottles.length)
  })

  it('places bottles in free slots inside each rack, leaving a few to place', () => {
    let unplaced = 0
    for (const loc of d.locations.filter((l) => l.rows)) {
      const here = d.bottles.filter((b) => b.location === loc.name && b.status === 'cellar')
      const res = layout(loc, here)
      expect(res.slots.size).toBe(here.filter((b) => b.slot).length)
      unplaced += res.unplaced.length
    }
    expect(unplaced).toBeGreaterThan(0)
  })

  it('has a mix of drinking states, and every wine still in the cellar', () => {
    const states = new Set(d.wines.map((w) => drinkStatus(w, 2026)))
    for (const s of ['past', 'soon', 'ready', 'hold'] as const) expect(states).toContain(s)
    for (const w of d.wines) expect(d.bottles.some((b) => b.wineId === w.id && b.status === 'cellar')).toBe(true)
  })
})

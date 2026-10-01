import Dexie from 'dexie'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'
import type { Bottle } from './types'

Dexie.dependencies.indexedDB = new IDBFactory()
Dexie.dependencies.IDBKeyRange = IDBKeyRange
const { layout, parseSlot, placeBottles, slotName, suggestSlots, unslotted } = await import('./rack')

const bottle = (id: string, slot: string | undefined, extra: Partial<Bottle> = {}): Bottle => ({ id, wineId: 'w', status: 'cellar', location: 'Rack A', slot, createdAt: 0, updatedAt: Number(id), ...extra })

describe('rack slots', () => {
  it('names and parses slots', () => {
    expect(slotName(1, 2)).toBe('B3')
    expect(parseSlot('b3')).toEqual({ row: 1, col: 2 })
    expect(parseSlot('B12')).toEqual({ row: 1, col: 11 })
    expect(parseSlot('3B')).toBeNull()
    expect(parseSlot(undefined)).toBeNull()
  })

  it('lays out bottles and lists the ones without a valid slot', () => {
    const { slots, unplaced } = layout({ name: 'Rack A', rows: 2, cols: 3 }, [
      bottle('1', 'A1'),
      bottle('2', 'A1'), // same slot, placed later: loses it
      bottle('3', 'C1'), // outside a 2-row grid
      bottle('4', undefined),
      bottle('5', 'B2', { status: 'drunk' }), // not in the cellar: ignored
      bottle('6', 'B2', { location: 'Fridge' }), // another rack: ignored
    ])
    expect([...slots].map(([k, b]) => [k, b.id])).toEqual([['A1', '1']])
    expect(unplaced.map((b) => b.id)).toEqual(['2', '3', '4'])
  })

  it('treats a rack without a grid as all unplaced', () => {
    expect(layout({ name: 'Rack A' }, [bottle('1', 'A1')]).unplaced).toHaveLength(1)
  })

  it('places a bottle, refuses a taken slot, frees it when drunk', async () => {
    const { db, drinkBottle } = await import('./db')
    const { placeBottle } = await import('./rack')
    await db.bottles.bulkAdd([bottle('a', undefined, { location: undefined }), bottle('b', undefined, { location: undefined })])
    await placeBottle('a', 'Rack A', 'B2')
    expect(await db.bottles.get('a')).toMatchObject({ location: 'Rack A', slot: 'B2' })
    await expect(placeBottle('b', 'Rack A', 'B2')).rejects.toThrow('B2 is already taken')
    await drinkBottle('w', { date: '2026-09-30' }, 'a')
    expect((await db.bottles.get('a'))?.slot).toBeUndefined()
    await placeBottle('b', 'Rack A', 'B2')
    expect((await db.bottles.get('b'))?.slot).toBe('B2')
  })

  const wines: Record<string, { wineId: string; producer: string; type: string }> = {
    barolo: { wineId: 'barolo', producer: 'Vietti', type: 'red' },
    barbera: { wineId: 'barbera', producer: 'Vietti', type: 'red' },
    chablis: { wineId: 'chablis', producer: 'Brocard', type: 'white' },
    soave: { wineId: 'soave', producer: 'Pieropan', type: 'white' },
  }
  const of = (id: string) => wines[id]
  const rack = { name: 'Rack A', rows: 3, cols: 4 }

  it('suggests slots next to the same wine, staying on its shelf', () => {
    const here = [bottle('1', 'B2', { wineId: 'barolo' }), bottle('2', 'A1', { wineId: 'chablis' })]
    expect(suggestSlots(rack, here, wines.barolo, 2, of)).toEqual(['B1', 'B3'])
  })

  it('falls back to the same producer, then the same type', () => {
    expect(suggestSlots(rack, [bottle('1', 'C4', { wineId: 'barbera' })], wines.barolo, 1, of)).toEqual(['C3'])
    expect(suggestSlots(rack, [bottle('1', 'A4', { wineId: 'chablis' })], wines.soave, 1, of)).toEqual(['A3'])
  })

  it('with no neighbours, keeps the bottles side by side on the first shelf with room', () => {
    const here = [bottle('1', 'A2', { wineId: 'chablis' })] // breaks shelf A into runs of 1 and 2
    expect(suggestSlots(rack, here, wines.barolo, 3, of)).toEqual(['B1', 'B2', 'B3'])
  })

  it('never suggests more slots than are free', () => {
    const full = Array.from({ length: 11 }, (_, i) => bottle(String(i), slotName(Math.floor(i / 4), i % 4), { wineId: 'chablis' }))
    expect(suggestSlots(rack, full, wines.barolo, 5, of)).toEqual(['C4'])
    expect(suggestSlots({ name: 'Fridge' }, [], wines.barolo, 2, of)).toEqual([])
  })

  it('counts only the bottles without a slot on any grid as placeable', () => {
    const all = [
      bottle('1', 'A1', { wineId: 'barolo' }),
      bottle('2', undefined, { wineId: 'barolo' }),
      bottle('3', undefined, { wineId: 'barolo', location: 'Fridge' }),
      bottle('4', undefined, { wineId: 'barolo', status: 'drunk' }),
    ]
    expect(unslotted('barolo', all, [rack, { name: 'Fridge' }]).map((b) => b.id)).toEqual(['2', '3'])
  })

  it('places several bottles in one go, or none if a slot is taken', async () => {
    const { db } = await import('./db')
    await db.bottles.bulkAdd([bottle('p1', undefined, { location: 'Fridge' }), bottle('p2', undefined, { location: undefined }), bottle('p3', 'C1')])
    await expect(placeBottles('Rack A', [{ bottleId: 'p1', slot: 'C2' }, { bottleId: 'p2', slot: 'C1' }])).rejects.toThrow('C1 is already taken')
    expect((await db.bottles.get('p1'))?.slot).toBeUndefined()
    await expect(placeBottles('Rack A', [{ bottleId: 'p1', slot: 'C2' }, { bottleId: 'p2', slot: 'C2' }])).rejects.toThrow('Two bottles in one slot')
    await placeBottles('Rack A', [{ bottleId: 'p1', slot: 'C2' }, { bottleId: 'p2', slot: 'C3' }])
    expect(await db.bottles.get('p1')).toMatchObject({ location: 'Rack A', slot: 'C2' })
  })
})

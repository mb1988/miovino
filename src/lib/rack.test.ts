import Dexie from 'dexie'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'
import type { Bottle } from './types'

Dexie.dependencies.indexedDB = new IDBFactory()
Dexie.dependencies.IDBKeyRange = IDBKeyRange
const { layout, parseSlot, slotName } = await import('./rack')

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
})

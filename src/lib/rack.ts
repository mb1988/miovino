import { db } from './db'
import type { Bottle, Location } from './types'

export const MAX_ROWS = 26
export const MAX_COLS = 20

/** "B3" = second row, third column. Rows are letters so they never read as a count. */
export function slotName(row: number, col: number) {
  return `${String.fromCharCode(65 + row)}${col + 1}`
}

export function parseSlot(slot: string | undefined): { row: number; col: number } | null {
  const m = /^([A-Z])(\d{1,2})$/.exec(slot?.trim().toUpperCase() ?? '')
  if (!m) return null
  return { row: m[1].charCodeAt(0) - 65, col: Number(m[2]) - 1 }
}

export function hasGrid(l: Pick<Location, 'rows' | 'cols'>): l is { rows: number; cols: number } {
  return !!l.rows && !!l.cols
}

/**
 * Lays out a location's cellar bottles on its grid.
 * Bottles with no slot, a slot outside the grid, or a slot another bottle already took are "unplaced".
 */
export function layout(loc: Pick<Location, 'name' | 'rows' | 'cols'>, bottles: Bottle[]) {
  const here = bottles.filter((b) => b.status === 'cellar' && b.location === loc.name)
  const slots = new Map<string, Bottle>()
  const unplaced: Bottle[] = []
  // Oldest first, so the bottle that was there first keeps a disputed slot.
  for (const b of [...here].sort((a, b) => (a.updatedAt ?? 0) - (b.updatedAt ?? 0))) {
    const p = parseSlot(b.slot)
    const key = p && slotName(p.row, p.col)
    if (hasGrid(loc) && p && key && p.row < loc.rows && p.col < loc.cols && !slots.has(key)) slots.set(key, b)
    else unplaced.push(b)
  }
  return { slots, unplaced }
}

/** Puts a bottle in a slot (moving it to this location). Refuses a slot that's already taken. */
export async function placeBottle(bottleId: string, location: string, slot: string) {
  await db.transaction('rw', db.bottles, async () => {
    const taken = await db.bottles
      .where('location')
      .equals(location)
      .filter((b) => b.status === 'cellar' && b.slot === slot && b.id !== bottleId)
      .count()
    if (taken) throw new Error(`${slot} is already taken`)
    await db.bottles.update(bottleId, { location, slot })
  })
}

export async function clearSlot(bottleId: string) {
  await db.bottles.update(bottleId, { slot: undefined })
}

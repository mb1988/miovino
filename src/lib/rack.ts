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

/** Cellar bottles of a wine that have no slot on any rack grid yet: the most that can be placed. */
export function unslotted(wineId: string, bottles: Bottle[], locations: Pick<Location, 'name' | 'rows' | 'cols'>[]) {
  const placed = new Set<string>()
  for (const l of locations) if (hasGrid(l)) for (const b of layout(l, bottles).slots.values()) placed.add(b.id!)
  return bottles.filter((b) => b.wineId === wineId && b.status === 'cellar' && !placed.has(b.id!))
}

interface Neighbour {
  wineId: string
  producer?: string
  type?: string
}

/**
 * Suggests `count` empty slots for a wine in this rack, kept together:
 * next to bottles of the same wine, else the same producer, else the same type; otherwise the first
 * shelf with room for all of them. Distance favours staying on the same shelf (row).
 * Returns fewer slots when the rack hasn't enough room.
 */
export function suggestSlots(loc: Pick<Location, 'name' | 'rows' | 'cols'>, bottles: Bottle[], wine: Neighbour, count: number, wineOf: (wineId: string) => Neighbour | undefined): string[] {
  if (!hasGrid(loc) || count <= 0) return []
  const { slots } = layout(loc, bottles)
  const empty: { row: number; col: number; key: string }[] = []
  for (let row = 0; row < loc.rows; row++) for (let col = 0; col < loc.cols; col++) if (!slots.has(slotName(row, col))) empty.push({ row, col, key: slotName(row, col) })
  if (!empty.length) return []

  const pos = [...slots.entries()].map(([key, b]) => ({ ...parseSlot(key)!, w: wineOf(b.wineId) }))
  const anchors =
    [(n?: Neighbour) => n?.wineId === wine.wineId, (n?: Neighbour) => !!wine.producer && n?.producer === wine.producer, (n?: Neighbour) => !!wine.type && n?.type === wine.type]
      .map((match) => pos.filter((p) => match(p.w)))
      .find((list) => list.length) ?? []

  const dist = (a: { row: number; col: number }, b: { row: number; col: number }) => Math.abs(a.row - b.row) * 3 + Math.abs(a.col - b.col)
  const nearest = (s: { row: number; col: number }, to: { row: number; col: number }[]) => Math.min(...to.map((t) => dist(s, t)))
  const take = Math.min(count, empty.length)

  let seed = empty[0]
  if (anchors.length) seed = empty.reduce((best, s) => (nearest(s, anchors) < nearest(best, anchors) ? s : best))
  else {
    // No neighbours: the first shelf with enough free slots in a row, so the bottles sit side by side.
    for (let row = 0; row < loc.rows; row++) {
      const free = empty.filter((s) => s.row === row)
      const run = free.find((s, i) => free.slice(i, i + take).every((x, j) => x.col === s.col + j) && free.length - i >= take)
      if (run) {
        seed = run
        break
      }
    }
  }

  const chosen = [seed]
  const left = empty.filter((s) => s !== seed)
  while (chosen.length < take) {
    // Grow from what's chosen; the reading order (row, then column) breaks ties.
    const next = left.reduce((best, s) => (nearest(s, chosen) < nearest(best, chosen) ? s : best))
    chosen.push(next)
    left.splice(left.indexOf(next), 1)
  }
  return chosen.map((s) => s.key)
}

/** Places several bottles at once (all or nothing). Refuses taken slots, duplicates and bottles no longer in the cellar. */
export async function placeBottles(location: string, assignments: { bottleId: string; slot: string }[]) {
  await db.transaction('rw', db.bottles, async () => {
    const slots = assignments.map((a) => a.slot)
    if (new Set(slots).size !== slots.length) throw new Error('Two bottles in one slot')
    const ids = new Set(assignments.map((a) => a.bottleId))
    const taken = await db.bottles
      .where('location')
      .equals(location)
      .filter((b) => b.status === 'cellar' && !!b.slot && slots.includes(b.slot) && !ids.has(b.id!))
      .first()
    if (taken) throw new Error(`${taken.slot} is already taken`)
    for (const a of assignments) {
      const b = await db.bottles.get(a.bottleId)
      if (b?.status !== 'cellar') throw new Error('That bottle is no longer in the cellar')
      await db.bottles.update(a.bottleId, { location, slot: a.slot })
    }
  })
}

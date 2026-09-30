import type { WineWithBottles } from './types'

export interface YearRow {
  year: number
  spent: number // on bottles bought that year (known prices only)
  bottlesIn: number
  bottlesOut: number // drunk, gifted or lost that year
}

const yearOf = (d?: string) => (d && /^\d{4}/.test(d) ? Number(d.slice(0, 4)) : undefined)

/** Money and bottles per year. A bottle counts as "in" in its purchase year (or the year it was added). */
export function cellarTimeline(cellar: WineWithBottles[]): { years: YearRow[]; valueAtCost: number; unpriced: number } {
  const rows = new Map<number, YearRow>()
  const row = (year: number) => rows.get(year) ?? rows.set(year, { year, spent: 0, bottlesIn: 0, bottlesOut: 0 }).get(year)!
  let valueAtCost = 0
  let unpriced = 0
  for (const w of cellar)
    for (const b of w.bottles) {
      const inYear = yearOf(b.purchaseDate) ?? new Date(b.createdAt).getFullYear()
      const r = row(inYear)
      r.bottlesIn++
      if (b.purchasePrice != null) r.spent += b.purchasePrice
      if (b.status !== 'cellar') {
        const outYear = yearOf(b.consumedAt)
        if (outYear) row(outYear).bottlesOut++
      } else if (b.purchasePrice != null) valueAtCost += b.purchasePrice
      else unpriced++
    }
  // Fill gaps so the chart's years are continuous.
  const ys = [...rows.keys()]
  if (ys.length) for (let y = Math.min(...ys); y <= Math.max(...ys); y++) row(y)
  return { years: [...rows.values()].sort((a, b) => a.year - b.year), valueAtCost, unpriced }
}

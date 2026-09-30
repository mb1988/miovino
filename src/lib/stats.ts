import { bottlePrice } from './recommend'
import { drinkStatus, type DrinkStatus } from './status'
import type { WineType, WineWithBottles } from './types'

export interface CellarStats {
  bottles: number
  wines: number
  value: number
  avgPrice: number
  byType: Partial<Record<WineType, number>>
  byStatus: Record<DrinkStatus, number>
  favourites: number
  drunkThisYear: number
}

export function cellarStats(cellar: WineWithBottles[], year = new Date().getFullYear()): CellarStats {
  const byType: Partial<Record<WineType, number>> = {}
  const byStatus: Record<DrinkStatus, number> = { past: 0, soon: 0, ready: 0, approaching: 0, hold: 0, unknown: 0 }
  let bottles = 0
  let value = 0
  let priced = 0
  let drunkThisYear = 0
  for (const w of cellar) {
    for (const b of w.bottles) {
      if (b.status === 'cellar') {
        bottles++
        if (b.purchasePrice != null) {
          value += b.purchasePrice
          priced++
        }
      } else if (b.status === 'drunk' && b.consumedAt?.startsWith(String(year))) drunkThisYear++
    }
    if (w.inCellar) {
      byType[w.type] = (byType[w.type] ?? 0) + w.inCellar
      byStatus[drinkStatus(w, year)] += w.inCellar
    }
  }
  return {
    bottles,
    wines: cellar.filter((w) => w.inCellar > 0).length,
    value,
    avgPrice: priced ? value / priced : 0,
    byType,
    byStatus,
    favourites: cellar.filter((w) => w.favourite).length,
    drunkThisYear,
  }
}

export interface Ranked {
  key: string
  bottles: number
  avgRating?: number
  tastings: number
}

/** Ranks a dimension (grape/region/producer/country) by bottles owned+drunk and by your ratings. */
export function rankBy(cellar: WineWithBottles[], pick: (w: WineWithBottles) => string[]): Ranked[] {
  const m = new Map<string, { bottles: number; ratings: number[]; tastings: number }>()
  for (const w of cellar) {
    for (const k of pick(w)) {
      if (!k) continue
      const e = m.get(k) ?? { bottles: 0, ratings: [], tastings: 0 }
      e.bottles += w.bottles.length
      e.tastings += w.tastings.length
      for (const t of w.tastings) if (t.rating != null) e.ratings.push(t.rating)
      m.set(k, e)
    }
  }
  return [...m.entries()]
    .map(([key, e]) => ({
      key,
      bottles: e.bottles,
      tastings: e.tastings,
      avgRating: e.ratings.length ? e.ratings.reduce((a, b) => a + b, 0) / e.ratings.length : undefined,
    }))
    .sort((a, b) => (b.avgRating ?? 0) - (a.avgRating ?? 0) || b.bottles - a.bottles)
}

export function tasteSummary(cellar: WineWithBottles[]): string | undefined {
  const tasted = cellar.filter((w) => w.tastings.some((t) => t.rating != null))
  if (tasted.length < 3) return undefined
  const grapes = rankBy(tasted, (w) => w.grapes).filter((r) => r.avgRating != null)
  const regions = rankBy(tasted, (w) => [w.region ?? '']).filter((r) => r.avgRating != null)
  const bits: string[] = []
  if (grapes[0]) bits.push(`${grapes[0].key}`)
  if (regions[0]) bits.push(`from ${regions[0].key}`)
  if (!bits.length) return undefined
  return `Your highest-rated wines so far are ${bits.join(' ')}.`
}

export { bottlePrice }

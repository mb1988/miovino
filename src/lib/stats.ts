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

/**
 * Ranks a dimension (grape/region/producer/country) by bottles owned+drunk and by your ratings.
 * `pick` may give each key a weight (its share of the wine); bottles and ratings count by that weight.
 */
export function rankBy(cellar: WineWithBottles[], pick: (w: WineWithBottles) => (string | [string, number])[]): Ranked[] {
  const m = new Map<string, { bottles: number; rated: number; weight: number; tastings: number }>()
  for (const w of cellar) {
    for (const item of pick(w)) {
      const [k, share] = typeof item === 'string' ? [item, 1] : item
      if (!k || share <= 0) continue
      const e = m.get(k) ?? { bottles: 0, rated: 0, weight: 0, tastings: 0 }
      e.bottles += w.bottles.length * share
      e.tastings += w.tastings.length
      for (const t of w.tastings)
        if (t.rating != null) {
          e.rated += t.rating * share
          e.weight += share
        }
      m.set(k, e)
    }
  }
  return [...m.entries()]
    .map(([key, e]) => ({
      key,
      bottles: Math.round(e.bottles * 10) / 10,
      tastings: e.tastings,
      avgRating: e.weight ? e.rated / e.weight : undefined,
    }))
    .sort((a, b) => (b.avgRating ?? 0) - (a.avgRating ?? 0) || b.bottles - a.bottles)
}

/**
 * Each grape with its share of the wine: the known percentages; grapes without one share what's left
 * equally (all equal when none is known). A 70/30 Bordeaux counts 0.7 Cabernet, 0.3 Merlot.
 */
export function grapeShares(w: Pick<WineWithBottles, 'grapes' | 'grapePct'>): [string, number][] {
  if (!w.grapes.length) return []
  const known = w.grapes.filter((g) => w.grapePct?.[g] != null)
  const knownTotal = known.reduce((s, g) => s + w.grapePct![g], 0)
  const rest = w.grapes.length - known.length
  const left = Math.max(0, 100 - knownTotal)
  return w.grapes.map((g) => [g, (w.grapePct?.[g] != null ? w.grapePct[g] : rest ? left / rest : 0) / 100] as [string, number]).filter(([, s]) => s > 0)
}

export function tasteSummary(cellar: WineWithBottles[]): string | undefined {
  const tasted = cellar.filter((w) => w.tastings.some((t) => t.rating != null))
  if (tasted.length < 3) return undefined
  const grapes = rankBy(tasted, grapeShares).filter((r) => r.avgRating != null)
  const regions = rankBy(tasted, (w) => [w.region ?? '']).filter((r) => r.avgRating != null)
  const bits: string[] = []
  if (grapes[0]) bits.push(`${grapes[0].key}`)
  if (regions[0]) bits.push(`from ${regions[0].key}`)
  if (!bits.length) return undefined
  return `Your highest-rated wines so far are ${bits.join(' ')}.`
}

export { bottlePrice }

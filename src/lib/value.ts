import type { WineWithBottles } from './types'

/** Average price paid for the bottles still in the cellar (known prices only). */
export function paidPerBottle(w: Pick<WineWithBottles, 'bottles'>): number | undefined {
  const prices = w.bottles.filter((b) => b.status === 'cellar' && b.purchasePrice != null).map((b) => b.purchasePrice!)
  return prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : undefined
}

/** Paid vs. today's price for one wine, or undefined when either side is missing. */
export function priceChange(w: Pick<WineWithBottles, 'bottles' | 'marketPrice'>) {
  const paid = paidPerBottle(w)
  if (paid == null || w.marketPrice == null || paid <= 0) return undefined
  const diff = w.marketPrice - paid
  return { paid, now: w.marketPrice, diff, pct: (diff / paid) * 100 }
}

/**
 * The cellar's worth at today's prices. Each bottle counts at the current price you set for its wine,
 * else at the AI's remembered typical UK price (`estimates`, by wine id), else at what you paid.
 * `repriced` counts bottles priced today (by you or the AI), `estimated` those priced by the AI.
 */
export function cellarValueNow(cellar: Pick<WineWithBottles, 'id' | 'bottles' | 'marketPrice'>[], estimates: Map<string, number> = new Map()) {
  let atCost = 0
  let now = 0
  let repriced = 0
  let estimated = 0
  for (const w of cellar)
    for (const b of w.bottles) {
      if (b.status !== 'cellar') continue
      const paid = b.purchasePrice
      if (paid != null) atCost += paid
      const ai = estimates.get(w.id)
      if (w.marketPrice != null) {
        now += w.marketPrice
        repriced++
      } else if (ai != null) {
        now += ai
        repriced++
        estimated++
      } else if (paid != null) now += paid
    }
  return { atCost, now, gain: now - atCost, repriced, estimated }
}

/** "+12%" / "−5%" with a real minus sign. */
export function signedPct(pct: number) {
  const r = Math.round(pct)
  return `${r > 0 ? '+' : r < 0 ? '−' : '±'}${Math.abs(r)}%`
}

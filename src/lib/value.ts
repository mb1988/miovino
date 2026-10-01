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
 * The cellar's worth at today's prices: each bottle at its wine's current price where you've set one,
 * otherwise at what you paid. `repriced` counts the bottles that used a current price.
 */
export function cellarValueNow(cellar: Pick<WineWithBottles, 'bottles' | 'marketPrice'>[]) {
  let atCost = 0
  let now = 0
  let repriced = 0
  for (const w of cellar)
    for (const b of w.bottles) {
      if (b.status !== 'cellar') continue
      const paid = b.purchasePrice
      if (paid != null) atCost += paid
      if (w.marketPrice != null) {
        now += w.marketPrice
        repriced++
      } else if (paid != null) now += paid
    }
  return { atCost, now, gain: now - atCost, repriced }
}

/** "+12%" / "−5%" with a real minus sign. */
export function signedPct(pct: number) {
  const r = Math.round(pct)
  return `${r > 0 ? '+' : r < 0 ? '−' : '±'}${Math.abs(r)}%`
}

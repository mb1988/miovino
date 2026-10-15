import type { WineWithBottles } from './types'
import { midPrice, type PricePoint } from '../shared/priceHistory'

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

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10)

export interface ValuePoint {
  month: string // yyyy-mm
  value: number // bottles then in the cellar, at the newest price known by the end of that month
  cost: number // the same bottles at what you paid
}

/**
 * The cellar's market value at the end of each of the last `months` months, from the remembered price history.
 * A bottle counts from its purchase date (or when it was added) until it was drunk; it is valued at the newest
 * price point up to that month (this month: your own price first), else at what you paid. The series starts
 * at the first month with any price point, so it shows only tracked months.
 */
export function valueHistory(cellar: Pick<WineWithBottles, 'id' | 'bottles' | 'marketPrice'>[], prices: Record<string, PricePoint[]>, months = 12, today = new Date()): ValuePoint[] {
  const out: ValuePoint[] = []
  let started = false
  for (let i = months - 1; i >= 0; i--) {
    const first = new Date(Date.UTC(today.getFullYear(), today.getMonth() - i, 1))
    const end = i === 0 ? isoDay(today.getTime()) : isoDay(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0))
    let value = 0
    let cost = 0
    let tracked = 0
    for (const w of cellar) {
      const point = prices[w.id]?.find((p) => p.at <= end && midPrice(p) != null) // newest first
      const market = i === 0 && w.marketPrice != null ? w.marketPrice : midPrice(point)
      for (const b of w.bottles) {
        if ((b.purchaseDate ?? isoDay(b.createdAt)) > end) continue
        if (b.status !== 'cellar' && (!b.consumedAt || b.consumedAt <= end)) continue
        cost += b.purchasePrice ?? 0
        if (market != null) tracked++
        value += market ?? b.purchasePrice ?? 0
      }
    }
    if (tracked) started = true
    if (started) out.push({ month: end.slice(0, 7), value: Math.round(value), cost: Math.round(cost) })
  }
  return out
}

export interface Mover {
  id: string
  paid: number
  now: number
  pct: number
}

/** Wines still in the cellar whose price today (yours, else the remembered one) differs most from what you paid. */
export function biggestMovers(cellar: Pick<WineWithBottles, 'id' | 'bottles' | 'marketPrice' | 'inCellar'>[], estimates: Map<string, number>, n = 3) {
  const all: Mover[] = []
  for (const w of cellar) {
    if (!w.inCellar) continue
    const paid = paidPerBottle(w)
    const now = w.marketPrice ?? estimates.get(w.id)
    if (paid == null || paid <= 0 || now == null) continue
    all.push({ id: w.id, paid, now, pct: ((now - paid) / paid) * 100 })
  }
  all.sort((a, b) => b.pct - a.pct)
  return {
    up: all.filter((m) => Math.round(m.pct) > 0).slice(0, n),
    down: all.filter((m) => Math.round(m.pct) < 0).slice(-n).reverse(),
  }
}

/** Is a restaurant price fair? Markup of the list price over UK retail (or what the owner paid). Shared by the Worker and the app. */

export type PriceVerdict = 'steal' | 'fair' | 'pricey' | 'ripoff'

/**
 * UK restaurants usually charge 2.5–3.5× retail. Upper bounds of each verdict, as list ÷ retail:
 * up to 2× is a steal, up to 3.5× fair, up to 5× pricey, above that a rip-off.
 */
export const MARKUP_THRESHOLDS = { steal: 2, fair: 3.5, pricey: 5 } as const

/** Retail estimates are in pounds, so only a list in pounds (or with no currency shown) can be compared. */
export function isPounds(currency: string | null | undefined) {
  return !currency || /^(£|gbp)$/i.test(currency.trim())
}

/** List price ÷ retail, rounded to one decimal; null when either is missing or nonsense. */
export function markup(listPrice: number | null | undefined, retail: number | null | undefined): number | null {
  if (!(typeof listPrice === 'number' && listPrice > 0 && typeof retail === 'number' && retail > 0)) return null
  return Math.round((listPrice / retail) * 10) / 10
}

export function verdictFor(m: number | null): PriceVerdict | null {
  if (m == null) return null
  if (m <= MARKUP_THRESHOLDS.steal) return 'steal'
  if (m <= MARKUP_THRESHOLDS.fair) return 'fair'
  if (m <= MARKUP_THRESHOLDS.pricey) return 'pricey'
  return 'ripoff'
}

export interface PriceCheck {
  verdict: PriceVerdict
  markup: number
  anchor: number // the retail-ish price the list price was compared with
  basis: 'paid' | 'retail' // paid = what the owner paid for the same wine; retail = estimated UK shop price
}

/** What the owner paid wins over an estimate: it's real. Averages several purchases. */
export function priceCheck(listPrice: number | null | undefined, retailEstimate: number | null | undefined, paid: number[] = []): PriceCheck | null {
  const real = paid.filter((p) => typeof p === 'number' && p > 0)
  const anchor = real.length ? Math.round(real.reduce((a, b) => a + b, 0) / real.length) : retailEstimate
  const m = markup(listPrice, anchor)
  const verdict = verdictFor(m)
  if (m == null || verdict == null || anchor == null) return null
  return { verdict, markup: m, anchor, basis: real.length ? 'paid' : 'retail' }
}

/** The lowest markup on the list — only when it is actually a steal or fair. */
export function bestValue<T extends { check: PriceCheck | null }>(items: T[]): T | null {
  const priced = items.filter((i) => i.check?.verdict === 'steal' || i.check?.verdict === 'fair')
  return priced.reduce<T | null>((best, i) => (!best || i.check!.markup < best.check!.markup ? i : best), null)
}

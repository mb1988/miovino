import type { Wine } from './types'

export type DrinkStatus = 'past' | 'soon' | 'ready' | 'approaching' | 'hold' | 'unknown'

export const STATUS_META: Record<DrinkStatus, { label: string; dot: string; chip: string; order: number }> = {
  past: { label: 'Past window', dot: 'bg-rose-500', chip: 'bg-rose-500/15 text-rose-300 ring-rose-500/30', order: 0 },
  soon: { label: 'Drink soon', dot: 'bg-amber-400', chip: 'bg-amber-400/15 text-amber-200 ring-amber-400/30', order: 1 },
  ready: { label: 'Ready', dot: 'bg-emerald-400', chip: 'bg-emerald-400/15 text-emerald-200 ring-emerald-400/30', order: 2 },
  approaching: { label: 'Approaching', dot: 'bg-yellow-300', chip: 'bg-yellow-300/15 text-yellow-100 ring-yellow-300/30', order: 3 },
  hold: { label: 'Hold', dot: 'bg-sky-400', chip: 'bg-sky-400/15 text-sky-200 ring-sky-400/30', order: 4 },
  unknown: { label: 'No window', dot: 'bg-stone-500', chip: 'bg-stone-500/15 text-stone-300 ring-stone-500/30', order: 5 },
}

export function currentYear() {
  return new Date().getFullYear()
}

/**
 * Status for the current year:
 *  past        year > drinkTo
 *  soon        in window and in its last year (or at/after the peak year)
 *  ready       in window
 *  approaching window opens next year
 *  hold        further away
 */
export function drinkStatus(w: Pick<Wine, 'drinkFrom' | 'drinkTo' | 'peakYear'>, year = currentYear()): DrinkStatus {
  const { drinkFrom, drinkTo } = w
  if (drinkFrom == null && drinkTo == null) return 'unknown'
  if (drinkTo != null && year > drinkTo) return 'past'
  if (drinkFrom != null && year < drinkFrom) return year === drinkFrom - 1 ? 'approaching' : 'hold'
  if (drinkTo != null && year >= drinkTo - 1) return 'soon'
  return 'ready'
}

/** 0..1 position of `year` in the [min,max] axis used by the window bar. */
export function windowAxis(w: Pick<Wine, 'vintage' | 'drinkFrom' | 'drinkTo'>, year = currentYear()) {
  const start = Math.min(w.vintage ?? w.drinkFrom ?? year, w.drinkFrom ?? year, year)
  const end = Math.max(w.drinkTo ?? year + 5, year + 1)
  const span = Math.max(end - start, 1)
  const pos = (y: number) => (y - start) / span
  return { start, end, pos }
}

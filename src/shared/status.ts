/** Drinking-window status. Kept free of dependencies: used by the app and by the Worker's monthly reminder. */
export type DrinkStatus = 'past' | 'soon' | 'ready' | 'approaching' | 'hold' | 'unknown'

export interface WindowFields {
  drinkFrom?: number
  drinkTo?: number
  peakYear?: number
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
export function drinkStatus(w: WindowFields, year = currentYear()): DrinkStatus {
  const { drinkFrom, drinkTo } = w
  if (drinkFrom == null && drinkTo == null) return 'unknown'
  if (drinkTo != null && year > drinkTo) return 'past'
  if (drinkFrom != null && year < drinkFrom) return year === drinkFrom - 1 ? 'approaching' : 'hold'
  if (drinkTo != null && year >= drinkTo - 1) return 'soon'
  return 'ready'
}

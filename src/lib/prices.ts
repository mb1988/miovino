import { getLang, t } from './i18n'
import type { PriceCheck } from '../shared/prices'

/** "2.5×" in English, "2,5×" in Italian. */
export const times = (x: number) => `${x.toLocaleString(getLang() === 'it' ? 'it-IT' : 'en-GB')}×`

/** "~£30 in shops · 2.2× · good value", or "You paid £38 · here 2.5×" when the wine is in the cellar. */
export function priceLine(check: PriceCheck | null, retailEstimate: number | null, valueNote: string | null) {
  const parts: string[] = []
  if (check?.basis === 'paid') parts.push(t('You paid £{paid}', { paid: check.anchor }), t('here {x}', { x: times(check.markup) }))
  else {
    if (retailEstimate != null) parts.push(t('~£{price} in shops', { price: Math.round(retailEstimate) }))
    if (check) parts.push(times(check.markup))
  }
  if (valueNote && check?.basis !== 'paid') parts.push(valueNote) // the AI's note is about shop prices; don't contradict what they paid
  return parts.join(' · ')
}

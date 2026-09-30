import type { Food } from './knowledge'
import { classicPairing, foodsFromText, pairingMentions, wineFoods } from './pairing'
import { currentYear, drinkStatus } from './status'
import type { WineType, WineWithBottles } from './types'

export interface SuggestOptions {
  type: WineType | 'any'
  food?: Food
  /** Free text, e.g. "lamb chops" or "risotto ai funghi" — mapped to food families. */
  dish?: string
  occasion: 'casual' | 'special' | 'any'
  maxPrice?: number
  readyOnly: boolean
}

export interface Suggestion {
  wine: WineWithBottles
  score: number
  reasons: string[]
}

export function bottlePrice(w: WineWithBottles): number | undefined {
  const prices = w.bottles.filter((b) => b.status === 'cellar' && b.purchasePrice != null).map((b) => b.purchasePrice!)
  return prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : undefined
}

/**
 * Rule-based "what should I drink?" — every point awarded comes with a human reason,
 * so suggestions are explainable. Urgency dominates, then food, occasion, and your history.
 */
export function suggest(cellar: WineWithBottles[], opts: SuggestOptions, year = currentYear()): Suggestion[] {
  const prices = cellar.map(bottlePrice).filter((p): p is number => p != null).sort((a, b) => a - b)
  const median = prices.length ? prices[Math.floor(prices.length / 2)] : 0

  const out: Suggestion[] = []
  for (const w of cellar) {
    if (w.inCellar === 0) continue
    if (opts.type !== 'any' && w.type !== opts.type) continue
    const price = bottlePrice(w)
    if (opts.maxPrice != null && price != null && price > opts.maxPrice) continue
    const status = drinkStatus(w, year)
    if (opts.readyOnly && !['ready', 'soon', 'past'].includes(status)) continue

    let score = 0
    const reasons: string[] = []
    switch (status) {
      case 'past':
        score += 40
        reasons.push(`Past its window (ended ${w.drinkTo}) — open it before it fades`)
        break
      case 'soon':
        score += 35
        reasons.push(`Drink soon — window closes ${w.drinkTo}`)
        break
      case 'ready':
        score += 25
        reasons.push(`In its drinking window (${w.drinkFrom ?? '…'}–${w.drinkTo ?? '…'})`)
        break
      case 'approaching':
        score += 5
        reasons.push(`Window opens ${w.drinkFrom} — a little early`)
        break
      case 'hold':
        score -= 30
        reasons.push(`Better to hold until ${w.drinkFrom}`)
        break
      case 'unknown':
        score += 8
        break
    }
    if (w.peakYear != null && Math.abs(w.peakYear - year) <= 1) {
      score += 10
      reasons.push(`Around its peak year (${w.peakYear})`)
    }

    const wanted = [...new Set([...(opts.food ? [opts.food] : []), ...(opts.dish ? foodsFromText(opts.dish) : [])])]
    if (wanted.length) {
      const guidePairing = w.external.map((e) => e.pairing ?? '').filter(Boolean).join('; ')
      const suits = wineFoods(w)
      const hits = wanted.filter((f) => suits.includes(f))
      if (hits.length) {
        score += 15
        const classic = classicPairing(w)
        reasons.push(classic ? `${classic.basis} is a classic match with ${hits.join(' / ').toLowerCase()}` : `Good match with ${hits.join(' / ').toLowerCase()}`)
      } else score -= 15
      if (guidePairing && wanted.some((f) => pairingMentions(guidePairing, f))) {
        score += 10
        reasons.push(`Guide pairing: ${guidePairing}`)
      }
    }

    if (opts.occasion === 'special') {
      if (price != null && price >= median) {
        score += 10
        reasons.push('A special bottle for a special night')
      }
      if (w.favourite) score += 5
    } else if (opts.occasion === 'casual') {
      if (price != null && price <= median) {
        score += 8
        reasons.push('Easy-going choice for a casual evening')
      } else if (price != null) score -= 8
    }

    if (w.avgRating != null) {
      score += (w.avgRating - 3) * 5
      if (w.avgRating >= 4) reasons.push(`You rated it ${w.avgRating.toFixed(1)}★ before`)
    }
    if (w.inCellar >= 2) {
      score += 4
      reasons.push(`You have ${w.inCellar} bottles`)
    }
    if (w.favourite) score += 3

    out.push({ wine: w, score, reasons })
  }
  return out.sort((a, b) => b.score - a.score)
}

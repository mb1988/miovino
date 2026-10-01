import { locale, t } from './i18n'
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
        reasons.push(t('Past its window (ended {year}) — open it before it fades', { year: w.drinkTo ?? '' }))
        break
      case 'soon':
        score += 35
        reasons.push(t('Drink soon — window closes {year}', { year: w.drinkTo ?? '' }))
        break
      case 'ready':
        score += 25
        reasons.push(t('In its drinking window ({from}–{to})', { from: w.drinkFrom ?? '…', to: w.drinkTo ?? '…' }))
        break
      case 'approaching':
        score += 5
        reasons.push(t('Window opens {year} — a little early', { year: w.drinkFrom ?? '' }))
        break
      case 'hold':
        score -= 30
        reasons.push(t('Better to hold until {year}', { year: w.drinkFrom ?? '' }))
        break
      case 'unknown':
        score += 8
        break
    }
    if (w.peakYear != null && Math.abs(w.peakYear - year) <= 1) {
      score += 10
      reasons.push(t('Around its peak year ({year})', { year: w.peakYear }))
    }

    const wanted = [...new Set([...(opts.food ? [opts.food] : []), ...(opts.dish ? foodsFromText(opts.dish) : [])])]
    if (wanted.length) {
      const guidePairing = w.external.map((e) => e.pairing ?? '').filter(Boolean).join('; ')
      const suits = wineFoods(w)
      const hits = wanted.filter((f) => suits.includes(f))
      if (hits.length) {
        score += 15
        const classic = classicPairing(w)
        const foods = hits.map((f) => t(f).toLowerCase()).join(' / ')
        reasons.push(classic ? t('{wine} is a classic match with {foods}', { wine: classic.basis, foods }) : t('Good match with {foods}', { foods }))
      } else score -= 15
      if (guidePairing && wanted.some((f) => pairingMentions(guidePairing, f))) {
        score += 10
        reasons.push(t('Guide pairing: {pairing}', { pairing: guidePairing }))
      }
    }

    if (opts.occasion === 'special') {
      if (price != null && price >= median) {
        score += 10
        reasons.push(t('A special bottle for a special night'))
      }
      if (w.favourite) score += 5
    } else if (opts.occasion === 'casual') {
      if (price != null && price <= median) {
        score += 8
        reasons.push(t('Easy-going choice for a casual evening'))
      } else if (price != null) score -= 8
    }

    if (w.avgRating != null) {
      score += (w.avgRating - 3) * 5
      if (w.avgRating >= 4) reasons.push(t('You rated it {rating}★ before', { rating: w.avgRating.toLocaleString(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }) }))
    }
    if (w.inCellar >= 2) {
      score += 4
      reasons.push(t('You have {n} bottles', { n: w.inCellar }))
    }
    if (w.favourite) score += 3

    out.push({ wine: w, score, reasons })
  }
  return out.sort((a, b) => b.score - a.score)
}

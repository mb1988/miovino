import { foodAffinity, normalizeText, type Food } from './knowledge'
import { currentYear, drinkStatus } from './status'
import type { WineType, WineWithBottles } from './types'

export interface SuggestOptions {
  type: WineType | 'any'
  food?: Food
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

    if (opts.food) {
      const guidePairing = w.external.map((e) => e.pairing ?? '').join(' ')
      const affinities = foodAffinity(w.type, w.grapes, w.region)
      if (affinities.includes(opts.food)) {
        score += 15
        reasons.push(`Classic match with ${opts.food.toLowerCase()}`)
      } else {
        score -= 15
      }
      if (guidePairing && pairingMentions(guidePairing, opts.food)) {
        score += 10
        reasons.push(`Guide suggests: ${guidePairing}`)
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

const FOOD_WORDS: Record<Food, string[]> = {
  'Red meat': ['manzo', 'filetto', 'tagliata', 'carne', 'beef', 'steak', 'stracotto', 'brasato', 'vitello', 'agnello', 'lamb', 'ossobuco', 'grigliata'],
  Game: ['capriolo', 'cinghiale', 'lepre', 'camoscio', 'cervo', 'selvaggina', 'piccione', 'pernice', 'fagiano', 'game', 'venison', 'anatra'],
  Poultry: ['pollo', 'chicken', 'tacchino', 'coq', 'faraona', 'piccione', 'pernice'],
  Pork: ['maiale', 'pork', 'stinco', 'salsiccia', 'porchetta', 'pancetta'],
  Fish: ['pesce', 'fish', 'branzino', 'orata', 'salmone', 'tonno'],
  Shellfish: ['crostacei', 'gamberi', 'ostriche', 'oysters', 'shellfish', 'scampi', 'aragosta'],
  'Pasta / risotto': ['risotto', 'pasta', 'tajarin', 'agnolotti', 'plin', 'ragu', 'lasagne'],
  Cheese: ['formaggio', 'cheese', 'taleggio', 'parmigiano', 'gorgonzola', 'pecorino'],
  Vegetarian: ['verdure', 'vegetable', 'funghi', 'mushroom', 'tartufo', 'truffle'],
  Dessert: ['dolce', 'dessert', 'torta', 'crostata', 'pasticceria'],
  Aperitif: ['aperitivo', 'aperitif', 'antipasto'],
}

function pairingMentions(text: string, food: Food) {
  const t = normalizeText(text)
  return FOOD_WORDS[food].some((w) => t.includes(w))
}

import { describe, expect, it } from 'vitest'
import { bestValue, isPounds, markup, MARKUP_THRESHOLDS, priceCheck, verdictFor } from './prices'
import { tidyWineList, WineListSchema } from './winelist'

describe('price verdicts', () => {
  it('works out the markup, ignoring missing or silly numbers', () => {
    expect(markup(95, 38)).toBe(2.5)
    expect(markup(100, 30)).toBe(3.3)
    expect(markup(null, 30)).toBeNull()
    expect(markup(60, 0)).toBeNull()
    expect(markup(-5, 10)).toBeNull()
  })

  it('maps markups to verdicts at the shared thresholds (boundaries go to the kinder verdict)', () => {
    expect(MARKUP_THRESHOLDS).toEqual({ steal: 2, fair: 3.5, pricey: 5 })
    expect(verdictFor(1.4)).toBe('steal')
    expect(verdictFor(2)).toBe('steal')
    expect(verdictFor(2.1)).toBe('fair')
    expect(verdictFor(3.5)).toBe('fair')
    expect(verdictFor(3.6)).toBe('pricey')
    expect(verdictFor(5)).toBe('pricey')
    expect(verdictFor(5.1)).toBe('ripoff')
    expect(verdictFor(null)).toBeNull()
  })

  it('anchors on what the owner paid when they have the wine, else on the retail estimate', () => {
    expect(priceCheck(95, 30, [38])).toEqual({ verdict: 'fair', markup: 2.5, anchor: 38, basis: 'paid' })
    expect(priceCheck(95, 30, [36, 40])).toMatchObject({ anchor: 38, basis: 'paid' })
    expect(priceCheck(95, 30)).toEqual({ verdict: 'fair', markup: 3.2, anchor: 30, basis: 'retail' })
    expect(priceCheck(95, null, [0])).toBeNull() // a zero "paid" is no anchor, and no estimate either
    expect(priceCheck(null, 30, [38])).toBeNull()
  })

  it('names the best value only when it is a steal or fair', () => {
    const item = (name: string, list: number, retail: number) => ({ name, check: priceCheck(list, retail) })
    expect(bestValue([item('a', 90, 30), item('b', 50, 30), item('c', 200, 30)])?.name).toBe('b')
    expect(bestValue([item('pricey', 120, 30), item('ripoff', 200, 30), { name: 'none', check: null }])).toBeNull()
  })

  it('compares only lists in pounds', () => {
    expect(isPounds('£')).toBe(true)
    expect(isPounds(' GBP ')).toBe(true)
    expect(isPounds(null)).toBe(true)
    expect(isPounds('€')).toBe(false)
  })
})

describe('tidyWineList', () => {
  const pick = { producer: 'Vietti', name: 'Barbera', vintage: 2021.0, price: 48, byTheGlass: false, fit: 'great' as const, why: 'x', inCellar: false }

  it('fills in fields an older or terser AI answer leaves out, then adds verdicts', () => {
    const raw = WineListSchema.parse({ isWineList: true, currency: '£', picks: [pick], note: null })
    expect(raw.deals).toEqual([])
    const r = tidyWineList(raw)
    expect(r.picks[0]).toMatchObject({ retailEstimate: null, valueNote: null, verdict: null, vintage: 2021 })
  })

  it('gives a verdict to every priced bottle, but not on a list in euros', () => {
    const raw = WineListSchema.parse({
      isWineList: true,
      currency: '£',
      picks: [{ ...pick, retailEstimate: 16 }],
      deals: [{ producer: 'Ridge', name: 'Geyserville', vintage: 2020.4, price: 72, retailEstimate: 45, valueNote: 'bargain' }],
      note: null,
    })
    const r = tidyWineList(raw)
    expect(r.picks[0].verdict).toBe('fair') // 48 / 16 = 3×
    expect(r.deals[0]).toMatchObject({ verdict: 'steal', vintage: 2020 })
    expect(tidyWineList({ ...raw, currency: '€' }).picks[0].verdict).toBeNull()
  })
})

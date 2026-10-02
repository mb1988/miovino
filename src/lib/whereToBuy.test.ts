import { describe, expect, it } from 'vitest'
import { pastSellers, typicalPrice } from './wishlist'
import type { Bottle, WineWithBottles } from './types'
import { buyLinks, FINE_WINE_FROM, tidyPriceHint, validatePriceHintRequest, wineSearcherUrl } from '../shared/whereToBuy'

describe('where to buy: search links', () => {
  it('opens Wine-Searcher UK for the wine and vintage', () => {
    expect(wineSearcherUrl({ producer: 'Gaja', name: 'Barbaresco', vintage: 2016 })).toBe('https://www.wine-searcher.com/find/gaja+barbaresco/2016/uk')
    expect(wineSearcherUrl({ producer: 'Château Musar', name: 'Rouge', vintage: null })).toBe('https://www.wine-searcher.com/find/ch%C3%A2teau+musar+rouge/uk')
  })

  it('lists Wine-Searcher first, then everyday merchants for a cheaper bottle and fine-wine ones for a pricier one', () => {
    const w = { producer: 'Muga', name: 'Rioja Reserva & Co', vintage: 2019 }
    const everyday = buyLinks(w, 20).map((l) => l.label)
    expect(everyday[0]).toBe('Wine-Searcher (UK)')
    expect(everyday.slice(1, 3)).toEqual(['The Wine Society', 'Majestic'])
    expect(buyLinks(w, FINE_WINE_FROM).slice(1, 4).map((l) => l.label)).toEqual(['Berry Bros. & Rudd', 'Lay & Wheeler', 'Hedonism'])
    expect(buyLinks(w).find((l) => l.label === 'The Wine Society')!.url).toBe('https://www.thewinesociety.com/search-results?q=Muga%20Rioja%20Reserva%20%26%20Co')
    expect(buyLinks(w).find((l) => l.label === 'Majestic')!.url).toContain('google.com/search?q=site%3Amajestic.co.uk%20Muga')
    expect(buyLinks({ producer: ' ', name: '' })).toEqual([])
  })
})

describe('where to buy: AI price hint', () => {
  it('checks the request', () => {
    expect(validatePriceHintRequest({ producer: 'Gaja', name: 'Barbaresco', vintage: 2016, lang: 'it' })).toEqual({ producer: 'Gaja', name: 'Barbaresco', vintage: 2016, lang: 'it' })
    expect(validatePriceHintRequest({ producer: '', name: '' })).toBeNull()
    expect(validatePriceHintRequest({ producer: 'Gaja', name: 'x', vintage: 16 })).toBeNull()
    expect(validatePriceHintRequest({ producer: 'Gaja', name: 'x'.repeat(201) })).toBeNull()
  })

  it('tidies the numbers: whole pounds, low before high, one-sided ranges filled in', () => {
    expect(tidyPriceHint({ low: 62.4, high: 45, where: ' Fine-wine merchants. ' })).toEqual({ low: 45, high: 62, where: 'Fine-wine merchants.' })
    expect(tidyPriceHint({ low: null, high: 30, where: 'x' })).toMatchObject({ low: 30, high: 30 })
    expect(tidyPriceHint({ low: 0, high: null, where: 'x' })).toMatchObject({ low: null, high: null })
  })
})

describe('where to buy: where you bought it before', () => {
  const bottle = (b: Partial<Bottle>): Bottle => ({ wineId: 'w1', status: 'cellar', createdAt: 0, ...b })
  const wine = (id: string, vintage: number, bottles: Bottle[]) => ({ id, producer: 'Gaja', name: 'Barbaresco', vintage, bottles }) as unknown as WineWithBottles
  const cellar = [
    wine('w1', 2016, [bottle({ seller: 'Lay & Wheeler', purchaseDate: '2022-03-01', purchasePrice: 150 }), bottle({ seller: 'lay & wheeler ', purchaseDate: '2024-05-10', purchasePrice: 170 })]),
    wine('w2', 2019, [bottle({ seller: 'Hedonism', purchaseDate: '2025-01-15', purchasePrice: 190 }), bottle({ seller: '' })]),
    { ...wine('w3', 2019, [bottle({ seller: 'Majestic', purchaseDate: '2025-06-01' })]), name: 'Barolo' },
  ]

  it('groups sellers across vintages of the same wine (ignoring case), newest first, with the last price paid', () => {
    expect(pastSellers(cellar, { producer: 'Gaja', name: 'Barbaresco' })).toEqual([
      { seller: 'Hedonism', bottles: 1, lastDate: '2025-01-15', lastPrice: 190 },
      { seller: 'Lay & Wheeler', bottles: 2, lastDate: '2024-05-10', lastPrice: 170 },
    ])
    expect(pastSellers(cellar, { producer: 'Vietti', name: 'Barolo' })).toEqual([])
    expect(pastSellers(cellar, { producer: 'Gaja ', name: 'Barolo', wineId: 'w3' }).map((s) => s.seller)).toEqual(['Majestic'])
  })

  it('picks a typical price from the AI hint, else the last price paid', () => {
    expect(typicalPrice({ priceHint: { low: 40, high: 60, where: '', at: '2026-10-01' } }, [])).toBe(50)
    expect(typicalPrice({}, pastSellers(cellar, { producer: 'Gaja', name: 'Barbaresco' }))).toBe(190)
    expect(typicalPrice({}, [])).toBeNull()
  })
})

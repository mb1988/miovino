import { describe, expect, it } from 'vitest'
import { wineKey } from './wineKey'

describe('wine key', () => {
  it('treats spelling variants of the same wine and vintage as one', () => {
    expect(wineKey({ producer: 'Château Léoville-Barton', name: 'Saint-Julien', vintage: 2016 })).toBe('chateau leoville barton|saint julien|2016')
    expect(wineKey({ producer: '  chateau leoville barton ', name: 'SAINT JULIEN', vintage: 2016 })).toBe(wineKey({ producer: 'Château Léoville-Barton', name: 'Saint-Julien', vintage: 2016 }))
  })
  it('keeps vintages apart, and NV as its own', () => {
    expect(wineKey({ producer: 'Bollinger', name: 'Special Cuvée', vintage: null })).toBe('bollinger|special cuvee|nv')
    expect(wineKey({ producer: 'Gaja', name: 'Barbaresco', vintage: 2016 })).not.toBe(wineKey({ producer: 'Gaja', name: 'Barbaresco', vintage: 2017 }))
  })
})

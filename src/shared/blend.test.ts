import { describe, expect, it } from 'vitest'
import { blendProblem, certainBlend, grapesDisplay, grapesText, parseGrapes, tidyBlends } from './blend'

describe('grape percentages', () => {
  it('reads percentages typed with the grapes, in the usual ways', () => {
    expect(parseGrapes('Merlot 60%, Cabernet Franc 40%')).toEqual({ grapes: ['Merlot', 'Cabernet Franc'], pct: { Merlot: 60, 'Cabernet Franc': 40 } })
    expect(parseGrapes('Syrah (95%); Viognier: 5 %')).toEqual({ grapes: ['Syrah', 'Viognier'], pct: { Syrah: 95, Viognier: 5 } })
    expect(parseGrapes(['Pinot Noir 90%', 'Chardonnay 10%']).pct).toEqual({ 'Pinot Noir': 90, Chardonnay: 10 })
    expect(parseGrapes('Sémillon 87,5%, Sauvignon Blanc').pct).toEqual({ Sémillon: 87.5 })
  })
  it('keeps grapes without a percentage, and never invents one', () => {
    expect(parseGrapes('Cabernet Sauvignon, Merlot')).toEqual({ grapes: ['Cabernet Sauvignon', 'Merlot'], pct: {} })
    expect(parseGrapes('Merlot 0%, Malbec 140%').pct).toEqual({})
  })
  it('round-trips for the form and shows the biggest share first', () => {
    const { grapes, pct } = parseGrapes('Cabernet Franc 40%, Merlot 60%')
    expect(grapesText(grapes, pct)).toBe('Cabernet Franc 40%, Merlot 60%')
    expect(grapesDisplay(grapes, pct)).toEqual(['Merlot 60%', 'Cabernet Franc 40%'])
    expect(grapesDisplay(['Nebbiolo', 'Vespolina'])).toEqual(['Nebbiolo', 'Vespolina'])
    expect(blendProblem({ a: 70, b: 40 })).toBe('over')
    expect(blendProblem({ a: 60 })).toBeNull()
  })
  it('fills 100% only where the appellation requires a single grape', () => {
    expect(certainBlend({ appellation: 'Barolo DOCG (Cannubi)', grapes: ['Nebbiolo'] })).toEqual({ Nebbiolo: 100 })
    expect(certainBlend({ appellation: 'Brunello di Montalcino Riserva DOCG', grapes: ['Sangiovese'] })).toEqual({ Sangiovese: 100 })
    expect(certainBlend({ appellation: 'Condrieu AOC', grapes: [] })).toEqual({ Viognier: 100 })
    expect(certainBlend({ appellation: 'Gattinara Riserva DOCG', grapes: ['Nebbiolo'] })).toBeNull() // ≥90% only
    expect(certainBlend({ appellation: 'Côte-Rôtie AOC', grapes: ['Syrah'] })).toBeNull() // up to 20% Viognier allowed
    expect(certainBlend({ appellation: 'Barolo DOCG', grapes: ['Nebbiolo', 'Barbera'] })).toBeNull() // never overrides what's recorded
  })
  it('accepts only confident, sourced AI answers that add up to 100', () => {
    const asked = [{ id: 'a', producer: 'P', name: 'N', vintage: 2016 }, { id: 'b', producer: 'P', name: 'M', vintage: 2016 }, { id: 'c', producer: 'P', name: 'O', vintage: 2016 }]
    const r = {
      blends: [
        { id: 'a', parts: [{ grape: 'Cabernet Sauvignon', pct: 74 }, { grape: 'Merlot', pct: 26 }], confidence: 'high' as const, source: 'Château tech sheet 2016' },
        { id: 'b', parts: [{ grape: 'Merlot', pct: 60 }, { grape: 'Cabernet Franc', pct: 30 }], confidence: 'high' as const, source: 'sheet' }, // adds to 90
        { id: 'c', parts: [{ grape: 'Merlot', pct: 100 }], confidence: 'medium' as const, source: 'guess' },
        { id: 'zzz', parts: [{ grape: 'Merlot', pct: 100 }], confidence: 'high' as const, source: 'x' },
      ],
    }
    expect(tidyBlends(asked, r)).toEqual([{ id: 'a', pct: { 'Cabernet Sauvignon': 74, Merlot: 26 }, source: 'Château tech sheet 2016' }])
  })
})

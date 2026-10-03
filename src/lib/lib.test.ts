import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { guessMapping, normalizeRow, parseType, parseVintage, parseWindow, readSpreadsheet, tidyName } from './importer'
import { enrich } from './knowledge'
import { suggest } from './recommend'
import { drinkStatus } from './status'
import type { WineWithBottles } from './types'

describe('parsers', () => {
  it('parses drinking windows with any dash', () => {
    expect(parseWindow('2025 - 2040')).toEqual({ from: 2025, to: 2040 })
    expect(parseWindow('2025–2027')).toEqual({ from: 2025, to: 2027 })
    expect(parseWindow('2030-2040')).toEqual({ from: 2030, to: 2040 })
    expect(parseWindow(null)).toEqual({})
    expect(parseWindow('N/A')).toEqual({})
  })
  it('parses NV and numeric vintages', () => {
    expect(parseVintage('NV')).toEqual({ value: null, nv: true })
    expect(parseVintage(2019)).toEqual({ value: 2019, nv: false })
  })
  it('maps Italian types', () => {
    expect(parseType('Rosso')).toBe('red')
    expect(parseType('Bianco')).toBe('white')
    expect(parseType('Spumante')).toBe('sparkling')
    expect(parseType('Dessert')).toBe('dessert')
  })
  it('tidies casing', () => {
    expect(tidyName('Poderi Aldo conterno')).toBe('Poderi Aldo Conterno')
    expect(tidyName('Casa E. di Mirafiore')).toBe('Casa E. di Mirafiore')
  })
  it('enriches from appellation keywords', () => {
    expect(enrich('Vietti', 'Barolo Castiglione')?.grapes).toEqual(['Nebbiolo'])
    expect(enrich('Antinori', 'Tignanello')?.region).toBe('Tuscany')
    expect(enrich('Chateau haut-bergeron', 'Sautern')?.appellation).toBe('Sauternes')
    expect(enrich('Château Léoville Barton', '2ème Cru Classé, Saint-Julien')?.appellation).toBe('Saint-Julien')
  })
})

describe('drink status', () => {
  it('computes statuses for 2026', () => {
    expect(drinkStatus({ drinkFrom: 2030, drinkTo: 2040 }, 2026)).toBe('hold')
    expect(drinkStatus({ drinkFrom: 2027, drinkTo: 2040 }, 2026)).toBe('approaching')
    expect(drinkStatus({ drinkFrom: 2020, drinkTo: 2035 }, 2026)).toBe('ready')
    expect(drinkStatus({ drinkFrom: 2020, drinkTo: 2027 }, 2026)).toBe('soon')
    expect(drinkStatus({ drinkFrom: 2020, drinkTo: 2025 }, 2026)).toBe('past')
    expect(drinkStatus({}, 2026)).toBe('unknown')
  })
})

async function load(rel: string) {
  const buf = readFileSync(new URL(rel, import.meta.url))
  const { headers, rows } = await readSpreadsheet(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer)
  const mapping = guessMapping(headers)
  return { mapping, parsed: rows.map((r, i) => normalizeRow(r, mapping, i + 2, 'Vitae (AIS)')) }
}

describe('spreadsheet import (fixture: made-up rows with the tricky cases)', async () => {
  const { mapping, parsed } = await load('../../test/fixtures/sample.xlsx')

  it('auto-maps every column', () => {
    expect(mapping).toMatchObject({
      Produttore: 'producer',
      Vino: 'name',
      Anno: 'vintage',
      Tipo: 'type',
      'Prezzo 2025': 'price',
      Qty: 'quantity',
      'Best to Drink': 'window',
      'Anno Top': 'peakYear',
      'Vitae guida anno': 'guideYear',
      'Vita viti': 'guideAward',
      'Vitae Score': 'guideScore',
      'Vitae abbinamento': 'guidePairing',
      'Vitae Descrizione': 'guideDescription',
    })
  })

  it('normalises tricky rows', () => {
    const champagne = parsed.find((p) => p.wine.producer === 'Georges Vesselle')!
    expect(champagne.wine.vintage).toBeNull()
    expect(champagne.wine.type).toBe('sparkling')
    const rostaing = parsed.find((p) => p.wine.producer.startsWith('Domaine Rostaing'))!
    expect(rostaing.wine.name).toBe('Cote-rotie Ampodium')
    expect(rostaing.wine.vintage).toBe(2019)
    expect(rostaing.wine.appellation).toBe('Côte-Rôtie')
    const manzone = parsed.find((p) => p.wine.producer === 'Manzone')!
    expect(manzone.quantity).toBe(2)
    expect(manzone.wine.drinkFrom).toBe(2030)
    expect(manzone.wine.external[0]).toMatchObject({ source: 'Vitae (AIS)', score: 95.5, award: '4 viti', guideYear: 2024 })
    expect(manzone.bottle.purchasePrice).toBe(70)
    const boschis = parsed.find((p) => p.wine.producer === 'Chiara Boschis')!
    expect(boschis.wine.needsReview).toContain('No drinking window')
  })
})

// The full personal spreadsheet is not in git; this runs only on a machine that has it.
describe.runIf(existsSync(new URL('../../Wine.xlsx', import.meta.url)))('Wine.xlsx (local only)', () => {
  it('reads all wines and bottles, every row gets a country', async () => {
    const { parsed } = await load('../../Wine.xlsx')
    const rows = parsed.filter((p) => !p.skip)
    expect(rows.length).toBeGreaterThanOrEqual(48)
    expect(rows.every((p) => p.wine.country)).toBe(true)
  })
})

describe('recommender', () => {
  const mk = (id: string, over: Partial<WineWithBottles>): WineWithBottles => ({
    id,
    producer: 'P' + id,
    name: 'W' + id,
    vintage: 2016,
    type: 'red',
    grapes: ['Nebbiolo'],
    bottleSize: 750,
    external: [],
    favourite: false,
    tags: [],
    createdAt: 0,
    bottles: [{ wineId: id, status: 'cellar', createdAt: 0, purchasePrice: 50 }],
    inCellar: 1,
    tastings: [],
    ...over,
  })
  it('puts urgent wines first and skips hold when readyOnly', () => {
    const cellar = [mk('w1', { drinkFrom: 2030, drinkTo: 2040 }), mk('w2', { drinkFrom: 2020, drinkTo: 2027 }), mk('w3', { drinkFrom: 2020, drinkTo: 2035 })]
    const all = suggest(cellar, { type: 'any', occasion: 'any', readyOnly: false }, 2026)
    expect(all[0].wine.id).toBe('w2')
    expect(all.at(-1)!.wine.id).toBe('w1')
    const ready = suggest(cellar, { type: 'any', occasion: 'any', readyOnly: true }, 2026)
    expect(ready.map((s) => s.wine.id)).not.toContain('w1')
  })
})

describe('food pairing', async () => {
  const { classicPairing, foodsFromText, wineFoods } = await import('./pairing')
  it('maps free text in English and Italian to food families', () => {
    expect(foodsFromText('lamb chops')).toContain('Red meat')
    expect(foodsFromText('Lepre in salmì')).toContain('Game')
    expect(foodsFromText('risotto ai funghi')).toEqual(expect.arrayContaining(['Pasta / risotto', 'Vegetarian']))
  })
  it('gives classic pairings by appellation', () => {
    expect(classicPairing({ producer: 'Vietti', name: 'Barolo Castiglione', grapes: ['Nebbiolo'] })?.basis).toBe('Barolo & Barbaresco')
    expect(classicPairing({ producer: 'Haut-Bergeron', name: 'Sauternes', grapes: [] })?.dishes).toContain('Foie gras')
  })
  it('combines guide pairing with style', () => {
    const foods = wineFoods({ producer: 'X', name: 'Brunello', grapes: ['Sangiovese'], type: 'red', region: 'Tuscany', external: [{ source: 'Vitae', pairing: 'Lepre in salmì' }] })
    expect(foods).toEqual(expect.arrayContaining(['Game', 'Red meat']))
  })
})

describe('critic columns', () => {
  it('imports critic window as external info and flags disagreement', () => {
    const mapping = guessMapping(['Produttore', 'Vino', 'Anno', 'Best to Drink', 'Critic window', 'Critic source', 'Review', 'Source link'])
    expect(mapping['Critic window']).toBe('criticWindow')
    expect(mapping['Review']).toBe('reviewNote')
    const p = normalizeRow(
      { Produttore: 'Domaine Rostaing', Vino: 'Côte-Rôtie Ampodium', Anno: 2019, 'Best to Drink': '2030–2038', 'Critic window': '2024–2032', 'Critic source': 'Wine Advocate', Review: 'Critics: earlier AND ends earlier', 'Source link': 'https://example.com' },
      mapping,
      2,
    )
    expect(p.wine.external).toContainEqual(expect.objectContaining({ source: 'Critics', window: '2024–2032', url: 'https://example.com' }))
    expect(p.wine.needsReview?.join()).toMatch(/Check window/)
    expect(p.wine.drinkFrom).toBe(2030) // spreadsheet stays the source of truth
  })
})

describe('cellar timeline', async () => {
  const { cellarTimeline } = await import('./timeline')
  it('adds up spend and bottles in/out per year, with continuous years', () => {
    const at = (d: string) => new Date(d).getTime()
    const cellar = [
      {
        bottles: [
          { status: 'cellar', purchaseDate: '2023-05-01', purchasePrice: 40, createdAt: at('2023-05-01') },
          { status: 'drunk', purchaseDate: '2023-05-01', purchasePrice: 40, consumedAt: '2025-12-24', createdAt: at('2023-05-01') },
          { status: 'cellar', createdAt: at('2025-02-01') }, // no date/price: counted in the year it was added
        ],
      },
    ] as unknown as WineWithBottles[]
    const t = cellarTimeline(cellar)
    expect(t.years).toEqual([
      { year: 2023, spent: 80, bottlesIn: 2, bottlesOut: 0 },
      { year: 2024, spent: 0, bottlesIn: 0, bottlesOut: 0 },
      { year: 2025, spent: 0, bottlesIn: 1, bottlesOut: 1 },
    ])
    expect(t.valueAtCost).toBe(40)
    expect(t.unpriced).toBe(1)
  })
})

describe('suggestion reasons follow the language', async () => {
  const { setLang } = await import('./i18n')
  it('explains picks in Italian', () => {
    const w = {
      id: 'w', producer: 'Gaja', name: 'Barbaresco', vintage: 2016, type: 'red', grapes: ['Nebbiolo'], appellation: 'Barbaresco', external: [], tags: [], favourite: false,
      bottleSize: 750, createdAt: 0, drinkFrom: 2020, drinkTo: 2027, inCellar: 2, tastings: [], avgRating: 4.5,
      bottles: [{ status: 'cellar' }, { status: 'cellar' }],
    } as unknown as WineWithBottles
    try {
      setLang('it')
      const [s] = suggest([w], { type: 'any', occasion: 'any', readyOnly: true, dish: 'brasato' }, 2026)
      expect(s.reasons).toEqual([
        'Da bere presto — la finestra si chiude nel 2027',
        'Barolo & Barbaresco: abbinamento classico con carne rossa',
        'Gli hai già dato 4,5★',
        'Ne hai 2 bottiglie',
      ])
      setLang('en')
      expect(suggest([w], { type: 'any', occasion: 'any', readyOnly: true, dish: 'brasato' }, 2026)[0].reasons[1]).toBe('Barolo & Barbaresco is a classic match with red meat')
    } finally {
      setLang('en')
    }
  })
})

describe('price paid vs. today', async () => {
  const { cellarValueNow, priceChange, signedPct } = await import('./value')
  const b = (status: string, purchasePrice?: number) => ({ status, purchasePrice })
  it('compares the average paid for cellar bottles with the current price', () => {
    const w = { marketPrice: 90, bottles: [b('cellar', 50), b('cellar', 70), b('drunk', 10)] } as unknown as WineWithBottles
    expect(priceChange(w)).toEqual({ paid: 60, now: 90, diff: 30, pct: 50 })
    expect(priceChange({ ...w, marketPrice: undefined })).toBeUndefined()
    expect(priceChange({ ...w, bottles: [b('cellar')] } as unknown as WineWithBottles)).toBeUndefined()
  })
  it('values the cellar at current prices where known, at cost otherwise', () => {
    const cellar = [
      { marketPrice: 90, bottles: [b('cellar', 50), b('cellar', 70), b('drunk', 10)] },
      { bottles: [b('cellar', 30), b('cellar')] },
      { marketPrice: 20, bottles: [b('cellar')] }, // no purchase price: counts now, not in cost
    ] as unknown as WineWithBottles[]
    expect(cellarValueNow(cellar)).toEqual({ atCost: 150, now: 230, gain: 80, repriced: 3, estimated: 0 })
  })
  it('uses the AI’s remembered price when you haven’t set one, but never over yours', () => {
    const cellar = [
      { id: 'mine', marketPrice: 90, bottles: [b('cellar', 50)] },
      { id: 'ai', bottles: [b('cellar', 30), b('cellar', 30)] },
      { id: 'none', bottles: [b('cellar', 10)] },
    ] as unknown as WineWithBottles[]
    const estimates = new Map([
      ['mine', 999], // ignored: your own price wins
      ['ai', 45],
    ])
    expect(cellarValueNow(cellar, estimates)).toEqual({ atCost: 120, now: 90 + 45 * 2 + 10, gain: 70, repriced: 3, estimated: 2 })
  })
  it('formats signed percentages', () => {
    expect([signedPct(12.4), signedPct(-4.6), signedPct(0.2)]).toEqual(['+12%', '−5%', '±0%'])
  })
})

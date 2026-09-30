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

describe('spreadsheet import (fixture: real rows with the tricky cases)', async () => {
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
describe.runIf(existsSync(new URL('../../Wine.xlsx', import.meta.url)))('Wine.xlsx (local only)', async () => {
  const { parsed } = await load('../../Wine.xlsx')
  it('reads all wines and bottles, every row gets a country', () => {
    const rows = parsed.filter((p) => !p.skip)
    expect(rows.length).toBeGreaterThanOrEqual(48)
    expect(rows.every((p) => p.wine.country)).toBe(true)
  })
})

describe('recommender', () => {
  const mk = (id: number, over: Partial<WineWithBottles>): WineWithBottles => ({
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
    updatedAt: 0,
    bottles: [{ wineId: id, status: 'cellar', createdAt: 0, purchasePrice: 50 }],
    inCellar: 1,
    tastings: [],
    ...over,
  })
  it('puts urgent wines first and skips hold when readyOnly', () => {
    const cellar = [mk(1, { drinkFrom: 2030, drinkTo: 2040 }), mk(2, { drinkFrom: 2020, drinkTo: 2027 }), mk(3, { drinkFrom: 2020, drinkTo: 2035 })]
    const all = suggest(cellar, { type: 'any', occasion: 'any', readyOnly: false }, 2026)
    expect(all[0].wine.id).toBe(2)
    expect(all.at(-1)!.wine.id).toBe(1)
    const ready = suggest(cellar, { type: 'any', occasion: 'any', readyOnly: true }, 2026)
    expect(ready.map((s) => s.wine.id)).not.toContain(1)
  })
})

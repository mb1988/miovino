import { enrich, normalizeText } from './knowledge'
import type { ExternalInfo, Wine, WineType } from './types'

/** App fields a spreadsheet column can map to. */
export const IMPORT_FIELDS = {
  producer: 'Producer',
  name: 'Wine name',
  vintage: 'Vintage',
  type: 'Type / colour',
  price: 'Purchase price',
  quantity: 'Quantity',
  window: 'Drinking window (e.g. 2025-2032)',
  drinkFrom: 'Drink from',
  drinkTo: 'Drink until',
  peakYear: 'Peak year',
  country: 'Country',
  region: 'Region',
  appellation: 'Appellation',
  grapes: 'Grape(s)',
  location: 'Location',
  alcohol: 'Alcohol %',
  bottleSize: 'Bottle size',
  seller: 'Seller',
  purchaseDate: 'Purchase date',
  notes: 'Personal notes',
  rating: 'My rating',
  guideYear: 'Guide: edition year',
  guideAward: 'Guide: award (viti/bicchieri…)',
  guideScore: 'Guide: score',
  guidePairing: 'Guide: food pairing',
  guideDescription: 'Guide: description',
} as const
export type ImportField = keyof typeof IMPORT_FIELDS

const SYNONYMS: Record<ImportField, string[]> = {
  producer: ['produttore', 'producer', 'winery', 'cantina', 'domaine', 'chateau', 'maker'],
  name: ['vino', 'wine', 'wine name', 'name', 'nome', 'etichetta', 'label', 'cuvee'],
  vintage: ['anno', 'vintage', 'annata', 'year', 'millesimo'],
  type: ['tipo', 'type', 'colour', 'color', 'colore', 'style', 'categoria'],
  price: ['prezzo', 'price', 'cost', 'costo', 'purchase price', 'prezzo 2025'],
  quantity: ['qty', 'quantity', 'quantita', 'bottles', 'bottiglie', 'n', 'count', 'qta'],
  window: ['best to drink', 'drinking window', 'window', 'finestra', 'da bere', 'drink window'],
  drinkFrom: ['drink from', 'begin', 'from', 'dal'],
  drinkTo: ['drink until', 'drink to', 'end', 'until', 'al', 'entro'],
  peakYear: ['anno top', 'peak', 'peak year', 'apice', 'top year'],
  country: ['country', 'paese', 'nazione', 'stato'],
  region: ['region', 'regione', 'zona'],
  appellation: ['appellation', 'denominazione', 'doc', 'docg', 'aoc'],
  grapes: ['grape', 'grapes', 'vitigno', 'vitigni', 'uva', 'varietal', 'variety'],
  location: ['location', 'posizione', 'rack', 'scaffale', 'bin', 'cantinetta', 'where'],
  alcohol: ['alcohol', 'abv', 'alcol', 'gradazione', 'alc'],
  bottleSize: ['size', 'bottle size', 'formato', 'ml'],
  seller: ['seller', 'store', 'shop', 'enoteca', 'venditore', 'bought at', 'negozio'],
  purchaseDate: ['purchase date', 'bought', 'data acquisto', 'acquisto', 'date'],
  notes: ['notes', 'note', 'my notes', 'commenti', 'comment'],
  rating: ['rating', 'my rating', 'voto', 'stars', 'stelle'],
  guideYear: ['vitae guida anno', 'guida anno', 'guide year', 'edizione'],
  guideAward: ['vita viti', 'viti', 'bicchieri', 'award', 'riconoscimento'],
  guideScore: ['vitae score', 'score', 'punteggio', 'points', 'punti'],
  guidePairing: ['vitae abbinamento', 'abbinamento', 'pairing', 'food pairing'],
  guideDescription: ['vitae descrizione', 'descrizione', 'description', 'tasting note', 'scheda'],
}

const clean = (s: string) => normalizeText(s).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

/** Guesses a mapping header → field. Exact synonym match beats partial match; each field used once. */
export function guessMapping(headers: string[]): Record<string, ImportField | ''> {
  const mapping: Record<string, ImportField | ''> = {}
  const used = new Set<ImportField>()
  const tryPass = (match: (h: string, syn: string) => boolean) => {
    for (const h of headers) {
      if (mapping[h]) continue
      const ch = clean(h)
      for (const [field, syns] of Object.entries(SYNONYMS) as [ImportField, string[]][]) {
        if (used.has(field)) continue
        if (syns.some((s) => match(ch, clean(s)))) {
          mapping[h] = field
          used.add(field)
          break
        }
      }
    }
  }
  tryPass((h, s) => h === s)
  tryPass((h, s) => s.length > 3 && (h.startsWith(s + ' ') || h.endsWith(' ' + s)))
  for (const h of headers) if (!(h in mapping)) mapping[h] = ''
  return mapping
}

// ---------- value parsers ----------

const isBlank = (v: unknown) => v == null || (typeof v === 'string' && /^\s*(n\/?a|-|—|\?)?\s*$/i.test(v))

/** Parses "2021", "2021?", 2021.0 → 2021. Returns undefined for blank / N/A. `uncertain` when a "?" was present. */
export function parseYear(v: unknown): { value?: number; uncertain: boolean } {
  if (isBlank(v)) return { uncertain: false }
  const s = String(v)
  const m = s.match(/(19|20)\d{2}/)
  return { value: m ? Number(m[0]) : undefined, uncertain: s.includes('?') }
}

export function parseNumber(v: unknown): { value?: number; uncertain: boolean } {
  if (isBlank(v)) return { uncertain: false }
  if (typeof v === 'number') return { value: v, uncertain: false }
  const s = String(v)
  const m = s.replace(',', '.').match(/-?\d+(\.\d+)?/)
  return { value: m ? Number(m[0]) : undefined, uncertain: s.includes('?') }
}

/** Parses drinking windows written with any dash / "to" / "a": "2025 - 2040", "2025–2027", "2030-2040", "from 2030". */
export function parseWindow(v: unknown): { from?: number; to?: number } {
  if (isBlank(v)) return {}
  const years = String(v).match(/(19|20)\d{2}/g)?.map(Number) ?? []
  if (years.length >= 2) return { from: Math.min(years[0], years[1]), to: Math.max(years[0], years[1]) }
  if (years.length === 1) return /until|to|entro|fino|by/i.test(String(v)) ? { to: years[0] } : { from: years[0] }
  return {}
}

export function parseVintage(v: unknown): { value: number | null; nv: boolean } {
  if (typeof v === 'string' && /^\s*(nv|n\.v\.|sa|s\.a\.|non vintage|sans ann[eé]e)\s*$/i.test(v)) return { value: null, nv: true }
  return { value: parseYear(v).value ?? null, nv: false }
}

const TYPE_WORDS: [WineType, string[]][] = [
  ['sparkling', ['spumante', 'sparkling', 'champagne', 'bollicine', 'metodo classico', 'cremant', 'cava', 'prosecco', 'franciacorta', 'mousseux']],
  ['rose', ['rose', 'rosato', 'rosado', 'cerasuolo']],
  ['dessert', ['dessert', 'dolce', 'passito', 'sweet', 'sauternes', 'moelleux', 'liquoroso']],
  ['fortified', ['fortified', 'porto', 'port', 'sherry', 'marsala', 'madeira', 'fortificato']],
  ['orange', ['orange', 'macerato', 'arancione', 'ramato']],
  ['white', ['bianco', 'white', 'blanc', 'blanco', 'weiss']],
  ['red', ['rosso', 'red', 'rouge', 'tinto', 'rot']],
]

export function parseType(v: unknown, fallbackText = ''): WineType | undefined {
  const s = clean(String(v ?? ''))
  for (const [t, words] of TYPE_WORDS) if (words.some((w) => s === w || s.split(' ').includes(w))) return t
  const f = clean(fallbackText)
  for (const [t, words] of TYPE_WORDS) if (words.some((w) => f.includes(w))) return t
  return undefined
}

/** "Poderi Aldo conterno" → "Poderi Aldo Conterno"; keeps particles lowercase and existing inner capitals. */
export function tidyName(s: string): string {
  const small = new Set(['di', 'de', 'del', 'della', 'dei', 'des', 'du', 'e', 'et', 'la', 'le', 'les', 'da', "d'", 'y', 'von', 'van'])
  return s
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((w, i) => {
      if (!w) return w
      const lw = w.toLowerCase()
      if (i > 0 && small.has(lw)) return lw
      if (w === w.toLowerCase()) return w.charAt(0).toUpperCase() + w.slice(1)
      return w
    })
    .join(' ')
}

// ---------- row normalisation ----------

export interface ImportedRow {
  rowNumber: number
  wine: Omit<Wine, 'id' | 'createdAt' | 'updatedAt'>
  quantity: number
  bottle: { purchasePrice?: number; location?: string; seller?: string; purchaseDate?: string }
  rating?: number
  warnings: string[]
  skip: boolean
}

export function normalizeRow(
  raw: Record<string, unknown>,
  mapping: Record<string, ImportField | ''>,
  rowNumber: number,
  guideName = 'Guide',
): ImportedRow {
  const get = (f: ImportField): unknown => {
    const header = Object.keys(mapping).find((h) => mapping[h] === f)
    return header ? raw[header] : undefined
  }
  const str = (f: ImportField) => (isBlank(get(f)) ? undefined : String(get(f)).trim())
  const warnings: string[] = []

  const producer = tidyName(str('producer') ?? '')
  let name = str('name') ?? ''
  const vintageParsed = parseVintage(get('vintage'))
  let vintage = vintageParsed.value
  // Vintage embedded in the name ("Ampodium2019", "Riserva 2019") — use it when missing and strip it if it duplicates.
  const inName = name.match(/(?:^|[^\d])((?:19|20)\d{2})(?:[^\d]|$)/) ?? name.match(/((?:19|20)\d{2})$/)
  if (inName) {
    const y = Number(inName[1])
    if (vintage == null && !vintageParsed.nv) vintage = y
    if (vintage === y) name = name.replace(inName[1], '').replace(/\s{2,}/g, ' ').trim()
  }
  name = name.replace(/\s+/g, ' ').trim()

  const enrichment = enrich(producer, name)
  let type = parseType(get('type'), `${producer} ${name}`)
  if (!type) {
    type = 'red'
    warnings.push('Type not recognised — assumed red')
  }

  const win = parseWindow(get('window'))
  const drinkFrom = parseYear(get('drinkFrom')).value ?? win.from
  const drinkTo = parseYear(get('drinkTo')).value ?? win.to
  const peak = parseYear(get('peakYear'))

  const qty = parseNumber(get('quantity')).value
  const quantity = qty == null ? 1 : Math.max(0, Math.round(qty))

  const external: ExternalInfo[] = []
  const gYear = parseYear(get('guideYear'))
  const gAward = parseNumber(get('guideAward'))
  const gScore = parseNumber(get('guideScore'))
  const pairing = str('guidePairing')
  const description = str('guideDescription')
  if (gYear.value || gAward.value || gScore.value || pairing || description) {
    const uncertain = gYear.uncertain || gAward.uncertain || gScore.uncertain
    external.push({
      source: guideName,
      guideYear: gYear.value,
      award: gAward.value != null ? `${gAward.value}${uncertain && gAward.uncertain ? '?' : ''} viti` : undefined,
      score: gScore.value,
      pairing,
      description,
    })
    if (uncertain) warnings.push('Some guide values were marked with "?" (uncertain)')
  }

  const grapesRaw = str('grapes')
  const grapes = grapesRaw ? grapesRaw.split(/[,/;&+]| e | and /).map((g) => tidyName(g)).filter(Boolean) : enrichment?.grapes ?? []

  if (!producer) warnings.push('Missing producer')
  if (!name) warnings.push('Missing wine name')
  if (vintage == null && !vintageParsed.nv) warnings.push('Missing vintage')
  if (drinkFrom == null && drinkTo == null) warnings.push('No drinking window')
  if (!enrichment && !str('country')) warnings.push('Country/region unknown')

  const sizeRaw = parseNumber(get('bottleSize')).value
  const bottleSize = sizeRaw == null ? 750 : sizeRaw < 10 ? Math.round(sizeRaw * 1000) : sizeRaw < 100 ? Math.round(sizeRaw * 10) : sizeRaw

  const rating = parseNumber(get('rating')).value
  const review = warnings.filter((w) => !w.startsWith('Some guide'))

  return {
    rowNumber,
    wine: {
      producer,
      name,
      vintage,
      type,
      country: str('country') ?? enrichment?.country,
      region: str('region') ?? enrichment?.region,
      appellation: str('appellation') ?? enrichment?.appellation,
      grapes,
      alcohol: parseNumber(get('alcohol')).value,
      bottleSize,
      drinkFrom,
      drinkTo,
      peakYear: peak.value,
      external,
      favourite: false,
      personalNotes: str('notes'),
      tags: [],
      needsReview: review.length ? review : undefined,
    },
    quantity,
    bottle: {
      purchasePrice: parseNumber(get('price')).value,
      location: str('location'),
      seller: str('seller'),
      purchaseDate: str('purchaseDate'),
    },
    rating: rating != null && rating > 0 ? Math.min(5, rating > 5 ? rating / 20 : rating) : undefined,
    warnings,
    skip: !producer && !name,
  }
}

/** Reads the first sheet of an XLSX/CSV file into header list + row objects. */
export async function readSpreadsheet(file: File | ArrayBuffer): Promise<{ headers: string[]; rows: Record<string, unknown>[] }> {
  const XLSX = await import('xlsx')
  const data = file instanceof ArrayBuffer ? file : await file.arrayBuffer()
  const wb = XLSX.read(data, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null, raw: true })
  const headerRow = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 })[0] ?? []
  const headers = headerRow.map((h) => String(h ?? '')).filter(Boolean)
  return { headers, rows }
}

/** Finds an existing wine that is the same label (producer + name + vintage). */
export function sameWineKey(w: { producer: string; name: string; vintage: number | null }) {
  return `${clean(w.producer)}|${clean(w.name)}|${w.vintage ?? 'nv'}`
}

/**
 * Grape percentages ("blend"). Shared by the app and the Worker; no dependencies but zod.
 * A missing percentage is fine — it is never guessed. Percentages come from: the owner, the label,
 * appellation rules that require a single grape, or a producer-published blend the owner accepted.
 */
import { z } from 'zod'

export type GrapePct = Record<string, number>

const PCT = /^(.*?)\s*[:(]?\s*(\d{1,3}(?:[.,]\d)?)\s*%\s*\)?$/

/**
 * "Merlot 60%, Cabernet Franc 40%" → grapes + percentages. Grapes without a % are kept with none.
 * Also accepts "Merlot (60%)", "Merlot: 60 %", decimals "12,5%". Percentages outside 1–100 are dropped.
 */
export function parseGrapes(text: string | string[]): { grapes: string[]; pct: GrapePct } {
  // A comma followed by a digit is a decimal ("87,5%"), not a separator.
  const parts = (Array.isArray(text) ? text : text.split(/,(?!\d)|[;\n]/)).map((s) => s.trim()).filter(Boolean)
  const grapes: string[] = []
  const pct: GrapePct = {}
  for (const p of parts) {
    const m = PCT.exec(p)
    const name = (m ? m[1] : p).trim()
    if (!name) continue
    grapes.push(name)
    if (m) {
      const n = Number(m[2].replace(',', '.'))
      if (n > 0 && n <= 100) pct[name] = n
    }
  }
  return { grapes, pct }
}

/** For the edit field: "Merlot 60%, Cabernet Franc 40%" (grapes without a % appear bare). */
export function grapesText(grapes: string[], pct?: GrapePct) {
  return grapes.map((g) => (pct?.[g] != null ? `${g} ${pct[g]}%` : g)).join(', ')
}

/** For display: biggest share first when percentages are known, otherwise as listed. */
export function grapesDisplay(grapes: string[], pct?: GrapePct) {
  const known = grapes.some((g) => pct?.[g] != null)
  const ordered = known ? [...grapes].sort((a, b) => (pct?.[b] ?? -1) - (pct?.[a] ?? -1)) : grapes
  return ordered.map((g) => (pct?.[g] != null ? `${g} ${pct[g]}%` : g))
}

/** Problems with a blend the owner typed, or none. */
export function blendProblem(pct: GrapePct): 'over' | null {
  const sum = Object.values(pct).reduce((a, b) => a + b, 0)
  return sum > 100.5 ? 'over' : null
}

/**
 * Appellations whose rules require a single grape (so 100% is a fact, not a guess).
 * Deliberately short: anything that allows even a small share of other grapes is left out
 * (e.g. Gattinara ≥90% Nebbiolo, Côte-Rôtie up to 20% Viognier, Chianti Classico ≥80% Sangiovese).
 */
const SINGLE_GRAPE: [RegExp, string][] = [
  [/\bbarolo\b/i, 'Nebbiolo'],
  [/\bbarbaresco\b/i, 'Nebbiolo'],
  [/\bbrunello di montalcino\b/i, 'Sangiovese'],
  [/\brosso di montalcino\b/i, 'Sangiovese'],
  [/\bcondrieu\b/i, 'Viognier'],
  [/\bch[aâ]teau[- ]grillet\b/i, 'Viognier'],
  [/\bbonnezeaux\b/i, 'Chenin Blanc'],
  [/\bquarts de chaume\b/i, 'Chenin Blanc'],
  [/\bchablis\b/i, 'Chardonnay'],
]

/** 100% of the one grape the appellation allows, when the wine's appellation requires it and its grapes agree. */
export function certainBlend(w: { appellation?: string | null; grapes: string[] }): GrapePct | null {
  const rule = SINGLE_GRAPE.find(([re]) => re.test(w.appellation ?? ''))
  if (!rule) return null
  const [, grape] = rule
  const listed = w.grapes.map((g) => g.trim().toLowerCase())
  // Only when what's recorded is that grape alone (or nothing yet): never override what the owner wrote.
  if (listed.length > 1 || (listed.length === 1 && listed[0] !== grape.toLowerCase())) return null
  return { [grape]: 100 }
}

// ——— AI: only a blend the producer has published ———

export const BlendsSchema = z.object({
  blends: z.array(
    z.object({
      id: z.string().describe('The id of the wine, exactly as given'),
      parts: z.array(z.object({ grape: z.string(), pct: z.number() })).describe('The published blend; EMPTY if you do not know the producer\'s published figures for this vintage'),
      confidence: z.enum(['high', 'medium', 'low']),
      source: z.string().describe('Where the figures are published, e.g. "producer technical sheet 2016"; empty if unknown'),
    }),
  ),
})
export type BlendSuggestion = { id: string; pct: GrapePct; source: string }

export interface BlendWine {
  id: string
  producer: string
  name: string
  vintage: number | null
  appellation?: string
  grapes?: string[]
}

export const MAX_BLEND_WINES = 20

export function validateBlendsRequest(body: unknown): BlendWine[] | null {
  const wines = (body as { wines?: unknown })?.wines
  if (!Array.isArray(wines) || !wines.length || wines.length > MAX_BLEND_WINES) return null
  const text = (s: unknown, max = 200) => typeof s === 'string' && s.length <= max
  for (const w of wines as BlendWine[]) {
    if (!w || !text(w.id, 64) || !w.id || !text(w.producer) || !text(w.name)) return null
    if (w.vintage != null && !(Number.isInteger(w.vintage) && w.vintage > 1800 && w.vintage < 2200)) return null
    if (w.grapes != null && !(Array.isArray(w.grapes) && w.grapes.length <= 10 && w.grapes.every((g) => text(g, 60)))) return null
  }
  return wines as BlendWine[]
}

export function blendsPrompt(wines: BlendWine[]) {
  return [
    'For each wine below, give the grape percentages ONLY if the producer has published them for this exact vintage (technical sheet, website, label). Do not estimate, do not give typical or regulatory ranges, do not round a guess.',
    'If you are not sure of the published figures, return an empty parts list and low confidence. An empty answer is better than a wrong one.',
    'Return exactly one entry per wine, with the same id, and say where the figures are published.',
    '',
    ...wines.map((w) => [`id=${w.id}`, `${w.producer} — ${w.name}`, w.vintage ?? 'NV', w.appellation ?? '', w.grapes?.length ? `grapes: ${w.grapes.join('/')}` : ''].filter(Boolean).join(' | ')),
  ].join('\n')
}

/** Keeps only confident, complete answers (percentages adding up to 100) for wines we asked about. */
export function tidyBlends(asked: BlendWine[], r: z.infer<typeof BlendsSchema>): BlendSuggestion[] {
  const ids = new Set(asked.map((w) => w.id))
  const out: BlendSuggestion[] = []
  for (const b of r.blends) {
    if (!ids.has(b.id) || b.confidence !== 'high' || !b.parts.length || !b.source.trim()) continue
    const pct: GrapePct = {}
    for (const p of b.parts) if (p.grape.trim() && p.pct > 0 && p.pct <= 100) pct[p.grape.trim()] = Math.round(p.pct * 10) / 10
    const sum = Object.values(pct).reduce((a, n) => a + n, 0)
    if (Math.abs(sum - 100) <= 1) out.push({ id: b.id, pct, source: b.source.trim().slice(0, 160) })
  }
  return out
}

/** Drinking-window suggestions for wines that have none: shared by the Worker (/api/windows) and the app. */
import { z } from 'zod'

export const WindowsSchema = z.object({
  windows: z.array(
    z.object({
      id: z.string().describe('The id of the wine, exactly as given'),
      drinkFrom: z.number().nullable().describe('First year it is good to drink; null if you cannot judge this wine'),
      drinkTo: z.number().nullable().describe('Last year it will still be good'),
      peakYear: z.number().nullable().describe('Year it should be at its best, if meaningful'),
      confidence: z.enum(['high', 'medium', 'low']),
      note: z.string().describe('One short sentence explaining the window (style, structure, vintage)'),
    }),
  ),
})
export type WindowsResult = z.infer<typeof WindowsSchema>
export type WindowSuggestion = WindowsResult['windows'][number]

export interface WindowWine {
  id: string
  producer: string
  name: string
  vintage: number | null
  type: string
  appellation?: string
  region?: string
  country?: string
  grapes?: string[]
}

export const MAX_WINDOW_WINES = 40

export function validateWindowsRequest(body: unknown): { wines: WindowWine[]; lang: 'en' | 'it' } | null {
  const b = body as { wines?: unknown; lang?: unknown }
  if (!b || !Array.isArray(b.wines) || !b.wines.length || b.wines.length > MAX_WINDOW_WINES) return null
  const str = (v: unknown, max = 120) => typeof v === 'string' && v.length <= max
  for (const w of b.wines as WindowWine[]) {
    if (!w || !str(w.id, 64) || !w.id || !str(w.producer) || !str(w.name) || !str(w.type, 20)) return null
    if (w.vintage != null && !(Number.isInteger(w.vintage) && w.vintage > 1800 && w.vintage < 2200)) return null
    if (w.grapes != null && !(Array.isArray(w.grapes) && w.grapes.length <= 10 && w.grapes.every((g) => str(g, 60)))) return null
    for (const k of ['appellation', 'region', 'country'] as const) if (w[k] != null && !str(w[k])) return null
  }
  return { wines: b.wines as WindowWine[], lang: b.lang === 'it' ? 'it' : 'en' }
}

export function windowsPrompt(wines: WindowWine[], lang: 'en' | 'it', year = new Date().getFullYear()) {
  const lines = wines.map((w) =>
    [`id=${w.id}`, `${w.producer} — ${w.name}`, w.vintage ?? 'NV', w.type, [w.appellation, w.region, w.country].filter(Boolean).join(', '), w.grapes?.length ? w.grapes.join('/') : ''].filter(Boolean).join(' | '),
  )
  return [
    `For each wine below, give a realistic drinking window as a sommelier would, for this producer, appellation and vintage. Current year: ${year}.`,
    'Use your knowledge of the producer\'s style and the vintage. For non-vintage wines give a window counted from now. If you genuinely cannot place a wine, return nulls and say why in the note.',
    'Return exactly one entry per wine, with the same id.',
    lang === 'it' ? 'Write each note in Italian.' : 'Write each note in British English.',
    '',
    ...lines,
  ].join('\n')
}

/** Keeps only answers for wines we asked about, with whole years in a sane order. */
export function tidyWindows(asked: WindowWine[], r: WindowsResult): WindowSuggestion[] {
  const ids = new Set(asked.map((w) => w.id))
  const year = (n: number | null) => (n == null ? null : Math.round(n))
  return r.windows
    .filter((w) => ids.has(w.id))
    .map((w) => {
      let from = year(w.drinkFrom)
      let to = year(w.drinkTo)
      if (from != null && to != null && from > to) [from, to] = [to, from]
      const peak = year(w.peakYear)
      return { ...w, drinkFrom: from, drinkTo: to, peakYear: peak != null && from != null && to != null && (peak < from || peak > to) ? null : peak }
    })
}

/** Label scanning: the schema and prompt the Worker (/api/scan) sends to the AI, shared with the app for the result type. */
import { z } from 'zod'

import { WINE_TYPES } from './wine'

export const LabelSchema = z.object({
  isWineLabel: z.boolean().describe('false if the photo does not show a wine label'),
  producer: z.string().describe('Winery / domaine / château / producer as printed'),
  name: z.string().describe('Wine or cuvée name, including vineyard/cru and Riserva if present — not the producer'),
  vintage: z.number().nullable().describe('Vintage year; null if non-vintage or not visible'),
  type: z.enum(WINE_TYPES),
  country: z.string().nullable(),
  region: z.string().nullable().describe('Wine region in English, e.g. Piedmont, Bordeaux, Tuscany'),
  appellation: z.string().nullable().describe('Appellation / DOC / DOCG / AOC as printed'),
  grapes: z.array(z.string()).describe('Grape varieties: from the label, or the typical blend for the appellation'),
  alcohol: z.number().nullable().describe('ABV %'),
  bottleSizeMl: z.number().nullable(),
  drinkFrom: z.number().nullable().describe('Suggested first year to drink — your best estimate for this wine and vintage'),
  drinkTo: z.number().nullable().describe('Suggested last year to drink — your best estimate'),
  tastingNote: z.string().nullable().describe('One or two sentences of typical style / tasting profile for this wine (general knowledge, not personal)'),
  pairing: z.string().nullable().describe('Short food pairing suggestion'),
  confidence: z.enum(['high', 'medium', 'low']),
})
export type LabelResult = z.infer<typeof LabelSchema>

export function labelPrompt(year = new Date().getFullYear()) {
  return `You are helping a wine collector add a bottle to their personal cellar app.
Read the wine label in the photo and extract the fields. Use what is printed on the label first; fill the remaining
fields (region, grapes, drinking window, style) from your wine knowledge for this producer, appellation and vintage.
Drinking window: give a realistic range for this specific wine and vintage, as a sommelier would. Current year: ${year}.
If the text is ambiguous, pick the most likely reading and lower the confidence.`
}

/** Rounds year-like numbers the model may return as floats. */
export function tidyLabel(r: LabelResult): LabelResult {
  const year = (n: number | null) => (n == null ? null : Math.round(n))
  return { ...r, vintage: year(r.vintage), drinkFrom: year(r.drinkFrom), drinkTo: year(r.drinkTo), bottleSizeMl: year(r.bottleSizeMl) }
}

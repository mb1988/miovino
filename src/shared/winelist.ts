/** Restaurant wine-list scanner: shared by the Worker (/api/winelist) and the app. */
import { z } from 'zod'

export const WineListSchema = z.object({
  isWineList: z.boolean().describe('false if the photos do not show a wine list or menu with wines'),
  currency: z.string().nullable().describe('Currency symbol or code used on the list, e.g. £ or €'),
  picks: z
    .array(
      z.object({
        producer: z.string().describe('Producer as printed on the list (empty string if not shown)'),
        name: z.string().describe('Wine name as printed, including appellation / cru'),
        vintage: z.number().nullable(),
        price: z.number().nullable().describe('Bottle price as a number; null if only by the glass or not shown'),
        byTheGlass: z.boolean(),
        fit: z.enum(['great', 'good', 'safe']).describe('great = right in their taste; good = likely to please; safe = reliable fallback'),
        why: z.string().describe('One or two sentences: why this suits THIS owner (their ratings, styles, regions) and the food'),
        inCellar: z.boolean().describe('true if the same wine (any vintage) is already in their cellar'),
      }),
    )
    .describe('Up to 5 picks from the list, best first'),
  note: z.string().nullable().describe('One short tip, e.g. a value pick, or what to avoid on this list'),
})
export type WineListResult = z.infer<typeof WineListSchema>
export type WineListPick = WineListResult['picks'][number]

export const MAX_LIST_PAGES = 3
export const MAX_IMAGE_CHARS = 6_000_000 // base64 of a ~1568px JPEG is well under this

export interface WineListRequest {
  images: string[] // base64 JPEG, no data: prefix
  food?: string
  budget?: number
  lang?: 'en' | 'it'
}

export function validateWineListRequest(body: unknown): WineListRequest | null {
  const b = body as WineListRequest
  if (!b || !Array.isArray(b.images) || !b.images.length || b.images.length > MAX_LIST_PAGES) return null
  if (!b.images.every((i) => typeof i === 'string' && i.length > 100 && i.length < MAX_IMAGE_CHARS)) return null
  if (b.food != null && (typeof b.food !== 'string' || b.food.length > 200)) return null
  if (b.budget != null && !(typeof b.budget === 'number' && b.budget > 0 && b.budget < 100_000)) return null
  return { images: b.images, food: b.food?.trim() || undefined, budget: b.budget, lang: b.lang === 'it' ? 'it' : 'en' }
}

export function wineListPrompt(r: Pick<WineListRequest, 'food' | 'budget' | 'lang'>) {
  return [
    'These photos are pages of a restaurant wine list. The owner of the cellar described in the system prompt is choosing a bottle.',
    'Read every wine on the list, then pick up to 5 that best match THEIR taste — use their ratings, the wines they would buy again, and the styles, grapes and regions they own and love. Prefer wines that are drinking well now for their vintage.',
    r.food ? `They are eating: ${r.food}. Make the pairing count.` : 'They have not said what they are eating; favour versatile food wines.',
    r.budget ? `Budget: up to ${r.budget} per bottle on the list's prices. Stay within it unless one pick just above is clearly worth it — say so.` : '',
    'Only pick wines that are actually on the list, written as printed. Mark inCellar when the same wine is already in their cellar.',
    r.lang === 'it' ? 'Write "why" and "note" in Italian.' : 'Write "why" and "note" in British English.',
  ]
    .filter(Boolean)
    .join('\n')
}

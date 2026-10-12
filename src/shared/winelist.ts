/** Restaurant wine-list scanner: shared by the Worker (/api/winelist) and the app. */
import { z } from 'zod'
import { isPounds, MARKUP_THRESHOLDS, markup, verdictFor, type PriceVerdict } from './prices'

const retailEstimate = z.number().nullable().default(null).describe('Your estimate of the typical UK retail (shop) price of ONE bottle of this wine and vintage, in pounds; null if you cannot tell')
const valueNote = z.string().nullable().default(null).describe('A few words on the price, e.g. "about 2× shop price — good value" or "5× retail, skip"')

export const WineListSchema = z.object({
  isWineList: z.boolean().describe('false if the photos or text do not show a wine list or menu with wines'),
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
        retailEstimate,
        valueNote,
      }),
    )
    .describe('Up to 5 picks from the list, best first'),
  deals: z
    .array(
      z.object({
        producer: z.string(),
        name: z.string(),
        vintage: z.number().nullable(),
        price: z.number().describe('Bottle price on the list'),
        retailEstimate,
        valueNote,
      }),
    )
    .default([])
    .describe('Up to 3 other bottles on the list (not in picks) worth flagging for their price: the best bargains, or a notorious rip-off'),
  note: z.string().nullable().describe('One short tip, e.g. a value pick, or what to avoid on this list'),
})
type Raw = z.infer<typeof WineListSchema>
/** The verdict is worked out from the numbers (not left to the AI), so the thresholds stay in one place. */
type WithVerdict<T> = T & { verdict: PriceVerdict | null }
export type WineListResult = Omit<Raw, 'picks' | 'deals'> & { picks: WithVerdict<Raw['picks'][number]>[]; deals: WithVerdict<Raw['deals'][number]>[] }
export type WineListPick = WineListResult['picks'][number]
export type WineListDeal = WineListResult['deals'][number]

/** Tidies the AI's answer: whole vintages, at most 5 picks and 3 deals, and a verdict on every priced bottle (lists in pounds only). */
export function tidyWineList(r: Raw): WineListResult {
  const tidy = <T extends { vintage: number | null; price: number | null; retailEstimate: number | null }>(x: T) => ({
    ...x,
    vintage: x.vintage == null ? null : Math.round(x.vintage),
    verdict: isPounds(r.currency) ? verdictFor(markup(x.price, x.retailEstimate)) : null,
  })
  return { ...r, picks: r.picks.slice(0, 5).map(tidy), deals: r.deals.slice(0, 3).map(tidy) }
}

export const MAX_LIST_PAGES = 3
export const MAX_IMAGE_CHARS = 6_000_000 // base64 of a ~1568px JPEG is well under this
/** Text of a PDF or web page; a long restaurant list is ~20–40k characters. */
export const MAX_LIST_TEXT = 100_000
export const MIN_LIST_TEXT = 80

/** Photos of the pages, or the list's text (read from a PDF or a website) — one or the other. */
export interface WineListRequest {
  images?: string[] // base64 JPEG, no data: prefix
  text?: string
  food?: string
  budget?: number
  lang?: 'en' | 'it'
}

export function validateWineListRequest(body: unknown): WineListRequest | null {
  const b = body as WineListRequest
  if (!b) return null
  const hasImages = Array.isArray(b.images) && b.images.length > 0
  const hasText = typeof b.text === 'string' && b.text.trim().length > 0
  if (hasImages === hasText) return null
  if (hasImages && (b.images!.length > MAX_LIST_PAGES || !b.images!.every((i) => typeof i === 'string' && i.length > 100 && i.length < MAX_IMAGE_CHARS))) return null
  if (hasText && (b.text!.trim().length < MIN_LIST_TEXT || b.text!.length > MAX_LIST_TEXT)) return null
  if (b.food != null && (typeof b.food !== 'string' || b.food.length > 200)) return null
  if (b.budget != null && !(typeof b.budget === 'number' && b.budget > 0 && b.budget < 100_000)) return null
  const source = hasImages ? { images: b.images } : { text: b.text!.trim() }
  return { ...source, food: b.food?.trim() || undefined, budget: b.budget, lang: b.lang === 'it' ? 'it' : 'en' }
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', pound: '£', euro: '€', eacute: 'é', egrave: 'è', agrave: 'à', ograve: 'ò', ugrave: 'ù', igrave: 'ì', ocirc: 'ô', acirc: 'â', ecirc: 'ê', ccedil: 'ç', uuml: 'ü', ouml: 'ö', auml: 'ä', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', hellip: '…' }

/** A web page's readable text: scripts, styles and tags dropped, block elements on their own lines. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg|template|head)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/tr|\/h[1-6]|\/section|\/article|\/table)\b[^>]*>/gi, '\n')
    .replace(/<\/t[dh]>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_, n: string) => String.fromCodePoint(n[0].toLowerCase() === 'x' ? parseInt(n.slice(1), 16) : Number(n)))
    .replace(/&([a-z]+);/gi, (m, n: string) => ENTITIES[n.toLowerCase()] ?? m)
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
}

export function wineListPrompt(r: Pick<WineListRequest, 'food' | 'budget' | 'lang'>, from: 'photos' | 'text' = 'photos') {
  return [
    from === 'photos'
      ? 'These photos are pages of a restaurant wine list. The owner of the cellar described in the system prompt is choosing a bottle.'
      : 'Below is the text of a restaurant wine list, taken from its PDF or website (layout may be rough; columns can run together). The owner of the cellar described in the system prompt is choosing a bottle.',
    'Read every wine on the list, then pick up to 5 that best match THEIR taste — use their ratings, the wines they would buy again, and the styles, grapes and regions they own and love. Prefer wines that are drinking well now for their vintage.',
    r.food ? `They are eating: ${r.food}. Make the pairing count.` : 'They have not said what they are eating; favour versatile food wines.',
    r.budget ? `Budget: up to ${r.budget} per bottle on the list's prices. Stay within it unless one pick just above is clearly worth it — say so.` : '',
    'Only pick wines that are actually on the list, written as printed. Mark inCellar when the same wine is already in their cellar.',
    `For every pick, estimate the typical UK retail price of one bottle (retailEstimate, in pounds) so the owner can judge the markup. UK restaurants usually charge 2.5–3.5× retail: up to ${MARKUP_THRESHOLDS.steal}× is a steal, above ${MARKUP_THRESHOLDS.pricey}× a rip-off. If the list is not in pounds, still give retail in pounds and say so in valueNote. In deals, flag up to 3 other bottles worth knowing about for their price.`,
    r.lang === 'it' ? 'Write "why", "valueNote" and "note" in Italian.' : 'Write "why", "valueNote" and "note" in British English.',
  ]
    .filter(Boolean)
    .join('\n')
}

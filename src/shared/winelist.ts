/** Restaurant wine-list scanner: shared by the Worker (/api/winelist) and the app. */
import { z } from 'zod'
import { isPounds, MARKUP_THRESHOLDS, markup, verdictFor, type PriceVerdict } from './prices'

export const STYLES = ['red', 'white', 'sparkling', 'rose', 'sweet'] as const
export type WineStyle = (typeof STYLES)[number]
const STYLE_HINT = 'One of: red, white, sparkling, rose, sweet (sweet = dessert and fortified wines such as Sauternes or Port)'
export const PER_STYLE = 5
export const MAX_DEALS = 5

/** The AI's style word, made one of STYLES (anything unknown counts as red, the most common). */
export function styleOf(s: string | null | undefined): WineStyle {
  const v = (s ?? '').toLowerCase()
  if (/spark|champ|fizz|spuman|franciac|cava|cr[eé]mant|prosecco/.test(v)) return 'sparkling'
  if (/ros[eéa]|rosato|blush/.test(v)) return 'rose'
  if (/sweet|dessert|fortif|port|sherry|madeira|passito|sauternes/.test(v)) return 'sweet'
  if (/white|bianco|blanc/.test(v)) return 'white'
  return 'red'
}

/** At most `n` per style, keeping the order (best first). */
function perStyle<T extends { style: string }>(items: T[], n = PER_STYLE): T[] {
  const count = new Map<string, number>()
  return items.filter((x) => {
    const k = styleOf(x.style)
    count.set(k, (count.get(k) ?? 0) + 1)
    return count.get(k)! <= n
  })
}

const retailEstimate = z.number().nullable().default(null).describe('Your estimate of the typical UK retail (shop) price of ONE bottle of this wine and vintage, in pounds; null if you cannot tell')
const valueNote = z.string().nullable().default(null).describe('A few words on the price, e.g. "about 2× shop price — good value" or "5× retail, skip"')

export const WineListSchema = z.object({
  isWineList: z.boolean().describe('false if the photos or text do not show a wine list or menu with wines'),
  currency: z.string().nullable().describe('Currency symbol or code used on the list, e.g. £ or €'),
  picks: z
    .array(
      z.object({
        style: z.string().default('red').describe(STYLE_HINT),
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
    .describe('Up to 5 picks for EACH style the list has (red, white, sparkling, rose, sweet), best first within each style'),
  deals: z
    .array(
      z.object({
        style: z.string().default('red').describe(STYLE_HINT),
        producer: z.string(),
        name: z.string(),
        vintage: z.number().nullable(),
        price: z.number().describe('Bottle price on the list'),
        retailEstimate,
        valueNote,
      }),
    )
    .default([])
    .describe('Up to 5 other bottles on the list (not in picks), any style, worth flagging for their price: the best bargains, or a notorious rip-off'),
  note: z.string().nullable().describe('One short tip, e.g. a value pick, or what to avoid on this list'),
})
type Raw = z.infer<typeof WineListSchema>
/** The verdict is worked out from the numbers (not left to the AI), so the thresholds stay in one place. */
type WithVerdict<T> = T & { verdict: PriceVerdict | null }
export type WineListResult = Omit<Raw, 'picks' | 'deals'> & { picks: WithVerdict<Raw['picks'][number]>[]; deals: WithVerdict<Raw['deals'][number]>[] }
export type WineListPick = WineListResult['picks'][number]
export type WineListDeal = WineListResult['deals'][number]

/** Tidies the AI's answer: whole vintages, a known style, at most 5 picks per style and 5 deals, and a verdict on every priced bottle (lists in pounds only). */
export function tidyWineList(r: Raw): WineListResult {
  const tidy = <T extends { vintage: number | null; price: number | null; retailEstimate: number | null }>(x: T) => ({
    ...x,
    vintage: x.vintage == null ? null : Math.round(x.vintage),
    style: styleOf((x as { style?: string }).style),
    verdict: isPounds(r.currency) ? verdictFor(markup(x.price, x.retailEstimate)) : null,
  })
  return { ...r, picks: perStyle(r.picks.map(tidy)), deals: r.deals.slice(0, MAX_DEALS).map(tidy) }
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
  /** Something different: wines outside their usual regions and grapes, explained from their taste. */
  explore?: boolean
  /** One part of a longer list: fewer picks per style, so the answer comes back quicker (the parts are merged). */
  part?: boolean
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
  return { ...source, food: b.food?.trim() || undefined, budget: b.budget, lang: b.lang === 'it' ? 'it' : 'en', explore: b.explore === true, part: b.part === true }
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

export function wineListPrompt(r: Pick<WineListRequest, 'food' | 'budget' | 'lang' | 'explore' | 'part'>, from: 'photos' | 'text' = 'photos') {
  return [
    from === 'photos'
      ? 'These photos are pages of a restaurant wine list. The owner of the cellar described in the system prompt is choosing a bottle.'
      : 'Below is the text of a restaurant wine list, taken from its PDF or website (layout may be rough; columns can run together). The owner of the cellar described in the system prompt is choosing a bottle.',
    `Read every wine on the list and sort them by style: red, white, sparkling, rose, sweet (dessert and fortified). For EACH style the list has, pick up to ${r.part ? 3 : PER_STYLE}, best first. Skip a style the list does not have.`,
    r.explore
      ? 'They want something DIFFERENT from their usual: pick wines from regions, grapes and styles that are rare or missing in their cellar (e.g. Pinot Noir or Burgundy for someone whose cellar is mostly Piedmont), but that they are likely to enjoy given what they rate highly. In "why", make the bridge from their taste (e.g. "you love Nebbiolo\'s perfume and acidity, so try this Pinot Noir"). Use fit "good" or "safe" unless it is an outstanding match.'
      : 'Pick what best matches THEIR taste — use their ratings, the wines they would buy again, and the styles, grapes and regions they own and love. Within a style they rarely drink, still pick what suits that taste best.',
    'Prefer wines that are drinking well now for their vintage.',
    r.food ? `They are eating: ${r.food}. Make the pairing count.` : 'They have not said what they are eating; favour versatile food wines.',
    r.budget ? `Budget: up to ${r.budget} per bottle on the list's prices. Stay within it unless one pick just above is clearly worth it — say so.` : '',
    'Only pick wines that are actually on the list, written as printed. Their cellar (in the system prompt) is only there to show their taste: never pick a wine because it is in the cellar if it is not also on this list. Mark inCellar when a wine on the list is also in their cellar.',
    `For every pick, estimate the typical UK retail price of one bottle (retailEstimate, in pounds) so the owner can judge the markup. UK restaurants usually charge 2.5–3.5× retail: up to ${MARKUP_THRESHOLDS.steal}× is a steal, above ${MARKUP_THRESHOLDS.pricey}× a rip-off. If the list is not in pounds, still give retail in pounds and say so in valueNote. In deals, flag up to 5 other bottles worth knowing about for their price.`,
    r.lang === 'it' ? 'Write "why", "valueNote" and "note" in Italian.' : 'Write "why", "valueNote" and "note" in British English.',
  ]
    .filter(Boolean)
    .join('\n')
}

/**
 * A long list (PDF or website) is read in parts of about this size. Big parts on purpose: the free AI tier allows
 * plenty of text but only a few requests a minute, so an 18-page list is one or two requests.
 */
export const PART_CHARS = 50_000

/** Splits list text into parts of at most `max` characters, at line breaks where possible. */
export function splitListText(text: string, max = PART_CHARS): string[] {
  const parts: string[] = []
  let cur = ''
  for (const line of text.split('\n')) {
    for (let i = 0; i < Math.max(line.length, 1); i += max) {
      const piece = line.slice(i, i + max)
      if (cur && cur.length + 1 + piece.length > max) {
        parts.push(cur)
        cur = ''
      }
      cur = cur ? `${cur}\n${piece}` : piece
    }
  }
  if (cur.trim()) parts.push(cur)
  return parts
}

const FIT_ORDER = { great: 0, good: 1, safe: 2 } as const
const sameWine = (a: { producer: string; name: string; vintage: number | null }, b: typeof a) =>
  a.producer.toLowerCase() === b.producer.toLowerCase() && a.name.toLowerCase() === b.name.toLowerCase() && a.vintage === b.vintage

/** One answer from the answers for each part: the best 5 picks overall (by fit, then the order found), 3 deals, no repeats. */
export function mergeWineLists(results: WineListResult[]): WineListResult {
  const picks: WineListPick[] = []
  for (const p of results.flatMap((r) => r.picks).sort((a, b) => FIT_ORDER[a.fit] - FIT_ORDER[b.fit])) if (!picks.some((q) => sameWine(p, q))) picks.push(p)
  const deals: WineListDeal[] = []
  for (const d of results.flatMap((r) => r.deals)) if (!picks.some((q) => sameWine(d, q)) && !deals.some((q) => sameWine(d, q))) deals.push(d)
  return {
    isWineList: results.some((r) => r.isWineList),
    currency: results.find((r) => r.currency)?.currency ?? null,
    picks: perStyle(picks),
    deals: deals.slice(0, MAX_DEALS),
    note: results.find((r) => r.note)?.note ?? null,
  }
}

const words = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3)

// Words that say nothing about which producer it is.
const GENERIC = new Set(['the', 'and', 'del', 'della', 'dei', 'des', 'les', 'von', 'castello', 'chateau', 'domaine', 'tenuta', 'cantina', 'cantine', 'azienda', 'agricola', 'bodegas', 'bodega', 'weingut', 'fattoria', 'podere', 'estate', 'vineyards', 'winery', 'maison', 'clos'])

/**
 * Is this wine really on the list text? A word of its producer must appear (if it has one), and at least
 * half the words of its name (lenient: PDF text runs columns together and splits words). Catches a pick
 * the AI took from the owner's cellar, which it is shown for their taste, or simply made up.
 */
export function onList(w: { producer: string; name: string }, listText: string): boolean {
  const have = new Set(words(listText))
  const producer = words(w.producer).filter((x) => !GENERIC.has(x))
  if (producer.length && !producer.some((x) => have.has(x))) return false
  const name = [...new Set(words(w.name))]
  if (!name.length) return producer.length > 0
  return name.filter((x) => have.has(x)).length * 2 >= name.length
}

/** Keeps only the picks and deals found in the list text (for lists read as text: PDF or website). */
export function onlyOnList(r: WineListResult, listText: string): WineListResult {
  return { ...r, picks: r.picks.filter((p) => onList(p, listText)), deals: r.deals.filter((d) => onList(d, listText)) }
}

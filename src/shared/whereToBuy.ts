/** Wishlist "where to buy": search links that open live prices, and the optional AI price hint. Shared by the Worker and the app. */
import { z } from 'zod'

export interface WineRef {
  producer: string
  name: string
  vintage?: number | null
}

export interface BuyLink {
  label: string
  url: string
}

const words = (w: WineRef) => [w.producer, w.name].map((s) => s.trim()).filter(Boolean).join(' ')

/** Wine-Searcher's UK prices for this wine (and vintage, when known). */
export function wineSearcherUrl(w: WineRef) {
  const q = encodeURIComponent(words(w).toLowerCase()).replace(/%20/g, '+')
  return `https://www.wine-searcher.com/find/${q}${w.vintage ? `/${w.vintage}` : ''}/uk`
}

interface Merchant {
  label: string
  fine: boolean // strong on fine and older wine
  search: (q: string) => string
}

// Search pages checked by hand. Majestic and Lay & Wheeler block automated checks, so they go through a site search instead.
const site = (domain: string) => (q: string) => `https://www.google.com/search?q=${encodeURIComponent(`site:${domain} ${q}`)}`
export const MERCHANTS: Merchant[] = [
  { label: 'The Wine Society', fine: false, search: (q) => `https://www.thewinesociety.com/search-results?q=${encodeURIComponent(q)}` },
  { label: 'Majestic', fine: false, search: site('majestic.co.uk') },
  { label: 'Berry Bros. & Rudd', fine: true, search: (q) => `https://www.bbr.com/search?q=${encodeURIComponent(q)}` },
  { label: 'Lay & Wheeler', fine: true, search: site('laywheeler.com') },
  { label: 'Hedonism', fine: true, search: (q) => `https://hedonism.co.uk/search?q=${encodeURIComponent(q)}` },
]

/** A bottle around this price (£) or more counts as fine wine: the fine-wine merchants come first. */
export const FINE_WINE_FROM = 40

/** Wine-Searcher first, then the UK merchants that suit the wine: everyday merchants first, or fine-wine ones for a pricier bottle. */
export function buyLinks(w: WineRef, typicalPrice?: number | null): BuyLink[] {
  const q = words(w)
  if (!q) return []
  const fine = typicalPrice != null && typicalPrice >= FINE_WINE_FROM
  const merchants = [...MERCHANTS].sort((a, b) => Number(b.fine === fine) - Number(a.fine === fine))
  return [{ label: 'Wine-Searcher (UK)', url: wineSearcherUrl(w) }, ...merchants.map((m) => ({ label: m.label, url: m.search(q) }))]
}

export const PriceHintSchema = z.object({
  low: z.number().nullable().describe('Typical lowest UK retail price for one 75cl bottle, in pounds; null if you cannot tell'),
  high: z.number().nullable().describe('Typical highest UK retail price for one 75cl bottle, in pounds'),
  where: z.string().describe('One short sentence: which kinds of UK merchant usually stock it (e.g. "fine-wine merchants and the producer\'s UK importer")'),
})
export type PriceHint = z.infer<typeof PriceHintSchema>

export function validatePriceHintRequest(body: unknown): (WineRef & { lang: 'en' | 'it' }) | null {
  const b = body as WineRef & { lang?: string }
  const text = (s: unknown) => typeof s === 'string' && s.length <= 200
  if (!b || !text(b.producer) || !text(b.name) || !(b.producer.trim() || b.name.trim())) return null
  if (b.vintage != null && !(Number.isInteger(b.vintage) && b.vintage >= 1900 && b.vintage <= 2100)) return null
  return { producer: b.producer.trim(), name: b.name.trim(), vintage: b.vintage ?? null, lang: b.lang === 'it' ? 'it' : 'en' }
}

export function priceHintPrompt(w: WineRef & { lang: 'en' | 'it' }) {
  return [
    `Wine: ${words(w)} ${w.vintage ?? '(any recent vintage)'}.`,
    'Give the typical UK retail price range for one 75cl bottle (in pounds), and which kinds of UK merchant usually stock it. If you are unsure, give a wider range rather than guessing a precise one; use null when you have no idea.',
    w.lang === 'it' ? 'Write "where" in Italian.' : 'Write "where" in British English.',
  ].join('\n')
}

/** Rounds the AI's numbers to whole pounds and puts them in order; a range with no numbers is dropped. */
export function tidyPriceHint(h: PriceHint): PriceHint {
  const round = (n: number | null) => (n != null && n > 0 ? Math.round(n) : null)
  let [low, high] = [round(h.low), round(h.high)]
  if (low != null && high != null && low > high) [low, high] = [high, low]
  return { low: low ?? high, high: high ?? low, where: h.where.trim().slice(0, 300) }
}

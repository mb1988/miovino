/** Remembered prices per wine (from the Worker's wine_facts): shared by the Worker (/api/prices) and the app. */

export interface PricePoint {
  low: number | null
  high: number | null
  source: string // 'pricehint' | 'winelist' | …
  at: string // yyyy-mm-dd
}

export interface PricesRequestWine {
  id: string
  producer: string
  name: string
  vintage: number | null
}

export const MAX_PRICE_WINES = 300

export function validatePricesRequest(body: unknown): PricesRequestWine[] | null {
  const wines = (body as { wines?: unknown })?.wines
  if (!Array.isArray(wines) || !wines.length || wines.length > MAX_PRICE_WINES) return null
  const text = (s: unknown, max = 200) => typeof s === 'string' && s.length <= max
  for (const w of wines as PricesRequestWine[]) {
    if (!w || !text(w.id, 64) || !w.id || !text(w.producer) || !text(w.name)) return null
    if (w.vintage != null && !(Number.isInteger(w.vintage) && w.vintage > 1800 && w.vintage < 2200)) return null
  }
  return wines as PricesRequestWine[]
}

/** Middle of a price range (either end may be missing); undefined when there's no number. */
export function midPrice(p: Pick<PricePoint, 'low' | 'high'> | undefined): number | undefined {
  if (!p) return undefined
  const lo = p.low ?? p.high
  const hi = p.high ?? p.low
  return lo == null || hi == null ? undefined : (lo + hi) / 2
}

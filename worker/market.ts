import { generateJson, type AiEnv } from './ai'
import { remember, type FactsDb } from './facts'
import { priceHintPrompt, PriceHintSchema, tidyPriceHint, type PriceHint } from '../src/shared/whereToBuy'
import { FACT_MAX_AGE_DAYS, wineKey } from '../src/shared/wineKey'

/** Price checks per daily run: about 240 a month, well inside the free AI tier and the Worker's subrequest limit. */
export const DAILY_PRICE_CHECKS = 8

type Wine = { producer: string; name: string; vintage?: number | null }

/** Asks the AI for one wine's typical UK price and remembers it (adds a point to its price history). */
export async function lookUpPrice(db: FactsDb, env: AiEnv, wine: Wine, lang: 'en' | 'it' = 'en'): Promise<PriceHint> {
  const hint = tidyPriceHint(await generateJson(env, { messages: [{ role: 'user', content: priceHintPrompt({ ...wine, lang }) }] }, PriceHintSchema))
  await remember(db, wine, 'price', hint, 'pricehint')
  return hint
}

/**
 * Wines with a bottle still in the cellar whose newest remembered price is missing or older than 30 days:
 * never-priced first, then the longest-unchecked.
 */
export async function stalePrices(db: FactsDb, now = Date.now(), limit = DAILY_PRICE_CHECKS): Promise<Wine[]> {
  const { results: wines } = await db
    .prepare(
      `SELECT DISTINCT json_extract(w.data, '$.producer') AS producer, json_extract(w.data, '$.name') AS name, json_extract(w.data, '$.vintage') AS vintage
       FROM records w JOIN records b ON b.kind = 'bottles' AND b.deleted = 0 AND json_extract(b.data, '$.wineId') = w.id AND json_extract(b.data, '$.status') = 'cellar'
       WHERE w.kind = 'wines' AND w.deleted = 0`,
    )
    .all<{ producer: string | null; name: string | null; vintage: number | null }>()
  const { results: facts } = await db.prepare("SELECT wine_key, MAX(created_at) AS at FROM wine_facts WHERE kind = 'price' GROUP BY wine_key").all<{ wine_key: string; at: number }>()
  const last = new Map(facts.map((f) => [f.wine_key, f.at]))
  const cutoff = now - FACT_MAX_AGE_DAYS.price * 86_400_000
  const seen = new Set<string>()
  const due: (Wine & { at: number })[] = []
  for (const w of wines) {
    if (!w.producer?.trim() && !w.name?.trim()) continue
    const key = wineKey(w)
    if (seen.has(key)) continue
    seen.add(key)
    const at = last.get(key) ?? 0
    if (at < cutoff) due.push({ producer: w.producer ?? '', name: w.name ?? '', vintage: w.vintage ?? null, at })
  }
  return due
    .sort((a, b) => a.at - b.at)
    .slice(0, limit)
    .map(({ producer, name, vintage }) => ({ producer, name, vintage }))
}

/**
 * The daily market check: refreshes a few cellar prices, so every wine gets a new point about once a month
 * and "value over time" builds up on its own. Stops at the first AI error (e.g. the free tier's daily limit).
 */
export async function refreshPrices(db: FactsDb, env: AiEnv, now = Date.now()) {
  let checked = 0
  for (const w of await stalePrices(db, now)) {
    try {
      await lookUpPrice(db, env, w)
      checked++
    } catch (e) {
      console.warn('Market check stopped:', (e as Error).message)
      break
    }
  }
  return checked
}

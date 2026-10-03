import { FACT_MAX_AGE_DAYS, wineKey, type FactKind } from '../src/shared/wineKey'

/**
 * The Worker's memory of what the AI said about each wine (D1 table wine_facts, migration 0007).
 * Fresh facts are answered from here, so the same question costs no AI call; every fact is kept, with its date.
 */

interface Stmt {
  bind(...v: unknown[]): Stmt
  first<T = Record<string, unknown>>(): Promise<T | null>
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>
  run(): Promise<unknown>
}
export interface FactsDb {
  prepare(sql: string): Stmt
}

type WineRef = { producer?: string | null; name?: string | null; vintage?: number | null }

/** The newest fact of this kind for the wine, if it is still fresh. */
export async function recall<T>(db: FactsDb, wine: WineRef, kind: FactKind, now = Date.now()): Promise<{ data: T; at: number } | null> {
  const since = now - FACT_MAX_AGE_DAYS[kind] * 86_400_000
  const row = await db
    .prepare('SELECT data, created_at FROM wine_facts WHERE wine_key = ?1 AND kind = ?2 AND created_at >= ?3 ORDER BY created_at DESC LIMIT 1')
    .bind(wineKey(wine), kind, since)
    .first<{ data: string; created_at: number }>()
  return row ? { data: JSON.parse(row.data) as T, at: row.created_at } : null
}

/** Remembers a fact. Never throws: losing the memory must not break the answer the owner is waiting for. */
export async function remember(db: FactsDb, wine: WineRef, kind: FactKind, data: unknown, source: string, now = Date.now()) {
  if (!wine.producer && !wine.name) return
  try {
    await db.prepare('INSERT INTO wine_facts (wine_key, kind, data, source, created_at) VALUES (?1, ?2, ?3, ?4, ?5)').bind(wineKey(wine), kind, JSON.stringify(data), source, now).run()
  } catch (e) {
    console.warn('wine_facts: could not remember', kind, (e as Error).message)
  }
}

/**
 * Every remembered price for these wines, newest first, as {wineId: points}.
 * One query per 90 wines (D1 allows 100 bound values per statement).
 */
export async function priceHistory(db: FactsDb, wines: { id: string; producer: string; name: string; vintage: number | null }[]) {
  const byKey = new Map<string, string[]>()
  for (const w of wines) byKey.set(wineKey(w), [...(byKey.get(wineKey(w)) ?? []), w.id])
  const keys = [...byKey.keys()]
  const out: Record<string, { low: number | null; high: number | null; source: string; at: string }[]> = {}
  for (let i = 0; i < keys.length; i += 90) {
    const chunk = keys.slice(i, i + 90)
    const { results } = await db
      .prepare(`SELECT wine_key, data, source, created_at FROM wine_facts WHERE kind = 'price' AND wine_key IN (${chunk.map((_, j) => `?${j + 1}`).join(', ')}) ORDER BY created_at DESC`)
      .bind(...chunk)
      .all<{ wine_key: string; data: string; source: string; created_at: number }>()
    for (const r of results) {
      const d = JSON.parse(r.data) as { low?: number | null; high?: number | null }
      const point = { low: d.low ?? null, high: d.high ?? null, source: r.source, at: new Date(r.created_at).toISOString().slice(0, 10) }
      for (const id of byKey.get(r.wine_key) ?? []) (out[id] ??= []).push(point)
    }
  }
  return out
}

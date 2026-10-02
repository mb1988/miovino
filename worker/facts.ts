import { FACT_MAX_AGE_DAYS, wineKey, type FactKind } from '../src/shared/wineKey'

/**
 * The Worker's memory of what the AI said about each wine (D1 table wine_facts, migration 0007).
 * Fresh facts are answered from here, so the same question costs no AI call; every fact is kept, with its date.
 */

interface Stmt {
  bind(...v: unknown[]): Stmt
  first<T = Record<string, unknown>>(): Promise<T | null>
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

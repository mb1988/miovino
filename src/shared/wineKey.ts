/**
 * One key per wine + vintage, so "Château Léoville-Barton" and "chateau leoville barton" are the same wine.
 * Used by the Worker's wine_facts memory (prices, windows). No dependencies: shared by app and Worker.
 */
export function wineKey(w: { producer?: string | null; name?: string | null; vintage?: number | null }) {
  const norm = (s?: string | null) =>
    (s ?? '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '') // accents
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
  return `${norm(w.producer)}|${norm(w.name)}|${w.vintage ?? 'nv'}`
}

/** How long a remembered fact is trusted before the AI is asked again. */
export const FACT_MAX_AGE_DAYS = { price: 30, window: 365, blend: 3650 } as const
export type FactKind = keyof typeof FACT_MAX_AGE_DAYS

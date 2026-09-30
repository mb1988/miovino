import { sameWineKey } from './importer'
import { normalizeText } from './knowledge'
import type { WineWithBottles } from './types'

/** Finds wines in the cellar that look like the scanned label (exact key first, then fuzzy token overlap). */
export function matchCellar(cellar: WineWithBottles[], r: { producer: string; name: string; vintage: number | null }) {
  const key = sameWineKey(r)
  const exact = cellar.filter((w) => sameWineKey(w) === key)
  if (exact.length) return exact
  const tokens = (s: string) => new Set(normalizeText(s).split(/[^a-z0-9]+/).filter((t) => t.length > 2))
  const target = tokens(`${r.producer} ${r.name}`)
  return cellar
    .map((w) => {
      const t = tokens(`${w.producer} ${w.name}`)
      const overlap = [...target].filter((x) => t.has(x)).length / Math.max(1, Math.min(target.size, t.size))
      return { w, score: overlap + (w.vintage === r.vintage ? 0.2 : 0) }
    })
    .filter((m) => m.score >= 0.6)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((m) => m.w)
}

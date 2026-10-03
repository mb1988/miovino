import { useCallback, useEffect, useState } from 'react'
import { midPrice, type PricePoint, type PricesRequestWine } from '../shared/priceHistory'
import { getLang } from './i18n'
import { useSync } from './sync'

/** The server's memory of prices (Worker wine_facts): history per wine, and asking the AI for missing ones. */

export type PriceMemory = Record<string, PricePoint[]> // wineId → newest first

export async function fetchPrices(wines: PricesRequestWine[]): Promise<PriceMemory> {
  if (!wines.length) return {}
  const res = await fetch('/api/prices', { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ wines }) })
  if (!res.ok) return {}
  return ((await res.json()) as { prices?: PriceMemory }).prices ?? {}
}

/** Price history for these wines; reloads when the list changes. Empty while offline or signed out. */
export function usePriceMemory(wines: PricesRequestWine[] | undefined) {
  const sync = useSync()
  const [prices, setPrices] = useState<PriceMemory>({})
  const key = wines?.map((w) => `${w.id}:${w.producer}:${w.name}:${w.vintage}`).join('|') ?? ''
  const reload = useCallback(async () => {
    if (!wines?.length || !sync.available || !sync.authenticated) return
    setPrices(await fetchPrices(wines).catch(() => ({})))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- \`key\` stands for the wine list
  }, [key, sync.available, sync.authenticated])
  useEffect(() => {
    void reload()
  }, [reload])
  return { prices, reload }
}

/** Latest remembered UK price (middle of the range) per wine id. */
export function latestEstimates(prices: PriceMemory) {
  const out = new Map<string, number>()
  for (const [id, points] of Object.entries(prices)) {
    const m = midPrice(points[0])
    if (m != null) out.set(id, m)
  }
  return out
}

/** Asks the AI (via /api/pricehint, which also remembers the answer) for one wine's typical UK price. */
export async function estimatePrice(w: PricesRequestWine) {
  const res = await fetch('/api/pricehint', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ producer: w.producer, name: w.name, vintage: w.vintage, lang: getLang() }),
  })
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${res.status}`)
}

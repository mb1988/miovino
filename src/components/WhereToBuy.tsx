import { ExternalLink, Loader2, Sparkles, Store } from 'lucide-react'
import { useState } from 'react'
import { getLang, t } from '../lib/i18n'
import { useSync } from '../lib/sync'
import type { PriceHintCache, WineWithBottles } from '../lib/types'
import { pastSellers, typicalPrice } from '../lib/wishlist'
import { buyLinks, type PriceHint } from '../shared/whereToBuy'

const month = (iso?: string) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString(getLang() === 'it' ? 'it-IT' : 'en-GB', { month: 'short', year: 'numeric' }) : '')
const range = (h: { low: number | null; high: number | null }) => (h.low === h.high ? `£${h.low}` : `£${h.low}–${h.high}`)

export interface BuyTarget {
  producer: string
  name: string
  vintage?: number | null
  wineId?: string // a cellar wine: its own bottles count as "where you bought it before"
  priceHint?: PriceHintCache
}

/**
 * Where you bought it before, search links for live UK prices, and an optional AI price hint.
 * Used for wishlist items, for "buy again" on a wine page, and for any bottle on the Find a bottle screen;
 * `saveHint` stores the AI answer wherever the caller keeps it.
 */
export function WhereToBuy({ item, cellar, saveHint }: { item: BuyTarget; cellar: WineWithBottles[]; saveHint: (hint: PriceHintCache) => unknown }) {
  const sync = useSync()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const sellers = pastSellers(cellar, item)
  const links = buyLinks(item, typicalPrice(item, sellers))
  const hint = item.priceHint

  const askAi = async () => {
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/pricehint', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ producer: item.producer, name: item.name, vintage: item.vintage ?? null, lang: getLang() }),
      })
      const data = (await res.json().catch(() => ({}))) as { hint?: PriceHint; error?: string }
      if (!res.ok || !data.hint) throw new Error(data.error ?? t('Something went wrong ({status}).', { status: res.status }))
      await saveHint({ ...data.hint, at: new Date().toISOString().slice(0, 10) })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3 px-3.5 pb-3.5 text-sm">
      {sellers.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium tracking-wide text-cream-400 uppercase">{t('Where you bought it before')}</p>
          <ul className="space-y-1">
            {sellers.map((s) => (
              <li key={s.seller} className="flex items-baseline gap-2 text-cream-100">
                <Store size={14} className="shrink-0 self-center text-gold-400" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{s.seller}</span>
                <span className="shrink-0 text-xs text-cream-400 tabular-nums">
                  {[s.lastPrice != null ? `£${s.lastPrice}` : '', month(s.lastDate), s.bottles > 1 ? t('{n} bottles', { n: s.bottles }) : ''].filter(Boolean).join(' · ')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <p className="mb-1 text-xs font-medium tracking-wide text-cream-400 uppercase">{t('Live prices')}</p>
        <div className="flex flex-wrap gap-1.5">
          {links.map((l) => (
            <a key={l.label} href={l.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center gap-1 rounded-full px-3 py-1.5 text-xs text-cream-100 ring-1 ring-ink-600 hover:ring-wine-400">
              {l.label} <ExternalLink size={12} aria-hidden />
              <span className="sr-only">{t('(opens in a new tab)')}</span>
            </a>
          ))}
        </div>
      </div>

      {hint ? (
        <p className="flex items-start gap-2 rounded-xl bg-ink-800 p-3 text-cream-200">
          <Sparkles size={14} className="mt-0.5 shrink-0 text-gold-400" aria-hidden />
          <span>
            {hint.low != null && <b className="font-semibold text-cream-50">{t('Usually {range} in UK shops.', { range: range(hint) })} </b>}
            {hint.where} <span className="text-xs text-cream-500">{t('AI estimate, {date}', { date: month(hint.at) })}</span>
          </span>
        </p>
      ) : (
        sync.available &&
        sync.authenticated && (
          <button onClick={askAi} disabled={busy} className="flex min-h-9 items-center gap-1.5 text-xs text-wine-300 disabled:text-cream-500">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} {busy ? t('Asking…') : t('Typical UK price (AI)')}
          </button>
        )
      )}
      {error && <p className="text-xs text-rose-300">{error}</p>}
    </div>
  )
}

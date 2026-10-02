import { Camera, Check, ImageUp, Loader2, Plus, ShoppingBag, Sparkles, X } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { LiveCamera } from '../components/LiveCamera'
import { VerdictBadge } from '../components/PriceVerdict'
import { Button, cx, Label, PageHeader } from '../components/ui'
import { useCellar } from '../lib/hooks'
import { getLang, t } from '../lib/i18n'
import { imageToBase64 } from '../lib/image'
import { sameWineKey } from '../lib/importer'
import { priceLine, times } from '../lib/prices'
import { useSync } from '../lib/sync'
import type { WineWithBottles } from '../lib/types'
import { addWish } from '../lib/wishlist'
import { bestValue, isPounds, priceCheck } from '../shared/prices'
import { MAX_LIST_PAGES, type WineListPick, type WineListResult } from '../shared/winelist'

/**
 * What the owner paid for the same wine (same vintage if they have it). Only an exact producer + name match counts:
 * a Riserva in the cellar says nothing about the normale on the list.
 */
function paidFor(cellar: WineWithBottles[], w: { producer: string; name: string; vintage: number | null }) {
  const key = sameWineKey({ ...w, vintage: null })
  const matches = cellar.filter((c) => sameWineKey({ ...c, vintage: null }) === key)
  const wine = matches.find((m) => m.vintage === w.vintage) ?? matches[0]
  return (wine?.bottles ?? []).map((b) => b.purchasePrice).filter((p): p is number => typeof p === 'number' && p > 0)
}

/** Adds a price check to every bottle: the owner's own purchase price beats the AI's retail estimate. */
function withChecks(result: WineListResult, cellar: WineWithBottles[]) {
  const pounds = isPounds(result.currency)
  const check = (w: { producer: string; name: string; vintage: number | null; price: number | null; retailEstimate: number | null }) =>
    pounds ? priceCheck(w.price, w.retailEstimate, paidFor(cellar, w)) : null
  const picks = result.picks.map((p) => ({ ...p, check: check(p) }))
  const deals = result.deals.map((d) => ({ ...d, check: check(d) }))
  return { picks, deals, best: bestValue([...picks, ...deals]) }
}

const FIT_STYLE: Record<WineListPick['fit'], string> = {
  great: 'bg-emerald-400/15 text-emerald-200 ring-emerald-400/30',
  good: 'bg-sky-400/15 text-sky-200 ring-sky-400/30',
  safe: 'bg-stone-500/15 text-stone-300 ring-stone-500/30',
}
const FIT_LABEL: Record<WineListPick['fit'], string> = { great: 'Your style', good: 'Good bet', safe: 'Safe choice' }

/** At a restaurant: photograph the wine list, get picks for your own taste. */
export default function WineListPage() {
  const sync = useSync()
  const [pages, setPages] = useState<{ blob: Blob; url: string }[]>([])
  const [food, setFood] = useState('')
  const [budget, setBudget] = useState('')
  const [camOpen, setCamOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<WineListResult>()
  const [saved, setSaved] = useState<Set<number>>(new Set())
  const fileRef = useRef<HTMLInputElement>(null)
  const cellar = useCellar()
  const priced = useMemo(() => (result ? withChecks(result, cellar ?? []) : undefined), [result, cellar])

  const addPages = (files: Blob[]) => setPages((p) => [...p, ...files.map((blob) => ({ blob, url: URL.createObjectURL(blob) }))].slice(0, MAX_LIST_PAGES))

  const find = async () => {
    setBusy(true)
    setError('')
    setResult(undefined)
    setSaved(new Set())
    try {
      const images = await Promise.all(pages.map(async (p) => (await imageToBase64(p.blob)).data))
      const n = Number(budget.replace(',', '.'))
      const res = await fetch('/api/winelist', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ images, food: food.trim() || undefined, budget: n > 0 ? n : undefined, lang: getLang() }),
      })
      const data = (await res.json().catch(() => ({}))) as { result?: WineListResult; error?: string }
      if (!res.ok || !data.result) throw new Error(data.error ?? t('Something went wrong ({status}).', { status: res.status }))
      setResult(data.result)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const ready = sync.available && sync.authenticated
  return (
    <div>
      <PageHeader title={t('Wine list')} subtitle={t('At a restaurant? Photograph the list')} back />
      <LiveCamera open={camOpen} onClose={() => setCamOpen(false)} onCapture={(b) => addPages([b])} hint={t('One page of the wine list, flat and sharp')} />
      <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => (addPages([...(e.target.files ?? [])]), (e.target.value = ''))} />

      {!ready && <p className="card mb-4 p-4 text-sm text-cream-300">{t('The wine-list scanner runs on your MioVino server — sign in on this device to use it.')}</p>}

      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {pages.map((p, i) => (
          <div key={p.url} className="relative h-28 w-20 shrink-0 overflow-hidden rounded-xl ring-1 ring-ink-600">
            <img src={p.url} alt={t('Page {n}', { n: i + 1 })} className="h-full w-full object-cover" />
            <button aria-label={t('Remove')} onClick={() => setPages((ps) => ps.filter((x) => x !== p))} className="absolute top-1 right-1 rounded-full bg-black/60 p-1 text-cream-50">
              <X size={12} />
            </button>
          </div>
        ))}
        {pages.length < MAX_LIST_PAGES && (
          <>
            <button onClick={() => setCamOpen(true)} className="flex h-28 w-20 shrink-0 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-ink-600 text-xs text-cream-300">
              <Camera size={20} />
              {pages.length ? t('Add page') : t('Photo')}
            </button>
            <button onClick={() => fileRef.current?.click()} className="flex h-28 w-20 shrink-0 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-ink-600 text-xs text-cream-300">
              <ImageUp size={20} />
              {t('Library')}
            </button>
          </>
        )}
      </div>

      <div className="mb-4 grid grid-cols-[1fr_7rem] gap-3">
        <label className="block">
          <Label>{t('What are you eating?')}</Label>
          <input className="field" value={food} maxLength={200} onChange={(e) => setFood(e.target.value)} placeholder={t('e.g. lamb chops, risotto ai funghi, cinghiale…')} />
        </label>
        <label className="block">
          <Label>{t('Budget')}</Label>
          <input className="field" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder={t('max')} />
        </label>
      </div>

      <Button className="w-full py-3" disabled={!pages.length || busy || !ready} onClick={find}>
        {busy ? (
          <>
            <Loader2 className="animate-spin" size={18} /> {t('Reading the list…')}
          </>
        ) : (
          t('Find my bottle')
        )}
      </Button>
      {busy && <p className="mt-2 text-center text-xs text-cream-500">{t('Usually under a minute for a long list')}</p>}
      {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}

      {result && priced && (
        <section className="mt-6 space-y-3">
          {priced.best && (
            <p className="flex items-start gap-2 rounded-xl bg-emerald-400/10 p-3 text-sm text-emerald-100 ring-1 ring-emerald-400/30">
              <Sparkles size={16} className="mt-0.5 shrink-0" aria-hidden />
              <span>
                {t('Best value on this list: {wine} — {x} {basis}', {
                  wine: [priced.best.producer, priced.best.name, priced.best.vintage].filter(Boolean).join(' '),
                  x: times(priced.best.check!.markup),
                  basis: priced.best.check!.basis === 'paid' ? t('what you paid') : t('shop price'),
                })}
              </span>
            </p>
          )}
          {result.picks.length === 0 && <p className="text-sm text-cream-400">{t('Nothing on this list fits — the note below may help.')}</p>}
          {priced.picks.map((p, i) => (
            <div key={i} className="card p-4">
              <div className="mb-1 flex items-start gap-2">
                <span className="mt-0.5 font-display text-lg text-cream-400">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-cream-400">{p.producer}</p>
                  <p className="font-display text-lg leading-snug text-cream-50">
                    {p.name} {p.vintage ?? ''}
                  </p>
                </div>
                {p.price != null && (
                  <span className="shrink-0 font-semibold text-cream-100 tabular-nums">
                    {result.currency ?? ''}
                    {p.price}
                  </span>
                )}
              </div>
              <div className="mb-2 flex flex-wrap gap-1.5 pl-6">
                <span className={cx('rounded-full px-2 py-0.5 text-[11px] font-medium ring-1', FIT_STYLE[p.fit])}>{t(FIT_LABEL[p.fit])}</span>
                {p.byTheGlass && <span className="rounded-full px-2 py-0.5 text-[11px] text-cream-300 ring-1 ring-ink-600">{t('by the glass')}</span>}
                {p.inCellar && <span className="rounded-full px-2 py-0.5 text-[11px] text-gold-400 ring-1 ring-gold-400/40">{t('also in your cellar')}</span>}
                {p.check && <VerdictBadge verdict={p.check.verdict} />}
              </div>
              <p className="pl-6 text-sm text-cream-200">{p.why}</p>
              {priceLine(p.check, p.retailEstimate, p.valueNote) && <p className="mt-1 pl-6 text-xs text-cream-400">{priceLine(p.check, p.retailEstimate, p.valueNote)}</p>}
              <button
                disabled={saved.has(i)}
                onClick={async () => {
                  await addWish({ producer: p.producer, name: p.name, vintage: p.vintage, note: t('Seen on a wine list{price}', { price: p.price != null ? ` · ${result.currency ?? ''}${p.price}` : '' }) })
                  setSaved((s) => new Set(s).add(i))
                }}
                className="mt-2 ml-6 flex items-center gap-1.5 text-xs text-wine-300 disabled:text-cream-500"
              >
                {saved.has(i) ? <Check size={14} /> : <ShoppingBag size={14} />} {saved.has(i) ? t('On your wishlist') : t('Add to wishlist')}
              </button>
            </div>
          ))}
          {priced.deals.length > 0 && (
            <div className="card p-4">
              <h2 className="mb-2 font-display text-base text-cream-50">{t('Prices worth knowing')}</h2>
              <ul className="space-y-2.5">
                {priced.deals.map((d, i) => (
                  <li key={i}>
                    <div className="flex items-start gap-2">
                      <p className="min-w-0 flex-1 text-sm text-cream-100">{[d.producer, d.name, d.vintage].filter(Boolean).join(' ')}</p>
                      <span className="shrink-0 text-sm font-semibold text-cream-100 tabular-nums">
                        {result.currency ?? ''}
                        {d.price}
                      </span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                      {d.check && <VerdictBadge verdict={d.check.verdict} />}
                      <span className="text-xs text-cream-400">{priceLine(d.check, d.retailEstimate, d.valueNote)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {[...priced.picks, ...priced.deals].some((x) => x.check?.basis === 'retail') && (
            <p className="text-xs text-cream-500">{t('Shop prices are AI estimates, not quotes. UK restaurants usually charge 2.5–3.5× retail.')}</p>
          )}
          {result.note && <p className="rounded-xl bg-ink-800 p-3 text-sm text-cream-300">💡 {result.note}</p>}
          <button className="flex w-full items-center justify-center gap-1.5 py-2 text-sm text-cream-400" onClick={() => (setPages([]), setResult(undefined))}>
            <Plus size={14} /> {t('Another list')}
          </button>
        </section>
      )}
    </div>
  )
}

import { Check, Loader2, Sparkles, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Bottle, Button, cx, Empty, PageHeader } from '../components/ui'
import { updateWine } from '../lib/db'
import { useCellar } from '../lib/hooks'
import { getLang, t } from '../lib/i18n'
import { useSync } from '../lib/sync'
import type { WineWithBottles } from '../lib/types'
import { MAX_WINDOW_WINES, type WindowSuggestion, type WindowWine } from '../shared/windows'

const CONF_STYLE: Record<WindowSuggestion['confidence'], string> = {
  high: 'text-emerald-300',
  medium: 'text-amber-200',
  low: 'text-rose-300',
}

/** Ask Claude for typical drinking windows for wines that have none; the owner accepts them one by one. */
export default function WindowsPage() {
  const cellar = useCellar()
  const sync = useSync()
  const [sp] = useSearchParams()
  const only = sp.get('w')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [found, setFound] = useState<Map<string, WindowSuggestion>>(new Map())
  const [done, setDone] = useState<Map<string, 'saved' | 'skipped'>>(new Map())

  // Wines without a window (cellar bottles first), or the one wine the link asked about.
  // Ones handled in this visit stay listed so their "Saved" / "Skipped" state remains visible.
  const missing = useMemo(
    () =>
      (cellar ?? [])
        .filter((w) => (only ? w.id === only : (w.drinkFrom == null && w.drinkTo == null) || done.has(w.id)))
        .sort((a, b) => b.inCellar - a.inCellar || a.producer.localeCompare(b.producer)),
    [cellar, only, done],
  )
  if (!cellar) return null

  const ask = async () => {
    setBusy(true)
    setError('')
    try {
      const batch = missing.filter((w) => !found.has(w.id) && !done.has(w.id)).slice(0, MAX_WINDOW_WINES)
      const wines: WindowWine[] = batch.map((w) => ({ id: w.id, producer: w.producer, name: w.name, vintage: w.vintage, type: w.type, appellation: w.appellation, region: w.region, country: w.country, grapes: w.grapes }))
      const res = await fetch('/api/windows', { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ wines, lang: getLang() }) })
      const data = (await res.json().catch(() => ({}))) as { windows?: WindowSuggestion[]; error?: string }
      if (!res.ok || !data.windows) throw new Error(data.error ?? t('Something went wrong ({status}).', { status: res.status }))
      setFound((m) => new Map([...m, ...data.windows!.map((s) => [s.id, s] as const)]))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const accept = async (w: WineWithBottles, s: WindowSuggestion) => {
    await updateWine(w.id, {
      drinkFrom: s.drinkFrom ?? undefined,
      drinkTo: s.drinkTo ?? undefined,
      peakYear: s.peakYear ?? undefined,
      external: [...w.external, { source: 'AI (window suggestion)', window: `${s.drinkFrom ?? '…'}–${s.drinkTo ?? '…'}`, note: s.note }],
    })
    setDone((m) => new Map(m).set(w.id, 'saved'))
  }
  const usable = (s?: WindowSuggestion) => !!s && (s.drinkFrom != null || s.drinkTo != null)
  const pending = missing.filter((w) => usable(found.get(w.id)) && !done.has(w.id))
  const left = missing.filter((w) => !found.has(w.id) && !done.has(w.id)).length
  const ready = sync.available && sync.authenticated

  return (
    <div>
      <PageHeader title={t('Drinking windows')} subtitle={t('Suggestions for wines without one')} back />
      {missing.length === 0 ? (
        <Empty icon={<Check size={28} />} title={t('Every wine has a window')}>
          {t('New wines without one will show up here.')}
        </Empty>
      ) : (
        <>
          <p className="mb-4 text-sm text-cream-300">{t('Claude suggests a typical window for each wine from the producer, appellation and vintage. Nothing is saved until you accept it.')}</p>
          {!ready && <p className="card mb-4 p-4 text-sm text-cream-300">{t('Suggestions come from your MioVino server — sign in on this device to use them.')}</p>}
          {left > 0 && (
            <Button className="mb-4 w-full" disabled={busy || !ready} onClick={ask}>
              {busy ? <Loader2 className="animate-spin" size={18} /> : <Sparkles size={18} />} {t('Suggest windows for {n} wines', { n: Math.min(left, MAX_WINDOW_WINES) })}
            </Button>
          )}
          {pending.length > 1 && (
            <Button variant="secondary" className="mb-4 w-full" onClick={async () => { for (const w of pending) await accept(w, found.get(w.id)!) }}>
              <Check size={16} /> {t('Accept all {n}', { n: pending.length })}
            </Button>
          )}
          {error && <p className="mb-4 text-sm text-rose-300">{error}</p>}

          <div className="space-y-2">
            {missing.map((w) => {
              const s = found.get(w.id)
              const state = done.get(w.id)
              return (
                <div key={w.id} className={cx('card p-3', state && 'opacity-60')}>
                  <div className="flex items-center gap-3">
                    <Bottle type={w.type} className="h-9 w-4 shrink-0" />
                    <Link to={`/wine/${w.id}`} className="min-w-0 flex-1">
                      <p className="truncate text-sm text-cream-50">
                        {w.producer} {w.name} {w.vintage ?? 'NV'}
                      </p>
                      <p className="text-xs text-cream-500">{w.inCellar ? t('{n} in cellar', { n: w.inCellar }) : t('none left')}</p>
                    </Link>
                    {s && usable(s) && (
                      <span className="shrink-0 text-right font-semibold text-cream-100 tabular-nums">
                        {s.drinkFrom ?? '…'}–{s.drinkTo ?? '…'}
                      </span>
                    )}
                  </div>
                  {s && (
                    <div className="mt-2 pl-7">
                      <p className="text-xs text-cream-300">
                        <span className={CONF_STYLE[s.confidence]}>{t(`${s.confidence} confidence`)}</span>
                        {s.peakYear ? ` · ${t('peak {year}', { year: s.peakYear })}` : ''} · {s.note}
                      </p>
                      {state ? (
                        <p className="mt-1.5 text-xs text-cream-400">{state === 'saved' ? `✓ ${t('Saved')}` : t('Skipped')}</p>
                      ) : usable(s) ? (
                        <div className="mt-2 flex gap-2">
                          <Button className="px-3 py-1.5 text-xs" onClick={() => accept(w, s)}>
                            <Check size={14} /> {t('Use this window')}
                          </Button>
                          <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => setDone((m) => new Map(m).set(w.id, 'skipped'))}>
                            <X size={14} /> {t('Skip')}
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

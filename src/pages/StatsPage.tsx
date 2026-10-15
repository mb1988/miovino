import { useMemo, useState } from 'react'
import { Empty, PageHeader, Section } from '../components/ui'
import { useCellar } from '../lib/hooks'
import { getLang, plural, t } from '../lib/i18n'
import { formatMoney } from '../lib/settings'
import { currentYear } from '../lib/status'
import { cellarTimeline, type YearRow } from '../lib/timeline'
import { biggestMovers, cellarValueNow, signedPct, valueHistory, type Mover, type ValuePoint } from '../lib/value'
import { Link } from 'react-router-dom'
import { BarChart3, Loader2, Sparkles, TrendingDown, TrendingUp } from 'lucide-react'
import { estimatePrice, latestEstimates, usePriceMemory } from '../lib/priceMemory'
import { useSync } from '../lib/sync'

/** Cellar over time: what you spent each year, and bottles in and out. */
export default function StatsPage() {
  const cellar = useCellar()
  const data = useMemo(() => (cellar ? cellarTimeline(cellar) : undefined), [cellar])
  const owned = useMemo(() => (cellar ?? []).filter((w) => w.inCellar > 0).map((w) => ({ id: w.id, producer: w.producer, name: w.name, vintage: w.vintage })), [cellar])
  const { prices, reload } = usePriceMemory(owned)
  const estimates = useMemo(() => latestEstimates(prices), [prices])
  const value = useMemo(() => cellarValueNow(cellar ?? [], estimates), [cellar, estimates])
  const history = useMemo(() => valueHistory(cellar ?? [], prices), [cellar, prices])
  const movers = useMemo(() => biggestMovers(cellar ?? [], estimates), [cellar, estimates])
  const sync = useSync()
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  if (!cellar || !data) return null
  // Wines in the cellar with no price today (none set by you, none remembered from the AI).
  const missing = owned.filter((w) => !estimates.has(w.id) && cellar.find((c) => c.id === w.id)?.marketPrice == null)
  const estimateMissing = async () => {
    setBusy(true)
    setNote('')
    let done = 0
    // Ten at a time, one by one: stays well inside the free AI tier's per-minute limit.
    for (const w of missing.slice(0, 10)) {
      try {
        await estimatePrice(w)
        done++
      } catch (e) {
        setNote((e as Error).message)
        break
      }
    }
    await reload()
    setBusy(false)
    if (done) setNote(plural(done, 'Priced {n} wine.', 'Priced {n} wines.'))
  }
  const thisYear = currentYear()
  const inCellar = cellar.reduce((n, w) => n + w.inCellar, 0)
  const spentThisYear = data.years.find((y) => y.year === thisYear)?.spent ?? 0

  return (
    <div>
      <PageHeader title={t('Cellar over time')} subtitle={t('Spending and bottles, year by year')} back />
      <div className="card mb-6 grid grid-cols-3 divide-x divide-ink-700">
        <Tile value={formatMoney(data.valueAtCost)} label={t('cellar value at cost')} />
        <Tile value={inCellar} label={t('bottles now')} />
        <Tile value={formatMoney(spentThisYear)} label={t('spent in {year}', { year: thisYear })} />
      </div>
      {value.repriced > 0 && (
        <p className="-mt-3 mb-6 flex items-center justify-between rounded-xl bg-ink-850 px-4 py-2.5 text-sm ring-1 ring-ink-700">
          <span className="text-cream-300">{t('At today’s prices: {value}', { value: formatMoney(value.now) })}</span>
          <span className={value.gain >= 0 ? 'font-semibold text-emerald-300 tabular-nums' : 'font-semibold text-rose-300 tabular-nums'}>
            {value.gain >= 0 ? '+' : '−'}
            {formatMoney(Math.abs(value.gain))}
            {value.atCost > 0 ? ` (${signedPct((value.gain / value.atCost) * 100)})` : ''}
          </span>
        </p>
      )}
      {(value.estimated > 0 || missing.length > 0) && (
        <div className="-mt-3 mb-6 space-y-2 text-xs text-cream-400">
          {value.estimated > 0 && <p>{plural(value.estimated, '{n} bottle priced from the AI’s typical UK price (an estimate).', '{n} bottles priced from the AI’s typical UK prices (estimates).')}</p>}
          {missing.length > 0 && sync.available && sync.authenticated && (
            <button onClick={estimateMissing} disabled={busy} className="flex min-h-9 items-center gap-1.5 text-wine-300 disabled:text-cream-500">
              {busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Sparkles size={14} aria-hidden />}
              {busy ? t('Asking…') : plural(missing.length, 'Estimate today’s price for {n} wine', 'Estimate today’s prices for {n} wines')}
              {!busy && missing.length > 10 ? <span className="text-cream-500">{t('(10 at a time)')}</span> : null}
            </button>
          )}
          {note && <p role="status">{note}</p>}
        </div>
      )}
      {history.length >= 2 && (
        <Section title={t('Market value')}>
          <ValueChart points={history} />
        </Section>
      )}
      {(movers.up.length > 0 || movers.down.length > 0) && (
        <Section title={t('Biggest movers')}>
          <div className="card divide-y divide-ink-700">
            {[...movers.up, ...movers.down].map((m) => (
              <MoverRow key={m.id} m={m} wine={cellar.find((w) => w.id === m.id)!} />
            ))}
          </div>
          <p className="mt-2 text-xs text-cream-500">{t('Price today against what you paid per bottle.')}</p>
        </Section>
      )}
      {sync.available && sync.authenticated && <p className="-mt-3 mb-6 text-xs text-cream-500">{t('Prices are checked automatically, a few wines a day, so each wine gets a new price about once a month.')}</p>}
      {data.unpriced > 0 && <p className="-mt-4 mb-6 text-xs text-cream-500">{plural(data.unpriced, '{n} bottle in the cellar has no price, so the value is a floor.', '{n} bottles in the cellar have no price, so the value is a floor.')}</p>}

      {data.years.length === 0 ? (
        <Empty icon={<BarChart3 size={28} />} title={t('Nothing to chart yet')}>
          {t('Add bottles with a purchase date and price to see your years.')}
        </Empty>
      ) : (
        <>
          <Section title={t('Spent per year')}>
            <SpendChart years={data.years} />
          </Section>
          <Section title={t('Bottles in and out')}>
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="text-xs text-cream-400">
                  <tr className="border-b border-ink-700">
                    <th className="px-4 py-2 text-left font-medium">{t('Year')}</th>
                    <th className="px-2 py-2 text-right font-medium">{t('In')}</th>
                    <th className="px-2 py-2 text-right font-medium">{t('Out')}</th>
                    <th className="px-4 py-2 text-right font-medium">{t('Net')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-700 tabular-nums">
                  {[...data.years].reverse().map((y) => {
                    const net = y.bottlesIn - y.bottlesOut
                    return (
                      <tr key={y.year} className={y.bottlesIn + y.bottlesOut === 0 ? 'text-cream-500' : 'text-cream-100'}>
                        <td className="px-4 py-2">{y.year}</td>
                        <td className="px-2 py-2 text-right">{y.bottlesIn || '–'}</td>
                        <td className="px-2 py-2 text-right">{y.bottlesOut || '–'}</td>
                        <td className="px-4 py-2 text-right">{net > 0 ? `+${net}` : net || '–'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Section>
        </>
      )}
    </div>
  )
}

function Tile({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div className="px-3 py-4 text-center">
      <p className="font-display text-2xl font-semibold text-cream-50">{value}</p>
      <p className="text-[11px] tracking-wide text-cream-400 uppercase">{label}</p>
    </div>
  )
}

/** One series, one hue: bars rounded at the top, anchored to the baseline; tap or hover a year for its value. */
function SpendChart({ years }: { years: YearRow[] }) {
  const [active, setActive] = useState<number>()
  const max = Math.max(...years.map((y) => y.spent), 1)
  const peak = years.reduce((a, b) => (b.spent > a.spent ? b : a))
  const shown = years.find((y) => y.year === active)
  return (
    <div className="card p-4">
      <p className="mb-3 h-5 text-sm text-cream-200 tabular-nums">
        {shown ? (
          <>
            <span className="text-cream-400">{shown.year}: </span>
            {formatMoney(shown.spent)} · {t('{n} bottles', { n: shown.bottlesIn })}
          </>
        ) : (
          <span className="text-cream-400">{t('Tap a year for details')}</span>
        )}
      </p>
      <div className="flex h-40 items-end gap-0.5 border-b border-ink-600" role="group" aria-label={t('Spent per year')}>
        {years.map((y) => (
          <button
            key={y.year}
            type="button"
            onPointerEnter={() => setActive(y.year)}
            onFocus={() => setActive(y.year)}
            onClick={() => setActive(y.year)}
            aria-label={`${y.year}: ${formatMoney(y.spent)}`}
            className="group relative flex h-full flex-1 flex-col items-center justify-end"
          >
            {y === peak && y.spent > 0 && <span className="mb-1 text-[10px] text-cream-300 tabular-nums">{formatMoney(y.spent)}</span>}
            <span
              className={`w-full max-w-10 rounded-t-[4px] transition ${active === y.year ? 'bg-wine-300' : 'bg-wine-400'}`}
              style={{ height: y.spent ? `${Math.max(2, (y.spent / max) * 85)}%` : 0 }}
            />
          </button>
        ))}
      </div>
      <div className="mt-1.5 flex gap-0.5 text-center text-[10px] text-cream-500 tabular-nums">
        {years.map((y, i) => (
          <span key={y.year} className="flex-1">
            {years.length <= 8 || i % Math.ceil(years.length / 8) === 0 || i === years.length - 1 ? `'${String(y.year).slice(2)}` : ''}
          </span>
        ))}
      </div>
    </div>
  )
}

const monthName = (m: string, year = false) => new Date(`${m}-15T12:00:00`).toLocaleDateString(getLang() === 'it' ? 'it-IT' : 'en-GB', year ? { month: 'short', year: '2-digit' } : { month: 'short' })

/** Market value (gold) against what those same bottles cost (dashed), month by month. */
function ValueChart({ points }: { points: ValuePoint[] }) {
  const w = 320
  const h = 120
  const all = points.flatMap((p) => [p.value, p.cost])
  const min = Math.min(...all) * 0.95
  const max = Math.max(...all) * 1.05
  const span = max - min || 1
  const x = (i: number) => (i / (points.length - 1)) * (w - 16) + 8
  const y = (v: number) => h - 8 - ((v - min) / span) * (h - 16)
  const line = (key: 'value' | 'cost') => points.map((p, i) => `${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join(' ')
  const first = points[0]
  const last = points.at(-1)!
  // Against what the bottles cost, not against the first month: buying more bottles isn't a gain.
  const change = last.cost > 0 ? ((last.value - last.cost) / last.cost) * 100 : 0
  return (
    <figure className="card p-4">
      <p className="mb-3 flex items-baseline justify-between text-sm tabular-nums">
        <span className="text-cream-100">{formatMoney(last.value)}</span>
        <span className={change >= 0 ? 'text-xs font-semibold text-emerald-300' : 'text-xs font-semibold text-rose-300'}>
          {signedPct(change)} {t('vs what you paid')}
        </span>
      </p>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-32 w-full" role="img" aria-label={t('Market value from {from} in {start} to {to} now', { from: formatMoney(first.value), start: monthName(first.month, true), to: formatMoney(last.value) })}>
        <polyline points={line('cost')} fill="none" stroke="var(--color-cream-500)" strokeWidth="1.5" strokeDasharray="4 4" />
        <polyline points={line('value')} fill="none" stroke="var(--color-gold-400)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(points.length - 1)} cy={y(last.value)} r="3.5" fill="var(--color-gold-400)" />
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-cream-500">
        <span>{monthName(first.month, true)}</span>
        <span>{monthName(last.month, true)}</span>
      </div>
      <figcaption className="mt-2 flex gap-4 text-xs text-cream-400">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded bg-gold-400" aria-hidden />
          {t('Market value')}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0 w-4 border-t border-dashed border-cream-500" aria-hidden />
          {t('What you paid')}
        </span>
      </figcaption>
    </figure>
  )
}

function MoverRow({ m, wine }: { m: Mover; wine: { id: string; producer: string; name: string; vintage?: number | null } }) {
  const up = m.pct > 0
  return (
    <Link to={`/wine/${wine.id}`} className="flex items-center gap-3 px-4 py-3">
      {up ? <TrendingUp size={16} className="shrink-0 text-emerald-300" aria-hidden /> : <TrendingDown size={16} className="shrink-0 text-rose-300" aria-hidden />}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-cream-50">
          {wine.producer} {wine.name}
        </span>
        <span className="block text-xs text-cream-400 tabular-nums">
          {wine.vintage ?? 'NV'} · {formatMoney(m.paid)} → {formatMoney(m.now)}
        </span>
      </span>
      <span className={up ? 'text-sm font-semibold text-emerald-300 tabular-nums' : 'text-sm font-semibold text-rose-300 tabular-nums'}>{signedPct(m.pct)}</span>
    </Link>
  )
}

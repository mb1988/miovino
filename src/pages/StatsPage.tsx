import { useMemo, useState } from 'react'
import { Empty, PageHeader, Section } from '../components/ui'
import { useCellar } from '../lib/hooks'
import { plural, t } from '../lib/i18n'
import { formatMoney } from '../lib/settings'
import { currentYear } from '../lib/status'
import { cellarTimeline, type YearRow } from '../lib/timeline'
import { cellarValueNow, signedPct } from '../lib/value'
import { BarChart3 } from 'lucide-react'

/** Cellar over time: what you spent each year, and bottles in and out. */
export default function StatsPage() {
  const cellar = useCellar()
  const data = useMemo(() => (cellar ? cellarTimeline(cellar) : undefined), [cellar])
  const value = useMemo(() => cellarValueNow(cellar ?? []), [cellar])
  if (!cellar || !data) return null
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

import { getLang, t } from '../lib/i18n'
import { midPrice, type PricePoint } from '../shared/priceHistory'

const SOURCE: Record<string, string> = { pricehint: 'AI estimate', winelist: 'From a wine list' }
const day = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(getLang() === 'it' ? 'it-IT' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const money = (p: PricePoint) => (p.low === p.high || p.high == null ? `£${p.low}` : p.low == null ? `£${p.high}` : `£${p.low}–${p.high}`)

/** Every remembered UK price for a wine: a small line (oldest → newest) and the latest few points. */
export function PriceHistory({ points }: { points: PricePoint[] }) {
  if (!points.length) return null
  const series = [...points].reverse().map((p) => midPrice(p)).filter((v): v is number => v != null)
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium tracking-wide text-cream-400 uppercase">{t('Price history')}</p>
      {series.length >= 2 && <Sparkline values={series} />}
      <ul className="space-y-1 text-xs">
        {points.slice(0, 6).map((p, i) => (
          <li key={i} className="flex items-baseline gap-2">
            <span className="w-24 shrink-0 text-cream-400 tabular-nums">{day(p.at)}</span>
            <span className="font-medium text-cream-100 tabular-nums">{money(p)}</span>
            <span className="min-w-0 truncate text-cream-500">{t(SOURCE[p.source] ?? p.source)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Sparkline({ values }: { values: number[] }) {
  const w = 240
  const h = 48
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const pts = values.map((v, i) => [(i / (values.length - 1)) * (w - 8) + 4, h - 6 - ((v - min) / span) * (h - 12)] as const)
  const first = values[0]
  const last = values.at(-1)!
  const pct = Math.round(((last - first) / first) * 100)
  return (
    <figure className="flex items-center gap-3">
      <svg viewBox={`0 0 ${w} ${h}`} className="h-12 w-full max-w-60" role="img" aria-label={t('Price from £{from} to £{to}', { from: Math.round(first), to: Math.round(last) })}>
        <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke="var(--color-gold-400)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={pts.at(-1)![0]} cy={pts.at(-1)![1]} r="3" fill="var(--color-gold-400)" />
      </svg>
      <figcaption className={pct > 0 ? 'text-xs font-semibold text-rose-300' : pct < 0 ? 'text-xs font-semibold text-emerald-300' : 'text-xs text-cream-400'}>
        {pct > 0 ? '+' : pct < 0 ? '−' : '±'}
        {Math.abs(pct)}%
      </figcaption>
    </figure>
  )
}

import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Bottle, PageHeader, Section, Stars, TYPE_COLOR } from '../components/ui'
import { useCellar } from '../lib/hooks'
import { formatMoney } from '../lib/settings'
import { cellarStats, rankBy, tasteSummary, type Ranked } from '../lib/stats'
import { WINE_TYPE_LABEL, type WineType } from '../lib/types'

export default function TastePage() {
  const cellar = useCellar()
  const data = useMemo(() => {
    if (!cellar) return undefined
    const allBottles = new Map<WineType, number>()
    for (const w of cellar) allBottles.set(w.type, (allBottles.get(w.type) ?? 0) + w.bottles.length)
    const total = [...allBottles.values()].reduce((a, b) => a + b, 0)
    const tastings = cellar.flatMap((w) => w.tastings)
    const rated = tastings.filter((t) => t.rating != null)
    return {
      stats: cellarStats(cellar),
      types: [...allBottles.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => ({ t, n, pct: total ? n / total : 0 })),
      grapes: rankBy(cellar, (w) => w.grapes),
      regions: rankBy(cellar, (w) => [w.region ?? '']),
      countries: rankBy(cellar, (w) => [w.country ?? '']),
      producers: rankBy(cellar, (w) => [w.producer]),
      avg: rated.length ? rated.reduce((a, t) => a + t.rating!, 0) / rated.length : undefined,
      tastings: tastings.length,
      loved: cellar.filter((w) => (w.avgRating ?? 0) >= 4.5),
      notAgain: cellar.filter((w) => w.tastings.some((t) => t.buyAgain === 'no') || (w.avgRating != null && w.avgRating <= 2)),
      summary: tasteSummary(cellar),
      vintages: vintageSpread(cellar.filter((w) => w.inCellar).map((w) => [w.vintage, w.inCellar] as const)),
    }
  }, [cellar])

  if (!data) return null
  const byBottles = (r: Ranked[]) => [...r].sort((a, b) => b.bottles - a.bottles)

  return (
    <div>
      <PageHeader title="Your Wine DNA" subtitle={`${data.tastings} tastings · ${data.stats.bottles} bottles in cellar`} back />

      {data.summary ? (
        <p className="card mb-6 p-4 font-display text-lg text-cream-100">{data.summary}</p>
      ) : (
        <p className="card mb-6 p-4 text-sm text-cream-400">Log a few tastings (with ratings) and this page starts telling you what you actually like — not just what you own.</p>
      )}

      <Section title="Styles">
        <div className="card space-y-2.5 p-4">
          {data.types.map(({ t, n, pct }) => (
            <div key={t} className="flex items-center gap-3 text-sm">
              <span className="w-20 text-cream-200">{WINE_TYPE_LABEL[t]}</span>
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-ink-700">
                <div className="h-full rounded-full" style={{ width: `${pct * 100}%`, background: TYPE_COLOR[t] }} />
              </div>
              <span className="w-16 text-right text-xs text-cream-400">
                {Math.round(pct * 100)}% · {n}
              </span>
            </div>
          ))}
        </div>
      </Section>

      <div className="grid gap-x-4 sm:grid-cols-2">
        <RankList title="Grapes" items={byBottles(data.grapes)} />
        <RankList title="Regions" items={byBottles(data.regions)} />
        <RankList title="Countries" items={byBottles(data.countries)} />
        <RankList title="Producers" items={byBottles(data.producers)} />
      </div>

      <Section title="Vintages in cellar">
        <div className="card flex h-32 items-end gap-1 p-4 pt-6">
          {data.vintages.map(([v, n]) => (
            <div key={v} className="flex flex-1 flex-col items-center gap-1" title={`${v}: ${n}`}>
              <span className="text-[10px] text-cream-300">{n}</span>
              <div className="w-full rounded-t bg-wine-500" style={{ height: `${(n / Math.max(...data.vintages.map((x) => x[1]))) * 60}px` }} />
              <span className="text-[10px] text-cream-500">{v === 'NV' ? 'NV' : `'${String(v).slice(2)}`}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Money">
        <div className="card grid grid-cols-3 divide-x divide-ink-700 text-center">
          <div className="p-3">
            <p className="font-display text-xl text-cream-50">{formatMoney(data.stats.value)}</p>
            <p className="text-[11px] text-cream-400 uppercase">in cellar</p>
          </div>
          <div className="p-3">
            <p className="font-display text-xl text-cream-50">{formatMoney(data.stats.avgPrice)}</p>
            <p className="text-[11px] text-cream-400 uppercase">avg bottle</p>
          </div>
          <div className="p-3">
            <p className="font-display text-xl text-cream-50">{data.avg ? data.avg.toFixed(1) : '–'}</p>
            <p className="text-[11px] text-cream-400 uppercase">avg rating</p>
          </div>
        </div>
      </Section>

      <WineList title="Wines you loved (4.5★+)" wines={data.loved} empty="Rate a wine 4.5★ or more and it lands here." />
      <WineList title="Wouldn't buy again" wines={data.notAgain} empty="Nothing here — good sign." />
    </div>
  )
}

function vintageSpread(pairs: (readonly [number | null, number])[]) {
  const m = new Map<string | number, number>()
  for (const [v, n] of pairs) m.set(v ?? 'NV', (m.get(v ?? 'NV') ?? 0) + n)
  return [...m.entries()].sort((a, b) => (a[0] === 'NV' ? 1 : b[0] === 'NV' ? -1 : (a[0] as number) - (b[0] as number)))
}

function RankList({ title, items }: { title: string; items: Ranked[] }) {
  const top = items.slice(0, 5)
  const max = Math.max(1, ...top.map((i) => i.bottles))
  return (
    <Section title={title}>
      <div className="card space-y-2 p-4">
        {top.length === 0 && <p className="text-sm text-cream-500">—</p>}
        {top.map((i) => (
          <div key={i.key} className="text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-cream-100">{i.key}</span>
              <span className="flex shrink-0 items-center gap-2 text-xs text-cream-400">
                {i.avgRating != null && <Stars value={i.avgRating} size={10} />}
                {i.bottles}
              </span>
            </div>
            <div className="mt-1 h-1 rounded-full bg-ink-700">
              <div className="h-full rounded-full bg-cream-300/60" style={{ width: `${(i.bottles / max) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </Section>
  )
}

function WineList({ title, wines, empty }: { title: string; wines: { id: number; type: WineType; producer: string; name: string; vintage: number | null; avgRating?: number }[]; empty: string }) {
  return (
    <Section title={title}>
      <div className="card divide-y divide-ink-700">
        {wines.length === 0 && <p className="p-4 text-sm text-cream-500">{empty}</p>}
        {wines.map((w) => (
          <Link key={w.id} to={`/wine/${w.id}`} className="flex items-center gap-3 p-3 hover:bg-ink-800">
            <Bottle type={w.type} className="h-8 w-3.5" />
            <span className="min-w-0 flex-1 truncate text-sm text-cream-100">
              {w.producer} · {w.name} {w.vintage ?? 'NV'}
            </span>
            <Stars value={w.avgRating} size={11} />
          </Link>
        ))}
      </div>
    </Section>
  )
}

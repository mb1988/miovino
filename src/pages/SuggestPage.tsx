import { MapPin, RefreshCw, Sparkles, Wine as WineIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { locationsOf } from '../components/WineCard'
import { Bottle, Button, Chip, Empty, Label, PageHeader, StatusChip } from '../components/ui'
import { useCellar } from '../lib/hooks'
import { FOODS, type Food } from '../lib/knowledge'
import { suggest, type SuggestOptions } from '../lib/recommend'
import { formatMoney } from '../lib/settings'
import { bottlePrice } from '../lib/stats'
import { drinkStatus } from '../lib/status'
import { WINE_TYPE_LABEL, type WineType } from '../lib/types'

export default function SuggestPage() {
  const cellar = useCellar()
  const [opts, setOpts] = useState<SuggestOptions>({ type: 'any', occasion: 'any', readyOnly: true })
  const [page, setPage] = useState(0)
  const results = useMemo(() => (cellar ? suggest(cellar, opts) : []), [cellar, opts])
  const shown = results.slice(page * 3, page * 3 + 3)
  const up = (p: Partial<SuggestOptions>) => {
    setOpts({ ...opts, ...p })
    setPage(0)
  }
  const types = useMemo(() => [...new Set((cellar ?? []).filter((w) => w.inCellar).map((w) => w.type))], [cellar])

  return (
    <div>
      <PageHeader title="What should I drink?" subtitle="Picks from your own cellar" />

      <div className="card mb-5 space-y-4 p-4">
        <div>
          <Label>Style</Label>
          <div className="flex flex-wrap gap-1.5">
            <Chip active={opts.type === 'any'} onClick={() => up({ type: 'any' })}>
              Any
            </Chip>
            {types.map((t) => (
              <Chip key={t} active={opts.type === t} onClick={() => up({ type: t as WineType })}>
                {WINE_TYPE_LABEL[t]}
              </Chip>
            ))}
          </div>
        </div>
        <div>
          <Label>What are you eating?</Label>
          <input
            className="field mb-2"
            placeholder="e.g. lamb chops, risotto ai funghi, cinghiale…"
            value={opts.dish ?? ''}
            onChange={(e) => up({ dish: e.target.value || undefined })}
          />
          <div className="flex flex-wrap gap-1.5">
            <Chip active={!opts.food} onClick={() => up({ food: undefined })}>
              Nothing / anything
            </Chip>
            {FOODS.map((f) => (
              <Chip key={f} active={opts.food === f} onClick={() => up({ food: opts.food === f ? undefined : (f as Food) })}>
                {f}
              </Chip>
            ))}
          </div>
        </div>
        <div>
          <Label>Occasion</Label>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ['any', 'Any'],
                ['casual', 'Casual'],
                ['special', 'Special'],
              ] as const
            ).map(([k, l]) => (
              <Chip key={k} active={opts.occasion === k} onClick={() => up({ occasion: k })}>
                {l}
              </Chip>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-cream-200">
            <input type="checkbox" className="accent-wine-500" checked={opts.readyOnly} onChange={(e) => up({ readyOnly: e.target.checked })} />
            Ready to drink only
          </label>
          <label className="ml-auto flex items-center gap-2 text-sm text-cream-300">
            Max
            <input
              className="field w-20 py-1.5"
              inputMode="numeric"
              placeholder="any"
              value={opts.maxPrice ?? ''}
              onChange={(e) => up({ maxPrice: e.target.value ? Number(e.target.value) : undefined })}
            />
          </label>
        </div>
      </div>

      {cellar && results.length === 0 ? (
        <Empty icon={<WineIcon size={28} />} title="Nothing fits">
          Try loosening the filters{opts.readyOnly ? ' or include wines not yet ready' : ''}.
        </Empty>
      ) : (
        <div className="space-y-3">
          {shown.map((s, i) => {
            const w = s.wine
            const locs = locationsOf(w)
            return (
              <Link key={w.id} to={`/wine/${w.id}`} className="card animate-rise block p-4 hover:ring-ink-600" style={{ animationDelay: `${i * 60}ms` }}>
                <div className="flex gap-3">
                  <div className="flex flex-col items-center gap-1">
                    <span className="font-display text-2xl text-wine-300">{page * 3 + i + 1}</span>
                    <Bottle type={w.type} className="h-10 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-cream-300">{w.producer}</p>
                    <p className="font-display text-lg leading-snug font-semibold text-cream-50">
                      {w.name} <span className="text-cream-300">{w.vintage ?? 'NV'}</span>
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-cream-400">
                      <StatusChip status={drinkStatus(w)} />
                      <span>
                        {w.inCellar} btl · {formatMoney(bottlePrice(w))}
                      </span>
                      {locs[0] && (
                        <span className="flex items-center gap-1">
                          <MapPin size={12} /> {locs.join(', ')}
                        </span>
                      )}
                    </div>
                    <ul className="mt-3 space-y-1">
                      {s.reasons.slice(0, 4).map((r) => (
                        <li key={r} className="flex gap-2 text-sm text-cream-200">
                          <Sparkles size={14} className="mt-0.5 shrink-0 text-gold-400" /> {r}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </Link>
            )
          })}
          {results.length > 3 && (
            <Button variant="secondary" className="w-full" onClick={() => setPage((p) => ((p + 1) * 3 >= results.length ? 0 : p + 1))}>
              <RefreshCw size={16} /> Show other picks
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

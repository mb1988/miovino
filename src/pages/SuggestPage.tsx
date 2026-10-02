import { MapPin, MessageCircle, ScrollText, RefreshCw, ShoppingBag, Sparkles, Wine as WineIcon } from 'lucide-react'
import { t } from '../lib/i18n'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { locationsOf } from '../components/WineCard'
import { Bottle, Button, Chip, Empty, Label, PageHeader, StatusChip } from '../components/ui'
import { useCellarView } from '../lib/hooks'
import { CellarSwitcher } from '../components/CellarSwitcher'
import { FOODS, type Food } from '../lib/knowledge'
import { suggest, type SuggestOptions } from '../lib/recommend'
import { formatMoney } from '../lib/settings'
import { bottlePrice } from '../lib/stats'
import { drinkStatus } from '../lib/status'
import { WINE_TYPE_LABEL, type WineType } from '../lib/types'

export default function SuggestPage() {
  const { wines: cellar, names, active, setActive } = useCellarView()
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
      <PageHeader title={t('What should I drink?')} subtitle={active ? t('Picks from {cellar}', { cellar: active }) : t('Picks from your own cellar')} />
      <CellarSwitcher names={names} active={active} onChange={setActive} className="mb-3" />

<div className="mb-4 grid gap-2">
      <Link to="/ask" className="card flex items-center gap-3 p-4 hover:ring-ink-600">
        <MessageCircle className="text-gold-400" />
        <span className="flex-1">
          <span className="block font-semibold text-cream-50">{t('Ask my cellar')}</span>
          <span className="text-sm text-cream-400">{t('“What goes with lamb?” — answers from your own bottles')}</span>
        </span>
      </Link>
        <Link to="/winelist" className="card flex items-center gap-3 p-4 hover:ring-ink-600">
          <ScrollText className="text-gold-400" />
          <span className="flex-1">
            <span className="block font-semibold text-cream-50">{t('At a restaurant?')}</span>
            <span className="text-sm text-cream-400">{t('Photograph the wine list — picks for your taste')}</span>
          </span>
        </Link>
        <Link to="/buy" className="card flex items-center gap-3 p-4 hover:ring-ink-600">
          <ShoppingBag className="text-gold-400" />
          <span className="flex-1">
            <span className="block font-semibold text-cream-50">{t('Find a bottle')}</span>
            <span className="text-sm text-cream-400">{t('Where to buy any wine, and at what price')}</span>
          </span>
        </Link>
      </div>

      <div className="card mb-5 space-y-4 p-4">
        <div>
          <Label>{t('Style')}</Label>
          <div className="flex flex-wrap gap-1.5">
            <Chip active={opts.type === 'any'} onClick={() => up({ type: 'any' })}>
              {t('Any')}
            </Chip>
            {types.map((ty) => (
              <Chip key={ty} active={opts.type === ty} onClick={() => up({ type: ty as WineType })}>
                {t(WINE_TYPE_LABEL[ty])}
              </Chip>
            ))}
          </div>
        </div>
        <div>
          <Label>{t('What are you eating?')}</Label>
          <input
            className="field mb-2"
            placeholder={t('e.g. lamb chops, risotto ai funghi, cinghiale…')}
            value={opts.dish ?? ''}
            onChange={(e) => up({ dish: e.target.value || undefined })}
          />
          <div className="flex flex-wrap gap-1.5">
            <Chip active={!opts.food} onClick={() => up({ food: undefined })}>
              {t('Nothing / anything')}
            </Chip>
            {FOODS.map((f) => (
              <Chip key={f} active={opts.food === f} onClick={() => up({ food: opts.food === f ? undefined : (f as Food) })}>
                {t(f)}
              </Chip>
            ))}
          </div>
        </div>
        <div>
          <Label>{t('Occasion')}</Label>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ['any', 'Any'],
                ['casual', 'Casual'],
                ['special', 'Special'],
              ] as const
            ).map(([k, l]) => (
              <Chip key={k} active={opts.occasion === k} onClick={() => up({ occasion: k })}>
                {t(l)}
              </Chip>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex min-h-10 items-center gap-2.5 text-sm text-cream-200">
            <input type="checkbox" className="h-5 w-5 accent-wine-500" checked={opts.readyOnly} onChange={(e) => up({ readyOnly: e.target.checked })} />
            {t('Ready to drink only')}
          </label>
          <label className="ml-auto flex items-center gap-2 text-sm text-cream-300">
            {t('Max')}
            <input
              className="field w-20 py-1.5"
              inputMode="numeric"
              placeholder={t('any')}
              value={opts.maxPrice ?? ''}
              onChange={(e) => up({ maxPrice: e.target.value ? Number(e.target.value) : undefined })}
            />
          </label>
        </div>
      </div>

      {cellar && results.length === 0 ? (
        <Empty icon={<WineIcon size={28} />} title={t('Nothing fits')}>
          {opts.readyOnly ? t('Try loosening the filters or include wines not yet ready.') : t('Try loosening the filters.')}
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
              <RefreshCw size={16} /> {t('Show other picks')}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

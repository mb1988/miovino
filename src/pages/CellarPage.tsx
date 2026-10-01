import { ArrowUpDown, ChevronDown, Camera, FileSpreadsheet, LayoutList, PenLine, Rows3, Search, SlidersHorizontal, Sparkles, Wine as WineIcon, X } from 'lucide-react'
import { plural, t } from '../lib/i18n'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { MonthlyDigest } from '../components/MonthlyDigest'
import { locationsOf, WineCard, WineRow } from '../components/WineCard'
import { Button, Chip, cx, Empty, Sheet } from '../components/ui'
import { useCellarView } from '../lib/hooks'
import { storageKey } from '../lib/demo'
import { CellarSwitcher } from '../components/CellarSwitcher'
import { normalizeText } from '../lib/knowledge'
import { bottlePrice } from '../lib/recommend'
import { formatMoney, useSettings } from '../lib/settings'
import { cellarStats } from '../lib/stats'
import { drinkStatus, STATUS_META, type DrinkStatus } from '../lib/status'
import { WINE_TYPE_LABEL, type WineType, type WineWithBottles } from '../lib/types'

const SORTS = {
  urgency: 'Drink first',
  vintage: 'Vintage (oldest)',
  price: 'Price (highest)',
  producer: 'Producer A–Z',
  rating: 'My rating',
  added: 'Recently added',
} as const
type SortKey = keyof typeof SORTS

const VIEW_KEY = storageKey('miovino.view')
function savedView() {
  try {
    return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'cards'
  } catch {
    return 'cards'
  }
}
function saveView(v: string) {
  try {
    localStorage.setItem(VIEW_KEY, v)
  } catch {
    /* remembered for this visit only */
  }
}

export default function CellarPage() {
  const { wines: cellar, all, names, active, setActive } = useCellarView()
  const settings = useSettings()
  const [params, setParams] = useSearchParams()
  const [filtersOpen, setFiltersOpen] = useState(false)
  const q = params.get('q') ?? ''
  const type = params.get('type') as WineType | null
  const status = params.get('status') as DrinkStatus | null
  const country = params.get('country')
  const region = params.get('region')
  const location = params.get('loc')
  const vintage = params.get('vintage')
  const fav = params.get('fav') === '1'
  const showGone = params.get('gone') === '1'
  const sort = (params.get('sort') as SortKey) ?? 'urgency'
  // Cards or list: the URL wins, else this device's last choice.
  const view = params.get('view') ?? savedView()

  const set = (k: string, v: string | null) => {
    const p = new URLSearchParams(params)
    if (v == null || v === '') p.delete(k)
    else p.set(k, v)
    setParams(p, { replace: true })
  }

  const stats = useMemo(() => (cellar ? cellarStats(cellar) : undefined), [cellar])
  const facets = useMemo(() => {
    const c = new Map<string, number>()
    const r = new Map<string, number>()
    const l = new Map<string, number>()
    const v = new Map<string, number>()
    for (const w of cellar ?? []) {
      if (!w.inCellar) continue
      const vk = w.vintage == null ? 'NV' : String(w.vintage)
      v.set(vk, (v.get(vk) ?? 0) + w.inCellar)
      if (w.country) c.set(w.country, (c.get(w.country) ?? 0) + w.inCellar)
      if (w.region) r.set(w.region, (r.get(w.region) ?? 0) + w.inCellar)
      for (const b of w.bottles) if (b.status === 'cellar' && b.location) l.set(b.location, (l.get(b.location) ?? 0) + 1)
    }
    const sorted = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1])
    const vintages = [...v.entries()].sort((a, b) => (a[0] === 'NV' ? 1 : b[0] === 'NV' ? -1 : Number(a[0]) - Number(b[0])))
    return { countries: sorted(c), regions: sorted(r), locations: sorted(l), vintages }
  }, [cellar])

  const list = useMemo(() => {
    if (!cellar) return []
    const terms = normalizeText(q).split(/\s+/).filter(Boolean)
    const filtered = cellar.filter((w) => {
      if (!showGone && w.inCellar === 0) return false
      if (type && w.type !== type) return false
      if (status && drinkStatus(w) !== status) return false
      if (country && w.country !== country) return false
      if (region && w.region !== region) return false
      if (location && !locationsOf(w).includes(location)) return false
      if (vintage && (w.vintage == null ? 'NV' : String(w.vintage)) !== vintage) return false
      if (fav && !w.favourite) return false
      if (terms.length) {
        const hay = normalizeText(
          [w.producer, w.name, w.vintage ?? 'nv', w.country, w.region, w.appellation, ...w.grapes, ...locationsOf(w), w.personalNotes, ...w.tags].join(' '),
        )
        if (!terms.every((t) => hay.includes(t))) return false
      }
      return true
    })
    return sortWines(filtered, sort)
  }, [cellar, q, type, status, country, region, location, vintage, fav, showGone, sort])

  if (!cellar || !all) return null
  const activeFilters = [type, status, country, region, location, vintage, fav ? '1' : null, showGone ? '1' : null].filter(Boolean).length

  if (all.length === 0) return <Welcome name={settings.cellarName} />

  return (
    <div>
      <header className="pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-wine-300">{t('MioVino')}</p>
        <h1 className="font-display text-3xl font-semibold text-cream-50">{active || (names.length > 1 ? t('All cellars') : settings.cellarName)}</h1>
        <CellarSwitcher names={names} active={active} onChange={(n) => (setActive(n), set('loc', null))} className="mt-3" />
      </header>

      {stats && (
        <div className="card mb-4 overflow-hidden">
          <div className="grid grid-cols-3 divide-x divide-ink-700">
            <Stat value={stats.bottles} label="bottles" />
            <Stat value={formatMoney(stats.value)} label={t('cellar value')} />
            <Stat value={stats.wines} label="wines" />
          </div>
          <div className="flex gap-1.5 overflow-x-auto border-t border-ink-700 px-3 py-3 no-scrollbar">
            {(['past', 'soon', 'ready', 'approaching', 'hold'] as DrinkStatus[])
              .filter((s) => stats.byStatus[s] > 0)
              .map((s) => (
                <button
                  key={s}
                  onClick={() => set('status', status === s ? null : s)}
                  className={cx('flex min-h-8 shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ring-1 transition', status === s ? STATUS_META[s].chip : 'text-cream-300 ring-ink-700 hover:ring-ink-600')}
                >
                  <span className={cx('h-2 w-2 rounded-full', STATUS_META[s].dot)} />
                  <span className="font-semibold text-cream-50">{stats.byStatus[s]}</span> {t(STATUS_META[s].label)}
                </button>
              ))}
          </div>
        </div>
      )}

      <MonthlyDigest cellar={cellar} />

      <Link to="/suggest" className="mb-4 flex items-center gap-3 rounded-2xl bg-gradient-to-r from-wine-700 to-wine-600 p-4 shadow-lg shadow-wine-900/30 transition hover:from-wine-600 hover:to-wine-500">
        <Sparkles className="text-gold-400" />
        <div className="flex-1">
          <p className="font-display text-lg font-semibold text-cream-50">{t('What should I drink tonight?')}</p>
          <p className="text-xs text-cream-200">{t('3 picks from your cellar, with reasons')}</p>
        </div>
      </Link>

      <div className="sticky top-0 z-10 -mx-4 bg-ink-900/90 px-4 pt-[calc(env(safe-area-inset-top)+0.5rem)] pb-2 backdrop-blur-md">
        <div className="flex gap-2">
          <label className="relative flex-1">
            <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-cream-500" />
            <input className="field pl-9" placeholder={t('Search wine, producer, grape, rack…')} value={q} onChange={(e) => set('q', e.target.value)} />
            {q && (
              <button aria-label={t('Clear search')} onClick={() => set('q', null)} className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full p-1 text-cream-400">
                <X size={16} />
              </button>
            )}
          </label>
          <button onClick={() => setFiltersOpen(true)} className="relative min-h-11 min-w-11 rounded-xl bg-ink-800 px-3 text-cream-200 ring-1 ring-ink-600" aria-label={t('Filters')}>
            <SlidersHorizontal size={18} />
            {activeFilters > 0 && <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-wine-500 text-[10px] font-bold">{activeFilters}</span>}
          </button>
          <button
            onClick={() => {
              const next = view === 'cards' ? 'list' : 'cards'
              saveView(next)
              set('view', next)
            }}
            className="min-h-11 min-w-11 rounded-xl bg-ink-800 px-3 text-cream-200 ring-1 ring-ink-600"
            aria-label={view === 'cards' ? t('Show as list') : t('Show as cards')}
          >
            {view === 'cards' ? <LayoutList size={18} /> : <Rows3 size={18} />}
          </button>
        </div>
        <div className="mt-2 flex gap-1.5 overflow-x-auto no-scrollbar">
          <Chip active={!type} onClick={() => set('type', null)}>
            {t('All')}
          </Chip>
          {(Object.keys(stats?.byType ?? {}) as WineType[]).map((ty) => (
            <Chip key={ty} active={type === ty} onClick={() => set('type', type === ty ? null : ty)}>
              {t(WINE_TYPE_LABEL[ty])} <span className="opacity-60">{stats?.byType[ty]}</span>
            </Chip>
          ))}
          <Chip active={fav} onClick={() => set('fav', fav ? null : '1')}>
            {t('♥ Favourites')}
          </Chip>
        </div>
      </div>

      <div className="mt-2 mb-2 flex flex-wrap items-center justify-between gap-x-2 text-xs text-cream-400">
        <span className="whitespace-nowrap">
          {plural(list.length, '{n} wine', '{n} wines')} · {plural(list.reduce((s, w) => s + w.inCellar, 0), '{n} bottle', '{n} bottles')}
        </span>
        <span className="ml-auto flex items-center gap-1 whitespace-nowrap">
        <label className="relative flex min-h-9 items-center gap-1 rounded-full px-2 text-cream-200">
          {vintage ?? t('All vintages')}
          <ChevronDown size={13} className="text-cream-400" aria-hidden />
          {/* Invisible native select on top: the phone's own picker, at 16px so iPhone Safari doesn't zoom. */}
          <select aria-label={t('Vintage')} className="absolute inset-0 cursor-pointer text-base opacity-0" value={vintage ?? ''} onChange={(e) => set('vintage', e.target.value || null)}>
            <option value="">{t('All vintages')}</option>
            {facets.vintages.map(([v, n]) => (
              <option key={v} value={v}>
                {v} ({n})
              </option>
            ))}
          </select>
        </label>
        {/* A visible pill; the native select on top keeps the phone's own picker. */}
        <label className="relative flex min-h-9 items-center gap-1.5 rounded-full bg-ink-800 px-3 py-1.5 font-medium text-cream-100 ring-1 ring-ink-600">
          <ArrowUpDown size={13} className="text-cream-400" />
          {t(SORTS[sort] ?? SORTS.urgency)}
          <select aria-label={t('Sort')} className="absolute inset-0 cursor-pointer text-base opacity-0" value={sort} onChange={(e) => set('sort', e.target.value === 'urgency' ? null : e.target.value)}>
            {Object.entries(SORTS).map(([k, v]) => (
              <option key={k} value={k}>
                {t(v)}
              </option>
            ))}
          </select>
        </label>
        </span>
      </div>

      {list.length === 0 ? (
        <Empty icon={<Search size={28} />} title={t('Nothing matches')}>
          <button className="text-wine-300 underline" onClick={() => setParams({}, { replace: true })}>
            {t('Clear search and filters')}
          </button>
        </Empty>
      ) : view === 'cards' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {list.map((w) => (
            <WineCard key={w.id} wine={w} />
          ))}
        </div>
      ) : (
        <div>
          {list.map((w) => (
            <WineRow key={w.id} wine={w} />
          ))}
        </div>
      )}

      <Sheet open={filtersOpen} onClose={() => setFiltersOpen(false)} title={t('Filters')}>
        <FilterGroup label={t('Drinking status')}>
          {(Object.keys(STATUS_META) as DrinkStatus[]).map((s) => (
            <Chip key={s} active={status === s} onClick={() => set('status', status === s ? null : s)}>
              {t(STATUS_META[s].label)}
            </Chip>
          ))}
        </FilterGroup>
        <FilterGroup label={t('Vintage')}>
          {facets.vintages.map(([v, n]) => (
            <Chip key={v} active={vintage === v} onClick={() => set('vintage', vintage === v ? null : v)}>
              {v} <span className="opacity-60">{n}</span>
            </Chip>
          ))}
        </FilterGroup>
        <FilterGroup label={t('Country')}>
          {facets.countries.map(([c, n]) => (
            <Chip key={c} active={country === c} onClick={() => set('country', country === c ? null : c)}>
              {c} <span className="opacity-60">{n}</span>
            </Chip>
          ))}
        </FilterGroup>
        <FilterGroup label={t('Region')}>
          {facets.regions.map(([r, n]) => (
            <Chip key={r} active={region === r} onClick={() => set('region', region === r ? null : r)}>
              {r} <span className="opacity-60">{n}</span>
            </Chip>
          ))}
        </FilterGroup>
        {facets.locations.length > 0 && (
          <FilterGroup label={t('Location')}>
            {facets.locations.map(([l, n]) => (
              <Chip key={l} active={location === l} onClick={() => set('loc', location === l ? null : l)}>
                {l} <span className="opacity-60">{n}</span>
              </Chip>
            ))}
          </FilterGroup>
        )}
        <FilterGroup label={t('Other')}>
          <Chip active={showGone} onClick={() => set('gone', showGone ? null : '1')}>
            {t('Include finished wines')}
          </Chip>
        </FilterGroup>
        <div className="mt-5 flex gap-2">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => {
              const p = new URLSearchParams()
              if (q) p.set('q', q)
              setParams(p, { replace: true })
            }}
          >
            {t('Reset')}
          </Button>
          <Button className="flex-1" onClick={() => setFiltersOpen(false)}>
            {t('Show {n}', { n: list.length })}
          </Button>
        </div>
      </Sheet>
    </div>
  )
}

function sortWines(list: WineWithBottles[], sort: SortKey) {
  const arr = [...list]
  const urgency = (w: WineWithBottles) => STATUS_META[drinkStatus(w)].order * 10000 + (w.drinkTo ?? 9999)
  switch (sort) {
    case 'urgency':
      return arr.sort((a, b) => urgency(a) - urgency(b))
    case 'vintage':
      return arr.sort((a, b) => (a.vintage ?? 9999) - (b.vintage ?? 9999))
    case 'price':
      return arr.sort((a, b) => (bottlePrice(b) ?? 0) - (bottlePrice(a) ?? 0))
    case 'producer':
      return arr.sort((a, b) => a.producer.localeCompare(b.producer) || (a.vintage ?? 0) - (b.vintage ?? 0))
    case 'rating':
      return arr.sort((a, b) => (b.avgRating ?? -1) - (a.avgRating ?? -1))
    case 'added':
      return arr.sort((a, b) => b.createdAt - a.createdAt)
  }
}

function Stat({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div className="px-3 py-4 text-center">
      <p className="font-display text-2xl font-semibold text-cream-50">{value}</p>
      <p className="text-[11px] tracking-wide text-cream-400 uppercase">{t(label)}</p>
    </div>
  )
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <p className="mb-2 text-xs font-semibold tracking-wide text-cream-400 uppercase">{label}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  )
}

function Welcome({ name }: { name: string }) {
  return (
    <div className="pt-[calc(env(safe-area-inset-top)+2.5rem)]">
      <p className="text-xs font-semibold tracking-[0.2em] text-wine-300 uppercase">{t('MioVino')}</p>
      <h1 className="font-display mt-1 text-4xl font-semibold text-cream-50">{name}</h1>
      <p className="mt-2 text-cream-300">{t('Your private digital wine cellar. Let\'s fill it.')}</p>
      <div className="mt-8 grid gap-3">
        <Link to="/import" className="card flex items-center gap-4 p-5 ring-wine-600 hover:ring-2">
          <span className="rounded-xl bg-wine-600/20 p-3 text-wine-300">
            <FileSpreadsheet />
          </span>
          <span>
            <span className="block font-semibold text-cream-50">{t('Import your spreadsheet')}</span>
            <span className="text-sm text-cream-400">{t('Excel or CSV — columns are mapped automatically')}</span>
          </span>
        </Link>
        <Link to="/add/scan" className="card flex items-center gap-4 p-5 hover:ring-ink-600">
          <span className="rounded-xl bg-ink-700 p-3 text-cream-200">
            <Camera />
          </span>
          <span>
            <span className="block font-semibold text-cream-50">{t('Scan a label')}</span>
            <span className="text-sm text-cream-400">{t('Take a photo, confirm, done')}</span>
          </span>
        </Link>
        <Link to="/add/manual" className="card flex items-center gap-4 p-5 hover:ring-ink-600">
          <span className="rounded-xl bg-ink-700 p-3 text-cream-200">
            <PenLine />
          </span>
          <span>
            <span className="block font-semibold text-cream-50">{t('Add manually')}</span>
            <span className="text-sm text-cream-400">{t('Type in a bottle')}</span>
          </span>
        </Link>
      </div>
      <div className="mt-10 flex justify-center text-ink-600">
        <WineIcon size={48} />
      </div>
    </div>
  )
}

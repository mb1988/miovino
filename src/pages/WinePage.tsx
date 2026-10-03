import { BookOpen, ChevronDown, ExternalLink, Grape, Grid3x3, Share2, Heart, MapPin, Pencil, Plus, Trash2, Utensils, Wine as WineIcon } from 'lucide-react'
import { locale, t } from '../lib/i18n'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Bottle as BottleIcon, Button, cx, Flag, Label, PageHeader, Section, Sheet, Stars, StatusChip, WindowBar } from '../components/ui'
import { addBottles, db, deleteWine, ensureLocation, today, updateWine } from '../lib/db'
import { useBlobUrl, useCellar, useLocations, useWine } from '../lib/hooks'
import { WhereToBuy } from '../components/WhereToBuy'
import { PriceHistory } from '../components/PriceHistory'
import { grapesDisplay } from '../shared/blend'
import { usePriceMemory } from '../lib/priceMemory'
import { classicPairing } from '../lib/pairing'
import { parseWindow } from '../lib/importer'
import { formatMoney } from '../lib/settings'
import { shareWineCard } from '../lib/shareCard'
import { priceChange, signedPct } from '../lib/value'
import { drinkStatus } from '../lib/status'
import { WINE_TYPE_LABEL, type Bottle, type BottleStatus } from '../lib/types'

export default function WinePage() {
  const id = useParams().id!
  const wine = useWine(id)
  const nav = useNavigate()
  const photo = useBlobUrl(wine?.photo)
  const [editing, setEditing] = useState<Bottle | 'new' | null>(null)
  const [notesOpen, setNotesOpen] = useState(false)

  if (wine === undefined) return null
  if (wine === null)
    return (
      <div>
        <PageHeader title={t('Not found')} back />
        <p className="text-cream-400">{t('This wine no longer exists.')}</p>
      </div>
    )

  const status = drinkStatus(wine)
  const cellarBottles = wine.bottles.filter((b) => b.status === 'cellar')
  const change = priceChange(wine)
  const pastBottles = wine.bottles.filter((b) => b.status !== 'cellar')

  return (
    <div>
      <PageHeader
        title=""
        back
        right={
          <div className="flex gap-1">
            <button
              aria-label={wine.favourite ? 'Remove favourite' : 'Add favourite'}
              onClick={() => updateWine(id, { favourite: !wine.favourite })}
              className={cx('rounded-full p-2 hover:bg-ink-800', wine.favourite ? 'text-wine-300' : 'text-cream-300')}
            >
              <Heart size={20} fill={wine.favourite ? 'currentColor' : 'none'} />
            </button>
            <button
              aria-label={t('Share')}
              onClick={() => shareWineCard(wine).catch((e: Error) => alert(e.message))}
              className="rounded-full p-2 text-cream-300 hover:bg-ink-800"
            >
              <Share2 size={20} />
            </button>
            <Link to={`/wine/${id}/edit`} aria-label={t('Edit')} className="rounded-full p-2 text-cream-300 hover:bg-ink-800">
              <Pencil size={20} />
            </Link>
          </div>
        }
      />

      {/* Hero */}
      <div className="mb-5 flex gap-4">
        <div className="flex w-20 shrink-0 items-center justify-center rounded-2xl bg-ink-850 ring-1 ring-ink-700">
          {photo ? <img src={photo} alt="Label" className="h-28 w-20 rounded-2xl object-cover" /> : <BottleIcon type={wine.type} className="h-24 w-9" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-cream-300">{wine.producer}</p>
          <h1 className="font-display text-2xl leading-tight font-semibold text-cream-50">{wine.name}</h1>
          <p className="font-display text-xl text-cream-200">{wine.vintage ?? 'NV'}</p>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-cream-300">
            <span>{t(WINE_TYPE_LABEL[wine.type])}</span>
            {wine.country && (
              <span>
                <Flag country={wine.country} /> {wine.country}
              </span>
            )}
            {wine.region && <span>{wine.region}</span>}
          </div>
        </div>
      </div>

      {wine.needsReview?.length ? (
        <div className="mb-4 rounded-xl bg-amber-400/10 p-3 text-sm text-amber-100 ring-1 ring-amber-400/30">
          <p className="font-medium">{t('Imported with notes to check:')}</p>
          <ul className="mt-1 list-disc pl-5 text-amber-200/90">
            {wine.needsReview.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          <div className="mt-2 flex gap-3">
            <Link to={`/wine/${id}/edit`} className="font-medium text-amber-100 underline">
              {t('Fix now')}
            </Link>
            <button className="text-amber-200/80 underline" onClick={() => updateWine(id, { needsReview: undefined })}>
              {t('Looks fine')}
            </button>
          </div>
        </div>
      ) : null}

      {/* Primary actions */}
      <div className="mb-6 grid grid-cols-2 gap-2">
        <Button disabled={!cellarBottles.length} onClick={() => nav(`/wine/${id}/drink`)}>
          <WineIcon size={18} /> {t('Drink a bottle')}
        </Button>
        <Button variant="secondary" onClick={() => setEditing('new')}>
          <Plus size={18} /> {t('Add bottle')}
        </Button>
      </div>

      <Section title={t('Drinking window')}>
        <div className="card p-4">
          <div className="flex items-center justify-between">
            <StatusChip status={status} />
            <span className="text-sm text-cream-200">
              {wine.drinkFrom ?? '…'} → {wine.drinkTo ?? '…'}
              {wine.peakYear && <span className="text-gold-400"> · {t('peak {year}', { year: wine.peakYear })}</span>}
            </span>
          </div>
          {wine.drinkFrom == null && wine.drinkTo == null ? (
            <p className="mt-3 text-sm text-cream-400">
              {t('No window yet.')}{' '}
              <Link className="text-wine-300 underline" to={`/wine/${id}/edit`}>
                {t('Add one')}
              </Link>{' '}
              {t('or')}{' '}
              <Link className="text-wine-300 underline" to={`/windows?w=${id}`}>
                {t('ask the AI')}
              </Link>
            </p>
          ) : (
            <WindowBar wine={wine} />
          )}
        </div>
      </Section>

      <Section
        title={t('Your bottles · {n}', { n: cellarBottles.length })}
        action={
          cellarBottles.some((b) => b.slot) ? (
            <Link to={`/rack?w=${id}`} className="flex min-h-9 items-center gap-1 text-xs text-wine-300">
              <Grid3x3 size={13} /> {t('Show in rack')}
            </Link>
          ) : cellarBottles.length > 0 ? (
            <Link to={`/rack?place=${id}`} className="flex min-h-9 items-center gap-1 text-xs text-wine-300">
              <Grid3x3 size={13} /> {t('Place in a rack')}
            </Link>
          ) : null
        }
      >
        <div className="card divide-y divide-ink-700">
          {cellarBottles.length === 0 && <p className="p-4 text-sm text-cream-400">{t('None left in the cellar.')}</p>}
          {change && (
            <p className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <span className="text-cream-300">
                {t('Paid {paid} · now {now}', { paid: formatMoney(change.paid), now: formatMoney(change.now) })}
                {wine.marketPriceDate && <span className="text-cream-500"> · {new Date(wine.marketPriceDate).toLocaleDateString(locale(), { month: 'short', year: 'numeric' })}</span>}
              </span>
              <span className={cx('font-semibold tabular-nums', change.diff >= 0 ? 'text-emerald-300' : 'text-rose-300')}>{signedPct(change.pct)}</span>
            </p>
          )}
          {cellarBottles.map((b, i) => (
            <button key={b.id} onClick={() => setEditing(b)} className="flex w-full items-center gap-3 p-3.5 text-left hover:bg-ink-800">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink-700 text-xs font-semibold text-cream-200">#{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-sm text-cream-50">
                  <MapPin size={14} className="text-cream-400" />
                  {b.location || <span className="text-cream-500">{t('No location')}</span>}
                  {b.slot && <span className="rounded bg-ink-700 px-1.5 text-[11px] font-semibold text-cream-200">{b.slot}</span>}
                </p>
                <p className="text-xs text-cream-400">
                  {[b.purchasePrice != null ? formatMoney(b.purchasePrice) : null, b.seller, b.purchaseDate].filter(Boolean).join(' · ') || t('Tap to add details')}
                </p>
              </div>
              <Pencil size={14} className="text-cream-500" />
            </button>
          ))}
        </div>
      </Section>

      <BuyAgain wine={wine} />

      <Section
        title={t('Your notes')}
        action={
          <button className="-my-2 min-h-10 px-2 text-xs text-wine-300" onClick={() => setNotesOpen(true)}>
            {t('Edit')}
          </button>
        }
      >
        <div className="card p-4">
          {wine.avgRating != null && (
            <div className="mb-2 flex items-center gap-2">
              <Stars value={wine.avgRating} size={16} />
              <span className="text-sm text-cream-300">
                {wine.avgRating.toFixed(1)} · {wine.tastings.filter((t) => t.rating != null).length} rating(s)
              </span>
            </div>
          )}
          {wine.personalNotes ? <p className="text-sm whitespace-pre-line text-cream-100">{wine.personalNotes}</p> : <p className="text-sm text-cream-500">{t('No personal notes yet.')}</p>}
        </div>
      </Section>

      <Section title={t('Tasting history · {n}', { n: wine.tastings.length })}>
        {wine.tastings.length === 0 ? (
          <div className="card p-4 text-sm text-cream-400">
            <BookOpen size={16} className="mr-2 inline" />
            {t('When you drink a bottle, your impressions land here.')}
          </div>
        ) : (
          <div className="space-y-2">
            {wine.tastings.map((t) => (
              <div key={t.id} className="card p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-cream-50">{fmtDate(t.date)}</span>
                  <Stars value={t.rating} />
                </div>
                <p className="mt-0.5 text-xs text-cream-400">{[t.occasion, t.company && `with ${t.company}`, t.food && `🍽 ${t.food}`].filter(Boolean).join(' · ')}</p>
                {t.notes && <p className="mt-2 text-sm text-cream-100">“{t.notes}”</p>}
                {t.buyAgain && <p className="mt-2 text-xs text-cream-300">Buy again: {{ yes: '❤️ Yes', maybe: '😐 Maybe', no: '❌ No' }[t.buyAgain]}</p>}
              </div>
            ))}
          </div>
        )}
      </Section>

      <FoodSection wine={wine} />

      <Section title={t('Wine info')}>
        <div className="card divide-y divide-ink-700 text-sm">
          <InfoRow label={t('Appellation')} value={wine.appellation} />
          <InfoRow label={t('Grapes')} value={grapesDisplay(wine.grapes, wine.grapePct).join(', ')} icon={<Grape size={14} />} />
          <InfoRow label={t('Alcohol')} value={wine.alcohol ? `${wine.alcohol}%` : undefined} />
          <InfoRow label={t('Bottle')} value={wine.bottleSize !== 750 ? `${wine.bottleSize} ml` : '750 ml'} />
        </div>
      </Section>

      {wine.external.map((e, i) => (
        <Section key={i} title={`From ${e.source}`}>
          <div className="rounded-2xl border border-dashed border-ink-600 p-4 text-sm">
            <div className="mb-2 flex flex-wrap gap-2 text-xs">
              {e.guideYear && <span className="rounded-full bg-ink-800 px-2 py-0.5 text-cream-200">Edition {e.guideYear}</span>}
              {e.award && <span className="rounded-full bg-ink-800 px-2 py-0.5 text-gold-400">🍇 {e.award}</span>}
              {e.score != null && <span className="rounded-full bg-ink-800 px-2 py-0.5 text-cream-200">{e.score} pts</span>}
            </div>
            {e.pairing && (
              <p className="mb-2 text-cream-200">
                <span className="text-cream-400">{t('Pairing:')} </span>
                {e.pairing}
              </p>
            )}
            {e.window && (
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="text-cream-400">{t('Drinking window:')}</span>
                <span className="font-medium text-cream-50">{e.window}</span>
                {(() => {
                  const w = parseWindow(e.window.split('/')[0])
                  if (w.from == null || (w.from === wine.drinkFrom && w.to === wine.drinkTo)) return null
                  return (
                    <button
                      className="rounded-full bg-ink-800 px-2.5 py-0.5 text-xs text-wine-300 ring-1 ring-ink-600"
                      onClick={() => {
                        if (confirm(`Replace your window ${wine.drinkFrom ?? '…'}–${wine.drinkTo ?? '…'} with ${w.from}–${w.to ?? '…'}?`))
                          updateWine(id, { drinkFrom: w.from, drinkTo: w.to ?? wine.drinkTo, needsReview: undefined })
                      }}
                    >
                      Use {w.from}–{w.to ?? '…'}
                    </button>
                  )
                })()}
              </div>
            )}
            {e.description && <p className="leading-relaxed text-cream-300 italic">{e.description}</p>}
            {e.note && <p className="mt-2 text-xs text-cream-400">{e.note}</p>}
            {e.url && (
              <a href={e.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-wine-300 underline">
                {t('Source')} <ExternalLink size={12} />
              </a>
            )}
          </div>
        </Section>
      ))}

      {pastBottles.length > 0 && (
        <Section title={t('Past bottles')}>
          <div className="card divide-y divide-ink-700 text-sm">
            {pastBottles.map((b) => (
              <div key={b.id} className="flex items-center justify-between p-3 text-cream-300">
                <span className="capitalize">{b.status}</span>
                <span className="text-xs">{b.consumedAt ? fmtDate(b.consumedAt) : ''}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      <div className="mt-8 flex justify-center">
        <button
          className="flex min-h-11 items-center gap-2 px-3 text-sm text-rose-300/80 hover:text-rose-300"
          onClick={async () => {
            if (confirm(`Delete ${wine.producer} ${wine.name} ${wine.vintage ?? 'NV'} with all its bottles and tastings?`)) {
              await deleteWine(id)
              nav('/', { replace: true })
            }
          }}
        >
          <Trash2 size={16} /> {t('Delete wine')}
        </button>
      </div>

      <BottleSheet wineId={id} bottle={editing} onClose={() => setEditing(null)} />
      <NotesSheet key={String(notesOpen)} open={notesOpen} initial={wine.personalNotes ?? ''} onClose={() => setNotesOpen(false)} onSave={(n) => updateWine(id, { personalNotes: n || undefined })} />
    </div>
  )
}

function FoodSection({ wine }: { wine: Parameters<typeof classicPairing>[0] & { external: { source: string; pairing?: string }[] } }) {
  const guide = wine.external.filter((e) => e.pairing)
  const classic = classicPairing(wine)
  if (!guide.length && !classic) return null
  return (
    <Section title={t('What to eat with it')}>
      <div className="card space-y-3 p-4 text-sm">
        {guide.map((e) => (
          <p key={e.source} className="flex gap-2 text-cream-50">
            <Utensils size={16} className="mt-0.5 shrink-0 text-gold-400" />
            <span>
              {e.pairing} <span className="text-xs text-cream-400">— {e.source}</span>
            </span>
          </p>
        ))}
        {classic && (
          <div>
            <p className="mb-2 text-xs text-cream-400">Classic pairings for {classic.basis}</p>
            <div className="flex flex-wrap gap-1.5">
              {classic.dishes.map((d) => (
                <span key={d} className="rounded-full bg-ink-800 px-2.5 py-1 text-xs text-cream-200 ring-1 ring-ink-600">
                  {d}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </Section>
  )
}

function InfoRow({ label, value, icon }: { label: string; value?: string; icon?: React.ReactNode }) {
  if (!value) return null
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3">
      <span className="flex items-center gap-1.5 text-cream-400">
        {icon}
        {label}
      </span>
      <span className="text-right text-cream-100">{value}</span>
    </div>
  )
}

export function fmtDate(d: string) {
  const dt = new Date(d + 'T12:00:00')
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

function NotesSheet({ open, initial, onClose, onSave }: { open: boolean; initial: string; onClose: () => void; onSave: (n: string) => void }) {
  const [text, setText] = useState(initial)
  return (
    <Sheet open={open} onClose={onClose} title={t('Your notes')}>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} className="field" placeholder={t('Anything worth remembering about this wine…')} />
      <Button
        className="mt-4 w-full"
        onClick={() => {
          onSave(text.trim())
          onClose()
        }}
      >
        {t('Save')}
      </Button>
    </Sheet>
  )
}

function BottleSheet({ wineId, bottle, onClose }: { wineId: string; bottle: Bottle | 'new' | null; onClose: () => void }) {
  const locations = useLocations()
  const isNew = bottle === 'new'
  const b = bottle && bottle !== 'new' ? bottle : undefined
  const [form, setForm] = useState<{ count: number; location: string; price: string; date: string; seller: string; status: BottleStatus }>()
  const key = bottle === null ? 'closed' : isNew ? 'new' : String(b?.id)
  const [formKey, setFormKey] = useState(key)
  if (formKey !== key) {
    setFormKey(key)
    setForm(undefined)
  }
  const f = form ?? {
    count: 1,
    location: b?.location ?? '',
    price: b?.purchasePrice?.toString() ?? '',
    date: b?.purchaseDate ?? (isNew ? today() : ''),
    seller: b?.seller ?? '',
    status: b?.status ?? 'cellar',
  }
  const up = (patch: Partial<typeof f>) => setForm({ ...f, ...patch })

  const save = async () => {
    const data = {
      location: f.location.trim() || undefined,
      purchasePrice: f.price ? Number(f.price.replace(',', '.')) : undefined,
      purchaseDate: f.date || undefined,
      seller: f.seller.trim() || undefined,
    }
    if (isNew) await addBottles(wineId, Math.max(1, f.count), data)
    else if (b) {
      const keepSlot = f.status === 'cellar' && data.location === b.location
      await db.bottles.update(b.id!, { ...data, status: f.status, consumedAt: f.status !== 'cellar' ? b.consumedAt ?? today() : undefined, slot: keepSlot ? b.slot : undefined })
      if (data.location) await ensureLocation(data.location)
    }
    onClose()
  }

  return (
    <Sheet open={bottle !== null} onClose={onClose} title={isNew ? t('Add bottles') : t('Bottle details')}>
      <div className="space-y-4">
        {isNew && (
          <label className="block">
            <Label>{t('How many')}</Label>
            <div className="flex items-center gap-3">
              <Button variant="secondary" onClick={() => up({ count: Math.max(1, f.count - 1) })}>
                −
              </Button>
              <span className="w-8 text-center text-xl font-semibold">{f.count}</span>
              <Button variant="secondary" onClick={() => up({ count: f.count + 1 })}>
                +
              </Button>
            </div>
          </label>
        )}
        <label className="block">
          <Label>{t('Location')}</Label>
          <input className="field" list="locations" value={f.location} onChange={(e) => up({ location: e.target.value })} placeholder={t('e.g. Rack A / Shelf 2')} />
          <datalist id="locations">{locations?.map((l) => <option key={l.id} value={l.name} />)}</datalist>
          {locations && locations.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {locations.map((l) => (
                <button key={l.id} type="button" onClick={() => up({ location: l.name })} className={cx('rounded-full px-2.5 py-1 text-xs ring-1', f.location === l.name ? 'bg-cream-100 text-ink-900 ring-cream-100' : 'text-cream-300 ring-ink-600')}>
                  {l.name}
                </button>
              ))}
            </div>
          )}
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <Label>{t('Price')}</Label>
            <input className="field" inputMode="decimal" value={f.price} onChange={(e) => up({ price: e.target.value })} placeholder="0" />
          </label>
          <label className="block">
            <Label>{t('Purchase date')}</Label>
            <input className="field" type="date" value={f.date} onChange={(e) => up({ date: e.target.value })} />
          </label>
        </div>
        <label className="block">
          <Label>{t('Bought from')}</Label>
          <input className="field" value={f.seller} onChange={(e) => up({ seller: e.target.value })} placeholder={t('Wine shop, winery, gift…')} />
        </label>
        {!isNew && (
          <label className="block">
            <Label>{t('Status')}</Label>
            <select className="field" value={f.status} onChange={(e) => up({ status: e.target.value as BottleStatus })}>
              <option value="cellar">{t('In cellar')}</option>
              <option value="drunk">{t('Drunk')}</option>
              <option value="gifted">{t('Gifted')}</option>
              <option value="lost">{t('Lost / broken')}</option>
            </select>
          </label>
        )}
        <Button className="w-full" onClick={save}>
          {isNew ? `Add ${f.count} bottle${f.count > 1 ? 's' : ''}` : 'Save'}
        </Button>
        {b?.status === 'cellar' && b.location && (
          <Link to={`/rack?b=${b.id}`} className="flex w-full items-center justify-center gap-1.5 py-2 text-sm text-wine-300">
            <Grid3x3 size={15} /> {b.slot ? t('Show slot {slot} in the rack map', { slot: b.slot }) : t('Place in the rack map')}
          </Link>
        )}
        {b && (
          <button
            className="w-full py-2 text-sm text-rose-300/80"
            onClick={async () => {
              if (confirm('Remove this bottle record entirely?')) {
                await db.bottles.delete(b.id!)
                onClose()
              }
            }}
          >
            {t('Remove bottle record')}
          </button>
        )}
      </div>
    </Sheet>
  )
}

/** "Buy again": where you bought it, live UK prices and the AI's typical price — the hint is cached on the wine. */
function BuyAgain({ wine }: { wine: NonNullable<ReturnType<typeof useWine>> }) {
  const cellar = useCellar()
  const [open, setOpen] = useState(false)
  const me = useMemo(() => (open ? [{ id: wine.id, producer: wine.producer, name: wine.name, vintage: wine.vintage }] : undefined), [open, wine.id, wine.producer, wine.name, wine.vintage])
  // Reloads after the AI price is asked for, so the new point shows up.
  const { prices, reload } = usePriceMemory(me)
  return (
    <Section title={t('Buy again')}>
      <div className="card">
        <button
          aria-expanded={open}
          aria-controls="buy-again"
          onClick={() => setOpen(!open)}
          className="flex min-h-11 w-full items-center gap-2 px-3.5 text-left text-sm text-cream-100"
        >
          <span className="flex-1">{t('Where to buy and at what price')}</span>
          <ChevronDown size={16} className={cx('text-cream-400 transition-transform', open && 'rotate-180')} aria-hidden />
        </button>
        {open && cellar && (
          <div id="buy-again">
            <WhereToBuy
              item={{ ...wine, wineId: wine.id }}
              cellar={cellar}
              saveHint={async (priceHint) => {
                await db.wines.update(wine.id, { priceHint })
                await reload()
              }}
            />
            {prices[wine.id] && (
              <div className="px-3.5 pb-3.5">
                <PriceHistory points={prices[wine.id]} />
              </div>
            )}
          </div>
        )}
      </div>
    </Section>
  )
}

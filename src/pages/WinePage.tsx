import { BookOpen, Grape, Heart, MapPin, Pencil, Plus, Trash2, Wine as WineIcon } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Bottle as BottleIcon, Button, cx, Flag, Label, PageHeader, Section, Sheet, Stars, StatusChip, WindowBar } from '../components/ui'
import { addBottles, db, deleteWine, ensureLocation, today, updateWine } from '../lib/db'
import { useBlobUrl, useLocations, useWine } from '../lib/hooks'
import { formatMoney } from '../lib/settings'
import { drinkStatus } from '../lib/status'
import { WINE_TYPE_LABEL, type Bottle, type BottleStatus } from '../lib/types'

export default function WinePage() {
  const id = Number(useParams().id)
  const wine = useWine(id)
  const nav = useNavigate()
  const photo = useBlobUrl(wine?.photo)
  const [editing, setEditing] = useState<Bottle | 'new' | null>(null)
  const [notesOpen, setNotesOpen] = useState(false)

  if (wine === undefined) return null
  if (wine === null)
    return (
      <div>
        <PageHeader title="Not found" back />
        <p className="text-cream-400">This wine no longer exists.</p>
      </div>
    )

  const status = drinkStatus(wine)
  const cellarBottles = wine.bottles.filter((b) => b.status === 'cellar')
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
            <Link to={`/wine/${id}/edit`} aria-label="Edit" className="rounded-full p-2 text-cream-300 hover:bg-ink-800">
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
            <span>{WINE_TYPE_LABEL[wine.type]}</span>
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
          <p className="font-medium">Imported with notes to check:</p>
          <ul className="mt-1 list-disc pl-5 text-amber-200/90">
            {wine.needsReview.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          <div className="mt-2 flex gap-3">
            <Link to={`/wine/${id}/edit`} className="font-medium text-amber-100 underline">
              Fix now
            </Link>
            <button className="text-amber-200/80 underline" onClick={() => updateWine(id, { needsReview: undefined })}>
              Looks fine
            </button>
          </div>
        </div>
      ) : null}

      {/* Primary actions */}
      <div className="mb-6 grid grid-cols-2 gap-2">
        <Button disabled={!cellarBottles.length} onClick={() => nav(`/wine/${id}/drink`)}>
          <WineIcon size={18} /> Drink a bottle
        </Button>
        <Button variant="secondary" onClick={() => setEditing('new')}>
          <Plus size={18} /> Add bottle
        </Button>
      </div>

      <Section title="Drinking window">
        <div className="card p-4">
          <div className="flex items-center justify-between">
            <StatusChip status={status} />
            <span className="text-sm text-cream-200">
              {wine.drinkFrom ?? '…'} → {wine.drinkTo ?? '…'}
              {wine.peakYear && <span className="text-gold-400"> · peak {wine.peakYear}</span>}
            </span>
          </div>
          {wine.drinkFrom == null && wine.drinkTo == null ? (
            <p className="mt-3 text-sm text-cream-400">
              No window yet.{' '}
              <Link className="text-wine-300 underline" to={`/wine/${id}/edit`}>
                Add one
              </Link>
            </p>
          ) : (
            <WindowBar wine={wine} />
          )}
        </div>
      </Section>

      <Section title={`Your bottles · ${cellarBottles.length}`}>
        <div className="card divide-y divide-ink-700">
          {cellarBottles.length === 0 && <p className="p-4 text-sm text-cream-400">None left in the cellar.</p>}
          {cellarBottles.map((b, i) => (
            <button key={b.id} onClick={() => setEditing(b)} className="flex w-full items-center gap-3 p-3.5 text-left hover:bg-ink-800">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink-700 text-xs font-semibold text-cream-200">#{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-sm text-cream-50">
                  <MapPin size={14} className="text-cream-400" />
                  {b.location || <span className="text-cream-500">No location</span>}
                </p>
                <p className="text-xs text-cream-400">
                  {[b.purchasePrice != null ? formatMoney(b.purchasePrice) : null, b.seller, b.purchaseDate].filter(Boolean).join(' · ') || 'Tap to add details'}
                </p>
              </div>
              <Pencil size={14} className="text-cream-500" />
            </button>
          ))}
        </div>
      </Section>

      <Section
        title="Your notes"
        action={
          <button className="text-xs text-wine-300" onClick={() => setNotesOpen(true)}>
            Edit
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
          {wine.personalNotes ? <p className="text-sm whitespace-pre-line text-cream-100">{wine.personalNotes}</p> : <p className="text-sm text-cream-500">No personal notes yet.</p>}
        </div>
      </Section>

      <Section title={`Tasting history · ${wine.tastings.length}`}>
        {wine.tastings.length === 0 ? (
          <div className="card p-4 text-sm text-cream-400">
            <BookOpen size={16} className="mr-2 inline" />
            When you drink a bottle, your impressions land here.
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

      <Section title="Wine info">
        <div className="card divide-y divide-ink-700 text-sm">
          <InfoRow label="Appellation" value={wine.appellation} />
          <InfoRow label="Grapes" value={wine.grapes.join(', ')} icon={<Grape size={14} />} />
          <InfoRow label="Alcohol" value={wine.alcohol ? `${wine.alcohol}%` : undefined} />
          <InfoRow label="Bottle" value={wine.bottleSize !== 750 ? `${wine.bottleSize} ml` : '750 ml'} />
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
                <span className="text-cream-400">Pairing: </span>
                {e.pairing}
              </p>
            )}
            {e.description && <p className="leading-relaxed text-cream-300 italic">{e.description}</p>}
          </div>
        </Section>
      ))}

      {pastBottles.length > 0 && (
        <Section title="Past bottles">
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
          className="flex items-center gap-2 text-sm text-rose-300/80 hover:text-rose-300"
          onClick={async () => {
            if (confirm(`Delete ${wine.producer} ${wine.name} ${wine.vintage ?? 'NV'} with all its bottles and tastings?`)) {
              await deleteWine(id)
              nav('/', { replace: true })
            }
          }}
        >
          <Trash2 size={16} /> Delete wine
        </button>
      </div>

      <BottleSheet wineId={id} bottle={editing} onClose={() => setEditing(null)} />
      <NotesSheet key={String(notesOpen)} open={notesOpen} initial={wine.personalNotes ?? ''} onClose={() => setNotesOpen(false)} onSave={(n) => updateWine(id, { personalNotes: n || undefined })} />
    </div>
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
    <Sheet open={open} onClose={onClose} title="Your notes">
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} className="field" placeholder="Anything worth remembering about this wine…" />
      <Button
        className="mt-4 w-full"
        onClick={() => {
          onSave(text.trim())
          onClose()
        }}
      >
        Save
      </Button>
    </Sheet>
  )
}

function BottleSheet({ wineId, bottle, onClose }: { wineId: number; bottle: Bottle | 'new' | null; onClose: () => void }) {
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
      await db.bottles.update(b.id!, { ...data, status: f.status, consumedAt: f.status !== 'cellar' ? b.consumedAt ?? today() : undefined })
      if (data.location) await ensureLocation(data.location)
    }
    onClose()
  }

  return (
    <Sheet open={bottle !== null} onClose={onClose} title={isNew ? 'Add bottles' : 'Bottle details'}>
      <div className="space-y-4">
        {isNew && (
          <label className="block">
            <Label>How many</Label>
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
          <Label>Location</Label>
          <input className="field" list="locations" value={f.location} onChange={(e) => up({ location: e.target.value })} placeholder="e.g. Rack A / Shelf 2" />
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
            <Label>Price</Label>
            <input className="field" inputMode="decimal" value={f.price} onChange={(e) => up({ price: e.target.value })} placeholder="0" />
          </label>
          <label className="block">
            <Label>Purchase date</Label>
            <input className="field" type="date" value={f.date} onChange={(e) => up({ date: e.target.value })} />
          </label>
        </div>
        <label className="block">
          <Label>Bought from</Label>
          <input className="field" value={f.seller} onChange={(e) => up({ seller: e.target.value })} placeholder="Wine shop, winery, gift…" />
        </label>
        {!isNew && (
          <label className="block">
            <Label>Status</Label>
            <select className="field" value={f.status} onChange={(e) => up({ status: e.target.value as BottleStatus })}>
              <option value="cellar">In cellar</option>
              <option value="drunk">Drunk</option>
              <option value="gifted">Gifted</option>
              <option value="lost">Lost / broken</option>
            </select>
          </label>
        )}
        <Button className="w-full" onClick={save}>
          {isNew ? `Add ${f.count} bottle${f.count > 1 ? 's' : ''}` : 'Save'}
        </Button>
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
            Remove bottle record
          </button>
        )}
      </div>
    </Sheet>
  )
}

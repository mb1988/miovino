import { Camera, ImagePlus, Loader2, ScanLine, Trash2, Wand2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { LiveCamera } from '../components/LiveCamera'
import { Button, Chip, cx, Label, PageHeader, Section } from '../components/ui'
import { addWineWithBottles, db, today, updateWine } from '../lib/db'
import { useBlobUrl, useLocations } from '../lib/hooks'
import { tidyName } from '../lib/importer'
import { enrich } from '../lib/knowledge'
import { imageToBase64 } from '../lib/image'
import { useSettings } from '../lib/settings'
import type { LabelResult } from '../lib/scanner'
import { WINE_TYPE_LABEL, WINE_TYPES, type ExternalInfo, type Wine, type WineType } from '../lib/types'

export interface WineDraft {
  producer: string
  name: string
  vintage: string // '' | 'NV' | '2019'
  type: WineType
  country: string
  region: string
  appellation: string
  grapes: string
  alcohol: string
  bottleSize: string
  drinkFrom: string
  drinkTo: string
  peakYear: string
  personalNotes: string
  external: ExternalInfo[]
  photo?: Blob
}

/** State passed by the scanner via navigate(..., { state }). */
export interface AddState {
  draft?: Partial<WineDraft>
  confidence?: string
}

/** Scanner result → form draft (used by the Scan page and by "Scan label" while editing). */
export function labelToDraft(r: LabelResult, thumb: Blob): AddState {
  return {
    confidence: r.confidence,
    draft: {
      producer: r.producer,
      name: r.name,
      vintage: r.vintage == null ? 'NV' : String(r.vintage),
      type: r.type,
      country: r.country ?? '',
      region: r.region ?? '',
      appellation: r.appellation ?? '',
      grapes: r.grapes.join(', '),
      alcohol: r.alcohol?.toString() ?? '',
      bottleSize: String(r.bottleSizeMl ?? 750),
      drinkFrom: r.drinkFrom?.toString() ?? '',
      drinkTo: r.drinkTo?.toString() ?? '',
      external: r.tastingNote || r.pairing ? [{ source: 'AI (label scan)', description: r.tastingNote ?? undefined, pairing: r.pairing ?? undefined }] : [],
      photo: thumb,
    },
  }
}

const EMPTY: WineDraft = {
  producer: '',
  name: '',
  vintage: '',
  type: 'red',
  country: '',
  region: '',
  appellation: '',
  grapes: '',
  alcohol: '',
  bottleSize: '750',
  drinkFrom: '',
  drinkTo: '',
  peakYear: '',
  personalNotes: '',
  external: [],
}

function fromWine(w: Wine): WineDraft {
  return {
    producer: w.producer,
    name: w.name,
    vintage: w.vintage == null ? 'NV' : String(w.vintage),
    type: w.type,
    country: w.country ?? '',
    region: w.region ?? '',
    appellation: w.appellation ?? '',
    grapes: w.grapes.join(', '),
    alcohol: w.alcohol?.toString() ?? '',
    bottleSize: String(w.bottleSize),
    drinkFrom: w.drinkFrom?.toString() ?? '',
    drinkTo: w.drinkTo?.toString() ?? '',
    peakYear: w.peakYear?.toString() ?? '',
    personalNotes: w.personalNotes ?? '',
    external: w.external,
    photo: w.photo,
  }
}

const int = (s: string) => {
  const n = parseInt(s, 10)
  return isNaN(n) ? undefined : n
}
const num = (s: string) => {
  const n = parseFloat(s.replace(',', '.'))
  return isNaN(n) ? undefined : n
}

export default function EditWinePage() {
  const params = useParams()
  const editId = params.id ? Number(params.id) : undefined
  const nav = useNavigate()
  const state = (useLocation().state ?? {}) as AddState
  const locations = useLocations()
  const [draft, setDraft] = useState<WineDraft>(() => ({ ...EMPTY, ...state.draft }))
  const [loaded, setLoaded] = useState(editId == null)
  const [bottles, setBottles] = useState({ count: 1, location: '', price: '', date: today(), seller: '' })
  const [error, setError] = useState('')
  const photoUrl = useBlobUrl(draft.photo)
  const fileRef = useRef<HTMLInputElement>(null)
  const settings = useSettings()
  const [camera, setCamera] = useState<'photo' | 'scan' | null>(null)
  const [scanMsg, setScanMsg] = useState('')
  const [scanning, setScanning] = useState(false)

  /** Reads the label and fills only the fields that are still empty — never overwrites what you typed. */
  const scanInto = async (photo: Blob) => {
    setScanning(true)
    setScanMsg('')
    try {
      const { scanLabel } = await import('../lib/scanner')
      const { result, thumbnail } = await scanLabel(photo)
      if (!result.isWineLabel) return setScanMsg("That doesn't look like a wine label.")
      const found = labelToDraft(result, thumbnail).draft!
      const filled: string[] = []
      setDraft((d) => {
        const next = { ...d }
        for (const k of ['producer', 'name', 'vintage', 'country', 'region', 'appellation', 'grapes', 'alcohol', 'drinkFrom', 'drinkTo'] as const) {
          if (!String(d[k] ?? '').trim() && found[k]) {
            next[k] = found[k] as string
            filled.push(k)
          }
        }
        if (!d.photo) next.photo = thumbnail
        const ai = found.external ?? []
        if (ai.length && !d.external.some((e) => e.source === ai[0].source)) next.external = [...d.external, ...ai]
        return next
      })
      setScanMsg(filled.length ? `Filled from label: ${filled.join(', ')}. Nothing you typed was changed.` : 'Label read — all fields were already filled, nothing changed.')
    } catch (e) {
      setScanMsg((e as Error).message)
    } finally {
      setScanning(false)
    }
  }

  useEffect(() => {
    if (editId == null) return
    db.wines.get(editId).then((w) => {
      if (w) setDraft(fromWine(w))
      setLoaded(true)
    })
  }, [editId])

  const up = (patch: Partial<WineDraft>) => setDraft((d) => ({ ...d, ...patch }))
  const guess = enrich(draft.producer, `${draft.name} ${draft.appellation}`)
  const canAutofill = guess && (!draft.country || !draft.region || !draft.grapes)

  const save = async () => {
    if (!draft.producer.trim() && !draft.name.trim()) return setError('Give it at least a producer or a name.')
    const vintage = draft.vintage.trim().toUpperCase() === 'NV' || draft.vintage.trim() === '' ? null : int(draft.vintage) ?? null
    const wine = {
      producer: tidyName(draft.producer),
      name: draft.name.trim(),
      vintage,
      type: draft.type,
      country: draft.country.trim() || undefined,
      region: draft.region.trim() || undefined,
      appellation: draft.appellation.trim() || undefined,
      grapes: draft.grapes.split(',').map((g) => g.trim()).filter(Boolean),
      alcohol: num(draft.alcohol),
      bottleSize: int(draft.bottleSize) ?? 750,
      drinkFrom: int(draft.drinkFrom),
      drinkTo: int(draft.drinkTo),
      peakYear: int(draft.peakYear),
      personalNotes: draft.personalNotes.trim() || undefined,
      external: draft.external,
      photo: draft.photo,
    }
    if (editId != null) {
      await updateWine(editId, { ...wine, needsReview: undefined })
      nav(`/wine/${editId}`, { replace: true })
    } else {
      const id = await addWineWithBottles({ ...wine, favourite: false, tags: [] }, Math.max(0, bottles.count), {
        location: bottles.location.trim() || undefined,
        purchasePrice: num(bottles.price),
        purchaseDate: bottles.date || undefined,
        seller: bottles.seller.trim() || undefined,
      })
      nav(`/wine/${id}`, { replace: true })
    }
  }

  const pickPhoto = async (f?: Blob) => {
    if (!f) return
    const { blob } = await imageToBase64(f, 600)
    up({ photo: blob })
  }

  if (!loaded) return null
  const isScan = !!state.draft

  return (
    <div>
      <PageHeader title={editId != null ? 'Edit wine' : isScan ? 'Is this your wine?' : 'Add wine'} subtitle={isScan ? 'Check what the scanner read, fix anything, save.' : undefined} back />

      {isScan && state.confidence === 'low' && (
        <div className="mb-4 rounded-xl bg-amber-400/10 p-3 text-sm text-amber-100 ring-1 ring-amber-400/30">The label was hard to read — double-check the fields below.</div>
      )}

      <div className="mb-5 flex items-center gap-4">
        <button type="button" onClick={() => setCamera('photo')} className="flex h-24 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-ink-850 text-cream-400 ring-1 ring-ink-700">
          {photoUrl ? <img src={photoUrl} alt="Label" className="h-full w-full object-cover" /> : <ImagePlus />}
        </button>
        <div className="min-w-0 text-sm text-cream-400">
          <p>Bottle photo</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => setCamera('photo')}>
              <Camera size={14} /> {photoUrl ? 'Retake' : 'Take photo'}
            </Button>
            <Button
              variant="secondary"
              className="px-3 py-1.5 text-xs"
              disabled={scanning || !settings.apiKey}
              title={settings.apiKey ? 'Read the label and fill empty fields' : 'Add an API key in Settings to scan'}
              onClick={() => setCamera('scan')}
            >
              {scanning ? <Loader2 size={14} className="animate-spin" /> : <ScanLine size={14} />} Scan label
            </Button>
            {photoUrl && (
              <Button variant="ghost" className="px-3 py-1.5 text-xs" aria-label="Remove photo" onClick={() => up({ photo: undefined })}>
                <Trash2 size={14} />
              </Button>
            )}
          </div>
        </div>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => pickPhoto(e.target.files?.[0])} />
      </div>
      {scanMsg && <p className="mb-4 rounded-xl bg-ink-850 p-3 text-sm text-cream-200 ring-1 ring-ink-700">{scanMsg}</p>}
      <LiveCamera
        open={camera !== null}
        hint={camera === 'scan' ? 'Front label — the app fills empty fields' : 'Take a photo of the bottle'}
        onClose={() => setCamera(null)}
        onCapture={(b) => (camera === 'scan' ? scanInto(b) : pickPhoto(b))}
      />

      <Section title="The wine">
        <div className="space-y-3">
          <Field label="Producer" value={draft.producer} onChange={(v) => up({ producer: v })} placeholder="e.g. Giacomo Fenocchio" />
          <Field label="Wine" value={draft.name} onChange={(v) => up({ name: v })} placeholder="e.g. Barolo Villero" />
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <Label>Vintage</Label>
              <select className="field" value={draft.vintage.trim().toUpperCase() === 'NV' ? 'NV' : draft.vintage} onChange={(e) => up({ vintage: e.target.value })}>
                <option value="">Select…</option>
                <option value="NV">NV (non-vintage)</option>
                {Array.from({ length: new Date().getFullYear() - 1949 }, (_, i) => String(new Date().getFullYear() - i)).map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
                {/^\d{4}$/.test(draft.vintage) && Number(draft.vintage) < 1950 && <option value={draft.vintage}>{draft.vintage}</option>}
              </select>
            </label>
            <label className="block">
              <Label>Type</Label>
              <select className="field" value={draft.type} onChange={(e) => up({ type: e.target.value as WineType })}>
                {WINE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {WINE_TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </Section>

      <Section title="Drinking window" className="mb-6">
        <div className="grid grid-cols-3 gap-3">
          <Field label="From" value={draft.drinkFrom} onChange={(v) => up({ drinkFrom: v })} placeholder="2026" inputMode="numeric" />
          <Field label="Until" value={draft.drinkTo} onChange={(v) => up({ drinkTo: v })} placeholder="2035" inputMode="numeric" />
          <Field label="Peak" value={draft.peakYear} onChange={(v) => up({ peakYear: v })} placeholder="2030" inputMode="numeric" />
        </div>
        <p className="mt-2 text-xs text-cream-500">Your call — estimates from guides or the scanner are only a starting point.</p>
      </Section>

      <Section
        title="Origin"
        action={
          canAutofill ? (
            <button
              className="flex items-center gap-1 text-xs text-wine-300"
              onClick={() =>
                up({
                  country: draft.country || guess!.country,
                  region: draft.region || guess!.region,
                  appellation: draft.appellation || guess!.appellation || '',
                  grapes: draft.grapes || guess!.grapes.join(', '),
                })
              }
            >
              <Wand2 size={14} /> Auto-fill ({guess!.region})
            </button>
          ) : null
        }
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Country" value={draft.country} onChange={(v) => up({ country: v })} placeholder="Italy" />
            <Field label="Region" value={draft.region} onChange={(v) => up({ region: v })} placeholder="Piedmont" />
          </div>
          <Field label="Appellation" value={draft.appellation} onChange={(v) => up({ appellation: v })} placeholder="Barolo DOCG" />
          <Field label="Grapes" hint="comma separated" value={draft.grapes} onChange={(v) => up({ grapes: v })} placeholder="Nebbiolo" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Alcohol %" value={draft.alcohol} onChange={(v) => up({ alcohol: v })} placeholder="14.5" inputMode="decimal" />
            <label className="block">
              <Label>Bottle</Label>
              <select className="field" value={draft.bottleSize} onChange={(e) => up({ bottleSize: e.target.value })}>
                {[['375', 'Half 375 ml'], ['500', '500 ml'], ['750', 'Standard 750 ml'], ['1500', 'Magnum 1.5 L'], ['3000', 'Double magnum 3 L']].map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
                {!['375', '500', '750', '1500', '3000'].includes(draft.bottleSize) && <option value={draft.bottleSize}>{draft.bottleSize} ml</option>}
              </select>
            </label>
          </div>
        </div>
      </Section>

      {editId == null && (
        <Section title="Bottles">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Button variant="secondary" onClick={() => setBottles((b) => ({ ...b, count: Math.max(1, b.count - 1) }))}>
                −
              </Button>
              <span className="w-10 text-center text-2xl font-semibold">{bottles.count}</span>
              <Button variant="secondary" onClick={() => setBottles((b) => ({ ...b, count: b.count + 1 }))}>
                +
              </Button>
              <span className="text-sm text-cream-400">bottle{bottles.count > 1 ? 's' : ''}</span>
            </div>
            <label className="block">
              <Label>Location</Label>
              <input className="field" list="loc-list" value={bottles.location} onChange={(e) => setBottles((b) => ({ ...b, location: e.target.value }))} placeholder="e.g. Rack A / Shelf 2" />
              <datalist id="loc-list">{locations?.map((l) => <option key={l.id} value={l.name} />)}</datalist>
              {!!locations?.length && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {locations.map((l) => (
                    <Chip key={l.id} active={bottles.location === l.name} onClick={() => setBottles((b) => ({ ...b, location: l.name }))}>
                      {l.name}
                    </Chip>
                  ))}
                </div>
              )}
            </label>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Price / bottle" value={bottles.price} onChange={(v) => setBottles((b) => ({ ...b, price: v }))} placeholder="0" inputMode="decimal" />
              <label className="block">
                <Label>Purchased</Label>
                <input type="date" className="field" value={bottles.date} onChange={(e) => setBottles((b) => ({ ...b, date: e.target.value }))} />
              </label>
            </div>
            <Field label="Bought from" value={bottles.seller} onChange={(v) => setBottles((b) => ({ ...b, seller: v }))} placeholder="Shop, winery, gift…" />
          </div>
        </Section>
      )}

      <Section title="Your notes">
        <textarea className="field" rows={3} value={draft.personalNotes} onChange={(e) => up({ personalNotes: e.target.value })} placeholder="Why you bought it, who recommended it…" />
      </Section>

      {draft.external.length > 0 && (
        <Section title="External info (kept separately)">
          {draft.external.map((e, i) => (
            <div key={i} className="mb-2 rounded-xl border border-dashed border-ink-600 p-3 text-xs text-cream-300">
              <div className="flex items-center justify-between">
                <span className="font-medium text-cream-200">{e.source}</span>
                <button className="text-rose-300/80" onClick={() => up({ external: draft.external.filter((_, j) => j !== i) })}>
                  Remove
                </button>
              </div>
              {e.pairing && <p className="mt-1">Pairing: {e.pairing}</p>}
              {e.description && <p className="mt-1 line-clamp-3 italic">{e.description}</p>}
            </div>
          ))}
        </Section>
      )}

      {error && <p className="mb-3 text-sm text-rose-300">{error}</p>}
      <div className="pb-[max(env(safe-area-inset-bottom),0.75rem)] sticky bottom-0 -mx-4 bg-gradient-to-t from-ink-900 via-ink-900 to-transparent px-4 pt-6">
        <Button className={cx('w-full py-3.5 text-base')} onClick={save}>
          {editId != null ? 'Save changes' : `Add to cellar`}
        </Button>
      </div>
    </div>
  )
}

function Field({ label, hint, value, onChange, placeholder, inputMode }: { label: string; hint?: string; value: string; onChange: (v: string) => void; placeholder?: string; inputMode?: 'numeric' | 'decimal' }) {
  return (
    <label className="block">
      <Label hint={hint}>{label}</Label>
      <input className="field" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} inputMode={inputMode} />
    </label>
  )
}

import { AlertTriangle, Check, FileSpreadsheet, Loader2 } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bottle, Button, cx, PageHeader, Section } from '../components/ui'
import { db, ensureLocation, now } from '../lib/db'
import { useCellar } from '../lib/hooks'
import { guessMapping, IMPORT_FIELDS, normalizeRow, readSpreadsheet, sameWineKey, type ImportField } from '../lib/importer'
import { WINE_TYPE_LABEL, type Wine } from '../lib/types'

type Sheet = { fileName: string; headers: string[]; rows: Record<string, unknown>[] }

export default function ImportPage() {
  const cellar = useCellar()
  const nav = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const [sheet, setSheet] = useState<Sheet>()
  const [mapping, setMapping] = useState<Record<string, ImportField | ''>>({})
  const [step, setStep] = useState<'pick' | 'map' | 'preview' | 'done'>('pick')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [excluded, setExcluded] = useState<Set<number>>(new Set())
  const [result, setResult] = useState({ wines: 0, bottles: 0, merged: 0 })
  const [onlyIssues, setOnlyIssues] = useState(false)

  const guideName = useMemo(() => (sheet?.headers.some((h) => /vitae/i.test(h)) ? 'Vitae (AIS)' : sheet?.headers.some((h) => /gambero/i.test(h)) ? 'Gambero Rosso' : 'Guide'), [sheet])
  const parsed = useMemo(() => (sheet ? sheet.rows.map((r, i) => normalizeRow(r, mapping, i + 2, guideName)).filter((p) => !p.skip) : []), [sheet, mapping, guideName])
  const existingKeys = useMemo(() => new Map((cellar ?? []).map((w) => [sameWineKey(w), w.id])), [cellar])

  const onFile = async (f?: File) => {
    if (!f) return
    setError('')
    try {
      const { headers, rows } = await readSpreadsheet(f)
      if (!headers.length) throw new Error('No header row found in the first sheet.')
      setSheet({ fileName: f.name, headers, rows })
      setMapping(guessMapping(headers))
      setExcluded(new Set())
      setStep('map')
    } catch (e) {
      setError(`Could not read that file: ${(e as Error).message}`)
    }
  }

  const doImport = async () => {
    setBusy(true)
    let wines = 0
    let bottles = 0
    let merged = 0
    await db.transaction('rw', db.wines, db.bottles, db.tastings, db.locations, async () => {
      for (const p of parsed) {
        if (excluded.has(p.rowNumber)) continue
        const ts = now()
        let wineId = existingKeys.get(sameWineKey(p.wine))
        if (wineId != null) merged++
        else {
          wineId = (await db.wines.add({ ...p.wine, createdAt: ts, updatedAt: ts } as Wine)) as number
          wines++
        }
        const rows = Array.from({ length: p.quantity }, () => ({ wineId: wineId!, status: 'cellar' as const, ...p.bottle, createdAt: ts }))
        await db.bottles.bulkAdd(rows)
        bottles += rows.length
        if (p.bottle.location) await ensureLocation(p.bottle.location)
        if (p.rating != null) await db.tastings.add({ wineId, date: new Date().toISOString().slice(0, 10), rating: p.rating, notes: 'Imported rating', createdAt: ts })
      }
    })
    setResult({ wines, bottles, merged })
    setBusy(false)
    setStep('done')
  }

  const issues = parsed.filter((p) => p.wine.needsReview)
  const selected = parsed.filter((p) => !excluded.has(p.rowNumber))

  return (
    <div>
      <PageHeader title="Import spreadsheet" subtitle={sheet?.fileName} back />

      {step === 'pick' && (
        <div>
          <p className="mb-4 text-sm text-cream-300">Excel (.xlsx/.xls) or CSV. The first row must be the column headers. Italian and English headers are recognised automatically (Produttore, Vino, Anno, Tipo, Prezzo, Qty, Best to Drink, Vitae…).</p>
          <button onClick={() => fileRef.current?.click()} className="flex w-full flex-col items-center rounded-3xl border-2 border-dashed border-ink-600 bg-ink-850 px-6 py-12 text-cream-300 hover:border-wine-500">
            <FileSpreadsheet size={40} className="mb-3 text-wine-300" />
            <span className="font-medium text-cream-50">Choose a file</span>
            <span className="text-sm">e.g. Wine.xlsx</span>
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.ods" hidden onChange={(e) => onFile(e.target.files?.[0])} />
          {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}
        </div>
      )}

      {step === 'map' && sheet && (
        <div>
          <p className="mb-4 text-sm text-cream-300">
            Found <span className="font-semibold text-cream-50">{parsed.length} wines</span> in {sheet.rows.length} rows. Check how columns map to the app:
          </p>
          <div className="card divide-y divide-ink-700">
            {sheet.headers.map((h) => (
              <div key={h} className="flex items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-cream-50">{h}</p>
                  <p className="truncate text-xs text-cream-500">{sampleOf(sheet.rows, h)}</p>
                </div>
                <select
                  className={cx('field w-40 shrink-0 py-2 text-xs', !mapping[h] && 'text-cream-500')}
                  value={mapping[h] ?? ''}
                  onChange={(e) => setMapping({ ...mapping, [h]: e.target.value as ImportField | '' })}
                >
                  <option value="">— ignore —</option>
                  {Object.entries(IMPORT_FIELDS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <div className="mt-5 flex gap-2">
            <Button variant="secondary" onClick={() => setStep('pick')}>
              Back
            </Button>
            <Button className="flex-1" onClick={() => setStep('preview')} disabled={!Object.values(mapping).includes('producer') && !Object.values(mapping).includes('name')}>
              Preview {parsed.length} wines
            </Button>
          </div>
        </div>
      )}

      {step === 'preview' && (
        <div>
          <div className="card mb-4 grid grid-cols-3 divide-x divide-ink-700 text-center">
            <Mini value={parsed.length} label="wines" />
            <Mini value={parsed.length - issues.length} label="ready" tone="text-emerald-300" />
            <Mini value={issues.length} label="to review" tone={issues.length ? 'text-amber-300' : undefined} />
          </div>
          <p className="mb-3 text-xs text-cream-400">
            Country, region and grapes are filled in from the appellation where possible. Rows with notes still import — you can fix them later from the wine page. Untick anything you don't want.
          </p>
          <div className="mb-3 flex items-center justify-between text-xs">
            <button className={cx('rounded-full px-3 py-1 ring-1', onlyIssues ? 'bg-cream-100 text-ink-900 ring-cream-100' : 'text-cream-300 ring-ink-600')} onClick={() => setOnlyIssues(!onlyIssues)}>
              Only rows to review
            </button>
            <span className="text-cream-400">{selected.reduce((s, p) => s + p.quantity, 0)} bottles selected</span>
          </div>
          <Section title="Wines">
            <div className="card divide-y divide-ink-700">
              {parsed
                .filter((p) => !onlyIssues || p.wine.needsReview)
                .map((p) => {
                  const on = !excluded.has(p.rowNumber)
                  const dup = existingKeys.has(sameWineKey(p.wine))
                  return (
                    <label key={p.rowNumber} className={cx('flex cursor-pointer gap-3 px-4 py-3', !on && 'opacity-40')}>
                      <input
                        type="checkbox"
                        className="mt-1 accent-wine-500"
                        checked={on}
                        onChange={() => {
                          const s = new Set(excluded)
                          if (on) s.add(p.rowNumber)
                          else s.delete(p.rowNumber)
                          setExcluded(s)
                        }}
                      />
                      <Bottle type={p.wine.type} className="mt-0.5 h-9 w-4 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-cream-50">
                          {p.wine.producer} · {p.wine.name} <span className="text-cream-300">{p.wine.vintage ?? 'NV'}</span>
                        </p>
                        <p className="text-xs text-cream-400">
                          {[WINE_TYPE_LABEL[p.wine.type], p.wine.region, p.wine.grapes.join(', '), p.wine.drinkFrom || p.wine.drinkTo ? `${p.wine.drinkFrom ?? '…'}–${p.wine.drinkTo ?? '…'}` : null, `×${p.quantity}`]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                        {dup && <p className="mt-1 text-xs text-sky-300">Already in cellar — bottles will be added to it</p>}
                        {p.warnings.map((w) => (
                          <p key={w} className={cx('mt-1 flex items-center gap-1 text-xs', p.wine.needsReview?.includes(w) ? 'text-amber-300' : 'text-cream-500')}>
                            <AlertTriangle size={12} /> {w}
                          </p>
                        ))}
                      </div>
                    </label>
                  )
                })}
            </div>
          </Section>
          <div className="pb-[max(env(safe-area-inset-bottom),0.75rem)] sticky bottom-0 -mx-4 flex gap-2 bg-gradient-to-t from-ink-900 via-ink-900 to-transparent px-4 pt-6">
            <Button variant="secondary" onClick={() => setStep('map')}>
              Mapping
            </Button>
            <Button className="flex-1 py-3.5" onClick={doImport} disabled={busy || selected.length === 0}>
              {busy ? <Loader2 className="animate-spin" size={18} /> : null} Import {selected.length} wines
            </Button>
          </div>
        </div>
      )}

      {step === 'done' && (
        <div className="flex flex-col items-center pt-10 text-center">
          <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-300">
            <Check size={32} />
          </span>
          <p className="font-display text-2xl text-cream-50">Imported!</p>
          <p className="mt-2 text-cream-300">
            {result.wines} new wines · {result.bottles} bottles
            {result.merged ? ` · ${result.merged} merged into existing wines` : ''}
          </p>
          <Button className="mt-8 w-full max-w-xs" onClick={() => nav('/', { replace: true })}>
            Open my cellar
          </Button>
        </div>
      )}
    </div>
  )
}

function sampleOf(rows: Record<string, unknown>[], h: string) {
  const vals = rows.map((r) => r[h]).filter((v) => v != null && v !== '').slice(0, 3)
  return vals.map((v) => String(v).slice(0, 30)).join(' · ') || 'empty'
}

function Mini({ value, label, tone }: { value: number; label: string; tone?: string }) {
  return (
    <div className="py-3">
      <p className={cx('font-display text-2xl font-semibold', tone ?? 'text-cream-50')}>{value}</p>
      <p className="text-[11px] text-cream-400 uppercase">{label}</p>
    </div>
  )
}

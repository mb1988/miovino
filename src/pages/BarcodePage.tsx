import { Camera, PenLine, Plus, ScanBarcode, Search, Wine as WineIcon } from 'lucide-react'
import { t } from '../lib/i18n'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BarcodeScanner } from '../components/BarcodeScanner'
import { Bottle, Button, PageHeader } from '../components/ui'
import { findByBarcode } from '../lib/barcode'
import { addBottles, updateWine } from '../lib/db'
import { useCellar } from '../lib/hooks'
import type { WineWithBottles } from '../lib/types'

/** Scan a bottle's barcode: known → +1 bottle / drink in one tap; new → read the label or link it to a wine you have. */
export default function BarcodePage() {
  const cellar = useCellar()
  const nav = useNavigate()
  const [scanning, setScanning] = useState(true)
  const [code, setCode] = useState<string>()
  const [linking, setLinking] = useState(false)
  const [q, setQ] = useState('')

  const matches = code && cellar ? findByBarcode(cellar, code) : []
  const onDetected = (c: string) => {
    setCode(c)
    setScanning(false)
    setLinking(false)
  }

  return (
    <div>
      <PageHeader title={t('Scan barcode')} back />
      {/* Mounted fresh each time so the camera state starts clean. */}
      {scanning && <BarcodeScanner open onClose={() => (code ? setScanning(false) : nav(-1))} onDetected={onDetected} />}

      {!scanning && !code && (
        <Button className="w-full" onClick={() => setScanning(true)}>
          <ScanBarcode size={18} /> {t('Open the scanner')}
        </Button>
      )}

      {code && (
        <>
          <p className="mb-4 text-sm text-cream-400">
            {t('Barcode')} <span className="font-mono tracking-wider text-cream-100">{code}</span>
          </p>

          {matches.length > 0 ? (
            <div className="space-y-2">
              {matches.map((w) => (
                <MatchCard key={w.id} wine={w} onAdd={async () => (await addBottles(w.id, 1), nav(`/wine/${w.id}`, { replace: true }))} onDrink={() => nav(`/wine/${w.id}/drink`, { replace: true })} />
              ))}
            </div>
          ) : linking ? (
            <LinkPicker
              cellar={cellar ?? []}
              q={q}
              setQ={setQ}
              onPick={async (w) => {
                await updateWine(w.id, { barcode: code })
                setLinking(false)
              }}
            />
          ) : (
            <div className="space-y-2">
              <p className="mb-3 font-display text-xl text-cream-50">{t('A new bottle')}</p>
              <Button className="w-full" onClick={() => nav('/add/scan', { state: { barcode: code }, replace: true })}>
                <Camera size={18} /> {t('Scan the front label')}
              </Button>
              <Button variant="secondary" className="w-full" onClick={() => nav('/add/manual', { state: { draft: { barcode: code } }, replace: true })}>
                <PenLine size={18} /> {t('Add manually')}
              </Button>
              <Button variant="ghost" className="w-full" onClick={() => setLinking(true)}>
                {t('It’s a wine I already have')}
              </Button>
            </div>
          )}

          <button className="mt-6 w-full py-2 text-sm text-cream-400" onClick={() => setScanning(true)}>
            {t('Scan another')}
          </button>
        </>
      )}
    </div>
  )
}

function MatchCard({ wine: w, onAdd, onDrink }: { wine: WineWithBottles; onAdd: () => void; onDrink: () => void }) {
  return (
    <div className="card flex items-center gap-3 p-4">
      <Bottle type={w.type} className="h-10 w-4" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-cream-50">
          {w.producer} · {w.name} {w.vintage ?? 'NV'}
        </p>
        <p className="text-xs text-cream-400">{w.inCellar} in cellar</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Button className="px-3 py-1.5 text-xs" onClick={onAdd}>
          <Plus size={14} /> {t('Bottle')}
        </Button>
        {w.inCellar > 0 && (
          <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={onDrink}>
            <WineIcon size={14} /> {t('Drink')}
          </Button>
        )}
      </div>
    </div>
  )
}

function LinkPicker({ cellar, q, setQ, onPick }: { cellar: WineWithBottles[]; q: string; setQ: (q: string) => void; onPick: (w: WineWithBottles) => void }) {
  const needle = q.trim().toLowerCase()
  const list = cellar
    .filter((w) => !needle || `${w.producer} ${w.name} ${w.vintage ?? 'nv'}`.toLowerCase().includes(needle))
    .sort((a, b) => a.producer.localeCompare(b.producer))
    .slice(0, 30)
  return (
    <div>
      <p className="mb-2 text-sm text-cream-300">{t('Which wine is it? Next time this barcode finds it straight away.')}</p>
      <div className="relative mb-3">
        <Search size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-cream-500" />
        <input autoFocus className="field pl-9" placeholder={t('Search your wines')} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="card divide-y divide-ink-700">
        {list.map((w) => (
          <button key={w.id} onClick={() => onPick(w)} className="flex w-full items-center gap-3 p-3 text-left hover:bg-ink-800">
            <Bottle type={w.type} className="h-8 w-3.5" />
            <span className="min-w-0 flex-1 truncate text-sm text-cream-100">
              {w.producer} {w.name} {w.vintage ?? 'NV'}
            </span>
            {w.barcode && <span className="text-[10px] text-cream-500">{t('has a barcode')}</span>}
          </button>
        ))}
      </div>
    </div>
  )
}

import { Camera, ImageUp, KeyRound, Loader2, Plus, Wine as WineIcon } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Bottle, Button, PageHeader } from '../components/ui'
import { addBottles } from '../lib/db'
import { useCellar } from '../lib/hooks'
import { matchCellar } from '../lib/match'
import type { LabelResult } from '../lib/scanner'
import { useSettings } from '../lib/settings'
import type { WineWithBottles } from '../lib/types'
import { labelToDraft } from './EditWinePage'
import { LiveCamera } from '../components/LiveCamera'

type Phase = { k: 'idle' } | { k: 'reading'; preview: string } | { k: 'error'; msg: string; preview?: string } | { k: 'matched'; result: LabelResult; thumb: Blob; matches: WineWithBottles[]; preview: string }

export default function ScanPage() {
  const settings = useSettings()
  const cellar = useCellar()
  const nav = useNavigate()
  const [camOpen, setCamOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [phase, setPhase] = useState<Phase>({ k: 'idle' })

  const onFile = async (f?: Blob) => {
    if (!f) return
    const preview = URL.createObjectURL(f)
    setPhase({ k: 'reading', preview })
    try {
      const { scanLabel } = await import('../lib/scanner')
      const { result, thumbnail } = await scanLabel(f)
      if (!result.isWineLabel) return setPhase({ k: 'error', msg: "That doesn't look like a wine label. Try again with the front label filling the frame.", preview })
      const matches = matchCellar(cellar ?? [], result)
      if (matches.length) setPhase({ k: 'matched', result, thumb: thumbnail, matches, preview })
      else nav('/add/manual', { state: labelToDraft(result, thumbnail), replace: true })
    } catch (e) {
      setPhase({ k: 'error', msg: (e as Error).name === 'ScanError' ? (e as Error).message : `Something went wrong: ${(e as Error).message}`, preview })
    }
  }

  return (
    <div>
      <PageHeader title="Scan label" back />
      <LiveCamera open={camOpen} onClose={() => setCamOpen(false)} onCapture={onFile} />
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files?.[0])} />

      {!settings.apiKey && (
        <div className="card mb-5 p-4 text-sm">
          <p className="flex items-center gap-2 font-medium text-cream-50">
            <KeyRound size={16} /> Scanner needs an Anthropic API key
          </p>
          <p className="mt-1 text-cream-400">The photo is read by Claude (vision). The key stays on this device only.</p>
          <Link to="/more#ai" className="mt-3 inline-block text-wine-300 underline">
            Add key in Settings
          </Link>
        </div>
      )}

      {phase.k === 'idle' && (
        <div className="flex flex-col items-center">
          <div className="relative mt-4 mb-8 flex aspect-[3/4] w-full max-w-xs items-center justify-center rounded-3xl border-2 border-dashed border-ink-600 bg-ink-850">
            <div className="absolute inset-8 rounded-2xl border border-cream-500/30" />
            <div className="text-center text-cream-400">
              <Camera size={40} className="mx-auto mb-3 text-cream-300" />
              <p className="px-6 text-sm">Fill the frame with the front label, in good light.</p>
            </div>
          </div>
          <div className="grid w-full max-w-xs gap-2">
            <Button className="py-3.5 text-base" disabled={!settings.apiKey} onClick={() => setCamOpen(true)}>
              <Camera size={20} /> Take photo
            </Button>
            <Button variant="secondary" disabled={!settings.apiKey} onClick={() => fileRef.current?.click()}>
              <ImageUp size={18} /> Choose from library
            </Button>
            <Link to="/add/manual" className="mt-2 text-center text-sm text-cream-400 underline">
              Add manually instead
            </Link>
          </div>
        </div>
      )}

      {phase.k === 'reading' && (
        <div className="flex flex-col items-center pt-4">
          <img src={phase.preview} alt="" className="mb-6 max-h-80 rounded-2xl object-contain opacity-70" />
          <p className="flex items-center gap-2 text-cream-200">
            <Loader2 className="animate-spin" size={18} /> Reading the label…
          </p>
          <p className="mt-1 text-xs text-cream-500">Usually takes a few seconds</p>
        </div>
      )}

      {phase.k === 'error' && (
        <div className="flex flex-col items-center pt-4 text-center">
          {phase.preview && <img src={phase.preview} alt="" className="mb-6 max-h-60 rounded-2xl object-contain opacity-60" />}
          <p className="mb-5 text-rose-200">{phase.msg}</p>
          <div className="grid w-full max-w-xs gap-2">
            <Button onClick={() => setCamOpen(true)}>
              <Camera size={18} /> Try again
            </Button>
            <Button variant="secondary" onClick={() => nav('/add/manual', { replace: true })}>
              Add manually
            </Button>
          </div>
        </div>
      )}

      {phase.k === 'matched' && (
        <div>
          <p className="mb-1 font-display text-xl text-cream-50">Already in your cellar?</p>
          <p className="mb-4 text-sm text-cream-400">
            The label reads <span className="text-cream-100">{phase.result.producer} {phase.result.name} {phase.result.vintage ?? 'NV'}</span>.
          </p>
          <div className="space-y-2">
            {phase.matches.map((w) => (
              <div key={w.id} className="card flex items-center gap-3 p-4">
                <Bottle type={w.type} className="h-10 w-4" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-cream-50">
                    {w.producer} · {w.name} {w.vintage ?? 'NV'}
                  </p>
                  <p className="text-xs text-cream-400">{w.inCellar} in cellar</p>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Button
                    className="px-3 py-1.5 text-xs"
                    onClick={async () => {
                      await addBottles(w.id, 1)
                      nav(`/wine/${w.id}`, { replace: true })
                    }}
                  >
                    <Plus size={14} /> Bottle
                  </Button>
                  {w.inCellar > 0 && (
                    <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => nav(`/wine/${w.id}/drink`, { replace: true })}>
                      <WineIcon size={14} /> Drink
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <Button variant="secondary" className="mt-4 w-full" onClick={() => nav('/add/manual', { state: labelToDraft(phase.result, phase.thumb), replace: true })}>
            No — it's a different wine
          </Button>
        </div>
      )}
    </div>
  )
}

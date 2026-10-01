import { FlaskConical, Info, LogOut, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { exitDemo } from '../lib/demo'
import { t } from '../lib/i18n'
import { Button, Sheet } from './ui'
import { DemoAbout } from './DemoAbout'

const SEEN = 'miovino.demo.about-seen'

function firstVisit() {
  try {
    if (localStorage.getItem(SEEN)) return false
    localStorage.setItem(SEEN, '1')
    return true
  } catch {
    return false
  }
}

/** Shown on every screen in demo mode: says the data is made up, with About, Reset and Exit. */
export function DemoBanner() {
  const [busy, setBusy] = useState(false)
  // Visitors (e.g. from a CV link) get the short intro once.
  const [about, setAbout] = useState(firstVisit)
  const reset = async () => {
    if (!confirm(t('Put the demo cellar back as it was? Your changes in the demo will be lost.'))) return
    setBusy(true)
    const { seedDemo } = await import('../lib/demoApi')
    await seedDemo(true)
    try {
      localStorage.removeItem('miovino.demo.ask')
    } catch {
      /* no stored chat */
    }
    window.location.assign('/')
  }
  const btn = 'flex min-h-9 items-center gap-1 rounded-lg px-2 font-medium hover:bg-gold-400/15'
  return (
    <>
      <div role="note" className="-mx-4 flex items-center gap-1 bg-gold-400/15 px-4 pt-[calc(env(safe-area-inset-top)+0.5rem)] pb-2 text-xs text-cream-100 ring-1 ring-gold-400/30">
        <FlaskConical size={16} className="mr-1 shrink-0 text-gold-400" aria-hidden />
        <p className="min-w-0 flex-1 leading-snug">
          <strong className="font-semibold">{t('Demo')}</strong> · {t('sample data')}
        </p>
        <button onClick={() => setAbout(true)} className={btn}>
          <Info size={14} aria-hidden /> {t('About')}
        </button>
        <button onClick={reset} disabled={busy} className={btn}>
          <RotateCcw size={14} aria-hidden /> {t('Reset')}
        </button>
        <button onClick={exitDemo} className={btn}>
          <LogOut size={14} aria-hidden /> {t('Exit')}
        </button>
      </div>
      <Sheet open={about} onClose={() => setAbout(false)} title={t('About MioVino')}>
        <div className="space-y-4">
          <DemoAbout onPick={() => setAbout(false)} />
          <Button className="w-full" onClick={() => setAbout(false)}>
            {t('Start exploring')}
          </Button>
        </div>
      </Sheet>
    </>
  )
}

import { FlaskConical, LogOut, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { exitDemo } from '../lib/demo'
import { t } from '../lib/i18n'

/** Shown on every screen in demo mode: says the data is made up, with Reset and Exit. */
export function DemoBanner() {
  const [busy, setBusy] = useState(false)
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
  return (
    <div role="note" className="-mx-4 flex items-center gap-2 bg-gold-400/15 px-4 pt-[calc(env(safe-area-inset-top)+0.5rem)] pb-2 text-xs text-cream-100 ring-1 ring-gold-400/30">
      <FlaskConical size={16} className="shrink-0 text-gold-400" aria-hidden />
      <p className="min-w-0 flex-1 leading-snug">
        <strong className="font-semibold">{t('Demo')}</strong> · {t('sample wines, kept in this browser only')}
      </p>
      <button onClick={reset} disabled={busy} className="flex min-h-9 items-center gap-1 rounded-lg px-2 font-medium hover:bg-gold-400/15">
        <RotateCcw size={14} aria-hidden /> {t('Reset')}
      </button>
      <button onClick={exitDemo} className="flex min-h-9 items-center gap-1 rounded-lg px-2 font-medium hover:bg-gold-400/15">
        <LogOut size={14} aria-hidden /> {t('Exit')}
      </button>
    </div>
  )
}

import { FlaskConical, Info, LogOut, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { exitDemo } from '../lib/demo'
import { t } from '../lib/i18n'
import { Button, Sheet } from './ui'

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
          <strong className="font-semibold">{t('Demo')}</strong> · {t('sample wines, kept in this browser only')}
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
        <div className="space-y-4 text-sm leading-relaxed text-cream-200">
          <p>{t('A private wine-cellar app, built as a personal project and used every day for a real cellar. This demo runs on made-up wines, entirely in your browser: change anything, nothing is sent anywhere.')}</p>
          <ul className="list-disc space-y-1.5 pl-5 text-cream-300">
            <li>{t('Offline-first PWA: the cellar lives on the phone (IndexedDB) and syncs to a Cloudflare Worker with a D1 database.')}</li>
            <li>{t('Passkey sign-in (Face ID / fingerprint), no passwords.')}</li>
            <li>{t('AI label scanner, “Ask my cellar” chat and a restaurant wine-list reader, on free AI models with automatic fallback.')}</li>
            <li>{t('Rack map with slot suggestions, drinking windows, monthly push reminders, several cellars.')}</li>
            <li>{t('English and Italian, accessibility-checked, end-to-end tests in CI, preview deploy for every change.')}</li>
          </ul>
          <p className="text-xs text-cream-400">React · TypeScript · Vite · Tailwind · Dexie · Cloudflare Workers · D1 · Web Push · Vitest · Playwright</p>
          <p className="font-medium text-cream-100">{t('Things to try:')}</p>
          <div className="flex flex-wrap gap-2">
            <Link to="/rack" onClick={() => setAbout(false)} className="rounded-full bg-ink-800 px-3 py-2 text-xs text-cream-100 ring-1 ring-ink-600">
              {t('Rack map')}
            </Link>
            <Link to="/suggest" onClick={() => setAbout(false)} className="rounded-full bg-ink-800 px-3 py-2 text-xs text-cream-100 ring-1 ring-ink-600">
              {t('What should I drink?')}
            </Link>
            <Link to="/ask" onClick={() => setAbout(false)} className="rounded-full bg-ink-800 px-3 py-2 text-xs text-cream-100 ring-1 ring-ink-600">
              {t('Ask my cellar')}
            </Link>
            <Link to="/taste" onClick={() => setAbout(false)} className="rounded-full bg-ink-800 px-3 py-2 text-xs text-cream-100 ring-1 ring-ink-600">
              {t('Your Wine DNA')}
            </Link>
          </div>
          <Button className="w-full" onClick={() => setAbout(false)}>
            {t('Start exploring')}
          </Button>
        </div>
      </Sheet>
    </>
  )
}

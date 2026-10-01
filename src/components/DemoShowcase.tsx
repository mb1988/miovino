import { LogOut, Maximize2 } from 'lucide-react'
import { useRef } from 'react'
import { exitDemo } from '../lib/demo'
import { t } from '../lib/i18n'
import { DemoAbout } from './DemoAbout'
import { Button } from './ui'

const FULL = 'miovino.demo.full'

/**
 * The demo on a wide screen (e.g. opened from a CV on a laptop): what MioVino is on the left,
 * the real app running in a phone frame on the right. The frame is an iframe of the app itself,
 * so everything inside behaves exactly as on a phone.
 */
export function showcaseWanted() {
  try {
    if (window.top !== window || sessionStorage.getItem(FULL)) return false
  } catch {
    return false
  }
  return window.matchMedia('(min-width: 1024px)').matches
}

export function DemoShowcase() {
  const frame = useRef<HTMLIFrameElement>(null)
  // The intro is already on screen here; don't pop the About sheet inside the phone too.
  try {
    localStorage.setItem('miovino.demo.about-seen', '1')
  } catch {
    /* no storage */
  }
  const go = (path: string) => {
    const w = frame.current?.contentWindow
    if (!w) return
    w.history.pushState(null, '', path)
    w.dispatchEvent(new PopStateEvent('popstate'))
    w.scrollTo(0, 0)
  }
  const fullScreen = () => {
    try {
      sessionStorage.setItem(FULL, '1')
    } catch {
      /* stays framed */
    }
    window.location.reload()
  }
  return (
    <div className="min-h-dvh bg-[radial-gradient(circle_at_20%_15%,#3a1424,var(--color-ink-900)_60%)]">
      <div className="mx-auto grid min-h-dvh max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-16 px-10 py-8">
        <main className="max-w-xl">
          <p className="text-sm font-semibold tracking-[0.25em] text-wine-300 uppercase">{t('MioVino')}</p>
          <h1 className="font-display mt-3 mb-6 text-5xl leading-tight font-semibold text-cream-50">{t('Your wine cellar, in your pocket.')}</h1>
          <DemoAbout go={go} />
          <div className="mt-8 flex gap-3">
            <Button variant="secondary" onClick={fullScreen}>
              <Maximize2 size={16} aria-hidden /> {t('Open full screen')}
            </Button>
            <Button variant="ghost" onClick={exitDemo}>
              <LogOut size={16} aria-hidden /> {t('Exit demo')}
            </Button>
          </div>
          <p className="mt-6 text-xs text-cream-500">{t('Best on a phone: open this link there and add it to the Home Screen.')}</p>
        </main>
        <div className="rounded-[3.25rem] bg-ink-950 p-3 shadow-[0_40px_100px_rgba(0,0,0,0.6)] ring-1 ring-ink-700">
          <iframe ref={frame} src="/" title={t('MioVino demo')} className="block h-[min(844px,calc(100dvh-5rem))] w-[390px] rounded-[2.5rem] bg-ink-900" />
        </div>
      </div>
    </div>
  )
}

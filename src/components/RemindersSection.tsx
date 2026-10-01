import { Bell, BellOff, Share } from 'lucide-react'
import { plural, t } from '../lib/i18n'
import { useEffect, useState } from 'react'
import { disablePush, enablePush, platform, pushBlocked, pushEnabled, pushSupport, testPush } from '../lib/push'
import { Button, Section } from './ui'

/** Turn the monthly drinking reminder on/off for this device. */
export function RemindersSection() {
  const support = pushSupport()
  const device = platform()
  const blocked = support === 'ok' && pushBlocked()
  const [on, setOn] = useState<boolean>()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  useEffect(() => {
    void pushEnabled().then(setOn)
  }, [])

  const run = async (fn: () => Promise<string | void>) => {
    setBusy(true)
    setMsg('')
    try {
      const m = await fn()
      if (m) setMsg(m)
    } catch (e) {
      setMsg((e as Error).message)
    } finally {
      setBusy(false)
      setOn(await pushEnabled())
    }
  }

  return (
    <Section title={t('Reminders')}>
      <div className="card space-y-3 p-4">
        <div className="flex items-start gap-3">
          {on ? <Bell size={18} className="mt-0.5 text-amber-300" /> : <BellOff size={18} className="mt-0.5 text-cream-500" />}
          <div className="flex-1 text-sm">
            <p className="text-cream-50">{t('Monthly drinking reminder')}</p>
            <p className="text-xs text-cream-400">{t('On the 1st of each month: what’s ready now and what’s closing soon.')}</p>
          </div>
        </div>

        {support === 'install-first' && (
          <p className="rounded-xl bg-ink-800 p-3 text-sm text-cream-200">
            {t('On iPhone, notifications work once MioVino is on your Home Screen: tap')} <Share size={14} className="inline" /> {t('Share →')} <span className="font-semibold">{t('Add to Home Screen')}</span>{t(', then open it from there and come back here.')}
          </p>
        )}
        {support === 'unsupported' && <p className="text-sm text-cream-400">{t('This browser can’t show notifications. The monthly summary still appears at the top of your cellar.')}</p>}
        {blocked && (
          <p className="rounded-xl bg-amber-400/10 p-3 text-sm text-amber-100 ring-1 ring-amber-400/30">
            {device === 'ios'
              ? t('Notifications are blocked. Turn them on in the iPhone Settings → Notifications → MioVino, then come back.')
              : device === 'android'
                ? t('Notifications are blocked for this site. Tap the icon left of the address (or ⋮ → Settings → Site settings) → Notifications → Allow, then reload.')
                : t('Notifications are blocked for this site. Allow them in the browser’s site settings, then reload.')}
          </p>
        )}

        {support === 'ok' && on !== undefined && (
          <div className="flex gap-2">
            {on ? (
              <>
                <Button variant="secondary" className="flex-1" disabled={busy} onClick={() => run(async () => { const r = await testPush(); return r.sent ? plural(r.sent, 'Sent to {n} device.', 'Sent to {n} devices.') : t('Nothing was delivered — try turning reminders off and on.') })}>
                  {t('Send one now')}
                </Button>
                <Button variant="ghost" disabled={busy} onClick={() => run(async () => { await disablePush(); return t('Reminders are off on this device.') })}>
                  {t('Turn off')}
                </Button>
              </>
            ) : (
              <Button className="flex-1" disabled={busy} onClick={() => run(async () => { await enablePush(); return t('Reminders are on. Tap “Send one now” to see what they look like.') })}>
                <Bell size={16} /> {t('Turn on reminders')}
              </Button>
            )}
          </div>
        )}
        {msg && <p className="text-sm text-cream-300">{msg}</p>}

        <details className="group rounded-xl bg-ink-800/60 px-3 py-2 text-sm text-cream-300" open={support !== 'ok'}>
          <summary className="flex min-h-9 cursor-pointer items-center font-medium text-cream-100">{t('Which phones work?')}</summary>
          <ul className="mt-1 mb-1 list-disc space-y-1.5 pl-5 text-xs leading-relaxed">
            <li>
              <span className="font-semibold text-cream-100">Android</span> — {t('works straight from Chrome, Edge, Firefox or Samsung Internet, no install needed. Installing (⋮ → Install app) makes a tap on the reminder open the app.')}
            </li>
            <li>
              <span className="font-semibold text-cream-100">iPhone / iPad</span> — {t('needs iOS 16.4 or later, and MioVino added to the Home Screen: in Safari tap Share → Add to Home Screen (recent iOS also allows it from Chrome or Edge). Then open it from the Home Screen and turn reminders on there.')}
            </li>
            <li>{t('Each device you turn on gets its own reminder, in its own language.')}</li>
          </ul>
        </details>
      </div>
    </Section>
  )
}

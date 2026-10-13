import { Mail } from 'lucide-react'
import { useEffect, useState } from 'react'
import { getLang, t } from '../lib/i18n'
import { Button } from './ui'

const call = async (path: string, body?: unknown) => {
  const res = await fetch(path, body === undefined ? { credentials: 'same-origin' } : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), credentials: 'same-origin' })
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: string }
  if (!res.ok) throw new Error(data.error ?? t('Something went wrong ({status}).', { status: res.status }))
  return data
}

const WHY: Record<string, string> = {
  'no-key': 'Email isn’t set up on the server yet (it needs a free Resend key).',
  'no-address': 'Save an email address first.',
}

/** The monthly reminder by email: works on any phone or computer, no notifications needed. */
export function EmailReminder() {
  const [state, setState] = useState<{ available: boolean; address: string | null }>()
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  useEffect(() => {
    call('/api/email')
      .then((d) => {
        setState({ available: !!d.available, address: (d.address as string | null) ?? null })
        setDraft((d.address as string | null) ?? '')
      })
      .catch(() => setState({ available: false, address: null }))
  }, [])

  const run = async (fn: () => Promise<string>) => {
    setBusy(true)
    setMsg('')
    try {
      setMsg(await fn())
    } catch (e) {
      setMsg((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const save = (address: string | null) =>
    run(async () => {
      const d = await call('/api/email', { address, lang: getLang() })
      setState((s) => ({ available: !!s?.available, address: (d.address as string | null) ?? null }))
      setDraft((d.address as string | null) ?? '')
      return d.address ? t('Saved. The summary will arrive on the 1st of each month.') : t('Email reminders are off.')
    })

  if (!state) return null
  return (
    <div className="border-t border-ink-700 pt-3">
      <div className="mb-2 flex items-start gap-3">
        <Mail size={18} className={state.address ? 'mt-0.5 text-amber-300' : 'mt-0.5 text-cream-500'} aria-hidden />
        <div className="flex-1 text-sm">
          <p className="text-cream-50">{t('By email')}</p>
          <p className="text-xs text-cream-400">{t('The same summary in your inbox — works on any phone or computer.')}</p>
        </div>
      </div>
      {!state.available ? (
        <p className="text-xs text-cream-400">{t(WHY['no-key'])}</p>
      ) : (
        <>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              void save(draft.trim())
            }}
          >
            <input className="field min-w-0 flex-1" type="email" autoComplete="email" aria-label={t('Email address')} placeholder="you@example.com" value={draft} onChange={(e) => setDraft(e.target.value)} />
            <Button type="submit" variant="secondary" disabled={busy || !draft.trim() || draft.trim() === state.address}>
              {t('Save')}
            </Button>
          </form>
          {state.address && (
            <div className="mt-2 flex gap-2">
              <Button
                variant="secondary"
                className="flex-1"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    const r = (await call('/api/email/test', {})) as { sent: boolean; reason?: string }
                    return r.sent ? t('Sent to {address}. Check your inbox (and spam).', { address: state.address! }) : t(WHY[r.reason ?? ''] ?? 'Nothing was sent.')
                  })
                }
              >
                {t('Send a test email')}
              </Button>
              <Button variant="ghost" disabled={busy} onClick={() => void save(null)}>
                {t('Turn off')}
              </Button>
            </div>
          )}
        </>
      )}
      {msg && <p className="mt-2 text-sm text-cream-300">{msg}</p>}
    </div>
  )
}

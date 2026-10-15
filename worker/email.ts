import { json } from './auth'
import { cellarDigestMessage, type PushDb, type PushMessage } from './push'

/** Email via Resend (free tier: 3,000 emails a month). Without a domain of your own, Resend only delivers to your Resend account's address. */
export interface EmailEnv {
  RESEND_API_KEY?: string
  /** Optional, e.g. "MioVino <cellar@yourdomain.com>" once a domain is verified in Resend. */
  RESEND_FROM?: string
}

type Lang = 'en' | 'it'
const EMAIL = /^[^\s@<>]{1,64}@[^\s@<>]+\.[^\s@<>]{2,}$/

const READY: Record<Lang, PushMessage> = {
  en: { title: 'MioVino email reminders are on', body: 'On the 1st of each month you’ll get an email with what’s ready to drink and what’s closing soon.', url: '/' },
  it: { title: 'Promemoria email MioVino attivi', body: 'Il 1° di ogni mese riceverai un’email con cosa è pronto da bere e cosa sta per chiudere.', url: '/' },
}
const OPEN: Record<Lang, string> = { en: 'Open MioVino', it: 'Apri MioVino' }

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

/** The email for one reminder: plain text plus a simple dark HTML version with a button into the app. */
export function reminderEmail(msg: PushMessage, origin: string, lang: Lang) {
  const link = new URL(msg.url ?? '/', origin).href
  const html = `<div style="background:#160c11;padding:32px 16px;font-family:system-ui,-apple-system,sans-serif"><div style="max-width:480px;margin:0 auto;background:#21141b;border-radius:16px;padding:24px;color:#efe4cf">
<p style="margin:0 0 4px;font:600 13px system-ui;letter-spacing:.08em;color:#c9a54e;text-transform:uppercase">MioVino</p>
<h1 style="margin:0 0 12px;font:600 22px/1.3 Georgia,serif;color:#fbf6ec">${esc(msg.title)}</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:1.55;white-space:pre-line">${esc(msg.body)}</p>
<a href="${esc(link)}" style="display:inline-block;background:#8e1f3d;color:#fff;text-decoration:none;padding:10px 18px;border-radius:999px;font-weight:600">${OPEN[lang]}</a>
</div></div>`
  return { subject: msg.title, text: `${msg.body}\n\n${OPEN[lang]}: ${link}`, html }
}

async function setting(db: PushDb, key: string) {
  return (await db.prepare('SELECT value FROM push_config WHERE key = ?1').bind(key).first<{ value: string }>())?.value ?? null
}

async function send(env: EmailEnv, to: string, mail: ReturnType<typeof reminderEmail>) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env.RESEND_FROM || 'MioVino <onboarding@resend.dev>', to: [to], ...mail }),
  })
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`)
}

/**
 * Emails this month's summary to the saved address. `test` sends even when nothing is due (a "reminders are on" note).
 * Returns what happened, for the app to show.
 */
export async function emailReminder(db: PushDb, env: EmailEnv, test = false): Promise<{ sent: boolean; reason?: string }> {
  if (!env.RESEND_API_KEY) return { sent: false, reason: 'no-key' }
  const to = await setting(db, 'email')
  if (!to) return { sent: false, reason: 'no-address' }
  const lang: Lang = (await setting(db, 'email_lang')) === 'it' ? 'it' : 'en'
  const msg = (await cellarDigestMessage(db, new Date(), lang)) ?? (test ? READY[lang] : null)
  if (!msg) return { sent: false, reason: 'nothing-due' }
  const origin = (await setting(db, 'subject')) ?? 'https://miovino.mb1988.workers.dev'
  await send(env, to, reminderEmail(msg, origin, lang))
  return { sent: true }
}

/** /api/email — the reminder address (signed-in only). GET reads it, POST {address|null, lang} saves it, POST /api/email/test sends now. */
export async function handleEmail(req: Request, db: PushDb, env: EmailEnv, path: string): Promise<Response | null> {
  if (path === '/api/email' && req.method === 'GET') return json({ available: !!env.RESEND_API_KEY, address: await setting(db, 'email') })
  if (path === '/api/email' && req.method === 'POST') {
    const { address, lang } = (await req.json()) as { address?: unknown; lang?: unknown }
    if (address == null || address === '') {
      await db.prepare("DELETE FROM push_config WHERE key IN ('email', 'email_lang')").run()
      return json({ ok: true, address: null })
    }
    if (typeof address !== 'string' || !EMAIL.test(address.trim())) return json({ error: 'That doesn’t look like an email address.' }, 400)
    const put = (key: string, value: string) => db.prepare('INSERT OR REPLACE INTO push_config (key, value) VALUES (?1, ?2)').bind(key, value).run()
    await put('email', address.trim())
    await put('email_lang', lang === 'it' ? 'it' : 'en')
    await put('subject', new URL(req.url).origin) // the app's address, for the email's button
    return json({ ok: true, address: address.trim() })
  }
  if (path === '/api/email/test' && req.method === 'POST') {
    try {
      return json(await emailReminder(db, env, true))
    } catch (e) {
      return json({ error: (e as Error).message }, 502)
    }
  }
  return null
}

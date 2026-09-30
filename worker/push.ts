import { buildDigest, digestMessage, type DigestWine } from '../src/shared/reminders'
import { json } from './auth'

/**
 * Web Push (works on iPhone once MioVino is on the Home Screen, iOS 16.4+).
 * The VAPID key pair is generated on first use and kept in D1, so there is no secret to configure.
 * Payloads are encrypted per RFC 8291 (aes128gcm) with WebCrypto; no library needed.
 */

interface Row {
  first<T = Record<string, unknown>>(): Promise<T | null>
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>
  run(): Promise<unknown>
}
export interface PushDb {
  prepare(sql: string): { bind(...v: unknown[]): Row } & Row
}

export interface PushSubscriptionJSON {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

// ---------- base64url ----------
export function b64u(bytes: ArrayBuffer | Uint8Array): string {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let s = ''
  for (const x of b) s += String.fromCharCode(x)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
export function unb64u(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}
const encoder = new TextEncoder()
const enc = { encode: (s: string) => encoder.encode(s) as Uint8Array<ArrayBuffer> }
const concat = (...parts: Uint8Array[]): Uint8Array<ArrayBuffer> => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) out.set(p, (o += p.length) - p.length)
  return out
}

// ---------- VAPID keys ----------
export interface Vapid {
  publicKey: string // raw uncompressed P-256 point, base64url (what PushManager.subscribe wants)
  privateJwk: JsonWebKey
}

export async function generateVapid(): Promise<Vapid> {
  const kp = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair
  const raw = (await crypto.subtle.exportKey('raw', kp.publicKey)) as ArrayBuffer
  return { publicKey: b64u(raw), privateJwk: (await crypto.subtle.exportKey('jwk', kp.privateKey)) as JsonWebKey }
}

export async function getVapid(db: PushDb): Promise<Vapid> {
  const row = await db.prepare("SELECT value FROM push_config WHERE key = 'vapid'").first<{ value: string }>()
  if (row) return JSON.parse(row.value) as Vapid
  const v = await generateVapid()
  // If two requests race, the first insert wins and both read it back.
  await db.prepare("INSERT OR IGNORE INTO push_config (key, value) VALUES ('vapid', ?1)").bind(JSON.stringify(v)).run()
  return JSON.parse((await db.prepare("SELECT value FROM push_config WHERE key = 'vapid'").first<{ value: string }>())!.value) as Vapid
}

/** `Authorization` header value for a push service (ES256 JWT, valid 12 h). */
export async function vapidAuth(endpoint: string, v: Vapid, subject: string, now = Date.now()) {
  const header = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const claims = b64u(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject })))
  const key = await crypto.subtle.importKey('jwk', v.privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${header}.${claims}`))
  return `vapid t=${header}.${claims}.${b64u(sig)}, k=${v.publicKey}`
}

// ---------- RFC 8291 payload encryption ----------
// Standard WebCrypto shape; workerd's typings spell the reserved word `public` as `$public`.
const ecdh = (pub: CryptoKey) => ({ name: 'ECDH', public: pub }) as unknown as Parameters<SubtleCrypto['deriveBits']>[0]

async function hkdf(salt: Uint8Array<ArrayBuffer>, ikm: Uint8Array<ArrayBuffer>, info: Uint8Array<ArrayBuffer>, bytes: number) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8))
}

export async function encryptPayload(sub: PushSubscriptionJSON, payload: string, salt: Uint8Array<ArrayBuffer> = crypto.getRandomValues(new Uint8Array(16))) {
  const uaPublic = unb64u(sub.keys.p256dh)
  const authSecret = unb64u(sub.keys.auth)
  const as = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair
  const asPublic = new Uint8Array((await crypto.subtle.exportKey('raw', as.publicKey)) as ArrayBuffer)
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const shared = new Uint8Array(await crypto.subtle.deriveBits(ecdh(uaKey), as.privateKey, 256))

  const ikm = await hkdf(authSecret, shared, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32)
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12)
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  // One record: the payload followed by the 0x02 "last record" delimiter, no padding.
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(enc.encode(payload), new Uint8Array([2]))))
  const rs = new Uint8Array([0, 0, 0x10, 0]) // record size 4096
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, cipher)
}

export interface PushMessage {
  title: string
  body: string
  url?: string
}

/** Sends one notification. Returns 'gone' when the subscription has expired and should be dropped. */
export async function sendPush(sub: PushSubscriptionJSON, msg: PushMessage, v: Vapid, subject: string): Promise<'ok' | 'gone' | 'error'> {
  const body = await encryptPayload(sub, JSON.stringify(msg))
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      authorization: await vapidAuth(sub.endpoint, v, subject),
      'content-encoding': 'aes128gcm',
      'content-type': 'application/octet-stream',
      ttl: String(3 * 24 * 3600),
      urgency: 'normal',
    },
    body,
  })
  if (res.status === 404 || res.status === 410) return 'gone'
  if (!res.ok) console.error('push failed', res.status, await res.text().catch(() => ''))
  return res.ok ? 'ok' : 'error'
}

// Push services only accept endpoints from the browsers' own push services.
const PUSH_HOSTS = /(^|\.)(push\.apple\.com|googleapis\.com|mozilla\.com|notify\.windows\.com|push\.services\.mozilla\.com)$/

export function validSubscription(s: unknown): s is PushSubscriptionJSON {
  const x = s as PushSubscriptionJSON
  try {
    const u = new URL(x.endpoint)
    return u.protocol === 'https:' && PUSH_HOSTS.test(u.hostname) && typeof x.keys?.p256dh === 'string' && typeof x.keys?.auth === 'string' && x.keys.p256dh.length < 200 && x.keys.auth.length < 100
  } catch {
    return false
  }
}

// ---------- digest from the synced records ----------
export async function cellarDigestMessage(db: PushDb, now = new Date()) {
  const { results } = await db.prepare("SELECT kind, id, data FROM records WHERE kind IN ('wines', 'bottles') AND deleted = 0").all<{ kind: string; id: string; data: string }>()
  const inCellar = new Map<string, number>()
  const wines: DigestWine[] = []
  for (const r of results) {
    const d = JSON.parse(r.data) as Record<string, unknown>
    if (r.kind === 'bottles' && d.status === 'cellar') inCellar.set(d.wineId as string, (inCellar.get(d.wineId as string) ?? 0) + 1)
    if (r.kind === 'wines')
      wines.push({ id: r.id, producer: String(d.producer ?? ''), name: String(d.name ?? ''), vintage: d.vintage as number | null, drinkFrom: d.drinkFrom as number | undefined, drinkTo: d.drinkTo as number | undefined, peakYear: d.peakYear as number | undefined, bottles: 0 })
  }
  for (const w of wines) w.bottles = inCellar.get(w.id) ?? 0
  const month = now.toLocaleString('en-GB', { month: 'long', timeZone: 'Europe/London' })
  return digestMessage(buildDigest(wines, now.getUTCFullYear()), month)
}

/** Sends a message to every subscribed device, dropping expired subscriptions. */
export async function pushToAll(db: PushDb, msg: PushMessage) {
  const v = await getVapid(db)
  const subject = (await db.prepare("SELECT value FROM push_config WHERE key = 'subject'").first<{ value: string }>())?.value ?? 'https://miovino.app'
  const { results } = await db.prepare('SELECT endpoint, p256dh, auth FROM push_subscriptions').all<{ endpoint: string; p256dh: string; auth: string }>()
  let sent = 0
  for (const s of results) {
    const r = await sendPush({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, msg, v, subject)
    if (r === 'gone') await db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?1').bind(s.endpoint).run()
    if (r === 'ok') sent++
  }
  return { sent, devices: results.length }
}

/** Monthly cron: the drinking summary to every device. */
export async function monthlyReminder(db: PushDb) {
  const msg = await cellarDigestMessage(db)
  if (msg) await pushToAll(db, msg)
}

/** /api/push/* — only reached by signed-in requests. */
export async function handlePush(req: Request, db: PushDb, path: string): Promise<Response | null> {
  if (path === '/api/push/key' && req.method === 'GET') return json({ publicKey: (await getVapid(db)).publicKey })

  if (path === '/api/push/subscribe' && req.method === 'POST') {
    const body = (await req.json()) as { subscription?: unknown; device?: string }
    if (!validSubscription(body.subscription)) return json({ error: 'Bad subscription' }, 400)
    const s = body.subscription
    const device = typeof body.device === 'string' ? body.device.slice(0, 80) : null
    await db
      .prepare('INSERT INTO push_subscriptions (endpoint, p256dh, auth, device, created_at) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT (endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth, device = excluded.device')
      .bind(s.endpoint, s.keys.p256dh, s.keys.auth, device, Date.now())
      .run()
    // The app's own address identifies us to the push services (VAPID "sub").
    await db.prepare("INSERT OR REPLACE INTO push_config (key, value) VALUES ('subject', ?1)").bind(new URL(req.url).origin).run()
    return json({ ok: true })
  }

  if (path === '/api/push/unsubscribe' && req.method === 'POST') {
    const { endpoint } = (await req.json()) as { endpoint?: string }
    if (typeof endpoint === 'string') await db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?1').bind(endpoint).run()
    return json({ ok: true })
  }

  if (path === '/api/push/test' && req.method === 'POST') {
    const msg = (await cellarDigestMessage(db)) ?? { title: 'MioVino reminders are on', body: 'You’ll get a drinking summary on the 1st of each month.', url: '/' }
    return json(await pushToAll(db, msg))
  }
  return null
}

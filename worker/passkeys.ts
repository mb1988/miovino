import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server'
import { json } from './auth'

/**
 * Passkey (WebAuthn) login for a single owner.
 *  - A new device registers with a one-time invite link (created by `npm run auth:invite`, or from
 *    a device that is already signed in).
 *  - Sign-in returns a signed, HttpOnly session cookie (HMAC-SHA256 with SESSION_SECRET), valid 180 days.
 */

export interface PasskeyEnv {
  DB: D1Database
  SESSION_SECRET?: string
}

const SESSION_COOKIE = 'mv_session'
const CHALLENGE_COOKIE = 'mv_chal'
const SESSION_DAYS = 180
const INVITE_HOURS = 24

const enc = new TextEncoder()
const b64url = (bytes: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes as ArrayBuffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))

export async function sha256(text: string) {
  return b64url(await crypto.subtle.digest('SHA-256', enc.encode(text)))
}

async function hmac(secret: string, data: string) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode(data)))
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

function cookies(req: Request) {
  return Object.fromEntries(
    (req.headers.get('cookie') ?? '')
      .split(';')
      .map((c) => c.trim().split('='))
      .filter((p) => p.length === 2),
  ) as Record<string, string>
}

function cookie(req: Request, name: string, value: string, maxAge: number) {
  const secure = new URL(req.url).protocol === 'https:' ? '; Secure' : ''
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`
}

/** Returns true when the request carries a valid session cookie. */
export async function hasSession(req: Request, env: PasskeyEnv): Promise<boolean> {
  if (!env.SESSION_SECRET) return false
  const raw = cookies(req)[SESSION_COOKIE]
  if (!raw) return false
  const [exp, sig] = raw.split('.')
  if (!exp || !sig || Number(exp) < Date.now()) return false
  return timingSafeEqual(sig, await hmac(env.SESSION_SECRET, `session:${exp}`))
}

async function sessionCookie(req: Request, env: PasskeyEnv) {
  const exp = Date.now() + SESSION_DAYS * 86400_000
  return cookie(req, SESSION_COOKIE, `${exp}.${await hmac(env.SESSION_SECRET!, `session:${exp}`)}`, SESSION_DAYS * 86400)
}

function rp(req: Request) {
  const url = new URL(req.url)
  return { rpID: url.hostname, origin: url.origin }
}

async function saveChallenge(env: PasskeyEnv, challenge: string) {
  const id = crypto.randomUUID()
  await env.DB.batch([
    env.DB.prepare('DELETE FROM challenges WHERE expires_at < ?1').bind(Date.now()),
    env.DB.prepare('INSERT INTO challenges (id, challenge, expires_at) VALUES (?1, ?2, ?3)').bind(id, challenge, Date.now() + 5 * 60_000),
  ])
  return id
}

/** Reads and deletes the pending challenge (single use). */
async function takeChallenge(req: Request, env: PasskeyEnv) {
  const id = cookies(req)[CHALLENGE_COOKIE]
  if (!id) return undefined
  const row = await env.DB.prepare('DELETE FROM challenges WHERE id = ?1 RETURNING challenge, expires_at').bind(id).first<{ challenge: string; expires_at: number }>()
  return row && row.expires_at > Date.now() ? row.challenge : undefined
}

async function validInvite(env: PasskeyEnv, token: unknown) {
  if (typeof token !== 'string' || token.length < 20) return undefined
  const hash = await sha256(token)
  const row = await env.DB.prepare('SELECT token_hash FROM invites WHERE token_hash = ?1 AND used_at IS NULL AND expires_at > ?2').bind(hash, Date.now()).first<{ token_hash: string }>()
  return row?.token_hash
}

export async function createInvite(env: PasskeyEnv) {
  const token = b64url(crypto.getRandomValues(new Uint8Array(24)))
  const now = Date.now()
  await env.DB.prepare('INSERT INTO invites (token_hash, expires_at, created_at) VALUES (?1, ?2, ?3)').bind(await sha256(token), now + INVITE_HOURS * 3600_000, now).run()
  return token
}

export async function authStatus(req: Request, env: PasskeyEnv) {
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM credentials').first<{ n: number }>()
  return { authenticated: await hasSession(req, env), devices: count?.n ?? 0 }
}

/** Handles /api/auth/*. Returns undefined for paths it doesn't own. */
export async function handleAuth(req: Request, env: PasskeyEnv, path: string): Promise<Response | undefined> {
  if (!path.startsWith('/api/auth/')) return undefined
  if (!env.SESSION_SECRET) return json({ error: 'Login is not configured on the server (SESSION_SECRET missing).' }, 500)
  const { rpID, origin } = rp(req)

  if (path === '/api/auth/logout' && req.method === 'POST') {
    return json({ ok: true }, 200, { 'set-cookie': cookie(req, SESSION_COOKIE, '', 0) })
  }

  // Register a new device: needs a valid one-time invite.
  if (path === '/api/auth/register/options' && req.method === 'POST') {
    const { invite } = (await req.json()) as { invite?: string }
    if (!(await validInvite(env, invite))) return json({ error: 'This setup link is invalid, used or expired. Create a new one.' }, 403)
    const { results } = await env.DB.prepare('SELECT id, transports FROM credentials').all<{ id: string; transports: string | null }>()
    const options = await generateRegistrationOptions({
      rpName: 'MioVino',
      rpID,
      userName: 'owner',
      userDisplayName: 'MioVino owner',
      userID: new Uint8Array(enc.encode('miovino-owner')),
      attestationType: 'none',
      excludeCredentials: results.map((c) => ({ id: c.id, transports: c.transports ? JSON.parse(c.transports) : undefined })),
      authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
    })
    const cid = await saveChallenge(env, options.challenge)
    return json(options, 200, { 'set-cookie': cookie(req, CHALLENGE_COOKIE, cid, 300) })
  }

  if (path === '/api/auth/register/verify' && req.method === 'POST') {
    const { invite, response, deviceName } = (await req.json()) as { invite?: string; response: RegistrationResponseJSON; deviceName?: string }
    const inviteHash = await validInvite(env, invite)
    if (!inviteHash) return json({ error: 'This setup link is invalid, used or expired.' }, 403)
    const expectedChallenge = await takeChallenge(req, env)
    if (!expectedChallenge) return json({ error: 'Setup timed out — try again.' }, 400)
    let verification
    try {
      verification = await verifyRegistrationResponse({ response, expectedChallenge, expectedOrigin: origin, expectedRPID: rpID })
    } catch (e) {
      return json({ error: `Passkey rejected: ${(e as Error).message}` }, 400)
    }
    if (!verification.verified) return json({ error: 'Passkey could not be verified.' }, 400)
    const { credential } = verification.registrationInfo
    const now = Date.now()
    await env.DB.batch([
      env.DB.prepare('INSERT INTO credentials (id, public_key, counter, transports, device_name, created_at, last_used_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)').bind(
        credential.id,
        b64url(credential.publicKey),
        credential.counter,
        JSON.stringify(credential.transports ?? []),
        String(deviceName ?? '').slice(0, 60) || 'Device',
        now,
      ),
      env.DB.prepare('UPDATE invites SET used_at = ?2 WHERE token_hash = ?1').bind(inviteHash, now),
    ])
    return json({ ok: true }, 200, { 'set-cookie': await sessionCookie(req, env) })
  }

  // Sign in with an existing passkey (discoverable: the phone offers the MioVino passkey).
  if (path === '/api/auth/login/options' && req.method === 'POST') {
    const options = await generateAuthenticationOptions({ rpID, userVerification: 'preferred' })
    const cid = await saveChallenge(env, options.challenge)
    return json(options, 200, { 'set-cookie': cookie(req, CHALLENGE_COOKIE, cid, 300) })
  }

  if (path === '/api/auth/login/verify' && req.method === 'POST') {
    const { response } = (await req.json()) as { response: AuthenticationResponseJSON }
    const expectedChallenge = await takeChallenge(req, env)
    if (!expectedChallenge) return json({ error: 'Sign-in timed out — try again.' }, 400)
    const row = await env.DB.prepare('SELECT id, public_key, counter, transports FROM credentials WHERE id = ?1').bind(response?.id ?? '').first<{ id: string; public_key: string; counter: number; transports: string | null }>()
    if (!row) return json({ error: 'This passkey is not registered for MioVino.' }, 403)
    let verification
    try {
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        credential: { id: row.id, publicKey: fromB64url(row.public_key), counter: row.counter, transports: row.transports ? JSON.parse(row.transports) : undefined },
      })
    } catch (e) {
      return json({ error: `Sign-in rejected: ${(e as Error).message}` }, 403)
    }
    if (!verification.verified) return json({ error: 'Sign-in could not be verified.' }, 403)
    await env.DB.prepare('UPDATE credentials SET counter = ?2, last_used_at = ?3 WHERE id = ?1').bind(row.id, verification.authenticationInfo.newCounter, Date.now()).run()
    return json({ ok: true }, 200, { 'set-cookie': await sessionCookie(req, env) })
  }

  // Signed-in devices can create a setup link for another device, and list/remove devices.
  if (path === '/api/auth/invite' && req.method === 'POST') {
    if (!(await hasSession(req, env))) return json({ error: 'Not signed in' }, 401)
    return json({ invite: await createInvite(env), expiresInHours: INVITE_HOURS })
  }
  if (path === '/api/auth/devices' && req.method === 'GET') {
    if (!(await hasSession(req, env))) return json({ error: 'Not signed in' }, 401)
    const { results } = await env.DB.prepare('SELECT id, device_name, created_at, last_used_at FROM credentials ORDER BY created_at').all()
    return json({ devices: results })
  }
  const del = path.match(/^\/api\/auth\/devices\/(.+)$/)
  if (del && req.method === 'DELETE') {
    if (!(await hasSession(req, env))) return json({ error: 'Not signed in' }, 401)
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM credentials').first<{ n: number }>()
    if ((n?.n ?? 0) <= 1) return json({ error: "Can't remove the last device — you'd be locked out." }, 400)
    await env.DB.prepare('DELETE FROM credentials WHERE id = ?1').bind(decodeURIComponent(del[1])).run()
    return json({ ok: true })
  }
  return json({ error: 'Not found' }, 404)
}

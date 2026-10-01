import { describe, expect, it } from 'vitest'
import { buildDigest, digestMessage, digestMonth, type DigestWine } from '../shared/reminders'

// Loaded by path so the Worker's types stay out of the app build (as in sync.test.ts).
interface PushModule {
  b64u(b: ArrayBuffer | Uint8Array): string
  unb64u(s: string): Uint8Array<ArrayBuffer>
  generateVapid(): Promise<{ publicKey: string; privateJwk: JsonWebKey }>
  vapidAuth(endpoint: string, v: { publicKey: string; privateJwk: JsonWebKey }, subject: string, now?: number): Promise<string>
  encryptPayload(sub: { endpoint: string; keys: { p256dh: string; auth: string } }, payload: string): Promise<Uint8Array<ArrayBuffer>>
  validSubscription(s: unknown): boolean
}
const push = (await import(/* @vite-ignore */ new URL('../../worker/push.ts', import.meta.url).href)) as PushModule

const wine = (id: string, drinkFrom: number | undefined, drinkTo: number | undefined, bottles = 1): DigestWine => ({ id, producer: `P${id}`, name: 'Wine', vintage: 2015, drinkFrom, drinkTo, bottles })

describe('monthly digest', () => {
  it('groups cellar wines by urgency and skips empty ones', () => {
    const d = buildDigest([wine('a', 2020, 2027), wine('b', 2018, 2024), wine('c', 2027, 2035), wine('d', 2020, 2040), wine('e', 2020, 2026, 0), wine('f', undefined, undefined)], 2026)
    expect(d.soon.map((w) => w.id)).toEqual(['a'])
    expect(d.past.map((w) => w.id)).toEqual(['b'])
    expect(d.opening.map((w) => w.id)).toEqual(['c'])
    expect(d.ready.map((w) => w.id)).toEqual(['d'])
  })

  it('writes a short notification', () => {
    const msg = digestMessage(buildDigest([wine('a', 2020, 2027), wine('b', 2018, 2024), wine('d', 2020, 2040)], 2026), 'October')
    expect(msg).toEqual({ title: 'Your cellar in October', body: '1 wine to drink soon · 1 wine past the window · 1 ready\nFirst: Pb Wine 2015, Pa Wine 2015', url: '/?status=soon' })
    expect(digestMessage(buildDigest([], 2026), 'October')).toBeNull()
  })

  it('writes it in Italian for devices set to Italian', () => {
    const d = buildDigest([wine('a', 2020, 2027), wine('b', 2018, 2024), wine('c', 2018, 2024), wine('d', 2020, 2040)], 2026)
    const october = new Date('2026-10-01T08:00:00Z')
    expect(digestMonth(october, 'it')).toBe('ottobre')
    expect(digestMonth(october, 'en')).toBe('October')
    expect(digestMessage(d, digestMonth(october, 'it'), 'it')).toEqual({
      title: 'La tua cantina a ottobre',
      body: "1 vino da bere presto · 2 vini oltre la finestra · 1 pronto\nPrima: Pb Wine 2015, Pc Wine 2015 +1 altro",
      url: '/?status=soon',
    })
  })
})

/** The browser side of RFC 8291: decrypts what encryptPayload produced. */
async function decrypt(body: Uint8Array, uaKeys: CryptoKeyPair, auth: Uint8Array<ArrayBuffer>) {
  const salt = body.slice(0, 16)
  const idlen = body[20]
  const asPublic = body.slice(21, 21 + idlen)
  const cipher = body.slice(21 + idlen)
  const uaPublic = new Uint8Array(await crypto.subtle.exportKey('raw', uaKeys.publicKey))
  const asKey = await crypto.subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, uaKeys.privateKey, 256))
  const hkdf = async (s: Uint8Array<ArrayBuffer>, ikm: Uint8Array<ArrayBuffer>, info: Uint8Array<ArrayBuffer>, n: number) =>
    new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: s, info }, await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']), n * 8))
  const te = (s: string) => new TextEncoder().encode(s) as Uint8Array<ArrayBuffer>
  const info = new Uint8Array([...te('WebPush: info\0'), ...uaPublic, ...asPublic])
  const ikm = await hkdf(auth, shared, info, 32)
  const cek = await hkdf(salt, ikm, te('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, te('Content-Encoding: nonce\0'), 12)
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']), cipher))
  expect(plain[plain.length - 1]).toBe(2) // last-record delimiter
  return new TextDecoder().decode(plain.slice(0, -1))
}

describe('web push', () => {
  it('encrypts a payload the browser can decrypt (RFC 8291)', async () => {
    const ua = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair
    const auth = crypto.getRandomValues(new Uint8Array(16))
    const sub = { endpoint: 'https://web.push.apple.com/abc', keys: { p256dh: push.b64u(await crypto.subtle.exportKey('raw', ua.publicKey)), auth: push.b64u(auth) } }
    const body = await push.encryptPayload(sub, '{"title":"Hi 🍷"}')
    expect(new DataView(body.buffer).getUint32(16)).toBe(4096)
    expect(await decrypt(body, ua, auth)).toBe('{"title":"Hi 🍷"}')
  })

  it('signs a VAPID token the push service can verify', async () => {
    const v = await push.generateVapid()
    const header = await push.vapidAuth('https://web.push.apple.com/abc', v, 'https://miovino.example', 1_700_000_000_000)
    const [, jwt, k] = /^vapid t=([^,]+), k=(.+)$/.exec(header)!
    expect(k).toBe(v.publicKey)
    const [h, c, sig] = jwt.split('.')
    expect(JSON.parse(new TextDecoder().decode(push.unb64u(c)))).toEqual({ aud: 'https://web.push.apple.com', exp: 1_700_000_000 + 12 * 3600, sub: 'https://miovino.example' })
    const pub = await crypto.subtle.importKey('raw', push.unb64u(v.publicKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
    expect(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, push.unb64u(sig), new TextEncoder().encode(`${h}.${c}`))).toBe(true)
  })

  it('only accepts subscriptions from real push services', () => {
    const keys = { p256dh: 'x', auth: 'y' }
    expect(push.validSubscription({ endpoint: 'https://web.push.apple.com/abc', keys })).toBe(true)
    expect(push.validSubscription({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys })).toBe(true)
    expect(push.validSubscription({ endpoint: 'https://evil.example/abc', keys })).toBe(false)
    expect(push.validSubscription({ endpoint: 'http://web.push.apple.com/abc', keys })).toBe(false)
    expect(push.validSubscription({ endpoint: 'https://web.push.apple.com/abc' })).toBe(false)
  })
})

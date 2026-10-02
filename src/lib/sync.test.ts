import { readdirSync, readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import Dexie from 'dexie'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SyncChange } from '../shared/sync'
import type { Db, Stmt } from '../../worker/sync'

/** node:sqlite wrapped in the slice of the D1 API the Worker uses. */
function sqliteD1(): Db & { raw: DatabaseSync } {
  const raw = new DatabaseSync(':memory:')
  for (const f of readdirSync(new URL('../../migrations/', import.meta.url)).sort()) raw.exec(readFileSync(new URL(`../../migrations/${f}`, import.meta.url), 'utf8'))
  const stmt = (sql: string, params: unknown[] = []): Stmt & { first: () => Promise<unknown> } => ({
    // D1 takes ArrayBuffer for BLOBs; node:sqlite wants a typed array.
    bind: (...v: unknown[]) => stmt(sql, v.map((x) => (x instanceof ArrayBuffer ? new Uint8Array(x) : x))),
    first: async () => raw.prepare(sql).get(...(params as never[])) ?? null,
    all: async <T,>() => ({ results: raw.prepare(sql).all(...(params as never[])) as T[] }),
    run: async () => ({ meta: { changes: Number(raw.prepare(sql).run(...(params as never[])).changes) } }),
  })
  return {
    raw,
    prepare: (sql) => stmt(sql),
    batch: async (stmts) => {
      raw.exec('BEGIN')
      try {
        const out = []
        for (const s of stmts) out.push(await s.run())
        raw.exec('COMMIT')
        return out
      } catch (e) {
        raw.exec('ROLLBACK')
        throw e
      }
    },
  }
}

const wine = (id: string, updatedAt: number, name = 'Barolo'): SyncChange => ({ kind: 'wines', id: `wine-${id}-0000`, updatedAt, deleted: false, data: { producer: 'Vietti', name, vintage: 2016 } })

describe('server sync (D1 schema on SQLite)', async () => {
  const { sync, validate } = await import('../../worker/sync')

  it('stores pushes and returns them to a fresh device', async () => {
    const db = sqliteD1()
    const r1 = await sync(db, { cursor: 0, changes: [wine('a', 100), wine('b', 100)] })
    expect(r1.accepted).toBe(2)
    expect(r1.cursor).toBe(2)
    const fresh = await sync(db, { cursor: 0, changes: [] })
    expect(fresh.changes.map((c) => c.id)).toEqual(['wine-a-0000', 'wine-b-0000'])
    expect(db.raw.prepare('SELECT producer, vintage FROM wines').all()).toEqual([
      { producer: 'Vietti', vintage: 2016 },
      { producer: 'Vietti', vintage: 2016 },
    ])
  })

  it('last write wins: an older edit never overwrites a newer one', async () => {
    const db = sqliteD1()
    await sync(db, { cursor: 0, changes: [wine('a', 200, 'New name')] })
    const r = await sync(db, { cursor: 1, changes: [wine('a', 100, 'Old name')] })
    expect(r.accepted).toBe(0)
    expect(r.changes).toEqual([]) // nothing new since cursor 1
    const all = await sync(db, { cursor: 0, changes: [] })
    expect(all.changes[0].data).toMatchObject({ name: 'New name' })
  })

  it('propagates deletions as tombstones', async () => {
    const db = sqliteD1()
    await sync(db, { cursor: 0, changes: [wine('a', 100)] })
    await sync(db, { cursor: 1, changes: [{ kind: 'wines', id: 'wine-a-0000', updatedAt: 150, deleted: true, data: null }] })
    const r = await sync(db, { cursor: 1, changes: [] })
    expect(r.changes).toEqual([{ kind: 'wines', id: 'wine-a-0000', updatedAt: 150, deleted: true, data: null }])
    expect(db.raw.prepare('SELECT COUNT(*) AS n FROM wines').get()).toEqual({ n: 0 })
  })

  it('pages large pulls', async () => {
    const db = sqliteD1()
    const many = Array.from({ length: 450 }, (_, i) => wine(String(i).padStart(4, '0'), 1))
    for (let i = 0; i < 3; i++) await sync(db, { cursor: 0, changes: many.map((c) => ({ ...c, id: c.id.replace('wine-', `w${i}-`) })) })
    const first = await sync(db, { cursor: 0, changes: [] })
    expect(first.changes).toHaveLength(1000)
    expect(first.more).toBe(true)
    const second = await sync(db, { cursor: first.cursor, changes: [] })
    expect(second.changes).toHaveLength(350)
    expect(second.more).toBe(false)
  })

  it('rejects malformed requests', () => {
    expect(() => validate({ cursor: -1, changes: [] })).toThrow()
    expect(() => validate({ cursor: 0, changes: [{ kind: 'users', id: 'x'.repeat(10), updatedAt: 1, deleted: false, data: {} }] })).toThrow()
    expect(() => validate({ cursor: 0, changes: [{ kind: 'wines', id: "'; DROP TABLE records; --", updatedAt: 1, deleted: false, data: {} }] })).toThrow()
  })
})

describe('two devices syncing through the Worker', () => {
  let server: ReturnType<typeof sqliteD1>

  beforeEach(async () => {
    server = sqliteD1()
    // Loaded by path so the browser tsconfig doesn't typecheck Worker-only globals (D1Database, R2Bucket…).
    const workerPath = new URL('../../worker/index.ts', import.meta.url).href
    const worker = ((await import(/* @vite-ignore */ workerPath)) as { default: { fetch: (req: Request, env: unknown) => Promise<Response> } }).default
    const env = {
      DB: server,
      ALLOW_NO_AUTH: 'true',
      ASSETS: { fetch: async () => new Response('index') },
    }
    vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
      const res = await worker.fetch(new Request(new URL(input, 'https://cellar.test'), init), env)
      return res
    })
  })

  /** Loads a fresh copy of the app modules backed by its own IndexedDB = one device. */
  async function device() {
    vi.resetModules()
    // Dexie (an external dependency) survives resetModules and caches its IndexedDB, so swap it explicitly.
    Dexie.dependencies.indexedDB = new IDBFactory()
    Dexie.dependencies.IDBKeyRange = IDBKeyRange
    const dbm = await import('./db')
    const syncm = await import('./sync')
    return { ...dbm, ...syncm }
  }

  it('a wine added on the phone shows up on the laptop, and edits/deletes flow back', async () => {
    const phone = await device()
    const id = await phone.addWineWithBottles({ producer: 'Vietti', name: 'Barolo Castiglione', vintage: 2016, type: 'red', grapes: ['Nebbiolo'], bottleSize: 750, external: [], favourite: false, tags: [] }, 2, { location: 'Rack A' })
    await phone.syncNow()

    const laptop = await device()
    await laptop.syncNow()
    expect((await laptop.db.wines.get(id))?.name).toBe('Barolo Castiglione')
    expect(await laptop.db.bottles.where('wineId').equals(id).count()).toBe(2)
    expect(await laptop.db.locations.count()).toBe(1)

    // Laptop drinks a bottle; the phone sees it after its next sync.
    await new Promise((r) => setTimeout(r, 5))
    await laptop.drinkBottle(id, { date: '2026-09-30', rating: 4.5, notes: 'Lovely' })
    await laptop.syncNow()
    await phone.syncNow()
    const phoneBottles = await phone.db.bottles.where('wineId').equals(id).toArray()
    expect(phoneBottles.filter((b) => b.status === 'drunk')).toHaveLength(1)
    expect((await phone.db.tastings.toArray())[0]).toMatchObject({ rating: 4.5, notes: 'Lovely' })
  })

  it('stores and serves label photos, and drops them when the wine is deleted', async () => {
    const id = 'wine-photo-0001'
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 0xff, 0xd9])
    expect((await fetch(`/api/photo/${id}`, { method: 'PUT', body: jpeg })).status).toBe(200)
    const got = await fetch(`/api/photo/${id}`)
    expect(got.headers.get('content-type')).toBe('image/jpeg')
    expect(new Uint8Array(await got.arrayBuffer())).toEqual(jpeg)
    await fetch('/api/sync', { method: 'POST', body: JSON.stringify({ cursor: 0, changes: [{ kind: 'wines', id, updatedAt: 1, deleted: true, data: null }] }) })
    expect((await fetch(`/api/photo/${id}`)).status).toBe(404)
  })

  it('syncs wishlist items and their "bought" state', async () => {
    const a = await device()
    const { addWish } = await import('./wishlist')
    await addWish({ producer: 'Burlotto', name: 'Monvigliero', vintage: 2019, note: 'Try at Hedonism' })
    await a.syncNow()
    const b = await device()
    await b.syncNow()
    const [item] = await b.db.wishlist.toArray()
    expect(item).toMatchObject({ producer: 'Burlotto', name: 'Monvigliero', note: 'Try at Hedonism' })
    expect(server.raw.prepare('SELECT producer, bought FROM wishlist').all()).toEqual([{ producer: 'Burlotto', bought: null }])
  })

  it('deleting a wine removes it on the other device', async () => {
    const a = await device()
    const id = await a.addWineWithBottles({ producer: 'Gaja', name: 'Dagromis', vintage: 2016, type: 'red', grapes: [], bottleSize: 750, external: [], favourite: false, tags: [] }, 1)
    await a.syncNow()
    await new Promise((r) => setTimeout(r, 5))
    await a.deleteWine(id)
    await new Promise((r) => setTimeout(r, 20)) // tombstones are written after the delete transaction
    await a.syncNow()

    const b = await device()
    await b.syncNow()
    expect(await b.db.wines.count()).toBe(0)
    expect(await b.db.bottles.count()).toBe(0)
    expect(server.raw.prepare('SELECT COUNT(*) AS n FROM wines').get()).toEqual({ n: 0 })
  })
})

describe('passkey login gate', () => {
  const origin = 'https://cellar.test'
  async function setup() {
    const db = sqliteD1()
    const workerPath = new URL('../../worker/index.ts', import.meta.url).href
    const worker = ((await import(/* @vite-ignore */ workerPath)) as { default: { fetch: (req: Request, env: unknown) => Promise<Response> } }).default
    const env = { DB: db, SESSION_SECRET: 'test-secret-'.repeat(4), ASSETS: { fetch: async () => new Response('index') } }
    const call = (path: string, init?: RequestInit) => worker.fetch(new Request(origin + path, init), env)
    const passkeys = (await import(/* @vite-ignore */ new URL('../../worker/passkeys.ts', import.meta.url).href)) as { createInvite: (env: unknown) => Promise<string> }
    return { db, env, call, passkeys }
  }

  it('reports signed-out state publicly and rejects data access without a session', async () => {
    const { call } = await setup()
    expect(await (await call('/api/health')).json()).toMatchObject({ ok: true, authenticated: false, devices: 0, scan: false })
    expect((await call('/api/sync', { method: 'POST', body: '{"cursor":0,"changes":[]}' })).status).toBe(401)
    expect((await call('/api/photo/wine-0000-0001')).status).toBe(401)
    expect((await call('/api/scan', { method: 'POST', body: '{}' })).status).toBe(401)
    expect((await call('/api/auth/invite', { method: 'POST' })).status).toBe(401)
  })

  it('rejects forged session cookies', async () => {
    const { call } = await setup()
    const exp = Date.now() + 1e9
    const res = await call('/api/sync', { method: 'POST', body: '{"cursor":0,"changes":[]}', headers: { cookie: `mv_session=${exp}.forged-signature` } })
    expect(res.status).toBe(401)
  })

  it('only starts device setup with a valid, unused, unexpired invite', async () => {
    const { call, env, passkeys, db } = await setup()
    const post = (body: unknown) => call('/api/auth/register/options', { method: 'POST', body: JSON.stringify(body) })
    expect((await post({ invite: 'x'.repeat(32) })).status).toBe(403)
    const invite = await passkeys.createInvite(env)
    const ok = await post({ invite })
    expect(ok.status).toBe(200)
    expect((await ok.json()) as { challenge: string; rp: { id: string } }).toMatchObject({ rp: { id: 'cellar.test', name: 'MioVino' } })
    expect(ok.headers.get('set-cookie')).toMatch(/mv_chal=.*HttpOnly.*SameSite=Lax.*Secure/)
    // Only the hash is stored, never the token itself.
    expect(JSON.stringify(db.raw.prepare('SELECT * FROM invites').all())).not.toContain(invite)
    db.raw.prepare('UPDATE invites SET expires_at = 1').run()
    expect((await post({ invite })).status).toBe(403)
  })
})

describe('push reminders endpoints', () => {
  async function setup(auth = true) {
    const db = sqliteD1()
    const workerPath = new URL('../../worker/index.ts', import.meta.url).href
    type Worker = { fetch: (req: Request, env: unknown) => Promise<Response>; scheduled: (e: unknown, env: unknown, ctx: { waitUntil: (p: Promise<unknown>) => void }) => Promise<void> }
    const worker = ((await import(/* @vite-ignore */ workerPath)) as { default: Worker }).default
    const env = { DB: db, ...(auth ? { ALLOW_NO_AUTH: 'true' } : {}), ASSETS: { fetch: async () => new Response('index') } }
    const call = (path: string, body?: unknown) => worker.fetch(new Request('https://cellar.test' + path, body === undefined ? undefined : { method: 'POST', body: JSON.stringify(body) }), env)
    return { db, worker, env, call }
  }
  const ua = async () => {
    const k = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair
    const b64 = (b: ArrayBuffer | Uint8Array) => Buffer.from(b instanceof Uint8Array ? b : new Uint8Array(b)).toString('base64url')
    return { p256dh: b64(await crypto.subtle.exportKey('raw', k.publicKey)), auth: b64(crypto.getRandomValues(new Uint8Array(16))) }
  }

  it('needs a signed-in session', async () => {
    const { call } = await setup(false)
    expect((await call('/api/push/key')).status).toBe(401)
    expect((await call('/api/push/test', {})).status).toBe(401)
  })

  it('keeps one server key, stores subscriptions and sends the monthly summary', async () => {
    const { call, db, worker, env } = await setup()
    const k1 = ((await (await call('/api/push/key')).json()) as { publicKey: string }).publicKey
    const k2 = ((await (await call('/api/push/key')).json()) as { publicKey: string }).publicKey
    expect(k1).toBe(k2)
    expect(k1).toHaveLength(87) // 65-byte P-256 point

    expect((await call('/api/push/subscribe', { subscription: { endpoint: 'https://evil.example/x', keys: await ua() } })).status).toBe(400)
    expect((await call('/api/push/subscribe', { subscription: { endpoint: 'https://web.push.apple.com/one', keys: await ua() }, device: 'iPhone', lang: 'it' })).status).toBe(200)
    expect((await call('/api/push/subscribe', { subscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/two', keys: await ua() } })).status).toBe(200)

    // A wine closing this year with one bottle in the cellar.
    const year = new Date().getUTCFullYear()
    await call('/api/sync', {
      cursor: 0,
      changes: [
        { kind: 'wines', id: 'wine-soon-0001', updatedAt: 1, deleted: false, data: { producer: 'Gaja', name: 'Barbaresco', vintage: 2016, drinkFrom: 2020, drinkTo: year } },
        { kind: 'bottles', id: 'bottle-0000-0001', updatedAt: 1, deleted: false, data: { wineId: 'wine-soon-0001', status: 'cellar' } },
      ],
    })

    const sent: { url: string; headers: Headers }[] = []
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      sent.push({ url, headers: new Headers(init.headers) })
      return new Response(null, { status: url.includes('fcm') ? 410 : 201 }) // the Android one has expired
    })
    try {
      const res = (await (await call('/api/push/test', {})).json()) as { sent: number; devices: number }
      expect(res).toEqual({ sent: 1, devices: 2 })
      expect(sent[0].headers.get('content-encoding')).toBe('aes128gcm')
      expect(sent[0].headers.get('authorization')).toMatch(new RegExp(`^vapid t=[\\w-]+\\.[\\w-]+\\.[\\w-]+, k=${k1}$`))
      // Each device keeps its language; the expired subscription is gone.
      expect(db.raw.prepare('SELECT endpoint, lang FROM push_subscriptions').all()).toEqual([{ endpoint: 'https://web.push.apple.com/one', lang: 'it' }])

      // The monthly cron sends to the remaining device.
      sent.length = 0
      const waits: Promise<unknown>[] = []
      await worker.scheduled({}, env, { waitUntil: (p) => void waits.push(p) })
      await Promise.all(waits)
      expect(sent.map((s) => s.url)).toEqual(['https://web.push.apple.com/one'])
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('ask my cellar endpoint', () => {
  async function setup(extra: Record<string, unknown> = {}) {
    const db = sqliteD1()
    const worker = ((await import(/* @vite-ignore */ new URL('../../worker/index.ts', import.meta.url).href)) as { default: { fetch: (req: Request, env: unknown) => Promise<Response> } }).default
    const env = { DB: db, ALLOW_NO_AUTH: 'true', ASSETS: { fetch: async () => new Response('index') }, ...extra }
    const call = (path: string, body: unknown) => worker.fetch(new Request('https://cellar.test' + path, { method: 'POST', body: JSON.stringify(body) }), env)
    const ask = (await import(/* @vite-ignore */ new URL('../../worker/ask.ts', import.meta.url).href)) as {
      validateTurns: (b: unknown) => unknown
      cellarSnapshot: (db: unknown, now?: Date) => Promise<string>
    }
    return { db, call, ask }
  }

  it('explains when the server has no AI key, and checks the conversation shape', async () => {
    const { call, ask } = await setup()
    const res = await call('/api/ask', { messages: [{ role: 'user', content: 'Hi' }] })
    expect(res.status).toBe(501)
    expect(((await res.json()) as { error: string }).error).toMatch(/GEMINI_API_KEY/)
    expect(ask.validateTurns({ messages: [{ role: 'user', content: 'Hi' }] })).toBeTruthy()
    expect(ask.validateTurns({ messages: [{ role: 'assistant', content: 'Hi' }] })).toBeNull() // must start with the user
    expect(ask.validateTurns({ messages: [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }] })).toBeNull() // must end with the user
    expect(ask.validateTurns({ messages: [{ role: 'user', content: 'x'.repeat(4001) }] })).toBeNull()
    expect(ask.validateTurns({ messages: [{ role: 'system', content: 'x' }] })).toBeNull()
  })

  it('gives Claude a compact snapshot of bottles, tastings and the wishlist', async () => {
    const { db, call, ask } = await setup()
    const c = (kind: string, id: string, data: Record<string, unknown>) => ({ kind, id, updatedAt: 1, deleted: false, data })
    await call('/api/sync', {
      cursor: 0,
      changes: [
        c('wines', 'wine-gaja-0001', { producer: 'Gaja', name: 'Barbaresco', vintage: 2016, type: 'red', region: 'Piedmont', grapes: ['Nebbiolo'], drinkFrom: 2022, drinkTo: 2027 }),
        c('bottles', 'bottle-0000-0001', { wineId: 'wine-gaja-0001', status: 'cellar', location: 'Rack A', slot: 'B4', purchasePrice: 180 }),
        c('wines', 'wine-krug-0001', { producer: 'Krug', name: 'Grande Cuvée', vintage: null, type: 'sparkling' }),
        c('bottles', 'bottle-0000-0002', { wineId: 'wine-krug-0001', status: 'drunk' }),
        c('tastings', 'tasting-0000-0001', { wineId: 'wine-krug-0001', date: '2026-05-01', rating: 5, buyAgain: 'yes', notes: 'Stunning' }),
        c('wishlist', 'wish-0000-0001', { producer: 'Vietti', name: 'Barolo Rocche', note: 'for the 2030 birthday' }),
      ],
    })
    const text = await ask.cellarSnapshot(db, new Date('2026-09-30T12:00:00Z'))
    expect(text).toContain('Today is 2026-09-30.')
    expect(text).toContain('- Gaja Barbaresco 2016 — red; Piedmont; Nebbiolo; window 2022–2027 (drink soon); 1 bottle at Rack A B4; paid 180')
    expect(text).toContain('## Already drunk\n- Krug Grande Cuvée NV — drunk; 2026-05-01, 5/5, buy again: yes, "Stunning"')
    expect(text).toContain('- Vietti Barolo Rocche (for the 2030 birthday)')
  })
})

describe('wine-list scanner endpoint', () => {
  const jpeg = 'A'.repeat(200)
  async function setup(key?: string) {
    const db = sqliteD1()
    const worker = ((await import(/* @vite-ignore */ new URL('../../worker/index.ts', import.meta.url).href)) as { default: { fetch: (req: Request, env: unknown) => Promise<Response> } }).default
    const env = { DB: db, ALLOW_NO_AUTH: 'true', ASSETS: { fetch: async () => new Response('index') }, ...(key ? { GEMINI_API_KEY: key } : {}) }
    return (body: unknown) => worker.fetch(new Request('https://cellar.test/api/winelist', { method: 'POST', body: JSON.stringify(body) }), env)
  }

  it('checks the request and explains a missing key', async () => {
    const call = await setup()
    expect((await call({ images: [jpeg] })).status).toBe(501)
    const withKey = await setup('sk-test')
    expect((await withKey({ images: [] })).status).toBe(400)
    expect((await withKey({ images: [jpeg, jpeg, jpeg, jpeg] })).status).toBe(400) // more than 3 pages
    expect((await withKey({ images: [jpeg], budget: -5 })).status).toBe(400)
  })

  it('sends the photos with the cellar and returns ranked picks', async () => {
    const call = await setup('sk-test')
    const picks = {
      isWineList: true,
      currency: '£',
      picks: [{ producer: 'Vietti', name: 'Barbera d’Asti Tre Vigne', vintage: 2021.0, price: 48, byTheGlass: false, fit: 'great', why: 'Bright Piedmont red, like the Barolos you rate highly.', inCellar: false, retailEstimate: 20, valueNote: 'about 2.4× shop price' }],
      note: 'Good value in the Piedmont section.',
    }
    let sent: { systemInstruction: { parts: { text: string }[] }; contents: { parts: { text?: string; inlineData?: unknown }[] }[]; generationConfig: { responseMimeType?: string } } | undefined
    let headers: Headers | undefined
    vi.stubGlobal('fetch', async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent')
      headers = new Headers(init?.headers)
      sent = JSON.parse(String(init?.body))
      // A fenced JSON answer is fine too.
      return Response.json({ candidates: [{ content: { parts: [{ text: '```json\n' + JSON.stringify(picks) + '\n```' }] }, finishReason: 'STOP' }] })
    })
    try {
      const res = await call({ images: [jpeg, jpeg], food: 'brasato', budget: 60, lang: 'it' })
      expect(res.status).toBe(200)
      const { result } = (await res.json()) as { result: typeof picks & { deals: unknown[] } }
      expect(result.picks[0]).toMatchObject({ name: 'Barbera d’Asti Tre Vigne', vintage: 2021, fit: 'great', verdict: 'fair' })
      expect(result.deals).toEqual([]) // left out by the AI: filled in, not an error
      expect(headers!.get('x-goog-api-key')).toBe('sk-test')
      expect(sent!.generationConfig.responseMimeType).toBe('application/json')
      expect(sent!.systemInstruction.parts[1].text).toContain('## In the cellar')
      const parts = sent!.contents[0].parts
      expect(parts.filter((p) => p.inlineData)).toHaveLength(2)
      expect(parts.at(-2)!.text).toMatch(/brasato[\s\S]*up to 60[\s\S]*UK retail price[\s\S]*in Italian/)
      expect(parts.at(-1)!.text).toContain('JSON Schema')
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('drinking-window suggestions', () => {
  const wine = { id: 'wine-0000-0001', producer: 'Vietti', name: 'Barolo Rocche', vintage: 2019, type: 'red', appellation: 'Barolo DOCG', grapes: ['Nebbiolo'] }
  async function setup(key?: string) {
    const db = sqliteD1()
    const worker = ((await import(/* @vite-ignore */ new URL('../../worker/index.ts', import.meta.url).href)) as { default: { fetch: (req: Request, env: unknown) => Promise<Response> } }).default
    const env = { DB: db, ALLOW_NO_AUTH: 'true', ASSETS: { fetch: async () => new Response('index') }, ...(key ? { GEMINI_API_KEY: key } : {}) }
    return (body: unknown) => worker.fetch(new Request('https://cellar.test/api/windows', { method: 'POST', body: JSON.stringify(body) }), env)
  }

  it('checks the request and explains a missing key', async () => {
    expect((await (await setup())({ wines: [wine] })).status).toBe(501)
    const call = await setup('sk-test')
    expect((await call({ wines: [] })).status).toBe(400)
    expect((await call({ wines: [{ ...wine, vintage: 19 }] })).status).toBe(400)
    expect((await call({ wines: Array.from({ length: 41 }, (_, i) => ({ ...wine, id: `wine-${i}-00000` })) })).status).toBe(400)
  })

  it('reuses remembered windows and only asks the AI about new wines', async () => {
    const call = await setup('sk-test')
    const prompts: string[] = []
    vi.stubGlobal('fetch', async (_url: unknown, init?: RequestInit) => {
      const prompt = JSON.parse(String(init?.body)).contents[0].parts[0].text as string
      prompts.push(prompt)
      const ids = [...prompt.matchAll(/id=([\w-]+)/g)].map((m) => m[1])
      return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ windows: ids.map((id) => ({ id, drinkFrom: 2026, drinkTo: 2040, peakYear: null, confidence: 'high', note: 'n' })) }) }] }, finishReason: 'STOP' }] })
    })
    try {
      await call({ wines: [wine] })
      const other = { ...wine, id: 'wine-0000-0002', name: 'Barolo Ravera' }
      const res = (await (await call({ wines: [{ ...wine, id: 'wine-0000-0009' }, other] })).json()) as { windows: { id: string; drinkTo: number }[] }
      expect(prompts).toHaveLength(2)
      expect(prompts[1]).toContain('Barolo Ravera')
      expect(prompts[1]).not.toContain('Barolo Rocche')
      expect(res.windows.map((w) => w.id).sort()).toEqual(['wine-0000-0002', 'wine-0000-0009']) // the remembered one keeps the id asked for
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('returns tidy suggestions only for the wines asked about', async () => {
    const call = await setup('sk-test')
    const answer = {
      windows: [
        { id: wine.id, drinkFrom: 2034.0, drinkTo: 2027, peakYear: 2050, confidence: 'high', note: 'Classic Serralunga structure.' }, // years swapped, peak outside
        { id: 'not-asked-123', drinkFrom: 2020, drinkTo: 2030, peakYear: null, confidence: 'low', note: 'x' },
      ],
    }
    let prompt = ''
    vi.stubGlobal('fetch', async (_url: unknown, init?: RequestInit) => {
      prompt = JSON.parse(String(init?.body)).contents[0].parts[0].text
      return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(answer) }] }, finishReason: 'STOP' }] })
    })
    try {
      const res = await call({ wines: [wine], lang: 'it' })
      expect(res.status).toBe(200)
      expect(((await res.json()) as { windows: unknown[] }).windows).toEqual([{ id: wine.id, drinkFrom: 2027, drinkTo: 2034, peakYear: null, confidence: 'high', note: 'Classic Serralunga structure.' }])
      expect(prompt).toContain('id=wine-0000-0001 | Vietti — Barolo Rocche | 2019 | red | Barolo DOCG | Nebbiolo')
      expect(prompt).toContain('in Italian')
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('wishlist price hint endpoint', () => {
  async function setup(key?: string) {
    const worker = ((await import(/* @vite-ignore */ new URL('../../worker/index.ts', import.meta.url).href)) as { default: { fetch: (req: Request, env: unknown) => Promise<Response> } }).default
    const env = { DB: sqliteD1(), ALLOW_NO_AUTH: 'true', ASSETS: { fetch: async () => new Response('index') }, ...(key ? { GEMINI_API_KEY: key } : {}) }
    return (body: unknown) => worker.fetch(new Request('https://cellar.test/api/pricehint', { method: 'POST', body: JSON.stringify(body) }), env)
  }

  it('checks the request and explains a missing key', async () => {
    expect((await (await setup())({ producer: 'Gaja', name: 'Barbaresco' })).status).toBe(501)
    expect((await (await setup('sk-test'))({ producer: '', name: '' })).status).toBe(400)
  })

  it('remembers the answer: the same wine (any spelling) is answered from the database for 30 days', async () => {
    const call = await setup('sk-test')
    let aiCalls = 0
    vi.stubGlobal('fetch', async () => {
      aiCalls++
      return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ low: 30, high: 38, where: 'Good independents.' }) }] }, finishReason: 'STOP' }] })
    })
    try {
      const first = (await (await call({ producer: 'Château Léoville-Barton', name: 'Saint-Julien', vintage: 2016 })).json()) as { hint: object; cached?: boolean }
      const again = (await (await call({ producer: 'chateau leoville barton', name: 'SAINT JULIEN', vintage: 2016 })).json()) as { hint: object; cached?: boolean }
      expect(aiCalls).toBe(1)
      expect(again).toEqual({ hint: first.hint, cached: true, at: new Date().toISOString().slice(0, 10) })
      await call({ producer: 'Château Léoville-Barton', name: 'Saint-Julien', vintage: 2015 }) // another vintage: asked
      expect(aiCalls).toBe(2)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('asks for a UK price range and returns it tidied', async () => {
    const call = await setup('sk-test')
    let prompt = ''
    vi.stubGlobal('fetch', async (_url: string | URL | Request, init?: RequestInit) => {
      prompt = (JSON.parse(String(init?.body)) as { contents: { parts: { text: string }[] }[] }).contents[0].parts[0].text
      return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ low: 210.4, high: 160, where: 'Fine-wine merchants.' }) }] }, finishReason: 'STOP' }] })
    })
    try {
      const res = await call({ producer: 'Gaja', name: 'Barbaresco', vintage: 2016, lang: 'it' })
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ hint: { low: 160, high: 210, where: 'Fine-wine merchants.' } })
      expect(prompt).toMatch(/Gaja Barbaresco 2016[\s\S]*UK retail price range[\s\S]*in Italian/)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

import { labelPrompt, LabelSchema, tidyLabel } from '../src/shared/label'
import { aiErrorResponse, aiProvider, generateJson, type AiEnv } from './ai'
import { authorize, json, type AuthEnv } from './auth'
import { authStatus, handleAuth } from './passkeys'
import { handleAsk, handleBlends, handlePriceHint, handleWindows, handleWineList, type AskDb } from './ask'
import { handlePush, monthlyReminder, type PushDb } from './push'
import { BadRequest, sync, validate, type Db } from './sync'
import { priceHistory, remember, type FactsDb } from './facts'
import { validatePricesRequest } from '../src/shared/priceHistory'

interface Env extends AuthEnv, AiEnv {
  DB: D1Database
  ASSETS: Fetcher
}

const PHOTO_ID = /^[A-Za-z0-9-]{8,64}$/
const MAX_PHOTO = 1_500_000 // D1 rows max out at 2 MB; the app sends ~600px JPEGs

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req)

    try {
      // Public: tells the app a server exists and whether this browser is signed in.
      if (url.pathname === '/api/health') {
        const signedIn = !((await authorize(req, env)) instanceof Response)
        const { devices } = env.SESSION_SECRET ? await authStatus(req, env) : { devices: 0 }
        const ai = aiProvider(env)
        // `scan` = AI features available (label scan, chat, wine list, windows); `ai` names the provider.
        return json({ ok: true, authenticated: signedIn, devices, scan: signedIn && !!ai, ai: signedIn ? ai : null })
      }
      const auth = await handleAuth(req, env, url.pathname)
      if (auth) return auth

      const denied = await authorize(req, env)
      if (denied instanceof Response) return denied

      // POST /api/sync — push local changes, pull newer ones
      if (url.pathname === '/api/sync' && req.method === 'POST') {
        const body = validate(await req.json())
        const res = await sync(env.DB as unknown as Db, body)
        // A wine that no longer has a photo: drop the stored image.
        const dropped = body.changes.filter((c) => c.kind === 'wines' && (c.deleted || c.data?.hasPhoto === false)).map((c) => c.id)
        if (dropped.length) await env.DB.batch(dropped.map((id) => env.DB.prepare('DELETE FROM photos WHERE id = ?1').bind(id)))
        return json(res)
      }

      // GET/PUT /api/photo/:wineId — label photos (stored in D1)
      const photo = url.pathname.match(/^\/api\/photo\/([^/]+)$/)
      if (photo) {
        const id = photo[1]
        if (!PHOTO_ID.test(id)) return json({ error: 'Bad id' }, 400)
        if (req.method === 'PUT') {
          const size = Number(req.headers.get('content-length') ?? 0)
          if (size > MAX_PHOTO) return json({ error: 'Photo too large' }, 413)
          const body = await req.arrayBuffer()
          if (body.byteLength > MAX_PHOTO) return json({ error: 'Photo too large' }, 413)
          await env.DB.prepare('INSERT INTO photos (id, data, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT (id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at')
            .bind(id, body, Date.now())
            .run()
          return json({ ok: true })
        }
        if (req.method === 'GET') {
          const row = await env.DB.prepare('SELECT data, updated_at FROM photos WHERE id = ?1').bind(id).first<{ data: ArrayBuffer | number[]; updated_at: number }>()
          if (!row) return json({ error: 'Not found' }, 404)
          // D1 returns BLOBs as number arrays; SQLite drivers may return bytes directly.
          const bytes = row.data instanceof ArrayBuffer || ArrayBuffer.isView(row.data) ? row.data : new Uint8Array(row.data)
          return new Response(bytes as BodyInit, { headers: { 'content-type': 'image/jpeg', 'cache-control': 'private, max-age=86400', etag: `"${row.updated_at}"` } })
        }
      }

      // POST /api/scan — read a label with the AI; keys never leave the server
      if (url.pathname === '/api/scan' && req.method === 'POST') {
        const { image } = (await req.json()) as { image?: string }
        if (typeof image !== 'string' || image.length < 100 || image.length > 8_000_000) return json({ error: 'Send a base64 JPEG as `image`.' }, 400)
        try {
          const result = tidyLabel(await generateJson(env, { messages: [{ role: 'user', content: [{ type: 'image', data: image }, { type: 'text', text: labelPrompt() }] }] }, LabelSchema))
          // The window the AI read for this label goes into the wine memory too.
          if (result.isWineLabel && (result.drinkFrom != null || result.drinkTo != null))
            await remember(env.DB as unknown as FactsDb, result, 'window', { drinkFrom: result.drinkFrom, drinkTo: result.drinkTo, peakYear: null, confidence: result.confidence, note: result.tastingNote ?? '' }, 'scan')
          return json({ result })
        } catch (e) {
          return aiErrorResponse(e)
        }
      }

      // POST /api/ask — "Ask my cellar" chat
      if (url.pathname === '/api/ask' && req.method === 'POST') return handleAsk(req, env.DB as unknown as AskDb, env)

      // POST /api/winelist — restaurant wine-list scanner
      if (url.pathname === '/api/winelist' && req.method === 'POST') return handleWineList(req, env.DB as unknown as AskDb & FactsDb, env)

      // POST /api/pricehint — wishlist "where to buy": typical UK price range
      if (url.pathname === '/api/pricehint' && req.method === 'POST') return handlePriceHint(req, env.DB as unknown as FactsDb, env)

      // POST /api/prices — remembered price history for a list of wines (no AI call)
      if (url.pathname === '/api/prices' && req.method === 'POST') {
        const wines = validatePricesRequest(await req.json())
        if (!wines) return json({ error: 'Send {wines: [{id, producer, name, vintage}, …]} (up to 300).' }, 400)
        return json({ prices: await priceHistory(env.DB as unknown as FactsDb, wines) })
      }

      // POST /api/blends — published grape percentages
      if (url.pathname === '/api/blends' && req.method === 'POST') return handleBlends(req, env.DB as unknown as FactsDb, env)

      // POST /api/windows — drinking-window suggestions
      if (url.pathname === '/api/windows' && req.method === 'POST') return handleWindows(req, env.DB as unknown as FactsDb, env)

      if (url.pathname.startsWith('/api/push/')) {
        const res = await handlePush(req, env.DB as unknown as PushDb, url.pathname)
        if (res) return res
      }

      return json({ error: 'Not found' }, 404)
    } catch (e) {
      if (e instanceof BadRequest) return json({ error: e.message }, 400)
      if (e instanceof SyntaxError) return json({ error: 'Invalid JSON' }, 400)
      console.error(e)
      return json({ error: 'Server error' }, 500)
    }
  },

  // Cron (wrangler.jsonc "triggers"): the monthly drinking summary.
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(monthlyReminder(env.DB as unknown as PushDb))
  },
} satisfies ExportedHandler<Env>

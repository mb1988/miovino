import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { labelPrompt, LabelSchema, SCAN_MODELS, tidyLabel } from '../src/shared/label'
import { authorize, json, type AuthEnv } from './auth'
import { authStatus, handleAuth } from './passkeys'
import { handleAsk, handleWindows, handleWineList, type AskDb } from './ask'
import { handlePush, monthlyReminder, type PushDb } from './push'
import { BadRequest, sync, validate, type Db } from './sync'

interface Env extends AuthEnv {
  DB: D1Database
  ASSETS: Fetcher
  ANTHROPIC_API_KEY?: string
  SCAN_MODEL?: string
  ASK_MODEL?: string
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
        return json({ ok: true, authenticated: signedIn, devices, scan: signedIn && !!env.ANTHROPIC_API_KEY })
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

      // POST /api/scan — read a label with Claude; the API key never leaves the server
      if (url.pathname === '/api/scan' && req.method === 'POST') {
        if (!env.ANTHROPIC_API_KEY) return json({ error: 'Scanning is not configured on the server.' }, 501)
        const { image, model } = (await req.json()) as { image?: string; model?: string }
        if (typeof image !== 'string' || image.length < 100 || image.length > 8_000_000) return json({ error: 'Send a base64 JPEG as `image`.' }, 400)
        const chosen = SCAN_MODELS.includes(model as (typeof SCAN_MODELS)[number]) ? model! : (env.SCAN_MODEL ?? 'claude-opus-5-5')
        const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
        try {
          const response = await client.messages.parse({
            model: chosen,
            max_tokens: 16000,
            output_config: { effort: 'low', format: zodOutputFormat(LabelSchema) },
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } },
                  { type: 'text', text: labelPrompt() },
                ],
              },
            ],
          })
          if (response.stop_reason === 'refusal') return json({ error: 'The model declined to read this image. Try another photo.' }, 422)
          if (!response.parsed_output) return json({ error: 'Could not read the label. Try a sharper, closer photo.' }, 422)
          return json({ result: tidyLabel(response.parsed_output) })
        } catch (e) {
          if (e instanceof Anthropic.RateLimitError) return json({ error: 'Rate limited — try again in a moment.' }, 429)
          if (e instanceof Anthropic.AuthenticationError) return json({ error: 'The server API key was rejected.' }, 502)
          if (e instanceof Anthropic.APIError) return json({ error: `AI error: ${e.message}` }, 502)
          throw e
        }
      }

      // POST /api/ask — "Ask my cellar" chat
      if (url.pathname === '/api/ask' && req.method === 'POST') return handleAsk(req, env.DB as unknown as AskDb, env.ANTHROPIC_API_KEY, env.ASK_MODEL ?? 'claude-opus-5-5')

      // POST /api/winelist — restaurant wine-list scanner
      if (url.pathname === '/api/winelist' && req.method === 'POST') return handleWineList(req, env.DB as unknown as AskDb, env.ANTHROPIC_API_KEY, env.ASK_MODEL ?? 'claude-opus-5-5')

      // POST /api/windows — drinking-window suggestions
      if (url.pathname === '/api/windows' && req.method === 'POST') return handleWindows(req, env.ANTHROPIC_API_KEY, env.ASK_MODEL ?? 'claude-opus-5-5')

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

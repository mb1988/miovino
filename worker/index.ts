import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { labelPrompt, LabelSchema, SCAN_MODELS, tidyLabel } from '../src/shared/label'
import { authorize, json, type AuthEnv } from './auth'
import { BadRequest, sync, validate, type Db } from './sync'

interface Env extends AuthEnv {
  DB: D1Database
  PHOTOS: R2Bucket
  ASSETS: Fetcher
  ANTHROPIC_API_KEY?: string
  SCAN_MODEL?: string
}

const PHOTO_ID = /^[A-Za-z0-9-]{8,64}$/
const MAX_PHOTO = 3 * 1024 * 1024

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req)

    const who = await authorize(req, env)
    if (who instanceof Response) return who

    try {
      // GET /api/health — lets the app know a server is present and what it can do
      if (url.pathname === '/api/health') return json({ ok: true, scan: !!env.ANTHROPIC_API_KEY, user: who.email })

      // POST /api/sync — push local changes, pull newer ones
      if (url.pathname === '/api/sync' && req.method === 'POST') {
        const body = validate(await req.json())
        const res = await sync(env.DB as unknown as Db, body)
        // A wine that no longer has a photo: drop the stored image.
        const dropped = body.changes.filter((c) => c.kind === 'wines' && (c.deleted || c.data?.hasPhoto === false)).map((c) => `photos/${c.id}.jpg`)
        if (dropped.length) await env.PHOTOS.delete(dropped)
        return json(res)
      }

      // GET/PUT /api/photo/:wineId — label photos in R2
      const photo = url.pathname.match(/^\/api\/photo\/([^/]+)$/)
      if (photo) {
        const id = photo[1]
        if (!PHOTO_ID.test(id)) return json({ error: 'Bad id' }, 400)
        const key = `photos/${id}.jpg`
        if (req.method === 'PUT') {
          const size = Number(req.headers.get('content-length') ?? 0)
          if (size > MAX_PHOTO) return json({ error: 'Photo too large' }, 413)
          const body = await req.arrayBuffer()
          if (body.byteLength > MAX_PHOTO) return json({ error: 'Photo too large' }, 413)
          await env.PHOTOS.put(key, body, { httpMetadata: { contentType: 'image/jpeg' } })
          return json({ ok: true })
        }
        if (req.method === 'GET') {
          const obj = await env.PHOTOS.get(key)
          if (!obj) return json({ error: 'Not found' }, 404)
          return new Response(obj.body, { headers: { 'content-type': 'image/jpeg', 'cache-control': 'private, max-age=86400', etag: obj.httpEtag } })
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

      return json({ error: 'Not found' }, 404)
    } catch (e) {
      if (e instanceof BadRequest) return json({ error: e.message }, 400)
      if (e instanceof SyntaxError) return json({ error: 'Invalid JSON' }, 400)
      console.error(e)
      return json({ error: 'Server error' }, 500)
    }
  },
} satisfies ExportedHandler<Env>

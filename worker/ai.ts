import { z } from 'zod'
import { json } from './auth'

/**
 * One way to call an AI model, whichever provider has a key:
 *   1. Google Gemini (free tier)     GEMINI_API_KEY      model GEMINI_MODEL      (default gemini-flash-latest)
 *   2. OpenRouter (free models)      OPENROUTER_API_KEY  model OPENROUTER_MODEL  (default openrouter/free)
 *   3. Anthropic Claude (paid)       ANTHROPIC_API_KEY   model ANTHROPIC_MODEL   (default claude-opus-5-5)
 * Providers are tried in that order (or AI_PROVIDERS, e.g. "openrouter,gemini"). A rate limit, outage or an
 * unreadable answer moves on to the next one, so the free tiers back each other up.
 * Plain fetch, no SDKs: keys stay in the Worker and the bundle stays small.
 */

export interface AiEnv {
  GEMINI_API_KEY?: string
  GEMINI_MODEL?: string
  OPENROUTER_API_KEY?: string
  OPENROUTER_MODEL?: string
  ANTHROPIC_API_KEY?: string
  ANTHROPIC_MODEL?: string
  AI_PROVIDERS?: string
}

export type Part = { type: 'text'; text: string } | { type: 'image'; data: string } // data: base64 JPEG
export interface Turn {
  role: 'user' | 'assistant'
  content: string | Part[]
}
export interface AiRequest {
  system?: string[]
  messages: Turn[]
  maxTokens?: number
  json?: boolean
}
export interface AiAnswer {
  text: string
  truncated: boolean
  provider: ProviderId
}

export type ProviderId = 'gemini' | 'openrouter' | 'anthropic'
export const PROVIDER_NAMES: Record<ProviderId, string> = { gemini: 'Google Gemini', openrouter: 'OpenRouter', anthropic: 'Anthropic Claude' }

/** An answer we can show the user: status + message. */
export class AiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

interface Provider {
  id: ProviderId
  call(req: AiRequest): Promise<AiAnswer>
}

const TIMEOUT = 60_000

/** The providers that have a key, in the order they'll be tried. */
export function providers(env: AiEnv): Provider[] {
  const all: Record<ProviderId, Provider | null> = {
    gemini: env.GEMINI_API_KEY ? gemini(env.GEMINI_API_KEY, env.GEMINI_MODEL || 'gemini-flash-latest') : null,
    openrouter: env.OPENROUTER_API_KEY ? openrouter(env.OPENROUTER_API_KEY, env.OPENROUTER_MODEL || 'openrouter/free') : null,
    anthropic: env.ANTHROPIC_API_KEY ? anthropic(env.ANTHROPIC_API_KEY, env.ANTHROPIC_MODEL || 'claude-opus-5-5') : null,
  }
  const order = (env.AI_PROVIDERS || 'gemini,openrouter,anthropic').split(',').map((s) => s.trim()) as ProviderId[]
  return order.map((id) => all[id]).filter((p): p is Provider => !!p)
}

/** Name of the first provider that will be used, or null when AI is off. */
export function aiProvider(env: AiEnv): string | null {
  const first = providers(env)[0]
  return first ? PROVIDER_NAMES[first.id] : null
}

export const NO_AI = 'AI features need a free key on the server: GEMINI_API_KEY (aistudio.google.com) or OPENROUTER_API_KEY (openrouter.ai).'

/** Free text (chat). Tries each provider until one answers. */
export async function generateText(env: AiEnv, req: AiRequest): Promise<AiAnswer> {
  const list = providers(env)
  if (!list.length) throw new AiError(501, NO_AI)
  let last: AiError | undefined
  for (const p of list) {
    try {
      const answer = await p.call(req)
      if (answer.text.trim()) return answer
      last = new AiError(502, 'No answer came back. Try again.')
    } catch (e) {
      last = toAiError(e)
      console.warn(`AI ${p.id} failed: ${last.status} ${last.message}`)
    }
  }
  throw last!
}

/** A JSON answer checked against `schema`. An answer that doesn't fit counts as a failure and the next provider is tried. */
export async function generateJson<S extends z.ZodType>(env: AiEnv, req: AiRequest, schema: S): Promise<z.infer<S> & {}> {
  const list = providers(env)
  if (!list.length) throw new AiError(501, NO_AI)
  const withSchema = { ...req, json: true, messages: appendText(req.messages, jsonInstructions(schema)) }
  let last: AiError | undefined
  for (const p of list) {
    try {
      const answer = await p.call(withSchema)
      const parsed = schema.safeParse(parseJson(answer.text))
      if (parsed.success) return parsed.data as z.infer<S> & {}
      last = new AiError(502, 'The AI answer was incomplete. Try again.')
      console.warn(`AI ${p.id} returned JSON that doesn't fit: ${parsed.error.message.slice(0, 300)}`)
    } catch (e) {
      last = toAiError(e)
      console.warn(`AI ${p.id} failed: ${last.status} ${last.message}`)
    }
  }
  throw last!
}

/** Turns an AiError (or anything else) into the JSON error response the app shows. */
export function aiErrorResponse(e: unknown) {
  if (e instanceof AiError) return json({ error: e.message }, e.status)
  throw e
}

export function jsonInstructions(schema: z.ZodType) {
  return `Reply with only one JSON object, no markdown fences, no text before or after it. It must match this JSON Schema (use null where a field is unknown):\n${JSON.stringify(z.toJSONSchema(schema))}`
}

/** Pulls the JSON object out of a model's reply, tolerating ```json fences or stray text around it. */
export function parseJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  try {
    return JSON.parse(t)
  } catch {
    const start = t.indexOf('{')
    const end = t.lastIndexOf('}')
    if (start < 0 || end <= start) return undefined
    try {
      return JSON.parse(t.slice(start, end + 1))
    } catch {
      return undefined
    }
  }
}

function appendText(messages: Turn[], text: string): Turn[] {
  const last = messages.at(-1)!
  const parts: Part[] = typeof last.content === 'string' ? [{ type: 'text', text: last.content }] : last.content
  return [...messages.slice(0, -1), { role: last.role, content: [...parts, { type: 'text', text }] }]
}

const partsOf = (c: string | Part[]): Part[] => (typeof c === 'string' ? [{ type: 'text', text: c }] : c)

function toAiError(e: unknown): AiError {
  if (e instanceof AiError) return e
  if (e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')) return new AiError(504, 'The AI took too long to answer. Try again.')
  return new AiError(502, `AI error: ${(e as Error)?.message ?? e}`)
}

/** Maps an HTTP failure from any provider to a message for the owner. */
async function httpError(provider: ProviderId, res: Response): Promise<AiError> {
  const detail = (await res.text().catch(() => '')).slice(0, 300)
  const name = PROVIDER_NAMES[provider]
  if (res.status === 429) return new AiError(429, 'Rate limited — the free AI quota is used up for now. Try again in a minute.')
  if (res.status === 401 || res.status === 403) return new AiError(502, `The server's ${name} key was rejected.`)
  return new AiError(502, `${name} error ${res.status}${detail ? `: ${detail}` : ''}`)
}

// ——— Google Gemini (native API: JSON mode guarantees parseable output) ———
function gemini(key: string, model: string): Provider {
  return {
    id: 'gemini',
    async call(req) {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        signal: AbortSignal.timeout(TIMEOUT),
        body: JSON.stringify({
          ...(req.system?.length ? { systemInstruction: { parts: req.system.map((text) => ({ text })) } } : {}),
          contents: req.messages.map((m) => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: partsOf(m.content).map((p) => (p.type === 'text' ? { text: p.text } : { inlineData: { mimeType: 'image/jpeg', data: p.data } })),
          })),
          generationConfig: { maxOutputTokens: req.maxTokens ?? 8192, ...(req.json ? { responseMimeType: 'application/json' } : {}) },
        }),
      })
      if (!res.ok) throw await httpError('gemini', res)
      const body = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[]
        promptFeedback?: { blockReason?: string }
      }
      const c = body.candidates?.[0]
      if (body.promptFeedback?.blockReason || c?.finishReason === 'SAFETY' || c?.finishReason === 'PROHIBITED_CONTENT') throw new AiError(422, 'The AI declined this request. Try another photo or rephrase.')
      const text = (c?.content?.parts ?? []).filter((p) => !p.thought && p.text).map((p) => p.text).join('')
      return { text, truncated: c?.finishReason === 'MAX_TOKENS', provider: 'gemini' }
    },
  }
}

// ——— OpenRouter (OpenAI-compatible; "openrouter/free" picks a free model that can handle the request, images included) ———
function openrouter(key: string, model: string): Provider {
  return {
    id: 'openrouter',
    async call(req) {
      const messages = [
        ...(req.system?.length ? [{ role: 'system', content: req.system.join('\n\n') }] : []),
        ...req.messages.map((m) => ({
          role: m.role,
          content: typeof m.content === 'string' ? m.content : m.content.map((p) => (p.type === 'text' ? { type: 'text', text: p.text } : { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${p.data}` } })),
        })),
      ]
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}`, 'x-title': 'MioVino' },
        signal: AbortSignal.timeout(TIMEOUT),
        body: JSON.stringify({ model, messages, max_tokens: req.maxTokens ?? 8192 }),
      })
      if (!res.ok) throw await httpError('openrouter', res)
      const body = (await res.json()) as { choices?: { message?: { content?: string | null }; finish_reason?: string }[]; error?: { message?: string; code?: number } }
      // OpenRouter can answer 200 with an error from the upstream model.
      if (body.error) throw new AiError(body.error.code === 429 ? 429 : 502, `OpenRouter: ${body.error.message ?? 'error'}`)
      const choice = body.choices?.[0]
      return { text: choice?.message?.content ?? '', truncated: choice?.finish_reason === 'length', provider: 'openrouter' }
    },
  }
}

// ——— Anthropic Claude (paid; used only when its key is set) ———
function anthropic(key: string, model: string): Provider {
  return {
    id: 'anthropic',
    async call(req) {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        signal: AbortSignal.timeout(TIMEOUT),
        body: JSON.stringify({
          model,
          max_tokens: req.maxTokens ?? 8192,
          ...(req.system?.length ? { system: req.system.map((text) => ({ type: 'text', text })) } : {}),
          messages: req.messages.map((m) => ({
            role: m.role,
            content: partsOf(m.content).map((p) => (p.type === 'text' ? { type: 'text', text: p.text } : { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: p.data } })),
          })),
        }),
      })
      if (!res.ok) throw await httpError('anthropic', res)
      const body = (await res.json()) as { content?: { type: string; text?: string }[]; stop_reason?: string }
      if (body.stop_reason === 'refusal') throw new AiError(422, 'The AI declined this request. Try another photo or rephrase.')
      const text = (body.content ?? []).flatMap((b) => (b.type === 'text' && b.text ? [b.text] : [])).join('\n')
      return { text, truncated: body.stop_reason === 'max_tokens', provider: 'anthropic' }
    },
  }
}

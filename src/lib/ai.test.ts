import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

// Worker code is imported by URL so its types stay out of the app build (see sync.test.ts).
interface AiModule {
  aiProvider: (env: Record<string, string>) => string | null
  generateText: (env: Record<string, string>, req: unknown) => Promise<{ text: string; truncated: boolean; provider: string }>
  generateJson: (env: Record<string, string>, req: unknown, schema: z.ZodType) => Promise<unknown>
  parseJson: (text: string) => unknown
}
const ai = (await import(/* @vite-ignore */ new URL('../../worker/ai.ts', import.meta.url).href)) as AiModule

const Schema = z.object({ name: z.string(), year: z.number().nullable() })
const gem = (text: string) => Response.json({ candidates: [{ content: { parts: [{ text: 'thinking…', thought: true }, { text }] }, finishReason: 'STOP' }] })
const router = (text: string) => Response.json({ choices: [{ message: { content: text }, finish_reason: 'stop' }] })
const ask = { messages: [{ role: 'user', content: 'Hi' }] }

afterEach(() => vi.unstubAllGlobals())

describe('AI providers', () => {
  it('uses the free providers first and names the active one', () => {
    expect(ai.aiProvider({})).toBeNull()
    expect(ai.aiProvider({ ANTHROPIC_API_KEY: 'a', OPENROUTER_API_KEY: 'o' })).toBe('OpenRouter')
    expect(ai.aiProvider({ ANTHROPIC_API_KEY: 'a', GEMINI_API_KEY: 'g' })).toBe('Google Gemini')
    expect(ai.aiProvider({ GEMINI_API_KEY: 'g', ANTHROPIC_API_KEY: 'a', AI_PROVIDERS: 'anthropic,gemini' })).toBe('Anthropic Claude')
  })

  it('says how to switch AI on when there is no key, and when a saved key is empty', async () => {
    await expect(ai.generateText({}, ask)).rejects.toMatchObject({ status: 501, message: expect.stringMatching(/GEMINI_API_KEY/) })
    // A failed paste in a Windows terminal stores just ^V (+ a line ending).
    await expect(ai.generateText({ GEMINI_API_KEY: '\x16\r\n' }, ask)).rejects.toMatchObject({ status: 501, message: expect.stringMatching(/empty.*Cloudflare dashboard/) })
  })

  it('skips Gemini thought parts', async () => {
    vi.stubGlobal('fetch', async () => gem('Ciao!'))
    expect(await ai.generateText({ GEMINI_API_KEY: 'g' }, ask)).toEqual({ text: 'Ciao!', truncated: false, provider: 'gemini' })
  })

  it('falls back to OpenRouter when Gemini is rate limited', async () => {
    const urls: string[] = []
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      urls.push(url)
      if (url.includes('googleapis')) return new Response('quota', { status: 429 })
      expect(JSON.parse(String(init.body)).model).toBe('openrouter/free')
      return router('Sure: {"name": "Barolo", "year": 2019} enjoy')
    })
    const out = await ai.generateJson({ GEMINI_API_KEY: 'g', OPENROUTER_API_KEY: 'o' }, ask, Schema)
    expect(out).toEqual({ name: 'Barolo', year: 2019 })
    expect(urls).toEqual(['https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent', 'https://openrouter.ai/api/v1/chat/completions'])
  })

  it('treats an answer that does not fit the schema as a failure, and reports the last error', async () => {
    vi.stubGlobal('fetch', async (url: string) => (url.includes('googleapis') ? gem('{"name": 42}') : new Response('slow down', { status: 429 })))
    await expect(ai.generateJson({ GEMINI_API_KEY: 'g', OPENROUTER_API_KEY: 'o' }, ask, Schema)).rejects.toMatchObject({ status: 429 })
  })

  it("sends images in each provider's own format", async () => {
    const bodies: unknown[] = []
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)))
      return url.includes('anthropic') ? Response.json({ content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn' }) : new Response('down', { status: 503 })
    })
    const req = { system: ['Be brief.'], messages: [{ role: 'user', content: [{ type: 'image', data: 'AAAA' }, { type: 'text', text: 'What is this?' }] }] }
    const out = await ai.generateText({ GEMINI_API_KEY: 'g', OPENROUTER_API_KEY: 'o', ANTHROPIC_API_KEY: 'a' }, req)
    expect(out.provider).toBe('anthropic')
    expect(JSON.stringify(bodies[0])).toContain('"inlineData":{"mimeType":"image/jpeg","data":"AAAA"}')
    expect(JSON.stringify(bodies[1])).toContain('"url":"data:image/jpeg;base64,AAAA"')
    expect(JSON.stringify(bodies[2])).toContain('"source":{"type":"base64","media_type":"image/jpeg","data":"AAAA"}')
  })

  it('tolerates a key pasted with quotes, spaces or a NAME= prefix, and explains a rejected key', async () => {
    const keys: string[] = []
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      keys.push(new Headers(init.headers).get('x-goog-api-key')!)
      return Response.json({ error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT' } }, { status: 400 })
    })
    await expect(ai.generateText({ GEMINI_API_KEY: ' GEMINI_API_KEY="AIzaTest" ' }, ask)).rejects.toMatchObject({ message: expect.stringContaining('npx wrangler secret put GEMINI_API_KEY') })
    expect(keys).toEqual(['AIzaTest'])
    expect(ai.aiProvider({ GEMINI_API_KEY: '  ' })).toBeNull()
    // A paste stored with bracketed-paste markers, a ^V, a zero-width space and a Windows line ending.
    keys.length = 0
    await ai.generateText({ GEMINI_API_KEY: '\x1b[200~AQ.Ab8Test\u200b\x16\x1b[201~\r\n' }, ask).catch(() => undefined)
    expect(keys).toEqual(['AQ.Ab8Test'])
  })

  it('reads JSON out of fenced or chatty replies', () => {
    expect(ai.parseJson('```json\n{"a":1}\n```')).toEqual({ a: 1 })
    expect(ai.parseJson('Here you go: {"a":{"b":2}} — cheers')).toEqual({ a: { b: 2 } })
    expect(ai.parseJson('no json')).toBeUndefined()
  })
})

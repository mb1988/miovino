import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { MAX_WINDOW_WINES, tidyWindows, validateWindowsRequest, windowsPrompt, WindowsSchema } from '../src/shared/windows'
import { MAX_LIST_PAGES, validateWineListRequest, wineListPrompt, WineListSchema } from '../src/shared/winelist'
import { drinkStatus, type DrinkStatus } from '../src/shared/status'
import { json } from './auth'

/** "Ask my cellar": a chat with Claude that knows the synced cellar, tastings and wishlist. */

interface Row {
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>
}
export interface AskDb {
  prepare(sql: string): Row
}

export interface AskTurn {
  role: 'user' | 'assistant'
  content: string
}

const MAX_TURNS = 40
const MAX_CHARS = 4000

export function validateTurns(body: unknown): AskTurn[] | null {
  const turns = (body as { messages?: unknown })?.messages
  if (!Array.isArray(turns) || !turns.length || turns.length > MAX_TURNS) return null
  for (const [i, t] of turns.entries()) {
    const ok = t && typeof t === 'object' && (t.role === 'user' || t.role === 'assistant') && typeof t.content === 'string' && t.content.trim() && t.content.length <= MAX_CHARS
    if (!ok) return null
    // Alternating, starting and ending with the user.
    if ((i % 2 === 0) !== (t.role === 'user')) return null
  }
  return turns.at(-1)!.role === 'user' ? (turns as AskTurn[]) : null
}

const INSTRUCTIONS = `You are the sommelier inside MioVino, a private wine-cellar app. You talk to the cellar's owner about their own wines.

- Answer from the cellar data below. When you recommend a bottle, name it exactly as listed and say where it is (location / rack slot) if known.
- Prefer bottles that are ready or closing soon; mention when something is past its window or still needs time.
- Their own ratings and tasting notes matter more than general reputation.
- For food pairing, pick from what they own first; suggest buying only when nothing fits.
- Be concise and warm: a short answer, a few bullet points at most. Use British English (unless told otherwise below) and the currency shown.
- If the data doesn't say, say so rather than inventing details about their bottles. General wine knowledge is fine when labelled as such.`

type Rec = Record<string, unknown>
const STATUS_WORDS: Record<DrinkStatus, string> = { past: 'past its window', soon: 'drink soon', ready: 'ready', approaching: 'opens next year', hold: 'hold', unknown: 'no window' }
const str = (v: unknown) => (v == null || v === '' ? '' : String(v))

/** A compact text snapshot of the cellar for the system prompt. */
export async function cellarSnapshot(db: AskDb, now = new Date()) {
  const { results } = await db.prepare("SELECT kind, id, data FROM records WHERE kind IN ('wines', 'bottles', 'tastings', 'wishlist') AND deleted = 0").all<{ kind: string; id: string; data: string }>()
  const by: Record<string, { id: string; d: Rec }[]> = { wines: [], bottles: [], tastings: [], wishlist: [] }
  for (const r of results) by[r.kind]?.push({ id: r.id, d: JSON.parse(r.data) as Rec })
  const year = now.getUTCFullYear()

  const bottlesOf = new Map<string, Rec[]>()
  for (const b of by.bottles) bottlesOf.set(str(b.d.wineId), [...(bottlesOf.get(str(b.d.wineId)) ?? []), b.d])
  const tastingsOf = new Map<string, Rec[]>()
  for (const t of by.tastings) tastingsOf.set(str(t.d.wineId), [...(tastingsOf.get(str(t.d.wineId)) ?? []), t.d])

  const lines: string[] = []
  const gone: string[] = []
  for (const { id, d: w } of by.wines.sort((a, b) => str(a.d.producer).localeCompare(str(b.d.producer)))) {
    const bottles = bottlesOf.get(id) ?? []
    const inCellar = bottles.filter((b) => b.status === 'cellar')
    const name = `${str(w.producer)} ${str(w.name)} ${w.vintage ?? 'NV'}`.trim()
    const tastings = (tastingsOf.get(id) ?? []).sort((a, b) => str(b.date).localeCompare(str(a.date)))
    const tasted = tastings
      .slice(0, 3)
      .map((t) => [t.date, t.rating != null ? `${t.rating}/5` : '', t.buyAgain ? `buy again: ${t.buyAgain}` : '', t.food ? `with ${t.food}` : '', t.notes ? `"${str(t.notes).slice(0, 200)}"` : ''].filter(Boolean).join(', '))
    if (!inCellar.length) {
      if (tasted.length) gone.push(`- ${name} — drunk; ${tasted.join(' | ')}`)
      continue
    }
    const where = [...new Set(inCellar.map((b) => [b.location, b.slot].filter(Boolean).join(' ')).filter(Boolean))]
    const prices = inCellar.map((b) => b.purchasePrice).filter((p): p is number => typeof p === 'number')
    const window = w.drinkFrom || w.drinkTo ? `${w.drinkFrom ?? '?'}–${w.drinkTo ?? '?'} (${STATUS_WORDS[drinkStatus(w as { drinkFrom?: number; drinkTo?: number }, year)]})` : 'no window'
    const facts = [
      str(w.type),
      [w.appellation, w.region, w.country].filter(Boolean).join(', '),
      Array.isArray(w.grapes) && w.grapes.length ? (w.grapes as string[]).join('/') : '',
      `window ${window}`,
      `${inCellar.length} bottle${inCellar.length > 1 ? 's' : ''}${where.length ? ` at ${where.join('; ')}` : ''}`,
      prices.length ? `paid ${prices.join('/')}` : '',
      w.favourite ? 'favourite' : '',
      w.personalNotes ? `my notes: "${str(w.personalNotes).slice(0, 200)}"` : '',
      tasted.length ? `tasted: ${tasted.join(' | ')}` : '',
    ].filter(Boolean)
    lines.push(`- ${name} — ${facts.join('; ')}`)
  }
  const wish = by.wishlist.filter((i) => !i.d.done).map((i) => `- ${[i.d.producer, i.d.name, i.d.vintage].filter((x) => x != null && x !== '').join(' ')}${i.d.note ? ` (${str(i.d.note)})` : ''}`)

  return [
    `Today is ${now.toISOString().slice(0, 10)}.`,
    `## In the cellar (${lines.length} wine${lines.length === 1 ? '' : 's'})`,
    lines.join('\n') || '(empty)',
    gone.length ? `## Already drunk\n${gone.join('\n')}` : '',
    wish.length ? `## Wishlist\n${wish.join('\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')
}

export async function handleAsk(req: Request, db: AskDb, apiKey: string | undefined, model: string) {
  if (!apiKey) return json({ error: 'The chat needs a Claude API key on the server (ANTHROPIC_API_KEY).' }, 501)
  const body = (await req.json()) as { lang?: unknown }
  const turns = validateTurns(body)
  if (!turns) return json({ error: 'Send {messages: [{role, content}, …]} alternating, ending with the user.' }, 400)

  const client = new Anthropic({ apiKey })
  try {
    const response = await client.beta.messages.create({
      model,
      max_tokens: 16000,
      output_config: { effort: 'low' },
      // If the model declines, the API retries on a suitable fallback model within the same call.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: [
        { type: 'text', text: INSTRUCTIONS },
        // The cellar changes rarely, so cache it: follow-up questions reuse it at a fraction of the cost.
        { type: 'text', text: await cellarSnapshot(db), cache_control: { type: 'ephemeral' } },
        // After the cached block, so switching language doesn't invalidate the cache.
        ...(body.lang === 'it' ? [{ type: 'text' as const, text: 'The owner is using the app in Italian: reply in Italian.' }] : []),
      ],
      messages: turns,
    })
    if (response.stop_reason === 'refusal') return json({ error: 'Claude declined to answer that. Try rephrasing.' }, 422)
    const text = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('\n').trim()
    if (!text) return json({ error: 'No answer came back. Try again.' }, 502)
    return json({ answer: text, truncated: response.stop_reason === 'max_tokens' })
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json({ error: 'Rate limited — try again in a moment.' }, 429)
    if (e instanceof Anthropic.AuthenticationError) return json({ error: 'The server API key was rejected.' }, 502)
    if (e instanceof Anthropic.APIError) return json({ error: `AI error: ${e.message}` }, 502)
    throw e
  }
}

/** POST /api/winelist — read restaurant wine-list photos and pick bottles for the owner's taste. */
export async function handleWineList(req: Request, db: AskDb, apiKey: string | undefined, model: string) {
  if (!apiKey) return json({ error: 'The wine-list scanner needs a Claude API key on the server (ANTHROPIC_API_KEY).' }, 501)
  const body = validateWineListRequest(await req.json())
  if (!body) return json({ error: `Send 1–${MAX_LIST_PAGES} photos of the list as base64 JPEG in "images".` }, 400)

  const client = new Anthropic({ apiKey })
  try {
    const response = await client.beta.messages.parse({
      model,
      max_tokens: 16000,
      output_config: { effort: 'medium', format: betaZodOutputFormat(WineListSchema) },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: [
        { type: 'text', text: 'You are a sommelier helping the owner of a private wine cellar choose from a restaurant wine list. Their cellar and tasting history follow.' },
        { type: 'text', text: await cellarSnapshot(db), cache_control: { type: 'ephemeral' } },
      ],
      messages: [
        {
          role: 'user',
          content: [
            ...body.images.map((data) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data } })),
            { type: 'text', text: wineListPrompt(body) },
          ],
        },
      ],
    })
    if (response.stop_reason === 'refusal') return json({ error: 'Claude declined to read these photos. Try clearer pictures of the list.' }, 422)
    const result = response.parsed_output
    if (!result) return json({ error: 'Could not read the list. Try a sharper, closer photo of each page.' }, 422)
    if (!result.isWineList) return json({ error: "That doesn't look like a wine list. Photograph the pages with the wines." }, 422)
    return json({ result: { ...result, picks: result.picks.slice(0, 5).map((p) => ({ ...p, vintage: p.vintage == null ? null : Math.round(p.vintage) })) } })
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json({ error: 'Rate limited — try again in a moment.' }, 429)
    if (e instanceof Anthropic.AuthenticationError) return json({ error: 'The server API key was rejected.' }, 502)
    if (e instanceof Anthropic.APIError) return json({ error: `AI error: ${e.message}` }, 502)
    throw e
  }
}

/** POST /api/windows — suggest drinking windows for wines that have none. The app shows them for the owner to accept. */
export async function handleWindows(req: Request, apiKey: string | undefined, model: string) {
  if (!apiKey) return json({ error: 'Window suggestions need a Claude API key on the server (ANTHROPIC_API_KEY).' }, 501)
  const body = validateWindowsRequest(await req.json())
  if (!body) return json({ error: `Send 1–${MAX_WINDOW_WINES} wines as {wines: [{id, producer, name, vintage, type, …}]}.` }, 400)

  const client = new Anthropic({ apiKey })
  try {
    const response = await client.beta.messages.parse({
      model,
      max_tokens: 16000,
      output_config: { effort: 'low', format: betaZodOutputFormat(WindowsSchema) },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      messages: [{ role: 'user', content: windowsPrompt(body.wines, body.lang) }],
    })
    if (response.stop_reason === 'refusal') return json({ error: 'Claude declined this request. Try fewer wines.' }, 422)
    if (!response.parsed_output) return json({ error: 'No suggestions came back. Try again.' }, 502)
    return json({ windows: tidyWindows(body.wines, response.parsed_output) })
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json({ error: 'Rate limited — try again in a moment.' }, 429)
    if (e instanceof Anthropic.AuthenticationError) return json({ error: 'The server API key was rejected.' }, 502)
    if (e instanceof Anthropic.APIError) return json({ error: `AI error: ${e.message}` }, 502)
    throw e
  }
}

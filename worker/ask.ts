import { MAX_WINDOW_WINES, tidyWindows, validateWindowsRequest, windowsPrompt, WindowsSchema } from '../src/shared/windows'
import { MAX_LIST_PAGES, tidyWineList, validateWineListRequest, wineListPrompt, WineListSchema } from '../src/shared/winelist'
import { drinkStatus, type DrinkStatus } from '../src/shared/status'
import { priceHintPrompt, PriceHintSchema, tidyPriceHint, validatePriceHintRequest } from '../src/shared/whereToBuy'
import { aiErrorResponse, generateJson, generateText, type AiEnv } from './ai'
import { json } from './auth'
import { recall, remember, type FactsDb } from './facts'
import { blendsPrompt, BlendsSchema, grapesDisplay, MAX_BLEND_WINES, tidyBlends, validateBlendsRequest, type BlendSuggestion } from '../src/shared/blend'
import type { PriceHint } from '../src/shared/whereToBuy'
import type { WindowSuggestion } from '../src/shared/windows'

/** "Ask my cellar": a chat with the AI that knows the synced cellar, tastings and wishlist. */

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
      Array.isArray(w.grapes) && w.grapes.length ? grapesDisplay(w.grapes as string[], w.grapePct as Record<string, number> | undefined).join('/') : '',
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

export async function handleAsk(req: Request, db: AskDb, env: AiEnv) {
  const body = (await req.json()) as { lang?: unknown }
  const turns = validateTurns(body)
  if (!turns) return json({ error: 'Send {messages: [{role, content}, …]} alternating, ending with the user.' }, 400)
  try {
    const answer = await generateText(env, {
      system: [
        INSTRUCTIONS,
        await cellarSnapshot(db),
        ...(body.lang === 'it' ? ['The owner is using the app in Italian: reply in Italian.'] : []),
      ],
      messages: turns,
    })
    return json({ answer: answer.text.trim(), truncated: answer.truncated })
  } catch (e) {
    return aiErrorResponse(e)
  }
}

/** POST /api/winelist — read restaurant wine-list photos and pick bottles for the owner's taste. */
export async function handleWineList(req: Request, db: AskDb & FactsDb, env: AiEnv) {
  const body = validateWineListRequest(await req.json())
  if (!body) return json({ error: `Send 1–${MAX_LIST_PAGES} photos of the list as base64 JPEG in "images".` }, 400)
  try {
    const result = await generateJson(
      env,
      {
        system: ['You are a sommelier helping the owner of a private wine cellar choose from a restaurant wine list. Their cellar and tasting history follow.', await cellarSnapshot(db)],
        messages: [{ role: 'user', content: [...body.images.map((data) => ({ type: 'image' as const, data })), { type: 'text', text: wineListPrompt(body) }] }],
      },
      WineListSchema,
    )
    if (!result.isWineList) return json({ error: "That doesn't look like a wine list. Photograph the pages with the wines." }, 422)
    const tidy = tidyWineList(result)
    // Every shop-price estimate goes into the wine memory (and its price history).
    for (const w of [...tidy.picks, ...(tidy.deals ?? [])])
      if (w.retailEstimate != null) await remember(db, w, 'price', { low: w.retailEstimate, high: w.retailEstimate, where: '' }, 'winelist')
    return json({ result: tidy })
  } catch (e) {
    return aiErrorResponse(e)
  }
}

/** POST /api/pricehint — a typical UK price range for a wishlist wine, and who stocks it. The app caches it on the item. */
export async function handlePriceHint(req: Request, db: FactsDb, env: AiEnv) {
  const body = validatePriceHintRequest(await req.json())
  if (!body) return json({ error: 'Send {producer, name, vintage?} for one wine.' }, 400)
  // Asked within the last 30 days (by anyone, from any screen)? Answer from memory: no AI call.
  // A remembered estimate from a wine list has no "where", so only a full hint counts.
  const known = await recall<PriceHint>(db, body, 'price')
  if (known?.data.where) return json({ hint: known.data, cached: true, at: new Date(known.at).toISOString().slice(0, 10) })
  try {
    const hint = tidyPriceHint(await generateJson(env, { messages: [{ role: 'user', content: priceHintPrompt(body) }] }, PriceHintSchema))
    await remember(db, body, 'price', hint, 'pricehint')
    return json({ hint })
  } catch (e) {
    return aiErrorResponse(e)
  }
}

/** POST /api/windows — suggest drinking windows for wines that have none. The app shows them for the owner to accept. */
export async function handleWindows(req: Request, db: FactsDb, env: AiEnv) {
  const body = validateWindowsRequest(await req.json())
  if (!body) return json({ error: `Send 1–${MAX_WINDOW_WINES} wines as {wines: [{id, producer, name, vintage, type, …}]}.` }, 400)
  // Windows remembered within the year are reused; only the rest go to the AI.
  const known: WindowSuggestion[] = []
  const ask = []
  for (const w of body.wines) {
    const k = await recall<Omit<WindowSuggestion, 'id'>>(db, w, 'window')
    if (k) known.push({ ...k.data, id: w.id })
    else ask.push(w)
  }
  if (!ask.length) return json({ windows: known })
  try {
    const result = await generateJson(env, { messages: [{ role: 'user', content: windowsPrompt(ask, body.lang) }] }, WindowsSchema)
    const fresh = tidyWindows(ask, result)
    for (const s of fresh) {
      const w = ask.find((x) => x.id === s.id)!
      if (s.drinkFrom != null || s.drinkTo != null) await remember(db, w, 'window', { drinkFrom: s.drinkFrom, drinkTo: s.drinkTo, peakYear: s.peakYear, confidence: s.confidence, note: s.note }, 'windows')
    }
    return json({ windows: [...known, ...fresh] })
  } catch (e) {
    return aiErrorResponse(e)
  }
}

/** POST /api/blends — grape percentages the producer has published (high confidence, adding up to 100), remembered per wine. */
export async function handleBlends(req: Request, db: FactsDb, env: AiEnv) {
  const wines = validateBlendsRequest(await req.json())
  if (!wines) return json({ error: `Send 1–${MAX_BLEND_WINES} wines as {wines: [{id, producer, name, vintage, …}]}.` }, 400)
  const known: BlendSuggestion[] = []
  const ask = []
  for (const w of wines) {
    const k = await recall<Omit<BlendSuggestion, 'id'>>(db, w, 'blend')
    if (k) known.push({ ...k.data, id: w.id })
    else ask.push(w)
  }
  if (!ask.length) return json({ blends: known })
  try {
    const fresh = tidyBlends(ask, await generateJson(env, { messages: [{ role: 'user', content: blendsPrompt(ask) }] }, BlendsSchema))
    for (const b of fresh) await remember(db, ask.find((w) => w.id === b.id)!, 'blend', { pct: b.pct, source: b.source }, 'blends')
    return json({ blends: [...known, ...fresh] })
  } catch (e) {
    return aiErrorResponse(e)
  }
}

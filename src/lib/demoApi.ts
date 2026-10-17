import type { LabelResult } from '../shared/label'
import type { WineListResult } from '../shared/winelist'
import type { PriceHint } from '../shared/whereToBuy'
import type { WindowSuggestion, WindowWine } from '../shared/windows'
import { asRemote, db, loadCellar } from './db'
import { demoData } from './demoData'
import { getLang, t } from './i18n'
import { suggest } from './recommend'
import { foodsFromText } from './pairing'
import { currentYear } from './status'

/** Fills the demo database the first time (or after "Reset demo"). Timestamps are kept as generated. */
export async function seedDemo(force = false) {
  if (!force && (await db.wines.count()) > 0) return
  const data = demoData()
  await asRemote(() =>
    db.transaction('rw', [db.wines, db.bottles, db.tastings, db.locations, db.wishlist, db.tombstones, db.meta], async () => {
      // Clearing an empty table is cheap. Then bulkAdd, not bulkPut: with the sync hooks installed,
      // a put first reads each key back to tell create from update, which the empty tables don't need.
      await Promise.all([db.wines.clear(), db.bottles.clear(), db.tastings.clear(), db.locations.clear(), db.wishlist.clear(), db.tombstones.clear()])
      await Promise.all([db.wines.bulkAdd(data.wines), db.bottles.bulkAdd(data.bottles), db.tastings.bulkAdd(data.tastings), db.locations.bulkAdd(data.locations), db.wishlist.bulkAdd(data.wishlist)])
      // The demo server stores nothing, so don't make the first sync re-send all the sample records to it.
      await db.meta.put({ key: 'lastPush', value: Date.now() })
    }),
  )
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
let demoEmail: string | null = null
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms)) // AI calls take a moment; so does the demo

/** Answers every /api request in the browser, so the demo works with no server and never touches real data. */
export function installDemoApi() {
  const real = window.fetch.bind(window)
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input), window.location.href)
    if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/')) return real(input, init)
    let body: Record<string, unknown> = {}
    try {
      if (typeof init?.body === 'string') body = JSON.parse(init.body) as Record<string, unknown>
    } catch {
      /* not JSON (e.g. a photo upload): the route doesn't need it */
    }
    return route(url.pathname, init?.method ?? 'GET', body)
  }
}

async function route(path: string, method: string, body: Record<string, unknown>): Promise<Response> {
  if (path === '/api/health') return json({ ok: true, authenticated: true, devices: 1, scan: true, ai: 'Demo AI' })
  if (path === '/api/sync') return json({ cursor: 0, changes: [], more: false, accepted: (body.changes as unknown[] | undefined)?.length ?? 0 })
  if (path === '/api/auth/devices' && method === 'GET') return json({ devices: [{ id: 'demo', device_name: t('Demo device'), created_at: Date.now() - 86_400_000 * 30, last_used_at: Date.now() }] })
  if (path === '/api/scan') return pause(1200).then(() => json({ result: demoLabel() }))
  if (path === '/api/ask') return pause(900).then(async () => json({ answer: await demoAnswer(body.messages as { role: string; content: string }[]) }))
  if (path === '/api/winelist') return pause(1500).then(async () => json({ result: await demoWineList(body.food as string | undefined, body.explore === true) }))
  // Email reminders: the demo remembers the address for this visit and pretends to send.
  if (path === '/api/email') {
    if (method === 'POST') demoEmail = typeof body.address === 'string' && body.address.includes('@') ? body.address.trim() : null
    return json(method === 'POST' ? { ok: true, address: demoEmail } : { available: true, address: demoEmail })
  }
  if (path === '/api/email/test') return pause(600).then(() => json({ sent: !!demoEmail, reason: demoEmail ? undefined : 'no-address' }))
  if (path === '/api/fetchlist')
    return pause(700).then(() =>
      json({
        title: t('Demo: Trattoria wine list'),
        text: ['Wine list', 'Barolo Castiglione, Vietti 2019 £180', 'Barbaresco, Gaja 2016 £95', 'Geyserville, Ridge 2021 £70', 'Chablis 1er Cru Montmains, Brocard 2022 £48'].join('\n'),
        pdfs: [],
      }),
    )
  if (path === '/api/pricehint') {
    demoPriced.add(`${body.producer}|${body.name}`) // the demo "remembers" it, like the real server
    return pause(800).then(() => json({ hint: demoPriceHint(String(body.name ?? '')) }))
  }
  if (path === '/api/prices') return json({ prices: await demoPrices(body.wines as { id: string }[]) })
  if (path === '/api/blends') return pause(900).then(() => json({ blends: demoBlends(body.wines as { id: string; grapes?: string[] }[]) }))
  if (path === '/api/windows') return pause(1000).then(() => json({ windows: (body.wines as WindowWine[]).map(demoWindow) }))
  return json({ error: t('Not available in the demo.') }, 501)
}

function demoLabel(): LabelResult {
  return {
    isWineLabel: true,
    producer: 'Vietti',
    name: 'Barolo Castiglione',
    vintage: currentYear() - 6,
    type: 'red',
    country: 'Italy',
    region: 'Piedmont',
    appellation: 'Barolo DOCG',
    grapes: ['Nebbiolo'],
    grapePercents: [100],
    alcohol: 14.5,
    bottleSizeMl: 750,
    drinkFrom: currentYear(),
    drinkTo: currentYear() + 14,
    tastingNote: t('Demo label: rose, red cherry and liquorice, with firm, fine tannins.'),
    pairing: t('Braised beef, truffle pasta, aged cheeses'),
    confidence: 'high',
  }
}

/** A real recommendation from the demo cellar, written like the AI would. */
async function demoAnswer(turns: { role: string; content: string }[] = []) {
  const question = turns.at(-1)?.content ?? ''
  const cellar = await loadCellar()
  const picks = suggest(cellar, { type: 'any', occasion: 'any', readyOnly: true, dish: question }).slice(0, 3)
  const where = (w: (typeof picks)[number]['wine']) => {
    const b = w.bottles.find((x) => x.status === 'cellar')
    return [b?.location, b?.slot].filter(Boolean).join(' ')
  }
  const lines = picks.map(({ wine, reasons }) => `- **${wine.producer} ${wine.name} ${wine.vintage ?? 'NV'}**${where(wine) ? ` (${where(wine)})` : ''} — ${reasons.slice(0, 2).join('; ')}`)
  const intro = foodsFromText(question).length ? t('From your cellar, these suit that best:') : t('Here is what I would open from your cellar:')
  return [intro, '', ...lines, '', `_${t('Demo mode: answers come from the built-in recommender. The real app asks an AI about your own cellar.')}_`].join('\n')
}

// Loaded on use: the wine-list parser pulls in zod, which the demo's first screen doesn't need.
async function demoWineList(food?: string, explore = false): Promise<WineListResult> {
  const { tidyWineList } = await import('../shared/winelist')
  const it = getLang() === 'it'
  const y = currentYear()
  const pairing = food ? (it ? ` e si abbina a ${food}` : ` and works with ${food}`) : ''
  const pick = (style: string, producer: string, name: string, age: number, price: number, fit: 'great' | 'good' | 'safe', why: string, retailEstimate: number, inCellar = false) =>
    ({ style, producer, name, vintage: age == null ? null : y - age, price, byTheGlass: false, fit, why: why + pairing + '.', inCellar, retailEstimate, valueNote: null })
  const picks = explore
    ? [
        pick('red', 'Domaine Faiveley', 'Mercurey 1er Cru Clos des Myglands', 5, 62, 'good', it ? 'Ami il profumo e l’acidità del Nebbiolo: questo Pinot Noir ha la stessa eleganza, più leggero' : 'You love Nebbiolo’s perfume and acidity: this Pinot Noir has the same finesse, lighter', 27),
        pick('red', 'Domaine du Vieux Télégraphe', 'Châteauneuf-du-Pape', 7, 95, 'safe', it ? 'Grenache caldo e speziato, lontano dal Piemonte ma con la struttura che apprezzi' : 'Warm, spicy Grenache — far from Piedmont but with the structure you like', 48),
        pick('white', 'Weingut Dönnhoff', 'Riesling Trocken', 3, 58, 'good', it ? 'Teso e minerale come i bianchi che voti meglio, ma tedesco' : 'Taut and mineral like the whites you rate highest, but German', 24),
        pick('sparkling', 'Raventós i Blanc', 'De Nit Rosé', 4, 49, 'good', it ? 'Un’alternativa allo Champagne: fresca e a buon prezzo' : 'An alternative to Champagne: fresh and fairly priced', 20),
      ]
    : [
        pick('red', 'Produttori del Barbaresco', 'Barbaresco', 6, 68, 'great', it ? 'Nebbiolo come quelli che voti di più' : 'Nebbiolo, like the wines you rate highest', 32, true),
        pick('red', 'Bodegas Muga', 'Rioja Reserva', 7, 45, 'safe', it ? 'Affidabile e a buon prezzo; anche al calice' : 'Reliable and fairly priced; also by the glass', 20, true),
        pick('white', 'Domaine Huet', 'Vouvray Sec Le Haut-Lieu', 5, 54, 'good', it ? 'Chenin fresco e minerale: ami i bianchi tesi come il Chablis' : 'Fresh, mineral Chenin: you love taut whites like Chablis', 24),
        pick('white', 'Pieropan', 'Soave Classico La Rocca', 4, 52, 'great', it ? 'Lo hai in cantina e lo voti bene' : 'You own it and rate it well', 26, true),
        pick('sparkling', 'Bérêche et Fils', 'Brut Réserve', 0, 85, 'good', it ? 'Champagne da vigneron, vinoso e preciso' : 'Grower Champagne, vinous and precise', 42),
        pick('sweet', 'Château Coutet', 'Barsac', 12, 70, 'good', it ? 'Dolce ma fresco, per il dessert' : 'Sweet but fresh, for dessert', 35),
      ]
  return tidyWineList({
    isWineList: true,
    currency: '£',
    picks,
    deals: [
      { style: 'red', producer: 'Ridge', name: 'Geyserville', vintage: y - 5, price: 72, retailEstimate: 45, valueNote: it ? 'meno di 2× il prezzo in enoteca: un affare' : 'under 2× shop price — a bargain' },
      { style: 'rose', producer: 'Château d’Esclans', name: 'Whispering Angel', vintage: y - 1, price: 110, retailEstimate: 20, valueNote: it ? 'più di 5× il prezzo al dettaglio' : 'over 5× retail — skip' },
    ],
    note: it ? 'Demo: risultato di esempio, nessuna carta è stata letta.' : 'Demo: a sample result, no list was read.',
  })
}

/** A plausible UK price range, so "Typical UK price" has something to show in the demo. */
function demoPriceHint(name: string): PriceHint {
  const fine = /barolo|barbaresco|brunello|bourgogne|burgundy|champagne|riserva|grand cru|premier cru/i.test(name)
  const [low, high] = fine ? [45, 70] : [14, 22]
  const it = getLang() === 'it'
  const where = fine
    ? it ? 'Demo: enoteche di vini pregiati e l’importatore britannico del produttore.' : 'Demo: fine-wine merchants and the producer’s UK importer.'
    : it ? 'Demo: grandi enoteche e catene di vino.' : 'Demo: most wine merchants and the bigger wine chains.'
  return { low, high, where }
}

/** Rough windows by style, so "Suggest windows" has something sensible to show in the demo. */
function demoWindow(w: WindowWine): WindowSuggestion {
  const base = w.vintage ?? currentYear()
  const [from, to] = w.type === 'red' ? [4, 15] : w.type === 'sparkling' ? [1, 6] : w.type === 'fortified' ? [10, 40] : [1, 6]
  return { id: w.id, drinkFrom: Math.max(base + from, currentYear() - 1), drinkTo: base + to, peakYear: null, confidence: 'medium', note: t('Demo estimate based on the style of wine.') }
}

/** Wines priced during this visit (the real server keeps them in its database). */
const demoPriced = new Set<string>()

/** Made-up price history for demo wines: a few points over the past year, near what was paid, drifting up or down. */
async function demoPrices(wines: { id: string; producer?: string; name?: string }[] = []) {
  const out: Record<string, { low: number; high: number; source: string; at: string }[]> = {}
  const today = Date.now()
  const paid = new Map<string, number>()
  for (const b of await db.bottles.toArray()) if (b.purchasePrice) paid.set(b.wineId, b.purchasePrice)
  for (const w of wines) {
    const seed = [...w.id].reduce((n, c) => n + c.charCodeAt(0), 0)
    if (seed % 3 === 0 && !demoPriced.has(`${w.producer}|${w.name}`)) continue // some not priced yet, so "Estimate" has something to do
    const base = (paid.get(w.id) ?? 20 + (seed % 90)) * (0.95 + (seed % 9) / 20) // 95%–135% of the price paid
    const drift = ((seed % 7) - 3) / 100
    out[w.id] = [0, 1, 2, 3].map((i) => {
      const v = Math.round(base * (1 + drift * (3 - i)))
      return { low: v - 2, high: v + 3, source: i === 1 ? 'winelist' : 'pricehint', at: new Date(today - i * 95 * 86_400_000).toISOString().slice(0, 10) }
    })
  }
  return out
}

/** Demo: a "published" blend for two-grape wines only, so the review flow can be tried; the rest stay unknown. */
function demoBlends(wines: { id: string; grapes?: string[] }[] = []) {
  return wines
    .filter((w) => w.grapes?.length === 2)
    .map((w) => ({ id: w.id, pct: { [w.grapes![0]]: 70, [w.grapes![1]]: 30 }, source: t('Demo: sample technical sheet') }))
}

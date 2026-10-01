import type { LabelResult } from '../shared/label'
import type { WineListResult } from '../shared/winelist'
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
      await Promise.all([db.wines.clear(), db.bottles.clear(), db.tastings.clear(), db.locations.clear(), db.wishlist.clear(), db.tombstones.clear()])
      await db.wines.bulkPut(data.wines)
      await db.bottles.bulkPut(data.bottles)
      await db.tastings.bulkPut(data.tastings)
      await db.locations.bulkPut(data.locations)
      await db.wishlist.bulkPut(data.wishlist)
    }),
  )
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms)) // AI calls take a moment; so does the demo

/** Answers every /api request in the browser, so the demo works with no server and never touches real data. */
export function installDemoApi() {
  const real = window.fetch.bind(window)
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input), window.location.href)
    if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/')) return real(input, init)
    const body = init?.body && typeof init.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : {}
    return route(url.pathname, init?.method ?? 'GET', body)
  }
}

async function route(path: string, method: string, body: Record<string, unknown>): Promise<Response> {
  if (path === '/api/health') return json({ ok: true, authenticated: true, devices: 1, scan: true, ai: 'Demo AI' })
  if (path === '/api/sync') return json({ cursor: 0, changes: [], more: false, accepted: (body.changes as unknown[] | undefined)?.length ?? 0 })
  if (path === '/api/auth/devices' && method === 'GET') return json({ devices: [{ id: 'demo', device_name: t('Demo device'), created_at: Date.now() - 86_400_000 * 30, last_used_at: Date.now() }] })
  if (path === '/api/scan') return pause(1200).then(() => json({ result: demoLabel() }))
  if (path === '/api/ask') return pause(900).then(async () => json({ answer: await demoAnswer(body.messages as { role: string; content: string }[]) }))
  if (path === '/api/winelist') return pause(1500).then(() => json({ result: demoWineList(body.food as string | undefined) }))
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

function demoWineList(food?: string): WineListResult {
  const it = getLang() === 'it'
  const pairing = food ? (it ? ` e si abbina a ${food}` : ` and works with ${food}`) : ''
  return {
    isWineList: true,
    currency: '£',
    picks: [
      { producer: 'Produttori del Barbaresco', name: 'Barbaresco', vintage: currentYear() - 6, price: 68, byTheGlass: false, fit: 'great', why: (it ? 'Nebbiolo come quelli che voti di più' : 'Nebbiolo, like the wines you rate highest') + pairing + '.', inCellar: true },
      { producer: 'Domaine Huet', name: 'Vouvray Sec Le Haut-Lieu', vintage: currentYear() - 5, price: 54, byTheGlass: false, fit: 'good', why: it ? 'Chenin fresco e minerale: ami i bianchi tesi come il Chablis.' : 'Fresh, mineral Chenin: you love taut whites like Chablis.', inCellar: false },
      { producer: 'Bodegas Muga', name: 'Rioja Reserva', vintage: currentYear() - 7, price: 45, byTheGlass: true, fit: 'safe', why: it ? 'Affidabile e a buon prezzo; anche al calice.' : 'Reliable and fairly priced; also by the glass.', inCellar: true },
    ],
    note: it ? 'Demo: risultato di esempio, nessuna foto è stata letta.' : 'Demo: a sample result, no photo was read.',
  }
}

/** Rough windows by style, so "Suggest windows" has something sensible to show in the demo. */
function demoWindow(w: WindowWine): WindowSuggestion {
  const base = w.vintage ?? currentYear()
  const [from, to] = w.type === 'red' ? [4, 15] : w.type === 'sparkling' ? [1, 6] : w.type === 'fortified' ? [10, 40] : [1, 6]
  return { id: w.id, drinkFrom: Math.max(base + from, currentYear() - 1), drinkTo: base + to, peakYear: null, confidence: 'medium', note: t('Demo estimate based on the style of wine.') }
}

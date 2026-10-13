import { htmlToText, MAX_LIST_TEXT } from '../src/shared/winelist'

const MAX_BYTES = 15_000_000 // a long, photo-heavy PDF list
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/** Only public web addresses: no local or private-network hosts. */
export function publicUrl(raw: unknown): URL | null {
  if (typeof raw !== 'string' || raw.length > 2000) return null
  let url: URL
  try {
    url = new URL(raw.trim().match(/^https?:\/\//i) ? raw.trim() : `https://${raw.trim()}`)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  const h = url.hostname.toLowerCase()
  if (!h.includes('.') || h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || h.startsWith('[')) return null
  if (/^(10|127|0)\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h)) return null
  return url
}

/** PDF links on a page, best first: ones that mention wine (or vini/vins/vinos/carta) before the rest. */
export function pdfLinks(html: string, base: URL): string[] {
  const out: { url: string; wine: boolean }[] = []
  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#]+\.pdf(?:\?[^"'#]*)?)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    try {
      const url = new URL(m[1].replace(/&amp;/g, '&'), base).href
      if (!out.some((o) => o.url === url)) out.push({ url, wine: /wine|vini|vins|vinos|carta|drinks|cellar/i.test(m[1] + ' ' + m[2]) })
    } catch {
      /* bad link */
    }
  }
  return out.sort((a, b) => Number(b.wine) - Number(a.wine)).slice(0, 5).map((o) => o.url)
}

/**
 * POST /api/fetchlist {url} — fetch a restaurant's wine list for the app (browsers can't read other sites).
 * A PDF comes back as-is (the app reads it like an uploaded PDF); a web page comes back as text, plus any PDF links on it.
 */
export async function handleFetchList(req: Request) {
  const url = publicUrl(((await req.json()) as { url?: unknown }).url)
  if (!url) return json({ error: 'Enter the web address of the wine list (https://…).' }, 400)
  let res: Response
  try {
    res = await fetch(url.href, {
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; MioVino wine-list reader)', accept: 'text/html,application/pdf;q=0.9,*/*;q=0.5' },
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    return json({ error: "Couldn't open that page. Check the address, or download the PDF and choose PDF." }, 502)
  }
  if (!res.ok) return json({ error: `That site answered ${res.status}. Download the list and choose PDF instead.` }, 502)
  if (Number(res.headers.get('content-length') ?? 0) > MAX_BYTES) return json({ error: 'That file is too large.' }, 413)
  const bytes = await res.arrayBuffer()
  if (bytes.byteLength > MAX_BYTES) return json({ error: 'That file is too large.' }, 413)
  const type = res.headers.get('content-type') ?? ''
  const head = new Uint8Array(bytes, 0, Math.min(5, bytes.byteLength))
  if (type.includes('pdf') || String.fromCharCode(...head) === '%PDF-') return new Response(bytes, { headers: { 'content-type': 'application/pdf' } })
  if (!/text\/|html|xml|json/.test(type) && type) return json({ error: "That link isn't a web page or a PDF." }, 415)
  const html = new TextDecoder().decode(bytes)
  const final = new URL(res.url || url.href)
  const title = htmlToText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').slice(0, 120)
  return json({ text: htmlToText(html).slice(0, MAX_LIST_TEXT), title: title || final.hostname, pdfs: pdfLinks(html, final) })
}

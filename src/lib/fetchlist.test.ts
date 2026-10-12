import { afterEach, describe, expect, it, vi } from 'vitest'

// Worker code is loaded by path so Worker types stay out of the app build.
const { handleFetchList, pdfLinks, publicUrl } = (await import(new URL('../../worker/fetchlist.ts', import.meta.url).href)) as {
  handleFetchList: (req: Request) => Promise<Response>
  pdfLinks: (html: string, base: URL) => string[]
  publicUrl: (raw: unknown) => URL | null
}

const post = (url: string) => new Request('https://x/api/fetchlist', { method: 'POST', body: JSON.stringify({ url }) })

describe('fetchlist', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('only opens public web addresses', () => {
    expect(publicUrl('restaurant.co.uk/wines')?.href).toBe('https://restaurant.co.uk/wines')
    expect(publicUrl('http://restaurant.co.uk')?.protocol).toBe('http:')
    for (const bad of ['ftp://x.com', 'http://localhost:8787', 'http://192.168.1.10/list', 'http://10.0.0.1', 'http://intranet', 'javascript:alert(1)', 42]) expect(publicUrl(bad)).toBeNull()
  })

  it('lists PDF links, wine ones first', () => {
    const html = '<a href="/menu.pdf">Food</a> <a href="https://cdn.x.com/files/Carta-Vini.pdf?v=2">Wine list</a> <a href="/menu.pdf">again</a>'
    expect(pdfLinks(html, new URL('https://osteria.it/drinks/'))).toEqual(['https://cdn.x.com/files/Carta-Vini.pdf?v=2', 'https://osteria.it/menu.pdf'])
  })

  it('returns a web page as text with its PDF links, and a PDF as-is', async () => {
    vi.stubGlobal('fetch', async (u: string) =>
      u.endsWith('.pdf')
        ? new Response('%PDF-1.7 …', { headers: { 'content-type': 'application/octet-stream' } })
        : new Response('<title>Our wines</title><p>Barolo 2019 £95</p><a href="list.pdf">Wine list (PDF)</a>', { headers: { 'content-type': 'text/html; charset=utf-8' } }),
    )
    const page = (await (await handleFetchList(post('https://bistro.co.uk/wine/'))).json()) as { text: string; title: string; pdfs: string[] }
    expect(page.title).toBe('Our wines')
    expect(page.text).toContain('Barolo 2019 £95')
    expect(page.pdfs).toEqual(['https://bistro.co.uk/wine/list.pdf'])
    const pdf = await handleFetchList(post('https://bistro.co.uk/wine/list.pdf'))
    expect(pdf.headers.get('content-type')).toBe('application/pdf') // recognised by its first bytes
  })

  it('explains when the site cannot be read', async () => {
    vi.stubGlobal('fetch', async () => new Response('nope', { status: 403 }))
    const res = await handleFetchList(post('https://bistro.co.uk/wine/'))
    expect(res.status).toBe(502)
    expect(((await res.json()) as { error: string }).error).toMatch(/403/)
    expect((await handleFetchList(post('http://localhost/x'))).status).toBe(400)
  })
})

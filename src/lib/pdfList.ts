import { MAX_LIST_PAGES, MAX_LIST_TEXT, MIN_LIST_TEXT } from '../shared/winelist'

const MAX_PDF_PAGES = 40

/**
 * Reads a wine-list PDF on the device. A normal PDF gives its text (every page, so a long list works);
 * a scanned one has no text, so its first pages become photos for the AI to read instead.
 * pdf.js loads only here, the first time a PDF is chosen.
 */
export async function readPdf(data: Blob | ArrayBuffer): Promise<{ text: string; pages: number } | { images: Blob[]; pages: number }> {
  const [pdfjs, { default: workerSrc }] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')])
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc
  const bytes = new Uint8Array(data instanceof Blob ? await data.arrayBuffer() : data)
  const doc = await pdfjs.getDocument({ data: bytes }).promise
  try {
    const n = Math.min(doc.numPages, MAX_PDF_PAGES)
    const lines: string[] = []
    for (let i = 1; i <= n; i++) {
      const content = await (await doc.getPage(i)).getTextContent()
      // Items on one printed line share a baseline; join them, and start a new line when it changes.
      let line = ''
      let y: number | undefined
      for (const item of content.items) {
        if (!('str' in item)) continue
        const iy = Math.round(item.transform[5])
        if (y != null && Math.abs(iy - y) > 2) {
          lines.push(line)
          line = ''
        }
        line += (line && !line.endsWith(' ') && !item.str.startsWith(' ') ? ' ' : '') + item.str
        y = iy
        if (item.hasEOL) {
          lines.push(line)
          line = ''
          y = undefined
        }
      }
      lines.push(line)
    }
    const text = lines.map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n')
    if (text.length >= MIN_LIST_TEXT) return { text: text.slice(0, MAX_LIST_TEXT), pages: doc.numPages }

    const images: Blob[] = []
    for (let i = 1; i <= Math.min(doc.numPages, MAX_LIST_PAGES); i++) {
      const page = await doc.getPage(i)
      const base = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({ scale: Math.min(3, 1568 / Math.max(base.width, base.height)) })
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(viewport.width)
      canvas.height = Math.round(viewport.height)
      await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise
      images.push(await new Promise<Blob>((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error('render'))), 'image/jpeg', 0.85)))
    }
    return { images, pages: doc.numPages }
  } finally {
    void doc.destroy()
  }
}

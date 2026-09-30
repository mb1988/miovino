import { TYPE_COLOR } from '../components/ui'
import { t } from './i18n'
import type { WineWithBottles } from './types'

const W = 1080
const H = 1350
const INK = '#160c11'
const CREAM = '#fbf6ee'
const MUTED = '#b9a99c'
const GOLD = '#d9a441'

/** Draws a portrait card (photo or bottle, wine, your rating and latest note) and returns it as a PNG. */
export async function renderShareCard(w: WineWithBottles): Promise<Blob> {
  await document.fonts?.ready
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  g.fillStyle = INK
  g.fillRect(0, 0, W, H)
  // Soft wine-coloured glow behind the bottle.
  const glow = g.createRadialGradient(W / 2, 420, 40, W / 2, 420, 520)
  glow.addColorStop(0, '#5a1328')
  glow.addColorStop(1, INK)
  g.fillStyle = glow
  g.fillRect(0, 0, W, 900)

  if (w.photo) {
    const img = await createImageBitmap(w.photo)
    const box = 560
    const s = Math.min(box / img.width, box / img.height)
    const iw = img.width * s
    const ih = img.height * s
    roundRect(g, (W - iw) / 2, 120 + (box - ih) / 2, iw, ih, 28)
    g.save()
    g.clip()
    g.drawImage(img, (W - iw) / 2, 120 + (box - ih) / 2, iw, ih)
    g.restore()
  } else drawBottle(g, W / 2, 120, 560, TYPE_COLOR[w.type])

  let y = 780
  g.textAlign = 'center'
  g.fillStyle = MUTED
  g.font = '500 40px Inter, system-ui, sans-serif'
  g.fillText(w.producer, W / 2, y, W - 160)
  y += 78
  g.fillStyle = CREAM
  g.font = '600 68px Fraunces, Georgia, serif'
  for (const line of wrap(g, `${w.name} ${w.vintage ?? 'NV'}`, W - 160).slice(0, 2)) {
    g.fillText(line, W / 2, y)
    y += 80
  }

  const last = w.tastings.find((x) => x.rating != null || x.notes)
  const rating = last?.rating ?? w.avgRating
  if (rating != null) {
    g.fillStyle = GOLD
    g.font = '48px system-ui, sans-serif'
    // Whole stars only (fonts have no reliable half star), with the exact score after them.
    const full = Math.floor(rating)
    const score = Number.isInteger(rating) ? '' : `  ${rating.toFixed(1)}`
    g.fillText('★'.repeat(full) + '☆'.repeat(5 - full) + score, W / 2, y + 10)
    y += 80
  }
  const note = last?.notes ?? w.personalNotes
  if (note) {
    g.fillStyle = CREAM
    g.font = 'italic 36px Fraunces, Georgia, serif'
    const lines = wrap(g, `“${note}”`, W - 200)
    for (const line of lines.slice(0, 3)) {
      g.fillText(lines.length > 3 && line === lines[2] ? `${line.replace(/\s+\S*$/, '')}…”` : line, W / 2, y)
      y += 50
    }
  }

  g.fillStyle = MUTED
  g.font = '600 28px Inter, system-ui, sans-serif'
  g.fillText(`MIOVINO · ${t('from my cellar').toUpperCase()}`, W / 2, H - 70)
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not draw the card'))), 'image/png'))
}

/** Opens the share sheet with the image, or downloads it where sharing files isn't supported. */
export async function shareWineCard(w: WineWithBottles) {
  const blob = await renderShareCard(w)
  const name = `${w.producer} ${w.name} ${w.vintage ?? 'NV'}`.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'wine'
  const file = new File([blob], `${name}.png`, { type: 'image/png' })
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: `${w.producer} ${w.name} ${w.vintage ?? 'NV'}` }).catch((e: Error) => {
      if (e.name !== 'AbortError') throw e
    })
    return 'shared'
  }
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: file.name })
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
  return 'downloaded'
}

function wrap(g: CanvasRenderingContext2D, text: string, max: number) {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word
    if (g.measureText(next).width > max && line) {
      lines.push(line)
      line = word
    } else line = next
  }
  if (line) lines.push(line)
  return lines
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath()
  g.roundRect(x, y, w, h, r)
}

function drawBottle(g: CanvasRenderingContext2D, cx: number, top: number, h: number, color: string) {
  // Same silhouette as the in-app bottle icon (20×56 viewBox), scaled up.
  const s = h / 56
  g.save()
  g.translate(cx - 10 * s, top)
  g.scale(s, s)
  g.fillStyle = color
  g.fill(new Path2D('M7.5 1h5v12c0 3 5.5 5 5.5 11v28a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V24c0-6 5.5-8 5.5-11z'))
  g.fillStyle = 'rgba(251,246,238,0.85)'
  g.fillRect(2, 30, 16, 12)
  g.fillStyle = 'rgba(15,8,11,0.5)'
  g.fillRect(7.5, 1, 5, 5)
  g.restore()
}

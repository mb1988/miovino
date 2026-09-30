import { drinkStatus, type WindowFields } from './status'

/** The monthly "what to drink" summary. Shared by the in-app card and the Worker's push notification. */

export interface DigestWine extends WindowFields {
  id: string
  producer: string
  name: string
  vintage?: number | null
  bottles: number // in the cellar
}

export interface Digest {
  soon: DigestWine[] // last year of the window (or at peak): drink these first
  past: DigestWine[] // window already closed
  opening: DigestWine[] // window opens next year
  ready: DigestWine[]
}

/** Groups the wines that still have bottles in the cellar; most urgent (earliest end of window) first. */
export function buildDigest(wines: DigestWine[], year: number): Digest {
  const d: Digest = { soon: [], past: [], opening: [], ready: [] }
  for (const w of wines) {
    if (w.bottles <= 0) continue
    const s = drinkStatus(w, year)
    if (s === 'soon') d.soon.push(w)
    else if (s === 'past') d.past.push(w)
    else if (s === 'approaching') d.opening.push(w)
    else if (s === 'ready') d.ready.push(w)
  }
  const byEnd = (a: DigestWine, b: DigestWine) => (a.drinkTo ?? 9999) - (b.drinkTo ?? 9999) || a.producer.localeCompare(b.producer)
  for (const list of Object.values(d)) list.sort(byEnd)
  return d
}

export function digestLabel(w: Pick<DigestWine, 'producer' | 'name' | 'vintage'>) {
  return `${w.producer} ${w.name} ${w.vintage ?? 'NV'}`
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** Notification text for the digest, or null when there's nothing in the cellar worth mentioning. */
export function digestMessage(d: Digest, month: string): { title: string; body: string; url: string } | null {
  const urgent = [...d.past, ...d.soon]
  if (!urgent.length && !d.ready.length && !d.opening.length) return null
  const parts: string[] = []
  if (d.soon.length) parts.push(`${plural(d.soon.length, 'wine')} to drink soon`)
  if (d.past.length) parts.push(`${plural(d.past.length, 'wine')} past the window`)
  if (d.ready.length) parts.push(`${d.ready.length} ready`)
  if (d.opening.length) parts.push(`${d.opening.length} opening next year`)
  const names = urgent.slice(0, 2).map(digestLabel)
  const more = urgent.length - names.length
  const body = parts.join(' · ') + (names.length ? `\nFirst: ${names.join(', ')}${more > 0 ? ` +${more} more` : ''}` : '')
  const url = d.soon.length ? '/?status=soon' : d.past.length ? '/?status=past' : '/?status=ready'
  return { title: `Your cellar in ${month}`, body, url }
}

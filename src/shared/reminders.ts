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

export type DigestLang = 'en' | 'it'

/** The notification's few phrases in each language (the Worker has no access to the app's i18n bundle). */
// [singular, plural] where the word agrees with the count.
type Forms = [string, string]
const WORDS: Record<DigestLang, { wine: Forms; soon: string; past: string; ready: Forms; opening: Forms; first: string; more: Forms; title: string }> = {
  en: { wine: ['wine', 'wines'], soon: 'to drink soon', past: 'past the window', ready: ['ready', 'ready'], opening: ['opening next year', 'opening next year'], first: 'First', more: ['more', 'more'], title: 'Your cellar in {month}' },
  it: { wine: ['vino', 'vini'], soon: 'da bere presto', past: 'oltre la finestra', ready: ['pronto', 'pronti'], opening: ["pronto l'anno prossimo", "pronti l'anno prossimo"], first: 'Prima', more: ['altro', 'altri'], title: 'La tua cantina a {month}' },
}
const pick = (n: number, f: Forms) => f[n === 1 ? 0 : 1]

/** Notification text for the digest, or null when there's nothing in the cellar worth mentioning. */
export function digestMessage(d: Digest, month: string, lang: DigestLang = 'en'): { title: string; body: string; url: string } | null {
  const w = WORDS[lang]
  const urgent = [...d.past, ...d.soon]
  if (!urgent.length && !d.ready.length && !d.opening.length) return null
  const wines = (n: number) => `${n} ${pick(n, w.wine)}`
  const parts: string[] = []
  if (d.soon.length) parts.push(`${wines(d.soon.length)} ${w.soon}`)
  if (d.past.length) parts.push(`${wines(d.past.length)} ${w.past}`)
  if (d.ready.length) parts.push(`${d.ready.length} ${pick(d.ready.length, w.ready)}`)
  if (d.opening.length) parts.push(`${d.opening.length} ${pick(d.opening.length, w.opening)}`)
  const names = urgent.slice(0, 2).map(digestLabel)
  const more = urgent.length - names.length
  const body = parts.join(' · ') + (names.length ? `\n${w.first}: ${names.join(', ')}${more > 0 ? ` +${more} ${pick(more, w.more)}` : ''}` : '')
  const url = d.soon.length ? '/?status=soon' : d.past.length ? '/?status=past' : '/?status=ready'
  return { title: w.title.replace('{month}', month), body, url }
}

/** Month name for the title: "October" in English, "ottobre" in Italian (months aren't capitalised there). */
export function digestMonth(now: Date, lang: DigestLang) {
  return now.toLocaleString(lang === 'it' ? 'it-IT' : 'en-GB', { month: 'long', timeZone: 'Europe/London' })
}

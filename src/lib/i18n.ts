import { useSyncExternalStore } from 'react'
import { IT } from './i18n-it'

/**
 * Tiny i18n: the English text is the key, so anything not yet translated simply shows in English.
 * `t('Drink {n} bottles', { n: 3 })` fills {placeholders}. Language defaults to the phone's.
 */
export type Lang = 'en' | 'it'
export const LANGS: { id: Lang; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'it', label: 'Italiano' },
]

const KEY = 'miovino.lang'
let lang: Lang = load()
if (typeof document !== 'undefined') document.documentElement.lang = lang
const listeners = new Set<() => void>()

function load(): Lang {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'en' || saved === 'it') return saved
  } catch {
    /* storage unavailable */
  }
  return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('it') ? 'it' : 'en'
}

export function getLang() {
  return lang
}

export function setLang(next: Lang) {
  lang = next
  try {
    localStorage.setItem(KEY, next)
  } catch {
    /* keep for this visit */
  }
  if (typeof document !== 'undefined') document.documentElement.lang = next
  listeners.forEach((l) => l())
}

export function useLang(): Lang {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => lang,
  )
}

export function t(text: string, vars?: Record<string, string | number>): string {
  const out = (lang === 'it' && IT[text]) || text
  return vars ? out.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : out
}

/** "1 bottle" / "3 bottles" in the current language. */
export function plural(n: number, one: string, many: string) {
  return t(n === 1 ? one : many, { n })
}

/** Locale for dates and numbers. */
export function locale() {
  return lang === 'it' ? 'it-IT' : 'en-GB'
}

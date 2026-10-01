import { useSyncExternalStore } from 'react'
import { DEMO, storageKey } from './demo'

export interface Settings {
  currency: string
  apiKey: string
  model: string
  cellarName: string
}

const KEY = storageKey('miovino.settings')
const DEFAULTS: Settings = { currency: 'GBP', apiKey: '', model: 'claude-opus-5-5', cellarName: DEMO ? 'Demo Cellar' : 'My Cellar' }

let cache: Settings = load()
const listeners = new Set<() => void>()

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS
  } catch {
    return DEFAULTS
  }
}

export function getSettings() {
  return cache
}

export function saveSettings(patch: Partial<Settings>) {
  cache = { ...cache, ...patch }
  try {
    localStorage.setItem(KEY, JSON.stringify(cache))
  } catch {
    /* storage unavailable — keep in memory */
  }
  listeners.forEach((l) => l())
}

export function useSettings(): Settings {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => cache,
  )
}

export function formatMoney(v: number | undefined, currency = cache.currency, digits = 0) {
  if (v == null) return '—'
  return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(v)
}

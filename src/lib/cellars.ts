import { useSyncExternalStore } from 'react'
import { storageKey } from './demo'
import type { Location, WineWithBottles } from './types'

/**
 * Several cellars (e.g. "Home" and "Country house"): each location/rack belongs to one, via Location.cellar.
 * A location without one — and a bottle with no location — is in the main cellar, named in Settings.
 * Which cellar the screens show is a per-device choice ('' = all cellars).
 */

export function cellarOf(locationName: string | undefined, locations: Pick<Location, 'name' | 'cellar'>[], main: string) {
  const loc = locationName ? locations.find((l) => l.name === locationName) : undefined
  return loc?.cellar?.trim() || main
}

/** The main cellar first, then the others in the order their first location appears. */
export function cellarNames(locations: Pick<Location, 'cellar'>[], main: string) {
  return [...new Set([main, ...locations.map((l) => l.cellar?.trim() || main)])]
}

/**
 * The cellar as seen from one cellar: only the bottles kept there count. Wines with no bottle there are left out.
 * With no cellar chosen (''), everything is returned unchanged.
 */
export function inCellar(wines: WineWithBottles[], locations: Pick<Location, 'name' | 'cellar'>[], active: string, main: string): WineWithBottles[] {
  if (!active) return wines
  const out: WineWithBottles[] = []
  for (const w of wines) {
    const bottles = w.bottles.filter((b) => b.status !== 'cellar' || cellarOf(b.location, locations, main) === active)
    const count = bottles.filter((b) => b.status === 'cellar').length
    if (count) out.push({ ...w, bottles, inCellar: count })
  }
  return out
}

// ——— the chosen cellar on this device ———
const KEY = storageKey('miovino.cellar')
let active = load()
const listeners = new Set<() => void>()

function load() {
  try {
    return localStorage.getItem(KEY) ?? ''
  } catch {
    return ''
  }
}

export function setActiveCellar(name: string) {
  active = name
  try {
    if (name) localStorage.setItem(KEY, name)
    else localStorage.removeItem(KEY)
  } catch {
    /* kept for this visit */
  }
  listeners.forEach((l) => l())
}

export function useActiveCellar(): string {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => active,
  )
}

/** The chosen cellar, or '' when it no longer exists (renamed, or its last location moved away). */
export function validCellar(name: string, names: string[]) {
  return names.length > 1 && names.includes(name) ? name : ''
}

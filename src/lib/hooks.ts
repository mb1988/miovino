import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { cellarNames, inCellar, setActiveCellar, useActiveCellar, validCellar } from './cellars'
import { db, joinWine, loadCellar } from './db'
import { useSettings } from './settings'

export function useCellar() {
  return useLiveQuery(() => loadCellar(), [])
}

export function useWine(id: string) {
  return useLiveQuery(async () => {
    const w = await db.wines.get(id)
    if (!w) return null
    const [bottles, tastings] = await Promise.all([db.bottles.where('wineId').equals(id).toArray(), db.tastings.where('wineId').equals(id).toArray()])
    return joinWine(w, bottles, tastings)
  }, [id])
}

export function useLocations() {
  return useLiveQuery(() => db.locations.orderBy('order').toArray(), [])
}

/** Object URL for a stored photo blob, revoked on change. */
export function useBlobUrl(blob?: Blob) {
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    if (!blob) return setUrl(undefined)
    const u = URL.createObjectURL(blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [blob])
  return url
}

/** The cellar as seen from the cellar chosen on this device (all cellars by default), plus the switcher's state. */
export function useCellarView() {
  const all = useCellar()
  const locations = useLocations()
  const main = useSettings().cellarName
  const chosen = useActiveCellar()
  const names = cellarNames(locations ?? [], main)
  const active = validCellar(chosen, names)
  const wines = all && locations ? inCellar(all, locations, active, main) : undefined
  return { wines, all, names, active, setActive: setActiveCellar, main }
}

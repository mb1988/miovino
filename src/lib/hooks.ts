import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, joinWine, loadCellar } from './db'

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

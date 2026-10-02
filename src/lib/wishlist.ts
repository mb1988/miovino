import { db } from './db'
import { sameWineKey } from './importer'
import type { WineWithBottles, WishItem } from './types'

export async function addWish(item: Omit<WishItem, 'id' | 'createdAt'>) {
  // Don't add the same wine twice while it's still on the list.
  if (item.wineId && (await db.wishlist.where('wineId').equals(item.wineId).filter((w) => !w.done).count())) return
  await db.wishlist.add({ ...item, createdAt: Date.now() } as WishItem)
}

export function wishFromWine(w: Pick<WineWithBottles, 'id' | 'producer' | 'name' | 'vintage'>, note?: string): Omit<WishItem, 'id' | 'createdAt'> {
  return { producer: w.producer, name: w.name, vintage: w.vintage, wineId: w.id, note }
}

/** Wines whose latest tasting said "buy again: yes" and that aren't already on the list. */
export function buyAgainSuggestions(cellar: WineWithBottles[], list: WishItem[]) {
  const listed = new Set(list.filter((i) => !i.done).map((i) => i.wineId))
  return cellar
    .filter((w) => w.tastings[0]?.buyAgain === 'yes' && !listed.has(w.id))
    .sort((a, b) => (b.avgRating ?? 0) - (a.avgRating ?? 0))
}

export interface PastSeller {
  seller: string
  bottles: number
  lastDate?: string // yyyy-mm-dd of the latest purchase there
  lastPrice?: number
}

/**
 * Where the owner bought this wine before (any vintage), most recent first — from the bottles' seller field.
 * Matches the wine the item came from, or any cellar wine with the same producer and name.
 */
export function pastSellers(cellar: WineWithBottles[], item: Pick<WishItem, 'producer' | 'name' | 'wineId'>): PastSeller[] {
  const key = sameWineKey({ producer: item.producer, name: item.name, vintage: null })
  const bottles = cellar.filter((w) => w.id === item.wineId || sameWineKey({ ...w, vintage: null }) === key).flatMap((w) => w.bottles)
  const by = new Map<string, PastSeller>()
  for (const b of bottles) {
    const seller = b.seller?.trim()
    if (!seller) continue
    const id = seller.toLowerCase()
    const s = by.get(id) ?? { seller, bottles: 0 }
    s.bottles++
    if ((b.purchaseDate ?? '') >= (s.lastDate ?? '')) Object.assign(s, { lastDate: b.purchaseDate ?? s.lastDate, lastPrice: b.purchasePrice ?? s.lastPrice })
    by.set(id, s)
  }
  return [...by.values()].sort((a, b) => (b.lastDate ?? '').localeCompare(a.lastDate ?? ''))
}

/** A rough price for choosing which merchants to suggest: the AI hint's middle, else the last price paid. */
export function typicalPrice(item: Pick<WishItem, 'priceHint'>, sellers: PastSeller[]) {
  const h = item.priceHint
  if (h && (h.low != null || h.high != null)) return ((h.low ?? h.high!) + (h.high ?? h.low!)) / 2
  return sellers.find((s) => s.lastPrice != null)?.lastPrice ?? null
}

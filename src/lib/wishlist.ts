import { db } from './db'
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

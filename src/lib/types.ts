import { WINE_TYPES } from '../shared/wine'
export { WINE_TYPES }
export type WineType = (typeof WINE_TYPES)[number]

export const WINE_TYPE_LABEL: Record<WineType, string> = {
  red: 'Red',
  white: 'White',
  rose: 'Rosé',
  sparkling: 'Sparkling',
  dessert: 'Dessert',
  fortified: 'Fortified',
  orange: 'Orange',
}

export type BottleStatus = 'cellar' | 'drunk' | 'gifted' | 'lost'

/** Information that comes from outside (a guide, the AI, a label) — shown apart from personal notes. */
export interface ExternalInfo {
  source: string // e.g. "Vitae (AIS)", "AI", "Label"
  guideYear?: number
  award?: string // e.g. "4 viti"
  score?: number
  pairing?: string
  description?: string
  window?: string // e.g. "2024–2036 / 2026–2046" as published
  note?: string
  url?: string
}

/** Every synced record: a UUID (unique across devices) and a last-modified time for last-write-wins sync. */
export interface Synced {
  id?: string
  updatedAt?: number
}

export interface Wine extends Synced {
  producer: string
  name: string
  vintage: number | null // null = NV
  type: WineType
  country?: string
  region?: string
  appellation?: string
  grapes: string[]
  alcohol?: number
  bottleSize: number // ml
  drinkFrom?: number
  drinkTo?: number
  peakYear?: number
  external: ExternalInfo[]
  photo?: Blob // local cache; the synced copy lives in R2
  hasPhoto?: boolean
  favourite: boolean
  personalNotes?: string
  barcode?: string // EAN/UPC from the back label, normalised to 13 digits
  tags: string[]
  needsReview?: string[] // import warnings still to confirm
  createdAt: number
}

export interface Bottle extends Synced {
  wineId: string
  slot?: string // position in a rack grid, e.g. "B3"
  status: BottleStatus
  location?: string
  purchasePrice?: number
  purchaseDate?: string // yyyy-mm-dd
  seller?: string
  consumedAt?: string
  tastingId?: string
  createdAt: number
}

export type BuyAgain = 'yes' | 'maybe' | 'no'
export const OCCASIONS = ['Dinner', 'Casual', 'Restaurant', 'Party', 'Special occasion', 'Gift'] as const

export interface Tasting extends Synced {
  wineId: string
  bottleId?: string
  date: string // yyyy-mm-dd
  rating?: number // 0.5–5
  occasion?: string
  company?: string
  food?: string
  notes?: string
  buyAgain?: BuyAgain
  createdAt: number
}

export interface Location extends Synced {
  name: string // "Rack A / Shelf 2"
  order: number
  rows?: number // rack grid size (optional)
  cols?: number
}

/** Something to buy: added by hand, or from a tasting marked "buy again". */
export interface WishItem extends Synced {
  producer: string
  name: string
  vintage?: number | null
  note?: string
  wineId?: string // the cellar wine it came from, if any
  done?: boolean // bought
  createdAt: number
}

export interface WineWithBottles extends Wine {
  id: string
  bottles: Bottle[]
  inCellar: number
  tastings: Tasting[]
  avgRating?: number
}

export const KINDS = ['wines', 'bottles', 'tastings', 'locations', 'wishlist'] as const
export type Kind = (typeof KINDS)[number]

export interface Tombstone {
  key: string // `${kind}:${id}`
  kind: Kind
  id: string
  deletedAt: number
}

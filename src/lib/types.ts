export const WINE_TYPES = ['red', 'white', 'rose', 'sparkling', 'dessert', 'fortified', 'orange'] as const
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

export interface Wine {
  id?: number
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
  photo?: Blob
  favourite: boolean
  personalNotes?: string
  tags: string[]
  needsReview?: string[] // import warnings still to confirm
  createdAt: number
  updatedAt: number
}

export interface Bottle {
  id?: number
  wineId: number
  status: BottleStatus
  location?: string
  purchasePrice?: number
  purchaseDate?: string // yyyy-mm-dd
  seller?: string
  consumedAt?: string
  tastingId?: number
  createdAt: number
}

export type BuyAgain = 'yes' | 'maybe' | 'no'
export const OCCASIONS = ['Dinner', 'Casual', 'Restaurant', 'Party', 'Special occasion', 'Gift'] as const

export interface Tasting {
  id?: number
  wineId: number
  bottleId?: number
  date: string // yyyy-mm-dd
  rating?: number // 0.5–5
  occasion?: string
  company?: string
  food?: string
  notes?: string
  buyAgain?: BuyAgain
  createdAt: number
}

export interface Location {
  id?: number
  name: string // "Rack A / Shelf 2"
  order: number
}

export interface WineWithBottles extends Wine {
  id: number
  bottles: Bottle[]
  inCellar: number
  tastings: Tasting[]
  avgRating?: number
}

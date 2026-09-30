import { db, loadCellar } from './db'
import { drinkStatus, STATUS_META } from './status'
import { WINE_TYPE_LABEL, type Bottle, type Location, type Tasting, type Wine } from './types'

const FORMAT = 'miovino-backup'
const VERSION = 1

interface SerializedWine extends Omit<Wine, 'photo'> {
  photo?: string // data URL
}

export interface Backup {
  format: typeof FORMAT
  version: number
  exportedAt: string
  wines: SerializedWine[]
  bottles: Bottle[]
  tastings: Tasting[]
  locations: Location[]
}

function blobToDataUrl(b: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(r.result as string)
    r.onerror = () => rej(r.error)
    r.readAsDataURL(b)
  })
}

async function dataUrlToBlob(u: string): Promise<Blob> {
  return (await fetch(u)).blob()
}

export async function buildBackup(): Promise<Backup> {
  const [wines, bottles, tastings, locations] = await Promise.all([
    db.wines.toArray(),
    db.bottles.toArray(),
    db.tastings.toArray(),
    db.locations.toArray(),
  ])
  return {
    format: FORMAT,
    version: VERSION,
    exportedAt: new Date().toISOString(),
    wines: await Promise.all(wines.map(async (w) => ({ ...w, photo: w.photo ? await blobToDataUrl(w.photo) : undefined }))),
    bottles,
    tastings,
    locations,
  }
}

export async function restoreBackup(json: unknown, mode: 'replace' | 'merge' = 'replace') {
  const b = json as Backup
  if (b?.format !== FORMAT) throw new Error('This file is not a MioVino backup.')
  const wines: Wine[] = await Promise.all(b.wines.map(async (w) => ({ ...w, photo: w.photo ? await dataUrlToBlob(w.photo) : undefined })))
  await db.transaction('rw', db.wines, db.bottles, db.tastings, db.locations, async () => {
    if (mode === 'replace') {
      await Promise.all([db.wines.clear(), db.bottles.clear(), db.tastings.clear(), db.locations.clear()])
      await db.wines.bulkAdd(wines)
      await db.bottles.bulkAdd(b.bottles)
      await db.tastings.bulkAdd(b.tastings)
      await db.locations.bulkAdd(b.locations)
    } else {
      // Merge: re-key everything so ids never collide.
      const wineIds = new Map<number, number>()
      for (const w of wines) {
        const { id, ...rest } = w
        wineIds.set(id!, (await db.wines.add(rest as Wine)) as number)
      }
      const tastingIds = new Map<number, number>()
      for (const t of b.tastings) {
        const { id, ...rest } = t
        tastingIds.set(id!, (await db.tastings.add({ ...rest, wineId: wineIds.get(t.wineId)! })) as number)
      }
      for (const bt of b.bottles) {
        const { id: _id, ...rest } = bt
        await db.bottles.add({ ...rest, wineId: wineIds.get(bt.wineId)!, tastingId: bt.tastingId ? tastingIds.get(bt.tastingId) : undefined })
      }
      for (const l of b.locations) if (!(await db.locations.where('name').equals(l.name).first())) await db.locations.add({ name: l.name, order: l.order })
    }
  })
}

export function download(filename: string, data: Blob | string, type = 'application/octet-stream') {
  const blob = typeof data === 'string' ? new Blob([data], { type }) : data
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

/** Flat table: one row per wine with bottle counts — friendly for Excel. Plus a tastings sheet. */
export async function exportTables() {
  const cellar = await loadCellar()
  const wines = cellar.map((w) => {
    const inCellar = w.bottles.filter((b) => b.status === 'cellar')
    const prices = inCellar.map((b) => b.purchasePrice).filter((p): p is number => p != null)
    const ext = w.external[0]
    return {
      Producer: w.producer,
      Wine: w.name,
      Vintage: w.vintage ?? 'NV',
      Type: WINE_TYPE_LABEL[w.type],
      Country: w.country ?? '',
      Region: w.region ?? '',
      Appellation: w.appellation ?? '',
      Grapes: w.grapes.join(', '),
      'In cellar': w.inCellar,
      'Drunk': w.bottles.filter((b) => b.status === 'drunk').length,
      'Avg price': prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : '',
      'Drink from': w.drinkFrom ?? '',
      'Drink until': w.drinkTo ?? '',
      'Peak year': w.peakYear ?? '',
      Status: STATUS_META[drinkStatus(w)].label,
      Locations: [...new Set(inCellar.map((b) => b.location).filter(Boolean))].join('; '),
      'My rating': w.avgRating != null ? Number(w.avgRating.toFixed(2)) : '',
      Favourite: w.favourite ? 'yes' : '',
      'My notes': w.personalNotes ?? '',
      'Guide': ext?.source ?? '',
      'Guide award': ext?.award ?? '',
      'Guide score': ext?.score ?? '',
      'Guide pairing': ext?.pairing ?? '',
      'Guide description': ext?.description ?? '',
    }
  })
  const tastings = cellar.flatMap((w) =>
    w.tastings.map((t) => ({
      Date: t.date,
      Producer: w.producer,
      Wine: w.name,
      Vintage: w.vintage ?? 'NV',
      Rating: t.rating ?? '',
      Occasion: t.occasion ?? '',
      Company: t.company ?? '',
      Food: t.food ?? '',
      'Buy again': t.buyAgain ?? '',
      Notes: t.notes ?? '',
    })),
  )
  return { wines, tastings }
}

export async function exportXlsx() {
  const XLSX = await import('xlsx')
  const { wines, tastings } = await exportTables()
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(wines), 'Cellar')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(tastings), 'Tastings')
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
  download(`miovino-${stamp()}.xlsx`, new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
}

export async function exportCsv() {
  const XLSX = await import('xlsx')
  const { wines } = await exportTables()
  const csv = XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(wines))
  download(`miovino-${stamp()}.csv`, '﻿' + csv, 'text/csv;charset=utf-8')
}

export async function exportJson() {
  const backup = await buildBackup()
  download(`miovino-backup-${stamp()}.json`, JSON.stringify(backup), 'application/json')
}

function stamp() {
  return new Date().toISOString().slice(0, 10)
}

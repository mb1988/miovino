import { db, deleteAllData, loadCellar } from './db'
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

/**
 * Restores a backup. "replace" deletes current data first (deletions sync to other devices);
 * "merge" upserts by id. Backups from v0.1 (numeric ids) get fresh UUIDs, with references remapped.
 */
export async function restoreBackup(json: unknown, mode: 'replace' | 'merge' = 'replace') {
  const b = json as Backup
  if (b?.format !== FORMAT) throw new Error('This file is not a MioVino backup.')
  const ids = new Map<string, string>()
  const remap = (kind: string, id: unknown) => {
    if (id == null) return undefined
    if (typeof id === 'string') return id
    const k = `${kind}:${id}`
    if (!ids.has(k)) ids.set(k, crypto.randomUUID())
    return ids.get(k)!
  }
  const wines: Wine[] = await Promise.all(
    b.wines.map(async (w) => ({ ...w, id: remap('w', w.id), photo: w.photo ? await dataUrlToBlob(w.photo) : undefined, hasPhoto: !!w.photo }) as Wine),
  )
  const bottles = b.bottles.map((x) => ({ ...x, id: remap('b', x.id), wineId: remap('w', x.wineId)!, tastingId: remap('t', x.tastingId) }))
  const tastings = b.tastings.map((x) => ({ ...x, id: remap('t', x.id), wineId: remap('w', x.wineId)!, bottleId: remap('b', x.bottleId) }))
  const locations = b.locations.map((x) => ({ ...x, id: remap('l', x.id) }))
  if (mode === 'replace') await deleteAllData()
  await db.transaction('rw', db.wines, db.bottles, db.tastings, db.locations, async () => {
    await db.wines.bulkPut(wines)
    await db.bottles.bulkPut(bottles)
    await db.tastings.bulkPut(tastings)
    for (const l of locations) if (!(await db.locations.where('name').equals(l.name).first())) await db.locations.put(l)
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

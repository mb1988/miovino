import type { WineWithBottles } from './types'

/** Wine bottles carry EAN-13 (Europe) or UPC-A (US); a few small ones EAN-8. */
export const BARCODE_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'] as const

/** Digits only; UPC-A (12) becomes its EAN-13 form so both scans of the same bottle match. Null if it isn't a valid code. */
export function normalizeBarcode(raw: string | undefined | null): string | null {
  const d = (raw ?? '').replace(/\D/g, '')
  const code = d.length === 12 ? `0${d}` : d
  if (code.length !== 13 && code.length !== 8) return null
  return checksumOk(code) ? code : null
}

/** GTIN check digit: weights 3,1,3,1… from the right, excluding the check digit. */
function checksumOk(code: string) {
  const digits = [...code].map(Number)
  const check = digits.pop()!
  const sum = digits.reverse().reduce((s, n, i) => s + n * (i % 2 === 0 ? 3 : 1), 0)
  return (10 - (sum % 10)) % 10 === check
}

export function findByBarcode(cellar: WineWithBottles[], code: string) {
  return cellar.filter((w) => w.barcode === code)
}

export interface Detector {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>
}

/**
 * Chrome/Android have a built-in BarcodeDetector; Safari doesn't, so we fall back to ZXing (WebAssembly),
 * served from our own origin rather than a CDN. Loaded only when the scanner opens.
 */
export async function createDetector(): Promise<Detector> {
  const Native = (globalThis as { BarcodeDetector?: { new (o: { formats: string[] }): Detector; getSupportedFormats?: () => Promise<string[]> } }).BarcodeDetector
  if (Native && (await Native.getSupportedFormats?.().catch((): string[] => []))?.includes('ean_13')) return new Native({ formats: [...BARCODE_FORMATS] })
  const [{ BarcodeDetector, prepareZXingModule }, { default: wasmUrl }] = await Promise.all([import('barcode-detector/ponyfill'), import('zxing-wasm/reader/zxing_reader.wasm?url')])
  prepareZXingModule({ overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) } })
  return new BarcodeDetector({ formats: [...BARCODE_FORMATS] })
}

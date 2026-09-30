import { describe, expect, it } from 'vitest'
import { findByBarcode, normalizeBarcode } from './barcode'
import type { WineWithBottles } from './types'

describe('barcodes', () => {
  it('accepts valid EAN-13 / EAN-8 / UPC-A and rejects bad check digits', () => {
    expect(normalizeBarcode('8 002062 000013')).toBe('8002062000013') // real Italian EAN-13 layout
    expect(normalizeBarcode('8002062000014')).toBeNull() // wrong check digit
    expect(normalizeBarcode('96385074')).toBe('96385074') // EAN-8
    expect(normalizeBarcode('036000291452')).toBe('0036000291452') // UPC-A → EAN-13
    expect(normalizeBarcode('12345')).toBeNull()
    expect(normalizeBarcode(undefined)).toBeNull()
  })
  it('finds wines by barcode', () => {
    const w = (id: string, barcode?: string) => ({ id, barcode }) as WineWithBottles
    expect(findByBarcode([w('a', '8002062000013'), w('b'), w('c', '96385074')], '8002062000013').map((x) => x.id)).toEqual(['a'])
  })
})

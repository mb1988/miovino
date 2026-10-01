import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { IT } from './i18n-it'

// Strings that are the same in both languages (names, examples, commands).
const SAME = new Set(['Barolo DOCG', 'Nebbiolo', 'npm run auth:invite', 'Orange', 'No', 'Excel / CSV'])

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) && !f.endsWith('.test.ts') && f !== 'i18n.ts' ? [p] : []
  })
}

describe('i18n', () => {
  it('has an Italian translation for every t() string in the app', () => {
    const root = fileURLToPath(new URL('..', import.meta.url))
    const used = new Set<string>()
    for (const f of files(root)) {
      const src = readFileSync(f, 'utf8')
      for (const m of src.matchAll(/\bt\('((?:[^'\\]|\\.)+)'/g)) used.add(m[1].replace(/\\'/g, "'"))
    }
    const missing = [...used].filter((s) => !(s in IT) && !SAME.has(s))
    expect(missing).toEqual([])
  })

  it('keeps {placeholders} identical in translations', () => {
    for (const [en, it_] of Object.entries(IT)) {
      const ph = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
      expect(ph(it_), en).toEqual(ph(en))
    }
  })
})

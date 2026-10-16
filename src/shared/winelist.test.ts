import { describe, expect, it } from 'vitest'
import { htmlToText, MAX_LIST_TEXT, mergeWineLists, splitListText, validateWineListRequest, wineListPrompt, type WineListResult } from './winelist'

const photo = 'x'.repeat(200)
const list = 'Barolo, Vietti 2019 — £95\nChablis 1er Cru, Brocard 2022 — £48\nRioja Reserva, Muga 2018 — £52'

describe('wine-list request', () => {
  it('takes photos or text, never both or neither', () => {
    expect(validateWineListRequest({ images: [photo] })?.images).toEqual([photo])
    expect(validateWineListRequest({ text: `  ${list}  ` })?.text).toBe(list)
    expect(validateWineListRequest({ images: [photo], text: list })).toBeNull()
    expect(validateWineListRequest({})).toBeNull()
    expect(validateWineListRequest({ images: [] })).toBeNull()
  })

  it('rejects text too short to be a list, or too long', () => {
    expect(validateWineListRequest({ text: 'Menu' })).toBeNull()
    expect(validateWineListRequest({ text: 'x'.repeat(MAX_LIST_TEXT + 1) })).toBeNull()
  })

  it('tells the AI whether it is reading photos or text', () => {
    expect(wineListPrompt({}, 'photos')).toMatch(/These photos are pages/)
    expect(wineListPrompt({}, 'text')).toMatch(/text of a restaurant wine list/)
  })
})

describe('htmlToText', () => {
  it('keeps the readable text, one block per line, and drops scripts and styles', () => {
    const html = `<html><head><title>Wines</title><style>p{color:red}</style></head><body>
      <script>var x = "<p>nope</p>"</script>
      <h2>Reds</h2><table><tr><td>Barolo &amp; co</td><td>&pound;95</td></tr><tr><td>Ch&acirc;teauneuf</td><td>&#163;60</td></tr></table>
      <p>Prices include&nbsp;VAT<br>Ask us</p><!-- hidden --></body></html>`
    expect(htmlToText(html)).toBe('Reds\nBarolo & co £95\nChâteauneuf £60\nPrices include VAT\nAsk us')
  })
})

describe('long lists in parts', () => {
  it('splits at line breaks, and cuts a line only when it is longer than a part', () => {
    expect(splitListText('aaaa\nbbbb\ncc', 9)).toEqual(['aaaa\nbbbb', 'cc'])
    expect(splitListText('x'.repeat(10), 4)).toEqual(['xxxx', 'xxxx', 'xx'])
    expect(splitListText('short', 100)).toEqual(['short'])
  })
  it('merges the parts: best fits first, no repeats, deals not already picked', () => {
    const pick = (name: string, fit: 'great' | 'good' | 'safe') => ({ producer: 'P', name, vintage: 2019, price: 50, byTheGlass: false, fit, why: '', inCellar: false, retailEstimate: null, valueNote: null, verdict: null })
    const deal = (name: string) => ({ producer: 'P', name, vintage: 2019, price: 40, retailEstimate: null, valueNote: null, verdict: null })
    const a: WineListResult = { isWineList: true, currency: '£', picks: [pick('A', 'safe'), pick('B', 'good')], deals: [deal('C')], note: 'first' }
    const b: WineListResult = { isWineList: true, currency: null, picks: [pick('D', 'great'), pick('B', 'good')], deals: [deal('A'), deal('E')], note: null }
    const m = mergeWineLists([a, b])
    expect(m.picks.map((p) => p.name)).toEqual(['D', 'B', 'A'])
    expect(m.deals.map((d) => d.name)).toEqual(['C', 'E'])
    expect([m.currency, m.note, m.isWineList]).toEqual(['£', 'first', true])
  })
})

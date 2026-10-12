import { describe, expect, it } from 'vitest'
import { htmlToText, MAX_LIST_TEXT, validateWineListRequest, wineListPrompt } from './winelist'

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

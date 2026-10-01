import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { Markdown } from './Markdown'

const html = (text: string) => renderToStaticMarkup(createElement(Markdown, { text }))

describe('chat markdown', () => {
  it('renders bold, *italic* and _italic_, but leaves snake_case alone', () => {
    expect(html('**Barolo** is *great* and _ready_')).toContain('<strong class="font-semibold text-cream-50">Barolo</strong> is <em>great</em> and <em>ready</em>')
    expect(html('use drink_from here')).toContain('use drink_from here')
  })

  it('never injects HTML', () => {
    expect(html('<img src=x onerror=alert(1)>')).toContain('&lt;img')
  })
})

import { Fragment, type ReactNode } from 'react'

/** Minimal, safe markdown for chat answers: paragraphs, "- " / "1. " lists, **bold** and *italic* / _italic_. No HTML is ever injected. */
export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = []
  let list: { ordered: boolean; items: string[] } | null = null
  const flush = () => {
    if (!list) return
    const items = list.items.map((it, i) => <li key={i}>{inline(it)}</li>)
    blocks.push(list.ordered ? <ol key={blocks.length} className="list-decimal space-y-1 pl-5">{items}</ol> : <ul key={blocks.length} className="list-disc space-y-1 pl-5">{items}</ul>)
    list = null
  }
  for (const line of text.split('\n')) {
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line)
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line)
    if (bullet || numbered) {
      const ordered = !!numbered
      if (list && list.ordered !== ordered) flush()
      list ??= { ordered, items: [] }
      list.items.push((bullet ?? numbered)![1])
      continue
    }
    flush()
    const heading = /^#{1,6}\s+(.*)$/.exec(line)
    if (heading) blocks.push(<p key={blocks.length} className="font-semibold text-cream-50">{inline(heading[1])}</p>)
    else if (line.trim()) blocks.push(<p key={blocks.length}>{inline(line)}</p>)
  }
  flush()
  return <div className="space-y-2">{blocks}</div>
}

// *italic* or _italic_ (underscores only at word edges, so snake_case stays as is).
const ITALIC = /(\*[^*\s][^*]*\*|(?<!\w)_[^_\s][^_]*_(?!\w))/g

function inline(s: string): ReactNode {
  // **bold** first, then *italic* inside the remaining pieces.
  return s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
      <strong key={i} className="font-semibold text-cream-50">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <Fragment key={i}>{part.split(ITALIC).map((p, j) => (p.length > 2 && /^([*_]).*\1$/s.test(p) ? <em key={j}>{p.slice(1, -1)}</em> : p))}</Fragment>
    ),
  )
}

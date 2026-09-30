import { ArrowUp, RotateCcw, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Markdown } from '../components/Markdown'
import { Chip, cx, PageHeader } from '../components/ui'
import { syncNow, useSync } from '../lib/sync'

interface Turn {
  role: 'user' | 'assistant'
  content: string
}

const KEY = 'miovino.ask'
const MAX_TURNS = 40 // matches the server limit
const STARTERS = ['What should I open this weekend?', 'Which bottles should I drink before they fade?', 'What goes with roast lamb from my cellar?', 'Which wines did I love most, and why?']

function loadTurns(): Turn[] {
  try {
    return (JSON.parse(localStorage.getItem(KEY) ?? '[]') as Turn[]).filter((t) => t.role && t.content)
  } catch {
    return []
  }
}
function saveTurns(turns: Turn[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(turns))
  } catch {
    /* storage unavailable: the chat lasts for this visit only */
  }
}

/** "Ask my cellar": chat with Claude about your own bottles. The conversation is kept on this device. */
export default function AskPage() {
  const sync = useSync()
  const [turns, setTurns] = useState<Turn[]>(loadTurns)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    saveTurns(turns)
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [turns, busy])

  const ask = async (question: string) => {
    const q = question.trim()
    if (!q || busy) return
    setError('')
    setInput('')
    // Keep the latest turns within the server's limit, starting on a question.
    let next: Turn[] = [...turns, { role: 'user', content: q }]
    while (next.length > MAX_TURNS) next = next.slice(2)
    setTurns(next)
    setBusy(true)
    try {
      await syncNow().catch(() => undefined) // so the answer sees the latest bottles
      const res = await fetch('/api/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ messages: next }) })
      const data = (await res.json().catch(() => ({}))) as { answer?: string; error?: string }
      if (!res.ok || !data.answer) throw new Error(data.error ?? `Server error ${res.status}`)
      setTurns([...next, { role: 'assistant', content: data.answer }])
    } catch (e) {
      // Take the unanswered question back so it can be sent again.
      setTurns(next.slice(0, -1))
      setInput(q)
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const offline = !sync.available || !sync.authenticated
  return (
    <div className="flex min-h-[calc(100dvh-8rem)] flex-col">
      <PageHeader
        title="Ask my cellar"
        subtitle="Claude, with your bottles and notes"
        back
        right={
          turns.length > 0 && (
            <button aria-label="New conversation" onClick={() => (setTurns([]), setError(''))} className="rounded-full p-2 text-cream-300 hover:bg-ink-800">
              <RotateCcw size={18} />
            </button>
          )
        }
      />

      <div className="flex-1 space-y-3">
        {turns.length === 0 && (
          <div className="card p-4">
            <p className="mb-3 flex items-center gap-2 text-sm text-cream-200">
              <Sparkles size={16} className="text-gold-400" /> Ask anything about your wines. Try:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {STARTERS.map((s) => (
                <Chip key={s} onClick={() => ask(s)} className="whitespace-normal text-left">
                  {s}
                </Chip>
              ))}
            </div>
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} className={cx('max-w-[85%] rounded-2xl px-4 py-2.5 text-sm', t.role === 'user' ? 'ml-auto whitespace-pre-line bg-wine-700 text-cream-50' : 'card text-cream-100')}>
            {t.role === 'assistant' ? <Markdown text={t.content} /> : t.content}
          </div>
        ))}
        {busy && <div className="card w-16 animate-pulse px-4 py-2.5 text-center text-cream-400">···</div>}
        {error && <p className="text-sm text-rose-300">{error}</p>}
        <div ref={endRef} />
      </div>

      {offline && <p className="mt-4 text-sm text-cream-400">The chat runs on the cloud server — sign in on this device to use it.</p>}
      <form
        className="sticky bottom-24 mt-4 flex items-end gap-2 rounded-2xl bg-ink-900/90 py-2 backdrop-blur-md"
        onSubmit={(e) => {
          e.preventDefault()
          void ask(input)
        }}
      >
        <textarea
          className="field max-h-40 min-h-11 flex-1 resize-none py-2.5"
          rows={1}
          placeholder="Ask about your cellar…"
          value={input}
          maxLength={4000}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void ask(input)
            }
          }}
        />
        <button type="submit" aria-label="Send" disabled={busy || offline || !input.trim()} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-wine-600 text-cream-50 transition hover:bg-wine-500 disabled:opacity-40">
          <ArrowUp size={20} />
        </button>
      </form>
    </div>
  )
}

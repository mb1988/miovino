import { Camera, Check, FileText, Globe, ImageUp, Loader2, Plus, ShoppingBag, Sparkles, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { LiveCamera } from '../components/LiveCamera'
import { VerdictBadge } from '../components/PriceVerdict'
import { Button, cx, Label, PageHeader } from '../components/ui'
import { useCellar } from '../lib/hooks'
import { getLang, plural, t } from '../lib/i18n'
import { imageToBase64 } from '../lib/image'
import { sameWineKey } from '../lib/importer'
import { priceLine, times } from '../lib/prices'
import { useSync } from '../lib/sync'
import type { WineWithBottles } from '../lib/types'
import { addWish } from '../lib/wishlist'
import { bestValue, isPounds, priceCheck } from '../shared/prices'
import { MAX_LIST_PAGES, mergeWineLists, MIN_LIST_TEXT, splitListText, styleOf, type WineListPick, type WineListResult, type WineStyle } from '../shared/winelist'

/**
 * What the owner paid for the same wine (same vintage if they have it). Only an exact producer + name match counts:
 * a Riserva in the cellar says nothing about the normale on the list.
 */
function paidFor(cellar: WineWithBottles[], w: { producer: string; name: string; vintage: number | null }) {
  const key = sameWineKey({ ...w, vintage: null })
  const matches = cellar.filter((c) => sameWineKey({ ...c, vintage: null }) === key)
  const wine = matches.find((m) => m.vintage === w.vintage) ?? matches[0]
  return (wine?.bottles ?? []).map((b) => b.purchasePrice).filter((p): p is number => typeof p === 'number' && p > 0)
}

/** Adds a price check to every bottle: the owner's own purchase price beats the AI's retail estimate. */
function withChecks(result: WineListResult, cellar: WineWithBottles[]) {
  const pounds = isPounds(result.currency)
  const check = (w: { producer: string; name: string; vintage: number | null; price: number | null; retailEstimate: number | null }) =>
    pounds ? priceCheck(w.price, w.retailEstimate, paidFor(cellar, w)) : null
  const picks = result.picks.map((p) => ({ ...p, check: check(p) }))
  const deals = result.deals.map((d) => ({ ...d, check: check(d) }))
  return { picks, deals, best: bestValue([...picks, ...deals]) }
}

const FIT_STYLE: Record<WineListPick['fit'], string> = {
  great: 'bg-emerald-400/15 text-emerald-200 ring-emerald-400/30',
  good: 'bg-sky-400/15 text-sky-200 ring-sky-400/30',
  safe: 'bg-stone-500/15 text-stone-300 ring-stone-500/30',
}
/** Seconds to wait when the free AI tier asks us to slow down (its limits are per minute). */
const RETRY_WAIT = 60
/** The free AI tier allows only a few requests a minute: parts of a long list are spaced at least this far apart. */
const SPACING = 15_000
/** A part that takes longer than this has stalled somewhere: stop waiting, keep what's read. */
const PART_TIMEOUT = 150_000
let lastAsk = 0
/** Waits until the last wine-list request was at least SPACING ago. */
async function spaced() {
  const wait = lastAsk + SPACING - Date.now()
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  lastAsk = Date.now()
}
const FIT_LABEL: Record<WineListPick['fit'], string> = { great: 'Your style', good: 'Good bet', safe: 'Safe choice' }

/** The chips above the picks, one per style. */
const GROUPS: { id: string; label: string; styles: WineStyle[] }[] = [
  { id: 'red', label: 'Red', styles: ['red'] },
  { id: 'white', label: 'White', styles: ['white'] },
  { id: 'sparkling', label: 'Sparkling', styles: ['sparkling'] },
  { id: 'rose', label: 'Rosé', styles: ['rose'] },
  { id: 'sweet', label: 'Sweet', styles: ['sweet'] },
]

type Mode = 'taste' | 'explore'
type Rest = { parts: string[]; total: number; done: WineListResult[]; why: string }
type Run = { result?: WineListResult; rest?: Rest | null }

/**
 * The loaded list, food, budget and answers are kept on the phone, so leaving the page or the app
 * reloading doesn't mean reading the list again. Kept for a day after last use (then it's another restaurant).
 */
const KEEP = 'miovino.winelist'
interface Kept {
  at: number
  doc: { label: string; text: string } | null
  food: string
  budget: string
  mode: Mode
  runs: Partial<Record<Mode, Run>>
}
function loadKept(): Kept | null {
  try {
    const k = JSON.parse(localStorage.getItem(KEEP) ?? 'null') as Kept | null
    return k && Date.now() - k.at < 86_400_000 ? k : null
  } catch {
    return null
  }
}

/** At a restaurant: photograph the wine list, get picks for your own taste. */
export default function WineListPage() {
  const sync = useSync()
  const [kept] = useState(loadKept)
  const [pages, setPages] = useState<{ blob: Blob; url: string }[]>([])
  const [food, setFood] = useState(kept?.food ?? '')
  const [budget, setBudget] = useState(kept?.budget ?? '')
  const [camOpen, setCamOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // One answer per mode ("my taste" / "something different"), so switching back and forth asks nothing again.
  const [mode, setMode] = useState<Mode>(kept?.mode ?? 'taste')
  const [runs, setRuns] = useState<Partial<Record<Mode, Run>>>(kept?.runs ?? {})
  const result = runs[mode]?.result
  const rest = runs[mode]?.rest ?? null
  const patch = (m: Mode, p: Run) => setRuns((r) => ({ ...r, [m]: { ...r[m], ...p } }))
  const [group, setGroup] = useState('red')
  const [saved, setSaved] = useState<Set<string>>(new Set())
  const fileRef = useRef<HTMLInputElement>(null)
  const pdfRef = useRef<HTMLInputElement>(null)
  // The list as text (from a PDF or a website), used instead of photos.
  const [doc, setDoc] = useState<{ label: string; text: string } | null>(kept?.doc ?? null)
  const [linkOpen, setLinkOpen] = useState(false)
  const [link, setLink] = useState('')
  const [pdfs, setPdfs] = useState<string[]>([])
  const [reading, setReading] = useState(false)
  const [progress, setProgress] = useState('')
  // Seconds since "Find my bottle", shown on the button so a slow answer doesn't look stuck.
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!busy) return
    const start = Date.now()
    const id = setInterval(() => setElapsed(Math.round((Date.now() - start) / 1000)), 1000)
    return () => clearInterval(id)
  }, [busy])
  const cellar = useCellar()
  const priced = useMemo(() => (result ? withChecks(result, cellar ?? []) : undefined), [result, cellar])
  // Chips only for the styles this answer has; the chosen one, or the first that has picks.
  const groups = GROUPS.filter((g) => priced?.picks.some((p) => g.styles.includes(styleOf(p.style))))
  const shown = groups.find((g) => g.id === group) ?? groups[0]

  useEffect(() => {
    try {
      if (!doc && !Object.keys(runs).length) localStorage.removeItem(KEEP)
      else localStorage.setItem(KEEP, JSON.stringify({ at: Date.now(), doc, food, budget, mode, runs } satisfies Kept))
    } catch {
      /* private mode or full: it just won't be kept */
    }
  }, [doc, food, budget, mode, runs])

  const addPages = (files: Blob[]) => {
    setDoc(null)
    setPages((p) => [...p, ...files.map((blob) => ({ blob, url: URL.createObjectURL(blob) }))].slice(0, MAX_LIST_PAGES))
  }

  /** Runs one way of getting the list in, with a spinner, and shows its error under the buttons. */
  const load = async (work: () => Promise<void>) => {
    setReading(true)
    setError('')
    setRuns({})
    try {
      await work()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setReading(false)
    }
  }

  const fromPdf = async (file: Blob, name: string) => {
    const { readPdf } = await import('../lib/pdfList')
    const r = await readPdf(file).catch(() => {
      throw new Error(t("Couldn't read that PDF."))
    })
    setPages([])
    if ('text' in r) setDoc({ label: `${name} · ${plural(r.pages, '{n} page', '{n} pages')}`, text: r.text })
    else {
      // A scanned PDF has no text: its first pages go in as photos.
      setDoc(null)
      setPages(r.images.map((blob) => ({ blob, url: URL.createObjectURL(blob) })))
    }
  }

  const openLink = (address: string) =>
    load(async () => {
      const res = await fetch('/api/fetchlist', { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ url: address }) })
      if (res.ok && (res.headers.get('content-type') ?? '').includes('pdf')) {
        setPdfs([])
        setLinkOpen(false)
        return fromPdf(await res.blob(), decodeURIComponent(address.split('?')[0].split('/').pop() || address))
      }
      const data = (await res.json().catch(() => ({}))) as { text?: string; title?: string; pdfs?: string[]; error?: string }
      if (!res.ok || data.text == null) throw new Error(data.error ?? t('Something went wrong ({status}).', { status: res.status }))
      setPdfs(data.pdfs ?? [])
      setPages([])
      if (data.text.length < MIN_LIST_TEXT) {
        setDoc(null)
        throw new Error(data.pdfs?.length ? t('That page has no wine list in its text. Try one of its PDFs below.') : t('That page has no wine list in its text. Download the list and choose PDF.'))
      }
      setDoc({ label: data.title || address, text: data.text })
      setLinkOpen(false)
    })

  const ask = async (source: { text: string; part?: boolean } | { images: string[] }, m: Mode): Promise<WineListResult> => {
    const n = Number(budget.replace(',', '.'))
    await spaced()
    const res = await fetch('/api/winelist', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      signal: AbortSignal.timeout(PART_TIMEOUT),
      body: JSON.stringify({ ...source, food: food.trim() || undefined, budget: n > 0 ? n : undefined, lang: getLang(), explore: m === 'explore' }),
    }).catch((e: Error) => {
      throw Object.assign(new Error(e.name === 'TimeoutError' ? t('The AI took too long to answer. Try again.') : e.message), { status: 504 })
    })
    const data = (await res.json().catch(() => ({}))) as { result?: WineListResult; error?: string; daily?: boolean }
    if (!res.ok || !data.result) throw Object.assign(new Error(data.error ?? t('Something went wrong ({status}).', { status: res.status })), { status: res.status, daily: !!data.daily })
    return data.result
  }

  /** One part of a long list. When the free AI tier says "wait", waits a minute (with a countdown) and tries once more. */
  const askPart = async (text: string, n: number, total: number, m: Mode) => {
    try {
      return await ask({ text, part: total > 1 }, m)
    } catch (e) {
      const { status, daily } = e as { status?: number; daily?: boolean }
      if (status !== 429 || daily) throw e // the day's allowance: waiting a minute won't help
      for (let s = RETRY_WAIT; s > 0; s--) {
        setProgress(t('Free AI limit reached — carrying on in {s} s (part {n} of {total})', { s, n, total }))
        await new Promise((r) => setTimeout(r, 1000))
      }
      setProgress(t('Reading part {n} of {total}…', { n, total }))
      return await ask({ text, part: total > 1 }, m)
    }
  }

  /**
   * Reads the parts still to do, showing the picks so far after each one. If the AI gives up part-way,
   * the picks so far stay on screen and "Read the rest" carries on from the part that failed.
   */
  const readParts = async (parts: string[], total: number, done: WineListResult[], m: Mode) => {
    for (let i = 0; i < parts.length; i++) {
      const n = total - parts.length + i + 1
      setProgress(total > 1 ? t('Reading part {n} of {total}…', { n, total }) : '')
      try {
        done.push(await askPart(parts[i], n, total, m))
      } catch (e) {
        if ((e as { status?: number }).status === 422 && total > 1) continue // a part with no wines (e.g. the food menu)
        if (!done.length) throw e
        patch(m, { rest: { parts: parts.slice(i), total, done, why: (e as Error).message } })
        return
      }
      patch(m, { result: mergeWineLists(done) })
    }
    if (!done.length) throw new Error(t("That doesn't look like a wine list. Try the PDF or page that lists the wines."))
    patch(m, { rest: null })
  }

  const run = async (work: () => Promise<void>) => {
    setElapsed(0)
    setBusy(true)
    setError('')
    try {
      await work()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
      setProgress('')
    }
  }

  const find = (m: Mode = mode) => {
    patch(m, { result: undefined, rest: null })
    setSaved(new Set())
    return run(async () => {
      if (doc) {
        const parts = splitListText(doc.text)
        await readParts(parts, parts.length, [], m)
      } else patch(m, { result: await ask({ images: await Promise.all(pages.map(async (p) => (await imageToBase64(p.blob)).data)) }, m) })
    })
  }
  const readRest = () => {
    const m = mode
    if (rest) void run(() => (patch(m, { rest: null }), readParts(rest.parts, rest.total, [...rest.done], m)))
  }
  /** "My taste" / "Something different": shows that answer, asking for it once if the other one is already there. */
  const switchMode = (m: Mode) => {
    setMode(m)
    setError('')
    if (!runs[m]?.result && !runs[m]?.rest && runs[mode]?.result && !busy && (doc || pages.length)) void find(m)
  }
  const hasList = !!doc || pages.length > 0

  const ready = sync.available && sync.authenticated
  return (
    <div>
      <PageHeader title={t('Wine list')} subtitle={t('Photograph the list, or open its PDF or website')} back />
      <LiveCamera open={camOpen} onClose={() => setCamOpen(false)} onCapture={(b) => addPages([b])} hint={t('One page of the wine list, flat and sharp')} />
      <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => (addPages([...(e.target.files ?? [])]), (e.target.value = ''))} />
      <input
        ref={pdfRef}
        type="file"
        accept="application/pdf,.pdf"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) void load(async () => (setPdfs([]), await fromPdf(f, f.name)))
        }}
      />

      {!ready && <p className="card mb-4 p-4 text-sm text-cream-300">{t('The wine-list scanner runs on your MioVino server — sign in on this device to use it.')}</p>}

      {doc && (
        <div className="card mb-4 flex items-center gap-3 p-3">
          <FileText size={20} className="shrink-0 text-wine-300" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-cream-100">{doc.label}</p>
            <p className="text-xs text-cream-400">{t('List ready to read')}</p>
          </div>
          <button aria-label={t('Remove')} onClick={() => setDoc(null)} className="rounded-full p-1.5 text-cream-300 hover:bg-ink-700">
            <X size={16} />
          </button>
        </div>
      )}

      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {pages.map((p, i) => (
          <div key={p.url} className="relative h-28 w-20 shrink-0 overflow-hidden rounded-xl ring-1 ring-ink-600">
            <img src={p.url} alt={t('Page {n}', { n: i + 1 })} className="h-full w-full object-cover" />
            <button aria-label={t('Remove')} onClick={() => setPages((ps) => ps.filter((x) => x !== p))} className="absolute top-1 right-1 rounded-full bg-black/60 p-1 text-cream-50">
              <X size={12} />
            </button>
          </div>
        ))}
        {pages.length < MAX_LIST_PAGES && (
          <>
            <button onClick={() => setCamOpen(true)} className="flex h-28 w-20 shrink-0 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-ink-600 text-xs text-cream-300">
              <Camera size={20} />
              {pages.length ? t('Add page') : t('Photo')}
            </button>
            <button onClick={() => fileRef.current?.click()} className="flex h-28 w-20 shrink-0 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-ink-600 text-xs text-cream-300">
              <ImageUp size={20} />
              {t('Library')}
            </button>
          </>
        )}
        {!pages.length && (
          <>
            <button disabled={reading} onClick={() => pdfRef.current?.click()} className="flex h-28 w-20 shrink-0 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-ink-600 text-xs text-cream-300">
              <FileText size={20} />
              PDF
            </button>
            <button
              disabled={reading}
              aria-expanded={linkOpen}
              onClick={() => setLinkOpen((o) => !o)}
              className={cx('flex h-28 w-20 shrink-0 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed text-xs text-cream-300', linkOpen ? 'border-wine-400' : 'border-ink-600')}
            >
              <Globe size={20} />
              {t('Website')}
            </button>
          </>
        )}
      </div>

      {linkOpen && (
        <form
          className="mb-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (link.trim()) void openLink(link.trim())
          }}
        >
          <input className="field min-w-0 flex-1" type="text" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-label={t('Wine list web address')} value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://restaurant.co.uk/wine-list" />
          <Button type="submit" disabled={!link.trim() || reading}>
            {t('Open')}
          </Button>
        </form>
      )}
      {pdfs.length > 0 && (
        <div className="mb-4">
          <p className="mb-1.5 text-xs text-cream-400">{t('PDFs on that page:')}</p>
          <div className="flex flex-wrap gap-2">
            {pdfs.map((u) => (
              <button key={u} disabled={reading} onClick={() => void openLink(u)} className="flex max-w-full items-center gap-1.5 rounded-full bg-ink-800 px-3 py-1.5 text-xs text-cream-100 ring-1 ring-ink-600">
                <FileText size={13} aria-hidden />
                <span className="truncate">{decodeURIComponent(u.split('?')[0].split('/').pop() || u)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {reading && (
        <p className="mb-4 flex items-center gap-2 text-sm text-cream-300">
          <Loader2 className="animate-spin" size={16} /> {t('Opening the list…')}
        </p>
      )}

      <div className="mb-4 grid grid-cols-[1fr_7rem] gap-3">
        <label className="block">
          <Label>{t('What are you eating?')}</Label>
          <input className="field" value={food} maxLength={200} onChange={(e) => setFood(e.target.value)} placeholder={t('e.g. lamb chops, risotto ai funghi, cinghiale…')} />
        </label>
        <label className="block">
          <Label>{t('Budget')}</Label>
          <input className="field" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder={t('max')} />
        </label>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-1 rounded-xl bg-ink-850 p-1 ring-1 ring-ink-700" role="group" aria-label={t('What to look for')}>
        {(['taste', 'explore'] as const).map((m) => (
          <button
            key={m}
            aria-pressed={mode === m}
            disabled={busy}
            onClick={() => switchMode(m)}
            className={cx('min-h-10 rounded-lg px-2 text-sm', mode === m ? 'bg-ink-700 font-medium text-cream-50' : 'text-cream-400')}
          >
            {m === 'taste' ? t('My taste') : t('Something different')}
          </button>
        ))}
      </div>
      {mode === 'explore' && <p className="-mt-1 mb-3 text-xs text-cream-400">{t('Wines outside your usual regions and grapes, chosen for what you like.')}</p>}

      <Button className="w-full py-3" disabled={!hasList || busy || reading || !ready} onClick={() => void find()}>
        {busy ? (
          <>
            <Loader2 className="animate-spin" size={18} /> {progress || t('Reading the list…')} <span className="tabular-nums opacity-70">{elapsed} s</span>
          </>
        ) : (
          t('Find my bottle')
        )}
      </Button>
      {busy && <p className="mt-2 text-center text-xs text-cream-500">{t('Usually under a minute for a long list')}</p>}
      {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}
      {rest && !busy && (
        <div role="alert" className="mt-3 rounded-xl bg-amber-400/10 p-3 text-sm text-amber-100 ring-1 ring-amber-400/30">
          <p>{t('Read {read} of {total} parts of the list, so these picks cover only those. {why}', { read: rest.total - rest.parts.length, total: rest.total, why: rest.why })}</p>
          <Button variant="secondary" className="mt-2" onClick={readRest}>
            {t('Read the rest')}
          </Button>
        </div>
      )}

      {result && priced && (
        <section className="mt-6 space-y-3">
          {priced.best && (
            <p className="flex items-start gap-2 rounded-xl bg-emerald-400/10 p-3 text-sm text-emerald-100 ring-1 ring-emerald-400/30">
              <Sparkles size={16} className="mt-0.5 shrink-0" aria-hidden />
              <span>
                {t('Best value on this list: {wine} — {x} {basis}', {
                  wine: [priced.best.producer, priced.best.name, priced.best.vintage].filter(Boolean).join(' '),
                  x: times(priced.best.check!.markup),
                  basis: priced.best.check!.basis === 'paid' ? t('what you paid') : t('shop price'),
                })}
              </span>
            </p>
          )}
          {result.picks.length === 0 && <p className="text-sm text-cream-400">{t('Nothing on this list fits — the note below may help.')}</p>}
          {groups.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label={t('Style')}>
              {groups.map((g) => (
                <button
                  key={g.id}
                  aria-pressed={g === shown}
                  onClick={() => setGroup(g.id)}
                  className={cx('min-h-9 shrink-0 rounded-full px-3.5 text-sm ring-1', g === shown ? 'bg-wine-500 text-cream-50 ring-wine-400' : 'text-cream-300 ring-ink-600')}
                >
                  {t(g.label)} <span className="tabular-nums opacity-70">{priced.picks.filter((p) => g.styles.includes(styleOf(p.style))).length}</span>
                </button>
              ))}
            </div>
          )}
          {priced.picks.filter((p) => !shown || shown.styles.includes(styleOf(p.style))).map((p, i) => (
            <div key={`${p.producer}|${p.name}|${p.vintage}`} className="card p-4">
              <div className="mb-1 flex items-start gap-2">
                <span className="mt-0.5 font-display text-lg text-cream-400">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-cream-400">{p.producer}</p>
                  <p className="font-display text-lg leading-snug text-cream-50">
                    {p.name} {p.vintage ?? ''}
                  </p>
                  {p.grapes && <p className="text-xs text-cream-400">{p.grapes}</p>}
                </div>
                {p.price != null && (
                  <span className="shrink-0 font-semibold text-cream-100 tabular-nums">
                    {result.currency ?? ''}
                    {p.price}
                  </span>
                )}
              </div>
              <div className="mb-2 flex flex-wrap gap-1.5 pl-6">
                <span className={cx('rounded-full px-2 py-0.5 text-[11px] font-medium ring-1', FIT_STYLE[p.fit])}>{t(FIT_LABEL[p.fit])}</span>
                {p.byTheGlass && <span className="rounded-full px-2 py-0.5 text-[11px] text-cream-300 ring-1 ring-ink-600">{t('by the glass')}</span>}
                {p.inCellar && <span className="rounded-full px-2 py-0.5 text-[11px] text-gold-400 ring-1 ring-gold-400/40">{t('also in your cellar')}</span>}
                {p.check && <VerdictBadge verdict={p.check.verdict} />}
              </div>
              <p className="pl-6 text-sm text-cream-200">{p.why}</p>
              {p.vintageNote && (
                <p className="mt-1 pl-6 text-xs text-cream-300">
                  {p.vintage ?? 'NV'}: {p.vintageNote}
                </p>
              )}
              {priceLine(p.check, p.retailEstimate, p.valueNote) && <p className="mt-1 pl-6 text-xs text-cream-400">{priceLine(p.check, p.retailEstimate, p.valueNote)}</p>}
              <button
                disabled={saved.has(`${p.producer}|${p.name}|${p.vintage}`)}
                onClick={async () => {
                  await addWish({ producer: p.producer, name: p.name, vintage: p.vintage, note: t('Seen on a wine list{price}', { price: p.price != null ? ` · ${result.currency ?? ''}${p.price}` : '' }) })
                  setSaved((s) => new Set(s).add(`${p.producer}|${p.name}|${p.vintage}`))
                }}
                className="mt-2 ml-6 flex items-center gap-1.5 text-xs text-wine-300 disabled:text-cream-500"
              >
                {saved.has(`${p.producer}|${p.name}|${p.vintage}`) ? <Check size={14} /> : <ShoppingBag size={14} />} {saved.has(`${p.producer}|${p.name}|${p.vintage}`) ? t('On your wishlist') : t('Add to wishlist')}
              </button>
            </div>
          ))}
          {priced.deals.length > 0 && (
            <div className="card p-4">
              <h2 className="mb-2 font-display text-base text-cream-50">{t('Prices worth knowing')}</h2>
              <ul className="space-y-2.5">
                {priced.deals.map((d, i) => (
                  <li key={i}>
                    <div className="flex items-start gap-2">
                      <p className="min-w-0 flex-1 text-sm text-cream-100">
                        {[d.producer, d.name, d.vintage].filter(Boolean).join(' ')}
                        {d.grapes && <span className="block text-xs text-cream-400">{d.grapes}</span>}
                      </p>
                      <span className="shrink-0 text-sm font-semibold text-cream-100 tabular-nums">
                        {result.currency ?? ''}
                        {d.price}
                      </span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                      {d.check && <VerdictBadge verdict={d.check.verdict} />}
                      <span className="text-xs text-cream-400">{priceLine(d.check, d.retailEstimate, d.valueNote)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {[...priced.picks, ...priced.deals].some((x) => x.check?.basis === 'retail') && (
            <p className="text-xs text-cream-500">{t('Shop prices are AI estimates, not quotes. UK restaurants usually charge 2.5–3.5× retail.')}</p>
          )}
          {result.note && <p className="rounded-xl bg-ink-800 p-3 text-sm text-cream-300">💡 {result.note}</p>}
          {result.ai && <p className="text-center text-xs text-cream-500">{t('Answered by {ai}', { ai: result.ai })}</p>}
          <button className="flex w-full items-center justify-center gap-1.5 py-2 text-sm text-cream-400" onClick={() => (setPages([]), setDoc(null), setRuns({}), setMode('taste'))}>
            <Plus size={14} /> {t('Another list')}
          </button>
        </section>
      )}
    </div>
  )
}

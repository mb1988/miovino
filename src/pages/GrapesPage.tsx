import { Check, Grape, Loader2, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Empty, PageHeader, Section } from '../components/ui'
import { db } from '../lib/db'
import { useCellar } from '../lib/hooks'
import { plural, t } from '../lib/i18n'
import { useSync } from '../lib/sync'
import type { WineWithBottles } from '../lib/types'
import { certainBlend, grapesDisplay, MAX_BLEND_WINES, parseGrapes, type BlendSuggestion, type GrapePct } from '../shared/blend'

const label = (w: WineWithBottles) => `${w.producer} ${w.name} ${w.vintage ?? 'NV'}`
const missingPct = (w: WineWithBottles) => !w.grapePct || !w.grapes.length || w.grapes.some((g) => w.grapePct?.[g] == null)

/**
 * Grape percentages for wines that don't have them. Never guessed:
 *  - certain: the appellation allows one grape only (Barolo = 100% Nebbiolo), or you typed the % into the grape names;
 *  - published: the AI is asked for the producer's published blend, shown with its source, saved only if you accept.
 */
export default function GrapesPage() {
  const cellar = useCellar()
  const sync = useSync()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [found, setFound] = useState<Map<string, BlendSuggestion>>(new Map())
  const [asked, setAsked] = useState<Set<string>>(new Set())
  const [msg, setMsg] = useState('')

  const groups = useMemo(() => {
    const todo = (cellar ?? []).filter(missingPct)
    const certain: { w: WineWithBottles; grapes: string[]; pct: GrapePct; why: 'rule' | 'typed' }[] = []
    const rest: WineWithBottles[] = []
    for (const w of todo) {
      const typed = parseGrapes(w.grapes)
      const rule = certainBlend(w)
      if (Object.keys(typed.pct).length) certain.push({ w, grapes: typed.grapes, pct: { ...w.grapePct, ...typed.pct }, why: 'typed' })
      else if (rule) certain.push({ w, grapes: Object.keys(rule), pct: rule, why: 'rule' })
      else rest.push(w)
    }
    return { certain, rest }
  }, [cellar])
  if (!cellar) return null

  const fillCertain = async () => {
    await db.transaction('rw', db.wines, async () => {
      for (const c of groups.certain) await db.wines.update(c.w.id, { grapes: c.grapes, grapePct: c.pct })
    })
    setMsg(plural(groups.certain.length, 'Filled {n} wine.', 'Filled {n} wines.'))
  }

  const lookUp = async () => {
    setBusy(true)
    setError('')
    try {
      const batch = groups.rest.filter((w) => !asked.has(w.id)).slice(0, MAX_BLEND_WINES)
      const res = await fetch('/api/blends', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ wines: batch.map((w) => ({ id: w.id, producer: w.producer, name: w.name, vintage: w.vintage, appellation: w.appellation, grapes: w.grapes })) }),
      })
      const data = (await res.json().catch(() => ({}))) as { blends?: BlendSuggestion[]; error?: string }
      if (!res.ok || !data.blends) throw new Error(data.error ?? t('Something went wrong ({status}).', { status: res.status }))
      setFound((m) => new Map([...m, ...data.blends!.map((b) => [b.id, b] as const)]))
      setAsked((s) => new Set([...s, ...batch.map((w) => w.id)]))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const accept = async (w: WineWithBottles, b: BlendSuggestion) => {
    await db.wines.update(w.id, {
      grapes: Object.keys(b.pct),
      grapePct: b.pct,
      external: [...w.external, { source: 'Published blend', note: `${grapesDisplay(Object.keys(b.pct), b.pct).join(', ')} — ${b.source}` }],
    })
    setFound((m) => {
      const n = new Map(m)
      n.delete(w.id)
      return n
    })
  }

  const left = groups.rest.filter((w) => !asked.has(w.id)).length
  const unknown = groups.rest.filter((w) => asked.has(w.id) && !found.has(w.id))

  return (
    <div>
      <PageHeader title={t('Grape percentages')} subtitle={t('Only from facts — never guessed')} back />
      {msg && <p role="status" className="card mb-4 p-3 text-sm text-emerald-200">{msg}</p>}

      {!groups.certain.length && !groups.rest.length ? (
        <Empty icon={<Grape size={28} />} title={t('Every wine has its percentages')}>
          {t('New wines take them in the grapes field, e.g. “Merlot 60%, Cabernet Franc 40%”.')}
        </Empty>
      ) : null}

      {groups.certain.length > 0 && (
        <Section title={t('Certain · {n}', { n: groups.certain.length })}>
          <div className="card divide-y divide-ink-700">
            {groups.certain.map((c) => (
              <div key={c.w.id} className="p-3 text-sm">
                <p className="text-cream-100">{label(c.w)}</p>
                <p className="text-xs text-cream-400">
                  {grapesDisplay(c.grapes, c.pct).join(', ')} · {c.why === 'rule' ? t('the appellation allows only this grape') : t('from what you typed')}
                </p>
              </div>
            ))}
          </div>
          <Button className="mt-3 w-full" onClick={fillCertain}>
            <Check size={16} aria-hidden /> {plural(groups.certain.length, 'Fill {n} wine', 'Fill {n} wines')}
          </Button>
        </Section>
      )}

      {groups.rest.length > 0 && (
        <Section title={t('Blends · {n}', { n: groups.rest.length })}>
          <p className="mb-3 text-sm text-cream-300">{t('The AI looks for the blend each producer published for that vintage. You see the source and choose; anything not published stays empty.')}</p>
          {[...found.values()].map((b) => {
            const w = groups.rest.find((x) => x.id === b.id)
            if (!w) return null
            return (
              <div key={b.id} className="card mb-2 p-3 text-sm">
                <p className="text-cream-100">{label(w)}</p>
                <p className="mt-0.5 font-medium text-cream-50">{grapesDisplay(Object.keys(b.pct), b.pct).join(', ')}</p>
                <p className="text-xs text-cream-500">{t('Source: {source}', { source: b.source })}</p>
                <div className="mt-2 flex gap-2">
                  <Button className="flex-1 py-2" onClick={() => accept(w, b)}>
                    {t('Accept')}
                  </Button>
                  <Button
                    variant="ghost"
                    className="py-2"
                    onClick={() =>
                      setFound((m) => {
                        const n = new Map(m)
                        n.delete(b.id)
                        return n
                      })
                    }
                  >
                    {t('Skip')}
                  </Button>
                </div>
              </div>
            )
          })}
          {unknown.length > 0 && (
            <p className="mb-3 text-xs text-cream-500">{plural(unknown.length, 'No published blend found for {n} wine — left empty.', 'No published blend found for {n} wines — left empty.')}</p>
          )}
          {left > 0 &&
            (sync.available && sync.authenticated ? (
              <Button variant="secondary" className="w-full" disabled={busy} onClick={lookUp}>
                {busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Search size={16} aria-hidden />}{' '}
                {busy ? t('Looking…') : plural(Math.min(left, MAX_BLEND_WINES), 'Look up the published blend for {n} wine', 'Look up published blends for {n} wines')}
              </Button>
            ) : (
              <p className="text-sm text-cream-400">{t('Sign in on this device to look up published blends.')}</p>
            ))}
          {error && <p className="mt-2 text-sm text-rose-300">{error}</p>}
          <p className="mt-3 text-xs text-cream-500">
            {t('You can always type them yourself:')}{' '}
            <Link to={groups.rest[0] ? `/wine/${groups.rest[0].id}/edit` : '/'} className="text-wine-300 underline">
              {t('edit a wine')}
            </Link>{' '}
            {t('→ Grapes, e.g. “Merlot 60%, Cabernet Franc 40%”.')}
          </p>
        </Section>
      )}
    </div>
  )
}

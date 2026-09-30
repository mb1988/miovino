import { BookOpen } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bottle, Chip, Empty, PageHeader, Stars } from '../components/ui'
import { useCellar } from '../lib/hooks'
import { fmtDate } from './WinePage'

export default function JournalPage() {
  const cellar = useCellar()
  const [minRating, setMinRating] = useState(0)
  const entries = useMemo(
    () =>
      (cellar ?? [])
        .flatMap((w) => w.tastings.map((t) => ({ t, w })))
        .filter(({ t }) => (t.rating ?? 0) >= minRating)
        .sort((a, b) => b.t.date.localeCompare(a.t.date) || b.t.createdAt - a.t.createdAt),
    [cellar, minRating],
  )
  const byMonth = useMemo(() => {
    const m = new Map<string, typeof entries>()
    for (const e of entries) {
      const k = e.t.date.slice(0, 7)
      m.set(k, [...(m.get(k) ?? []), e])
    }
    return [...m.entries()]
  }, [entries])

  return (
    <div>
      <PageHeader title="Journal" subtitle="Every bottle you've opened" />
      <div className="mb-4 flex gap-1.5 overflow-x-auto no-scrollbar">
        {[0, 3, 4, 4.5].map((r) => (
          <Chip key={r} active={minRating === r} onClick={() => setMinRating(r)}>
            {r === 0 ? 'All' : `${r}★ +`}
          </Chip>
        ))}
      </div>
      {cellar && entries.length === 0 ? (
        <Empty icon={<BookOpen size={28} />} title="No tastings yet">
          Open a wine and tap <b>Drink a bottle</b> to start your journal.
        </Empty>
      ) : (
        byMonth.map(([month, list]) => (
          <section key={month} className="mb-6">
            <h2 className="mb-2 text-xs font-semibold tracking-[0.14em] text-cream-400 uppercase">
              {new Date(month + '-15').toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
            </h2>
            <div className="space-y-2">
              {list.map(({ t, w }) => (
                <Link key={t.id} to={`/wine/${w.id}`} className="card flex gap-3 p-4 hover:ring-ink-600">
                  <Bottle type={w.type} className="h-10 w-4 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 text-sm font-medium text-cream-50">
                        {w.producer} · {w.name} {w.vintage ?? 'NV'}
                      </p>
                      <Stars value={t.rating} size={12} className="shrink-0" />
                    </div>
                    <p className="text-xs text-cream-400">{[fmtDate(t.date), t.occasion, t.company && `with ${t.company}`, t.food].filter(Boolean).join(' · ')}</p>
                    {t.notes && <p className="mt-1.5 line-clamp-3 text-sm text-cream-200">“{t.notes}”</p>}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  )
}

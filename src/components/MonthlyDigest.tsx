import { BellRing, ChevronRight, X } from 'lucide-react'
import { locale, t } from '../lib/i18n'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { buildDigest, digestLabel } from '../shared/reminders'
import { currentYear, drinkStatus } from '../lib/status'
import type { WineWithBottles } from '../lib/types'
import { StatusChip } from './ui'

const KEY = 'miovino.digestDismissed'
const monthKey = (d = new Date()) => `${d.getFullYear()}-${d.getMonth() + 1}`

function dismissedThisMonth() {
  try {
    return localStorage.getItem(KEY) === monthKey()
  } catch {
    return false
  }
}

/** This month's "drink these first" card. Hidden until next month once dismissed (on this device). */
export function MonthlyDigest({ cellar }: { cellar: WineWithBottles[] }) {
  const [hidden, setHidden] = useState(dismissedThisMonth)
  const [month] = useState(() => ((m) => m.charAt(0).toUpperCase() + m.slice(1))(new Date().toLocaleString(locale(), { month: 'long' })))
  const digest = useMemo(() => buildDigest(cellar.map((w) => ({ ...w, bottles: w.inCellar })), currentYear()), [cellar])
  const urgent = [...digest.past, ...digest.soon]
  if (hidden || !urgent.length) return null

  const dismiss = () => {
    try {
      localStorage.setItem(KEY, monthKey())
    } catch {
      /* storage unavailable: hide for this visit only */
    }
    setHidden(true)
  }

  return (
    <section className="card mb-4 p-4 ring-amber-400/30">
      <div className="mb-3 flex items-start gap-3">
        <BellRing size={18} className="mt-0.5 shrink-0 text-amber-300" />
        <div className="flex-1">
          <p className="font-display text-lg font-semibold text-cream-50">{t('{month}: drink these first', { month })}</p>
          <p className="text-xs text-cream-400">
            {[digest.soon.length && t('{n} closing soon', { n: digest.soon.length }), digest.past.length && t('{n} past the window', { n: digest.past.length }), digest.opening.length && t('{n} opening next year', { n: digest.opening.length })].filter(Boolean).join(' · ')}
          </p>
        </div>
        <button aria-label={t('Hide until next month')} onClick={dismiss} className="-mr-1.5 -mt-1.5 rounded-full p-1.5 text-cream-400 hover:bg-ink-700">
          <X size={16} />
        </button>
      </div>
      <div className="divide-y divide-ink-700">
        {urgent.slice(0, 3).map((w) => (
          <Link key={w.id} to={`/wine/${w.id}`} className="flex items-center gap-3 py-2 text-sm hover:text-cream-50">
            <span className="min-w-0 flex-1 truncate text-cream-100">{digestLabel(w)}</span>
            <span className="text-xs text-cream-500">×{w.bottles}</span>
            <StatusChip status={drinkStatus(w)} />
          </Link>
        ))}
      </div>
      {urgent.length > 3 && (
        <Link to={digest.soon.length ? '/?status=soon' : '/?status=past'} className="mt-2 flex items-center gap-1 text-xs text-wine-300">
          {t('See all {n}', { n: urgent.length })} <ChevronRight size={14} />
        </Link>
      )}
    </section>
  )
}

import { ChevronLeft, Star, X } from 'lucide-react'
import { t } from '../lib/i18n'
import { useEffect, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { COUNTRY_FLAG } from '../lib/knowledge'
import { currentYear, drinkStatus, STATUS_META, windowAxis, type DrinkStatus } from '../lib/status'
import type { Wine, WineType } from '../lib/types'

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ')
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
export function Button({
  variant = 'primary',
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const styles: Record<Variant, string> = {
    primary: 'bg-wine-600 text-cream-50 hover:bg-wine-500 active:bg-wine-700 shadow-lg shadow-wine-900/30',
    secondary: 'bg-ink-800 text-cream-100 ring-1 ring-ink-600 hover:bg-ink-700',
    ghost: 'text-cream-200 hover:bg-ink-800',
    danger: 'bg-rose-900/40 text-rose-200 ring-1 ring-rose-800 hover:bg-rose-900/60',
  }
  return (
    <button
      {...rest}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition disabled:opacity-40 disabled:pointer-events-none',
        styles[variant],
        className,
      )}
    >
      {children}
    </button>
  )
}

export function PageHeader({ title, subtitle, back, right }: { title: ReactNode; subtitle?: ReactNode; back?: boolean; right?: ReactNode }) {
  const nav = useNavigate()
  return (
    <header className="sticky top-0 z-20 -mx-4 mb-3 bg-ink-900/85 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] backdrop-blur-md">
      <div className="flex items-center gap-2">
        {back && (
          <button aria-label={t('Back')} onClick={() => (history.length > 1 ? nav(-1) : nav('/'))} className="-ml-2 rounded-full p-2 text-cream-200 hover:bg-ink-800">
            <ChevronLeft size={22} />
          </button>
        )}
        <div className="min-w-0 flex-1">
          {/* Pages with their own heading (e.g. a wine's name in the hero) pass an empty title. */}
          {title ? <h1 className="font-display truncate text-2xl font-semibold text-cream-50">{title}</h1> : null}
          {subtitle && <p className="truncate text-sm text-cream-400">{subtitle}</p>}
        </div>
        {right}
      </div>
    </header>
  )
}

export function Chip({ active, onClick, children, className }: { active?: boolean; onClick?: () => void; children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition',
        active ? 'bg-cream-100 text-ink-900 ring-cream-100' : 'bg-ink-850 text-cream-300 ring-ink-600 hover:text-cream-100',
        className,
      )}
    >
      {children}
    </button>
  )
}

export function StatusChip({ status, className }: { status: DrinkStatus; className?: string }) {
  const m = STATUS_META[status]
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1', m.chip, className)}>
      <span className={cx('h-1.5 w-1.5 rounded-full', m.dot)} />
      {t(m.label)}
    </span>
  )
}

export const TYPE_COLOR: Record<WineType, string> = {
  red: '#8a1c3c',
  white: '#e3cf7a',
  rose: '#e79aa9',
  sparkling: '#f0e2a8',
  dessert: '#d69a3a',
  fortified: '#7a3b1d',
  orange: '#e0893a',
}

export function Bottle({ type, className = 'h-12 w-5' }: { type: WineType; className?: string }) {
  return (
    <svg viewBox="0 0 20 56" className={className} aria-hidden>
      <path d="M7.5 1h5v12c0 3 5.5 5 5.5 11v28a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V24c0-6 5.5-8 5.5-11z" fill={TYPE_COLOR[type]} opacity="0.95" />
      <rect x="2" y="30" width="16" height="12" fill="#fbf6ee" opacity="0.85" />
      <rect x="7.5" y="1" width="5" height="5" fill="#0f080b" opacity="0.5" />
    </svg>
  )
}

export function Flag({ country }: { country?: string }) {
  if (!country) return null
  return <span aria-label={country}>{COUNTRY_FLAG[country] ?? '🌍'}</span>
}

export function Stars({ value, size = 14, className }: { value?: number; size?: number; className?: string }) {
  if (value == null) return null
  return (
    <span role="img" className={cx('inline-flex items-center gap-0.5 text-gold-400', className)} aria-label={t('{value} of 5 stars', { value: value ?? 0 })}>
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = Math.max(0, Math.min(1, value - (i - 1)))
        return (
          <span key={i} className="relative inline-block" style={{ width: size, height: size }}>
            <Star size={size} className="absolute text-ink-600" fill="currentColor" strokeWidth={0} />
            <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
              <Star size={size} fill="currentColor" strokeWidth={0} />
            </span>
          </span>
        )
      })}
    </span>
  )
}

/** Half-star input: tap left half of a star for .5 */
export function StarInput({ value, onChange }: { value?: number; onChange: (v: number | undefined) => void }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = value == null ? 0 : Math.max(0, Math.min(1, value - (i - 1)))
        return (
          <div key={i} className="relative h-10 w-10">
            <Star size={40} className="absolute text-ink-600" fill="currentColor" strokeWidth={0} />
            <div className="absolute inset-0 overflow-hidden text-gold-400" style={{ width: `${fill * 100}%` }}>
              <Star size={40} fill="currentColor" strokeWidth={0} />
            </div>
            <button type="button" aria-label={t('{value} stars', { value: i - 0.5 })} className="absolute inset-y-0 left-0 w-1/2" onClick={() => onChange(value === i - 0.5 ? undefined : i - 0.5)} />
            <button type="button" aria-label={t('{value} stars', { value: i })} className="absolute inset-y-0 right-0 w-1/2" onClick={() => onChange(value === i ? undefined : i)} />
          </div>
        )
      })}
      <span className="ml-2 w-8 text-lg font-semibold text-cream-100">{value ?? '–'}</span>
    </div>
  )
}

export function WindowBar({ wine, compact }: { wine: Pick<Wine, 'vintage' | 'drinkFrom' | 'drinkTo' | 'peakYear'>; compact?: boolean }) {
  const year = currentYear()
  if (wine.drinkFrom == null && wine.drinkTo == null) return null
  const { start, end, pos } = windowAxis(wine, year)
  const from = wine.drinkFrom ?? start
  const to = wine.drinkTo ?? end
  const status = drinkStatus(wine, year)
  return (
    <div className={compact ? '' : 'pt-6 pb-5'}>
      <div className="relative h-2 rounded-full bg-ink-700">
        <div className={cx('absolute inset-y-0 rounded-full', STATUS_META[status].dot, 'opacity-80')} style={{ left: `${pos(from) * 100}%`, width: `${Math.max(2, (pos(to) - pos(from)) * 100)}%` }} />
        {wine.peakYear != null && wine.peakYear >= start && wine.peakYear <= end && (
          <div className="absolute -top-1 h-4 w-0.5 rounded bg-gold-400" style={{ left: `${pos(wine.peakYear) * 100}%` }} title={`Peak ${wine.peakYear}`} />
        )}
        <div className="absolute -top-1.5 h-5 w-5 -translate-x-1/2 rounded-full border-2 border-cream-50 bg-ink-900" style={{ left: `${pos(year) * 100}%` }} />
        {!compact && (
          <>
            <span className="absolute -top-6 -translate-x-1/2 text-[11px] font-semibold text-cream-50" style={{ left: `${pos(year) * 100}%` }}>
              {t('Today')}
            </span>
            <span className="absolute top-4 text-[11px] text-cream-400" style={{ left: 0 }}>
              {start}
            </span>
            <span className="absolute top-4 -translate-x-1/2 text-[11px] text-cream-200" style={{ left: `${pos(from) * 100}%` }}>
              {wine.drinkFrom ?? ''}
            </span>
            <span className="absolute top-4 -translate-x-full text-[11px] text-cream-200" style={{ left: `${pos(to) * 100}%` }}>
              {wine.drinkTo ?? ''}
            </span>
          </>
        )}
      </div>
    </div>
  )
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={(el) => {
          // Move focus into the sheet when it opens, so keyboard and screen-reader users land in it.
          if (el && !el.contains(document.activeElement)) el.focus()
        }}
        tabIndex={-1}
        className="animate-sheet pb-[calc(env(safe-area-inset-bottom)+1.25rem)] max-h-[88dvh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-ink-850 p-5 ring-1 ring-ink-700 outline-none sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold text-cream-50">{title}</h2>
          <button aria-label={t('Close')} onClick={onClose} className="rounded-full p-1.5 text-cream-300 hover:bg-ink-700">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Label({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <span className="mb-1.5 flex items-baseline justify-between text-xs font-medium uppercase tracking-wide text-cream-400">
      {children}
      {hint && <span className="normal-case tracking-normal text-cream-500">{hint}</span>}
    </span>
  )
}

export function Section({ title, action, children, className }: { title: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('mb-6', className)}>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-cream-400">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

export function Empty({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center px-6 py-10 text-center">
      <div className="mb-3 text-wine-300">{icon}</div>
      <p className="font-display text-lg text-cream-50">{title}</p>
      {children && <div className="mt-2 text-sm text-cream-400">{children}</div>}
    </div>
  )
}

export function wineTitle(w: Pick<Wine, 'producer' | 'name' | 'vintage'>) {
  return `${w.producer} ${w.name} ${w.vintage ?? 'NV'}`
}

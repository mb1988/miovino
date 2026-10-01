import { Heart, MapPin } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useBlobUrl } from '../lib/hooks'
import { bottlePrice } from '../lib/recommend'
import { formatMoney } from '../lib/settings'
import { t } from '../lib/i18n'
import { drinkStatus, STATUS_META } from '../lib/status'
import type { WineWithBottles } from '../lib/types'
import { Bottle, cx, Flag, Stars, StatusChip, WindowBar } from './ui'

export function locationsOf(w: WineWithBottles) {
  return [...new Set(w.bottles.filter((b) => b.status === 'cellar').map((b) => b.location).filter(Boolean))] as string[]
}

export function WineCard({ wine: w }: { wine: WineWithBottles }) {
  const photo = useBlobUrl(w.photo)
  const status = drinkStatus(w)
  const locs = locationsOf(w)
  const price = bottlePrice(w)
  return (
    <Link to={`/wine/${w.id}`} className={cx('card animate-rise block p-4 transition hover:ring-ink-600', w.inCellar === 0 && 'opacity-55')}>
      <div className="flex gap-3.5">
        <div className="flex w-10 shrink-0 items-start justify-center pt-0.5">
          {photo ? <img src={photo} alt="" className="h-14 w-10 rounded-md object-cover" /> : <Bottle type={w.type} className="h-14 w-6" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <p className="min-w-0 flex-1 truncate text-sm text-cream-300">{w.producer}</p>
            {w.favourite && <Heart size={14} className="mt-0.5 shrink-0 text-wine-300" fill="currentColor" />}
          </div>
          <p className="font-display text-[17px] leading-snug font-semibold text-cream-50">
            {w.name} <span className="text-cream-300">{w.vintage ?? 'NV'}</span>
          </p>
          <p className="mt-0.5 truncate text-xs text-cream-400">
            <Flag country={w.country} /> {[w.region, w.grapes.slice(0, 2).join(' · ')].filter(Boolean).join(' — ')}
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <StatusChip status={status} />
            {w.drinkFrom != null || w.drinkTo != null ? (
              <span className="text-[11px] text-cream-400">
                {w.drinkFrom ?? '…'}–{w.drinkTo ?? '…'}
              </span>
            ) : null}
            {w.avgRating != null && <Stars value={w.avgRating} size={12} />}
          </div>
          {(w.drinkFrom != null || w.drinkTo != null) && (
            <div className="mt-3">
              <WindowBar wine={w} compact />
            </div>
          )}
          <div className="mt-3 flex items-center gap-3 text-xs text-cream-400">
            <span className="font-semibold text-cream-100">
              {w.inCellar} {w.inCellar === 1 ? t('bottle') : t('bottles')}
            </span>
            {price != null && <span>{formatMoney(price)}</span>}
            {locs.length > 0 && (
              <span className="flex min-w-0 items-center gap-1 truncate">
                <MapPin size={12} className="shrink-0" />
                <span className="truncate">{locs.join(', ')}</span>
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  )
}

export function WineRow({ wine: w }: { wine: WineWithBottles }) {
  const status = drinkStatus(w)
  const m = STATUS_META[status]
  const locs = locationsOf(w)
  const range = w.drinkFrom != null || w.drinkTo != null ? `${w.drinkFrom ?? '…'}–${w.drinkTo ?? '…'}` : ''
  return (
    <Link to={`/wine/${w.id}`} className={cx('flex items-start gap-3 border-b border-ink-800 px-1 py-3 hover:bg-ink-850', w.inCellar === 0 && 'opacity-55')}>
      <Bottle type={w.type} className="mt-0.5 h-9 w-4 shrink-0" />
      <div className="min-w-0 flex-1">
        {/* The name wraps (up to two lines) rather than being cut off; the producer sits above it. */}
        <p className="truncate text-xs text-cream-300">
          {w.producer}
          {w.favourite && <Heart size={11} className="ml-1 inline align-[-1px] text-wine-300" fill="currentColor" aria-label={t('Favourite')} />}
        </p>
        <p className="line-clamp-2 text-[15px] leading-snug font-medium break-words text-cream-50">
          {w.name} <span className="font-normal text-cream-300">{w.vintage ?? 'NV'}</span>
        </p>
        <p className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-cream-400">
          <span className={cx('h-2 w-2 shrink-0 rounded-full', m.dot)} aria-hidden />
          <span className="shrink-0">{t(m.label)}</span>
          {range && <span className="shrink-0">· {range}</span>}
          {locs.length > 0 && <span className="min-w-0 truncate">· {locs.join(', ')}</span>}
        </p>
      </div>
      <div className="shrink-0 pt-0.5 text-right">
        <p className="text-base leading-none font-semibold text-cream-100">{w.inCellar}</p>
        <p className="mt-1 text-[11px] text-cream-500">{w.inCellar === 1 ? t('bottle') : t('bottles')}</p>
      </div>
    </Link>
  )
}

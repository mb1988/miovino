import { Heart, MapPin } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useBlobUrl } from '../lib/hooks'
import { bottlePrice } from '../lib/recommend'
import { formatMoney } from '../lib/settings'
import { drinkStatus } from '../lib/status'
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
              {w.inCellar} {w.inCellar === 1 ? 'bottle' : 'bottles'}
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
  return (
    <Link to={`/wine/${w.id}`} className={cx('flex items-center gap-3 border-b border-ink-800 px-1 py-2.5 hover:bg-ink-850', w.inCellar === 0 && 'opacity-55')}>
      <Bottle type={w.type} className="h-8 w-3.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-cream-50">
          {w.producer} · {w.name}
        </p>
        <p className="truncate text-xs text-cream-400">
          {w.vintage ?? 'NV'} · {w.drinkFrom ?? '…'}–{w.drinkTo ?? '…'}
          {locationsOf(w).length ? ` · ${locationsOf(w).join(', ')}` : ''}
        </p>
      </div>
      <StatusChip status={status} className="hidden sm:inline-flex" />
      <span className={cx('h-2 w-2 shrink-0 rounded-full sm:hidden', { past: 'bg-rose-500', soon: 'bg-amber-400', ready: 'bg-emerald-400', approaching: 'bg-yellow-300', hold: 'bg-sky-400', unknown: 'bg-stone-500' }[status])} />
      <span className="w-6 text-right text-sm font-semibold text-cream-100">{w.inCellar}</span>
    </Link>
  )
}

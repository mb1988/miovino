import { Minus, Plus, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { plural, t } from '../lib/i18n'
import { hasGrid, layout, unslotted } from '../lib/rack'
import type { Bottle, Location, WineWithBottles } from '../lib/types'
import { Bottle as BottleIcon, Button, Chip, cx, Label, Sheet } from './ui'

export interface PlaceChoice {
  wineId: string
  locId: string
  count: number
}

/**
 * "Place a wine": choose the wine first, then how many bottles (never more than it has without a slot)
 * and which rack. The rack page then suggests slots for them.
 */
export function PlaceWineSheet({
  open,
  initialWine,
  initialLoc,
  cellar,
  bottles,
  locations,
  onClose,
  onChoose,
}: {
  open: boolean
  initialWine?: string
  initialLoc?: string
  cellar: WineWithBottles[]
  bottles: Bottle[]
  locations: Location[]
  onClose: () => void
  onChoose: (c: PlaceChoice) => void
}) {
  const [wineId, setWineId] = useState(initialWine)
  const [q, setQ] = useState('')
  const racks = locations.filter(hasGrid)
  const room = (l: Location) => l.rows! * l.cols! - layout(l, bottles).slots.size
  // Default rack: one that already holds this wine, else the one on screen, else the roomiest — never a full one.
  const bestRack = (id?: string) => {
    const open = racks.filter((l) => room(l) > 0)
    return (
      open.find((l) => bottles.some((b) => b.wineId === id && b.location === l.name && b.slot)) ??
      open.find((l) => l.id === initialLoc) ??
      [...open].sort((a, b) => room(b) - room(a))[0] ??
      racks[0]
    )?.id
  }
  const [locId, setLocId] = useState(() => bestRack(initialWine))

  // Wines with at least one cellar bottle that has no slot on any grid.
  const todo = useMemo(
    () =>
      cellar
        .map((w) => ({ w, free: unslotted(w.id, bottles, locations) }))
        .filter((x) => x.free.length > 0)
        .sort((a, b) => `${a.w.producer} ${a.w.name}`.localeCompare(`${b.w.producer} ${b.w.name}`)),
    [cellar, bottles, locations],
  )
  const chosen = todo.find((x) => x.w.id === wineId)
  const [count, setCount] = useState(() => chosen?.free.length ?? 1)
  const needle = q.trim().toLowerCase()
  const list = todo.filter(({ w }) => !needle || `${w.producer} ${w.name} ${w.vintage ?? ''}`.toLowerCase().includes(needle))
  const loc = racks.find((l) => l.id === locId)

  return (
    <Sheet open={open} onClose={onClose} title={chosen ? t('Place {name}', { name: chosen.w.name }) : t('Place a wine')}>
      {!chosen ? (
        <>
          <p className="mb-3 text-sm text-cream-400">{t('Pick a wine. Only bottles that are in the cellar without a slot can be placed.')}</p>
          <div className="relative mb-3">
            <Search size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-cream-500" aria-hidden />
            <input className="field pl-9" aria-label={t('Search your bottles')} placeholder={t('Search your bottles')} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {list.length === 0 ? (
            <p className="py-6 text-center text-sm text-cream-400">{needle ? t('No match.') : t('Every cellar bottle already has a slot.')}</p>
          ) : (
            <div className="card divide-y divide-ink-700">
              {list.map(({ w, free }) => (
                <button
                  key={w.id}
                  onClick={() => {
                    setWineId(w.id)
                    setCount(free.length)
                    setLocId(bestRack(w.id))
                  }}
                  className="flex min-h-14 w-full items-center gap-3 p-3 text-left hover:bg-ink-800"
                >
                  <BottleIcon type={w.type} className="h-8 w-3.5 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs text-cream-400">{w.producer}</span>
                    <span className="line-clamp-2 text-sm text-cream-100">
                      {w.name} {w.vintage ?? 'NV'}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-medium text-wine-300">{t('{n} to place', { n: free.length })}</span>
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="space-y-5">
          <div>
            <Label hint={t('{n} without a slot', { n: chosen.free.length })}>{t('How many bottles')}</Label>
            <div className="flex items-center gap-3">
              <Button variant="secondary" aria-label={t('Fewer')} disabled={count <= 1} onClick={() => setCount(count - 1)}>
                <Minus size={16} />
              </Button>
              <span className="w-10 text-center text-2xl font-semibold text-cream-50" aria-live="polite">
                {count}
              </span>
              <Button variant="secondary" aria-label={t('More')} disabled={count >= chosen.free.length} onClick={() => setCount(count + 1)}>
                <Plus size={16} />
              </Button>
            </div>
          </div>
          <div>
            <Label>{t('Which rack')}</Label>
            <div className="flex flex-wrap gap-2">
              {racks.map((l) => (
                <Chip key={l.id} active={l.id === locId} onClick={() => setLocId(l.id)}>
                  {l.name} · {t('{n} free', { n: room(l) })}
                </Chip>
              ))}
            </div>
            {loc && room(loc) < count && <p className="mt-2 text-sm text-amber-200">{t('Only {n} free in {rack}: the rest stay off the grid for now.', { n: room(loc), rack: loc.name })}</p>}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setWineId(undefined)}>
              {t('Other wine')}
            </Button>
            <Button className={cx('flex-1')} disabled={!loc || room(loc) === 0} onClick={() => loc && onChoose({ wineId: chosen.w.id, locId: loc.id!, count: Math.min(count, room(loc)) })}>
              {t('Suggest slots')}
            </Button>
          </div>
          <p className="text-xs text-cream-500">{plural(chosen.free.length, '{n} bottle of this wine has no slot yet.', '{n} bottles of this wine have no slot yet.')}</p>
        </div>
      )}
    </Sheet>
  )
}

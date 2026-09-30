import { Grid3x3, MapPin, Move, Search, Wine as WineIcon, X } from 'lucide-react'
import { t } from '../lib/i18n'
import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Bottle as BottleIcon, Button, Chip, cx, Empty, Label, PageHeader, Sheet, StatusChip, TYPE_COLOR } from '../components/ui'
import { db } from '../lib/db'
import { useCellar, useLocations } from '../lib/hooks'
import { clearSlot, hasGrid, layout, MAX_COLS, MAX_ROWS, placeBottle, slotName } from '../lib/rack'
import { drinkStatus, STATUS_META } from '../lib/status'
import type { Bottle, Location, WineWithBottles } from '../lib/types'

/**
 * Rack map. Query params:
 *   loc=<location id>  which rack to show
 *   w=<wine id>        highlight every bottle of that wine
 *   b=<bottle id>      highlight one bottle (or, if it has no slot yet, start placing it)
 */
export default function RackPage() {
  const [sp, setSp] = useSearchParams()
  const locations = useLocations()
  const cellar = useCellar()
  const bottles = useLiveQuery(() => db.bottles.where('status').equals('cellar').toArray(), [])
  const [open, setOpen] = useState<{ slot: string; bottle?: Bottle } | null>(null)
  const [movingChoice, setMoving] = useState<Bottle | null>()
  const [resizing, setResizing] = useState(false)
  const [msg, setMsg] = useState('')

  const wines = useMemo(() => new Map((cellar ?? []).map((w) => [w.id, w])), [cellar])
  const focusBottle = sp.get('b') ? bottles?.find((b) => b.id === sp.get('b')) : undefined
  const focusWine = sp.get('w') ?? focusBottle?.wineId

  // Pick the rack: explicit, else where the focused bottle/wine lives, else the first with bottles.
  const loc = useMemo(() => {
    if (!locations?.length || !bottles) return undefined
    const byId = locations.find((l) => l.id === sp.get('loc'))
    if (byId) return byId
    const target = focusBottle ?? bottles.find((b) => b.wineId === focusWine && b.slot) ?? bottles.find((b) => b.wineId === focusWine)
    return locations.find((l) => l.name === target?.location) ?? locations.find((l) => hasGrid(l)) ?? locations[0]
  }, [locations, bottles, sp, focusBottle, focusWine])

  const grid = useMemo(() => (loc && bottles ? layout(loc, bottles) : undefined), [loc, bottles])

  // Arriving with a bottle that has no slot yet: start placing it (until the user picks something else).
  const focusUnplaced = focusBottle && grid?.unplaced.some((b) => b.id === focusBottle.id) ? focusBottle : null
  const moving = movingChoice === undefined ? focusUnplaced : movingChoice

  if (!locations || !bottles || !cellar) return null

  const flash = (m: string) => {
    setMsg(m)
    setTimeout(() => setMsg(''), 3000)
  }
  const selectLoc = (l: Location) => {
    setSp({ loc: l.id! }, { replace: true })
    setMoving(null)
    setResizing(false)
  }
  const place = async (b: Bottle, slot: string) => {
    try {
      await placeBottle(b.id!, loc!.name, slot)
      setMoving(null)
      setSp({ loc: loc!.id!, b: b.id! }, { replace: true })
      flash(t('Placed in {slot}', { slot }))
    } catch (e) {
      flash((e as Error).message)
    }
  }
  const tap = (slot: string, bottle?: Bottle) => {
    if (moving && !bottle) return place(moving, slot)
    if (moving && bottle?.id === moving.id) return setMoving(null)
    setOpen({ slot, bottle })
  }

  const header = <PageHeader title={t('Rack map')} subtitle={loc?.name} back />
  if (!locations.length)
    return (
      <div>
        {header}
        <Empty icon={<Grid3x3 size={32} />} title={t('No locations yet')}>
          Add one in{' '}
          <Link to="/more" className="text-wine-300 underline">
            {t('More → Cellar locations')}
          </Link>
          {t(', e.g. “Rack A”, then come back to lay out its grid.')}
        </Empty>
      </div>
    )

  const isHighlighted = (b: Bottle) => b.id === focusBottle?.id || (!focusBottle && b.wineId === focusWine)

  return (
    <div>
      {header}
      {msg && <div className="animate-rise fixed inset-x-4 top-4 z-50 mx-auto max-w-md rounded-xl bg-cream-100 px-4 py-3 text-sm text-ink-900 shadow-xl">{msg}</div>}

      {locations.length > 1 && (
        <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {locations.map((l) => (
            <Chip key={l.id} active={l.id === loc?.id} onClick={() => selectLoc(l)}>
              {l.name}
            </Chip>
          ))}
        </div>
      )}

      {loc && (!hasGrid(loc) || resizing) ? (
        <GridSetup key={loc.id} loc={loc} bottles={bottles} onDone={() => setResizing(false)} canCancel={hasGrid(loc)} />
      ) : (
        loc &&
        grid && (
          <>
            {moving && (
              <div className="card mb-3 flex items-center gap-3 p-3 ring-gold-400/50">
                <Move size={18} className="shrink-0 text-gold-400" />
                <p className="flex-1 text-sm text-cream-100">
                  {t('Tap an empty slot for')} <span className="font-semibold">{wineLabel(wines.get(moving.wineId))}</span>
                </p>
                <button aria-label={t('Cancel')} className="rounded-full p-1.5 text-cream-300 hover:bg-ink-700" onClick={() => setMoving(null)}>
                  <X size={18} />
                </button>
              </div>
            )}
            <RackGrid loc={loc} slots={grid.slots} wines={wines} moving={!!moving} isHighlighted={isHighlighted} onTap={tap} />
            <div className="mt-3 flex items-center justify-between text-xs text-cream-500">
              <span>
                {t('{a} of {b} slots filled', { a: grid.slots.size, b: loc.rows! * loc.cols! })}
              </span>
              <button className="text-wine-300" onClick={() => setResizing(true)}>
                {t('Change grid size')}
              </button>
            </div>
            <Legend />

            {grid.unplaced.length > 0 && (
              <section className="mt-6">
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-cream-400">{t('Not on the grid yet · {n}', { n: grid.unplaced.length })}</h2>
                <div className="card divide-y divide-ink-700">
                  {grid.unplaced.map((b) => {
                    const w = wines.get(b.wineId)
                    return (
                      <button key={b.id} onClick={() => setMoving(b)} className={cx('flex w-full items-center gap-3 p-3 text-left hover:bg-ink-800', moving?.id === b.id && 'bg-ink-800')}>
                        {w && <BottleIcon type={w.type} className="h-8 w-3.5" />}
                        <span className="min-w-0 flex-1 truncate text-sm text-cream-100">{wineLabel(w)}</span>
                        <span className="text-xs text-wine-300">{moving?.id === b.id ? t('Tap a slot') : t('Place')}</span>
                      </button>
                    )
                  })}
                </div>
              </section>
            )}
          </>
        )
      )}

      <SlotSheet
        open={open}
        loc={loc}
        wine={open?.bottle ? wines.get(open.bottle.wineId) : undefined}
        key={open?.slot}
        candidates={grid ? bottles.filter((b) => ![...grid.slots.values()].includes(b)) : []}
        wines={wines}
        onClose={() => setOpen(null)}
        onMove={(b) => {
          setOpen(null)
          setMoving(b)
        }}
        onPlace={(b, slot) => {
          setOpen(null)
          place(b, slot)
        }}
      />
    </div>
  )
}

function wineLabel(w?: WineWithBottles) {
  return w ? `${w.producer} ${w.name} ${w.vintage ?? 'NV'}` : 'Unknown wine'
}

function RackGrid({
  loc,
  slots,
  wines,
  moving,
  isHighlighted,
  onTap,
}: {
  loc: Location
  slots: Map<string, Bottle>
  wines: Map<string, WineWithBottles>
  moving: boolean
  isHighlighted: (b: Bottle) => boolean
  onTap: (slot: string, bottle?: Bottle) => void
}) {
  const rows = loc.rows!
  const cols = loc.cols!
  return (
    <div className="card overflow-x-auto p-3">
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `1.25rem repeat(${cols}, minmax(2rem, 1fr))` }}>
        <span />
        {Array.from({ length: cols }, (_, c) => (
          <span key={c} className="text-center text-[10px] font-medium text-cream-500">
            {c + 1}
          </span>
        ))}
        {Array.from({ length: rows }, (_, r) => (
          <Row key={r} r={r} cols={cols} slots={slots} wines={wines} moving={moving} isHighlighted={isHighlighted} onTap={onTap} />
        ))}
      </div>
    </div>
  )
}

function Row({ r, cols, slots, wines, moving, isHighlighted, onTap }: { r: number; cols: number } & Omit<Parameters<typeof RackGrid>[0], 'loc'>) {
  return (
    <>
      <span className="flex items-center text-[10px] font-medium text-cream-500">{String.fromCharCode(65 + r)}</span>
      {Array.from({ length: cols }, (_, c) => {
        const slot = slotName(r, c)
        const b = slots.get(slot)
        const w = b && wines.get(b.wineId)
        const hl = b && isHighlighted(b)
        const status = w && drinkStatus(w)
        return (
          <button
            key={slot}
            aria-label={b ? `${slot}: ${wineLabel(w)}` : `${slot}: empty`}
            onClick={() => onTap(slot, b)}
            className={cx(
              'relative flex aspect-square items-center justify-center rounded-full transition',
              b ? 'ring-1 ring-black/30' : cx('bg-ink-900 ring-1 ring-inset', moving ? 'ring-gold-400/60 hover:bg-ink-700' : 'ring-ink-700 hover:bg-ink-800'),
              hl && 'animate-pulse ring-2 ring-gold-400 ring-offset-2 ring-offset-ink-850',
            )}
            style={w ? { backgroundColor: TYPE_COLOR[w.type] } : undefined}
          >
            {w && <span className={cx('text-[9px] font-semibold', ['red', 'fortified'].includes(w.type) ? 'text-cream-50/90' : 'text-ink-900/80')}>{w.vintage ? `'${String(w.vintage).slice(2)}` : 'NV'}</span>}
            {status && <span className={cx('absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full ring-1 ring-ink-850', STATUS_META[status].dot)} />}
          </button>
        )
      })}
    </>
  )
}

function Legend() {
  return (
    <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-cream-500">
      {(['ready', 'soon', 'approaching', 'hold', 'past'] as const).map((s) => (
        <span key={s} className="inline-flex items-center gap-1">
          <span className={cx('h-2 w-2 rounded-full', STATUS_META[s].dot)} />
          {t(STATUS_META[s].label)}
        </span>
      ))}
    </p>
  )
}

function GridSetup({ loc, bottles, canCancel, onDone }: { loc: Location; bottles: Bottle[]; canCancel: boolean; onDone: () => void }) {
  const [rows, setRows] = useState(loc.rows ?? 4)
  const [cols, setCols] = useState(loc.cols ?? 6)
  const here = bottles.filter((b) => b.location === loc.name)
  const lost = layout(loc, bottles).slots.size - layout({ ...loc, rows, cols }, bottles).slots.size
  const stepper = (label: string, value: number, set: (n: number) => void, max: number) => (
    <label className="block">
      <Label>{label}</Label>
      <div className="flex items-center gap-3">
        <Button variant="secondary" onClick={() => set(Math.max(1, value - 1))}>
          −
        </Button>
        <span className="w-8 text-center text-xl font-semibold">{value}</span>
        <Button variant="secondary" onClick={() => set(Math.min(max, value + 1))}>
          +
        </Button>
      </div>
    </label>
  )
  return (
    <div className="card space-y-4 p-4">
      <div>
        <p className="font-display text-lg text-cream-50">{canCancel ? t('Grid size') : t('Lay out this rack')}</p>
        <p className="text-sm text-cream-400">
          How many shelves (rows) and bottles per shelf (columns)? {here.length} bottle{here.length === 1 ? ' is' : 's are'} in {loc.name}.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {stepper('Rows', rows, setRows, MAX_ROWS)}
        {stepper('Columns', cols, setCols, MAX_COLS)}
      </div>
      {lost > 0 && <p className="text-sm text-amber-200">{lost} placed bottle(s) would fall outside the grid and go back to &ldquo;not on the grid&rdquo;.</p>}
      <div className="flex gap-2">
        {canCancel && (
          <Button variant="secondary" className="flex-1" onClick={onDone}>
            {t('Cancel')}
          </Button>
        )}
        <Button
          className="flex-1"
          onClick={async () => {
            await db.locations.update(loc.id!, { rows, cols })
            onDone()
          }}
        >
          {t('Save')}
        </Button>
      </div>
    </div>
  )
}

function SlotSheet({
  open,
  loc,
  wine,
  candidates,
  wines,
  onClose,
  onMove,
  onPlace,
}: {
  open: { slot: string; bottle?: Bottle } | null
  loc?: Location
  wine?: WineWithBottles
  candidates: Bottle[]
  wines: Map<string, WineWithBottles>
  onClose: () => void
  onMove: (b: Bottle) => void
  onPlace: (b: Bottle, slot: string) => void
}) {
  const [q, setQ] = useState('')
  const nav = useNavigate()
  const b = open?.bottle
  if (b)
    return (
      <Sheet open onClose={onClose} title={t('Slot {slot}', { slot: open.slot })}>
        <div className="mb-5 flex gap-3">
          {wine && <BottleIcon type={wine.type} className="h-14 w-6 shrink-0" />}
          <div className="min-w-0">
            <p className="text-sm text-cream-400">{wine?.producer}</p>
            <p className="font-display text-lg text-cream-50">
              {wine?.name} {wine?.vintage ?? 'NV'}
            </p>
            {wine && <StatusChip status={drinkStatus(wine)} className="mt-1" />}
          </div>
        </div>
        <div className="space-y-2">
          {wine && (
            <Button className="w-full" onClick={() => nav(`/wine/${wine.id}/drink?bottle=${b.id}`)}>
              <WineIcon size={18} /> {t('Drink this bottle')}
            </Button>
          )}
          <div className="grid grid-cols-2 gap-2">
            {wine && (
              <Button variant="secondary" onClick={() => nav(`/wine/${wine.id}`)}>
                {t('Open wine')}
              </Button>
            )}
            <Button variant="secondary" onClick={() => onMove(b)}>
              <Move size={16} /> {t('Move')}
            </Button>
          </div>
          <button
            className="w-full py-2 text-sm text-cream-400"
            onClick={async () => {
              await clearSlot(b.id!)
              onClose()
            }}
          >
            Take off the grid (stays in {loc?.name})
          </button>
        </div>
      </Sheet>
    )

  // Empty slot: choose a bottle. Ones already in this rack come first.
  const needle = q.trim().toLowerCase()
  const list = candidates
    .map((c) => ({ b: c, w: wines.get(c.wineId) }))
    .filter(({ w }) => w && (!needle || wineLabel(w).toLowerCase().includes(needle)))
    .sort((x, y) => Number(y.b.location === loc?.name) - Number(x.b.location === loc?.name) || wineLabel(x.w).localeCompare(wineLabel(y.w)))
  return (
    <Sheet open={!!open} onClose={onClose} title={t('Put a bottle in {slot}', { slot: open?.slot ?? '' })}>
      <div className="relative mb-3">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-cream-500" />
        <input className="field pl-9" placeholder={t('Search your bottles')} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {list.length === 0 ? (
        <p className="py-6 text-center text-sm text-cream-400">{needle ? t('No match.') : t('Every cellar bottle already has a slot.')}</p>
      ) : (
        <div className="card divide-y divide-ink-700">
          {list.map(({ b: c, w }) => (
            <button key={c.id} onClick={() => onPlace(c, open!.slot)} className="flex w-full items-center gap-3 p-3 text-left hover:bg-ink-800">
              <BottleIcon type={w!.type} className="h-8 w-3.5" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-cream-100">{wineLabel(w)}</span>
                <span className="flex items-center gap-1 text-xs text-cream-500">
                  <MapPin size={11} />
                  {c.location ? `${c.location}${c.slot ? ` · ${c.slot}` : ''}` : 'No location'}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </Sheet>
  )
}

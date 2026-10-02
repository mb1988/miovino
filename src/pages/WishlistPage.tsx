import { useLiveQuery } from 'dexie-react-hooks'
import { t } from '../lib/i18n'
import { Check, ChevronDown, Heart, Plus, ShoppingBag, Trash2, Wine as WineIcon } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, cx, Empty, Label, PageHeader, Section, Sheet, Stars } from '../components/ui'
import { WhereToBuy } from '../components/WhereToBuy'
import { db } from '../lib/db'
import { useCellar } from '../lib/hooks'
import type { WishItem } from '../lib/types'
import { addWish, buyAgainSuggestions, wishFromWine } from '../lib/wishlist'

export default function WishlistPage() {
  const cellar = useCellar()
  const list = useLiveQuery(() => db.wishlist.toArray(), [])
  const nav = useNavigate()
  const [adding, setAdding] = useState(false)
  const [showDone, setShowDone] = useState(false)
  const [expanded, setExpanded] = useState<string>()
  if (!cellar || !list) return null

  const open = list.filter((i) => !i.done).sort((a, b) => b.createdAt - a.createdAt)
  const done = list.filter((i) => i.done).sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
  const suggestions = buyAgainSuggestions(cellar, list)

  /** "Bought it": tick it off and open the add form pre-filled. */
  const bought = async (i: WishItem) => {
    await db.wishlist.update(i.id!, { done: true })
    nav('/add/manual', { state: { draft: { producer: i.producer, name: i.name, vintage: i.vintage == null ? '' : String(i.vintage) } } })
  }

  return (
    <div>
      <PageHeader
        title={t('Wishlist')}
        subtitle={t('Wines to buy')}
        back
        right={
          <Button variant="secondary" onClick={() => setAdding(true)}>
            <Plus size={16} /> {t('Add')}
          </Button>
        }
      />

      {suggestions.length > 0 && (
        <Section title={t('You said you\'d buy again')}>
          <div className="card divide-y divide-ink-700">
            {suggestions.map((w) => (
              <div key={w.id} className="flex items-center gap-3 p-3.5">
                <Heart size={16} className="shrink-0 text-wine-300" />
                <Link to={`/wine/${w.id}`} className="min-w-0 flex-1">
                  <p className="truncate text-sm text-cream-50">
                    {w.producer} · {w.name} {w.vintage ?? 'NV'}
                  </p>
                  <p className="text-xs text-cream-400">
                    {w.inCellar} left in cellar {w.avgRating != null && <Stars value={w.avgRating} size={10} className="ml-1" />}
                  </p>
                </Link>
                <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => addWish(wishFromWine(w, 'Buy again'))}>
                  <Plus size={14} /> {t('List')}
                </Button>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title={t('To buy · {n}', { n: open.length })}>
        {open.length === 0 ? (
          <Empty icon={<ShoppingBag size={28} />} title={t('Nothing on the list')}>
            Mark a tasting &ldquo;Buy again: yes&rdquo;, or tap <b>{t('Add')}</b>.
          </Empty>
        ) : (
          <div className="card divide-y divide-ink-700">
            {open.map((i) => (
              <div key={i.id}>
                <div className="flex items-center gap-3 p-3.5">
                  <WineIcon size={16} className="shrink-0 text-cream-400" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-cream-50">
                      {i.producer} · {i.name} {i.vintage ?? ''}
                    </p>
                    {i.note && <p className="truncate text-xs text-cream-400">{i.note}</p>}
                    <button
                      aria-expanded={expanded === i.id}
                      aria-controls={`buy-${i.id}`}
                      onClick={() => setExpanded(expanded === i.id ? undefined : i.id)}
                      className="mt-0.5 flex min-h-6 items-center gap-0.5 text-xs text-wine-300"
                    >
                      {t('Where to buy')} <ChevronDown size={12} className={cx('transition-transform', expanded === i.id && 'rotate-180')} aria-hidden />
                    </button>
                  </div>
                  <button aria-label={t('Bought')} title={t('Bought — add to cellar')} className="rounded-full bg-emerald-500/15 p-2 text-emerald-300" onClick={() => bought(i)}>
                    <Check size={16} />
                  </button>
                  <button aria-label={t('Remove')} className="p-2 text-cream-500 hover:text-rose-300" onClick={() => db.wishlist.delete(i.id!)}>
                    <Trash2 size={16} />
                  </button>
                </div>
                {expanded === i.id && (
                  <div id={`buy-${i.id}`}>
                    <WhereToBuy item={i} cellar={cellar} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      {done.length > 0 && (
        <button className="mb-3 text-xs text-cream-400 underline" onClick={() => setShowDone(!showDone)}>
          {showDone ? 'Hide' : 'Show'} bought ({done.length})
        </button>
      )}
      {showDone && (
        <div className="card divide-y divide-ink-700 opacity-60">
          {done.map((i) => (
            <div key={i.id} className="flex items-center gap-3 p-3 text-sm text-cream-300">
              <Check size={14} />
              <span className="flex-1 truncate line-through">
                {i.producer} · {i.name}
              </span>
              <button className="text-xs underline" onClick={() => db.wishlist.update(i.id!, { done: false })}>
                {t('Undo')}
              </button>
            </div>
          ))}
        </div>
      )}

      <AddSheet open={adding} onClose={() => setAdding(false)} />
    </div>
  )
}

function AddSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [f, setF] = useState({ producer: '', name: '', vintage: '', note: '' })
  const save = async () => {
    if (!f.producer.trim() && !f.name.trim()) return
    await addWish({ producer: f.producer.trim(), name: f.name.trim(), vintage: f.vintage ? Number(f.vintage) || null : undefined, note: f.note.trim() || undefined })
    setF({ producer: '', name: '', vintage: '', note: '' })
    onClose()
  }
  return (
    <Sheet open={open} onClose={onClose} title={t('Add to wishlist')}>
      <div className="space-y-3">
        <label className="block">
          <Label>{t('Producer')}</Label>
          <input className="field" value={f.producer} onChange={(e) => setF({ ...f, producer: e.target.value })} />
        </label>
        <label className="block">
          <Label>{t('Wine')}</Label>
          <input className="field" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </label>
        <label className="block">
          <Label hint="optional">{t('Vintage')}</Label>
          <input className="field" inputMode="numeric" value={f.vintage} onChange={(e) => setF({ ...f, vintage: e.target.value })} />
        </label>
        <label className="block">
          <Label hint="optional">{t('Note')}</Label>
          <input className="field" placeholder={t('Where to buy, price seen, who recommended…')} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        </label>
        <Button className="w-full" onClick={save}>
          {t('Add')}
        </Button>
      </div>
    </Sheet>
  )
}

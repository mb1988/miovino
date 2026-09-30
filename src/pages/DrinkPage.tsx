import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Button, Chip, cx, Label, PageHeader, StarInput } from '../components/ui'
import { drinkBottle, today } from '../lib/db'
import { useWine } from '../lib/hooks'
import { classicPairing } from '../lib/pairing'
import { OCCASIONS, type BuyAgain } from '../lib/types'

export default function DrinkPage() {
  const id = Number(useParams().id)
  const [sp] = useSearchParams()
  const wine = useWine(id)
  const nav = useNavigate()
  const [rating, setRating] = useState<number>()
  const [date, setDate] = useState(today())
  const [occasion, setOccasion] = useState<string>()
  const [company, setCompany] = useState('')
  const [food, setFood] = useState('')
  const [notes, setNotes] = useState('')
  const [buyAgain, setBuyAgain] = useState<BuyAgain>()
  const [bottleId, setBottleId] = useState<number | undefined>(sp.get('bottle') ? Number(sp.get('bottle')) : undefined)

  if (!wine) return null
  const inCellar = wine.bottles.filter((b) => b.status === 'cellar')
  const locations = [...new Set(inCellar.map((b) => b.location ?? ''))]

  const save = async () => {
    await drinkBottle(
      id,
      {
        date,
        rating,
        occasion,
        company: company.trim() || undefined,
        food: food.trim() || undefined,
        notes: notes.trim() || undefined,
        buyAgain,
      },
      bottleId,
    )
    nav(`/wine/${id}`, { replace: true })
  }

  return (
    <div>
      <PageHeader title="Cheers! 🍷" subtitle={`${wine.producer} · ${wine.name} ${wine.vintage ?? 'NV'}`} back />

      <div className="space-y-6">
        {locations.length > 1 && (
          <div>
            <Label>Which bottle?</Label>
            <div className="flex flex-wrap gap-1.5">
              {inCellar.map((b, i) => (
                <Chip key={b.id} active={bottleId === b.id || (bottleId == null && i === 0)} onClick={() => setBottleId(b.id)}>
                  #{i + 1} {b.location || 'no location'}
                </Chip>
              ))}
            </div>
          </div>
        )}

        <div>
          <Label>Your rating</Label>
          <StarInput value={rating} onChange={setRating} />
        </div>

        <label className="block">
          <Label>When</Label>
          <input type="date" className="field" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>

        <div>
          <Label>Occasion</Label>
          <div className="flex flex-wrap gap-1.5">
            {OCCASIONS.map((o) => (
              <Chip key={o} active={occasion === o} onClick={() => setOccasion(occasion === o ? undefined : o)}>
                {o}
              </Chip>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <Label hint="optional">With</Label>
            <input className="field" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Who shared it" />
          </label>
          <label className="block">
            <Label hint="optional">Food</Label>
            <input className="field" value={food} onChange={(e) => setFood(e.target.value)} placeholder="What you ate" />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[...wine.external.map((e) => e.pairing).filter((p): p is string => !!p), ...(classicPairing(wine)?.dishes.slice(0, 3) ?? [])].map((d) => (
                <Chip key={d} active={food === d} onClick={() => setFood(food === d ? '' : d)}>
                  {d}
                </Chip>
              ))}
            </div>
          </label>
        </div>

        <label className="block">
          <Label>Tasting notes</Label>
          <textarea className="field" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opened up after 30 min. Black cherry, leather, cedar…" />
        </label>

        <div>
          <Label>Would you buy it again?</Label>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ['yes', '❤️', 'Yes'],
                ['maybe', '😐', 'Maybe'],
                ['no', '❌', 'No'],
              ] as const
            ).map(([v, e, l]) => (
              <button
                key={v}
                type="button"
                onClick={() => setBuyAgain(buyAgain === v ? undefined : v)}
                className={cx('rounded-xl py-3 text-sm ring-1 transition', buyAgain === v ? 'bg-cream-100 text-ink-900 ring-cream-100' : 'bg-ink-850 text-cream-200 ring-ink-600')}
              >
                <span className="block text-xl">{e}</span>
                {l}
              </button>
            ))}
          </div>
        </div>

        <div className="pb-[max(env(safe-area-inset-bottom),0.75rem)] sticky bottom-0 -mx-4 bg-gradient-to-t from-ink-900 via-ink-900 to-transparent px-4 pt-6">
          <Button className="w-full py-3.5 text-base" onClick={save} disabled={inCellar.length === 0}>
            Save & mark bottle as drunk
          </Button>
          <p className="mt-2 text-center text-xs text-cream-500">{inCellar.length - 1} bottle(s) will remain</p>
        </div>
      </div>
    </div>
  )
}

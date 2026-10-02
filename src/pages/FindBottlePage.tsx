import { Check, Plus, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Label, PageHeader } from '../components/ui'
import { WhereToBuy } from '../components/WhereToBuy'
import { useCellar } from '../lib/hooks'
import { t } from '../lib/i18n'
import { sameWineKey } from '../lib/importer'
import type { PriceHintCache } from '../lib/types'
import { addWish } from '../lib/wishlist'

/**
 * Find a bottle: any wine, owned or not — where to buy it, live UK prices and the AI's typical price.
 * Reached from the wishlist and from More. Saving puts it on the wishlist (with the price hint).
 */
export default function FindBottlePage() {
  const cellar = useCellar()
  const [producer, setProducer] = useState('')
  const [name, setName] = useState('')
  const [vintage, setVintage] = useState('')
  const [shown, setShown] = useState<{ producer: string; name: string; vintage: number | null }>()
  const [hint, setHint] = useState<PriceHintCache>()
  const [saved, setSaved] = useState(false)

  // If you already own it (any vintage), say so and link to it.
  const owned = useMemo(() => {
    if (!shown || !cellar) return undefined
    const key = sameWineKey({ ...shown, vintage: null })
    return cellar.find((w) => sameWineKey({ ...w, vintage: null }) === key)
  }, [shown, cellar])

  const find = (e: React.FormEvent) => {
    e.preventDefault()
    const v = Number(vintage)
    setShown({ producer: producer.trim(), name: name.trim(), vintage: Number.isInteger(v) && v > 1900 ? v : null })
    setHint(undefined)
    setSaved(false)
  }

  if (!cellar) return null
  return (
    <div>
      <PageHeader title={t('Find a bottle')} subtitle={t('Where to buy any wine, and at what price')} back />
      <form onSubmit={find} className="card mb-4 space-y-3 p-4">
        <label className="block">
          <Label>{t('Producer')}</Label>
          <input className="field" value={producer} onChange={(e) => setProducer(e.target.value)} placeholder={t('e.g. Giacomo Fenocchio')} autoComplete="off" />
        </label>
        <label className="block">
          <Label>{t('Wine')}</Label>
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('e.g. Barolo Villero')} autoComplete="off" />
        </label>
        <label className="block">
          <Label hint={t('optional')}>{t('Vintage')}</Label>
          <input className="field" inputMode="numeric" value={vintage} onChange={(e) => setVintage(e.target.value)} placeholder="2019" />
        </label>
        <Button type="submit" className="w-full" disabled={!producer.trim() && !name.trim()}>
          <Search size={16} aria-hidden /> {t('Find where to buy')}
        </Button>
      </form>

      {shown && (
        <section aria-label={t('Where to buy')} className="card">
          <div className="flex items-start gap-3 p-3.5">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-cream-50">
                {[shown.producer, shown.name, shown.vintage].filter(Boolean).join(' · ')}
              </p>
              {owned && (
                <Link to={`/wine/${owned.id}`} className="text-xs text-wine-300 underline">
                  {t('In your cellar: {n} bottles', { n: owned.inCellar })}
                </Link>
              )}
            </div>
            <Button
              variant="secondary"
              className="shrink-0 px-3 py-1.5 text-xs"
              disabled={saved}
              onClick={async () => {
                await addWish({ ...shown, wineId: owned?.id, priceHint: hint })
                setSaved(true)
              }}
            >
              {saved ? <Check size={14} aria-hidden /> : <Plus size={14} aria-hidden />} {saved ? t('On the wishlist') : t('Add to wishlist')}
            </Button>
          </div>
          <WhereToBuy item={{ ...shown, wineId: owned?.id, priceHint: hint }} cellar={cellar} saveHint={setHint} />
        </section>
      )}
    </div>
  )
}

import { Warehouse } from 'lucide-react'
import { t } from '../lib/i18n'
import { Chip } from './ui'

/** "All cellars · Home · Country house" — only shown when there is more than one cellar. */
export function CellarSwitcher({ names, active, onChange, className }: { names: string[]; active: string; onChange: (name: string) => void; className?: string }) {
  if (names.length < 2) return null
  return (
    <div role="group" aria-label={t('Cellar')} className={`-mx-4 flex items-center gap-1.5 overflow-x-auto px-4 pb-1 no-scrollbar ${className ?? ''}`}>
      <Warehouse size={16} className="shrink-0 text-cream-400" aria-hidden />
      <Chip active={!active} onClick={() => onChange('')}>
        {t('All cellars')}
      </Chip>
      {names.map((n) => (
        <Chip key={n} active={active === n} onClick={() => onChange(n)}>
          {n}
        </Chip>
      ))}
    </div>
  )
}

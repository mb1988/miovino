import { cx } from './ui'
import { t } from '../lib/i18n'
import type { PriceVerdict } from '../shared/prices'

const STYLE: Record<PriceVerdict, string> = {
  steal: 'bg-emerald-400/15 text-emerald-200 ring-emerald-400/30',
  fair: 'bg-sky-400/15 text-sky-200 ring-sky-400/30',
  pricey: 'bg-amber-400/15 text-amber-200 ring-amber-400/30',
  ripoff: 'bg-rose-400/15 text-rose-200 ring-rose-400/30',
}
const LABEL: Record<PriceVerdict, string> = { steal: 'Steal', fair: 'Fair price', pricey: 'Pricey', ripoff: 'Rip-off' }

export function VerdictBadge({ verdict }: { verdict: PriceVerdict }) {
  return <span className={cx('rounded-full px-2 py-0.5 text-[11px] font-medium ring-1', STYLE[verdict])}>{t(LABEL[verdict])}</span>
}

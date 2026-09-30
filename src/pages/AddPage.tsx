import { Camera, ChevronRight, FileSpreadsheet, PenLine, ScanBarcode } from 'lucide-react'
import { t } from '../lib/i18n'
import { Link } from 'react-router-dom'
import { PageHeader } from '../components/ui'

export default function AddPage() {
  const opt = (to: string, Icon: typeof Camera, title: string, desc: string, primary?: boolean) => (
    <Link to={to} className={`card flex items-center gap-4 p-5 transition hover:ring-ink-600 ${primary ? 'ring-2 ring-wine-600' : ''}`}>
      <span className={`rounded-xl p-3 ${primary ? 'bg-wine-600 text-cream-50' : 'bg-ink-700 text-cream-200'}`}>
        <Icon />
      </span>
      <span className="flex-1">
        <span className="block font-semibold text-cream-50">{t(title)}</span>
        <span className="text-sm text-cream-400">{t(desc)}</span>
      </span>
      <ChevronRight className="text-cream-500" />
    </Link>
  )
  return (
    <div>
      <PageHeader title={t('Add wine')} back />
      <div className="grid gap-3">
        {opt('/add/scan', Camera, 'Scan label', 'Photo → the app reads producer, vintage, region, grapes and drinking window', true)}
        {opt('/add/barcode', ScanBarcode, 'Scan barcode', 'A bottle you’ve had before: +1 in one tap')}
        {opt('/add/manual', PenLine, 'Add manually', 'Type it in — auto-fills region and grapes from the appellation')}
        {opt('/import', FileSpreadsheet, 'Import spreadsheet', 'Excel or CSV, columns mapped automatically')}
      </div>
    </div>
  )
}

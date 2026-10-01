import { BarChart3, CalendarRange, ChevronRight, Dna, Grid3x3, ShoppingBag, Download, FileJson, FileSpreadsheet, GripVertical, MapPin, Trash2, Upload } from 'lucide-react'
import { LANGS, locale, setLang, t, useLang } from '../lib/i18n'
import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Chip, cx, Label, PageHeader, Section } from '../components/ui'
import { exportCsv, exportJson, exportXlsx, restoreBackup } from '../lib/backup'
import { db, deleteAllData, ensureLocation } from '../lib/db'
import { useLocations } from '../lib/hooks'
import { saveSettings, useSettings } from '../lib/settings'
import { syncNow, useSync } from '../lib/sync'
import { DevicesSection } from '../components/DevicesSection'
import { updatePushLanguage } from '../lib/push'
import { RemindersSection } from '../components/RemindersSection'

export default function MorePage() {
  const s = useSettings()
  const lang = useLang()
  const sync = useSync()
  const locations = useLocations()
  const [newLoc, setNewLoc] = useState('')
  const [msg, setMsg] = useState('')
  const restoreRef = useRef<HTMLInputElement>(null)

  const flash = (m: string) => {
    setMsg(m)
    setTimeout(() => setMsg(''), 3500)
  }

  const renameLocation = async (id: string, oldName: string) => {
    const name = prompt('Rename location', oldName)?.trim()
    if (!name || name === oldName) return
    await db.transaction('rw', db.locations, db.bottles, async () => {
      await db.locations.update(id, { name })
      await db.bottles.where('location').equals(oldName).modify({ location: name })
    })
  }

  return (
    <div>
      <PageHeader title={t('More')} />
      {msg && <div className="animate-rise fixed inset-x-4 top-4 z-50 mx-auto max-w-md rounded-xl bg-cream-100 px-4 py-3 text-sm text-ink-900 shadow-xl">{msg}</div>}

      <Link to="/taste" className="card mb-6 flex items-center gap-4 p-4 hover:ring-ink-600">
        <span className="rounded-xl bg-wine-600/20 p-2.5 text-wine-300">
          <Dna />
        </span>
        <span className="flex-1">
          <span className="block font-semibold text-cream-50">{t('Your Wine DNA')}</span>
          <span className="text-sm text-cream-400">{t('Styles, grapes, regions and what you loved')}</span>
        </span>
        <ChevronRight className="text-cream-500" />
      </Link>

      <Section title={t('Sync')}>
        <div className="card flex items-center gap-3 p-4">
          <span className={cx('h-2.5 w-2.5 shrink-0 rounded-full', !sync.available ? 'bg-stone-500' : sync.status === 'error' || sync.status === 'signed-out' ? 'bg-rose-500' : sync.status === 'syncing' ? 'animate-pulse bg-amber-400' : 'bg-emerald-400')} />
          <div className="min-w-0 flex-1 text-sm">
            <p className="text-cream-50">
              {!sync.available
                ? t('This device only (no server)')
                : sync.status === 'syncing'
                  ? t('Syncing…')
                  : sync.status === 'offline'
                    ? t('Offline — changes will sync later')
                    : sync.status === 'signed-out'
                      ? t('Signed out')
                      : sync.status === 'error'
                        ? t('Sync problem')
                        : t('Synced to the cloud')}
            </p>
            <p className="truncate text-xs text-cream-400">{sync.error ?? (sync.lastSync ? t('Last sync {when}', { when: new Date(sync.lastSync).toLocaleString(locale()) }) : sync.available ? t('Not synced yet') : t('Data lives only in this browser'))}</p>
          </div>
          {sync.status === 'signed-out' ? (
            <Button variant="secondary" onClick={() => location.reload()}>
              {t('Sign in')}
            </Button>
          ) : (
            sync.available && (
              <Button variant="secondary" disabled={sync.status === 'syncing'} onClick={() => syncNow()}>
                {t('Sync now')}
              </Button>
            )
          )}
        </div>
      </Section>

      <Link to="/wishlist" className="card mb-6 flex items-center gap-4 p-4 hover:ring-ink-600">
        <span className="rounded-xl bg-ink-700 p-2.5 text-cream-200">
          <ShoppingBag />
        </span>
        <span className="flex-1">
          <span className="block font-semibold text-cream-50">{t('Wishlist')}</span>
          <span className="text-sm text-cream-400">{t('Wines to buy, and ones you said you’d buy again')}</span>
        </span>
        <ChevronRight className="text-cream-500" />
      </Link>

      <Link to="/stats" className="card mb-6 flex items-center gap-4 p-4 hover:ring-ink-600">
        <span className="rounded-xl bg-ink-700 p-2.5 text-cream-200">
          <BarChart3 />
        </span>
        <span className="flex-1">
          <span className="block font-semibold text-cream-50">{t('Cellar over time')}</span>
          <span className="text-sm text-cream-400">{t('Spending and bottles, year by year')}</span>
        </span>
        <ChevronRight className="text-cream-500" />
      </Link>

      <Link to="/windows" className="card mb-6 flex items-center gap-4 p-4 hover:ring-ink-600">
        <span className="rounded-xl bg-ink-700 p-2.5 text-cream-200">
          <CalendarRange />
        </span>
        <span className="flex-1">
          <span className="block font-semibold text-cream-50">{t('Drinking windows')}</span>
          <span className="text-sm text-cream-400">{t('Suggestions for wines without one')}</span>
        </span>
        <ChevronRight className="text-cream-500" />
      </Link>

      <Link to="/rack" className="card mb-6 flex items-center gap-4 p-4 hover:ring-ink-600">
        <span className="rounded-xl bg-ink-700 p-2.5 text-cream-200">
          <Grid3x3 />
        </span>
        <span className="flex-1">
          <span className="block font-semibold text-cream-50">{t('Rack map')}</span>
          <span className="text-sm text-cream-400">{t('See which bottle sits in which slot')}</span>
        </span>
        <ChevronRight className="text-cream-500" />
      </Link>

      {sync.available && sync.authenticated && <RemindersSection />}

      {sync.available && sync.authenticated && <DevicesSection />}

      <Section title={t('Cellar locations')}>
        <div className="card divide-y divide-ink-700">
          {locations?.map((l) => (
            <div key={l.id} className="flex items-center gap-3 px-4 py-2.5">
              <GripVertical size={14} className="text-ink-600" />
              <button className="flex-1 text-left text-sm text-cream-100" onClick={() => renameLocation(l.id!, l.name)}>
                <MapPin size={14} className="mr-1.5 inline text-cream-400" />
                {l.name}
                {l.rows && l.cols ? <span className="ml-1.5 text-xs text-cream-500">{l.rows}×{l.cols}</span> : null}
              </button>
              <Link to={`/rack?loc=${l.id}`} aria-label={`Rack map of ${l.name}`} className="text-cream-500 hover:text-cream-200">
                <Grid3x3 size={16} />
              </Link>
              <button
                aria-label={`Delete ${l.name}`}
                className="text-cream-500 hover:text-rose-300"
                onClick={async () => {
                  const used = await db.bottles.where('location').equals(l.name).count()
                  if (used && !confirm(`${used} bottle(s) are in "${l.name}". Remove the location anyway? (Bottles keep the text.)`)) return
                  await db.locations.delete(l.id!)
                }}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          <form
            className="flex gap-2 p-3"
            onSubmit={async (e) => {
              e.preventDefault()
              await ensureLocation(newLoc)
              setNewLoc('')
            }}
          >
            <input className="field py-2" placeholder={t('Add e.g. Rack A / Shelf 1, Wine fridge / Top')} value={newLoc} onChange={(e) => setNewLoc(e.target.value)} />
            <Button type="submit" variant="secondary" disabled={!newLoc.trim()}>
              {t('Add')}
            </Button>
          </form>
        </div>
        <p className="mt-2 text-xs text-cream-500">{t('Tap a location to rename it — bottles move with it.')}</p>
      </Section>

      <Section title={t('Import & export')}>
        <div className="card divide-y divide-ink-700">
          <Row icon={<Upload size={18} />} title={t('Import spreadsheet')} desc={t('Excel / CSV')} to="/import" />
          <Row icon={<FileSpreadsheet size={18} />} title={t('Export to Excel')} desc={t('Cellar + tastings sheets')} onClick={() => exportXlsx().then(() => flash('Excel file downloaded'))} />
          <Row icon={<Download size={18} />} title={t('Export CSV')} desc={t('One row per wine')} onClick={() => exportCsv().then(() => flash('CSV downloaded'))} />
          <Row icon={<FileJson size={18} />} title={t('Full backup (JSON)')} desc={t('Everything incl. photos — restorable')} onClick={() => exportJson().then(() => flash('Backup downloaded'))} />
          <Row icon={<Upload size={18} />} title={t('Restore backup')} desc={t('Replaces all current data')} onClick={() => restoreRef.current?.click()} />
        </div>
        <input
          ref={restoreRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (!f) return
            if (!confirm('Restore this backup? Current data will be replaced.')) return
            try {
              await restoreBackup(JSON.parse(await f.text()), 'replace')
              flash('Backup restored')
            } catch (err) {
              flash(`Restore failed: ${(err as Error).message}`)
            }
          }}
        />
        <p className="mt-2 text-xs text-cream-500">
          {sync.available ? t('Your cellar is synced to the cloud database (with 7-day point-in-time restore). A JSON backup is still a good portable copy.') : t('Data lives only in this browser. Export a backup now and then.')}
        </p>
      </Section>

      <Section title={t('Settings')}>
        <div className="card space-y-4 p-4">
          <div>
            <Label>{t('Language')}</Label>
            <div className="flex gap-1.5">
              {LANGS.map((l) => (
                <Chip key={l.id} active={lang === l.id} onClick={() => (setLang(l.id), void updatePushLanguage())}>
                  {l.label}
                </Chip>
              ))}
            </div>
          </div>
          <label className="block">
            <Label>{t('Cellar name')}</Label>
            <input className="field" value={s.cellarName} onChange={(e) => saveSettings({ cellarName: e.target.value })} />
          </label>
          <label className="block">
            <Label>{t('Currency')}</Label>
            <select className="field" value={s.currency} onChange={(e) => saveSettings({ currency: e.target.value })}>
              {['GBP', 'EUR', 'USD', 'CHF'].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
        </div>
      </Section>

      <Section title={t('AI features')} className="scroll-mt-20">
        <div id="ai" className="card space-y-3 p-4 text-sm">
          {sync.scan ? (
            <p className="rounded-lg bg-emerald-500/10 p-2.5 text-emerald-200 ring-1 ring-emerald-500/30">{t('On — label scan, Ask my cellar, wine lists and window suggestions use {provider}.', { provider: sync.ai ?? 'AI' })}</p>
          ) : (
            <p className="rounded-lg bg-ink-800 p-2.5 text-cream-300 ring-1 ring-ink-600">{t('Off — the server has no AI key yet. Everything else works.')}</p>
          )}
          <p className="text-xs text-cream-400">
            {t('AI runs on your MioVino server, so no key is ever stored on this phone. Free options: a Google Gemini key from aistudio.google.com, or an OpenRouter key from openrouter.ai. Add it with:')}
          </p>
          <code className="block overflow-x-auto rounded-lg bg-ink-950 p-2.5 text-xs whitespace-nowrap text-cream-200">npx wrangler secret put GEMINI_API_KEY</code>
          <p className="text-xs text-cream-500">{t('On the free Gemini tier Google may use what you send to improve its models; photos of labels and wine lists are low-risk, but keep that in mind.')}</p>
        </div>
      </Section>

      <Section title={t('Danger zone')}>
        <Button
          variant="danger"
          className="w-full"
          onClick={async () => {
            if (!confirm('Delete ALL wines, bottles, tastings and locations from this device?')) return
            if (!confirm('Really? Export a backup first if unsure.')) return
            await deleteAllData()
            flash('All data deleted')
          }}
        >
          <Trash2 size={16} /> {t('Delete all data')}
        </Button>
      </Section>
      <p className="pb-4 text-center text-xs text-cream-500">{t('MioVino · v0.1')}</p>
    </div>
  )
}

function Row({ icon, title, desc, to, onClick }: { icon: React.ReactNode; title: string; desc: string; to?: string; onClick?: () => void }) {
  const inner = (
    <>
      <span className="text-cream-300">{icon}</span>
      <span className="flex-1 text-left">
        <span className="block text-sm font-medium text-cream-50">{title}</span>
        <span className="text-xs text-cream-400">{desc}</span>
      </span>
      <ChevronRight size={16} className="text-cream-500" />
    </>
  )
  const cls = 'flex w-full items-center gap-3 px-4 py-3 hover:bg-ink-800'
  return to ? (
    <Link to={to} className={cls}>
      {inner}
    </Link>
  ) : (
    <button className={cls} onClick={onClick}>
      {inner}
    </button>
  )
}

import { ChevronRight, Dna, ShoppingBag, Download, Eye, EyeOff, FileJson, FileSpreadsheet, GripVertical, MapPin, Trash2, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, cx, Label, PageHeader, Section } from '../components/ui'
import { exportCsv, exportJson, exportXlsx, restoreBackup } from '../lib/backup'
import { db, deleteAllData, ensureLocation } from '../lib/db'
import { useLocations } from '../lib/hooks'
import { saveSettings, useSettings } from '../lib/settings'
import { syncNow, useSync } from '../lib/sync'
import { DevicesSection } from '../components/DevicesSection'

export default function MorePage() {
  const s = useSettings()
  const sync = useSync()
  const locations = useLocations()
  const [showKey, setShowKey] = useState(false)
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
      <PageHeader title="More" />
      {msg && <div className="animate-rise fixed inset-x-4 top-4 z-50 mx-auto max-w-md rounded-xl bg-cream-100 px-4 py-3 text-sm text-ink-900 shadow-xl">{msg}</div>}

      <Link to="/taste" className="card mb-6 flex items-center gap-4 p-4 hover:ring-ink-600">
        <span className="rounded-xl bg-wine-600/20 p-2.5 text-wine-300">
          <Dna />
        </span>
        <span className="flex-1">
          <span className="block font-semibold text-cream-50">Your Wine DNA</span>
          <span className="text-sm text-cream-400">Styles, grapes, regions and what you loved</span>
        </span>
        <ChevronRight className="text-cream-500" />
      </Link>

      <Section title="Sync">
        <div className="card flex items-center gap-3 p-4">
          <span className={cx('h-2.5 w-2.5 shrink-0 rounded-full', !sync.available ? 'bg-stone-500' : sync.status === 'error' || sync.status === 'signed-out' ? 'bg-rose-500' : sync.status === 'syncing' ? 'animate-pulse bg-amber-400' : 'bg-emerald-400')} />
          <div className="min-w-0 flex-1 text-sm">
            <p className="text-cream-50">
              {!sync.available
                ? 'This device only (no server)'
                : sync.status === 'syncing'
                  ? 'Syncing…'
                  : sync.status === 'offline'
                    ? 'Offline — changes will sync later'
                    : sync.status === 'signed-out'
                      ? 'Signed out'
                      : sync.status === 'error'
                        ? 'Sync problem'
                        : 'Synced to the cloud'}
            </p>
            <p className="truncate text-xs text-cream-400">{sync.error ?? (sync.lastSync ? `Last sync ${new Date(sync.lastSync).toLocaleString()}` : sync.available ? 'Not synced yet' : 'Data lives only in this browser')}</p>
          </div>
          {sync.status === 'signed-out' ? (
            <Button variant="secondary" onClick={() => location.reload()}>
              Sign in
            </Button>
          ) : (
            sync.available && (
              <Button variant="secondary" disabled={sync.status === 'syncing'} onClick={() => syncNow()}>
                Sync now
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
          <span className="block font-semibold text-cream-50">Wishlist</span>
          <span className="text-sm text-cream-400">Wines to buy, and ones you said you&rsquo;d buy again</span>
        </span>
        <ChevronRight className="text-cream-500" />
      </Link>

      {sync.available && sync.authenticated && <DevicesSection />}

      <Section title="Cellar locations">
        <div className="card divide-y divide-ink-700">
          {locations?.map((l) => (
            <div key={l.id} className="flex items-center gap-3 px-4 py-2.5">
              <GripVertical size={14} className="text-ink-600" />
              <button className="flex-1 text-left text-sm text-cream-100" onClick={() => renameLocation(l.id!, l.name)}>
                <MapPin size={14} className="mr-1.5 inline text-cream-400" />
                {l.name}
              </button>
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
            <input className="field py-2" placeholder="Add e.g. Rack A / Shelf 1, Wine fridge / Top" value={newLoc} onChange={(e) => setNewLoc(e.target.value)} />
            <Button type="submit" variant="secondary" disabled={!newLoc.trim()}>
              Add
            </Button>
          </form>
        </div>
        <p className="mt-2 text-xs text-cream-500">Tap a location to rename it — bottles move with it.</p>
      </Section>

      <Section title="Import & export">
        <div className="card divide-y divide-ink-700">
          <Row icon={<Upload size={18} />} title="Import spreadsheet" desc="Excel / CSV" to="/import" />
          <Row icon={<FileSpreadsheet size={18} />} title="Export to Excel" desc="Cellar + tastings sheets" onClick={() => exportXlsx().then(() => flash('Excel file downloaded'))} />
          <Row icon={<Download size={18} />} title="Export CSV" desc="One row per wine" onClick={() => exportCsv().then(() => flash('CSV downloaded'))} />
          <Row icon={<FileJson size={18} />} title="Full backup (JSON)" desc="Everything incl. photos — restorable" onClick={() => exportJson().then(() => flash('Backup downloaded'))} />
          <Row icon={<Upload size={18} />} title="Restore backup" desc="Replaces all current data" onClick={() => restoreRef.current?.click()} />
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
          {sync.available ? 'Your cellar is synced to the cloud database (with 7-day point-in-time restore). A JSON backup is still a good portable copy.' : 'Data lives only in this browser. Export a backup now and then.'}
        </p>
      </Section>

      <Section title="Settings">
        <div className="card space-y-4 p-4">
          <label className="block">
            <Label>Cellar name</Label>
            <input className="field" value={s.cellarName} onChange={(e) => saveSettings({ cellarName: e.target.value })} />
          </label>
          <label className="block">
            <Label>Currency</Label>
            <select className="field" value={s.currency} onChange={(e) => saveSettings({ currency: e.target.value })}>
              {['GBP', 'EUR', 'USD', 'CHF'].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
        </div>
      </Section>

      <Section title="AI label scanner" className="scroll-mt-20">
        <div id="ai" className="card space-y-4 p-4">
          <label className="block">
            {sync.scan && <p className="mb-3 rounded-lg bg-emerald-500/10 p-2.5 text-xs text-emerald-200 ring-1 ring-emerald-500/30">Scanning runs on your MioVino server — no key needed on this device.</p>}
            <Label hint="optional · stored on this device only">Anthropic API key</Label>
            <div className="flex gap-2">
              <input className="field font-mono text-xs" type={showKey ? 'text' : 'password'} value={s.apiKey} onChange={(e) => saveSettings({ apiKey: e.target.value.trim() })} placeholder="sk-ant-…" autoComplete="off" />
              <Button variant="secondary" aria-label={showKey ? 'Hide key' : 'Show key'} onClick={() => setShowKey(!showKey)}>
                {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </Button>
            </div>
          </label>
          <label className="block">
            <Label>Model</Label>
            <select className="field" value={s.model} onChange={(e) => saveSettings({ model: e.target.value })}>
              <option value="claude-opus-5-5">Claude Opus 5.5 (best)</option>
              <option value="claude-sonnet-5-5">Claude Sonnet 5.5 (cheaper)</option>
              <option value="claude-haiku-4-5">Claude Haiku 4.5 (cheapest)</option>
            </select>
          </label>
          <p className="text-xs text-cream-500">
            Label photos are sent to the Anthropic API to be read. Get a key at console.anthropic.com. A scan costs roughly a cent.
          </p>
        </div>
      </Section>

      <Section title="Danger zone">
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
          <Trash2 size={16} /> Delete all data
        </Button>
      </Section>
      <p className="pb-4 text-center text-xs text-cream-500">MioVino · v0.1</p>
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

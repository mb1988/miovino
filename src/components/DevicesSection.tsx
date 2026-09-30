import { Copy, LogOut, Plus, Share2, Smartphone, Trash2 } from 'lucide-react'
import { t } from '../lib/i18n'
import { useEffect, useState } from 'react'
import { createInviteLink, listDevices, removeDevice, signOut, type Device } from '../lib/auth'
import { Button, Section } from './ui'

/** Signed-in devices, a one-time link to add another device, and sign out. */
export function DevicesSection() {
  const [devices, setDevices] = useState<Device[]>()
  const [link, setLink] = useState('')
  const [qr, setQr] = useState('')
  const [msg, setMsg] = useState('')
  const refresh = () => listDevices().then(setDevices)
  useEffect(() => {
    void refresh()
  }, [])

  const newLink = async () => {
    setMsg('')
    try {
      const url = await createInviteLink()
      setLink(url)
      const QR = await import('qrcode')
      setQr(await QR.toDataURL(url, { margin: 1, width: 240, color: { dark: '#160c11', light: '#fbf6ee' } }))
    } catch (e) {
      setMsg((e as Error).message)
    }
  }

  return (
    <Section title={t('Devices')}>
      <div className="card divide-y divide-ink-700">
        {devices?.map((d) => (
          <div key={d.id} className="flex items-center gap-3 px-4 py-3">
            <Smartphone size={16} className="text-cream-400" />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-cream-50">{d.device_name}</p>
              <p className="text-xs text-cream-400">Last used {d.last_used_at ? new Date(d.last_used_at).toLocaleDateString() : 'never'}</p>
            </div>
            {devices.length > 1 && (
              <button
                aria-label={`Remove ${d.device_name}`}
                className="text-cream-500 hover:text-rose-300"
                onClick={async () => {
                  if (!confirm(`Remove ${d.device_name}? It will need a new setup link to sign in again.`)) return
                  try {
                    await removeDevice(d.id)
                    await refresh()
                  } catch (e) {
                    setMsg((e as Error).message)
                  }
                }}
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
        ))}
        <div className="space-y-3 p-4">
          {link ? (
            <>
              <p className="text-xs text-cream-400">{t('Scan with the new device\'s camera, or send it the link. Valid 24 hours, works once.')}</p>
              {qr && <img src={qr} alt="Setup QR code" className="mx-auto h-48 w-48 rounded-xl" />}
              <input readOnly className="field font-mono text-xs" value={link} onFocus={(e) => e.target.select()} />
              <div className="flex gap-2">
                <Button variant="secondary" className="flex-1" onClick={() => navigator.clipboard.writeText(link).then(() => setMsg('Link copied'))}>
                  <Copy size={16} /> {t('Copy')}
                </Button>
                {'share' in navigator && (
                  <Button variant="secondary" className="flex-1" onClick={() => navigator.share({ title: 'MioVino setup link', url: link }).catch(() => {})}>
                    <Share2 size={16} /> {t('Share')}
                  </Button>
                )}
              </div>
            </>
          ) : (
            <Button variant="secondary" className="w-full" onClick={newLink}>
              <Plus size={16} /> {t('Add a device')}
            </Button>
          )}
          <Button variant="ghost" className="w-full" onClick={() => signOut()}>
            <LogOut size={16} /> {t('Sign out on this device')}
          </Button>
          {msg && <p className="text-xs text-cream-300">{msg}</p>}
        </div>
      </div>
    </Section>
  )
}

import { Fingerprint, Loader2, ShieldCheck, Smartphone } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Label } from '../components/ui'
import { guessDeviceName, registerDevice, signIn } from '../lib/auth'
import { useSync } from '../lib/sync'

/** Shown instead of the app when the server is reachable and this browser isn't signed in, and at /setup. */
export default function SignInPage() {
  const [params] = useSearchParams()
  const invite = params.get('invite')
  const sync = useSync()
  const nav = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [name, setName] = useState(guessDeviceName())

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError('')
    try {
      await fn()
      nav('/', { replace: true })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-2 pt-[env(safe-area-inset-top)] text-center">
      <img src="/icon.svg" alt="" className="mb-6 h-20 w-20 rounded-3xl shadow-2xl shadow-wine-900/50" />
      <p className="text-xs font-semibold tracking-[0.2em] text-wine-300 uppercase">MioVino</p>
      <h1 className="font-display mt-1 text-3xl font-semibold text-cream-50">{invite ? 'Set up this device' : 'Welcome back'}</h1>

      {invite ? (
        <div className="mt-6 w-full max-w-sm text-left">
          <p className="mb-5 text-center text-sm text-cream-300">
            Create a passkey for your cellar. You'll unlock it with Face ID, your fingerprint or your device PIN — no password.
          </p>
          <label className="block">
            <Label>Device name</Label>
            <input className="field" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <Button className="mt-4 w-full py-3.5 text-base" disabled={busy} onClick={() => run(() => registerDevice(invite, name))}>
            {busy ? <Loader2 className="animate-spin" size={20} /> : <Smartphone size={20} />} Create passkey
          </Button>
        </div>
      ) : (
        <div className="mt-6 w-full max-w-sm">
          <p className="mb-5 text-sm text-cream-300">Your cellar is private. Sign in with this device's passkey.</p>
          <Button className="w-full py-3.5 text-base" disabled={busy} onClick={() => run(signIn)}>
            {busy ? <Loader2 className="animate-spin" size={20} /> : <Fingerprint size={20} />} Sign in with passkey
          </Button>
          {sync.devices === 0 && (
            <p className="mt-5 rounded-xl bg-ink-850 p-3 text-xs text-cream-400 ring-1 ring-ink-700">
              No device is set up yet. Open the one-time setup link from <code className="text-cream-200">npm run auth:invite</code> on your phone.
            </p>
          )}
          <p className="mt-5 text-xs text-cream-500">New device? Open a setup link from a device that's already signed in (More → Devices).</p>
        </div>
      )}

      {error && <p className="mt-4 max-w-sm text-sm text-rose-300">{error}</p>}
      <p className="mt-10 flex items-center gap-1.5 text-xs text-cream-500">
        <ShieldCheck size={14} /> Passkeys never leave your device
      </p>
    </div>
  )
}

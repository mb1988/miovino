import { getLang } from './i18n'
/** Monthly drinking reminders by Web Push (see worker/push.ts). */

export type PushSupport = 'ok' | 'install-first' | 'unsupported'

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const standalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true

export type Platform = 'ios' | 'android' | 'other'
export function platform(): Platform {
  if (isIOS()) return 'ios'
  return /Android/i.test(navigator.userAgent) ? 'android' : 'other'
}

/** True when the owner said no to notifications for this site; only the phone's settings can undo that. */
export function pushBlocked() {
  return 'Notification' in window && Notification.permission === 'denied'
}

/** On iPhone, push only exists once the app is opened from the Home Screen (iOS 16.4+). */
export function pushSupport(): PushSupport {
  if ('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window) return 'ok'
  return isIOS() && !standalone() ? 'install-first' : 'unsupported'
}

async function registration() {
  const reg = await navigator.serviceWorker.getRegistration()
  if (!reg) throw new Error('The app isn’t installed as an offline app yet — reload once and try again.')
  return reg
}

export async function pushEnabled(): Promise<boolean> {
  if (pushSupport() !== 'ok' || Notification.permission !== 'granted') return false
  const reg = await navigator.serviceWorker.getRegistration()
  return !!(await reg?.pushManager.getSubscription())
}

const post = async (path: string, body: unknown) => {
  const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), credentials: 'same-origin' })
  const data = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) throw new Error(data.error ?? `Server error ${res.status}`)
  return data
}

function keyBytes(b64url: string) {
  const bin = atob(b64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64url.length % 4)) % 4))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

/** Asks for permission (must run from a tap) and registers this device for reminders. */
export async function enablePush() {
  if ((await Notification.requestPermission()) !== 'granted') throw new Error('Notifications are blocked. Allow them in Settings → Notifications → MioVino.')
  const reg = await registration()
  const res = await fetch('/api/push/key', { credentials: 'same-origin' })
  if (!res.ok) throw new Error('Reminders need the cloud server (sign in first).')
  const { publicKey } = (await res.json()) as { publicKey: string }
  let sub = await reg.pushManager.getSubscription()
  // A subscription made for another server key can't be reused.
  if (sub && sub.options.applicationServerKey && btoa(String.fromCharCode(...new Uint8Array(sub.options.applicationServerKey))) !== btoa(String.fromCharCode(...keyBytes(publicKey)))) {
    await sub.unsubscribe()
    sub = null
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) })
  await post('/api/push/subscribe', { subscription: sub.toJSON(), device: deviceName(), lang: getLang() })
}

/** After a language change: tell the server, so the next reminder arrives in the new language. */
export async function updatePushLanguage() {
  if (pushSupport() !== 'ok' || Notification.permission !== 'granted') return
  const sub = await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription()
  if (sub) await post('/api/push/subscribe', { subscription: sub.toJSON(), device: deviceName(), lang: getLang() }).catch(() => undefined)
}

export async function disablePush() {
  const sub = await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription()
  if (!sub) return
  await post('/api/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => undefined)
  await sub.unsubscribe()
}

/** Sends this month's summary to every device now. */
export async function testPush() {
  return (await post('/api/push/test', {})) as { sent: number; devices: number }
}

function deviceName() {
  const ua = navigator.userAgent
  return /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'Browser'
}

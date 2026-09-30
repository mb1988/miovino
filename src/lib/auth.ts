import { startAuthentication, startRegistration } from '@simplewebauthn/browser'
import { serverStatus, syncNow } from './sync'

/** Passkey sign-in / device setup against the Worker's /api/auth endpoints. */

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), credentials: 'same-origin' })
  const j = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`)
  return j
}

function friendly(e: unknown): Error {
  const err = e as Error
  if (err?.name === 'NotAllowedError') return new Error('Cancelled — or no MioVino passkey on this device.')
  if (err?.name === 'InvalidStateError') return new Error('This device already has a MioVino passkey. Use "Sign in" instead.')
  return err instanceof Error ? err : new Error(String(e))
}

async function afterSignIn() {
  await serverStatus(true)
  await syncNow()
}

export async function signIn() {
  try {
    const optionsJSON = await post<Parameters<typeof startAuthentication>[0]['optionsJSON']>('/api/auth/login/options', {})
    const response = await startAuthentication({ optionsJSON })
    await post('/api/auth/login/verify', { response })
  } catch (e) {
    throw friendly(e)
  }
  await afterSignIn()
}

export async function registerDevice(invite: string, deviceName: string) {
  try {
    const optionsJSON = await post<Parameters<typeof startRegistration>[0]['optionsJSON']>('/api/auth/register/options', { invite })
    const response = await startRegistration({ optionsJSON })
    await post('/api/auth/register/verify', { invite, response, deviceName })
  } catch (e) {
    throw friendly(e)
  }
  await afterSignIn()
}

export async function signOut() {
  await post('/api/auth/logout', {})
  await serverStatus(true)
}

export async function createInviteLink(): Promise<string> {
  const { invite } = await post<{ invite: string }>('/api/auth/invite', {})
  return `${location.origin}/setup?invite=${encodeURIComponent(invite)}`
}

export interface Device {
  id: string
  device_name: string
  created_at: number
  last_used_at?: number
}

export async function listDevices(): Promise<Device[]> {
  const res = await fetch('/api/auth/devices', { credentials: 'same-origin' })
  if (!res.ok) return []
  return ((await res.json()) as { devices: Device[] }).devices
}

export async function removeDevice(id: string) {
  const res = await fetch(`/api/auth/devices/${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'same-origin' })
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? 'Could not remove device')
}

export function guessDeviceName() {
  const ua = navigator.userAgent
  if (/iPhone/.test(ua)) return 'iPhone'
  if (/iPad/.test(ua)) return 'iPad'
  if (/Android/.test(ua)) return 'Android phone'
  if (/Macintosh/.test(ua)) return 'Mac'
  if (/Windows/.test(ua)) return 'Windows PC'
  return 'Device'
}

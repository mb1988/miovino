import { labelPrompt, LabelSchema, tidyLabel, type LabelResult } from '../shared/label'
import { imageToBase64 } from './image'
import { serverStatus } from './sync'

export { LabelSchema, labelPrompt, type LabelResult }

export class ScanError extends Error {
  name = 'ScanError'
}

/** Reads a label on the MioVino server (/api/scan). The AI keys live there as Worker secrets, never on the phone. */
export async function scanLabel(photo: Blob): Promise<{ result: LabelResult; thumbnail: Blob }> {
  const server = await serverStatus()
  if (!server.scan) throw new ScanError('Scanning needs the MioVino server with a free AI key (see More → AI).')
  const { data } = await imageToBase64(photo)
  let res: Response
  try {
    res = await fetch('/api/scan', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ image: data }) })
  } catch {
    throw new ScanError('No connection to the server. Are you offline?')
  }
  const body = (await res.json().catch(() => ({}))) as { result?: LabelResult; error?: string }
  if (!res.ok || !body.result) throw new ScanError(body.error ?? `Scan failed (${res.status}).`)
  const thumb = await imageToBase64(photo, 600)
  return { result: tidyLabel(body.result), thumbnail: thumb.blob }
}

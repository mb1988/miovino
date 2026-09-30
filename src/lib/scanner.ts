import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { labelPrompt, LabelSchema, tidyLabel, type LabelResult } from '../shared/label'
import { imageToBase64 } from './image'
import { getSettings } from './settings'
import { serverStatus } from './sync'

export { LabelSchema, type LabelResult }

export class ScanError extends Error {
  name = 'ScanError'
}

/**
 * Reads a label. Uses the server (/api/scan, key kept as a Worker secret) when it is available;
 * otherwise falls back to calling the API directly with a key saved on this device.
 */
export async function scanLabel(photo: Blob): Promise<{ result: LabelResult; thumbnail: Blob }> {
  const { apiKey, model } = getSettings()
  const { data } = await imageToBase64(photo)
  const server = await serverStatus()
  let result: LabelResult
  if (server.scan) result = await scanViaServer(data, model)
  else if (apiKey) result = await scanDirect(data, apiKey, model)
  else throw new ScanError('Scanning needs the MioVino server, or an Anthropic API key in More → Settings.')
  const thumb = await imageToBase64(photo, 600)
  return { result: tidyLabel(result), thumbnail: thumb.blob }
}

async function scanViaServer(image: string, model: string): Promise<LabelResult> {
  let res: Response
  try {
    res = await fetch('/api/scan', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ image, model }) })
  } catch {
    throw new ScanError('No connection to the server. Are you offline?')
  }
  const body = (await res.json().catch(() => ({}))) as { result?: LabelResult; error?: string }
  if (!res.ok || !body.result) throw new ScanError(body.error ?? `Scan failed (${res.status}).`)
  return body.result
}

async function scanDirect(data: string, apiKey: string, model: string): Promise<LabelResult> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
  try {
    const response = await client.messages.parse({
      model,
      max_tokens: 16000,
      output_config: { effort: 'low', format: zodOutputFormat(LabelSchema) },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } },
            { type: 'text', text: labelPrompt() },
          ],
        },
      ],
    })
    if (response.stop_reason === 'refusal') throw new ScanError('The model declined to read this image. Try another photo or add the wine manually.')
    if (!response.parsed_output) throw new ScanError('Could not read the label. Try a sharper, closer photo.')
    return response.parsed_output
  } catch (e) {
    if (e instanceof ScanError) throw e
    if (e instanceof Anthropic.AuthenticationError) throw new ScanError('Your API key was rejected. Check it in Settings.')
    if (e instanceof Anthropic.RateLimitError) throw new ScanError('Rate limited by the API — wait a moment and try again.')
    if (e instanceof Anthropic.APIConnectionError) throw new ScanError('No connection to the API. Are you offline?')
    if (e instanceof Anthropic.APIError) throw new ScanError(`API error: ${e.message}`)
    throw e
  }
}

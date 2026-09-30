import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
import { imageToBase64 } from './image'
import { getSettings } from './settings'
import { WINE_TYPES } from './types'

export const LabelSchema = z.object({
  isWineLabel: z.boolean().describe('false if the photo does not show a wine label'),
  producer: z.string().describe('Winery / domaine / château / producer as printed'),
  name: z.string().describe('Wine or cuvée name, including vineyard/cru and Riserva if present — not the producer'),
  vintage: z.number().nullable().describe('Vintage year; null if non-vintage or not visible'),
  type: z.enum(WINE_TYPES),
  country: z.string().nullable(),
  region: z.string().nullable().describe('Wine region in English, e.g. Piedmont, Bordeaux, Tuscany'),
  appellation: z.string().nullable().describe('Appellation / DOC / DOCG / AOC as printed'),
  grapes: z.array(z.string()).describe('Grape varieties: from the label, or the typical blend for the appellation'),
  alcohol: z.number().nullable().describe('ABV %'),
  bottleSizeMl: z.number().nullable(),
  drinkFrom: z.number().nullable().describe('Suggested first year to drink — your best estimate for this wine and vintage'),
  drinkTo: z.number().nullable().describe('Suggested last year to drink — your best estimate'),
  tastingNote: z.string().nullable().describe('One or two sentences of typical style / tasting profile for this wine (general knowledge, not personal)'),
  pairing: z.string().nullable().describe('Short food pairing suggestion'),
  confidence: z.enum(['high', 'medium', 'low']),
})
export type LabelResult = z.infer<typeof LabelSchema>

const PROMPT = `You are helping a wine collector add a bottle to their personal cellar app.
Read the wine label in the photo and extract the fields. Use what is printed on the label first; fill the remaining
fields (region, grapes, drinking window, style) from your wine knowledge for this producer, appellation and vintage.
Drinking window: give a realistic range for this specific wine and vintage, as a sommelier would. Current year: ${new Date().getFullYear()}.
If the text is ambiguous, pick the most likely reading and lower the confidence.`

export class ScanError extends Error {
  name = 'ScanError'
}

export async function scanLabel(photo: Blob): Promise<{ result: LabelResult; thumbnail: Blob }> {
  const { apiKey, model } = getSettings()
  if (!apiKey) throw new ScanError('Add your Anthropic API key in More → Settings to use the scanner.')
  const { data } = await imageToBase64(photo)
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
            { type: 'text', text: PROMPT },
          ],
        },
      ],
    })
    if (response.stop_reason === 'refusal') throw new ScanError('The model declined to read this image. Try another photo or add the wine manually.')
    if (!response.parsed_output) throw new ScanError('Could not read the label. Try a sharper, closer photo.')
    const thumb = await imageToBase64(photo, 600)
    const r = response.parsed_output
    const year = (n: number | null) => (n == null ? null : Math.round(n))
    return {
      result: { ...r, vintage: year(r.vintage), drinkFrom: year(r.drinkFrom), drinkTo: year(r.drinkTo), bottleSizeMl: year(r.bottleSizeMl) },
      thumbnail: thumb.blob,
    }
  } catch (e) {
    if (e instanceof ScanError) throw e
    if (e instanceof Anthropic.AuthenticationError) throw new ScanError('Your API key was rejected. Check it in Settings.')
    if (e instanceof Anthropic.RateLimitError) throw new ScanError('Rate limited by the API — wait a moment and try again.')
    if (e instanceof Anthropic.APIConnectionError) throw new ScanError('No connection to the API. Are you offline?')
    if (e instanceof Anthropic.APIError) throw new ScanError(`API error: ${e.message}`)
    throw e
  }
}


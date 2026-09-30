import { createRemoteJWKSet, jwtVerify } from 'jose'
import { hasSession, type PasskeyEnv } from './passkeys'

export interface AuthEnv extends PasskeyEnv {
  /** e.g. "myteam.cloudflareaccess.com" */
  ACCESS_TEAM_DOMAIN?: string
  /** Application Audience (AUD) tag from the Access application */
  ACCESS_AUD?: string
  /** Comma-separated emails allowed through (defense in depth on top of the Access policy). */
  ALLOWED_EMAILS?: string
  /** "true" only in local dev (.dev.vars) — skips the check when Access isn't in front. */
  ALLOW_NO_AUTH?: string
}

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>()

/**
 * Every API request must carry either a passkey session cookie (built-in login) or, when Cloudflare Access
 * is configured, a valid Access JWT. Local dev can opt out with ALLOW_NO_AUTH=true in .dev.vars.
 */
export async function authorize(req: Request, env: AuthEnv): Promise<{ email: string } | Response> {
  if (env.ALLOW_NO_AUTH === 'true') return { email: 'local-dev' }
  if (await hasSession(req, env)) return { email: 'owner' }
  const token = req.headers.get('cf-access-jwt-assertion')
  if (!token || !env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return json({ error: 'Not signed in' }, 401)
  const issuer = `https://${env.ACCESS_TEAM_DOMAIN}`
  let jwks = jwksCache.get(issuer)
  if (!jwks) jwksCache.set(issuer, (jwks = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`))))
  try {
    const { payload } = await jwtVerify(token, jwks, { issuer, audience: env.ACCESS_AUD })
    const email = String(payload.email ?? '').toLowerCase()
    const allowed = (env.ALLOWED_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
    if (allowed.length && !allowed.includes(email)) return json({ error: 'Not allowed' }, 403)
    return { email }
  } catch {
    return json({ error: 'Invalid session' }, 401)
  }
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } })
}

#!/usr/bin/env node
// Creates a one-time (24 h) setup link so a device can register its passkey. Use it for the very first device;
// after that, signed-in devices can create links themselves (More → Devices → Add a device).
//   npm run auth:invite            → production
//   npm run auth:invite -- preview → preview environment
import { execFileSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import QRCode from 'qrcode'

const env = process.argv[2] === 'preview' ? 'preview' : 'production'
const db = env === 'preview' ? 'miovino-preview' : 'miovino'
const origin = process.env.MIOVINO_URL ?? (env === 'preview' ? 'https://miovino-preview.miovino.workers.dev' : 'https://miovino.miovino.workers.dev')

const token = randomBytes(24).toString('base64url')
const hash = createHash('sha256').update(token).digest('base64url')
const now = Date.now()
// Written to a file: on Windows, npx needs a shell, which would split a --command string at spaces.
mkdirSync('data', { recursive: true })
writeFileSync('data/.invite.sql', `INSERT INTO invites (token_hash, expires_at, created_at) VALUES ('${hash}', ${now + 24 * 3600_000}, ${now});
`)
const args = ['wrangler', 'd1', 'execute', db, '--remote', '--file', 'data/.invite.sql', '--yes', ...(env === 'preview' ? ['--env', 'preview'] : [])]
try {
  execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', args, { stdio: ['ignore', 'ignore', 'inherit'], shell: process.platform === 'win32' })
} finally {
  rmSync('data/.invite.sql', { force: true })
}

const url = `${origin}/setup?invite=${token}`
writeFileSync('data/setup-link.txt', url + '\n')
console.log('\nScan with your phone camera (valid 24 h, works once):\n')
console.log(await QRCode.toString(url, { type: 'terminal', small: true }))
console.log(`Or open: ${url}\n(also saved to data/setup-link.txt — not committed)`)

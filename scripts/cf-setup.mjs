#!/usr/bin/env node
// One-time Cloudflare setup, safe to re-run: creates the D1 databases (production + preview),
// writes the database IDs into wrangler.jsonc and applies migrations. Run after `npx wrangler login`.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const wrangler = (args, opts = {}) => execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['wrangler', ...args], { encoding: 'utf8', shell: process.platform === 'win32', ...opts })
const step = (msg) => console.log(`\n▶ ${msg}`)

step('Checking login')
console.log(wrangler(['whoami']).split('\n').filter((l) => /email|Account/i.test(l)).join('\n'))

step('D1 databases')
const listD1 = () => JSON.parse(wrangler(['d1', 'list', '--json']))
for (const name of ['miovino', 'miovino-preview']) {
  if (!listD1().some((d) => d.name === name)) {
    console.log(`creating ${name}`)
    wrangler(['d1', 'create', name, '--location', 'weur'], { stdio: 'inherit' })
  } else console.log(`${name} exists`)
}
const ids = Object.fromEntries(listD1().map((d) => [d.name, d.uuid]))

step('Writing database IDs into wrangler.jsonc')
let cfg = readFileSync('wrangler.jsonc', 'utf8')
cfg = cfg.replace(/("database_name": "miovino", "database_id": ")[^"]*"/, `$1${ids['miovino']}"`)
cfg = cfg.replace(/("database_name": "miovino-preview", "database_id": ")[^"]*"/, `$1${ids['miovino-preview']}"`)
writeFileSync('wrangler.jsonc', cfg)
console.log(ids)

step('Applying migrations')
wrangler(['d1', 'migrations', 'apply', 'miovino', '--remote'], { stdio: 'inherit', input: 'y\n' })
wrangler(['d1', 'migrations', 'apply', 'miovino-preview', '--remote', '--env', 'preview'], { stdio: 'inherit', input: 'y\n' })

console.log(`
✅ Cloudflare resources ready. Next:
  1. npm run deploy                                  (first deploy → prints your workers.dev URL)
  2. npx wrangler secret put ANTHROPIC_API_KEY       (paste your key; enables server-side scanning)
  3. Dashboard → Workers → miovino → Settings → Domains & Routes → workers.dev → "Enable Cloudflare Access"
     then copy the team domain + AUD tag into wrangler.jsonc vars (ACCESS_TEAM_DOMAIN, ACCESS_AUD) and deploy again.
  4. For CI/CD: create an API token (template "Edit Cloudflare Workers" + D1 Edit) and add GitHub secrets
     CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID, then repo variable CF_DEPLOY=true.
`)

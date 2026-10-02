# Release plan

## Recommendation: Cloudflare (hosting + database + login + AI, one account, £0)

| Need | Cloudflare | Vercel + Neon |
|---|---|---|
| Host the PWA | Workers static assets ✅ free | ✅ free (Hobby) |
| Keep it **private** (only you) | **Built-in passkey login** (Face ID / fingerprint). Cloudflare Access is supported too, but its free plan needs a card on file | Hobby can't protect the production domain. Needs Pro ($20/mo) or hand-written auth |
| Database | **D1** (SQLite) free | **Neon** Postgres free |
| Built-in backups | D1 **Time Travel: restore to any minute of the last 7 days** (free) | Neon free: **6 hours** of history |
| Photos | stored in **D1** (no card needed; R2 optional later) | Vercel Blob (paid beyond small quota) |
| AI proxy (keep the key off the phone) | Worker holds the Claude key; optional free Workers AI | Vercel Function |
| Preview per branch / PR | ✅ | ✅ (excellent) |

**Why Cloudflare:** for a private personal app, the deciding factor is being able to lock the site for free without writing auth, plus 7-day point-in-time restore. Vercel + Neon is great too, and you already have the Neon MCP connected, but locking production on Vercel costs money or needs custom auth code.

## Architecture after release

```
Phone / laptop (PWA, offline-first; IndexedDB stays as the local cache)
   │  HTTPS, passkey session cookie (or Cloudflare Access)
   ▼
Cloudflare Worker ── /api/sync   → D1 (wines, bottles, tastings, locations)
                  ── /api/photo  → D1 photos table
                  └─ /api/scan, /api/ask, … → Gemini / OpenRouter (keys stored as Worker secrets)
```

- **Sync model:** every record gets `updatedAt` + `deletedAt`. The app pushes local changes and pulls anything newer, and the newest `updatedAt` wins. That is plenty for one person on two devices, and the app keeps working offline.
- AI keys are Worker **secrets**, so the phone never holds one.

## Environments: no separate staging

- `main` = production. Work happens on branches, then a PR, then **CI** (typecheck, tests, build; already in `.github/workflows/ci.yml`).
- Every PR gets a **preview URL** (own passkey login) wired to a separate `miovino-preview` D1 database, so tests never touch real data.
- Merging deploys automatically. **Rollback** is one click (or `wrangler rollback`) to the previous version.
- A staging environment would add cost and chores and bring no benefit for a single-user app. Preview deployments + CI + rollback cover it.

## Backups: three layers

1. **D1 Time Travel**: restore to any minute of the last 7 days (automatic, free).
2. **Nightly GitHub Action**: `wrangler d1 export` → saved as a private artifact on the repo, kept 90 days (plus one before every production deploy).
3. **In-app JSON export** (already built): a portable, human-readable copy you own.

Plus a restore drill: once a month, restore the latest export into the preview DB (the Action can do this) to prove backups actually work.

## AI: free by default

All AI features (label scan, Ask my cellar, wine-list scanner, window suggestions) run in the Worker through `worker/ai.ts`. It tries the providers that have a key, in order, and moves to the next on a rate limit, an outage or an unreadable answer:

| Order | Provider | Secret | Model (var) | Cost |
|---|---|---|---|---|
| 1 | **Google Gemini** | `GEMINI_API_KEY` | `GEMINI_MODEL` = `gemini-flash-latest` (an alias that follows Google's current Flash model) | Free tier (Flash models only, daily limits) |
| 2 | **OpenRouter** | `OPENROUTER_API_KEY` | `OPENROUTER_MODEL` = `google/gemma-4-31b-it:free,qwen/qwen3.8-27b:free,google/gemma-4-26b-a4b-it:free` (free models that read images, tried in order) | Free: 50 requests/day, 1,000/day after a one-off $10 top-up |
| 3 | Anthropic Claude | `ANTHROPIC_API_KEY` | `ANTHROPIC_MODEL` = `claude-opus-5-5` | Paid, only used if set |

Change the order with the `AI_PROVIDERS` var (e.g. `openrouter,gemini`). `/api/health` reports which provider is active, and More → AI features shows it.

**Privacy note:** on free tiers, Google (and some OpenRouter free models) may use prompts and images to improve their models. Label photos and restaurant lists are low-risk; the chat sends a text summary of your cellar.

**Get the keys (2 minutes each):**
- Gemini: https://aistudio.google.com/apikey → *Create API key* → `npx wrangler secret put GEMINI_API_KEY`
- OpenRouter (backup): https://openrouter.ai/keys → `npx wrangler secret put OPENROUTER_API_KEY`
- Preview deployments: same commands with `--env preview`.

## The database (Cloudflare D1)

**What it is:** SQLite managed by Cloudflare. It runs next to the Worker, is free at this size (5 GB, 5M reads/day), and can restore to any minute of the last 7 days.

**How data flows:**
- The phone keeps a full copy of the cellar in the browser (IndexedDB). The app always reads from this copy, so it's instant and works offline.
- Every change (add, edit, drink, delete) is stamped with a time and pushed to D1 by the Worker, about 2 seconds after the edit, on opening the app, and every 5 minutes.
- Other devices pull whatever changed. If the same record was edited on two devices, the **most recent edit wins**.
- Label photos (~100 KB each) live in a `photos` table in the same database, so no card-requiring R2 bucket is needed.

**Schema** (`migrations/0001_init.sql`): one `records` table (kind, id, JSON data, updated_at, deleted, rev), plus readable views:
`wines`, `bottles`, `tastings`, `locations` and `cellar` (what's in the cellar now). Query it yourself:

```bash
npm run db:query -- "SELECT producer, name, vintage, bottles, drink_from, drink_to FROM cellar"
```

**Schema changes** go in new numbered files in `migrations/`. CI backs up the database, applies migrations, then deploys.

## Setup (one time)

1. `npx wrangler login` (opens the browser, approve)
2. `npm run cf:setup` creates the D1 databases (prod + preview), writes the IDs into `wrangler.jsonc` and applies migrations
3. `npm run deploy` (first deploy prints `https://miovino.<you>.workers.dev`)
4. `npx wrangler secret put GEMINI_API_KEY` (free key from aistudio.google.com; paste it yourself). Optional backup: `OPENROUTER_API_KEY`. This enables every AI feature.
5. **Login (passkeys, built in):** `npm run auth:invite` prints a QR code and a one-time link (24 h). Open it on your phone, tap *Create passkey*, then approve with Face ID / fingerprint. Add more devices later from More → Devices → *Add a device* (shows a QR). Sessions last 180 days. Optional: Cloudflare Access also works (set `ACCESS_TEAM_DOMAIN` / `ACCESS_AUD`), but Zero Trust's free plan asks for a payment card.
6. **CI/CD:** create an API token (Workers Scripts Edit, D1 Edit, Account Settings Read). In GitHub → Settings → Secrets add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`; under Variables add `CF_DEPLOY=true`.
7. On your phone, after creating the passkey: **Share → Add to Home Screen**.

## Day-to-day

- Work on a branch, open a PR. CI tests it and deploys it to `miovino-preview` (its own database).
- Merge to `main`: CI backs up the DB, migrates, then deploys production.
- Something broke? `npx wrangler rollback` (code), or D1 → Time Travel (data).

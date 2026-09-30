# Release plan

## Recommendation: Cloudflare (hosting + database + login + AI, one account, £0)

| Need | Cloudflare | Vercel + Neon |
|---|---|---|
| Host the PWA | Workers static assets ✅ free | ✅ free (Hobby) |
| Keep it **private** (only you) | **Cloudflare Access**: email one-time code in front of the whole site, no auth code to write, free up to 50 users | Hobby can't protect the production domain. Needs Pro ($20/mo) or hand-written auth |
| Database | **D1** (SQLite) free | **Neon** Postgres free |
| Built-in backups | D1 **Time Travel: restore to any minute of the last 7 days** (free) | Neon free: **6 hours** of history |
| Photos | **R2** (10 GB free, no egress fees) | Vercel Blob (paid beyond small quota) |
| AI proxy (keep the key off the phone) | Worker holds the Claude key; optional free Workers AI | Vercel Function |
| Preview per branch / PR | ✅ | ✅ (excellent) |

**Why Cloudflare:** for a private personal app, the deciding factor is being able to lock the site for free without writing auth, plus 7-day point-in-time restore. Vercel + Neon is great too, and you already have the Neon MCP connected, but locking production on Vercel costs money or needs custom auth code.

## Architecture after release

```
Phone / laptop (PWA, offline-first; IndexedDB stays as the local cache)
   │  HTTPS, behind Cloudflare Access (email OTP)
   ▼
Cloudflare Worker ── /api/sync   → D1 (wines, bottles, tastings, locations)
                  ── /api/photo  → R2 (label photos)
                  └─ /api/scan   → Claude API (key stored as a Worker secret)
```

- **Sync model:** every record gets `updatedAt` + `deletedAt`. The app pushes local changes and pulls anything newer, and the newest `updatedAt` wins. That is plenty for one person on two devices, and the app keeps working offline.
- The Claude API key moves from phone settings to a Worker **secret**, so the phone never holds it.

## Environments: no separate staging

- `main` = production. Work happens on branches, then a PR, then **CI** (typecheck, tests, build; already in `.github/workflows/ci.yml`).
- Every PR gets a **preview URL** (also behind Access) wired to a separate `miovino-preview` D1 database, so tests never touch real data.
- Merging deploys automatically. **Rollback** is one click (or `wrangler rollback`) to the previous version.
- A staging environment would add cost and chores and bring no benefit for a single-user app. Preview deployments + CI + rollback cover it.

## Backups: three layers

1. **D1 Time Travel**: restore to any minute of the last 7 days (automatic, free).
2. **Nightly GitHub Action**: `wrangler d1 export` → uploaded to an R2 `backups/` bucket with a 90-day lifecycle rule.
3. **In-app JSON export** (already built): a portable, human-readable copy you own.

Plus a restore drill: once a month, restore the latest export into the preview DB (the Action can do this) to prove backups actually work.

## AI: which provider

| Option | Cost for ~100 scans/yr | Quality on wine labels | Notes |
|---|---|---|---|
| **Claude Haiku 4.5** via Worker proxy | ≈ £0.30/yr | Good | Cheapest Claude |
| **Claude Sonnet 5.5 / Opus 5.5** | ≈ £1–2/yr | Best: reads stylised labels, knows producers and windows | Current default in the app |
| Cloudflare Workers AI (Llama 3.2 Vision) | Free (10k neurons/day) | Noticeably weaker at stylised labels and wine knowledge | Same platform, no extra account |
| Google Gemini free tier | Free | Good | On the free tier, prompts/images **may be used for training**. Free-tier limits were cut in 2026 |

**Recommendation:** Claude through the Worker proxy (default Sonnet 5.5, switchable). It's pennies a year at this volume and the most accurate. Adding a free fallback (Workers AI) is easy, about an hour, because the scanner is isolated in `src/lib/scanner.ts`.

## Release checklist

- [ ] Create a private GitHub repo and push (`main` protected: PR + green CI required)
- [ ] Cloudflare account → `wrangler login`
- [ ] Worker + static assets, D1 `miovino` + `miovino-preview`, R2 bucket
- [ ] Cloudflare Access policy: allow your email only
- [ ] `/api/sync`, `/api/photo`, `/api/scan` + secrets (`ANTHROPIC_API_KEY`)
- [ ] Sync in the app (push/pull, conflict = newest wins), migration of the current local data
- [ ] Nightly backup Action + monthly restore drill
- [ ] Custom domain (optional, e.g. `cellar.yourdomain.com`)
- [ ] Install the PWA on your phone and test the live camera over HTTPS

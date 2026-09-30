# MioVino 🍷

Your private digital wine cellar and tasting journal. It's a local-first PWA: your data stays on your device and it works offline.

See [PLAN.md](PLAN.md) for the product plan, research and roadmap.

## Run

```bash
npm install
npm run db:migrate:local   # first time: create the local D1 database
npm run dev                # app + Worker API + local D1/R2 on http://localhost:5173
npm test                   # unit + sync tests (server logic runs on real SQLite)
```

`.dev.vars` (copy from `.dev.vars.example`) sets `ALLOW_NO_AUTH=true` for local dev. Deployment, the database and backups are covered in [docs/RELEASE.md](docs/RELEASE.md).

## Features (v0.1)
- **Cellar**: stats, drinking-status counts, search (producer, name, grape, region, location…), filters, 6 sort orders, card/list views
- **Import** from Excel/CSV. Italian and English columns are auto-mapped, messy values are normalised, and country/region/grapes are filled in from the appellation.
- **Wine page**: drinking-window timeline, bottle-level tracking (location, price, seller, date), your notes, tasting history, and guide/AI info kept visually separate
- **Drink a bottle**: half-star rating, occasion, company, food, notes, and "buy again"
- **What should I drink?**: rule-based picks that show their reasons (urgency, food match incl. Vitae pairings, occasion, price, your past ratings)
- **Journal** and **Wine DNA** (styles, grapes, regions, producers, vintages, loved / wouldn't buy again)
- **Label scanner**: photo → Claude vision → review form. If the wine is already in your cellar, it offers "+1 bottle" or "Drink" instead. Needs an Anthropic API key (More → Settings), which is stored only on the device.
- **Backup**: full JSON backup/restore (with photos), Excel export (cellar + tastings sheets), CSV export

## Code map
| Path | What |
|---|---|
| `src/lib/types.ts` | Data model (Wine → Bottles, Tastings, Locations) |
| `src/lib/db.ts` | Dexie/IndexedDB schema + write helpers |
| `src/lib/importer.ts` | Spreadsheet reading, column mapping, normalisation |
| `src/lib/knowledge.ts` | Offline appellation → country/region/grapes table, food affinities |
| `src/lib/status.ts` | Drinking-window status |
| `src/lib/recommend.ts` | "What should I drink" scoring |
| `src/lib/scanner.ts` | Claude vision label reader (lazy-loaded) |
| `src/lib/backup.ts` | Export / backup / restore |
| `src/lib/sync.ts` | Offline-first sync client |
| `worker/` | Cloudflare Worker: `/api/sync`, `/api/photo`, `/api/scan`, Access JWT check |
| `migrations/` | D1 schema |
| `src/pages/*` | Screens |

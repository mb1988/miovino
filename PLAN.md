# MioVino — Plan

> Personal wine cellar + tasting memory app. *"Tell me about MY wine."*
> Status: V1 plan — everything here is open to change.

## 1. What I found

### Your data (`Wine.xlsx`)
- 48 wine rows, 56 bottles, heavily Italian (Barolo/Barbaresco/Brunello) + Bordeaux/Burgundy/Rhône.
- Columns: `Produttore, Vino, Anno, Tipo, Prezzo 2025, Qty, Best to Drink, Anno Top, Vitae guida anno, Vita viti, Vitae Score, Vitae abbinamento, Vitae Descrizione`.
- Messy bits the importer must handle: `NV` vintages, drinking windows written as `2025 - 2040` / `2025–2027` / `2030-2040`, values like `2021?`, `2?`, `92?`, `N/A`, vintage embedded in the name (`Cote-rotie Ampodium2019`), inconsistent casing (`Poderi Aldo conterno`), missing country/region/grape.
- Vitae (AIS guide) data — score, "viti", pairing, description — is **external info** and must be shown separately from **your** notes.

### Competitors
| App | Strengths worth borrowing | What we skip |
|---|---|---|
| **Vivino** | Label scan → instant match, taste profile, drinking windows | Social, marketplace, community ratings |
| **CellarTracker** | Bottle-level tracking (price, location, drinking window), consumption history, CSV everything | Dated UI, data-entry heavy |
| **InVintory** | Beautiful UI, visual rack map (VinLocate), AI sommelier, tasting journal | 3D cellar, sensors, paid tiers |
| **Cellarion / MyWine** (open source) | Self-hosted, full data ownership, CSV import/export, AI label recognition | — |

**Takeaway:** the leaders all converge on *scan → confirm → store with location + window → log tasting*. The differentiator for a 50-bottle personal cellar is **speed of entry + "what should I drink tonight" + your own tasting memory**, not a wine database.

### Scanner approach
- Classic OCR (Tesseract) struggles with curved, stylised labels.
- Modern approach (used by recent apps/research): **send the photo to a multimodal LLM** and get back structured JSON (producer, wine, vintage, region, grapes, type, ABV, size, suggested drinking window). No wine database needed; the LLM's world knowledge fills gaps (e.g. Barolo → Nebbiolo, Piedmont).
- Then **fuzzy-match against your cellar** so scanning a bottle you already own offers "+1 bottle" or "Drink this" instead of a duplicate.

## 2. Architecture decision

**Installable PWA (Progressive Web App), local-first.**

| Choice | Why |
|---|---|
| React + TypeScript + Vite | Fast, standard, easy to extend |
| Tailwind CSS | Quick, consistent, mobile-first styling |
| Dexie (IndexedDB) | All data on-device, works offline, zero backend to run |
| vite-plugin-pwa | Installs on your phone home screen, offline |
| SheetJS (`xlsx`) | Excel/CSV import + export |
| Claude API (vision, structured tool output) | Label scanner + AI enrichment + "Ask my cellar" |
| Camera via `<input capture>` | Works on iOS/Android with no native app |

- **No app store, no server** for V1. Open the URL on your phone → "Add to Home Screen".
- **API key:** stored locally in Settings (personal app, only on your device). V2 option: tiny serverless proxy so the key never touches the browser.
- **Backup:** JSON full backup/restore + CSV/XLSX export in V1. **Cloud sync in V2** (options: Neon Postgres — you already have the MCP connected — or a JSON file in Google Drive/iCloud).
- Rejected: native (Swift/Kotlin/React Native) — slower to build, app-store friction; Next.js + DB — needs hosting & auth for a single user.

## 3. Data model

```
Wine            one "label" (producer + name + vintage)
 ├─ producer, name, vintage (number | null = NV), type (red/white/rosé/sparkling/dessert/fortified)
 ├─ country, region, appellation, grapes[], alcohol, bottleSize (ml)
 ├─ drinkFrom, drinkTo, peakYear          ← editable, never "authoritative"
 ├─ external: { source: 'Vitae'|'AI'|..., guideYear, awardLevel, score, pairing, description }
 ├─ photo (blob), favourite, personalNotes, tags[]
 └─ createdAt, updatedAt

Bottle          one physical bottle
 ├─ wineId, status: cellar | drunk | gifted | lost
 ├─ location (e.g. "Rack A / Shelf 2"), purchasePrice, currency, purchaseDate, seller
 └─ consumedAt, tastingId

Tasting         one journal entry
 ├─ wineId, bottleId?, date, rating (0.5–5), occasion, company, food
 ├─ notes, buyAgain: yes | maybe | no
 └─ createdAt

Location        user-defined list of places (Rack A / Shelf 1, Wine fridge / Top…)
Settings        currency, API key, model, default location
```

Drinking status (computed, current year Y):
- 🔴 **Past peak** — Y > drinkTo
- 🟢 **Ready** — drinkFrom ≤ Y ≤ drinkTo (🟠 **Drink soon** if Y ≥ drinkTo − 1)
- 🟡 **Approaching** — Y = drinkFrom − 1
- 🔵 **Hold** — Y < drinkFrom − 1
- ⚪ **Unknown** — no window

## 4. Screens

Bottom nav: **Cellar · Drink · ＋Add (big) · Journal · More**

1. **Home / Cellar** — stats header (bottles, value, by type, ready/soon/hold), search, filter chips (type, status, country, location, favourites), sort (drink-by, vintage, price, producer, added), card ⇄ compact list.
2. **Wine detail** — hero (type colour, photo), drinking-window timeline bar, *Your bottles* (location, price, per-bottle actions), *Your info* (rating, notes), *Tasting history*, *External info* (Vitae/AI, visually separated). Actions: Drink one, +Bottle, Edit, Move, Favourite, Delete.
3. **Add wine** — Scan label · Add manually · Import spreadsheet. Scan → "Is this your wine?" editable review → match against existing wines → save.
4. **Drink a bottle** — rating (half stars), date, occasion, company, food, notes, buy again → bottle marked drunk, tasting saved.
5. **What should I drink?** — filters (type, occasion casual/special, food, max price, ready only) → top 3 with *reasons* ("Drink soon — window ends 2027", "Pairs with red meat"). Rule-based scoring V1, optional AI "Ask the sommelier" V1.5.
6. **Journal** — timeline of tastings, filter by rating.
7. **My Taste (Wine DNA)** — type split, top regions/grapes/producers by bottles and by rating, avg rating, loved wines, wouldn't-buy-again.
8. **More / Settings** — locations manager, import, export (JSON/CSV/XLSX), restore backup, API key, currency, reset.

## 5. Import pipeline (your spreadsheet first)
1. Read XLSX/CSV with SheetJS.
2. Auto column mapping via header synonyms (Italian + English: `Produttore→producer`, `Vino→name`, `Anno→vintage`, `Tipo→type`, `Prezzo→price`, `Qty`, `Best to Drink→window`, `Anno Top→peak`, `Vitae…→external`); user can adjust mapping.
3. Normalise: parse windows with any dash, `NV`, strip `?`, `N/A`→empty, title-case producers, extract vintage from name, map `Rosso/Bianco/Spumante/Dessert` → types.
4. **Enrich offline** with a built-in appellation dictionary (Barolo → Italy / Piedmont / Nebbiolo, Pauillac → France / Bordeaux / Cab-Merlot, …) so country/region/grape filters work immediately.
5. Preview: *"48 wines detected — 45 ready, 3 need review"* with flagged rows; confirm → create wines + N bottles each.
6. Optional: "Enrich with AI" fills gaps for remaining wines.

## 6. Build phases

### Phase 1 — this session (autonomous) ✅ done
> Scanner code is complete but not live-tested (needs your API key). Everything else verified in the browser with `Wine.xlsx`.
- [x] Research + plan
- [x] Project scaffold (Vite/React/TS/Tailwind/Dexie/PWA), design system (dark wine theme)
- [x] Data layer, drinking-status logic, unit tests (import parsing, status, recommender)
- [x] Spreadsheet import with mapping, normalisation, enrichment, preview; first-run "import Wine.xlsx"
- [x] Cellar list: search, filters, sort, cards/list, dashboard stats
- [x] Wine detail + edit form + bottles management + locations
- [x] Drink flow + tasting journal
- [x] "What should I drink?" rule-based recommender
- [x] My Taste dashboard
- [x] Label scanner via Claude vision + manual fallback + duplicate match
- [x] Export JSON/CSV/XLSX + restore
- [x] Verify in browser (desktop + mobile viewport)

### Phase 1.5 — done (2026-09-30)
- [x] Data review against critics → `data/data-review.md` + `data/Wine.enriched.xlsx` (local only, not in git)
- [x] Critic windows shown per wine with "use this window"; disagreements flagged for review
- [x] Food pairing both ways (wine → dishes; dish → wine, free text EN/IT)
- [x] Live camera + "scan label" on the edit screen (fills empty fields only)
- [x] Vintage filter + vintage picker; currency £
- [x] Git repo, feature branches, CI workflow

### Phase 2 — release ✅ live at https://miovino.miovino.workers.dev
- [x] Cloudflare Worker + D1 (photos in D1), sync, passkey login, server-side label scan
- [x] CI/CD: every merge to `main` backs up D1, runs migrations and deploys; PRs deploy to `miovino-preview`

### Phase 3 — features (status 2026-09-30)
1. [x] **Wishlist / shopping list** — buy again = yes feeds it
2. [x] **Visual rack map** — tap a slot, "show in rack" highlight
3. [x] **Drinking reminders** — monthly card + Web Push (cron 1st of month); email digest not done
4. [x] **Ask my cellar** — chat over your own data (needs `ANTHROPIC_API_KEY` Worker secret)
5. [x] **Barcode scan** — Add → Scan barcode; ZXing (WebAssembly) on Safari, native detector elsewhere
6. [x] **Italian UI** — More → Settings → Lingua (defaults to the phone's language); the chat answers in Italian too
7. [x] **Stats over time** — More → Cellar over time: value at cost, spend per year, bottles in/out
8. [x] **Share a wine card** — Share on a wine page: photo/bottle, rating, latest note → share sheet (or download)

### Waiting on the owner
- A free `GEMINI_API_KEY` (aistudio.google.com) as a Worker secret, optional `OPENROUTER_API_KEY` backup: `npx wrangler secret put GEMINI_API_KEY` — turns on scan, chat, wine list, windows
- Try push reminders on the iPhone (Home Screen app → More → Reminders)

### Phase 4 — backlog for autonomous runs (top first; tick when shipped)
1. [x] **Restaurant wine-list scanner** — photo of a wine list → Claude reads it and ranks picks by your taste (Wine DNA), budget and food; `/api/winelist` in the Worker
2. [x] **Reminder texts in Italian** — push digest and Worker messages follow the language saved with the subscription
3. [x] **"What should I drink?" reasons in Italian** — `src/lib/recommend.ts` reason strings through `t()`
4. [x] **Drinking-window suggestions** — for wines with no window, ask Claude (server) for a typical window; owner confirms per wine
5. [x] **Wine page: price paid vs. now** — optional "current price" field and the difference in Cellar over time
6. [x] **Accessibility pass** — focus rings, labels, contrast check on every screen at 390px and desktop
7. [x] **End-to-end smoke test in CI** — Playwright against `vite preview` with a seeded IndexedDB and mocked `/api`

### Phase 5 — owner review, 2026-10-01 (priority order; tick when shipped)
Feedback after using the app. Each item is one PR; CI must be green before merging.

1. [x] **Demo mode for the CV** — `/demo` opens the app on a separate on-device database full of made-up wines (no sign-in, never touches the real cellar or D1). AI features answer with canned replies. Banner + "Exit demo". "Try the demo" link on the sign-in screen.
2. [x] **List view cuts text + general UI polish** — compact rows wrap/clamp instead of clipping; denser, readable rows on 360–390px phones.
3. [x] **Free AI instead of Anthropic** — one provider layer in the Worker: Google Gemini free tier (`GEMINI_API_KEY`) first, OpenRouter free models (`OPENROUTER_API_KEY`) as fallback, Anthropic only if its key is set. Scan, chat, wine list and window suggestions all go through it. *Owner:* create the free keys and add them as Worker secrets.
4. [x] **Rack map: "Place a wine"** — pick a wine first, see how many of its bottles still need a slot, the app suggests slots (next to the same wine, then same producer/type, keeping a row together); you can never place more bottles than are in the cellar.
5. [x] **Several cellars** — group racks/locations into cellars (e.g. Home, Parents'), switch cellar on the Cellar screen; "All cellars" stays the default.
6. [x] **Mobile experience pass** — safe areas, tap targets ≥44px, sheets that fit small screens, no horizontal scroll at 360px.
7. [x] **Reminders on Android + iPhone** — clear per-platform guidance in More → Reminders.
8. [x] **CV polish** — "About MioVino" intro in the demo (once per visitor), link-preview card (`public/og.png`, Open Graph tags) for LinkedIn/WhatsApp.

### Phase 6 — public repo for the CV (owner asked 2026-10-01)
1. [x] **Repo ready to go public** — README for recruiters (screenshots, architecture, quality), synthetic test fixture (no real cellar rows or guide text), email out of config, stray screenshot removed
2. [x] **Desktop presentation of the demo** — phone frame + intro panel on wide screens
3. [x] **Lighthouse pass** — performance / PWA / best practices
4. [x] **Published for the CV** — this repo renamed to `miovino-private`; public `mb1988/miovino` is a history-rewritten copy (no email, no real cellar rows). It does not auto-sync: re-publish on request (rewrite again, never push private history there).

### Phase 7 — prices (owner asked 2026-10-01; one PR each, owner merges)
1. [x] **Wine list: is the price fair?** In the restaurant wine-list scanner, every pick (and any other wine worth flagging on the list) gets a price verdict: **Steal**, **Fair**, **Pricey** or **Rip-off**.
   - Basis: the AI's estimate of the typical UK retail price for that wine and vintage, compared with the list price → markup. UK restaurants usually charge 2.5–3.5× retail: ≤2× = steal, 2–3.5× = fair, 3.5–5× = pricey, >5× = rip-off (thresholds in one shared constant, tested).
   - If the same wine is in the owner's cellar, use what they paid as the anchor ("you paid £38; here £95 = 2.5×").
   - Shown as a coloured badge + one line ("~£30 in shops · 2.2× · good value"); a "best value on this list" callout. Estimates are clearly labelled as estimates.
   - Extend `WineListSchema` (retailEstimate, verdict, valueNote, plus a `deals` list for non-picks), the prompt, demo canned data, Italian strings, unit tests for the verdict maths, e2e with a mocked `/api/winelist`.
2. [x] **Wishlist: where to buy.** Each wishlist item gets a "Where to buy" section:
   - **Where you bought it before** (from your bottles' `seller` field) — first, because it's real.
   - **Search links** that open live prices: Wine-Searcher (UK), plus a short list of UK merchants that suit the wine (e.g. The Wine Society, Berry Bros, Majestic, Lay & Wheeler, Hedonism) as search URLs — no paid API, no scraping.
   - Optional **AI hint** (one call per item, cached on the item): typical UK price range + which kinds of merchant stock it.
   - Live price feeds (Wine-Searcher API) are paid — not planned unless the owner wants to pay.

### Phase 8 — after real use (2026-10-03)
1. [x] **Wine memory** — AI prices and windows saved in D1 (wine_facts, 0007); asked again only after 30 days (prices) / a year (windows); price history kept
2. [x] **Value today + price history** — Cellar over time values the cellar at your price → remembered AI price → what you paid; estimate missing prices 10 at a time; Buy again shows each wine's price history
3. [ ] **Public repo refreshes itself** — GitHub Action: rewrite (no email / real rows) and push to the public repo after each merge
4. [ ] **Own domain** (owner buys it, e.g. miovino.app) — then add it as a Workers custom domain and update links
5. [ ] Wishlist price alerts — needs live shop prices (paid feed); parked

Answers to the owner's questions
- *More than one cellar?* Today: several **locations/racks** (each with its own grid) but no "cellar" level above them — item 5 adds it.
- *Monthly reminder only with Safari?* On iPhone, web push only works once the app is on the Home Screen (iOS 16.4+); adding it from Safari is the reliable way. On **Android it works in Chrome/Edge/Firefox directly**, installed or not.

### Later, only if wanted
Market value tracking, partner/shared cellar.

## 7. Decisions
- Currency: **£** ✅
- Hosting: **Cloudflare** recommended (docs/RELEASE.md) — awaiting your go-ahead
- Still open: UI language, rack/shelf names, cloud sync timing

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

### Phase 2 — release (see docs/RELEASE.md)
- Cloudflare: Worker + D1 + R2 + Access; sync; AI proxy; nightly backups

### Phase 3 — next features, in suggested order
1. **Drinking reminders**: monthly "ready now / closing soon" push notification + email digest
2. **Visual rack map**: tap a slot to see the bottle; "where is it?" highlight
3. **Ask my cellar** (AI chat over your own data): "what goes with ossobuco?", "what do I have from Piedmont ready this year?"
4. **Barcode scan**: instant re-add of a bottle you already own
5. **Wishlist / shopping list**: wines to buy again ("buy again = yes" feeds it)
6. **Stats over time**: spend per year, bottles in/out, value
7. **Italian UI**
8. **Share a wine card**: image of the bottle + your note, to send to friends

### Later, only if wanted
Market value tracking, partner/shared cellar, multiple cellars, restaurant wine-list scanner.

## 7. Decisions
- Currency: **£** ✅
- Hosting: **Cloudflare** recommended (docs/RELEASE.md) — awaiting your go-ahead
- Still open: UI language, rack/shelf names, cloud sync timing

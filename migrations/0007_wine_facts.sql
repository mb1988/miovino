-- What the AI has told us about a wine, kept so the same question isn't asked twice.
-- Append-only: every price seen stays, with its date, so a price history builds up.
-- wine_key = normalised "producer|name|vintage" (src/shared/wineKey.ts).
CREATE TABLE IF NOT EXISTS wine_facts (
  wine_key TEXT NOT NULL,
  kind TEXT NOT NULL,          -- 'price' (UK retail range) | 'window' (drinking window)
  data TEXT NOT NULL,          -- JSON
  source TEXT NOT NULL,        -- where it came from: 'pricehint', 'winelist', 'scan', 'windows'
  created_at INTEGER NOT NULL  -- ms since epoch
);
CREATE INDEX IF NOT EXISTS wine_facts_lookup ON wine_facts (wine_key, kind, created_at DESC);

-- Readable view of the price history: npm run db:query -- "SELECT * FROM price_history"
CREATE VIEW IF NOT EXISTS price_history AS
SELECT
  wine_key,
  json_extract(data, '$.low') AS low,
  json_extract(data, '$.high') AS high,
  source,
  date(created_at / 1000, 'unixepoch') AS seen_on
FROM wine_facts
WHERE kind = 'price'
ORDER BY wine_key, created_at DESC;

-- Adds the 'wishlist' kind. SQLite can't alter a CHECK constraint, so rebuild `records` without it
-- (the Worker validates kinds) and recreate the views on top.
DROP VIEW IF EXISTS cellar;
DROP VIEW IF EXISTS wines;
DROP VIEW IF EXISTS bottles;
DROP VIEW IF EXISTS tastings;
DROP VIEW IF EXISTS locations;

CREATE TABLE records_new (
  kind TEXT NOT NULL,
  id TEXT NOT NULL,
  data TEXT,
  updated_at INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  rev INTEGER NOT NULL,
  PRIMARY KEY (kind, id)
);
INSERT INTO records_new (kind, id, data, updated_at, deleted, rev) SELECT kind, id, data, updated_at, deleted, rev FROM records;
DROP TABLE records;
ALTER TABLE records_new RENAME TO records;
CREATE UNIQUE INDEX records_rev ON records (rev);

CREATE VIEW wines AS
SELECT id,
  json_extract(data, '$.producer') AS producer,
  json_extract(data, '$.name') AS name,
  json_extract(data, '$.vintage') AS vintage,
  json_extract(data, '$.type') AS type,
  json_extract(data, '$.country') AS country,
  json_extract(data, '$.region') AS region,
  json_extract(data, '$.appellation') AS appellation,
  json_extract(data, '$.drinkFrom') AS drink_from,
  json_extract(data, '$.drinkTo') AS drink_to,
  json_extract(data, '$.peakYear') AS peak_year,
  json_extract(data, '$.favourite') AS favourite,
  datetime(updated_at / 1000, 'unixepoch') AS updated
FROM records WHERE kind = 'wines' AND deleted = 0;

CREATE VIEW bottles AS
SELECT id,
  json_extract(data, '$.wineId') AS wine_id,
  json_extract(data, '$.status') AS status,
  json_extract(data, '$.location') AS location,
  json_extract(data, '$.slot') AS slot,
  json_extract(data, '$.purchasePrice') AS price,
  json_extract(data, '$.purchaseDate') AS purchased,
  json_extract(data, '$.consumedAt') AS consumed,
  datetime(updated_at / 1000, 'unixepoch') AS updated
FROM records WHERE kind = 'bottles' AND deleted = 0;

CREATE VIEW tastings AS
SELECT id,
  json_extract(data, '$.wineId') AS wine_id,
  json_extract(data, '$.date') AS date,
  json_extract(data, '$.rating') AS rating,
  json_extract(data, '$.occasion') AS occasion,
  json_extract(data, '$.food') AS food,
  json_extract(data, '$.notes') AS notes,
  json_extract(data, '$.buyAgain') AS buy_again
FROM records WHERE kind = 'tastings' AND deleted = 0;

CREATE VIEW locations AS
SELECT id, json_extract(data, '$.name') AS name, json_extract(data, '$.rows') AS rows, json_extract(data, '$.cols') AS cols
FROM records WHERE kind = 'locations' AND deleted = 0;

CREATE VIEW wishlist AS
SELECT id,
  json_extract(data, '$.producer') AS producer,
  json_extract(data, '$.name') AS name,
  json_extract(data, '$.vintage') AS vintage,
  json_extract(data, '$.note') AS note,
  json_extract(data, '$.done') AS bought
FROM records WHERE kind = 'wishlist' AND deleted = 0;

CREATE VIEW cellar AS
SELECT w.producer, w.name, w.vintage, w.drink_from, w.drink_to, COUNT(b.id) AS bottles, GROUP_CONCAT(DISTINCT b.location) AS locations
FROM wines w JOIN bottles b ON b.wine_id = w.id AND b.status = 'cellar'
GROUP BY w.id ORDER BY w.drink_to;

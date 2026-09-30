-- Label photos (JPEG, ~50-150 KB each after the app downscales them). Kept in D1 so no R2 bucket is needed.
CREATE TABLE photos (
  id TEXT PRIMARY KEY,        -- wine id
  data BLOB NOT NULL,
  updated_at INTEGER NOT NULL
);

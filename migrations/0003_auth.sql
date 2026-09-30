-- Passkey login (WebAuthn). No passwords are stored anywhere.
CREATE TABLE credentials (
  id TEXT PRIMARY KEY,            -- credential id (base64url)
  public_key TEXT NOT NULL,       -- COSE public key (base64url)
  counter INTEGER NOT NULL DEFAULT 0,
  transports TEXT,                -- JSON array
  device_name TEXT,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER
);

-- One-time links that let a new device register a passkey. Only the SHA-256 of the token is stored.
CREATE TABLE invites (
  token_hash TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  created_at INTEGER NOT NULL
);

-- Short-lived WebAuthn challenges (single use, 5 minutes).
CREATE TABLE challenges (
  id TEXT PRIMARY KEY,
  challenge TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

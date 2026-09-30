-- Monthly drinking reminders by Web Push. One row per device that turned them on.
CREATE TABLE push_subscriptions (
  endpoint TEXT PRIMARY KEY,   -- push service URL for this device
  p256dh TEXT NOT NULL,        -- device's encryption key (base64url)
  auth TEXT NOT NULL,          -- device's auth secret (base64url)
  device TEXT,
  created_at INTEGER NOT NULL
);

-- Server-generated settings: the VAPID key pair ('vapid') and the app origin ('subject').
CREATE TABLE push_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Language of each device's reminder (en / it). Existing rows keep English.
ALTER TABLE push_subscriptions ADD COLUMN lang TEXT NOT NULL DEFAULT 'en';

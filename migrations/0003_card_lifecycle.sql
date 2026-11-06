-- No backfill: existing cards have no invented creation/share/contribution history.
-- This live mapping disappears with the card; the random analytics ID survives
-- only in content-free lifecycle events, without an invitation URL or owner key.
CREATE TABLE IF NOT EXISTS card_analytics (
  card_id TEXT PRIMARY KEY REFERENCES cards(id) ON DELETE CASCADE,
  analytics_id TEXT NOT NULL UNIQUE,
  source TEXT CHECK (source IS NULL OR source IN ('direct', 'uni_email', 'other'))
);

CREATE TABLE IF NOT EXISTS card_events (
  event_id TEXT PRIMARY KEY,
  analytics_id TEXT NOT NULL,
  event TEXT NOT NULL CHECK (event IN ('card_created', 'share_clicked', 'invite_opened', 'contribution_added', 'card_deleted')),
  occurred_at TEXT NOT NULL DEFAULT (datetime('now')),
  source TEXT CHECK (source IS NULL OR source IN ('direct', 'uni_email', 'other')),
  method TEXT CHECK (method IS NULL OR method IN ('copy_link', 'native_share')),
  outcome TEXT CHECK (outcome IS NULL OR outcome IN ('attempted', 'copied', 'completed', 'cancelled', 'failed', 'manual_copy', 'fallback_copied')),
  acquisition_counted INTEGER NOT NULL DEFAULT 0 CHECK (acquisition_counted IN (0, 1))
);
CREATE INDEX IF NOT EXISTS idx_card_events_card_time ON card_events(analytics_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_card_events_time ON card_events(occurred_at);

-- Operational retry receipts, not visitor analytics. No raw request token or
-- owner key; retain after deletion so a retried create cannot resurrect a card.
CREATE TABLE IF NOT EXISTS card_creation_requests (
  request_hash TEXT PRIMARY KEY,
  card_id TEXT NOT NULL
);

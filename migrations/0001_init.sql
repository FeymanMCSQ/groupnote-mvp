CREATE TABLE IF NOT EXISTS cards (
  id TEXT PRIMARY KEY,
  admin_hash TEXT NOT NULL,
  occasion TEXT NOT NULL,
  title TEXT NOT NULL,
  recipient TEXT NOT NULL,
  creator TEXT NOT NULL,
  intro TEXT NOT NULL,
  theme TEXT NOT NULL,
  is_closed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  author TEXT NOT NULL,
  body TEXT NOT NULL,
  emoji TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_messages_card_created ON messages(card_id,created_at);
CREATE TABLE IF NOT EXISTS quotas (
  day TEXT NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(day, actor, action)
);

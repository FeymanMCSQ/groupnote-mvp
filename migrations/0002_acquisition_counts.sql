CREATE TABLE IF NOT EXISTS acquisition_counts (
  day TEXT NOT NULL,
  source TEXT NOT NULL,
  event TEXT NOT NULL CHECK (event IN ('landing', 'create_open', 'card_created')),
  count INTEGER NOT NULL DEFAULT 0 CHECK (count >= 0),
  PRIMARY KEY (day, source, event)
);

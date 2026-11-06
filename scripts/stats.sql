-- Aggregate counts only. Stored-card metrics exclude deletions; tests may appear.
-- Acquisition counters are cumulative and remain after card deletion.
-- Stored timestamps and the rolling 24-hour window are UTC.
-- This file contains only read-only SELECT queries.
SELECT 'Total currently stored cards' AS metric, COUNT(*) AS count FROM cards
UNION ALL
SELECT 'Cards created in the last 24 hours', COUNT(*) FROM cards
WHERE created_at >= datetime('now', '-24 hours') AND created_at <= datetime('now')
UNION ALL
SELECT 'Total contributions', COUNT(*) FROM messages
UNION ALL
SELECT 'Cards with at least 3 contributions', COUNT(*) FROM cards
WHERE (SELECT COUNT(*) FROM messages WHERE card_id = cards.id) >= 3;

-- Hourly aggregates let Node group into Sydney dates with daylight saving.
-- Fourteen elapsed days cover today plus the previous 13 Sydney dates.
SELECT strftime('%Y-%m-%d %H:00:00', created_at) AS utc_hour, COUNT(*) AS cards_created
FROM cards
WHERE created_at >= datetime('now', '-14 days') AND created_at <= datetime('now')
GROUP BY utc_hour
ORDER BY utc_hour;

-- Acquisition counters (new counters only; no historical backfill).
SELECT source,
  SUM(CASE WHEN event = 'landing' THEN count ELSE 0 END) AS landing_sessions,
  SUM(CASE WHEN event = 'create_open' THEN count ELSE 0 END) AS create_open_sessions,
  SUM(CASE WHEN event = 'card_created' THEN count ELSE 0 END) AS cards_created
FROM acquisition_counts
WHERE source IN ('direct', 'uni_email', 'other')
GROUP BY source
ORDER BY source;

SELECT day AS sydney_date, source,
  SUM(CASE WHEN event = 'landing' THEN count ELSE 0 END) AS landing_sessions,
  SUM(CASE WHEN event = 'create_open' THEN count ELSE 0 END) AS create_open_sessions,
  SUM(CASE WHEN event = 'card_created' THEN count ELSE 0 END) AS cards_created
FROM acquisition_counts
WHERE day >= date('now', '-14 days') AND source IN ('direct', 'uni_email', 'other')
GROUP BY day, source
ORDER BY day, source;

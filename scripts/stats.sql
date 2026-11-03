-- Aggregate counts only. Deleted cards are excluded; test cards may be included.
-- All times are UTC. This file contains only read-only SELECT queries.
SELECT 'Total currently stored cards' AS metric, COUNT(*) AS count FROM cards
UNION ALL
SELECT 'Cards created in the last 24 hours', COUNT(*) FROM cards
WHERE created_at >= datetime('now', '-24 hours') AND created_at <= datetime('now')
UNION ALL
SELECT 'Total contributions', COUNT(*) FROM messages
UNION ALL
SELECT 'Cards with at least 3 contributions', COUNT(*) FROM cards
WHERE (SELECT COUNT(*) FROM messages WHERE card_id = cards.id) >= 3;

-- Today (partial) plus the previous 13 UTC dates, including zero-count days.
WITH RECURSIVE days(day) AS (
  SELECT date('now', '-13 days')
  UNION ALL
  SELECT date(day, '+1 day') FROM days WHERE day < date('now')
)
SELECT days.day AS utc_date, COUNT(cards.id) AS cards_created
FROM days
LEFT JOIN cards ON date(cards.created_at) = days.day
GROUP BY days.day
ORDER BY days.day;

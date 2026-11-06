-- SELECT-only, content-free lifetime counts since lifecycle tracking began.
SELECT COUNT(DISTINCT CASE WHEN event='card_created' THEN analytics_id END) AS cards_created,
  COUNT(DISTINCT CASE WHEN event='card_deleted' THEN analytics_id END) AS cards_deleted,
  (SELECT COUNT(*) FROM cards) AS currently_stored,
  COUNT(DISTINCT CASE WHEN event='share_clicked' THEN analytics_id END) AS cards_shared,
  COUNT(DISTINCT CASE WHEN event='invite_opened' THEN analytics_id END) AS cards_opened,
  COUNT(DISTINCT CASE WHEN event='contribution_added' THEN analytics_id END) AS cards_contributed,
  (SELECT COUNT(*) FROM (SELECT analytics_id FROM card_events WHERE event='contribution_added' GROUP BY analytics_id HAVING COUNT(*)>=3)) AS cards_three_contributions,
  COUNT(CASE WHEN event='contribution_added' THEN 1 END) AS contributions,
  COUNT(CASE WHEN event='share_clicked' THEN 1 END) AS share_actions,
  COUNT(CASE WHEN event='invite_opened' THEN 1 END) AS invitation_sessions
FROM card_events;

SELECT strftime('%Y-%m-%d %H:00:00',occurred_at) AS utc_hour,event,COUNT(*) AS count
FROM card_events WHERE occurred_at>=datetime('now','-14 days') AND occurred_at<=datetime('now')
GROUP BY utc_hour,event ORDER BY utc_hour,event;

SELECT method,outcome,COUNT(*) AS share_actions,COUNT(DISTINCT analytics_id) AS distinct_cards
FROM card_events WHERE event='share_clicked' GROUP BY method,outcome ORDER BY method,outcome;

SELECT (SELECT COALESCE(SUM(count),0) FROM acquisition_counts WHERE event='card_created') AS acquisition_creations_all_time,
  COUNT(*) AS lifecycle_creations,
  COALESCE(SUM(acquisition_counted),0) AS lifecycle_creations_in_acquisition,
  COALESCE(SUM(CASE WHEN acquisition_counted=0 THEN 1 ELSE 0 END),0) AS lifecycle_creations_pending_acquisition
FROM card_events WHERE event='card_created';

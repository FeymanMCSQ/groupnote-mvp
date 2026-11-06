// Lifecycle records contain only random card aliases, event IDs, times, sources
// and fixed method/outcome labels. Never pass card contents or owner keys here.
export const randomToken = (bytes = 24) => Array.from(crypto.getRandomValues(new Uint8Array(bytes)), x => x.toString(16).padStart(2, '0')).join('');
export const hashToken = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), x => x.toString(16).padStart(2, '0')).join('');
export const validToken = value => typeof value === 'string' && /^[a-f0-9]{48}$/.test(value);
export const eventKey = (event, id) => hashToken(`${event}:${id}`);

function linkStatement(env, id, source = null, guard = '1', args = []) {
  return env.DB.prepare(`INSERT INTO card_analytics(card_id,analytics_id,source)
    SELECT id,?,? FROM cards WHERE id=? AND ${guard}
    ON CONFLICT(card_id) DO NOTHING`).bind(randomToken(16), source, id, ...args);
}

export async function creationStatements(env, id, source) {
  const key = await eventKey('card_created', id);
  return [linkStatement(env, id, source), env.DB.prepare(`INSERT INTO card_events(event_id,analytics_id,event,occurred_at,source)
    SELECT ?,a.analytics_id,'card_created',c.created_at,a.source FROM card_analytics a JOIN cards c ON c.id=a.card_id
    WHERE c.id=? ON CONFLICT(event_id) DO NOTHING`).bind(key, id)];
}

export async function contributionStatements(env, id, messageId) {
  return [linkStatement(env, id, null, 'EXISTS(SELECT 1 FROM messages WHERE id=? AND card_id=cards.id)', [messageId]),
    env.DB.prepare(`INSERT INTO card_events(event_id,analytics_id,event,occurred_at,source)
      SELECT ?,a.analytics_id,'contribution_added',m.created_at,a.source FROM card_analytics a
      JOIN messages m ON m.card_id=a.card_id WHERE m.id=? AND a.card_id=?
      ON CONFLICT(event_id) DO NOTHING`).bind(await eventKey('contribution_added', messageId), messageId, id)];
}

export async function deletionStatements(env, id, adminHash) {
  // These statements precede DELETE in the same transaction: an invalid key or
  // rolled-back deletion cannot commit a successful deletion event.
  return [linkStatement(env, id, null, 'admin_hash=?', [adminHash]),
    env.DB.prepare(`INSERT INTO card_events(event_id,analytics_id,event,source)
      SELECT ?,a.analytics_id,'card_deleted',a.source FROM card_analytics a JOIN cards c ON c.id=a.card_id
      WHERE c.id=? AND c.admin_hash=? ON CONFLICT(event_id) DO NOTHING`).bind(await eventKey('card_deleted', id), id, adminHash)];
}

// D1 batches are transactional. Analytics failures roll the batch back, then
// retry only the operational statements. Filtering never skips the mutation.
export async function mutate(env, operations, analytics = null, before = false) {
  if (analytics) {
    try {
      const extra = await analytics();
      const results = await env.DB.batch(before ? [...extra, ...operations] : [...operations, ...extra]);
      return results[before ? extra.length : 0];
    } catch { console.warn('GroupNote lifecycle analytics unavailable; preserving the operation.'); }
  }
  if (operations.length > 1) {
    try { return (await env.DB.batch(operations))[0]; }
    catch (error) {
      if (!/no such table:.*card_creation_requests/i.test(String(error))) throw error;
    }
  }
  return operations[0].run();
}

export async function clientEvent(request, env, url, id) {
  const reject = (message, status = 400) => new Response(JSON.stringify({error: message}), {status, headers: {'content-type': 'application/json', 'cache-control': 'no-store'}});
  if (request.method !== 'POST') return reject('Method not allowed', 405);
  if (request.headers.get('origin') !== url.origin) return reject('Origin not allowed', 403);
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return reject('JSON required', 415);
  if (Number(request.headers.get('content-length') || 0) > 512) return reject('Request too large', 413);
  let body;
  try {
    const text = await request.text();
    if (text.length > 512) return reject('Request too large', 413);
    body = JSON.parse(text);
  } catch { return reject('Invalid JSON'); }
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !['event', 'eventId', 'method', 'outcome'].includes(key)) || !validToken(body.eventId)) return reject('Invalid event');
  const invite = body.event === 'invite_opened';
  const share = body.event === 'share_clicked';
  if ((!invite && !share) || (invite && (body.method != null || body.outcome != null)) || (share && (!['copy_link', 'native_share'].includes(body.method) || !['attempted', 'copied', 'completed', 'cancelled', 'failed', 'manual_copy', 'fallback_copied'].includes(body.outcome)))) return reject('Invalid event');
  if (share && ((body.method === 'copy_link' && !['attempted', 'copied', 'manual_copy', 'failed'].includes(body.outcome)) || (body.method === 'native_share' && body.outcome === 'copied'))) return reject('Invalid outcome');
  try {
    if (!await env.DB.prepare('SELECT id FROM cards WHERE id=?').bind(id).first()) return reject('Card not found', 404);
    // A card-scoped event key deduplicates retries and tab-session refreshes.
    // It cannot link sessions across cards and contains no visitor identifier.
    const key = await eventKey(`${id}:${body.event}`, body.eventId);
    await env.DB.batch([linkStatement(env, id), env.DB.prepare(`INSERT INTO card_events(event_id,analytics_id,event,source,method,outcome)
      SELECT ?,a.analytics_id,?,a.source,?,? FROM card_analytics a WHERE a.card_id=?
      AND ((SELECT COUNT(*) FROM card_events e WHERE e.analytics_id=a.analytics_id
        AND e.event IN ('share_clicked','invite_opened') AND e.occurred_at>=date('now'))<2000
        OR EXISTS(SELECT 1 FROM card_events WHERE event_id=?))
      ON CONFLICT(event_id) DO UPDATE SET outcome=excluded.outcome
      WHERE card_events.event='share_clicked' AND card_events.method=excluded.method
        AND card_events.outcome='attempted' AND excluded.outcome!='attempted'`).bind(key, body.event, share ? body.method : null, share ? body.outcome : null, id, key)]);
  } catch {} // Missing migration/storage failure must not affect the card UI.
  return new Response(null, {status: 204, headers: {'cache-control': 'no-store'}});
}

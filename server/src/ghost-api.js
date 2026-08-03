import {
  GHOST_EPOCH_RE,
  GHOST_MAX_RECORD_BYTES,
  GHOST_MAX_RESPONSE_BYTES,
  GHOST_SHARE_EPOCH,
  GHOST_SLOT_RE,
  sanitizePerfScore,
  sanitizeSharedProfile,
  utf8Size,
} from '../../shared/ghostSanitize.mjs';
import { displayNameFrom } from '../../shared/playerName.mjs';

const ANON_RE = /^[0-9a-f-]{36}$/i;
const MAX_SLOTS = 16;
const TTL_MS = 30 * 24 * 60 * 60 * 1000;
const TOP_PERCENT = 0.2;

const json = (value, status = 200, headers = {}) => Response.json(value, { status, headers });
const bad = (message = 'Bad request') => json({ error: message }, 400);

const parseBody = async (request) => {
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > GHOST_MAX_RECORD_BYTES) return null;
  try { return JSON.parse(text); } catch { return null; }
};

const validAnon = (v) => typeof v === 'string' && ANON_RE.test(v);
const validSlot = (v) => typeof v === 'string' && GHOST_SLOT_RE.test(v);
const validEpoch = (v) => GHOST_EPOCH_RE.test(String(v)) && Number(v) === GHOST_SHARE_EPOCH;

async function putGhost(request, env) {
  const body = await parseBody(request);
  if (!body || !validAnon(body.anonId) || !validSlot(body.slot) || !validEpoch(body.epoch)) return bad();
  const profile = sanitizeSharedProfile(body.profile, body.slot);
  if (!profile || utf8Size(profile) > GHOST_MAX_RECORD_BYTES) return bad('Invalid profile');
  const slotProfile = profile.bossStyles[body.slot];
  const rawPerf = slotProfile?.perfScore ?? body.perfScore;
  const perf = rawPerf === undefined || rawPerf === null ? null : sanitizePerfScore(rawPerf);
  if (rawPerf !== undefined && rawPerf !== null && perf === null) return bad('Invalid performance score');
  const now = Date.now();
  const recordId = crypto.randomUUID();
  await env.GHOST_DB.prepare(`
    INSERT INTO ghost_records
      (record_id, anon_id, slot, epoch, knobs_v, profile_json, perf, build_version, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(anon_id, slot, epoch) DO UPDATE SET
      knobs_v=excluded.knobs_v, profile_json=excluded.profile_json, perf=excluded.perf,
      build_version=excluded.build_version, updated_at=excluded.updated_at
  `).bind(
    recordId, body.anonId, body.slot, Number(body.epoch),
    Number.isFinite(body.knobsV) ? Math.max(0, Math.floor(body.knobsV)) : 0,
    JSON.stringify(profile), perf,
    typeof body.buildVersion === 'string' ? body.buildVersion.slice(0, 32) : '', now, now,
  ).run();
  await env.GHOST_DB.prepare(`
    INSERT INTO ghost_stats (anon_id, slot, epoch, used, likes) VALUES (?, ?, ?, 0, 0)
    ON CONFLICT(anon_id, slot, epoch) DO NOTHING
  `).bind(body.anonId, body.slot, Number(body.epoch)).run();
  return json({ ok: true });
}

async function randomCandidate(env, slot, anonId) {
  return env.GHOST_DB.prepare(`
    SELECT record_id, slot, profile_json,
      (SELECT COUNT(*) FROM ghost_records AS pool
       WHERE pool.slot=? AND pool.epoch=? AND pool.anon_id<>?) AS pool_size
    FROM ghost_records
    WHERE slot=? AND epoch=? AND anon_id<>?
    ORDER BY RANDOM() LIMIT 1
  `).bind(
    slot, GHOST_SHARE_EPOCH, anonId ?? '',
    slot, GHOST_SHARE_EPOCH, anonId ?? '',
  ).first();
}

async function topCandidate(env, slot, anonId) {
  const countRow = await env.GHOST_DB.prepare(`
    SELECT COUNT(*) AS n FROM ghost_records
    WHERE slot=? AND epoch=? AND anon_id<>? AND perf IS NOT NULL
  `).bind(slot, GHOST_SHARE_EPOCH, anonId ?? '').first();
  const count = Number(countRow?.n ?? 0);
  if (count < 1) return null;
  const limit = Math.max(1, Math.ceil(count * TOP_PERCENT));
  const row = await env.GHOST_DB.prepare(`
    SELECT record_id, slot, profile_json FROM (
      SELECT record_id, slot, profile_json FROM ghost_records
      WHERE slot=? AND epoch=? AND anon_id<>? AND perf IS NOT NULL
      ORDER BY perf DESC LIMIT ?
    ) ORDER BY RANDOM() LIMIT 1
  `).bind(slot, GHOST_SHARE_EPOCH, anonId ?? '', limit).first();
  return row ? { ...row, pool_size: limit } : null;
}

async function pickGhosts(request, env) {
  const url = new URL(request.url);
  const slots = [...new Set((url.searchParams.get('slots') ?? '').split(',').filter(Boolean))];
  const mode = url.searchParams.get('mode') === 'top' ? 'top' : 'random';
  const anonId = validAnon(url.searchParams.get('anon')) ? url.searchParams.get('anon') : '';
  if (slots.length < 1 || slots.length > MAX_SLOTS || slots.some((slot) => !validSlot(slot))) return bad();
  const items = [];
  let responseBytes = 64;
  for (const slot of slots) {
    const row = mode === 'top' ? await topCandidate(env, slot, anonId) : await randomCandidate(env, slot, anonId);
    if (!row) continue;
    let profile;
    try { profile = JSON.parse(row.profile_json); } catch { continue; }
    const safe = sanitizeSharedProfile(profile, slot);
    if (!safe) continue;
    const item = {
      slot,
      recordId: row.record_id,
      poolSize: Math.max(1, Math.floor(Number(row.pool_size) || 1)),
      profile: safe,
    };
    const bytes = utf8Size(item);
    if (responseBytes + bytes > GHOST_MAX_RESPONSE_BYTES) break;
    responseBytes += bytes;
    items.push(item);
  }
  const payload = { epoch: GHOST_SHARE_EPOCH, items };
  while (payload.items.length > 0 && utf8Size(payload) > GHOST_MAX_RESPONSE_BYTES) payload.items.pop();
  return json(payload);
}

async function feedback(request, env) {
  const body = await parseBody(request);
  if (!body || typeof body.recordId !== 'string' || body.recordId.length > 64 || typeof body.liked !== 'boolean') return bad();
  const actorName = displayNameFrom(body.name) ?? '名無し';
  const row = await env.GHOST_DB.prepare(`
    SELECT anon_id, slot, epoch FROM ghost_records WHERE record_id=?
  `).bind(body.recordId).first();
  if (!row) return json({ ok: false }, 404);
  const now = Date.now();
  await env.GHOST_DB.batch([
    env.GHOST_DB.prepare(`
      INSERT INTO ghost_stats (anon_id, slot, epoch, used, likes) VALUES (?, ?, ?, 1, ?)
      ON CONFLICT(anon_id, slot, epoch) DO UPDATE SET
        used=used+1, likes=likes+excluded.likes
    `).bind(row.anon_id, row.slot, row.epoch, body.liked ? 1 : 0),
    env.GHOST_DB.prepare(`
      INSERT INTO ghost_feedback_events
        (owner_anon_id, slot, epoch, actor_name, liked, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(row.anon_id, row.slot, row.epoch, actorName, body.liked ? 1 : 0, now),
  ]);
  return json({ ok: true });
}

async function inbox(request, env) {
  const anonId = new URL(request.url).searchParams.get('anon');
  if (!validAnon(anonId)) return bad();
  const [stats, events] = await env.GHOST_DB.batch([
    env.GHOST_DB.prepare(`SELECT slot, used, likes FROM ghost_stats WHERE anon_id=? AND epoch=?`).bind(anonId, GHOST_SHARE_EPOCH),
    env.GHOST_DB.prepare(`
      SELECT event_id, slot, actor_name, liked, created_at FROM ghost_feedback_events
      WHERE owner_anon_id=? AND acked_at IS NULL ORDER BY event_id DESC LIMIT 20
    `).bind(anonId),
  ]);
  const recentBySlot = new Map();
  let cursor = 0;
  for (const row of events.results ?? []) {
    cursor = Math.max(cursor, Number(row.event_id));
    const list = recentBySlot.get(row.slot) ?? [];
    list.push({ name: displayNameFrom(row.actor_name) ?? '名無し', liked: Boolean(row.liked), at: Number(row.created_at) });
    recentBySlot.set(row.slot, list);
  }
  const items = (stats.results ?? []).map((row) => ({
    slot: row.slot,
    used: Math.max(0, Number(row.used) || 0),
    likes: Math.max(0, Number(row.likes) || 0),
    recent: recentBySlot.get(row.slot) ?? [],
  }));
  return json({ items, cursor });
}

async function ackInbox(request, env) {
  const body = await parseBody(request);
  if (!body || !validAnon(body.anonId) || !Number.isSafeInteger(body.cursor) || body.cursor < 0) return bad();
  await env.GHOST_DB.prepare(`
    UPDATE ghost_feedback_events SET acked_at=?
    WHERE owner_anon_id=? AND event_id<=? AND acked_at IS NULL
  `).bind(Date.now(), body.anonId, body.cursor).run();
  return json({ ok: true });
}

export async function handleGhostRequest(request, env) {
  const url = new URL(request.url);
  if (request.method === 'PUT' && url.pathname === '/ghost') return putGhost(request, env);
  if (request.method === 'GET' && url.pathname === '/ghost/pick') return pickGhosts(request, env);
  if (request.method === 'POST' && url.pathname === '/ghost/feedback') return feedback(request, env);
  if (request.method === 'GET' && url.pathname === '/ghost/inbox') return inbox(request, env);
  if (request.method === 'POST' && url.pathname === '/ghost/inbox/ack') return ackInbox(request, env);
  return new Response('Not found', { status: 404 });
}

export async function purgeExpiredGhosts(env) {
  const cutoff = Date.now() - TTL_MS;
  await env.GHOST_DB.batch([
    env.GHOST_DB.prepare('DELETE FROM ghost_records WHERE updated_at < ?').bind(cutoff),
    env.GHOST_DB.prepare('DELETE FROM ghost_feedback_events WHERE acked_at IS NOT NULL AND created_at < ?').bind(cutoff),
  ]);
}

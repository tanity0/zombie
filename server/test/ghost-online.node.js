import assert from 'node:assert/strict';
import test from 'node:test';
import { allowedGhostOriginValue } from '../src/ghost-origin.js';
import {
  GHOST_PROFILE_DEFAULTS,
  GHOST_SHARE_EPOCH,
  sanitizeSharedProfile,
} from '../../shared/ghostSanitize.mjs';
import { handleGhostRequest } from '../src/ghost-api.js';

const profile = (slot = 'thor') => ({
  v: 1,
  runs: 3,
  ...GHOST_PROFILE_DEFAULTS,
  srcName: '勇者\u202eBAD',
  arrivalComment: `援護\u202e${'あ'.repeat(35)}`,
  departureComment: '帰還する！',
  moveReactions: { 'thor-issen': { n: 4, counterRate: 2, hitRate: -1 }, evil: { n: 9, counterRate: 1, hitRate: 0 } },
  subStyles: {},
  bossStyles: {
    [slot]: {
      ...GHOST_PROFILE_DEFAULTS,
      srcName: '勇者\u202eBAD',
      srcClass: 'warrior',
      subStyles: {},
      snapshot: { maxHealth: 1e9, speed: 1e9, level: 1e9, gunKeys: ['rifle-t3', 'cheat-gun'] },
      perfScore: 1e9,
      at: Date.now(),
    },
  },
});

test('originless WebView, Capacitor and GitHub Pages are allowed', () => {
  assert.equal(allowedGhostOriginValue(null), true);
  assert.equal(allowedGhostOriginValue('capacitor://localhost'), true);
  assert.equal(allowedGhostOriginValue('https://tanity0.github.io'), true);
  assert.equal(allowedGhostOriginValue('https://github.io.evil.example'), false);
});

test('shared profile sanitizer clamps hostile data and rejects slot mismatch', () => {
  const safe = sanitizeSharedProfile(profile(), 'thor');
  assert.ok(safe);
  assert.equal(safe.bossStyles.thor.perfScore, 180);
  assert.equal(safe.bossStyles.thor.snapshot.maxHealth, 5000);
  assert.deepEqual(safe.bossStyles.thor.snapshot.gunKeys, ['rifle-t3']);
  assert.equal(safe.moveReactions['thor-issen'].counterRate, 1);
  assert.equal(safe.moveReactions.evil, undefined);
  assert.equal([...safe.arrivalComment].length, 30);
  assert.equal(safe.arrivalComment.includes('\u202e'), false);
  assert.equal(safe.departureComment, '帰還する！');
  assert.equal(sanitizeSharedProfile(profile('thor'), 'skadi'), null);
});

// v0.25.3256(守護霊へのアバター記録)の既知の地雷対策: sanitizeSnapshot のホワイトリストへ
// avatarId を足し忘れると online publish/consume の経路で黙って落ちる。ここで機械的に固定する。
test('shared profile sanitizer passes known avatarId through and nulls unknown/missing values', () => {
  const withKnownAvatar = profile();
  withKnownAvatar.bossStyles.thor.snapshot.avatarId = 'cat-set';
  const safeKnown = sanitizeSharedProfile(withKnownAvatar, 'thor');
  assert.ok(safeKnown);
  assert.equal(safeKnown.bossStyles.thor.snapshot.avatarId, 'cat-set'); // 既知のアバターIDはそのまま通る

  const withForgedAvatar = profile();
  withForgedAvatar.bossStyles.thor.snapshot.avatarId = 'admin-mode'; // 改造/未知IDはnull化
  const safeForged = sanitizeSharedProfile(withForgedAvatar, 'thor');
  assert.ok(safeForged);
  assert.equal(safeForged.bossStyles.thor.snapshot.avatarId, null);

  const withoutAvatar = profile(); // 欠損(旧データ)もnull化=非表示・クラッシュなし
  const safeMissing = sanitizeSharedProfile(withoutAvatar, 'thor');
  assert.ok(safeMissing);
  assert.equal(safeMissing.bossStyles.thor.snapshot.avatarId, null);
});

const pickEnv = (realCount) => ({
  GHOST_DB: {
    prepare(sql) {
      return {
        bind() {
          return {
            async first() {
              if (sql.includes('COUNT(*) AS n')) return { n: realCount };
              return {
                record_id: 'record-1',
                slot: 'thor',
                profile_json: JSON.stringify(profile('thor')),
                pool_size: realCount,
              };
            },
          };
        },
      };
    },
  },
});

test('pick response reports the real-player pool size for fixed/real weighted mixing', async () => {
  const anon = '11111111-1111-4111-8111-111111111111';
  const randomResponse = await handleGhostRequest(
    new Request(`https://example.test/ghost/pick?slots=thor&mode=random&anon=${anon}`),
    pickEnv(7),
  );
  const randomBody = await randomResponse.json();
  assert.equal(randomBody.epoch, GHOST_SHARE_EPOCH);
  assert.equal(randomBody.items[0].poolSize, 7);

  const topResponse = await handleGhostRequest(
    new Request(`https://example.test/ghost/pick?slots=thor&mode=top&anon=${anon}`),
    pickEnv(10),
  );
  const topBody = await topResponse.json();
  assert.equal(topBody.items[0].poolSize, 2); // ceil(10 × 上位20%)
});

const feedbackRequest = (eventId = 'event-fixed-00000001') => new Request('https://example.test/ghost/feedback', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Ghost-Anon': '11111111-1111-4111-8111-111111111111' },
  body: JSON.stringify({
    anonId: '11111111-1111-4111-8111-111111111111',
    fixedGuardianId: 'hatsune',
    slot: 'miguel',
    liked: true,
    eventId,
  }),
});

const fixedFeedbackEnv = (duplicate = false) => {
  const calls = [];
  return {
    calls,
    env: {
      GHOST_DB: {
        prepare(sql) {
          const statement = {
            bind(...params) {
              calls.push({ sql, params });
              return statement;
            },
            async first() {
              if (sql.includes('ghost_feedback_receipts')) {
                return duplicate ? null : { client_event_id: 'event-fixed-00000001' };
              }
              return null;
            },
            async run() { return { success: true }; },
          };
          return statement;
        },
      },
    },
  };
};

test('fixed guardians accept idempotent per-boss feedback', async () => {
  const first = fixedFeedbackEnv(false);
  const response = await handleGhostRequest(feedbackRequest(), first.env);
  assert.equal(response.status, 200);
  assert.equal(first.calls.filter(call => call.sql.includes('fixed_ghost_stats')).length, 1);

  const duplicate = fixedFeedbackEnv(true);
  const duplicateResponse = await handleGhostRequest(feedbackRequest(), duplicate.env);
  const duplicateBody = await duplicateResponse.json();
  assert.equal(duplicateBody.duplicate, true);
  assert.equal(duplicate.calls.filter(call => call.sql.includes('fixed_ghost_stats')).length, 0);
});

test('inbox returns own publish state and global fixed guardian counts', async () => {
  const prepared = [];
  const bound = [];
  const env = {
    GHOST_DB: {
      prepare(sql) {
        const statement = {
          bind(...params) { prepared.push(sql); bound.push(params); return statement; },
        };
        return statement;
      },
      async batch() {
        return [
          { results: [{ slot: 'miguel', used: 3, likes: 2, published: 1 }] },
          { results: [{ event_id: 4, slot: 'miguel', actor_name: 'Alice', liked: 1, created_at: 123 }] },
          { results: [{ guardian_id: 'hatsune', slot: 'miguel', used: 5, likes: 4 }] },
        ];
      },
    },
  };
  const response = await handleGhostRequest(
    new Request('https://example.test/ghost/inbox?anon=11111111-1111-4111-8111-111111111111'),
    env,
  );
  const body = await response.json();
  assert.equal(prepared.length, 3);
  assert.equal(prepared[0].includes('UNION'), true);
  assert.equal(bound[0].length, 10);
  assert.deepEqual(body.items[0], {
    slot: 'miguel', used: 3, likes: 2, published: true,
    recent: [{ name: 'Alice', liked: true, at: 123 }],
  });
  assert.deepEqual(body.fixed[0], { guardianId: 'hatsune', slot: 'miguel', used: 5, likes: 4 });
  assert.equal(body.cursor, 4);
});

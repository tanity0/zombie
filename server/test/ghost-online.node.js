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
  assert.equal(sanitizeSharedProfile(profile('thor'), 'skadi'), null);
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

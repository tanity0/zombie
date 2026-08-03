import assert from 'node:assert/strict';
import test from 'node:test';
import { allowedGhostOriginValue } from '../src/ghost-origin.js';
import {
  GHOST_PROFILE_DEFAULTS,
  sanitizeSharedProfile,
} from '../../shared/ghostSanitize.mjs';

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

import { describe, expect, it } from 'vitest';
import {
  fixedGhostFeedbackTarget, fixedGhostStatKey, ghostGoldMultiplier, ghostNetworkSlotKey,
  remoteGhostFeedbackTarget, selectedGhostMode,
} from './ghostOnline';
import { sanitizeSharedProfile, GHOST_PROFILE_DEFAULTS, GHOST_KNOB_NAMES } from '../../shared/ghostSanitize.mjs';

describe('G6 online guardian rules', () => {
  it('uses the decided skill priority and gold multipliers', () => {
    expect(selectedGhostMode(['guardian-spirit', 'ghost-slayer'])).toBe('own');
    expect(selectedGhostMode(['ghost-helper', 'ghost-slayer'])).toBe('top');
    expect(selectedGhostMode(['ghost-helper'])).toBe('random');
    expect(ghostGoldMultiplier('own')).toBe(0.5);
    expect(ghostGoldMultiplier('random')).toBe(0.7);
    expect(ghostGoldMultiplier('top')).toBe(0.5);
    expect(ghostGoldMultiplier(null)).toBe(1);
  });

  it('keeps network slots inside the server allow-list', () => {
    expect(ghostNetworkSlotKey('giantbat@stage-7')).toBe('giantbat-stage-7');
  });

  it('builds fixed and online feedback targets without mixing them', () => {
    const fixed = fixedGhostFeedbackTarget('hatsune', 'giantbat@stage-2');
    const remote = remoteGhostFeedbackTarget('record-1');
    expect(fixed).toMatchObject({ kind: 'fixed', guardianId: 'hatsune', slot: 'giantbat-stage-2' });
    expect(remote).toMatchObject({ kind: 'remote', recordId: 'record-1' });
    expect(fixed.eventId).toBeTruthy();
    expect(remote.eventId).toBeTruthy();
    expect(fixedGhostStatKey('giantbat-stage-2', 'hatsune')).toBe('giantbat-stage-2:hatsune');
  });

  it('fills all nine knobs and rejects a mismatched boss slot', () => {
    expect(GHOST_KNOB_NAMES).toEqual([
      'reactionMs', 'counterChance', 'preferredDist', 'meleeBias', 'mobility',
      'hitsPerMin', 'subUsesPerMin', 'stationaryFrac', 'approachPerMin',
    ]);
    const raw = {
      v: 1, runs: 1, moveReactions: {}, subStyles: {},
      bossStyles: { thor: { ...GHOST_PROFILE_DEFAULTS, subStyles: {}, at: 1 } },
    };
    const safe = sanitizeSharedProfile(raw, 'thor');
    expect(safe).not.toBeNull();
    expect((safe as { reactionMs?: number } | null)?.reactionMs).toBe(GHOST_PROFILE_DEFAULTS.reactionMs);
    expect(sanitizeSharedProfile(raw, 'skadi')).toBeNull();
  });

  it('sanitizes public guardian comments and keeps them within 25 characters', () => {
    const raw = {
      v: 1, runs: 1, moveReactions: {}, subStyles: {},
      arrivalComment: `援護\u202e${'あ'.repeat(35)}`,
      departureComment: 'またね！',
      bossStyles: { thor: { ...GHOST_PROFILE_DEFAULTS, subStyles: {}, at: 1 } },
    };
    const safe = sanitizeSharedProfile(raw, 'thor') as { arrivalComment?: string; departureComment?: string } | null;
    expect(safe?.arrivalComment).not.toContain('\u202e');
    expect([...(safe?.arrivalComment ?? '')]).toHaveLength(30);
    expect(safe?.departureComment).toBe('またね！');
  });

  it('research/LUNGE_DODGE.md §4-2: 抜け方の要約(lungeStyle)は範囲へ収めて通し、コマ(moveHabits)は通さない', () => {
    const raw = {
      v: 1, runs: 1, moveReactions: {}, subStyles: {},
      lungeStyle: { chance: 1.7, sideFrac: 0.25, leadMs: 9999, n: 6 },
      moveHabits: { 'thor:tsuki-windup': [{ posA: 1, posB: 0, sub: 0, pressOfs: -200, ctxHp: 0, ctxHit: 0, seq: 1, lg: 1 }] },
      bossStyles: { thor: { ...GHOST_PROFILE_DEFAULTS, subStyles: {}, at: 1 } },
    };
    const safe = sanitizeSharedProfile(raw, 'thor') as { lungeStyle?: unknown; moveHabits?: unknown } | null;
    expect(safe?.lungeStyle).toEqual({ chance: 1, sideFrac: 0.25, leadMs: 400, n: 6 });
    expect(safe?.moveHabits).toBeUndefined();
    const bad = sanitizeSharedProfile({ ...raw, lungeStyle: { chance: 'x' } }, 'thor') as { lungeStyle?: unknown } | null;
    expect(bad?.lungeStyle).toBeUndefined();
  });

  it('SAME_ARENA §8-B2: 間合いの癖(meleeSpacing)は v2 だけを範囲へ収めて通し、測れなかった値は null のまま運ぶ', () => {
    const base = {
      v: 1, runs: 1, moveReactions: {}, subStyles: {},
      bossStyles: { thor: { ...GHOST_PROFILE_DEFAULTS, subStyles: {}, at: 1 } },
    };
    const ms = {
      v: 2, n: 12, swingLagMs: 310, reentryPerMin: 9, backStepPx: null, holdBackStepPx: 18,
      swingsPerEpisode: 2.5, preSwingRate: 1.4, swingLeaveRate: 0.2, holdRate: 0.3,
      counterAimRate: null, counterAimOffsetMs: -99999,
    };
    type Safe = { meleeSpacing?: Record<string, unknown> } | null;
    const safe = sanitizeSharedProfile({ ...base, meleeSpacing: ms }, 'thor') as Safe;
    expect(safe?.meleeSpacing).toMatchObject({ v: 2, n: 12, swingLagMs: 310, backStepPx: null, preSwingRate: 1, counterAimRate: null, counterAimOffsetMs: -2000 });
    // v1(測り方に誤りがあった記録)・記録なしは通さない
    expect((sanitizeSharedProfile({ ...base, meleeSpacing: { ...ms, v: undefined } }, 'thor') as Safe)?.meleeSpacing).toBeUndefined();
    expect((sanitizeSharedProfile({ ...base, meleeSpacing: { ...ms, n: 0 } }, 'thor') as Safe)?.meleeSpacing).toBeUndefined();
  });
});

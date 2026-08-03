import { describe, expect, it } from 'vitest';
import { ghostGoldMultiplier, ghostNetworkSlotKey, selectedGhostMode } from './ghostOnline';
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
});

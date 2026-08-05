import { describe, expect, it } from 'vitest';
import { GHOST_DOSSIER_SLOTS } from './ghostDossier';

describe('GHOST_DOSSIER_SLOTS', () => {
  it('contains each playable record slot once', () => {
    const keys = GHOST_DOSSIER_SLOTS.map(slot => slot.slotKey);
    expect(keys).toHaveLength(18);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('does not show the bossless stage 6 or retired EX2 slot', () => {
    const keys = GHOST_DOSSIER_SLOTS.map(slot => slot.slotKey);
    expect(keys).not.toContain('giantbat@stage-6');
    expect(keys).not.toContain('giantbat@stage-ex2');
    expect(keys).toContain('giantbat@stage-7');
    expect(keys).toContain('giantbat@stage-ex1');
  });
});


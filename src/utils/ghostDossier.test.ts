import { describe, expect, it } from 'vitest';
import { GHOST_DOSSIER_SLOTS } from './ghostDossier';

describe('GHOST_DOSSIER_SLOTS', () => {
  it('contains each playable record slot once', () => {
    const keys = GHOST_DOSSIER_SLOTS.map(slot => slot.slotKey);
    // ★アクラシエルは一旦ゲーム内から非表示(社長指示2026-09-29)=18→17。
    expect(keys).toHaveLength(17);
    expect(keys).not.toContain('acrasiel');
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('does not show the bossless stage 6 or retired EX2 slot', () => {
    const keys = GHOST_DOSSIER_SLOTS.map(slot => slot.slotKey);
    expect(keys).not.toContain('giantbat@stage-6');
    expect(keys).not.toContain('giantbat@stage-ex2');
    expect(keys).toContain('giantbat@stage-7');
    // PACING_PUZZLE.md §10-14#10(EXボス「フィル(変異体)」バッチ1): 旧EXボス(giantbat流用)の枠は
    // phillbossへ置換した(順序維持)。
    expect(keys).not.toContain('giantbat@stage-ex1');
    expect(keys).toContain('phillboss@stage-ex1');
  });
});


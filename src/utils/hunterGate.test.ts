import { describe, it, expect } from 'vitest';
import { hunterCinematic, hunterRetreatCinematic, type HunterSceneInput } from './hunterGate';

const calm: HunterSceneInput = { bossChasing: false, bossFightNow: false, redNightActive: false, giantOrReaper: false, attention: false };

describe('hunterGate', () => {
  it('何も無ければ出してよい・退かない', () => {
    expect(hunterCinematic(calm)).toBe(false);
    expect(hunterRetreatCinematic(calm)).toBe(false);
  });
  it('ボスと交戦中は出さない・居るなら退く(社長指示2026-10-06)', () => {
    const s = { ...calm, bossFightNow: true };
    expect(hunterCinematic(s)).toBe(true);
    expect(hunterRetreatCinematic(s)).toBe(true);
  });
  it('アテンションは出現だけ止め、追跡中のハンターは退かせない', () => {
    const s = { ...calm, attention: true };
    expect(hunterCinematic(s)).toBe(true);
    expect(hunterRetreatCinematic(s)).toBe(false);
  });
  it('従来の場面(追われ中/赤い夜/ジャイアント・リーパー)はそのまま', () => {
    for (const k of ['bossChasing', 'redNightActive', 'giantOrReaper'] as const) {
      const s = { ...calm, [k]: true };
      expect(hunterCinematic(s)).toBe(true);
      expect(hunterRetreatCinematic(s)).toBe(true);
    }
  });
});

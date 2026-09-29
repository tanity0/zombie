// ★スリィエルの詠唱1・腕上げ(社長支給2026-09-29)。
import { describe, it, expect } from 'vitest';
import angelTickSrc from './angelBossTick.ts?raw';
import { BOSS_PHASE_SHEETS, bossPhaseFor, bossPhaseFrame, hasAnimSheet } from './enemySheets';

describe('スリィエルの詠唱1', () => {
  const spec = BOSS_PHASE_SHEETS.find(s => s.name === 'suriel-cast1')!;
  it('環を操る2技の州がこのシートを引き(薙ぎ・凝視は引かない)、州名は台本に実在する', () => {
    for (const st of ['ring-move-windup', 'ring-beam-windup', 'ring-active', 'ring-recover', 'ring-spin-windup', 'ring-spin', 'ring-spin-recover']) {
      expect(bossPhaseFor('suriel', st)?.spec.name, st).toBe('suriel-cast1');
      expect(angelTickSrc.includes(`'${st}'`), st).toBe(true);
    }
    for (const st of ['sweep-windup', 'gaze-windup', 'chase']) expect(bossPhaseFor('suriel', st), st).toBeNull();
  });
  it('コマは範囲内・溜めの終わりで掲げ切り、戻りの終わりで下ろし切る', () => {
    for (const ph of spec.phases) for (const f of ph.seq) { expect(f).toBeGreaterThanOrEqual(0); expect(f).toBeLessThan(spec.frames); }
    expect(bossPhaseFrame(bossPhaseFor('suriel', 'ring-spin-windup')!.phase, 0.999, 0, 90)).toBe(12);
    expect(bossPhaseFrame(bossPhaseFor('suriel', 'ring-recover')!.phase, 0.999, 0, 90)).toBe(0);
  });
  it('★待機のシートが無くても「手で描いた絵を持つ」扱い(=裏ボスの置き方・ミラーの対象)', () => {
    expect(hasAnimSheet('suriel')).toBe(true);
  });
});

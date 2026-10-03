// ★スリィエルの詠唱1・腕上げ(社長支給2026-09-29)。
import { describe, it, expect } from 'vitest';
import angelTickSrc from './angelBossTick.ts?raw';
import { BOSS_PHASE_SHEETS, bossPhaseFor, bossPhaseFrame, bossReleaseFrame, hasAnimSheet } from './enemySheets';

describe('スリィエルの詠唱1', () => {
  const spec = BOSS_PHASE_SHEETS.find(s => s.name === 'suriel-cast1')!;
  it('環を操る2技の州がこのシートを引き(薙ぎ・凝視は引かない)、州名は台本に実在する', () => {
    for (const st of ['ring-move-windup', 'ring-beam-windup', 'ring-active', 'ring-recover', 'ring-spin-windup', 'ring-spin', 'ring-spin-recover']) {
      expect(bossPhaseFor('suriel', st)?.spec.name, st).toBe('suriel-cast1');
      expect(angelTickSrc.includes(`'${st}'`), st).toBe(true);
    }
    for (const st of ['sweep-windup', 'chase']) expect(bossPhaseFor('suriel', st), st).toBeNull();
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

describe('スリィエルの詠唱2(凝視)', () => {
  it('凝視の溜め・硬直の両方がこのシートを引き、同じ group(=10連射を1本で流す)', () => {
    for (const st of ['gaze-windup', 'gaze-recover']) {
      const hit = bossPhaseFor('suriel', st)!;
      expect(hit.spec.name, st).toBe('suriel-cast2');
      expect(hit.phase.group).toBe('gaze');
      expect(angelTickSrc.includes(`'${st}'`), st).toBe(true);
    }
  });
  it('★最初の溜めで腕を開き(0→8)、1発目と同時に眼が光る姿(9)、以後は 9〜15 を往復して振りかぶり直さない', () => {
    const ph = bossPhaseFor('suriel', 'gaze-windup')!.phase;
    expect(bossReleaseFrame(ph, 0, 0, 90)).toBe(0);
    expect(bossReleaseFrame(ph, 0.999, 0, 90)).toBe(8);
    expect(bossReleaseFrame(ph, null, 0, 90)).toBe(9);
    for (let t = 0; t < 4000; t += 37) expect(bossReleaseFrame(ph, null, t, 90)).toBeGreaterThanOrEqual(9);
    const seq = Array.from({ length: 14 }, (_, k) => bossReleaseFrame(ph, null, k * 90 + 1, 90));
    expect(seq).toEqual([9, 10, 11, 12, 13, 14, 15, 14, 13, 12, 11, 10, 9, 10]);
  });
});

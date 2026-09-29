// ★ラフィの飛び掛かりのシート(社長支給2026-09-29「ジャンプ幅は入ってないので考慮して」)。
import { describe, it, expect } from 'vitest';
import angelTickSrc from './angelBossTick.ts?raw';
import { BOSS_PHASE_SHEETS, ENEMY_FRAME_OFFSETS, ENEMY_IDLE_BODY_H, bossPhaseFor, bossPhaseFrame } from './enemySheets';

describe('ラフィの飛び掛かり', () => {
  const spec = BOSS_PHASE_SHEETS.find(s => s.name === 'rafi-leap')!;
  it('溜め・滞空・硬直の3州がこのシートを引き、州名は台本に実在する', () => {
    for (const st of ['jump-windup', 'jump-attack', 'jump-recover']) {
      expect(bossPhaseFor('rafi', st)?.spec.name, st).toBe('rafi-leap');
      expect(angelTickSrc.includes(`'${st}'`), st).toBe(true);
    }
    expect(bossPhaseFor('rafi', 'chase')).toBeNull();
  });
  it('コマは範囲内・待機と同じ bodyH(=1ドットの大きさが同じ)・胴のずらしは持たない(全コマ枠の中央)', () => {
    for (const ph of spec.phases) for (const f of ph.seq) { expect(f).toBeGreaterThanOrEqual(0); expect(f).toBeLessThan(spec.frames); }
    expect(spec.bodyH).toBe(ENEMY_IDLE_BODY_H.rafi);
    expect(ENEMY_FRAME_OFFSETS['rafi-leap']).toBeUndefined();
  });
  it('★浮くのは滞空の州だけ。着地(硬直の頭)で回転斬り(8)が出る', () => {
    for (const ph of spec.phases) expect(ph.lift !== undefined, ph.state).toBe(ph.state === 'jump-attack');
    const rec = bossPhaseFor('rafi', 'jump-recover')!.phase;
    expect(bossPhaseFrame(rec, 0, 0, 90)).toBe(8);
    expect(bossPhaseFrame(rec, 0.999, 0, 90)).toBe(15);
    const air = bossPhaseFor('rafi', 'jump-attack')!.phase;
    expect(bossPhaseFrame(air, 0, 0, 90)).toBe(3);   // 跳び上がり
    const wind = bossPhaseFor('rafi', 'jump-windup')!.phase;
    expect(bossPhaseFrame(wind, 0.999, 0, 90)).toBe(2); // 屈み切ったまま踏み切りへ
  });
});

// ★馬乗り(変異)の攻撃のシート(社長支給2026-09-29「馬乗りの攻撃全部」)。
import { describe, it, expect } from 'vitest';
import bountyTickSrc from './bountyTick.ts?raw';
import { BOSS_PHASE_SHEETS, ENEMY_FRAME_OFFSETS, bossPhaseFor, bossPhaseFrame } from './enemySheets';

describe('馬乗りの攻撃', () => {
  const spec = BOSS_PHASE_SHEETS.find(s => s.name === 'bounty-melee-lash')!;
  it('全技(突進・360度ムチ・3段コンボ・懲罰狙撃)の州がこのシートを引き、州名は台本に実在する', () => {
    for (const ph of spec.phases) expect(bountyTickSrc.includes(`'${ph.state}'`), ph.state).toBe(true);
    for (const st of ['bm-charge-windup', 'bm-charge', 'bm-whip360-windup', 'bm-whip360', 'bm-charge-recover',
      'bm-combo1-windup', 'bm-combo2-windup', 'bm-combo3-windup', 'bm-combo1-recover', 'bm-combo2-recover', 'bm-combo3-recover',
      'bm-snipe-windup', 'bm-snipe', 'bm-snipe-recover']) {
      expect(bossPhaseFor('bounty-melee', st)?.spec.name, st).toBe('bounty-melee-lash');
    }
  });
  it('コマは範囲内・体の位置のずらしはコマ数ぶん', () => {
    for (const ph of spec.phases) for (const f of ph.seq) { expect(f).toBeGreaterThanOrEqual(0); expect(f).toBeLessThan(spec.frames); }
    expect(ENEMY_FRAME_OFFSETS['bounty-melee-lash']?.length).toBe(spec.frames);
  });
  it('★コンボ・狙撃は当たる瞬間(溜め明け=硬直の頭)に打ち出しのコマ(2)', () => {
    for (const st of ['bm-combo1-recover', 'bm-combo2-recover', 'bm-combo3-recover', 'bm-snipe', 'bm-snipe-recover']) {
      expect(bossPhaseFrame(bossPhaseFor('bounty-melee', st)!.phase, 0, 0, 90), st).toBe(2);
    }
  });
});

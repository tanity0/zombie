// 社長指示v0.25.3280「グラヴィティはボスも減速させて」の判定部。
// bossSlowMult は全ボス移動経路(城ボス/天使/追跡式)の共通チョークなので、ここの真偽が
// そのまま「全ボスに効く/効かない」になる。クリ減速との合成(強い方だけ)も固定する。
import { describe, it, expect } from 'vitest';
import { bossSlowMult } from './gameStore';
import { GRAVITY_SHOT_BOSS_SLOW_MULT } from '../utils/skillEffectsB7';
import type { Enemy } from '../types/game';

const enemyWith = (fields: Partial<Enemy>): Enemy => ({ ...(fields as Enemy) });

describe('bossSlowMult × グラビティ減速(v0.25.3280)', () => {
  it('gravitySlowUntil が生きている間は半減(0.5)', () => {
    const e = enemyWith({ gravitySlowUntil: 1000 });
    expect(bossSlowMult(e, 999)).toBe(GRAVITY_SHOT_BOSS_SLOW_MULT);
  });

  it('窓が切れたら1(無改変)', () => {
    const e = enemyWith({ gravitySlowUntil: 1000 });
    expect(bossSlowMult(e, 1000)).toBe(1);
    expect(bossSlowMult(enemyWith({}), 0)).toBe(1);
  });

  it('クリ減速と重なったら強い方だけ(乗算で1/4にしない)', () => {
    const e = enemyWith({ gravitySlowUntil: 1000, bossSlowUntil: 1000 });
    expect(bossSlowMult(e, 500)).toBe(Math.min(GRAVITY_SHOT_BOSS_SLOW_MULT, 0.5));
    expect(bossSlowMult(e, 500)).toBeGreaterThanOrEqual(0.5 * GRAVITY_SHOT_BOSS_SLOW_MULT + 0.001);
  });

  it('クリ減速だけの従来挙動は不変', () => {
    const e = enemyWith({ bossSlowUntil: 1000 });
    expect(bossSlowMult(e, 500)).toBe(0.5);
    expect(bossSlowMult(e, 1500)).toBe(1);
  });

  // 社長裁定v0.25.3280: アイスのボス解禁。ボスだけbossSlowMultが読む(通常敵はiceSlowMult側=排他)。
  it('ボスのアイス鈍足はbossSlowMultで効く(pctは適用側で半減済みの値)', () => {
    const boss = enemyWith({ type: 'giantbat', iceSlowUntil: 1000, iceSlowPct: 0.2 });
    expect(bossSlowMult(boss, 500)).toBeCloseTo(0.8);
    expect(bossSlowMult(boss, 1500)).toBe(1);
  });

  it('通常敵のiceSlowUntilはbossSlowMultでは読まない(iceSlowMultとの二重掛け防止)', () => {
    const zombie = enemyWith({ type: 'zombie', iceSlowUntil: 1000, iceSlowPct: 0.4 });
    expect(bossSlowMult(zombie, 500)).toBe(1);
  });
});

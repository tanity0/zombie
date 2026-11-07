import { describe, it, expect } from 'vitest';
import { meleeKnockbackSpeed, MOVING_MELEE_KB_MULT, KNOCKBACK_SPEED } from './gameStore';

// 社長指示2026-11-07「移動近接の場合、敵のノックバック距離をもう少し伸ばす」。
describe('移動近接(走りで踏み込んだ振り)のノックバック', () => {
  it('止まって振った時は従来どおり(密着で満額・縁で半分)', () => {
    expect(meleeKnockbackSpeed(1, false, false)).toBeCloseTo(KNOCKBACK_SPEED);
    expect(meleeKnockbackSpeed(0, false, false)).toBeCloseTo(KNOCKBACK_SPEED * 0.5);
  });
  it('移動近接は同じ位置関係で MOVING_MELEE_KB_MULT 倍(飛距離も同じ倍率)・スラッシャーの強制ノックバックにも掛かる', () => {
    expect(MOVING_MELEE_KB_MULT).toBeGreaterThan(1);
    for (const f of [0, 0.5, 1]) expect(meleeKnockbackSpeed(f, false, true)).toBeCloseTo(meleeKnockbackSpeed(f, false, false) * MOVING_MELEE_KB_MULT);
    expect(meleeKnockbackSpeed(0.5, true, true)).toBeCloseTo(meleeKnockbackSpeed(0.5, true, false) * MOVING_MELEE_KB_MULT);
  });
});

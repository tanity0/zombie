import { describe, it, expect } from 'vitest';
import { computeEffectiveMoveSpeed, type EffectiveMoveSpeedInput } from './playerMoveSpeed';

const base: EffectiveMoveSpeedInput = {
  dashOverrideSpeed: null,
  slidingSpeed: null,
  reloading: false,
  reloadMoveSpeedMult: 1,
  playerSpeed: 87,
  skaterActive: false,
  bonusMult: 1,
  rampFrac: 1,
  trapDebuffed: false,
  pvpMult: 1,
};

describe('computeEffectiveMoveSpeed — movePlayerの速度合成(移設のみ・挙動不変)', () => {
  it('素の足(バフ無し)はplayerSpeedそのまま', () => {
    expect(computeEffectiveMoveSpeed(base)).toBe(87);
  });

  it('dashOverrideSpeedが最優先(スケーター/ランプ/リロード等の他バフを無視)', () => {
    expect(computeEffectiveMoveSpeed({
      ...base, dashOverrideSpeed: 999, skaterActive: true, bonusMult: 5,
    })).toBe(999);
  });

  it('PvP減速だけはdashOverride中も一律で掛かる(下の別テストで明示検証)', () => {
    expect(computeEffectiveMoveSpeed({ ...base, dashOverrideSpeed: 999, pvpMult: 0.1 })).toBeCloseTo(99.9, 6);
  });

  it('slidingSpeedはdashOverrideの次点', () => {
    expect(computeEffectiveMoveSpeed({ ...base, slidingSpeed: 420 })).toBe(420);
    expect(computeEffectiveMoveSpeed({ ...base, dashOverrideSpeed: 10, slidingSpeed: 420 })).toBe(10);
  });

  it('スケーター搭乗は×3(ランプ対象外)', () => {
    expect(computeEffectiveMoveSpeed({ ...base, skaterActive: true })).toBe(87 * 3);
  });

  it('ランプ途中(rampFrac<1)はbonusMultの一部だけ乗る', () => {
    // rampedBonus(p, frac) = 1 + (p-1)*frac。bonusMult=1.5, frac=0.5 → 1.25倍。
    const v = computeEffectiveMoveSpeed({ ...base, bonusMult: 1.5, rampFrac: 0.5 });
    expect(v).toBeCloseTo(87 * 1.25, 6);
  });

  it('ランプ満タン(rampFrac=1)はbonusMultをそのまま乗せる', () => {
    const v = computeEffectiveMoveSpeed({ ...base, bonusMult: 1.5, rampFrac: 1 });
    expect(v).toBeCloseTo(87 * 1.5, 6);
  });

  it('リロード中はreloadMoveSpeedMultを掛ける(既定1=無変化)', () => {
    expect(computeEffectiveMoveSpeed({ ...base, reloading: true, reloadMoveSpeedMult: 1 })).toBe(87);
    expect(computeEffectiveMoveSpeed({ ...base, reloading: true, reloadMoveSpeedMult: 0.5 })).toBe(87 * 0.5);
  });

  it('トラップ頭打ち: バフ込みの値がplayerSpeedを超えるならplayerSpeedへクランプ', () => {
    const v = computeEffectiveMoveSpeed({ ...base, bonusMult: 2, trapDebuffed: true });
    expect(v).toBe(87); // min(87*2, 87) = 87
  });

  it('トラップ頭打ち: バフがplayerSpeed未満(リロード減速等)ならそのまま(minなので下振れは残る)', () => {
    const v = computeEffectiveMoveSpeed({ ...base, reloading: true, reloadMoveSpeedMult: 0.5, trapDebuffed: true });
    expect(v).toBe(87 * 0.5);
  });

  it('PvP減速は最後に一律で掛かる(dashOverride/sliding含む全経路)', () => {
    expect(computeEffectiveMoveSpeed({ ...base, pvpMult: 0.5 })).toBe(43.5);
    expect(computeEffectiveMoveSpeed({ ...base, dashOverrideSpeed: 100, pvpMult: 0.5 })).toBe(50);
  });
});

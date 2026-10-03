// UNIQUE_WEAPONS.md §16-2「デュアルレンジピストル」のヒステリシス純関数。
import { describe, it, expect } from 'vitest';
import {
  resolveDualRangeMode, DUAL_RANGE_NEAR_ENTER_PX, DUAL_RANGE_FAR_ENTER_PX, DUAL_RANGE_STATS,
} from './dualRangeGun';

describe('resolveDualRangeMode(近↔遠のヒステリシス・§16-2)', () => {
  it('境界値: 120px以下(近へ入る)', () => {
    expect(DUAL_RANGE_NEAR_ENTER_PX).toBe(120);
    expect(resolveDualRangeMode('far', 120)).toBe('near');
    expect(resolveDualRangeMode('far', 0)).toBe('near');
  });

  it('境界値: 180px以上(遠へ戻る)', () => {
    expect(DUAL_RANGE_FAR_ENTER_PX).toBe(180);
    expect(resolveDualRangeMode('near', 180)).toBe('far');
    expect(resolveDualRangeMode('near', 999)).toBe('far');
  });

  it('120px〜180pxの間(境界の外側)は現在のモードを維持する=震えない', () => {
    expect(resolveDualRangeMode('near', 150)).toBe('near'); // 近のまま
    expect(resolveDualRangeMode('far', 150)).toBe('far');   // 遠のまま
    expect(resolveDualRangeMode('near', 121)).toBe('near');
    expect(resolveDualRangeMode('far', 179)).toBe('far');
  });

  it('遠から近づいても、まだ120pxを切っていなければ遠のまま', () => {
    expect(resolveDualRangeMode('far', 121)).toBe('far');
  });

  it('近から離れても、まだ180pxに達していなければ近のまま', () => {
    expect(resolveDualRangeMode('near', 179)).toBe('near');
  });

  it('DUAL_RANGE_STATS: 近は軽く速い(damage14/cd260)・遠は重く遅い(damage28/cd700)', () => {
    expect(DUAL_RANGE_STATS.near.damage).toBeLessThan(DUAL_RANGE_STATS.far.damage);
    expect(DUAL_RANGE_STATS.near.cooldown).toBeLessThan(DUAL_RANGE_STATS.far.cooldown);
    expect(DUAL_RANGE_STATS.near.projectileSpeed).toBeLessThan(DUAL_RANGE_STATS.far.projectileSpeed);
  });
});

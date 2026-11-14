import { describe, it, expect } from 'vitest';
import { xpPickupsOverCap, XP_PICKUP_CAP } from './xpPickupCap';

const orb = (id: string, x: number, y = 0, type = 'experience') => ({ id, x, y, type });

describe('経験値の玉の上限(2026-10-24「上限越えたら消そう」)', () => {
  it('上限以下なら何も消さない', () => {
    const ps = Array.from({ length: XP_PICKUP_CAP }, (_, i) => orb(`o${i}`, i));
    expect(xpPickupsOverCap(ps, 0, 0)).toEqual([]);
  });
  it('超えた分だけ、プレイヤーからいちばん遠い玉から消す', () => {
    const ps = [orb('near', 10), orb('far', 900), orb('mid', 300)];
    expect(xpPickupsOverCap(ps, 0, 0, 2)).toEqual(['far']);
    expect(xpPickupsOverCap(ps, 0, 0, 1)).toEqual(['far', 'mid']);
  });
  it('経験値の玉以外(弾・回復・箱など)は数えず消さない', () => {
    const ps = [orb('ammo', 5000, 0, 'ammo-rifle'), orb('a', 10), orb('b', 20), orb('c', 30)];
    const out = xpPickupsOverCap(ps, 0, 0, 2);
    expect(out).toEqual(['c']);
    expect(out).not.toContain('ammo');
  });
});

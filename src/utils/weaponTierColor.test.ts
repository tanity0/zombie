import { describe, it, expect } from 'vitest';
import { weaponTierStyle, weaponSlotClass } from './weaponTierColor';

describe('weaponTierColor(武器スロットの段の色)', () => {
  it('★段ごとに違う色になる(1〜5が全部別)', () => {
    const bases = [1, 2, 3, 4, 5].map(t => weaponTierStyle(t).base);
    expect(new Set(bases).size).toBe(5);
  });
  it('★梯子は 銀→青→金 (ゲーム内の他の表記と同じ言語)', () => {
    expect(weaponTierStyle(1).base).toContain('slate');
    expect(weaponTierStyle(2).base).toContain('sky');
    expect(weaponTierStyle(3).base).toContain('amber');
  });
  it('ティアが無い武器は従来の紫のまま(勝手に段を作らない)', () => {
    expect(weaponTierStyle(undefined).base).toContain('purple');
    expect(weaponTierStyle(null).base).toContain('purple');
    expect(weaponTierStyle(99).base).toContain('purple');
    expect(weaponTierStyle(0).base).toContain('purple');
  });
  it('選択中 > 弾切れ > 平常 の順で決まる', () => {
    expect(weaponSlotClass(2, true, true)).toBe(weaponTierStyle(2).active);
    expect(weaponSlotClass(2, false, true)).toBe(weaponTierStyle(2).dry);
    expect(weaponSlotClass(2, false, false)).toBe(weaponTierStyle(2).base);
  });
  it('選択中はどの段も輪郭(ring)が付く=選ばれていることが色に依らず分かる', () => {
    for (const t of [1, 2, 3, 4, 5]) expect(weaponTierStyle(t).active).toContain('ring-1');
  });
});

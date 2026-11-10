import { describe, it, expect } from 'vitest';
import { subWeaponBlurb, SUB_BLURB_BY_DEVICE } from './subWeaponBlurbs';

// research/PC_SUPPORT.md §11-6: 「フリック」等のスマホの言葉を PC・パッドに出さない(チュートリアルの pcLines/padLines と同じ考え方)。
describe('subWeaponBlurb(機器ごとの一言)', () => {
  it('スマホ(既定)の文は変えない', () => {
    expect(subWeaponBlurb('katana')).toBe('刀で自動で斬る。銃と他のサブウェポンは使えない。フリックで無敵の突進斬り');
    expect(subWeaponBlurb('wire-anchor', 'touch')).toBe('フリックした方向へワイヤーを撃ち、刺さった所へ無敵で飛ぶ');
  });
  it('PC・パッドの文にはスマホの操作の言葉が無い', () => {
    for (const k of ['katana', 'wire-anchor'] as const) {
      for (const d of ['mouse', 'pad'] as const) {
        const t = subWeaponBlurb(k, d);
        expect(t).not.toMatch(/フリック|指|タップ/);
      }
      expect(subWeaponBlurb(k, 'mouse')).toMatch(/右クリック/);
      expect(subWeaponBlurb(k, 'pad')).not.toMatch(/クリック/);
    }
  });
  it('PC の文を持つ物は、パッドの文も必ず持つ(パッドに「クリック」を出さない)', () => {
    expect(Object.keys(SUB_BLURB_BY_DEVICE.pad).sort()).toEqual(Object.keys(SUB_BLURB_BY_DEVICE.pc).sort());
  });
  it('機器ごとの文が無い物は、どの機器でもスマホの文', () => {
    expect(subWeaponBlurb('dog', 'mouse')).toBe(subWeaponBlurb('dog'));
    expect(subWeaponBlurb('dog', 'pad')).toBe(subWeaponBlurb('dog'));
  });
  it('格闘中に止まるのは銃だけ(v0.25.5428)=格闘の一言は「銃は使えない」', () => {
    expect(subWeaponBlurb('brawler')).toContain('銃は使えない');
    expect(subWeaponBlurb('brawler')).not.toContain('サブウェポンは使えない');
  });
});

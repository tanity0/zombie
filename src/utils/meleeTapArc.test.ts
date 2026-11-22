import { describe, expect, it } from 'vitest';
import { meleeTapArcVisible } from './meleeTapArc';

describe('meleeTapArcVisible', () => {
  it('刀を持っていればタップの振りに斬撃の弧を出さない', () => {
    expect(meleeTapArcVisible(['katana'])).toBe(false);
    expect(meleeTapArcVisible(['katana', 'striker-hunting'])).toBe(false);
  });
  it('村雨を持っていれば出さない(刀と併せ持つ場合も)', () => {
    expect(meleeTapArcVisible(['murasame'])).toBe(false);
    expect(meleeTapArcVisible(['katana', 'murasame'])).toBe(false);
  });
  it('刀以外の近接(ナイフ・鞭・格闘など)は今まで通り出す', () => {
    expect(meleeTapArcVisible([])).toBe(true);
    expect(meleeTapArcVisible(['brawler'])).toBe(true);
    expect(meleeTapArcVisible(['drone-boomerang', 'flare-gun'])).toBe(true);
    expect(meleeTapArcVisible(undefined)).toBe(true);
  });
});

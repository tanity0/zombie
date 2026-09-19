import { describe, it, expect } from 'vitest';
import { addBakedTexture, bakedTextureText } from './renderStats';

// 焼いたテクスチャの計測(v0.25.4375)。落ちる直前の行に出す数字なので、
// 「捨てた分が引かれる」「MBの換算が幅×高さ×4」だけは機械で固定しておく。
describe('bakedTextureText', () => {
  it('幅×高さ×4バイトで数え、種類ごとに内訳へ入る', () => {
    addBakedTexture('rim', 1024 * 768);      // = 3MB
    addBakedTexture('shadow', 512 * 512);    // = 1MB
    const t = bakedTextureText();
    expect(t).toContain('bake4MB');
    expect(t).toContain('縁3');
    expect(t).toContain('影1');
    expect(t).toContain('2枚');
  });

  it('捨てた分(sign=-1)は引き戻される', () => {
    addBakedTexture('other', 512 * 512);
    const before = bakedTextureText();
    addBakedTexture('other', 512 * 512, -1);
    expect(bakedTextureText()).not.toBe(before);
    expect(bakedTextureText()).toContain('他0');
  });
});

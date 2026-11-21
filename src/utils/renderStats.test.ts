import { describe, it, expect } from 'vitest';
import { addBakedTexture, bakedTextureText, trackBakedTexture, untrackBakedTexture, liveBakedTextures } from './renderStats';

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

// 2026-10-11(社長実機 v0.25.4984 で落ちた時の `bake166MB(縁118…)`): レンダラの作り直しで古い焼きは消えるのに計器から引かれず積み上がっていた。
describe('焼きの台帳(物ごとに数える)', () => {
  it('同じ物を2回載せても1回分・2回外しても1回分しか引かない', () => {
    const before = bakedTextureText();
    const rt = {};
    trackBakedTexture(rt, 'rim', 1024 * 1024); // 4MB
    trackBakedTexture(rt, 'rim', 1024 * 1024);
    expect(liveBakedTextures()).toContain(rt);
    expect(untrackBakedTexture(rt)).toBe(true);
    expect(untrackBakedTexture(rt)).toBe(false);
    expect(bakedTextureText()).toBe(before);
  });
  it('シーンを畳む時に台帳の残りを全部外すと、計器は焼く前に戻る(作り直しを重ねても積み上がらない)', () => {
    const before = bakedTextureText();
    for (let round = 0; round < 3; round++) {
      const made = [{}, {}, {}];
      made.forEach((k, i) => trackBakedTexture(k, i === 0 ? 'rim' : 'shadow', 512 * 512));
      for (const k of liveBakedTextures()) untrackBakedTexture(k);
      expect(bakedTextureText()).toBe(before);
    }
  });
});

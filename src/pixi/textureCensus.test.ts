import { describe, it, expect } from 'vitest';
import { Texture, RenderTexture } from 'pixi.js';
import { installTextureCensus, liveTextureObjects, managedTextureCount, textureCensusText, countLiveSlots, texturePoolMB } from './textureCensus';

describe('textureCensus', () => {
  it('Texture/RenderTexture の生成を1回につき1つ数え、source の差し替えは数えない', () => {
    installTextureCensus();
    installTextureCensus(); // 2回呼んでも二重に差し込まない
    const before = liveTextureObjects();
    expect(before).toBeGreaterThanOrEqual(0);
    const a = new Texture();
    const b = RenderTexture.create({ width: 4, height: 4 });
    expect(liveTextureObjects() - before).toBe(2);
    a.source = b.source; // 差し替え
    expect(liveTextureObjects() - before).toBe(2);
    expect(a.source).toBe(b.source); // 元の setter が効いている
    a.destroy();
    b.destroy(true);
  });
  it('描画器が未登録なら mt は -1', () => {
    expect(managedTextureCount()).toBe(-1);
    expect(textureCensusText()).toMatch(/^txo\d+ mt-1 pool-?\d+$/);
  });
  it('mt は管理表の空き枠(捨てた後に残る null)を数えない(社長実機 v0.25.5917 の mt6608 はほぼ空き枠)', () => {
    expect(countLiveSlots({ a: {}, b: null, c: null, d: {} })).toBe(2);
    expect(countLiveSlots([null, {}, undefined])).toBe(1);
    expect(countLiveSlots({})).toBe(0);
  });
  it('TexturePool の量を MB で返す(数えられない時は -1)', () => {
    expect(texturePoolMB()).toBeGreaterThanOrEqual(-1);
  });
});

// 通常斬撃ヒット炸裂(社長支給35コマ・v0.25.4322)のコマ送り。
import { describe, expect, it } from 'vitest';
import { slashHitFrame, slashHitTexture, SLASH_HIT_FRAMES, SLASH_HIT_MS, SLASH_HIT_FPS } from './slashHitFrames';

describe('コマ送り', () => {
  it('頭は0コマ目、終わりは最後のコマ。尺を過ぎても溢れない', () => {
    expect(slashHitFrame(0)).toBe(0);
    expect(slashHitFrame(1)).toBe(SLASH_HIT_FRAMES - 1);
    expect(slashHitFrame(1.9)).toBe(SLASH_HIT_FRAMES - 1);
    expect(slashHitFrame(-0.5)).toBe(0);
  });
  it('単調に進み、35コマ全部を1回ずつ通る(飛ばさない)', () => {
    const seen = new Set<number>();
    let prev = -1;
    for (let i = 0; i <= 1000; i++) {
      const f = slashHitFrame(i / 1000);
      expect(f).toBeGreaterThanOrEqual(prev);
      prev = f; seen.add(f);
    }
    expect(seen.size).toBe(SLASH_HIT_FRAMES);
  });
  it('テクスチャ名は0埋め2桁で、素材の名前と一致する', () => {
    expect(slashHitTexture(0)).toBe('fx/slash-hit-00');
    expect(slashHitTexture(9)).toBe('fx/slash-hit-09');
    expect(slashHitTexture(34)).toBe('fx/slash-hit-34');
    expect(slashHitTexture(99)).toBe('fx/slash-hit-34'); // 溢れは最後のコマへ丸める
    expect(slashHitTexture(-3)).toBe('fx/slash-hit-00');
  });
  it('尺は**素材の想定fps(60)から導く**。別の数字を持たない(社長指示2026-09-14)', () => {
    expect(SLASH_HIT_FPS).toBe(60);
    expect(SLASH_HIT_MS).toBe(Math.round((SLASH_HIT_FRAMES / SLASH_HIT_FPS) * 1000));
    expect(SLASH_HIT_MS / SLASH_HIT_FRAMES).toBeCloseTo(1000 / 60, 0); // 1コマ ≒ 16.7ms
  });
});

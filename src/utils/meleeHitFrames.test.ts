import { describe, it, expect } from 'vitest';
import { meleeHitFrame, meleeHitTexture, MELEE_HIT_FRAMES, MELEE_HIT_MS } from './meleeHitFrames';

describe('meleeHitFrames', () => {
  it('端を丸める(溢れても落ちない)', () => {
    expect(meleeHitFrame(0)).toBe(0);
    expect(meleeHitFrame(1)).toBe(MELEE_HIT_FRAMES - 1);
    expect(meleeHitFrame(3.5)).toBe(MELEE_HIT_FRAMES - 1);
    expect(meleeHitFrame(-2)).toBe(0);
  });

  it('全コマを1度ずつ通り、戻らない', () => {
    const seen = new Set<number>();
    let prev = -1;
    for (let i = 0; i <= 1000; i++) {
      const f = meleeHitFrame(i / 1000);
      expect(f).toBeGreaterThanOrEqual(prev);
      prev = f; seen.add(f);
    }
    expect(seen.size).toBe(MELEE_HIT_FRAMES);
  });

  it('テクスチャ名は0詰め2桁', () => {
    expect(meleeHitTexture(0)).toBe('fx/melee-hit-00');
    expect(meleeHitTexture(9)).toBe('fx/melee-hit-09');
    expect(meleeHitTexture(14)).toBe('fx/melee-hit-14');
    expect(meleeHitTexture(99)).toBe('fx/melee-hit-14');
    expect(meleeHitTexture(-5)).toBe('fx/melee-hit-00');
  });

  it('★近接は手数が多いので短い(0.4秒未満)', () => {
    expect(MELEE_HIT_MS).toBeLessThan(400);
    expect(MELEE_HIT_MS / MELEE_HIT_FRAMES).toBeLessThan(1000 / 40); // 40fpsより速く送る
  });
});

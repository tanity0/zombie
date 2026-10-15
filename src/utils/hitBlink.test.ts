import { describe, it, expect } from 'vitest';
import { hitBlinkStrength, bloodFlashStrength, HIT_BLINK_TOTAL_MS } from './hitBlink';

describe('点滅(ゾンビの試し)', () => {
  it('被弾フラッシュは 白→消える→もう一度光る→減衰 の2回点滅', () => {
    expect(hitBlinkStrength(10)).toBe(1);
    expect(hitBlinkStrength(80)).toBe(0);
    expect(hitBlinkStrength(120)).toBeCloseTo(0.85);
    expect(hitBlinkStrength(185)).toBeGreaterThan(0);
    expect(hitBlinkStrength(185)).toBeLessThan(0.85);
    expect(hitBlinkStrength(HIT_BLINK_TOTAL_MS)).toBe(0);
    expect(hitBlinkStrength(-5)).toBe(0);
  });
  it('血しぶきは出た瞬間が白、途中で1回だけ明るく', () => {
    expect(bloodFlashStrength(10, 0.02)).toBe(1);
    expect(bloodFlashStrength(200, 0.3)).toBe(0);
    expect(bloodFlashStrength(250, 0.45)).toBeCloseTo(0.7);
    expect(bloodFlashStrength(400, 0.8)).toBe(0);
  });
});

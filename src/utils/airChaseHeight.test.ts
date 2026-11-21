import { describe, it, expect } from 'vitest';
import { airChaseHeightPx } from './airChaseHeight';

describe('airChaseHeightPx(高さに追いつく技の高さ)', () => {
  it('動ける距離の内なら相手の高さに届く', () => {
    expect(airChaseHeightPx(100, 48, 220, 30)).toBeCloseTo(48, 6);
    expect(airChaseHeightPx(0, 60, 220)).toBeCloseTo(60, 6);
  });
  it('届かない時は相手へ向かう向きの途中の高さ(相手の高さ×動ける距離÷相手まで)', () => {
    const h = airChaseHeightPx(300, 400, 250);
    expect(h).toBeCloseTo(400 * 250 / 500, 6); // 200
    expect(h).toBeLessThan(400);
  });
  it('相手が低い・地上なら下限(踵落としは今の決め打ち)', () => {
    expect(airChaseHeightPx(100, 0, 220, 30)).toBe(30);
    expect(airChaseHeightPx(100, 12, 220, 30)).toBe(30);
    expect(airChaseHeightPx(400, 40, 100, 30)).toBe(30); // 届かず途中(40×100/402≈10)が下限より低い → 下限
  });
  it('下限なし(飛び蹴り)の地上の相手は0', () => {
    expect(airChaseHeightPx(150, 0, 220)).toBe(0);
  });
  it('高くなるほど(届く範囲の中で)高さは単調に増える', () => {
    let prev = -1;
    for (let t = 0; t <= 300; t += 10) { const h = airChaseHeightPx(150, t, 220, 30); expect(h).toBeGreaterThanOrEqual(prev); prev = h; }
  });
});

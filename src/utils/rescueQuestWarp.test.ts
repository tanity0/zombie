import { describe, it, expect } from 'vitest';
import { computeWarpLandingPoint, computeWarpFlyinStart } from './rescueQuestWarp';

describe('computeWarpLandingPoint(EVENT_QUEST_DESIGN.md §2-8)', () => {
  it('プレイヤーの反対側・縁寄り(edgeFrac倍の半径)に着地点を置く', () => {
    // プレイヤーが円の東(+x)240pxに居る → 着地点は円の西側(-x方向)。
    const p = computeWarpLandingPoint({ circleX: 0, circleY: 0, radius: 95, playerX: 240, playerY: 0, edgeFrac: 0.75 });
    expect(p.x).toBeCloseTo(-95 * 0.75, 5);
    expect(p.y).toBeCloseTo(0, 5);
  });

  it('着地点はプレイヤーから見て中心よりも遠い(=重ならない)', () => {
    const p = computeWarpLandingPoint({ circleX: 100, circleY: 200, radius: 95, playerX: 340, playerY: 200, edgeFrac: 0.75 });
    const dCenter = Math.hypot(340 - 100, 0);
    const dLand = Math.hypot(340 - p.x, 200 - p.y);
    expect(dLand).toBeGreaterThan(dCenter);
  });

  it('プレイヤーが中心に重なる退化ケースでも有限の点を返す(角度0へフォールバック=反対側のπで着地)', () => {
    const p = computeWarpLandingPoint({ circleX: 50, circleY: 50, radius: 95, playerX: 50, playerY: 50, edgeFrac: 0.75 });
    expect(Number.isFinite(p.x)).toBe(true);
    expect(Number.isFinite(p.y)).toBe(true);
    // フォールバック角0の反対側(+π)=-x方向に着地する。
    expect(p.x).toBeCloseTo(50 - 95 * 0.75, 5);
    expect(p.y).toBeCloseTo(50, 5);
  });

  it('任意角度でも着地点は常に中心からradius*edgeFracの距離', () => {
    for (const ang of [0.3, 1.7, -2.4, 3.0]) {
      const px = 500 + Math.cos(ang) * 300;
      const py = -200 + Math.sin(ang) * 300;
      const p = computeWarpLandingPoint({ circleX: 500, circleY: -200, radius: 95, playerX: px, playerY: py, edgeFrac: 0.75 });
      expect(Math.hypot(p.x - 500, p.y - (-200))).toBeCloseTo(95 * 0.75, 5);
    }
  });
});

describe('computeWarpFlyinStart(EVENT_QUEST_DESIGN.md §2-14「実装マップ」の4:00出現と同じ式)', () => {
  it('着地点からプレイヤーと反対側へちょうどminDistance離れた点を返す', () => {
    const start = computeWarpFlyinStart({ landX: 100, landY: 0, playerX: 0, playerY: 0, minDistance: 460 });
    // プレイヤー(0,0)→着地点(100,0)の方向の延長線上、着地点からさらに460離れた点。
    expect(start.x).toBeCloseTo(560, 5);
    expect(start.y).toBeCloseTo(0, 5);
  });

  it('着地点とプレイヤーが同一点でも有限の点を返す(0除算を起こさない)', () => {
    const start = computeWarpFlyinStart({ landX: 10, landY: 10, playerX: 10, playerY: 10, minDistance: 460 });
    expect(Number.isFinite(start.x)).toBe(true);
    expect(Number.isFinite(start.y)).toBe(true);
  });
});

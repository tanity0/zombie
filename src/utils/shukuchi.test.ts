import { describe, expect, it } from 'vitest';
import {
  SHUKUCHI_INVULN_MS, pickShukuchiTarget, shukuchiChainMult, shukuchiLandingPoint, shukuchiParams, shukuchiWindowOpen,
} from './shukuchi';

describe('縮地(SKILL_BUILD_REDESIGN.md §32)', () => {
  it('Lvごとの射程と窓は社長の表のとおり', () => {
    expect(shukuchiParams(1)).toEqual({ rangePx: 400, windowMs: 2000 });
    expect(shukuchiParams(2)).toEqual({ rangePx: 500, windowMs: 2000 });
    expect(shukuchiParams(3)).toEqual({ rangePx: 600, windowMs: 2500 });
    expect(shukuchiParams(0)).toEqual(shukuchiParams(1));
    expect(shukuchiParams(9)).toEqual(shukuchiParams(3));
    expect(SHUKUCHI_INVULN_MS).toBe(500);
  });
  it('連鎖2発目から+20%ずつ(上限なし)', () => {
    expect(shukuchiChainMult(1)).toBeCloseTo(1.0);
    expect(shukuchiChainMult(2)).toBeCloseTo(1.2);
    expect(shukuchiChainMult(3)).toBeCloseTo(1.4);
    expect(shukuchiChainMult(11)).toBeCloseTo(3.0);
  });
  it('窓は締め切りより前だけ開いている', () => {
    expect(shukuchiWindowOpen(undefined, 100)).toBe(false);
    expect(shukuchiWindowOpen(0, 100)).toBe(false);
    expect(shukuchiWindowOpen(200, 100)).toBe(true);
    expect(shukuchiWindowOpen(200, 200)).toBe(false);
  });
  it('射程内・壁越しでない最寄りを選ぶ。居なければ null', () => {
    const c = [
      { id: 'far', dist: 450, blocked: false },
      { id: 'wall', dist: 100, blocked: true },
      { id: 'near', dist: 200, blocked: false },
    ];
    expect(pickShukuchiTarget(c, 400)?.id).toBe('near');
    expect(pickShukuchiTarget(c, 150)).toBeNull();
    expect(pickShukuchiTarget([], 600)).toBeNull();
  });
  it('着地は相手の帯の最近点から自分の側へ手前', () => {
    const p = shukuchiLandingPoint(0, 0, { x: 300, y: -10, width: 40, height: 20 }, 24);
    expect(p.x).toBeCloseTo(276);
    expect(p.y).toBeCloseTo(0);
    // 帯の中に居る=動かない
    expect(shukuchiLandingPoint(310, 0, { x: 300, y: -10, width: 40, height: 20 }, 24)).toEqual({ x: 310, y: 0 });
    // 相手が手前すぎる(距離<手前)なら自分の位置のまま
    const q = shukuchiLandingPoint(0, 0, { x: 10, y: -10, width: 40, height: 20 }, 24);
    expect(q.x).toBeCloseTo(0);
  });
});

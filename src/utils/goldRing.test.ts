import { describe, it, expect } from 'vitest';
import {
  computeGoldRingDeployPoints, goldRingDeployEase, goldRingCurrentPos, resolveGoldRingLaserDir,
  GOLD_RING_OFFSET_PX, GOLD_RING_ZERO_VEC_EPS, GOLD_RING_COOLDOWN_MS, GOLD_RING_LASER_MS,
  GOLD_RING_PULSE_MS, GOLD_RING_DAMAGE_BY_LEVEL, GOLD_RING_LASER_LEN, GOLD_RING_MAX_AIM_DIST,
} from './goldRing';

describe('数値(UNIQUE_WEAPONS.md §19-2の確定値)', () => {
  it('CD9秒・照射3秒・パルス200ms・レーザー長420=対象最大距離', () => {
    expect(GOLD_RING_COOLDOWN_MS).toBe(9000);
    expect(GOLD_RING_LASER_MS).toBe(3000);
    expect(GOLD_RING_PULSE_MS).toBe(200);
    expect(GOLD_RING_LASER_LEN).toBe(420);
    expect(GOLD_RING_MAX_AIM_DIST).toBe(GOLD_RING_LASER_LEN);
  });
  it('1パルスダメージ=Lv1:6/Lv2:8/Lv3:10(Lvで伸びるのはこれだけ)', () => {
    expect(GOLD_RING_DAMAGE_BY_LEVEL[1]).toBe(6);
    expect(GOLD_RING_DAMAGE_BY_LEVEL[2]).toBe(8);
    expect(GOLD_RING_DAMAGE_BY_LEVEL[3]).toBe(10);
  });
});

describe('computeGoldRingDeployPoints(直交±70pxの2本展開先)', () => {
  it('進行方向が+xなら、直交(法線)は±y方向', () => {
    const [a, b] = computeGoldRingDeployPoints(100, 100, 1, 0);
    expect(a).toEqual({ x: 100, y: 100 + GOLD_RING_OFFSET_PX });
    expect(b).toEqual({ x: 100, y: 100 - GOLD_RING_OFFSET_PX });
  });
  it('進行方向が+yなら、直交は±x方向', () => {
    const [a, b] = computeGoldRingDeployPoints(0, 0, 0, 1);
    expect(a.x).toBeCloseTo(-GOLD_RING_OFFSET_PX, 6);
    expect(b.x).toBeCloseTo(GOLD_RING_OFFSET_PX, 6);
  });
  it('2本はターゲット中心から等距離(offset)で、互いに正反対', () => {
    const target = { x: 50, y: -30 };
    const [a, b] = computeGoldRingDeployPoints(target.x, target.y, 0.6, 0.8); // 非正規化方向でも成立
    const da = Math.hypot(a.x - target.x, a.y - target.y);
    const db = Math.hypot(b.x - target.x, b.y - target.y);
    expect(da).toBeCloseTo(GOLD_RING_OFFSET_PX, 6);
    expect(db).toBeCloseTo(GOLD_RING_OFFSET_PX, 6);
    expect(a.x + b.x).toBeCloseTo(target.x * 2, 6);
    expect(a.y + b.y).toBeCloseTo(target.y * 2, 6);
  });
  it('方向ベクトルが0でも(0.001フォールバック)壊れない', () => {
    const [a, b] = computeGoldRingDeployPoints(0, 0, 0, 0);
    expect(Number.isFinite(a.x)).toBe(true);
    expect(Number.isFinite(a.y)).toBe(true);
    expect(Number.isFinite(b.x)).toBe(true);
    expect(Number.isFinite(b.y)).toBe(true);
  });
});

describe('goldRingDeployEase(加速→減速=ease-in-out・CLAUDE.md「動きの絶対ルール」)', () => {
  it('t=0で0、t=1で1', () => {
    expect(goldRingDeployEase(0)).toBe(0);
    expect(goldRingDeployEase(1)).toBe(1);
  });
  it('t=0.5でちょうど中間(0.5)=対称なease-in-out', () => {
    expect(goldRingDeployEase(0.5)).toBeCloseTo(0.5, 9);
  });
  it('★等速(線形)ではない=序盤は線形より遅く、終盤は線形より速く追いつく(加速→減速)', () => {
    expect(goldRingDeployEase(0.25)).toBeLessThan(0.25); // 立ち上がりはゆっくり(加速中)
    expect(goldRingDeployEase(0.75)).toBeGreaterThan(0.75); // 終盤は追いつく(減速して止まる直前)
  });
  it('範囲外はクランプする(0未満→0、1超→1)', () => {
    expect(goldRingDeployEase(-1)).toBe(0);
    expect(goldRingDeployEase(2)).toBe(1);
  });
  it('単調増加(逆戻りしない)', () => {
    let prev = -Infinity;
    for (let t = 0; t <= 1; t += 0.05) {
      const v = goldRingDeployEase(t);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
});

describe('goldRingCurrentPos(展開中の現在位置=タイムスタンプ駆動、状態を持たない)', () => {
  it('開始時刻ちょうどで始点、終了時刻ちょうどで終点', () => {
    expect(goldRingCurrentPos(0, 0, 100, 200, 1000, 1300, 1000)).toEqual({ x: 0, y: 0 });
    expect(goldRingCurrentPos(0, 0, 100, 200, 1000, 1300, 1300)).toEqual({ x: 100, y: 200 });
  });
  it('中間はease関数を通った位置(線形補間ではない)', () => {
    const mid = goldRingCurrentPos(0, 0, 100, 0, 1000, 1300, 1150); // t=0.5
    expect(mid.x).toBeCloseTo(50, 6); // ease(0.5)=0.5なので中間そのもの
  });
  it('durationが0でも(0除算)壊れない', () => {
    const p = goldRingCurrentPos(0, 0, 100, 0, 1000, 1000, 1000);
    expect(Number.isFinite(p.x)).toBe(true);
  });
});

describe('resolveGoldRingLaserDir(0ベクトルのフォールバック・§19-2b)', () => {
  it('通常: ターゲットへの単位ベクトルを返す', () => {
    const dir = resolveGoldRingLaserDir(0, 0, { x: 100, y: 0 }, 0, -1);
    expect(dir).toEqual({ x: 1, y: 0 });
  });
  it('斜め方向も正しく正規化する', () => {
    const dir = resolveGoldRingLaserDir(0, 0, { x: 30, y: 40 }, 1, 0);
    expect(dir.x).toBeCloseTo(0.6, 6);
    expect(dir.y).toBeCloseTo(0.8, 6);
  });
  it('★対象が金環とほぼ同位置(距離<EPS)なら展開方向へフォールバック', () => {
    const dir = resolveGoldRingLaserDir(100, 100, { x: 100, y: 100 }, 0, 1);
    expect(dir).toEqual({ x: 0, y: 1 });
  });
  it('対象そのものが無い(null)場合も展開方向へフォールバック', () => {
    const dir = resolveGoldRingLaserDir(100, 100, null, 1, 0);
    expect(dir).toEqual({ x: 1, y: 0 });
  });
  it('EPSちょうど未満だけがフォールバック対象(境界確認)', () => {
    const justInside = resolveGoldRingLaserDir(0, 0, { x: GOLD_RING_ZERO_VEC_EPS * 0.5, y: 0 }, 0, 1);
    expect(justInside).toEqual({ x: 0, y: 1 }); // フォールバック
    const justOutside = resolveGoldRingLaserDir(0, 0, { x: GOLD_RING_ZERO_VEC_EPS * 2, y: 0 }, 0, 1);
    expect(justOutside).toEqual({ x: 1, y: 0 }); // ターゲット方向
  });
  it('展開方向も0ベクトルなら(理論上の二重縮退)NaNにならず有限値を返す', () => {
    const dir = resolveGoldRingLaserDir(0, 0, null, 0, 0);
    expect(Number.isFinite(dir.x)).toBe(true);
    expect(Number.isFinite(dir.y)).toBe(true);
  });
});

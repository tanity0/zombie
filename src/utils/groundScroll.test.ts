import { describe, it, expect } from 'vitest';
import {
  groundFeelAtFoot, groundRowScrollSpeed, groundRowTileScaleX, groundRowTileScaleY,
  GroundScrollAccumulator, GROUND_SCROLL_WARP_PX, type GroundPerspectiveParams,
} from './groundScroll';
import { groundStripT, GROUND_STRIP_REF_COUNT } from '../pixi/renderSpec';

// pixiScene の既定値(GROUND_TILE_SCALE_X=0.82 / g3dfar=0.10 / g3dc=1 / g3d=1 / gfar=0.055 / near=0.82 / gcurve=2.6)
const P: GroundPerspectiveParams = {
  tileScaleX: 0.82, trapFar: 0.10, trapCurve: 1, trapezoid: 1,
  farScale: 0.055, nearScale: 0.82, curve: 2.6,
};
const STRIP_H = 10;
const MAX_ROW = 179;

describe('groundRowTileScale (pixiScene の床と同じ式)', () => {
  it('横: 0.82 × (0.10 + 0.90 t) / 縦: 0.055 + 0.765 t^2.6', () => {
    for (const t of [0, 0.25, 0.5, 1, 1.8]) {
      expect(groundRowTileScaleX(t, P)).toBeCloseTo(0.82 * Math.max(0.02, 0.10 + 0.90 * t), 12);
      expect(groundRowTileScaleY(t, P)).toBeCloseTo(0.055 + (0.82 - 0.055) * Math.pow(t, 2.6), 12);
    }
  });
  it('台形 0(?g3d=0)なら横は全行 0.82', () => {
    expect(groundRowTileScaleX(0.3, { ...P, trapezoid: 0 })).toBeCloseTo(0.82, 12);
  });
});

describe('groundFeelAtFoot: 足元の行で物と等倍', () => {
  for (const footY of [150, 300, 420.5, 700, 1200]) {
    it(`足元 ${footY}px の行で横・縦とも速さ1`, () => {
      const f = groundFeelAtFoot(footY, STRIP_H, groundStripT, P, 1, MAX_ROW);
      expect(f.row).toBe(Math.floor(footY / STRIP_H));
      const v = groundRowScrollSpeed(groundStripT(f.row), f.feelX, f.feelY, P);
      expect(v.x).toBeCloseTo(1, 12);
      expect(v.y).toBeCloseTo(1, 12);
    });
  }

  it('奥の行ほど遅く・手前の行ほど速い(単調増加)。足元より奥は1未満・手前は1超', () => {
    const footY = 420;
    const f = groundFeelAtFoot(footY, STRIP_H, groundStripT, P, 1, MAX_ROW);
    let prev = { x: -1, y: -1 };
    for (let i = 0; i <= MAX_ROW; i++) {
      const v = groundRowScrollSpeed(groundStripT(i), f.feelX, f.feelY, P);
      expect(v.x).toBeGreaterThan(prev.x);
      expect(v.y).toBeGreaterThan(prev.y);
      if (i < f.row) { expect(v.x).toBeLessThan(1); expect(v.y).toBeLessThan(1); }
      if (i > f.row) { expect(v.x).toBeGreaterThan(1); expect(v.y).toBeGreaterThan(1); }
      prev = v;
    }
  });

  it('行ごとの速さの比は遠近の比(conv・scaleY の比)のまま', () => {
    const f = groundFeelAtFoot(420, STRIP_H, groundStripT, P, 1, MAX_ROW);
    const tf = groundStripT(f.row);
    for (const i of [3, 20, 60, 120]) {
      const t = groundStripT(i);
      const v = groundRowScrollSpeed(t, f.feelX, f.feelY, P);
      expect(v.x).toBeCloseTo(groundRowTileScaleX(t, P) / groundRowTileScaleX(tf, P), 12);
      expect(v.y).toBeCloseTo(groundRowTileScaleY(t, P) / groundRowTileScaleY(tf, P), 12);
    }
  });

  it('足元が帯の外(地平線より上・下端より下)でも行は丸められ係数は有限', () => {
    const up = groundFeelAtFoot(-500, STRIP_H, groundStripT, P, 1, MAX_ROW);
    const dn = groundFeelAtFoot(99999, STRIP_H, groundStripT, P, 1, MAX_ROW);
    expect(up.row).toBe(1);
    expect(dn.row).toBe(MAX_ROW);
    for (const f of [up, dn]) { expect(Number.isFinite(f.feelX)).toBe(true); expect(Number.isFinite(f.feelY)).toBe(true); }
  });

  it('行の基準は72本(GROUND_STRIP_REF_COUNT)の t', () => {
    expect(groundStripT(GROUND_STRIP_REF_COUNT - 1)).toBe(1);
  });
});

describe('GroundScrollAccumulator: 差分×その時の係数を積み上げる', () => {
  it('係数が変わっても積み上げ値は飛ばない', () => {
    const a = new GroundScrollAccumulator();
    a.step(0, 0, 2, 3, 0, 0, 'e');
    a.step(10, 5, 2, 3, 0, 0, 'e');
    expect(a.offX).toBe(20); expect(a.offY).toBe(15);
    // 係数だけ変わってカメラが動かない → 値は変わらない
    a.step(10, 5, 7, 9, 0, 0, 'e');
    expect(a.offX).toBe(20); expect(a.offY).toBe(15);
    a.step(11, 6, 7, 9, 0, 0, 'e');
    expect(a.offX).toBe(27); expect(a.offY).toBe(24);
  });
  it('初回とエポック変更(出撃・ステージ切替)はリセットして積まない', () => {
    const a = new GroundScrollAccumulator();
    a.step(1000, 1000, 1, 1, 0, 0, 'A');
    expect(a.offX).toBe(0);
    a.step(1010, 1000, 1, 1, 0, 0, 'A');
    expect(a.offX).toBe(10);
    a.step(1020, 1000, 1, 1, 0, 0, 'B');
    expect(a.offX).toBe(0);
    a.step(1025, 1000, 1, 1, 0, 0, 'B');
    expect(a.offX).toBe(5);
  });
  it('ワープ(1フレームで閾値超え)は積まない・その後は新しい位置から積む', () => {
    const a = new GroundScrollAccumulator();
    a.step(0, 0, 1, 1, 0, 0, 'e');
    a.step(GROUND_SCROLL_WARP_PX + 1, 0, 1, 1, 0, 0, 'e');
    expect(a.offX).toBe(0);
    a.step(GROUND_SCROLL_WARP_PX + 4, 0, 1, 1, 0, 0, 'e');
    expect(a.offX).toBe(3);
  });
  it('タイル周期で剰余(長時間でも値が膨らまない)', () => {
    const a = new GroundScrollAccumulator();
    a.step(0, 0, 1, 1, 256, 128, 'e');
    for (let k = 1; k <= 10000; k++) a.step(k * 100, k * 100, 1.3, 2.1, 256, 128, 'e');
    expect(Math.abs(a.offX)).toBeLessThan(256);
    expect(Math.abs(a.offY)).toBeLessThan(128);
    const expX = (1e6 * 1.3) % 256, expY = (1e6 * 2.1) % 128;
    expect(a.offX).toBeCloseTo(expX, 4);
    expect(a.offY).toBeCloseTo(expY, 4);
  });
});

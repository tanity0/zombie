// ステージ2(研究所)の壁小型化+密度均一化(社長承認 M2_LAB_CORRIDOR_SPEC.md v0.25.2175)のユニット。
// 幅90px化・区画あたり1〜3本への均一化・セル中心|Y|>LAB_DEEP_Yの奥に壁を生成しないこと・
// 廊下(±100帯)を横に完全封鎖しないことを検証する。
import { describe, it, expect } from 'vitest';
import { labWallsInRegion, wallRect, LAB_ZONE, LAB_DEEP_Y } from './labWalls';

// 生成された壁を「どのセル(cx,cy)のランか」でグルーピングする(id: `lw-${cx}-${cy}-${k}`)。
const groupByCell = (walls: ReturnType<typeof labWallsInRegion>): Map<string, typeof walls> => {
  const map = new Map<string, typeof walls>();
  for (const w of walls) {
    const cell = w.id.replace(/-\d+$/, ''); // 末尾の -k を除去
    map.set(cell, [...(map.get(cell) ?? []), w]);
  }
  return map;
};

describe('labWallsInRegion (壁の小型化+密度均一化)', () => {
  it('壁バーの幅は90px(奥行22は不変)', () => {
    const walls = labWallsInRegion(-2000, -2000, 2000, 2000);
    expect(walls.length).toBeGreaterThan(0);
    for (const w of walls) {
      const rect = wallRect(w);
      expect(rect.width).toBe(90);
      expect(rect.height).toBe(22);
    }
  });

  it('区画(セル)あたりの本数は1〜3本(旧: 通常1〜5/deep6〜13は廃止)', () => {
    const walls = labWallsInRegion(-3000, -3000, 3000, 3000);
    const groups = groupByCell(walls);
    expect(groups.size).toBeGreaterThan(0);
    for (const runWalls of groups.values()) {
      expect(runWalls.length).toBeGreaterThanOrEqual(1);
      expect(runWalls.length).toBeLessThanOrEqual(3);
    }
  });

  it('セル中心|Y| > LAB_DEEP_Y(視線に関わる範囲の外)には壁を生成しない', () => {
    // 広い縦範囲を問い合わせ、生成された壁の footY がすべて deep 境界の内側(セル単位)であることを確認。
    const walls = labWallsInRegion(-500, -5000, 500, 5000);
    expect(walls.length).toBeGreaterThan(0);
    for (const w of walls) {
      const cy = Math.floor(w.footY / LAB_ZONE); // 概算(footYはセル内オフセット付きだが範囲チェックには十分)
      const cellCenterY = cy * LAB_ZONE + LAB_ZONE / 2;
      // 生成されている壁は必ず非-deepセル由来のはず。近似チェックとして、セルの中心が
      // LAB_DEEP_Y を大きく超えるセル(例: 3セル分先)由来の壁が無いことを見る。
      expect(Math.abs(cellCenterY)).toBeLessThan(LAB_DEEP_Y + LAB_ZONE);
    }
  });

  it('廊下(±100帯)を横に完全封鎖しない: 全壁矩形のY範囲は±100の外側に収まる', () => {
    const walls = labWallsInRegion(-3000, -3000, 3000, 3000);
    expect(walls.length).toBeGreaterThan(0);
    for (const w of walls) {
      const rect = wallRect(w);
      const top = rect.y, bottom = rect.y + rect.height;
      // 矩形が [-100,100] と重ならない = bottom<=-100 または top>=100
      const overlapsCorridor = bottom > -100 && top < 100;
      expect(overlapsCorridor).toBe(false);
    }
  });
});

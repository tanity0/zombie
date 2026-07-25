// ステージ2(研究所)の壁生成の不変条件。
// v0.25.2175: 幅90px化・区画あたりの均一化。v0.25.2222: 遮蔽増量(ラン2本×2〜4本)。
// v0.25.2228(社長指示「壁は歩けるところにだけ沸いて」): **帯の外→帯の中**へ方針転換。
//   帯の外は歩けない=隠れられないため遮蔽として機能していなかった。代わりに「中央に必ず通れる
//   空きレーンが残る」ことを構造で保証し、それをここで機械化する(詰み防止の要)。
import { describe, it, expect } from 'vitest';
import { labWallsInRegion, wallRect, LAB_WALL_Y_LIMIT, LAB_WALL_CLEAR_LANE, LAB_START_SAFE_RADIUS } from './labWalls';

const PLAYER_HITBOX = 28; // src/store/gameStore.ts と同値(依存を持ち込まないため定数で持つ)

// 生成された壁を「どのセル(cx)のランか」でグルーピングする(id: `lw-${cx}-0-${k}`)。
const groupByCell = (walls: ReturnType<typeof labWallsInRegion>): Map<string, typeof walls> => {
  const map = new Map<string, typeof walls>();
  for (const w of walls) {
    const cell = w.id.replace(/-\d+$/, ''); // 末尾の -k を除去
    map.set(cell, [...(map.get(cell) ?? []), w]);
  }
  return map;
};

describe('labWallsInRegion (歩ける帯の中に置く・中央レーンは常に空ける)', () => {
  it('壁バーの幅は90px(奥行22は不変)', () => {
    const walls = labWallsInRegion(-4000, -2000, 4000, 2000);
    expect(walls.length).toBeGreaterThan(0);
    for (const w of walls) {
      const rect = wallRect(w);
      expect(rect.width).toBe(90);
      expect(rect.height).toBe(22);
    }
  });

  it('すべての壁が「歩ける帯」(±100)の内側に収まる(社長指示v0.25.2228)', () => {
    const walls = labWallsInRegion(-6000, -3000, 6000, 3000);
    expect(walls.length).toBeGreaterThan(0);
    for (const w of walls) {
      const rect = wallRect(w);
      expect(rect.y).toBeGreaterThanOrEqual(-LAB_WALL_Y_LIMIT);
      expect(rect.y + rect.height).toBeLessThanOrEqual(LAB_WALL_Y_LIMIT);
    }
  });

  it('中央の空きレーンには絶対に壁が無い=どのXでも必ず通り抜けられる', () => {
    const [laneTop, laneBottom] = LAB_WALL_CLEAR_LANE;
    expect(laneBottom - laneTop).toBeGreaterThanOrEqual(PLAYER_HITBOX); // レーン幅がプレイヤーより広い
    const walls = labWallsInRegion(-6000, -3000, 6000, 3000);
    expect(walls.length).toBeGreaterThan(0);
    for (const w of walls) {
      const rect = wallRect(w);
      const overlapsLane = rect.y + rect.height > laneTop && rect.y < laneBottom;
      expect(overlapsLane).toBe(false);
    }
  });

  it('区画(セル)あたりの本数は最大8本(ラン2本×2〜4本)', () => {
    const walls = labWallsInRegion(-6000, -3000, 6000, 3000);
    const groups = groupByCell(walls);
    expect(groups.size).toBeGreaterThan(0);
    for (const runWalls of groups.values()) {
      expect(runWalls.length).toBeGreaterThan(0);
      expect(runWalls.length).toBeLessThanOrEqual(8);
    }
  });

  it('ランは上下2段に分かれて置かれる(前後に隠れられる)', () => {
    const walls = labWallsInRegion(-6000, -3000, 6000, 3000);
    const ys = [...new Set(walls.map(w => w.footY))];
    expect(ys.some(y => y < LAB_WALL_CLEAR_LANE[0])).toBe(true); // 上段あり
    expect(ys.some(y => y > LAB_WALL_CLEAR_LANE[1])).toBe(true); // 下段あり
  });

  it('スタート地点(原点)付近には壁を出さない=開幕で埋もれない', () => {
    const walls = labWallsInRegion(-3000, -3000, 3000, 3000);
    for (const w of walls) {
      expect(Math.hypot(w.footX, w.footY)).toBeGreaterThanOrEqual(LAB_START_SAFE_RADIUS);
    }
  });

  it('帯から外れた問い合わせ範囲では壁を返さない(カリング)', () => {
    expect(labWallsInRegion(-3000, 500, 3000, 3000)).toHaveLength(0);
    expect(labWallsInRegion(-3000, -3000, 3000, -500)).toHaveLength(0);
  });
});

// ステージ2(研究所)の壁生成の不変条件。
// v0.25.2175: 幅90px化・区画あたりの均一化。v0.25.2222: 遮蔽増量(ラン2本×2〜4本)。
// v0.25.2228(社長指示「壁は歩けるところにだけ沸いて」): **帯の外→帯の中**へ方針転換。
//   帯の外は歩けない=隠れられないため遮蔽として機能していなかった。代わりに「中央に必ず通れる
//   空きレーンが残る」ことを構造で保証し、それをここで機械化する(詰み防止の要)。
import { describe, it, expect } from 'vitest';
import { labWallsInRegion, wallRect, LAB_WALL_Y_LIMIT, LAB_WALL_CLEAR_TOP, LAB_WALL_CLEAR_BOTTOM, LAB_START_SAFE_RADIUS } from './labWalls';

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
  it('壁バーの幅は見た目通りの176px(奥行22は不変・社長指示v0.25.2234)', () => {
    // 描画は containScale(176,108, tex 256×153)=0.6875 → 実描画幅 176px。判定をこれに一致させる。
    const walls = labWallsInRegion(-4000, -2000, 4000, 2000);
    expect(walls.length).toBeGreaterThan(0);
    for (const w of walls) {
      const rect = wallRect(w);
      expect(rect.width).toBe(176);
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

  it('上下の縁の通り道には絶対に壁が無い=どのXでも必ず通り抜けられる(壁は中央寄せ・v0.25.2234)', () => {
    const lanes = [LAB_WALL_CLEAR_TOP, LAB_WALL_CLEAR_BOTTOM];
    for (const [a, b] of lanes) expect(b - a).toBeGreaterThanOrEqual(PLAYER_HITBOX); // レーン幅がプレイヤーより広い
    const walls = labWallsInRegion(-6000, -3000, 6000, 3000);
    expect(walls.length).toBeGreaterThan(0);
    for (const w of walls) {
      const rect = wallRect(w);
      for (const [laneTop, laneBottom] of lanes) {
        const overlapsLane = rect.y + rect.height > laneTop && rect.y < laneBottom;
        expect(overlapsLane).toBe(false);
      }
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

  it('ランは中央をまたぐ上下2段に置かれる(前後に隠れられる)', () => {
    const walls = labWallsInRegion(-6000, -3000, 6000, 3000);
    const ys = [...new Set(walls.map(w => w.footY))];
    expect(ys.some(y => y < 0)).toBe(true); // 中央より上の段
    expect(ys.some(y => y > 0)).toBe(true); // 中央より下の段
    // 中央寄せ=すべて帯の内側3割以内(縁には出ない)
    for (const y of ys) expect(Math.abs(y)).toBeLessThanOrEqual(LAB_WALL_Y_LIMIT * 0.3);
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

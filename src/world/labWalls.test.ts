// ステージ2(研究所)の壁生成の不変条件。
// v0.25.2175: 幅90px化・区画あたりの均一化。v0.25.2222: 遮蔽増量(ラン2本×2〜4本)。
// v0.25.2228(社長指示「壁は歩けるところにだけ沸いて」): **帯の外→帯の中**へ方針転換。
//   帯の外は歩けない=隠れられないため遮蔽として機能していなかった。代わりに「中央に必ず通れる
//   空きレーンが残る」ことを構造で保証し、それをここで機械化する(詰み防止の要)。
import { describe, it, expect } from 'vitest';
import { labWallsInRegion, wallRect, LAB_WALL_Y_LIMIT, LAB_WALL_CLEAR_TOP, LAB_WALL_CLEAR_BOTTOM, LAB_START_SAFE_RADIUS, WALL_HIT_W, WALL_DISPLAY_H, labPropsInRegion, propRect, LAB_COVER_SPACING, labUvBarsInRegion, nudgeToClearLabSpot, LAB_ITEM_Y_LIMIT, LAB_CORRIDOR_Y_LIMIT_PX } from './labWalls';

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
  it('判定幅は「実描画幅」と一致する(社長指示v0.25.2234。表示サイズを変えてもズレない)', () => {
    // 描画は containScale(WALL_DISPLAY_H, tex 256×153)。その実描画幅が WALL_HIT_W = 判定幅。
    const TEX = { w: 256, h: 153 };
    const scale = Math.min(WALL_DISPLAY_H.w / TEX.w, WALL_DISPLAY_H.h / TEX.h);
    expect(WALL_HIT_W).toBe(Math.round(TEX.w * scale));
    const walls = labWallsInRegion(-4000, -2000, 4000, 2000);
    expect(walls.length).toBeGreaterThan(0);
    for (const w of walls) {
      const rect = wallRect(w);
      expect(rect.width).toBe(WALL_HIT_W);
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

// 社長指示v0.25.2243「敵の近くに必ず一つは視界を切る遮蔽物を置く(壁とは別)」の機械化。
// 敵は歩ける帯の中にしか湧かない(placeLabSpawn)ので、「帯上のどの点からも一定距離以内に
// プロップがある」ことを保証すれば、どの敵の近くにも必ず遮蔽がある状態になる。
describe('保証プロップ(敵の近くの遮蔽)', () => {
  it('帯の上のどの位置からも COVER_SPACING 以内に遮蔽プロップがある', () => {
    const props = labPropsInRegion(-6000, -LAB_WALL_Y_LIMIT, 6000, LAB_WALL_Y_LIMIT);
    expect(props.length).toBeGreaterThan(0);
    for (let x = -4000; x <= 4000; x += 137) {
      for (const y of [-LAB_WALL_Y_LIMIT + 20, 0, LAB_WALL_Y_LIMIT - 20]) {
        if (Math.hypot(x, y) < LAB_START_SAFE_RADIUS) continue; // スタート地点付近は対象外(意図的に空ける)
        const near = props.some(p => Math.hypot(p.footX - x, p.footY - y) <= LAB_COVER_SPACING);
        expect(near).toBe(true);
      }
    }
  });

  it('保証プロップの当たり矩形は歩ける帯の中に収まる', () => {
    const props = labPropsInRegion(-6000, -LAB_WALL_Y_LIMIT, 6000, LAB_WALL_Y_LIMIT)
      .filter(p => p.id.startsWith('lpc-'));
    expect(props.length).toBeGreaterThan(0);
    for (const p of props) {
      const r = propRect(p);
      expect(r.y).toBeGreaterThanOrEqual(-LAB_WALL_Y_LIMIT);
      expect(r.y + r.height).toBeLessThanOrEqual(LAB_WALL_Y_LIMIT);
    }
  });
});

// 2026-10-10(社長「アイテムが出るバーをちゃんと移動可能敷地内に」「ゴールも、発生地点が移動不可エリアに入ってたりする」):
// 物を置く点は、歩ける帯の中かつ壁・遮蔽プロップの矩形の外。
describe('歩ける所に置く(UVバー・ゴール)', () => {
  const obstaclesNear = (x: number, y: number) => [
    ...labWallsInRegion(x - 300, y - 300, x + 300, y + 300).map(wallRect),
    ...labPropsInRegion(x - 300, y - 300, x + 300, y + 300).map(propRect),
  ];
  const hits = (r: { x: number; y: number; width: number; height: number }, obs: { x: number; y: number; width: number; height: number }[]) =>
    obs.some(o => r.x < o.x + o.width && r.x + r.width > o.x && r.y < o.y + o.height && r.y + r.height > o.y);

  it('UVバーは全部、歩ける帯の中で、壁・プロップに重ならない', () => {
    const bars = labUvBarsInRegion(-20000, -2000, 20000, 2000);
    expect(bars.length).toBeGreaterThan(40);
    for (const b of bars) {
      expect(Math.abs(b.y), b.id).toBeLessThanOrEqual(LAB_CORRIDOR_Y_LIMIT_PX);
      const r = { x: b.x - 15, y: b.y - 24, width: 30, height: 26 }; // gameStore の breakableProps と同じ矩形
      expect(hits(r, obstaclesNear(b.x, b.y)), b.id).toBe(false);
    }
  });

  it('UVバーは描画と判定が一致する(同じ区画を2回問い合わせても同じ位置)', () => {
    expect(labUvBarsInRegion(3000, -500, 4000, 500)).toEqual(labUvBarsInRegion(3000, -500, 4000, 500));
  });

  it('ゴールの置き場(帯の中のどこでも)を寄せると、壁・プロップの中に入らない', () => {
    for (let i = 0; i < 400; i++) {
      const x = (i % 2 ? 1 : -1) * (6000 + i * 37);
      const y = -30 + ((i * 13) % 60);
      const p = nudgeToClearLabSpot(x, y, 28, 28);
      expect(Math.abs(p.y)).toBeLessThanOrEqual(LAB_ITEM_Y_LIMIT);
      expect(hits({ x: p.x - 14, y: p.y - 14, width: 28, height: 28 }, obstaclesNear(p.x, p.y)), `${x},${y}`).toBe(false);
    }
  });

  it('何も無い所ではその場のまま(動かさない)', () => {
    const p = nudgeToClearLabSpot(0, 0, 28, 28); // 原点はスタートの安全半径=壁もプロップも無い
    expect(p).toEqual({ x: 0, y: 0 });
  });
});

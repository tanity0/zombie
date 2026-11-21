// Deterministic procedural trees, shared by the PixiJS renderer (to draw them)
// and the simulation (to collide with their trunks). Trees are NOT stored as
// entities — they are a pure function of world position, queried per-region for
// drawing or per-point for collision, so the invisible trunk hitboxes always
// line up exactly with the trees that are drawn.
//
// The placement formulas mirror the original renderer hash exactly (cell 220,
// ~35% of cells spawn, ±cell/2 jitter, scale 0.85..1.25, foot pushed down by
// 32*scale).

import { Rect, footRect, resolveAabb } from './obstacles';
import { isObstacleDestroyed } from './destructibles';
import { isInPoiClearing, isClearOfHandPlaced } from './poiClearings';
import { treeArtSize, TREE_ART_MAX } from './artRects';
import {
  CellMemo, MAX_REROLLS, MIN_COLLISION_GAP, bumpPropPlacementVersion, placementFarKey, resolveCellLayer, validFirsts,
  type Footprint, type Individual, type NeighborFirst,
} from './propPlacement';

export const TREE_CELL = 220;

export const treeHash = (x: number, y: number): number => {
  const v = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return v - Math.floor(v);
};

export interface TreeInstance {
  key: string;
  footX: number; // bottom-centre (also the Y-sort key and trunk-collision centre)
  footY: number;
  scale: number;
}

/** 木の絵の矩形(足元から上・遠近を掛ける前の基準寸法=research/PROP_OVERLAP.md §1)。 */
export const treeArtRect = (t: Pick<TreeInstance, 'footX' | 'footY' | 'scale'>, farKey = placementFarKey()): Rect => {
  const a = treeArtSize(farKey);
  return footRect(t.footX, t.footY, a.w * t.scale, a.h * t.scale);
};

type TreeCand = TreeInstance & Footprint;

// The tree individual in the cell whose origin is (cx, cy), or null if that cell is empty.
// 候補0 = 元の式の位置(=今までの木の位置)。候補1〜6 = 重なりすぎた時の選び直し(同じ区画の中・大きさは同じ)。
const treeIndividual = (cx: number, cy: number): Individual<TreeCand> | null => {
  if (treeHash(cx + 13, cy - 7) >= 0.35) return null;
  const scale = 0.85 + treeHash(cx + 5, cy + 23) * 0.4;
  const key = `${cx}_${cy}`;
  const farKey = placementFarKey();
  const cands: (TreeCand | null)[] = [];
  for (let r = 0; r <= MAX_REROLLS; r++) {
    const ox = (r === 0 ? treeHash(cx, cy + 1) : treeHash(cx + 17.3 * r, cy + 1 - 29.1 * r)) - 0.5;
    const oy = (r === 0 ? treeHash(cx + 1, cy) : treeHash(cx + 1 + 41.7 * r, cy - 13.9 * r)) - 0.5;
    const footX = cx + TREE_CELL / 2 + ox * TREE_CELL;
    const footY = cy + TREE_CELL / 2 + oy * TREE_CELL + 32 * scale;
    // Keep the spawn point (world origin) clear so the player never starts
    // trapped inside a trunk.
    // POI(寄り道の建物・武将の祠)の前は空き地(社長指示2026-11-03)。
    if ((Math.abs(footX) < 150 && Math.abs(footY) < 150) || isInPoiClearing(footX, footY)) { cands.push(null); continue; }
    const t = { key, footX, footY, scale };
    cands.push({ ...t, art: treeArtRect(t, farKey), col: trunkRect(t) });
  }
  return { cands, prio: treeHash(cx + 71.3, cy - 53.7), tie: key };
};

const treeUpperOk = (c: TreeCand): boolean => isClearOfHandPlaced(c.art); // 木の上の層は手置きの物だけ

const treeFirstMemo = new CellMemo<NeighborFirst<TreeCand>[]>();
const treeFirsts = (cx: number, cy: number): NeighborFirst<TreeCand>[] =>
  treeFirstMemo.get(`${cx},${cy}`, () => {
    const ind = treeIndividual(cx, cy);
    return ind ? validFirsts([ind], treeUpperOk) : [];
  });

// 区画の木の最終位置(壊される前)。メモ=毎フレームの当たり判定はこれを引くだけ。
const treeCellMemo = new CellMemo<TreeInstance[]>();
const treeCellFinal = (cx: number, cy: number): TreeInstance[] =>
  treeCellMemo.get(`${cx},${cy}`, () => {
    const ind = treeIndividual(cx, cy);
    if (!ind) return [];
    const neighbors: NeighborFirst<TreeCand>[] = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue;
        neighbors.push(...treeFirsts(cx + dx * TREE_CELL, cy + dy * TREE_CELL));
      }
    }
    return resolveCellLayer([ind], neighbors, treeUpperOk).map(c => ({ key: c.key, footX: c.footX, footY: c.footY, scale: c.scale }));
  });

// ステージ5(対変異体防衛本部)は木を出さない(社長指示2026-07-16: 木の代わりに残骸オブジェクト=
// cityProps の STAGE5_PROPS を散布)。ここで空を返すことで、描画(pixiScene)・幹当たり判定
// (resolveTreeCollision)・湧き/配置回避(trunkRect参照系)の全消費箇所が自動で一致して消える
// (destructibles と同じ「world層のモジュール状態」方式)。gameStore.resetGame がラン開始ごとに設定。
let treesDisabled = false;
export const setTreesDisabled = (disabled: boolean): void => {
  if (treesDisabled !== disabled) bumpPropPlacementVersion(); // 下の層(置物・松明・花・水たまり)の避け方が変わる
  treesDisabled = disabled;
};

/**
 * 壊される前の木(区画の原点が範囲に入る物)。下の層が避ける相手・壊す側の候補はこちら
 * (research/PROP_OVERLAP.md §2「壊された物は壊される前の配置で判定する」)。
 */
export const treesInRegionRaw = (
  minX: number, minY: number, maxX: number, maxY: number
): TreeInstance[] => {
  if (treesDisabled) return [];
  const startX = Math.floor(minX / TREE_CELL) * TREE_CELL;
  const startY = Math.floor(minY / TREE_CELL) * TREE_CELL;
  const out: TreeInstance[] = [];
  for (let cx = startX; cx <= maxX; cx += TREE_CELL) {
    for (let cy = startY; cy <= maxY; cy += TREE_CELL) {
      const list = treeCellFinal(cx, cy);
      for (let i = 0; i < list.length; i++) out.push(list[i]);
    }
  }
  return out;
};

// Every tree whose cell origin falls inside the given world rect.
// 裏ボスに踏み潰されて破壊された木は欠番(描画・当たり判定とも同時に消える)。生成キーのみで判定=軽い。
export const treesInRegion = (
  minX: number, minY: number, maxX: number, maxY: number
): TreeInstance[] => {
  const all = treesInRegionRaw(minX, minY, maxX, maxY);
  return all.some(t => isObstacleDestroyed(t.key)) ? all.filter(t => !isObstacleDestroyed(t.key)) : all;
};

/**
 * 絵の矩形 art(と判定の隙間)に届き得る木(壊される前・絵と判定の形つき)。下の層の「上の層を避ける」に使う。
 * 余白 = 木の絵の最大寸法 + 足元のずれ(区画の大きさ)+ 判定の隙間。
 */
export const treeFootprintsNear = (art: Rect): (TreeInstance & Footprint)[] => {
  if (treesDisabled) return [];
  const farKey = placementFarKey();
  const pw = (TREE_ART_MAX.w * 1.25) / 2 + MIN_COLLISION_GAP;
  const ph = TREE_ART_MAX.h * 1.25 + MIN_COLLISION_GAP;
  const list = treesInRegionRaw(art.x - pw - TREE_CELL, art.y - MIN_COLLISION_GAP - TREE_CELL - 40, art.x + art.width + pw, art.y + art.height + ph);
  return list.map(t => ({ ...t, art: treeArtRect(t, farKey), col: trunkRect(t) }));
};

// Trunk collision box — a narrow rectangle following the shared obstacle
// convention: its BOTTOM edge sits on the sprite's foot (footY) and it rises
// over the trunk. Actors can still overlap the canopy (drawn well above) but
// not the trunk.
const TRUNK_W = 16; // at scale 1
// Thin band at the trunk base. Now that every actor's drawn feet sit on its
// hitbox bottom (see renderSpec.playerFootBox), an actor approaching from the
// north stops with its feet right at the trunk base — no per-actor fudge.
const TRUNK_H = 8;
// 見た目を1.5倍にしたのに合わせ、足元判定も拡大(社長指示): 横×1.5 / 縦は上へ×1.2。
const TRUNK_FOOT_W_MULT = 1.5;
const TRUNK_FOOT_H_MULT = 1.2;
export const trunkRect = (t: TreeInstance): Rect =>
  footRect(t.footX, t.footY, TRUNK_W * t.scale * TRUNK_FOOT_W_MULT, TRUNK_H * t.scale * TRUNK_FOOT_H_MULT);

// Rectangle (AABB) collision only. Push `rect` out of any nearby tree trunk and
// return the corrected top-left. One cell of padding covers every reachable
// trunk (jitter stays within a neighbouring cell).
export const resolveTreeCollision = (rect: Rect): { x: number; y: number } => {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const pad = TREE_CELL;
  const trees = treesInRegion(cx - pad, cy - pad, cx + pad, cy + pad);
  return resolveAabb(rect, trees.map(trunkRect));
};

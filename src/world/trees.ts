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

// The tree in the cell whose origin is (cx, cy), or null if that cell is empty.
const treeInCell = (cx: number, cy: number): TreeInstance | null => {
  if (treeHash(cx + 13, cy - 7) >= 0.35) return null;
  const scale = 0.85 + treeHash(cx + 5, cy + 23) * 0.4;
  const ox = (treeHash(cx, cy + 1) - 0.5) * TREE_CELL;
  const oy = (treeHash(cx + 1, cy) - 0.5) * TREE_CELL;
  const footX = cx + TREE_CELL / 2 + ox;
  const footY = cy + TREE_CELL / 2 + oy + 32 * scale;
  // Keep the spawn point (world origin) clear so the player never starts
  // trapped inside a trunk.
  if (Math.abs(footX) < 150 && Math.abs(footY) < 150) return null;
  const key = `${cx}_${cy}`;
  // 裏ボスに踏み潰されて破壊された木は欠番(描画・当たり判定とも同時に消える)。生成キーのみで判定=軽い。
  if (isObstacleDestroyed(key)) return null;
  return { key, footX, footY, scale };
};

// Every tree whose cell origin falls inside the given world rect.
export const treesInRegion = (
  minX: number, minY: number, maxX: number, maxY: number
): TreeInstance[] => {
  const startX = Math.floor(minX / TREE_CELL) * TREE_CELL;
  const startY = Math.floor(minY / TREE_CELL) * TREE_CELL;
  const out: TreeInstance[] = [];
  for (let cx = startX; cx <= maxX; cx += TREE_CELL) {
    for (let cy = startY; cy <= maxY; cy += TREE_CELL) {
      const t = treeInCell(cx, cy);
      if (t) out.push(t);
    }
  }
  return out;
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

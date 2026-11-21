import { Rect, footRect, resolveAabb } from './obstacles';
import { isInPoiClearing, isClearOfHandPlaced } from './poiClearings';
import { treeFootprintsNear } from './trees';
import { cityPropFootprintsNear } from './cityProps';
import { torchArtSize, TORCH_ART_MAX } from './artRects';
import {
  CellMemo, MAX_REROLLS, MIN_COLLISION_GAP, bumpPropPlacementVersion, footprintsConflict, placementFarKey, resolveCellLayer, validFirsts,
  type Footprint, type Individual, type NeighborFirst,
} from './propPlacement';

export const TORCH_CELL = 410; // 密度UP(社長指示・460→410=グリッドを詰める)。出過ぎたら430へ。

export interface TorchInstance {
  id: string;
  footX: number;
  footY: number;
  scale: number;
}

const torchHash = (x: number, y: number): number => {
  const v = Math.sin(x * 91.733 + y * 17.919) * 53117.291;
  return v - Math.floor(v);
};

/** ★v0.25.3595(社長指示「リラックス中は少し松明の出現率アップ」): RELAX中だけ足すしきい値
 *  ボーナス(叩き台)。0.40→0.48=松明セル+2割。world層はstoreを知らないので値は呼び出し側が渡す。 */
export const TORCH_RELAX_BONUS = 0.08;
const TORCH_BASE_CHANCE = 0.40; // 頻度UP(社長指示・出現セル≒30%→40%)。出過ぎたら0.35へ。
/**
 * 置き場所を決める時に「在り得る」とみなす最大のしきい値(RELAX の追加確率込み・research/PROP_OVERLAP.md §2)。
 * 呼び手がボーナスを渡す/渡さないで置かれ方が変わっても、位置と、下の層(花・水たまり)の避け方は変わらない。
 */
const TORCH_MAX_CHANCE = TORCH_BASE_CHANCE + TORCH_RELAX_BONUS;

/** 松明の絵の矩形(台座の箱・ステージ4は焚き火)。 */
export const torchArtRect = (t: Pick<TorchInstance, 'footX' | 'footY' | 'scale'>, farKey = placementFarKey()): Rect => {
  const a = torchArtSize(farKey);
  return footRect(t.footX, t.footY, a.w * t.scale, a.h * t.scale);
};

type TorchCand = TorchInstance & Footprint;

// 区画の松明の個体(最大のしきい値で在り得る物)。候補0 = 元の式の位置。候補1〜6 = 選び直し(同じ区画の中)。
const torchIndividual = (cx: number, cy: number): Individual<TorchCand> | null => {
  if (torchHash(cx + 31, cy - 19) >= TORCH_MAX_CHANCE) return null;
  const scale = 0.78 + torchHash(cx - 11, cy + 29) * 0.22;
  const id = `torch-${cx}_${cy}`;
  const farKey = placementFarKey();
  const cands: (TorchCand | null)[] = [];
  for (let r = 0; r <= MAX_REROLLS; r++) {
    const ox = ((r === 0 ? torchHash(cx, cy + 7) : torchHash(cx + 23.9 * r, cy + 7 - 31.3 * r)) - 0.5) * TORCH_CELL * 0.72;
    const oy = ((r === 0 ? torchHash(cx + 7, cy) : torchHash(cx + 7 - 19.7 * r, cy + 43.1 * r)) - 0.5) * TORCH_CELL * 0.72;
    const footX = cx + TORCH_CELL / 2 + ox;
    const footY = cy + TORCH_CELL / 2 + oy;
    // POIの前は空き地(社長指示2026-11-03)
    if ((Math.abs(footX) < 190 && Math.abs(footY) < 190) || isInPoiClearing(footX, footY)) { cands.push(null); continue; }
    const t = { id, footX, footY, scale };
    cands.push({ ...t, art: torchArtRect(t, farKey), col: torchRect(t) });
  }
  return { cands, prio: torchHash(cx - 57.1, cy + 83.3), tie: id };
};

// 松明の上の層 = 手置きの物・木・置物(デカール以外)。
const torchUpperOk = (c: TorchCand): boolean => {
  if (!isClearOfHandPlaced(c.art)) return false;
  for (const t of treeFootprintsNear(c.art)) if (footprintsConflict(c, t)) return false;
  for (const p of cityPropFootprintsNear(placementFarKey(), c.art)) if (footprintsConflict(c, p)) return false;
  return true;
};

const torchFirstMemo = new CellMemo<NeighborFirst<TorchCand>[]>();
const torchFirsts = (cx: number, cy: number): NeighborFirst<TorchCand>[] =>
  torchFirstMemo.get(`${cx},${cy}`, () => {
    const ind = torchIndividual(cx, cy);
    return ind ? validFirsts([ind], torchUpperOk) : [];
  });

// 区画の松明の最終位置(最大のしきい値で在り得る物)。
const torchCellMemo = new CellMemo<TorchInstance[]>();
const torchCellFinal = (cx: number, cy: number): TorchInstance[] =>
  torchCellMemo.get(`${cx},${cy}`, () => {
    const ind = torchIndividual(cx, cy);
    if (!ind) return [];
    const neighbors: NeighborFirst<TorchCand>[] = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue;
        neighbors.push(...torchFirsts(cx + dx * TORCH_CELL, cy + dy * TORCH_CELL));
      }
    }
    return resolveCellLayer([ind], neighbors, torchUpperOk).map(c => ({ id: c.id, footX: c.footX, footY: c.footY, scale: c.scale }));
  });

// チュートリアル等「松明(=破壊可能プロップ/資材ドロップ源)を一切出さない」ステージ用の一括ゲート
// (setTreesDisabled と同じ流儀・社長指示v0.25.1818「アイテムも何もかも無し」)。
// torchesInRegion が唯一の生成源なので、描画・当たり判定・ドロップ源がこの1点で同時に消える。
let torchesDisabled = false;
export const setTorchesDisabled = (disabled: boolean): void => {
  if (torchesDisabled !== disabled) bumpPropPlacementVersion(); // 下の層(花・水たまり)の避け方が変わる
  torchesDisabled = disabled;
};

const torchCellsInRegion = (
  minX: number, minY: number, maxX: number, maxY: number, chance: number,
): TorchInstance[] => {
  if (torchesDisabled) return [];
  const startX = Math.floor(minX / TORCH_CELL) * TORCH_CELL;
  const startY = Math.floor(minY / TORCH_CELL) * TORCH_CELL;
  const out: TorchInstance[] = [];
  for (let cx = startX; cx <= maxX; cx += TORCH_CELL) {
    for (let cy = startY; cy <= maxY; cy += TORCH_CELL) {
      // 在るかどうかは呼び手のしきい値(位置は最大のしきい値で決めた物=ボーナスの有無で動かない)。
      if (torchHash(cx + 31, cy - 19) >= chance) continue;
      const list = torchCellFinal(cx, cy);
      for (let i = 0; i < list.length; i++) out.push(list[i]);
    }
  }
  return out;
};

export const torchesInRegion = (
  minX: number, minY: number, maxX: number, maxY: number,
  bonusChance = 0, // ★v0.25.3595: RELAX中の出現率ボーナス(TORCH_RELAX_BONUS)を呼び出し側が渡す
): TorchInstance[] => torchCellsInRegion(minX, minY, maxX, maxY, TORCH_BASE_CHANCE + bonusChance);

/**
 * 絵の矩形 art に届き得る松明(**RELAX の追加確率込みの最大**で在り得る物・形つき)。下の層(花・水たまり)が避ける相手。
 * 平常時は存在しない松明のぶん、花・水たまりに小さな空きができる(§3 許容)。
 */
export const torchFootprintsNear = (art: Rect): (TorchInstance & Footprint)[] => {
  const farKey = placementFarKey();
  const pw = TORCH_ART_MAX.w / 2 + MIN_COLLISION_GAP, ph = TORCH_ART_MAX.h + MIN_COLLISION_GAP;
  return torchCellsInRegion(art.x - pw - TORCH_CELL, art.y - MIN_COLLISION_GAP - TORCH_CELL, art.x + art.width + pw, art.y + art.height + ph, TORCH_MAX_CHANCE)
    .map(t => ({ ...t, art: torchArtRect(t, farKey), col: torchRect(t) }));
};

/** 松明の判定の矩形まわりで使う最大のしきい値(テスト用)。 */
export const TORCH_PLACEMENT_MAX_CHANCE = TORCH_MAX_CHANCE;

const TORCH_W = 20;
const TORCH_H = 16;

export const torchRect = (t: Pick<TorchInstance, 'footX' | 'footY' | 'scale'>): Rect =>
  footRect(t.footX, t.footY, TORCH_W * t.scale, TORCH_H * t.scale);

export const resolveTorchCollision = (
  rect: Rect,
  torches: Pick<TorchInstance, 'footX' | 'footY' | 'scale'>[]
): { x: number; y: number } =>
  resolveAabb(rect, torches.map(torchRect));

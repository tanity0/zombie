import { Rect, footRect, resolveAabb } from './obstacles';

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

const torchInCell = (cx: number, cy: number, bonusChance = 0): TorchInstance | null => {
  if (torchHash(cx + 31, cy - 19) >= 0.40 + bonusChance) return null; // 頻度UP(社長指示・出現セル≒30%→40%)。出過ぎたら0.35へ。
  const scale = 0.78 + torchHash(cx - 11, cy + 29) * 0.22;
  const ox = (torchHash(cx, cy + 7) - 0.5) * TORCH_CELL * 0.72;
  const oy = (torchHash(cx + 7, cy) - 0.5) * TORCH_CELL * 0.72;
  const footX = cx + TORCH_CELL / 2 + ox;
  const footY = cy + TORCH_CELL / 2 + oy;
  if (Math.abs(footX) < 190 && Math.abs(footY) < 190) return null;
  return { id: `torch-${cx}_${cy}`, footX, footY, scale };
};

// チュートリアル等「松明(=破壊可能プロップ/資材ドロップ源)を一切出さない」ステージ用の一括ゲート
// (setTreesDisabled と同じ流儀・社長指示v0.25.1818「アイテムも何もかも無し」)。
// torchesInRegion が唯一の生成源なので、描画・当たり判定・ドロップ源がこの1点で同時に消える。
let torchesDisabled = false;
export const setTorchesDisabled = (disabled: boolean): void => { torchesDisabled = disabled; };

export const torchesInRegion = (
  minX: number, minY: number, maxX: number, maxY: number,
  bonusChance = 0, // ★v0.25.3595: RELAX中の出現率ボーナス(TORCH_RELAX_BONUS)を呼び出し側が渡す
): TorchInstance[] => {
  if (torchesDisabled) return [];
  const startX = Math.floor(minX / TORCH_CELL) * TORCH_CELL;
  const startY = Math.floor(minY / TORCH_CELL) * TORCH_CELL;
  const out: TorchInstance[] = [];
  for (let cx = startX; cx <= maxX; cx += TORCH_CELL) {
    for (let cy = startY; cy <= maxY; cy += TORCH_CELL) {
      const t = torchInCell(cx, cy, bonusChance);
      if (t) out.push(t);
    }
  }
  return out;
};

const TORCH_W = 20;
const TORCH_H = 16;

export const torchRect = (t: Pick<TorchInstance, 'footX' | 'footY' | 'scale'>): Rect =>
  footRect(t.footX, t.footY, TORCH_W * t.scale, TORCH_H * t.scale);

export const resolveTorchCollision = (
  rect: Rect,
  torches: Pick<TorchInstance, 'footX' | 'footY' | 'scale'>[]
): { x: number; y: number } =>
  resolveAabb(rect, torches.map(torchRect));

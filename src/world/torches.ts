import { Rect, footRect, resolveAabb } from './obstacles';

export const TORCH_CELL = 360;

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

const torchInCell = (cx: number, cy: number): TorchInstance | null => {
  if (torchHash(cx + 31, cy - 19) >= 0.18) return null;
  const scale = 0.78 + torchHash(cx - 11, cy + 29) * 0.22;
  const ox = (torchHash(cx, cy + 7) - 0.5) * TORCH_CELL * 0.72;
  const oy = (torchHash(cx + 7, cy) - 0.5) * TORCH_CELL * 0.72;
  const footX = cx + TORCH_CELL / 2 + ox;
  const footY = cy + TORCH_CELL / 2 + oy;
  if (Math.abs(footX) < 190 && Math.abs(footY) < 190) return null;
  return { id: `torch-${cx}_${cy}`, footX, footY, scale };
};

export const torchesInRegion = (
  minX: number, minY: number, maxX: number, maxY: number
): TorchInstance[] => {
  const startX = Math.floor(minX / TORCH_CELL) * TORCH_CELL;
  const startY = Math.floor(minY / TORCH_CELL) * TORCH_CELL;
  const out: TorchInstance[] = [];
  for (let cx = startX; cx <= maxX; cx += TORCH_CELL) {
    for (let cy = startY; cy <= maxY; cy += TORCH_CELL) {
      const t = torchInCell(cx, cy);
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

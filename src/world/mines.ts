import { Rect, footRect } from './obstacles';

export const MINE_CELL = 720;

export interface MineInstance {
  id: string;
  footX: number;
  footY: number;
  scale: number;
}

const mineHash = (x: number, y: number): number => {
  const v = Math.sin(x * 43.123 + y * 119.731) * 43758.5453;
  return v - Math.floor(v);
};

const minesInCell = (cx: number, cy: number): MineInstance[] => {
  // Roughly half as common as torches, but spawned as a small cluster so they
  // read as a deliberate caltrop/mine patch instead of isolated clutter.
  if (mineHash(cx + 13, cy - 37) >= 0.09) return [];

  const centerX = cx + MINE_CELL / 2 + (mineHash(cx - 17, cy + 23) - 0.5) * MINE_CELL * 0.42;
  const centerY = cy + MINE_CELL / 2 + (mineHash(cx + 29, cy - 11) - 0.5) * MINE_CELL * 0.42;
  if (Math.abs(centerX) < 260 && Math.abs(centerY) < 260) return [];

  const count = 4 + Math.floor(mineHash(cx + 7, cy + 7) * 3); // 4-6, usually 5
  const spread = 44 + mineHash(cx - 5, cy + 41) * 20;
  const out: MineInstance[] = [];
  for (let i = 0; i < count; i++) {
    const angle = mineHash(cx + i * 19, cy - i * 31) * Math.PI * 2;
    const dist = spread * (0.35 + mineHash(cx - i * 13, cy + i * 17) * 0.75);
    const scale = 0.78 + mineHash(cx + i * 5, cy + i * 9) * 0.18;
    out.push({
      id: `mine-${cx}_${cy}_${i}`,
      footX: centerX + Math.cos(angle) * dist,
      footY: centerY + Math.sin(angle) * dist,
      scale,
    });
  }
  return out;
};

export const minesInRegion = (
  minX: number, minY: number, maxX: number, maxY: number
): MineInstance[] => {
  const startX = Math.floor(minX / MINE_CELL) * MINE_CELL;
  const startY = Math.floor(minY / MINE_CELL) * MINE_CELL;
  const out: MineInstance[] = [];
  for (let cx = startX; cx <= maxX; cx += MINE_CELL) {
    for (let cy = startY; cy <= maxY; cy += MINE_CELL) {
      out.push(...minesInCell(cx, cy));
    }
  }
  return out;
};

export const pressureMinesNearPlayer = (
  playerX: number,
  playerY: number,
  direction: { x: number; y: number } | null,
  gameTime: number
): MineInstance[] => {
  const mag = direction ? Math.hypot(direction.x, direction.y) : 0;
  if (mag < 0.25) return [];

  // A fresh pressure patch about every 18 seconds, anchored by time segment so
  // it does not slide with the player every frame. Only some segments spawn a
  // patch, keeping the trap from feeling constant.
  const segment = Math.floor(gameTime / 18000);
  if (mineHash(segment + 101, segment - 47) >= 0.58) return [];

  const nx = direction!.x / mag;
  const ny = direction!.y / mag;
  const px = -ny;
  const py = nx;
  const ahead = 210 + mineHash(segment + 13, segment + 29) * 80;
  const centerX = playerX + nx * ahead;
  const centerY = playerY + ny * ahead;
  const count = 4 + Math.floor(mineHash(segment - 17, segment + 61) * 3);
  const spacing = 30 + mineHash(segment + 7, segment - 5) * 8;
  const gapIndex = Math.floor(mineHash(segment + 37, segment + 73) * count);

  const out: MineInstance[] = [];
  for (let i = 0; i < count; i++) {
    // Leave a mild gap sometimes so the player can thread through instead of
    // being forced to shoot every patch.
    if (count >= 5 && i === gapIndex && mineHash(segment - 3, i + 97) < 0.45) continue;
    const offset = (i - (count - 1) / 2) * spacing;
    const jitter = (mineHash(segment + i * 11, segment - i * 19) - 0.5) * 12;
    const sideJitter = (mineHash(segment - i * 23, segment + i * 3) - 0.5) * 18;
    out.push({
      id: `mine-pressure-${segment}-${i}`,
      footX: centerX + px * (offset + jitter) + nx * sideJitter,
      footY: centerY + py * (offset + jitter) + ny * sideJitter,
      scale: 0.84 + mineHash(segment + i * 5, segment + i * 7) * 0.16,
    });
  }
  return out;
};

const MINE_W = 18;
const MINE_H = 12;

export const mineRect = (m: Pick<MineInstance, 'footX' | 'footY' | 'scale'>): Rect =>
  footRect(m.footX, m.footY, MINE_W * m.scale, MINE_H * m.scale);

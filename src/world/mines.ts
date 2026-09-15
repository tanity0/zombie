import { Rect, footRect } from './obstacles';

export const MINE_CELL = 720;

// ─── 起爆仕様(社長仕様v0.25.1846「踏むと赤くプクプク→爆発。範囲内の卵は連鎖起爆」/
//     導火時間の変遷: 2秒 → 1秒(社長指示v0.25.1985) → **1.5秒(社長指示v0.25.2392)**) ───
export const EGG_FUSE_MS = 1500;      // アーム(踏む/連鎖)から爆発までの導火時間
export const EGG_BLAST_RADIUS = 80;   // 爆発半径(px)。クラスタの広がり44〜64pxを丸ごと連鎖させる値(社長「任せる」)

// 爆発期限が来たアーム済み卵(純関数・毎フレームのフィルタのみ=距離計算は爆発時だけ)。
export interface ArmedEggLike { id: string; type: string; footX: number; footY: number; armedAt?: number }
export const dueArmedEggs = <T extends ArmedEggLike>(props: T[], gameTime: number): T[] =>
  props.filter(p => p.type === 'mine' && p.armedAt !== undefined && gameTime >= p.armedAt + EGG_FUSE_MS);

// 爆心(cx,cy)の範囲内にある未アームの卵=連鎖アーム対象(純関数)。
export const eggsToChainArm = <T extends ArmedEggLike>(props: T[], cx: number, cy: number, radius: number = EGG_BLAST_RADIUS): T[] =>
  props.filter(p => p.type === 'mine' && p.armedAt === undefined
    && (p.footX - cx) ** 2 + (p.footY - cy) ** 2 <= radius * radius);

export interface MineInstance {
  id: string;
  footX: number;
  footY: number;
  scale: number;
}

export interface MineAmbushAnchor {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

const mineHash = (x: number, y: number): number => {
  const v = Math.sin(x * 43.123 + y * 119.731) * 43758.5453;
  return v - Math.floor(v);
};

const minesInCell = (cx: number, cy: number): MineInstance[] => {
  // Roughly half as common as torches, but spawned as a small cluster so they
  // read as a deliberate insect-egg patch instead of isolated clutter.
  if (mineHash(cx + 13, cy - 37) >= 0.09) return [];

  const centerX = cx + MINE_CELL / 2 + (mineHash(cx - 17, cy + 23) - 0.5) * MINE_CELL * 0.42;
  const centerY = cy + MINE_CELL / 2 + (mineHash(cx + 29, cy - 11) - 0.5) * MINE_CELL * 0.42;
  if (Math.abs(centerX) < 260 && Math.abs(centerY) < 260) return [];

  const count = 5 + Math.floor(mineHash(cx + 7, cy + 7) * 6); // 5-10 eggs
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

// チュートリアル等「緑卵(地雷)を一切出さない」ステージ用の一括ゲート(setTreesDisabled/
// setTorchesDisabled と同じ流儀・社長指示v0.25.1820「緑卵も非表示」)。ワールド生成の3関数
// (region/pressure/ambush)を全て塞ぐ=描画・接触判定・影キャスタが同時に消える。
// (敵の産卵・卵リングイベントは敵/イベント停止側で別途止まっている。)
let minesDisabled = false;
export const setMinesDisabled = (disabled: boolean): void => { minesDisabled = disabled; };

export const minesInRegion = (
  minX: number, minY: number, maxX: number, maxY: number
): MineInstance[] => {
  if (minesDisabled) return [];
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
  if (minesDisabled) return [];
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
  const ahead = 310 + mineHash(segment + 13, segment + 29) * 120;
  const centerX = playerX + nx * ahead;
  const centerY = playerY + ny * ahead;
  const count = 5 + Math.floor(mineHash(segment - 17, segment + 61) * 6); // 5-10 eggs
  const spacing = 26 + mineHash(segment + 7, segment - 5) * 11;
  const rowCount = 2 + Math.floor(mineHash(segment + 43, segment - 21) * 2);
  const rowSpacing = 24 + mineHash(segment - 71, segment + 19) * 14;
  const colCount = Math.ceil(count / rowCount);
  const gapIndex = Math.floor(mineHash(segment + 37, segment + 73) * count);

  const out: MineInstance[] = [];
  for (let i = 0; i < count; i++) {
    // Leave a mild gap sometimes so the player can thread through instead of
    // being forced to shoot every patch.
    if (count >= 7 && i === gapIndex && mineHash(segment - 3, i + 97) < 0.42) continue;
    const row = i % rowCount;
    const col = Math.floor(i / rowCount);
    const colLane = col - (colCount - 1) / 2;
    const rowLane = row - (rowCount - 1) / 2;
    const stagger = (row - (rowCount - 1) / 2) * spacing * 0.34;
    const colOffset = colLane * spacing + stagger + (mineHash(segment + i * 11, segment - i * 19) - 0.5) * 24;
    const rowOffset = rowLane * rowSpacing + (mineHash(segment - i * 23, segment + i * 3) - 0.5) * 22;
    const clumpJitter = Math.sin(i * 1.71 + mineHash(segment, i) * Math.PI * 2) * 9;
    out.push({
      id: `mine-pressure-${segment}-${i}`,
      footX: centerX + px * (colOffset + clumpJitter) + nx * rowOffset,
      footY: centerY + py * (colOffset + clumpJitter) + ny * rowOffset,
      scale: 0.84 + mineHash(segment + i * 5, segment + i * 7) * 0.16,
    });
  }
  return out;
};

export const mineAmbushAround = (anchor: MineAmbushAnchor): MineInstance[] => {
  if (minesDisabled) return [];
  const count = 52;
  const rx = anchor.width * 0.62;
  const ry = anchor.height * 0.58;
  const out: MineInstance[] = [];

  for (let i = 0; i < count; i++) {
    const t = i / count;
    const angle = t * Math.PI * 2;
    const ringNoise = (mineHash(i + 17, anchor.x * 0.01 + anchor.y * 0.01) - 0.5) * 42;
    const tangentNoise = (mineHash(i - 31, anchor.y * 0.01 - anchor.x * 0.01) - 0.5) * 32;
    const row = i % 3;
    const rowPush = (row - 1) * 18;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const tx = -sin;
    const ty = cos;

    out.push({
      id: `mine-ambush-${anchor.id}-${i}`,
      footX: anchor.x + cos * (rx + ringNoise + rowPush) + tx * tangentNoise,
      footY: anchor.y + sin * (ry + ringNoise * 0.65 + rowPush) + ty * tangentNoise,
      scale: 0.82 + mineHash(i + 5, anchor.x + anchor.y) * 0.18,
    });
  }

  return out;
};

const MINE_W = 18;
const MINE_H = 12;

export const mineRect = (m: Pick<MineInstance, 'footX' | 'footY' | 'scale'>): Rect =>
  footRect(m.footX, m.footY, MINE_W * m.scale, MINE_H * m.scale);

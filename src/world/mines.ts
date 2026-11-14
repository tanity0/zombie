import { Rect, footRect } from './obstacles';

export const MINE_CELL = 720;

// ─── 起爆仕様(社長仕様v0.25.1846「踏むと赤くプクプク→爆発。範囲内の卵は連鎖起爆」/
//     導火時間の変遷: 2秒 → 1秒(社長指示v0.25.1985) → **1.5秒(社長指示v0.25.2392)**) ───
export const EGG_FUSE_MS = 1500;      // アーム(踏む/連鎖)から爆発までの導火時間
export const EGG_BLAST_RADIUS = 80;   // 爆発半径(px)。クラスタの広がり44〜64pxを丸ごと連鎖させる値(社長「任せる」)

// ★卵の寿命と同時上限(社長指示2026-10-16・まとめHTML A6「緑卵って増え続ける？消える？上限個数、時間制限ある？ほしい」)。
//   実態(調査): 増え続けはしないが時間では消えず、上限は抱卵型の卵20個だけ。他(待ち伏せ52/包囲22/畑/圧力)は画面外カリング任せ。
//   直し方=**自爆**: 期限切れ/上限超過の卵は「踏んだ時と同じアーム(赤くプクプク1.5秒)→爆発」で消す。消滅に慣性(予告→爆ぜる)が
//   付き、絵・SE・連鎖は既存のまま(新しい消え方を作らない)。アーム済みは触らない(赤い予告③「消え切る=当たる」)。
//   寿命は**動いて撒かれた卵(抱卵型 egg-gc- / 包囲 egg-evt-)だけ**。畑・圧力・待ち伏せは決定論で復活する設置物なので寿命は付けない。
export const EGG_TTL_MS = 45_000;     // 撒かれてからこの時間で自爆(叩き台・社長が実機で決める)
export const MINE_LIVE_CAP = 70;      // 画面近傍(カメラ領域)の未アーム卵の同時上限。待ち伏せ52個が一度に出る仕様を壊さない値
export interface LaidEggLike { id: string; type: string; armedAt?: number; laidAt?: number }
export const isEggExpired = (p: LaidEggLike, gameTime: number): boolean =>
  p.type === 'mine' && p.armedAt === undefined && p.laidAt !== undefined && gameTime >= p.laidAt + EGG_TTL_MS;
/** 上限超過ぶんの id(古い順=撒かれた時刻の古い動的卵→設置物の順)。アーム済みは数えない・選ばない。 */
export const eggsToArmForCap = <T extends LaidEggLike>(props: readonly T[], cap: number = MINE_LIVE_CAP): Set<string> => {
  const live = props.filter(p => p.type === 'mine' && p.armedAt === undefined);
  const over = live.length - cap;
  if (over <= 0) return new Set();
  const sorted = [...live].sort((a, b) => (a.laidAt ?? Infinity) - (b.laidAt ?? Infinity));
  return new Set(sorted.slice(0, over).map(p => p.id));
};

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

// ─── 卵を割る当たり(社長実機報告2026-11-09「銃の弾や爆発、一部格闘の技などで緑の卵が割れない。」) ───
// 「敵に当たる攻撃は、その範囲の卵も割る」の判定の形をここに1本で置く(描画にも store にも依存しない純関数)。

/** 卵の描かれた大きさ(pixiScene の卵の絵はこの箱へ収める=見えている卵そのもの)。 */
export const EGG_DRAW_W = 22;
export const EGG_DRAW_H = 29;

/**
 * 弾が卵に当たる箱 = **描かれた卵の箱**(足元から上へ EGG_DRAW_H)。
 * 足元の当たり(mineRect=18×12・踏む/通る用)は弾には低すぎた: 弾は撃った人の体の高さ(足元から14px以上上)を飛ぶので、
 * 同じ地面に転がっている卵の上を素通りしていた(撃った画と測った値で確かめた・§報告の表)。
 */
export const eggShotRect = (m: Pick<MineInstance, 'footX' | 'footY' | 'scale'>): Rect =>
  footRect(m.footX, m.footY, EGG_DRAW_W * m.scale, EGG_DRAW_H * m.scale);

/**
 * 弾(箱)が前のフレームの位置から今の位置へ動く間に、箱 r に触れたか(掃引)。速い弾が1フレームで卵を飛び越すのを防ぐ。
 * prev が無い(出たばかり)時は今の位置だけで見る。弾の箱の大きさぶん r を広げ、線分と箱の交差(スラブ法)で判定する。
 */
export const sweptBoxHitsRect = (
  prev: { x: number; y: number } | undefined,
  cur: { x: number; y: number; width: number; height: number },
  r: Rect,
): boolean => {
  const x0 = r.x - cur.width, y0 = r.y - cur.height, x1 = r.x + r.width, y1 = r.y + r.height; // 弾の左上が入れば重なる
  const bx = cur.x, by = cur.y;
  const ax = prev?.x ?? bx, ay = prev?.y ?? by;
  const inside = (x: number, y: number) => x > x0 && x < x1 && y > y0 && y < y1;
  if (inside(bx, by) || inside(ax, ay)) return true;
  const dx = bx - ax, dy = by - ay;
  let t0 = 0, t1 = 1;
  for (const [p, q] of [[-dx, ax - x0], [dx, x1 - ax], [-dy, ay - y0], [dy, y1 - ay]] as const) {
    if (p === 0) { if (q <= 0) return false; continue; }
    const t = q / p;
    if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
    else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return t0 < t1;
};

/**
 * 卵(や小物)に当たっても消えない刃か(社長実機報告2026-11-10「緑卵に周りを回る手裏剣みたいなスキルが当たると変な挙動になる。普通に卵壊して欲しい」)。
 * ドローンブーメラン(投げた物)と「防衛」の周回ブーメランは、当たった卵を1発で割って、そのまま飛び続ける/回り続ける。
 * 旧: 普通の弾と同じく卵で消されていた=防衛は消えるたびに出し直されて位置が跳び、ダメージ0なので卵も割れなかった。
 */
export const isEggPiercingBlade = (p: { weaponType?: string }): boolean => p.weaponType === 'drone-boomerang-projectile';
/** 刃が卵へ与えるダメージ(卵は必ず1発で割る=卵の残り体力以上)。 */
export const eggBladeDamage = (eggHealth: number, bladeDamage: number): number => Math.max(1, eggHealth, bladeDamage);

/** 卵(足元)が、線分(始点・向き・長さ)から halfWidth 以内か(length=0 で円)。近接の breakPropsAlong と同じカプセル。 */
export const eggInCapsule = (
  egg: { footX: number; footY: number }, x0: number, y0: number, ux: number, uy: number, length: number, halfWidth: number,
): boolean => {
  const rx = egg.footX - x0, ry = egg.footY - y0;
  const along = Math.max(0, Math.min(length, rx * ux + ry * uy));
  return Math.hypot(egg.footX - (x0 + ux * along), egg.footY - (y0 + uy * along)) <= halfWidth;
};

/** 卵(足元)が扇(中心・向き・届き・半角)の中か(火炎放射器・スキャンの扇)。届きは卵の半分の幅だけ甘く見る。 */
export const eggInFan = (
  egg: { footX: number; footY: number }, cx: number, cy: number, dirX: number, dirY: number, range: number, halfAngle: number,
): boolean => {
  const dx = egg.footX - cx, dy = egg.footY - cy;
  const d = Math.hypot(dx, dy);
  if (d > range + EGG_DRAW_W / 2) return false;
  if (d < 1) return true;
  const dl = Math.hypot(dirX, dirY) || 1;
  const cos = (dx * dirX + dy * dirY) / (d * dl);
  return cos >= Math.cos(halfAngle);
};

/** 卵の描かれた体の真ん中(光線・扇は撃った人の体の高さを通るので、足元ではなくここで測る)。 */
export const eggBodyPoint = (egg: { footX: number; footY: number; scale?: number }): { footX: number; footY: number } =>
  ({ footX: egg.footX, footY: egg.footY - (EGG_DRAW_H * (egg.scale ?? 1)) / 2 });

/** 光線(根元 a → 先 b・半幅)が卵の描かれた体に触れるか。半幅に卵の半分の幅を足す。 */
export const eggInBeam = (
  egg: { footX: number; footY: number; scale?: number }, ax: number, ay: number, bx: number, by: number, halfWidth: number,
): boolean => {
  const len = Math.hypot(bx - ax, by - ay);
  const ux = len > 0 ? (bx - ax) / len : 1, uy = len > 0 ? (by - ay) / len : 0;
  return eggInCapsule(eggBodyPoint(egg), ax, ay, ux, uy, len, halfWidth + (EGG_DRAW_W * (egg.scale ?? 1)) / 2);
};

/** 円(中心・半径)が卵の描かれた箱に触れるか(塊弾・回る衛星弾など、円で当てる物)。 */
export const circleHitsEgg = (
  egg: { footX: number; footY: number; scale: number }, cx: number, cy: number, radius: number,
): boolean => {
  const r = eggShotRect(egg);
  const qx = Math.max(r.x, Math.min(cx, r.x + r.width)), qy = Math.max(r.y, Math.min(cy, r.y + r.height));
  return (cx - qx) ** 2 + (cy - qy) ** 2 <= radius * radius;
};

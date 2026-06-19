// 救助ホールドイベントの「データ＋純粋ロジック」。既存の囲い系イベント(activeEvent)を流用した
// 時限防衛イベント。サークル内の逃げ惑うNPC(survivor)3人を、群がる敵から守って累計25秒しのぐ。
// ★レンダラ非依存(PixiJS を import しない)。CLAUDE.md: World data / collision math は renderer-agnostic。
import type { Circle } from './arena';

// ---- 決め打ち定数(実機調整前提) ----
export const RESCUE_RADIUS = 150;            // サークル半径
export const RESCUE_HOLD_NEED_MS = 25000;    // 累計ホールド成功時間
export const RESCUE_FLEE_TRIGGER = 120;      // この距離内に敵が入ったら逃走
export const RESCUE_SURVIVOR_SPEED = 40;     // 逃走速度(通常敵 ~60 の約2/3)
export const RESCUE_SEPARATION = 30;         // NPC同士の最小間隔(団子化回避)
export const RESCUE_ATTACKERS = 3;           // 常時維持する攻撃者数
export const RESCUE_SURVIVOR_SIZE = 22;      // NPC当たり/描画の基準
export const RESCUE_RETURN_DEADZONE = 18;    // 中央帰還の停止半径

// shooter(自衛射撃)の控えめ射撃。単独では敵を倒しきれない程度。
export const RESCUE_SHOOTER_RANGE = 240;
export const RESCUE_SHOOTER_INTERVAL_MS = 900;
export const RESCUE_SHOOTER_DAMAGE = 5;

export const RESCUE_CIVILIAN_HP = 30; // 社長指示で半減(旧60)
export const RESCUE_SHOOTER_HP = 40;  // 社長指示で半減(旧80)

export type RescueSubtype = 'shooter' | 'civilian';
export type RescueGender = 'm' | 'f';

// 発生時の編成抽選(1→3で易化)。計3人。
export interface RescueMember { subtype: RescueSubtype; gender?: RescueGender; }
export const RESCUE_COMPOSITIONS: RescueMember[][] = [
  // 1 (難): 射撃1 + 一般人 男1・女1
  [{ subtype: 'shooter' }, { subtype: 'civilian', gender: 'm' }, { subtype: 'civilian', gender: 'f' }],
  // 2 (中): 射撃2 + 一般人1(男女ランダムは呼び出し側で補完)
  [{ subtype: 'shooter' }, { subtype: 'shooter' }, { subtype: 'civilian' }],
  // 3 (易): 射撃3
  [{ subtype: 'shooter' }, { subtype: 'shooter' }, { subtype: 'shooter' }],
];

export const pickRescueComposition = (): RescueMember[] => {
  const i = Math.floor(Math.random() * RESCUE_COMPOSITIONS.length);
  return RESCUE_COMPOSITIONS[i].map(m => ({
    subtype: m.subtype,
    gender: m.subtype === 'civilian' ? (m.gender ?? (Math.random() < 0.5 ? 'm' : 'f')) : undefined,
  }));
};

export interface RescueSurvivor {
  id: string;
  x: number; y: number;
  width: number; height: number;
  vx: number; vy: number;
  health: number; maxHealth: number;
  subtype: RescueSubtype;
  gender?: RescueGender;
  lastContactAt?: number; // 敵接触ダメージの throttle
  lastShotAt?: number;    // shooter の射撃 throttle
  helpUntil?: number;     // 「助けて」コールアウト表示の gameTime 期限
}

interface Pt { x: number; y: number; }

// 円内バウンドカイト: 最寄り敵が FLEE_TRIGGER 内なら反対方向へ後退、いなければ中央へ帰還。
// NPC同士は軽い反発。円の縁では外へ出ず、外向き速度成分を除いて接線方向へスライドさせる。
// 戻り値は次フレームの位置と速度(描画向きにも使える)。純粋関数(state を書き換えない)。
export const computeSurvivorStep = (
  s: RescueSurvivor,
  others: RescueSurvivor[],
  enemyCenters: Pt[],
  circle: Circle,
  deltaTime: number,
): { x: number; y: number; vx: number; vy: number } => {
  const cx = s.x + s.width / 2;
  const cy = s.y + s.height / 2;

  // 最寄り敵
  let nearest: Pt | null = null;
  let nd2 = RESCUE_FLEE_TRIGGER * RESCUE_FLEE_TRIGGER;
  for (const e of enemyCenters) {
    const d2 = (e.x - cx) ** 2 + (e.y - cy) ** 2;
    if (d2 <= nd2) { nd2 = d2; nearest = e; }
  }

  let dirX = 0, dirY = 0;
  if (nearest) {
    // 逃走: 敵から離れる方向
    const dx = cx - nearest.x, dy = cy - nearest.y;
    const d = Math.max(0.001, Math.hypot(dx, dy));
    dirX = dx / d; dirY = dy / d;
  } else {
    // 帰還: 中央へ(デッドゾーン内なら停止)
    const dx = circle.x - cx, dy = circle.y - cy;
    const d = Math.hypot(dx, dy);
    if (d > RESCUE_RETURN_DEADZONE) { dirX = dx / d; dirY = dy / d; }
  }

  // NPC同士の反発(近すぎる相手から離れる)
  for (const o of others) {
    if (o.id === s.id) continue;
    const ox = o.x + o.width / 2, oy = o.y + o.height / 2;
    const dx = cx - ox, dy = cy - oy;
    const d = Math.hypot(dx, dy);
    if (d > 0.001 && d < RESCUE_SEPARATION) {
      const w = (RESCUE_SEPARATION - d) / RESCUE_SEPARATION;
      dirX += (dx / d) * w; dirY += (dy / d) * w;
    }
  }

  const len = Math.hypot(dirX, dirY);
  if (len < 0.0001) return { x: s.x, y: s.y, vx: 0, vy: 0 };
  let vx = (dirX / len) * RESCUE_SURVIVOR_SPEED;
  let vy = (dirY / len) * RESCUE_SURVIVOR_SPEED;

  // 円の縁: 外向き成分を除去して接線スライド(外へ出ない)
  const inset = Math.max(0, circle.radius - Math.max(s.width, s.height) / 2);
  const rx = cx - circle.x, ry = cy - circle.y;
  const rd = Math.hypot(rx, ry);
  if (rd >= inset && rd > 0.0001) {
    const nx = rx / rd, ny = ry / rd;       // 半径方向(外向き)
    const outward = vx * nx + vy * ny;
    if (outward > 0) { vx -= outward * nx; vy -= outward * ny; }
  }

  let nxp = s.x + vx * deltaTime;
  let nyp = s.y + vy * deltaTime;

  // 念のため最終位置を円内へクランプ
  const ncx = nxp + s.width / 2, ncy = nyp + s.height / 2;
  const ddx = ncx - circle.x, ddy = ncy - circle.y;
  const dd = Math.hypot(ddx, ddy);
  if (dd > inset && dd > 0.0001) {
    const k = inset / dd;
    nxp = circle.x + ddx * k - s.width / 2;
    nyp = circle.y + ddy * k - s.height / 2;
  }
  return { x: nxp, y: nyp, vx, vy };
};

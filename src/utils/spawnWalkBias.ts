// 湧く向きを「歩き続けている方向」へ寄せる(社長「湧き方の案は推薦で」2026-10-05・PACING_PUZZLE.md §20)。
// 社長報告「ステージ1とかだと、歩いてると全然敵と出会わない時がある。ピークタイムでも」。計測(ヘッドレス・ステージ1・4分)で、
// 歩き続けると盤面の敵の約半分(歩き始めは10体中7〜8体)が後ろに置き去り・進む先から来るのは約1体だった。
// 湧く辺はほぼ均等で、進む方向へ寄せるのは3回に1回だけだったため。
//  - 同じ向きに歩き続けた時間で寄せを強める(2秒で最大)。最大時: 進む先の辺70% / 左右の辺 各12.5% / 後ろの辺5%。
//  - 進む先の辺では、辺の端から端まで均等ではなく、正面寄りに置く(三角分布)=歩いた先で出会う。
//  - 立ち止まる・向きを変える・小刻みに動く間は寄せが0へ戻る=今まで通り(従来の 1/3 だけ進む方向へ寄せる湧き方)。
// store も PixiJS も読まない葉モジュール。状態は1本だけ(プレイヤーは1人)。

export const WALK_BIAS_FULL_MS = 2000;   // 同じ向きにこれだけ歩き続けると寄せが最大
const WALK_ALIGN_COS = 0.8;              // 向きが「同じ」とみなす幅(約37度)
const WALK_MIN_SPEED_FRAC = 0.5;         // 基礎の速さのこの割合未満は「歩いていない」
/** 寄せ最大時の辺の比率(進む先 / 左右の片側 / 後ろ)。 */
export const WALK_BIAS_FRONT = 0.7;
export const WALK_BIAS_SIDE = 0.125;
export const WALK_BIAS_BACK = 0.05;

export interface WalkHeading { hx: number; hy: number; steadyMs: number }

export const newWalkHeading = (): WalkHeading => ({ hx: 0, hy: 0, steadyMs: 0 });

/** 1tickぶん進める(純関数)。vx/vy=今の速度、speedRef=基礎の移動速度、dtMs=経過。 */
export const stepWalkHeading = (s: WalkHeading, vx: number, vy: number, speedRef: number, dtMs: number): WalkHeading => {
  const sp = Math.hypot(vx, vy);
  if (!(sp > 0) || sp < speedRef * WALK_MIN_SPEED_FRAC) {
    // 止まった/ほぼ止まった: 寄せは素早く抜ける(3倍速)。向きは覚えておく。
    return { hx: s.hx, hy: s.hy, steadyMs: Math.max(0, s.steadyMs - dtMs * 3) };
  }
  const ux = vx / sp, uy = vy / sp;
  if (s.hx === 0 && s.hy === 0) return { hx: ux, hy: uy, steadyMs: 0 };
  const cos = ux * s.hx + uy * s.hy;
  if (cos < WALK_ALIGN_COS) return { hx: ux, hy: uy, steadyMs: 0 }; // 向きを変えた=数え直し
  const nx = s.hx * 0.9 + ux * 0.1, ny = s.hy * 0.9 + uy * 0.1;
  const nl = Math.hypot(nx, ny) || 1;
  return { hx: nx / nl, hy: ny / nl, steadyMs: Math.min(WALK_BIAS_FULL_MS, s.steadyMs + dtMs) };
};

/** 寄せの強さ 0..1。 */
export const walkBiasStrength = (s: WalkHeading): number => Math.max(0, Math.min(1, s.steadyMs / WALK_BIAS_FULL_MS));

/** 向き → 辺(0=上 1=右 2=下 3=左・generateEnemy と同じ番号)。主軸で決める。 */
export const sideOfDir = (x: number, y: number): number =>
  Math.abs(x) > Math.abs(y) ? (x > 0 ? 1 : 3) : (y > 0 ? 2 : 0);

/**
 * 寄せた湧き方で辺を選ぶ。`useRoll >= strength` なら null(=従来の湧き方を使う)。
 * 選ばれた時は 進む先70% / 左右 各12.5% / 後ろ5%。`front` は進む先の辺を選んだか(正面寄りに置くため)。
 */
export const pickWalkBiasedSide = (
  s: WalkHeading, strength: number, useRoll: number, sideRoll: number,
): { side: number; front: boolean } | null => {
  if (!(useRoll < strength)) return null;
  if (s.hx === 0 && s.hy === 0) return null;
  const front = sideOfDir(s.hx, s.hy);
  const back = (front + 2) % 4;
  const left = (front + 3) % 4, right = (front + 1) % 4;
  if (sideRoll < WALK_BIAS_FRONT) return { side: front, front: true };
  if (sideRoll < WALK_BIAS_FRONT + WALK_BIAS_SIDE) return { side: left, front: false };
  if (sideRoll < WALK_BIAS_FRONT + WALK_BIAS_SIDE * 2) return { side: right, front: false };
  return { side: back, front: false };
};

// ---- 1本だけの状態(プレイヤーの移動から毎tick更新・湧きから読む) ----
let current: WalkHeading = newWalkHeading();
export const tickSpawnWalk = (vx: number, vy: number, speedRef: number, dtMs: number): void => {
  current = stepWalkHeading(current, vx, vy, speedRef, dtMs);
};
export const currentSpawnWalk = (): WalkHeading => current;
export const resetSpawnWalk = (): void => { current = newWalkHeading(); };

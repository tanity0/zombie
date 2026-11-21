/**
 * ★スキル「縮地」(key: `shukuchi`・社長仕様2026-10-01・SKILL_BUILD_REDESIGN.md §32)の計算部分。
 * 近接で倒すと「追撃の窓」が開き、窓の中で振ると射程内の最寄りの敵の手前へ瞬間移動して斬る。
 * ここは状態を持たない純関数だけ(store が呼ぶ・テストで固定する)。
 */

/** Lvごとの射程(px)と窓(ms)。社長の表のまま(数値の正はここ)。 */
export const SHUKUCHI_LEVELS: readonly { rangePx: number; windowMs: number }[] = [
  { rangePx: 400, windowMs: 2000 }, // Lv1
  { rangePx: 500, windowMs: 2000 }, // Lv2
  { rangePx: 600, windowMs: 2500 }, // Lv3
];
/** ワープ直後の無敵(ms)。 */
export const SHUKUCHI_INVULN_MS = 500;
/** 連鎖2発目から1発ごとにダメージへ足す割合(上限なし)。 */
export const SHUKUCHI_CHAIN_BONUS = 0.2;

export const shukuchiParams = (level: number): { rangePx: number; windowMs: number } =>
  SHUKUCHI_LEVELS[Math.max(1, Math.min(SHUKUCHI_LEVELS.length, Math.floor(level || 1))) - 1];

/** 窓が開いているか(締め切りは gameTime)。 */
export const shukuchiWindowOpen = (windowUntil: number | undefined, gameTime: number): boolean =>
  windowUntil !== undefined && windowUntil > 0 && gameTime < windowUntil;

/** 連鎖 n 発目(1始まり)のダメージ倍率: 1発目 ×1.0 / 2発目 ×1.2 / 3発目 ×1.4 …(上限なし)。 */
export const shukuchiChainMult = (chainIndex: number): number =>
  1 + SHUKUCHI_CHAIN_BONUS * Math.max(0, Math.floor(chainIndex) - 1);

/**
 * 飛ぶ相手を選ぶ: 射程内(近接と同じ「判定の帯の最近点まで」の距離)で、壁に遮られていない**最寄り**。
 * 居なければ null(=通常の振りへ落とす)。
 */
export const pickShukuchiTarget = <T extends { id: string; dist: number; blocked: boolean }>(
  candidates: readonly T[], rangePx: number,
): T | null => {
  let best: T | null = null;
  for (const c of candidates) {
    if (c.blocked || !(c.dist <= rangePx)) continue;
    if (best === null || c.dist < best.dist) best = c;
  }
  return best;
};

/**
 * 着地点(プレイヤーの中心): 相手の判定の帯のうち**自分に一番近い点**から、自分の側へ `standOffPx` だけ手前。
 * =近接が必ず入る距離に降りる。最初から帯の中に居る(距離0)なら動かない。
 */
export const shukuchiLandingPoint = (
  pcx: number, pcy: number,
  rect: { x: number; y: number; width: number; height: number },
  standOffPx: number,
): { x: number; y: number } => {
  const nx = Math.max(rect.x, Math.min(pcx, rect.x + rect.width));
  const ny = Math.max(rect.y, Math.min(pcy, rect.y + rect.height));
  const dx = pcx - nx, dy = pcy - ny;
  const d = Math.hypot(dx, dy);
  if (!(d > 0.001)) return { x: pcx, y: pcy };
  const k = Math.min(d, Math.max(0, standOffPx)) / d;
  return { x: nx + dx * k, y: ny + dy * k };
};

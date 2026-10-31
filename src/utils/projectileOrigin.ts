// research/GHOST_BOSS.md v9「2. 弾パリィ=反応時間モデル」: **弾の発射点**と、そこから出す**飛翔時間**。
//
// ## なぜ発射点を持つのか
// 「見てから反応できたか」を測るには弾が飛んでいた時間が要る。`createdAt` は Date.now 基準で、
// 幻影の判定が使う `gameTime` と混ぜられない(ENGINEERING_NOTES.md「時計の混在」)うえ、
// スロー/ヒットストップでも伸び縮みする。**距離÷速度**なら時計を1本も跨がない。
//
// ## 掟
// - **型以外を import しない**(依存ゼロの葉)。
// - 生成側で焼かない: 発射点の書き込みは store への**挿入の合流点**が `ensureProjectileOrigin` で
//   行う(生成箇所は weaponUtils / gameStore など散在していて、静的には漏れを検出できないため)。

/** 発射点の補完に必要な最小の形(Projectile の部分集合=葉が Projectile 型に依存しないため)。 */
export interface ProjectileOriginFields {
  x: number;
  y: number;
  originX?: number;
  originY?: number;
}

/**
 * 発射点が未設定なら**その時の座標**(=挿入直後の銃口位置)を焼く。既に持っていればそのまま返す。
 * 挿入の合流点が全部これを通るので、**付け忘れが構造的に不可能**になる。
 */
export const ensureProjectileOrigin = <T extends ProjectileOriginFields>(p: T): T => (
  p.originX !== undefined && p.originY !== undefined
    ? p
    : { ...p, originX: p.x, originY: p.y }
);

/**
 * 発射点から着弾点までの**飛翔時間(ms)**。距離÷速度なので時計を跨がない。
 *  - 発射点が無い(他所で組まれた弾)= 判定材料が無い → `Infinity`(=「反応できた」側へ倒す)。
 *    **比較の前に呼び出し側が isFinite で分岐する**(Infinity/NaN を比較に流さない)。
 *  - 速度が0以下(スナップ弾)= 瞬間着弾 → 0(=見てから反応できない)。
 *  - 発射点と着弾点がほぼ同じ距離0の弾も、そのまま 0ms 近傍=反応できない側に出る。
 */
export const projectileFlightMsTo = (
  p: ProjectileOriginFields & { speed: number },
  targetX: number,
  targetY: number,
): number => {
  const ox = p.originX, oy = p.originY;
  if (ox === undefined || oy === undefined) return Number.POSITIVE_INFINITY;
  if (!(p.speed > 0)) return 0; // 速度0/負/NaN=瞬間着弾(割り算の前で分岐する)
  const ms = (Math.hypot(targetX - ox, targetY - oy) / p.speed) * 1000;
  return Number.isFinite(ms) ? ms : 0;
};

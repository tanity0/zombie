// ドローンブーメランの打ち返し(社長指示2026-11-10「ドローンブーメランは戻ってきた瞬間に近接当てると再度飛んでいく」)。
// 判定だけの純関数(store / PixiJS 非依存)。戻ってきたブーメランが近接の届く距離に入っている時に近接を振ると、
// そのブーメランを振った向きへもう一度飛ばす(新しく投げ直すのではなく、同じ1枚が飛び直す)。

/** 近接の届く距離に足す余白(px・ブーメランの半径ぶん+少し。叩き台)。 */
export const DRONE_BOOM_BAT_PAD_PX = 14;

/** 打ち返された直後の勢い: 出だしは通常の何倍の速さか/通常の速さへ戻るまで(ms)。飛ぶ距離は変わらない(着くのが少し早いだけ)。 */
export const DRONE_BOOM_BAT_BOOST = 1.45;
export const DRONE_BOOM_BAT_BOOST_MS = 220;
/** 打ち返されてから sinceMs 後の速さの倍率(弾かれた勢いが抜けていく=ease-out で1へ)。 */
export const boomerangBatSpeedMult = (sinceMs: number): number => {
  if (!(sinceMs >= 0) || sinceMs >= DRONE_BOOM_BAT_BOOST_MS) return 1;
  const k = 1 - sinceMs / DRONE_BOOM_BAT_BOOST_MS;
  return 1 + (DRONE_BOOM_BAT_BOOST - 1) * k * k;
};
/** 打った瞬間の止め(ms・プレイヤーが打った時だけ)と揺れ。 */
export const DRONE_BOOM_BAT_HITSTOP_MS = 55;

/** 判定に要る欄だけ(Projectile の部分型)。 */
export interface BatBoomLike {
  id: string;
  x: number; y: number; width: number; height: number;
  weaponType?: string;
  weaponKey?: string;
  boomPhase?: 'out' | 'stop' | 'return' | 'done';
  ownerGhost?: boolean;
}

/**
 * 打ち返せるブーメランの id(無ければ null)。
 * 条件: 投げたブーメラン(weaponKey 'sub-drone-boomerang'。警察署の周回ブーメランは対象外)・戻りの最中・
 * 持ち主が同じ(プレイヤーのものはプレイヤー、守護霊のものは守護霊)・振った本人の中心から reach+余白 の内。
 * 複数あれば一番近いもの。
 */
export const boomerangBatPick = (
  projectiles: readonly BatBoomLike[], ghostOwned: boolean, cx: number, cy: number, reach: number,
): string | null => {
  let best: string | null = null;
  let bestD = Infinity;
  const lim = Math.max(0, reach) + DRONE_BOOM_BAT_PAD_PX;
  for (const p of projectiles) {
    if (p.weaponType !== 'drone-boomerang-projectile' || p.weaponKey !== 'sub-drone-boomerang') continue;
    if (p.boomPhase !== 'return') continue;
    if (!!p.ownerGhost !== ghostOwned) continue;
    const d = Math.hypot(p.x + p.width / 2 - cx, p.y + p.height / 2 - cy);
    if (d <= lim && d < bestD) { best = p.id; bestD = d; }
  }
  return best;
};

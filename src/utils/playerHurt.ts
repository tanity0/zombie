// ★プレイヤーの被弾リアクションの段(社長裁定2026-09-16「一旦aでやってみよう」)。
//
// なぜ「出す/出さない」ではなく「段」なのか(社長指摘「敵は体勢値、プレイヤーは無敵時間があるので
// 分けないとあかん」):
//  - **敵**は体勢値(bossPosture)が「怯まない程度か否か」を既に決めている。そこへHP割合のしきい値を
//    足すと、同じことを決める仕組みが2本になる。だから**敵側は触らない**。
//  - **プレイヤー**は無敵1秒があるので、そもそも1秒に1回しか怯まない。**連発は起きない**ので、
//    間引く(出す/出さない)必要が無い。足りないのは**強弱の段**だった——素の状態でも被弾量は
//    6〜141(最大HP120)まで開くのに、反応が1種類しかなかった。
//
// ★案(b)「軽い被弾では怯まない」へ倒したくなったら、**下の表の軽段 crouchMs を 0 にする**だけでよい
// (0なら窓が開かない=しゃがみが出ない。ストップとノックは従来どおり残る)。

/** 1段ぶんの反応。crouchMs=しゃがみ絵を出す長さ / stopMs=ヒットストップの長さ。 */
export interface PlayerHurtReaction {
  crouchMs: number;
  stopMs: number;
}

/** 段の境目(被弾量 ÷ 最大HP)。この値**以上**で次の段へ上がる。 */
export const PLAYER_HURT_TIER_FRACS = [0.08, 0.20] as const;

/**
 * 段ごとの反応(叩き台・実機で調整)。最大HP120なら 軽=〜9 / 中=10〜23 / 重=24〜。
 * 素の敵の攻撃力(コウモリ6・骸骨8・ゾンビ10・人狼12・パンプキン16)だと、
 * **浅い所では軽〜中・深い所や色つきでは重**へ自然に寄る。
 */
export const PLAYER_HURT_TIERS: readonly PlayerHurtReaction[] = [
  { crouchMs: 180, stopMs: 40 },  // 軽: かすった
  { crouchMs: 300, stopMs: 70 },  // 中: まともに食らった(従来の一律値がここ)
  { crouchMs: 460, stopMs: 110 }, // 重: 保たない一撃
];

/** 被弾量と最大HPから段(0=軽 / 1=中 / 2=重)を返す。 */
export const playerHurtTier = (damage: number, maxHealth: number): 0 | 1 | 2 => {
  const hp = Math.max(1, maxHealth); // 0除算と負値を潰す(最大HPは成長で動く)
  const frac = Math.max(0, damage) / hp;
  if (frac >= PLAYER_HURT_TIER_FRACS[1]) return 2;
  if (frac >= PLAYER_HURT_TIER_FRACS[0]) return 1;
  return 0;
};

/** 段の反応を引く。範囲外の段は軽へ丸める(セーブ跨ぎ等で壊れた値が来ても落ちない)。 */
export const playerHurtReactionOf = (tier: number | undefined): PlayerHurtReaction =>
  PLAYER_HURT_TIERS[tier === 1 || tier === 2 ? tier : 0];

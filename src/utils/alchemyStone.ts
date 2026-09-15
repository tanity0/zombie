// UNIQUE_WEAPONS.md §16-2/§16-5(バッチD「錬金砲」glauncher-t2-alchemy)。
// 破裂(弱い範囲)→ 範囲内の敵へ金の石を付着 → 石持ちに再命中で最大3段階まで成長 →
// 指を離した瞬間に全部起爆。石は「敵ごとの状態」なので、ハンドキャノンの減衰台帳
// (handcannonDecay.ts)と同じ作法で純関数モジュールに切り出す(ただしこちらは寿命の無い
// 単純なカウンタ=敵に紐づく Enemy.alchemyStoneStage 自体が台帳。ここは値の計算だけ持つ)。
//
// ★粒度(社長発注文どおり): 「錬金弾の範囲攻撃が当たるごとに1段階」。射撃(トリガー)単位でも
// ペレット単位でもなく、「この破裂が敵に届いた回数」で数える(count:1の武器なので実質1トリガー
// 1回だが、意味としては「範囲攻撃が当たった回数」)。

export const ALCHEMY_BURST_RADIUS_PX = 70;   // 破裂(弱い範囲)の半径(§16-1)
export const ALCHEMY_DETONATE_RADIUS_PX = 110; // 起爆(視覚)の半径(§16-1)。3段(最大)の範囲攻撃半径と同値。
export const ALCHEMY_STONE_MAX_STAGE = 3;
export const ALCHEMY_STONE_DAMAGE_BY_STAGE: readonly number[] = [60, 120, 200]; // 1段/2段/3段(§16-1)
// UNIQUE_WEAPONS.md §16-5c(バッチD検収A-1是正): 起爆は「範囲攻撃」——段階ごとに半径が増える。
// 中心(石持ち本体)は満額、外へ向かって減衰(既定グレネードのsplashと同じ0.55+falloff*0.45の形)。
export const ALCHEMY_DETONATE_RADIUS_BY_STAGE: readonly number[] = [70, 90, 110]; // 1段/2段/3段(§16-5c)

/** 石の段階を1つ進める(上限3で頭打ち)。未所持(undefined/0)→1段目。 */
export const nextAlchemyStoneStage = (current: number | undefined): number =>
  Math.min(ALCHEMY_STONE_MAX_STAGE, Math.max(0, current ?? 0) + 1);

/** 起爆時、石の段階(1-3)に対応する固定ダメージ値(中心=満額)。範囲外の段はクランプする。 */
export const alchemyStoneDetonateDamage = (stage: number): number =>
  ALCHEMY_STONE_DAMAGE_BY_STAGE[Math.max(1, Math.min(ALCHEMY_STONE_MAX_STAGE, Math.round(stage))) - 1];

/** 起爆時、石の段階(1-3)に対応する範囲攻撃の半径(§16-5c)。範囲外の段はクランプする。 */
export const alchemyStoneDetonateRadius = (stage: number): number =>
  ALCHEMY_DETONATE_RADIUS_BY_STAGE[Math.max(1, Math.min(ALCHEMY_STONE_MAX_STAGE, Math.round(stage))) - 1];

/**
 * 1サイクル(破裂4発+3段まで育てた石1個の起爆)の実効DPS(UNIQUE_WEAPONS.md §5-2)。
 * 単体を相手にした叩き台の測り方: 破裂4回(magSize分)+石の起爆1回を、
 * マガジン4発ぶんのcooldown+実効リロードで割る。
 */
export const alchemyCycleDps = (
  burstDamage: number,
  burstCooldownMs: number,
  magSize: number,
  reloadMsRaw: number,
  stoneDetonateDamage: number,
): number => {
  const effectiveReloadMs = Math.max(250, reloadMsRaw * 2);
  const totalDamage = burstDamage * magSize + stoneDetonateDamage;
  const cycleMs = burstCooldownMs * magSize + effectiveReloadMs;
  return (totalDamage / cycleMs) * 1000;
};

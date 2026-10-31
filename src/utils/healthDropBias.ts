/**
 * ★回復(肉)の出やすさを体力に連動させる(社長裁定2026-10-16・まとめHTML C9「遠征時の回復が足りない」→「前者」)。
 * 体力が 50% 以下なら 1.5倍、20% 以下なら 2倍。満タン寄りでは従来どおり(1倍)。
 * 使う場所: 敵を倒した時の肉の抽選(useGameLoop)と、松明を壊した時の回復の窓(gameStore.dropBreakablePropLoot)。
 * 純関数(実装精度の規律4)。仕組みは足さない=既存の確率に掛けるだけ。
 */
export const HEALTH_DROP_HALF_FRAC = 0.5;
export const HEALTH_DROP_HALF_MULT = 1.5;
export const HEALTH_DROP_LOW_FRAC = 0.2;
export const HEALTH_DROP_LOW_MULT = 2;

export const healthDropMult = (health: number, maxHealth: number): number => {
  if (!(maxHealth > 0)) return 1;
  const frac = health / maxHealth;
  if (frac <= HEALTH_DROP_LOW_FRAC) return HEALTH_DROP_LOW_MULT;
  if (frac <= HEALTH_DROP_HALF_FRAC) return HEALTH_DROP_HALF_MULT;
  return 1;
};

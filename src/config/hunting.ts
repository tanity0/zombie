export const HUNTING_MELEE_RADIUS_BONUS_BY_LEVEL = [0, 18, 24, 34] as const;
export const HUNTING_CHARGE_MS_BY_LEVEL = [0, 2500, 2000, 1500] as const;

export const huntingChargeSecondsLabel = (level: number): string => {
  const ms = HUNTING_CHARGE_MS_BY_LEVEL[Math.max(1, Math.min(3, level))];
  return Number.isInteger(ms / 1000) ? String(ms / 1000) : (ms / 1000).toFixed(1);
};

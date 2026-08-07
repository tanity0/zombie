import type { Enemy, EnemyType } from '../types/game';
import { isEngageableBoss } from './bossEngagement';

export type BossPostureImpact = 'counter' | 'melee' | 'heavy' | 'gun-crit';

export const BOSS_POSTURE_BREAK_MS = 2200;
export const BOSS_POSTURE_RECOVERY_DELAY_MS = 8000;
export const BOSS_POSTURE_RECOVERY_PER_SEC = 0.03;
export const BOSS_POSTURE_REBREAK_LOCK_MS = 6000;
export const BOSS_BREAK_REWARD_HP_RATIO = 0.25;

const IMPACT_RATIO: Record<BossPostureImpact, number> = {
  counter: 0.20,
  melee: 0.04,
  heavy: 0.10,
  'gun-crit': 0.05,
};

export const bossPostureMax = (type: EnemyType): number => {
  if (type === 'giantbat') return 80;
  if (type === 'mimir' || type === 'jormungand' || type === 'skadi' || type === 'thor') return 120;
  return 100;
};

export const bossPostureNow = (enemy: Enemy): number =>
  Math.max(0, Math.min(bossPostureMax(enemy.type), enemy.bossPosture ?? bossPostureMax(enemy.type)));

export const isBossPostureBroken = (enemy: Enemy, gameTime: number): boolean =>
  isEngageableBoss(enemy.type)
  && enemy.bossFullStunUntil !== undefined
  && gameTime < enemy.bossFullStunUntil;

export const applyBossPostureDamage = (
  enemy: Enemy,
  impact: BossPostureImpact,
  gameTime: number,
): { patch: Partial<Enemy>; triggered: boolean } | null => {
  if (!isEngageableBoss(enemy.type) || isBossPostureBroken(enemy, gameTime)) return null;
  if (gameTime < (enemy.bossPostureLockUntil ?? 0)) return null;
  const max = bossPostureMax(enemy.type);
  const before = bossPostureNow(enemy);
  const after = Math.max(0, before - max * IMPACT_RATIO[impact]);
  let recoveryCap = enemy.bossPostureRecoveryCap ?? max;
  for (const checkpoint of [0.75, 0.50, 0.25]) {
    const value = max * checkpoint;
    if (before > value && after <= value) recoveryCap = Math.min(recoveryCap, value);
  }
  if (after > 0) {
    return {
      patch: { bossPosture: after, bossPostureRecoveryCap: recoveryCap, bossPostureLastDamageAt: gameTime },
      triggered: false,
    };
  }
  const until = gameTime + BOSS_POSTURE_BREAK_MS;
  return {
    patch: {
      bossPosture: 0,
      bossPostureRecoveryCap: 0,
      bossPostureLastDamageAt: gameTime,
      bossFullStunUntil: until,
      stunUntil: until,
      bossPostureLockUntil: until + BOSS_POSTURE_REBREAK_LOCK_MS,
      bossBreakRewardRemaining: enemy.maxHealth * BOSS_BREAK_REWARD_HP_RATIO,
    },
    triggered: true,
  };
};

export const tickBossPosture = (enemy: Enemy, gameTime: number, deltaTime: number): Partial<Enemy> | null => {
  if (!isEngageableBoss(enemy.type)) return null;
  const max = bossPostureMax(enemy.type);
  if (enemy.bossFullStunUntil !== undefined) {
    if (gameTime < enemy.bossFullStunUntil) return null;
    return {
      bossPosture: max,
      bossPostureRecoveryCap: max,
      bossFullStunUntil: undefined,
      bossBreakRewardRemaining: undefined,
      stunUntil: enemy.stunUntil === enemy.bossFullStunUntil ? undefined : enemy.stunUntil,
    };
  }
  const posture = bossPostureNow(enemy);
  if (posture >= max || gameTime < (enemy.bossPostureLastDamageAt ?? -Infinity) + BOSS_POSTURE_RECOVERY_DELAY_MS) return null;
  const cap = enemy.bossPostureRecoveryCap ?? max;
  const next = Math.min(cap, posture + max * BOSS_POSTURE_RECOVERY_PER_SEC * deltaTime);
  return next === posture ? null : { bossPosture: next };
};

export const applyBrokenGunReward = (
  enemy: Enemy, baseDamage: number, gameTime: number,
): { damage: number; patch: Partial<Enemy> } | null => {
  if (!isBossPostureBroken(enemy, gameTime)) return null;
  const remaining = Math.max(0, enemy.bossBreakRewardRemaining ?? 0);
  const bonus = Math.min(remaining, baseDamage * 4);
  return { damage: baseDamage + bonus, patch: { bossBreakRewardRemaining: remaining - bonus } };
};

export const applyBrokenMeleeFatal = (
  enemy: Enemy, baseDamage: number, gameTime: number,
): { damage: number; patch: Partial<Enemy> } | null => {
  if (!isBossPostureBroken(enemy, gameTime)) return null;
  return {
    damage: baseDamage * 5 + Math.max(0, enemy.bossBreakRewardRemaining ?? 0),
    patch: {
      bossPosture: bossPostureMax(enemy.type),
      bossPostureRecoveryCap: bossPostureMax(enemy.type),
      bossFullStunUntil: undefined,
      bossBreakRewardRemaining: undefined,
      stunUntil: undefined,
      bossPostureLockUntil: gameTime + BOSS_POSTURE_REBREAK_LOCK_MS,
    },
  };
};

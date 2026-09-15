import type { Enemy, EnemyType, EscortSoldier } from '../types/game';
import { isHiddenBoss, isPumpkinTier, isReaperFamily } from './enemyUtils';

export type EscortAdvanceZone = 'none' | 'front' | 'side' | 'rear';

export interface EscortAdvanceGoal {
  x: number;
  y: number;
}

export interface EscortAdvanceResult {
  zone: EscortAdvanceZone;
  speedTarget: number;
  speedMult: number;
  halted: boolean;
  callHelp: boolean;
  target?: Enemy;
  frontCount: number;
  surroundCount: number;
  strongNear: boolean;
  surroundedNow: boolean;
  rescuedNow: boolean;
  wasSurrounded: boolean;
  helpRequested: boolean;
  rescuedUntil: number;
  advanceDirX: number;
  advanceDirY: number;
  advanceRampFrom: number;
  advanceRampAt: number;
}

export interface EscortAdvanceOptions {
  detectRadius: number;
  now: number;
  surroundRadius?: number;
  surroundCount?: number;
  rescuedFree?: number;
  strongNearEnter?: number;
  strongNearExit?: number;
  rescueDurationMs?: number;
  accelerationMs?: number;
}

const FRONT_ENTER_COS = Math.cos(Math.PI / 4);
const FRONT_EXIT_COS = Math.cos((55 * Math.PI) / 180);
const REAR_ENTER_COS = -FRONT_ENTER_COS;
const REAR_EXIT_COS = -FRONT_EXIT_COS;

export const isEscortStrongEnemy = (type: EnemyType): boolean =>
  isHiddenBoss(type) || isPumpkinTier(type) || type === 'giantbat' || isReaperFamily(type) ||
  type === 'lab-zombie-3' || type === 'hunter';

const enemyCenterDist2 = (x: number, y: number, enemy: Enemy): number => {
  const dx = enemy.x + enemy.width / 2 - x;
  const dy = enemy.y + enemy.height / 2 - y;
  return dx * dx + dy * dy;
};

const enemyAabbDist2 = (x: number, y: number, enemy: Enemy): number => {
  const nx = Math.max(enemy.x, Math.min(x, enemy.x + enemy.width));
  const ny = Math.max(enemy.y, Math.min(y, enemy.y + enemy.height));
  return (x - nx) * (x - nx) + (y - ny) * (y - ny);
};

const zoneForDot = (dot: number, previous: EscortAdvanceZone): Exclude<EscortAdvanceZone, 'none'> => {
  const frontThreshold = previous === 'front' ? FRONT_EXIT_COS : FRONT_ENTER_COS;
  const rearThreshold = previous === 'rear' ? REAR_EXIT_COS : REAR_ENTER_COS;
  if (dot >= frontThreshold) return 'front';
  if (dot <= rearThreshold) return 'rear';
  return 'side';
};

const zoneSpeed = (zone: EscortAdvanceZone): number => {
  if (zone === 'front') return 0;
  if (zone === 'side') return 0.5;
  if (zone === 'rear') return 0.7;
  return 1;
};

const rampedSpeed = (
  escort: EscortSoldier,
  target: number,
  now: number,
  accelerationMs: number,
): { speed: number; from: number; at: number } => {
  const previousTarget = escort.advanceSpeedTarget;
  if (previousTarget === undefined || escort.advanceSpeedMult === undefined) {
    return { speed: target, from: target, at: now };
  }

  let from = escort.advanceRampFrom ?? escort.advanceSpeedMult;
  let at = escort.advanceRampAt ?? now;
  let current = escort.advanceSpeedMult;
  if (previousTarget > from) {
    const t = Math.max(0, Math.min(1, (now - at) / Math.max(1, accelerationMs)));
    current = from + (previousTarget - from) * t;
  } else {
    current = previousTarget;
  }

  // Any newly slower target takes effect immediately. Faster targets start a
  // fresh, exactly-one-second ramp from the speed reached this frame.
  if (target < previousTarget) return { speed: target, from: target, at: now };
  if (target > previousTarget) {
    from = current;
    at = now;
    return { speed: current, from, at };
  }
  return { speed: Math.min(target, current), from, at };
};

/**
 * Pure four-sector advance decision for base and corridor escorts.
 * Enemy scans are shared for movement, help dialogue, and shooting selection.
 */
export const escortAdvance = (
  escort: EscortSoldier,
  goal: EscortAdvanceGoal,
  enemies: readonly Enemy[],
  options: EscortAdvanceOptions,
): EscortAdvanceResult => {
  const surroundRadius = options.surroundRadius ?? 200;
  const surroundThreshold = options.surroundCount ?? 3;
  const rescuedFree = options.rescuedFree ?? 1;
  const strongNearEnter = options.strongNearEnter ?? 111;
  const strongNearExit = options.strongNearExit ?? 150;
  const rescueDurationMs = options.rescueDurationMs ?? 5000;
  const accelerationMs = options.accelerationMs ?? 1000;

  let dirX = escort.advanceDirX ?? 1;
  let dirY = escort.advanceDirY ?? 0;
  const goalDx = goal.x - escort.x;
  const goalDy = goal.y - escort.y;
  const goalDist = Math.hypot(goalDx, goalDy);
  const atGoal = goalDist < 2;
  if (!atGoal && Number.isFinite(goalDist)) {
    dirX = goalDx / goalDist;
    dirY = goalDy / goalDist;
  }

  const previousZone = escort.advanceZone ?? 'none';
  let zone: EscortAdvanceZone = 'none';
  let target: Enemy | undefined;
  let targetDist2 = options.detectRadius * options.detectRadius;
  let surroundCount = 0;
  let frontCount = 0;
  let strongNear = false;
  const detect2 = options.detectRadius * options.detectRadius;
  const surround2 = surroundRadius * surroundRadius;
  const strongLimit = escort.strongNear ? strongNearExit : strongNearEnter;
  const strongLimit2 = strongLimit * strongLimit;

  for (const enemy of enemies) {
    const centerDist2 = enemyCenterDist2(escort.x, escort.y, enemy);
    const ex = enemy.x + enemy.width / 2 - escort.x;
    const ey = enemy.y + enemy.height / 2 - escort.y;
    const enemyDist = Math.hypot(ex, ey);
    const dot = atGoal || enemyDist === 0 ? 1 : (ex / enemyDist) * dirX + (ey / enemyDist) * dirY;
    const enemyZone = atGoal ? 'front' : zoneForDot(dot, previousZone);

    if (centerDist2 <= detect2) {
      if (zoneSpeed(enemyZone) < zoneSpeed(zone)) zone = enemyZone;
      if (enemy.aiPhase !== 'jump' && centerDist2 < targetDist2) {
        targetDist2 = centerDist2;
        target = enemy;
      }
    }
    if (centerDist2 <= surround2) {
      surroundCount += 1;
      if (enemyZone === 'front') frontCount += 1;
    }
    if (isEscortStrongEnemy(enemy.type) && enemyAabbDist2(escort.x, escort.y, enemy) <= strongLimit2) {
      strongNear = true;
    }
  }

  const rawCallHelp = frontCount >= 4 || strongNear;
  let rescuedUntil = escort.rescuedUntil ?? 0;
  let rescueActive = options.now < rescuedUntil;
  let helpRequested = escort.helpRequested ?? false;
  let wasSurrounded = escort.wasSurrounded ?? false;
  let surroundedNow = false;
  let rescuedNow = false;

  if (!rescueActive && rawCallHelp) helpRequested = true;
  if (!rescueActive && (surroundCount >= surroundThreshold || rawCallHelp) && !wasSurrounded) {
    wasSurrounded = true;
    surroundedNow = true;
  }
  if (wasSurrounded && surroundCount <= rescuedFree && !strongNear) {
    wasSurrounded = false;
    rescuedNow = true;
    if (helpRequested) {
      helpRequested = false;
      rescuedUntil = options.now + rescueDurationMs;
      rescueActive = true;
    }
  }

  let speedTarget = zoneSpeed(zone);
  if (rescueActive) speedTarget = 1;
  else if (rawCallHelp) speedTarget = 0;
  if (strongNear) speedTarget = 0;
  const ramp = rampedSpeed(escort, speedTarget, options.now, accelerationMs);

  return {
    zone,
    speedTarget,
    speedMult: ramp.speed,
    halted: speedTarget === 0,
    callHelp: !rescueActive && rawCallHelp,
    target,
    frontCount,
    surroundCount,
    strongNear,
    surroundedNow,
    rescuedNow,
    wasSurrounded,
    helpRequested,
    rescuedUntil,
    advanceDirX: dirX,
    advanceDirY: dirY,
    advanceRampFrom: ramp.from,
    advanceRampAt: ramp.at,
  };
};

import { describe, expect, it } from 'vitest';
import {
  resolvePumpkinTier, allowDrillerForRun, allowLoggerForRun, drillerZoneFor, drillerCanThrust,
  isDrillerRetreating, isRetreatEligibleType, isKiteMidAttackPhase,
  DRILLER_APPROACH_DIST, DRILLER_BACKOFF_DIST, DRILLER_THRUST_RANGE,
} from './drillerAi';

// PACING_PUZZLE.md §14-3裁定済み#2(伐採人・logger): resolvePumpkinTierの拡張。
// stage-3=pumpkin/logger 2種50%分け合い、stage-4以降=pumpkin/driller/logger 3等分。
describe('resolvePumpkinTier', () => {
  it('always returns pumpkin when both allow flags are false (対象ステージ外/計測路)', () => {
    expect(resolvePumpkinTier(false, false, () => 0)).toBe('pumpkin');
    expect(resolvePumpkinTier(false, false, () => 0.999)).toBe('pumpkin');
  });

  it('stage-3(allowLoggerのみ): pumpkin/logger 50%分け合い', () => {
    expect(resolvePumpkinTier(false, true, () => 0)).toBe('logger');
    expect(resolvePumpkinTier(false, true, () => 0.49)).toBe('logger');
    expect(resolvePumpkinTier(false, true, () => 0.5)).toBe('pumpkin');
    expect(resolvePumpkinTier(false, true, () => 0.99)).toBe('pumpkin');
  });

  it('stage-4〜7(両方allow): pumpkin/driller/logger 3等分', () => {
    expect(resolvePumpkinTier(true, true, () => 0)).toBe('driller');
    expect(resolvePumpkinTier(true, true, () => 0.32)).toBe('driller');
    expect(resolvePumpkinTier(true, true, () => 1 / 3)).toBe('logger');
    expect(resolvePumpkinTier(true, true, () => 0.65)).toBe('logger');
    expect(resolvePumpkinTier(true, true, () => 2 / 3)).toBe('pumpkin');
    expect(resolvePumpkinTier(true, true, () => 0.99)).toBe('pumpkin');
  });

  it('allowDrillerのみ(現行のステージ集合では起こらないが安全側フォールバック): pumpkin/driller 50%', () => {
    expect(resolvePumpkinTier(true, false, () => 0)).toBe('driller');
    expect(resolvePumpkinTier(true, false, () => 0.49)).toBe('driller');
    expect(resolvePumpkinTier(true, false, () => 0.5)).toBe('pumpkin');
  });
});

describe('allowDrillerForRun', () => {
  it('gates on stage-4..7', () => {
    expect(allowDrillerForRun('stage-4', false)).toBe(true);
    expect(allowDrillerForRun('stage-5', false)).toBe(true);
    expect(allowDrillerForRun('stage-6', false)).toBe(true);
    expect(allowDrillerForRun('stage-7', false)).toBe(true);
    expect(allowDrillerForRun('stage-1', false)).toBe(false);
    expect(allowDrillerForRun('stage-3', false)).toBe(false);
    expect(allowDrillerForRun(null, false)).toBe(false);
    expect(allowDrillerForRun(undefined, false)).toBe(false);
  });

  it('is always false on a measurement run (boss maker / gauntlet), even in stage-4..7', () => {
    expect(allowDrillerForRun('stage-4', true)).toBe(false);
    expect(allowDrillerForRun('stage-7', true)).toBe(false);
  });
});

// PACING_PUZZLE.md §14-3裁定済み#2: logger は stage-3から(driller=stage-4からより1段広い)。
describe('allowLoggerForRun', () => {
  it('gates on stage-3..7', () => {
    expect(allowLoggerForRun('stage-3', false)).toBe(true);
    expect(allowLoggerForRun('stage-4', false)).toBe(true);
    expect(allowLoggerForRun('stage-7', false)).toBe(true);
    expect(allowLoggerForRun('stage-1', false)).toBe(false);
    expect(allowLoggerForRun('stage-2', false)).toBe(false);
    expect(allowLoggerForRun(null, false)).toBe(false);
    expect(allowLoggerForRun(undefined, false)).toBe(false);
  });

  it('is always false on a measurement run (boss maker / gauntlet), even in stage-3..7', () => {
    expect(allowLoggerForRun('stage-3', true)).toBe(false);
    expect(allowLoggerForRun('stage-7', true)).toBe(false);
  });
});

// PACING_PUZZLE.md §14-2④: 近接被弾retreatの機構をdriller/logger間で共有する述語。
describe('isRetreatEligibleType', () => {
  it('driller/logger のみtrue', () => {
    expect(isRetreatEligibleType('driller')).toBe(true);
    expect(isRetreatEligibleType('logger')).toBe(true);
    expect(isRetreatEligibleType('pumpkin')).toBe(false);
    expect(isRetreatEligibleType('zombie')).toBe(false);
  });
});

// PACING_PUZZLE.md §9-8②+§14-2: 距離リサイクル除外(突き3州+薙ぎ払い3州)。
describe('isKiteMidAttackPhase', () => {
  it('driller-thrustの3州でtrue', () => {
    expect(isKiteMidAttackPhase('driller-thrust-windup')).toBe(true);
    expect(isKiteMidAttackPhase('driller-thrust-active')).toBe(true);
    expect(isKiteMidAttackPhase('driller-thrust-recover')).toBe(true);
  });

  it('logger-sweepの3州でtrue', () => {
    expect(isKiteMidAttackPhase('logger-sweep-windup')).toBe(true);
    expect(isKiteMidAttackPhase('logger-sweep-active')).toBe(true);
    expect(isKiteMidAttackPhase('logger-sweep-recover')).toBe(true);
  });

  it('無関係なaiPhase/undefinedはfalse', () => {
    expect(isKiteMidAttackPhase('jump')).toBe(false);
    expect(isKiteMidAttackPhase(undefined)).toBe(false);
  });
});

describe('drillerZoneFor (§9-4 間合い3分岐)', () => {
  it('approaches when farther than 190px', () => {
    expect(drillerZoneFor(191)).toBe('approach');
    expect(drillerZoneFor(500)).toBe('approach');
  });

  it('backs off when closer than 130px', () => {
    expect(drillerZoneFor(129)).toBe('backoff');
    expect(drillerZoneFor(0)).toBe('backoff');
  });

  it('holds inside the 130-190px band (inclusive)', () => {
    expect(drillerZoneFor(DRILLER_BACKOFF_DIST)).toBe('hold');
    expect(drillerZoneFor(160)).toBe('hold');
    expect(drillerZoneFor(DRILLER_APPROACH_DIST)).toBe('hold');
  });
});

describe('drillerCanThrust', () => {
  it('true at or under 200px, false beyond', () => {
    expect(drillerCanThrust(0)).toBe(true);
    expect(drillerCanThrust(DRILLER_THRUST_RANGE)).toBe(true);
    expect(drillerCanThrust(DRILLER_THRUST_RANGE + 0.1)).toBe(false);
  });
});

describe('isDrillerRetreating', () => {
  it('false when undefined or expired', () => {
    expect(isDrillerRetreating(undefined, 1000)).toBe(false);
    expect(isDrillerRetreating(900, 1000)).toBe(false);
    expect(isDrillerRetreating(1000, 1000)).toBe(false);
  });

  it('true while within the window', () => {
    expect(isDrillerRetreating(1001, 1000)).toBe(true);
    expect(isDrillerRetreating(3000, 1000)).toBe(true);
  });
});

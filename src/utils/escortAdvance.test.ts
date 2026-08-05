import { describe, expect, it } from 'vitest';
import type { Enemy, EnemyType, EscortSoldier } from '../types/game';
import { escortAdvance, isEscortStrongEnemy, type EscortAdvanceResult } from './escortAdvance';

const enemy = (id: string, x: number, y: number, type: EnemyType = 'zombie', aiPhase?: Enemy['aiPhase']): Enemy => ({
  id,
  x: x - 5,
  y: y - 5,
  width: 10,
  height: 10,
  type,
  aiPhase,
} as Enemy);

const escort = (extra: Partial<EscortSoldier> = {}): EscortSoldier => ({
  id: 'escort-0',
  baseId: 'base-0',
  x: 0,
  y: 0,
  face: 1,
  soldierIndex: 0,
  fireAt: 0,
  dwellMs: 0,
  ...extra,
});

const options = (now = 0) => ({ detectRadius: 250, surroundRadius: 200, now });

const carry = (source: EscortSoldier, result: EscortAdvanceResult): EscortSoldier => ({
  ...source,
  advanceZone: result.zone,
  advanceDirX: result.advanceDirX,
  advanceDirY: result.advanceDirY,
  advanceSpeedMult: result.speedMult,
  advanceSpeedTarget: result.speedTarget,
  advanceRampFrom: result.advanceRampFrom,
  advanceRampAt: result.advanceRampAt,
  strongNear: result.strongNear,
  wasSurrounded: result.wasSurrounded,
  helpRequested: result.helpRequested,
  rescuedUntil: result.rescuedUntil,
});

describe('escortAdvance', () => {
  it.each([
    ['front', [enemy('e', 100, 0)], 0],
    ['side', [enemy('e', 0, 100)], 0.5],
    ['rear', [enemy('e', -100, 0)], 0.7],
    ['none', [], 1],
  ] as const)('%s sector selects speed %s', (_zone, enemies, speed) => {
    const result = escortAdvance(escort(), { x: 1000, y: 0 }, enemies, options());
    expect(result.zone).toBe(_zone);
    expect(result.speedTarget).toBe(speed);
    expect(result.speedMult).toBe(speed);
  });

  it('uses the slowest occupied sector and can shoot rear targets', () => {
    const rear = enemy('rear', -90, 0);
    const result = escortAdvance(escort(), { x: 1000, y: 0 }, [rear, enemy('front', 100, 0)], options());
    expect(result.zone).toBe('front');
    expect(result.speedTarget).toBe(0);
    expect(result.target?.id).toBe('rear');
  });

  it('holds front through 55 degrees after entering at 45 degrees', () => {
    const atAngle = (degrees: number) => enemy('angled', Math.cos(degrees * Math.PI / 180) * 100, Math.sin(degrees * Math.PI / 180) * 100);
    const entered = escortAdvance(escort(), { x: 1000, y: 0 }, [atAngle(44)], options());
    expect(entered.zone).toBe('front');
    const held = escortAdvance(carry(escort(), entered), { x: 1000, y: 0 }, [atAngle(50)], options(16));
    expect(held.zone).toBe('front');
    expect(escortAdvance(escort(), { x: 1000, y: 0 }, [atAngle(50)], options()).zone).toBe('side');
    expect(escortAdvance(carry(escort(), held), { x: 1000, y: 0 }, [atAngle(56)], options(32)).zone).toBe('side');
  });

  it('halts and calls for help for one nearby strong enemy, even behind', () => {
    const result = escortAdvance(escort(), { x: 1000, y: 0 }, [enemy('boss', -100, 0, 'pumpkin')], options());
    expect(result.zone).toBe('rear');
    expect(result.strongNear).toBe(true);
    expect(result.halted).toBe(true);
    expect(result.callHelp).toBe(true);
  });

  it('halts for four front enemies inside the 200px threat radius even just outside shooting range', () => {
    const fourFront = [0, 1, 2, 3].map(i => enemy(`front-${i}`, 180 + i, i * 3));
    const result = escortAdvance(escort(), { x: 1000, y: 0 }, fourFront, { ...options(), detectRadius: 166.5 });
    expect(result.target).toBeUndefined();
    expect(result.frontCount).toBe(4);
    expect(result.callHelp).toBe(true);
    expect(result.speedTarget).toBe(0);
    expect(result.halted).toBe(true);
  });

  it('treats every direction as front at the goal and retains a finite last direction', () => {
    const result = escortAdvance(escort({ advanceDirX: 0, advanceDirY: -1 }), { x: 0, y: 0 }, [enemy('rear', 0, 100)], options());
    expect(result.zone).toBe('front');
    expect(result.advanceDirX).toBe(0);
    expect(result.advanceDirY).toBe(-1);
    expect(Number.isFinite(result.advanceDirX)).toBe(true);
    expect(Number.isFinite(result.advanceDirY)).toBe(true);
  });

  it('counts a jumping enemy for movement but excludes it from shooting', () => {
    const result = escortAdvance(escort(), { x: 1000, y: 0 }, [enemy('jump', 100, 0, 'pumpkin', 'jump')], options());
    expect(result.zone).toBe('front');
    expect(result.speedTarget).toBe(0);
    expect(result.target).toBeUndefined();
    expect(result.strongNear).toBe(true);
  });

  it('takes exactly one second to accelerate and slows immediately', () => {
    const stopped = escortAdvance(escort(), { x: 1000, y: 0 }, [enemy('front', 100, 0)], options(0));
    const stoppedEscort = carry(escort(), stopped);
    const rampStart = escortAdvance(stoppedEscort, { x: 1000, y: 0 }, [], options(100));
    expect(rampStart.speedMult).toBe(0);
    const halfway = escortAdvance(carry(stoppedEscort, rampStart), { x: 1000, y: 0 }, [], options(600));
    expect(halfway.speedMult).toBeCloseTo(0.5);
    const full = escortAdvance(carry(carry(stoppedEscort, rampStart), halfway), { x: 1000, y: 0 }, [], options(1100));
    expect(full.speedMult).toBe(1);
    const slowed = escortAdvance(carry(carry(carry(stoppedEscort, rampStart), halfway), full), { x: 1000, y: 0 }, [enemy('side', 0, 100)], options(1116));
    expect(slowed.speedMult).toBe(0.5);
  });

  it('grants five seconds of full-speed target only after a real help request', () => {
    const fourFront = [0, 1, 2, 3].map(i => enemy(`front-${i}`, 100 + i, i * 3));
    const requested = escortAdvance(escort(), { x: 1000, y: 0 }, fourFront, options(0));
    expect(requested.callHelp).toBe(true);
    expect(requested.helpRequested).toBe(true);

    const rescued = escortAdvance(carry(escort(), requested), { x: 1000, y: 0 }, [enemy('rear', -100, 0)], options(100));
    expect(rescued.rescuedNow).toBe(true);
    expect(rescued.rescuedUntil).toBe(5100);
    expect(rescued.speedTarget).toBe(1);
    expect(rescued.speedMult).toBe(0);

    const rescuedEscort = carry(carry(escort(), requested), rescued);
    const full = escortAdvance(rescuedEscort, { x: 1000, y: 0 }, fourFront, options(1100));
    expect(full.speedTarget).toBe(1);
    expect(full.speedMult).toBe(1);
    const expired = escortAdvance(carry(rescuedEscort, full), { x: 1000, y: 0 }, fourFront, options(5200));
    expect(expired.speedTarget).toBe(0);
    expect(expired.speedMult).toBe(0);

    const strongDuringWindow = escortAdvance(rescuedEscort, { x: 1000, y: 0 }, [enemy('boss', -100, 0, 'pumpkin')], options(200));
    expect(strongDuringWindow.speedTarget).toBe(0);
    expect(strongDuringWindow.halted).toBe(true);
  });

  it('keeps the 3-enemy dialogue latch separate from the 4-front help boost', () => {
    const threeSide = [0, 1, 2].map(i => enemy(`side-${i}`, i * 3, 100 + i));
    const surrounded = escortAdvance(escort(), { x: 1000, y: 0 }, threeSide, options(0));
    expect(surrounded.surroundedNow).toBe(true);
    expect(surrounded.helpRequested).toBe(false);
    const cleared = escortAdvance(carry(escort(), surrounded), { x: 1000, y: 0 }, [], options(100));
    expect(cleared.rescuedNow).toBe(true);
    expect(cleared.rescuedUntil).toBe(0);
  });
});

describe('isEscortStrongEnemy', () => {
  it('includes hidden bosses and set-piece threats but not normal enemies', () => {
    expect(isEscortStrongEnemy('mimir')).toBe(true);
    expect(isEscortStrongEnemy('reaper')).toBe(true);
    expect(isEscortStrongEnemy('lab-zombie-3')).toBe(true);
    expect(isEscortStrongEnemy('zombie')).toBe(false);
  });
});

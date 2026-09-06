import { describe, it, expect } from 'vitest';
import {
  ALCHEMY_STONE_MAX_STAGE,
  ALCHEMY_STONE_DAMAGE_BY_STAGE,
  nextAlchemyStoneStage,
  alchemyStoneDetonateDamage,
  alchemyCycleDps,
} from './alchemyStone';

describe('nextAlchemyStoneStage', () => {
  it('未所持(undefined)は1段目から始まり、以後+1ずつ、3段で頭打ち', () => {
    expect(nextAlchemyStoneStage(undefined)).toBe(1);
    expect(nextAlchemyStoneStage(1)).toBe(2);
    expect(nextAlchemyStoneStage(2)).toBe(3);
    expect(nextAlchemyStoneStage(3)).toBe(3); // 上限
  });
});

describe('alchemyStoneDetonateDamage', () => {
  it('段階ごとに60/120/200(UNIQUE_WEAPONS.md §16-1)', () => {
    expect(alchemyStoneDetonateDamage(1)).toBe(60);
    expect(alchemyStoneDetonateDamage(2)).toBe(120);
    expect(alchemyStoneDetonateDamage(3)).toBe(200);
    expect(ALCHEMY_STONE_MAX_STAGE).toBe(3);
    expect(ALCHEMY_STONE_DAMAGE_BY_STAGE).toEqual([60, 120, 200]);
  });
});

describe('alchemyCycleDps(UNIQUE_WEAPONS.md §5-2/§16-1)', () => {
  it('破裂4発+3段起爆のサイクル実効DPSは48.48(既定glauncher-t2=45.83比+5.8%)', () => {
    const dps = alchemyCycleDps(30, 700, 4, 1900, 200);
    expect(dps).toBeCloseTo(48.48, 1);
    const ratio = dps / 45.83;
    expect(ratio).toBeGreaterThan(1);
    expect(ratio).toBeGreaterThanOrEqual(0.90);
    expect(ratio).toBeLessThanOrEqual(1.10);
  });
});

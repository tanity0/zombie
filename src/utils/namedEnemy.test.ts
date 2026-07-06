import { describe, it, expect } from 'vitest';
import {
  NAMED_ENEMY_NAMES, isPromotionExcluded, pickNamedEnemyName, rollNamedSpawnThisRun, decidePromotionOnDeath,
} from './namedEnemy';

describe('NAMED_ENEMY_NAMES', () => {
  it('has 32 distinct names (社長指示: 候補は多いほど良い)', () => {
    expect(NAMED_ENEMY_NAMES.length).toBe(32);
    expect(new Set(NAMED_ENEMY_NAMES).size).toBe(32);
  });
});

describe('isPromotionExcluded', () => {
  it('excludes castle boss (giantbat), reaper, hidden bosses, unknown killer, and red-night', () => {
    expect(isPromotionExcluded('giantbat', false)).toBe(true);
    expect(isPromotionExcluded('reaper', false)).toBe(true);
    expect(isPromotionExcluded('mimir', false)).toBe(true);
    expect(isPromotionExcluded('jormungand', false)).toBe(true);
    expect(isPromotionExcluded('skadi', false)).toBe(true);
    expect(isPromotionExcluded('thor', false)).toBe(true);
    expect(isPromotionExcluded(undefined, false)).toBe(true);
    expect(isPromotionExcluded(null, false)).toBe(true);
    expect(isPromotionExcluded('zombie', true)).toBe(true); // 紅き月中は対象外
  });

  it('allows ordinary chaff/nuisance types outside red night', () => {
    expect(isPromotionExcluded('zombie', false)).toBe(false);
    expect(isPromotionExcluded('skeleton', false)).toBe(false);
    expect(isPromotionExcluded('pumpkin', false)).toBe(false);
  });
});

describe('pickNamedEnemyName / rollNamedSpawnThisRun (RNG injection)', () => {
  it('picks the name at the injected RNG index deterministically', () => {
    expect(pickNamedEnemyName(() => 0)).toBe(NAMED_ENEMY_NAMES[0]);
    expect(pickNamedEnemyName(() => 0.999999)).toBe(NAMED_ENEMY_NAMES[31]);
  });

  it('rolls true/false at exactly the 60% boundary', () => {
    expect(rollNamedSpawnThisRun(() => 0.59)).toBe(true);
    expect(rollNamedSpawnThisRun(() => 0.6)).toBe(false);
  });
});

describe('decidePromotionOnDeath', () => {
  it('does nothing when killed by an excluded type', () => {
    expect(decidePromotionOnDeath('giantbat', false, false)).toEqual({ kind: 'none' });
    expect(decidePromotionOnDeath('reaper', false, false)).toEqual({ kind: 'none' });
    expect(decidePromotionOnDeath(undefined, false, false)).toEqual({ kind: 'none' });
    expect(decidePromotionOnDeath('zombie', false, true)).toEqual({ kind: 'none' }); // 紅き月中
  });

  it('grudges (no re-strengthen) when killed by the active named-foe instance itself, even for an excluded type', () => {
    expect(decidePromotionOnDeath('zombie', true, false)).toEqual({ kind: 'grudge' });
    expect(decidePromotionOnDeath('giantbat', true, false)).toEqual({ kind: 'grudge' }); // named-kill takes priority
  });

  it('overwrites (fresh promotion, grudge implicitly 0 by caller) when killed by a new eligible type', () => {
    const outcome = decidePromotionOnDeath('skeleton', false, false, () => 0);
    expect(outcome).toEqual({ kind: 'overwrite', type: 'skeleton', name: NAMED_ENEMY_NAMES[0] });
  });
});

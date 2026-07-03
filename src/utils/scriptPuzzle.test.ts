import { describe, it, expect } from 'vitest';
import {
  FORMATION_TABLE, HARVEST_PATTERN, patternsForRank, nuisanceTarget, selectPattern, allPatternsSeen,
  SPECIAL_SLOTS, eligibleSpecialSlots, nextSpecialDeficit, nextNuisanceDeficit,
  NUISANCE_CD_MS, SPECIAL_CD_MS, POST_HIT_GUARD_MS, pickChaffType, CHAFF_WEIGHTS_DEFAULT, CHAFF_WEIGHTS_HARVEST,
  decideNextSpawn, relaxBoardTarget, relaxCdMs, noNewSupplyNuisanceTarget, harvestCdMs, harvestTargetTick,
  ZERO_NUISANCE, type NuisanceCounts,
} from './scriptPuzzle';

describe('FORMATION_TABLE (社長決定・確定表)', () => {
  it('has the right pattern counts per rank (R1-R5=4, R6=2, R7=3)', () => {
    for (const r of [1, 2, 3, 4, 5] as const) expect(patternsForRank(r)).toHaveLength(4);
    expect(patternsForRank(6)).toHaveLength(2);
    expect(patternsForRank(7)).toHaveLength(3);
  });

  it('every pattern total (config for the whole board slot) stays within the documented max caps (犬3/弾3/ゴースト2 implied by pumpkin/plant peaks)', () => {
    const maxWerewolf = Math.max(...FORMATION_TABLE.map(p => p.nuisance.werewolf ?? 0));
    const maxPlant = Math.max(...FORMATION_TABLE.map(p => p.nuisance.plant ?? 0));
    const maxPumpkin = Math.max(...FORMATION_TABLE.map(p => p.nuisance.pumpkin ?? 0));
    expect(maxWerewolf).toBe(3);
    expect(maxPlant).toBe(3);
    expect(maxPumpkin).toBe(2);
  });

  it('R1-A is the empty (basic-set-only) pattern, used by HARVEST', () => {
    expect(nuisanceTarget(FORMATION_TABLE[0])).toEqual(ZERO_NUISANCE);
    expect(HARVEST_PATTERN).toBe(FORMATION_TABLE[0]);
  });

  it('all pattern ids are unique', () => {
    const ids = FORMATION_TABLE.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('selectPattern', () => {
  it('never repeats the immediately-previous pattern (when the rank has more than one option)', () => {
    for (let i = 0; i < 50; i++) {
      const picked = selectPattern(2, new Set(), 'R2-A', i / 50);
      expect(picked.id).not.toBe('R2-A');
    }
  });

  it('prefers unseen patterns over seen ones', () => {
    const seen = new Set(['R2-A', 'R2-B', 'R2-C']); // only R2-D unseen
    const picked = selectPattern(2, seen, null, 0.5);
    expect(picked.id).toBe('R2-D');
  });

  it('once all patterns for a rank are seen, allPatternsSeen reports true (caller resets the seen-set on this signal)', () => {
    const all = new Set(patternsForRank(3).map(p => p.id));
    expect(allPatternsSeen(3, all)).toBe(true);
    expect(allPatternsSeen(3, new Set())).toBe(false);
  });

  it('falls back to the single available pattern when everything else is excluded', () => {
    // R6 only has 2 patterns; excluding the last one and marking the other seen should still return something.
    const picked = selectPattern(6, new Set(['R6-A', 'R6-B']), 'R6-A', 0.9);
    expect(picked.id).toBe('R6-B');
  });
});

describe('special slots (distance-gated)', () => {
  it('screamer unlocks at area>=3, ghost at area>=4', () => {
    expect(eligibleSpecialSlots(2)).toHaveLength(0);
    expect(eligibleSpecialSlots(3).map(s => s.type)).toEqual(['screamer']);
    expect(eligibleSpecialSlots(4).map(s => s.type)).toEqual(['screamer', 'ghost']);
  });

  it('nextSpecialDeficit returns the first eligible type under its target count', () => {
    expect(nextSpecialDeficit(4, {})).toBe('screamer');
    expect(nextSpecialDeficit(4, { screamer: 1 })).toBe('ghost');
    expect(nextSpecialDeficit(4, { screamer: 1, ghost: 2 })).toBeNull();
  });

  it('caps match the table: screamer=1, ghost=2', () => {
    expect(SPECIAL_SLOTS.find(s => s.type === 'screamer')?.count).toBe(1);
    expect(SPECIAL_SLOTS.find(s => s.type === 'ghost')?.count).toBe(2);
  });
});

describe('nextNuisanceDeficit', () => {
  it('returns null when alive already meets or exceeds target for every type', () => {
    const target: NuisanceCounts = { plant: 1, werewolf: 0, pumpkin: 2 };
    expect(nextNuisanceDeficit(target, { plant: 1, werewolf: 0, pumpkin: 2 })).toBeNull();
  });
  it('returns a deficit type when alive is short', () => {
    const target: NuisanceCounts = { plant: 0, werewolf: 0, pumpkin: 2 };
    expect(nextNuisanceDeficit(target, ZERO_NUISANCE)).toBe('pumpkin');
  });
});

describe('pickChaffType', () => {
  it('honors the 5:3:1 default weighting boundaries', () => {
    // total=9: [0,5)=bat, [5,8)=skeleton, [8,9)=zombie
    expect(pickChaffType(CHAFF_WEIGHTS_DEFAULT, 0)).toBe('bat');
    expect(pickChaffType(CHAFF_WEIGHTS_DEFAULT, 4.9 / 9)).toBe('bat');
    expect(pickChaffType(CHAFF_WEIGHTS_DEFAULT, 5.1 / 9)).toBe('skeleton');
    expect(pickChaffType(CHAFF_WEIGHTS_DEFAULT, 8.5 / 9)).toBe('zombie');
  });
  it('HARVEST weighting skews toward bat (7:2:1)', () => {
    expect(CHAFF_WEIGHTS_HARVEST).toEqual({ bat: 7, skeleton: 2, zombie: 1 });
  });
});

describe('decideNextSpawn', () => {
  const base = {
    boardCount: 0, boardTarget: 10, cdElapsedMs: 99999, cdMs: 500,
    nuisanceElapsedMs: 99999, nuisanceTargetCounts: ZERO_NUISANCE, aliveNuisance: ZERO_NUISANCE,
    specialElapsedMs: 99999, area: 0, aliveSpecial: {},
    msSinceLastHit: 99999, chaffWeights: CHAFF_WEIGHTS_DEFAULT, tieBreakRandom: 0.5,
  };

  it('returns null when the board is already at/above target', () => {
    expect(decideNextSpawn({ ...base, boardCount: 10 })).toBeNull();
  });

  it('returns null while the base CD has not elapsed', () => {
    expect(decideNextSpawn({ ...base, cdElapsedMs: 100, cdMs: 500 })).toBeNull();
  });

  it('falls back to a chaff pick when no nuisance/special deficit exists', () => {
    const r = decideNextSpawn(base);
    expect(r?.slot).toBe('chaff');
  });

  it('prioritizes a nuisance deficit over chaff when its own CD has elapsed', () => {
    const r = decideNextSpawn({ ...base, nuisanceTargetCounts: { plant: 0, werewolf: 0, pumpkin: 1 } });
    expect(r).toEqual({ type: 'pumpkin', slot: 'nuisance' });
  });

  it('does not fill a nuisance deficit before its own 3s CD has elapsed (falls back to chaff instead)', () => {
    const r = decideNextSpawn({ ...base, nuisanceTargetCounts: { plant: 0, werewolf: 0, pumpkin: 1 }, nuisanceElapsedMs: 100 });
    expect(r?.slot).toBe('chaff');
  });

  it('prioritizes a special deficit over chaff (but not over nuisance) when eligible and its CD has elapsed', () => {
    const r = decideNextSpawn({ ...base, area: 4, aliveSpecial: {} });
    expect(r).toEqual({ type: 'screamer', slot: 'special' });
  });

  it('§0.5: the post-hit guard (1.5s) blocks nuisance/special even if their own CDs are ready, but chaff still flows', () => {
    const nuisanceBlocked = decideNextSpawn({
      ...base, nuisanceTargetCounts: { plant: 0, werewolf: 0, pumpkin: 1 }, msSinceLastHit: 500,
    });
    expect(nuisanceBlocked?.slot).toBe('chaff');
    const specialBlocked = decideNextSpawn({ ...base, area: 4, msSinceLastHit: 500 });
    expect(specialBlocked?.slot).toBe('chaff');
  });

  it('the nuisance CD (3s) matches NUISANCE_CD_MS and is never referenced as reducible', () => {
    expect(NUISANCE_CD_MS).toBe(3000);
    expect(SPECIAL_CD_MS).toBe(3000);
    expect(POST_HIT_GUARD_MS).toBe(1500);
  });
});

describe('RELAX/HARVEST overrides', () => {
  it('relaxBoardTarget takes 60% of the current target, floored at 3', () => {
    expect(relaxBoardTarget(10)).toBe(6);
    expect(relaxBoardTarget(4)).toBe(3); // round(2.4)=2 -> clamped to min 3
    expect(relaxBoardTarget(1)).toBe(3);
  });
  it('relaxCdMs doubles the base CD', () => {
    expect(relaxCdMs(500)).toBe(1000);
  });
  it('noNewSupplyNuisanceTarget pins the effective target to the current alive count (no new spawns, existing stay)', () => {
    const alive: NuisanceCounts = { plant: 1, werewolf: 0, pumpkin: 2 };
    const target = noNewSupplyNuisanceTarget(alive);
    expect(nextNuisanceDeficit(target, alive)).toBeNull();
  });
  it('harvestCdMs halves the base CD (kills refill fast)', () => {
    expect(harvestCdMs(500)).toBe(250);
  });
  it('harvestTargetTick ramps by 1 every 2s up to the cap', () => {
    let s = { target: 3, msSinceRampMs: 0 };
    for (let i = 0; i < 2; i++) s = harvestTargetTick(s, 10, 1000);
    expect(s.target).toBe(4);
    for (let i = 0; i < 2; i++) s = harvestTargetTick(s, 10, 1000);
    expect(s.target).toBe(5);
  });
  it('harvestTargetTick never exceeds the cap', () => {
    let s = { target: 9, msSinceRampMs: 0 };
    for (let i = 0; i < 20; i++) s = harvestTargetTick(s, 10, 2000);
    expect(s.target).toBe(10);
  });
});

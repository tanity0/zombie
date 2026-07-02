import { describe, it, expect } from 'vitest';
import { enemyCountCap, phaseAt, sceneAt, PHASES, ENEMY_COUNT_CEIL, ENEMY_COUNT_FLOOR } from './difficultyDirector';

describe('difficultyDirector — count axis (PACING_REDESIGN.md 憲法第1条: 基本10体)', () => {
  it('every phase\'s scripted countCap stays at or below the basic cap (10) — the 11-20 band is upswing-only, not scripted', () => {
    for (const p of PHASES) {
      expect(p.countCap).toBeLessThanOrEqual(ENEMY_COUNT_FLOOR);
    }
    let maxSeen = 0;
    for (let t = 0; t <= 900_000; t += 500) maxSeen = Math.max(maxSeen, enemyCountCap(t));
    expect(maxSeen).toBeLessThanOrEqual(ENEMY_COUNT_FLOOR);
  });

  it('keeps the cap within [6, ceil] at all times (ceiling is never exceeded even though it is no longer reached by script)', () => {
    for (let t = 0; t <= 900_000; t += 1000) {
      const c = enemyCountCap(t);
      expect(c).toBeGreaterThanOrEqual(6);
      expect(c).toBeLessThanOrEqual(ENEMY_COUNT_CEIL);
    }
  });

  it('typical cap sits close to 10 across the arc (avg in a tight band — no more MAX-from-the-start spike)', () => {
    let sum = 0, n = 0;
    for (let t = 0; t < 420_000; t += 1000) { sum += enemyCountCap(t); n++; }
    const avg = sum / n;
    expect(avg).toBeGreaterThanOrEqual(8.5);
    expect(avg).toBeLessThanOrEqual(10);
  });

  it('gate pressure now comes from tempo (intervalMult), not count — every gate scene spawns at or faster than 0.8x', () => {
    // Counts no longer separate gate from buildup (both cap ~10); the "急" now lives entirely in
    // tempo/composition. mowdown (a buildup-kind swarm scene) is intentionally as fast as gates —
    // that's its whole point — so this only asserts gates themselves stay brisk, not "faster than
    // every buildup".
    const gateIntervals = PHASES.filter(p => p.kind === 'gate').map(p => p.scene.intervalMult);
    for (const iv of gateIntervals) expect(iv).toBeLessThanOrEqual(0.8);
  });

  it('14-min arc: buildup at start, city boss at 7:00, intensified gates in 7-14, chaos endgame (no terminal boss)', () => {
    expect(phaseAt(0).kind).toBe('buildup');
    expect(phaseAt(420_000).kind).toBe('boss');   // 7:00 城ボス(中間ライン)
    expect(phaseAt(600_000).kind).toBe('gate');   // 10:00 は延長の関所(急多め)
    expect(phaseAt(900_000).kind).toBe('gate');   // 14:00 以降=特定ボス無しのカオス継続
    // 城ボス(7:00)が唯一のボス phase(14:00に終局ボスは無い)
    expect(PHASES.filter(p => p.kind === 'boss').length).toBe(1);
    // 7-14分は 0-7分より関所(gate)が密=“急”多め
    const gates0to7 = PHASES.filter(p => p.kind === 'gate' && p.endMs <= 420_000).length;
    const gates7to14 = PHASES.filter(p => p.kind === 'gate' && p.startMs >= 420_000).length;
    expect(gates7to14).toBeGreaterThanOrEqual(gates0to7);
  });
});

describe('difficultyDirector — spawn scenes (composition/speed levers)', () => {
  it('every phase has a scene and sceneAt matches phaseAt', () => {
    for (const p of PHASES) {
      expect(p.scene).toBeTruthy();
      expect(p.scene.intervalMult).toBeGreaterThan(0);
    }
    for (const t of [0, 110_000, 250_000, 300_000, 420_000]) {
      expect(sceneAt(t)).toBe(phaseAt(t).scene);
    }
  });

  it('gate scenes spawn faster (lower intervalMult) than the sparse relief scene', () => {
    const gate = PHASES.find(p => p.kind === 'gate')!;
    const sparse = PHASES.find(p => p.scene.id === 'relief-sparse')!;
    expect(gate.scene.intervalMult).toBeLessThan(sparse.scene.intervalMult);
  });

  it('the mowdown scene is fast and features weak trash', () => {
    const mow = PHASES.find(p => p.scene.id === 'mowdown')!;
    expect(mow.scene.intervalMult).toBeLessThan(1);
    expect(mow.scene.featured).toContain('bat');
  });

  it('rareMult (DISTRIBUTION_REDESIGN.md③): relief=0, mowdown=0.5, gates≥1.2', () => {
    const reliefIds = ['relief-sparse', 'relief-pumpkin', 'relief-wolf'];
    for (const id of reliefIds) {
      const p = PHASES.find(x => x.scene.id === id)!;
      expect(p.scene.rareMult).toBe(0);
    }
    const mow = PHASES.find(p => p.scene.id === 'mowdown')!;
    expect(mow.scene.rareMult).toBe(0.5);
    const gates = PHASES.filter(p => p.kind === 'gate');
    expect(gates.length).toBeGreaterThan(0);
    for (const g of gates) {
      expect(g.scene.rareMult ?? 1).toBeGreaterThanOrEqual(1.2);
    }
  });

  it('featuredFloor (PACING_REDESIGN.mdバッチ1.5): only lessons (relief-pumpkin/relief-wolf) and mowdown opt in; every gate scene stays false (no problem-child backdoor)', () => {
    const floorOnIds = ['relief-pumpkin', 'relief-wolf', 'mowdown'];
    for (const id of floorOnIds) {
      const p = PHASES.find(x => x.scene.id === id)!;
      expect(p.scene.featuredFloor).toBe(true);
    }
    for (const p of PHASES.filter(x => x.kind === 'gate')) {
      expect(p.scene.featuredFloor ?? false).toBe(false);
    }
    // relief-sparse and boss carry no featured types at all, so the floor is moot there, but they
    // must not be accidentally opted in either.
    const sparse = PHASES.find(p => p.scene.id === 'relief-sparse')!;
    expect(sparse.scene.featuredFloor ?? false).toBe(false);
  });

  it('maxRung (PACING_REDESIGN.mdバッチ3): every gate phase has a rung in [3,7], non-decreasing across the run (ラン全体の階段)', () => {
    const gates = PHASES.filter(p => p.kind === 'gate');
    let last = 0;
    for (const g of gates) {
      expect(g.maxRung).toBeDefined();
      expect(g.maxRung!).toBeGreaterThanOrEqual(3);
      expect(g.maxRung!).toBeLessThanOrEqual(7);
      expect(g.maxRung!).toBeGreaterThanOrEqual(last);
      last = g.maxRung!;
    }
    // The very first gate is deliberately mild (数の関所-only territory); the last gate (endless
    // endgame) is deliberately at the ceiling.
    expect(gates[0].maxRung).toBe(3);
    expect(gates[gates.length - 1].maxRung).toBe(7);
  });

  it('buildup/boss phases carry no maxRung (pressure system is gate-only)', () => {
    for (const p of PHASES.filter(x => x.kind !== 'gate')) {
      expect(p.maxRung).toBeUndefined();
    }
  });
});

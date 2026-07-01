import { describe, it, expect } from 'vitest';
import { enemyCountCap, phaseAt, sceneAt, PHASES, ENEMY_COUNT_CEIL } from './difficultyDirector';

describe('difficultyDirector — count axis (step 2)', () => {
  it('keeps the cap within [6, ceil] and reaches the ceiling at gates', () => {
    let maxSeen = 0;
    for (let t = 0; t <= 420_000; t += 500) {
      const c = enemyCountCap(t);
      expect(c).toBeGreaterThanOrEqual(6);
      expect(c).toBeLessThanOrEqual(ENEMY_COUNT_CEIL);
      maxSeen = Math.max(maxSeen, c);
    }
    expect(maxSeen).toBe(ENEMY_COUNT_CEIL); // gates break the cap up to the ceiling(20)
  });

  it('typical cap sits around ~10 across the arc (avg in a sane band)', () => {
    let sum = 0, n = 0;
    for (let t = 0; t < 420_000; t += 1000) { sum += enemyCountCap(t); n++; }
    const avg = sum / n;
    expect(avg).toBeGreaterThanOrEqual(9);
    expect(avg).toBeLessThanOrEqual(13);
  });

  it('gate phases are denser than the buildups next to them', () => {
    // gate② PEAK (~4:00) vs the buildup just before it (~3:20)
    expect(enemyCountCap(240_000)).toBeGreaterThan(enemyCountCap(200_000));
    // buildup(余裕) always ≤ any gate's cap
    const gateCaps = PHASES.filter(p => p.kind === 'gate').map(p => p.countCap);
    const buildupCaps = PHASES.filter(p => p.kind === 'buildup').map(p => p.countCap);
    expect(Math.max(...buildupCaps)).toBeLessThanOrEqual(Math.min(...gateCaps));
  });

  it('is in a boss phase after 7:00 and a buildup at the start', () => {
    expect(phaseAt(0).kind).toBe('buildup');
    expect(phaseAt(420_000).kind).toBe('boss');
    expect(phaseAt(600_000).kind).toBe('boss');
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
});

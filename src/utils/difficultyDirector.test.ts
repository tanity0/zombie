import { describe, it, expect } from 'vitest';
import {
  enemyCountCap, phaseAt, sceneAt, PHASES, PHASES_LEGACY, ENEMY_COUNT_CEIL, ENEMY_COUNT_FLOOR,
  DEEP_DIVE_START_MS, DEEP_DIVE_REWARD_MULT, deepDiveRareMultFor,
} from './difficultyDirector';

describe('difficultyDirector — PHASES(v2・PACING_V2.mdバッチR2: 60秒骨格)', () => {
  it('第1条: すべてのフェーズのcountCapは基本上限(10)を超えない', () => {
    for (const p of PHASES) expect(p.countCap).toBeLessThanOrEqual(ENEMY_COUNT_FLOOR);
    let maxSeen = 0;
    for (let t = 0; t <= 900_000; t += 500) maxSeen = Math.max(maxSeen, enemyCountCap(t));
    expect(maxSeen).toBeLessThanOrEqual(ENEMY_COUNT_FLOOR);
  });

  it('enemyCountCapは常に[6, ceil]の範囲に収まる', () => {
    for (let t = 0; t <= 900_000; t += 1000) {
      const c = enemyCountCap(t);
      expect(c).toBeGreaterThanOrEqual(6);
      expect(c).toBeLessThanOrEqual(ENEMY_COUNT_CEIL);
    }
  });

  it('導入60秒は静か(buildup)/1:00ちょうどに最初の関所(gate)が来る', () => {
    expect(phaseAt(0).kind).toBe('buildup');
    expect(phaseAt(0).index).toBe(1);
    expect(phaseAt(59_999).kind).toBe('buildup');
    expect(phaseAt(60_000).kind).toBe('gate');
    expect(phaseAt(60_000).index).toBe(1);
  });

  it('以後は関所60秒⇄緩60秒を交互に刻み、7:00に城ボス(中間ゴール)が来る', () => {
    expect(phaseAt(120_000).kind).toBe('buildup'); // 2:00
    expect(phaseAt(180_000).kind).toBe('gate');    // 3:00
    expect(phaseAt(240_000).kind).toBe('buildup'); // 4:00
    expect(phaseAt(300_000).kind).toBe('gate');    // 5:00
    expect(phaseAt(360_000).kind).toBe('buildup'); // 6:00(ボス前の整え)
    expect(phaseAt(419_999).kind).toBe('buildup'); // 6:59
    expect(phaseAt(420_000).kind).toBe('boss');    // 7:00 城ボス
    expect(phaseAt(449_999).kind).toBe('boss');
    expect(PHASES.filter(p => p.kind === 'boss').length).toBe(1);
  });

  it('7:30以降は深入りモード: buildup⇄gateの60秒交互が継続し、gate-ambushのunlockMs(7:00)と整合する', () => {
    expect(phaseAt(450_000).kind).toBe('buildup'); // 7:30
    expect(phaseAt(510_000).kind).toBe('gate');    // 8:30
    expect(phaseAt(570_000).kind).toBe('buildup'); // 9:30
    expect(DEEP_DIVE_START_MS).toBe(450_000);
  });

  it('14:00以降は最終コマが無限延長される(1つだけendMs=Infinity)', () => {
    const infinite = PHASES.filter(p => p.endMs === Infinity);
    expect(infinite.length).toBe(1);
    expect(infinite[0].startMs).toBeLessThan(14 * 60 * 1000);
    expect(phaseAt(20 * 60 * 1000)).toBe(infinite[0]); // 20:00でも同じ最終コマのまま
  });

  it('関所(gate)スロットは毎回60秒ちょうど(境界のズレが無い)', () => {
    for (const p of PHASES.filter(x => x.kind === 'gate' && x.endMs !== Infinity)) {
      expect(p.endMs - p.startMs).toBe(60_000);
    }
  });

  it('PHASESのmaxRung列は撤去済み(台本選択に使わないため。台本自身のmaxRungのみで判定する)', () => {
    for (const p of PHASES) expect(p.maxRung).toBeUndefined();
  });

  it('sceneAtはphaseAtの.sceneと一致する', () => {
    for (const t of [0, 60_000, 250_000, 420_000, 900_000]) {
      expect(sceneAt(t)).toBe(phaseAt(t).scene);
    }
  });
});

describe('difficultyDirector — 深入り係数(PACING_V2.mdバッチR2: rareMult側のみ。ゴールドはR5未実装)', () => {
  it('7:30未満は等倍、7:30以降はDEEP_DIVE_REWARD_MULT(叩き台1.5)', () => {
    expect(deepDiveRareMultFor(0)).toBe(1);
    expect(deepDiveRareMultFor(DEEP_DIVE_START_MS - 1)).toBe(1);
    expect(deepDiveRareMultFor(DEEP_DIVE_START_MS)).toBe(DEEP_DIVE_REWARD_MULT);
    expect(deepDiveRareMultFor(DEEP_DIVE_START_MS)).toBe(1.5);
  });
});

// PACING_V2.mdの復帰フラグ`?v2=0`が戻す先。R2以前の挙動を凍結する回帰群(内容はR2実装前と同一)。
describe('difficultyDirector — PHASES_LEGACY(`?v2=0`の復帰先・PACING_REDESIGN.md旧骨格)', () => {
  it('every phase\'s scripted countCap stays at or below the basic cap (10)', () => {
    for (const p of PHASES_LEGACY) expect(p.countCap).toBeLessThanOrEqual(ENEMY_COUNT_FLOOR);
    let maxSeen = 0;
    for (let t = 0; t <= 900_000; t += 500) maxSeen = Math.max(maxSeen, enemyCountCap(t, PHASES_LEGACY));
    expect(maxSeen).toBeLessThanOrEqual(ENEMY_COUNT_FLOOR);
  });

  it('keeps the cap within [6, ceil] at all times', () => {
    for (let t = 0; t <= 900_000; t += 1000) {
      const c = enemyCountCap(t, PHASES_LEGACY);
      expect(c).toBeGreaterThanOrEqual(6);
      expect(c).toBeLessThanOrEqual(ENEMY_COUNT_CEIL);
    }
  });

  it('14-min arc: buildup at start, city boss at 7:00, intensified gates in 7-14, chaos endgame (no terminal boss)', () => {
    expect(phaseAt(0, PHASES_LEGACY).kind).toBe('buildup');
    expect(phaseAt(420_000, PHASES_LEGACY).kind).toBe('boss');
    expect(phaseAt(600_000, PHASES_LEGACY).kind).toBe('gate');
    expect(phaseAt(900_000, PHASES_LEGACY).kind).toBe('gate');
    expect(PHASES_LEGACY.filter(p => p.kind === 'boss').length).toBe(1);
    const gates0to7 = PHASES_LEGACY.filter(p => p.kind === 'gate' && p.endMs <= 420_000).length;
    const gates7to14 = PHASES_LEGACY.filter(p => p.kind === 'gate' && p.startMs >= 420_000).length;
    expect(gates7to14).toBeGreaterThanOrEqual(gates0to7);
  });

  it('every phase has a scene and sceneAt matches phaseAt', () => {
    for (const p of PHASES_LEGACY) {
      expect(p.scene).toBeTruthy();
      expect(p.scene.intervalMult).toBeGreaterThan(0);
    }
    for (const t of [0, 110_000, 250_000, 300_000, 420_000]) {
      expect(sceneAt(t, PHASES_LEGACY)).toBe(phaseAt(t, PHASES_LEGACY).scene);
    }
  });

  it('gate scenes spawn faster (lower intervalMult) than the sparse relief scene', () => {
    const gate = PHASES_LEGACY.find(p => p.kind === 'gate')!;
    const sparse = PHASES_LEGACY.find(p => p.scene.id === 'relief-sparse')!;
    expect(gate.scene.intervalMult).toBeLessThan(sparse.scene.intervalMult);
  });

  it('the mowdown scene is fast and features weak trash', () => {
    const mow = PHASES_LEGACY.find(p => p.scene.id === 'mowdown')!;
    expect(mow.scene.intervalMult).toBeLessThan(1);
    expect(mow.scene.featured).toContain('bat');
  });

  it('rareMult (DISTRIBUTION_REDESIGN.md③): relief=0, mowdown=0.5, gates≥1.2', () => {
    const reliefIds = ['relief-sparse', 'relief-pumpkin', 'relief-wolf'];
    for (const id of reliefIds) {
      const p = PHASES_LEGACY.find(x => x.scene.id === id)!;
      expect(p.scene.rareMult).toBe(0);
    }
    const mow = PHASES_LEGACY.find(p => p.scene.id === 'mowdown')!;
    expect(mow.scene.rareMult).toBe(0.5);
    const gates = PHASES_LEGACY.filter(p => p.kind === 'gate');
    expect(gates.length).toBeGreaterThan(0);
    for (const g of gates) expect(g.scene.rareMult ?? 1).toBeGreaterThanOrEqual(1.2);
  });

  it('featuredFloor: only lessons (relief-pumpkin/relief-wolf) and mowdown opt in; every gate scene stays false', () => {
    const floorOnIds = ['relief-pumpkin', 'relief-wolf', 'mowdown'];
    for (const id of floorOnIds) {
      const p = PHASES_LEGACY.find(x => x.scene.id === id)!;
      expect(p.scene.featuredFloor).toBe(true);
    }
    for (const p of PHASES_LEGACY.filter(x => x.kind === 'gate')) {
      expect(p.scene.featuredFloor ?? false).toBe(false);
    }
    const sparse = PHASES_LEGACY.find(p => p.scene.id === 'relief-sparse')!;
    expect(sparse.scene.featuredFloor ?? false).toBe(false);
  });

  it('mix: every scene carries a chaff mix', () => {
    const byId: Record<string, { bat: number; skeleton: number; zombie: number }> = {
      'relief-sparse': { bat: 70, skeleton: 25, zombie: 5 },
      'relief-pumpkin': { bat: 55, skeleton: 40, zombie: 5 },
      'relief-wolf': { bat: 55, skeleton: 40, zombie: 5 },
      mowdown: { bat: 60, skeleton: 35, zombie: 5 },
      'gate-pumpwolf': { bat: 30, skeleton: 45, zombie: 25 },
      'gate-mass-ranged': { bat: 25, skeleton: 35, zombie: 40 },
      'gate-chaos': { bat: 30, skeleton: 40, zombie: 30 },
      boss: { bat: 30, skeleton: 40, zombie: 30 },
    };
    for (const [id, mix] of Object.entries(byId)) {
      const p = PHASES_LEGACY.find(x => x.scene.id === id)!;
      expect(p.scene.mix).toEqual(mix);
    }
    for (const p of PHASES_LEGACY) expect(p.scene.mix, `scene ${p.scene.id} lacks mix`).toBeDefined();
  });

  it('maxRung: every gate phase has a rung in [3,7], non-decreasing across the run', () => {
    const gates = PHASES_LEGACY.filter(p => p.kind === 'gate');
    let last = 0;
    for (const g of gates) {
      expect(g.maxRung).toBeDefined();
      expect(g.maxRung!).toBeGreaterThanOrEqual(3);
      expect(g.maxRung!).toBeLessThanOrEqual(7);
      expect(g.maxRung!).toBeGreaterThanOrEqual(last);
      last = g.maxRung!;
    }
    expect(gates[0].maxRung).toBe(3);
    expect(gates[gates.length - 1].maxRung).toBe(7);
  });

  it('buildup/boss phases carry no maxRung (pressure system is gate-only)', () => {
    for (const p of PHASES_LEGACY.filter(x => x.kind !== 'gate')) {
      expect(p.maxRung).toBeUndefined();
    }
  });
});

import { describe, expect, it } from 'vitest';
import { choreographyRecoverMs, planBossChoreography } from './bossChoreography';

describe('planBossChoreography', () => {
  it('uses two readable beats in phase 1 and three causal beats later', () => {
    expect(planBossChoreography('mimir', 'dash', 1)).toEqual(['dash', 'bite']);
    expect(planBossChoreography('mimir', 'dash', 2)).toEqual(['dash', 'bite', 'burst']);
  });
  it('turns isolated giant and angel moves into complete scripts', () => {
    expect(planBossChoreography('giant', 'wing', 2)).toEqual(['wing', 'bolt', 'sweepbeam']);
    expect(planBossChoreography('acrasiel', 'gaze', 3)).toEqual(['gaze', 'warp', 'burst']);
  });

  it('covers every selectable opening instead of leaving isolated attacks', () => {
    const openings = {
      giant: ['stomp', 'sweep', 'jump', 'dash', 'bolt', 'bite', 'slam', 'glide', 'dive', 'quaddash', 'nova', 'wing', 'sweepbeam'],
      glen: ['stomp', 'sweep', 'jump', 'dash', 'bolt', 'trijump', 'talon', 'boon', 'reach', 'nihil'],
      mimir: ['bite', 'radial', 'burst', 'laser', 'dash'],
      jormungand: ['radial', 'burst', 'dash', 'coil'],
      skadi: ['ice', 'blade', 'dash', 'burst', 'radial', 'cage'],
      thor: ['issen', 'tsuki', 'harai', 'jump'],
      miguel: ['dash', 'harai', 'volley'],
      jibril: ['lantern', 'consecrate', 'volley'],
      rafi: ['bone', 'jump', 'sweep'],
      uri: ['sweep', 'downslash', 'thrust', 'bolt'],
      suriel: ['ringshot', 'ringspin', 'sweep', 'gaze'],
      acrasiel: ['spike', 'spear', 'warp', 'burst', 'gaze'],
    } as const;
    for (const [boss, moves] of Object.entries(openings)) {
      for (const move of moves) expect(planBossChoreography(boss as keyof typeof openings, move, 3).length).toBeGreaterThan(1);
    }
  });
});

describe('choreographyRecoverMs', () => {
  it('compresses links and guarantees a two-hit rest after the string', () => {
    expect(choreographyRecoverMs(900, true)).toBe(300);
    expect(choreographyRecoverMs(900, false)).toBe(1700);
    expect(choreographyRecoverMs(2200, false)).toBe(2200);
  });
});

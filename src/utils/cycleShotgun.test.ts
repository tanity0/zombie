import { describe, it, expect } from 'vitest';
import { nextCycleMode, CYCLE_MODE_STATS } from './cycleShotgun';

describe('nextCycleMode', () => {
  it('未設定(undefined)は既定shotからの反転=slugを返す', () => {
    expect(nextCycleMode(undefined)).toBe('slug');
  });

  it('shot→slug→shot…と交互に反転する', () => {
    let mode = nextCycleMode(undefined); // slug
    expect(mode).toBe('slug');
    mode = nextCycleMode(mode); // shot
    expect(mode).toBe('shot');
    mode = nextCycleMode(mode); // slug
    expect(mode).toBe('slug');
  });
});

describe('CYCLE_MODE_STATS', () => {
  it('散弾(shot): 6ダメージ・5発・散り角1.10rad', () => {
    expect(CYCLE_MODE_STATS.shot).toEqual({ damage: 6, count: 5, spreadRadOverride: 1.10 });
  });

  it('スラッグ(slug): 30ダメージ・1発・散り角0(直進)', () => {
    expect(CYCLE_MODE_STATS.slug).toEqual({ damage: 30, count: 1, spreadRadOverride: 0 });
  });
});

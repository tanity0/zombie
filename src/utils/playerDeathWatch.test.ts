import { describe, it, expect } from 'vitest';
import { shouldFireDeathFallback } from './playerDeathWatch';

const base = { health: 100, alreadyTriggered: false, gameWon: false, gameReturned: false };

describe('playerDeathWatch(死亡を1箇所で拾う)', () => {
  it('HPが0以下になったフレームで発火する', () => {
    expect(shouldFireDeathFallback({ ...base, health: 0 })).toBe(true);
    expect(shouldFireDeathFallback({ ...base, health: -12 })).toBe(true);
  });

  it('生きている間は発火しない', () => {
    expect(shouldFireDeathFallback({ ...base, health: 0.5 })).toBe(false);
    expect(shouldFireDeathFallback(base)).toBe(false);
  });

  it('★二重に起動しない(死亡演出は1回だけ)', () => {
    expect(shouldFireDeathFallback({ ...base, health: 0, alreadyTriggered: true })).toBe(false);
  });

  it('★クリア後・撤収後にHPが0でも死亡にしない', () => {
    expect(shouldFireDeathFallback({ ...base, health: 0, gameWon: true })).toBe(false);
    expect(shouldFireDeathFallback({ ...base, health: 0, gameReturned: true })).toBe(false);
  });

  it('★これが「幻影で死んでも終わらない」を閉じる形である(社長報告2026-08-31)', () => {
    // 幻影の攻撃は damagePlayer の返り値を捨てるので、呼び出し側からは死亡が伝わらない。
    // 監視側は「HPが0以下」だけを見るので、どの経路で死んでも必ず拾える。
    const deathByPathThatIgnoresReturnValue = { ...base, health: 0 };
    expect(shouldFireDeathFallback(deathByPathThatIgnoresReturnValue)).toBe(true);
  });
});

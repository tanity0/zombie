import { describe, it, expect } from 'vitest';
import { shouldFireDeathFallback, shouldSendDeathResult, deathResultSafetyMs } from './playerDeathWatch';

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

describe('★死亡→結果画面の送り(描画の周期で進める・コード監査2026-10-23 B-1/B-2)', () => {
  it('期限(死亡時刻+正規の尺)に達した最初のフレームで送る', () => {
    const due = 10_000 + 2000;
    expect(shouldSendDeathResult(11_999, due, false)).toBe(false);
    expect(shouldSendDeathResult(12_000, due, false)).toBe(true);
    expect(shouldSendDeathResult(15_000, due, false)).toBe(true); // 重くてフレームが飛んでも送る
  });
  it('予約が無ければ送らない・送った後は二度と送らない', () => {
    expect(shouldSendDeathResult(99_999, null, false)).toBe(false);
    expect(shouldSendDeathResult(99_999, 1, true)).toBe(false);
  });
  it('★Game.tsx の保険は正規の尺より長い(死亡演出を途中で切らない)', () => {
    expect(deathResultSafetyMs(2000)).toBeGreaterThan(2000);
  });
});

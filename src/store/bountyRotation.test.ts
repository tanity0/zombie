// PACING_PUZZLE.md §6.38 v2 F(4種重複なしローテ・B4)の受け入れ条件を固定するテスト。
// ①ローテ重複なし ②全種消化後は再抽選 ③resetGameでラン内ローテが差し替わる。
import { describe, it, expect } from 'vitest';
import {
  useGameStore, BOUNTY_ROTATION_TYPES, shuffleBountyRotation, takeNextBountyRotationType,
} from './gameStore';

describe('shuffleBountyRotation — 4種の並びを作る(重複なし)', () => {
  it('常に4種ちょうど・重複なしを返す', () => {
    for (let i = 0; i < 20; i++) {
      const shuffled = shuffleBountyRotation();
      expect(shuffled.length).toBe(BOUNTY_ROTATION_TYPES.length);
      expect(new Set(shuffled).size).toBe(BOUNTY_ROTATION_TYPES.length);
      for (const t of shuffled) expect(BOUNTY_ROTATION_TYPES).toContain(t);
    }
  });
});

describe('takeNextBountyRotationType — 重複なしで取り出す・全種消化後は再抽選(§2)', () => {
  it('満杯の4種から1個ずつ取り出すと、4回で重複なく全種を消化する', () => {
    let rotation = [...BOUNTY_ROTATION_TYPES];
    const picked: string[] = [];
    for (let i = 0; i < BOUNTY_ROTATION_TYPES.length; i++) {
      const { picked: p, rest } = takeNextBountyRotationType(rotation);
      picked.push(p);
      rotation = rest;
    }
    expect(new Set(picked).size).toBe(BOUNTY_ROTATION_TYPES.length); // 重複なし
    expect(rotation.length).toBe(0); // 使い切った
  });

  it('空(=前回で使い切った)状態から取り出すと、自動で再抽選してから1個返す(§2「全種消化後は再抽選」)', () => {
    const { picked, rest } = takeNextBountyRotationType([]);
    expect(BOUNTY_ROTATION_TYPES).toContain(picked);
    expect(rest.length).toBe(BOUNTY_ROTATION_TYPES.length - 1); // 再抽選した4種から1個取り出した残り
  });

  it('取り出しても入力配列そのものは書き換えない(純関数)', () => {
    const rotation = [...BOUNTY_ROTATION_TYPES];
    const before = [...rotation];
    takeNextBountyRotationType(rotation);
    expect(rotation).toEqual(before);
  });
});

describe('resetGame — store.bountyRotationはラン単位でリセットされる(B4)', () => {
  it('resetGame後は必ず4種ちょうどのローテが積まれている', () => {
    useGameStore.getState().resetGame('warrior');
    const rotation = useGameStore.getState().bountyRotation;
    expect(rotation.length).toBe(BOUNTY_ROTATION_TYPES.length);
    expect(new Set(rotation).size).toBe(BOUNTY_ROTATION_TYPES.length);
  });
});

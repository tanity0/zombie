import { describe, expect, it } from 'vitest';
import {
  HOMING_SECOND_SHOT_DELAY_MS, planHomingVolley, splitDueHomingShots, homingLiftAllowed, type HomingPendingShot,
} from './homingVolley';

describe('planHomingVolley(赤サークル=2ロック目はタン、タンと間を空ける)', () => {
  it('1ロックの敵だけなら全部その場で撃つ(一斉発射のまま)', () => {
    expect(planHomingVolley(['a', 'b', 'c']).map(s => s.delayMs)).toEqual([0, 0, 0]);
  });
  it('同じ敵の2つ目のロックだけ遅らせる', () => {
    const plan = planHomingVolley(['a', 'b', 'a']);
    expect(plan).toEqual([
      { enemyId: 'a', index: 0, delayMs: 0 },
      { enemyId: 'b', index: 1, delayMs: 0 },
      { enemyId: 'a', index: 2, delayMs: HOMING_SECOND_SHOT_DELAY_MS },
    ]);
  });
  it('弾の数はロックの数と同じ(減らさない・増やさない)', () => {
    const locks = ['a', 'a', 'b', 'b', 'c'];
    expect(planHomingVolley(locks)).toHaveLength(locks.length);
    expect(planHomingVolley([])).toEqual([]);
  });
  it('間は「タン、タン」と聞き分けられる長さ(0.1〜0.15秒)', () => {
    expect(HOMING_SECOND_SHOT_DELAY_MS).toBeGreaterThanOrEqual(100);
    expect(HOMING_SECOND_SHOT_DELAY_MS).toBeLessThanOrEqual(150);
  });
});

describe('splitDueHomingShots', () => {
  const shot = (at: number, id = 'a'): HomingPendingShot => ({ enemyId: id, index: 0, at, dirX: 1, dirY: 0, seed: 1 });
  it('時刻になった弾だけ取り出し、残りはそのまま(順序を保つ)', () => {
    const q = [shot(100, 'a'), shot(200, 'b'), shot(150, 'c')];
    const { due, rest } = splitDueHomingShots(q, 150);
    expect(due.map(s => s.enemyId)).toEqual(['a', 'c']);
    expect(rest.map(s => s.enemyId)).toEqual(['b']);
  });
  it('空の行列は空', () => {
    expect(splitDueHomingShots([], 0)).toEqual({ due: [], rest: [] });
  });
});

describe('homingLiftAllowed(浮かせの対象=鞭と同じ)', () => {
  it('雑魚・強個体は浮かせる', () => {
    expect(homingLiftAllowed('mob', true, true)).toBe(true);
    expect(homingLiftAllowed('strong', true, true)).toBe(true);
  });
  it('ボス級・終端(区分なし)は浮かせない', () => {
    expect(homingLiftAllowed('boss', true, true)).toBe(false);
    expect(homingLiftAllowed(null, true, true)).toBe(false);
  });
  it('鞭で動かさない型・倒した一撃は浮かせない', () => {
    expect(homingLiftAllowed('mob', false, true)).toBe(false);
    expect(homingLiftAllowed('mob', true, false)).toBe(false);
  });
});

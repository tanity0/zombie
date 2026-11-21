import { describe, it, expect } from 'vitest';
import type { Enemy } from '../types/game';
import { enemyIdleReason } from './enemyIdleReason';

const E = (over: Partial<Enemy> = {}): Enemy => ({
  id: 'e1', type: 'zombie', x: 0, y: 0, width: 36, height: 36,
  health: 100, maxHealth: 100, damage: 10, speed: 40, experienceValue: 1,
  ...over,
} as Enemy);
const T = 10_000;   // gameTime
const N = 50_000;   // Date.now

describe('enemyIdleReason — なぜ技に入らないかを1語で', () => {
  it('技を実行中なら ACT', () => {
    expect(enemyIdleReason(E({ chaffMove: 'zombie-double' }), 50, T, N, true, 220)).toBe('ACT');
  });
  it('気絶中は STUN', () => {
    expect(enemyIdleReason(E({ stunUntil: T + 3000 }), 50, T, N, true, 220)).toBe('STUN');
  });
  it('ノックバック中は KB', () => {
    expect(enemyIdleReason(E({ knockbackUntil: N + 200 }), 50, T, N, true, 220)).toBe('KB');
  });
  it('被弾硬直中は HITSTUN', () => {
    expect(enemyIdleReason(E({ hitStunUntil: N + 100 }), 50, T, N, true, 220)).toBe('HITSTUN');
  });
  it('技後CD中は CD', () => {
    expect(enemyIdleReason(E({ chaffMoveCdUntil: T + 2000 }), 50, T, N, true, 220)).toBe('CD');
    expect(enemyIdleReason(E({ biteReadyAt: T + 500 }), 50, T, N, true, 220)).toBe('CD');
  });
  it('発火距離の外は FAR', () => {
    expect(enemyIdleReason(E(), 500, T, N, true, 220)).toBe('FAR');
  });
  it('枠が取れていなければ SLOT', () => {
    expect(enemyIdleReason(E(), 50, T, N, false, 220)).toBe('SLOT');
  });
  // ★これが出ているのに技に入らない個体が居たら、それが探しているもの。
  it('どれにも当たらなければ OK(=本物の不具合の疑い)', () => {
    // ゾンビは zrush 中しか §12 の噛みを始められない仕様なので、その相を与える。
    expect(enemyIdleReason(E({ aiPhase: 'zrush' }), 50, T, N, true, 220)).toBe('ACT');
    // 相を持たない bat は canStartBite を通る。
    expect(enemyIdleReason(E({ type: 'bat' }), 50, T, N, true, 220)).toBe('OK');
  });
  it('理由の優先順位: 気絶 > ノックバック > 被弾硬直 > CD', () => {
    const e = E({ stunUntil: T + 1, knockbackUntil: N + 1, hitStunUntil: N + 1, biteReadyAt: T + 1 });
    expect(enemyIdleReason(e, 50, T, N, true, 220)).toBe('STUN');
  });
});

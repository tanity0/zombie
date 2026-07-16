// PACING_PUZZLE.md §6.22 M47仕様①のユニットテスト。境界50%両側+全強個体種別を確認。
import { describe, it, expect } from 'vitest';
import { stunnedMeleeOutcome, ELITE_EXECUTE_HP_RATIO, ELITE_MELEE_STUN_MULT } from './meleeExecute';
import type { EnemyType } from '../types/game';

const enemy = (over: Partial<{
  type: EnemyType; isNamed?: boolean; questTarget?: boolean; health: number; maxHealth: number;
}>) => ({ type: 'zombie' as EnemyType, health: 100, maxHealth: 100, ...over });

describe('stunnedMeleeOutcome', () => {
  it('雑魚は無条件即死(HPに関わらずexecute)', () => {
    expect(stunnedMeleeOutcome(enemy({ type: 'zombie', health: 100, maxHealth: 100 }))).toBe('execute');
    expect(stunnedMeleeOutcome(enemy({ type: 'skeleton', health: 1, maxHealth: 100 }))).toBe('execute');
    expect(stunnedMeleeOutcome(enemy({ type: 'bat', health: 100, maxHealth: 100 }))).toBe('execute');
  });

  it('pumpkin: 境界50%の両側', () => {
    expect(stunnedMeleeOutcome(enemy({ type: 'pumpkin', health: 49, maxHealth: 100 }))).toBe('execute');
    expect(stunnedMeleeOutcome(enemy({ type: 'pumpkin', health: 50, maxHealth: 100 }))).toBe('heavy');
    expect(stunnedMeleeOutcome(enemy({ type: 'pumpkin', health: 51, maxHealth: 100 }))).toBe('heavy');
  });

  it('lab-zombie-3: 境界50%の両側', () => {
    expect(stunnedMeleeOutcome(enemy({ type: 'lab-zombie-3', health: 159, maxHealth: 320 }))).toBe('execute');
    expect(stunnedMeleeOutcome(enemy({ type: 'lab-zombie-3', health: 160, maxHealth: 320 }))).toBe('heavy');
    expect(stunnedMeleeOutcome(enemy({ type: 'lab-zombie-3', health: 161, maxHealth: 320 }))).toBe('heavy');
  });

  it('isNamed: 境界50%の両側(型は雑魚でもフラグで強個体扱い)', () => {
    expect(stunnedMeleeOutcome(enemy({ type: 'zombie', isNamed: true, health: 49, maxHealth: 100 }))).toBe('execute');
    expect(stunnedMeleeOutcome(enemy({ type: 'zombie', isNamed: true, health: 50, maxHealth: 100 }))).toBe('heavy');
  });

  it('questTarget: 境界50%の両側(型は雑魚でもフラグで強個体扱い)', () => {
    expect(stunnedMeleeOutcome(enemy({ type: 'zombie', questTarget: true, health: 49, maxHealth: 100 }))).toBe('execute');
    expect(stunnedMeleeOutcome(enemy({ type: 'zombie', questTarget: true, health: 50, maxHealth: 100 }))).toBe('heavy');
  });

  it('isNamed=false/questTarget=falseは強個体扱いにしない(通常型と同じ即死)', () => {
    expect(stunnedMeleeOutcome(enemy({ type: 'zombie', isNamed: false, questTarget: false, health: 100, maxHealth: 100 }))).toBe('execute');
  });

  it('定数値が仕様どおり', () => {
    expect(ELITE_EXECUTE_HP_RATIO).toBe(0.5);
    expect(ELITE_MELEE_STUN_MULT).toBe(3);
  });
});

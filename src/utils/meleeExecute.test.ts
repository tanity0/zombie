// PACING_PUZZLE.md §6.22 M47仕様①のユニットテスト。境界50%両側+全強個体種別を確認。
import { describe, it, expect } from 'vitest';
import { stunnedMeleeOutcome, resolveStunnedMeleeHit, ELITE_EXECUTE_HP_RATIO, ELITE_MELEE_STUN_MULT } from './meleeExecute';
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

// v0.25.2525(GHOST-REFLECT-MELEE-SUBS 発注B / 台帳§3-3): 気絶敵フィニッシュの裁定=プレイヤーの
// ナイフスイングと守護霊の近接スイングが共有する唯一の出どころ。値・優先順を不変条件として固定する。
describe('resolveStunnedMeleeHit(気絶敵フィニッシュの裁定・プレイヤーと守護霊の共有)', () => {
  const BOSS_MULT = 5; // = gameStore.BOSS_MELEE_STUN_MULT(注入値)
  const stunned = (over: Parameters<typeof enemy>[0] & { stunUntil?: number; bossFullStunUntil?: number }) =>
    ({ ...enemy(over), stunUntil: 1000, ...over });

  it('気絶していなければ null(通常ヒット経路へ)', () => {
    expect(resolveStunnedMeleeHit({ ...enemy({ type: 'zombie' }) }, 10, 500, BOSS_MULT)).toBeNull();
    // 気絶が切れている(gameTime >= stunUntil)も null
    expect(resolveStunnedMeleeHit(stunned({ type: 'zombie' }), 10, 1000, BOSS_MULT)).toBeNull();
  });

  it('ボスは即死せず ×BOSS_MELEE_STUN_MULT。通常気絶は解除・完全気絶(紫)中は維持', () => {
    const r = resolveStunnedMeleeHit(stunned({ type: 'giantbat' }), 10, 500, BOSS_MULT);
    expect(r).toEqual({ kind: 'boss', dmg: 50, keepStun: false });
    const full = resolveStunnedMeleeHit(
      stunned({ type: 'giantbat', bossFullStunUntil: 900 }), 10, 500, BOSS_MULT);
    expect(full).toEqual({ kind: 'boss', dmg: 50, keepStun: true });
    // 完全気絶が切れていれば通常どおり解除
    expect(resolveStunnedMeleeHit(
      stunned({ type: 'giantbat', bossFullStunUntil: 400 }), 10, 500, BOSS_MULT))
      .toEqual({ kind: 'boss', dmg: 50, keepStun: false });
  });

  // 注: pumpkin/lab-zombie-3 は isBossType にも含まれるためボス分岐が先に勝つ(プレイヤーの既存
  // 分岐順のまま)。'heavy' に到達するのは**非ボス型の強個体フラグ**(isNamed/questTarget)。
  it('強個体(HP50%以上)は ×ELITE_MELEE_STUN_MULT / HP50%未満は即時処刑', () => {
    expect(resolveStunnedMeleeHit(stunned({ type: 'zombie', isNamed: true, health: 50, maxHealth: 100 }), 10, 500, BOSS_MULT))
      .toEqual({ kind: 'heavy', dmg: 30 });
    expect(resolveStunnedMeleeHit(stunned({ type: 'zombie', isNamed: true, health: 49, maxHealth: 100 }), 10, 500, BOSS_MULT))
      .toEqual({ kind: 'execute' });
  });

  it('pumpkin/lab-zombie-3 はボス扱いが先(強個体分岐より優先=プレイヤーの既存順)', () => {
    expect(resolveStunnedMeleeHit(stunned({ type: 'pumpkin', health: 50, maxHealth: 100 }), 10, 500, BOSS_MULT)?.kind)
      .toBe('boss');
    expect(resolveStunnedMeleeHit(stunned({ type: 'lab-zombie-3', health: 50, maxHealth: 100 }), 10, 500, BOSS_MULT)?.kind)
      .toBe('boss');
  });

  it('雑魚は無条件で即時処刑', () => {
    expect(resolveStunnedMeleeHit(stunned({ type: 'zombie' }), 10, 500, BOSS_MULT)).toEqual({ kind: 'execute' });
  });

  it('ボス判定が強個体判定より先(=ボスは絶対に即死しない)', () => {
    const r = resolveStunnedMeleeHit(
      stunned({ type: 'giantbat', isNamed: true, health: 1, maxHealth: 100 }), 10, 500, BOSS_MULT);
    expect(r?.kind).toBe('boss');
  });
});

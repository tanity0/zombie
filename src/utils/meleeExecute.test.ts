// PACING_PUZZLE.md §6.22 M47仕様①のユニットテスト。境界50%両側+全強個体種別を確認。
import { describe, it, expect } from 'vitest';
import { stunnedMeleeOutcome, resolveStunnedMeleeHit, usesBossStunnedMelee, ELITE_EXECUTE_HP_RATIO, ELITE_MELEE_STUN_MULT } from './meleeExecute';
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

  // §6.38 v7(社長裁定「isBossTypeへフル編入」): 賞金首4型はv6 B1.5-1でstunnedMeleeOutcomeに
  // 直接名指しされていたが、v7でisBossType編入されusesBossStunnedMelee側(=このテストの対象外・
  // resolveStunnedMeleeHitが先に'boss'枝へ振り分ける)へ移った。この関数自体は賞金首を特別扱い
  // しなくなった(=雑魚と同じisElite判定=false→execute)ことを固定する(呼び出し側は必ず
  // usesBossStunnedMeleeを先に見るためexecuteには実際には到達しない=下のresolveStunnedMeleeHitの
  // テストで確認)。
  it('★賞金首4型: stunnedMeleeOutcome単体は特別扱いしない(雑魚と同じisElite=false→execute)', () => {
    for (const type of ['bounty-ranged', 'bounty-melee', 'bounty-balance', 'bounty-maiko'] as EnemyType[]) {
      expect(stunnedMeleeOutcome(enemy({ type, health: 100, maxHealth: 100 })), type).toBe('execute');
    }
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

  // ★v0.25.3171(社長裁定・案A): pumpkin / lab-zombie-3 は **ボス分岐へ落とさない**。
  // 旧: isBossType が先に勝ち、M47がこの2体を名指ししていた強個体規定が一度も届いていなかった。
  it('★pumpkin / lab-zombie-3 は強個体として裁定される(ボスの5×ではない)', () => {
    for (const type of ['pumpkin', 'lab-zombie-3'] as EnemyType[]) {
      // HP50%以上 → 即死せず ×3
      expect(resolveStunnedMeleeHit(stunned({ type, health: 60, maxHealth: 100 }), 10, 500, BOSS_MULT), type)
        .toEqual({ kind: 'heavy', dmg: 30 });
      // HP50%未満 → 即時処刑
      expect(resolveStunnedMeleeHit(stunned({ type, health: 49, maxHealth: 100 }), 10, 500, BOSS_MULT), type)
        .toEqual({ kind: 'execute' });
    }
  });

  it('usesBossStunnedMelee = isBossType − 強個体(呼び出し側はこれだけを見る)', () => {
    expect(usesBossStunnedMelee('giantbat')).toBe(true);
    expect(usesBossStunnedMelee('mimir')).toBe(true);
    expect(usesBossStunnedMelee('pumpkin')).toBe(false);
    expect(usesBossStunnedMelee('lab-zombie-3')).toBe(false);
    expect(usesBossStunnedMelee('zombie')).toBe(false);
    // §6.38 v7: 賞金首はisBossTypeへフル編入されたのでusesBossStunnedMeleeもtrue
    // (=城ボス等と同じ'boss'枝で裁定される。旧v6時代のfalseから反転)。
    for (const type of ['bounty-ranged', 'bounty-melee', 'bounty-balance', 'bounty-maiko'] as EnemyType[]) {
      expect(usesBossStunnedMelee(type), type).toBe(true);
    }
  });

  // §6.38 v7 受け入れ条件①(体勢ブレイク中の近接=boss式致命の一撃・即死しない): 賞金首は'boss'kindで
  // 裁定され、即死(execute)を返さない・紫(bossFullStunUntil)中はkeepStun=trueで何度でも致命の
  // 一撃を受け続けられる(v6時代の'heavy'+賞金首限定keepStun特例はv7で撤去=この'boss'枝1本に統一)。
  it('★賞金首4型: isBossType編入によりboss式(×BOSS_MELEE_STUN_MULT・即死しない)で裁定される', () => {
    for (const type of ['bounty-ranged', 'bounty-melee', 'bounty-balance', 'bounty-maiko'] as EnemyType[]) {
      // HPに関わらずexecuteにはならない(HP1でもboss式のまま=即死しない)。
      const rLow = resolveStunnedMeleeHit(stunned({ type, health: 1, maxHealth: 100 }), 10, 500, BOSS_MULT);
      expect(rLow, type).toEqual({ kind: 'boss', dmg: 50, keepStun: false });
      // 紫(bossFullStunUntil)中はkeepStun=true=何度でも致命の一撃(§6.38実機FB4の受け入れ条件)。
      const purple = resolveStunnedMeleeHit(
        stunned({ type, health: 9999, maxHealth: 9999, bossFullStunUntil: 900 }), 10, 500, BOSS_MULT);
      expect(purple, type).toEqual({ kind: 'boss', dmg: 50, keepStun: true });
      // 紫が切れていれば1発で気絶解除(通常のボスと同じ挙動)。
      const expired = resolveStunnedMeleeHit(
        stunned({ type, health: 9999, maxHealth: 9999, bossFullStunUntil: 400 }), 10, 500, BOSS_MULT);
      expect(expired, type).toEqual({ kind: 'boss', dmg: 50, keepStun: false });
    }
  });

  // pumpkin/lab-zombie-3もbossFullStunUntil(紫)を持ちうるが(POSTURE_ELITE_TYPES)、この2体は
  // isEliteType側(v7でも撤去していない)なのでkeepStunという概念自体を持たない=挙動不変。
  it('pumpkin/lab-zombie-3は紫中でも1発で気絶解除(keepStun概念なし・賞金首と違う扱い・波及なし)', () => {
    for (const type of ['pumpkin', 'lab-zombie-3'] as EnemyType[]) {
      const r = resolveStunnedMeleeHit(
        stunned({ type, health: 60, maxHealth: 100, bossFullStunUntil: 900 }), 10, 500, BOSS_MULT);
      expect(r, type).toEqual({ kind: 'heavy', dmg: 30 });
    }
  });

  // 'heavy' には**非ボス型の強個体フラグ**(isNamed/questTarget)からも到達する。
  it('強個体(HP50%以上)は ×ELITE_MELEE_STUN_MULT / HP50%未満は即時処刑', () => {
    expect(resolveStunnedMeleeHit(stunned({ type: 'zombie', isNamed: true, health: 50, maxHealth: 100 }), 10, 500, BOSS_MULT))
      .toEqual({ kind: 'heavy', dmg: 30 });
    expect(resolveStunnedMeleeHit(stunned({ type: 'zombie', isNamed: true, health: 49, maxHealth: 100 }), 10, 500, BOSS_MULT))
      .toEqual({ kind: 'execute' });
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

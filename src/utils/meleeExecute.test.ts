// PACING_PUZZLE.md §6.22 M47仕様①→§6.38 B3(E-1確定=瀕死処刑の撤去)のユニットテスト。
import { describe, it, expect } from 'vitest';
import { stunnedMeleeOutcome, resolveStunnedMeleeHit, usesBossStunnedMelee, isEliteEnemy, ELITE_MELEE_STUN_MULT } from './meleeExecute';
import type { StunnedMeleeEnemy } from './meleeExecute';
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

  // §6.38 B3(E-1確定・社長裁定v0.25.3171「パンプキンもだけど即死無しだよ」): 旧HP50%閾値を撤去。
  // 強個体はHPに関わらず常にheavy(即死しない)。
  it('★pumpkin: HPに関わらず常にheavy(瀕死処刑の撤去)', () => {
    expect(stunnedMeleeOutcome(enemy({ type: 'pumpkin', health: 1, maxHealth: 100 }))).toBe('heavy');
    expect(stunnedMeleeOutcome(enemy({ type: 'pumpkin', health: 49, maxHealth: 100 }))).toBe('heavy');
    expect(stunnedMeleeOutcome(enemy({ type: 'pumpkin', health: 50, maxHealth: 100 }))).toBe('heavy');
    expect(stunnedMeleeOutcome(enemy({ type: 'pumpkin', health: 100, maxHealth: 100 }))).toBe('heavy');
  });

  it('★lab-zombie-3: HPに関わらず常にheavy(瀕死処刑の撤去)', () => {
    expect(stunnedMeleeOutcome(enemy({ type: 'lab-zombie-3', health: 1, maxHealth: 320 }))).toBe('heavy');
    expect(stunnedMeleeOutcome(enemy({ type: 'lab-zombie-3', health: 159, maxHealth: 320 }))).toBe('heavy');
    expect(stunnedMeleeOutcome(enemy({ type: 'lab-zombie-3', health: 160, maxHealth: 320 }))).toBe('heavy');
    expect(stunnedMeleeOutcome(enemy({ type: 'lab-zombie-3', health: 320, maxHealth: 320 }))).toBe('heavy');
  });

  it('★isNamed: HPに関わらず常にheavy(型は雑魚でもフラグで強個体扱い・瀕死処刑の撤去)', () => {
    expect(stunnedMeleeOutcome(enemy({ type: 'zombie', isNamed: true, health: 1, maxHealth: 100 }))).toBe('heavy');
    expect(stunnedMeleeOutcome(enemy({ type: 'zombie', isNamed: true, health: 49, maxHealth: 100 }))).toBe('heavy');
    expect(stunnedMeleeOutcome(enemy({ type: 'zombie', isNamed: true, health: 100, maxHealth: 100 }))).toBe('heavy');
  });

  it('★questTarget: HPに関わらず常にheavy(型は雑魚でもフラグで強個体扱い・瀕死処刑の撤去)', () => {
    expect(stunnedMeleeOutcome(enemy({ type: 'zombie', questTarget: true, health: 1, maxHealth: 100 }))).toBe('heavy');
    expect(stunnedMeleeOutcome(enemy({ type: 'zombie', questTarget: true, health: 49, maxHealth: 100 }))).toBe('heavy');
    expect(stunnedMeleeOutcome(enemy({ type: 'zombie', questTarget: true, health: 100, maxHealth: 100 }))).toBe('heavy');
  });

  it('isNamed=false/questTarget=falseは強個体扱いにしない(通常型と同じ即死)', () => {
    expect(stunnedMeleeOutcome(enemy({ type: 'zombie', isNamed: false, questTarget: false, health: 100, maxHealth: 100 }))).toBe('execute');
  });

  it('定数値が仕様どおり', () => {
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
  // §6.38 B3(E-1確定): 旧HP50%閾値(未満なら即死)は撤去。HPに関わらず常にheavy=即死しない。
  it('★pumpkin / lab-zombie-3 は強個体として裁定される(ボスの5×ではなく常にheavy・HPに関わらず即死しない)', () => {
    for (const type of ['pumpkin', 'lab-zombie-3'] as EnemyType[]) {
      expect(resolveStunnedMeleeHit(stunned({ type, health: 60, maxHealth: 100 }), 10, 500, BOSS_MULT), type)
        .toEqual({ kind: 'heavy', dmg: 30 });
      // ★E-1: HP1(瀕死)でもexecuteを返さない(瀕死処刑の撤去)。
      expect(resolveStunnedMeleeHit(stunned({ type, health: 1, maxHealth: 100 }), 10, 500, BOSS_MULT), type)
        .toEqual({ kind: 'heavy', dmg: 30 });
    }
  });

  // PACING_PUZZLE.md §9-7#1(削岩型・「同格」): driller はpumpkinと全く同じ扱い
  // (isEliteType経由=近接フィニッシュ即死の免除)を受ける。
  it('★driller はpumpkinと同格(強個体として裁定される・HPに関わらず即死しない)', () => {
    expect(resolveStunnedMeleeHit(stunned({ type: 'driller', health: 60, maxHealth: 100 }), 10, 500, BOSS_MULT))
      .toEqual(resolveStunnedMeleeHit(stunned({ type: 'pumpkin', health: 60, maxHealth: 100 }), 10, 500, BOSS_MULT));
    expect(usesBossStunnedMelee('driller')).toBe(false);
  });

  // PACING_PUZZLE.md §14-3裁定済み#2(伐採人・logger): driller同様pumpkinと同格。
  it('★logger はpumpkinと同格(強個体として裁定される・HPに関わらず即死しない)', () => {
    expect(resolveStunnedMeleeHit(stunned({ type: 'logger', health: 60, maxHealth: 100 }), 10, 500, BOSS_MULT))
      .toEqual(resolveStunnedMeleeHit(stunned({ type: 'pumpkin', health: 60, maxHealth: 100 }), 10, 500, BOSS_MULT));
    expect(usesBossStunnedMelee('logger')).toBe(false);
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
  // §6.38 B3(E-1確定): HPに関わらず常にheavy(旧HP50%閾値の即時処刑=瀕死処刑は撤去)。
  it('★強個体(isNamed/questTarget)はHPに関わらず ×ELITE_MELEE_STUN_MULT(即死しない)', () => {
    expect(resolveStunnedMeleeHit(stunned({ type: 'zombie', isNamed: true, health: 50, maxHealth: 100 }), 10, 500, BOSS_MULT))
      .toEqual({ kind: 'heavy', dmg: 30 });
    expect(resolveStunnedMeleeHit(stunned({ type: 'zombie', isNamed: true, health: 1, maxHealth: 100 }), 10, 500, BOSS_MULT))
      .toEqual({ kind: 'heavy', dmg: 30 });
    expect(resolveStunnedMeleeHit(stunned({ type: 'zombie', questTarget: true, health: 1, maxHealth: 100 }), 10, 500, BOSS_MULT))
      .toEqual({ kind: 'heavy', dmg: 30 });
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

describe('★赤い個体=強個体(社長裁定v0.25.3547「強個体です」)', () => {
  const mk = (over: Partial<StunnedMeleeEnemy> = {}): StunnedMeleeEnemy =>
    ({ type: 'bat', health: 10, maxHealth: 100, ...over });

  it('赤い雑魚は気絶中でも即死しない(常にheavy)', () => {
    // 赤(HP5×/攻3×)は既に雑魚とは別物なのに、気絶させれば1発で即死していた。
    expect(stunnedMeleeOutcome(mk())).toBe('execute');
    expect(stunnedMeleeOutcome(mk({ colorTier: 'red' }))).toBe('heavy');
  });

  it('★【不変条件】青・紫は雑魚のまま(即死する)', () => {
    expect(stunnedMeleeOutcome(mk({ colorTier: 'blue' }))).toBe('execute');
    expect(stunnedMeleeOutcome(mk({ colorTier: 'purple' }))).toBe('execute');
  });

  it('isEliteEnemy: タイプ/個体フラグ/赤 のいずれでも強個体', () => {
    expect(isEliteEnemy({ type: 'bat' })).toBe(false);
    expect(isEliteEnemy({ type: 'pumpkin' })).toBe(true);
    expect(isEliteEnemy({ type: 'lab-zombie-3' })).toBe(true);
    expect(isEliteEnemy({ type: 'bat', isNamed: true })).toBe(true);
    expect(isEliteEnemy({ type: 'bat', questTarget: true })).toBe(true);
    expect(isEliteEnemy({ type: 'bat', colorTier: 'red' })).toBe(true);
  });

  it('★【不変条件】赤は気絶中の近接でELITE_MELEE_STUN_MULT倍を受ける(ボス枝へは行かない)', () => {
    const r = resolveStunnedMeleeHit(
      { ...mk({ colorTier: 'red' }), stunUntil: 1000 }, 10, 0, 5,
    );
    expect(r).toEqual({ kind: 'heavy', dmg: 10 * ELITE_MELEE_STUN_MULT });
  });
});

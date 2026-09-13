// ボットの腕前段階(社長指示v0.25.2338)。
// **最重要の不変条件は「既定(casual)が現状のボットと同値」**。ここが崩れると、過去のボットラン実測値と
// 比較できなくなり、サブクエ閾値やガチャ収入の判断材料が全部使えなくなる。
import { describe, it, expect } from 'vitest';
import {
  BOT_SKILLS, DEFAULT_BOT_SKILL, BOT_SKILL_PROFILES, botSkillProfile, parseBotSkill,
  projectileDodge, jumpDodge, chargeDodge, contactDodge, isContactDangerous, dodgeVector, dodgeToInput, dodgeHandles,
  telegraphDodge,
  pickTarget, targetScore, shouldRetreatForHp,
  DODGE_PROJECTILE_DIST, DODGE_AOE_DIST, DODGE_CONTACT_DIST, CONTACT_DANGER_HP_FRAC,
  WARP_DETECT_PX, createWarpTrackState, warpDodge, dodgeOverridesAttack, DODGE_GLEN_TRIJUMP_R,
} from './botSkill';
import { COUNTER_REACTION_PROFILES } from './playtestBot';
import { getEnemyBaseSpeed, AREA_SPEED_MULT } from './enemyUtils';
import { GAME_SPEED } from '../config/gameSpeed';
import type { Enemy, EnemyType, Projectile } from '../types/game';

const enemy = (over: Partial<Enemy> = {}): Enemy =>
  ({ id: 'e', x: 0, y: 0, width: 30, height: 30, health: 100, type: 'zombie', ...over } as unknown as Enemy);
// 弾は中心が (cx,cy)、進行方向 (dx,dy)。
const bullet = (cx: number, cy: number, dx: number, dy: number, over: Partial<Projectile> = {}): Projectile =>
  ({ id: 'p', x: cx - 4, y: cy - 4, width: 8, height: 8, speed: 200,
     direction: { x: dx, y: dy }, hostile: true, ...over } as unknown as Projectile);

describe('段階の定義', () => {
  it('既定は casual', () => {
    expect(DEFAULT_BOT_SKILL).toBe('casual');
    expect(botSkillProfile()).toBe(BOT_SKILL_PROFILES.casual);
  });

  // ★v0.25.3554(社長指示「基本どのレベルでもある程度は避けて」): casual の `dodge:'none'` は**廃止**。
  // 反応/成功率/標的選択/囲まれ判定は従来どおり。
  it('casual は反応250ms・成功率0.65・最寄り狙い(回避は全段階に入ったため対象外)', () => {
    const c = BOT_SKILL_PROFILES.casual;
    expect(c.reactionMs).toBe(COUNTER_REACTION_PROFILES.standard!.reactionMs);
    expect(c.counterChance).toBe(COUNTER_REACTION_PROFILES.standard!.chance);
    expect(c.targeting).toBe('nearest'); // 現状のボットは最寄りを狙う
    expect(c.surroundCount).toBe(3);     // playtestBot の SURROUND_COUNT と同値
  });

  it('段階が上がるほど反応が速く、カウンター成功率が高い(単調)', () => {
    const order = ['novice', 'casual', 'skilled', 'master'] as const;
    for (let i = 1; i < order.length; i++) {
      const prev = BOT_SKILL_PROFILES[order[i - 1]], cur = BOT_SKILL_PROFILES[order[i]];
      expect(cur.reactionMs).toBeLessThan(prev.reactionMs);
      expect(cur.counterChance).toBeGreaterThan(prev.counterChance);
      // v0.25.2364で向きを反転: **上手いほど囲まれても粘る**(退避する敵数が増える)。
      // 旧向き(小さいほど上手い)は `retreatHpFrac` と同じ誤りで、実測で master の撃破数が最下位になっていた。
      expect(cur.surroundCount).toBeGreaterThanOrEqual(prev.surroundCount);
    }
  });

  it('確率は0..1に収まる / 反応は正の値', () => {
    for (const s of BOT_SKILLS) {
      const p = BOT_SKILL_PROFILES[s];
      expect(p.counterChance).toBeGreaterThanOrEqual(0);
      expect(p.counterChance).toBeLessThanOrEqual(1);
      expect(p.reactionMs).toBeGreaterThan(0);
      expect(p.dodgeStrength).toBeGreaterThanOrEqual(0);
      expect(p.dodgeStrength).toBeLessThanOrEqual(1);
    }
  });

  it('未知の文字列は既定へ落ちる(URLパラメータで壊れない)', () => {
    expect(parseBotSkill('master')).toBe('master');
    expect(parseBotSkill('ちょうつよい')).toBe(DEFAULT_BOT_SKILL);
    expect(parseBotSkill(null)).toBe(DEFAULT_BOT_SKILL);
    expect(parseBotSkill(undefined)).toBe(DEFAULT_BOT_SKILL);
  });
});

describe('回避: 弾', () => {
  it('正面から来る弾には**横**へ逃げる(後ろへ下がらない=弾速に勝てないため)', () => {
    // 弾は左(-100,0)から右向き(+x)へ。プレイヤーは原点。
    const t = projectileDodge(0, 0, bullet(-100, 0, 1, 0))!;
    expect(t).toBeTruthy();
    expect(Math.abs(t.ux)).toBeLessThan(0.01); // 進行方向(x)成分はほぼ0=後退しない
    expect(Math.abs(t.uy)).toBeCloseTo(1, 2);  // 直交(y)方向へ逃げる
  });

  it('既に横へずれている側へさらに逃げる(戻る方向へ行かない)', () => {
    // 弾は右向き、プレイヤーは弾より下(y+)にずれている → さらに下へ。
    const t = projectileDodge(0, 30, bullet(-100, 0, 1, 0))!;
    expect(t.uy).toBeGreaterThan(0);
    // 逆側にずれていれば逆へ。
    const t2 = projectileDodge(0, -30, bullet(-100, 0, 1, 0))!;
    expect(t2.uy).toBeLessThan(0);
  });

  it('離れていく弾は避けない(既に通り過ぎた弾に反応しない)', () => {
    expect(projectileDodge(0, 0, bullet(100, 0, 1, 0))).toBeNull(); // 右に居て右へ飛ぶ=離れる
  });

  it('遠い弾・味方弾は避けない', () => {
    expect(projectileDodge(0, 0, bullet(-DODGE_PROJECTILE_DIST - 10, 0, 1, 0))).toBeNull();
    expect(projectileDodge(0, 0, bullet(-100, 0, 1, 0, { hostile: false }))).toBeNull();
  });

  it('近いほど危険度が高い', () => {
    const near = projectileDodge(0, 0, bullet(-40, 0, 1, 0))!;
    const far = projectileDodge(0, 0, bullet(-200, 0, 1, 0))!;
    expect(near.weight).toBeGreaterThan(far.weight);
  });
});

describe('回避: 着地(AoE)と突進', () => {
  it('着地点から放射状に離れる', () => {
    // 着地点は原点、プレイヤーは右(+x)に居る → さらに右へ。
    const t = jumpDodge(60, 0, enemy({ aiPhase: 'jump', aiTargetX: 0, aiTargetY: 0 }))!;
    expect(t.ux).toBeCloseTo(1, 2);
    expect(t.uy).toBeCloseTo(0, 2);
  });

  it('着地点が遠ければ避けない / jump以外は対象外', () => {
    expect(jumpDodge(DODGE_AOE_DIST + 10, 0, enemy({ aiPhase: 'jump', aiTargetX: 0, aiTargetY: 0 }))).toBeNull();
    expect(jumpDodge(60, 0, enemy({ aiPhase: 'charge', aiTargetX: 0, aiTargetY: 0 }))).toBeNull();
  });

  it('突進は進行線から**横**へ降りる(正面から下がらない)', () => {
    // 敵は原点から右向きに突進、プレイヤーは右(+x)100 に居る。
    const t = chargeDodge(100, 0, enemy({ aiPhase: 'charge', x: 0, y: 0, vx: 5, vy: 0 }))!;
    expect(Math.abs(t.ux)).toBeLessThan(0.01);
    expect(Math.abs(t.uy)).toBeCloseTo(1, 2);
  });

  it('自分へ向いていない突進は避けない(無駄に動かない)', () => {
    // 敵は上向きに突進、プレイヤーは右。
    expect(chargeDodge(100, 0, enemy({ aiPhase: 'charge', x: 0, y: 0, vx: 0, vy: -5 }))).toBeNull();
  });
});

describe('回避の段階(dodgeHandles / dodgeVector)', () => {
  it('段階ごとに扱える脅威が変わる', () => {
    expect(dodgeHandles('none', 'projectile')).toBe(false);
    expect(dodgeHandles('projectile', 'projectile')).toBe(true);
    expect(dodgeHandles('projectile', 'jump')).toBe(false);
    expect(dodgeHandles('aoe', 'jump')).toBe(true);
    expect(dodgeHandles('aoe', 'projectile')).toBe(false);
    for (const k of ['projectile', 'jump', 'charge'] as const) expect(dodgeHandles('all', k)).toBe(true);
  });

  // ★v0.25.3554(社長指示「基本どのレベルでもある程度は避けて」・社長報告「敵の弾に一切反応できてない」):
  // 旧テストは「novice/casual は一切避けない」「skilled は弾だけ」を固定していた。**両方とも廃止**。
  it('★novice / casual も弾は避ける(回避を無効化しない)', () => {
    const b = [bullet(-60, 0, 1, 0)];
    expect(dodgeVector(BOT_SKILL_PROFILES.novice, 0, 0, [], b)).toBeTruthy();
    expect(dodgeVector(BOT_SKILL_PROFILES.casual, 0, 0, [], b)).toBeTruthy();
  });

  it('★skilled は弾も着地も避ける(dodge:\'all\')', () => {
    const onlyJump = [enemy({ aiPhase: 'jump', aiTargetX: 0, aiTargetY: 0 })];
    expect(dodgeVector(BOT_SKILL_PROFILES.skilled, 10, 0, onlyJump, [])).toBeTruthy();
    expect(dodgeVector(BOT_SKILL_PROFILES.skilled, 0, 0, [], [bullet(-60, 0, 1, 0)])).toBeTruthy();
  });

  it('master は弾も着地も突進も避ける', () => {
    const p = BOT_SKILL_PROFILES.master;
    expect(dodgeVector(p, 0, 0, [], [bullet(-60, 0, 1, 0)])).toBeTruthy();
    expect(dodgeVector(p, 10, 0, [enemy({ aiPhase: 'jump', aiTargetX: 0, aiTargetY: 0 })], [])).toBeTruthy();
    expect(dodgeVector(p, 100, 0, [enemy({ aiPhase: 'charge', x: 0, y: 0, vx: 5, vy: 0 })], [])).toBeTruthy();
  });

  it('脅威が無ければ null(避けるものが無いのに動かない)', () => {
    expect(dodgeVector(BOT_SKILL_PROFILES.master, 0, 0, [enemy()], [])).toBeNull();
  });

  it('回避ベクトルは長さが dodgeStrength を超えない', () => {
    const v = dodgeVector(BOT_SKILL_PROFILES.skilled, 0, 0, [], [bullet(-60, 0, 1, 0)])!;
    expect(Math.hypot(v.x, v.y)).toBeLessThanOrEqual(BOT_SKILL_PROFILES.skilled.dodgeStrength + 1e-9);
  });

  // research/AI_HUMANIZE.md B2 §2-1「回避外しの実仕組み」: 位置取り中は対象敵×対象州の予告回避だけを
  // 抑止する省略可能引数(excludeTelegraphFor)。省略時は従来と1bit同じ(このファイルの他の全テストが
  // 省略呼び出しのまま緑=既に立証済み)。★検収是正#4: 敵まるごとではなく州(moveKey)単位。
  describe('excludeTelegraphFor(§2-1「回避外しの実仕組み」・省略可能引数・検収是正#4=州単位)', () => {
    const stomper = enemy({
      id: 'e1', aiPhase: 'g-stomp-windup', x: 0, y: 0, width: 40, height: 40, gStompRadius: 100,
    } as never);

    it('省略時(undefined)は従来どおり予告を避ける', () => {
      expect(dodgeVector(BOT_SKILL_PROFILES.master, 20, 20, [stomper], [])).toBeTruthy();
    });

    it('指定した敵が一致する技キーを返す時、その敵のその技の予告回避だけを抑止する', () => {
      const v = dodgeVector(BOT_SKILL_PROFILES.master, 20, 20, [stomper], [], 0, e => (e.id === 'e1' ? 'g-stomp-windup' : undefined));
      expect(v).toBeNull();
    });

    it('抑止対象ではない他の敵の予告は従来どおり避け続ける', () => {
      const other = enemy({
        id: 'e2', aiPhase: 'g-stomp-windup', x: 0, y: 0, width: 40, height: 40, gStompRadius: 100,
      } as never);
      const v = dodgeVector(BOT_SKILL_PROFILES.master, 20, 20, [other], [], 0, e => (e.id === 'e1' ? 'g-stomp-windup' : undefined) /* e2は対象外 */);
      expect(v).toBeTruthy();
    });

    it('検収是正#4: 返した技キーが今の技と食い違う(=別州)なら抑止しない', () => {
      const v = dodgeVector(BOT_SKILL_PROFILES.master, 20, 20, [stomper], [], 0, e => (e.id === 'e1' ? 'g-sweep-windup' : undefined));
      expect(v).toBeTruthy(); // 'g-stomp-windup'は抑止対象の'g-sweep-windup'と一致しないので避け続ける
    });

    it('検収是正#4: 同時進行のgiantDelayedHits(遅延ダメージ=別技の残り)は今の技を抑止しても避け続ける', () => {
      const withDelayed = enemy({
        id: 'e1', aiPhase: 'g-stomp-windup', x: 0, y: 0, width: 40, height: 40, gStompRadius: 100,
        giantDelayedHits: [{ x: 20, y: 20, radius: 50, fireAt: 0 } as never],
      } as never);
      const v = dodgeVector(BOT_SKILL_PROFILES.master, 20, 20, [withDelayed], [], 0, e => (e.id === 'e1' ? 'g-stomp-windup' : undefined));
      expect(v).toBeTruthy(); // g-stomp-windup(今の技)は抑止されるが、giantDelayedHitsは州に関係なく残る
    });
  });

  describe('telegraphDodge の excludeMoveKey(検収是正#4・州単位)', () => {
    it('excludeMoveKeyが今の技と一致すると円/帯は落ちるがgiantDelayedHitsは残る', () => {
      const e = enemy({
        aiPhase: 'g-stomp-windup', x: 0, y: 0, width: 40, height: 40, gStompRadius: 100,
        giantDelayedHits: [{ x: 20, y: 20, radius: 50, fireAt: 0 } as never],
      } as never);
      const full = telegraphDodge(20, 20, e);
      const excluded = telegraphDodge(20, 20, e, 'g-stomp-windup');
      expect(full.length).toBeGreaterThan(excluded.length);
      expect(excluded.length).toBeGreaterThan(0); // giantDelayedHitsは残る
    });

    it('excludeMoveKeyが今の技と食い違う時は何も落ちない', () => {
      const e = enemy({ aiPhase: 'g-stomp-windup', x: 0, y: 0, width: 40, height: 40, gStompRadius: 100 } as never);
      const full = telegraphDodge(20, 20, e);
      const notExcluded = telegraphDodge(20, 20, e, 'g-sweep-windup');
      expect(notExcluded.length).toBe(full.length);
    });
  });

  it('dodgeToInput は死角(deadzone)未満を倒さない / 相反する方向を同時に押さない', () => {
    expect(dodgeToInput({ x: 0, y: -1 })).toEqual({ up: true, down: false, left: false, right: false });
    expect(dodgeToInput({ x: 0.1, y: 0.1 })).toEqual({ up: false, down: false, left: false, right: false });
    const i = dodgeToInput({ x: 0.8, y: 0.8 });
    expect(i.left && i.right).toBe(false);
    expect(i.up && i.down).toBe(false);
  });
});

describe('標的選択', () => {
  const near = enemy({ id: 'near', x: 50, y: 0, health: 200 });
  const farWeak = enemy({ id: 'farWeak', x: 300, y: 0, health: 1 });
  const jumper = enemy({ id: 'jumper', x: 120, y: 0, health: 200, aiPhase: 'jump' });

  it('nearest は最寄りを選ぶ(現状の挙動)', () => {
    expect(pickTarget('nearest', 0, 0, [farWeak, near, jumper], 0)?.id).toBe('near');
  });

  it('threat は攻撃してくる相手を優先する', () => {
    expect(pickTarget('threat', 0, 0, [near, jumper], 0)?.id).toBe('jumper');
  });

  it('optimal はスタン中の敵(処刑=最安)を最優先する', () => {
    const stunnedFar = enemy({ id: 'stunned', x: 200, y: 0, health: 200, stunUntil: 9999 });
    expect(pickTarget('optimal', 0, 0, [near, stunnedFar], 1000)?.id).toBe('stunned');
  });

  it('敵が居なければ undefined', () => {
    expect(pickTarget('optimal', 0, 0, [], 0)).toBeUndefined();
  });

  it('スコアは有限(距離0や体力0でも壊れない)', () => {
    for (const m of ['nearest', 'weakest', 'threat', 'optimal'] as const) {
      expect(Number.isFinite(targetScore(m, 0, 0, enemy({ x: 0, y: 0, health: 0 }), 0))).toBe(true);
    }
  });
});

// §6.25改訂: disengageHp(旧 retreatHpFrac)。旧フィールドは向きが逆だった(master=0.5=上手いほど
// 早く逃げる)ので、上手いほど粘る(master=0.2)へ反転させた。novice=0.5/casual=0.4/skilled=0.3/master=0.2。
describe('HP退避(disengageHp・§6.25改訂で反転)', () => {
  it('novice は50%、casual は40%で交戦を切り上げる', () => {
    expect(shouldRetreatForHp(BOT_SKILL_PROFILES.novice, 50, 100)).toBe(true);
    expect(shouldRetreatForHp(BOT_SKILL_PROFILES.novice, 51, 100)).toBe(false);
    expect(shouldRetreatForHp(BOT_SKILL_PROFILES.casual, 40, 100)).toBe(true);
    expect(shouldRetreatForHp(BOT_SKILL_PROFILES.casual, 41, 100)).toBe(false);
  });

  it('skilled は30%、master は20%で交戦を切り上げる(反転後=上手いほど遅く/低いHPまで粘る)', () => {
    expect(shouldRetreatForHp(BOT_SKILL_PROFILES.skilled, 30, 100)).toBe(true);
    expect(shouldRetreatForHp(BOT_SKILL_PROFILES.skilled, 31, 100)).toBe(false);
    expect(shouldRetreatForHp(BOT_SKILL_PROFILES.master, 20, 100)).toBe(true);
    expect(shouldRetreatForHp(BOT_SKILL_PROFILES.master, 21, 100)).toBe(false);
  });

  it('disengageHp は段が上がるほど単調減少(粘り強くなる)', () => {
    const order = ['novice', 'casual', 'skilled', 'master'] as const;
    for (let i = 1; i < order.length; i++) {
      expect(BOT_SKILL_PROFILES[order[i]].disengageHp).toBeLessThan(BOT_SKILL_PROFILES[order[i - 1]].disengageHp);
    }
  });

  it('maxHealth が0でも壊れない', () => {
    expect(shouldRetreatForHp(BOT_SKILL_PROFILES.master, 0, 0)).toBe(false);
  });
});

// §6.25【改訂】不変条件1: novice/casualは「既存の(§6.25より前からある)ダイヤル」が従来値のまま。
// disengageHp/engageDist/dodgeVsAttack(§6.25改訂で新設)と、avoidContactDist=0/meleeVsDanger=true/
// warpReact=false/upgradePolicy='random'(明示的なno-op値)は本テストの対象に含めない
// (PACING_PUZZLE.md ★未決事項参照: disengageHp反転は novice/casual にも実測値が入る意図的な変更)。
describe('novice/casualの既存ダイヤルは本バッチで変わらない(不変条件1)', () => {
  // ★v0.25.3554: `dodge` は社長指示で全段階へ入ったので、この不変条件の対象から外した
  // (反応・成功率・標的選択・囲まれ判定は従来どおり据え置き)。
  it('reactionMs/counterChance/targeting/surroundCountは従来値のまま', () => {
    expect(BOT_SKILL_PROFILES.novice).toMatchObject({
      reactionMs: 500, counterChance: 0.25, targeting: 'nearest',
    });
    expect(BOT_SKILL_PROFILES.casual).toMatchObject({
      reactionMs: 250, counterChance: 0.65, targeting: 'nearest', surroundCount: 3,
    });
  });

  it('avoidContactDist=0・meleeVsDanger=true・warpReact=false・upgradePolicy=randomは明示的no-op(novice/casual共通)', () => {
    for (const skill of ['novice', 'casual'] as const) {
      const p = BOT_SKILL_PROFILES[skill];
      expect(p.avoidContactDist).toBe(0);
      expect(p.meleeVsDanger).toBe(true);
      expect(p.warpReact).toBe(false);
      expect(p.upgradePolicy).toBe('random');
    }
  });
});

// M49-1(§6.25): 接触脅威の認識。カウンターではなく回避(dodgeVector)側にのみ足す。
describe('接触脅威(contactDodge・§6.25 M49-1)', () => {
  it('危険判定はプレイヤー最大HPに対する割合(固定ダメージ閾値ではない)', () => {
    const e = enemy({ x: 100, y: 0, damage: 24 } as Partial<Enemy>);
    // maxHealth=100: 24 >= 100*0.2 → 危険。maxHealth=1000: 24 < 1000*0.2 → 危険ではない(装備/レベルに自動追従)。
    expect(isContactDangerous(e, 100)).toBe(true);
    expect(isContactDangerous(e, 1000)).toBe(false);
    expect(CONTACT_DANGER_HP_FRAC).toBe(0.2);
  });

  it('危険でも DODGE_CONTACT_DIST より遠ければ避けない', () => {
    const e = enemy({ x: DODGE_CONTACT_DIST + 10, y: 0, damage: 999 } as Partial<Enemy>);
    expect(contactDodge(0, 0, e, 100)).toBeNull();
  });

  it('危険かつ近ければ敵から離れる向きを返す', () => {
    const e = enemy({ x: 100, y: 0, damage: 999 } as Partial<Enemy>);
    const t = contactDodge(0, 0, e, 100)!;
    expect(t).toBeTruthy();
    expect(t.kind).toBe('contact');
    expect(t.ux).toBeCloseTo(-1, 2); // 敵は+x側 → -x(離れる)へ
  });

  it('危険でない敵(ダメージが低い)は避けない', () => {
    const e = enemy({ x: 100, y: 0, damage: 1 } as Partial<Enemy>);
    expect(contactDodge(0, 0, e, 100)).toBeNull();
  });

  it("dodgeHandles(level,'contact') は 'all'(master)のみtrue", () => {
    expect(dodgeHandles('none', 'contact')).toBe(false);
    expect(dodgeHandles('projectile', 'contact')).toBe(false);
    expect(dodgeHandles('aoe', 'contact')).toBe(false);
    expect(dodgeHandles('all', 'contact')).toBe(true);
  });

  it('dodgeVector: maxHealth省略(既定0)は接触脅威を無視する(既存呼び出し元の完全なno-op)', () => {
    const dangerous = [enemy({ x: 50, y: 0, damage: 999 } as Partial<Enemy>)];
    expect(dodgeVector(BOT_SKILL_PROFILES.master, 0, 0, dangerous, [])).toBeNull();
  });

  // ★v0.25.3554: skilled も `dodge:'all'` になったので接触脅威を避ける(旧: skilled は 'projectile' で避けなかった)。
  // 接触を避けないのは **novice/casual**(dodge:'projectile')になった=段の切れ目が1つ下がった。
  it('dodgeVector: 接触脅威を避けるのは skilled 以上(novice/casual は避けない)', () => {
    const dangerous = [enemy({ x: 50, y: 0, damage: 999 } as Partial<Enemy>)];
    expect(dodgeVector(BOT_SKILL_PROFILES.master, 0, 0, dangerous, [], 100)).toBeTruthy();
    expect(dodgeVector(BOT_SKILL_PROFILES.skilled, 0, 0, dangerous, [], 100)).toBeTruthy();
    expect(dodgeVector(BOT_SKILL_PROFILES.casual, 0, 0, dangerous, [], 100)).toBeNull();
    expect(dodgeVector(BOT_SKILL_PROFILES.novice, 0, 0, dangerous, [], 100)).toBeNull();
  });
});

// M49-3(§6.25): ワープ(瞬間移動)追従。
describe('ワープ追従(warpDodge・§6.25 M49-3)', () => {
  it('WARP_DETECT_PXは通常移動では絶対に発火しない(不変条件4)', () => {
    // ゲーム中の全EnemyType + AREA_SPEED_MULT(最大2.0)+ GAME_SPEED を掛けた「実効最大速度」の
    // 1tick(1/60s)分の移動量が WARP_DETECT_PX を大きく下回ることを確認する。
    const types: EnemyType[] = [
      'bat', 'skeleton', 'zombie', 'plant', 'ghost', 'werewolf', 'pumpkin', 'lich', 'giantbat', 'reaper',
      'hunter', 'screamer', 'lab-zombie-1', 'lab-zombie-2', 'lab-zombie-3',
    ];
    const maxAreaMult = Math.max(...AREA_SPEED_MULT);
    let maxPerTick = 0;
    for (const t of types) {
      const perTick = getEnemyBaseSpeed(t) * maxAreaMult * GAME_SPEED * (1 / 60);
      maxPerTick = Math.max(maxPerTick, perTick);
    }
    expect(maxPerTick).toBeLessThan(WARP_DETECT_PX);
    expect(WARP_DETECT_PX).toBe(300);
  });

  it('初出(前tickの記録が無い)敵は判定しない(誤検知防止)', () => {
    const state = createWarpTrackState();
    const e = enemy({ id: 'e1', x: 1000, y: 0 } as Partial<Enemy>);
    expect(warpDodge(BOT_SKILL_PROFILES.master, state, 0, 0, 0, [e])).toBeNull();
  });

  it('通常移動量(小さい移動)では検知しない', () => {
    const state = createWarpTrackState();
    const e1 = enemy({ id: 'e1', x: 0, y: 0 } as Partial<Enemy>);
    warpDodge(BOT_SKILL_PROFILES.master, state, 0, 0, 0, [e1]);
    const e2 = enemy({ id: 'e1', x: 5, y: 0 } as Partial<Enemy>); // 5px移動=通常
    expect(warpDodge(BOT_SKILL_PROFILES.master, state, 16, 0, 0, [e2])).toBeNull();
  });

  it('WARP_DETECT_PX以上の移動を検知し、reactionMs経過後に離れる向きを返す(master=80ms)', () => {
    const state = createWarpTrackState();
    const e1 = enemy({ id: 'e1', x: 0, y: 0 } as Partial<Enemy>);
    warpDodge(BOT_SKILL_PROFILES.master, state, 0, 0, 0, [e1]);
    const e2 = enemy({ id: 'e1', x: WARP_DETECT_PX + 20, y: 0 } as Partial<Enemy>); // ワープ
    // 検知直後(反応遅延80ms未満)はまだ反応しない。
    expect(warpDodge(BOT_SKILL_PROFILES.master, state, 10, 0, 0, [e2])).toBeNull();
    // 反応遅延(80ms)経過後は敵から離れる向きを返す。
    const t = warpDodge(BOT_SKILL_PROFILES.master, state, 90, 0, 0, [e2])!;
    expect(t).toBeTruthy();
    expect(t.x).toBeLessThan(0); // 敵は+x側 → -x(離れる)へ
  });

  it('warpReact=falseの段(novice/casual)は検知しても反応しない(常にnull)', () => {
    const state = createWarpTrackState();
    const e1 = enemy({ id: 'e1', x: 0, y: 0 } as Partial<Enemy>);
    warpDodge(BOT_SKILL_PROFILES.novice, state, 0, 0, 0, [e1]);
    const e2 = enemy({ id: 'e1', x: WARP_DETECT_PX + 20, y: 0 } as Partial<Enemy>);
    expect(warpDodge(BOT_SKILL_PROFILES.novice, state, 0, 0, 0, [e2])).toBeNull();
    expect(warpDodge(BOT_SKILL_PROFILES.novice, state, 100000, 0, 0, [e2])).toBeNull();
  });

  it('画面外/討伐で消えた敵の記録は掃除される(再出現時に誤検知しない)', () => {
    const state = createWarpTrackState();
    const e1 = enemy({ id: 'e1', x: 0, y: 0 } as Partial<Enemy>);
    warpDodge(BOT_SKILL_PROFILES.master, state, 0, 0, 0, [e1]); // 記録
    warpDodge(BOT_SKILL_PROFILES.master, state, 16, 0, 0, []);  // 消滅(掃除)
    // 同じidで別位置に再出現しても「初出」扱いになる(いきなり離れた場所でも誤検知しない)。
    const e2 = enemy({ id: 'e1', x: 5000, y: 0 } as Partial<Enemy>);
    expect(warpDodge(BOT_SKILL_PROFILES.master, state, 32, 0, 0, [e2])).toBeNull();
  });
});

// §6.25改訂: dodgeVsAttack(回避と攻撃が競合した時の優先度)。
describe('dodgeOverridesAttack(§6.25改訂 dodgeVsAttack)', () => {
  it('hasDodge=falseなら常にfalse(novice/casualはdodge=noneなのでhasDodgeが常にfalse=no-op)', () => {
    expect(dodgeOverridesAttack(BOT_SKILL_PROFILES.novice, false, () => 0)).toBe(false);
    expect(dodgeOverridesAttack(BOT_SKILL_PROFILES.master, false, () => 0)).toBe(false);
  });

  it('hasDodge=trueならdodgeVsAttackの確率で回避が攻撃に勝つ(決定的randで検証)', () => {
    expect(dodgeOverridesAttack(BOT_SKILL_PROFILES.master, true, () => 0)).toBe(true); // 0 < 0.25
    expect(dodgeOverridesAttack(BOT_SKILL_PROFILES.master, true, () => 0.99)).toBe(false); // 0.99 >= 0.25
  });

  it('masterはskilledよりdodgeVsAttackが低い(回避より攻撃を選ぶ頻度が高い)', () => {
    expect(BOT_SKILL_PROFILES.master.dodgeVsAttack).toBeLessThan(BOT_SKILL_PROFILES.skilled.dodgeVsAttack);
  });
});

// §6.25改訂: 攻撃側ダイヤルの単調性(不変条件6: 段の単調性)。
describe('攻撃側ダイヤルの単調性(engageDist/dodgeVsAttack・不変条件6)', () => {
  it('engageDistは段が上がるほど単調増加(遠くまで追う)', () => {
    const order = ['novice', 'casual', 'skilled', 'master'] as const;
    for (let i = 1; i < order.length; i++) {
      expect(BOT_SKILL_PROFILES[order[i]].engageDist).toBeGreaterThan(BOT_SKILL_PROFILES[order[i - 1]].engageDist);
    }
  });

  it('dodgeVsAttackは段が上がるほど単調非増加(攻撃優先になる)', () => {
    const order = ['novice', 'casual', 'skilled', 'master'] as const;
    for (let i = 1; i < order.length; i++) {
      expect(BOT_SKILL_PROFILES[order[i]].dodgeVsAttack).toBeLessThanOrEqual(BOT_SKILL_PROFILES[order[i - 1]].dodgeVsAttack);
    }
  });

  // ★v0.25.3780(research/THOR_ISSEN_REWORK.md §8-4・社長裁定「マスターとスキルドは覚える」):
  // トールの紫円(無の境地)の中では近接を振らない、を学習しているか。既存の seesBossCounterPhases と
  // 同じ「段ごとの真偽ダイヤル」なので単調性も同じ流儀で固定する。
  it('respectsNihilCircleは段が上がるほど単調非減少(master/skilledだけが覚える)', () => {
    const order = ['novice', 'casual', 'skilled', 'master'] as const;
    for (let i = 1; i < order.length; i++) {
      expect(Number(BOT_SKILL_PROFILES[order[i]].respectsNihilCircle))
        .toBeGreaterThanOrEqual(Number(BOT_SKILL_PROFILES[order[i - 1]].respectsNihilCircle));
    }
    expect(BOT_SKILL_PROFILES.novice.respectsNihilCircle).toBe(false);
    expect(BOT_SKILL_PROFILES.casual.respectsNihilCircle).toBe(false);
    expect(BOT_SKILL_PROFILES.skilled.respectsNihilCircle).toBe(true);
    expect(BOT_SKILL_PROFILES.master.respectsNihilCircle).toBe(true);
  });

  it('★紫の円は回避脅威に足していない(帯としても円としても拾わない=立っているだけなら安全)', () => {
    const thorNihil = {
      id: 'n', type: 'thor', bossState: 'issen-nihil',
      x: 0, y: 0, width: 40, height: 40,
      aiFromX: 0, aiFromY: 0, aiTargetX: 310, aiTargetY: 0,
    } as unknown as Enemy;
    expect(telegraphDodge(60, 0, thorNihil)).toHaveLength(0);
  });
});

// ★v0.25.2432: ボットがボスの技を1つも避けなかった穴の回帰テスト。
// ここが死ぬと「ボス戦のテスト結果=赤を一切避けない人の数字」に逆戻りし、
// ボス関連のバランス判断の土台が無くなる。
describe('telegraphDodge — ボスの予告(赤い円/帯)を避ける', () => {
  const boss = (over: Partial<Enemy> = {}): Enemy => ({
    id: 'b1', type: 'giantbat', x: 0, y: 0, width: 60, height: 60,
    health: 500, maxHealth: 500, speed: 70, damage: 19, lastShot: 0, lastHit: 0,
    ...over,
  } as Enemy);

  it('踏み鳴らしの円の中に居たら、外へ向かう向きが出る', () => {
    // ボス中心(30,30)・半径120。プレイヤーは中心のすぐ右=右へ逃げるのが正解。
    const t = telegraphDodge(40, 30, boss({ aiPhase: 'g-stomp-windup', gStompRadius: 120 }));
    expect(t).toHaveLength(1);
    expect(t[0].kind).toBe('aoe');
    expect(t[0].ux).toBeGreaterThan(0.9); // +x方向へ退く
  });

  it('円の外に居るなら何も出ない(常に逃げ続けない)', () => {
    expect(telegraphDodge(2000, 2000, boss({ aiPhase: 'g-stomp-windup', gStompRadius: 120 }))).toHaveLength(0);
  });

  it('連続ジャンプは「残りの着地点」だけが危険(着地済みは避けない)', () => {
    const pts = [0, 0, 500, 0, 1000, 0];
    // 1発目が済んでいる(idx=1)なら、原点の円はもう危険ではない。
    const done = telegraphDodge(0, 0, boss({ aiPhase: 'g-trijump-air', gTriJumpPts: pts, gTriJumpIdx: 1 }));
    expect(done).toHaveLength(0);
    // まだ溜め中(全部残っている)なら原点は危険。
    const pending = telegraphDodge(0, 0, boss({ aiPhase: 'g-trijump-windup', gTriJumpPts: pts, gTriJumpIdx: 0 }));
    expect(pending.length).toBeGreaterThan(0);
  });

  it('帯技(薙ぎ払い等)は線の上から直交方向へ逃げる', () => {
    const t = telegraphDodge(300, 10, boss({
      aiPhase: 'g-sweep-windup', aiFromX: 0, aiFromY: 0, aiTargetX: 600, aiTargetY: 0,
    }));
    expect(t).toHaveLength(1);
    expect(Math.abs(t[0].uy)).toBeGreaterThan(0.9); // 線(x軸)に直交=±y へ退く
  });

  it('グレンの遅延ダメージ(円/カプセル)も危険として見える', () => {
    const circle = telegraphDodge(10, 10, boss({
      giantDelayedHits: [{ x: 0, y: 0, radius: 200, bornAt: 0, fireAt: 1000 }],
    } as Partial<Enemy>));
    expect(circle.length).toBeGreaterThan(0);
  });

  it('何も出していないボスからは何も出ない', () => {
    expect(telegraphDodge(10, 10, boss())).toHaveLength(0);
  });

  // ★v0.25.3818(社長裁定 §9-6「突進の走行中の体当たり」=(B)「当てる」の条件②)。走行中(`thor-dash-move`)は巨体の AABB が
  // 接触ダメージを持つ(combatTick のトール除外から外れている)のに、旧リストは `-windup` と
  // 明示3州しか拾わず**ボットには走りが見えていなかった**。これが抜けると
  // 「赤い帯は描いてあるのにボットだけ避けない」= ボス戦の計測が当たり放題の数字に戻る。
  it('★トールの突進の走り(thor-dash-move)を帯として避ける', () => {
    const thor = (bossState: string): Enemy => boss({
      type: 'thor', bossState, width: 140, height: 70,
      aiFromX: 0, aiFromY: 0, aiTargetX: 600, aiTargetY: 0,
    } as Partial<Enemy>);
    const run = telegraphDodge(300, 10, thor('thor-dash-move'));
    expect(run, '走行中(thor-dash-move)が帯脅威として出ていない').toHaveLength(1);
    expect(Math.abs(run[0].uy), '線(x軸)に直交する向きへ退いていない').toBeGreaterThan(0.9);
    // 溜め(-windup)は従来どおり拾う=今回の追加が既存の経路を壊していないことの対照。
    expect(telegraphDodge(300, 10, thor('thor-dash-windup'))).toHaveLength(1);
    // 硬直(-recover)は帯を出さない=「走行中だけ足した」ことの証明(常時脅威にしていない)。
    expect(telegraphDodge(300, 10, thor('thor-dash-recover'))).toHaveLength(0);
  });

  // ★段階の扱い: 'aoe' は「何かしら避ける段階なら全部が対象」。既定(casual='none')は不変。
  it("赤い予告は 'none' 以外の全段階が扱う(既定 casual は避けないまま=既存ランを動かさない)", () => {
    expect(dodgeHandles('none', 'aoe')).toBe(false);
    for (const lv of ['projectile', 'aoe', 'all'] as const) expect(dodgeHandles(lv, 'aoe')).toBe(true);
  });

  // v0.25.4085(赤円全数監査#8): 回避側の三連跳び半径は実判定(GLEN_TRIJUMP_RADIUS)と同値であること。
  // botSkillは循環import(gameStore→thorNihil→botSkill)でgameStoreを読めないため、同値をリテラルで
  // 持ち、この突き合わせで機械固定する(どちらかを動かしたらここが落ちる)。
  it('DODGE_GLEN_TRIJUMP_R は gameStore の GLEN_TRIJUMP_RADIUS と同値', async () => {
    const { GLEN_TRIJUMP_RADIUS } = await import('../store/gameStore');
    expect(DODGE_GLEN_TRIJUMP_R).toBe(GLEN_TRIJUMP_RADIUS);
  });
});

// ボットの腕前段階(社長指示v0.25.2338)。
// **最重要の不変条件は「既定(casual)が現状のボットと同値」**。ここが崩れると、過去のボットラン実測値と
// 比較できなくなり、サブクエ閾値やガチャ収入の判断材料が全部使えなくなる。
import { describe, it, expect } from 'vitest';
import {
  BOT_SKILLS, DEFAULT_BOT_SKILL, BOT_SKILL_PROFILES, botSkillProfile, parseBotSkill,
  projectileDodge, jumpDodge, chargeDodge, dodgeVector, dodgeToInput, dodgeHandles,
  pickTarget, targetScore, shouldRetreatForHp,
  DODGE_PROJECTILE_DIST, DODGE_AOE_DIST,
} from './botSkill';
import { COUNTER_REACTION_PROFILES } from './playtestBot';
import type { Enemy, Projectile } from '../types/game';

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

  it('casual は現状のボットと同値(反応250ms・成功率0.65・回避なし・最寄り狙い)', () => {
    const c = BOT_SKILL_PROFILES.casual;
    expect(c.reactionMs).toBe(COUNTER_REACTION_PROFILES.standard!.reactionMs);
    expect(c.counterChance).toBe(COUNTER_REACTION_PROFILES.standard!.chance);
    expect(c.dodge).toBe('none');       // 現状のボットは位置で避けない
    expect(c.targeting).toBe('nearest'); // 現状のボットは最寄りを狙う
    expect(c.surroundCount).toBe(3);     // playtestBot の SURROUND_COUNT と同値
  });

  it('段階が上がるほど反応が速く、カウンター成功率が高い(単調)', () => {
    const order = ['novice', 'casual', 'skilled', 'master'] as const;
    for (let i = 1; i < order.length; i++) {
      const prev = BOT_SKILL_PROFILES[order[i - 1]], cur = BOT_SKILL_PROFILES[order[i]];
      expect(cur.reactionMs).toBeLessThan(prev.reactionMs);
      expect(cur.counterChance).toBeGreaterThan(prev.counterChance);
      expect(cur.surroundCount).toBeLessThanOrEqual(prev.surroundCount); // 危険察知は早くなる一方
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

  it('novice / casual は一切避けない(現状の挙動を変えない)', () => {
    const b = [bullet(-60, 0, 1, 0)];
    const e = [enemy({ aiPhase: 'jump', aiTargetX: 0, aiTargetY: 0 })];
    expect(dodgeVector(BOT_SKILL_PROFILES.novice, 0, 0, e, b)).toBeNull();
    expect(dodgeVector(BOT_SKILL_PROFILES.casual, 0, 0, e, b)).toBeNull();
  });

  it('skilled は弾だけ避け、着地は避けない', () => {
    const onlyJump = [enemy({ aiPhase: 'jump', aiTargetX: 0, aiTargetY: 0 })];
    expect(dodgeVector(BOT_SKILL_PROFILES.skilled, 10, 0, onlyJump, [])).toBeNull();
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

describe('HP退避', () => {
  it('novice / casual は退避しない(現状の挙動)', () => {
    expect(shouldRetreatForHp(BOT_SKILL_PROFILES.novice, 1, 100)).toBe(false);
    expect(shouldRetreatForHp(BOT_SKILL_PROFILES.casual, 1, 100)).toBe(false);
  });

  it('skilled は35%、master は50%で退避に切り替わる', () => {
    expect(shouldRetreatForHp(BOT_SKILL_PROFILES.skilled, 34, 100)).toBe(true);
    expect(shouldRetreatForHp(BOT_SKILL_PROFILES.skilled, 36, 100)).toBe(false);
    expect(shouldRetreatForHp(BOT_SKILL_PROFILES.master, 49, 100)).toBe(true);
  });

  it('maxHealth が0でも壊れない', () => {
    expect(shouldRetreatForHp(BOT_SKILL_PROFILES.master, 0, 0)).toBe(false);
  });
});

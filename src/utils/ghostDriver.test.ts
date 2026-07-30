// BOT_AND_GHOST.md G2(ゴースト本体)。純関数の意思決定(decideGhost)+補助関数を検証する。
import { describe, it, expect } from 'vitest';
import {
  decideGhost, defaultGhostProfile, ghostLeashWarp, hitsPerMinToDodgeStrength,
  ghostSubUseIntervalMs, shouldGhostClaimSub, DEFAULT_SUB_USES_PER_MIN,
  ghostRunEnabled, GUARDIAN_SPIRIT_SKILL,
  GHOST_LEASH_PX, GHOST_MELEE_RANGE, GHOST_BOSS_HP_MULT,
  rollGhostMoveReaction, GHOST_MOVE_ROLL_MIN_N, GHOST_MOVE_ROLL_TIMEOUT_MS,
  type GhostSelf, type GhostProfile, type GhostWeapon, type GhostDriverInput, type GhostMoveRoll,
} from './ghostDriver';
import { jumpDodge, botSkillProfile } from './botSkill';
import type { Enemy } from '../types/game';

const mkBoss = (overrides: Partial<Enemy> = {}): Enemy => ({
  id: 'boss-1', x: 0, y: 0, width: 40, height: 40, speed: 0,
  health: 100, maxHealth: 100, damage: 10, type: 'thor', experienceValue: 0,
  lastHit: 0, lastShot: 0,
  ...overrides,
} as unknown as Enemy);

// lastShotAt/lastMeleeAtは既定で「大昔」にしておき、クールダウンを意図的に検証するテストだけが
// 個別に上書きする(そうしないとGHOST_MELEE_COOLDOWN_MS(600ms)がnowMs=0付近のテストを毎回ブロックする)。
const mkGhost = (overrides: Partial<GhostSelf> = {}): GhostSelf => ({
  x: 0, y: 0, width: 20, height: 20, facing: 1, lastShotAt: -1_000_000, lastMeleeAt: -1_000_000,
  ...overrides,
});

const PROFILE: GhostProfile = {
  reactionMs: 200, counterChance: 1, preferredDist: 180, meleeBias: 1, mobility: 1, hitsPerMin: 0,
  subUsesPerMin: 2,
};
const WEAPON: GhostWeapon = { gunDamage: 10, gunIntervalMs: 300, gunRangePx: 400, meleeDamage: 20 };

const baseDriverInput = (over: Partial<GhostDriverInput> = {}): GhostDriverInput => ({
  ghost: mkGhost(),
  player: { x: 0, y: 0, width: 20, height: 20 },
  enemies: [],
  projectiles: [],
  profile: PROFILE,
  weapon: WEAPON,
  gameTime: 0,
  nowMs: 0,
  rand: () => 0, // 既定は「常に成功/常に発火」側(0 < どんな確率でも成功)
  ...over,
});

describe('defaultGhostProfile: botSkillのcasual相当から変換', () => {
  it('reactionMs/counterChanceはcasualの値そのまま', () => {
    const casual = botSkillProfile('casual');
    const p = defaultGhostProfile();
    expect(p.reactionMs).toBe(casual.reactionMs);
    expect(p.counterChance).toBe(casual.counterChance);
  });
});

describe('ghostLeashWarp: プレイヤーから600px超えたら瞬時にワープ', () => {
  it('600px以内なら null(ワープしない)', () => {
    const ghost = { x: 500, y: 0, width: 20, height: 20 };
    const player = { x: 0, y: 0, width: 20, height: 20 };
    expect(ghostLeashWarp(ghost, player)).toBeNull();
  });

  it('600pxを超えたらプレイヤー付近の座標を返す', () => {
    const ghost = { x: GHOST_LEASH_PX + 100, y: 0, width: 20, height: 20 };
    const player = { x: 0, y: 0, width: 20, height: 20 };
    const w = ghostLeashWarp(ghost, player);
    expect(w).not.toBeNull();
    // 戻り値は「プレイヤーの近傍」であること(厳密な演出位置はBOT_AND_GHOST.mdが「後回しでよい」とする範囲)。
    const d = Math.hypot((w!.x + 10) - (player.x + 10), (w!.y + 10) - (player.y + 10));
    expect(d).toBeLessThan(GHOST_LEASH_PX);
  });
});

describe('hitsPerMinToDodgeStrength: 被弾が多いほど回避が下手(逆写像)', () => {
  it('被弾0なら1(最大)', () => {
    expect(hitsPerMinToDodgeStrength(0)).toBe(1);
  });
  it('被弾が多いほど下がるが、0.15を床に完全には死なない', () => {
    expect(hitsPerMinToDodgeStrength(4)).toBeLessThan(1);
    expect(hitsPerMinToDodgeStrength(100)).toBeCloseTo(0.15, 5);
  });
});

describe('decideGhost: 標的が居ない', () => {
  it('プレイヤーへ寄る(戦闘はしない)', () => {
    const d = decideGhost(baseDriverInput({
      ghost: mkGhost({ x: 200, y: 0 }),
      player: { x: 0, y: 0, width: 20, height: 20 },
      enemies: [],
    }));
    expect(d.action).toBe('none');
    expect(d.targetId).toBeNull();
    expect(d.moveX).toBeLessThan(0); // プレイヤーは左側
  });
});

describe('decideGhost: 雑魚回避(v0.25.2470・社長裁定「雑魚は基本的に避けつつボスと戦う」)', () => {
  it('至近の雑魚から離れる向きが移動に混ざる(狙いはボスのまま)', () => {
    const boss = mkBoss({ x: 1000, y: 0 });
    const mob = mkBoss({ id: 'mob-1', type: 'zombie', x: 10, y: 60, width: 20, height: 20 }); // すぐ下に雑魚
    const d = decideGhost(baseDriverInput({
      ghost: mkGhost({ x: 0, y: 0 }),
      enemies: [boss, mob],
      boundBossId: 'boss-1',
    }));
    expect(d.targetId).toBe('boss-1');      // 雑魚に流れない
    expect(d.moveX).toBeGreaterThan(0);     // ボス(右)へは向かい続ける
    expect(d.moveY).toBeLessThan(0);        // 下の雑魚から上へ逃げる成分が混ざる
  });
  it('boundBossIdがあれば雑魚が近くてもボスを狙う', () => {
    const boss = mkBoss({ x: 500, y: 0 });
    const mob = mkBoss({ id: 'mob-1', type: 'zombie', x: 30, y: 0, width: 20, height: 20 }); // ボスより近い雑魚
    const d = decideGhost(baseDriverInput({
      ghost: mkGhost({ x: 0, y: 0 }),
      enemies: [mob, boss],
      boundBossId: 'boss-1',
    }));
    expect(d.targetId).toBe('boss-1');
  });
});

describe('decideGhost: 間合い管理(preferredDistへ寄せる)', () => {
  it('preferredDistより遠い時は接近する', () => {
    const boss = mkBoss({ x: 1000, y: 0 });
    const d = decideGhost(baseDriverInput({
      ghost: mkGhost({ x: 0, y: 0 }),
      enemies: [boss],
    }));
    expect(d.targetId).toBe('boss-1');
    expect(d.moveX).toBeGreaterThan(0); // ボスは右側=接近は+x
  });

  it('preferredDistより近い時は離れる', () => {
    const boss = mkBoss({ x: 20, y: 0, width: 10, height: 10 }); // ごく至近
    const d = decideGhost(baseDriverInput({
      ghost: mkGhost({ x: 0, y: 0 }),
      enemies: [boss],
      profile: { ...PROFILE, meleeBias: 0 }, // 近接を打たせず移動だけ見る
    }));
    expect(d.moveX).toBeLessThan(0); // ボスは右側=離れるのは-x
  });

  it('mobilityが低いと動かないtickが出る(rand>=mobilityで静止)', () => {
    const boss = mkBoss({ x: 1000, y: 0 });
    const d = decideGhost(baseDriverInput({
      ghost: mkGhost({ x: 0, y: 0 }),
      enemies: [boss],
      profile: { ...PROFILE, mobility: 0.3 },
      rand: () => 0.9, // 0.9 >= mobility(0.3) → 移動しない
    }));
    expect(d.moveX).toBe(0);
    expect(d.moveY).toBe(0);
  });
});

describe('decideGhost: 攻撃(近接/銃)', () => {
  it('近接圏内・meleeBias成立・非カウンター局面なら近接攻撃', () => {
    const boss = mkBoss({ x: 10, y: 0, width: 10, height: 10, bossState: 'chase' });
    const d = decideGhost(baseDriverInput({
      ghost: mkGhost({ x: 0, y: 0, width: 10, height: 10 }),
      enemies: [boss],
      profile: { ...PROFILE, meleeBias: 1 },
      rand: () => 0, // 0 < meleeBias(1) → 近接成立
    }));
    expect(d.action).toBe('melee');
    expect(d.lastMeleeAt).toBe(0);
  });

  it('近接圏外・gunRangePx以内・CD明けなら射撃', () => {
    const boss = mkBoss({ x: 300, y: 0 });
    const d = decideGhost(baseDriverInput({
      ghost: mkGhost({ x: 0, y: 0 }),
      enemies: [boss],
    }));
    expect(d.action).toBe('shoot');
    expect(d.lastShotAt).toBe(0);
  });

  it('銃のクールダウン中は撃たない', () => {
    const boss = mkBoss({ x: 300, y: 0 });
    const d = decideGhost(baseDriverInput({
      ghost: mkGhost({ x: 0, y: 0, lastShotAt: 100 }),
      enemies: [boss],
      nowMs: 200, // interval=300未満
    }));
    expect(d.action).toBe('none');
  });

  it('カウンター可能局面(windup)は即座に撃たず、reactionMs経過後に成立する', () => {
    const boss = mkBoss({ x: 10, y: 0, width: 10, height: 10, bossState: 'issen-windup' });
    const ghost = mkGhost({ x: 0, y: 0, width: 10, height: 10 });
    const first = decideGhost(baseDriverInput({ ghost, enemies: [boss], nowMs: 0 }));
    expect(first.action).toBe('none'); // reactionMs(200)未経過
    expect(first.counterPendingAt).toBe(0);
    expect(first.counterWillAttempt).toBe(true); // rand()=0 < counterChance(1)

    const second = decideGhost(baseDriverInput({
      ghost: { ...ghost, counterPendingAt: first.counterPendingAt, counterWillAttempt: first.counterWillAttempt },
      enemies: [boss], nowMs: 250, // reactionMs(200)経過
    }));
    expect(second.action).toBe('melee');
    expect(second.counterPendingAt).toBeUndefined(); // 1機会=1回で窓を閉じる
  });

  it('カウンター不成立の抽選(rand>=counterChance)でも、カウンター可能局面の間は銃で代替しない', () => {
    const boss = mkBoss({ x: 10, y: 0, width: 10, height: 10, bossState: 'issen-windup' });
    const ghost = mkGhost({ x: 0, y: 0, width: 10, height: 10 });
    const d = decideGhost(baseDriverInput({
      ghost, enemies: [boss], nowMs: 1000, profile: { ...PROFILE, counterChance: 0 }, rand: () => 0.5,
    }));
    expect(d.counterWillAttempt).toBe(false);
    expect(d.action).toBe('none'); // 窓を見ている最中は近接も銃も出さない(BOT_AND_GHOST.md実装の統一)
  });

  it('カウンター可能局面が終われば(chaseに戻れば)通常どおり射程内で銃に代替する', () => {
    const boss = mkBoss({ x: 300, y: 0, bossState: 'chase' });
    const ghost = mkGhost({ x: 0, y: 0 });
    const d = decideGhost(baseDriverInput({
      ghost, enemies: [boss], nowMs: 1000, profile: { ...PROFILE, meleeBias: 0 },
    }));
    expect(d.action).toBe('shoot');
  });
});

describe('decideGhost: 回避が間合い管理より優先される', () => {
  it('ボスのジャンプ着地(aoe脅威)がある時は、通常の間合い接近(+x)ではなく回避(-x)を優先する', () => {
    // ボス本体は遠く+x側(=素の間合い管理なら接近方向は+x)。ただし着地点(aiTargetX/Y)はゴースト
    // のすぐ+x側=着地から逃げる方向は-x。両者を意図的に逆向きにして「回避が勝った」ことを符号で確認する。
    const boss = mkBoss({
      x: 1000, y: 0, aiPhase: 'jump' as Enemy['aiPhase'],
      aiTargetX: 15, aiTargetY: 10,
    });
    const ghost = mkGhost({ x: 0, y: 0 }); // 中心(10,10)
    const profile: GhostProfile = { ...PROFILE, hitsPerMin: 0 }; // dodgeStrength=1(最大)
    const d = decideGhost(baseDriverInput({ ghost, enemies: [boss], profile }));

    const expectedDodge = jumpDodge(10, 10, boss);
    expect(expectedDodge).not.toBeNull();
    expect(expectedDodge!.ux).toBeLessThan(0); // 着地点(x=15)から見て左(-x)へ逃げるはず
    expect(d.moveX).toBeLessThan(0); // 素の接近(+x)ではなく回避(-x)が勝っている
  });
});

describe('定数(BOT_AND_GHOST.md §3裁定)', () => {
  it('GHOST_BOSS_HP_MULT=1.6 / GHOST_MELEE_RANGE=74(MELEE_RADIUSの複製)', () => {
    // GHOST_HP_FRAC(0.6)は v0.25.2468 廃止=計測時スナップショットの100%再現へ(社長裁定)。
    expect(GHOST_BOSS_HP_MULT).toBe(1.6);
    expect(GHOST_MELEE_RANGE).toBe(74);
  });
});

describe('G2.6: サブウェポン使用の予約(subUsesPerMinノブ)', () => {
  it('defaultGhostProfile は subUsesPerMin=DEFAULT_SUB_USES_PER_MIN(控えめな既定値)を持つ', () => {
    expect(defaultGhostProfile().subUsesPerMin).toBe(DEFAULT_SUB_USES_PER_MIN);
  });

  it('ghostSubUseIntervalMs: 使用回数/分→間隔ms(2回/分=30秒間隔)。0以下は null(使わない人)', () => {
    expect(ghostSubUseIntervalMs(2)).toBe(30000);
    expect(ghostSubUseIntervalMs(6)).toBe(10000);
    expect(ghostSubUseIntervalMs(0)).toBeNull();
    expect(ghostSubUseIntervalMs(-1)).toBeNull();
  });

  it('shouldGhostClaimSub: 前回使用から間隔が空いたら予約する', () => {
    expect(shouldGhostClaimSub(0, 30000, 2)).toBe(true);   // ちょうど間隔=予約可
    expect(shouldGhostClaimSub(0, 29999, 2)).toBe(false);  // まだ間隔前
    expect(shouldGhostClaimSub(10000, 39999, 2)).toBe(false);
    expect(shouldGhostClaimSub(10000, 40000, 2)).toBe(true);
  });

  it('shouldGhostClaimSub: subUsesPerMin<=0(サブを使わない人)は一生予約しない', () => {
    expect(shouldGhostClaimSub(0, 10_000_000, 0)).toBe(false);
  });
});

// ==== G4b(BOT_AND_GHOST.md §2.9(4)): 技への反応の再現 ==========================================
const randNever = (): number => { throw new Error('rand must not be consumed'); };

describe('G4b rollGhostMoveReaction: ロールの状態機械(純関数)', () => {
  const TABLE = { 'thor-issen': { n: 5, counterRate: 0.3, hitRate: 0.4 } }; // dodgeRate=0.3

  it('技なし(chase等)・標的なしは undefined(ロールしない・randも消費しない)', () => {
    expect(rollGhostMoveReaction(undefined, null, TABLE, 0, randNever)).toBeUndefined();
    const chase = mkBoss({ bossState: 'chase' });
    expect(rollGhostMoveReaction(undefined, chase, TABLE, 0, randNever)).toBeUndefined();
  });

  it('キー未定義のボス(天使等G4b計測未対応)は undefined=従来挙動', () => {
    const miguel = mkBoss({ type: 'miguel' as Enemy['type'], bossState: 'harai' });
    expect(rollGhostMoveReaction(undefined, miguel, TABLE, 0, randNever)).toBeUndefined();
  });

  it('n<3の技・表に無い技は fallback(randを消費しない=従来挙動の乱数列を汚さない)', () => {
    const boss = mkBoss({ bossState: 'issen-windup' });
    const few = { 'thor-issen': { n: GHOST_MOVE_ROLL_MIN_N - 1, counterRate: 1, hitRate: 0 } };
    expect(rollGhostMoveReaction(undefined, boss, few, 0, randNever)?.decision).toBe('fallback');
    expect(rollGhostMoveReaction(undefined, boss, {}, 0, randNever)?.decision).toBe('fallback');
    expect(rollGhostMoveReaction(undefined, boss, undefined, 0, randNever)?.decision).toBe('fallback');
  });

  it('n>=3: r<counterRate→counter / r<counterRate+dodgeRate→dodge / 残り(=hitRate)→tank', () => {
    const boss = mkBoss({ bossState: 'issen-windup' });
    expect(rollGhostMoveReaction(undefined, boss, TABLE, 0, () => 0.29)?.decision).toBe('counter');
    expect(rollGhostMoveReaction(undefined, boss, TABLE, 0, () => 0.31)?.decision).toBe('dodge');
    expect(rollGhostMoveReaction(undefined, boss, TABLE, 0, () => 0.59)?.decision).toBe('dodge');
    expect(rollGhostMoveReaction(undefined, boss, TABLE, 0, () => 0.61)?.decision).toBe('tank');
  });

  it('同じ技が続く間は振り直さない(技1回の発動=1ロール。randも消費しない)', () => {
    const boss = mkBoss({ bossState: 'issen-dash' }); // issen-windup→issen-dashは同じ技ファミリー
    const prev: GhostMoveRoll = { moveKey: 'thor-issen', decision: 'counter', rolledAtMs: 100 };
    expect(rollGhostMoveReaction(prev, boss, TABLE, 500, randNever)).toBe(prev);
  });

  it('技が切り替わったら(連携含む)新しくロールし直す', () => {
    const prev: GhostMoveRoll = { moveKey: 'thor-issen', decision: 'counter', rolledAtMs: 0 };
    const tsuki = mkBoss({ bossState: 'tsuki-windup' });
    const table = { ...TABLE, 'thor-tsuki': { n: 9, counterRate: 0, hitRate: 1 } };
    const next = rollGhostMoveReaction(prev, tsuki, table, 1000, () => 0.5);
    expect(next?.moveKey).toBe('thor-tsuki');
    expect(next?.decision).toBe('tank'); // counterRate=0/dodgeRate=0
  });

  it('技の解決(キーがnullへ)でリセット=undefined', () => {
    const prev: GhostMoveRoll = { moveKey: 'thor-issen', decision: 'tank', rolledAtMs: 0 };
    expect(rollGhostMoveReaction(prev, mkBoss({ bossState: 'chase' }), TABLE, 500, randNever)).toBeUndefined();
    expect(rollGhostMoveReaction(prev, null, TABLE, 500, randNever)).toBeUndefined();
  });

  it('タイムアウト(同一技が異常に長い)は fallback=従来挙動へ落とす(振り直しはしない)', () => {
    const prev: GhostMoveRoll = { moveKey: 'thor-issen', decision: 'tank', rolledAtMs: 0 };
    const boss = mkBoss({ bossState: 'issen-windup' });
    const after = rollGhostMoveReaction(prev, boss, TABLE, GHOST_MOVE_ROLL_TIMEOUT_MS + 1, randNever);
    expect(after?.decision).toBe('fallback');
    expect(after?.moveKey).toBe('thor-issen');
  });

  it('giantbatはaiPhaseから技ファミリーを導出する(g-quad-breath-windup→g-quad)', () => {
    const giant = mkBoss({ type: 'giantbat' as Enemy['type'], bossState: undefined, aiPhase: 'g-quad-breath-windup' as Enemy['aiPhase'] });
    const table = { 'g-quad': { n: 3, counterRate: 0, hitRate: 0 } }; // dodgeRate=1
    expect(rollGhostMoveReaction(undefined, giant, table, 0, () => 0.5)?.decision).toBe('dodge');
  });
});

describe('G4b decideGhost: 技への反応の再現(ロールが挙動を切り替える)', () => {
  it("'tank'(苦手の再現): この技に限り回避を抑制=逃げずに間合い管理を続ける", () => {
    // 既存テスト「回避が間合い管理より優先される」と同じ脅威配置(着地点はゴーストのすぐ+x側=
    // 回避なら-x)だが、bossStateが技(issen-windup)でロールがtank→回避せず素の接近(+x)に戻る。
    const boss = mkBoss({
      x: 1000, y: 0, bossState: 'issen-windup',
      aiPhase: 'jump' as Enemy['aiPhase'], aiTargetX: 15, aiTargetY: 10,
    });
    const ghost = mkGhost({ x: 0, y: 0 });
    const profile: GhostProfile = { ...PROFILE, hitsPerMin: 0, moveReactions: { 'thor-issen': { n: 5, counterRate: 0, hitRate: 1 } } };
    const d = decideGhost(baseDriverInput({ ghost, enemies: [boss], profile, rand: () => 0 }));
    expect(d.moveRoll?.decision).toBe('tank');
    expect(d.moveX).toBeGreaterThan(0); // 回避(-x)ではなく接近(+x)=逃げていない
  });

  it("'counter': 窓が開いたら counterChance に関係なく必ず構える(既存カウンター試行を優先発動)", () => {
    const boss = mkBoss({ x: 10, y: 0, width: 10, height: 10, bossState: 'issen-windup' });
    const ghost = mkGhost({ x: 0, y: 0, width: 10, height: 10 });
    const profile: GhostProfile = { ...PROFILE, counterChance: 0, moveReactions: { 'thor-issen': { n: 5, counterRate: 1, hitRate: 0 } } };
    const first = decideGhost(baseDriverInput({ ghost, enemies: [boss], profile, nowMs: 0, rand: () => 0.5 }));
    expect(first.moveRoll?.decision).toBe('counter');
    expect(first.counterWillAttempt).toBe(true); // counterChance=0でも構える(ロールが優先)
    const second = decideGhost(baseDriverInput({
      ghost: { ...ghost, counterPendingAt: first.counterPendingAt, counterWillAttempt: first.counterWillAttempt, moveRoll: first.moveRoll },
      enemies: [boss], profile, nowMs: 250, rand: () => 0.5,
    }));
    expect(second.action).toBe('melee'); // reactionMs経過後に成立(既存ロジックのまま)
  });

  it("'counter': 射程外なら回避もmobilityゲートも通さず間合いへ詰める(カウンターしにいく)", () => {
    const boss = mkBoss({ x: 300, y: 0, bossState: 'issen-windup' });
    const ghost = mkGhost({ x: 0, y: 0 });
    const profile: GhostProfile = { ...PROFILE, mobility: 0, moveReactions: { 'thor-issen': { n: 5, counterRate: 1, hitRate: 0 } } };
    const d = decideGhost(baseDriverInput({ ghost, enemies: [boss], profile, rand: () => 0.5 }));
    expect(d.moveRoll?.decision).toBe('counter');
    expect(d.moveX).toBeGreaterThan(0); // mobility=0(従来なら静止)でも詰めに行く
  });

  it("'dodge'相当のロール: この技では構えない(counterChance=1でもcounterWillAttempt=false)", () => {
    const boss = mkBoss({ x: 10, y: 0, width: 10, height: 10, bossState: 'issen-windup' });
    const ghost = mkGhost({ x: 0, y: 0, width: 10, height: 10 });
    const profile: GhostProfile = { ...PROFILE, counterChance: 1, moveReactions: { 'thor-issen': { n: 5, counterRate: 0, hitRate: 0 } } };
    const d = decideGhost(baseDriverInput({ ghost, enemies: [boss], profile, rand: () => 0.5 }));
    expect(d.moveRoll?.decision).toBe('dodge');
    expect(d.counterWillAttempt).toBe(false);
  });

  it('n<3はfallback=従来挙動(counterChanceの抽選がそのまま生きる)', () => {
    const boss = mkBoss({ x: 10, y: 0, width: 10, height: 10, bossState: 'issen-windup' });
    const ghost = mkGhost({ x: 0, y: 0, width: 10, height: 10 });
    const profile: GhostProfile = { ...PROFILE, counterChance: 1, moveReactions: { 'thor-issen': { n: 2, counterRate: 0, hitRate: 1 } } };
    const d = decideGhost(baseDriverInput({ ghost, enemies: [boss], profile, rand: () => 0.5 }));
    expect(d.moveRoll?.decision).toBe('fallback');
    expect(d.counterWillAttempt).toBe(true); // rand(0.5) < counterChance(1)=従来の抽選
  });

  it('ロールは技1回につき1回=2tick目も同じ決定を持ち越す(振り直さない)', () => {
    const boss = mkBoss({ x: 300, y: 0, bossState: 'issen-windup' });
    const ghost = mkGhost({ x: 0, y: 0 });
    const profile: GhostProfile = { ...PROFILE, moveReactions: { 'thor-issen': { n: 5, counterRate: 1, hitRate: 0 } } };
    const first = decideGhost(baseDriverInput({ ghost, enemies: [boss], profile, nowMs: 0, rand: () => 0.5 }));
    expect(first.moveRoll?.decision).toBe('counter');
    // 2tick目のrandは0.99(もし振り直すならtank側)だが、持ち越したロールがそのまま返る。
    const second = decideGhost(baseDriverInput({
      ghost: { ...ghost, moveRoll: first.moveRoll }, enemies: [boss], profile, nowMs: 16, rand: () => 0.99,
    }));
    expect(second.moveRoll).toBe(first.moveRoll);
  });
});

describe('G3: ghostRunEnabled(召喚ゲート=計測停止ゲートの共通判定)', () => {
  it('?ghost=1(開発用)は装備なしでも有効(従来どおり動く)', () => {
    expect(ghostRunEnabled(true, [])).toBe(true);
    expect(ghostRunEnabled(true, ['runner'])).toBe(true);
  });

  it('守護霊(guardian-spirit)を装備していれば有効(G3の本則)', () => {
    expect(GUARDIAN_SPIRIT_SKILL).toBe('guardian-spirit');
    expect(ghostRunEnabled(false, [GUARDIAN_SPIRIT_SKILL])).toBe(true);
    expect(ghostRunEnabled(false, ['runner', GUARDIAN_SPIRIT_SKILL])).toBe(true);
  });

  it('どちらも無ければ無効(通常プレイは無改変)', () => {
    expect(ghostRunEnabled(false, [])).toBe(false);
    expect(ghostRunEnabled(false, ['runner', 'seeker'])).toBe(false);
  });
});

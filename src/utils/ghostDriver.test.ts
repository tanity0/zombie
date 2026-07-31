// BOT_AND_GHOST.md G2(ゴースト本体)。純関数の意思決定(decideGhost)+補助関数を検証する。
import { describe, it, expect } from 'vitest';
import {
  decideGhost, defaultGhostProfile, ghostLeashWarp,
  ghostSubUseIntervalMs, ghostSubClaimIntervalMs, GHOST_SUB_USE_MAX_INTERVAL_MS,
  shouldGhostClaimSub, DEFAULT_SUB_USES_PER_MIN,
  ghostRunEnabled, GUARDIAN_SPIRIT_SKILL,
  GHOST_LEASH_PX, GHOST_MELEE_RANGE, GHOST_BOSS_HP_MULT,
  rollGhostMoveReaction, GHOST_MOVE_ROLL_MIN_N, GHOST_MOVE_ROLL_TIMEOUT_MS,
  ghostReactionMs, ghostMoveChance, ghostApproachChance, ghostDesiredDist,
  ghostCounterWaitExpired, ghostDodgeVector,
  stepGhostDanger, GHOST_DANGER_MEMORY_MS, GHOST_BULLET_TANK_MS,
  GHOST_REACTION_MIN_MS, GHOST_REACTION_MAX_MS, GHOST_WINDUP_SAFE_MARGIN_PX,
  GHOST_COUNTER_WAIT_MS, GHOST_DEFAULT_STATIONARY_FRAC, GHOST_APPROACH_MIN_CHANCE,
  GHOST_ORBIT_BASE_FRAC, GHOST_ORBIT_IDLE_FRAC, GHOST_ORBIT_TANK_FRAC, GHOST_BOSS_BODY_AVOID_PX,
  type GhostSelf, type GhostProfile, type GhostWeapon, type GhostDriverInput, type GhostMoveRoll,
} from './ghostDriver';
import { jumpDodge, botSkillProfile } from './botSkill';
import type { Enemy, Projectile } from '../types/game';

const mkBoss = (overrides: Partial<Enemy> = {}): Enemy => ({
  id: 'boss-1', x: 0, y: 0, width: 40, height: 40, speed: 0,
  health: 100, maxHealth: 100, damage: 10, type: 'thor', experienceValue: 0,
  lastHit: 0, lastShot: 0,
  ...overrides,
} as unknown as Enemy);

// lastShotAt/lastMeleeAtは既定で「大昔」にしておき、クールダウンを意図的に検証するテストだけが
// 個別に上書きする(そうしないとGHOST_MELEE_COOLDOWN_MS(600ms)がnowMs=0付近のテストを毎回ブロックする)。
const mkGhost = (overrides: Partial<GhostSelf> = {}): GhostSelf => ({
  x: 0, y: 0, width: 20, height: 20, maxHealth: 110, facing: 1, lastShotAt: -1_000_000, lastMeleeAt: -1_000_000,
  ...overrides,
});

// v0.25.2564: プレイヤーと同じ「体の縁」距離(gameStore.enemyMeleeDist の裏ボス分岐=生AABB最近点と
// 同じ幾何)。純関数側はstoreに依存しないので、テストは同じ幾何のローカル実装を注入する。
const aabbMeleeDist = (cx: number, cy: number, e: Enemy): number => {
  const nx = Math.max(e.x, Math.min(cx, e.x + e.width));
  const ny = Math.max(e.y, Math.min(cy, e.y + e.height));
  return Math.hypot(cx - nx, cy - ny);
};

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
  meleeDist: aabbMeleeDist,
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

// ==== §2.12 行動品質(v0.25.2529)。原則「選択=計測値・実行=常に本気」 =========================
describe('§2.12 要件1: dodgeStrength逆写像の廃止(実行は常に本気)', () => {
  it('被弾/分(hitsPerMin)が幾つでも回避ベクトルの強さは1(=全力)で変わらない', () => {
    const boss = mkBoss({ x: 1000, y: 0, aiPhase: 'jump' as Enemy['aiPhase'], aiTargetX: 15, aiTargetY: 10 });
    const v = ghostDodgeVector(10, 10, [boss], [], 110);
    expect(v).not.toBeNull();
    expect(Math.hypot(v!.x, v!.y)).toBeCloseTo(1, 5); // 単位ベクトル=減衰なし
  });

  it('全ボス予告台帳(ghostTelegraph)の差分も回避ベクトルへ合成される', () => {
    // 'sweep'(実行中の薙ぎ)は既存 telegraphDodge が拾わない状態=台帳の差分だけで避けられること。
    const uri = mkBoss({
      type: 'uri' as Enemy['type'], bossState: 'sweep',
      x: 2000, y: 2000, aiFromX: 0, aiFromY: 0, aiTargetX: 300, aiTargetY: 0,
    });
    const v = ghostDodgeVector(150, 20, [uri], [], 110);
    expect(v).not.toBeNull();
    expect(v!.y).toBeGreaterThan(0); // 帯(y=0)の下側へ抜ける
  });
});

describe('§2.12 純関数(反応遅延/移動リズム/間合い/見切り)', () => {
  it('ghostReactionMs: 100-800にclamp(異常値は下限)', () => {
    expect(ghostReactionMs(320)).toBe(320);
    expect(ghostReactionMs(0)).toBe(GHOST_REACTION_MIN_MS);
    expect(ghostReactionMs(5000)).toBe(GHOST_REACTION_MAX_MS);
    expect(ghostReactionMs(Number.NaN)).toBe(GHOST_REACTION_MIN_MS);
  });

  it('ghostMoveChance: mobilityと(1-stationaryFrac)の平均。止まる癖が強いほど動かない', () => {
    expect(ghostMoveChance(1, 0)).toBe(1);
    expect(ghostMoveChance(0, 1)).toBe(0);
    expect(ghostMoveChance(0.6, 0.35)).toBeCloseTo(0.625, 5);
    // 欠損(旧プロファイル)は既定のstationaryFracで評価する
    expect(ghostMoveChance(0.6)).toBeCloseTo(ghostMoveChance(0.6, GHOST_DEFAULT_STATIONARY_FRAC), 5);
    expect(ghostMoveChance(0.5, 0.2)).toBeGreaterThan(ghostMoveChance(0.5, 0.9)); // 単調
  });

  it('ghostApproachChance: 接近が少ない人ほど詰めが遅いが、床(0.25)で固まらない', () => {
    expect(ghostApproachChance(6)).toBe(1);
    expect(ghostApproachChance(3)).toBeCloseTo(0.5, 5);
    expect(ghostApproachChance(0)).toBe(GHOST_APPROACH_MIN_CHANCE);
    expect(ghostApproachChance(undefined)).toBeGreaterThan(0);
  });

  it('ghostDesiredDist: 予告中だけ安全マージンを足す', () => {
    expect(ghostDesiredDist(180, false)).toBe(180);
    expect(ghostDesiredDist(180, true)).toBe(180 + GHOST_WINDUP_SAFE_MARGIN_PX);
  });

  it('ghostCounterWaitExpired: 窓が開いてから約1秒で見切る', () => {
    expect(ghostCounterWaitExpired(undefined, 99999)).toBe(false);
    expect(ghostCounterWaitExpired(0, GHOST_COUNTER_WAIT_MS - 1)).toBe(false);
    expect(ghostCounterWaitExpired(0, GHOST_COUNTER_WAIT_MS)).toBe(true);
  });
});

describe('§2.12 要件2: 反応遅延(回避の開始をreactionMsだけ遅らせる)', () => {
  const boss = (): Enemy => mkBoss({
    x: 1000, y: 0, aiPhase: 'jump' as Enemy['aiPhase'], aiTargetX: 15, aiTargetY: 10,
  });

  it('危険を見た最初のtickは回避しない(認知時刻だけ記録する)', () => {
    const d = decideGhost(baseDriverInput({
      ghost: mkGhost({ x: 0, y: 0 }), enemies: [boss()], nowMs: 1000,
      profile: { ...PROFILE, reactionMs: 300 },
    }));
    expect(d.dangerSeenAt).toBe(1000);
    expect(d.moveX).toBeGreaterThan(0); // まだ気づいていない=平時の間合い(接近)のまま
  });

  it('reactionMs経過後は回避する(遅い人ほど反応が遅れる=個性)', () => {
    const d = decideGhost(baseDriverInput({
      ghost: mkGhost({ x: 0, y: 0, dangerSeenAt: 1000 }), enemies: [boss()], nowMs: 1300,
      profile: { ...PROFILE, reactionMs: 300 },
    }));
    expect(d.moveX).toBeLessThan(0); // 着地点(+x)から逃げる
  });

  // GHOST-BULLET-TECH A(v0.25.2543): 危険が消えた瞬間にリセットする旧仕様は廃止。
  // 記憶(GHOST_DANGER_MEMORY_MS)が切れて初めてリセットされる。
  it('危険が消えても記憶の間は認知を保つ(弾の波ごとに盲目窓を作らない)', () => {
    const d = decideGhost(baseDriverInput({
      ghost: mkGhost({ x: 0, y: 0, dangerSeenAt: 1000, dangerLastAt: 1200 }),
      enemies: [mkBoss({ x: 1000, y: 0, bossState: 'chase' })], nowMs: 1300,
    }));
    expect(d.dangerSeenAt).toBe(1000);
    expect(d.dangerLastAt).toBe(1200); // 危険が見えていないtickでは更新しない=ここから失効を数える
  });

  it('記憶が切れたら認知はリセットされる(次の危険でまた遅れる)', () => {
    const d = decideGhost(baseDriverInput({
      ghost: mkGhost({ x: 0, y: 0, dangerSeenAt: 1000, dangerLastAt: 1200 }),
      enemies: [mkBoss({ x: 1000, y: 0, bossState: 'chase' })],
      nowMs: 1200 + GHOST_DANGER_MEMORY_MS + 1,
    }));
    expect(d.dangerSeenAt).toBeUndefined();
  });

  it('記憶が生きている間に危険が戻ったら、遅延を払い直さず即回避する(遅延はエピソードに1回)', () => {
    const seen = 1000;
    const gap = GHOST_DANGER_MEMORY_MS - 100; // 記憶が切れる直前に次の波が来る
    const d = decideGhost(baseDriverInput({
      ghost: mkGhost({ x: 0, y: 0, dangerSeenAt: seen, dangerLastAt: seen + 100 }),
      enemies: [boss()], nowMs: seen + 100 + gap,
      profile: { ...PROFILE, reactionMs: 800 }, // 反応が最も遅い人でも即応する
    }));
    expect(d.moveX).toBeLessThan(0); // 着地点(+x)から逃げる=盲目窓が再発生していない
    expect(d.dangerSeenAt).toBe(seen); // エピソードは同じまま(認知時刻は据え置き)
  });
});

describe('GHOST-BULLET-TECH A: stepGhostDanger(認知の持続・純関数)', () => {
  it('危険なし→認知: 初認知のtickでは反応しない(認知時刻だけ記録)', () => {
    const r = stepGhostDanger(undefined, true, 1000, 300);
    expect(r.reacted).toBe(false);
    expect(r.memory).toEqual({ seenAt: 1000, lastDangerAt: 1000 });
  });

  it('認知→反応済み: reactionMs経過で反応する(境界=以上)', () => {
    expect(stepGhostDanger({ seenAt: 1000, lastDangerAt: 1200 }, true, 1299, 300).reacted).toBe(false);
    expect(stepGhostDanger({ seenAt: 1000, lastDangerAt: 1200 }, true, 1300, 300).reacted).toBe(true);
  });

  it('反応済み→記憶: 危険が消えてもエピソードは残り、lastDangerAtは進まない', () => {
    const r = stepGhostDanger({ seenAt: 1000, lastDangerAt: 1200 }, false, 2000, 300);
    expect(r.memory).toEqual({ seenAt: 1000, lastDangerAt: 1200 });
    expect(r.reacted).toBe(false); // 避ける対象が無いtick
  });

  it('記憶→失効: 最後に危険を見てからGHOST_DANGER_MEMORY_MSを過ぎたらエピソードを閉じる', () => {
    const prev = { seenAt: 1000, lastDangerAt: 1200 };
    const keep = stepGhostDanger(prev, false, 1200 + GHOST_DANGER_MEMORY_MS, 300);
    expect(keep.memory).toEqual(prev); // ちょうどは保持(超えたら失効)
    const gone = stepGhostDanger(prev, false, 1200 + GHOST_DANGER_MEMORY_MS + 1, 300);
    expect(gone.memory).toBeUndefined();
  });

  it('失効後の危険は「初認知」からやり直す(また反応が遅れる=個性が消えない)', () => {
    const prev = { seenAt: 1000, lastDangerAt: 1200 };
    const t = 1200 + GHOST_DANGER_MEMORY_MS + 1;
    const r = stepGhostDanger(prev, true, t, 300);
    expect(r.memory).toEqual({ seenAt: t, lastDangerAt: t });
    expect(r.reacted).toBe(false);
  });

  it('旧状態(lastDangerAt無し)は記憶が生きている扱い=移行tickで遅延を払い直さない', () => {
    const r = stepGhostDanger({ seenAt: 0 }, true, 99999, 300);
    expect(r.reacted).toBe(true);
    expect(r.memory?.seenAt).toBe(0);
  });
});

describe('§2.12 要件3: 予告中だけ安全マージンを足して退避する', () => {
  it('予告(windup)中は preferredDist+マージン まで下がる', () => {
    // 距離200 = preferredDist(180)の帯(±40)の中=平時なら動かない。予告中は目標が300へ伸びるので下がる。
    const boss = mkBoss({ x: 200, y: 0, width: 0, height: 0, bossState: 'issen-windup' });
    const ghost = mkGhost({ x: 0, y: 0, width: 0, height: 0, dangerSeenAt: 0 });
    const d = decideGhost(baseDriverInput({
      ghost, enemies: [boss], nowMs: 5000, profile: { ...PROFILE, meleeBias: 0 },
    }));
    expect(d.moveX).toBeLessThan(0); // ボス(右)から離れる
  });

  it('平時(chase)・帯の中は前後せず、ボス正対の横流れ(オービット)をする(§2.12追補)', () => {
    const boss = mkBoss({ x: 200, y: 0, width: 0, height: 0, bossState: 'chase' });
    const ghost = mkGhost({ x: 0, y: 0, width: 0, height: 0 });
    const d = decideGhost(baseDriverInput({
      ghost, enemies: [boss], nowMs: 5000, profile: { ...PROFILE, meleeBias: 0 },
    }));
    expect(d.moveX).toBeCloseTo(0, 5); // 前後(接近/後退)成分なし=間合いは維持
    expect(Math.abs(d.moveY)).toBeCloseTo(GHOST_ORBIT_BASE_FRAC, 5); // 接線方向へ横流れ
  });

  it("'tank'ロール(苦手技=食らいに行く)の時はマージンを足さない", () => {
    const boss = mkBoss({ x: 200, y: 0, width: 0, height: 0, bossState: 'issen-windup' });
    const ghost = mkGhost({ x: 0, y: 0, width: 0, height: 0, dangerSeenAt: 0 });
    const profile: GhostProfile = {
      ...PROFILE, meleeBias: 0, moveReactions: { 'thor-issen': { n: 5, counterRate: 0, hitRate: 1 } },
    };
    const d = decideGhost(baseDriverInput({ ghost, enemies: [boss], profile, nowMs: 5000, rand: () => 0 }));
    expect(d.moveRoll?.decision).toBe('tank');
    expect(d.moveX).toBeCloseTo(0, 5); // 目標間合いは180のまま=帯の中なので下がらない(前後成分なし)
    // §2.12追補: tank予告中も棒立ちしない=「避けようとして間に合わない」ゆっくり横歩き
    expect(Math.abs(d.moveY)).toBeCloseTo(GHOST_ORBIT_TANK_FRAC, 5);
  });
});

describe('§2.12 要件4: 移動リズム(平時のみ)・危険時は必ず動く', () => {
  it('立ち止まる癖(stationaryFrac)が強い人の止まりtickは、完全停止ではなく遅い横流れ(§2.12追補)', () => {
    const boss = mkBoss({ x: 1000, y: 0, bossState: 'chase' });
    const d = decideGhost(baseDriverInput({
      ghost: mkGhost({ x: 0, y: 0 }), enemies: [boss],
      profile: { ...PROFILE, mobility: 1, stationaryFrac: 1 }, // moveChance=0.5
      rand: () => 0.9, // 0.9 >= 0.5 → 止まりtick
    }));
    expect(Math.abs(d.moveX)).toBeLessThan(0.05); // 接近はしない(「詰めない」個性は維持)
    expect(Math.hypot(d.moveX, d.moveY)).toBeCloseTo(GHOST_ORBIT_IDLE_FRAC, 5); // 遅い横流れで足は止めない
  });

  it('危険時(予告中)はリズムを無視して必ず動く', () => {
    const boss = mkBoss({ x: 1000, y: 0, bossState: 'issen-windup' });
    const d = decideGhost(baseDriverInput({
      ghost: mkGhost({ x: 0, y: 0 }), enemies: [boss],
      profile: { ...PROFILE, mobility: 0, stationaryFrac: 1 }, // 平時なら絶対に止まる設定
      rand: () => 0.99,
    }));
    expect(d.moveX).toBeGreaterThan(0);
  });

  it('接近リズム(approachPerMin)が低いと、平時に詰めず横へ流れるtickが出る(§2.12追補)', () => {
    const boss = mkBoss({ x: 1000, y: 0, bossState: 'chase' });
    const d = decideGhost(baseDriverInput({
      ghost: mkGhost({ x: 0, y: 0 }), enemies: [boss],
      // 移動ゲートは通す(rand=0.5 < moveChance=1)が、接近ゲート(0.25)は通さない。
      profile: { ...PROFILE, mobility: 1, stationaryFrac: 0, approachPerMin: 0 },
      rand: () => 0.5,
    }));
    expect(Math.abs(d.moveX)).toBeLessThan(0.05); // 詰めない(接近成分はほぼゼロ)
    expect(Math.hypot(d.moveX, d.moveY)).toBeCloseTo(GHOST_ORBIT_IDLE_FRAC, 5); // 立ち尽くさず横へ流れる
  });
});

describe('§2.12 要件6: カウンター待ちは約1秒で見切って離脱する', () => {
  const bossNear = (): Enemy => mkBoss({ x: 10, y: 0, width: 10, height: 10, bossState: 'issen-windup' });

  it('見切る前は窓を見ている(銃で代替しない)', () => {
    const d = decideGhost(baseDriverInput({
      ghost: mkGhost({ x: 0, y: 0, width: 10, height: 10, counterPendingAt: 0, counterWillAttempt: false }),
      enemies: [bossNear()], nowMs: GHOST_COUNTER_WAIT_MS - 1,
      profile: { ...PROFILE, counterChance: 0, meleeBias: 0 },
    }));
    expect(d.action).toBe('none');
  });

  it('約1秒待って成立しなければ見切り、通常行動(銃)へ戻る', () => {
    const d = decideGhost(baseDriverInput({
      ghost: mkGhost({ x: 0, y: 0, width: 10, height: 10, counterPendingAt: 0, counterWillAttempt: false }),
      enemies: [bossNear()], nowMs: GHOST_COUNTER_WAIT_MS,
      profile: { ...PROFILE, counterChance: 0, meleeBias: 0 },
    }));
    expect(d.action).toBe('shoot');
    expect(d.counterWillAttempt).toBe(false);
  });

  it("見切った後は'counter'ロールでも張り付かない(間合いへ戻る=離脱)", () => {
    const boss = mkBoss({ x: 30, y: 0, width: 10, height: 10, bossState: 'issen-windup' });
    const profile: GhostProfile = {
      ...PROFILE, meleeBias: 0, moveReactions: { 'thor-issen': { n: 5, counterRate: 1, hitRate: 0 } },
    };
    const ghost = mkGhost({
      x: 0, y: 0, width: 10, height: 10, counterPendingAt: 0, counterWillAttempt: true,
      dangerSeenAt: 0, moveRoll: { moveKey: 'thor-issen', decision: 'counter', rolledAtMs: 0 },
    });
    const d = decideGhost(baseDriverInput({
      ghost, enemies: [boss], profile, nowMs: GHOST_COUNTER_WAIT_MS + 100, rand: () => 0.9,
    }));
    expect(d.moveX).toBeLessThan(0); // 詰める(+x)のをやめて離れる
  });

  it('窓が閉じれば待ち状態はクリアされる(次の窓ではまた構える)', () => {
    const d = decideGhost(baseDriverInput({
      ghost: mkGhost({ x: 0, y: 0, width: 10, height: 10, counterPendingAt: 0, counterWillAttempt: true }),
      enemies: [mkBoss({ x: 10, y: 0, width: 10, height: 10, bossState: 'chase' })],
      nowMs: GHOST_COUNTER_WAIT_MS + 500, profile: { ...PROFILE, meleeBias: 0 },
    }));
    expect(d.counterPendingAt).toBeUndefined();
  });
});

describe('§2.12追補: オービット(社長裁定「ぼーっと立たない・ボスを正面に横に歩く」)', () => {
  const bandBoss = (): Enemy => mkBoss({ x: 200, y: 0, width: 0, height: 0, bossState: 'chase' });

  it('旋回方向(orbitSign)は持ち越され、反転確率を引かない限り変わらない', () => {
    const d = decideGhost(baseDriverInput({
      ghost: mkGhost({ x: 0, y: 0, width: 0, height: 0, orbitSign: 1 }),
      enemies: [bandBoss()], nowMs: 5000,
      profile: { ...PROFILE, meleeBias: 0, stationaryFrac: 0 },
      rand: () => 0.5, // flip(0.004)は引かない・移動ゲートは通る
    }));
    expect(d.orbitSign).toBe(1);
    expect(d.moveY).toBeLessThan(0); // sign=1の接線方向(このジオメトリでは-y)
  });

  it('反転確率を引いたtickは旋回方向が反転する', () => {
    const d = decideGhost(baseDriverInput({
      ghost: mkGhost({ x: 0, y: 0, width: 0, height: 0, orbitSign: 1 }),
      enemies: [bandBoss()], nowMs: 5000,
      profile: { ...PROFILE, meleeBias: 0, stationaryFrac: 0 },
      rand: () => 0.001, // flip(0.004)を引く
    }));
    expect(d.orbitSign).toBe(-1);
    expect(d.moveY).toBeGreaterThan(0); // 反転後の接線方向(+y)
  });

  it('カウンター待ち(射程内)の静止だけは維持される=意味のある静止', () => {
    const boss = mkBoss({ x: 30, y: 0, width: 10, height: 10, bossState: 'issen-windup' });
    const profile: GhostProfile = {
      ...PROFILE, meleeBias: 0, moveReactions: { 'thor-issen': { n: 5, counterRate: 1, hitRate: 0 } },
    };
    const ghost = mkGhost({
      x: 0, y: 0, width: 10, height: 10, counterPendingAt: 4900, counterWillAttempt: true,
      dangerSeenAt: 0, moveRoll: { moveKey: 'thor-issen', decision: 'counter', rolledAtMs: 4900 },
    });
    const d = decideGhost(baseDriverInput({
      ghost, enemies: [boss], profile, nowMs: 5000, rand: () => 0.9, // 見切り(1秒)前
    }));
    expect(d.moveX).toBe(0);
    expect(d.moveY).toBe(0);
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

  it('mobilityが低い人の止まりtickも、完全停止ではなく遅い横流れになる(§2.12追補)', () => {
    const boss = mkBoss({ x: 1000, y: 0 });
    const d = decideGhost(baseDriverInput({
      ghost: mkGhost({ x: 0, y: 0 }),
      enemies: [boss],
      profile: { ...PROFILE, mobility: 0.3 },
      rand: () => 0.9, // 0.9 >= moveChance → 止まりtick
    }));
    expect(Math.abs(d.moveX)).toBeLessThan(0.05); // 接近はしない
    expect(Math.hypot(d.moveX, d.moveY)).toBeCloseTo(GHOST_ORBIT_IDLE_FRAC, 5); // 遅い横流れ
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
    // §2.12(1) 反応遅延: 認知済み(dangerSeenAt)+reactionMs経過後の状態で見る(遅延そのものは専用の
    // describeで検証する)。
    const ghost = mkGhost({ x: 0, y: 0, dangerSeenAt: 0 }); // 中心(10,10)
    const profile: GhostProfile = { ...PROFILE, hitsPerMin: 0 };
    const d = decideGhost(baseDriverInput({ ghost, enemies: [boss], profile, nowMs: 5000 }));

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

  // v0.25.2472(社長指示「守護霊のサブウェポンは実装されないなら、してほしい」): ボス交戦中の頻度の床。
  // 予約間隔は min(プロファイル由来, GHOST_SUB_USE_MAX_INTERVAL_MS=25秒)。
  it('ghostSubClaimIntervalMs: プロファイル間隔と床(25秒)の小さい方。使わない人(<=0)も床で拾う', () => {
    expect(GHOST_SUB_USE_MAX_INTERVAL_MS).toBe(25_000);
    expect(ghostSubClaimIntervalMs(6)).toBe(10000);                          // 実測が頻繁ならそのまま
    expect(ghostSubClaimIntervalMs(2)).toBe(GHOST_SUB_USE_MAX_INTERVAL_MS); // 30秒 → 床の25秒へ
    expect(ghostSubClaimIntervalMs(0)).toBe(GHOST_SUB_USE_MAX_INTERVAL_MS); // 使わない人も交戦中は床
    expect(ghostSubClaimIntervalMs(-1)).toBe(GHOST_SUB_USE_MAX_INTERVAL_MS);
  });

  it('shouldGhostClaimSub: 前回使用から実効間隔(床込み)が空いたら予約する', () => {
    expect(shouldGhostClaimSub(0, 25000, 2)).toBe(true);   // ちょうど床間隔=予約可
    expect(shouldGhostClaimSub(0, 24999, 2)).toBe(false);  // まだ間隔前
    expect(shouldGhostClaimSub(10000, 34999, 2)).toBe(false);
    expect(shouldGhostClaimSub(10000, 35000, 2)).toBe(true);
    expect(shouldGhostClaimSub(0, 10000, 6)).toBe(true);   // 実測6回/分=10秒間隔はそのまま
    expect(shouldGhostClaimSub(0, 9999, 6)).toBe(false);
  });

  it('shouldGhostClaimSub: subUsesPerMin<=0(サブを使わない人)も交戦中は床(25秒)で予約する', () => {
    // 旧仕様(〜v0.25.2471)は一生予約しなかった。社長指示の床(20〜30秒に1回)で挙動変更。
    expect(shouldGhostClaimSub(0, 24999, 0)).toBe(false);
    expect(shouldGhostClaimSub(0, 25000, 0)).toBe(true);
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

// ==== GHOST-BULLET-TECH B(弾技の得手不得手・v0.25.2543) =========================================
// 社長方針「弾も技である以上、記録に弾を避ける確率、避ける動きもあるべき」。
// 弾技にも技ロール(counter/dodge/tank)が効き、'tank'を引いた弾技の弾だけを避けなくなる。
const mkProj = (over: Partial<Projectile> = {}): Projectile => ({
  id: 'p1', x: -104, y: 6, width: 10, height: 10, speed: 400, damage: 5,
  direction: { x: 1, y: 0 }, weaponType: 'enemy_bolt', duration: 4000, createdAt: 0,
  passthrough: false, hitEnemies: [], hostile: true, reflected: false,
  ...over,
} as Projectile);

describe('GHOST-BULLET-TECH B: 弾技にも技ロールが効く', () => {
  const mimirBurst = (): Enemy => mkBoss({ type: 'mimir', x: 1000, y: 0, bossState: 'burst' });

  it('弾技のキー(裏ボスburst)でロールできる=弾も「技」として扱われる', () => {
    const table = { 'mimir-burst': { n: 5, counterRate: 0, hitRate: 1 } };
    expect(rollGhostMoveReaction(undefined, mimirBurst(), table, 0, () => 0.5)?.moveKey).toBe('mimir-burst');
    expect(rollGhostMoveReaction(undefined, mimirBurst(), table, 0, () => 0.5)?.decision).toBe('tank');
  });

  it('記録が無い弾技は従来どおりフォールバック(乱数も消費しない=既存プロファイルは1bit不変)', () => {
    const roll = rollGhostMoveReaction(undefined, mimirBurst(), {}, 0, randNever);
    expect(roll?.decision).toBe('fallback');
  });

  // 是正(v0.25.2543): 旧 GHOST_DODGE_PROFILE.dodge='aoe' は botSkill の段階表で
  // 「弾を1発も避けない段」だった(dodgeHandles('aoe','projectile')===false)=守護霊は敵弾を
  // 一切避けていなかった。'all' へ是正した不変条件をここで固定する。
  it('守護霊は敵弾を回避対象にする(弾を避けない段に戻ったら落ちる)', () => {
    expect(ghostDodgeVector(10, 10, [], [mkProj()], 110)).not.toBeNull();
  });

  // v0.25.2547(社長裁定「オンにして」): 接触(体当たり)回避を有効化。規格はbotSkill既存の
  // 「接触ダメージ >= 最大HPの20%(CONTACT_DANGER_HP_FRAC)の敵が260px以内 → 離れる」のまま
  // (ゴースト専用モデルなし=§2.11追補ドクトリン)。
  it('危険な接触(damage>=最大HPの20%)からは離れる(v0.25.2547・接触回避オン)', () => {
    const mob = mkBoss({ type: 'zombie' as Enemy['type'], x: 120, y: 10, width: 20, height: 20, damage: 38 });
    const v = ghostDodgeVector(10, 10, [mob], [], 110); // 38 >= 110*0.2=22 → 危険=離れる
    expect(v).not.toBeNull();
    expect(v!.x).toBeLessThan(0); // 敵は右側=左へ離れる
  });

  it('弱い接触(damage<最大HPの20%)は避けない=「敵に触れると逃げる」人にはしない', () => {
    const mob = mkBoss({ type: 'zombie' as Enemy['type'], x: 120, y: 10, width: 20, height: 20, damage: 38 });
    expect(ghostDodgeVector(10, 10, [mob], [], 400)).toBeNull(); // 38 < 400*0.2=80 → 危険でない
  });

  it('maxHealth=0(未配線)では接触回避は働かない(明示の無効値)', () => {
    const mob = mkBoss({ type: 'zombie' as Enemy['type'], x: 120, y: 10, width: 20, height: 20, damage: 9999 });
    expect(ghostDodgeVector(10, 10, [mob], [], 0)).toBeNull();
  });

  it("ghostDodgeVector: 'tank'した弾技の弾だけ避けない(タグ無し/別の技の弾は避ける)", () => {
    const tagged = mkProj({ srcMoveKey: 'mimir-burst' });
    expect(ghostDodgeVector(10, 10, [], [tagged], 110)).not.toBeNull();               // 平時は避ける
    expect(ghostDodgeVector(10, 10, [], [tagged], 110, undefined, 'mimir-burst')).toBeNull();    // 苦手=避けない
    expect(ghostDodgeVector(10, 10, [], [mkProj()], 110, undefined, 'mimir-burst')).not.toBeNull(); // タグ無しは常に避ける
    expect(ghostDodgeVector(10, 10, [], [mkProj({ srcMoveKey: 'idol-fan' })], 110, undefined, 'mimir-burst')).not.toBeNull();
  });

  it("'tank'を引いた弾技は、技が終わって弾だけ残っても弾の寿命ぶん避けない", () => {
    const profile: GhostProfile = {
      ...PROFILE, meleeBias: 0, moveReactions: { 'mimir-burst': { n: 5, counterRate: 0, hitRate: 1 } },
    };
    const bullet = mkProj({ srcMoveKey: 'mimir-burst' });
    // ① 技の最中に tank を引く=避けない弾の記憶が立つ。
    const rolled = decideGhost(baseDriverInput({
      ghost: mkGhost({ x: 0, y: 0 }), enemies: [mimirBurst()], projectiles: [bullet],
      profile, nowMs: 1000, rand: () => 0,
    }));
    expect(rolled.moveRoll?.decision).toBe('tank');
    expect(rolled.tankedBulletKey).toBe('mimir-burst');
    expect(rolled.tankedBulletUntil).toBe(1000 + GHOST_BULLET_TANK_MS);

    // ② 技が終わった(chase)後も、記憶が生きている間はその弾を避けない=間合い管理(接近)を続ける。
    const carried = mkGhost({
      x: 0, y: 0, dangerSeenAt: 0, dangerLastAt: 1000,
      tankedBulletKey: rolled.tankedBulletKey, tankedBulletUntil: rolled.tankedBulletUntil,
    });
    const after = decideGhost(baseDriverInput({
      ghost: carried, enemies: [mkBoss({ type: 'mimir', x: 1000, y: 0, bossState: 'chase' })],
      projectiles: [bullet], profile, nowMs: 1500, rand: () => 0,
    }));
    expect(after.moveX).toBeGreaterThan(0); // ボス(+x)へ寄る=弾から逃げていない
    expect(after.tankedBulletKey).toBe('mimir-burst');

    // ③ 期限が切れたら、同じ弾を今度は避ける(苦手の再現は技1回ぶんで終わる)。
    const expired = decideGhost(baseDriverInput({
      ghost: { ...carried, dangerLastAt: 1000 + GHOST_BULLET_TANK_MS },
      enemies: [mkBoss({ type: 'mimir', x: 1000, y: 0, bossState: 'chase' })],
      projectiles: [bullet], profile, nowMs: 1000 + GHOST_BULLET_TANK_MS, rand: () => 0,
    }));
    expect(expired.tankedBulletKey).toBeUndefined();
    expect(expired.moveY).toBeLessThan(0); // 弾の進行方向(+x)に対して横(-y)へ外す
  });

  it("'dodge'/'fallback'の弾技は従来どおり全部避ける(苦手の再現は'tank'だけ)", () => {
    const profile: GhostProfile = {
      ...PROFILE, meleeBias: 0, moveReactions: { 'mimir-burst': { n: 5, counterRate: 0, hitRate: 0 } },
    };
    const d = decideGhost(baseDriverInput({
      ghost: mkGhost({ x: 0, y: 0, dangerSeenAt: 0, dangerLastAt: 1000 }),
      enemies: [mimirBurst()], projectiles: [mkProj({ srcMoveKey: 'mimir-burst' })],
      profile, nowMs: 1000, rand: () => 0.5,
    }));
    expect(d.moveRoll?.decision).toBe('dodge');
    expect(d.tankedBulletKey).toBeUndefined();
    expect(d.moveY).toBeLessThan(0); // 本気で避ける
  });
});

// ==== v0.25.2564: ボス体当たり対策(縁基準の射程+体の常時回避)===================================
// 実測(テスト依頼#7/#8): 守護霊の死因はほぼ contact:mimir のみ。旧実装は①距離が全て中心間
// =巨体ボス(mimir幅248)では体内に立たないと近接/カウンター不成立、②接触回避の閾値
// (damage>=最大HPの20%)が高HP記録では反応しない、の合わせ技で体当たりを食らい続けていた。
describe('v0.25.2564: 縁基準の近接射程(パリティ=プレイヤーのenemyMeleeDistと同じ物差し)', () => {
  // 巨体ボス(mimir級=248×248)。ghost(20×20)を右縁から60pxに置く: 縁60 ≤ 74(圏内)だが
  // 中心間は184 > 74=旧実装(中心間)なら近接不成立だった配置。
  const bigBoss = (over: Partial<Enemy> = {}): Enemy =>
    mkBoss({ type: 'mimir' as Enemy['type'], x: 0, y: 0, width: 248, height: 248, bossState: 'chase', ...over });

  it('巨体ボスは体内に立たなくても縁から74px以内で近接が成立する', () => {
    const d = decideGhost(baseDriverInput({
      ghost: mkGhost({ x: 298, y: 114 }), // 中心(308,124): 縁(x=248)から60px
      enemies: [bigBoss()],
      profile: { ...PROFILE, meleeBias: 1 },
    }));
    expect(d.action).toBe('melee');
  });

  it("'counter'ロールの接近も縁基準で止まる(巨体の中心まで突っ込まない)", () => {
    const profile: GhostProfile = {
      ...PROFILE, moveReactions: { 'mimir-burst': { n: 5, counterRate: 1, hitRate: 0 } },
    };
    const d = decideGhost(baseDriverInput({
      ghost: mkGhost({ x: 298, y: 114 }),
      enemies: [bigBoss({ bossState: 'burst' })], profile, rand: () => 0.5,
    }));
    expect(d.moveRoll?.decision).toBe('counter');
    expect(d.moveX).toBe(0); // 縁60 ≤ 74=射程内なので詰めない(旧: 中心間184>74で体へ突っ込み続けた)
    expect(d.moveY).toBe(0);
  });

  // v0.25.2567(監査9-2の是正): 銃の射程ゲートはプレイヤーと同じ式(裏ボス=AABB最近点)。
  it('銃: 裏ボスは縁基準=短射程(ショットガン級)でも体外から撃てる(旧: 中心間で永久に射程外)', () => {
    const d = decideGhost(baseDriverInput({
      ghost: mkGhost({ x: 298, y: 114 }), // 縁から60px・中心間184
      enemies: [bigBoss()],
      profile: { ...PROFILE, meleeBias: 0 },
      weapon: { ...WEAPON, gunRangePx: 120 }, // ショットガンの射程。旧実装: 184>120で撃てなかった
    }));
    expect(d.action).toBe('shoot');
  });

  it('銃: 裏ボス以外はプレイヤーと同じ中心基準のまま(縁で緩めない)', () => {
    // giantbat(城ボス=isHiddenBossでない)を射程ちょうど外の中心距離に置く: 縁なら射程内でも撃たない。
    const giant = mkBoss({ type: 'giantbat' as Enemy['type'], x: 400, y: 0, bossState: 'chase' });
    const d = decideGhost(baseDriverInput({
      ghost: mkGhost({ x: 0, y: 0 }), // 中心(10,10)→giantbat中心(420,20)=中心間410 > 400
      enemies: [giant],
      profile: { ...PROFILE, meleeBias: 0 },
    }));
    expect(d.action).toBe('none');
  });

  // v0.25.2567(監査9-3の是正): 間合い管理(preferredDist)も縁基準(計測=bossBandDist=縁と同じ単位)。
  it('間合い管理: 縁からpreferredDistに立てば帯の中=前後せず横流れ(旧: 中心間で体内を目指した)', () => {
    const d = decideGhost(baseDriverInput({
      ghost: mkGhost({ x: 418, y: 114 }), // 中心(428,124): 縁(x=248)から180=preferredDistちょうど
      enemies: [bigBoss()],
      profile: { ...PROFILE, meleeBias: 0 },
    }));
    // 旧実装: 中心間304 > 180+40 → 接近(-x)し続けて体へ向かった。新: 帯の中=接線オービット。
    expect(Math.abs(d.moveX)).toBeLessThan(1e-6);
    expect(Math.abs(d.moveY)).toBeCloseTo(GHOST_ORBIT_BASE_FRAC, 5);
  });
});

describe('v0.25.2564: ボスの体は常時回避対象(HP閾値なし・縁基準)', () => {
  // maxHealth=400 → 既存の接触規格(damage>=最大HPの20%)では危険にならない(damage10<80)
  // =旧実装なら反応しなかった条件で、ボスの体だけは避けることを固定する。
  const smallBoss = (): Enemy => mkBoss({ x: 0, y: 0, width: 40, height: 40 }); // type=thor(ボス)

  it('縁からGHOST_BOSS_BODY_AVOID_PX未満なら、最大HPに関わらず体の中心から離れる', () => {
    const v = ghostDodgeVector(60, 20, [smallBoss()], [], 400, aabbMeleeDist); // 縁(x=40)から20px
    expect(v).not.toBeNull();
    expect(v!.x).toBeGreaterThan(0); // 中心(20,20)の反対=+xへ
    expect(Math.abs(v!.y)).toBeLessThan(1e-6);
  });

  it('縁からGHOST_BOSS_BODY_AVOID_PX以上は反発しない(近接の踏み込み(74px圏)を殺さない)', () => {
    const v = ghostDodgeVector(40 + GHOST_BOSS_BODY_AVOID_PX + 1, 20, [smallBoss()], [], 400, aabbMeleeDist);
    expect(v).toBeNull();
  });

  it('非ボス(雑魚)の体には効かない=雑魚は既存の接触規格(damage>=最大HPの20%)だけ', () => {
    const mob = mkBoss({ id: 'mob-1', type: 'zombie' as Enemy['type'], x: 0, y: 0, width: 40, height: 40 });
    expect(ghostDodgeVector(60, 20, [mob], [], 400, aabbMeleeDist)).toBeNull();
  });

  it('meleeDist未注入(旧経路の直接呼び出し)では働かない=注入時のみ有効', () => {
    expect(ghostDodgeVector(60, 20, [smallBoss()], [], 400)).toBeNull();
  });
});

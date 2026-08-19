// research/GHOST_BOSS.md(守護霊ボス「幻影」): 頭脳+技のコントローラ。
//
// ## 何をするファイルか
// 社長ゴール(言葉のまま):「試しに、ボスモードに守護霊の最強データを一体、ボスとして配線できる?
// プレイヤーと守護霊を戦わせてみたい」。
//
// ## 頭脳は**書かない**(既存 decideGhost を対プレイヤーへ向け直すだけ)
// 守護霊(味方)の意思決定は `ghostDriver.decideGhost` に全部ある——preferredDist(間合い)/
// counterChance・reactionMs(反応)/stationaryFrac・approachPerMin(移動リズム)を**計測データから**
// 出す関数で、これが「守護霊らしさ」の本体。ここで自前のステアリングを書くと、同じ個性を2度
// 実装して片方だけ古くなる(このプロジェクトが繰り返してきた事故の型)。
// ⇒ **標的だけ差し替える**: decideGhost には「敵の一覧」と「狙う敵のid」を渡す口があるので、
//    **プレイヤーを1体の疑似 Enemy として渡す**。返ってくる移動ベクトルと攻撃意図をそのまま使う。
//
// ## 技は bossState 機械(bountyTick.ts と同じ流儀)
// `gp-<move>-windup` → `gp-<move>-active` → `gp-<move>-recover`(命名規約=moveCancelGuard が読む形)。
// **接頭辞が `gp-` なのは命名衝突の回避**: 既存コードの "ghost boss"(GHOST_BOSS_HP_MULT 等)は
// **守護霊が戦う相手**を指すので、`ghost-` を使うと意味が逆になる。
//
// ## 掟(CLAUDE.md)
//  - 移動は必ず ①障害物衝突(resolveBountyMove) → ②`clampRectToPlayableArea` の順で通す。
//    一閃の終点もクランプする(「行ける帯」の定義を1本に保つ)。
//  - **時計の混在**(ENGINEERING_NOTES.md): `bossState*`/休みは `gameTime`(シミュ時刻)、
//    `counterWindowEnd`/`knockbackUntil`/decideGhost の内部CDは `Date.now()`。**混ぜて比較しない**。
//    このファイルは両方を引数で受け取り、それぞれの世界の中だけで比較する。
//  - 慣性: 一閃の踏み込みは加速→減速(smoothstep)。等速で始まって瞬間停止しない。
//  - 赤い予告=判定: 帯の寸法は phantomScript.ts の1箇所だけを読む(判定・成立域・描画が同じ数字)。
import type { Enemy, EnemyType, Player, Projectile } from '../types/game';
import {
  useGameStore, resolveBountyMove,
  counterReplyDamage, skillLevel, BOSS_CRIT_DAMAGE_MULT, counterMasterAwakenBuffPatch,
  COUNTER_HITSTOP_MS, COUNTER_SHAKE_MS, COUNTER_SHAKE_MAG, COUNTER_ZOOM_MAG,
  MELEE_FINISH_SLOW_MS, MELEE_FINISH_SLOW_HOLD_MS, knockbackSpeedFor,
  bossSlowMult,
} from '../store/gameStore';
import { clampRectToPlayableArea, type PlayableAreaCtx } from '../world/playableArea';
import { createEnemyProjectile } from './enemyUtils';
import { isCounterablePhase } from './bossScript';
import { counterReachShapeFor, inCounterReach } from './counterReach';
import { notifyCounterHit, notifyMoveCounter } from './playerTraits';
import { recordCritHit } from './botTelemetry';
import { refundCounterCooldown } from './counterMaster';
import { createWeapon, getActiveGun } from './weaponUtils';
import { GLOW_R_L } from './glowTiers';
import { decideGhost, type GhostDecision, type GhostProfile } from './ghostDriver';
import { strongestGuardian } from '../data/fixedGuardians';
import { GUARDIAN_PHANTOM_TUNING as GP_T } from './phantomScript';

/** 制御対象の型(判定の出どころを1箇所に)。 */
export const GUARDIAN_PHANTOM_TYPE: EnemyType = 'guardian-phantom';

// =================================================================================================
// 台帳から効かせるデータ(research/GHOST_BOSS.md「台帳から効かせるデータ」)
// =================================================================================================
/**
 * 幻影の頭脳へ渡すプロファイル。**守護霊台帳の最強データ(strongestGuardian)そのもの**を
 * `GhostProfile` の形へ写すだけ(値を発明しない)。`PlayerProfile` と `GhostProfile` はノブが
 * 同名・同意味なので、必要なフィールドだけ拾えばよい。
 */
let profileCache: GhostProfile | null = null;
export const phantomProfile = (): GhostProfile => {
  // 台帳は**不変の定数**(ランタイムで書き換わらない)ので1回だけ組んで使い回す
  // ——毎tick再構築するとオブジェクトを毎フレーム捨てることになる(CLAUDE.md 性能規律)。
  if (profileCache) return profileCache;
  const p = strongestGuardian().profile;
  profileCache = {
    reactionMs: p.reactionMs,
    counterChance: p.counterChance,
    preferredDist: p.preferredDist,
    meleeBias: p.meleeBias,
    mobility: p.mobility,
    hitsPerMin: p.hitsPerMin,
    subUsesPerMin: p.subUsesPerMin,
    stationaryFrac: p.stationaryFrac,
    approachPerMin: p.approachPerMin,
    // 技への反応表は**渡さない**: 表のキーは「ボスの技」で、幻影から見た相手はプレイヤー=
    // 技キーが引けない(anyMoveKeyForEnemy が null)。渡しても常にフォールバックになるだけなので、
    // 「効いているように見えて効いていない配線」を作らない(第1弾の割り切り・設計書§反応表)。
  };
  return profileCache;
};

/**
 * 銃撃1発のダメージ。設計書「dmg=gunKeyの武器基礎値から導出(下限6)」。
 * 出どころ=台帳の `profile.snapshot.activeGunKey` → 武器カタログの基礎値(数字を写経しない)。
 */
let shotDamageCache: number | null = null;
export const phantomShotDamage = (): number => {
  // 同上(1回だけ引く)。`createWeapon` は毎回インスタンスを作る=毎tick呼ぶ物ではない。
  if (shotDamageCache !== null) return shotDamageCache;
  const key = strongestGuardian().profile.snapshot?.activeGunKey;
  const base = key ? createWeapon(key).damage : 0;
  shotDamageCache = Math.max(GP_T.shot.damageFloor, Math.round(base));
  return shotDamageCache;
};

// =================================================================================================
// SFX の注入口(bountyTick.BountySfx と同型・headless では audioManager を import しない)
// =================================================================================================
export interface PhantomSfx {
  /** 予兆SE(溜めの開始)。 */
  alert: () => void;
  /** 発射・斬撃の一撃SE。 */
  fire: () => void;
  counter: (gain?: number) => void;
  reward: (gain?: number) => void;
}
export const NOOP_PHANTOM_SFX: PhantomSfx = {
  alert: () => {}, fire: () => {}, counter: () => {}, reward: () => {},
};

// =================================================================================================
// カウンターが通る州(counterReach.ts の宣言表とセットで counterReach.test.ts が突き合わせる)
// =================================================================================================
/** 溜め中にカウンターが成立する州。**赤い帯=成立域**(体の重なりではない)。 */
export const GUARDIAN_PHANTOM_WINDUP_STATES: readonly string[] = ['gp-melee-windup', 'gp-issen-windup'];
/** 硬直中にカウンターが成立する州(パニッシュ窓)。成立域は自分の体。 */
export const GUARDIAN_PHANTOM_RECOVER_STATES: readonly string[] = ['gp-melee-recover', 'gp-issen-recover'];

// =================================================================================================
// ラン内状態(useGameLoop がラン開始時に作り直す・BountyTickState と同じ流儀)
// =================================================================================================
export interface PhantomTickState {
  /** 直前tickで制御していた個体id(切り替わったら下を全部リセット)。 */
  activeId: string | null;
  /** decideGhost が次tickへ持ち越す自己状態(Date.now基準の内部CD・オービット向き等)。 */
  ghost: {
    facing: 1 | -1;
    lastShotAt: number;
    lastMeleeAt: number;
    counterPendingAt?: number;
    counterWillAttempt?: boolean;
    lastCounterAttemptAt?: number;
    dangerSeenAt?: number;
    dangerLastAt?: number;
    orbitSign?: 1 | -1;
  };
  /** 次に技を選んでよい時刻(gameTime基準)。硬直明けに `+restMs` して置く。 */
  nextMoveAt: number;
  /** 一閃の踏み込み: 焼き付けた起点と単位ベクトル(実行中はここからのイーズ距離で位置を決める)。 */
  issenX0: number; issenY0: number; issenUx: number; issenUy: number;
  /** 一閃の判定を1回の振りで1度だけ積むための旗(多段防止)。 */
  issenHitFired: boolean;
  /** 近接の判定を1回の振りで1度だけ積むための旗(同上)。 */
  meleeHitFired: boolean;
  /** 銃撃: このサイクルで残っている弾数と、次弾の時刻(gameTime基準)。 */
  shotsRemaining: number;
  nextShotAt: number;
}

export const createPhantomTickState = (): PhantomTickState => ({
  activeId: null,
  ghost: { facing: 1, lastShotAt: 0, lastMeleeAt: 0 },
  nextMoveAt: 0,
  issenX0: 0, issenY0: 0, issenUx: 1, issenUy: 0,
  issenHitFired: false, meleeHitFired: false,
  shotsRemaining: 0, nextShotAt: 0,
});

/** 個体が入れ替わった/ランが変わった時の全消し。 */
const resetPhantomRunState = (s: PhantomTickState): void => {
  s.ghost = { facing: 1, lastShotAt: 0, lastMeleeAt: 0 };
  s.nextMoveAt = 0;
  cancelPhantomTechnique(s);
};

/**
 * 進行中の技を捨てる(中断・気絶・カウンター成立)。**焼き付けた踏み込みと残弾だけ**を消す。
 * 休み(nextMoveAt)はここでは触らない=中断で得をしない(連発防止)。
 */
const cancelPhantomTechnique = (s: PhantomTickState): void => {
  s.issenX0 = 0; s.issenY0 = 0; s.issenUx = 1; s.issenUy = 0;
  s.issenHitFired = false; s.meleeHitFired = false;
  s.shotsRemaining = 0; s.nextShotAt = 0;
};

// =================================================================================================
// 純関数(テスト対象)
// =================================================================================================
/** 慣性(CLAUDE.md MUST): 加速→減速の smoothstep。0→1。 */
export const phantomEase = (t: number): number => {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
};

export type PhantomMove = 'gp-melee' | 'gp-shot' | 'gp-issen';

/**
 * 距離と「攻撃意図」から技を選ぶ(設計書「近(≤preferredDist)=melee / 中=issen or shot / 遠=shot」)。
 *
 * `intent` は decideGhost が返した action。**間合いの取り方は台帳のプロファイルが決めている**ので、
 * ここは「その間合いで何を出すか」だけを決める薄い層にする(意思決定を二重に持たない)。
 *  - 近(preferredDist 以内) … 近接。
 *  - 中(一閃の射程内)     … 意図が近接寄り(melee)なら一閃、撃つ気(shoot)なら銃撃。
 *  - 遠                    … 銃撃。
 */
export const pickPhantomMove = (
  dist: number, preferredDist: number, intent: GhostDecision['action'],
): PhantomMove => {
  if (dist <= preferredDist) return 'gp-melee';
  if (dist <= GP_T.issen.reach) return intent === 'melee' ? 'gp-issen' : 'gp-shot';
  return 'gp-shot';
};

/**
 * 一閃の踏み込みで**このフレームに居るべき位置**(起点からのオフセット)。
 * 距離は帯の長さ×`issenTravelFrac`。時間カーブは加速→減速(慣性MUST)。
 */
export const phantomIssenOffsetPx = (t01: number): number =>
  phantomEase(t01) * GP_T.issen.reach * GP_T.issenTravelFrac;

// =================================================================================================
// store を触るヘルパ(bountyTick.ts と同じ作法)
// =================================================================================================
const applyPatch = (id: string, patch: Partial<Enemy>): void => {
  if (Object.keys(patch).length === 0) return;
  useGameStore.setState(stt => ({ enemies: stt.enemies.map(e => (e.id === id ? { ...e, ...patch } : e)) }));
};

const playableCtx = (): PlayableAreaCtx => {
  const st = useGameStore.getState();
  return {
    farBackdrop: st.farBackdrop,
    labTheme: st.stageTheme === 'lab' && !st.indoorMode,
    corridorMode: st.corridorMode,
    m0AdvanceLimitX: st.m0AdvanceLimitX,
    corridorRunInActive: st.corridorRunInActive,
  };
};

/**
 * 希望移動量を「実際に立てる場所」へ解決する。**必ず ①障害物 → ②行ける帯 の順**
 * (CLAUDE.md「アクターを動かす時は必ず clampRectToPlayableArea を通す」)。
 */
const resolveMove = (nx: number, ny: number, e: Enemy): { x: number; y: number } => {
  const collided = resolveBountyMove(nx, ny, { width: e.width, height: e.height });
  return clampRectToPlayableArea(collided.x, collided.y, e.width, e.height, playableCtx());
};

/** 帯(カプセル)の当たり判定を1件積む(bountyTick.hitCapsule と同型)。 */
const hitCapsule = (
  phantom: Enemy, fx: number, fy: number, tx: number, ty: number, halfW: number, damage: number,
  knockback?: { distPx: number; ms: number },
): void => {
  useGameStore.setState(state => ({
    pumpkinBlasts: [...state.pumpkinBlasts, {
      x: (fx + tx) / 2, y: (fy + ty) / 2, radius: halfW, damage, enemyId: phantom.id,
      capsule: { fx, fy, tx, ty, halfWidth: halfW },
      ...(knockback ? { kbSpeed: knockbackSpeedFor(knockback.distPx, knockback.ms), kbMs: knockback.ms } : {}),
    }],
  }));
};

/**
 * 気絶・拘束・浮き・ノックバックのいずれかが有効か(bountyTick.isFrozen と同型)。
 * bossFullStunUntil/stunUntil/rootUntil は gameTime基準、liftUntil/knockbackUntil は Date.now基準
 * ——**時計が違う**ので引数を2本受け取る(ENGINEERING_NOTES.md「時計の混在」)。
 */
const isFrozen = (e: Enemy, newGameTime: number, nowMs: number): boolean =>
  (e.bossFullStunUntil !== undefined && newGameTime < e.bossFullStunUntil)
  || (e.stunUntil !== undefined && newGameTime < e.stunUntil)
  || (e.rootUntil !== undefined && newGameTime < e.rootUntil)
  || (e.liftUntil !== undefined && nowMs < e.liftUntil)
  || (e.knockbackUntil !== undefined && nowMs < e.knockbackUntil);

/**
 * カウンター成立の演出+報酬(bountyTick.bountyCounterHit と同型・**同じ共通処理を通す**)。
 * ここを自前に書き下ろすのではなく既存の並びを写しているのは、CDリファンド(counter-master)・
 * 覚醒バフ・確定クリ反撃・体勢値('counter' impact)といった「カウンターの取り分」を
 * 1つも落とさないため。体勢値は damageEnemy の postureImpact='counter' 経由で積まれる。
 */
const phantomCounterHit = (phantom: Enemy, hx: number, hy: number, sfx: PhantomSfx): void => {
  notifyCounterHit();
  notifyMoveCounter();
  const g = useGameStore.getState();
  const cp = g.player;
  const pnow = Date.now();
  g.addMeleeFinishCombo(1);
  sfx.counter();
  g.spawnGlow(hx, hy, GLOW_R_L, 'rgba(56,189,248,', 360);
  g.triggerHitImpact(COUNTER_HITSTOP_MS, COUNTER_SHAKE_MS, COUNTER_SHAKE_MAG, COUNTER_ZOOM_MAG);
  g.markMeleeSwingFx();
  g.spawnRing(hx, hy, 14, 135, 'rgba(56,189,248,0.9)', 3, 360);
  g.spawnBurst(hx, hy, '#38bdf8', 14);
  g.spawnCallout(hx, hy - 12, 'Counter!', '#e0f2ff', { bg: 0x2563eb, holdMs: MELEE_FINISH_SLOW_HOLD_MS, duration: MELEE_FINISH_SLOW_MS });
  useGameStore.setState(stt => ({ player: {
    ...stt.player, invulnerable: true, invulnerableTime: pnow, lastCounterSuccessTime: pnow,
    counterCooldownEnd: refundCounterCooldown(stt.player.counterCooldownEnd, pnow, skillLevel(stt.player, 'counter-master')),
    ...counterMasterAwakenBuffPatch(stt.player, stt.gameTime),
  } }));
  const dmg = counterReplyDamage(getActiveGun(cp)?.damage ?? 12, cp, BOSS_CRIT_DAMAGE_MULT);
  const g2 = useGameStore.getState();
  g2.damageEnemy(phantom.id, dmg, false, true, false, 'other', 'player', 'counter');
  recordCritHit('guaranteed', false); // §7-11c(4): カウンター反撃(確定クリ)の計測口
  g2.spawnDamageNumber(phantom.x + phantom.width / 2, phantom.y, dmg, true);
  sfx.reward();
  g2.spawnRing(hx, hy, 8, 46, 'rgba(253,224,71,0.95)', 3, 300);
  g2.spawnBurst(hx, hy, '#fde047', 10);
  g2.spawnGlow(hx, hy, 34, 'rgba(253,224,71,', 240);
};

// =================================================================================================
// 頭脳(decideGhost の対プレイヤーアダプタ)
// =================================================================================================
/**
 * プレイヤーを decideGhost が読める「疑似 Enemy」にする。
 *
 * **型は 'zombie'** にしてある(見た目にも判定にも一切使わない・decideGhost 内で `isBossType` の
 * 分岐に落ちないようにするため)。この個体は store には**入れない**=盤面に存在しない一時オブジェクト。
 */
const playerAsTarget = (p: Player): Enemy => ({
  id: 'gp-target-player',
  x: p.x, y: p.y, width: p.width, height: p.height,
  speed: 0, health: Math.max(1, p.health), maxHealth: Math.max(1, p.maxHealth),
  damage: 0, type: 'zombie', experienceValue: 0, lastHit: 0, lastShot: 0,
});

/** 矩形の縁までの距離(プレイヤーと同じ AABB 最近点。decideGhost の meleeDist 注入口へ渡す)。 */
const edgeDistTo = (cx: number, cy: number, r: { x: number; y: number; width: number; height: number }): number => {
  const nx = Math.max(r.x, Math.min(cx, r.x + r.width));
  const ny = Math.max(r.y, Math.min(cy, r.y + r.height));
  return Math.hypot(cx - nx, cy - ny);
};

/**
 * 幻影の1tickぶんの意思決定。**decideGhost をそのまま呼ぶ**(自前ステアを書かない)。
 * 渡すのは「プレイヤー=狙う相手」「プレイヤーの弾=避ける脅威」だけ。
 */
export const decidePhantom = (
  phantom: Enemy, s: PhantomTickState, player: Player, projectiles: readonly Projectile[],
  gameTime: number, nowMs: number,
): GhostDecision => {
  const target = playerAsTarget(player);
  const profile = phantomProfile();
  return decideGhost({
    ghost: {
      x: phantom.x, y: phantom.y, width: phantom.width, height: phantom.height,
      maxHealth: phantom.maxHealth,
      facing: s.ghost.facing,
      lastShotAt: s.ghost.lastShotAt,
      lastMeleeAt: s.ghost.lastMeleeAt,
      counterPendingAt: s.ghost.counterPendingAt,
      counterWillAttempt: s.ghost.counterWillAttempt,
      lastCounterAttemptAt: s.ghost.lastCounterAttemptAt,
      dangerSeenAt: s.ghost.dangerSeenAt,
      dangerLastAt: s.ghost.dangerLastAt,
      orbitSign: s.ghost.orbitSign,
    },
    // 「標的が居ない時はプレイヤーへ寄る」フォールバック用の座標。幻影に守るべき主は居ないので
    // 自分自身を渡す=そのフォールバックは実質何もしない(標的は常に居るので通らない)。
    player: { x: phantom.x, y: phantom.y, width: phantom.width, height: phantom.height },
    enemies: [target],
    boundBossId: target.id,
    // **プレイヤーの弾だけ**を脅威として渡す(自分の弾を避けない)。
    projectiles: projectiles.filter(p => !p.hostile),
    meleeDist: (cx, cy, e) => edgeDistTo(cx, cy, e),
    profile,
    weapon: {
      gunDamage: phantomShotDamage(),
      gunIntervalMs: GP_T.shot.windup + GP_T.shot.gapMs * GP_T.shot.count + GP_T.shot.recover,
      gunRangePx: GP_T.shot.range,
      meleeDamage: GP_T.melee.damage,
    },
    gameTime,
    nowMs,
  });
};

// =================================================================================================
// 技(bossState 機械)
// =================================================================================================
/** 溜めの開始(3技共通の入口)。予告の2点(aiFrom→aiTarget)は**判定と同じ値**を書く。 */
const beginMove = (
  move: PhantomMove, phantom: Enemy, s: PhantomTickState, newGameTime: number,
  pcx: number, pcy: number, bcx: number, bcy: number, sfx: PhantomSfx, patch: Partial<Enemy>,
): void => {
  const ang = Math.atan2(pcy - bcy, pcx - bcx);
  patch.aiFromX = bcx; patch.aiFromY = bcy;
  patch.bossWindupStartAt = newGameTime;
  sfx.alert();
  if (move === 'gp-melee') {
    patch.aiTargetX = bcx + Math.cos(ang) * GP_T.melee.reach;
    patch.aiTargetY = bcy + Math.sin(ang) * GP_T.melee.reach;
    patch.bossState = 'gp-melee-windup';
    patch.bossStateUntil = newGameTime + GP_T.melee.windup;
    s.meleeHitFired = false;
    return;
  }
  if (move === 'gp-issen') {
    // 一閃の終点も**行ける帯へクランプ**してから焼き付ける(帯の外へ斬り抜けない)。
    const rawTx = bcx + Math.cos(ang) * GP_T.issen.reach;
    const rawTy = bcy + Math.sin(ang) * GP_T.issen.reach;
    const c = clampRectToPlayableArea(
      rawTx - phantom.width / 2, rawTy - phantom.height / 2, phantom.width, phantom.height, playableCtx(),
    );
    patch.aiTargetX = c.x + phantom.width / 2;
    patch.aiTargetY = c.y + phantom.height / 2;
    patch.bossState = 'gp-issen-windup';
    patch.bossStateUntil = newGameTime + GP_T.issen.windup;
    s.issenHitFired = false;
    return;
  }
  // 銃撃: 構えの向きだけ焼く(赤い図形は持たない=弾そのものが予告)。
  patch.aiTargetX = pcx;
  patch.aiTargetY = pcy;
  patch.bossState = 'gp-shot-windup';
  patch.bossStateUntil = newGameTime + GP_T.shot.windup;
  s.shotsRemaining = GP_T.shot.count;
};

/** 弾を1発撃つ(全ボス共通の赤い二重丸=絵替えしない)。 */
const fireShot = (phantom: Enemy, bcx: number, bcy: number, sfx: PhantomSfx): void => {
  const st = useGameStore.getState();
  const p = st.player;
  const pcx = p.x + p.width / 2, pcy = p.y + p.height / 2;
  st.addProjectile(createEnemyProjectile(
    phantom, p, pcx, pcy, bcx, bcy,
    { speed: GP_T.shot.speed, damage: phantomShotDamage(), size: GP_T.shot.size },
  ));
  sfx.fire();
};

/** 硬直へ入る(共通)。休みは硬直明けから数えるので、ここでは `nextMoveAt` を触らない。 */
type PhantomRecoverState = 'gp-melee-recover' | 'gp-shot-recover' | 'gp-issen-recover';
const toRecover = (state: PhantomRecoverState, ms: number, newGameTime: number, patch: Partial<Enemy>): void => {
  patch.bossState = state;
  patch.bossStateUntil = newGameTime + ms;
};

/** 中立(chase)へ戻す(共通)。硬直明け・中断のどちらもここを通す。 */
const toChase = (s: PhantomTickState, newGameTime: number, patch: Partial<Enemy>): void => {
  cancelPhantomTechnique(s);
  patch.bossState = 'chase';
  patch.bossStateUntil = undefined;
  s.nextMoveAt = newGameTime + GP_T.restMs;
};

// =================================================================================================
// 本体
// =================================================================================================
/**
 * 幻影1体を1tick進める。
 *
 * @param newGameTime シミュ時刻(ms)。`bossState*` / `nextMoveAt` はこの時計。
 * @param nowMs       `Date.now()`。`counterWindowEnd` / `knockbackUntil` / decideGhost の内部CDはこの時計。
 */
export const runPhantomTick = (
  phantom: Enemy,
  s: PhantomTickState,
  newGameTime: number,
  deltaTime: number,
  moveSpeedMult: number,
  nowMs: number,
  sfx: PhantomSfx = NOOP_PHANTOM_SFX,
  counterEnabled = true,
): void => {
  if (s.activeId !== phantom.id) { resetPhantomRunState(s); s.activeId = phantom.id; }

  const st0 = useGameStore.getState();
  const player = st0.player;
  const pcx = player.x + player.width / 2, pcy = player.y + player.height / 2;
  const bcx = phantom.x + phantom.width / 2, bcy = phantom.y + phantom.height / 2;
  const dist = Math.hypot(pcx - bcx, pcy - bcy);
  const patch: Partial<Enemy> = {};

  // ---- 気絶・拘束・浮き・ノックバック・紫: 技を中断して止まる ------------------------------------
  // (bountyTick と同じ扱い。毎フレーム 'chase' へ押し出し続けることで、①予告がその場で消える
  //  ②解除の瞬間に真新しい休みから再開する=期限切れの溜めがその場で即着弾する事故を防ぐ。)
  if (isFrozen(phantom, newGameTime, nowMs)) {
    cancelPhantomTechnique(s);
    applyPatch(phantom.id, { bossState: 'chase', bossStateUntil: undefined });
    s.nextMoveAt = newGameTime + GP_T.restMs;
    return;
  }

  // ---- カウンター成立(★宣言だけでは成立しない=ここが成立側の配線) -------------------------------
  // 掟: 成立域は「赤い予告の図形」。どの州がどの図形かは counterReach.ts の宣言表が正本で、
  // 寸法は phantomScript.ts をその場で読む(写経した if を増やさない)。
  const stNow = phantom.bossState ?? 'chase';
  let countered = false;
  if (counterEnabled && isCounterablePhase(stNow, GUARDIAN_PHANTOM_WINDUP_STATES, GUARDIAN_PHANTOM_RECOVER_STATES)) {
    const inReach = inCounterReach(
      counterReachShapeFor(`gp:${stNow}`, {
        bcx, bcy, pcx, pcy,
        aiFromX: phantom.aiFromX, aiFromY: phantom.aiFromY,
        aiTargetX: phantom.aiTargetX, aiTargetY: phantom.aiTargetY,
      }),
      { x: player.x, y: player.y, width: player.width, height: player.height },
      { x: phantom.x, y: phantom.y, width: phantom.width, height: phantom.height },
    );
    // `counterWindowEnd` は **Date.now基準**(gameTime と比べない=時計の混在の掟)。
    if (inReach && nowMs <= player.counterWindowEnd) {
      phantomCounterHit(phantom, bcx, bcy, sfx);
      countered = true;
      // 成立=技を中断してノックバック相当の硬直へ落とす。ノックバック自体は上の共通処理
      // (damageEnemy → 既存のカウンター経路)が積むので、ここは州を戻すだけでよい。
      patch.bossState = 'gp-stagger';
      patch.bossStateUntil = newGameTime + GP_T.restMs;
      cancelPhantomTechnique(s);
      s.nextMoveAt = newGameTime + GP_T.restMs;
    }
  }

  if (countered) { applyPatch(phantom.id, patch); return; }

  const stNow2 = phantom.bossState ?? 'chase';
  const until = phantom.bossStateUntil ?? newGameTime;
  const fx = phantom.aiFromX ?? bcx, fy = phantom.aiFromY ?? bcy;
  const tx = phantom.aiTargetX ?? bcx, ty = phantom.aiTargetY ?? bcy;

  // ---- カウンターで崩された後の硬直(gp-stagger) --------------------------------------------------
  if (stNow2 === 'gp-stagger') {
    if (newGameTime >= until) { patch.bossState = 'chase'; patch.bossStateUntil = undefined; }
    applyPatch(phantom.id, patch);
    return;
  }

  // ---- 中立(chase): 頭脳に従って動き、休みが明けていれば技を選ぶ ---------------------------------
  if (stNow2 === 'chase') {
    const decision = decidePhantom(phantom, s, player, st0.projectiles, newGameTime, nowMs);
    // 次tickへ持ち越す自己状態(全て Date.now 基準の世界)。
    s.ghost.facing = decision.facing;
    s.ghost.lastShotAt = decision.lastShotAt;
    s.ghost.lastMeleeAt = decision.lastMeleeAt;
    s.ghost.counterPendingAt = decision.counterPendingAt;
    s.ghost.counterWillAttempt = decision.counterWillAttempt;
    s.ghost.lastCounterAttemptAt = decision.lastCounterAttemptAt;
    s.ghost.dangerSeenAt = decision.dangerSeenAt;
    s.ghost.dangerLastAt = decision.dangerLastAt;
    s.ghost.orbitSign = decision.orbitSign;

    // 移動: 頭脳の単位ベクトル × 速度。**必ず resolveMove(障害物→行ける帯)を通す。**
    const dt = deltaTime * moveSpeedMult * bossSlowMult(phantom, newGameTime);
    if (decision.moveX !== 0 || decision.moveY !== 0) {
      const spd = phantom.speed * dt;
      const c = resolveMove(phantom.x + decision.moveX * spd, phantom.y + decision.moveY * spd, phantom);
      patch.x = c.x; patch.y = c.y;
      patch.vx = decision.moveX * phantom.speed;
      patch.vy = decision.moveY * phantom.speed;
    } else {
      patch.vx = 0; patch.vy = 0;
    }

    if (decision.action !== 'none' && newGameTime >= s.nextMoveAt) {
      beginMove(
        pickPhantomMove(dist, phantomProfile().preferredDist, decision.action),
        phantom, s, newGameTime, pcx, pcy, bcx, bcy, sfx, patch,
      );
    }
    applyPatch(phantom.id, patch);
    return;
  }

  // ---- 近接 gp-melee ------------------------------------------------------------------------------
  if (stNow2 === 'gp-melee-windup') {
    patch.vx = 0; patch.vy = 0;
    if (newGameTime >= until) {
      patch.bossState = 'gp-melee-active';
      patch.bossStateUntil = newGameTime + GP_T.melee.active;
    }
    applyPatch(phantom.id, patch);
    return;
  }
  if (stNow2 === 'gp-melee-active') {
    if (!s.meleeHitFired) {
      s.meleeHitFired = true;
      // 判定=赤帯とまったく同じ2点・同じ半幅(phantomScript の1箇所を両方が読む)。
      hitCapsule(phantom, fx, fy, tx, ty, GP_T.melee.halfWidth, GP_T.melee.damage, { distPx: 90, ms: 200 });
      sfx.fire();
    }
    if (newGameTime >= until) toRecover('gp-melee-recover', GP_T.melee.recover, newGameTime, patch);
    applyPatch(phantom.id, patch);
    return;
  }
  if (stNow2 === 'gp-melee-recover') {
    patch.vx = 0; patch.vy = 0;
    if (newGameTime >= until) toChase(s, newGameTime, patch);
    applyPatch(phantom.id, patch);
    return;
  }

  // ---- 銃撃 gp-shot -------------------------------------------------------------------------------
  if (stNow2 === 'gp-shot-windup') {
    patch.vx = 0; patch.vy = 0;
    if (newGameTime >= until) {
      patch.bossState = 'gp-shot-active';
      // 3連ぶんの実行時間。次弾の時刻は「今」から数える(1発目は溜め明けに即出る)。
      patch.bossStateUntil = newGameTime + GP_T.shot.gapMs * GP_T.shot.count;
      s.shotsRemaining = GP_T.shot.count;
      s.nextShotAt = newGameTime;
    }
    applyPatch(phantom.id, patch);
    return;
  }
  if (stNow2 === 'gp-shot-active') {
    patch.vx = 0; patch.vy = 0;
    if (s.shotsRemaining > 0 && newGameTime >= s.nextShotAt) {
      fireShot(phantom, bcx, bcy, sfx);
      s.shotsRemaining -= 1;
      s.nextShotAt = newGameTime + GP_T.shot.gapMs;
      patch.lastRangedShotAt = newGameTime; // 描画専用の合図(構え・反動)
    }
    if (s.shotsRemaining <= 0 && newGameTime >= until) {
      toRecover('gp-shot-recover', GP_T.shot.recover, newGameTime, patch);
    }
    applyPatch(phantom.id, patch);
    return;
  }
  if (stNow2 === 'gp-shot-recover') {
    patch.vx = 0; patch.vy = 0;
    if (newGameTime >= until) toChase(s, newGameTime, patch);
    applyPatch(phantom.id, patch);
    return;
  }

  // ---- 一閃 gp-issen ------------------------------------------------------------------------------
  if (stNow2 === 'gp-issen-windup') {
    patch.vx = 0; patch.vy = 0;
    if (newGameTime >= until) {
      // 踏み込みの起点と向きをこのフレームで焼き付ける(以後は追尾しない=赤ライン=判定の掟)。
      const dl = Math.max(0.001, Math.hypot(tx - fx, ty - fy));
      s.issenX0 = phantom.x; s.issenY0 = phantom.y;
      s.issenUx = (tx - fx) / dl; s.issenUy = (ty - fy) / dl;
      s.issenHitFired = false;
      patch.bossState = 'gp-issen-active';
      patch.bossStateUntil = newGameTime + GP_T.issen.active;
    }
    applyPatch(phantom.id, patch);
    return;
  }
  if (stNow2 === 'gp-issen-active') {
    if (!s.issenHitFired) {
      s.issenHitFired = true;
      // 判定はライン全体に1回(赤ラインの見た目=判定)。踏み込みで通り抜ける帯そのもの。
      hitCapsule(phantom, fx, fy, tx, ty, GP_T.issen.halfWidth, GP_T.issen.damage, { distPx: 120, ms: 220 });
      sfx.fire();
    }
    // 慣性(MUST): 加速→減速のイーズで線上を進む(等速で始まって瞬間停止しない)。
    const t01 = 1 - Math.max(0, Math.min(1, (until - newGameTime) / GP_T.issen.active));
    const off = phantomIssenOffsetPx(t01);
    const c = resolveMove(s.issenX0 + s.issenUx * off, s.issenY0 + s.issenUy * off, phantom);
    patch.x = c.x; patch.y = c.y;
    patch.vx = s.issenUx * phantom.speed; patch.vy = s.issenUy * phantom.speed;
    if (newGameTime >= until) toRecover('gp-issen-recover', GP_T.issen.recover, newGameTime, patch);
    applyPatch(phantom.id, patch);
    return;
  }
  if (stNow2 === 'gp-issen-recover') {
    patch.vx = 0; patch.vy = 0;
    if (newGameTime >= until) toChase(s, newGameTime, patch);
    applyPatch(phantom.id, patch);
    return;
  }

  // 未知の州(将来の追加漏れ)は中立へ戻す=固まったまま残さない。
  toChase(s, newGameTime, patch);
  applyPatch(phantom.id, patch);
};

/** 盤面から幻影を1体拾う(pickActiveBounty と同じ作法・通常運用は同時1体)。 */
export const pickActivePhantom = (enemies: readonly Enemy[]): Enemy | undefined =>
  enemies.find(e => e.type === GUARDIAN_PHANTOM_TYPE);

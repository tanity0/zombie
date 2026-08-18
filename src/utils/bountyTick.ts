// PACING_PUZZLE.md §6.38「BOUNTY」B1(+B1.5修正バッチ)+B2a(バス停/馬乗りの技): 賞金首(バス停/馬乗り/
// 鋏/舞妓・変異)のコントローラ骨格。idolTick.ts を手本にした純関数群+専用コントローラ(useGameLoop.ts
// から天使コントローラと同位置で呼ぶ)。鋏/舞妓の技はB2bで追加する。
//
// レンダラ非依存・store書き込みはidolTick/angelBossTickと同じ「stateを読んでpatchをsetState」流儀。
// 掟(CLAUDE.md「Y方向に何かを動かす時の必須チェック」): 移動は必ず①障害物衝突(resolveBountyMove・
// B1.5-4)→②clampRectToPlayableAreaの順で通す。気絶・拘束・浮き・ノックバック中は移動も状態進行も
// 一切止める(isFrozen・B1.5-2・idolTick.ts:228/236と同型のガード)。
//
// §6.38 B2規約(受け入れ条件・共通):
//  - 予兆同期(v6 C-1): 抽選したwindupは必ずbossStateUntilへ書き、描画はtelegraphProgress01で
//    状態から導出する。*_VISの複製定数は作らない。
//  - カウンター成立=技中断+chase復帰(v3128の掟)。輸入技(レーザー/懲罰狙撃/突進)は見た目・予告・
//    タイミングを本物と完全同一(数値のみ弱体化可)にし、既存関数(mimirLaserTrack/idolScriptの値・
//    werewolf定数)を複製して使う(=誤学習防止。複製である旨は各定数のコメントに明記)。
//  - ★v0.25.3558: 数値は bountyScript.ts の可変テーブル(BR_T/BM_T/BB_T/MK_T)へ移した。werewolf/
//    pumpkin 由来の値は**テーブル側で複製**し、実体との一致を bountyScript.test.ts が機械検査する。
import type { Enemy, EnemyType } from '../types/game';
import {
  useGameStore, HUNTER_LEAVE_FADE_MS, resolveBountyMove,
  counterReplyDamage, skillLevel, BOSS_CRIT_DAMAGE_MULT, counterMasterAwakenBuffPatch,
  COUNTER_HITSTOP_MS, COUNTER_SHAKE_MS, COUNTER_SHAKE_MAG, COUNTER_ZOOM_MAG,
  MELEE_FINISH_SLOW_MS, MELEE_FINISH_SLOW_HOLD_MS, knockbackSpeedFor, enemyDeathLabel,
  bossSlowMult,
} from '../store/gameStore';
// ★予告寸法は依存ゼロの葉(bountyDims.ts)が正=ここでは使うだけ+従来の消費者(pixiScene/テスト)の
// ために named re-export する。gameStoreから直接importしない理由はbountyDims.ts冒頭を読むこと
// (循環import起動全損 v0.25.3390 の再発防止)。
import { BOUNTY_BASE_HP } from './bountyDims';
export { BOUNTY_BASE_HP };
// ★v0.25.3558(ボスメーカー横展開・第1弾): 賞金首4種の**数値はbountyScript.tsの可変テーブルが正**
// (BOSS_MAKER.md §2-2「台本はコード / 数字はテーブル」)。ロジックはここ、数字は向こう。
// 判定(ここ/levelUpGate)と描画(pixiScene)は**同じテーブルの同じ場所**を読む=寸法の食い違いが原理的に無い。
import {
  BOUNTY_RANGED_TUNING as BR_T, BOUNTY_MELEE_TUNING as BM_T,
  BOUNTY_BALANCE_TUNING as BB_T, BOUNTY_MAIKO_TUNING as MK_T,
} from './bountyScript';
// §6.38 v12「バス停の新技『三段突き』」(社長裁定2026-08-15): 3本の角度・タイミングは判定/描画が
// 同じ純関数から導く(bountyTriple.ts=依存ゼロの葉。bountyDims.tsと同じ循環import防止の流儀)。
import {
  BR_TRIPLE_MIN, BR_TRIPLE_MAX, BR_TRIPLE_CD_MS, BR_TRIPLE_WINDUP_MS,
  BR_ROLL_DIST, BR_ROLL_MS, brRollEase,
  BR_TRIPLE_REACH, BR_TRIPLE_HALF_WIDTH, BR_TRIPLE_STEP, BR_TRIPLE_DAMAGE,
  BR_TRIPLE_SPREAD_RAD, BR_TRIPLE_THRUST_MS, BR_TRIPLE_RETURN_MS, BR_TRIPLE_GAP_MS,
  BR_TRIPLE_STEP_MS, BR_TRIPLE_LAST_STEP_MS, BR_TRIPLE_ACTIVE_MS,
  BR_TRIPLE_APPROACH_SPEED_MULT, BR_TRIPLE_APPROACH_STOP_DIST,
  BR_TRIPLE_APPROACH_RAMP_MS, BR_TRIPLE_APPROACH_SLOW_RADIUS,
  brTripleAngles, brTripleStepDurationMs, brTripleLungeEase01,
  brTripleApproachAccelMult, brTripleApproachDecelMult,
} from './bountyTriple';
export {
  BR_TRIPLE_MIN, BR_TRIPLE_MAX, BR_TRIPLE_CD_MS, BR_TRIPLE_WINDUP_MS,
  BR_TRIPLE_REACH, BR_TRIPLE_HALF_WIDTH, BR_TRIPLE_STEP, BR_TRIPLE_DAMAGE,
  BR_TRIPLE_SPREAD_RAD, BR_TRIPLE_THRUST_MS, BR_TRIPLE_RETURN_MS, BR_TRIPLE_GAP_MS,
  BR_TRIPLE_STEP_MS, BR_TRIPLE_LAST_STEP_MS, BR_TRIPLE_ACTIVE_MS,
  BR_TRIPLE_APPROACH_SPEED_MULT, BR_TRIPLE_APPROACH_STOP_DIST,
  BR_TRIPLE_APPROACH_RAMP_MS, BR_TRIPLE_APPROACH_SLOW_RADIUS,
  brTripleAngles, brTripleStepDurationMs, brTripleLungeEase01,
  brTripleApproachAccelMult, brTripleApproachDecelMult,
};
// §6.38 v10「バス停の中立射撃に緩急」: 型3種(burst/fan/charge)のサイクル抽選・間隔・弾数の計算は
// bountyShots.ts(依存ゼロの葉)へ一本化。tickRangedはここの関数を呼ぶだけ(#10)。
import {
  pickBrShotPattern, brShotCount, brCycleDurationMs,
  brChargeWindupSpeedMult, brChargeRecoverSpeedMult,
  BR_SHOT_UNIT_MS, BR_BURST_INTERVAL_MS, BR_FAN_ANGLE_OFFSETS_DEG,
  BR_CHARGE_WINDUP_MS, BR_CHARGE_RECOVER_MS, BR_CHARGE_SPEED_MULT,
  type BrShotPattern,
} from './bountyShots';
// #11改名(旧BR_SHOT_INTERVAL_MS): pixiScene側は§6.38 v10 #6の撤去でこの定数を使わなくなったため
// re-exportは行わない(消費者が居ないまま残すと「どこで使われているか」が追いにくくなる)。
export { BR_SHOT_UNIT_MS };
import { clampRectToPlayableArea, type PlayableAreaCtx } from '../world/playableArea';
import { isBountyType, createEnemyProjectile, spawnEnemyAt } from './enemyUtils';
import { EVENT_BANNER_MS } from './directorTick';
// §6.38 B4(クリーンアップ): 実効難易度倍率の式はbountyValue.ts(依存=enemyUtils+timeDifficultyのみの
// 葉)へ一本化した。ここはnamed re-exportだけ残す(既存の消費者=gameStore.ts/テストを壊さないため)。
import { bountyEffectiveValueMult } from './bountyValue';
export { bountyEffectiveValueMult };
import {
  bossLeashDistancePx, advanceBossDisengageGrace,
  BOSS_LEASH_REGEN_PER_SEC, BOSS_LEASH_RETURN_SPEED_MULT,
} from './bossEngagement';
import { advanceLingerMs } from './bossSkeleton';
import { isCounterablePhase, phaseJustChanged } from './bossScript';
// §6.38 B2b: distToSegmentはgeometry.ts(依存ゼロ)から直接import(levelUpGate.ts経由をやめた)。
// levelUpGate.tsが賞金首の技の実寸法をbountyTick.tsからimportする際、逆import(循環)を作らないため。
import { distToBandRect } from './geometry';
// v0.25.3517: 近距離の技選択(押しのけ1本道の解消)。重み・CDは bountyShots.ts が唯一の出どころ。
import { pickBrCloseMove, BR_PUSH_CD_MS } from './bountyShots';
import { GAME_SPEED } from '../config/gameSpeed';
import { rectsOverlap } from '../world/obstacles';
import { notifyCounterHit, notifyMoveCounter } from './playerTraits';
import { recordCritHit } from './botTelemetry'; // PACING_PUZZLE.md §7-11c(4): クリ計測口(計測専用・挙動不変)
import { refundCounterCooldown } from './counterMaster';
import { getActiveGun } from './weaponUtils';
import { GLOW_R_L } from './glowTiers';
// §4②輸入=ミーミル型レーザー: mimirLaserTrack.tsの純関数をそのまま使う(複製しない=誤学習防止)。
import {
  mimirLaserPhase, stepLaserAim, mimirLaserTrackCaps, MIMIR_LASER_HALF_WIDTH,
  MIMIR_LASER_RANGE, MIMIR_LASER_FIRE_MS,
  MIMIR_LASER_WINDUP_MS as BR_LASER_WINDUP_MS,
} from './mimirLaserTrack';

// §3/v2 F項(実効難易度倍率の唯一の出どころ): 式の本体はbountyValue.ts(B4で一本化・上でimport&
// re-export済み)。CONSTANT_STRENGTH_TYPES(=fixed)なのでbuildEnemy自体は倍率を掛けない(色/距離/
// 時間で自動スケールしない型のため)。呼び出し側がスポーン後パッチ/pickup生成時に明示的に掛ける。

/** §3「HP: 基準2000(叩き台)×スポーン時の実効難易度倍率」。 */
export const bountyMaxHealth = (area: number, gameTimeMs: number): number =>
  Math.round(BOUNTY_BASE_HP * bountyEffectiveValueMult(area, gameTimeMs));

/** 滞在1分(§2)。dormantのまま(=交戦していない)これだけ経つと退場する。gameTime基準(ポーズで進まない)。 */
export const BOUNTY_LINGER_MS = 60000;
/** 交戦の定義(v6 B「純関数化」)のうち「直近○秒以内に被弾」の窓。壁時計(enemy.lastHit=Date.now()基準)。 */
export const BOUNTY_HIT_ENGAGE_MS = 3000;
/** §6.38 B1.5-7: 手写しをやめEVENT_BANNER_MS(directorTick.ts)を直接参照する(値の出どころを1つに保つ)。
 * B1.5-5: 出現バナー「賞金首出現」はスポーン時(useGameLoop.ts)へ移設=ここでは退場バナーだけが使う。 */
export const BOUNTY_DEPART_BANNER_MS = EVENT_BANNER_MS;
/** 退場フェード+「賞金首は去った」通知の長さ。ハンター立ち去りの既存値を流用(値の出どころを1つに保つ)。 */
export const BOUNTY_DEPART_FADE_MS = HUNTER_LEAVE_FADE_MS;
/** dormant起床の索敵範囲の既定値(叩き台)。= useGameLoop.ts の GIANT_AGGRO_RANGE(380)を流用(§2)。
 * スポーン側が `aggroRange` を明示設定する前提で、ここは未設定時のみのフォールバック。 */
export const BOUNTY_AGGRO_RANGE_DEFAULT = 380;
/** 帰巣「到達した」とみなす残距離(px)。giantbatの帰巣スナップ閾値(gameStore.ts)と同値。 */
const ARRIVE_EPS_PX = 2;

/**
 * 「交戦中」かどうか(§2「dormant=false かつ(距離<リーシュ半径 or 直近3秒以内に被弾)」・純関数)。
 * 距離コンポーネントはリーシュ半径そのもの(bossLeashDistancePx)——ズーム換算しない実距離固定
 * (bossEngagement.tsの裁定をそのまま踏襲。専用の別半径を発明しない)。
 */
export interface BountyEngagedSignals { dormant: boolean; distance: number; msSinceHit: number }
export const bountyEngagedNow = (sig: BountyEngagedSignals, leashRadiusPx: number): boolean =>
  !sig.dormant && (sig.distance < leashRadiusPx || sig.msSinceHit <= BOUNTY_HIT_ENGAGE_MS);

/**
 * §6.38 v6 A-2(B4配線): useGameLoop.tsの3系統(囲い/レスキュー・紅き夜・叫喚)が賞金首の交戦中に
 * 割り込まないためのゲート。pickActiveBounty+bountyEngagedNowをそのまま束ねただけ(判定を複製しない)。
 * 賞金首が居ない/dormantなら false(=他イベントを妨げない)。
 */
export const anyBountyEngaged = (
  enemies: readonly Enemy[],
  player: { x: number; y: number; width: number; height: number },
  nowMs: number,
): boolean => {
  const bounty = pickActiveBounty(enemies);
  if (!bounty) return false;
  const bcx = bounty.x + bounty.width / 2, bcy = bounty.y + bounty.height / 2;
  const pcx = player.x + player.width / 2, pcy = player.y + player.height / 2;
  const dist = Math.hypot(bcx - pcx, bcy - pcy);
  const leashRadius = bossLeashDistancePx(bounty.type, false);
  return bountyEngagedNow({ dormant: !!bounty.dormant, distance: dist, msSinceHit: nowMs - bounty.lastHit }, leashRadius);
};

/**
 * 滞在1分が満了したか(gameTime基準)。`lastEngagedAt` 未設定ならスポーン時刻(`spawnedAt`)を起点にする
 * (一度も交戦しないまま1分経てば去る=§2の「1分で会わずにいると去る」)。
 */
export const bountyLingerExpired = (
  gameTime: number, lastEngagedAt: number | undefined, spawnedAt: number | undefined,
): boolean => gameTime - (lastEngagedAt ?? spawnedAt ?? gameTime) >= BOUNTY_LINGER_MS;

/**
 * いま制御すべき賞金首1体を選ぶ(pickActiveIdolと同じ作法)。起きている個体を最優先し、
 * 休眠しかいなければ先頭の1体を返す(通常運用は同時1体なので実質どちらか一方しか居ない)。
 */
export const pickActiveBounty = (enemies: readonly Enemy[]): Enemy | undefined => {
  let dormantOne: Enemy | undefined;
  for (const e of enemies) {
    if (!isBountyType(e.type)) continue;
    if (!e.dormant) return e;
    dormantOne ??= e;
  }
  return dormantOne;
};

const applyPatch = (id: string, patch: Partial<Enemy>): void => {
  if (Object.keys(patch).length === 0) return;
  useGameStore.setState(stt => ({ enemies: stt.enemies.map(e => (e.id === id ? { ...e, ...patch } : e)) }));
};

/**
 * 希望移動量(nx,ny)を「実際に立てる場所」へ解決する。§6.38 B1.5-4(重要・致命級ではないが必須):
 * ①障害物衝突(木/建物/城/街プロップ/病院/武器庫/警察署=resolveBountyMove。城ボスと同じ「当たる」側。
 *   判定はstore側=CLAUDE.md「判定はworld/store側に置く」掟) → ②行ける帯クランプ
 *   (clampRectToPlayableArea・CLAUDE.md「Y方向に何かを動かす時の必須チェック」)、の順で通す。
 */
const resolveMove = (nx: number, ny: number, e: Enemy): { x: number; y: number } => {
  const collided = resolveBountyMove(nx, ny, { width: e.width, height: e.height });
  const st0 = useGameStore.getState();
  const ctx: PlayableAreaCtx = {
    farBackdrop: st0.farBackdrop,
    labTheme: st0.stageTheme === 'lab' && !st0.indoorMode,
    corridorMode: st0.corridorMode,
    m0AdvanceLimitX: st0.m0AdvanceLimitX,
    corridorRunInActive: st0.corridorRunInActive,
  };
  return clampRectToPlayableArea(collided.x, collided.y, e.width, e.height, ctx);
};

/**
 * 気絶・拘束・浮き・ノックバックのいずれかが有効か(§6.38 B1.5-2・致命)。
 * idolTick.ts:228/236の教訓(v0.25.2895)と同型のガード——他の全ボス(裏ボス/天使/idol)は
 * このいずれかの間、移動・状態進行を止めている。bountyTickだけこれを持たず「紫にしても歩き続ける」
 * 実バグになっていた。**体勢崩し→フィニッシュの正規ルート**が通るために必須。
 * bossFullStunUntil/stunUntil/rootUntilはgameTime基準、liftUntil/knockbackUntilはDate.now基準
 * (types/game.tsの既存注記+gameStore.tsの設定箇所に倣う)。
 *
 * §6.38 v7(社長裁定「isBossTypeへフル編入=城ボス式時計に一本化」)後の注記: 賞金首がisBossType編入
 * された結果、通常のクリティカルはもう`stunUntil`(5秒完全気絶)を打たない(usesBossCritが
 * trueになり、gameStore側がbossSlowUntil=移動半減の窓を渡すだけに切り替わる。半減の消化は下の
 * movement各所のbossSlowMult呼び出しが担う=isFrozenの対象外)。よって`stunUntil`が実際に立つのは
 * ①体勢ブレイク(紫・bossFullStunUntilと同時に打たれる)②applyBrokenMeleeFatalの致命後2秒ダゼ
 * (bossFullStunUntilは無いままstunUntilだけ短時間立つ=BOSS_FATAL_DAZE_MS)の2パターンのみになり、
 * どちらも「城ボスと同じ気絶時計」——これが「boss式時計だけ見る形へ簡素化」の実体で、コード自体
 * (5つのORの構造)は変えていない(①②とも既にbossFullStunUntil/stunUntilの2フィールドで表現できて
 * おり、②のためにstunUntilの個別チェックは引き続き必要=削ると致命ダゼ中に動いてしまう)。
 */
const isFrozen = (bounty: Enemy, newGameTime: number, nowMs: number): boolean =>
  (bounty.bossFullStunUntil !== undefined && newGameTime < bounty.bossFullStunUntil)
  || (bounty.stunUntil !== undefined && newGameTime < bounty.stunUntil)
  || (bounty.rootUntil !== undefined && newGameTime < bounty.rootUntil)
  || (bounty.liftUntil !== undefined && nowMs < bounty.liftUntil)
  || (bounty.knockbackUntil !== undefined && nowMs < bounty.knockbackUntil);

// =================================================================================================
// §6.38 B2a: 技(バス停=bounty-ranged / 馬乗り=bounty-melee)。鋏/舞妓はB2b。
// =================================================================================================

/** useGameLoop.tsが持つ音の注入口(idolTick.IdolSfxと同型・headlessではaudioManagerをimportしない)。 */
export interface BountySfx {
  /** 予兆SE(全技共通=hunter-alert流用・§6.26-9 #5と同じ作法)。 */
  alert: () => void;
  /** レーザー発射等、windup明けの一撃SE。 */
  fire: () => void;
  counter: (gain?: number) => void;
  reward: (gain?: number) => void;
}
export const NOOP_BOUNTY_SFX: BountySfx = { alert: () => {}, fire: () => {}, counter: () => {}, reward: () => {} };

/** ラン単位の状態(useGameLoopがラン開始時に作り直す・idolTick.IdolTickStateと同じ流儀)。 */
export interface BountyTickState {
  activeId: string | null; // 直前tickで制御していた個体id(切り替わったら下の全カウンタをリセット)
  aimVX: number; aimVY: number; // バス停レーザーの照準速度(mimirLaserTrack.stepLaserAimの持ち越し)
  farMs: number;   // 馬乗り: 遠距離に居続けた時間(懲罰狙撃の起点。bossSkeleton.advanceLingerMs式)
  comboStep: 0 | 1 | 2 | 3; // 馬乗り: 3段コンボの進行(0=未着手)
  escortsSummoned: boolean; // バス停: 取り巻き召喚済みか(交戦1回につき1度・再召喚なし)
  // §6.38 B2b: 舞妓(水鳥乱舞のホップ管理・接触判定はホップ間隔中に無いためbountyTick側の
  // 純スカラー状態で足りる=Enemyフィールドを増やさない)。
  suiuHopIdx: 0 | 1 | 2 | 3; // 現在ホップ(0=未開始)
  suiuTx: number; suiuTy: number; // 現ホップの着地点(playerPos+抽選オフセット・clamp済み)
  // §6.38 v10: バス停(bounty-ranged)の中立射撃サイクル(型3種=burst/fan/charge・#10「activeIdで
  // 切り替える単一の共有状態」)。「溜め中フラグ」はbrPattern==='charge'&&brShotsRemaining>0から
  // 導出する(windup/recoverの境界が連続する=別フラグを持たなくても矛盾しないため)。
  brPattern: BrShotPattern | null;      // 残弾: 現在のサイクルの型(未開始/次サイクル待ち=null)
  brPrevPattern: BrShotPattern | null;  // 直前の型(#2「直前と同じ型は引かない」用)
  brShotsRemaining: number;             // 残弾: このサイクルで未発射の弾数
  brCycleEndAt: number;                 // 次弾時刻: 次サイクル1発目の発射予定時刻(gameTime基準・#3)
  // §6.38 v11: 舞妓「毬回し」の踏み込み(社長裁定「案Aで」)。実行開始時の足元と向きを焼き付け、
  // 実行中はそこからの**イーズ距離**で位置を決める(等速移動・瞬間停止を作らないため)。
  spinKey: number; spinX0: number; spinY0: number; spinUx: number; spinUy: number;
  whip360Hit: boolean; // 馬乗り: 360度ムチ振りは1回の振りで1度だけ当てる(多段防止)
  // §6.38 v12(バス停「三段突き」・社長裁定2026-08-15): クールダウン(6000ms)は**BountyTickState側で
  // 管理**する(社長裁定「置き場所はBountyTickState・activeId切替で消えてよい」)。gameTime基準・
  // 初期値0=初回は即撃てる。
  tripleReadyAt: number;
  // v0.25.3517(社長指示「近接も重み変えて」): 押しのけにもCDを持たせる(旧はCDなし=密着すると
  // 押しのけしか返ってこない1本道だった)。gameTime基準・初期値0=初回は即出せる。
  pushReadyAt: number;
  // 現在の段(br-triple-1/2/3)が始まった gameTime(命中判定=突き出しの末尾90msの計測起点)。
  tripleStepStartAt: number;
  // 現在の段で既に命中判定(hitCapsule)を1回積んだか(多段防止)。
  tripleHitFired: boolean;
  // 踏み込み(3段を通した1つの弧=加速→減速)の起点・向き・開始時刻(mk-spinの
  // spinX0/spinY0/spinUx/spinUyと同型)。br-triple-windupが明けた1フレームで焼き付ける。
  tripleLungeX0: number; tripleLungeY0: number; tripleLungeUx: number; tripleLungeUy: number;
  tripleLungeStartAt: number;
  // ★v0.25.3564(社長裁定「(三段突きの)その後前に追尾してくるの無し。逃げれない」): 溜め中の接近が
  // 狙う**固定目標**(windup開始フレームのプレイヤー位置のスナップショット)。キーはwindupの開始時刻。
  tripleApproachKey: number;
  tripleApproachTx: number; tripleApproachTy: number;
}
export const createBountyTickState = (): BountyTickState => ({
  activeId: null, aimVX: 0, aimVY: 0, farMs: 0, comboStep: 0, escortsSummoned: false,
  suiuHopIdx: 0, suiuTx: 0, suiuTy: 0,
  brPattern: null, brPrevPattern: null, brShotsRemaining: 0, brCycleEndAt: 0,
  spinKey: 0, spinX0: 0, spinY0: 0, spinUx: 0, spinUy: 0, whip360Hit: false,
  tripleReadyAt: 0, pushReadyAt: 0, tripleStepStartAt: 0, tripleHitFired: false,
  tripleApproachKey: 0, tripleApproachTx: 0, tripleApproachTy: 0,
  tripleLungeX0: 0, tripleLungeY0: 0, tripleLungeUx: 0, tripleLungeUy: 0, tripleLungeStartAt: 0,
});
const resetBountyRunState = (s: BountyTickState): void => {
  s.aimVX = 0; s.aimVY = 0; s.farMs = 0; s.comboStep = 0; s.escortsSummoned = false;
  s.suiuHopIdx = 0; s.suiuTx = 0; s.suiuTy = 0;
  s.spinKey = 0; s.spinX0 = 0; s.spinY0 = 0; s.spinUx = 0; s.spinUy = 0; s.whip360Hit = false;
  // §6.38 v12: activeId切替(=別個体を制御し直す)ではCDも含めて消えてよい(社長裁定)。
  s.tripleReadyAt = 0; s.pushReadyAt = 0; s.tripleStepStartAt = 0; s.tripleHitFired = false;
  s.tripleLungeX0 = 0; s.tripleLungeY0 = 0; s.tripleLungeUx = 0; s.tripleLungeUy = 0; s.tripleLungeStartAt = 0;
  resetBrShotCycle(s);
};
/**
 * §6.38 v10 #7: 割り込み(押しのけ/レーザー/laser-broken/フルスタン/カウンター/リーシュ帰巣)で
 * chaseへ戻る/dormant化する際にバス停の射撃サイクルをクリアする。残弾・直前の型・サイクル終了時刻を
 * 捨てることで、次の中立ではまっさらな抽選から始まる(持ち越しなし)。
 * ※isFrozen(気絶/拘束/浮き/ノックバック)の解除はここに含まない——次弾時刻の再アンカーだけで足り、
 * 進行中のサイクル自体(型・残弾)まで捨てる必要は無い(runBountyTickのisFrozen分岐側で個別対応)。
 */
const resetBrShotCycle = (s: BountyTickState): void => {
  s.brPattern = null;
  s.brPrevPattern = null;
  s.brShotsRemaining = 0;
  s.brCycleEndAt = 0;
};

/**
 * 進行中の技を中断してchaseへ戻す時の個体一時状態リセット(社長確定指示v0.25.3476
 * 「ノックバックしたら技は中断」=方針1採用)。フルスタン(紫)と、気絶/拘束/浮き/ノックバック
 * (isFrozen)の両方から呼ぶ——**どちらも「止められたら技を続けない」の同じ扱いに揃える**
 * (旧実装はisFrozen側だけサイクルを持ち越していたが、それをやめる)。
 * 溜め・残段・焼き付けたサイクル状態(バス停の射撃サイクル/馬乗りの3段コンボ/馬乗りの360度
 * ムチ振り単発フラグ/舞妓の毬回し踏み込みの焼き付け)だけを捨てる。escortsSummoned等の
 * 「1回だけ」フラグや aimVX/farMs/suiuHopIdx 等の間合い管理はここでは触らない
 * (resetBountyRunStateより狭い=dormant/リーシュ帰巣専用のフルリセットとは別物)。
 */
const cancelBountyTechnique = (s: BountyTickState): void => {
  s.comboStep = 0;
  s.spinKey = 0; s.spinX0 = 0; s.spinY0 = 0; s.spinUx = 0; s.spinUy = 0;
  s.whip360Hit = false;
  // §6.38 v12「中断: ノックバック等で止められたら技を中断して残段を出さない」(v0.25.3477の作法どおり)。
  // ★CD(tripleReadyAt)はここでは触らない=選択時に既に課金済み(中断で得しない・連発防止を保つ)。
  s.tripleStepStartAt = 0; s.tripleHitFired = false;
  s.tripleLungeX0 = 0; s.tripleLungeY0 = 0; s.tripleLungeUx = 0; s.tripleLungeUy = 0; s.tripleLungeStartAt = 0;
  resetBrShotCycle(s);
};

// ---- カウンター(全4体で共通の1本。W7=windup中/硬直中の接触=可) --------------------------------
// レーザー('laser-*')はここに含めない: v0.25.2961裁定どおり紫=カウンター不可(近接中断は
// mimirLaserBreakOnMeleeHitが別枠で処理する専用の「弱点を突いて壊す」機構=標準カウンターとは別物)。
const BOUNTY_WINDUP_STATES: readonly string[] = [
  'br-push-windup', 'bm-charge-windup', 'bm-whip360-windup', 'bm-combo1-windup', 'bm-combo2-windup', 'bm-combo3-windup', 'bm-snipe-windup',
  'bb-sweep-windup', 'leap-windup',
  'mk-naginata-windup', 'mk-naginata1-windup', 'mk-naginata2-windup', 'mk-spin-windup', 'mk-suiu-windup', 'mk-boom-windup',
  'br-triple-windup', // §6.38 v12(社長裁定#9「溜め/硬直はカウンター可=既存の押しのけと同じ扱い」)
];
// ★v0.25.3571(社長報告「馬乗りの360度と突進、カウンターできない気がする」): 実行中(active)にも
// カウンターを開く技のリスト。従来の掟W7は「windup/硬直の接触=可」で、**突進の走り(bm-charge)と
// 360度の振り(bm-whip360)は対象外**だった——werewolfの突進(aiPhase 'charge')が実行中でも弾けるのと
// 非対称で、体感「カウンターできない」の正体。加えて360系は**赤円の中なら体が触れていなくても弾ける**
// (下の counterReachFor。城ボスの着地円=「赤い予告の中でだけ成立」v0.25.2601 と同じ文法)。
const BOUNTY_ACTIVE_COUNTER_STATES: readonly string[] = ['bm-charge', 'bm-whip360'];

const BOUNTY_RECOVER_STATES: readonly string[] = [
  'br-push-recover', 'bm-charge-recover', 'bm-combo1-recover', 'bm-combo2-recover', 'bm-combo3-recover', 'bm-snipe-recover',
  'bb-sweep-recover', 'leap-recover',
  'mk-naginata-recover', 'mk-naginata1-recover', 'mk-naginata2-recover', 'mk-spin-recover', 'mk-suiu-recover', 'mk-boom-recover',
  'br-triple-recover', // §6.38 v12(同上)
];

/** カウンター成立の演出(idolTick.ts/angelBossTick.tsのcounterHit/angelCounterHitと同型)。 */
const bountyCounterHit = (bounty: Enemy, hx: number, hy: number, sfx: BountySfx): void => {
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
  g2.damageEnemy(bounty.id, dmg, false, true, false, 'other', 'player', 'counter');
  // §7-11c(4): カウンター反撃(確定クリ)。賞金首は isBossType 非登録(§6.38裁定)=対雑魚扱いで計上。
  recordCritHit('guaranteed', false);
  g2.spawnDamageNumber(bounty.x + bounty.width / 2, bounty.y, dmg, true);
  sfx.reward();
  g2.spawnRing(hx, hy, 8, 46, 'rgba(253,224,71,0.95)', 3, 300);
  g2.spawnBurst(hx, hy, '#fde047', 10);
  g2.spawnGlow(hx, hy, 34, 'rgba(253,224,71,', 240);
};

// ---- バス停(bounty-ranged) -----------------------------------------------------------------------
// 距離帯・押しのけ・弾・レーザーのダメージ/硬直/CD・取り巻き人数は **BR_T(bountyScript.ts)** が正。
// 通常のポツポツ撃ち(§7-12「銃弾以外」の除外=予兆不要。共通弾)。§6.38 v10で型3種のサイクル抽選へ
// 差し替え(BR_SHOT_UNIT_MS=旧BR_SHOT_INTERVAL_MSの改名・bountyShots.tsからimport&re-export済み)。
// 旧BR_SHOT_RECOIL_VIS_MSは撤去(§6.38 v10 #6): pixiSceneの残心逆算ブロックが唯一の消費者で、
// そのブロック自体が「後勝ちで一度も画面に出ていない」死んだコードだったため、ブロックごと削除した。
// 反動の描画はlastRangedShotAt基準の既存ブロック(pixiScene側)に統一する。
//
// ★輸入=ミーミル型レーザー(§4②)の**寸法・溜め・発射時間はテーブル化しない**。描画がミーミルと
// 同じ経路(mimirLaserTrack由来の値)を読むため、ここだけ可変にすると「赤いのに当たらない」になる。
// バス停専用のダメージ/硬直/CDだけが BR_T.laser にある(=弱体化は数値、寸法は本物と完全同一)。
export const BR_LASER_RANGE = MIMIR_LASER_RANGE;
export const BR_LASER_HALFWIDTH = MIMIR_LASER_HALF_WIDTH;
export const BR_LASER_FIRE_MS = MIMIR_LASER_FIRE_MS;
// 取り巻き召喚(§4①②・ニアール型=交戦開始1回だけ・再召喚なし・fromEventは立てない=B1.5-3と同じ理由)。
// 人数は BR_T.escort.count。型(zombie)は数値ではないのでテーブルには載せない。
const BR_ESCORT_TYPE: EnemyType = 'zombie';

// ---- 馬乗り(bounty-melee) -------------------------------------------------------------------------
// 距離帯・突進・360度ムチ・3段コンボ・懲罰狙撃の数値は **BM_T(bountyScript.ts)** が正
// (突進=werewolf輸入 / 狙撃=idol snipe輸入。その旨と公平の物差しの検算もテーブル側に書いてある)。
/** 次の行動抽選までの中立時間(idolのIDOL_TUNING.neutral相当の叩き台)。 */
const BOUNTY_NEUTRAL_MS = 350;

/** 帯(カプセル)の当たり判定を1件積む(idolTick.hitCapsuleと同型・技ごとにダメージ/KBを持つ)。 */
const hitCapsule = (
  bounty: Enemy, fx: number, fy: number, tx: number, ty: number, halfW: number, damage: number,
  knockback?: { distPx: number; ms: number },
): void => {
  useGameStore.setState(state => ({
    pumpkinBlasts: [...state.pumpkinBlasts, {
      x: (fx + tx) / 2, y: (fy + ty) / 2, radius: halfW, damage, enemyId: bounty.id,
      capsule: { fx, fy, tx, ty, halfWidth: halfW },
      ...(knockback ? { kbSpeed: knockbackSpeedFor(knockback.distPx, knockback.ms), kbMs: knockback.ms } : {}),
    }],
  }));
};

/** バス停の取り巻き2体を賞金首の近くへ召喚する(交戦開始1回だけ・再召喚なし・fromEventは立てない)。 */
const summonBountyEscorts = (bounty: Enemy, newGameTime: number): void => {
  const escorts: Enemy[] = [];
  for (let i = 0; i < BR_T.escort.count; i++) {
    const ang = (Math.PI * 2 * i) / BR_T.escort.count + Math.random() * 0.4;
    const ex = bounty.x + bounty.width / 2 + Math.cos(ang) * 70;
    const ey = bounty.y + bounty.height / 2 + Math.sin(ang) * 70;
    const e = spawnEnemyAt(BR_ESCORT_TYPE, ex - 16, ey - 16, newGameTime);
    e.bountyEscortId = bounty.id;
    escorts.push(e);
  }
  useGameStore.setState(st => ({ enemies: [...st.enemies, ...escorts] }));
};

/** 賞金首の退場・討伐に合わせて取り巻きも一緒に片付ける(§4②・B-4「削られた個体の再出現はなし」と対)。 */
const clearBountyEscorts = (bountyId: string): void => {
  useGameStore.setState(st => ({ enemies: st.enemies.filter(e => e.bountyEscortId !== bountyId) }));
};

// =================================================================================================
// ★v0.25.3563: 「技を始める」遷移だけを切り出した束(begin*)。
//
// **通常の抽選(各tickのchase分岐)と、ボスメーカーの▸個別再生が、必ずこの同じ1本を通る。**
// 遷移コードを2箇所に書くと、片方だけ直して「メーカーでは出るのに実戦で出ない(逆も)」が静かに起きる
// ——だから写さずに共通化する。**条件(距離帯・CD・重みの抽選)は呼び出し側(chase分岐)に残す**。
// ここは「選ばれた技を始める」だけを担う=個別再生は条件をバイパスして直接ここを叩ける。
// =================================================================================================
/** begin* の引数束(tick関数が持っている値をそのまま渡す。patchは参照=書き込みがそのまま届く)。 */
interface BountyBeginCtx {
  bounty: Enemy;
  s: BountyTickState;
  newGameTime: number;
  dist: number;
  pcx: number; pcy: number;
  bcx: number; bcy: number;
  sfx: BountySfx;
  patch: Partial<Enemy>;
}

/** バス停: 近距離の台本その2の1手目=後方ロール(攻撃判定なし)。明けたら三段突きの溜めへ繋ぐ。 */
const beginBrRoll = ({ s, newGameTime, dist, pcx, pcy, bcx, bcy, patch }: BountyBeginCtx): void => {
  const dl = Math.max(0.001, dist);
  patch.aiFromX = bcx; patch.aiFromY = bcy;
  patch.aiTargetX = bcx + ((bcx - pcx) / dl) * BR_ROLL_DIST;
  patch.aiTargetY = bcy + ((bcy - pcy) / dl) * BR_ROLL_DIST;
  patch.bossState = 'br-roll';
  patch.bossStateUntil = newGameTime + BR_ROLL_MS;
  // 台本の最後(三段突き)のCDは**台本を選んだ時点で課金**する(押しのけ・三段突きと同じ作法。
  // 途中で崩されても払い戻さない=連発防止)。
  s.tripleReadyAt = newGameTime + BR_TRIPLE_CD_MS;
};

/** バス停: 押しのけ(密着への答えその1・カウンター可)。 */
const beginBrPush = ({ s, newGameTime, pcx, pcy, bcx, bcy, sfx, patch }: BountyBeginCtx): void => {
  sfx.alert();
  const ang = Math.atan2(pcy - bcy, pcx - bcx);
  patch.aiFromX = bcx; patch.aiFromY = bcy;
  patch.aiTargetX = bcx + Math.cos(ang) * BR_T.push.reach;
  patch.aiTargetY = bcy + Math.sin(ang) * BR_T.push.reach;
  patch.bossState = 'br-push-windup';
  patch.bossStateUntil = newGameTime + BR_T.push.windup;
  s.pushReadyAt = newGameTime + BR_PUSH_CD_MS; // 三段突きと同じ「選択時に課金」の作法
};

/**
 * バス停: 三段突きの溜め。`chargeCd=false` は**台本(ロール→三段突き)の続き**から呼ぶ時
 * ——CDは台本を選んだ時点(beginBrRoll)で課金済みなので二重に課金しない。
 */
const beginBrTriple = ({ s, newGameTime, sfx, patch }: BountyBeginCtx, chargeCd = true): void => {
  sfx.alert();
  patch.bossState = 'br-triple-windup';
  patch.bossStateUntil = newGameTime + BR_TRIPLE_WINDUP_MS;
  if (chargeCd) s.tripleReadyAt = newGameTime + BR_TRIPLE_CD_MS; // 選択時に課金(中断されても払い戻さない)
};

/** バス停: 輸入=ミーミル型レーザー(紫=カウンター不可)。 */
const beginBrLaser = ({ s, newGameTime, pcx, pcy, bcx, bcy, sfx, patch }: BountyBeginCtx): void => {
  sfx.alert();
  patch.aiFromX = bcx; patch.aiFromY = bcy;
  // ★v0.25.3426バグ修正: 照準点の初期値=**プレイヤー位置**(ミーミルと同じ。aimTgt=注視対象の座標)。
  // 旧: レーザー終端(プレイヤーの先BR_LASER_RANGE=900px)を照準点にしていたため、追尾器がそこから
  // プレイヤーまで「戻る旅」をすることになり、3秒の溜め内に追いつけず「追いかけてこない」見え方に
  // なっていた(社長報告)。向きの描画/判定は bcx→aiTarget の正規化なので距離は自由=位置で持つのが正。
  patch.aiTargetX = pcx;
  patch.aiTargetY = pcy;
  s.aimVX = 0; s.aimVY = 0;
  patch.bossState = 'laser-windup';
  patch.bossStateUntil = newGameTime + 3000; // = mimirLaserTrack.MIMIR_LASER_WINDUP_MS(直接値。定数はimport済みで下のtestが一致検査)
};

/**
 * バス停(bounty-ranged)の1tick。中立(kite+ポツポツ撃ち)を土台に、押しのけ→レーザーの順で
 * 割り込みを判定する(§4「近接されたら押しのけ→距離を開け直す」が最優先の防御反応のため)。
 */
const tickRanged = (
  bounty: Enemy, s: BountyTickState, newGameTime: number, deltaTime: number, moveSpeedMult: number,
  dist: number, pcx: number, pcy: number, bcx: number, bcy: number, sfx: BountySfx,
  patch: Partial<Enemy>,
): void => {
  const st = bounty.bossState ?? 'chase';
  // 技の開始は必ず begin*(上の束)を通す=ボスメーカーの▸個別再生と同じ1本(遷移を複製しない)。
  const bctx: BountyBeginCtx = { bounty, s, newGameTime, dist, pcx, pcy, bcx, bcy, sfx, patch };

  if (st === 'chase') {
    if (!s.escortsSummoned) {
      s.escortsSummoned = true;
      summonBountyEscorts(bounty, newGameTime);
    }
    // ★v0.25.3517(社長指示「近接も重み変えて / 押しのけしか出ないせいで、倒すのが簡単になってる」):
    // 近距離は**重みで引く**(押しのけ / 三段突き)。どちらもCD中なら何も返さず、下の中立射撃へ落ちる
    // (=後退しながら撃つ)。旧実装は押しのけをCDなしで100%返しており、密着すると答えが1つしか
    // 無い=読む対象が無い状態だった。**押しのけの防御反応としての性格は残す**(重み40で最頻ではある)。
    if (dist <= BR_T.push.pickRange) {
      const closeMove = pickBrCloseMove(
        Math.random,
        newGameTime >= s.tripleReadyAt,
        newGameTime >= s.pushReadyAt,
      );
      if (closeMove === 'roll') {
        // 台本その2の1手目: **後方ロール**(社長指示v0.25.3519)。攻撃ではないのでSEの警告は鳴らさず
        // (=カウンター対象の溜めではない)、明けたらそのまま三段突きの溜めへ繋ぐ。
        // 行き先はプレイヤーの反対側へ BR_ROLL_DIST。**移動は resolveMove を通す**
        // (障害物→行ける帯クランプ。CLAUDE.md「アクターを動かす時は必ず通す」)。
        beginBrRoll(bctx);
        return;
      }
      if (closeMove === 'push') {
        beginBrPush(bctx);
        return;
      }
      // 両方CD中=このtickは技を出さない。下の中立(kite+射撃サイクル)へ落ちる。
    }
    if (newGameTime >= (bounty.mimirLaserReadyAt ?? 0) && dist > BR_T.kite.min) {
      beginBrLaser(bctx);
      return;
    }
    // §6.38 v12(社長指示2026-08-15「バス停の新技『三段突き』」+社長裁定2026-08-15): 中距離の詰め技。
    // 押しのけ(<=110)とレーザーの割り込み判定の**後**・中立の射撃サイクルの**前**に見る(設計書の順序)。
    // ★v0.25.3534(社長報告「バス停が三段突きの前にバックロールしてない」・実バグ修正):
    // **近距離(BR_PUSH_RANGE以内)ではこの直行ルートを使わない**。
    //
    // 原因: v0.25.3518 で「三段突きは0から全部出る様にして」(社長指示)に応えて BR_TRIPLE_MIN を
    // 380→0 にした結果、**この後段の分岐が密着でも成立するようになった**。上の近距離台本
    // (押しのけ / バックロール→三段突き)は `dist <= BR_T.push.pickRange` の中だけを見ているので、
    // 「両方CD中でnull」や「押しのけを引いた次のtick」でここへ落ちると、**台本を飛ばして
    // 三段突きが直行**する=バックロールが前に付かない。社長指示v0.25.3519「近距離の台本は
    // 押しのけ と バックロール→三段突き」が、自分の入れた変更で破れていた。
    //
    // 直し: 近距離は**必ず上の台本を通す**(そこでCD中なら中立射撃へ落ちる=コメントどおりの意図)。
    // 「距離0から三段突きが出る」という指示は、**台本のロール経由**で従来どおり満たされる。
    // ※中距離(110px超)の直行は §6.38 v12 からの既存仕様なのでそのまま残す。
    if (dist > BR_T.push.pickRange && newGameTime >= s.tripleReadyAt && dist >= BR_TRIPLE_MIN && dist <= BR_TRIPLE_MAX) {
      beginBrTriple(bctx);
      return;
    }
    // 中立: kite(引き撃ち)+型3種(burst/fan/charge)のサイクル射撃(§6.38 v10「バス停の中立射撃に緩急」)。
    // §6.38 v7: isBossType編入でクリが移動半減(bossSlowUntil)を打つようになった=城ボス等と同じく
    // bossSlowMultを移動速度へ掛ける(掛けないとリング表示だけ出て実際は減速しない見掛け倒しになる)。
    // §6.38 v10 #8/慣性(CLAUDE.md MUST=瞬間停止禁止): chargeの溜め中/発射後の再加速をkite移動速度
    // への倍率(0→1のease)として掛ける。既存のkite移動は毎フレームpatch.vx/vyを直書きしているだけ
    // なので、速度自体を減衰させれば専用bossStateを作らずに慣性を満たせる。
    let brSpeedMult = 1;
    const nextActionAt = patch.bossNextActionAt ?? bounty.bossNextActionAt ?? 0;
    if (s.brPattern === 'charge') {
      if (s.brShotsRemaining > 0) {
        // 溜め中(windup=350ms)。nextActionAt=このサイクルの発射時刻(#4)。
        const p = 1 - Math.max(0, Math.min(1, (nextActionAt - newGameTime) / BR_CHARGE_WINDUP_MS));
        brSpeedMult = brChargeWindupSpeedMult(p);
      } else if (newGameTime < s.brCycleEndAt) {
        // 発射後の再加速(recover=750ms)。
        const recoverStart = s.brCycleEndAt - BR_CHARGE_RECOVER_MS;
        const p = Math.max(0, Math.min(1, (newGameTime - recoverStart) / BR_CHARGE_RECOVER_MS));
        brSpeedMult = brChargeRecoverSpeedMult(p);
      }
    }
    const dt = deltaTime * moveSpeedMult * bossSlowMult(bounty, newGameTime) * brSpeedMult;
    if (dist < BR_T.kite.min && dist > 1) {
      const ux = (bcx - pcx) / dist, uy = (bcy - pcy) / dist;
      const spd = bounty.speed * dt;
      const c = resolveMove(bounty.x + ux * spd, bounty.y + uy * spd, bounty);
      patch.x = c.x; patch.y = c.y; patch.vx = ux * bounty.speed * brSpeedMult; patch.vy = uy * bounty.speed * brSpeedMult;
    } else if (dist > BR_T.kite.max && dist > 1) {
      const ux = (pcx - bcx) / dist, uy = (pcy - bcy) / dist;
      const spd = bounty.speed * dt;
      const c = resolveMove(bounty.x + ux * spd, bounty.y + uy * spd, bounty);
      patch.x = c.x; patch.y = c.y; patch.vx = ux * bounty.speed * brSpeedMult; patch.vy = uy * bounty.speed * brSpeedMult;
    } else {
      patch.vx = 0; patch.vy = 0;
    }

    if (newGameTime >= nextActionAt) {
      let justStartedCharge = false;
      if (s.brPattern === null || s.brShotsRemaining <= 0) {
        // §6.38 v10 #2: 新サイクル開始=型抽選(距離340px=BR_KITE_MIN未満ではfanを弾く=#1)。
        const allowFan = dist >= BR_T.kite.min;
        const pattern = pickBrShotPattern(Math.random, s.brPrevPattern, allowFan);
        s.brPattern = pattern;
        s.brPrevPattern = pattern;
        s.brShotsRemaining = brShotCount(pattern);
        s.brCycleEndAt = newGameTime + brCycleDurationMs(pattern);
        // §6.38 v10 #5(実バグ修正): 中立射撃でもaiFrom/aiTargetを書く(旧実装は書いておらず、標識の
        // 構えの向きが直前の技の残りカス=未使用なら常に右、になっていた)。狙い=サイクル開始時の
        // プレイヤー方向で固定(#1「狙いはサイクル開始時のプレイヤー方向で固定」)。
        patch.aiFromX = bcx; patch.aiFromY = bcy;
        patch.aiTargetX = pcx; patch.aiTargetY = pcy;
        if (pattern === 'charge') {
          sfx.alert(); // §6.38 v10 #9: 溜め開始のSE(burst/fanは現状どおり無音)。
          patch.bossNextActionAt = newGameTime + BR_CHARGE_WINDUP_MS; // #4: 発射時刻=構えと溜めが重なる
          justStartedCharge = true; // 溜め中はまだ撃たない(このtickでは発射しない)
        }
      }
      if (!justStartedCharge) {
        const fx = patch.aiFromX ?? bounty.aiFromX ?? bcx;
        const fy = patch.aiFromY ?? bounty.aiFromY ?? bcy;
        const tx = patch.aiTargetX ?? bounty.aiTargetX ?? pcx;
        const ty = patch.aiTargetY ?? bounty.aiTargetY ?? pcy;
        // サイクル開始時に固定した狙い(fx,fy→tx,ty)の向き。pixiScene側のaimAng算出(aiFromX/Y→
        // aiTargetX/Y)と同じ式=絵と発射方向が一致する。以後この向きのまま(bcx/bcyは現在位置=
        // 標識の"銃口"は動くが狙う方向は変わらない)。
        const baseAng = Math.atan2(ty - fy, tx - fx);
        // 社長指示v0.25.3443「弾飛ばす時もバス停の先から撃つ感じにして」: 発射起点=構えた標識の先端
        // (BR_T.signTipPx・構えの高さ=身長比-0.15)。描画側(pixiScene)が同じ点に標識を構える。
        const player = useGameStore.getState().player;
        const fireOne = (offsetRad: number, profile: { speed: number; damage: number; size: number }): void => {
          const a = baseAng + offsetRad;
          const mzx = bcx + Math.cos(baseAng) * BR_T.signTipPx;
          const mzy = bcy - bounty.height * 0.15 + Math.sin(baseAng) * BR_T.signTipPx;
          const tgtX = bcx + Math.cos(a) * 300, tgtY = bcy + Math.sin(a) * 300;
          useGameStore.getState().addProjectile(createEnemyProjectile(
            bounty, player, tgtX, tgtY, mzx, mzy, profile,
          ));
        };
        patch.lastRangedShotAt = newGameTime; // 描画専用の合図(構えの標識を~0.9秒見せる)
        if (s.brPattern === 'burst') {
          // #1: burst=200ms間隔で3発。狙い固定・弾は現状のまま。
          fireOne(0, BR_T.shot);
          s.brShotsRemaining -= 1;
          // #4「burstの2/3発目もこれを更新する」。最後の1発は次サイクル開始時刻(cycleEndAt)へジャンプ
          // する(最後の弾からの+間隔ではない=#3)。
          patch.bossNextActionAt = s.brShotsRemaining > 0 ? newGameTime + BR_BURST_INTERVAL_MS : s.brCycleEndAt;
        } else if (s.brPattern === 'fan') {
          // #1: fan=同時3発・±12°。弾は現状のまま。
          for (const deg of BR_FAN_ANGLE_OFFSETS_DEG) fireOne(deg * Math.PI / 180, BR_T.shot);
          s.brShotsRemaining = 0;
          patch.bossNextActionAt = s.brCycleEndAt;
        } else if (s.brPattern === 'charge') {
          // #1: charge=溜め済み→1発・弾速1.5倍(社長裁定「案ア」)。威力は現状のまま。
          fireOne(0, { ...BR_T.shot, speed: BR_T.shot.speed * BR_CHARGE_SPEED_MULT });
          s.brShotsRemaining = 0;
          patch.bossNextActionAt = s.brCycleEndAt;
        }
      }
    }
    return;
  }

  // ★v0.25.3519(社長指示「近距離の台本は、押しのけ と バックロール→三段つき」): 台本の1手目。
  // 後方へ BR_ROLL_DIST 引く**移動だけ**の状態(攻撃判定なし・カウンター対象でもない)。
  // 動きは smoothstep(brRollEase)=加速→減速(CLAUDE.md「慣性」。等速で始まって瞬間停止しない)。
  // 明けたら**そのまま三段突きの溜めへ**繋ぐ(=台本。moveCancelGuard の申告表に登録済み)。
  if (st === 'br-roll') {
    const fx = bounty.aiFromX ?? bcx, fy = bounty.aiFromY ?? bcy;
    const tx = bounty.aiTargetX ?? bcx, ty = bounty.aiTargetY ?? bcy;
    const t = Math.max(0, Math.min(1, 1 - ((bounty.bossStateUntil ?? newGameTime) - newGameTime) / BR_ROLL_MS));
    const k = brRollEase(t);
    const c = resolveMove(fx + (tx - fx) * k - bounty.width / 2, fy + (ty - fy) * k - bounty.height / 2, bounty);
    patch.x = c.x; patch.y = c.y;
    patch.vx = 0; patch.vy = 0;
    if (newGameTime >= (bounty.bossStateUntil ?? 0)) {
      // ここからが予告(=カウンターを狙える溜め)なので、この瞬間にSEが鳴る(beginBrTripleの中)。
      // CDは台本を選んだ時点(beginBrRoll)で課金済み=ここでは課金しない(chargeCd=false)。
      beginBrTriple(bctx, false);
    }
    return;
  }

  if (st === 'br-push-windup') {
    if (newGameTime >= (bounty.bossStateUntil ?? 0)) {
      const fx = bounty.aiFromX ?? bcx, fy = bounty.aiFromY ?? bcy;
      const tx = bounty.aiTargetX ?? bcx, ty = bounty.aiTargetY ?? bcy;
      hitCapsule(bounty, fx, fy, tx, ty, BR_T.push.halfWidth, BR_T.push.damage, BR_T.push.kb);
      patch.bossState = 'br-push';
      patch.bossStateUntil = newGameTime + 120;
    }
    return;
  }
  if (st === 'br-push') {
    if (newGameTime >= (bounty.bossStateUntil ?? 0)) {
      patch.bossState = 'br-push-recover';
      patch.bossStateUntil = newGameTime + BR_T.push.recover;
    }
    return;
  }
  if (st === 'br-push-recover') {
    if (newGameTime >= (bounty.bossStateUntil ?? 0)) {
      patch.bossState = 'chase';
      patch.bossNextActionAt = newGameTime + BOUNTY_NEUTRAL_MS;
      resetBrShotCycle(s); // §6.38 v10 #7: 押しのけからのchase復帰=射撃サイクルをクリア
    }
    return;
  }

  // ---- 輸入=ミーミル型レーザー(usesMimirLaser経由でgameStore/pixiSceneと状態名を共有) ------------
  if (st === 'laser-windup') {
    // §6.33の物理追尾を複製(mimirLaserTrack.stepLaserAim/mimirLaserPhase/mimirLaserTrackCapsを
    // そのままimportして使う=誤学習防止。ロック段(mimirLaserPhase==='lock')に入ったら以後動かさない)。
    // ここではモジュール分離を保つため必要関数だけを都度importせず、上のimport文でまとめて読む
    // (下の実装は mimirLaserPhase / stepLaserAim / mimirLaserTrackCaps を使用)。
    laserWindupTick(bounty, s, newGameTime, deltaTime, pcx, pcy, patch);
    if (newGameTime >= (bounty.bossStateUntil ?? 0)) {
      sfx.fire();
      patch.bossState = 'laser-fire';
      patch.bossStateUntil = newGameTime + BR_LASER_FIRE_MS;
      useGameStore.getState().triggerShake(BR_LASER_FIRE_MS, 5);
    }
    return;
  }
  if (st === 'laser-fire') {
    // 判定は「現在のボス中心→aiTargetX/Y」の向き(pixiScene側の描画式と同じ=赤い予告と厳密一致)。
    const ax = (bounty.aiTargetX ?? bcx) - bcx, ay = (bounty.aiTargetY ?? bcy) - bcy;
    const al = Math.hypot(ax, ay) || 1;
    const ux = ax / al, uy = ay / al;
    const player = useGameStore.getState().player;
    const ppx = player.x + player.width / 2, ppy = player.y + player.height / 2;
    const pr = Math.max(player.width, player.height) / 2;
    const tproj = Math.max(0, Math.min(BR_LASER_RANGE, (ppx - bcx) * ux + (ppy - bcy) * uy));
    const cxp = bcx + ux * tproj, cyp = bcy + uy * tproj;
    if (Math.hypot(ppx - cxp, ppy - cyp) <= BR_LASER_HALFWIDTH + pr) {
      useGameStore.getState().damagePlayer(BR_T.laser.damage, `${enemyDeathLabel(bounty.type)}のレーザー`, ppx, ppy);
    }
    if (newGameTime >= (bounty.bossStateUntil ?? 0)) {
      patch.bossState = 'laser-recover';
      patch.bossStateUntil = newGameTime + BR_T.laser.recover;
      patch.mimirLaserReadyAt = newGameTime + BR_T.laser.cdMs;
    }
    return;
  }
  if (st === 'laser-recover' || st === 'laser-broken') {
    if (newGameTime >= (bounty.bossStateUntil ?? 0)) {
      patch.bossState = 'chase';
      patch.bossNextActionAt = newGameTime + BOUNTY_NEUTRAL_MS;
      resetBrShotCycle(s); // §6.38 v10 #7: レーザー(recover/broken)からのchase復帰=射撃サイクルをクリア
    }
    return;
  }

  // ---- §6.38 v12: 三段突き(中距離の詰め技) -----------------------------------------------------
  if (st === 'br-triple-windup') {
    // 社長指示2026-08-15「今の距離ではプレイヤーに届かない。もっと高速で近づいてから使う」:
    // 溜め900msの間、静止する代わりにプレイヤーへ高速接近する(止まったまま溜めない)。
    // REACH/HALF_WIDTH/STEP/選択距離/溜め時間は不変——実行フェーズ開始時点で距離を
    // BR_TRIPLE_APPROACH_STOP_DIST(=REACH)まで詰めておくことで、実行フェーズのREACHだけで
    // 確実に届くようにする(旧実装は溜め中静止=プレイヤーが歩くだけで上限側が届かなくなっていた)。
    // ★v0.25.3564(社長報告「バス停の三段突き、バックロール後だけかもだけど、その後前に追尾して
    // くるの無し。逃げれない」): **ライブ追尾を廃止**。接近の目標は windup 開始フレームの
    // プレイヤー位置の**スナップショット(固定点)**とし、以後は追わない。歩いて離れれば逃げられる。
    // 事実として: 旧実装のライブ追尾は 2026-08-15 の社長裁定「もっと高速で近づいてから使う」
    // 「歩いて避けられない設計になってもよい」に基づくもので、本裁定はそれを更新する(裁定は事実として併記)。
    // 加速→減速(CLAUDE.md MUST=瞬間停止禁止): 速度=「加速倍率(発進からの経過ms)」×
    // 「減速倍率(目標までの残り距離px)」で作る(seek and arrive・brTripleApproach{Accel,Decel}Mult)。
    // ★時間の締切(残り時間)だけで減速を作る実装は採らない——実測で破綻することを確認済み:
    // プレイヤーが全力で逃げ続けると残り距離が縮み切らないまま締切が迫り、締切側の減速に速度が
    // 潰されて「詰め切れない」(実行フェーズのREACH=300が届かず空振り)という実バグを作っていた。
    // 距離ベースの減速なら、逃げられている間は高速巡航を続け、目標(STOP_DIST)に近づいた分だけ
    // 自然に減速する=締切に関係なく詰め切れる。移動は resolveMove(=障害物+移動可能帯clamp)を通す。
    const untilAt = bounty.bossStateUntil ?? (newGameTime + BR_TRIPLE_WINDUP_MS);
    const windupStartAt = untilAt - BR_TRIPLE_WINDUP_MS;
    // 固定目標のスナップショット(windupの開始時刻をキーに1回だけ焼く)。
    // ★v0.25.3565(社長裁定「三段突き、判定が始まったら追尾しないで」): 角度ロックも**溜めの頭**へ
    // 前倒しする。旧: 裁定#3(2026-08-15)「溜め中は毎フレーム追い、溜め明けに一括ロック」=
    // 赤帯(判定の予告)が900msの間こちらを向き直し続けていた。新: 赤が出た瞬間に方向も確定
    // (以後、絵も判定も一切追わない。裁定は事実として両方併記)。
    if (s.tripleApproachKey !== windupStartAt) {
      s.tripleApproachKey = windupStartAt;
      s.tripleApproachTx = pcx; s.tripleApproachTy = pcy;
      patch.bountyTripleAng = Math.atan2(pcy - bcy, pcx - bcx); // 赤帯と判定の唯一の出どころを頭で固定
    }
    const accelMult = brTripleApproachAccelMult(newGameTime - windupStartAt);
    const snapDx = s.tripleApproachTx - bcx, snapDy = s.tripleApproachTy - bcy;
    const snapDist = Math.hypot(snapDx, snapDy);
    const remainDist = Math.max(0, snapDist - BR_TRIPLE_APPROACH_STOP_DIST);
    const decelMult = brTripleApproachDecelMult(remainDist);
    const approachSpeed = bounty.speed * BR_TRIPLE_APPROACH_SPEED_MULT * accelMult * decelMult;
    let curBx = bounty.x, curBy = bounty.y;
    if (remainDist > 0 && approachSpeed > 0 && snapDist > 0.001) {
      const dt = deltaTime * moveSpeedMult * bossSlowMult(bounty, newGameTime);
      const step = Math.min(approachSpeed * dt, remainDist); // 大きなdt(コマ落ち)でも行き過ぎない安全弁
      const ux = snapDx / snapDist, uy = snapDy / snapDist;
      const c = resolveMove(bounty.x + ux * step, bounty.y + uy * step, bounty);
      curBx = c.x; curBy = c.y;
      patch.x = c.x; patch.y = c.y;
      patch.vx = ux * approachSpeed; patch.vy = uy * approachSpeed;
    } else {
      patch.vx = 0; patch.vy = 0;
    }
    // ★v0.25.3565: 溜め明けの再照準は**しない**(角度は上=溜めの頭で確定済み)。
    // 旧裁定#3(2026-08-15「溜め明けに一括ロック」)は事実として記す——横に避けても構えが追う設計
    // だったが、本裁定「判定が始まったら追尾しない」により、赤帯が出た後の回避が全方向で成立する。
    if (newGameTime >= untilAt) {
      const ang = bounty.bountyTripleAng ?? Math.atan2(pcy - bcy, pcx - bcx);
      s.tripleStepStartAt = newGameTime;
      s.tripleHitFired = false;
      // 踏み込み(3段通しの1つの弧)の起点/向き/開始時刻をここで焼き付ける(mk-spinと同型)。
      // 起点=接近後(=curBx/curBy)の位置(接近フェーズの続きとして自然につながる)。
      s.tripleLungeX0 = curBx; s.tripleLungeY0 = curBy;
      s.tripleLungeUx = Math.cos(ang); s.tripleLungeUy = Math.sin(ang);
      s.tripleLungeStartAt = newGameTime;
      patch.bossState = 'br-triple-1';
      patch.bossStateUntil = newGameTime + brTripleStepDurationMs(0);
    }
    return;
  }
  if (st === 'br-triple-1' || st === 'br-triple-2' || st === 'br-triple-3') {
    const stepIdx: 0 | 1 | 2 = st === 'br-triple-1' ? 0 : st === 'br-triple-2' ? 1 : 2;
    // 踏み込み(社長裁定#2・監査で出た未指定の埋め「溜め中はボスを止める。踏み込みは実行の3段を
    // 通して加速→減速」): 合計BR_TRIPLE_STEP(120px)を**1つの弧**として消化する(段ごとに瞬間停止
    // しない=CLAUDE.md MUST)。起点/向きはwindup明けの1フレームで焼き付け済み。
    const lungeElapsed = newGameTime - s.tripleLungeStartAt;
    const eased = brTripleLungeEase01(lungeElapsed, BR_TRIPLE_ACTIVE_MS);
    const moved = BR_TRIPLE_STEP * eased;
    const c = resolveMove(s.tripleLungeX0 + s.tripleLungeUx * moved, s.tripleLungeY0 + s.tripleLungeUy * moved, bounty);
    patch.x = c.x; patch.y = c.y;
    const tNorm = Math.max(0, Math.min(1, BR_TRIPLE_ACTIVE_MS > 0 ? lungeElapsed / BR_TRIPLE_ACTIVE_MS : 1));
    const spd = (BR_TRIPLE_STEP * 6 * tNorm * (1 - tNorm)) / (BR_TRIPLE_ACTIVE_MS / 1000);
    patch.vx = s.tripleLungeUx * spd; patch.vy = s.tripleLungeUy * spd;
    // 判定は**動いた後の中心**で取る(絵と判定を同じ位置に揃える=赤帯の座標は毎フレーム現在のボス
    // 中心を読む、の掟。mk-spinと同じ扱い)。
    const curBcx = c.x + bounty.width / 2, curBcy = c.y + bounty.height / 2;

    // 命中判定(監査で出た未指定の埋め「各段の突き出しの末尾(帯が伸び切った瞬間)」)。damagePlayer
    // 直呼びはしない=既存の帯判定共通経路hitCapsuleを使う(無敵/カウンター/守護霊の経路を素通りしない)。
    const stepElapsed = newGameTime - s.tripleStepStartAt;
    if (!s.tripleHitFired && stepElapsed >= BR_TRIPLE_THRUST_MS) {
      s.tripleHitFired = true;
      const ang = brTripleAngles(bounty.bountyTripleAng ?? Math.atan2(pcy - bcy, pcx - bcx))[stepIdx];
      const tx = curBcx + Math.cos(ang) * BR_TRIPLE_REACH, ty = curBcy + Math.sin(ang) * BR_TRIPLE_REACH;
      hitCapsule(bounty, curBcx, curBcy, tx, ty, BR_TRIPLE_HALF_WIDTH, BR_TRIPLE_DAMAGE);
    }

    if (newGameTime >= (bounty.bossStateUntil ?? 0)) {
      if (stepIdx < 2) {
        s.tripleStepStartAt = newGameTime;
        s.tripleHitFired = false;
        patch.bossState = stepIdx === 0 ? 'br-triple-2' : 'br-triple-3';
        patch.bossStateUntil = newGameTime + brTripleStepDurationMs((stepIdx + 1) as 1 | 2);
      } else {
        patch.bossState = 'br-triple-recover';
        patch.bossStateUntil = newGameTime + BR_T.triple.recover;
      }
    }
    return;
  }
  if (st === 'br-triple-recover') {
    if (newGameTime >= (bounty.bossStateUntil ?? 0)) {
      patch.bossState = 'chase';
      patch.bossNextActionAt = newGameTime + BOUNTY_NEUTRAL_MS;
      resetBrShotCycle(s); // §6.38 v10 #7と同格の割り込み扱い(押しのけ/レーザーと同じくchase復帰でクリア)
    }
    return;
  }
};

/** laser-windup中の照準更新(mimirLaserTrack.tsの純関数をそのまま使う・複製しない)。 */
const laserWindupTick = (
  bounty: Enemy, s: BountyTickState, newGameTime: number, deltaTime: number,
  pcx: number, pcy: number, patch: Partial<Enemy>,
): void => {
  const until = bounty.bossStateUntil ?? 0;
  if (mimirLaserPhase(newGameTime, until) !== 'track') return; // ロック段=以後動かさない
  // ★v0.25.3426: ミーミル本家と同じくGAME_SPEEDを掛ける(輸入技の同一性。掛けないと追尾が2割遅い)。
  const caps = mimirLaserTrackCaps((useGameStore.getState().player.speed ?? 87) * GAME_SPEED);
  const progress = Math.max(0, Math.min(1, 1 - (until - newGameTime) / BR_LASER_WINDUP_MS));
  const stepped = stepLaserAim(
    { x: bounty.aiTargetX ?? pcx, y: bounty.aiTargetY ?? pcy, vx: s.aimVX, vy: s.aimVY },
    pcx, pcy, deltaTime, caps.maxPxS, caps.accel, progress,
  );
  // 描画/判定は「現在のボス中心からaiTargetX/Yへの向き」で引く(pixiScene側の掟と同じ式)。
  // aiTargetX/Yには照準先の絶対座標をそのまま持たせる(向きは読み出し側が正規化する)。
  patch.aiTargetX = stepped.x; patch.aiTargetY = stepped.y;
  s.aimVX = stepped.vx; s.aimVY = stepped.vy;
};

// (v0.25.3570の BM_WHIP360_CLOSE_CHANCE=近距離抽選は、v0.25.3571「三段攻撃の最後に360度、の
// 台本に統合」で撤去。360は独立技ではなくコンボの締めになった。)

/** 馬乗り: 輸入=懲罰狙撃(遠距離の長居に飛ぶ細長い帯)。 */
const beginBmSnipe = ({ s, newGameTime, dist, pcx, pcy, bcx, bcy, sfx, patch }: BountyBeginCtx): void => {
  s.farMs = 0;
  sfx.alert();
  const dl = dist || 1;
  patch.aiFromX = bcx; patch.aiFromY = bcy;
  patch.aiTargetX = bcx + ((pcx - bcx) / dl) * BM_T.snipe.range;
  patch.aiTargetY = bcy + ((pcy - bcy) / dl) * BM_T.snipe.range;
  patch.bossState = 'bm-snipe-windup';
  patch.bossStateUntil = newGameTime + BM_T.snipe.windup;
};

/** 馬乗り: 3段コンボ(速→速→遅)の1段目。2/3段目は各recoverからの続き。 */
const beginBmCombo = ({ s, newGameTime, pcx, pcy, bcx, bcy, sfx, patch }: BountyBeginCtx): void => {
  sfx.alert();
  s.comboStep = 1;
  const ang = Math.atan2(pcy - bcy, pcx - bcx);
  patch.aiFromX = bcx; patch.aiFromY = bcy;
  patch.aiTargetX = bcx + Math.cos(ang) * BM_T.combo.range;
  patch.aiTargetY = bcy + Math.sin(ang) * BM_T.combo.range;
  patch.bossState = 'bm-combo1-windup';
  patch.bossStateUntil = newGameTime + BM_T.combo.windup[0];
};

/** 馬乗り: 輸入=突進(werewolf型)。走り終わりに360度ムチへ繋がる。 */
const beginBmCharge = ({ newGameTime, dist, pcx, pcy, bcx, bcy, sfx, patch }: BountyBeginCtx): void => {
  sfx.alert();
  const dl = dist || 1;
  patch.aiFromX = bcx; patch.aiFromY = bcy;
  patch.aiTargetX = bcx + ((pcx - bcx) / dl) * BM_T.charge.reach;
  patch.aiTargetY = bcy + ((pcy - bcy) / dl) * BM_T.charge.reach;
  patch.bossState = 'bm-charge-windup';
  patch.bossStateUntil = newGameTime + BM_T.charge.windup;
};

/**
 * 馬乗り: 360度ムチ振りの溜め。**実戦では突進の着地から自動で繋がる**(単独では抽選されない)ので、
 * ▸個別再生ではここを直接叩いて「ムチだけ」を見る(BOSS_MAKER.mdの訓練場の精神)。
 */
const beginBmWhip360 = ({ newGameTime, patch }: BountyBeginCtx): void => {
  patch.vx = 0; patch.vy = 0;
  patch.bossWindupStartAt = newGameTime;
  patch.bossState = 'bm-whip360-windup';
  patch.bossStateUntil = newGameTime + BM_T.whip360.windup;
};

/**
 * 馬乗り(bounty-melee)の1tick。§4③の懲罰(遠距離2秒)を最優先で見て、次に密着帯のコンボ、
 * それ以外は突進で距離を詰める(idolTick.tsの中立判断=懲罰→ストリングの順序を踏襲)。
 */
const tickMelee = (
  bounty: Enemy, s: BountyTickState, newGameTime: number, deltaTime: number, moveSpeedMult: number,
  dist: number, pcx: number, pcy: number, bcx: number, bcy: number, sfx: BountySfx,
  patch: Partial<Enemy>,
): void => {
  const st = bounty.bossState ?? 'chase';
  const bctx: BountyBeginCtx = { bounty, s, newGameTime, dist, pcx, pcy, bcx, bcy, sfx, patch };

  if (st === 'chase') {
    const stepMs = deltaTime * 1000;
    s.farMs = advanceLingerMs(s.farMs, dist > BM_T.meleeMax * 3, stepMs);
    if (s.farMs >= BM_T.farMs) {
      beginBmSnipe(bctx);
      return;
    }
    if (dist <= BM_T.meleeMax) {
      // ★v0.25.3571(社長指示「三段攻撃の最後に360度、の台本に統合」): v0.25.3570の近距離抽選
      // (コンボ/360の二択)は**1日で撤回**——360は独立技ではなく**3段コンボの締め**として出す
      // (コンボ3段目→360へ直結)。よって近距離の入口はコンボ1本へ戻す。
      beginBmCombo(bctx);
      return;
    }
    // 突進は「中距離を詰める」役(BM_CHARGE_REACH圏内だけ)。真の遠距離はここで割り込ませず
    // farMsを積ませ続ける(=懲罰狙撃が必ず発火する。突進が毎tick先取りしてfarMsの窓を潰さないため)。
    if (dist <= BM_T.charge.reach && newGameTime >= (bounty.bossNextActionAt ?? 0)) {
      beginBmCharge(bctx);
      return;
    }
    // 中立: プレイヤーへ直進(主戦帯を作るほどの語彙は持たない=シンプルな肉薄型)。
    // §6.38 v7: bossSlowMult(クリの移動半減窓)を掛ける(tickRangedと同じ理由)。
    if (dist > 1) {
      const dt = deltaTime * moveSpeedMult * bossSlowMult(bounty, newGameTime);
      const ux = (pcx - bcx) / dist, uy = (pcy - bcy) / dist;
      const spd = bounty.speed * dt;
      const c = resolveMove(bounty.x + ux * spd, bounty.y + uy * spd, bounty);
      patch.x = c.x; patch.y = c.y; patch.vx = ux * bounty.speed; patch.vy = uy * bounty.speed;
    }
    return;
  }

  // ---- 突進(輸入=werewolf windup→charge) ------------------------------------------------------
  if (st === 'bm-charge-windup') {
    if (newGameTime >= (bounty.bossStateUntil ?? 0)) {
      patch.bossState = 'bm-charge';
      patch.bossStateUntil = newGameTime + BM_T.charge.maxMs;
    }
    return;
  }
  if (st === 'bm-charge') {
    const tx = bounty.aiTargetX ?? bcx, ty = bounty.aiTargetY ?? bcy;
    const dl = Math.hypot(tx - bcx, ty - bcy);
    if (dl > 2) {
      const spd = bounty.speed * BM_T.charge.speedMult * deltaTime * moveSpeedMult * bossSlowMult(bounty, newGameTime);
      const step = Math.min(spd, dl);
      const c = resolveMove(bounty.x + ((tx - bcx) / dl) * step, bounty.y + ((ty - bcy) / dl) * step, bounty);
      patch.x = c.x; patch.y = c.y;
    }
    if (dl <= 2 || newGameTime >= (bounty.bossStateUntil ?? 0)) {
      // 社長指示v0.25.3473「ダッシュ後に360度、ムチ振り攻撃」: 突進の着地点でそのまま薙ぎ払いへ繋ぐ。
      beginBmWhip360(bctx);
    }
    return;
  }
  // ---- ダッシュ後の360度ムチ振り(社長指示v0.25.3473) -------------------------------------------
  if (st === 'bm-whip360-windup') {
    if (newGameTime >= (bounty.bossStateUntil ?? 0)) {
      patch.bossState = 'bm-whip360';
      patch.bossStateUntil = newGameTime + BM_T.whip360.active;
      s.whip360Hit = false;
    }
    return;
  }
  if (st === 'bm-whip360') {
    // 判定=自分中心の円(鞭の届く範囲)。**1回の振りで1度だけ**当たる(多段にしない)。
    const pr = Math.max(useGameStore.getState().player.width, useGameStore.getState().player.height) / 2;
    if (!s.whip360Hit && Math.hypot(pcx - bcx, pcy - bcy) <= BM_T.whip360.radius + pr) {
      s.whip360Hit = true;
      useGameStore.getState().damagePlayer(BM_T.whip360.damage, `${enemyDeathLabel(bounty.type)}の鞭薙ぎ`, pcx, pcy);
    }
    if (newGameTime >= (bounty.bossStateUntil ?? 0)) {
      patch.bossState = 'bm-charge-recover';
      patch.bossStateUntil = newGameTime + BM_T.charge.recover;
    }
    return;
  }
  if (st === 'bm-charge-recover') {
    if (newGameTime >= (bounty.bossStateUntil ?? 0)) {
      patch.bossState = 'chase';
      patch.bossNextActionAt = newGameTime + BOUNTY_NEUTRAL_MS;
    }
    return;
  }

  // ---- 3段コンボ(速→速→遅) --------------------------------------------------------------------
  if (st === 'bm-combo1-windup' || st === 'bm-combo2-windup' || st === 'bm-combo3-windup') {
    if (newGameTime >= (bounty.bossStateUntil ?? 0)) {
      const step = st === 'bm-combo1-windup' ? 0 : st === 'bm-combo2-windup' ? 1 : 2;
      const fx = bounty.aiFromX ?? bcx, fy = bounty.aiFromY ?? bcy;
      const tx = bounty.aiTargetX ?? bcx, ty = bounty.aiTargetY ?? bcy;
      hitCapsule(
        bounty, fx, fy, tx, ty, BM_T.combo.halfWidth, BM_T.combo.damage[step],
        step === 2 ? BM_T.combo.kb : undefined,
      );
      if (step < 2) {
        patch.bossState = step === 0 ? 'bm-combo1-recover' : 'bm-combo2-recover';
        patch.bossStateUntil = newGameTime + BM_T.combo.stepRecover;
      } else {
        // ★v0.25.3571(社長指示「三段攻撃の最後に360度、の台本に統合」): 3段目の斬り終わりから
        // **360度ムチへ直結**する(コンボの締め=大技)。予告(whip360.windup・赤円)を挟むので
        // 「赤=カウンター/回避の対象」の文法はそのまま。360の終わりの bm-charge-recover が
        // 従来の finishRecover の役(パニッシュ窓)を引き継ぐ。
        beginBmWhip360({ bounty, s, newGameTime, dist, pcx, pcy, bcx, bcy, sfx, patch });
        s.comboStep = 0;
      }
    }
    return;
  }
  if (st === 'bm-combo1-recover' || st === 'bm-combo2-recover') {
    if (newGameTime >= (bounty.bossStateUntil ?? 0)) {
      const nextStep = st === 'bm-combo1-recover' ? 2 : 3; // 1-recover後→2段目、2-recover後→3段目
      s.comboStep = nextStep as 2 | 3;
      const ang = Math.atan2(pcy - bcy, pcx - bcx);
      patch.aiFromX = bcx; patch.aiFromY = bcy;
      patch.aiTargetX = bcx + Math.cos(ang) * BM_T.combo.range;
      patch.aiTargetY = bcy + Math.sin(ang) * BM_T.combo.range;
      patch.bossState = nextStep === 2 ? 'bm-combo2-windup' : 'bm-combo3-windup';
      patch.bossStateUntil = newGameTime + BM_T.combo.windup[nextStep - 1];
    }
    return;
  }
  if (st === 'bm-combo3-recover') {
    if (newGameTime >= (bounty.bossStateUntil ?? 0)) {
      s.comboStep = 0;
      patch.bossState = 'chase';
      patch.bossNextActionAt = newGameTime + BOUNTY_NEUTRAL_MS;
    }
    return;
  }

  // ---- 輸入=懲罰狙撃(idolScript snipeの値を複製=完全同一) ---------------------------------------
  if (st === 'bm-snipe-windup') {
    if (newGameTime >= (bounty.bossStateUntil ?? 0)) {
      patch.bossState = 'bm-snipe';
      patch.bossStateUntil = newGameTime + BM_T.snipe.active;
    }
    return;
  }
  if (st === 'bm-snipe') {
    const fx = bounty.aiFromX ?? bcx, fy = bounty.aiFromY ?? bcy;
    const tx = bounty.aiTargetX ?? bcx, ty = bounty.aiTargetY ?? bcy;
    const player = useGameStore.getState().player;
    const ppx = player.x + player.width / 2, ppy = player.y + player.height / 2;
    const pr = Math.max(player.width, player.height) / 2;
    if (distToBandRect({ x: ppx, y: ppy }, { x: fx, y: fy }, { x: tx, y: ty }, BM_T.snipe.halfWidth) <= pr) {
      useGameStore.getState().damagePlayer(BM_T.snipe.damage, `${enemyDeathLabel(bounty.type)}の狙撃`, ppx, ppy);
    }
    if (newGameTime >= (bounty.bossStateUntil ?? 0)) {
      patch.bossState = 'bm-snipe-recover';
      patch.bossStateUntil = newGameTime + BM_T.snipe.recover;
    }
    return;
  }
  if (st === 'bm-snipe-recover') {
    if (newGameTime >= (bounty.bossStateUntil ?? 0)) {
      patch.bossState = 'chase';
      patch.bossNextActionAt = newGameTime + BOUNTY_NEUTRAL_MS;
    }
    return;
  }
};

// ---- 鋏(bounty-balance): ER §1-4型・近=薙ぎ払い/遠=跳びかかり ------------------------------------
// 距離帯・薙ぎ払い・跳びかかりの数値は **BB_T(bountyScript.ts)** が正(跳びかかりはpumpkin輸入。
// v2 A節の掟「跳躍はpumpkinのaiPhase機構を流用せず-windup/-air/-recoverとしてbossState側に再実装」)。

/** 鋏: 目の前の帯=薙ぎ払い(密着に居座らせないための技)。 */
const beginBbSweep = ({ newGameTime, pcx, pcy, bcx, bcy, sfx, patch }: BountyBeginCtx): void => {
  sfx.alert();
  const ang = Math.atan2(pcy - bcy, pcx - bcx);
  patch.aiFromX = bcx; patch.aiFromY = bcy;
  patch.aiTargetX = bcx + Math.cos(ang) * BB_T.sweep.range;
  patch.aiTargetY = bcy + Math.sin(ang) * BB_T.sweep.range;
  patch.bossState = 'bb-sweep-windup';
  patch.bossStateUntil = newGameTime + BB_T.sweep.windup;
};

/** 鋏: 輸入=跳びかかり(pumpkin型)。着地点は溜め開始時のプレイヤー位置で固定。 */
const beginBbLeap = ({ newGameTime, pcx, pcy, sfx, patch }: BountyBeginCtx): void => {
  sfx.alert();
  // 着地点=溜め開始時のプレイヤー位置スナップ(pumpkinと同じ「狙って置かれる」型)。
  patch.aiTargetX = pcx; patch.aiTargetY = pcy;
  patch.bossState = 'leap-windup';
  patch.bossStateUntil = newGameTime + BB_T.leap.windup;
};

const tickBalance = (
  bounty: Enemy, s: BountyTickState, newGameTime: number, deltaTime: number, moveSpeedMult: number,
  dist: number, pcx: number, pcy: number, bcx: number, bcy: number, sfx: BountySfx,
  patch: Partial<Enemy>,
): void => {
  const st = bounty.bossState ?? 'chase';
  const bctx: BountyBeginCtx = { bounty, s, newGameTime, dist, pcx, pcy, bcx, bcy, sfx, patch };

  if (st === 'chase') {
    if (dist <= BB_T.nearMax) {
      beginBbSweep(bctx);
      return;
    }
    if (newGameTime >= (bounty.bossNextActionAt ?? 0)) {
      beginBbLeap(bctx);
      return;
    }
    if (dist > 1) {
      // §6.38 v7: bossSlowMult(クリの移動半減窓)を掛ける(tickRangedと同じ理由)。
      const ux = (pcx - bcx) / dist, uy = (pcy - bcy) / dist;
      const spd = bounty.speed * deltaTime * moveSpeedMult * bossSlowMult(bounty, newGameTime);
      const c = resolveMove(bounty.x + ux * spd, bounty.y + uy * spd, bounty);
      patch.x = c.x; patch.y = c.y; patch.vx = ux * bounty.speed; patch.vy = uy * bounty.speed;
    }
    return;
  }

  if (st === 'bb-sweep-windup') {
    if (newGameTime >= (bounty.bossStateUntil ?? 0)) {
      const fx = bounty.aiFromX ?? bcx, fy = bounty.aiFromY ?? bcy;
      const tx = bounty.aiTargetX ?? bcx, ty = bounty.aiTargetY ?? bcy;
      hitCapsule(bounty, fx, fy, tx, ty, BB_T.sweep.halfWidth, BB_T.sweep.damage);
      patch.bossState = 'bb-sweep-recover';
      patch.bossStateUntil = newGameTime + BB_T.sweep.recover;
    }
    return;
  }
  if (st === 'bb-sweep-recover') {
    if (newGameTime >= (bounty.bossStateUntil ?? 0)) {
      patch.bossState = 'chase';
      patch.bossNextActionAt = newGameTime + BOUNTY_NEUTRAL_MS;
    }
    return;
  }
  if (st === 'leap-windup') {
    if (newGameTime >= (bounty.bossStateUntil ?? 0)) {
      patch.bossState = 'leap-air';
      patch.bossStateUntil = newGameTime + BB_T.leap.airMs;
    }
    return;
  }
  if (st === 'leap-air') {
    // 空中移動(見た目のみ。判定は着地の瞬間の円=下)。着地点は溜め開始時にロック済み(aiTargetX/Y)。
    const tx = bounty.aiTargetX ?? bcx, ty = bounty.aiTargetY ?? bcy;
    const airMs = BB_T.leap.airMs;
    const remain = (bounty.bossStateUntil ?? newGameTime) - newGameTime;
    const t = Math.max(0, Math.min(1, 1 - remain / airMs));
    patch.x = (bcx + (tx - bcx) * t) - bounty.width / 2;
    patch.y = (bcy + (ty - bcy) * t) - bounty.height / 2;
    if (newGameTime >= (bounty.bossStateUntil ?? 0)) {
      hitCapsule(bounty, tx, ty, tx, ty, BB_T.leap.radius, BB_T.leap.damage);
      patch.vx = 0; patch.vy = 0;
      patch.bossState = 'leap-recover';
      patch.bossStateUntil = newGameTime + BB_T.leap.recover;
    }
    return;
  }
  if (st === 'leap-recover') {
    if (newGameTime >= (bounty.bossStateUntil ?? 0)) {
      patch.bossState = 'chase';
      patch.bossNextActionAt = newGameTime + BOUNTY_NEUTRAL_MS;
    }
    return;
  }
};

// ---- 舞妓(bounty-maiko): 全技の得物=毬(v5.1)。型A(HP>50%)/型B(HP<=50%・1回だけ切替) -------------
// 距離帯・毬の薙ぎ(単発/2連)・毬回し・水鳥乱舞・手毬打ちの数値は **MK_T(bountyScript.ts)** が正
// (2択ランダムの予告=変則ディレイ、各技の由来と社長裁定の経緯もテーブル側に書いてある)。

/** 変則ディレイ(§4 v4「マルギット型」): 2値から毎回独立に抽選(連続同値も許す=乱数を持ち越さない)。 */
const pick2 = (choices: readonly [number, number]): number => (Math.random() < 0.5 ? choices[0] : choices[1]);

/**
 * 舞妓: 毬の薙ぎ。**型A(phase1)は単発 / 型B(phase2)は速→遅の2連**——どちらへ入るかは
 * 渡された phase だけで決まる(▸個別再生も同じ関数を通るので、型に合った方が必ず出る)。
 */
const beginMkNaginata = (
  { s, newGameTime, pcx, pcy, bcx, bcy, sfx, patch }: BountyBeginCtx, phase: 1 | 2,
): void => {
  sfx.alert();
  const ang = Math.atan2(pcy - bcy, pcx - bcx);
  patch.aiFromX = bcx; patch.aiFromY = bcy;
  patch.aiTargetX = bcx + Math.cos(ang) * MK_T.naginata.range;
  patch.aiTargetY = bcy + Math.sin(ang) * MK_T.naginata.range;
  patch.bossWindupStartAt = newGameTime; // v6 C-1: 変則ディレイは開始時刻を併記(描画側の進行度算出用)
  if (phase === 1) {
    const w = pick2(MK_T.naginata.windup);
    patch.bossState = 'mk-naginata-windup';
    patch.bossStateUntil = newGameTime + w;
  } else {
    s.comboStep = 1;
    const w = pick2(MK_T.naginata.windup1);
    patch.bossState = 'mk-naginata1-windup';
    patch.bossStateUntil = newGameTime + w;
  }
};

/** 舞妓: 水鳥乱舞(型B専用の3連バウンド)。 */
const beginMkSuiu = ({ s, newGameTime, sfx, patch }: BountyBeginCtx): void => {
  sfx.alert();
  s.suiuHopIdx = 0;
  patch.bossState = 'mk-suiu-windup';
  patch.bossStateUntil = newGameTime + 500;
};

/** 舞妓: 手毬打ち(遠距離のブーメラン)。 */
const beginMkBoom = ({ newGameTime, dist, pcx, pcy, bcx, bcy, sfx, patch }: BountyBeginCtx): void => {
  sfx.alert();
  patch.aiFromX = bcx; patch.aiFromY = bcy;
  const dl = dist || 1;
  patch.aiTargetX = bcx + ((pcx - bcx) / dl) * MK_T.boom.range;
  patch.aiTargetY = bcy + ((pcy - bcy) / dl) * MK_T.boom.range;
  patch.bossState = 'mk-boom-windup';
  patch.bossStateUntil = newGameTime + MK_T.boom.windup;
};

/** 舞妓: 毬回し(自分中心の円+踏み込み)。 */
const beginMkSpin = ({ newGameTime, sfx, patch }: BountyBeginCtx): void => {
  sfx.alert();
  patch.bossWindupStartAt = newGameTime;
  patch.bossState = 'mk-spin-windup';
  patch.bossStateUntil = newGameTime + pick2(MK_T.spin.windup);
};

const tickMaiko = (
  bounty: Enemy, s: BountyTickState, newGameTime: number, deltaTime: number, moveSpeedMult: number,
  dist: number, pcx: number, pcy: number, bcx: number, bcy: number, sfx: BountySfx,
  patch: Partial<Enemy>,
): void => {
  const st = bounty.bossState ?? 'chase';
  const phase: 1 | 2 = bounty.bossPhase === 2 ? 2 : 1;
  const bctx: BountyBeginCtx = { bounty, s, newGameTime, dist, pcx, pcy, bcx, bcy, sfx, patch };

  if (st === 'chase') {
    // 型切替(v6 C-5「実行中の技は完走してから」=chaseに戻ってから判定するので自然に満たす。1回だけ)。
    const hpFrac = bounty.maxHealth > 0 ? bounty.health / bounty.maxHealth : 1;
    if (phase === 1 && hpFrac <= MK_T.phaseHpFrac) {
      patch.bossPhase = 2;
      if (phaseJustChanged(bounty.bossPhase, 2)) patch.bossPhaseFlashUntil = newGameTime + 1200;
      patch.bossState = 'mk-repose';
      patch.bossStateUntil = newGameTime + MK_T.reposeMs;
      return;
    }

    if (dist <= MK_T.nearMax) {
      beginMkNaginata(bctx, phase);
      return;
    }

    if (newGameTime >= (bounty.bossNextActionAt ?? 0)) {
      const roll = Math.random();
      if (phase === 2 && roll < 0.4) {
        beginMkSuiu(bctx);
        return;
      }
      if (dist > MK_T.farMin && roll < (phase === 2 ? 0.75 : 0.7)) {
        beginMkBoom(bctx);
        return;
      }
      beginMkSpin(bctx);
      return;
    }
    if (dist > 1) {
      // §6.38 v7: bossSlowMult(クリの移動半減窓)を掛ける(tickRangedと同じ理由)。
      const ux = (pcx - bcx) / dist, uy = (pcy - bcy) / dist;
      const spd = bounty.speed * deltaTime * moveSpeedMult * bossSlowMult(bounty, newGameTime) * 0.6; // 舞妓は他3体よりにじり寄りを控えめに
      const c = resolveMove(bounty.x + ux * spd, bounty.y + uy * spd, bounty);
      patch.x = c.x; patch.y = c.y;
    }
    return;
  }

  if (st === 'mk-repose') {
    if (newGameTime >= (bounty.bossStateUntil ?? 0)) {
      patch.bossState = 'chase';
      patch.bossNextActionAt = newGameTime + BOUNTY_NEUTRAL_MS;
    }
    return;
  }

  // ---- 毬の薙ぎ(型A単発) ------------------------------------------------------------------------
  if (st === 'mk-naginata-windup') {
    if (newGameTime >= (bounty.bossStateUntil ?? 0)) {
      const fx = bounty.aiFromX ?? bcx, fy = bounty.aiFromY ?? bcy;
      const tx = bounty.aiTargetX ?? bcx, ty = bounty.aiTargetY ?? bcy;
      hitCapsule(bounty, fx, fy, tx, ty, MK_T.naginata.halfWidth, MK_T.naginata.damage);
      patch.bossState = 'mk-naginata-recover';
      patch.bossStateUntil = newGameTime + MK_T.naginata.recover;
    }
    return;
  }
  if (st === 'mk-naginata-recover') {
    if (newGameTime >= (bounty.bossStateUntil ?? 0)) {
      patch.bossState = 'chase';
      patch.bossNextActionAt = newGameTime + BOUNTY_NEUTRAL_MS;
    }
    return;
  }
  // ---- 毬の薙ぎ・連(型B・速→遅の2連) -----------------------------------------------------------
  if (st === 'mk-naginata1-windup') {
    if (newGameTime >= (bounty.bossStateUntil ?? 0)) {
      const fx = bounty.aiFromX ?? bcx, fy = bounty.aiFromY ?? bcy;
      const tx = bounty.aiTargetX ?? bcx, ty = bounty.aiTargetY ?? bcy;
      hitCapsule(bounty, fx, fy, tx, ty, MK_T.naginata.halfWidth, MK_T.naginata.damage);
      patch.bossState = 'mk-naginata1-recover';
      patch.bossStateUntil = newGameTime + MK_T.naginata.stepRecover;
    }
    return;
  }
  if (st === 'mk-naginata1-recover') {
    if (newGameTime >= (bounty.bossStateUntil ?? 0)) {
      s.comboStep = 2;
      const ang = Math.atan2(pcy - bcy, pcx - bcx);
      patch.aiFromX = bcx; patch.aiFromY = bcy;
      patch.aiTargetX = bcx + Math.cos(ang) * MK_T.naginata.range;
      patch.aiTargetY = bcy + Math.sin(ang) * MK_T.naginata.range;
      patch.bossWindupStartAt = newGameTime;
      patch.bossState = 'mk-naginata2-windup';
      patch.bossStateUntil = newGameTime + pick2(MK_T.naginata.windup2);
    }
    return;
  }
  if (st === 'mk-naginata2-windup') {
    if (newGameTime >= (bounty.bossStateUntil ?? 0)) {
      const fx = bounty.aiFromX ?? bcx, fy = bounty.aiFromY ?? bcy;
      const tx = bounty.aiTargetX ?? bcx, ty = bounty.aiTargetY ?? bcy;
      hitCapsule(bounty, fx, fy, tx, ty, MK_T.naginata.halfWidth, MK_T.naginata.damage);
      s.comboStep = 0;
      patch.bossState = 'mk-naginata2-recover';
      patch.bossStateUntil = newGameTime + MK_T.naginata.recover;
    }
    return;
  }
  if (st === 'mk-naginata2-recover') {
    if (newGameTime >= (bounty.bossStateUntil ?? 0)) {
      patch.bossState = 'chase';
      patch.bossNextActionAt = newGameTime + BOUNTY_NEUTRAL_MS;
    }
    return;
  }
  // ---- 毬回し(自分中心円) -----------------------------------------------------------------------
  if (st === 'mk-spin-windup') {
    if (newGameTime >= (bounty.bossStateUntil ?? 0)) {
      patch.bossState = 'mk-spin';
      patch.bossStateUntil = newGameTime + MK_T.spin.active;
    }
    return;
  }
  if (st === 'mk-spin') {
    // §6.38 v11: 踏み込み。**加速→減速**(smoothstep)で前進し、終わりで自然に止まる(等速・瞬間停止禁止)。
    // 位置は「焼き付けた起点 + 向き × イーズ距離」で決める(毎フレームの積算だと減速が崩れるため)。
    {
      // 踏み込みの起点と向きは**その1回の実行の最初のフレームで焼き付ける**(以後は追尾しない=
      // 横に避ければ抜けられる)。鍵は bossStateUntil(実行ごとに変わる)。**windup側ではなくここで
      // 焼くのは、練習モード等で mk-spin を直接叩き込む経路でも必ず初期化されるようにするため**
      // (未初期化のまま使うと起点0,0へ飛ぶ)。
      const spinKey = bounty.bossStateUntil ?? 0;
      if (s.spinKey !== spinKey) {
        const sdx = pcx - bcx, sdy = pcy - bcy;
        const sdl = Math.hypot(sdx, sdy) || 1;
        s.spinKey = spinKey; s.spinX0 = bounty.x; s.spinY0 = bounty.y;
        s.spinUx = sdx / sdl; s.spinUy = sdy / sdl;
      }
      const remainSpin = Math.max(0, (bounty.bossStateUntil ?? newGameTime) - newGameTime);
      const tSpin = Math.max(0, Math.min(1, 1 - remainSpin / MK_T.spin.active));
      const eased = tSpin * tSpin * (3 - 2 * tSpin); // smoothstep=頭で加速・終わりで減速
      const moved = MK_T.spin.lungePx * eased;
      const c = resolveMove(s.spinX0 + s.spinUx * moved, s.spinY0 + s.spinUy * moved, bounty);
      patch.x = c.x; patch.y = c.y;
      // 速度は距離の微分(smoothstepの導関数=6t(1-t))。向き/歩きの絵がこれを読む。
      const spd = (MK_T.spin.lungePx * 6 * tSpin * (1 - tSpin)) / (MK_T.spin.active / 1000);
      patch.vx = s.spinUx * spd; patch.vy = s.spinUy * spd;
      // 判定は**動いた後の中心**で取る(絵と判定を同じ位置に揃える)。
      bcx = c.x + bounty.width / 2; bcy = c.y + bounty.height / 2;
    }
    if (Math.hypot(pcx - bcx, pcy - bcy) <= MK_T.spin.radius + Math.max(useGameStore.getState().player.width, useGameStore.getState().player.height) / 2) {
      useGameStore.getState().damagePlayer(MK_T.spin.damage, `${enemyDeathLabel(bounty.type)}の毬回し`, pcx, pcy);
    }
    if (newGameTime >= (bounty.bossStateUntil ?? 0)) {
      patch.bossState = 'mk-spin-recover';
      patch.bossStateUntil = newGameTime + MK_T.spin.recover;
    }
    return;
  }
  if (st === 'mk-spin-recover') {
    if (newGameTime >= (bounty.bossStateUntil ?? 0)) {
      patch.bossState = 'chase';
      patch.bossNextActionAt = newGameTime + BOUNTY_NEUTRAL_MS;
    }
    return;
  }
  // ---- 水鳥乱舞(型B専用・3連バウンド) -----------------------------------------------------------
  if (st === 'mk-suiu-windup') {
    if (newGameTime >= (bounty.bossStateUntil ?? 0)) {
      const off = MK_T.suiu.offsetRange;
      const ox = (Math.random() * 2 - 1) * off, oy = (Math.random() * 2 - 1) * off;
      const raw = { x: pcx + ox, y: pcy + oy };
      const st0 = useGameStore.getState();
      const ctx: PlayableAreaCtx = {
        farBackdrop: st0.farBackdrop, labTheme: st0.stageTheme === 'lab' && !st0.indoorMode,
        corridorMode: st0.corridorMode, m0AdvanceLimitX: st0.m0AdvanceLimitX,
        corridorRunInActive: st0.corridorRunInActive,
      };
      const clamped = clampRectToPlayableArea(raw.x - bounty.width / 2, raw.y - bounty.height / 2, bounty.width, bounty.height, ctx);
      s.suiuTx = clamped.x + bounty.width / 2; s.suiuTy = clamped.y + bounty.height / 2;
      s.suiuHopIdx = 1;
      patch.aiFromX = bcx; patch.aiFromY = bcy;
      patch.aiTargetX = s.suiuTx; patch.aiTargetY = s.suiuTy;
      patch.bossState = 'mk-suiu-hop1';
      patch.bossStateUntil = newGameTime + pick2(MK_T.suiu.hopInterval) + MK_T.suiu.travelMs;
    }
    return;
  }
  if (st === 'mk-suiu-hop1' || st === 'mk-suiu-hop2' || st === 'mk-suiu-hop3') {
    if (newGameTime >= (bounty.bossStateUntil ?? 0)) {
      const hopIdx = st === 'mk-suiu-hop1' ? 1 : st === 'mk-suiu-hop2' ? 2 : 3;
      const isFinal = hopIdx === 3;
      const radius = isFinal ? MK_T.suiu.radius * MK_T.suiu.finalRadiusMult : MK_T.suiu.radius;
      hitCapsule(bounty, s.suiuTx, s.suiuTy, s.suiuTx, s.suiuTy, radius, MK_T.suiu.damage);
      if (isFinal) {
        s.suiuHopIdx = 0;
        patch.bossState = 'mk-suiu-recover';
        patch.bossStateUntil = newGameTime + MK_T.suiu.recover;
        return;
      }
      // 次のホップの着地点を再抽選(プレイヤー現在位置+抽選オフセット・clamp)。
      const off = MK_T.suiu.offsetRange;
      const ox = (Math.random() * 2 - 1) * off, oy = (Math.random() * 2 - 1) * off;
      const raw = { x: pcx + ox, y: pcy + oy };
      const st0 = useGameStore.getState();
      const ctx: PlayableAreaCtx = {
        farBackdrop: st0.farBackdrop, labTheme: st0.stageTheme === 'lab' && !st0.indoorMode,
        corridorMode: st0.corridorMode, m0AdvanceLimitX: st0.m0AdvanceLimitX,
        corridorRunInActive: st0.corridorRunInActive,
      };
      const clamped = clampRectToPlayableArea(raw.x - bounty.width / 2, raw.y - bounty.height / 2, bounty.width, bounty.height, ctx);
      const fromX = s.suiuTx, fromY = s.suiuTy;
      s.suiuTx = clamped.x + bounty.width / 2; s.suiuTy = clamped.y + bounty.height / 2;
      s.suiuHopIdx = (hopIdx + 1) as 1 | 2 | 3;
      patch.aiFromX = fromX; patch.aiFromY = fromY;
      patch.aiTargetX = s.suiuTx; patch.aiTargetY = s.suiuTy;
      patch.bossState = hopIdx === 1 ? 'mk-suiu-hop2' : 'mk-suiu-hop3';
      patch.bossStateUntil = newGameTime + pick2(MK_T.suiu.hopInterval) + MK_T.suiu.travelMs;
    }
    return;
  }
  if (st === 'mk-suiu-recover') {
    if (newGameTime >= (bounty.bossStateUntil ?? 0)) {
      patch.bossState = 'chase';
      patch.bossNextActionAt = newGameTime + BOUNTY_NEUTRAL_MS;
    }
    return;
  }
  // ---- 手毬打ち(遠距離・ブーメラン) -------------------------------------------------------------
  if (st === 'mk-boom-windup') {
    if (newGameTime >= (bounty.bossStateUntil ?? 0)) {
      patch.bossState = 'mk-boom-out';
      patch.bossStateUntil = newGameTime + MK_T.boom.outMs;
    }
    return;
  }
  if (st === 'mk-boom-out' || st === 'mk-boom-back') {
    // 判定=毬の絵に揃える(分類1): 溜め開始でロックした2点(aiFromX/Y→aiTargetX/Y)の間を毬が往復する。
    // 現在位置(往路=from→to/復路=to→from)に円判定を置く。共通弾(赤二重丸)ではない=専用の絵(pixiScene)。
    const fx = bounty.aiFromX ?? bcx, fy = bounty.aiFromY ?? bcy;
    const tx = bounty.aiTargetX ?? bcx, ty = bounty.aiTargetY ?? bcy;
    const total = st === 'mk-boom-out' ? MK_T.boom.outMs : MK_T.boom.backMs;
    const remain = (bounty.bossStateUntil ?? newGameTime) - newGameTime;
    const t = Math.max(0, Math.min(1, 1 - remain / total));
    const px2 = st === 'mk-boom-out' ? fx + (tx - fx) * t : tx + (fx - tx) * t;
    const py2 = st === 'mk-boom-out' ? fy + (ty - fy) * t : ty + (fy - ty) * t;
    const pr = Math.max(useGameStore.getState().player.width, useGameStore.getState().player.height) / 2;
    if (Math.hypot(pcx - px2, pcy - py2) <= MK_T.boom.hitRadius + pr) {
      useGameStore.getState().damagePlayer(MK_T.boom.damage, `${enemyDeathLabel(bounty.type)}の手毬打ち`, pcx, pcy);
    }
    if (newGameTime >= (bounty.bossStateUntil ?? 0)) {
      if (st === 'mk-boom-out') {
        patch.bossState = 'mk-boom-back';
        patch.bossStateUntil = newGameTime + MK_T.boom.backMs;
      } else {
        patch.bossState = 'mk-boom-recover';
        patch.bossStateUntil = newGameTime + MK_T.boom.recover;
      }
    }
    return;
  }
  if (st === 'mk-boom-recover') {
    if (newGameTime >= (bounty.bossStateUntil ?? 0)) {
      patch.bossState = 'chase';
      patch.bossNextActionAt = newGameTime + BOUNTY_NEUTRAL_MS;
    }
    return;
  }
};

// =================================================================================================
// ボスメーカーの「個別再生」(▸)— 賞金首4種(BOSS_MAKER.md §7・社長要望v0.25.2625/v0.25.3563)
// > 停止中は技、動きごとに再生ボタンで個々に再生できる様にしたい
//
// 押した技を**即座に開始**する。CD・距離帯・型(phase)の抽選は**全部バイパス**する
// (「いま見たい技を見る」ための道具なので、条件が揃うまで待たせない=部屋は訓練場)。
// ★ただし**技の中身(タイミング・判定・描画)は本番と同じコード**を通る——始め方だけが違う
//   (begin* の束を実戦と共用しているので、遷移が二重管理にならない)。
//
// 置き場所は idolTick.ts の pendingPlay と同型: パネル(React)は BountyTickState の実体を
// 持てない(useGameLoopのrefの中)ので、**モジュール変数の要求箱**を経由し、tickが引き取る。
// ★この箱は BossMakerPanel からしか書かれない=**通常プレイでは常に null**(毎フレームの追加費用は
//   bool 2つの比較だけ。賞金首の実プレイ挙動は1バイトも変わらない)。
// =================================================================================================

/** ▸で再生できる技のキー(パネルのボタンと1対1。値は bossState の接頭辞に揃えてある)。 */
export type BountyMoveKey =
  | 'br-push' | 'br-roll' | 'br-triple' | 'br-laser'
  | 'bm-charge' | 'bm-whip360' | 'bm-combo' | 'bm-snipe'
  | 'bb-sweep' | 'bb-leap'
  | 'mk-naginata' | 'mk-spin' | 'mk-suiu' | 'mk-boom';

/**
 * どのボスがどの技を持つか。**パネルの playables と、再生時の取り違え防止の両方がこれを読む**
 * (1つの出どころ=「ボタンは出ているのに何も起きない」を原理的に作らない)。
 */
export const BOUNTY_MOVES_BY_TYPE: Readonly<Record<string, readonly BountyMoveKey[]>> = {
  'bounty-ranged': ['br-push', 'br-roll', 'br-triple', 'br-laser'],
  'bounty-melee': ['bm-charge', 'bm-whip360', 'bm-combo', 'bm-snipe'],
  'bounty-balance': ['bb-sweep', 'bb-leap'],
  'bounty-maiko': ['mk-naginata', 'mk-spin', 'mk-suiu', 'mk-boom'],
};

/** 選ばれた技を始める(実戦のchase分岐と**同じ begin* を叩く**)。 */
const startBountyMove = (move: BountyMoveKey, bctx: BountyBeginCtx): void => {
  switch (move) {
    case 'br-push': beginBrPush(bctx); return;
    case 'br-roll': beginBrRoll(bctx); return;
    case 'br-triple': beginBrTriple(bctx); return;
    case 'br-laser': beginBrLaser(bctx); return;
    case 'bm-charge': beginBmCharge(bctx); return;
    case 'bm-whip360': beginBmWhip360(bctx); return;
    case 'bm-combo': beginBmCombo(bctx); return;
    case 'bm-snipe': beginBmSnipe(bctx); return;
    case 'bb-sweep': beginBbSweep(bctx); return;
    case 'bb-leap': beginBbLeap(bctx); return;
    // 型(A/B)は**いまのボスの型に従う**=切り替えボタン(HP40%等)で見たい方を選ぶ。
    case 'mk-naginata': beginMkNaginata(bctx, bctx.bounty.bossPhase === 2 ? 2 : 1); return;
    case 'mk-spin': beginMkSpin(bctx); return;
    case 'mk-suiu': beginMkSuiu(bctx); return;
    case 'mk-boom': beginMkBoom(bctx); return;
  }
};

interface BountyPlayRequest { move: BountyMoveKey; solo: boolean; loop: boolean }
let pendingBountyPlay: BountyPlayRequest | null = null;
/** 単独再生の実行中(=停止中でも tick を進めてよい)。技が終わったら false へ戻る。 */
let bountySoloActive = false;
/** ループ再生中の技(null=1回で止まる)。 */
let bountyLoopMove: BountyMoveKey | null = null;

/**
 * 技を1つだけ再生する。solo=停止中でもこの技が終わるまで進めて、終わったらまた止まる。
 * ★idolとの違い: ループ中の技をもう一度押した時、idolは要求箱を「解除」で埋めて即chaseへ戻すが、
 * ここでは**ループだけを止める**(進行中の技は最後まで再生してから止まる)。停止中に絵が
 * 技の途中で凍りつくのを避けるため——賞金首は「解除」に相当する移動語彙(verb)を持たない。
 */
export const requestBountyMovePlay = (move: BountyMoveKey, opts?: { solo?: boolean; loop?: boolean }): void => {
  if (bountyLoopMove === move) { bountyLoopMove = null; return; }
  pendingBountyPlay = { move, solo: opts?.solo ?? false, loop: opts?.loop ?? false };
};
/** 停止中でも tick を回す必要があるか(useGameLoop のポーズ判定が読む)。 */
export const bountyPlaybackActive = (): boolean => bountySoloActive || pendingBountyPlay !== null;
/** 画面表示用(どの技をループ中か)。verbは賞金首には無いので常に null。 */
export const getBountyPlayback = (): { verb: string | null; loop: string | null } =>
  ({ verb: null, loop: bountyLoopMove });
/**
 * 全部消す(ラン開始時のリセット経路)。★`createBountyTickState()` に副作用として入れてはいけない
 * ——`useRef(createBountyTickState())` の引数は毎レンダー評価されるので、パネルが再描画するたびに
 * 要求箱が空になり「▶を押しても技が1フレームで止まる」になる(idolTick.ts v0.25.2625の実バグ)。
 */
export const clearBountyPlayback = (): void => {
  pendingBountyPlay = null; bountySoloActive = false; bountyLoopMove = null;
};

/**
 * 賞金首1体を1tick進める。B1の状態(休眠/追跡/帰巣)に加え、B2a/B2bで4体全ての技を追加した。
 * §6.38 B1.5-5: 出現告知(triggerAttention+バナー「賞金首出現」+SE)はスポーン時(呼び出し側=
 * useGameLoop.ts)へ移設した。§6.38 v9で起床演出(holo-circle)も撤去=起床は城ボスと同じ
 * 「即chase」(見た目の合図はスポーン時の魔法陣だけ)。
 */
export const runBountyTick = (
  bounty: Enemy,
  s: BountyTickState,
  newGameTime: number,
  deltaTime: number,
  moveSpeedMult: number,
  nowMs: number,
  sfx: BountySfx = NOOP_BOUNTY_SFX,
  counterEnabled = true,
): void => {
  if (s.activeId !== bounty.id) { resetBountyRunState(s); s.activeId = bounty.id; }

  const player = useGameStore.getState().player;
  const pcx = player.x + player.width / 2, pcy = player.y + player.height / 2;
  const bcx = bounty.x + bounty.width / 2, bcy = bounty.y + bounty.height / 2;
  const dist = Math.hypot(pcx - bcx, pcy - bcy);
  const patch: Partial<Enemy> = {};

  // ---- ボスメーカー: 単独再生の終わり(保険) ------------------------------------------------------
  // 通常は「技がchaseへ戻ったフレーム」(下の post-tick 判定)で終わる。ここは**割り込みで技が
  // 消された時**の受け皿——気絶/紫/ノックバック/カウンター/帰巣は post-tick まで到達せずに return
  // するため、これが無いと bountySoloActive が立ちっぱなしになり **⏸(停止)が二度と効かなくなる**。
  if (bountySoloActive && pendingBountyPlay === null && (bounty.bossState ?? 'chase') === 'chase') {
    if (bountyLoopMove !== null) pendingBountyPlay = { move: bountyLoopMove, solo: true, loop: true };
    else bountySoloActive = false;
  }

  if (bounty.dormant) {
    // 休眠中の個体に▸は意味が無い。要求を捨てる(捨てないと要求箱が残り続けて⏸が効かなくなる)。
    if (bountyPlaybackActive()) clearBountyPlayback();
    resetBountyRunState(s);
    const ar = bounty.aggroRange ?? BOUNTY_AGGRO_RANGE_DEFAULT;
    if (dist <= ar) {
      // §6.38 v9(完全コピー原則): 起床演出(holo-circle)は撤去。城ボス(gameStore.ts dormantブロック
      // `{ ...enemy, dormant: false, vx: 0, vy: 0, bossLeashSince: undefined }`)と全く同じ
      // 「起きたら即chase」に揃える。見た目の合図はスポーン時の魔法陣(pixiScene)だけに一本化する。
      patch.dormant = false;
      patch.vx = 0;
      patch.vy = 0;
      patch.bossLeashSince = undefined;
      patch.bountyLastEngagedAt = newGameTime;
      patch.bountyDepartAt = undefined;
      applyPatch(bounty.id, patch);
      return;
    }
    // dormantのまま=滞在タイマー判定(交戦していない=毎フレーム経過する)。
    if (bounty.bountyDepartAt === undefined) {
      if (bountyLingerExpired(newGameTime, bounty.bountyLastEngagedAt, bounty.spawnedAt)) {
        patch.bountyDepartAt = newGameTime;
        useGameStore.setState({ eventBannerText: '賞金首は去った', eventBannerUntil: newGameTime + BOUNTY_DEPART_BANNER_MS });
      }
    } else if (newGameTime - bounty.bountyDepartAt >= BOUNTY_DEPART_FADE_MS) {
      // フェード完了=消滅(描画側はbountyDepartAtからの経過でαを落とす)。取り巻きも一緒に片付ける。
      clearBountyEscorts(bounty.id);
      useGameStore.setState(stt => ({ enemies: stt.enemies.filter(e => e.id !== bounty.id) }));
      return;
    }
    applyPatch(bounty.id, patch);
    return;
  }

  // ---- フルスタン(紫・bossFullStunUntil)成立中は実行中の技を即中断(§6.38実機FB5/FB6) -----------
  // 裁定: スタン=カウンター中断(v3128)と同じ「技中断」扱いに統一する。idolTick.tsのfullStun分岐
  // (idolTick.ts:546-556)と同型——毎フレーム bossState を'chase'へ戻し bossNextActionAt を
  // 更新し続けることで、①予告(windup/recover系bossState)がその場で消える(pixiSceneはbossStateを
  // 読んで予告を描くため=FB6「赤ラインが残り続ける」の直接の直し方) ②凍結明け
  // (bossFullStunUntilが尽きた瞬間)は既に'chase'かつ真新しいbossNextActionAtから即座に再開できる
  // (旧実装はbossState/bossStateUntilを一切書き換えなかったため、凍結明けに newGameTime が
  // 遥か過去のbossStateUntilを追い越しており、stale windupがその場で即着弾→即座に次phaseへ
  // 連鎖するか、着地/次行動が起きないまま止まって見える=FB5「紫が解除されない」の実体)。
  // x/yやknockbackVx/Vy等の座標系は一切書かない(カウンターのノックバック座標を上書きしない=
  // B1.5-2の掟のまま)。
  const fullStunNow = bounty.bossFullStunUntil !== undefined && newGameTime < bounty.bossFullStunUntil;
  if (fullStunNow) {
    cancelBountyTechnique(s); // 馬乗り3段コンボ/360度ムチ振り/舞妓の焼き付け/バス停射撃サイクルを中断
    applyPatch(bounty.id, {
      bossState: 'chase',
      bossStateUntil: undefined,
      bossNextActionAt: newGameTime + BOUNTY_NEUTRAL_MS,
      bountyLastEngagedAt: newGameTime,
    });
    return;
  }

  // ---- 気絶・拘束・浮き・ノックバックのガード(B1.5-2・致命) ------------------------------------
  // 社長確定指示v0.25.3476「ノックバックしたら技は中断」: フルスタン(紫)と同じ扱いに統一。
  // x/yやknockbackVx/Vy等の座標系は一切書かない(カウンターのノックバック座標を上書きしない=
  // B1.5-2の掟のまま)が、bossState/bossStateUntil/bossNextActionAtは毎フレーム'chase'へ押し出し
  // 続ける(fullStunNowと同型)。理由もfullStunNowと同じ: ①進行中の予告/技がその場で消える
  // (latchFxが最後まで描き切って消える=固まったまま残らない) ②解除された瞬間に真新しい
  // bossNextActionAtから再開できる(まとめ撃ち・stale windup事故を防ぐ)。
  // 旧実装(#7)は「サイクル自体は捨てず次弾時刻だけ押し出す」だったが、技を中断する以上サイクルも
  // 一緒に捨てる=cancelBountyTechniqueに統一(bounty-rangedだけ別出口だったbossNextActionAtの
  // 個別上書きも不要になった)。
  if (isFrozen(bounty, newGameTime, nowMs)) {
    // ★社長裁定v0.25.3497「ノックバックもだけど、技だけキャンセルされなければええで」:
    // **ノックバック"だけ"で止まっている間は技を中断しない**。v0.25.3476で紫と同じ「中断」へ
    // 揃えたが、実機では近接・弾・爆発のたびに技が消えて何も撃てなくなった(社長報告v0.25.3494)。
    // 代わりに**技の時計を凍結ぶんだけ後ろへずらす**=解除後に続きから出る。
    //  - 時計をずらす理由: bossStateUntil は絶対時刻(gameTime)なので、止めている間も時間が進むと
    //    解除の瞬間に既に期限切れ=**stale windupがその場で即着弾**する(v0.25.3476のコメントが
    //    「まとめ撃ち・stale windup事故」と呼んでいたもの)。ずらせばこの事故は起きない。
    //  - 気絶/拘束/浮き/紫は従来どおり中断(あちらは「止める」ではなく「崩す」効果)。
    const kbOnly = bounty.knockbackUntil !== undefined && nowMs < bounty.knockbackUntil
      && !(bounty.bossFullStunUntil !== undefined && newGameTime < bounty.bossFullStunUntil)
      && !(bounty.stunUntil !== undefined && newGameTime < bounty.stunUntil)
      && !(bounty.rootUntil !== undefined && newGameTime < bounty.rootUntil)
      && !(bounty.liftUntil !== undefined && nowMs < bounty.liftUntil);
    if (kbOnly) {
      const dtMs = deltaTime * 1000;
      applyPatch(bounty.id, {
        ...(bounty.bossStateUntil !== undefined ? { bossStateUntil: bounty.bossStateUntil + dtMs } : {}),
        bossNextActionAt: (bounty.bossNextActionAt ?? newGameTime) + dtMs,
        bountyLastEngagedAt: newGameTime,
      });
      return;
    }
    cancelBountyTechnique(s);
    applyPatch(bounty.id, {
      bossState: 'chase',
      bossStateUntil: undefined,
      bossNextActionAt: newGameTime + BOUNTY_NEUTRAL_MS,
      bountyLastEngagedAt: newGameTime,
    });
    return;
  }

  // ---- カウンター(W7: windup中/硬直中の接触=可。v3128の掟=成立で技中断+chase復帰) -----------------
  const stNow = patch.bossState !== undefined ? patch.bossState : (bounty.bossState ?? 'chase');
  const counterableNow = counterEnabled
    && (isCounterablePhase(stNow, BOUNTY_WINDUP_STATES, BOUNTY_RECOVER_STATES)
      || BOUNTY_ACTIVE_COUNTER_STATES.includes(stNow)); // ★v0.25.3571: 突進の走り/360の振りも可
  let countered = false;
  if (counterableNow) {
    const cp = useGameStore.getState().player;
    // ★v0.25.3571: 360系(windup/振り)は判定が「体」ではなく「赤円(whip360.radius)」なので、
    // カウンターの成立域も赤円に合わせる(赤=カウンター対象の文法・城ボス着地円と同型)。
    // それ以外は従来どおり体の重なり。
    const is360 = stNow === 'bm-whip360-windup' || stNow === 'bm-whip360';
    const pcx2 = cp.x + cp.width / 2, pcy2 = cp.y + cp.height / 2;
    const pRad = Math.max(cp.width, cp.height) / 2;
    const inReach = is360
      ? Math.hypot(pcx2 - bcx, pcy2 - bcy) <= BM_T.whip360.radius + pRad
      : rectsOverlap({ x: bounty.x, y: bounty.y, width: bounty.width, height: bounty.height }, { x: cp.x, y: cp.y, width: cp.width, height: cp.height });
    if (inReach && Date.now() <= cp.counterWindowEnd) {
      bountyCounterHit(bounty, bcx, bcy, sfx);
      countered = true;
      s.comboStep = 0;
      resetBrShotCycle(s); // §6.38 v10 #7: カウンターからのchase復帰=バス停の射撃サイクルをクリア
      patch.bossState = 'chase';
      patch.bossNextActionAt = newGameTime + BOUNTY_NEUTRAL_MS;
    }
  }

  // ---- 交戦判定+リーシュ(§2/v6 A-3・B-4) ---------------------------------------------------
  const leashRadius = bossLeashDistancePx(bounty.type, false);
  const engaged = bountyEngagedNow({ dormant: false, distance: dist, msSinceHit: nowMs - bounty.lastHit }, leashRadius);
  if (engaged) {
    patch.bountyLastEngagedAt = newGameTime; // 交戦中は毎フレームリセット(§2)
    if (bounty.bossLeashSince !== undefined) patch.bossLeashSince = undefined;
  }

  if (!countered && !engaged) {
    // v6 A-3: bossStateが技実行中なら待機化を満了まで延期。
    const midMove = (patch.bossState ?? bounty.bossState) !== undefined && (patch.bossState ?? bounty.bossState) !== 'chase';
    const grace = advanceBossDisengageGrace(true, bounty.bossLeashSince, newGameTime);
    if (grace.since !== bounty.bossLeashSince) patch.bossLeashSince = grace.since;
    if (grace.ready && !midMove) {
      // 帰巣: 巣(homeX/homeY)へゆっくり歩いて戻りつつ回復(giantbatのリーシュと同じ土管)。
      const hx = bounty.homeX, hy = bounty.homeY;
      if (hx !== undefined && hy !== undefined) {
        const dhx = hx - bounty.x, dhy = hy - bounty.y;
        const dl = Math.hypot(dhx, dhy);
        let nx = bounty.x, ny = bounty.y;
        if (dl > ARRIVE_EPS_PX) {
          // §6.38 v7: bossSlowMult(クリの移動半減窓)を掛ける(帰巣中も他ボスの帰巣と同じ規約)。
          const mv = Math.min(bounty.speed * BOSS_LEASH_RETURN_SPEED_MULT * deltaTime * moveSpeedMult * bossSlowMult(bounty, newGameTime), dl);
          nx = bounty.x + (dhx / dl) * mv;
          ny = bounty.y + (dhy / dl) * mv;
        } else {
          nx = hx; ny = hy;
        }
        const clamped = resolveMove(nx, ny, bounty);
        patch.x = clamped.x; patch.y = clamped.y; patch.vx = 0; patch.vy = 0;
        patch.health = Math.min(bounty.maxHealth, bounty.health + BOSS_LEASH_REGEN_PER_SEC * deltaTime);
        const arrivedNow = Math.hypot(hx - clamped.x, hy - clamped.y) <= ARRIVE_EPS_PX;
        if (arrivedNow) {
          patch.dormant = true;
          patch.bountyLastEngagedAt = newGameTime; // 新しい1分(§2「接敵が切れて巣に戻ったら新しい1分」)
          patch.bountyDepartAt = undefined;
          patch.bossLeashSince = undefined;
          patch.bossState = undefined;
          patch.bossStateUntil = undefined;
          resetBrShotCycle(s); // §6.38 v10 #7: リーシュ帰巣(dormant化)=バス停の射撃サイクルをクリア
        }
      } else {
        // homeX/homeYが未設定(スポーン側の不備・防御的フォールバック): 現在地をそのまま巣として即帰巣扱い。
        patch.dormant = true;
        patch.bountyLastEngagedAt = newGameTime;
        patch.bossLeashSince = undefined;
        resetBrShotCycle(s); // §6.38 v10 #7: リーシュ帰巣(dormant化)=バス停の射撃サイクルをクリア
      }
      applyPatch(bounty.id, patch);
      return;
    }
  }

  // ---- ボスメーカー: 個別再生の要求箱の引き取り(毎フレーム1回・idolTick.tsのpendingPlayと同型) ----
  // 掟: 強制発動の前に**進行中の技の持ち越しを必ず捨てる**(中途半端な状態が残ると以後の挙動が
  // 「たまに変」になり、原因究明が地獄になる=idolTick.tsの掟をそのまま踏襲)。
  let forcedThisFrame = false;
  if (!countered && pendingBountyPlay !== null) {
    const req = pendingBountyPlay;
    pendingBountyPlay = null;
    if ((BOUNTY_MOVES_BY_TYPE[bounty.type] ?? []).includes(req.move)) {
      cancelBountyTechnique(s);
      s.farMs = 0; s.suiuHopIdx = 0;
      bountySoloActive = req.solo;
      bountyLoopMove = req.loop ? req.move : null;
      startBountyMove(req.move, { bounty, s, newGameTime, dist, pcx, pcy, bcx, bcy, sfx, patch });
      forcedThisFrame = true;
    } else {
      clearBountyPlayback(); // 別のボスの技キー(取り違え)。握り潰さず再生状態ごと消す。
    }
  }

  // ---- 技/移動の分岐(§4)。カウンター成立フレームは上でchaseへ落としているのでここには来ない ------
  if (!countered && !forcedThisFrame) {
    if (bounty.type === 'bounty-ranged') {
      tickRanged(bounty, s, newGameTime, deltaTime, moveSpeedMult, dist, pcx, pcy, bcx, bcy, sfx, patch);
    } else if (bounty.type === 'bounty-melee') {
      tickMelee(bounty, s, newGameTime, deltaTime, moveSpeedMult, dist, pcx, pcy, bcx, bcy, sfx, patch);
    } else if (bounty.type === 'bounty-balance') {
      tickBalance(bounty, s, newGameTime, deltaTime, moveSpeedMult, dist, pcx, pcy, bcx, bcy, sfx, patch);
    } else if (bounty.type === 'bounty-maiko') {
      tickMaiko(bounty, s, newGameTime, deltaTime, moveSpeedMult, dist, pcx, pcy, bcx, bcy, sfx, patch);
    }
    // 単独再生の終わり(idolTick.afterMoveと同じ位置づけ): 技が chase へ戻った**そのフレーム**で
    // 判定する=停止中に「余分な1フレームだけ歩く」が起きない。ループONなら同じ技をもう一度。
    if (bountySoloActive && patch.bossState === 'chase') {
      if (bountyLoopMove !== null) {
        cancelBountyTechnique(s);
        startBountyMove(bountyLoopMove, { bounty, s, newGameTime, dist, pcx, pcy, bcx, bcy, sfx, patch });
      } else {
        bountySoloActive = false;
      }
    }
  }

  applyPatch(bounty.id, patch);
};

// ---------------------------------------------------------------------------------------------
// 抑止ゲート(§2「出さない条件」・v6 F裁定)。B1では**用意してテストするだけ**——実際の producer
// (eventGateOkへの相乗り)配線はB4(社長発注)。デバッグ出現(`?bountynow=1`)はこのゲートを経由しない
// (「デバッグのみ」なので意図的にバイパス=検証を止めない)。
// ---------------------------------------------------------------------------------------------
export interface BountySpawnBlockInput {
  bossFightNow: boolean;   // ボス戦中(施設ロックと同じ土管)
  activeEvent: boolean;    // 囲い/救助等のイベント中
  hiddenBossAlive: boolean; // 裏ボス(mimir等)存命中
  /**
   * ★v0.25.3549(社長報告「小ボスと城ボスが5分に同時に出てきてます」): **交戦ボスが場に居るか**
   * (賞金首自身は除く=`isGhostEligibleBoss`)。
   *
   * なぜ `bossFightNow` だけでは足りなかったか: あちらは `bossEngagedNow` = **プレイヤーとの距離**で
   * 決まる「交戦中か」の判定。城ボスは 5:00(`CASTLE_BOSS_MIN_TIME_MS`)に**城の位置へ湧く**ので、
   * プレイヤーが着くまでは `bossFightNow === false`。**その「湧いたが未交戦」の窓に賞金首が入り込む。**
   * 3:00の賞金首が抑止(初心者ゾーン/緩コマ等)で繰り越されていると、ゲートが開いた瞬間=まさにこの窓に
   * 落ちて、**城ボスと小ボスが同時に出る**。
   *
   * 裏ボス(`hiddenBossAlive`)は最初から**存命**で見ていた。城ボスだけ交戦基準だったのが非対称=これが穴。
   */
  bossAlive: boolean;
  redNightActive: boolean; // 紅き夜中
  area: number;            // 憲法第4条: 初心者ゾーン(エリア0-1)では出さない
  storyBossOnly: boolean;  // storyBossOnlyステージ(ストーリー専用進行)
  labTheme: boolean;       // 研究所スキン(v6 B-5)
  corridorMode: boolean;   // 廊下モード(v6 B-5)
  tutorialStage: boolean;  // チュートリアル(farBackdrop==='tutorial')
}
export const bountySpawnBlocked = (input: BountySpawnBlockInput): boolean =>
  input.bossFightNow || input.bossAlive || input.activeEvent || input.hiddenBossAlive || input.redNightActive
  || input.area <= 1 || input.storyBossOnly || input.labTheme || input.corridorMode || input.tutorialStage;

// ---------------------------------------------------------------------------------------------
// 自然湧きの頻度ゲート(§2「頻度(叩き台)」・B4配線)。イベントproducer(eventGateOk)への相乗りに
// 加えて確認する専用の回数/CD条件。producer側(useGameLoop.ts)がgameTime/回数/CD/同時数/抑止ゲート/
// 緩コマ判定を集めてこの純関数へ渡すだけにし、判定ロジック自体はここへ1本化する。
// ---------------------------------------------------------------------------------------------
/** 固定スケジュール=3:00と7:00(§6.38 v8.3・社長裁定2026-08-15「3分と7分にして」)。
 * 旧: 初回5:00→3:00+CD90秒(v8.2)を、n回目の解禁時刻の表に置き換え。抑止ゲートで遅れた場合は
 * 解禁済みのまま=ゲートが開き次第出る(時刻を過ぎたら失効はしない)。
 * ※紅き夜は7:00→6:00へ移動(useGameLoop.RED_NIGHT_FIRE_AT_MS)=7:00の賞金首と重ならないように。 */
export const BOUNTY_NATURAL_SPAWN_AT_MS: readonly number[] = [180000, 420000];
export const BOUNTY_NATURAL_MAX_COUNT = BOUNTY_NATURAL_SPAWN_AT_MS.length;
/** 互換: 初回の解禁時刻(テスト・既存参照用)。 */
export const BOUNTY_NATURAL_FIRST_MS = BOUNTY_NATURAL_SPAWN_AT_MS[0];

export interface BountyNaturalSpawnInput {
  gameTime: number;
  spawnCount: number;     // このランで自然湧きした回数(消費済み・討伐/退場を問わない=B-4裁定)
  bountyAlive: boolean;   // 同時1体まで(既に賞金首が場に居る)
  spawnBlocked: boolean;  // bountySpawnBlockedの結果(ボス戦中/初心者ゾーン等)
  /**
   * ★v0.25.3550(社長裁定「b」)で**判定から外した**。フィールドは呼び出し側の互換のため残すが、
   * `bountyNaturalSpawnReady` はもう見ない(渡す値は結果を変えない)。
   *
   * なぜ外したか(社長報告「そもそも5分に出てくるのはおかしい。3分に出てこないし」):
   * 旧仕様は「**通常コマでだけ**告知する(第5条『緩を荒らさない』)」だったが、これと固定スケジュール
   * (3:00/7:00)の**位相が構造的に噛み合っていなかった**。4コマは 緩→収穫→通常→ピークで、緩と収穫は
   * きっかり40秒、通常とピークは40秒＋片付き(最大+30秒)。よって通常コマの窓は
   * **1周目=80秒〜120〜150秒 / 2周目=240〜300秒〜** で、**180秒(3:00)はどの通常コマにも入らない**
   * (1周目の通常は最長150秒で終わり、2周目の通常は最速240秒から)。
   * ⇒ **賞金首①は設定時刻に出られる可能性がゼロ**で、「遅れても失効しない」仕様により次の通常コマ
   * (4:00〜5:00)まで持ち越され、そこで漏れていた=社長が見た「5分の小ボス」。
   *
   * 社長裁定は**時刻優先**(案b「時刻に達したらコマを無視して出す」)。緩コマに賞金首が降ってくることは
   * 承知の上での決定=**第5条より時刻表が優先**する、と読む。
   */
  calmOk?: boolean;
}
export const bountyNaturalSpawnReady = (input: BountyNaturalSpawnInput): boolean =>
  input.spawnCount < BOUNTY_NATURAL_MAX_COUNT
  && input.gameTime >= BOUNTY_NATURAL_SPAWN_AT_MS[input.spawnCount]
  && !input.bountyAlive
  && !input.spawnBlocked;
  // ★v0.25.3550(社長裁定「b」): `calmOk`(通常コマ限定)は判定から外した。理由は上のコメント。

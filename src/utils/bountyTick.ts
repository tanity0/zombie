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
import type { Enemy, EnemyType } from '../types/game';
import {
  useGameStore, HUNTER_LEAVE_FADE_MS, resolveBountyMove,
  counterReplyDamage, skillLevel, BOSS_CRIT_DAMAGE_MULT, counterMasterAwakenBuffPatch,
  COUNTER_HITSTOP_MS, COUNTER_SHAKE_MS, COUNTER_SHAKE_MAG, COUNTER_ZOOM_MAG,
  MELEE_FINISH_SLOW_MS, MELEE_FINISH_SLOW_HOLD_MS, knockbackSpeedFor, enemyDeathLabel,
  WEREWOLF_WINDUP_MS, WEREWOLF_CHARGE_MAX_MS, WEREWOLF_CHARGE_SPEED_MULT,
  PUMPKIN_CROUCH_MS, PUMPKIN_JUMP_MS, PUMPKIN_RECOVER_MS,
  bossSlowMult,
} from '../store/gameStore';
// ★予告寸法は依存ゼロの葉(bountyDims.ts)が正=ここでは使うだけ+従来の消費者(pixiScene/テスト)の
// ために named re-export する。gameStoreから直接importしない理由はbountyDims.ts冒頭を読むこと
// (循環import起動全損 v0.25.3390 の再発防止)。
import {
  BB_SWEEP_HALFWIDTH, BB_LEAP_RADIUS,
  MK_NAGINATA_HALFWIDTH, MK_SPIN_RADIUS, MK_SUIU_RADIUS, MK_SUIU_FINAL_RADIUS_MULT,
  BOUNTY_BASE_HP,
} from './bountyDims';
export {
  BB_SWEEP_HALFWIDTH, BB_LEAP_RADIUS,
  MK_NAGINATA_HALFWIDTH, MK_SPIN_RADIUS, MK_SUIU_RADIUS, MK_SUIU_FINAL_RADIUS_MULT,
  BOUNTY_BASE_HP,
};
import { clampRectToPlayableArea, type PlayableAreaCtx } from '../world/playableArea';
import { isBountyType, AREA_BASE_DIFFICULTY, createEnemyProjectile, spawnEnemyAt } from './enemyUtils';
import { effectiveDifficultyArea, lerpAreaTable } from './timeDifficulty';
import { EVENT_BANNER_MS } from './directorTick';
import {
  bossLeashDistancePx, advanceBossDisengageGrace,
  BOSS_LEASH_REGEN_PER_SEC, BOSS_LEASH_RETURN_SPEED_MULT,
} from './bossEngagement';
import { withRecoverFloor } from './bossTelegraph';
import { advanceLingerMs } from './bossSkeleton';
import { isCounterablePhase, phaseJustChanged } from './bossScript';
// §6.38 B2b: distToSegmentはgeometry.ts(依存ゼロ)から直接import(levelUpGate.ts経由をやめた)。
// levelUpGate.tsが賞金首の技の実寸法をbountyTick.tsからimportする際、逆import(循環)を作らないため。
import { distToSegment } from './geometry';
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

/**
 * §3/v2 F項(実効難易度倍率の唯一の出どころ): HP・金箱の価値のどちらも「基準値×この倍率」で計算する。
 * CONSTANT_STRENGTH_TYPES(=fixed)なのでbuildEnemy自体は倍率を掛けない(色/距離/時間で自動スケール
 * しない型のため)。呼び出し側がスポーン後パッチ/pickup生成時に明示的に掛ける
 * (AREA_BASE_DIFFICULTYは他の通常敵と同じ表=値の出どころを1つに保つ)。
 */
export const bountyEffectiveValueMult = (area: number, gameTimeMs: number): number =>
  lerpAreaTable(AREA_BASE_DIFFICULTY, effectiveDifficultyArea(area, gameTimeMs));

/** §3「HP: 基準2000(叩き台)×スポーン時の実効難易度倍率」。 */
export const bountyMaxHealth = (area: number, gameTimeMs: number): number =>
  Math.round(BOUNTY_BASE_HP * bountyEffectiveValueMult(area, gameTimeMs));

/** 滞在1分(§2)。dormantのまま(=交戦していない)これだけ経つと退場する。gameTime基準(ポーズで進まない)。 */
export const BOUNTY_LINGER_MS = 60000;
/** 交戦の定義(v6 B「純関数化」)のうち「直近○秒以内に被弾」の窓。壁時計(enemy.lastHit=Date.now()基準)。 */
export const BOUNTY_HIT_ENGAGE_MS = 3000;
/** 起床演出(holo-circle 1周)の長さ。v2 C裁定の「約700ms」。 */
export const BOUNTY_WAKE_FX_MS = 700;
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
}
export const createBountyTickState = (): BountyTickState => ({
  activeId: null, aimVX: 0, aimVY: 0, farMs: 0, comboStep: 0, escortsSummoned: false,
  suiuHopIdx: 0, suiuTx: 0, suiuTy: 0,
});
const resetBountyRunState = (s: BountyTickState): void => {
  s.aimVX = 0; s.aimVY = 0; s.farMs = 0; s.comboStep = 0; s.escortsSummoned = false;
  s.suiuHopIdx = 0; s.suiuTx = 0; s.suiuTy = 0;
};

// ---- カウンター(全4体で共通の1本。W7=windup中/硬直中の接触=可) --------------------------------
// レーザー('laser-*')はここに含めない: v0.25.2961裁定どおり紫=カウンター不可(近接中断は
// mimirLaserBreakOnMeleeHitが別枠で処理する専用の「弱点を突いて壊す」機構=標準カウンターとは別物)。
const BOUNTY_WINDUP_STATES: readonly string[] = [
  'br-push-windup', 'bm-charge-windup', 'bm-combo1-windup', 'bm-combo2-windup', 'bm-combo3-windup', 'bm-snipe-windup',
  'bb-sweep-windup', 'leap-windup',
  'mk-naginata-windup', 'mk-naginata1-windup', 'mk-naginata2-windup', 'mk-spin-windup', 'mk-suiu-windup', 'mk-boom-windup',
];
const BOUNTY_RECOVER_STATES: readonly string[] = [
  'br-push-recover', 'bm-charge-recover', 'bm-combo1-recover', 'bm-combo2-recover', 'bm-combo3-recover', 'bm-snipe-recover',
  'bb-sweep-recover', 'leap-recover',
  'mk-naginata-recover', 'mk-naginata1-recover', 'mk-naginata2-recover', 'mk-spin-recover', 'mk-suiu-recover', 'mk-boom-recover',
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

// ---- バス停(bounty-ranged): 距離帯+技の定数 -----------------------------------------------------
const BR_KITE_MIN = 340;  // これより近いと後退(引き撃ちの帯を保つ)
const BR_KITE_MAX = 560;  // これより遠いと詰める(リーシュ圏内を保つ・遠すぎて発見されない事故の防止)
const BR_PUSH_RANGE = 110; // 近接されたら押しのけの発動距離(§4「近接されたら押しのけ」)
// 通常のポツポツ撃ち(§7-12「銃弾以外」の除外=予兆不要。共通弾)。
// exportはpixiScene(FB1・武器スプライトの技スコープ表示)が発射直後の残心ウィンドウを
// 算出するために読む(bossNextActionAtから逆算=新規フィールドを増やさない)。
export const BR_SHOT_INTERVAL_MS = 1100;
// 発射直後、標識を構えた絵を残す時間(boss-gunの反動フェードと同じ考え方。判定には無関係=見た目専用)。
export const BR_SHOT_RECOIL_VIS_MS = 260;
const BR_SHOT_PROFILE = { speed: 260, damage: 10, size: 10 } as const;
// 押しのけ(小KB・カウンター可・分類1=判定に揃える。得物=標識の薙ぎ)
export const BR_PUSH_WINDUP_MS = 500;
const BR_PUSH_RANGE_PX = 82;
export const BR_PUSH_HALFWIDTH = 34;
const BR_PUSH_DAMAGE = 8;
const BR_PUSH_KB = { distPx: 100, ms: 240 } as const;
const BR_PUSH_RECOVER_MS = withRecoverFloor(700);
// 輸入=ミーミル型レーザー(§4②)。寸法・溜め・発射時間は本物の複製(=完全同一)。§6.38 B2bで
// RANGE/HALF_WIDTH/FIRE_MSの全てをmimirLaserTrack.tsの実定数からimportする形に統一した
// (旧: useGameLoop.ts側の私有定数をコメントで手写ししていたのを撤去。社長指摘対応=単一の出どころ)。
export const BR_LASER_RANGE = MIMIR_LASER_RANGE;
export const BR_LASER_HALFWIDTH = MIMIR_LASER_HALF_WIDTH;
export const BR_LASER_FIRE_MS = MIMIR_LASER_FIRE_MS;
const BR_LASER_RECOVER_MS = withRecoverFloor(900);
const BR_LASER_DAMAGE = 24; // 弱体化可(v6裁定)。本家42の約6割
// バス停は抽選(mimirScriptのstring抽選)を持たないため、頻度は専用CDで作る(叩き台)。
const BR_LASER_NORMAL_CD_MS = 9000;
// 取り巻き召喚(§4①②・ニアール型=交戦開始1回だけ・再召喚なし・fromEventは立てない=B1.5-3と同じ理由)。
export const BR_ESCORT_COUNT = 2;
const BR_ESCORT_TYPE: EnemyType = 'zombie';

// ---- 馬乗り(bounty-melee): 距離帯+技の定数 -------------------------------------------------------
const BM_MELEE_MAX = 130; // 密着=コンボ帯
const BM_FAR_MS = 2000;   // 遠距離2秒で懲罰狙撃発火(§4③「近寄らざるを得ない」)
// 突進(輸入=werewolfのwindup→charge・§4①)。値はgameStore.tsのWEREWOLF_*定数の複製(完全同一)。
const BM_CHARGE_WINDUP_MS = WEREWOLF_WINDUP_MS;
const BM_CHARGE_MAX_MS = WEREWOLF_CHARGE_MAX_MS;
const BM_CHARGE_SPEED_MULT = WEREWOLF_CHARGE_SPEED_MULT;
const BM_CHARGE_REACH = 420; // 突進の狙い距離(px・werewolfのreach式の叩き台)
const BM_CHARGE_RECOVER_MS = withRecoverFloor(700);
// 3段コンボ(速→速→遅・bossSkeletonのミドラ規約=最大3段・終端パニッシュ窓の流儀。得物=鞭の連打)。
const BM_COMBO_RANGE = 130;
export const BM_COMBO_HALFWIDTH = 28;
export const BM_COMBO_WINDUP_MS: readonly [number, number, number] = [480, 480, 900];
const BM_COMBO_DAMAGE: readonly [number, number, number] = [14, 14, 20];
const BM_COMBO_STEP_RECOVER_MS = 220; // 1・2段目の間だけ(短い・カウンター可)
const BM_COMBO_FINISH_RECOVER_MS = withRecoverFloor(1400); // 終端=確定パニッシュ窓(§4「見せ場」)
const BM_COMBO_KB = { distPx: 70, ms: 220 } as const; // 終段だけ小さく押し出す
// 輸入=懲罰狙撃(§4③・idolScript snipeの値を複製=完全同一。ダメージのみ弱体化)。
export const BM_SNIPE_WINDUP_MS = 1100;
export const BM_SNIPE_ACTIVE_MS = 200;
const BM_SNIPE_RANGE = 900;
export const BM_SNIPE_HALFWIDTH = 40;
const BM_SNIPE_DAMAGE = 22;
const BM_SNIPE_RECOVER_MS = withRecoverFloor(900);
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
  for (let i = 0; i < BR_ESCORT_COUNT; i++) {
    const ang = (Math.PI * 2 * i) / BR_ESCORT_COUNT + Math.random() * 0.4;
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

  if (st === 'chase') {
    if (!s.escortsSummoned) {
      s.escortsSummoned = true;
      summonBountyEscorts(bounty, newGameTime);
    }
    if (dist <= BR_PUSH_RANGE) {
      sfx.alert();
      const ang = Math.atan2(pcy - bcy, pcx - bcx);
      patch.aiFromX = bcx; patch.aiFromY = bcy;
      patch.aiTargetX = bcx + Math.cos(ang) * BR_PUSH_RANGE_PX;
      patch.aiTargetY = bcy + Math.sin(ang) * BR_PUSH_RANGE_PX;
      patch.bossState = 'br-push-windup';
      patch.bossStateUntil = newGameTime + BR_PUSH_WINDUP_MS;
      return;
    }
    if (newGameTime >= (bounty.mimirLaserReadyAt ?? 0) && dist > BR_KITE_MIN) {
      sfx.alert();
      const ang = Math.atan2(pcy - bcy, pcx - bcx);
      patch.aiFromX = bcx; patch.aiFromY = bcy;
      patch.aiTargetX = bcx + Math.cos(ang) * BR_LASER_RANGE;
      patch.aiTargetY = bcy + Math.sin(ang) * BR_LASER_RANGE;
      s.aimVX = 0; s.aimVY = 0;
      patch.bossState = 'laser-windup';
      patch.bossStateUntil = newGameTime + 3000; // = mimirLaserTrack.MIMIR_LASER_WINDUP_MS(直接値。定数はimport済みで下のtestが一致検査)
      return;
    }
    // 中立: kite(引き撃ち)+通常のポツポツ撃ち(§7-12除外=予兆不要)。
    // §6.38 v7: isBossType編入でクリが移動半減(bossSlowUntil)を打つようになった=城ボス等と同じく
    // bossSlowMultを移動速度へ掛ける(掛けないとリング表示だけ出て実際は減速しない見掛け倒しになる)。
    const dt = deltaTime * moveSpeedMult * bossSlowMult(bounty, newGameTime);
    if (dist < BR_KITE_MIN && dist > 1) {
      const ux = (bcx - pcx) / dist, uy = (bcy - pcy) / dist;
      const spd = bounty.speed * dt;
      const c = resolveMove(bounty.x + ux * spd, bounty.y + uy * spd, bounty);
      patch.x = c.x; patch.y = c.y; patch.vx = ux * bounty.speed; patch.vy = uy * bounty.speed;
    } else if (dist > BR_KITE_MAX && dist > 1) {
      const ux = (pcx - bcx) / dist, uy = (pcy - bcy) / dist;
      const spd = bounty.speed * dt;
      const c = resolveMove(bounty.x + ux * spd, bounty.y + uy * spd, bounty);
      patch.x = c.x; patch.y = c.y; patch.vx = ux * bounty.speed; patch.vy = uy * bounty.speed;
    } else {
      patch.vx = 0; patch.vy = 0;
    }
    if (newGameTime >= (bounty.bossNextActionAt ?? 0)) {
      patch.bossNextActionAt = newGameTime + BR_SHOT_INTERVAL_MS;
      const ang = Math.atan2(pcy - bcy, pcx - bcx);
      useGameStore.getState().addProjectile(createEnemyProjectile(
        bounty, useGameStore.getState().player, bcx + Math.cos(ang) * 100, bcy + Math.sin(ang) * 100,
        undefined, undefined, BR_SHOT_PROFILE,
      ));
    }
    return;
  }

  if (st === 'br-push-windup') {
    if (newGameTime >= (bounty.bossStateUntil ?? 0)) {
      const fx = bounty.aiFromX ?? bcx, fy = bounty.aiFromY ?? bcy;
      const tx = bounty.aiTargetX ?? bcx, ty = bounty.aiTargetY ?? bcy;
      hitCapsule(bounty, fx, fy, tx, ty, BR_PUSH_HALFWIDTH, BR_PUSH_DAMAGE, BR_PUSH_KB);
      patch.bossState = 'br-push';
      patch.bossStateUntil = newGameTime + 120;
    }
    return;
  }
  if (st === 'br-push') {
    if (newGameTime >= (bounty.bossStateUntil ?? 0)) {
      patch.bossState = 'br-push-recover';
      patch.bossStateUntil = newGameTime + BR_PUSH_RECOVER_MS;
    }
    return;
  }
  if (st === 'br-push-recover') {
    if (newGameTime >= (bounty.bossStateUntil ?? 0)) {
      patch.bossState = 'chase';
      patch.bossNextActionAt = newGameTime + BOUNTY_NEUTRAL_MS;
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
      useGameStore.getState().damagePlayer(BR_LASER_DAMAGE, `${enemyDeathLabel(bounty.type)}のレーザー`, ppx, ppy);
    }
    if (newGameTime >= (bounty.bossStateUntil ?? 0)) {
      patch.bossState = 'laser-recover';
      patch.bossStateUntil = newGameTime + BR_LASER_RECOVER_MS;
      patch.mimirLaserReadyAt = newGameTime + BR_LASER_NORMAL_CD_MS;
    }
    return;
  }
  if (st === 'laser-recover' || st === 'laser-broken') {
    if (newGameTime >= (bounty.bossStateUntil ?? 0)) {
      patch.bossState = 'chase';
      patch.bossNextActionAt = newGameTime + BOUNTY_NEUTRAL_MS;
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
  const caps = mimirLaserTrackCaps(useGameStore.getState().player.speed ?? 87);
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

  if (st === 'chase') {
    const stepMs = deltaTime * 1000;
    s.farMs = advanceLingerMs(s.farMs, dist > BM_MELEE_MAX * 3, stepMs);
    if (s.farMs >= BM_FAR_MS) {
      s.farMs = 0;
      sfx.alert();
      const dl = dist || 1;
      patch.aiFromX = bcx; patch.aiFromY = bcy;
      patch.aiTargetX = bcx + ((pcx - bcx) / dl) * BM_SNIPE_RANGE;
      patch.aiTargetY = bcy + ((pcy - bcy) / dl) * BM_SNIPE_RANGE;
      patch.bossState = 'bm-snipe-windup';
      patch.bossStateUntil = newGameTime + BM_SNIPE_WINDUP_MS;
      return;
    }
    if (dist <= BM_MELEE_MAX) {
      sfx.alert();
      s.comboStep = 1;
      const ang = Math.atan2(pcy - bcy, pcx - bcx);
      patch.aiFromX = bcx; patch.aiFromY = bcy;
      patch.aiTargetX = bcx + Math.cos(ang) * BM_COMBO_RANGE;
      patch.aiTargetY = bcy + Math.sin(ang) * BM_COMBO_RANGE;
      patch.bossState = 'bm-combo1-windup';
      patch.bossStateUntil = newGameTime + BM_COMBO_WINDUP_MS[0];
      return;
    }
    // 突進は「中距離を詰める」役(BM_CHARGE_REACH圏内だけ)。真の遠距離はここで割り込ませず
    // farMsを積ませ続ける(=懲罰狙撃が必ず発火する。突進が毎tick先取りしてfarMsの窓を潰さないため)。
    if (dist <= BM_CHARGE_REACH && newGameTime >= (bounty.bossNextActionAt ?? 0)) {
      sfx.alert();
      const dl = dist || 1;
      patch.aiFromX = bcx; patch.aiFromY = bcy;
      patch.aiTargetX = bcx + ((pcx - bcx) / dl) * BM_CHARGE_REACH;
      patch.aiTargetY = bcy + ((pcy - bcy) / dl) * BM_CHARGE_REACH;
      patch.bossState = 'bm-charge-windup';
      patch.bossStateUntil = newGameTime + BM_CHARGE_WINDUP_MS;
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
      patch.bossStateUntil = newGameTime + BM_CHARGE_MAX_MS;
    }
    return;
  }
  if (st === 'bm-charge') {
    const tx = bounty.aiTargetX ?? bcx, ty = bounty.aiTargetY ?? bcy;
    const dl = Math.hypot(tx - bcx, ty - bcy);
    if (dl > 2) {
      const spd = bounty.speed * BM_CHARGE_SPEED_MULT * deltaTime * moveSpeedMult * bossSlowMult(bounty, newGameTime);
      const step = Math.min(spd, dl);
      const c = resolveMove(bounty.x + ((tx - bcx) / dl) * step, bounty.y + ((ty - bcy) / dl) * step, bounty);
      patch.x = c.x; patch.y = c.y;
    }
    if (dl <= 2 || newGameTime >= (bounty.bossStateUntil ?? 0)) {
      patch.vx = 0; patch.vy = 0;
      patch.bossState = 'bm-charge-recover';
      patch.bossStateUntil = newGameTime + BM_CHARGE_RECOVER_MS;
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
        bounty, fx, fy, tx, ty, BM_COMBO_HALFWIDTH, BM_COMBO_DAMAGE[step],
        step === 2 ? BM_COMBO_KB : undefined,
      );
      if (step < 2) {
        patch.bossState = step === 0 ? 'bm-combo1-recover' : 'bm-combo2-recover';
        patch.bossStateUntil = newGameTime + BM_COMBO_STEP_RECOVER_MS;
      } else {
        patch.bossState = 'bm-combo3-recover';
        patch.bossStateUntil = newGameTime + BM_COMBO_FINISH_RECOVER_MS;
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
      patch.aiTargetX = bcx + Math.cos(ang) * BM_COMBO_RANGE;
      patch.aiTargetY = bcy + Math.sin(ang) * BM_COMBO_RANGE;
      patch.bossState = nextStep === 2 ? 'bm-combo2-windup' : 'bm-combo3-windup';
      patch.bossStateUntil = newGameTime + BM_COMBO_WINDUP_MS[nextStep - 1];
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
      patch.bossStateUntil = newGameTime + BM_SNIPE_ACTIVE_MS;
    }
    return;
  }
  if (st === 'bm-snipe') {
    const fx = bounty.aiFromX ?? bcx, fy = bounty.aiFromY ?? bcy;
    const tx = bounty.aiTargetX ?? bcx, ty = bounty.aiTargetY ?? bcy;
    const player = useGameStore.getState().player;
    const ppx = player.x + player.width / 2, ppy = player.y + player.height / 2;
    const pr = Math.max(player.width, player.height) / 2;
    if (distToSegment({ x: ppx, y: ppy }, { x: fx, y: fy }, { x: tx, y: ty }) <= BM_SNIPE_HALFWIDTH + pr) {
      useGameStore.getState().damagePlayer(BM_SNIPE_DAMAGE, `${enemyDeathLabel(bounty.type)}の狙撃`, ppx, ppy);
    }
    if (newGameTime >= (bounty.bossStateUntil ?? 0)) {
      patch.bossState = 'bm-snipe-recover';
      patch.bossStateUntil = newGameTime + BM_SNIPE_RECOVER_MS;
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

// ---- 鋏(bounty-balance): 距離帯+技の定数(ER §1-4型・近=薙ぎ払い/遠=跳びかかり) --------------------
const BB_NEAR_MAX = 170;
const BB_SWEEP_RANGE = 150;
export const BB_SWEEP_WINDUP_MS = 750;
const BB_SWEEP_DAMAGE = 18;
const BB_SWEEP_RECOVER_MS = withRecoverFloor(900);
// 跳びかかり(輸入=pumpkin。値はgameStore.PUMPKIN_*を直接importして使う=複製しない。v2 A節の掟
// 「跳躍はpumpkinのaiPhase機構を流用せず-windup/-air/-recoverとしてbossState側に再実装」)。
export const BB_LEAP_WINDUP_MS = PUMPKIN_CROUCH_MS;
export const BB_LEAP_AIR_MS = PUMPKIN_JUMP_MS;
const BB_LEAP_RECOVER_MS = PUMPKIN_RECOVER_MS;
const BB_LEAP_DAMAGE = 22;

const tickBalance = (
  bounty: Enemy, _s: BountyTickState, newGameTime: number, deltaTime: number, moveSpeedMult: number,
  dist: number, pcx: number, pcy: number, bcx: number, bcy: number, sfx: BountySfx,
  patch: Partial<Enemy>,
): void => {
  const st = bounty.bossState ?? 'chase';

  if (st === 'chase') {
    if (dist <= BB_NEAR_MAX) {
      sfx.alert();
      const ang = Math.atan2(pcy - bcy, pcx - bcx);
      patch.aiFromX = bcx; patch.aiFromY = bcy;
      patch.aiTargetX = bcx + Math.cos(ang) * BB_SWEEP_RANGE;
      patch.aiTargetY = bcy + Math.sin(ang) * BB_SWEEP_RANGE;
      patch.bossState = 'bb-sweep-windup';
      patch.bossStateUntil = newGameTime + BB_SWEEP_WINDUP_MS;
      return;
    }
    if (newGameTime >= (bounty.bossNextActionAt ?? 0)) {
      sfx.alert();
      // 着地点=溜め開始時のプレイヤー位置スナップ(pumpkinと同じ「狙って置かれる」型)。
      patch.aiTargetX = pcx; patch.aiTargetY = pcy;
      patch.bossState = 'leap-windup';
      patch.bossStateUntil = newGameTime + BB_LEAP_WINDUP_MS;
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
      hitCapsule(bounty, fx, fy, tx, ty, BB_SWEEP_HALFWIDTH, BB_SWEEP_DAMAGE);
      patch.bossState = 'bb-sweep-recover';
      patch.bossStateUntil = newGameTime + BB_SWEEP_RECOVER_MS;
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
      patch.bossStateUntil = newGameTime + BB_LEAP_AIR_MS;
    }
    return;
  }
  if (st === 'leap-air') {
    // 空中移動(見た目のみ。判定は着地の瞬間の円=下)。着地点は溜め開始時にロック済み(aiTargetX/Y)。
    const tx = bounty.aiTargetX ?? bcx, ty = bounty.aiTargetY ?? bcy;
    const airMs = BB_LEAP_AIR_MS;
    const remain = (bounty.bossStateUntil ?? newGameTime) - newGameTime;
    const t = Math.max(0, Math.min(1, 1 - remain / airMs));
    patch.x = (bcx + (tx - bcx) * t) - bounty.width / 2;
    patch.y = (bcy + (ty - bcy) * t) - bounty.height / 2;
    if (newGameTime >= (bounty.bossStateUntil ?? 0)) {
      hitCapsule(bounty, tx, ty, tx, ty, BB_LEAP_RADIUS, BB_LEAP_DAMAGE);
      patch.vx = 0; patch.vy = 0;
      patch.bossState = 'leap-recover';
      patch.bossStateUntil = newGameTime + BB_LEAP_RECOVER_MS;
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
const MK_NEAR_MAX = 150;
const MK_FAR_MIN = 380; // 手毬打ちの間合い
const MK_PHASE_HP_FRAC = 0.5;
export const MK_REPOSE_MS = 500; // 型切替時の舞い直し(短硬直・無敵なし)
// 毬の薙ぎ(型A単発・windup=2択ランダム=変則ディレイ)。
const MK_NAGINATA_RANGE = 140;
export const MK_NAGINATA_WINDUP_CHOICES: readonly [number, number] = [700, 1150];
const MK_NAGINATA_DAMAGE = 16;
const MK_NAGINATA_RECOVER_MS = withRecoverFloor(900);
// 毬の薙ぎ・連(型B・2連・速→遅の順固定=レラーナ経験則。各段が独立して2択から抽選=個別予告)。
export const MK_NAGINATA1_WINDUP_CHOICES: readonly [number, number] = [550, 750]; // 速(1段目)
export const MK_NAGINATA2_WINDUP_CHOICES: readonly [number, number] = [900, 1300]; // 遅(2段目)
const MK_NAGINATA_STEP_RECOVER_MS = 220;
// 毬回し(自分中心円・windup=2択ランダム)。★AOE_TELEGRAPH_AUDIT登録対象(escapeMs=短い方=800)。
export const MK_SPIN_WINDUP_CHOICES: readonly [number, number] = [800, 1300];
export const MK_SPIN_ACTIVE_MS = 500;
const MK_SPIN_DAMAGE = 14;
const MK_SPIN_RECOVER_MS = withRecoverFloor(900);
// 水鳥乱舞(型B専用大技・毬3連バウンド・マレニア§2-4)。着地点=プレイヤー現在位置+抽選オフセット
// (clampRectToPlayableArea適用)。ホップ間隔=2種ランダム(=各ホップの予告時間そのもの)。
// 最終段のみ大円。ホップ中の毬に接触判定なし=着地円のみ(v5承認)。乱舞後は長め硬直(パニッシュ窓)。
export const MK_SUIU_HOP_INTERVAL_CHOICES: readonly [number, number] = [400, 600]; // 予告(telegraph)分
export const MK_SUIU_HOP_TRAVEL_MS = 260; // 着地直前の移動(予告は継続表示=escapeMsに含む)
const MK_SUIU_DAMAGE = 16;
const MK_SUIU_OFFSET_RANGE = 90;
const MK_SUIU_RECOVER_MS = withRecoverFloor(1500);
// 手毬打ち(遠距離・打ち出し→戻るブーメラン軌道。判定=毬の絵に揃える=共通弾ではない)。
export const MK_BOOM_RANGE = 500;
export const MK_BOOM_HITRADIUS = 30;
export const MK_BOOM_WINDUP_MS = 750;
export const MK_BOOM_OUT_MS = 420;
export const MK_BOOM_BACK_MS = 420;
const MK_BOOM_DAMAGE = 14;
const MK_BOOM_RECOVER_MS = withRecoverFloor(900);

/** 変則ディレイ(§4 v4「マルギット型」): 2値から毎回独立に抽選(連続同値も許す=乱数を持ち越さない)。 */
const pick2 = (choices: readonly [number, number]): number => (Math.random() < 0.5 ? choices[0] : choices[1]);

const tickMaiko = (
  bounty: Enemy, s: BountyTickState, newGameTime: number, deltaTime: number, moveSpeedMult: number,
  dist: number, pcx: number, pcy: number, bcx: number, bcy: number, sfx: BountySfx,
  patch: Partial<Enemy>,
): void => {
  const st = bounty.bossState ?? 'chase';
  const phase: 1 | 2 = bounty.bossPhase === 2 ? 2 : 1;

  if (st === 'chase') {
    // 型切替(v6 C-5「実行中の技は完走してから」=chaseに戻ってから判定するので自然に満たす。1回だけ)。
    const hpFrac = bounty.maxHealth > 0 ? bounty.health / bounty.maxHealth : 1;
    if (phase === 1 && hpFrac <= MK_PHASE_HP_FRAC) {
      patch.bossPhase = 2;
      if (phaseJustChanged(bounty.bossPhase, 2)) patch.bossPhaseFlashUntil = newGameTime + 1200;
      patch.bossState = 'mk-repose';
      patch.bossStateUntil = newGameTime + MK_REPOSE_MS;
      return;
    }

    if (dist <= MK_NEAR_MAX) {
      sfx.alert();
      const ang = Math.atan2(pcy - bcy, pcx - bcx);
      patch.aiFromX = bcx; patch.aiFromY = bcy;
      patch.aiTargetX = bcx + Math.cos(ang) * MK_NAGINATA_RANGE;
      patch.aiTargetY = bcy + Math.sin(ang) * MK_NAGINATA_RANGE;
      patch.bossWindupStartAt = newGameTime; // v6 C-1: 変則ディレイは開始時刻を併記(描画側の進行度算出用)
      if (phase === 1) {
        const w = pick2(MK_NAGINATA_WINDUP_CHOICES);
        patch.bossState = 'mk-naginata-windup';
        patch.bossStateUntil = newGameTime + w;
      } else {
        s.comboStep = 1;
        const w = pick2(MK_NAGINATA1_WINDUP_CHOICES);
        patch.bossState = 'mk-naginata1-windup';
        patch.bossStateUntil = newGameTime + w;
      }
      return;
    }

    if (newGameTime >= (bounty.bossNextActionAt ?? 0)) {
      const roll = Math.random();
      if (phase === 2 && roll < 0.4) {
        sfx.alert();
        s.suiuHopIdx = 0;
        patch.bossState = 'mk-suiu-windup';
        patch.bossStateUntil = newGameTime + 500;
        return;
      }
      if (dist > MK_FAR_MIN && roll < (phase === 2 ? 0.75 : 0.7)) {
        sfx.alert();
        patch.aiFromX = bcx; patch.aiFromY = bcy;
        const dl = dist || 1;
        patch.aiTargetX = bcx + ((pcx - bcx) / dl) * MK_BOOM_RANGE;
        patch.aiTargetY = bcy + ((pcy - bcy) / dl) * MK_BOOM_RANGE;
        patch.bossState = 'mk-boom-windup';
        patch.bossStateUntil = newGameTime + MK_BOOM_WINDUP_MS;
        return;
      }
      sfx.alert();
      patch.bossWindupStartAt = newGameTime;
      patch.bossState = 'mk-spin-windup';
      patch.bossStateUntil = newGameTime + pick2(MK_SPIN_WINDUP_CHOICES);
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
      hitCapsule(bounty, fx, fy, tx, ty, MK_NAGINATA_HALFWIDTH, MK_NAGINATA_DAMAGE);
      patch.bossState = 'mk-naginata-recover';
      patch.bossStateUntil = newGameTime + MK_NAGINATA_RECOVER_MS;
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
      hitCapsule(bounty, fx, fy, tx, ty, MK_NAGINATA_HALFWIDTH, MK_NAGINATA_DAMAGE);
      patch.bossState = 'mk-naginata1-recover';
      patch.bossStateUntil = newGameTime + MK_NAGINATA_STEP_RECOVER_MS;
    }
    return;
  }
  if (st === 'mk-naginata1-recover') {
    if (newGameTime >= (bounty.bossStateUntil ?? 0)) {
      s.comboStep = 2;
      const ang = Math.atan2(pcy - bcy, pcx - bcx);
      patch.aiFromX = bcx; patch.aiFromY = bcy;
      patch.aiTargetX = bcx + Math.cos(ang) * MK_NAGINATA_RANGE;
      patch.aiTargetY = bcy + Math.sin(ang) * MK_NAGINATA_RANGE;
      patch.bossWindupStartAt = newGameTime;
      patch.bossState = 'mk-naginata2-windup';
      patch.bossStateUntil = newGameTime + pick2(MK_NAGINATA2_WINDUP_CHOICES);
    }
    return;
  }
  if (st === 'mk-naginata2-windup') {
    if (newGameTime >= (bounty.bossStateUntil ?? 0)) {
      const fx = bounty.aiFromX ?? bcx, fy = bounty.aiFromY ?? bcy;
      const tx = bounty.aiTargetX ?? bcx, ty = bounty.aiTargetY ?? bcy;
      hitCapsule(bounty, fx, fy, tx, ty, MK_NAGINATA_HALFWIDTH, MK_NAGINATA_DAMAGE);
      s.comboStep = 0;
      patch.bossState = 'mk-naginata2-recover';
      patch.bossStateUntil = newGameTime + MK_NAGINATA_RECOVER_MS;
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
      patch.bossStateUntil = newGameTime + MK_SPIN_ACTIVE_MS;
    }
    return;
  }
  if (st === 'mk-spin') {
    if (Math.hypot(pcx - bcx, pcy - bcy) <= MK_SPIN_RADIUS + Math.max(useGameStore.getState().player.width, useGameStore.getState().player.height) / 2) {
      useGameStore.getState().damagePlayer(MK_SPIN_DAMAGE, `${enemyDeathLabel(bounty.type)}の毬回し`, pcx, pcy);
    }
    if (newGameTime >= (bounty.bossStateUntil ?? 0)) {
      patch.bossState = 'mk-spin-recover';
      patch.bossStateUntil = newGameTime + MK_SPIN_RECOVER_MS;
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
      const off = MK_SUIU_OFFSET_RANGE;
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
      patch.bossStateUntil = newGameTime + pick2(MK_SUIU_HOP_INTERVAL_CHOICES) + MK_SUIU_HOP_TRAVEL_MS;
    }
    return;
  }
  if (st === 'mk-suiu-hop1' || st === 'mk-suiu-hop2' || st === 'mk-suiu-hop3') {
    if (newGameTime >= (bounty.bossStateUntil ?? 0)) {
      const hopIdx = st === 'mk-suiu-hop1' ? 1 : st === 'mk-suiu-hop2' ? 2 : 3;
      const isFinal = hopIdx === 3;
      const radius = isFinal ? MK_SUIU_RADIUS * MK_SUIU_FINAL_RADIUS_MULT : MK_SUIU_RADIUS;
      hitCapsule(bounty, s.suiuTx, s.suiuTy, s.suiuTx, s.suiuTy, radius, MK_SUIU_DAMAGE);
      if (isFinal) {
        s.suiuHopIdx = 0;
        patch.bossState = 'mk-suiu-recover';
        patch.bossStateUntil = newGameTime + MK_SUIU_RECOVER_MS;
        return;
      }
      // 次のホップの着地点を再抽選(プレイヤー現在位置+抽選オフセット・clamp)。
      const off = MK_SUIU_OFFSET_RANGE;
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
      patch.bossStateUntil = newGameTime + pick2(MK_SUIU_HOP_INTERVAL_CHOICES) + MK_SUIU_HOP_TRAVEL_MS;
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
      patch.bossStateUntil = newGameTime + MK_BOOM_OUT_MS;
    }
    return;
  }
  if (st === 'mk-boom-out' || st === 'mk-boom-back') {
    // 判定=毬の絵に揃える(分類1): 溜め開始でロックした2点(aiFromX/Y→aiTargetX/Y)の間を毬が往復する。
    // 現在位置(往路=from→to/復路=to→from)に円判定を置く。共通弾(赤二重丸)ではない=専用の絵(pixiScene)。
    const fx = bounty.aiFromX ?? bcx, fy = bounty.aiFromY ?? bcy;
    const tx = bounty.aiTargetX ?? bcx, ty = bounty.aiTargetY ?? bcy;
    const total = st === 'mk-boom-out' ? MK_BOOM_OUT_MS : MK_BOOM_BACK_MS;
    const remain = (bounty.bossStateUntil ?? newGameTime) - newGameTime;
    const t = Math.max(0, Math.min(1, 1 - remain / total));
    const px2 = st === 'mk-boom-out' ? fx + (tx - fx) * t : tx + (fx - tx) * t;
    const py2 = st === 'mk-boom-out' ? fy + (ty - fy) * t : ty + (fy - ty) * t;
    const pr = Math.max(useGameStore.getState().player.width, useGameStore.getState().player.height) / 2;
    if (Math.hypot(pcx - px2, pcy - py2) <= MK_BOOM_HITRADIUS + pr) {
      useGameStore.getState().damagePlayer(MK_BOOM_DAMAGE, `${enemyDeathLabel(bounty.type)}の手毬打ち`, pcx, pcy);
    }
    if (newGameTime >= (bounty.bossStateUntil ?? 0)) {
      if (st === 'mk-boom-out') {
        patch.bossState = 'mk-boom-back';
        patch.bossStateUntil = newGameTime + MK_BOOM_BACK_MS;
      } else {
        patch.bossState = 'mk-boom-recover';
        patch.bossStateUntil = newGameTime + MK_BOOM_RECOVER_MS;
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

/**
 * 賞金首1体を1tick進める。B1の状態(休眠/追跡/帰巣)に加え、B2a/B2bで4体全ての技を追加した。
 * §6.38 B1.5-5: 出現告知(triggerAttention+バナー「賞金首出現」+SE)はスポーン時(呼び出し側=
 * useGameLoop.ts)へ移設した。ここで残すのは**起床演出(holo-circle)の起点**のみ(見た目だけの合図)。
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

  if (bounty.dormant) {
    resetBountyRunState(s);
    const ar = bounty.aggroRange ?? BOUNTY_AGGRO_RANGE_DEFAULT;
    if (dist <= ar) {
      // 起床(§2「dormant→交戦」): holo-circleの起点だけ立てる(実際の見た目=pixiSceneが
      // bossState==='bounty-wake'を読んで描く。判定はテスト対象外=描画側の掟どおり)。
      patch.dormant = false;
      patch.bossState = 'bounty-wake';
      patch.bossStateUntil = newGameTime + BOUNTY_WAKE_FX_MS;
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
    s.comboStep = 0; // 馬乗り3段コンボの進行も中断(=次にchaseへ戻ってからcomboStep=1で仕切り直す)
    applyPatch(bounty.id, {
      bossState: 'chase',
      bossStateUntil: undefined,
      bossNextActionAt: newGameTime + BOUNTY_NEUTRAL_MS,
      bountyLastEngagedAt: newGameTime,
    });
    return;
  }

  // ---- 気絶・拘束・浮き・ノックバックのガード(B1.5-2・致命) ------------------------------------
  // 座標もbossStateも一切書かない(カウンターのノックバック座標を上書きしない)。交戦中とみなして
  // 滞在タイマーだけ更新する(戦っている最中に消えない=既存の「戦闘中リセット」と同じ扱い)。
  if (isFrozen(bounty, newGameTime, nowMs)) {
    applyPatch(bounty.id, { bountyLastEngagedAt: newGameTime });
    return;
  }

  // ---- 起きている: bounty-wake演出の終了 ----------------------------------------------------
  if (bounty.bossState === 'bounty-wake' && newGameTime >= (bounty.bossStateUntil ?? 0)) {
    patch.bossState = undefined;
    patch.bossStateUntil = undefined;
  }

  // ---- カウンター(W7: windup中/硬直中の接触=可。v3128の掟=成立で技中断+chase復帰) -----------------
  const stNow = patch.bossState !== undefined ? patch.bossState : (bounty.bossState ?? 'chase');
  const counterableNow = counterEnabled
    && isCounterablePhase(stNow, BOUNTY_WINDUP_STATES, BOUNTY_RECOVER_STATES);
  let countered = false;
  if (counterableNow) {
    const cp = useGameStore.getState().player;
    const overlap = rectsOverlap({ x: bounty.x, y: bounty.y, width: bounty.width, height: bounty.height }, { x: cp.x, y: cp.y, width: cp.width, height: cp.height });
    if (overlap && Date.now() <= cp.counterWindowEnd) {
      bountyCounterHit(bounty, bcx, bcy, sfx);
      countered = true;
      s.comboStep = 0;
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
    // v6 A-3: bossStateが技実行中(=bounty-wake以外の何か)なら待機化を満了まで延期。
    const midMove = (patch.bossState ?? bounty.bossState) !== undefined && (patch.bossState ?? bounty.bossState) !== 'bounty-wake' && (patch.bossState ?? bounty.bossState) !== 'chase';
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
        }
      } else {
        // homeX/homeYが未設定(スポーン側の不備・防御的フォールバック): 現在地をそのまま巣として即帰巣扱い。
        patch.dormant = true;
        patch.bountyLastEngagedAt = newGameTime;
        patch.bossLeashSince = undefined;
      }
      applyPatch(bounty.id, patch);
      return;
    }
  }

  // ---- 技/移動の分岐(§4)。カウンター成立フレームは上でchaseへ落としているのでここには来ない ------
  if (!countered) {
    if (bounty.type === 'bounty-ranged') {
      tickRanged(bounty, s, newGameTime, deltaTime, moveSpeedMult, dist, pcx, pcy, bcx, bcy, sfx, patch);
    } else if (bounty.type === 'bounty-melee') {
      tickMelee(bounty, s, newGameTime, deltaTime, moveSpeedMult, dist, pcx, pcy, bcx, bcy, sfx, patch);
    } else if (bounty.type === 'bounty-balance') {
      tickBalance(bounty, s, newGameTime, deltaTime, moveSpeedMult, dist, pcx, pcy, bcx, bcy, sfx, patch);
    } else if (bounty.type === 'bounty-maiko') {
      tickMaiko(bounty, s, newGameTime, deltaTime, moveSpeedMult, dist, pcx, pcy, bcx, bcy, sfx, patch);
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
  redNightActive: boolean; // 紅き夜中
  area: number;            // 憲法第4条: 初心者ゾーン(エリア0-1)では出さない
  storyBossOnly: boolean;  // storyBossOnlyステージ(ストーリー専用進行)
  labTheme: boolean;       // 研究所スキン(v6 B-5)
  corridorMode: boolean;   // 廊下モード(v6 B-5)
  tutorialStage: boolean;  // チュートリアル(farBackdrop==='tutorial')
}
export const bountySpawnBlocked = (input: BountySpawnBlockInput): boolean =>
  input.bossFightNow || input.activeEvent || input.hiddenBossAlive || input.redNightActive
  || input.area <= 1 || input.storyBossOnly || input.labTheme || input.corridorMode || input.tutorialStage;

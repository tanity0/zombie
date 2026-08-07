// PACING_PUZZLE.md §6.33「LASER-TRACK」: 追尾予告型レーザー(ミーミル試験導入)の純関数群。
// レンダラ非依存・store非依存(useGameLoop.ts / gameStore.ts / pixiScene.ts から import される)。
// 数値の根拠は §6.33-2(基準系=bossTelegraph.ts からの導出)を参照。
//
// 型の要旨(§6.33-1): windup 3000ms のうち前段2700msは照準が「速度・加速度を持つ物理追尾」で
// ヘイト対象を追う(最高速=プレイヤー歩速と同速・立ち上がり1秒=社長改案)。終段300msでロック
// (以後発射終了まで固定)。発射前900msは弱点露出=プレイヤーの近接ヒットで中断できる。
import type { Enemy } from '../types/game';
import { applyBossPostureDamage } from './bossPosture';
import { telegraphProgress01 } from './bossTelegraph';

/**
 * §6.33のキルスイッチ(?mimirtrack=0)の唯一の出どころ。useGameLoop/pixiScene/中断判定が全員これを見る
 * (監査指摘1: 中断だけゲート漏れで「光っていないのに中断が起きる」半端状態になっていた)。
 * headless(テスト/ボット)では window が無い=既定ON。
 */
export const mimirTrackEnabled = (): boolean =>
  typeof window === 'undefined' || new URLSearchParams(window.location.search).get('mimirtrack') !== '0';

/** レーザー溜め時間(ms)。useGameLoop.ts の状態機械もこの値を使う(単位は実効ms=壁時計系)。 */
export const MIMIR_LASER_WINDUP_MS = 3000;
/** 照準の最高速(px/s)。= PLAYER_WALK_PX_PER_SEC(104.4)と同速(社長改案)。一致はテストで検査。 */
export const MIMIR_LASER_TRACK_MAX_PX_S = 104.4;
/** 照準の加速度上限(px/s^2)。静止→最高速に1.0秒=「立ち上がりの慣性」(社長改案)。 */
export const MIMIR_LASER_TRACK_ACCEL = 104.4;
/** 照準が対象に重なった時の保持デッドゾーン(px)。到着後の微振動(オーバーシュート往復)止め。 */
export const MIMIR_LASER_AIM_DEADZONE_PX = 6;
/** ロック段の長さ(ms)。< 脱出必要460ms((半太さ34+自機半径14)/104.4)=見てからでは間に合わない。 */
export const MIMIR_LASER_LOCK_MS = 300;
/** 弱点露出窓(発射前ms)。≥ 近接1サイクル820ms(COUNTER_WINDOW+COUNTER_COOLDOWN)=必ず1振り入る。 */
export const MIMIR_LASER_WEAK_MS = 900;
/** 中断硬直(ms)。= BOSS_STRING_REST_MS(連携終端の休符=2発ぶんのパニッシュ窓)。 */
export const MIMIR_LASER_BROKEN_MS = 1700;
/** 中断された時だけレーザーへ課すCD(ms)。密着で撃たせて殴り続ける農場の防止。通常成功時はCDなし。 */
export const MIMIR_LASER_INTERRUPTED_CD_MS = 8000;

export type MimirLaserPhase = 'track' | 'lock';

/** windup中の照準フェーズ。残り時間がロック段に入ったら'lock'(以後照準を動かさない)。 */
export const mimirLaserPhase = (nowMs: number, untilMs: number | undefined): MimirLaserPhase =>
  untilMs !== undefined && untilMs - nowMs <= MIMIR_LASER_LOCK_MS ? 'lock' : 'track';

/** カラオケ塗りの進行0..1。windup全体(3000ms)に張る=**塗り完了の瞬間=発射の瞬間**(§6.33-1)。 */
export const mimirLaserFill01 = (nowMs: number, untilMs: number | undefined): number =>
  untilMs === undefined ? 0 : telegraphProgress01(nowMs, untilMs - MIMIR_LASER_WINDUP_MS, untilMs);

export interface MimirLaserAim { x: number; y: number; vx: number; vy: number }

/**
 * 照準の1tick更新(seek+arrive)。「望みの速度」=対象方向×min(最高速, √(2·加速度·距離))で、
 * 現在速度との差を加速度上限で詰める。√項は到着減速(オーバーシュート振動の防止)。
 * 速度を持つ=方向転換に慣性ぶんの遅れが出る(プレイヤーの切り返しで振り切れる=§6.33-1-2 答え2)。
 * 乱数なし=決定的。dtSec は秒。
 */
export const stepLaserAim = (aim: MimirLaserAim, tgtX: number, tgtY: number, dtSec: number): MimirLaserAim => {
  const dx = tgtX - aim.x, dy = tgtY - aim.y;
  const dist = Math.hypot(dx, dy);
  const speed = Math.hypot(aim.vx, aim.vy);
  // 到着済み(デッドゾーン内・ほぼ静止)なら保持=対象が動き出すまで静かに張り付く。
  if (dist <= MIMIR_LASER_AIM_DEADZONE_PX && speed <= MIMIR_LASER_TRACK_ACCEL * dtSec) {
    return { x: aim.x, y: aim.y, vx: 0, vy: 0 };
  }
  const desiredSpeed = Math.min(MIMIR_LASER_TRACK_MAX_PX_S, Math.sqrt(2 * MIMIR_LASER_TRACK_ACCEL * dist));
  const inv = dist > 1e-6 ? 1 / dist : 0;
  const dvx = dx * inv * desiredSpeed - aim.vx;
  const dvy = dy * inv * desiredSpeed - aim.vy;
  const dvl = Math.hypot(dvx, dvy);
  const maxDv = MIMIR_LASER_TRACK_ACCEL * dtSec;
  const k = dvl > maxDv ? maxDv / dvl : 1;
  const vx = aim.vx + dvx * k;
  const vy = aim.vy + dvy * k;
  return { x: aim.x + vx * dtSec, y: aim.y + vy * dtSec, vx, vy };
};

/** 中断可能か=laser-windup中かつ発射前WEAK_MS以内(弱点露出窓)。窓外・発射後はfalse。 */
export const canInterruptMimirLaser = (
  type: string,
  bossState: string | undefined,
  nowMs: number,
  untilMs: number | undefined,
): boolean =>
  type === 'mimir'
  && bossState === 'laser-windup'
  && untilMs !== undefined
  && untilMs - nowMs > 0
  && untilMs - nowMs <= MIMIR_LASER_WEAK_MS;

/**
 * 近接ヒットによる中断(§6.33-2-2/2-4)。窓外は null。
 * - 中断の成立(laser-broken 1700ms・連携クリア・中断CD)は体幹の状態と無関係に必ず起こる。
 * - 体幹0.20('counter')は applyBossPostureDamage に委譲。再ブレイクロック中等の null でも中断は成立。
 * - フルブレイクが立った場合(postureTriggered)はフルブレイク優先(スタンの方が長く止まるだけ)。
 * 呼び出し側の掟: enemy には同じヒットで先に適用した体幹パッチ('melee'等)を合成してから渡すこと
 * (体幹の二重取り・巻き戻しを防ぐ)。
 */
export const mimirLaserBreakOnMeleeHit = (
  enemy: Enemy,
  gameTime: number,
): { patch: Partial<Enemy>; postureTriggered: boolean } | null => {
  if (!mimirTrackEnabled()) return null; // ?mimirtrack=0: 弱点窓ごと無効=v0.25.2935へ完全復帰
  if (!canInterruptMimirLaser(enemy.type, enemy.bossState, gameTime, enemy.bossStateUntil)) return null;
  const posture = applyBossPostureDamage(enemy, 'counter', gameTime);
  return {
    patch: {
      bossState: 'laser-broken',
      bossStateUntil: gameTime + MIMIR_LASER_BROKEN_MS,
      bossScriptQueue: [],
      mimirLaserReadyAt: gameTime + MIMIR_LASER_INTERRUPTED_CD_MS,
      ...(posture?.patch ?? {}),
    },
    postureTriggered: posture?.triggered ?? false,
  };
};

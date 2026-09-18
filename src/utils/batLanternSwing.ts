// ★バットの武器=ランタン(社長支給2026-09-18「バットの武器 鞭のようにランタンを背中上から下に
// 振り下ろすイメージ」「振り下ろすエフェクトは左から右へアニメーション」)。
//
// ★何を決める葉か: **噛みつき台本(`enemyBite.ts` / PACING_PUZZLE.md §12)の尺の上に乗る絵だけ**。
// 判定・ダメージ・射程・尺は1msも触らない(CLAUDE.md「Visual vs hitbox」)。
// 振りの角度も叩き落としのコマ送りも、**噛みつきの経過時間**から引く=絵と判定が構造的にズレない。
//
// ★慣性(CLAUDE.md MUST): 振り上げは上へ行くほど遅く(easeOut)、振り下ろしは落ちるほど速く
// (easeIn)、当たった後に軽く戻る。等速も瞬間停止も作らない。
import type { Enemy } from '../types/game';
import { biteSpecFor, bitePhaseOf } from './enemyBite';

/** ランタンの絵の長さ(px・鎖の端=柄から灯までの見かけの長さ)。 */
export const BAT_LANTERN_LEN_PX = 92;
/** 素材の中で「柄→先端」が向いている角度。鎖が上・灯が下なので**真下**。 */
export const BAT_LANTERN_INTRINSIC_ANGLE = Math.PI / 2;
/** 柄(回転の軸)の位置。鎖の上端=手。 */
export const BAT_LANTERN_GRIP_X = 0.5;
export const BAT_LANTERN_GRIP_Y = 0.02;

/** 振り上げ切った所(狙い方向から見て**背中の上**)。右向き時 -135°。 */
export const BAT_LANTERN_BACK_DEG = -135;
/** 振り下ろし切った所(狙い方向の**斜め下**)。右向き時 +45°。 */
export const BAT_LANTERN_DOWN_DEG = 45;
/** 構える前の下げた位置(体の後ろ下)。ここから振り上がる=パッと出さない。 */
export const BAT_LANTERN_REST_DEG = -200;
/** 振り抜いた後の戻り(行き過ぎてから緩く戻る)。 */
export const BAT_LANTERN_SETTLE_DEG = 18;
/** 振り抜きの余韻(ms)。噛みが終わってもこのぶんは残って戻る。 */
export const BAT_LANTERN_SETTLE_MS = 160;

const easeOut = (t: number): number => 1 - (1 - t) ** 3;   // 上げ: 上ほど遅い
const easeIn = (t: number): number => t * t * t;           // 落とし: 落ちるほど速い
const easeInOut = (t: number): number => t * t * (3 - 2 * t);
const D2R = Math.PI / 180;

export interface BatLanternPose {
  /** 画面角(rad)。左向きは呼び出し側で反転済みの値がここに入る。 */
  angle: number;
  /** 濃さ 0..1(出は下から、引きは余韻で)。 */
  alpha: number;
}

/**
 * 噛みつきの経過(ms)からランタンの姿勢を出す。**噛みつきが走っていなければ null**。
 * `sinceMs` は `gameTime - biteAt`。`facingSign` は右向き=+1 / 左向き=-1。
 */
export const batLanternPose = (
  sinceMs: number, aimAngle: number, facingSign: number,
  windupMs: number, biteMs: number,
): BatLanternPose | null => {
  if (sinceMs < 0) return null;
  const total = windupMs + biteMs;
  if (sinceMs > total + BAT_LANTERN_SETTLE_MS) return null;
  const s = facingSign >= 0 ? 1 : -1;
  const at = (deg: number): number => aimAngle + s * deg * D2R;
  const rest = at(BAT_LANTERN_REST_DEG), back = at(BAT_LANTERN_BACK_DEG);
  const down = at(BAT_LANTERN_DOWN_DEG), settle = at(BAT_LANTERN_DOWN_DEG - BAT_LANTERN_SETTLE_DEG);
  if (sinceMs <= windupMs) {
    const t = windupMs > 0 ? sinceMs / windupMs : 1;
    return { angle: rest + (back - rest) * easeOut(t), alpha: Math.min(1, t / 0.28) };
  }
  if (sinceMs <= total) {
    const t = biteMs > 0 ? (sinceMs - windupMs) / biteMs : 1;
    return { angle: back + (down - back) * easeIn(t), alpha: 1 };
  }
  const t = (sinceMs - total) / BAT_LANTERN_SETTLE_MS;
  return { angle: down + (settle - down) * easeInOut(t), alpha: 1 - t * t };
};

// ---------------------------------------------------------------------------------------------
// 振り下ろしのコマ送り(社長支給の9コマ・左から右へ)
// ---------------------------------------------------------------------------------------------
/** コマ数。 */
export const BAT_SLAM_FRAMES = 9;
/** **当たる瞬間に出るコマ**(実測: 6枚目が最大の炸裂)。ここより前=落ちてくる線、後=余韻。 */
export const BAT_SLAM_IMPACT_FRAME = 5;
/** 余韻(ms)。炸裂の後のコマを流し切るぶん。 */
export const BAT_SLAM_TAIL_MS = 150;
/** 正規化の基準幅(炸裂コマの幅)。全コマをこの幅で割る=コマごとの大きさの差を消さない。 */
export const BAT_SLAM_REF_W = 337;
/** 炸裂コマの見かけの横幅(px)。判定(接触30px)より大きく出す=②派手さの絵。 */
export const BAT_SLAM_W_PX = 118;
/**
 * 各コマの「接地点」の横位置(コマ幅に対する割合・実測=下帯60pxのアルファ重心)。
 * 縦は全コマ下端で揃えてある(切り出し時に接地線を共通化した)。
 */
export const BAT_SLAM_ANCHOR_X: readonly number[] =
  [0.403, 0.482, 0.589, 0.535, 0.503, 0.496, 0.491, 0.491, 0.515];

/**
 * 叩き落としのコマ番号。`t` は「噛みの開始」を0、`当たる瞬間`を1、`余韻の終わり`をtailEndとした進み。
 * 当たる瞬間にちょうど炸裂コマ(5)が出るように、前半6コマ/後半3コマへ割る。
 */
export const batSlamFrame = (sinceBiteMs: number, biteMs: number): number | null => {
  if (sinceBiteMs < 0) return null;
  const tail = BAT_SLAM_TAIL_MS;
  if (sinceBiteMs >= biteMs + tail) return null;
  if (sinceBiteMs <= biteMs) {
    const t = biteMs > 0 ? sinceBiteMs / biteMs : 1;
    return Math.min(BAT_SLAM_IMPACT_FRAME, Math.floor(t * (BAT_SLAM_IMPACT_FRAME + 1)));
  }
  const t = (sinceBiteMs - biteMs) / tail;
  const rest = BAT_SLAM_FRAMES - 1 - BAT_SLAM_IMPACT_FRAME;   // 3コマ
  return Math.min(BAT_SLAM_FRAMES - 1, BAT_SLAM_IMPACT_FRAME + 1 + Math.floor(t * rest));
};

/** この敵がランタンを振るか(型で決める。技の増設はしない=CLAUDE.md「敵の仕様は種類で固める」)。 */
export const usesBatLantern = (e: Pick<Enemy, 'type'>): boolean => e.type === 'bat';

/** 噛みつきの尺(型と技から引く)。描画側が手写ししないための薄い窓口。 */
export const batBiteTiming = (e: Enemy): { windupMs: number; biteMs: number } => {
  const spec = biteSpecFor(e.type, e.chaffMove, e.aiPhase);
  return { windupMs: spec.windupMs, biteMs: spec.biteMs };
};

/** 噛みつきが走っているか(溜め/噛みのどちらか)。余韻は呼び出し側が尺で判断する。 */
export const batBiteRunning = (e: Enemy, gameTime: number): boolean =>
  bitePhaseOf(e, gameTime) !== 'none';

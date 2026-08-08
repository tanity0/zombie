// 「プレイヤーが移動できる帯」の唯一の正本(renderer-agnostic)。
// 社長指示「ステージ2に限らず、移動不可エリアにアイテムも敵も沸かないで」への対応で新設(v0.25.2391)。
//
// もともとこの知識は src/store/gameStore.ts のプレイヤー移動クランプにしか無かった。湧き側
// (アイテム/敵)で条件を書き直すと必ずズレるので、**移動側・アイテム湧き側・敵湧き側が同じ
// 関数を見る**形にする(CLAUDE.md「Wall / collision judgment lives in game logic」)。
//
// ここが扱うのは3つの「帯」クランプ(ステージ限定の透明壁)だけ:
//   ①M0(訓練, farBackdrop==='tutorial')
//   ②ステージ2(研究所・横長廊下, labTheme)
//   ③ステージ6(洋館・奥行き通路, corridorMode)
// 壁・木・建物などの個別オブジェクト衝突(resolveAabb系・obstacles.ts)はこの関数の範囲外。
// それらの「中」に湧く問題は別種の課題として対象外(社長へ別途確認予定)。

import { LAB_CORRIDOR_Y_LIMIT_PX } from './labWalls';
import { CORRIDOR_LATERAL_CLAMP } from '../utils/corridorProjection';

// チュートリアルの上下移動制限(プレイヤー中心yがスポーン(0)から±この値まで・透明な壁)。
// 縦カメラ=プレイヤー1:1追従とセットで、被写界深度の構図を守る(社長指示v0.25.1826)。
// 実体はここ(world層が唯一の出どころ)。src/store/gameStore.ts は再輸出のみ(既存 import 元を壊さない)。
export const TUTORIAL_MOVE_Y_LIMIT_PX = 100; // v0.25.1828: 社長指示「100pxに増やします」で50→100
// チュートリアルの左端(プレイヤー中心xの下限=スタートから左100pxで透明な壁・社長指示v0.25.1829)。
export const TUTORIAL_MOVE_X_MIN_PX = -100;
// 洋館通路の下限(v0.25.2123・社長指示): スタート地点(y=0)からこの距離まで下がれる(それ以下へは行けない)。
// 走り込み入場中(corridorRunInActive)は除外(下から来る演出を邪魔しない)。
export const CORRIDOR_BOTTOM_LIMIT = 50;

export interface PlayableAreaCtx {
  farBackdrop: string;
  labTheme: boolean;
  corridorMode: boolean;
  m0AdvanceLimitX: number | null;
  corridorRunInActive: boolean;
}

// 矩形(x,y,w,h・top-left基準)を「プレイヤーが行ける帯」の内側へ寄せた座標を返す。制限が
// 無いステージ/条件では入力をそのまま返す。
//
// **プレイヤー移動のクランプ(src/store/gameStore.ts のプレイヤー移動処理)と全く同じ計算・
// 同じ適用順(tutorial→lab→corridor)。** 両者は同じ「行ける場所」を指すので、片方だけ直すと
// 移動可能範囲と湧き制限がズレる。変更する時は必ず両方(この関数とプレイヤー移動クランプの
// 呼び出し)を確認すること。
export const clampRectToPlayableArea = (
  x: number, y: number, w: number, h: number, ctx: PlayableAreaCtx
): { x: number; y: number } => {
  let nx = x;
  let ny = y;
  // チュートリアル: 上下移動は中心(スポーンy=0)から±100pxまで。左はスタートから−100pxまで。
  // 右は自由(帰還サークルへ進む)。台本の都合で作る「ここまで」の透明壁(m0AdvanceLimitX)も併せて適用。
  if (ctx.farBackdrop === 'tutorial') {
    const half = h / 2;
    ny = Math.max(-TUTORIAL_MOVE_Y_LIMIT_PX - half, Math.min(TUTORIAL_MOVE_Y_LIMIT_PX - half, ny));
    nx = Math.max(TUTORIAL_MOVE_X_MIN_PX - w / 2, nx);
    if (ctx.m0AdvanceLimitX !== null) nx = Math.min(ctx.m0AdvanceLimitX - w / 2, nx);
  }
  // ステージ2(研究所・横長廊下): 上下固定。プレイヤー中心yを±LAB_CORRIDOR_Y_LIMIT_PXに数値クランプ。
  // Xは無制限。
  if (ctx.labTheme) {
    const half = h / 2;
    ny = Math.max(-LAB_CORRIDOR_Y_LIMIT_PX - half, Math.min(LAB_CORRIDOR_Y_LIMIT_PX - half, ny));
  }
  // 洋館通路(corridorMode): プレイヤー中心xを±CORRIDOR_LATERAL_CLAMP(world px)に拘束する
  // (柱ライン=移動境界)。下限(CORRIDOR_BOTTOM_LIMIT)は走り込み入場中を除いて適用。
  if (ctx.corridorMode) {
    const halfW = w / 2;
    nx = Math.max(-CORRIDOR_LATERAL_CLAMP - halfW, Math.min(CORRIDOR_LATERAL_CLAMP - halfW, nx));
    if (!ctx.corridorRunInActive) ny = Math.min(ny, CORRIDOR_BOTTOM_LIMIT);
  }
  return { x: nx, y: ny };
};

// 矩形が既に「行ける帯」の内側にあるか(=クランプしても座標が動かないか)。
export const isRectInPlayableArea = (
  x: number, y: number, w: number, h: number, ctx: PlayableAreaCtx
): boolean => {
  const c = clampRectToPlayableArea(x, y, w, h, ctx);
  return c.x === x && c.y === y;
};

// ---------------------------------------------------------------------------------------------
// 城ボス戦の移動制限(社長指示v0.25.3055「城ボス戦の時は移動できる距離を制限する。
// 城ボス:研究対象まで(デンジャーには入れない)。裏ボス:全域ok。ゲートボス:そもそもゲート内」)
// ---------------------------------------------------------------------------------------------
// 上限=研究対象区域の外縁(AREA_THRESHOLDS[1]=3000px・原点からの距離)。デンジャーゾーンに入れない。
export const CASTLE_FIGHT_MAX_DIST = 3000; // enemyUtils.AREA_THRESHOLDS[1]と同値(constitution的な二重定義を避けるためテストで一致を固定)
/**
 * 城ボス交戦中の「外へ出る移動」だけを制限ラインで止める(中心座標基準の円クランプ)。
 * ★スナップ防止: 既に制限の外に居る場合(交戦開始時点で外だった等)は動きを止めない=
 * 「線を外向きに跨ぐ移動」だけをクランプする。内側へ戻る移動は常に自由。
 */
export const clampCastleFightCrossing = (
  oldCx: number, oldCy: number, newCx: number, newCy: number, limit: number = CASTLE_FIGHT_MAX_DIST,
): { x: number; y: number } => {
  const newDist = Math.hypot(newCx, newCy);
  if (newDist <= limit) return { x: newCx, y: newCy };
  const oldDist = Math.hypot(oldCx, oldCy);
  if (oldDist > limit) return { x: newCx, y: newCy }; // 既に外(スナップさせない)
  const k = limit / (newDist || 1);
  return { x: newCx * k, y: newCy * k };
};

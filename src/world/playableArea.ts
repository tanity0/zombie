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
import { EX_NORTH_LIMIT_Y, exHallLateralClamp } from './exHall';

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
  // PACING_PUZZLE.md §10-20#2/#5〜#7: EX(stage-ex1)専用の拡張。省略時(undefined)は既存のM6挙動と
  // 1バイトも変わらない(exStage/exBarrierはEX関連の呼び出し側だけが明示的に立てる)。
  /** trueならEXの北端絶対クランプ(EX_NORTH_LIMIT_Y)+広間(スリィエル/フィル)の横クランプ拡幅が有効。
   * 全アクター共通(§10-20#6「他の解は非推薦」=スリィエルの周回もこの拡幅を受ける必要があるため)。 */
  exStage?: boolean;
  /** §10-20#3(c)/#4: 結界(北)・南の膜。**プレイヤーの移動クランプにのみ渡すこと**
   * (敵・天使・湧きには適用しない=clampRectToPlayableAreaは全アクター共有のためctxを分ける・監査#7)。
   * null=その向きの結界は今は無い(通常時/未突入/撃破後)。 */
  exPlayerBarrier?: { northLockY: number | null; southLockY: number | null };
}

// 矩形(x,y,w,h・top-left基準)を「プレイヤーが行ける帯」の内側へ寄せた座標を返す。制限が
// 無いステージ/条件では入力をそのまま返す。
//
// **プレイヤー移動のクランプ(src/store/gameStore.ts のプレイヤー移動処理)と全く同じ計算・
// 同じ適用順(tutorial→lab→corridor)。** 両者は同じ「行ける場所」を指すので、片方だけ直すと
// 移動可能範囲と湧き制限がズレる。変更する時は必ず両方(この関数とプレイヤー移動クランプの
// 呼び出し)を確認すること。
/**
 * M0の前進壁を「跨ぐ移動だけ止める」に切り替える時の境界許容幅(px)。
 * 城ボス戦の `CASTLE_FIGHT_EDGE_EPS` と**同じ理由・同じ幅**にしてある: クランプ結果が境界ちょうど
 * (浮動小数点で 800.0001 等)に載ると、次フレームに「既に外に居る」と誤認して素通ししてしまう
 * (v0.25.3058で城側が踏んだ実バグ)。境界+この幅までは「内側に居た」とみなして止める。
 */
export const M0_ADVANCE_EDGE_EPS = 40;

/**
 * 矩形(x,y,w,h・top-left基準)を「プレイヤーが行ける帯」の内側へ寄せた座標を返す。
 *
 * `prevX` は**移動のクランプにだけ**渡す(=移動前の左上x)。渡した場合、M0の前進壁は
 * 「線を前向きに跨ぐ移動だけを止める / 既に壁より先に居るならスナップさせない」という
 * **城ボス戦(clampCastleFightCrossing)と同じ作法**になる(社長指示v0.25.3498「城と同じ壁の
 * 見せ方にして」)。
 *
 * ★なぜ必要か(テストチャットの不具合報告 2026-08-16 / `TEST_HANDOFF/results/20260816-tutorial-warp.md`):
 * M0の前進壁は**戦闘中だけ外れる**設計(`m0Tutorial.m0AdvanceLimit` が waveActive の間 null を返す=
 * 「教習中に狭い箱へ閉じ込めない」社長指摘v0.25.2305への対応)。ところがここの適用が `Math.min` の
 * **スナップ**だったため、戦闘中に壁より先へ進んでいると、**敵を全滅させた瞬間に壁の位置へ
 * 瞬間移動で引き戻される**(社長報告「攻撃喰らうとワープする/スタートに戻される」の正体)。
 * 「跨ぐ移動だけを止める」に変えれば、戦闘中に前へ出た結果を没収しない。
 *
 * `prevX` を渡さない呼び出し(**アイテム/敵の湧き=その場に置く処理**)は従来どおりスナップする。
 * 湧きは「移動」ではなく「配置」なので、帯の内側へ寄せるのが正しい(前後関係が無いので跨ぎも定義できない)。
 */
export const clampRectToPlayableArea = (
  x: number, y: number, w: number, h: number, ctx: PlayableAreaCtx, prevX?: number
): { x: number; y: number } => {
  let nx = x;
  let ny = y;
  // チュートリアル/エンディング(仮組み・社長指示2026-08-28「チュートリアルステージみたいな構造」・
  // ENDING_SCENE.md): 上下移動は中心(スポーンy=0)から±100pxまで。左はスタートから−100pxまで。
  // 右は自由。台本の前進壁(m0AdvanceLimitX)はチュートリアル台本専用の値なので、エンディングでは
  // 誰も pendingM0 相当をセットしない=ctx.m0AdvanceLimitXが常にnullで自然に無効(壁は出ない)。
  if (ctx.farBackdrop === 'tutorial' || ctx.farBackdrop === 'ending') {
    const half = h / 2;
    ny = Math.max(-TUTORIAL_MOVE_Y_LIMIT_PX - half, Math.min(TUTORIAL_MOVE_Y_LIMIT_PX - half, ny));
    nx = Math.max(TUTORIAL_MOVE_X_MIN_PX - w / 2, nx);
    if (ctx.m0AdvanceLimitX !== null) {
      const wall = ctx.m0AdvanceLimitX - w / 2;
      // 既に壁より先に居た移動(=戦闘中に前へ出ていた)は引き戻さない。城ボス戦と同じ作法。
      const wasBeyond = prevX !== undefined && prevX > wall + M0_ADVANCE_EDGE_EPS;
      if (!wasBeyond) nx = Math.min(wall, nx);
    }
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
    // PACING_PUZZLE.md §10-20#5〜#7(EX広間の通路スケールアップ): EXだけ、yに応じて横クランプが
    // CORRIDOR_LATERAL_CLAMP→EX_HALL_LATERAL_CLAMPへ連続に広がる(exHallScaleTと同じtから導く=
    // 絵とクランプがズレない・6巡目#3)。全アクター共通(敵の周回もこの拡幅を受ける・§10-20#6)。
    const lateralClamp = ctx.exStage ? exHallLateralClamp(y + h / 2) : CORRIDOR_LATERAL_CLAMP;
    nx = Math.max(-lateralClamp - halfW, Math.min(lateralClamp - halfW, nx));
    if (!ctx.corridorRunInActive) ny = Math.min(ny, CORRIDOR_BOTTOM_LIMIT);
    // §10-20#2: EXだけの北端クランプ(corridorは元々北の上限が無いため)。
    if (ctx.exStage) ny = Math.max(EX_NORTH_LIMIT_Y, ny);
  }
  // §10-20#3(c)/#4: 結界(北)・南の膜。プレイヤーの移動クランプだけに渡される(呼び出し側の作法)。
  // ★検収監査#4(v3751): yはtop-left基準なので、上端(=ny)を直接ロック値と比べると南の膜側で
  // 矩形の下端(足)がheightぶんはみ出す(「足が1体分はみ出す」の実体)。横クランプ(exHallLateralClamp)
  // ・チュートリアルY制限と同じ作法=**中心**をロック値±halfへクランプし、矩形全体が膜の内側に
  // 収まる形へ揃える(北側は数値上ny基準と一致=無変化。南側だけ実質的にheightぶん手前へ動く)。
  // ★検収監査#3(2巡目・v3752): exPlayerBarrierは全ステージのプレイヤー移動クランプへ無条件に渡される
  // (gameStore.ts側は{northLockY:null,southLockY:null}でも常にオブジェクトを渡す=truthy)。北南とも
  // nullなら実質no-opだが、下のcenterY計算(丸め誤差を生みうる浮動小数点演算)が毎フレーム全ステージで
  // 走ってしまう(isRectInPlayableAreaは===の厳密比較のため、無意味な演算で最下位ビットが変わると
  // 「クランプしても座標が動かない」判定が崩れうる)。北南とも無い時は早期スキップして何もしない。
  if (ctx.exPlayerBarrier && (ctx.exPlayerBarrier.northLockY != null || ctx.exPlayerBarrier.southLockY != null)) {
    const half = h / 2;
    let centerY = ny + half;
    if (ctx.exPlayerBarrier.northLockY != null) centerY = Math.max(centerY, ctx.exPlayerBarrier.northLockY + half);
    if (ctx.exPlayerBarrier.southLockY != null) centerY = Math.min(centerY, ctx.exPlayerBarrier.southLockY - half);
    ny = centerY - half;
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
// 境界ジッタの許容幅(px)。v0.25.3058(社長報告「赤い線は表示されてるけど、行けちゃう」):
// 旧実装はクランプ結果が境界ちょうど(浮動小数点で3000.0001等)に載ると、次フレームの
// oldDist > limit 判定で「既に外に居る」と誤認して素通しした。境界+この幅までは
// 「内側に居た」とみなして引き戻す=押し続けても越えられない。
export const CASTLE_FIGHT_EDGE_EPS = 40;
export const clampCastleFightCrossing = (
  oldCx: number, oldCy: number, newCx: number, newCy: number, limit: number = CASTLE_FIGHT_MAX_DIST,
): { x: number; y: number } => {
  const newDist = Math.hypot(newCx, newCy);
  if (newDist <= limit) return { x: newCx, y: newCy };
  const oldDist = Math.hypot(oldCx, oldCy);
  if (oldDist > limit + CASTLE_FIGHT_EDGE_EPS) return { x: newCx, y: newCy }; // 本当に外(交戦開始時点で外だった等)だけスナップさせない
  const k = (limit - 1) / (newDist || 1); // 厳密に内側へ着地させる(境界ちょうどに載せない)
  return { x: newCx * k, y: newCy * k };
};

// 敵の画面補充を早める仕組み(社長指示2026-10-18「敵の出現ゼロの時間はやめよう。暇だわ。
// 1:ゼロではなく少しは出る 2:敵の画面補充をもう少し早くする仕組み」→「敵出現は推薦でなおして」)。
// PACING_PUZZLE.md §20 の★未決②(置き去りの回収)と、追い上げの湧き間隔の判定をここに置く。
//
//  ・置き去りの回収: 歩き続けている時、**後ろ側**で、**見えている範囲(絵の背丈込み)+300px の外**へ出た
//    雑魚を、**進む先の辺の外**へ動かす(盤面の数を後ろの敵が塞ぎ続けるのを止める)。リラックス/ハーベストの
//    コマで邪魔者・ゾンビ・赤い個体(リラックスの顔ぶれに無い型。ハーベストはゾンビも少し出すが、置き去りの分は持ち込まない)は、動かさずに画面外で退場させる(空いた枠はコマ自身の
//    湧きが埋める)。従来の回収(画面2.5個ぶん)はそのまま残し、こちらはその内側に1本足すだけ。
//  ・追い上げ: 画面内(地平線より下)の敵が0体なら湧き間隔×0.3(下限0.3秒)、1体なら×0.5。
//    1度に1体(バースト禁止 §0.5)は変えない。
//
// store も PixiJS も読まない純関数(状態は呼び出し側が持ち回る)。

import type { EnemyType, EnemyColorTier } from '../types/game';
import { sideOfDir, type WalkHeading } from './spawnWalkBias';
import type { KomaKind4 } from './scriptPuzzle';

/** 見えている範囲の外側この距離(ワールドpx)を越えたら、後ろの敵を回収してよい。 */
export const BEHIND_RETIRE_MARGIN_PX = 300;
/** 寄せの強さ(spawnWalkBias.walkBiasStrength)がこれ以上=同じ向きに約0.5秒歩き続けている時だけ回収する。 */
export const BEHIND_RETIRE_MIN_WALK_STRENGTH = 0.25;
/** 回収の間隔(1体ずつ・前に一度に並ばないように)。 */
export const BEHIND_RETIRE_GAP_MS = 500;
/** 引き(ズームアウト)を覚えておく時間。描画のズームは目標へ遅れて追いつくので、直前の一番引いた値を使う。 */
export const RETIRE_ZOOM_HOLD_MS = 3000;
/** 前へ動かす時、見えている範囲(絵の背丈込み)のさらに外へ置く距離(通常湧きの OFFSCREEN_SPAWN_MARGIN と同じ)。 */
export const FRONT_RESPAWN_MARGIN_PX = 140;
/**
 * 敵の絵の遠近スケールの上限。画面の下(手前)ほど絵が大きくなり、画面下端で ENEMY_DEPTH_MAX=1.85 に達した後も
 * **画面外 DEPTH_EDGE_MARGIN(500px)まで伸び続け、最後は 3.5 で頭打ち**(pixiScene.ts depthScaleMapped の
 * 絶対セーフティ)。足元が画面外でも頭が覗く分を取りこぼさないよう、見えているかの判定はこの上限で見積もる。
 * (ステージ別の絵の倍率 stageEnemyVisualMul はボス系=回収の対象外の型にしか掛からないので含めない。)
 */
export const ENEMY_ART_DEPTH_MAX = 3.5;

export interface ViewRect { left: number; top: number; right: number; bottom: number; horizonY: number }
export interface Box { x: number; y: number; width: number; height: number }

/**
 * 遠景の帯の高さ(画面px)。pixiScene.ts の farBackdropHeight() の屋外の式の写し
 * (FAR_BACKDROP_HEIGHT_RATIO 0.26 / CAP 0.38 / MIN 168)。チュートリアル/研究所の別式はここでは扱わない
 * (その2つでは置き去りの回収を動かさない)。
 */
export const farBackdropHeightFor = (screenH: number): number =>
  Math.min(screenH * 0.38, Math.max(168, screenH * 0.26));

/**
 * 描画が実際に映すワールド矩形。pixiScene の引き(zoom<1)は**横=画面中央・縦=地平線(farH)を支点**に縮む:
 *   画面Y = (ワールドY − camY)·z + farH·(1−z)  →  上端 camY + farH − farH/z / 下端 camY + farH + (H−farH)/z
 *   画面X = (ワールドX − camX)·z + (W/2)·(1−z) →  左右 camX + W/2 ∓ W/(2z)
 * 地平線(敵が透けて見えなくなる線)はズームに関係なく camY + farH。寄り(z>1)は狭くなるだけなので z=1 で見積もる。
 * camX/camY は store の camera と同じ「等倍の画面の左上」。
 */
export const renderedViewRect = (camX: number, camY: number, viewW: number, viewH: number, zoom: number): ViewRect => {
  const z = Number.isFinite(zoom) && zoom > 0 ? Math.min(1, zoom) : 1;
  const farH = farBackdropHeightFor(viewH);
  const cx = camX + viewW / 2;
  return {
    left: cx - viewW / 2 / z,
    right: cx + viewW / 2 / z,
    top: camY + farH - farH / z,
    bottom: camY + farH + (viewH - farH) / z,
    horizonY: camY + farH,
  };
};

/** 箱が矩形+余白の完全に外にあるか(少しでも掛かっていれば false=見えているかもしれない)。 */
export const isBoxOutsideRect = (b: Box, r: ViewRect, margin: number): boolean =>
  b.x + b.width < r.left - margin
  || b.x > r.right + margin
  || b.y + b.height < r.top - margin
  || b.y > r.bottom + margin;

/**
 * 当たり判定の箱と、足元から上へ伸びる絵の箱(最大の遠近スケール込み)を合わせた箱。
 * artW/artH は描画の枠(renderSpec.enemyFootBox の boxW/boxH)。
 */
export const enemyVisualBox = (hit: Box, artW: number, artH: number, depthMax = ENEMY_ART_DEPTH_MAX): Box => {
  const footX = hit.x + hit.width / 2, footY = hit.y + hit.height;
  const w = Math.max(hit.width, artW * depthMax), h = Math.max(hit.height, artH * depthMax);
  const x = Math.min(hit.x, footX - w / 2);
  const y = Math.min(hit.y, footY - h);
  return { x, y, width: Math.max(hit.x + hit.width, footX + w / 2) - x, height: footY - y };
};

/** 敵の中心がプレイヤーから見て進む向きの後ろ側か(向きが未設定なら false)。 */
export const isBehindHeading = (
  ex: number, ey: number, pcx: number, pcy: number, heading: Pick<WalkHeading, 'hx' | 'hy'>,
): boolean => {
  if (heading.hx === 0 && heading.hy === 0) return false;
  return (ex - pcx) * heading.hx + (ey - pcy) * heading.hy < 0;
};

export interface RetireBehindInput {
  /** 判定に使う箱(enemyVisualBox=絵の背丈込み)。後ろ側かどうかはこの箱の中心で見る。 */
  box: Box;
  playerCx: number;
  playerCy: number;
  heading: Pick<WalkHeading, 'hx' | 'hy'>;
  walkStrength: number;
  /** 見えている範囲の候補(プレイヤー中心の推定・store のカメラ等)。**全部の外**の時だけ回収する。 */
  views: readonly ViewRect[];
  margin?: number;
}

/** 後ろへ置き去りにした敵を回収してよいか(対象の種類・保護の判定は呼び出し側)。 */
export const shouldRetireBehind = (input: RetireBehindInput): boolean => {
  if (!(input.walkStrength >= BEHIND_RETIRE_MIN_WALK_STRENGTH)) return false;
  if (input.views.length === 0) return false;
  const { box } = input;
  const ex = box.x + box.width / 2, ey = box.y + box.height / 2;
  if (!isBehindHeading(ex, ey, input.playerCx, input.playerCy, input.heading)) return false;
  const m = input.margin ?? BEHIND_RETIRE_MARGIN_PX;
  return input.views.every(v => isBoxOutsideRect(box, v, m));
};

/** リラックス/ハーベストのコマで、前へ動かしてよい型(そのコマの顔ぶれ=バット・スケルトン)。 */
const REST_KOMA_MOVABLE = new Set<EnemyType>(['bat', 'skeleton']);

/**
 * 回収した敵を前へ動かすか(move)、画面外で退場させるか(remove)。
 * リラックス/ハーベストのコマ中は、そのコマの顔ぶれ(バット・スケルトン・赤なし)以外——邪魔者(パンプキン/
 * 削岩型/伐採人/ワーウルフ/プラント)・ゾンビ・赤い個体——を前へ持ち込まない(休憩/刈り取りの顔ぶれを崩さない)。
 * 通常/ピーク、コマ不明(盤面の仕組みが止まっている時)は全部 move。
 */
export const retireDisposition = (
  type: EnemyType, colorTier: EnemyColorTier | undefined, komaKind: KomaKind4 | null,
): 'move' | 'remove' => {
  if (komaKind !== 'relax' && komaKind !== 'harvest') return 'move';
  if (colorTier === 'red') return 'remove';
  return REST_KOMA_MOVABLE.has(type) ? 'move' : 'remove';
};

export interface FrontRespawnInput {
  /** 見えている範囲(renderedViewRect)。この外側に FRONT_RESPAWN_MARGIN_PX 離して置く。 */
  view: ViewRect;
  heading: Pick<WalkHeading, 'hx' | 'hy'>;
  playerCx: number;
  playerCy: number;
  /** 当たり判定の寸法。 */
  width: number;
  height: number;
  /** 絵の背丈込みの寸法(enemyVisualBox の width/height)。 */
  artWidth: number;
  artHeight: number;
  /** 洋館通路: 上下の辺だけ(左右は壁)。 */
  corridor: boolean;
  /** 0..1 の乱数2本(辺に沿った位置=正面寄りの三角分布)。 */
  roll1: number;
  roll2: number;
  margin?: number;
}

/**
 * 前へ動かす先(当たり判定の左上)。辺は**進む先の辺に固定**(通路は上か下)。辺に沿った位置はプレイヤーの
 * 正面を中心にした三角分布(辺の長さの半分の幅)。絵の背丈込みで見えている範囲の外に置く。
 */
export const frontRespawnPoint = (input: FrontRespawnInput): { x: number; y: number; side: number } => {
  const { view, heading, width: w, height: h, artWidth: aw, artHeight: ah } = input;
  const m = input.margin ?? FRONT_RESPAWN_MARGIN_PX;
  const side = input.corridor ? (heading.hy > 0 ? 2 : 0) : sideOfDir(heading.hx, heading.hy);
  const spread = (input.roll1 + input.roll2) - 1; // -1..1(三角分布・0が正面)
  if (side === 0 || side === 2) {
    const footX = input.playerCx + spread * (view.right - view.left) / 4;
    // 上: 足元が上端の外(絵は上へ伸びる=画面の外側へ伸びる)。下: 絵の頭まで下端の外。
    const footY = side === 0 ? view.top - m : view.bottom + m + ah;
    return { x: footX - w / 2, y: footY - h, side };
  }
  const footY = input.playerCy + spread * (view.bottom - view.horizonY) / 4;
  const footX = side === 1 ? view.right + m + aw / 2 : view.left - m - aw / 2;
  return { x: footX - w / 2, y: footY - h, side };
};

export interface ZoomHold { z: number; at: number }
export const newZoomHold = (): ZoomHold => ({ z: 1, at: -Infinity });

/**
 * 直近 RETIRE_ZOOM_HOLD_MS の一番引いたズームを返す(引きは即採用・戻りは保持時間が明けてから)。
 * gameTime が巻き戻った(新しいラン)時は今の値から数え直す。
 */
export const holdMinZoom = (hold: ZoomHold, zNow: number, now: number, holdMs = RETIRE_ZOOM_HOLD_MS): ZoomHold => {
  const z = Number.isFinite(zNow) && zNow > 0 ? Math.min(1, zNow) : 1;
  if (now < hold.at || z <= hold.z || now - hold.at >= holdMs) return { z, at: now };
  return hold;
};

/** 回収の間隔が明けたか(gameTime が巻き戻った時は明けた扱い)。 */
export const retireGapReady = (lastAt: number, now: number, gapMs = BEHIND_RETIRE_GAP_MS): boolean =>
  now < lastAt || now - lastAt >= gapMs;

/** 見えている範囲のうち地平線(view.horizonY)より下に、足元(下端)が入っている敵の数。 */
export const countVisibleBelowHorizon = (boxes: readonly Box[], view: ViewRect): number => {
  let n = 0;
  for (const b of boxes) {
    const cx = b.x + b.width / 2, foot = b.y + b.height;
    if (cx >= view.left && cx <= view.right && foot >= view.horizonY && b.y <= view.bottom) n++;
  }
  return n;
};

/** 追い上げの湧き間隔の下限(ms)。 */
export const CATCH_UP_CD_FLOOR_MS = 300;
export const CATCH_UP_MULT_EMPTY = 0.3; // 画面内0体
export const CATCH_UP_MULT_ONE = 0.5;   // 画面内1体

/** 画面内の数に応じて湧き間隔を縮める。元より長くはしない(元が下限より短ければ元のまま)。 */
export const catchUpSpawnCdMs = (cdMs: number, visibleBelowHorizon: number): number => {
  const mult = visibleBelowHorizon <= 0 ? CATCH_UP_MULT_EMPTY
    : visibleBelowHorizon === 1 ? CATCH_UP_MULT_ONE
      : 1;
  if (mult >= 1) return cdMs;
  return Math.min(cdMs, Math.max(CATCH_UP_CD_FLOOR_MS, cdMs * mult));
};

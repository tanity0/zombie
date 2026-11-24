// 段階8「研究所と洋館の通路」の洋館の床の写像(純関数・PixiJS を読まない)。
// 設計書: research/PERSPECTIVE_PROJECTION.md §3-10c(洋館の枠の 1〜9・床に渡す前進量)・§3-10i 作る物2/3。
//
// `?proj=1` の時だけ pixiScene が使う(既定 `?proj=0` では1ビットも使われない)。ゲームの判定には一切関与しない。
// 洋館(ステージ6・corridorMode)の床は CorridorLayer が Mode-7 の式で画面に描く(裁定 B=床の描き方は今のまま)。
// ここは物(敵・アイテム・主人公)をその床の写像に乗せるための ProjFrame(kind='corridor')を組む。
// `makeProjFrame` は通らない(表の値は使わない印として NaN を入れる・段階8 2巡目監査 A3)。

import { CORRIDOR_CFG, type CorridorConfig } from './corridorProjection';
import { zoomCameraDownFrac } from './cameraZoom';
import type { ProjFrame, ProjM7, ProjTable } from './perspectiveProjection';

// ---- 洋館の床の定数(値を2か所に持たない=corridorLayer.ts はここから import する・§3-10i の2) ----

/** ゲーム内背景用の床の幾何(corridorLayer の CFG の上書き分。経緯は corridorLayer.ts の CFG のコメント)。 */
export const CORRIDOR_FLOOR_HORIZON_YR = 0.26;
export const CORRIDOR_FLOOR_FOOT_YR = 0.793;
/** ゲーム内の床・柱・壁灯の幾何(プレビューの CORRIDOR_CFG の消失点と足元の行だけを上書き)。 */
export const CORRIDOR_FLOOR_CFG: CorridorConfig = { ...CORRIDOR_CFG, horizonYr: CORRIDOR_FLOOR_HORIZON_YR, footYr: CORRIDOR_FLOOR_FOOT_YR };
/** 床テクスチャ縦1枚ぶんの前進量(world px)。 */
export const CORRIDOR_FLOOR_REPEAT = 520;
/** 床の横幅=柱中心間ちょうど。 */
export const CORRIDOR_FLOOR_W_MULT = 1.0;
/** ハッチ床タイルの手前端(world 前進量。520 の倍数=タイル境界)。 */
export const CORRIDOR_GOAL_TILE_START = 3640;
/** 柱の world の x(行ける端の柱の中心・叩き台 200=corridorProjection の CORRIDOR_LATERAL_CLAMP のコメント「柱±200」)。 */
export const CORRIDOR_PILLAR_WORLD_X = 200;
/** 南の頭打ち: d ≥ −0.6·focal(s7 ≤ 2.5・画面の下端は s7≈1.39・§3-10c の6)。 */
export const CORRIDOR_FLOOR_D_MIN_FRAC = 0.6;
/** 物のフェードの線の幅(world px・pixiScene の CORRIDOR_ACTOR_FADE_PX と同じ値=今の線と同じ幅・§3-10c の7)。 */
export const CORRIDOR_PROJ_FADE_PX = 80;

/** 洋館の枠の組み立ての入力(§3-10c)。画面の論理px。 */
export interface CorridorFloorFrameInput {
  camX: number;
  camY: number;
  /** 画面(論理px)。床の消失点・足元の行は screenH から。 */
  screenW: number;
  screenH: number;
  /** カメラの定位置の高さ(store の gameBounds.height)。基準行と物のフェードの線はこれで出す。 */
  viewH: number;
  /** 通路の幅(corridorW: 縦持ち=画面幅・PC の横長=スマホ相当の 405)。 */
  corridorW: number;
  playerH: number;
  /** 洋館のカメラの下げ量の基準(CORRIDOR_CAMERA_DOWN_FRAC=0.16)。 */
  camDown: number;
  /** カメラのズーム(屋外と同じ決まり: zref===2 ? getCameraZoomLink() : 1)。 */
  camZ: number;
  /** 物のフェードの線の高さの比(CORRIDOR_ACTOR_FADE_TOP_FRAC=0.14)。 */
  fadeTopFrac: number;
  fadePx?: number;
  /** アテンション(zoomToUnity)の注目点と包絡線(屋外と同じく基準点と基準行を組で運ぶ・§1-6)。 */
  att?: { y: number; env: number } | null;
  wgScale?: number;
  wgX?: number;
  wgY?: number;
  shakeX?: number;
  shakeY?: number;
  pillarX?: number;
}

/** 洋館の枠の空の表(表の値は使わない印・§3-10c)。n=0・lMax=南の頭打ちの行・stripH=1。 */
export const corridorNoTable = (lMax: number): ProjTable => ({
  stripH: 1, refCount: 72, step: 1, n: 0, lMax, g: new Float64Array(1),
  p: { tileScaleX: NaN, trapFar: NaN, trapCurve: NaN, trapezoid: NaN, farScale: NaN, nearScale: NaN, curve: NaN },
  lNear: NaN, kc: -1, gOrig: NaN, gNear: NaN, key: 'corridor', stripCount: 0, subdiv: 1, builtPts: 0,
  syK: new Float64Array(1), cvK: new Float64Array(1),
});

/** 床の定数(§3-10c の1)。 */
export const corridorFloorConsts = (screenH: number, cfg: CorridorConfig = CORRIDOR_FLOOR_CFG) => {
  const hY = screenH * cfg.horizonYr;
  const denom = screenH * (cfg.footYr - cfg.horizonYr);
  return { hY, denom, focal: cfg.focal, aisleW: cfg.aisleHalfXr * CORRIDOR_FLOOR_W_MULT };
};

/** 洋館の枠を組む(§3-10c の 1〜9)。`makeProjFrame` を通らない。 */
export const corridorFloorFrame = (i: CorridorFloorFrameInput): ProjFrame => {
  const c = corridorFloorConsts(i.screenH);
  // 2. 基準点と基準行(★#45=A): W_ref = camera.y + H·(0.5 + zoomCameraDownFrac(0.16, camZ)) + playerH/2
  let wRef = i.camY + i.viewH * (0.5 + zoomCameraDownFrac(i.camDown, i.camZ)) + i.playerH / 2;
  if (i.att) {
    const env = Math.max(0, Math.min(1, i.att.env));
    wRef += (i.att.y - wRef) * env;
  }
  const yRef = wRef - i.camY;
  const sRef = Math.max(1e-6, (yRef - c.hY) / c.denom);
  const dRef = c.focal * (1 / sRef - 1);
  // 6. 南の頭打ち
  const dMin = -CORRIDOR_FLOOR_D_MIN_FRAC * c.focal;
  const s7Max = c.focal / (c.focal + dMin);
  const lMax = c.denom * s7Max;
  const slopeMax = c.denom * c.focal / ((c.focal + dMin) * (c.focal + dMin));
  const m7: ProjM7 = {
    hY: c.hY, denom: c.denom, focal: c.focal, W: i.corridorW, aisleW: c.aisleW,
    pillarX: i.pillarX ?? CORRIDOR_PILLAR_WORLD_X, dRef, sRef, dMin, s7Max, lMax, slopeMax,
  };
  const fadePx = i.fadePx ?? CORRIDOR_PROJ_FADE_PX;
  return {
    table: corridorNoTable(lMax),
    camX: i.camX, camY: i.camY, farH: c.hY, screenW: i.screenW, screenH: i.screenH,
    wRef, lRef: yRef - c.hY, tStd: NaN,
    wgScale: i.wgScale ?? 1, wgX: i.wgX ?? 0, wgY: i.wgY ?? 0, shakeX: i.shakeX ?? 0, shakeY: i.shakeY ?? 0,
    // 7. 物のフェード: world の今の線(camera.y + 0.14H)から幅 80 で消える(なめらか)。
    farRefY: i.camY + i.viewH * i.fadeTopFrac + fadePx, farStart: 0, farEnd: fadePx,
    kind: 'corridor', m7, noHorizonFade: true,
    cxw: 0, // 4. 消失点の列は world x=0(通路の中心)
    gRef: NaN, syRef: NaN, convRef: NaN, convStd: NaN, syStd: NaN,
  };
};

/**
 * 床に渡す前進量(★#45=A・§3-10c): travel' = U0 − d_ref − W_ref、U0 = GOAL_TILE_START + FLOOR_REPEAT/2 + goalY。
 * 床の模様の行 u = d + travel' が world の点ごとに時間で一定になる(u = U0 − y)=床がカメラに付いて流れ、ハッチが円の真下に来る。
 * goalY は store の CORRIDOR_GOAL_Y(utils から store を読まないため呼び手が渡す)。
 */
export const corridorFloorU0 = (goalY: number): number => CORRIDOR_GOAL_TILE_START + CORRIDOR_FLOOR_REPEAT / 2 + goalY;
export const corridorFloorTravel = (f: ProjFrame, goalY: number): number => {
  const m = f.m7;
  if (!m) return NaN;
  return corridorFloorU0(goalY) - m.dRef - f.wRef;
};

/** 行 ℓ(床の s7 = ℓ/denom)の床の模様の行 u(= d + travel・CorridorLayer.updateFloor の式の写し)。計器・テスト用。 */
export const corridorFloorUAtLocal = (f: ProjFrame, l: number, travel: number): number => {
  const m = f.m7!;
  const s = Math.max(0.02, l / m.denom);
  return m.focal * (1 / s - 1) + travel;
};

/** 物の明るさ(★#47=A の U34・`?corrdark=1` の時だけ): (1 − α(物の行)) ÷ (1 − α(主人公の行))・上限1。αは床の遠方の暗幕(消失点 α1 → 画面の下端 α0 の直線)。 */
export const corridorDarkMul = (f: ProjFrame, lObj: number): number => {
  const m = f.m7;
  if (!m) return 1;
  const span = Math.max(1e-6, f.screenH - m.hY);
  const aAt = (l: number) => Math.max(0, Math.min(1, 1 - l / span));
  const base = 1 - aAt(f.lRef);
  if (!(base > 1e-6)) return 1;
  return Math.max(0, Math.min(1, (1 - aAt(lObj)) / base));
};

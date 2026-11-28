// `?proj=1`(投影)の旗と、投影の式が読む定数・ツマミの正本(純関数側・PixiJS を読まない)。
// 設計書: research/PERSPECTIVE_PROJECTION.md §3-9d「utils へ移す物」・§3-9o カ・ケ9。
//
// pixiScene もここを読む(値は1本)。★既定(`?proj` 省略)はブラウザでは PROJ_ON=true(新方式・社長承認2026-11-25
// 「旧版はもう残さなくていいよ」の段1)。`?proj=0` で旧方式に戻せる(段2で旧方式のコードを消すまでの控え)。
// ★ユニットテスト(window が無い環境)では今まで通り false=旧方式。テストの前提を一斉に変えないための決まり
// (新方式を試すテストは今まで通り自分で旗を立てる)。
import { parseObjDepthMode, OBJ_DEPTH_TILT_TRAP_FAR, OBJ_DEPTH_TILT_GFAR } from './groundDepthScale';

const urlParam = (key: string): string | null =>
  typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get(key);

/** URLクエリの数(pixiScene の tsNum と同じ読み方)。 */
export const projTsNum = (key: string, def: number): number => {
  const v = urlParam(key);
  const n = v == null ? NaN : Number(v);
  return Number.isFinite(n) ? n : def;
};

/** URLクエリの真偽(pixiScene の tsBool と同じ読み方)。 */
export const projTsBool = (key: string, def: boolean): boolean => {
  const v = urlParam(key);
  return v == null ? def : (v === '1' || v === 'true');
};

/**
 * 既定の投影。ブラウザ=true。ユニットテスト=false(window が無い、または vitest の MODE='test'。
 * window を stubGlobal してから読み込むテストでも旧方式のまま=テストの前提を変えない)。
 */
const PROJ_DEFAULT_ON = typeof window !== 'undefined' && import.meta.env?.MODE !== 'test';
/**
 * 投影(新方式)。★ブラウザの既定は ON(`?proj=0` で旧方式)。★ユニットテスト(window が無い)では既定 OFF のまま。
 */
export const PROJ_ON = projTsBool('proj', PROJ_DEFAULT_ON);
/** 手前の地面の伸びを抑える(基準行より南だけ「縦の伸び ≤ 横の倍率」)。社長裁定2026-11-23「抑えた案で」=既定ON。`?projnear=0` で旧い伸び方(比較用)。 */
export const PROJ_NEAR = PROJ_ON && projTsBool('projnear', true);
/** ★#20 裁定②=2(既定)。1=比べるための控え(ℓ_ref をズーム1の値の定数のまま)。 */
export const PROJ_ZREF: 1 | 2 = projTsNum('projzref', 2) === 1 ? 1 : 2;
/** ★#4「描く距離の上限」(叩き台): 主人公から北へこの距離で alpha 0。0=上限なし。 */
export const PROJ_FAR_END = Math.max(0, projTsNum('projfar', 1500));
/** フェードの始まり(叩き台 1,200→1,500 の比のまま ?projfar に付いて動く)。 */
export const PROJ_FAR_START = PROJ_FAR_END * (1200 / 1500);

// ---- 地面の曲線(pixiScene から移した・値と式は元のまま) ----
/** ?objdepth=: ?proj=1 が勝つ(★#19・§3-1: objdepth=2 の地面の傾きも効かない)。 */
export const OBJ_DEPTH_MODE = PROJ_ON ? 0 : parseObjDepthMode(projTsNum('objdepth', 0));
export const GROUND_TILE_SCALE_X = 0.82;
export const GROUND_TILE_SCALE_Y_NEAR = 0.82;
/** 床の遠景効果(奥の縦圧縮)。?gfar=。 */
export const GROUND_TILE_SCALE_Y_FAR = projTsNum('gfar', OBJ_DEPTH_MODE === 2 ? OBJ_DEPTH_TILT_GFAR : 0.055);
/** 床の遠近カーブ。?gcurve=。 */
export const GROUND_PERSPECTIVE_CURVE = projTsNum('gcurve', 2.6);
/** 床の台形化(0=従来・1=フル)。?g3d=。 */
export const GROUND_TRAPEZOID = Math.max(0, Math.min(1, projTsNum('g3d', 1)));
/** 最奥での横倍率(手前=1)。?g3dfar=。 */
export const GROUND_TRAPEZOID_FAR = Math.max(0.05, Math.min(1, projTsNum('g3dfar', OBJ_DEPTH_MODE === 2 ? OBJ_DEPTH_TILT_TRAP_FAR : 0.10)));
/** 1=直線(既定)。?g3dc=。 */
export const GROUND_TRAPEZOID_CURVE = Math.max(0.2, Math.min(3, projTsNum('g3dc', 1)));

// ---- ゲーム側の旗(★ごと・§3-9d「旗」・§3-9o カ・ケ9) ----
/**
 * ゲーム側の「見えている」の画面(★#38)が組めるか。森の足元の行の純関数(utils/horizonForestLine)ができたので true。
 * これが偽の間は湧き・回収も `?proj=0` の式のまま(ケ9)。
 */
export const PROJ_GAME_VIEW_READY = true;
/** ★#38/★#9=A: ゲーム側の「見えている」を投影のゲームの画面で測る。 */
export const PROJ_GAME_VIEW = PROJ_ON && PROJ_GAME_VIEW_READY;
/** ★#36: 湧く範囲(縦横で使い回す矩形)と湧きのフェードイン。 */
export const PROJ_GAME_SPAWN = PROJ_ON && PROJ_GAME_VIEW_READY;
/** ★#37: 回収の範囲(縦横で使い回す矩形)と回収のフェードアウト。 */
export const PROJ_GAME_RECYCLE = PROJ_ON && PROJ_GAME_VIEW_READY;
/** ★#40=B: 照準の吸い付きを描かれた頭の画面点で測る(PC マウスだけ)。 */
export const PROJ_GAME_SNAP = PROJ_ON;
/** ★#41: 推薦 B(今の式のまま)=立てない。A に決まった時だけ PROJ_ON に繋ぐ。 */
export const PROJ_GAME_LEAD = false;

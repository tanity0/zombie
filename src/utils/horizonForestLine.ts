// 遠景森1(地平の森)の縦の配置と、そこから出る「地平線フェードの境目」(森の足元の行)の純関数(PixiJS を読まない)。
// 設計書: research/PERSPECTIVE_PROJECTION.md §3-9d「utils へ移す物」(森の足元の行を出す純関数)・§3-9o エ。
//
// pixiScene の horizonForestY / horizonForestHeight / horizonActorHideScreenY はこの関数を呼ぶ(値は1本)。
// ゲーム側の「ゲームの画面」(utils/projGameView・★#38)も同じ関数で地平線フェードの境目を出す。
// 定数・ツマミ(?northscale= 等)は pixiScene から移した(値と式は元のまま)。
import { projTsNum } from './projFlag';

export const HORIZON_FOREST_HEIGHT_RATIO = 0.22;
export const HORIZON_FOREST_MIN_HEIGHT = 120;
export const HORIZON_FOREST_MAX_HEIGHT = 185;
/** 遠景森1(地平の森)のサイズ倍率(社長指示v0.25.1884「1.5倍」)。通常ステージのみ(stage5/tutorialは実寸固定)。 */
export const FAR_FOREST_SIZE_SCALE = 1.5;
export const HORIZON_FOREST_OVERLAP_RATIO = 0.18;
export const HORIZON_FOREST_Y_OFFSET_PX = -100;
/** ステージ2だけ遠景森1を下げる量(px)。他ステージは0。 */
export const LAB_HORIZON_FOREST_EXTRA_DOWN = 20;
/** ステージ5の森1の高さ(px・社長指示v0.25.1743で150→130)。 */
export const STAGE5_HORIZON_FOREST_HEIGHT_PX = 130;
/** ステージ5の森1の底=境界線から下へ(px)。 */
export const STAGE5_HORIZON_FOREST_DOWN_PX = 20;
/** チュートリアル: 遠景内の水面下端(クロップ後710px基準)。 */
export const TUTORIAL_HORIZON_WATER_BOTTOM_FRAC = 516 / 710;
/** チュートリアル: 帯上端が水面に被る量(v0.25.1819: 社長指示「10px上へ」で44→54)。 */
export const TUTORIAL_HORIZON_HEAD_PX = 54;
/** チュートリアル: v0.25.1819: 社長指示「高さを10px縮める」+上移動10px分で20→40(下端=境界線−40px)。 */
export const TUTORIAL_HORIZON_HEIGHT_TRIM_PX = 40;
export const HORIZON_ACTOR_HIDE_OFFSET_PX = 0;
// 北部(stage-4=snow)の遠景森1(氷壁)の拡大/上移動/高さトリム。?northscale= /?northup= /?northtrim= で現地調整可。
export const NORTH_FAR_FOREST_EXTRA_SCALE = projTsNum('northscale', 1.5);   // 全体1.5倍にさらに上乗せ(=元base比2.25倍)
export const NORTH_FAR_FOREST_UP_PX = projTsNum('northup', 50);            // 位置を上へ(px。上=Y減算)。v1890で-50、v1891で50に確定(社長・下-50から100px上=+50)
export const NORTH_FAR_FOREST_HEIGHT_TRIM_PX = projTsNum('northtrim', 100); // 高さを戻す(px)
/** エンディング: 奥(遠景森1・地平帯)。既定=等倍。 */
export const ENDING_HORIZON_SCALE = Math.max(0.2, projTsNum('endhz', 1));
// 遠景森1(地平の森)の縦「上移動」px を全ステージ個別に持たせる(上=Y減算)。ミッションコード名の ?mXup= で現地調整
// (m0up=tutorial 〜 m7up, ex1up/ex2up)。社長指示v0.25.1901。経緯は pixiScene の旧い定義のコメント(git の履歴)。
export const HORIZON_FOREST_UP_BY_STAGE: Readonly<Record<string, number>> = {
  'stage-tutorial': projTsNum('m0up', 0),
  'stage-1': projTsNum('m1up', 60), // 40→60(社長v0.25.1942「森1を20px上へ」)
  'stage-2': projTsNum('m2up', 60),
  'stage-3': projTsNum('m3up', 50),
  'stage-4': projTsNum('m4up', 0),
  'stage-5': projTsNum('m5up', 0),
  'stage-6': projTsNum('m6up', 0),
  'stage-7': projTsNum('m7up', 60), // M1と同じく40→60(社長v0.25.1942「m7のも同時に」)
  'stage-ex1': projTsNum('ex1up', 0), // v0.25.3718(社長「EXステージは6だよ」): stage-6と同じ既定0へ
  'stage-ex2': projTsNum('ex2up', 0),
};

/** 森1の配置を決める入力(pixiScene の状態の写し)。 */
export interface HorizonForestInput {
  /** 論理画面の高さ。 */
  screenH: number;
  /** 遠景の帯の高さ(pixiScene.farBackdropHeight)。 */
  farH: number;
  /** 遠景の鍵(pixiScene.currentFarKey: 'tutorial' / 'snow' / 'ending' / 'lab' / 'forest' 等)。 */
  farKey: string;
  /** ステージ5(遠景 'stage5')。 */
  stage5: boolean;
  /** 研究所のテーマ。 */
  lab: boolean;
  /** ステージ別の上移動(HORIZON_FOREST_UP_BY_STAGE)。 */
  upPx: number;
}

/** 森1の高さ(pixiScene.horizonForestHeight の式)。 */
export const horizonForestHeightFor = (i: HorizonForestInput): number => {
  const base = Math.min(
    HORIZON_FOREST_MAX_HEIGHT,
    Math.max(HORIZON_FOREST_MIN_HEIGHT, i.screenH * HORIZON_FOREST_HEIGHT_RATIO)
  );
  if (i.farKey === 'tutorial') {
    return i.farH * (1 - TUTORIAL_HORIZON_WATER_BOTTOM_FRAC) + TUTORIAL_HORIZON_HEAD_PX - TUTORIAL_HORIZON_HEIGHT_TRIM_PX;
  }
  const northExtra = i.farKey === 'snow' ? NORTH_FAR_FOREST_EXTRA_SCALE : 1;
  const northTrim = i.farKey === 'snow' ? NORTH_FAR_FOREST_HEIGHT_TRIM_PX : 0;
  const endingScale = i.farKey === 'ending' ? ENDING_HORIZON_SCALE : 1;
  return i.stage5 ? STAGE5_HORIZON_FOREST_HEIGHT_PX : base * FAR_FOREST_SIZE_SCALE * northExtra * endingScale - northTrim;
};

/** 森1の上端のローカルY(pixiScene.horizonForestY の式)。 */
export const horizonForestYFor = (i: HorizonForestInput, horizonH: number): number => {
  const up = i.upPx;
  if (i.stage5) return i.farH + STAGE5_HORIZON_FOREST_DOWN_PX - horizonH - up;
  if (i.farKey === 'tutorial') return i.farH * TUTORIAL_HORIZON_WATER_BOTTOM_FRAC - TUTORIAL_HORIZON_HEAD_PX - up;
  return i.farH - horizonH * HORIZON_FOREST_OVERLAP_RATIO + HORIZON_FOREST_Y_OFFSET_PX + (i.lab ? LAB_HORIZON_FOREST_EXTRA_DOWN : 0)
    - (i.farKey === 'snow' ? NORTH_FAR_FOREST_UP_PX : 0)
    - up;
};

/**
 * 地平線フェードの境目(森1の足元)のローカルY(ズーム前・camera.y からの差)。
 * pixiScene.horizonActorHideScreenY と同じ値(= 森1の上端 + 高さ − HORIZON_ACTOR_HIDE_OFFSET_PX)。
 */
export const horizonForestFootLocalY = (i: HorizonForestInput): number => {
  const h = horizonForestHeightFor(i);
  return horizonForestYFor(i, h) + h - HORIZON_ACTOR_HIDE_OFFSET_PX;
};

/**
 * 地平線フェードの濃さ(pixiScene.horizonActorAlpha の式を、ズーム前のローカルY で書いた物)。
 * localY = 足元のローカルY(表示Y − camera.y)、footLocal = horizonForestFootLocalY、zoom = worldGroup のズーム、fadePx = 帯の幅(画面px)。
 * postZoomFadeAlpha の (localY·z + off − (footLocal·z + off)) / fadePx と同じ(オフセットは打ち消し合う)。
 */
export const horizonFadeAlphaAt = (localY: number, footLocal: number, zoom: number, fadePx: number): number => {
  const d = (localY - footLocal) * zoom;
  if (fadePx <= 0) return d >= 0 ? 1 : 0;
  return Math.max(0, Math.min(1, d / fadePx));
};

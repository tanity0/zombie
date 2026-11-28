// 床帯の上下端・本数・stripH(renderSpec から移した正本・PixiJS を読まない)。
// ゲーム側の「ゲームの画面」(utils/projGameView・research/PERSPECTIVE_PROJECTION.md §3-9d)も描画と同じ式で組むため utils に置く。
// renderSpec は同じ物を再エクスポートする(値は1本)。

/** 床ストリップの基準本数(72)。 */
export const GROUND_STRIP_REF_COUNT = 72;

export interface GroundBandLayout {
  /** 帯の上端(ローカルY)。常に farH のまま(不変)。 */
  top: number;
  /** 帯の下端(ローカルY)。overscan=1 なら screenH 相当・overscan>1 ならその分下へ延長。 */
  bottom: number;
  /** ストリップ総本数。overscan=1 なら refStripCount(=72)。 */
  stripCount: number;
  /** 1本の高さ(ローカルpx)。overscan に関わらず値は不変(=定義域不変)。 */
  stripH: number;
}

/**
 * 床帯の上下端・本数・stripH を算出する。
 * 恒等(overscan=1): top=farH, bottom=screenH相当(=farH+groundH), stripCount=refStripCount,
 * stripH=groundH/refStripCount ——旧来の 72本ぶんの値と厳密一致(受け入れ条件1)。
 * overscan=1/ZOOM_MIN_ABS(=2.5)なら stripCount=180(=72×2.5)で、下端が groundH×2.5 ぶん延長される。
 */
export const computeGroundBandLayout = (
  farH: number,
  screenH: number,
  overscan: number,
  refStripCount: number = GROUND_STRIP_REF_COUNT,
): GroundBandLayout => {
  const groundH = Math.max(1, screenH - farH);
  const stripH = groundH / refStripCount;
  const stripCount = Math.max(1, Math.round(refStripCount * Math.max(1, overscan)));
  const bottom = farH + stripCount * stripH;
  return { top: farH, bottom, stripCount, stripH };
};


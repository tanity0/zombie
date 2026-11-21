/**
 * 横長画面の左右の枠(research/STAGE_FRAMES.md)。ステージの風景の前景シルエットを画面の端に重ねて、
 * 横長の時に空く左右の余白を「手前でピントの外れた風景」に見せる。**見た目だけ**(判定・湧き・カメラ・ズームに無関係)。
 *
 * - 横長(w > h)の時だけ出す。スマホ縦は1pxも変えない。
 * - 絵は `public/sprites/<名前>.png` の原盤。ステージに入る時だけ読む(pixiTextures の遅延組 `frames:<stageId>`)。
 * - 左と右は別の絵(鏡写しにしない)。登録の無い側は出さない。
 *
 * renderer 非依存(PixiJS を import しない)。描画は `pixi/stageFrameLayer.ts`。
 */

export type StageFrameSide = 'left' | 'right';

/** ステージ → 左右の絵(スプライト名=`public/sprites/` からの相対・拡張子なし)。足す時はここに1行。 */
export const STAGE_FRAMES: Readonly<Record<string, Readonly<Partial<Record<StageFrameSide, string>>>>> = {
  // ステージ1 狂い咲きの森: 左=鍾乳石の垂れた岩と苔・つる(社長支給2026-11-21・228×512・試作)。
  // 右=岩の割れ目と垂れる鍾乳石・下に苔と草(社長支給2026-11-21・268×488)。
  'stage-1': { left: 'frames/stage1-left', right: 'frames/stage1-right' },
};

/** そのステージの枠の絵の名前(左→右の順)。登録が無ければ空。 */
export const stageFrameSprites = (stageId: string): string[] => {
  const f = STAGE_FRAMES[stageId];
  if (!f) return [];
  return (['left', 'right'] as const).map(side => f[side]).filter((n): n is string => !!n);
};

/** 遅延組のキー(`pixiTextures` の DEFERRED_SPRITE_GROUPS に、ステージごとに1つ)。 */
export const stageFrameGroupKey = (stageId: string): string => `frames:${stageId}`;

/**
 * ステージ開始のヘリ飛来の間の「枠のトンネル」(utils/introFrameTunnel.ts)を出すか。**縦持ち・横持ち関係なく**
 * (社長指示2026-11-21)、枠の絵が登録されたステージ(屋内・回廊を除く)で出す。演出が終わった後の縦画面は何も残さない。
 */
export const stageFramesTunnelWanted = (o: { stageId: string; indoor?: boolean; corridor?: boolean }): boolean =>
  !o.indoor && !o.corridor && stageFrameSprites(o.stageId).length > 0;

/** 横長の時だけ出す(スマホ縦=w <= h では出さない・読まない)。 */
export const stageFramesWanted = (o: { stageId: string; w: number; h: number; indoor?: boolean; corridor?: boolean }): boolean =>
  o.w > o.h && !o.indoor && !o.corridor && stageFrameSprites(o.stageId).length > 0;

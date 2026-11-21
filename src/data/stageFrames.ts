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
  // ステージ2 研究所跡: 左=苔と蔦の絡む岩壁と緑の光、右=蔦の絡む崩れた柱(社長支給2026-11-21・59×128 / 70×128)。
  'stage-2': { left: 'frames/stage2-left', right: 'frames/stage2-right' },
  // ステージ3 医療科学センター(昼): 左=蔦の絡む崩れた石造りの壁、右=傾いた街灯と崩れた壁と瓦礫(社長支給2026-11-21)。
  'stage-3': { left: 'frames/stage3-left', right: 'frames/stage3-right' },
  // ステージ4 封鎖地域: 左=雪をかぶった枯れ木の枝、右=雪に埋もれた有刺鉄線の柵の柱(社長支給2026-11-21)。
  'stage-4': { left: 'frames/stage4-left', right: 'frames/stage4-right' },
  // ステージ5 軍本部: 左=枯れ木と木の杭の柵と赤い布、右=崩れた鉄骨と破れた布と瓦礫(社長支給2026-11-21)。
  'stage-5': { left: 'frames/stage5-left', right: 'frames/stage5-right' },
  // ステージ6 古い洋館: 左右とも、上から垂れる重いカーテン(左右で別の形)と燭台(社長支給2026-11-21)。
  'stage-6': { left: 'frames/stage6-left', right: 'frames/stage6-right' },
  // ステージ7 逆探知地点: 左=垂れた枝の焦げた枯れ木と枯れ草、右=別形の枯れ木と灰の積もった根元(社長支給2026-11-21)。
  'stage-7': { left: 'frames/stage7-left', right: 'frames/stage7-right' },
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

/**
 * 回廊(洋館の疑似3Dの通路)でも横長の常時の枠を出すステージ。ステージ6は全編が回廊なので、ここに入れないと一度も出ない
 * (社長支給のカーテン2026-11-21)。出撃のトンネルは回廊では出さない(ヘリの登場が無い)。
 */
export const STAGE_FRAMES_IN_CORRIDOR: ReadonlySet<string> = new Set(['stage-6']);

/**
 * 常時の枠を出すか。横長も縦(スマホ)も出す(社長指示2026-11-21「全ステージの枠、左右、3分の1くらいはスマホの縦持ちでも
 * 映り込んでみていいかも。上下が少し映り込んでる感じになると思う」)。縦での出し方は stageFrameVisibleFrac。
 * w・h は呼び手の互換のために残す(判定には使わない)。
 */
export const stageFramesWanted = (o: { stageId: string; w: number; h: number; indoor?: boolean; corridor?: boolean }): boolean =>
  !o.indoor && (!o.corridor || STAGE_FRAMES_IN_CORRIDOR.has(o.stageId)) && stageFrameSprites(o.stageId).length > 0;

/** 縦画面で画面の中へ映り込ませる枠の幅の割合(残りは画面の外へ押し出す)。 */
export const STAGE_FRAME_PORTRAIT_VISIBLE_FRAC = 1 / 3;
/** 枠の幅のうち画面の中に見せる割合。横長=1(全部)、縦(w <= h)=STAGE_FRAME_PORTRAIT_VISIBLE_FRAC。 */
export const stageFrameVisibleFrac = (w: number, h: number): number => (w > h ? 1 : STAGE_FRAME_PORTRAIT_VISIBLE_FRAC);

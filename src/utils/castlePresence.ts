/**
 * そのランに「城」(城ボスの建物=castleEvent の城)が在るか。城の絵・当たり判定の押し戻し・弾の遮蔽・
 * 画面外の矢印・投影影・手置きの物としての場所取り・ジュンの道筋の障害物・帰還サークルの置き場所の避け方——
 * 城を前提にする所は全部この1本で「在る/無い」を引く(場所ごとに条件を書き分けない)。
 *
 * 城が無いラン:
 * - ステージ7(逆探知地点)=社長指示2026-11-24「ステージ7は城のオブジェクト要らない」。
 *   ※グレン(ストーリーボス)は城とは別の経路(主人公の真上)で出るので影響しない。
 * - チュートリアル(farBackdrop 'tutorial')・エンディング('ending')=見せるだけ/何もかも無し。
 * - 研究所スキン(stageTheme 'lab')=城の建物は描かない(giantbat の湧きは城座標のまま=場所取りは呼び手が別に持つ)。
 * - 洋館通路(corridorMode)=城なし(城の実体は遥か遠方に置いてある)。
 *
 * 屋内(indoorMode)・ボス戦中の施設ロック・崩落(collapsedAt)は「ランの間に変わる状態」なので、ここには入れず呼び手が見る。
 * 純関数(store/pixi を import しない)。
 */
export interface CastlePresenceCtx {
  stageId: string;
  farBackdrop: string;
  stageTheme: string;
  corridorMode: boolean;
}

/** 城を置かないステージ(ステージ単位の指定)。 */
export const CASTLELESS_STAGE_IDS: ReadonlySet<string> = new Set(['stage-7']);

/** このランに城が在るか(false=城の絵も判定も矢印も影も出さない)。 */
export const castlePresent = (ctx: CastlePresenceCtx): boolean =>
  !CASTLELESS_STAGE_IDS.has(ctx.stageId)
  && ctx.farBackdrop !== 'tutorial'
  && ctx.farBackdrop !== 'ending'
  && ctx.stageTheme !== 'lab'
  && !ctx.corridorMode;

// 固定設計ビュー(固定FOV)の計算。レンダラ非依存の純粋関数で、描画(Pixi)・シミュレーション(画面外判定)・
// 入力(タップ→ワールド)の3系統が同じ論理座標を共有するための単一の真実。
//
// ★本作は【縦持ち専用】(OrientationGuard が横持ちを全面ブロック / PCのみ横だが切り捨て)。基準は 9:16 縦。
// 設計思想(SerialGames「スマホゲーム画面デザイン」+ アクション向けの追加):
//  ・基準は 9:16 の「コア」(VIEW_CORE_W×VIEW_CORE_H)。これは【必ず全部見える】=重要物の安全領域。
//  ・コアを contain した上で、余った軸だけ世界を伸ばして画面を埋める(★黒帯を出さない)。
//    └ 縦長端末(9:19.5〜9:21)=横固定で縦へ伸び / 縦に広い端末(タブレット3:4等)=縦固定で横へ伸びる
//      (記事の「縦長は横固定縦伸ばし・横に広いは縦固定横伸ばし」をそのまま縦持ちに適用)。
//  ・伸ばし軸は VIEW_MAX_W/H で頭打ち(=見せ過ぎ防止)。記事には無い、アクションゲーム固有のFOV公平性。
//    「大画面ほど戦場が広く見えて有利」を防ぎ、どの端末でもほぼ同じ視野にする。
// 出力 scale は「ワールドpx → デバイスpx」。Pixi では app.stage.scale に入れ(端末解像度のまま拡縮=キレ維持)、
// 入力では (clientX-rect.left)/scale で論理座標へ戻す。logicalW/H はシーン(screenW/H)とシム(gameBounds)が使う。

// 必ず見える 9:16 コア(ワールドpx・縦持ち)。CORE_W は中位スマホのCSS幅(~390-430)に近い値=旧来の1:1の見え方を
// ほぼ維持(scale≈1)。社長が実機で微調整可。
export const VIEW_CORE_W = 405;
export const VIEW_CORE_H = 720;
// 伸ばし軸の上限(ワールドpx)。横=タブレット3:4で見せる横の上限 / 縦=縦長スマホ(~9:21)で見せる縦の上限。
export const VIEW_MAX_W = 540;
export const VIEW_MAX_H = 960;

export interface Viewport {
  scale: number;     // ワールドpx → デバイスpx(= app.stage.scale 兼 入力の割り算係数)
  logicalW: number;  // シーン/シムが使う論理画面幅(ワールドpx)
  logicalH: number;  // 〃 高さ
}

// 実デバイス解像度(CSS px)から、固定ビューの scale と論理寸法を算出する。
export const computeViewport = (realW: number, realH: number): Viewport => {
  const w = Math.max(1, realW);
  const h = Math.max(1, realH);
  // コアを contain する最大スケール: scale ≤ これ で「コアが全部見える」。余った軸は世界が伸びる(黒帯なし)。
  const sContain = Math.min(w / VIEW_CORE_W, h / VIEW_CORE_H);
  // 伸ばし軸を MAX 以下に収める最小スケール: scale ≥ これ で「見せ過ぎない」。
  const sCap = Math.max(w / VIEW_MAX_W, h / VIEW_MAX_H);
  // 通常域(縦持ちスマホ 9:16〜9:21 / タブレット 3:4)では sCap ≤ sContain なので scale=sContain(クランプ不発)。
  // 極端アスペクトのみ sCap が勝ち、伸ばし軸を頭打ちにする(その分コアの反対軸が僅かに減るが黒帯は出さない)。
  const scale = Math.max(sContain, sCap);
  return { scale, logicalW: w / scale, logicalH: h / scale };
};

// 固定設計ビュー(固定FOV)の計算。レンダラ非依存の純粋関数で、描画(Pixi)・シミュレーション(画面外判定)・
// 入力(タップ→ワールド)の3系統が同じ論理座標を共有するための単一の真実。
//
// 設計思想(SerialGames「スマホゲーム画面デザイン」+ アクション向けの追加):
//  ・基準は 16:9 の「コア」(VIEW_CORE_W×VIEW_CORE_H)。これは【必ず全部見える】=重要物の安全領域。
//  ・コアを contain した上で、余った軸だけ世界を伸ばして画面を埋める(★黒帯を出さない)。
//    └ 横長端末=横へ伸び / 縦に広い端末(タブレット4:3等)=縦へ伸びる(記事の「片軸固定・他軸伸ばし」)。
//  ・伸ばし軸は VIEW_MAX_W/H で頭打ち(=見せ過ぎ防止)。記事には無い、アクションゲーム固有のFOV公平性。
//    「大画面ほど戦場が広く見えて有利」を防ぎ、どの端末でもほぼ同じ視野にする。
// 出力 scale は「ワールドpx → デバイスpx」。Pixi では app.stage.scale に入れ(端末解像度のまま拡縮=キレ維持)、
// 入力では (clientX-rect.left)/scale で論理座標へ戻す。logicalW/H はシーン(screenW/H)とシム(gameBounds)が使う。

// 必ず見える 16:9 コア(ワールドpx)。社長確定値。実機で微調整可。
export const VIEW_CORE_W = 960;
export const VIEW_CORE_H = 540;
// 伸ばし軸の上限(ワールドpx)。横長端末で見せる横の上限 / 縦に広い端末で見せる縦の上限。
export const VIEW_MAX_W = 1200;
export const VIEW_MAX_H = 720;

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
  // 通常域(横持ちスマホ〜タブレット ~1.33:1〜2.2:1)では sCap ≤ sContain なので scale=sContain(クランプ不発)。
  // 極端アスペクトのみ sCap が勝ち、伸ばし軸を頭打ちにする(その分コアの反対軸が僅かに減るが黒帯は出さない)。
  const scale = Math.max(sContain, sCap);
  return { scale, logicalW: w / scale, logicalH: h / scale };
};

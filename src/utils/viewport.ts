// 固定設計ビュー(固定FOV)の計算。レンダラ非依存の純粋関数で、描画(Pixi)・シミュレーション(画面外判定)・
// 入力(タップ→ワールド)の3系統が同じ論理座標を共有するための単一の真実。
//
// 基準は 9:16 縦(スマホは縦持ち専用=OrientationGuard が横持ちを止める)。PC の横長は下の VIEW_PC_* の分岐(research/PC_SUPPORT.md)。
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

// ★PC版(横長の画面・research/PC_SUPPORT.md・社長裁定2026-10-02「やってみよか推薦で」):
//   横長では**縦をスマホが必ず見せている高さ(VIEW_CORE_H=720)に固定**し、横は画面の比率なり(16:9 で 1280)。
//   16:9 より横に広い画面はゲームの枠そのものを 16:9 に絞る(左右に帯=Game.tsx の .game-frame)ので、横は 1280 を超えない
//   (ウルトラワイドで横が見え過ぎて有利になる、を作らない=Vampire Survivors と同じ考え)。
export const VIEW_PC_H = VIEW_CORE_H;
export const VIEW_PC_MAX_W = Math.round((VIEW_PC_H * 16) / 9); // 1280

export interface Viewport {
  scale: number;     // ワールドpx → デバイスpx(= app.stage.scale 兼 入力の割り算係数)
  logicalW: number;  // シーン/シムが使う論理画面幅(ワールドpx)
  logicalH: number;  // 〃 高さ
}

// 実デバイス解像度(CSS px)から、固定ビューの scale と論理寸法を算出する。
export const computeViewport = (realW: number, realH: number): Viewport => {
  const w = Math.max(1, realW);
  const h = Math.max(1, realH);
  if (w * VIEW_PC_H >= h * VIEW_MAX_W) {
    // 横長(PC)と、それに近い窓(幅/高さ ≥ 540/720=3:4): 縦=720 固定。横は比率なり(枠が 16:9 に絞られていれば 1280。
    // 万一絞られていなくても 1280 で頭打ち=見せ過ぎない)。境目を 3:4 に置くのは縦持ちの式と**ちょうど同じ値(540×720)で繋がる**
    // から(正方形の窓で 540×540 ⇔ 720×720 と視野が跳ぶ、を作らない=設計監査 B-3)。縦持ちのスマホ(9:16〜9:21)はこの分岐に入らない。
    const scale = Math.max(h / VIEW_PC_H, w / VIEW_PC_MAX_W);
    return { scale, logicalW: w / scale, logicalH: h / scale };
  }
  // コアを contain する最大スケール: scale ≤ これ で「コアが全部見える」。余った軸は世界が伸びる(黒帯なし)。
  const sContain = Math.min(w / VIEW_CORE_W, h / VIEW_CORE_H);
  // 伸ばし軸を MAX 以下に収める最小スケール: scale ≥ これ で「見せ過ぎない」。
  const sCap = Math.max(w / VIEW_MAX_W, h / VIEW_MAX_H);
  // 通常域(縦持ちスマホ 9:16〜9:21 / タブレット 3:4)では sCap ≤ sContain なので scale=sContain(クランプ不発)。
  // 極端アスペクトのみ sCap が勝ち、伸ばし軸を頭打ちにする(その分コアの反対軸が僅かに減るが黒帯は出さない)。
  const scale = Math.max(sContain, sCap);
  return { scale, logicalW: w / scale, logicalH: h / scale };
};

/**
 * PC の横長で HUD・ゲーム中のメニューを拡大する倍率(research/PC_SUPPORT.md 段3・components/HudScale.tsx)。
 * 枠の高さ/760(スマホの HUD とゲーム画面の比 ≈1.06 に近づける)。横長だけ。1未満にはしない(1280×720 で等倍)。上限2。
 */
export const hudScaleFor = (frameW: number, frameH: number): number =>
  frameW > frameH ? Math.max(1, Math.min(2, frameH / 760)) : 1;

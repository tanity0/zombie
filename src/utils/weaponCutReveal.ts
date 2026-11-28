// ★武器は「溜め」の間は出さない。**切る/振る瞬間から出す**
// (社長指示2026-09-23「伐採人、ための時は武器は出さない。切るタイミングで表示。
//  他の武器系も攻撃モーションあるやつは同じく」)。
//
// ★なぜ: 攻撃モーションのシートには**溜めの姿がもう描かれている**。そこへ別スプライトの武器を
//   重ねると、絵の腕と武器が別々の事を言う。振る瞬間から出せば、絵とスプライトが同じ動作を指す。
// ★**消すのではない**(CLAUDE.md「元々あるエフェクトを、指示なく消さない」/ `ENEMY_SHEET_HAS_WEAPON`
//   の表が空のままなのと矛盾しない)。**出る時刻を溜めの後ろへ動かすだけ**で、振り以降は従来どおり出る。
// ★**パッと出さない**(慣性MUST / PACING_PUZZLE.md §7-15「下から慣性つきズレ+フェード」)。
//   ただし既定の 220ms は**振りの短い技では振り切るまで薄いまま**になるので、振りの尺に合わせて詰める。

/** 出のイージングの上限(§7-15の既定と同値)。 */
export const WEAPON_CUT_EASE_MAX_MS = 220;
/** 同・下限(これより短いと「パッと出る」に見える)。 */
export const WEAPON_CUT_EASE_MIN_MS = 60;
/** 振りのうち、出に使ってよい割合。残り(55%以上)は完全に見えている。 */
export const WEAPON_CUT_EASE_FRAC = 0.45;

/**
 * 「切る」動作の尺から、武器の出に使うイージングの長さを出す。
 * @param cutDurMs 振り(active / 噛みの窓)の長さ。
 */
export const weaponCutEaseMs = (cutDurMs: number): number =>
  Math.max(WEAPON_CUT_EASE_MIN_MS,
    Math.min(WEAPON_CUT_EASE_MAX_MS, (cutDurMs > 0 ? cutDurMs : 0) * WEAPON_CUT_EASE_FRAC));

/**
 * 武器を出してよいか。**溜めの間は false**。
 * @param sinceWindupMs 溜め開始からの経過
 * @param windupMs      溜めの長さ
 */
export const weaponVisibleAtCut = (sinceWindupMs: number, windupMs: number): boolean =>
  sinceWindupMs >= (windupMs > 0 ? windupMs : 0);

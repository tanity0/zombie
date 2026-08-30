/**
 * 赤円の予告を「グラデ赤の帯マスク」で **外枠 → 内側** へ流すための純関数(社長指示 2026-08-30)。
 *
 * 社長の言葉(そのまま):
 * > まず今のサークル絵はそのまま動かさない。で、フェードイン アウトのグラデ赤がこの絵を
 * > マスク的に外枠から内側に流れる(そこだけサークル絵が表示される)。消えきったタイミングで発動 だよ
 *
 * つまり:
 * - **円の絵(塗りの色・濃度・縁の焼き素材)は1バイトも変えない。**
 * - その上に **両縁がフェードする帯** を重ね、**帯が乗っている所だけ絵が見える**ようにする
 *   (= 帯はアルファのマスクであって、新しい意匠ではない)。
 * - **帯が中心で消え切った瞬間 = 判定発生。**
 *
 * PACING_PUZZLE.md §11-2「円=外→内の収縮リング」の実装形。半径(=判定範囲)は1pxも動かさない。
 */

/** 帯の半幅(判定半径に対する比)。叩き台=実機で社長が決める(`?csweepw=` で上書き)。 */
export const CIRCLE_SWEEP_HALF_W = 0.34;

/** 帯を刻む段数(濃度のグラデをこの本数のリングで作る)。 */
export const CIRCLE_SWEEP_STEPS = 14;

/**
 * 帯の中心半径。`prog` 0→1 で **R+halfW → −halfW** へ動く
 * (= 外枠の外から入ってきて、中心を通り抜けて消え切る)。
 *
 * **等速にしない**(CLAUDE.md「動きの絶対ルール: 慣性」)。ease-in(だんだん速くなる)を掛けてあり、
 * 溜めの序盤は外周付近に留まって「どこが危ないか」を見せ、終盤で内側へ加速して消え切る
 * =**消え切る瞬間が立つ**。`ease=false` で等速(ロールバック用)。
 */
export const circleSweepBand = (prog: number, radius: number, halfW: number, ease = true): number => {
  const t = Math.max(0, Math.min(1, prog));
  const e = ease ? t * t : t;
  return (radius + halfW) - e * (radius + halfW * 2);
};

/**
 * 半径 `r` の位置での帯の濃さ(0〜1)。中心で1、両縁へ向かってフェードして0になる(=グラデ)。
 * これを円の絵のアルファに掛ける=マスク。
 */
export const circleSweepAlphaAt = (r: number, band: number, halfW: number): number => {
  if (halfW <= 0) return 0;
  const d = Math.abs(r - band) / halfW;
  if (d >= 1) return 0;
  const t = 1 - d;
  return t * t * (3 - 2 * t); // smoothstep=縁が硬く切れない
};

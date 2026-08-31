/**
 * 帯(カプセル)の予告を「グラデ赤の窓マスク」で **始点 → 終点** へ流すための純関数
 * (社長指示 2026-08-31「帯の流星も同じ仕様にしたいので、試しに城ボスからやって」)。
 *
 * **円(`circleSweep.ts`)と同じ文法を、軸だけ「半径」→「帯の長さ」に置き換えたもの。**
 * - **帯の絵は変えない**(色・濃度式・縁の焼き素材)。**アルファに窓のマスクを掛けるだけ。**
 * - 窓は**両縁がフェード**する(グラデ)。**窓が乗っている所だけ帯が見える。**
 * - **窓が終点を抜け切った瞬間 = 判定発生。**
 * - **帯の長さ・幅(=判定範囲)は1pxも動かさない。**
 *
 * **旧「流星」との違い**(旧= `meteorPhase`: 前45%で始点→終点へ描き切り、後55%で始点から蒸発):
 * 旧は**絵そのものを伸ばして消す**ので、`prog=1` の瞬間に**全形**が出る。
 * 新は**全形の絵を窓で覗く**ので、全形が一度に出る瞬間は無い代わりに、
 * **円の予告とまったく同じ読み方**(赤が流れて消え切ったら来る)になる。
 * どちらを採るかは実機で社長が決める(`?bsweep=0` で旧へ戻せる)。
 */

/** 窓の半幅(帯の全長に対する比)。叩き台=実機で社長が決める(`?bsweepw=` で上書き)。 */
export const BAND_SWEEP_HALF_W = 0.34;

/**
 * 窓の濃さの倍率(現行の帯の塗りαに掛ける)。
 * 円と同じ理由で要る: 窓の面積は帯全体の一部なので、
 * 全体を薄く塗るための濃さのままだと**画面に出ない**(v0.25.4093 の教訓)。
 * `?bsweepa=` で上書き。
 */
export const BAND_SWEEP_ALPHA_MULT = 2.5;

/** 窓を刻む段数(濃度のグラデをこの本数のスライスで作る)。 */
export const BAND_SWEEP_STEPS = 16;

/**
 * 窓の中心位置(軸上 0=始点 / 1=終点)。`prog` 0→1 で **0 → 1+halfW** へ動く
 * (= 始点に乗った状態で始まり、終点を通り抜けて消え切る)。
 *
 * **1フレーム目から始点に乗せる**のは円と同じ理由——外から入ってくる形にすると
 * 溜めの序盤に**予告が1pxも出ない**時間ができる(v0.25.4093 で円が踏んだ穴)。
 *
 * **等速にしない**(CLAUDE.md「動きの絶対ルール: 慣性」)。ease-in で、
 * 序盤は始点付近に留まり終盤で終点へ加速する=**消え切る瞬間が立つ**。
 */
export const bandSweepCenter = (prog: number, halfW: number, ease = true): number => {
  const t = Math.max(0, Math.min(1, prog));
  const e = ease ? t * t : t;
  return e * (1 + halfW);
};

/**
 * 軸位置 `s`(0〜1)での窓の濃さ(0〜1)。中心で1、両縁へ向かってフェードして0になる。
 * これを帯の絵のアルファに掛ける=マスク。
 */
export const bandSweepAlphaAt = (s: number, center: number, halfW: number): number => {
  if (halfW <= 0) return 0;
  const d = Math.abs(s - center) / halfW;
  if (d >= 1) return 0;
  const t = 1 - d;
  return t * t * (3 - 2 * t); // smoothstep=縁が硬く切れない
};

/** 窓の可視区間 [lo, hi](軸上・0〜1へクランプ済み)。空なら hi <= lo。 */
export const bandSweepWindow = (center: number, halfW: number): { lo: number; hi: number } => ({
  lo: Math.max(0, center - halfW),
  hi: Math.min(1, center + halfW),
});

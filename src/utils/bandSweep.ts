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

/**
 * 帯を刻むスライス数(濃度のグラデをこの本数で作る)。
 *
 * **★v0.25.4103(社長「もっとフェードマスクをシームレスに。ぱつっと感がまだある」)**:
 * 旧版は**窓の範囲だけを切り出して**描いていたので、切り出す以上どこかに必ず**切り口**が出た。
 * **切るのをやめ、帯を全長ぶんこの本数のスライスに分け、スライスごとにアルファだけを窓のグラデで
 * 変える**。図形は常に全長ぶん在り、濃さだけが流れる=**切り口が原理的に存在しない**。
 * 縁の焼き素材も**同じスライスで**描く(素材の端が硬いのは「帯の端」だけで、途中に切り口は出ない)。
 */
export const BAND_SWEEP_SLICES = 30;

/**
 * 窓の中心位置(軸上 0=始点 / 1=終点)。`prog` 0→1 で **−halfW → 1+halfW** へ動く
 * (= 帯の**外から入ってきて、外へ抜けていく**)。
 *
 * **★v0.25.4103 の訂正(社長「サークルの方みたいにちゃんとフェードインアウト」)**:
 * 旧版は `0 → 1+halfW` で、**1フレーム目に始点でいきなり全開**になり、**終点では切り落とし**で
 * 終わっていた(=「ぱつっと」の一因)。外から入って外へ抜ける形にすると、
 * **両端でちゃんとフェードする**。円では帯の外側に**縁の輪**が在るので同じ問題が出なかった。
 *
 * **等速にしない**(CLAUDE.md「動きの絶対ルール: 慣性」)。ease-in で、
 * 序盤は始点付近に留まり終盤で終点へ加速する=**消え切る瞬間が立つ**。
 */
export const bandSweepCenter = (prog: number, halfW: number, ease = true): number => {
  const t = Math.max(0, Math.min(1, prog));
  const e = ease ? t * t : t;
  return -halfW + e * (1 + halfW * 2);
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

/**
 * 窓の可視区間 [lo, hi](軸上・0〜1へクランプ済み)。空なら hi <= lo。
 * **★v0.25.4103以降、描画では使わない**(切り出しをやめてスライスのアルファへ移したため)。
 * 「窓がまだ帯に掛かっているか」を安く判定したい時のために残してある。
 */
export const bandSweepWindow = (center: number, halfW: number): { lo: number; hi: number } => ({
  lo: Math.max(0, center - halfW),
  hi: Math.min(1, center + halfW),
});

/**
 * ★v0.25.4105(社長指示2026-08-31「**帯の追尾してくるところと、止まってからをくっつけられない?
 * つまり追尾から発動まで一貫した流星にしたいってこと**」)
 *
 * 薙ぎ払いの予告は2相ある(§15): **追尾相 `g-sweep-track`(帯が本体+照準について動く)→
 * ロック → 溜め `g-sweep-windup`(帯が止まって発動)**。
 * 窓(流星)の進行をこの**2相の通し**で出す=ロックの瞬間に窓が巻き戻らない。
 *
 * - 追尾相の頭で 0、**溜めの終わり(=判定発生)でちょうど 1**。
 * - 相の境目で値が連続する(段差なし)。
 * - `trackMs = 0`(=`?ttrack=0` で追尾相に入らない)なら、溜めだけで 0→1 =**従来と完全一致**。
 */
export interface SweepTelegraphTiming {
  /** 追尾相の実効長 ms(この技が追尾相を通っていないなら 0)。 */
  trackMs: number;
  /** 溜めの実効長 ms。 */
  windupMs: number;
  /** 今が追尾相か(false = 溜め)。 */
  inTrack: boolean;
  /** 今の相の残り ms。 */
  remainMs: number;
}

export const sweepTelegraphProg = (t: SweepTelegraphTiming): number => {
  const track = Math.max(0, t.trackMs);
  const wind = Math.max(1e-6, t.windupMs);
  const cur = t.inTrack ? track : wind;
  const done = Math.max(0, Math.min(cur, cur - t.remainMs));
  const elapsed = t.inTrack ? done : track + done;
  return Math.max(0, Math.min(1, elapsed / (track + wind)));
};

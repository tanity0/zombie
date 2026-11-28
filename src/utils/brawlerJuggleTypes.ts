// 格闘の浮かせ追撃のフィールドの型(依存ゼロの葉モジュール)。types/game.ts から引くため、brawlerCombo 経由の循環importを作らないようここに置く。

/** 敵の浮きの欄(store の Enemy のうち、ここが読み書きする所だけ)。時計は Date.now。 */
export interface BrawlerJuggleFields {
  /** いまの弧の始まり(絵)。 */
  brawlerLiftAt?: number;
  /** いまの弧の長さ(ms)・頂点の高さ(基準の高さ BRAWLER_LIFT_VIS_PX に対する倍率)・始まりの高さ(同じ倍率)。 */
  brLiftMs?: number;
  brLiftPeak?: number;
  brLiftFrom?: number;
  /** この浮きの中で押し上げた回数(0=最初の浮き)。 */
  brLiftN?: number;
  /** 浮きの終わり(=動けない間の終わり。liftUntil にも同じ値を書く=全ての敵の制御が「持ち上げ」として止まる)。 */
  brLiftUntil?: number;
  /** 着地の砂埃をまだ出していない(絵の弧が終わった瞬間に store が出して消す)。 */
  brLiftLand?: boolean;
  /** §13-2: 残りの拾える回数・ダウン中・バウンドを使った流れ・バウンドの落ちる区間。 */
  brLiftBudget?: number;
  brLiftDown?: boolean;
  /** ボス級: 気絶・紫の間に地上から浮かせたコンボ=軽い重さのまま着地まで(社長裁定2026-11-11・research/BRAWLER.md §25)。 */
  brLiftLight?: boolean;
  brBounceCombo?: number;
  brLiftDropMs?: number;
  /** 弧の形('blast'=爆発の浮き・§14 / 'whip'=鞭の浮き・research/WHIP_FOLLOWUP.md §7=配分は brLiftArc)。無し=格闘の弧。 */
  brLiftShape?: 'blast' | 'throw' | 'whip';
  /** ★鞭の浮きの弧の配分(brLiftShape='whip' の時だけ読む。上り・漂いの割合と上りの動き方)。継ぎ足しで漂いが伸びるので敵ごとに持つ。 */
  brLiftArc?: { rise: number; hover: number };
  /** ★落ちる部分の時間の倍率(1=元の形)。地上から打ち上げた1回目は遅く、空中で拾うたびに速く(brawlerFallK)。上がり・漂いの時間は変えない。無し=1。 */
  brLiftFallK?: number;
  /** ★爆発の浮き(§14): 今の空中が始まった時刻(爆発で浮き直しても続く)・爆発では浮かない窓の終わり(着地から、浮いていた時間と同じ長さ)。Date.now。 */
  brBlastAirSince?: number;
  brBlastNoLiftUntil?: number;
  /** 流れの始まり(バウンドは1コンボに1回の区切り)。 */
  brComboStart?: number;
  /** ダウンの着地の後の固まらない時間(Date.now)。ダウンで書き直す時は遅い方を残す(§19-3 ⑤)。 */
  brNoHoldUntil?: number;
  /**
   * ★止めで遅らせた打ち上げ(社長指示2026-11-27「上がる方も止めて」・utils/brawlerCombo brawlerStopLiftShift)。この当たりで上へ浮かせた弧を、その当たりの止めの間は
   * 上がり始めさせない(弧の始まりを止めの明けへずらす)。その遅らせた長さ(ms)と、遅らせた後の弧の始まり(brawlerLiftAt と同じ値=この弧の名札)。
   * 格闘の当たる高さの帯(utils/brawlerHitHeight)だけが読む=帯は止めで遅らせる前の弧の時計で見る(止めの分だけ定石の間合いがずれない)。
   * brawlerLiftAt が別の値になった(新しい弧を書いた)ら無効。弧の時計をずらす所(brawlerShiftLift・airShotStop)は名札も同じだけずらす。
   */
  brLiftRiseStopMs?: number;
  brLiftRiseStopAt?: number;
}

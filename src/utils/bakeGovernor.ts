/**
 * 焼き置き(影・縁・白)が天井に張り付いた時の焼き直しの間引き(社長実機2026-10-22「ステージ4で急に重くなった。すごくカクカク」)。
 *
 * 天井に達すると「古い物を捨てて新しく焼く」を繰り返す。敵の歩きのコマ×光の向き×倍率など、**今使う物の総量が天井より多い**場面では
 * 捨てた物をすぐ焼き直すことになり、焼き(フィルタつきの描き込み)が毎フレーム数回走る=急に重くなる
 * (ヘッドレス実測: 影の天井に張り付くと 1フレーム 0回 → 約5回)。天井に達するまでは焼き置きが効くので軽い=「途中までは快適」。
 * ⇒ **天井に張り付いている間だけ**、焼き直しを `BAKE_SATURATED_INTERVAL_MS` に1回まで。間に合わない物は、影は直前のコマの影、
 *   縁は出さない、白は光らせない(どれも一瞬・立ち物は消えない)。天井に届いていない時は従来どおり。
 *
 * ★1フレームに1回まで(2026-11-28・社長実機 v0.25.5893 ステージ4「fps2 bk8」)。間隔は**時計(ms)**で測るので、
 *   フレームが重くなる(1フレーム500ms)ほど、影・縁・白がそれぞれ**毎フレーム**焼いてよいことになっていた
 *   (=重いほど1フレームに焼く数が増える悪循環。fps2 で 3種×1回/フレーム)。張り付いている間は
 *   **3種を合わせて1フレームに1回まで**(`BakeFrameGate` を3種で共有)。60fps では間隔の方が先に効くので従来と同じ。
 */
export const BAKE_SATURATED_INTERVAL_MS = 150;

export interface BakeGovernor { lastAt: number }
export const newBakeGovernor = (): BakeGovernor => ({ lastAt: -Infinity });

/** 張り付いている間の「このフレームはもう焼いた」の札(影・縁・白で1つを共有する)。 */
export interface BakeFrameGate { frame: number }
export const newBakeFrameGate = (): BakeFrameGate => ({ frame: -1 });

/**
 * 天井に張り付いている(full)時に、今焼いてよいか。よければ時刻(と札があればフレーム)を打つ。
 * 張り付いていなければ常に true(打たない)。`gate`/`frame` を渡すと、同じフレームで2回目は false。
 */
export const allowBake = (
  g: BakeGovernor, full: boolean, now: number, intervalMs = BAKE_SATURATED_INTERVAL_MS,
  gate?: BakeFrameGate, frame?: number,
): boolean => {
  if (!full) return true;
  if (gate && frame !== undefined && gate.frame === frame) return false;
  if (now - g.lastAt < intervalMs) return false;
  g.lastAt = now;
  if (gate && frame !== undefined) gate.frame = frame;
  return true;
};

/**
 * 焼き置きを「直近に使った」として退避から守るか(2026-11-28・社長実機 v0.25.5893 ステージ4「fps2 bk8」→回復で「fps22 bk0」)。
 * 守りの窓を**時計(ms)だけ**で測ると、フレームが重い時に窓が縮む: シミュは1フレーム最大50msしか進まないので、
 * fps2 では2秒の窓=4フレーム=ゲーム内0.2秒。歩きのコマの1周より短く、見えていないコマが全部捨てられて
 * 次に回ってきた時に焼き直す=重いほど焼き直しが増え、さらに重くなる(天井に張り付いたまま抜けない)。
 * ⇒ **時計の窓か、フレーム数の窓の、どちらかに入っていれば守る**。60fps では2つの窓は同じ長さ(2秒≒120フレーム)=従来どおり。
 */
export const BAKE_KEEP_FRAMES = 120;
export const isRecentBake = (
  usedAt: number | undefined, usedFrame: number | undefined, now: number, frame: number,
  keepMs: number, keepFrames = BAKE_KEEP_FRAMES,
): boolean =>
  (usedAt !== undefined && now - usedAt < keepMs) || (usedFrame !== undefined && frame - usedFrame < keepFrames);

/**
 * 1フレームに焼く数の上限(影・縁・白の合計・2026-11-28・社長実機 v0.25.5893 ステージ4「fps2 bk8」)。
 * 天井に張り付く前(敵が入れ替わって新しいコマ・光の向き・倍率が一度に来た時)は上限が無く、
 * ヘッドレス(1フレーム400msの重さを模した計測)で**1フレームに最大37回**焼いていた。重い端末ほど1フレームに来る数が増える。
 * 上限を越えた物は今回は焼かない(縁は出さない・白は光らせない・影は直前のコマの影/接地の影=天井の時と同じ逃げ道)。
 * 60fps では 3×60=180回/秒まで焼ける=出撃直後の焼き込みが数フレーム遅れるだけ。`?bakeops=` で変えられる。
 */
export const BAKE_OPS_PER_FRAME = 3;
/** フレームが重い(1フレームが `BAKE_SLOW_FRAME_MS` を超えた)時は1フレームに1つだけ焼く。重い時ほど焼きを足さない(悪循環を切る)。 */
export const BAKE_SLOW_FRAME_MS = 50;
export const bakeOpsBudget = (lastFrameMs: number, max = BAKE_OPS_PER_FRAME): number =>
  (lastFrameMs > BAKE_SLOW_FRAME_MS ? 1 : Math.max(1, max));

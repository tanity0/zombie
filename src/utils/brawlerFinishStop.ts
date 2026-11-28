// ★格闘の決め技は止めを長く(research/HITSTOP.md §7・社長指示2026-11-27「格闘のヒットストップは、技によって長めに置いてもいいと思う。KOFを参考に」)。
// 決め技だけ、今の止め(自分と相手の止め=store の brawlerStopPlan)と相手の震え(brawlerShakeUntil の長さ・幅)に係数を掛ける。
// 軽い段・つなぎの技(通常1〜4段・飛び蹴り1/2発目・蹴り上げ・気功・構え)はこの表に載せない=今のまま。
// 止めが伸びた分、その後の取り消しの受付・後隙は止めが明けてから数える(行動の時計 brawlerElapsed が止めを引く=今の作りのまま)。
// PixiJS に依存しない(store と pixi の両方が読む)。
import type { BrawlerState } from './brawlerTypes';

/** 係数を掛ける決め技。 */
export type BrawlerFinishMove =
  | 'secretLand' // 秘奥義の最後の当たり(締めの地面叩き)
  | 'gouge' //      抉り打ち
  | 'stomp' //      地割り(土竜を含む)
  | 'heel' //       踵落とし
  | 'kick3' //      蹴り飛ばし(飛び蹴り3発目)
  | 'palm' //       通常5段目(掌底の突進)
  | 'airThrow' //   空中投げ(投げた相手がぶつかった当たり=爆撃)
  | 'suplex'; //    スープレックス(密着・空中投げの続きの叩きつけ)

/**
 * 係数の表(叩き台・§7)。stop=今の止めに掛ける / shakeLen=今の相手の震えの長さに掛ける / shakeAmp=震えの幅に掛ける。
 * 今の震えの長さ=今の止めの長さなので、震えの長さは「今の止め × shakeLen」(止めより短い技は、止めの後半は震えずに止まる)。
 * 抉り打ちは「長めに大きめに揺らす」=長さは止めと同じだけ伸ばし、幅を ×1.6。
 */
export const BRAWLER_FINISH_STOP: Readonly<Record<BrawlerFinishMove, { stop: number; shakeLen: number; shakeAmp: number }>> = {
  secretLand: { stop: 2.0, shakeLen: 1.5, shakeAmp: 1 },
  gouge: { stop: 1.8, shakeLen: 1.8, shakeAmp: 1.6 },
  stomp: { stop: 1.5, shakeLen: 1.2, shakeAmp: 1 },
  heel: { stop: 1.5, shakeLen: 1.2, shakeAmp: 1 },
  kick3: { stop: 1.6, shakeLen: 1.3, shakeAmp: 1 },
  palm: { stop: 1.6, shakeLen: 1.3, shakeAmp: 1 },
  airThrow: { stop: 1.6, shakeLen: 1.3, shakeAmp: 1 },
  suplex: { stop: 1.6, shakeLen: 1.3, shakeAmp: 1 },
};

/** 止めの長さ(ms・整数)。move 無し=今のまま。0 以下は 0。 */
export const brawlerFinishStopMs = (ms: number, move?: BrawlerFinishMove | null): number => {
  if (!(ms > 0)) return 0;
  return move ? Math.round(ms * BRAWLER_FINISH_STOP[move].stop) : ms;
};

/**
 * 相手の震えの長さ(ms・整数)。stoppedMs=相手に書く止め(既に brawlerFinishStopMs を掛けた長さ)。
 * 震え=今の止め × shakeLen なので、止めに掛けた分(stop)を戻してから shakeLen を掛ける。move 無し=止めと同じ長さ(今のまま)。
 */
export const brawlerFinishShakeMs = (stoppedMs: number, move?: BrawlerFinishMove | null): number => {
  if (!(stoppedMs > 0)) return 0;
  if (!move) return stoppedMs;
  const k = BRAWLER_FINISH_STOP[move];
  return Math.round((stoppedMs / k.stop) * k.shakeLen);
};

/** 震えの幅の倍率(move 無し=1)。 */
export const brawlerFinishShakeAmp = (move?: BrawlerFinishMove | null): number => (move ? BRAWLER_FINISH_STOP[move].shakeAmp : 1);

/** 通常の段の決め技(5段目=掌底の突進だけ)。1〜4段目は null。 */
export const brawlerStageFinishMove = (stage: number): BrawlerFinishMove | null => (stage === 5 ? 'palm' : null);

/**
 * 飛び蹴りの決め技。3発目のうち、踵落とし=heel・蹴り上げでない蹴り飛ばし=kick3。1・2発目・蹴り上げ(掴む蹴り上げを含む)は null。
 * (蹴り上げが掴んだ時の止めは掴みの止めで、決め技は掴んだ後の空中投げ・スープレックスの当たりの方。)
 */
export const brawlerKickFinishMove = (big: boolean, heel: boolean, up: boolean): BrawlerFinishMove | null =>
  !big ? null : heel ? 'heel' : up ? null : 'kick3';

/** 震えの幅の印(store が brawlerShakeUntil と一緒に書く)。brawlerShakeAmpUntil が brawlerShakeUntil と同じ値の時だけ幅の倍率を使う(後から別の震えが書かれたら1に戻る)。 */
export interface BrawlerShakeAmpFields {
  brawlerShakeUntil?: number;
  brawlerShakeAmp?: number;
  brawlerShakeAmpUntil?: number;
}

/** 格闘の震えの幅の倍率(描画が読む)。印が今の震えと揃っていなければ 1。 */
export const brawlerShakeAmpMul = (f: BrawlerShakeAmpFields): number =>
  f.brawlerShakeAmp !== undefined && f.brawlerShakeAmpUntil !== undefined && f.brawlerShakeAmpUntil === f.brawlerShakeUntil
    ? Math.max(0, f.brawlerShakeAmp) : 1;

// ---- 延長の分を受付と相手の固まりの時計から外す(案C・2026-11-27) ----
// 決め技の止めの延長(=伸ばした分)は、自分と相手の絵と動きを止めるだけで、入力の受付・秘奥義の間隔・相手の固まりのつながりには数えない。
// 入力: 延長の最中と、延長で遅れて始まった次の行動の最中に来た入力のうち、今の状態では出ない(捨てられる)物・覚えている入力を上書きする物は、
//   遅れた分だけ後ろへ送って入れ直す(=延長が無かった時と同じ状態で入力を判断する)。それ以外の入力は今どおり(遅らせない)。
// 相手: 固まりの式の止めは延長の分をフレームの幅に切り上げて足す(止めの明けの最初のフレームまで確実に固まる)。浮きの時計も延長の分だけ後ろへずらす。

type DebtFields = Pick<BrawlerState, 'phase' | 'startAt' | 'stopUntil' | 'stopExt' | 'extDebt' | 'techBufferAt'>;

const stopExtOf = (s: DebtFields): number => (s.stopExt && s.stopExt.until === s.stopUntil && s.stopExt.ms > 0 ? s.stopExt.ms : 0);
const extDebtOf = (s: DebtFields): number => (s.extDebt && s.extDebt.startAt === s.startAt && s.extDebt.ms > 0 ? s.extDebt.ms : 0);

/**
 * いま来た入力を何 ms 後ろへ送るか(0=送らない)。延長の最中(止めの明け−延長 ≦ t < 止めの明け)=延長の長さ+この行動の遅れ /
 * 延長で遅れて始まった行動の最中=その遅れ。待機は 0。
 */
export const brawlerInputDebtMs = (s: DebtFields, t: number): number => {
  if (s.phase === 'idle') return 0;
  const ext = stopExtOf(s);
  const tail = ext > 0 && t < s.stopUntil && t >= s.stopUntil - ext ? ext : 0;
  return tail + extDebtOf(s);
};

/**
 * 覚えた技が t に出る時、延長が無ければ何 ms 早く出ていたか(=次の行動の遅れ)。prev=覚えていた側の行動。
 * 延長の明けより前に覚えていた技は、延長の分(と前の行動の遅れ)だけ遅れて出る。延長の最中に覚えた技は、覚えた時刻から先の分だけ。
 */
export const brawlerFireDebtMs = (prev: DebtFields, t: number): number => {
  const ext = stopExtOf(prev);
  const baseEnd = prev.stopUntil - ext;
  const fromExt = ext > 0 && t >= baseEnd ? Math.min(ext, t - baseEnd) : 0;
  const total = fromExt + extDebtOf(prev);
  if (!(total > 0)) return 0;
  const origFire = t - total;
  const at = prev.techBufferAt ?? -Infinity;
  return Math.max(0, Math.min(total, t - Math.max(origFire, at)));
};

/** 固まりの式の止めに足す延長の分(フレームの幅に切り上げ=止めの明けの最初のフレームまで届く)。frameMs<=0 はそのまま。 */
export const brawlerFinishLockExtMs = (extMs: number, frameMs: number): number =>
  !(extMs > 0) ? 0 : frameMs > 0 ? Math.ceil(extMs / frameMs) * frameMs : extMs;

/**
 * 押しの距離の上限(px・案C)。決め技の止めの延長の後に始まる、止めの補正の無い押し(地割りの強制の押し等=残り÷押しの長さで減る押し)は、
 * 延長が無い時(止め=baseStopMs)に同じフレームの幅で動いた距離を超えないよう切る(延長で止めの明けがフレームの境目からずれて、端数の分だけ遠くへ飛ぶのを防ぐ)。
 * speedPxPerS=押しの最初の速さ・durMs=押しの長さ。frameMs<=0(幅が分からない)は上限なし。
 */
export const brawlerFinishKbCapPx = (speedPxPerS: number, baseStopMs: number, frameMs: number, durMs: number): number => {
  if (!(frameMs > 0) || !(durMs > 0) || !(speedPxPerS > 0)) return Infinity;
  const lag = Math.ceil(Math.max(0, baseStopMs) / frameMs - 1e-9) * frameMs - Math.max(0, baseStopMs); // 止めの明けから最初のフレームまで
  let sum = 0;
  for (let r = durMs - lag; r > 1e-9; r -= frameMs) sum += speedPxPerS * (r / durMs) * (frameMs / 1000);
  return sum;
};

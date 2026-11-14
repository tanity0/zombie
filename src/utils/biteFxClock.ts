// ★噛みつき台本(§12/§16)の上に乗る「別スプライトの攻撃の絵」(コウモリのランタン+炸裂・スケルトンの爪)の時計。
//
// ★なぜ要るか(社長報告2026-11-12「技が中断されてるはずなのに、アニメーションだけ続いてる時がある。たとえばバットの叩いてくる攻撃」):
// 描画は判定が噛みを終えた瞬間(`biteAt: 0`)の後も振り抜きの余韻を出すため、技の始まりの時刻を**焼いて**持っていた。
// ところが焼いた時刻から先は判定を見ずに進めていたので、
//   ①**中断**(気絶・拘束・持ち上げ・技への切り替え・死亡=`biteAt` が当たる前に消える)でも振り下ろしと炸裂を最後まで再生し、
//   ②**固まり**(格闘の固まり・硬直=判定の側は `biteAt` を毎フレーム据え置いて溜めを止めている)の間も絵だけ進んでいた。
// ⇒ 技が生きている間は**毎フレーム判定の `biteAt` から**経過を出し(固まれば絵も止まる)、
//   消えた最初のフレームで「当たる時刻を過ぎていたか」を1度だけ見て、過ぎていれば余韻・前なら中断(巻き戻して消す)にする。
// 規則は攻撃シートの余韻(`enemyAttackSheet.attackTailFrame`=当たる前に消えたら余韻は出さない)と同じ。
// **描画専用**——判定・座標・尺には触れない(時計は gameTime=`biteAt` と同じ)。
import { counterRewindElapsed, COUNTER_REWIND_MS } from './counterRewind';

export interface BiteFxClock {
  /** 技が始まった時刻(`Enemy.biteAt`・固まりの据え置きを毎フレーム写す)。 */
  at: number;
  /** 生きていた最後のフレームでの経過(中断の巻き戻しの起点)。 */
  lastSince: number;
  /** 生きていた間の尺(中断で `chaffMove` が消えると台本が変わるので、後から引き直さない)。 */
  windupMs: number;
  biteMs: number;
  /** 判定の噛みが生きているか(前フレーム)。 */
  live: boolean;
  /** 中断と分かった時刻(gameTime)。立っていれば巻き戻し中。 */
  cutAt?: number;
}

export interface BiteFxStep {
  /** 次のフレームへ持ち越す記憶(undefined=捨てる)。 */
  clock: BiteFxClock | undefined;
  /** 絵の経過ms(溜めの頭=0)。null=攻撃の絵を出さない。 */
  since: number | null;
  /** 中断の巻き戻し中か(武器だけを戻して出す。炸裂などの当たりの絵は出さない)。 */
  cut: boolean;
  windupMs: number;
  biteMs: number;
}

/**
 * 1フレームぶん進める。
 * @param biteAt 判定の `Enemy.biteAt`(0/undefined=噛んでいない)。
 * @param windupMs/biteMs **いまの**台本の尺(生きている間だけ使い、記憶に写す)。
 * @param tailMs 当たった後に絵を出し切る長さ(余韻+炸裂の散り)。
 */
export const stepBiteFxClock = (
  clock: BiteFxClock | undefined, biteAt: number | undefined, gameTime: number,
  windupMs: number, biteMs: number, tailMs: number, rewindMs: number = COUNTER_REWIND_MS,
): BiteFxStep => {
  if (biteAt !== undefined && biteAt > 0) {
    const since = gameTime - biteAt;
    return { clock: { at: biteAt, lastSince: since, windupMs, biteMs, live: true }, since, cut: false, windupMs, biteMs };
  }
  const none: BiteFxStep = { clock: undefined, since: null, cut: false, windupMs, biteMs };
  if (!clock) return none;
  let c = clock;
  if (c.live) {
    // 判定が噛みを消した最初のフレーム。噛みの解決は「当たる時刻を過ぎた最初のフレーム」なので、
    // 過ぎていれば当たった(余韻へ)・前なら中断。
    const hit = c.windupMs + c.biteMs;
    c = gameTime - c.at >= hit ? { ...c, live: false } : { ...c, live: false, cutAt: gameTime };
  }
  if (c.cutAt !== undefined) {
    // 中断: 止まった所から慣性つきで戻して消す(カウンターの巻き戻しと同じ時計・同じイージング)。
    const r = counterRewindElapsed(c.lastSince, gameTime - c.cutAt, rewindMs);
    return r === null ? { ...none, windupMs: c.windupMs, biteMs: c.biteMs }
      : { clock: c, since: r, cut: true, windupMs: c.windupMs, biteMs: c.biteMs };
  }
  const since = gameTime - c.at;
  if (since > c.windupMs + c.biteMs + tailMs) return { ...none, windupMs: c.windupMs, biteMs: c.biteMs };
  return { clock: c, since, cut: false, windupMs: c.windupMs, biteMs: c.biteMs };
};

/**
 * ★ゾンビの牙の輪(予告の線から時刻を写すラッチ)の中断判定。線が消えたのに**当たる時刻の前**で、
 * しかも判定の側に技がもう残っていない(`biteAt` も2連の `chaffMove` も消えた)なら中断=絵を捨てる。
 * 技が残っている(2連の相の切り替わりで線が1フレーム途切れた等)なら捨てない。
 */
export const zombieBiteFxInterrupted = (
  lineActive: boolean, gameTime: number, hitAt: number,
  e: { biteAt?: number; chaffMove?: string },
): boolean =>
  !lineActive && hitAt > 0 && gameTime < hitAt
  && !(e.biteAt !== undefined && e.biteAt > 0) && e.chaffMove === undefined;

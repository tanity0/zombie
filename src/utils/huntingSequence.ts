// ★ハンティングの溜まりを「一連の動き」の間ずっと使う(社長裁定2026-11-22「全ての武器で一連の動き中は伸ばす」)。
// 溜まった状態で始めた一連の動きの間は届く距離が伸びたまま。一連の動きが終わった時に使い切る。
//  - 格闘: 連撃の間(既存の brawler.huntingCombo・research/BRAWLER.md §16。ここは通らない)。
//  - 鞭: 1撃目 → 引き寄せ → 叩きつけ(追加攻撃の受付・止めが続いている間)。
//  - 刀: オート斬撃 → 一閃 → 燕返し(一閃の走り・着地の硬直・燕返しの受付が続いている間)。
//        一閃をしなかった時は、次のオート斬撃の時刻(オート斬撃の間隔の終わり)で終わる。
//  - ナイフ: 一連のつながりの仕組みが無いので、今までどおり振るたびに使い切る(ここは通らない)。

export type HuntingSequenceKind = 'whip' | 'katana';

export interface HuntingSequenceView {
  /** gameTime(刀のオート斬撃だけで始まった一連の締め切りの時計)。 */
  gameTime: number;
  /** Date.now(一閃・燕返し・鞭の追加攻撃の時計)。 */
  now: number;
  /** 刀: オート斬撃で始めた一連の締め切り(gameTime)。この時刻までに一閃が出なければ終わる。 */
  seqUntil?: number;
  /** 刀: 一閃(燕返しを含む)の走り〜着地の硬直の終わり(Date.now)。 */
  katanaRecoveryUntil: number;
  /** 刀: 燕返しの受付が開いているか。 */
  tsubameOpen: boolean;
  /** 鞭: 追加攻撃の受付(早すぎの間も含む)が開いているか、または止めの最中か。 */
  whipFollowupActive: boolean;
}

/** 一連の動きがまだ続いているか。false になったら溜まりを使い切る。 */
export const huntingSequenceAlive = (kind: HuntingSequenceKind, v: HuntingSequenceView): boolean => {
  if (kind === 'whip') return v.whipFollowupActive;
  return v.gameTime < (v.seqUntil ?? 0) || v.now < v.katanaRecoveryUntil || v.tsubameOpen;
};

// ★宙の敵で「N HIT」が切れる穴を塞ぐ(社長指示2026-11-27「空中にいる間はコンボカウントが切れない様にして」
//   「コンボの考え方って敵が動ける様になったかどうかでしょ？てことは空中は切れないよね」・research/BRAWLER.md §23)。
// 近接枠の左の「N HIT」は、敵ごとの数(brComboHits)のうち、いま動けない敵のいちばん多い数(brawlerCombo の brawlerLinkMax)。
// 浮いている間は動けない(brawlerLinkFree が brawlerAirborne を見る)ので、**数を持っている**敵が宙にいる限り切れない。
// 穴は「格闘の当たりで浮かせたのに、その敵へ数を書かない経路」だった(実測: スープレックスの叩きつけ・その小爆発・空中投げの爆撃)。
// ここは、そういう当たりで書く数(普通の格闘の当たりと同じ見方=当たる直前に動けなければ続き、動けたら 1)と、
// 「宙なのに数を持っていない敵」(検査用)を出す。判定・固まり・ダメージには使わない(表示だけ)。
import { brawlerAirborne, brawlerLinkOnHit, type BrawlerLinkFields } from './brawlerCombo';

/** 格闘の当たり(浮かせる・浮かせないに関わらず)でその敵に書く数の欄。e=当たる直前の敵。 */
export const brawlerLinkHitPatch = (e: BrawlerLinkFields, gameTime: number, nowMs: number): { brComboHits: number } =>
  ({ brComboHits: brawlerLinkOnHit(e, gameTime, nowMs) });

/**
 * 待ち行列で後から掛かる浮き(爆発の浮き)の時に、当たった時に書いた数を戻す欄。
 * 当たってから浮きが掛かるまでの間に、敵の更新が「動ける」と見て数を消すことがある(浮きは次のフレームで掛かる)=その数を戻す。
 * 浮かなかった(patch が宙にしない)なら何もしない。数は多い方を残す(間に別の当たりで伸びていたらそちら)。
 */
export const brawlerLinkRestoreOnLift = (
  e: { brComboHits?: number }, liftPatch: { brLiftUntil?: number } | null | undefined, noted: number | undefined, nowMs: number,
): { brComboHits: number } | null => {
  if (noted === undefined || !(noted > 0) || !liftPatch || !brawlerAirborne(liftPatch, nowMs)) return null;
  const n = Math.max(noted, e.brComboHits ?? 0);
  return n === e.brComboHits ? null : { brComboHits: n };
};

/** 検査用: 生きていて宙にいるのに、数を持っていない敵の id(格闘の当たりで浮かせた敵なら、ここは空のはず)。 */
export const brawlerAirborneWithoutLink = (
  enemies: readonly ({ id: string; health: number; corpseUntil?: number; brComboHits?: number; brLiftUntil?: number })[], nowMs: number,
): string[] => enemies.filter(e => e.health > 0 && e.corpseUntil === undefined && brawlerAirborne(e, nowMs) && e.brComboHits === undefined).map(e => e.id);

// ★格闘の「当たる高さ」(research/BRAWLER.md §40-4 ①②・社長指示2026-11-27「当たり判定の高さを調整すれば良いのでは?」→「今の定石が全部つながる値に調整」)。
// プレイヤーの格闘だけが読む(幻影・孫悟空・拳鬼は読まない)。描画も store も import しない純関数。
//  - 判定用の敵の高さ r = 格闘の浮きの高さ ÷ 敵の体の高さ(浮きの倍率 brawlerJuggleHeightRel × BRAWLER_LIFT_VIS_BODY_K)。
//    画面・ズームの上限(brawlerLiftVisBasePx の viewH)を使わない=体の大小・端末(スマホ/PC)で変わらない。プレイヤーの高さとは比べない。
//  - 格闘の浮きだけ(鞭で浮いた敵・締めの跳ねは 0=格闘の判定に関わらない)。終端の死神・浮かない敵は 0。
//  - 時計は浮きの欄と同じ壁時計(Date.now)。止めの間は浮きの欄のずらし(airShotStop)に乗る。
//  - research/HITSTOP.md §6 の「空中」(震えの向き用・描画で持ち上げている高さの合計>2px=utils/hitShake)とは別の関数(見た目の判定と当たりの判定)。
import { brawlerJuggleHeightRel } from './brawlerCombo';
import type { BrawlerJuggleFields } from './brawlerJuggleTypes';
import { BRAWLER_LIFT_VIS_BODY_K } from './brawler';
import type { BrawlerRouteNode } from './brawlerTypes';

/** 判定用の敵の高さ(体の高さに対する割合)。 */
export const brawlerEnemyHitRel = (e: BrawlerJuggleFields, now: number): number =>
  e.brLiftShape === 'whip' ? 0 : Math.max(0, brawlerJuggleHeightRel(e, now)) * BRAWLER_LIFT_VIS_BODY_K;

/**
 * 当たる高さの帯(§40-4 ①の表)。
 *  - ground=地上で出した技(通常1〜5段・抉り打ち・地割り/土竜の着地・4段目): r ≤ BRAWLER_HIT_REL_GROUND_MAX
 *  - kick1=飛び蹴り(1発目): r ≤ BRAWLER_HIT_REL_KICK1_MAX(落ちてくる敵を拾う)
 *  - any=空中で出した技(空中蹴り・蹴り上げ・蹴り飛ばし・踵落とし・空中で出した通常1・2段)・気功・空中投げ・スープレックス・秘奥義: 高さで分けない
 */
export type BrawlerHitBand = 'ground' | 'kick1' | 'any';
/**
 * ★地上の技が届く高さの上限(社長「今の定石が全部つながる値に調整」)。叩き台 0.50(§40-4 ①)では雑魚の「4段目→地割り」「3段目→飛び蹴り→地割り」の
 * 地割りが届かなかった(当たる瞬間の雑魚の高さの実測 0.53)ので 0.58 に広げた。蹴り上げの打ち上げ(約0.67)には届かない。
 * store/brawlerTrack.store.test.ts が雑魚・強個体・ボス級の定石で確かめる。
 */
export const BRAWLER_HIT_REL_GROUND_MAX = 0.58;
/**
 * 飛び蹴り(1発目)が届く高さの上限(落ちてくる敵を拾う)。叩き台 0.35(§40-4 ①)では雑魚の「3段目→飛び蹴り」が届かなかった
 * (3段目で打ち上げた雑魚の当たる瞬間の高さの実測 0.39・頂点 0.45)ので 0.45 に広げた。地上の技(0.58)より低い。
 */
export const BRAWLER_HIT_REL_KICK1_MAX = 0.45;

/** 技の節(と、その技を空中で出したか)→ 当たる高さの帯。 */
export const brawlerHitBandOf = (node: BrawlerRouteNode, selfAir: boolean): BrawlerHitBand => {
  switch (node) {
    case 's1': case 's2': return selfAir ? 'any' : 'ground';
    case 's3': case 's4': case 's5': case 'gouge': case 'stomp': case 'mogura': return 'ground';
    case 'kick1': return 'kick1';
    default: return 'any'; // kick2・kick3・heel・kickup・kiko・guard(掴み)・idle
  }
};
export const brawlerHitBandMax = (band: BrawlerHitBand): number =>
  band === 'ground' ? BRAWLER_HIT_REL_GROUND_MAX : band === 'kick1' ? BRAWLER_HIT_REL_KICK1_MAX : Infinity;
/** この敵は、いまこの帯の技に当たる高さにいるか。 */
export const brawlerInHitBand = (e: BrawlerJuggleFields, now: number, band: BrawlerHitBand): boolean =>
  band === 'any' || brawlerEnemyHitRel(e, now) <= brawlerHitBandMax(band) + 1e-9;

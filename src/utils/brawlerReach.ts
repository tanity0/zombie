// ★格闘の基本技の「つながる距離」(research/BRAWLER.md §31-2・社長裁定2026-11-12「敵のノックバックとプレイヤーの技が進む距離は
// コンボがしっかりやれば繋がる距離に調整」)。道の表(brawlerRouteAllows)で許される続き A→B について、A を相手の手前(BRAWLER_STANDOFF_PX)で
// 当て、相手が A の押しで下がった所から B を出した時に、B の踏み込み+届く範囲で当たるかを返す純関数。
// 押しの距離は雑魚(一番よく下がる区分)の実測(store/brawlerReach.store.test.ts が実際の押しと突き合わせる)。描画・store は読まない。
import {
  BRAWLER_LUNGE_PX, BRAWLER_STANDOFF_PX, BRAWLER_KICK_RANGE, BRAWLER_LANDING_RADIUS, BRAWLER_PALM_PASS_PX, BRAWLER_STOMP_RADIUS, BRAWLER_KIKO_RANGE,
} from './brawler';
import type { BrawlerRouteNode } from './brawlerTypes';

/** つながりに要る余裕(px・§31-2)。 */
export const BRAWLER_CHAIN_MARGIN_PX = 8;

/**
 * 雑魚に当てた時の押しで下がる距離(px・実測を切り上げた値)。続きを持つ技(道の表の from)だけ。
 * 弱=小さい押し(BRAWLER_SMALL_KB_MULT)・強/飛び蹴り1発目=普通の押し・4段目と飛び蹴り2発目=浮いた相手への小さい押し・踵落とし=押さない・大踏み潰し=吹き飛ばし(強制)。
 * 飛び蹴り2発目は小さい押し+少し打ち上げ(社長指示2026-11-12「飛び蹴り二段目は相手をあまり飛ばさず少し打ち上げて、じゃないと踵落としが届かない」・実測 約9.2px)。
 */
export const BRAWLER_PUSH_ZOMBIE_PX: Readonly<Partial<Record<BrawlerRouteNode, number>>> = {
  s1: 5, s2: 5, s3: 38, s4: 10, kick1: 38, kick2: 10, heel: 0, stomp: 64,
};

/** 続きの技 B の届き方。lungePx=体が進む最大(相手の手前で止まる)・targetPx=狙える距離(この外なら進まない)・hitPx=当たる距離。どれも相手の帯の縁までの距離。 */
export interface BrawlerReachSpec { lungePx: number; targetPx: number; hitPx: number }

const isStageNode = (n: BrawlerRouteNode): boolean => n === 's1' || n === 's2' || n === 's3' || n === 's4' || n === 's5';

/**
 * B の届き方(meleeRadius=近接の届く範囲 huntingMeleeRadius・既定の MELEE_RADIUS=74)。
 * 1〜3段目=狙いと当たりが届く範囲 / 4段目=着地の円(足元から・中心から測るより短めに見積もる) / 5段目=突き抜けの帯 /
 * 飛び蹴り=狙いと飛ぶ距離は BRAWLER_KICK_RANGE・当たりは届く範囲 / 大踏み潰し=円 / 気功=届く距離。
 */
export const brawlerReachOf = (b: BrawlerRouteNode, meleeRadius: number): BrawlerReachSpec => {
  switch (b) {
    case 's1': case 's2': case 's3': return { lungePx: BRAWLER_LUNGE_PX[b], targetPx: meleeRadius, hitPx: meleeRadius };
    case 's4': return { lungePx: BRAWLER_LUNGE_PX.s4, targetPx: meleeRadius, hitPx: BRAWLER_LANDING_RADIUS };
    case 's5': return { lungePx: 0, targetPx: Infinity, hitPx: BRAWLER_PALM_PASS_PX };
    case 'kick1': case 'kick2': case 'kick3': case 'heel': return { lungePx: BRAWLER_KICK_RANGE, targetPx: BRAWLER_KICK_RANGE, hitPx: meleeRadius };
    case 'stomp': return { lungePx: 0, targetPx: Infinity, hitPx: BRAWLER_STOMP_RADIUS };
    case 'kiko': return { lungePx: 0, targetPx: BRAWLER_KIKO_RANGE, hitPx: BRAWLER_KIKO_RANGE };
    default: return { lungePx: 0, targetPx: 0, hitPx: 0 };
  }
};

/** 縁までの距離 d の相手へ、出した瞬間に進む距離(相手の手前で止まる・狙えなければ進まない)。 */
const goAt = (d: number, r: BrawlerReachSpec): number => (d <= r.targetPx ? Math.min(r.lungePx, Math.max(0, d - BRAWLER_STANDOFF_PX)) : 0);

/**
 * A→B が雑魚に届くか。A は相手の手前で当たる(fromPx で変えられる)。B を出す時刻の両端を見る:
 *  - 押しが下がり切ってから出す(後隙の終わりに出す段・受付の終わり際の技): 下がり切った所で狙って進む。
 *  - 技を一番早く出す(当たりの止めの間に覚えて、受付が開いた瞬間に出る): 押しが始まる前の位置で進む先が決まり、押しはその後に全部下がる(控えめな見積もり)。
 *    段は前の後隙が終わってから出る(その時には押しは下がり切っている)ので、こちらは見ない。
 * marginPx=当たる距離 − 当たる時の距離(両端の悪い方)。ok=余裕が BRAWLER_CHAIN_MARGIN_PX 以上。hitAtPx=下がり切ってから出した時に当たる距離。
 */
export const brawlerChainReaches = (
  a: BrawlerRouteNode, b: BrawlerRouteNode, o: { meleeRadius: number; fromPx?: number },
): { ok: boolean; marginPx: number; hitAtPx: number } => {
  const d0 = o.fromPx ?? BRAWLER_STANDOFF_PX;
  const push = BRAWLER_PUSH_ZOMBIE_PX[a] ?? 0;
  const r = brawlerReachOf(b, o.meleeRadius);
  const settled = d0 + push;
  const hitSettled = settled - goAt(settled, r);
  const hitEarly = isStageNode(b) ? hitSettled : d0 - goAt(d0, r) + push;
  const worst = Math.max(hitSettled, hitEarly);
  const marginPx = r.hitPx - worst;
  return { ok: marginPx >= BRAWLER_CHAIN_MARGIN_PX, marginPx, hitAtPx: hitSettled };
};

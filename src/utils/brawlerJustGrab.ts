// ★ジャスト投げ(社長指示2026-11-28「格闘で、ジャストタイミングで上おしたとき、スープレックスになりつつジャストカウンターにも して。」)。純関数だけ。
//  - 構え(↑)のジャストで近接の攻撃を受けた(=ジャストカウンター): ジャストの効果(JUST・+5・気絶2倍・成立の演出)はそのまま出し、
//    続けてその攻撃してきた相手を掴んで投げる。投げ方は密着の構えと同じ区分の決まり(雑魚=スープレックス/強個体・ボス級=サマーソルト)。
//    離れていれば投げられる距離まで吸い付いてから掴む(近接の届く距離の相手だけ)。
//  - 密着の構えで、密着した相手が攻撃中だった時は、ジャストの窓の間だけ構えで待つ(受ければジャスト投げ・受けなければ窓の終わりに今までどおり掴む)。
//  - 弾の受けはジャストでも投げない(撃ち主は遠い・構えは続く=社長指示2026-11-13 のまま)。
//  - ★「ジャストカウンターしたとき、弾を弾き返してない」(同日): 弱い構え(払えずに出た構え)でもジャストの窓の内に当たった弾は打ち返す。
// 区分・密着・届く距離の物差しは呼び手(store)が既存の関数で測って渡す(ここで作り直さない)。
import type { BrawlerState } from './brawlerTypes';

/** 吸い付く長さ(ms・壁時計・叩き台)。加速して相手へ寄る(踏み込みの器の 'accel')。 */
export const BRAWLER_JUST_GRAB_DASH_MS = 110;
/** 吸い付いた後に残す、体の縁と相手の縁の隙間(px)。密着(BRAWLER_CONTACT_PX=24)の内に収める。 */
export const BRAWLER_JUST_GRAB_GAP_PX = 8;

export type BrawlerGrabMode = 'suplex' | 'flipkick';

/**
 * ★掴み・投げの区分(社長指示2026-11-28「スープレックスも雑魚と同じにして」・前提「プレイヤーも幻影も格闘には雑魚と同じ扱い」)。
 * 幻影(guardian-phantom=汎用の幻影・孫悟空)は雑魚として掴む=密着の構え・ジャスト投げ・空中投げで雑魚と同じ条件で投げられる
 * (サマーソルト・蹴り上げへ置き換えない)。それ以外は渡された区分(brawlerEnemyClass)のまま。押し・浮きの区分はここでは決めない。
 */
export const brawlerGrabClass = (e: { type: string }, cls: 'mob' | 'strong' | 'boss'): 'mob' | 'strong' | 'boss' =>
  e.type === 'guardian-phantom' ? 'mob' : cls;

/**
 * ジャストで受けた近接の攻撃を、投げに化けさせるか(化けるならその投げ方)。
 *  just=ジャストの受け / counter=払った構え(弱い構え・構えの掴みの最中は投げない=掴みは値段3が必須の決まり §34-10)/
 *  projectile・beam・dot・throttled=弾・光線・持続ダメージ・間引かれた受け(投げない)/ cls=相手の区分(null=投げられない区分)/
 *  airborne=相手が空中(空中投げの領分)/ targetable=格闘の相手にできる / inReach=近接の届く距離(受けで気絶させる距離と同じ)。
 */
export const brawlerJustGrabMode = (o: {
  just: boolean; counter: boolean; grabbing: boolean;
  projectile?: boolean; beam?: boolean; dot?: boolean; throttled: boolean;
  cls: 'mob' | 'strong' | 'boss' | null | undefined; airborne: boolean; targetable: boolean; inReach: boolean;
}): BrawlerGrabMode | null => {
  if (!o.just || !o.counter || o.grabbing || o.throttled) return null;
  if (o.projectile === true || o.beam === true || o.dot === true) return null;
  if (o.cls === null || o.cls === undefined || o.airborne || !o.targetable || !o.inReach) return null;
  return o.cls === 'mob' ? 'suplex' : 'flipkick';
};

/** 吸い付く距離(px)。gapPx=体の縁から相手の縁までの隙間。密着の内(contactPx 以下)なら 0=その場で掴む。 */
export const brawlerJustGrabDashPx = (gapPx: number, contactPx: number): number =>
  gapPx <= contactPx ? 0 : Math.max(0, gapPx - BRAWLER_JUST_GRAB_GAP_PX);

/** 密着の構えで、すぐ掴まずにジャストの窓の間だけ待つか(密着した相手が攻撃中=ジャストで受ける余地がある時だけ)。 */
export const brawlerContactShouldWait = (attacking: boolean): boolean => attacking;

/**
 * 待ち・吸い付きの次の一手。grab=いま掴む / keep=まだ待つ / drop=待ちを捨てる(構えでなくなった)。
 * lungeEndMs=吸い付きの器の今の期限(Date.now・スローで後ろへ延びる。器が無ければ 0)。吸い付きは at と器の期限の遅い方で掴む。
 */
export type BrawlerPendingGrabStep = { kind: 'grab'; enemyId: string } | { kind: 'keep' } | { kind: 'drop' };
export const brawlerPendingGrabStep = (
  s: Pick<BrawlerState, 'phase' | 'tech' | 'justGrab' | 'contactWait'>, guarding: boolean, nowMs: number, gameTime: number, lungeEndMs = 0,
): BrawlerPendingGrabStep => {
  if (!s.justGrab && !s.contactWait) return { kind: 'keep' };
  if (!guarding || s.phase !== 'tech' || s.tech !== 'guard') return { kind: 'drop' };
  if (s.justGrab) return nowMs >= Math.max(s.justGrab.at, lungeEndMs) ? { kind: 'grab', enemyId: s.justGrab.enemyId } : { kind: 'keep' };
  const w = s.contactWait!;
  return gameTime >= w.at ? { kind: 'grab', enemyId: w.enemyId } : { kind: 'keep' };
};

/**
 * 当たった弾を打ち返すか(格闘の構え)。払った構え=今どおり全部打ち返す / 弱い構え=ジャストの窓の内だけ打ち返す
 * (ジャストカウンターで弾を弾き返す・社長指示2026-11-28)。構えでなければ false(通常のカウンターの窓は呼び手が別に見る)。
 */
export const brawlerGuardReflectsProjectile = (o: { guarding: boolean; weak: boolean; just: boolean }): boolean =>
  o.guarding && (!o.weak || o.just);

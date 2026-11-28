// ★密着のスープレックスのジャスト・ジャストカウンターの弾の打ち返し・掴みの区分(社長指示2026-11-28)。純関数だけ。
//  - 「ジャストタイミングで上おしたとき、スープレックスになりつつジャストカウンターにも」「スープレックスのカウンターに、ジャストの概念が入ってなかった」:
//    密着の構え(↑)で、密着した相手が攻撃中だった時は、構えのジャストの窓の間だけ構えで待つ。窓の内にその相手の攻撃が当たれば
//    構えのジャストの受け(store の brawlerGuardReceive のまま)が出て、続けて今までどおりの密着の掴み(スープレックス/サマーソルト)。
//    当たらなければ窓の終わりに今までどおり掴む。ただの構え(密着でない)の受けは今までどおり(地割り・反撃の気功・土竜・気功二連)。
//  - 「ジャストカウンターしたとき、弾を弾き返してない」: 弱い構えでもジャストの窓の内の弾は打ち返す。ジャストで受けて出た地割りの間も弾は打ち返す。
// 区分・密着・窓の物差しは呼び手(store)が既存の関数で測って渡す(ここで作り直さない)。
import type { BrawlerState } from './brawlerTypes';

/**
 * ★掴み・投げの区分(社長指示2026-11-28「スープレックスも雑魚と同じにして」・前提「プレイヤーも幻影も格闘には雑魚と同じ扱い」)。
 * 幻影(guardian-phantom=汎用の幻影・孫悟空)は雑魚として掴む=密着の構え・空中投げで雑魚と同じ条件で投げられる
 * (サマーソルト・蹴り上げへ置き換えない)。それ以外は渡された区分(brawlerEnemyClass)のまま。押し・浮きの区分はここでは決めない。
 */
export const brawlerGrabClass = (e: { type: string }, cls: 'mob' | 'strong' | 'boss'): 'mob' | 'strong' | 'boss' =>
  e.type === 'guardian-phantom' ? 'mob' : cls;

/** 密着の構えで、すぐ掴まずにジャストの窓の間だけ待つか(密着した相手が攻撃中=ジャストで受ける余地がある時だけ)。 */
export const brawlerContactShouldWait = (attacking: boolean): boolean => attacking;

/** 密着の構えの待ちの次の一手。grab=窓が終わった(今までどおり掴む)/ keep=まだ待つ / drop=待ちを捨てる(構えでなくなった)。 */
export type BrawlerContactWaitStep = { kind: 'grab'; enemyId: string } | { kind: 'keep' } | { kind: 'drop' };
export const brawlerContactWaitStep = (
  s: Pick<BrawlerState, 'phase' | 'tech' | 'contactWait'>, guarding: boolean, gameTime: number,
): BrawlerContactWaitStep => {
  if (!s.contactWait) return { kind: 'keep' };
  if (!guarding || s.phase !== 'tech' || s.tech !== 'guard') return { kind: 'drop' };
  return gameTime >= s.contactWait.at ? { kind: 'grab', enemyId: s.contactWait.enemyId } : { kind: 'keep' };
};

/**
 * 当たった弾を打ち返すか(格闘の構え)。払った構え=今どおり全部打ち返す / 弱い構え=ジャストの窓の内だけ打ち返す
 * (ジャストカウンターで弾を弾き返す・社長指示2026-11-28)。構えでなければ false(通常のカウンターの窓は呼び手が別に見る)。
 */
export const brawlerGuardReflectsProjectile = (o: { guarding: boolean; weak: boolean; just: boolean }): boolean =>
  o.guarding && (!o.weak || o.just);

/** ジャストで受けて出た代金なしの地割りの最中か(構えは閉じているが、この間も弾は打ち返す・社長指示2026-11-28)。 */
export const brawlerJustStompReflects = (s: Pick<BrawlerState, 'phase' | 'tech' | 'justStomp'> | undefined): boolean =>
  !!s && s.justStomp === true && s.phase === 'tech' && s.tech === 'stomp';

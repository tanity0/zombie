// 汎用の幻影と孫悟空(拳鬼=guardian-phantom / phantomUnique 'brawler')は同時に場に出さない(社長指示2026-11-28
// 「孫悟空は幻影枠なので、お互いが出る事が無いようにして」)。判定だけの純関数(store/PixiJS 非依存)。
// 出す側(useGameLoop)は、相手が場に居る間は出すのを待つ(取り消さない)。相手が居なくなってから、条件がまだ満たされていれば出す。
import type { Enemy } from '../types/game';
import { PHANTOM_BRAWLER_KIND } from './phantomBrawlerSpawn';

/** どちらの幻影か。'generic'=汎用の幻影(phantomUnique 無し)/'brawler'=孫悟空。 */
export type PhantomSlotKind = 'generic' | 'brawler';

type PhantomLike = Pick<Enemy, 'type' | 'health' | 'corpseUntil' | 'phantomUnique' | 'kenkiLeaveAt'>;

/**
 * その種類の幻影が「場に居る」か。HP>0 かつ死体でないもの。
 * 跳び去り中(kenkiLeaveAt あり)の孫悟空も居る扱い(消え切るまで約1.1秒待つ。居ない扱いにすると、汎用の幻影を出す時の一掃で跳ぶ途中の孫悟空が一瞬で消える)。
 */
export const phantomOnField = (enemies: readonly PhantomLike[], kind: PhantomSlotKind): boolean =>
  enemies.some(e => {
    if (e.type !== 'guardian-phantom' || !(e.health > 0) || e.corpseUntil !== undefined) return false;
    if (kind === 'generic') return e.phantomUnique === undefined;
    return e.phantomUnique === PHANTOM_BRAWLER_KIND;
  });

/** その種類の幻影を今出してよいか(相手の種類が場に居なければ真)。同じ種類どうしの入れ替えは出す側の既存の作法に任せる。 */
export const phantomSlotFree = (enemies: readonly PhantomLike[], kind: PhantomSlotKind): boolean =>
  !phantomOnField(enemies, kind === 'generic' ? 'brawler' : 'generic');

// BOT_AND_GHOST.md §2.18(コマンド方式・社長裁定2026-07-31「よし、ではそれで行こう。サイコロも提案の案で」)
// バッチGHOST-CMD-1: 技への反応の「境界ガード付き袋式」サイコロ(§2.18-7)。
//
// 毎回の確率抽選(旧rollGhostMoveReaction)を「記録の結果をそのまま袋に入れて引き切る」方式へ置換する:
//   - 袋の中身は既存記録 MoveReaction {n, counterRate, hitRate} から**枚数を導出**(スキーマ変更なし):
//     counter = round(n×counterRate) / tank = min(round(n×hitRate), n−counter) / dodge = 残り
//     (clamp≥0・この順で決める=決定的)。
//   - 引き=残枚数から一様に1枚(シャッフル済みデッキのpopと等価)。空になったら詰め直し。
//   - **毎引きガード**(§2.18-7の境界ガード。詰め直し境界に限定せず毎引きに適用=実装が単純で、
//     [食食食避]のような偏袋の袋内3連も抑えられる): moveKeyごとの連続tank引きが
//     GHOST_BAG_MAX_HIT_STREAK 以上かつ袋に非tank札が残っていれば、その引きは非tank札から一様に引く。
//     **並べ替えであって中身の変更ではない**=引き切れば割合は記録どおり(§2.18の思想と矛盾しない)。
//   - **tank専用袋(全部「食」)はガード不発**(非tank札が無い)=「苦手技は食らい続ける」個性を壊さない(仕様)。
//   - **袋の寿命=ラン単位**(ラン内は交戦を跨いでも保持・ラン間はリセット=1ラン=記録の1回の再演)。
//     resetGhostCommandBags() を gameStore.resetGame から呼ぶ(duoRecords.resetDuoRunRecordsと同じ前例)。
//
// 純関数(deriveBagCounts)+モジュールシングルトン(袋の残枚数+連続tank回数)。store/React/PixiJS非依存。
// 乱数は**注入**(decideGhostのrandをそのまま渡す)。Math.random直呼び禁止。
// 消費するrandは**1引きにつき常に1回**(ガード発動時も1回)=decideGhost側の乱数消費順を汚さない。
import type { MoveReactionStat } from './moveReaction';

/** 袋の札=技への反応3分類(GhostMoveDecisionから'fallback'を除いたもの)。 */
export type CommandBagCard = 'counter' | 'dodge' | 'tank';

/** 連続tank引きの上限(§2.18-7の境界ガード・叩き台=2)。これ以上は非tank札が残る限り引かない。 */
export const GHOST_BAG_MAX_HIT_STREAK = 2;

export interface CommandBagCounts { counter: number; dodge: number; tank: number }

const clamp01 = (x: number): number => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);

/**
 * 袋の枚数導出(純関数・決定的)。既存記録 {n, counterRate, hitRate} から
 * counter → tank → dodge の順で確定する(§2.18発注仕様の丸め規則そのまま):
 *   counter = round(n×counterRate)
 *   tank    = min(round(n×hitRate), n−counter)
 *   dodge   = n−counter−tank(clamp≥0)
 * 合計は常にn(rateはclamp01済みなのでcounter≤n・tank≤n−counter・dodge≥0が構造的に成立)。
 */
export const deriveBagCounts = (stat: MoveReactionStat): CommandBagCounts => {
  const n = Math.max(0, Math.floor(Number.isFinite(stat.n) ? stat.n : 0));
  const counter = Math.round(n * clamp01(stat.counterRate));
  const tank = Math.min(Math.round(n * clamp01(stat.hitRate)), n - counter);
  const dodge = Math.max(0, n - counter - tank);
  return { counter, dodge, tank };
};

// ---- ラン単位の袋の状態(モジュールシングルトン・duoRecordsのengagementと同じ前例) ----------------
interface BagState {
  counts: CommandBagCounts; // 袋に残っている札
  tankStreak: number;       // このmoveKeyで連続して'tank'を引いた回数(非tankを引いたら0へ)
}

let bags = new Map<string, BagState>();

const remainingOf = (c: CommandBagCounts): number => c.counter + c.dodge + c.tank;

/**
 * 袋から1枚引く(消費側の唯一の入口。ghostDriver.rollGhostMoveReactionから呼ばれる)。
 * 呼び出し側が n ≥ GHOST_MOVE_ROLL_MIN_N をゲート済み=袋は必ず1枚以上で始まる前提
 * (万一n=0の記録が来ても'dodge'既定へは落とさずtank以外の安全側='dodge'を返す)。
 * randは毎引きちょうど1回消費する(ガード発動時も1回)。
 */
export const drawFromCommandBag = (
  moveKey: string,
  stat: MoveReactionStat,
  rand: () => number,
): CommandBagCard => {
  let bag = bags.get(moveKey);
  if (!bag) {
    bag = { counts: deriveBagCounts(stat), tankStreak: 0 };
    bags.set(moveKey, bag);
  }
  // 空(引き切った)なら詰め直し(§2.18-7)。連続tank回数は袋を跨いで持ち越す=詰め直し直後の3連も抑える。
  if (remainingOf(bag.counts) <= 0) bag.counts = deriveBagCounts(stat);
  const r = rand(); // 毎引き1回(分岐に依らず先に消費=乱数消費数を一定に保つ)
  if (remainingOf(bag.counts) <= 0) return 'dodge'; // n=0の防御(呼び出し側ゲートで通常到達しない)
  // 毎引きガード: 連続tankが上限に達していて、袋に非tank札が残っていれば非tank札から一様に引く。
  // tank専用袋(非tank札ゼロ)はガード不発=「苦手技は食らい続ける」(仕様)。
  const nonTank = bag.counts.counter + bag.counts.dodge;
  const guarded = bag.tankStreak >= GHOST_BAG_MAX_HIT_STREAK && nonTank > 0;
  let card: CommandBagCard;
  if (guarded) {
    card = r * nonTank < bag.counts.counter ? 'counter' : 'dodge';
  } else {
    const total = remainingOf(bag.counts);
    const v = r * total;
    card = v < bag.counts.counter ? 'counter'
      : v < bag.counts.counter + bag.counts.dodge ? 'dodge'
        : 'tank';
  }
  bag.counts[card] -= 1;
  bag.tankStreak = card === 'tank' ? bag.tankStreak + 1 : 0;
  return card;
};

/**
 * ラン境界(gameStore.resetGame)で呼ぶ。前ランの袋(引きかけの残枚数+連続tank回数)を持ち越さない
 * (§2.18-7「袋の寿命=ラン単位」。テストのbeforeEachリセットにも使う)。
 */
export const resetGhostCommandBags = (): void => {
  bags = new Map();
};

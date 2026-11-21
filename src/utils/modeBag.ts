// BOT_AND_GHOST.md §2.18「追補: 抜けカードの裁定」(社長2026-07-31)。
// バッチGHOST-CMD-2A: **汎用2モード袋**(器)。隙コマンド(詰めて叩く/撃つ)が第1の利用者だが、
// **Phase 2 のサブモード%へそのまま流用する前提**のAPIにしてある(punish専用の形にはしない)。
//
// commandBag.ts(技への反応=3種札+境界ガード)との違い:
//   - 札は**2種**({n, rate} から枚数を導出。primary = round(n×rate) / other = n − primary)。
//   - **境界ガードは無し**(§2.18-7のガードは「被弾の連続」を抑えるためのもので、モード選択
//     (詰めるか撃つか)には被弾の意味が無い=発注仕様§3のとおり不要)。
//   - 引き=残枚数から一様に1枚。引き切ったら詰め直し(記録の割合をラン全体で再演する)。
//   - **袋の寿命=ラン単位**(ラン内は交戦を跨いで保持・ラン間はリセット=1ラン=記録の1回の再演)。
//     resetModeBags() を gameStore.resetGame から呼ぶ(commandBag.resetGhostCommandBagsと同じ前例)。
//
// 純関数(deriveModeCounts)+キー単位のモジュールシングルトン(残枚数)。store/React/PixiJS非依存。
// 乱数は**注入**(decideGhostのrandをそのまま渡す)。Math.random直呼び禁止。

/** 2モード袋の元になる記録。rate = primary側(呼び出し側が意味を決める)の割合。 */
export interface ModeStat { n: number; rate: number }

/** 袋の中身(残枚数)。primary = rate側の札 / other = 残り。 */
export interface ModeBagCounts { primary: number; other: number }

const clamp01 = (x: number): number => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);

/**
 * 枚数導出(純関数・決定的)。commandBag.deriveBagCountsと同じ丸め流儀:
 *   primary = round(n × rate) / other = n − primary(clamp≥0)
 * 合計は常にn(rateはclamp01済みなのでprimary≤nが構造的に成立)。
 */
export const deriveModeCounts = (stat: ModeStat): ModeBagCounts => {
  const n = Math.max(0, Math.floor(Number.isFinite(stat.n) ? stat.n : 0));
  const primary = Math.round(n * clamp01(stat.rate));
  return { primary, other: Math.max(0, n - primary) };
};

// ---- ラン単位の袋の状態(キー単位のモジュールシングルトン) ---------------------------------------
let bags = new Map<string, ModeBagCounts>();

const remainingOf = (c: ModeBagCounts): number => c.primary + c.other;

/**
 * 袋から1枚引く。戻り値 true = primary側(rate側)の札 / false = 残り側。
 *
 * - `stat` が未定義、または **n=0(記録なし)** の時は `fallbackPrimary` をそのまま返し、
 *   **randは1回も消費しない**(引く札が存在しないので抽選自体が発生しない)。
 * - 記録がある時は**1引きにつきrandをちょうど1回**消費する(呼び出し側の乱数消費順を汚さない)。
 * - 空(引き切った)なら記録から詰め直してから引く。
 */
export const drawFromModeBag = (
  key: string,
  stat: ModeStat | undefined,
  rand: () => number,
  fallbackPrimary: boolean,
): boolean => {
  if (!stat) return fallbackPrimary;
  const fresh = deriveModeCounts(stat);
  if (remainingOf(fresh) <= 0) return fallbackPrimary; // n=0=記録なし(デフォルトへ・rand不消費)
  let bag = bags.get(key);
  if (!bag || remainingOf(bag) <= 0) {
    bag = fresh;
    bags.set(key, bag);
  }
  const total = remainingOf(bag);
  const primary = rand() * total < bag.primary;
  if (primary) bag.primary -= 1;
  else bag.other -= 1;
  return primary;
};

/** テスト/デバッグ用: いま袋に残っている枚数(未生成のキーはnull)。 */
export const peekModeBag = (key: string): ModeBagCounts | null => {
  const bag = bags.get(key);
  return bag ? { ...bag } : null;
};

/**
 * ラン境界(gameStore.resetGame)で呼ぶ。前ランの袋(引きかけの残枚数)を持ち越さない
 * (§2.18-7「袋の寿命=ラン単位」。テストのbeforeEachリセットにも使う)。
 */
export const resetModeBags = (): void => {
  bags = new Map();
};

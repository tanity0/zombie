// UNIQUE_WEAPONS.md §16-2(バッチC-2「誘導散弾ショットガン」shotgun-t3-homing)。
// 「各ペレットが近くの敵へ誘導。敵が複数なら分散・1体なら全弾集中」の対象割り振りだけを担う
// 純関数(旋回そのものはgameStore.tsのhoming-missileと同じ式を再利用=homingPelletフラグで開く。
// UNIQUE_WEAPONS.md §16-2「旋回そのものはホーミング弾に在るが分岐に閉じているので開く必要」)。
//
// 割り振りは「1トリガー(9ペレット)」単位——射程内の敵をround-robinで順番に割り当てる。
// targets.length===1なら i%1は常に0=**全弾が同じ1体に集中**する。targets.length>=2なら
// 均等に分散する(近い敵から先に1発ずつ配る=偏りが出ない)。

/** round-robin用に「id」だけ読む最小形。実際はEnemyを渡す(呼び出し側でフィルタ/ソート済み)。 */
export interface HomingShotgunTarget { id: string }

/**
 * count発ぶんの対象敵idを返す(target無しの位置はundefined=直進する。gameStore.ts側は
 * targetEnemyIdがundefinedのペレットを「対象なし」として素通しする=homing-missileと同じ規則)。
 * targetsは呼び出し側が既に「射程内」等でフィルタ済みの生存敵(順序が割り振りの優先順=
 * 近い順に渡すことを推奨。空配列なら全ペレットundefined)。
 */
export const assignHomingShotgunTargets = (
  targets: readonly HomingShotgunTarget[],
  count: number,
): (string | undefined)[] => {
  if (targets.length === 0) return new Array(count).fill(undefined);
  return Array.from({ length: count }, (_, i) => targets[i % targets.length].id);
};

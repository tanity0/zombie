// §6.38 v2 F項(実効難易度倍率の唯一の出どころ・B4クリーンアップ): HP(bountyTick.bountyMaxHealth)と
// 金箱の価値(gameStore.rollBountyChestReward)のどちらも「基準値×この倍率」で計算する。
//
// 経緯(消さない): B3では「gameStore→bountyTick→gameStore」の循環import(v0.25.3390型の起動全損)を
// 避けるため、同じ式を gameStore.ts(bountyChestValueMult)と bountyTick.ts(bountyEffectiveValueMult)
// に複製し、ドリフト検知テストで一致を監視していた。B4でここへ一本化し、両モジュールがここから
// 直接importする形にする(複製→本物のimportへ)。
//
// 依存はenemyUtils.ts + timeDifficulty.tsのみ。どちらもgameStore.ts/bountyTick.tsをimportしない
// (=circular importにならない)。bountyDims.tsのような「完全ゼロimport」までは要らない
// ——TDZ事故の原因は「bountyTick.ts起動時にgameStoreの未初期化constを読む」経路だったので、
// gameStore/bountyTickへ戻らない依存だけを持つ限り安全(madge --circularで確認)。
import { AREA_BASE_DIFFICULTY } from './enemyUtils';
import { effectiveDifficultyArea, lerpAreaTable } from './timeDifficulty';

export const bountyEffectiveValueMult = (area: number, gameTimeMs: number): number =>
  lerpAreaTable(AREA_BASE_DIFFICULTY, effectiveDifficultyArea(area, gameTimeMs));

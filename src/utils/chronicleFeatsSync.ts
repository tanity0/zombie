// 年表の実績行(data/chronicleFeats.ts)を**いまの進行データから判定して書く**(社長指示2026-10-14)。
// 呼び出し点: 勝利の瞬間(App)・拠点メニューの画面が変わるたび(MissionSelect=購入・強化の直後を拾う)。
// 書くのは初回だけ(recordChronicleGlobalFirst の kind+detail ガード)。毎フレームではない。
import { useGameStore } from '../store/gameStore';
import { loadStoryArchive } from '../data/storyArchive';
import { loadPlayerProfile } from './playerTraits';
import { getClearedStages, getStoryFlags, getWeaponUnlocks, isKogarasuUnlocked, recordChronicleGlobalFirst } from '../data/progress';
import { achievedFeats, loadNoUpgradeLedger, FEAT_LABELS, FEAT_STAGE_ID, type FeatKey, type FeatSnapshot } from '../data/chronicleFeats';

export const buildFeatSnapshot = (): FeatSnapshot => {
  const st = useGameStore.getState();
  return {
    unlockedArchiveIds: loadStoryArchive().unlockedRecordIds,
    soloBossSlotKeys: Object.keys(loadPlayerProfile()?.bossStyles ?? {}),
    noUpgrade: loadNoUpgradeLedger(),
    upgrades: st.playerUpgrades,
    ownedSkills: st.ownedSkills,
    unlockedWeaponKeys: [...getWeaponUnlocks()],
    kogarasuUnlocked: isKogarasuUnlocked(),
    purchasedSubLevels: st.purchasedSubLevels,
    clearedStageIds: [...getClearedStages()],
    endingSeen: getStoryFlags().endingSeen,
  };
};

/** 達成している実績を年表へ(初回だけ)。新しく載った行のキーを返す。 */
export const syncFeatChronicle = (): FeatKey[] => {
  const added: FeatKey[] = [];
  for (const key of achievedFeats(buildFeatSnapshot())) {
    if (recordChronicleGlobalFirst(FEAT_STAGE_ID, 'feat', key, FEAT_LABELS[key], true)) added.push(key);
  }
  return added;
};

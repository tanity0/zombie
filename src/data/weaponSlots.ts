// ユニーク武器システム: カテゴリ×Tierの「スロット」候補キー(UNIQUE_WEAPONS.md §3-2)。
// 純データのみ(解決ロジックは src/utils/weaponSlot.ts)。各配列の**先頭が既定候補**
// (未設定/未解放時のフォールバック=UNIQUE_WEAPONS.md §3-1「既存キーの意味を変えない」)。
import type { AmmoType } from '../types/game';

// AmmoTypeはphillを含む5種だが、横の対象は4カテゴリ(UNIQUE_WEAPONS.md §1・§3-2の注記)。
export type SlotCategory = Exclude<AmmoType, 'phill'>;
export const SLOT_CATEGORIES: SlotCategory[] = ['handgun', 'shotgun', 'rifle', 'glauncher'];
export type SlotTier = 1 | 2 | 3;
export const SLOT_TIERS: SlotTier[] = [1, 2, 3];

export const SLOT_CANDIDATES: Record<SlotCategory, Record<SlotTier, string[]>> = {
  handgun: {
    1: ['handgun-t1', 'handgun-t1-derringer'],
    2: ['handgun-t2', 'handgun-t2-handcannon'],
    3: ['handgun-t3', 'handgun-t3-piledriver'],
  },
  // 第1弾(UNIQUE_WEAPONS.md §13)の対象はハンドガンのみ。他3カテゴリは既定候補だけの
  // 1挺スロット(=候補配列が長さ1)なので resolveSlotKey は常に恒等を返す(仕組みは共通で通す)。
  shotgun: {
    1: ['shotgun-t1'],
    2: ['shotgun-t2'],
    3: ['shotgun-t3'],
  },
  rifle: {
    1: ['rifle-t1'],
    2: ['rifle-t2'],
    3: ['rifle-t3'],
  },
  glauncher: {
    1: ['glauncher-t1'],
    2: ['glauncher-t2'],
    3: ['glauncher-t3'],
  },
};

// ボス撃破→ユニーク恒久解放(UNIQUE_WEAPONS.md §3-4/§6)。キーは`type@stageId`形式
// (fixedGuardians.tsのgunKey/bossEncounter.tsのslotKeyと同じ識別子=城ボス等の重複typeを区別する)。
// 値は解放される候補キー(SLOT_CANDIDATESのいずれか。既定候補ではない=不変条件4)。
//
// ★未決 #U3「どのボスが何を解放するか」は未裁定(社長裁定待ち)。**この表は空のまま**にする
// (UNIQUE_WEAPONS.md「★未決を片側へ倒さないこと」)。動作確認は `?unlockall=1` のツマミで行う
// (src/utils/weaponSlot.ts)。
export const BOSS_UNLOCK: Record<string, string> = {};

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

// ボス撃破→ユニーク武器の「設計図」入手(UNIQUE_WEAPONS.md §11-6/§11-6-3)。キーは`type@stageId`
// 形式が要るのは**城ボス(giantbat)だけ**(全ステージ同じ型なのでステージで割る必要がある)。
// 天使系(miguel/jibril/rafi/uri)・裏ボス・idol・phillboss・suriel は型が一意なので `type` 単独キー。
// ルックアップは `BOSS_UNLOCK[type@stage] ?? BOSS_UNLOCK[type]`(gameStore.ts)。
// 値は解放される候補キー(SLOT_CANDIDATESのいずれか。既定候補ではない=不変条件4)。
//
// 第1弾3種(社長裁定2026-09-05・§11-6-3): 残り(第2弾以降・§11-7)のボスはまだ CATALOG に
// 対応キーが無いので、ここには書かない(★未決を片側へ倒さない)。
export const BOSS_UNLOCK: Record<string, string> = {
  miguel: 'handgun-t1-derringer',
  jibril: 'handgun-t2-handcannon',
  rafi: 'handgun-t3-piledriver',
};

// 「店売り」の明示リスト(UNIQUE_WEAPONS.md §11-6-2・監査A-2の是正)。**「BOSS_UNLOCKに無い=店売り」
// と実装してはいけない**——現状は第2弾以降の店売り3種(クロスボウ等)がまだ CATALOG に無いため、
// このリストは空のまま(★未決を片側へ倒さない)。
// 不変条件(weaponSlot.test.ts): 全ユニーク候補は BOSS_UNLOCK の値 か STORE_SOLD_KEYS の
// どちらか一方に属する(排反かつ網羅)。入れ忘れた武器は永久に入手不能になる。
export const STORE_SOLD_KEYS: string[] = [];

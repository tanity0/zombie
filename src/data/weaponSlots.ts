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
    1: ['handgun-t1', 'handgun-t1-derringer', 'handgun-t1-crossbow'],
    2: ['handgun-t2', 'handgun-t2-handcannon', 'handgun-t2-dualrange'],
    3: ['handgun-t3', 'handgun-t3-piledriver'],
  },
  // UNIQUE_WEAPONS.md §16(バッチA)/§16-2(バッチB): shotgun T2 / rifle T1 に続き、
  // shotgun T1 / rifle T1(2つめ) / rifle T2 にも横が入った。
  shotgun: {
    1: ['shotgun-t1', 'shotgun-t1-focus', 'shotgun-t1-cycle'],
    2: ['shotgun-t2', 'shotgun-t2-suppress'],
    3: ['shotgun-t3'],
  },
  rifle: {
    1: ['rifle-t1', 'rifle-t1-bolt', 'rifle-t1-deserttech'],
    2: ['rifle-t2', 'rifle-t2-heavysniper'],
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
// 第1弾3種(社長指定2026-09-06の割当表・UNIQUE_WEAPONS.md §18): 残り(第2弾以降・§11-7)のボスは
// まだ CATALOG に対応キーが無いので、ここには書かない(★未決を片側へ倒さない)。
// ★v0.25.4161で解放元を差し替えた(旧: miguel/jibril/rafi=第1弾の仮置き)。社長の割当表では
// ミゲル=レールガンT3・ジブリル=火炎放射器T3・ラフィ=収束型SG T1 なので、仮置きのままだと
// 「本来はT3レールガンを寄越すボスがデリンジャーを寄越す」形で残ってしまう。
export const BOSS_UNLOCK: Record<string, string> = {
  'bounty-balance': 'handgun-t1-derringer',    // 鋏(変異)
  'giantbat@stage-1': 'handgun-t2-handcannon', // 搬送体(変異)= 城ボス stage-1(bossCutin.CASTLE_BOSS_NAME_BY_STAGE)
  'bounty-melee': 'handgun-t3-piledriver',     // 馬乗り(変異)
  // UNIQUE_WEAPONS.md §16(バッチA)。社長の割当表(§18-1)より。
  'giantbat@stage-3': 'shotgun-t2-suppress',   // 樹木管理員(変異)= 城ボス stage-3
  'idol': 'handgun-t2-dualrange',              // 偶像
  // UNIQUE_WEAPONS.md §16-2(バッチB)。社長の割当表(§18-1)より。
  'rafi': 'shotgun-t1-focus',                  // ラフィ
  'bounty-ranged': 'rifle-t2-heavysniper',     // バス停(変異)
  'giantbat@stage-4': 'rifle-t1-deserttech',   // 衛生兵(変異)= 城ボス stage-4
};

// 「店売り」の明示リスト(UNIQUE_WEAPONS.md §11-6-2・監査A-2の是正)。**「BOSS_UNLOCKに無い=店売り」
// と実装してはいけない**——CATALOGに対応キーが無い間は空のまま書かない(★未決を片側へ倒さない)。
// 不変条件(weaponSlot.test.ts): 全ユニーク候補は BOSS_UNLOCK の値 か STORE_SOLD_KEYS の
// どちらか一方に属する(排反かつ網羅)。入れ忘れた武器は永久に入手不能になる。
// UNIQUE_WEAPONS.md §16(バッチA)/§16-2(バッチB)/§18-3: クロスボウ・ボルトアクションは店売り。
// 切替式SGもバッチBで店売りに加わった(BOSS_UNLOCKに割当が無い=社長の割当表§18-1に対応行なし)。
export const STORE_SOLD_KEYS: string[] = ['handgun-t1-crossbow', 'rifle-t1-bolt', 'shotgun-t1-cycle'];

// ユニーク武器システム: カテゴリ×Tierの「スロット」候補キー(UNIQUE_WEAPONS.md §3-2)。
// 純データのみ(解決ロジックは src/utils/weaponSlot.ts)。各配列の**先頭が既定候補**
// (未設定/未解放時のフォールバック=UNIQUE_WEAPONS.md §3-1「既存キーの意味を変えない」)。
import type { AmmoType, EnemyType, SubWeaponKey } from '../types/game';

// AmmoTypeはphillを含む5種だが、横の対象は4カテゴリ(UNIQUE_WEAPONS.md §1・§3-2の注記)。
export type SlotCategory = Exclude<AmmoType, 'phill'>;
export const SLOT_CATEGORIES: SlotCategory[] = ['handgun', 'shotgun', 'rifle', 'glauncher'];
export type SlotTier = 1 | 2 | 3;
export const SLOT_TIERS: SlotTier[] = [1, 2, 3];

export const SLOT_CANDIDATES: Record<SlotCategory, Record<SlotTier, string[]>> = {
  // UNIQUE_WEAPONS.md §16-2(バッチC-2): handgun T3(2つめ)にガンブレードが入った。
  handgun: {
    1: ['handgun-t1', 'handgun-t1-derringer', 'handgun-t1-crossbow'],
    2: ['handgun-t2', 'handgun-t2-handcannon', 'handgun-t2-dualrange'],
    3: ['handgun-t3', 'handgun-t3-piledriver', 'handgun-t3-gunblade'],
  },
  // UNIQUE_WEAPONS.md §16(バッチA)/§16-2(バッチB): shotgun T2 / rifle T1 に続き、
  // shotgun T1 / rifle T1(2つめ) / rifle T2 にも横が入った。
  // UNIQUE_WEAPONS.md §16-2/§19-1(バッチC-1): shotgun T3 / rifle T2(2つめ)・T3 に横が入った。
  // UNIQUE_WEAPONS.md §16-2(バッチC-2): shotgun T2(2つめ)・T3(2つめ)にコイル/誘導散弾が入った。
  shotgun: {
    1: ['shotgun-t1', 'shotgun-t1-focus', 'shotgun-t1-cycle'],
    2: ['shotgun-t2', 'shotgun-t2-suppress', 'shotgun-t2-coil'],
    3: ['shotgun-t3', 'shotgun-t3-flamer', 'shotgun-t3-homing'],
  },
  rifle: {
    1: ['rifle-t1', 'rifle-t1-bolt', 'rifle-t1-deserttech'],
    2: ['rifle-t2', 'rifle-t2-heavysniper', 'rifle-t2-icelance'],
    3: ['rifle-t3', 'rifle-t3-eyelaser'],
  },
  // UNIQUE_WEAPONS.md §16-2/§18-3(バッチD): ランチャー3挺(第2弾は無し=各Tier1挺で確定)。
  glauncher: {
    1: ['glauncher-t1', 'glauncher-t1-rocket'],
    2: ['glauncher-t2', 'glauncher-t2-alchemy'],
    3: ['glauncher-t3', 'glauncher-t3-signal'],
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
  // UNIQUE_WEAPONS.md §16-2/§19-1(バッチC-1)。社長の割当表(§18-1)より。
  'jibril': 'shotgun-t3-flamer',    // ジブリル
  'skadi': 'rifle-t2-icelance',     // スカジ
  'mimir': 'rifle-t3-eyelaser',     // ミーミル
  // UNIQUE_WEAPONS.md §16-2(バッチC-2)。社長の割当表(§18-1)より。
  'uri': 'handgun-t3-gunblade',       // ウリ
  'jormungand': 'shotgun-t2-coil',    // ヨルムンガルド
  'phillboss': 'shotgun-t3-homing',   // フィル(変異体)
  // UNIQUE_WEAPONS.md §16-2/§18-3(バッチD・ランチャー3挺)。社長の割当表(§18-1)より。
  'giantbat@stage-5': 'glauncher-t1-rocket', // 軍隊(変異)= 城ボス stage-5
  'bounty-maiko': 'glauncher-t2-alchemy',    // 舞妓(変異)
  'giantbat@stage-7': 'glauncher-t3-signal', // グレン = 城ボス stage-7
};

// ボス撃破→サブウェポンの「設計図」入手(UNIQUE_WEAPONS.md §19-6・監査A1の是正)。
// ★これは BOSS_UNLOCK(銃スロット専用)とは**別の台帳**——値は SlotCandidates ではなく
// SubWeaponKey なので、絶対に BOSS_UNLOCK へ混ぜない(不変条件4「BOSS_UNLOCKの値はSLOT_CANDIDATES
// のいずれか」が壊れる=weaponSlot.test.tsが落ちる)。ルックアップは BOSS_UNLOCK と同じ形
// (`SUB_BOSS_UNLOCK[type@stage] ?? SUB_BOSS_UNLOCK[type]`)だが、呼び出し側(gameStore.ts)は
// BOSS_UNLOCK の判定と**同じガード・同じ1箇所**で分岐させる(経路を2本にしない・§19-6項目3)。
export const SUB_BOSS_UNLOCK: Partial<Record<EnemyType, SubWeaponKey>> = {
  suriel: 'gold-ring', // スリィエル(ゲート2ボス)撃破→金環の設計図(UNIQUE_WEAPONS.md §19)
};

// 「店売り」の明示リスト(UNIQUE_WEAPONS.md §11-6-2・監査A-2の是正)。**「BOSS_UNLOCKに無い=店売り」
// と実装してはいけない**——CATALOGに対応キーが無い間は空のまま書かない(★未決を片側へ倒さない)。
// 不変条件(weaponSlot.test.ts): 全ユニーク候補は BOSS_UNLOCK の値 か STORE_SOLD_KEYS の
// どちらか一方に属する(排反かつ網羅)。入れ忘れた武器は永久に入手不能になる。
// UNIQUE_WEAPONS.md §16(バッチA)/§16-2(バッチB)/§18-3: クロスボウ・ボルトアクションは店売り。
// 切替式SGもバッチBで店売りに加わった(BOSS_UNLOCKに割当が無い=社長の割当表§18-1に対応行なし)。
export const STORE_SOLD_KEYS: string[] = ['handgun-t1-crossbow', 'rifle-t1-bolt', 'shotgun-t1-cycle'];

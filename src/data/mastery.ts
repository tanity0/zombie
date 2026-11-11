// 熟練度(武器・サブウェポン)の台帳(research/MASTERY.md「v2 発注仕様」+「v2.1 追補」)。
//
// ★このファイルが持つのは**値の定義だけ**(dataの葉=何も import しない。types/game も読まない:
//   types/game が MasteryKey を読むので、型importでも環になる。キーが実在の型と一致することは mastery.test.ts が型で止める)。
//   ・段階/倍率の純関数・保存の読み書き・リザルトでの確定 = src/utils/mastery.ts
//   ・出撃の間の「いまの出どころ」と貯めた分 = src/utils/masteryRun.ts
//   ・出撃時の焼き込み = src/store/gameStore.ts(resetGame)
/** 銃の熟練度のキー(種類ごと・5)。値は AmmoType と同じ文字列。 */
export const MASTERY_GUN_KEYS = ['handgun', 'shotgun', 'rifle', 'glauncher', 'phill'] as const;
export type MasteryGunKey = typeof MASTERY_GUN_KEYS[number];

/** サブウェポンの熟練度のキー(21)。`murasame`(小烏丸)は `katana` を使う。`shield`・`first-aid-kit` は育つ(発注者の指示で v2.1 A-2 を上書き)。 */
export const MASTERY_SUB_KEYS = [
  'heavy-grenade', 'dog', 'katana', 'whip', 'alchemy', 'turret', 'fire-knife', 'drone-boomerang', 'wire-anchor',
  'homing', 'shadow-clone', 'molotov', 'sensor-mine', 'support-sniper', 'junk-weapon', 'gold-ring', 'arrow-rain',
  'brawler', 'decoy', 'shield', 'first-aid-kit',
] as const;
export type MasterySubKey = typeof MASTERY_SUB_KEYS[number];

/** 段階を持つ(=育つ・保存する)キー。銃5+`melee`+サブ21。 */
export const GROWING_MASTERY_KEYS = [...MASTERY_GUN_KEYS, 'melee', ...MASTERY_SUB_KEYS] as const;
export type GrowingMasteryKey = typeof GROWING_MASTERY_KEYS[number];

/**
 * 熟練度のキー。育つ27に、段階を持たない特別な3つを足したもの。
 *  - `loadout` = どの武器にも入らない本人の与ダメ。倍率は出撃開始時に持っている物の平均。貯めない。
 *  - `none`    = 本人ではない与ダメ(守護霊・幻影・護衛・英雄の犬・敵どうし・環境)。倍率1・貯めない。
 *  - `max`     = 「最初から最大」の物の与ダメ。倍率は固定の MASTERY_MAX_MULT・貯めない(無視する出撃では1)。
 */
export type MasteryKey = GrowingMasteryKey | 'loadout' | 'none' | 'max';

const GROWING_SET: ReadonlySet<string> = new Set<string>(GROWING_MASTERY_KEYS);
/** 育つキーか(特別な3つ・未知の文字列は false)。 */
export const isGrowingMasteryKey = (k: unknown): k is GrowingMasteryKey => typeof k === 'string' && GROWING_SET.has(k);

/** 段階の上限。 */
export const MASTERY_MAX_LEVEL = 10;
/** Lv n → n+1 の必要量の伸び(必要量 = base × 1.37^(n−1)・四捨五入)。 */
export const MASTERY_GROWTH = 1.37;
/** 「最初から最大」の倍率(= Lv10 の倍率)。 */
export const MASTERY_MAX_MULT = 1.9;

/**
 * キーごとの基準の必要量(Lv1→2 に要る量)。
 * この発注では全キー仮の 3000(計測の後に設計チャットが数字だけ差し替える)。
 */
export const MASTERY_BASE: Record<GrowingMasteryKey, number> = Object.fromEntries(
  GROWING_MASTERY_KEYS.map(k => [k, 3000]),
) as Record<GrowingMasteryKey, number>;

/**
 * 敵の区分(雑魚/強個体/ボス級)ごとの貯まり方の重み(貯める量 = 割り戻した与ダメ × 重み)。
 * 今は全部1(数字は設計チャットが後で決める=口だけ)。区分の判定は utils/brawlerCombo の brawlerEnemyClass。
 */
export const MASTERY_XP_WEIGHT: Readonly<Record<'mob' | 'strong' | 'boss', number>> = { mob: 1, strong: 1, boss: 1 };

/** サブウェポンのキー → 熟練度のキー(育つ物だけ。`murasame`→`katana`)。 */
export const SUB_TO_MASTERY_KEY: Readonly<Partial<Record<string, GrowingMasteryKey>>> = {
  ...Object.fromEntries(MASTERY_SUB_KEYS.map(k => [k, k])),
  murasame: 'katana',
};

/** 「最初から最大」のサブウェポン(与ダメは `max`)。退役の `shijin` はここに入れない(`none`)。 */
export const MASTERY_MAXED_SUBS: readonly string[] = [
  'marksman-trap', 'striker-quick-mag', 'striker-hunting', 'sage-stone', 'flare-gun',
];

/** 保存のキー(本体の xp)。 */
export const MASTERY_KEY = 'zombie.progress.mastery';
/** 退避のキー(リザルトを通らずに終わった出撃の、まだ本体へ足していない分)。 */
export const MASTERY_PENDING_KEY = 'zombie.progress.masteryPending';

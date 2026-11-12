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
 *  - `none`    = 本人ではない与ダメ(守護霊・幻影・護衛・英雄の犬・敵どうし・環境)。貯めない。倍率はキーからは1
 *                (守護霊の当たりだけは、守護霊の記録の倍率を別に掛ける=弾・置き物の masteryMult / withMastery の mult)。
 *  - `max`     = 「最初から最大」の物の与ダメ。倍率は固定の MASTERY_MAX_MULT・貯めない(無視する出撃では1)。
 *                今は使う与ダメが実物に無い(残った5つのサブは与ダメを出さない)。口だけ残してある。
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

/** 必要量の区分(格闘 / 銃・近接 / サブウェポン)。 */
export type MasteryBaseTier = 'brawler' | 'gunMelee' | 'sub';

/**
 * 区分ごとの基準の必要量(Lv1→2 に要る量。以後は段階ごとに ×MASTERY_GROWTH)。
 * 根拠: 2026-11-12 社長の実機で、格闘がステージ1・10分40秒の1出撃で 97,018 貯まった。
 * 狙い = 主に使う武器が約40出撃で Lv10。後半のステージは敵の体力が多いぶん速く貯まる。
 * 格闘の値はこの実測から。銃・近接・サブウェポンは実測待ちの仮の値。
 * 保存済みの量(zombie.progress.mastery)は量のまま持っているので、必要量を上げれば段階は自動で下がる(移行の処理は無い)。
 */
export const MASTERY_BASE_BY_TIER: Readonly<Record<MasteryBaseTier, number>> = {
  brawler: 120_000,
  gunMelee: 60_000,
  sub: 20_000,
};

/** 育つキー → 区分。キーが足りない/余ると型で落ちる(Record の網羅)。 */
const MASTERY_TIER_OF: Readonly<Record<GrowingMasteryKey, MasteryBaseTier>> = {
  handgun: 'gunMelee', shotgun: 'gunMelee', rifle: 'gunMelee', glauncher: 'gunMelee', phill: 'gunMelee',
  melee: 'gunMelee',
  brawler: 'brawler',
  'heavy-grenade': 'sub', dog: 'sub', katana: 'sub', whip: 'sub', alchemy: 'sub', turret: 'sub', 'fire-knife': 'sub',
  'drone-boomerang': 'sub', 'wire-anchor': 'sub', homing: 'sub', 'shadow-clone': 'sub', molotov: 'sub',
  'sensor-mine': 'sub', 'support-sniper': 'sub', 'junk-weapon': 'sub', 'gold-ring': 'sub', 'arrow-rain': 'sub',
  decoy: 'sub', shield: 'sub', 'first-aid-kit': 'sub',
};

/** 育つキーの区分。 */
export const masteryBaseTierOf = (k: GrowingMasteryKey): MasteryBaseTier => MASTERY_TIER_OF[k];

/** キーごとの基準の必要量(Lv1→2 に要る量)= 区分の値。 */
export const MASTERY_BASE: Record<GrowingMasteryKey, number> = Object.fromEntries(
  GROWING_MASTERY_KEYS.map(k => [k, MASTERY_BASE_BY_TIER[MASTERY_TIER_OF[k]]]),
) as Record<GrowingMasteryKey, number>;

/**
 * 敵の区分(雑魚/強個体/ボス級)ごとの貯まり方の重み(貯める量 = 割り戻した与ダメ × 重み)。
 * 社長裁定2026-11-11『雑魚よりボスの方が熟練度溜まりやすい方がボスに挑む意味が生まれるか?』→『はい』。
 * ボス級=2倍・強個体=1.5倍(叩き台。ボットで測る時に調整する)。区分の判定は utils/brawlerCombo の brawlerEnemyClass。
 */
export const MASTERY_XP_WEIGHT: Readonly<Record<'mob' | 'strong' | 'boss', number>> = { mob: 1, strong: 1.5, boss: 2 };

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

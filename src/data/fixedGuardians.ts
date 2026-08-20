// 社長裁定 v0.25.2818: オンラインプールを埋める弱いボットシードは廃止し、
// 消えない固定データとして持つ「先人守護霊」20体。
// 助っ人系の初期候補を埋め、オンライン実プレイヤーと同じ抽選母集団で使う。
import type { CharacterClass, EquipLoadout, SkillKey, SubWeaponKey } from '../types/game';
import {
  CHARACTER_SUBWEAPON_KEYS, MAX_EQUIPPED_SKILLS, classSubWeaponFor, skillMaxLevel,
} from './campaign';
import { aggregateEquipBonus, equipmentById, equipMaxHealthOf } from './equipment';
import { BULLET_MOVE_KEYS, MOVE_REACTION_KEYS, type MoveReactionTable } from '../utils/moveReaction';
import type { PlayerProfile } from '../utils/playerTraits';

export type FixedGuardianRole = 'counter' | 'evade' | 'wall' | 'sniper' | 'rapid' | 'subweapon' | 'variant';
export type FixedGuardianReaction = 'slash' | 'dance' | 'rock';

export interface FixedGuardianPerformance {
  exposures: 20;
  counters: number;
  hits: number;
  clearSeconds: number;
  /** 60 × (3×counter率 − 2×hit率) − clearSeconds。 */
  score: number;
}

export interface FixedGuardian {
  id: string;
  name: string;
  classId: CharacterClass;
  role: FixedGuardianRole;
  reaction: FixedGuardianReaction;
  performance: FixedGuardianPerformance;
  profile: PlayerProfile;
}

export const FIXED_GUARDIAN_LEADERS_PER_BOSS = 4;

// 守護霊部屋で固定AIをボス別に4人ずつ散らす順序。
// ステージ1〜5は20人を重複なく使い切り、以降は同じ5組を循環する。
// giantbat以外はスロットがステージ非依存なので、ボス型の正本順で後ろへ並べる。
export const FIXED_GUARDIAN_BOSS_SLOT_ORDER: readonly string[] = [
  'giantbat@stage-1', 'giantbat@stage-2', 'giantbat@stage-3', 'giantbat@stage-4', 'giantbat@stage-5',
  // PACING_PUZZLE.md §10-14#10(フィル): 'giantbat@stage-ex1' → 'phillboss@stage-ex1'(順序維持)。
  'giantbat@stage-6', 'giantbat@stage-7', 'phillboss@stage-ex1', 'giantbat@stage-ex2',
  'mimir', 'jormungand', 'skadi', 'thor',
  'miguel', 'jibril', 'rafi', 'uri', 'suriel', 'acrasiel', 'idol',
];

interface GuardianSpec {
  id: string;
  name: string;
  classId: CharacterClass;
  role: FixedGuardianRole;
  reaction: FixedGuardianReaction;
  gunKey: string;
  meleeKey: string;
  /** 職業固定枠とは別に持つ、本人の役割へ合わせた汎用サブ1枠。 */
  selectedSubWeapon: SubWeaponKey;
  clearSeconds: number;
  score: number;
  reactionMs: number;
  counterChance: number;
  preferredDist: number;
  meleeBias: number;
  mobility: number;
  stationaryFrac: number;
  approachPerMin: number;
  subUsesPerMin: number;
  equipment: EquipLoadout;
  skills: readonly { key: SkillKey; level: number }[];
  phillHeadshotRate?: number;
}

const REACTION_COUNTS: Record<FixedGuardianReaction, { counters: number; hits: number }> = {
  slash: { counters: 15, hits: 0 }, // 斬: counter 75% / hit 0%
  dance: { counters: 3, hits: 0 },  // 舞: counter 15% / hit 0%
  rock: { counters: 7, hits: 7 },   // 岩: counter 35% / hit 35%
};

const allMoveKeys = [...MOVE_REACTION_KEYS, ...BULLET_MOVE_KEYS];

const moveReactionsFor = (reaction: FixedGuardianReaction): MoveReactionTable => {
  const { counters, hits } = REACTION_COUNTS[reaction];
  return Object.fromEntries(allMoveKeys.map(key => [key, {
    n: 20,
    counterRate: counters / 20,
    hitRate: hits / 20,
  }])) as MoveReactionTable;
};

// 現行ラン開始値(gameStore.PLAYER_BASE_*)。固定データをstoreへ依存させないため、テストで正本との一致を固定する。
const FIXED_BUILD_BASE_HP = 120;
const FIXED_BUILD_BASE_SPEED = 87;

const gear = (body: string, arms: string, accessory: string): EquipLoadout => ({ body, arms, accessory });
const skillBuild = (
  first: SkillKey,
  second: SkillKey,
  firstLevel = 3,
  secondLevel = 3,
): readonly { key: SkillKey; level: number }[] => [
  { key: first, level: firstLevel },
  { key: second, level: secondLevel },
];

const subLevels = (keys: readonly SubWeaponKey[]): Partial<Record<SubWeaponKey, number>> =>
  Object.fromEntries(keys.map(key => [key, 3])) as Partial<Record<SubWeaponKey, number>>;

const fixedGuardian = (s: GuardianSpec): FixedGuardian => {
  const counts = REACTION_COUNTS[s.reaction];
  const classSubWeapon = classSubWeaponFor(s.classId);
  if (CHARACTER_SUBWEAPON_KEYS.includes(s.selectedSubWeapon)) {
    throw new Error(`${s.name}の選択サブ枠に職業固有サブ ${s.selectedSubWeapon} は装備できません`);
  }
  const subWeapons: SubWeaponKey[] = [classSubWeapon, s.selectedSubWeapon];
  for (const [slot, id] of Object.entries(s.equipment)) {
    const def = equipmentById(id);
    if (!def || def.slot !== slot) throw new Error(`${s.name}の装備 ${id ?? 'なし'} は${slot}枠に装備できません`);
  }
  if (s.skills.length > MAX_EQUIPPED_SKILLS || new Set(s.skills.map(skill => skill.key)).size !== s.skills.length) {
    throw new Error(`${s.name}のスキル構成が最大${MAX_EQUIPPED_SKILLS}枠を超えるか重複しています`);
  }
  for (const skill of s.skills) {
    if (!Number.isInteger(skill.level) || skill.level < 1 || skill.level > skillMaxLevel(skill.key)) {
      throw new Error(`${s.name}の${skill.key} Lv${skill.level}は実現できません`);
    }
  }
  const equipBonus = aggregateEquipBonus(s.equipment);
  const skillLevels = Object.fromEntries(s.skills.map(skill => [skill.key, skill.level]));
  return {
    id: s.id,
    name: s.name,
    classId: s.classId,
    role: s.role,
    reaction: s.reaction,
    performance: {
      exposures: 20,
      counters: counts.counters,
      hits: counts.hits,
      clearSeconds: s.clearSeconds,
      score: s.score,
    },
    profile: {
      v: 1,
      runs: 10,
      reactionMs: s.reactionMs,
      counterChance: s.counterChance,
      preferredDist: s.preferredDist,
      meleeBias: s.meleeBias,
      mobility: s.mobility,
      hitsPerMin: Number((counts.hits / (s.clearSeconds / 60)).toFixed(2)),
      subUsesPerMin: s.subUsesPerMin,
      stationaryFrac: s.stationaryFrac,
      approachPerMin: s.approachPerMin,
      moveReactions: moveReactionsFor(s.reaction),
      subStyles: {
        wire: { n: 0, slamRatio: 0 },
        shield: { n: 0, bashPerPlacement: 0, bashDamageFrac: 0 },
        homing: { n: 0, holdMsAvg: 0 },
      },
      srcClass: s.classId,
      srcName: s.name,
      snapshot: {
        maxHealth: FIXED_BUILD_BASE_HP + equipMaxHealthOf(s.equipment),
        speed: FIXED_BUILD_BASE_SPEED,
        level: 20,
        gunKeys: [s.gunKey],
        activeGunKey: s.gunKey,
        meleeKey: s.meleeKey,
        skills: s.skills.map(skill => skill.key),
        skillLevels,
        equipment: { ...s.equipment },
        equipBonus,
        critChance: 0,
        magBonus: 0,
        reloadMult: 1,
        subWeapons,
        subWeaponLevels: subLevels(subWeapons),
        characterClass: s.classId,
        phillHeadshotRate: s.phillHeadshotRate,
      },
    },
  };
};

/** 固定の先人守護霊20体。配列順は順位ではなく、個性の分類順。 */
export const FIXED_GUARDIANS: readonly FixedGuardian[] = [
  fixedGuardian({
    id: 'kurogane', name: '黒鉄', classId: 'warrior', role: 'counter', reaction: 'slash',
    // 近接偏重のカウンター役。ワイヤーで80pxの得意間合いへ詰める。
    gunKey: 'shotgun-t3', meleeKey: 'anti-mutant-knife-t5', selectedSubWeapon: 'wire-anchor',
    clearSeconds: 72, score: 63, reactionMs: 110, counterChance: 0.85,
    preferredDist: 80, meleeBias: 0.85, mobility: 0.82, stationaryFrac: 0.08,
    approachPerMin: 9, subUsesPerMin: 10,
    equipment: gear('body-protection-5', 'arms-firepower-5', 'accessory-crit-5'),
    skills: skillBuild('counter-master', 'knife-master'),
  }),
  fixedGuardian({
    id: 'shishimaru', name: 'ししまる', classId: 'warrior', role: 'counter', reaction: 'slash',
    gunKey: 'handgun-t2', meleeKey: 'anti-mutant-knife-t5', selectedSubWeapon: 'shield',
    clearSeconds: 82, score: 53, reactionMs: 130, counterChance: 0.8,
    preferredDist: 90, meleeBias: 0.8, mobility: 0.78, stationaryFrac: 0.1,
    approachPerMin: 10, subUsesPerMin: 9,
    equipment: gear('body-protection-5', 'arms-firepower-5', 'accessory-crit-5'),
    skills: skillBuild('knight', 'counter-master'),
  }),
  fixedGuardian({
    id: 'karasu', name: '鴉', classId: 'rogue', role: 'counter', reaction: 'slash',
    gunKey: 'handgun-t3', meleeKey: 'anti-mutant-knife-t5', selectedSubWeapon: 'fire-knife',
    clearSeconds: 58, score: 77, reactionMs: 100, counterChance: 0.82,
    preferredDist: 95, meleeBias: 0.75, mobility: 0.94, stationaryFrac: 0.04,
    approachPerMin: 11, subUsesPerMin: 11,
    equipment: gear('special-body', 'arms-firepower-5', 'accessory-crit-5'),
    skills: skillBuild('bomb-counter', 'slasher'),
  }),
  fixedGuardian({
    id: 'yuki', name: 'ユキ', classId: 'rogue', role: 'evade', reaction: 'dance',
    gunKey: 'handgun-t2', meleeKey: 'machete-t3', selectedSubWeapon: 'decoy',
    clearSeconds: 42, score: -15, reactionMs: 105, counterChance: 0.4,
    preferredDist: 220, meleeBias: 0.2, mobility: 1, stationaryFrac: 0.02,
    approachPerMin: 6, subUsesPerMin: 10,
    equipment: gear('special-body', 'arms-firepower-5', 'accessory-crit-5'),
    skills: skillBuild('time-keeper', 'attack-shooter'),
  }),
  fixedGuardian({
    id: 'mikazuki', name: '三日月', classId: 'mage', role: 'evade', reaction: 'dance',
    gunKey: 'rifle-t3', meleeKey: 'machete-t3', selectedSubWeapon: 'molotov',
    clearSeconds: 38, score: -11, reactionMs: 100, counterChance: 0.45,
    preferredDist: 210, meleeBias: 0.15, mobility: 0.98, stationaryFrac: 0.03,
    approachPerMin: 5, subUsesPerMin: 12,
    equipment: gear('special-body', 'arms-firepower-5', 'accessory-crit-5'),
    skills: skillBuild('fire-shooter', 'exploder'),
  }),
  fixedGuardian({
    id: 'nanashi', name: 'ナナシ', classId: 'rogue', role: 'evade', reaction: 'dance',
    gunKey: 'shotgun-t3', meleeKey: 'tactical-knife-t4', selectedSubWeapon: 'drone-boomerang',
    clearSeconds: 45, score: -18, reactionMs: 120, counterChance: 0.4,
    preferredDist: 150, meleeBias: 0.38, mobility: 0.96, stationaryFrac: 0.04,
    approachPerMin: 7, subUsesPerMin: 11,
    equipment: gear('special-body', 'arms-firepower-5', 'accessory-crit-5'),
    skills: skillBuild('time-keeper', 'exploder'),
  }),
  fixedGuardian({
    id: 'iwamoto', name: '岩本', classId: 'warrior', role: 'wall', reaction: 'rock',
    gunKey: 'shotgun-t3', meleeKey: 'anti-mutant-knife-t5', selectedSubWeapon: 'first-aid-kit',
    clearSeconds: 86, score: -65, reactionMs: 230, counterChance: 0.55,
    preferredDist: 85, meleeBias: 0.82, mobility: 0.55, stationaryFrac: 0.22,
    approachPerMin: 4, subUsesPerMin: 6,
    equipment: gear('body-protection-5', 'arms-firepower-5', 'accessory-crit-5'),
    skills: skillBuild('knight', 'reflex'),
  }),
  fixedGuardian({
    id: 'donko', name: 'どんこ', classId: 'warrior', role: 'wall', reaction: 'rock',
    gunKey: 'rifle-t3', meleeKey: 'tactical-knife-t4', selectedSubWeapon: 'turret',
    clearSeconds: 78, score: -57, reactionMs: 210, counterChance: 0.5,
    preferredDist: 130, meleeBias: 0.6, mobility: 0.62, stationaryFrac: 0.2,
    approachPerMin: 5, subUsesPerMin: 8,
    equipment: gear('body-protection-5', 'arms-firepower-5', 'accessory-crit-5'),
    skills: skillBuild('overclock', 'exploder'),
  }),
  fixedGuardian({
    id: 'chiyo', name: '千代', classId: 'necromancer', role: 'wall', reaction: 'rock',
    // 壁役かつ低機動。センサーマインで周囲を面制圧する。
    gunKey: 'handgun-t3', meleeKey: 'tactical-knife-t4', selectedSubWeapon: 'sensor-mine',
    clearSeconds: 74, score: -53, reactionMs: 220, counterChance: 0.52,
    preferredDist: 140, meleeBias: 0.55, mobility: 0.65, stationaryFrac: 0.18,
    approachPerMin: 5, subUsesPerMin: 8,
    equipment: gear('body-protection-5', 'arms-firepower-5', 'accessory-crit-5'),
    skills: skillBuild('time-keeper', 'overclock'),
  }),
  fixedGuardian({
    id: 'tohmi', name: '遠見', classId: 'mage', role: 'sniper', reaction: 'dance',
    gunKey: 'rifle-t2', meleeKey: 'machete-t3', selectedSubWeapon: 'support-sniper',
    clearSeconds: 34, score: -7, reactionMs: 150, counterChance: 0.35,
    preferredDist: 420, meleeBias: 0.05, mobility: 0.62, stationaryFrac: 0.45,
    approachPerMin: 2, subUsesPerMin: 9,
    equipment: gear('special-body', 'arms-firepower-5', 'accessory-crit-5'),
    skills: skillBuild('sniper', 'attack-shooter'),
  }),
  fixedGuardian({
    id: 'shizu', name: '静', classId: 'mage', role: 'sniper', reaction: 'dance',
    // 停止率40%の狙撃役。タレットと射撃陣地を作る。
    gunKey: 'rifle-t2', meleeKey: 'machete-t3', selectedSubWeapon: 'turret',
    clearSeconds: 32, score: -5, reactionMs: 135, counterChance: 0.38,
    preferredDist: 380, meleeBias: 0.05, mobility: 0.66, stationaryFrac: 0.4,
    approachPerMin: 2, subUsesPerMin: 10,
    equipment: gear('special-body', 'arms-firepower-5', 'accessory-crit-5'),
    skills: skillBuild('sniper', 'crit-up'),
  }),
  fixedGuardian({
    id: 'hatsune', name: 'ハツネ', classId: 'necromancer', role: 'sniper', reaction: 'rock',
    // 340pxを保つ狙撃役。ホーミングで遠距離から複数を追撃する。
    gunKey: 'rifle-t3', meleeKey: 'machete-t3', selectedSubWeapon: 'homing',
    clearSeconds: 48, score: -27, reactionMs: 175, counterChance: 0.48,
    preferredDist: 340, meleeBias: 0.12, mobility: 0.72, stationaryFrac: 0.32,
    approachPerMin: 3, subUsesPerMin: 11,
    equipment: gear('special-body', 'arms-firepower-5', 'accessory-crit-5'),
    skills: skillBuild('bomber', 'exploder', 1, 3),
  }),
  fixedGuardian({
    id: 'hayase', name: '早瀬', classId: 'rogue', role: 'rapid', reaction: 'dance',
    // 機動力最大の速射前衛。分身で接近圧力と手数を伸ばす。
    gunKey: 'handgun-t3', meleeKey: 'tactical-knife-t4', selectedSubWeapon: 'shadow-clone',
    clearSeconds: 30, score: -3, reactionMs: 100, counterChance: 0.45,
    preferredDist: 135, meleeBias: 0.45, mobility: 1, stationaryFrac: 0.02,
    approachPerMin: 10, subUsesPerMin: 12,
    equipment: gear('special-body', 'arms-firepower-5', 'accessory-crit-5'),
    skills: skillBuild('attack-shooter', 'runner', 3, 1), // warm-up退役(v0.25.3248)に伴う死にスロット差し替え(§27-2 A・v0.25.3267)
  }),
  fixedGuardian({
    id: 'bambi', name: 'ばんび', classId: 'rogue', role: 'rapid', reaction: 'rock',
    gunKey: 'shotgun-t3', meleeKey: 'tactical-knife-t4', selectedSubWeapon: 'flare-gun',
    clearSeconds: 41, score: -20, reactionMs: 125, counterChance: 0.5,
    preferredDist: 120, meleeBias: 0.55, mobility: 0.95, stationaryFrac: 0.04,
    approachPerMin: 12, subUsesPerMin: 12,
    equipment: gear('special-body', 'arms-firepower-5', 'accessory-crit-5'),
    skills: skillBuild('last-magazine', 'attack-shooter'),
  }),
  fixedGuardian({
    id: 'chloe', name: 'クロエ', classId: 'mage', role: 'rapid', reaction: 'dance',
    gunKey: 'handgun-t2', meleeKey: 'machete-t3', selectedSubWeapon: 'homing',
    clearSeconds: 33, score: -6, reactionMs: 115, counterChance: 0.42,
    preferredDist: 190, meleeBias: 0.2, mobility: 0.92, stationaryFrac: 0.05,
    approachPerMin: 6, subUsesPerMin: 14,
    equipment: gear('special-body', 'arms-firepower-5', 'accessory-crit-5'),
    skills: skillBuild('crit-up', 'attack-shooter'),
  }),
  fixedGuardian({
    id: 'bansho', name: '番匠', classId: 'warrior', role: 'subweapon', reaction: 'rock',
    // 「番匠」の工作役。従来の3枠からタレットを本人の選択1枠として残す。
    gunKey: 'rifle-t3', meleeKey: 'tactical-knife-t4', selectedSubWeapon: 'turret',
    clearSeconds: 52, score: -31, reactionMs: 180, counterChance: 0.55,
    preferredDist: 145, meleeBias: 0.58, mobility: 0.72, stationaryFrac: 0.16,
    approachPerMin: 6, subUsesPerMin: 16,
    equipment: gear('body-protection-5', 'arms-firepower-5', 'accessory-crit-5'),
    skills: skillBuild('overclock', 'attack-shooter'),
  }),
  fixedGuardian({
    id: 'akane', name: 'あかね', classId: 'necromancer', role: 'subweapon', reaction: 'dance',
    // 高機動ショットガン役。前中衛での被弾を盾で補う。
    gunKey: 'shotgun-t3', meleeKey: 'tactical-knife-t4', selectedSubWeapon: 'shield',
    clearSeconds: 40, score: -13, reactionMs: 120, counterChance: 0.4,
    preferredDist: 165, meleeBias: 0.4, mobility: 0.9, stationaryFrac: 0.07,
    approachPerMin: 7, subUsesPerMin: 14,
    equipment: gear('special-body', 'arms-firepower-5', 'accessory-crit-5'),
    skills: skillBuild('knight', 'attack-shooter'),
  }),
  fixedGuardian({
    id: 'ryoken', name: '猟犬', classId: 'warrior', role: 'subweapon', reaction: 'slash',
    gunKey: 'handgun-t3', meleeKey: 'anti-mutant-knife-t5', selectedSubWeapon: 'junk-weapon',
    clearSeconds: 64, score: 71, reactionMs: 115, counterChance: 0.78,
    preferredDist: 105, meleeBias: 0.78, mobility: 0.84, stationaryFrac: 0.07,
    approachPerMin: 9, subUsesPerMin: 12,
    equipment: gear('body-protection-5', 'arms-firepower-5', 'accessory-crit-5'),
    skills: skillBuild('counter-master', 'exploder'),
  }),
  fixedGuardian({
    id: 'phill', name: 'フィル', classId: 'rogue', role: 'variant', reaction: 'dance',
    gunKey: 'handgun-t3', meleeKey: 'machete-t3', selectedSubWeapon: 'fire-knife',
    clearSeconds: 28, score: -1, reactionMs: 100, counterChance: 0.45,
    preferredDist: 185, meleeBias: 0.25, mobility: 0.96, stationaryFrac: 0.03,
    approachPerMin: 6, subUsesPerMin: 12,
    equipment: gear('special-body', 'arms-firepower-5', 'accessory-crit-5'),
    skills: skillBuild('crit-up', 'fire-shooter'),
  }),
  fixedGuardian({
    id: 'mumei', name: '無銘', classId: 'necromancer', role: 'variant', reaction: 'slash',
    // 最強の刀使い枠。トール討伐後に解禁できる小烏丸を使う。
    gunKey: 'handgun-t2', meleeKey: 'anti-mutant-knife-t5', selectedSubWeapon: 'murasame',
    clearSeconds: 70, score: 65, reactionMs: 105, counterChance: 0.85,
    preferredDist: 75, meleeBias: 0.9, mobility: 0.88, stationaryFrac: 0.05,
    approachPerMin: 10, subUsesPerMin: 10,
    equipment: gear('body-protection-5', 'arms-firepower-5', 'accessory-crit-5'),
    skills: skillBuild('knife-master', 'combo-master'),
  }),
];

/**
 * research/GHOST_BOSS.md(守護霊ボス「幻影」): **台帳の最強データ**。
 *
 * 社長ゴール「ボスモードに守護霊の最強データを一体、ボスとして配線できる?」の「最強」の定義=
 * `performance.score`(60×(3×カウンター率 − 2×被弾率) − クリア秒)の最上位。設計決定は
 * **確定1体を名指し**(抽選ではない)なので、ここは `FIXED_GUARDIAN_STRONGEST_ID` を引くだけにする。
 *
 * ★「名指し」と「score最上位」がズレたら **fixedGuardians.test.ts が落ちる**(機械検証)。
 * 台帳の数値を動かして順位が変わったら、この定数を手で差し替える(黙って抽選に切り替えない=
 * 「今日は誰が出るか分からないボス」にしないため)。
 */
export const FIXED_GUARDIAN_STRONGEST_ID = 'karasu';

export const strongestGuardian = (): FixedGuardian => {
  const g = FIXED_GUARDIANS.find(x => x.id === FIXED_GUARDIAN_STRONGEST_ID);
  // 台帳から消えた=表のズレ。黙って別人へ寄せず、その場で落とす(bossPractice の作法と同じ)。
  if (!g) throw new Error(`fixedGuardians: 最強データ "${FIXED_GUARDIAN_STRONGEST_ID}" が台帳に無い`);
  return g;
};

const stableSlotIndex = (slotKey: string): number => {
  const known = FIXED_GUARDIAN_BOSS_SLOT_ORDER.indexOf(slotKey);
  if (known >= 0) return known;
  // 将来ボスのスロットでも表示を欠かさず、端末や実行ごとに組が変わらない軽量ハッシュ。
  let hash = 0;
  for (let i = 0; i < slotKey.length; i += 1) hash = (hash * 31 + slotKey.charCodeAt(i)) >>> 0;
  return hash;
};

/** ボスごとの固定AI上位4人。5組を順番に循環し、ステージ1〜5では20人が重複しない。 */
export const fixedGuardianLeadersForBoss = (slotKey: string): readonly FixedGuardian[] => {
  const groupCount = Math.ceil(FIXED_GUARDIANS.length / FIXED_GUARDIAN_LEADERS_PER_BOSS);
  const group = stableSlotIndex(slotKey) % groupCount;
  const start = group * FIXED_GUARDIAN_LEADERS_PER_BOSS;
  return FIXED_GUARDIANS
    .slice(start, start + FIXED_GUARDIAN_LEADERS_PER_BOSS)
    .sort((a, b) => b.performance.score - a.performance.score);
};

/**
 * 同じ抽選母集団で固定側が選ばれた時に呼ぶ先人守護霊。
 * 助っ人は20人全体、討伐者はそのボス担当の上位4人からランダムに選ぶ。
 */
export const pickFixedGuardianForGhostMode = (
  slotKey: string,
  mode: 'random' | 'top',
  random: () => number = Math.random,
): FixedGuardian => {
  const pool = mode === 'top' ? fixedGuardianLeadersForBoss(slotKey) : FIXED_GUARDIANS;
  const roll = random();
  const safeRoll = Number.isFinite(roll) ? Math.max(0, Math.min(0.999999999, roll)) : 0;
  return pool[Math.floor(safeRoll * pool.length)];
};

/**
 * 固定候補とオンライン実プレイヤー候補を、候補1人あたり同じ確率で混ぜる。
 * 助っ人は固定20人、討伐者はボス担当4人を実プレイヤー側の抽選対象人数へ足す。
 */
export const shouldPickFixedGuardian = (
  mode: 'random' | 'top',
  remotePoolSize: number,
  random: () => number = Math.random,
): boolean => {
  const fixedPoolSize = mode === 'top' ? FIXED_GUARDIAN_LEADERS_PER_BOSS : FIXED_GUARDIANS.length;
  const remoteSize = Number.isFinite(remotePoolSize) ? Math.max(0, Math.floor(remotePoolSize)) : 0;
  if (remoteSize === 0) return true;
  const roll = random();
  const safeRoll = Number.isFinite(roll) ? Math.max(0, Math.min(0.999999999, roll)) : 0;
  return safeRoll < fixedPoolSize / (fixedPoolSize + remoteSize);
};

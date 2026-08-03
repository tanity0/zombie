// 社長裁定 v0.25.2818: オンラインプールを埋める弱いボットシードは廃止し、
// 消えない固定データとして持つ「先人守護霊」20体。
// 助っ人系の初期候補を埋め、オンライン実プレイヤーと同じ抽選母集団で使う。
import type { CharacterClass, EquipBonus, SubWeaponKey } from '../types/game';
import { CHARACTER_SUBWEAPON_KEYS, classSubWeaponFor } from './campaign';
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
  'giantbat@stage-6', 'giantbat@stage-7', 'giantbat@stage-ex1', 'giantbat@stage-ex2',
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
  hp: number;
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
  damageMult: number;
  fireRateMult?: number;
  critChance?: number;
  speed?: number;
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

const equipBonus = (damageMult: number, fireRateMult = 1): EquipBonus => ({
  moveSpeedMult: 1,
  killGraceMult: 1,
  damageMult,
  fireRateMult,
  reloadMult: 1,
  critBonus: 0,
  ammoDropBonus: 0,
  scrapBonus: 0,
});

const subLevels = (keys: readonly SubWeaponKey[]): Partial<Record<SubWeaponKey, number>> =>
  Object.fromEntries(keys.map(key => [key, 3])) as Partial<Record<SubWeaponKey, number>>;

const fixedGuardian = (s: GuardianSpec): FixedGuardian => {
  const counts = REACTION_COUNTS[s.reaction];
  const classSubWeapon = classSubWeaponFor(s.classId);
  if (CHARACTER_SUBWEAPON_KEYS.includes(s.selectedSubWeapon)) {
    throw new Error(`${s.name}の選択サブ枠に職業固有サブ ${s.selectedSubWeapon} は装備できません`);
  }
  const subWeapons: SubWeaponKey[] = [classSubWeapon, s.selectedSubWeapon];
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
        maxHealth: s.hp,
        speed: s.speed ?? 87,
        level: 20,
        gunKeys: [s.gunKey],
        activeGunKey: s.gunKey,
        meleeKey: s.meleeKey,
        skills: [],
        skillLevels: {},
        equipBonus: equipBonus(s.damageMult, s.fireRateMult),
        critChance: s.critChance ?? 0.2,
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
    hp: 320, clearSeconds: 72, score: 63, reactionMs: 110, counterChance: 0.85,
    preferredDist: 80, meleeBias: 0.85, mobility: 0.82, stationaryFrac: 0.08,
    approachPerMin: 9, subUsesPerMin: 10, damageMult: 4,
  }),
  fixedGuardian({
    id: 'shishimaru', name: 'ししまる', classId: 'warrior', role: 'counter', reaction: 'slash',
    gunKey: 'handgun-t2', meleeKey: 'tactical-knife-t4', selectedSubWeapon: 'shield',
    hp: 300, clearSeconds: 82, score: 53, reactionMs: 130, counterChance: 0.8,
    preferredDist: 90, meleeBias: 0.8, mobility: 0.78, stationaryFrac: 0.1,
    approachPerMin: 10, subUsesPerMin: 9, damageMult: 3.6,
  }),
  fixedGuardian({
    id: 'karasu', name: '鴉', classId: 'rogue', role: 'counter', reaction: 'slash',
    gunKey: 'handgun-t3', meleeKey: 'machete-t3', selectedSubWeapon: 'fire-knife',
    hp: 260, clearSeconds: 58, score: 77, reactionMs: 100, counterChance: 0.82,
    preferredDist: 95, meleeBias: 0.75, mobility: 0.94, stationaryFrac: 0.04,
    approachPerMin: 11, subUsesPerMin: 11, damageMult: 3.7, fireRateMult: 1.35, critChance: 0.35,
  }),
  fixedGuardian({
    id: 'yuki', name: 'ユキ', classId: 'rogue', role: 'evade', reaction: 'dance',
    gunKey: 'rifle-t1', meleeKey: 'machete-t3', selectedSubWeapon: 'decoy',
    hp: 200, clearSeconds: 42, score: -15, reactionMs: 105, counterChance: 0.4,
    preferredDist: 220, meleeBias: 0.2, mobility: 1, stationaryFrac: 0.02,
    approachPerMin: 6, subUsesPerMin: 10, damageMult: 3.4,
  }),
  fixedGuardian({
    id: 'mikazuki', name: '三日月', classId: 'mage', role: 'evade', reaction: 'dance',
    gunKey: 'handgun-t3', meleeKey: 'knife-t1', selectedSubWeapon: 'molotov',
    hp: 190, clearSeconds: 38, score: -11, reactionMs: 100, counterChance: 0.45,
    preferredDist: 210, meleeBias: 0.15, mobility: 0.98, stationaryFrac: 0.03,
    approachPerMin: 5, subUsesPerMin: 12, damageMult: 3.5, fireRateMult: 1.6,
  }),
  fixedGuardian({
    id: 'nanashi', name: 'ナナシ', classId: 'rogue', role: 'evade', reaction: 'dance',
    gunKey: 'shotgun-t2', meleeKey: 'hatchet-t2', selectedSubWeapon: 'drone-boomerang',
    hp: 210, clearSeconds: 45, score: -18, reactionMs: 120, counterChance: 0.4,
    preferredDist: 150, meleeBias: 0.38, mobility: 0.96, stationaryFrac: 0.04,
    approachPerMin: 7, subUsesPerMin: 11, damageMult: 3.3,
  }),
  fixedGuardian({
    id: 'iwamoto', name: '岩本', classId: 'warrior', role: 'wall', reaction: 'rock',
    gunKey: 'shotgun-t1', meleeKey: 'anti-mutant-knife-t5', selectedSubWeapon: 'first-aid-kit',
    hp: 340, clearSeconds: 86, score: -65, reactionMs: 230, counterChance: 0.55,
    preferredDist: 85, meleeBias: 0.82, mobility: 0.55, stationaryFrac: 0.22,
    approachPerMin: 4, subUsesPerMin: 6, damageMult: 3.1, speed: 72,
  }),
  fixedGuardian({
    id: 'donko', name: 'どんこ', classId: 'warrior', role: 'wall', reaction: 'rock',
    gunKey: 'rifle-t1', meleeKey: 'tactical-knife-t4', selectedSubWeapon: 'turret',
    hp: 330, clearSeconds: 78, score: -57, reactionMs: 210, counterChance: 0.5,
    preferredDist: 130, meleeBias: 0.6, mobility: 0.62, stationaryFrac: 0.2,
    approachPerMin: 5, subUsesPerMin: 8, damageMult: 3.2,
  }),
  fixedGuardian({
    id: 'chiyo', name: '千代', classId: 'necromancer', role: 'wall', reaction: 'rock',
    // 壁役かつ低機動。センサーマインで周囲を面制圧する。
    gunKey: 'handgun-t1', meleeKey: 'machete-t3', selectedSubWeapon: 'sensor-mine',
    hp: 310, clearSeconds: 74, score: -53, reactionMs: 220, counterChance: 0.52,
    preferredDist: 140, meleeBias: 0.55, mobility: 0.65, stationaryFrac: 0.18,
    approachPerMin: 5, subUsesPerMin: 8, damageMult: 3,
  }),
  fixedGuardian({
    id: 'tohmi', name: '遠見', classId: 'mage', role: 'sniper', reaction: 'dance',
    gunKey: 'rifle-t2', meleeKey: 'knife-t1', selectedSubWeapon: 'support-sniper',
    hp: 200, clearSeconds: 34, score: -7, reactionMs: 150, counterChance: 0.35,
    preferredDist: 420, meleeBias: 0.05, mobility: 0.62, stationaryFrac: 0.45,
    approachPerMin: 2, subUsesPerMin: 9, damageMult: 3.8, critChance: 0.32,
  }),
  fixedGuardian({
    id: 'shizu', name: '静', classId: 'mage', role: 'sniper', reaction: 'dance',
    // 停止率40%の狙撃役。タレットと射撃陣地を作る。
    gunKey: 'rifle-t2', meleeKey: 'knife-t1', selectedSubWeapon: 'turret',
    hp: 195, clearSeconds: 32, score: -5, reactionMs: 135, counterChance: 0.38,
    preferredDist: 380, meleeBias: 0.05, mobility: 0.66, stationaryFrac: 0.4,
    approachPerMin: 2, subUsesPerMin: 10, damageMult: 4, critChance: 0.4,
  }),
  fixedGuardian({
    id: 'hatsune', name: 'ハツネ', classId: 'necromancer', role: 'sniper', reaction: 'rock',
    // 340pxを保つ狙撃役。ホーミングで遠距離から複数を追撃する。
    gunKey: 'rifle-t3', meleeKey: 'hatchet-t2', selectedSubWeapon: 'homing',
    hp: 250, clearSeconds: 48, score: -27, reactionMs: 175, counterChance: 0.48,
    preferredDist: 340, meleeBias: 0.12, mobility: 0.72, stationaryFrac: 0.32,
    approachPerMin: 3, subUsesPerMin: 11, damageMult: 3.7,
  }),
  fixedGuardian({
    id: 'hayase', name: '早瀬', classId: 'rogue', role: 'rapid', reaction: 'dance',
    // 機動力最大の速射前衛。分身で接近圧力と手数を伸ばす。
    gunKey: 'handgun-t3', meleeKey: 'machete-t3', selectedSubWeapon: 'shadow-clone',
    hp: 220, clearSeconds: 30, score: -3, reactionMs: 100, counterChance: 0.45,
    preferredDist: 135, meleeBias: 0.45, mobility: 1, stationaryFrac: 0.02,
    approachPerMin: 10, subUsesPerMin: 12, damageMult: 3.8, fireRateMult: 1.9,
  }),
  fixedGuardian({
    id: 'bambi', name: 'ばんび', classId: 'rogue', role: 'rapid', reaction: 'rock',
    gunKey: 'shotgun-t3', meleeKey: 'hatchet-t2', selectedSubWeapon: 'flare-gun',
    hp: 240, clearSeconds: 41, score: -20, reactionMs: 125, counterChance: 0.5,
    preferredDist: 120, meleeBias: 0.55, mobility: 0.95, stationaryFrac: 0.04,
    approachPerMin: 12, subUsesPerMin: 12, damageMult: 3.6, fireRateMult: 1.45,
  }),
  fixedGuardian({
    id: 'chloe', name: 'クロエ', classId: 'mage', role: 'rapid', reaction: 'dance',
    gunKey: 'handgun-t2', meleeKey: 'knife-t1', selectedSubWeapon: 'homing',
    hp: 205, clearSeconds: 33, score: -6, reactionMs: 115, counterChance: 0.42,
    preferredDist: 190, meleeBias: 0.2, mobility: 0.92, stationaryFrac: 0.05,
    approachPerMin: 6, subUsesPerMin: 14, damageMult: 3.7, fireRateMult: 1.5,
  }),
  fixedGuardian({
    id: 'bansho', name: '番匠', classId: 'warrior', role: 'subweapon', reaction: 'rock',
    // 「番匠」の工作役。従来の3枠からタレットを本人の選択1枠として残す。
    gunKey: 'handgun-t1', meleeKey: 'tactical-knife-t4', selectedSubWeapon: 'turret',
    hp: 290, clearSeconds: 52, score: -31, reactionMs: 180, counterChance: 0.55,
    preferredDist: 145, meleeBias: 0.58, mobility: 0.72, stationaryFrac: 0.16,
    approachPerMin: 6, subUsesPerMin: 16, damageMult: 3.5,
  }),
  fixedGuardian({
    id: 'akane', name: 'あかね', classId: 'necromancer', role: 'subweapon', reaction: 'dance',
    // 高機動ショットガン役。前中衛での被弾を盾で補う。
    gunKey: 'shotgun-t2', meleeKey: 'machete-t3', selectedSubWeapon: 'shield',
    hp: 245, clearSeconds: 40, score: -13, reactionMs: 120, counterChance: 0.4,
    preferredDist: 165, meleeBias: 0.4, mobility: 0.9, stationaryFrac: 0.07,
    approachPerMin: 7, subUsesPerMin: 14, damageMult: 3.4,
  }),
  fixedGuardian({
    id: 'ryoken', name: '猟犬', classId: 'warrior', role: 'subweapon', reaction: 'slash',
    gunKey: 'rifle-t1', meleeKey: 'anti-mutant-knife-t5', selectedSubWeapon: 'junk-weapon',
    hp: 300, clearSeconds: 64, score: 71, reactionMs: 115, counterChance: 0.78,
    preferredDist: 105, meleeBias: 0.78, mobility: 0.84, stationaryFrac: 0.07,
    approachPerMin: 9, subUsesPerMin: 12, damageMult: 3.8,
  }),
  fixedGuardian({
    id: 'phill', name: 'フィル', classId: 'rogue', role: 'variant', reaction: 'dance',
    gunKey: 'phill-revolver', meleeKey: 'machete-t3', selectedSubWeapon: 'fire-knife',
    hp: 220, clearSeconds: 28, score: -1, reactionMs: 100, counterChance: 0.45,
    preferredDist: 185, meleeBias: 0.25, mobility: 0.96, stationaryFrac: 0.03,
    approachPerMin: 6, subUsesPerMin: 12, damageMult: 4, phillHeadshotRate: 1,
  }),
  fixedGuardian({
    id: 'mumei', name: '無銘', classId: 'necromancer', role: 'variant', reaction: 'slash',
    gunKey: 'handgun-t1', meleeKey: 'anti-mutant-knife-t5', selectedSubWeapon: 'katana',
    hp: 280, clearSeconds: 70, score: 65, reactionMs: 105, counterChance: 0.85,
    preferredDist: 75, meleeBias: 0.9, mobility: 0.88, stationaryFrac: 0.05,
    approachPerMin: 10, subUsesPerMin: 10, damageMult: 3.9,
  }),
];

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

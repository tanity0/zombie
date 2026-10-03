import { displayNameFrom } from './playerName.mjs';

export const GHOST_SHARE_EPOCH = 1;
export const GHOST_KNOB_SET_V = 1;
export const GHOST_PROFILE_DEFAULTS = Object.freeze({
  reactionMs: 250,
  counterChance: 0.5,
  preferredDist: 180,
  meleeBias: 0.4,
  mobility: 0.6,
  hitsPerMin: 3,
  subUsesPerMin: 2,
  stationaryFrac: 0.35,
  approachPerMin: 3,
});

export const GHOST_SLOT_RE = /^[a-z0-9-]{1,48}$/;
export const GHOST_EPOCH_RE = /^[0-9]{1,6}$/;
export const GHOST_MAX_RECORD_BYTES = 64 * 1024;
export const GHOST_MAX_RESPONSE_BYTES = 256 * 1024;
export const GHOST_COMMENT_MAX_LEN = 30;
export const GHOST_ARRIVAL_COMMENT_DEFAULT = '援護します！';
export const GHOST_DEPARTURE_COMMENT_DEFAULT = '帰還します！';

/** 公開プロフィールとローカル保存で共用する、守護霊コメントの浄化。空文字は呼び出し側で既定文へ戻す。 */
export const sanitizeGhostComment = (raw) => {
  if (typeof raw !== 'string') return '';
  const cleaned = raw
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return [...cleaned].slice(0, GHOST_COMMENT_MAX_LEN).join('');
};

export const displayGhostComment = (raw, fallback) => sanitizeGhostComment(raw) || fallback;

const KNOB_RANGES = Object.freeze({
  reactionMs: [100, 800],
  counterChance: [0, 1],
  preferredDist: [0, 800],
  meleeBias: [0, 1],
  mobility: [0, 1],
  hitsPerMin: [0, 120],
  subUsesPerMin: [0, 60],
  stationaryFrac: [0, 1],
  approachPerMin: [0, 120],
});

export const GHOST_KNOB_NAMES = Object.freeze(Object.keys(KNOB_RANGES));

const CLASSES = new Set(['warrior', 'mage', 'rogue', 'necromancer']);
// アバターシステム(試験・第1弾・v0.25.3271「守護霊へのアバター記録」)。src/data/avatars.ts の
// AVATAR_IDS と同じ内容を手で複製している(このファイルの他のホワイトリストと同じ作法・
// server側はビルド無しでこの.mjsを直接importするためTS側から自動生成できない)。
// ★新しいアバターを足す時はここにも追加すること。忘れると sanitizeSnapshot が黙って null に落とす
// (この節のコメント=CLAUDE.md「既知の地雷」参照)。
const AVATAR_IDS = new Set(['cat-set']);
const SKILLS = new Set([
  'reaper', 'berserker', 'skater', 'overclock', 'guardian-spirit', 'ghost-helper', 'ghost-slayer',
  'crit-up', 'knight', 'exploder', 'sharpshooter', 'sniper', 'ricochet', 'bomber', 'fire-shooter',
  'bomb-counter', 'punisher', 'combo-master', 'knife-master', 'benkei', 'reflex', 'rescue-signal',
  'gold-rush', 'time-keeper', 'ghost-shooter', 'dog-run', 'counter-master', 'slasher', 'attack-shooter',
  'runner', 'seeker', 'scrap-builder', 'magnet', 'last-magazine', 'warm-up',
  'poi-bombing', 'poi-guard', 'poi-thrall',
  // SKILL_BUILD_REDESIGN.md §28(B7): 眠り9種の効果配線+スターター入り。ホワイトリストへ追加を
  // 忘れると霊のスキルが黙って落ちる(§28-2点3)。
  'big-bullet', 'ice-shot', 'vampire', 'incendiary-round', 'execution-shock',
  'gravity-shot', 'echo-shot', 'barrage-king', 'blood-treads',
]);
const SUB_WEAPONS = new Set([
  'heavy-grenade', 'marksman-trap', 'striker-quick-mag', 'striker-hunting', 'dog', 'katana', 'murasame',
  'decoy', 'shield', 'whip', 'alchemy', 'turret', 'shijin', 'fire-knife', 'drone-boomerang', 'wire-anchor',
  'sage-stone', 'homing', 'shadow-clone', 'molotov', 'first-aid-kit', 'sensor-mine', 'support-sniper',
  'flare-gun', 'junk-weapon',
]);
const GUNS = new Set([
  'handgun-t1', 'handgun-t2', 'handgun-t3', 'shotgun-t1', 'shotgun-t2', 'shotgun-t3',
  'rifle-t1', 'rifle-t2', 'rifle-t3', 'phill-revolver',
]);
const MELEES = new Set(['knife-t1', 'hatchet-t2', 'machete-t3', 'tactical-knife-t4', 'anti-mutant-knife-t5']);
const MOVE_KEYS = new Set([
  'g-stomp','g-sweep','g-jump','g-dash','g-bolt','g-trijump','g-bite','g-slam','g-glide','g-dive','g-quad','g-nova','g-wing','g-sweepbeam','g-talon','g-boon','g-reach','g-nihil',
  'thor-issen','thor-tsuki','thor-harai','thor-jump','mimir-bite','mimir-laser','mimir-dash','jormungand-coil','jormungand-dash','skadi-ice','skadi-blade','skadi-cage','skadi-dash',
  'miguel-mdash','miguel-tate','miguel-harai','jibril-consecrate','jibril-lantern','rafi-bone','rafi-jump','rafi-sweep','uri-downslash','uri-sweep','uri-thrust','suriel-ring','suriel-sweep','acrasiel-burst','acrasiel-spear','acrasiel-spike','idol-roll','idol-punch','idol-snipe',
  'mimir-burst','mimir-radial','jormungand-burst','jormungand-radial','skadi-burst','skadi-radial','thor-burst','thor-radial','miguel-volley','jibril-volley','uri-bolt','suriel-gaze','acrasiel-gaze','idol-aim','idol-fan','idol-orb','g-parts',
  'idol-s1','idol-s2','idol-s3','idol-s4','idol-s5','idol-s6','idol-s7','idol-s8',
]);

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const int = (v, lo, hi) => clamp(Math.floor(finite(v) ? v : lo), lo, hi);
const listOf = (v, known, max) => Array.isArray(v)
  ? [...new Set(v.filter((x) => typeof x === 'string' && known.has(x)))].slice(0, max)
  : [];

const sanitizeLevelMap = (raw, known, maxLevel = 3) => {
  if (!isObject(raw)) return {};
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    if (known.has(key) && finite(value)) out[key] = int(value, 1, maxLevel);
  }
  return out;
};

const sanitizeEquipmentId = (raw, slot) => {
  if (typeof raw !== 'string') return null;
  if (raw === `special-${slot}`) return raw;
  return new RegExp(`^${slot}-(protection|mobility|firepower|handling|crit|ammo)-[1-5]$`).test(raw) ? raw : null;
};

const sanitizeSnapshot = (raw) => {
  if (!isObject(raw) || !finite(raw.maxHealth) || !finite(raw.speed) || !finite(raw.level)) return undefined;
  const gunKeys = listOf(raw.gunKeys, GUNS, 4);
  const subWeapons = listOf(raw.subWeapons, SUB_WEAPONS, 4);
  const equipmentRaw = isObject(raw.equipment) ? raw.equipment : {};
  const bonusRaw = isObject(raw.equipBonus) ? raw.equipBonus : {};
  const boundedBonus = (key, lo, hi, fallback) => finite(bonusRaw[key]) ? clamp(bonusRaw[key], lo, hi) : fallback;
  const out = {
    // 通常プレイ上限へ装備・将来拡張の25%余裕を足した防御上限。
    maxHealth: clamp(raw.maxHealth, 1, 5000),
    speed: clamp(raw.speed, 1, 1000),
    level: int(raw.level, 1, 250),
    gunKeys,
    // SKILL_BUILD_REDESIGN.md §28-2点3(B7): スターター18種(旧9+新9)+同行者枠3=最大21種所持に
    // なったため、サーバ上限を9→21+余裕(24)へ引き上げる(据え置くと霊のスキルが黙って落ちる)。
    skills: listOf(raw.skills, SKILLS, 24),
    skillLevels: sanitizeLevelMap(raw.skillLevels, SKILLS, 3),
    equipment: {
      body: sanitizeEquipmentId(equipmentRaw.body, 'body'),
      arms: sanitizeEquipmentId(equipmentRaw.arms, 'arms'),
      accessory: sanitizeEquipmentId(equipmentRaw.accessory, 'accessory'),
    },
    equipBonus: {
      moveSpeedMult: boundedBonus('moveSpeedMult', 0.1, 3, 1),
      killGraceMult: boundedBonus('killGraceMult', 0.1, 4, 1),
      damageMult: boundedBonus('damageMult', 0.1, 5, 1),
      fireRateMult: boundedBonus('fireRateMult', 0.1, 5, 1),
      reloadMult: boundedBonus('reloadMult', 0.1, 2, 1),
      critBonus: boundedBonus('critBonus', 0, 1, 0),
      ammoDropBonus: boundedBonus('ammoDropBonus', 0, 3, 0),
      scrapBonus: boundedBonus('scrapBonus', 0, 3, 0),
    },
    critChance: finite(raw.critChance) ? clamp(raw.critChance, 0, 1) : 0,
    subWeapons,
    subWeaponLevels: sanitizeLevelMap(raw.subWeaponLevels, SUB_WEAPONS, 3),
  };
  if (typeof raw.activeGunKey === 'string' && GUNS.has(raw.activeGunKey) && gunKeys.includes(raw.activeGunKey)) out.activeGunKey = raw.activeGunKey;
  if (typeof raw.meleeKey === 'string' && MELEES.has(raw.meleeKey)) out.meleeKey = raw.meleeKey;
  if (typeof raw.characterClass === 'string' && CLASSES.has(raw.characterClass)) out.characterClass = raw.characterClass;
  if (finite(raw.phillShots)) out.phillShots = int(raw.phillShots, 0, 1_000_000);
  if (finite(raw.phillHeadshots)) out.phillHeadshots = int(raw.phillHeadshots, 0, out.phillShots ?? 1_000_000);
  if (finite(raw.phillHeadshotRate)) out.phillHeadshotRate = clamp(raw.phillHeadshotRate, 0, 1);
  // v0.25.3271(守護霊へのアバター記録): 既知アバター以外(改造/旧データ/未来のID)はnull化。
  // isAvatarId(src/data/avatars.ts)相当の検証をこの信頼境界でも独立に行う。
  out.avatarId = (typeof raw.avatarId === 'string' && AVATAR_IDS.has(raw.avatarId)) ? raw.avatarId : null;
  return out;
};

const sanitizeMoveReactions = (raw) => {
  if (!isObject(raw)) return {};
  const out = {};
  for (const [key, value] of Object.entries(raw).slice(0, MOVE_KEYS.size)) {
    if (!MOVE_KEYS.has(key) || !isObject(value)) continue;
    out[key] = {
      n: int(value.n, 0, 1_000_000),
      counterRate: finite(value.counterRate) ? clamp(value.counterRate, 0, 1) : 0,
      hitRate: finite(value.hitRate) ? clamp(value.hitRate, 0, 1) : 0,
    };
  }
  return out;
};

const sanitizeSubStyles = (raw) => {
  const source = isObject(raw) ? raw : {};
  const wire = isObject(source.wire) ? source.wire : {};
  const shield = isObject(source.shield) ? source.shield : {};
  const homing = isObject(source.homing) ? source.homing : {};
  return {
    wire: { n: int(wire.n, 0, 1_000_000), slamRatio: finite(wire.slamRatio) ? clamp(wire.slamRatio, 0, 1) : 0 },
    shield: {
      n: int(shield.n, 0, 1_000_000),
      bashPerPlacement: finite(shield.bashPerPlacement) ? clamp(shield.bashPerPlacement, 0, 100) : 0,
      bashDamageFrac: finite(shield.bashDamageFrac) ? clamp(shield.bashDamageFrac, 0, 1) : 0,
    },
    homing: { n: int(homing.n, 0, 1_000_000), holdMsAvg: finite(homing.holdMsAvg) ? clamp(homing.holdMsAvg, 0, 10_000) : 0 },
  };
};

const sanitizeDodge = (raw) => isObject(raw) ? {
  n: int(raw.n, 0, 1_000_000),
  awayRate: finite(raw.awayRate) ? clamp(raw.awayRate, 0, 1) : 0,
  lateralRate: finite(raw.lateralRate) ? clamp(raw.lateralRate, 0, 1) : 0,
} : undefined;

const sanitizePunish = (raw) => {
  if (!isObject(raw)) return undefined;
  const out = {};
  for (const key of ['stun', 'recover', 'afterCounter']) {
    const value = raw[key];
    if (!isObject(value)) continue;
    out[key] = { n: int(value.n, 0, 1_000_000), rushRate: finite(value.rushRate) ? clamp(value.rushRate, 0, 1) : 0 };
  }
  return Object.keys(out).length > 0 ? out : undefined;
};

const sanitizeSlot = (raw) => {
  if (!isObject(raw)) return null;
  const out = {};
  for (const [key, [lo, hi]] of Object.entries(KNOB_RANGES)) {
    const value = raw[key];
    out[key] = value === null ? null : finite(value) ? clamp(value, lo, hi) : null;
  }
  out.subStyles = sanitizeSubStyles(raw.subStyles);
  out.srcClass = typeof raw.srcClass === 'string' && CLASSES.has(raw.srcClass) ? raw.srcClass : null;
  out.srcName = displayNameFrom(raw.srcName);
  const snapshot = sanitizeSnapshot(raw.snapshot);
  out.snapshot = snapshot ?? null;
  if (finite(raw.perfScore)) out.perfScore = Math.min(180, raw.perfScore);
  if (finite(raw.clearTimeMs)) out.clearTimeMs = clamp(raw.clearTimeMs, 0, 86_400_000);
  out.at = finite(raw.at) ? clamp(raw.at, 0, Date.now() + 86_400_000) : 0;
  out.knobsV = int(raw.knobsV, 0, 1_000_000);
  const dodgeDir = sanitizeDodge(raw.dodgeDir);
  if (dodgeDir) out.dodgeDir = dodgeDir;
  const punish = sanitizePunish(raw.punish);
  if (punish) out.punish = punish;
  return out;
};

/** 信頼境界で使う。構造不正はnull、値は安全な範囲へ正規化する。 */
export const sanitizeSharedProfile = (raw, expectedSlot) => {
  if (!isObject(raw) || raw.v !== 1 || !isObject(raw.bossStyles) || !GHOST_SLOT_RE.test(expectedSlot ?? '')) return null;
  const slotKeys = Object.keys(raw.bossStyles);
  if (slotKeys.length !== 1 || slotKeys[0] !== expectedSlot) return null;
  const rawSlot = raw.bossStyles[expectedSlot];
  if (!isObject(rawSlot)) return null;
  if (rawSlot.perfScore !== undefined && rawSlot.perfScore !== null && !finite(rawSlot.perfScore)) return null;
  const slot = sanitizeSlot(rawSlot);
  if (!slot) return null;
  const out = { v: 1, runs: int(raw.runs, 0, 1_000_000) };
  for (const [key, [lo, hi]] of Object.entries(KNOB_RANGES)) {
    const value = raw[key] ?? GHOST_PROFILE_DEFAULTS[key];
    if (!finite(value)) return null;
    out[key] = clamp(value, lo, hi);
  }
  out.moveReactions = sanitizeMoveReactions(raw.moveReactions);
  out.subStyles = sanitizeSubStyles(raw.subStyles);
  const dodgeDir = sanitizeDodge(raw.dodgeDir);
  if (dodgeDir) out.dodgeDir = dodgeDir;
  const punish = sanitizePunish(raw.punish);
  if (punish) out.punish = punish;
  const srcName = displayNameFrom(raw.srcName);
  if (srcName) out.srcName = srcName;
  const arrivalComment = sanitizeGhostComment(raw.arrivalComment);
  if (arrivalComment) out.arrivalComment = arrivalComment;
  const departureComment = sanitizeGhostComment(raw.departureComment);
  if (departureComment) out.departureComment = departureComment;
  if (typeof raw.srcClass === 'string' && CLASSES.has(raw.srcClass)) out.srcClass = raw.srcClass;
  const snapshot = sanitizeSnapshot(raw.snapshot);
  if (snapshot) out.snapshot = snapshot;
  out.bossStyles = { [expectedSlot]: slot };
  return out;
};

export const utf8Size = (value) => new TextEncoder().encode(JSON.stringify(value)).byteLength;

export const sanitizePerfScore = (value) => finite(value) ? Math.min(180, value) : null;

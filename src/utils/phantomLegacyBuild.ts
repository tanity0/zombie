// 幻影(敵として出る他人の記録の写し)の持ち物を「共有の正規化を広げる前」の集合へ絞る。
//
// 事実: 社長裁定「通す必要ありそうなものは通して」で、shared/ghostSanitize.mjs の許可リスト
// (銃・スキル・サブウェポン・アバター・技への反応表のキー)を台帳と一致させた=**他人の守護霊(味方)**は
// 記録主の持ち物をそのまま持って来る。ところが幻影も同じ他人の記録(phantomIdentity の remote)から組むので、
// そのままだと幻影の持ち物まで広がる。**幻影の持ち物を広げるかは社長の裁定待ち**なので、それまでは
// 広げる前の集合(下の PHANTOM_LEGACY_*)だけに絞り、直す前の正規化を通した時と同じ持ち物で戦わせる。
//
// 掛ける所は phantomIdentity.pickPhantomIdentity の remote の1か所だけ(幻影の記録の唯一の入口=
// useGameLoop の `phantomBuild`・actorBuildFor・pixiScene の近接/アバター・phantomBrawlerTick・
// phantomTick の癖が全部この人格を読む)。固定の先人守護霊20体・固有の幻影(拳鬼=brawler)は
// 共有の正規化を一度も通らない記録なので絞らない(絞ると拳鬼の格闘が消える)。
// 純関数(store/data 非依存)。
import type { PlayerBuildSnapshot } from '../types/game';
import type { PlayerProfile } from './playerTraits';

/** 広げる前の銃(10挺)。 */
export const PHANTOM_LEGACY_GUNS: ReadonlySet<string> = new Set([
  'handgun-t1', 'handgun-t2', 'handgun-t3', 'shotgun-t1', 'shotgun-t2', 'shotgun-t3',
  'rifle-t1', 'rifle-t2', 'rifle-t3', 'phill-revolver',
]);
/** 広げる前のスキル。 */
export const PHANTOM_LEGACY_SKILLS: ReadonlySet<string> = new Set([
  'reaper', 'berserker', 'skater', 'overclock', 'guardian-spirit', 'ghost-helper', 'ghost-slayer',
  'crit-up', 'knight', 'exploder', 'sharpshooter', 'sniper', 'ricochet', 'bomber', 'fire-shooter',
  'bomb-counter', 'punisher', 'combo-master', 'knife-master', 'benkei', 'reflex', 'rescue-signal',
  'gold-rush', 'time-keeper', 'ghost-shooter', 'dog-run', 'counter-master', 'slasher', 'attack-shooter',
  'runner', 'seeker', 'scrap-builder', 'magnet', 'last-magazine', 'warm-up',
  'poi-bombing', 'poi-guard', 'poi-thrall',
  'big-bullet', 'ice-shot', 'vampire', 'incendiary-round', 'execution-shock',
  'gravity-shot', 'echo-shot', 'barrage-king', 'blood-treads',
]);
/** 広げる前のサブウェポン。 */
export const PHANTOM_LEGACY_SUB_WEAPONS: ReadonlySet<string> = new Set([
  'heavy-grenade', 'marksman-trap', 'striker-quick-mag', 'striker-hunting', 'dog', 'katana', 'murasame',
  'decoy', 'shield', 'whip', 'alchemy', 'turret', 'shijin', 'fire-knife', 'drone-boomerang', 'wire-anchor',
  'sage-stone', 'homing', 'shadow-clone', 'molotov', 'first-aid-kit', 'sensor-mine', 'support-sniper',
  'flare-gun', 'junk-weapon', 'arrow-rain',
]);
/** 広げる前のアバター(見た目)。 */
export const PHANTOM_LEGACY_AVATARS: ReadonlySet<string> = new Set(['cat-set']);
/** 広げる前の技への反応表のキー(幻影の弾への対処の割合・癖が読む)。 */
export const PHANTOM_LEGACY_MOVE_KEYS: ReadonlySet<string> = new Set([
  'g-stomp', 'g-sweep', 'g-jump', 'g-dash', 'g-bolt', 'g-trijump', 'g-bite', 'g-slam', 'g-glide', 'g-dive', 'g-quad', 'g-nova', 'g-wing', 'g-sweepbeam', 'g-talon', 'g-boon', 'g-reach', 'g-nihil',
  'thor-issen', 'thor-tsuki', 'thor-harai', 'thor-jump', 'mimir-bite', 'mimir-laser', 'mimir-dash', 'jormungand-coil', 'jormungand-dash', 'skadi-ice', 'skadi-blade', 'skadi-cage', 'skadi-dash',
  'miguel-mdash', 'miguel-tate', 'miguel-harai', 'jibril-consecrate', 'jibril-lantern', 'rafi-bone', 'rafi-jump', 'rafi-sweep', 'uri-downslash', 'uri-sweep', 'uri-thrust', 'suriel-ring', 'suriel-sweep', 'acrasiel-burst', 'acrasiel-spear', 'acrasiel-spike', 'idol-roll', 'idol-punch', 'idol-snipe',
  'mimir-burst', 'mimir-radial', 'jormungand-burst', 'jormungand-radial', 'skadi-burst', 'skadi-radial', 'thor-burst', 'thor-radial', 'miguel-volley', 'jibril-volley', 'uri-bolt', 'suriel-gaze', 'acrasiel-gaze', 'idol-aim', 'idol-fan', 'idol-orb', 'g-parts',
  'idol-s1', 'idol-s2', 'idol-s3', 'idol-s4', 'idol-s5', 'idol-s6', 'idol-s7', 'idol-s8',
]);
// 上限の数は共有の正規化と同じ(銃4・スキル24・サブ4)。
const GUN_MAX = 4;
const SKILL_MAX = 24;
const SUB_MAX = 4;

const pickList = <T extends string>(v: readonly T[] | undefined, known: ReadonlySet<string>, max: number): T[] | undefined =>
  v === undefined ? undefined : [...new Set(v.filter(x => known.has(x)))].slice(0, max);
const pickMap = <K extends string>(v: Partial<Record<K, number>> | undefined, known: ReadonlySet<string>): Partial<Record<K, number>> | undefined => {
  if (v === undefined) return undefined;
  const out: Partial<Record<K, number>> = {};
  for (const [k, n] of Object.entries(v) as [K, number | undefined][]) if (known.has(k) && n !== undefined) out[k] = n;
  return out;
};

/** 記録の持ち物を広げる前の集合へ絞る(欄が無ければ無いまま)。 */
export const phantomLegacySnapshot = (snap: PlayerBuildSnapshot): PlayerBuildSnapshot => {
  const gunKeys = pickList(snap.gunKeys, PHANTOM_LEGACY_GUNS, GUN_MAX);
  const out: PlayerBuildSnapshot = {
    ...snap,
    gunKeys,
    skills: pickList(snap.skills, PHANTOM_LEGACY_SKILLS, SKILL_MAX),
    skillLevels: pickMap(snap.skillLevels, PHANTOM_LEGACY_SKILLS),
    subWeapons: pickList(snap.subWeapons, PHANTOM_LEGACY_SUB_WEAPONS, SUB_MAX),
    subWeaponLevels: pickMap(snap.subWeaponLevels, PHANTOM_LEGACY_SUB_WEAPONS),
  };
  // 共有の正規化と同じ: 欄が無い物は欄なしのまま(undefined を書き足さない)。
  for (const k of ['gunKeys', 'skills', 'skillLevels', 'subWeapons', 'subWeaponLevels'] as const) {
    if (out[k] === undefined) delete out[k];
  }
  // アクティブ銃は「広げる前の銃で、かつ絞った所持銃に入っている」時だけ残す(共有の正規化と同じ規則)。
  if (snap.activeGunKey === undefined || !PHANTOM_LEGACY_GUNS.has(snap.activeGunKey) || !(gunKeys ?? []).includes(snap.activeGunKey)) {
    delete out.activeGunKey;
  }
  if (snap.avatarId !== undefined) out.avatarId = snap.avatarId !== null && PHANTOM_LEGACY_AVATARS.has(snap.avatarId) ? snap.avatarId : null;
  return out;
};

/** 他人の記録(オンライン)から幻影の人格を作る時に通す。元の物は書き換えない(同じ記録を守護霊も使う)。 */
export const phantomLegacyProfile = (profile: PlayerProfile): PlayerProfile => {
  const moveReactions: PlayerProfile['moveReactions'] = {};
  for (const [k, v] of Object.entries(profile.moveReactions ?? {})) {
    if (PHANTOM_LEGACY_MOVE_KEYS.has(k)) (moveReactions as Record<string, unknown>)[k] = v;
  }
  return {
    ...profile,
    moveReactions,
    ...(profile.snapshot ? { snapshot: phantomLegacySnapshot(profile.snapshot) } : {}),
  };
};

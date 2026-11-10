// research/BRAWLER_PHANTOM.md §13(簡易版): 固有の幻影(ユニーク人格)の台帳。
//
// 汎用の幻影(guardian-phantom)と**同じ仕様・同じ頭脳**で戦う、固定の1人。中身(癖・ビルド・名前・アバター)を
// ここに1行ずつ持つ。固定の先人守護霊20人(fixedGuardians.FIXED_GUARDIANS)には**入れない**——入れると守護霊の抽選に
// 混ざってしまう。
//
// 「格闘」はビルドに持たせ、幻影の上で格闘の状態機械を回して戦う(utils/phantomBrawlerAi.ts)。疑似プレイヤーは
// 印(Enemy.phantomUnique)のある幻影だけ 'brawler' を残す(playerBuild.buildPseudoPlayer の keepBrawler)。
import type { EquipLoadout, PhantomUniqueKind, SkillKey, SubWeaponKey } from '../types/game';
import { aggregateEquipBonus, equipMaxHealthOf } from './equipment';
import { PLAYER_PROFILES } from './playerProfiles';
import { BULLET_MOVE_KEYS, MOVE_REACTION_KEYS, type MoveReactionTable } from '../utils/moveReaction';
import type { PlayerProfile } from '../utils/playerTraits';

export interface UniquePhantomSpec {
  kind: PhantomUniqueKind;
  /** 表示名(仮)。「(幻影)」は表示側が付ける。固定20人の名前と重ねない(人格のキャッシュが名前で引くため)。 */
  name: string;
  profile: PlayerProfile;
}

// 技への反応表(弾の技: 返す0.5 / 食らう0.1 / 残り=避ける0.4。それ以外の技も同じ値=叩き台)。
const REACTIONS: MoveReactionTable = Object.fromEntries(
  [...MOVE_REACTION_KEYS, ...BULLET_MOVE_KEYS].map(key => [key, { n: 20, counterRate: 0.5, hitRate: 0.1 }]),
) as MoveReactionTable;

const KENKI_EQUIP: EquipLoadout = { body: 'body-mobility-3', arms: 'arms-firepower-3', accessory: 'accessory-crit-3' };
const KENKI_SKILLS: readonly { key: SkillKey; level: number }[] = [
  { key: 'time-keeper', level: 3 },
  { key: 'overclock', level: 3 },
];
// ★拳鬼の「縮地」(research/BRAWLER_PHANTOM.md §14・社長指示2026-11-10「拳鬼はカウンターすると縮地で距離を一気に詰めてくる。
// (ただし無限にワープはしない)」)は**この表に入れない**。プレイヤーのスキル 'shukuchi'(近接で倒すと次の敵へ跳んで斬る・
// 連鎖でダメージが重くなる・ワープ後500msの無敵)とは別物の専用の作り(utils/kenkiShukuchi.ts)で、'shukuchi' を記録に積むと
// 疑似プレイヤーの近接の連鎖の倍率・無敵など、プレイヤー用の効果の読み筋に乗ってしまうため。届く距離だけ Lv1 と同じ400px。
const KENKI_SUBS: SubWeaponKey[] = ['brawler'];

/** 拳鬼(仮名): 格闘の幻影。絵は専用(kenki-*)。ストライカー・ファイティングナイフ・3段目の装備・タイムキーパーLv3+オーバークロックLv3・格闘Lv3。 */
const KENKI: UniquePhantomSpec = {
  kind: 'brawler',
  name: '拳鬼',
  profile: {
    v: 1,
    runs: 10,
    reactionMs: 250,
    counterChance: 0.6,
    preferredDist: 60,
    meleeBias: 0.95,
    mobility: 0.9,
    hitsPerMin: 4,
    subUsesPerMin: 0,
    stationaryFrac: 0.05,
    approachPerMin: 14,
    moveReactions: REACTIONS,
    subStyles: {
      wire: { n: 0, slamRatio: 0 },
      shield: { n: 0, bashPerPlacement: 0, bashDamageFrac: 0 },
      homing: { n: 0, holdMsAvg: 0 },
    },
    srcClass: 'rogue',
    srcName: '拳鬼',
    snapshot: {
      maxHealth: PLAYER_PROFILES.rogue.maxHp + equipMaxHealthOf(KENKI_EQUIP),
      speed: 87,
      level: 20,
      gunKeys: ['handgun-t1'],
      activeGunKey: 'handgun-t1',
      meleeKey: 'machete-t3',
      skills: KENKI_SKILLS.map(s => s.key),
      skillLevels: Object.fromEntries(KENKI_SKILLS.map(s => [s.key, s.level])),
      equipment: { ...KENKI_EQUIP },
      equipBonus: aggregateEquipBonus(KENKI_EQUIP),
      critChance: 0,
      magBonus: 0,
      reloadMult: 1,
      subWeapons: [...KENKI_SUBS],
      subWeaponLevels: Object.fromEntries(KENKI_SUBS.map(k => [k, 3])),
      characterClass: 'rogue',
      // 見た目は拳鬼の専用の絵(社長支給2026-11-10・public/sprites/kenki-*.png)。仮のアバター(キョンシーセット)は外した。
    },
  },
};

export const UNIQUE_PHANTOMS: Readonly<Record<PhantomUniqueKind, UniquePhantomSpec>> = { brawler: KENKI };

export const uniquePhantomSpec = (kind: PhantomUniqueKind): UniquePhantomSpec => UNIQUE_PHANTOMS[kind];

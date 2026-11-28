import type { SubWeaponKey } from '../types/game';
import type { AvatarId } from './avatars';

// 装備画面(サブウェポン/アバター)のアイコン(社長指示2026-09-12「アバターは装備の様にアイコン表示して。あ、サブウェポンも」)。
// 既存の在世界スプライトを流用する(新規素材なし)。無い物は null=絵の枡を空で出す(素材が来たらここに1行足す)。
const SUB_ICON: Partial<Record<SubWeaponKey, string>> = {
  'heavy-grenade': 'fx/grenade-ball',
  dog: 'dog-walk-0',
  katana: 'katana-item',
  murasame: 'katana-item',
  decoy: 'decoy',
  shield: 'shield-up',
  whip: 'whip',
  turret: 'turret-omni',
  shijin: 'magic-circle',
  'fire-knife': 'weapons/fire-knife-projectile',
  'drone-boomerang': 'drone-boomerang',
  'wire-anchor': 'wire-anchor-tip',
  'first-aid-kit': 'first-aid-kit',
  'arrow-rain': 'fx/arrow', // 仮(社長の素材待ち)。旗手の矢と同じ矢の絵
  brawler: 'brawler-item', // 社長支給 2026-11-07(research/BRAWLER.md §0-1)
  'gold-ring': 'suriel-ring', // 社長指示2026-11-09「サブウェポンの絵もこれで」=在世界の金環と同じドット絵
  // 社長支給 2026-11-20(装備画面の絵が無かった分・1枚の帯から切り出し=原本は art-masters/sub-weapon-icons-strip-2026-11-20.png)。
  'marksman-trap': 'sub-icons/marksman-trap',
  'striker-hunting': 'sub-icons/striker-hunting',
  'striker-quick-mag': 'sub-icons/striker-quick-mag',
  alchemy: 'sub-icons/alchemy-bat', // 社長指示2026-11-20「錬金術の絵は、錬金ゾンビの絵を縮小して使って」→同日「レベル1はバット・2はゾンビ・3は伐採人」=召喚の絵(金色)を縮小。Lv別は下の ALCHEMY_ICON_BY_LEVEL。支給の帯の絵は sub-icons/alchemy.png に原盤として残す
  homing: 'sub-icons/homing',
  'shadow-clone': 'sub-icons/shadow-clone',
  molotov: 'sub-icons/molotov',
  'sensor-mine': 'sub-icons/sensor-mine',
  'support-sniper': 'sub-icons/support-sniper',
  'flare-gun': 'sub-icons/flare-gun',
  'junk-weapon': 'sub-icons/junk-weapon',
};
// 錬金術はレベルで召喚が変わる(utils/summonUtils.ALCHEMY_SUMMON_TYPE_BY_LEVEL と同じ並び)ので、絵もレベルで替える。
// 絵は各召喚の立ち絵を金色にして縮小したもの(バット=bat-male / ゾンビ=zombie-common / 伐採人=reaper-common)。
export const ALCHEMY_ICON_BY_LEVEL: readonly string[] = ['', 'sub-icons/alchemy-bat', 'sub-icons/alchemy-zombie', 'sub-icons/alchemy-lumberjack'];
/** サブウェポンの絵。level を知っている画面は渡す(錬金術だけがレベルで絵が変わる)。省略=Lv1。 */
export const subWeaponIconName = (key: SubWeaponKey, level?: number): string | null => {
  if (key === 'alchemy') return ALCHEMY_ICON_BY_LEVEL[Math.max(1, Math.min(3, Math.round(level ?? 1)))];
  return SUB_ICON[key] ?? null;
};

const AVATAR_ICON: Partial<Record<AvatarId, string>> = {
  'cat-set': 'avatar-cat-ears-v2',
  'devil-set': 'avatar-devil-horns',
  'angel-set': 'avatar-angel-wings-v2',
  'bunny-set': 'avatar-bunny-ears',
  'pirate-set': 'avatar-pirate-hat-v2',
  'ghost-set': 'avatar-ghost-fire-big-v2',
  'jiangshi-set': 'avatar-jiangshi-hat',
  'maid-set': 'avatar-maid-headdress',
  'tosen-set': 'avatar-tosen-kintoun',
};
export const avatarIconName = (id: AvatarId): string | null => AVATAR_ICON[id] ?? null;

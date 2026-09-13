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
};
export const subWeaponIconName = (key: SubWeaponKey): string | null => SUB_ICON[key] ?? null;

const AVATAR_ICON: Partial<Record<AvatarId, string>> = {
  'cat-set': 'avatar-cat-ears',
};
export const avatarIconName = (id: AvatarId): string | null => AVATAR_ICON[id] ?? null;

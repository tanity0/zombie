import { UpgradeOption, Player, PassiveType } from '../types/game';

// RE rework: level-ups only strengthen the survivor. New weapons come from
// world drops and crates, never the level-up menu — so every option here is
// a passive stat boost.
const PASSIVE_POOL: PassiveType[] = [
  'maxHealth', 'speed', 'might', 'cooldown', 'amount', 'critChance'
];

export const generateUpgradeOptions = (player: Player): UpgradeOption[] => {
  void player;
  // Shuffle the pool and take 3 distinct passives.
  const shuffled = [...PASSIVE_POOL].sort(() => 0.5 - Math.random());
  const picks = shuffled.slice(0, 3);

  return picks.map(passiveType => ({
    id: `passive-${passiveType}`,
    name: getPassiveDisplayName(passiveType),
    description: getPassiveDescription(passiveType),
    type: 'passive' as const,
    passiveType,
    level: 1
  }));
};

export const getPassiveDisplayName = (type: PassiveType): string => {
  switch (type) {
    case 'maxHealth': return '最大体力アップ';
    case 'speed': return '移動速度アップ';
    case 'might': return 'ダメージ強化';
    case 'cooldown': return '連射速度アップ';
    case 'amount': return '装弾数アップ';
    case 'critChance': return 'クリティカル率アップ';
    case 'area': return '効果範囲アップ';
    case 'duration': return '効果時間延長';
    default: return '不明なアップグレード';
  }
};

export const getPassiveDescription = (type: PassiveType): string => {
  switch (type) {
    case 'maxHealth': return '最大体力が20ポイント増加します';
    case 'speed': return '移動速度が10%向上します';
    case 'might': return '銃・近接のダメージが12%増加します';
    case 'cooldown': return '銃の発射間隔が10%短縮されます';
    case 'amount': return '銃の発射弾数が1発増加します';
    case 'critChance': return 'クリティカル率が5%上昇します';
    default: return '不明なアップグレード';
  }
};

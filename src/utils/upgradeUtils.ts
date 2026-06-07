import { UpgradeOption, Player, PassiveType } from '../types/game';

// RE rework: level-ups only strengthen the survivor. New weapons come from
// world drops and crates, never the level-up menu — so every option here is
// a passive stat boost.
const PASSIVE_POOL: PassiveType[] = [
  'maxHealth', 'speed', 'might', 'cooldown', 'magSize', 'reloadSpeed', 'critChance'
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
    case 'magSize': return '装填数アップ';
    case 'reloadSpeed': return 'リロード時間短縮';
    case 'critChance': return 'クリティカル率アップ';
    case 'area': return '効果範囲アップ';
    case 'duration': return '効果時間延長';
    default: return '不明なアップグレード';
  }
};

export const getPassiveDescription = (type: PassiveType): string => {
  switch (type) {
    case 'maxHealth': return '最大体力が10ポイント増加します';
    case 'speed': return '移動速度が5%向上します';
    case 'might': return '銃・近接のダメージが6%増加します';
    case 'cooldown': return '銃の発射間隔が5%短縮されます';
    case 'magSize': return '全ての銃の装填数が増加します';
    case 'reloadSpeed': return '全ての銃のリロード時間が短縮されます';
    case 'critChance': return 'クリティカル率が3%上昇します';
    default: return '不明なアップグレード';
  }
};

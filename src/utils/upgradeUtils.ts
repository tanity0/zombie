import { UpgradeOption, Player, WeaponType, PassiveType } from '../types/game';
import { getWeaponDisplayName, getWeaponDescription } from './weaponUtils';

// Generate a list of upgrade options for the player to choose from
export const generateUpgradeOptions = (player: Player): UpgradeOption[] => {
  const options: UpgradeOption[] = [];
  const weaponTypes: WeaponType[] = ['knife', 'axe', 'wand', 'whip', 'bible', 'garlic'];
  const passiveTypes: PassiveType[] = ['maxHealth', 'speed', 'might', 'area', 'cooldown', 'duration', 'amount'];
  
  // Add weapon upgrades
  const playerWeaponTypes = player.weapons.map(w => w.type);
  
  // First, add options to upgrade existing weapons
  player.weapons.forEach(weapon => {
    // Limit weapon levels to 8
    if (weapon.level < 8) {
      options.push({
        id: `upgrade-${weapon.type}-${weapon.level + 1}`,
        name: `${getWeaponDisplayName(weapon.type)} レベル${weapon.level + 1}`,
        description: getWeaponDescription(weapon.type, weapon.level + 1),
        type: 'weapon',
        weaponType: weapon.type,
        level: weapon.level + 1
      });
    }
  });
  
  // Then, add options for new weapons
  const availableNewWeapons = weaponTypes.filter(type => !playerWeaponTypes.includes(type));
  
  // Randomly select up to 2 new weapons
  const shuffled = availableNewWeapons.sort(() => 0.5 - Math.random());
  const selectedNewWeapons = shuffled.slice(0, Math.min(2, availableNewWeapons.length));
  
  selectedNewWeapons.forEach(weaponType => {
    options.push({
      id: `new-${weaponType}`,
      name: getWeaponDisplayName(weaponType),
      description: getWeaponDescription(weaponType, 1),
      type: 'weapon',
      weaponType,
      level: 1
    });
  });
  
  // Add passive upgrades
  const shuffledPassives = passiveTypes.sort(() => 0.5 - Math.random());
  const selectedPassives = shuffledPassives.slice(0, 2); // Pick 2 random passive upgrades
  
  selectedPassives.forEach(passiveType => {
    options.push({
      id: `passive-${passiveType}`,
      name: getPassiveDisplayName(passiveType),
      description: getPassiveDescription(passiveType),
      type: 'passive',
      passiveType,
      level: 1
    });
  });
  
  // If we don't have enough options, add more passive upgrades
  while (options.length < 3) {
    const remaining = passiveTypes.filter(type => !selectedPassives.includes(type));
    if (remaining.length === 0) break;
    
    const nextPassive = remaining[Math.floor(Math.random() * remaining.length)];
    selectedPassives.push(nextPassive);
    
    options.push({
      id: `passive-${nextPassive}`,
      name: getPassiveDisplayName(nextPassive),
      description: getPassiveDescription(nextPassive),
      type: 'passive',
      passiveType: nextPassive,
      level: 1
    });
  }
  
  // Shuffle options and return 3
  return options.sort(() => 0.5 - Math.random()).slice(0, 3);
};

// Get passive upgrade display name
export const getPassiveDisplayName = (type: PassiveType): string => {
  switch (type) {
    case 'maxHealth': return '最大体力アップ';
    case 'speed': return '移動速度アップ';
    case 'might': return 'ダメージ強化';
    case 'area': return '効果範囲アップ';
    case 'cooldown': return 'クールダウン短縮';
    case 'duration': return '効果時間延長';
    case 'amount': return '発射数アップ';
    default: return '不明なアップグレード';
  }
};

// Get passive upgrade description
export const getPassiveDescription = (type: PassiveType): string => {
  switch (type) {
    case 'maxHealth': return '最大体力が20ポイント増加します';
    case 'speed': return '移動速度が10%向上します';
    case 'might': return 'すべての武器のダメージが10%増加します';
    case 'area': return 'すべての武器の効果範囲が10%増加します';
    case 'cooldown': return '武器のクールダウンが8%短縮されます';
    case 'duration': return '効果時間が15%延長されます';
    case 'amount': return '該当する武器の発射数が増加します';
    default: return '不明なアップグレード';
  }
};
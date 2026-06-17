import { UpgradeOption, Player, PassiveType } from '../types/game';

// レベルアップはパッシブ強化のみ(社長指示)。サブウェポンの強化/新規取得はレベルアップでは起きず、
// 武器商人での購入・装備選択に一本化。各パッシブは1回効果＋個別上限(最大取得回数)を持つ。
const PASSIVE_POOL: PassiveType[] = [
  'maxHealth', 'speed', 'might', 'cooldown', 'magSize',
  'reloadSpeed', 'critChance', 'stunDuration', 'ammoDrop', 'scrapGain'
];

// 各パッシブの取得回数上限(後で調整しやすいよう定数化)。
const PASSIVE_CAP: Record<PassiveType, number> = {
  maxHealth: 5,
  speed: 3,
  might: 5,
  cooldown: 5,
  magSize: 5,
  reloadSpeed: 5,
  critChance: 5,
  stunDuration: 3,
  ammoDrop: 3,
  scrapGain: 5,
  // 廃止済み(提示しない)。型網羅のため 0。
  area: 0,
  duration: 0,
};

export const generateUpgradeOptions = (player: Player): UpgradeOption[] => {
  // 上限に達していないパッシブだけを候補にしてシャッフル→最大3枚。
  const counts = player.passiveCounts ?? {};
  const available = PASSIVE_POOL.filter(type => (counts[type] ?? 0) < PASSIVE_CAP[type]);
  const picks = [...available].sort(() => 0.5 - Math.random()).slice(0, 3);

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
    case 'stunDuration': return '気絶時間アップ';
    case 'ammoDrop': return '弾薬ドロップ率アップ';
    case 'scrapGain': return 'スクラップ獲得数アップ';
    case 'area': return '効果範囲アップ';
    case 'duration': return '効果時間延長';
    default: return '不明なアップグレード';
  }
};

export const getPassiveDescription = (type: PassiveType): string => {
  switch (type) {
    case 'maxHealth': return '最大体力が30ポイント増加します';
    case 'speed': return '移動速度が10%向上します';
    case 'might': return '銃・近接のダメージが20%増加します';
    case 'cooldown': return '銃の発射間隔が5%短縮されます（下限80ms）';
    case 'magSize': return 'マガジンが20%増加します（最低+1）';
    case 'reloadSpeed': return '全ての銃のリロード時間が短縮されます';
    case 'critChance': return 'クリティカル率が3%上昇します';
    case 'stunDuration': return '敵の気絶（フィニッシュ受付）時間が20%延びます';
    case 'ammoDrop': return '弾薬ドロップ率が10%上昇します';
    case 'scrapGain': return 'スクラップ獲得数が30%増加します';
    default: return '不明なアップグレード';
  }
};

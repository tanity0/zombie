import { UpgradeOption, Player, PassiveType } from '../types/game';
import { HUNTING_MELEE_RADIUS_BONUS_BY_LEVEL, huntingChargeSecondsLabel } from '../config/hunting';

// RE rework: level-ups only strengthen the survivor. New weapons come from
// world drops and crates, never the level-up menu — so every option here is
// a passive stat boost.
const PASSIVE_POOL: PassiveType[] = [
  'maxHealth', 'speed', 'might', 'cooldown', 'magSize', 'reloadSpeed', 'critChance'
];

export const generateUpgradeOptions = (player: Player): UpgradeOption[] => {
  const subWeaponOptions: UpgradeOption[] = [];
  const grenadeLevel = player.subWeaponLevels['heavy-grenade'] ?? 0;
  const trapLevel = player.subWeaponLevels['marksman-trap'] ?? 0;
  const quickMagLevel = player.subWeaponLevels['striker-quick-mag'] ?? 0;
  const huntingLevel = player.subWeaponLevels['striker-hunting'] ?? 0;
  // 刀/村雨装備中は他のサブウェポンカードをレベルアップに出さない(併用不可、
  // 許可制で解禁予定)。刀自体の強化カード・村雨カードは引き続き出る。
  const ownsKatana = player.subWeapons.includes('katana') || player.subWeapons.includes('murasame');

  if (!ownsKatana && player.characterClass === 'warrior' && grenadeLevel < 3) {
    const nextLevel = grenadeLevel + 1;
    subWeaponOptions.push({
      id: 'subweapon-heavy-grenade',
      name: nextLevel === 1 ? '手榴弾' : `手榴弾 Lv${nextLevel}`,
      description: `${nextLevel}方向へ手榴弾を転がし、小範囲に爆発ダメージを与えます`,
      type: 'subWeapon',
      subWeaponKey: 'heavy-grenade',
      level: nextLevel
    });
  }

  if (!ownsKatana && player.characterClass === 'mage' && trapLevel < 3) {
    const nextLevel = trapLevel + 1;
    subWeaponOptions.push({
      id: 'subweapon-marksman-trap',
      name: nextLevel === 1 ? 'トラップ' : `トラップ Lv${nextLevel}`,
      description: `足元に罠を設置。踏んだ敵を3秒止めます（最大${nextLevel}体）`,
      type: 'subWeapon',
      subWeaponKey: 'marksman-trap',
      level: nextLevel
    });
  }

  if (!ownsKatana && player.characterClass === 'necromancer' && quickMagLevel < 3) {
    const nextLevel = quickMagLevel + 1;
    const cooldown = 12 - nextLevel * 2;
    subWeaponOptions.push({
      id: 'subweapon-striker-quick-mag',
      name: nextLevel === 1 ? 'クイックマガジン' : `クイックマガジン Lv${nextLevel}`,
      description: `${cooldown}秒ごとに少し離れた位置へマガジンを投げます。拾うと即リロードします`,
      type: 'subWeapon',
      subWeaponKey: 'striker-quick-mag',
      level: nextLevel
    });
  }

  if (!ownsKatana && player.characterClass === 'rogue' && huntingLevel < 3) {
    const nextLevel = huntingLevel + 1;
    const chargeSeconds = huntingChargeSecondsLabel(nextLevel);
    const radiusBonus = HUNTING_MELEE_RADIUS_BONUS_BY_LEVEL[nextLevel];
    subWeaponOptions.push({
      id: 'subweapon-striker-hunting',
      name: nextLevel === 1 ? 'ハンティング' : `ハンティング Lv${nextLevel}`,
      description: `${chargeSeconds}秒入力すると次の近接攻撃の範囲が+${radiusBonus}広がります`,
      type: 'subWeapon',
      subWeaponKey: 'striker-hunting',
      level: nextLevel
    });
  }

  // 刀は全クラス共通の通常サブウェポンカード。
  // TODO(刀): クラス限定にする場合はここを class 条件付きに変える。
  const katanaCardLevel = player.subWeaponLevels['katana'] ?? 0;
  const ownsMurasame = player.subWeapons.includes('murasame');
  if (katanaCardLevel < 3) {
    const nextLevel = katanaCardLevel + 1;
    subWeaponOptions.push({
      id: 'subweapon-katana',
      name: nextLevel === 1 ? '刀' : `刀 Lv${nextLevel}`,
      description: '銃とナイフの代わりに周囲の敵を自動で斬る。フリック/方向キー二連打で一閃ダッシュ',
      type: 'subWeapon',
      subWeaponKey: 'katana',
      level: nextLevel
    });
  } else if (!ownsMurasame) {
    // 刀がLv3に達したら、刀カードの代わりに上位の「村雨」を提示する。
    subWeaponOptions.push({
      id: 'subweapon-murasame',
      name: '村雨',
      description: '刀の上位。弾の打ち返しと一閃のクールダウンが無く連発可能（発動中の動作はキャンセル不可）。刀身はシルバー',
      type: 'subWeapon',
      subWeaponKey: 'murasame',
      level: 1
    });
  }

  // デコイは全クラス共通の通常サブウェポン。刀/村雨装備中は出さない(併用不可)。
  const decoyLevel = player.subWeaponLevels['decoy'] ?? 0;
  if (!ownsKatana && decoyLevel < 3) {
    const nextLevel = decoyLevel + 1;
    const durationSec = 4 + nextLevel; // Lv1=5s, Lv2=6s, Lv3=7s
    subWeaponOptions.push({
      id: 'subweapon-decoy',
      name: nextLevel === 1 ? 'デコイ' : `デコイ Lv${nextLevel}`,
      description: `進行方向へ円盤を投げる。設置中${durationSec}秒、0.5秒ごとに射程内の敵弾を1発迎撃`,
      type: 'subWeapon',
      subWeaponKey: 'decoy',
      level: nextLevel
    });
  }

  // 設置型シールドは全クラス共通の通常サブウェポン。刀/村雨装備中は出さない(併用不可)。
  const shieldLevel = player.subWeaponLevels['shield'] ?? 0;
  if (!ownsKatana && shieldLevel < 3) {
    const nextLevel = shieldLevel + 1;
    const hp = [0, 2, 4, 6][nextLevel]; // 耐久(Lv1=2/Lv2=4/Lv3=6)
    subWeaponOptions.push({
      id: 'subweapon-shield',
      name: nextLevel === 1 ? 'シールド' : `シールド Lv${nextLevel}`,
      description: `進行方向の反対側に遮蔽壁を設置。敵の通行を止め敵弾を消す（味方弾は貫通）。5秒ごと/5秒持続/耐久${hp}`,
      type: 'subWeapon',
      subWeaponKey: 'shield',
      level: nextLevel
    });
  }

  // Shuffle the pool and take 3 distinct passives.
  const shuffled = [...PASSIVE_POOL].sort(() => 0.5 - Math.random());
  const picks = shuffled.slice(0, 3 - subWeaponOptions.length);

  return [
    ...subWeaponOptions,
    ...picks.map(passiveType => ({
      id: `passive-${passiveType}`,
      name: getPassiveDisplayName(passiveType),
      description: getPassiveDescription(passiveType),
      type: 'passive' as const,
      passiveType,
      level: 1
    }))
  ];
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
    case 'maxHealth': return '最大体力が30ポイント増加します';
    case 'speed': return '移動速度が5%向上します';
    case 'might': return '銃・近接のダメージが20%増加します';
    case 'cooldown': return '銃の発射間隔が5%短縮されます';
    case 'magSize': return '全ての銃の装填数が増加します';
    case 'reloadSpeed': return '全ての銃のリロード時間が短縮されます';
    case 'critChance': return 'クリティカル率が3%上昇します';
    default: return '不明なアップグレード';
  }
};

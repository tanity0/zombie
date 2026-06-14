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
  // ダンスフロア(shijin)も刀と同じく排他: 装備中は他の通常サブウェポンを出さない(銃のみ共存)。
  const ownsShijin = player.subWeapons.includes('shijin');
  // 通常サブウェポン(鞭/シールド/タレット/錬金/デコイ/各クラス技)は、排他サブ(刀 or ダンスフロア)装備中は出さない。
  const blockNormalSubs = ownsKatana || ownsShijin;
  // スキル(=排他を除く通常サブウェポン)はゲーム全体で2つまで。刀/村雨/ダンスフロアはこの上限から除外。
  // 既に持っているスキルの昇格は常に可。新規取得は所持数が2未満のときだけ。
  const EXCLUSIVE_SUBS: string[] = ['katana', 'murasame', 'shijin'];
  const ownedSkillCount = player.subWeapons.filter(k => !EXCLUSIVE_SUBS.includes(k)).length;
  const atSkillCap = ownedSkillCount >= 2;
  const canNewSkill = (lvl: number) => lvl > 0 || !atSkillCap; // lvl>0=既所持(昇格)、それ以外は上限チェック

  if (!blockNormalSubs && player.characterClass === 'warrior' && canNewSkill(grenadeLevel) && grenadeLevel < 3) {
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

  if (!blockNormalSubs && player.characterClass === 'mage' && canNewSkill(trapLevel) && trapLevel < 3) {
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

  if (!blockNormalSubs && player.characterClass === 'necromancer' && canNewSkill(quickMagLevel) && quickMagLevel < 3) {
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

  if (!blockNormalSubs && player.characterClass === 'rogue' && canNewSkill(huntingLevel) && huntingLevel < 3) {
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

  // 刀は全クラス共通の通常サブウェポンカード。ダンスフロア(shijin)装備中は出さない(刀↔ダンスフロアも排他)。
  // TODO(刀): クラス限定にする場合はここを class 条件付きに変える。
  const katanaCardLevel = player.subWeaponLevels['katana'] ?? 0;
  const ownsMurasame = player.subWeapons.includes('murasame');
  if (!ownsShijin && katanaCardLevel < 3) {
    const nextLevel = katanaCardLevel + 1;
    subWeaponOptions.push({
      id: 'subweapon-katana',
      name: nextLevel === 1 ? '刀' : `刀 Lv${nextLevel}`,
      description: '銃とナイフの代わりに周囲の敵を自動で斬る。フリック/方向キー二連打で一閃ダッシュ',
      type: 'subWeapon',
      subWeaponKey: 'katana',
      level: nextLevel
    });
  } else if (!ownsShijin && !ownsMurasame) {
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
  if (!blockNormalSubs && canNewSkill(decoyLevel) && decoyLevel < 3) {
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
  if (!blockNormalSubs && canNewSkill(shieldLevel) && shieldLevel < 3) {
    const nextLevel = shieldLevel + 1;
    const hp = [0, 10, 30, 60][nextLevel]; // 耐久(Lv1=10/Lv2=30/Lv3=60)
    subWeaponOptions.push({
      id: 'subweapon-shield',
      name: nextLevel === 1 ? 'シールド' : `シールド Lv${nextLevel}`,
      description: `進行方向の反対側に遮蔽壁を設置。触れた敵を弾き返し敵弾を消す（味方弾は貫通）。5秒ごと/5秒持続/耐久${hp}（敵接触・敵弾で各1減）`,
      type: 'subWeapon',
      subWeaponKey: 'shield',
      level: nextLevel
    });
  }

  // 鞭は全クラス共通の通常サブウェポン。刀/村雨装備中は出さない(併用不可=排他)。
  const whipLvl = player.subWeaponLevels['whip'] ?? 0;
  if (!blockNormalSubs && canNewSkill(whipLvl) && whipLvl < 3) {
    const nextLevel = whipLvl + 1;
    subWeaponOptions.push({
      id: 'subweapon-whip',
      name: nextLevel === 1 ? '鞭' : `鞭 Lv${nextLevel}`,
      description: '通常の近接を鞭に置換。進行方向へ大きくノックバックして避難路を作る。20ヒットで次の一振りがハリケーン（敵を吸引）',
      type: 'subWeapon',
      subWeaponKey: 'whip',
      level: nextLevel
    });
  }

  // 錬金術は全クラス共通の通常サブウェポン。刀/村雨装備中は出さない(併用不可=排他)。
  const alchemyLvl = player.subWeaponLevels['alchemy'] ?? 0;
  if (!blockNormalSubs && canNewSkill(alchemyLvl) && alchemyLvl < 3) {
    const nextLevel = alchemyLvl + 1;
    const hp = [0, 50, 70, 100][nextLevel];
    subWeaponOptions.push({
      id: 'subweapon-alchemy',
      name: nextLevel === 1 ? '錬金術' : `錬金術 Lv${nextLevel}`,
      description: `5秒立ち止まると魔法陣が完成し味方ゾンビを召喚(HP${hp}・最大3体・囮/壁)。10%でレア(死神)が出てハリケーン吸引(10秒)`,
      type: 'subWeapon',
      subWeaponKey: 'alchemy',
      level: nextLevel
    });
  }

  // 自動タレットは全クラス共通の通常サブウェポン。刀/村雨装備中は出さない(併用不可)。
  const turretLvl = player.subWeaponLevels['turret'] ?? 0;
  if (!blockNormalSubs && canNewSkill(turretLvl) && turretLvl < 3) {
    const nextLevel = turretLvl + 1;
    subWeaponOptions.push({
      id: 'subweapon-turret',
      name: nextLevel === 1 ? '自動タレット' : `自動タレット Lv${nextLevel}`,
      description: '10秒ごとに前方へ自動設置。留まって5秒オート射撃(前方集中=SMG相当の長射程)。叩くと全方位(ハンドガン相当)へ切替。10%でグレネード弾、消滅時に小爆発',
      type: 'subWeapon',
      subWeaponKey: 'turret',
      level: nextLevel
    });
  }

  // ダンスフロア(shijin)は刀と同じ排他サブウェポン。刀/村雨装備中は出さない。owns時は自分の強化のため出す
  // (排他=他サブをブロックするのは ownsShijin 側。ここは自分の昇格カードなので blockNormalSubs では絞らない)。
  const shijinLvl = player.subWeaponLevels['shijin'] ?? 0;
  if (!ownsKatana && shijinLvl < 3) {
    const nextLevel = shijinLvl + 1;
    subWeaponOptions.push({
      id: 'subweapon-shijin',
      name: nextLevel === 1 ? 'ダンスフロア' : `ダンスフロア Lv${nextLevel}`,
      description: '立ち止まるとダンスフロア(リズムモード)。ジャストにタップ/フリック。フリック4本パターンで四神技（朱雀/玄武/青龍/白虎）、4回成功で全体フィニッシュ。外すとコンボリセット。銃以外のサブと併用不可',
      type: 'subWeapon',
      subWeaponKey: 'shijin',
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

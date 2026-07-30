// BOT_AND_GHOST.md §2.11 裁定1(社長2026-07-30「攻撃力の基準=計測時のステータス・ビルドをそのまま
// 再現」)の共有部品。**記録側(playerTraits.ts)と消費側(ghostBuild.ts)が同じ1枚の変換を使う**ため、
// store/PixiJS非依存(型importのみ)の純関数だけをここに置く=ヘッドレスでテストできる。
//
// ドクトリン(§2.11補足「写すな、共通化しろ」):
//   ダメージ倍率・クリ率の式は既存のプレイヤー用純関数(skillCritMult/skillOutgoingDamageMult/
//   scavengerGunMult/…)を**そのまま使い回す**。そのために「計測時ビルドを着せた疑似Player」を1枚作り、
//   同じ関数へ渡す(式の複製は書かない)。その疑似Playerを作るのが buildPseudoPlayer。
//
// 武器(weapons/activeWeaponId)の復元だけは createWeapon(weaponUtils→gameStore)が必要でここには
// 置けない(headless縛り)。武器を載せる最後の一手は ghostBuild.ts が担当する。
import type { Player, PlayerBuildSnapshot } from '../types/game';

/**
 * 現在のプレイヤーから「ビルドの写し」を1枚取る(純粋なコピー=生きた参照を持たない。
 * CLAUDE.md 実装精度の規律3)。旧snapshot(maxHealth/speed/level)の上位互換。
 * phill=そのランのPHILL計測(発射数/ヘッドショット数)。母数0なら率は載せない(=未記録)。
 */
export const snapshotPlayerBuild = (
  p: Player,
  phill?: { shots: number; headshots: number },
): PlayerBuildSnapshot => {
  const guns = p.weapons.filter(w => !w.isMelee);
  const active = guns.find(w => w.id === p.activeWeaponId) ?? guns[0];
  const melee = p.weapons.find(w => w.isMelee);
  return {
    maxHealth: p.maxHealth,
    speed: p.speed,
    level: p.level,
    gunKeys: guns.map(w => w.key).filter((k): k is string => k !== undefined),
    activeGunKey: active?.key,
    meleeKey: melee?.key,
    skills: [...p.skills],
    skillLevels: { ...p.skillLevels },
    equipment: { ...p.equipment },
    equipBonus: { ...p.equipBonus },
    critChance: p.critChance,
    subWeapons: [...p.subWeapons],
    subWeaponLevels: { ...p.subWeaponLevels },
    characterClass: p.characterClass,
    ...(phill && phill.shots > 0
      ? { phillShots: phill.shots, phillHeadshots: phill.headshots, phillHeadshotRate: phill.headshots / phill.shots }
      : {}),
  };
};

/** そのスナップショットが武器ロードアウトを持つか(=「計測時ビルドで戦う」が成立するか)。 */
export const buildHasLoadout = (snap: PlayerBuildSnapshot | undefined): boolean =>
  snap !== undefined && Array.isArray(snap.gunKeys) && snap.meleeKey !== undefined;

/**
 * 既存のプレイヤー用純関数へ渡すための「疑似Player」。live(召喚時点の本人)を土台に、
 * **ビルドに属する項目だけ**スナップショットで上書きする。スナップショットに無い項目(旧プロファイル)は
 * liveの値をそのまま使う=従来の「今のプレイヤー値を借用」へ自然にフォールバックする。
 *
 * 中立化する項目(=ビルドではなく「その瞬間のプレイヤーのバフ窓」):
 *   quickMagCritUntil / benkeiBuffUntil / scavengerBuffUntil / knifeCombo* は0にする。
 *   ゴーストは弾薬を拾わず武器も持ち替えないので、これらの窓は本人のものを流用してはいけない
 *   (本人のバフがゴーストに乗る=ビルド再現ではなく二重取りになる)。関数自体は共通のまま通すので、
 *   将来ゴースト側でこれらの窓を持たせれば同じ式でそのまま効く。
 * ※weapons/activeWeaponIdはここでは触らない(createWeaponが必要=ghostBuild.tsが被せる)。
 * ※x/y/width/height/health は「実体(ゴースト)側の値」で上書きして使う(位置依存のスナイパー倍率・
 *   失HP依存のバーサーカー倍率が実体基準になる)。上書きは ghostBuild.ts の ghostActorPlayer。
 */
export const buildPseudoPlayer = (snap: PlayerBuildSnapshot | undefined, live: Player): Player => {
  if (!snap) return live;
  return {
    ...live,
    maxHealth: snap.maxHealth,
    speed: snap.speed,
    level: snap.level,
    characterClass: snap.characterClass ?? live.characterClass,
    skills: snap.skills ?? live.skills,
    skillLevels: snap.skillLevels ?? live.skillLevels,
    equipment: snap.equipment ?? live.equipment,
    equipBonus: snap.equipBonus ?? live.equipBonus,
    critChance: snap.critChance ?? live.critChance,
    subWeapons: snap.subWeapons ?? live.subWeapons,
    subWeaponLevels: snap.subWeaponLevels ?? live.subWeaponLevels,
    // 一時バフ窓の中立化(上のコメント参照)。
    quickMagCritUntil: 0,
    benkeiBuffUntil: 0,
    scavengerBuffUntil: 0,
    knifeComboCount: 0,
    knifeComboUntil: 0,
  };
};

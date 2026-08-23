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
import type { CharacterClass, Player, PlayerBuildSnapshot, Summon } from '../types/game';
import type { AvatarId } from '../data/avatars';
// ★research/SAME_ARENA.md §4-c(社長方針2026-08-23「持つべき情報はビルド」): 記録から**引ける数値は
// 引く**ために、今の数値表(クラス表・装備表)をここで参照する。どちらも data の葉=循環なし。
import { PLAYER_PROFILES } from '../data/playerProfiles';
import { aggregateEquipBonus, equipMaxHealthOf } from '../data/equipment';

/**
 * 同行守護霊の写し(BOT_AND_GHOST.md §2.15「討伐に付き合ってくれた人のビルドとステータス」/
 * §2.16 A「ClearedSlotに同行者名+ビルド写し」)。**持ち主の名前+その守護霊が使っていたビルド**だけを
 * 持つ(位置・HP等の実体の状態は入れない=記録として残す価値があるのは"誰の・どんなビルドか"だから)。
 * 将来オンラインで他人の守護霊が下りてきた時も同じ器で通る(名前=他人の名前・isOwn=false)。
 */
export interface GhostAllySnapshot {
  /** 守護霊の持ち主の名前(Summon.ghostName=プロファイルsrcName由来)。 */
  name: string;
  /** その守護霊のビルド写し(欠損=旧プロファイル由来で計測時ビルドが無い)。 */
  build?: PlayerBuildSnapshot;
  /** 絵の選択に使っているクラス(Summon.ghostClass)。カードのアイコン用。 */
  className?: CharacterClass;
  /** 自分のプロファイル由来か(オフラインは常にtrue。オンラインで他人の霊が来たらfalse)。 */
  isOwn?: boolean;
}

/** 場に居る同行守護霊(kind='ghost-ally')。居なければ undefined。 */
export const findGhostAlly = (summons: readonly Summon[]): Summon | undefined =>
  summons.find(s => s.kind === 'ghost-ally');

/**
 * 同行守護霊の写しを1枚取る(純粋なコピー=生きた参照を持たない)。名前が無い(=ghost-allyでない/
 * 不在)なら null=「同行者なし」。記録側(playerTraits.notifyBossClear)とリザルト表示側(store.ghostAlly)が
 * **同じ1枚の変換**を使う(§2.11補足「写すな、共通化しろ」)。
 */
export const ghostAllySnapshot = (ghost: Summon | undefined | null): GhostAllySnapshot | null => {
  if (!ghost || ghost.kind !== 'ghost-ally' || !ghost.ghostName) return null;
  return {
    name: ghost.ghostName,
    ...(ghost.ghostBuild ? { build: { ...ghost.ghostBuild } } : {}),
    ...(ghost.ghostClass ? { className: ghost.ghostClass } : {}),
    ...(ghost.ghostIsOwn !== undefined ? { isOwn: ghost.ghostIsOwn } : {}),
  };
};

/**
 * 現在のプレイヤーから「ビルドの写し」を1枚取る(純粋なコピー=生きた参照を持たない。
 * CLAUDE.md 実装精度の規律3)。旧snapshot(maxHealth/speed/level)の上位互換。
 * phill=そのランのPHILL計測(発射数/ヘッドショット数)。母数0なら率は載せない(=未記録)。
 * avatarId=記録時に選択していたアバター(gameStore.avatarId・視覚のみ)。省略/undefinedはnullとして
 * 記録する(=「アバターなし」。呼び出し側がstoreへアクセスできない旧経路/テストの後方互換)。
 */
export const snapshotPlayerBuild = (
  p: Player,
  phill?: { shots: number; headshots: number },
  avatarId?: AvatarId | null,
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
    magBonus: p.magBonus,
    reloadMult: p.reloadMult,
    subWeapons: [...p.subWeapons],
    subWeaponLevels: { ...p.subWeaponLevels },
    characterClass: p.characterClass,
    // research/GROWTH.md v4: 育成(攻撃力)も「計測時のビルド」の一部として記録する。
    // 記録側と消費側(buildPseudoPlayer)は同じ1枚の変換=片側だけ足すと永久にundefinedになる。
    growthAtkMult: p.growthAtkMult,
    avatarId: avatarId ?? null,
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
 * 素通しにする項目(=中立化漏れではなく**意図して本人の値を乗せている**もの):
 *   育成の焼き値のうち growthAmmoMax / growthGoldMult / ddaBaseHp は上書きしない。守護霊は
 *   リザーブ∞で撃ち(弾上限を読む先が無い)・ゴールドを配らず・PPを持たないので、どれも読まれない。
 *   写すのは growthAtkMult(=ダメージ式が実際に読む1つ)だけ。
 * ※weapons/activeWeaponIdはここでは触らない(createWeaponが必要=ghostBuild.tsが被せる)。
 * ※x/y/width/height/health は「実体(ゴースト)側の値」で上書きして使う(位置依存のスナイパー倍率・
 *   失HP依存のバーサーカー倍率が実体基準になる)。上書きは ghostBuild.ts の ghostActorPlayer。
 */
export const buildPseudoPlayer = (snap: PlayerBuildSnapshot | undefined, live: Player): Player => {
  if (!snap) return live;
  // ★★research/SAME_ARENA.md §4-c(社長方針2026-08-23):
  // 「**持つべき情報はビルドであって、何を持ってるのか?さえ分かれば、あとはゲーム内の規定数値に
  //   変換すればいいだけ。後から数値仕様が変わっても勝手に揃うはず**」
  //
  // ⇒ **持ち物(クラス・装備・スキル・武器の識別子)から引ける数値は、記録の値を信じず"今の表"から引く。**
  // 記録に焼かれた数値は**識別子が欠けている旧データのフォールバック**としてだけ使う。
  //
  // これが無いと何が起きるか(実例・v0.25.3854で社長が発見): 固定守護霊の記録は
  // `maxHealth = 120 + 装備` で焼かれていたが、**プレイヤーの実際の初期HPは 130**
  // (`PLAYER_PROFILES[class].maxHp`)。**記録が数値を持っていたせいで、基準値が動いた事実に
  // 追随できず10ズレたまま固まっていた。** 下の導出にすると、この種のズレは**構造的に起きない**。
  const equipment = snap.equipment ?? live.equipment;
  const cls = snap.characterClass ?? live.characterClass;
  const classMaxHp = cls ? PLAYER_PROFILES[cls]?.maxHp : undefined;
  // 装備の効果は**100%持ち物から引ける**(記録のequipBonusは信じない=改造耐性にもなる)。
  const derivedEquipBonus = snap.equipment ? aggregateEquipBonus(snap.equipment) : undefined;
  // 最大HP=クラスの素のHP+装備のHP加算。クラスが判らない旧データだけ記録の数値へ落ちる。
  // ※永続強化(育成)のHP加算は**この式に含めない**——別軸で、かつ社長裁定2026-08-23で保留中。
  const derivedMaxHealth = classMaxHp !== undefined && snap.equipment
    ? classMaxHp + equipMaxHealthOf(snap.equipment)
    : undefined;
  return {
    ...live,
    maxHealth: derivedMaxHealth ?? snap.maxHealth,
    speed: snap.speed,
    level: snap.level,
    characterClass: cls,
    skills: snap.skills ?? live.skills,
    skillLevels: snap.skillLevels ?? live.skillLevels,
    equipment,
    equipBonus: derivedEquipBonus ?? snap.equipBonus ?? live.equipBonus,
    critChance: snap.critChance ?? live.critChance,
    magBonus: snap.magBonus ?? live.magBonus,
    reloadMult: snap.reloadMult ?? live.reloadMult,
    subWeapons: snap.subWeapons ?? live.subWeapons,
    subWeaponLevels: snap.subWeaponLevels ?? live.subWeaponLevels,
    // research/GROWTH.md v4(社長裁定Q4): 育成(攻撃力)は計測時の値を復元する。欠損=旧データは 1.0(0段)。
    growthAtkMult: snap.growthAtkMult ?? 1,
    // 一時バフ窓の中立化(上のコメント参照)。
    quickMagCritUntil: 0,
    benkeiBuffUntil: 0,
    scavengerBuffUntil: 0,
    knifeComboCount: 0,
    knifeComboUntil: 0,
    // SKILL_BUILD_REDESIGN.md §23: 消費カード(実プレイヤー限定・ガチャ外)も同じ理由で中立化する。
    // 本人が取得したバフがゴーストにも乗ると二重取りになる(上のコメントと同じ原則)。
    consumableScrapUntil: 0,
    consumableAttackUntil: 0,
    consumableSpeedUntil: 0,
    consumableXpUntil: 0,
    consumableProtectionUntil: 0,
  };
};

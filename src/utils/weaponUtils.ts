import { Weapon, CharacterClass, WeaponType, Projectile, Player, Enemy, AmmoType } from '../types/game';
import { useGameStore, skillLevel, skillBenkeiCritBonus, scavengerGunMult, skillAttackShooterGunMult, skillLastMagazineMult, consumableAttackMult } from '../store/gameStore';
import { PLAYER_PROFILES } from '../data/playerProfiles';
import { aimEnemyDist2, isCorpse } from './enemyUtils';
import { zoomCompensatedWorldDistance } from './cameraZoom';
import { bigBulletSizeMult } from './skillEffectsB7';
import { isTrapDebuffed, TRAP_PVP_RELOAD_MULT } from './trapDebuff';

// プレイヤー中心→敵 の二乗距離。**全ての敵で「当たり判定の矩形の最近点」**まで測る(v0.25.3170・
// 社長指示「当たり判定の四隅でみて」)。中心基準だと巨体の縁に立っていても射程外扱いになる。
// v0.25.2567: 式の正本は enemyUtils.aimEnemyDist2 へ移設(守護霊の銃射程ゲートと同じ1本を使うため)。
const aimDist2 = aimEnemyDist2;

// Global muzzle-velocity multiplier. Bullets leave the barrel faster so shots
// feel snappier and reach their target sooner.
const PROJECTILE_SPEED_MULT = 1.5;
const SHOTGUN_SPREAD_CONE_RAD_BY_TIER: Record<number, number> = {
  1: 1.00,
  2: 0.70,
  3: 0.36,
};
const TIER_CRIT_STEP = 0.03;
const BASE_CRIT_BY_CATEGORY: Record<AmmoType, number> = {
  handgun: 0.10,
  shotgun: 0.05,
  rifle: 0.20,
  phill: 0, // PHILL銃のクリ(ヘッドショット)は命中位置で確定付与。基礎クリ率は0。
  glauncher: 0.20, // ライフル系準拠(v0.25.3290叩き台)
};

// ---------------------------------------------------------------------------
// Weapon catalog
// ---------------------------------------------------------------------------
// Three gun families (handgun / shotgun / rifle) × three tiers, plus three
// melee tiers. Guns auto-fire at the nearest enemy and burn ammo from their
// category pool; melee weapons are swung via the finger-release counter and
// cost no ammo. Tier raises power within a family.

interface WeaponDef {
  key: string;
  name: string;
  type: WeaponType;
  category?: AmmoType;
  tier: number;
  isMelee?: boolean;
  damage: number;
  cooldown: number;
  projectileSpeed?: number;
  projectileSize?: number;
  count?: number;        // bullets/pellets per shot
  passthrough?: boolean;
  magSize?: number;      // magazine capacity (rounds loaded); omit for melee
  reloadMs?: number;     // reload duration; heavier guns reload slower
  critChance?: number;   // fixed crit chance (melee weapons)
  pierce?: number;       // enemies the round passes through (piercing guns)
}

const CATALOG: Record<string, WeaponDef> = {
  // A — Handgun family (9mm). Fast, low damage, cheap to feed.
  'handgun-t1':       { key: 'handgun-t1', name: 'ハンドガン',     type: 'handgun', category: 'handgun', tier: 1, damage: 9,  cooldown: 420, projectileSpeed: 520, projectileSize: 8, count: 1, magSize: 12, reloadMs: 900 },
  'handgun-t2':       { key: 'handgun-t2', name: '二丁ハンドガン', type: 'handgun', category: 'handgun', tier: 2, damage: 9,  cooldown: 420, projectileSpeed: 520, projectileSize: 8, count: 2, magSize: 10, reloadMs: 1100 },
  // マシンピストルT3: 連射×大容量でクリ上振れ(16%)がバランスブレイカーだったため、純粋クリ率を5%に固定(加算分は別)。
  'handgun-t3':       { key: 'handgun-t3', name: 'マシンピストル', type: 'handgun', category: 'handgun', tier: 3, damage: 7,  cooldown: 100, projectileSpeed: 560, projectileSize: 7, count: 1, magSize: 30, reloadMs: 1300, critChance: 0.05 },

  // B — Shotgun family (12g). One trigger pull = one shell (the spread is free),
  // so the magazine is sized in SHOTS, not pellets (3 shots per mag).
  'shotgun-t1':       { key: 'shotgun-t1', name: 'ショットガン',   type: 'shotgun', category: 'shotgun', tier: 1, damage: 6,  cooldown: 950, projectileSpeed: 440, projectileSize: 7, count: 5, magSize: 3, reloadMs: 1100 },
  'shotgun-t2':       { key: 'shotgun-t2', name: 'ポンプ式',       type: 'shotgun', category: 'shotgun', tier: 2, damage: 7,  cooldown: 780, projectileSpeed: 470, projectileSize: 7, count: 6, magSize: 3, reloadMs: 1800 },
  'shotgun-t3':       { key: 'shotgun-t3', name: 'オートショット', type: 'shotgun', category: 'shotgun', tier: 3, damage: 6,  cooldown: 430, projectileSpeed: 480, projectileSize: 7, count: 7, magSize: 3, reloadMs: 1700 },

  // C — Rifle/Magnum family (.44). Heavy single rounds. The revolver pierces
  // one enemy; higher tiers pierce freely.
  'rifle-t1':         { key: 'rifle-t1',   name: 'マグナム',       type: 'rifle',   category: 'rifle',   tier: 1, damage: 30, cooldown: 800,  projectileSpeed: 700,  projectileSize: 9,  count: 1, magSize: 6, reloadMs: 1500, passthrough: true, pierce: 1 },
  'rifle-t2':         { key: 'rifle-t2',   name: 'スナイパー',     type: 'rifle',   category: 'rifle',   tier: 2, damage: 55, cooldown: 1100, projectileSpeed: 1000, projectileSize: 8,  count: 1, passthrough: true, magSize: 5, reloadMs: 2000 },
  // 社長指示v0.25.3291「スナイプのtier3入れ替え(グレネード被りなので廃止 爆発もしない)」:
  // 旧rifle-t3=グレネードランチャーは武器庫限定glauncher系と役割被りのため廃止し、スナイパー上位の
  // **対物ライフル**へ差し替え(爆発しない・貫通スナイパー)。数値は叩き台: t2スナイパー(55/1100)の上位。
  'rifle-t3':         { key: 'rifle-t3',   name: '対物ライフル',   type: 'rifle',   category: 'rifle',   tier: 3, damage: 110, cooldown: 1300, projectileSpeed: 1100, projectileSize: 9, count: 1, passthrough: true, magSize: 4, reloadMs: 2200 },

  // Melee (no ammo). Lower DPS than guns by design so bullets stay valuable.
  // Each carries a fixed crit chance that rises with tier. Tier はレベルアップ
  // 3枠目から段階的に強化される(knife-t1 → … → anti-mutant-knife-t5)。
  'knife-t1':         { key: 'knife-t1',   name: 'ナイフ',         type: 'knife',   tier: 1, isMelee: true, damage: 8,  cooldown: 0, critChance: 0.05 },
  'hatchet-t2':       { key: 'hatchet-t2', name: 'ダガー',         type: 'hatchet', tier: 2, isMelee: true, damage: 14, cooldown: 0, critChance: 0.08 },
  'machete-t3':       { key: 'machete-t3', name: 'ファイティングナイフ', type: 'machete', tier: 3, isMelee: true, damage: 22, cooldown: 0, critChance: 0.12 },
  'tactical-knife-t4':    { key: 'tactical-knife-t4',    name: 'タクティカルナイフ', type: 'tactical-knife',    tier: 4, isMelee: true, damage: 34, cooldown: 0, critChance: 0.18 },
  'anti-mutant-knife-t5': { key: 'anti-mutant-knife-t5', name: '対変異体ナイフ',     type: 'anti-mutant-knife', tier: 5, isMelee: true, damage: 50, cooldown: 0, critChance: 0.25 },

  // 研究所専用リボルバー「ＰＨＩＬＬ-銃」。狙って撃つ手動武器(自動射撃しない)。頭部命中で確定ヘッドショット、
  // 胴体は通常ダメージ＋2倍ノックバック。攻撃力2倍(社長指示)=ダメージ80。ステージ2敵HP2倍と釣り合う。射撃CD=1秒。
  'phill-revolver':   { key: 'phill-revolver', name: 'ＰＨＩＬＬ-銃', type: 'phill-bullet', category: 'phill', tier: 1, damage: 80, cooldown: 1000, projectileSpeed: 640, projectileSize: 9, count: 1, magSize: 6, reloadMs: 900 },

  // 社長指示v0.25.3290→訂正v0.25.3297: グレネード系銃器(第4枠)。**武器箱/敵ドロップから
  // 4カテゴリ目として普通に出る**(エリアTier率でt1〜t3)。武器庫のTier3化対象にも含む。
  // 弾はライフル弾共用。着弾爆発は旧rifle-t3と同じGRENADE経路(isGrenadeGunKeyで判定)。
  // 数値は叩き台: 旧グレネードランチャー(95/1400)を起点にtierで伸ばす。
  'glauncher-t1': { key: 'glauncher-t1', name: 'グレネードガン',   type: 'rifle', category: 'glauncher', tier: 1, damage: 85,  cooldown: 1500, projectileSpeed: 420, projectileSize: 14, count: 1, magSize: 3, reloadMs: 2200, passthrough: true },
  'glauncher-t2': { key: 'glauncher-t2', name: 'グレネードガンⅡ', type: 'rifle', category: 'glauncher', tier: 2, damage: 110, cooldown: 1350, projectileSpeed: 440, projectileSize: 15, count: 1, magSize: 4, reloadMs: 2100, passthrough: true },
  'glauncher-t3': { key: 'glauncher-t3', name: 'グレネードガンⅢ', type: 'rifle', category: 'glauncher', tier: 3, damage: 140, cooldown: 1200, projectileSpeed: 460, projectileSize: 16, count: 1, magSize: 5, reloadMs: 2000, passthrough: true }
};

const weaponBaseCritChance = (def: WeaponDef): number | undefined => {
  if (def.critChance !== undefined) return def.critChance; // 個別指定(近接, およびマシンピストルT3)を優先
  if (!def.category) return undefined;
  return BASE_CRIT_BY_CATEGORY[def.category] + Math.max(0, def.tier - 1) * TIER_CRIT_STEP;
};

export const GUN_KEYS_BY_CATEGORY: Record<AmmoType, string[]> = {
  handgun: ['handgun-t1', 'handgun-t2', 'handgun-t3'],
  shotgun: ['shotgun-t1', 'shotgun-t2', 'shotgun-t3'],
  rifle:   ['rifle-t1', 'rifle-t2', 'rifle-t3'],
  phill:   ['phill-revolver'], // 屋内固定銃。ドロップ/商人の銃ラインには出ない(weaponDrop は handgun/shotgun/rifle のみ抽選)。
  glauncher: ['glauncher-t1', 'glauncher-t2', 'glauncher-t3'] // v0.25.3297: 武器箱/ドロップの4カテゴリ目(DROP_CATEGORIES)。
};
// CRIT-UNIFY §9.4: 「プレイヤー直接武器」の銃10種(全カテゴリ合算)。着弾時ロール(トラップ+10%/
// 弱点+10%)をこの集合の弾だけに限定するための判定(escort/ghost-gun/タレット/ホーミング/跳弾/
// ジャンク等のサブ・味方系projectileは対象外=weaponKeyがこの集合に無い)。
// 既知の限界(★実装精度の規律1で明記): タレットの10%ランチャー弾とスキル「爆撃」(poi-bombing)の弾は
// GRENADE_WEAPON_KEY('rifle-t3')を発射元プレイヤーの経路ごと再借用しており(useGameLoop.ts)、
// weaponKeyだけでは実銃と区別できない(既存のスキル倍率適用等でも同様に区別していない=本バッチ由来の
// 新しい曖昧さではない)。この2つは着弾時ロール対象に紛れ込むが、critChanceを持たない(0扱い)ため
// このバッチが問題にしていた生成時crit boolean側には影響しない。
// v0.25.2514(GHOST-BUILD-1・§2.11訂正): 守護霊の銃弾('ghost-gun')も**この集合に含める**。
// 守護霊はプレイヤーの戦闘仕様の完全な写し(除外は演出/運用系の2群のみ)で、撃っている銃自体は
// この10種のいずれか=weaponKeyを'ghost-gun'にしているのは計測除外/ヘイト分離のための別名にすぎない。
// これでトラップ拘束+10%・弱点+10%の着弾ロールがプレイヤーと同じ条件で走る。
export const GHOST_GUN_WEAPON_KEY = 'ghost-gun';
// v0.25.2525(GHOST-REFLECT-MELEE-SUBS・台帳§4-1): 守護霊が**弾反射**で打ち返した弾の帰属キー。
// プレイヤーの反射弾(weaponKeyは元の敵弾のまま=undefined)と区別するためだけの別名で、飛翔特性・
// ダメージ倍率(REFLECT_DAMAGE_MULTIPLIER)・貫通なしはプレイヤーの反射と完全に同一。用途は3つ:
// ①計測除外(botTelemetry.classifyProjectileDamageChannel→null) ②ヘイト起因='ghost'
// ③倍率評価の主語=疑似Player(useGameLoopの弾ヒット処理)。**この集合(直接銃)には入れない**
// =着弾時ロール(トラップ+10%/弱点+10%)はプレイヤーの反射弾と同じく対象外。
export const GHOST_REFLECT_WEAPON_KEY = 'ghost-reflect';
const DIRECT_GUN_WEAPON_KEYS = new Set<string>([...Object.values(GUN_KEYS_BY_CATEGORY).flat(), GHOST_GUN_WEAPON_KEY]);
export const isDirectGunWeaponKey = (weaponKey: string | undefined): boolean =>
  weaponKey !== undefined && DIRECT_GUN_WEAPON_KEYS.has(weaponKey);
// Tier 昇順。MELEE_KEYS[tier] が「1段階上」のキー(tier は 1 始まり=0-indexed の次要素)。
export const MELEE_KEYS = ['knife-t1', 'hatchet-t2', 'machete-t3', 'tactical-knife-t4', 'anti-mutant-knife-t5'];
export const MAX_KNIFE_TIER = MELEE_KEYS.length; // = 5
// 現在のナイフTierから「1段階上」のキーを返す(Tier5以上は undefined)。
export const nextKnifeKey = (currentTier: number): string | undefined =>
  currentTier >= MAX_KNIFE_TIER ? undefined : MELEE_KEYS[currentTier];

// Player-state field name that holds the pool for a given ammo type.
export const AMMO_FIELD: Record<AmmoType, 'ammoHandgun' | 'ammoShotgun' | 'ammoRifle' | 'ammoPhill' | 'ammoGlauncher'> = {
  handgun: 'ammoHandgun',
  shotgun: 'ammoShotgun',
  rifle: 'ammoRifle',
  phill: 'ammoPhill',
  glauncher: 'ammoGlauncher' // ★v0.25.4000(社長指示「グレランは弾を分けて」): 独立プール化(旧: ammoRifle共用=v3290)
};

let weaponSeq = 0;
// Build a live Weapon instance from a catalog key.
export const createWeapon = (key: string): Weapon => {
  const def = CATALOG[key] ?? CATALOG['handgun-t1'];
  return {
    id: `weapon-${def.key}-${Date.now()}-${weaponSeq++}`,
    name: def.name,
    type: def.type,
    damage: def.damage,
    cooldown: def.cooldown,
    lastFired: 0,
    level: 1,
    projectileSpeed: def.projectileSpeed,
    projectileSize: def.projectileSize,
    count: def.count,
    passthrough: def.passthrough,
    magSize: def.magSize,
    magazine: def.magSize, // a fresh gun starts fully loaded
    reloadMs: def.reloadMs,
    critChance: weaponBaseCritChance(def),
    pierce: def.pierce,
    category: def.category,
    tier: def.tier,
    isMelee: def.isMelee,
    ammoType: def.category,
    key: def.key
  };
};

// All guns the player owns (excludes the melee weapon).
export const getGuns = (player: Player): Weapon[] =>
  player.weapons.filter(w => !w.isMelee);

// 武器keyの表示名(カタログが唯一の出どころ)。ビルドの写し(PlayerBuildSnapshot)には
// keyしか入っていないので、守護霊カード等の表示側はここから名前を引く(名前表を別に作らない)。
// 未知/欠損キーは '—'(記録が古くて武器が判らないケース)。
export const weaponDisplayName = (key: string | undefined | null): string =>
  (key ? CATALOG[key]?.name : undefined) ?? '—';

// The active gun: the one matching activeWeaponId, falling back to the first
// gun owned (or undefined if the player somehow has none).
export const getActiveGun = (player: Player): Weapon | undefined => {
  const guns = getGuns(player);
  return guns.find(w => w.id === player.activeWeaponId) ?? guns[0];
};

// §6.24-W(社長裁定v0.25.2533「武器庫は武器にして。全部tier3だった場合は返金されて終わり」):
// 武器庫で「Tier3へ昇格できる」銃カテゴリの列挙。銃はカテゴリごと1挺・高Tier優先(grantWeapon)
// なので、Tier3未満の所持カテゴリと未所持カテゴリが昇格対象。空配列=全カテゴリ最高位=返金ケース。
// v0.25.3297: glauncherも武器庫のTier3化対象に含める(通常入手は武器箱/ドロップ=社長訂正)。
export const ARMORY_GUN_CATEGORIES = ['handgun', 'shotgun', 'rifle', 'glauncher'] as const;
export type ArmoryGunCategory = typeof ARMORY_GUN_CATEGORIES[number];
export const armoryUpgradableGunCategories = (
  weapons: Pick<Weapon, 'isMelee' | 'category' | 'tier'>[],
): ArmoryGunCategory[] =>
  ARMORY_GUN_CATEGORIES.filter(cat => {
    const own = weapons.find(w => !w.isMelee && w.category === cat);
    return !own || (own.tier ?? 1) < 3;
  });

// v0.25.3297(社長訂正): グレネードガンの通常入手は**武器箱/敵ドロップ**(エリアTier率でt1〜t3)。
// 武器庫は従来の§6.24-W(Tier3未満カテゴリのTier3化・全て最高位なら返金)のまま、対象カテゴリに
// glauncherを含めた4カテゴリ。付与キーはカテゴリのTier3。
export const armoryGrantKeys = (
  weapons: Pick<Weapon, 'isMelee' | 'category' | 'tier'>[],
): string[] => armoryUpgradableGunCategories(weapons).map(cat => `${cat}-t3`);

// グレネード系の着弾爆発を起こす銃キーか(武器庫限定glauncher 3種のみ。旧rifle-t3は
// v0.25.3291で対物ライフル=非爆発へ入れ替え済み)。タレット/朱雀/爆撃の流用弾は
// weaponKey='glauncher-t1'(useGameLoopのGRENADE_WEAPON_KEY)を名乗ってこの経路に乗る。
export const isGrenadeGunKey = (key: string | undefined | null): boolean =>
  key === 'glauncher-t1' || key === 'glauncher-t2' || key === 'glauncher-t3';

// Player-state RESERVE pool value for an ammo type.
export const ammoPoolFor = (player: Player, type: AmmoType): number =>
  player[AMMO_FIELD[type]];

// Magazine capacity including the player's global 装填数アップ bonus.
export const effectiveMagSize = (w: Weapon, p: Player): number =>
  (w.magSize ?? 0) + (w.magSize != null ? p.magBonus : 0);

// Global reload-time multiplier — reloads take this much longer at baseline so
// being caught empty is a real commitment.
const RELOAD_TIME_MULT = 2;

// Reload duration including the global multiplier and the player's リロード時間
// 短縮 upgrade.
// 旧ウォームアップ(出撃60秒間リロード時間×0.80)は§23-1裁定で退役=削除済み。
export const effectiveReloadMs = (w: Weapon, p: Player): number =>
  // 装備(腕・取り回し系)のリロード短縮を乗算(中立=1)。
  // ★対人トラップ効果中は 1.5倍(社長指示2026-08-25・SAME_ARENA §3-g)。**下限250msはそのまま**
  // (掛けてから max を取る=短い銃でも必ず遅くなる、を保つ)。幻影の疑似Playerは
  // `trapDebuffUntil` を持たないので常に1倍=対人のみ。
  Math.max(250, (w.reloadMs ?? 0) * RELOAD_TIME_MULT * p.reloadMult * (p.equipBonus?.reloadMult ?? 1)
    * (isTrapDebuffed(p) ? TRAP_PVP_RELOAD_MULT : 1));

// 社長指示v0.25.3300 バーサーカー覚醒(Lv3): HP40%以下の間、銃の連射速度+10%(実効cooldown÷1.1)。
export const BERSERKER_AWAKEN_HP_FRAC = 0.4;
export const BERSERKER_AWAKEN_FIRE_RATE_MULT = 1.1;
export const berserkerAwakenFireRateMult = (p: Player): number =>
  skillLevel(p, 'berserker') >= 3 && p.maxHealth > 0 && p.health <= p.maxHealth * BERSERKER_AWAKEN_HP_FRAC
    ? BERSERKER_AWAKEN_FIRE_RATE_MULT
    : 1;

// 装備(腕)込みの実効発射間隔。プレイヤーと守護霊が同じ1本を使う。
export const effectiveFireCooldown = (w: Weapon, p: Player): number =>
  w.cooldown / ((p.equipBonus?.fireRateMult ?? 1) * berserkerAwakenFireRateMult(p));

// Is this specific gun currently mid-reload?
export const isReloading = (p: Player, weaponId: string): boolean =>
  p.reloadingWeaponId === weaponId && Date.now() < p.reloadEndsAt;

export interface MagazineRefillResult {
  weapon: Weapon;
  reserve: number;
  moved: number;
}

/**
 * リザーブからマガジンへ詰める純関数。通常リロードとクイックマガジンの唯一の装填式。
 * 守護霊は除外4(リザーブ弾非消費)を `reserve=Infinity` で表し、容量/装填量は同じ式を通す。
 */
export const refillWeaponMagazine = (w: Weapon, p: Player, reserve: number): MagazineRefillResult => {
  const need = Math.max(0, effectiveMagSize(w, p) - (w.magazine ?? 0));
  const moved = Math.min(need, Math.max(0, reserve));
  return {
    weapon: moved > 0 ? { ...w, magazine: (w.magazine ?? 0) + moved } : w,
    reserve: reserve - moved,
    moved,
  };
};

/** 満タン/リザーブ無し/同じ銃をリロード中ならnull。それ以外はプレイヤーと同じ終了時刻を返す。 */
export const beginWeaponReload = (
  w: Weapon,
  p: Player,
  reserve: number,
  now = Date.now(),
): Pick<Player, 'reloadEndsAt' | 'reloadingWeaponId'> | null => {
  if (!w.ammoType || effectiveMagSize(w, p) - (w.magazine ?? 0) <= 0 || reserve <= 0) return null;
  if (p.reloadingWeaponId === w.id && now < p.reloadEndsAt) return null;
  return { reloadingWeaponId: w.id, reloadEndsAt: now + effectiveReloadMs(w, p) };
};

/** 終了したリロードを解決する純関数。まだ途中/対象銃違いならnull。 */
export const finishWeaponReload = (
  w: Weapon,
  p: Player,
  reserve: number,
  now = Date.now(),
): (MagazineRefillResult & Pick<Player, 'reloadEndsAt' | 'reloadingWeaponId'>) | null => {
  if (p.reloadingWeaponId !== w.id || now < p.reloadEndsAt) return null;
  return { ...refillWeaponMagazine(w, p, reserve), reloadingWeaponId: '', reloadEndsAt: 0 };
};

/**
 * 1トリガー後の銃状態。ゴーストシューターの非消費抽選もプレイヤー/守護霊で共有する。
 * ダメージ計算は発射前の残弾を使うため、必ず弾生成後に呼ぶ。
 */
export const weaponAfterGunShot = (
  w: Weapon,
  p: Player,
  now = Date.now(),
  rand: () => number = Math.random,
): Weapon => {
  const ghostLv = skillLevel(p, 'ghost-shooter');
  const consume = ghostLv && rand() < [0, 0.10, 0.20, 0.30][ghostLv] ? 0 : 1;
  return { ...w, lastFired: now, magazine: Math.max(0, (w.magazine ?? 0) - consume) };
};

// Starting loadout: one gun + one melee weapon from the class profile.
export const getStartingWeapons = (characterClass: CharacterClass): Weapon[] => {
  const profile = PLAYER_PROFILES[characterClass] ?? PLAYER_PROFILES.warrior;
  return [createWeapon(profile.gunKey), createWeapon(profile.meleeKey)];
};

// 専用スプライト(public/sprites/weapons/<key>.png)を持つ銃の武器key。素材受領のたびに追加。
// ワールドのドロップ/ピックアップ表示と HUD の武器アイコンで使用。未登録keyは絵文字フォールバック。
export const WEAPON_ICON_KEYS: ReadonlySet<string> = new Set<string>([
  'handgun-t1', 'handgun-t2', 'handgun-t3',
  'rifle-t1', 'rifle-t2', 'rifle-t3',
  'shotgun-t1', 'shotgun-t2', 'shotgun-t3',
  'phill-revolver',
  // 近接(ナイフ系)アイコン。名前に近い見た目を割当(社長指示)。攻撃モーション用ではなく
  // 銃と同じピックアップ/HUDアイコン。
  'knife-t1', 'hatchet-t2', 'machete-t3', 'tactical-knife-t4', 'anti-mutant-knife-t5',
  'glauncher-t1', 'glauncher-t2', 'glauncher-t3', // 武器庫限定グレネード系銃器(v0.25.3290)
]);
export const hasWeaponIcon = (key: string | undefined | null): boolean => !!key && WEAPON_ICON_KEYS.has(key);
export const weaponIconName = (key: string): string => `weapons/${key}`;

// Effective firing range per gun family (px). A gun only fires when an enemy
// is within this reach, so the player doesn't burn rounds into empty space.
// RE-flavored: shotgun is close-quarters, rifle reaches far, handgun is mid.
// ★社長調整2026-08-24: ショットガン140 / ハンドガン170 / ライフル250 / グレネード250。
// 旧: 120 / 176 / 312 / 312。**射程差を詰める方向**(ライフルの312は他の2倍以上あった)。
// グレネードは t1/t2 が下の GLAUNCHER_ROLL_DETONATE_PX でショットガン・ハンドガンの値を引くので、
// **この表を直すだけで t1=140 / t2=170 / t3=250 に揃う**(数字を2箇所に書かない)。
export const RANGE_BY_CATEGORY: Record<AmmoType, number> = {
  handgun: 170,
  shotgun: 140,
  rifle: 250,
  phill: 260, // 手動照準の精密射撃。自動射程判定には使わない(自動射撃しない)。
  glauncher: 250 // グレネードガン t3 の自動射程(社長調整2026-08-24。旧312)
};

// 社長指示v0.25.3438「t1-t2のグレネードは手榴弾と同様にころがって爆発に変更。t1はショットガン距離で
// 爆発する距離、t2はハンドガンの距離。t3は転がらずに、いまの仕様のまま」:
// 爆発する道のり(px)=そのまま実効射程なので、fireWeaponの射程ゲートもこの値で引く
// (312のままだと爆発点より遠い敵に撃ち始めて一生届かない)。t3はこの表に無い=従来どおり。
export const GLAUNCHER_ROLL_DETONATE_PX: Record<string, number> = {
  'glauncher-t1': RANGE_BY_CATEGORY.shotgun,  // 140(社長調整2026-08-24)
  'glauncher-t2': RANGE_BY_CATEGORY.handgun,  // 170(同上)
};

/**
 * ★射程のズーム補正(社長指示v0.25.3170「ズームが引になると明らかに射程距離が短く感じてしまうので、
 * 体感あまり変わらない様に調整したい」)。
 *
 * `RANGE_BY_CATEGORY` は**等倍画面で決めた値**なので、ボス交戦でカメラが引くと同じワールド距離が
 * 画面上では zoom 倍に縮む(最大引き `ZOOM_MIN_ABS=0.40` なら**画面上の射程は4割**)。撃つ/撃たないは
 * 目で測るので、これが「明らかに射程が短い」の正体。⇒ **画面上の射程が変わらないよう**ワールド距離へ
 * 戻す。式は既に `bossEngagementDistancePx`(交戦域)と湧き範囲が使っている
 * `zoomCompensatedWorldDistance` と**同じ1本**(寄り方向=zoom>1では伸ばさない)。
 *
 * 射程だけを伸ばすので、引いている間は相対的に銃が強くなる(ハンドガン176→最大440)。
 * 数字が過剰なら `zoomCompensatedWorldDistance` ではなく上限付きに変えるのが調整点。
 */
export const zoomedGunRange = (basePx: number): number =>
  zoomCompensatedWorldDistance(basePx, useGameStore.getState().viewZoom);

// A stunned enemy is a low-priority target — the player should be putting
// rounds into the threats that are still moving, not the one already frozen
// for a melee finish.
const isStunned = (e: Enemy, gameTime: number): boolean =>
  e.stunUntil !== undefined && gameTime < e.stunUntil;

// Choose the gun's target: the nearest NON-stunned enemy, only falling back to
// a stunned one when every enemy on the field is stunned. Returns null if the
// field is empty.
const pickTarget = (player: Player, enemies: Enemy[]): Enemy | null => {
  const gameTime = useGameStore.getState().gameTime;
  const pcx = player.x + player.width / 2;
  const pcy = player.y + player.height / 2;
  let best: Enemy | null = null;
  let bestD2 = Infinity;
  let bestStunned: Enemy | null = null;
  let bestStunnedD2 = Infinity;
  for (const e of enemies) {
    if (isCorpse(e)) continue; // KILL吹き飛び(死体・SKILL_BUILD_REDESIGN.md §26-2): 銃の自動照準対象から除外
    const d2 = aimDist2(pcx, pcy, e);
    if (isStunned(e, gameTime)) {
      if (d2 < bestStunnedD2) { bestStunnedD2 = d2; bestStunned = e; }
    } else if (d2 < bestD2) {
      bestD2 = d2; best = e;
    }
  }
  return best ?? bestStunned;
};

// Distance from the player center to the gun's chosen target, or Infinity when
// the field is empty (used by the range gate).
const nearestEnemyDistance = (player: Player, enemies: Enemy[]): number => {
  const target = pickTarget(player, enemies);
  if (!target) return Infinity;
  // 射程ゲートも帯(AABB)の最近点距離(裏ボス)。中心基準だと巨体の縁で射程外扱いになる。
  return Math.sqrt(aimDist2(player.x + player.width / 2, player.y + player.height / 2, target));
};

// Aim helper: point at the chosen target, falling back to the last movement
// direction (then straight up) when the field is empty.
const aimDirection = (player: Player, enemies: Enemy[]): { x: number; y: number } => {
  const closest = pickTarget(player, enemies);
  if (closest) {
    const pcx = player.x + player.width / 2;
    const pcy = player.y + player.height / 2;
    const dx = closest.x + closest.width / 2 - pcx;
    const dy = closest.y + closest.height / 2 - pcy;
    const dist = Math.max(0.001, Math.sqrt(dx * dx + dy * dy));
    return { x: dx / dist, y: dy / dist };
  }
  if (player.lastDirection) return { ...player.lastDirection };
  return { x: 0, y: -1 };
};

const rotate = (v: { x: number; y: number }, angle: number) => {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
};

// GHOST-GUN-PARITY(共通ヘルパ): 弾の拡散角ルール。fireWeaponの生成ループから計算式を変えずに
// 抽出しただけ(ショットガンは口径(SHOTGUN_SPREAD_CONE_RAD_BY_TIER)/(count-1)、それ以外はcount>1
// なら0.12刻み)。プレイヤーの発射(fireWeapon)と守護霊の借用銃(buildGhostGunShots)が同じ規則を
// 共有するための切り出し。count<=1やspreadStep<=0ならbaseDirをそのまま(コピー)で返す=元の
// `let pd = {...baseDir}; if (...) pd = rotate(...)` と同じ分岐。
export const computeShotDirections = (
  weapon: Pick<Weapon, 'count' | 'category' | 'tier'>,
  baseDir: { x: number; y: number },
): { x: number; y: number }[] => {
  const count = weapon.count ?? 1;
  const shotgunSpread = SHOTGUN_SPREAD_CONE_RAD_BY_TIER[weapon.tier ?? 1] ?? SHOTGUN_SPREAD_CONE_RAD_BY_TIER[1];
  const spreadStep = weapon.category === 'shotgun'
    ? (count > 1 ? shotgunSpread / (count - 1) : 0)
    : count > 1 ? 0.12 : 0;
  const dirs: { x: number; y: number }[] = [];
  for (let i = 0; i < count; i++) {
    let pd = { ...baseDir };
    if (count > 1 && spreadStep > 0) {
      const angle = -spreadStep * (count - 1) / 2 + i * spreadStep;
      pd = rotate(baseDir, angle);
    }
    dirs.push(pd);
  }
  return dirs;
};

// GHOST-GUN-PARITY(共通ヘルパ): 弾の飛翔特性(サイズ/速度=PROJECTILE_SPEED_MULT込み)。
// fireWeaponから計算式を変えずに抽出しただけ。
export const projectileFlightStats = (
  weapon: Pick<Weapon, 'projectileSize' | 'projectileSpeed'>,
): { size: number; speed: number } => ({
  size: weapon.projectileSize || 8,
  speed: (weapon.projectileSpeed || 520) * PROJECTILE_SPEED_MULT,
});

// GHOST-BUILD-1(共通ヘルパ・BOT_AND_GHOST.md §2.11補足「写すな、共通化しろ」): 発射時の素ダメージ。
// fireWeaponの `shotDamage` の式を値を変えずに抽出しただけ。プレイヤーの発射と守護霊の射撃
// (buildGhostGunShots=計測時ビルドの疑似Playerを渡す)が**同じ1本の式**を通る。
//  = 武器damage × スカベンジャー(キャラ固有) × アタックシューター × 消費カード「アタックドーピング」
//    (§23・+20%・60秒=アタックシューターと同じ合流点) × 装備(火力)ダメージ倍率 × ラストマガジン
export const gunShotBaseDamage = (
  weapon: Pick<Weapon, 'damage' | 'magazine'>,
  player: Player,
  gameTime: number,
): number =>
  weapon.damage * scavengerGunMult(player, gameTime) * skillAttackShooterGunMult(player)
  * consumableAttackMult(player, gameTime)
  * (player.equipBonus?.damageMult ?? 1) * skillLastMagazineMult(player, weapon.magazine ?? 0);

// GHOST-BUILD-1(共通ヘルパ): 発射時のクリ率(0..1)。fireWeaponの `critChance` の式を値を変えずに抽出。
//  = 武器基礎 + 本体(レベルアップ)+ 装備(クリ系)+ クイックマガジン + 弁慶(旧ウォームアップ項は
//    §23-1裁定で退役=削除済み)
// 命中時は projectileHitCritChance(ボスは×0.5+下限5%)でロールされる=呼び出し側は数値を運ぶだけ。
export const gunShotCritChance = (
  weapon: Pick<Weapon, 'critChance'>,
  player: Player,
  gameTime: number,
): number => Math.min(1,
  (weapon.critChance ?? 0) + (player.critChance || 0) + (player.equipBonus?.critBonus ?? 0)
  + (player.quickMagCritUntil > gameTime ? 0.10 : 0)
  + skillBenkeiCritBonus(player, gameTime));

// Fire a single weapon this tick (cooldown- and ammo-aware). Melee weapons
// never fire here — they're handled by the counter. Guns auto-target the
// nearest enemy, roll crits per pellet, and burn one round of their ammo
// pool per shot. Returns the projectiles spawned (empty if blocked).
export const fireWeapon = (weapon: Weapon, player: Player, enemies: Enemy[]): Projectile[] => {
  const now = Date.now();
  if (weapon.isMelee || !weapon.ammoType) return [];
  // 装備(腕)の連射倍率で実効cooldownを短縮(中立=1)。fireRateMult>1 ほど間隔が縮む。
  const effCooldown = effectiveFireCooldown(weapon, player);
  if (now - weapon.lastFired < effCooldown) return [];

  // Can't fire while reloading, or with an empty magazine. Reloads are kicked
  // off by autoSwitchIfDry/startReload, not here — firing just stops.
  if (isReloading(player, weapon.id)) return [];
  if ((weapon.magazine ?? 0) <= 0) return [];

  // Range gate: hold fire (and ammo) unless an enemy is within reach. Don't
  // advance lastFired here so the gun fires the instant a target enters range.
  // (マークスマンは射程UP→移動速度UPに変更したため、射程倍率は廃止)
  // グレネードガンt1/t2(転がり爆発)は爆発する道のり=実効射程(v0.25.3438)。
  const rollDetonatePx = GLAUNCHER_ROLL_DETONATE_PX[weapon.key ?? ''];
  const gunRange = zoomedGunRange(rollDetonatePx ?? RANGE_BY_CATEGORY[weapon.ammoType]);
  if (nearestEnemyDistance(player, enemies) > gunRange) {
    return [];
  }

  const baseDir = aimDirection(player, enemies);
  const count = weapon.count ?? 1;
  // GHOST-GUN-PARITY: 拡散角/サイズ・速度の計算式は共通ヘルパへ抽出しただけ(値は不変)。
  const shotDirections = computeShotDirections(weapon, baseDir);
  const { size, speed } = projectileFlightStats(weapon);

  // スキル: ファイアシューター = 20%の射撃が爆発弾化(×0.3 ダメージ・半径66)。
  // 連続爆発を防ぐため player.fireShooterCdUntil(gameTime ms)で 3秒の裏クールダウン。
  const gtFire = useGameStore.getState().gameTime;
  const fireShooterLv = skillLevel(player, 'fire-shooter');
  const fireShooterReady = fireShooterLv && gtFire >= player.fireShooterCdUntil;
  const fireShooterShot = fireShooterReady && Math.random() < [0, 0.2, 0.25, 0.3][fireShooterLv];
  if (fireShooterShot) {
    useGameStore.setState(state => ({ player: { ...state.player, fireShooterCdUntil: gtFire + 3000 } }));
  }
  const FIRE_SHOOTER_RADIUS = 66; // = HEAVY_GRENADE_RADIUS
  // 社長指示v0.25.3300 ファイアシューター覚醒(Lv3): 爆発弾が大爆発になる(半径×1.8=
  // ボムカウンター自分中心大爆発と同じ「大爆発」倍率)。
  const FIRE_SHOOTER_AWAKEN_RADIUS_MULT = 1.8;
  // 発射時の素ダメージ(GHOST-BUILD-1で共通ヘルパへ抽出=式・値は不変):
  //   キャラ固有 スカベンジャー(necromancer): 弾薬取得後3秒は銃ダメージ ×1.1。
  //   スキル アタックシューター: 銃ダメージ +10/20/30%(Lv)。
  //   装備(腕・火力系)のダメージ倍率。中立=1。
  //   スキル ラストマガジン: 弾倉最後の1発(この発射で空になるトリガー1回分=発射前の残弾1)×2.0/2.5/3.0。
  //   ショットガンは最終シェルの全ペレットに乗る(shotDamage共通)。命中時の他倍率とは乗算(§6.8 M31)。
  const shotDamage = gunShotBaseDamage(weapon, player, gtFire);
  // スキル: ビッグバレット = 弾サイズ×1.3/1.5/1.7(見た目と当たり判定を同時拡大。速度・貫通数・
  // 跳弾回数・壁衝突は不変=§28-2)。プレイヤー自身の銃弾のみ(ghost-gun/support-sniperは対象外)。
  // 社長指示v0.25.3297「ビッグバレットが地味なのでアタックシューターと統合」: 弾サイズ拡大は
  // attack-shooterのLvで発動(big-bulletはRETIRED)。倍率表(×1.3/1.5/1.7)はそのまま流用。
  const shotSize = size * bigBulletSizeMult(skillLevel(player, 'attack-shooter'));

  const projectiles: Projectile[] = [];
  for (let i = 0; i < count; i++) {
    const pd = shotDirections[i];
    const gt = useGameStore.getState().gameTime;
    // 発射時のクリ率(GHOST-BUILD-1で共通ヘルパへ抽出=式・値は不変):
    //   武器基礎 + 本体(レベルアップ)+ 装備(アクセ・クリ系。player.critChanceとは別枠で加算)
    //   + クイックマガジン + 弁慶(ウォームアップは退役済み=v0.25.3248でこの式から削除)。
    const critChance = gunShotCritChance(weapon, player, gt);
    projectiles.push({
      id: `proj-${weapon.id}-${now}-${i}`,
      x: player.x + player.width / 2 - shotSize / 2,
      y: player.y + player.height / 2 - shotSize / 2,
      width: shotSize,
      height: shotSize,
      speed,
      // Base damage only — the crit multiplier is applied at hit time so it can
      // scale differently against bosses (×5) vs normal enemies (×1.5).
      // (スカベンジャーの+10%は素ダメージへ既に反映済み = shotDamage)
      damage: shotDamage,
      direction: pd,
      weaponType: weapon.category as WeaponType, // 'handgun' | 'shotgun' | 'rifle'
      weaponKey: weapon.key,
      duration: 1400,
      createdAt: now,
      passthrough: weapon.passthrough || false,
      hitEnemies: [],
      // スキル: シャープシューター = 貫通 +1/+2/+3(Lv)。passthrough武器=貫通自由なので据置。
      pierce: !weapon.passthrough && skillLevel(player, 'sharpshooter')
        ? (weapon.pierce ?? 0) + skillLevel(player, 'sharpshooter')
        : weapon.pierce,
      hostile: false,
      reflected: false,
      // CRIT-UNIFY §9.1: 生成時に抽選しない。critChanceを運び、命中時に対象別(ボスは半減+下限5%)で
      // ロールする(useGameLoop.tsのprojectileHitCritChance)。
      critChance,
      // スキル: ファイアシューターの爆発弾。直撃ダメージ ×0.3、命中で半径66の小爆発。
      ...(fireShooterShot
        ? {
            explodeOnHit: true,
            explodeRadius: FIRE_SHOOTER_RADIUS * (fireShooterLv >= 3 ? FIRE_SHOOTER_AWAKEN_RADIUS_MULT : 1),
            explodeDamageMult: 1,
            damage: shotDamage * 0.3,
          }
        : {}),
      // 社長指示v0.25.3300 ラストマガジン覚醒(Lv3): 弾倉最後の1セット(発射前の残弾1=倍率と同じ条件)に
      // 延焼が付く(ショットガンは全ペレット)。命中側(useGameLoop)がこのフラグで燃焼を適用する。
      ...(skillLevel(player, 'last-magazine') >= 3 && (weapon.magazine ?? 0) === 1
        ? { bonusIncendiary: true }
        : {}),
      // 社長指示v0.25.3438/3441: グレネードガンt1/t2=転がり弾(手榴弾と同じバウンド+減速で転がり、
      // 道のり到達 or 時間で爆発)。敵に触れたらその場で直撃爆発(v3441「直撃を復活」)。t3は従来のまま。
      ...(rollDetonatePx !== undefined ? { rollDetonatePx, traveledPx: 0 } : {}),
    });
  }

  // Drain the magazine and record the fire time. One trigger pull = one round
  // for EVERY family, including the shotgun (a shell fires the whole pellet
  // spread for a single round).
  // スキル: ゴーストシューター = 10%/20%/30%(Lv)で弾を消費しない。
  // 社長指示v0.25.3300 覚醒(Lv3): 「消費しない」ではなく「30%で消費した弾をリザーブから即補填」に変わる
  // (弾倉は減らないがリザーブは減る=総弾数が増えるわけではない。リザーブ0なら補填されず普通に消費)。
  const gsAwaken = skillLevel(player, 'ghost-shooter') >= 3;
  const gsRefillProc = gsAwaken && Math.random() < 0.30;
  useGameStore.setState(state => {
    const gsField = weapon.ammoType ? AMMO_FIELD[weapon.ammoType] : null;
    const gsReserve = gsField ? state.player[gsField] : 0;
    const doRefill = gsRefillProc && gsField !== null && gsReserve > 0;
    return {
      player: {
        ...state.player,
        weapons: state.player.weapons.map(w => {
          if (w.id !== weapon.id) return w;
          // 覚醒時はrand=1固定で内部の非消費抽選を潰す(=必ず消費)→ 補填でmagazineを戻す。
          const shot = gsAwaken ? weaponAfterGunShot(w, player, now, () => 1) : weaponAfterGunShot(w, player, now);
          return doRefill ? { ...shot, magazine: (shot.magazine ?? 0) + 1 } : shot;
        }),
        ...(doRefill && gsField ? ({ [gsField]: gsReserve - 1 } as Partial<Player>) : {}),
      },
    };
  });

  return projectiles;
};

// 援護射撃(support-sniper・PACING_PUZZLE.md §6.5 M28): スナイパー射撃の1発を、NPC位置から
// 「既存のプレイヤー弾」として生成する。fireWeapon の生成時計算と同じ式
// (素ダメージ=スカベンジャー/アタックシューター/装備倍率、クリ率=基礎+パッシブ+装備+クイックマガジン+弁慶)を使い、
// weaponType/weaponKey も rifle/rifle-t2 に揃える=命中時のスキル倍率(クリ/スナイパー/コンボマスター)・
// 貫通(passthrough)が通常のプレイヤー弾と完全に同じ扱いになる。プレイヤーの銃の状態(弾薬/リロード/
// lastFired)には一切触れない(弾は消費しない)。副作用なし。
// 攻撃力の基準(社長裁定v0.25.1737): ダメージだけ**マグナム(rifle-t1=30)を基準**にし、倍率計算後に
// **1/2**(実効ベース15)。旧=スナイパー55そのままはテスト#2/#3の突出+実機「強すぎ」により弱体。
// 飛翔特性(速度/サイズ/貫通)・クリ率・命中時のスキル扱いは従来どおりスナイパー(rifle-t2)のまま。
export const buildSupportSniperShot = (
  player: Player,
  x: number, y: number,                       // 弾の中心の生成位置(NPCの発射位置)
  direction: { x: number; y: number },        // 射線(正規化済みを渡す)
  gameTime: number,
): Projectile => {
  const def = CATALOG['rifle-t2'];
  const size = def.projectileSize || 8;
  const speed = (def.projectileSpeed || 520) * PROJECTILE_SPEED_MULT;
  const shotDamage = CATALOG['rifle-t1'].damage * scavengerGunMult(player, gameTime) * skillAttackShooterGunMult(player) * consumableAttackMult(player, gameTime) * (player.equipBonus?.damageMult ?? 1) * 0.5;
  return {
    id: `proj-support-sniper-${Date.now()}`,
    x: x - size / 2,
    y: y - size / 2,
    width: size,
    height: size,
    speed,
    damage: shotDamage,
    direction,
    weaponType: def.category as WeaponType, // 'rifle'
    weaponKey: def.key,                     // 'rifle-t2'
    duration: 1400,
    createdAt: Date.now(),
    passthrough: def.passthrough || false,  // rifle-t2=貫通
    hitEnemies: [],
    pierce: def.pierce,
    hostile: false,
    reflected: false,
    // CRIT-UNIFY §9.4(裁定E「援護射撃もクリ無し」): 生成時クリ抽選を撤去。critChance=0固定
    // (基礎ダメージの補填はしない=DPS台帳裁定(b)は別件のまま保留)。
    critChance: 0,
  };
};

// ジャンクウェポン(junk-weapon・PACING_PUZZLE.md §6.7 M30): 近接スイングと同時にスイング方向へ撃つ
// 散弾5発。飛翔特性=ショットガンT1相当(CATALOG shotgun-t1 の速度/サイズ+T1スプレッドコーン)を参照し、
// 既存のプレイヤー弾(weaponType='shotgun')として生成=命中時スキルは通常どおり乗る。
// ダメージはLv固定(呼び出し元が computeJunkShot で決めて渡す)。弾薬はスクラップ(呼び出し元が消費)で、
// ショットガン弾薬・生成時クリ抽選は使わない(ダメージ固定が仕様のため crit=false)。副作用なし。
export const buildJunkWeaponPellets = (
  x: number, y: number,                 // 発射点(プレイヤー中心)
  direction: { x: number; y: number },  // スイング方向(正規化済みを渡す)
  pelletDamage: number,                 // 1発のダメージ(Lv固定=3/6/9)
  pelletCount: number,                  // 同時発射数(=JUNK_WEAPON_PELLETS)
): Projectile[] => {
  const def = CATALOG['shotgun-t1'];
  const size = def.projectileSize || 7;
  const speed = (def.projectileSpeed || 440) * PROJECTILE_SPEED_MULT;
  const cone = SHOTGUN_SPREAD_CONE_RAD_BY_TIER[def.tier ?? 1] ?? SHOTGUN_SPREAD_CONE_RAD_BY_TIER[1];
  const spreadStep = pelletCount > 1 ? cone / (pelletCount - 1) : 0;
  const now = Date.now();
  const pellets: Projectile[] = [];
  for (let i = 0; i < pelletCount; i++) {
    const angle = -spreadStep * (pelletCount - 1) / 2 + i * spreadStep;
    pellets.push({
      id: `proj-junk-weapon-${now}-${i}`,
      x: x - size / 2,
      y: y - size / 2,
      width: size,
      height: size,
      speed,
      damage: pelletDamage,
      direction: rotate(direction, angle),
      weaponType: 'shotgun',
      weaponKey: 'sub-junk-weapon',
      duration: 1400,
      createdAt: now,
      passthrough: false,
      hitEnemies: [],
      hostile: false,
      reflected: false,
      // CRIT-UNIFY §9.4: サブウェポン(ジャンク)はクリ発生枠の対象外=critChance固定0。
      critChance: 0,
    });
  }
  return pellets;
};

// 守護霊の銃(ghost-gun・GHOST-GUN-PARITY・TEST_HANDOFF/results/20260730-0944-guardian-parity.md):
// useGameLoopの手書きaddProjectileがプレイヤーのfireWeapon仕様(count発/拡散/PROJECTILE_SPEED_MULT/
// projectileSize/passthrough・pierce)を無視していた5差のうち4つをここで揃える(社長裁定)。
// 借用銃(装備中のgun)そのものの飛翔特性なので computeShotDirections/projectileFlightStats を
// プレイヤーと共有する。
// 【v0.25.2514 GHOST-BUILD-1】残り1差(ダメージ倍率・クリ率)を解消: `build`(計測時ビルドの疑似Player+
// gameTime)を渡すと、素ダメージ/クリ率をプレイヤーの発射と**同じ共通ヘルパ**
// (gunShotBaseDamage/gunShotCritChance)で算出する=スキル倍率・装備ボーナス・射撃クリが再現される
// (§2.11訂正)。buildを省略した場合のみ旧挙動(素damage・crit無し)。
// headshot=裁定4(PHILL): 発射時に確定ヘッドショットと決まった弾に印を付ける(着弾側がロールを飛ばす)。
// 貫通はweapon自体のpassthrough/pierce(確定仕様)。
// weaponKeyは'ghost-gun'固定(計測除外/ヘイト分離は呼び出し元=useGameLoopが別途行う=不変)。
// 副作用なし(マガジン/リロード/クールダウンは呼び出し元が共通ヘルパで進め、ここでは触らない)。
export const buildGhostGunShots = (
  gun: Weapon,
  originX: number, originY: number,          // 発射点(ゴースト中心)
  baseDir: { x: number; y: number },         // 照準方向(正規化済み)
  now: number,
  idPrefix: string,                          // 弾idの一意化(呼び出し元がゴーストid等を渡す)
  build?: { player: Player; gameTime: number; headshot?: boolean },
): Projectile[] => {
  const { size, speed } = projectileFlightStats(gun);
  const dirs = computeShotDirections(gun, baseDir);
  const damage = build ? gunShotBaseDamage(gun, build.player, build.gameTime) : gun.damage;
  const critChance = build ? gunShotCritChance(gun, build.player, build.gameTime) : 0;
  return dirs.map((direction, i) => ({
    id: `${idPrefix}-${now}-${i}`,
    x: originX - size / 2,
    y: originY - size / 2,
    width: size,
    height: size,
    speed,
    damage,
    direction,
    weaponType: gun.category as WeaponType,
    weaponKey: 'ghost-gun',
    duration: 1400,
    createdAt: now,
    passthrough: gun.passthrough || false,
    hitEnemies: [],
    pierce: gun.pierce,
    hostile: false,
    reflected: false,
    critChance,
    ...(build?.headshot ? { headshot: true } : {}),
  }));
};

export const getWeaponShortName = (type: WeaponType): string => {
  switch (type) {
    case 'handgun': return 'ハンドガン';
    case 'shotgun': return 'ショットガン';
    case 'rifle':   return 'ライフル';
    case 'knife':   return 'ナイフ';
    case 'hatchet': return 'ダガー';
    case 'machete': return 'ファイティングナイフ';
    case 'tactical-knife': return 'タクティカルナイフ';
    case 'anti-mutant-knife': return '対変異体ナイフ';
    case 'phill-bullet': return 'ＰＨＩＬＬ-銃';
    default:        return '武器';
  }
};

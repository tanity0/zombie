import { Weapon, CharacterClass, WeaponType, Projectile, Player, Enemy, AmmoType } from '../types/game';
import { useGameStore, skillLevel, skillBenkeiCritBonus, scavengerGunMult, skillAttackShooterGunMult } from '../store/gameStore';
import { PLAYER_PROFILES } from '../data/playerProfiles';
import { isHiddenBoss } from './enemyUtils';

// プレイヤー中心→敵 の二乗距離。裏ボスは巨体で「当たり判定=足元の帯(AABB)」なので、中心ではなく
// 帯の最近点で測る(中心基準だと帯の縁にいる時に銃の射程判定に入らない=社長報告「銃が中心にしか届かない」)。
const aimDist2 = (pcx: number, pcy: number, e: Enemy): number => {
  if (isHiddenBoss(e.type)) {
    const nx = Math.max(e.x, Math.min(pcx, e.x + e.width));
    const ny = Math.max(e.y, Math.min(pcy, e.y + e.height));
    return (pcx - nx) * (pcx - nx) + (pcy - ny) * (pcy - ny);
  }
  const dx = e.x + e.width / 2 - pcx;
  const dy = e.y + e.height / 2 - pcy;
  return dx * dx + dy * dy;
};

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
  'rifle-t3':         { key: 'rifle-t3',   name: 'グレネードランチャー', type: 'rifle', category: 'rifle', tier: 3, damage: 95, cooldown: 1400, projectileSpeed: 420, projectileSize: 14, count: 1, passthrough: true, magSize: 2, reloadMs: 2200 },

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
  'phill-revolver':   { key: 'phill-revolver', name: 'ＰＨＩＬＬ-銃', type: 'phill-bullet', category: 'phill', tier: 1, damage: 80, cooldown: 1000, projectileSpeed: 640, projectileSize: 9, count: 1, magSize: 6, reloadMs: 900 }
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
  phill:   ['phill-revolver'] // 屋内固定銃。ドロップ/商人の銃ラインには出ない(weaponDrop は handgun/shotgun/rifle のみ抽選)。
};
// Tier 昇順。MELEE_KEYS[tier] が「1段階上」のキー(tier は 1 始まり=0-indexed の次要素)。
export const MELEE_KEYS = ['knife-t1', 'hatchet-t2', 'machete-t3', 'tactical-knife-t4', 'anti-mutant-knife-t5'];
export const MAX_KNIFE_TIER = MELEE_KEYS.length; // = 5
// 現在のナイフTierから「1段階上」のキーを返す(Tier5以上は undefined)。
export const nextKnifeKey = (currentTier: number): string | undefined =>
  currentTier >= MAX_KNIFE_TIER ? undefined : MELEE_KEYS[currentTier];

// Player-state field name that holds the pool for a given ammo type.
export const AMMO_FIELD: Record<AmmoType, 'ammoHandgun' | 'ammoShotgun' | 'ammoRifle' | 'ammoPhill'> = {
  handgun: 'ammoHandgun',
  shotgun: 'ammoShotgun',
  rifle: 'ammoRifle',
  phill: 'ammoPhill'
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

// The active gun: the one matching activeWeaponId, falling back to the first
// gun owned (or undefined if the player somehow has none).
export const getActiveGun = (player: Player): Weapon | undefined => {
  const guns = getGuns(player);
  return guns.find(w => w.id === player.activeWeaponId) ?? guns[0];
};

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
export const effectiveReloadMs = (w: Weapon, p: Player): number =>
  // 装備(腕・取り回し系)のリロード短縮を乗算(中立=1)。
  Math.max(250, (w.reloadMs ?? 0) * RELOAD_TIME_MULT * p.reloadMult * (p.equipBonus?.reloadMult ?? 1));

// Is this specific gun currently mid-reload?
export const isReloading = (p: Player, weaponId: string): boolean =>
  p.reloadingWeaponId === weaponId && Date.now() < p.reloadEndsAt;

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
]);
export const hasWeaponIcon = (key: string | undefined | null): boolean => !!key && WEAPON_ICON_KEYS.has(key);
export const weaponIconName = (key: string): string => `weapons/${key}`;

// Effective firing range per gun family (px). A gun only fires when an enemy
// is within this reach, so the player doesn't burn rounds into empty space.
// RE-flavored: shotgun is close-quarters, rifle reaches far, handgun is mid.
export const RANGE_BY_CATEGORY: Record<AmmoType, number> = {
  handgun: 176,
  shotgun: 120,
  rifle: 312,
  phill: 260 // 手動照準の精密射撃。自動射程判定には使わない(自動射撃しない)。
};

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

// Fire a single weapon this tick (cooldown- and ammo-aware). Melee weapons
// never fire here — they're handled by the counter. Guns auto-target the
// nearest enemy, roll crits per pellet, and burn one round of their ammo
// pool per shot. Returns the projectiles spawned (empty if blocked).
export const fireWeapon = (weapon: Weapon, player: Player, enemies: Enemy[]): Projectile[] => {
  const now = Date.now();
  if (weapon.isMelee || !weapon.ammoType) return [];
  // 装備(腕)の連射倍率で実効cooldownを短縮(中立=1)。fireRateMult>1 ほど間隔が縮む。
  const effCooldown = weapon.cooldown / (player.equipBonus?.fireRateMult ?? 1);
  if (now - weapon.lastFired < effCooldown) return [];

  // Can't fire while reloading, or with an empty magazine. Reloads are kicked
  // off by autoSwitchIfDry/startReload, not here — firing just stops.
  if (isReloading(player, weapon.id)) return [];
  if ((weapon.magazine ?? 0) <= 0) return [];

  // Range gate: hold fire (and ammo) unless an enemy is within reach. Don't
  // advance lastFired here so the gun fires the instant a target enters range.
  // (マークスマンは射程UP→移動速度UPに変更したため、射程倍率は廃止)
  const gunRange = RANGE_BY_CATEGORY[weapon.ammoType];
  if (nearestEnemyDistance(player, enemies) > gunRange) {
    return [];
  }

  const baseDir = aimDirection(player, enemies);
  const count = weapon.count ?? 1;
  const shotgunSpread = SHOTGUN_SPREAD_CONE_RAD_BY_TIER[weapon.tier ?? 1] ?? SHOTGUN_SPREAD_CONE_RAD_BY_TIER[1];
  const spreadStep = weapon.category === 'shotgun'
    ? (count > 1 ? shotgunSpread / (count - 1) : 0)
    : count > 1 ? 0.12 : 0;
  const size = weapon.projectileSize || 8;
  const speed = (weapon.projectileSpeed || 520) * PROJECTILE_SPEED_MULT;

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
  // キャラ固有 スカベンジャー(necromancer): 弾薬取得後3秒は銃ダメージ ×1.1。発射時の素ダメージへ反映。
  const scavMult = scavengerGunMult(player, gtFire);
  // スキル アタックシューター: 銃ダメージ +10/20/30%(Lv)。
  // 装備(腕・火力系)のダメージ倍率を素ダメージへ反映。中立=1。
  const shotDamage = weapon.damage * scavMult * skillAttackShooterGunMult(player) * (player.equipBonus?.damageMult ?? 1);

  const projectiles: Projectile[] = [];
  for (let i = 0; i < count; i++) {
    let pd = { ...baseDir };
    if (count > 1 && spreadStep > 0) {
      const angle = -spreadStep * (count - 1) / 2 + i * spreadStep;
      pd = rotate(baseDir, angle);
    }
    const gt = useGameStore.getState().gameTime;
    const quickMagCritBonus = player.quickMagCritUntil > gt ? 0.10 : 0;
    // 装備(アクセ・クリ系)のクリ率は player.critChance とは別枠で加算(装備内上限とスキル枠は独立)。
    const critChance = Math.min(1, (weapon.critChance ?? 0) + (player.critChance || 0) + (player.equipBonus?.critBonus ?? 0) + quickMagCritBonus + skillBenkeiCritBonus(player, gt));
    const crit = Math.random() < critChance;
    projectiles.push({
      id: `proj-${weapon.id}-${now}-${i}`,
      x: player.x + player.width / 2 - size / 2,
      y: player.y + player.height / 2 - size / 2,
      width: size,
      height: size,
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
      crit,
      // スキル: ファイアシューターの爆発弾。直撃ダメージ ×0.3、命中で半径66の小爆発。
      ...(fireShooterShot
        ? { explodeOnHit: true, explodeRadius: FIRE_SHOOTER_RADIUS, explodeDamageMult: 1, damage: shotDamage * 0.3 }
        : {}),
    });
  }

  // Drain the magazine and record the fire time. One trigger pull = one round
  // for EVERY family, including the shotgun (a shell fires the whole pellet
  // spread for a single round).
  // スキル: ゴーストシューター = 10%/20%/30%(Lv)で弾を消費しない。
  const ghostLv = skillLevel(player, 'ghost-shooter');
  const consume = ghostLv && Math.random() < [0, 0.10, 0.20, 0.30][ghostLv] ? 0 : 1;
  useGameStore.setState(state => ({
    player: {
      ...state.player,
      weapons: state.player.weapons.map(w =>
        w.id === weapon.id
          ? { ...w, lastFired: now, magazine: Math.max(0, (w.magazine ?? 0) - consume) }
          : w
      )
    }
  }));

  return projectiles;
};

// 援護射撃(support-sniper・PACING_PUZZLE.md §6.5 M28): プレイヤーのスナイパー(rifle-t2)と同性能の
// 1発を、NPC位置から「既存のプレイヤー弾」として生成する。fireWeapon の生成時計算と同じ式
// (素ダメージ=スカベンジャー/アタックシューター/装備倍率、クリ率=基礎+パッシブ+装備+クイックマガジン+弁慶)を使い、
// weaponType/weaponKey も rifle/rifle-t2 に揃える=命中時のスキル倍率(クリ/スナイパー/コンボマスター)・
// 貫通(passthrough)が通常のプレイヤー弾と完全に同じ扱いになる。プレイヤーの銃の状態(弾薬/リロード/
// lastFired)には一切触れない(弾は消費しない)。副作用なし。
export const buildSupportSniperShot = (
  player: Player,
  x: number, y: number,                       // 弾の中心の生成位置(NPCの発射位置)
  direction: { x: number; y: number },        // 射線(正規化済みを渡す)
  gameTime: number,
): Projectile => {
  const def = CATALOG['rifle-t2'];
  const size = def.projectileSize || 8;
  const speed = (def.projectileSpeed || 520) * PROJECTILE_SPEED_MULT;
  const shotDamage = def.damage * scavengerGunMult(player, gameTime) * skillAttackShooterGunMult(player) * (player.equipBonus?.damageMult ?? 1);
  const quickMagCritBonus = player.quickMagCritUntil > gameTime ? 0.10 : 0;
  const critChance = Math.min(1, (weaponBaseCritChance(def) ?? 0) + (player.critChance || 0) + (player.equipBonus?.critBonus ?? 0) + quickMagCritBonus + skillBenkeiCritBonus(player, gameTime));
  return {
    id: `proj-support-sniper-${Date.now()}`,
    x: x - size / 2,
    y: y - size / 2,
    width: size,
    height: size,
    speed,
    damage: shotDamage, // クリ倍率は命中時適用(通常のプレイヤー弾と同じ)
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
    crit: Math.random() < critChance,
  };
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

import { create } from 'zustand';
import { generateUpgradeOptions } from '../utils/upgradeUtils';
import {
  Player, Enemy, Projectile, Pickup, BreakableProp, GameStats,
  InputState, UpgradeOption, GameBounds, CharacterClass,
  VisualEffect, AmmoType, Direction, SubWeaponKey, CastleEvent, DifficultyRank,
  WeaponMerchant, ShopItemKey, EventQuestNpc
} from '../types/game';
import { getStartingWeapons, createWeapon, AMMO_FIELD, getActiveGun, getGuns, ammoPoolFor, effectiveMagSize, effectiveReloadMs } from '../utils/weaponUtils';
import { openCrate } from '../utils/weaponDrop';
import { isBossType } from '../utils/enemyUtils';
import { resolveTreeCollision, treesInRegion, trunkRect } from '../world/trees';
import { resolveTorchCollision, torchRect, torchesInRegion } from '../world/torches';
import { mineAmbushAround, mineRect, minesInRegion, pressureMinesNearPlayer } from '../world/mines';
import type { MineAmbushAnchor } from '../world/mines';
import { PLAYER_PROFILES } from '../data/playerProfiles';
import { footRect, rectsOverlap, resolveAabb, type Rect } from '../world/obstacles';
import { HUNTING_MELEE_RADIUS_BONUS_BY_LEVEL } from '../config/hunting';

// RE-style ammo economy. Guns fire from a per-gun magazine and reload from
// these per-family RESERVE pools. The reserve starts large (you're well
// stocked) but ammo is hard to find, so the run is a slow drain on it.
export const AMMO_INITIAL: Record<AmmoType, number> = { handgun: 60, shotgun: 40, rifle: 24 };
export const AMMO_MAX: Record<AmmoType, number> = { handgun: 240, shotgun: 96, rifle: 60 };
// How much a world/melee ammo pickup grants for each family (enemy drops, air
// drops, and the boxes melee kills now drop). Modest relative to the reserve
// cap — resupply is scarce.
export const AMMO_PICKUP: Record<AmmoType, number> = { handgun: 40, shotgun: 10, rifle: 20 };

// Player-tunable melee ammo-drop rate (percent), set on the start screen and
// persisted across reloads. A melee kill drops ammo at this rate; a melee
// finisher rolls at 1.5× (capped at 100%). Counter (reflect) kills are separate.
const DROP_PCT_KEY = 'zombie:meleeAmmoDropPercent';
const AMMO_PICKUP_KEY = 'zombie:ammoPickupAmounts';
export const DEFAULT_MELEE_DROP_PCT = 50;
const CASTLE_MIN_DISTANCE = 900;
const CASTLE_MAX_DISTANCE = 1300;
const CASTLE_COLLISION_W = 112;
const CASTLE_COLLISION_H = 42;
const CASTLE_FOOT_OFFSET_Y = 38;
const MERCHANT_MIN_DISTANCE = 180;
const MERCHANT_MAX_DISTANCE = 360;
const MERCHANT_INTERACT_RADIUS = 58;
const MERCHANT_REOPEN_DELAY_MS = 1500;
const EVENT_NPC_MIN_DISTANCE = 460;
const EVENT_NPC_MAX_DISTANCE = 950;
const EVENT_NPC_INTERACT_RADIUS = 64;
const EVENT_NPC_REOPEN_DELAY_MS = 1500;
export const SHOP_AMMO_COST = 10;
export const SHOP_DOG_COST = 100;
export const SHOP_CLASS_SKILL_COST = 100;
export const SHOP_MEDKIT_COST = 50;
export const SHOP_VACCINE_COST = 1000;
const SHOP_MEDKIT_HEAL = 20;
const SHOP_INTERACT_RING_MS = 360;
const STRONG_GLOW_RADIUS = 44;
const SMALL_GLOW_RADIUS_SCALE = 0.9;
const SMALL_GLOW_DURATION_SCALE = 0.82;
const SMALL_GLOW_MIN_DURATION_MS = 80;
// `finish` = a melee finisher executed a normal enemy, or finisher-grade
// damage landed on a stunned boss (drives the kill.mp3 sound).
// `killed` = how many enemies the swing killed (drives the zombie death grunt).
export type CounterTriggerResult = { swung: boolean; hit: boolean; finish: boolean; killed: number };
export const clampDropPct = (n: number): number =>
  Math.max(0, Math.min(100, Math.round(Number.isFinite(n) ? n : DEFAULT_MELEE_DROP_PCT)));

const createCastleEvent = (): CastleEvent => {
  const angle = Math.random() * Math.PI * 2;
  const dist = CASTLE_MIN_DISTANCE + Math.random() * (CASTLE_MAX_DISTANCE - CASTLE_MIN_DISTANCE);
  return {
    x: Math.cos(angle) * dist,
    y: Math.sin(angle) * dist,
    bossSpawned: false,
  };
};
const castleFootY = (castle: CastleEvent): number => castle.y + CASTLE_FOOT_OFFSET_Y;
const castleRect = (castle: CastleEvent): Rect =>
  footRect(castle.x, castleFootY(castle), CASTLE_COLLISION_W, CASTLE_COLLISION_H);
const resolveCastleCollision = (rect: Rect, castle: CastleEvent): { x: number; y: number } =>
  resolveAabb(rect, [castleRect(castle)]);
const createWeaponMerchant = (): WeaponMerchant => {
  const angle = Math.random() * Math.PI * 2;
  const dist = MERCHANT_MIN_DISTANCE + Math.random() * (MERCHANT_MAX_DISTANCE - MERCHANT_MIN_DISTANCE);
  return {
    x: Math.cos(angle) * dist,
    y: Math.sin(angle) * dist,
    radius: MERCHANT_INTERACT_RADIUS,
  };
};
const createEventQuestNpc = (): EventQuestNpc => {
  const angle = Math.random() * Math.PI * 2;
  const dist = EVENT_NPC_MIN_DISTANCE + Math.random() * (EVENT_NPC_MAX_DISTANCE - EVENT_NPC_MIN_DISTANCE);
  return {
    x: Math.cos(angle) * dist,
    y: Math.sin(angle) * dist,
    radius: EVENT_NPC_INTERACT_RADIUS,
    status: 'available',
    questIndex: 0,
    fadeStartedAt: 0,
  };
};
const loadMeleeDropPct = (): number => {
  try {
    const v = localStorage.getItem(DROP_PCT_KEY);
    return v != null ? clampDropPct(parseFloat(v)) : DEFAULT_MELEE_DROP_PCT;
  } catch {
    return DEFAULT_MELEE_DROP_PCT;
  }
};
export const clampAmmoPickupAmount = (n: number): number =>
  Math.max(0, Math.min(999, Math.round(Number.isFinite(n) ? n : 0)));
const loadAmmoPickupAmounts = (): Record<AmmoType, number> => {
  try {
    const raw = localStorage.getItem(AMMO_PICKUP_KEY);
    const parsed = raw ? JSON.parse(raw) as Partial<Record<AmmoType, number>> : {};
    return {
      handgun: clampAmmoPickupAmount(parsed.handgun ?? AMMO_PICKUP.handgun),
      shotgun: clampAmmoPickupAmount(parsed.shotgun ?? AMMO_PICKUP.shotgun),
      rifle: clampAmmoPickupAmount(parsed.rifle ?? AMMO_PICKUP.rifle)
    };
  } catch {
    return { ...AMMO_PICKUP };
  }
};

// Light knockback applied to a normal enemy each time a bullet connects.
// Guns shove only half as hard as the melee counter's push.
export const BULLET_KNOCKBACK_SPEED = 64;

// Crit → stun duration (gameTime ms). A stunned enemy is a finisher target.
export const STUN_DURATION_MS = 5000;
export const CRIT_DAMAGE_MULT = 1.5;
// Bosses use a beefier crit ruleset: gun crits hit 5×, and meleeing a stunned
// boss deals 5× melee damage (and shakes off the stun) instead of an instakill.
export const BOSS_CRIT_DAMAGE_MULT = 5;
export const BOSS_MELEE_STUN_MULT = 5;
// Melee reach for the finger-release counter swing.
export const MELEE_RADIUS = 74;
export const huntingMeleeRadius = (player: Player): number => {
  if (!player.huntingCharged) return MELEE_RADIUS;
  const level = Math.max(1, Math.min(3, player.subWeaponLevels['striker-hunting'] ?? 1));
  return MELEE_RADIUS + HUNTING_MELEE_RADIUS_BONUS_BY_LEVEL[level];
};

// Counter-on-release tuning. The counter window opens the moment the player
// lifts their finger (or presses Space on PC) and stays open briefly. Any
// hostile projectile that hits the player during the window is reflected.
export const COUNTER_WINDOW = 400; // ms the window stays open after trigger
export const COUNTER_COOLDOWN = 420; // ms between counters (anti-spam)
// Each successful reflect refreshes the window by this much so a chained
// barrage can be turned back in full. No hard cap — the cooldown still
// kicks in once the chain finally lapses.
export const COUNTER_EXTEND_PER_HIT = 200;

// Counter knockback (additional effect on top of the bullet reflect).
// Two radii: HIT_RADIUS is where enemies actually get pushed; RING_RADIUS
// is the visual telegraph (wider). Keeping the telegraph wide lets the
// player read the attack while the actual catch zone stays disciplined.
export const KNOCKBACK_HIT_RADIUS = 55;
export const KNOCKBACK_RING_RADIUS = 180;
export const KNOCKBACK_SPEED = 200; // melee counter shove (halved again)
export const KNOCKBACK_DURATION = 280;
const TRAP_MELEE_SHOVE_DISTANCE = 68;
const TRAP_MELEE_SHOVE_SLIDE_MS = 220;
// 設置型シールドへの近接攻撃=シールドバッシュ。シールド中心 SHIELD_BASH_RADIUS 内の
// 敵に近接ダメージ×SHIELD_BASH_DAMAGE_MULT と強ノックバックを与え、シールドは壊れる。
const SHIELD_BASH_DAMAGE_MULT = 3;
const SHIELD_BASH_RADIUS = 64;
const SHIELD_BASH_KNOCKBACK_SPEED = KNOCKBACK_SPEED * 2.4;
// After being shoved by a melee counter, an enemy is immune to further melee
// knockback for this long (damage still lands) so it can't be locked forever.
export const KNOCKBACK_IMMUNE_MS = 1750;
export const REFLECT_DAMAGE_MULTIPLIER = 60.0; // countered bullets hit 5× harder
export const REFLECT_SPEED_MULTIPLIER = 1.8;

// ---------------------------------------------------------------------------
// Katana (刀) sub-weapon. Owning the card switches the player to katana mode:
// guns hold fire and the release/Space knife sweep is disabled (the counter
// window still opens so bullet reflection keeps working). An auto-slash cuts
// the nearest in-range enemy continuously, and a flick (mobile) / same-key
// double-tap (PC) performs an invulnerable dash that cuts along its path.
// ---------------------------------------------------------------------------
// 射程はレベル制(確定仕様): レベルごとに1.2倍。全体を現状より少し狭く
// (以前の 89/107/128 から係数0.86で 76/92/110)。
const KATANA_RANGE_TIGHTEN = 0.86;
export const KATANA_RANGE_BY_LEVEL = [
  0,
  Math.round(MELEE_RADIUS * 1.2 * KATANA_RANGE_TIGHTEN),              // Lv1: 76
  Math.round(MELEE_RADIUS * 1.2 * 1.2 * KATANA_RANGE_TIGHTEN),        // Lv2: 92
  Math.round(MELEE_RADIUS * 1.2 * 1.2 * 1.2 * KATANA_RANGE_TIGHTEN),  // Lv3: 110
] as const;
// TODO(刀): 仮値。斬撃間隔・ダメージは未確定。
export const KATANA_SLASH_INTERVAL_MS = 600;
export const KATANA_DAMAGE_BY_LEVEL = [0, 10, 12, 14] as const;
// クリ率はレベル制(確定仕様): Lv1 10% / Lv2 20% / Lv3 30%。
export const KATANA_CRIT_CHANCE_BY_LEVEL = [0, 0.10, 0.20, 0.30] as const;
export const KATANA_DASH_DAMAGE_MULT = 3; // 一閃 = 刀オート斬撃の3倍(仕様確定値)
// TODO(刀): 仮値。一閃の所要時間は操作感を見て調整する。
export const KATANA_DASH_MS = 180;
// 一閃の距離・当たり幅も現状より少し狭く(128/26)。
export const KATANA_DASH_DISTANCE = 128;
export const KATANA_DASH_HIT_HALF_WIDTH = 26;
// 一閃後のクールダウンは既存近接(カウンター)と同じ長さ。
export const KATANA_DASH_COOLDOWN_MS = COUNTER_WINDOW + COUNTER_COOLDOWN;
// 着地後の硬直(後隙)。刀・村雨共通。着地から この時間 は移動も次の一閃も不可。
export const KATANA_DASH_RECOVERY_MS = 200;
// TODO(刀): 仮値。PC二連打の受付時間。既存の操作感を見て調整可能にしてある。
export const KATANA_DOUBLE_TAP_MS = 260;
// TODO(刀): 仮値。フリック判定しきい値(直近サンプル窓・最低距離・最低速度)。
// 通常のジョイスティックドラッグは低速なのでフリック扱いにならない。
export const KATANA_FLICK_WINDOW_MS = 120;
export const KATANA_FLICK_MIN_DIST = 34;
export const KATANA_FLICK_MIN_SPEED = 0.9; // px/ms
export const SHOP_KATANA_COST = 100; // TODO(刀): 仮値。商人での刀カード価格。

export const hasKatana = (player: Player): boolean => player.subWeapons.includes('katana');
// 村雨(むらさめ): 刀Lv3の上位。弾の打ち返し・一閃のクールダウンが無く連発可能。
// 刀身シルバー。それ以外の仕様(オート斬撃・一閃3倍・斬・銃/ナイフ無効など)は
// 刀と同じ。村雨を持つ間も刀本体は所持したまま(ステータスは刀Lv3基準)。
export const hasMurasame = (player: Player): boolean => player.subWeapons.includes('murasame');
// 「刀モード」= 刀 または 村雨 を装備している。各所の hasKatana 判定はこれに揃える。
export const isKatanaMode = (player: Player): boolean => hasKatana(player) || hasMurasame(player);
export const katanaLevel = (player: Player): number =>
  Math.max(1, Math.min(3, player.subWeaponLevels['katana'] ?? (hasMurasame(player) ? 3 : 1)));
export const katanaRange = (player: Player): number =>
  KATANA_RANGE_BY_LEVEL[katanaLevel(player)];
// 刀装備中に併用を許可するサブウェポン(許可制)。現状は全サブウェポン停止。
// TODO(刀): 併用を解禁する時はこの配列にキーを追加する。
export const KATANA_ALLOWED_SUBWEAPONS: SubWeaponKey[] = [];
export const subWeaponBlockedByKatana = (player: Player, key: SubWeaponKey): boolean =>
  isKatanaMode(player) && key !== 'katana' && key !== 'murasame' && !KATANA_ALLOWED_SUBWEAPONS.includes(key);

// Hitstop: a melee finisher freezes the whole game briefly for impact.
export const HITSTOP_MS = 300;
const MELEE_FINISH_SLOW_MS = HITSTOP_MS + 520;
const MIN_TIME_SLOW_SCALE = 0.18;
const MAX_TIME_SLOW_SCALE = 1;
// Screen-shake duration when the player takes damage.
export const SHAKE_MS = 280;
// Inertia time constants (s). Velocity eases toward its target over this
// window. The player is now instant (0 = no inertia, snappy control); enemies
// keep 0.3s so they curve into turns instead of snapping.
export const PLAYER_INERTIA_TAU = 0;
export const ENEMY_INERTIA_TAU = 0.3;

// Easing factor for a given time constant. tau <= 0 means instant (alpha = 1).
const inertiaAlpha = (deltaTime: number, tau: number): number =>
  tau <= 0 ? 1 : 1 - Math.exp(-deltaTime / tau);

// Player base stats tuned to feel like Vampire Survivors' Antonio: slower
// than the previous build (so weapons matter more), modest HP, small body.
export const PLAYER_BASE_SPEED = 87;
export const PLAYER_BASE_HP = 120;
export const PLAYER_HITBOX = 28;
const RELOAD_MOVE_SPEED_MULT = 1;
export const INVULN_MS = 700;

// World is effectively infinite. We still need a finite number for spawn
// math elsewhere, but we use a very large clamp to remove the wall feel.
export const WORLD_HALF_EXTENT = 200000;

// Magnet pickup pulls every XP gem to the player. Bomb clears every enemy
// currently on screen.
export const MAGNET_DURATION_MS = 1; // we just sweep the field once, no timer needed

const BREAKABLE_PROP_DROP_CHANCE = 0.42;
const TORCH_STRAP_DROP_MIN = 5;
const TORCH_STRAP_DROP_VARIANCE = 16;
const WEAPON_CRATE_STRAP_DROP_MIN = 30;
const WEAPON_CRATE_STRAP_DROP_VARIANCE = 21;
const GOLD_STRAP_VALUE = 10;
const DROP_SCATTER_RADIUS = 42;
const WEAPON_CRATE_SCATTER_RADIUS = 92;
const DROP_THROW_DURATION_MS = 360;
const TREASURE_DROP_CHANCE_BY_RANK = {
  strong: 0.02,
  elite: 0.05,
  danger: 0.10,
} as const;
const TREASURE_VARIANTS_BY_RARITY = [4, 2, 3, 1, 5, 6] as const;
export const MINE_DAMAGE = 34; // Insect egg acid splash damage.
const MINE_AMBUSH_TIME_MS = 150000;
const MELEE_FINISH_COMBO_WINDOW_MS = 7000;
const GRENADE_BOUNCE_DAMPING = 0.86;
const GRENADE_ROLL_DRAG = 1.45;
const TRAP_ROOT_CRIT_BONUS = 0.10;
const weaponTierLabel = (tier?: number): string => `T${tier ?? 1}`;
const weaponTierColor = (tier?: number): string => {
  switch (tier ?? 1) {
    case 3: return '#facc15';
    case 2: return '#60a5fa';
    default: return '#f8fafc';
  }
};
const treasureDropChance = (rank?: DifficultyRank): number => {
  if (rank === 'strong') return TREASURE_DROP_CHANCE_BY_RANK.strong;
  if (rank === 'elite') return TREASURE_DROP_CHANCE_BY_RANK.elite;
  if (rank === 'danger') return TREASURE_DROP_CHANCE_BY_RANK.danger;
  return 0;
};
const treasureValueForRank = (rank?: DifficultyRank): number => {
  if (rank === 'danger') return 4 + Math.floor(Math.random() * 3);
  if (rank === 'elite') return 2 + Math.floor(Math.random() * 3);
  return 1 + Math.floor(Math.random() * 2);
};
const treasureVariantForValue = (value: number): number =>
  TREASURE_VARIANTS_BY_RARITY[Math.max(0, Math.min(TREASURE_VARIANTS_BY_RARITY.length - 1, value - 1))];
const treasureNameForVariant = (variant?: number): string => {
  switch (variant) {
    case 1: return 'ニケ像';
    case 2: return '宝石袋';
    case 3: return 'ダイヤのネックレス';
    case 4: return '高級腕時計';
    case 5: return '変異種血液サンプル';
    case 6: return '謎のコア';
    default: return 'トレジャー';
  }
};
const pickupWithDropScatter = (pickup: Pickup): Pickup => {
  if (
    pickup.worldDrop ||
    pickup.throwFromX !== undefined ||
    pickup.throwFromY !== undefined ||
    pickup.throwStartAt !== undefined ||
    pickup.throwDuration !== undefined
  ) {
    return pickup;
  }

  const angle = Math.random() * Math.PI * 2;
  const scatterRadius = pickup.scatterRadius ?? DROP_SCATTER_RADIUS;
  const dist = 5 + Math.random() * scatterRadius;
  return {
    ...pickup,
    x: pickup.x + Math.cos(angle) * dist,
    y: pickup.y + Math.sin(angle) * dist * 0.72,
    throwFromX: pickup.x,
    throwFromY: pickup.y,
    throwStartAt: Date.now(),
    throwDuration: DROP_THROW_DURATION_MS
  };
};
const strapDropValues = (totalValue: number): number[] => {
  const total = Math.max(0, Math.floor(totalValue));
  if (total <= 0) return [];
  if (total <= 20) return Array.from({ length: total }, () => 1);

  const goldCount = Math.floor((total - 11) / GOLD_STRAP_VALUE);
  const normalCount = total - goldCount * GOLD_STRAP_VALUE;
  return [
    ...Array.from({ length: goldCount }, () => GOLD_STRAP_VALUE),
    ...Array.from({ length: normalCount }, () => 1)
  ];
};
export const classSubWeaponFor = (characterClass: CharacterClass): SubWeaponKey => {
  switch (characterClass) {
    case 'warrior': return 'heavy-grenade';
    case 'mage': return 'marksman-trap';
    case 'rogue': return 'striker-hunting';
    case 'necromancer': return 'striker-quick-mag';
    default: return 'heavy-grenade';
  }
};
export const subWeaponDisplayName = (key: SubWeaponKey): string => {
  switch (key) {
    case 'heavy-grenade': return '手榴弾';
    case 'marksman-trap': return 'トラップ';
    case 'striker-quick-mag': return 'クイックマガジン';
    case 'striker-hunting': return 'ハンティング';
    case 'dog': return 'ドッグ';
    case 'katana': return '刀';
    case 'murasame': return '村雨';
    case 'decoy': return 'デコイ';
    case 'shield': return 'シールド';
    default: return 'サブウェポン';
  }
};
// Shared per-kill rewards for melee-grade kills (the release counter swing and
// the katana strikes). Mirrors what the counter has always granted: XP pickup,
// enemy currency, ammo scavenge for the active gun family, boss weapon crates,
// and finisher juice. Extracted from triggerCounter so the katana reuses the
// exact same finisher judgement/演出 without duplicating reward rules.
const grantMeleeKillRewards = (
  get: () => GameState,
  killed: { enemy: Enemy; finisher: boolean }[],
  player: Player,
  gun: Weapon | undefined,
  suppressKillCallout = false
) => {
  for (const { enemy, finisher } of killed) {
    const ex = enemy.x + enemy.width / 2;
    const ey = enemy.y + enemy.height / 2;
    const xp = finisher
      ? Math.max(1, Math.round(enemy.experienceValue * 1.5))
      : enemy.experienceValue;
    get().addPickup({
      id: `pickup-xp-melee-${enemy.id}`,
      x: ex - 8, y: ey - 8, type: 'experience', value: xp
    });
    get().dropEnemyCurrency(enemy, ex, ey);
    // Ammo scavenge: base rate is the start-screen setting; a finisher
    // (executing a stunned enemy) rolls at 1.5× that, capped at 100%.
    // Prefer the active gun's family; if the active pointer is temporarily
    // invalid, fall back to any owned gun so the slider still governs melee.
    const baseRate = get().meleeAmmoDropPercent / 100;
    const ammoChance = finisher ? Math.min(1, baseRate * 1.5) : baseRate;
    const ownedAmmoTypes = getGuns(player)
      .map(w => w.ammoType)
      .filter((t): t is AmmoType => !!t);
    const dropType = gun?.ammoType ?? ownedAmmoTypes[0];
    if (dropType && Math.random() < ammoChance) {
      get().addPickup({
        id: `pickup-ammo-melee-${enemy.id}`,
        x: ex - 8 + 14, y: ey - 8,
        type: `ammo-${dropType}` as 'ammo-handgun' | 'ammo-shotgun' | 'ammo-rifle',
        value: 0
      });
    }
    // Mid-boss killed in melee still drops its weapon crate (the gun-kill
    // path drops one too; bosses are usually finished with the counter).
    if (enemy.type === 'pumpkin' || enemy.type === 'giantbat') {
      get().addPickup({
        id: `pickup-crate-${enemy.id}`,
        x: ex - 8, y: ey - 8 - 18,
        type: 'weapon-crate',
        value: 0
      });
      get().spawnRing(ex, ey, 10, 80, 'rgba(96,165,250,0.7)', 3, 500);
    }
    if (finisher) {
      // Finisher juice: white shockwave + gold ring + sparks + glow + callout.
      get().spawnBurst(ex, ey, '#dc2626', 30);
      get().spawnBurst(ex, ey, '#7f1d1d', 14);
      get().spawnRing(ex, ey, 10, 92, 'rgba(255,255,255,0.95)', 3, 280);
      get().spawnRing(ex, ey, 8, 64, 'rgba(252,211,77,0.95)', 4, 380);
      get().spawnRing(ex, ey, 4, 34, 'rgba(185,28,28,0.72)', 3, 320);
      get().spawnGlow(ex, ey, 46, 'rgba(253,224,71,', MELEE_FINISH_SLOW_MS);
      // "Kill!" callout over the executed enemy's head. 刀の一閃は代わりに
      // 軌道中央へ「斬」を出すので、ここでは出さない。
      if (!suppressKillCallout) {
        get().spawnCallout(ex, enemy.y - 6, 'Kill!', '#fb7185');
      }
    } else {
      get().spawnBurst(ex, ey, '#dc2626', 16);
      get().spawnBurst(ex, ey, '#7f1d1d', 7);
      get().spawnRing(ex, ey, 4, 24, 'rgba(185,28,28,0.68)', 3, 280);
    }
  }
};

const applySubWeaponCard = (player: Player, key: SubWeaponKey, cardLevel?: number): Player => {
  const known = player.subWeapons.includes(key);
  const currentLevel = player.subWeaponLevels[key] ?? 0;
  const nextLevel = Math.min(3, Math.max(currentLevel + 1, cardLevel || 1));
  return {
    ...player,
    subWeapons: known ? player.subWeapons : [...player.subWeapons, key],
    subWeaponLevels: {
      ...player.subWeaponLevels,
      [key]: nextLevel
    }
  };
};

interface GameState {
  player: Player;
  enemies: Enemy[];
  projectiles: Projectile[];
  pickups: Pickup[];
  breakableProps: BreakableProp[];
  destroyedBreakableProps: Record<string, true>;
  mineAmbushAnchor: MineAmbushAnchor | null;
  castleEvent: CastleEvent;
  weaponMerchant: WeaponMerchant;
  eventQuestNpc: EventQuestNpc;
  gameTime: number;
  isPaused: boolean;
  showUpgradeMenu: boolean;
  showShopMenu: boolean;
  showEventQuestMenu: boolean;
  shopReopenAt: number;
  eventQuestReopenAt: number;
  vaccinePurchased: boolean;
  // Flipped true the moment the finale boss (giantbat) dies — the run is won.
  gameWon: boolean;
  // Start-screen setting: melee-kill ammo drop rate (percent).
  meleeAmmoDropPercent: number;
  // Debug setting: ammo granted by one ammo-box pickup per weapon family.
  ammoPickupAmounts: Record<AmmoType, number>;
  unlockedShopSkillCards: Partial<Record<SubWeaponKey, number>>;
  startWithTestStraps: boolean;
  meleeFinishComboCount: number;
  meleeFinishComboUntil: number;
  upgradeOptions: UpgradeOption[];
  inputState: InputState;
  swipeDirection: { x: number; y: number } | null;
  touchActive: boolean;
  gameBounds: GameBounds;
  gameStats: GameStats;
  characterClass: CharacterClass;
  effects: VisualEffect[];
  camera: {
    x: number;
    y: number;
  };
  // Most recent weapon the player acquired (drop/crate). The HUD shows a
  // 5-second "got a weapon" popup off this. null until the first pickup.
  lastWeaponGet: { name: string; at: number; color?: string; kind?: 'weapon' | 'treasure' } | null;
  // Global hitstop: while Date.now() < hitstopUntil the simulation is frozen
  // (melee-finisher impact pause). 0 = running.
  hitstopUntil: number;
  // Strong-event slow motion. Rendering/audio continue; simulation delta is
  // multiplied by timeSlowScale until this timestamp.
  timeSlowUntil: number;
  timeSlowScale: number;
  // Screen shake: jitter the canvas while Date.now() < shakeUntil (set on hit).
  shakeUntil: number;

  // Player actions
  movePlayer: (input: InputState, deltaTime: number) => void;
  setSwipeDirection: (direction: { x: number; y: number } | null) => void;
  setTouchActive: (active: boolean) => void;
  setLastDirection: (direction: { x: number; y: number } | null) => void;
  damagePlayer: (amount: number) => boolean;
  gainExperience: (amount: number) => void;
  levelUp: () => void;
  triggerCounter: () => CounterTriggerResult;
  // Katana actions. performKatanaStrike cuts the given enemies with katana
  // melee rules (crit, knockback, shared kill rewards). 近接フィニッシュは
  // 一閃のみ: allowFinisher は dash 経由でだけ true になる。
  // triggerKatanaDash starts the invulnerable dash and cuts along its path.
  performKatanaStrike: (targetIds: string[], damageMult: number, allowFinisher: boolean) => { hit: boolean; finish: boolean; killed: number };
  triggerKatanaDash: (dirX: number, dirY: number) => boolean;

  // Weapon actions
  fireWeapons: (currentTime: number) => void;
  selectUpgrade: (upgrade: UpgradeOption) => void;
  learnSubWeapon: (key: SubWeaponKey) => void;
  setSubWeaponCooldown: (key: SubWeaponKey, readyAt: number) => void;
  updateHuntingCharge: (startedAt: number, charged: boolean) => void;
  buyShopItem: (key: ShopItemKey, ammoType?: AmmoType) => boolean;
  buySkillCardFromShop: (key: SubWeaponKey) => boolean;
  openShop: () => void;
  closeShop: () => void;
  openEventQuest: () => void;
  acceptEventQuest: () => void;
  declineEventQuest: () => void;
  completeEventQuest: () => void;
  
  // Enemy actions
  addEnemy: (enemy: Enemy) => void;
  removeEnemy: (id: string) => void;
  damageEnemy: (id: string, amount: number) => boolean;
  updateEnemies: (deltaTime: number) => void;
  stunEnemy: (id: string, until: number) => void;
  rootEnemy: (id: string, until: number) => void;
  knockbackEnemy: (id: string, dirX: number, dirY: number, multiplier?: number) => void;
  markCastleBossSpawned: () => void;

  // Ammo
  addAmmo: (type: AmmoType, amount: number) => void;

  // Weapons (drops / crates)
  grantWeapon: (key: string) => void;
  setActiveWeapon: (id: string) => void;
  autoSwitchIfDry: () => void;
  startReload: (weaponId: string) => void;
  tickReload: () => void;

  // Projectile actions
  addProjectile: (projectile: Projectile) => void;
  removeProjectile: (id: string) => void;
  updateProjectiles: (deltaTime: number) => void;
  reflectProjectile: (id: string, multiplier?: number) => void;
  
  // Pickup actions
  addPickup: (pickup: Pickup) => void;
  removePickup: (id: string) => void;
  collectPickup: (id: string) => void;
  dropEnemyCurrency: (enemy: Enemy, x: number, y: number) => void;

  // Breakable props
  syncBreakableProps: (camera: { x: number; y: number }, bounds: GameBounds) => void;
  damageBreakableProp: (id: string, amount: number) => BreakableProp | null;
  dropBreakablePropLoot: (prop: BreakableProp) => void;
  
  // Game state actions
  setGameTime: (time: number) => void;
  setPaused: (paused: boolean) => void;
  setMeleeAmmoDropPercent: (pct: number) => void;
  setAmmoPickupAmount: (type: AmmoType, amount: number) => void;
  setUnlockedShopSkillCard: (key: SubWeaponKey, level: number) => void;
  setStartWithTestStraps: (enabled: boolean) => void;
  addMeleeFinishCombo: (amount?: number) => void;
  setGameBounds: (bounds: GameBounds) => void;
  updateGameStats: (stats: Partial<GameStats>) => void;
  resetGame: (characterClass: string) => void;
  setCameraPosition: (x: number, y: number) => void;
  triggerTimeSlow: (scale: number, durationMs: number) => void;

  // Visual effects (renderer-only; no gameplay impact)
  spawnEffect: (effect: VisualEffect) => void;
  spawnBurst: (x: number, y: number, color: string, count?: number) => void;
  spawnDamageNumber: (x: number, y: number, value: number, crit?: boolean) => void;
  spawnAmmoNumber: (x: number, y: number, amount: number) => void;
  spawnCallout: (x: number, y: number, text: string, color: string, opts?: { scale?: number; serif?: boolean }) => void;
  spawnRing: (x: number, y: number, startRadius: number, endRadius: number, color: string, width?: number, duration?: number) => void;
  spawnGlow: (x: number, y: number, radius: number, color: string, duration?: number) => void;
  spawnSlash: (x: number, y: number, color?: string, lengthScale?: number) => void;
  spawnFlash: (color: string, duration?: number) => void;
  updateEffects: (deltaTime: number) => void;
}

export const useGameStore = create<GameState>((set, get) => ({
  player: {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    width: PLAYER_HITBOX,
    height: PLAYER_HITBOX,
    speed: PLAYER_BASE_SPEED,
    health: PLAYER_BASE_HP,
    maxHealth: PLAYER_BASE_HP,
    experience: 0,
    level: 1,
    experienceToNextLevel: 5,
    weapons: [],
    activeWeaponId: '',
    characterClass: 'warrior',
    direction: 'idle',
    isMoving: false,
    invulnerable: false,
    invulnerableTime: 0,
    lastDirection: null,
    counterWindowEnd: 0,
    counterCooldownEnd: 0,
    lastCounterSuccessTime: 0,
    ammoHandgun: AMMO_INITIAL.handgun,
    ammoShotgun: AMMO_INITIAL.shotgun,
    ammoRifle: AMMO_INITIAL.rifle,
    critChance: 0,
    quickMagCritUntil: 0,
    reloadEndsAt: 0,
    reloadingWeaponId: '',
    magBonus: 0,
    reloadMult: 1,
    subWeapons: [],
    subWeaponLevels: {},
    subWeaponCooldowns: {},
    huntingChargeStartedAt: 0,
    huntingCharged: false,
    katanaDashUntil: 0,
    katanaDashDirX: 0,
    katanaDashDirY: 0,
    katanaDashCooldownEnd: 0,
    katanaRecoveryUntil: 0,
    straps: 0,
    vaccineRevives: 0
  },
  enemies: [],
  projectiles: [],
  pickups: [],
  breakableProps: [],
  destroyedBreakableProps: {},
  mineAmbushAnchor: null,
  castleEvent: createCastleEvent(),
  weaponMerchant: createWeaponMerchant(),
  eventQuestNpc: createEventQuestNpc(),
  gameTime: 0,
  isPaused: false,
  showUpgradeMenu: false,
  showShopMenu: false,
  showEventQuestMenu: false,
  shopReopenAt: 0,
  eventQuestReopenAt: 0,
  vaccinePurchased: false,
  gameWon: false,
  meleeAmmoDropPercent: loadMeleeDropPct(),
  ammoPickupAmounts: loadAmmoPickupAmounts(),
  unlockedShopSkillCards: {},
  startWithTestStraps: false,
  meleeFinishComboCount: 0,
  meleeFinishComboUntil: 0,
  upgradeOptions: [],
  inputState: { up: false, down: false, left: false, right: false },
  swipeDirection: null,
  touchActive: false,
  gameBounds: { width: 800, height: 600 },
  gameStats: {
    timeAlive: 0,
    enemiesKilled: 0,
    damageDealt: 0,
    experienceCollected: 0,
    maxLevel: 1,
    maxCombo: 0,
    strapsCollected: 0,
    strapsSpent: 0,
    treasuresCollected: 0
  },
  characterClass: 'warrior',
  effects: [],
  camera: {
    x: 0,
    y: 0
  },
  lastWeaponGet: null,
  hitstopUntil: 0,
  timeSlowUntil: 0,
  timeSlowScale: 1,
  shakeUntil: 0,

  // Player actions
  movePlayer: (input, deltaTime) => {
    set(state => {
      const { player, gameBounds, swipeDirection, breakableProps, castleEvent } = state;
      const solidProps = breakableProps.filter(p => p.type !== 'mine');
      void gameBounds; // World is effectively infinite — no clamp.

      // Reload movement penalty is kept as a single multiplier for tuning.
      // Currently 1.0, so reloading does not slow movement.
      const reloading =
        player.reloadingWeaponId !== '' && Date.now() < player.reloadEndsAt;
      // 一閃ダッシュ中は入力を無視して固定方向へ高速移動する。
      const nowMs = Date.now();
      const dashing = nowMs < player.katanaDashUntil;
      // 着地後の硬直中(刀・村雨共通)は移動入力を受け付けない(その場で停止)。
      const recovering = !dashing && nowMs < player.katanaRecoveryUntil;
      const moveSpeed = dashing
        ? KATANA_DASH_DISTANCE / (KATANA_DASH_MS / 1000)
        : recovering ? 0
        : reloading ? player.speed * RELOAD_MOVE_SPEED_MULT : player.speed;

      // Target direction from swipe (touch) or keys.
      let tx = 0;
      let ty = 0;
      if (dashing) {
        tx = player.katanaDashDirX;
        ty = player.katanaDashDirY;
      } else if (recovering) {
        tx = 0;
        ty = 0;
      } else if (swipeDirection) {
        tx = swipeDirection.x;
        ty = swipeDirection.y;
      } else {
        if (input.up) ty -= 1;
        if (input.down) ty += 1;
        if (input.left) tx -= 1;
        if (input.right) tx += 1;
      }
      const tlen = Math.hypot(tx, ty);
      if (tlen > 0) { tx /= tlen; ty /= tlen; }

      // Inertia: ease the velocity toward the target. Player tau is 0 → fully
      // instant, responsive control.
      const alpha = inertiaAlpha(deltaTime, PLAYER_INERTIA_TAU);
      const vx = player.vx + (tx * moveSpeed - player.vx) * alpha;
      const vy = player.vy + (ty * moveSpeed - player.vy) * alpha;

      // Block the player's hitbox out of tree trunks (rectangle AABB only).
      const treeResolved = resolveTreeCollision({
        x: player.x + vx * deltaTime,
        y: player.y + vy * deltaTime,
        width: player.width,
        height: player.height,
      });
      const resolved = resolveTorchCollision({
        x: treeResolved.x,
        y: treeResolved.y,
        width: player.width,
        height: player.height,
      }, solidProps);
      const castleResolved = resolveCastleCollision({
        x: resolved.x,
        y: resolved.y,
        width: player.width,
        height: player.height,
      }, castleEvent);
      const newX = castleResolved.x;
      const newY = castleResolved.y;

      const speedNow = Math.hypot(vx, vy);
      let direction: Direction = 'idle';
      let lastDirection = player.lastDirection;
      if (speedNow > 1) {
        lastDirection = { x: vx / speedNow, y: vy / speedNow };
        direction = Math.abs(vx) > Math.abs(vy)
          ? (vx > 0 ? 'right' : 'left')
          : (vy > 0 ? 'down' : 'up');
      }
      const isMoving = speedNow > moveSpeed * 0.15;

      return {
        player: {
          ...player,
          x: newX,
          y: newY,
          vx,
          vy,
          direction,
          isMoving,
          lastDirection
        }
      };
    });
  },
  
  setSwipeDirection: (direction) => {
    set({ swipeDirection: direction });
  },

  setTouchActive: (active) => {
    set({ touchActive: active });
  },

  setLastDirection: (direction) => {
    set(state => ({
      player: {
        ...state.player,
        lastDirection: direction
      }
    }));
  },
  
  triggerCounter: () => {
    const now = Date.now();
    const {
      player, gameTime, enemies, breakableProps, projectiles, weaponMerchant,
      eventQuestNpc, showShopMenu, showEventQuestMenu, showUpgradeMenu,
      shopReopenAt, eventQuestReopenAt
    } = get();
    // Respect cooldown — no swing, no knockback, no window.
    if (now < player.counterCooldownEnd) return { swung: false, hit: false, finish: false, killed: 0 };

    const melee = player.weapons.find(w => w.isMelee);
    const gun = getActiveGun(player); // finisher refunds into the active gun
    const meleeDamage = melee?.damage ?? 6;
    const pcx = player.x + player.width / 2;
    const pcy = player.y + player.height / 2;
    const meleeRange = huntingMeleeRadius(player);
    const mdx = weaponMerchant.x - pcx;
    const mdy = weaponMerchant.y - pcy;
    if (
      !showShopMenu &&
      !showUpgradeMenu &&
      gameTime >= shopReopenAt &&
      mdx * mdx + mdy * mdy <= weaponMerchant.radius * weaponMerchant.radius
    ) {
      set({
        showShopMenu: true,
        isPaused: true,
        touchActive: false,
        swipeDirection: null,
        player: {
          ...player,
          counterWindowEnd: now + COUNTER_WINDOW,
          counterCooldownEnd: now + COUNTER_WINDOW + COUNTER_COOLDOWN,
        }
      });
      get().spawnRing(weaponMerchant.x, weaponMerchant.y - 26, 12, 58, 'rgba(251,191,36,0.88)', 3, SHOP_INTERACT_RING_MS);
      get().spawnGlow(weaponMerchant.x, weaponMerchant.y - 28, 62, 'rgba(251,191,36,', SHOP_INTERACT_RING_MS);
      get().spawnCallout(weaponMerchant.x, weaponMerchant.y - 70, 'SHOP', '#fde68a');
      return { swung: true, hit: true, finish: false, killed: 0 };
    }

    const qdx = eventQuestNpc.x - pcx;
    const qdy = eventQuestNpc.y - pcy;
    if (
      eventQuestNpc.status === 'available' &&
      !showShopMenu &&
      !showEventQuestMenu &&
      !showUpgradeMenu &&
      gameTime >= eventQuestReopenAt &&
      qdx * qdx + qdy * qdy <= eventQuestNpc.radius * eventQuestNpc.radius
    ) {
      set({
        showEventQuestMenu: true,
        isPaused: true,
        touchActive: false,
        swipeDirection: null,
        player: {
          ...player,
          counterWindowEnd: now + COUNTER_WINDOW,
          counterCooldownEnd: now + COUNTER_WINDOW + COUNTER_COOLDOWN,
        }
      });
      get().spawnRing(eventQuestNpc.x, eventQuestNpc.y - 22, 12, 62, 'rgba(96,165,250,0.82)', 3, SHOP_INTERACT_RING_MS);
      get().spawnGlow(eventQuestNpc.x, eventQuestNpc.y - 30, 68, 'rgba(96,165,250,', SHOP_INTERACT_RING_MS);
      get().spawnCallout(eventQuestNpc.x, eventQuestNpc.y - 76, 'QUEST', '#bfdbfe');
      return { swung: true, hit: true, finish: false, killed: 0 };
    }

    // 刀装備中: 通常ナイフのスイープ(ダメージ/ノックバック/フィニッシュ/
    // グレネード起爆/トラップ押し出し/小物破壊)は行わない。既存カウンター条件
    // (ウィンドウ中に敵弾が当たると反射)だけは生かすため、窓とクールダウンは
    // 通常どおり開く。反射が成立した時のみ既存のカウンター成立演出が出る
    // (成立エフェクトはループ側の lastCounterSuccessTime エッジ検出が担当)。
    if (isKatanaMode(player)) {
      // 村雨は打ち返し(カウンター)もクールダウン無しで連発可能。刀は通常CD。
      const counterCd = hasMurasame(player) ? now : now + COUNTER_WINDOW + COUNTER_COOLDOWN;
      set(state => ({
        player: {
          ...state.player,
          counterWindowEnd: now + COUNTER_WINDOW,
          counterCooldownEnd: counterCd,
        }
      }));
      return { swung: false, hit: false, finish: false, killed: 0 };
    }

    // Single sweep: every non-reaper enemy in melee range is either finished
    // (if stunned) for an instant kill, or takes light damage + knockback.
    // The counter window for reflecting bullets opens at the same time, so
    // the one finger-release does melee, knockback, and bullet-parry together.
    const killed: { enemy: Enemy; finisher: boolean }[] = [];
    let bossFinishHit = false; // finisher-grade damage landed on a stunned boss
    const survivors: Enemy[] = [];
    const meleeDamageNumbers: { x: number; y: number; value: number; crit: boolean }[] = [];
    const slashAt: { x: number; y: number }[] = [];
    const meleeCritChance = melee?.critChance ?? 0;
    const grenadesToDetonate = projectiles
      .filter(p => p.weaponType === 'grenade')
      .filter(p => {
        const gx = p.x + p.width / 2;
        const gy = p.y + p.height / 2;
        return Math.hypot(gx - pcx, gy - pcy) <= meleeRange;
      })
      .map(p => p.id);
    const trapShoves = projectiles
      .filter(p => p.weaponType === 'trap')
      .filter(p => {
        const tx = p.x + p.width / 2;
        const ty = p.y + p.height / 2;
        return Math.hypot(tx - pcx, ty - pcy) <= meleeRange;
      })
      .map(p => {
        const tx = p.x + p.width / 2;
        const ty = p.y + p.height / 2;
        const pushDx = tx - pcx;
        const pushDy = ty - pcy;
        const norm = Math.hypot(pushDx, pushDy);
        const ux = norm > 0.001 ? pushDx / norm : 0;
        const uy = norm > 0.001 ? pushDy / norm : 1;
        return {
          id: p.id,
          fromX: p.x,
          fromY: p.y,
          x: p.x + ux * TRAP_MELEE_SHOVE_DISTANCE,
          y: p.y + uy * TRAP_MELEE_SHOVE_DISTANCE,
          cx: tx,
          cy: ty,
        };
      });

    // シールドバッシュ: メレー範囲にシールド(壁)があれば、その近傍の敵を強打して
    // シールドを壊す。壁の最近点がメレー円に入っていれば対象(長い壁でも端で反応)。
    const shieldsInRange = projectiles
      .filter(p => p.weaponType === 'shield')
      .filter(p => {
        const nx = Math.max(p.x, Math.min(pcx, p.x + p.width));
        const ny = Math.max(p.y, Math.min(pcy, p.y + p.height));
        return Math.hypot(pcx - nx, pcy - ny) <= meleeRange;
      });
    const bashShield = shieldsInRange[0] ?? null;
    const bashCx = bashShield ? bashShield.x + bashShield.width / 2 : 0;
    const bashCy = bashShield ? bashShield.y + bashShield.height / 2 : 0;
    const shieldsToBash = shieldsInRange.map(p => p.id);

    for (const enemy of enemies) {
      if (enemy.type === 'reaper') { survivors.push(enemy); continue; }
      const ecx = enemy.x + enemy.width / 2;
      const ecy = enemy.y + enemy.height / 2;
      const dx = ecx - pcx;
      const dy = ecy - pcy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      // バッシュ対象 = シールド中心 SHIELD_BASH_RADIUS 内の敵(メレー範囲外でも当たる)。
      const bdist = bashShield ? Math.hypot(ecx - bashCx, ecy - bashCy) : Infinity;
      const isBash = bashShield !== null && bdist <= SHIELD_BASH_RADIUS;
      if (dist > meleeRange && !isBash) { survivors.push(enemy); continue; }

      // バッシュ: 近接ダメージ×3 + 外向き強ノックバック(シールド中心→敵)。フィニッシュ無し。
      if (isBash) {
        slashAt.push({ x: ecx, y: ecy });
        const dmg = meleeDamage * SHIELD_BASH_DAMAGE_MULT;
        meleeDamageNumbers.push({ x: ecx, y: enemy.y, value: Math.round(dmg), crit: true });
        const newHealth = Math.max(0, enemy.health - dmg);
        if (newHealth <= 0) { killed.push({ enemy, finisher: false }); continue; }
        const bnorm = Math.max(0.001, bdist);
        survivors.push({
          ...enemy,
          health: newHealth,
          lastHit: now,
          knockbackVx: ((ecx - bashCx) / bnorm) * SHIELD_BASH_KNOCKBACK_SPEED,
          knockbackVy: ((ecy - bashCy) / bnorm) * SHIELD_BASH_KNOCKBACK_SPEED,
          knockbackUntil: now + KNOCKBACK_DURATION,
          knockbackImmuneUntil: now + KNOCKBACK_IMMUNE_MS,
        });
        continue;
      }

      // Anything in reach gets cut — show a slash on it.
      slashAt.push({ x: ecx, y: ecy });
      const stunned = enemy.stunUntil !== undefined && gameTime < enemy.stunUntil;
      if (stunned) {
        if (isBossType(enemy.type)) {
          // Bosses can't be instakilled. A melee hit on a stunned boss deals
          // 5× melee damage and shakes off the stun (no finisher).
          bossFinishHit = true;
          const dmg = meleeDamage * BOSS_MELEE_STUN_MULT;
          meleeDamageNumbers.push({ x: ecx, y: enemy.y, value: Math.round(dmg), crit: true });
          const newHealth = Math.max(0, enemy.health - dmg);
          if (newHealth <= 0) {
            killed.push({ enemy, finisher: false });
          } else {
            survivors.push({
              ...enemy,
              health: newHealth,
              stunUntil: undefined,
              lastHit: now,
              liftUntil: now + 420,
            });
          }
          continue;
        }
        killed.push({ enemy, finisher: true }); // normal instant execute
        continue;
      }
      // Melee weapons carry a fixed crit chance (varies by weapon). A crit
      // multiplies the swing's damage and pops a gold number.
      const trapCritBonus = enemy.rootUntil !== undefined && gameTime < enemy.rootUntil
        ? TRAP_ROOT_CRIT_BONUS
        : 0;
      const crit = Math.random() < Math.min(1, meleeCritChance + trapCritBonus);
      const dmg = meleeDamage * (crit ? CRIT_DAMAGE_MULT : 1);
      meleeDamageNumbers.push({ x: ecx, y: enemy.y, value: Math.round(dmg), crit });
      const newHealth = Math.max(0, enemy.health - dmg);
      if (newHealth <= 0) {
        killed.push({ enemy, finisher: false });
        continue;
      }
      // Knockback, unless this enemy was shoved recently (debounce to avoid
      // locking it in an infinite stagger). Damage still landed above.
      if (now >= (enemy.knockbackImmuneUntil ?? 0)) {
        const norm = Math.max(0.001, dist);
        const falloff = 1 - dist / meleeRange;
        const speed = KNOCKBACK_SPEED * (0.5 + falloff * 0.5);
        survivors.push({
          ...enemy,
          health: newHealth,
          lastHit: now,
          knockbackVx: (dx / norm) * speed,
          knockbackVy: (dy / norm) * speed,
          knockbackUntil: now + KNOCKBACK_DURATION,
          knockbackImmuneUntil: now + KNOCKBACK_IMMUNE_MS
        });
      } else {
        // Knockback is on cooldown for this enemy (recently shoved): don't shove
        // again — instead freeze it in place for 0.1s. We reuse the knockback
        // override with zero velocity, so updateEnemies holds it still (no chase)
        // for the duration while the damage above still lands.
        survivors.push({
          ...enemy,
          health: newHealth,
          lastHit: now,
          knockbackVx: 0,
          knockbackVy: 0,
          knockbackUntil: now + 100,
        });
      }
    }

    // A melee finisher (instant execute) triggers a brief full-game hitstop.
    const finisherHit = killed.some(k => k.finisher);
    const comboFinishCount = killed.filter(k => k.finisher).length + (bossFinishHit ? 1 : 0);
    const bossKilled = killed.some(k => k.enemy.type === 'giantbat');
    set(state => ({
      enemies: survivors,
      gameStats: {
        ...state.gameStats,
        enemiesKilled: state.gameStats.enemiesKilled + killed.length,
        damageDealt: state.gameStats.damageDealt +
          meleeDamageNumbers.reduce((sum, n) => sum + n.value, 0),
        maxCombo: comboFinishCount > 0
          ? Math.max(
              state.gameStats.maxCombo,
              state.meleeFinishComboUntil >= gameTime
                ? state.meleeFinishComboCount + comboFinishCount
                : comboFinishCount
            )
          : state.gameStats.maxCombo
      },
      gameWon: state.gameWon || bossKilled,
      meleeFinishComboCount: comboFinishCount > 0
        ? (state.meleeFinishComboUntil >= gameTime ? state.meleeFinishComboCount + comboFinishCount : comboFinishCount)
        : state.meleeFinishComboCount,
      meleeFinishComboUntil: comboFinishCount > 0
        ? gameTime + MELEE_FINISH_COMBO_WINDOW_MS
        : state.meleeFinishComboUntil,
      hitstopUntil: finisherHit ? now + HITSTOP_MS : state.hitstopUntil,
      player: {
        ...state.player,
        counterWindowEnd: now + COUNTER_WINDOW,
        counterCooldownEnd: now + COUNTER_WINDOW + COUNTER_COOLDOWN,
        huntingCharged: false,
        huntingChargeStartedAt: 0
      },
      projectiles: grenadesToDetonate.length > 0 || trapShoves.length > 0 || shieldsToBash.length > 0
        ? state.projectiles
          .filter(p => !shieldsToBash.includes(p.id)) // バッシュしたシールドは破壊
          .map(p =>
            grenadesToDetonate.includes(p.id)
              ? { ...p, createdAt: now - Math.max(1, p.duration) }
              : trapShoves.some(t => t.id === p.id)
                ? {
                    ...p,
                    shoveStartX: trapShoves.find(t => t.id === p.id)?.fromX ?? p.x,
                    shoveStartY: trapShoves.find(t => t.id === p.id)?.fromY ?? p.y,
                    shoveStartAt: now,
                    shoveDuration: TRAP_MELEE_SHOVE_SLIDE_MS,
                    x: trapShoves.find(t => t.id === p.id)?.x ?? p.x,
                    y: trapShoves.find(t => t.id === p.id)?.y ?? p.y,
                  }
              : p
          )
        : state.projectiles
    }));

    for (const id of grenadesToDetonate) {
      const grenade = projectiles.find(p => p.id === id);
      if (grenade) {
        get().spawnSlash(grenade.x + grenade.width / 2, grenade.y + grenade.height / 2);
      }
    }
    for (const trap of trapShoves) {
      get().spawnSlash(trap.cx, trap.cy, 'rgba(125,211,252,0.9)');
      get().spawnRing(trap.cx, trap.cy, 4, 22, 'rgba(56,189,248,0.58)', 2, 220);
    }

    // シールドバッシュの破壊演出(シルバーの破片+衝撃リング)。
    for (const s of shieldsInRange) {
      const scx = s.x + s.width / 2;
      const scy = s.y + s.height / 2;
      get().spawnSlash(scx, scy, 'rgba(203,213,225,0.95)');
      get().spawnRing(scx, scy, 6, SHIELD_BASH_RADIUS, 'rgba(203,213,225,0.7)', 3, 280);
      get().spawnBurst(scx, scy, '#94a3b8', 16);
      get().spawnBurst(scx, scy, '#475569', 8);
    }

    // Slash streaks on every enemy that was cut.
    for (const s of slashAt) {
      get().spawnSlash(s.x, s.y);
    }

    // Damage numbers for every non-execute melee hit; crits/boss-stun hits pop gold.
    for (const c of meleeDamageNumbers) {
      get().spawnDamageNumber(c.x, c.y, c.value, c.crit);
    }

    // Per-kill rewards. Finishers grant bonus XP + gold VFX. EVERY melee kill
    // also DROPS an ammo box for the active gun's family — melee is the run's
    // main way to scavenge rounds, but you have to walk over the drop.
    grantMeleeKillRewards(get, killed, player, gun);
    if (killed.some(k => k.finisher)) {
      get().spawnFlash('rgba(253, 224, 71, 0.28)', 200);
    }
    if (finisherHit || bossFinishHit) {
      get().triggerTimeSlow(0.4, MELEE_FINISH_SLOW_MS);
    }

    let propHit = false;
    for (const prop of breakableProps) {
      const dx = prop.footX - pcx;
      const dy = prop.footY - pcy;
      if (Math.hypot(dx, dy) > meleeRange) continue;
      propHit = true;
      const broken = get().damageBreakableProp(prop.id, meleeDamage * 2.5);
      get().spawnSlash(prop.footX, prop.footY - prop.height * 0.8, 'rgba(255,243,196,0.95)');
      if (broken) {
        if (broken.type === 'mine') {
          get().spawnBurst(broken.footX, broken.footY - 8, '#84cc16', 30);
          get().spawnBurst(broken.footX, broken.footY - 8, '#166534', 16);
          get().spawnRing(broken.footX, broken.footY - 8, 5, 50, 'rgba(132,204,22,0.82)', 4, 320);
          get().spawnGlow(broken.footX, broken.footY - 8, 54, 'rgba(132,204,22,', 320);
        } else {
          get().spawnBurst(broken.footX, broken.footY - 18, '#f97316', 18);
          get().spawnBurst(broken.footX, broken.footY - 18, '#fde68a', 8);
          get().spawnRing(broken.footX, broken.footY - 18, 6, 34, 'rgba(251,146,60,0.8)', 3, 320);
          get().spawnGlow(broken.footX, broken.footY - 18, 44, 'rgba(251,146,60,', 360);
          get().dropBreakablePropLoot(broken);
        }
      }
    }

    return {
      swung: true,
      hit: slashAt.length > 0 || propHit || trapShoves.length > 0 || shieldsToBash.length > 0,
      finish: finisherHit || bossFinishHit,
      killed: killed.length
    };
  },

  performKatanaStrike: (targetIds, damageMult, allowFinisher) => {
    const now = Date.now();
    const { player, gameTime, enemies } = get();
    if (!isKatanaMode(player) || targetIds.length === 0) {
      return { hit: false, finish: false, killed: 0 };
    }

    const gun = getActiveGun(player); // ammo scavenge stays gun-family based
    const baseDamage = KATANA_DAMAGE_BY_LEVEL[katanaLevel(player)];
    const pcx = player.x + player.width / 2;
    const pcy = player.y + player.height / 2;
    const killed: { enemy: Enemy; finisher: boolean }[] = [];
    let bossFinishHit = false;
    const survivors: Enemy[] = [];
    const damageNumbers: { x: number; y: number; value: number; crit: boolean }[] = [];
    const slashAt: { x: number; y: number }[] = [];
    const critStunAt: { x: number; y: number }[] = [];

    for (const enemy of enemies) {
      if (!targetIds.includes(enemy.id) || enemy.type === 'reaper') {
        survivors.push(enemy);
        continue;
      }
      const ecx = enemy.x + enemy.width / 2;
      const ecy = enemy.y + enemy.height / 2;
      slashAt.push({ x: ecx, y: ecy });
      const stunned = enemy.stunUntil !== undefined && gameTime < enemy.stunUntil;
      // 近接フィニッシュ(スタン敵の即時処刑/ボス5×)は一閃ダッシュのみ。
      // オート斬撃(allowFinisher=false)はスタン敵にも通常ダメージだけ与え、
      // スタンは消さない(一閃で仕留める余地を残す)。
      if (stunned && allowFinisher) {
        if (isBossType(enemy.type)) {
          // Same boss rule as the knife: 5× damage, stun shaken off, no execute.
          bossFinishHit = true;
          const dmg = baseDamage * damageMult * BOSS_MELEE_STUN_MULT;
          damageNumbers.push({ x: ecx, y: enemy.y, value: Math.round(dmg), crit: true });
          const newHealth = Math.max(0, enemy.health - dmg);
          if (newHealth <= 0) {
            killed.push({ enemy, finisher: false });
          } else {
            survivors.push({
              ...enemy,
              health: newHealth,
              stunUntil: undefined,
              lastHit: now,
              liftUntil: now + 420,
            });
          }
          continue;
        }
        killed.push({ enemy, finisher: true }); // 通常ナイフと同じ即時フィニッシュ
        continue;
      }
      const trapCritBonus = enemy.rootUntil !== undefined && gameTime < enemy.rootUntil
        ? TRAP_ROOT_CRIT_BONUS
        : 0;
      // 刀のクリ率 = レベル別基礎(10/20/30%) + プレイヤーのレベルアップ
      // クリティカル率アップ(player.critChance) + トラップ拘束ボーナス。
      const crit = Math.random() <
        Math.min(1, KATANA_CRIT_CHANCE_BY_LEVEL[katanaLevel(player)] + player.critChance + trapCritBonus);
      // ダッシュの3倍は基礎値側に掛け、クリ倍率は既存近接どおり最後に掛ける
      // (既存ダメージ計算: dmg = base * (crit ? CRIT_DAMAGE_MULT : 1) に揃えた)。
      const dmg = baseDamage * damageMult * (crit ? CRIT_DAMAGE_MULT : 1);
      damageNumbers.push({ x: ecx, y: enemy.y, value: Math.round(dmg), crit });
      const newHealth = Math.max(0, enemy.health - dmg);
      if (newHealth <= 0) {
        killed.push({ enemy, finisher: false });
        continue;
      }
      // 銃のクリと同じ挙動: 倒しきれなかったクリは敵をスタンさせ、黄色いリングで
      // 知らせる。これで刀でも「クリが出た」のが分かり、スタン中の敵を一閃の近接
      // フィニッシュで処刑できる(刀=銃の代替としての一貫挙動)。
      const critStun = crit; // reaper は対象外(上で除外済み)
      if (critStun) critStunAt.push({ x: ecx, y: ecy });
      const newStunUntil = critStun ? gameTime + STUN_DURATION_MS : enemy.stunUntil;
      const dx = ecx - pcx;
      const dy = ecy - pcy;
      const dist = Math.max(0.001, Math.hypot(dx, dy));
      if (!stunned && now >= (enemy.knockbackImmuneUntil ?? 0)) {
        const falloff = Math.max(0, 1 - dist / katanaRange(player));
        const speed = KNOCKBACK_SPEED * (0.5 + falloff * 0.5);
        survivors.push({
          ...enemy,
          health: newHealth,
          lastHit: now,
          stunUntil: newStunUntil,
          knockbackVx: (dx / dist) * speed,
          knockbackVy: (dy / dist) * speed,
          knockbackUntil: now + KNOCKBACK_DURATION,
          knockbackImmuneUntil: now + KNOCKBACK_IMMUNE_MS
        });
      } else {
        survivors.push({
          ...enemy,
          health: newHealth,
          lastHit: now,
          stunUntil: newStunUntil,
          knockbackVx: 0,
          knockbackVy: 0,
          knockbackUntil: now + 100,
        });
      }
    }

    // フィニッシュ演出(ヒットストップ/フラッシュ/スロー)はこの呼び出しに対し
    // 1回だけ発火する。一閃で複数敵を同時フィニッシュしても多重発火しない。
    const finisherHit = killed.some(k => k.finisher);
    const comboFinishCount = killed.filter(k => k.finisher).length + (bossFinishHit ? 1 : 0);
    const bossKilled = killed.some(k => k.enemy.type === 'giantbat');
    set(state => ({
      enemies: survivors,
      gameStats: {
        ...state.gameStats,
        enemiesKilled: state.gameStats.enemiesKilled + killed.length,
        damageDealt: state.gameStats.damageDealt +
          damageNumbers.reduce((sum, n) => sum + n.value, 0),
        maxCombo: comboFinishCount > 0
          ? Math.max(
              state.gameStats.maxCombo,
              state.meleeFinishComboUntil >= gameTime
                ? state.meleeFinishComboCount + comboFinishCount
                : comboFinishCount
            )
          : state.gameStats.maxCombo
      },
      gameWon: state.gameWon || bossKilled,
      meleeFinishComboCount: comboFinishCount > 0
        ? (state.meleeFinishComboUntil >= gameTime ? state.meleeFinishComboCount + comboFinishCount : comboFinishCount)
        : state.meleeFinishComboCount,
      meleeFinishComboUntil: comboFinishCount > 0
        ? gameTime + MELEE_FINISH_COMBO_WINDOW_MS
        : state.meleeFinishComboUntil,
      hitstopUntil: finisherHit ? now + HITSTOP_MS : state.hitstopUntil
    }));

    // 軽量な短命斬撃のみ(常時glowなし)。刀はやや青白い斬閃で識別。
    // 通常斬撃(オート)はエフェクトを2倍サイズで描く(確定仕様)。
    const slashScale = allowFinisher ? 1 : 2;
    for (const s of slashAt) {
      get().spawnSlash(s.x, s.y, 'rgba(221,238,255,0.95)', slashScale);
    }
    for (const c of damageNumbers) {
      get().spawnDamageNumber(c.x, c.y, c.value, c.crit);
    }
    // クリでスタンさせた敵に黄色いリング(銃クリと同じフィードバック)。
    for (const c of critStunAt) {
      get().spawnRing(c.x, c.y, 6, 30, 'rgba(250, 204, 21, 0.9)', 2, 260);
    }
    // 刀の一閃フィニッシュは「斬」コールアウトが主役なので、Kill! と既存の
    // 黄色フィニッシュフラッシュは出さない(暗転と斬は triggerKatanaDash 側で出す)。
    grantMeleeKillRewards(get, killed, player, gun, true);
    if (finisherHit || bossFinishHit) {
      get().triggerTimeSlow(0.4, MELEE_FINISH_SLOW_MS);
    }

    return { hit: slashAt.length > 0, finish: finisherHit || bossFinishHit, killed: killed.length };
  },

  triggerKatanaDash: (dirX, dirY) => {
    const now = Date.now();
    const { player, enemies, breakableProps, isPaused } = get();
    if (!isKatanaMode(player) || isPaused) return false;
    // 発動中(移動中)〜着地後の硬直中は新しい一閃を出せない = モーション
    // キャンセル不可 + 後隙。村雨でも共通(連発は硬直0.2sぶん間隔が空く)。
    if (now < player.katanaRecoveryUntil) return false;
    // 村雨はクールダウン無し(硬直のみ)。刀はさらにクールダウン中は発動しない。
    const mura = hasMurasame(player);
    if (!mura && now < player.katanaDashCooldownEnd) return false;
    const len = Math.hypot(dirX, dirY);
    if (len < 0.001) return false;
    const ux = dirX / len;
    const uy = dirY / len;
    const pcx = player.x + player.width / 2;
    const pcy = player.y + player.height / 2;

    // 通過予定経路(始点→終点の線分+半幅)に掛かる敵をまとめて斬る。
    // ダメージは経路確定時に一括適用する(移動自体はKATANA_DASH_MSかけて行う)。
    const targetIds: string[] = [];
    for (const e of enemies) {
      if (e.type === 'reaper') continue;
      const ex = e.x + e.width / 2 - pcx;
      const ey = e.y + e.height / 2 - pcy;
      const along = ex * ux + ey * uy;
      if (along < -e.width / 2 || along > KATANA_DASH_DISTANCE + e.width / 2) continue;
      const perp = Math.abs(ex * uy - ey * ux);
      if (perp <= KATANA_DASH_HIT_HALF_WIDTH + e.width / 2) targetIds.push(e.id);
    }
    // 経路上の破壊可能オブジェクト(松明など)も壊す。
    const propTargetIds: string[] = [];
    for (const prop of breakableProps) {
      const ex = prop.footX - pcx;
      const ey = prop.footY - pcy;
      const along = ex * ux + ey * uy;
      if (along < -prop.width / 2 || along > KATANA_DASH_DISTANCE + prop.width / 2) continue;
      const perp = Math.abs(ex * uy - ey * ux);
      if (perp <= KATANA_DASH_HIT_HALF_WIDTH + prop.width / 2) propTargetIds.push(prop.id);
    }

    // 村雨はクールダウン無し: ダッシュ終了時刻をそのままCD終了にして実質0に。
    const cooldownEnd = mura ? now + KATANA_DASH_MS : now + KATANA_DASH_MS + KATANA_DASH_COOLDOWN_MS;
    set(state => ({
      player: {
        ...state.player,
        katanaDashUntil: now + KATANA_DASH_MS,
        // 着地(KATANA_DASH_MS後)からさらに KATANA_DASH_RECOVERY_MS は硬直。
        katanaRecoveryUntil: now + KATANA_DASH_MS + KATANA_DASH_RECOVERY_MS,
        katanaDashDirX: ux,
        katanaDashDirY: uy,
        katanaDashCooldownEnd: cooldownEnd,
        // 刀はカウンターも一閃クールダウンに依存する。村雨はカウンターも無CD
        // なので延長しない(連発可)。
        counterCooldownEnd: mura
          ? state.player.counterCooldownEnd
          : Math.max(state.player.counterCooldownEnd, cooldownEnd),
        // ダッシュ中の無敵は既存の被弾無敵(ループ側のINVULN_MS自動解除)を再利用。
        // 解除タイミングがダッシュ終了とほぼ一致するよう開始時刻を過去にずらす。
        invulnerable: true,
        invulnerableTime: now - Math.max(0, INVULN_MS - KATANA_DASH_MS),
        lastDirection: { x: ux, y: uy }
      }
    }));

    // 軌跡は既存trail 1本のみの軽量表現(常時発光・大量パーティクルなし)。
    get().spawnEffect({
      kind: 'trail',
      id: `fx-katana-dash-${now}`,
      fromX: pcx,
      fromY: pcy,
      toX: pcx + ux * KATANA_DASH_DISTANCE,
      toY: pcy + uy * KATANA_DASH_DISTANCE,
      color: 'rgba(196,225,255,0.85)',
      createdAt: now,
      duration: 260
    });

    // 斬撃・フィニッシュ・ヒットストップは「移動が終わってから」適用する。
    // フィニッシュのヒットストップ(全シム停止)を移動中に発火させると、
    // ダッシュの移動ウィンドウ(KATANA_DASH_MS)が凍結に食われてプレイヤーが
    // 動かないため。まず移動だけ走らせ、到達後に斬る。
    // 「斬」を出す位置 = ダッシュ軌道(始点→終点)の真ん中(発動時に確定)。
    const zanX = pcx + ux * KATANA_DASH_DISTANCE / 2;
    const zanY = pcy + uy * KATANA_DASH_DISTANCE / 2;
    if (targetIds.length > 0 || propTargetIds.length > 0) {
      setTimeout(() => {
        if (!isKatanaMode(get().player)) return; // run reset / 刀を外した等
        const result = targetIds.length > 0
          ? get().performKatanaStrike(targetIds, KATANA_DASH_DAMAGE_MULT, true)
          : { finish: false };
        // 経路上の松明などを破壊(近接フィニッシュと同等の高ダメージ)。
        const propDamage = KATANA_DAMAGE_BY_LEVEL[katanaLevel(get().player)] * KATANA_DASH_DAMAGE_MULT * 2.5;
        for (const id of propTargetIds) {
          const prop = get().breakableProps.find(p => p.id === id);
          if (!prop) continue;
          const broken = get().damageBreakableProp(id, propDamage);
          get().spawnSlash(prop.footX, prop.footY - prop.height * 0.8, 'rgba(221,238,255,0.95)');
          if (broken) {
            if (broken.type === 'mine') {
              get().spawnBurst(broken.footX, broken.footY - 8, '#84cc16', 30);
              get().spawnRing(broken.footX, broken.footY - 8, 5, 50, 'rgba(132,204,22,0.82)', 4, 320);
              get().spawnGlow(broken.footX, broken.footY - 8, 54, 'rgba(132,204,22,', 320);
            } else {
              get().spawnBurst(broken.footX, broken.footY - 18, '#f97316', 18);
              get().spawnRing(broken.footX, broken.footY - 18, 6, 34, 'rgba(251,146,60,0.8)', 3, 320);
              get().spawnGlow(broken.footX, broken.footY - 18, 44, 'rgba(251,146,60,', 360);
              get().dropBreakablePropLoot(broken);
            }
          }
        }
        // 一閃でフィニッシュした時だけ「斬」を軌道の真ん中に1つ表示
        // (何体巻き込んでも1ダッシュにつき1つ)。大きい赤の明朝文字+画面暗転。
        if (result.finish) {
          get().spawnFlash('rgba(0,0,0,0.6)', 420);                      // 暗転
          get().spawnCallout(zanX, zanY, '斬', '#ef4444', { scale: 3.6, serif: true });
        }
      }, KATANA_DASH_MS);
    }
    return true;
  },

  damagePlayer: (amount) => {
    const { player } = get();

    if (player.invulnerable) return false;

    const wouldDie = player.health - amount <= 0;
    if (wouldDie && player.vaccineRevives > 0) {
      set(state => ({
        shakeUntil: amount > 0 ? Date.now() + SHAKE_MS : state.shakeUntil,
        player: {
          ...state.player,
          health: Math.max(1, Math.floor(state.player.maxHealth * 0.5)),
          vaccineRevives: state.player.vaccineRevives - 1,
          invulnerable: true,
          invulnerableTime: Date.now()
        }
      }));
      const p = get().player;
      const cx = p.x + p.width / 2;
      const cy = p.y + p.height / 2;
      get().spawnFlash('rgba(34, 197, 94, 0.34)', 320);
      get().spawnRing(cx, cy, 10, 90, 'rgba(74,222,128,0.88)', 5, 520);
      get().spawnGlow(cx, cy, 78, 'rgba(74,222,128,', 520);
      get().spawnCallout(cx, cy - 18, 'VACCINE', '#bbf7d0');
      return false;
    }
    
    set(state => {
      const newHealth = Math.max(0, state.player.health - amount);
      return {
        // Real damage kicks off a screen shake.
        shakeUntil: amount > 0 ? Date.now() + SHAKE_MS : state.shakeUntil,
        player: {
          ...state.player,
          health: newHealth,
          invulnerable: amount > 0,
          invulnerableTime: Date.now()
        }
      };
    });

    // Return whether player is dead
    return get().player.health <= 0;
  },
  
  gainExperience: (amount) => {
    set(state => {
      const { player, gameStats } = state;
      const newExperience = player.experience + amount;
      const newExpCollected = gameStats.experienceCollected + amount;
      return {
        player: {
          ...player,
          experience: newExperience,
        },
        gameStats: {
          ...gameStats,
          experienceCollected: newExpCollected
        }
      };
    });
    
    // Check if player should level up
    const { player } = get();
    if (player.experience >= player.experienceToNextLevel) {
      get().levelUp();
    }
  },
  
  levelUp: () => {
    set(state => {
      const { player } = state;
      const newLevel = player.level + 1;
      // VS-style ramp: cheap levels early so the upgrade menu shows up often,
      // then progressively steeper. +2 per level for levels 1-9, then a
      // smaller multiplier afterward.
      const stepLinear = newLevel < 10 ? 2 : 0;
      const newExpToNextLevel = Math.floor(player.experienceToNextLevel * (newLevel < 10 ? 1.1 : 1.18) + stepLinear);
      
      // Generate upgrade options when leveling up
      const upgradeOptions = generateUpgradeOptions(player);
      
      // Update max level in stats if needed
      const newMaxLevel = Math.max(state.gameStats.maxLevel, newLevel);

      // No automatic ammo resupply on level-up — ammo is managed entirely
      // through reserves/reloads and scarce pickups. Level-ups grant upgrades.
      return {
        player: {
          ...player,
          level: newLevel,
          experienceToNextLevel: newExpToNextLevel,
          experience: 0
        },
        showUpgradeMenu: true,
        upgradeOptions,
        isPaused: true,
        gameStats: {
          ...state.gameStats,
          maxLevel: newMaxLevel
        }
      };
    });
  },
  
  // Weapon actions
  fireWeapons: (currentTime) => {
    const { player } = get();
    player.weapons.forEach(weapon => {
      if (currentTime - weapon.lastFired >= weapon.cooldown) {
        // Logic to create projectiles based on weapon type will go here
        // We'll implement this in weaponUtils.ts
        
        set(state => ({
          player: {
            ...state.player,
            weapons: state.player.weapons.map(w => 
              w.id === weapon.id ? { ...w, lastFired: currentTime } : w
            )
          }
        }));
      }
    });
  },
  
  selectUpgrade: (upgrade) => {
    set(state => {
      const { player } = state;

      if (upgrade.type === 'subWeapon' && upgrade.subWeaponKey) {
        return {
          player: applySubWeaponCard(player, upgrade.subWeaponKey, upgrade.level),
          showUpgradeMenu: false,
          isPaused: false
        };
      }

      // RE rework: level-ups only strengthen the player — new weapons come
      // exclusively from world drops and crates. Every upgrade is a passive.
      if (upgrade.type === 'passive' && upgrade.passiveType) {
        const updatedPlayer = { ...player };
        // Per-level gains are intentionally modest (~half of the earlier,
        // too-steep values) so growth feels gradual.
        switch (upgrade.passiveType) {
          case 'maxHealth':
            updatedPlayer.maxHealth += 30;
            updatedPlayer.health = updatedPlayer.maxHealth;
            break;
          case 'speed':
            updatedPlayer.speed = Math.round(updatedPlayer.speed * 1.05);
            break;
          case 'might':
            // Boost damage on both the gun and the melee weapon.
            updatedPlayer.weapons = updatedPlayer.weapons.map(w => ({
              ...w, damage: w.damage * 1.2
            }));
            break;
          case 'cooldown':
            // Faster fire rate on the gun (melee cooldown is 0, untouched).
            updatedPlayer.weapons = updatedPlayer.weapons.map(w => ({
              ...w, cooldown: w.cooldown > 0 ? Math.max(80, w.cooldown * 0.95) : w.cooldown
            }));
            break;
          case 'magSize': {
            // 装填数アップ — bigger magazines for every gun. Top up the
            // currently-loaded rounds too so the boost is immediately useful.
            updatedPlayer.magBonus += 1;
            const bonus = updatedPlayer.magBonus;
            updatedPlayer.weapons = updatedPlayer.weapons.map(w =>
              w.magSize != null
                ? { ...w, magazine: Math.min((w.magazine ?? 0) + 1, w.magSize + bonus) }
                : w
            );
            break;
          }
          case 'reloadSpeed':
            // リロード時間短縮 — faster reloads for all guns (floor at 0.4×).
            updatedPlayer.reloadMult = Math.max(0.4, updatedPlayer.reloadMult * 0.925);
            break;
          case 'critChance':
            updatedPlayer.critChance = Math.min(0.3, updatedPlayer.critChance + 0.03);
            break;
          // 'area' / 'duration' are no longer offered (no area weapons), but
          // keep harmless no-op cases for type completeness.
          case 'area':
          case 'duration':
            break;
        }
        return {
          player: updatedPlayer,
          showUpgradeMenu: false,
          isPaused: false
        };
      }

      return {
        showUpgradeMenu: false,
        isPaused: false
      };
    });
  },

  learnSubWeapon: (key) => {
    set(state => ({
      player: {
        ...state.player,
        subWeapons: state.player.subWeapons.includes(key)
          ? state.player.subWeapons
          : [...state.player.subWeapons, key],
        subWeaponLevels: {
          ...state.player.subWeaponLevels,
          [key]: Math.max(1, state.player.subWeaponLevels[key] ?? 0)
        }
      }
    }));
  },

  setSubWeaponCooldown: (key, readyAt) => {
    set(state => ({
      player: {
        ...state.player,
        subWeaponCooldowns: {
          ...state.player.subWeaponCooldowns,
          [key]: readyAt
        }
      }
    }));
  },

  updateHuntingCharge: (startedAt, charged) => {
    set(state => {
      if (
        state.player.huntingChargeStartedAt === startedAt &&
        state.player.huntingCharged === charged
      ) {
        return {};
      }
      return {
        player: {
          ...state.player,
          huntingChargeStartedAt: startedAt,
          huntingCharged: charged
        }
      };
    });
  },

  buyShopItem: (key, ammoType) => {
    let purchased = false;
    set(state => {
      const spend = (cost: number, playerPatch: Partial<Player>) => {
        if (state.player.straps < cost) return {};
        purchased = true;
        return {
          player: {
            ...state.player,
            ...playerPatch,
            straps: state.player.straps - cost
          },
          gameStats: {
            ...state.gameStats,
            strapsSpent: state.gameStats.strapsSpent + cost
          }
        };
      };

      if (key === 'ammo-handgun' || ammoType === 'handgun') {
        return spend(SHOP_AMMO_COST, {
          ammoHandgun: Math.min(AMMO_MAX.handgun, state.player.ammoHandgun + state.ammoPickupAmounts.handgun)
        });
      }
      if (key === 'ammo-shotgun' || ammoType === 'shotgun') {
        return spend(SHOP_AMMO_COST, {
          ammoShotgun: Math.min(AMMO_MAX.shotgun, state.player.ammoShotgun + state.ammoPickupAmounts.shotgun)
        });
      }
      if (key === 'ammo-rifle' || ammoType === 'rifle') {
        return spend(SHOP_AMMO_COST, {
          ammoRifle: Math.min(AMMO_MAX.rifle, state.player.ammoRifle + state.ammoPickupAmounts.rifle)
        });
      }
      if (key === 'medkit') {
        if (state.player.health >= state.player.maxHealth) return {};
        return spend(SHOP_MEDKIT_COST, {
          health: Math.min(state.player.maxHealth, state.player.health + SHOP_MEDKIT_HEAL)
        });
      }
      if (key === 'vaccine') {
        if (state.vaccinePurchased) return {};
        const result = spend(SHOP_VACCINE_COST, { vaccineRevives: 1 });
        if ('player' in result) {
          return { ...result, vaccinePurchased: true };
        }
        return result;
      }

      const subWeaponKey = key === 'dog' ? 'dog' : classSubWeaponFor(state.player.characterClass);
      const cost = key === 'dog' ? SHOP_DOG_COST : SHOP_CLASS_SKILL_COST;
      const currentLevel = state.player.subWeaponLevels[subWeaponKey] ?? 0;
      if (currentLevel >= 3) return {};
      return spend(cost, applySubWeaponCard(state.player, subWeaponKey));
    });

    if (purchased) {
      const p = get().player;
      get().spawnCallout(p.x + p.width / 2, p.y - 12, 'BUY', '#fde68a');
    }
    return purchased;
  },

  buySkillCardFromShop: (key) => {
    let purchased = false;
    set(state => {
      const unlockedLevel = Math.max(0, Math.min(3, state.unlockedShopSkillCards[key] ?? 0));
      const currentLevel = state.player.subWeaponLevels[key] ?? 0;
      if (unlockedLevel <= 0 || currentLevel >= unlockedLevel || currentLevel >= 3) return {};
      const cost = key === 'dog' ? SHOP_DOG_COST : key === 'katana' ? SHOP_KATANA_COST : SHOP_CLASS_SKILL_COST;
      if (state.player.straps < cost) return {};
      purchased = true;
      return {
        player: {
          ...applySubWeaponCard(state.player, key),
          straps: state.player.straps - cost
        },
        gameStats: {
          ...state.gameStats,
          strapsSpent: state.gameStats.strapsSpent + cost
        }
      };
    });

    if (purchased) {
      const p = get().player;
      get().spawnCallout(p.x + p.width / 2, p.y - 12, 'SKILL', '#bfdbfe');
    }
    return purchased;
  },

  openShop: () => {
    set({
      showShopMenu: true,
      isPaused: true,
      touchActive: false,
      swipeDirection: null
    });
  },

  closeShop: () => {
    set(state => ({
      showShopMenu: false,
      isPaused: false,
      shopReopenAt: state.gameTime + MERCHANT_REOPEN_DELAY_MS
    }));
  },

  openEventQuest: () => {
    set({
      showEventQuestMenu: true,
      isPaused: true,
      touchActive: false,
      swipeDirection: null
    });
  },

  acceptEventQuest: () => {
    set(state => ({
      showEventQuestMenu: false,
      isPaused: false,
      eventQuestNpc: {
        ...state.eventQuestNpc,
        status: 'accepted'
      },
      eventQuestReopenAt: state.gameTime + EVENT_NPC_REOPEN_DELAY_MS
    }));
  },

  declineEventQuest: () => {
    set(state => ({
      showEventQuestMenu: false,
      isPaused: false,
      eventQuestReopenAt: state.gameTime + EVENT_NPC_REOPEN_DELAY_MS
    }));
  },

  completeEventQuest: () => {
    set(state => ({
      eventQuestNpc: {
        ...state.eventQuestNpc,
        status: 'completed',
        fadeStartedAt: Date.now()
      }
    }));
  },
  
  // Enemy actions
  addEnemy: (enemy) => {
    set(state => ({
      enemies: [...state.enemies, enemy]
    }));
  },
  
  removeEnemy: (id) => {
    set(state => ({
      enemies: state.enemies.filter(enemy => enemy.id !== id)
    }));
  },
  
  damageEnemy: (id, amount) => {
    let killed = false;
    
    set(state => {
      const { enemies, gameStats } = state;
      const enemy = enemies.find(e => e.id === id);
      
      if (!enemy) return { enemies };
      
      const newHealth = Math.max(0, enemy.health - amount);
      const updatedEnemies = enemies.map(e => 
        e.id === id ? { ...e, health: newHealth, lastHit: Date.now() } : e
      );
      
      // Check if enemy was killed
      if (newHealth === 0) {
        killed = true;
        
        // Update game stats
        const newStats = {
          ...gameStats,
          enemiesKilled: gameStats.enemiesKilled + 1,
          damageDealt: gameStats.damageDealt + amount
        };

        return {
          enemies: updatedEnemies.filter(e => e.id !== id),
          gameStats: newStats,
          // The giantbat is the run's finale boss — killing it wins the game.
          gameWon: state.gameWon || enemy.type === 'giantbat'
        };
      }
      
      return { 
        enemies: updatedEnemies,
        gameStats: {
          ...gameStats,
          damageDealt: gameStats.damageDealt + amount
        }
      };
    });

    return killed;
  },
  
  updateEnemies: (deltaTime) => {
    set(state => {
      const { enemies, player, gameTime, breakableProps } = state;
      const solidProps = breakableProps.filter(p => p.type !== 'mine');
      const now = Date.now();

      const updatedEnemies = enemies.map(enemy => {
        // Knockback overrides chase AI: while it's active, slide outward
        // with linearly-decaying velocity instead of seeking the player.
        if (enemy.knockbackUntil && now < enemy.knockbackUntil) {
          const remaining = enemy.knockbackUntil - now;
          const decay = Math.max(0, remaining / KNOCKBACK_DURATION); // 1 → 0
          const treeResolved = resolveTreeCollision({
            x: enemy.x + (enemy.knockbackVx ?? 0) * decay * deltaTime,
            y: enemy.y + (enemy.knockbackVy ?? 0) * decay * deltaTime,
            width: enemy.width,
            height: enemy.height,
          });
          const kb = resolveTorchCollision({
            x: treeResolved.x,
            y: treeResolved.y,
            width: enemy.width,
            height: enemy.height,
          }, solidProps);
          return { ...enemy, x: kb.x, y: kb.y };
        }

        // Bosses pop up briefly when they take melee finisher-grade damage;
        // while airborne they should read as caught, not still advancing.
        if (enemy.liftUntil !== undefined && now < enemy.liftUntil) {
          return { ...enemy, vx: 0, vy: 0 };
        }

        // Stun (from a crit) freezes the enemy in place — it's a sitting duck
        // for a melee finisher. gameTime-based so pauses don't cheat the timer.
        if (enemy.stunUntil !== undefined && gameTime < enemy.stunUntil) {
          return enemy;
        }

        // Trap root freezes movement only. It deliberately does not share the
        // crit stun state, so rooted enemies are not melee-finisher targets.
        if (enemy.rootUntil !== undefined && gameTime < enemy.rootUntil) {
          return { ...enemy, vx: 0, vy: 0 };
        }

        // Plants are nearly stationary — they shuffle slightly toward the
        // player but mostly hold ground and spit seeds. Everything else
        // does the standard VS straight-line chase, but with inertia: the
        // chase velocity eases toward the heading so enemies curve into turns
        // (~0.3s) rather than snapping to face the player.
        const dx = player.x - enemy.x;
        const dy = player.y - enemy.y;
        const distance = Math.max(0.001, Math.sqrt(dx * dx + dy * dy));
        const speed = enemy.type === 'plant' ? enemy.speed * 0.25 : enemy.speed;
        const tvx = (dx / distance) * speed;
        const tvy = (dy / distance) * speed;

        const alpha = inertiaAlpha(deltaTime, ENEMY_INERTIA_TAU);
        const vx = (enemy.vx ?? tvx) + (tvx - (enemy.vx ?? tvx)) * alpha;
        const vy = (enemy.vy ?? tvy) + (tvy - (enemy.vy ?? tvy)) * alpha;

        const treeResolved = resolveTreeCollision({
          x: enemy.x + vx * deltaTime,
          y: enemy.y + vy * deltaTime,
          width: enemy.width,
          height: enemy.height,
        });
        const moved = resolveTorchCollision({
          x: treeResolved.x,
          y: treeResolved.y,
          width: enemy.width,
          height: enemy.height,
        }, solidProps);

        return { ...enemy, vx, vy, x: moved.x, y: moved.y };
      });

      return { enemies: updatedEnemies };
    });
  },

  stunEnemy: (id, until) => {
    set(state => ({
      enemies: state.enemies.map(e =>
        e.id === id ? { ...e, stunUntil: until } : e
      )
    }));
  },

  rootEnemy: (id, until) => {
    set(state => ({
      enemies: state.enemies.map(e =>
        e.id === id ? { ...e, rootUntil: until, vx: 0, vy: 0 } : e
      )
    }));
  },

  // Light bullet knockback: nudge an enemy along the shot direction. Reuses the
  // same decay model as the melee shove (KNOCKBACK_DURATION) but at a much
  // lower speed so it only staggers, never launches.
  knockbackEnemy: (id, dirX, dirY, multiplier = 1) => {
    const now = Date.now();
    const strength = Math.max(1, Math.min(3, multiplier));
    set(state => ({
      enemies: state.enemies.map(e =>
        e.id === id
          ? {
              ...e,
              knockbackVx: dirX * BULLET_KNOCKBACK_SPEED * strength,
              knockbackVy: dirY * BULLET_KNOCKBACK_SPEED * strength,
              knockbackUntil: now + KNOCKBACK_DURATION
            }
          : e
      )
    }));
  },

  markCastleBossSpawned: () => {
    set(state => ({
      castleEvent: {
        ...state.castleEvent,
        bossSpawned: true,
      },
    }));
  },

  // Ammo
  addAmmo: (type, amount) => {
    set(state => {
      const field = AMMO_FIELD[type];
      const max = AMMO_MAX[type];
      return {
        player: {
          ...state.player,
          [field]: Math.min(max, state.player[field] + amount)
        }
      };
    });
  },

  // Projectile actions
  addProjectile: (projectile) => {
    set(state => ({
      projectiles: [...state.projectiles, projectile]
    }));
  },
  
  removeProjectile: (id) => {
    set(state => ({
      projectiles: state.projectiles.filter(p => p.id !== id)
    }));
  },

  reflectProjectile: (id, multiplier = REFLECT_DAMAGE_MULTIPLIER) => {
    set(state => ({
      projectiles: state.projectiles.map(p => {
        if (p.id !== id) return p;
        return {
          ...p,
          direction: { x: -p.direction.x, y: -p.direction.y },
          speed: p.speed * REFLECT_SPEED_MULTIPLIER,
          damage: p.damage * multiplier,
          hostile: false,
          reflected: true,
          // Reflected bolts pierce — they plow through whatever line of
          // enemies happens to be between the player and the original
          // firer instead of stopping at the first body.
          passthrough: true,
          hitEnemies: [],
          createdAt: Date.now()
        };
      })
    }));
  },
  
  updateProjectiles: (deltaTime) => {
    const currentTime = Date.now();

    set(state => {
      const { projectiles, player, gameBounds, breakableProps, castleEvent } = state;
      const cullRadius = Math.max(gameBounds.width, gameBounds.height);
      const playerCX = player.x + player.width / 2;
      const playerCY = player.y + player.height / 2;
      const grenadeWallsFor = (p: Projectile) => {
        const pad = 260;
        const cx = p.x + p.width / 2;
        const cy = p.y + p.height / 2;
        const trunks = treesInRegion(cx - pad, cy - pad, cx + pad, cy + pad).map(trunkRect);
        const torches = breakableProps
          .filter(prop => prop.type === 'torch' && prop.health > 0)
          .map(torchRect);
        return [...trunks, ...torches, castleRect(castleEvent)];
      };

      const updatedProjectiles = projectiles
        .filter(p => {
          if (currentTime - p.createdAt > p.duration && p.weaponType !== 'grenade') return false;
          if (currentTime - p.createdAt > p.duration + 500) return false;
          // Garlic / bibles follow the player and shouldn't be culled by
          // their static spawn position; check distance from player.
          const px = p.x + p.width / 2;
          const py = p.y + p.height / 2;
          if (Math.hypot(px - playerCX, py - playerCY) > cullRadius) return false;
          return true;
        })
        .map(p => {
          // Orbital motion (bibles): position relative to the player using
          // a continuously-updated angle. Doesn't use direction/speed.
          if (p.orbitRadius !== undefined && p.orbitAngle !== undefined) {
            const angle = p.orbitAngle + (p.orbitSpeed ?? 0) * deltaTime;
            return {
              ...p,
              orbitAngle: angle,
              x: playerCX + Math.cos(angle) * p.orbitRadius - p.width / 2,
              y: playerCY + Math.sin(angle) * p.orbitRadius - p.height / 2
            };
          }
          // Aura that snaps to player (garlic)
          if (p.followsPlayer) {
            return {
              ...p,
              x: playerCX - p.width / 2,
              y: playerCY - p.height / 2
            };
          }
          // Decoy: travels in the throw direction until it lands, then holds
          // position (a stationary placed device) for the rest of its life.
          if (p.weaponType === 'decoy') {
            if (p.decoyLandAt !== undefined && currentTime >= p.decoyLandAt) return p;
            return {
              ...p,
              x: p.x + p.direction.x * p.speed * deltaTime,
              y: p.y + p.direction.y * p.speed * deltaTime
            };
          }
          // Ballistic motion with optional gravity (axes arc upward, fall)
          let dir = p.direction;
          if (p.gravity) {
            dir = { x: dir.x, y: dir.y + p.gravity * deltaTime };
          }
          if (p.weaponType === 'grenade') {
            let nextX = p.x + dir.x * p.speed * deltaTime;
            let nextY = p.y + dir.y * p.speed * deltaTime;
            const walls = grenadeWallsFor(p);
            const xRect = { x: nextX, y: p.y, width: p.width, height: p.height };
            if (walls.some(w => rectsOverlap(xRect, w))) {
              dir = { ...dir, x: -dir.x * GRENADE_BOUNCE_DAMPING };
              nextX = p.x;
            }
            const yRect = { x: nextX, y: nextY, width: p.width, height: p.height };
            if (walls.some(w => rectsOverlap(yRect, w))) {
              dir = { ...dir, y: -dir.y * GRENADE_BOUNCE_DAMPING };
              nextY = p.y;
            }
            return {
              ...p,
              direction: dir,
              speed: Math.max(24, p.speed * Math.exp(-GRENADE_ROLL_DRAG * deltaTime)),
              x: nextX,
              y: nextY
            };
          }
          return {
            ...p,
            direction: dir,
            x: p.x + dir.x * p.speed * deltaTime,
            y: p.y + dir.y * p.speed * deltaTime
          };
        });

      return { projectiles: updatedProjectiles };
    });
  },
  
  // Pickup actions
  addPickup: (pickup) => {
    set(state => ({
      pickups: [...state.pickups, pickupWithDropScatter(pickup)]
    }));
  },
  
  removePickup: (id) => {
    set(state => ({
      pickups: state.pickups.filter(p => p.id !== id)
    }));
  },

  dropEnemyCurrency: (enemy, x, y) => {
    const treasureChance = treasureDropChance(enemy.difficultyRank);
    if (treasureChance > 0 && Math.random() < treasureChance) {
      const value = treasureValueForRank(enemy.difficultyRank);
      get().addPickup({
        id: `pickup-treasure-${enemy.id}`,
        x: x - 8 + 12,
        y: y - 8 - 12,
        type: 'treasure',
        value,
        variant: treasureVariantForValue(value),
        worldDrop: true
      });
    }
  },
  
  collectPickup: (id) => {
    const { pickups } = get();
    const pickup = pickups.find(p => p.id === id);

    if (!pickup) return;

    switch (pickup.type) {
      case 'experience':
        get().gainExperience(pickup.value);
        break;
      case 'health':
        set(state => ({
          player: {
            ...state.player,
            health: Math.min(state.player.health + pickup.value, state.player.maxHealth)
          }
        }));
        break;
      case 'strap':
        set(state => ({
          player: {
            ...state.player,
            straps: state.player.straps + pickup.value
          },
          gameStats: {
            ...state.gameStats,
            strapsCollected: state.gameStats.strapsCollected + pickup.value
          }
        }));
        break;
      case 'treasure':
        set(state => ({
          lastWeaponGet: {
            name: treasureNameForVariant(pickup.variant),
            at: Date.now(),
            color: '#facc15',
            kind: 'treasure'
          },
          gameStats: {
            ...state.gameStats,
            treasuresCollected: state.gameStats.treasuresCollected + pickup.value
          }
        }));
        break;
      case 'magnet': {
        // VS magnet: collect every XP gem currently on the field. We sum
        // their value in one go and remove them.
        const gems = get().pickups.filter(p => p.type === 'experience');
        const total = gems.reduce((s, g) => s + g.value, 0);
        if (total > 0) get().gainExperience(total);
        set(state => ({
          pickups: state.pickups.filter(p => p.type !== 'experience' || p.id === id)
        }));
        break;
      }
      case 'chest': {
        // Boss-drop treasure chest. Behaves like a level-up's upgrade menu
        // but without bumping the level or resetting XP. Player just gets
        // a free pick.
        const upgradeOptions = generateUpgradeOptions(get().player);
        set(state => ({
          upgradeOptions,
          showUpgradeMenu: true,
          isPaused: true,
          gameStats: state.gameStats
        }));
        break;
      }
      case 'bomb': {
        // VS rosary: kill every enemy currently on screen by zeroing their
        // HP. We don't grant experience for this — it's a panic button.
        const reachable = get().enemies.filter(e => e.type !== 'reaper');
        set(state => ({
          enemies: state.enemies.filter(e => e.type === 'reaper'),
          gameStats: {
            ...state.gameStats,
            enemiesKilled: state.gameStats.enemiesKilled + reachable.length
          }
        }));
        // Drop XP gems where each killed enemy was so the cleanup feels
        // rewarding even though we skipped the damage path.
        reachable.forEach(enemy => {
          const ex = enemy.x + enemy.width / 2;
          const ey = enemy.y + enemy.height / 2;
          get().dropEnemyCurrency(enemy, ex, ey);
          get().addPickup({
            id: `pickup-bomb-${enemy.id}`,
            x: ex - 8,
            y: ey - 8,
            type: 'experience',
            value: enemy.experienceValue
          });
        });
        break;
      }
      case 'ammo-handgun':
      case 'ammo-shotgun':
      case 'ammo-rifle': {
        const fam = pickup.type.slice('ammo-'.length) as AmmoType;
        const amount = get().ammoPickupAmounts[fam];
        get().addAmmo(fam, amount);
        // Floating "+N" over the player's head, cyan so it reads apart from
        // damage numbers.
        const p = get().player;
        get().spawnAmmoNumber(p.x + p.width / 2, p.y - 6, amount);
        break;
      }
      case 'weapon-drop':
        if (pickup.weaponKey) get().grantWeapon(pickup.weaponKey);
        break;
      case 'weapon-crate':
        // Open the crate: roll a gun by category & tier and equip it.
        get().grantWeapon(openCrate(get().gameTime));
        strapDropValues(WEAPON_CRATE_STRAP_DROP_MIN + Math.floor(Math.random() * WEAPON_CRATE_STRAP_DROP_VARIANCE))
          .forEach((value, index) => {
            get().addPickup({
              id: `pickup-strap-crate-${pickup.id}-${index}`,
              x: pickup.x,
              y: pickup.y,
              type: 'strap',
              value,
              scatterRadius: WEAPON_CRATE_SCATTER_RADIUS
            });
          });
        break;
      case 'quick-magazine': {
        let movedAmount = 0;
        set(state => {
          const p = state.player;
          const active = getActiveGun(p);
          if (!active?.ammoType) return {};
          const field = AMMO_FIELD[active.ammoType];
          const need = Math.max(0, effectiveMagSize(active, p) - (active.magazine ?? 0));
          const moved = Math.min(need, p[field]);
          movedAmount = moved;
          if (moved <= 0) {
            return {
              player: {
                ...p,
                reloadingWeaponId: '',
                reloadEndsAt: 0
              }
            };
          }
          return {
            player: {
              ...p,
              [field]: p[field] - moved,
              weapons: p.weapons.map(w =>
                w.id === active.id ? { ...w, magazine: (w.magazine ?? 0) + moved } : w
              ),
              quickMagCritUntil: state.gameTime + 5000,
              reloadingWeaponId: '',
              reloadEndsAt: 0
            }
          };
        });
        if (movedAmount > 0) {
          const p = get().player;
          get().spawnAmmoNumber(p.x + p.width / 2, p.y - 6, movedAmount);
        }
        break;
      }
    }

    get().removePickup(id);
  },

  syncBreakableProps: (camera, bounds) => {
    const pad = 520;
    set(state => {
      const mineAmbushAnchor = state.mineAmbushAnchor ?? (
        state.gameTime >= MINE_AMBUSH_TIME_MS
          ? {
              id: `${Math.floor(state.gameTime)}`,
              x: state.player.x + state.player.width / 2,
              y: state.player.y + state.player.height / 2,
              width: bounds.width + 180,
              height: bounds.height + 180,
            }
          : null
      );
      const generated = torchesInRegion(
        camera.x - pad,
        camera.y - pad,
        camera.x + bounds.width + pad,
        camera.y + bounds.height + pad
      );
      const generatedMines = minesInRegion(
        camera.x - pad,
        camera.y - pad,
        camera.x + bounds.width + pad,
        camera.y + bounds.height + pad
      );
      const pressureMines = pressureMinesNearPlayer(
        state.player.x + state.player.width / 2,
        state.player.y + state.player.height / 2,
        state.player.lastDirection,
        state.gameTime
      );
      const ambushMines = mineAmbushAnchor ? mineAmbushAround(mineAmbushAnchor) : [];
      const current = new Map(state.breakableProps.map(p => [p.id, p]));
      const next: BreakableProp[] = [];

      for (const torch of generated) {
        if (state.destroyedBreakableProps[torch.id]) continue;
        const existing = current.get(torch.id);
        if (existing) {
          next.push(existing);
          continue;
        }
        const rect = torchRect(torch);
        next.push({
          id: torch.id,
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          footX: torch.footX,
          footY: torch.footY,
          scale: torch.scale,
          health: 12,
          maxHealth: 12,
          type: 'torch',
          lastHit: 0
        });
      }

      for (const mine of [...generatedMines, ...pressureMines, ...ambushMines]) {
        if (state.destroyedBreakableProps[mine.id]) continue;
        const existing = current.get(mine.id);
        if (existing) {
          next.push(existing);
          continue;
        }
        const rect = mineRect(mine);
        next.push({
          id: mine.id,
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          footX: mine.footX,
          footY: mine.footY,
          scale: mine.scale,
          health: 1,
          maxHealth: 1,
          type: 'mine',
          lastHit: 0
        });
      }

      return { breakableProps: next, mineAmbushAnchor };
    });
  },

  damageBreakableProp: (id, amount) => {
    let broken: BreakableProp | null = null;
    set(state => {
      const prop = state.breakableProps.find(p => p.id === id);
      if (!prop) return {};

      const nextHealth = Math.max(0, prop.health - amount);
      if (nextHealth <= 0) {
        broken = { ...prop, health: 0, lastHit: Date.now() };
        return {
          breakableProps: state.breakableProps.filter(p => p.id !== id),
          destroyedBreakableProps: {
            ...state.destroyedBreakableProps,
            [id]: true
          }
        };
      }

      return {
        breakableProps: state.breakableProps.map(p =>
          p.id === id ? { ...p, health: nextHealth, lastHit: Date.now() } : p
        )
      };
    });
    return broken;
  },

  dropBreakablePropLoot: (prop) => {
    const cx = prop.footX - 8;
    const cy = prop.footY - 18;
    const strapCount = TORCH_STRAP_DROP_MIN + Math.floor(Math.random() * TORCH_STRAP_DROP_VARIANCE);
    strapDropValues(strapCount).forEach((value, i) => {
      get().addPickup({
        id: `pickup-strap-prop-${prop.id}-${i}`,
        x: cx,
        y: cy,
        type: 'strap',
        value
      });
    });

    if (Math.random() >= BREAKABLE_PROP_DROP_CHANCE) return;
    const x = prop.footX - 8;
    const y = prop.footY - 16;
    const roll = Math.random();
    const player = get().player;

    if (roll < 0.5) {
      const equippedAmmo = getActiveGun(player)?.ammoType;
      const owned = getGuns(player)
        .map(w => w.ammoType)
        .filter((t): t is AmmoType => !!t);
      const dropType = equippedAmmo ?? owned[0];
      if (dropType) {
        get().addPickup({
          id: `pickup-torch-ammo-${prop.id}`,
          x, y,
          type: `ammo-${dropType}` as 'ammo-handgun' | 'ammo-shotgun' | 'ammo-rifle',
          value: 0
        });
        return;
      }
    }

    if (roll < 0.75) {
      get().addPickup({
        id: `pickup-torch-health-${prop.id}`,
        x, y,
        type: 'health',
        value: 20
      });
      return;
    }

    if (roll < 0.9) {
      get().addPickup({
        id: `pickup-torch-bomb-${prop.id}`,
        x, y,
        type: 'bomb',
        value: 0
      });
      return;
    }

    get().addPickup({
      id: `pickup-torch-magnet-${prop.id}`,
      x, y,
      type: 'magnet',
      value: 0
    });
  },

  // Equip a dropped/crate weapon into its slot. Auto-pick: a weapon only
  // replaces the current gun/melee if it is a higher tier (so a
  // stray T1 drop never downgrades a T3). Existing guns convert to ammo.
  grantWeapon: (key) => {
    const weapon = createWeapon(key);
    let duplicateAmmo: { amount: number } | null = null;
    set(state => {
      const player = state.player;

      // Melee: single slot, keep the higher tier (as before).
      if (weapon.isMelee) {
        const idx = player.weapons.findIndex(w => w.isMelee);
        const current = idx >= 0 ? player.weapons[idx] : undefined;
        if (current && (weapon.tier ?? 1) < (current.tier ?? 1)) return {};
        const weapons = [...player.weapons];
        if (idx >= 0) weapons[idx] = weapon; else weapons.push(weapon);
        return { player: { ...player, weapons } };
      }

      // Guns: one per category (max 3). A new category is added to the
      // arsenal; an existing category keeps whichever tier is higher.
      const idx = player.weapons.findIndex(
        w => !w.isMelee && w.category === weapon.category
      );
      const current = idx >= 0 ? player.weapons[idx] : undefined;
      const isActiveCategory = current && current.id === player.activeWeaponId;

      if (current && (weapon.tier ?? 1) <= (current.tier ?? 1)) {
        const ammoType = weapon.ammoType;
        const ammoField = AMMO_FIELD[ammoType];
        const amount = get().ammoPickupAmounts[ammoType] * 2;
        duplicateAmmo = { amount };
        return {
          player: {
            ...player,
            [ammoField]: Math.min(AMMO_MAX[ammoType], player[ammoField] + amount)
          },
        lastWeaponGet: {
          name: `${weaponTierLabel(weapon.tier)} ${weapon.name} -> 弾薬 +${amount}`,
          at: Date.now(),
          color: weaponTierColor(weapon.tier),
          kind: 'weapon'
        }
        };
      }

      const weapons = [...player.weapons];
      if (idx >= 0) weapons[idx] = weapon; else weapons.push(weapon);

      // Keep the active selection sensible: stay on the upgraded active gun
      // (its id changed), or arm the new gun if we had none / were dry (no
      // loaded rounds and no reserve to reload from).
      const hadGun = getGuns(player).length > 0;
      const activeNow = getActiveGun(player);
      const activeDry =
        !activeNow?.ammoType ||
        ((activeNow.magazine ?? 0) <= 0 && ammoPoolFor(player, activeNow.ammoType) <= 0);
      let activeWeaponId = player.activeWeaponId;
      if (isActiveCategory || !hadGun || activeDry) {
        activeWeaponId = weapon.id;
      }

      // If the gun we just replaced was mid-reload, drop that reload (its id is
      // gone; the new gun comes fully loaded anyway).
      const wasReloadingReplaced = current && player.reloadingWeaponId === current.id;
      const reloadPatch = wasReloadingReplaced
        ? { reloadingWeaponId: '', reloadEndsAt: 0 }
        : {};

      return {
        player: { ...player, weapons, activeWeaponId, ...reloadPatch },
        lastWeaponGet: {
          name: `${weaponTierLabel(weapon.tier)} ${weapon.name}`,
          at: Date.now(),
          color: weaponTierColor(weapon.tier),
          kind: 'weapon'
        }
      };
    });

    if (duplicateAmmo) {
      const p = get().player;
      get().spawnAmmoNumber(p.x + p.width / 2, p.y - 6, duplicateAmmo.amount);
    }
  },

  // Manually arm a specific gun (from the HUD weapon icons). Ignores melee.
  // Cancels any in-progress reload so the move-speed penalty doesn't follow
  // the player onto the freshly-armed gun.
  setActiveWeapon: (id) => {
    set(state => {
      const target = state.player.weapons.find(w => w.id === id && !w.isMelee);
      if (!target) return {};
      return {
        player: {
          ...state.player,
          activeWeaponId: id,
          reloadingWeaponId: '',
          reloadEndsAt: 0
        }
      };
    });
  },

  // Begin reloading a gun: pull rounds from its reserve into its magazine over
  // the weapon's reload time. No-op if already reloading it, the mag is full,
  // or the reserve is empty.
  startReload: (weaponId) => {
    set(state => {
      const p = state.player;
      const w = p.weapons.find(g => g.id === weaponId);
      if (!w || !w.ammoType) return {};
      if (p.reloadingWeaponId === weaponId && Date.now() < p.reloadEndsAt) return {};
      const need = effectiveMagSize(w, p) - (w.magazine ?? 0);
      if (need <= 0) return {};
      if (ammoPoolFor(p, w.ammoType) <= 0) return {}; // no reserve to load from
      return {
        player: {
          ...p,
          reloadingWeaponId: weaponId,
          reloadEndsAt: Date.now() + effectiveReloadMs(w, p)
        }
      };
    });
  },

  // Complete a finished reload: move min(need, reserve) rounds from the reserve
  // pool into the gun's magazine. Called once per frame from the game loop.
  tickReload: () => {
    set(state => {
      const p = state.player;
      if (!p.reloadingWeaponId || Date.now() < p.reloadEndsAt) return {};
      const w = p.weapons.find(g => g.id === p.reloadingWeaponId);
      if (!w || !w.ammoType) {
        return { player: { ...p, reloadingWeaponId: '', reloadEndsAt: 0 } };
      }
      const field = AMMO_FIELD[w.ammoType];
      const need = Math.max(0, effectiveMagSize(w, p) - (w.magazine ?? 0));
      const moved = Math.min(need, p[field]);
      return {
        player: {
          ...p,
          [field]: p[field] - moved,
          weapons: p.weapons.map(g =>
            g.id === w.id ? { ...g, magazine: (g.magazine ?? 0) + moved } : g
          ),
          reloadingWeaponId: '',
          reloadEndsAt: 0
        }
      };
    });
  },

  // Keep the active gun shootable. Called each frame before firing:
  //   1. active gun has loaded rounds -> nothing to do.
  //   2. active gun empty but has reserve -> reload it (don't switch).
  //   3. active gun fully dry -> switch to a gun that can fire now (loaded) or
  //      reload (has reserve); if none, the player falls back to melee.
  autoSwitchIfDry: () => {
    const player = get().player;
    const active = getActiveGun(player);
    if (!active?.ammoType) return;
    if ((active.magazine ?? 0) > 0) return;
    if (ammoPoolFor(player, active.ammoType) > 0) {
      get().startReload(active.id);
      return;
    }
    const guns = getGuns(player);
    const ready = guns.find(w => (w.magazine ?? 0) > 0);
    const reloadable = guns.find(w => w.ammoType && ammoPoolFor(player, w.ammoType) > 0);
    const target = ready ?? reloadable;
    if (target && target.id !== player.activeWeaponId) {
      set(state => ({ player: { ...state.player, activeWeaponId: target.id } }));
    }
  },
  
  // Game state actions
  setGameTime: (time) => {
    set({ gameTime: time });
  },
  
  setPaused: (paused) => {
    set({ isPaused: paused });
  },

  setMeleeAmmoDropPercent: (pct) => {
    const clamped = clampDropPct(pct);
    try { localStorage.setItem(DROP_PCT_KEY, String(clamped)); } catch { /* ignore */ }
    set({ meleeAmmoDropPercent: clamped });
  },

  setAmmoPickupAmount: (type, amount) => {
    const clamped = clampAmmoPickupAmount(amount);
    set(state => {
      const next = { ...state.ammoPickupAmounts, [type]: clamped };
      try { localStorage.setItem(AMMO_PICKUP_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return { ammoPickupAmounts: next };
    });
  },

  setUnlockedShopSkillCard: (key, level) => {
    const nextLevel = Math.max(0, Math.min(3, Math.round(level)));
    set(state => {
      const next = { ...state.unlockedShopSkillCards };
      if (nextLevel <= 0) {
        delete next[key];
      } else {
        next[key] = nextLevel;
      }
      return { unlockedShopSkillCards: next };
    });
  },

  setStartWithTestStraps: (enabled) => {
    set({ startWithTestStraps: enabled });
  },

  addMeleeFinishCombo: (amount = 1) => {
    const gain = Math.max(1, Math.floor(amount));
    set(state => {
      const nextCombo = state.meleeFinishComboUntil >= state.gameTime
        ? state.meleeFinishComboCount + gain
        : gain;
      return {
        meleeFinishComboCount: nextCombo,
        meleeFinishComboUntil: state.gameTime + MELEE_FINISH_COMBO_WINDOW_MS,
        gameStats: {
          ...state.gameStats,
          maxCombo: Math.max(state.gameStats.maxCombo, nextCombo)
        }
      };
    });
  },

  setGameBounds: (bounds) => {
    set({ gameBounds: bounds });
  },
  
  updateGameStats: (stats) => {
    set(state => ({
      gameStats: { ...state.gameStats, ...stats }
    }));
  },
  
  resetGame: (characterClass) => {
    const validClass = ['warrior', 'mage', 'rogue', 'necromancer'].includes(characterClass) 
      ? characterClass as CharacterClass 
      : 'warrior';
      
    const startingWeapons = getStartingWeapons(validClass);
    const profile = PLAYER_PROFILES[validClass] ?? PLAYER_PROFILES.warrior;
    const maxHealth = profile.maxHp;
    
    set(state => {
      // World is infinite; player starts at the origin and the camera
      // follows. No need to pre-center within bounds.
      return {
        player: {
          x: 0,
          y: 0,
          vx: 0,
          vy: 0,
          width: PLAYER_HITBOX,
          height: PLAYER_HITBOX,
          speed: PLAYER_BASE_SPEED,
          health: maxHealth,
          maxHealth,
          experience: 0,
          level: 1,
          experienceToNextLevel: 5,
          weapons: startingWeapons,
          activeWeaponId: startingWeapons.find(w => !w.isMelee)?.id ?? '',
          characterClass: validClass,
          direction: 'idle',
          isMoving: false,
          invulnerable: false,
          invulnerableTime: 0,
          lastDirection: null,
          counterWindowEnd: 0,
          counterCooldownEnd: 0,
          lastCounterSuccessTime: 0,
          ammoHandgun: AMMO_INITIAL.handgun,
          ammoShotgun: AMMO_INITIAL.shotgun,
          ammoRifle: AMMO_INITIAL.rifle,
          critChance: 0,
          quickMagCritUntil: 0,
          reloadEndsAt: 0,
          reloadingWeaponId: '',
          magBonus: 0,
          reloadMult: 1,
          subWeapons: [],
          subWeaponLevels: {},
          subWeaponCooldowns: {},
          huntingChargeStartedAt: 0,
          huntingCharged: false,
          katanaDashUntil: 0,
          katanaDashDirX: 0,
          katanaDashDirY: 0,
          katanaDashCooldownEnd: 0,
          straps: state.startWithTestStraps ? 1000 : 0,
          vaccineRevives: 0
        },
        enemies: [],
        projectiles: [],
        pickups: [],
        breakableProps: [],
        destroyedBreakableProps: {},
        mineAmbushAnchor: null,
        castleEvent: createCastleEvent(),
        weaponMerchant: createWeaponMerchant(),
        eventQuestNpc: createEventQuestNpc(),
        gameTime: 0,
        isPaused: false,
        showUpgradeMenu: false,
        showShopMenu: false,
        showEventQuestMenu: false,
        shopReopenAt: 0,
        eventQuestReopenAt: 0,
        vaccinePurchased: false,
        gameWon: false,
        meleeFinishComboCount: 0,
        meleeFinishComboUntil: 0,
        upgradeOptions: [],
        touchActive: false,
        swipeDirection: null,
        gameStats: {
          timeAlive: 0,
          enemiesKilled: 0,
          damageDealt: 0,
          experienceCollected: 0,
          maxLevel: 1,
          maxCombo: 0,
          strapsCollected: 0,
          strapsSpent: 0,
          treasuresCollected: 0
        },
        characterClass: validClass,
        effects: [],
        camera: {
          x: 0,
          y: 0
        },
        lastWeaponGet: null,
        hitstopUntil: 0,
        timeSlowUntil: 0,
        timeSlowScale: 1,
        shakeUntil: 0
      };
    });
  },
  
  setCameraPosition: (x, y) => {
    // Infinite world: the camera follows the player one-to-one with no clamp.
    set({ camera: { x, y } });
  },

  triggerTimeSlow: (scale, durationMs) => {
    const now = Date.now();
    const clampedScale = Math.max(MIN_TIME_SLOW_SCALE, Math.min(MAX_TIME_SLOW_SCALE, scale));
    const until = now + Math.max(0, durationMs);
    set(state => {
      const active = now < state.timeSlowUntil;
      return {
        timeSlowUntil: Math.max(active ? state.timeSlowUntil : 0, until),
        timeSlowScale: active
          ? Math.min(state.timeSlowScale, clampedScale)
          : clampedScale
      };
    });
  },

  spawnEffect: (effect) => {
    // Cap the effect pool so a stray bug can't degrade the framerate.
    set(state => {
      const next = [...state.effects, effect];
      if (next.length > 400) next.splice(0, next.length - 400);
      return { effects: next };
    });
  },

  spawnBurst: (x, y, color, count = 6) => {
    const now = Date.now();
    const fresh: VisualEffect[] = [];
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 120;
      fresh.push({
        kind: 'particle',
        id: `fx-burst-${now}-${i}-${Math.random().toString(36).slice(2, 6)}`,
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color,
        size: 2 + Math.random() * 2,
        createdAt: now,
        duration: 280 + Math.random() * 160,
        drag: 4
      });
    }
    set(state => {
      const next = [...state.effects, ...fresh];
      if (next.length > 400) next.splice(0, next.length - 400);
      return { effects: next };
    });
  },

  spawnDamageNumber: (x, y, value, crit = false) => {
    const now = Date.now();
    const effect: VisualEffect = {
      kind: 'damageNumber',
      id: `fx-dmg-${now}-${Math.random().toString(36).slice(2, 6)}`,
      x: x + (Math.random() - 0.5) * 18,
      y: y + (Math.random() - 0.5) * 8,
      value: Math.max(1, Math.round(value)),
      color: crit ? '#fbbf24' : '#fef9c3',
      createdAt: now,
      duration: 720,
      crit
    };
    set(state => {
      const next = [...state.effects, effect];
      if (next.length > 400) next.splice(0, next.length - 400);
      return { effects: next };
    });
  },

  // Floating "+N" for ammo pickups, in a distinct cyan so it reads separately
  // from white/gold damage numbers. Rises from the given point (player's head).
  spawnAmmoNumber: (x, y, amount) => {
    const now = Date.now();
    const effect: VisualEffect = {
      kind: 'damageNumber',
      id: `fx-ammo-${now}-${Math.random().toString(36).slice(2, 6)}`,
      x, y,
      value: amount,
      text: `+${amount}`,
      color: '#67e8f9',
      createdAt: now,
      duration: 760
    };
    set(state => {
      const next = [...state.effects, effect];
      if (next.length > 400) next.splice(0, next.length - 400);
      return { effects: next };
    });
  },

  // Big bold floating callout (e.g. "Kill!", "Counter!"). Rises and fades like
  // a damage number but larger.
  spawnCallout: (x, y, text, color, opts) => {
    const now = Date.now();
    const effect: VisualEffect = {
      kind: 'damageNumber',
      id: `fx-callout-${now}-${Math.random().toString(36).slice(2, 6)}`,
      x, y,
      value: 0,
      text,
      color,
      scale: opts?.scale ?? 1.9,
      serif: opts?.serif,
      createdAt: now,
      duration: opts?.serif ? 1000 : 850
    };
    set(state => {
      const next = [...state.effects, effect];
      if (next.length > 400) next.splice(0, next.length - 400);
      return { effects: next };
    });
  },

  spawnRing: (x, y, startRadius, endRadius, color, width = 3, duration = 500) => {
    const now = Date.now();
    set(state => ({
      effects: [
        ...state.effects,
        {
          kind: 'ring',
          id: `fx-ring-${now}-${Math.random().toString(36).slice(2, 6)}`,
          x, y, startRadius, endRadius, color, width,
          createdAt: now,
          duration
        }
      ]
    }));
  },

  spawnGlow: (x, y, radius, color, duration = 320) => {
    const now = Date.now();
    const small = radius < STRONG_GLOW_RADIUS;
    const tunedRadius = small ? radius * SMALL_GLOW_RADIUS_SCALE : radius;
    const tunedDuration = small
      ? Math.max(SMALL_GLOW_MIN_DURATION_MS, Math.round(duration * SMALL_GLOW_DURATION_SCALE))
      : duration;
    set(state => {
      const next = [...state.effects, {
        kind: 'glow' as const,
        id: `fx-glow-${now}-${Math.random().toString(36).slice(2, 6)}`,
        x, y, radius: tunedRadius, color,
        createdAt: now,
        duration: tunedDuration
      }];
      if (next.length > 400) next.splice(0, next.length - 400);
      return { effects: next };
    });
  },

  spawnSlash: (x, y, color = 'rgba(255,255,255,0.95)', lengthScale = 1) => {
    const now = Date.now();
    set(state => {
      const next = [...state.effects, {
        kind: 'slash' as const,
        id: `fx-slash-${now}-${Math.random().toString(36).slice(2, 6)}`,
        x: x + (Math.random() - 0.5) * 8,
        y: y + (Math.random() - 0.5) * 8,
        angle: -0.9 + Math.random() * 0.5, // roughly diagonal, slight variance
        length: (26 + Math.random() * 8) * lengthScale,
        color,
        createdAt: now,
        duration: 200
      }];
      if (next.length > 400) next.splice(0, next.length - 400);
      return { effects: next };
    });
  },

  spawnFlash: (color, duration = 220) => {
    const now = Date.now();
    set(state => ({
      effects: [
        ...state.effects,
        {
          kind: 'flash',
          id: `fx-flash-${now}`,
          color,
          createdAt: now,
          duration
        }
      ]
    }));
  },

  updateEffects: (deltaTime) => {
    const now = Date.now();
    set(state => {
      const live: VisualEffect[] = [];
      for (const e of state.effects) {
        if (now - e.createdAt > e.duration) continue;
        if (e.kind === 'particle') {
          const drag = e.drag ?? 0;
          const decay = drag > 0 ? Math.exp(-drag * deltaTime) : 1;
          live.push({
            ...e,
            x: e.x + e.vx * deltaTime,
            y: e.y + e.vy * deltaTime,
            vx: e.vx * decay,
            vy: e.vy * decay
          });
        } else if (e.kind === 'damageNumber') {
          // Damage numbers drift upward and slow over time
          live.push({ ...e, y: e.y - 40 * deltaTime });
        } else {
          live.push(e);
        }
      }
      return { effects: live };
    });
  }
}));

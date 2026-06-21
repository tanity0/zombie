import { create } from 'zustand';
import { generateEquipmentChoices } from '../utils/upgradeUtils';
import {
  Player, Enemy, Projectile, Pickup, BreakableProp, GameStats,
  InputState, UpgradeOption, GameBounds, CharacterClass,
  VisualEffect, AmmoType, Direction, SubWeaponKey, SkillKey, CastleEvent, DifficultyRank,
  WeaponMerchant, ShopItemKey, StageTheme, EventQuestNpc, Summon,
  RhythmState, RhythmArrow, ShijinGod, RhythmPending, IntroLine, LabDoor, LabButton, LabProp,
  ActiveEvent
} from '../types/game';
import { clampRectInsideCircle } from '../world/arena';
import {
  RescueSurvivor, computeSurvivorStep, pickRescueComposition,
  RESCUE_RADIUS, RESCUE_SURVIVOR_SIZE, RESCUE_CIVILIAN_HP, RESCUE_SHOOTER_HP,
  RESCUE_ATTACKERS, RESCUE_SHOOTER_RANGE, RESCUE_SHOOTER_INTERVAL_MS, RESCUE_SHOOTER_DAMAGE,
  RESCUE_HOLD_NEED_MS, RESCUE_SURVIVOR_SPEED, RESCUE_HIT_SPEED_BOOST_MS, RESCUE_HIT_SPEED_MULT,
  RESCUE_OUTRO_MS,
} from '../world/rescue';
import {
  RHYTHM_INTERVAL_MS, RHYTHM_LEAD_MS, RHYTHM_SUCCESS_WINDOW_MS, RHYTHM_FLICK_EXTRA_WINDOW_MS, RHYTHM_FLICK_MAX_CONTACT_MS, RHYTHM_INPUT_DEBOUNCE_MS,
  RHYTHM_START_INVULN_MS, SHIJIN_FINISH_COUNT, SHIJIN_BY_ARROW, rhythmComboStage,
  randomRhythmPrompt, arrowFromDir, BYAKKO_DURATION_MS, BYAKKO_INTERVAL_MS,
  SHIJIN_SLIDE_DISTANCE, SHIJIN_SLIDE_MS
} from '../config/shijin';
import { getStartingWeapons, createWeapon, AMMO_FIELD, getActiveGun, getGuns, ammoPoolFor, effectiveMagSize, effectiveReloadMs, isReloading } from '../utils/weaponUtils';
import { openCrate } from '../utils/weaponDrop';
import { isBossType, resolveEnemyTarget, spawnEnemyAt } from '../utils/enemyUtils';
import {
  buildSummon, ALCHEMY_RARE_CHANCE, ALCHEMY_MAX_NORMAL, ALCHEMY_AGGRO_RANGE,
  ALCHEMY_DESPAWN_DIST, ALCHEMY_FOLLOW_GAP_PX,
  ALCHEMY_ATTACK_RANGE, ALCHEMY_ATTACK_INTERVAL_MS, ALCHEMY_RARE_SUCTION_PULL_RANGE,
  ALCHEMY_RARE_SUCTION_MAX_TARGETS, ALCHEMY_RARE_SUCTION_SPEED, SHOP_ALCHEMY_COST,
  ALCHEMY_RARE_MELEE_INTERVAL_MS, ALCHEMY_RARE_MELEE_DAMAGE, ALCHEMY_RARE_SUCTION_RADIUS
} from '../utils/summonUtils';
import { resolveTreeCollision, treesInRegion, trunkRect } from '../world/trees';
import { resolveTorchCollision, torchRect, torchesInRegion } from '../world/torches';
import { mineAmbushAround, mineRect, minesInRegion, pressureMinesNearPlayer } from '../world/mines';
import type { MineAmbushAnchor } from '../world/mines';
import { PLAYER_PROFILES } from '../data/playerProfiles';
import { EQUIPMENT, equipmentById, aggregateEquipBonus, equipMaxHealthOf, neutralEquipBonus, emptyEquipLoadout } from '../data/equipment';
import { footRect, rectsOverlap, resolveAabb, segmentBlocked, type Rect } from '../world/obstacles';
import { enemyFootBox } from '../pixi/renderSpec';
import { labWallsInRegion, labUvBarsInRegion, wallRect, labPropsInRegion, propRect } from '../world/labWalls';
import { LAB_DOORS, LAB_BUTTON, LAB_ENEMIES, LAB_PLAYER_SPAWN, LAB_MERCHANT, LAB_CARD_KEY, LAB_WEAPON_CRATE, LAB_CLEAR_ITEM, LAB_UV_BARS, LAB_AMMO_PICKUPS, labBlockingWalls, generateLabProps } from '../world/labMap';
import { HUNTING_MELEE_RADIUS_BONUS_BY_LEVEL } from '../config/hunting';

// 四神舞(リズム)の初期状態。新規ラン/リセットで使い回す。
const initialRhythm = (): RhythmState => ({
  active: false, interval: RHYTHM_INTERVAL_MS, firstBeatAt: 0, expectBeat: 0, prompt: randomRhythmPrompt(), inputIndex: 0, inputArrows: [],
  godSuccess: 0, comboStage: 0, lastInputAt: 0, lastJudge: 'none', lastJudgeAt: 0, lastJudgeKind: 'none', lastJudgeArrow: null, judgeSeq: 0, lastTapAt: 0, lastFinishAt: 0, lastGod: null,
  invulnUntil: 0, byakkoUntil: 0, byakkoNextAt: 0, byakkoHits: 0, pending: [],
});

// RE-style ammo economy. Guns fire from a per-gun magazine and reload from
// these per-family RESERVE pools. The reserve starts large (you're well
// stocked) but ammo is hard to find, so the run is a slow drain on it.
export const AMMO_MAX: Record<AmmoType, number> = { handgun: 72, shotgun: 18, rifle: 36, phill: 48 };
// 全体調整: 経験値の溜まるスピードを1/3に(獲得量に一律倍率)。
export const XP_GAIN_MULT = 1 / 3;
// 初期所持は上限を超えないようにする(shotgun は旧40→新上限18へ)。phill=母数(リザーブ)24スタート。
export const AMMO_INITIAL: Record<AmmoType, number> = { handgun: 60, shotgun: 18, rifle: 24, phill: 24 };
// How much a world/melee ammo pickup grants for each family (enemy drops, air
// drops, and the boxes melee kills now drop). Modest relative to the reserve
// cap — resupply is scarce。phill=1ピックアップ/購入で6発。
export const AMMO_PICKUP: Record<AmmoType, number> = { handgun: 40, shotgun: 10, rifle: 20, phill: 6 };

// Player-tunable melee ammo-drop rate (percent), set on the start screen and
// persisted across reloads. A melee kill drops ammo at this rate; a melee
// finisher rolls at 1.5× (capped at 100%). Counter (reflect) kills are separate.
const DROP_PCT_KEY = 'zombie:meleeAmmoDropPercent';
const AMMO_PICKUP_KEY = 'zombie:ammoPickupAmounts';
export const DEFAULT_MELEE_DROP_PCT = 30;
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
export const SHOP_VACCINE_COST = 500;
const HEAL_FRACTION = 0.3; // 救急セット: 最大HPの30%回復(社長指示・固定20から変更)
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
      rifle: clampAmmoPickupAmount(parsed.rifle ?? AMMO_PICKUP.rifle),
      phill: clampAmmoPickupAmount(parsed.phill ?? AMMO_PICKUP.phill)
    };
  } catch {
    return { ...AMMO_PICKUP };
  }
};

// 装備メニュー(サブ/スキル)の永続化。トップメニューで選んだ装備を localStorage に保存し、起動時に復元する。
const LOADOUT_SUBS_KEY = 'zombie:loadoutSubs';
const LOADOUT_SKILLS_KEY = 'zombie:loadoutSkills';
const loadStringArray = (key: string): string[] => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const a = JSON.parse(raw);
    return Array.isArray(a) ? a.filter((x): x is string => typeof x === 'string') : [];
  } catch { return []; }
};
const saveStringArray = (key: string, arr: string[]): void => {
  try { localStorage.setItem(key, JSON.stringify(arr)); } catch { /* ignore */ }
};
// 永続: ガチャで解禁したスキル所持 / 永続ゴールド残高(in-run の strap とは別系統)。
const OWNED_SKILLS_KEY = 'zombie:ownedSkills';
const GOLD_BALANCE_KEY = 'zombie:goldBalance';
// 装備の持ち帰り: 商人帰還/クリア時に1つだけ次run へ引き継ぐ(死亡で破棄)。defId 1件のみ保存。
const CARRIED_EQUIP_KEY = 'zombie:carriedEquip';
const loadCarriedEquip = (): string | null => {
  try { const r = localStorage.getItem(CARRIED_EQUIP_KEY); return r && EQUIPMENT[r] ? r : null; } catch { return null; }
};
const saveCarriedEquip = (defId: string | null): void => {
  try {
    if (defId && EQUIPMENT[defId]) localStorage.setItem(CARRIED_EQUIP_KEY, defId);
    else localStorage.removeItem(CARRIED_EQUIP_KEY);
  } catch { /* ignore */ }
};

// 次ランへ持ち越す装備ID(localStorage)。キャラ選択画面の「持ち越し装備」表示などから参照する。
export const getCarriedEquipId = (): string | null => loadCarriedEquip();

// 装備を該当スロットへ装着した新 Player を返す純関数(同スロットは置換=破棄)。最大体力の増減は
// player.maxHealth へベイクし、増分ぶんだけ現HPも底上げ(減少時は上限へクランプ)。equipItem と
// selectUpgrade(装備取得)の双方から使う。
const equipDefOnPlayer = (player: Player, defId: string): Player => {
  const def = equipmentById(defId);
  if (!def) return player;
  const nextLoadout = { ...player.equipment, [def.slot]: def.id };
  const hpDelta = equipMaxHealthOf(nextLoadout) - equipMaxHealthOf(player.equipment);
  const newMaxHealth = Math.max(1, player.maxHealth + hpDelta);
  const newHealth = Math.min(newMaxHealth, hpDelta > 0 ? player.health + hpDelta : player.health);
  return {
    ...player,
    equipment: nextLoadout,
    equipBonus: aggregateEquipBonus(nextLoadout),
    maxHealth: newMaxHealth,
    health: newHealth,
  };
};
const loadNumber = (key: string, def: number): number => {
  try { const r = localStorage.getItem(key); const n = r == null ? def : Number(r); return Number.isFinite(n) ? n : def; } catch { return def; }
};
const saveNumber = (key: string, n: number): void => {
  try { localStorage.setItem(key, String(n)); } catch { /* ignore */ }
};

// Light knockback applied to a normal enemy each time a bullet connects.
// Guns shove only half as hard as the melee counter's push.
// ノックバックでずらす速さを約2/3に(社長指示): 64→43。
export const BULLET_KNOCKBACK_SPEED = 43;

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
// PHILL銃の狙いサークル: 距離(レティクルの前方距離)と「吸い付き」半径(この距離内に頭があればスナップ)。
export const PHILL_AIM_RANGE = 130; // レティクル基準距離(手前寄りに。旧190)
export const PHILL_SNAP_RADIUS = 46;
// レベルアップ時に周辺の敵を強制的に押しのける(2倍ノックバック相当)。アップグレードメニューで
// 即ポーズするため velocity だと失効する → 位置を即時に動かす(menu を跨いでも効く)。
export const LEVELUP_KNOCKBACK_RADIUS = 240;   // 押しのける範囲(プレイヤー中心)
export const LEVELUP_KNOCKBACK_DISTANCE = 64;  // 押しのける距離(96→64=今の2/3。社長指示)
// Each successful reflect refreshes the window by this much so a chained
// barrage can be turned back in full. No hard cap — the cooldown still
// kicks in once the chain finally lapses.
export const COUNTER_EXTEND_PER_HIT = 200;

// Counter knockback (additional effect on top of the bullet reflect).
export const KNOCKBACK_SPEED = 133; // melee counter shove。ずらす速さを約2/3に(200→133。社長指示)
export const KNOCKBACK_DURATION = 280;
// ジャンプ/ダッシュ攻撃をカウンターした時の「弾き飛ばし」。速度ノックバックは updateEnemies が
// 翌フレーム以降に適用するため、着地で付与される stun/lift に上書きされ「その場で痺れる」だけに
// なっていた。→ パリィ成立の瞬間に即時で位置を飛ばす(LAUNCH)+その後も速く滑らせる(SPEED)。
export const COUNTER_KNOCKBACK_LAUNCH = 64; // 即時に飛ばす距離(px)
export const COUNTER_KNOCKBACK_SPEED = KNOCKBACK_SPEED * 3; // 続く速度スライド(従来は×2)
// 敵ダッシュ(犬/lab-zombie-2)の突進距離: プレイヤーまでの距離 + この値(プレイヤーの少し先で止まる)。
export const DASH_OVERSHOOT_PX = 80;
// プレイヤー被弾ノックバック(ジャンプ攻撃で弾き出される)。movePlayer が減衰しながら適用。
export const PLAYER_KNOCKBACK_SPEED = 460;
export const PLAYER_KNOCKBACK_MS = 260;
const TRAP_MELEE_SHOVE_DISTANCE = 68;
const TRAP_MELEE_SHOVE_SLIDE_MS = 220;
// 設置型シールドへの近接攻撃=シールドバッシュ。壁を法線方向へ SHIELD_BASH_SHOVE_DISTANCE
// 押し出し(トラップと同じ shove 機構でシームレス)、掃過した敵全部に近接×
// SHIELD_BASH_DAMAGE_MULT と押し出し方向への強ノックバックを与える(壁は破壊せず残す)。
const SHIELD_BASH_DAMAGE_MULT = 3;
const SHIELD_BASH_SHOVE_DISTANCE = 50;        // バッシュの飛び出し距離(少し短め)
const SHIELD_BASH_DURABILITY_COST = 5;        // バッシュ1回で減る耐久(0以下で破壊)
const SHIELD_BASH_KNOCKBACK_SPEED = 960; // 従来値を維持(KNOCKBACK_SPEED 200×4.8 相当。基準2/3化の影響を受けない)
// After being shoved by a melee counter, an enemy is immune to further melee
// knockback for this long (damage still lands) so it can't be locked forever.
export const KNOCKBACK_IMMUNE_MS = 1750;
export const REFLECT_DAMAGE_MULTIPLIER = 60.0; // countered/reflected bullets hit 60× harder
export const REFLECT_SPEED_MULTIPLIER = 1.8;
// スキル: 反射神経の反撃爆発。ランチャー相当の半径・ダメージ(useGameLoop GRENADE_* に準拠の仮値)。
export const REFLEX_BLAST_RADIUS = 92;  // = GRENADE_BLAST_RADIUS
export const REFLEX_BLAST_DAMAGE = 60;  // ランチャー級の反撃(要実機調整)

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
export const KATANA_DASH_DISTANCE = 154; // 128 ×1.2(社長指示)。刀/小烏丸 共通。
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

// ---- ワイヤーアンカー(移動系サブウェポン) ------------------------------------
// 装備中、前方(ショットガン射程くらい)に青サークルを常時表示。指離しでアンカー打ち込み開始
// (WIRE_PLANT_MS=0.1秒で発射)、完了後の追加タップでアンカー地点へ高速移動。着地時に周囲へ
// 近接攻撃(2倍ノックバック)。高速移動中は敵接触ダメージ無効。CD は全Lv 1秒(クールダウン中はサークル非表示)。
export const WIRE_ANCHOR_RANGE = 200;   // 青サークル距離(飛距離)。社長指示で 110→200。
// アナログスティックの傾き強度(swipeStrength: 0..1)で、移動速度と狙い距離を可変にする。
// 強度0(デッドゾーン直上)でも完全停止にはせず、最低係数だけ残す(操作不能を避ける)。
// キャラ移動: 弱い傾き=ゆっくり歩く(最低 STICK_WALK_MIN_FACTOR 倍)。
// 狙い距離(ワイヤーアンカー/PHILLレティクル): 弱い傾き=近く(最低 STICK_AIM_MIN_FACTOR 倍)。
export const STICK_WALK_MIN_FACTOR = 0.20; // 歩行速度の最低倍率(強度0時。弱タッチ=さらにゆっくり)
export const STICK_AIM_MIN_FACTOR = 0.25;  // 狙い距離の最低倍率(強度0時)
// 傾き強度 → 係数への共通リマップ(レンダラと共有して見た目と挙動を一致させる)。
export const stickAimFactor = (strength: number) =>
  STICK_AIM_MIN_FACTOR + (1 - STICK_AIM_MIN_FACTOR) * Math.max(0, Math.min(1, strength));
export const WIRE_PLANT_MS = 100;       // 打ち込み(先端が飛んで刺さるまで)=0.1秒で発射。刺さると高速移動可。
export const WIRE_DASH_MS = 200;        // 高速移動の所要時間
export const WIRE_COOLDOWN_BY_LEVEL = [0, 1000, 1000, 1000] as const; // 全Lv共通=1秒(発射が速い代わり)
// 敵に刺さった時(発火ナイフ風吸着): 0.1秒で敵を引き寄せ→近接ダメージ→大幅ノックバック。
export const WIRE_STICK_MS = 100;       // 引き寄せ時間(0.1秒)
export const WIRE_KNOCKBACK_SPEED = 1100; // 大幅ノックバックの初速(px/s)
// ワイヤーダッシュ着地時の近接攻撃: 従来値を維持(KNOCKBACK_SPEED 200×2 相当)。
export const WIRE_LAND_KNOCKBACK_SPEED = 400;

// 敵タイプ → 死因表示用の日本語ラベル。
const ENEMY_DEATH_LABELS: Record<string, string> = {
  zombie: '変異体(徘徊型)',
  skeleton: '変異体(痩躯型)',
  ghost: '幽鬼',
  bat: '吸血コウモリ',
  werewolf: '変異体(獣化型)',
  plant: '変異体(定着型)',
  pumpkin: '変異体(肥大型)',
  giantbat: '変異体(飛行型)',
  reaper: '死神',
  'lab-zombie-1': '研究施設の変異体(Lv1)',
  'lab-zombie-2': '研究施設の変異体(Lv2)',
  'lab-zombie-3': '研究施設の変異体(Lv3)',
};
export const enemyDeathLabel = (type: string): string => ENEMY_DEATH_LABELS[type] ?? '変異体';

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
// サブウェポンの実行時ブロック。排他サブ(刀/村雨, ダンスフロア=shijin)を装備していると、その仲間以外の
// サブウェポンは停止する(銃は別系統なので影響なし)。ダンスフロアは刀と同じく他サブと共存不可。
export const subWeaponBlockedByKatana = (player: Player, key: SubWeaponKey): boolean => {
  if (isKatanaMode(player)) {
    return key !== 'katana' && key !== 'murasame' && !KATANA_ALLOWED_SUBWEAPONS.includes(key);
  }
  // ダンスフロア(shijin)装備中: shijin 以外のサブを停止。
  if (player.subWeapons.includes('shijin')) {
    return key !== 'shijin';
  }
  return false;
};

// ---------------------------------------------------------------------------
// 鞭 (whip): 通常サブウェポン。装備中はナイフ近接を鞭に置き換える(刀と排他)。
// 敵を倒すより「押し退けて避難路を作る」武器。大ノックバック・低ダメージ。
// 当て続けてチャージ満タン(ヒット数)で、次の一振りがハリケーン(鞭先端へ吸引)。
// 数値は実機調整前提の仮値(TODO)。
// ---------------------------------------------------------------------------
export const WHIP_KNOCKBACK_SPEED = 600;          // 従来値を維持(KNOCKBACK_SPEED 200×3 相当・仕様アンカー)
export const WHIP_DAMAGE_MULT = 0.25;                            // TODO(鞭): 低/最小ダメージ
export const WHIP_HIT_HALF_WIDTH = 60;                           // カプセル半幅(=振り方向に直交するx軸判定。進行方向yに対しxを半分=従来120の半分)
export const WHIP_LENGTH_BY_LEVEL = [0, 150, 150, 150] as const; // 進行方向の射程。鞭の判定はレベルで変えない(全Lv共通150)
// 鞭の描画(lash表示)時間。従来220msの倍。描画延長分だけクールダウンも後ろへずらす。
export const WHIP_DRAW_MS = 440;
export const WHIP_COOLDOWN_EXTRA_MS = WHIP_DRAW_MS - 220;        // = 220: 描画を倍にした増分
export const WHIP_AMMO_DROP_CHANCE = 0.20;                       // 鞭ヒット時の弾薬ドロップ率(仕様)
export const WHIP_CHARGE_HITS_BY_LEVEL = [0, 40, 35, 30] as const; // ハリケーン必要ヒット数(Lv1=40、レベルが上がるごとに-5で軽くなる)
export const HURRICANE_RADIUS_BY_LEVEL = [0, 180, 220, 260] as const;       // 吸引半径(惹きつけ範囲を従来の2倍に)
export const HURRICANE_DURATION_MS_BY_LEVEL = [0, 4800, 5600, 6400] as const; // 持続(滞在時間 さらに2倍=計4倍)
export const HURRICANE_SUCTION_SPEED = 320;                      // TODO(鞭): 吸引速度(px/s)
export const HURRICANE_MAX_TARGETS_PER_FRAME = 12;               // 負荷cap: 1tickで吸引する最大敵数
export const HURRICANE_TICK_MS = 60;                             // 吸引tickのスロットル
// 鞭ハリケーンも死神と同様、巻き込んだ敵へ周期ダメージ(吸引で寄せた敵を削る)。
export const HURRICANE_DAMAGE = 10;                              // 1回のAoEダメージ(死神 ALCHEMY_RARE_MELEE_DAMAGE と同値)
export const HURRICANE_DAMAGE_INTERVAL_MS = 500;                 // ダメージ周期(死神と同じ0.5秒)
export const SHOP_WHIP_COST = 100;                               // TODO(鞭): 商人での鞭カード価格
export const SHOP_TURRET_COST = 100;                             // TODO(自動タレット): 仮値。商人でのタレットカード価格
export const SHOP_SHIJIN_COST = 100;                             // TODO(四神舞): 仮値。商人での四神舞カード価格
export const SHOP_SAGE_STONE_COST = 100;                         // 賢者の石: 100s(仕様確定)。錬金術Lv3で武器商人に並ぶ特殊枠サブ価格

export const hasWhip = (player: Player): boolean => player.subWeapons.includes('whip');
// 鞭モード = 鞭所持 かつ 刀モードでない(刀優先)。取得段階で排他だが二重防御。
export const isWhipMode = (player: Player): boolean => hasWhip(player) && !isKatanaMode(player);
export const whipLevel = (player: Player): number =>
  Math.max(1, Math.min(3, player.subWeaponLevels['whip'] ?? 1));
export const whipChargeThreshold = (player: Player): number =>
  WHIP_CHARGE_HITS_BY_LEVEL[whipLevel(player)];

// 錬金術ヘルパー。
export const hasAlchemy = (player: Player): boolean => player.subWeapons.includes('alchemy');
export const alchemyLevel = (player: Player): number =>
  Math.max(1, Math.min(3, player.subWeaponLevels['alchemy'] ?? 1));
export const hasRareSummon = (summons: Summon[]): boolean => summons.some(s => s.kind === 'rare');
// 特殊枠サブ「賢者の石」(錬金術Lv3で武器商人に並ぶ。錬金術と同居の排他枠)。
export const hasSageStone = (player: Player): boolean => player.subWeapons.includes('sage-stone');
// 村雨が刀Lv3で商人に並ぶのと同じ仕組み: 錬金術がLv3に達したら賢者の石を商人在庫(Lv1陳列)へ解禁。
// 解禁が必要なら新しい unlockedShopSkillCards を返す。不要(未達/既解禁)なら null。
export const maybeUnlockSageStone = (
  player: Player,
  unlocked: Partial<Record<SubWeaponKey, number>>,
): Partial<Record<SubWeaponKey, number>> | null => {
  if (alchemyLevel(player) < 3 || !player.subWeapons.includes('alchemy')) return null;
  if ((unlocked['sage-stone'] ?? 0) >= 1) return null;
  return { ...unlocked, 'sage-stone': 1 };
};

// 装備スキル判定。effect 層はすべてこのヘルパで分岐(非装備時は完全に従来挙動)。
export const hasSkill = (player: Player, key: SkillKey): boolean => player.skills.includes(key);

// === キャラ固有スキル(特別枠) ============================================
// 通常の装備スキル(player.skills)とは別枠で、選択キャラ(player.characterClass)により自動有効。
// 装備スキル枠を消費しない。ラン中に変更しない。スキル名は職名そのまま。
//   rogue=ストライカー / necromancer=スカベンジャー / mage=マークスマン / warrior=ヘビーガンナー
// ストライカー: 装備銃が弾切れ(マガジン+リザーブ=0)のとき近接攻撃力 ×1.5。
export const strikerMeleeMult = (player: Player): number => {
  if (player.characterClass !== 'rogue') return 1;
  const gun = getActiveGun(player);
  if (!gun || !gun.ammoType) return 1.5; // 銃/弾種なし=弾切れ扱い
  return ((gun.magazine ?? 0) + ammoPoolFor(player, gun.ammoType)) <= 0 ? 1.5 : 1;
};
// スカベンジャー: 弾薬取得後3秒、銃ダメージ ×1.1。
export const scavengerGunMult = (player: Player, gameTime: number): number =>
  player.characterClass === 'necromancer' && gameTime < player.scavengerBuffUntil ? 1.1 : 1;
// マークスマン: 3秒以上連続移動すると移動速度 ×1.2(停止で即解除。社長指示で射程UP→移動速度UPに変更)。
export const marksmanSpeedMult = (player: Player, gameTime: number): number =>
  player.characterClass === 'mage' && player.isMoving && player.marksmanMovingSince > 0 &&
  gameTime - player.marksmanMovingSince >= 3000 ? 1.2 : 1;
// ヘビーガンナー: 同一攻撃で2体以上に当てた後3秒、すべての爆発範囲 ×1.1。
export const heavyGunnerExplosionMult = (player: Player, gameTime: number): number =>
  player.characterClass === 'warrior' && gameTime < player.heavyGunnerExpBuffUntil ? 1.1 : 1;

// --- 装備スキルの数値補正ヘルパ(effect層・全て純粋関数) -------------------
// ナイト: 被ダメ×0.8 / バーサーカー: 被ダメ×1.2。両立可(乗算)。
export const skillIncomingDamageMult = (player: Player): number =>
  (hasSkill(player, 'knight') ? 0.8 : 1) * (hasSkill(player, 'berserker') ? 1.2 : 1);
// バーサーカー: 全攻撃 ×(1 + 失ったHP割合)。上限なし(満タンで×1、瀕死で最大~×2)。
export const skillOutgoingDamageMult = (player: Player): number =>
  hasSkill(player, 'berserker') && player.maxHealth > 0
    ? 1 + Math.max(0, (player.maxHealth - player.health) / player.maxHealth)
    : 1;
// クリティカルD上昇: crit倍率 +0.5(通常1.5→2.0 / boss 5→5.5)。
export const skillCritMult = (player: Player, base: number): number =>
  base + (hasSkill(player, 'crit-up') ? 0.5 : 0);
// ナイト: 盾/召喚の最大HP ×1.5。
export const skillSummonHpMult = (player: Player): number => (hasSkill(player, 'knight') ? 1.5 : 1);
// タイムキーパー: サブCDのΔ ×0.7。
export const skillCooldownMult = (player: Player): number => (hasSkill(player, 'time-keeper') ? 0.7 : 1);
// エクスプローダー: 全爆発の半径/ダメージ ×1.2。賢者の石はハリケーン等に別途+20%。
export const skillExplosionMult = (player: Player): number => (hasSkill(player, 'exploder') ? 1.2 : 1);
// 弁慶: バフ中(benkeiBuffUntil > gameTime)は crit率 +0.10。
export const skillBenkeiCritBonus = (player: Player, gameTime: number): number =>
  hasSkill(player, 'benkei') && gameTime < player.benkeiBuffUntil ? 0.10 : 0;
// 近接コンボ倍率(ナイフマスター × コンボマスター)。3つの近接ダメージ地点とカウンター斬撃で共通使用。
//  ・knife-master: 近接ヒットで knifeComboCount を貯め、+1%/2hit(上限+20%)。窓3秒。
//  ・combo-master: フィニッシュコンボ(meleeFinishComboCount)生存中、+2%/combo(上限+50%)。
// どちらも非装備なら ×1。窓の有効判定は呼び出し側の gameTime に依存。
export const skillMeleeComboMult = (player: Player, gameTime: number, finishComboCount: number, finishComboUntil: number): number => {
  let mult = 1;
  if (hasSkill(player, 'knife-master') && gameTime < player.knifeComboUntil) {
    mult *= 1 + Math.min(0.20, Math.floor(player.knifeComboCount / 2) * 0.01);
  }
  mult *= skillComboMasterMult(player, gameTime, finishComboCount, finishComboUntil);
  return mult;
};
// combo-master のダメージ倍率のみ(全攻撃=近接/銃に適用)。フィニッシュコンボ生存中 +2%/combo(上限+50%)。
// ※ knife-master は近接専用なので含めない。銃ヒット処理は本関数だけを使う。
export const skillComboMasterMult = (player: Player, gameTime: number, finishComboCount: number, finishComboUntil: number): number =>
  hasSkill(player, 'combo-master') && finishComboUntil >= gameTime
    ? 1 + Math.min(0.50, finishComboCount * 0.02)
    : 1;
// combo-master: フィニッシュコンボ窓を +1s 延長(装備時)。
export const skillFinishComboWindowBonus = (player: Player): number =>
  hasSkill(player, 'combo-master') ? 1000 : 0;
// 賢者の石: 鞭ハリケーンの半径/ダメージ +20%。
export const sageStoneHurricaneMult = (player: Player): number => (hasSageStone(player) ? 1.2 : 1);
// ナイフマスター: 近接ヒットでコンボを加算(窓3秒)。非ヒット/非装備時は据え置き。
// 窓切れ後の最初のヒットは 1 にリセット。
export const computeKnifeCombo = (
  player: Player,
  gameTime: number,
  hitLanded: boolean,
): { count: number; until: number } => {
  if (!hasSkill(player, 'knife-master') || !hitLanded) {
    return { count: player.knifeComboCount, until: player.knifeComboUntil };
  }
  const alive = gameTime < player.knifeComboUntil;
  return { count: alive ? player.knifeComboCount + 1 : 1, until: gameTime + 3000 };
};
// スナイパー: 銃ダメージ ×(1 + 停止敵0.5 + 距離補正最大0.5)。refDist=狙撃最大射程(要調整)。
// その85%地点で距離補正が+0.5上限に到達。射程自体は不変(ダメージのみ)。
export const SNIPER_REF_DIST = 480;
export const sniperGunMult = (
  player: Player,
  enemy?: { x: number; y: number; width: number; height: number; vx?: number; vy?: number },
): number => {
  if (!hasSkill(player, 'sniper') || !enemy) return 1;
  const stopped = Math.hypot(enemy.vx ?? 0, enemy.vy ?? 0) < 4; // 停止中(ほぼ静止)
  const pcx = player.x + player.width / 2;
  const pcy = player.y + player.height / 2;
  const ecx = enemy.x + enemy.width / 2;
  const ecy = enemy.y + enemy.height / 2;
  const dist = Math.hypot(ecx - pcx, ecy - pcy);
  const distBonus = Math.min(0.5, (dist / (SNIPER_REF_DIST * 0.85)) * 0.5);
  return 1 + (stopped ? 0.5 : 0) + distBonus;
};

// Hitstop: 全停止(timeScale=0)で衝撃を出す瞬間ストップ。全インパクト共通0.1秒(社長指示)。
// この後は必ずスロー(triggerTimeSlow)で等速へ戻す。
export const HITSTOP_MS = 100;
// 近接フィニッシュ: ストップ→スロー。社長指示で倍に(700→1400)。
const MELEE_FINISH_SLOW_MS = 1400;
const MIN_TIME_SLOW_SCALE = 0.18;
const MAX_TIME_SLOW_SCALE = 1;
// Screen-shake duration when the player takes damage.
export const SHAKE_MS = 280;
export const SHAKE_MAG = 16;                 // 既定/通常時の揺れ幅(px)。社長指示で倍化(8→16)。
// 行動別の画面シェイク(視覚のみ・ゲーム性に影響なし)。mag=振幅px / ms=長さ。短く強い「パンチ」も出せる。
// ウザくならない範囲で、近接スイング<シールドバッシュ<ハリケーン<死神召喚 の順で強める。
export const MELEE_SWING_SHAKE_MS = 110;     // 近接スイング(控えめ)
export const MELEE_SWING_SHAKE_MAG = 7;      // 社長指示で倍化(3.5→7)
export const SHIELD_BASH_SHAKE_MS = 160;
export const SHIELD_BASH_SHAKE_MAG = 10;     // 社長指示で倍化(5→10)
export const HURRICANE_SHAKE_MS = 220;
export const HURRICANE_SHAKE_MAG = 11;       // 社長指示で倍化(5.5→11)
export const REAPER_SUMMON_SHAKE_MS = 340;
export const REAPER_SUMMON_SHAKE_MAG = 16;   // 死神召喚=強め。社長指示で倍化(8→16)
export const INTRO_LAND_SHAKE_MS = 240;
export const INTRO_LAND_SHAKE_MAG = 15;      // 社長指示で倍化(7.5→15)
// カウンター成立: スローを廃止しヒットストップ+短い揺れに(社長指示)。
export const COUNTER_HITSTOP_MS = HITSTOP_MS;  // 50〜80ms の瞬間ストップ(スロー無し)
export const COUNTER_SHAKE_MS = 100;           // 80〜120ms
export const COUNTER_SHAKE_MAG = 8;            // 社長指示で倍化(4→8)
// 四神技(ダンス)発動の揺れ。リズムを乱さぬよう描画のみ(stop/slow は入れない)。
export const SHIJIN_TECH_SHAKE_MS = 160;
export const SHIJIN_TECH_SHAKE_MAG = 10;     // 社長指示で倍化(5→10)
// 近接フィニッシュ: ストップ後に出す揺れ(揺れ+スローを HITSTOP_MS 後にまとめて出す)。
export const MELEE_FINISH_SHAKE_MS = 180;
export const MELEE_FINISH_SHAKE_MAG = 14;
// --- 追尾カメラ(描画のみ) -------------------------------------------------
// 描画用カメラだけをプレイヤーへ追従させる(判定/スポーン/プロップ生成は実プレイヤー座標のまま=ゲーム性に影響なし)。
// 「一旦最大値で実装」。各値は ?キー=数値 で実機調整可。
const camNum = (key: string, def: number): number => {
  if (typeof window === 'undefined') return def;
  const v = new URLSearchParams(window.location.search).get(key);
  const n = v != null ? Number(v) : NaN;
  return Number.isFinite(n) ? n : def;
};
export const CAMERA_FOLLOW_TAU = camNum('camtau', 0.16);          // 追従遅延(秒)。わずかな重さ。範囲0.08〜0.16
export const CAMERA_DANGER_TAU = camNum('camdanger', 0.08);       // 危険時(接近戦)の追従遅延(秒)。安定。範囲0.04〜0.08
export const CAMERA_RETURN_TAU = camNum('camret', 0.20);          // 停止時に先読みオフセットを戻す時定数(秒)。ピタ止まり回避。範囲0.12〜0.20
export const CAMERA_LOOKAHEAD_MAX = camNum('camlook', 40);        // 進行方向への最大オフセット(px)。進行方向に余白。範囲24〜40
export const CAMERA_CENTER_CLAMP_FRAC = camNum('camclamp', 0.07); // 強制中心復帰距離(画面幅比)。見失い防止。範囲0.05〜0.07
export const CAMERA_DANGER_RADIUS = 150;                          // この距離内に敵が居たら「危険時」とみなす(px)
export const CAMERA_SNAP_DIST = 600;                             // これ以上離れたら即スナップ(開始/復帰/瞬間移動対策)
// 手を離して待機している間だけ少しズーム(描画のみ)。正=寄る / 負=引く。操作再開で1.0へ戻る。
export const CAMERA_IDLE_ZOOM_MAG = camNum('camidle', 0.05);      // 待機ズーム量(+5%)。?camidle で調整(負で引き)
export const CAMERA_IDLE_ZOOM_TAU = camNum('camidletau', 0.3);    // 待機ズームの寄り/戻りの時定数(秒)
export const CAMERA_MOVE_ZOOM_MAG = camNum('cammove', 0);         // 移動中だけのズーム量(負=引き)。社長指示で無効化(引きやめる)。?cammove で調整
export const CAMERA_MOVE_ZOOM_TAU = camNum('cammovetau', 1.5);    // 引きが広がる時定数(秒)。慣性でじわっと。戻りは CAMERA_IDLE_ZOOM_TAU を使用
// 登場(ヘリ)演出のカメラ: 高いヘリを画面へ収めるため引きから開始し、キャラの降下に同期して既定へ戻す。
export const CAMERA_INTRO_ZOOM_MAG = camNum('camintro', 1.0);     // 登場ヘリ搭乗シーンの寄り(正=寄り/めっちゃズーム)。社長指示でもう少し寄りスタート。降下で既定へ。?camintro
export const CAMERA_INTRO_LIFT_FRAC = camNum('camintrolift', 0.7); // 登場中、カメラをヘリ高度へ寄せる割合(0=従来の着地面固定 / 1=被写体を中央)。?camintrolift
// 近接フィニッシュの軽いパンチズーム(視覚のみ。プレイヤー=画面中央を中心に少し寄る)。
export const MELEE_FINISH_ZOOM_MS = 320;   // ズーム演出の長さ(終わりへ向けて 1.0 に戻る)
// 衝撃時の寄りパンチズーム。社長指示で 0.3。
export const MELEE_FINISH_ZOOM_MAG = 0.3;  // 近接フィニッシュの寄り(+30%)
export const COUNTER_ZOOM_MAG = 0.3;       // カウンター成立の寄り
// Inertia time constants (s). Velocity eases toward its target over this
// window. The player is now instant (0 = no inertia, snappy control); enemies
// keep 0.3s so they curve into turns instead of snapping.
export const PLAYER_INERTIA_TAU = 0;
export const ENEMY_INERTIA_TAU = 0.3;
// 照準サークル(=PHILL弾/アンカーの狙い)の慣性。向き/距離の変化に少し遅れて追従(秒)。
// 値を上げるほどサークルがゆっくり動く(社長指示でさらにゆっくりに 0.10→0.20)。
export const AIM_INERTIA_TAU = 0.28; // 照準サークルの追従(大きいほど遅い)。気持ち速く(0.34→0.28)

// 特殊AI(犬型=突進 / パンプキン=ジャンプ)の調整値。射程基準=ハンドガン射程176px(RANGE_BY_CATEGORY.handgun)。
const HANDGUN_RANGE_REF = 176;
// 犬型(werewolf): ハンドガン射程より少し外で減速→2倍速で突進。
export const WEREWOLF_TRIGGER_RANGE = HANDGUN_RANGE_REF + 70; // 「少し外」
export const WEREWOLF_WINDUP_MS = 600;    // 減速(溜め)の長さ
export const WEREWOLF_CHARGE_SPEED_MULT = 3;   // 通常の3倍速(赤ライン予告→直線突進。社長指示で2→3)
export const WEREWOLF_CHARGE_MAX_MS = 2800; // 突進の最大時間(到達できなくても打ち切り)。距離2倍化に合わせ延長。
export const WEREWOLF_COOLDOWN_MS = 1200;  // 突進後、次の溜めまでの猶予
// ジャイアントバットの行動パターン別クールダウン(ランダム揺らぎ±20%)。弾=fire profile側(約3秒)。
export const GIANTBAT_JUMP_CD_MS = 5000;
export const GIANTBAT_DASH_CD_MS = 7000;
// パンプキン(pumpkin): ハンドガン射程より少し外で縮みながら3秒溜め→1秒でジャンプ着地→1秒停止+揺れ。
export const PUMPKIN_TRIGGER_RANGE = HANDGUN_RANGE_REF + 70;
export const PUMPKIN_CROUCH_MS = 3000;     // 縮み溜め
export const PUMPKIN_JUMP_MS = 1000;       // ジャンプ(着地まで)
export const PUMPKIN_RECOVER_MS = 1000;    // 着地後の停止
export const PUMPKIN_COOLDOWN_MS = 800;    // 復帰後、次の溜めまでの猶予
export const PUMPKIN_JUMP_HEIGHT = 90;     // ジャンプの見た目の高さ(px・描画のみ)
export const PUMPKIN_LAND_SHAKE_MS = 220;  // 着地時の画面揺れ
export const PUMPKIN_LAND_SHAKE_MAG = 9;
// 設置シールドでジャンプ/ダッシュを弾いた瞬間の「ぶつかった感」用シェイク(着地より軽め)。
export const SHIELD_BLOCK_SHAKE_MS = 140;
export const SHIELD_BLOCK_SHAKE_MAG = 5;
// パンプキン(/lab-zombie-3)のジャンプ攻撃は着地時に爆発攻撃。範囲は狭め(半径px)。ダメージは各敵の damage。
export const PUMPKIN_EXPLOSION_RADIUS = 54; // 爆撃範囲を少し狭く(66→54。社長指示)
// ドローンブーメラン(通常サブ・手動発動): 立ち止まり中の近接入力で進行方向へ投げる。
// 行き=貫通(近接同等)→一定距離で停止(回転+周囲パルス)→プレイヤー現在地へ戻り(貫通)→消滅。
export const DRONE_BOOM_COOLDOWN_MS = 5000;                 // 全Lv共通5秒
export const DRONE_BOOM_STOP_MS_BY_LEVEL = [0, 2000, 3000, 4000]; // 停止時間(Lv1/2/3)
export const DRONE_BOOM_DIST_BY_LEVEL = [0, 100, 118, 135]; // 飛距離(Lv1/2/3)。社長指示で従来の半分(200/236/270→)
export const DRONE_BOOM_SPEED = 480;                       // 行きの飛行速度(px/s)。社長指示で少し速く(360→480)
export const DRONE_BOOM_RETURN_SPEED = 360;               // 戻りの速度(px/s)。従来どおり
export const DRONE_BOOM_RADIUS = 50;                       // 停止中のダメージ範囲(半径)。トラップと同程度に縮小(72→50。社長指示)
export const DRONE_BOOM_PULSE_MS = 250;                    // 停止中の判定パルス間隔=同一敵への再ヒット間隔
export const DRONE_BOOM_STOP_DMG_DIV = 4;                  // 停止中の1ヒット=近接ダメージの1/4
export const DRONE_BOOM_SAFETY_MS = 12000;                 // 安全消滅(戻れない場合の保険)

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
// キャラ登場演出。2段構成:
//  フェーズA(ヘリ飛来): 超遠く・高くから小さく飛来し、降下しながら拡大して着地ダッシュの開始点へ。
//  フェーズB(ジャンプ着地): 従来のロックマン的ダッシュ着地(左から低く猛スピード→中央着地)。
// この間はゲーム進行/入力/敵スポーンを止め、カメラが追従/横断し、見た目は飛行する。
export const PLAYER_INTRO_HELI_MS = 2600;    // フェーズA(ヘリ飛来)長(少しゆっくり目)
export const PLAYER_INTRO_LAND_MS = 460;     // フェーズB(ヘリから飛び降り→着地)長。v0.25.450: 567→460(少し速く)
export const PLAYER_INTRO_MS = PLAYER_INTRO_HELI_MS + PLAYER_INTRO_LAND_MS; // 全体(=3700)
export const PLAYER_INTRO_HELI_FRAC = PLAYER_INTRO_HELI_MS / PLAYER_INTRO_MS; // A/全体の境目 t
export const PLAYER_INTRO_FLY_X = 0;        // (フェーズB)人間の飛び降り横移動。0=その場から真下に飛び降りる(社長指示)。
                                            // 横移動はすべてヘリの飛来(FAR_X)で確保し、飛び降りは前進せず垂直落下。
                                            // v0.25.411: 900→450 / v0.25.413: 450→225 / v0.25.450: 225→0(前進やめ)。
export const PLAYER_INTRO_LOW_Y = 28;       // (フェーズB)開始のわずかな高さ
export const PLAYER_INTRO_ARC_H = 110;      // (フェーズB)飛行アーチ高
export const PLAYER_INTRO_HELI_FAR_X = 4500; // (フェーズA)飛来開始の遠方X(world px。もっと左の遠くから)
export const PLAYER_INTRO_HELI_HIGH_Y = 420; // (フェーズA)飛来開始の高度(画面上方 px)。v0.25.413: 300→420(もう少し上空から)
export const PLAYER_INTRO_HELI_START_SCALE = 0.22; // (フェーズA)飛来開始の見た目縮尺(遠さの主表現)
export const PLAYER_INTRO_CAM_FOLLOW = 0.82; // (フェーズB)カメラが飛行Xに追従する割合
export const PLAYER_INTRO_HELI_CAM_FOLLOW = 0.92; // (フェーズA)カメラ追従(やや弱め=ヘリが左から飛び込んで見える)
// t:0→1 の登場オフセット(着地位置からの相対 world px)。x<0=左, y<0=上。
// カメラ(useGameLoop)と見た目(pixiScene)で同じ式を使い、ズレなく同期させる。
export const playerIntroOffset = (t: number): { x: number; y: number } => {
  const tc = Math.max(0, Math.min(1, t));
  const hf = PLAYER_INTRO_HELI_FRAC;
  if (tc < hf) {
    // フェーズA: 遠方・高所からフェーズB開始点(-FLY_X, -LOW_Y)へ接続。
    // 横は easeOut(遠くから猛スピードで来て収束)、縦は smoothstep(滑らかに降下)。
    const a = tc / hf;
    const sX = 1 - (1 - a) * (1 - a); // easeOut: 高速で飛来
    const sY = a * a * (3 - 2 * a);   // smoothstep: なめらか降下
    const startX = -PLAYER_INTRO_HELI_FAR_X;
    const startY = -PLAYER_INTRO_HELI_HIGH_Y;
    const endX = -PLAYER_INTRO_FLY_X;
    const endY = -PLAYER_INTRO_LOW_Y;
    return { x: startX + (endX - startX) * sX, y: startY + (endY - startY) * sY };
  }
  // フェーズB: 従来のジャンプ着地(b:0→1)。フェーズA終端と連続。
  const b = (tc - hf) / (1 - hf);
  const easeX = 1 - (1 - b) * (1 - b); // 横: easeOut(猛スピードで来て収束)
  const easeY = b * b;                  // 縦: easeIn(着地で落ちる)
  return {
    x: -PLAYER_INTRO_FLY_X * (1 - easeX),
    y: -PLAYER_INTRO_LOW_Y * (1 - easeY) - PLAYER_INTRO_ARC_H * Math.sin(b * Math.PI),
  };
};
// 登場の見た目縮尺: フェーズA序盤は小さく(遠い)→フェーズA終端で1。フェーズBは常に1。
export const playerIntroScale = (t: number): number => {
  const tc = Math.max(0, Math.min(1, t));
  const hf = PLAYER_INTRO_HELI_FRAC;
  if (tc >= hf) return 1;
  const a = tc / hf;
  const s = a * a * (3 - 2 * a);
  return PLAYER_INTRO_HELI_START_SCALE + (1 - PLAYER_INTRO_HELI_START_SCALE) * s;
};
// カメラ追従割合: フェーズAは強追従でヘリを画面保持→移行域で 0.82 へ滑らかにランプ(段差防止)。
export const playerIntroCamFollow = (t: number): number => {
  const tc = Math.max(0, Math.min(1, t));
  const hf = PLAYER_INTRO_HELI_FRAC;
  const w0 = hf - 0.05;
  const w1 = hf + 0.18;
  if (tc <= w0) return PLAYER_INTRO_HELI_CAM_FOLLOW;
  if (tc >= w1) return PLAYER_INTRO_CAM_FOLLOW;
  const k = (tc - w0) / (w1 - w0);
  const s = k * k * (3 - 2 * k);
  return PLAYER_INTRO_HELI_CAM_FOLLOW + (PLAYER_INTRO_CAM_FOLLOW - PLAYER_INTRO_HELI_CAM_FOLLOW) * s;
};

// 登場の高さ係数 h(t): 1=最も高い(開始/ヘリ高度) → 0=着地。見た目の縦オフセットから算出するため
// キャラの降下に自動同期する。カメラの縦寄せ(useGameLoop)とズーム(pixiScene)で共有し、ズレなく連動させる。
export const playerIntroDescent = (t: number): number => {
  const oy = playerIntroOffset(t).y; // 上=負
  return Math.max(0, Math.min(1, -oy / PLAYER_INTRO_HELI_HIGH_Y));
};

// 登場セリフ(ヘリが画面内に入った頃に時間停止して自動表示→流れ終わると開始)。
// 職業表示名(MainMenu のキャラ定義と一致)。登場セリフの話者などで使用。
export const CHARACTER_CLASS_NAMES: Record<CharacterClass, string> = {
  warrior: 'ヘビーガンナー',
  mage: 'マークスマン',
  rogue: 'ストライカー',
  necromancer: 'スカベンジャー',
};
// speaker: null=通信 / '__voice__'=生存者の声(別スタイル)。1行ずつ切替表示。
// holdMs を指定した行はその時間だけ「間」を取る(text 長さからの自動計算を上書き)。
// __radio__ 行は無発話の「間」で、IntroDialogue が実際の無線ノイズ音(playRadioStatic)を1回鳴らす。
// 会話はミッションごとに内容/有無が変わる(各ミッションの dialogue を campaign 側に持つ)。実行時の行は
// ストアの introDialogueLines(ゲーム開始時に選択ミッションから設定。フリーミッションは空=会話なし)。
export const INTRO_DIALOGUE_CHAR_MS = 55;        // 1文字の表示間隔(オートタイプ速度)
export const INTRO_DIALOGUE_LINE_HOLD_MS = 950;  // 各行を打ち終えた後の保持(+0.2s 延長)
export const INTRO_DIALOGUE_END_HOLD_MS = 550;   // 最終行後の保持(この後ゲーム開始)
// 会話全体の所要時間(useGameLoop が終了判定に使用)。行配列から算出。空なら 0。
export const introDialogueTotalMs = (lines: IntroLine[]): number =>
  lines.length === 0 ? 0 : lines.reduce(
    (sum, l) => sum + (l.holdMs ?? (l.text.length * INTRO_DIALOGUE_CHAR_MS + INTRO_DIALOGUE_LINE_HOLD_MS)),
    0
  ) + INTRO_DIALOGUE_END_HOLD_MS;
// セリフを出す登場進行 t。ヘリが低ホバーまで降りてきた頃(フェーズA内 a≈0.82。降下0.5〜飛び降り0.85の終盤)。
export const INTRO_DIALOGUE_TRIGGER_T = PLAYER_INTRO_HELI_FRAC * 0.82;

// ゲーム内時間が停止している(= 会話/登場演出中)か。停止中は攻撃入力(タップ近接/刀ダッシュ/カウンター)を
// 受け付けない。登場演出中はループ自体が早期 return で停止するが、タップ近接は入力ハンドラから直接 store を
// 叩くためループ停止をバイパスしてしまう。その抑止に使う。今後の通常会話もここに足せば一括で止まる。
export const isGameTimeStopped = (): boolean => {
  const s = useGameStore.getState();
  return s.introDialogueActive || (s.introUntil > 0 && Date.now() < s.introUntil);
};

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
  elite: 0.02,
  danger: 0.02,
} as const; // 一律2%/撃破(社長指示)。通常ランクは0(treasureDropChance)。
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
// 価値の重み付き抽選(社長指示)。[価値, 重み] の配列から1つ引く。
const weightedTreasureValue = (entries: [number, number][]): number => {
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [v, w] of entries) { if ((r -= w) < 0) return v; }
  return entries[entries.length - 1][0];
};
const treasureValueForRank = (rank?: DifficultyRank): number => {
  if (rank === 'danger') return weightedTreasureValue([[3, 40], [4, 30], [5, 20], [6, 10]]);
  if (rank === 'elite') return weightedTreasureValue([[1, 30], [2, 40], [3, 20], [4, 10]]);
  if (rank === 'strong') return weightedTreasureValue([[1, 60], [2, 30], [3, 10]]);
  return weightedTreasureValue([[1, 60], [2, 30], [3, 10]]); // 既定(=strong相当)
};
const treasureVariantForValue = (value: number): number =>
  TREASURE_VARIANTS_BY_RARITY[Math.max(0, Math.min(TREASURE_VARIANTS_BY_RARITY.length - 1, value - 1))];
// 研究所(屋内)の武器庫(weapon-crate)はトレジャー+スクラップのみ(武器は出さない)。
// 1回限りのロック部屋報酬なので価値はやや高め(=スコア treasureValue*10000)。
const LAB_CRATE_TREASURE_VALUE = 3;
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
    case 'murasame': return '小烏丸'; // 表示名のみ小烏丸へ(内部キー murasame・性能/解放は据え置き)
    case 'decoy': return 'デコイ';
    case 'shield': return 'シールド';
    case 'whip': return '鞭';
    case 'alchemy': return '錬金術';
    case 'turret': return '自動タレット';
    case 'shijin': return 'ダンスフロア';
    case 'fire-knife': return '発火ナイフ';
    case 'drone-boomerang': return 'ドローンブーメラン';
    case 'wire-anchor': return 'ワイヤーアンカー';
    case 'sage-stone': return '賢者の石';
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
  suppressKillCallout = false,
  ammoChanceOverride?: number
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
    // 弾薬ドロップ率アップ(パッシブ): 既定ドロップ率に ammoDropBonus を加算(0..1)。
    const baseRate = Math.max(0, Math.min(1, get().meleeAmmoDropPercent / 100 + (player.ammoDropBonus ?? 0) + (player.equipBonus?.ammoDropBonus ?? 0)));
    const ammoChance = ammoChanceOverride !== undefined
      ? ammoChanceOverride
      : (finisher ? Math.min(1, baseRate * 1.5) : baseRate);
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

// スキル: リーパー(super) = 近接フィニッシュを決めた瞬間、その近接攻撃範囲(プレイヤー中心の
// 同じスイング範囲)内の敵全員にもフィニッシュ(即死)を波及。ボスは即死せず、近接フィニッシュ
// 相当ダメージ(スタン中ボスへの近接と同じ ×BOSS_MELEE_STUN_MULT)。reaper型(特殊敵)は対象外。
// finisherOccurred=このスイングで finisher:true が1体でも出たか。範囲内のみで有界。
const applyMeleeFinishSkillSpread = (
  get: () => GameState,
  player: Player,
  finisherOccurred: boolean,
  pcx: number,
  pcy: number,
  range: number,
  baseMeleeDamage: number,
) => {
  if (!hasSkill(player, 'reaper') || !finisherOccurred) return;
  const r2 = range * range;
  for (const e of get().enemies) {
    if (e.type === 'reaper') continue; // 深奥チェイサー等の特殊敵は対象外
    const ecx = e.x + e.width / 2;
    const ecy = e.y + e.height / 2;
    if ((ecx - pcx) ** 2 + (ecy - pcy) ** 2 > r2) continue;
    get().spawnSlash(ecx, ecy, 'rgba(168,85,247,0.95)');
    if (isBossType(e.type)) {
      // ボスは即死しない=近接フィニッシュ相当ダメージ(×5)。
      const dmg = Math.max(1, Math.round(baseMeleeDamage * BOSS_MELEE_STUN_MULT));
      get().damageEnemy(e.id, dmg);
      get().spawnDamageNumber(ecx, e.y, dmg, true);
      get().spawnBurst(ecx, ecy, '#a855f7', 10);
    } else {
      const killed = get().damageEnemy(e.id, e.health + 1); // 即死(フィニッシュ波及)
      if (killed) {
        get().spawnBurst(ecx, ecy, '#a855f7', 14);
        get().addPickup({ id: `pickup-xp-reaper-${e.id}`, x: ecx - 8, y: ecy - 8, type: 'experience', value: e.experienceValue });
      }
    }
  }
};

// スキル: カウンターマスター = カウンター成立スイングで、プレイヤー近傍(~MELEE_RADIUS*1.5)の敵を
// 2× KNOCKBACK_SPEED で弾く。近傍だけ走査(有界)。
const counterMasterKnockback = (get: () => GameState, pcx: number, pcy: number) => {
  const reach = MELEE_RADIUS * 1.5;
  const reach2 = reach * reach;
  for (const e of get().enemies) {
    if (e.type === 'reaper') continue;
    const ecx = e.x + e.width / 2;
    const ecy = e.y + e.height / 2;
    const dx = ecx - pcx;
    const dy = ecy - pcy;
    const d2 = dx * dx + dy * dy;
    if (d2 > reach2) continue;
    const dist = Math.max(0.001, Math.sqrt(d2));
    // KNOCKBACK_SPEED の 2倍相当。knockbackEnemy は BULLET_KNOCKBACK_SPEED 基準なので比率換算。
    const mult = (KNOCKBACK_SPEED * 2) / BULLET_KNOCKBACK_SPEED;
    get().knockbackEnemy(e.id, dx / dist, dy / dist, mult, mult);
  }
};

// スキル: スラッシャー = 「近接攻撃が成功した後のタップ追撃」(0.3倍)。
// 自動では出ない。専用クールダウンも持たず、近接(カウンター)のCDサイクルに自然に縛られる:
//   カウンターが命中すると arm(slasherWindowUntil=CD明け時刻)→ CD中にタップすると1回だけ
//   0.3倍スラッシュを出して消費する(1回の成功カウンターにつき追撃1回)。
// プレイヤー近傍(meleeRange)の敵へ。FX/ダメージとも有界(敵1走査1パス)。
const applySlasherTapStrike = (
  get: () => GameState,
  player: Player,
  gameTime: number,
): CounterTriggerResult => {
  const pcx = player.x + player.width / 2;
  const pcy = player.y + player.height / 2;
  const meleeRange = huntingMeleeRadius(player);
  const melee = player.weapons.find(w => w.isMelee);
  const meleeDamage = (melee?.damage ?? 6) * strikerMeleeMult(player) * (player.equipBonus?.damageMult ?? 1); // キャラ固有: ストライカー弾切れ時×1.5 / 装備ダメージ倍率
  const comboMult = skillMeleeComboMult(player, gameTime, get().meleeFinishComboCount, get().meleeFinishComboUntil);
  const followDmg = meleeDamage * 0.3 * skillOutgoingDamageMult(player) * comboMult;
  const r2 = meleeRange * meleeRange;
  let killed = 0;
  let hit = false;
  for (const e of get().enemies) {
    if (e.type === 'reaper') continue;
    const ecx = e.x + e.width / 2;
    const ecy = e.y + e.height / 2;
    if ((ecx - pcx) ** 2 + (ecy - pcy) ** 2 > r2) continue;
    hit = true;
    const k = get().damageEnemy(e.id, followDmg);
    get().spawnDamageNumber(ecx, e.y, Math.round(followDmg), false);
    get().spawnSlash(ecx, ecy, 'rgba(190,242,100,0.9)');
    if (k) { killed += 1; get().spawnBurst(ecx, ecy, '#bef264', 10); }
  }
  if (!hit) get().spawnSlash(pcx, pcy, 'rgba(190,242,100,0.55)'); // 空振りでも軽く振る
  get().setSlasherWindow(0); // 消費(1成功カウンターにつき追撃1回)
  return { swung: true, hit, finish: false, killed };
};

// 排他スキルのグループ(同グループ内は共存OK。例: 刀↔村雨)。それ以外のスキルとは共存不可。
const EXCLUSIVE_SUBWEAPON_GROUPS: SubWeaponKey[][] = [['katana', 'murasame'], ['shijin'], ['alchemy', 'sage-stone']];

const applySubWeaponCard = (player: Player, key: SubWeaponKey, cardLevel?: number): Player => {
  const known = player.subWeapons.includes(key);
  const currentLevel = player.subWeaponLevels[key] ?? 0;
  const nextLevel = Math.min(3, Math.max(currentLevel + 1, cardLevel || 1));
  let subWeapons = known ? player.subWeapons : [...player.subWeapons, key];
  let subWeaponLevels: Partial<Record<SubWeaponKey, number>> = {
    ...player.subWeaponLevels,
    [key]: nextLevel
  };
  // 共存不可スキル(刀/村雨/ダンスフロア)を取得したら、同グループ以外の取得済みスキルをリセット(除去)。
  const group = EXCLUSIVE_SUBWEAPON_GROUPS.find(g => g.includes(key));
  if (group) {
    subWeapons = subWeapons.filter(k => group.includes(k));
    const cleaned: Partial<Record<SubWeaponKey, number>> = {};
    for (const k of subWeapons) cleaned[k] = subWeaponLevels[k];
    subWeaponLevels = cleaned;
  }
  return { ...player, subWeapons, subWeaponLevels };
};

interface GameState {
  player: Player;
  enemies: Enemy[];
  // パンプキン着地爆発の発生イベント(その frame の着地点)。useGameLoop が消化(被弾判定+FX)して空に戻す。
  pumpkinBlasts: { x: number; y: number; radius: number; damage: number; enemyId: string }[];
  // ジャンプ/ダッシュが設置シールドに防がれた瞬間(その frame の接触点)。useGameLoop が消化(衝突FX+SE)して空に戻す。
  shieldBlocks: { x: number; y: number; kind: 'jump' | 'dash' }[];
  boomerangReadyFxAt: number; // ドローンブーメランのCD明け演出(頭上マーク)の発火時刻(Date.now)
  // マークスマン(mage)の射程上昇が発動した瞬間の頭上マーク演出。fxAt=発火時刻(Date.now)、
  // fxShownFor=その演出を出した連続移動streak(=marksmanMovingSince)。streakごとに一度だけ出す。
  marksmanRangeFxAt: number;
  marksmanRangeFxShownFor: number;
  rescueShooterFxAt: number;  // 救助NPC(shooter)が発砲した時刻(Date.now)。サークル接近時のハンドガンSE用。
  // イベント発生告知バナー(コンボ表示の近く)。gameTime(ms)基準。HUDが gameTime<eventBannerUntil の間表示。
  eventBannerText: string;
  eventBannerUntil: number;
  bashHitFxAt: number;        // 盾バッシュが敵に当たった時刻(Date.now)。SE再生のトリガ
  whipHitFxAt: number;        // 鞭が敵に当たった時刻(Date.now)。SE再生のトリガ
  whipSwingFxAt: number;      // 鞭を振った時刻(Date.now)。振る音SEのトリガ
  anchorPlantFxAt: number;    // ワイヤーアンカーを(地面に)打ち込んだ時刻(Date.now)。打ち込み音SEのトリガ
  anchorEnemyHitFxAt: number; // ワイヤーアンカーが敵に当たった時刻(Date.now)。近接命中音SEのトリガ
  boomerangThrowFxAt: number; // ドローンブーメランを投げた時刻(Date.now)。投擲音SEのトリガ
  summonFxAt: number;         // 錬金術で召喚した時刻(Date.now)。召喚音SEのトリガ
  projectiles: Projectile[];
  pickups: Pickup[];
  breakableProps: BreakableProp[];
  destroyedBreakableProps: Record<string, true>;
  mineAmbushAnchor: MineAmbushAnchor | null;
  castleEvent: CastleEvent;
  // 囲い系イベント(小イベント=アリーナ/ミニボス)。非nullの間だけプレイヤーを円内に拘束。
  activeEvent: ActiveEvent | null;
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
  // 商人「帰還」で任意撤収したフラグ(Game.tsx が監視→onReturn)。スコア計上・クリアボーナス/進行なし・装備は持ち帰り。
  gameReturned: boolean;
  // Start-screen setting: melee-kill ammo drop rate (percent).
  meleeAmmoDropPercent: number;
  // Debug setting: ammo granted by one ammo-box pickup per weapon family.
  ammoPickupAmounts: Record<AmmoType, number>;
  unlockedShopSkillCards: Partial<Record<SubWeaponKey, number>>;
  startWithTestStraps: boolean;
  showStatsOverlay: boolean; // 撃破/DMG/SCRAP + FPS/負荷オーバーレイの表示(TOPで選択。既定OFF)
  introUntil: number; // キャラ登場演出の終了時刻(Date.now基準)。-1=未確定(初フレームで確定)、0=演出なし
  introDialogueActive: boolean;  // 登場セリフ表示中(時間停止)
  introDialogueStartedAt: number; // セリフ開始時刻(Date.now。オートタイプ基準)
  introDialogueShown: boolean;   // この登場で既にセリフを出したか(再トリガー防止)
  introDialogueLines: IntroLine[]; // この出撃の会話(選択ミッションから設定。空=会話なし=フリーミッション等)
  // 死神の横切り演出(無害・pixiScene が画面横断で描画)。null=非表示。
  // axis: 'h'=横断(上下の帯)/'v'=縦断(左右の側)。band=軸に直交する固定位置(画面比)。dir=進む向き。scale=奥行き(小=奥)。
  reaperCross: { startedAt: number; durationMs: number; axis: 'h' | 'v'; band: number; dir: number; scale: number } | null;
  danceTestMode: boolean; // 仮: 敵なし+ダンスフロアを所持で開始(練習用)
  danceTestLevel: number; // 仮ダンスモードで開始する四神舞レベル(1-3)
  danceTestInterval: number; // 練習モードのサークル間隔(ms/拍)。0=レベル既定。入力欄で調整しサークルへ連携。
  danceTestAutoTap: boolean;  // 練習モード: JUSTタイミングで自動タップ(ドラムを拍に乗せてズレ確認)
  danceForceJust: boolean;    // テスト: タップを常にJUST判定にする(計測時の紛らわしさ回避)
  meleeFinishComboCount: number;
  meleeFinishComboUntil: number;
  rhythm: RhythmState;
  upgradeOptions: UpgradeOption[];
  inputState: InputState;
  swipeDirection: { x: number; y: number } | null;
  // スティックの傾き強度(0..1)。離しても直前値を保持(lastDirection と同様)。
  // 既定 1 = 最大(キーボードや未操作はフル速度・最大距離)。
  swipeStrength: number;
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
  lastWeaponGet: { name: string; at: number; color?: string; kind?: 'weapon' | 'treasure' | 'data'; weaponKey?: string } | null;
  // Global hitstop: while Date.now() < hitstopUntil the simulation is frozen
  // (melee-finisher impact pause). 0 = running.
  hitstopUntil: number;
  // Strong-event slow motion. Rendering/audio continue; simulation delta is
  // multiplied by timeSlowScale until this timestamp.
  timeSlowUntil: number;
  timeSlowScale: number;
  timeSlowStart: number; // スロー開始時刻。倍率を滑らかに 1.0 へ戻す(ランプ)ために使う。
  // Screen shake: jitter the canvas while Date.now() < shakeUntil (set on hit).
  // shakeMag=振幅px / shakeDur=フェード基準の長さ(ms)。triggerShake で行動別に設定。
  shakeUntil: number;
  shakeMag: number;
  shakeDur: number;
  // Punch-zoom (render-only): while Date.now() < zoomUntil, the renderer scales the
  // world by zoomMag around screen center. Triggered on melee finish. No gameplay effect.
  zoomUntil: number;
  zoomMag: number;
  // Whip hurricane: a fixed suction point at the whip tip. While active, nearby
  // enemies are pulled toward (rootX,rootY) each tick. null when inactive.
  hurricane: {
    rootX: number; rootY: number; endsAt: number; radius: number; level: number; lastTickAt: number; lastDamageAt: number;
  } | null;
  // 錬金術で召喚した味方ユニット。enemies とは別配列(副作用回避)。
  summons: Summon[];
  // 救助ホールドイベントの守る対象NPC(逃げ惑う3人)。alchemy summons とは別系統。
  rescueSurvivors: RescueSurvivor[];

  // Player actions
  movePlayer: (input: InputState, deltaTime: number) => void;
  setSwipeDirection: (direction: { x: number; y: number } | null, strength?: number) => void;
  setTouchActive: (active: boolean) => void;
  setLastDirection: (direction: { x: number; y: number } | null) => void;
  damagePlayer: (amount: number, source?: string) => boolean;
  lastDamageSource: string; // 直近に被弾した原因ラベル(死因表示用)。被弾のたびに更新。
  gainExperience: (amount: number) => void;
  levelUp: () => void;
  triggerCounter: () => CounterTriggerResult;
  // Katana actions. performKatanaStrike cuts the given enemies with katana
  // melee rules (crit, knockback, shared kill rewards). 近接フィニッシュは
  // 一閃のみ: allowFinisher は dash 経由でだけ true になる。
  // triggerKatanaDash starts the invulnerable dash and cuts along its path.
  performKatanaStrike: (targetIds: string[], damageMult: number, allowFinisher: boolean) => { hit: boolean; finish: boolean; killed: number };
  triggerKatanaDash: (dirX: number, dirY: number) => boolean;
  // Whip (鞭) actions. performWhipStrike sweeps the given enemies with whip rules
  // (low damage, big knockback, crit, finisher, 20% ammo) and returns the hit
  // count for charge. performHurricane spawns the suction vortex at the tip;
  // tickHurricane pulls nearby enemies toward the root each frame.
  performWhipStrike: (targetIds: string[]) => { hit: boolean; finish: boolean; killed: number; hits: number };
  performHurricane: (rootX: number, rootY: number) => void;
  tickHurricane: () => void;
  // 錬金術 actions. updateAlchemyChannel は立ち止まりチャネルの開始/維持/中断、summonAlchemy は
  // 魔法陣完成時の召喚(レア判定・FIFO)、updateSummons は毎フレームの追従/攻撃/吸引/消滅、
  // damageSummon は敵接触ダメージ。
  updateAlchemyChannel: (startedAt: number) => void;
  summonAlchemy: () => void;
  updateSummons: (deltaTime: number) => void;
  damageSummon: (id: string, amount: number) => void;

  // Weapon actions
  fireWeapons: (currentTime: number) => void;
  firePhillShot: () => void; // PHILL銃: 指離しで狙いサークル方向へ1発(手動)。
  selectUpgrade: (upgrade: UpgradeOption) => void;
  learnSubWeapon: (key: SubWeaponKey) => void;
  setSubWeaponCooldown: (key: SubWeaponKey, readyAt: number) => void;
  updateHuntingCharge: (startedAt: number, charged: boolean) => void;
  buyShopItem: (key: ShopItemKey, ammoType?: AmmoType) => boolean;
  buySkillCardFromShop: (key: SubWeaponKey) => boolean;
  openShop: () => void;
  closeShop: () => void;
  returnToBase: () => void;                              // 商人「帰還」=任意撤収(スコア計上・進行なし・装備持ち帰り)
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
  knockbackEnemy: (id: string, dirX: number, dirY: number, multiplier?: number, maxStrength?: number) => void;
  openCounterWindow: () => void;
  setSlasherWindow: (until: number) => void;
  markCastleBossSpawned: () => void;
  // 囲い系イベント: 開始(activeEvent をセット＋囲い周辺の通常敵を一掃)/ 終了(activeEvent=null＋残存イベント敵を撤去)。
  beginArenaEvent: (event: ActiveEvent) => void;
  endArenaEvent: () => void;
  // 救助ホールドイベント: 開始(survivor3人を配置＋activeEvent rescue をセット)/ 毎フレーム更新(NPCカイト・
  // ホールドゲージ・攻撃者補充・勝敗/報酬)/ 敵接触ダメージ。
  beginRescueEvent: (event: ActiveEvent) => void;
  updateRescue: (deltaTime: number) => void;
  damageRescueSurvivor: (id: string, amount: number) => void;
  // キャラ固有スキル ヘビーガンナー: 1回の攻撃が2体以上に当たった通知(warriorのみ爆発範囲バフ)。
  registerMultiHit: (count: number) => void;

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
  stickFireKnife: (id: string, enemyId: string, x: number, y: number, fuseMs: number) => void; // 発火ナイフを敵に刺す(追従+遅延爆発)
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
  // 近接系武器の共通「小物破壊」: 始点(x0,y0)から向き(ux,uy)へ length までの
  // カプセル(halfWidth)に入った松明・卵を damage で壊す。length=0 なら半径 halfWidth の
  // 円(刀/ナイフ/ダンスタップ向け)。破壊演出+ドロップも内包。何か当たれば true。
  breakPropsAlong: (
    x0: number, y0: number, ux: number, uy: number,
    length: number, halfWidth: number, damage: number
  ) => boolean;
  
  // Game state actions
  setGameTime: (time: number) => void;
  setPaused: (paused: boolean) => void;
  setMeleeAmmoDropPercent: (pct: number) => void;
  setAmmoPickupAmount: (type: AmmoType, amount: number) => void;
  setUnlockedShopSkillCard: (key: SubWeaponKey, level: number) => void;
  setStartWithTestStraps: (enabled: boolean) => void;
  setShowStatsOverlay: (enabled: boolean) => void;
  stampPlayerIntro: () => void; // 登場演出の開始(初フレームで終了時刻を確定)
  startIntroDialogue: () => void; // 登場セリフ開始(時間停止)
  setIntroDialogueLines: (lines: IntroLine[]) => void; // 出撃ごとの会話を設定(選択ミッション/フリー)
  pendingLoadout: SubWeaponKey[];                       // 装備メニューで選んだサブ(出撃時に resetGame が所持へ反映・永続)
  setPendingLoadout: (keys: SubWeaponKey[]) => void;
  pendingSkills: SkillKey[];                            // 装備メニューで選んだスキル(最大2・永続)
  setPendingSkills: (keys: SkillKey[]) => void;
  ownedSkills: SkillKey[];                              // ガチャで解禁済みスキル(永続)。装備候補はここから。
  grantSkill: (key: SkillKey) => void;                  // ガチャ当選で所持解禁(重複は無視)
  goldBalance: number;                                  // 永続ゴールド残高(ガチャ通貨。in-run strap とは別)
  addGold: (amount: number) => void;                    // ラン結果のゴールドを加算(永続)
  spendGold: (amount: number) => boolean;               // ガチャ消費。足りれば true
  // 屋内(研究施設)ステージ
  indoorMode: boolean;                                  // 屋内マップ(壁/カメラクランプ/湧き抑制)有効か
  labDoors: LabDoor[];                                  // 可変ドア(解錠状態)
  labButtons: LabButton[];                              // ボタン(押下状態)
  labProps: LabProp[];                                  // 障害物プロップ(木の代わり・当たり判定あり)
  hasCardKey: boolean;                                  // カードキー取得済みか
  goalReachedAt: number;                                // ゴール到達時刻(0=未到達)。演出後に勝利
  pendingIndoor: boolean;                               // 出撃が屋内ステージか(startMission→resetGame で受け渡し)
  setPendingIndoor: (indoor: boolean) => void;
  pendingStageTheme: StageTheme;                        // 出撃ステージの見た目テーマ(resetGame で stageTheme へ)
  setPendingStageTheme: (theme: StageTheme) => void;
  stageTheme: StageTheme;                               // この出撃の見た目テーマ('lab'=研究所スキン。描画/商人が参照)
  pendingFarBackdrop: string;                           // 出撃ステージの遠景差し替えキー(resetGame で farBackdrop へ)
  setPendingFarBackdrop: (key: string) => void;
  farBackdrop: string;                                  // この出撃の遠景差し替えキー(''=既定の森遠景 / 'city'=夜の廃都。描画が参照)
  pendingNearHorizon: string;                           // 出撃ステージの遠景森2キー(resetGame で nearHorizon へ)
  setPendingNearHorizon: (key: string) => void;
  nearHorizon: string;                                  // この出撃の遠景森2キー(''=なし / 'forest' / 'city'。描画が参照)
  triggerEventVictory: () => void;                      // ボス無しのイベント勝利(gameWon=true)
  openLabDoor: (id: string) => void;                    // 指定ドアを解錠(open=true)
  setHasCardKey: (v: boolean) => void;
  pressLabButton: (id: string) => void;                 // ボタン押下→対応ドア解錠
  endIntroDialogue: () => void;   // 登場セリフ終了(ゲーム開始へ)
  setDanceTestMode: (enabled: boolean) => void;
  setDanceTestLevel: (level: number) => void;
  setDanceTestInterval: (ms: number) => void;
  setDanceTestAutoTap: (enabled: boolean) => void;
  setDanceForceJust: (enabled: boolean) => void;
  addMeleeFinishCombo: (amount?: number) => void;
  // 装備システム(裏側): 装備の着脱と持ち帰り。レベルアップ時の選択UIは別途接続する。
  // equipItem: defId の装備を該当部位へ装着(同部位は置換)。最大体力は加算ベイクし現HPも増分だけ底上げ。
  equipItem: (defId: string) => void;
  // takeHomeEquipment: 現在装備中の1点を次run へ持ち帰り(null=持ち帰らない)。商人帰還/クリア時に呼ぶ。
  takeHomeEquipment: (defId: string | null) => void;
  // 四神舞(リズム): store は状態/判定のみ。攻撃実行は useGameLoop が pending を消化して行う。
  setRhythmActive: (active: boolean, firstBeatAt?: number, interval?: number) => void;
  setRhythmFirstBeat: (firstBeatAt: number) => void; // 自動アンカー: ビートグリッド起点だけ差し替え
  rhythmInput: (kind: 'tap' | 'flick', dir?: { x: number; y: number }, contactMs?: number, opts?: { noLog?: boolean }) => { judged: 'hit' | 'miss' | 'fire' | 'none'; god?: ShijinGod; finish?: boolean };
  // テスト用: 実タップの絶対時刻(ms, Date.now)。連続タップの差分=「人間の実タップ間隔(ms)」。
  // 例: Lv1で正しく拍を刻めば差分は ~600ms になる。最新が末尾。
  danceTapLog: number[];
  tickRhythm: () => void;
  startByakko: () => void;
  advanceByakko: () => void;
  drainRhythmPending: () => RhythmPending[];
  setGameBounds: (bounds: GameBounds) => void;
  updateGameStats: (stats: Partial<GameStats>) => void;
  resetGame: (characterClass: string) => void;
  setCameraPosition: (x: number, y: number) => void;
  triggerTimeSlow: (scale: number, durationMs: number) => void;
  triggerHitstop: (durationMs: number) => void; // 全停止の瞬間ストップ(カウンター/近接フィニッシュの衝撃)
  triggerHitImpact: (stopMs: number, shakeMs: number, shakeMag: number, zoomMag: number) => void; // ストップ→(後で)揺れ+寄り。ダンス中はストップ無しで即時
  triggerFinishImpact: () => void; // 近接フィニッシュ: ストップ→(後で)揺れ+スロー+寄り
  triggerZoom: (mag: number, durationMs?: number) => void; // 近接フィニッシュ等のパンチズーム(描画のみ)
  triggerShake: (durationMs: number, mag?: number) => void; // 行動別の画面シェイク(描画のみ)

  // Visual effects (renderer-only; no gameplay impact)
  spawnEffect: (effect: VisualEffect) => void;
  spawnBurst: (x: number, y: number, color: string, count?: number) => void;
  spawnDamageNumber: (x: number, y: number, value: number, crit?: boolean) => void;
  spawnAmmoNumber: (x: number, y: number, amount: number) => void;
  spawnCallout: (x: number, y: number, text: string, color: string, opts?: { scale?: number; serif?: boolean }) => void;
  spawnImageMark: (x: number, y: number, texture: string, opts?: { scale?: number; duration?: number; color?: string }) => void;
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
    aimX: 1,
    aimY: 0,
    invulnerable: false,
    invulnerableTime: 0,
    lastDirection: null,
    counterWindowEnd: 0,
    counterCooldownEnd: 0,
    lastCounterSuccessTime: 0,
    ammoHandgun: AMMO_INITIAL.handgun,
    ammoShotgun: AMMO_INITIAL.shotgun,
    ammoRifle: AMMO_INITIAL.rifle,
    ammoPhill: AMMO_INITIAL.phill,
    critChance: 0,
    quickMagCritUntil: 0,
    reloadEndsAt: 0,
    reloadingWeaponId: '',
    magBonus: 0,
    reloadMult: 1,
    stunDurationMult: 1,
    ammoDropBonus: 0,
    scrapMult: 1,
    passiveCounts: {},
    subWeapons: [],
    subWeaponLevels: {},
    subWeaponCooldowns: {},
    skills: [],
    fireShooterCdUntil: 0, reflexCdUntil: 0, slasherWindowUntil: 0,
    scavengerBuffUntil: 0, marksmanMovingSince: 0, heavyGunnerExpBuffUntil: 0,
    phillReticleDX: 0, phillReticleDY: 0, phillSnapEnemyId: null,
    knifeComboCount: 0, knifeComboUntil: 0, benkeiBuffUntil: 0, benkeiCdUntil: 0,
    huntingChargeStartedAt: 0,
    huntingCharged: false,
    katanaDashUntil: 0,
    katanaDashDirX: 0,
    katanaDashDirY: 0,
    katanaDashCooldownEnd: 0,
    katanaRecoveryUntil: 0,
    shijinSlideUntil: 0,
    shijinSlideDirX: 0,
    shijinSlideDirY: 0,
    wireAnchorX: 0,
    wireAnchorY: 0,
    wireAnchored: false,
    wirePlantUntil: 0,
    wireDashUntil: 0,
    wireDashSpeed: 0,
    wireStuckEnemyId: '',
    wireStuckUntil: 0,
    straps: 0,
    vaccineRevives: 0,
    equipment: emptyEquipLoadout(),
    equipBonus: neutralEquipBonus()
  },
  enemies: [],
  pumpkinBlasts: [],
  shieldBlocks: [],
  boomerangReadyFxAt: 0,
  marksmanRangeFxAt: 0,
  marksmanRangeFxShownFor: 0,
  rescueShooterFxAt: 0,
  eventBannerText: '',
  eventBannerUntil: 0,
  bashHitFxAt: 0,
  whipHitFxAt: 0,
  whipSwingFxAt: 0,
  anchorPlantFxAt: 0,
  anchorEnemyHitFxAt: 0,
  boomerangThrowFxAt: 0,
  summonFxAt: 0,
  projectiles: [],
  pickups: [],
  breakableProps: [],
  destroyedBreakableProps: {},
  mineAmbushAnchor: null,
  castleEvent: createCastleEvent(),
  activeEvent: null,
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
  gameReturned: false,
  meleeAmmoDropPercent: loadMeleeDropPct(),
  ammoPickupAmounts: loadAmmoPickupAmounts(),
  unlockedShopSkillCards: {},
  pendingLoadout: loadStringArray(LOADOUT_SUBS_KEY) as SubWeaponKey[],
  pendingSkills: (loadStringArray(LOADOUT_SKILLS_KEY) as SkillKey[]).slice(0, 2),
  ownedSkills: loadStringArray(OWNED_SKILLS_KEY) as SkillKey[],
  goldBalance: loadNumber(GOLD_BALANCE_KEY, 0),
  indoorMode: false,
  labDoors: [],
  labButtons: [],
  labProps: [],
  hasCardKey: false,
  goalReachedAt: 0,
  lastDamageSource: '',
  pendingIndoor: false,
  pendingStageTheme: 'forest',
  stageTheme: 'forest',
  pendingFarBackdrop: '',
  farBackdrop: '',
  pendingNearHorizon: '',
  nearHorizon: '',
  startWithTestStraps: false,
  showStatsOverlay: false,
  introUntil: 0,
  introDialogueActive: false,
  introDialogueStartedAt: 0,
  introDialogueShown: false,
  introDialogueLines: [],
  reaperCross: null,
  danceTestMode: false,
  danceTestLevel: 1,
  danceTestInterval: 0,
  danceTestAutoTap: true,
  danceForceJust: false,
  meleeFinishComboCount: 0,
  meleeFinishComboUntil: 0,
  rhythm: initialRhythm(),
  upgradeOptions: [],
  inputState: { up: false, down: false, left: false, right: false },
  swipeDirection: null,
  swipeStrength: 1,
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
  timeSlowStart: 0,
  shakeUntil: 0,
  shakeMag: SHAKE_MAG,
  shakeDur: SHAKE_MS,
  zoomUntil: 0,
  zoomMag: 0,
  danceTapLog: [],
  hurricane: null,
  summons: [],
  rescueSurvivors: [],

  // Player actions
  movePlayer: (input, deltaTime) => {
    set(state => {
      const { player, gameBounds, swipeDirection, swipeStrength, breakableProps, castleEvent } = state;
      // UV バーは光源/装飾(松明の代わり)で当たり判定なし=移動は通す。地雷は踏むまで通す。
      const solidProps = breakableProps.filter(p => p.type !== 'mine' && p.type !== 'uv-bar');
      void gameBounds; // World is effectively infinite — no clamp.

      // Reload movement penalty is kept as a single multiplier for tuning.
      // Currently 1.0, so reloading does not slow movement.
      const reloading =
        player.reloadingWeaponId !== '' && Date.now() < player.reloadEndsAt;
      // 一閃ダッシュ中は入力を無視して固定方向へ高速移動する。
      const nowMs = Date.now();
      // ワイヤーアンカーの高速移動中は入力を無視してアンカー地点へ高速で向かう(最優先)。
      const wireDashing = nowMs < player.wireDashUntil;
      const dashing = !wireDashing && nowMs < player.katanaDashUntil;
      // 着地後の硬直中(刀・村雨共通)は移動入力を受け付けない(その場で停止)。
      const recovering = !wireDashing && !dashing && nowMs < player.katanaRecoveryUntil;
      // 四神舞フリックの盾バッシュ風スライド(入力を無視して固定方向へ短く滑る)。
      const sliding = !wireDashing && !dashing && !recovering && nowMs < player.shijinSlideUntil;
      const moveSpeed = wireDashing
        ? player.wireDashSpeed
        : dashing
        ? KATANA_DASH_DISTANCE / (KATANA_DASH_MS / 1000)
        : recovering ? 0
        : sliding ? SHIJIN_SLIDE_DISTANCE / (SHIJIN_SLIDE_MS / 1000)
        // スキル: スケーター = 通常歩行の移動速度 ×3(特殊ロコモーションは対象外。
        // 社長指示で段階的に強化: 2→3=1.5倍)。マークスマン = 3秒連続移動で ×1.2(通常歩行/リロード移動に乗る)。
        // 装備(体・機動系)の移動速度倍率は通常歩行/リロード移動に乗る(特殊ロコモーションは対象外)。中立=1。
        : reloading ? player.speed * RELOAD_MOVE_SPEED_MULT * (hasSkill(player, 'skater') ? 3 : 1) * marksmanSpeedMult(player, state.gameTime) * (player.equipBonus?.moveSpeedMult ?? 1)
        : player.speed * (hasSkill(player, 'skater') ? 3 : 1) * marksmanSpeedMult(player, state.gameTime) * (player.equipBonus?.moveSpeedMult ?? 1);

      // Target direction from swipe (touch) or keys.
      let tx = 0;
      let ty = 0;
      if (wireDashing) {
        // アンカー地点へ向かう単位ベクトル(プレイヤー中心基準)。
        const wcx = player.x + player.width / 2;
        const wcy = player.y + player.height / 2;
        tx = player.wireAnchorX - wcx;
        ty = player.wireAnchorY - wcy;
      } else if (dashing) {
        tx = player.katanaDashDirX;
        ty = player.katanaDashDirY;
      } else if (recovering) {
        tx = 0;
        ty = 0;
      } else if (sliding) {
        tx = player.shijinSlideDirX;
        ty = player.shijinSlideDirY;
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

      // タッチ歩行のみアナログ速度: スティックの傾きが弱いとゆっくり歩く。
      // キーボードと特殊ロコモーション(ダッシュ等)はフル速度(speedScale=1)。
      const speedScale =
        swipeDirection && !wireDashing && !dashing && !recovering && !sliding
          ? STICK_WALK_MIN_FACTOR + (1 - STICK_WALK_MIN_FACTOR) * Math.max(0, Math.min(1, swipeStrength))
          : 1;

      // Inertia: ease the velocity toward the target. Player tau is 0 → fully
      // instant, responsive control. スキル: スケーター = 慣性1.2sで滑る(高リスク操作。
      // 社長指示で段階的に強化: 0.4→0.6→1.2)。
      const inertiaTau = hasSkill(player, 'skater') ? 1.2 : PLAYER_INERTIA_TAU;
      const alpha = inertiaAlpha(deltaTime, inertiaTau);
      // 被弾ノックバック中は入力を無視して、減衰する弾き出し速度で滑る(ジャンプ攻撃被弾など)。
      const kbNow = Date.now();
      const kbActive = player.knockbackUntil !== undefined && kbNow < player.knockbackUntil;
      let vx: number, vy: number;
      if (kbActive) {
        const decay = Math.max(0, (player.knockbackUntil! - kbNow) / PLAYER_KNOCKBACK_MS); // 1→0
        vx = (player.knockbackVx ?? 0) * decay;
        vy = (player.knockbackVy ?? 0) * decay;
      } else {
        vx = player.vx + (tx * moveSpeed * speedScale - player.vx) * alpha;
        vy = player.vy + (ty * moveSpeed * speedScale - player.vy) * alpha;
      }

      // 壁解決。屋内は labMap の壁(+閉ドア)のみ。屋外は従来の木/トーチ/城。
      let newX: number;
      let newY: number;
      const candidate = { x: player.x + vx * deltaTime, y: player.y + vy * deltaTime, width: player.width, height: player.height };
      if (state.indoorMode) {
        const openIds = state.labDoors.filter(d => d.open).map(d => d.id);
        const r = resolveAabb(candidate, [...labBlockingWalls(openIds), ...state.labProps.map(p => p.rect)]);
        newX = r.x; newY = r.y;
      } else {
        // 研究所スキンは木/城を出さない(社長指示)=その当たり判定もスキップ。
        const labTheme = state.stageTheme === 'lab';
        // Block the player's hitbox out of tree trunks (rectangle AABB only).
        const treeResolved = labTheme ? { x: candidate.x, y: candidate.y } : resolveTreeCollision(candidate);
        const resolved = resolveTorchCollision({
          x: treeResolved.x,
          y: treeResolved.y,
          width: player.width,
          height: player.height,
        }, solidProps);
        const castleResolved = labTheme ? resolved : resolveCastleCollision({
          x: resolved.x,
          y: resolved.y,
          width: player.width,
          height: player.height,
        }, castleEvent);
        // 壁オブジェクト(研究所スキン・区画生成)を遮蔽物として解決。近傍区画のみ問い合わせ。
        let wallResolved = castleResolved;
        if (labTheme) {
          const cx = castleResolved.x, cy = castleResolved.y;
          const rgn = [cx - 120, cy - 120, cx + player.width + 120, cy + player.height + 120] as const;
          const walls = [
            ...labWallsInRegion(...rgn).map(wallRect),
            ...labPropsInRegion(...rgn).map(propRect), // パソコン/割れたカプセル等の遮蔽物
          ];
          wallResolved = resolveAabb({ x: cx, y: cy, width: player.width, height: player.height }, walls);
        }
        newX = wallResolved.x;
        newY = wallResolved.y;
      }
      // 囲い系イベント中はプレイヤーを円(囲い)の内側へ拘束(円コリジョン)。壁解決の後に最終クランプ。
      // ただし救助(rescue)イベントはプレイヤーを閉じ込めない=出入り自由(社長指示)。
      if (state.activeEvent && state.activeEvent.kind !== 'rescue') {
        const ae = state.activeEvent;
        const clamped = clampRectInsideCircle(
          { x: newX, y: newY, width: player.width, height: player.height },
          { x: ae.x, y: ae.y, radius: ae.radius },
        );
        newX = clamped.x;
        newY = clamped.y;
      }
      // 設置型シールドはプレイヤーを止めない: 触れたら進行方向へ盾を押す(邪魔しない)。
      // 押された盾は既存の毎フレーム処理(盾→敵 resolveAabb)で進行方向の敵を比例して押し出す。
      const pMoveDx = newX - player.x;
      const pMoveDy = newY - player.y;
      let pushedProjectiles: typeof state.projectiles | null = null;
      if (pMoveDx !== 0 || pMoveDy !== 0) {
        const playerRect = { x: newX, y: newY, width: player.width, height: player.height };
        for (const s of state.projectiles) {
          if (s.weaponType !== 'shield') continue;
          if (rectsOverlap(playerRect, { x: s.x, y: s.y, width: s.width, height: s.height })) {
            pushedProjectiles = (pushedProjectiles ?? state.projectiles).map(pr =>
              pr.id === s.id ? { ...pr, x: pr.x + pMoveDx, y: pr.y + pMoveDy } : pr
            );
          }
        }
      }

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

      // 照準サークルの慣性付きベクトル。向き=lastDirection、長さ=stickAimFactor(strength)。
      // PHILL弾/ワイヤーアンカー/サークル描画はすべてこの aim に揃える(進行方向ではなくサークル方向)。
      const aimMag = stickAimFactor(swipeStrength);
      const ld = lastDirection ?? { x: 1, y: 0 };
      const ldl = Math.max(0.001, Math.hypot(ld.x, ld.y));
      const aimAlpha = inertiaAlpha(deltaTime, AIM_INERTIA_TAU);
      const aimX = player.aimX + ((ld.x / ldl) * aimMag - player.aimX) * aimAlpha;
      const aimY = player.aimY + ((ld.y / ldl) * aimMag - player.aimY) * aimAlpha;

      // キャラ固有 マークスマン: 連続移動の開始時刻を追跡(停止で0=解除)。動き出した瞬間にだけ更新。
      const marksmanMovingSince = isMoving ? (player.isMoving ? player.marksmanMovingSince : state.gameTime) : 0;
      // 射程上昇(移動3s+)が発動した瞬間=この streak で初めて 3秒を超えたフレームで頭上マークを出す。
      const marksmanRangeActive = player.characterClass === 'mage' && isMoving &&
        marksmanMovingSince > 0 && state.gameTime - marksmanMovingSince >= 3000;
      const marksmanProc = marksmanRangeActive && state.marksmanRangeFxShownFor !== marksmanMovingSince;

      // PHILL銃: 狙いサークルの「吸い付き」。基準=プレイヤー中心+aim×190。近い敵の頭(SNAP半径内)が
      // あればその頭中心へスナップ。発砲(firePhillShot)と描画(pixiScene)はこの結果を共有する。
      let phillReticleDX = player.phillReticleDX;
      let phillReticleDY = player.phillReticleDY;
      let phillSnapEnemyId: string | null = null;
      if (getActiveGun(player)?.key === 'phill-revolver') {
        const rcx = newX + player.width / 2;
        const rcy = newY + player.height / 2;
        const hasAim = Math.hypot(aimX, aimY) > 0.001;
        const dirx = hasAim ? aimX : (lastDirection?.x ?? 1);
        const diry = hasAim ? aimY : (lastDirection?.y ?? 0);
        const scale = hasAim ? PHILL_AIM_RANGE : PHILL_AIM_RANGE / Math.max(0.001, Math.hypot(dirx, diry));
        const baseX = rcx + dirx * scale;
        const baseY = rcy + diry * scale;
        let bestD2 = PHILL_SNAP_RADIUS * PHILL_SNAP_RADIUS;
        let snapX = baseX, snapY = baseY;
        for (const e of state.enemies) {
          if (e.type === 'reaper') continue;
          const fb = enemyFootBox(e);
          const hx = fb.footX;
          const hy = fb.footY - fb.boxH * 0.83; // 頭部リージョン中心の目安(HEAD_FRACTION=0.33)
          const d2 = (hx - baseX) ** 2 + (hy - baseY) ** 2;
          if (d2 <= bestD2) { bestD2 = d2; snapX = hx; snapY = hy; phillSnapEnemyId = e.id; }
        }
        phillReticleDX = snapX - rcx;
        phillReticleDY = snapY - rcy;
      }
      return {
        ...(pushedProjectiles ? { projectiles: pushedProjectiles } : {}),
        ...(marksmanProc ? { marksmanRangeFxAt: Date.now(), marksmanRangeFxShownFor: marksmanMovingSince } : {}),
        player: {
          ...player,
          x: newX,
          y: newY,
          vx,
          vy,
          direction,
          isMoving,
          marksmanMovingSince,
          phillReticleDX,
          phillReticleDY,
          phillSnapEnemyId,
          lastDirection,
          aimX,
          aimY
        }
      };
    });
  },
  
  setSwipeDirection: (direction, strength) => {
    // 強度は省略時は据え置き(離した瞬間は方向 null だけ更新し、直前の強度を保持)。
    // → 1回の set() に畳み込み、毎フレームの set() 追加を避ける(CLAUDE.md)。
    set(strength != null ? { swipeDirection: direction, swipeStrength: strength } : { swipeDirection: direction });
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
      player, gameTime, enemies, projectiles, weaponMerchant,
      eventQuestNpc, showShopMenu, showEventQuestMenu, showUpgradeMenu,
      shopReopenAt, eventQuestReopenAt, indoorMode, labDoors
    } = get();
    // Respect cooldown — no swing, no knockback, no window.
    if (now < player.counterCooldownEnd) {
      // スキル スラッシャー: カウンターCD中のタップで「近接成功の追撃」(0.3倍)を1回。
      // arm されている(=直前のカウンターが命中した)ときだけ。自動ではなくタップで発動。
      if (hasSkill(player, 'slasher') && now < player.slasherWindowUntil) {
        return applySlasherTapStrike(get, player, gameTime);
      }
      return { swung: false, hit: false, finish: false, killed: 0 };
    }

    // スキル: カウンターマスター = カウンター窓 +0.5s(全アサイン地点で共通使用)。
    const counterWindowMs = COUNTER_WINDOW + (hasSkill(player, 'counter-master') ? 500 : 0);

    // 近接スイングの揺れは「通常ヒット時のみ」(空振りは揺らさない/フィニッシュ・カウンターは
    // それぞれのインパクト演出に任せる)。判定が出揃う関数末尾で発火する(社長指示)。

    const melee = player.weapons.find(w => w.isMelee);
    const gun = getActiveGun(player); // finisher refunds into the active gun
    const meleeDamage = (melee?.damage ?? 6) * strikerMeleeMult(player) * (player.equipBonus?.damageMult ?? 1); // キャラ固有: ストライカー弾切れ時×1.5 / 装備ダメージ倍率
    const pcx = player.x + player.width / 2;
    const pcy = player.y + player.height / 2;
    const meleeRange = huntingMeleeRadius(player);
    // 近接の壁越し不可(視線判定)。屋内=lab壁(閉ドア含む) / 屋外=近傍の木。
    const meleeWalls: Rect[] = indoorMode
      ? [...labBlockingWalls(labDoors.filter(d => d.open).map(d => d.id)), ...get().labProps.map(p => p.rect)]
      : get().stageTheme === 'lab'
        // 研究所スキンは木なし=壁オブジェクト＋遮蔽物プロップ(区画生成)が視線を遮る。近傍区画を問い合わせ。
        ? [
            ...labWallsInRegion(pcx - meleeRange - 40, pcy - meleeRange - 40, pcx + meleeRange + 40, pcy + meleeRange + 40).map(wallRect),
            ...labPropsInRegion(pcx - meleeRange - 40, pcy - meleeRange - 40, pcx + meleeRange + 40, pcy + meleeRange + 40).map(propRect),
          ]
        : treesInRegion(pcx - meleeRange - 40, pcy - meleeRange - 40, pcx + meleeRange + 40, pcy + meleeRange + 40).map(trunkRect);

    // ドローンブーメラン: 近接攻撃(このスイング)と同じ入力で発動(自動ではない)。5秒クールダウン中は不可。
    // ※発火経路を近接攻撃と統一(以前の「立ち止まり中」専用ゲートは廃止=近接と同ロジック)。
    if (
      player.subWeapons.includes('drone-boomerang') &&
      !subWeaponBlockedByKatana(player, 'drone-boomerang') &&
      gameTime >= (player.subWeaponCooldowns['drone-boomerang'] ?? 0)
    ) {
      const lvl = Math.max(1, Math.min(3, player.subWeaponLevels['drone-boomerang'] ?? 1));
      const dir = player.lastDirection ?? { x: 1, y: 0 };
      const dmag = Math.max(0.001, Math.hypot(dir.x, dir.y));
      get().addProjectile({
        id: `proj-drone-boom-${Date.now()}`,
        x: pcx - 9, y: pcy - 9, width: 18, height: 18,
        speed: DRONE_BOOM_SPEED,
        damage: meleeDamage, // 行き/戻りの接触=通常近接ダメージ同等
        direction: { x: dir.x / dmag, y: dir.y / dmag },
        weaponType: 'drone-boomerang-projectile',
        weaponKey: 'sub-drone-boomerang',
        duration: DRONE_BOOM_SAFETY_MS, // 安全消滅の上限
        createdAt: Date.now(),
        passthrough: true,
        hitEnemies: [],
        hostile: false,
        reflected: false,
        area: DRONE_BOOM_RADIUS,
        boomPhase: 'out',
        boomOriginX: pcx,
        boomOriginY: pcy,
        boomMaxDist: DRONE_BOOM_DIST_BY_LEVEL[lvl],
        boomStopMs: DRONE_BOOM_STOP_MS_BY_LEVEL[lvl],
      });
      get().setSubWeaponCooldown('drone-boomerang', gameTime + DRONE_BOOM_COOLDOWN_MS);
      set({ boomerangThrowFxAt: Date.now() }); // ブーメラン投擲音SEのトリガ
    }

    // ワイヤーアンカー: 指離し(このスイング)で発動する移動系サブ。攻撃はしない。
    //  1) 打ち込み完了後の受付窓内なら → アンカー地点へ高速移動(=追加タップ)。
    //  2) それ以外で、打ち込み中でなく、クールダウンも明けていれば → アンカー打ち込み開始。
    // ※近接スイング/カウンター窓自体は従来どおり継続(下のコードに任せる)。発動条件は重複しない。
    if (
      player.subWeapons.includes('wire-anchor') &&
      !subWeaponBlockedByKatana(player, 'wire-anchor')
    ) {
      const dashing = now < player.wireDashUntil;
      const charging = player.wireAnchored && now < player.wirePlantUntil; // 溜中(まだ移動できない)
      // 敵に吸着中は自動コンボ(引き寄せ→近接→ノックバック)が走るので、タップ移動は無効。
      const armed = player.wireAnchored && now >= player.wirePlantUntil && !player.wireStuckEnemyId;
      const lvl = Math.max(1, Math.min(3, player.subWeaponLevels['wire-anchor'] ?? 1));
      if (dashing) {
        // 移動中は何もしない。
      } else if (armed) {
        // 追加タップ → アンカー地点へ高速移動。CD はここで開始(=「使用後」)。アンカーは消費。
        const dx = player.wireAnchorX - pcx;
        const dy = player.wireAnchorY - pcy;
        const dist = Math.max(0.001, Math.hypot(dx, dy));
        set(s => ({
          player: {
            ...s.player,
            wireDashUntil: now + WIRE_DASH_MS,
            wireDashSpeed: dist / (WIRE_DASH_MS / 1000),
            wireAnchored: false,
            wirePlantUntil: 0,
          }
        }));
        get().setSubWeaponCooldown('wire-anchor', gameTime + WIRE_COOLDOWN_BY_LEVEL[lvl]);
        get().spawnRing(player.wireAnchorX, player.wireAnchorY, 8, 30, 'rgba(96,165,250,0.8)', 2, 260);
      } else if (!charging && gameTime >= (player.subWeaponCooldowns['wire-anchor'] ?? 0)) {
        // 指離し → 青サークル地点へ「即座に」アンカー打ち込み(ワイヤー表示)。溜(WIRE_PLANT_MS)後に移動可。
        // 進行方向ではなく狙いサークル(慣性付き aim=向き×傾き強度)へ。飛距離も aim の長さで可変。
        // ダッシュ速度は飛距離から算出(上の armed 分岐)なので、短い狙いは自動で短く遅いダッシュになる。
        const ax = pcx + player.aimX * WIRE_ANCHOR_RANGE;
        const ay = pcy + player.aimY * WIRE_ANCHOR_RANGE;
        set(s => ({
          player: {
            ...s.player,
            wireAnchorX: ax,
            wireAnchorY: ay,
            wireAnchored: true,
            wirePlantUntil: now + WIRE_PLANT_MS,
          }
        }));
        get().spawnRing(ax, ay, 6, 22, 'rgba(96,165,250,0.85)', 2, 220); // 打ち込みの小ポップ
        // 打ち込み経路上に敵がいる=アンカーが敵に当たる → 近接命中音だけ。いない=地面に打ち込み音。
        const enemyRects = get().enemies.map(e => ({ x: e.x, y: e.y, width: e.width, height: e.height }));
        if (segmentBlocked(pcx, pcy, ax, ay, enemyRects)) set({ anchorEnemyHitFxAt: now });
        else set({ anchorPlantFxAt: now });
      }
    }

    // 自動タレットを叩いてモード切替: メレー範囲内のタレットを前方集中⇔全方位でトグル。
    // 既存の近接接触(=スイング)を再利用。counterCooldown が連打を抑えるのでスイング毎に
    // 一度だけ反転する。スイングは消費せず通常の近接判定もそのまま続行する。
    const turretsInReach = projectiles.filter(p => {
      if (p.weaponType !== 'turret') return false;
      const nx = Math.max(p.x, Math.min(pcx, p.x + p.width));
      const ny = Math.max(p.y, Math.min(pcy, p.y + p.height));
      return Math.hypot(pcx - nx, pcy - ny) <= meleeRange;
    });
    if (turretsInReach.length > 0) {
      const toggleIds = new Set(turretsInReach.map(p => p.id));
      set(state => ({
        projectiles: state.projectiles.map(p =>
          toggleIds.has(p.id)
            ? { ...p, turretMode: p.turretMode === 'omni' ? 'forward' : 'omni', turretModeSwitchedAt: now }
            : p
        )
      }));
      for (const t of turretsInReach) {
        const cx = t.x + t.width / 2;
        const cy = t.y + t.height / 2;
        get().spawnRing(cx, cy, 6, 30, 'rgba(125,211,252,0.8)', 2, 220);
        get().spawnSlash(cx, cy, 'rgba(186,230,253,0.9)');
      }
    }

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
        swipeStrength: 1,
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
      !get().indoorMode && // 屋内ステージは二人組(クエストNPC)不在=相互作用しない
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
        swipeStrength: 1,
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
      const counterCd = hasMurasame(player) ? now : now + counterWindowMs + COUNTER_COOLDOWN;
      set(state => ({
        player: {
          ...state.player,
          counterWindowEnd: now + counterWindowMs,
          counterCooldownEnd: counterCd,
        }
      }));
      // 刀でも松明・卵を破壊できる(刀の間合いの円)。
      get().breakPropsAlong(pcx, pcy, 1, 0, 0, katanaRange(player), meleeDamage * 2.5);
      return { swung: false, hit: false, finish: false, killed: 0 };
    }

    // 鞭装備中: 通常ナイフのスイープを鞭に置き換える(刀と同様、グレネード起爆/
    // トラップ押し出し/シールドバッシュ/小物破壊は行わない)。カウンター窓は通常
    // どおり開くので、敵弾反射(カウンター)はループ側で自動成立する=カウンター優先。
    if (isWhipMode(player)) {
      const lvl = whipLevel(player);
      const ld = player.lastDirection ?? { x: 1, y: 0 };
      const lmag = Math.max(0.001, Math.hypot(ld.x, ld.y));
      const ux = ld.x / lmag;
      const uy = ld.y / lmag;
      const reach = WHIP_LENGTH_BY_LEVEL[lvl];
      const tipX = pcx + ux * reach; // 鞭先端 = ハリケーンの根元
      const tipY = pcy + uy * reach;
      // カウンター窓+クールダウンを通常どおり開く(反射はループ側)。
      // 描画時間を倍にした分(WHIP_COOLDOWN_EXTRA_MS)だけクールダウンも後ろへずらす。
      set(state => ({
        player: {
          ...state.player,
          counterWindowEnd: now + counterWindowMs,
          counterCooldownEnd: now + counterWindowMs + COUNTER_COOLDOWN + WHIP_COOLDOWN_EXTRA_MS,
        }
      }));
      set({ whipSwingFxAt: now }); // 鞭を振る音SEのトリガ(命中の有無に関わらず鳴る)
      // 鞭の軌跡 + 当たり範囲の可視化(全長を即表示→フェード。太い帯=当たり範囲)。
      get().spawnEffect({
        kind: 'whip',
        id: `fx-whip-${now}`,
        fromX: pcx, fromY: pcy, toX: tipX, toY: tipY,
        halfWidth: WHIP_HIT_HALF_WIDTH,
        color: 'rgba(186,230,253,0.95)', createdAt: now, duration: WHIP_DRAW_MS,
      });
      // 視認性アップ(軽量): 鞭の軌道に沿って明るい加算ストリークを重ねる(発光=bloomで暗い画面でも映える)。
      get().spawnEffect({
        kind: 'trail',
        id: `fx-whip-glow-${now}`,
        fromX: pcx, fromY: pcy, toX: tipX, toY: tipY,
        color: 'rgba(125,211,252,1)', createdAt: now, duration: WHIP_DRAW_MS,
      });
      // 鞭でも松明・卵を破壊できる(線=カプセル範囲。ハリケーン有無に関わらず毎振り)。
      get().breakPropsAlong(pcx, pcy, ux, uy, reach, WHIP_HIT_HALF_WIDTH, meleeDamage * 2.5);
      // 鞭でもスキルの手榴弾を起爆できる(鞭の当たり範囲=線カプセル内の手榴弾を即起爆)。通常近接と同じ挙動。
      {
        const whipGrenadeIds = get().projectiles
          .filter(p => p.weaponType === 'grenade')
          .filter(p => {
            const gx = p.x + p.width / 2, gy = p.y + p.height / 2;
            const rx = gx - pcx, ry = gy - pcy;
            let along = rx * ux + ry * uy;
            if (along < 0) along = 0; else if (along > reach) along = reach;
            const nx = pcx + ux * along, ny = pcy + uy * along;
            return Math.hypot(gx - nx, gy - ny) <= WHIP_HIT_HALF_WIDTH;
          })
          .map(p => p.id);
        if (whipGrenadeIds.length > 0) {
          set(state => ({
            projectiles: state.projectiles.map(p =>
              whipGrenadeIds.includes(p.id) ? { ...p, createdAt: now - Math.max(1, p.duration) } : p
            ),
          }));
          for (const id of whipGrenadeIds) {
            const g = get().projectiles.find(p => p.id === id);
            if (g) get().spawnSlash(g.x + g.width / 2, g.y + g.height / 2);
          }
        }
      }
      // チャージ満タンなら、この一振りでハリケーン発動(チャージ消費)。自動発動しない。
      if (player.whipCharged) {
        get().performHurricane(tipX, tipY);
        set(state => ({ player: { ...state.player, whipHitCount: 0, whipCharged: false } }));
        return { swung: true, hit: true, finish: false, killed: 0 };
      }
      // 通常の鞭スイープ: 進行方向の細長いカプセルに掛かる敵を選択(刀ダッシュと同じ幾何)。
      const targetIds: string[] = [];
      for (const e of enemies) {
        if (e.type === 'reaper' && !e.reaperChaser) continue; // 深奥チェイサーは近接対象(ボス級)
        const ex = e.x + e.width / 2 - pcx;
        const ey = e.y + e.height / 2 - pcy;
        const along = ex * ux + ey * uy;
        if (along < -e.width / 2 || along > reach + e.width / 2) continue;
        const perp = Math.abs(ex * uy - ey * ux);
        if (perp <= WHIP_HIT_HALF_WIDTH + e.width / 2) targetIds.push(e.id);
      }
      const res = get().performWhipStrike(targetIds);
      if (res.hits > 0) set({ whipHitFxAt: Date.now() }); // 鞭命中音SEのトリガ
      // チャージ加算(空振りは0)。閾値到達でハリケーン待機。
      if (res.hits > 0) {
        const threshold = whipChargeThreshold(player);
        const nextCount = (player.whipHitCount ?? 0) + res.hits;
        const becameCharged = !player.whipCharged && nextCount >= threshold;
        set(state => ({
          player: {
            ...state.player,
            whipHitCount: nextCount,
            whipCharged: state.player.whipCharged || nextCount >= threshold,
          }
        }));
        if (becameCharged) {
          // チャージ満タン = 次の一振りでハリケーン。ピカッと光って知らせる。
          get().spawnFlash('rgba(186,230,253,0.34)', 150);                     // 一瞬の画面明滅(ピカッ)
          get().spawnRing(pcx, pcy, 10, 72, 'rgba(255,255,255,0.95)', 3, 260); // 白い閃光リング
          get().spawnRing(pcx, pcy, 6, 50, 'rgba(125,211,252,0.9)', 3, 360);   // シアンの輪
          get().spawnBurst(pcx, pcy, '#bae6fd', 12);                           // 弾ける光の粒
        }
      }
      return { swung: true, hit: res.hit, finish: res.finish, killed: res.killed };
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
    // スキル: 近接コンボ倍率(ナイフマスター×コンボマスター)。このスイング開始時点の状態で固定。
    const meleeComboMult = skillMeleeComboMult(player, gameTime, get().meleeFinishComboCount, get().meleeFinishComboUntil);
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

    // シールドバッシュ: メレー範囲に壁があれば、その壁を法線方向(敵側)へシームレスに
    // 押し出す(トラップの押し出しと同じ shove 機構)。壁が始点→終点で掃過する範囲の
    // 敵全部に近接×SHIELD_BASH_DAMAGE_MULT と押し出し方向への強ノックバックを与える。
    const shieldShoves = projectiles
      .filter(p => p.weaponType === 'shield')
      .filter(p => {
        const nx = Math.max(p.x, Math.min(pcx, p.x + p.width));
        const ny = Math.max(p.y, Math.min(pcy, p.y + p.height));
        return Math.hypot(pcx - nx, pcy - ny) <= meleeRange;
      })
      .map(p => {
        // バッシュ方向は「どちらの面から叩いたか」で決める: プレイヤー中心→盾中心の向き
        // (=叩いた側の反対=叩かれた面へ押し出す)。中心がほぼ重なる場合のみ設置法線へフォールバック。
        const scx = p.x + p.width / 2;
        const scy = p.y + p.height / 2;
        const sm = Math.hypot(scx - pcx, scy - pcy);
        const dux = sm > 0.01 ? (scx - pcx) / sm : p.direction.x;
        const duy = sm > 0.01 ? (scy - pcy) / sm : p.direction.y;
        const ex = p.x + dux * SHIELD_BASH_SHOVE_DISTANCE;
        const ey = p.y + duy * SHIELD_BASH_SHOVE_DISTANCE;
        // 始点〜終点の壁を覆う掃過AABB(敵の被弾判定用)。
        const swept = {
          x: Math.min(p.x, ex),
          y: Math.min(p.y, ey),
          width: Math.abs(ex - p.x) + p.width,
          height: Math.abs(ey - p.y) + p.height,
        };
        return { id: p.id, fromX: p.x, fromY: p.y, x: ex, y: ey, dux, duy, swept, cx: p.x + p.width / 2, cy: p.y + p.height / 2 };
      });
    const hasShieldShove = shieldShoves.length > 0;
    let bashHitEnemy = false; // バッシュが敵に当たったか(ストップ用)

    for (const enemy of enemies) {
      if (enemy.type === 'reaper' && !enemy.reaperChaser) { survivors.push(enemy); continue; } // 深奥チェイサーは近接対象(ボス級)
      const ecx = enemy.x + enemy.width / 2;
      const ecy = enemy.y + enemy.height / 2;
      const dx = ecx - pcx;
      const dy = ecy - pcy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      // バッシュ対象 = 押し出される壁の掃過範囲に重なる敵(メレー範囲外でも当たる)。
      const bashShove = hasShieldShove
        ? shieldShoves.find(s => rectsOverlap({ x: enemy.x, y: enemy.y, width: enemy.width, height: enemy.height }, s.swept))
        : undefined;
      if (dist > meleeRange && !bashShove) { survivors.push(enemy); continue; }
      // 壁越しには当てない(視線が壁で遮られている敵はスキップ)。
      if (meleeWalls.length > 0 && segmentBlocked(pcx, pcy, ecx, ecy, meleeWalls)) { survivors.push(enemy); continue; }

      // バッシュ: 近接ダメージ×3 + 押し出し方向への強ノックバック。フィニッシュ無し。
      if (bashShove) {
        bashHitEnemy = true; // 敵にヒット → 後でストップ
        slashAt.push({ x: ecx, y: ecy });
        const dmg = meleeDamage * SHIELD_BASH_DAMAGE_MULT;
        meleeDamageNumbers.push({ x: ecx, y: enemy.y, value: Math.round(dmg), crit: true });
        const newHealth = Math.max(0, enemy.health - dmg);
        if (newHealth <= 0) { killed.push({ enemy, finisher: false }); continue; }
        survivors.push({
          ...enemy,
          health: newHealth,
          lastHit: now,
          knockbackVx: bashShove.dux * SHIELD_BASH_KNOCKBACK_SPEED,
          knockbackVy: bashShove.duy * SHIELD_BASH_KNOCKBACK_SPEED,
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
      const crit = Math.random() < Math.min(1, meleeCritChance + trapCritBonus + skillBenkeiCritBonus(player, gameTime));
      const dmg = meleeDamage * (crit ? skillCritMult(player, CRIT_DAMAGE_MULT) : 1) * skillOutgoingDamageMult(player) * meleeComboMult;
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
    const bossKilled = killed.some(k => k.enemy.type === 'giantbat' && !k.enemy.fromEvent);
    // スキル: ナイフマスターの近接コンボ加算(近接ダメージが当たったスイングで +1)。
    const meleeHitLanded = slashAt.length > 0;
    const knifeCombo = computeKnifeCombo(player, gameTime, meleeHitLanded);
    // スキル: コンボマスター = フィニッシュコンボ窓 +1s。
    const finishWindowMs = (MELEE_FINISH_COMBO_WINDOW_MS + skillFinishComboWindowBonus(player)) * (player.equipBonus?.killGraceMult ?? 1); // 装備KILL猶予で延長
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
        ? gameTime + finishWindowMs
        : state.meleeFinishComboUntil,
      hitstopUntil: finisherHit ? now + HITSTOP_MS : state.hitstopUntil,
      player: {
        ...state.player,
        counterWindowEnd: now + counterWindowMs,
        counterCooldownEnd: now + counterWindowMs + COUNTER_COOLDOWN,
        huntingCharged: false,
        huntingChargeStartedAt: 0,
        knifeComboCount: knifeCombo.count,
        knifeComboUntil: knifeCombo.until,
        // スキル スラッシャー: この近接が命中(slashAt有)したら追撃をarm(CD明けまで)。
        // CD中のタップで1回だけ消費。命中しなければ arm しない(=追撃なし)。
        slasherWindowUntil: hasSkill(state.player, 'slasher') && slashAt.length > 0
          ? now + counterWindowMs + COUNTER_COOLDOWN
          : 0,
      },
      projectiles: grenadesToDetonate.length > 0 || trapShoves.length > 0 || hasShieldShove
        ? state.projectiles.map(p => {
            if (grenadesToDetonate.includes(p.id)) {
              return { ...p, createdAt: now - Math.max(1, p.duration) };
            }
            const tr = trapShoves.find(t => t.id === p.id);
            if (tr) {
              return {
                ...p,
                shoveStartX: tr.fromX, shoveStartY: tr.fromY,
                shoveStartAt: now, shoveDuration: TRAP_MELEE_SHOVE_SLIDE_MS,
                x: tr.x, y: tr.y,
              };
            }
            // シールドバッシュ: 壁を法線方向へシームレスに押し出し、スライド終了時に強制破壊。
            const sh = shieldShoves.find(s => s.id === p.id);
            if (sh) {
              // 一発破壊はやめ、バッシュ1回で耐久を SHIELD_BASH_DURABILITY_COST 減らす。
              // 0以下になったらスライド終了時に破壊。残っていれば押し出して残す。
              const nextHp = (p.shieldHp ?? 1) - SHIELD_BASH_DURABILITY_COST;
              return {
                ...p,
                shoveStartX: sh.fromX, shoveStartY: sh.fromY,
                shoveStartAt: now, shoveDuration: TRAP_MELEE_SHOVE_SLIDE_MS,
                x: sh.x, y: sh.y,
                shieldHp: nextHp,
                ...(nextHp <= 0 ? { shieldBreakAt: now + TRAP_MELEE_SHOVE_SLIDE_MS } : {}),
              };
            }
            return p;
          })
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

    // シールドバッシュのエフェクト(ストップ→揺れ+寄り)は「敵に当たった時のみ」(社長指示)。
    // 壁押し出しだけ(敵に当たっていない)では何も出さない。
    if (bashHitEnemy) {
      get().triggerHitImpact(HITSTOP_MS, SHIELD_BASH_SHAKE_MS, SHIELD_BASH_SHAKE_MAG, 0); // 寄りズーム無し(社長指示)。ストップ+揺れのみ
      set({ bashHitFxAt: Date.now() }); // 命中SE(heavy-impact)のトリガ。useGameLoop が検出して再生。
    }
    // シールドバッシュの押し出し演出(押し出し先で衝撃スラッシュ+リング)。
    for (const s of shieldShoves) {
      const ecx = s.x + (s.cx - s.fromX);
      const ecy = s.y + (s.cy - s.fromY);
      get().spawnSlash(ecx, ecy, 'rgba(203,213,225,0.95)');
      get().spawnRing(ecx, ecy, 6, 44, 'rgba(203,213,225,0.66)', 3, 240);
      get().spawnBurst(ecx, ecy, '#94a3b8', 10);
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
      get().triggerFinishImpact(); // ストップ後に 揺れ+スロー+寄りズーム
    } else if (slashAt.length > 0) {
      // 通常ヒット(空振りでもフィニッシュでもない)のときだけスイングの揺れを出す。
      get().triggerShake(MELEE_SWING_SHAKE_MS, MELEE_SWING_SHAKE_MAG);
    }

    // スキル: リーパー(フィニッシュ波及=スイング範囲内の敵を全員フィニッシュ)/ カウンターマスター(成立時ノックバック)。
    applyMeleeFinishSkillSpread(get, player, killed.some(k => k.finisher), pcx, pcy, meleeRange, meleeDamage);
    get().registerMultiHit(slashAt.length); // キャラ固有 ヘビーガンナー: 近接が2体以上に当たれば爆発範囲バフ
    if (hasSkill(player, 'counter-master') && slashAt.length > 0) {
      counterMasterKnockback(get, pcx, pcy);
    }
    // スキル スラッシャーの arm はこの近接スイングの set()(player.slasherWindowUntil)で行う。
    // 追撃自体は「CD中のタップ」で applySlasherTapStrike が出す(自動ではない)。

    // 松明・卵などの小物破壊(共通ヘルパ。半径=メレー範囲の円)。
    const propHit = get().breakPropsAlong(pcx, pcy, 1, 0, 0, meleeRange, meleeDamage * 2.5);

    return {
      swung: true,
      hit: slashAt.length > 0 || propHit || trapShoves.length > 0 || hasShieldShove,
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
    // スキル: 近接コンボ倍率(ナイフマスター×コンボマスター)。
    const meleeComboMult = skillMeleeComboMult(player, gameTime, get().meleeFinishComboCount, get().meleeFinishComboUntil);
    const killed: { enemy: Enemy; finisher: boolean }[] = [];
    let bossFinishHit = false;
    const survivors: Enemy[] = [];
    const damageNumbers: { x: number; y: number; value: number; crit: boolean }[] = [];
    const slashAt: { x: number; y: number }[] = [];
    const critStunAt: { x: number; y: number }[] = [];

    for (const enemy of enemies) {
      // ジャンプ攻撃中(空中)はあらゆる近接の当たり判定を外す(=無敵。盾は敵AI側で別処理)。
      if (enemy.aiPhase === 'jump') { survivors.push(enemy); continue; }
      if (!targetIds.includes(enemy.id) || (enemy.type === 'reaper' && !enemy.reaperChaser)) {
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
        Math.min(1, KATANA_CRIT_CHANCE_BY_LEVEL[katanaLevel(player)] + player.critChance + trapCritBonus + skillBenkeiCritBonus(player, gameTime));
      // ダッシュの3倍は基礎値側に掛け、クリ倍率は既存近接どおり最後に掛ける
      // (既存ダメージ計算: dmg = base * (crit ? CRIT_DAMAGE_MULT : 1) に揃えた)。
      const dmg = baseDamage * damageMult * (crit ? skillCritMult(player, CRIT_DAMAGE_MULT) : 1) * skillOutgoingDamageMult(player) * meleeComboMult;
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
    const bossKilled = killed.some(k => k.enemy.type === 'giantbat' && !k.enemy.fromEvent);
    const knifeCombo = computeKnifeCombo(player, gameTime, slashAt.length > 0);
    const finishWindowMs = (MELEE_FINISH_COMBO_WINDOW_MS + skillFinishComboWindowBonus(player)) * (player.equipBonus?.killGraceMult ?? 1); // 装備KILL猶予で延長
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
        ? gameTime + finishWindowMs
        : state.meleeFinishComboUntil,
      hitstopUntil: finisherHit ? now + HITSTOP_MS : state.hitstopUntil,
      player: { ...state.player, knifeComboCount: knifeCombo.count, knifeComboUntil: knifeCombo.until },
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
      get().triggerFinishImpact(); // ストップ後に 揺れ+スロー+寄りズーム
    }
    // スキル: リーパー。刀の一閃フィニッシュ範囲(katanaRange)内の敵を全員フィニッシュ。
    applyMeleeFinishSkillSpread(get, player, killed.some(k => k.finisher), pcx, pcy, katanaRange(player), baseDamage * damageMult);

    return { hit: slashAt.length > 0, finish: finisherHit || bossFinishHit, killed: killed.length };
  },

  performWhipStrike: (targetIds) => {
    const now = Date.now();
    const { player, gameTime, enemies, hurricane } = get();
    if (targetIds.length === 0) return { hit: false, finish: false, killed: 0, hits: 0 };

    const gun = getActiveGun(player);
    const meleeWeapon = player.weapons.find(w => w.isMelee);
    const meleeBase = meleeWeapon?.damage ?? 6;     // 近接の素ダメージ。鞭は通常0.25倍
    const meleeCritChance = meleeWeapon?.critChance ?? 0;
    // ハリケーン発動中の吸引半径内にいる敵は「巻き込み中」とみなし、鞭を通常倍率(1.0)で当てる。
    const hurricaneR2 = hurricane ? hurricane.radius * hurricane.radius : 0;
    const inHurricane = (ecx: number, ecy: number) =>
      !!hurricane && now < hurricane.endsAt &&
      (ecx - hurricane.rootX) ** 2 + (ecy - hurricane.rootY) ** 2 <= hurricaneR2;
    const pcx = player.x + player.width / 2;
    const pcy = player.y + player.height / 2;
    // 鞭の線(進行方向)に直交する単位ベクトル。敵を「線のどちら側にいるか」で
    // その側へ弾き、中央に直線の避難路を作る。
    const ld = player.lastDirection ?? { x: 1, y: 0 };
    const lmag = Math.max(0.001, Math.hypot(ld.x, ld.y));
    const nx = -ld.y / lmag;
    const ny = ld.x / lmag;
    const killed: { enemy: Enemy; finisher: boolean }[] = [];
    let bossFinishHit = false;
    const survivors: Enemy[] = [];
    const damageNumbers: { x: number; y: number; value: number; crit: boolean }[] = [];
    const slashAt: { x: number; y: number }[] = [];
    let hits = 0;
    // スキル: 近接コンボ倍率(ナイフマスター×コンボマスター)。
    const meleeComboMult = skillMeleeComboMult(player, gameTime, get().meleeFinishComboCount, get().meleeFinishComboUntil);

    for (const enemy of enemies) {
      if (!targetIds.includes(enemy.id) || (enemy.type === 'reaper' && !enemy.reaperChaser)) {
        survivors.push(enemy);
        continue;
      }
      hits++;
      const ecx = enemy.x + enemy.width / 2;
      const ecy = enemy.y + enemy.height / 2;
      slashAt.push({ x: ecx, y: ecy });
      // 巻き込み中は通常倍率(1.0)、それ以外は鞭の低倍率(0.25)。
      const whipMult = inHurricane(ecx, ecy) ? 1 : WHIP_DAMAGE_MULT;
      const stunned = enemy.stunUntil !== undefined && gameTime < enemy.stunUntil;
      if (stunned) {
        // 近接フィニッシュ: スタン敵は即時処刑(ボスは5×でスタン解除)。
        if (isBossType(enemy.type)) {
          bossFinishHit = true;
          const dmg = meleeBase * whipMult * BOSS_MELEE_STUN_MULT;
          damageNumbers.push({ x: ecx, y: enemy.y, value: Math.round(dmg), crit: true });
          const newHealth = Math.max(0, enemy.health - dmg);
          if (newHealth <= 0) killed.push({ enemy, finisher: false });
          else survivors.push({ ...enemy, health: newHealth, stunUntil: undefined, lastHit: now, liftUntil: now + 420 });
          continue;
        }
        killed.push({ enemy, finisher: true });
        continue;
      }
      const trapCritBonus = enemy.rootUntil !== undefined && gameTime < enemy.rootUntil ? TRAP_ROOT_CRIT_BONUS : 0;
      const crit = Math.random() < Math.min(1, meleeCritChance + player.critChance + trapCritBonus + skillBenkeiCritBonus(player, gameTime));
      const dmg = meleeBase * whipMult * (crit ? skillCritMult(player, CRIT_DAMAGE_MULT) : 1) * skillOutgoingDamageMult(player) * meleeComboMult;
      damageNumbers.push({ x: ecx, y: enemy.y, value: Math.round(dmg), crit });
      const newHealth = Math.max(0, enemy.health - dmg);
      if (newHealth <= 0) { killed.push({ enemy, finisher: false }); continue; }
      // 大ノックバック(通常の約3倍): 鞭の線に直交する向きへ、敵がいる側へ強く弾く=避難路。
      // 鞭は「必ずノックバック」: ノックバック無敵窓(knockbackImmuneUntil)を無視して毎回弾く。
      const side = ((ecx - pcx) * nx + (ecy - pcy) * ny) >= 0 ? 1 : -1;
      survivors.push({
        ...enemy,
        health: newHealth,
        lastHit: now,
        knockbackVx: side * nx * WHIP_KNOCKBACK_SPEED,
        knockbackVy: side * ny * WHIP_KNOCKBACK_SPEED,
        knockbackUntil: now + KNOCKBACK_DURATION,
        knockbackImmuneUntil: now + KNOCKBACK_IMMUNE_MS,
      });
    }

    const finisherHit = killed.some(k => k.finisher);
    const comboFinishCount = killed.filter(k => k.finisher).length + (bossFinishHit ? 1 : 0);
    const bossKilled = killed.some(k => k.enemy.type === 'giantbat' && !k.enemy.fromEvent);
    const knifeCombo = computeKnifeCombo(player, gameTime, slashAt.length > 0);
    const finishWindowMs = (MELEE_FINISH_COMBO_WINDOW_MS + skillFinishComboWindowBonus(player)) * (player.equipBonus?.killGraceMult ?? 1); // 装備KILL猶予で延長
    set(state => ({
      enemies: survivors,
      gameStats: {
        ...state.gameStats,
        enemiesKilled: state.gameStats.enemiesKilled + killed.length,
        damageDealt: state.gameStats.damageDealt + damageNumbers.reduce((s, n) => s + n.value, 0),
        maxCombo: comboFinishCount > 0
          ? Math.max(state.gameStats.maxCombo, state.meleeFinishComboUntil >= gameTime ? state.meleeFinishComboCount + comboFinishCount : comboFinishCount)
          : state.gameStats.maxCombo,
      },
      gameWon: state.gameWon || bossKilled,
      meleeFinishComboCount: comboFinishCount > 0
        ? (state.meleeFinishComboUntil >= gameTime ? state.meleeFinishComboCount + comboFinishCount : comboFinishCount)
        : state.meleeFinishComboCount,
      meleeFinishComboUntil: comboFinishCount > 0 ? gameTime + finishWindowMs : state.meleeFinishComboUntil,
      hitstopUntil: finisherHit ? now + HITSTOP_MS : state.hitstopUntil,
      player: { ...state.player, knifeComboCount: knifeCombo.count, knifeComboUntil: knifeCombo.until },
    }));

    // 鞭の時は近接攻撃のクレスト(slashストリーク)表現は出さない。鞭自身のlashスプライトのみ。
    for (const c of damageNumbers) get().spawnDamageNumber(c.x, c.y, c.value, c.crit);
    // 弾薬ドロップは鞭固定20%(弾切れ救済)。
    grantMeleeKillRewards(get, killed, player, gun, false, WHIP_AMMO_DROP_CHANCE);
    if (finisherHit || bossFinishHit) get().triggerFinishImpact(); // ストップ後に 揺れ+スロー+寄りズーム
    // スキル: リーパー。鞭フィニッシュ範囲(WHIP_LENGTH)内の敵を全員フィニッシュ。
    applyMeleeFinishSkillSpread(get, player, killed.some(k => k.finisher), pcx, pcy, WHIP_LENGTH_BY_LEVEL[1], meleeBase);

    return { hit: slashAt.length > 0, finish: finisherHit || bossFinishHit, killed: killed.length, hits };
  },

  performHurricane: (rootX, rootY) => {
    const now = Date.now();
    const player = get().player;
    const lvl = whipLevel(player);
    // スキル: 賢者の石 = ハリケーン半径 +20%(ダメージは tickHurricane 側で +20%)。
    const sageMult = sageStoneHurricaneMult(player);
    set({
      hurricane: {
        rootX, rootY,
        endsAt: now + HURRICANE_DURATION_MS_BY_LEVEL[lvl],
        radius: HURRICANE_RADIUS_BY_LEVEL[lvl] * sageMult,
        level: lvl,
        lastTickAt: 0,
        lastDamageAt: 0,
      }
    });
    get().triggerShake(HURRICANE_SHAKE_MS, HURRICANE_SHAKE_MAG); // 竜巻発生の画面シェイク(描画のみ)
    // 渦の表現は Pixi 側(syncWhipHurricane)が hurricane 状態で竜巻スプライトを描画。
    get().tickHurricane(); // 初回吸引を即実行(反応を出す)
  },

  tickHurricane: () => {
    const now = Date.now();
    const state = get();
    const h = state.hurricane;
    if (!h) return;
    if (now >= h.endsAt) { set({ hurricane: null }); return; }
    if (now - h.lastTickAt < HURRICANE_TICK_MS) return;
    const r2 = h.radius * h.radius;
    // 半径内の敵を距離順に最大 HURRICANE_MAX_TARGETS_PER_FRAME 体まで根元へ吸引(負荷cap)。
    const inRange = state.enemies
      .filter(e => e.type !== 'reaper')
      .map(e => {
        const ex = e.x + e.width / 2;
        const ey = e.y + e.height / 2;
        return { id: e.id, d2: (ex - h.rootX) * (ex - h.rootX) + (ey - h.rootY) * (ey - h.rootY), x: ex, y: e.y };
      })
      .filter(o => o.d2 <= r2)
      .sort((a, b) => a.d2 - b.d2)
      .slice(0, HURRICANE_MAX_TARGETS_PER_FRAME);
    if (inRange.length === 0) { set({ hurricane: { ...h, lastTickAt: now } }); return; }
    const pulled = new Set(inRange.map(o => o.id));
    const enemies = state.enemies.map(enemy => {
      if (!pulled.has(enemy.id)) return enemy;
      const ex = enemy.x + enemy.width / 2;
      const ey = enemy.y + enemy.height / 2;
      const dx = h.rootX - ex; // 根元向き(プレイヤーではなく鞭先端へ)
      const dy = h.rootY - ey;
      const dist = Math.max(0.001, Math.hypot(dx, dy));
      return {
        ...enemy,
        knockbackVx: (dx / dist) * HURRICANE_SUCTION_SPEED,
        knockbackVy: (dy / dist) * HURRICANE_SUCTION_SPEED,
        knockbackUntil: now + HURRICANE_TICK_MS * 2, // 次tickまで吸引を維持
      };
    });
    // 巻き込んだ敵へ周期ダメージ(死神と同じ方式)。0.5秒ごとに吸引対象へAoE。
    const dealDamage = now - h.lastDamageAt >= HURRICANE_DAMAGE_INTERVAL_MS;
    set({ enemies, hurricane: { ...h, lastTickAt: now, lastDamageAt: dealDamage ? now : h.lastDamageAt } });
    if (dealDamage) {
      // スキル: 賢者の石 = ハリケーンの巻き込みダメージ +20%。
      const hurDmg = Math.round(HURRICANE_DAMAGE * sageStoneHurricaneMult(state.player));
      for (const o of inRange) {
        get().damageEnemy(o.id, hurDmg);
        get().spawnDamageNumber(o.x, o.y, hurDmg); // 巻き込みダメージを可視化
      }
    }
  },

  updateAlchemyChannel: (startedAt) => {
    set(state => ({ player: { ...state.player, alchemyChannelStartedAt: startedAt } }));
  },

  summonAlchemy: () => {
    const { player, summons } = get();
    const pcx = player.x + player.width / 2;
    const pcy = player.y + player.height / 2;
    // 設置位置: プレイヤーの少し前(向き)に。
    const ld = player.lastDirection ?? { x: 0, y: 1 };
    const lmag = Math.max(0.001, Math.hypot(ld.x, ld.y));
    const sx = pcx + (ld.x / lmag) * 40;
    const sy = pcy + (ld.y / lmag) * 40;
    const lvl = alchemyLevel(player);
    set({ summonFxAt: Date.now() }); // 召喚音SEのトリガ(通常/レアとも)
    if (Math.random() < ALCHEMY_RARE_CHANCE) {
      // レア: 既存の通常個体を全消去し、レア1体を召喚(枠を専有)。
      const rare = buildSummon(lvl, 'rare', sx, sy);
      set({ summons: [rare] });
      get().spawnRing(sx, sy, 16, 120, 'rgba(125,211,252,0.85)', 3, 360);
      get().spawnGlow(sx, sy, 72, 'rgba(125,211,252,', 420);
      // 召喚完了演出(レアは強め): 暗転 + スロー + パーティクル(死神=黒も混ぜる)。
      get().triggerTimeSlow(0.3, 480);
      get().spawnFlash('rgba(0,0,0,0.5)', 260);
      get().spawnBurst(sx, sy, '#38bdf8', 34);
      get().spawnBurst(sx, sy, '#0a0a0a', 16);
      return;
    }
    // 通常: 最大3体、超えたら最古をFIFOで入れ替え。
    const normals = summons.filter(s => s.kind === 'normal').sort((a, b) => a.createdAt - b.createdAt);
    const kept = normals.length >= ALCHEMY_MAX_NORMAL
      ? normals.slice(normals.length - (ALCHEMY_MAX_NORMAL - 1))
      : normals;
    const unit = buildSummon(lvl, 'normal', sx, sy, skillSummonHpMult(player)); // スキル: ナイト=召喚HP×1.5
    set({ summons: [...kept, unit] });
    get().spawnGlow(sx, sy, 54, 'rgba(125,211,252,', 360);
    // 召喚完了演出: 暗転 + スロー + シアンのパーティクル。
    get().triggerTimeSlow(0.4, 320);
    get().spawnFlash('rgba(0,0,0,0.4)', 200);
    get().spawnBurst(sx, sy, '#38bdf8', 22);
    get().spawnBurst(sx, sy, '#bae6fd', 10);
  },

  updateSummons: (deltaTime) => {
    const now = Date.now();
    const state = get();
    if (state.summons.length === 0) return;
    const { player } = state;
    const pcx = player.x + player.width / 2;
    const pcy = player.y + player.height / 2;
    // スキル: 賢者の石 = 錬金術の召喚強化。
    //  ・通常召喚: 単体接触 → 半径 SAGE_NORMAL_AOE_RADIUS の AoE
    //  ・レア(死神): 近接ダメージ +50% / 巻き込み(オーラ)半径 +30%
    const sage = hasSageStone(player);
    const SAGE_NORMAL_AOE_RADIUS = 90; // 仮値(実機調整前提)
    const rareDamageMult = sage ? 1.5 : 1;
    const rareAuraMult = sage ? 1.3 : 1;

    const attackHits: { id: string; amount: number; x: number; y: number }[] = [];
    let enemiesNext = state.enemies;
    let enemiesChanged = false;

    // プレイヤーへ間合いを保って追従(密着しない)。
    const moveFollow = (s: Summon): Summon => {
      const scx = s.x + s.width / 2;
      const scy = s.y + s.height / 2;
      const dx = pcx - scx;
      const dy = pcy - scy;
      const dist = Math.hypot(dx, dy);
      if (dist <= ALCHEMY_FOLLOW_GAP_PX) return s;
      const step = Math.min(s.speed * deltaTime, dist - ALCHEMY_FOLLOW_GAP_PX);
      const nx = s.x + (dx / dist) * step;
      const ny = s.y + (dy / dist) * step;
      const r = resolveTreeCollision({ x: nx, y: ny, width: s.width, height: s.height });
      return { ...s, x: r.x, y: r.y };
    };

    const nextSummons: Summon[] = [];
    for (const s0 of state.summons) {
      if (s0.kind === 'rare') {
        if (now >= (s0.expiresAt ?? 0)) continue; // 10秒で消滅
        // 吸引: レア中心へ PULL_RANGE 内の敵を最大N体寄せる(ダメージなし)。
        const rcx = s0.x + s0.width / 2;
        const rcy = s0.y + s0.height / 2;
        const pr2 = ALCHEMY_RARE_SUCTION_PULL_RANGE * ALCHEMY_RARE_SUCTION_PULL_RANGE;
        const inRange = enemiesNext
          .map((e, i) => ({ i, d2: (e.x + e.width / 2 - rcx) ** 2 + (e.y + e.height / 2 - rcy) ** 2, reaper: e.type === 'reaper' }))
          .filter(o => !o.reaper && o.d2 <= pr2)
          .sort((a, b) => a.d2 - b.d2)
          .slice(0, ALCHEMY_RARE_SUCTION_MAX_TARGETS);
        if (inRange.length > 0) {
          if (!enemiesChanged) { enemiesNext = [...enemiesNext]; enemiesChanged = true; }
          for (const o of inRange) {
            const e = enemiesNext[o.i];
            const ecx = e.x + e.width / 2;
            const ecy = e.y + e.height / 2;
            const dx = rcx - ecx;
            const dy = rcy - ecy;
            const dist = Math.max(0.001, Math.hypot(dx, dy));
            enemiesNext[o.i] = {
              ...e,
              knockbackVx: (dx / dist) * ALCHEMY_RARE_SUCTION_SPEED,
              knockbackVy: (dy / dist) * ALCHEMY_RARE_SUCTION_SPEED,
              knockbackUntil: now + 120,
            };
          }
        }
        // 死神は 0.5秒ごとに「オーラの円(SUCTION_RADIUS)内の非reaper敵すべて」へ近接AoEダメージ。
        // 吸引対象(PULL_RANGE/最大12体)に依存させると、オーラ外周の敵が無傷に見えるため範囲基準に統一。
        let sr = s0;
        if (now - (s0.lastContactAt ?? 0) >= ALCHEMY_RARE_MELEE_INTERVAL_MS) {
          const auraR = ALCHEMY_RARE_SUCTION_RADIUS * rareAuraMult; // 賢者の石: 巻き込み +30%
          const aura2 = auraR * auraR;
          const rareDmg = Math.round(ALCHEMY_RARE_MELEE_DAMAGE * rareDamageMult); // 賢者の石: +50%
          for (const e of enemiesNext) {
            if (e.type === 'reaper') continue;
            const d2 = (e.x + e.width / 2 - rcx) ** 2 + (e.y + e.height / 2 - rcy) ** 2;
            if (d2 > aura2) continue;
            attackHits.push({ id: e.id, amount: rareDmg, x: e.x + e.width / 2, y: e.y });
          }
          sr = { ...s0, lastContactAt: now };
        }
        nextSummons.push(moveFollow(sr));
        continue;
      }
      // 通常個体
      const scx = s0.x + s0.width / 2;
      const scy = s0.y + s0.height / 2;
      if (Math.hypot(scx - pcx, scy - pcy) > ALCHEMY_DESPAWN_DIST) continue; // 距離消滅
      let s = s0;
      // 攻撃: 近接間合いの最寄り敵に接触ダメージ(throttle)。
      // 賢者の石装備時は単体接触ではなく半径 SAGE_NORMAL_AOE_RADIUS の AoE。
      if (now - (s.lastContactAt ?? 0) >= ALCHEMY_ATTACK_INTERVAL_MS) {
        if (sage) {
          const aoe2 = SAGE_NORMAL_AOE_RADIUS * SAGE_NORMAL_AOE_RADIUS;
          let hitAny = false;
          for (const e of enemiesNext) {
            if (e.type === 'reaper') continue;
            const d2 = (e.x + e.width / 2 - scx) ** 2 + (e.y + e.height / 2 - scy) ** 2;
            if (d2 > aoe2) continue;
            attackHits.push({ id: e.id, amount: s.damage, x: e.x + e.width / 2, y: e.y });
            hitAny = true;
          }
          if (hitAny) s = { ...s, lastContactAt: now };
        } else {
          let nearestId: string | null = null;
          let nd2 = ALCHEMY_ATTACK_RANGE * ALCHEMY_ATTACK_RANGE;
          let nx = 0, ny = 0;
          for (const e of enemiesNext) {
            if (e.type === 'reaper') continue;
            const d2 = (e.x + e.width / 2 - scx) ** 2 + (e.y + e.height / 2 - scy) ** 2;
            if (d2 <= nd2) { nd2 = d2; nearestId = e.id; nx = e.x + e.width / 2; ny = e.y; }
          }
          if (nearestId) { attackHits.push({ id: nearestId, amount: s.damage, x: nx, y: ny }); s = { ...s, lastContactAt: now }; }
        }
      }
      nextSummons.push(moveFollow(s));
    }
    set({ summons: nextSummons, ...(enemiesChanged ? { enemies: enemiesNext } : {}) });
    for (const h of attackHits) {
      get().damageEnemy(h.id, h.amount);
      get().spawnDamageNumber(h.x, h.y, h.amount); // 召喚(死神AoE/通常接触)の攻撃を可視化
    }
  },

  damageSummon: (id, amount) => {
    const now = Date.now();
    set(state => ({
      summons: state.summons
        .map(s => {
          if (s.id !== id || s.kind !== 'normal') return s;
          // プレイヤーと同じ被弾構造: 直近被弾から INVULN_MS は無敵(i-frame)。
          // これで敵が何体群がっても 1 無敵窓につき被弾は 1 回に制限される
          // (旧: 敵×召喚ペアごとの throttle で敵数ぶん多重被弾していた)。
          if (now - s.lastHit < INVULN_MS) return s;
          return { ...s, health: s.health - amount, lastHit: now };
        })
        .filter(s => s.kind !== 'normal' || s.health > 0),
    }));
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
        // (何体巻き込んでも1ダッシュにつき1つ)。習字「斬」の一枚絵+画面暗転。
        if (result.finish) {
          get().spawnFlash('rgba(0,0,0,0.6)', 420);                      // 暗転
          get().spawnImageMark(zanX, zanY, 'zan', { scale: 1.0, duration: 1000 });
        }
      }, KATANA_DASH_MS);
    }
    return true;
  },

  damagePlayer: (rawAmount, source) => {
    const { player } = get();

    if (player.invulnerable) return false;

    // スキル: ナイト(×0.8)/バーサーカー(×1.2) の被ダメ補正。amount>0 のみ補正。
    const amount = rawAmount > 0 ? rawAmount * skillIncomingDamageMult(player) : rawAmount;

    const wouldDie = player.health - amount <= 0;
    if (wouldDie && player.vaccineRevives > 0) {
      set(state => ({
        shakeUntil: amount > 0 ? Date.now() + SHAKE_MS : state.shakeUntil,
        shakeMag: amount > 0 ? SHAKE_MAG : state.shakeMag,
        shakeDur: amount > 0 ? SHAKE_MS : state.shakeDur,
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
        // 死因表示: 実ダメージ(amount>0)かつ source 指定時に更新。
        lastDamageSource: (amount > 0 && source) ? source : state.lastDamageSource,
        // Real damage kicks off a screen shake.
        shakeUntil: amount > 0 ? Date.now() + SHAKE_MS : state.shakeUntil,
        shakeMag: amount > 0 ? SHAKE_MAG : state.shakeMag,
        shakeDur: amount > 0 ? SHAKE_MS : state.shakeDur,
        player: {
          ...state.player,
          health: newHealth,
          invulnerable: amount > 0,
          invulnerableTime: Date.now()
        }
      };
    });

    // スキル: 反射神経 = 被弾時(amount>0)、CD明けならプレイヤー中心に反撃爆発(ランチャー値)+
    // 近傍敵を 2× ノックバック。CD 1秒。被弾イベント由来なのでスロー無し(CLAUDE.md)。
    if (amount > 0) {
      const cur = get();
      const p = cur.player;
      if (hasSkill(p, 'reflex') && cur.gameTime >= p.reflexCdUntil) {
        const pcx = p.x + p.width / 2;
        const pcy = p.y + p.height / 2;
        const exMult = skillExplosionMult(p);
        const radius = REFLEX_BLAST_RADIUS * exMult;
        const baseDmg = REFLEX_BLAST_DAMAGE * exMult;
        get().spawnRing(pcx, pcy, 10, radius, 'rgba(56,189,248,0.85)', 5, 360);
        get().spawnBurst(pcx, pcy, '#38bdf8', 18);
        get().spawnGlow(pcx, pcy, 56, 'rgba(56,189,248,', 360);
        const kbMult = (KNOCKBACK_SPEED * 2) / BULLET_KNOCKBACK_SPEED;
        for (const e of get().enemies) {
          if (e.type === 'reaper') continue;
          const ecx = e.x + e.width / 2;
          const ecy = e.y + e.height / 2;
          const dx = ecx - pcx;
          const dy = ecy - pcy;
          const dist = Math.hypot(dx, dy);
          if (dist > radius) continue;
          const falloff = 1 - dist / radius;
          const dmg = Math.max(1, Math.round(baseDmg * (0.55 + falloff * 0.45)));
          const killed = get().damageEnemy(e.id, dmg);
          get().spawnDamageNumber(ecx, e.y, dmg, false);
          if (!killed) {
            const nrm = Math.max(0.001, dist);
            get().knockbackEnemy(e.id, dx / nrm, dy / nrm, kbMult, kbMult);
          }
        }
        set(state => ({ player: { ...state.player, reflexCdUntil: state.gameTime + 1000 } }));
      }
    }

    // Return whether player is dead
    const died = get().player.health <= 0;
    // 死亡で装備は全ロスト(持ち込み含む)。持ち帰り永続も破棄する。
    if (died) saveCarriedEquip(null);
    return died;
  },

  gainExperience: (amount) => {
    const gained = amount * XP_GAIN_MULT; // 全体調整: 経験値1/3
    set(state => {
      const { player, gameStats } = state;
      const newExperience = player.experience + gained;
      const newExpCollected = gameStats.experienceCollected + gained;
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
    
    // ダンスタイム中はレベルアップを保留(EXPは溜め続け、表示はカンスト)。終了時に一気に処理する。
    if (get().rhythm.active) return;
    // Check if player should level up
    const { player } = get();
    if (player.experience >= player.experienceToNextLevel) {
      get().levelUp();
    }
  },

  levelUp: () => {
    set(state => {
      const { player } = state;
      // レベルアップ: 周辺の敵を強制ノックバック(2倍相当)。メニューで即ポーズするので velocity だと
      // 失効する → その場で位置を押し出す(木/小物の当たりは解決)。
      const pcx = player.x + player.width / 2;
      const pcy = player.y + player.height / 2;
      const solidPropsForShove = state.breakableProps.filter(pr => pr.type !== 'mine' && pr.type !== 'uv-bar');
      const shovedEnemies = state.enemies.map(e => {
        if (e.type === 'reaper') return e;
        const ex = e.x + e.width / 2;
        const ey = e.y + e.height / 2;
        const dx = ex - pcx;
        const dy = ey - pcy;
        const d = Math.hypot(dx, dy);
        if (d > LEVELUP_KNOCKBACK_RADIUS) return e;
        const n = Math.max(0.001, d);
        const tx = e.x + (dx / n) * LEVELUP_KNOCKBACK_DISTANCE;
        const ty = e.y + (dy / n) * LEVELUP_KNOCKBACK_DISTANCE;
        const tr = resolveTreeCollision({ x: tx, y: ty, width: e.width, height: e.height });
        const fin = resolveTorchCollision({ x: tr.x, y: tr.y, width: e.width, height: e.height }, solidPropsForShove);
        return { ...e, x: fin.x, y: fin.y };
      });
      const newLevel = player.level + 1;
      // VS-style ramp: cheap levels early so the upgrade menu shows up often,
      // then progressively steeper. +2 per level for levels 1-9, then a
      // smaller multiplier afterward.
      const stepLinear = newLevel < 10 ? 2 : 0;
      const newExpToNextLevel = Math.floor(player.experienceToNextLevel * (newLevel < 10 ? 1.1 : 1.18) + stepLinear);
      
      // Generate upgrade options when leveling up
      const upgradeOptions = generateEquipmentChoices(player);
      
      // Update max level in stats if needed
      const newMaxLevel = Math.max(state.gameStats.maxLevel, newLevel);

      // No automatic ammo resupply on level-up — ammo is managed entirely
      // through reserves/reloads and scarce pickups. Level-ups grant upgrades.
      return {
        player: {
          ...player,
          level: newLevel,
          experienceToNextLevel: newExpToNextLevel,
          // 余剰EXPは繰り越す(ダンス中に溜めた分で複数レベルを連鎖処理できるように)。
          experience: Math.max(0, player.experience - player.experienceToNextLevel)
        },
        enemies: shovedEnemies,
        showUpgradeMenu: true,
        upgradeOptions,
        isPaused: true,
        gameStats: {
          ...state.gameStats,
          maxLevel: newMaxLevel
        }
      };
    });
    // 押しのけの視覚フィードバック(リング)。
    const lp = get().player;
    get().spawnRing(lp.x + lp.width / 2, lp.y + lp.height / 2, 14, LEVELUP_KNOCKBACK_RADIUS, 'rgba(250,204,21,0.7)', 3, 260);
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
  
  // PHILL銃の手動発砲: 指を離した(タップ/Space)瞬間に狙いサークル方向へ1発。
  // 通常射撃(非スナップ)は「立ち止まって撃つ」武器のまま=移動中は撃たない。
  // ただし頭に吸い付き中(phillSnapEnemyId)は移動中でも発砲OK=離した瞬間に即ヘッドショット
  // (指を離す=停止なので操作上も自然)。CD=武器のcooldown(1秒)。
  firePhillShot: () => {
    const { player } = get();
    const weapon = getActiveGun(player);
    if (!weapon || weapon.key !== 'phill-revolver') return;
    // 吸い付き中の敵(movePlayer が算出した phillSnapEnemyId)を発砲時点で確認。
    const snapEnemy = player.phillSnapEnemyId != null
      ? get().enemies.find(e => e.id === player.phillSnapEnemyId)
      : undefined;
    // 立ち止まりガード: スナップ中は移動中でも撃てる(離した瞬間=停止)。非スナップは従来どおり立ち止まり必須。
    if (player.isMoving && !snapEnemy) return;
    const now = Date.now();
    if (isReloading(player, weapon.id)) return;
    if ((weapon.magazine ?? 0) <= 0) { get().autoSwitchIfDry(); return; }
    if (now - weapon.lastFired < (weapon.cooldown ?? 1000) / (player.equipBonus?.fireRateMult ?? 1)) return;
    const pcx = player.x + player.width / 2;
    const pcy = player.y + player.height / 2;
    if (snapEnemy) {
      // サークルが頭に乗った状態 → 即射撃・即被弾(ヘッドショット)。通常弾は出さない。
      // 発砲時点の敵の頭中心へ静止・短命の phill-bullet を置き、既存の頭部コリジョンで確定ヘッドショット。
      const fb = enemyFootBox(snapEnemy);
      const hx = fb.footX;
      const hy = fb.footY - fb.boxH * 0.83;
      const size = 16;
      get().addProjectile({
        id: `proj-phill-${now}`,
        x: hx - size / 2,
        y: hy - size / 2,
        width: size, height: size, speed: 0,
        damage: weapon.damage,
        direction: { x: 0, y: -1 },
        weaponType: 'phill-bullet',
        weaponKey: weapon.key,
        duration: 60, createdAt: now,
        passthrough: false, hitEnemies: [], hostile: false, reflected: false, crit: false,
      });
      get().spawnRing(hx, hy, 4, 18, 'rgba(52,211,153,0.95)', 2, 220); // 緑=ヘッドショット
    } else {
      // それ以外は通常通り射撃(レティクル方向へ弾を飛ばす)。
      const hasAim = Math.hypot(player.aimX, player.aimY) > 0.001;
      const dirx = hasAim ? player.aimX : (player.lastDirection?.x ?? 1);
      const diry = hasAim ? player.aimY : (player.lastDirection?.y ?? 0);
      const dl = Math.max(0.001, Math.hypot(dirx, diry));
      const size = weapon.projectileSize || 9;
      const speed = (weapon.projectileSpeed || 640) * 1.5;
      get().addProjectile({
        id: `proj-phill-${now}`,
        x: pcx - size / 2,
        y: pcy - size / 2,
        width: size, height: size, speed,
        damage: weapon.damage,
        direction: { x: dirx / dl, y: diry / dl },
        weaponType: 'phill-bullet',
        weaponKey: weapon.key,
        duration: 1400, createdAt: now,
        passthrough: false, hitEnemies: [], hostile: false, reflected: false, crit: false,
      });
    }
    const nextMag = Math.max(0, (weapon.magazine ?? 0) - 1);
    set(state => ({ player: { ...state.player, weapons: state.player.weapons.map(w => w.id === weapon.id ? { ...w, lastFired: now, magazine: nextMag } : w) } }));
    if (nextMag <= 0) get().autoSwitchIfDry(); // 空なら既存経路でリロード
  },

  selectUpgrade: (upgrade) => {
    set(state => {
      const { player } = state;

      if (upgrade.type === 'subWeapon' && upgrade.subWeaponKey) {
        const nextPlayer = applySubWeaponCard(player, upgrade.subWeaponKey, upgrade.level);
        const sageUnlock = maybeUnlockSageStone(nextPlayer, state.unlockedShopSkillCards);
        return {
          player: nextPlayer,
          ...(sageUnlock ? { unlockedShopSkillCards: sageUnlock } : {}),
          showUpgradeMenu: false,
          isPaused: false
        };
      }

      // 確定版 装備システム: レベルアップ報酬の3選択肢。即時反映・同スロット既存は入れ替え(破棄)。
      if (upgrade.type === 'equipment' && upgrade.equipDefId) {
        return { player: equipDefOnPlayer(player, upgrade.equipDefId), showUpgradeMenu: false, isPaused: false };
      }
      if (upgrade.type === 'scrap') {
        const gain = upgrade.level > 0 ? upgrade.level : 50;
        return { player: { ...player, straps: player.straps + gain }, showUpgradeMenu: false, isPaused: false };
      }
      if (upgrade.type === 'heal') {
        const healed = Math.min(player.maxHealth, player.health + Math.round(player.maxHealth * 0.30));
        return { player: { ...player, health: healed }, showUpgradeMenu: false, isPaused: false };
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
            updatedPlayer.speed = Math.round(updatedPlayer.speed * 1.10);
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
            // 装填数アップ — マガジン +20%(最低+1)。合計上限は取得回数(CAP=5)で +100% に収まる。
            // magBonus は全銃共通のフラット加算。代表マガジン(最大の銃)を基準に増分を決める。
            const gunMags = updatedPlayer.weapons
              .filter(w => w.magSize != null)
              .map(w => w.magSize as number);
            const repBase = gunMags.length ? Math.max(...gunMags) : 5;
            const inc = Math.max(1, Math.round(repBase * 0.2));
            updatedPlayer.magBonus += inc;
            const bonus = updatedPlayer.magBonus;
            updatedPlayer.weapons = updatedPlayer.weapons.map(w =>
              w.magSize != null
                ? { ...w, magazine: Math.min((w.magazine ?? 0) + inc, w.magSize + bonus) }
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
          case 'stunDuration':
            // 気絶時間アップ — 敵の気絶(フィニッシュ受付)時間 +20%。
            updatedPlayer.stunDurationMult += 0.20;
            break;
          case 'ammoDrop':
            // 弾薬ドロップ率アップ — ドロップ率に +10%(加算)。
            updatedPlayer.ammoDropBonus += 0.10;
            break;
          case 'scrapGain':
            // スクラップ獲得数アップ — スクラップ獲得 +30%。
            updatedPlayer.scrapMult += 0.30;
            break;
          // 'area' / 'duration' are no longer offered (no area weapons), but
          // keep harmless no-op cases for type completeness.
          case 'area':
          case 'duration':
            break;
        }
        // 個別上限の管理用に取得回数を加算。
        updatedPlayer.passiveCounts = {
          ...updatedPlayer.passiveCounts,
          [upgrade.passiveType]: (updatedPlayer.passiveCounts?.[upgrade.passiveType] ?? 0) + 1,
        };
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
    // バンクしたEXPがまだレベル分あれば、次のレベルアップ(メニュー)へ連鎖。ダンス中は保留のまま。
    if (!get().rhythm.active) {
      const p = get().player;
      if (p.experience >= p.experienceToNextLevel) get().levelUp();
    }
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
    set(state => {
      // スキル: タイムキーパー = サブCDのΔ(残り時間)を ×0.7。CDは gameTime 基準。
      const mult = skillCooldownMult(state.player);
      const delta = readyAt - state.gameTime;
      const effReadyAt = mult !== 1 && delta > 0 ? state.gameTime + delta * mult : readyAt;
      return {
        player: {
          ...state.player,
          subWeaponCooldowns: {
            ...state.player.subWeaponCooldowns,
            [key]: effReadyAt
          }
        }
      };
    });
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
      if (key === 'ammo-phill' || ammoType === 'phill') { // 研究所: 商人はPHILL弾のみ販売
        return spend(SHOP_AMMO_COST, {
          ammoPhill: Math.min(AMMO_MAX.phill, state.player.ammoPhill + state.ammoPickupAmounts.phill)
        });
      }
      if (key === 'buy-phill') { // 研究所(lab テーマ): 武器商人がPHILL銃を無料配布(1挺・所持済みなら無効)
        if (state.player.weapons.some(w => !w.isMelee && w.category === 'phill')) return {};
        const phill = createWeapon('phill-revolver');
        purchased = true;
        return {
          player: {
            ...state.player,
            weapons: [...state.player.weapons, phill],
            activeWeaponId: phill.id, // 入手したら即装備に切り替え
            ammoPhill: Math.max(state.player.ammoPhill, AMMO_INITIAL.phill),
          },
        };
      }
      if (key === 'medkit') {
        if (state.player.health >= state.player.maxHealth) return {};
        return spend(SHOP_MEDKIT_COST, {
          health: Math.min(state.player.maxHealth, state.player.health + Math.round(state.player.maxHealth * HEAL_FRACTION))
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
      const result = spend(cost, applySubWeaponCard(state.player, subWeaponKey));
      if ('player' in result && result.player) {
        const sageUnlock = maybeUnlockSageStone(result.player as Player, state.unlockedShopSkillCards);
        if (sageUnlock) return { ...result, unlockedShopSkillCards: sageUnlock };
      }
      return result;
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
      const cost = key === 'dog' ? SHOP_DOG_COST : key === 'katana' ? SHOP_KATANA_COST : key === 'whip' ? SHOP_WHIP_COST : key === 'alchemy' ? SHOP_ALCHEMY_COST : key === 'turret' ? SHOP_TURRET_COST : key === 'shijin' ? SHOP_SHIJIN_COST : key === 'sage-stone' ? SHOP_SAGE_STONE_COST : SHOP_CLASS_SKILL_COST;
      if (state.player.straps < cost) return {};
      purchased = true;
      const nextPlayer = {
        ...applySubWeaponCard(state.player, key),
        straps: state.player.straps - cost
      };
      // 錬金術がLv3に達したら賢者の石を商人在庫へ解禁(村雨と同じ仕組み)。
      const sageUnlock = maybeUnlockSageStone(nextPlayer, state.unlockedShopSkillCards);
      return {
        player: nextPlayer,
        ...(sageUnlock ? { unlockedShopSkillCards: sageUnlock } : {}),
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
      swipeDirection: null,
      swipeStrength: 1
    });
  },

  closeShop: () => {
    set(state => ({
      showShopMenu: false,
      isPaused: false,
      shopReopenAt: state.gameTime + MERCHANT_REOPEN_DELAY_MS
    }));
  },

  // 商人「帰還」: 任意撤収。スコアは計上(リザルトで算出)、クリアボーナス/進行は無し、
  // 装備は持ち帰り可(=死亡ではないのでロストしない)。Game.tsx が gameReturned を監視して onReturn を呼ぶ。
  returnToBase: () => {
    set({ gameReturned: true, showShopMenu: false, isPaused: false });
  },

  openEventQuest: () => {
    set({
      showEventQuestMenu: true,
      isPaused: true,
      touchActive: false,
      swipeDirection: null,
      swipeStrength: 1
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

      // ジャンプ攻撃で敵が空中(aiPhase==='jump')の間は無敵。被弾もヒット表示もしない。
      // 溜め(crouch)・着地後(recover)は通常どおり被弾する(空中だけ無敵)。
      if (enemy.aiPhase === 'jump') return { enemies };

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
          // ただし囲い系イベントのミニボス(fromEvent)は finale ではないので除外。
          gameWon: state.gameWon || (enemy.type === 'giantbat' && !enemy.fromEvent)
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
    let pumpkinLanded = false; // パンプキン着地を検出して set 後に画面揺れを出す(set内でのネスト発火回避)
    const pumpkinBlasts: { x: number; y: number; radius: number; damage: number; enemyId: string }[] = []; // 着地爆発イベント
    const shieldBlocks: { x: number; y: number; kind: 'jump' | 'dash' }[] = []; // シールドで防いだ瞬間の接触点(FX/SE用)
    const punisherHits: string[] = []; // パニッシャー: 巻き込んだ敵の id(set 後に近接半分ダメージを適用)
    let punisherDmg = 0;               // 近接ダメージの半分(set 内で算出)
    set(state => {
      const { enemies, player, gameTime, breakableProps, summons, rescueSurvivors } = state;
      const solidProps = breakableProps.filter(p => p.type !== 'mine' && p.type !== 'uv-bar');
      const now = Date.now();
      const pcx = player.x + player.width / 2;
      const pcy = player.y + player.height / 2;
      const indoor = state.indoorMode;
      const openDoorIds = indoor ? state.labDoors.filter(d => d.open).map(d => d.id) : [];
      const indoorWalls = indoor ? [...labBlockingWalls(openDoorIds), ...state.labProps.map(p => p.rect)] : [];
      const labTheme = state.stageTheme === 'lab'; // 研究所スキンは木を出さない=木の当たり判定もスキップ。
      // 設置型シールドの矩形(ジャンプ攻撃が当たると攻撃キャンセル=その場に落ちる、に使う)。
      const shieldRects = state.projectiles
        .filter(p => p.weaponType === 'shield')
        .map(p => ({ x: p.x, y: p.y, width: p.width, height: p.height }));
      // 研究所スキンの壁オブジェクト(区画生成)。プレイヤー周辺1ビューポート分を1回だけ問い合わせて使い回す
      // (敵は湧き=ビューポート端〜、遠方はカリングされるのでこの範囲で十分)。移動/視線の両方に使用。
      const labWallRects = labTheme
        ? labWallsInRegion(pcx - state.gameBounds.width, pcy - state.gameBounds.height, pcx + state.gameBounds.width, pcy + state.gameBounds.height).map(wallRect)
        : [];
      // 視線/移動の遮蔽物: 屋内=lab壁 / 研究所スキン=壁オブジェクト / 森=なし。
      const losWalls = indoor ? indoorWalls : labWallRects;

      const updatedEnemies = enemies.map(enemy => {
        // 衝突解決して移動先を返す(各AIで共用)。屋内は labMap の壁、屋外は木/松明+壁(研究所スキンは壁のみ)。
        const resolveMove = (nx: number, ny: number) => {
          if (indoor) return resolveAabb({ x: nx, y: ny, width: enemy.width, height: enemy.height }, indoorWalls);
          const tr = labTheme ? { x: nx, y: ny } : resolveTreeCollision({ x: nx, y: ny, width: enemy.width, height: enemy.height });
          const torchR = resolveTorchCollision({ x: tr.x, y: tr.y, width: enemy.width, height: enemy.height }, solidProps);
          return labWallRects.length
            ? resolveAabb({ x: torchR.x, y: torchR.y, width: enemy.width, height: enemy.height }, labWallRects)
            : torchR;
        };
        // 攻撃モーションを「全う」する不可中断フェーズ: ジャンプ中(空中)とダッシュ突進中。
        // この間は通常の気絶/ノックバック/リフトを受け付けず、モーションを完了する(ダメージは別経路で受ける)。
        // 溜め(crouch)/ダッシュ溜め(windup)は committed ではない=気絶/ノックバックで中断できる(社長指示)。
        // カウンター(パリィ)は aiPhase を解除してから弾くので、この committed ガードに引っかからず機能する。
        const committed = enemy.aiPhase === 'jump' || enemy.aiPhase === 'charge';

        // Knockback overrides chase AI: while it's active, slide outward
        // with linearly-decaying velocity instead of seeking the player.
        if (!committed && enemy.knockbackUntil && now < enemy.knockbackUntil) {
          const remaining = enemy.knockbackUntil - now;
          const decay = Math.max(0, remaining / KNOCKBACK_DURATION); // 1 → 0
          const kb = resolveMove(
            enemy.x + (enemy.knockbackVx ?? 0) * decay * deltaTime,
            enemy.y + (enemy.knockbackVy ?? 0) * decay * deltaTime,
          );
          return { ...enemy, x: kb.x, y: kb.y };
        }

        // Bosses pop up briefly when they take melee finisher-grade damage;
        // while airborne they should read as caught, not still advancing.
        if (!committed && enemy.liftUntil !== undefined && now < enemy.liftUntil) {
          return { ...enemy, vx: 0, vy: 0 };
        }

        // Stun (from a crit) freezes the enemy in place — it's a sitting duck
        // for a melee finisher. gameTime-based so pauses don't cheat the timer.
        if (!committed && enemy.stunUntil !== undefined && gameTime < enemy.stunUntil) {
          // 気絶したら、突進/ジャンプ等の特殊挙動(aiPhase)を必ずリセットして「着地・静止」させる。
          // パンプキンのジャンプ準備/ジャンプ中、werewolf の溜め/突進、今後の特殊敵も aiPhase 基準で同様にキャンセル。
          if (enemy.aiPhase !== undefined) {
            return {
              ...enemy, vx: 0, vy: 0,
              aiPhase: undefined, aiPhaseUntil: undefined, aiStartedAt: undefined,
              aiTargetX: undefined, aiTargetY: undefined, aiFromX: undefined, aiFromY: undefined,
              aiReadyAt: enemy.stunUntil + 300, // 気絶明け後しばらくは特殊行動を再発動しない
            };
          }
          return enemy;
        }

        // Trap root freezes movement only. It deliberately does not share the
        // crit stun state, so rooted enemies are not melee-finisher targets.
        if (enemy.rootUntil !== undefined && gameTime < enemy.rootUntil) {
          return { ...enemy, vx: 0, vy: 0 };
        }

        // 屋内: 休眠敵は静止。索敵範囲(aggroRange×2=二倍)内 かつ 壁越しでない 時だけ起床(社長指示)。
        if (enemy.dormant) {
          const ecx2 = enemy.x + enemy.width / 2;
          const ecy2 = enemy.y + enemy.height / 2;
          const ddx = pcx - ecx2, ddy = pcy - ecy2;
          const ar = (enemy.aggroRange ?? 200) * 1; // 索敵範囲(PHILL運用に合わせ従来の半分=base等倍)
          const inRange = ddx * ddx + ddy * ddy <= ar * ar;
          const seen = inRange && !(losWalls.length > 0 && segmentBlocked(pcx, pcy, ecx2, ecy2, losWalls)); // 壁越しは見つからない
          if (!seen) return { ...enemy, vx: 0, vy: 0 };
          return { ...enemy, dormant: false, vx: 0, vy: 0 };
        }

        // ダッシュ(突進)AI: 溜め中に「赤ライン」で移動先(直線距離)を予告→確定した狙い点へ3倍速で直進(曲がらない)。
        // 犬型(werewolf)・研究所Lv2(lab-zombie-2)・ジャイアントバット共通。狙い点は溜め開始時に確定(=赤ラインの終点)。
        // 発動トリガーは werewolf/lab-zombie-2 は射程ベース、giantbat は専用スケジューラ(下)が起動する。
        const isDashType = enemy.type === 'werewolf' || enemy.type === 'lab-zombie-2' || enemy.type === 'giantbat';
        if (isDashType) {
          const ecx = enemy.x + enemy.width / 2;
          const ecy = enemy.y + enemy.height / 2;
          const dist = Math.hypot(pcx - ecx, pcy - ecy);
          if (enemy.aiPhase === 'charge') {
            const tx = enemy.aiTargetX ?? pcx;
            const ty = enemy.aiTargetY ?? pcy;
            const cdx = tx - ecx, cdy = ty - ecy;
            const cdist = Math.hypot(cdx, cdy);
            if (cdist < 12 || gameTime >= (enemy.aiPhaseUntil ?? 0)) {
              return { ...enemy, vx: 0, vy: 0, aiPhase: undefined, aiReadyAt: gameTime + WEREWOLF_COOLDOWN_MS };
            }
            const cs = enemy.speed * WEREWOLF_CHARGE_SPEED_MULT; // 3倍速・直進(目標固定なので曲がらない)
            const cvx = (cdx / cdist) * cs, cvy = (cdy / cdist) * cs;
            const moved = resolveMove(enemy.x + cvx * deltaTime, enemy.y + cvy * deltaTime);
            // 盾にぶつかったら突進をキャンセル(その場で停止・クールダウンへ)。
            if (shieldRects.length > 0 &&
                shieldRects.some(s => rectsOverlap({ x: moved.x, y: moved.y, width: enemy.width, height: enemy.height }, s))) {
              shieldBlocks.push({ x: moved.x + enemy.width / 2, y: moved.y + enemy.height / 2, kind: 'dash' });
              return { ...enemy, x: moved.x, y: moved.y, vx: 0, vy: 0, aiPhase: undefined, aiReadyAt: gameTime + WEREWOLF_COOLDOWN_MS };
            }
            return { ...enemy, vx: cvx, vy: cvy, x: moved.x, y: moved.y };
          }
          if (enemy.aiPhase === 'windup') {
            // 溜め中は静止して赤ライン予告(描画側)。狙い点は溜め開始時に確定済み。
            if (gameTime >= (enemy.aiPhaseUntil ?? 0)) {
              return { ...enemy, aiPhase: 'charge', aiPhaseUntil: gameTime + WEREWOLF_CHARGE_MAX_MS, vx: 0, vy: 0 };
            }
            return { ...enemy, vx: 0, vy: 0 };
          }
          if (enemy.type !== 'giantbat' && dist <= WEREWOLF_TRIGGER_RANGE && dist > 12 && gameTime >= (enemy.aiReadyAt ?? 0)) {
            // 溜め開始時に狙い点を確定(=赤ラインの終点)。
            // 突進距離 = プレイヤーまでの距離 + 80px(プレイヤーの少し先で止まる。社長指示)。
            const reach = dist + DASH_OVERSHOOT_PX;
            return { ...enemy, aiPhase: 'windup', aiPhaseUntil: gameTime + WEREWOLF_WINDUP_MS, aiFromX: enemy.x, aiFromY: enemy.y, aiTargetX: ecx + ((pcx - ecx) / dist) * reach, aiTargetY: ecy + ((pcy - ecy) / dist) * reach, vx: 0, vy: 0 };
          }
          // それ以外は通常チェイス(下へフォールスルー)。
        }

        // パンプキン(pumpkin)ジャンプ攻撃AI: 少し外で縮み溜め(3秒)→1秒でその時のプレイヤー位置へ着地→1秒停止。
        // 研究所Lv3(lab-zombie-3)もパンプキンと同じ挙動。ジャイアントバットも同じジャンプ着地攻撃を流用(社長指示)。
        // トリガーは pumpkin/lab-zombie-3 は射程ベース、giantbat は専用スケジューラ(下)が起動する。
        if (enemy.type === 'pumpkin' || enemy.type === 'lab-zombie-3' || enemy.type === 'giantbat') {
          const ecx = enemy.x + enemy.width / 2;
          const ecy = enemy.y + enemy.height / 2;
          const dist = Math.hypot(pcx - ecx, pcy - ecy);
          if (enemy.aiPhase === 'crouch') {
            if (gameTime >= (enemy.aiPhaseUntil ?? 0)) {
              // 溜め終了 → ジャンプ開始(この瞬間のプレイヤー位置へ。アークは描画側)。
              return {
                ...enemy, aiPhase: 'jump', vx: 0, vy: 0,
                aiFromX: enemy.x, aiFromY: enemy.y,
                aiTargetX: pcx - enemy.width / 2, aiTargetY: pcy - enemy.height / 2,
                aiStartedAt: gameTime, aiPhaseUntil: gameTime + PUMPKIN_JUMP_MS,
              };
            }
            return { ...enemy, vx: 0, vy: 0 }; // 溜め中は静止(縮みは描画側)
          }
          if (enemy.aiPhase === 'jump') {
            const t = Math.max(0, Math.min(1, (gameTime - (enemy.aiStartedAt ?? gameTime)) / PUMPKIN_JUMP_MS));
            const fx = enemy.aiFromX ?? enemy.x, fy = enemy.aiFromY ?? enemy.y;
            const tx = enemy.aiTargetX ?? enemy.x, ty = enemy.aiTargetY ?? enemy.y;
            const nx = fx + (tx - fx) * t;
            const ny = fy + (ty - fy) * t;
            // 盾にぶつかったらジャンプ攻撃をキャンセルして、その場に落ちるだけ(爆発なし)。
            // 接触点を shieldBlocks に積んで、useGameLoop 側で衝突FX+SE を出す。描画は drawEnemy が
            // 空中→着地のホップ高を滑らかに 0 まで補間して「シームレスに落ちる」よう見せる(描画のみ)。
            if (shieldRects.length > 0 &&
                shieldRects.some(s => rectsOverlap({ x: nx, y: ny, width: enemy.width, height: enemy.height }, s))) {
              shieldBlocks.push({ x: nx + enemy.width / 2, y: ny + enemy.height / 2, kind: 'jump' });
              return { ...enemy, x: nx, y: ny, vx: 0, vy: 0, aiPhase: 'recover', aiStartedAt: gameTime, aiPhaseUntil: gameTime + PUMPKIN_RECOVER_MS };
            }
            if (t >= 1) {
              pumpkinLanded = true; // 着地 → set 後に画面揺れ
              // 着地爆発(範囲狭め)。被弾判定/FX は useGameLoop が pumpkinBlasts を消化して行う。
              pumpkinBlasts.push({ x: tx + enemy.width / 2, y: ty + enemy.height / 2, radius: PUMPKIN_EXPLOSION_RADIUS, damage: enemy.damage, enemyId: enemy.id });
              return { ...enemy, x: tx, y: ty, vx: 0, vy: 0, aiPhase: 'recover', aiPhaseUntil: gameTime + PUMPKIN_RECOVER_MS };
            }
            return { ...enemy, x: nx, y: ny, vx: 0, vy: 0 }; // 空中は障害物を飛び越える(衝突無視)
          }
          if (enemy.aiPhase === 'recover') {
            if (gameTime >= (enemy.aiPhaseUntil ?? 0)) {
              return { ...enemy, vx: 0, vy: 0, aiPhase: undefined, aiReadyAt: gameTime + PUMPKIN_COOLDOWN_MS };
            }
            return { ...enemy, vx: 0, vy: 0 }; // 着地後1秒停止
          }
          if (enemy.type !== 'giantbat' && dist <= PUMPKIN_TRIGGER_RANGE && dist > 12 && gameTime >= (enemy.aiReadyAt ?? 0)) {
            return { ...enemy, aiPhase: 'crouch', aiPhaseUntil: gameTime + PUMPKIN_CROUCH_MS, vx: 0, vy: 0 };
          }
          // それ以外は通常チェイス(下へフォールスルー)。
        }

        // ジャイアントバットの行動スケジューラ: 待機中(aiPhase無し)に、ジャンプ(約5秒CD)/ダッシュ(約7秒CD)を
        // それぞれのCDが明けたらランダムに発動。弾(約3秒CD)は fire profile 側が別系統で処理。
        if (enemy.type === 'giantbat' && !enemy.aiPhase) {
          // 出現直後は少し待ってから行動(即突進しない)。初回だけ初期CDをセット。
          if (enemy.gbDashReadyAt === undefined) {
            return { ...enemy, vx: 0, vy: 0, gbDashReadyAt: gameTime + 2000, gbJumpReadyAt: gameTime + 3500 };
          }
          const ecx = enemy.x + enemy.width / 2, ecy = enemy.y + enemy.height / 2;
          const dist = Math.hypot(pcx - ecx, pcy - ecy);
          const opts: ('dash' | 'jump')[] = [];
          if (gameTime >= (enemy.gbDashReadyAt ?? 0) && dist > 80 && dist < 1000) opts.push('dash');
          if (gameTime >= (enemy.gbJumpReadyAt ?? 0) && dist > 40 && dist < 700) opts.push('jump');
          if (opts.length > 0) {
            const pick = opts[Math.floor(Math.random() * opts.length)];
            const jitter = (ms: number) => ms * (0.8 + Math.random() * 0.4);
            if (pick === 'dash') {
              // 突進距離を2倍に(giantbat も同様にオーバーシュート)。
              return { ...enemy, aiPhase: 'windup', aiPhaseUntil: gameTime + WEREWOLF_WINDUP_MS, aiFromX: enemy.x, aiFromY: enemy.y, aiTargetX: 2 * pcx - (enemy.x + enemy.width / 2), aiTargetY: 2 * pcy - (enemy.y + enemy.height / 2), vx: 0, vy: 0, gbDashReadyAt: gameTime + jitter(GIANTBAT_DASH_CD_MS) };
            }
            return { ...enemy, aiPhase: 'crouch', aiPhaseUntil: gameTime + PUMPKIN_CROUCH_MS, vx: 0, vy: 0, gbJumpReadyAt: gameTime + jitter(GIANTBAT_JUMP_CD_MS) };
          }
          // CD中はフォールスルーして通常チェイス。
        }

        // Plants are nearly stationary — they shuffle slightly toward the
        // player but mostly hold ground and spit seeds. Everything else
        // does the standard VS straight-line chase, but with inertia: the
        // chase velocity eases toward the heading so enemies curve into turns
        // (~0.3s) rather than snapping to face the player.
        // 錬金術: aggro範囲内に通常召喚がいればそれを、いなければプレイヤーを狙う(中心同士)。
        // 救助イベントの攻撃者: escortTarget の survivor を狙う(全体AIは無改修)。割り当て先が死んでいたら
        // 最寄りの生存NPCへ乗り換える(全滅していればプレイヤーへフォールバック)。
        let tgt = resolveEnemyTarget(enemy, player, summons, ALCHEMY_AGGRO_RANGE);
        if (enemy.escortTarget && rescueSurvivors.length > 0) {
          let sv = rescueSurvivors.find(s => s.id === enemy.escortTarget);
          if (!sv) {
            const ex = enemy.x + enemy.width / 2, ey = enemy.y + enemy.height / 2;
            let best = Infinity;
            for (const s of rescueSurvivors) {
              const d2 = (s.x + s.width / 2 - ex) ** 2 + (s.y + s.height / 2 - ey) ** 2;
              if (d2 < best) { best = d2; sv = s; }
            }
          }
          if (sv) tgt = { x: sv.x + sv.width / 2, y: sv.y + sv.height / 2, isSummon: false };
        }
        const dx = tgt.x - (enemy.x + enemy.width / 2);
        const dy = tgt.y - (enemy.y + enemy.height / 2);
        const distance = Math.max(0.001, Math.sqrt(dx * dx + dy * dy));
        const speed = enemy.type === 'plant' ? enemy.speed * 0.25 : enemy.speed;
        const tvx = (dx / distance) * speed;
        const tvy = (dy / distance) * speed;

        const alpha = inertiaAlpha(deltaTime, ENEMY_INERTIA_TAU);
        const vx = (enemy.vx ?? tvx) + (tvx - (enemy.vx ?? tvx)) * alpha;
        const vy = (enemy.vy ?? tvy) + (tvy - (enemy.vy ?? tvy)) * alpha;

        const moved = resolveMove(enemy.x + vx * deltaTime, enemy.y + vy * deltaTime);

        return { ...enemy, vx, vy, x: moved.x, y: moved.y };
      });

      // スキル: パニッシャー = ノックバック中の敵が他の敵に当たると巻き込む(同方向へ2倍ノックバック＋近接ダメージの半分)。
      // ただし「巻き込まれて」飛んだ敵(punisherHopped)は movers から除外=連鎖しない(1次まで・社長指示)。
      let finalEnemies = updatedEnemies;
      if (hasSkill(player, 'punisher')) {
        const melee = player.weapons.find(w => w.isMelee);
        punisherDmg = Math.max(1, Math.round((melee?.damage ?? 6) * strikerMeleeMult(player) * 0.5)); // 近接の半分
        const movers = updatedEnemies.filter(e =>
          e.knockbackUntil !== undefined && now < e.knockbackUntil && !e.punisherHopped &&
          Math.hypot(e.knockbackVx ?? 0, e.knockbackVy ?? 0) > 30);
        finalEnemies = updatedEnemies.map(b => {
          const bKbActive = b.knockbackUntil !== undefined && now < b.knockbackUntil;
          // ノックバックが切れたら hop 印を解除(次に直接ノックバックされたら再び巻き込み元になれる)。
          const cleared = (b.punisherHopped && !bKbActive) ? { ...b, punisherHopped: false } : b;
          if (cleared.type === 'reaper' || bKbActive) return cleared; // KB中(被弾側/連鎖元)は新規付与しない
          for (const a of movers) {
            if (a.id === cleared.id) continue;
            if (!rectsOverlap(
              { x: a.x, y: a.y, width: a.width, height: a.height },
              { x: cleared.x, y: cleared.y, width: cleared.width, height: cleared.height },
            )) continue;
            const d = Math.max(0.001, Math.hypot(a.knockbackVx ?? 0, a.knockbackVy ?? 0));
            punisherHits.push(cleared.id); // ダメージは set 後に damageEnemy で適用(死亡処理を正規経路に)
            return {
              ...cleared,
              punisherHopped: true, // 連鎖防止の印
              knockbackVx: ((a.knockbackVx ?? 0) / d) * KNOCKBACK_SPEED * 2,
              knockbackVy: ((a.knockbackVy ?? 0) / d) * KNOCKBACK_SPEED * 2,
              knockbackUntil: now + KNOCKBACK_DURATION,
            };
          }
          return cleared;
        });
      }

      // 救助サークル内には通常(アンビエント)敵は入れない=円の外周へ押し出す。専用攻撃者(fromEvent)は
      // 救助対象を脅かす役なので中に入ってOK(社長指示「敵は入ってこない」=通常敵)。
      const rescueEv = state.activeEvent;
      if (rescueEv && rescueEv.kind === 'rescue') {
        finalEnemies = finalEnemies.map(e => {
          if (e.fromEvent) return e;
          const ecx = e.x + e.width / 2, ecy = e.y + e.height / 2;
          const dx = ecx - rescueEv.x, dy = ecy - rescueEv.y;
          const dist = Math.hypot(dx, dy);
          if (dist >= rescueEv.radius || dist < 0.001) return e;
          const k = rescueEv.radius / dist; // 中心を外周ちょうどへ押し出す
          return { ...e, x: rescueEv.x + dx * k - e.width / 2, y: rescueEv.y + dy * k - e.height / 2 };
        });
      }

      return { enemies: finalEnemies, pumpkinBlasts, shieldBlocks };
    });
    if (pumpkinLanded) get().triggerShake(PUMPKIN_LAND_SHAKE_MS, PUMPKIN_LAND_SHAKE_MAG);
    // パニッシャーの巻き込みダメージ(近接の半分)を正規経路で適用(死亡処理/演出込み)。
    if (punisherHits.length > 0 && punisherDmg > 0) {
      for (const id of punisherHits) {
        const e = get().enemies.find(en => en.id === id);
        if (!e) continue;
        get().damageEnemy(id, punisherDmg);
        get().spawnDamageNumber(e.x + e.width / 2, e.y, punisherDmg);
      }
    }
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
  knockbackEnemy: (id, dirX, dirY, multiplier = 1, maxStrength = 3) => {
    const now = Date.now();
    const strength = Math.max(0, Math.min(maxStrength, multiplier));
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

  // 四神舞のタップ/フリックでカウンター(敵弾反射)窓を開く。窓が開いている間に当たった敵弾は
  // ループ側(useGameLoop)で反射される。クールダウンは見ない(ダンス中は拍ごとに自由に張れる)。
  openCounterWindow: () => {
    const now = Date.now();
    set(state => ({
      player: { ...state.player, counterWindowEnd: now + COUNTER_WINDOW },
    }));
  },

  // スキル: スラッシャーの追撃受付窓(gameTime ms)を設定。
  setSlasherWindow: (until) => {
    set(state => ({ player: { ...state.player, slasherWindowUntil: until } }));
  },

  markCastleBossSpawned: () => {
    set(state => ({
      castleEvent: {
        ...state.castleEvent,
        bossSpawned: true,
        bossSummonAt: Date.now(), // 魔法陣演出(錬金と同じ)の開始時刻
      },
    }));
  },

  // 囲い系イベント開始: activeEvent をセットし、囲い周辺(半径×1.5)内の通常敵を一掃する。
  // ボス級(reaper/giantbat/pumpkin)と屋内固定敵(fixed)は除外(=消さない)。イベント敵の湧きは
  // 呼び出し側(useGameLoop)が beginArenaEvent の直後に addEnemy(fromEvent) で行う。
  beginArenaEvent: (event) => {
    set(state => {
      const clearR2 = (event.radius * 1.5) ** 2;
      const kept = state.enemies.filter(e => {
        if (e.type === 'reaper' || e.type === 'giantbat' || e.type === 'pumpkin' || e.fixed) return true;
        const ecx = e.x + e.width / 2;
        const ecy = e.y + e.height / 2;
        return (ecx - event.x) ** 2 + (ecy - event.y) ** 2 > clearR2; // 範囲外だけ残す
      });
      return { activeEvent: event, enemies: kept };
    });
  },

  // 囲い系イベント終了: 拘束を解除し、残存イベント敵(時間切れ時の取りこぼし)を撤去して通常へ戻す。
  // 救助イベントの守る対象NPC(rescueSurvivors)も後片付け(撤収)。
  endArenaEvent: () => {
    set(state => ({
      activeEvent: null,
      enemies: state.enemies.filter(e => !e.fromEvent),
      rescueSurvivors: [],
    }));
  },

  // 救助ホールドイベント開始: 円中央付近に survivor3人を配置し、各人に攻撃者を割り当てて湧かせる。
  // beginArenaEvent と同様に円周辺の通常敵を一掃(ボス級/固定敵は残す)。プレイヤーは閉じ込めない。
  beginRescueEvent: (event) => {
    const comp = pickRescueComposition();
    const now = Date.now();
    const sz = RESCUE_SURVIVOR_SIZE;
    const survivors: RescueSurvivor[] = comp.map((m, i) => {
      const ang = (i / comp.length) * Math.PI * 2 + Math.random() * 0.4;
      const dist = RESCUE_RADIUS * (0.18 + Math.random() * 0.32); // 中央寄りに散らす
      const cx = event.x + Math.cos(ang) * dist;
      const cy = event.y + Math.sin(ang) * dist;
      const hp = m.subtype === 'shooter' ? RESCUE_SHOOTER_HP : RESCUE_CIVILIAN_HP;
      return {
        id: `rescue-${now}-${i}`,
        x: cx - sz / 2, y: cy - sz / 2, width: sz, height: sz, vx: 0, vy: 0,
        health: hp, maxHealth: hp, subtype: m.subtype, gender: m.gender,
      };
    });
    set(state => {
      const clearR2 = (event.radius * 1.5) ** 2;
      const kept = state.enemies.filter(e => {
        if (e.type === 'reaper' || e.type === 'giantbat' || e.type === 'pumpkin' || e.fixed) return true;
        const ecx = e.x + e.width / 2, ecy = e.y + e.height / 2;
        return (ecx - event.x) ** 2 + (ecy - event.y) ** 2 > clearR2;
      });
      return { activeEvent: { ...event, kind: 'rescue', holdMs: 0 }, enemies: kept, rescueSurvivors: survivors };
    });
    // 初期攻撃者を survivor へ割り当てて湧かせる(以後は useGameLoop が補充)。
    for (let i = 0; i < RESCUE_ATTACKERS; i++) {
      const tgt = survivors[i % survivors.length];
      const ang = Math.random() * Math.PI * 2;
      const bx = event.x + Math.cos(ang) * event.radius * 0.95;
      const by = event.y + Math.sin(ang) * event.radius * 0.95;
      const e = spawnEnemyAt('zombie', bx - 16, by - 16, get().gameTime);
      e.fromEvent = true;
      e.escortTarget = tgt.id;
      get().addEnemy(e);
    }
  },

  // 毎フレーム: NPCカイト移動・ホールドゲージ・攻撃者補充・shooter自衛射撃・敵接触ダメージ・勝敗判定。
  // useGameLoop からのみ呼ばれる(唯一のシム書き込み経路)。
  updateRescue: (deltaTime) => {
    const state = get();
    const ae = state.activeEvent;
    if (!ae || ae.kind !== 'rescue') return;
    const now = Date.now();
    // 救助成功アウトロ: 退場(走って外へ)を進め、OUTRO 経過で撤収。ハート/フェードは描画側。
    if (state.rescueSurvivors.length > 0 && state.rescueSurvivors[0].savedAt != null) {
      const out = state.rescueSurvivors.map(s => ({ ...s, x: s.x + s.vx * deltaTime, y: s.y + s.vy * deltaTime }));
      set({ rescueSurvivors: out });
      if (now - (state.rescueSurvivors[0].savedAt ?? now) >= RESCUE_OUTRO_MS) get().endArenaEvent();
      return;
    }
    const circle = { x: ae.x, y: ae.y, radius: ae.radius };
    const enemyCenters = state.enemies
      .filter(e => e.fromEvent)
      .map(e => ({ x: e.x + e.width / 2, y: e.y + e.height / 2 }));

    // NPCカイト移動 + 敵接触ダメージ + shooter自衛射撃
    const survivors = state.rescueSurvivors;
    const contactDamage: { id: string; amount: number }[] = [];
    const shooterShots: { x: number; y: number }[] = [];
    const moved: RescueSurvivor[] = survivors.map(s => {
      // 被弾パニック中(speedBoostUntil)は移動速度2倍。
      const spd = RESCUE_SURVIVOR_SPEED * (s.speedBoostUntil && now < s.speedBoostUntil ? RESCUE_HIT_SPEED_MULT : 1);
      const step = computeSurvivorStep(s, survivors, enemyCenters, circle, deltaTime, spd);
      let next: RescueSurvivor = { ...s, x: step.x, y: step.y, vx: step.vx, vy: step.vy };
      const scx = next.x + next.width / 2, scy = next.y + next.height / 2;
      // パニック走り中(被弾後2秒)は無敵=接触ダメージを受けない(社長指示)。
      const panicking = next.speedBoostUntil != null && now < next.speedBoostUntil;
      // 敵接触ダメージ(throttle 500ms)。被弾したらパニックで2秒スピード2倍。
      if (!panicking && now - (next.lastContactAt ?? 0) >= 500) {
        for (const e of state.enemies) {
          if (!e.fromEvent) continue;
          const ex = e.x + e.width / 2, ey = e.y + e.height / 2;
          if ((ex - scx) ** 2 + (ey - scy) ** 2 <= (24) ** 2) {
            contactDamage.push({ id: next.id, amount: Math.round(e.damage * 0.5) });
            next = { ...next, lastContactAt: now, helpUntil: now + 1200, speedBoostUntil: now + RESCUE_HIT_SPEED_BOOST_MS };
            break;
          }
        }
      }
      // shooter の控えめ自衛射撃(最寄り攻撃者へ。足止め程度)
      if (next.subtype === 'shooter' && now - (next.lastShotAt ?? 0) >= RESCUE_SHOOTER_INTERVAL_MS) {
        let nearestId: string | null = null; let nd2 = RESCUE_SHOOTER_RANGE * RESCUE_SHOOTER_RANGE;
        let tx = 0, ty = 0;
        for (const e of state.enemies) {
          if (!e.fromEvent) continue;
          const ex = e.x + e.width / 2, ey = e.y + e.height / 2;
          const d2 = (ex - scx) ** 2 + (ey - scy) ** 2;
          if (d2 <= nd2) { nd2 = d2; nearestId = e.id; tx = ex; ty = ey; }
        }
        if (nearestId) { contactDamage.push({ id: nearestId, amount: RESCUE_SHOOTER_DAMAGE }); shooterShots.push({ x: tx, y: ty }); next = { ...next, lastShotAt: now }; }
      }
      return next;
    });
    set({ rescueSurvivors: moved, ...(shooterShots.length > 0 ? { rescueShooterFxAt: now } : {}) });
    for (const c of contactDamage) {
      if (c.id.startsWith('rescue-')) get().damageRescueSurvivor(c.id, c.amount);
      else get().damageEnemy(c.id, c.amount);
    }
    for (const sh of shooterShots) get().spawnDamageNumber(sh.x, sh.y, RESCUE_SHOOTER_DAMAGE);

    const after = get();
    const alive = after.rescueSurvivors;
    // 失敗: 全員死亡
    if (alive.length === 0) { get().endArenaEvent(); return; }

    // ホールドゲージ: プレイヤー中心が円内なら加算(外なら保持)。
    const pcx = after.player.x + after.player.width / 2;
    const pcy = after.player.y + after.player.height / 2;
    const inside = (pcx - ae.x) ** 2 + (pcy - ae.y) ** 2 <= ae.radius * ae.radius;
    const holdMs = (ae.holdMs ?? 0) + (inside ? deltaTime * 1000 : 0);
    if (holdMs >= RESCUE_HOLD_NEED_MS) {
      // 成功報酬(社長指示・生存人数で決定): 価値=生存人数のトレジャー1個 ＋ スクラップ=生存人数×20。
      // どちらも worldDrop で撤収地点に出して拾わせる(端マーカー誘導を流用)。
      const saved = alive.length;
      get().addPickup({
        id: `rescue-treasure-${now}`, x: ae.x, y: ae.y,
        type: 'treasure', value: saved, variant: treasureVariantForValue(saved),
        worldDrop: true, scatterRadius: ae.radius * 0.5,
      });
      get().addPickup({
        id: `rescue-strap-${now}`, x: ae.x, y: ae.y,
        type: 'strap', value: saved * 20,
        worldDrop: true, scatterRadius: ae.radius * 0.5,
      });
      // 成功アウトロへ突入: 攻撃者退場、survivor はハート→フェードしつつ円の外へ走って退場(savedAt+外向き速度)。
      // クリア告知(発生バナーと同じ機構)=「〇人救助成功！」。
      set(state => ({
        enemies: state.enemies.filter(e => !e.fromEvent),
        rescueSurvivors: state.rescueSurvivors.map(s => {
          const a = Math.atan2((s.y + s.height / 2) - ae.y, (s.x + s.width / 2) - ae.x);
          const sp = RESCUE_SURVIVOR_SPEED * 2.4; // 走って退場
          return { ...s, savedAt: now, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp };
        }),
        eventBannerText: `${saved}人救助成功！`,
        eventBannerUntil: state.gameTime + 3500,
      }));
      get().spawnRing(ae.x, ae.y, ae.radius * 0.2, ae.radius, 'rgba(74,222,128,0.9)', 6, 700);
      return;
    }
    set({ activeEvent: { ...ae, holdMs } });
  },

  damageRescueSurvivor: (id, amount) => {
    set(state => ({
      rescueSurvivors: state.rescueSurvivors
        .map(s => s.id === id ? { ...s, health: Math.max(0, s.health - amount) } : s)
        .filter(s => s.health > 0),
    }));
  },

  // キャラ固有スキル ヘビーガンナー(warrior): 同一攻撃で2体以上に当てたら3秒バフをarm。
  // それ以外のキャラ/2体未満では何もしない(=set 抑止)。
  registerMultiHit: (count) => {
    const state = get();
    if (state.player.characterClass !== 'warrior' || count < 2) return;
    set(s => ({ player: { ...s.player, heavyGunnerExpBuffUntil: s.gameTime + 3000 } }));
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

  stickFireKnife: (id, enemyId, x, y, fuseMs) => {
    // 飛行中のナイフを敵に刺す。位置を命中点へ固定し、追従用に enemyId を保持。
    // duration を延長 & createdAt をリセットして、爆発前に寿命カリングで消えないようにする。
    const now = Date.now();
    set(state => ({
      projectiles: state.projectiles.map(p =>
        p.id === id
          ? { ...p, x, y, speed: 0, stuckToEnemyId: enemyId, isStuck: true, createdAt: now, duration: fuseMs + 600, explodeAt: now + fuseMs }
          : p
      )
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
      const { projectiles, player, gameBounds, breakableProps, castleEvent, camera } = state;
      const cullRadius = Math.max(gameBounds.width, gameBounds.height);
      const playerCX = player.x + player.width / 2;
      const playerCY = player.y + player.height / 2;
      const indoor = state.indoorMode;
      const indoorWalls = indoor ? [...labBlockingWalls(state.labDoors.filter(d => d.open).map(d => d.id)), ...state.labProps.map(p => p.rect)] : [];
      const labTheme = state.stageTheme === 'lab';
      const grenadeWallsFor = (p: Projectile) => {
        if (indoor) return indoorWalls; // 屋内は labMap の壁(+閉ドア)。木/トーチは無し。
        const cxp = p.x + p.width / 2, cyp = p.y + p.height / 2;
        if (labTheme) return [ // 研究所スキン: 壁オブジェクト＋遮蔽物プロップ
          ...labWallsInRegion(cxp - 260, cyp - 260, cxp + 260, cyp + 260).map(wallRect),
          ...labPropsInRegion(cxp - 260, cyp - 260, cxp + 260, cyp + 260).map(propRect),
        ];
        const pad = 260;
        const cx = p.x + p.width / 2;
        const cy = p.y + p.height / 2;
        const trunks = treesInRegion(cx - pad, cy - pad, cx + pad, cy + pad).map(trunkRect);
        const torches = breakableProps
          .filter(prop => prop.type === 'torch' && prop.health > 0)
          .map(torchRect);
        return [...trunks, ...torches, castleRect(castleEvent)];
      };
      // 弾が壁に当たったら消す(貫通させない)。全ステージ共通(屋内=lab壁 / 屋外=木/トーチ/城)。
      // 対象: 銃弾/敵弾 + 飛行中の発火ナイフ(刺さった後は除外)。grenade はバウンド、ブーメランは戻る(各々別処理)。
      const BULLET_TYPES = new Set(['handgun', 'shotgun', 'rifle', 'enemy_bolt']);
      const hitsWall = (p: Projectile): boolean => {
        const blockable = BULLET_TYPES.has(p.weaponType) || (p.weaponType === 'fire-knife-projectile' && !p.stuckToEnemyId);
        if (!blockable) return false;
        const walls = grenadeWallsFor(p);
        const rect = { x: p.x, y: p.y, width: p.width, height: p.height };
        return walls.some(w => rectsOverlap(rect, w));
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
          // Fire-knife: once stuck, follow the impaled enemy. If that enemy is
          // gone (died), hold the last position so the delayed AoE fires at the
          // death spot. In-flight knives fall through to normal linear motion.
          if (p.weaponType === 'fire-knife-projectile' && p.stuckToEnemyId) {
            const host = state.enemies.find(en => en.id === p.stuckToEnemyId);
            if (host) {
              return { ...p, x: host.x + host.width / 2 - p.width / 2, y: host.y + host.height / 2 - p.height / 2 };
            }
            return p;
          }
          // Drone-boomerang: out(直進貫通)→stop(その場で停止)→return(プレイヤー現在地へ)→done(消滅)。
          // 移動とフェーズ遷移はここ(純粋state)。ダメージは useGameLoop 側の専用パスで処理。
          if (p.weaponType === 'drone-boomerang-projectile') {
            const phase = p.boomPhase ?? 'out';
            if (phase === 'out') {
              const nx = p.x + p.direction.x * p.speed * deltaTime;
              const ny = p.y + p.direction.y * p.speed * deltaTime;
              const ncx = nx + p.width / 2, ncy = ny + p.height / 2;
              // 壁に当たったらその場で戻り動作へ切替(貫通しない)。
              const bwalls = indoor ? indoorWalls : grenadeWallsFor(p);
              if (bwalls.some(w => rectsOverlap({ x: nx, y: ny, width: p.width, height: p.height }, w))) {
                return { ...p, boomPhase: 'return', hitEnemies: [] };
              }
              // 画面外に出たらすぐ戻り動作へ切替(停止せず帰還)。可視範囲=カメラ+画面サイズ。
              const offScreen = ncx < camera.x || ncx > camera.x + gameBounds.width || ncy < camera.y || ncy > camera.y + gameBounds.height;
              const traveled = Math.hypot(ncx - (p.boomOriginX ?? ncx), ncy - (p.boomOriginY ?? ncy));
              if (offScreen) {
                return { ...p, x: nx, y: ny, boomPhase: 'return', hitEnemies: [] };
              }
              if (traveled >= (p.boomMaxDist ?? 99999)) {
                // 到達 → 停止フェーズ。貫通リストをリセット(戻りで再ヒットできるよう)。
                return { ...p, x: nx, y: ny, boomPhase: 'stop', boomStopUntil: currentTime + (p.boomStopMs ?? 2000), hitEnemies: [] };
              }
              return { ...p, x: nx, y: ny };
            }
            if (phase === 'stop') {
              if (currentTime >= (p.boomStopUntil ?? 0)) {
                return { ...p, boomPhase: 'return', hitEnemies: [] };
              }
              return p; // 停止中は動かない(回転は描画側)
            }
            if (phase === 'return') {
              const cx = p.x + p.width / 2, cy = p.y + p.height / 2;
              const ddx = playerCX - cx, ddy = playerCY - cy;
              const dd = Math.hypot(ddx, ddy);
              if (dd <= 18) return { ...p, boomPhase: 'done' }; // 到達 → 消滅(useGameLoop が除去)
              const rsp = DRONE_BOOM_RETURN_SPEED; // 戻りは従来速度
              return { ...p, x: p.x + (ddx / dd) * rsp * deltaTime, y: p.y + (ddy / dd) * rsp * deltaTime };
            }
            return p; // 'done'
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
        })
        // 銃弾/敵弾は壁に当たったら消滅(貫通不可)。grenade はバウンド、特殊弾は対象外。
        .filter(p => !hitsWall(p));

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
        // 肉(health)も最大HPの30%回復(社長指示・固定値→割合)。
        set(state => ({
          player: {
            ...state.player,
            health: Math.min(state.player.health + Math.round(state.player.maxHealth * HEAL_FRACTION), state.player.maxHealth)
          }
        }));
        break;
      case 'strap':
        set(state => {
          // スキル: ゴールドラッシュ = 取得量 ×(1 + rand 0.10〜0.30)を取得毎にロール。
          const goldRush = hasSkill(state.player, 'gold-rush') ? 1 + 0.10 + Math.random() * 0.20 : 1;
          return {
          player: {
            ...state.player,
            // スクラップ獲得数アップ(パッシブ): 取得量を scrapMult 倍に(+30%/回)。
            straps: state.player.straps + Math.max(1, Math.round(pickup.value * ((state.player.scrapMult ?? 1) + (state.player.equipBonus?.scrapBonus ?? 0)) * goldRush))
          },
          gameStats: {
            ...state.gameStats,
            strapsCollected: state.gameStats.strapsCollected + pickup.value
          }
          };
        });
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
        const upgradeOptions = generateEquipmentChoices(get().player);
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
        // フィナーレボス(giantbat・非イベント)を爆弾で消したらクリアにする(他のキル経路と同じ勝利判定)。
        const bombWon = reachable.some(e => e.type === 'giantbat' && !e.fromEvent);
        set(state => ({
          enemies: state.enemies.filter(e => e.type === 'reaper'),
          gameWon: state.gameWon || bombWon,
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
      case 'ammo-rifle':
      case 'ammo-phill': {
        const fam = pickup.type.slice('ammo-'.length) as AmmoType;
        const amount = get().ammoPickupAmounts[fam];
        get().addAmmo(fam, amount);
        // キャラ固有 スカベンジャー(necromancer): 弾薬取得で銃ダメージ+10%を3秒arm。
        if (get().player.characterClass === 'necromancer') {
          set(s => ({ player: { ...s.player, scavengerBuffUntil: s.gameTime + 3000 } }));
        }
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
        if (get().indoorMode) {
          // 研究所の武器庫: 武器は出さず、トレジャー+スクラップのみ。
          get().addPickup({
            id: `pickup-treasure-crate-${pickup.id}`,
            x: pickup.x,
            y: pickup.y,
            type: 'treasure',
            value: LAB_CRATE_TREASURE_VALUE,
            variant: treasureVariantForValue(LAB_CRATE_TREASURE_VALUE)
          });
        } else {
          // 屋外: 従来どおりカテゴリ&ティアで銃を抽選して装備。
          get().grantWeapon(openCrate(get().gameTime));
        }
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
      // 屋内(研究施設)はステージ1の松明/地雷を「生成」しない。ただし resetGame で置いた
      // UVバー(type:'uv-bar'=破壊可能)はそのまま保持する(壊れたら damageBreakableProp が除去)。
      if (state.indoorMode) {
        return {};
      }
      // 研究所スキン(屋外): 松明は生成しない。reset で置いた UV バー(松明の代わり)は保持する。
      const labTheme = state.stageTheme === 'lab';
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
      const generated = labTheme ? [] : torchesInRegion(
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
      // 研究所スキン: UV バーを区画ごと(1区画1本)に生成。松明と同じ region 方式・破壊済みは destroyed で除外。
      const generatedUv = labTheme ? labUvBarsInRegion(
        camera.x - pad, camera.y - pad, camera.x + bounds.width + pad, camera.y + bounds.height + pad
      ) : [];
      const current = new Map(state.breakableProps.map(p => [p.id, p]));
      const next: BreakableProp[] = [];

      for (const uv of generatedUv) {
        if (state.destroyedBreakableProps[uv.id]) continue;
        const existing = current.get(uv.id);
        if (existing) { next.push(existing); continue; }
        next.push({
          id: uv.id,
          x: uv.x - 15, y: uv.y - 24, width: 30, height: 26,
          footX: uv.x, footY: uv.y, scale: 1,
          health: 12, maxHealth: 12, type: 'uv-bar', lastHit: 0,
        });
      }

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

      // 武器商人 / イベントNPC(例の2人)のサークル内には緑の卵(mine)を出さない(社長指示)。
      const noEggCircles = [state.weaponMerchant, state.eventQuestNpc]
        .filter((c): c is { x: number; y: number; radius: number } => !!c && c.radius > 0)
        .map(c => ({ x: c.x, y: c.y, r2: (c.radius + 24) ** 2 }));
      for (const mine of [...generatedMines, ...pressureMines, ...ambushMines]) {
        if (noEggCircles.some(c => (mine.footX - c.x) ** 2 + (mine.footY - c.y) ** 2 < c.r2)) continue;
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

      // 卵(mine)の取りこぼし対策: 圧力地雷(pressureMines)は時間セグメント(18秒)依存、出撃方向依存で
      // ID が変わるため、セグメント切替/方向転換のたびに「近くにあるのに消える」不具合があった。
      // → 既存の mine プロップで「カメラ領域(±pad)内・未破壊・今回未再生」のものは保持する
      //   (画面外へ離れたら自然に除外=無限蓄積しない)。
      const added = new Set(next.map(p => p.id));
      const rx0 = camera.x - pad, ry0 = camera.y - pad;
      const rx1 = camera.x + bounds.width + pad, ry1 = camera.y + bounds.height + pad;
      for (const p of state.breakableProps) {
        if (p.type !== 'mine' || added.has(p.id) || state.destroyedBreakableProps[p.id]) continue;
        if (p.footX >= rx0 && p.footX <= rx1 && p.footY >= ry0 && p.footY <= ry1) next.push(p);
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

    if (roll < 0.9 && !get().indoorMode) { // 研究所(屋内)は爆弾を出さない(社長指示)
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

  breakPropsAlong: (x0, y0, ux, uy, length, halfWidth, damage) => {
    const { breakableProps } = get();
    let hitAny = false;
    for (const prop of breakableProps) {
      // 始点からの相対ベクトルを線上に射影してカプセル距離を取る(length=0 で純円)。
      const rx = prop.footX - x0;
      const ry = prop.footY - y0;
      let along = rx * ux + ry * uy;
      if (along < 0) along = 0;
      else if (along > length) along = length;
      const nx = x0 + ux * along;
      const ny = y0 + uy * along;
      if (Math.hypot(prop.footX - nx, prop.footY - ny) > halfWidth) continue;
      hitAny = true;
      const broken = get().damageBreakableProp(prop.id, damage);
      get().spawnSlash(prop.footX, prop.footY - prop.height * 0.8, 'rgba(255,243,196,0.95)');
      if (!broken) continue;
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
    return hitAny;
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
          kind: 'weapon',
          weaponKey: weapon.key
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
          kind: 'weapon',
          weaponKey: weapon.key
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
      const changed = id !== state.player.activeWeaponId;
      // スキル: 弁慶 = 武器切替で10s crit率+10%。終了後3sのCD中は再発動しない。
      const gt = state.gameTime;
      const benkei =
        changed && hasSkill(state.player, 'benkei') && gt >= state.player.benkeiCdUntil
          ? { benkeiBuffUntil: gt + 10000, benkeiCdUntil: gt + 10000 + 3000 }
          : {};
      return {
        player: {
          ...state.player,
          activeWeaponId: id,
          reloadingWeaponId: '',
          reloadEndsAt: 0,
          ...benkei
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

  setShowStatsOverlay: (enabled) => {
    set({ showStatsOverlay: enabled });
  },

  stampPlayerIntro: () => {
    set({ introUntil: Date.now() + PLAYER_INTRO_MS, introDialogueActive: false, introDialogueShown: false });
  },

  startIntroDialogue: () => {
    set({ introDialogueActive: true, introDialogueStartedAt: Date.now(), introDialogueShown: true });
  },

  setIntroDialogueLines: (lines) => {
    set({ introDialogueLines: lines });
  },

  setPendingLoadout: (keys) => {
    saveStringArray(LOADOUT_SUBS_KEY, keys);
    set({ pendingLoadout: keys });
  },
  setPendingSkills: (keys) => {
    const capped = keys.slice(0, 2); // 装備は最大2
    saveStringArray(LOADOUT_SKILLS_KEY, capped);
    set({ pendingSkills: capped });
  },

  grantSkill: (key) => {
    const owned = get().ownedSkills;
    if (owned.includes(key)) return;
    const next = [...owned, key];
    saveStringArray(OWNED_SKILLS_KEY, next);
    set({ ownedSkills: next });
  },
  addGold: (amount) => {
    if (!Number.isFinite(amount) || amount <= 0) return;
    const next = Math.max(0, Math.round(get().goldBalance + amount));
    saveNumber(GOLD_BALANCE_KEY, next);
    set({ goldBalance: next });
  },
  spendGold: (amount) => {
    const bal = get().goldBalance;
    if (amount <= 0 || bal < amount) return false;
    const next = Math.max(0, Math.round(bal - amount));
    saveNumber(GOLD_BALANCE_KEY, next);
    set({ goldBalance: next });
    return true;
  },

  setPendingIndoor: (indoor) => {
    set({ pendingIndoor: indoor });
  },
  setPendingStageTheme: (theme) => {
    set({ pendingStageTheme: theme });
  },
  setPendingFarBackdrop: (key) => {
    set({ pendingFarBackdrop: key });
  },
  setPendingNearHorizon: (key) => {
    set({ pendingNearHorizon: key });
  },

  triggerEventVictory: () => {
    // ボス無しのイベント勝利。giantbat 撃破と同様に gameWon=true(Game.tsx が監視→onVictory)。
    set({ gameWon: true });
  },

  openLabDoor: (id) => {
    set(state => ({ labDoors: state.labDoors.map(d => d.id === id ? { ...d, open: true } : d) }));
  },

  setHasCardKey: (v) => {
    set({ hasCardKey: v });
  },

  pressLabButton: (id) => {
    set(state => {
      const btn = state.labButtons.find(b => b.id === id);
      if (!btn || btn.pressed) return {};
      return {
        labButtons: state.labButtons.map(b => b.id === id ? { ...b, pressed: true } : b),
        labDoors: state.labDoors.map(d => d.id === btn.opensDoorId ? { ...d, open: true } : d),
      };
    });
  },

  endIntroDialogue: () => {
    set({ introDialogueActive: false });
  },

  setDanceTestMode: (enabled) => {
    set({ danceTestMode: enabled });
  },

  setDanceTestLevel: (level) => {
    set({ danceTestLevel: Math.max(1, Math.min(3, Math.floor(level) || 1)) });
  },

  setDanceTestInterval: (ms) => {
    const n = Math.floor(ms);
    set({ danceTestInterval: Number.isFinite(n) && n > 0 ? Math.max(120, Math.min(2000, n)) : 0 });
  },

  setDanceForceJust: (enabled) => {
    set({ danceForceJust: enabled });
  },

  setDanceTestAutoTap: (enabled) => {
    set({ danceTestAutoTap: enabled });
  },

  addMeleeFinishCombo: (amount = 1) => {
    const gain = Math.max(1, Math.floor(amount));
    set(state => {
      const nextCombo = state.meleeFinishComboUntil >= state.gameTime
        ? state.meleeFinishComboCount + gain
        : gain;
      return {
        meleeFinishComboCount: nextCombo,
        meleeFinishComboUntil: state.gameTime + Math.round(MELEE_FINISH_COMBO_WINDOW_MS * (state.player.equipBonus?.killGraceMult ?? 1)),
        gameStats: {
          ...state.gameStats,
          maxCombo: Math.max(state.gameStats.maxCombo, nextCombo)
        }
      };
    });
  },

  // 装備を該当部位へ装着(同部位は置換)。最大体力の増減は player.maxHealth へベイクし、増分だけ現HPも上げる。
  equipItem: (defId) => {
    if (!equipmentById(defId)) return;
    set(state => ({ player: equipDefOnPlayer(state.player, defId) }));
  },

  // 現在装備中の1点を次run へ持ち帰り(localStorage)。null または未装備IDなら持ち帰り無し。
  takeHomeEquipment: (defId) => {
    const eq = get().player.equipment;
    const owned = defId != null && (eq.body === defId || eq.arms === defId || eq.accessory === defId);
    saveCarriedEquip(owned ? defId : null);
  },

  // --- 四神舞(リズム) -------------------------------------------------------
  // store は状態と判定のみを持つ。実際の攻撃(タップ/フリック/四神技/全体フィニッシュ/
  // 白虎の斬撃)は useGameLoop が pending を消化して実行する(効果音・XP・エフェクトのため)。
  setRhythmActive: (active, firstBeatAt, interval) => {
    if (active === get().rhythm.active) return;
    if (active) {
      // 拍グリッドは実時間(Date.now)基準: fps低下で gameTime が遅れても音楽からズレないように。
      const gt = Date.now();
      set(state => ({
        rhythm: {
          ...state.rhythm,
          active: true,
          interval: interval ?? RHYTHM_INTERVAL_MS, // 四神舞レベルのBPMで決まる1ビート長
          // BGMの拍に同期した firstBeatAt(loopが算出)を優先。無ければ従来のLEAD。
          firstBeatAt: firstBeatAt ?? gt + RHYTHM_LEAD_MS,
          expectBeat: 0,
          inputIndex: 0,
          inputArrows: [],
          prompt: randomRhythmPrompt(),
          godSuccess: 0,
          comboStage: rhythmComboStage(state.meleeFinishComboCount),
          lastJudge: 'none',
          lastJudgeAt: gt,
          lastJudgeKind: 'none',
          lastJudgeArrow: null,
          judgeSeq: 0,
          invulnUntil: gt + RHYTHM_START_INVULN_MS,
          byakkoUntil: 0,
          byakkoNextAt: 0,
          byakkoHits: 0,
          pending: [],
        },
        danceTapLog: [], // 計測ログは開始ごとにクリア
        // 立ち上がり無敵: 既存の invulnerable を流用(INVULN_MS で自動解除)。TODO: 専用秒数。
        player: { ...state.player, invulnerable: true, invulnerableTime: Date.now() },
      }));
    } else {
      // 終了: UIは消え、白虎も止め、残っていれば無敵を解除する。
      set(state => ({
        rhythm: { ...state.rhythm, active: false, byakkoUntil: 0, pending: [] },
        player: { ...state.player, invulnerable: false },
      }));
      // ダンス中に溜めたEXPで一気にレベルアップ(以降は selectUpgrade が連鎖)。
      const p = get().player;
      if (p.experience >= p.experienceToNextLevel) get().levelUp();
    }
  },

  // 自動アンカー: ダンス曲が実際に鳴り出した瞬間に、ビートグリッド起点(firstBeatAt)を
  // 開始時1回だけ合わせ直す。位相だけ補正するので expectBeat/inputIndex 等は触らない。
  // 毎フレーム同期はしない(ブルブル防止)ため、呼ぶのは useGameLoop が開始直後に1回だけ。
  setRhythmFirstBeat: (firstBeatAt) => {
    set(state => (state.rhythm.active ? { rhythm: { ...state.rhythm, firstBeatAt } } : {}));
  },

  rhythmInput: (kind, dir, contactMs = 0, opts) => {
    const state = get();
    const r = state.rhythm;
    if (!r.active) return { judged: 'none' };
    const gt = Date.now(); // 拍グリッドは実時間基準(firstBeatAt も Date.now ベース)
    if (gt - r.lastInputAt < RHYTHM_INPUT_DEBOUNCE_MS) return { judged: 'none' };
    // テスト用ms計測: 実タップ(自動タップ以外)の絶対時刻を記録。連続差分=「人間の実タップ間隔(ms)」。
    // Lv1で正しく刻めば差分は ~600ms になる(= 人間で測った実テンポ)。
    if (kind === 'tap' && !opts?.noLog) {
      set(s => {
        const lg = s.danceTapLog.length >= 60 ? s.danceTapLog.slice(-59) : s.danceTapLog.slice();
        lg.push(gt);
        return { danceTapLog: lg };
      });
    }
    const beatT = r.firstBeatAt + r.expectBeat * r.interval;
    const win = RHYTHM_SUCCESS_WINDOW_MS + (kind === 'flick' ? RHYTHM_FLICK_EXTRA_WINDOW_MS : 0);
    // フリックは「触れてから離すまで(contactMs)」の接触区間のどこかにジャストが入っていれば成功
    // (離す瞬間は不問)。または離した瞬間がジャストでもOK。タップは離した瞬間で判定。
    let onBeat: boolean;
    if (kind === 'flick') {
      const downGT = gt - Math.max(0, Math.min(contactMs, RHYTHM_FLICK_MAX_CONTACT_MS));
      onBeat = beatT >= downGT - win && beatT <= gt + win;
    } else {
      // テスト: 強制JUSTモードはタップを常に成功(JUST)扱い(計測時の紛らわしさ回避)。
      onBeat = state.danceForceJust ? true : Math.abs(gt - beatT) <= win;
    }
    const pcx = state.player.x + state.player.width / 2;
    const pcy = state.player.y + state.player.height / 2;
    const headY = state.player.y - 24; // 頭上(JUST!/MISS... 表示位置)
    // タイミングを外しても「ダンスは続く」。コンボと技の蓄積(godSuccess)だけリセット、頭からやり直し。
    if (!onBeat) {
      if (kind === 'tap') {
        // タップはミス扱いにしない。技リスト/コンボ/進行に一切影響させず空振り。
        // ビートだけ現在位置に合わせ、空振り後に tick がミス扱いしないようにする(早すぎる時は据え置き)。
        const nextBeat = Math.floor((gt - r.firstBeatAt) / r.interval) + 1;
        set(s => ({ rhythm: { ...s.rhythm, expectBeat: Math.max(s.rhythm.expectBeat, nextBeat), lastInputAt: gt } }));
        return { judged: 'none' };
      }
      // フリックのミスのみ: コンボ/進行/蓄積リセット + 技リスト(コマンド)を引き直す。
      get().spawnCallout(pcx, headY, 'MISS...', '#fb7185', { scale: 1.3 });
      set(s => ({
        meleeFinishComboCount: 0,
        meleeFinishComboUntil: 0,
        rhythm: { ...s.rhythm, inputIndex: 0, inputArrows: [], prompt: randomRhythmPrompt(), godSuccess: 0, comboStage: 0, lastInputAt: gt, lastJudge: 'miss', lastJudgeAt: gt },
      }));
      return { judged: 'miss' };
    }
    // 成功タイミング(JUST)。既存コンボカウンターを進める。
    get().addMeleeFinishCombo(1);
    const combo = get().meleeFinishComboCount;
    const newPending: RhythmPending[] = [];
    let inputIndex = r.inputIndex;
    let prompt = r.prompt;
    let godSuccess = r.godSuccess;
    let judged: 'hit' | 'fire' = 'hit';
    let firedGod: ShijinGod | undefined;
    let finish = false;
    const arrow: RhythmArrow | null = (kind === 'flick' && dir) ? arrowFromDir(dir.x, dir.y) : null;
    // 頭上表示用の入力履歴: フリックを末尾に追加(末尾4つを表示、5つ目以降は古いものから消える)。
    let inputArrows = arrow ? [...r.inputArrows, arrow].slice(-8) : r.inputArrows;
    if (!arrow) {
      newPending.push({ kind: 'tap' }); // タップ=周囲を軽く吹き飛ばし
    } else {
      newPending.push({ kind: 'flick', arrow }); // フリック=方向攻撃
      if (arrow === prompt[inputIndex]) {
        inputIndex++;
        if (inputIndex >= prompt.length) {
          firedGod = SHIJIN_BY_ARROW[prompt[0]]; // 1本目の矢印で四神決定
          newPending.push({ kind: 'god', god: firedGod, x: pcx, y: pcy });
          judged = 'fire';
          godSuccess++;
          inputIndex = 0;
          inputArrows = []; // 技が完成したら履歴をクリア
          prompt = randomRhythmPrompt();
          if (godSuccess >= SHIJIN_FINISH_COUNT) {
            newPending.push({ kind: 'finish' });
            godSuccess = 0;
            finish = true;
          }
        }
      } else {
        // プロンプトと違う向き(タイミングは成功): コマンドは保持し、入力進行のみ頭に戻す
        // (入力途中で別の四神コマンドに切り替わらないように)。コンボは継続。
        inputIndex = 0;
      }
    }
    // フリックは盾バッシュ風にプレイヤーがその方向(上下左右の主軸)へ短く滑る。
    const slideVec = arrow === 'up' ? { x: 0, y: -1 }
      : arrow === 'down' ? { x: 0, y: 1 }
      : arrow === 'left' ? { x: -1, y: 0 }
      : arrow === 'right' ? { x: 1, y: 0 } : null;
    set(s => ({
      rhythm: {
        ...s.rhythm,
        expectBeat: s.rhythm.expectBeat + 1,
        inputIndex,
        inputArrows,
        prompt,
        godSuccess,
        comboStage: rhythmComboStage(combo),
        lastInputAt: gt,
        lastJudge: judged === 'fire' ? 'fire' : 'hit',
        lastJudgeAt: gt,
        lastJudgeKind: arrow ? 'flick' : 'tap', // 演出: フリック=矢印 / タップ=サークル
        lastJudgeArrow: arrow ?? null,
        judgeSeq: s.rhythm.judgeSeq + 1,        // JUST成功ごとに+1(発光色 赤青緑黄 を巡回)

        lastTapAt: arrow ? s.rhythm.lastTapAt : gt, // タップ(方向なし)成功で発光
        lastFinishAt: finish ? gt : s.rhythm.lastFinishAt, // 4回成功(全体フィニッシュ)で虹
        lastGod: firedGod ?? s.rhythm.lastGod,
        pending: [...s.rhythm.pending, ...newPending],
      },
      player: slideVec
        ? { ...s.player, shijinSlideUntil: Date.now() + SHIJIN_SLIDE_MS, shijinSlideDirX: slideVec.x, shijinSlideDirY: slideVec.y }
        : (!arrow
          // ジャストタップ成功で「1ビート分」無敵。invulnerableTime をずらしてループの INVULN_MS 自動解除を
          // interval(=1ビート)に縮める。ビート毎にタップすれば無敵が途切れない。
          ? { ...s.player, invulnerable: true, invulnerableTime: Date.now() - Math.max(0, INVULN_MS - r.interval) }
          : s.player),
    }));
    // JUST 表示(技発動時は四神名の callout が別に出るので JUST は出さない)。
    if (judged === 'hit') get().spawnCallout(pcx, headY, 'JUST!', '#fde68a', { scale: 1.4 });
    return { judged, god: firedGod, finish };
  },

  tickRhythm: () => {
    const state = get();
    const r = state.rhythm;
    if (!r.active) return;
    // 指が触れている間はビートを失効させない(タッチ中にジャストが過ぎても、離した時の
    // フリックでそのビートを取れるように)。離している間だけ通常の失効判定を行う。
    if (state.touchActive) return;
    const gt = Date.now(); // 拍グリッドは実時間基準(firstBeatAt も Date.now ベース)
    // 過ぎたビートはミス扱い。ただし「プレイ中(コンボ>0 または 入力進行>0)」でなければ静かに送る
    // (ただ立っているだけで毎ビート"ミス"が点滅しないように)。
    let expect = r.expectBeat;
    let missed = false;
    while (gt > r.firstBeatAt + expect * r.interval + RHYTHM_SUCCESS_WINDOW_MS) {
      expect++;
      missed = true;
    }
    if (missed) {
      const playing = state.meleeFinishComboCount > 0 || r.inputIndex > 0 || r.godSuccess > 0;
      if (playing) {
        // 失敗してもダンスは継続。コンボと技の蓄積(godSuccess)だけリセット、頭からやり直し。
        get().spawnCallout(state.player.x + state.player.width / 2, state.player.y - 24, 'MISS...', '#fb7185', { scale: 1.3 });
        // 技リスト(prompt)は保持。コンボと進行/蓄積だけリセット(リスト引き直しはフリックミス/発動時のみ)。
        set(s => ({
          meleeFinishComboCount: 0,
          meleeFinishComboUntil: 0,
          rhythm: { ...s.rhythm, expectBeat: expect, inputIndex: 0, inputArrows: [], godSuccess: 0, comboStage: 0, lastJudge: 'miss', lastJudgeAt: gt },
        }));
      } else {
        set(s => ({ rhythm: { ...s.rhythm, expectBeat: expect } }));
      }
    }
  },

  startByakko: () => {
    set(s => ({
      rhythm: { ...s.rhythm, byakkoUntil: s.gameTime + BYAKKO_DURATION_MS, byakkoNextAt: s.gameTime, byakkoHits: 0 },
    }));
  },

  advanceByakko: () => {
    set(s => ({
      rhythm: { ...s.rhythm, byakkoNextAt: s.gameTime + BYAKKO_INTERVAL_MS, byakkoHits: s.rhythm.byakkoHits + 1 },
    }));
  },

  drainRhythmPending: () => {
    const p = get().rhythm.pending;
    if (p.length === 0) return [];
    set(s => ({ rhythm: { ...s.rhythm, pending: [] } }));
    return p;
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
    const state = get();
    const validClass = ['warrior', 'mage', 'rogue', 'necromancer'].includes(characterClass)
      ? characterClass as CharacterClass
      : 'warrior';

    let startingWeapons = getStartingWeapons(validClass);
    // 屋内(研究施設)は初期銃を専用の「ＰＨＩＬＬ-銃」に固定(近接はクラスのプロフィール据え置き)。
    if (state.pendingIndoor && !state.danceTestMode) {
      const melee = startingWeapons.find(w => w.isMelee);
      startingWeapons = [createWeapon('phill-revolver'), ...(melee ? [melee] : [])];
    }
    const profile = PLAYER_PROFILES[validClass] ?? PLAYER_PROFILES.warrior;
    // 装備の持ち帰り: localStorage の1件を該当部位へ装備して run 開始(死亡で破棄=ロード時に空なら無装備)。
    const runLoadout = emptyEquipLoadout();
    const carried = equipmentById(loadCarriedEquip());
    if (carried) runLoadout[carried.slot] = carried.id;
    // 持ち帰りは run 開始で「銀行から引き出し」=永続キーを空に。再度貯めるのは帰還/クリア時のみ
    // (=途中離脱や死亡では失う。死亡時は damagePlayer でも明示クリア)。
    saveCarriedEquip(null);
    const runEquipBonus = aggregateEquipBonus(runLoadout);
    // 最大体力は装備分を加算してベイク(消費側を据え置きにするため)。
    const maxHealth = profile.maxHp + equipMaxHealthOf(runLoadout);
    // 固有スキル(クラス標準サブ武器)を最初から Lv1 所持で開始する。
    const innateSub = classSubWeaponFor(validClass);
    
    set(state => {
      // 出撃時の所持サブ = クラス固有(デフォルト)サブは常に所持 + 装備選択で選んだサブ。
      // フリー/メイン/(将来の)サブクエスト共通の経路。固有サブが落ちないようにする(社長指示)。
      // 商人(unlockedShopSkillCards)とレベルアップ候補(generateUpgradeOptions)もこの所持サブに絞られる。
      // 装備サブは1つだけ採用(重複除去のうえ先頭1件)。クラス固有サブは別途常時所持。
      const loDedup = state.pendingLoadout.filter((k, i) => state.pendingLoadout.indexOf(k) === i).slice(0, 1);
      const runSubs: SubWeaponKey[] = state.danceTestMode
        ? ['shijin']
        : Array.from(new Set<SubWeaponKey>([innateSub, ...loDedup]));
      // 装備スキル(別枠アクティブ・最大2)。出撃時に player.skills へ反映(効果は今後配線)。
      const runSkills: SkillKey[] = state.danceTestMode
        ? []
        : Array.from(new Set<SkillKey>(state.pendingSkills)).slice(0, 2);
      const runLevels: Partial<Record<SubWeaponKey, number>> = state.danceTestMode
        ? { shijin: state.danceTestLevel }
        : Object.fromEntries(runSubs.map(k => [k, 1])) as Partial<Record<SubWeaponKey, number>>;
      // 商人はこの出撃のサブだけ Lv3 まで販売(他は陳列しない)。練習/ベンチは空。
      const runShopUnlocks: Partial<Record<SubWeaponKey, number>> = state.danceTestMode
        ? {}
        : Object.fromEntries(runSubs.map(k => [k, 3])) as Partial<Record<SubWeaponKey, number>>;
      // 屋内(研究施設)ステージ初期化。選択ステージが indoor なら labMap から構築。
      const indoor = state.pendingIndoor && !state.danceTestMode;
      // 見た目テーマ(屋外構造のままテクスチャ差し替え)。'lab'=研究所スキン(地面=ラボ床/商人がPHILL無料配布)。
      const stageTheme: StageTheme = (!state.danceTestMode && state.pendingStageTheme === 'lab') ? 'lab' : 'forest';
      // 遠景差し替え(forestテーマの距離パノラマのみ。ダンステスト/labでは無効)。
      const farBackdrop = (!state.danceTestMode && stageTheme === 'forest') ? state.pendingFarBackdrop : '';
      // 遠景森2(手前の帯)は forest/lab どちらでも有効(ダンステストのみ無効)。lab は機材シルエット帯。
      const nearHorizon = !state.danceTestMode ? state.pendingNearHorizon : '';
      const spawnTL = indoor
        ? { x: LAB_PLAYER_SPAWN.x - PLAYER_HITBOX / 2, y: LAB_PLAYER_SPAWN.y - PLAYER_HITBOX / 2 }
        : { x: 0, y: 0 };
      const runDoors: LabDoor[] = indoor ? LAB_DOORS.map(d => ({ id: d.id, rect: d.rect, open: false })) : [];
      const runButtons: LabButton[] = indoor ? [{ ...LAB_BUTTON, pressed: false }] : [];
      const runProps: LabProp[] = indoor ? generateLabProps() : []; // 障害物をランダム配置(壁/ギミック回避)
      // UVライトバー=松明と同じ扱い(破壊可能)。type:'uv-bar' の breakableProp。当たり判定は無し。
      // 屋内は labMap の固定 UV バーを初期配置。研究所スキン(屋外)は区画ごとに毎フレーム生成(syncBreakableProps)
      // するので初期配置は空。それ以外(森)も空(松明は毎フレーム生成)。
      const runBreakables: BreakableProp[] = indoor
        ? LAB_UV_BARS.map((b, i) => ({
            id: `lab-uv-${i}`,
            x: b.x - 15, y: b.y - 24, width: 30, height: 26,
            footX: b.x, footY: b.y, scale: 1,
            health: 12, maxHealth: 12, type: 'uv-bar' as const, lastHit: 0,
          }))
        : [];
      // 研究所スキン(屋外): クリア書類を左右どちらかの端にランダム配置。その手前(原点側)に Lv3/2/1 を1体ずつ。
      const labDoc = (stageTheme === 'lab' && !indoor)
        ? (() => {
            const side = Math.random() < 0.5 ? -1 : 1;       // 左(-1)か右(+1)
            const x = side * (6000 + Math.random() * 1800);  // 端の方(原点から遠い横方向。約3倍遠めへ)
            const y = -400 + Math.random() * 800;            // 縦は帯の範囲内
            return { x, y, side };
          })()
        : null;
      // ガード(固定・休眠・aggroRange内で起床)。書類の手前(原点側)に密集配置。
      const mkGuard = (type: EnemyType, gx: number, gy: number): Enemy =>
        ({ ...spawnEnemyAt(type, gx, gy, 0), fixed: true, dormant: true, aggroRange: 220, vx: 0, vy: 0, homeX: gx, homeY: gy });
      // 固定・休眠の敵を配置(距離カリング対象外=fixed)。aggroRange 内でプレイヤーが入ると起床。
      const runEnemies: Enemy[] = indoor
        ? LAB_ENEMIES.map(e => ({ ...spawnEnemyAt(e.type, e.x, e.y, 0), fixed: true, dormant: true, aggroRange: e.aggroRange, vx: 0, vy: 0, homeX: e.x, homeY: e.y }))
        : labDoc
          ? [
              mkGuard('lab-zombie-3', labDoc.x - labDoc.side * 170, labDoc.y),
              mkGuard('lab-zombie-2', labDoc.x - labDoc.side * 250, labDoc.y - 70),
              mkGuard('lab-zombie-1', labDoc.x - labDoc.side * 250, labDoc.y + 70),
            ]
          : [];
      // 屋内ギミックの初期ピックアップ: カードキー(E部屋)+ 武器箱(A部屋・ボタン解錠後に到達)
      // + クリア条件アイテム(C部屋=ゴール・カードキーで扉解錠後に到達。拾うとクリア)。
      const runPickups: Pickup[] = indoor
        ? [
            { id: 'lab-cardkey', x: LAB_CARD_KEY.x - 8, y: LAB_CARD_KEY.y - 8, type: 'card-key', value: 0 },
            { id: 'lab-weaponcrate', x: LAB_WEAPON_CRATE.x - 8, y: LAB_WEAPON_CRATE.y - 8, type: 'weapon-crate', value: 1 },
            { id: 'lab-clear-item', x: LAB_CLEAR_ITEM.x - 8, y: LAB_CLEAR_ITEM.y - 8, type: 'lab-clear-item', value: 0 },
            // PHILL弾の固定配置(研究所限定)。
            ...LAB_AMMO_PICKUPS.map((a, i) => ({ id: `lab-phill-${i}`, x: a.x - 8, y: a.y - 8, type: 'ammo-phill' as const, value: 0 })),
          ]
        : labDoc
          // 研究所スキン(屋外)のクリア条件=書類(重要データ)を左右端にランダム配置。拾うと勝利。
          ? [{ id: 'lab-document', x: labDoc.x - 8, y: labDoc.y - 8, type: 'lab-clear-item' as const, value: 0 }]
          : [];

      // 壁/UVバーは区画ごとに手続き生成(labWallsInRegion/labUvBarsInRegion)するので reset では持たない。
      // World is infinite; player starts at the origin and the camera
      // follows. No need to pre-center within bounds.
      return {
        unlockedShopSkillCards: runShopUnlocks,
        indoorMode: indoor,
        stageTheme,
        farBackdrop,
        nearHorizon,
        labDoors: runDoors,
        labButtons: runButtons,
        labProps: runProps,
        hasCardKey: false,
        goalReachedAt: 0,
        lastDamageSource: '',
        player: {
          x: spawnTL.x,
          y: spawnTL.y,
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
          aimX: 1,
          aimY: 0,
          counterWindowEnd: 0,
          counterCooldownEnd: 0,
          lastCounterSuccessTime: 0,
          ammoHandgun: AMMO_INITIAL.handgun,
          ammoShotgun: AMMO_INITIAL.shotgun,
          ammoRifle: AMMO_INITIAL.rifle,
          ammoPhill: AMMO_INITIAL.phill,
          critChance: 0,
          quickMagCritUntil: 0,
          reloadEndsAt: 0,
          reloadingWeaponId: '',
          magBonus: 0,
          reloadMult: 1,
          stunDurationMult: 1,
          ammoDropBonus: 0,
          scrapMult: 1,
          passiveCounts: {},
          // 仮: ダンスモードはダンスフロア(shijin)を指定レベルだけ覚えた状態で開始(敵なしで練習)。
          // 通常開始は固有スキルを Lv1 所持(新規取得スキル1個はこれと別枠=upgradeUtils 側で管理)。
          subWeapons: runSubs,
          skills: runSkills,
          fireShooterCdUntil: 0, reflexCdUntil: 0, slasherWindowUntil: 0,
    scavengerBuffUntil: 0, marksmanMovingSince: 0, heavyGunnerExpBuffUntil: 0,
    phillReticleDX: 0, phillReticleDY: 0, phillSnapEnemyId: null,
          knifeComboCount: 0, knifeComboUntil: 0, benkeiBuffUntil: 0, benkeiCdUntil: 0,
          subWeaponLevels: runLevels,
          subWeaponCooldowns: {},
          huntingChargeStartedAt: 0,
          huntingCharged: false,
          katanaDashUntil: 0,
          katanaDashDirX: 0,
          katanaDashDirY: 0,
          katanaDashCooldownEnd: 0,
          shijinSlideUntil: 0,
          shijinSlideDirX: 0,
          shijinSlideDirY: 0,
          wireAnchorX: 0,
          wireAnchorY: 0,
          wireAnchored: false,
          wirePlantUntil: 0,
          wireDashUntil: 0,
          wireDashSpeed: 0,
          wireStuckEnemyId: '',
          wireStuckUntil: 0,
          straps: state.startWithTestStraps ? 1000 : 0,
          vaccineRevives: 0,
          equipment: runLoadout,
          equipBonus: runEquipBonus
        },
        // 登場演出をアーム(初フレームで終了時刻確定)。練習モードは演出なし。
        introUntil: state.danceTestMode ? 0 : -1,
        introDialogueActive: false,
        introDialogueStartedAt: 0,
        introDialogueShown: false,
        reaperCross: null,
        enemies: runEnemies,
        pickups: runPickups,
        projectiles: [],
        breakableProps: runBreakables,
        destroyedBreakableProps: {},
        mineAmbushAnchor: null,
        activeEvent: null,
        eventBannerText: '',
        eventBannerUntil: 0,
        // 屋内は指定がない限り「最初の部屋に武器商人のみ」。ボス部屋(城)/二人組(クエストNPC)は不在。
        // 城/死神/クエストの“発生”は useGameLoop 側で既に !indoor ゲート済み。商人は最初の部屋へ配置。
        castleEvent: createCastleEvent(),
        weaponMerchant: indoor
          ? { x: LAB_MERCHANT.x, y: LAB_MERCHANT.y, radius: MERCHANT_INTERACT_RADIUS }
          : createWeaponMerchant(),
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
        gameReturned: false,
        meleeFinishComboCount: 0,
        meleeFinishComboUntil: 0,
        // 四神舞(ダンスフロア)状態を初期化。これを忘れると再プレイ時に lastTapAt 等が前ゲームのまま残り、
        // gameTime が 0 に戻るためミラーボールの発光倍率(pulse)が巨大化して画面を埋め尽くすバグになる。
        rhythm: initialRhythm(),
        upgradeOptions: [],
        touchActive: false,
        swipeDirection: null,
        swipeStrength: 1,
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
        timeSlowStart: 0,
        shakeUntil: 0,
        shakeMag: SHAKE_MAG,
        shakeDur: SHAKE_MS,
        zoomUntil: 0,
        zoomMag: 0,
        hurricane: null,
        summons: [],
        rescueSurvivors: [],
      };
    });
  },
  
  setCameraPosition: (x, y) => {
    // Infinite world: the camera follows the player one-to-one with no clamp.
    set({ camera: { x, y } });
  },

  triggerShake: (durationMs, mag = SHAKE_MAG) => {
    // 描画のみ。重なった時は「強い方(振幅)」を優先(弱い揺れが強い揺れを潰さない)。長さは延長。
    const now = Date.now();
    set(state => {
      const active = now < state.shakeUntil;
      if (active && state.shakeMag >= mag) {
        return { shakeUntil: Math.max(state.shakeUntil, now + Math.max(0, durationMs)) };
      }
      return { shakeUntil: now + Math.max(0, durationMs), shakeMag: Math.max(0, mag), shakeDur: Math.max(1, durationMs) };
    });
  },

  triggerHitstop: (durationMs) => {
    // 全停止(ループが早期returnで凍結)。重なった時は長い方を採用。
    const now = Date.now();
    set(state => ({ hitstopUntil: Math.max(state.hitstopUntil, now + Math.max(0, durationMs)) }));
  },

  triggerHitImpact: (stopMs, shakeMs, shakeMag, zoomMag) => {
    // カウンター/バッシュの衝撃: 寄りパンチズームは命中の瞬間に即(=早く寄る)。
    // ストップを入れ、揺れはストップ後に(止まりが揺れに埋もれないよう)。
    // ダンス中(四神舞)は gameTime を止めるとリズムが乱れるためストップ抜き=全て即時。
    get().triggerZoom(zoomMag); // 即・寄り
    if (get().rhythm.active) {
      get().triggerShake(shakeMs, shakeMag);
      return;
    }
    // ストップ開始時、進行中の(スイング等の)揺れを消す=ストップ後に出すこのインパクトの揺れだけ残す。
    set({ shakeUntil: 0 });
    get().triggerHitstop(stopMs);
    get().triggerTimeSlow(0.2, MELEE_FINISH_SLOW_MS); // ストップから必ずスローで等速へ戻す(社長指示)
    setTimeout(() => get().triggerShake(shakeMs, shakeMag), Math.max(0, stopMs));
  },

  triggerFinishImpact: () => {
    // 近接フィニッシュ: 寄りは即。スローも即開始(ストップ中はループ早期returnで凍結 → 明けてから
    // 倍率が滑らかに 1.0 へランプ=ぶつ切り回避)。setTimeout で遅延起動するとフリーズ明けと競合して
    // 一瞬等速に戻る不具合が出るため同期起動にする。揺れだけストップ後に出す。
    get().triggerZoom(MELEE_FINISH_ZOOM_MAG);             // 即・寄り
    get().triggerTimeSlow(0.2, MELEE_FINISH_SLOW_MS);     // 即・スロー(強め→等速へランプ)
    setTimeout(() => get().triggerShake(MELEE_FINISH_SHAKE_MS, MELEE_FINISH_SHAKE_MAG), HITSTOP_MS);
  },

  triggerZoom: (mag, durationMs = MELEE_FINISH_ZOOM_MS) => {
    // 描画のみのパンチズーム。重なった場合は強い方/長い方を採用。ゲーム性(カメラ座標/判定)は不変。
    const now = Date.now();
    set(state => ({
      zoomUntil: Math.max(state.zoomUntil, now + Math.max(0, durationMs)),
      zoomMag: Math.max(state.zoomMag, Math.max(0, mag)),
    }));
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
          : clampedScale,
        // 新規開始時のみ開始時刻を更新(継続中は維持してランプ区間を保つ)。
        timeSlowStart: active ? state.timeSlowStart : now,
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

  spawnImageMark: (x, y, texture, opts) => {
    const now = Date.now();
    const effect: VisualEffect = {
      kind: 'image',
      id: `fx-img-${now}-${Math.random().toString(36).slice(2, 6)}`,
      x, y,
      texture,
      scale: opts?.scale ?? 1,
      color: opts?.color,
      createdAt: now,
      duration: opts?.duration ?? 900,
    };
    set(state => {
      const next = [...state.effects, effect];
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

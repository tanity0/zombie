import { create } from 'zustand';
import { generateUpgradeOptions } from '../utils/upgradeUtils';
import {
  Player, Enemy, Projectile, Pickup, BreakableProp, GameStats,
  InputState, UpgradeOption, GameBounds, CharacterClass,
  VisualEffect, AmmoType, Direction, SubWeaponKey, CastleEvent, DifficultyRank,
  WeaponMerchant, ShopItemKey, EventQuestNpc, Summon,
  RhythmState, RhythmArrow, ShijinGod, RhythmPending, IntroLine, LabDoor, LabButton, LabProp
} from '../types/game';
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
import { footRect, rectsOverlap, resolveAabb, segmentBlocked, type Rect } from '../world/obstacles';
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
      rifle: clampAmmoPickupAmount(parsed.rifle ?? AMMO_PICKUP.rifle),
      phill: clampAmmoPickupAmount(parsed.phill ?? AMMO_PICKUP.phill)
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
// レベルアップ時に周辺の敵を強制的に押しのける(2倍ノックバック相当)。アップグレードメニューで
// 即ポーズするため velocity だと失効する → 位置を即時に動かす(menu を跨いでも効く)。
export const LEVELUP_KNOCKBACK_RADIUS = 240;   // 押しのける範囲(プレイヤー中心)
export const LEVELUP_KNOCKBACK_DISTANCE = 96;  // 押しのける距離(通常ノックバックの約2倍の体感)
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
// 設置型シールドへの近接攻撃=シールドバッシュ。壁を法線方向へ SHIELD_BASH_SHOVE_DISTANCE
// 押し出し(トラップと同じ shove 機構でシームレス)、掃過した敵全部に近接×
// SHIELD_BASH_DAMAGE_MULT と押し出し方向への強ノックバックを与える(壁は破壊せず残す)。
const SHIELD_BASH_DAMAGE_MULT = 3;
const SHIELD_BASH_SHOVE_DISTANCE = 50;        // バッシュの飛び出し距離(少し短め)
const SHIELD_BASH_DURABILITY_COST = 5;        // バッシュ1回で減る耐久(0以下で破壊)
const SHIELD_BASH_KNOCKBACK_SPEED = KNOCKBACK_SPEED * 4.8;
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

// ---- ワイヤーアンカー(移動系サブウェポン) ------------------------------------
// 装備中、前方(ショットガン射程くらい)に青サークルを常時表示。指離しでアンカー打ち込み開始
// (WIRE_PLANT_MS=1秒)、完了後 WIRE_WINDOW_MS(~1秒)以内の追加タップでアンカー地点へ高速移動。
// 高速移動中は敵接触ダメージ無効(敵弾は通る/敵にダメージ・ノックバックなし)。CD はレベルで短縮。
export const WIRE_ANCHOR_RANGE = 110;   // 青サークル距離(飛距離。全レベル共通=半分に短縮)
// アナログスティックの傾き強度(swipeStrength: 0..1)で、移動速度と狙い距離を可変にする。
// 強度0(デッドゾーン直上)でも完全停止にはせず、最低係数だけ残す(操作不能を避ける)。
// キャラ移動: 弱い傾き=ゆっくり歩く(最低 STICK_WALK_MIN_FACTOR 倍)。
// 狙い距離(ワイヤーアンカー/PHILLレティクル): 弱い傾き=近く(最低 STICK_AIM_MIN_FACTOR 倍)。
export const STICK_WALK_MIN_FACTOR = 0.20; // 歩行速度の最低倍率(強度0時。弱タッチ=さらにゆっくり)
export const STICK_AIM_MIN_FACTOR = 0.25;  // 狙い距離の最低倍率(強度0時)
// 傾き強度 → 係数への共通リマップ(レンダラと共有して見た目と挙動を一致させる)。
export const stickAimFactor = (strength: number) =>
  STICK_AIM_MIN_FACTOR + (1 - STICK_AIM_MIN_FACTOR) * Math.max(0, Math.min(1, strength));
export const WIRE_PLANT_MS = 300;       // 打ち込み(先端が飛んで刺さるまで)=0.3秒。刺さると高速移動可。
export const WIRE_DASH_MS = 200;        // 高速移動の所要時間
export const WIRE_COOLDOWN_BY_LEVEL = [0, 2000, 1000, 0] as const; // Lv1=2s / Lv2=1s / Lv3=0s
// 敵に刺さった時(発火ナイフ風吸着): 0.1秒で敵を引き寄せ→近接ダメージ→大幅ノックバック。
export const WIRE_STICK_MS = 100;       // 引き寄せ時間(0.1秒)
export const WIRE_KNOCKBACK_SPEED = 1100; // 大幅ノックバックの初速(px/s)

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
export const WHIP_KNOCKBACK_SPEED = KNOCKBACK_SPEED * 3;          // 通常近接の約3倍(仕様アンカー)
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
export const BASH_ZOOM_MAG = 0.3;          // バッシュ命中の寄り(現在は未使用=バッシュは寄り無し)
// Inertia time constants (s). Velocity eases toward its target over this
// window. The player is now instant (0 = no inertia, snappy control); enemies
// keep 0.3s so they curve into turns instead of snapping.
export const PLAYER_INERTIA_TAU = 0;
export const ENEMY_INERTIA_TAU = 0.3;

// 特殊AI(犬型=突進 / パンプキン=ジャンプ)の調整値。射程基準=ハンドガン射程176px(RANGE_BY_CATEGORY.handgun)。
const HANDGUN_RANGE_REF = 176;
// 犬型(werewolf): ハンドガン射程より少し外で減速→2倍速で突進。
export const WEREWOLF_TRIGGER_RANGE = HANDGUN_RANGE_REF + 70; // 「少し外」
export const WEREWOLF_WINDUP_MS = 600;    // 減速(溜め)の長さ
export const WEREWOLF_WINDUP_SPEED_MULT = 0.3;
export const WEREWOLF_CHARGE_SPEED_MULT = 2;   // 通常の2倍速
export const WEREWOLF_CHARGE_MAX_MS = 1400; // 突進の最大時間(到達できなくても打ち切り)
export const WEREWOLF_COOLDOWN_MS = 1200;  // 突進後、次の溜めまでの猶予
// パンプキン(pumpkin): ハンドガン射程より少し外で縮みながら3秒溜め→1秒でジャンプ着地→1秒停止+揺れ。
export const PUMPKIN_TRIGGER_RANGE = HANDGUN_RANGE_REF + 70;
export const PUMPKIN_CROUCH_MS = 3000;     // 縮み溜め
export const PUMPKIN_JUMP_MS = 1000;       // ジャンプ(着地まで)
export const PUMPKIN_RECOVER_MS = 1000;    // 着地後の停止
export const PUMPKIN_COOLDOWN_MS = 800;    // 復帰後、次の溜めまでの猶予
export const PUMPKIN_JUMP_HEIGHT = 90;     // ジャンプの見た目の高さ(px・描画のみ)
export const PUMPKIN_LAND_SHAKE_MS = 220;  // 着地時の画面揺れ
export const PUMPKIN_LAND_SHAKE_MAG = 9;
// ドローンブーメラン(通常サブ・手動発動): 立ち止まり中の近接入力で進行方向へ投げる。
// 行き=貫通(近接同等)→一定距離で停止(回転+周囲パルス)→プレイヤー現在地へ戻り(貫通)→消滅。
export const DRONE_BOOM_COOLDOWN_MS = 5000;                 // 全Lv共通5秒
export const DRONE_BOOM_STOP_MS_BY_LEVEL = [0, 2000, 3000, 4000]; // 停止時間(Lv1/2/3)
export const DRONE_BOOM_DIST_BY_LEVEL = [0, 100, 118, 135]; // 飛距離(Lv1/2/3)。社長指示で従来の半分(200/236/270→)
export const DRONE_BOOM_SPEED = 480;                       // 行きの飛行速度(px/s)。社長指示で少し速く(360→480)
export const DRONE_BOOM_RETURN_SPEED = 360;               // 戻りの速度(px/s)。従来どおり
export const DRONE_BOOM_RADIUS = 72;                       // 停止中のダメージ範囲(半径)
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
    case 'murasame': return '村雨';
    case 'decoy': return 'デコイ';
    case 'shield': return 'シールド';
    case 'whip': return '鞭';
    case 'alchemy': return '錬金術';
    case 'turret': return '自動タレット';
    case 'shijin': return 'ダンスフロア';
    case 'fire-knife': return '発火ナイフ';
    case 'drone-boomerang': return 'ドローンブーメラン';
    case 'wire-anchor': return 'ワイヤーアンカー';
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
    const baseRate = Math.max(0, Math.min(1, get().meleeAmmoDropPercent / 100 + (player.ammoDropBonus ?? 0)));
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

// 排他スキルのグループ(同グループ内は共存OK。例: 刀↔村雨)。それ以外のスキルとは共存不可。
const EXCLUSIVE_SUBWEAPON_GROUPS: SubWeaponKey[][] = [['katana', 'murasame'], ['shijin']];

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
  lastWeaponGet: { name: string; at: number; color?: string; kind?: 'weapon' | 'treasure' } | null;
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

  // Player actions
  movePlayer: (input: InputState, deltaTime: number) => void;
  setSwipeDirection: (direction: { x: number; y: number } | null, strength?: number) => void;
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
  pendingLoadout: SubWeaponKey[];                       // 装備選択で選んだサブ(出撃時に resetGame が所持へ反映)
  setPendingLoadout: (keys: SubWeaponKey[]) => void;
  // 屋内(研究施設)ステージ
  indoorMode: boolean;                                  // 屋内マップ(壁/カメラクランプ/湧き抑制)有効か
  labDoors: LabDoor[];                                  // 可変ドア(解錠状態)
  labButtons: LabButton[];                              // ボタン(押下状態)
  labProps: LabProp[];                                  // 障害物プロップ(木の代わり・当たり判定あり)
  hasCardKey: boolean;                                  // カードキー取得済みか
  goalReachedAt: number;                                // ゴール到達時刻(0=未到達)。演出後に勝利
  pendingIndoor: boolean;                               // 出撃が屋内ステージか(startMission→resetGame で受け渡し)
  setPendingIndoor: (indoor: boolean) => void;
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
  pendingLoadout: [],
  indoorMode: false,
  labDoors: [],
  labButtons: [],
  labProps: [],
  hasCardKey: false,
  goalReachedAt: 0,
  pendingIndoor: false,
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

  // Player actions
  movePlayer: (input, deltaTime) => {
    set(state => {
      const { player, gameBounds, swipeDirection, swipeStrength, breakableProps, castleEvent } = state;
      const solidProps = breakableProps.filter(p => p.type !== 'mine');
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
        : reloading ? player.speed * RELOAD_MOVE_SPEED_MULT : player.speed;

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
      // instant, responsive control.
      const alpha = inertiaAlpha(deltaTime, PLAYER_INERTIA_TAU);
      const vx = player.vx + (tx * moveSpeed * speedScale - player.vx) * alpha;
      const vy = player.vy + (ty * moveSpeed * speedScale - player.vy) * alpha;

      // 壁解決。屋内は labMap の壁(+閉ドア)のみ。屋外は従来の木/トーチ/城。
      let newX: number;
      let newY: number;
      const candidate = { x: player.x + vx * deltaTime, y: player.y + vy * deltaTime, width: player.width, height: player.height };
      if (state.indoorMode) {
        const openIds = state.labDoors.filter(d => d.open).map(d => d.id);
        const r = resolveAabb(candidate, [...labBlockingWalls(openIds), ...state.labProps.map(p => p.rect)]);
        newX = r.x; newY = r.y;
      } else {
        // Block the player's hitbox out of tree trunks (rectangle AABB only).
        const treeResolved = resolveTreeCollision(candidate);
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
        newX = castleResolved.x;
        newY = castleResolved.y;
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

      return {
        ...(pushedProjectiles ? { projectiles: pushedProjectiles } : {}),
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
      shopReopenAt, eventQuestReopenAt, indoorMode, labDoors, swipeStrength
    } = get();
    // Respect cooldown — no swing, no knockback, no window.
    if (now < player.counterCooldownEnd) return { swung: false, hit: false, finish: false, killed: 0 };

    // 近接スイングの揺れは「通常ヒット時のみ」(空振りは揺らさない/フィニッシュ・カウンターは
    // それぞれのインパクト演出に任せる)。判定が出揃う関数末尾で発火する(社長指示)。

    const melee = player.weapons.find(w => w.isMelee);
    const gun = getActiveGun(player); // finisher refunds into the active gun
    const meleeDamage = melee?.damage ?? 6;
    const pcx = player.x + player.width / 2;
    const pcy = player.y + player.height / 2;
    const meleeRange = huntingMeleeRadius(player);
    // 近接の壁越し不可(視線判定)。屋内=lab壁(閉ドア含む) / 屋外=近傍の木。
    const meleeWalls: Rect[] = indoorMode
      ? [...labBlockingWalls(labDoors.filter(d => d.open).map(d => d.id)), ...get().labProps.map(p => p.rect)]
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
        // 指離し → 前方の青サークル地点へ「即座に」アンカー打ち込み(ワイヤー表示)。溜(WIRE_PLANT_MS)後に移動可。
        const dir = player.lastDirection ?? { x: 1, y: 0 };
        const dmag = Math.max(0.001, Math.hypot(dir.x, dir.y));
        // 傾き強度で飛距離を可変(最大=WIRE_ANCHOR_RANGE)。ダッシュ速度は飛距離から
        // 算出される(上の armed 分岐)ので、短い狙いは自動で短く遅いダッシュになる。
        const reach = WIRE_ANCHOR_RANGE * stickAimFactor(swipeStrength);
        const ax = pcx + (dir.x / dmag) * reach;
        const ay = pcy + (dir.y / dmag) * reach;
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
      const counterCd = hasMurasame(player) ? now : now + COUNTER_WINDOW + COUNTER_COOLDOWN;
      set(state => ({
        player: {
          ...state.player,
          counterWindowEnd: now + COUNTER_WINDOW,
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
          counterWindowEnd: now + COUNTER_WINDOW,
          counterCooldownEnd: now + COUNTER_WINDOW + COUNTER_COOLDOWN + WHIP_COOLDOWN_EXTRA_MS,
        }
      }));
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
        // バッシュ方向はプレイヤーの進行方向(設置時の向きではない)。停止中は設置法線にフォールバック。
        const ld = player.lastDirection;
        const lm = Math.hypot(ld?.x ?? 0, ld?.y ?? 0);
        const dux = lm > 0.01 ? ld.x / lm : p.direction.x;
        const duy = lm > 0.01 ? ld.y / lm : p.direction.y;
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
    const killed: { enemy: Enemy; finisher: boolean }[] = [];
    let bossFinishHit = false;
    const survivors: Enemy[] = [];
    const damageNumbers: { x: number; y: number; value: number; crit: boolean }[] = [];
    const slashAt: { x: number; y: number }[] = [];
    const critStunAt: { x: number; y: number }[] = [];

    for (const enemy of enemies) {
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
      get().triggerFinishImpact(); // ストップ後に 揺れ+スロー+寄りズーム
    }

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
      const crit = Math.random() < Math.min(1, meleeCritChance + player.critChance + trapCritBonus);
      const dmg = meleeBase * whipMult * (crit ? CRIT_DAMAGE_MULT : 1);
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
    const bossKilled = killed.some(k => k.enemy.type === 'giantbat');
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
      meleeFinishComboUntil: comboFinishCount > 0 ? gameTime + MELEE_FINISH_COMBO_WINDOW_MS : state.meleeFinishComboUntil,
      hitstopUntil: finisherHit ? now + HITSTOP_MS : state.hitstopUntil,
    }));

    // 鞭の時は近接攻撃のクレスト(slashストリーク)表現は出さない。鞭自身のlashスプライトのみ。
    for (const c of damageNumbers) get().spawnDamageNumber(c.x, c.y, c.value, c.crit);
    // 弾薬ドロップは鞭固定20%(弾切れ救済)。
    grantMeleeKillRewards(get, killed, player, gun, false, WHIP_AMMO_DROP_CHANCE);
    if (finisherHit || bossFinishHit) get().triggerFinishImpact(); // ストップ後に 揺れ+スロー+寄りズーム

    return { hit: slashAt.length > 0, finish: finisherHit || bossFinishHit, killed: killed.length, hits };
  },

  performHurricane: (rootX, rootY) => {
    const now = Date.now();
    const lvl = whipLevel(get().player);
    set({
      hurricane: {
        rootX, rootY,
        endsAt: now + HURRICANE_DURATION_MS_BY_LEVEL[lvl],
        radius: HURRICANE_RADIUS_BY_LEVEL[lvl],
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
      for (const o of inRange) {
        get().damageEnemy(o.id, HURRICANE_DAMAGE);
        get().spawnDamageNumber(o.x, o.y, HURRICANE_DAMAGE); // 巻き込みダメージを可視化
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
    const unit = buildSummon(lvl, 'normal', sx, sy);
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
          const aura2 = ALCHEMY_RARE_SUCTION_RADIUS * ALCHEMY_RARE_SUCTION_RADIUS;
          for (const e of enemiesNext) {
            if (e.type === 'reaper') continue;
            const d2 = (e.x + e.width / 2 - rcx) ** 2 + (e.y + e.height / 2 - rcy) ** 2;
            if (d2 > aura2) continue;
            attackHits.push({ id: e.id, amount: ALCHEMY_RARE_MELEE_DAMAGE, x: e.x + e.width / 2, y: e.y });
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
      if (now - (s.lastContactAt ?? 0) >= ALCHEMY_ATTACK_INTERVAL_MS) {
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
      const solidPropsForShove = state.breakableProps.filter(pr => pr.type !== 'mine');
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
  
  // PHILL銃の手動発砲: 立ち止まってタップした時だけ狙いサークル(=lastDirection)方向へ1発。
  // 移動中(ドラッグ移動/移動キー保持)は撃たない=「立ち止まって撃つ」武器。CD=武器のcooldown(1秒)。
  firePhillShot: () => {
    const { player } = get();
    const weapon = getActiveGun(player);
    if (!weapon || weapon.key !== 'phill-revolver') return;
    if (player.isMoving) return; // 立ち止まりが条件(移動中は発砲しない)
    const now = Date.now();
    if (isReloading(player, weapon.id)) return;
    if ((weapon.magazine ?? 0) <= 0) { get().autoSwitchIfDry(); return; }
    if (now - weapon.lastFired < (weapon.cooldown ?? 1000)) return;
    const dir = player.lastDirection ?? { x: 1, y: 0 };
    const dl = Math.max(0.001, Math.hypot(dir.x, dir.y));
    const size = weapon.projectileSize || 9;
    const speed = (weapon.projectileSpeed || 640) * 1.5; // PROJECTILE_SPEED_MULT 相当
    get().addProjectile({
      id: `proj-phill-${now}`,
      x: player.x + player.width / 2 - size / 2,
      y: player.y + player.height / 2 - size / 2,
      width: size, height: size, speed,
      damage: weapon.damage, // クリ(ヘッドショット)は命中位置で確定付与
      direction: { x: dir.x / dl, y: dir.y / dl },
      weaponType: 'phill-bullet',
      weaponKey: weapon.key,
      duration: 1400, createdAt: now,
      passthrough: false, hitEnemies: [], hostile: false, reflected: false, crit: false,
    });
    const nextMag = Math.max(0, (weapon.magazine ?? 0) - 1);
    set(state => ({ player: { ...state.player, weapons: state.player.weapons.map(w => w.id === weapon.id ? { ...w, lastFired: now, magazine: nextMag } : w) } }));
    if (nextMag <= 0) get().autoSwitchIfDry(); // 空なら既存経路でリロード
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
      if (key === 'ammo-phill' || ammoType === 'phill') { // 研究所: 商人はPHILL弾のみ販売
        return spend(SHOP_AMMO_COST, {
          ammoPhill: Math.min(AMMO_MAX.phill, state.player.ammoPhill + state.ammoPickupAmounts.phill)
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
      const cost = key === 'dog' ? SHOP_DOG_COST : key === 'katana' ? SHOP_KATANA_COST : key === 'whip' ? SHOP_WHIP_COST : key === 'alchemy' ? SHOP_ALCHEMY_COST : key === 'turret' ? SHOP_TURRET_COST : key === 'shijin' ? SHOP_SHIJIN_COST : SHOP_CLASS_SKILL_COST;
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
    let pumpkinLanded = false; // パンプキン着地を検出して set 後に画面揺れを出す(set内でのネスト発火回避)
    set(state => {
      const { enemies, player, gameTime, breakableProps, summons } = state;
      const solidProps = breakableProps.filter(p => p.type !== 'mine');
      const now = Date.now();
      const pcx = player.x + player.width / 2;
      const pcy = player.y + player.height / 2;
      const indoor = state.indoorMode;
      const openDoorIds = indoor ? state.labDoors.filter(d => d.open).map(d => d.id) : [];
      const indoorWalls = indoor ? [...labBlockingWalls(openDoorIds), ...state.labProps.map(p => p.rect)] : [];

      const updatedEnemies = enemies.map(enemy => {
        // 衝突解決して移動先を返す(各AIで共用)。屋内は labMap の壁(+閉ドア+プロップ)、屋外は木/松明。
        const resolveMove = (nx: number, ny: number) => {
          if (indoor) return resolveAabb({ x: nx, y: ny, width: enemy.width, height: enemy.height }, indoorWalls);
          const tr = resolveTreeCollision({ x: nx, y: ny, width: enemy.width, height: enemy.height });
          return resolveTorchCollision({ x: tr.x, y: tr.y, width: enemy.width, height: enemy.height }, solidProps);
        };
        // Knockback overrides chase AI: while it's active, slide outward
        // with linearly-decaying velocity instead of seeking the player.
        if (enemy.knockbackUntil && now < enemy.knockbackUntil) {
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
        if (enemy.liftUntil !== undefined && now < enemy.liftUntil) {
          return { ...enemy, vx: 0, vy: 0 };
        }

        // Stun (from a crit) freezes the enemy in place — it's a sitting duck
        // for a melee finisher. gameTime-based so pauses don't cheat the timer.
        if (enemy.stunUntil !== undefined && gameTime < enemy.stunUntil) {
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
          const seen = inRange && !(indoorWalls.length > 0 && segmentBlocked(pcx, pcy, ecx2, ecy2, indoorWalls)); // 壁越しは見つからない
          if (!seen) return { ...enemy, vx: 0, vy: 0 };
          return { ...enemy, dormant: false, vx: 0, vy: 0 };
        }

        // 犬型(werewolf)突進AI: ハンドガン射程より少し外で減速(溜め)→開始時のプレイヤー位置へ2倍速で突進。
        if (enemy.type === 'werewolf') {
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
            const cs = enemy.speed * WEREWOLF_CHARGE_SPEED_MULT;
            const cvx = (cdx / cdist) * cs, cvy = (cdy / cdist) * cs;
            const moved = resolveMove(enemy.x + cvx * deltaTime, enemy.y + cvy * deltaTime);
            return { ...enemy, vx: cvx, vy: cvy, x: moved.x, y: moved.y };
          }
          if (enemy.aiPhase === 'windup') {
            if (gameTime >= (enemy.aiPhaseUntil ?? 0)) {
              // 溜め終了 → 突進開始(この瞬間のプレイヤー位置を狙う)。
              return { ...enemy, aiPhase: 'charge', aiTargetX: pcx, aiTargetY: pcy, aiPhaseUntil: gameTime + WEREWOLF_CHARGE_MAX_MS, vx: 0, vy: 0 };
            }
            const ws = enemy.speed * WEREWOLF_WINDUP_SPEED_MULT;
            const wvx = (pcx - ecx) / Math.max(0.001, dist) * ws;
            const wvy = (pcy - ecy) / Math.max(0.001, dist) * ws;
            const moved = resolveMove(enemy.x + wvx * deltaTime, enemy.y + wvy * deltaTime);
            return { ...enemy, vx: wvx, vy: wvy, x: moved.x, y: moved.y };
          }
          if (dist <= WEREWOLF_TRIGGER_RANGE && dist > 12 && gameTime >= (enemy.aiReadyAt ?? 0)) {
            return { ...enemy, aiPhase: 'windup', aiPhaseUntil: gameTime + WEREWOLF_WINDUP_MS, vx: 0, vy: 0 };
          }
          // それ以外は通常チェイス(下へフォールスルー)。
        }

        // パンプキン(pumpkin)ジャンプ攻撃AI: 少し外で縮み溜め(3秒)→1秒でその時のプレイヤー位置へ着地→1秒停止。
        // 研究所Lv3(lab-zombie-3)もパンプキンと同じ挙動(社長指示)。
        if (enemy.type === 'pumpkin' || enemy.type === 'lab-zombie-3') {
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
            if (t >= 1) {
              pumpkinLanded = true; // 着地 → set 後に画面揺れ
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
          if (dist <= PUMPKIN_TRIGGER_RANGE && dist > 12 && gameTime >= (enemy.aiReadyAt ?? 0)) {
            return { ...enemy, aiPhase: 'crouch', aiPhaseUntil: gameTime + PUMPKIN_CROUCH_MS, vx: 0, vy: 0 };
          }
          // それ以外は通常チェイス(下へフォールスルー)。
        }

        // Plants are nearly stationary — they shuffle slightly toward the
        // player but mostly hold ground and spit seeds. Everything else
        // does the standard VS straight-line chase, but with inertia: the
        // chase velocity eases toward the heading so enemies curve into turns
        // (~0.3s) rather than snapping to face the player.
        // 錬金術: aggro範囲内に通常召喚がいればそれを、いなければプレイヤーを狙う(中心同士)。
        const tgt = resolveEnemyTarget(enemy, player, summons, ALCHEMY_AGGRO_RANGE);
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

      return { enemies: updatedEnemies };
    });
    if (pumpkinLanded) get().triggerShake(PUMPKIN_LAND_SHAKE_MS, PUMPKIN_LAND_SHAKE_MAG);
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
    const strength = Math.max(1, Math.min(maxStrength, multiplier));
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
      const grenadeWallsFor = (p: Projectile) => {
        if (indoor) return indoorWalls; // 屋内は labMap の壁(+閉ドア)。木/トーチは無し。
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
            // スクラップ獲得数アップ(パッシブ): 取得量を scrapMult 倍に(+30%/回)。
            straps: state.player.straps + Math.max(1, Math.round(pickup.value * (state.player.scrapMult ?? 1)))
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
      case 'ammo-rifle':
      case 'ammo-phill': {
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
    set({ pendingLoadout: keys });
  },

  setPendingIndoor: (indoor) => {
    set({ pendingIndoor: indoor });
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
        meleeFinishComboUntil: state.gameTime + MELEE_FINISH_COMBO_WINDOW_MS,
        gameStats: {
          ...state.gameStats,
          maxCombo: Math.max(state.gameStats.maxCombo, nextCombo)
        }
      };
    });
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
    const maxHealth = profile.maxHp;
    // 固有スキル(クラス標準サブ武器)を最初から Lv1 所持で開始する。
    const innateSub = classSubWeaponFor(validClass);
    
    set(state => {
      // 出撃時の所持サブ = クラス固有(デフォルト)サブは常に所持 + 装備選択で選んだサブ。
      // フリー/メイン/(将来の)サブクエスト共通の経路。固有サブが落ちないようにする(社長指示)。
      // 商人(unlockedShopSkillCards)とレベルアップ候補(generateUpgradeOptions)もこの所持サブに絞られる。
      const loDedup = state.pendingLoadout.filter((k, i) => state.pendingLoadout.indexOf(k) === i);
      const runSubs: SubWeaponKey[] = state.danceTestMode
        ? ['shijin']
        : Array.from(new Set<SubWeaponKey>([innateSub, ...loDedup]));
      const runLevels: Partial<Record<SubWeaponKey, number>> = state.danceTestMode
        ? { shijin: state.danceTestLevel }
        : Object.fromEntries(runSubs.map(k => [k, 1])) as Partial<Record<SubWeaponKey, number>>;
      // 商人はこの出撃のサブだけ Lv3 まで販売(他は陳列しない)。練習/ベンチは空。
      const runShopUnlocks: Partial<Record<SubWeaponKey, number>> = state.danceTestMode
        ? {}
        : Object.fromEntries(runSubs.map(k => [k, 3])) as Partial<Record<SubWeaponKey, number>>;
      // 屋内(研究施設)ステージ初期化。選択ステージが indoor なら labMap から構築。
      const indoor = state.pendingIndoor && !state.danceTestMode;
      const spawnTL = indoor
        ? { x: LAB_PLAYER_SPAWN.x - PLAYER_HITBOX / 2, y: LAB_PLAYER_SPAWN.y - PLAYER_HITBOX / 2 }
        : { x: 0, y: 0 };
      const runDoors: LabDoor[] = indoor ? LAB_DOORS.map(d => ({ id: d.id, rect: d.rect, open: false })) : [];
      const runButtons: LabButton[] = indoor ? [{ ...LAB_BUTTON, pressed: false }] : [];
      const runProps: LabProp[] = indoor ? generateLabProps() : []; // 障害物をランダム配置(壁/ギミック回避)
      // UVライトバー=松明と同じ扱い(破壊可能)。type:'uv-bar' の breakableProp として配置(当たり判定は無し=屋内移動は labWalls/labProps のみ)。
      const runBreakables: BreakableProp[] = indoor
        ? LAB_UV_BARS.map((b, i) => ({
            id: `lab-uv-${i}`,
            x: b.x - 15, y: b.y - 24, width: 30, height: 26,
            footX: b.x, footY: b.y, scale: 1,
            health: 12, maxHealth: 12, type: 'uv-bar' as const, lastHit: 0,
          }))
        : [];
      // 固定・休眠の敵を配置(距離カリング対象外=fixed)。aggroRange 内でプレイヤーが入ると起床。
      const runEnemies: Enemy[] = indoor
        ? LAB_ENEMIES.map(e => ({ ...spawnEnemyAt(e.type, e.x, e.y, 0), fixed: true, dormant: true, aggroRange: e.aggroRange, vx: 0, vy: 0 }))
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
        : [];

      // World is infinite; player starts at the origin and the camera
      // follows. No need to pre-center within bounds.
      return {
        unlockedShopSkillCards: runShopUnlocks,
        indoorMode: indoor,
        labDoors: runDoors,
        labButtons: runButtons,
        labProps: runProps,
        hasCardKey: false,
        goalReachedAt: 0,
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
          vaccineRevives: 0
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
        summons: []
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

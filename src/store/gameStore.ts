import { create } from 'zustand';
import { generateEquipmentChoices } from '../utils/upgradeUtils';
import {
  Player, Enemy, Projectile, Pickup, BreakableProp, GameStats,
  InputState, UpgradeOption, GameBounds, CharacterClass,
  VisualEffect, AmmoType, Direction, SubWeaponKey, SkillKey, CastleEvent, DifficultyRank, EnemyColorTier,
  WeaponMerchant, ShopItemKey, StageTheme, EventQuestNpc, Summon,
  RhythmState, RhythmArrow, ShijinGod, RhythmPending, IntroLine, LabDoor, LabButton, LabProp,
  ActiveEvent, ShadowCloneState, BaseSite, EscortSoldier, EnemyType, Weapon, RedNight, GroundFire, BossFire, RescueAlly, ThrownBag
} from '../types/game';
import {
  MolotovCycleState, MOLOTOV_FIRE_LIFETIME_MS, MOLOTOV_DOT_INTERVAL_MS, MOLOTOV_DOT_DAMAGE, MOLOTOV_FIRE_RADIUS,
  isEnemyInGroundFire,
} from '../utils/molotov';
import { FirstAidKitState, createFirstAidKitState } from '../utils/firstAidKit';
import { SensorMineState, placeSensorMine, SENSOR_MINE_CAP_BY_LEVEL, SENSOR_MINE_CHARGE_COOLDOWN_MS, sensorMineChargesReady, consumeSensorMineCharge } from '../utils/sensorMine';
import { SupportSniperNpcState, SUPPORT_SNIPER_CD_MS_BY_LEVEL } from '../utils/supportSniper';
import { FlareGunFlare, activeFlareTargets, FLARE_GUN_CD_MS_BY_LEVEL, FLARE_GUN_FLIGHT_MS, FLARE_GUN_DURATION_MS } from '../utils/flareGun';
import { computeJunkShot, JUNK_WEAPON_PELLETS } from '../utils/junkWeapon';
import { buildBomberMinis } from '../utils/bomberScatter';
import {
  recordSubUse, recordOverclockProc, resetBotTelemetry,
  recordDamageDealt, recordFinisherKill, recordMeleeSwing,
} from '../utils/botTelemetry';
import { clampRectInsideCircle } from '../world/arena';
import { shouldFireFullJuiceCinematic } from '../utils/juiceEnvelope';
import {
  normalizeDir, biasedBurstAngle,
  shouldShowMultiHitFx, dedupeMultiHitEffects,
} from '../utils/dirFx';
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
import { getStartingWeapons, createWeapon, AMMO_FIELD, getActiveGun, getGuns, ammoPoolFor, effectiveMagSize, effectiveReloadMs, isReloading, RANGE_BY_CATEGORY, buildJunkWeaponPellets } from '../utils/weaponUtils';
import { pickAmmoDropType } from '../utils/ammoDrop';
import { rescueSignalProcChance, selectRescueSignalTarget, pickRescueSignalAllyClass } from '../utils/rescueSignal';
import { isLabOffscreenLost } from '../utils/labStealth';
import { isPlayerInAttackTelegraph } from '../utils/levelUpGate';
import { weaknessCritBonus } from '../utils/weaknessCrit';
import { applyEnemyCritPenalty } from '../utils/critPenalty';
import {
  type NamedFoeMeta, NAMED_TREASURE_GOLD, rollNamedSpawnThisRun, decidePromotionOnDeath,
  NAMED_HP_MULT, NAMED_DMG_MULT, NAMED_SIZE_MULT, pickNamedEnemyName, normalizeNamedName,
} from '../utils/namedEnemy';
import {
  getEventQuestConfig, questNamedSpawnPos, pickQuestNamedType, questKillProgress,
  QUEST_NAMED_AGGRO_RANGE,
} from '../utils/eventQuest';
import { openCrate } from '../utils/weaponDrop';
import { isBossType, isHiddenBoss, getsDramaticDeath, getEnemyColor, resolveEnemyTarget, spawnEnemyAt, areaIndexForPos, OFFSCREEN_RECYCLE_MARGIN, getEnemyBaseSpeed, setCorridorSpawn } from '../utils/enemyUtils';
import { CORRIDOR_LATERAL_CLAMP } from '../utils/corridorProjection';
import { CONTEXT_ZOOM_MIN } from '../utils/cameraZoom';
import { hunterWanderStep } from '../utils/hunterWander';
import {
  getSelectedStageId, getWallMeta, recordChronicle,
  getEventQuestMeta, setEventQuestMeta, markCastleBossCleared, syncQuestStageClear,
  updateStoryFlags, markMissionCleared,
  isKogarasuUnlocked, markKogarasuUnlocked,
  type WallMeta,
} from '../data/progress';
import { sortWallEventsByPriority, type WallEventKind } from '../utils/wallProgress';
import type { KomaAssessmentInput } from '../utils/rankAssessor';
import { getDirectorRewardMult } from '../utils/directorRankState';
import { recordKill, recordSpawn } from '../utils/killTelemetryState';
import { getPityDropTuning } from '../utils/pityState';
import { pickNpcLine } from '../data/npcLines';
import {
  buildSummon, ALCHEMY_RARE_CHANCE, ALCHEMY_MAX_NORMAL, ALCHEMY_AGGRO_RANGE,
  ALCHEMY_DESPAWN_DIST, ALCHEMY_FOLLOW_GAP_PX,
  ALCHEMY_ATTACK_RANGE, ALCHEMY_ATTACK_INTERVAL_MS, ALCHEMY_RARE_SUCTION_PULL_RANGE,
  ALCHEMY_RARE_SUCTION_MAX_TARGETS, ALCHEMY_RARE_SUCTION_SPEED, SHOP_ALCHEMY_COST,
  ALCHEMY_RARE_MELEE_INTERVAL_MS, ALCHEMY_RARE_MELEE_DAMAGE, ALCHEMY_RARE_SUCTION_RADIUS
} from '../utils/summonUtils';
import { resolveTreeCollision, treesInRegion, trunkRect, setTreesDisabled } from '../world/trees';
import { clearDestroyedObstacles } from '../world/destructibles';
import { resolveCityPropCollision } from '../world/cityProps';
import { resolveTorchCollision, torchRect, torchesInRegion, setTorchesDisabled } from '../world/torches';
import { mineAmbushAround, mineRect, minesInRegion, pressureMinesNearPlayer, setMinesDisabled } from '../world/mines';
import type { MineAmbushAnchor } from '../world/mines';
import { PLAYER_PROFILES } from '../data/playerProfiles';
import { skillMaxLevel, rollGachaSkill, rollSkillLevel, SKILLS, GACHA_PULL_COST, GACHA_REFUND_BY_RARITY, REVISIT_MISSION_ID } from '../data/campaign';
import type { SkillRarity } from '../data/campaign';
import { EQUIPMENT, equipmentById, aggregateEquipBonus, equipMaxHealthOf, neutralEquipBonus, emptyEquipLoadout } from '../data/equipment';
import { footRect, rectsOverlap, resolveAabb, segmentBlocked, type Rect } from '../world/obstacles';
import { enemyFootBox, enemyHeadY, enemyHitStrip } from '../pixi/renderSpec';
import { labWallsInRegion, labUvBarsInRegion, wallRect, labPropsInRegion, propRect } from '../world/labWalls';
import { LAB_DOORS, LAB_BUTTON, LAB_ENEMIES, LAB_PLAYER_SPAWN, LAB_MERCHANT, LAB_CARD_KEY, LAB_WEAPON_CRATE, LAB_CLEAR_ITEM, LAB_UV_BARS, LAB_AMMO_PICKUPS, labBlockingWalls, generateLabProps } from '../world/labMap';
import { HUNTING_MELEE_RADIUS_BONUS_BY_LEVEL } from '../config/hunting';
import { GAME_SPEED } from '../config/gameSpeed';
import { clampFinishKillOnlyHealth } from '../utils/finishKillOnly';
import { stunnedMeleeOutcome, ELITE_MELEE_STUN_MULT } from '../utils/meleeExecute';

// 四神舞(リズム)の初期状態。新規ラン/リセットで使い回す。
const initialRhythm = (): RhythmState => ({
  active: false, interval: RHYTHM_INTERVAL_MS, firstBeatAt: 0, expectBeat: 0, prompt: randomRhythmPrompt(), inputIndex: 0, inputArrows: [],
  godSuccess: 0, comboStage: 0, lastInputAt: 0, lastJudge: 'none', lastJudgeAt: 0, lastJudgeKind: 'none', lastJudgeArrow: null, judgeSeq: 0, lastTapAt: 0, lastFinishAt: 0, lastGod: null,
  invulnUntil: 0, byakkoUntil: 0, byakkoNextAt: 0, byakkoHits: 0, pending: [],
});

// RE-style ammo economy. Guns fire from a per-gun magazine and reload from
// these per-family RESERVE pools. The reserve starts large (you're well
// stocked) but ammo is hard to find, so the run is a slow drain on it.
export const AMMO_MAX: Record<AmmoType, number> = { handgun: 72, shotgun: 24, rifle: 36, phill: 48 };
// PACING_PUZZLE.md §5.5 M5(RE4式弾ドロップ・既定ON): ?ammosmart=0で従来(構え銃の弾種)へ。
// useGameLoop側の銃キル経路と同名パラメータ(各自読む=既存camNum等と同じ流儀)。
const AMMO_SMART_ENABLED = typeof window === 'undefined' || new URLSearchParams(window.location.search).get('ammosmart') !== '0';
// PACING_PUZZLE.md §5.6 M7(チャフの武器弱点クリティカル・既定ON): ?weakcrit=0で無効化。
// useGameLoop側の銃ヒット経路と同名パラメータ(各自読む=既存ammosmart等と同じ流儀)。
const WEAKCRIT_ENABLED = typeof window === 'undefined' || new URLSearchParams(window.location.search).get('weakcrit') !== '0';
// PACING_PUZZLE.md §5.16 M16(パンプキンのジャンプ距離上限・既定ON): ?pjcap=0で旧・無制限へ。
// デバッグボット実測(v0.25.1487)で採用=350。ハンターの視界サークルクランプと同じ式を移植。
const PUMPKIN_JUMP_CAP_ENABLED = typeof window === 'undefined' || new URLSearchParams(window.location.search).get('pjcap') !== '0';
export const PUMPKIN_JUMP_MAX_DIST = 350;
// PACING_PUZZLE.md §5.14 M13(宿敵/ネームド・既定ON): ?named=0で無効化(昇格判定・ラン抽選とも停止。
// directorTick.ts側の湧き注入もnamedFoeRunEligibleが常にfalseになるため自動的に湧かなくなる)。
export const NAMED_ENEMY_ENABLED = typeof window === 'undefined' || new URLSearchParams(window.location.search).get('named') !== '0';
// PACING_PUZZLE.md §5.17 M14(到達譜=二軸の壁・既定ON): ?walls=0で無効化(予告/儀式演出・
// ステージ毎メタの読み書きとも停止。ゾーン侵入バナー等の既存演出=eventBannerText系は不変)。
export const WALL_ENABLED = typeof window === 'undefined' || new URLSearchParams(window.location.search).get('walls') !== '0';
// PACING_PUZZLE.md §5.23 M22 Group A(A3・既定ON): 全キル(近接/銃/接触/爆発共通)の死亡ポップ
// (小リング+方向性スプレー・spawnSpray流用)。`?deathpop=0`で無効化。近接(grantMeleeKillRewards)・
// 銃/接触/爆発(damageEnemy)の両キル経路が同名パラメータを各自読む(既存ammosmart等と同じ流儀)。
const DEATHPOP_ENABLED = typeof window === 'undefined' || new URLSearchParams(window.location.search).get('deathpop') !== '0';
// PACING_PUZZLE.md §5.23 M22 Group B(B1・既定ON): レア(colorTier)/ネームド個体の湧き時に一瞬の
// 閃光+リング(pooled・one-shot)。`?spawnfx=0`で無効化。全スポーン経路の合流点=addEnemyで1回だけ発火。
const SPAWNFX_ENABLED = typeof window === 'undefined' || new URLSearchParams(window.location.search).get('spawnfx') !== '0';
// PACING_PUZZLE.md §5.23 M22 Group C(C1・既定ON): 既存の画面シェイク(triggerShake)/バースト粒子
// (spawnBurst)を、被弾/近接ヒット/キルの方向へ寄せる(新規エフェクト種は追加しない・引数を足すだけ)。
// `?dirfx=0`で無効化。useGameLoop側の銃ヒット経路も同名パラメータを各自読む(既存weakcrit等と同じ流儀)。
const DIRFX_ENABLED = typeof window === 'undefined' || new URLSearchParams(window.location.search).get('dirfx') !== '0';
// PACING_PUZZLE.md §5.23 M22 Group C(C3・既定ON): 1スイング/1発で複数の敵に当たった時、
// プレイヤー頭上に「N HITS」bitmap-text+小フラッシュ(既存spawnRing/spawnGlow流用)。
// `?multifx=0`で無効化。既存registerMultiHit(全6箇所の多段ヒット経路)に相乗り=呼び出し側の追加配線なし。
const MULTIFX_ENABLED = typeof window === 'undefined' || new URLSearchParams(window.location.search).get('multifx') !== '0';
// B1の色分け(pixiScene.tsのENEMY_COLOR_TIER_BODY_TINT/NAMED_TINTと同じ配色を、レンダラ非依存の
// gameStore側でも別途保持=XP_ORB_COUNT_BY_COLOR_TIERと同じ「層ごとに独立テーブルを持つ」流儀)。
const ENEMY_COLOR_TIER_FX: Record<EnemyColorTier, string> = {
  blue: 'rgba(59,130,246,',
  purple: 'rgba(168,85,247,',
  red: 'rgba(239,68,68,',
};
const NAMED_FX_COLOR = 'rgba(255,215,0,'; // NAMED_TINT(0xffd700)と同色。resolveNamedFoeDefeatの金色とも統一。
// 血飛沫(ZELTER風・社長指示v0.25.2027): 旧3コマスプライトは素材に「重力で落ちる弧」が焼き込まれ、
// 上/斜めに撃つと弧の向きが不自然だった。微粒子をヒット方向へ噴射し重力で落とす方式に置換=全方向で自然。
// pooled particle経路(drawParticleSprite・liquid)にそのまま乗せる=新しい描画方式は作らない。
const BLOOD_PARTICLE_CAP = 120;            // 生きている血粒子(id接頭辞 'fx-bloodp-')の同時上限(塗り面積の暴発止め)。90→120(社長指示v0.25.2058増量・KILL2連が欠けない量)
const BLOOD_CONE = (20 * Math.PI) / 180;   // 噴射コーン半角=±20°(社長指定)
const BLOOD_GRAVITY = 420;                 // 血粒子だけ重力で常に画面下へ落とす(px/s²)。他パーティクルは未指定=0。
// 【注意】粒子色は rgba() 形式で書くこと: 描画側の glowTint は rgba(...) しかパースできず、
// hex(#rrggbb)は白(0xffffff)にフォールバックする(v0.25.2029で白い血になった実バグの教訓)。
const BLOOD_BIG_COLOR = 'rgba(127,29,29,1)';         // 大粒(塊感)の暗赤(#7f1d1d相当)
const BLOOD_SMALL_COLORS = ['rgba(220,38,38,1)', 'rgba(185,28,28,1)', 'rgba(153,27,27,1)']; // 小粒の赤(飛沫の主体)
// 生きている血粒子の数(キャップ判定用)。id接頭辞で数える=旧'blood'kindや他fxと混ざらない。
const countBloodParticles = (effects: VisualEffect[]): number => {
  let n = 0;
  for (const e of effects) if (e.id.startsWith('fx-bloodp-')) n++;
  return n;
};
// (x,y)から方向angleへ円錐±20°で粒子を噴くバースト。塊感の大粒(約3割)+赤の小粒。中心ほど速く、
// 少し上向きバイアスで噴き上げてから重力で落ちる。銃/近接どちらの血飛沫もこの1関数から作る(見た目統一)。
const buildBloodBurst = (x: number, y: number, angle: number, count: number, now: number): VisualEffect[] => {
  const fresh: VisualEffect[] = [];
  for (let i = 0; i < count; i++) {
    const spread = Math.random() * 2 - 1;                 // [-1,1]=コーン内の左右位置
    const a = angle + spread * BLOOD_CONE;
    const speed = 190 + (1 - Math.abs(spread)) * 270 + Math.random() * 170; // 中心ほど速い(190〜630px/s・v0.25.2030で勢い増)
    const big = Math.random() < 0.3;                      // 約3割は塊感のある大粒
    const size = big ? 4.5 + Math.random() * 3 : 2.2 + Math.random() * 1.8; // +約30%(v0.25.2045目立ち増強)
    const color = big ? BLOOD_BIG_COLOR : BLOOD_SMALL_COLORS[(Math.random() * BLOOD_SMALL_COLORS.length) | 0];
    fresh.push({
      kind: 'particle',
      id: `fx-bloodp-${now}-${i}-${Math.random().toString(36).slice(2, 6)}`,
      x, y,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed - Math.random() * 30,        // 少し上向きバイアス=噴き上げ感(控えめ)
      color,
      size,
      createdAt: now,
      duration: 380 + Math.random() * 240,                 // 380〜620ms
      drag: 2.7,                                           // 減衰やや軽め=飛距離を伸ばす(v0.25.2030で勢い増。egg=3.4)
      liquid: true,
      stretch: true,                                       // 速度方向に伸ばして線状の飛沫に(白芯も有効・v0.25.2041)
      gravity: BLOOD_GRAVITY,                              // 血だけ重力で落下(他呼び出しは未指定=挙動不変)
    });
  }
  return fresh;
};
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
// 建物1.5倍に合わせ足元判定も拡大(社長指示): 横×1.5 / 縦は上へ×1.2。
const CASTLE_COLLISION_W = 168; // 112 * 1.5
const CASTLE_COLLISION_H = 50;  // 42 * 1.2 ≈ 50
const CASTLE_FOOT_OFFSET_Y = 38;
const MERCHANT_INTERACT_RADIUS = 58;
const MERCHANT_REOPEN_DELAY_MS = 1500;
// 武器商人: サークル内に連続滞在でショップが開くまでの時間(社長指示v0.25.1842「サークルに3秒滞在で
// 話しかけれる」=旧・近接スイング開店を置換)。帰還/クエスト円の3秒滞在と同じ操作感。
export const MERCHANT_TALK_DWELL_MS = 3000;
const EVENT_NPC_MIN_DISTANCE = 460;
const EVENT_NPC_MAX_DISTANCE = 950;
const EVENT_NPC_INTERACT_RADIUS = 64;
const EVENT_NPC_REOPEN_DELAY_MS = 1500;
export const SHOP_AMMO_COST = 10;
export const SHOP_DOG_COST = 100;
export const SHOP_CLASS_SKILL_COST = 100;
export const SHOP_MEDKIT_COST = 50;
export const SHOP_VACCINE_COST = 500;
export const SHOP_SUBWEAPON_SELL_VALUE = 100; // 商人: サブウェポン換金額(1個=100s)
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

// 制圧イベント(ステージ1メインミッション等のサブクエスト時のみ有効・通常は無効)。
// 原点中心・半径3200の円周に4か所(90度刻み=東西南北)固定。サークル内10秒で制圧→武器商人がそこへ移動(=安全地帯)。
// captured拠点はHPを持ち、画面内では攻撃者(敵)が削り/軍人が反撃、画面外は時間で減る。HP0で陥落(open化)。
// 4拠点が同時にcapturedで「全拠点制圧」→既存クリア経路(帰還サークル)へ。
const BASE_SITE_RADIUS = 3200;          // 拠点を置く円の半径(デンジャーゾーン内)
const BASE_SITE_COUNT = 4;              // 拠点の数(東西南北=90度刻み・社長指示で8→4)
export const BASE_CAPTURE_RADIUS = 130; // 制圧サークルの半径(滞在/在内判定)
export const ARMORY_RADIUS = 50;        // 制圧拠点中央の「武器庫」サークル半径(小さめ。指を離すと遠隔で武器商人)
export const BASE_CAPTURE_HOLD_MS = 10000; // 制圧に必要な滞在時間(描画の進捗にも使用)
export const SUPP_HP_MAX = 100;            // 拠点HP上限
const SUPP_DRAIN_PER_SEC = 5;           // 画面外captured拠点のHPドレイン(ゆるめ・実機調整)
const SUPP_ATTACKER_DPS = 9;            // 画面内: 攻撃者が生存中に拠点HPを削る量/秒
const SUPP_REGEN_PER_SEC = 14;          // プレイヤー在内/安全地帯のHP回復/秒
const SUPP_ATTACKER_RESPAWN_MS = 30000; // 攻撃者撃破後の再湧き(この間は被ダメ無し)
const SUPP_ATTACKER_FIRST_MS = 4000;    // 制圧後、最初の攻撃者が来るまで(短め=軍人がすぐ動く。社長報告対応)
const SUPP_SOLDIER_INTERVAL_MS = 900;   // 軍人の射撃間隔
const SUPP_SOLDIER_DMG = 6;             // 軍人1射の攻撃者へのダメージ(2体ぶん毎回)
const SUPP_SOLDIER_COUNT = 2;           // 1拠点あたりの駐留軍人数(描画/反撃)
const SUPP_SOLDIER_SPEED = RESCUE_SURVIVOR_SPEED; // 軍人の移動速度=レスキュー通常速(社長指示で 150→40 相当)
const SUPP_SOLDIER_ENGAGE_DIST = 26;    // 攻撃者へ寄る最終距離(かなり至近=商人に被らせない)
// 旧「拠点が襲われる(攻撃者湧き/HPドレイン/陥落)」システムは一旦撤廃(社長指示)。flag=false で無効化。
// 戻したくなったら true に戻すだけ(コードは残置)。
const SUPP_BASE_ATTACKS_ENABLED: boolean = false;
// 護衛軍人NPC(EscortSoldier): スタート時4人配置→担当拠点へ前進→近くの敵に射撃→10秒占拠で解放。
const ESCORT_SPEED = RESCUE_SURVIVOR_SPEED; // 前進速度=レスキューと同じ通常速(社長指示)。画面内のときだけ前進。
const ESCORT_FIRE_INTERVAL_MS = 600;    // 射撃間隔
const ESCORT_DMG = 8;                   // 1射のダメージ
// フェイザー(名簿index7)は特別: 2丁拳銃で1射につき2発撃つ=合計ダメージ2倍(1発は通常と同じ)。
// ただしレアなので出現率が低い(社長指示)。
// フェイザーの名簿index(レア枠)。援護射撃のNPC選定(supportSniper)もこの値でレア性を保つためexport。
export const PHASER_INDEX = 7;
// チュートリアルの随行衛生兵(EscortSoldier流用)の特別soldierIndex。名簿(BASE_SOLDIERS)外なので
// セリフ系はtutorialゲートで全停止し、描画はpixiScene側で 'npc/medic-walk'(4コマピンポン)に差し替える。
export const TUTORIAL_MEDIC_INDEX = 100;
// チュートリアルの随行軍人=レスキューイベントのヘルメット兵(社長指示v0.25.1827「軍人はレスキュー
// イベントの時のヘルメットしてるNPC」)。名簿外indexにすると drawEscorts の ESCORT_SPRITE_BASE
// フォールバック('rescue/shooter')がそのまま使われる(2コマ歩行)。
export const TUTORIAL_SOLDIER_INDEX = 101;
// チュートリアルの上下移動制限(プレイヤー中心yがスポーン(0)から±この値まで・透明な壁)。
// 縦カメラ=プレイヤー1:1追従とセットで、被写界深度の構図を守る(社長指示v0.25.1826)。
export const TUTORIAL_MOVE_Y_LIMIT_PX = 100; // v0.25.1828: 社長指示「100pxに増やします」で50→100
// チュートリアルの帰還サークル位置(最初から常設・社長指示v0.25.1829「最初から帰還サークルを右3000px地点に設置」)。
const TUTORIAL_RETURN_CIRCLE_X = 3000;
// チュートリアルの左端(プレイヤー中心xの下限=スタートから左100pxで透明な壁・社長指示v0.25.1829)。
export const TUTORIAL_MOVE_X_MIN_PX = -100;
const PHASER_GUN_OFFSET = 5;           // 2丁拳銃の左右ずらし幅(px。進行方向に直交)
const PHASER_APPEAR_CHANCE = 0.2;      // 出撃ごとに「フェイザーが1枠だけ入る」確率(レア)。0=出ない/1=必ず
const ESCORT_DETECT_MULT = 2.25;        // 検知/射撃範囲 = プレイヤー近接半径 × この倍率(社長指示で 1.5→×1.5=2.25)
const ESCORT_PATROL_R = 0.8;            // 制圧後に巡回する円の半径(BASE_CAPTURE_RADIUS×この割合=縁寄り。社長指示)
// 制圧時、サークルの端寄りにランダムに軍人を配置(真ん中=商人と被る を回避)。
const makeBaseSoldiers = (cx: number, cy: number): { x: number; y: number; hx: number; hy: number }[] => {
  const arr: { x: number; y: number; hx: number; hy: number }[] = [];
  for (let i = 0; i < SUPP_SOLDIER_COUNT; i++) {
    const ang = Math.random() * Math.PI * 2;
    const rad = BASE_CAPTURE_RADIUS * (0.55 + Math.random() * 0.35); // 0.55〜0.90R=端の方
    const hx = cx + Math.cos(ang) * rad;
    const hy = cy + Math.sin(ang) * rad;
    arr.push({ x: hx, y: hy, hx, hy });
  }
  return arr;
};
// チュートリアルの随行NPC(社長指示v0.25.1823「軍人NPCと衛生兵も出撃。基本プレイヤーについてくる。
// 軍人、衛生兵の順番」)。EscortSoldierを流用(描画/影/地平フェードを共用)し、移動はuseGameLoopの
// 追従チェーン(stepFollowChain)が担当。軍人=エドガー(index0・仮キャスト)/衛生兵=専用index。
const makeTutorialCompanions = (px: number, py: number): EscortSoldier[] => [
  { id: 'escort-tutorial-soldier', baseId: 'base-0', x: px - 46, y: py + 8, face: 1, soldierIndex: TUTORIAL_SOLDIER_INDEX, fireAt: 0, dwellMs: 0, moving: false },
  { id: 'escort-tutorial-medic', baseId: 'base-1', x: px - 92, y: py + 16, face: 1, soldierIndex: TUTORIAL_MEDIC_INDEX, fireAt: 0, dwellMs: 0, moving: false },
];

// 護衛軍人NPCを4人生成(各拠点 base-0..3 担当)。プレイヤー出撃地点の近傍に少し散らして配置。
// 洋館通路の護衛初期配置(v0.25.2123・社長指示): プレイヤーの真ん中を開けて横一列(重ならない)。
const CORRIDOR_ESCORT_ROW_X = [-110, -55, 55, 110];
const makeEscorts = (px: number, py: number, corridorRow = false): EscortSoldier[] => {
  const arr: EscortSoldier[] = [];
  // 名簿(素性)= フェイザー(7)を除く全軍人プールから、出撃ごとに BASE_SITE_COUNT 人をランダム抽選
  // (Fisher-Yates)。これで顔ぶれが毎回変わる(以前は 0..3 固定で常に同じ4人だった)。
  // レアでフェイザー(7)が1枠だけ差し込まれる(社長指示・PHASER_APPEAR_CHANCE は据え置き)。位置は baseId(base-i)で固定。
  const pool = Array.from({ length: BASE_SOLDIERS.length }, (_, k) => k).filter(k => k !== PHASER_INDEX);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const roster = pool.slice(0, BASE_SITE_COUNT);
  if (Math.random() < PHASER_APPEAR_CHANCE) {
    roster[Math.floor(Math.random() * BASE_SITE_COUNT)] = PHASER_INDEX;
  }
  for (let i = 0; i < BASE_SITE_COUNT; i++) {
    const ang = (Math.PI * 2 * i) / BASE_SITE_COUNT;
    const rowX = CORRIDOR_ESCORT_ROW_X[i] ?? (i - (BASE_SITE_COUNT - 1) / 2) * 60;
    arr.push({
      id: `escort-${i}`,
      baseId: `base-${i}`,
      // 通路: 横一列(中央=プレイヤーの枠を空ける)。通常: 出撃地点の周りに円形に散らす。
      x: px + (corridorRow ? rowX : Math.cos(ang) * 36),
      y: py + (corridorRow ? 8 : Math.sin(ang) * 36),
      face: corridorRow ? (rowX < 0 ? -1 : 1) : (Math.cos(ang) < 0 ? -1 : 1),
      soldierIndex: roster[i], // 名簿(素性)。位置(sector)は baseId 基準で別管理。
      fireAt: 0,
      dwellMs: 0,
      wasSurrounded: false,
      companionMs: 0,
    });
  }
  return arr;
};
// 各拠点(base-0..7)の駐留軍人。名前/セリフは「制圧時」「撤退時(拠点喪失)」にコールアウトで出るのみ。
// 拠点を失っても死亡ではなく撤退する(実体はもともと描画のみ)。
// sortie=出撃時 / surrounded=敵に囲まれた時 / rescued=囲まれから助けてもらった時 / pushback=後退する時 /
// baseNear=拠点が見えてきた時 / companion=並走時 / baseCaptured=拠点解放時 / neglectFar=遠方で放置(隣NPCのみ) /
// npcKill=自分で倒した時 / opPrep=作戦準備が進んだ時 / praise=プレイヤー無双時(管理表準拠)。capture/retreat は既存。
const BASE_SOLDIERS: { name: string; capture: string; retreat: string; sortie: string; surrounded: string; rescued: string; pushback: string; baseNear: string; companion: string; baseCaptured: string; neglectFar: string; npcKill: string; opPrep: string; praise: string }[] = [
  { name: 'エドガー',   capture: 'まかせろ！',       retreat: '撤退だ！',     sortie: '東部隊、前進を開始する。援護は任せた。', surrounded: '囲まれた。突破口を作る。', rescued: '助かった。今ので前線を戻せる。', pushback: '東部隊、押されている。可能なら援護を。', baseNear: '見えた。あれが東部拠点だ。', companion: 'この距離なら押せる。足を止めるな。', baseCaptured: '東部拠点、確保。ここから押し返す。', neglectFar: '東部隊、押されている。可能なら援護を。', npcKill: '一体排除。進軍を再開する。', opPrep: '作戦準備が進んだ。次が見えてきたな。', praise: '見事だ。こちらも遅れるわけにはいかない。' },
  { name: 'ジョセフ',   capture: '了解！',           retreat: '失敗！',       sortie: '南は俺が行く！派手に道を開けようぜ！', surrounded: '囲まれた！笑えない数だ！', rescued: '助かった！今のは正直キツかった！', pushback: 'まずい、押されてる！一歩下がる！', baseNear: '見えた見えた！南部拠点だ！', companion: 'いいねえ、足並み合ってる！', baseCaptured: '南部拠点、いただきだ！', neglectFar: '南、ちょい劣勢！助けに来てもいいんだぜ！', npcKill: 'よし、一丁上がり！', opPrep: 'いいぞ、作戦が前に進んだ！', praise: 'おいおい、全部持ってく気かよ！' },
  { name: 'エリザベス', capture: 'わかったわ！',     retreat: '覚えてなさい！', sortie: '西部ルートへ向かいます。救助者がいれば優先を。', surrounded: '包囲されています。負傷リスクが高い。', rescued: '助かりました。こちらの損耗を抑えられます。', pushback: '押されています。態勢を立て直します。', baseNear: '西部拠点を視認。あと少しです。', companion: 'この距離なら支援できます。', baseCaptured: '西部拠点を確保。救助者を受け入れられます。', neglectFar: '西部隊、足止めされています。援護を要請。', npcKill: '敵を排除。進路を確保します。', opPrep: '準備が進みました。次の作戦に必要です。', praise: 'すごい火力です。ですが油断しないで。' },
  { name: '武蔵',       capture: '御意。',           retreat: '無念。',       sortie: '北へ出る。', surrounded: '囲まれた。', rescued: '助かった。前へ出る。', pushback: '下がる。', baseNear: '見えた。北部拠点だ。', companion: '進む。', baseCaptured: '北部拠点、確保。', neglectFar: '北、押されている。', npcKill: '斬った。進む。', opPrep: '作戦が進んだ。', praise: '見事。' },
  { name: 'ムハンマド', capture: 'オーライ！',       retreat: 'クソー！',     sortie: 'よし、行くぞ！道は力で開ける！', surrounded: '囲まれたか。上等だ！', rescued: '助かったぜ！借りは返す！', pushback: 'くそ、押し返される！', baseNear: '拠点が見えた。もうひと押しだ！', companion: 'いい並びだ。悪くない。', baseCaptured: '確保完了！ここは俺たちの場所だ！', neglectFar: 'こっちは詰まってる。暴れに来い！', npcKill: 'どけってんだ！', opPrep: 'いい進みだ。作戦が動いたぞ！', praise: '派手にやるなあ！こっちも燃えてきた！' },
  { name: 'チェン',     capture: '守り切る！',       retreat: 'あきらめない！', sortie: '進軍開始。周囲を確認します。', surrounded: '包囲傾向。脱出路を確保してください。', rescued: '支援確認。進軍を再開します。', pushback: '圧力上昇。後退します。', baseNear: '目標拠点を確認。', companion: '距離良好。支援可能です。', baseCaptured: '拠点解放を確認。周辺警戒を継続します。', neglectFar: 'こちらは停滞中。援護があれば進めます。', npcKill: '対象排除。脅威低下。', opPrep: '作戦準備の進行を確認。', praise: '敵の密度が急速に下がっています。好機です。' },
  { name: 'ローレン',   capture: '私も頑張る！',     retreat: 'くやしい！',   sortie: '行くよ。壊れた道を直すのはいつもこっちだ。', surrounded: '囲まれた。最悪、でも想定内。', rescued: '助かった。文句はあとで言う。', pushback: '下がる。無理して壊れるよりマシ。', baseNear: '拠点が見えた。やっと使える場所だ。', companion: '悪くないペース。今のところはね。', baseCaptured: '確保。ここなら補給線を組める。', neglectFar: 'こっちは停滞中。手が空いたら来て。', npcKill: '一体処理。次。', opPrep: '作戦準備、ひとつ片付いたね。', praise: 'あんた、ほんとに一人で軍隊みたいだね。' },
  { name: 'フェイザー', capture: 'やるしかねぇ・・・', retreat: '冗談だろ？',   sortie: '進軍を開始する。変異反応に注意しろ。', surrounded: '囲まれたな。興味深いが危険だ。', rescued: '介入を確認。生存率が上がった。', pushback: '後退する。標本になる気はない。', baseNear: '拠点を視認。ここを固定点にする。', companion: '近接距離を維持しろ。観測しやすい。', baseCaptured: '拠点確保。観測拠点として使える。', neglectFar: 'こちらは停滞している。汚染圧が高い。', npcKill: '対象を沈黙させた。', opPrep: '作戦条件が一つ満たされた。', praise: '異常な殲滅速度だ。記録しておく。' },
];
// 軍人名簿の人数(=ESCORT_SPRITE_BASE のスプライト数と一致)。援護射撃のNPC選定で使うためexport。
export const BASE_SOLDIER_COUNT = BASE_SOLDIERS.length;
// NPCセリフのHUD表示タイミング(gameTime ms)。1行の表示時間と、次の行までの間隔。
export const NPC_DIALOGUE_MS = 2800;     // 1行の表示時間(ストーリーボスの終幕台詞の尺計算でも使用)
export const NPC_DIALOGUE_GAP_MS = 500;  // 行間の空き(連続表示でも詰めすぎない)
const NPC_SAME_NPC_CD_MS = 10000; // 同一NPCの連続発話を抑制(管理表 8〜12秒)
// 「敵に囲まれた時」検知/抑制(社長指示・管理表 High=危機/カテゴリCD必須)。
const SURROUND_RADIUS = 200;      // この距離内の敵数で「囲まれ」を判定
const SURROUND_COUNT = 3;         // 周囲この数以上で囲まれと判定(社長指示で4→3)
const SURROUND_CAT_CD_MS = 40000; // 囲まれカテゴリの再発話CD(管理表 30〜60秒)
const RESCUED_FREE = 1;           // 囲まれ後、周囲の敵がこの数以下に減ったら「解放=助けられた」
const RESCUED_CAT_CD_MS = 30000;  // 助けられたカテゴリの再発話CD
// 「後退する時」(後退システム未実装の代理): プレイヤーが遠く放置している未制圧担当NPCが、たまにランダムで漏らす。
const NEGLECT_DIST = 900;             // プレイヤーからこの距離以上=放置とみなす(px)
const RETREAT_CHANCE_PER_SEC = 0.012; // 放置中に後退セリフを漏らす毎秒確率(たまーに)。CDで更に間引く
const RETREAT_CAT_CD_MS = 45000;      // 後退カテゴリの再発話CD
// 「拠点が見えてきた時」: 担当NPCが拠点中心へこの距離まで近づいたら=あと少し(進軍率≒80%/拠点が近距離)。
const NEAR_BASE_DIST = 600;           // 拠点中心からこの距離内で「見えてきた」
const BASE_NEAR_CAT_CD_MS = 25000;    // 拠点視認カテゴリの再発話CD
// 「並走時」(頻度かなり低め): プレイヤーと近距離で一定時間並走したら、たまに漏らす。
const COMPANION_DIST = 240;           // プレイヤーがこの距離内=並走中
const COMPANION_HOLD_MS = 5000;       // この時間 連続で並走したら発話候補
const COMPANION_CHANCE_PER_SEC = 0.03; // 並走成立後に漏らす毎秒確率(低め)
const COMPANION_CAT_CD_MS = 60000;    // 並走カテゴリの再発話CD(管理表 60秒以上)
// 「拠点解放時」(Critical): 制圧と同時に1回。バナー/SEと併用。
const BASE_CAPTURED_CAT_CD_MS = 8000; // 拠点解放カテゴリの再発話CD(拠点は順次なので短め)
// 「遠方で放置(隣NPCのみ)」(社長確定条件): 誰も進軍を手伝っていない(プレイヤーが全護衛から遠い)時、
// プレイヤーの現在エリア起点で時計回りに最初の未開放エリアのNPCが1人だけ低頻度で反応。
const HELPING_DIST = 600;             // プレイヤーがこの距離内に護衛が居れば「手伝っている」とみなす
const NEGLECT_FAR_CHANCE_PER_SEC = 0.02; // 放置時に漏らす毎秒確率(低め)
const NEGLECT_FAR_CAT_CD_MS = 45000;  // 放置カテゴリの再発話CD
// 「NPCが自分で敵を倒した時」(A案・低頻度): 護衛弾(weaponKey='escort')の撃破時、撃破地点に最も近い護衛が反応。
const NPC_KILL_CAT_CD_MS = 25000;     // NPC撃破カテゴリの再発話CD(連発防止・低頻度)
const NPC_KILL_MAX_DIST = 1000;       // 撃破地点からこの距離内に護衛が居る時のみ(誤帰属防止)
// 「作戦準備が進んだ時」(社長確定: イベント系クリアで、その地域に対応するNPCが反応)。
const OP_PREP_CAT_CD_MS = 30000;      // 作戦準備カテゴリの再発話CD
// 「プレイヤー無双時」(社長指示: 出撃キャップ無し・三國無双風に頻繁=CDのみ)。短時間に多数撃破で近くの護衛が称賛。
export const PRAISE_WINDOW_MS = 4000; // この時間内の撃破数で無双判定(useGameLoopの撃破カウントで使用)
export const PRAISE_KILL_COUNT = 6;   // 窓内この数以上の撃破で無双
const PRAISE_CAT_CD_MS = 12000;       // 称賛カテゴリの再発話CD(暴れ続ける間は繰り返し出る)
const PRAISE_WITNESS_DIST = 700;      // 護衛がプレイヤーからこの距離内(=画面内で見ている)時のみ称賛
// 軍人は拠点固定ではなく「制圧順」で割り当てる(どの拠点でも1人目=エドガー)。
const soldierByIndex = (idx: number): { name: string; capture: string; retreat: string } | null =>
  idx >= 0 ? BASE_SOLDIERS[idx % BASE_SOLDIERS.length] : null;
const createBaseSites = (): BaseSite[] => {
  const sites: BaseSite[] = [];
  for (let i = 0; i < BASE_SITE_COUNT; i++) {
    const angle = (Math.PI * 2 * i) / BASE_SITE_COUNT;
    sites.push({
      id: `base-${i}`, x: Math.cos(angle) * BASE_SITE_RADIUS, y: Math.sin(angle) * BASE_SITE_RADIUS,
      status: 'open', hp: 0, dwellMs: 0, attackerId: null, attackerRespawnAt: 0, soldierFireAt: 0,
      soldierIndex: -1, soldiers: [],
    });
  }
  return sites;
};

// 拠点の方位名(社長指示v0.25.1630「拠点は方位で、北の拠点を開放 とか」)。拠点は原点中心の円周90度刻み
// (createBaseSites)=常にいずれかの基本方位軸上に乗る。y+ が画面下=南 / y- が上=北(標準スクリーン座標)。
// 支配軸で判定(拠点座標は片軸が~0なので厳密)。
const baseCompassLabel = (x: number, y: number): string =>
  Math.abs(x) >= Math.abs(y) ? (x >= 0 ? '東' : '西') : (y >= 0 ? '南' : '北');

// 帰還フェーズ(フィナーレボス撃破/終了アイテム後): 即勝利せず帰還サークルへ誘導。3秒とどまると帰還完了=gameWon。
const RETURN_CIRCLE_RADIUS = 95;        // 帰還サークル半径(円コリジョン)
export const RETURN_CIRCLE_HOLD_MS = 3000; // とどまる時間=帰還完了(描画の進捗にも使用)
// ステージ6(洋館通路)のゴール(社長指示v0.25.2132): 4000px付近のハッチ床の上で5秒滞在=ゴール(例のサークル)。
// 位置は床タイル境界(FLOOR_REPEAT=520)に揃えて8枚目[3640,4160)をハッチ床に差し替え→中心=3900
// (=「4000px付近」。境界を520の倍数に置くと通常床と紋様が継ぎ目なく繋がる)。前進=負方向。
// サークル位置の補正(社長指示v0.25.2140「扉の床と同じ位置に」): サークル=真上見下ろしの世界レイヤー/
// ハッチ=疑似3D床(corridorLayer)で投影が違うため、タイル中心3900に円を置くと到達時に円だけ上に見える。
// 「ハッチが画面中央(プレイヤーの真下)に見える」のは d=focal*(1/s-1)≒513px 手前に立った時
// (s=(0.5-horizonYr)/(footYr-horizonYr)≒0.45・corridorLayerのCFG連動)なので、円は 3900-513≒3390 に置く。
export const CORRIDOR_GOAL_Y = -3390;        // ゴールサークル中心のworld y(到達時にハッチと重なる補正済み。x=通路中央0)
export const CORRIDOR_RETURN_HOLD_MS = 5000; // 通路ゴールの滞在時間(社長指示「5秒停止」。他ステージの3秒は不変)
const RETURN_CIRCLE_AVOID_DIST = 240;   // プレイヤーから最低この距離を空けて出現(避ける)
// 帰還サークルに入った瞬間に撤去する設置物(置き攻撃の出入りハメ防止)。トラップ/手榴弾/タレット/デコイ。
const RETURN_CLEAR_WEAPON_TYPES = new Set(['grenade', 'trap', 'turret', 'decoy']);
// ホーミング弾: 指を離した瞬間にロック済み敵へ追尾弾を一斉発射するサブウェポン。
// 発射はstore の fireHoming(VirtualJoystick 指離し)、ロック管理は useGameLoop が毎フレーム更新。
const HOMING_MISSILE_SIZE = 10;
const HOMING_MISSILE_SPEED = 200;          // px/s やや遅め(誘導ロケット感)。TODO仮値
const HOMING_MISSILE_DURATION_MS = 3500;
const HOMING_MISSILE_DAMAGE = Math.round(42 / 3); // 14 = 手榴弾(42)の1/3(直撃ダメージ。据え置き)
const HOMING_MISSILE_TURN_RATE = 5.0;      // rad/s TODO(ホーミング): 仮値
const HOMING_EXPLOSION_RADIUS = 66;        // 命中時の爆発半径(手榴弾と同じ HEAVY_GRENADE_RADIUS)
const HOMING_COOLDOWN_MS = 5000;           // 社長指示: 5秒
// プレイヤーが帰還サークル内にいるか。内側では攻撃を停止する(置き攻撃の出入りハメ防止)。
export const isInReturnCircle = (player: Player, rc: { x: number; y: number; radius: number } | null): boolean => {
  if (!rc) return false;
  const px = player.x + player.width / 2;
  const py = player.y + player.height / 2;
  return Math.hypot(rc.x - px, rc.y - py) <= rc.radius;
};


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
// 武器商人はスタート地点(原点)に常駐(社長指示)。各拠点中央の「武器庫」から遠隔利用もできる。
// 開始直後に誤発動しないよう、スポーン(原点)から少し上にずらして設置。
const createWeaponMerchant = (): WeaponMerchant => ({
  x: 0,
  y: -130,
  radius: MERCHANT_INTERACT_RADIUS,
});
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
    dwellMs: 0,
    leftSinceAccept: true, // 生成直後は「外に居た」扱い=初回はそのまま受領できる
  };
};
// 二人組(クエストNPC)の受領方式(社長指示v0.25.1681): 会話ポップアップ廃止。会話サークル内に
// EVENT_QUEST_DWELL_MS(3秒)居続けると強制受領(拠点解放と同じメーター表示)。会話は左上のNPC会話
// (npcDialogueQueue)へ流す。行データは旧EventQuestMenuのDIALOGUEから移設。
export const EVENT_QUEST_DWELL_MS = 3000;
// 二人組の会話文面は統合正本の確定稿へ移行(utils/eventQuest.ts の EVENT_QUEST_LINES_FORCED /
// EVENT_QUEST_SUB_ACCEPT_LINES / EVENT_QUEST_SUB_COMPLETE_LINES / EVENT_QUEST_ENCOUNTER_LINES)。
// 旧仮テキスト(v0.25.1719)は廃止。話者名は据え置き: 女=ミラ / 男=グレン(NpcDialogueのバストアップ対応)。
// 納品(完了)報酬のゴールド(社長裁定v0.25.1686 #5「報酬は100で」。強制/サブ各)。
export const EVENT_QUEST_REWARD_GOLD = 100;
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
const OWNED_SKILL_LEVELS_KEY = 'zombie:ownedSkillLevels'; // 所持スキルのLv(ガチャで上がる・永続)
const loadSkillLevels = (): Partial<Record<SkillKey, number>> => {
  try { const r = localStorage.getItem(OWNED_SKILL_LEVELS_KEY); const o = r ? JSON.parse(r) : {}; return (o && typeof o === 'object') ? o : {}; }
  catch { return {}; }
};
const saveSkillLevels = (m: Partial<Record<SkillKey, number>>): void => {
  try { localStorage.setItem(OWNED_SKILL_LEVELS_KEY, JSON.stringify(m)); } catch { /* ignore */ }
};
// ガチャの永続状態: スキル別「被り回数(dupeCount)」と「直近superからのpull数(pity)」。
const GACHA_DUPES_KEY = 'zombie:gachaDupeCounts';
const GACHA_PITY_KEY = 'zombie:gachaPitySinceSuper';
const loadDupeCounts = (): Partial<Record<SkillKey, number>> => {
  try { const r = localStorage.getItem(GACHA_DUPES_KEY); const o = r ? JSON.parse(r) : {}; return (o && typeof o === 'object') ? o : {}; }
  catch { return {}; }
};
const saveDupeCounts = (m: Partial<Record<SkillKey, number>>): void => {
  try { localStorage.setItem(GACHA_DUPES_KEY, JSON.stringify(m)); } catch { /* ignore */ }
};
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
// PACING_PUZZLE.md §5.14 M13: 宿敵(ネームド)のメタ保存({型,名前,因縁回数}の1体分のみ・
// 新たに別の敵に殺されたら上書き)。goldBalance等と同じtry/catch guarded JSON永続化パターン。
const NAMED_FOE_KEY = 'zombie:namedFoe';
const loadNamedFoe = (): NamedFoeMeta | null => {
  try {
    const r = localStorage.getItem(NAMED_FOE_KEY);
    if (!r) return null;
    const o = JSON.parse(r);
    if (!o || typeof o !== 'object' || typeof o.type !== 'string' || typeof o.name !== 'string') return null;
    return { type: o.type, name: o.name, grudge: typeof o.grudge === 'number' ? o.grudge : 0 };
  } catch { return null; }
};
const saveNamedFoe = (m: NamedFoeMeta | null): void => {
  try {
    if (m) localStorage.setItem(NAMED_FOE_KEY, JSON.stringify(m));
    else localStorage.removeItem(NAMED_FOE_KEY);
  } catch { /* ignore */ }
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
// 裏ボス(mimir/jormungand/skadi)専用: クリティカルを規定回数当てると「完全気絶(紫)」に移行。
// 通常敵の気絶相当で、この間は攻撃を受けても起きず(stun 維持)、5× 近接をタイマー切れまで“し放題”。
export const BOSS_FULLSTUN_CRITS = 5;    // 完全気絶に必要なクリ回数(社長指示)
export const BOSS_FULLSTUN_MS = 5000;    // 完全気絶の持続(= STUN_DURATION_MS 相当)
// クリが裏ボスに入ったときのカウント更新。規定回数で完全気絶を発動。返り値=マージするEnemy差分＋発動フラグ。
export const bumpBossCrit = (
  enemy: Enemy,
  gameTime: number
): { patch: Partial<Enemy>; triggered: boolean } | null => {
  if (!isHiddenBoss(enemy.type)) return null;
  // すでに完全気絶中はカウントしない(気絶を延長/短縮しない)。
  if (enemy.bossFullStunUntil !== undefined && gameTime < enemy.bossFullStunUntil) return null;
  const c = (enemy.bossCritCount ?? 0) + 1;
  if (c >= BOSS_FULLSTUN_CRITS) {
    const until = gameTime + BOSS_FULLSTUN_MS;
    return { patch: { bossCritCount: 0, bossFullStunUntil: until, stunUntil: until }, triggered: true };
  }
  return { patch: { bossCritCount: c }, triggered: false };
};
// 分身(サブウェポン): その場で 1秒ごとに5秒間(=計5回)近接攻撃を繰り返し、消滅後にクールダウン。
// クールダウンはレベルで短縮(Lv1=3s / Lv2=2s / Lv3=1s)。index は subWeaponLevels(1..3)。
export const SHADOW_CLONE_COOLDOWN_MS_BY_LEVEL = [3000, 3000, 2000, 1000];
export const SHADOW_CLONE_ATTACK_INTERVAL_MS = 1000; // 攻撃間隔(1秒に1回)
export const SHADOW_CLONE_DURATION_MS = 5000;        // 存在時間(5秒)
export const SHADOW_CLONE_MAX_ATTACKS = 5;           // 攻撃回数の上限(1/s × 5s)
// Melee reach for the finger-release counter swing.
export const MELEE_RADIUS = 74;
// プレイヤー→敵の近接判定で使う距離。通常敵は中心点まで(従来の手触り/バランス維持)。裏ボスは巨体で
// 中心が遠いので「当たり判定の帯(AABB)の最近点」までの距離=矩形に触れたら届く(社長指示「こちらからも揃えて」)。
// これで巨体ボスも中心まで突っ込まず、表示している四角の縁で斬れる。描画側の判定枠と一致。
export const enemyMeleeDist = (px: number, py: number, e: Enemy): number => {
  // 当たり判定=「帯」方式(社長指示)。通常敵は足元の帯(幅=影と同規格=実描画幅×0.55 / 高さ=e.height)、
  // 裏ボスは生の帯。その最近点までの距離で判定する。絵は別経路(enemyFootBox)で帯から大きく伸びる=見た目≠判定。
  const r = isHiddenBoss(e.type)
    ? { x: e.x, y: e.y, width: e.width, height: e.height }
    : enemyHitStrip(e);
  const nx = Math.max(r.x, Math.min(px, r.x + r.width));
  const ny = Math.max(r.y, Math.min(py, r.y + r.height));
  return Math.hypot(px - nx, py - ny);
};
// ゾンビAI(社長指示): 通常時 ×1.2・フラフラ蛇行で接近。プレイヤーの近接範囲(MELEE_RADIUS)に入ると
// 1秒停止→2秒間2倍速の突進、を範囲内に居る限り繰り返す。
export const ZOMBIE_SPEED_MULT = 1.2;       // 通常接近の速度倍率
export const ZOMBIE_RUSH_SPEED_MULT = 2;    // 突進中(zrush)はさらに2倍(=通常接近の2倍速)
export const ZOMBIE_PAUSE_MS = 1000;        // 1秒停止
export const ZOMBIE_RUSH_MS = 2000;         // 2秒間突進
export const ZOMBIE_WOBBLE = 0.38;          // フラフラ(横揺れ)の強さ
export const huntingMeleeRadius = (player: Player): number => {
  if (!player.huntingCharged) return MELEE_RADIUS;
  const level = Math.max(1, Math.min(3, player.subWeaponLevels['striker-hunting'] ?? 1));
  return MELEE_RADIUS + HUNTING_MELEE_RADIUS_BONUS_BY_LEVEL[level];
};

// 調査用: 一時的に爆弾(ボム)ピックアップを出さない(社長指示・後で true に戻す)。爆弾は画面内のボス以外を
// 一括即死させるので「敵が複数同時に消える」要因になり、消失バグの切り分けの邪魔になる。
const BOMB_PICKUPS_ENABLED = true; // 社長指示(調査中OFF→ONに復帰)。ピンチ救済(pity)の爆弾バイアスもこれで有効化。

// 調査用: 敵が enemies 配列から消えた「理由」を id 別に記録(削除箇所でタグ付け)。DebugOverlay の消失ログが
// これを読んで kill/bomb/endEv/UNK を表示する。UNK(原因不明) が出たらそれが本物のバグ。
export const ENEMY_REMOVE_CAUSE = new Map<string, string>();
const tagRemove = (id: string, cause: string): void => {
  ENEMY_REMOVE_CAUSE.set(id, cause);
  if (ENEMY_REMOVE_CAUSE.size > 200) { // 上限(古いものから間引く)
    const k = ENEMY_REMOVE_CAUSE.keys().next().value;
    if (k !== undefined) ENEMY_REMOVE_CAUSE.delete(k);
  }
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
export const LEVELUP_INTRO_MS = 850;           // レベルアップ演出(スロー)の長さ。経過後に選択肢メニューを出す(社長指示)
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
const SHIELD_BASH_SHOVE_DISTANCE = 80;        // バッシュの飛び出し距離(社長指示: 100→80 で気持ち短く。ノックバックは据え置き)
const SHIELD_BASH_DURABILITY_COST = 5;        // バッシュ1回で減る耐久(0以下で破壊)
const SHIELD_BASH_KNOCKBACK_SPEED = 4800; // バッシュのノックバック距離(社長指示で倍: 2400→4800)。距離∝速度。
// スケーター急停止バッシュ(社長指示): skater で1秒以上走行後、進行方向と逆へスティックを倒すと
// 進行方向へ短距離衝撃波(バッシュ=近接×SHIELD_BASH_DAMAGE_MULT＋ノックバック)を出して急停止。
const SKATER_BASH_RUN_MS = 1000;       // 発動に必要な連続走行時間(1秒)
const SKATER_BASH_RANGE = 120;          // 衝撃波の射程(短距離・前方)
const SKATER_BASH_ARC_DOT = 0.5;        // 前方扇(heading との dot がこの値以上=±60°)
const SKATER_BASH_REVERSE_DOT = -0.5;   // 入力が進行方向と逆(dot がこの値以下=120°以上反対)
const SKATER_BASH_STOP_MS = 150;        // 急停止の入力ロック窓(この間に残速度を素早く減衰)
const SKATER_BASH_CD_MS = 600;          // 連射防止クールダウン(gameTime)
const SKATER_BASH_RESIDUAL = 0.18;      // 急停止直後に残す速度割合(ほんの少し慣性)
// スケボー新仕様(社長指示): ダブルタップ乗車→指離しで投擲。1秒以上乗車で発動、未満は消えるだけ。
const SKATER_RIDE_MIN_MS = 1000;        // 投擲発動に必要な最低乗車時間(1秒)
const SKATEBOARD_SPEED = 900;           // 投擲したスケボーの飛翔速度(px/s・私案)
const SKATEBOARD_DURATION_MS = 700;     // 飛翔寿命(≒飛距離。私案)
const SKATEBOARD_SIZE = 40;             // スケボー弾の当たり/表示サイズ
const SKATEBOARD_BASH_RANGE = 140;      // ヒット時バッシュの範囲(半径・前方寄り)
// After being shoved by a melee counter, an enemy is immune to further melee
// knockback for this long (damage still lands) so it can't be locked forever.
export const KNOCKBACK_IMMUNE_MS = 1750;
export const REFLECT_DAMAGE_MULTIPLIER = 10.0; // countered/reflected bullets hit 10× harder(社長指示で60→10)
export const REFLECT_SPEED_MULTIPLIER = 2.0; // カウンター反射弾の速度倍率(社長指示v0.25.1731で1.8→2.0)
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
// 操作: フリックでフリック方向にワイヤーを刺し、WIRE_PLANT_DELAY_MS(1秒)後にその地点へ自動で
// 高速移動。飛距離は固定(レベルで +20px ずつ伸びる)。高速移動中は無敵 + 敵すり抜け、すり抜けた
// 敵には近接小ダメージ。着地点の爆撃はレベル3のみ(ダメージ付き)。サークル表示は廃止。
// アナログスティックの傾き強度(swipeStrength: 0..1)で、移動速度と狙い距離を可変にする。
// 強度0(デッドゾーン直上)でも完全停止にはせず、最低係数だけ残す(操作不能を避ける)。
// キャラ移動: 弱い傾き=ゆっくり歩く(最低 STICK_WALK_MIN_FACTOR 倍)。
// 狙い距離(ワイヤーアンカー/PHILLレティクル): 弱い傾き=近く(最低 STICK_AIM_MIN_FACTOR 倍)。
export const STICK_WALK_MIN_FACTOR = 0.20; // 歩行速度の最低倍率(強度0時。弱タッチ=さらにゆっくり)
export const STICK_AIM_MIN_FACTOR = 0.25;  // 狙い距離の最低倍率(強度0時)
// 傾き強度 → 係数への共通リマップ(レンダラと共有して見た目と挙動を一致させる)。
export const stickAimFactor = (strength: number) =>
  STICK_AIM_MIN_FACTOR + (1 - STICK_AIM_MIN_FACTOR) * Math.max(0, Math.min(1, strength));
export const WIRE_DIST_BY_LEVEL = [0, 140, 180, 220] as const; // 刺す距離(Lv1=140px, +40/Lv・社長指示)
export const WIRE_PLANT_DELAY_MS = 1000; // 刺してから高速移動が始まるまでの待ち(1秒)
export const WIRE_DASH_MS = 150;         // 高速移動の所要時間(短い=高速)
// アンカーが敵に刺さった時の大技: 引き上げ(~0.2s)＋斬り下ろし(~0.15s)=計0.35s。待ち無しで即発動。
export const WIRE_SLAM_MS = 350;         // 引き上げ→斬り下ろし→着地 までの所要時間
export const WIRE_COOLDOWN_BY_LEVEL = [0, 1000, 1000, 1000] as const; // 移動完了後のCD(全Lv1秒)
export const WIRE_PASS_DAMAGE_MULT = 0.5; // すり抜けた敵への近接小ダメージ倍率
export const WIRE_LAND_KNOCKBACK_SPEED = 400; // すり抜け/着地ノックバックの初速(px/s)
// Lv3 限定: 着地点の爆撃(範囲ダメージ)。
export const WIRE_BOMB_RADIUS = 120;     // 爆撃の範囲
export const WIRE_BOMB_DAMAGE_MULT = 2;  // 爆撃ダメージ倍率(近接基準)
// Lv3 限定: ダッシュ中の「すり抜け攻撃」が爆発化(社長指示)。通過した敵を中心に小範囲AoE。
export const WIRE_PASS_BOMB_RADIUS = 90; // すり抜け爆発の範囲(着地爆撃より小さめ)

// 敵タイプ → 死因表示用の日本語ラベル。
const ENEMY_DEATH_LABELS: Record<string, string> = {
  zombie: '変異体(徘徊型)',
  skeleton: '変異体(痩躯型)',
  ghost: '変異体(抱卵型)',
  bat: '吸血コウモリ',
  werewolf: '変異体(獣化型)',
  plant: '変異体(定着型)',
  pumpkin: '変異体(肥大型)',
  giantbat: '変異体(飛行型)',
  reaper: '死神',
  'lab-zombie-1': '研究施設の変異体(Lv1)',
  'lab-zombie-2': '研究施設の変異体(Lv2)',
  'lab-zombie-3': '研究施設の変異体(Lv3)',
  mimir: 'CODE:MIMIR',
  jormungand: 'CODE:JORMUNGAND',
  skadi: 'CODE:SKADI',
  thor: 'CODE:THOR',
  miguel: 'CODE:MIGUEL',
  jibril: 'CODE:JIBRIL',
  rafi: 'CODE:RAFI',
  hunter: '変異体(狩猟型)',
  screamer: '変異体(叫喚型)',
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

// 小烏丸(murasame)が刀Lv3(MAX)で武器商人に並ぶ仕組み(賢者の石と同型)。ただし永続前提条件=
// 裏ボス「トール」討伐済み(thorDefeated)。未討伐なら刀MAXでも並ばない(社長指示)。
// 解禁が必要なら新しい unlockedShopSkillCards を返す。不要(未達/既解禁)なら null。
// ※katanaLevel()はfloor=1かつ村雨所持で3を返すヘルパなので使わず、生のsubWeaponLevelsで判定する。
export const maybeUnlockMurasame = (
  player: Player,
  unlocked: Partial<Record<SubWeaponKey, number>>,
  thorDefeated: boolean,
): Partial<Record<SubWeaponKey, number>> | null => {
  if (!thorDefeated) return null;
  if (!player.subWeapons.includes('katana') || (player.subWeaponLevels['katana'] ?? 0) < 3) return null;
  if ((unlocked['murasame'] ?? 0) >= 1) return null;
  return { ...unlocked, murasame: 1 };
};

// 装備スキル判定。effect 層はすべてこのヘルパで分岐(非装備時は完全に従来挙動)。
export const hasSkill = (player: Player, key: SkillKey): boolean => player.skills.includes(key);
// 装備スキルのレベル(1..3)。非装備=0。効果ヘルパは [_, Lv1, Lv2, Lv3] の配列を lv で引く。
export const skillLevel = (player: Player, key: SkillKey): number =>
  player.skills.includes(key) ? (player.skillLevels?.[key] ?? 1) : 0;

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
// マークスマン: 2秒以上連続移動すると移動速度 ×1.2(停止で即解除。社長指示で発動 3秒→2秒)。
export const MARKSMAN_MOVE_BUFF_MS = 2000;
export const marksmanSpeedMult = (player: Player, gameTime: number): number =>
  player.characterClass === 'mage' && player.isMoving && player.marksmanMovingSince > 0 &&
  gameTime - player.marksmanMovingSince >= MARKSMAN_MOVE_BUFF_MS ? 1.2 : 1;
// ヘビーガンナー: 同一攻撃で2体以上に当てた後3秒、すべての爆発範囲 ×1.1。
export const heavyGunnerExplosionMult = (player: Player, gameTime: number): number =>
  player.characterClass === 'warrior' && gameTime < player.heavyGunnerExpBuffUntil ? 1.1 : 1;

// --- 装備スキルの数値補正ヘルパ(effect層・全て純粋関数) -------------------
// ナイト: 被ダメ×0.8/0.7/0.6(Lv) / バーサーカー: 被ダメ×1.2(固定)。両立可(乗算)。
export const skillIncomingDamageMult = (player: Player): number => {
  const kl = skillLevel(player, 'knight');
  return (kl ? [1, 0.8, 0.7, 0.6][kl] : 1) * (hasSkill(player, 'berserker') ? 1.2 : 1);
};
// バーサーカー: 全攻撃 ×(1 + 失ったHP割合×係数[Lv1:1.0/Lv2:1.25/Lv3:1.5])。被ダメ×1.2は固定。
export const skillOutgoingDamageMult = (player: Player): number => {
  const bl = skillLevel(player, 'berserker');
  if (!bl || player.maxHealth <= 0) return 1;
  const k = [0, 1, 1.25, 1.5][bl];
  return 1 + Math.max(0, (player.maxHealth - player.health) / player.maxHealth) * k;
};
// クリティカルD上昇: crit倍率 +0.5/0.75/1.0(Lv)。
export const skillCritMult = (player: Player, base: number): number => {
  const cl = skillLevel(player, 'crit-up');
  return base + (cl ? [0, 0.5, 0.75, 1.0][cl] : 0);
};
// ナイト: 盾/召喚の最大HP ×1.5/1.75/2.0(Lv)。
export const skillSummonHpMult = (player: Player): number => {
  const kl = skillLevel(player, 'knight');
  return kl ? [1, 1.5, 1.75, 2.0][kl] : 1;
};
// タイムキーパー: サブCDのΔ ×0.9/0.8/0.7(Lv)。
export const skillCooldownMult = (player: Player): number => {
  const tl = skillLevel(player, 'time-keeper');
  return tl ? [1, 0.9, 0.8, 0.7][tl] : 1;
};
// エクスプローダー: 全爆発の半径/ダメージ ×1.2/1.35/1.5(Lv)。賢者の石はハリケーン等に別途+20%。
export const skillExplosionMult = (player: Player): number => {
  const el = skillLevel(player, 'exploder');
  return el ? [1, 1.2, 1.35, 1.5][el] : 1;
};
// 弁慶: バフ中 crit率 +5%/10%/15%(Lv)。バフ時間は付与側(武器切替)で +10/12/15s。
export const skillBenkeiCritBonus = (player: Player, gameTime: number): number => {
  const bl = skillLevel(player, 'benkei');
  return bl && gameTime < player.benkeiBuffUntil ? [0, 0.05, 0.10, 0.15][bl] : 0;
};
// 弁慶: 武器切替バフの持続(ms)。Lv1:10s / Lv2:12s / Lv3:15s。
export const skillBenkeiBuffMs = (player: Player): number => {
  const bl = skillLevel(player, 'benkei');
  return bl ? [0, 10000, 12000, 15000][bl] : 10000;
};
// ナイフマスター: 近接クリ率 +10%/15%/20%(Lv)。代わりに弾薬ドロップ0%(ドロップ側で抑止)。
export const skillKnifeMasterMeleeCrit = (player: Player): number => {
  const kl = skillLevel(player, 'knife-master');
  return kl ? [0, 0.10, 0.15, 0.20][kl] : 0;
};
// 近接コンボ倍率(ナイフマスター × コンボマスター)。3つの近接ダメージ地点とカウンター斬撃で共通使用。
//  ・knife-master: 近接ヒットで knifeComboCount を貯め、+2%/hit(上限+60%=×1.6、Lv3は15hitでカンスト。
//    PACING_PUZZLE.md §6.22 M47仕様②=社長裁定でP1の[0,50,70,100]%からP2=[0,40,50,60]%へ圧縮)。窓3秒。
//  ・combo-master: フィニッシュコンボ(meleeFinishComboCount)生存中、+2%/combo(上限+50%)。
// どちらも非装備なら ×1。窓の有効判定は呼び出し側の gameTime に依存。
export const skillMeleeComboMult = (player: Player, gameTime: number, finishComboCount: number, finishComboUntil: number): number => {
  let mult = 1;
  const kl = skillLevel(player, 'knife-master');
  if (kl && gameTime < player.knifeComboUntil) {
    const rate = [0, 0.02, 0.02, 0.04][kl]; // +2%/+2%/+4% per hit(不変)
    const cap = [0, 0.40, 0.50, 0.60][kl];  // 上限 +40%/+50%/+60%(§6.22 M47仕様②)
    mult *= 1 + Math.min(cap, player.knifeComboCount * rate);
  }
  mult *= skillComboMasterMult(player, gameTime, finishComboCount, finishComboUntil);
  return mult;
};
// combo-master のダメージ倍率のみ(全攻撃=近接/銃に適用)。フィニッシュコンボ生存中 +2%/3%/4%/combo(上限+50%/60%/70%)。
// ※ knife-master は近接専用なので含めない。銃ヒット処理は本関数だけを使う。
export const skillComboMasterMult = (player: Player, gameTime: number, finishComboCount: number, finishComboUntil: number): number => {
  const cl = skillLevel(player, 'combo-master');
  if (!cl || finishComboUntil < gameTime) return 1;
  const rate = [0, 0.02, 0.03, 0.04][cl];
  const cap = [0, 0.50, 0.60, 0.70][cl];
  return 1 + Math.min(cap, finishComboCount * rate);
};
// combo-master: フィニッシュコンボ窓を +1000/1500/2000ms 延長(Lv)。
export const skillFinishComboWindowBonus = (player: Player): number => {
  const cl = skillLevel(player, 'combo-master');
  return cl ? [0, 1000, 1500, 2000][cl] : 0;
};
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
  const sl = skillLevel(player, 'sniper');
  if (!sl || !enemy) return 1;
  const stopMax = [0, 0.5, 0.75, 1.0][sl];  // 停止敵ボーナス上限(Lv)
  const distMax = [0, 0.5, 0.75, 1.0][sl];  // 距離ボーナス上限(Lv)
  const stopped = Math.hypot(enemy.vx ?? 0, enemy.vy ?? 0) < 4; // 停止中(ほぼ静止)
  const pcx = player.x + player.width / 2;
  const pcy = player.y + player.height / 2;
  const ecx = enemy.x + enemy.width / 2;
  const ecy = enemy.y + enemy.height / 2;
  const dist = Math.hypot(ecx - pcx, ecy - pcy);
  const distBonus = Math.min(distMax, (dist / (SNIPER_REF_DIST * 0.85)) * distMax);
  return 1 + (stopped ? stopMax : 0) + distBonus;
};

// アタックシューター: 銃ダメージ +10/20/30%(Lv)。発射時の素ダメージへ乗算。
export const skillAttackShooterGunMult = (player: Player): number => {
  const lv = skillLevel(player, 'attack-shooter');
  return lv ? 1 + [0, 0.10, 0.20, 0.30][lv] : 1;
};
// ランナー: 移動速度 +10/15/20%(Lv)。移動速度の倍率として使用。
// §6.8 M31追記: リロード中はさらに+10%(Lv不問の固定%・Lv倍率に乗算。非装備時は従来どおり1)。
export const RUNNER_RELOAD_BONUS_MULT = 1.10;
export const skillRunnerSpeedMult = (player: Player, reloading = false): number => {
  const lv = skillLevel(player, 'runner');
  if (!lv) return 1;
  return (1 + [0, 0.10, 0.15, 0.20][lv]) * (reloading ? RUNNER_RELOAD_BONUS_MULT : 1);
};
// ゴールドラッシュ(§6.10 M33⑪で「永続ゴールド獲得」へ変更): ラン獲得ゴールド(リザルト)・宿敵討伐・
// 二人組クエスト報酬の獲得量 ×1.2/1.35/1.5(Lv)。ショップの返金(refund)は取得ではないので対象外。
// 端数は適用側で Math.round(四捨五入)。旧: in-runスクラップ拾得倍率(collectPickupのstrap)=撤去済み。
export const skillGoldRushMult = (player: Player): number => {
  const lv = skillLevel(player, 'gold-rush');
  return lv ? [1, 1.2, 1.35, 1.5][lv] : 1;
};
// スクラップビルダー追記(§6.9 M32): スクラップ(strap)ピックアップ収集時の取得量 ×1.1/1.2/1.3(Lv)。
// 既存効果(出撃開始時の初期スクラップ+50/100/150)は別枠のまま不変。端数は収集側の Math.round(四捨五入)。
export const skillScrapBuilderGainMult = (player: Player): number => {
  const lv = skillLevel(player, 'scrap-builder');
  return lv ? [1, 1.1, 1.2, 1.3][lv] : 1;
};
// マグネット: 弾薬ピックアップのみ拾得矩形を中心基準で ×1.1/1.2/1.3(Lv)。弾薬以外は従来どおり(§6.8 M31)。
export const skillMagnetAmmoRangeMult = (player: Player): number => {
  const lv = skillLevel(player, 'magnet');
  return lv ? [1, 1.1, 1.2, 1.3][lv] : 1;
};
// オーバークロック: サブウェポン発動(CD開始)時、CD即リセットの発動率(Lv1:20%/Lv2:25%/Lv3:30%)。
// setSubWeaponCooldown の合流点+援護射撃の発射時に抽選(§6.8 M31)。CD無しサブは対象外(リセットするCDが無い)。
export const skillOverclockChance = (player: Player): number => {
  const lv = skillLevel(player, 'overclock');
  return lv ? [0, 0.20, 0.25, 0.30][lv] : 0;
};
// ラストマガジン: 弾倉最後の1発(その発射で空になるトリガー1回分=発射前の残弾1)のダメージ ×2.0/2.5/3.0(Lv)。
// ショットガンは最終シェルの全ペレットに乗る(発射時の素ダメージへ焼き込み=命中時の他倍率とは乗算。§6.8 M31)。
export const skillLastMagazineMult = (player: Player, magazineBeforeShot: number): number => {
  const lv = skillLevel(player, 'last-magazine');
  return lv && magazineBeforeShot === 1 ? [0, 2.0, 2.5, 3.0][lv] : 1;
};
// ウォームアップ: 出撃から60秒間(gameTime<60000)、移動+10%・リロード時間×0.80・クリ率+20%(全Lv同値・§6.8 M31)。
export const WARM_UP_DURATION_MS = 60000;
export const WARM_UP_SPEED_MULT = 1.10;
export const WARM_UP_RELOAD_MULT = 0.80;
export const WARM_UP_CRIT_BONUS = 0.20;
export const isWarmUpActive = (player: Player, gameTime: number): boolean =>
  hasSkill(player, 'warm-up') && gameTime < WARM_UP_DURATION_MS;
export const skillWarmUpSpeedMult = (player: Player, gameTime: number): number =>
  isWarmUpActive(player, gameTime) ? WARM_UP_SPEED_MULT : 1;
export const skillWarmUpReloadMult = (player: Player, gameTime: number): number =>
  isWarmUpActive(player, gameTime) ? WARM_UP_RELOAD_MULT : 1;
export const skillWarmUpCritBonus = (player: Player, gameTime: number): number =>
  isWarmUpActive(player, gameTime) ? WARM_UP_CRIT_BONUS : 0;
// シーカー: 被弾時、CD明け＆抽選成功で3秒間半透明＋通常敵から狙われなくなる。CD10秒。
export const SEEKER_DURATION_MS = 3000;
export const SEEKER_COOLDOWN_MS = 10000;
export const skillSeekerProcChance = (player: Player): number => {
  const lv = skillLevel(player, 'seeker');
  return lv ? [0, 0.30, 0.40, 0.50][lv] : 0;
};
// シーカー発動中か(プレイヤーが半透明＝通常敵のターゲットから外れる)。
export const isSeekerActive = (player: Player, gameTime: number): boolean => player.seekerUntil > gameTime;

// 救難信号(rescue-signal): 発動率は skillLevel + rescueSignalProcChance(src/utils/rescueSignal.ts)。
// ここは演出(飛来アライ)のタイミング/距離/ズーム量の定数のみ(いずれも叩き台・要調整)。
// フェーズ(社長指示v0.25.1614 / v0.25.1629): 飛来ジャンプ(FLYIN)→着地しゃがみ(ARRIVE_HOLD=構え/-ready)→
//   着弾&切り付け(ATTACK=振り抜き/-swing)→モーション後の一拍(POST_HOLD)→少ししゃがみ込む(CROUCH・
//   バックジャンプの溜め)→バックジャンプ離脱(FLYOUT)→消滅。着地は「敵より前面(手前)」に取る(描画はpixiScene側)。
//   ダメージは FLYIN+ARRIVE_HOLD の頭(=着弾)で1回だけ適用(tickRescueAllies)。
export const RESCUE_ALLY_FLYIN_MS = 300;   // 背後→対象前面への飛来(放物線ジャンプ・慣性つき)。叩き台
export const RESCUE_ALLY_ARRIVE_HOLD_MS = 300; // 着地してしゃがむ(構え=-ready)一拍。切り付け前の「着地でしゃがみ絵」。叩き台
export const RESCUE_ALLY_ATTACK_MS = 280;  // 着弾=切り付け(振り抜き=-swing)が流れる間、敵前面で静止(≒PLAYER_MELEE_SWING_MS)
export const RESCUE_ALLY_POST_HOLD_MS = 200; // 近接モーションが終わってからの一拍(社長指示・叩き台)
export const RESCUE_ALLY_CROUCH_MS = 200;  // 少ししゃがみ込む(バックジャンプの溜め・後日しゃがみ絵に差し替え予定)
export const RESCUE_ALLY_FLYOUT_MS = 220;  // バックジャンプで背後へ離脱する時間
export const RESCUE_ALLY_TOTAL_MS = RESCUE_ALLY_FLYIN_MS + RESCUE_ALLY_ARRIVE_HOLD_MS + RESCUE_ALLY_ATTACK_MS + RESCUE_ALLY_POST_HOLD_MS + RESCUE_ALLY_CROUCH_MS + RESCUE_ALLY_FLYOUT_MS; // 1500ms
export const RESCUE_ALLY_SPAWN_DIST = 120; // 出現地点=プレイヤーの向きの逆(背後)へこの距離(px)
// ズーム演出: 命中の瞬間に小さく寄る。CLAUDE.md方針によりスロー(timeSlow)/ヒットストップは使わない
// (triggerHitImpactはtimeSlowを内包するため使用不可。triggerZoomを直接叩く)。
export const RESCUE_SIGNAL_ZOOM_MAG = 0.28;
export const RESCUE_SIGNAL_ZOOM_MS = 220;
export const RESCUE_SIGNAL_ZOOM_HOLD_MS = 70;

// 救急鞄(first-aid-kit)の空鞄投擲。プレイヤー→対象敵まで直線で飛ぶ一過性演出(RescueAllyと同じ
// 構造の使い切りパターン)。ダメージ/ノックバック/FXは飛行完了の瞬間に1回だけ適用する。
// ダメージ/ノックバック倍率の値自体は据え置き(旧useGameLoop内ローカル定数からの移設のみ・
// tickThrownBagsがstore側にあるためexportして両方(useGameLoop起動側/store着弾側)から参照する)。
export const THROWN_BAG_FLIGHT_MS = 280;             // 投げてから着弾までの飛行時間(社長指定レンジ250-300msの叩き台)
// 社長決定v0.25.1657: 空鞄は「爆発範囲攻撃」。着弾点中心のAoE(反射神経の反撃爆発に準拠・外周はfalloff減衰)。
// 値は叩き台=実機調整前提。THROW_DAMAGE=爆発中心の基準ダメージ(旧5=単体ダメージから改訂)。
export const FIRST_AID_KIT_THROW_DAMAGE = 80;        // 爆発の中心ダメージ(falloffで外周は減衰)
export const FIRST_AID_BAG_EXPLODE_RADIUS = 100;     // 爆発半径(px)
export const FIRST_AID_KIT_THROW_KNOCKBACK_MULT = 1.2; // TODO(救急鞄): 仮値(dog bite 0.8よりやや強め)

// Hitstop: 全停止(timeScale=0)で衝撃を出す瞬間ストップ。全インパクト共通0.1秒(社長指示)。
// この後は必ずスロー(triggerTimeSlow)で等速へ戻す。
export const HITSTOP_MS = 100;
// 近接フィニッシュ&カウンター: ストップ→スロー。社長指示で倍に(700→1400)。さらにもう少し長く
// (1400→1650→1950)。社長指摘「長さの問題じゃないかも」で全体を約1秒へ戻しつつ、最も遅い区間を
// 保持してから戻りは速くする形に変更(1950→1000)。一度は保持区間を延ばす代わりに全体も延長した
// (1000→1300)が、社長指示「全体1秒は崩さず、ピークの時間はさらに長く、戻りはさらに早く」で
// 全体は1000へ戻し、保持区間だけをさらに伸ばす形に確定。さらに社長指示「全体1秒→0.7秒に短縮」で
// 全体を700へ(保持/戻りの比率(80%/20%)は維持したまま両方を比例縮小。カーブ形状は下のHOLD_MSと
// 合わせてsrc/utils/timeSlowCurve.tsが消費)。
export const MELEE_FINISH_SLOW_MS = 700;
// 上のスロー時間のうち、最も遅い倍率を保持する長さ(全体700への短縮に合わせて800→560。
// 比率80%は維持)。残り(140ms)が等速へ戻るランプ区間になる。
export const MELEE_FINISH_SLOW_HOLD_MS = 560;
const MIN_TIME_SLOW_SCALE = 0.18;
const MAX_TIME_SLOW_SCALE = 1;
// Screen-shake duration when the player takes damage.
export const SHAKE_MS = 280;
export const SHAKE_MAG = 16;                 // 既定/通常時の揺れ幅(px)。社長指示で倍化(8→16)。
// 全体の揺れ強度の一括倍率(描画のみ)。各 *_SHAKE_MAG を個別にいじらず、揺れの「効き」だけを
// ここで一括スケールする(社長指示で全体を約2倍に)。消費は描画側(pixiScene)で振幅へ乗算。
export const SHAKE_GLOBAL_MULT = 2;
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
// プレイヤーを画面中央より下へずらす量(画面高比)。上方向(進行先)の視界を広げる(社長要望: 上の敵が見えない対策)。
// 屋内/ラボは0(中央維持)。スポーン側も同じ量だけ縦バンドを上へずらす(上端で湧きが画面内に出ないように)。
export const CAMERA_DOWN_OFFSET_FRAC = Math.max(0, Math.min(0.32, camNum('camdown', 0.08)));
export const CAMERA_DANGER_RADIUS = 150;                          // この距離内に敵が居たら「危険時」とみなす(px)
export const CAMERA_SNAP_DIST = 600;                             // これ以上離れたら即スナップ(開始/復帰/瞬間移動対策)
// アテンション・シネマティック(レスキュー/ジャイアント出現): 現地へ高速パン→ホールド→高速で戻る。その間 時間停止。
export const ATTENTION_IN_MS = 360;   // 現地への高速パン(in)
export const ATTENTION_HOLD_MS = 1900; // 現地ホールド(社長指示で0.5秒短縮: 2400→1900)
export const ATTENTION_OUT_MS = 360;  // プレイヤーへ高速で戻る(out)
export const ATTENTION_TOTAL_MS = ATTENTION_IN_MS + ATTENTION_HOLD_MS + ATTENTION_OUT_MS;
// 手を離して待機している間だけ少しズーム(描画のみ)。正=寄る / 負=引く。操作再開で1.0へ戻る。
export const CAMERA_IDLE_ZOOM_MAG = camNum('camidle', 0.05);      // 待機ズーム量(+5%)。?camidle で調整(負で引き)
export const CAMERA_IDLE_ZOOM_TAU = camNum('camidletau', 0.3);    // 待機ズームの寄り/戻りの時定数(秒)
export const CAMERA_MOVE_ZOOM_MAG = camNum('cammove', 0);         // 移動中だけのズーム量(負=引き)。社長指示で無効化(引きやめる)。?cammove で調整
export const CAMERA_MOVE_ZOOM_TAU = camNum('cammovetau', 1.5);    // 引きが広がる時定数(秒)。慣性でじわっと。戻りは CAMERA_IDLE_ZOOM_TAU を使用
// 登場(ヘリ)演出のカメラ: 高いヘリを画面へ収めるため引きから開始し、キャラの降下に同期して既定へ戻す。
export const CAMERA_INTRO_ZOOM_MAG = camNum('camintro', 1.0);     // 登場ヘリ搭乗シーンの寄り(正=寄り/めっちゃズーム)。社長指示でもう少し寄りスタート。降下で既定へ。?camintro
export const CAMERA_INTRO_LIFT_FRAC = camNum('camintrolift', 0.7); // 登場中、カメラをヘリ高度へ寄せる割合(0=従来の着地面固定 / 1=被写体を中央)。?camintrolift
// 近接フィニッシュの軽いパンチズーム(視覚のみ。プレイヤー=画面中央を中心に少し寄る)。
// カウンターはスロー(MELEE_FINISH_SLOW_MS/HOLD_MS)と同期(共通の寄りパンチカーブを流用)。
// 衝撃時の寄りパンチズーム。社長指示で1.5倍(KILL=近接フィニッシュの「Kill!」演出時のみ。
// 銃/接触/爆発キルや非フィニッシュの通常近接キルはズームしない=社長指示で撤回・v0.25.1466)。
// KILLだけ社長指示で1.2倍・0.5秒へ変更→倍率はやはり1.5倍へ戻す(社長指示・v0.25.1495。
// 秒数(0.5秒/holdは不変)。代わりにズーム効果自体へ連発防止CDを追加(下記CD_MS)。
export const MELEE_FINISH_ZOOM_MAG = 1.0;  // 近接フィニッシュ(KILL)の寄り(社長指示で2倍=+100%・旧1.5倍から改訂)
export const MELEE_FINISH_ZOOM_MS = 500;   // KILLだけ専用のズーム長さ(社長指示・スローとは非連動)
export const MELEE_FINISH_ZOOM_HOLD_MS = 400; // 上記のうち最大寄りを保持する長さ(比率80%はスローと同じ)
// KILLズームだけの連発防止CD(社長指示・v0.25.1495・10秒へ改訂v0.25.1497)。連続キル時、
// スロー/揺れ/ヒットストップは毎回発生するが、寄りズームだけはこのCD内なら発動しない
// (酔い防止・スロー等の演出は不変)。
export const MELEE_FINISH_ZOOM_CD_MS = 10000;
export const COUNTER_ZOOM_MAG = 1.0;       // カウンター成立の寄り(社長指示で2倍=+100%・旧1.5倍から改訂)
// PACING_PUZZLE.md §5.22 M21(社長委任v0.25.1516・CD制確定v0.25.1524): KILL/カウンター演出を
// 「命中の瞬間に全部ピーク→同じ長さ/カーブで一緒に戻る」1拍エンベロープへ統一する。
// ?juice=0で旧演出(このバッチ以前の個別エンベロープ・スローは毎回/ズームだけCD)へ完全復帰(A/B用)。
export const JUICE_ENABLED = typeof window === 'undefined' || new URLSearchParams(window.location.search).get('juice') !== '0';
// 全演出(フリーズ+ズーム+スロー)をまとめて律速するCD。社長決定(v0.25.1524): 5秒でも頻発して
// 「うざい」ため、現行のMELEE_FINISH_ZOOM_CD_MS(10秒)を値そのまま流用=CD値は変えない。
// 実機調整用に ?juicecd=<ms> だけ上書き可(任意)。
export const JUICE_CD_MS = camNum('juicecd', MELEE_FINISH_ZOOM_CD_MS);
// CD内キル(フル演出が出ない間)の最低保証フラッシュ(任意・OFF可)。
export const JUICE_MIN_FLASH_ENABLED = typeof window === 'undefined' || new URLSearchParams(window.location.search).get('juiceflash') !== '0';
export const JUICE_MIN_FLASH_MS = 80;
// Inertia time constants (s). Velocity eases toward its target over this
// window. The player is now instant (0 = no inertia, snappy control); enemies
// keep 0.3s so they curve into turns instead of snapping.
export const PLAYER_INERTIA_TAU = 0;
export const ENEMY_INERTIA_TAU = 0.3;
// 社長指示(v0.25.1585): 慣性を「その瞬間の実効速度が速い敵ほど強く」する。実効速度=素の速度
// ×紅き夜(×2)×叫喚バフ(×1.2)×ゾンビラッシュ 等=いま実際に動いている速さ。基準速度
// INERTIA_SPEED_REF で慣性=ENEMY_INERTIA_TAU、それより速いほど tau を線形に増やす(上限
// MAX_MULT倍=紅き夜等で超高速になっても旋回不能にはしない)。基準以下は据え置き(下限=1倍=
// 遅い敵の身軽さは変えない)。→ 死神(最速)は常時重い/紅き夜で速くなった敵はその間だけ重くなる。
const INERTIA_SPEED_REF = 55;          // この実効速度で慣性=基準(bat等の通常速度あたり=enemy.speed済み単位)
const INERTIA_SPEED_MAX_MULT = 2.0;    // 慣性倍率の上限(tau上限=0.6s)
const inertiaTauForSpeed = (effSpeed: number): number =>
  ENEMY_INERTIA_TAU * Math.max(1, Math.min(INERTIA_SPEED_MAX_MULT, effSpeed / INERTIA_SPEED_REF));
// 照準サークル(=PHILL弾/アンカーの狙い)の慣性。向き/距離の変化に少し遅れて追従(秒)。
// 値を上げるほどサークルがゆっくり動く(社長指示でさらにゆっくりに 0.10→0.20)。
export const AIM_INERTIA_TAU = 0.28; // 照準サークルの追従(大きいほど遅い)。気持ち速く(0.34→0.28)

// 特殊AI(犬型=突進 / パンプキン=ジャンプ)の調整値。射程基準=ハンドガン射程176px(RANGE_BY_CATEGORY.handgun)。
const HANDGUN_RANGE_REF = 176;
// 敵の「攻撃系」を倍速にする係数(社長指示)。対象=遠隔の発砲間隔＋特殊攻撃(犬の突進/
// パンプキン・バットのジャンプ)の溜め・クールダウン・動作。近接の通常接触ダメージ間隔と
// ゾンビの停止/突進リズムは対象外(据え置き)。すぐ戻せる単一定数: 1.0=従来 / 1.2=現在。
export const ENEMY_ATTACK_SPEED_MULT = GAME_SPEED; // ゲームスピード(?speed=で調整)。既定1.2。敵の発砲＋特殊攻撃の溜め/CDテンポ。
// ハンター変異体の視界(索敵)範囲(px)。useGameLoop の発見判定・updateEnemies のジャンプ範囲・
// pixiScene の薄紫サークル表示で共有する単一の値(社長指示)。
export const HUNTER_VISION_RANGE = 500;
// ハンターのジャンプ攻撃を発動する距離の上限(社長指示で 720→500)。視界サークル/着地クランプ(=VISION_RANGE)とは別。
export const HUNTER_JUMP_RANGE = 500;
// ハンターが索敵タイムアウトで立ち去る際のフェードアウト時間(ms)。useGameLoop(消滅タイミング)と
// pixiScene(αカーブ)の両方で共有(社長指示: 「26秒後にフェードアウトでいい」)。
export const HUNTER_LEAVE_FADE_MS = 900;

// 犬型(werewolf): ハンドガン射程より少し外で減速→2倍速で突進。
export const WEREWOLF_TRIGGER_RANGE = HANDGUN_RANGE_REF + 70; // 「少し外」
export const WEREWOLF_WINDUP_MS = 600;    // 減速(溜め)の長さ
export const WEREWOLF_CHARGE_SPEED_MULT = 3;   // 通常の3倍速(赤ライン予告→直線突進。社長指示で2→3)
// ハンター変異体のジャンプ/ダッシュ攻撃だけ速度2倍(社長指示)。ダッシュ突進速度に乗算、
// ジャンプ滞空時間を 1/この値 に短縮(=同距離を倍速で跳ぶ)。他の犬/パンプキン/バットには非適用。
export const HUNTER_JUMP_DASH_SPEED_MULT = 2;
// ジャンプ速度のみ 2/3 に(社長指示)。ダッシュ突進は HUNTER_JUMP_DASH_SPEED_MULT のまま据え置き。
// 実効倍率 2 → 4/3(=2×2/3)。滞空時間を 1/この値 に短縮するので、跳ぶ速さがそのぶん遅くなる。
export const HUNTER_JUMP_SPEED_MULT = (HUNTER_JUMP_DASH_SPEED_MULT * 2) / 3;
// ダッシュ攻撃全般(通常より速い突進)の弱いホーミング量/frame。基本は直進、少しだけプレイヤーへ寄せる(社長指示)。
export const DASH_ATTACK_HOMING = 0.05;
// ダッシュ溜め中、ゆっくり後退り(プレイヤーから離れる)してから突進(社長指示)。通常速度に対する倍率。
export const DASH_WINDUP_BACKSTEP_MULT = 0.35;
export const WEREWOLF_CHARGE_MAX_MS = 2800; // 突進の最大時間(到達できなくても打ち切り)。距離2倍化に合わせ延長。
export const WEREWOLF_COOLDOWN_MS = 1200;  // 突進後、次の溜めまでの猶予(基本CD)
// 突進後、上記の基本CDに加えてランダムな追加クールダウン(3〜10秒)を持たせる。
// 頻繁に突進してくるのを抑える(社長指示)。突進ごとに毎回ランダム抽選。
// 犬型(werewolf/lab-zombie-2)は charge 終了時の aiReadyAt に、giantbat は専用スケジューラ gbDashReadyAt に上乗せ。
export const WEREWOLF_EXTRA_CD_MIN_MS = 3000;
export const WEREWOLF_EXTRA_CD_MAX_MS = 10000;
const werewolfExtraCd = (type: string): number =>
  type === 'giantbat' ? 0 : WEREWOLF_EXTRA_CD_MIN_MS + Math.random() * (WEREWOLF_EXTRA_CD_MAX_MS - WEREWOLF_EXTRA_CD_MIN_MS);
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
// 裏ボス スカジ専用の氷ハザード(社長指示)。判定はupdateEnemiesで、見た目はpixiScene。
// 氷塊の起爆・氷刃の命中はどちらも既存の爆発処理(pumpkinBlasts)へ ice:true で積み、青FXで消化する。
export const SKADI_ICE_RADIUS = 90;    // 氷塊破裂のAoE半径(2秒テレグラフなので少し大きめ)
export const SKADI_ICE_DAMAGE = 38;    // スカジ本体の damage と同じ(=爆発攻撃と一緒)
export const SKADI_BLADE_SPEED = 700;  // 氷刃の発射速度(px/s・通常弾320より速い)
export const SKADI_BLADE_DAMAGE = 20;  // 氷刃の命中ダメージ(ボス弾相当)
export const SKADI_BLADE_HIT = 18;     // 氷刃の命中半径(px)
export const SKADI_BLADE_LIFE_MS = 2500; // 発射後の寿命(ms)。これを過ぎると消滅
let skadiHazardSeq = 0; // スカジ氷ハザードの一意id採番(プール/差分の安定キー)
let groundFireSeq = 0;  // 火炎瓶(molotov)の地面の火の一意id採番(プール/差分の安定キー)
let sensorMineSeq = 0;  // センサー地雷(sensor-mine)の一意id採番(プール/差分の安定キー)
let flareGunSeq = 0;    // フレアガン(flare-gun)のフレアの一意id採番(プール/差分の安定キー)
let bossFireSeq = 0;    // ジブリルのランタン火の一意id採番(プール/差分の安定キー)
let rescueAllySeq = 0;  // 救難信号の援護アライの一意id採番(プール/差分の安定キー)
let thrownBagSeq = 0;   // 救急鞄の空鞄投擲の一意id採番(プール/差分の安定キー)
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

// スコア集計用のエリート/ボス判定(gameplayの isBossType とは別。社長指示=elite:pumpkin / boss:giantbat のみ)。
const isScoreElite = (t: string): boolean => t === 'pumpkin';
const isScoreBoss = (t: string): boolean => t === 'giantbat' || t === 'mimir' || t === 'jormungand' || t === 'skadi' || t === 'thor' || t === 'hunter';
const countScoreEliteBoss = (enemies: { type: string }[]): { elite: number; boss: number } => ({
  elite: enemies.reduce((n, e) => n + (isScoreElite(e.type) ? 1 : 0), 0),
  boss: enemies.reduce((n, e) => n + (isScoreBoss(e.type) ? 1 : 0), 0),
});

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
// 洋館(ステージ6)開始の走り込み距離(world px): プレイヤー+護衛を到着点のこの距離だけ下(手前)に置き、
// 自動で上へ走らせて入場する(v0.25.2110・ヘリ登場なし)。
export const CORRIDOR_RUNIN_DIST = 380;
// 洋館通路の下限(v0.25.2123・社長指示): スタート地点(y=0)からこの距離まで下がれる(それ以下へは行けない)。
// 敵のスポーン/追跡は不変(下からも湧く)。
export const CORRIDOR_BOTTOM_LIMIT = 50;
export const PLAYER_INTRO_HELI_MS = 2600;    // フェーズA(ヘリ飛来→着陸)長(少しゆっくり目)
// フェーズB(着陸→ホバー→離陸＋プレイヤー/NPCフェードイン)長。社長指示で飛び降り演出を廃止し、
// 「ヘリが着陸→飛び立つタイミングで隊員がフェードイン」に変更したため、離陸とフェードを読ませる尺へ延長。
export const PLAYER_INTRO_LAND_MS = 1200;
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
  // フェーズB(着陸→離陸): カメラは着地地点(オフセット0)に固定。ヘリの離陸とプレイヤー/NPCの
  // フェードインは pixiScene 側で描く(被写体=着地地点なのでここは 0 を返す)。飛び降り弧は廃止。
  return { x: 0, y: 0 };
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
export const INTRO_DIALOGUE_READ_MS = 26;        // 文字数に応じた追加の読む間(社長指示=次へ行く長さを少し長く・文字数で変動)
export const INTRO_DIALOGUE_END_HOLD_MS = 550;   // 最終行後の保持(この後ゲーム開始)
// 1行の所要時間(オートタイプ+保持)。holdMs 指定行(無線の「間」等)はそれをそのまま使う。
// 表示側(IntroDialogue)と終了判定(useGameLoop)で必ず同じ値を使うため共通化する。
export const introLineMs = (l: IntroLine): number =>
  l.holdMs ?? (l.text.length * (INTRO_DIALOGUE_CHAR_MS + INTRO_DIALOGUE_READ_MS) + INTRO_DIALOGUE_LINE_HOLD_MS);
// 会話全体の所要時間(useGameLoop が終了判定に使用)。行配列から算出。空なら 0。
export const introDialogueTotalMs = (lines: IntroLine[]): number =>
  lines.length === 0 ? 0 : lines.reduce((sum, l) => sum + introLineMs(l), 0) + INTRO_DIALOGUE_END_HOLD_MS;
// セリフを出す登場進行 t。ヘリが低ホバーまで降りてきた頃(フェーズA内 a≈0.82。降下0.5〜飛び降り0.85の終盤)。
export const INTRO_DIALOGUE_TRIGGER_T = PLAYER_INTRO_HELI_FRAC * 0.82;

// ゲーム内時間が停止している(= 会話/登場演出中)か。停止中は攻撃入力(タップ近接/刀ダッシュ/カウンター)を
// 受け付けない。登場演出中はループ自体が早期 return で停止するが、タップ近接は入力ハンドラから直接 store を
// 叩くためループ停止をバイパスしてしまう。その抑止に使う。今後の通常会話もここに足せば一括で止まる。
export const isGameTimeStopped = (): boolean => {
  const s = useGameStore.getState();
  return s.introDialogueActive || (s.introUntil > 0 && Date.now() < s.introUntil);
};

// 操作を一切受け付けない状態(社長指示): プレイヤーが動いてはいけない場面。
// =ヘリ登場/登場セリフ等の時間停止中(isGameTimeStopped)、メニュー等の一時停止中(isPaused)、
//   死亡後(health<=0)。移動・向き・攻撃すべてここで弾く(ジョイスティック/操作層の各ハンドラが参照)。
export const isInputLocked = (): boolean => {
  const s = useGameStore.getState();
  return s.isPaused || s.player.health <= 0 || s.corridorRunInActive || isGameTimeStopped();
};

// 松明ドロップ率/内訳のしきい値は pityDirector.ts の BASE_DROP_TUNING(0.42/0.5/0.75/0.9)へ移動
// (ピンチ救済が無い時はその既定値=従来と完全一致)。
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
// 診断用トグル(社長v0.25.1557): ?mine=0 で緑卵(mine=地雷/卵)を全ソースOFF=1個も生成しない。
// 実機の「やたら重い→落ちる」瞬間の切り分け用(ベンチではM52 PASS=無罪だが実機実プレイで再確認)。
// 既定ON(通常挙動は不変)。緑卵の3ソース全てをここで塞ぐ: ①世界生成(minesInRegion/pressure/ambush)
// ②eggcarrier(抱卵型)の産卵 ③イベント「緑卵の包囲」の卵リング。1個も出なければ描画/爆発/影キャスタも走らない。
const MINES_DISABLED = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('mine') === '0';
// 診断用(社長v0.25.1562): ?rnenemy=1 で「紅き夜の敵条件」だけを赤演出/音/シネマ抜きで常時ON。
// = 敵HP実質2倍(被ダメ半減)/敵速度2倍/経験値ドロップ2倍/敵弾・接触の紅き夜挙動。紅き夜の「最初から
// 引っかかる」が敵条件由来かを切り分ける(赤マトリクスは深層域で無罪確定済=残る差はこの敵条件と音/シネマ)。既定OFF。
export const RN_ENEMY_FORCE = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('rnenemy') === '1';
const EGG_RING_COUNT = 22; // イベント「緑卵の包囲」で画面外リングに置く卵の数。
// 変異体(抱卵型・旧ghost): プレイヤーの周囲を周回しながら緑卵(mine)をバラ撒く。
// 3秒CDののち、周辺のランダム位置へ0.5秒おきに1個ずつ、最大3個ばらまく(社長指示)。
const EGGCARRIER_BURST_INTERVAL_MS = 500; // バースト中の1個ごとの間隔(0.5秒)。
const EGGCARRIER_BURST_COUNT = 3;         // 1バーストで撒く個数。
const EGGCARRIER_BURST_CD_MS = 3000;      // バースト完了後の再開CD(3秒)。
const EGGCARRIER_SCATTER_RADIUS = 110;    // 自分の周辺のこの半径内のランダム位置へ撒く。
const EGGCARRIER_MAX_EGGS = 20;          // 抱卵型が撒いた卵の同時上限(超過は古い順に消す)。画面外は別途カリング。
const EGGCARRIER_ORBIT_RADIUS = 220;     // プレイヤーから保つ周回半径(px)。
// 変異体(叫喚型・screamer): 距離を保ちつつ、溜め→叫喚で画面内の通常敵を一時強化する。
// 出現してから初回叫喚(発動=バフ開始)までの合計を7秒にする(社長指示)。溜め(SCREAMER_WINDUP_MS=2秒)を
// 差し引いた、溜め開始までの待ちが SCREAMER_FIRST_MS(5秒 + 溜め2秒 = 計7秒で発動)。
const SCREAMER_FIRST_MS = 5000;       // 出現してから初回の溜め開始までの待ち。
const SCREAMER_INTERVAL_MS = 10000;   // 以降の叫喚間隔(発動から次の溜め開始まで)。
export const SCREAMER_WINDUP_MS = 2000; // 叫喚の溜め(予兆)時間。これを倒し切れば阻止=バフ無し。
const SCREAMER_BUFF_MS = 7000;        // 強化の持続(発動から)。
export const SCREAMER_BUFF_MULT = 1.2; // 通常敵の移動速度・与ダメージ倍率。
const SCREAMER_KEEP_RADIUS = 260;     // プレイヤーから保つ距離(px)。直進せず一定距離を保つ。
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
// 色付き個体は通常の経験値オーブを「+1個ずつ」多くドロップ(無色=1 / 青=2 / 紫=3 / 赤=4)。
// 1個あたりの value はそのままなので、合計XPも個数分だけ増える(社長指定)。
const XP_ORB_COUNT_BY_COLOR_TIER: Record<EnemyColorTier, number> = { blue: 2, purple: 3, red: 4 };
const xpOrbCountForEnemy = (enemy: Enemy): number =>
  enemy.colorTier ? XP_ORB_COUNT_BY_COLOR_TIER[enemy.colorTier] : 1;
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
    case 'homing': return 'ホーミング弾';
    case 'shield': return 'シールド';
    case 'whip': return '鞭';
    case 'alchemy': return '錬金術';
    case 'turret': return '自動タレット';
    case 'shijin': return 'ダンスフロア';
    case 'fire-knife': return '発火ナイフ';
    case 'drone-boomerang': return 'ドローンブーメラン';
    case 'wire-anchor': return 'ワイヤーアンカー';
    case 'sage-stone': return '賢者の石';
    case 'shadow-clone': return '分身';
    case 'molotov': return '火炎瓶';
    case 'first-aid-kit': return '救急鞄';
    case 'sensor-mine': return 'センサー地雷';
    case 'support-sniper': return '援護射撃';
    case 'flare-gun': return 'フレアガン';
    case 'junk-weapon': return 'ジャンクウェポン';
    default: return 'サブウェポン';
  }
};
// 近接の壁越し不可(視線)判定に使う壁矩形を、ある中心(cx,cy)+半径(range)の周辺から集める。
// プレイヤーのスイングと分身の攻撃で共用する(屋内=lab壁/閉ドア、研究所スキン=区画壁+遮蔽物、屋外=近傍の木)。
const meleeWallsAround = (get: () => GameState, cx: number, cy: number, range: number): Rect[] => {
  const { indoorMode, labDoors, stageTheme } = get();
  if (indoorMode) {
    return [...labBlockingWalls(labDoors.filter(d => d.open).map(d => d.id)), ...get().labProps.map(p => p.rect)];
  }
  if (stageTheme === 'lab') {
    return [
      ...labWallsInRegion(cx - range - 40, cy - range - 40, cx + range + 40, cy + range + 40).map(wallRect),
      ...labPropsInRegion(cx - range - 40, cy - range - 40, cx + range + 40, cy + range + 40).map(propRect),
    ];
  }
  return treesInRegion(cx - range - 40, cy - range - 40, cx + range + 40, cy + range + 40).map(trunkRect);
};

// 叫喚型(screamer)を倒したら強化バフを即座に打ち切る(社長指示、残り時間を待たず即失効)。
// gun/接触/爆発(damageEnemy)と近接キル全般(grantMeleeKillRewards)の両経路から同じ判定を使う。
const screamerBuffCutOnKillPatch = (
  killedTypes: string[],
  screamerBuffUntil: number,
  gameTime: number
): { screamerBuffUntil: number } | Record<string, never> =>
  killedTypes.includes('screamer') && screamerBuffUntil > gameTime
    ? { screamerBuffUntil: gameTime }
    : {};

// PACING_PUZZLE.md §5.14 M13: 宿敵(ネームド)を倒した時の決着処理(討伐→REVENGE演出+報酬+成仏)。
// 近接(grantMeleeKillRewards)・銃/接触/爆発(damageEnemy)の両キル経路から呼ぶ共通ヘルパー。
const resolveNamedFoeDefeat = (get: () => GameState, killedEnemies: Enemy[], x: number, y: number): void => {
  const named = killedEnemies.find(e => e.isNamed);
  const st = get();
  if (!named || !st.namedFoe) return;
  saveNamedFoe(null); // 成仏=次に別の敵に殺されるまで宿敵不在
  useGameStore.setState({
    namedFoe: null,
    namedFoeResult: { name: normalizeNamedName(st.namedFoe.name), defeated: true },
    namedFoeRunResolved: true,
  });
  // スキル: ゴールドラッシュ(§6.10 M33⑪) = 永続ゴールド獲得 ×1.2/1.35/1.5(Lv・四捨五入)。表示(壁銘打ち)も同額。
  const namedGold = Math.round(NAMED_TREASURE_GOLD * skillGoldRushMult(st.player));
  get().addGold(namedGold);
  // トレジャー確定1個(通常のtreasureDropChance抽選を経由せず直接付与)。
  get().addPickup({
    id: `pickup-treasure-named-${named.id}`,
    x: x - 8 + 12, y: y - 8 - 12,
    type: 'treasure',
    value: treasureValueForRank(named.difficultyRank),
    variant: treasureVariantForValue(treasureValueForRank(named.difficultyRank)),
    worldDrop: true,
  });
  // PACING_PUZZLE.md §5.17 M14追補(演出仕様v0.25.1499): spawnCallout('REVENGE!')は廃止し、
  // 大格銘打ち(金)に置き換え。頭上ネームプレート/リング/グローは不変。
  if (WALL_ENABLED) {
    get().enqueueWallEvent('revenge', `REVENGE —— ${normalizeNamedName(st.namedFoe.name)}`, 'NEMESIS FELLED', '#ffd700', namedGold);
  }
  get().spawnRing(x, y, 14, 220, 'rgba(255,215,0,0.85)', 5, 560);
  get().spawnGlow(x, y, 140, 'rgba(255,215,0,', 620);
};

// PACING_PUZZLE.md §5.23 M22 A3: 全キル(近接/銃/接触/爆発共通)の死亡ポップ=小リング(膨らんで消える)
// +方向性スプレー(既存spawnSpray流用)。方向は攻撃者(プレイヤー)→敵の延長線(被弾の背中側破裂と同じ考え方)。
// 近接(grantMeleeKillRewards)・銃/接触/爆発(damageEnemy)の両キル経路から呼ぶ共通ヘルパー。
const spawnDeathPop = (get: () => GameState, ex: number, ey: number, fromX: number, fromY: number): void => {
  let dx = ex - fromX;
  let dy = ey - fromY;
  const len = Math.hypot(dx, dy) || 1;
  dx /= len; dy /= len;
  get().spawnRing(ex, ey, 4, 28, 'rgba(255,255,255,0.5)', 3, 220);
  get().spawnSpray(ex, ey, dx, dy, 4, ['#fef3c7', '#fde68a', '#e5e7eb']);
};

// 討伐で「FF風クランブル」統一演出(triggerDramaticDeath)を出す対象(getsDramaticDeath=ネームド/裏ボス/
// giantbat/hunter)の、討伐後フェード表示の長さ(ms)。useGameLoop の BOSS_FADE_MS / pixiScene の
// syncBossCorpse 内 FADE_MS と同じ値で必ず揃える(3箇所で複製・pixiScene側の既存コメントと同じ運用)。
const DRAMATIC_DEATH_FADE_MS = 2600;

// spawnRing/spawnBurst の色パーサ(pixiScene.glowTint)は 'rgba(r,g,b,...)' 形式からしか tint を
// 抽出できない(hexは白 0xffffff にフォールバック)。getEnemyColor は hex を返すため、敵色で確実に
// 色付けしたいリングだけこの変換を通す(spawnBurst側は既存の全呼び出しと同じくhexそのまま=挙動不変)。
const hexToRgba = (hex: string, alpha: number): string => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
};

// 「flashy unified boss death」juice機能: ネームド/裏ボス(mimir/jormungand/skadi/thor)/giantbat/hunter の
// 討伐に共通の「FF風クランブル」演出を出す(getsDramaticDeath で判定・呼び出し元でガード済み)。
// 近接(grantMeleeKillRewards)・銃/接触/爆発(damageEnemy)の両キル経路から、対象を倒した時に1回だけ呼ぶ。
// SFXは含まない(gameStoreはplaySfxをimportできないため。useGameLoopがbossCorpse.diedAtの変化を監視して
// 'boss-death'を1回鳴らす)。HARD PERF CONSTRAINT: 強glow(spawnGlow大径)は使わない=pooled sprite
// (spawnRing/spawnBurst)とscreen-space spawnFlash/triggerShake/triggerTimeSlowのみ。
const triggerDramaticDeath = (get: () => GameState, enemy: Enemy, x: number, y: number): void => {
  // 歴史年表(chronicle): 各種ボス/ハンターの初回討伐を即載せ(社長決定v0.25.1628)。近接/銃 両キル経路が
  // この関数を通るのでここ1箇所で拾える。宿敵(isNamedのみ)はボス扱いにしない=年表に載せない。
  if (isHiddenBoss(enemy.type) || enemy.type === 'giantbat' || enemy.type === 'hunter') {
    // 年表フレーズ(社長指示v0.25.1658→1659で動詞は「討伐」に統一):
    //  ・城ボス(giantbat=各ステージのストーリーボス・固有名なし)→「ストーリーボスを討伐」。
    //  ・固有名持ち(天使/裏ボス)は「CODE:◯◯を討伐」(§6.20 M45)。「天使」等の種族接頭辞は
    //    付けない(社長指示v0.25.1756「天使 はいらない」)。
    //  ・ハンターは従来どおり種族ラベル「変異体(狩猟型)を討伐」。
    const phrase =
      enemy.type === 'giantbat' ? 'ストーリーボスを討伐'
      : `${enemyDeathLabel(enemy.type)}を討伐`;
    recordChronicle(
      getSelectedStageId(),
      enemy.type === 'hunter' ? 'hunter' : 'boss',
      enemy.type,
      phrase
    );
    // 城ボスクリアフラグ(EVENT_QUEST_DESIGN.md・社長裁定v0.25.1686 #4): 討伐の瞬間に永続記録し、
    // 「城ボスフラグ && 強制クエストフラグ」が揃えばそのステージをクリア扱い=次ステージ解放。
    // イベント産のgiantbat(fromEvent)はストーリーボスではないので除外(finaleDefeatedと同じ扱い)。
    if (enemy.type === 'giantbat' && !enemy.fromEvent) {
      const qStageId = getSelectedStageId();
      markCastleBossCleared(qStageId);
      syncQuestStageClear(qStageId);
    }
  }
  // 小烏丸解禁(社長指示): 裏ボス「トール」討伐の永続報酬。初回討伐なら永続フラグを立て、
  // このランのリザルトで解禁ポップアップを1回出す。討伐時点で刀がLv3(MAX)なら、その場で
  // このランの商人在庫にも並べる(以後のランは刀Lv3到達時に maybeUnlockMurasame が自動陳列)。
  if (enemy.type === 'thor') {
    if (markKogarasuUnlocked()) useGameStore.setState({ kogarasuUnlockedThisRun: true });
    const st = get();
    const muraUnlock = maybeUnlockMurasame(st.player, st.unlockedShopSkillCards, true);
    if (muraUnlock) useGameStore.setState({ unlockedShopSkillCards: muraUnlock });
  }
  // 討伐後のフェードアウト(既存の裏ボス演出を流用・pixiScene.syncBossCorpseが描画)。
  useGameStore.setState({
    bossCorpse: { type: enemy.type, x, y, w: enemy.width, h: enemy.height, diedAt: Date.now() },
  });
  const tint = hexToRgba(getEnemyColor(enemy.type), 0.8);
  get().spawnFlash('rgba(255,255,255,0.32)', 260);         // 白い閃光(瞬間)
  get().spawnRing(x, y, 10, 200, 'rgba(255,255,255,0.9)', 4, 420);  // 衝撃波リング①(白・速い)
  get().spawnRing(x, y, 6, 260, tint, 3, 560);                       // 衝撃波リング②(敵色・遅れて大きく)
  get().spawnBurst(x, y, getEnemyColor(enemy.type), 26);             // 崩れ散る残骸
  get().triggerShake(DRAMATIC_DEATH_FADE_MS, 6);            // 長く低いシェイク(旧・裏ボス限定=5 よりわずかに強め)
  get().triggerTimeSlow(0.35, 520, 90);                     // 決着の一瞬をスロー
};

// KILLパンチズームの寄り先(社長指示・v0.25.1498): キルされた対象の中心座標。複数いる場合は
// 最初の1体(配列先頭)。誰も死んでいなければ(ボス気絶ボーナス打だけ等)undefinedを返し、
// triggerFinishImpact側で従来どおり画面中央へフォールバックする。
const finishZoomTargetOf = (
  killed: { enemy: Enemy; finisher: boolean }[]
): [number, number] | [undefined, undefined] => {
  const e = killed[0]?.enemy;
  return e ? [e.x + e.width / 2, e.y + e.height / 2] : [undefined, undefined];
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
  // 叫喚型(screamer)を近接で倒したら強化バフを即座に打ち切る(社長指示)。全ての近接キル経路が
  // このヘルパーを通るので、ここ1箇所で拾える(gun/接触/爆発側は damageEnemy 内で同様に処理)。
  const screamerCutPatch = screamerBuffCutOnKillPatch(killed.map(k => k.enemy.type), get().screamerBuffUntil, get().gameTime);
  if ('screamerBuffUntil' in screamerCutPatch) useGameStore.setState(screamerCutPatch);
  for (const { enemy, finisher } of killed) {
    // PACING_REDESIGN.mdバッチ2(計測): 近接全経路のキルを種別+スタイル集計へ記録(挙動には影響しない)。
    // バッチ3.5-Bの追補: 型ごとの最終キル時刻も記録(問題児リフラクトリ判定用)。
    recordKill(enemy.type, 'melee', get().gameTime);
    // 二人組クエストのキル進捗(EVENT_QUEST_DESIGN.md)。近接全経路はここ1箇所で拾える。
    {
      const qs = useGameStore.getState();
      const qNext = questKillProgress(qs.eventQuestActive, qs.eventQuestGoalTier, qs.eventQuestKills, enemy);
      if (qNext !== null) useGameStore.setState({ eventQuestKills: qNext });
    }
    const ex = enemy.x + enemy.width / 2;
    const ey = enemy.y + enemy.height / 2;
    if (enemy.isNamed) resolveNamedFoeDefeat(get, [enemy], ex, ey); // §5.14 M13: 宿敵討伐
    // juice: FF風クランブル統一演出(ネームド/裏ボス/giantbat/hunter討伐)。近接キル経路。
    if (getsDramaticDeath(enemy)) triggerDramaticDeath(get, enemy, ex, ey);
    if (DEATHPOP_ENABLED) spawnDeathPop(get, ex, ey, player.x + player.width / 2, player.y + player.height / 2);
    const xp = finisher
      ? Math.max(1, Math.round(enemy.experienceValue * 1.5))
      : enemy.experienceValue;
    get().dropEnemyXp(enemy, ex, ey, 'pickup-xp-melee', xp);
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
    // PACING_PUZZLE.md §5.5 M5(RE4式): 残弾割合が最小の弾種を落とす(同率は構え優先・phill対象外)。
    // ?ammosmart=0で従来(構え銃の弾種)へ。ドロップ率・供給量は不変=弾種の配分のみ。
    const smartType = AMMO_SMART_ENABLED
      ? pickAmmoDropType(ownedAmmoTypes.map(t => ({ type: t, reserve: ammoPoolFor(player, t), max: AMMO_MAX[t] })), gun?.ammoType)
      : null;
    const dropType = smartType ?? gun?.ammoType ?? ownedAmmoTypes[0];
    // ナイフマスターは弾薬ドロップ0%(何をしても。社長指示)。
    if (dropType && !hasSkill(player, 'knife-master') && Math.random() < ammoChance) {
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
    // §5.23 M22 C1: 血しぶきの方向=攻撃者(プレイヤー)→敵の延長線(spawnDeathPopと同じ考え方)。
    const bdx = ex - (player.x + player.width / 2);
    const bdy = ey - (player.y + player.height / 2);
    if (finisher) {
      // Finisher juice: white shockwave + gold ring + sparks + glow + callout.
      get().spawnBurst(ex, ey, '#dc2626', 30, bdx, bdy);
      get().spawnBurst(ex, ey, '#7f1d1d', 14, bdx, bdy);
      // KILL!は血飛沫も大量に(社長指示v0.25.2032→2041「真上にぶしゃーーっと」→2045「ズーム停止の
      // タイミングで噴射」): KILLズームは寄り切りまで MELEE_FINISH_ZOOM_MS - HOLD_MS(=100ms)なので、
      // その瞬間に真上2連バースト(各43粒=キャップほぼ満杯の間欠泉)を発火=止まった画の中で噴き上がる。
      // window.setTimeout だとヘッドレステスト(node環境=window未定義)でクラッシュし、CIを
      // 毎push赤にしていた(v0.25.2106修正)。素のsetTimeoutはブラウザ/nodeの両方で同一挙動。
      setTimeout(() => {
        get().spawnBlood(ex, ey, -Math.PI / 2 - 0.16, 260);
        get().spawnBlood(ex, ey, -Math.PI / 2 + 0.16, 260);
      }, MELEE_FINISH_ZOOM_MS - MELEE_FINISH_ZOOM_HOLD_MS);
      get().spawnRing(ex, ey, 10, 92, 'rgba(255,255,255,0.95)', 3, 280);
      get().spawnRing(ex, ey, 8, 64, 'rgba(252,211,77,0.95)', 4, 380);
      get().spawnRing(ex, ey, 4, 34, 'rgba(185,28,28,0.72)', 3, 320);
      get().spawnGlow(ex, ey, 58, 'rgba(253,224,71,', MELEE_FINISH_SLOW_MS); // KILLの光サークルを少し大きく(社長指示。46→58)
      // "Kill!" callout over the executed enemy's head. 刀の一閃は代わりに
      // 軌道中央へ「斬」を出すので、ここでは出さない。
      if (!suppressKillCallout) {
        // 表示時間・保持時間はスロー演出(MELEE_FINISH_SLOW_MS/HOLD_MS)と揃え、スローが一番遅い
        // 区間の間は文字も一番ハッキリ(満alpha)のまま保つ(社長指示)。
        get().spawnCallout(ex, enemy.y - 6, 'Kill!', '#ffe4e6', {
          bg: 0x7a1322, holdMs: MELEE_FINISH_SLOW_HOLD_MS, duration: MELEE_FINISH_SLOW_MS,
        }); // 濃いワインレッド(社長指示)
      }
    } else {
      get().spawnBurst(ex, ey, '#dc2626', 16, bdx, bdy);
      get().spawnBurst(ex, ey, '#7f1d1d', 7, bdx, bdy);
      get().spawnRing(ex, ey, 4, 24, 'rgba(185,28,28,0.68)', 3, 280);
    }
  }
};

// スキル: 救難信号(rescue-signal) = プレイヤーの近接がこのスイングでヒットした敵IDリストを
// 受け取り、レベル別の確率(rescueSignalProcChance)で1回だけ判定する(複数体を同時に斬っても
// 判定は1スイング1回=乱発防止。★この粒度は仕様に「PLAYERの近接ヒットで」とのみ記載で複数ヒット時の
// 挙動は未指定のため実装判断。設計チャットで要確認)。発動したら対象(ヒットした敵の先頭。既に
// 死亡していればselectRescueSignalTargetが最寄りの生存敵へフォールバック)へ、プレイヤーと別クラスの
// 援護アライを背後から1体飛ばす(生成はspawnRescueAllyアクション。ダメージ適用/演出はtickRescueAllies
// が着弾フレームで行う=このスキル自体はプレイヤーにダメージも被弾もさせない)。
// ダメージは「現在の近接ダメージそのまま(倍率1)」= 呼び出し側が渡す baseMeleeDamage を素通しする
// (crit/コンボ倍率/skillOutgoingDamageMultは一切乗せない。この「倍率1・単純な戦力アップ」が
// このスキルの識別=分身(shadow-clone、フル近接複製)との差別化・CLAUDE.md仕様変更ルールに基づき変更禁止)。
// (§6.9 M32でexport化=発動中ガードのユニットテスト用。挙動は従来+ガード1行のみ)
export const applyRescueSignalProc = (
  get: () => GameState,
  player: Player,
  baseMeleeDamage: number,
  hitEnemyIds: string[],
  pcx: number,
  pcy: number,
) => {
  if (hitEnemyIds.length === 0) return;
  const lvl = skillLevel(player, 'rescue-signal');
  if (!lvl) return;
  // §6.9 M32: 発動中(援護アライが出ている間)は再発動しない(全員退場後に再発動可・キャラ被り防止)。
  if (get().rescueAllies.length > 0) return;
  if (Math.random() >= rescueSignalProcChance(lvl)) return;
  // 索敵はプレイヤーからハンドガン射程(RANGE_BY_CATEGORY.handgun=176px)以内のみ。範囲内に生存中の敵が
  // いなければ target=null=発動スキップ(社長指示v0.25.1615「ハンドガン範囲までしか索敵しない/いなければ発動しない」)。
  const target = selectRescueSignalTarget(hitEnemyIds[0], get().enemies, pcx, pcy, RANGE_BY_CATEGORY.handgun);
  if (!target) return;
  const klass = pickRescueSignalAllyClass(player.characterClass);
  // 出現位置=プレイヤーの現在向き(lastDirection)の逆側(=背後)。向き不明時は下向き基準にフォールバック。
  const ld = player.lastDirection;
  const lm = ld ? Math.hypot(ld.x, ld.y) : 0;
  const dir = lm > 0.01 ? { x: ld!.x / lm, y: ld!.y / lm } : { x: 0, y: 1 };
  const fromX = pcx - dir.x * RESCUE_ALLY_SPAWN_DIST;
  const fromY = pcy - dir.y * RESCUE_ALLY_SPAWN_DIST;
  // 着地位置は発生時点で固定(着地後は敵を追わない=張り付かない・社長指示v0.25.1615)。中心と足元Yを渡す。
  get().spawnRescueAlly(
    klass, fromX, fromY,
    { id: target.id, x: target.x + target.width / 2, y: target.y + target.height / 2, footY: target.y + target.height },
    baseMeleeDamage,
  );
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
    if (e.type === 'reaper' && !e.reaperChaser) continue; // 不倒の通常リーパーは対象外。深奥チェイサーは近接対象(ボス級)なので含める
    const ecx = e.x + e.width / 2;
    const ecy = e.y + e.height / 2;
    if ((ecx - pcx) ** 2 + (ecy - pcy) ** 2 > r2) continue;
    get().spawnSlash(ecx, ecy, 'rgba(168,85,247,0.95)');
    get().spawnMeleeBlood(ecx, ecy, e.width); // 近接の血飛沫=プレイヤーへ向かって飛ぶ(v0.25.2026)
    if (isBossType(e.type)) {
      // ボスは即死しない=近接フィニッシュ相当ダメージ(×5)。フィニッシュ波及なのでviaMeleeFinish=true
      // (§5.21-追補4: finishKillOnlyボスもこの経路でならトドメを刺せる)。
      const dmg = Math.max(1, Math.round(baseMeleeDamage * BOSS_MELEE_STUN_MULT));
      get().damageEnemy(e.id, dmg, false, false, true);
      get().spawnDamageNumber(ecx, e.y, dmg, true);
      get().spawnBurst(ecx, ecy, '#a855f7', 10);
    } else {
      const killed = get().damageEnemy(e.id, e.health + 1, false, false, true); // 即死(フィニッシュ波及)
      if (killed) {
        get().spawnBurst(ecx, ecy, '#a855f7', 14);
        get().dropEnemyXp(e, ecx, ecy, 'pickup-xp-reaper');
      }
    }
  }
};

// スキル: カウンターマスター = カウンター成立スイングで、プレイヤー近傍(~MELEE_RADIUS*1.5)の敵を
// 2× KNOCKBACK_SPEED で弾く。近傍だけ走査(有界)。
const counterMasterKnockback = (get: () => GameState, pcx: number, pcy: number, kbScale = 2) => {
  const reach = MELEE_RADIUS * 1.5;
  const reach2 = reach * reach;
  for (const e of get().enemies) {
    if (e.type === 'reaper' && !e.reaperChaser) continue; // 不倒の通常リーパーは対象外。深奥チェイサーはノックバック対象(ボス級・他の近接系と統一)
    const ecx = e.x + e.width / 2;
    const ecy = e.y + e.height / 2;
    const dx = ecx - pcx;
    const dy = ecy - pcy;
    const d2 = dx * dx + dy * dy;
    if (d2 > reach2) continue;
    const dist = Math.max(0.001, Math.sqrt(d2));
    // KNOCKBACK_SPEED の kbScale 倍相当。knockbackEnemy は BULLET_KNOCKBACK_SPEED 基準なので比率換算。
    const mult = (KNOCKBACK_SPEED * kbScale) / BULLET_KNOCKBACK_SPEED;
    get().knockbackEnemy(e.id, dx / dist, dy / dist, mult, mult);
  }
};
// カウンターマスターのノックバック倍率(KNOCKBACK_SPEED 基準): Lv1 ×2 / Lv2 ×2.5 / Lv3 ×3。
const counterMasterKbScale = (player: Player): number => {
  const lv = skillLevel(player, 'counter-master');
  return lv ? [0, 2, 2.5, 3][lv] : 2;
};

// スキル: スラッシャー = アクティブリロード型のタイミングリング追撃(最大3連)。
// 近接が当たるとプレイヤーへ縮むリングが出て(描画は pixiScene)、ゴールに重なるジャスト窓(±50ms=SLASHER_JUST_MS)で
// タップすると追撃が出る。成功で次のリングを再生成、最大3連。窓を外す/未入力でコンボ終了。
// ダメージは追撃ごとに ×2/3 減衰(1.0 / 0.667 / 0.444)。当たった敵のみ通常ノックバック。
export const SLASHER_RING_MS = 500;   // リングが縮みきる(=ジャストの瞬間)までの時間
export const SLASHER_JUST_MS = 50;    // ジャスト窓 ±50ms(社長指示で入力幅を0.1秒短縮=幅200→100ms)
export const SLASHER_MAX_HITS = 3;    // 追撃の最大連数
export const SLASHER_MULTS = [1, 2 / 3, (2 / 3) * (2 / 3)]; // 各追撃のダメージ倍率
const applySlasherTimedStrike = (
  get: () => GameState,
  player: Player,
  gameTime: number,
  realGameTime: number,
): CounterTriggerResult => {
  // リングのジャスト判定は slow-mo 非依存の realGameTime で測る(A案)。コンボ倍率や窓は
  // 従来どおり gameTime 基準(ポーズ整合)。
  const elapsed = realGameTime - player.slasherRingStartAt;
  const step = player.slasherStrikeStep;
  // 連数の上限はレベル依存: Lv1 1連 / Lv2 2連 / Lv3 3連。
  const slLv = skillLevel(player, 'slasher');
  const maxHits = slLv ? Math.min(SLASHER_MAX_HITS, slLv) : SLASHER_MAX_HITS;
  const just = elapsed >= SLASHER_RING_MS - SLASHER_JUST_MS && elapsed <= SLASHER_RING_MS + SLASHER_JUST_MS;
  // 窓を外した / 連数を使い切った → コンボ終了(追撃なし)。
  if (!just || step >= maxHits) {
    get().setSlasherCombo(0, 0);
    return { swung: false, hit: false, finish: false, killed: 0 };
  }
  get().markMeleeSwingFx(); // 追撃も近接スイングの二次モーション(踏み込み)を出す(描画のみ)
  const pcx = player.x + player.width / 2;
  const pcy = player.y + player.height / 2;
  // 追撃の射程は初撃時に記録した slasherReach を使う(ストライカーの溜めで伸びた射程が初撃で消費されても、
  // 追撃は伸びたまま=社長指示)。未記録(0)なら従来どおり現在の射程にフォールバック。
  const meleeRange = player.slasherReach > 0 ? player.slasherReach : huntingMeleeRadius(player);
  const melee = player.weapons.find(w => w.isMelee);
  const meleeDamage = (melee?.damage ?? 6) * strikerMeleeMult(player) * (player.equipBonus?.damageMult ?? 1);
  const comboMult = skillMeleeComboMult(player, gameTime, get().meleeFinishComboCount, get().meleeFinishComboUntil);
  const dmg = meleeDamage * SLASHER_MULTS[step] * skillOutgoingDamageMult(player) * comboMult;
  const kbMult = KNOCKBACK_SPEED / BULLET_KNOCKBACK_SPEED; // 通常近接相当のノックバック
  const r2 = meleeRange * meleeRange;
  let killed = 0;
  let hit = false;
  for (const e of get().enemies) {
    if (e.type === 'reaper' && !e.reaperChaser) continue;
    const ecx = e.x + e.width / 2;
    const ecy = e.y + e.height / 2;
    const dx = ecx - pcx, dy = ecy - pcy;
    if (dx * dx + dy * dy > r2) continue;
    hit = true;
    const k = get().damageEnemy(e.id, dmg);
    get().spawnDamageNumber(ecx, e.y, dmg, false);
    get().spawnSlash(ecx, ecy, 'rgba(190,242,100,0.95)');
    get().spawnMeleeBlood(ecx, ecy, e.width); // 近接の血飛沫(v0.25.2026)
    if (k) {
      killed += 1;
      get().spawnBurst(ecx, ecy, '#bef264', 10);
    } else {
      const d = Math.max(0.001, Math.hypot(dx, dy));
      get().knockbackEnemy(e.id, dx / d, dy / d, kbMult); // 追撃が当たった敵のみノックバック
    }
  }
  get().spawnRing(pcx, pcy, 6, meleeRange, 'rgba(190,242,100,0.5)', 3, 200); // 追撃の一閃
  // スキル: ナイフマスターのコンボ加算(§6.10 M33⑧: スラッシャー追撃のヒットでも貯める。倍率は既に乗っている)。
  {
    const slKnifeCombo = computeKnifeCombo(player, gameTime, hit);
    if (slKnifeCombo.count !== player.knifeComboCount || slKnifeCombo.until !== player.knifeComboUntil) {
      useGameStore.setState(state => ({
        player: { ...state.player, knifeComboCount: slKnifeCombo.count, knifeComboUntil: slKnifeCombo.until },
      }));
    }
  }
  // 追撃のジャスト成立フィードバック(ダンスの「JUST!」と同じコールアウト)。頭上に一瞬。
  get().spawnCallout(pcx, player.y - 24, 'JUST!', '#bef264', { scale: 1.2 });
  const nextStep = step + 1;
  if (nextStep < maxHits) get().setSlasherCombo(realGameTime, nextStep); // 次のリングを再生成(realGameTime基準)
  else get().setSlasherCombo(0, 0);                                  // 連数完了
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

// 強化訓練(ガチャ)1回の結果。UI 表示と返金/昇格判定に必要な情報を一括で返す。
export interface GachaPullResult {
  key: SkillKey;
  rarity: SkillRarity;
  rolledLevel: number;   // 今回の抽選Lv
  newLevel: number;      // 適用後の所持Lv
  prevLevel: number;     // 抽選前の所持Lv(0=未所持)
  dupeCount: number;     // 抽選に使った被り回数(=今回より前の被り回数)
  firstAcquire: boolean; // 初取得(比較なしで付与)
  promoted: boolean;     // Lvが上がった/初取得した
  refund: number;        // 返金ゴールド(昇格しなかった時のみ>0)
}

// PACING_PUZZLE.md §5.17 M14: 大格=銘打ちキューの1件。gold指定時は遅れて+◯G表示を出す
// (depth=+50G/revenge=+150G。rankは金額表示なし)。
export interface WallInscriptionEvent {
  id: number;
  kind: WallEventKind;
  title: string;
  sub: string;
  color: string;
  gold?: number;
}

interface GameState {
  player: Player;
  enemies: Enemy[];
  // パンプキン着地爆発の発生イベント(その frame の着地点)。useGameLoop が消化(被弾判定+FX)して空に戻す。
  pumpkinBlasts: { x: number; y: number; radius: number; damage: number; enemyId: string; ice?: boolean }[];
  // 裏ボス スカジの氷ハザード。markers=足元の氷塊テレグラフ(赤サークル2秒→起爆)、blades=設置後に発射される氷刃。
  skadiIceMarkers: { id: string; x: number; y: number; bornAt: number; fireAt: number; enemyId: string }[];
  skadiIceBlades: { id: string; x: number; y: number; angle: number; launchAt: number; launched: boolean; vx: number; vy: number; expireAt: number; enemyId: string; visual?: 'ice' | 'bone' }[];
  // 火炎瓶(molotov)が設置した地面の火だまり。lifetime/DoTは tickGroundFires が処理、描画は pixiScene が直読み。
  groundFires: GroundFire[];
  // ジブリルのランタン攻撃の紫の単発火(プレイヤー被弾)。判定/寿命は useGameLoop、描画は pixiScene が直読み。
  bossFires: BossFire[];
  // 深さの壁ゲート(1/2)の戦闘中か(useGameLoop の activeGateRef を反映)。描画側(深層セピア)がゲート中は
  // エリア切替を凍結するために読む(社長指示v0.25.1667「ゲートを超えるまでエリア切替を発動しない」)。
  gateActive: boolean;
  // ゲート2(深層境界)が未クリアの間 true(useGameLoop が gateMetaRef を反映)。描画側(深層セピア)は
  // これが true の間、距離が深層に届いていても深層演出へ入らない(社長報告v0.25.1670: ゲート2は境界を
  // 跨いだ後に発火するため、発火前の隙間で深層演出が先に入っていた。凍結ではなく「倒すまで入れない」)。
  deepZoneLocked: boolean;
  // スキル「救難信号」の援護アライ(一過性演出)。生成/着弾ダメージ/寿命は tickRescueAllies が処理、
  // 描画は pixiScene が直読み(RescueAlly型のコメント参照)。
  rescueAllies: RescueAlly[];
  // 救急鞄(first-aid-kit)の空鞄投擲(一過性演出)。生成/着弾ダメージ/寿命は tickThrownBags が処理、
  // 描画は pixiScene が直読み(ThrownBag型のコメント参照)。
  thrownBags: ThrownBag[];
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
  // NPCリアルタイムセリフ(時間停止なし・HUDの軽量表示)。current=表示中、queue=順番待ち、nextAt=次を出せる最短gameTime。
  // portrait=会話の立ち絵を話者名と別に指定するオーバーライド(例: 変異後グレン)。省略時は name で引く。
  npcDialogue: { name: string; text: string; until: number; portrait?: string } | null;
  npcDialogueQueue: { name: string; text: string; portrait?: string }[];
  npcDialogueNextAt: number;
  npcSpokeAt: Record<string, number>;   // NPC名→最後に喋ったgameTime(同一NPCのCD用)
  npcCatAt: Record<string, number>;      // カテゴリ→最後に出したgameTime(同一カテゴリのCD用)
  // タブ/アプリが裏(バックグラウンド)か。裏ではゲーム進行(useGameLoop)を止める。BGMは別途停止。
  // 将来ネイティブアプリ化した時もネイティブのpause/resumeから setBackgrounded を呼べば再利用できる。
  backgrounded: boolean;
  bashHitFxAt: number;        // 盾バッシュが敵に当たった時刻(Date.now)。SE再生のトリガ
  whipHitFxAt: number;        // 鞭が敵に当たった時刻(Date.now)。SE再生のトリガ
  whipSwingFxAt: number;      // 鞭を振った時刻(Date.now)。振る音SEのトリガ
  anchorPlantFxAt: number;    // ワイヤーアンカーを(地面に)打ち込んだ時刻(Date.now)。打ち込み音SEのトリガ
  anchorEnemyHitFxAt: number; // ワイヤーアンカーが敵に当たった時刻(Date.now)。近接命中音SEのトリガ
  boomerangThrowFxAt: number; // ドローンブーメランを投げた時刻(Date.now)。投擲音SEのトリガ
  junkShotFxAt: number;       // ジャンクウェポン(junk-weapon)発砲時刻(Date.now)。shotgun-fire SEのトリガ
  summonFxAt: number;         // 錬金術で召喚した時刻(Date.now)。召喚音SEのトリガ
  projectiles: Projectile[];
  pickups: Pickup[];
  breakableProps: BreakableProp[];
  destroyedBreakableProps: Record<string, true>;
  mineAmbushAnchor: MineAmbushAnchor | null;
  castleEvent: CastleEvent;
  // 囲い系イベント(小イベント=アリーナ/ミニボス)。非nullの間だけプレイヤーを円内に拘束。
  activeEvent: ActiveEvent | null;
  // 紅き夜: 非null中は全敵ステータス2倍・経験値2倍・画面赤染め。
  redNight: RedNight | null;
  // 叫喚型(screamer)の強化が有効な gameTime(ms)。これを過ぎるまで通常敵の移動速度・与ダメージ×1.2。
  screamerBuffUntil: number;
  weaponMerchant: WeaponMerchant;
  // 商人サークル内の連続滞在時間(ms)。MERCHANT_TALK_DWELL_MSで満了=話しかける(ショップ/紅き夜やり過ごし)。
  // pixiSceneが進捗アーク描画に読む。円外/メニュー中/再開待ちで0リセット。
  merchantDwellMs: number;
  updateMerchantDwell: (deltaMs: number) => void;
  eventQuestNpc: EventQuestNpc;
  // 二人組クエストのrun内状態(EVENT_QUEST_DESIGN.md)。受領中のクエスト種別と討伐進捗。
  // HUD(右上スクラップ下の n/N 表示)はこのプリミティブ群だけを購読する(React再描画規律)。
  eventQuestActive: 'forced' | 'sub' | null;
  eventQuestKills: number;
  eventQuestGoalCount: number;               // N(forced=1 / sub=設定値)
  eventQuestGoalTier: EnemyColorTier | null; // sub の対象色(null=全キル)
  gameTime: number;
  // gameTime と同じくポーズ中は止まるが、slow-mo(timeScale)の影響を受けない「実効」時計。
  // 近接フィニッシュの slow-mo で gameTime が遅くなってもスラッシャー追撃リングを通常速度で
  // 刻むために使う(社長承認のA案)。
  realGameTime: number;
  isPaused: boolean;
  showUpgradeMenu: boolean;
  levelUpIntroUntil: number; // >0 の間は「LEVEL UP 演出(スロー)」中。この実時刻を過ぎたら選択肢メニューを出す。
  showShopMenu: boolean;
  showEventQuestMenu: boolean;
  shopReopenAt: number;
  eventQuestReopenAt: number;
  vaccinePurchased: boolean;
  // Flipped true only when the player completes the return circle (帰還完了) — the run is won.
  gameWon: boolean;
  // フィナーレボス(giantbat)を倒した=終了条件を満たした(まだ勝利ではない)。useGameLoop が帰還サークルを出す。
  finaleDefeated: boolean;
  // 制圧イベント: 4拠点(東西南北)。suppressionActive 時のみ有効(ステージ1メインミッション等)。
  baseSites: BaseSite[];
  escorts: EscortSoldier[];      // 護衛軍人NPC(4人・東西南北担当)。HPなし・前進&射撃&10秒占拠で解放。
  suppressionActive: boolean;    // 制圧イベント中か(通常は false=拠点なし)
  suppressionCaptureCount: number; // 制圧した累計回数(base-capture SE 検出用。軍人名簿indexはランダム割当)
  safeBaseId: string | null;     // 武器商人が現在いる拠点(=安全地帯。HP回復・陥落しない)
  pendingSuppression: boolean;   // 出撃が制圧イベント(ステージ1)か。resetGame で suppressionActive へ
  // the ONE(統合正本M7/EX): ストーリーボス専用ステージ(通常湧き/イベント全停止→会話→ボス→勝利)。
  pendingStoryBoss: boolean;     // 出撃前にAppがセット(Stage.storyBossOnly)。resetGame で storyBossMode へ
  storyBossMode: boolean;        // このラン=ストーリーボス専用(useGameLoopの停止ゲート+ボス進行が参照)
  // the ONE(統合正本9章): 洋館［SUB］再訪(秘密任務)。保存槽ゴール+［グレンの薬を使う］。
  pendingRevisit: boolean;       // 出撃前にAppがセット(selectedMission='revisit')。resetGame で revisitMode へ
  revisitMode: boolean;          // このラン=洋館再訪(城ボス停止・洋館=保存槽マーカー・薬ボタン)
  medicineUsedAt: number;        // 薬を使った時刻(Date.now)。0=未使用。使用後 useGameLoop が短い間を置いて勝利化
  medicinePromptVisible: boolean; // ［グレンの薬を使う］ボタンの表示(保存槽接近中のみ。HUDが購読)
  // 帰還サークル: フィナーレ撃破/終了アイテム後に出現。中心に dwellMs(ms)とどまると gameWon。null=非表示。
  returnCircle: { x: number; y: number; radius: number; dwellMs: number } | null;
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
  rendererReady: boolean; // レンダラ(Pixi)が初フレームを表示済みか。冷間リロード時に登場演出が黒画面で進行=「まっくら」を防ぐため、初フレーム表示まで演出を t=0 で保持する。
  // チュートリアルの操作説明ポップアップ(v0.25.1830・社長「ポップアップで操作方法を説明してくれるやつ」)。
  // 表示中はisPaused=true(シーン停止・PauseMenuはGame側でポップアップ優先ゲート)。artは注釈の種類。
  // img=事前収録の手本アセットのパス(静止画/GIF)。社長決定v0.25.1839「やる前に手本を見せる」=
  // 挿絵は収録済み素材で統一(旧・表示直前ライブキャプチャ(shot)はv0.25.1839で廃止)。
  tutorialPopup: { title: string; lines: string[]; art?: 'move'; img?: string } | null;
  tutorialPopupShown: boolean; // このランで表示済みか(resetGameでリセット)
  // ゲーム画面のキャプチャ提供者(PixiStageが登録)。ゲーム内では未使用(v0.25.1839でポップアップの
  // ライブ撮影を廃止)。手本GIF収録・デバッグ用ツールとして温存(ヘッドレス収録が st.captureFrame() を叩く)。
  captureFrame: (() => string | null) | null;
  setCaptureFrame: (fn: (() => string | null) | null) => void;
  showTutorialPopup: (p: { title: string; lines: string[]; art?: 'move'; img?: string }) => void;
  closeTutorialPopup: () => void;
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
  // PC(マウス)照準。キャンバス左上基準のスクリーン座標(CSS px)。ワールド座標は camera を足して算出する
  // (毎フレーム camera が動くので、スクリーン座標で保持し movePlayer 側でワールドへ変換する)。null=未使用(タッチ)。
  mouseAim: { x: number; y: number } | null;
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
  lastWeaponGet: { name: string; at: number; color?: string; kind?: 'weapon' | 'treasure' | 'data'; weaponKey?: string; treasureVariant?: number } | null;
  // Global hitstop: while Date.now() < hitstopUntil the simulation is frozen
  // (melee-finisher impact pause). 0 = running.
  hitstopUntil: number;
  // アテンション・シネマティック(レスキュー/ジャイアント出現): 現地へカメラパン→ホールド→戻る。
  // 駆動は実時間(startReal)。fromCam=開始時のカメラ(=戻り先)。null=非実行。
  attention: { x: number; y: number; startReal: number; fromCamX: number; fromCamY: number } | null;
  // Strong-event slow motion. Rendering/audio continue; simulation delta is
  // multiplied by timeSlowScale until this timestamp.
  timeSlowUntil: number;
  timeSlowScale: number;
  timeSlowStart: number; // スロー開始時刻。倍率を滑らかに 1.0 へ戻す(ランプ)ために使う。
  timeSlowHoldMs: number; // このms分は最も遅い倍率を保持してからランプ開始(既定0=従来どおり開始直後からランプ)。
  // Screen shake: jitter the canvas while Date.now() < shakeUntil (set on hit).
  // shakeMag=振幅px / shakeDur=フェード基準の長さ(ms)。triggerShake で行動別に設定。
  shakeUntil: number;
  shakeMag: number;
  shakeDur: number;
  // PACING_PUZZLE.md §5.23 M22 Group C1: 方向性シェイク(既存)。{0,0}=方向なし=従来どおり等方の
  // ランダム揺れ(pixiScene.ts側でdirLen<しきい値なら等方にフォールバック)。正規化済み単位ベクトル。
  shakeDirX: number;
  shakeDirY: number;
  // Punch-zoom (render-only): while Date.now() < zoomUntil, the renderer scales the
  // world by zoomMag around screen center. Triggered on melee finish. No gameplay effect.
  zoomUntil: number;
  zoomMag: number;
  zoomStart: number;  // ズーム開始時刻(hold区間の起点。timeSlowStartと同じ役割)。
  zoomHoldMs: number; // 最大ズームを保持する長さ(既定0=従来どおり開始直後から1.0へランプ)。
  // パンチズームの寄り先(社長指示・v0.25.1498): hasTarget=falseなら従来どおり画面中央。
  // trueならtargetX/Y(世界座標)を寄り先にする(KILL=キルされた対象。カウンターは指定なし=中央のまま)。
  zoomHasTarget: boolean;
  zoomTargetX: number;
  zoomTargetY: number;
  // KILLズームだけの連発防止CD(社長指示)。スロー/揺れには適用しない=ズームだけ間引く。
  lastKillZoomAt: number;
  // Whip hurricane: a fixed suction point at the whip tip. While active, nearby
  // enemies are pulled toward (rootX,rootY) each tick. null when inactive.
  hurricane: {
    rootX: number; rootY: number; endsAt: number; radius: number; level: number; lastTickAt: number; lastDamageAt: number;
  } | null;
  // 錬金術で召喚した味方ユニット。enemies とは別配列(副作用回避)。
  summons: Summon[];
  // 救助ホールドイベントの守る対象NPC(逃げ惑う3人)。alchemy summons とは別系統。
  rescueSurvivors: RescueSurvivor[];
  // ホーミング弾のロック対象(敵ID配列。重複=2ロック)。毎フレーム useGameLoop が更新、発射でクリア。
  // Reactコンポーネントはこれをsubscribeしない(毎フレーム変化するため)。レンダラが直読み。
  homingLocks: string[];
  setHomingLocks: (locks: string[]) => void;
  fireHoming: () => void;

  // 分身(サブウェポン)。生成中=ACTIVE、null=READY/COOLDOWN。レンダラが直読みして白黒で描く。
  shadowClone: ShadowCloneState | null;
  shadowCloneStrike: (clone: ShadowCloneState) => void; // 分身がその場で近接攻撃(プレイヤーの近接処理＋スキル効果を共用)
  tickShadowClone: () => void;                           // 毎フレーム: 1秒ごとの自動攻撃と寿命(5秒)消滅を進める
  expireShadowClone: () => void;                         // 分身を消滅させCD(3s)開始(寿命切れ/画面外)

  // 火炎瓶(molotov)サブウェポン。現在のサイクルの投下進捗(純関数 computeMolotovTick の状態)。
  // null=アイドル(次サイクルはCD明けで開始)。判定自体は src/utils/molotov.ts、ここは適用のみ。
  molotovCycle: MolotovCycleState | null;
  setMolotovCycle: (cycle: MolotovCycleState | null) => void; // useGameLoop が computeMolotovTick の結果を反映するだけ

  // センサー地雷(sensor-mine)サブウェポン(PACING_PUZZLE.md §6.4 M27)。設置は triggerCounter(近接スイング)、
  // 感知/起爆判定は純関数 tickSensorMines(src/utils/sensorMine.ts)+useGameLoop が爆発処理、描画は pixiScene が直読み。
  sensorMines: SensorMineState[];
  setSensorMines: (mines: SensorMineState[]) => void; // useGameLoop が tickSensorMines の結果を反映するだけ
  // §6.13 M36: 設置チャージ制(グローバルCDは撤去)。回復待ちチャージの readyAt 配列(純関数=sensorMine.ts)。
  // 要素なし=全チャージ準備完了。triggerCounter が設置のたびに直接 set() する(専用アクションは無し)。
  sensorMineCharges: number[];

  // 援護射撃(support-sniper)サブウェポン(PACING_PUZZLE.md §6.5 M28)。CDは「移動中のみ進む残りms」
  // (subWeaponCooldowns の絶対時刻方式では停止中の保持ができないため専用フィールド)。
  // 判定は純関数 computeSupportSniperTick(src/utils/supportSniper.ts)+useGameLoop が発射/NPC状態機械、
  // NPC(画面縁のスライド演出・同時1人)の描画は pixiScene が直読み。
  supportSniperCdMs: number;
  supportSniperNpc: SupportSniperNpcState | null;
  setSupportSniperCd: (ms: number) => void;                            // useGameLoop が tick の結果を反映するだけ
  setSupportSniperNpc: (npc: SupportSniperNpcState | null) => void;    // useGameLoop がNPCの生成/発射打刻/消滅を反映するだけ

  // フレアガン(flare-gun)サブウェポン(PACING_PUZZLE.md §6.6 M29)。発射は triggerCounter(近接スイング・CD制)、
  // 引き付けは updateEnemies/combatTick が activeFlareTargets(疑似召喚)を resolveEnemyTarget へ合流、
  // 寿命の回収は useGameLoop(pruneFlares)、描画は pixiScene が直読み。ダメージ無し。
  flareGunFlares: FlareGunFlare[];
  setFlareGunFlares: (flares: readonly FlareGunFlare[]) => void; // useGameLoop が pruneFlares の結果を反映するだけ
  spawnGroundFire: (x: number, y: number) => void;             // 足元に火を1つ設置(molotovの投下。useGameLoopから呼ぶ)
  tickGroundFires: () => void;                                 // 毎フレーム: 火の寿命切れ回収 + 敵への接触ダメージ(0.5秒スロットル)
  spawnBossFire: (x: number, y: number, spawnAt: number, activateAt: number, expireAt: number) => void; // ジブリルの紫の単発火を1つ設置(useGameLoopから呼ぶ)
  setBossFires: (fires: BossFire[]) => void;                   // ジブリル火の配列を差し替え(useGameLoopのtickが枝刈り/被弾処理後に反映)

  // 救急鞄(first-aid-kit)サブウェポン。中身(弾薬/回復/爆弾)の払い出し済みフラグ+鞄投擲済みフラグ
  // (1ラン限り)。判定自体は src/utils/firstAidKit.ts(純関数)、ここは状態の保持のみ。
  firstAidKitState: FirstAidKitState;
  setFirstAidKitState: (state: FirstAidKitState) => void; // useGameLoop が computeFirstAidKitTick の結果を反映するだけ

  // スキル「救難信号」。近接ヒット時(triggerCounter)に発動判定した結果をここで一体生成する。
  // rescueAllies の state 宣言自体は上(groundFires近く)にまとめてある。
  spawnRescueAlly: (klass: CharacterClass, fromX: number, fromY: number, target: { id: string; x: number; y: number; footY: number }, damage: number) => void;
  tickRescueAllies: () => void; // 毎フレーム: 着弾フレームでダメージ適用(必中) + 寿命切れ回収

  // 救急鞄(first-aid-kit)の空鞄投擲。判定(誰に投げるか/ダメージ量)は useGameLoop の
  // isFirstAidKitEmpty ブロックが決め、ここは飛行中のエンティティの生成・着弾処理のみ担う。
  spawnThrownBag: (fromX: number, fromY: number, target: { id: string; x: number; y: number }, damage: number) => void;
  tickThrownBags: () => void; // 毎フレーム: 飛行完了フレームでダメージ+ノックバック+FX適用(必中) + 寿命切れ回収

  // Player actions
  movePlayer: (input: InputState, deltaTime: number) => void;
  // スケーター: 1秒以上走行後に進行方向と逆へスティックで急停止＋前方短距離バッシュ衝撃波。
  triggerSkaterBash: () => void;
  // スケボー(新仕様): ダブルタップで乗車 / 指離しで降車(+1秒以上乗車なら進行方向へ投擲)。
  mountSkater: () => void;
  dismountSkater: () => void;
  // 投擲したスケボーが敵に当たった時の前方バッシュ(useGameLoop が衝突検出して呼ぶ)。
  skaterBoardHit: (x: number, y: number, dirX: number, dirY: number) => void;
  setSwipeDirection: (direction: { x: number; y: number } | null, strength?: number) => void;
  setMouseAim: (screen: { x: number; y: number } | null) => void;
  setTouchActive: (active: boolean) => void;
  setLastDirection: (direction: { x: number; y: number } | null) => void;
  damagePlayer: (amount: number, source?: string, fromX?: number, fromY?: number, damagerType?: EnemyType, damagerWasNamed?: boolean) => boolean; // fromX/Y=被弾源(指定時、そこから離れる方向へプレイヤーをノックバック)。damagerType/damagerWasNamed=宿敵昇格判定用(§5.14 M13)
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
  // ワイヤーアンカー: フリックでフリック方向に刺す(true=発動)。1秒後に startWireDash で高速移動。
  triggerWireAnchor: (dirX: number, dirY: number) => boolean;
  startWireDash: () => void;
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
  sellSubWeapon: (key: SubWeaponKey) => boolean;
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
  damageEnemy: (id: string, amount: number, nonLethalBoss?: boolean, crit?: boolean, viaMeleeFinish?: boolean, damageChannel?: 'gun' | 'other' | null) => boolean; // nonLethalBoss=爆発系: ボス系にトドメを刺さない / crit=裏ボスの完全気絶カウント用 / viaMeleeFinish=近接フィニッシュ経由(§5.21-追補4 finishKillOnlyのトドメを許可) / damageChannel=§6.21 M46計測用(既定'other'。gun系projectile命中経路のみ'gun'を渡す。プレイヤー起因でない場合はnull)
  updateEnemies: (deltaTime: number) => void;
  // スカジ氷ハザードの設置(裏ボスコントローラから呼ぶ)。判定/移動は updateEnemies が回す。
  spawnSkadiIce: (x: number, y: number, bornAt: number, fireAt: number, enemyId: string) => void;
  spawnSkadiBlade: (x: number, y: number, angle: number, launchAt: number, enemyId: string, visual?: 'ice' | 'bone') => void; // visual='bone'=ラフィの骨刃(見た目のみ差し替え・判定/挙動はスカジ刃と同じ)
  // NPCセリフ: キューに追加 / 毎フレームの表示進行(useGameLoopから呼ぶ)。
  enqueueNpcDialogue: (lines: { name: string; text: string; portrait?: string }[]) => void;
  updateNpcDialogue: (gameTime: number) => void;
  // 状況反応セリフをCD(同一NPC/同一カテゴリ)を守って投入。通れば true。
  tryNpcLine: (name: string, category: string, text: string, categoryCdMs: number) => boolean;
  // 護衛弾が敵を倒した地点(x,y)に最も近い護衛NPCに「自分で倒した」セリフを出す(A案)。
  npcKillReact: (x: number, y: number) => void;
  // イベント系クリア地点(x,y)に対応する地域NPC(最寄り拠点担当)に「作戦準備が進んだ」セリフを出す。
  npcOpPrepReact: (x: number, y: number) => void;
  // プレイヤー無双時: プレイヤー近傍(witness距離内)の護衛が「称賛」セリフを出す。
  npcPraiseReact: () => void;
  npcAreaEnterReact: (sectorIdx: number) => void; // 担当エリア進入時にその担当NPCが「遠い時用」セリフ。
  stunEnemy: (id: string, until: number) => void;
  rootEnemy: (id: string, until: number) => void;
  knockbackEnemy: (id: string, dirX: number, dirY: number, multiplier?: number, maxStrength?: number) => void;
  openCounterWindow: () => void;
  setSlasherCombo: (startAt: number, step: number) => void;
  markMeleeSwingFx: () => void; // 近接スイング演出の起点を更新(描画のみ)。追撃など別経路から呼ぶ。
  markFirstAidPoseFx: () => void; // 救急鞄スキル発動演出の起点を更新(描画のみ)。払い出しの瞬間に呼ぶ。
  markCastleBossSpawned: () => void;
  // 囲い系イベント: 開始(activeEvent をセット＋囲い周辺の通常敵を一掃)/ 終了(activeEvent=null＋残存イベント敵を撤去)。
  beginArenaEvent: (event: ActiveEvent) => void;
  endArenaEvent: () => void;
  // 紅き夜: 警告開始(10秒後に本番)/ 本番移行/ 終了/ 拠点・商人で逃げる。
  beginRedNightWarning: (gameTime: number) => void;
  activateRedNight: () => void;
  endRedNight: () => void;
  skipRedNight: () => void;
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
  // 経験値オーブのドロップ(色付き個体は個数が増える)。value 省略時は enemy.experienceValue。
  dropEnemyXp: (enemy: Enemy, x: number, y: number, idPrefix: string, value?: number) => void;

  // Breakable props
  syncBreakableProps: (camera: { x: number; y: number }, bounds: GameBounds) => void;
  spawnEggRing: (cx: number, cy: number) => void; // イベント: 画面外を緑卵(mine)で取り囲む。解除なし=離れると自然消滅。
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
  setGameTime: (time: number, realTime?: number) => void;
  setBackgrounded: (v: boolean) => void; // タブ/アプリが裏かを設定(進行停止用)。visibility/ネイティブpauseから呼ぶ。
  setPaused: (paused: boolean) => void;
  setMeleeAmmoDropPercent: (pct: number) => void;
  setAmmoPickupAmount: (type: AmmoType, amount: number) => void;
  setUnlockedShopSkillCard: (key: SubWeaponKey, level: number) => void;
  setStartWithTestStraps: (enabled: boolean) => void;
  setShowStatsOverlay: (enabled: boolean) => void;
  stampPlayerIntro: () => void; // 登場演出の開始(初フレームで終了時刻を確定)
  setRendererReady: (ready: boolean) => void; // レンダラ初フレーム表示の通知(PixiStage が初 render 後に true)
  startIntroDialogue: () => void; // 登場セリフ開始(時間停止)
  setIntroDialogueLines: (lines: IntroLine[]) => void; // 出撃ごとの会話を設定(選択ミッション/フリー)
  pendingLoadout: SubWeaponKey[];                       // 装備メニューで選んだサブ(出撃時に resetGame が所持へ反映・永続)
  setPendingLoadout: (keys: SubWeaponKey[]) => void;
  pendingSkills: SkillKey[];                            // 装備メニューで選んだスキル(最大2・永続)
  setPendingSkills: (keys: SkillKey[]) => void;
  ownedSkills: SkillKey[];                              // ガチャで解禁済みスキル(永続)。装備候補はここから。
  ownedSkillLevels: Partial<Record<SkillKey, number>>;  // 所持スキルのLv(ガチャ重複で上昇・永続)
  gachaDupeCounts: Partial<Record<SkillKey, number>>;   // ガチャのスキル別「被り回数」(Lv抽選表の参照・永続)
  gachaPitySinceSuper: number;                          // 直近superからのpull数(レア度ソフト天井・永続)
  grantSkill: (key: SkillKey) => void;                  // ガチャ当選で所持解禁(重複は無視)
  grantSkillLevel: (key: SkillKey, level: number) => boolean; // 解禁＋Lv上書き(既存より高ければ)。上がれば true
  pullGacha: () => GachaPullResult | null;              // 強化訓練を1回引く(レア度pity→Lv抽選→付与/返金。逐次状態更新)
  goldBalance: number;                                  // 永続ゴールド残高(ガチャ通貨。in-run strap とは別)
  addGold: (amount: number) => void;                    // ラン結果のゴールドを加算(永続)
  spendGold: (amount: number) => boolean;               // ガチャ消費。足りれば true
  // PACING_PUZZLE.md §5.14 M13: 宿敵(ネームド)。namedFoeは永続メタ(1体分のみ)、残りはラン内限定。
  namedFoe: NamedFoeMeta | null;                         // 現在の宿敵(型/名前/因縁回数)。null=まだ誰も昇格していない
  namedFoeRunEligible: boolean;                          // このランで湧かせて良いか(resetGameで60%抽選・1回だけ)
  namedFoeSpawnedThisRun: boolean;                       // このランで既に湧かせたか(同一ラン内は1体だけ)
  namedFoeResult: { name: string; defeated: boolean } | null; // リザルト表示用(このランで宿敵が登場したかどうか)
  namedFoeRunResolved: boolean;                          // このランの宿敵の決着(討伐/自分を殺した/新規上書き)が
                                                          // 既についたか。falseのまま次ランへ行くと持ち越し(因縁+1)
  lastDamagerType: EnemyType | null;                     // 直近の被弾元の型(宿敵昇格判定用)
  lastDamagerWasNamed: boolean;                          // 直近の被弾元が現在の宿敵インスタンスそのものだったか
  // PACING_PUZZLE.md §5.17 M14: 到達譜=二軸の壁(深さ×ランク)。wallMetaは現在ステージの永続メタ
  // (resetGameで現在の選択ステージ分を読み直す)。バンド/銘打ちはラン内限定の演出状態。
  wallMeta: WallMeta;                                    // ステージ毎の踏破/到達フラグ+自己最深+自己最高ランク
  wallBandText: string;                                  // 中格=帯の文言(空文字=非表示)
  wallBandUntil: number;                                 // 帯の表示終了時刻(Date.now()基準)
  wallBandColor: 'white' | 'gold';                        // 帯の色(白=深さ予告/金=宿敵出現)
  wallEventQueue: WallInscriptionEvent[];                 // 大格=銘打ちの再生キュー(先頭のみ表示)
  wallEventSeq: number;                                  // キューitemのid採番用
  // PACING_PUZZLE.md §5.17-追補/§5.19 M18: 昇格度(惜しさ)表示用。直近に完了した「通常」コマの
  // 査定入力スナップショット(directorTick.tsがコマ切替の度に書き換える)。死亡リザルトが1回だけ
  // 読んでpromotionScore()に渡す(rankAssessor.ts)。負荷0/10(読むだけ)。
  lastKomaAssessmentInput: KomaAssessmentInput | null;
  // 屋内(研究施設)ステージ
  indoorMode: boolean;                                  // 屋内マップ(壁/カメラクランプ/湧き抑制)有効か
  // ステージ6(洋館・奥行き通路)。true の間: 横移動を ±CORRIDOR_LATERAL_CLAMP に拘束し、
  // 木/トーチ/緑卵を出さず、湧きは上(奥)主体、描画は通路投影(pixiScene/corridorLayer)。とりあえず統合v0.25.2105。
  corridorMode: boolean;
  pendingCorridor: boolean;                             // 出撃が洋館通路(stage-6メイン)か(startGame→resetGame で受け渡し)
  setPendingCorridor: (on: boolean) => void;
  // 洋館開始の走り込み(v0.25.2110・社長指示「ヘリ登場いらない。下から走り込んできて」):
  // resetGameがプレイヤー/護衛を下(+y)に置きtrueにする→useGameLoopが上へ自動走行させ、到着(y<=0)で解除。
  // trueの間はisInputLockedで操作を遮断(実移動なので歩行アニメ/護衛追走/カメラ追従は通常システムのまま)。
  corridorRunInActive: boolean;
  clearCorridorRunIn: () => void;
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
  setPendingSuppression: (on: boolean) => void;   // 出撃が制圧イベント(ステージ1メイン)か
  setPendingStoryBoss: (on: boolean) => void;     // 出撃がストーリーボス専用(M7/EX)か
  setPendingRevisit: (on: boolean) => void;       // 出撃が洋館［SUB］再訪か
  completeEventEncounter: () => void;             // M5遭遇のみ(統合正本4.5): 会話→完了(受注/報酬なし)
  useGlenMedicine: () => void;                    // 再訪: ［グレンの薬を使う］(統合正本9.3)
  farBackdrop: string;                                  // この出撃の遠景差し替えキー(''=既定の森遠景 / 'city'=夜の廃都。描画が参照)
  pendingNearHorizon: string;                           // 出撃ステージの遠景森2キー(resetGame で nearHorizon へ)
  setPendingNearHorizon: (key: string) => void;
  nearHorizon: string;                                  // この出撃の遠景森2キー(''=なし / 'forest' / 'city'。描画が参照)
  // 裏ボス(ステージ別の深層域ボス)。pending → resetGame で hiddenBoss へ。
  pendingHiddenBoss: EnemyType | null;                  // 出撃ステージの裏ボス種別(無ければ null)
  setPendingHiddenBoss: (t: EnemyType | null) => void;
  hiddenBoss: EnemyType | null;                         // この出撃の裏ボス種別(useGameLoop の専用コントローラが参照)
  bossChasing: boolean;                                 // 裏ボスが「追いかけてきている」状態(=他敵が逃げる/イベント抑制。コントローラが毎フレ更新)
  bossCorpse: { type: EnemyType; x: number; y: number; w: number; h: number; diedAt: number } | null; // 討伐後のフェードアウト演出(描画のみが参照)
  hiddenBossDefeated: boolean;                          // 裏ボスを討伐済みか(方角矢印の表示打ち切り等に使用)
  kogarasuUnlockedThisRun: boolean;                     // このランでトール初回討伐=小烏丸を永続解禁したか(リザルトの解禁ポップアップ用)
  debugLoopError: string;                               // 診断: ゲームループ本体で投げられた例外の要約(?debug=1 表示)
  triggerEventVictory: () => void;                      // 終了アイテム/ゴール: 帰還サークルを出す(即勝利しない)
  beginReturnPhase: (originX: number, originY: number, avoidPlayer?: boolean) => void; // 帰還サークル出現
  updateReturnPhase: (deltaTime: number) => void;       // 毎フレーム: サークル内滞在を計測し3秒で gameWon
  updateSuppression: (deltaTime: number) => { x: number; y: number }[]; // 毎フレーム: 制圧イベント。返り値=このフレームに護衛NPCが発砲した位置(NPC銃声の距離減衰再生用)
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
  triggerAttention: (x: number, y: number) => void; // 現地へカメラアテンション(時間停止で高速パン→ホールド→戻る)
  clearAttention: () => void;
  triggerTimeSlow: (scale: number, durationMs: number, holdMs?: number) => void; // holdMs=最も遅い倍率を保持する時間(既定0)
  triggerHitstop: (durationMs: number) => void; // 全停止の瞬間ストップ(カウンター/近接フィニッシュの衝撃)
  triggerHitImpact: (stopMs: number, shakeMs: number, shakeMag: number, zoomMag: number) => void; // ストップ→(後で)揺れ+寄り。ダンス中はストップ無しで即時
  // targetX/Y省略時は画面中央基準(カウンター等・従来どおり)。指定時はその世界座標点へ寄る(社長指示: KILLはキルされた対象へ)。
  // 近接フィニッシュ: ストップ+ズーム+スローを1拍エンベロープで発火(CD明けのみ・CD内は最低保証フラッシュのみ)。
  // 戻り値=そのキルでフル演出(CD明け)が出たか(呼び出し元が武器固有フラッシュを出すかの判断に使う)。
  triggerFinishImpact: (targetX?: number, targetY?: number) => boolean;
  triggerZoom: (mag: number, durationMs: number, holdMs?: number, targetX?: number, targetY?: number) => void; // 近接フィニッシュ等のパンチズーム(描画のみ)
  // dirX/dirY(§5.23 M22 C1・任意・未正規化でよい): 指定時はシェイクをその方向へ寄せる。
  // 未指定/{0,0}/`?dirfx=0`は従来どおり等方のランダム揺れ。
  triggerShake: (durationMs: number, mag?: number, dirX?: number, dirY?: number) => void; // 行動別の画面シェイク(描画のみ)

  // Visual effects (renderer-only; no gameplay impact)
  spawnEffect: (effect: VisualEffect) => void;
  // dirX/dirY(§5.23 M22 C1・任意): 指定時(かつ非ゼロ)は全方位ではなく、その方向を中心にした
  // 円錐(spawnSprayと同じ角度)へ絞って噴く。未指定/{0,0}/`?dirfx=0`は従来どおり全方位。
  spawnBurst: (x: number, y: number, color: string, count?: number, dirX?: number, dirY?: number) => void;
  // 指定方向(dirX,dirY)へ円錐状に粒子を噴く(被弾の出口=背中側の破裂演出など)。色はランダムに使い分け。
  spawnSpray: (x: number, y: number, dirX: number, dirY: number, count: number, colors: string[]) => void;
  spawnFireJet: (x: number, y: number, angle: number, len: number) => void; // 銃弾ヒット時、背中側へ火の破裂(2コマ立ち絵)
  spawnBlood: (x: number, y: number, angle: number, len: number) => void; // 銃弾ヒット時、背中側へ血飛沫(3コマ100msずつ・OP同素材)
  spawnMeleeBlood: (ex: number, ey: number, size?: number) => void; // 近接ヒット時、敵からプレイヤーへ向かって飛ぶ血飛沫(専用素材)
  spawnDamageNumber: (x: number, y: number, value: number, crit?: boolean) => void;
  spawnAmmoNumber: (x: number, y: number, amount: number) => void;
  spawnCallout: (x: number, y: number, text: string, color: string, opts?: { scale?: number; serif?: boolean; bg?: number; holdMs?: number; duration?: number }) => void;
  spawnImageMark: (x: number, y: number, texture: string, opts?: { scale?: number; duration?: number; color?: string }) => void;
  spawnRing: (x: number, y: number, startRadius: number, endRadius: number, color: string, width?: number, duration?: number) => void;
  spawnGlow: (x: number, y: number, radius: number, color: string, duration?: number) => void;
  spawnSlash: (x: number, y: number, color?: string, lengthScale?: number) => void;
  spawnFlash: (color: string, duration?: number) => void;
  // §5.23 M22 C3: 「N HITS」バナー(頭上・bitmap-text)+小フラッシュ。registerMultiHitから相乗りで呼ぶ。
  spawnMultiHitFx: (x: number, y: number, count: number) => void;
  updateEffects: (deltaTime: number) => void;
  // PACING_PUZZLE.md §5.17 M14: 到達譜=二軸の壁の演出トリガー。
  triggerWallBand: (text: string, color: 'white' | 'gold', durationMs: number) => void;
  enqueueWallEvent: (kind: WallEventKind, title: string, sub: string, color: string, gold?: number) => void;
  dequeueWallEvent: () => void;
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
    meleeSwingAt: 0,
    firstAidPoseAt: 0,
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
    skillLevels: {},
    fireShooterCdUntil: 0, reflexCdUntil: 0, slasherRingStartAt: 0, slasherStrikeStep: 0, slasherReach: 0,
    scavengerBuffUntil: 0, marksmanMovingSince: 0, heavyGunnerExpBuffUntil: 0,
    phillReticleDX: 0, phillReticleDY: 0, phillSnapEnemyId: null,
    knifeComboCount: 0, knifeComboUntil: 0, benkeiBuffUntil: 0, benkeiCdUntil: 0,
    seekerUntil: 0, seekerCdUntil: 0,
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
    skaterStopUntil: 0,
    skaterBashCdUntil: 0,
    skaterRiding: false,
    skaterRideStartAt: 0,
    wireAnchorX: 0,
    wireAnchorY: 0,
    wireAnchored: false,
    wirePlantUntil: 0,
    wireDashUntil: 0,
    wireDashSpeed: 0,
    wireStuckEnemyId: '',
    wireStuckUntil: 0,
    wireSlamEnemyId: '',
    wireSlamStart: 0,
    straps: 0,
    vaccineRevives: 0,
    equipment: emptyEquipLoadout(),
    equipBonus: neutralEquipBonus()
  },
  enemies: [],
  pumpkinBlasts: [],
  shieldBlocks: [],
  skadiIceMarkers: [],
  skadiIceBlades: [],
  groundFires: [],
  bossFires: [],
  gateActive: false,
  deepZoneLocked: false,
  rescueAllies: [],
  thrownBags: [],
  boomerangReadyFxAt: 0,
  marksmanRangeFxAt: 0,
  marksmanRangeFxShownFor: 0,
  rescueShooterFxAt: 0,
  eventBannerText: '',
  eventBannerUntil: 0,
  npcDialogue: null,
  npcDialogueQueue: [],
  npcDialogueNextAt: 0,
  npcSpokeAt: {},
  npcCatAt: {},
  backgrounded: false,
  bashHitFxAt: 0,
  whipHitFxAt: 0,
  whipSwingFxAt: 0,
  anchorPlantFxAt: 0,
  anchorEnemyHitFxAt: 0,
  boomerangThrowFxAt: 0,
  junkShotFxAt: 0,
  summonFxAt: 0,
  homingLocks: [],
  shadowClone: null,
  molotovCycle: null,
  sensorMines: [],
  sensorMineCharges: [],
  supportSniperCdMs: SUPPORT_SNIPER_CD_MS_BY_LEVEL[1],
  supportSniperNpc: null,
  flareGunFlares: [],
  firstAidKitState: createFirstAidKitState(),
  projectiles: [],
  pickups: [],
  breakableProps: [],
  destroyedBreakableProps: {},
  mineAmbushAnchor: null,
  castleEvent: createCastleEvent(),
  activeEvent: null,
  redNight: null,
  screamerBuffUntil: 0,
  weaponMerchant: createWeaponMerchant(),
  merchantDwellMs: 0,
  eventQuestNpc: createEventQuestNpc(),
  eventQuestActive: null,
  eventQuestKills: 0,
  eventQuestGoalCount: 0,
  eventQuestGoalTier: null,
  gameTime: 0,
  realGameTime: 0,
  isPaused: false,
  showUpgradeMenu: false,
  levelUpIntroUntil: 0,
  showShopMenu: false,
  showEventQuestMenu: false,
  shopReopenAt: 0,
  eventQuestReopenAt: 0,
  vaccinePurchased: false,
  gameWon: false,
  finaleDefeated: false,
  baseSites: createBaseSites(),
  escorts: [],
  suppressionActive: false,
  suppressionCaptureCount: 0,
  safeBaseId: null,
  pendingSuppression: false,
  pendingStoryBoss: false,
  storyBossMode: false,
  pendingRevisit: false,
  revisitMode: false,
  medicineUsedAt: 0,
  medicinePromptVisible: false,
  returnCircle: null,
  gameReturned: false,
  meleeAmmoDropPercent: loadMeleeDropPct(),
  ammoPickupAmounts: loadAmmoPickupAmounts(),
  unlockedShopSkillCards: {},
  pendingLoadout: loadStringArray(LOADOUT_SUBS_KEY) as SubWeaponKey[],
  pendingSkills: (loadStringArray(LOADOUT_SKILLS_KEY) as SkillKey[]).slice(0, 2),
  ownedSkills: loadStringArray(OWNED_SKILLS_KEY) as SkillKey[],
  ownedSkillLevels: loadSkillLevels(),
  gachaDupeCounts: loadDupeCounts(),
  gachaPitySinceSuper: loadNumber(GACHA_PITY_KEY, 0),
  goldBalance: loadNumber(GOLD_BALANCE_KEY, 0),
  namedFoe: loadNamedFoe(),
  namedFoeRunEligible: false, // 実際の抽選はresetGame開始時(初回マウント時点ではまだラン開始前)
  namedFoeSpawnedThisRun: false,
  namedFoeResult: null,
  namedFoeRunResolved: false,
  lastDamagerType: null,
  lastDamagerWasNamed: false,
  wallMeta: getWallMeta(getSelectedStageId()), // 実際の再読込はresetGame開始時(ステージ切替に追従)
  wallBandText: '',
  wallBandUntil: 0,
  wallBandColor: 'white',
  wallEventQueue: [],
  wallEventSeq: 0,
  lastKomaAssessmentInput: null,
  indoorMode: false,
  corridorMode: false,
  pendingCorridor: false,
  corridorRunInActive: false,
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
  pendingHiddenBoss: null,
  hiddenBoss: null,
  bossChasing: false,
  bossCorpse: null,
  hiddenBossDefeated: false,
  kogarasuUnlockedThisRun: false,
  debugLoopError: '',
  startWithTestStraps: false,
  showStatsOverlay: false,
  introUntil: 0,
  rendererReady: false,
  tutorialPopup: null,
  tutorialPopupShown: false,
  captureFrame: null,
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
  mouseAim: null,
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
    treasuresCollected: 0,
    damageTaken: 0,
    meleeFinishers: 0,
    eliteKills: 0,
    bossKills: 0,
    maxAreaReached: 0,
    maxDepthDist: 0,
    maxRankReached: 1
  },
  characterClass: 'warrior',
  effects: [],
  camera: {
    x: 0,
    y: 0
  },
  lastWeaponGet: null,
  hitstopUntil: 0,
  attention: null,
  timeSlowUntil: 0,
  timeSlowScale: 1,
  timeSlowStart: 0,
  timeSlowHoldMs: 0,
  shakeUntil: 0,
  shakeMag: SHAKE_MAG,
  shakeDur: SHAKE_MS,
  shakeDirX: 0,
  shakeDirY: 0,
  zoomUntil: 0,
  zoomMag: 0,
  zoomStart: 0,
  zoomHoldMs: 0,
  zoomHasTarget: false,
  zoomTargetX: 0,
  zoomTargetY: 0,
  lastKillZoomAt: 0,
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
        // スキル: ランナー = 通常歩行/リロード移動の移動速度 +10/15/20%(Lv)。リロード中はさらに+10%(§6.8 M31)。
        // スキル: ウォームアップ = 出撃から60秒間、移動速度+10%(§6.8 M31)。
        : reloading ? player.speed * RELOAD_MOVE_SPEED_MULT * (hasSkill(player, 'skater') && player.skaterRiding ? 3 : 1) * skillRunnerSpeedMult(player, true) * marksmanSpeedMult(player, state.gameTime) * skillWarmUpSpeedMult(player, state.gameTime) * (player.equipBonus?.moveSpeedMult ?? 1)
        : player.speed * (hasSkill(player, 'skater') && player.skaterRiding ? 3 : 1) * skillRunnerSpeedMult(player) * marksmanSpeedMult(player, state.gameTime) * skillWarmUpSpeedMult(player, state.gameTime) * (player.equipBonus?.moveSpeedMult ?? 1);

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
      // スケーター: 速度×3は全Lv共通。Lvが上がるほど慣性(tau)を軽減し操作性を改善(Lv1:1.2/Lv2:0.8/Lv3:0.5)。
      const skLv = skillLevel(player, 'skater');
      // 強慣性は乗車中のみ(非乗車=通常の即応操作)。
      const inertiaTau = (skLv && player.skaterRiding) ? [PLAYER_INERTIA_TAU, 1.2, 0.8, 0.5][skLv] : PLAYER_INERTIA_TAU;
      const alpha = inertiaAlpha(deltaTime, inertiaTau);
      // 被弾ノックバック中は入力を無視して、減衰する弾き出し速度で滑る(ジャンプ攻撃被弾など)。
      const kbNow = Date.now();
      const kbActive = player.knockbackUntil !== undefined && kbNow < player.knockbackUntil;
      // スケーター急停止中: 入力を無視して残速度を素早く減衰(tau=50ms)=ほんの少し慣性のある急停止。
      const skaterStopping = !kbActive && kbNow < player.skaterStopUntil;
      let vx: number, vy: number;
      if (kbActive) {
        const decay = Math.max(0, (player.knockbackUntil! - kbNow) / PLAYER_KNOCKBACK_MS); // 1→0
        vx = (player.knockbackVx ?? 0) * decay;
        vy = (player.knockbackVy ?? 0) * decay;
      } else if (skaterStopping) {
        const d = Math.exp(-deltaTime / 0.05); // 約50msの時定数で素早く0へ
        vx = player.vx * d;
        vy = player.vy * d;
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
        // チュートリアルは城なし(v0.25.1822)=当たり判定もスキップ(描画はpixiScene側で非表示)。
        const castleResolved = (labTheme || get().farBackdrop === 'tutorial') ? resolved : resolveCastleCollision({
          x: resolved.x,
          y: resolved.y,
          width: player.width,
          height: player.height,
        }, castleEvent);
        // 散布オブジェクト(廃都の瓦礫/雪原の塔・バス・テント等)を遮蔽物として解決(プレイヤーのみ)。
        // カタログの無いステージ(forest等)は resolveCityPropCollision が即 return(no-op)。
        const cityResolved = !labTheme
          ? resolveCityPropCollision(state.farBackdrop, { x: castleResolved.x, y: castleResolved.y, width: player.width, height: player.height })
          : castleResolved;
        // 壁オブジェクト(研究所スキン・区画生成)を遮蔽物として解決。近傍区画のみ問い合わせ。
        let wallResolved = cityResolved;
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
        // チュートリアル: 上下移動は中心(スポーンy=0)から±100pxまで=透明な壁(社長指示v0.25.1826/1828)。
        // 左はスタートから−100pxまで(社長指示v0.25.1829)。右は自由(帰還サークルへ進む)。
        if (get().farBackdrop === 'tutorial') {
          const half = player.height / 2;
          newY = Math.max(-TUTORIAL_MOVE_Y_LIMIT_PX - half, Math.min(TUTORIAL_MOVE_Y_LIMIT_PX - half, newY));
          newX = Math.max(TUTORIAL_MOVE_X_MIN_PX - player.width / 2, newX);
        }
        // 洋館通路(corridorMode): プレイヤー中心xを ±CORRIDOR_LATERAL_CLAMP(world px)に拘束する
        // (柱ライン=移動境界。renderer側の横写像Kと同じ値を共有)。敵は拘束しない(とりあえず)。
        // 横のみ・壁解決の後・囲いクランプの前(社長指示・とりあえず統合v0.25.2105)。
        if (state.corridorMode) {
          const halfW = player.width / 2;
          newX = Math.max(-CORRIDOR_LATERAL_CLAMP - halfW, Math.min(CORRIDOR_LATERAL_CLAMP - halfW, newX));
          // 下限(v0.25.2123): スタート地点から50px下まで(走り込み入場中=下から来る間は除外)。
          if (!state.corridorRunInActive) newY = Math.min(newY, CORRIDOR_BOTTOM_LIMIT);
        }
      }
      // 囲い系イベント中はプレイヤーを円(囲い)の内側へ拘束(円コリジョン)。壁解決の後に最終クランプ。
      // ただし救助(rescue)イベントと、confinesPlayer=false を明示するイベントはプレイヤーを閉じ込めない
      // =出入り自由(社長指示)。囲いゲート1/2は現在どちらもハード(既定どおり拘束=省略)。
      if (state.activeEvent && state.activeEvent.kind !== 'rescue' && state.activeEvent.confinesPlayer !== false) {
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
      // PC(マウス)照準: スクリーン座標 mouseAim をワールドへ(camera を足す)。タッチ時は null。
      const mouseWorld = state.mouseAim
        ? { x: state.camera.x + state.mouseAim.x, y: state.camera.y + state.mouseAim.y }
        : null;
      // aim ベクトル: マウス時は「プレイヤー→カーソル」の即時方向(慣性なし・360度)。
      // タッチ/キーボード時は従来のスティック慣性 aim(向き×傾き強度)。
      let aimX: number, aimY: number;
      if (mouseWorld) {
        const adx = mouseWorld.x - (newX + player.width / 2);
        const ady = mouseWorld.y - (newY + player.height / 2);
        const al = Math.hypot(adx, ady) || 1;
        aimX = adx / al; aimY = ady / al;
      } else {
        aimX = player.aimX + ((ld.x / ldl) * aimMag - player.aimX) * aimAlpha;
        aimY = player.aimY + ((ld.y / ldl) * aimMag - player.aimY) * aimAlpha;
      }

      // キャラ固有 マークスマン: 連続移動の開始時刻を追跡(停止で0=解除)。動き出した瞬間にだけ更新。
      const marksmanMovingSince = isMoving ? (player.isMoving ? player.marksmanMovingSince : state.gameTime) : 0;
      // 速度上昇(移動2s+)が発動した瞬間=この streak で初めて 2秒を超えたフレームで頭上マークを出す。
      const marksmanRangeActive = player.characterClass === 'mage' && isMoving &&
        marksmanMovingSince > 0 && state.gameTime - marksmanMovingSince >= MARKSMAN_MOVE_BUFF_MS;
      const marksmanProc = marksmanRangeActive && state.marksmanRangeFxShownFor !== marksmanMovingSince;

      // PHILL銃: 狙いサークルの「吸い付き」。基準=プレイヤー中心+aim×190。近い敵の頭(SNAP半径内)が
      // あればその頭中心へスナップ。発砲(firePhillShot)と描画(pixiScene)はこの結果を共有する。
      let phillReticleDX = player.phillReticleDX;
      let phillReticleDY = player.phillReticleDY;
      let phillSnapEnemyId: string | null = null;
      if (getActiveGun(player)?.key === 'phill-revolver') {
        const rcx = newX + player.width / 2;
        const rcy = newY + player.height / 2;
        // マウス照準時はカーソル位置(ワールド)そのものをレティクル基準に=照準がマウス連動。
        // タッチ/キーボード時は従来どおり aim 方向×射程の固定距離。
        let baseX: number, baseY: number;
        if (mouseWorld) {
          baseX = mouseWorld.x;
          baseY = mouseWorld.y;
        } else {
          const hasAim = Math.hypot(aimX, aimY) > 0.001;
          const dirx = hasAim ? aimX : (lastDirection?.x ?? 1);
          const diry = hasAim ? aimY : (lastDirection?.y ?? 0);
          const scale = hasAim ? PHILL_AIM_RANGE : PHILL_AIM_RANGE / Math.max(0.001, Math.hypot(dirx, diry));
          baseX = rcx + dirx * scale;
          baseY = rcy + diry * scale;
        }
        let bestD2 = PHILL_SNAP_RADIUS * PHILL_SNAP_RADIUS;
        let snapX = baseX, snapY = baseY;
        const stage3 = state.farBackdrop === 'city';
        for (const e of state.enemies) {
          if (e.type === 'reaper' && !e.reaperChaser) continue;
          const fb = enemyFootBox(e);
          const hx = fb.footX;
          const hy = enemyHeadY(e, stage3); // 実描画の縦範囲に基づく頭付近(横長素材でも頭に乗る)
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

  // スケーター急停止バッシュ(社長指示): skater で1秒以上走行後、進行方向と逆へスティックを
  // 倒すと、進行方向へ短距離衝撃波(バッシュ=近接×SHIELD_BASH_DAMAGE_MULT＋ノックバック)を
  // 出して急停止する。条件は全てここで自己判定。useGameLoop が movePlayer 直後に毎フレーム呼ぶ。
  triggerSkaterBash: () => {
    const st = get();
    const { player, gameTime, swipeDirection, swipeStrength, inputState } = st;
    if (!hasSkill(player, 'skater')) return;
    const nowMs = Date.now();
    // 特殊ロコモーション中(一閃ダッシュ/ワイヤー/四神スライド/着地後隙/急停止中)は発動しない。
    if (nowMs < player.katanaDashUntil || nowMs < player.wireDashUntil || nowMs < player.shijinSlideUntil ||
        nowMs < player.katanaRecoveryUntil || nowMs < player.skaterStopUntil) return;
    if (gameTime < player.skaterBashCdUntil) return;            // 連射防止CD
    if (!player.isMoving) return;                                // 走行中のみ
    if (player.marksmanMovingSince <= 0 || gameTime - player.marksmanMovingSince < SKATER_BASH_RUN_MS) return; // 1秒以上走行
    // 進行方向(走っていた方角)。
    const hd = player.lastDirection ?? { x: 0, y: 0 };
    const hl = Math.hypot(hd.x, hd.y);
    if (hl < 0.01) return;
    const hx = hd.x / hl, hy = hd.y / hl;
    // 入力方向(スティック or キー)。
    let ix = 0, iy = 0;
    if (swipeDirection) {
      if (swipeStrength < 0.4) return; // 弱い傾きは誤爆防止
      ix = swipeDirection.x; iy = swipeDirection.y;
    } else {
      if (inputState.up) iy -= 1;
      if (inputState.down) iy += 1;
      if (inputState.left) ix -= 1;
      if (inputState.right) ix += 1;
    }
    const il = Math.hypot(ix, iy);
    if (il < 0.01) return;
    ix /= il; iy /= il;
    if (hx * ix + hy * iy > SKATER_BASH_REVERSE_DOT) return;    // 進行方向と逆(120°以上)でなければ不発

    // --- 発動: 前方扇 SKATER_BASH_RANGE 内の敵にバッシュ効果 ---
    const pcx = player.x + player.width / 2;
    const pcy = player.y + player.height / 2;
    const melee = player.weapons.find(w => w.isMelee);
    const meleeDamage = (melee?.damage ?? 6) * strikerMeleeMult(player) * (player.equipBonus?.damageMult ?? 1);
    const dmg = meleeDamage * SHIELD_BASH_DAMAGE_MULT;
    const now = Date.now();
    const r2 = SKATER_BASH_RANGE * SKATER_BASH_RANGE;
    const killedList: { enemy: Enemy; finisher: boolean }[] = [];
    const hitAt: { x: number; y: number }[] = [];
    const runSpeed = Math.hypot(player.vx, player.vy);

    set(state => {
      const out: Enemy[] = [];
      for (const enemy of state.enemies) {
        if (enemy.aiPhase === 'jump') { out.push(enemy); continue; } // 空中は無敵(既存仕様)
        if (enemy.type === 'reaper' && !enemy.reaperChaser) { out.push(enemy); continue; } // 死神本体は対象外
        const ecx = enemy.x + enemy.width / 2;
        const ecy = enemy.y + enemy.height / 2;
        const dxr = ecx - pcx, dyr = ecy - pcy;
        const d2 = dxr * dxr + dyr * dyr;
        if (d2 > r2) { out.push(enemy); continue; }
        const dl = Math.sqrt(d2) || 1;
        if ((dxr / dl) * hx + (dyr / dl) * hy < SKATER_BASH_ARC_DOT) { out.push(enemy); continue; } // 前方扇の外
        hitAt.push({ x: ecx, y: enemy.y });
        // §5.21-追補4: バッシュはフィニッシュではない。finishKillOnly個体はHP1で踏みとどまる。
        const newHealth = clampFinishKillOnlyHealth(enemy.finishKillOnly, Math.max(0, enemy.health - dmg), false);
        if (newHealth <= 0) { killedList.push({ enemy, finisher: false }); continue; } // 死亡=out から除外
        out.push({
          ...enemy,
          health: newHealth,
          lastHit: now,
          meleeAggro: true,
          knockbackVx: hx * SHIELD_BASH_KNOCKBACK_SPEED, // 進行方向へノックバック(バッシュ同等・距離2倍)
          knockbackVy: hy * SHIELD_BASH_KNOCKBACK_SPEED,
          knockbackUntil: now + KNOCKBACK_DURATION,
          knockbackImmuneUntil: now + KNOCKBACK_IMMUNE_MS,
        });
      }
      const bossKilled = killedList.some(k => k.enemy.type === 'giantbat' && !k.enemy.fromEvent);
      return {
        enemies: out,
        gameStats: {
          ...state.gameStats,
          enemiesKilled: state.gameStats.enemiesKilled + killedList.length,
          eliteKills: state.gameStats.eliteKills + killedList.reduce((n, k) => n + (isScoreElite(k.enemy.type) ? 1 : 0), 0),
          bossKills: state.gameStats.bossKills + killedList.reduce((n, k) => n + (isScoreBoss(k.enemy.type) ? 1 : 0), 0),
          damageDealt: state.gameStats.damageDealt + dmg * hitAt.length,
        },
        finaleDefeated: state.finaleDefeated || bossKilled,
        player: {
          ...state.player,
          // 急停止: 進行方向への残速度を少しだけ残し(ほんの少し慣性)、入力ロック窓へ。
          vx: hx * runSpeed * SKATER_BASH_RESIDUAL,
          vy: hy * runSpeed * SKATER_BASH_RESIDUAL,
          skaterStopUntil: now + SKATER_BASH_STOP_MS,
          skaterBashCdUntil: gameTime + SKATER_BASH_CD_MS,
        },
      };
    });
    // §6.21 M46: スキル(スケーターバッシュ)によるダメージ計測。channel='other'(近接カウンター振りではない)。
    if (hitAt.length > 0) recordDamageDealt('other', dmg * hitAt.length);

    // 撃破報酬(XP/通貨/弾薬)はバッシュと同じく grantMeleeKillRewards で。
    if (killedList.length > 0) grantMeleeKillRewards(get, killedList, player, getActiveGun(player));

    // 演出: 前方の衝撃波リング＋命中スラッシュ＋バースト＋ヒットストップ＋命中SE(バッシュ同等)。
    const fcx = pcx + hx * 26, fcy = pcy + hy * 26; // プレイヤーの少し前方を中心に
    get().spawnRing(fcx, fcy, 8, SKATER_BASH_RANGE, 'rgba(190,242,100,0.62)', 4, 240);
    get().spawnBurst(fcx, fcy, '#bef264', 12);
    for (const h of hitAt) { get().spawnSlash(h.x, h.y, 'rgba(203,213,225,0.95)'); get().spawnMeleeBlood(h.x, h.y); } // 近接の血飛沫込み(v0.25.2026)
    if (hitAt.length > 0) {
      get().triggerHitImpact(HITSTOP_MS, SHIELD_BASH_SHAKE_MS, SHIELD_BASH_SHAKE_MAG, 0);
      set({ bashHitFxAt: Date.now() }); // 命中SE(heavy-impact)。useGameLoop が検出して再生。
    }
  },

  // スケボー(新仕様): ダブルタップで乗車。skater 未装備/既に乗車中は無視。
  mountSkater: () => {
    const { player, gameTime } = get();
    if (!hasSkill(player, 'skater') || player.skaterRiding) return;
    set({ player: { ...get().player, skaterRiding: true, skaterRideStartAt: gameTime } });
  },
  // 指離しで降車。1秒以上乗車していれば進行方向へスケボーを投擲(当たると前方バッシュ)。未満は消えるだけ。
  dismountSkater: () => {
    const state = get();
    const player = state.player;
    if (!player.skaterRiding) return;
    const rode = state.gameTime - player.skaterRideStartAt;
    set({ player: { ...get().player, skaterRiding: false } });
    if (rode < SKATER_RIDE_MIN_MS) return; // 1秒未満=投擲なし(乗車解除のみ)
    const p = get().player;
    let dx = p.lastDirection?.x ?? 1, dy = p.lastDirection?.y ?? 0;
    const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
    const pcx = p.x + p.width / 2, pcy = p.y + p.height / 2;
    const now = Date.now();
    get().addProjectile({
      id: `proj-skateboard-${now}`,
      x: pcx - SKATEBOARD_SIZE / 2, y: pcy - SKATEBOARD_SIZE / 2,
      width: SKATEBOARD_SIZE, height: SKATEBOARD_SIZE, speed: SKATEBOARD_SPEED,
      damage: 0, direction: { x: dx, y: dy },
      weaponType: 'skateboard', weaponKey: 'skater',
      duration: SKATEBOARD_DURATION_MS, createdAt: now,
      passthrough: false, hitEnemies: [], hostile: false, reflected: false, crit: false,
    });
    get().spawnBurst(pcx, pcy, '#facc15', 10);
  },
  // 投擲スケボーが敵に当たった時: 命中点まわりへ前方バッシュ(近接×SHIELD_BASH_DAMAGE_MULT＋強制ノックバック)。
  skaterBoardHit: (x, y, dirX, dirY) => {
    const player = get().player;
    const melee = player.weapons.find(w => w.isMelee);
    const meleeDamage = (melee?.damage ?? 6) * strikerMeleeMult(player) * (player.equipBonus?.damageMult ?? 1);
    const dmg = meleeDamage * SHIELD_BASH_DAMAGE_MULT;
    const now = Date.now();
    const r2 = SKATEBOARD_BASH_RANGE * SKATEBOARD_BASH_RANGE;
    const killedList: { enemy: Enemy; finisher: boolean }[] = [];
    const hitAt: { x: number; y: number }[] = [];
    set(s => {
      const out: Enemy[] = [];
      for (const enemy of s.enemies) {
        if (enemy.aiPhase === 'jump') { out.push(enemy); continue; }
        if (enemy.type === 'reaper' && !enemy.reaperChaser) { out.push(enemy); continue; }
        const ecx = enemy.x + enemy.width / 2, ecy = enemy.y + enemy.height / 2;
        const d2 = (ecx - x) * (ecx - x) + (ecy - y) * (ecy - y);
        if (d2 > r2) { out.push(enemy); continue; }
        hitAt.push({ x: ecx, y: enemy.y });
        // §5.21-追補4: 投擲スケボーのバッシュもフィニッシュではない=finishKillOnlyはHP1で踏みとどまる。
        const nh = clampFinishKillOnlyHealth(enemy.finishKillOnly, Math.max(0, enemy.health - dmg), false);
        if (nh <= 0) { killedList.push({ enemy, finisher: false }); continue; }
        out.push({
          ...enemy, health: nh, lastHit: now, meleeAggro: true,
          knockbackVx: dirX * SHIELD_BASH_KNOCKBACK_SPEED, knockbackVy: dirY * SHIELD_BASH_KNOCKBACK_SPEED,
          knockbackUntil: now + KNOCKBACK_DURATION, knockbackImmuneUntil: now + KNOCKBACK_IMMUNE_MS,
        });
      }
      const bossKilled = killedList.some(k => k.enemy.type === 'giantbat' && !k.enemy.fromEvent);
      return {
        enemies: out,
        gameStats: {
          ...s.gameStats,
          enemiesKilled: s.gameStats.enemiesKilled + killedList.length,
          eliteKills: s.gameStats.eliteKills + killedList.reduce((n, k) => n + (isScoreElite(k.enemy.type) ? 1 : 0), 0),
          bossKills: s.gameStats.bossKills + killedList.reduce((n, k) => n + (isScoreBoss(k.enemy.type) ? 1 : 0), 0),
          damageDealt: s.gameStats.damageDealt + dmg * hitAt.length,
        },
        finaleDefeated: s.finaleDefeated || bossKilled,
      };
    });
    // §6.21 M46: スキル(投擲スケボー着弾バッシュ)によるダメージ計測。channel='other'。
    if (hitAt.length > 0) recordDamageDealt('other', dmg * hitAt.length);
    if (killedList.length > 0) grantMeleeKillRewards(get, killedList, player, getActiveGun(player));
    get().spawnRing(x, y, 8, SKATEBOARD_BASH_RANGE, 'rgba(190,242,100,0.62)', 4, 260);
    get().spawnBurst(x, y, '#bef264', 14);
    for (const h of hitAt) { get().spawnSlash(h.x, h.y, 'rgba(203,213,225,0.95)'); get().spawnMeleeBlood(h.x, h.y); } // 近接の血飛沫込み(v0.25.2026)
    if (hitAt.length > 0) { get().triggerHitImpact(HITSTOP_MS, SHIELD_BASH_SHAKE_MS, SHIELD_BASH_SHAKE_MAG, 0); set({ bashHitFxAt: Date.now() }); }
  },

  setSwipeDirection: (direction, strength) => {
    // 強度は省略時は据え置き(離した瞬間は方向 null だけ更新し、直前の強度を保持)。
    // → 1回の set() に畳み込み、毎フレームの set() 追加を避ける(CLAUDE.md)。
    set(strength != null ? { swipeDirection: direction, swipeStrength: strength } : { swipeDirection: direction });
  },

  setTouchActive: (active) => {
    set({ touchActive: active });
  },

  // PC(マウス)照準: キャンバス左上基準のスクリーン座標を保持(null で解除)。
  setMouseAim: (screen) => {
    set({ mouseAim: screen });
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
      player, gameTime, realGameTime, enemies, projectiles,
      showShopMenu, showUpgradeMenu,
      shopReopenAt
    } = get();
    // 帰還サークル内では攻撃停止(置き攻撃の出入りハメ防止)。
    if (isInReturnCircle(player, get().returnCircle)) return { swung: false, hit: false, finish: false, killed: 0 };
    // スキル スラッシャー: タイミングリングが生きている間は、タップを追撃判定へ回す(CD有無に関わらず優先)。
    // ジャストで追撃→次のリング、外す/3連終了でコンボ終了。寿命を過ぎたリングは無視して通常スイングへ。
    if (
      hasSkill(player, 'slasher') && player.slasherRingStartAt > 0 &&
      realGameTime <= player.slasherRingStartAt + SLASHER_RING_MS + SLASHER_JUST_MS
    ) {
      return applySlasherTimedStrike(get, player, gameTime, realGameTime);
    }
    // Respect cooldown — no swing, no knockback, no window.
    if (now < player.counterCooldownEnd) {
      return { swung: false, hit: false, finish: false, killed: 0 };
    }

    // スキル: カウンターマスター = カウンター窓延長(Lv1 +120ms / Lv2 +180ms / Lv3 +250ms)。
    const cmLv = skillLevel(player, 'counter-master');
    const counterWindowMs = COUNTER_WINDOW + (cmLv ? [0, 120, 180, 250][cmLv] : 0);

    // 近接スイングの揺れは「通常ヒット時のみ」(空振りは揺らさない/フィニッシュ・カウンターは
    // それぞれのインパクト演出に任せる)。判定が出揃う関数末尾で発火する(社長指示)。

    const melee = player.weapons.find(w => w.isMelee);
    const gun = getActiveGun(player); // finisher refunds into the active gun
    const meleeDamage = (melee?.damage ?? 6) * strikerMeleeMult(player) * (player.equipBonus?.damageMult ?? 1); // キャラ固有: ストライカー弾切れ時×1.5 / 装備ダメージ倍率
    const pcx = player.x + player.width / 2;
    const pcy = player.y + player.height / 2;
    const meleeRange = huntingMeleeRadius(player);
    // 近接の壁越し不可(視線判定)。屋内=lab壁(閉ドア含む) / 屋外=近傍の木。分身の攻撃と共用。
    const meleeWalls: Rect[] = meleeWallsAround(get, pcx, pcy, meleeRange);

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

    // センサー地雷(sensor-mine): 近接攻撃(このスイング)と同じ入力で足元に1個設置
    // (§6.13 M36: グローバルCDではなくチャージ制。チャージ数=同時設置上限Lv1=3/Lv2=4/Lv3=5と同じ。
    // 設置=準備完了チャージを1消費、消費分は設置から10秒後に個別再準備。setSubWeaponCooldownを通らないため
    // タイムキーパー/オーバークロック/M35計測(recordSubUse・成立時recordOverclockProc)は援護射撃と同じ流儀で手動維持)。
    // 盤面上限=N(既存)。チャージがあっても盤面がN個埋まっていれば最古を置換(判定=純関数 placeSensorMine)。
    // 感知/起爆/爆発は useGameLoop 側。スロー演出は出さない(CLAUDE.md)。
    if (
      player.subWeapons.includes('sensor-mine') &&
      !subWeaponBlockedByKatana(player, 'sensor-mine')
    ) {
      const smLevel = Math.max(1, Math.min(3, player.subWeaponLevels['sensor-mine'] ?? 1));
      const smCap = SENSOR_MINE_CAP_BY_LEVEL[smLevel];
      if (sensorMineChargesReady(get().sensorMineCharges, gameTime, smCap) > 0) {
        const smFootX = player.x + player.width / 2;
        const smFootY = player.y + player.height;
        const smOverclock = Math.random() < skillOverclockChance(player); // §6.8 M31と同じ抽選=発動(設置)時
        const smDuration = smOverclock ? 0 : SENSOR_MINE_CHARGE_COOLDOWN_MS * skillCooldownMult(player); // タイムキーパー
        set(state => ({
          sensorMines: placeSensorMine(
            state.sensorMines,
            { id: `smine-${sensorMineSeq++}`, x: smFootX, y: smFootY, placedAt: gameTime, triggeredAt: 0 },
            smCap
          ),
          sensorMineCharges: consumeSensorMineCharge(state.sensorMineCharges, gameTime, smCap, smDuration) ?? state.sensorMineCharges,
        }));
        get().spawnRing(smFootX, smFootY, 4, 20, 'rgba(148,163,184,0.6)', 2, 200); // 設置の小リング(軽量)
        recordSubUse('sensor-mine'); // M35計測: setSubWeaponCooldown経由をやめたため手動合流点
        if (smOverclock) recordOverclockProc(); // §6.13: 成立=そのチャージを即再準備(smDuration=0で表現済み)
      }
    }

    // フレアガン(flare-gun): 近接攻撃時に進行方向(プレイヤーの向き)へ発射(CD=Lv1:5秒/Lv2:4秒/Lv3:3秒・
    // CD中のスイングでは出ない)。ダメージ無し。ハンドガン距離(RANGE_BY_CATEGORY.handgun)の地点に着弾し、
    // 着弾点が3秒間、召喚と同じ範囲(ALCHEMY_AGGRO_RANGE)の敵を引き付ける(疑似召喚として
    // resolveEnemyTarget へ合流=召喚と完全に同じ効き方。PACING_PUZZLE.md §6.6 M29)。スロー無し。
    if (
      player.subWeapons.includes('flare-gun') &&
      !subWeaponBlockedByKatana(player, 'flare-gun') &&
      gameTime >= (player.subWeaponCooldowns['flare-gun'] ?? 0)
    ) {
      const fgLevel = Math.max(1, Math.min(3, player.subWeaponLevels['flare-gun'] ?? 1));
      const fgDir = player.lastDirection ?? { x: 1, y: 0 };
      const fgMag = Math.max(0.001, Math.hypot(fgDir.x, fgDir.y));
      const fgDist = RANGE_BY_CATEGORY.handgun; // 「ハンドガン距離」=既存のハンドガン射程定数(§6.6 実装指定)
      const fgX = pcx + (fgDir.x / fgMag) * fgDist;
      const fgY = pcy + (fgDir.y / fgMag) * fgDist;
      set(state => ({
        flareGunFlares: [...state.flareGunFlares, {
          id: `flare-${flareGunSeq++}`,
          fromX: pcx, fromY: pcy,
          x: fgX, y: fgY,
          firedAt: gameTime,
          landAt: gameTime + FLARE_GUN_FLIGHT_MS,
          until: gameTime + FLARE_GUN_FLIGHT_MS + FLARE_GUN_DURATION_MS,
        }],
      }));
      get().setSubWeaponCooldown('flare-gun', gameTime + FLARE_GUN_CD_MS_BY_LEVEL[fgLevel]);
    }

    // ジャンクウェポン(junk-weapon): 近接攻撃と同時にスイング方向へ散弾5発(ショットガンT1相当・CDなし。
    // PACING_PUZZLE.md §6.7 M30)。弾薬=スクラップ(1消費=3ダメージ・1発あたりLv1=1/Lv2=2/Lv3=3)。
    // 社長裁定v0.25.1693: スクラップ≥1なら常にフル5発発射・消費=min(フルコスト,所持全部)・ダメージはLv固定・
    // 0のみ不発。ショットガン弾薬は消費しない。判定=純関数 computeJunkShot(src/utils/junkWeapon.ts)。スロー無し。
    if (
      player.subWeapons.includes('junk-weapon') &&
      !subWeaponBlockedByKatana(player, 'junk-weapon')
    ) {
      const jwLevel = Math.max(1, Math.min(3, player.subWeaponLevels['junk-weapon'] ?? 1));
      const jwShot = computeJunkShot(jwLevel, player.straps);
      if (jwShot.fire) {
        recordSubUse('junk-weapon'); // M35: CD無しサブの発動計測(手動合流点・挙動不変)
        const jwDir = player.lastDirection ?? { x: 1, y: 0 };
        const jwMag = Math.max(0.001, Math.hypot(jwDir.x, jwDir.y));
        const pellets = buildJunkWeaponPellets(
          pcx, pcy,
          { x: jwDir.x / jwMag, y: jwDir.y / jwMag },
          jwShot.pelletDamage,
          JUNK_WEAPON_PELLETS
        );
        for (const p of pellets) get().addProjectile(p);
        set(state => ({
          player: { ...state.player, straps: Math.max(0, state.player.straps - jwShot.cost) },
          gameStats: { ...state.gameStats, strapsSpent: state.gameStats.strapsSpent + jwShot.cost }, // 消費計上=ショップ購入と同じ経路
          junkShotFxAt: Date.now(), // 発砲SE(shotgun-fire)のトリガ(useGameLoopが再生)
        }));
      }
    }

    // ワイヤーアンカーはフリック発動に変更(triggerWireAnchor)。スイング(指離し)では発動しない。

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

    // 武器商人への話しかけは「サークルに3秒滞在」(updateMerchantDwell)へ変更(社長指示v0.25.1842)。
    // 旧・商人付近の近接スイングで開く方式は撤去(誤オープン=v0.25.1732系の事故も構造的に消える)。

    // 武器庫(制圧拠点中央の小サークル)で指を離す = 遠隔で武器商人を利用(社長指示)。矢印は出さない。
    // 紅き夜中は開かない(拠点近接の「やり過ごし」が別途処理)。
    if (!showShopMenu && !showUpgradeMenu && gameTime >= shopReopenAt && get().redNight?.phase !== 'active') {
      for (const b of get().baseSites) {
        if (b.status !== 'captured') continue;
        const adx = b.x - pcx, ady = b.y - pcy;
        if (adx * adx + ady * ady > ARMORY_RADIUS * ARMORY_RADIUS) continue;
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
          },
        });
        get().spawnRing(b.x, b.y - 26, 12, 58, 'rgba(251,191,36,0.88)', 3, SHOP_INTERACT_RING_MS);
        get().spawnGlow(b.x, b.y - 28, 62, 'rgba(251,191,36,', SHOP_INTERACT_RING_MS);
        get().spawnCallout(b.x, b.y - 70, 'SHOP', '#fde68a');
        return { swung: true, hit: true, finish: false, killed: 0 };
      }
    }

    // 二人組(クエストNPC)の会話ポップアップは廃止(社長指示v0.25.1681)。受領は「会話サークル内に
    // 3秒滞在」(useGameLoopのdwell判定→acceptEventQuest)へ移行=performAttack(指離し)では何もしない。

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
    const bossFullStunHits: { x: number; y: number }[] = []; // GAME_AUDIT #17: 近接クリで完全気絶が発動した位置(紫FX用)
    const critStunAt: { x: number; y: number }[] = []; // 社長指示: 近接クリでも銃/刀と同じくスタン(黄色リング)を掛ける
    const slashAt: { x: number; y: number }[] = [];
    const meleeHitEnemyIds: string[] = []; // スキル 救難信号: このスイングでヒットした敵ID(発動判定/対象選定用)
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
      .flatMap(p => {
        // バッシュ方向 = プレイヤーの向き(lastDirection=指を離した瞬間のスティック方向)へそのまま飛ばす(社長指示A)。
        // 盾の位置/法線ではクランプしない。以前は「盾の外向き法線の前方180°」でクランプしていたが、盾は
        // 「移動方向の逆」へ自動設置される=法線はプレイヤーの背後向き。facing は移動方向(前方)なので facing は
        // ほぼ常に法線の裏側になり、毎回クランプされて“位置なりの向き(法線)”に飛ぶ不具合だった(社長報告)。
        // lastDirection が無い/ゼロのとき(=一度も動いていない)だけ、盾の外向き法線へフォールバック。
        let dux: number, duy: number;
        const ld = player.lastDirection;
        const fm = ld ? Math.hypot(ld.x, ld.y) : 0;
        if (ld && fm > 0.01) {
          dux = ld.x / fm; duy = ld.y / fm;
        } else {
          const nm = Math.hypot(p.direction.x, p.direction.y) || 1;
          dux = p.direction.x / nm; duy = p.direction.y / nm;
        }
        const scx = p.x + p.width / 2, scy = p.y + p.height / 2;
        // 「バッシュで自分とぶつかると動かない」(社長指示): バッシュ方向が盾をプレイヤー側へ押し込む向き
        // (盾→プレイヤー と同じ側=内積>0)なら、盾を自分に押し付ける形になるのでバッシュを発動しない。
        if (dux * (pcx - scx) + duy * (pcy - scy) > 0) return [];
        const ex = p.x + dux * SHIELD_BASH_SHOVE_DISTANCE;
        const ey = p.y + duy * SHIELD_BASH_SHOVE_DISTANCE;
        // 始点〜終点の壁を覆う掃過AABB(敵の被弾判定用)。
        const swept = {
          x: Math.min(p.x, ex),
          y: Math.min(p.y, ey),
          width: Math.abs(ex - p.x) + p.width,
          height: Math.abs(ey - p.y) + p.height,
        };
        return [{ id: p.id, fromX: p.x, fromY: p.y, x: ex, y: ey, dux, duy, swept, cx: scx, cy: scy }];
      });
    const hasShieldShove = shieldShoves.length > 0;
    let bashHitEnemy = false; // バッシュが敵に当たったか(ストップ用)

    for (const enemy of enemies) {
      if (enemy.type === 'reaper' && !enemy.reaperChaser) { survivors.push(enemy); continue; } // 深奥チェイサーは近接対象(ボス級)
      const ecx = enemy.x + enemy.width / 2;
      const ecy = enemy.y + enemy.height / 2;
      // ノックバック方向用の中心差分(距離は enemyMeleeDist を使うが、向きは中心→敵で算出)。
      const dx = ecx - pcx;
      const dy = ecy - pcy;
      // 距離は裏ボスのみ帯(AABB)の最近点基準、他は中心基準(enemyMeleeDist)。slash演出/壁判定は中心を使う。
      const dist = enemyMeleeDist(pcx, pcy, enemy);
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
        meleeHitEnemyIds.push(enemy.id);
        const dmg = meleeDamage * SHIELD_BASH_DAMAGE_MULT;
        meleeDamageNumbers.push({ x: ecx, y: enemy.y, value: dmg, crit: true });
        // §5.21-追補4: シールドバッシュはフィニッシュではない。finishKillOnly個体はHP1で踏みとどまる。
        const newHealth = clampFinishKillOnlyHealth(enemy.finishKillOnly, Math.max(0, enemy.health - dmg), false);
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
      meleeHitEnemyIds.push(enemy.id);
      const stunned = enemy.stunUntil !== undefined && gameTime < enemy.stunUntil;
      if (stunned) {
        if (isBossType(enemy.type)) {
          // Bosses can't be instakilled. A melee hit on a stunned boss deals
          // 5× melee damage. 通常の気絶は1発で解除するが、裏ボスの「完全気絶(紫)」中は
          // 解除せずタイマー切れまで5×近接を“し放題”(社長指示)。
          const bossFull = enemy.bossFullStunUntil !== undefined && gameTime < enemy.bossFullStunUntil;
          bossFinishHit = true;
          const dmg = meleeDamage * BOSS_MELEE_STUN_MULT;
          meleeDamageNumbers.push({ x: ecx, y: enemy.y, value: dmg, crit: true });
          // §5.21-追補4: スタン中ボスへの5×近接はボスにとっての「フィニッシュ」経路そのもの
          // (finisher:trueの即時処刑に相当)なのでfinishKillOnlyでも clamp しない=通常どおり倒しきれる。
          const newHealth = Math.max(0, enemy.health - dmg);
          if (newHealth <= 0) {
            killed.push({ enemy, finisher: false });
          } else {
            survivors.push({
              ...enemy,
              health: newHealth,
              stunUntil: bossFull ? enemy.stunUntil : undefined,
              lastHit: now,
              liftUntil: now + 420,
            });
          }
          continue;
        }
        // §6.22 M47仕様①: 強個体(pumpkin/lab-zombie-3/isNamed/questTarget)はHP50%以上だと
        // 即死せず近接ダメージ×3+気絶解除(ボス5×と同じフィニッシュ経路扱い)。雑魚は無条件即死。
        if (stunnedMeleeOutcome(enemy) === 'heavy') {
          bossFinishHit = true;
          const dmg = meleeDamage * ELITE_MELEE_STUN_MULT;
          meleeDamageNumbers.push({ x: ecx, y: enemy.y, value: dmg, crit: true });
          const newHealth = Math.max(0, enemy.health - dmg);
          if (newHealth <= 0) {
            killed.push({ enemy, finisher: false });
          } else {
            survivors.push({ ...enemy, health: newHealth, stunUntil: undefined, lastHit: now, liftUntil: now + 420 });
          }
          continue;
        }
        killed.push({ enemy, finisher: true }); // normal instant execute
        recordFinisherKill(); // §6.21 M46: 気絶中の敵への近接即死
        continue;
      }
      // Melee weapons carry a fixed crit chance (varies by weapon). A crit
      // multiplies the swing's damage and pops a gold number.
      const trapCritBonus = enemy.rootUntil !== undefined && gameTime < enemy.rootUntil
        ? TRAP_ROOT_CRIT_BONUS
        : 0;
      // PACING_PUZZLE.md §5.6 M7: チャフ(スケルトン)の武器弱点=近接+10%。
      const weakCritBonus = WEAKCRIT_ENABLED ? weaknessCritBonus(enemy.type, 'melee') : 0;
      const crit = Math.random() < applyEnemyCritPenalty(Math.min(1, meleeCritChance + player.critChance + trapCritBonus + weakCritBonus + skillBenkeiCritBonus(player, gameTime) + skillWarmUpCritBonus(player, gameTime) + skillKnifeMasterMeleeCrit(player)), enemy);
      const dmg = meleeDamage * (crit ? skillCritMult(player, CRIT_DAMAGE_MULT) : 1) * skillOutgoingDamageMult(player) * meleeComboMult;
      meleeDamageNumbers.push({ x: ecx, y: enemy.y, value: dmg, crit });
      // §5.21-追補4: 非スタン(=非フィニッシュ)の通常近接チップダメージ。finishKillOnly個体はHP1で踏みとどまる。
      const newHealth = clampFinishKillOnlyHealth(enemy.finishKillOnly, Math.max(0, enemy.health - dmg), false);
      if (newHealth <= 0) {
        killed.push({ enemy, finisher: false });
        continue;
      }
      // GAME_AUDIT #17(社長承認): プレイヤーが直接出したクリはすべて裏ボスの完全気絶カウントに
      // 乗せる(銃と同じbumpBossCrit=挙動統一)。裏ボス以外はnullで素通り。
      const bossBump = crit ? bumpBossCrit(enemy, gameTime) : null;
      if (bossBump?.triggered) bossFullStunHits.push({ x: ecx, y: ecy });
      // 社長指示: 近接クリでも銃・刀と同じくスタンさせる(倒せなかった時のみ=フィニッシュ受付の入口)。
      // 気絶時間アップ(パッシブ)も銃と同じくstunDurationMultを掛ける。
      if (crit) critStunAt.push({ x: ecx, y: ecy });
      const stunUntil = crit
        ? gameTime + STUN_DURATION_MS * (player.stunDurationMult ?? 1)
        : enemy.stunUntil;
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
          stunUntil,
          knockbackVx: (dx / norm) * speed,
          knockbackVy: (dy / norm) * speed,
          knockbackUntil: now + KNOCKBACK_DURATION,
          knockbackImmuneUntil: now + KNOCKBACK_IMMUNE_MS,
          ...(bossBump?.patch ?? {}), // GAME_AUDIT #17: 完全気絶カウント/発動を反映(最後に展開して優先)
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
          stunUntil,
          knockbackVx: 0,
          knockbackVy: 0,
          knockbackUntil: now + 100,
          ...(bossBump?.patch ?? {}), // GAME_AUDIT #17
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
    // §6.21 M46: 近接カウンター振り(通常ナイフ)の計測。channel='melee'。1振り=1回(hitCount=命中数)。
    const meleeSwingDamage = meleeDamageNumbers.reduce((sum, n) => sum + n.value, 0);
    recordDamageDealt('melee', meleeSwingDamage);
    recordMeleeSwing(slashAt.length);
    set(state => ({
      // このスイングで近接ダメージを受けた敵(lastHit===now)に meleeAggro を付与(救助で以後プレイヤー狙い)。
      // §5.21-追補8: 同じ判定(このスイングで近接ダメージを受けた=lastHit===now)でミゲル(ゲート2ボス)
      // 専用の meleeHitAt もスタンプ(gun/爆発は damageEnemy 側の別経路なので対象外)。ミゲル以外は
      // 無害な余剰フィールド(useGameLoop のミゲル専用コントローラだけが参照)。
      enemies: survivors.map(e => e.lastHit === now ? { ...e, meleeAggro: true, meleeHitAt: gameTime } : e),
      gameStats: {
        ...state.gameStats,
        enemiesKilled: state.gameStats.enemiesKilled + killed.length,
        meleeFinishers: state.gameStats.meleeFinishers + killed.reduce((n, k) => n + (k.finisher ? 1 : 0), 0),
        eliteKills: state.gameStats.eliteKills + killed.reduce((n, k) => n + (isScoreElite(k.enemy.type) ? 1 : 0), 0),
        bossKills: state.gameStats.bossKills + killed.reduce((n, k) => n + (isScoreBoss(k.enemy.type) ? 1 : 0), 0),
        damageDealt: state.gameStats.damageDealt + meleeSwingDamage,
        maxCombo: comboFinishCount > 0
          ? Math.max(
              state.gameStats.maxCombo,
              state.meleeFinishComboUntil >= gameTime
                ? state.meleeFinishComboCount + comboFinishCount
                : comboFinishCount
            )
          : state.gameStats.maxCombo
      },
      finaleDefeated: state.finaleDefeated || bossKilled,
      meleeFinishComboCount: comboFinishCount > 0
        ? (state.meleeFinishComboUntil >= gameTime ? state.meleeFinishComboCount + comboFinishCount : comboFinishCount)
        : state.meleeFinishComboCount,
      meleeFinishComboUntil: comboFinishCount > 0
        ? gameTime + finishWindowMs
        : state.meleeFinishComboUntil,
      // フィニッシュで全停止ヒットストップ。スラッシャーリング始動時は新規追加を省くだけでなく、
      // 他の攻撃(ドローン/刀/鞭フィニッシュ等)が残した既存ヒットストップも解除する。
      // 既存ヒットストップが生きていると gameTime が凍結されたままリングが始動し、
      // ① 1発目サークルが動かない ② Hitstop 中タップで elapsed=0→JUST 窓外→コンボ消滅 の2バグを招く。
      hitstopUntil: hasSkill(state.player, 'slasher') && slashAt.length > 0
        ? 0  // スラッシャーリング始動: 既存ヒットストップも即解除してリングをすぐ動かす
        : finisherHit
          ? now + HITSTOP_MS
          : state.hitstopUntil,
      player: {
        ...state.player,
        meleeSwingAt: now, // 近接スイング演出の起点(描画のみ)。この set はスイング確定時のみ走る。
        counterWindowEnd: now + counterWindowMs,
        counterCooldownEnd: now + counterWindowMs + COUNTER_COOLDOWN,
        huntingCharged: false,
        huntingChargeStartedAt: 0,
        knifeComboCount: knifeCombo.count,
        knifeComboUntil: knifeCombo.until,
        // スキル スラッシャー: この近接が命中(slashAt有)したらタイミングリングを開始(step=0)。
        // 命中しなければ非アクティブ(リング無し)。以後の追撃はタップのジャスト判定で出す。
        slasherRingStartAt: hasSkill(state.player, 'slasher') && slashAt.length > 0 ? state.realGameTime : 0,
        slasherStrikeStep: 0,
        // 追撃用に「初撃時点の射程」を記録(state.player は更新前=huntingCharged がまだ true なので溜め延長を含む)。
        slasherReach: hasSkill(state.player, 'slasher') && slashAt.length > 0 ? huntingMeleeRadius(state.player) : 0,
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
                shieldHitAt: now, // バッシュでも被弾シェイク/フラッシュを出す(描画側 drawShield 用・監査対応)
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
      get().spawnMeleeBlood(s.x, s.y); // 近接の血飛沫(社長指摘v0.25.2060: メイン近接3経路に未配線だった)
    }

    // Damage numbers for every non-execute melee hit; crits/boss-stun hits pop gold.
    for (const c of meleeDamageNumbers) {
      get().spawnDamageNumber(c.x, c.y, c.value, c.crit);
    }
    // クリでスタンさせた敵に黄色いリング(銃クリと同じフィードバック。社長指示で近接にも追加)。
    for (const c of critStunAt) {
      get().spawnRing(c.x, c.y, 6, 30, 'rgba(250, 204, 21, 0.9)', 2, 260);
    }
    // GAME_AUDIT #17: 近接クリで完全気絶が発動したら銃経路と同じ紫FX+STUN!コールアウト。
    for (const p of bossFullStunHits) {
      get().spawnRing(p.x, p.y, 12, 210, 'rgba(168,85,247,0.85)', 5, 520);
      get().spawnRing(p.x, p.y, 6, 130, 'rgba(216,180,254,0.9)', 3, 360);
      get().spawnGlow(p.x, p.y, 130, 'rgba(168,85,247,', 620);
      get().spawnCallout(p.x, p.y - 24, 'STUN!', '#d8b4fe', { bg: 0x6b21a8 });
    }

    // Per-kill rewards. Finishers grant bonus XP + gold VFX. EVERY melee kill
    // also DROPS an ammo box for the active gun's family — melee is the run's
    // main way to scavenge rounds, but you have to walk over the drop.
    grantMeleeKillRewards(get, killed, player, gun);
    if (finisherHit || bossFinishHit) {
      const [ztx, zty] = finishZoomTargetOf(killed);
      // M21(§5.22): フル演出(CD明け)の時だけ武器固有の黄フラッシュを重ねる。CD内は
      // triggerFinishImpact自身が出す最低保証フラッシュ(軽い白)だけになる=二重フラッシュを避ける。
      const fullCinematic = get().triggerFinishImpact(ztx, zty);
      if (fullCinematic && killed.some(k => k.finisher)) {
        get().spawnFlash('rgba(253, 224, 71, 0.28)', 200);
      }
    } else if (slashAt.length > 0) {
      // 通常ヒット(空振りでもフィニッシュでもない)のときだけスイングの揺れを出す。
      // §5.23 M22 C1: 方向=プレイヤー→命中した敵たちの重心(複数ヒット時は平均)。
      let hitCx = 0, hitCy = 0;
      for (const s of slashAt) { hitCx += s.x; hitCy += s.y; }
      hitCx /= slashAt.length; hitCy /= slashAt.length;
      get().triggerShake(MELEE_SWING_SHAKE_MS, MELEE_SWING_SHAKE_MAG, hitCx - pcx, hitCy - pcy);
    }

    // スキル: リーパー(フィニッシュ波及=スイング範囲内の敵を全員フィニッシュ)/ カウンターマスター(成立時ノックバック)。
    applyMeleeFinishSkillSpread(get, player, killed.some(k => k.finisher), pcx, pcy, meleeRange, meleeDamage);
    // スキル: 救難信号(近接ヒット時、一定確率で味方が援護攻撃=必中・倍率1)。
    applyRescueSignalProc(get, player, meleeDamage, meleeHitEnemyIds, pcx, pcy);
    get().registerMultiHit(slashAt.length); // キャラ固有 ヘビーガンナー: 近接が2体以上に当たれば爆発範囲バフ
    if (hasSkill(player, 'counter-master') && slashAt.length > 0) {
      counterMasterKnockback(get, pcx, pcy, counterMasterKbScale(player));
    }
    // スキル スラッシャーのリング開始はこの近接スイングの set()(player.slasherRingStartAt)で行う。
    // 追撃自体は「リングのジャスト窓でのタップ」で applySlasherTimedStrike が出す(自動ではない)。

    // 松明・卵などの小物破壊(共通ヘルパ。半径=メレー範囲の円)。
    const propHit = get().breakPropsAlong(pcx, pcy, 1, 0, 0, meleeRange, meleeDamage * 2.5);

    // 分身(サブウェポン): READY(分身なし＆CD明け)で近接攻撃すると、攻撃位置に分身を1体生成(固定)。
    // 以後は分身が自律的に1秒ごと×5秒の近接攻撃を繰り返す(tickShadowClone)。ここに到達するのは通常
    // ナイフのスイングのみ(刀/鞭モードは手前で return 済み)。生成中(ACTIVE)の再スイングは何もしない。
    if (
      get().player.subWeapons.includes('shadow-clone') &&
      !get().shadowClone &&
      gameTime >= (get().player.subWeaponCooldowns['shadow-clone'] ?? 0)
    ) {
      const facingLeft = player.direction === 'left' || (player.lastDirection != null && player.lastDirection.x < 0);
      set({
        shadowClone: {
          x: player.x, y: player.y, width: player.width, height: player.height,
          facingLeft, characterClass: player.characterClass,
          spawnedAt: gameTime, attacksDone: 0, nextAttackAt: gameTime, // 生成直後の tick で1発目
        },
      });
      get().spawnRing(pcx, pcy, 6, 44, 'rgba(203,213,225,0.6)', 3, 240); // 生成の控えめな白リング
    }

    return {
      swung: true,
      hit: slashAt.length > 0 || propHit || trapShoves.length > 0 || hasShieldShove,
      finish: finisherHit || bossFinishHit,
      killed: killed.length
    };
  },

  // 分身がその場(clone位置)で同方向に近接攻撃。攻撃範囲/当たり判定/ダメージ/クリティカルは
  // プレイヤーの近接スイングと同じ計算(専用倍率なし)。分身からの攻撃は再生成判定を持たない。
  shadowCloneStrike: (clone) => {
    const now = Date.now();
    const { player, gameTime, enemies } = get();
    const melee = player.weapons.find(w => w.isMelee);
    const gun = getActiveGun(player);
    const meleeDamage = (melee?.damage ?? 6) * strikerMeleeMult(player) * (player.equipBonus?.damageMult ?? 1);
    const meleeCritChance = melee?.critChance ?? 0;
    const meleeComboMult = skillMeleeComboMult(player, gameTime, get().meleeFinishComboCount, get().meleeFinishComboUntil);
    const meleeRange = huntingMeleeRadius(player);
    const ccx = clone.x + clone.width / 2;
    const ccy = clone.y + clone.height / 2;
    const walls = meleeWallsAround(get, ccx, ccy, meleeRange);

    const killed: { enemy: Enemy; finisher: boolean }[] = [];
    const survivors: Enemy[] = [];
    const damageNumbers: { x: number; y: number; value: number; crit: boolean }[] = [];
    const critStunAt: { x: number; y: number }[] = []; // 社長指示: 近接クリでも銃/刀と同じくスタン(黄色リング)を掛ける
    const slashAt: { x: number; y: number }[] = [];
    const cloneHitEnemyIds: string[] = []; // スキル 救難信号(§6.10 M33⑦): このストライクでヒットした敵ID
    let bossFinishHit = false;

    for (const enemy of enemies) {
      if (enemy.type === 'reaper' && !enemy.reaperChaser) { survivors.push(enemy); continue; }
      const ecx = enemy.x + enemy.width / 2;
      const ecy = enemy.y + enemy.height / 2;
      // ノックバック方向用の中心差分(分身中心→敵)。
      const dx = ecx - ccx;
      const dy = ecy - ccy;
      // 裏ボスのみ帯(AABB)の最近点基準で距離を測る(中心まで寄らず縁で当たる)。
      const dist = enemyMeleeDist(ccx, ccy, enemy);
      if (dist > meleeRange) { survivors.push(enemy); continue; }
      if (walls.length > 0 && segmentBlocked(ccx, ccy, ecx, ecy, walls)) { survivors.push(enemy); continue; }
      slashAt.push({ x: ecx, y: ecy });
      cloneHitEnemyIds.push(enemy.id); // スキル 救難信号(§6.10 M33⑦): 分身のヒット敵ID(発動判定/対象選定用)
      const stunned = enemy.stunUntil !== undefined && gameTime < enemy.stunUntil;
      if (stunned) {
        if (isBossType(enemy.type)) {
          bossFinishHit = true;
          const dmg = meleeDamage * BOSS_MELEE_STUN_MULT;
          damageNumbers.push({ x: ecx, y: enemy.y, value: dmg, crit: true });
          // §5.21-追補4: スタン中ボスへの5×近接=ボスのフィニッシュ経路そのものなのでclampしない。
          const nh = Math.max(0, enemy.health - dmg);
          if (nh <= 0) killed.push({ enemy, finisher: false });
          else survivors.push({ ...enemy, health: nh, stunUntil: undefined, lastHit: now, liftUntil: now + 420 });
          continue;
        }
        // §6.22 M47仕様①: 分身にもナイフと同じ強個体しきい値を適用(分身だけエリート消し可、を残さない)。
        if (stunnedMeleeOutcome(enemy) === 'heavy') {
          bossFinishHit = true;
          const dmg = meleeDamage * ELITE_MELEE_STUN_MULT;
          damageNumbers.push({ x: ecx, y: enemy.y, value: dmg, crit: true });
          const nh = Math.max(0, enemy.health - dmg);
          if (nh <= 0) killed.push({ enemy, finisher: false });
          else survivors.push({ ...enemy, health: nh, stunUntil: undefined, lastHit: now, liftUntil: now + 420 });
          continue;
        }
        killed.push({ enemy, finisher: true });
        continue;
      }
      const trapCritBonus = enemy.rootUntil !== undefined && gameTime < enemy.rootUntil ? TRAP_ROOT_CRIT_BONUS : 0;
      // PACING_PUZZLE.md §5.6 M7: チャフ(スケルトン)の武器弱点=近接+10%。
      const weakCritBonus = WEAKCRIT_ENABLED ? weaknessCritBonus(enemy.type, 'melee') : 0;
      const crit = Math.random() < applyEnemyCritPenalty(Math.min(1, meleeCritChance + player.critChance + trapCritBonus + weakCritBonus + skillBenkeiCritBonus(player, gameTime) + skillWarmUpCritBonus(player, gameTime) + skillKnifeMasterMeleeCrit(player)), enemy);
      const dmg = meleeDamage * (crit ? skillCritMult(player, CRIT_DAMAGE_MULT) : 1) * skillOutgoingDamageMult(player) * meleeComboMult;
      damageNumbers.push({ x: ecx, y: enemy.y, value: dmg, crit });
      // §5.21-追補4: 非スタンの通常近接チップ(分身の自動攻撃)。finishKillOnly個体はHP1で踏みとどまる。
      const nh = clampFinishKillOnlyHealth(enemy.finishKillOnly, Math.max(0, enemy.health - dmg), false);
      if (nh <= 0) { killed.push({ enemy, finisher: false }); continue; }
      if (crit) critStunAt.push({ x: ecx, y: ecy });
      const stunUntil = crit ? gameTime + STUN_DURATION_MS * (player.stunDurationMult ?? 1) : enemy.stunUntil;
      if (now >= (enemy.knockbackImmuneUntil ?? 0)) {
        const norm = Math.max(0.001, dist);
        const falloff = 1 - dist / meleeRange;
        const speed = KNOCKBACK_SPEED * (0.5 + falloff * 0.5);
        survivors.push({
          ...enemy, health: nh, lastHit: now, stunUntil,
          knockbackVx: (dx / norm) * speed, knockbackVy: (dy / norm) * speed,
          knockbackUntil: now + KNOCKBACK_DURATION, knockbackImmuneUntil: now + KNOCKBACK_IMMUNE_MS,
        });
      } else {
        survivors.push({ ...enemy, health: nh, lastHit: now, stunUntil, knockbackVx: 0, knockbackVy: 0, knockbackUntil: now + 100 });
      }
    }

    const finisherHit = killed.some(k => k.finisher);
    // スキル: ナイフマスターのコンボ加算(§6.10 M33⑧: 分身のヒットでも貯める。倍率は既に乗っている)。
    const cloneKnifeCombo = computeKnifeCombo(player, gameTime, slashAt.length > 0);
    // §6.21 M46: 分身(サブウェポン)によるダメージ計測。channel='other'(プレイヤー自身の近接カウンター
    // 振りではなくサブウェポンの自律攻撃のため。finisher即死もrecordFinisherKillの対象外=★未決事項参照)。
    const cloneStrikeDamage = damageNumbers.reduce((sum, n) => sum + n.value, 0);
    recordDamageDealt('other', cloneStrikeDamage);
    set(state => ({
      // §5.21-追補8: 同じ判定(このスイングで近接ダメージを受けた=lastHit===now)でミゲル(ゲート2ボス)
      // 専用の meleeHitAt もスタンプ(gun/爆発は damageEnemy 側の別経路なので対象外)。ミゲル以外は
      // 無害な余剰フィールド(useGameLoop のミゲル専用コントローラだけが参照)。
      enemies: survivors.map(e => e.lastHit === now ? { ...e, meleeAggro: true, meleeHitAt: gameTime } : e),
      gameStats: {
        ...state.gameStats,
        enemiesKilled: state.gameStats.enemiesKilled + killed.length,
        meleeFinishers: state.gameStats.meleeFinishers + killed.reduce((n, k) => n + (k.finisher ? 1 : 0), 0),
        eliteKills: state.gameStats.eliteKills + killed.reduce((n, k) => n + (isScoreElite(k.enemy.type) ? 1 : 0), 0),
        bossKills: state.gameStats.bossKills + killed.reduce((n, k) => n + (isScoreBoss(k.enemy.type) ? 1 : 0), 0),
        damageDealt: state.gameStats.damageDealt + cloneStrikeDamage,
      },
      player: { ...state.player, knifeComboCount: cloneKnifeCombo.count, knifeComboUntil: cloneKnifeCombo.until },
      // hitstopはtriggerFinishImpact側でCD込みで一括管理(M21・§5.22)。ここでの個別設定は廃止。
    }));

    // 演出はプレイヤーの近接と同じ経路(スラッシュ/ダメージ数字/キル報酬)。分身位置にも一閃を出す。
    for (const s of slashAt) get().spawnSlash(s.x, s.y);
    for (const c of damageNumbers) get().spawnDamageNumber(c.x, c.y, c.value, c.crit);
    for (const c of critStunAt) get().spawnRing(c.x, c.y, 6, 30, 'rgba(250, 204, 21, 0.9)', 2, 260);
    grantMeleeKillRewards(get, killed, player, gun);
    get().spawnSlash(ccx, ccy, 'rgba(226,232,240,0.95)');
    get().spawnRing(ccx, ccy, 6, 40, 'rgba(203,213,225,0.7)', 3, 240);
    if (finisherHit || bossFinishHit) {
      const [ztx, zty] = finishZoomTargetOf(killed);
      get().triggerFinishImpact(ztx, zty);
    }
    // プレイヤーの装備スキル効果を分身の攻撃にも適用(リーパー波及/カウンターマスター/ヘビーガンナー)。
    applyMeleeFinishSkillSpread(get, player, finisherHit, ccx, ccy, meleeRange, meleeDamage);
    get().registerMultiHit(slashAt.length); // ヘビーガンナー: 2体以上ヒットで爆発範囲バフ
    if (hasSkill(player, 'counter-master') && slashAt.length > 0) counterMasterKnockback(get, ccx, ccy, counterMasterKbScale(player));
    // スキル: 救難信号(§6.10 M33⑦: 分身のヒットでも発動判定。基本近接/刀と同条件・索敵起点は分身中心)。
    applyRescueSignalProc(get, player, meleeDamage, cloneHitEnemyIds, ccx, ccy);
  },

  // 毎フレーム: 分身の自動近接(1秒ごと×最大5回)を進め、寿命(5秒)到達 or 回数上限で消滅。
  tickShadowClone: () => {
    const clone = get().shadowClone;
    if (!clone) return;
    const { gameTime } = get();
    if (clone.attacksDone >= SHADOW_CLONE_MAX_ATTACKS || gameTime >= clone.spawnedAt + SHADOW_CLONE_DURATION_MS) {
      get().expireShadowClone();
      return;
    }
    if (gameTime >= clone.nextAttackAt) {
      get().shadowCloneStrike(clone);
      set(state => state.shadowClone ? {
        shadowClone: {
          ...state.shadowClone,
          attacksDone: state.shadowClone.attacksDone + 1,
          nextAttackAt: state.shadowClone.nextAttackAt + SHADOW_CLONE_ATTACK_INTERVAL_MS,
          swingAt: Date.now(), // 斬撃モーション(本体と同じナイフ振り)の起点(描画のみ)
        },
      } : {});
    }
  },

  expireShadowClone: () => {
    if (!get().shadowClone) return;
    const level = Math.max(1, Math.min(3, get().player.subWeaponLevels['shadow-clone'] ?? 1));
    set({ shadowClone: null });
    get().setSubWeaponCooldown('shadow-clone', get().gameTime + SHADOW_CLONE_COOLDOWN_MS_BY_LEVEL[level]);
  },

  // 火炎瓶(molotov): 判定(いつ・何本)は useGameLoop が computeMolotovTick(純関数)で決め、
  // ここは結果を state へ書き込むだけ。
  setMolotovCycle: (cycle) => set({ molotovCycle: cycle }),

  // センサー地雷(sensor-mine): 感知/起爆判定は useGameLoop が tickSensorMines(純関数)で決め、
  // ここは結果を state へ書き込むだけ。
  setSensorMines: (mines) => set({ sensorMines: mines }),

  // 援護射撃(support-sniper): CD進行/発射判定は useGameLoop が computeSupportSniperTick(純関数)で
  // 決め、ここは結果を state へ書き込むだけ。
  setSupportSniperCd: (ms) => set({ supportSniperCdMs: ms }),
  setSupportSniperNpc: (npc) => set({ supportSniperNpc: npc }),

  // フレアガン(flare-gun): 寿命の回収は useGameLoop が pruneFlares(純関数)で決め、ここは反映のみ。
  setFlareGunFlares: (flares) => set({ flareGunFlares: [...flares] }),

  // 救急鞄(first-aid-kit): 判定(何を払い出すか/空になったか)は useGameLoop が
  // computeFirstAidKitTick / isFirstAidKitEmpty(純関数)で決め、ここは結果を state へ書き込むだけ。
  setFirstAidKitState: (state) => set({ firstAidKitState: state }),

  spawnGroundFire: (x, y) => {
    set(state => ({
      groundFires: [...state.groundFires, { id: `gfire-${groundFireSeq++}`, x, y, createdAt: state.gameTime }],
    }));
  },

  // ジブリルの紫の単発火を1つ設置(0.7秒予告→2秒有効)。判定/寿命/被弾処理は useGameLoop の tick が担う。
  spawnBossFire: (x, y, spawnAt, activateAt, expireAt) => {
    set(state => ({
      bossFires: [...state.bossFires, { id: `bfire-${bossFireSeq++}`, x, y, spawnAt, activateAt, expireAt }],
    }));
  },
  setBossFires: (fires) => set({ bossFires: fires }),

  // 毎フレーム: 寿命切れ(3秒)の火を回収し、生存中の火に重なっている敵へ0.5秒スロットルでDoT(5dmg)を与える。
  // プレイヤーは対象外(自分の火なので無敵=そもそも判定しない)。既存の damageEnemy を再利用するので
  // キル報酬/演出/統計は他の攻撃経路と同じに揃う(スロー演出は damageEnemy 側に無いのでここでも発生しない)。
  tickGroundFires: () => {
    const { groundFires, gameTime, enemies } = get();
    if (groundFires.length === 0) return;
    const aliveFires = groundFires.filter(f => gameTime < f.createdAt + MOLOTOV_FIRE_LIFETIME_MS);
    const hits: { id: string; x: number; y: number }[] = [];
    // スキル: エクスプローダー(§6.10 M33④) = molotovの火も「全ての爆発」扱いで半径・ダメージ ×倍率。
    // スキル: バーサーカー等(§6.10 M33②) = skillOutgoingDamageMult をDoTダメージに乗算(四捨五入)。
    const gfExMult = skillExplosionMult(get().player);
    const gfDotDmg = Math.max(1, Math.round(MOLOTOV_DOT_DAMAGE * gfExMult * skillOutgoingDamageMult(get().player)));
    if (aliveFires.length > 0) {
      for (const e of enemies) {
        if (gameTime - (e.lastFireHitAt ?? -Infinity) < MOLOTOV_DOT_INTERVAL_MS) continue;
        const ecx = e.x + e.width / 2;
        const ecy = e.y + e.height / 2;
        if (isEnemyInGroundFire(ecx, ecy, aliveFires, MOLOTOV_FIRE_RADIUS * gfExMult)) hits.push({ id: e.id, x: ecx, y: ecy });
      }
    }
    if (aliveFires.length !== groundFires.length || hits.length > 0) {
      set(state => ({
        groundFires: aliveFires,
        enemies: hits.length > 0
          ? state.enemies.map(e => hits.some(h => h.id === e.id) ? { ...e, lastFireHitAt: gameTime } : e)
          : state.enemies,
      }));
    }
    for (const h of hits) {
      get().damageEnemy(h.id, gfDotDmg);
      get().spawnDamageNumber(h.x, h.y, gfDotDmg);
    }
  },

  // スキル 救難信号: applyRescueSignalProc の発動判定を受けて一過性アライを1体積む。
  // 描画(飛来→打撃→離脱)は pixiScene 側が rescueAllies を直読みして行う。
  spawnRescueAlly: (klass, fromX, fromY, target, damage) => {
    set(state => ({
      rescueAllies: [...state.rescueAllies, {
        id: `rescue-ally-${rescueAllySeq++}`,
        klass, fromX, fromY,
        targetX: target.x, targetY: target.y, targetFootY: target.footY,
        targetEnemyId: target.id,
        damage,
        spawnedAt: state.gameTime,
        struck: false,
      }],
    }));
  },

  // 毎フレーム: 飛来+登場一拍(RESCUE_ALLY_FLYIN_MS + RESCUE_ALLY_ARRIVE_HOLD_MS)を終えた瞬間に
  // 1回だけダメージを適用し(struck=trueで二重適用を防ぐ)、全体の寿命(RESCUE_ALLY_TOTAL_MS)を
  // 過ぎたものを配列から回収する。
  // 対象が既に消えていれば(このtick以前に他の要因で死亡/画面外recycle等)ダメージ適用をスキップする
  // だけで、演出(飛来→離脱)自体は最後まで再生する(既に決めた target 座標へ向かうだけなので違和感が無い)。
  tickRescueAllies: () => {
    const { rescueAllies, gameTime } = get();
    if (rescueAllies.length === 0) return;
    const toStrike = rescueAllies.filter(a => !a.struck && gameTime >= a.spawnedAt + RESCUE_ALLY_FLYIN_MS + RESCUE_ALLY_ARRIVE_HOLD_MS);
    const alive = rescueAllies.filter(a => gameTime < a.spawnedAt + RESCUE_ALLY_TOTAL_MS);
    if (toStrike.length > 0 || alive.length !== rescueAllies.length) {
      const struckIds = new Set(toStrike.map(a => a.id));
      set({
        rescueAllies: alive.map(a => struckIds.has(a.id) ? { ...a, struck: true } : a),
      });
    }
    for (const a of toStrike) {
      const target = get().enemies.find(e => e.id === a.targetEnemyId);
      if (!target) continue; // 着弾前に対象が消えていた=何もしない(演出はそのまま最後まで流れる)
      const tcx = target.x + target.width / 2;
      const tcy = target.y + target.height / 2;
      const killed = get().damageEnemy(a.targetEnemyId, a.damage);
      get().spawnDamageNumber(tcx, target.y, a.damage, false);
      get().spawnSlash(tcx, tcy, 'rgba(226,232,240,0.95)');
      get().spawnRing(tcx, tcy, 6, 34, 'rgba(56,189,248,0.75)', 2, 260);
      // ズーム演出のみ(CLAUDE.md: サブウェポン/スキルのprocはスロー禁止=triggerHitImpactは
      // timeSlowを内包するため使わず、triggerZoomを直接叩く)。
      get().triggerZoom(RESCUE_SIGNAL_ZOOM_MAG, RESCUE_SIGNAL_ZOOM_MS, RESCUE_SIGNAL_ZOOM_HOLD_MS, tcx, tcy);
      if (killed) {
        get().dropEnemyCurrency(target, tcx, tcy);
        get().dropEnemyXp(target, tcx, tcy, 'pickup-xp-rescue');
      }
    }
  },

  // 救急鞄(first-aid-kit): 中身を払い出し切った後、鞄本体を最寄りの敵へ投げる一過性演出
  // (rescueAllyと同じ構造)。生成のみ(発動判定/対象選定はuseGameLoop側)。描画はpixiScene側が
  // thrownBagsを直読みして飛翔位置を補間する。
  spawnThrownBag: (fromX, fromY, target, damage) => {
    set(state => ({
      thrownBags: [...state.thrownBags, {
        id: `thrown-bag-${thrownBagSeq++}`,
        fromX, fromY,
        targetX: target.x, targetY: target.y,
        targetEnemyId: target.id,
        damage,
        spawnedAt: state.gameTime,
        struck: false,
      }],
    }));
  },

  // 毎フレーム: 飛行(THROWN_BAG_FLIGHT_MS)を終えた瞬間に1回だけダメージ+ノックバック+FXを適用し
  // (struck=trueで二重適用を防ぐ)、寿命(=飛行完了)を過ぎたものを配列から回収する。tickRescueAllies
  // と異なり離脱フェーズが無い一方通行の投擲なので、寿命=飛行時間そのもの。
  // 対象が既に消えていれば(着弾前に他の要因で死亡/画面外recycle等)ダメージ適用をスキップするだけ
  // (演出自体は最後まで再生=既に決めたtarget座標へ向かうだけなので違和感が無い)。
  tickThrownBags: () => {
    const { thrownBags, gameTime } = get();
    if (thrownBags.length === 0) return;
    const toStrike = thrownBags.filter(b => !b.struck && gameTime >= b.spawnedAt + THROWN_BAG_FLIGHT_MS);
    const alive = thrownBags.filter(b => gameTime < b.spawnedAt + THROWN_BAG_FLIGHT_MS);
    if (toStrike.length > 0 || alive.length !== thrownBags.length) {
      set({ thrownBags: alive });
    }
    for (const b of toStrike) {
      const target = get().enemies.find(e => e.id === b.targetEnemyId);
      // 社長決定v0.25.1657: 空鞄=爆発範囲攻撃。着弾点中心のAoE(反射神経の反撃爆発に準拠)。
      // 対象が消えていても発生時に記録した対象足元(targetX/Y)で爆発させる(空振りにしない)。
      const cx = target ? target.x + target.width / 2 : b.targetX;
      const cy = target ? target.y + target.height / 2 : b.targetY;
      const exMult = skillExplosionMult(get().player); // 全爆発共通の倍率(エクスプローダー等)に追従
      // §6.10 M33⑤: ヘビーガンナー固有(爆発範囲倍率)を他の爆発と同じく半径へ適用。
      const radius = FIRST_AID_BAG_EXPLODE_RADIUS * exMult * heavyGunnerExplosionMult(get().player, gameTime);
      // §6.10 M33②: skillOutgoingDamageMult(バーサーカー等)を爆発ダメージにも乗算。
      const baseDmg = b.damage * exMult * skillOutgoingDamageMult(get().player); // b.damage=FIRST_AID_KIT_THROW_DAMAGE(爆発中心の基準)
      // §6.10 M33③: ボマー = 救急鞄の爆発でも子グレネード3個を散布(手榴弾と同一仕様・再散布なし)。
      if (hasSkill(get().player, 'bomber')) {
        for (const mini of buildBomberMinis(cx, cy, `bag-${b.id}`)) get().addProjectile(mini);
        get().spawnBurst(cx, cy, '#fbbf24', 8);
      }
      get().spawnRing(cx, cy, 12, radius, 'rgba(255,170,70,0.9)', 5, 400);
      get().spawnBurst(cx, cy, '#ffae46', 22);
      get().spawnGlow(cx, cy, radius * 0.55, 'rgba(255,150,60,', 400);
      // 半径内の敵に falloff ダメージ+押し出し(中心=b.fromX/Yではなく着弾点基準)。
      for (const e of get().enemies) {
        if (e.type === 'reaper' && !e.reaperChaser) continue;
        const ecx = e.x + e.width / 2;
        const ecy = e.y + e.height / 2;
        const dx = ecx - cx, dy = ecy - cy;
        const dist = Math.hypot(dx, dy);
        if (dist > radius) continue;
        const falloff = 1 - dist / radius;
        const dmg = Math.max(1, Math.round(baseDmg * (0.55 + falloff * 0.45)));
        const killed = get().damageEnemy(e.id, dmg);
        get().spawnDamageNumber(ecx, e.y, dmg, false);
        // 重い敵/ボス/すり抜け勢はノックバック無効(既存のシールド等と同じ慣例)。
        const knockbackImmune = e.type === 'giantbat' || e.type === 'pumpkin'
          || e.type === 'reaper' || isHiddenBoss(e.type);
        if (!killed && !knockbackImmune) {
          const nrm = Math.max(0.001, dist);
          get().knockbackEnemy(e.id, dx / nrm, dy / nrm, FIRST_AID_KIT_THROW_KNOCKBACK_MULT);
        }
        if (killed) {
          get().dropEnemyXp(e, ecx, ecy, `pickup-xp-first-aid-kit-${b.id}-${e.id}`);
        }
      }
    }
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
    const katanaBossFullStunHits: { x: number; y: number }[] = []; // GAME_AUDIT #17: 刀クリで完全気絶が発動した位置
    const katanaHitEnemyIds: string[] = []; // スキル 救難信号: 一閃(allowFinisher時)でヒットした敵ID(発動判定/対象選定用)

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
      katanaHitEnemyIds.push(enemy.id);
      const stunned = enemy.stunUntil !== undefined && gameTime < enemy.stunUntil;
      // 近接フィニッシュ(スタン敵の即時処刑/ボス5×)は一閃ダッシュのみ。
      // オート斬撃(allowFinisher=false)はスタン敵にも通常ダメージだけ与え、
      // スタンは消さない(一閃で仕留める余地を残す)。
      if (stunned && allowFinisher) {
        if (isBossType(enemy.type)) {
          // Same boss rule as the knife: 5× damage, no execute。ただし裏ボスの完全気絶(紫)中は
          // 気絶を解除せずタイマー切れまで5×を“し放題”(社長指示)。通常の気絶は従来どおり1発で解除。
          const bossFull = enemy.bossFullStunUntil !== undefined && gameTime < enemy.bossFullStunUntil;
          bossFinishHit = true;
          const dmg = baseDamage * damageMult * BOSS_MELEE_STUN_MULT;
          damageNumbers.push({ x: ecx, y: enemy.y, value: dmg, crit: true });
          // §5.21-追補4: スタン中ボスへの5×一閃=ボスのフィニッシュ経路そのものなのでclampしない。
          const newHealth = Math.max(0, enemy.health - dmg);
          if (newHealth <= 0) {
            killed.push({ enemy, finisher: false });
          } else {
            survivors.push({
              ...enemy,
              health: newHealth,
              stunUntil: bossFull ? enemy.stunUntil : undefined,
              lastHit: now,
              liftUntil: now + 420,
            });
          }
          continue;
        }
        // §6.22 M47仕様①: 強個体はHP50%以上だと即死せず近接ダメージ×3+気絶解除。
        if (stunnedMeleeOutcome(enemy) === 'heavy') {
          bossFinishHit = true;
          const dmg = baseDamage * damageMult * ELITE_MELEE_STUN_MULT;
          damageNumbers.push({ x: ecx, y: enemy.y, value: dmg, crit: true });
          const newHealth = Math.max(0, enemy.health - dmg);
          if (newHealth <= 0) {
            killed.push({ enemy, finisher: false });
          } else {
            survivors.push({ ...enemy, health: newHealth, stunUntil: undefined, lastHit: now, liftUntil: now + 420 });
          }
          continue;
        }
        killed.push({ enemy, finisher: true }); // 通常ナイフと同じ即時フィニッシュ
        recordFinisherKill(); // §6.21 M46: 気絶中の敵への近接即死(刀)
        continue;
      }
      const trapCritBonus = enemy.rootUntil !== undefined && gameTime < enemy.rootUntil
        ? TRAP_ROOT_CRIT_BONUS
        : 0;
      // 刀のクリ率 = レベル別基礎(10/20/30%) + プレイヤーのレベルアップ
      // クリティカル率アップ(player.critChance) + トラップ拘束ボーナス。
      // PACING_PUZZLE.md §5.6 M7: チャフ(スケルトン)の武器弱点=近接+10%。
      const weakCritBonus = WEAKCRIT_ENABLED ? weaknessCritBonus(enemy.type, 'melee') : 0;
      const crit = Math.random() <
        applyEnemyCritPenalty(Math.min(1, KATANA_CRIT_CHANCE_BY_LEVEL[katanaLevel(player)] + player.critChance + trapCritBonus + weakCritBonus + skillBenkeiCritBonus(player, gameTime) + skillWarmUpCritBonus(player, gameTime) + skillKnifeMasterMeleeCrit(player)), enemy);
      // ダッシュの3倍は基礎値側に掛け、クリ倍率は既存近接どおり最後に掛ける
      // (既存ダメージ計算: dmg = base * (crit ? CRIT_DAMAGE_MULT : 1) に揃えた)。
      const dmg = baseDamage * damageMult * (crit ? skillCritMult(player, CRIT_DAMAGE_MULT) : 1) * skillOutgoingDamageMult(player) * meleeComboMult;
      damageNumbers.push({ x: ecx, y: enemy.y, value: dmg, crit });
      // §5.21-追補4: 非フィニッシュの通常斬撃(オート斬撃 or 非スタン)。finishKillOnly個体はHP1で踏みとどまる。
      const newHealth = clampFinishKillOnlyHealth(enemy.finishKillOnly, Math.max(0, enemy.health - dmg), false);
      if (newHealth <= 0) {
        killed.push({ enemy, finisher: false });
        continue;
      }
      // 銃のクリと同じ挙動: 倒しきれなかったクリは敵をスタンさせ、黄色いリングで
      // 知らせる。これで刀でも「クリが出た」のが分かり、スタン中の敵を一閃の近接
      // フィニッシュで処刑できる(刀=銃の代替としての一貫挙動)。
      const critStun = crit; // reaper は対象外(上で除外済み)
      if (critStun) critStunAt.push({ x: ecx, y: ecy });
      // GAME_AUDIT #17(社長承認): 刀のクリも銃と同じく裏ボスの完全気絶カウントに乗せる。
      const bossBump = crit ? bumpBossCrit(enemy, gameTime) : null;
      if (bossBump?.triggered) katanaBossFullStunHits.push({ x: ecx, y: ecy });
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
          knockbackImmuneUntil: now + KNOCKBACK_IMMUNE_MS,
          ...(bossBump?.patch ?? {}), // GAME_AUDIT #17: 完全気絶カウント/発動を反映(最後に展開して優先)
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
          ...(bossBump?.patch ?? {}), // GAME_AUDIT #17
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
    // §6.21 M46: 近接カウンター振り(刀のオート斬撃/一閃)の計測。channel='melee'。1呼び出し=1回(hitCount=命中数)。
    const katanaSwingDamage = damageNumbers.reduce((sum, n) => sum + n.value, 0);
    recordDamageDealt('melee', katanaSwingDamage);
    recordMeleeSwing(slashAt.length);
    set(state => ({
      // このスイングで近接ダメージを受けた敵(lastHit===now)に meleeAggro を付与(救助で以後プレイヤー狙い)。
      // §5.21-追補8: 同じ判定(このスイングで近接ダメージを受けた=lastHit===now)でミゲル(ゲート2ボス)
      // 専用の meleeHitAt もスタンプ(gun/爆発は damageEnemy 側の別経路なので対象外)。ミゲル以外は
      // 無害な余剰フィールド(useGameLoop のミゲル専用コントローラだけが参照)。
      enemies: survivors.map(e => e.lastHit === now ? { ...e, meleeAggro: true, meleeHitAt: gameTime } : e),
      gameStats: {
        ...state.gameStats,
        enemiesKilled: state.gameStats.enemiesKilled + killed.length,
        meleeFinishers: state.gameStats.meleeFinishers + killed.reduce((n, k) => n + (k.finisher ? 1 : 0), 0),
        eliteKills: state.gameStats.eliteKills + killed.reduce((n, k) => n + (isScoreElite(k.enemy.type) ? 1 : 0), 0),
        bossKills: state.gameStats.bossKills + killed.reduce((n, k) => n + (isScoreBoss(k.enemy.type) ? 1 : 0), 0),
        damageDealt: state.gameStats.damageDealt + katanaSwingDamage,
        maxCombo: comboFinishCount > 0
          ? Math.max(
              state.gameStats.maxCombo,
              state.meleeFinishComboUntil >= gameTime
                ? state.meleeFinishComboCount + comboFinishCount
                : comboFinishCount
            )
          : state.gameStats.maxCombo
      },
      finaleDefeated: state.finaleDefeated || bossKilled,
      meleeFinishComboCount: comboFinishCount > 0
        ? (state.meleeFinishComboUntil >= gameTime ? state.meleeFinishComboCount + comboFinishCount : comboFinishCount)
        : state.meleeFinishComboCount,
      meleeFinishComboUntil: comboFinishCount > 0
        ? gameTime + finishWindowMs
        : state.meleeFinishComboUntil,
      // hitstopはtriggerFinishImpact側でCD込みで一括管理(M21・§5.22)。ここでの個別設定は廃止。
      player: { ...state.player, knifeComboCount: knifeCombo.count, knifeComboUntil: knifeCombo.until },
    }));

    // 軽量な短命斬撃のみ(常時glowなし)。刀はやや青白い斬閃で識別。
    // 通常斬撃(オート)はエフェクトを2倍サイズで描く(確定仕様)。
    const slashScale = allowFinisher ? 1 : 2;
    for (const s of slashAt) {
      get().spawnSlash(s.x, s.y, 'rgba(221,238,255,0.95)', slashScale);
      get().spawnMeleeBlood(s.x, s.y); // 近接の血飛沫(社長指摘v0.25.2060: メイン近接3経路に未配線だった)
    }
    for (const c of damageNumbers) {
      get().spawnDamageNumber(c.x, c.y, c.value, c.crit);
    }
    // クリでスタンさせた敵に黄色いリング(銃クリと同じフィードバック)。
    for (const c of critStunAt) {
      get().spawnRing(c.x, c.y, 6, 30, 'rgba(250, 204, 21, 0.9)', 2, 260);
    }
    // GAME_AUDIT #17: 刀クリで完全気絶が発動したら銃経路と同じ紫FX+STUN!コールアウト。
    for (const p of katanaBossFullStunHits) {
      get().spawnRing(p.x, p.y, 12, 210, 'rgba(168,85,247,0.85)', 5, 520);
      get().spawnRing(p.x, p.y, 6, 130, 'rgba(216,180,254,0.9)', 3, 360);
      get().spawnGlow(p.x, p.y, 130, 'rgba(168,85,247,', 620);
      get().spawnCallout(p.x, p.y - 24, 'STUN!', '#d8b4fe', { bg: 0x6b21a8 });
    }
    // 刀の一閃フィニッシュは「斬」コールアウトが主役なので、Kill! と既存の
    // 黄色フィニッシュフラッシュは出さない(暗転と斬は triggerKatanaDash 側で出す)。
    grantMeleeKillRewards(get, killed, player, gun, true);
    if (finisherHit || bossFinishHit) {
      const [ztx, zty] = finishZoomTargetOf(killed);
      get().triggerFinishImpact(ztx, zty); // ストップ後に 揺れ+スロー+寄りズーム(キルされた対象へ)
    }
    // スキル: リーパー。刀の一閃フィニッシュ範囲(katanaRange)内の敵を全員フィニッシュ。
    applyMeleeFinishSkillSpread(get, player, killed.some(k => k.finisher), pcx, pcy, katanaRange(player), baseDamage * damageMult);
    // スキル: 救難信号。刀装備時は通常近接の代わりに一閃(allowFinisher=trueのダッシュ斬り。
    // triggerKatanaDash経由のみ)がプレイヤーの「近接ヒット」に相当するため、ここで発動判定する。
    // オート斬撃(allowFinisher=false)は対象外(社長指示「一閃時」=ダッシュ斬りのみ)。
    // baseMeleeDamage = baseDamage*damageMult = このヒットがcrit/コンボ/skillOutgoingDamageMult抜きで
    // 計算した素ダメージ(通常近接のmeleeDamageと同じ「倍率1」の考え方)。
    if (allowFinisher) {
      applyRescueSignalProc(get, player, baseDamage * damageMult, katanaHitEnemyIds, pcx, pcy);
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
    const critStunAt: { x: number; y: number }[] = []; // 社長指示: 近接クリでも銃/刀と同じくスタン(黄色リング)を掛ける
    const slashAt: { x: number; y: number }[] = [];
    const whipHitEnemyIds: string[] = []; // スキル 救難信号(§6.10 M33⑦): 鞭のヒット敵ID(発動判定/対象選定用)
    let hits = 0;
    // スキル: 近接コンボ倍率(ナイフマスター×コンボマスター)。
    const meleeComboMult = skillMeleeComboMult(player, gameTime, get().meleeFinishComboCount, get().meleeFinishComboUntil);

    for (const enemy of enemies) {
      if (!targetIds.includes(enemy.id) || (enemy.type === 'reaper' && !enemy.reaperChaser)) {
        survivors.push(enemy);
        continue;
      }
      hits++;
      whipHitEnemyIds.push(enemy.id);
      const ecx = enemy.x + enemy.width / 2;
      const ecy = enemy.y + enemy.height / 2;
      slashAt.push({ x: ecx, y: ecy });
      // 巻き込み中は通常倍率(1.0)、それ以外は鞭の低倍率(0.25)。
      const whipMult = inHurricane(ecx, ecy) ? 1 : WHIP_DAMAGE_MULT;
      const stunned = enemy.stunUntil !== undefined && gameTime < enemy.stunUntil;
      if (stunned) {
        // 近接フィニッシュ: スタン敵は即時処刑(ボスは5×でスタン解除。§6.22 M47でネームド/questTarget/
        // pumpkin/lab-zombie-3はHP50%以上なら即死せず×3+気絶解除に変更=旧§5.21-追補7の「ネームドは
        // 通常敵扱い=即時処刑」を上書き)。
        if (isBossType(enemy.type)) {
          bossFinishHit = true;
          const dmg = meleeBase * whipMult * BOSS_MELEE_STUN_MULT;
          damageNumbers.push({ x: ecx, y: enemy.y, value: dmg, crit: true });
          // §5.21-追補4: スタン中ボスへの5×鞭打ち=ボスのフィニッシュ経路そのものなのでclampしない。
          const newHealth = Math.max(0, enemy.health - dmg);
          if (newHealth <= 0) killed.push({ enemy, finisher: false });
          else survivors.push({ ...enemy, health: newHealth, stunUntil: undefined, lastHit: now, liftUntil: now + 420 });
          continue;
        }
        // §6.22 M47仕様①: 強個体はHP50%以上だと即死せず近接ダメージ×3+気絶解除。
        if (stunnedMeleeOutcome(enemy) === 'heavy') {
          bossFinishHit = true;
          const dmg = meleeBase * whipMult * ELITE_MELEE_STUN_MULT;
          damageNumbers.push({ x: ecx, y: enemy.y, value: dmg, crit: true });
          const newHealth = Math.max(0, enemy.health - dmg);
          if (newHealth <= 0) {
            killed.push({ enemy, finisher: false });
          } else {
            survivors.push({ ...enemy, health: newHealth, stunUntil: undefined, lastHit: now, liftUntil: now + 420 });
          }
          continue;
        }
        killed.push({ enemy, finisher: true });
        recordFinisherKill(); // §6.21 M46: 気絶中の敵への近接即死(鞭)
        continue;
      }
      const trapCritBonus = enemy.rootUntil !== undefined && gameTime < enemy.rootUntil ? TRAP_ROOT_CRIT_BONUS : 0;
      // PACING_PUZZLE.md §5.6 M7: チャフ(スケルトン)の武器弱点=近接+10%。
      const weakCritBonus = WEAKCRIT_ENABLED ? weaknessCritBonus(enemy.type, 'melee') : 0;
      const crit = Math.random() < applyEnemyCritPenalty(Math.min(1, meleeCritChance + player.critChance + trapCritBonus + weakCritBonus + skillBenkeiCritBonus(player, gameTime) + skillWarmUpCritBonus(player, gameTime) + skillKnifeMasterMeleeCrit(player)), enemy);
      const dmg = meleeBase * whipMult * (crit ? skillCritMult(player, CRIT_DAMAGE_MULT) : 1) * skillOutgoingDamageMult(player) * meleeComboMult;
      damageNumbers.push({ x: ecx, y: enemy.y, value: dmg, crit });
      // §5.21-追補4: 非スタンの通常鞭打ち。finishKillOnly個体はHP1で踏みとどまる。
      const newHealth = clampFinishKillOnlyHealth(enemy.finishKillOnly, Math.max(0, enemy.health - dmg), false);
      if (newHealth <= 0) { killed.push({ enemy, finisher: false }); continue; }
      if (crit) critStunAt.push({ x: ecx, y: ecy });
      // 大ノックバック(通常の約3倍): 鞭の線に直交する向きへ、敵がいる側へ強く弾く=避難路。
      // 鞭は「必ずノックバック」: ノックバック無敵窓(knockbackImmuneUntil)を無視して毎回弾く。
      const side = ((ecx - pcx) * nx + (ecy - pcy) * ny) >= 0 ? 1 : -1;
      survivors.push({
        ...enemy,
        health: newHealth,
        lastHit: now,
        stunUntil: crit ? gameTime + STUN_DURATION_MS * (player.stunDurationMult ?? 1) : enemy.stunUntil,
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
    // §6.21 M46: 近接カウンター振り(鞭)の計測。channel='melee'。1振り=1回(hitCount=命中数)。
    const whipSwingDamage = damageNumbers.reduce((s, n) => s + n.value, 0);
    recordDamageDealt('melee', whipSwingDamage);
    recordMeleeSwing(slashAt.length);
    set(state => ({
      // このスイングで近接ダメージを受けた敵(lastHit===now)に meleeAggro を付与(救助で以後プレイヤー狙い)。
      // §5.21-追補8: 同じ判定(このスイングで近接ダメージを受けた=lastHit===now)でミゲル(ゲート2ボス)
      // 専用の meleeHitAt もスタンプ(gun/爆発は damageEnemy 側の別経路なので対象外)。ミゲル以外は
      // 無害な余剰フィールド(useGameLoop のミゲル専用コントローラだけが参照)。
      enemies: survivors.map(e => e.lastHit === now ? { ...e, meleeAggro: true, meleeHitAt: gameTime } : e),
      gameStats: {
        ...state.gameStats,
        enemiesKilled: state.gameStats.enemiesKilled + killed.length,
        meleeFinishers: state.gameStats.meleeFinishers + killed.reduce((n, k) => n + (k.finisher ? 1 : 0), 0),
        eliteKills: state.gameStats.eliteKills + killed.reduce((n, k) => n + (isScoreElite(k.enemy.type) ? 1 : 0), 0),
        bossKills: state.gameStats.bossKills + killed.reduce((n, k) => n + (isScoreBoss(k.enemy.type) ? 1 : 0), 0),
        damageDealt: state.gameStats.damageDealt + whipSwingDamage,
        maxCombo: comboFinishCount > 0
          ? Math.max(state.gameStats.maxCombo, state.meleeFinishComboUntil >= gameTime ? state.meleeFinishComboCount + comboFinishCount : comboFinishCount)
          : state.gameStats.maxCombo,
      },
      finaleDefeated: state.finaleDefeated || bossKilled,
      meleeFinishComboCount: comboFinishCount > 0
        ? (state.meleeFinishComboUntil >= gameTime ? state.meleeFinishComboCount + comboFinishCount : comboFinishCount)
        : state.meleeFinishComboCount,
      meleeFinishComboUntil: comboFinishCount > 0 ? gameTime + finishWindowMs : state.meleeFinishComboUntil,
      // hitstopはtriggerFinishImpact側でCD込みで一括管理(M21・§5.22)。ここでの個別設定は廃止。
      player: { ...state.player, knifeComboCount: knifeCombo.count, knifeComboUntil: knifeCombo.until },
    }));

    // 鞭の時は近接攻撃のクレスト(slashストリーク)表現は出さない。鞭自身のlashスプライトのみ。
    // 血飛沫は出す(社長指摘v0.25.2060: メイン近接3経路に未配線だった)。
    for (const s of slashAt) get().spawnMeleeBlood(s.x, s.y);
    for (const c of damageNumbers) get().spawnDamageNumber(c.x, c.y, c.value, c.crit);
    for (const c of critStunAt) get().spawnRing(c.x, c.y, 6, 30, 'rgba(250, 204, 21, 0.9)', 2, 260);
    // 弾薬ドロップは鞭固定20%(弾切れ救済)。
    grantMeleeKillRewards(get, killed, player, gun, false, WHIP_AMMO_DROP_CHANCE);
    // スキル: 救難信号(§6.10 M33⑦: 鞭のヒットでも発動判定。基本近接/刀と同条件。アライの一撃は
    // 鞭の通常打撃基準=meleeBase×WHIP_DAMAGE_MULT を素通し)。
    applyRescueSignalProc(get, player, meleeBase * WHIP_DAMAGE_MULT, whipHitEnemyIds, pcx, pcy);
    if (finisherHit || bossFinishHit) {
      const [ztx, zty] = finishZoomTargetOf(killed);
      get().triggerFinishImpact(ztx, zty); // ストップ後に 揺れ+スロー+寄りズーム(キルされた対象へ)
    }
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
      .filter(e => e.type !== 'reaper' || e.reaperChaser)
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
      // §6.10 M33②: 賢者の石ハリケーンにも skillOutgoingDamageMult(バーサーカー等)を乗算。
      const hurDmg = Math.round(HURRICANE_DAMAGE * sageStoneHurricaneMult(state.player) * skillOutgoingDamageMult(state.player));
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
          .map((e, i) => ({ i, d2: (e.x + e.width / 2 - rcx) ** 2 + (e.y + e.height / 2 - rcy) ** 2, reaper: e.type === 'reaper' && !e.reaperChaser }))
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
            if (e.type === 'reaper' && !e.reaperChaser) continue;
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
            if (e.type === 'reaper' && !e.reaperChaser) continue;
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
            if (e.type === 'reaper' && !e.reaperChaser) continue;
            const d2 = (e.x + e.width / 2 - scx) ** 2 + (e.y + e.height / 2 - scy) ** 2;
            if (d2 <= nd2) { nd2 = d2; nearestId = e.id; nx = e.x + e.width / 2; ny = e.y; }
          }
          if (nearestId) { attackHits.push({ id: nearestId, amount: s.damage, x: nx, y: ny }); s = { ...s, lastContactAt: now }; }
        }
      }
      nextSummons.push(moveFollow(s));
    }
    set({ summons: nextSummons, ...(enemiesChanged ? { enemies: enemiesNext } : {}) });
    // §6.10 M33②: 錬金術召喚(通常接触/レア死神AoE)にも skillOutgoingDamageMult(バーサーカー等)を乗算(四捨五入)。
    const summonOutMult = skillOutgoingDamageMult(get().player);
    for (const h of attackHits) {
      const sDmg = Math.max(1, Math.round(h.amount * summonOutMult));
      get().damageEnemy(h.id, sDmg);
      get().spawnDamageNumber(h.x, h.y, sDmg); // 召喚(死神AoE/通常接触)の攻撃を可視化
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
    if (isInReturnCircle(player, get().returnCircle)) return false; // 帰還サークル内は攻撃停止
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
      if (e.type === 'reaper' && !e.reaperChaser) continue;
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
          // 「斬」の瞬間もKILLと同じ大量の血飛沫(社長指示v0.25.2056): 軌道中央から真上へ2連の間欠泉。
          get().spawnBlood(zanX, zanY, -Math.PI / 2 - 0.16, 260);
          get().spawnBlood(zanX, zanY, -Math.PI / 2 + 0.16, 260);
        }
      }, KATANA_DASH_MS);
    }
    return true;
  },

  // ワイヤーアンカー: フリックでフリック方向(dir)に固定距離ワイヤーを刺す。1秒後(wirePlantUntil)に
  // ループ側が startWireDash を呼んで高速移動を開始する。発動できたら true。
  triggerWireAnchor: (dirX, dirY) => {
    const now = Date.now();
    const { player, gameTime, isPaused } = get();
    if (isPaused) return false;
    if (isInReturnCircle(player, get().returnCircle)) return false; // 帰還サークル内は攻撃停止
    if (!player.subWeapons.includes('wire-anchor')) return false;
    if (subWeaponBlockedByKatana(player, 'wire-anchor')) return false;
    // 刺し待ち〜移動中は新しいフリックを受けない。CD 中も不可。
    if (player.wireAnchored || now < player.wireDashUntil) return false;
    if (gameTime < (player.subWeaponCooldowns['wire-anchor'] ?? 0)) return false;
    const len = Math.hypot(dirX, dirY);
    if (len < 0.001) return false;
    const ux = dirX / len, uy = dirY / len;
    const lvl = Math.max(1, Math.min(3, player.subWeaponLevels['wire-anchor'] ?? 1));
    const dist = WIRE_DIST_BY_LEVEL[lvl];
    const pcx = player.x + player.width / 2;
    const pcy = player.y + player.height / 2;

    // フリック方向の直線上・射程内にいる最初の敵を探す = ワイヤーが刺さる敵。
    // 居れば「大技」(即・引き上げ→垂直斬り下ろし→着地ノックバック)。居なければ従来の地点プラント。
    let target: Enemy | null = null;
    {
      let bestProj = Infinity;
      for (const e of get().enemies) {
        if (e.aiPhase === 'jump') continue;           // 空中無敵は刺さらない
        const ecx = e.x + e.width / 2, ecy = e.y + e.height / 2;
        const rx = ecx - pcx, ry = ecy - pcy;
        const proj = rx * ux + ry * uy;               // フリック方向の前方距離
        if (proj < 0 || proj > dist) continue;
        const perp = Math.abs(rx * -uy + ry * ux);    // 直線からの横ずれ
        if (perp > Math.max(e.width, e.height) / 2 + 18) continue;
        if (proj < bestProj) { bestProj = proj; target = e; }
      }
    }
    if (target) {
      const tcx = target.x + target.width / 2, tcy = target.y + target.height / 2;
      const ddist = Math.max(0.001, Math.hypot(tcx - pcx, tcy - pcy));
      set(s => ({
        player: {
          ...s.player,
          wireAnchorX: tcx, wireAnchorY: tcy,        // 敵の真上(=敵中心)へ引き上げる
          wireAnchored: false, wirePlantUntil: 0,
          wireDashUntil: now + WIRE_SLAM_MS,         // 待ち無しで即発動
          wireDashSpeed: ddist / (WIRE_SLAM_MS / 1000),
          wireStuckEnemyId: '', wireStuckUntil: 0,
          wireSlamEnemyId: target!.id, wireSlamStart: now,
          invulnerable: true,                        // 空中は無敵(既存被弾無敵を流用)
          invulnerableTime: now - Math.max(0, INVULN_MS - WIRE_SLAM_MS),
        },
        anchorEnemyHitFxAt: now,                     // 命中SEのトリガ
      }));
      get().spawnRing(tcx, tcy, 6, 26, 'rgba(186,230,253,0.9)', 2, 200);
      get().setSubWeaponCooldown('wire-anchor', gameTime + WIRE_SLAM_MS + WIRE_COOLDOWN_BY_LEVEL[lvl]);
      return true;
    }

    const ax = pcx + ux * dist;
    const ay = pcy + uy * dist;
    set(s => ({
      player: {
        ...s.player,
        wireAnchorX: ax,
        wireAnchorY: ay,
        wireAnchored: true,
        wirePlantUntil: now + WIRE_PLANT_DELAY_MS, // この時刻に自動で高速移動開始
        wireDashUntil: 0,
        wireStuckEnemyId: '',
        wireStuckUntil: 0,
      },
      anchorPlantFxAt: now, // 打ち込み音SEのトリガ
    }));
    get().spawnRing(ax, ay, 6, 22, 'rgba(96,165,250,0.85)', 2, 220); // 刺さった地点の小ポップ
    // CD は刺した直後から「待ち1秒 + 移動 + 規定CD」分かけておく(待ち中の連射防止)。
    get().setSubWeaponCooldown('wire-anchor', gameTime + WIRE_PLANT_DELAY_MS + WIRE_DASH_MS + WIRE_COOLDOWN_BY_LEVEL[lvl]);
    return true;
  },

  // 刺してから1秒後に呼ばれ、アンカー地点へ高速移動を開始する。
  startWireDash: () => {
    const now = Date.now();
    const { player } = get();
    if (!player.wireAnchored) return;
    const pcx = player.x + player.width / 2;
    const pcy = player.y + player.height / 2;
    const dist = Math.max(0.001, Math.hypot(player.wireAnchorX - pcx, player.wireAnchorY - pcy));
    set(s => ({
      player: {
        ...s.player,
        wireDashUntil: now + WIRE_DASH_MS,
        wireDashSpeed: dist / (WIRE_DASH_MS / 1000),
        wireAnchored: false,
        wirePlantUntil: 0,
        // 移動中は無敵(既存の被弾無敵を流用。INVULN_MS の自動解除が移動終了とほぼ一致するよう開始時刻をずらす)。
        invulnerable: true,
        invulnerableTime: now - Math.max(0, INVULN_MS - WIRE_DASH_MS),
      }
    }));
    get().spawnRing(player.wireAnchorX, player.wireAnchorY, 8, 30, 'rgba(96,165,250,0.8)', 2, 260);
  },

  damagePlayer: (rawAmount, source, fromX, fromY, damagerType, damagerWasNamed) => {
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
        // ここは方向未計算(この分岐は早期return)なので等方(方向なし)固定。古いshakeDir*の持ち越しを防ぐ。
        shakeDirX: amount > 0 ? 0 : state.shakeDirX,
        shakeDirY: amount > 0 ? 0 : state.shakeDirY,
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
    
    // 被弾ノックバック(社長指示): 被弾源(fromX/Y)が指定され実ダメージなら、そこから離れる方向へ弾く。
    // §5.23 M22 C1: 同じ方向(dirX/dirY)を画面シェイクにも流用(被弾源から弾かれる向き=揺れの向き)。
    const kbNow = Date.now();
    let kbVx = 0, kbVy = 0, kbApply = false;
    let dirX = 0, dirY = 0;
    if (amount > 0 && fromX !== undefined && fromY !== undefined) {
      const pcx = player.x + player.width / 2, pcy = player.y + player.height / 2;
      let dx = pcx - fromX, dy = pcy - fromY;
      const d = Math.hypot(dx, dy);
      if (d < 0.001) { dx = 0; dy = -1; } else { dx /= d; dy /= d; }
      kbVx = dx * PLAYER_KNOCKBACK_SPEED; kbVy = dy * PLAYER_KNOCKBACK_SPEED; kbApply = true;
      dirX = dx; dirY = dy;
    }

    set(state => {
      const newHealth = Math.max(0, state.player.health - amount);
      return {
        // 被弾総量(survivalScore用)。実ダメージ(amount>0)のみ加算。
        gameStats: amount > 0 ? { ...state.gameStats, damageTaken: state.gameStats.damageTaken + amount } : state.gameStats,
        // 死因表示: 実ダメージ(amount>0)かつ source 指定時に更新。
        lastDamageSource: (amount > 0 && source) ? source : state.lastDamageSource,
        // §5.14 M13: 宿敵昇格判定用(実ダメージかつ型指定時のみ更新。型不明の被弾では前回値を保持しない
        // =昇格除外(未指定=除外)の判定を毎回の被弾元で正しくやり直すため、実ダメージ時は必ず上書きする)。
        lastDamagerType: amount > 0 ? (damagerType ?? null) : state.lastDamagerType,
        lastDamagerWasNamed: amount > 0 ? !!damagerWasNamed : state.lastDamagerWasNamed,
        // Real damage kicks off a screen shake.
        shakeUntil: amount > 0 ? Date.now() + SHAKE_MS : state.shakeUntil,
        shakeMag: amount > 0 ? SHAKE_MAG : state.shakeMag,
        shakeDur: amount > 0 ? SHAKE_MS : state.shakeDur,
        // §5.23 M22 C1: 被弾源→プレイヤーのノックバック向きへ揺れを寄せる(?dirfx=0で従来の等方揺れ)。
        shakeDirX: amount > 0 ? (DIRFX_ENABLED ? dirX : 0) : state.shakeDirX,
        shakeDirY: amount > 0 ? (DIRFX_ENABLED ? dirY : 0) : state.shakeDirY,
        player: {
          ...state.player,
          health: newHealth,
          invulnerable: amount > 0,
          invulnerableTime: Date.now(),
          knockbackVx: kbApply ? kbVx : state.player.knockbackVx,
          knockbackVy: kbApply ? kbVy : state.player.knockbackVy,
          knockbackUntil: kbApply ? kbNow + PLAYER_KNOCKBACK_MS : state.player.knockbackUntil,
        }
      };
    });

    // スキル: 反射神経 = 被弾時(amount>0)、CD明けならプレイヤー中心に反撃爆発(ランチャー値)+
    // 近傍敵を 2× ノックバック。CD 1秒。被弾イベント由来なのでスロー無し(CLAUDE.md)。
    if (amount > 0) {
      const cur = get();
      const p = cur.player;
      const rfLv = skillLevel(p, 'reflex');
      if (rfLv && cur.gameTime >= p.reflexCdUntil) {
        const pcx = p.x + p.width / 2;
        const pcy = p.y + p.height / 2;
        const exMult = skillExplosionMult(p);
        const radius = [0, 92, 104, 116][rfLv] * exMult;
        // §6.10 M33②: 反射神経の反撃爆発にも skillOutgoingDamageMult(バーサーカー等)を乗算。
        const baseDmg = [0, 60, 80, 100][rfLv] * exMult * skillOutgoingDamageMult(p);
        get().spawnRing(pcx, pcy, 10, radius, 'rgba(56,189,248,0.85)', 5, 360);
        get().spawnBurst(pcx, pcy, '#38bdf8', 18);
        get().spawnGlow(pcx, pcy, 56, 'rgba(56,189,248,', 360);
        const kbMult = (KNOCKBACK_SPEED * 2) / BULLET_KNOCKBACK_SPEED;
        for (const e of get().enemies) {
          if (e.type === 'reaper' && !e.reaperChaser) continue;
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
        set(state => ({ player: { ...state.player, reflexCdUntil: state.gameTime + [0, 1000, 800, 600][rfLv] } }));
      }
      // スキル: シーカー = 被弾時、CD明け＆抽選成功で3秒間 半透明＋通常敵から狙われない。発動でCD10秒。
      const skLv = skillLevel(p, 'seeker');
      if (skLv && cur.gameTime >= p.seekerCdUntil && Math.random() < skillSeekerProcChance(p)) {
        const pcx = p.x + p.width / 2, pcy = p.y + p.height / 2;
        get().spawnRing(pcx, pcy, 8, 60, 'rgba(148,163,184,0.7)', 3, 320);
        set(state => ({ player: { ...state.player, seekerUntil: state.gameTime + SEEKER_DURATION_MS, seekerCdUntil: state.gameTime + SEEKER_COOLDOWN_MS } }));
      }
    }

    // Return whether player is dead
    const died = get().player.health <= 0;
    // 死亡で装備は全ロスト(持ち込み含む)。持ち帰り永続も破棄する。
    if (died) saveCarriedEquip(null);
    // PACING_PUZZLE.md §5.14 M13: 死亡時、殺した敵の型を宿敵へ昇格判定(城ボス/死神/裏ボス/
    // 紅き月個体/型不明は除外。自分の宿敵インスタンスに殺された場合は強化せず因縁+1のみ)。
    if (died && NAMED_ENEMY_ENABLED) {
      const st = get();
      const outcome = decidePromotionOnDeath(st.lastDamagerType, st.lastDamagerWasNamed, st.redNight?.phase === 'active');
      if (outcome.kind === 'grudge' && st.namedFoe) {
        const next: NamedFoeMeta = { ...st.namedFoe, grudge: st.namedFoe.grudge + 1 };
        saveNamedFoe(next);
        set({ namedFoe: next, namedFoeRunResolved: true });
      } else if (outcome.kind === 'overwrite') {
        const next: NamedFoeMeta = { type: outcome.type, name: outcome.name, grudge: 0 };
        saveNamedFoe(next);
        set({ namedFoe: next, namedFoeRunResolved: true });
      }
    }
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
    const { player, enemies } = get();
    if (player.experience >= player.experienceToNextLevel) {
      // 社長相談(v0.25.1499): ジャンプ着地/ダッシュの赤ライン当たり判定内にいる間は保留
      // (useGameLoopが毎フレーム再チェックして、抜けたタイミングで発動させる)。
      if (isPlayerInAttackTelegraph(player, enemies, PUMPKIN_EXPLOSION_RADIUS)) return;
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
        // 選択肢メニューは即出さず、まず「LEVEL UP 演出(スロー)」を見せる。intro 経過後に useGameLoop が出す。
        upgradeOptions,
        levelUpIntroUntil: Date.now() + LEVELUP_INTRO_MS,
        gameStats: {
          ...state.gameStats,
          maxLevel: newMaxLevel
        }
      };
    });
    // 演出: 時間スロー＋押しのけリング＋キャラを派手に光らせる(社長指示)。メニューは intro 後に開く。
    get().triggerTimeSlow(0.25, LEVELUP_INTRO_MS);
    const lp = get().player;
    const cx = lp.x + lp.width / 2, cy = lp.y + lp.height / 2;
    get().spawnRing(cx, cy, 14, LEVELUP_KNOCKBACK_RADIUS, 'rgba(250,204,21,0.7)', 3, 260);
    // キャラを派手に: 大きく明るいグロー(芯=白＋金ハロー)を重ねがけ。
    get().spawnGlow(cx, cy, 150, 'rgba(253,224,71,', LEVELUP_INTRO_MS + 200);
    get().spawnGlow(cx, cy, 88, 'rgba(255,255,255,', LEVELUP_INTRO_MS);
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
    if (isInReturnCircle(player, get().returnCircle)) return; // 帰還サークル内は攻撃停止
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
    // GAME_AUDIT #10: 通常射撃(weaponUtils)と同じダメージ倍率を適用する。従来は連射装備だけ
    // 効いてダメージ装備・スキル・スカベンジャーが素通りだった(速くなるが強くならない非対称)。
    // スキル: ラストマガジン = 弾倉最後の1発 ×2.0/2.5/3.0(PHILLも対象・§6.8 M31)。
    const phillDamage = weapon.damage * scavengerGunMult(player, get().gameTime) * skillAttackShooterGunMult(player) * (player.equipBonus?.damageMult ?? 1) * skillLastMagazineMult(player, weapon.magazine ?? 0);
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
        damage: phillDamage,
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
        damage: phillDamage,
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
        // 刀Lv3到達時の小烏丸陳列(トール討伐済みが前提条件)。賢者の石と直列に判定する。
        const muraUnlock = maybeUnlockMurasame(nextPlayer, sageUnlock ?? state.unlockedShopSkillCards, isKogarasuUnlocked());
        const shopUnlocks = muraUnlock ?? sageUnlock;
        return {
          player: nextPlayer,
          ...(shopUnlocks ? { unlockedShopSkillCards: shopUnlocks } : {}),
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
      // ナイフ強化: 現在のメレー武器を次Tierのナイフへ置換(攻撃力/クリ率は新Tierの定義どおり)。
      if (upgrade.type === 'knife' && upgrade.knifeKey) {
        const newMelee = createWeapon(upgrade.knifeKey);
        const weapons = player.weapons.some(w => w.isMelee)
          ? player.weapons.map(w => (w.isMelee ? newMelee : w))
          : [...player.weapons, newMelee];
        return { player: { ...player, weapons }, showUpgradeMenu: false, isPaused: false };
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
      const { player: p, enemies } = get();
      // 社長相談(v0.25.1499): 赤ライン当たり判定内なら保留(useGameLoopが再チェック)。
      if (p.experience >= p.experienceToNextLevel && !isPlayerInAttackTelegraph(p, enemies, PUMPKIN_EXPLOSION_RADIUS)) {
        get().levelUp();
      }
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
    // M35(§6.12): ボット計測=サブウェポン発動回数(合流点)。overclock成立でCDが付かない場合も
    // 「発動」として数える=proc判定より前に記録。計測のみ=挙動不変。
    recordSubUse(key);
    set(state => {
      // スキル: タイムキーパー = サブCDのΔ(残り時間)を ×0.7。CDは gameTime 基準。
      const mult = skillCooldownMult(state.player);
      const delta = readyAt - state.gameTime;
      // スキル: オーバークロック = サブウェポン発動(CD開始)時、20/25/30%でCDを即リセット(§6.8 M31)。
      // Δ>0(実CDの開始)の時だけ抽選。成功=CDを設定しない(既存値は発動時点で既に明けている=即再使用可)。
      // タイムキーパー等の既存CD系とは別軸で重複可。CD無しサブはここを通らない=自然に対象外。
      if (delta > 0 && Math.random() < skillOverclockChance(state.player)) {
        recordOverclockProc(); // M35: 成立回数の計測のみ
        return {};
      }
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

  setHomingLocks: (locks) => set({ homingLocks: locks }),

  fireHoming: () => {
    const { player, homingLocks, enemies, gameTime } = get();
    if (!player.subWeapons.includes('homing')) return;
    if (gameTime < (player.subWeaponCooldowns['homing'] ?? 0)) return;
    if (homingLocks.length === 0) return;
    const pcx = player.x + player.width / 2;
    const pcy = player.y + player.height / 2;
    const now = Date.now();
    const newProjectiles = homingLocks
      .map((enemyId, i) => {
        const target = enemies.find(e => e.id === enemyId);
        if (!target) return null;
        const tx = target.x + target.width / 2;
        const ty = target.y + target.height / 2;
        const dist = Math.max(0.001, Math.hypot(tx - pcx, ty - pcy));
        return {
          id: `proj-homing-${now}-${i}`,
          x: pcx - HOMING_MISSILE_SIZE / 2,
          y: pcy - HOMING_MISSILE_SIZE / 2,
          width: HOMING_MISSILE_SIZE,
          height: HOMING_MISSILE_SIZE,
          speed: HOMING_MISSILE_SPEED,
          damage: HOMING_MISSILE_DAMAGE,
          direction: { x: (tx - pcx) / dist, y: (ty - pcy) / dist },
          weaponType: 'homing-missile' as const,
          weaponKey: 'sub-homing',
          duration: HOMING_MISSILE_DURATION_MS,
          createdAt: now,
          passthrough: false,
          hitEnemies: [] as string[],
          hostile: false,
          reflected: false,
          targetEnemyId: enemyId,
          // 命中時に手榴弾と同じ範囲爆発(直撃ダメージは据え置き14、周囲は ×1 フォールオフ)。
          explodeOnHit: true,
          explodeRadius: HOMING_EXPLOSION_RADIUS,
          explodeDamageMult: 1,
        };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);
    if (newProjectiles.length === 0) return;
    set(state => ({ projectiles: [...state.projectiles, ...newProjectiles], homingLocks: [] }));
    get().setSubWeaponCooldown('homing', gameTime + HOMING_COOLDOWN_MS);
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
        if (state.player.ammoHandgun >= AMMO_MAX.handgun) return {}; // MAXなら購入不可
        return spend(SHOP_AMMO_COST, {
          ammoHandgun: Math.min(AMMO_MAX.handgun, state.player.ammoHandgun + state.ammoPickupAmounts.handgun)
        });
      }
      if (key === 'ammo-shotgun' || ammoType === 'shotgun') {
        if (state.player.ammoShotgun >= AMMO_MAX.shotgun) return {}; // MAXなら購入不可
        return spend(SHOP_AMMO_COST, {
          ammoShotgun: Math.min(AMMO_MAX.shotgun, state.player.ammoShotgun + state.ammoPickupAmounts.shotgun)
        });
      }
      if (key === 'ammo-rifle' || ammoType === 'rifle') {
        if (state.player.ammoRifle >= AMMO_MAX.rifle) return {}; // MAXなら購入不可
        return spend(SHOP_AMMO_COST, {
          ammoRifle: Math.min(AMMO_MAX.rifle, state.player.ammoRifle + state.ammoPickupAmounts.rifle)
        });
      }
      if (key === 'ammo-phill' || ammoType === 'phill') { // 研究所: 商人はPHILL弾のみ販売
        if (state.player.ammoPhill >= AMMO_MAX.phill) return {}; // MAXなら購入不可
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
        const muraUnlock = maybeUnlockMurasame(result.player as Player, sageUnlock ?? state.unlockedShopSkillCards, isKogarasuUnlocked());
        const shopUnlocks = muraUnlock ?? sageUnlock;
        if (shopUnlocks) return { ...result, unlockedShopSkillCards: shopUnlocks };
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
      // 刀がLv3(MAX)に達したら小烏丸を商人在庫へ解禁(トール討伐済みが前提条件)。
      const muraUnlock = maybeUnlockMurasame(nextPlayer, sageUnlock ?? state.unlockedShopSkillCards, isKogarasuUnlocked());
      const shopUnlocks = muraUnlock ?? sageUnlock;
      return {
        player: nextPlayer,
        ...(shopUnlocks ? { unlockedShopSkillCards: shopUnlocks } : {}),
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

  // 商人: サブウェポンを換金(1個=SHOP_SUBWEAPON_SELL_VALUE)。所持していれば外して straps を加算。
  // 職固有スキル(CHARACTER_SUBWEAPON_KEYS)は UI 側で換金対象外にしているのでここは渡された key を素直に売る。
  sellSubWeapon: (key) => {
    let sold = false;
    set(state => {
      if (!state.player.subWeapons.includes(key)) return {};
      sold = true;
      const subWeaponLevels = { ...state.player.subWeaponLevels };
      delete subWeaponLevels[key];
      // 換金=手放す。ショップの解禁(陳列)も外し、Lv1で買い戻せないようにする(社長報告対応)。
      const unlockedShopSkillCards = { ...state.unlockedShopSkillCards };
      delete unlockedShopSkillCards[key];
      return {
        player: {
          ...state.player,
          subWeapons: state.player.subWeapons.filter(k => k !== key),
          subWeaponLevels,
          straps: state.player.straps + SHOP_SUBWEAPON_SELL_VALUE
        },
        unlockedShopSkillCards
      };
    });
    if (sold) {
      const p = get().player;
      get().spawnCallout(p.x + p.width / 2, p.y - 12, `+${SHOP_SUBWEAPON_SELL_VALUE}s`, '#fde68a');
    }
    return sold;
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

  // 武器商人: サークルに3秒連続滞在で話しかける(社長指示v0.25.1842・旧スイング開店を置換)。
  // useGameLoopがsim毎フレーム呼ぶ。紅き夜中は「やり過ごした」(旧スイング時の挙動を移植)。
  updateMerchantDwell: (deltaMs) => {
    const s = get();
    const { weaponMerchant, player } = s;
    const pcx = player.x + player.width / 2;
    const pcy = player.y + player.height / 2;
    const mdx = weaponMerchant.x - pcx;
    const mdy = weaponMerchant.y - pcy;
    const inCircle = mdx * mdx + mdy * mdy <= weaponMerchant.radius * weaponMerchant.radius;
    if (!inCircle || s.showShopMenu || s.showUpgradeMenu || s.gameTime < s.shopReopenAt) {
      if (s.merchantDwellMs !== 0) set({ merchantDwellMs: 0 });
      return;
    }
    const next = s.merchantDwellMs + deltaMs;
    if (next < MERCHANT_TALK_DWELL_MS) {
      set({ merchantDwellMs: next });
      return;
    }
    set({ merchantDwellMs: 0 });
    if (get().redNight?.phase === 'active') {
      get().skipRedNight();
      set(state => ({
        eventBannerText: 'やり過ごした',
        eventBannerUntil: state.gameTime + 3500,
        hitstopUntil: Date.now() + 450,
      }));
      get().spawnFlash('rgba(0,0,0,0.68)', 500);
      return;
    }
    set({
      showShopMenu: true,
      isPaused: true,
      touchActive: false,
      swipeDirection: null,
      swipeStrength: 1,
    });
    get().spawnRing(weaponMerchant.x, weaponMerchant.y - 26, 12, 58, 'rgba(251,191,36,0.88)', 3, SHOP_INTERACT_RING_MS);
    get().spawnGlow(weaponMerchant.x, weaponMerchant.y - 28, 62, 'rgba(251,191,36,', SHOP_INTERACT_RING_MS);
    get().spawnCallout(weaponMerchant.x, weaponMerchant.y - 70, 'SHOP', '#fde68a');
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
    // 受領(EVENT_QUEST_DESIGN.md): 強制が未納品(ステージ1のみ課される)なら強制、
    // 納品済み(または最初からクリア済み扱い=3/4)ならサブを受ける。
    // 強制の受領時は「二人と反対側の研究対象区域」にネームド(パンプキンか犬・宿敵と同じ個体強化)を配置。
    const stageId = getSelectedStageId();
    const cfg = getEventQuestConfig(stageId);
    if (!cfg) return; // 設定なしステージでは二人が出ない(resetGateでgone)ため来ないはずの保険
    if (cfg.encounterOnly) return; // 遭遇のみ(stage-5)は completeEventEncounter 経路。ここには来ない保険
    const forcedPending = cfg.forced && !getEventQuestMeta(stageId).forced;
    if (forcedPending) {
      const q = get().eventQuestNpc;
      const pos = questNamedSpawnPos(q.x, q.y);
      const e = spawnEnemyAt(pickQuestNamedType(cfg), pos.x, pos.y, get().gameTime);
      e.questTarget = true;
      e.questName = pickNamedEnemyName();
      e.health = Math.round(e.health * NAMED_HP_MULT);
      e.maxHealth = Math.round(e.maxHealth * NAMED_HP_MULT);
      e.damage = Math.round(e.damage * NAMED_DMG_MULT);
      e.width = Math.round(e.width * NAMED_SIZE_MULT);
      e.height = Math.round(e.height * NAMED_SIZE_MULT);
      // 中心を指定位置に合わせ、起動するまで定位置で待機(注意誘導はしない=近づいたらマーク・社長裁定#7)。
      e.x = pos.x - e.width / 2;
      e.y = pos.y - e.height / 2;
      e.vx = 0; e.vy = 0;
      e.dormant = true;
      e.aggroRange = QUEST_NAMED_AGGRO_RANGE;
      e.homeX = e.x; e.homeY = e.y;
      get().addEnemy(e);
    }
    set(state => ({
      showEventQuestMenu: false,
      isPaused: false,
      eventQuestNpc: {
        ...state.eventQuestNpc,
        status: 'accepted',
        dwellMs: 0,
        leftSinceAccept: false
      },
      eventQuestActive: forcedPending ? 'forced' : 'sub',
      eventQuestKills: 0,
      eventQuestGoalCount: forcedPending ? 1 : cfg.sub.count,
      eventQuestGoalTier: forcedPending ? null : cfg.sub.tier,
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
    // 納品(EVENT_QUEST_DESIGN.md): 報酬ゴールド(永続残高へ即時)+段階を永続記録。
    //  ・強制納品 → forcedフラグ+次ステージ解放同期(城ボスフラグと揃えばクリア扱い)。
    //    二人は残り、サブの受付(available)へ戻る(一度離れてから再滞在3秒で受注)。
    //  ・サブ納品 → subフラグ=以後そのステージに二人は出現しない。そのプレイでは消さない
    //    (fadeStartedAtは立てず立ち姿のまま・以後何も起きない)。
    const stageId = getSelectedStageId();
    const active = get().eventQuestActive;
    // スキル: ゴールドラッシュ(§6.10 M33⑪) = 永続ゴールド獲得 ×1.2/1.35/1.5(Lv・四捨五入)。
    get().addGold(Math.round(EVENT_QUEST_REWARD_GOLD * skillGoldRushMult(get().player)));
    const meta = getEventQuestMeta(stageId);
    if (active === 'forced') {
      setEventQuestMeta(stageId, { ...meta, forced: true });
      syncQuestStageClear(stageId);
      set(state => ({
        eventQuestNpc: {
          ...state.eventQuestNpc,
          status: 'available',
          dwellMs: 0,
          leftSinceAccept: false
        },
        eventQuestActive: null,
        eventQuestKills: 0,
        eventQuestGoalCount: 0,
        eventQuestGoalTier: null
      }));
    } else {
      setEventQuestMeta(stageId, { ...meta, sub: true });
      set(state => ({
        eventQuestNpc: {
          ...state.eventQuestNpc,
          status: 'completed',
          dwellMs: 0
        },
        eventQuestActive: null,
        eventQuestKills: 0,
        eventQuestGoalCount: 0,
        eventQuestGoalTier: null
      }));
    }
  },
  
  // Enemy actions
  addEnemy: (enemy) => {
    // v0.25.1342: 型別の出現数を記録(全スポーン経路の合流点)。バッチ4の苦戦判定を
    // 「出現したのにキルが少ない」にするための計測(挙動には影響しない)。
    recordSpawn(enemy.type);
    set(state => ({
      enemies: [...state.enemies, enemy]
    }));
    // PACING_PUZZLE.md §5.23 M22 B1: レア/ネームド個体の湧き時フラッシュ(M15の「レアが見えない」
    // 積み残しも同時回収)。全スポーン経路がこのaddEnemyを通るのでここ1箇所で拾える。
    if (SPAWNFX_ENABLED && (enemy.colorTier || enemy.isNamed)) {
      const cx = enemy.x + enemy.width / 2;
      const cy = enemy.y + enemy.height / 2;
      const color = enemy.isNamed ? NAMED_FX_COLOR : ENEMY_COLOR_TIER_FX[enemy.colorTier as EnemyColorTier];
      get().spawnRing(cx, cy, 6, 90, `${color}0.8)`, 3, 380);
      get().spawnGlow(cx, cy, 40, color, 260);
    }
  },
  
  removeEnemy: (id) => {
    set(state => ({
      enemies: state.enemies.filter(enemy => enemy.id !== id)
    }));
  },
  
  damageEnemy: (id, amount, _nonLethalBoss = false, crit = false, viaMeleeFinish = false, damageChannel = 'other') => {
    let killed = false;
    let reaperDefeated: { x: number; y: number } | null = null; // 死神撃破=スキル「死神」を習得(社長指示)
    let bossFullStunAt: { x: number; y: number } | null = null; // 裏ボスが完全気絶(紫)に移行した位置(set後に紫FX)
    let namedFoeKilled: Enemy | null = null; // §5.14 M13: 宿敵討伐(set後にREVENGE演出+報酬)
    let deathPopAt: { ex: number; ey: number; fromX: number; fromY: number } | null = null; // §5.23 M22 A3(set後に発火)
    let dramaticDeathAt: { enemy: Enemy; x: number; y: number } | null = null; // juice: FF風クランブル(set後に発火)
    let appliedDamage = 0; // §6.21 M46計測用: 実際に加算された生ダメージ(HP床クランプ前・紅き夜補正後=既存damageDealtと同値)

    set(state => {
      const { enemies, gameStats } = state;
      const enemy = enemies.find(e => e.id === id);

      if (!enemy) return { enemies };

      // ジャンプ攻撃で敵が空中(aiPhase==='jump')の間は無敵。被弾もヒット表示もしない。
      // 溜め(crouch)・着地後(recover)は通常どおり被弾する(空中だけ無敵)。
      if (enemy.aiPhase === 'jump') return { enemies };

      // 紅き夜中は敵HP実質2倍(プレイヤーダメージを半分に落とす)。
      const eff = (state.redNight?.phase === 'active' || RN_ENEMY_FORCE) ? Math.max(1, Math.floor(amount / 2)) : amount;
      appliedDamage = eff; // §6.21 M46計測用(set後にchannel別加算)
      let newHealth = Math.max(0, enemy.health - eff);
      // nonLethalBoss: 廃止(v0.25.1571) 爆発もボスを倒せる。互換のため引数は残置
      // PACING_PUZZLE.md §5.21-追補4: ゲート1台本/ゲート2ボス(finishKillOnly)は近接フィニッシュ
      // 経由(viaMeleeFinish)以外ではHPを0にできない(HP1で踏みとどまる)。
      newHealth = clampFinishKillOnlyHealth(enemy.finishKillOnly, newHealth, viaMeleeFinish);
      // 裏ボス: クリを規定回数当てると完全気絶(紫)。倒しきれなかったクリのみカウント。
      const critBump = (crit && newHealth > 0) ? bumpBossCrit(enemy, state.gameTime) : null;
      if (critBump?.triggered) bossFullStunAt = { x: enemy.x + enemy.width / 2, y: enemy.y + enemy.height / 2 };
      const updatedEnemies = enemies.map(e =>
        e.id === id ? { ...e, health: newHealth, lastHit: Date.now(), ...(critBump?.patch ?? {}) } : e
      );
      
      // Check if enemy was killed
      if (newHealth === 0) {
        killed = true;
        if (enemy.type === 'reaper') reaperDefeated = { x: enemy.x + enemy.width / 2, y: enemy.y }; // 死神撃破→習得
        if (enemy.isNamed) namedFoeKilled = enemy; // §5.14 M13: 宿敵討伐
        // juice: FF風クランブル統一演出(ネームド/裏ボス/giantbat/hunter討伐)。銃/接触/爆発キル経路。
        if (getsDramaticDeath(enemy)) dramaticDeathAt = { enemy, x: enemy.x + enemy.width / 2, y: enemy.y + enemy.height / 2 };
        deathPopAt = {
          ex: enemy.x + enemy.width / 2, ey: enemy.y + enemy.height / 2,
          fromX: state.player.x + state.player.width / 2, fromY: state.player.y + state.player.height / 2,
        }; // §5.23 M22 A3: 銃/接触/爆発キルの死亡ポップ
        tagRemove(id, 'kill'); // 消失ログ用: 通常撃破
        // PACING_REDESIGN.mdバッチ2(計測): ガン/接触/爆発キルを種別+スタイル集計へ記録(挙動には影響しない)。
        // バッチ3.5-Bの追補: 型ごとの最終キル時刻も記録(問題児リフラクトリ判定用)。
        recordKill(enemy.type, 'gun', state.gameTime);
        // 二人組クエストのキル進捗(EVENT_QUEST_DESIGN.md)。銃/接触/爆発キル経路。
        const questKillNext = questKillProgress(state.eventQuestActive, state.eventQuestGoalTier, state.eventQuestKills, enemy);

        // Update game stats
        const newStats = {
          ...gameStats,
          enemiesKilled: gameStats.enemiesKilled + 1,
          damageDealt: gameStats.damageDealt + eff,
          eliteKills: gameStats.eliteKills + (isScoreElite(enemy.type) ? 1 : 0), // 銃/弾でのpumpkin撃破も計上
          bossKills: gameStats.bossKills + (isScoreBoss(enemy.type) ? 1 : 0)     // 同 giantbat
        };

        return {
          enemies: updatedEnemies.filter(e => e.id !== id),
          gameStats: newStats,
          ...(questKillNext !== null ? { eventQuestKills: questKillNext } : {}),
          // The giantbat is the run's finale boss — defeating it triggers the return phase.
          // ただし囲い系イベントのミニボス(fromEvent)は finale ではないので除外。即勝利せず帰還サークルへ。
          finaleDefeated: state.finaleDefeated || (enemy.type === 'giantbat' && !enemy.fromEvent),
          // 叫喚型(screamer)を倒したら強化バフを即座に打ち切る(社長指示)。残り時間を待たず即失効。
          ...screamerBuffCutOnKillPatch([enemy.type], state.screamerBuffUntil, state.gameTime),
        };
      }

      return {
        enemies: updatedEnemies,
        gameStats: {
          ...gameStats,
          damageDealt: gameStats.damageDealt + eff
        }
      };
    });

    // §6.21 M46: プレイヤー起因ダメージの計測(channel別)。damageChannel=null(護衛NPC弾等・
    // プレイヤー起因ではない)は加算しない。appliedDamage=0(対象なし/ジャンプ無敵で何も起きなかった)は
    // 加算してもスカラー0で無害。
    if (damageChannel !== null) recordDamageDealt(damageChannel, appliedDamage);

    // 裏ボスが完全気絶(紫)に移行: 紫の衝撃リング＋発光＋コールアウトで知らせる。
    if (bossFullStunAt) {
      const p = bossFullStunAt as { x: number; y: number };
      get().spawnRing(p.x, p.y, 12, 210, 'rgba(168,85,247,0.85)', 5, 520);
      get().spawnRing(p.x, p.y, 6, 130, 'rgba(216,180,254,0.9)', 3, 360);
      get().spawnGlow(p.x, p.y, 130, 'rgba(168,85,247,', 620);
      get().spawnCallout(p.x, p.y - 24, 'STUN!', '#d8b4fe', { bg: 0x6b21a8 });
    }

    // 死神を倒したらスキル「死神」を習得(ガチャ非排出。撃破でのみ解禁)。未所持時のみ告知。
    if (reaperDefeated) {
      const already = get().ownedSkills.includes('reaper');
      get().grantSkill('reaper');
      // 歴史年表: 死神討伐を即載せ(社長決定v0.25.1628。スキル付与と同じA方式=撃破の瞬間に永続)。
      recordChronicle(getSelectedStageId(), 'reaper', 'reaper', '死神を討伐');
      if (!already) {
        const p = reaperDefeated as { x: number; y: number };
        get().spawnCallout(p.x, p.y - 20, 'スキル「死神」習得！', '#c084fc', { scale: 1.2 });
      }
    }

    // §5.14 M13: 宿敵を銃/接触/爆発で討伐(REVENGE演出+報酬+成仏)。
    if (namedFoeKilled) {
      const ne = namedFoeKilled as Enemy;
      resolveNamedFoeDefeat(get, [ne], ne.x + ne.width / 2, ne.y + ne.height / 2);
    }

    // juice: FF風クランブル統一演出。銃/接触/爆発キル経路。
    if (dramaticDeathAt) {
      const d = dramaticDeathAt as { enemy: Enemy; x: number; y: number };
      triggerDramaticDeath(get, d.enemy, d.x, d.y);
    }

    // §5.23 M22 A3: 銃/接触/爆発キルの死亡ポップ。
    if (deathPopAt && DEATHPOP_ENABLED) {
      const d = deathPopAt as { ex: number; ey: number; fromX: number; fromY: number };
      spawnDeathPop(get, d.ex, d.ey, d.fromX, d.fromY);
    }

    return killed;
  },

  spawnSkadiIce: (x, y, bornAt, fireAt, enemyId) => set(s => ({
    skadiIceMarkers: [...s.skadiIceMarkers, { id: `sice${skadiHazardSeq++}`, x, y, bornAt, fireAt, enemyId }],
  })),
  spawnSkadiBlade: (x, y, angle, launchAt, enemyId, visual = 'ice') => set(s => ({
    skadiIceBlades: [...s.skadiIceBlades, { id: `sbld${skadiHazardSeq++}`, x, y, angle, launchAt, launched: false, vx: 0, vy: 0, expireAt: 0, enemyId, visual }],
  })),

  enqueueNpcDialogue: (lines) => {
    if (!lines.length) return;
    set(s => ({ npcDialogueQueue: [...s.npcDialogueQueue, ...lines] }));
  },
  // 表示中が寿命切れなら消し、空いていてキューがあれば次を出す(時間停止なし)。変化があった時だけ set。
  updateNpcDialogue: (gameTime) => {
    const s = get();
    let cur = s.npcDialogue;
    let queue = s.npcDialogueQueue;
    let nextAt = s.npcDialogueNextAt;
    let changed = false;
    if (cur && gameTime >= cur.until) { cur = null; nextAt = gameTime + NPC_DIALOGUE_GAP_MS; changed = true; }
    if (!cur && queue.length > 0 && gameTime >= nextAt) {
      const head = queue[0];
      cur = { ...head, until: gameTime + NPC_DIALOGUE_MS }; // portrait等の追加フィールドも素通しで引き継ぐ
      queue = queue.slice(1);
      changed = true;
    }
    if (changed) set({ npcDialogue: cur, npcDialogueQueue: queue, npcDialogueNextAt: nextAt });
  },
  npcKillReact: (x, y) => {
    const s = get();
    if (s.farBackdrop === 'tutorial') return; // チュートリアル: 随行NPCの汎用セリフは全停止(イベントで特別に組む)
    let best: EscortSoldier | null = null; let bd = NPC_KILL_MAX_DIST * NPC_KILL_MAX_DIST;
    for (const e of s.escorts) {
      const d = (e.x - x) * (e.x - x) + (e.y - y) * (e.y - y);
      if (d < bd) { bd = d; best = e; }
    }
    if (!best) return;
    const sol = BASE_SOLDIERS[best.soldierIndex % BASE_SOLDIERS.length];
    get().tryNpcLine(sol.name, 'npcKill', pickNpcLine(best.soldierIndex, 'npcKill', sol.npcKill), NPC_KILL_CAT_CD_MS);
  },
  // イベント系クリア地点(x,y)に対応する地域NPC(最寄り拠点担当)が反応。救助成功は「救助者保護(rescueReturned)」を出す。
  npcOpPrepReact: (x, y) => {
    const s = get();
    if (s.escorts.length === 0 || s.farBackdrop === 'tutorial') return; // 護衛NPCが居る出撃のみ(チュートリアルは全停止)
    let bestIdx = -1; let bd = Infinity;
    for (const b of s.baseSites) {
      const d = (b.x - x) * (b.x - x) + (b.y - y) * (b.y - y);
      const idx = parseInt(b.id.split('-')[1] ?? '-1', 10);
      if (d < bd && idx >= 0) { bd = d; bestIdx = idx; }
    }
    if (bestIdx < 0) return;
    // 最寄り拠点(sector=bestIdx)に配属された護衛の「素性(soldierIndex)」でセリフを選ぶ。
    // 名簿はランダム(フェイザーがレアで入る)なので sector 直引きではなく baseId で実体を引く。
    const esc = s.escorts.find(e => e.baseId === `base-${bestIdx}`);
    if (!esc) return;
    const idx = ((esc.soldierIndex % BASE_SOLDIERS.length) + BASE_SOLDIERS.length) % BASE_SOLDIERS.length;
    const sol = BASE_SOLDIERS[idx];
    const line = pickNpcLine(idx, 'rescueReturned', '');
    if (line) get().tryNpcLine(sol.name, 'rescueReturned', line, OP_PREP_CAT_CD_MS);
  },
  npcPraiseReact: () => {
    const s = get();
    if (s.farBackdrop === 'tutorial') return; // チュートリアル: 随行NPCの汎用セリフは全停止
    const p = s.player; const px = p.x + p.width / 2, py = p.y + p.height / 2;
    let best: EscortSoldier | null = null; let bd = PRAISE_WITNESS_DIST * PRAISE_WITNESS_DIST;
    for (const e of s.escorts) {
      const d = (e.x - px) * (e.x - px) + (e.y - py) * (e.y - py);
      if (d < bd) { bd = d; best = e; }
    }
    if (!best) return;
    const sol = BASE_SOLDIERS[best.soldierIndex % BASE_SOLDIERS.length];
    get().tryNpcLine(sol.name, 'praise', pickNpcLine(best.soldierIndex, 'praise', sol.praise), PRAISE_CAT_CD_MS);
  },
  // 担当エリア(セクター)に入った時=その担当NPCが「遠い時用(neglectFar)」コメント(社長指示・#1と連動)。
  npcAreaEnterReact: (sectorIdx) => {
    const s = get();
    if (s.escorts.length === 0 || s.farBackdrop === 'tutorial') return; // 護衛NPCが居る出撃のみ(チュートリアルは全停止)
    // その sector(担当拠点 base-${sectorIdx})に居る護衛の「素性(soldierIndex)」でセリフを選ぶ。
    // 名簿はランダム(フェイザーがレアで入る)なので sectorIdx 直引きではなく baseId で実体を引く。
    const esc = s.escorts.find(e => e.baseId === `base-${sectorIdx}`);
    if (!esc) return;
    const idx = ((esc.soldierIndex % BASE_SOLDIERS.length) + BASE_SOLDIERS.length) % BASE_SOLDIERS.length;
    const sol = BASE_SOLDIERS[idx];
    get().tryNpcLine(sol.name, 'neglectFar', pickNpcLine(idx, 'neglectFar', sol.neglectFar), NEGLECT_FAR_CAT_CD_MS);
  },
  tryNpcLine: (name, category, text, categoryCdMs) => {
    const s = get();
    const gt = s.gameTime;
    if (gt - (s.npcSpokeAt[name] ?? -1e9) < NPC_SAME_NPC_CD_MS) return false;       // 同一NPCのCD
    if (gt - (s.npcCatAt[category] ?? -1e9) < categoryCdMs) return false;            // 同一カテゴリのCD
    if (s.npcDialogueQueue.length >= 3) return false;                                // 詰まり防止。表示1+キュー最大3=同フレームに複数イベント(拠点解放+包囲+救助等)が重なっても取りこぼさず順次再生。各カテゴリ/同一NPCのCDで連発は別途抑止
    set({
      npcDialogueQueue: [...s.npcDialogueQueue, { name, text }],
      npcSpokeAt: { ...s.npcSpokeAt, [name]: gt },
      npcCatAt: { ...s.npcCatAt, [category]: gt },
    });
    return true;
  },

  updateEnemies: (deltaTime) => {
    let pumpkinLanded = false; // パンプキン着地を検出して set 後に画面揺れを出す(set内でのネスト発火回避)
    const pumpkinBlasts: { x: number; y: number; radius: number; damage: number; enemyId: string; ice?: boolean }[] = []; // 着地爆発イベント(ice=スカジ氷=青FX)
    const shieldBlocks: { x: number; y: number; kind: 'jump' | 'dash' }[] = []; // シールドで防いだ瞬間の接触点(FX/SE用)
    const punisherHits: string[] = []; // パニッシャー: 巻き込んだ敵の id(set 後に近接半分ダメージを適用)
    let punisherDmg = 0;               // 近接ダメージの半分(set 内で算出)
    const layingEggs: BreakableProp[] = []; // 抱卵型(旧ghost)がこのフレームに設置する緑卵(mine)。set 内で breakableProps へマージ。
    const screamerActivatedAt: { x: number; y: number }[] = []; // 叫喚型がこのフレームに溜め完了=発動した位置(set 後に FX/SE/揺れ)。
    const screamerWindupAt: { x: number; y: number }[] = [];     // 叫喚型がこのフレームに溜め開始した位置(set 後に予兆FX)。
    set(state => {
      const { enemies, player, gameTime, breakableProps, summons, rescueSurvivors } = state;
      // フレアガン(§6.6 M29): 着弾中のフレアを疑似召喚として敵ターゲット解決へ合流
      // (召喚と完全に同じ効き方=専用ヘイト機構なし)。ループ外で一度だけ合成する。
      const flareTargets = state.flareGunFlares.length > 0 ? activeFlareTargets(state.flareGunFlares, gameTime) : [];
      const targetSummons = flareTargets.length > 0 ? [...summons, ...flareTargets] : summons;
      const solidProps = breakableProps.filter(p => p.type !== 'mine' && p.type !== 'uv-bar');
      const now = Date.now();
      // 特殊攻撃(突進/ジャンプ)の溜め・CD・動作を ENEMY_ATTACK_SPEED_MULT 倍速にする。
      // gameTime からの残り時間を 1/MULT に短縮(=攻撃が速く出る)。1.0で従来等速に戻る。
      const atkUntil = (ms: number) => gameTime + ms / ENEMY_ATTACK_SPEED_MULT;
      const pcx = player.x + player.width / 2;
      const pcy = player.y + player.height / 2;
      const indoor = state.indoorMode;
      // 紅き夜中は全敵スピード2倍。
      const rnSpeedMult = (state.redNight?.phase === 'active' || RN_ENEMY_FORCE) ? 2 : 1;
      // 叫喚型(screamer)の強化窓が有効か。通常敵(ボス/screamer以外)の移動速度を×SCREAMER_BUFF_MULT する。
      const screamActive = gameTime < state.screamerBuffUntil;
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
      // 研究所スキンの遮蔽プロップ(パソコン/割れたカプセル等)。プレイヤーは当たり判定済み=敵にも適用(すり抜け防止)。
      const labPropRects = labTheme
        ? labPropsInRegion(pcx - state.gameBounds.width, pcy - state.gameBounds.height, pcx + state.gameBounds.width, pcy + state.gameBounds.height).map(propRect)
        : [];
      // 視線/移動の遮蔽物: 屋内=lab壁 / 研究所スキン=壁オブジェクト＋遮蔽プロップ / 森=なし。
      // 研究所スキンはプロップ(パソコン/カプセル等)も視線を遮る=休眠敵がプロップ越しに起床しないよう壁と同様に含める
      // (移動/近接の視線判定は既に両方を含めている。視線だけ壁のみだった取りこぼしを統一)。
      const losWalls = indoor ? indoorWalls : (labTheme ? [...labWallRects, ...labPropRects] : labWallRects);

      const updatedEnemies = enemies.map((enemy): Enemy => {
        // 裏ボス(mimir/jormungand)は updateEnemies の追跡AIから除外。移動/攻撃/帰巣/再生は
        // useGameLoop の専用コントローラが座標を直接書き込む(死神と同じ方式)。
        if (isHiddenBoss(enemy.type)) return enemy;
        // ハンター変異体・撤退中は通常追跡AIから除外。専用イベントコントローラ(useGameLoop)が
        // プレイヤーから離れる方向へ移動させ画面外で消す。索敵中(dormant)は下の dormant ブロックで静止。
        if (enemy.type === 'hunter' && enemy.hunterFleeing) return enemy;
        // 叫喚型の強化対象判定: 通常敵(ボス/screamer以外)だけ移動速度を×SCREAMER_BUFF_MULT。
        const screamSpeedMult = (screamActive && enemy.type !== 'screamer' && !isBossType(enemy.type)) ? SCREAMER_BUFF_MULT : 1;
        // 衝突解決して移動先を返す(各AIで共用)。屋内は labMap の壁、屋外は木/松明+壁(研究所スキンは壁のみ)。
        const resolveMove = (nx: number, ny: number) => {
          let pos: { x: number; y: number };
          if (indoor) {
            pos = resolveAabb({ x: nx, y: ny, width: enemy.width, height: enemy.height }, indoorWalls);
          } else {
            const tr = labTheme ? { x: nx, y: ny } : resolveTreeCollision({ x: nx, y: ny, width: enemy.width, height: enemy.height });
            const torchR = resolveTorchCollision({ x: tr.x, y: tr.y, width: enemy.width, height: enemy.height }, solidProps);
            // 城(屋外・非ラボ)も敵にブロック(プレイヤーと同じ。従来は敵だけすり抜けていた)。
            const castleR = (labTheme || state.farBackdrop === 'tutorial') ? torchR : resolveCastleCollision({ x: torchR.x, y: torchR.y, width: enemy.width, height: enemy.height }, state.castleEvent);
            // ラボ壁＋ラボプロップ(研究所スキン)。labProps も敵に当たり判定(従来は壁のみ=プロップすり抜け)。
            const labRects = labTheme ? [...labWallRects, ...labPropRects] : labWallRects;
            const wallR = labRects.length
              ? resolveAabb({ x: castleR.x, y: castleR.y, width: enemy.width, height: enemy.height }, labRects)
              : castleR;
            // 街/雪原プロップ(バス/塔/トラック等)は敵にも当たり判定(プレイヤーと同じ)。森等カタログ無しは即return=no-op。
            pos = resolveCityPropCollision(state.farBackdrop, { x: wallR.x, y: wallR.y, width: enemy.width, height: enemy.height });
          }
          // 帰還サークルには敵を入れない: 中心から radius+敵サイズ分の外へ押し出す(セーフゾーン)。
          const rc = state.returnCircle;
          if (rc) {
            const ecx = pos.x + enemy.width / 2, ecy = pos.y + enemy.height / 2;
            const dx = ecx - rc.x, dy = ecy - rc.y;
            const dist = Math.hypot(dx, dy);
            const minDist = rc.radius + Math.max(enemy.width, enemy.height) * 0.4;
            if (dist < minDist) {
              const ang = dist > 0.001 ? Math.atan2(dy, dx) : Math.random() * Math.PI * 2;
              pos = { x: rc.x + Math.cos(ang) * minDist - enemy.width / 2, y: rc.y + Math.sin(ang) * minDist - enemy.height / 2 };
            }
          }
          // 囲い系イベント中: イベント敵(fromEvent)を囲い円の中に閉じ込める(社長報告のバグ修正)。
          // パンプキン等は射程外へ距離を取るため円の外=地平線の上(透明化ゾーン)へ出て見えなくなり、
          // fromEvent が 0 にならず「誰もいないのに終わらない(時間切れ待ち)」状態になっていた。プレイヤー同様アリーナに閉じ込める。
          const ae = state.activeEvent;
          if (ae && enemy.fromEvent) {
            const ecx2 = pos.x + enemy.width / 2, ecy2 = pos.y + enemy.height / 2;
            const dx2 = ecx2 - ae.x, dy2 = ecy2 - ae.y;
            const d2 = Math.hypot(dx2, dy2);
            const maxDist = ae.radius - Math.max(enemy.width, enemy.height) * 0.4; // 縁の内側に収める
            if (d2 > maxDist && d2 > 0.001) {
              pos = { x: ae.x + (dx2 / d2) * maxDist - enemy.width / 2, y: ae.y + (dy2 / d2) * maxDist - enemy.height / 2 };
            }
          }
          return pos;
        };
        // 攻撃モーションを「全う」するフェーズの扱い(社長指示・更新):
        // ・どの敵も「攻撃モーションに入ったら(aiPhase あり=溜め/zpause/zrush/突進/ジャンプ等)やり切る」。
        //   →通常ノックバックでは中断しない(範囲外に押し出されても完遂する)。= inAttackMotion ガード。
        // ・例外として気絶(stun)/パリィは中断できる: stun は committed(空中ジャンプ/突進中)以外を解除、
        //   パリィは aiPhase を先に解除してから弾くのでこのガードに掛からない。
        // committed = 中断不可の実行中(空中ジャンプ・ダッシュ突進)。stun/lift もこの間は受け付けない。
        const committed = enemy.aiPhase === 'jump' || enemy.aiPhase === 'charge';
        const inAttackMotion = enemy.aiPhase !== undefined; // 溜め/予備動作も含む=ノックバックで中断しない

        // Knockback overrides chase AI: while it's active, slide outward
        // with linearly-decaying velocity instead of seeking the player.
        // ただし攻撃モーション中(inAttackMotion)はノックバックで中断/スライドさせない(やり切る)。
        if (!inAttackMotion && enemy.knockbackUntil && now < enemy.knockbackUntil) {
          const remaining = enemy.knockbackUntil - now;
          const decay = Math.max(0, remaining / KNOCKBACK_DURATION); // 1 → 0
          const kb = resolveMove(
            enemy.x + (enemy.knockbackVx ?? 0) * decay * deltaTime,
            enemy.y + (enemy.knockbackVy ?? 0) * decay * deltaTime,
          );
          // ノックバック(カウンター等)の吹き飛び先を画面外リサイクル境界の内側にクランプする(案A)。
          // runOffscreenRecycleAndCull (directorTick.ts) と同じ境界計算をここで複製し、境界を
          // 越えた瞬間に次フレームでリサイクルされて「カウンターした敵が消える」不具合を防ぐ。
          // 通常の追跡AI(このifブロックの外)には影響しない。
          const recycleZoomOverscan = (labTheme || indoor) ? 1 : 1 / CONTEXT_ZOOM_MIN;
          const recycleHalfW = (state.gameBounds.width / 2) * recycleZoomOverscan + OFFSCREEN_RECYCLE_MARGIN;
          const recycleHalfH = (state.gameBounds.height / 2) * recycleZoomOverscan + OFFSCREEN_RECYCLE_MARGIN;
          const bufferX = enemy.width;  // 境界ぎりぎりではなく内側へ余裕を持って着地させる
          const bufferY = enemy.height;
          const kbCenterX = kb.x + enemy.width / 2;
          const kbCenterY = kb.y + enemy.height / 2;
          const clampedCenterX = Math.max(pcx - (recycleHalfW - bufferX), Math.min(pcx + (recycleHalfW - bufferX), kbCenterX));
          const clampedCenterY = Math.max(pcy - (recycleHalfH - bufferY), Math.min(pcy + (recycleHalfH - bufferY), kbCenterY));
          return { ...enemy, x: clampedCenterX - enemy.width / 2, y: clampedCenterY - enemy.height / 2 };
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
          if (!seen) {
            // ハンター変異体は索敵中も静止せず、低速の「徘徊」で移動する(社長指示: ランダムっぽく
            // 見せて実はプレイヤーへじわじわ接近)。純関数(src/utils/hunterWander.ts)へ切り出し済み。
            // ただし立ち去りフェード中(hunterLeavingAt設定済み)はその場で静止する。
            if (enemy.type === 'hunter' && enemy.hunterLeavingAt === undefined) {
              const priorWander = (enemy.hunterWanderTargetX !== undefined && enemy.hunterWanderTargetY !== undefined && enemy.hunterWanderNextAt !== undefined)
                ? { wanderTargetX: enemy.hunterWanderTargetX, wanderTargetY: enemy.hunterWanderTargetY, wanderNextAt: enemy.hunterWanderNextAt }
                : null;
              const { vx, vy, wander } = hunterWanderStep(ecx2, ecy2, enemy.speed, pcx, pcy, gameTime, priorWander);
              const pos = resolveMove(enemy.x + vx * deltaTime, enemy.y + vy * deltaTime);
              return {
                ...enemy, x: pos.x, y: pos.y, vx, vy,
                hunterWanderTargetX: wander.wanderTargetX, hunterWanderTargetY: wander.wanderTargetY, hunterWanderNextAt: wander.wanderNextAt,
              };
            }
            return { ...enemy, vx: 0, vy: 0 };
          }
          return { ...enemy, dormant: false, vx: 0, vy: 0 };
        }

        // ステージ2(研究所)の索敵解除(社長指示v0.25.1757→v0.25.2064変更・純関数=labStealth.ts):
        // 起床中の敵が【画面外(プレイヤー中心の可視域+マージン)】へ出た瞬間に見失って再休眠。
        // 再発見は上のdormantブロック(視界300px+視線)。画面外で寝る↔視界300pxで起きるの間に
        // マージンぶんの隙間があり点滅しない。ラボのlab-zombie限定=他ステージ・他の敵は不変。
        // ステージ2はズーム引き無効(recycleZoomOverscan=1)なので可視域=gameBoundsそのまま。
        if (labTheme && enemy.type.startsWith('lab-zombie')) {
          const ecx3 = enemy.x + enemy.width / 2;
          const ecy3 = enemy.y + enemy.height / 2;
          if (isLabOffscreenLost(ecx3 - pcx, ecy3 - pcy, state.gameBounds.width / 2, state.gameBounds.height / 2)) {
            return {
              ...enemy, dormant: true, vx: 0, vy: 0,
              aiPhase: undefined, aiPhaseUntil: undefined, aiStartedAt: undefined,
              aiTargetX: undefined, aiTargetY: undefined, aiFromX: undefined, aiFromY: undefined,
              aiReadyAt: undefined,
            };
          }
        }

        // 裏ボスが追いかけてきている間は、通常の敵もボスも全員プレイヤーから一斉に逃走する(社長指示)。
        // 攻撃AI(溜め/突進/ジャンプ等)は中断し、プレイヤーと反対方向へ通常速度で離れる。裏ボス自身は上で除外済み。
        // 併せて「囲いに囲まれるイベント(プレイヤーを円に閉じ込める=rescue以外の囲い系)」中も、外の通常敵
        // (イベント敵=fromEvent は除く)を同じ逃走モードにする(社長指示)。→ 外の敵がイベント円へ寄って来ない。
        // PACING_PUZZLE.md §5.21-追補3(社長決定v0.25.1546): ゲート1は permeable=true でこの逃走モードを
        // 無効化する(サークルを敵に"入り自由"にし、通常沸きのchaffが境界を越えて円内へ流れ込めるようにする)。
        const arenaConfiningFlee = state.activeEvent != null && state.activeEvent.kind !== 'rescue' && !state.activeEvent.permeable;
        if (state.bossChasing || (arenaConfiningFlee && !enemy.fromEvent)) {
          const ecx = enemy.x + enemy.width / 2, ecy = enemy.y + enemy.height / 2;
          const fx = ecx - pcx, fy = ecy - pcy;
          const fl = Math.hypot(fx, fy) || 1;
          const fvx = (fx / fl) * enemy.speed * rnSpeedMult * screamSpeedMult, fvy = (fy / fl) * enemy.speed * rnSpeedMult * screamSpeedMult;
          const fmoved = resolveMove(enemy.x + fvx * deltaTime, enemy.y + fvy * deltaTime);
          return { ...enemy, vx: fvx, vy: fvy, x: fmoved.x, y: fmoved.y, aiPhase: undefined, aiPhaseUntil: 0 };
        }

        // ダッシュ(突進)AI: 溜め中に「赤ライン」で移動先(直線距離)を予告→確定した狙い点へ3倍速で直進(曲がらない)。
        // 犬型(werewolf)・研究所Lv2(lab-zombie-2)・ジャイアントバット共通。狙い点は溜め開始時に確定(=赤ラインの終点)。
        // 発動トリガーは werewolf/lab-zombie-2 は射程ベース、giantbat は専用スケジューラ(下)が起動する。
        const isDashType = enemy.type === 'werewolf' || enemy.type === 'lab-zombie-2' || enemy.type === 'giantbat' || enemy.type === 'hunter';
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
              return { ...enemy, vx: 0, vy: 0, aiPhase: undefined, aiReadyAt: atkUntil(WEREWOLF_COOLDOWN_MS + werewolfExtraCd(enemy.type)) };
            }
            // 基本は固定ターゲットへ直進。毎フレームほんの少しだけ現在のプレイヤー位置へ寄せる(弱いホーミング・社長指示)。
            const hpx = pcx - ecx, hpy = pcy - ecy;
            const hl = Math.hypot(hpx, hpy) || 1;
            let cdirx = cdx / cdist + (hpx / hl) * DASH_ATTACK_HOMING;
            let cdiry = cdy / cdist + (hpy / hl) * DASH_ATTACK_HOMING;
            const cdl = Math.hypot(cdirx, cdiry) || 1;
            cdirx /= cdl; cdiry /= cdl;
            // ジャイアント(giantbat)のダッシュは犬(werewolf)と同じ速度(社長指示v0.25.2062)。
            // 巡航速度70のままでは突進も遅い(70×3=210 vs 犬105×3=315)ため、突進の基準速度だけ犬の値を使う。
            const dashBase = enemy.type === 'giantbat' ? getEnemyBaseSpeed('werewolf') : enemy.speed;
            const cs = dashBase * WEREWOLF_CHARGE_SPEED_MULT * (enemy.type === 'hunter' ? HUNTER_JUMP_DASH_SPEED_MULT : 1); // 3倍速(ハンターは更に×2)・ほぼ直進+弱ホーミング
            const cvx = cdirx * cs, cvy = cdiry * cs;
            const rawX = enemy.x + cvx * deltaTime, rawY = enemy.y + cvy * deltaTime;
            const moved = resolveMove(rawX, rawY);
            // ダッシュ(突進)は「何かにぶつかったら」即キャンセル(社長指示)。盾だけでなく木/プロップ/壁等で
            // resolveMove に押し戻された=衝突。引っかかって 2.8s 突っ立つ問題を解消(その場停止→クールダウン)。
            const hitShield = shieldRects.length > 0 &&
              shieldRects.some(s => rectsOverlap({ x: moved.x, y: moved.y, width: enemy.width, height: enemy.height }, s));
            const blocked = Math.abs(moved.x - rawX) > 0.5 || Math.abs(moved.y - rawY) > 0.5;
            if (hitShield || blocked) {
              if (hitShield) shieldBlocks.push({ x: moved.x + enemy.width / 2, y: moved.y + enemy.height / 2, kind: 'dash' });
              return { ...enemy, x: moved.x, y: moved.y, vx: 0, vy: 0, aiPhase: undefined, aiReadyAt: atkUntil(WEREWOLF_COOLDOWN_MS + werewolfExtraCd(enemy.type)) };
            }
            return { ...enemy, vx: cvx, vy: cvy, x: moved.x, y: moved.y };
          }
          if (enemy.aiPhase === 'windup') {
            // 溜め中は赤ライン予告(描画側)。狙い点は溜め開始時に確定済み。
            if (gameTime >= (enemy.aiPhaseUntil ?? 0)) {
              return { ...enemy, aiPhase: 'charge', aiPhaseUntil: atkUntil(WEREWOLF_CHARGE_MAX_MS), vx: 0, vy: 0 };
            }
            // ゆっくり後退り(プレイヤーから離れる方向)してからダッシュ(社長指示)。壁/木はすり抜けず resolveMove で止める。
            const bdx = ecx - pcx, bdy = ecy - pcy;
            const bl = Math.hypot(bdx, bdy) || 1;
            const back = enemy.speed * DASH_WINDUP_BACKSTEP_MULT * deltaTime;
            const moved = resolveMove(enemy.x + (bdx / bl) * back, enemy.y + (bdy / bl) * back);
            return { ...enemy, x: moved.x, y: moved.y, vx: (bdx / bl) * enemy.speed * DASH_WINDUP_BACKSTEP_MULT, vy: (bdy / bl) * enemy.speed * DASH_WINDUP_BACKSTEP_MULT };
          }
          if (enemy.type !== 'giantbat' && enemy.type !== 'hunter' && dist <= WEREWOLF_TRIGGER_RANGE && dist > 12 && gameTime >= (enemy.aiReadyAt ?? 0)) {
            // 溜め開始時に狙い点を確定(=赤ラインの終点)。
            // 突進距離 = プレイヤーまでの距離 + 80px(プレイヤーの少し先で止まる。社長指示)。
            const reach = dist + DASH_OVERSHOOT_PX;
            return { ...enemy, aiPhase: 'windup', aiPhaseUntil: atkUntil(WEREWOLF_WINDUP_MS), aiFromX: enemy.x, aiFromY: enemy.y, aiTargetX: ecx + ((pcx - ecx) / dist) * reach, aiTargetY: ecy + ((pcy - ecy) / dist) * reach, vx: 0, vy: 0 };
          }
          // それ以外は通常チェイス(下へフォールスルー)。
        }

        // パンプキン(pumpkin)ジャンプ攻撃AI: 少し外で縮み溜め(3秒)→1秒でその時のプレイヤー位置へ着地→1秒停止。
        // 研究所Lv3(lab-zombie-3)もパンプキンと同じ挙動。ジャイアントバットも同じジャンプ着地攻撃を流用(社長指示)。
        // トリガーは pumpkin/lab-zombie-3 は射程ベース、giantbat は専用スケジューラ(下)が起動する。
        if (enemy.type === 'pumpkin' || enemy.type === 'lab-zombie-3' || enemy.type === 'giantbat' || enemy.type === 'hunter') {
          const ecx = enemy.x + enemy.width / 2;
          const ecy = enemy.y + enemy.height / 2;
          const dist = Math.hypot(pcx - ecx, pcy - ecy);
          if (enemy.aiPhase === 'crouch') {
            if (gameTime >= (enemy.aiPhaseUntil ?? 0)) {
              // 溜め終了 → ジャンプ開始(この瞬間のプレイヤー位置へ。アークは描画側)。
              // ハンターは「視界サークルの外には飛ばない」(社長指示): 溜め中にプレイヤーが視界範囲外へ出ても、
              // 着地は視界サークルの縁までにクランプ(プレイヤーを追って円の外まで飛ばない)。
              let jtx = pcx, jty = pcy;
              if (enemy.type === 'hunter' && dist > HUNTER_VISION_RANGE) {
                const k = HUNTER_VISION_RANGE / (dist || 1);
                jtx = ecx + (pcx - ecx) * k;
                jty = ecy + (pcy - ecy) * k;
              } else if (
                PUMPKIN_JUMP_CAP_ENABLED && (enemy.type === 'pumpkin' || enemy.type === 'lab-zombie-3') &&
                dist > PUMPKIN_JUMP_MAX_DIST
              ) {
                // §5.16 M16: 密着圏で溜めた後に逃げられても、着地は発動位置から最大距離までにクランプ
                // (ハンターの視界サークルクランプと同じ式)。溜め・爆発・行動パターンは不変。
                const k = PUMPKIN_JUMP_MAX_DIST / (dist || 1);
                jtx = ecx + (pcx - ecx) * k;
                jty = ecy + (pcy - ecy) * k;
              }
              return {
                ...enemy, aiPhase: 'jump', vx: 0, vy: 0,
                aiFromX: enemy.x, aiFromY: enemy.y,
                aiTargetX: jtx - enemy.width / 2, aiTargetY: jty - enemy.height / 2,
                aiStartedAt: gameTime, aiPhaseUntil: atkUntil(PUMPKIN_JUMP_MS / (enemy.type === 'hunter' ? HUNTER_JUMP_SPEED_MULT : 1)),
              };
            }
            return { ...enemy, vx: 0, vy: 0 }; // 溜め中は静止(縮みは描画側)
          }
          if (enemy.aiPhase === 'jump') {
            // ジャンプ滞空時間も攻撃倍速で短縮(着地=t>=1。set側 aiPhaseUntil と同じ scaled 値で揃える)。
            const t = Math.max(0, Math.min(1, (gameTime - (enemy.aiStartedAt ?? gameTime)) / (PUMPKIN_JUMP_MS / ENEMY_ATTACK_SPEED_MULT / (enemy.type === 'hunter' ? HUNTER_JUMP_SPEED_MULT : 1))));
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
              return { ...enemy, x: nx, y: ny, vx: 0, vy: 0, aiPhase: 'recover', aiStartedAt: gameTime, aiPhaseUntil: atkUntil(PUMPKIN_RECOVER_MS) };
            }
            if (t >= 1) {
              pumpkinLanded = true; // 着地 → set 後に画面揺れ
              // 着地爆発(範囲狭め)。被弾判定/FX は useGameLoop が pumpkinBlasts を消化して行う。
              pumpkinBlasts.push({ x: tx + enemy.width / 2, y: ty + enemy.height / 2, radius: PUMPKIN_EXPLOSION_RADIUS, damage: enemy.damage, enemyId: enemy.id });
              return { ...enemy, x: tx, y: ty, vx: 0, vy: 0, aiPhase: 'recover', aiPhaseUntil: atkUntil(PUMPKIN_RECOVER_MS) };
            }
            return { ...enemy, x: nx, y: ny, vx: 0, vy: 0 }; // 空中は障害物を飛び越える(衝突無視)
          }
          if (enemy.aiPhase === 'recover') {
            if (gameTime >= (enemy.aiPhaseUntil ?? 0)) {
              return { ...enemy, vx: 0, vy: 0, aiPhase: undefined, aiReadyAt: atkUntil(PUMPKIN_COOLDOWN_MS) };
            }
            return { ...enemy, vx: 0, vy: 0 }; // 着地後1秒停止
          }
          if (enemy.type !== 'giantbat' && enemy.type !== 'hunter' && dist <= PUMPKIN_TRIGGER_RANGE && dist > 12 && gameTime >= (enemy.aiReadyAt ?? 0)) {
            return { ...enemy, aiPhase: 'crouch', aiPhaseUntil: atkUntil(PUMPKIN_CROUCH_MS), vx: 0, vy: 0 };
          }
          // それ以外は通常チェイス(下へフォールスルー)。
        }

        // ジャイアントバットの行動スケジューラ: 待機中(aiPhase無し)に、ジャンプ(約5秒CD)/ダッシュ(約7秒CD)を
        // それぞれのCDが明けたらランダムに発動。弾(約3秒CD)は fire profile 側が別系統で処理。
        if ((enemy.type === 'giantbat' || enemy.type === 'hunter') && !enemy.aiPhase) {
          // 出現直後は少し待ってから行動(即突進しない)。初回だけ初期CDをセット。
          if (enemy.gbDashReadyAt === undefined) {
            return { ...enemy, vx: 0, vy: 0, gbDashReadyAt: atkUntil(2000), gbJumpReadyAt: atkUntil(3500) };
          }
          const ecx = enemy.x + enemy.width / 2, ecy = enemy.y + enemy.height / 2;
          const dist = Math.hypot(pcx - ecx, pcy - ecy);
          const opts: ('dash' | 'jump')[] = [];
          if (gameTime >= (enemy.gbDashReadyAt ?? 0) && dist > 80 && dist < 1000) opts.push('dash');
          // ジャンプ発動距離: ハンターは HUNTER_JUMP_RANGE(=500・社長指示)、他(giantbat)は従来700。
          const jumpRange = enemy.type === 'hunter' ? HUNTER_JUMP_RANGE : 700;
          if (gameTime >= (enemy.gbJumpReadyAt ?? 0) && dist > 40 && dist < jumpRange) opts.push('jump');
          if (opts.length > 0) {
            const pick = opts[Math.floor(Math.random() * opts.length)];
            const jitter = (ms: number) => ms * (0.8 + Math.random() * 0.4);
            if (pick === 'dash') {
              // 突進距離を2倍に(giantbat も同様にオーバーシュート)。
              // ダッシュ頻度を抑える(社長指示): 通常CD(±20%)にランダム追加CD(3〜10秒)を上乗せ=犬と同様。
              return { ...enemy, aiPhase: 'windup', aiPhaseUntil: atkUntil(WEREWOLF_WINDUP_MS), aiFromX: enemy.x, aiFromY: enemy.y, aiTargetX: 2 * pcx - (enemy.x + enemy.width / 2), aiTargetY: 2 * pcy - (enemy.y + enemy.height / 2), vx: 0, vy: 0, gbDashReadyAt: atkUntil(jitter(GIANTBAT_DASH_CD_MS) + (WEREWOLF_EXTRA_CD_MIN_MS + Math.random() * (WEREWOLF_EXTRA_CD_MAX_MS - WEREWOLF_EXTRA_CD_MIN_MS))) };
            }
            return { ...enemy, aiPhase: 'crouch', aiPhaseUntil: atkUntil(PUMPKIN_CROUCH_MS), vx: 0, vy: 0, gbJumpReadyAt: atkUntil(jitter(GIANTBAT_JUMP_CD_MS)) };
          }
          // CD中はフォールスルーして通常チェイス。
        }

        // Plants are nearly stationary — they shuffle slightly toward the
        // player but mostly hold ground and spit seeds. Everything else
        // does the standard VS straight-line chase, but with inertia: the
        // chase velocity eases toward the heading so enemies curve into turns
        // (~0.3s) rather than snapping to face the player.
        // 錬金術: aggro範囲内に通常召喚がいればそれを、いなければプレイヤーを狙う(中心同士)。
        // 救助イベントの攻撃者(escortTarget持ち)は survivor を狙う。ただし「プレイヤーが近接ダメージを
        // 与えた敵(meleeAggro)」はプレイヤーへターゲットを切り替える(社長指示)。死んでいたら最寄りNPCへ。
        // シーカー: プレイヤー半透明中は通常敵(ボス/死神/イベントボス級を除く)から狙われない。
        const playerHidden = isSeekerActive(player, gameTime) && !isBossType(enemy.type);
        let tgt = resolveEnemyTarget(enemy, player, targetSummons, ALCHEMY_AGGRO_RANGE, playerHidden);
        if (enemy.escortTarget && !enemy.meleeAggro && rescueSurvivors.length > 0) {
          let sv = rescueSurvivors.find(s => s.id === enemy.escortTarget);
          if (!sv) {
            const ex = enemy.x + enemy.width / 2, ey = enemy.y + enemy.height / 2;
            let best = Infinity;
            for (const s of rescueSurvivors) {
              const d2 = (s.x + s.width / 2 - ex) ** 2 + (s.y + s.height / 2 - ey) ** 2;
              if (d2 < best) { best = d2; sv = s; }
            }
          }
          if (sv) tgt = { x: sv.x + sv.width / 2, y: sv.y + sv.height / 2, isSummon: false, hidden: false };
        }
        // シーカーで標的を見失った通常敵は接近をやめ、その場で待機する(速度を減衰。3秒間)。
        if (tgt.hidden) {
          return { ...enemy, vx: (enemy.vx ?? 0) * 0.85, vy: (enemy.vy ?? 0) * 0.85, aiPhase: undefined, aiPhaseUntil: 0 };
        }
        const dx = tgt.x - (enemy.x + enemy.width / 2);
        const dy = tgt.y - (enemy.y + enemy.height / 2);
        const distance = Math.max(0.001, Math.sqrt(dx * dx + dy * dy));

        // ゾンビ専用AI: ×1.2 でフラフラ接近。プレイヤーの近接範囲に入ると 1秒停止→2秒間2倍速 を繰り返す。
        if (enemy.type === 'zombie') {
          const ecx = enemy.x + enemy.width / 2, ecy = enemy.y + enemy.height / 2;
          const pdist = Math.hypot(pcx - ecx, pcy - ecy); // プレイヤー中心までの距離(近接範囲判定はプレイヤー基準)
          const inMelee = pdist <= MELEE_RADIUS;
          let phase = enemy.aiPhase;
          let phaseUntil = enemy.aiPhaseUntil ?? 0;
          const inCycle = phase === 'zpause' || phase === 'zrush';
          if (inCycle && gameTime < phaseUntil) {
            // 進行中の停止/突進はそのまま継続(突進2秒は範囲外へ出ても完遂する)。
          } else if (inCycle) {
            // フェーズ完了: まだ範囲内なら次フェーズへ、範囲外なら通常接近へ戻す。
            if (inMelee) {
              if (phase === 'zpause') { phase = 'zrush'; phaseUntil = gameTime + ZOMBIE_RUSH_MS; }
              else { phase = 'zpause'; phaseUntil = gameTime + ZOMBIE_PAUSE_MS; }
            } else { phase = undefined; phaseUntil = 0; }
          } else if (inMelee) {
            phase = 'zpause'; phaseUntil = gameTime + ZOMBIE_PAUSE_MS;              // 範囲に入った瞬間=1秒停止
          }
          if (phase === 'zpause') {
            return { ...enemy, vx: 0, vy: 0, aiPhase: phase, aiPhaseUntil: phaseUntil }; // 停止
          }
          const zSpeed = enemy.speed * ZOMBIE_SPEED_MULT * (phase === 'zrush' ? ZOMBIE_RUSH_SPEED_MULT : 1) * rnSpeedMult * screamSpeedMult;
          // フラフラ: 進行方向に直交する成分を時間で揺らす(個体ごとに位相をずらす)。
          let h = 0;
          for (let i = 0; i < enemy.id.length; i++) h = (h * 31 + enemy.id.charCodeAt(i)) | 0;
          const ux = dx / distance, uy = dy / distance;
          const wob = Math.sin(gameTime / 200 + (h % 628) / 100) * ZOMBIE_WOBBLE;
          const hx = ux + (-uy) * wob, hy = uy + ux * wob;
          const hl = Math.max(0.001, Math.hypot(hx, hy));
          const zvx = (hx / hl) * zSpeed, zvy = (hy / hl) * zSpeed;
          const zmoved = resolveMove(enemy.x + zvx * deltaTime, enemy.y + zvy * deltaTime);
          return { ...enemy, vx: zvx, vy: zvy, x: zmoved.x, y: zmoved.y, aiPhase: phase, aiPhaseUntil: phaseUntil };
        }

        const speed = (enemy.type === 'plant' ? enemy.speed * 0.25 : enemy.speed) * rnSpeedMult * screamSpeedMult;
        let tvx = (dx / distance) * speed;
        let tvy = (dy / distance) * speed;
        // 新型(lich): プレイヤーの周囲を旋回しながら徐々に詰める。放射(内向き)+接線(旋回)を合成し、
        // 遠いほど接線寄り(円を描く)・近いほど放射寄り(詰める)。旋回向きは個体ごとに固定。視覚演出なし=軽量。
        if (enemy.type === 'lich') {
          const rx = dx / distance, ry = dy / distance;       // プレイヤーへ向かう単位(放射)
          let h = 0;
          for (let i = 0; i < enemy.id.length; i++) h = (h * 31 + enemy.id.charCodeAt(i)) | 0;
          const spin = (h & 1) ? 1 : -1;                       // 個体ごと左右いずれかへ周回
          const tx = -ry * spin, ty = rx * spin;               // 接線(放射に直交)
          const orbit = Math.min(1, distance / 300);           // 300px超で最大旋回
          const radialW = 1 - 0.72 * orbit;                    // 近=1(詰め) / 遠=0.28
          const tangW = 0.96 * orbit;                          // 遠いほど接線(旋回)
          const bx = rx * radialW + tx * tangW;
          const by = ry * radialW + ty * tangW;
          const bl = Math.max(0.001, Math.hypot(bx, by));
          tvx = (bx / bl) * speed;
          tvy = (by / bl) * speed;
        }

        // 変異体(抱卵型・旧ghost): プレイヤーへ直進せず、一定半径を保って周回しながら1秒ごとに緑卵(mine)を撒く。
        // 接線(周回)主体＋距離Rへの放射補正(遠い→内向き / 近い→外向き)。旋回向きは個体ごとに固定。
        if (enemy.type === 'ghost') {
          const rx = dx / distance, ry = dy / distance;            // プレイヤー方向(放射)
          let h = 0;
          for (let i = 0; i < enemy.id.length; i++) h = (h * 31 + enemy.id.charCodeAt(i)) | 0;
          const spin = (h & 1) ? 1 : -1;                            // 個体ごと左右いずれかへ周回
          const tx = -ry * spin, ty = rx * spin;                    // 接線(放射に直交)
          const radialW = Math.max(-1, Math.min(1, (distance - EGGCARRIER_ORBIT_RADIUS) / EGGCARRIER_ORBIT_RADIUS)); // 遠+/近-
          const bx = tx + rx * radialW;
          const by = ty + ry * radialW;
          const bl = Math.max(0.001, Math.hypot(bx, by));
          const gtvx = (bx / bl) * speed, gtvy = (by / bl) * speed;
          const ga = inertiaAlpha(deltaTime, inertiaTauForSpeed(speed));
          const gvx = (enemy.vx ?? gtvx) + (gtvx - (enemy.vx ?? gtvx)) * ga;
          const gvy = (enemy.vy ?? gtvy) + (gtvy - (enemy.vy ?? gtvy)) * ga;
          const gmoved = resolveMove(enemy.x + gvx * deltaTime, enemy.y + gvy * deltaTime);
          // 産卵(バースト): 3秒CDののち、周辺の半径 EGGCARRIER_SCATTER_RADIUS 内のランダム位置へ
          // 0.5秒おきに1個ずつ、最大 EGGCARRIER_BURST_COUNT 個ばらまく。初回は spawn からすぐ開始。
          let nextLay = enemy.eggLayAt ?? (gameTime + EGGCARRIER_BURST_INTERVAL_MS);
          let burst = enemy.eggBurstCount ?? 0;
          if (!MINES_DISABLED && gameTime >= nextLay) { // ?mine=0 診断: 抱卵型は卵を撒かない(通常敵として動くだけ)
            const ecx2 = gmoved.x + enemy.width / 2, ecy2 = gmoved.y + enemy.height / 2;
            const aa = Math.random() * Math.PI * 2;
            const rr = Math.random() * EGGCARRIER_SCATTER_RADIUS;
            const fx = ecx2 + Math.cos(aa) * rr, fy = ecy2 + Math.sin(aa) * rr;
            const rect = mineRect({ footX: fx, footY: fy, scale: 1 });
            layingEggs.push({
              id: `egg-gc-${enemy.id}-${Math.floor(gameTime)}-${burst}`,
              x: rect.x, y: rect.y, width: rect.width, height: rect.height,
              footX: fx, footY: fy, scale: 1,
              health: 1, maxHealth: 1, type: 'mine', lastHit: 0,
            });
            burst += 1;
            if (burst >= EGGCARRIER_BURST_COUNT) { burst = 0; nextLay = gameTime + EGGCARRIER_BURST_CD_MS; } // バースト完了→3秒CD
            else { nextLay = gameTime + EGGCARRIER_BURST_INTERVAL_MS; }                                     // 次の卵は0.5秒後
          }
          return { ...enemy, vx: gvx, vy: gvy, x: gmoved.x, y: gmoved.y, eggLayAt: nextLay, eggBurstCount: burst, aiPhase: undefined, aiPhaseUntil: 0 };
        }

        // 変異体(叫喚型・screamer): プレイヤーに直進せず一定距離を保って移動。出現3秒後に初回、以降10秒間隔で
        // 「溜め(2秒・予兆)→叫喚発動」。発動で画面内の通常敵を一時強化(set 後に screamerBuffUntil をセット)。
        // 溜め完了前に倒せば発動しない=阻止。
        if (enemy.type === 'screamer') {
          const ecx = enemy.x + enemy.width / 2, ecy = enemy.y + enemy.height / 2;
          const nextScream = enemy.screamNextAt ?? (gameTime + SCREAMER_FIRST_MS);
          if (enemy.aiPhase === 'scream') {
            if (gameTime >= (enemy.aiPhaseUntil ?? 0)) {
              // 溜め完了 → 発動。FX/SE/揺れは set 後に screamerActivatedAt から出す。次回の溜め開始を予約。
              screamerActivatedAt.push({ x: ecx, y: ecy });
              return { ...enemy, vx: 0, vy: 0, aiPhase: undefined, aiPhaseUntil: 0, screamNextAt: gameTime + SCREAMER_INTERVAL_MS };
            }
            return { ...enemy, vx: 0, vy: 0 }; // 溜め中は静止(予兆演出は描画/FX側)
          }
          if (gameTime >= nextScream) {
            screamerWindupAt.push({ x: ecx, y: ecy }); // set 後に予兆FX(2秒かけて広がるリング)
            return { ...enemy, vx: 0, vy: 0, aiPhase: 'scream', aiPhaseUntil: gameTime + SCREAMER_WINDUP_MS, screamNextAt: nextScream };
          }
          // 通常時: 距離 SCREAMER_KEEP_RADIUS を保ちつつ弱く横ドリフト(直進しすぎない)。
          const rx = dx / distance, ry = dy / distance;
          let h = 0;
          for (let i = 0; i < enemy.id.length; i++) h = (h * 31 + enemy.id.charCodeAt(i)) | 0;
          const spin = (h & 1) ? 1 : -1;
          const tx = -ry * spin, ty = rx * spin;
          const radialW = Math.max(-1, Math.min(1, (distance - SCREAMER_KEEP_RADIUS) / SCREAMER_KEEP_RADIUS));
          const bx = rx * radialW + tx * 0.5, by = ry * radialW + ty * 0.5;
          const bl = Math.max(0.001, Math.hypot(bx, by));
          const stvx = (bx / bl) * speed, stvy = (by / bl) * speed;
          const sa = inertiaAlpha(deltaTime, inertiaTauForSpeed(speed));
          const svx = (enemy.vx ?? stvx) + (stvx - (enemy.vx ?? stvx)) * sa;
          const svy = (enemy.vy ?? stvy) + (stvy - (enemy.vy ?? stvy)) * sa;
          const smoved = resolveMove(enemy.x + svx * deltaTime, enemy.y + svy * deltaTime);
          return { ...enemy, vx: svx, vy: svy, x: smoved.x, y: smoved.y, screamNextAt: nextScream };
        }

        const alpha = inertiaAlpha(deltaTime, inertiaTauForSpeed(speed));
        const vx = (enemy.vx ?? tvx) + (tvx - (enemy.vx ?? tvx)) * alpha;
        const vy = (enemy.vy ?? tvy) + (tvy - (enemy.vy ?? tvy)) * alpha;

        const moved = resolveMove(enemy.x + vx * deltaTime, enemy.y + vy * deltaTime);

        return { ...enemy, vx, vy, x: moved.x, y: moved.y };
      });

      // スキル: パニッシャー = ノックバック中の敵が他の敵に当たると巻き込む(同方向へ2倍ノックバック＋近接ダメージの半分)。
      // ただし「巻き込まれて」飛んだ敵(punisherHopped)は movers から除外=連鎖しない(1次まで・社長指示)。
      let finalEnemies = updatedEnemies;
      const punisherLv = skillLevel(player, 'punisher');
      if (punisherLv) {
        const melee = player.weapons.find(w => w.isMelee);
        const punisherDmgMult = [0, 0.5, 0.7, 0.9][punisherLv];
        const punisherKbMult = [0, 2, 2.5, 3][punisherLv];
        punisherDmg = Math.max(1, Math.round((melee?.damage ?? 6) * strikerMeleeMult(player) * punisherDmgMult));
        const movers = updatedEnemies.filter(e =>
          e.knockbackUntil !== undefined && now < e.knockbackUntil && !e.punisherHopped &&
          Math.hypot(e.knockbackVx ?? 0, e.knockbackVy ?? 0) > 30);
        finalEnemies = updatedEnemies.map(b => {
          const bKbActive = b.knockbackUntil !== undefined && now < b.knockbackUntil;
          // ノックバックが切れたら hop 印を解除(次に直接ノックバックされたら再び巻き込み元になれる)。
          const cleared = (b.punisherHopped && !bKbActive) ? { ...b, punisherHopped: false } : b;
          if ((cleared.type === 'reaper' && !cleared.reaperChaser) || bKbActive) return cleared; // 不倒の通常リーパーは除外。深奥チェイサーは巻き込み対象(ボス級)。KB中(被弾側/連鎖元)は新規付与しない
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
              knockbackVx: ((a.knockbackVx ?? 0) / d) * KNOCKBACK_SPEED * punisherKbMult,
              knockbackVy: ((a.knockbackVy ?? 0) / d) * KNOCKBACK_SPEED * punisherKbMult,
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

      // --- スカジ氷ハザード(判定はここ・描画はpixiScene) ---
      // スカジ討伐(消滅)後は設置済みマーカー/飛行中の刃を消す(死んだボスの攻撃で被弾しない・社長指示)。
      const skadiAlive = state.enemies.some(e => e.type === 'skadi');
      // 氷塊マーカー: テレグラフ2秒経過(gameTime>=fireAt)で起爆=爆発処理へ ice:true で積む。
      const skadiIceMarkers = !skadiAlive ? [] : state.skadiIceMarkers.filter(m => {
        if (gameTime >= m.fireAt) {
          pumpkinBlasts.push({ x: m.x, y: m.y, radius: SKADI_ICE_RADIUS, damage: SKADI_ICE_DAMAGE, enemyId: m.enemyId, ice: true });
          return false;
        }
        return true;
      });
      // 氷刃: launchAt で発射(向き固定の速度を付与)→以後は等速直進。プレイヤー命中で爆発処理へ積む。寿命で消滅。
      // カウンター対象(社長指示): カウンター窓中は近接半径内の氷刃を弾ける。速い氷刃を接触の一瞬で合わせるのは
      // 難しいので、窓中は能動的に半径内で弾く=パリィ用ブラストをプレイヤー中心(半径=meleeR)に積み、既存の
      // パリィ経路(無効化+Counter!+スカジへ反撃ダメージ)を再利用する。
      const pr = Math.max(player.width, player.height) / 2;
      const counterOpen = now <= player.counterWindowEnd;
      const meleeR = huntingMeleeRadius(player);
      // 骨刃(ラフィ=visual:'bone')はスカジ生存に関係なく処理する(ゲート2ボスの攻撃)。氷刃(スカジ)は
      // 従来どおりスカジ不在時は処理せず破棄(掃除)。※skadiIceBlades配列を両ボスで共用しているため。
      const activeBlades = skadiAlive ? state.skadiIceBlades : state.skadiIceBlades.filter(b => b.visual === 'bone');
      const skadiIceBlades = activeBlades
        .map(b => {
          if (!b.launched) {
            if (gameTime >= b.launchAt) {
              return { ...b, launched: true, vx: Math.cos(b.angle) * SKADI_BLADE_SPEED, vy: Math.sin(b.angle) * SKADI_BLADE_SPEED, expireAt: gameTime + SKADI_BLADE_LIFE_MS };
            }
            return b;
          }
          return { ...b, x: b.x + b.vx * deltaTime, y: b.y + b.vy * deltaTime };
        })
        .filter(b => {
          if (!b.launched) return true;
          if (gameTime >= b.expireAt) return false;
          const d = Math.hypot(pcx - b.x, pcy - b.y);
          if (counterOpen && d <= meleeR) {
            // カウンター成立: プレイヤー中心(半径meleeR)のブラストでパリィ→消化側でカウンター扱いになる。
            pumpkinBlasts.push({ x: pcx, y: pcy, radius: meleeR, damage: SKADI_BLADE_DAMAGE, enemyId: b.enemyId, ice: true });
            return false;
          }
          if (d <= SKADI_BLADE_HIT + pr) {
            pumpkinBlasts.push({ x: b.x, y: b.y, radius: SKADI_BLADE_HIT, damage: SKADI_BLADE_DAMAGE, enemyId: b.enemyId, ice: true });
            return false;
          }
          return true;
        });

      // 抱卵型(旧ghost)が撒いた緑卵を breakableProps へ追加。同時上限 EGGCARRIER_MAX_EGGS(超過は古い順に破棄)。
      // 画面外の卵は syncBreakableProps のカメラ領域カリングで別途自然消滅する。
      let nextBreakables = breakableProps;
      if (layingEggs.length > 0) {
        const carriers = [...breakableProps.filter(p => p.id.startsWith('egg-gc-')), ...layingEggs];
        const others = breakableProps.filter(p => !p.id.startsWith('egg-gc-'));
        const capped = carriers.length > EGGCARRIER_MAX_EGGS ? carriers.slice(carriers.length - EGGCARRIER_MAX_EGGS) : carriers;
        nextBreakables = [...others, ...capped];
      }
      return {
        enemies: finalEnemies, breakableProps: nextBreakables, pumpkinBlasts, shieldBlocks, skadiIceMarkers, skadiIceBlades,
        // 叫喚発動: 画面内の通常敵を SCREAMER_BUFF_MS の間 強化する窓を張る。
        ...(screamerActivatedAt.length > 0 ? { screamerBuffUntil: gameTime + SCREAMER_BUFF_MS } : {}),
      };
    });
    if (pumpkinLanded) get().triggerShake(PUMPKIN_LAND_SHAKE_MS, PUMPKIN_LAND_SHAKE_MAG);
    // 叫喚型の予兆(溜め開始): 2秒かけて広がるリング＋発光(優先処理を促すテレグラフ)。
    if (screamerWindupAt.length > 0) {
      const { x, y } = screamerWindupAt[0];
      get().spawnRing(x, y, 8, 130, 'rgba(190,242,100,0.5)', 3, SCREAMER_WINDUP_MS);
      get().spawnGlow(x, y, 70, 'rgba(163,230,53,', SCREAMER_WINDUP_MS);
    }
    // 叫喚発動: 強い衝撃リング＋発光＋コールアウト＋画面揺れ。「叫んだ」感を強めるため(社長指示)、
    // 外側にもう一段リング(遅れて届く音波のイメージ)＋画面全体がわずかに緑へ明滅するフラッシュを追加し、
    // 揺れも他の一撃系演出(パンプキン着地mag9/盾バッシュmag10)に並ぶ強さへ上げる(旧: 220ms/mag5)。
    if (screamerActivatedAt.length > 0) {
      const { x, y } = screamerActivatedAt[0];
      get().spawnRing(x, y, 10, 240, 'rgba(190,242,100,0.72)', 4, 480);
      get().spawnRing(x, y, 6, 150, 'rgba(255,255,255,0.85)', 3, 340);
      get().spawnRing(x, y, 20, 330, 'rgba(163,230,53,0.5)', 3, 620); // 一段外側=音波が遅れて届くイメージ
      get().spawnGlow(x, y, 130, 'rgba(163,230,53,', 520);
      get().spawnCallout(x, y - 30, '叫喚!', '#bef264', { scale: 1.1 });
      get().spawnFlash('rgba(163,230,53,0.22)', 260); // 叫びが画面全体に響くイメージの淡い緑フラッシュ
      get().triggerShake(260, 10);
    }
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

  // スキル: スラッシャーのタイミングリング状態を設定(startAt=0 でコンボ終了)。
  setSlasherCombo: (startAt, step) => {
    set(state => ({ player: { ...state.player, slasherRingStartAt: startAt, slasherStrikeStep: step } }));
  },

  markMeleeSwingFx: () => {
    set(state => ({ player: { ...state.player, meleeSwingAt: Date.now() } }));
  },

  markFirstAidPoseFx: () => {
    set(state => ({ player: { ...state.player, firstAidPoseAt: Date.now() } }));
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

  // イベント: 画面外を緑卵(mine)で取り囲む。閉じ込め/解除条件なし=プレイヤーが離れると
  // syncBreakableProps のカメラ領域カリングで自然に消える(無限蓄積しない)。
  spawnEggRing: (cx, cy) => {
    set(state => {
      const b = state.gameBounds;
      const maxDim = Math.max(b.width, b.height);
      const baseR = maxDim * 0.72; // 画面外(可視外)・retention pad 内に収める半径
      const N = MINES_DISABLED ? 0 : EGG_RING_COUNT; // ?mine=0 診断: 卵リングイベントも0個(何も追加しない)
      const stamp = Math.floor(state.gameTime);
      const eggs: BreakableProp[] = [];
      for (let i = 0; i < N; i++) {
        const ang = (Math.PI * 2 * i) / N + (Math.random() - 0.5) * 0.16;
        const r = baseR + (Math.random() - 0.5) * maxDim * 0.10;
        const fx = cx + Math.cos(ang) * r;
        const fy = cy + Math.sin(ang) * r;
        const rect = mineRect({ footX: fx, footY: fy, scale: 1 });
        eggs.push({
          id: `egg-evt-${stamp}-${i}`,
          x: rect.x, y: rect.y, width: rect.width, height: rect.height,
          footX: fx, footY: fy, scale: 1,
          health: 1, maxHealth: 1, type: 'mine', lastHit: 0,
        });
      }
      return { breakableProps: [...state.breakableProps, ...eggs] };
    });
  },

  // 囲い系イベント開始: activeEvent をセットし、囲い周辺(半径×1.5)内の通常敵を一掃する。
  // ボス級(reaper/giantbat/pumpkin)と屋内固定敵(fixed)は除外(=消さない)。イベント敵の湧きは
  // 呼び出し側(useGameLoop)が beginArenaEvent の直後に addEnemy(fromEvent) で行う。
  beginArenaEvent: (event) => {
    set(state => {
      const clearR2 = (event.radius * 1.5) ** 2;
      const kept = state.enemies.filter(e => {
        if (e.type === 'reaper' || e.type === 'giantbat' || e.type === 'pumpkin' || isHiddenBoss(e.type) || e.fixed || e.questTarget) return true;
        const ecx = e.x + e.width / 2;
        const ecy = e.y + e.height / 2;
        return (ecx - event.x) ** 2 + (ecy - event.y) ** 2 > clearR2; // 範囲外だけ残す
      });
      const keptIds = new Set(kept.map(e => e.id));
      state.enemies.forEach(e => { if (!keptIds.has(e.id)) tagRemove(e.id, 'sweep'); }); // 消失ログ用: イベント開始の周辺一掃
      return { activeEvent: event, enemies: kept };
    });
  },

  // 囲い系イベント終了: 拘束を解除し、残存イベント敵(時間切れ時の取りこぼし)を撤去して通常へ戻す。
  // 救助イベントの守る対象NPC(rescueSurvivors)も後片付け(撤収)。
  endArenaEvent: () => {
    set(state => {
      state.enemies.forEach(e => { if (e.fromEvent) tagRemove(e.id, 'endEv'); }); // 消失ログ用: イベント終了の取りこぼし撤去
      return {
        activeEvent: null,
        enemies: state.enemies.filter(e => !e.fromEvent),
        rescueSurvivors: [],
      };
    });
  },

  // 紅き夜: 警告 → 本番(10秒後) → 終了(20秒間)。
  beginRedNightWarning: (gameTime) => {
    const activeAt = gameTime + 10000;
    set({
      redNight: { phase: 'warning', activeAt, endAt: activeAt + 20000 },
      eventBannerText: '紅き夜が来る！',
      eventBannerUntil: gameTime + 3500,
    });
  },
  activateRedNight: () => {
    set(state => ({
      redNight: state.redNight ? { ...state.redNight, phase: 'active' } : null,
    }));
  },
  endRedNight: () => {
    set({ redNight: null });
  },
  skipRedNight: () => {
    set({ redNight: null });
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
        if (e.type === 'reaper' || e.type === 'giantbat' || e.type === 'pumpkin' || isHiddenBoss(e.type) || e.fixed || e.questTarget) return true;
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
      get().enemies.forEach(e => { if (e.fromEvent) tagRemove(e.id, 'rescueWin'); }); // 消失ログ用: 救助成功で攻撃者退場
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
      get().npcOpPrepReact(ae.x, ae.y); // イベント系クリア(救助成功)→地域NPCが「救助者保護(rescueReturned)」で反応
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
  // §5.23 M22 C3(社長決定v0.25.1550): 「なぎ倒しN HITS」演出はこの関数(全6箇所の多段ヒット経路が
  // 既に呼んでいる=registerMultiHitのcount引数)に相乗りする。ヘビーガンナーバフはwarrior限定だが、
  // 見た目の「N HITS」バナーは全キャラ共通(呼び出し元を増やさず、この1箇所で分岐する)。
  registerMultiHit: (count) => {
    const state = get();
    if (MULTIFX_ENABLED && shouldShowMultiHitFx(count)) {
      const p = state.player;
      get().spawnMultiHitFx(p.x + p.width / 2, p.y - 26, count);
    }
    if (state.player.characterClass !== 'warrior' || count < 2) return;
    set(s => ({ player: { ...s.player, heavyGunnerExpBuffUntil: s.gameTime + 3000 } }));
  },

  // §5.23 M22 C3: プレイヤー頭上に「N HITS」bitmap-text(pixiScene.tsのdrawMultiHitBanner・
  // 既存dmg-numフォント方式)+一瞬の小フラッシュ(既存spawnRing/spawnGlow=新規描画方式なし)。
  // 同時キャップ=1(dedupeMultiHitEffects=既存のmultiHitエフェクトを追加前に間引く=常に最新のみ)。
  spawnMultiHitFx: (x, y, count) => {
    const now = Date.now();
    const effect: VisualEffect = {
      kind: 'multiHit',
      id: `fx-multihit-${now}-${Math.random().toString(36).slice(2, 6)}`,
      x, y, count,
      createdAt: now,
      duration: 620,
    };
    set(state => ({ effects: [...dedupeMultiHitEffects(state.effects), effect] }));
    get().spawnRing(x, y, 6, 40, 'rgba(190,242,100,0.85)', 3, 320);
    get().spawnGlow(x, y, 30, 'rgba(190,242,100,', 320); // radius<STRONG_GLOW_RADIUS(44)=小glow(安い)
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
          // 反射した敵弾は貫通しない=最初に当たった1体で消える(社長指示)。以前は貫通(plow through)していた。
          passthrough: false,
          hitEnemies: [],
          createdAt: Date.now()
        };
      })
    }));
  },
  
  updateProjectiles: (deltaTime) => {
    const currentTime = Date.now();

    set(state => {
      const { projectiles, player, gameBounds, breakableProps, castleEvent, camera, enemies } = state;
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

      // プラントが死んだら、そのプラントが撃った在弾(敵弾)を消す(社長指示)。発射元の個体IDで判定。
      // 反射済み(=カウンターでプレイヤー側になった弾)は対象外。生存プラントのIDだけ集めて参照する。
      const livePlantIds = new Set(enemies.filter(e => e.type === 'plant').map(e => e.id));

      const updatedProjectiles = projectiles
        .filter(p => {
          if (currentTime - p.createdAt > p.duration && p.weaponType !== 'grenade') return false;
          if (currentTime - p.createdAt > p.duration + 500) return false;
          if (p.weaponType === 'enemy_bolt' && p.ownerType === 'plant' && p.hostile && !p.reflected
              && !livePlantIds.has(p.ownerId ?? '')) return false; // 発射元プラントが消滅=在弾も消す
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
                return { ...p, boomPhase: 'return' as const, hitEnemies: [] };
              }
              // 画面外に出たらすぐ戻り動作へ切替(停止せず帰還)。可視範囲=カメラ+画面サイズ。
              const offScreen = ncx < camera.x || ncx > camera.x + gameBounds.width || ncy < camera.y || ncy > camera.y + gameBounds.height;
              const traveled = Math.hypot(ncx - (p.boomOriginX ?? ncx), ncy - (p.boomOriginY ?? ncy));
              if (offScreen) {
                return { ...p, x: nx, y: ny, boomPhase: 'return' as const, hitEnemies: [] };
              }
              if (traveled >= (p.boomMaxDist ?? 99999)) {
                // 到達 → 停止フェーズ。貫通リストをリセット(戻りで再ヒットできるよう)。
                return { ...p, x: nx, y: ny, boomPhase: 'stop' as const, boomStopUntil: currentTime + (p.boomStopMs ?? 2000), hitEnemies: [] };
              }
              return { ...p, x: nx, y: ny };
            }
            if (phase === 'stop') {
              if (currentTime >= (p.boomStopUntil ?? 0)) {
                return { ...p, boomPhase: 'return' as const, hitEnemies: [] };
              }
              return p; // 停止中は動かない(回転は描画側)
            }
            if (phase === 'return') {
              const cx = p.x + p.width / 2, cy = p.y + p.height / 2;
              const ddx = playerCX - cx, ddy = playerCY - cy;
              const dd = Math.hypot(ddx, ddy);
              if (dd <= 18) return { ...p, boomPhase: 'done' as const }; // 到達 → 消滅(useGameLoop が除去)
              const rsp = DRONE_BOOM_RETURN_SPEED; // 戻りは従来速度
              return { ...p, x: p.x + (ddx / dd) * rsp * deltaTime, y: p.y + (ddy / dd) * rsp * deltaTime };
            }
            return p; // 'done'
          }
          // ホーミング弾: 毎フレームターゲットへ向けて旋回しながら飛ぶ。ターゲットが消えたら直進。
          if (p.weaponType === 'homing-missile') {
            const target = p.targetEnemyId ? enemies.find(e => e.id === p.targetEnemyId) : undefined;
            let dir = p.direction;
            if (target) {
              const tx = target.x + target.width / 2;
              const ty = target.y + target.height / 2;
              const dx = tx - (p.x + p.width / 2);
              const dy = ty - (p.y + p.height / 2);
              const tAngle = Math.atan2(dy, dx);
              const cAngle = Math.atan2(p.direction.y, p.direction.x);
              const diff = ((tAngle - cAngle) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
              const maxTurn = HOMING_MISSILE_TURN_RATE * deltaTime;
              const newAngle = cAngle + Math.sign(diff) * Math.min(Math.abs(diff), maxTurn);
              dir = { x: Math.cos(newAngle), y: Math.sin(newAngle) };
            }
            return { ...p, direction: dir, x: p.x + dir.x * p.speed * deltaTime, y: p.y + dir.y * p.speed * deltaTime };
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

  dropEnemyXp: (enemy, x, y, idPrefix, value) => {
    // 難易度⑤(DirectorRank): HARVEST相当のフェーズ中だけ有効な倍率(通常は1)。useGameLoopが毎フレーム更新。
    const v = Math.round((value ?? enemy.experienceValue) * getDirectorRewardMult());
    const base = xpOrbCountForEnemy(enemy);
    // 紅き夜中は経験値ドロップ数2倍。
    const n = base * ((get().redNight?.phase === 'active' || RN_ENEMY_FORCE) ? 2 : 1);
    for (let i = 0; i < n; i++) {
      get().addPickup({ id: `${idPrefix}-${enemy.id}-${i}`, x: x - 8, y: y - 8, type: 'experience', value: v });
    }
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
          // §6.10 M33⑪: ゴールドラッシュはin-runスクラップ拾得から撤去(永続ゴールド獲得へ移動)。
          return {
          player: {
            ...state.player,
            // スクラップ獲得数アップ(パッシブ): 取得量を scrapMult 倍に(+30%/回)。
            // スキル: スクラップビルダー = 取得量 ×1.1/1.2/1.3(Lv・§6.9 M32。四捨五入は既存のMath.round)。
            straps: state.player.straps + Math.max(1, Math.round(pickup.value * ((state.player.scrapMult ?? 1) + (state.player.equipBonus?.scrapBonus ?? 0)) * skillScrapBuilderGainMult(state.player)))
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
            kind: 'treasure',
            treasureVariant: pickup.variant // 取得バナーで実物のトレジャー画像(treasure-N)を表示する(社長指示)
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
        // ボス系(reaper/giantbat/pumpkin/lab-zombie-3/裏ボス)は爆弾では死なない(社長指示)=対象外で生存。
        const reachable = get().enemies.filter(e => !isBossType(e.type));
        reachable.forEach(e => tagRemove(e.id, 'bomb')); // 消失ログ用: ボムで一括除去
        set(state => ({
          enemies: state.enemies.filter(e => isBossType(e.type)),
          finaleDefeated: state.finaleDefeated, // 爆弾ではフィナーレボスを倒せない=終了条件にしない
          gameStats: {
            ...state.gameStats,
            enemiesKilled: state.gameStats.enemiesKilled + reachable.length,
            eliteKills: state.gameStats.eliteKills + countScoreEliteBoss(reachable).elite, // 爆弾のpumpkin撃破も計上
            bossKills: state.gameStats.bossKills + countScoreEliteBoss(reachable).boss     // 同 giantbat
          }
        }));
        // Drop XP gems where each killed enemy was so the cleanup feels
        // rewarding even though we skipped the damage path.
        reachable.forEach(enemy => {
          const ex = enemy.x + enemy.width / 2;
          const ey = enemy.y + enemy.height / 2;
          get().dropEnemyCurrency(enemy, ex, ey);
          get().dropEnemyXp(enemy, ex, ey, 'pickup-bomb');
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
          // 屋外: エリア(距離)別Tier率で銃を抽選して装備(社長指定)。
          {
            const pc = get().player;
            get().grantWeapon(openCrate(areaIndexForPos(pc.x + pc.width / 2, pc.y + pc.height / 2)));
          }
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
      const generatedMines = MINES_DISABLED ? [] : minesInRegion(
        camera.x - pad,
        camera.y - pad,
        camera.x + bounds.width + pad,
        camera.y + bounds.height + pad
      );
      const pressureMines = MINES_DISABLED ? [] : pressureMinesNearPlayer(
        state.player.x + state.player.width / 2,
        state.player.y + state.player.height / 2,
        state.player.lastDirection,
        state.gameTime
      );
      const ambushMines = (MINES_DISABLED || !mineAmbushAnchor) ? [] : mineAmbushAround(mineAmbushAnchor);
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

    // 難易度⑥(ピンチ救済): ピンチが続いている時だけ、ドロップ率と内訳(回復/爆弾寄り)を
    // pityDirector のしきい値へずらす。pity=0 の時は従来定数と完全一致(挙動不変)。
    // 出る場所は従来どおり松明のみ(場所は台本=固定・中身だけ調整、社長指示)。
    const pity = getPityDropTuning();
    if (Math.random() >= pity.dropChance) return;
    const x = prop.footX - 8;
    const y = prop.footY - 16;
    const roll = Math.random();
    const player = get().player;

    if (roll < pity.ammoT) {
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

    if (roll < pity.healthT) {
      get().addPickup({
        id: `pickup-torch-health-${prop.id}`,
        x, y,
        type: 'health',
        value: 20
      });
      return;
    }

    if (BOMB_PICKUPS_ENABLED && roll < pity.bombT && !get().indoorMode) { // 研究所(屋内)は爆弾を出さない(社長指示)。
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
        // Past the melee early-return: this is always a gun, whose `ammoType`
        // mirrors its category (see createWeapon) and is therefore defined.
        const ammoType = weapon.ammoType as AmmoType;
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

    // `duplicateAmmo` is assigned inside the set() callback above; TS's flow
    // analysis can't see that closure write, so it narrows the outer binding
    // back to `null`. Read through the declared type to recover `.amount`.
    const dup = duplicateAmmo as { amount: number } | null;
    if (dup) {
      const p = get().player;
      get().spawnAmmoNumber(p.x + p.width / 2, p.y - 6, dup.amount);
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
      const benkeiMs = skillBenkeiBuffMs(state.player); // 10/12/15s(Lv)
      const benkei =
        changed && hasSkill(state.player, 'benkei') && gt >= state.player.benkeiCdUntil
          ? { benkeiBuffUntil: gt + benkeiMs, benkeiCdUntil: gt + benkeiMs + 3000 }
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
  setGameTime: (time, realTime) => {
    set(realTime === undefined ? { gameTime: time } : { gameTime: time, realGameTime: realTime });
  },
  setBackgrounded: (v) => { if (get().backgrounded !== v) set({ backgrounded: v }); },
  
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

  setCaptureFrame: (fn) => set({ captureFrame: fn }),
  showTutorialPopup: (p) => {
    // 挿絵の優先順: img(事前収録の手本アセット)> SVG図解。社長決定v0.25.1839「基本的に全部
    // 事前に手本を見せるカタチ」=表示直前のライブキャプチャは廃止(素材は一度収録して使い回す)。
    set({ tutorialPopup: p, tutorialPopupShown: true, isPaused: true }); // 表示中はゲーム停止
  },
  closeTutorialPopup: () => {
    set({ tutorialPopup: null, isPaused: false });
  },

  setRendererReady: (ready) => {
    if (useGameStore.getState().rendererReady === ready) return; // 同値書き込みで購読者を起こさない
    set({ rendererReady: ready });
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
  // ガチャ: 解禁＋Lv反映。所持していなければ追加、Lv は max(既存, rolled) を最大Lvでクランプ。
  // 既存Lv以上に上がった(=新規 or レベルアップ)場合のみ true(=返金しない)。
  grantSkillLevel: (key, level) => {
    const lv = Math.max(1, Math.min(skillMaxLevel(key), Math.floor(level)));
    const owned = get().ownedSkills;
    const levels = get().ownedSkillLevels;
    const cur = owned.includes(key) ? (levels[key] ?? 1) : 0;
    if (cur >= lv) return false; // 既存Lv以上は出なかった=重複扱い(返金)
    const nextOwned = owned.includes(key) ? owned : [...owned, key];
    const nextLevels = { ...levels, [key]: lv };
    saveStringArray(OWNED_SKILLS_KEY, nextOwned);
    saveSkillLevels(nextLevels);
    set({ ownedSkills: nextOwned, ownedSkillLevels: nextLevels });
    return true;
  },
  // 強化訓練を1回引く(逐次)。レア度をpityから抽選→pity更新(super=リセット/他=+1)→
  // スキル別の被り回数でLv抽選→初取得は付与・既存超えで昇格・それ以外は返金→被り回数を更新。
  // 10連は本アクションを順番にN回呼ぶ(各回がget/setで最新stateを参照=スナップショット一括禁止)。
  pullGacha: () => {
    // コスト0(無料)のときは課金スキップ。有料なら残高を消費(不足で null)。
    if (GACHA_PULL_COST > 0 && !get().spendGold(GACHA_PULL_COST)) return null;
    const pity = get().gachaPitySinceSuper;
    const key = rollGachaSkill(pity);
    const rarity: SkillRarity = SKILLS[key].rarity;
    const nextPity = rarity === 'super' ? 0 : pity + 1; // superでリセット・それ以外は+1(次回反映)
    const maxLv = skillMaxLevel(key);
    const owned = get().ownedSkills;
    const levels = get().ownedSkillLevels;
    const dupes = get().gachaDupeCounts;
    const prevLevel = owned.includes(key) ? (levels[key] ?? 1) : 0;
    const dupeCount = dupes[key] ?? 0;        // Lv抽選表の参照(今回より前の被り回数)
    const firstAcquire = prevLevel === 0;

    // Lv上限固定(reaper/bomber=Lv1)で既に所持 → 被りで回数を進めず常に返金。
    if (maxLv === 1 && !firstAcquire) {
      const refund = GACHA_REFUND_BY_RARITY[rarity];
      saveNumber(GACHA_PITY_KEY, nextPity);
      set({ gachaPitySinceSuper: nextPity });
      get().addGold(refund);
      return { key, rarity, rolledLevel: 1, newLevel: prevLevel, prevLevel, dupeCount, firstAcquire: false, promoted: false, refund };
    }

    const rolledLevel = rollSkillLevel(rarity, dupeCount, maxLv);
    let newLevel = prevLevel;
    let promoted = false;
    let refund = 0;
    if (firstAcquire) {
      newLevel = Math.max(1, Math.min(maxLv, rolledLevel)); // 初取得=比較なしで付与
      promoted = true;
    } else if (rolledLevel > prevLevel && prevLevel < maxLv) {
      newLevel = Math.min(maxLv, rolledLevel);              // 現Lv超え=昇格
      promoted = true;
    } else {
      refund = GACHA_REFUND_BY_RARITY[rarity];              // 現Lv以下/上限到達=返金
    }
    const nextDupe = dupeCount + 1; // 被り回数は昇格有無に関わらず毎回+1(永続)
    const nextOwned = owned.includes(key) ? owned : [...owned, key];
    const nextLevels = promoted ? { ...levels, [key]: newLevel } : levels;
    const nextDupes = { ...dupes, [key]: nextDupe };
    saveStringArray(OWNED_SKILLS_KEY, nextOwned);
    if (promoted) saveSkillLevels(nextLevels);
    saveDupeCounts(nextDupes);
    saveNumber(GACHA_PITY_KEY, nextPity);
    set({ ownedSkills: nextOwned, ownedSkillLevels: nextLevels, gachaDupeCounts: nextDupes, gachaPitySinceSuper: nextPity });
    if (refund > 0) get().addGold(refund);
    return { key, rarity, rolledLevel, newLevel, prevLevel, dupeCount, firstAcquire, promoted, refund };
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
  setPendingCorridor: (on) => {
    set({ pendingCorridor: on });
  },
  clearCorridorRunIn: () => {
    set({ corridorRunInActive: false });
  },
  setPendingStageTheme: (theme) => {
    set({ pendingStageTheme: theme });
  },
  setPendingFarBackdrop: (key) => {
    set({ pendingFarBackdrop: key });
  },
  setPendingSuppression: (on) => {
    set({ pendingSuppression: on });
  },
  setPendingStoryBoss: (on) => {
    set({ pendingStoryBoss: on });
  },
  setPendingRevisit: (on) => {
    set({ pendingRevisit: on });
  },
  setPendingNearHorizon: (key) => {
    set({ pendingNearHorizon: key });
  },
  setPendingHiddenBoss: (t) => {
    set({ pendingHiddenBoss: t });
  },

  // M5 遭遇のみ(統合正本4.5 / utils/eventQuest.ts encounterOnly): サークル滞在3秒で確定会話を流して
  // 完了。クエスト受注・報酬なし。サブ納品と同じ永続フラグ(meta.sub)を立てる=以後このステージに
  // 二人は出現しない(そのプレイ中は completed の立ち姿のまま)。会話のenqueueは呼び出し側(useGameLoop)。
  completeEventEncounter: () => {
    const stageId = getSelectedStageId();
    const meta = getEventQuestMeta(stageId);
    setEventQuestMeta(stageId, { ...meta, sub: true });
    set(state => ({
      eventQuestNpc: { ...state.eventQuestNpc, status: 'completed', dwellMs: 0 },
      eventQuestActive: null,
    }));
  },

  // 洋館［SUB］再訪(統合正本9.3-9.4): ［グレンの薬を使う］。成功/失敗は説明しない=演出は最小
  // (小さな光のみ)。進行は永続へ即保存(medicineUsed/revisitCleared+ミッション単位クリア)。
  // 勝利化は useGameLoop が medicineUsedAt からの短い間(1.6秒)を置いて行う。
  useGlenMedicine: () => {
    const s = get();
    if (!s.revisitMode || s.medicineUsedAt > 0 || s.gameWon) return;
    updateStoryFlags({ medicineUsed: true, revisitCleared: true });
    markMissionCleared(REVISIT_MISSION_ID);
    const castle = s.castleEvent;
    set({ medicineUsedAt: Date.now(), medicinePromptVisible: false });
    // 最小の視覚フィードバック(明確な成功演出は置かない=統合正本9.3)。
    get().spawnRing(castle.x, castle.y - 20, 10, 90, 'rgba(253,230,138,0.7)', 3, 620);
    get().spawnGlow(castle.x, castle.y - 30, 42, 'rgba(253,230,138,', 620);
  },

  triggerEventVictory: () => {
    // 終了アイテム/ゴール。即勝利せず帰還サークルへ。屋内は壁に阻まれないようプレイヤー位置に直接出す(避けない)。
    const p = get().player;
    get().beginReturnPhase(p.x + p.width / 2, p.y + p.height / 2, false);
  },

  // 帰還サークルを出現させる。原点(城跡/アイテム位置)付近に置く。avoidPlayer 時はプレイヤーに近すぎると
  // プレイヤーから離す方向へ押し出して「避けて」出現させる。既に出ている/勝利済みなら何もしない。
  beginReturnPhase: (originX, originY, avoidPlayer = true) => {
    set(state => {
      if (state.returnCircle || state.gameWon) return {};
      const p = state.player;
      const px = p.x + p.width / 2;
      const py = p.y + p.height / 2;
      const radius = RETURN_CIRCLE_RADIUS;

      // 配置候補が障害物(木/壁/城/トーチ/プロップ)と重ならないか。中心まわりの正方形AABBで近似。
      const obstaclesAround = (cx: number, cy: number): Rect[] => {
        const pad = radius + 120;
        if (state.indoorMode) return [...labBlockingWalls(state.labDoors.filter(d => d.open).map(d => d.id)), ...state.labProps.map(pr => pr.rect)];
        if (state.stageTheme === 'lab') return [
          ...labWallsInRegion(cx - pad, cy - pad, cx + pad, cy + pad).map(wallRect),
          ...labPropsInRegion(cx - pad, cy - pad, cx + pad, cy + pad).map(propRect),
        ];
        const trunks = treesInRegion(cx - pad, cy - pad, cx + pad, cy + pad).map(trunkRect);
        const torches = state.breakableProps.filter(pr => pr.type === 'torch' && pr.health > 0).map(torchRect);
        return [...trunks, ...torches, castleRect(state.castleEvent)];
      };
      const overlaps = (cx: number, cy: number): boolean => {
        const bx = cx - radius, by = cy - radius, bw = radius * 2, bh = radius * 2;
        return obstaclesAround(cx, cy).some(w =>
          bx < w.x + w.width && bx + bw > w.x && by < w.y + w.height && by + bh > w.y);
      };

      // 基準位置(必要ならプレイヤーから離す)。
      let cx = originX, cy = originY;
      const d0 = Math.hypot(cx - px, cy - py);
      const baseAng = d0 > 1 ? Math.atan2(cy - py, cx - px) : Math.random() * Math.PI * 2;
      if (avoidPlayer && d0 < RETURN_CIRCLE_AVOID_DIST) {
        cx = px + Math.cos(baseAng) * RETURN_CIRCLE_AVOID_DIST;
        cy = py + Math.sin(baseAng) * RETURN_CIRCLE_AVOID_DIST;
      }
      // 障害物に重なるなら、プレイヤーから一定距離以上を保ちつつ周囲を探索して空き地へ。
      if (overlaps(cx, cy)) {
        const minDist = avoidPlayer ? RETURN_CIRCLE_AVOID_DIST : radius + 40;
        search:
        for (let ring = 0; ring < 5; ring++) {
          const dist = minDist + ring * (radius + 50);
          for (let k = 0; k < 8; k++) {
            const ang = baseAng + (k % 2 === 0 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 4);
            const tx = px + Math.cos(ang) * dist;
            const ty = py + Math.sin(ang) * dist;
            if (!overlaps(tx, ty)) { cx = tx; cy = ty; break search; }
          }
        }
      }

      return {
        returnCircle: { x: cx, y: cy, radius, dwellMs: 0 },
        eventBannerText: '帰還サークル出現',
        eventBannerUntil: state.gameTime + 3500,
      };
    });
  },

  // 毎フレーム: 帰還サークル内の滞在時間を計測。離れるとリセット、RETURN_CIRCLE_HOLD_MS 連続で帰還完了=gameWon。
  updateReturnPhase: (deltaTime) => {
    set(state => {
      const rc = state.returnCircle;
      if (!rc || state.gameWon) return {};
      const p = state.player;
      const px = p.x + p.width / 2;
      const py = p.y + p.height / 2;
      const inside = Math.hypot(rc.x - px, rc.y - py) <= rc.radius;
      const dwellMs = inside ? rc.dwellMs + deltaTime * 1000 : 0;
      // 洋館通路のゴールは5秒(社長指示v0.25.2132)。他ステージの3秒は不変。
      if (dwellMs >= (state.corridorMode ? CORRIDOR_RETURN_HOLD_MS : RETURN_CIRCLE_HOLD_MS)) {
        return { gameWon: true, returnCircle: null, eventBannerText: '帰還完了', eventBannerUntil: state.gameTime + 2000 };
      }
      // 入った瞬間(外→内)に設置中のトラップ/手榴弾/タレット/デコイを撤去(出入りハメ防止)。
      const justEntered = inside && rc.dwellMs === 0;
      if (dwellMs === rc.dwellMs && !justEntered) return {}; // 円外で 0 のまま=書き込み省略
      return {
        returnCircle: { ...rc, dwellMs },
        ...(justEntered ? { projectiles: state.projectiles.filter(pr => !RETURN_CLEAR_WEAPON_TYPES.has(pr.weaponType)) } : {})
      };
    });
  },

  // 拠点候補地(仕様10): サークル内滞在を計測。10秒で制圧→武器商人がその地点へ移動し、元の商人地点は候補に戻る。
  updateSuppression: (deltaTime) => {
    // チュートリアル: 随行NPC(escorts流用)は拠点前進/射撃/制圧を一切しない(移動はuseGameLoopの
    // 追従チェーンが担当・社長指示v0.25.1823)。
    if (get().farBackdrop === 'tutorial') return [];
    const state = get();
    // 洋館通路(corridorMode・v0.25.2128): 拠点システムなし。護衛は入場時の横一列の隊形のまま
    // プレイヤーと並走して上へ歩く。v0.25.2139(社長報告「付いてくるだけで攻撃しない」): 通常拠点護衛と
    // 同じ射撃を追加=敵が検知半径内なら停止して発砲(同じ実弾/間隔/フェイザー2丁)、いなければ隊形へ追走。
    if (state.corridorMode) {
      const p = state.player;
      const pcx = p.x + p.width / 2;
      const pcy = p.y + p.height / 2;
      const now = state.gameTime;
      const detect2 = (huntingMeleeRadius(p) * ESCORT_DETECT_MULT) ** 2;
      const shots: { x: number; y: number; dx: number; dy: number; soldierIndex: number }[] = [];
      let escChanged = false;
      const nextEsc = state.escorts.map((esc, i) => {
        // 最寄り敵(通常護衛と同じ検知。空中=ジャンプ中は無敵なので狙わない)。
        let nearest: Enemy | undefined; let nd2 = detect2;
        for (const e of state.enemies) {
          if (e.aiPhase === 'jump') continue;
          const ex = e.x + e.width / 2, ey = e.y + e.height / 2;
          const d2 = (ex - esc.x) * (ex - esc.x) + (ey - esc.y) * (ey - esc.y);
          if (d2 < nd2) { nd2 = d2; nearest = e; }
        }
        if (nearest) {
          // 停止して射撃(進まない)=通常護衛と同じ振る舞い。
          let { fireAt, face } = esc;
          if (now >= fireAt) {
            fireAt = now + ESCORT_FIRE_INTERVAL_MS;
            const tx = nearest.x + nearest.width / 2, ty = nearest.y + nearest.height / 2;
            let dx = tx - esc.x, dy = ty - esc.y; const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
            if (esc.soldierIndex === PHASER_INDEX) {
              const ox = -dy * PHASER_GUN_OFFSET, oy = dx * PHASER_GUN_OFFSET;
              shots.push({ x: esc.x + ox, y: esc.y + oy, dx, dy, soldierIndex: esc.soldierIndex });
              shots.push({ x: esc.x - ox, y: esc.y - oy, dx, dy, soldierIndex: esc.soldierIndex });
            } else {
              shots.push({ x: esc.x, y: esc.y, dx, dy, soldierIndex: esc.soldierIndex });
            }
            face = (dx < 0 ? -1 : 1) as 1 | -1;
          }
          if (fireAt !== esc.fireAt || face !== esc.face || esc.moving) escChanged = true;
          return { ...esc, fireAt, face, moving: false };
        }
        const targetX = pcx + (CORRIDOR_ESCORT_ROW_X[i % CORRIDOR_ESCORT_ROW_X.length] ?? 0);
        const targetY = pcy + 26; // プレイヤーのやや後ろの列
        const dx = targetX - esc.x, dy = targetY - esc.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 3) { if (esc.moving) { escChanged = true; return { ...esc, moving: false }; } return esc; }
        const k = Math.min(1, (ESCORT_SPEED * deltaTime) / dist);
        escChanged = true;
        return {
          ...esc,
          x: esc.x + dx * k,
          y: esc.y + dy * k,
          face: (Math.abs(dx) > 6 ? (dx < 0 ? -1 : 1) : esc.face) as 1 | -1,
          moving: true,
        };
      });
      if (escChanged) set({ escorts: nextEsc });
      // 発砲=通常護衛と同一の実弾(handgun projectile・friendly)。SE減衰用に発射元を返す。
      for (const sh of shots) {
        get().addProjectile({
          id: `proj-escort-${Math.floor(now)}-${Math.random().toString(36).slice(2, 6)}`,
          x: sh.x - 4.5, y: sh.y - 30, width: 9, height: 9, // 胸の高さから発射(足元アンカーなので少し上)
          speed: 680, damage: ESCORT_DMG,
          direction: { x: sh.dx, y: sh.dy },
          weaponType: 'handgun', weaponKey: 'escort',
          duration: 1200, createdAt: Date.now(),
          passthrough: false, hitEnemies: [], hostile: false, reflected: false, crit: false,
        });
      }
      return shots.map(s => ({ x: s.x, y: s.y }));
    }
    // 拠点は屋外(非ラボ・非屋内)なら常に機能する。屋内/ラボ/勝利後は無処理。
    // イベント(suppressionActive)かどうかは「全拠点制圧」した時のゴール有無だけが違う(下部参照)。
    if (!state.baseSites.length || state.indoorMode || state.stageTheme === 'lab' || state.gameWon) return [];
    const now = state.gameTime;
    const p = state.player;
    const px = p.x + p.width / 2;
    const py = p.y + p.height / 2;
    const cam = state.camera, gb = state.gameBounds;
    const M = 100; // 画面外この距離まで=この内側だけ実体(攻撃者/護衛)を動かす。社長指示で 250→100=画面外ですぐ停止
    const onScreen = (x: number, y: number) => x >= cam.x - M && x <= cam.x + gb.width + M && y >= cam.y - M && y <= cam.y + gb.height + M;
    const aliveIds = new Set(state.enemies.map(e => e.id));
    // 裏ボスが拠点を「通過」(当たり判定=帯AABBが拠点サークルに重なる)したら一撃陥落させる(社長指示)。
    // 円(拠点)対AABB(ボス)の最近接点距離で判定。商人拠点(safe)は対象外(安全地帯を維持)。
    const boss = state.enemies.find(e => isHiddenBoss(e.type));
    const bossHitsBase = (bx: number, by: number): boolean => {
      if (!boss) return false;
      const nx = Math.max(boss.x, Math.min(bx, boss.x + boss.width));
      const ny = Math.max(boss.y, Math.min(by, boss.y + boss.height));
      return Math.hypot(bx - nx, by - ny) <= BASE_CAPTURE_RADIUS;
    };

    const spawnList: { x: number; y: number; id: string; baseId: string }[] = [];
    const removeAttackerIds: string[] = [];
    const soldierShots: { fromX: number; fromY: number; toX: number; toY: number }[] = [];
    const damageShots: { id: string; dmg: number }[] = [];
    const escortShots: { x: number; y: number; dx: number; dy: number; soldierIndex: number }[] = []; // 護衛NPCの発砲(プレイヤーと同じ実弾)。soldierIndex=フェイザー2倍判定用
    const fallen: { x: number; y: number; id: string; soldierIndex: number }[] = [];
    const npcSurroundEvents: { name: string; text: string }[] = []; // 「敵に囲まれた」発話候補(CDはset後にtryNpcLineで適用)
    const npcRescuedEvents: { name: string; text: string }[] = [];   // 「囲まれから助けられた」発話候補
    const npcRetreatEvents: { name: string; text: string }[] = [];    // 「後退する時」(放置×ランダム)発話候補
    const npcBaseNearEvents: { name: string; text: string }[] = [];   // 「拠点が見えてきた時」発話候補
    const npcCompanionEvents: { name: string; text: string }[] = [];  // 「並走時」発話候補(頻度低め)
    let capturedThisFrame: { id: string; x: number; y: number; soldierIndex: number } | null = null;
    let captureCount = state.suppressionCaptureCount; // 制圧累計回数(SE検出用)。名簿indexはランダム割当に変更。
    let changed = false;

    // ── 護衛軍人NPC(社長指示): 担当拠点へ前進→近くの敵に射撃(進まない)→サークル内10秒で解放。
    //    プレイヤーの画面外では前進停止・座標のみ保持。HPなし(被弾しても何も起きない=今回のコア)。
    const detect2 = (huntingMeleeRadius(p) * ESCORT_DETECT_MULT) ** 2;
    const escortCaptures = new Map<string, number>(); // baseId -> soldierIndex(このフレーム占拠完了)
    let escortsChanged = false;
    const nextEscorts: EscortSoldier[] = state.escorts.map(esc => {
      const base = state.baseSites.find(b => b.id === esc.baseId);
      if (!base) return esc;
      // 後退(放置)セリフ: 後退システム未実装の代理。プレイヤーが遠く放置していて未制圧の担当NPCが、
      // たまにランダムで「押されている」旨を漏らす(画面外でも判定=放置の通知)。CDで更に間引く。
      if (base.status === 'open' && Math.hypot(esc.x - px, esc.y - py) > NEGLECT_DIST && Math.random() < RETREAT_CHANCE_PER_SEC * deltaTime) {
        const sol = BASE_SOLDIERS[esc.soldierIndex % BASE_SOLDIERS.length];
        npcRetreatEvents.push({ name: sol.name, text: pickNpcLine(esc.soldierIndex, 'pushback', sol.pushback) });
      }
      if (!onScreen(esc.x, esc.y)) return esc; // 画面外=前進停止(座標保持)
      // 最寄り敵(プレイヤーと同じく全敵を見る)。空中(ジャンプ中)の敵は無敵なので狙わない。
      // 併せて SURROUND_RADIUS 内の敵数を数え、囲まれ判定(セリフ用)に使う。
      let nearest: Enemy | undefined; let nd2 = detect2;
      let surround = 0; const sr2 = SURROUND_RADIUS * SURROUND_RADIUS;
      for (const e of state.enemies) {
        if (e.aiPhase === 'jump') continue;
        const ex = e.x + e.width / 2, ey = e.y + e.height / 2;
        const d2 = (ex - esc.x) * (ex - esc.x) + (ey - esc.y) * (ey - esc.y);
        if (d2 < nd2) { nd2 = d2; nearest = e; }
        if (d2 < sr2) surround++;
      }
      // 囲まれ→解放(助けられた)の遷移検知。wasSurrounded は護衛オブジェクトで保持。
      const sol = BASE_SOLDIERS[esc.soldierIndex % BASE_SOLDIERS.length];
      let wasSurrounded = esc.wasSurrounded ?? false;
      if (surround >= SURROUND_COUNT) {
        if (!wasSurrounded) npcSurroundEvents.push({ name: sol.name, text: pickNpcLine(esc.soldierIndex, 'surrounded', sol.surrounded) });
        wasSurrounded = true;
      } else if (wasSurrounded && surround <= RESCUED_FREE) {
        // 周囲の敵が減って進軍再開できる状態=助けられた。
        npcRescuedEvents.push({ name: sol.name, text: pickNpcLine(esc.soldierIndex, 'rescued', sol.rescued) });
        wasSurrounded = false;
      }
      // 拠点が見えてきた時: 未制圧の担当拠点中心へ近づいた(あと少し)。
      if (base.status === 'open' && Math.hypot(esc.x - base.x, esc.y - base.y) < NEAR_BASE_DIST) {
        npcBaseNearEvents.push({ name: sol.name, text: pickNpcLine(esc.soldierIndex, 'baseNear', sol.baseNear) });
      }
      // 並走時: プレイヤーと近距離の連続時間を計測し、一定時間越えたら低確率で漏らす(頻度かなり低め)。
      let companionMs = esc.companionMs ?? 0;
      if (Math.hypot(esc.x - px, esc.y - py) <= COMPANION_DIST) {
        companionMs += deltaTime * 1000;
        if (companionMs >= COMPANION_HOLD_MS && Math.random() < COMPANION_CHANCE_PER_SEC * deltaTime) {
          npcCompanionEvents.push({ name: sol.name, text: pickNpcLine(esc.soldierIndex, 'companion', sol.companion) });
          companionMs = 0; // 一度漏らしたら再蓄積
        }
      } else {
        companionMs = 0; // 離れたらリセット(連続並走のみ)
      }
      let { x, y, fireAt, dwellMs, face } = esc;
      if (nearest) {
        // 停止して射撃(進まない)。射撃間隔でスロットル。弾はプレイヤーと同じ見た目の実弾(handgun projectile)。
        // 護衛NPCは裏ボスを撃ってもよい(社長指示)。ただし発砲はこの護衛が画面内のとき(=上の onScreen ガードを
        // 通過したとき)だけ=プレイヤーが離れてNPCが画面外になれば自動で撃たない。→ プレイヤー不在での“削り殺し”は起きない。
        if (now >= fireAt) {
          fireAt = now + ESCORT_FIRE_INTERVAL_MS;
          const tx = nearest.x + nearest.width / 2, ty = nearest.y + nearest.height / 2;
          let dx = tx - x, dy = ty - y; const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
          if (esc.soldierIndex === PHASER_INDEX) {
            // 2丁拳銃: 進行方向に直交する向きへ±オフセットして2発(各通常ダメージ=合計2倍)。
            const ox = -dy * PHASER_GUN_OFFSET, oy = dx * PHASER_GUN_OFFSET;
            escortShots.push({ x: x + ox, y: y + oy, dx, dy, soldierIndex: esc.soldierIndex });
            escortShots.push({ x: x - ox, y: y - oy, dx, dy, soldierIndex: esc.soldierIndex });
          } else {
            escortShots.push({ x, y, dx, dy, soldierIndex: esc.soldierIndex });
          }
          face = dx < 0 ? -1 : 1;
        }
      } else if (base.status === 'captured') {
        // 制圧後: 円の縁を巡回(社長指示)。半径を patrolR へ寄せつつ角度を進める=滑らかに周回。
        // 敵が居る間は上の射撃枝で停止するので、巡回は「敵が居ない時」だけ。
        const cx0 = x - base.x, cy0 = y - base.y;
        let ang = Math.atan2(cy0, cx0);
        if (!Number.isFinite(ang)) ang = 0;
        const patrolR = BASE_CAPTURE_RADIUS * ESCORT_PATROL_R;
        const curR = Math.hypot(cx0, cy0);
        const newR = curR + Math.sign(patrolR - curR) * Math.min(Math.abs(patrolR - curR), ESCORT_SPEED * deltaTime);
        ang += (ESCORT_SPEED / Math.max(1, patrolR)) * deltaTime; // 時計回りに周回
        const nx = base.x + Math.cos(ang) * newR, ny = base.y + Math.sin(ang) * newR;
        face = (nx - x) < 0 ? -1 : 1;
        x = nx; y = ny;
      } else {
        // 制圧前: 担当拠点へ前進(近くに敵がいる間は↑で射撃して進まない)。
        const dx = base.x - x, dy = base.y - y; const d = Math.hypot(dx, dy);
        if (d > 2) { const mv = Math.min(ESCORT_SPEED * deltaTime, d); x += (dx / d) * mv; y += (dy / d) * mv; face = dx < 0 ? -1 : 1; }
      }
      // (空に浮く件は位置を止めず、描画側で地平線フェード=透明化で対応。drawEscorts 参照)。
      // 滞在カウント/占拠は射撃・前進どちらの枝でも毎フレーム評価する(社長報告のバグ修正)。
      // 仕様「拠点内に10秒留まったら解放」: 敵を撃ちながらでも円内に留まっていればカウントを進める。
      // 円の外(まだ到達前/押し出された)では0にリセット。
      const inC = Math.hypot(x - base.x, y - base.y) <= BASE_CAPTURE_RADIUS;
      dwellMs = inC ? dwellMs + deltaTime * 1000 : 0;
      if (inC && dwellMs >= BASE_CAPTURE_HOLD_MS && base.status === 'open' && !escortCaptures.has(base.id)) {
        escortCaptures.set(base.id, esc.soldierIndex);
      }
      if (x !== esc.x || y !== esc.y || fireAt !== esc.fireAt || dwellMs !== esc.dwellMs || face !== esc.face || wasSurrounded !== (esc.wasSurrounded ?? false) || companionMs !== (esc.companionMs ?? 0)) escortsChanged = true;
      return { ...esc, x, y, fireAt, dwellMs, face, wasSurrounded, companionMs };
    });

    const next: BaseSite[] = state.baseSites.map(s => {
      const inCircle = Math.hypot(s.x - px, s.y - py) <= BASE_CAPTURE_RADIUS;
      if (s.status === 'open') {
        // 解放(制圧)は護衛NPCのサークル内10秒滞在で発生(プレイヤー滞在制圧は廃止・社長指示)。
        if (escortCaptures.has(s.id) && !capturedThisFrame) {
          const capIdx = escortCaptures.get(s.id)!;
          captureCount += 1;
          capturedThisFrame = { id: s.id, x: s.x, y: s.y, soldierIndex: capIdx };
          changed = true;
          // 護衛が解放。garrison(駐留軍人)は旧システム(flag on)時のみ生成。flag off=護衛が防衛するので空。
          return { ...s, status: 'captured', hp: SUPP_HP_MAX, dwellMs: 0, attackerId: null, attackerRespawnAt: now + SUPP_ATTACKER_FIRST_MS, soldierFireAt: 0, soldierIndex: capIdx, soldiers: SUPP_BASE_ATTACKS_ENABLED ? makeBaseSoldiers(s.x, s.y) : [] };
        }
        // 護衛の滞在進捗をレンダラー用に反映(s.dwellMs が常に0だと白弧が動かない)。
        const escortDwell = nextEscorts.find(e => e.baseId === s.id)?.dwellMs ?? 0;
        if (escortDwell !== s.dwellMs) { changed = true; return { ...s, dwellMs: escortDwell }; }
        return s;
      }
      // captured。旧「拠点が襲われる(攻撃者湧き/HP/軍人射撃/HP0陥落)」は SUPP_BASE_ATTACKS_ENABLED=false で
      // 丸ごとスキップ(社長指示・コードは残置)。裏ボス通過の一撃陥落だけは維持。
      const safe = s.id === state.safeBaseId;
      if (!SUPP_BASE_ATTACKS_ENABLED) {
        if (!safe && bossHitsBase(s.x, s.y)) {
          fallen.push({ x: s.x, y: s.y, id: s.id, soldierIndex: s.soldierIndex });
          changed = true;
          return { ...s, status: 'open', hp: 0, dwellMs: 0, attackerId: null, attackerRespawnAt: 0, soldierFireAt: 0, soldierIndex: -1, soldiers: [] };
        }
        return s;
      }
      let { hp, attackerId, attackerRespawnAt, soldierFireAt } = s;
      let soldiers = s.soldiers;
      let liveAttacker: Enemy | undefined; // 軍人の移動/射撃の標的
      const vis = onScreen(s.x, s.y);
      if (vis) {
        // 攻撃者ライフサイクルは画面内の captured 拠点で共通(safe含む)。safe拠点は敵が来るがHPは減らない。
        if (attackerId && !aliveIds.has(attackerId)) { attackerId = null; attackerRespawnAt = now + SUPP_ATTACKER_RESPAWN_MS; }
        if (!attackerId && now >= attackerRespawnAt) {
          const ang = ((Math.abs(s.x) * 13 + Math.abs(s.y) * 7) % 628) / 100;
          spawnList.push({
            x: s.x + Math.cos(ang) * (BASE_CAPTURE_RADIUS + 100),
            y: s.y + Math.sin(ang) * (BASE_CAPTURE_RADIUS + 100),
            id: `atk-${s.id}-${Math.floor(now)}`, baseId: s.id,
          });
          attackerId = `atk-${s.id}-${Math.floor(now)}`;
        }
        const hasLiveAttacker = !!attackerId && aliveIds.has(attackerId); // 今フレ生成分は次フレから削る
        if (hasLiveAttacker) {
          if (!safe) hp -= SUPP_ATTACKER_DPS * deltaTime; // 商人拠点(safe)はHPを減らさない(社長指示)。それ以外は削られる
          liveAttacker = state.enemies.find(e => e.id === attackerId); // 接近/射撃の標的
          if (now >= soldierFireAt) {           // 駐留軍人が攻撃者へ反撃(各自の位置から)
            soldierFireAt = now + SUPP_SOLDIER_INTERVAL_MS;
            if (liveAttacker) {
              damageShots.push({ id: attackerId!, dmg: SUPP_SOLDIER_DMG });
              const tx = liveAttacker.x + liveAttacker.width / 2, ty = liveAttacker.y + liveAttacker.height / 2;
              for (const sol of soldiers) soldierShots.push({ fromX: sol.x, fromY: sol.y, toX: tx, toY: ty });
            }
          }
        }
        if (safe) hp = Math.min(SUPP_HP_MAX, hp + SUPP_REGEN_PER_SEC * deltaTime);       // safe=常時回復(=実質不死)
        else if (inCircle) hp += SUPP_REGEN_PER_SEC * deltaTime;                          // プレイヤーが拠点内で防衛=回復
        hp = Math.max(0, Math.min(SUPP_HP_MAX, hp));
      } else {
        // 画面外: 実体なし。safeは満タン維持、それ以外は単純な時間ドレイン。
        if (attackerId) { removeAttackerIds.push(attackerId); attackerId = null; }
        hp = safe ? Math.min(SUPP_HP_MAX, hp + SUPP_REGEN_PER_SEC * deltaTime) : Math.max(0, hp - SUPP_DRAIN_PER_SEC * deltaTime);
      }
      // 軍人の移動(描画される=画面内のときのみ計算)。攻撃者がいれば至近まで接近、いなければ
      // サークル内を自由に巡回(目的地に着いたら次のランダム地点へ。社長指示=軍人がうろつく)。
      if (vis && soldiers.length) {
        const step = SUPP_SOLDIER_SPEED * deltaTime;
        let moved = false;
        soldiers = soldiers.map(sol => {
          let hx = sol.hx, hy = sol.hy;
          // 攻撃者不在時: 巡回先(hx/hy)に着いたらサークル内の新ランダム地点へ更新=自由に動き回る。
          if (!liveAttacker && Math.hypot(hx - sol.x, hy - sol.y) <= 2) {
            const ang = Math.random() * Math.PI * 2;
            const rad = BASE_CAPTURE_RADIUS * (0.25 + Math.random() * 0.6); // 0.25〜0.85R内
            hx = s.x + Math.cos(ang) * rad;
            hy = s.y + Math.sin(ang) * rad;
            moved = true;
          }
          const tx = liveAttacker ? liveAttacker.x + liveAttacker.width / 2 : hx;
          const ty = liveAttacker ? liveAttacker.y + liveAttacker.height / 2 : hy;
          const dx = tx - sol.x, dy = ty - sol.y;
          const dist = Math.hypot(dx, dy);
          const stopAt = liveAttacker ? SUPP_SOLDIER_ENGAGE_DIST : 1.5;
          if (dist <= stopAt) return { ...sol, hx, hy };
          const mv = Math.min(step, dist - stopAt);
          moved = true;
          return { ...sol, hx, hy, x: sol.x + (dx / dist) * mv, y: sol.y + (dy / dist) * mv };
        });
        if (moved) changed = true;
      }
      // 裏ボスが通過したら一撃で陥落(safe=商人拠点は除外)。以降は通常の陥落=撤退レールへ。
      if (!safe && bossHitsBase(s.x, s.y)) hp = 0;
      if (hp <= 0) { // 陥落
        if (attackerId) removeAttackerIds.push(attackerId);
        fallen.push({ x: s.x, y: s.y, id: s.id, soldierIndex: s.soldierIndex });
        changed = true;
        return { ...s, status: 'open', hp: 0, dwellMs: 0, attackerId: null, attackerRespawnAt: 0, soldierFireAt: 0, soldierIndex: -1, soldiers: [] };
      }
      if (hp !== s.hp || attackerId !== s.attackerId || soldierFireAt !== s.soldierFireAt) changed = true;
      return { ...s, hp, attackerId, attackerRespawnAt, soldierFireAt, soldiers };
    });

    if (changed || capturedThisFrame || removeAttackerIds.length || escortsChanged) {
      const removeSet = new Set(removeAttackerIds);
      set(st => ({
        baseSites: next,
        ...(escortsChanged ? { escorts: nextEscorts } : {}),
        enemies: removeSet.size ? st.enemies.filter(e => !removeSet.has(e.id)) : st.enemies,
        ...(capturedThisFrame ? {
          safeBaseId: capturedThisFrame.id,
          suppressionCaptureCount: captureCount,
          // 武器商人はスタート常駐に変更したので拠点へは移動しない。制圧拠点中央の「武器庫」から遠隔利用する。
        } : {}),
      }));
    }

    if (capturedThisFrame) {
      const c = capturedThisFrame as { id: string; x: number; y: number; soldierIndex: number };
      get().spawnRing(c.x, c.y, 14, BASE_CAPTURE_RADIUS, 'rgba(251,191,36,0.9)', 4, 560);
      get().spawnGlow(c.x, c.y, 70, 'rgba(251,191,36,', 600);
      // 拠点解放時セリフ(Critical): 時間停止なしのHUDセリフに置換(管理表 baseCaptured)。バナー/SEは併用。
      const sol = BASE_SOLDIERS[c.soldierIndex % BASE_SOLDIERS.length];
      get().tryNpcLine(sol.name, 'baseCaptured', pickNpcLine(c.soldierIndex, 'baseCaptured', sol.baseCaptured), BASE_CAPTURED_CAT_CD_MS);
      set({ eventBannerText: '拠点確保', eventBannerUntil: now + 2200 });
      // 歴史年表: 拠点解放を即載せ(社長決定v0.25.1628=A方式。拠点は永続前例が無いので年表用に新規)。
      // 4拠点それぞれを初回のみ記録(dedup=拠点id)。ラベルは方位名(社長指示v0.25.1630)。
      recordChronicle(getSelectedStageId(), 'base', c.id, `${baseCompassLabel(c.x, c.y)}の拠点を開放`);
    }
    // 「敵に囲まれた時」セリフ(時間停止なしHUD)。同一NPC/同一カテゴリのCDを守って1件だけ通す。
    for (const ev of npcSurroundEvents) {
      if (get().tryNpcLine(ev.name, 'surrounded', ev.text, SURROUND_CAT_CD_MS)) break;
    }
    // 「囲まれから助けてもらった時」セリフ。援護実感を出す(High)。同上CD。
    for (const ev of npcRescuedEvents) {
      if (get().tryNpcLine(ev.name, 'rescued', ev.text, RESCUED_CAT_CD_MS)) break;
    }
    // 「後退する時」セリフ(放置×ランダム)。同上CD。
    for (const ev of npcRetreatEvents) {
      if (get().tryNpcLine(ev.name, 'pushback', ev.text, RETREAT_CAT_CD_MS)) break;
    }
    // 「拠点が見えてきた時」セリフ(あと少し感・High)。同上CD。
    for (const ev of npcBaseNearEvents) {
      if (get().tryNpcLine(ev.name, 'baseNear', ev.text, BASE_NEAR_CAT_CD_MS)) break;
    }
    // 「並走時」セリフ(頻度低め・Low)。同上CD。
    for (const ev of npcCompanionEvents) {
      if (get().tryNpcLine(ev.name, 'companion', ev.text, COMPANION_CAT_CD_MS)) break;
    }
    // 「遠方で放置(隣NPCのみ)」セリフ(社長確定条件)。誰も進軍を手伝っていない(全護衛から遠い)時、
    // プレイヤーの現在エリア起点で時計回りに最初の未開放エリアのNPCが1人だけ低頻度で反応。
    {
      const gs = get();
      const gp = gs.player; const gpx = gp.x + gp.width / 2, gpy = gp.y + gp.height / 2;
      const helping = gs.escorts.some(e => Math.hypot(e.x - gpx, e.y - gpy) <= HELPING_DIST);
      const anyOpen = gs.baseSites.some(b => b.status === 'open');
      if (gs.escorts.length > 0 && !helping && anyOpen && Math.random() < NEGLECT_FAR_CHANCE_PER_SEC * deltaTime) {
        const startIdx = ((Math.round(Math.atan2(gpy, gpx) / (Math.PI / 2)) % BASE_SITE_COUNT) + BASE_SITE_COUNT) % BASE_SITE_COUNT;
        let pickIdx = -1;
        for (let k = 0; k < BASE_SITE_COUNT; k++) {
          const idx = (startIdx + k) % BASE_SITE_COUNT;
          if (gs.baseSites.find(b => b.id === `base-${idx}`)?.status === 'open') { pickIdx = idx; break; }
        }
        if (pickIdx >= 0) {
          // その sector(base-${pickIdx})に配属された護衛の素性(soldierIndex)でセリフを選ぶ(ランダム名簿対応)。
          const esc = gs.escorts.find(e => e.baseId === `base-${pickIdx}`);
          if (esc) {
            const idx = ((esc.soldierIndex % BASE_SOLDIERS.length) + BASE_SOLDIERS.length) % BASE_SOLDIERS.length;
            const sol = BASE_SOLDIERS[idx];
            get().tryNpcLine(sol.name, 'neglectFar', pickNpcLine(idx, 'neglectFar', sol.neglectFar), NEGLECT_FAR_CAT_CD_MS);
          }
        }
      }
    }
    for (const a of spawnList) {
      const e = spawnEnemyAt('skeleton', a.x - 16, a.y - 16, now);
      e.id = a.id; e.baseId = a.baseId; e.fromEvent = true; // fromEvent=距離カリング対象外(拠点付近に留める)
      get().addEnemy(e);
    }
    for (const d of damageShots) get().damageEnemy(d.id, d.dmg);
    // 護衛NPCの発砲: プレイヤーと同じ見た目の実弾(handgun projectile・friendly)。命中は通常の弾-敵判定で処理。
    for (const sh of escortShots) {
      get().addProjectile({
        id: `proj-escort-${Math.floor(now)}-${Math.random().toString(36).slice(2, 6)}`,
        x: sh.x - 4.5, y: sh.y - 30, width: 9, height: 9, // 胸の高さから発射(足元アンカーなので少し上)
        speed: 680, damage: ESCORT_DMG, // フェイザーは2発撃つ(2丁拳銃)ことで合計2倍。1発は通常と同じ。
        direction: { x: sh.dx, y: sh.dy },
        weaponType: 'handgun', weaponKey: 'escort',
        duration: 1200, createdAt: Date.now(),
        passthrough: false, hitEnemies: [], hostile: false, reflected: false, crit: false,
      });
    }
    for (const t of soldierShots) {
      get().spawnEffect({ kind: 'trail', id: `supp-tracer-${Math.floor(now)}-${Math.random().toString(36).slice(2, 6)}`, fromX: t.fromX, fromY: t.fromY, toX: t.toX, toY: t.toY, color: 'rgba(253,224,71,0.9)', createdAt: Date.now(), duration: 120 });
    }
    for (const f of fallen) {
      get().spawnRing(f.x, f.y, 14, BASE_CAPTURE_RADIUS, 'rgba(239,68,68,0.9)', 4, 560);
      get().triggerAttention(f.x, f.y); // カメラがそこへ→撤退の吹き出しはこのアテンションと同時に出す
      const sol = soldierByIndex(f.soldierIndex); // 撤退時(拠点喪失)の軍人セリフ。死亡ではなく撤退。
      // 時間停止VNボックス廃止(社長指示v0.25.1876): 撤退セリフも通常会話(左上の通信=非停止)のキューへ。
      if (sol) set(s2 => ({ npcDialogueQueue: [...s2.npcDialogueQueue, { name: sol.name, text: sol.retreat }] }));
      set({ eventBannerText: '拠点陥落', eventBannerUntil: now + 2200 });
    }
    // 全拠点制圧 → 達成。未制圧→全制圧に変わった瞬間だけ発火(毎フレ再発火しない/陥落で再武装)。
    // イベント時(suppressionActive)のみ既存クリア経路(帰還サークル=ゴール)へ。イベント外は達成のみ(ゴール無し)。
    const wasAllCaptured = state.baseSites.length > 0 && state.baseSites.every(s => s.status === 'captured');
    const nowAllCaptured = next.every(s => s.status === 'captured');
    if (nowAllCaptured && !wasAllCaptured) {
      set({ eventBannerText: '全拠点制圧', eventBannerUntil: now + 3000 });
      get().spawnFlash('rgba(251,191,36,0.3)', 400);
      if (state.suppressionActive) {
        set({ suppressionActive: false });
        get().triggerEventVictory(); // イベント: ゴール(帰還サークル)を出す
      }
    }
    // このフレームに護衛NPCが発砲した位置(発射元)を返す。useGameLoop が NPC↔プレイヤー距離で減衰再生する。
    return escortShots.map(s => ({ x: s.x, y: s.y }));
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
        // インライン実装3箇所(damageEnemy系)と同じ式に統一: combo-masterの窓延長ボーナスを含める
        // (GAME_AUDIT #1: 本ヘルパーだけ延長が抜けており、カウンター/反射経由のコンボが短い窓になっていた)
        meleeFinishComboUntil: state.gameTime + Math.round((MELEE_FINISH_COMBO_WINDOW_MS + skillFinishComboWindowBonus(state.player)) * (state.player.equipBonus?.killGraceMult ?? 1)),
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
      const { player: p, enemies } = get();
      // 社長相談(v0.25.1499): 赤ライン当たり判定内なら保留(useGameLoopが再チェック)。
      if (p.experience >= p.experienceToNextLevel && !isPlayerInAttackTelegraph(p, enemies, PUMPKIN_EXPLOSION_RADIUS)) {
        get().levelUp();
      }
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
    // M35(§6.12): ボット計測カウンタをラン開始でリセット(実機/ヘッドレス両ハーネス共通の合流点)。
    resetBotTelemetry();
    // PACING_PUZZLE.md §5.14 M13: 前ラン終了時点で宿敵が登場していたのに決着(討伐/自分を殺した/
    // 新規上書き)がついていなければ持ち越し(型・名前は維持・因縁+1)。クリア/死亡いずれの
    // ラン終了でも次ランのresetGame呼び出しがこの唯一の締めタイミングになる。
    if (state.namedFoeSpawnedThisRun && !state.namedFoeRunResolved && state.namedFoe) {
      const carried: NamedFoeMeta = { ...state.namedFoe, grudge: state.namedFoe.grudge + 1 };
      saveNamedFoe(carried);
      set({ namedFoe: carried });
    }
    // 次ランの宿敵抽選(社長指示: 各ラン60%)+ラン内限定フィールドのリセット。
    set({
      namedFoeRunEligible: NAMED_ENEMY_ENABLED && rollNamedSpawnThisRun(),
      namedFoeSpawnedThisRun: false,
      namedFoeResult: null,
      namedFoeRunResolved: false,
      lastDamagerType: null,
      lastDamagerWasNamed: false,
      // PACING_PUZZLE.md §5.17 M14: ステージが変わっている可能性があるので、選択中ステージの壁メタを
      // 読み直す。演出キュー/帯はラン内限定なので新ランで必ずクリア。
      wallMeta: getWallMeta(getSelectedStageId()),
      wallBandText: '',
      wallBandUntil: 0,
      wallEventQueue: [],
      lastKomaAssessmentInput: null,
    });
    state.enemies.forEach(e => tagRemove(e.id, 'reset')); // 消失ログ用: リスタートで全敵クリア
    clearDestroyedObstacles(); // 裏ボスに壊された木/プロップの欠番を新ランで復活させる。
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
        // チュートリアル: 銃と近接以外は強制的に無し(社長指示v0.25.1825)=サブウェポン0
        // (クラス固有サブ・装備サブとも)。レベルアップ候補/商人陳列も所持サブ基準なので自動で絞られる。
        : state.pendingFarBackdrop === 'tutorial' ? []
        : Array.from(new Set<SubWeaponKey>([innateSub, ...loDedup]));
      // 装備スキル(別枠アクティブ・最大2)。出撃時に player.skills へ反映(効果は今後配線)。
      const runSkills: SkillKey[] = state.danceTestMode
        ? []
        : Array.from(new Set<SkillKey>(state.pendingSkills)).slice(0, 2);
      // 装備スキルのLvは所持Lv(ownedSkillLevels)を反映(未設定=1、最大Lvでクランプ)。
      const runSkillLevels: Partial<Record<SkillKey, number>> = Object.fromEntries(
        runSkills.map(k => [k, Math.max(1, Math.min(skillMaxLevel(k), state.ownedSkillLevels[k] ?? 1))])
      );
      // スキル: スクラップビルダー = 出撃開始時の初期スクラップ +50/100/150(Lv)。
      const scrapBuilderLv = runSkills.includes('scrap-builder') ? (runSkillLevels['scrap-builder'] ?? 1) : 0;
      const scrapBuilderBonus = scrapBuilderLv ? [0, 50, 100, 150][scrapBuilderLv] : 0;
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
      // ステージ6(洋館・奥行き通路)。stage-6メイン出撃(App側で pendingCorridor をゲート済み)かつ
      // ダンステスト/屋内/再訪でないときだけ有効(とりあえず統合v0.25.2105・社長指示)。
      const corridorMode = state.pendingCorridor && !state.danceTestMode && !indoor && !state.pendingRevisit;
      // ステージ5(戦場)=残骸プロップに置換・チュートリアル(洞窟)=木なし(社長指示2026-07-17)。
      // world層のゲートを毎ラン設定(描画/幹当たり/配置回避が treesInRegion 経由で一括に空になる)。
      // 洋館通路も木/トーチ/緑卵を出さない(社長指示)。
      setTreesDisabled(farBackdrop === 'stage5' || farBackdrop === 'tutorial' || corridorMode);
      // チュートリアル: 松明(破壊可能プロップ=資材ドロップ源)も出さない(社長指示v0.25.1818
      // 「アイテムも通常NPCも何もかも無し。全てイベントで特別仕様のみ」)。
      setTorchesDisabled(farBackdrop === 'tutorial' || corridorMode);
      // チュートリアル: 緑卵(地雷)のワールド生成も出さない(社長指示v0.25.1820「緑卵も非表示」)。
      setMinesDisabled(farBackdrop === 'tutorial' || corridorMode);
      // 洋館通路の湧き方向ゲート(上=奥 主体・左右は湧かせない)。generateEnemy が参照(新規/リサイクル両方)。
      setCorridorSpawn(corridorMode);
      // 遠景森2(手前の帯)は forest/lab どちらでも有効(ダンステストのみ無効)。lab は機材シルエット帯。
      const nearHorizon = !state.danceTestMode ? state.pendingNearHorizon : '';
      // 裏ボス(深層域)。屋外(非ラボ/非屋内)・非ダンステストのときだけ有効。
      // 洋館通路(corridorMode)では裏ボス深層域を無効化(v0.25.2119): 通路は奥へ歩き続ける構造のため
      // 距離条件を必ず踏み、森用のデンジャーゾーン暗幕が通路背景を覆って画面が黒地化していた(社長報告)。
      const hiddenBoss = (!state.danceTestMode && !indoor && stageTheme === 'forest' && !corridorMode) ? state.pendingHiddenBoss : null;
      const spawnTL = indoor
        ? { x: LAB_PLAYER_SPAWN.x - PLAYER_HITBOX / 2, y: LAB_PLAYER_SPAWN.y - PLAYER_HITBOX / 2 }
        // 洋館: 到着点(y=0)の下から走り込む(護衛もspawnTL基準なので隊ごと下から入場する)。
        : { x: 0, y: corridorMode ? CORRIDOR_RUNIN_DIST : 0 };
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
      // 視界=300px(社長指示v0.25.1754「ステージ2の敵は視界300px」で湧き敵と統一。旧220)。
      const mkGuard = (type: EnemyType, gx: number, gy: number): Enemy =>
        ({ ...spawnEnemyAt(type, gx, gy, 0), fixed: true, dormant: true, aggroRange: 300, vx: 0, vy: 0, homeX: gx, homeY: gy });
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
      // 護衛NPCの名簿は1度だけ作り、出撃セリフ(sortie)も同じロスターから選ぶ(フェイザー等のランダム名簿に追従)。
      // チュートリアル: 通常の護衛4人は出さず、随行NPC(軍人+衛生兵・追従)を出す(社長指示v0.25.1823)。
      // 出撃セリフ(sortieEsc)はチュートリアルでは使わない(セリフは全てイベントで特別に組む)。
      // storyBoss ステージ(M7=グレン戦/EX)は護衛NPCを出さない(社長指示v0.25.1876「M7はNPCいない予定」。
      // 拠点占拠の無いボス直行ステージなので護衛4人は元々そぐわない)。
      const escortRoster = (indoor || stageTheme === 'lab' || state.pendingStoryBoss) ? []
        : farBackdrop === 'tutorial' ? makeTutorialCompanions(spawnTL.x, spawnTL.y)
        : makeEscorts(spawnTL.x, spawnTL.y, corridorMode);
      const sortieEsc = (escortRoster.length && farBackdrop !== 'tutorial') ? escortRoster[Math.floor(Math.random() * escortRoster.length)] : null;
      const sortieSol = sortieEsc ? BASE_SOLDIERS[((sortieEsc.soldierIndex % BASE_SOLDIERS.length) + BASE_SOLDIERS.length) % BASE_SOLDIERS.length] : null;
      return {
        unlockedShopSkillCards: runShopUnlocks,
        indoorMode: indoor,
        corridorMode,
        stageTheme,
        farBackdrop,
        nearHorizon,
        hiddenBoss,
        bossChasing: false,
        bossCorpse: null,
        hiddenBossDefeated: false,
        kogarasuUnlockedThisRun: false,
        labDoors: runDoors,
        labButtons: runButtons,
        labProps: runProps,
        hasCardKey: false,
        goalReachedAt: 0,
        lastDamageSource: '',
        // SE発火トリガ(Date.now時刻)を0へ戻す。これを残すと、リトライ直後の最初のフレームで
        // useGameLoop 側の ref(再マウントで0)より大きい旧値が「発火した」と誤検出され、前ランの
        // 武器/スキル音(盾バッシュ/鞭/アンカー/召喚等)が一瞬鳴ってしまう不具合の修正。
        rescueShooterFxAt: 0,
        bashHitFxAt: 0,
        whipHitFxAt: 0,
        whipSwingFxAt: 0,
        anchorPlantFxAt: 0,
        anchorEnemyHitFxAt: 0,
        boomerangThrowFxAt: 0,
        junkShotFxAt: 0,
        summonFxAt: 0,
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
          meleeSwingAt: 0,
          firstAidPoseAt: 0,
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
          skillLevels: runSkillLevels,
          fireShooterCdUntil: 0, reflexCdUntil: 0, slasherRingStartAt: 0, slasherStrikeStep: 0, slasherReach: 0,
    scavengerBuffUntil: 0, marksmanMovingSince: 0, heavyGunnerExpBuffUntil: 0,
    phillReticleDX: 0, phillReticleDY: 0, phillSnapEnemyId: null,
          knifeComboCount: 0, knifeComboUntil: 0, benkeiBuffUntil: 0, benkeiCdUntil: 0,
          seekerUntil: 0, seekerCdUntil: 0,
          subWeaponLevels: runLevels,
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
          skaterStopUntil: 0,
          skaterBashCdUntil: 0,
          skaterRiding: false,
          skaterRideStartAt: 0,
          wireAnchorX: 0,
          wireAnchorY: 0,
          wireAnchored: false,
          wirePlantUntil: 0,
          wireDashUntil: 0,
          wireDashSpeed: 0,
          wireStuckEnemyId: '',
          wireStuckUntil: 0,
          wireSlamEnemyId: '',
          wireSlamStart: 0,
          straps: (state.startWithTestStraps ? 1000 : 0) + scrapBuilderBonus,
          vaccineRevives: 0,
          equipment: runLoadout,
          equipBonus: runEquipBonus
        },
        // 登場演出をアーム(初フレームで終了時刻確定)。練習モードは演出なし。
        // チュートリアル(地下洞窟)もヘリ降下演出なし(社長指示v0.25.1818「何もかも無し。全てイベントで特別仕様のみ」)。
        // 洋館(corridorMode)はヘリ登場なし=走り込み入場(v0.25.2110・社長指示)。
        introUntil: (state.danceTestMode || farBackdrop === 'tutorial' || corridorMode) ? 0 : -1,
        corridorRunInActive: corridorMode,
        introDialogueActive: false,
        introDialogueStartedAt: 0,
        introDialogueShown: false,
        reaperCross: null,
        enemies: runEnemies,
        pickups: runPickups,
        projectiles: [],
        skadiIceMarkers: [],
        skadiIceBlades: [],
        homingLocks: [],
        shadowClone: null,
        groundFires: [],
  bossFires: [],
  gateActive: false,
  deepZoneLocked: false,
        rescueAllies: [],
        thrownBags: [],
        molotovCycle: null,
        sensorMines: [],
        sensorMineCharges: [],
        supportSniperCdMs: SUPPORT_SNIPER_CD_MS_BY_LEVEL[1],
        supportSniperNpc: null,
        flareGunFlares: [],
        firstAidKitState: createFirstAidKitState(),
        breakableProps: runBreakables,
        destroyedBreakableProps: {},
        mineAmbushAnchor: null,
        activeEvent: null,
        redNight: null,
        screamerBuffUntil: 0,
        eventBannerText: '',
        eventBannerUntil: 0,
        // 屋内は指定がない限り「最初の部屋に武器商人のみ」。ボス部屋(城)/二人組(クエストNPC)は不在。
        // 城/死神/クエストの“発生”は useGameLoop 側で既に !indoor ゲート済み。商人は最初の部屋へ配置。
        // 洋館通路: 城なし(v0.25.2144・社長指示「城も出現しないで」)。遥か遠方に置く=描画カリング/
        // 衝突/接近系が全て自然に無効。7分の城ボスはuseGameLoop側でcorridorModeゲート
        // (bossSpawnedはfalseのまま=画面端マーカーも出ない)。
        castleEvent: corridorMode ? { x: 100000, y: 100000, bossSpawned: false } : createCastleEvent(),
        weaponMerchant: indoor
          ? { x: LAB_MERCHANT.x, y: LAB_MERCHANT.y, radius: MERCHANT_INTERACT_RADIUS }
          // チュートリアル: 商人も出さない(社長指示v0.25.1818)。不在状態が型に無いため到達不能座標へ
          // (描画は画面外カリング・interactは距離判定=radius 0 で成立しない)。
          : farBackdrop === 'tutorial'
            ? { x: 1e9, y: 1e9, radius: 0 }
            : createWeaponMerchant(),
        // 二人組(クエストNPC): クエスト設定のあるステージ(1/3/4/5)のみ出現(社長裁定v0.25.1686 #6)。
        // サブ納品済みステージにも以後出現しない(そのプレイ中に消えないのは completeEventQuest 側)。
        eventQuestNpc: (() => {
          const qCfg = getEventQuestConfig(getSelectedStageId());
          const qGone = !qCfg || getEventQuestMeta(getSelectedStageId()).sub;
          return qGone ? { ...createEventQuestNpc(), status: 'gone' as const } : createEventQuestNpc();
        })(),
        eventQuestActive: null,
        eventQuestKills: 0,
        eventQuestGoalCount: 0,
        eventQuestGoalTier: null,
        gameTime: 0,
        realGameTime: 0,
        isPaused: false,
        showUpgradeMenu: false,
        showShopMenu: false,
        showEventQuestMenu: false,
        shopReopenAt: 0,
        merchantDwellMs: 0,
        eventQuestReopenAt: 0,
        vaccinePurchased: false,
        gameWon: false,
        finaleDefeated: false,
        baseSites: corridorMode ? [] : createBaseSites(), // 洋館通路は拠点なし(v0.25.2128・社長指示)
        // 護衛NPC: 屋外(非ラボ)のみ出撃地点に4人配置。屋内/ラボでは出さない。
        escorts: escortRoster,
        // 出撃時セリフ: 屋外(護衛NPCが居る出撃)のみ、実ロスターの1人をランダムで予約(フェイザー等の差し替えにも追従)。
        npcDialogue: null,
        npcDialogueNextAt: 0,
        npcSpokeAt: {},
        npcCatAt: {},
        npcDialogueQueue: sortieEsc && sortieSol
          ? [{ name: sortieSol.name, text: pickNpcLine(((sortieEsc.soldierIndex % BASE_SOLDIERS.length) + BASE_SOLDIERS.length) % BASE_SOLDIERS.length, 'sortie', sortieSol.sortie) }]
          : [],
        suppressionActive: state.pendingSuppression && !indoor && stageTheme !== 'lab',
        suppressionCaptureCount: 0,
        safeBaseId: null,
        // the ONE: ストーリーボス専用(M7/EX)/洋館再訪。pending→run状態へ(App.startGameがセット)。
        storyBossMode: state.pendingStoryBoss && !indoor && stageTheme !== 'lab',
        revisitMode: state.pendingRevisit && !indoor && stageTheme !== 'lab',
        medicineUsedAt: 0,
        medicinePromptVisible: false,
        // チュートリアル: 帰還サークルを最初から右3000px地点に常設(社長指示v0.25.1829)。
        // updateReturnPhaseは returnCircle があれば毎フレーム動く=3秒滞在で任務達成(既存経路)。
        // 洋館通路(corridorMode)も同方式で常設(社長指示v0.25.2132): 4000px付近のハッチ床上・5秒滞在=ゴール。
        returnCircle: farBackdrop === 'tutorial'
          ? { x: TUTORIAL_RETURN_CIRCLE_X, y: 0, radius: RETURN_CIRCLE_RADIUS, dwellMs: 0 }
          : corridorMode
            ? { x: 0, y: CORRIDOR_GOAL_Y, radius: RETURN_CIRCLE_RADIUS, dwellMs: 0 }
            : null,
        tutorialPopup: null,
        tutorialPopupShown: false,
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
          treasuresCollected: 0,
          damageTaken: 0,
          meleeFinishers: 0,
          eliteKills: 0,
          bossKills: 0,
          maxAreaReached: 0,
          maxDepthDist: 0,
          maxRankReached: 1
        },
        characterClass: validClass,
        effects: [],
        camera: {
          x: 0,
          y: 0
        },
        lastWeaponGet: null,
        hitstopUntil: 0,
  attention: null,
        timeSlowUntil: 0,
        timeSlowScale: 1,
        timeSlowStart: 0,
        timeSlowHoldMs: 0,
        shakeUntil: 0,
        shakeMag: SHAKE_MAG,
        shakeDur: SHAKE_MS,
        shakeDirX: 0,
        shakeDirY: 0,
        zoomUntil: 0,
        zoomMag: 0,
        zoomStart: 0,
        zoomHoldMs: 0,
        zoomHasTarget: false,
        zoomTargetX: 0,
        zoomTargetY: 0,
        lastKillZoomAt: 0,
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

  // 現地へカメラアテンション(時間停止)。fromCam=開始時カメラ(戻り先)。hitstop で全体凍結し、カメラだけ loop が動かす。
  triggerAttention: (x, y) => {
    const cam = get().camera;
    set({
      attention: { x, y, startReal: Date.now(), fromCamX: cam.x, fromCamY: cam.y },
      hitstopUntil: Date.now() + ATTENTION_TOTAL_MS,
    });
  },
  clearAttention: () => set({ attention: null }),

  triggerShake: (durationMs, mag = SHAKE_MAG, dirX, dirY) => {
    // 描画のみ。重なった時は「強い方(振幅)」を優先(弱い揺れが強い揺れを潰さない)。長さは延長。
    // §5.23 M22 C1: dirX/dirY指定時(かつ?dirfx=0でない)は正規化して保存し、弱い方(既存中)が
    // 強い揺れに上書きされる時と同じルールで、新しく始まる揺れの方向だけ差し替える。
    const now = Date.now();
    const dir = DIRFX_ENABLED ? normalizeDir(dirX ?? 0, dirY ?? 0) : { x: 0, y: 0 };
    set(state => {
      const active = now < state.shakeUntil;
      if (active && state.shakeMag >= mag) {
        return { shakeUntil: Math.max(state.shakeUntil, now + Math.max(0, durationMs)) };
      }
      return {
        shakeUntil: now + Math.max(0, durationMs), shakeMag: Math.max(0, mag), shakeDur: Math.max(1, durationMs),
        shakeDirX: dir.x, shakeDirY: dir.y,
      };
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
    get().triggerZoom(zoomMag, MELEE_FINISH_SLOW_MS, MELEE_FINISH_SLOW_HOLD_MS); // 即・寄り(スローと同期)
    if (get().rhythm.active) {
      get().triggerShake(shakeMs, shakeMag);
      return;
    }
    // ストップ開始時、進行中の(スイング等の)揺れを消す=ストップ後に出すこのインパクトの揺れだけ残す。
    set({ shakeUntil: 0 });
    get().triggerHitstop(stopMs);
    get().triggerTimeSlow(0.2, MELEE_FINISH_SLOW_MS, MELEE_FINISH_SLOW_HOLD_MS); // ストップから必ずスローで等速へ戻す(社長指示)
    setTimeout(() => get().triggerShake(shakeMs, shakeMag), Math.max(0, stopMs));
  },

  triggerFinishImpact: (targetX, targetY) => {
    const now = Date.now();
    if (!JUICE_ENABLED) {
      // ?juice=0: このバッチ以前の演出へ完全復帰(A/B比較用)。ズームだけCD、スロー/揺れは毎回。
      if (now - get().lastKillZoomAt >= MELEE_FINISH_ZOOM_CD_MS) {
        get().triggerZoom(MELEE_FINISH_ZOOM_MAG, MELEE_FINISH_ZOOM_MS, MELEE_FINISH_ZOOM_HOLD_MS, targetX, targetY);
        set({ lastKillZoomAt: now });
      }
      get().triggerTimeSlow(0.2, MELEE_FINISH_SLOW_MS, MELEE_FINISH_SLOW_HOLD_MS);
      setTimeout(() => get().triggerShake(MELEE_FINISH_SHAKE_MS, MELEE_FINISH_SHAKE_MAG), HITSTOP_MS);
      return true; // 旧仕様は常時「フル」扱い(呼び出し元の武器固有フラッシュ分岐に影響させない)
    }
    // PACING_PUZZLE.md §5.22 M21(社長決定v0.25.1524): 命中の瞬間にフリーズ+ズーム+スローが全部
    // 同時にピークする1拍エンベロープへ統一。全演出をJUICE_CD_MS(=現行のCD値のまま)で一括律速し、
    // CD明けの1キルだけフル(フリーズ→ズーム/スローが同じ長さ・同じholdで一緒に戻る)。
    // CD内のキルは最低保証の軽いフラッシュのみ(酔い/うざさ防止・社長実測v0.25.1523-1524)。
    const cdReady = shouldFireFullJuiceCinematic(now, get().lastKillZoomAt, JUICE_CD_MS);
    if (cdReady) {
      set({ lastKillZoomAt: now });
      get().triggerHitstop(HITSTOP_MS); // KILLにもカウンターと同じフリーズを追加(旧仕様は素通りだった)
      // ズームをスローと同じ長さ/holdへ統一(旧仕様の専用MELEE_FINISH_ZOOM_MS/HOLD_MSは使わない)。
      get().triggerZoom(MELEE_FINISH_ZOOM_MAG, MELEE_FINISH_SLOW_MS, MELEE_FINISH_SLOW_HOLD_MS, targetX, targetY);
      get().triggerTimeSlow(0.2, MELEE_FINISH_SLOW_MS, MELEE_FINISH_SLOW_HOLD_MS);
      setTimeout(() => get().triggerShake(MELEE_FINISH_SHAKE_MS, MELEE_FINISH_SHAKE_MAG), HITSTOP_MS);
    } else if (JUICE_MIN_FLASH_ENABLED) {
      get().spawnFlash('rgba(255,255,255,0.22)', JUICE_MIN_FLASH_MS);
    }
    return cdReady;
  },

  triggerZoom: (mag, durationMs, holdMs = 0, targetX, targetY) => {
    // 描画のみのパンチズーム。重なった場合は強い方/長い方を採用。ゲーム性(カメラ座標/判定)は不変。
    // holdMs: 最大ズームを保持する長さ(社長指示: ピークスロー=最大ズーム+テキスト最大の瞬間を
    // 保持してからフェードアウト。スロー(triggerTimeSlow)と同じhold-then-rampカーブ・同じ
    // 定数(MELEE_FINISH_SLOW_MS/HOLD_MS)を渡して同期させる=描画側はsrc/utils/timeSlowCurve.tsを
    // 流用して消費する)。
    // targetX/Y(世界座標・社長指示v0.25.1498): 指定時はその点を寄り先にする(KILL=キルされた対象)。
    // 未指定(カウンター等)は画面中央のまま。継続中(active)のズームは寄り先を変えず維持する
    // (寄っている最中に急に寄り先が飛ぶのを防ぐ=zoomStart/durationと同じ「継続扱い」の考え方)。
    const now = Date.now();
    const hasTarget = targetX !== undefined && targetY !== undefined;
    set(state => {
      const active = now < state.zoomUntil;
      return {
        zoomUntil: Math.max(active ? state.zoomUntil : 0, now + Math.max(0, durationMs)),
        zoomMag: Math.max(state.zoomMag, Math.max(0, mag)),
        zoomStart: active ? state.zoomStart : now,
        zoomHoldMs: active ? Math.max(state.zoomHoldMs, Math.max(0, holdMs)) : Math.max(0, holdMs),
        zoomHasTarget: active ? state.zoomHasTarget : hasTarget,
        zoomTargetX: active ? state.zoomTargetX : (hasTarget ? targetX : 0),
        zoomTargetY: active ? state.zoomTargetY : (hasTarget ? targetY : 0),
      };
    });
  },

  triggerTimeSlow: (scale, durationMs, holdMs = 0) => {
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
        // 保持時間も長い方を採用(重なった時に短い方へ縮めない)。
        timeSlowHoldMs: active ? Math.max(state.timeSlowHoldMs, Math.max(0, holdMs)) : Math.max(0, holdMs),
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

  // 指定方向へ円錐状に噴く粒子(被弾の背中側破裂など)。安価(粒子=既存プール、少数・短命)。
  spawnSpray: (x, y, dirX, dirY, count, colors) => {
    const now = Date.now();
    const base = Math.atan2(dirY, dirX);
    const SPREAD = 1.05; // 円錐の広がり(rad・±約30°)
    const fresh: VisualEffect[] = [];
    for (let i = 0; i < count; i++) {
      const ang = base + (Math.random() - 0.5) * SPREAD;
      const speed = 120 + Math.random() * 180; // 背中側へ勢いよく
      const color = colors[(Math.random() * colors.length) | 0] ?? '#fb923c';
      fresh.push({
        kind: 'particle',
        id: `fx-spray-${now}-${i}-${Math.random().toString(36).slice(2, 6)}`,
        x, y,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed,
        color,
        size: 1.6 + Math.random() * 2.2,
        createdAt: now,
        duration: 200 + Math.random() * 180, // 短命=積み重ねを抑える
        drag: 6,
      });
    }
    set(state => {
      const next = [...state.effects, ...fresh];
      if (next.length > 400) next.splice(0, next.length - 400);
      return { effects: next };
    });
  },
  spawnFireJet: (x, y, angle, len) => {
    const now = Date.now();
    const fx: VisualEffect = {
      kind: 'firejet',
      id: `fx-firejet-${now}-${Math.random().toString(36).slice(2, 6)}`,
      x, y, angle, len, createdAt: now, duration: 240, // 2コマを短く(burst→噴射→フェード)
    };
    set(state => {
      const next = [...state.effects, fx];
      if (next.length > 400) next.splice(0, next.length - 400);
      return { effects: next };
    });
  },
  // 銃弾ヒットの血飛沫(ZELTER風・社長指示v0.25.2027): (x,y)から方向angleへ円錐±20°で微粒子を噴き、重力で落とす。
  // 粒子数は len(=傷の勢い)に比例させ 22〜56 に収める。旧'blood'kindは発行しない(素材は残置)。
  spawnBlood: (x, y, angle, len) => {
    const now = Date.now();
    // グローバルキャップ: 生きている血粒子が上限を超えないよう、不足分だけ生成(超過分はスキップ)。
    const alive = countBloodParticles(get().effects);
    const room = BLOOD_PARTICLE_CAP - alive;
    if (room <= 0) return; // 既に上限=1粒も足さない(setも呼ばない=無駄な購読者起こしを避ける)
    const desired = Math.max(22, Math.min(56, Math.round(len / 4))); // 粒数+25%(社長指示v0.25.2058もう少し増量)
    const fresh = buildBloodBurst(x, y, angle, Math.min(desired, room), now);
    set(state => {
      const next = [...state.effects, ...fresh];
      if (next.length > 400) next.splice(0, next.length - 400);
      return { effects: next };
    });
  },
  // 近接の血飛沫(社長指示v0.25.2026→2027で粒子化): 敵(ex,ey)から【プレイヤーに向かって】飛ぶ。方向は内部計算。
  // 起点=敵中心をプレイヤー側へ少し寄せた点(斬った面)。勢い(len)規則は銃と同じ(×4.0・最低96px)。
  spawnMeleeBlood: (ex, ey, size = 40) => {
    const now = Date.now();
    const p = get().player;
    const pcx = p.x + p.width / 2, pcy = p.y + p.height / 2;
    let dx = pcx - ex, dy = pcy - ey;
    const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
    const alive = countBloodParticles(get().effects);
    const room = BLOOD_PARTICLE_CAP - alive;
    if (room <= 0) return;
    const len = Math.max(96, size * 4.0);
    const desired = Math.max(22, Math.min(56, Math.round(len / 4))); // 粒数+25%(社長指示v0.25.2058もう少し増量)
    const fresh = buildBloodBurst(
      ex + dx * size * 0.4, ey + dy * size * 0.4, // 起点=既存計算のまま(斬った面)
      Math.atan2(dy, dx), Math.min(desired, room), now,
    );
    set(state => {
      const next = [...state.effects, ...fresh];
      if (next.length > 400) next.splice(0, next.length - 400);
      return { effects: next };
    });
  },
  spawnBurst: (x, y, color, count = 6, dirX, dirY) => {
    const now = Date.now();
    // §5.23 M22 C1: 方向指定(かつ有効長)なら円錐(spawnSprayと同じ角度)へ絞る。無指定/{0,0}は
    // 従来どおり全方位(既存の呼び出し元は全てそのまま=挙動不変)。
    const dir = DIRFX_ENABLED ? normalizeDir(dirX ?? 0, dirY ?? 0) : { x: 0, y: 0 };
    const directed = dir.x !== 0 || dir.y !== 0;
    const fresh: VisualEffect[] = [];
    for (let i = 0; i < count; i++) {
      const angle = directed ? biasedBurstAngle(dir.x, dir.y, Math.random()) : Math.random() * Math.PI * 2;
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
      value: Math.max(1, Math.ceil(value)), // 表示ダメージは切り上げ(社長指示・最低1)。内部の実ダメージは丸めない
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
      bg: opts?.bg,
      holdMs: opts?.holdMs,
      createdAt: now,
      duration: opts?.duration ?? (opts?.serif ? 1000 : 850)
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
    // 斬撃の向き=プレイヤーの向き(右=左下→右上 / 左=反転)。レンダラの facingLeft 判定と同じ規則。
    const p = get().player;
    const facingLeft = p.direction === 'left' || (p.lastDirection != null && p.lastDirection.x < 0);
    const face = facingLeft ? -1 : 1;
    set(state => {
      const next = [...state.effects, {
        kind: 'slash' as const,
        id: `fx-slash-${now}-${Math.random().toString(36).slice(2, 6)}`,
        x: x + (Math.random() - 0.5) * 8,
        y: y + (Math.random() - 0.5) * 8,
        angle: -0.9 + Math.random() * 0.5, // roughly diagonal, slight variance
        length: (72 + Math.random() * 16) * lengthScale, // 斬撃をもっと大きく(社長指示。旧 44+12)
        color,
        createdAt: now,
        duration: 260, // 少し長く残す(旧 200)
        face,
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
          const g = e.gravity ?? 0; // 血飛沫だけ重力で常に下へ落ちる(未指定=0で従来挙動不変)
          live.push({
            ...e,
            x: e.x + e.vx * deltaTime,
            y: e.y + e.vy * deltaTime,
            vx: e.vx * decay,
            vy: e.vy * decay + g * deltaTime
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
  },

  // PACING_PUZZLE.md §5.17 M14: 中格=帯。実時間(Date.now)基準=スロー/ヒットストップの影響を受けない。
  triggerWallBand: (text, color, durationMs) => {
    set({ wallBandText: text, wallBandUntil: Date.now() + durationMs, wallBandColor: color });
  },

  // 大格=銘打ちキューへ追加。先頭(表示中の可能性がある分)は動かさず、それ以降を優先順で並べ替える
  // (演出仕様v0.25.1499: 「両軸が同時に起きたら深さ優先」。sortWallEventsByPriorityで検証済み)。
  enqueueWallEvent: (kind, title, sub, color, gold) => {
    set(state => {
      const newEvent: WallInscriptionEvent = { id: state.wallEventSeq + 1, kind, title, sub, color, gold };
      const [head, ...rest] = state.wallEventQueue;
      const tail = sortWallEventsByPriority([...rest, newEvent]);
      return {
        wallEventQueue: head !== undefined ? [head, ...tail] : tail,
        wallEventSeq: state.wallEventSeq + 1,
      };
    });
  },

  dequeueWallEvent: () => set(state => ({ wallEventQueue: state.wallEventQueue.slice(1) })),
}));

// DEVビルド限定のデバッグハンドル(__pixiSceneと同じ趣旨・v0.25.1831)。ヘッドレス実機テストが
// page.evaluateからstoreの実値を読む/captureFrameを叩くために使う。本番ビルドでは付かない。
if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__gameStore = useGameStore;
}

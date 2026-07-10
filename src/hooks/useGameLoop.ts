import { useCallback, useEffect, useRef, useState } from 'react';
import {
  useGameStore,
  INVULN_MS,
  STUN_DURATION_MS,
  CRIT_DAMAGE_MULT,
  BOSS_CRIT_DAMAGE_MULT,
  PLAYER_BASE_SPEED,
  isKatanaMode,
  subWeaponBlockedByKatana,
  katanaRange,
  KATANA_SLASH_INTERVAL_MS,
  huntingMeleeRadius,
  PLAYER_INTRO_MS,
  PLAYER_INTRO_HELI_FRAC,
  playerIntroOffset,
  playerIntroCamFollow,
  CAMERA_INTRO_LIFT_FRAC,
  INTRO_DIALOGUE_TRIGGER_T,
  introDialogueTotalMs,
  INTRO_LAND_SHAKE_MS, INTRO_LAND_SHAKE_MAG, REAPER_SUMMON_SHAKE_MS, REAPER_SUMMON_SHAKE_MAG,
  COUNTER_HITSTOP_MS, COUNTER_SHAKE_MS, COUNTER_SHAKE_MAG, COUNTER_ZOOM_MAG, SHIJIN_TECH_SHAKE_MS, SHIJIN_TECH_SHAKE_MAG,
  SHIELD_BLOCK_SHAKE_MS, SHIELD_BLOCK_SHAKE_MAG,
  DRONE_BOOM_RADIUS, DRONE_BOOM_PULSE_MS, DRONE_BOOM_STOP_DMG_DIV,
  CAMERA_FOLLOW_TAU, CAMERA_DANGER_TAU, CAMERA_RETURN_TAU, CAMERA_LOOKAHEAD_MAX,
  CAMERA_CENTER_CLAMP_FRAC, CAMERA_DANGER_RADIUS, CAMERA_SNAP_DIST, CAMERA_DOWN_OFFSET_FRAC,
  WIRE_LAND_KNOCKBACK_SPEED, WIRE_PASS_DAMAGE_MULT, WIRE_BOMB_RADIUS, WIRE_BOMB_DAMAGE_MULT, WIRE_PASS_BOMB_RADIUS,
  BOSS_MELEE_STUN_MULT,
  KNOCKBACK_DURATION, KNOCKBACK_IMMUNE_MS,
  skillCritMult, skillOutgoingDamageMult, sniperGunMult, skillExplosionMult, hasSkill, skillLevel, skillComboMasterMult,
  skillSummonHpMult, heavyGunnerExplosionMult, enemyDeathLabel, isInReturnCircle, isGameTimeStopped, enemyMeleeDist,
  ATTENTION_IN_MS, ATTENTION_HOLD_MS, ATTENTION_OUT_MS, ATTENTION_TOTAL_MS,
  ENEMY_REMOVE_CAUSE, BASE_CAPTURE_RADIUS, PRAISE_WINDOW_MS, PRAISE_KILL_COUNT,
  HUNTER_VISION_RANGE, HUNTER_LEAVE_FADE_MS, AMMO_MAX,
  MELEE_FINISH_SLOW_MS, MELEE_FINISH_SLOW_HOLD_MS, PUMPKIN_EXPLOSION_RADIUS, WALL_ENABLED,
  RN_ENEMY_FORCE
} from '../store/gameStore';
import { isPlayerInAttackTelegraph } from '../utils/levelUpGate';
import {
  detectWallBreach, isFirstWallBreach, isApproachingWall, markWallBreached, markSelfDeepest,
} from '../utils/wallProgress';
import { pickAmmoDropType } from '../utils/ammoDrop';
import {
  applyPumpkinBlastDamage, applyEnemyFire, applyEnemyProjectileHits, applyMineDamage, applyContactDamage,
  type CombatEffects, type CombatTunables,
} from '../utils/combatTick';
import { weaknessCritBonus } from '../utils/weaknessCrit';
import { applyEnemyCritPenalty } from '../utils/critPenalty';
import { computeTimeSlowScale } from '../utils/timeSlowCurve';
import { isPixiRenderer } from '../config/renderer';
import { GAME_SPEED } from '../config/gameSpeed';
import { LAB_OUTER_BOUNDS, labBlockingWalls } from '../world/labMap';
import { segmentBlocked, type Rect } from '../world/obstacles';
import { treesInRegion, trunkRect } from '../world/trees';
import { cityPropsInRegion, cityPropRect } from '../world/cityProps';
import { markObstacleDestroyed } from '../world/destructibles';
import { rollWeaponKey } from '../utils/weaponDrop';
import type { AmmoType, Pickup, Projectile, EnemyType } from '../types/game';
import {
  checkCollision,
  checkProjectileEnemyCollisions,
  checkPlayerPickupCollisions,
  checkEnemySummonCollisions
} from '../utils/collisionUtils';
import {
  createEnemyProjectile,
  generateEnemy,
  getEnemySpawnCount,
  getEnemySpawnInterval,
  isBossType,
  isHiddenBoss,
  spawnEnemyAt,
  spawnEnemyAtWithTier,
  selectLabEnemyType,
  resolveEnemyTarget,
  AREA_ZONE_NAMES,
  AREA_THRESHOLDS
} from '../utils/enemyUtils';
import { labZoneKey, LAB_START_SAFE_RADIUS } from '../world/labWalls';
import { RESCUE_RADIUS, RESCUE_ATTACKERS } from '../world/rescue';
import { bossLairPos, poiSectorIndex } from '../world/pois';
import { ALCHEMY_CHANNEL_MS } from '../utils/summonUtils';
import { resolveAabb, rectsOverlap } from '../world/obstacles';
import { consumeDueWaves, newConsumedWaves } from '../utils/stageDirector';
import { phaseAt, sceneAt } from '../utils/difficultyDirector';
import { spawnEscalation, gateLiveCorrection } from '../utils/difficultyScaler';
import { createDirectorState, relaxSpawnAdjust, buildupSpawnAdjust } from '../utils/aiDirector';
import { resetDirectorSamples } from '../utils/aiDirectorDebug';
import { evaluatePhasePerformance, rankFromPerformance, rankAdjustFor } from '../utils/directorRank';
import { setDirectorRankRewardMult, setDirectorRankDebug } from '../utils/directorRankState';
import { createPinchState, pityLevel } from '../utils/pityDirector';
import { createBoredomState, stepBoredom, boredomBonus } from '../utils/boredomDirector';
import { shouldFireBoredomArena, BOREDOM_ARENA_START_MS, BOREDOM_ARENA_CD_MS } from '../utils/boredomArena';
import { shouldTriggerViciousHunter, pickViciousSpawnPoint, VICIOUS_REARM_MS } from '../utils/viciousHunter';
import {
  eventGateOk, redNightPhaseGateOk, screamerPhaseGateOk, hunterBoredomReady, eventSizeMult,
} from '../utils/eventProducer';
import {
  createGatePressureState, stepGatePressure, startPressureForRank,
  intervalMultForPressure, capBonusForPressure, rareBoostActiveForPressure,
  allowedProblemChildren, specialCastOrder, ceilingForMaxRung, ceilingForZone,
  type ProblemChild
} from '../utils/gatePressure';
import { setGatePressureDebug } from '../utils/gatePressureState';
import { pickChaffMix } from '../utils/chaffMix';
import { shouldGuaranteeSpawn, type GuaranteeType } from '../utils/featureGuarantee';
import {
  createPuzzleClockState,
  createKomaAccumulator,
  createSoftenState,
  clampRank,
  type PuzzleClockState, type KomaAccumulatorState, type SoftenState, type RankDelta,
} from '../utils/rankAssessor';
import {
  ZERO_NUISANCE,
  selectPattern,
  nuisanceTarget,
  type FormationPattern, type NuisanceCounts, type KomaKind4, type ChaffRampState, type NuisanceType,
} from '../utils/scriptPuzzle';
import { shouldTriggerGate1, entersGate1Penalty, effectiveReaperRiskFloor } from '../utils/gate1';
import { shouldTriggerGate2 } from '../utils/gate2';
import { setPuzzleDebug, getPuzzleDebug } from '../utils/puzzleState';
import {
  computeDirCountCap, computeEnemyCap, computeNormalSpawnCap,
  runPityUpkeep, runKomaBoardMaintenance, runOffscreenRecycleAndCull, runDirectorSignalStep,
} from '../utils/directorTick';
import { debtFor, debtTempoEaseMult, CAST_DEBT_MAX } from '../utils/boardDebt';
import { resetPityDrop } from '../utils/pityState';
import {
  getKillTotals, resetKillTelemetry, setPhaseKillDebug, resetPhaseKillDebug, getCurrentStyle, getLastKillAt,
  getPhaseKillDebug, snapshotKillTotals, snapshotSpawns
} from '../utils/killTelemetryState';
import type { KillBucket } from '../utils/killTelemetry';
import { isInRefractory } from '../utils/killTelemetry';
import { selectReliefProgram, type ReliefProgram } from '../utils/reliefProgram';
import { setReliefProgramDebug } from '../utils/reliefProgramState';
import { selectGateProgram, type GateProgram, type GateProgramId } from '../utils/gateProgram';
import { setGateProgramDebug } from '../utils/gateProgramState';
import { stageAggroFor, riseTauSForAggro, boredStartMsForAggro, gateMaxRungClampForAggro, STAGE_AGGRO_DEFAULT } from '../utils/stageAggro';
import { getSelectedStageId, getWallMeta, setWallMeta, getGateMeta, setGateMeta, emptyGateMeta, type GateMeta } from '../data/progress';
import { recordHeartbeat, readHeapMB } from '../utils/crashDiagnostics';
import { contextZoomTarget, isLargeForZoom } from '../utils/cameraZoom';
import { fireWeapon, getActiveGun, getGuns, ammoPoolFor, effectiveMagSize, effectiveReloadMs, RANGE_BY_CATEGORY } from '../utils/weaponUtils';
import { playSfx, playEnemyDeath, setHurricaneRumble, setHeartbeatLoop, setPeakLayer, setDanceMode, getDanceBeatAnchorMs, prepareDeepReverseBgm, enterDeepReverseBgm, exitDeepReverseBgm, releaseDeepReverseBgm, scheduleDanceBeatKick, setDanceBeatDuck } from '../audio/audioManager';
import { nextBeatToSchedule } from '../utils/danceBeat';
import { HUNTING_CHARGE_MS_BY_LEVEL } from '../config/hunting';
import { REAPER_CONFIG, REAPER_TEST, getReaperChaseSpeed, reaperPassIntervalMs } from '../config/reaper';
import {
  RHYTHM_ENTER_IDLE_MS, RHYTHM_EXIT_MOVE_MS, rhythmIntervalForLevel, RHYTHM_LEAD_MS, rhythmBeatOffsetForLevel,
  RHYTHM_SUCCESS_WINDOW_MS, RHYTHM_RESYNC_MS, RHYTHM_RESYNC_MIN_MS,
  RHYTHM_TAP_DAMAGE, RHYTHM_TAP_KNOCKBACK_MULT,
  RHYTHM_FLICK_RANGE, RHYTHM_FLICK_HALF_W, RHYTHM_FLICK_DAMAGE, RHYTHM_FLICK_KNOCKBACK_MULT, RHYTHM_FLICK_KNOCKBACK_MAX,
  SUZAKU_MAX_TARGETS, SUZAKU_BLAST_DAMAGE,
  GENBU_LINE_LENGTH, GENBU_LINE_HALF_W, GENBU_DAMAGE,
  SEIRYU_LINE_LENGTH, SEIRYU_LINE_HALF_W, SEIRYU_DAMAGE,
  BYAKKO_RANGE, BYAKKO_DAMAGE, BYAKKO_MAX_HITS,
  SHIJIN_FINISH_BOSS_DAMAGE, SHIJIN_FINISH_SCREEN_MARGIN,
} from '../config/shijin';
import type { RhythmArrow, RhythmPending, ShijinGod } from '../types/game';

// ゲームプレイ中の「プレイヤーの移動」と「敵の移動」だけを倍速にする係数。
// movePlayer / updateEnemies に渡す deltaTime にのみ掛ける(弾・召喚・軍人・進行・演出・
// スポーンは等速のまま)。すぐ戻せるよう単一定数で管理: 1.0 = 従来等速 / 1.2 = 現在。
const MOVE_SPEED_MULT = GAME_SPEED; // ゲームスピード(?speed=で調整)。既定1.2。プレイヤー/敵の移動テンポ。

// 被弾時の「背中側にドバッと火」破裂演出: 2コマ立ち絵(spawnFireJet)＋根元の小グロー1個。
// 背中火の長さ(px)は敵サイズ非依存で、撃った銃の系統で変える(社長指示)。
//  マグナム系(rifle=マグナム/スナイパー/ランチャー)= 現状サイズ。ハンドガン系 = 気持ち小さい。
//  ショットガン系 = 同一フレームに同じ敵へ当たったペレット数で 1発→ハンドガン / 2発→マグナム / 3発以上→少し大きく。
//  上記以外(PHILL/護衛/サブ武器など未指定)はマグナム系=現状サイズを既定とする。
const HIT_FIRE_LEN_MAGNUM = 50;       // マグナム系列(=現状)
const HIT_FIRE_LEN_HANDGUN = 42;      // ハンドガン系列(気持ち小さい)
const HIT_FIRE_LEN_SHOTGUN_BIG = 58;  // ショットガン3発以上(少し大きく)
// 撃った系統+ショットガンのペレット数から背中火の長さを決める。
const hitFireLen = (weaponType: string | undefined, shotgunPelletHits: number): number => {
  if (weaponType === 'handgun') return HIT_FIRE_LEN_HANDGUN;
  if (weaponType === 'shotgun') {
    return shotgunPelletHits >= 3 ? HIT_FIRE_LEN_SHOTGUN_BIG
      : shotgunPelletHits === 2 ? HIT_FIRE_LEN_MAGNUM
      : HIT_FIRE_LEN_HANDGUN;
  }
  return HIT_FIRE_LEN_MAGNUM; // rifle(マグナム系)/PHILL/その他は現状サイズ
};
// 護衛NPC関連SEの距離減衰ゲイン(発砲音＝NPC位置 / その弾の被弾音＝着弾位置 で共通)。画面外=0(無音)。
// 近=1.0 / 画面中ほど≈0.27 / 端≈0.08(遠いほど強く減衰)。プレイヤー自身の攻撃音には使わない。
const npcSfxDistGain = (
  hx: number, hy: number, ppx: number, ppy: number,
  cam: { x: number; y: number }, gb: { width: number; height: number },
): number => {
  if (hx < cam.x || hx > cam.x + gb.width || hy < cam.y || hy > cam.y + gb.height) return 0;
  const maxDist = 0.5 * Math.hypot(gb.width, gb.height);
  const tt = Math.min(1, Math.hypot(hx - ppx, hy - ppy) / maxDist);
  return Math.max(0.08, Math.pow(1 - tt, 1.9));
};
// 同じ敵に対して背中火を出してから、この時間は新しい火を出さない(=多弾/連射の重複を1本に間引く)。
// ショットガンのペレットや跳弾が別方向から当たっても、最初の1本だけ残す→「2本/別方向に出る」を防ぐ。
const FIRE_JET_DEDUP_MS = 180;

const GRENADE_WEAPON_KEY = 'rifle-t3';
const SMG_WEAPON_KEY = 'handgun-t3'; // マシンピストル(=サブマシンガン)。発射音を通常ハンドガンと分けるのに使用。
const GRENADE_BLAST_RADIUS = 92;
const GRENADE_BLAST_DAMAGE_MULT = 0.62;
// スキル: ボムカウンター = カウンター成立の瞬間にもプレイヤー中心で爆発(反射弾の爆発に加えて)。
// 威力は反射神経の反撃爆発と同等のランチャー級フラット値(要実機調整)。
const BOMB_COUNTER_BLAST_DAMAGE = 60;
const HEAVY_GRENADE_COOLDOWN_MS = 5000;
const HEAVY_GRENADE_FUSE_MS = 2000;
const HEAVY_GRENADE_RADIUS = 66;
const HEAVY_GRENADE_DAMAGE = 42;
const HEAVY_GRENADE_SPEED = 118;
const HEAVY_GRENADE_KNOCKBACK_MULT = 3.6;
const MARKSMAN_TRAP_COOLDOWN_MS = 6500;
const MARKSMAN_TRAP_DURATION_MS = 9000;
const MARKSMAN_TRAP_STUN_MS = 3000;
const MARKSMAN_TRAP_CRIT_BONUS = 0.10;
const MARKSMAN_TRAP_RADIUS_BY_LEVEL = [0, 50, 78, 106]; // レベルで範囲を明確に拡大(+28/Lv。旧44/52/60)
const STRIKER_QUICK_MAG_COOLDOWN_BY_LEVEL = [0, 10000, 8000, 6000];
const STRIKER_QUICK_MAG_THROW_DISTANCE = 82;
const STRIKER_QUICK_MAG_THROW_MS = 360;
const DOG_PICKUP_COOLDOWN_BY_LEVEL = [0, 900, 760, 620];
const DOG_EMPTY_RETRY_MS = 260;
const DOG_FETCH_TARGET_RADIUS_BY_LEVEL = [0, 240, 310, 380];
const DOG_COLLECT_RADIUS_BY_LEVEL = [0, 48, 64, 80];
const DOG_COLLECT_BURST_LIMIT = 8;
const DOG_FETCH_PICKUP_MS = 330;
const DOG_FETCH_DURATION_MS = 620;
// ドッグは移動軌道上の敵を噛む(小ダメージ+小ノックバック)。1往復につき同じ敵は1回だけ。
const DOG_BITE_RADIUS = 28;
const DOG_BITE_DAMAGE = 6;            // TODO(ドッグ): 小ダメージ。仮値
const DOG_BITE_KNOCKBACK_MULT = 0.8;  // 小ノックバック
// デコイ: 進行方向へ投げる円盤型の弾迎撃装置。設置中0.5秒ごとに、射程内の
// 最も近い敵弾を1発だけ迎撃して消す(高速弾の取りこぼしは許容)。
const DECOY_COOLDOWN_MS = 10000;                  // 全Lv共通
const DECOY_DURATION_BY_LEVEL = [0, 7000, 8000, 9000]; // 設置持続(Lv1/2/3)
const DECOY_PULSE_MS = 200;                       // 迎撃間隔(全Lv共通)。0.2秒ごとに1発サーチ
const DECOY_THROW_DISTANCE = 78;                  // TODO(デコイ): 仮値。投げる距離
const DECOY_THROW_MS = 240;                       // TODO(デコイ): 仮値。着地までの時間
// 射程(Lv別)。Lv3でスマホ縦の画面横幅(~400px)にギリギリ収まる半径(~200)が目安。
// 距離は二乗比較。射程値はデコイ projectile の `area` に載せ、描画側・迎撃側で共有する。
const DECOY_RANGE_BY_LEVEL = [0, 120, 160, 200];
const DECOY_FOOT_W = 48;   // デコイの当たり判定幅(敵のみ通行不可。プレイヤーは通す)
const DECOY_FOOT_H = 20;   // デコイの当たり判定奥行
// Lv3 限定: 寿命切れ(自然消滅)時の小爆発。
// ホーミング弾: ロック射程とLv別最大ロック数。ダメージ/速度/CD/サイズは gameStore 側定数。
const HOMING_RANGE = 120;                      // ショットガンと同じ近接射程
const HOMING_MAX_LOCKS_BY_LEVEL = [0, 3, 6, 10]; // Lv別最大ロック数
const HOMING_LOCK_INTERVAL_MS = 500;           // ロック付与間隔(0.5秒に1体ずつ)範囲ダメージ+ノックバック+演出。投げ直し/
// 帰還サークル撤去では爆発しない(連投悪用防止=直接 removeProjectile はこの寿命判定を通らない)。
const DECOY_LV3_EXPLOSION_RADIUS = 96;  // TODO(デコイLv3): 仮値。迎撃射程200より控えめ
const DECOY_LV3_EXPLOSION_DAMAGE = 40;  // TODO(デコイLv3): 仮値。タレット36より少し上
const DECOY_LV3_KNOCKBACK_MULT = 2.4;   // TODO(デコイLv3): 仮値。手榴弾3.6より控えめ
// 設置型シールド: 進行方向の反対側に建てる遮蔽壁。敵の通行を止め、敵弾を消す
// (味方弾は貫通)。設置間隔/持続は全Lv共通、レベルで耐久だけ上がる。各値は独立に
// 調整できるよう分離(座標=PLACE_DISTANCE / 形=LENGTH,THICKNESS / 耐久=HP_BY_LEVEL)。
const SHIELD_COOLDOWN_MS = 6000;             // 設置間隔(全Lv共通)
const SHIELD_DURATION_MS = 5000;             // 持続(全Lv共通)。duration 自動カリングで消滅
const SHIELD_HP_BY_LEVEL = [0, 10, 30, 60];  // 耐久(Lv1/2/3)。被ダメージは敵種×状態で変動(shieldContactDamage)
// 盾への被ダメージ表(社長指定)。接触は SHIELD_HIT_INTERVAL_MS ごとに1回・状態(突進/ジャンプ)で増える。
// 犬(werewolf/lab-zombie-2): 通常5/ダッシュ(charge)10。パンプキン: 通常10/ジャンプ30。
// 城ボス(giantbat)・死神(reaper)・裏ボス: 通常10/ダッシュ(charge)30/ジャンプ30、弾1発=10。その他雑魚=通常1。
const shieldContactDamage = (enemy: { type: EnemyType; aiPhase?: string; bossState?: string }): number => {
  const t = enemy.type;
  if (t === 'werewolf' || t === 'lab-zombie-2') return enemy.aiPhase === 'charge' ? 10 : 5;
  if (t === 'pumpkin') return enemy.aiPhase === 'jump' ? 30 : 10;
  if (t === 'giantbat' || t === 'reaper' || isHiddenBoss(t)) {
    if (isHiddenBoss(t)) return enemy.bossState === 'dash' ? 30 : 10; // 裏ボスは bossState で突進判定
    if (enemy.aiPhase === 'jump' || enemy.aiPhase === 'charge') return 30;
    return 10;
  }
  return 1; // その他の雑魚は微量
};
// 敵弾が盾に当たった時の被ダメージ。城ボス/死神/裏ボスの弾は10、その他は1。
const shieldBulletDamage = (ownerType?: EnemyType): number =>
  (ownerType === 'giantbat' || ownerType === 'reaper' || (ownerType !== undefined && isHiddenBoss(ownerType))) ? 10 : 1;
const SHIELD_PLACE_DISTANCE = 34;            // プレイヤー中心から設置足元までの距離
// 当たり判定は木と同じく「下部のみ」の小さなフットプリント(敵もプレイヤーも貫通不可)。
// スプライトはこの足元から上へ伸びる。絵に合わせた範囲。実機で微調整(TODO)。
const SHIELD_FOOT_W = 108;                    // 面の幅(=遮断/効果範囲の横幅)。見た目より広い(中心から両サイド均等)
const SHIELD_FOOT_H = 16;                     // フットプリント奥行(下辺=足元、縦の厚み)
const SHIELD_SIDE_DROP = 18;                  // 左右向き時、当たり/効果範囲(と絵)を下へずらす量
const SHIELD_HIT_INTERVAL_MS = 400;          // 同一敵が連続で耐久を削る最短間隔
const SHIELD_KNOCKBACK_MULT = 1.4;           // 接触した敵を外向きへ弾く強さ(store側で≤3にクランプ)
// 自動タレット: 10秒ごとにプレイヤー少し前方へ設置する定点支援。設置地点に留まり一定時間
// オート射撃。デフォルト=前方集中(ティア3SMG=handgun-t3 相当/長射程の直線制圧)。叩くと
// 全方位(ハンドガン=handgun-t1 相当/短射程の周囲対応)へ切替。通常弾の代わりに低確率で
// グレネード弾(既存ヘビーグレネードを流用)。消滅時に小爆発。数値は実機調整前提(TODO)。
const TURRET_COOLDOWN_MS = 10000;                       // 設置間隔(全Lv共通10秒)
const TURRET_DURATION_BY_LEVEL = [0, 15000, 15000, 15000]; // 持続を3倍(5s→15s)。Lv2/3はTODO(暫定据置)
const TURRET_FOOT_W = 30;                               // 当たり判定幅(叩く判定/設置足元)
const TURRET_FOOT_H = 18;                               // 当たり判定奥行(下辺=足元)
const TURRET_PLACE_FORWARD = 24;                        // プレイヤー中心から進行方向へ置く距離
const TURRET_FWD_FIRE_MS = 130;                         // 前方集中の発射間隔(handgun-t3のcooldown=100msよりやや遅め。値は意図した実値・GAME_AUDIT #13で注釈修正)
const TURRET_FWD_DAMAGE = 5;                            // 前方集中の弾ダメージ(社長指示で7→5)
const TURRET_FWD_BULLET_SPEED = 560 * 1.5;             // handgun-t3 projectileSpeed × PROJECTILE_SPEED_MULT(1.5)
const TURRET_FWD_RANGE = 420;                           // 前方集中の射程(長射程)。TODO: 実機調整
const TURRET_FWD_LINE_HALF_W = 60;                      // 前方制圧の射線帯の半幅(この帯内の敵がいる時だけ撃つ)
const TURRET_SCAN_SPEED = 1.1;                          // 索敵スキャンの回転速度(rad/sec。射程に敵がいない時)
const TURRET_OMNI_FIRE_MS = 420;                        // 全方位の発射間隔(handgun-t1 cooldown 相当)
const TURRET_OMNI_DAMAGE = 9;                           // 全方位の弾ダメージ(handgun-t1 相当)
const TURRET_OMNI_BULLET_SPEED = 520 * 1.5;            // handgun-t1 projectileSpeed × PROJECTILE_SPEED_MULT(1.5)
const TURRET_OMNI_RANGE = 200;                          // 全方位の射程(短射程)。TODO: 実機調整
const TURRET_BULLET_SIZE = 7;
const TURRET_GRENADE_CHANCE = 0.10;                     // 通常弾の代わりにグレネードランチャー弾を撃つ確率(全モード共通)
const TURRET_LAUNCHER_DAMAGE = 44;                      // タレットのグレネードランチャー弾の直撃ダメージ(手榴弾とは別物)
const TURRET_EXPLOSION_RADIUS = 64;                     // 消滅時の小爆発・範囲。TODO: 実機調整(既存爆発演出を流用)
const TURRET_EXPLOSION_DAMAGE = 36;                     // 消滅時の小爆発・威力。TODO: 実機調整
// 発火ナイフ(通常サブウェポン): クールダウンごとに敵1体へナイフを自動投擲。命中で刺さり、
// 単体ダメージ→2秒後に刺さった位置(敵に追従)で範囲爆発。敵を爆弾化する遅延範囲武器。
const FIRE_KNIFE_COOLDOWN_BY_LEVEL = [0, 8000, 7000, 6000]; // Lv1=8s / Lv2=7s / Lv3=6s
const FIRE_KNIFE_FUSE_MS = 2000;                            // 刺さってから爆発までの遅延(全Lv共通)
const FIRE_KNIFE_RADIUS_BY_LEVEL = [0, 80, 94, 108];        // 爆発半径(Lv1/2/3)。社長指示で範囲アップ(旧54/62/70)
const FIRE_KNIFE_SPEED = 300;                               // 投擲速度(px/s)
const FIRE_KNIFE_FLIGHT_MS = 1200;                          // 飛行寿命。これを超えて未命中なら消滅(外れ)
const FIRE_KNIFE_HIT_DAMAGE = 24;                           // TODO(発火ナイフ): 命中時単体ダメージ。仮値。手榴弾直撃42より低め
const FIRE_KNIFE_EXPLOSION_DAMAGE = 30;                     // TODO(発火ナイフ): 爆発ダメージ。仮値。手榴弾42より低め(2段ヒットなので抑えめ)
const FIRE_KNIFE_KNOCKBACK_MULT = 1.6;                      // 爆発の軽いノックバック(吹き飛ばし主目的ではない)
const FIRE_KNIFE_EXPLOSION_EFFECT_MS = 420;                 // 爆発演出の長さ
const GRENADE_SPREAD_BY_LEVEL: Record<number, number[]> = {
  1: [0],
  2: [-0.9, 0.9],
  3: [0, (Math.PI * 2) / 3, -(Math.PI * 2) / 3]
};
const MAX_ENEMIES = 10;
// 保証出現(plant1分/犬3分・エリア不問)はPACING_REDESIGN.mdバッチ1.5で撤廃(社長決定)。
// ジャイアント(城ボス)出現後、近づくまで城で待機する索敵範囲(これより近づくと起動)。
const GIANT_AGGRO_RANGE = 380;
// イベント出現の敵(囲い系=プレイヤー狙い)も「近づくまで向かってこない」。プレイヤーの周囲に湧くので
// この範囲なら出現直後にプレイヤーが居れば即起動する(救助の対NPC攻撃者・卵=静止プロップは対象外)。
const EVENT_SPAWN_AGGRO_RANGE = 300;

// --- 囲い系イベント(小イベント=強制アリーナ戦/ミニボス戦) ---
const ARENA_EVENT_CAP = 20;            // イベント中の同時敵上限(通常10→20。終了で10へ戻す)
const ARENA_EVENT_RADIUS = 240;        // 囲い半径(閉じ込め円)。社長指示で少し拡大: 210→240(horde/boss/egg 共通)
const GATE_ARENA_RADIUS = 300;         // §5.21-追補7: ゲート1/ゲート2専用の広め半径(240→300・ゲート限定)。他イベント(horde/boss/egg)は ARENA_EVENT_RADIUS のまま。
const GATE_FAIL_KNOCKBACK_MARGIN = 400; // §5.21-追補6: ゲート失敗時に境界より内側へ押し戻す距離(叩き台・実機調整)
// 大量発生(horde)の段階スポーン(1秒に1体・計18体)は、湧き位置をイベント中心(=開始時のプレイヤー位置で固定)
// からの距離だけで決めていたため、~18秒かけてプレイヤーが円内を動くと、現在地の近くへ偶然湧いて
// 「湧きと重なって理不尽に被弾する」ことがあった(社長報告)。現在のプレイヤー位置からの最低距離を確保する。
const HORDE_SPAWN_PLAYER_CLEARANCE = 140; // この距離未満には湧かせない
const HORDE_SPAWN_CLEAR_ATTEMPTS = 8;     // 角度を振り直して確保を試みる回数(それでもダメなら押し出す)
const AREA_SECTOR_ENTER_DIST = 1200;   // 担当エリア進入セリフ(neglectFar)を出す最小距離(原点ハブ付近は除外)
const ARENA_FIRE_AFTER_MS = 120000;    // 初回発火時刻(=ゲーム開始2分)
const ARENA_FIRE_INTERVAL_MS = 120000; // 以降の発火間隔(=2分ごと。社長指示)
// 紅き夜の発火判定時刻は「5分以上でランダム」(社長指示)。出撃ごとに 5〜9分の範囲で1回だけ抽選時刻を決める。
const RED_NIGHT_FIRE_MIN_MS = 300000;    // 最短(5分)
const RED_NIGHT_FIRE_SPREAD_MS = 240000; // 上振れ幅(+0〜4分)=実質5〜9分
const rollRedNightFireAt = (): number => RED_NIGHT_FIRE_MIN_MS + Math.random() * RED_NIGHT_FIRE_SPREAD_MS;
const RED_NIGHT_RUN_CHANCE = 0.3;        // 出撃ごとの発生確率(社長指示で 0.5→0.3)。1=必ず / 0=出ない
// PACING_PUZZLE.md §5.21-追補3(社長決定v0.25.1546): 追補2の「円内10体burst配置(ambient)」は撤去。
// ゲート1の基本沸きは通常沸き(koma maintenance)の無限流入方式へ置き換え(permeable=trueで境界を
// 越えて流入)。§5.21-追補4(v0.25.1553): koma目標/CDをピーク・CD0に強制する分岐は撤回済み=
// ゲート1中もchaffは通常のディレクター駆動のまま(gate1.ts参照)。
const ARENA_HORDE_COUNT = 18;          // ゾンビ版の初期湧き数(cap 20 以内)
const ARENA_HORDE_DURATION_MS = 40000; // ゾンビ版の制限時間保険(段階スポーン約18秒化に合わせ30→40へ)。基本は全滅で終了
const ARENA_BOSS_ADDS = 4;             // ボス版の取り巻きゾンビ数
const ARENA_BOSS_DURATION_MS = 60000;  // ボス版の制限時間保険(基本は撃破で終了)
// PACING_PUZZLE.md §5.21 M20 stage④: 囲いゲート2(城ボスユニーク×2)の制限時間保険。ハードゲート=
// 基本は撃破まで出られない想定のため、通常のARENA_BOSS_DURATION_MSより長め(強さ×2で長引く前提)。
const GATE2_BOSS_DURATION_MS = 300000; // 5分
const ARENA_END_GRACE_MS = 600;        // 開始直後にイベント敵0で誤終了しないためのグレース
const EVENT_BANNER_MS = 3500;          // イベント発生告知バナーの表示時間(gameTime ms)

// --- ハンター変異体イベント(社長指示) ---------------------------------------
// 3分以降・優勢時に、プレイヤー近場の画面外へ「索敵状態」で出現。検知範囲に入ると
// 「見られている」警告→5秒残ると発見→拠点(制圧済み)へ逃げ込むまで追跡。20s/40sで増援(最大3体)。
// 出現回数は無制限(CD長めで何度でも・社長指示)・再出現CD150〜240s・ボス/リーパー/演出中は出現禁止(追跡中なら逃げる)。
const HUNTER_START_MS = 180000;            // 出現開始(3分)
const HUNTER_MAX_PER_RUN = Infinity;       // 1出撃あたりの上限なし(CD長めで何度でも)
const HUNTER_RESPAWN_CD_MIN_MS = 150000;   // 再出現CD最短(150秒=2.5分。長め)
const HUNTER_RESPAWN_CD_SPAN_MS = 90000;   // +0〜90秒(=150〜240秒)
const HUNTER_DETECT_RANGE = HUNTER_VISION_RANGE; // 索敵範囲(=視界範囲。描画/ジャンプ範囲と共有)
const HUNTER_DISCOVER_MS = 5000;           // 検知範囲に5秒残ると発見
const HUNTER_SEARCH_MAX_MS = 26000;        // 索敵のまま未発見が続くと立ち去る(フェードアウト開始)。
                                            // ただし索敵範囲にプレイヤーが入っている間はこのタイマーを都度リセットする(社長指示)。
const HUNTER_REINFORCE_1_MS = 20000;       // 追跡20秒で2体目
const HUNTER_REINFORCE_2_MS = 40000;       // 追跡40秒で3体目
const HUNTER_CHASE_MAX_MS = 60000;         // 追跡の上限(これを超えたら諦めて撤退=kiteで永久追跡＆他イベント停止を防ぐ)
const HUNTER_MAX_ALIVE = 3;                // 同時最大3体
const HUNTER_BASE_SAFE_RADIUS = 150;       // 制圧拠点へこの距離まで近づくと追跡相手が撤退
const HUNTER_FLEE_SPEED = 300;             // 撤退移動速度(px/s)
const HUNTER_DESPAWN_DIST = 1500;          // 撤退でプレイヤーからこの距離離れたら消滅
// 優勢判定(6項目中 HUNTER_FAV_SCORE_NEEDED 以上で成立)
const HUNTER_FAV_NODAMAGE_MS = 20000;      // 直近20秒ノーダメージ
const HUNTER_FAV_KILLS_20S = 12;           // 直近20秒の撃破数が多い
const HUNTER_FAV_STREAK_6S = 3;            // 近接/KILL成功が連続(直近6秒で3体)
const HUNTER_FAV_ONSCREEN_MAX = 6;         // 画面内通常敵が少ない
const HUNTER_FAV_SCORE_NEEDED = 4;         // 6項目中4つ以上
// 変異体(叫喚型・screamer)ディレクター: 5分以降・同時1体・CDで何度でも(社長指示)。
const SCREAMER_START_MS = 300000;          // 出現開始(5分)
const SCREAMER_RESPAWN_CD_MS = 60000;      // 消滅(撃破/退場)後の再出現CD(60秒)
// エリア(区域)遷移バナー: 距離帯を跨いだら区域名をイベント発生と同じUIで表示(社長指示)。
const AREA_BANNER_MS = 2600;           // 区域遷移バナーの表示時間(2〜3秒)
// AREA_ZONE_NAMES は enemyUtils.ts からの共有(PACING_REDESIGN.mdバッチ2の最深到達telemetryと表記を統一)。
// 原点(スタート/商人)からの距離(px)→ 区域インデックス。
// 0〜1500軍備 / 1500〜3000研究 / 3000〜5000デンジャー / 5000〜7500汚染 / 7500〜深層域。
const areaZoneIndexFor = (distPx: number): number => {
  if (distPx >= 7500) return 4;
  if (distPx >= 5000) return 3;
  if (distPx >= 3000) return 2;
  if (distPx >= 1500) return 1;
  return 0;
};
// ゾーン判定(エリアバナー/深層BGM)の間引き間隔。距離比較数回だけで負荷は無視できるため毎フレーム(=1)。
// (3に間引いても体感差・負荷差が無かったため社長指示で1へ戻し。重くなったらここを上げれば間引ける。)
const ZONE_CHECK_INTERVAL = 1;
// PACING_PUZZLE.md §5.17 M14: このランの最深距離(gameStats.maxDepthDist)+自己最深
// (wallMeta.selfDeepestDist)を更新時だけ反映する。呼び出し側で間引く(毎フレーム直呼びしない)。
// §5.21 M20追補(社長報告v0.25.1534): localStorageへの確定コミットはラン終了時のみ(commitRunEndProgress
// が担当)。ここではメモリ上のstore(wallMeta/gameStats)だけを更新し、途中リロードでは何も永続しない。
const syncWallDepth = (dist: number): void => {
  if (dist > useGameStore.getState().gameStats.maxDepthDist) {
    useGameStore.setState(state => ({ gameStats: { ...state.gameStats, maxDepthDist: dist } }));
  }
  const wm = useGameStore.getState().wallMeta;
  if (dist > wm.selfDeepestDist) {
    useGameStore.setState({ wallMeta: markSelfDeepest(wm, dist) });
  }
};
// PACING_PUZZLE.md §5.21 M20追補(社長報告v0.25.1534): 進捗のlocalStorageコミットはラン終了時の
// 1回のみ。ラン中は上記のとおりstore(wallMeta)/ref(gateMetaRef)に生値を持つだけで、確定コミットは
// 3つの終了経路(死亡=triggerPlayerDeath / クリア=gameWon / 撤退=商人帰還=gameReturned)からのみ呼ぶ。
// - kind='clear'(クリア or 撤退): 踏破フラグ・ランク到達フラグ・ゲート恒久解除も含めて全部コミット。
// - kind='death': 自己最深/自己最高ランクの「記録」だけをコミット(実際に到達した記録は残す)。
//   踏破/ランク到達フラグ・ゲート恒久解除はコミットしない(死亡は解除しない=v0.25.1517則)。
// 途中リロード/クラッシュはこの関数自体が一度も呼ばれないため、何も永続しない(症状の根治)。
const commitRunEndProgress = (kind: 'death' | 'clear', gateMeta: GateMeta): void => {
  const stageId = getSelectedStageId();
  if (!stageId) return;
  const wm = useGameStore.getState().wallMeta;
  if (kind === 'clear') {
    setWallMeta(stageId, wm);
    setGateMeta(stageId, gateMeta);
    return;
  }
  const persisted = getWallMeta(stageId);
  setWallMeta(stageId, {
    ...persisted,
    selfDeepestDist: Math.max(persisted.selfDeepestDist, wm.selfDeepestDist),
    selfHighestRank: Math.max(persisted.selfHighestRank, wm.selfHighestRank),
  });
};
// 深層域BGM(逆再生)切替の距離しきい値。深層域(エリア=7500px)に合わせる。準備ゾーンは手前、
// 解除はヒステリシスで戻し過ぎ防止(enter=D / exit=D-200 / 準備開始=D-400 / 解放=D-600)。
const DEEP_BGM_D = 7500;
type DeepBgmPhase = 'shallow' | 'prep' | 'deep';
const RESCUE_RESPAWN_MS = 3000;        // 救助イベント: 攻撃者を倒してから復活までの時間(社長指示)
// テスト用URLパラメータ(実機/開発で強制発火)。?arenanow=1|horde|boss → 囲い系イベントを開始直後に発火
// (2分待ち＋発火確率を無視)。?castlenow=1 → 城フィナーレボス(giantbat)を開始直後に出現。森ステージ専用。
const evParam = (key: string): string | null =>
  typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get(key);
const FORCE_ARENA = evParam('arenanow');               // null=通常 / '1'=ランダム / 'horde' / 'boss' / 'rescue'
const DDA_ENABLED = evParam('dda') !== '0';            // 難易度③(戦力連動の強さ/種類escalation)。?dda=0 で無効化。
const GATE_LIVE_TAU = 1.0;                             // 難易度④: 関所ライブ補正の平滑化時定数(秒)。
const SCENES_ENABLED = evParam('scenes') !== '0';     // 沸きシーン(構成/速度)。?scenes=0 で無効化(素の分布・等速)。
// 難易度⑤(DirectorRank=台本+前フェーズ評価、社長合意): フェーズが切り替わるたびに直前フェーズの
// 成績を評価し、次フェーズだけ少し強め+報酬多めにする(下限は台本=rank0、苦戦しても弱めない)。
// リアルタイムの即時反映はしない(今すぐは盛らない・次の山にだけ反映)。?rank=0 で無効化。
const RANK_ENABLED = evParam('rank') !== '0';
// 難易度⑥(ピンチ救済、社長指示): 低HP×敵溜まりすぎが続いた人にだけ、松明ドロップを回復/爆弾寄りへ
// バイアス(場所は松明のみ=台本)。?pity=0 で無効化。
const PITY_ENABLED = evParam('pity') !== '0';
// 瀕死心音ループの発動しきい値(社長指定: HP25%以下)。
const HEARTBEAT_HP_FRAC = 0.25;
// PACING_REDESIGN.md 憲法第1条: 画面内は基本10体。退屈シグナル(Perf高×Intensity低の持続)が
// 出た時だけ、天井20までの上振れを解禁する。?upswing=0 で無効化(社長合意: きつければすぐ戻せるように)。
const UPSWING_ENABLED = evParam('upswing') !== '0';
// PACING_REDESIGN.mdバッチ3(最小版): 関所中の連続圧力(gatePressure)。フラグ名は旧離散案の
// `ladder`のまま(切り分け用)。?ladder=0で無効化=難易度④(gateLiveCorrection)含む従来挙動に復帰。
const LADDER_ENABLED = evParam('ladder') !== '0';
// PACING_REDESIGN.mdバッチ7: イベントプロデューサー(囲い/紅き月/ハンター/叫びの発火ゲート)。
// ?events=0 で従来のランダム発火(本バッチ以前の挙動)に完全復帰(切り分け用)。
const EVENTS_ENABLED = evParam('events') !== '0';
// PACING_REDESIGN.mdバッチ3.5-A: チャフ配合(bat/skeleton/zombieの役割配合)。?mix=0で従来の
// エリア重み任せに完全復帰。
const MIX_ENABLED = evParam('mix') !== '0';
// PACING_REDESIGN.mdバッチ3.5-B: 盤面在庫(boardDebt)。?debt=0で全無効(従来挙動)。
const DEBT_ENABLED = evParam('debt') !== '0';
// PACING_PUZZLE.md §5.21 M20(囲いの復活=2軸)。?arena=0で軸1(退屈補正の囲い)のみ無効化。
const BOREDOM_ARENA_ENABLED = evParam('arena') !== '0';
// PACING_PUZZLE.md §5.21 M20 軸2(制圧ゲート)。?gate=0でゲート全体(1/2とも)を無効化。
const GATE_ENABLED = evParam('gate') !== '0';
// 診断用(社長v0.25.1561): ?rednight=1 で紅き夜を即・強制発動して持続(通常は5〜9分+30%+デンジャー以降)。
// 実機で紅き夜の重さ(赤マトリクス+敵×2の強glow積み上がり)をオンデマンド検証するため。既定OFF。
const RED_NIGHT_FORCE = evParam('rednight') === '1';
// 診断用(社長v0.25.1565): ?deepzone=1 の「完全再現」= セピア色(pixiScene側で既に強制)に加え、
// 深層域BGM(逆再生=通常BGMをpauseして差し替え)も距離無視で強制発動する。逆再生BGM自体の重さ検証用。既定OFF。
const DEEP_ZONE_FORCE = evParam('deepzone') === '1';
// PACING_REDESIGN.mdバッチ4: 緩の演目選択(RELAX/講習/回収/HARVEST)。?program=0で従来の
// 固定シーン(PHASESのscene)に戻す。問題児リフラクトリ(3.5-Bの追補)も同フラグで束ねる。
const PROGRAM_ENABLED = evParam('program') !== '0';
const STRUGGLE_KILL_MAX = 2; // 直前関所でのfeatured型キル数がこれ未満なら「苦戦気味」=回収の対象
// v0.25.1343: 「出現したのにキルが少ない」時だけ苦戦とみなす(これ未満の出現数なら対象外)。
// 初心者ゾーンではfeatured問題児がゾーン天井でそもそも出現しない=キル0だが苦戦ではない。
const STRUGGLE_MIN_SPAWNS = 3;
// PACING_REDESIGN.mdバッチ5: 山(関所)の台本選択。?gateprogram=0で従来の固定シーン
// (PHASESのscene/maxRung)に戻す。
const GATE_PROGRAM_ENABLED = evParam('gateprogram') !== '0';
// PACING_REDESIGN.mdバッチ6: ステージ難易度指数(stageAggro)。?stageaggro=0で中立値0.5固定
// (バッチ6導入前と完全一致=pressure上げτ8s/退屈発動25s/関所maxRungクランプ5)。
const STAGE_AGGRO_ENABLED = evParam('stageaggro') !== '0';
// 現在選択中のステージのstageAggroを毎回引く(localStorage読み取りのみ・pixiScene.tsの
// getSelectedStageId()と同じ軽量な呼び出しパターン。1フレームに複数箇所から呼んでも軽い)。
const currentStageAggro = (): number => (STAGE_AGGRO_ENABLED ? stageAggroFor(getSelectedStageId()) : STAGE_AGGRO_DEFAULT);
// PACING_REDESIGN.md バッチM1(社長決定v0.25.1362・A/Bレース最小修正線): τ8→5秒/Intensityホールド
// 撤廃/主題保証15秒の3点をまとめて切り替える復帰フラグ。`?m1=0`で3点とも旧挙動へ。
const M1_ENABLED = evParam('m1') !== '0';
// PACING_PUZZLE.md バッチM4(社長決定v0.25.1365・ランク7段階×台本パズル方式・既定ON):
// `?puzzle=0`でこの方式を丸ごと無効化し、M1状態(v0.25.1363の挙動)へ完全復帰する。
const PUZZLE_ENABLED = evParam('puzzle') !== '0';
// PACING_PUZZLE.md §5.5 バッチM5(RE4式弾ドロップ・既定ON): キル時弾薬ドロップを「残弾割合が
// 最小の弾種」にする。`?ammosmart=0`で従来(構え銃の弾種)へ復帰。gameStore側の近接キル経路も
// 同名パラメータを各自読む(既存のcamNum等と同じ流儀)。
const AMMO_SMART_ENABLED = evParam('ammosmart') !== '0';
// PACING_PUZZLE.md §5.6 バッチM7(チャフの武器弱点クリティカル・既定ON): `?weakcrit=0`で無効化。
// gameStore側の近接キル経路も同名パラメータを各自読む(既存のammosmart等と同じ流儀)。
const WEAKCRIT_ENABLED = evParam('weakcrit') !== '0';
// PACING_PUZZLE.md §5.23 バッチM22 Group A(A1マズルフラッシュ・既定ON): `?mzl=0`で無効化。
const MUZZLE_FLASH_ENABLED = evParam('mzl') !== '0';
// PACING_PUZZLE.md §5.23 バッチM22 Group C(C1方向性シェイク&スプレー・既定ON): 銃ヒット/
// 銃キルの血しぶきバーストを弾の進行方向へ寄せる。`?dirfx=0`で無効化。gameStore側の近接
// 経路も同名パラメータを各自読む(既存のammosmart/weakcrit等と同じ流儀・最終ゲートはstore側)。
const DIRFX_ENABLED = evParam('dirfx') !== '0';
// (PUZZLE_MANAGED_TYPES は src/utils/directorTick.ts の runKomaBoardMaintenance へ移設)
// 実機フィードバック②(v0.25.1315): セットピース固定台本(stageDirector.ts WAVE_EVENTS:
// 0:35弾plant/1:45パンプキン/2:50plant/3:55七体オンスロート/4:55パンプキン2)は、エリア規約・
// gatePressureの問題児ブロック・憲法の数上限をすべて素通りし、序盤の理不尽(最初から弾+濁流)の
// 主因だったため既定OFF。見せ場としての再設計はバッチ4/5の演目・台本メニューで行う。
// ?setpiece=1 で従来台本に復帰(切り分け用)。城ボス(7分)は別経路なので影響なし。
const SETPIECE_ENABLED = evParam('setpiece') === '1';
// (DIRECTOR_NEAR_RADIUS は src/utils/directorTick.ts の runDirectorSignalStep へ移設)
// ステップB(社長合意の最初の実接続): ?directorApply=relax の時だけ、RELAX中の湧きを relaxSpawnAdjust で緩める。
// ステップC(社長合意): ?directorApply=buildup の時だけ、BUILD_UP中にPerformanceが高いほど escalation を
// 少しだけ上乗せする(buildupSpawnAdjust。レバーはescalationのみ=Bより慎重)。?directorApply=all で両方。
// 既定(フラグ無し)は基準点(commit b1eae30)と完全に同じ挙動。可視化(?director=1)とは独立に指定できる
// (適用だけ試したい/両方見ながら試したい、のどちらも出来るように)。
const DIRECTOR_APPLY_PARAM = evParam('directorApply');
const DIRECTOR_APPLY_RELAX = DIRECTOR_APPLY_PARAM === 'relax' || DIRECTOR_APPLY_PARAM === 'all';
const DIRECTOR_APPLY_BUILDUP = DIRECTOR_APPLY_PARAM === 'buildup' || DIRECTOR_APPLY_PARAM === 'all';
// 信号算出(Intensity/Performance/macro state)は既定で常時ON(社長要望のPEAK重ねSE/紅き月連携が実プレイで
// 動くために必要。読むだけで軽い=近接敵数と危険敵の走査のみ、新規描画なし)。他の難易度③④⑤⑥と同じ
// 「既定ON・?director=0で無効化」に統一(旧来は明示フラグ必須だった)。デバッグ表示の可否は
// DIRECTOR_ENABLED(='1'時のみ)が別途ゲートするので、ここをONにしても左上UIは出ない。
const DIRECTOR_ACTIVE = (evParam('director') !== '0') || DIRECTOR_APPLY_RELAX || DIRECTOR_APPLY_BUILDUP;
// (DIRECTOR_EGG_DANGER_RADIUS / DIRECTOR_EGG_DANGER_FULL は src/utils/directorTick.ts へ移設)
// 救助イベントの発火位置(プレイヤーからの距離)。スタート地点直下に出さず、少し離して端マーカーで誘導。
// 実機で位置を見ながら調整するため定数化(?rescuemin / ?rescuemax で上書き可)。
const evNum = (key: string, def: number): number => {
  const v = evParam(key); const n = v != null ? Number(v) : NaN;
  return Number.isFinite(n) ? n : def;
};
const RESCUE_SPAWN_DIST_MIN = evNum('rescuemin', 500);
const RESCUE_SPAWN_DIST_MAX = evNum('rescuemax', 1000);
// PACING_PUZZLE.md §5.21 M20追補(社長設計v0.25.1533・修正v0.25.1534): 凶悪ハンターは索敵フェーズを
// 廃止し、デンジャー入場(制圧0)から約3秒後に索敵をスキップして「見つかった状態」(chase)で発動する。
// 視界サークル/再配置ラッシュは凶悪版では出さない(撤去)。`?viciousdelay=<ms>`で調整可(実機調整前提)。
const VICIOUS_DISCOVER_DELAY_MS = evNum('viciousdelay', 3000);
const FORCE_CASTLE_BOSS = evParam('castlenow') === '1'; // 城ボス即時
const FORCE_HIDDEN_BOSS = evParam('bossnow') === '1';   // テスト: 裏ボスをプレイヤーの近く(画面外)へ即出現
// PACING_PUZZLE.md §5.21-追補8: テスト用の統一起動フラグ。ラン開始直後、そのステージのゲート2ボス型を
// プレイヤー近くへ即force-spawnし、ゲート2と同じ初期化(bossState=chase/home=生成中心/×5/fromEvent)で
// すぐ戦えるようにする(拘束サークルは省略=テスト用途)。既定OFF=通常挙動不変。将来ステージが増えたら
// このlookupに追加するだけで対応する(現状はstage-1=ミゲルのみ)。
const FORCE_GATEBOSS = evParam('gateboss') === '1';
const GATE2_BOSS_TYPE_BY_STAGE: Partial<Record<string, EnemyType>> = { 'stage-1': 'miguel' };
// (WAVE_GRACE_MS は src/utils/directorTick.ts へ移設)
// ダンスビートB方式(社長決定 v0.25.1339・仕様はHANDOFF_DANCE_AUDIO.md末尾)。?beat=0で従来の
// (メトロノーム無し+曲への自動アンカー同期)挙動へ完全復帰(切り分け用)。
const BEAT_ENABLED = evParam('beat') !== '0';
const DANCE_BEAT_SCHEDULE_WINDOW_MS = 150; // 次の1拍をこの時間内に入ったら予約する(仕様:100〜200ms)

// --- 裏ボス(深層域の隠しボス: mimir/jormungand)コントローラ定数 ---
// 深層域(原点から 7500 以上=area 4)の「指定エリア」に近づくと1回だけ出現する。
const BOSS_SPAWN_DEPTH = evNum('bossdepth', 7800);   // この深度に到達で出現(area 4 の少し内側。巣が無いタイプ用の保険)
const BOSS_SPAWN_NEAR = 1500;                        // 巣(固定)へこの距離まで近づくと出現(=指定エリアに近づくと出現)
const BOSS_EXIT_DEPTH = 7300;                        // この深度を下回ると深層域を出た=帰巣して退場(ヒステリシス)
const BOSS_REGEN_PER_SEC = 10;                       // 画面外/帰巣中は毎秒この耐久値が回復(社長指示: 40→10)
const BOSS_DASH_SPEED_MULT = 2;                      // ダッシュ時は2倍速で追跡
const BOSS_SCREEN_MARGIN = 120;                      // 画面内判定のマージン(これより内なら on-screen 扱い)
// 攻撃状態機械のタイミング(gameTime ms)。
const BOSS_ACTION_MIN_MS = 2600;                     // 次の特殊行動までの最短(追跡しながら待つ)
const BOSS_ACTION_MAX_MS = 4600;                     // 同・最長
const BOSS_AIM_BURST_MS = 1000;                      // 立ち止まり1秒後に3連発(社長指示)
const BOSS_BURST_SHOTS = 3;
const BOSS_BURST_GAP_MS = 500;                       // 0.5秒間隔(社長指示)
const BOSS_AIM_RADIAL_MS = 2000;                     // 立ち止まり2秒後に全方位16発(社長指示)
const BOSS_RADIAL_COUNT = 16;
// ヨルムンガルド専用の攻撃調整(社長指示)。他の裏ボス(mimir/skadi)は従来どおり。ダッシュは共通で維持。
const JORM_BURST_VOLLEYS = 5;        // 3発バーストを5回(0.5秒間隔)=計15発
const JORM_BURST_FAN_SPREAD = 0.18;  // 1回=プレイヤー狙いの3-way扇の左右開き(rad・約10°)
const JORM_BURST_GAP_MS = 500;       // バースト間隔0.5秒
const JORM_RADIAL_VOLLEYS = 8;       // 全方位16発を8回
const JORM_RADIAL_GAP_MS = 300;      // 全方位間隔0.3秒
const JORM_RADIAL_SPIN = Math.PI / 16; // 各回ごとに時計回りへずらす角度(rad・約11°)=螺旋射撃(社長指示)
// スカジ専用の追加攻撃(社長指示。既存のburst/radial/dashは据え置きで、ここに「追加」して抽選)。
const SKADI_ATTACK_CHANCE = 0.5;     // chase からの行動抽選で氷攻撃を選ぶ確率(残りは従来のdash/burst/radial)
const SKADI_ICE_COUNT = 5;           // 氷塊バーストの個数
const SKADI_ICE_GAP_MS = 1000;       // 1秒おきに設置
const SKADI_ICE_TELEGRAPH_MS = 2000; // 赤サークル2秒フェードイン→起爆
const SKADI_BLADE_COUNT = 7;         // 氷の刃の個数
const SKADI_BLADE_GAP_MS = 400;      // 0.4秒おきに設置(社長指示で0.2→0.4)
const SKADI_BLADE_DELAY_MS = 1000;   // 設置1秒後に発射
const SKADI_BLADE_RING_MIN = 100;    // プレイヤー周辺の設置リング内半径(社長指示でもう少し近く)
const SKADI_BLADE_RING_MAX = 180;    // 同・外半径
const BOSS_DASH_WINDUP_MS = 3000;                    // たまに3秒立ち止まり(社長指示)
const BOSS_DASH_MS = 3000;                           // その後2倍速で3秒追跡(社長指示)
const BOSS_DASH_CHANCE = 0.1;                        // 「たまーーーに」=低確率
// ミーミル専用: 射撃方向に赤いラインを2秒溜め→その方向へ太いレーザーを発射(社長指示)。
const MIMIR_LASER_CHANCE = 0.34;                     // chase からの行動抽選でレーザーを選ぶ確率(ミーミルのみ)
const MIMIR_LASER_WINDUP_MS = 3000;                  // 赤ライン予告の溜め時間(3秒・社長指示)。溜め中は方向ロック。
const MIMIR_LASER_AIM_TRACK = 1.5;                   // 発射中の照準追尾レート(小さいほど遅い=避けやすい・社長指示で追尾は発射中に)
const MIMIR_LASER_FIRE_MS = 1500;                    // レーザー本体の表示/判定時間(この間ゆっくり追尾しながら揺れる)
const MIMIR_LASER_SHAKE_MAG = 5;                     // 発射中の画面シェイク振幅(社長指示)
const MIMIR_LASER_RANGE = 2600;                      // レーザーの長さ(px)
const MIMIR_LASER_HALF_WIDTH = 34;                   // レーザーの半太さ(当たり判定/描画。太め)
const MIMIR_LASER_DAMAGE = 42;                       // レーザー被弾ダメージ(直撃)
const BOSS_FADE_MS = 2600;                           // 討伐時のFF風フェードアウト時間(描画側で使用)
// 裏ボスが障害物を踏み潰した時の爆破FX/SE/シェイク。森を突っ切ると同時破壊が多発しうるので「スロットル」で
// 一定間隔に1回だけ発火=per-frame Graphics(リング/バースト)を積み上げない安全弁(負荷の主因は数×描画法)。
const BOSS_CRUSH_FX_MS = 130;                        // 爆破FX/SE/シェイクの最短間隔(=最大~7回/秒)
const BOSS_CRUSH_SHAKE_MS = 130;                     // 「少し揺れる」程度の短い画面シェイク
const BOSS_CRUSH_SHAKE_MAG = 3;                      // 弱め(死神召喚などより控えめ)
const BOSS_SUMMON_AGGRO = 2000;                      // 裏ボスが召喚へ「吸い付く」最大距離(画面内の召喚は基本対象に)
const BOSS_COUNTER_WARP_DIST = 320;                  // カウンター被弾時、プレイヤーの反対側へワープする距離(中心間px・社長指示。50は近すぎ→320へ)
const BOSS_WARP_FADE_MS = 500;                       // ワープ先での 0.5秒フェードインの長さ
const BOSS_STUN_SPEED_MULT = 0.5;                    // 気絶中は止まらず歩き続けるが速度は半分(社長指示)
const BOSS_TURN_RESPONSE = 3.2;                      // 移動の慣性。目標速度へ寄せる係数(小さいほど慣性大=ぬるっと曲がる)
const BOSS_DASH_HOMING = 0.05;                       // ダッシュ中の弱いホーミング量/frame(基本は直進・少しだけプレイヤーへ寄せる)
const BOSS_DASH_BACKSTEP_MULT = 0.4;                 // 突進溜め中、ゆっくり後退り(ターゲットから離れる)する速度倍率(社長指示)
// --- 裏ボス トール(ステージ5)専用の独自攻撃(社長指示 v0.25.1318〜) --------------------------
// 前提(社長指示): 弾は撃たない・ダッシュもしない(既存burst/radial/dash抽選から除外し、専用の
// 状態機械のみを回す)。すべての攻撃がカウンター可能(各attackの実行中にcounterWindowEndを判定)。
// 数値は「同じ射程/幅=ダッシュ」等の指示から妥当な値を採用(既存の裏ボスdashに可視ラインが無かった
// ため、werewolf系の突進テレグラフ(6px下地+2px芯)を「ダッシュのライン」の基準として2倍/等倍を適用)。
// 実機調整前提でDEVELOPMENT_LOG.mdに透明化して記録。
// 社長修正指示(v0.25.1321〜): 旋回距離=ハンドガンが届かないくらいの距離(RANGE_BY_CATEGORY.handgun
// 基準)へ変更(旧: 近接距離基準)。
const THOR_ORBIT_MARGIN_PX = 40;             // ハンドガン射程より少し外側で旋回する余白
const THOR_ORBIT_DIST = RANGE_BY_CATEGORY.handgun + THOR_ORBIT_MARGIN_PX; // 旋回時の目標距離(中心間)
const THOR_ORBIT_APPROACH_SLACK = 60;        // この分だけ余裕を見て「接近」⇄「旋回」を切り替える(ハンチング防止)
const THOR_ORBIT_SPEED_MULT = 2 / 3;         // 旋回速度=通常の2/3(社長指示。旋回距離ちょうど〜やや遠い時のみ)
const THOR_ORBIT_RADIUS_CORRECT = 4;         // 旋回距離よりやや遠い時、半径をTHOR_ORBIT_DISTへ寄せる
                                              // イージング係数(大きいほど素早く戻る)
// 社長指示(v0.25.1331〜): 接近/後退は自身のスピードではなく「プレイヤーの1/2速度」を基準にする
// (2/3のoriginal boss.speedとは別枠。厳密な現在の可変速度ではなくPLAYER_BASE_SPEEDを基準とする=
// enemyUtils.tsのトール速度導出と同じ簡略化)。
const THOR_APPROACH_SPEED = PLAYER_BASE_SPEED * 0.5; // 旋回間合いに入るまでの接近速度
const THOR_RETREAT_SPEED = PLAYER_BASE_SPEED * 0.5;  // 旋回距離より近づかれた時に後ずさる速度
const THOR_BACKSTEP_MIN_INTERVAL_MS = 3000;  // バックステップの最短間隔(「たまに」の頻度・叩き台)
const THOR_BACKSTEP_MAX_INTERVAL_MS = 6000;
const THOR_BACKSTEP_DIST = 90;               // バックステップで離れる距離(px)
const THOR_BACKSTEP_MS = 180;                // バックステップそのものの所要時間
// 社長指示: 旋回中(ちょうど良い距離を保っている間)にも、たまに接線方向へ少しだけ弾む「ステップ」を混ぜる
// (常に滑らかな等速円運動だけにしない=動きに緩急を付ける)。バックステップと同型・別枠のタイマー/短距離移動。
const THOR_ORBIT_STEP_MIN_INTERVAL_MS = 2500;
const THOR_ORBIT_STEP_MAX_INTERVAL_MS = 5000;
const THOR_ORBIT_STEP_DIST = 70;             // ステップで進む距離(px)
const THOR_ORBIT_STEP_MS = 160;              // ステップそのものの所要時間
// 社長指示:「たまに2秒さらに1/2の速度で歩く」。chase中の移動速度(接近/後退/旋回いずれも)へ
// 一律で追加の減速を掛ける一時ウィンドウ(状態遷移ではない=speed multiplierのみの単純な効果)。
const THOR_SLOWWALK_MS = 2000;               // 減速が続く時間
const THOR_SLOWWALK_MULT = 0.5;              // 更なる減速倍率(「さらに1/2」)
const THOR_SLOWWALK_MIN_INTERVAL_MS = 5000;  // 「たまに」の頻度(叩き台)
const THOR_SLOWWALK_MAX_INTERVAL_MS = 9000;
const THOR_ACTION_MIN_MS = 2200;             // 攻撃選択インターバル(最短・満タンHP)
const THOR_ACTION_MAX_MS = 4200;             // 攻撃選択インターバル(最長・満タンHP)
const THOR_LOWHP_FRAC = 0.4;                 // このHP割合以下で頻度アップ開始(社長指示)
const THOR_LOWHP_INTERVAL_MULT = 0.55;       // 低HP時のインターバル倍率(短縮=高頻度化)

const THOR_ISSEN_WINDUP_MS = 3000;           // 一閃: 3秒溜め・赤く点滅して静止(社長指示)
const THOR_ISSEN_DASH_MS = 280;              // 高速移動そのものの所要時間
// 社長修正指示(v0.25.1321〜): 長さを半分(620→310)・幅を2倍(60→120)に変更。溜め中はプレイヤーを
// 追わない(方向は溜め開始時点で固定・行動選択側でロック)。
const THOR_ISSEN_RANGE = 310;                // ラインの長さ=終着点までの距離
const THOR_ISSEN_HALF_WIDTH = 80;            // 当たり判定=赤ライン半幅(社長修正指示: 120の2/3へ)

const THOR_TSUKI_WINDUP_MS = 1000;           // 突き: 1秒停止(社長指示)
const THOR_TSUKI_MS = 180;                   // 突き自体(高速な踏み込み)の所要時間
// 一閃の長さ/幅修正の影響を受けないよう、突き専用の値として独立させる(一閃の元の値=620/半幅30を維持)。
const THOR_TSUKI_RANGE = 620;                // ダッシュと同じ射程(社長指示=一閃の元の「ダッシュ射程」を採用)
const THOR_TSUKI_HALF_WIDTH = 30;            // ダッシュと同じ幅(一閃の元の半分=通常幅)

const THOR_HARAI_WINDUP_MS = 1000;           // 払い: 溜め1秒(社長指示)
const THOR_HARAI_RANGE = 620;                // ダッシュと同じ距離分のライン(社長指示。一閃の長さ修正とは独立)
const THOR_HARAI_HALF_WIDTH = THOR_TSUKI_HALF_WIDTH * 1.5; // 社長指示: 突きの1.5倍の太さへ(突き本体は無変更)
const THOR_HARAI_ACTIVE_MS = 220;            // 横払いの判定持続

// PACING_PUZZLE.md §5.21-追補8: ミゲル(ゲート2ボス・天使名ボス1体目)。トールのharaiを流用し
// 範囲を狭くした専用攻撃1つのみ(バッチ1)。定数は叩き台(実機調整前提)。
const MIGUEL_HARAI_WINDUP_MS = 1000;         // 払い: 溜め1秒(トールと同型)
const MIGUEL_HARAI_RANGE = 380;              // トール(620)より狭い(仕様指定)
const MIGUEL_HARAI_HALF_WIDTH = 25;          // トール(45)より狭い(仕様指定)
const MIGUEL_HARAI_ACTIVE_MS = 220;
// ゲート内側マージン。周回半径=GATE_ARENA_RADIUS-margin-帯高さ半分(足元帯=height/2)。
// margin=20・miguel.height=60 → 300-20-30=250(仕様の目安値と一致)。
const MIGUEL_ORBIT_MARGIN = 20;
const MIGUEL_ORBIT_SPEED = 70;               // 周回の接線速度(px/s・叩き台)
const MIGUEL_MELEE_DASH_MS = 1000;           // 近接被弾で1秒間だけ周回速度アップ
const MIGUEL_MELEE_DASH_MULT = 2;            // 加速倍率
// 「移動中、たまにゆっくり歩く」(社長指示・トールのSLOWWALKと同型)。
const MIGUEL_SLOW_WALK_MS = 1500;            // 減速が続く時間
const MIGUEL_SLOW_WALK_MULT = 0.4;           // 減速倍率(周回速度に乗算)
const MIGUEL_SLOW_WALK_MIN_GAP_MS = 4000;    // 「たまに」の頻度(最小)
const MIGUEL_SLOW_WALK_MAX_GAP_MS = 9000;    // 同・最大

const THOR_JUMP_TRIGGER_HITS = 3;            // 画面外からの被弾3回で間合いを詰める(社長修正指示)
const THOR_JUMP_TRIGGER_WINDOW_MS = 6000;    // ↑を数える時間窓
const THOR_JUMP_WINDUP_MS = 700;             // ジャンプ前の溜め(pumpkinのcrouchより短め=間合いを詰める性質上)
const THOR_JUMP_MS = 620;                    // 滞空時間(ハンターの速いジャンプ感を踏襲)
const THOR_JUMP_RADIUS = 70;                 // 着地爆風半径(pumpkinの54よりやや広め=ボス級)
const THOR_JUMP_RECOVER_MS = 900;            // 着地後の硬直

const THOR_COUNTER_LEAP_MS = 260;            // カウンターを受けた時の後退ジャンプ所要時間(社長指示)
let bossCtrlErrLogged = false;                       // 裏ボス制御例外のログは初回だけ(毎フレーム出さない)
let miguelCtrlErrLogged = false;                     // ミゲル制御例外のログも初回だけ
let loopErrLogged = false;                           // ループ本体例外のログも初回だけ
// (屋内の固定敵の「画面外」復帰余白 LAB_RETURN_HOME_MARGIN は src/utils/directorTick.ts へ移設)
const PICKUP_HARD_CAP = 120;
const XP_PICKUP_KEEP_COUNT = 82;
const STRAP_PICKUP_KEEP_COUNT = 60;
const CASTLE_BOSS_MIN_TIME_MS = 7 * 60 * 1000; // ただし出現は7分経過後のみ(社長指示で5→7分=難易度カーブ後ろ倒し)。接近＋時間の両方。?castlenow=1 は無視。
// 研究所スキンの湧き敵の索敵範囲(px)。この距離内 かつ 壁越しでない(視界)ときに休眠から起床。
// ラボ湧き敵の起床索敵範囲。150 では湧きリング(画面外~570-745px)より遥かに小さく休眠敵が永久に起きず
// 「敵が一切出ない」状態に、逆に 700 では湧いた瞬間に約7割が即起床して「すぐ見つかる」状態だった(社長報告)。
// 420=画面の半対角線弱に設定: 湧き時点では起きず(湧き>420)、プレイヤーが近づき画面端に差しかかった敵から
// 順に起床=「忍び寄れる」挙動。リサイクル(~753)より十分小さいので少し近づけば確実に起きる(=敵切れにしない)。
const LAB_SPAWN_AGGRO_RANGE = 420;
// 1画面区画あたりのラボ敵の上限(密度制御)。
const LAB_ENEMIES_PER_ZONE = 2;
// ラボの湧き間隔倍率(大きいほど間隔が空く=湧きすぎ防止)と、1回の湧き上限。
const LAB_SPAWN_INTERVAL_MULT = 1.6;
const LAB_SPAWN_COUNT_MAX = 1;
const PLAYER_DEATH_SLOW_MS = 820;
const HEAVY_GRENADE_EXPLOSION_EFFECT_MS = 440;
const COUNTER_REFLECT_SLOW_MS = 560;
const GRENADE_LAUNCHER_EXPLOSION_EFFECT_MS = 440;

type DogFetchJob = {
  collectAt: number;
  finishAt: number;
  startedAt: number;   // 出発時刻(軌道補間に使用)
  fromX: number;       // 出発座標(プレイヤー位置)
  fromY: number;
  targetX: number;
  targetY: number;
  radius: number;
  collected: boolean;
  bitten: Set<string>; // この往復で既に噛んだ敵(重複噛み防止)
};

export const useGameLoop = (onGameOver: () => void, options: { benchmarkMode?: boolean } = {}) => {
  const [fps, setFps] = useState(0);
  const benchmarkModeRef = useRef(Boolean(options.benchmarkMode));
  const frameRef = useRef(0);
  const lastFrameTimeRef = useRef(0);
  const lastEnemySpawnRef = useRef(0);
  const boomReadyRef = useRef(true); // ドローンブーメランのCD明け検出(false→true でカチッSE+頭上マーク)
  const playerKillTimesRef = useRef<number[]>([]); // プレイヤーの撃破時刻(無双判定の直近ウィンドウ)
  const fireJetEnemyAtRef = useRef<Map<string, number>>(new Map()); // 敵ID→直近の背中火spawn時刻(ショットガン等の多弾を1本に間引く)
  const benkeiReadyRef = useRef(true); // 弁慶: 再発動CD明け検出(false→true で「閃き」フラッシュ)
  const bashHitFxRef = useRef(0);    // 盾バッシュ命中SEの既再生タイムスタンプ
  const rescueShootFxRef = useRef(0); // 救助NPC射撃SEの既再生タイムスタンプ
  const rescueRespawnRef = useRef(0); // 救助イベント: 次の攻撃者復活の予定 gameTime(0=空き無し/未予約)
  const rescueFiredRef = useRef(false); // 救助イベントは1出撃で最大1回(社長指示)。発生済みなら以降の抽選から除外。
  const whipHitFxRef = useRef(0);    // 鞭命中SE
  const whipSwingFxRef = useRef(0);  // 鞭振りSE
  const anchorPlantFxRef = useRef(0); // アンカー打ち込みSE(地面)
  const anchorEnemyHitFxRef = useRef(0); // アンカーが敵に当たった時のSE(近接命中音)
  const boomThrowFxRef = useRef(0);  // ブーメラン投擲SE
  const summonFxRef = useRef(0);     // 召喚SE
  const screamerBuffFxRef = useRef(0); // 叫喚型の発動(強化窓オープン)検出=叫喚SE
  const fpsCounterRef = useRef({ frames: 0, lastCheck: 0 });
  const introWasActiveRef = useRef(false); // キャラ登場演出中フラグ(着地検出用)
  const heliLandedRef = useRef(false);     // ヘリ着陸SE/砂煙を1回だけ出す(t が着陸点 hf を跨いだ瞬間)
  const introHoldSinceRef = useRef(0);     // レンダラ初フレーム待ちで登場演出を保持し始めた時刻(まっくら防止のフェイルセーフ用)
  // Scripted-wave consumption set; survives across frames within one run
  // and is reset whenever gameTime rolls back to ~0 (i.e. a fresh game).
  const consumedWavesRef = useRef(newConsumedWaves());
  const nextArenaAtRef = useRef(FORCE_ARENA != null ? 0 : ARENA_FIRE_AFTER_MS); // 次の囲い系イベント発火時刻(gameTime ms)。約2分ごと。
  // PACING_PUZZLE.md §5.21 M20 軸1: 退屈補正の囲いが次に発火できる gameTime(ms)。旧来のnextArenaAtRefとは別CD。
  const boredomArenaNextEligibleAtRef = useRef(BOREDOM_ARENA_START_MS);
  // 変異者大量発生(horde): 段階スポーン進捗。1秒に1体ずつ計total体(1/3体目=パンプキン/2/3・最終体目=ウルフ)。
  // totalは既定ARENA_HORDE_COUNT(18)だが、バッチ5追補のイベント関所発火時はeventSizeMultで可変。
  const hordeSpawnRef = useRef({ spawned: 0, nextAt: 0, total: ARENA_HORDE_COUNT });
  // バッチ5追補: 関所頭で発火予約されたイベント関所(gate-assault/gate-boss-spike)の発火待ち状態。
  // gateProgramRef選定側(下方)がセットし、囲い系イベントの毎フレームチェック(上方)が消化する。
  const gateEventPendingRef = useRef<{ eventKind: 'horde' | 'boss'; phaseKey: string; sizeMult: number } | null>(null);
  // ハンター変異体イベントの状態機械(専用コントローラ)。phase が idle 以外の間=他イベント抑止。
  const hunterRef = useRef({
    phase: 'idle' as 'idle' | 'search' | 'chase' | 'retreat',
    eventsThisRun: 0,            // この出撃で発生した回数(最大 HUNTER_MAX_PER_RUN)
    nextEligibleAt: HUNTER_START_MS, // 次に出せる gameTime(再出現CD)
    spawnAt: 0,                  // 索敵開始(出現)時刻
    detectStartAt: 0,            // プレイヤーが検知範囲に入った時刻(0=範囲外)
    chaseStartAt: 0,             // 追跡開始時刻(増援タイマー基準)
    reinforced: 0,               // 投入済み増援数(0..2)
    primaryId: '',               // 索敵個体(初号)のid
    // PACING_PUZZLE.md §5.21 M20 軸2: 凶悪ハンター(デンジャー入場・拠点制圧0で優勢ゲート無視即発生)。
    vicious: false,              // 現在の出撃が凶悪モードか
    viciousRearmAt: 0,           // 凶悪ハンター終了直後の短い猶予明け gameTime(即座の入れ替わり防止)
    // M20追補(社長設計v0.25.1533/1534): 索敵フェーズ廃止=デンジャー入場から約3秒後に発見済み(chase)で
    // 直接発動する。この「入場を検知してから発動までの3秒」の起点時刻(0=未検知/待機中でない)。
    viciousPendingAt: 0,
  });
  // 叫喚型(screamer)ディレクター: 次に出せる gameTime(消滅後CD)。同時1体・5分以降・CDで何度でも。
  const screamerRef = useRef({ nextEligibleAt: SCREAMER_START_MS });
  // 難易度④(関所ライブ補正): 現在の関所キー / 関所突入時のHP割合 / 平滑化した escalation 補正。
  const gateRef = useRef({ key: '', startHpFrac: 1, live: 0 });
  // 難易度⑤(DirectorRank): 現在のフェーズキーと、そのフェーズ開始時点のスナップショット。
  // フェーズが切り替わった瞬間に直前フェーズぶんの差分から成績を評価し、rank を更新する。
  // lastPerf: バッチ4(緩の演目選択)が使う連続0-1スコア(rankの離散化前の値)。初期値0.7は
  // 「最初の山はまだ実績が無い」を中立〜やや良い側で扱う(いきなり純休憩に落とさないため)。
  const rankRef = useRef({ rank: 0 as 0 | 1 | 2, phaseKey: '', phaseStartMs: 0, startDamageTaken: 0, startKills: 0, startLevel: 1, lastPerf: 0.7 });
  // 難易度⑥(ピンチ救済): ピンチ持続時間の累積。
  const pinchRef = useRef(createPinchState());
  // バッチ7(イベントプロデューサー・憲法第5条): ピンチ救済が発動していた間+解除後10秒は
  // 大イベントの発火を禁止する猶予のgameTime。ピンチ判定(pity計算)は湧き上限確定後にしか
  // 行えないため、他の1フレーム遅延パターン(directorRef/upswingRefと同じ)に倣い前フレームの
  // 値を読む=イベント各ブロックは「直前フレームの猶予」を見る。
  const pityEventBlockUntilRef = useRef(0);
  // バッチ3.5-B(盤面在庫): イベント発火ゲート(囲い/紅き月/ハンター/叫び)は敵配列走査後の
  // boardDebtNowより前(フレーム冒頭側)で判定するため、pityEventBlockUntilRefと同じ1フレーム
  // 遅延パターンで前フレームの値を読む。
  const boardDebtRef = useRef(0);
  // 憲法第1条(退屈シグナル→上振れ枠): 退屈持続時間の累積。
  const upswingRef = useRef(createBoredomState());
  // バッチ3(最小版): 関所中の連続圧力状態。keyが変わったら(=新しい関所に入ったら)登り直す。
  const gatePressureRef = useRef<{ key: string; state: ReturnType<typeof createGatePressureState>; ceiling?: number; castFirstNow?: boolean; castSecondNow?: boolean }>({ key: '', state: createGatePressureState() });
  // バッチ3: 被弾インパルス検知専用(AIディレクター本体のprevHpとは別管理)。
  const pressureHitRef = useRef<{ prevHp: number; hitTimes: number[] }>({ prevHp: -1, hitTimes: [] });
  // バッチ3: 配役順(スタイルで決まる[1体目,2体目])。ラン内で最初に0.50を跨いだ時点で1度だけ決め、以後固定。
  // pendingCast: バッチ3.5-B(盤面在庫)。castFirstNow/castSecondNowは0.50/0.65跨ぎの一瞬だけ立つ
  // パルスなので、そのフレームで(Tank存命中/debt過多により)投入できなければここに保留し、
  // 条件が晴れるまで毎フレーム再チェックする(タイマー消費なし・パルスを取りこぼさない)。
  const pressureCastRef = useRef<{ order: [ProblemChild, ProblemChild] | null; pendingCast: ProblemChild | null }>({ order: null, pendingCast: null });
  // バッチM1-C(主題保証): 関所開始時点のfeatured型ごとの出現数スナップショット(ディープコピー・
  // 実装精度の規律3)+その関所内で既に保証投入済みの型の集合。keyが変わったら(新しい関所)登り直す。
  const featureGuaranteeRef = useRef<{ key: string; startedAt: number; startSnapshot: Record<KillBucket, number> | null; satisfied: Set<GuaranteeType> }>({ key: '', startedAt: 0, startSnapshot: null, satisfied: new Set() });
  // PACING_PUZZLE.md バッチM2: ランク(コマをまたいで引き継ぐ持続状態)。
  const puzzleClockRef = useRef<PuzzleClockState>(createPuzzleClockState());
  // バッチM6(§4-C): 4コマサイクル(リラックス→ハーベスト→通常→ピーク)の進行状態。
  // elapsedMsはボスフェーズ中は加算しない(§2「ボス中は査定・台本を停止、ボス後再開」)。
  // 通常/ピークは40秒経過後も台本が未片付きならコマ延長(処理待ち・上限+30秒)。
  // script=現在の台本(§4-D片付き駆動でコマ内ローテ)。scriptSpawned=現台本の邪魔者の累計出現数
  // (片付き判定「全数出現済みかつ現在0体」用)。provisionalDelta=通常コマ末の仮査定。
  // pendingFinalDelta=ピーク末の確定査定(次の通常コマ開始時に反映=§4-C)。
  // chaffRamp=チャフ目標の実効値(コマ目標へ1ずつ・下げは即)。belowTargetMs=枯渇継続(締めトリガー用)。
  const puzzleKomaRef = useRef<{
    kind: KomaKind4;
    elapsedMs: number;
    script: FormationPattern | null;
    scriptSpawned: NuisanceCounts;
    seenIds: Set<string>;
    lastPatternId: string | null;
    acc: KomaAccumulatorState;
    provisionalDelta: RankDelta | null;
    pendingFinalDelta: RankDelta | null;
    chaffRamp: ChaffRampState;
    belowTargetMs: number;
  }>({
    kind: 'relax', elapsedMs: 0, script: null, scriptSpawned: { ...ZERO_NUISANCE }, seenIds: new Set(),
    lastPatternId: null, acc: createKomaAccumulator(), provisionalDelta: null, pendingFinalDelta: null,
    chaffRamp: { target: 1, msSinceRampMs: 0 }, belowTargetMs: 0,
  });
  // バッチM6(§3-D改訂): 全コマ常時の「多少緩め」検知(直近10秒の被ダメ/Intensity/低HPのリング集計)。
  const puzzleSoftenRef = useRef<SoftenState>(createSoftenState());
  // バッチM4: 湧きCDのタイムスタンプ(gameTime基準)。0初期化=ラン開始直後は「経過時間0」からCD判定
  // が始まる(基本CD1秒待ってから1体目、の仕様と自然に一致)。
  const puzzleCdRef = useRef<{ lastBaseSpawnAt: number; lastNuisanceSpawnAt: number; lastSpecialSpawnAt: number }>({ lastBaseSpawnAt: 0, lastNuisanceSpawnAt: 0, lastSpecialSpawnAt: 0 });
  // §5.14 M13: 宿敵(ネームド)投入の独立CD(他の枠と競合しないよう専用)。
  const namedFoeRef = useRef<{ lastAttemptAt: number }>({ lastAttemptAt: 0 });
  // バッチM2: 被弾検知専用(pressureHitRef/M1と同じ責務分離パターン。AIディレクター本体とは別管理)。
  const puzzleHitRef = useRef<{ prevHp: number; lastHitAt: number }>({ prevHp: -1, lastHitAt: -1e9 });
  // バッチ2(計測): フェーズ開始時点の種別キル累計スナップショット(差分用)。
  // v0.25.1343: startTotalsは必ずディープコピー(snapshotKillTotals)で持つ。生参照だと差分が常に0になる。
  const killPhaseRef = useRef<{ phaseKey: string; startTotals: ReturnType<typeof snapshotKillTotals> | null; startSpawns: ReturnType<typeof snapshotSpawns> | null }>({ phaseKey: '', startTotals: null, startSpawns: null });
  // バッチ4: 直近に入った関所(gate)フェーズのfeatured型(「前の山の主役」=回収の判定材料)。
  const lastGateFeaturedRef = useRef<EnemyType[]>([]);
  // バッチ4: 現在の緩(buildup)フェーズで選ばれている演目+講習主役の投入済みフラグ
  // (「1フェーズ合計1体・キル後は再投入しない」の状態管理)。
  const reliefProgramRef = useRef<{ phaseKey: string; program: ReliefProgram | null; lessonSpawned: boolean; recoverySpawned: number }>({ phaseKey: '', program: null, lessonSpawned: false, recoverySpawned: 0 });
  // バッチ5: 現在の山(gate)フェーズで選ばれている台本+直近に見せた台本id(連続回避用)。
  const gateProgramRef = useRef<{ phaseKey: string; program: GateProgram | null; lastId: GateProgramId | null }>({ phaseKey: '', program: null, lastId: null });
  // バッチ2(計測): ラン中に到達した最深エリア(距離帯)index。リザルト表示用。
  const maxAreaRef = useRef(0);
  // PACING_PUZZLE.md §5.17 M14: 深さの壁「予告(この先——{区域名})」を壁ごとにラン1回だけ出すためのフラグ。
  const wallWarnedRef = useRef<boolean[]>([false, false, false, false]);
  // M14: このランの最深距離(px・毎フレーム追跡)+store/localStorageへの同期は1秒間隔(書き込み間引き)。
  const runDeepestDistRef = useRef(0);
  const wallDepthSyncRef = useRef(0);
  // 関所(襲撃)の開始/生還コールアウト用: 前フレームの台本フェーズキー。
  const gateCalloutRef = useRef('');
  const hunterKillsRef = useRef<{ t: number; total: number }[]>([]); // 撃破数の時系列(優勢判定の直近20s/6s集計)
  const hunterPrevHpRef = useRef(-1);   // 前フレームHP(被弾検出)
  const hunterLastDmgAtRef = useRef(-1e9); // 最後に被弾した gameTime
  const redNightFiredRef = useRef(false); // 紅き夜は1ラン1回のみ判定。判定済みフラグ。
  const redNightFireAtRef = useRef(rollRedNightFireAt()); // この出撃の発火判定時刻(5〜9分でランダム)。
  const lastSeenGameTimeRef = useRef(0);
  // Air-dropped supply timer. Tracks the gameTime of the last map ammo drop
  // and the (randomized) wait until the next one, so resupply crates appear at
  // an irregular but bounded cadence.
  const lastAmmoDropRef = useRef(0);
  const nextAmmoDropDelayRef = useRef(0);
  // How many of the scripted supply weapon-crates have dropped this run.
  const cratesDroppedRef = useRef(0);
  const prevLevelRef = useRef(1);
  const prevCounterSuccessRef = useRef(0);
  const prevHealthRef = useRef(0);
  const gameOverTriggeredRef = useRef(false);
  const dogFetchRef = useRef<DogFetchJob | null>(null);
  // Katana auto-slash timer (gameTime-based so it pauses with the game).
  const lastKatanaSlashRef = useRef(0);
  // ホーミング弾のロック状態(前フレームと比較して変化時のみ store を更新)。
  const homingLocksRef = useRef<string[]>([]);
  // 次にロックを1体付与できる gameTime(ms)。指を付けている間 0.5秒ごとに1体ずつロック。
  const nextHomingLockRef = useRef(0);
  // Decoy next-pulse time per decoy id (gameTime ms, so it pauses with the game).
  const decoyPulseRef = useRef<Map<string, number>>(new Map());
  // Shield contact debounce: next-allowed durability-hit time (gameTime ms) per
  // `${shieldId}:${enemyId}`, so each enemy only chips a shield once per interval.
  const shieldHitRef = useRef<Map<string, number>>(new Map());
  // 自動タレットの発射スロットル: タレットid -> 次に撃てる gameTime(ms)。
  const turretFireRef = useRef<Map<string, number>>(new Map());
  // AIディレクター(ステップA=読むだけ)の状態＋差分計算用の直近値。?director=1 のときだけ更新。
  // nextSampleMs: リザルトのタイムライン用に 0.5s 刻みで時系列サンプルを記録する次回時刻(gameTime ms)。
  const directorRef = useRef({ state: createDirectorState(), prevHp: 0, prevKills: 0, nextSampleMs: 0 });
  // クラッシュ診断(社長報告: スマホ数分プレイ後に真っ白→タイトル)。低頻度で状態をlocalStorageへ記録。
  const heartbeatRef = useRef({ nextAt: 0, pageLoadAt: Date.now() });
  // ドローンブーメラン停止中の周囲パルス: boomerang id -> 次パルスの gameTime(ms)。
  const boomPulseRef = useRef<Map<string, number>>(new Map());
  // ワイヤーダッシュ着地の近接攻撃を1ダッシュにつき1回だけ発火させるためのマーカー
  // (処理済みの wireDashUntil を覚える。常に増加するタイムスタンプなので衝突しない)。
  const wireLandedDashRef = useRef(0);
  // ワイヤーダッシュ中に「通過した敵」へ自動近接する際、1ダッシュにつき敵1回だけ当てるための記録。
  const wirePassHitRef = useRef<{ dash: number; ids: Set<string> }>({ dash: 0, ids: new Set() });
  // 前方集中(連射)タレットの索敵スキャン角(rad)。射程に敵がいない間ゆっくり回転する。
  const turretAimRef = useRef<Map<string, number>>(new Map());
  // 敵のジャンプ/ダッシュ攻撃でのオブジェクト破壊FXのスロットル時刻(gameTime)。破壊自体は毎回・FXのみ間引き。
  const enemyCrushFxRef = useRef<number>(0);
  // 四神舞(リズム): 停止が続いた gameTime の起点(0=未停止)。RHYTHM_ENTER_IDLE_MS でモード開始。
  const rhythmIdleStartRef = useRef<number>(0);
  // 四神舞: 動き出した gameTime の起点(0=停止中)。RHYTHM_EXIT_MOVE_MS 動き続けた時だけ終了
  // (フリックのドラッグやバッシュのスライド程度では抜けない)。
  const rhythmMoveStartRef = useRef<number>(0);
  // 練習モードの自動タップ: 最後に自動タップした拍インデックス(-1=未)。拍が進むたびに1回タップ。
  const autoTapBeatRef = useRef<number>(-1);
  // 自動アンカー: ダンス曲が鳴り出した瞬間にビートグリッド起点を1回だけ合わせ直したか
  // (毎フレーム同期はしない=ブルブル防止)。リズム開始ごとに false へ戻す。
  const rhythmAnchoredRef = useRef<boolean>(false);
  // 定期リシンク: 次に位相を合わせ直す時刻(Date.now基準, ms)。0=未予約。
  const rhythmResyncAtRef = useRef<number>(0);
  // ダンスビートB方式: メトロノームが直近に予約した拍index(-1=まだ無し)。リズム開始ごとにリセット。
  const danceBeatScheduledIndexRef = useRef<number>(-1);
  // 追尾カメラの進行方向先読みオフセット(px、描画のみ。フレーム間で保持)。
  const camLookAheadRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  // ダンスタイムBGM切替の前回状態(リズムの active 変化を検出して setDanceMode する)。
  const danceModeRef = useRef<boolean>(false);
  // 死神(深奥リスク)システムの内部状態。新しいランで rewind 検出時にリセット。
  const reaperRef = useRef<{ risk: number; lastPassAt: number; passCount: number; chaserId: string | null; chaserSpawnAt: number; lastWarpAt: number; lastTimeRollAt: number; timeSpawned: boolean; warpAnimStartAt: number; warpToX: number; warpToY: number; warpTeleported: boolean; defeatCount: number }>(
    { risk: 0, lastPassAt: 0, passCount: 0, chaserId: null, chaserSpawnAt: 0, lastWarpAt: 0, lastTimeRollAt: 0, timeSpawned: false, warpAnimStartAt: 0, warpToX: 0, warpToY: 0, warpTeleported: false, defeatCount: 0 }
  );
  // 死神チェイサーが直近に見せた liftUntil(=近接フィニッシュ/boss-stun×5 被弾の印)。増えたら「食らった」と判定しワープ。
  const reaperLiftRef = useRef(0);
  // 裏ボス(mimir/jormungand)コントローラの状態。spawned=この出撃で出現済みか(1回だけ)、
  // bossId=現在の敵id、lastX/Y=死亡位置検出用の直近座標。
  // thorPrevHealth/thorRangedHits: トール専用(ジャンプ攻撃のトリガー判定=遠距離からの連続被弾を数える)。
  // 他の裏ボス(mimir/jormungand/skadi)では未使用のまま(無害)。
  const bossRef = useRef<{ spawned: boolean; bossId: string | null; homeX: number; homeY: number; lastX: number; lastY: number; w: number; h: number; retreating: boolean; lastCrushFxAt: number; warpUntil: number; vx: number; vy: number; dashDirX: number; dashDirY: number; thorPrevHealth: number; thorRangedHits: number[]; thorNextBackstepAt: number; thorNextOrbitStepAt: number; thorNextSlowWalkAt: number; thorSlowWalkUntil: number }>(
    { spawned: false, bossId: null, homeX: 0, homeY: 0, lastX: 0, lastY: 0, w: 0, h: 0, retreating: false, lastCrushFxAt: 0, warpUntil: 0, vx: 0, vy: 0, dashDirX: 0, dashDirY: 0, thorPrevHealth: -1, thorRangedHits: [], thorNextBackstepAt: 0, thorNextOrbitStepAt: 0, thorNextSlowWalkAt: 0, thorSlowWalkUntil: 0 }
  );
  // ?gateboss=1 診断: ラン開始後に1回だけそのステージのゲート2ボスをforce-spawnしたかどうか。
  const gatebossForceRef = useRef(false);
  // ミゲル専用「たまにゆっくり歩く」タイマー(社長指示・トールのthorNextSlowWalkAt/thorSlowWalkUntil相当)。
  // ミゲルは bossRef を使わない独立ブロックのため専用の小さな ref を持つ。
  const miguelSlowRef = useRef({ slowUntil: 0, nextAt: 0 });
  // juice(flashy unified boss death): 直近に鳴らした bossCorpse.diedAt(0=未鳴動)。store の
  // bossCorpse は getsDramaticDeath 対象(ネームド/裏ボス/giantbat/hunter)討伐で共通に立つので、
  // ここで変化を検出して 'boss-death' SFX を1回だけ鳴らす(gameStore は playSfx を持てないため)。
  const bossCorpseSfxRef = useRef(0);
  // 城ボスのアテンション遅延: 出現エフェクト(リング/グロウ/バースト)が消えてからカメラアテンションを出す
  // (出現直後だと演出で本体がぼやける・社長指示)。{at,x,y}=発火予定gameTime と注目座標。0=予約なし。
  const castleAttnRef = useRef<{ at: number; x: number; y: number }>({ at: 0, x: 0, y: 0 });
  // 拠点制圧カウントの直近値(増加検出で開放SEを鳴らす)。
  const suppCaptureCountRef = useRef<number>(0);
  // 直近の区域インデックス(エリア遷移バナー用)。-1=未判定(開始/リワインド直後は黙って採用し、開始地点では出さない)。
  const areaZoneRef = useRef<number>(-1);
  // 社長指示(仕様変更v0.25.1523): 到達時のSEは1プレイ(1ラン)中1エリア1回まで。ステージ永続の
  // WallMetaとは別の「今回のランで既に鳴らした区域」集合(新ランでリセット)。
  const zoneSfxPlayedRef = useRef<Set<number>>(new Set());
  const areaSectorRef = useRef<number>(-1); // 担当エリア(セクター)進入セリフ用。現在のセクター(ハブ付近では-1)。
  // ゾーン判定の間引き用カウンタ + 深層域BGM(逆再生)の現フェーズ。
  const zoneTickRef = useRef<number>(0);
  const deepBgmPhaseRef = useRef<DeepBgmPhase>('shallow');
  // PACING_PUZZLE.md §5.21 M20(囲いゲート1/2): このステージの恒久解除メタ(resetGameで読み直す)。
  const gateMetaRef = useRef(emptyGateMeta());
  // §5.21 M20追補(v0.25.1534): クリア(gameWon)/撤退(gameReturned)での進捗コミットを一度だけ行うための
  // ガード(死亡はtriggerPlayerDeath側のgameOverTriggeredRefが同じ役割を果たす)。新ランでリセット。
  const runEndCommittedRef = useRef(false);
  // 未クリアのまま未確認境界(gate1)へ入った「未達ペナルティ」発動中フラグ(ハンター復活/死神前倒し用)。
  const gate1PenaltyActiveRef = useRef(false);
  // 現在の activeEvent がゲート由来か(クリア時にゲート専用の後処理を行うため)。1/2=ゲート番号/null=通常。
  const activeGateRef = useRef<1 | 2 | null>(null);
  // 未確認境界を未クリアで踏破し、ゲート1の発火待ち(activeEventが空くのを待つ)。
  const gate1PendingRef = useRef(false);
  // 深層境界を未クリアで踏破し、ゲート2の発火待ち(activeEventが空くのを待つ)。
  const gate2PendingRef = useRef(false);
  // §5.21-追補3(社長決定v0.25.1546): ラン内ガード。台本(fromEvent)殲滅でクリアした瞬間に立て、
  // 恒久コミット(gateMetaRef.current.gate1Cleared・ラン終了時commit)を待たずに同ランでの再発火を止める
  // (実機報告「サークルの敵を全滅させたら、またサークルの敵が沸いた」対策・shouldTriggerGate1参照)。
  const gate1DoneThisRunRef = useRef(false);

  // Game actions
  const movePlayer = useGameStore(state => state.movePlayer);
  const fireWeapons = useGameStore(state => state.fireWeapons);
  const updateEnemies = useGameStore(state => state.updateEnemies);
  const updateProjectiles = useGameStore(state => state.updateProjectiles);
  const addEnemy = useGameStore(state => state.addEnemy);
  const markCastleBossSpawned = useGameStore(state => state.markCastleBossSpawned);
  const damageEnemy = useGameStore(state => state.damageEnemy);
  const damagePlayer = useGameStore(state => state.damagePlayer);
  const removeProjectile = useGameStore(state => state.removeProjectile);
  const reflectProjectile = useGameStore(state => state.reflectProjectile);
  const addProjectile = useGameStore(state => state.addProjectile);
  const setSubWeaponCooldown = useGameStore(state => state.setSubWeaponCooldown);
  const performKatanaStrike = useGameStore(state => state.performKatanaStrike);
  const rootEnemy = useGameStore(state => state.rootEnemy);
  const updateHuntingCharge = useGameStore(state => state.updateHuntingCharge);
  const collectPickup = useGameStore(state => state.collectPickup);
  const addPickup = useGameStore(state => state.addPickup);
  const dropEnemyXp = useGameStore(state => state.dropEnemyXp);
  const syncBreakableProps = useGameStore(state => state.syncBreakableProps);
  const damageBreakableProp = useGameStore(state => state.damageBreakableProp);
  const dropBreakablePropLoot = useGameStore(state => state.dropBreakablePropLoot);
  const autoSwitchIfDry = useGameStore(state => state.autoSwitchIfDry);
  const tickReload = useGameStore(state => state.tickReload);
  const setGameTime = useGameStore(state => state.setGameTime);
  const updateGameStats = useGameStore(state => state.updateGameStats);
  const setCameraPosition = useGameStore(state => state.setCameraPosition);
  const addMeleeFinishCombo = useGameStore(state => state.addMeleeFinishCombo);
  const spawnBurst = useGameStore(state => state.spawnBurst);
  const spawnDamageNumber = useGameStore(state => state.spawnDamageNumber);
  const spawnRing = useGameStore(state => state.spawnRing);
  const spawnFlash = useGameStore(state => state.spawnFlash);
  const spawnEffect = useGameStore(state => state.spawnEffect);
  const updateEffects = useGameStore(state => state.updateEffects);

  useEffect(() => {
    benchmarkModeRef.current = Boolean(options.benchmarkMode);
  }, [options.benchmarkMode]);

  const triggerPlayerDeath = useCallback((x: number, y: number) => {
    if (gameOverTriggeredRef.current) return;
    gameOverTriggeredRef.current = true;
    // PACING_PUZZLE.md §5.17 M14: 死亡確定時に最終同期(1秒間隔の間引きだと直近の数百msが漏れるため)。
    if (WALL_ENABLED) syncWallDepth(runDeepestDistRef.current);
    // §5.21 M20追補(v0.25.1534): 死亡は「記録」のみコミット(踏破/ゲート恒久解除はコミットしない)。
    if (WALL_ENABLED) commitRunEndProgress('death', gateMetaRef.current);
    setHurricaneRumble(false); // 死亡で鳴動を止める(ループが回り続けても残響しない)
    setHeartbeatLoop(false); // 心音ループも死亡で止める
    setPeakLayer(false); // PEAK重ねSEも死亡で止める
    playSfx('player-damage');
    spawnFlash('rgba(127, 29, 29, 0.48)', 520);
    spawnRing(x, y, 8, 118, 'rgba(220,38,38,0.9)', 7, 620);
    spawnRing(x, y, 24, 168, 'rgba(127,29,29,0.66)', 4, 760);
    useGameStore.getState().spawnGlow(x, y, 96, 'rgba(220,38,38,', PLAYER_DEATH_SLOW_MS);
    useGameStore.getState().triggerTimeSlow(0.32, PLAYER_DEATH_SLOW_MS);
    spawnBurst(x, y, '#ef4444', 36);
    spawnBurst(x, y, '#7f1d1d', 22);
    // 立ち絵の1秒フェードを見せてからゲームオーバー画面へ(現状の死亡演出はそのまま)。
    window.setTimeout(onGameOver, 1100);
  }, [onGameOver, spawnBurst, spawnFlash, spawnRing]);

  const spawnEggFluidSplash = useCallback((x: number, y: number, intensity = 1) => {
    const now = Date.now();
    const count = Math.round(30 * intensity);
    const colors = ['#a3e635', '#65a30d', '#15803d', '#052e16'];
    for (let i = 0; i < count; i++) {
      const upwardBias = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.92;
      const angle = Math.random() < 0.72 ? upwardBias : Math.random() * Math.PI * 2;
      const speed = 54 + Math.random() * 190 * intensity;
      const size = 1.6 + Math.random() * (2.6 + intensity);
      spawnEffect({
        kind: 'particle',
        id: `fx-egg-fluid-${now}-${i}-${Math.random().toString(36).slice(2, 6)}`,
        x: x + (Math.random() - 0.5) * 8,
        y: y + (Math.random() - 0.5) * 5,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed * 0.78,
        color: colors[i % colors.length],
        size,
        createdAt: now,
        duration: 420 + Math.random() * 260,
        drag: 3.4,
        liquid: true,
      });
    }
  }, [spawnEffect]);

  // Game loop
  useEffect(() => {
    // --- 四神舞(リズム)の攻撃実行ヘルパー(store=判定、loop=実行)。すべて軽量・短命VFX。
    const SHIJIN_BOSS_TYPES = new Set(['giantbat', 'pumpkin', 'reaper']);
    const ARROW_VEC: Record<RhythmArrow, { x: number; y: number }> = {
      up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 },
    };
    // 1体に当てる。スタン中の雑魚は近接フィニッシュで処刑(allowExecute)。ボスは処刑しない。
    const shijinHitEnemy = (enemyId: string, damage: number, allowExecute: boolean) => {
      const st = useGameStore.getState();
      const e = st.enemies.find(x => x.id === enemyId);
      if (!e) return false;
      const stunned = e.stunUntil !== undefined && st.gameTime < e.stunUntil;
      const boss = SHIJIN_BOSS_TYPES.has(e.type);
      const ex = e.x + e.width / 2;
      const ey = e.y + e.height / 2;
      const dmg = allowExecute && stunned && !boss ? Math.max(damage, e.health) : damage;
      const killed = damageEnemy(enemyId, dmg);
      if (killed) {
        playEnemyDeath();
        dropEnemyXp(e, ex, ey, `pickup-xp-shijin-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
      } else {
        spawnDamageNumber(ex, e.y, Math.round(dmg), stunned);
      }
      return killed;
    };
    // 直線(帯)攻撃: 起点から(dx,dy)方向 length まで、半幅 halfW の帯に入る敵へ。
    const rhythmLineAttack = (cx: number, cy: number, dx: number, dy: number, length: number, halfW: number, damage: number, kbMult: number, execute: boolean, kbMax = 3) => {
      for (const e of useGameStore.getState().enemies) {
        if (e.type === 'reaper') continue;
        const rx = e.x + e.width / 2 - cx;
        const ry = e.y + e.height / 2 - cy;
        const along = rx * dx + ry * dy;
        if (along < 0 || along > length) continue;
        const perp = Math.abs(rx * dy - ry * dx);
        if (perp > halfW + e.width / 2) continue;
        shijinHitEnemy(e.id, damage, execute);
        if (kbMult > 0) useGameStore.getState().knockbackEnemy(e.id, dx, dy, kbMult, kbMax);
      }
      // ダンスの線攻撃(フリック/玄武/青龍)でも松明・卵を破壊(min 30 で確実に砕く)。
      useGameStore.getState().breakPropsAlong(cx, cy, dx, dy, length, halfW, Math.max(damage, 30));
    };
    // 玄武/青龍の直線VFX: 少しクネクネさせた短命のスラッシュ点 + 端のバースト(軽量・ピクセル調)。
    const lineVfx = (cx: number, cy: number, dx: number, dy: number, length: number, sparkColor: string, burstHex: string) => {
      for (let t = 0.25; t <= 1.001; t += 0.25) {
        const j = (Math.random() - 0.5) * 12;
        useGameStore.getState().spawnSlash(cx + dx * length * t - dy * j, cy + dy * length * t + dx * j, sparkColor);
      }
      spawnBurst(cx + dx * length, cy + dy * length, burstHex, 6);
    };
    const fireShijinGod = (god: ShijinGod, x: number, y: number) => {
      // 四神技発動の揺れ(描画のみ=リズム不変)。
      useGameStore.getState().triggerShake(SHIJIN_TECH_SHAKE_MS, SHIJIN_TECH_SHAKE_MAG);
      if (god === 'suzaku') {
        // 朱雀: 近場最大3体を「グレネードランチャー(rifle-t3)」相当で爆破(手榴弾heavy-grenadeではない)。
        // 半径・演出時間はランチャーの爆発(GRENADE_BLAST_RADIUS / GRENADE_LAUNCHER_EXPLOSION_EFFECT_MS)に合わせ、
        // 色だけ朱雀(朱)に。範囲ダメージはフォールオフ。
        const blastR = GRENADE_BLAST_RADIUS;
        const fxMs = GRENADE_LAUNCHER_EXPLOSION_EFFECT_MS;
        const targets = useGameStore.getState().enemies
          .filter(e => e.type !== 'reaper')
          .map(e => ({ e, d: Math.hypot(e.x + e.width / 2 - x, e.y + e.height / 2 - y) }))
          .sort((a, b) => a.d - b.d).slice(0, SUZAKU_MAX_TARGETS).map(h => h.e);
        spawnFlash('rgba(248,113,113,0.16)', 150);
        for (const t of targets) {
          const bx = t.x + t.width / 2;
          const by = t.y + t.height / 2;
          spawnRing(bx, by, 10, blastR, 'rgba(248,113,113,0.85)', 5, fxMs);
          spawnBurst(bx, by, '#f87171', 20);
          spawnBurst(bx, by, '#7f1d1d', 8);
          useGameStore.getState().spawnGlow(bx, by, 58, 'rgba(248,113,113,', fxMs);
          for (const e of useGameStore.getState().enemies) {
            if (e.type === 'reaper') continue;
            const dist = Math.hypot(e.x + e.width / 2 - bx, e.y + e.height / 2 - by);
            if (dist > blastR) continue;
            const falloff = 1 - dist / blastR;
            shijinHitEnemy(e.id, Math.max(1, Math.round(SUZAKU_BLAST_DAMAGE * (0.55 + falloff * 0.45))), true);
          }
        }
        playSfx('bomb');
        useGameStore.getState().spawnCallout(x, y - 30, '朱雀', '#f87171', { scale: 2.6, serif: true });
      } else if (god === 'genbu') {
        // 玄武: 上下左右の十字直線(プレイヤー幅程度)。
        for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
          rhythmLineAttack(x, y, dx, dy, GENBU_LINE_LENGTH, GENBU_LINE_HALF_W, GENBU_DAMAGE, 0, true);
          lineVfx(x, y, dx, dy, GENBU_LINE_LENGTH, 'rgba(214,211,170,0.9)', '#a16207');
        }
        playSfx('melee');
        useGameStore.getState().spawnCallout(x, y - 30, '玄武', '#cbd5e1', { scale: 2.6, serif: true });
      } else if (god === 'seiryu') {
        // 青龍: 斜めX字の直線(水流)。
        const s = Math.SQRT1_2;
        for (const [dx, dy] of [[s, -s], [-s, -s], [s, s], [-s, s]]) {
          rhythmLineAttack(x, y, dx, dy, SEIRYU_LINE_LENGTH, SEIRYU_LINE_HALF_W, SEIRYU_DAMAGE, 0, true);
          lineVfx(x, y, dx, dy, SEIRYU_LINE_LENGTH, 'rgba(186,230,253,0.9)', '#0ea5e9');
        }
        playSfx('melee');
        useGameStore.getState().spawnCallout(x, y - 30, '青龍', '#38bdf8', { scale: 2.6, serif: true });
      } else {
        // 白虎: 5秒間の持続斬りを開始(以後 loop が0.5秒ごとにパルス処理)。
        useGameStore.getState().startByakko();
        useGameStore.getState().spawnCallout(x, y - 30, '白虎', '#e5e7eb', { scale: 2.6, serif: true });
      }
    };
    // 四神技4回成功 → 画面内の敵に全体フィニッシュ(雑魚=処刑/ボス=大ダメージ)。一度だけ実行。
    const shijinWholeScreenFinish = () => {
      const st = useGameStore.getState();
      const cam = st.camera;
      const b = st.gameBounds;
      const m = SHIJIN_FINISH_SCREEN_MARGIN;
      const onScreen = st.enemies.filter(e => {
        const ex = e.x + e.width / 2;
        const ey = e.y + e.height / 2;
        return ex >= cam.x - m && ex <= cam.x + b.width + m && ey >= cam.y - m && ey <= cam.y + b.height + m;
      });
      spawnFlash('rgba(255,255,255,0.5)', 200);
      for (const e of onScreen) {
        if (SHIJIN_BOSS_TYPES.has(e.type)) shijinHitEnemy(e.id, SHIJIN_FINISH_BOSS_DAMAGE, false);
        else shijinHitEnemy(e.id, 99999, true);
      }
      playSfx('melee-finish');
    };
    const executeRhythmPending = (pa: RhythmPending) => {
      const p = useGameStore.getState().player;
      const pcx = p.x + p.width / 2;
      const pcy = p.y + p.height / 2;
      if (pa.kind === 'tap') {
        // ジャストのタップ: 近接ナイフ範囲(MELEE_RADIUS+ハンティング補正)内の敵を強制ノックバック。
        // カウンター窓も開く(ダンス中はタップで敵弾を弾ける)。
        useGameStore.getState().openCounterWindow();
        const meleeR = huntingMeleeRadius(p);
        spawnRing(pcx, pcy, 6, meleeR, 'rgba(167,139,250,0.6)', 2, 200);
        for (const e of useGameStore.getState().enemies) {
          if (e.type === 'reaper') continue;
          const ex = e.x + e.width / 2;
          const ey = e.y + e.height / 2;
          const d = Math.hypot(ex - pcx, ey - pcy);
          if (d > meleeR) continue;
          shijinHitEnemy(e.id, RHYTHM_TAP_DAMAGE, false);
          const n = Math.max(0.001, d);
          useGameStore.getState().knockbackEnemy(e.id, (ex - pcx) / n, (ey - pcy) / n, RHYTHM_TAP_KNOCKBACK_MULT);
        }
        // ダンスのタップ(近接円)でも松明・卵を破壊。
        useGameStore.getState().breakPropsAlong(pcx, pcy, 1, 0, 0, meleeR, 30);
        // B方式: メトロノームが拍そのものを鳴らすので、JUST成功音はピッチ上げで差別化(仕様4)。
        playSfx(BEAT_ENABLED ? 'dance-kick-just' : 'dance-kick'); // ジャスト成功 → キックドラム(拍踏み)
      } else if (pa.kind === 'flick') {
        // バッシュ(フリック): カウンター窓を開き、近接フィニッシュ可(execute=true)、
        // ノックバックは上限6(=距離2倍)で強く弾く。
        useGameStore.getState().openCounterWindow();
        const v = ARROW_VEC[pa.arrow];
        rhythmLineAttack(pcx, pcy, v.x, v.y, RHYTHM_FLICK_RANGE, RHYTHM_FLICK_HALF_W, RHYTHM_FLICK_DAMAGE, RHYTHM_FLICK_KNOCKBACK_MULT, true, RHYTHM_FLICK_KNOCKBACK_MAX);
        useGameStore.getState().spawnSlash(pcx + v.x * RHYTHM_FLICK_RANGE * 0.6, pcy + v.y * RHYTHM_FLICK_RANGE * 0.6, 'rgba(186,230,253,0.9)');
        // フリックの斬撃音(katana-dash)は無し。拍踏みのキックドラムのみ鳴らす(B方式はピッチ上げで差別化)。
        playSfx(BEAT_ENABLED ? 'dance-kick-just' : 'dance-kick'); // フリックのジャスト成功でもキックドラム(拍踏み)
      } else if (pa.kind === 'god') {
        fireShijinGod(pa.god, pa.x, pa.y);
      } else if (pa.kind === 'finish') {
        shijinWholeScreenFinish();
      }
    };

    const gameLoop = (timestamp: number) => {
     try { // 診断+耐障害: ループ本体の例外でrAFが途切れて全停止(=移動/敵/弾が止まる)のを防ぎ、例外内容を記録。
      // The game can sit idle (tab in background, game-over screen, paused
      // mid-render, etc.) for arbitrary amounts of time. We must NOT pass
      // huge deltas into the simulation — they cause physics teleports
      // (every enemy slammed into the player, projectiles flying off the
      // map, gameTime jumping minutes). On the very first frame after a
      // (re)mount, lastFrameTimeRef is 0 and `timestamp - 0` is the entire
      // page-lifetime, which is the worst case. Establish the time origin
      // and skip the simulation step on that frame.
      if (lastFrameTimeRef.current === 0) {
        lastFrameTimeRef.current = timestamp;
        frameRef.current = requestAnimationFrame(gameLoop);
        return;
      }

      const rawDelta = (timestamp - lastFrameTimeRef.current) / 1000;
      const baseDeltaTime = Math.min(0.05, rawDelta);
      lastFrameTimeRef.current = timestamp;

      // Hitstop: a melee finisher freezes the whole simulation for a beat. Keep
      // the time origin current so we don't get a giant delta when it lapses.
      const nowMs = Date.now();

      // --- アテンション・シネマティック(レスキュー/ジャイアント出現) ---
      // 現地へ高速パン→2-3秒ホールド→高速で戻る。その間は hitstop でシム/アニメ停止(時間停止)。
      // ここ(hitstop早期returnの前)でカメラだけ毎フレーム動かす。終了で解除し通常進行へ。
      {
        const att = useGameStore.getState().attention;
        if (att) {
          const el = nowMs - att.startReal;
          if (el >= ATTENTION_TOTAL_MS) {
            useGameStore.getState().clearAttention();
          } else {
            const gb = useGameStore.getState().gameBounds;
            const focusX = att.x - gb.width / 2;   // 注目点を画面中央に
            const focusY = att.y - gb.height / 2;
            const smooth = (t: number) => { const c = Math.max(0, Math.min(1, t)); return c * c * (3 - 2 * c); };
            let cx: number, cy: number;
            if (el < ATTENTION_IN_MS) {
              const t = smooth(el / ATTENTION_IN_MS);
              cx = att.fromCamX + (focusX - att.fromCamX) * t;
              cy = att.fromCamY + (focusY - att.fromCamY) * t;
            } else if (el < ATTENTION_IN_MS + ATTENTION_HOLD_MS) {
              cx = focusX; cy = focusY;
            } else {
              const t = smooth((el - ATTENTION_IN_MS - ATTENTION_HOLD_MS) / ATTENTION_OUT_MS);
              cx = focusX + (att.fromCamX - focusX) * t;
              cy = focusY + (att.fromCamY - focusY) * t;
            }
            setCameraPosition(cx, cy);
            frameRef.current = requestAnimationFrame(gameLoop);
            return;
          }
        }
      }

      if (nowMs < useGameStore.getState().hitstopUntil) {
        frameRef.current = requestAnimationFrame(gameLoop);
        return;
      }

      // ハリケーン鳴動「ゴゴゴゴ」: 鞭ハリケーン発動中、または錬金術レア(死神)の吸引中だけループ。
      // どちらも「中心へ敵を吸い寄せる渦」なので同じ鳴動を流用。毎フレーム現状態で駆動し、
      // idempotent なので遷移時のみ start/stop する(非ポーズ時のみ)。
      {
        const gs = useGameStore.getState();
        const reaperSuctionActive = gs.summons.some(s => s.kind === 'rare');
        setHurricaneRumble(!gs.isPaused && (!!gs.hurricane || reaperSuctionActive));
      }

      // 瀕死(低HP)中だけ心音ループ(社長提供SE)。生きている間だけ・ポーズ/死亡中は鳴らさない。
      // 注意: isGameTimeStopped()(カウンター等の一瞬のヒットストップ)は条件に入れない。低HP戦闘中は
      // ヒットストップが頻発し、入れると毎回ループが再始動して「ブブブブ」と連打に化ける(社長報告)。
      {
        const gs = useGameStore.getState();
        const hpFrac = gs.player.maxHealth > 0 ? gs.player.health / gs.player.maxHealth : 0;
        const critical = gs.player.health > 0 && hpFrac <= HEARTBEAT_HP_FRAC && !gs.isPaused;
        setHeartbeatLoop(critical);
        // PEAK重ねSE+BGMダッキング: トリガーは「多数の変異体を検知」バナーと同じ源=台本に統一
        // (社長指示。反応型macroのPEAKでは鳴らさない=macro基準だとRELAX表示中に鳴る、が起きる)。
        // PACING_PUZZLE.md M6(§4-C): パズル方式ON時の演出コマは**ピーク**(通常コマでは鳴らさない・
        // 仕様に明記)。?puzzle=0時・ボス中(puzzleDebug=null)は従来どおり旧PHASESのgateフェーズで判定。屋外のみ。
        const puzzlePeakSnap = PUZZLE_ENABLED ? getPuzzleDebug() : null;
        const scriptedPeak = puzzlePeakSnap
          ? puzzlePeakSnap.komaKind === 'peak'
          : (gs.stageTheme !== 'lab' && !gs.indoorMode && phaseAt(gs.gameTime).kind === 'gate');
        setPeakLayer(!gs.isPaused && gs.player.health > 0 && (scriptedPeak || gs.redNight?.phase === 'active'));
      }

      // Update FPS counter
      fpsCounterRef.current.frames++;
      if (timestamp - fpsCounterRef.current.lastCheck >= 1000) {
        setFps(fpsCounterRef.current.frames);
        fpsCounterRef.current.frames = 0;
        fpsCounterRef.current.lastCheck = timestamp;
      }
      
      // Skip updates if game is paused. Read fresh from the store (not the
      // captured closure) so a level-up / pause takes effect immediately even
      // before React re-runs this effect with the new value.
      if (!useGameStore.getState().isPaused && !useGameStore.getState().backgrounded) {
        const loopState = useGameStore.getState();
        const {
          gameTime,
          player,
          enemies,
          pickups,
          inputState,
          swipeDirection,
          gameBounds,
        } = loopState;
        const danceTest = loopState.danceTestMode; // 仮: 練習モードは敵を一切スポーンしない
        const indoor = loopState.indoorMode;       // 屋内ステージ: 自動湧き/wave/城/死神を止め、固定敵のみ
        const labTheme = loopState.stageTheme === 'lab'; // 研究所スキン: 湧く敵をラボ用ゾンビのみにする
        const snowTheme = loopState.farBackdrop === 'snow'; // ステージ4(雪原): 新型 lich を湧きプールに含める

        // PACING_PUZZLE.md §5.18 M17: 被ダメ5経路(src/utils/combatTick.ts)へ渡す演出コールバック+
        // チューニング値。値そのものは以下のローカル定数のまま(二重管理を避けるため引数化しただけ)。
        const combatEffects: CombatEffects = {
          playSfx,
          spawnFlash,
          spawnRing,
          spawnBurst,
          spawnGlow: (...args) => useGameStore.getState().spawnGlow(...args),
          spawnCallout: (...args) => useGameStore.getState().spawnCallout(...args),
          spawnDamageNumber,
          spawnEggFluidSplash,
          triggerHitImpact: (...args) => useGameStore.getState().triggerHitImpact(...args),
          addMeleeFinishCombo,
          triggerPlayerDeath,
          markMeleeSwingFx: () => useGameStore.getState().markMeleeSwingFx(),
        };
        const combatTunables: CombatTunables = {
          thorOrbitDist: THOR_ORBIT_DIST,
          thorCounterLeapMs: THOR_COUNTER_LEAP_MS,
          grenadeBlastRadius: GRENADE_BLAST_RADIUS,
          grenadeBlastDamageMult: GRENADE_BLAST_DAMAGE_MULT,
          counterReflectSlowMs: COUNTER_REFLECT_SLOW_MS,
        };

        // クラッシュ診断(常時・低頻度=3秒毎): 「数分プレイ後に真っ白→タイトルに戻る」現象の手がかり用。
        // 例外を投げないOS/ブラウザ側のタブ強制終了はJSで検知できないため、直前の状態を localStorage へ
        // 上書き記録しておき、次回起動時にタイトル画面で確認できるようにする(読み書きのみ・ゲーム挙動不変)。
        if (timestamp >= heartbeatRef.current.nextAt) {
          heartbeatRef.current.nextAt = timestamp + 3000;
          recordHeartbeat({
            elapsedSec: Math.round((Date.now() - heartbeatRef.current.pageLoadAt) / 1000),
            gameTimeSec: Math.round(gameTime / 1000),
            enemies: enemies.length,
            projectiles: loopState.projectiles.length,
            effects: loopState.effects.length,
            pickups: pickups.length,
            breakableProps: loopState.breakableProps.length,
            heapMB: readHeapMB(),
          });
        }
        // 範囲攻撃(爆発)の壁ブロック用。爆心地周辺の壁を1回だけ取得 → 各敵へ視線判定。
        // 爆発は時々のイベント+敵数上限なので軽い。屋内=lab壁 / 屋外=近傍の木。
        const aoeWalls = (cx: number, cy: number): Rect[] => {
          if (indoor) return [...labBlockingWalls(loopState.labDoors.filter(d => d.open).map(d => d.id)), ...loopState.labProps.map(p => p.rect)];
          const pad = 200;
          return treesInRegion(cx - pad, cy - pad, cx + pad, cy + pad).map(trunkRect);
        };
        // スロー中は倍率を一定にせず、開始倍率→(必要ならholdMs保持)→1.0 へ滑らかにランプ
        // (満了で等速に切り替わる「ぶつ切り」を解消)。ヒットストップ(全停止)はループ先頭で別途処理済み。
        const timeScale = computeTimeSlowScale(
          nowMs, loopState.timeSlowStart, loopState.timeSlowUntil, loopState.timeSlowScale, loopState.timeSlowHoldMs
        );
        const deltaTime = baseDeltaTime * timeScale;

        if (benchmarkModeRef.current) {
          const targetCameraX = player.x - gameBounds.width / 2 + player.width / 2;
          const targetCameraY = player.y - gameBounds.height / 2 + player.height / 2;
          setCameraPosition(targetCameraX, targetCameraY);
          updateEffects(deltaTime);
          frameRef.current = requestAnimationFrame(gameLoop);
          return;
        }

        // --- キャラ登場演出(ロックマン的な飛び込み)---
        // 初フレームで終了時刻を確定。演出中はゲーム進行/入力/敵スポーンを止め、見た目だけ進める。
        let introUntil = loopState.introUntil;
        if (introUntil === -1) {
          // まっくら対策: レンダラ(Pixi)が初フレームを表示するまで登場演出を t=0 で保持する。
          // 冷間リロード時は WebGL init/テクスチャ読込で初フレームが遅れ、その間に演出時計が進むと
          // ヘリ登場が黒画面で消化されてしまう。表示準備が整ってから時計を開始し、演出を頭から流す。
          // フェイルセーフ: 万一 ready が来なくても最大 INTRO_RENDER_WAIT_MS で開始(無限保持を防ぐ)。
          const INTRO_RENDER_WAIT_MS = 5000;
          const rendererReady = !isPixiRenderer() || useGameStore.getState().rendererReady;
          if (!rendererReady) {
            if (introHoldSinceRef.current === 0) introHoldSinceRef.current = nowMs;
            if (nowMs - introHoldSinceRef.current < INTRO_RENDER_WAIT_MS) {
              // t=0 のカメラ位置(ヘリ飛来開始)に合わせて待機。進行/入力/スポーンは止めたまま。
              const introOff0 = playerIntroOffset(0);
              const camFollow0 = playerIntroCamFollow(0);
              const holdCamX = (player.x + introOff0.x * camFollow0) - gameBounds.width / 2 + player.width / 2;
              const holdCamY = (player.y + introOff0.y * CAMERA_INTRO_LIFT_FRAC) - gameBounds.height / 2 + player.height / 2;
              setCameraPosition(holdCamX, holdCamY);
              updateEffects(deltaTime);
              frameRef.current = requestAnimationFrame(gameLoop);
              return;
            }
          }
          introHoldSinceRef.current = 0;
          useGameStore.getState().stampPlayerIntro();
          introUntil = useGameStore.getState().introUntil;
          playSfx('heli-intro'); // ヘリコプター登場SE(社長提供・登場開始時に1回)
        }
        if (introUntil > 0 && nowMs < introUntil) {
          introWasActiveRef.current = true;
          // セリフ(登場時): ヘリが画面内に入った頃に時間停止して自動表示→流れ終わると再開。
          const introStateNow = useGameStore.getState();
          const rawIntroT = 1 - (introUntil - nowMs) / PLAYER_INTRO_MS;
          // 会話があるミッションのみ開始(フリーミッション等=空なら会話自体発生しない)。
          if (!introStateNow.introDialogueShown && rawIntroT >= INTRO_DIALOGUE_TRIGGER_T && introStateNow.introDialogueLines.length > 0) {
            useGameStore.getState().startIntroDialogue();
          }
          if (useGameStore.getState().introDialogueActive) {
            if (nowMs - useGameStore.getState().introDialogueStartedAt >= introDialogueTotalMs(useGameStore.getState().introDialogueLines)) {
              useGameStore.getState().endIntroDialogue(); // 流れ終わり → 再開
            } else {
              // 時間停止: 終了時刻を delta 分だけ後ろへ送り、登場進行 t を固定(ヘリ/キャラ静止)。
              useGameStore.setState({ introUntil: introUntil + baseDeltaTime * 1000 });
            }
          }
          // カメラがステージを横断して飛行キャラXに追従(<1でキャラが少し左から入る)。
          // 縦はヘリ高度へ寄せる(introOff.y は上=負。被写体を上方に置く)→ 降下に同期して着地面へ戻る。
          const introT = Math.max(0, Math.min(1, 1 - (useGameStore.getState().introUntil - nowMs) / PLAYER_INTRO_MS));
          // ヘリ着陸の瞬間(t が着陸点 hf を跨いだ)に着地SE＋砂煙リング＋軽い振動を1回。
          if (!heliLandedRef.current && introT >= PLAYER_INTRO_HELI_FRAC) {
            heliLandedRef.current = true;
            const pcx = player.x + player.width / 2;
            const pcy = player.y + player.height / 2;
            spawnRing(pcx, pcy + 6, 10, 92, 'rgba(210,200,180,0.6)', 4, 360);  // 砂煙(着地)
            spawnRing(pcx, pcy + 6, 4, 54, 'rgba(255,255,255,0.4)', 3, 300);
            spawnBurst(pcx, pcy + 10, '#cbb89a', 14);
            useGameStore.getState().triggerShake(INTRO_LAND_SHAKE_MS, INTRO_LAND_SHAKE_MAG);
            playSfx('heli-land'); // ヘリ着地SE(社長提供・着陸の瞬間)
          }
          const introOff = playerIntroOffset(introT);
          const camFollow = playerIntroCamFollow(introT);
          const targetCameraX = (player.x + introOff.x * camFollow) - gameBounds.width / 2 + player.width / 2;
          const targetCameraY = (player.y + introOff.y * CAMERA_INTRO_LIFT_FRAC) - gameBounds.height / 2 + player.height / 2;
          setCameraPosition(targetCameraX, targetCameraY);
          updateEffects(deltaTime);
          frameRef.current = requestAnimationFrame(gameLoop);
          return;
        }
        if (introWasActiveRef.current) {
          // 登場演出の終了。飛び降り着地は廃止したので終了時の衝撃演出は出さない(着地SE/砂煙は着陸の瞬間に出済み)。
          introWasActiveRef.current = false;
        }

        // ミッション開始以外でも introDialogue が立っている間は、開始時と同じく時間停止(simを進めない)。
        // 制圧の軍人セリフ(確保/撤退)に流用。カメラ/アテンション(上で更新済み)は実時間で進むので、
        // 撤退の吹き出しはアテンションのカメラ移動と同時に出る。総時間経過 or SKIP で自動終了。
        if (useGameStore.getState().introDialogueActive) {
          const ds = useGameStore.getState();
          if (nowMs - ds.introDialogueStartedAt >= introDialogueTotalMs(ds.introDialogueLines)) {
            useGameStore.getState().endIntroDialogue();
          } else {
            updateEffects(deltaTime);
            frameRef.current = requestAnimationFrame(gameLoop);
            return;
          }
        }

        // Update game time. realGameTime はポーズ中は止まるが slow-mo(timeScale)の影響を
        // 受けない「実効」時計(baseDeltaTime で進める)。スラッシャー追撃リングを slow-mo 中でも
        // 通常速度で刻むため(社長承認のA案)。
        const newGameTime = gameTime + deltaTime * 1000;
        const newRealGameTime = loopState.realGameTime + baseDeltaTime * 1000;
        setGameTime(newGameTime, newRealGameTime);
        useGameStore.getState().updateNpcDialogue(newGameTime); // NPCセリフの表示進行(時間停止なし)
        updateGameStats({ timeAlive: gameTime / 1000 });

        // Detect a fresh run (gameTime rewound to ~0) and reset scripted
        // wave consumption so the same player can re-fight the schedule.
        if (newGameTime < lastSeenGameTimeRef.current) {
          consumedWavesRef.current = newConsumedWaves();
          lastAmmoDropRef.current = 0;
          nextAmmoDropDelayRef.current = 0;
          cratesDroppedRef.current = 0;
          nextArenaAtRef.current = FORCE_ARENA != null ? 0 : ARENA_FIRE_AFTER_MS;
          boredomArenaNextEligibleAtRef.current = BOREDOM_ARENA_START_MS; // M20軸1のCDも新ランでリセット
          hordeSpawnRef.current = { spawned: 0, nextAt: 0, total: ARENA_HORDE_COUNT };
          gateEventPendingRef.current = null; // バッチ5追補も新ランでリセット
          redNightFiredRef.current = false;
          redNightFireAtRef.current = rollRedNightFireAt(); // 新ランで発火時刻を再抽選(5〜9分)
          rescueFiredRef.current = false; // 救助イベントの「1出撃1回」フラグも新ランで戻す
          // ハンター変異体イベントも新ランで全リセット(回数/CD/状態機械/優勢判定の履歴)。
          hunterRef.current = { phase: 'idle', eventsThisRun: 0, nextEligibleAt: HUNTER_START_MS, spawnAt: 0, detectStartAt: 0, chaseStartAt: 0, reinforced: 0, primaryId: '', vicious: false, viciousRearmAt: 0, viciousPendingAt: 0 };
          hunterKillsRef.current = [];
          hunterPrevHpRef.current = -1;
          hunterLastDmgAtRef.current = -1e9;
          screamerRef.current.nextEligibleAt = SCREAMER_START_MS; // 叫喚型ディレクターも新ランでリセット
          screamerBuffFxRef.current = 0; // 叫喚SE検出refも新ランでリセット(前ランのbuffUntilで誤ってスキップしない)
          gateRef.current = { key: '', startHpFrac: 1, live: 0 }; // 難易度④の関所ライブ補正も新ランでリセット
          // 難易度⑤(DirectorRank)も新ランでリセット(前ランのスナップショットで初回フェーズを誤評価しない)。
          rankRef.current = { rank: 0, phaseKey: '', phaseStartMs: 0, startDamageTaken: 0, startKills: 0, startLevel: 1, lastPerf: 0.7 };
          lastGateFeaturedRef.current = []; // バッチ4も新ランでリセット
          reliefProgramRef.current = { phaseKey: '', program: null, lessonSpawned: false, recoverySpawned: 0 };
          setReliefProgramDebug(null);
          gateProgramRef.current = { phaseKey: '', program: null, lastId: null }; // バッチ5も新ランでリセット
          setGateProgramDebug(null);
          setDirectorRankRewardMult(1);
          // 難易度⑥(ピンチ救済)も新ランでリセット。
          pinchRef.current = createPinchState();
          resetPityDrop();
          pityEventBlockUntilRef.current = 0; // バッチ7の発火猶予も新ランでリセット
          boardDebtRef.current = 0; // バッチ3.5-Bの盤面在庫も新ランでリセット
          // 憲法第1条(退屈→上振れ)も新ランでリセット。
          upswingRef.current = createBoredomState();
          // バッチ3(最小版)の連続圧力も新ランでリセット。
          gatePressureRef.current = { key: '', state: createGatePressureState() };
          pressureHitRef.current = { prevHp: -1, hitTimes: [] };
          pressureCastRef.current = { order: null, pendingCast: null };
          featureGuaranteeRef.current = { key: '', startedAt: 0, startSnapshot: null, satisfied: new Set() }; // バッチM1-Cも新ランでリセット
          setGatePressureDebug(null);
          // バッチM2/M3/M4/M6も新ランでリセット(ランク1・コマ=リラックス・湧きCD・被弾/緩め検知)。
          puzzleClockRef.current = createPuzzleClockState();
          puzzleKomaRef.current = {
            kind: 'relax', elapsedMs: 0, script: null, scriptSpawned: { ...ZERO_NUISANCE }, seenIds: new Set(),
            lastPatternId: null, acc: createKomaAccumulator(), provisionalDelta: null, pendingFinalDelta: null,
            chaffRamp: { target: 1, msSinceRampMs: 0 }, belowTargetMs: 0,
          };
          puzzleSoftenRef.current = createSoftenState();
          puzzleCdRef.current = { lastBaseSpawnAt: 0, lastNuisanceSpawnAt: 0, lastSpecialSpawnAt: 0 };
          puzzleHitRef.current = { prevHp: -1, lastHitAt: -1e9 };
          setPuzzleDebug(null);
          // バッチ2(計測)の種別キル集計も新ランでリセット(前ランの数字を引きずらない)。
          resetKillTelemetry();
          resetPhaseKillDebug();
          killPhaseRef.current = { phaseKey: '', startTotals: null, startSpawns: null };
          maxAreaRef.current = 0;
          wallWarnedRef.current = [false, false, false, false]; // M14の予告バンドも新ランで再アーム
          runDeepestDistRef.current = 0;
          wallDepthSyncRef.current = 0;
          gateCalloutRef.current = ''; // 関所コールアウトの前フェーズ記憶もリセット
          heliLandedRef.current = false; // ヘリ着陸SE/砂煙の1回フラグも新ランで戻す
          reaperRef.current = { risk: 0, lastPassAt: 0, passCount: 0, chaserId: null, chaserSpawnAt: 0, lastWarpAt: 0, lastTimeRollAt: 0, timeSpawned: false, warpAnimStartAt: 0, warpToX: 0, warpToY: 0, warpTeleported: false, defeatCount: 0 };
          bossRef.current = { spawned: false, bossId: null, homeX: 0, homeY: 0, lastX: 0, lastY: 0, w: 0, h: 0, retreating: false, lastCrushFxAt: 0, warpUntil: 0, vx: 0, vy: 0, dashDirX: 0, dashDirY: 0, thorPrevHealth: -1, thorRangedHits: [], thorNextBackstepAt: 0, thorNextOrbitStepAt: 0, thorNextSlowWalkAt: 0, thorSlowWalkUntil: 0 };
          gatebossForceRef.current = false; // ?gateboss=1 の force-spawn も新ランで再アーム
          miguelSlowRef.current = { slowUntil: 0, nextAt: 0 }; // ミゲルのゆっくり歩きタイマーも新ランで再アーム
          castleAttnRef.current = { at: 0, x: 0, y: 0 };
          suppCaptureCountRef.current = 0;
          areaZoneRef.current = -1; // 区域も再判定(リワインド/新ランで開始地点では出さない)
          zoneSfxPlayedRef.current = new Set(); // 到達SEの「今回のラン」判定も新ランでリセット
          areaSectorRef.current = -1; // 担当エリア進入セリフも再アーム
          gateMetaRef.current = getGateMeta(getSelectedStageId()); // M20ゲート恒久解除メタを選択ステージ分で読み直す
          runEndCommittedRef.current = false; // 進捗コミット済みガードも新ランで再アーム
          gate1PenaltyActiveRef.current = false; // 未達ペナルティも新ランで再アーム
          activeGateRef.current = null;
          gate1PendingRef.current = false;
          gate2PendingRef.current = false;
          gate1DoneThisRunRef.current = false; // ラン内ガードも新ランで再アーム
          deepBgmPhaseRef.current = 'shallow'; releaseDeepReverseBgm(); // 深層BGMも初期化
          // 進行中サブウェポンのトラッキング(前ランの古いID/座標)を破棄=新ランへの持ち越し防止。
          dogFetchRef.current = null;            // 進行中のドッグ取得をキャンセル
          decoyPulseRef.current.clear();         // デコイ/シールド/タレット/ブーメランのパルス記録
          shieldHitRef.current.clear();
          turretFireRef.current.clear();
          turretAimRef.current.clear();
          boomPulseRef.current.clear();
          zoneTickRef.current = 0;               // 区域判定の間引きカウンタも再アーム
          directorRef.current = { state: createDirectorState(), prevHp: 0, prevKills: 0, nextSampleMs: 0 }; // AIディレクターも新ランで初期化
          resetDirectorSamples(); // リザルトのタイムライン記録も新ランでクリア
        }
        lastSeenGameTimeRef.current = newGameTime;

        // PACING_PUZZLE.md §2: 本方式が「稼働中」かどうか。ボスフェーズ(既存PHASESのboss)だけは
        // 骨格を残すため対象外(§2「7:00城ボス=既存PHASESのbossフェーズだけ残す」)。curPhaseは
        // まだこの位置では未計算(ずっと下の別ブロックで初めて求まる)ので、既存の他箇所と同じく
        // phaseAt()を軽量に再呼び出しする(同種の再計算は無視できるコスト・既存踏襲)。
        const puzzleActiveNow = PUZZLE_ENABLED && !labTheme && !indoor && !danceTest && phaseAt(newGameTime).kind !== 'boss';

        const castle = useGameStore.getState().castleEvent;
        // 城のフィナーレボス: 城に近づくと魔法陣の演出(錬金と同じ=magic-circle)で giantbat が出現(社長指示)。
        // 城は最初から固定設置。出現条件は「7分経過(時間)」のみ=その時刻に城の位置へ giantbat がポップ。
        // (社長指示: 接近不要。城マーカーはボス出現後に表示。?castlenow=1 は即時。)
        // 以前は制圧イベント中(ステージ1メイン)は出さない仕様だったが、社長指示で撤回=制圧中でも
        // 時間が来たら出現するように変更(拠点制圧の完了を待たない)。
        const castleBossReady = FORCE_CASTLE_BOSS || newGameTime >= CASTLE_BOSS_MIN_TIME_MS;
        if (!danceTest && !indoor && !labTheme && !castle.bossSpawned && castleBossReady) {
          markCastleBossSpawned();
          useGameStore.setState({ eventBannerText: '危険変異体出現', eventBannerUntil: newGameTime + EVENT_BANNER_MS });
          const boss = spawnEnemyAt('giantbat', castle.x, castle.y, newGameTime);
          // 出現直後は城で待機=プレイヤーが近づくまで向かってこない(社長指示)。aggroRange 内へ入ると起動。
          boss.dormant = true;
          boss.aggroRange = GIANT_AGGRO_RANGE;
          boss.vx = 0;
          boss.vy = 0;
          addEnemy(boss);
          spawnFlash('rgba(127,29,29,0.28)', 420);
          spawnRing(castle.x, castle.y, 18, 170, 'rgba(239,68,68,0.9)', 7, 720);
          spawnRing(castle.x, castle.y, 42, 260, 'rgba(127,29,29,0.62)', 4, 920);
          useGameStore.getState().spawnGlow(castle.x, castle.y, 150, 'rgba(239,68,68,', 900);
          spawnBurst(castle.x, castle.y + 20, '#7f1d1d', 28);
          // アテンションは出現エフェクトが消えてから(=ぼやけ防止・社長指示)。下のディスパッチャが発火。
          castleAttnRef.current = { at: newGameTime + 950, x: castle.x, y: castle.y };
        }
        // 城ボスの遅延アテンション発火(出現演出が落ち着いてからカメラを寄せる)。
        if (castleAttnRef.current.at > 0 && newGameTime >= castleAttnRef.current.at && !useGameStore.getState().attention) {
          const { x, y } = castleAttnRef.current;
          castleAttnRef.current = { at: 0, x: 0, y: 0 };
          useGameStore.getState().triggerAttention(x, y);
          playSfx('boss-appear');
        }

        // --- 囲い系イベント(小イベント=強制アリーナ戦/ミニボス戦) ---
        // 開始2分以降にランダムで1回だけ発火。開始時に囲い周辺の通常敵を一掃し、イベント用の敵
        // (ゾンビ大量 or giantbot ミニボス)を円内に湧かせる。終了=全滅/撃破 or 制限時間。
        // 研究所/屋内/ダンスでは出さない(通常の森ステージ専用)。
        // PACING_PUZZLE.md §2: 本方式稼働中は「eventProducerの固定イベント」(囲い/ミニボス/救助/卵)を
        // 丸ごと停止する(ボスフェーズ中はpuzzleActiveNow=falseなので従来どおり動く=既存の骨格を保つ)。
        // PACING_PUZZLE.md §5.21 M20: 従来はここ全体(発火+進行)を !puzzleActiveNow で丸ごと停止していたが、
        // 「進行(スポーン段階/クリア判定/タイムアウト)」は M20 の新経路(軸1退屈補正の囲い等)が
        // puzzleActiveNow=true(通常プレイ)中に activeEvent をセットするケースでも動く必要があるため、
        // ゲートを「発火」側だけに絞る(進行側は常時稼働=puzzleActiveNow=falseの旧来挙動は無変更)。
        if (!danceTest && !indoor && !labTheme) {
          // PACING_PUZZLE.md §5.21-追補5(社長決定v0.25.1555): ゲート発火待ちが立っていて、かつ城ボス
          // 以外のイベント(レスキュー/退屈囲い=kind 'rescue'|'horde')が進行中なら、それを強制解除して
          // ゲートを発火可能にする(「ゲート>他イベント」の優先を発火時に効かせる)。城ボスは PHASE
          // (kind==='boss' → puzzleActiveNow=false)なので、この分岐は城ボス中は走らず自然に defer する。
          // activeEvent の kind 'boss'(アリーナミニボス/ゲート2自身)は強制解除しない(=protect)。
          // 既にゲートがアクティブ(activeGateRef!=null)なら触らない(発火済みのゲートを消さない)。
          {
            const aePre = useGameStore.getState().activeEvent;
            if (puzzleActiveNow && activeGateRef.current == null && aePre && aePre.kind !== 'boss') {
              const gate1WouldFire = shouldTriggerGate1({
                enabled: GATE_ENABLED,
                wallIdx: gate1PendingRef.current ? 3 : null,
                gate1Cleared: gateMetaRef.current.gate1Cleared,
                activeEventActive: false,
                doneThisRun: gate1DoneThisRunRef.current,
              });
              const gate2WouldFire = shouldTriggerGate2({
                enabled: GATE_ENABLED,
                wallIdx: gate2PendingRef.current ? 4 : null,
                gate2Cleared: gateMetaRef.current.gate2Cleared,
                activeEventActive: false,
              });
              if (gate1WouldFire || gate2WouldFire) {
                useGameStore.getState().endArenaEvent();
              }
            }
          }
          const ae = useGameStore.getState().activeEvent;
          if (!ae) {
           const gate1Ready = shouldTriggerGate1({
             enabled: GATE_ENABLED,
             wallIdx: gate1PendingRef.current ? 3 : null,
             gate1Cleared: gateMetaRef.current.gate1Cleared,
             activeEventActive: false, // 既に !ae 内=activeEventは無い
             doneThisRun: gate1DoneThisRunRef.current, // §5.21-追補3: ラン内ガード(全滅後の再湧き対策)
           });
           if (puzzleActiveNow && gate1Ready) {
            // PACING_PUZZLE.md §5.21 M20 stage③: 囲いゲート1(社長設計「ゲート>退屈補正」=優先発火)。
            // 未確認境界を未クリアで踏破した時点で gate1PendingRef が立つ(M14区域判定ブロック側)。
            // ここで activeEvent が空いた瞬間に発火する(他イベント進行中なら空くまで待つ)。
            gate1PendingRef.current = false;
            // PACING_PUZZLE.md §5.21: 「デンジャーの凶悪ハンターは、この囲いゲート1が発生した時点で
            // 逃げて消える」(イベント排他=ゲート主役)。通常ハンター(非凶悪)は元々排他対象外なので触らない。
            // (hunterRefの状態機械はこのブロックの外=別セクションで宣言されるため、ここでは直接操作する。)
            if (hunterRef.current.vicious) {
              useGameStore.setState(s => ({ enemies: s.enemies.filter(e => e.type !== 'hunter') }));
              hunterRef.current.phase = 'idle';
              hunterRef.current.vicious = false;
              hunterRef.current.detectStartAt = 0; hunterRef.current.chaseStartAt = 0;
              hunterRef.current.reinforced = 0; hunterRef.current.primaryId = '';
            }
            const rankNow = puzzleClockRef.current.rank;
            const gateRank = clampRank(rankNow + 1);
            const pattern = selectPattern(gateRank, new Set(), null, Math.random());
            const counts = nuisanceTarget(pattern);
            const gpcx = player.x + player.width / 2, gpcy = player.y + player.height / 2;
            const placeGateRing = (): { x: number; y: number } => {
              const ang = Math.random() * Math.PI * 2;
              const dist = GATE_ARENA_RADIUS * (0.4 + Math.random() * 0.52);
              return { x: gpcx + Math.cos(ang) * dist, y: gpcy + Math.sin(ang) * dist };
            };
            // 社長指示(v0.25.1523「やはり出れない囲いに」)でゲート1もハード(出られない)へ変更。
            // confinesPlayerを省略=既定true(既存の囲い共通の円内拘束をそのまま適用)。
            // §5.21-追補3(社長決定v0.25.1546): permeable=true でサークルを敵に"入り自由"にする
            // (囲い中「円外の敵は逃走モード」になる既存仕様v0.25.1261をゲート1だけ無効化=通常沸きの
            // chaffが境界を越えて円内へ流れ込めるようにする。gameStore.ts の arenaConfiningFlee 参照)。
            // 重要: beginArenaEvent は呼び出し時点で周辺の非固定敵を一掃するため、必ず「敵を配置する前」に
            // 呼ぶこと(逆順にすると配置直後の台本の敵まで一掃されてしまうバグを実機v0.25.1522で確認)。
            const gateEvent = { kind: 'horde' as const, x: gpcx, y: gpcy, radius: GATE_ARENA_RADIUS, startedAt: newGameTime, endsAt: newGameTime + ARENA_HORDE_DURATION_MS, permeable: true };
            useGameStore.getState().beginArenaEvent(gateEvent);
            let gateSpawnedCount = 0;
            (Object.keys(counts) as NuisanceType[]).forEach(type => {
              const n = counts[type];
              for (let i = 0; i < n; i++) {
                const pos = placeGateRing();
                // §5.21-追補7(社長決定v0.25.1574): 全個体を赤レア相当(強制tier='red')で配置。
                // レア色倍率(攻×3/HP×5)がそのまま強さになる=専用の×5倍加算(GATE1_FORMATION_STRENGTH_MULT)は廃止。
                const e = spawnEnemyAtWithTier(type, pos.x - 20, pos.y - 20, newGameTime, 'red');
                e.fromEvent = true;
                e.dormant = true; e.aggroRange = EVENT_SPAWN_AGGRO_RANGE; e.vx = 0; e.vy = 0;
                addEnemy(e);
                gateSpawnedCount++;
              }
            });
            // §5.21-追補3(社長決定v0.25.1546): 追補2の「円内10体burst配置(fromEvent)」は撤去。
            // 基本沸き(chaff)は通常沸き(koma maintenance)の無限流入に置き換える(permeable=trueで
            // 境界を越えて流入。§5.21-追補4でchaff目標のピーク・CD0強制は撤回=通常のディレクター
            // 駆動)。ここでは台本(formation)の配置のみ行う。クリア=台本(fromEvent)殲滅のみ
            // (chaffはfromEventでないためクリアに数えない)。
            hordeSpawnRef.current = { spawned: gateSpawnedCount, nextAt: newGameTime, total: gateSpawnedCount }; // 全数即配置済み=段階スポーンは追加しない
            activeGateRef.current = 1;
            useGameStore.setState({ eventBannerText: '境界ゲート出現', eventBannerUntil: newGameTime + EVENT_BANNER_MS });
            playSfx('event-start');
            const gateRingColor = 'rgba(168,85,247,0.9)'; // 紫=レア波を示唆
            spawnRing(gpcx, gpcy, GATE_ARENA_RADIUS * 0.2, GATE_ARENA_RADIUS, gateRingColor, 6, 700);
            spawnRing(gpcx, gpcy, GATE_ARENA_RADIUS, GATE_ARENA_RADIUS + 30, gateRingColor, 3, 760);
            spawnFlash('rgba(88,28,135,0.24)', 360);
            useGameStore.getState().triggerShake(REAPER_SUMMON_SHAKE_MS, REAPER_SUMMON_SHAKE_MAG);
            useGameStore.getState().triggerTimeSlow(0.4, 520);
           } else if (puzzleActiveNow && shouldTriggerGate2({
             enabled: GATE_ENABLED,
             wallIdx: gate2PendingRef.current ? 4 : null,
             gate2Cleared: gateMetaRef.current.gate2Cleared,
             activeEventActive: false,
           })) {
            // PACING_PUZZLE.md §5.21-追補8: 囲いゲート2(ハード=出られない)。ゲート2ボス=天使名の
            // 裏ボス勢1体目「ミゲル」(内部型'miguel')を配置する(旧: 城ボスgiantbatの仮流用。giantbatは
            // 城フィナーレボスとして別枠で存続=useGameLoop.ts:1638 の別スポーンは無変更)。confinesPlayer省略=既定true。
            // 社長指示v0.25.1595「基本値の方にして」: ゲート2の×5(GATE2_BOSS_STRENGTH_MULT)は適用しない=
            // ミゲルはENEMY_STATSの基本値(HP2000/与ダメ38)そのままで戦う(ミゲルは専用調整のボスなので旧giantbat枠の×5は不要)。
            gate2PendingRef.current = false;
            const g2pcx = player.x + player.width / 2, g2pcy = player.y + player.height / 2;
            // 重要: beginArenaEvent は周辺の非固定敵を一掃するため、必ずボスを配置する前に呼ぶ
            // (gate1と同じ実機バグの教訓・裏ボス(isHiddenBoss)は除外リストに入っているため実害は無いが
            // 順序を揃えて統一する)。
            const gate2Event = { kind: 'boss' as const, x: g2pcx, y: g2pcy, radius: GATE_ARENA_RADIUS, startedAt: newGameTime, endsAt: newGameTime + GATE2_BOSS_DURATION_MS };
            useGameStore.getState().beginArenaEvent(gate2Event);
            const bx = g2pcx + Math.cos(-Math.PI / 2) * GATE_ARENA_RADIUS * 0.5;
            const by = g2pcy + Math.sin(-Math.PI / 2) * GATE_ARENA_RADIUS * 0.5;
            const boss = spawnEnemyAt('miguel', bx - 24, by - 24, newGameTime);
            boss.fromEvent = true;
            // ミゲルは周回移動(bossState制御)なので dormant/aggroRange は使わない(giantbat流用時の名残)。
            boss.bossState = 'chase';
            boss.bossNextActionAt = newGameTime + 2000;
            boss.homeX = g2pcx; boss.homeY = g2pcy; // 周回の中心=ゲート中心
            addEnemy(boss);
            activeGateRef.current = 2;
            useGameStore.setState({ eventBannerText: '深層への扉が閉ざされた', eventBannerUntil: newGameTime + EVENT_BANNER_MS });
            playSfx('event-start');
            const gate2RingColor = 'rgba(239,68,68,0.9)'; // 赤=ハードゲートを示唆
            spawnRing(g2pcx, g2pcy, GATE_ARENA_RADIUS * 0.2, GATE_ARENA_RADIUS, gate2RingColor, 6, 700);
            spawnRing(g2pcx, g2pcy, GATE_ARENA_RADIUS, GATE_ARENA_RADIUS + 30, gate2RingColor, 3, 760);
            spawnFlash('rgba(127,29,29,0.26)', 360);
            useGameStore.getState().triggerShake(REAPER_SUMMON_SHAKE_MS, REAPER_SUMMON_SHAKE_MAG);
            useGameStore.getState().triggerTimeSlow(0.4, 520);
           } else if (puzzleActiveNow) {
            // M20 軸1: 退屈補正の囲い(社長設計)。boredomDirector/upswingの退屈シグナルが完全に
            // 立ち上がった時に囲いhordeを1回差し込む(通常プレイ専用の新経路)。
            const hiddenBossAliveBA = useGameStore.getState().enemies.some(e => isHiddenBoss(e.type));
            const redNightActiveNowBA = useGameStore.getState().redNight?.phase === 'active';
            const boredomReady = hunterBoredomReady(boredomBonus(upswingRef.current.boredMs, boredStartMsForAggro(currentStageAggro())));
            const fireBoredomArena = shouldFireBoredomArena({
              enabled: BOREDOM_ARENA_ENABLED,
              gameTime: newGameTime,
              nextEligibleAt: boredomArenaNextEligibleAtRef.current,
              bossChasing: useGameStore.getState().bossChasing,
              hiddenBossAlive: hiddenBossAliveBA,
              hunterIdle: hunterRef.current.phase === 'idle',
              redNightActive: redNightActiveNowBA,
              boredomReady,
            });
            if (fireBoredomArena) {
              boredomArenaNextEligibleAtRef.current = newGameTime + BOREDOM_ARENA_CD_MS;
              const bpcx = player.x + player.width / 2, bpcy = player.y + player.height / 2;
              const baEvent = { kind: 'horde' as const, x: bpcx, y: bpcy, radius: ARENA_EVENT_RADIUS, startedAt: newGameTime, endsAt: newGameTime + ARENA_HORDE_DURATION_MS };
              useGameStore.getState().beginArenaEvent(baEvent);
              hordeSpawnRef.current = { spawned: 0, nextAt: newGameTime, total: ARENA_HORDE_COUNT };
              useGameStore.setState({ eventBannerText: '変異者大量発生', eventBannerUntil: newGameTime + EVENT_BANNER_MS });
              playSfx('event-start');
              const baRingColor = 'rgba(56,189,248,0.9)';
              spawnRing(bpcx, bpcy, ARENA_EVENT_RADIUS * 0.2, ARENA_EVENT_RADIUS, baRingColor, 6, 700);
              spawnRing(bpcx, bpcy, ARENA_EVENT_RADIUS, ARENA_EVENT_RADIUS + 30, baRingColor, 3, 760);
              spawnFlash('rgba(8,47,73,0.24)', 360);
              useGameStore.getState().triggerShake(REAPER_SUMMON_SHAKE_MS, REAPER_SUMMON_SHAKE_MAG);
              useGameStore.getState().triggerTimeSlow(0.4, 520);
            }
           } else {
            // 発火: activeEvent中でない・次回発火時刻に到達(=約2分ごと)。排他制御は activeEvent と nextArenaAtRef で担保。
            // ?arenanow 指定時は初回を即時(nextArenaAtRef=0 初期化)→以降も2分間隔。
            // 裏ボスが存命の間はイベントを発生させない(社長指示)。bossChasing(追跡中)だけだと出現直後/帰巣/
            // 画面外など非追跡の隙間で発火してしまう(社長報告バグ)ので「裏ボスが1体でも居る」で判定する。
            // ハンター追跡中(phase≠idle)は他イベントを発生させない(社長指示:同時1イベントまで)。
            const hiddenBossAlive = useGameStore.getState().enemies.some(e => isHiddenBoss(e.type));
            // バッチ7(憲法第5条): 紅き月と重ねない+ピンチ救済発動中/解除後10秒は発火しない。
            // ?events=0で本ゲートを無効化(囲いは従来どおり2分ごとのランダム発火に戻る)。
            const redNightActiveNow = useGameStore.getState().redNight?.phase === 'active';
            // バッチ5追補: EVENTS_ENABLED時は囲いのランダムタイマーはrescue/egg限定(緩フェーズのみ=
            // redNightPhaseGateOkを紅き月と同じ基準で流用)。horde/bossは以後、関所頭のイベント関所側から発火する。
            const arenaProducerOk = !EVENTS_ENABLED || (eventGateOk({
              bigEventActive: redNightActiveNow, gameTime: newGameTime, pityBlockUntilMs: pityEventBlockUntilRef.current,
              boardDebt: DEBT_ENABLED ? boardDebtRef.current : 0,
            }) && redNightPhaseGateOk(phaseAt(newGameTime).kind));
            // バッチ5追補: 関所頭に選ばれたイベント関所(gate-assault/gate-boss-spike)の発火予約を消化する。
            // 予約はgateProgramRef選定側(下方)で立てる。関所を抜けても未消化なら黙って破棄(発火しない)。
            if (GATE_PROGRAM_ENABLED && gateEventPendingRef.current) {
              const curPNow = phaseAt(newGameTime);
              if (gateEventPendingRef.current.phaseKey !== `${curPNow.kind}${curPNow.index}`) {
                gateEventPendingRef.current = null;
              }
            }
            const pendingGE = GATE_PROGRAM_ENABLED ? gateEventPendingRef.current : null;
            const gateEventReady = pendingGE != null && !useGameStore.getState().bossChasing && !hiddenBossAlive && hunterRef.current.phase === 'idle' && !redNightActiveNow;
            const arenaReady = gateEventReady || ((FORCE_ARENA != null || newGameTime >= nextArenaAtRef.current) && !useGameStore.getState().bossChasing && !hiddenBossAlive && hunterRef.current.phase === 'idle' && arenaProducerOk);
            if (arenaReady) {
              const pcx = player.x + player.width / 2;
              const pcy = player.y + player.height / 2;
              let hordeSizeMult = 1;
              let kind: 'horde' | 'boss' | 'rescue' | 'egg';
              if (gateEventReady && pendingGE) {
                // イベント関所発火: 従来の2分タイマーは温存する(タイマー側の抽選には影響させない)。
                kind = pendingGE.eventKind;
                hordeSizeMult = pendingGE.sizeMult;
                gateEventPendingRef.current = null;
              } else {
                nextArenaAtRef.current = newGameTime + ARENA_FIRE_INTERVAL_MS; // 次回は2分後
                kind =
                  FORCE_ARENA === 'horde' ? 'horde'
                  : FORCE_ARENA === 'boss' ? 'boss'
                  : FORCE_ARENA === 'rescue' ? 'rescue'
                  : FORCE_ARENA === 'egg' ? 'egg'
                  // バッチ5追補: EVENTS_ENABLED時、ランダムタイマーはrescue/eggのみ(horde/bossは関所頭側)。
                  : EVENTS_ENABLED
                    ? (rescueFiredRef.current ? 'egg' : (['rescue', 'egg'] as const)[Math.floor(Math.random() * 2)])
                    // レスキューは1出撃で最大1回(社長指示)=発生済みなら抽選候補から除外。
                    : rescueFiredRef.current
                      ? (['horde', 'boss', 'egg'] as const)[Math.floor(Math.random() * 3)]
                      : (['horde', 'boss', 'rescue', 'egg'] as const)[Math.floor(Math.random() * 4)];
              }
              // イベント発生告知バナー(コンボ表示付近)。kind 別の文言。
              // 緑卵(egg)の包囲は告知しない=「いつのまにか発生」(社長指示)。バナー/発生音もなし。
              if (kind !== 'egg') {
                useGameStore.setState({
                  eventBannerText: kind === 'rescue' ? '救難信号受信' : kind === 'boss' ? '危険変異者出現' : '変異者大量発生',
                  eventBannerUntil: newGameTime + EVENT_BANNER_MS,
                });
                playSfx('event-start'); // 小イベント発生音(rescue/boss/horde 共通)
              }
              if (kind === 'egg') {
                // 緑卵で画面外を取り囲む。閉じ込め/解除なし=離れると自然消滅(store のカリング任せ)。
                // 告知なし(バナー/音なし)。フラッシュ/シェイクも出さず静かに発生させる。
                useGameStore.getState().spawnEggRing(pcx, pcy);
                return; // activeEvent は張らない(囲い/勝敗なし)
              }
              if (kind === 'rescue') {
                // 救助ホールド: プレイヤー位置(=スタート地点)ではなく、少し離れたランダム位置に出す。
                // 画面端マーカーで誘導 → 現地へ向かう設計。距離は実機調整しやすいよう定数化。
                const rang = Math.random() * Math.PI * 2;
                const rdist = RESCUE_SPAWN_DIST_MIN + Math.random() * (RESCUE_SPAWN_DIST_MAX - RESCUE_SPAWN_DIST_MIN);
                const rx = pcx + Math.cos(rang) * rdist;
                const ry = pcy + Math.sin(rang) * rdist;
                const event = { kind, x: rx, y: ry, radius: RESCUE_RADIUS, startedAt: newGameTime, endsAt: newGameTime + 120000 };
                useGameStore.getState().beginRescueEvent(event);
                rescueFiredRef.current = true; // 1出撃で最大1回=以降の抽選から除外
                rescueRespawnRef.current = 0; // 初期3体は beginRescueEvent が配置。復活予約はリセット
                spawnRing(rx, ry, RESCUE_RADIUS * 0.2, RESCUE_RADIUS, 'rgba(74,222,128,0.9)', 6, 700);
                spawnRing(rx, ry, RESCUE_RADIUS, RESCUE_RADIUS + 30, 'rgba(74,222,128,0.9)', 3, 760);
                spawnFlash('rgba(8,47,73,0.20)', 320);
                useGameStore.getState().triggerShake(REAPER_SUMMON_SHAKE_MS, REAPER_SUMMON_SHAKE_MAG);
                useGameStore.getState().triggerAttention(rx, ry); // 現地へカメラアテンション(時間停止)
                return; // この set コールバックでの以降のアリーナ配置はスキップ(rescue は store が配置済み)
              }
              const duration = kind === 'boss' ? ARENA_BOSS_DURATION_MS : ARENA_HORDE_DURATION_MS;
              const event = { kind, x: pcx, y: pcy, radius: ARENA_EVENT_RADIUS, startedAt: newGameTime, endsAt: newGameTime + duration };
              useGameStore.getState().beginArenaEvent(event); // 状態セット＋周辺の通常敵一掃
              // 円内に敵を配置(中心=プレイヤーは避ける)。fromEvent で終了判定/カリング保護。
              const placeInRing = (minFrac: number) => {
                const ang = Math.random() * Math.PI * 2;
                const dist = ARENA_EVENT_RADIUS * (minFrac + Math.random() * (0.92 - minFrac));
                return { x: pcx + Math.cos(ang) * dist, y: pcy + Math.sin(ang) * dist };
              };
              if (kind === 'horde') {
                // 段階スポーン(社長指示): 一斉ではなく「1体ずつ」計N体を per-frame で配置。
                // 配置/種類(1/3体目=パンプキン/2/3・最終体目=ウルフ)は下の horde 更新ブロックが処理する。
                // バッチ5追補: イベント関所発火時はeventSizeMultで基本18体を±(cap20厳守/床14)。
                const hordeTotal = Math.max(14, Math.min(20, Math.round(ARENA_HORDE_COUNT * hordeSizeMult)));
                hordeSpawnRef.current = { spawned: 0, nextAt: newGameTime, total: hordeTotal };
              } else {
                // ミニボス: パンプキン+雑魚(社長指示。giantbat は使わない)。プレイヤーから少し離した円内へ。
                const bx = pcx + Math.cos(-Math.PI / 2) * ARENA_EVENT_RADIUS * 0.5;
                const by = pcy + Math.sin(-Math.PI / 2) * ARENA_EVENT_RADIUS * 0.5;
                const boss = spawnEnemyAt('pumpkin', bx - 24, by - 24, newGameTime);
                boss.fromEvent = true;
                boss.dormant = true; boss.aggroRange = EVENT_SPAWN_AGGRO_RANGE; boss.vx = 0; boss.vy = 0;
                addEnemy(boss);
                for (let i = 0; i < ARENA_BOSS_ADDS; i++) {
                  const pos = placeInRing(0.5);
                  const e = spawnEnemyAt('zombie', pos.x - 16, pos.y - 16, newGameTime);
                  e.fromEvent = true;
                  e.dormant = true; e.aggroRange = EVENT_SPAWN_AGGRO_RANGE; e.vx = 0; e.vy = 0;
                  addEnemy(e);
                }
              }
              // 発火演出: 囲いリング + 暗転フラッシュ + シェイク + 軽いスロー。
              const ringColor = kind === 'boss' ? 'rgba(239,68,68,0.9)' : 'rgba(56,189,248,0.9)';
              spawnRing(pcx, pcy, ARENA_EVENT_RADIUS * 0.2, ARENA_EVENT_RADIUS, ringColor, 6, 700);
              spawnRing(pcx, pcy, ARENA_EVENT_RADIUS, ARENA_EVENT_RADIUS + 30, ringColor, 3, 760);
              spawnFlash(kind === 'boss' ? 'rgba(127,29,29,0.26)' : 'rgba(8,47,73,0.24)', 360);
              useGameStore.getState().triggerShake(REAPER_SUMMON_SHAKE_MS, REAPER_SUMMON_SHAKE_MAG);
              useGameStore.getState().triggerTimeSlow(0.4, 520);
            }
           }
          } else if (ae.kind === 'rescue') {
            // 救助: 攻撃者を RESCUE_ATTACKERS 体維持(死んだら補充=生存NPCへ割り当て)。
            // 勝敗/ホールドゲージ/NPCカイトは updateRescue が処理。時間切れ保険のみここで見る。
            const gs = useGameStore.getState();
            const survivors = gs.rescueSurvivors;
            const attackers = gs.enemies.filter(e => e.fromEvent);
            // 成功アウトロ中(savedAt)は補充しない。攻撃者は「倒してから3秒後に復活」(社長指示)。
            // 空き(< cap)ができたら復活時刻を予約し、その時刻に1体だけ復活させて再予約。満杯なら予約クリア。
            if (survivors.length > 0 && !survivors[0].savedAt && attackers.length < RESCUE_ATTACKERS) {
              if (rescueRespawnRef.current === 0) rescueRespawnRef.current = newGameTime + RESCUE_RESPAWN_MS;
              if (newGameTime >= rescueRespawnRef.current) {
                const tgt = survivors[Math.floor(Math.random() * survivors.length)];
                const ang = Math.random() * Math.PI * 2;
                const bx = ae.x + Math.cos(ang) * ae.radius * 1.05;
                const by = ae.y + Math.sin(ang) * ae.radius * 1.05;
                const e = spawnEnemyAt('zombie', bx - 16, by - 16, newGameTime);
                e.fromEvent = true;
                e.escortTarget = tgt.id;
                addEnemy(e);
                rescueRespawnRef.current = 0; // 消化(まだ空きがあれば次フレームで再予約=3秒間隔)
              }
            } else {
              rescueRespawnRef.current = 0; // 満杯/アウトロ中は予約クリア
            }
            gs.updateRescue(deltaTime);
            if (newGameTime >= ae.endsAt) { // 救助は制限時間を守り切れば完了(=成功)
              useGameStore.getState().endArenaEvent();
              spawnRing(ae.x, ae.y, ae.radius, ae.radius * 0.15, 'rgba(148,163,184,0.7)', 4, 520);
              playSfx('event-clear'); // 小イベント完了音
            }
          } else {
            // 変異者大量発生(horde)の段階スポーン: 1秒に1体ずつ計N体(社長指示で3→1)。N体目中の通し番号で
            // 種類を出し分け(総数の1/3=パンプキン / 2/3・最終=ウルフ / それ以外=zombie/skeleton/bat ランダム)。
            // バッチ5追補: totalはeventSizeMultで可変(既定18=従来と同じ6/12/18の比率のまま)。
            const hordeTotalNow = hordeSpawnRef.current.total;
            if (ae.kind === 'horde' && hordeSpawnRef.current.spawned < hordeTotalNow && newGameTime >= hordeSpawnRef.current.nextAt) {
              const basics: EnemyType[] = ['zombie', 'skeleton', 'bat'];
              const pumpkinAtN = Math.round(hordeTotalNow / 3);
              const wolfAtN = Math.round(hordeTotalNow * 2 / 3);
              // プレイヤーの現在地(イベント開始時の固定中心=ae.x/yではなく「いま」の位置)からの最低距離を確保する。
              const lpx = player.x + player.width / 2, lpy = player.y + player.height / 2;
              for (let k = 0; k < 1 && hordeSpawnRef.current.spawned < hordeTotalNow; k++) {
                const n = hordeSpawnRef.current.spawned + 1; // この個体の通し番号(1..total)
                const type: EnemyType = n === pumpkinAtN ? 'pumpkin' : (n === wolfAtN || n === hordeTotalNow) ? 'werewolf' : basics[Math.floor(Math.random() * basics.length)];
                const clear2 = HORDE_SPAWN_PLAYER_CLEARANCE * HORDE_SPAWN_PLAYER_CLEARANCE;
                let sx = 0, sy = 0;
                for (let attempt = 0; attempt < HORDE_SPAWN_CLEAR_ATTEMPTS; attempt++) {
                  const ang = Math.random() * Math.PI * 2;
                  const dist = ARENA_EVENT_RADIUS * (0.4 + Math.random() * (0.92 - 0.4));
                  sx = ae.x + Math.cos(ang) * dist; sy = ae.y + Math.sin(ang) * dist;
                  if ((sx - lpx) ** 2 + (sy - lpy) ** 2 >= clear2) break;
                }
                // 振り直しでも近すぎたら、プレイヤーから離す方向へ最低距離ぶん押し出す(円の外へは出さない)。
                if ((sx - lpx) ** 2 + (sy - lpy) ** 2 < clear2) {
                  const dx = sx - lpx, dy = sy - lpy;
                  const dl = Math.hypot(dx, dy) || 1;
                  sx = lpx + (dx / dl) * HORDE_SPAWN_PLAYER_CLEARANCE;
                  sy = lpy + (dy / dl) * HORDE_SPAWN_PLAYER_CLEARANCE;
                  const cdx = sx - ae.x, cdy = sy - ae.y, cd = Math.hypot(cdx, cdy) || 1;
                  const maxR = ARENA_EVENT_RADIUS * 0.92;
                  if (cd > maxR) { sx = ae.x + (cdx / cd) * maxR; sy = ae.y + (cdy / cd) * maxR; }
                }
                const e = spawnEnemyAt(type, sx, sy, newGameTime);
                e.x -= e.width / 2; e.y -= e.height / 2; // 配置点を中心に
                e.fromEvent = true;
                e.dormant = true; e.aggroRange = EVENT_SPAWN_AGGRO_RANGE; e.vx = 0; e.vy = 0; // 近づくまで向かってこない
                addEnemy(e);
                hordeSpawnRef.current.spawned = n;
              }
              hordeSpawnRef.current.nextAt = newGameTime + 1000; // 次の3体は1秒後
            }
            // 安全策: イベント敵(fromEvent)が何らかの理由(ノックバック/ジャンプ/逃走等で resolveMove のクランプを
            // 素通り)で囲い円の外=地平線の上(透明化ゾーン)へ出ると、見えない&到達不能になり fromEvent が0にならず
            // 「誰もいないのに終わらない」状態になる。毎フレーム、円外に出たイベント敵を円内へ引き戻す(出たときだけ set)。
            {
              const evNow = useGameStore.getState().enemies;
              const outside = evNow.some(e => {
                if (!e.fromEvent) return false;
                const md = ae.radius - Math.max(e.width, e.height) * 0.4;
                const dx = (e.x + e.width / 2) - ae.x, dy = (e.y + e.height / 2) - ae.y;
                return dx * dx + dy * dy > md * md;
              });
              if (outside) {
                useGameStore.setState(st => ({
                  enemies: st.enemies.map(e => {
                    if (!e.fromEvent) return e;
                    const dx = (e.x + e.width / 2) - ae.x, dy = (e.y + e.height / 2) - ae.y;
                    const d = Math.hypot(dx, dy);
                    const md = ae.radius - Math.max(e.width, e.height) * 0.4;
                    if (d > md && d > 0.001) return { ...e, x: ae.x + (dx / d) * md - e.width / 2, y: ae.y + (dy / d) * md - e.height / 2 };
                    return e;
                  }),
                }));
              }
            }
            // 終了判定: 全滅(イベント敵0・開始直後グレース後) or 制限時間切れ。
            const eventEnemies = useGameStore.getState().enemies.filter(e => e.fromEvent).length;
            // horde は全N体を出し切る前に「全滅」で誤終了しないようガード(段階スポーン中は終わらせない)。
            const hordeSpawnDone = ae.kind !== 'horde' || hordeSpawnRef.current.spawned >= hordeSpawnRef.current.total;
            const cleared = newGameTime - ae.startedAt > ARENA_END_GRACE_MS && eventEnemies === 0 && hordeSpawnDone;
            const timedOut = newGameTime >= ae.endsAt;
            if (cleared || timedOut) {
              if (cleared) {
                // クリア告知(発生バナーと同じ機構)。horde=駆除成功 / boss=討伐成功。
                useGameStore.setState({
                  eventBannerText: ae.kind === 'boss' ? '討伐成功！' : '駆除成功！',
                  eventBannerUntil: newGameTime + EVENT_BANNER_MS,
                });
                playSfx('event-clear'); // 小イベント完了音(成功時のみ)
                // PACING_PUZZLE.md §5.21 M20 stage③: 囲いゲート1クリア時の後処理。恒久解除+未達
                // ペナルティ解除+ハンター消滅+M14到達判定を遅延実行(未達で止めていた分をここで出す)。
                // §5.21 M20追補(社長報告v0.25.1534): 恒久解除/踏破フラグのlocalStorageコミットは
                // ここでは行わない(メモリ上のref/storeだけ更新)。確定コミットはラン終了時に
                // commitRunEndProgress('clear')が一括で行う(死亡で終えた場合はコミットされない=
                // v0.25.1517則「死亡は解除しない」を厳密に満たす)。
                if (activeGateRef.current === 1) {
                  gateMetaRef.current = { ...gateMetaRef.current, gate1Cleared: true };
                  gate1DoneThisRunRef.current = true; // §5.21-追補3: ラン内ガードも即立てる(全滅後の再湧き対策)
                  gate1PenaltyActiveRef.current = false;
                  useGameStore.setState(s => ({ enemies: s.enemies.filter(e => e.type !== 'hunter') })); // ハンター消滅
                  hunterRef.current.phase = 'idle';
                  hunterRef.current.detectStartAt = 0; hunterRef.current.chaseStartAt = 0; hunterRef.current.reinforced = 0; hunterRef.current.primaryId = '';
                  const wm2 = useGameStore.getState().wallMeta;
                  if (WALL_ENABLED && isFirstWallBreach(wm2, 3)) {
                    useGameStore.setState({ wallMeta: markWallBreached(wm2, 3) });
                    // §5.17-追補2(社長決定v0.25.1536): 到達の+50Gを撤去(演出/記録は残す)。
                    useGameStore.getState().enqueueWallEvent('depth', `${AREA_ZONE_NAMES[3]} —— 踏破`, 'TRESPASS', '#bfe3ff');
                  }
                }
                // PACING_PUZZLE.md §5.21 M20 stage④: 囲いゲート2クリア時の後処理。恒久解除+M14
                // 到達判定を遅延実行(ハンター復活は伴わない=ゲート2にはその仕様が無い)。
                // §5.21 M20追補(v0.25.1534): 同上、コミットはラン終了時のみ。
                if (activeGateRef.current === 2) {
                  gateMetaRef.current = { ...gateMetaRef.current, gate2Cleared: true };
                  const wm3 = useGameStore.getState().wallMeta;
                  if (WALL_ENABLED && isFirstWallBreach(wm3, 4)) {
                    useGameStore.setState({ wallMeta: markWallBreached(wm3, 4) });
                    // §5.17-追補2(社長決定v0.25.1536): 到達の+50Gを撤去(演出/記録は残す)。
                    useGameStore.getState().enqueueWallEvent('depth', `${AREA_ZONE_NAMES[4]} —— 踏破`, 'TRESPASS', '#bfe3ff');
                  }
                }
              } else {
                // PACING_PUZZLE.md §5.21-追補6(社長決定v0.25.1556): ゲート失敗(制限時間切れ・未クリア)=
                // プレイヤーをそのゲートの境界より内側(手前エリア)へ強制ノックバック。doneThisRunは立てない
                // ので、内側から再び境界を越えれば detectWallBreach が踏破を再検知しゲートが再発火する
                // (=リトライループ。死神ペナルティは使わない=追補5抑止+ゲート地形で事実上眠る)。
                const failedGate = activeGateRef.current;
                const boundary = failedGate === 2 ? AREA_THRESHOLDS[3] : AREA_THRESHOLDS[2];
                const targetD = Math.max(0, boundary - GATE_FAIL_KNOCKBACK_MARGIN);
                const pl = useGameStore.getState().player;
                const kpcx = pl.x + pl.width / 2, kpcy = pl.y + pl.height / 2;
                const kd = Math.hypot(kpcx, kpcy) || 1;
                const nx = (kpcx / kd) * targetD, ny = (kpcy / kd) * targetD;
                useGameStore.setState(s => ({ player: { ...s.player, x: nx - s.player.width / 2, y: ny - s.player.height / 2 } }));
                areaZoneRef.current = areaZoneIndexFor(targetD); // prevZoneを内側へ=再クロスで踏破を再検知
                useGameStore.setState({ eventBannerText: 'ゲート突破失敗 —— 押し戻された', eventBannerUntil: newGameTime + EVENT_BANNER_MS });
                useGameStore.getState().triggerShake(REAPER_SUMMON_SHAKE_MS, REAPER_SUMMON_SHAKE_MAG);
              }
              activeGateRef.current = null;
              useGameStore.getState().endArenaEvent(); // 拘束解除＋取りこぼし撤去
              spawnRing(ae.x, ae.y, ae.radius, ae.radius * 0.15, 'rgba(148,163,184,0.7)', 4, 520);
              spawnFlash('rgba(255,255,255,0.10)', 200);
            }
          }
        }

        // --- 紅き夜 ---
        // ゲーム開始3分後に1回だけ発動。警告10秒→本番20秒→暗転終了。
        // 本番中: 全敵ステータス×2・経験値×2・画面赤染め。
        // 拠点近接 or 商人に話しかけると「やり過ごした」で即脱出(商人側は performAttack 内で処理)。
        if (!danceTest && !indoor && !labTheme) {
          const rnGs = useGameStore.getState();
          const rn = rnGs.redNight;

          // 紅き夜は「デンジャーゾーン(区域index2=原点から3000px)以降」に居る時だけ発現(社長指示)。
          // 3分経過していても、それより内側の安全エリアでは発火しない=深入りした時に初めて発火。
          const rnDepth = Math.hypot(player.x + player.width / 2, player.y + player.height / 2);
          // バッチ7(憲法第5条): 囲い/ハンターと重ねない+ピンチ猶予、かつ緩フェーズ中にしか開始しない
          // (山=関所中に窓が開いても抽選を消費せず次の緩まで毎フレーム再判定=自然に遅延)。
          // ?events=0で本ゲートを無効化(従来どおり時間+デンジャーゾーンだけで判定)。
          const rnBigEventActive = !!(rnGs.activeEvent && rnGs.activeEvent.kind !== 'rescue') || hunterRef.current.phase !== 'idle';
          // 社長裁定(v0.25.1380「2:コマ基準で」): パズル方式ON時の「緩フェーズ中にしか開始しない」は
          // 旧PHASES時刻表ではなくコマで判定する(緩コマ=relax/harvest中のみ開始可。通常/ピーク中に
          // 窓が開いても抽選を消費せず次の緩コマまで毎フレーム再判定=従来と同じ自然遅延)。
          // ボス中(puzzleActiveNow=false)と?puzzle=0は従来どおり旧phaseAt基準。
          const rnCalmOk = puzzleActiveNow
            ? (puzzleKomaRef.current.kind === 'relax' || puzzleKomaRef.current.kind === 'harvest')
            : redNightPhaseGateOk(phaseAt(newGameTime).kind);
          const rnProducerOk = !EVENTS_ENABLED || (
            rnCalmOk &&
            eventGateOk({ bigEventActive: rnBigEventActive, gameTime: newGameTime, pityBlockUntilMs: pityEventBlockUntilRef.current, boardDebt: DEBT_ENABLED ? boardDebtRef.current : 0 })
          );
          if (RED_NIGHT_FORCE) {
            // ?rednight=1 診断: 条件(時刻/確率/エリア/緩コマ)を全て無視して紅き夜を即・強制でactive固定。
            // 終了/やり過ごしも起きない(このブランチが毎フレ先取りするため下の状態機械は走らない)。
            // activateRedNight は phase を立てるだけ=×2等はphase参照で動的に効くので直setで等価。
            if (!rn || rn.phase !== 'active') {
              useGameStore.setState({ redNight: { phase: 'active', activeAt: newGameTime, endAt: newGameTime + 3600000 } });
            }
          } else if (!rn && !redNightFiredRef.current && newGameTime >= redNightFireAtRef.current && !rnGs.bossChasing
              && !rnGs.enemies.some(e => isHiddenBoss(e.type)) // 裏ボス存命中は紅き夜を発火させない(イベント抑止と同基準)
              && areaZoneIndexFor(rnDepth) >= 2 && rnProducerOk) {
            // 3分後 かつ デンジャーゾーン以降で、出撃に一度だけ抽選。当たれば発火、外れたらこの出撃は紅き夜なし
            // (社長指示で頻度を下げる=必ず→確率)。redNightFiredRef は当落どちらでも立てて以降は判定しない。
            redNightFiredRef.current = true;
            if (Math.random() < RED_NIGHT_RUN_CHANCE) {
              rnGs.beginRedNightWarning(newGameTime);
              spawnFlash('rgba(120,0,0,0.18)', 380);
              playSfx('event-start');
            }
          } else if (rn) {
            if (rn.phase === 'warning' && newGameTime >= rn.activeAt) {
              // 警告 → 本番移行
              rnGs.activateRedNight();
              spawnFlash('rgba(180,0,0,0.40)', 600);
              useGameStore.setState({
                eventBannerText: '紅き夜！',
                eventBannerUntil: newGameTime + EVENT_BANNER_MS,
              });
            } else if (rn.phase === 'active') {
              // 拠点近接で逃げる
              const pcx = player.x + player.width / 2;
              const pcy = player.y + player.height / 2;
              const nearBase = rnGs.baseSites.some(
                b => Math.hypot(b.x - pcx, b.y - pcy) <= BASE_CAPTURE_RADIUS
              );
              if (nearBase) {
                rnGs.skipRedNight();
                useGameStore.setState({
                  eventBannerText: 'やり過ごした',
                  eventBannerUntil: newGameTime + EVENT_BANNER_MS,
                  hitstopUntil: Date.now() + 450,
                });
                spawnFlash('rgba(0,0,0,0.68)', 500);
              } else if (newGameTime >= rn.endAt) {
                // 20秒経過 → 終了
                rnGs.endRedNight();
                useGameStore.setState({
                  eventBannerText: '紅き夜が明けた',
                  eventBannerUntil: newGameTime + EVENT_BANNER_MS,
                  hitstopUntil: Date.now() + 450,
                });
                spawnFlash('rgba(0,0,0,0.68)', 500);
              }
            }
          }
        }

        // --- 帰還フェーズ ---
        // フィナーレボス(giantbat)撃破=finaleDefeated になったら、城跡付近に帰還サークルを出す(屋内/ラボの
        // 終了アイテムは triggerEventVictory が直接サークルを出す)。サークル内に3秒とどまると帰還完了(gameWon)。
        {
          const grs = useGameStore.getState();
          if (grs.finaleDefeated && !grs.returnCircle && !grs.gameWon) {
            useGameStore.getState().beginReturnPhase(grs.castleEvent.x, grs.castleEvent.y);
            playSfx('event-start');
          }
          if (useGameStore.getState().returnCircle && !useGameStore.getState().gameWon) {
            useGameStore.getState().updateReturnPhase(deltaTime);
          }
        }

        // §5.21 M20追補(v0.25.1534): クリア(gameWon=帰還完了/ゴール)or 撤退(gameReturned=商人「帰還」の
        // 任意撤収)のいずれかが確定したら、進捗(自己最深/ランク到達/踏破フラグ/ゲート恒久解除)を
        // 一括でlocalStorageへコミットする(1回のみ・runEndCommittedRefでガード)。
        if (WALL_ENABLED && !runEndCommittedRef.current) {
          const rs = useGameStore.getState();
          if (rs.gameWon || rs.gameReturned) {
            runEndCommittedRef.current = true;
            commitRunEndProgress('clear', gateMetaRef.current);
          }
        }

        // --- ハンター変異体イベント(専用コントローラ・社長指示) ---------------------
        // 屋内/練習モードでは出さない。出現〜索敵〜発見〜追跡〜撤退〜増援を状態機械で管理。
        if (!danceTest && !indoor) {
          const H = hunterRef.current;
          const hs = useGameStore.getState();
          const hpx = hs.player.x + hs.player.width / 2;
          const hpy = hs.player.y + hs.player.height / 2;

          // 優勢判定の履歴更新: 被弾検出(HP低下)と撃破数の時系列。
          if (hunterPrevHpRef.current < 0) hunterPrevHpRef.current = hs.player.health;
          if (hs.player.health < hunterPrevHpRef.current) hunterLastDmgAtRef.current = newGameTime;
          hunterPrevHpRef.current = hs.player.health;
          const kills = hunterKillsRef.current;
          const totalKills = hs.gameStats.enemiesKilled;
          if (kills.length === 0 || kills[kills.length - 1].total !== totalKills) kills.push({ t: newGameTime, total: totalKills });
          while (kills.length > 1 && kills[0].t < newGameTime - 21000) kills.shift(); // 21秒より古い標本は捨てる
          const killsSince = (ms: number): number => {
            const since = newGameTime - ms;
            let base = totalKills;
            for (const k of kills) { if (k.t <= since) base = k.total; else break; }
            return totalKills - base;
          };

          // 「ボス/リーパー/演出中」= 出現禁止＆追跡中なら撤退。activeEvent は出現禁止のみ(追跡中は元々他イベント出ない)。
          const giantOrReaper = hs.enemies.some(e => e.type === 'giantbat' || e.type === 'reaper');
          const cinematic = hs.bossChasing || !!hs.attention || hs.redNight?.phase === 'active' || giantOrReaper;
          // 撤退トリガ用は attention を除外(ハンター発見時に自分で出すアテンションで即撤退しないように)。
          const retreatCinematic = hs.bossChasing || hs.redNight?.phase === 'active' || giantOrReaper;
          const spawnBlocked = cinematic || !!hs.activeEvent;

          // 画面外スポーン地点(プレイヤー近場の画面端〜外)。
          const offscreenSpawn = (): { x: number; y: number } => {
            const ang = Math.random() * Math.PI * 2;
            const r = Math.hypot(gameBounds.width, gameBounds.height) / 2 + 90;
            return { x: hpx + Math.cos(ang) * r, y: hpy + Math.sin(ang) * r };
          };
          const spawnHunter = (search: boolean, pos?: { x: number; y: number }): string => {
            const p = pos ?? offscreenSpawn();
            const h = spawnEnemyAt('hunter', p.x - 28, p.y - 32, newGameTime);
            h.fixed = true;              // 屋外リサイクル/カリング対象外=コントローラが寿命を完全管理
            h.vx = 0; h.vy = 0;
            if (search) { h.dormant = true; h.aggroRange = 0; } // 索敵=静止・自動起床しない(発見で起こす)
            else h.hunterAlerted = true; // 増援は発見済み=最初から矢印表示
            addEnemy(h);
            return h.id;
          };
          const endHunterEvent = () => {
            H.phase = 'idle';
            // PACING_PUZZLE.md §5.21 M20 軸2: 凶悪モードは優勢ゲート無視で即再発生しうるため、撃破/
            // 立ち去り直後の一瞬だけ猶予を挟む(通常モードは既存の長いCDのまま)。
            H.nextEligibleAt = newGameTime + HUNTER_RESPAWN_CD_MIN_MS + Math.random() * HUNTER_RESPAWN_CD_SPAN_MS;
            H.viciousRearmAt = H.vicious ? newGameTime + VICIOUS_REARM_MS : H.viciousRearmAt;
            H.vicious = false;
            H.detectStartAt = 0; H.chaseStartAt = 0; H.reinforced = 0; H.primaryId = '';
          };
          const clearAllHunters = () => useGameStore.setState(s => ({ enemies: s.enemies.filter(e => e.type !== 'hunter') }));

          if (H.phase === 'idle') {
            // PACING_PUZZLE.md §5.21 M20 軸2: デンジャー入場(r>=3000)時、拠点を1つも制圧していなければ
            // 優勢ゲート無視で凶悪ハンターを即発生させる(既存の優勢判定より優先してチェック)。
            const viciousReady = shouldTriggerViciousHunter({
              gameTime: newGameTime,
              hunterStartMs: HUNTER_START_MS,
              spawnBlocked,
              hunterIdle: true,
              playerAreaIdx: areaZoneIndexFor(Math.hypot(hpx, hpy)),
              capturedBaseCount: hs.baseSites.filter(b => b.status === 'captured').length,
              viciousRearmAt: H.viciousRearmAt,
            });
            if (viciousReady) {
              // M20追補(v0.25.1533/1534): 索敵フェーズは無し。入場検知から約3秒(VICIOUS_DISCOVER_DELAY_MS)
              // 待ってから、索敵をスキップして「見つかった状態」(chase)へ直接発動する。
              if (H.viciousPendingAt === 0) H.viciousPendingAt = newGameTime;
              if (newGameTime - H.viciousPendingAt >= VICIOUS_DISCOVER_DELAY_MS) {
                const spawnPos = pickViciousSpawnPoint(hpx, hpy, HUNTER_DETECT_RANGE);
                H.primaryId = spawnHunter(false, spawnPos); // search=false=最初から発見済み(alerted)
                H.phase = 'chase'; H.chaseStartAt = newGameTime; H.reinforced = 0;
                H.vicious = true;
                H.viciousPendingAt = 0;
                H.eventsThisRun += 1;
                useGameStore.setState({ eventBannerText: 'ハンターに発見された！', eventBannerUntil: newGameTime + EVENT_BANNER_MS });
                useGameStore.getState().triggerShake(REAPER_SUMMON_SHAKE_MS, REAPER_SUMMON_SHAKE_MAG);
                spawnFlash('rgba(180,40,40,0.18)', 220);
                useGameStore.getState().triggerAttention(spawnPos.x, spawnPos.y);
              }
            } else {
              H.viciousPendingAt = 0; // 条件が崩れた(退避/拠点制圧等)=待機解除
              if (newGameTime >= HUNTER_START_MS && H.eventsThisRun < HUNTER_MAX_PER_RUN && newGameTime >= H.nextEligibleAt && !spawnBlocked) {
              // 旧・優勢判定(6項目中4つ以上)。バッチ7で既定は退屈シグナルへ統合するが、?events=0の
              // 従来復帰用にロジック自体は残す。
              const cam = hs.camera;
              const onscreen = hs.enemies.reduce((n, e) => {
                if (isBossType(e.type) || e.type === 'hunter') return n;
                const ex = e.x + e.width / 2, ey = e.y + e.height / 2;
                return (ex >= cam.x && ex <= cam.x + gameBounds.width && ey >= cam.y && ey <= cam.y + gameBounds.height) ? n + 1 : n;
              }, 0);
              const captured = hs.baseSites.filter(b => b.status === 'captured').length;
              const gun = getActiveGun(hs.player);
              const ammoOk = !!(gun && gun.ammoType && ((gun.magazine ?? 0) + ammoPoolFor(hs.player, gun.ammoType)) >= effectiveMagSize(gun, hs.player));
              const score =
                (newGameTime - hunterLastDmgAtRef.current >= HUNTER_FAV_NODAMAGE_MS ? 1 : 0) +
                (killsSince(20000) >= HUNTER_FAV_KILLS_20S ? 1 : 0) +
                (onscreen <= HUNTER_FAV_ONSCREEN_MAX ? 1 : 0) +
                (captured >= 1 ? 1 : 0) +
                (ammoOk ? 1 : 0) +
                (killsSince(6000) >= HUNTER_FAV_STREAK_6S ? 1 : 0);
              // バッチ7: 独自の6項目優勢判定を廃止し、退屈シグナル(バッチ1の上振れ枠)に統合。
              // 上振れ枠(+数、天井BORED_BONUS_MAX)を使い切ってもなお余裕(退屈)な相手にだけ、質の
              // 緊張の切り札として出す。ピンチ猶予も追加。CDは変更なし。?events=0で旧判定に復帰。
              const hunterProducerOk = !EVENTS_ENABLED || eventGateOk({
                bigEventActive: false, gameTime: newGameTime, pityBlockUntilMs: pityEventBlockUntilRef.current,
                boardDebt: DEBT_ENABLED ? boardDebtRef.current : 0,
              });
              const ready = EVENTS_ENABLED
                ? (hunterBoredomReady(boredomBonus(upswingRef.current.boredMs, boredStartMsForAggro(currentStageAggro()))) && hunterProducerOk)
                : score >= HUNTER_FAV_SCORE_NEEDED;
              if (ready) {
                H.primaryId = spawnHunter(true);
                H.phase = 'search'; H.spawnAt = newGameTime; H.detectStartAt = 0; H.chaseStartAt = 0; H.reinforced = 0;
                H.eventsThisRun += 1;
              }
              }
            }
          } else if (H.phase === 'search') {
            const prim = hs.enemies.find(e => e.id === H.primaryId);
            if (!prim || cinematic) {
              clearAllHunters(); endHunterEvent(); // 撃破/演出割り込み=即座に立ち去る(フェード無し)
            } else if (prim.hunterLeavingAt !== undefined) {
              // フェードアウト中(索敵タイムアウト後): 経過を待って消滅させる。
              if (newGameTime - prim.hunterLeavingAt >= HUNTER_LEAVE_FADE_MS) {
                clearAllHunters(); endHunterEvent();
              }
            } else if (newGameTime - H.spawnAt >= HUNTER_SEARCH_MAX_MS) {
              // 索敵タイムアウト: 即消滅ではなくフェードアウトを開始する(社長指示)。
              // M20追補(v0.25.1533/1534): 凶悪ハンターはこの索敵フェーズ自体に入らなくなった
              // (デンジャー入場から即chaseへ)ため、ここに来るのは通常ハンターのみ。
              useGameStore.setState(s => ({ enemies: s.enemies.map(e => e.type === 'hunter' ? { ...e, hunterLeavingAt: newGameTime } : e) }));
            } else {
              const d = Math.hypot(hpx - (prim.x + prim.width / 2), hpy - (prim.y + prim.height / 2));
              if (d <= HUNTER_DETECT_RANGE) {
                H.spawnAt = newGameTime; // 索敵範囲にプレイヤーが入っている間は都度タイムアウトをリセット(社長指示)
                if (H.detectStartAt === 0) {
                  H.detectStartAt = newGameTime;
                  playSfx('hunter-alert'); // 視界に入った=見られている警告SE(社長提供)
                  // 検知=矢印を出す(被監視中の索敵個体に方角マーカー)。
                  useGameStore.setState(s => ({ enemies: s.enemies.map(e => e.id === H.primaryId ? { ...e, hunterAlerted: true } : e) }));
                  useGameStore.setState({ eventBannerText: '何かに見られている…', eventBannerUntil: newGameTime + EVENT_BANNER_MS });
                } else if (newGameTime - H.detectStartAt >= HUNTER_DISCOVER_MS) {
                  // 発見: 追跡開始。索敵個体を起こす。
                  useGameStore.setState(s => ({ enemies: s.enemies.map(e => e.type === 'hunter' ? { ...e, dormant: false, aggroRange: undefined } : e) }));
                  H.phase = 'chase'; H.chaseStartAt = newGameTime;
                  useGameStore.setState({ eventBannerText: 'ハンターに発見された！', eventBannerUntil: newGameTime + EVENT_BANNER_MS });
                  useGameStore.getState().triggerShake(REAPER_SUMMON_SHAKE_MS, REAPER_SUMMON_SHAKE_MAG);
                  spawnFlash('rgba(180,40,40,0.18)', 220);
                  // ハンター出現(発見)アテンション: カメラがハンターへ高速パン→ホールド→戻る(社長指示)。
                  useGameStore.getState().triggerAttention(prim.x + prim.width / 2, prim.y + prim.height / 2);
                }
              } else if (H.detectStartAt !== 0) {
                H.detectStartAt = 0; // 範囲外へ逃げ切った=セーフ(検知リセット)
                useGameStore.setState(s => ({ enemies: s.enemies.map(e => e.id === H.primaryId ? { ...e, hunterAlerted: false } : e) })); // 矢印も消す
                useGameStore.setState({ eventBannerText: '気配が消えた…', eventBannerUntil: newGameTime + EVENT_BANNER_MS });
              }
            }
          } else if (H.phase === 'chase') {
            const huntersAlive = hs.enemies.filter(e => e.type === 'hunter');
            if (huntersAlive.length === 0) {
              endHunterEvent(); // 全滅=イベント終了
            } else {
              const total = huntersAlive.length;
              const elapsed = newGameTime - H.chaseStartAt;
              // §5.21-追補(社長決定v0.25.1536・最終締め): 凶悪ハンター(制圧0)は常に1体のみ・増援なし。
              // 増援は通常ハンター(非凶悪)だけに適用する。
              if (!H.vicious && H.reinforced < 1 && elapsed >= HUNTER_REINFORCE_1_MS && total < HUNTER_MAX_ALIVE) {
                spawnHunter(false); H.reinforced = 1;
                useGameStore.setState({ eventBannerText: 'ハンターの増援', eventBannerUntil: newGameTime + EVENT_BANNER_MS });
              } else if (!H.vicious && H.reinforced < 2 && elapsed >= HUNTER_REINFORCE_2_MS && total < HUNTER_MAX_ALIVE) {
                spawnHunter(false); H.reinforced = 2;
                useGameStore.setState({ eventBannerText: 'ハンターの増援', eventBannerUntil: newGameTime + EVENT_BANNER_MS });
              }
              // 撤退トリガ: 制圧拠点へ逃げ込む / ボス・リーパー・演出が始まった / 追跡が上限を超えた(諦め)。
              const nearBase = hs.baseSites.some(b => b.status === 'captured' && Math.hypot(hpx - b.x, hpy - b.y) <= HUNTER_BASE_SAFE_RADIUS);
              const chasedOut = elapsed >= HUNTER_CHASE_MAX_MS; // kiteで永久追跡＆他イベント停止を防ぐ
              // M20追補(社長明確化v0.25.1534)「デンジャーを出る=手前へ戻る」: 凶悪ハンターはプレイヤーが
              // デンジャーより手前(area<2=r<3000)へ後退したら逃げ去る。前進(ゲート1方向)はゲート発生側で処理。
              const viciousRetreated = H.vicious && areaZoneIndexFor(Math.hypot(hpx, hpy)) < 2;
              if (nearBase || retreatCinematic || chasedOut || viciousRetreated) {
                useGameStore.setState(s => ({ enemies: s.enemies.map(e => e.type === 'hunter' ? { ...e, hunterFleeing: true, dormant: false, aiPhase: undefined } : e) }));
                H.phase = 'retreat';
                useGameStore.setState({ eventBannerText: 'ハンターが退いていく', eventBannerUntil: newGameTime + EVENT_BANNER_MS });
              }
            }
          } else if (H.phase === 'retreat') {
            const present = hs.enemies.filter(e => e.type === 'hunter');
            if (present.length === 0) {
              endHunterEvent();
            } else {
              // 撤退中はコントローラが移動(updateEnemies は hunterFleeing を除外)。離れたら消滅。
              useGameStore.setState(s => ({
                enemies: s.enemies.flatMap(e => {
                  if (e.type !== 'hunter') return [e];
                  const ex = e.x + e.width / 2, ey = e.y + e.height / 2;
                  const ang = Math.atan2(ey - hpy, ex - hpx);
                  if (Math.hypot(ex - hpx, ey - hpy) >= HUNTER_DESPAWN_DIST) return []; // 十分離れた=消滅
                  const nx = e.x + Math.cos(ang) * HUNTER_FLEE_SPEED * deltaTime;
                  const ny = e.y + Math.sin(ang) * HUNTER_FLEE_SPEED * deltaTime;
                  return [{ ...e, x: nx, y: ny, vx: Math.cos(ang) * HUNTER_FLEE_SPEED, vy: Math.sin(ang) * HUNTER_FLEE_SPEED }];
                }),
              }));
            }
          }
        }

        // --- 変異体(叫喚型・screamer)ディレクター: 5分以降・同時1体・CDで何度でも(社長指示) ----------
        // 画面外に1体だけ出す。AIが距離を保ちつつ溜め→叫喚で画面内の通常敵を一時強化。溜め完了前に倒せば阻止。
        // PACING_PUZZLE.md(社長裁定v0.25.1378「1は一本化」): パズル方式ON時は本ディレクターを停止し、
        // 供給を特別枠(§4-A: エリア3〜・同時1・CD3秒)へ一本化する。?puzzle=0時のみ従来どおりここが動く。
        if (!danceTest && !indoor && !puzzleActiveNow) {
          const sS = useGameStore.getState();
          const aliveScreamer = sS.enemies.some(e => e.type === 'screamer');
          const sCinematic = sS.bossChasing || !!sS.attention || sS.redNight?.phase === 'active'
            || sS.enemies.some(e => e.type === 'giantbat' || e.type === 'reaper');
          const sBlocked = sCinematic || !!sS.activeEvent;
          // バッチ7: 叫び(screamer)は関所中のみ発火(バッチ3のpressure≥0.80解禁と統合するまでの
          // 先行導入=フェーズ種別だけで判定)+ピンチ猶予。?events=0で従来(いつでも発火)に復帰。
          const screamerProducerOk = !EVENTS_ENABLED || (
            screamerPhaseGateOk(phaseAt(newGameTime).kind) &&
            eventGateOk({ bigEventActive: false, gameTime: newGameTime, pityBlockUntilMs: pityEventBlockUntilRef.current, boardDebt: DEBT_ENABLED ? boardDebtRef.current : 0 })
          );
          if (aliveScreamer) {
            // 生存中はCDを先送り=撃破/退場の後、CD経過してから次の1体。
            screamerRef.current.nextEligibleAt = newGameTime + SCREAMER_RESPAWN_CD_MS;
          } else if (newGameTime >= SCREAMER_START_MS && newGameTime >= screamerRef.current.nextEligibleAt && !sBlocked && screamerProducerOk) {
            const spx = sS.player.x + sS.player.width / 2, spy = sS.player.y + sS.player.height / 2;
            const ang = Math.random() * Math.PI * 2;
            const r = Math.hypot(gameBounds.width, gameBounds.height) / 2 + 60;
            const sc = spawnEnemyAt('screamer', spx + Math.cos(ang) * r - 18, spy + Math.sin(ang) * r - 18, newGameTime);
            sc.fixed = true; // 単体管理=画面外カリング対象外(キープ距離で動く)
            addEnemy(sc);
            useGameStore.setState({ eventBannerText: '叫喚型 出現', eventBannerUntil: newGameTime + EVENT_BANNER_MS });
            screamerRef.current.nextEligibleAt = newGameTime + SCREAMER_RESPAWN_CD_MS;
          }
        }

        // --- 拠点候補地(仕様10): サークル内10秒滞在で制圧→武器商人が移動 ---
        const escortFires = useGameStore.getState().updateSuppression(deltaTime);
        // 護衛NPCの発砲音=ハンドガン音流用。NPC↔プレイヤー距離で減衰、画面外は鳴らさない(社長指示)。
        // プレイヤー自身の攻撃音は距離無関係で等倍(=この処理はNPC発砲だけが対象)。
        if (escortFires.length > 0) {
          const sp = useGameStore.getState().player;
          const spx = sp.x + sp.width / 2, spy = sp.y + sp.height / 2;
          const scam = useGameStore.getState().camera, sgb = useGameStore.getState().gameBounds;
          let bestGain = 0; // 同フレーム複数発砲は最寄り(最大音量)の1発ぶんだけ鳴らす(throttleとも整合)
          for (const f of escortFires) {
            const g = npcSfxDistGain(f.x, f.y, spx, spy, scam, sgb);
            if (g > bestGain) bestGain = g;
          }
          if (bestGain > 0) playSfx('npc-gunfire', bestGain);
        }
        // 拠点開放SE: 制圧カウントが増えた瞬間に1回(store は音声非依存なのでここで鳴らす)。
        {
          const cc = useGameStore.getState().suppressionCaptureCount;
          if (cc > suppCaptureCountRef.current) playSfx('base-capture');
          suppCaptureCountRef.current = cc;
        }

        // --- ゾーン判定の間引き + 深層域BGM(逆再生)切替 ---
        // 毎フレームではなく ZONE_CHECK_INTERVAL フレームに1回だけ判定(多少アバウト可)。負荷1/10。
        // 準備ゾーン(D-400)で逆再生版を先読み(pause)→深層(D)で play、out(D-200)で pause、浅く戻る(D-600)で解放。
        zoneTickRef.current++;
        if (zoneTickRef.current % ZONE_CHECK_INTERVAL === 0) {
          const eligible = !danceTest && !indoor && !labTheme; // 屋外非ラボのみ深層域BGM対象
          // ?deepzone=1 完全再現: eligible(屋外)なら距離を無視して深層扱い=状態機械が prep→deep へ進み逆再生BGMが発動。
          const dist = eligible
            ? (DEEP_ZONE_FORCE ? DEEP_BGM_D + 1000 : Math.hypot(player.x + player.width / 2, player.y + player.height / 2))
            : 0;
          const phase = deepBgmPhaseRef.current;
          if (!eligible) {
            if (phase !== 'shallow') { exitDeepReverseBgm(); releaseDeepReverseBgm(); deepBgmPhaseRef.current = 'shallow'; }
          } else if (phase === 'shallow') {
            if (dist >= DEEP_BGM_D - 400) { prepareDeepReverseBgm(); deepBgmPhaseRef.current = 'prep'; }
          } else if (phase === 'prep') {
            if (dist >= DEEP_BGM_D) { enterDeepReverseBgm(); deepBgmPhaseRef.current = 'deep'; }
            else if (dist < DEEP_BGM_D - 600) { releaseDeepReverseBgm(); deepBgmPhaseRef.current = 'shallow'; }
          } else { // deep
            if (dist < DEEP_BGM_D - 200) { exitDeepReverseBgm(); deepBgmPhaseRef.current = 'prep'; }
          }
        }

        // --- 死神(深奥リスク)システム v1 ---
        // 原点(スタート/商人付近)から遠いほど死神が画面を横切り、深奥に長居すると完全出現して追跡する。
        // 横切り=無害な演出(reaperCross をセット→pixiScene が描画)、追跡=本物の reaper 敵。
        // 研究所スキンは「ラボ敵以外は沸かない」(社長指示)=死神も出さない。
        if (!danceTest && !indoor && !labTheme) {
          const rs = reaperRef.current;
          const pcx = player.x + player.width / 2;
          const pcy = player.y + player.height / 2;
          const depth = REAPER_TEST ? REAPER_CONFIG.extremeDepthPx + 1 : Math.hypot(pcx, pcy);

          // --- エリア(区域)遷移バナー: 距離帯を跨いだら区域名を表示(イベント発生と同じUI) ---
          // ゾーン判定は ZONE_CHECK_INTERVAL フレームに1回(間引き)。
          if (zoneTickRef.current % ZONE_CHECK_INTERVAL === 0) {
            const zoneIdx = areaZoneIndexFor(Math.hypot(pcx, pcy));
            if (areaZoneRef.current === -1) {
              areaZoneRef.current = zoneIdx; // 初回は黙って採用(開始地点では出さない)
            } else if (zoneIdx !== areaZoneRef.current) {
              const prevZone = areaZoneRef.current;
              areaZoneRef.current = zoneIdx;
              // §5.21-追補7(社長決定v0.25.1574): ゲート発生中(activeGateRef.current!==null)は
              // 区域バナー/SE/ゲート予約/踏破儀式を全スキップする。areaZoneRef自体は上で黙って更新済み
              // (=ゲート終了後に遅延誤発火しない)。抑止はゲートactive中のみ(pending/失敗ノックバック
              // 再判定=追補6は対象外)。
              if (activeGateRef.current === null) {
                useGameStore.setState({ eventBannerText: AREA_ZONE_NAMES[zoneIdx], eventBannerUntil: newGameTime + AREA_BANNER_MS });
                // 区域遷移音は「遠ざかる移動(外側=より深い区域へ)」のときだけ鳴らす。
                // 外側から内側へ戻る(zoneIdx が小さくなる)ときは鳴らさない(社長指示)。
                // 仕様変更(v0.25.1523): 1プレイ(1ラン)中1エリア1回まで(往復で同じ区域に再度届いても鳴らさない)。
                if (zoneIdx > prevZone && !zoneSfxPlayedRef.current.has(zoneIdx)) {
                  zoneSfxPlayedRef.current.add(zoneIdx);
                  playSfx('event-start');
                }
                // PACING_PUZZLE.md §5.21 M20 stage③/④: 未確認/深層境界を未クリアのゲートのまま踏破した=
                // 「未達ペナルティ」発動(ゲート1のみハンター復活を伴う。ゲート2はハードなので即戦闘=
                // ペナルティ状態を継続保持する必要がない)。ゲート発火待ちを立てる。
                if (GATE_ENABLED) {
                  const wallIdxNow = detectWallBreach(prevZone, zoneIdx);
                  if (entersGate1Penalty(wallIdxNow, gateMetaRef.current.gate1Cleared)) {
                    gate1PenaltyActiveRef.current = true;
                    gate1PendingRef.current = true;
                    // ハンター復活: 次に判定できる状態へ再アーム(既存の長いCDを待たせない)。
                    hunterRef.current.nextEligibleAt = Math.min(hunterRef.current.nextEligibleAt, newGameTime);
                  } else if (wallIdxNow === 4 && !gateMetaRef.current.gate2Cleared) {
                    gate2PendingRef.current = true;
                  }
                }
                // PACING_PUZZLE.md §5.17 M14: 深さの壁「儀式」(境界を跨いだ=踏破。ステージ毎初回のみ)。
                // §5.21 M20: ただし wallIdx===3/4(未確認/深層)を未クリアのゲートのまま踏破した場合は、
                // クリアするまで到達判定を出さない(社長設計「未達ペナルティ」)。
                if (WALL_ENABLED) {
                  const wallIdx = detectWallBreach(prevZone, zoneIdx);
                  if (wallIdx) {
                    syncWallDepth(Math.hypot(pcx, pcy)); // 踏破の瞬間の距離も自己最深として反映
                    const gateBlocksThisWall = GATE_ENABLED && (
                      (wallIdx === 3 && !gateMetaRef.current.gate1Cleared) ||
                      (wallIdx === 4 && !gateMetaRef.current.gate2Cleared)
                    );
                    const wm = useGameStore.getState().wallMeta;
                    if (isFirstWallBreach(wm, wallIdx) && !gateBlocksThisWall) {
                      // §5.21 M20追補(v0.25.1534): localStorageコミットはラン終了時のみ
                      // (commitRunEndProgress)。ここではメモリ上のstoreだけ更新。
                      useGameStore.setState({ wallMeta: markWallBreached(wm, wallIdx) });
                      // §5.17-追補2(社長決定v0.25.1536): 到達の+50Gを撤去(演出/記録は残す)。
                      useGameStore.getState().enqueueWallEvent('depth', `${AREA_ZONE_NAMES[zoneIdx]} —— 踏破`, 'TRESPASS', '#bfe3ff');
                      playSfx('event-clear'); // 専用ジングル無し=既存SEの流用(演出仕様v0.25.1499)
                    }
                  }
                }
              }
            }
            // PACING_PUZZLE.md §5.17 M14: 深さの壁「予告」(境界の手前150pxで帯。1ランに各壁1回)。
            // §5.21-追補7: ゲート発生中は予告も出さない(バナー類と足並みを揃える)。
            if (WALL_ENABLED && activeGateRef.current === null) {
              const nextWallIdx = zoneIdx + 1;
              if (
                nextWallIdx <= wallWarnedRef.current.length && !wallWarnedRef.current[nextWallIdx - 1] &&
                isApproachingWall(Math.hypot(pcx, pcy), 150)
              ) {
                wallWarnedRef.current[nextWallIdx - 1] = true;
                useGameStore.getState().triggerWallBand(`この先 —— ${AREA_ZONE_NAMES[nextWallIdx]}`, 'white', 2800);
              }
            }
            // 担当エリア(セクター)進入で、その担当NPCが「遠い時用(neglectFar)」コメント(社長指示・#1連動)。
            // ハブ付近(原点近く)は除外。十分外へ出てセクターが変わった時に発火。CD は tryNpcLine が担保。
            const sec = poiSectorIndex({ x: pcx, y: pcy });
            if (Math.hypot(pcx, pcy) <= AREA_SECTOR_ENTER_DIST) {
              areaSectorRef.current = -1; // ハブに居る間はリセット=再び外へ出れば必ず発火
            } else if (sec !== areaSectorRef.current) {
              areaSectorRef.current = sec;
              useGameStore.getState().npcAreaEnterReact(sec);
            }
          }
          const liveEnemies = useGameStore.getState().enemies;
          const chaserAlive = rs.chaserId != null && liveEnemies.some(e => e.id === rs.chaserId);
          // 裏ボスが画面内に居る間は「時間死神」の抽選を止める(距離死神は不変・社長指示)。
          // 画面内 ≒ プレイヤー中心(カメラ追従)±半画面+マージン。
          const reaperGB = useGameStore.getState().gameBounds;
          const hiddenBossOnScreen = liveEnemies.some(e => isHiddenBoss(e.type)
            && Math.abs((e.x + e.width / 2) - pcx) <= reaperGB.width / 2 + BOSS_SCREEN_MARGIN
            && Math.abs((e.y + e.height / 2) - pcy) <= reaperGB.height / 2 + BOSS_SCREEN_MARGIN);
          // 討伐/消滅 → クールダウン(リスク0へ。深奥に居続ければまた溜まる)。
          // 撃破escalation(社長指示): チェイサーを倒すたびに次の死神が1体ずつ増える(2体→3体…)=終わりに近づける。
          // 逃げ切り(homeRadius帰還)は下の else 分岐が先に chaserId を null にするため、ここは「撃破」のみが該当。
          if (rs.chaserId != null && !chaserAlive) { rs.defeatCount += 1; rs.chaserId = null; rs.risk = 0; rs.timeSpawned = false; rs.warpAnimStartAt = 0; }

          // PACING_PUZZLE.md §5.21-追補3(社長決定v0.25.1546): ゲート1がアクティブな間は死神(深奥リスク)
          // の抽選/蓄積そのものを凍結し、湧かせない(未達ペナルティ=effectiveReaperRiskFloorは維持。
          // ゲートが解ける=activeGateRef.currentがnullに戻ったタイミングでリスクは元の値から再開する)。
          // 既に追跡中(chaserAlive)のチェイサーはこの抑止の対象外(既存の追跡/ワープ挙動は不変)。
          // §5.21-追補5(社長決定v0.25.1555): 抑止をゲート1の「発火待ち」窓(gate1PendingRef=未確認境界を
          // 踏破済みでまだゲートが発火していない間)にも拡張する。未達ペナルティによる死神は、ゲートが
          // 実際に発火して決着してから初めて牙を剥くべきで、他イベント(城ボス等)待ちで発火が繰り延べ
          // られている間に湧かせてはいけない。
          // §5.21-追補5の対称拡張(社長実機報告v0.25.1579「ゲート2のボス戦中に死神が湧く」): 抑止を
          // ゲート2(activeGateRef===2)と発火待ち(gate2PendingRef)にも適用。ゲート2は深層境界(r>=7500)
          // =リスクが最速で溜まる深さ+ハード拘束(逃げられない)なので、ゲート1以上に死神が理不尽。
          if (!chaserAlive && (activeGateRef.current !== null || gate1PendingRef.current || gate2PendingRef.current)) {
            // 抑止中: 何もしない(risk加減・気配演出・完全出現のいずれも止める)。
          } else if (!chaserAlive) {
            // リスク更新(深奥滞在で増加・深奥外で減少)。
            // PACING_PUZZLE.md §5.21 M20 stage③: 囲いゲート1の未達ペナルティ中は、リスク蓄積の起点を
            // 未確認到達ライン(AREA_THRESHOLDS[2]=5000)へ前倒しする(既存の起点より緩くはならない)。
            const spawnRiskFloor = effectiveReaperRiskFloor(REAPER_CONFIG.spawnRiskDepthPx, gate1PenaltyActiveRef.current, AREA_THRESHOLDS[2]);
            if (depth >= REAPER_CONFIG.extremeDepthPx) rs.risk += REAPER_CONFIG.riskGainPerSecExtreme * deltaTime;
            else if (depth >= spawnRiskFloor) rs.risk += REAPER_CONFIG.riskGainPerSecDeep * deltaTime;
            else rs.risk -= REAPER_CONFIG.riskDecayPerSec * deltaTime;
            rs.risk = Math.max(0, Math.min(REAPER_CONFIG.riskMax, rs.risk));

            // 横切り(気配演出)。無害(当たり判定なし)。社長指示で「必ず水平に画面を通り過ぎる」へ復帰。
            // (以前は進行方向で縦断もしていたが、縦断は遠近で“近づいてきて消える”ように見えるため廃止。)
            // 奥(上部・小さく)か手前(下部・大きく)かと、左右どちらから来るかだけランダム。被写界深度(tilt-shift)も乗る。
            const doReaperCross = () => {
              const rnd = Math.random() < 0.5 ? 1 : -1;            // 左右どちらから通り過ぎるか
              const near = Math.random() < 0.5;                    // 手前/奥
              const cross = near
                ? { axis: 'h' as const, band: 0.86, dir: rnd, scale: 1.1 }  // 下部手前・大きく
                : { axis: 'h' as const, band: 0.15, dir: rnd, scale: 0.5 }; // 上部奥・小さく
              useGameStore.setState({
                reaperCross: { startedAt: Date.now(), durationMs: REAPER_CONFIG.crossDurationMs, ...cross },
              });
              // SFX(短い不穏音)は専用アセット待ち。配置後 playSfx('reaper-pass') を有効化。
            };
            // 距離(深奥)による横切り。深いほど頻発。
            if (depth >= REAPER_CONFIG.warningDepthPx) {
              const interval = reaperPassIntervalMs(depth);
              if (newGameTime - rs.lastPassAt >= interval) {
                rs.lastPassAt = newGameTime;
                rs.passCount += 1;
                doReaperCross();
              }
            }

            // 時間による出現(社長指示): 10分経過後、20秒ごとに抽選。確率=10%+(10分以降の経過分×10%)で最大100%。
            // 抽選ごとに気配演出(横切り)を出し、当選で risk を最大化=直後の完全出現へ。距離条件は不問。
            if (!hiddenBossOnScreen
                && newGameTime >= REAPER_CONFIG.timeStartMs
                && newGameTime - rs.lastTimeRollAt >= REAPER_CONFIG.timeRollIntervalMs) {
              rs.lastTimeRollAt = newGameTime;
              const minsPast = Math.floor((newGameTime - REAPER_CONFIG.timeStartMs) / 60000);
              const chance = Math.min(1, REAPER_CONFIG.timeBaseChance + REAPER_CONFIG.timeChancePerMin * minsPast);
              doReaperCross(); // 気配演出
              if (Math.random() < chance) { rs.risk = REAPER_CONFIG.spawnRiskThreshold; rs.timeSpawned = true; } // 当選=完全出現(時間死神)
            }

            // 完全出現(追跡)。リスク最大で、進行方向の画面外から1体だけ出す(前方から迫る)。
            if (rs.risk >= REAPER_CONFIG.spawnRiskThreshold) {
              let hx = player.vx ?? 0;
              let hy = player.vy ?? 0;
              if (Math.abs(hx) + Math.abs(hy) < 0.01 && player.lastDirection) { hx = player.lastDirection.x; hy = player.lastDirection.y; }
              if (Math.abs(hx) + Math.abs(hy) < 0.01) hy = -1; // idle→上(奥)
              const hlen = Math.hypot(hx, hy) || 1;
              // 必ず画面外から出す(社長指示)。画面の最遠角(中心→角)+余白を下限と比較して大きい方を採用。
              const gb = useGameStore.getState().gameBounds;
              const offScreenDist = Math.hypot(gb.width / 2, gb.height / 2) + REAPER_CONFIG.spawnMarginPx;
              const spawnDist = Math.max(REAPER_CONFIG.spawnDistFromPlayer, offScreenDist);
              const sx = pcx + (hx / hlen) * spawnDist;
              const sy = pcy + (hy / hlen) * spawnDist;
              const chaser = spawnEnemyAt('reaper', sx - 40, sy - 40, newGameTime);
              chaser.reaperChaser = true;
              chaser.health = REAPER_CONFIG.chaserHealth;
              chaser.maxHealth = REAPER_CONFIG.chaserHealth;
              chaser.damage = REAPER_CONFIG.contactDamage;
              chaser.speed = getReaperChaseSpeed(player.speed); // 0.9倍速(ワープで回り込む)
              addEnemy(chaser);
              // 撃破escalation(社長指示): これまでの撃破回数ぶん、追加の死神を同時に出す(2体→3体…)。
              // 追加分は reaperChaser=false のまま=updateEnemies の通常チェイスで「歩いて追う」(ワープはchaser1体のみ)。
              // HP/接触ダメはchaserと同じ弱体値=倒せる。画面外リングに散らす。
              for (let ri = 0; ri < rs.defeatCount; ri++) {
                const ea = ((ri + 1) / (rs.defeatCount + 1)) * Math.PI * 2;
                const ex = pcx + Math.cos(ea) * spawnDist, ey = pcy + Math.sin(ea) * spawnDist;
                const extra = spawnEnemyAt('reaper', ex - 40, ey - 40, newGameTime);
                extra.health = REAPER_CONFIG.chaserHealth; extra.maxHealth = REAPER_CONFIG.chaserHealth;
                extra.damage = REAPER_CONFIG.contactDamage;
                extra.speed = getReaperChaseSpeed(player.speed);
                addEnemy(extra);
              }
              useGameStore.getState().triggerShake(REAPER_SUMMON_SHAKE_MS, REAPER_SUMMON_SHAKE_MAG); // 死神召喚=強めの画面シェイク
              rs.chaserId = chaser.id;
              rs.chaserSpawnAt = newGameTime;
              rs.lastWarpAt = newGameTime;
              rs.warpAnimStartAt = 0; rs.warpTeleported = false;
              reaperLiftRef.current = 0; // 新チェイサーの近接フィニッシュ検出を初期化
              rs.risk = REAPER_CONFIG.riskMax;
              spawnFlash('rgba(10,10,16,0.30)', 360);
              // 死神「完全出現」もカメラアテンション(社長指示)。裏ボス/城ボス出現と同じく、時間停止で現地へ
              // 寄って戻るシネマティック。出現位置(画面外)へパンして死神を見せる。
              useGameStore.getState().triggerAttention(sx, sy);
              playSfx('boss-appear'); // 出現アテンションSE(裏ボスと同系)
            }
          } else {
            // プレイヤーがスタート(原点)付近 homeRadiusPx 内へ戻れば死神は去る=逃げ切り。リスクは0へクールダウン。
            // ただし「時間による死神」(timeSpawned)は時間制限のデスなので原点に戻っても去らない(逃げ場なし)。
            if (!rs.timeSpawned && Math.hypot(pcx, pcy) < REAPER_CONFIG.homeRadiusPx) {
              if (rs.chaserId) ENEMY_REMOVE_CAUSE.set(rs.chaserId, 'chaser'); // 消失ログ用: 救助チェイサー除去
              useGameStore.setState({ enemies: useGameStore.getState().enemies.filter(e => e.id !== rs.chaserId) });
              rs.chaserId = null;
              rs.risk = 0;
              rs.warpAnimStartAt = 0;
            } else {
              // 追跡: 0.9倍速(player.speed基準=成長反映・ダッシュ等は除外)。慣性は updateEnemies のチェイス inertia がかかる。
              const targetSpeed = getReaperChaseSpeed(player.speed);
              // 回り込みワープ: 一定間隔で、プレイヤーの上下左右いずれか(多少ランダム)へ warp して挟み込む。
              // 社長指示: パッと消えてパッと出るのではなく、0.5s でフェードアウト→テレポート→0.5s でフェードイン。
              const WARP_FADE = REAPER_CONFIG.warpFadeMs;
              // 死神の現在位置とプレイヤーまでの距離。近接フィニッシュ被弾は liftUntil の増加で検出。
              const chaserNow = useGameStore.getState().enemies.find(e => e.id === rs.chaserId);
              const rcx = chaserNow ? chaserNow.x + chaserNow.width / 2 : pcx;
              const rcy = chaserNow ? chaserNow.y + chaserNow.height / 2 : pcy;
              const distToPlayer = Math.hypot(rcx - pcx, rcy - pcy);
              const liftNow = chaserNow?.liftUntil ?? 0;
              const finisherHit = liftNow > reaperLiftRef.current; // 近接フィニッシュ(boss-stun×5)を食らった
              reaperLiftRef.current = Math.max(reaperLiftRef.current, liftNow);
              // ワープ発火条件(社長指示):
              //  (A) 一定間隔 かつ プレイヤーより warpDistPx 遠い時のみ=近接時はワープせず居座る(=近づいて消えない)。
              //  (B) 近接フィニッシュを食らった時=距離不問で即・回り込み離脱。
              const intervalWarp = newGameTime - rs.lastWarpAt >= REAPER_CONFIG.warpIntervalMs
                && distToPlayer > REAPER_CONFIG.warpDistPx;
              if (rs.warpAnimStartAt === 0 && (intervalWarp || finisherHit)) {
                rs.lastWarpAt = newGameTime;
                rs.warpAnimStartAt = newGameTime;
                rs.warpTeleported = false;
                const card = [[0, -1], [0, 1], [-1, 0], [1, 0]][Math.floor(Math.random() * 4)];
                const jit = (Math.random() - 0.5) * REAPER_CONFIG.warpDistPx * 0.5;
                rs.warpToX = pcx + card[0] * REAPER_CONFIG.warpDistPx + (card[0] === 0 ? jit : 0);
                rs.warpToY = pcy + card[1] * REAPER_CONFIG.warpDistPx + (card[1] === 0 ? jit : 0);
              }
              // ワープアニメ進行(フェードのみ・移動は止める)。
              let warpAlpha = 1;
              let teleportNow = false;
              const warping = rs.warpAnimStartAt > 0;
              if (warping) {
                const el = newGameTime - rs.warpAnimStartAt;
                if (el < WARP_FADE) {
                  warpAlpha = Math.max(0, 1 - el / WARP_FADE);       // 消える(フェードアウト)
                } else if (el < WARP_FADE * 2) {
                  if (!rs.warpTeleported) { teleportNow = true; rs.warpTeleported = true; } // 不可視の瞬間に瞬間移動
                  warpAlpha = Math.min(1, (el - WARP_FADE) / WARP_FADE); // 出る(フェードイン)
                } else {
                  warpAlpha = 1; rs.warpAnimStartAt = 0; rs.warpTeleported = false; // アニメ終了
                }
              }
              // 追跡移動: ワープ以外の通常フレームは、プレイヤーへ向かって歩いて詰める(近づく)。
              // 死神チェイサーは updateEnemies を素通りする(専用管理)ため、ここで明示的に座標を進めないと
              // 「ワープするだけで近づいてこない」状態になっていた(社長報告)。壁はすり抜け(reaper=passthrough)。
              let chaseX: number | null = null, chaseY: number | null = null;
              if (!warping && !teleportNow && chaserNow) {
                const cdx = pcx - rcx, cdy = pcy - rcy;
                const cl = Math.hypot(cdx, cdy) || 1;
                const step = targetSpeed * deltaTime * MOVE_SPEED_MULT; // 他の敵と同じテンポ(1.2倍)
                chaseX = chaserNow.x + (cdx / cl) * step;
                chaseY = chaserNow.y + (cdy / cl) * step;
              }
              useGameStore.setState({
                enemies: useGameStore.getState().enemies.map(e =>
                  e.id === rs.chaserId
                    ? {
                        ...e,
                        ...(teleportNow
                          ? { x: rs.warpToX - e.width / 2, y: rs.warpToY - e.height / 2, vx: 0, vy: 0 }
                          : chaseX !== null ? { x: chaseX, y: chaseY as number } : {}),
                        speed: warping ? 0 : targetSpeed, // ワープ中は静止(フェードで消えて別位置に出る)
                        damage: REAPER_CONFIG.contactDamage,
                        reaperWarpAlpha: warpAlpha,
                      }
                    : e
                ),
              });
            }
          }
        }

        // juice(flashy unified boss death): getsDramaticDeath 対象(ネームド/裏ボス/giantbat/hunter)の
        // 討伐 corpse/VFX は gameStore 側(triggerDramaticDeath)が共通に出す。SFXだけは gameStore が
        // playSfx を持てないため、ここで bossCorpse.diedAt の変化を監視して1回だけ鳴らす。corpse の
        // 片付け(フェード終了→null)も、裏ボス未設定ステージ(城単体/洋館ステージ等)で動くよう、下の
        // 裏ボス専用ブロック(hiddenBoss configured時のみ実行)の外(=毎フレーム常時)に置く。
        {
          const corpse = useGameStore.getState().bossCorpse;
          if (corpse) {
            if (corpse.diedAt !== bossCorpseSfxRef.current) {
              bossCorpseSfxRef.current = corpse.diedAt;
              playSfx('boss-death'); // 討伐(消滅)SE。長尺なのでフェードアウト付き(社長提供)
            }
            if (Date.now() - corpse.diedAt >= BOSS_FADE_MS) useGameStore.setState({ bossCorpse: null });
          }
        }

        // ?gateboss=1 診断(PACING_PUZZLE.md §5.21-追補8): ラン開始直後、そのステージのゲート2ボス型を
        // 実ゲート2と同じ形でforce-spawnして即テストできるようにする。将来ステージが増えたら
        // GATE2_BOSS_TYPE_BY_STAGE に足すだけで対応する。既定OFF=通常挙動不変。
        // 実機バグ修正(社長報告v0.25.1593「開始位置的にこっちが強制的に食らって即死」): 旧実装は
        // ボスをプレイヤーの真上(gcx-24,gcy-24)に出していた=接触ダメージ190で即死。実ゲート2と同じく
        // ①拘束サークル(beginArenaEvent)を張り ②ボスは周回半径ぶん離した位置(中心の上方)へ出す。
        if (FORCE_GATEBOSS && !gatebossForceRef.current && !danceTest && !indoor && !labTheme && !useGameStore.getState().gameWon) {
          const gbType = GATE2_BOSS_TYPE_BY_STAGE[getSelectedStageId()];
          if (gbType) {
            gatebossForceRef.current = true;
            const gcx = player.x + player.width / 2, gcy = player.y + player.height / 2;
            // 拘束サークル=中心=プレイヤー開始位置(実ゲート2と同じ。プレイヤーは円内に留まりミゲルと戦える)。
            const gEvent = { kind: 'boss' as const, x: gcx, y: gcy, radius: GATE_ARENA_RADIUS, startedAt: newGameTime, endsAt: newGameTime + GATE2_BOSS_DURATION_MS };
            useGameStore.getState().beginArenaEvent(gEvent); // 敵一掃を含むのでボス配置の前に呼ぶ
            // ボスは中心の上方=周回半径ぶん離して出す(即接触死を防ぐ)。実ゲート2と同じ offset 式。
            const gbx = gcx + Math.cos(-Math.PI / 2) * GATE_ARENA_RADIUS * 0.5;
            const gby = gcy + Math.sin(-Math.PI / 2) * GATE_ARENA_RADIUS * 0.5;
            const gboss = spawnEnemyAt(gbType, gbx - 24, gby - 24, newGameTime);
            gboss.fromEvent = true; // ×5は掛けない=基本値(実ゲート2と揃える・社長指示v0.25.1595)
            gboss.bossState = 'chase';
            gboss.bossNextActionAt = newGameTime + 2000;
            gboss.homeX = gcx; gboss.homeY = gcy; // 周回の中心=ゲート中心
            addEnemy(gboss);
            activeGateRef.current = 2; // 実ゲート2相当(エリア判定OFF等)。テスト用途。
          }
        }

        // --- 裏ボス(深層域の隠しボス: ステージ1=ミーミル / ステージ3=ヨルムンガルド) ---
        // 仕様(社長指示): 深層域の指定エリアに近づくと1回だけ出現→「危険!直ちに避難を」。
        //  追跡/攻撃(3連発・全方位16発・たまにダッシュ)。画面外は巣へ戻りつつ毎秒40回復。
        //  深層域を出ると帰巣して退場。追いかけてくる間は他敵が一斉に逃げ、イベントも発生しない。
        //  討伐で「<名前>討伐!」+FF風フェードアウト。移動/攻撃はこのコントローラが座標を直接書き込む。
        const hiddenBoss = useGameStore.getState().hiddenBoss;
        if (hiddenBoss && !danceTest && !indoor && !labTheme && !useGameStore.getState().gameWon) {
         try { // 裏ボス制御の例外でゲームループ全体(=移動/攻撃)が固まらないよう保護(描画ループとは別系統)。
          const bs = bossRef.current;
          const pcx = player.x + player.width / 2;
          const pcy = player.y + player.height / 2;
          const depth = Math.hypot(pcx, pcy);
          const live = useGameStore.getState().enemies;
          const boss = bs.bossId ? live.find(e => e.id === bs.bossId) : undefined;

          // 討伐検出: 出現中の裏ボスが敵配列から消えた(=プレイヤーが倒した)。自前の帰巣退場は retreating で除外。
          // juice(flashy unified boss death): corpse/シェイク/フラッシュ/SFXは gameStore の共通キル経路
          // (triggerDramaticDeath・grantMeleeKillRewards/damageEnemy)から統一して出すようになったので、
          // ここでは討伐フラグとバナーだけを立てる(二重発火防止)。
          if (bs.bossId && !boss && !bs.retreating) {
            useGameStore.setState({
              bossChasing: false,
              hiddenBossDefeated: true,
              eventBannerText: `${enemyDeathLabel(hiddenBoss)}討伐!`,
              eventBannerUntil: newGameTime + 3600,
            });
            bs.bossId = null;
          }

          if (!bs.bossId) {
            if (useGameStore.getState().bossChasing) useGameStore.setState({ bossChasing: false });

            // 未出現で、固定の巣(指定エリア)へ近づいたら出現(この出撃で1回だけ)。アテンション中は重ねない。
            // 巣を持たないタイプ(将来用)は従来どおり深層域の深度到達でフォールバック出現。
            // テスト: ?bossnow=1 のときは巣に関係なく「プレイヤーの近く・画面外(進行方向)」へ即出現。
            const lair = bossLairPos(hiddenBoss);
            const nearLair = lair ? Math.hypot(pcx - lair.x, pcy - lair.y) <= BOSS_SPAWN_NEAR : depth >= BOSS_SPAWN_DEPTH;
            if (!bs.spawned && (FORCE_HIDDEN_BOSS || nearLair) && !useGameStore.getState().attention && !isGameTimeStopped()
                && !useGameStore.getState().activeEvent) { // 囲い系イベント中は裏ボスを出さない(重なると逃走で詰み=終わらない・社長報告)
              const e = spawnEnemyAt(hiddenBoss, 0, 0, newGameTime);
              let cx: number, cy: number;
              if (FORCE_HIDDEN_BOSS) {
                // 進行方向(なければ最後の向き/上)の画面外すぐ外へ。帰巣先もここにする。
                let hx = player.vx ?? 0, hy = player.vy ?? 0;
                if (Math.abs(hx) + Math.abs(hy) < 0.01 && player.lastDirection) { hx = player.lastDirection.x; hy = player.lastDirection.y; }
                if (Math.abs(hx) + Math.abs(hy) < 0.01) hy = -1;
                const hlen = Math.hypot(hx, hy) || 1;
                const gb2 = useGameStore.getState().gameBounds;
                // 画面外マーカー(方向矢印)が出るギリギリの距離=最寄り画面端のすぐ外。進行方向の軸で算出。
                const half = Math.abs(hx) >= Math.abs(hy) ? gb2.width / 2 : gb2.height / 2;
                const d = half + 50; // 端のちょい外(=矢印が出始める距離)
                cx = pcx + (hx / hlen) * d; cy = pcy + (hy / hlen) * d;
              } else {
                cx = lair ? lair.x : pcx; cy = lair ? lair.y : pcy;
              }
              e.x = cx - e.width / 2; e.y = cy - e.height / 2;
              e.bossState = 'chase';
              e.bossNextActionAt = newGameTime + 2000;
              e.homeX = e.x; e.homeY = e.y; // 巣=帰巣先(画面外/深層域離脱で戻る位置)
              addEnemy(e);
              bs.spawned = true; bs.bossId = e.id; bs.retreating = false;
              bs.homeX = e.x; bs.homeY = e.y; bs.lastX = e.x; bs.lastY = e.y; bs.w = e.width; bs.h = e.height;
              useGameStore.getState().triggerAttention(cx, cy);
              playSfx('boss-appear'); // 裏ボス出現アテンションSE(社長提供)
              useGameStore.setState({ eventBannerText: '危険!直ちに避難を', eventBannerUntil: newGameTime + 3000 });
              useGameStore.getState().triggerShake(REAPER_SUMMON_SHAKE_MS, REAPER_SUMMON_SHAKE_MAG);
              spawnFlash('rgba(120,20,40,0.30)', 360);
            }
          } else if (boss) {
            bs.lastX = boss.x; bs.lastY = boss.y; bs.w = boss.width; bs.h = boss.height;
            const cam = useGameStore.getState().camera;
            const gb = useGameStore.getState().gameBounds;
            const bcx = boss.x + boss.width / 2, bcy = boss.y + boss.height / 2;
            const M = BOSS_SCREEN_MARGIN;
            const onScreen = bcx >= cam.x - M && bcx <= cam.x + gb.width + M && bcy >= cam.y - M && bcy <= cam.y + gb.height + M;
            const inDeep = FORCE_HIDDEN_BOSS || depth >= BOSS_EXIT_DEPTH; // テスト時は深層域判定を無視(浅い場所でも帰巣しない)
            const speed = boss.speed;
            // 裏ボスは updateEnemies を素通りするため、移動テンポ(ゲームスピード1.2倍)がここには自動で乗らない。
            // 通常敵と揃えるため、移動の位置更新/慣性は bossMoveDt(= deltaTime × MOVE_SPEED_MULT)を使う(社長指示)。
            // 回復(BOSS_REGEN)やタイマー等は素の deltaTime のまま(テンポの対象外)。
            const bossMoveDt = deltaTime * MOVE_SPEED_MULT;
            const fireBullet = (tx: number, ty: number) => addProjectile(createEnemyProjectile(boss, player, tx, ty));

            const patch: Partial<typeof boss> = {};
            let chasing = false;
            let despawn = false;

            // トール専用: 弾を持たないため、画面外からの攻撃(この時点のonScreen=false)を連続で
            // 被弾したらジャンプ攻撃で間合いを詰める(社長修正指示)。他の裏ボスでは無害(参照されない)。
            if (boss.type === 'thor') {
              const prevHp = bs.thorPrevHealth;
              if (prevHp >= 0 && boss.health < prevHp && !onScreen) {
                bs.thorRangedHits.push(newGameTime);
              }
              bs.thorRangedHits = bs.thorRangedHits.filter(t => newGameTime - t <= THOR_JUMP_TRIGGER_WINDOW_MS);
              bs.thorPrevHealth = boss.health;
            }

            if (!inDeep) {
              // 深層域を出た → 巣へ帰り、着いたら退場(討伐扱いにしない)。帰巣中も回復する。
              bs.vx = 0; bs.vy = 0; // 帰巣中は慣性リセット(復帰時にチェイスがぬるっと暴れないように)
              bs.retreating = true;
              const dhx = bs.homeX - boss.x, dhy = bs.homeY - boss.y;
              const dl = Math.hypot(dhx, dhy);
              if (dl < 10) { despawn = true; }
              else {
                const mv = Math.min(speed * bossMoveDt, dl);
                patch.x = boss.x + (dhx / dl) * mv; patch.y = boss.y + (dhy / dl) * mv;
                patch.health = Math.min(boss.maxHealth, boss.health + BOSS_REGEN_PER_SEC * deltaTime);
                patch.bossState = 'return';
              }
            } else if (!onScreen) {
              // 画面外: 巣(下の定位置)へ戻りつつ毎秒40回復。追跡状態ではない。
              bs.vx = 0; bs.vy = 0;
              bs.retreating = false;
              const dhx = bs.homeX - boss.x, dhy = bs.homeY - boss.y;
              const dl = Math.hypot(dhx, dhy);
              if (dl > 1) { const mv = Math.min(speed * bossMoveDt, dl); patch.x = boss.x + (dhx / dl) * mv; patch.y = boss.y + (dhy / dl) * mv; }
              patch.health = Math.min(boss.maxHealth, boss.health + BOSS_REGEN_PER_SEC * deltaTime);
              patch.bossState = 'return';
            } else {
              // 画面内 & 深層域 → 追跡 + 攻撃状態機械。
              bs.retreating = false;
              chasing = true;
              // カウンターワープ中: 0.5秒かけてフェードイン(reaperWarpAlpha)。移動/攻撃は止める(materializing)。
              const warping = Date.now() < bs.warpUntil;
              if (warping) {
                patch.reaperWarpAlpha = Math.max(0, Math.min(1, 1 - (bs.warpUntil - Date.now()) / BOSS_WARP_FADE_MS));
              } else if ((boss.reaperWarpAlpha ?? 1) < 1) {
                patch.reaperWarpAlpha = 1; // フェード完了→完全表示へ戻す
              }
              // トラップ(root)/ワープ中は移動も攻撃も止める=トラップが効く。
              // 気絶(stun)は止めない: 攻撃も中断せず通常の状態機械を回し、歩行(チェイス)だけ半速にする(社長指示)。
              // ボスは updateEnemies を早期returnで素通りするため、ここで明示的に判定する。
              // 裏ボスの完全気絶(紫・5クリ)中は攻撃も移動も完全停止(通常の気絶=歩行半速のみ とは別・社長指示)。
              const bossFullStun = boss.bossFullStunUntil !== undefined && newGameTime < boss.bossFullStunUntil;
              const frozen = warping
                || (boss.rootUntil !== undefined && newGameTime < boss.rootUntil)
                || bossFullStun;
              const stunned = boss.stunUntil !== undefined && newGameTime < boss.stunUntil;
              const walkMult = stunned ? BOSS_STUN_SPEED_MULT : 1; // 気絶中は歩行のみ半速(攻撃は通常)
              // 追跡先=プレイヤー/召喚の「近い方」(社長指示)。通常敵と同じ resolveEnemyTarget で吸い付く。
              const chaseTgt = resolveEnemyTarget(boss, player, useGameStore.getState().summons, BOSS_SUMMON_AGGRO);
              // 慣性付き移動: 目標方向の desired 速度へ現在速度を BOSS_TURN_RESPONSE で寄せて位置を更新
              // (急な方向転換がぬるっと効く=慣性)。最高速は spd*mult のまま不変。
              // spd省略時は自身のspeed(mimir/jormungand/skadi/通常敵の既定)。トールの接近だけ
              // 社長指示でTHOR_APPROACH_SPEED(プレイヤーの1/2速度)を明示的に渡す。
              const moveToward = (mult: number, spd: number = speed) => {
                const dpx = chaseTgt.x - bcx, dpy = chaseTgt.y - bcy;
                const dl = Math.hypot(dpx, dpy) || 1;
                const desVx = (dpx / dl) * spd * mult;
                const desVy = (dpy / dl) * spd * mult;
                const k = Math.min(1, BOSS_TURN_RESPONSE * bossMoveDt);
                bs.vx += (desVx - bs.vx) * k;
                bs.vy += (desVy - bs.vy) * k;
                patch.x = boss.x + bs.vx * bossMoveDt; patch.y = boss.y + bs.vy * bossMoveDt;
              };
              if (frozen) {
                // 解除後はチェイスから再開。溜め/連射タイマーを巻き戻して「解除直後に溜め攻撃が暴発」を防ぎ、
                // 進行中の連射残数もクリア(凍結をまたいで状態が漏れないように)。慣性もリセット。
                bs.vx = 0; bs.vy = 0;
                patch.bossState = 'chase';
                patch.bossNextActionAt = newGameTime + BOSS_ACTION_MIN_MS;
                patch.bossBurstLeft = 0;
              } else {
              // 画面外/帰巣中は bossState='return' になる。チェイス状態機械に 'return' のケースが無いため、
              // 復帰時に 'return' のままだと どの分岐にも入らず=移動も状態遷移もせず永久に固まる(社長報告のバグ)。
              // チェイス復帰時は 'chase' として扱い、bossState も chase へ戻して必ず再開させる。
              if (boss.bossState === 'return') { patch.bossState = 'chase'; patch.bossNextActionAt = newGameTime + BOSS_ACTION_MIN_MS; }
              const st = (boss.bossState == null || boss.bossState === 'return') ? 'chase' : boss.bossState;
              const nextActionDelay = () => newGameTime + BOSS_ACTION_MIN_MS + Math.random() * (BOSS_ACTION_MAX_MS - BOSS_ACTION_MIN_MS);
              // --- トール(ステージ5)専用ヘルパー(社長指示・独自攻撃) ------------------------------
              // 旋回運動: 現在の相対位置から角度/半径を毎フレーム自己補正しながら回す(専用の角度状態を持たない)。
              // Y-down画面座標では atan2 の角度が増える向き=視覚的に時計回り(社長指示「時計回り」の既定 dir=1)。
              // 社長指示(v0.25.1334〜):「たまに2秒さらに1/2の速度で歩く」。今の移動速度(接近/後退/旋回の
              // どれでも)に一律で追加の減速を掛ける一時ウィンドウ。bs.thorSlowWalkUntilが未来の間だけ有効。
              const thorSlowMult = () => (newGameTime < (bs.thorSlowWalkUntil ?? 0) ? THOR_SLOWWALK_MULT : 1);
              const thorOrbitMove = () => {
                const dir = boss.bossCircleDir ?? 1;
                const relX = bcx - chaseTgt.x, relY = bcy - chaseTgt.y;
                const curDist = Math.hypot(relX, relY) || 1;
                const slowMult = thorSlowMult();
                if (curDist < THOR_ORBIT_DIST) {
                  // 社長指示②: 旋回距離より近づかれたら、旋回せずプレイヤーの1/2速度で真っ直ぐ後ずさる。
                  const ux = relX / curDist, uy = relY / curDist; // 相手から離れる向き
                  patch.x = boss.x + ux * THOR_RETREAT_SPEED * walkMult * slowMult * bossMoveDt;
                  patch.y = boss.y + uy * THOR_RETREAT_SPEED * walkMult * slowMult * bossMoveDt;
                  bs.vx = 0; bs.vy = 0;
                  return;
                }
                const curAngle = Math.atan2(relY, relX);
                const angularSpeed = (speed * THOR_ORBIT_SPEED_MULT * walkMult * slowMult) / THOR_ORBIT_DIST;
                const newAngle = curAngle + dir * angularSpeed * bossMoveDt;
                const correctedDist = curDist + (THOR_ORBIT_DIST - curDist) * Math.min(1, THOR_ORBIT_RADIUS_CORRECT * bossMoveDt);
                const ncx = chaseTgt.x + Math.cos(newAngle) * correctedDist;
                const ncy = chaseTgt.y + Math.sin(newAngle) * correctedDist;
                patch.x = ncx - boss.width / 2; patch.y = ncy - boss.height / 2;
                bs.vx = 0; bs.vy = 0; // 旋回は専用運動=通常チェイスの慣性を持ち越さない(他状態の慣性リセットと同じ扱い)
              };
              // 通常移動: 近接距離+余白より遠ければ接近、そうでなければ旋回/後退に切り替える(社長指示)。
              const thorMove = () => {
                const dpx = chaseTgt.x - bcx, dpy = chaseTgt.y - bcy;
                const dist = Math.hypot(dpx, dpy) || 1;
                // 社長指示①: 旋回間合いに入るまでの接近速度はプレイヤーの1/2(自身のspeedではなくTHOR_APPROACH_SPEED)。
                if (dist > THOR_ORBIT_DIST + THOR_ORBIT_APPROACH_SLACK) moveToward(walkMult, THOR_APPROACH_SPEED * thorSlowMult());
                else thorOrbitMove();
              };
              // 次の攻撃選択までの間隔。HPが低いほど短く=高頻度化(社長指示)。
              const thorNextActionDelay = () => {
                const hpFrac = boss.maxHealth > 0 ? boss.health / boss.maxHealth : 1;
                const mult = hpFrac <= THOR_LOWHP_FRAC ? THOR_LOWHP_INTERVAL_MULT : 1;
                return newGameTime + (THOR_ACTION_MIN_MS + Math.random() * (THOR_ACTION_MAX_MS - THOR_ACTION_MIN_MS)) * mult;
              };
              // カウンター成立時の共通処理(社長指示: すべての攻撃がカウンター可能)。通常カウンターと同じ
              // 演出(Counter!/ヒットインパクト/クリ反撃)を行い、近接距離ギリギリ外まで高速後退させる。
              const thorCounterHit = (hitX: number, hitY: number) => {
                const cp = useGameStore.getState().player;
                const pnow = Date.now();
                addMeleeFinishCombo(1);
                playSfx('counter');
                useGameStore.getState().spawnGlow(hitX, hitY, 95, 'rgba(56,189,248,', 360);
                useGameStore.getState().triggerHitImpact(COUNTER_HITSTOP_MS, COUNTER_SHAKE_MS, COUNTER_SHAKE_MAG, COUNTER_ZOOM_MAG);
                useGameStore.getState().markMeleeSwingFx(); // §5.22-追補(社長決定v0.25.1536): カウンターにも近接スイングを出す
                spawnRing(hitX, hitY, 14, 135, 'rgba(56,189,248,0.9)', 3, 360);
                spawnBurst(hitX, hitY, '#38bdf8', 14);
                useGameStore.getState().spawnCallout(hitX, hitY - 12, 'Counter!', '#e0f2ff', { bg: 0x2563eb, holdMs: MELEE_FINISH_SLOW_HOLD_MS, duration: MELEE_FINISH_SLOW_MS });
                useGameStore.setState(stt => ({ player: { ...stt.player, invulnerable: true, invulnerableTime: pnow, lastCounterSuccessTime: pnow } }));
                const counterBase = getActiveGun(cp)?.damage ?? 12;
                const critMult = skillCritMult(cp, BOSS_CRIT_DAMAGE_MULT);
                const dmg = Math.max(1, Math.round(counterBase * critMult * skillOutgoingDamageMult(cp) * (cp.equipBonus?.damageMult ?? 1)));
                // 社長指示: トールのカウンターは必ずクリティカル扱いにする(裏ボス完全気絶=bumpBossCritの
                // カウントに乗せる。他の裏ボス共通のパリィ演出は非crit踏襲のままここだけ変更)。
                damageEnemy(boss.id, dmg, false, true);
                spawnDamageNumber(bcx, boss.y, dmg, true);
                playSfx('headshot');
                // 社長指示: 「これは普通のクリティカルです」= 通常のクリ演出(金の衝撃波+火花+発光。
                // 銃/近接クリの hitCrit juice と同じ見た目)もここに乗せる。青いCounter演出とは別レイヤーで
                // 重ねて出す=カウンター成立と同時に「クリティカルが乗った」ことが見た目でも分かるようにする。
                spawnRing(hitX, hitY, 8, 46, 'rgba(253,224,71,0.95)', 3, 300);
                spawnBurst(hitX, hitY, '#fde047', 10);
                useGameStore.getState().spawnGlow(hitX, hitY, 34, 'rgba(253,224,71,', 240);
                const lx = bcx - pcx, ly = bcy - pcy;
                const ll = Math.hypot(lx, ly) || 1;
                patch.bossState = 'counter-leap';
                patch.bossStateUntil = newGameTime + THOR_COUNTER_LEAP_MS;
                patch.aiFromX = bcx; patch.aiFromY = bcy;
                patch.aiTargetX = pcx + (lx / ll) * THOR_ORBIT_DIST;
                patch.aiTargetY = pcy + (ly / ll) * THOR_ORBIT_DIST;
                patch.bossBurstLeft = 0;
              };
              // 近接距離(社長指示「通常の近接攻撃距離」=MELEE_RADIUS)での接触+カウンター窓中かの判定に使う
              // 生の帯AABB(裏ボスの当たり判定と同基準・collisionUtils.tsのisHiddenBossTypeと同じ考え方)。
              const thorBodyOverlapNow = () => {
                const cp = useGameStore.getState().player;
                return {
                  overlap: rectsOverlap({ x: boss.x, y: boss.y, width: boss.width, height: boss.height }, { x: cp.x, y: cp.y, width: cp.width, height: cp.height }),
                  counterActive: Date.now() <= cp.counterWindowEnd,
                };
              };
              if (st === 'chase') {
                if (boss.type === 'thor') {
                  // 社長指示:「たまに2秒さらに1/2の速度で歩く」。クールダウンが明けたら新しい減速ウィンドウへ
                  // 突入(既に減速中は再抽選しない=毎フレーム延長し続けない)。
                  if (newGameTime >= (bs.thorNextSlowWalkAt ?? 0) && newGameTime >= (bs.thorSlowWalkUntil ?? 0)) {
                    bs.thorNextSlowWalkAt = newGameTime + THOR_SLOWWALK_MIN_INTERVAL_MS + Math.random() * (THOR_SLOWWALK_MAX_INTERVAL_MS - THOR_SLOWWALK_MIN_INTERVAL_MS);
                    bs.thorSlowWalkUntil = newGameTime + THOR_SLOWWALK_MS;
                  }
                  thorMove();
                } else {
                  moveToward(walkMult); // 気絶中は半速、通常は等速
                }
                const thorDistToTgt = boss.type === 'thor' ? Math.hypot(chaseTgt.x - bcx, chaseTgt.y - bcy) : 0;
                if (boss.type === 'thor' && bs.thorRangedHits.length >= THOR_JUMP_TRIGGER_HITS) {
                  // 遠距離からの連続被弾への対抗: 通常の間隔を待たず即ジャンプ攻撃で間合いを詰める(社長指示)。
                  bs.thorRangedHits = [];
                  patch.bossState = 'jump-windup';
                  patch.bossStateUntil = newGameTime + THOR_JUMP_WINDUP_MS;
                } else if (
                  boss.type === 'thor' &&
                  thorDistToTgt < THOR_ORBIT_DIST &&
                  newGameTime >= (bs.thorNextBackstepAt ?? 0)
                ) {
                  // 社長指示②: 「たまにバックステップで少し距離を取る」。近づかれている間、間隔を空けて発火。
                  bs.thorNextBackstepAt = newGameTime + THOR_BACKSTEP_MIN_INTERVAL_MS + Math.random() * (THOR_BACKSTEP_MAX_INTERVAL_MS - THOR_BACKSTEP_MIN_INTERVAL_MS);
                  const rx = bcx - chaseTgt.x, ry = bcy - chaseTgt.y;
                  const rl = Math.hypot(rx, ry) || 1;
                  patch.bossState = 'backstep';
                  patch.bossStateUntil = newGameTime + THOR_BACKSTEP_MS;
                  patch.aiFromX = bcx; patch.aiFromY = bcy;
                  patch.aiTargetX = bcx + (rx / rl) * THOR_BACKSTEP_DIST;
                  patch.aiTargetY = bcy + (ry / rl) * THOR_BACKSTEP_DIST;
                  bs.vx = 0; bs.vy = 0;
                } else if (
                  boss.type === 'thor' &&
                  thorDistToTgt >= THOR_ORBIT_DIST &&
                  thorDistToTgt <= THOR_ORBIT_DIST + THOR_ORBIT_APPROACH_SLACK &&
                  newGameTime >= (bs.thorNextOrbitStepAt ?? 0)
                ) {
                  // 社長指示: 旋回中(適正距離)にたまに接線方向へ少しだけ弾む「ステップ」を混ぜる(緩急)。
                  bs.thorNextOrbitStepAt = newGameTime + THOR_ORBIT_STEP_MIN_INTERVAL_MS + Math.random() * (THOR_ORBIT_STEP_MAX_INTERVAL_MS - THOR_ORBIT_STEP_MIN_INTERVAL_MS);
                  const dir = boss.bossCircleDir ?? 1;
                  const rux = (bcx - chaseTgt.x) / (thorDistToTgt || 1), ruy = (bcy - chaseTgt.y) / (thorDistToTgt || 1);
                  const tux = -ruy * dir, tuy = rux * dir; // 接線方向(thorOrbitMoveと同じ向き規則)
                  patch.bossState = 'orbit-step';
                  patch.bossStateUntil = newGameTime + THOR_ORBIT_STEP_MS;
                  patch.aiFromX = bcx; patch.aiFromY = bcy;
                  patch.aiTargetX = bcx + tux * THOR_ORBIT_STEP_DIST;
                  patch.aiTargetY = bcy + tuy * THOR_ORBIT_STEP_DIST;
                  bs.vx = 0; bs.vy = 0;
                } else if (boss.type === 'thor') {
                  if (newGameTime >= (boss.bossNextActionAt ?? 0)) {
                    // トール専用: 弾もダッシュも使わない独自3種(一閃/突き/払い)からランダムに選ぶ(社長指示)。
                    // 払いは旋回中(=近接距離+余白の範囲に居る)時だけ候補に入れる。
                    const dpx = chaseTgt.x - bcx, dpy = chaseTgt.y - bcy;
                    const isOrbiting = Math.hypot(dpx, dpy) <= THOR_ORBIT_DIST + THOR_ORBIT_APPROACH_SLACK;
                    const pool: Array<'issen' | 'tsuki' | 'harai'> = ['issen', 'tsuki'];
                    if (isOrbiting) pool.push('harai');
                    const pick = pool[Math.floor(Math.random() * pool.length)];
                    if (pick === 'issen') {
                      patch.bossState = 'issen-windup';
                      patch.bossStateUntil = newGameTime + THOR_ISSEN_WINDUP_MS;
                      // 社長修正指示: 溜め中はプレイヤーを追わない=方向は溜め開始の瞬間にロックする。
                      const ddx0 = pcx - bcx, ddy0 = pcy - bcy;
                      const ddl0 = Math.hypot(ddx0, ddy0) || 1;
                      patch.aiFromX = bcx; patch.aiFromY = bcy;
                      patch.aiTargetX = bcx + (ddx0 / ddl0) * THOR_ISSEN_RANGE;
                      patch.aiTargetY = bcy + (ddy0 / ddl0) * THOR_ISSEN_RANGE;
                    } else if (pick === 'tsuki') {
                      patch.bossState = 'tsuki-windup';
                      patch.bossStateUntil = newGameTime + THOR_TSUKI_WINDUP_MS;
                    } else {
                      // 払い: 溜め中は本体静止(社長指示・立ち止まる)。プレイヤー中心・現在の接線と
                      // 並行な赤ラインをロック。
                      patch.bossState = 'harai-windup';
                      patch.bossStateUntil = newGameTime + THOR_HARAI_WINDUP_MS;
                      const rx = bcx - pcx, ry = bcy - pcy;
                      const rl = Math.hypot(rx, ry) || 1;
                      const tx0 = -ry / rl, ty0 = rx / rl; // 接線(90度回転)の単位ベクトル
                      patch.aiFromX = pcx - tx0 * (THOR_HARAI_RANGE / 2);
                      patch.aiFromY = pcy - ty0 * (THOR_HARAI_RANGE / 2);
                      patch.aiTargetX = pcx + tx0 * (THOR_HARAI_RANGE / 2);
                      patch.aiTargetY = pcy + ty0 * (THOR_HARAI_RANGE / 2);
                    }
                  }
                } else if (newGameTime >= (boss.bossNextActionAt ?? 0)) {
                  // ミーミル専用: まずレーザー抽選。当たれば射撃方向(=今のプレイヤー位置)をロックして2秒溜め開始。
                  if (boss.type === 'mimir' && Math.random() < MIMIR_LASER_CHANCE) {
                    patch.bossState = 'laser-windup';
                    patch.bossStateUntil = newGameTime + MIMIR_LASER_WINDUP_MS;
                    patch.aiFromX = bcx; patch.aiFromY = bcy;       // ビーム原点(ロック)
                    patch.aiTargetX = pcx; patch.aiTargetY = pcy;   // 射撃方向(ロック=溜め開始時のプレイヤー)
                  } else if (boss.type === 'skadi' && Math.random() < SKADI_ATTACK_CHANCE) {
                    // スカジ専用の氷攻撃を「追加」抽選(氷塊バースト or 氷の刃)。
                    if (Math.random() < 0.5) { patch.bossState = 'skadi-ice'; patch.bossBurstLeft = SKADI_ICE_COUNT; patch.bossBurstNextAt = newGameTime; }
                    else { patch.bossState = 'skadi-blade'; patch.bossBurstLeft = SKADI_BLADE_COUNT; patch.bossBurstNextAt = newGameTime; }
                  } else {
                    const r = Math.random();
                    if (r < BOSS_DASH_CHANCE) { patch.bossState = 'dash-windup'; patch.bossStateUntil = newGameTime + BOSS_DASH_WINDUP_MS; }
                    else if (r < BOSS_DASH_CHANCE + (1 - BOSS_DASH_CHANCE) / 2) { patch.bossState = 'aim-burst'; patch.bossStateUntil = newGameTime + BOSS_AIM_BURST_MS; }
                    else { patch.bossState = 'aim-radial'; patch.bossStateUntil = newGameTime + BOSS_AIM_RADIAL_MS; }
                  }
                }
              } else if (st === 'aim-burst') {
                if (newGameTime >= (boss.bossStateUntil ?? 0)) {
                  patch.bossState = 'burst';
                  // ヨルムンガルド: 3発×5回。他の裏ボス: 従来の単発×3。
                  patch.bossBurstLeft = boss.type === 'jormungand' ? JORM_BURST_VOLLEYS : BOSS_BURST_SHOTS;
                  patch.bossBurstNextAt = newGameTime;
                }
              } else if (st === 'burst') {
                const left = boss.bossBurstLeft ?? 0;
                if (left > 0 && newGameTime >= (boss.bossBurstNextAt ?? 0)) {
                  if (boss.type === 'jormungand') {
                    // 1回=プレイヤー狙いの軽い3-way扇(計3発)。毎回の狙いは現在のプレイヤーへ。
                    const ang = Math.atan2(pcy - bcy, pcx - bcx);
                    for (let k = -1; k <= 1; k++) {
                      const a = ang + k * JORM_BURST_FAN_SPREAD;
                      fireBullet(bcx + Math.cos(a) * 100, bcy + Math.sin(a) * 100);
                    }
                  } else {
                    fireBullet(pcx, pcy);
                  }
                  patch.bossBurstLeft = left - 1;
                  patch.bossBurstNextAt = newGameTime + (boss.type === 'jormungand' ? JORM_BURST_GAP_MS : BOSS_BURST_GAP_MS);
                  if (left - 1 <= 0) { patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(); }
                }
              } else if (st === 'aim-radial') {
                if (newGameTime >= (boss.bossStateUntil ?? 0)) {
                  if (boss.type === 'jormungand') {
                    // ヨルムンガルド: 全方位16発を0.3秒おきに8回。繰り返しは 'radial' 状態で回す。
                    patch.bossState = 'radial';
                    patch.bossBurstLeft = JORM_RADIAL_VOLLEYS;
                    patch.bossBurstNextAt = newGameTime;
                  } else {
                    for (let i = 0; i < BOSS_RADIAL_COUNT; i++) {
                      const a = (Math.PI * 2 * i) / BOSS_RADIAL_COUNT;
                      fireBullet(bcx + Math.cos(a) * 100, bcy + Math.sin(a) * 100);
                    }
                    patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay();
                  }
                }
              } else if (st === 'radial') {
                // ヨルムンガルド専用: 16発の全方位を JORM_RADIAL_GAP_MS おきに JORM_RADIAL_VOLLEYS 回。
                // 各回ごとに時計回りへ JORM_RADIAL_SPIN だけずらして螺旋状に撃つ(社長指示)。
                const left = boss.bossBurstLeft ?? 0;
                if (left > 0 && newGameTime >= (boss.bossBurstNextAt ?? 0)) {
                  const vi = JORM_RADIAL_VOLLEYS - left; // 0始まりの回数インデックス
                  for (let i = 0; i < BOSS_RADIAL_COUNT; i++) {
                    const a = (Math.PI * 2 * i) / BOSS_RADIAL_COUNT + vi * JORM_RADIAL_SPIN; // 時計回り(画面y下)へ加算
                    fireBullet(bcx + Math.cos(a) * 100, bcy + Math.sin(a) * 100);
                  }
                  patch.bossBurstLeft = left - 1;
                  patch.bossBurstNextAt = newGameTime + JORM_RADIAL_GAP_MS;
                  if (left - 1 <= 0) { patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(); }
                }
              } else if (st === 'skadi-ice') {
                // スカジ: プレイヤー足元へ氷塊マーカーを SKADI_ICE_GAP_MS おきに SKADI_ICE_COUNT 個設置。
                // 各マーカーは設置位置に固定で2秒テレグラフ後に起爆(動けば避けられる)。
                const left = boss.bossBurstLeft ?? 0;
                if (left > 0 && newGameTime >= (boss.bossBurstNextAt ?? 0)) {
                  useGameStore.getState().spawnSkadiIce(pcx, pcy, newGameTime, newGameTime + SKADI_ICE_TELEGRAPH_MS, boss.id);
                  patch.bossBurstLeft = left - 1;
                  patch.bossBurstNextAt = newGameTime + SKADI_ICE_GAP_MS;
                  if (left - 1 <= 0) { patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(); }
                }
              } else if (st === 'skadi-blade') {
                // スカジ: プレイヤー周辺ランダム位置に、設置時のプレイヤー方向を向いた氷刃を
                // SKADI_BLADE_GAP_MS おきに SKADI_BLADE_COUNT 個設置。各刃は設置1秒後にその向きへ高速発射。
                const left = boss.bossBurstLeft ?? 0;
                if (left > 0 && newGameTime >= (boss.bossBurstNextAt ?? 0)) {
                  const a0 = Math.random() * Math.PI * 2;
                  const dist = SKADI_BLADE_RING_MIN + Math.random() * (SKADI_BLADE_RING_MAX - SKADI_BLADE_RING_MIN);
                  const sx = pcx + Math.cos(a0) * dist, sy = pcy + Math.sin(a0) * dist;
                  const aim = Math.atan2(pcy - sy, pcx - sx); // 設置時のプレイヤー方向(以後固定)
                  useGameStore.getState().spawnSkadiBlade(sx, sy, aim, newGameTime + SKADI_BLADE_DELAY_MS, boss.id);
                  patch.bossBurstLeft = left - 1;
                  patch.bossBurstNextAt = newGameTime + SKADI_BLADE_GAP_MS;
                  if (left - 1 <= 0) { patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(); }
                }
              } else if (st === 'laser-windup') {
                // ミーミル: 3秒溜め(静止)。方向はロック(追尾しない)。赤ライン予告は描画側が bossState で出す。
                if (newGameTime >= (boss.bossStateUntil ?? 0)) {
                  patch.bossState = 'laser-fire';
                  patch.bossStateUntil = newGameTime + MIMIR_LASER_FIRE_MS;
                  playSfx('heavy-impact'); // レーザー発射音(使い回し)
                  useGameStore.getState().triggerShake(MIMIR_LASER_FIRE_MS, MIMIR_LASER_SHAKE_MAG); // 発射中ずっと揺れる
                }
              } else if (st === 'laser-fire') {
                // 発射中: ビームがゆっくりプレイヤーを追尾(注視点 aiTarget を現在のプレイヤーへ低速 lerp=避けられる)。
                // ビーム帯(線分±半太さ)に居れば継続ダメージ(damagePlayer が i-frame で間引く)。
                const k = Math.min(1, MIMIR_LASER_AIM_TRACK * deltaTime);
                const nax = (boss.aiTargetX ?? pcx) + (pcx - (boss.aiTargetX ?? pcx)) * k;
                const nay = (boss.aiTargetY ?? pcy) + (pcy - (boss.aiTargetY ?? pcy)) * k;
                patch.aiTargetX = nax; patch.aiTargetY = nay;
                let ux = nax - bcx, uy = nay - bcy;
                const ul = Math.hypot(ux, uy) || 1; ux /= ul; uy /= ul;
                const ppx = player.x + player.width / 2, ppy = player.y + player.height / 2;
                const tproj = Math.max(0, Math.min(MIMIR_LASER_RANGE, (ppx - bcx) * ux + (ppy - bcy) * uy));
                const cxp = bcx + ux * tproj, cyp = bcy + uy * tproj;
                const pr = Math.max(player.width, player.height) / 2;
                if (Math.hypot(ppx - cxp, ppy - cyp) <= MIMIR_LASER_HALF_WIDTH + pr) {
                  const died = damagePlayer(MIMIR_LASER_DAMAGE, 'ミーミルのレーザー', cxp, cyp);
                  if (died) triggerPlayerDeath(ppx, ppy);
                }
                if (newGameTime >= (boss.bossStateUntil ?? 0)) { patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(); }
              } else if (st === 'dash-windup') {
                // 溜め中はゆっくり後退り(ターゲットから離れる)してから突進(社長指示)。
                {
                  const bdx = bcx - chaseTgt.x, bdy = bcy - chaseTgt.y;
                  const bl = Math.hypot(bdx, bdy) || 1;
                  const back = speed * BOSS_DASH_BACKSTEP_MULT * bossMoveDt;
                  patch.x = boss.x + (bdx / bl) * back; patch.y = boss.y + (bdy / bl) * back;
                }
                if (newGameTime >= (boss.bossStateUntil ?? 0)) {
                  patch.bossState = 'dash'; patch.bossStateUntil = newGameTime + BOSS_DASH_MS;
                  // 突進開始時に方向をロック(その時のターゲットへ)。以後は基本直進+弱いホーミング。
                  const ddx = chaseTgt.x - bcx, ddy = chaseTgt.y - bcy;
                  const ddl = Math.hypot(ddx, ddy) || 1;
                  bs.dashDirX = ddx / ddl; bs.dashDirY = ddy / ddl;
                }
              } else if (st === 'dash') {
                // ダッシュ攻撃: 基本は真っ直ぐ直進。毎フレームほんの少しだけプレイヤー方向へ寄せる(弱いホーミング)。
                const tdx = chaseTgt.x - bcx, tdy = chaseTgt.y - bcy;
                const tl = Math.hypot(tdx, tdy) || 1;
                const dx = bs.dashDirX + (tdx / tl) * BOSS_DASH_HOMING;
                const dy = bs.dashDirY + (tdy / tl) * BOSS_DASH_HOMING;
                const dnl = Math.hypot(dx, dy) || 1;
                bs.dashDirX = dx / dnl; bs.dashDirY = dy / dnl; // 向きを少しずつ更新(累積で緩く曲がる)
                const mv = speed * BOSS_DASH_SPEED_MULT * bossMoveDt;
                patch.x = boss.x + bs.dashDirX * mv; patch.y = boss.y + bs.dashDirY * mv;
                bs.vx = bs.dashDirX * speed * BOSS_DASH_SPEED_MULT; // 突進後のチェイスへ慣性を引き継ぐ
                bs.vy = bs.dashDirY * speed * BOSS_DASH_SPEED_MULT;
                if (newGameTime >= (boss.bossStateUntil ?? 0)) { patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(); }
              } else if (st === 'issen-windup') {
                // 一閃: 3秒溜め・静止(赤い明滅は描画側=pixiSceneがbossStateを見て演出・社長指示)。
                // 方向は選択時(action-roll)に既にロック済み=溜め中はプレイヤーを追わない(社長修正指示)。
                const { overlap, counterActive } = thorBodyOverlapNow();
                if (overlap && counterActive) {
                  thorCounterHit(bcx, bcy);
                } else if (newGameTime >= (boss.bossStateUntil ?? 0)) {
                  patch.bossState = 'issen-dash';
                  patch.bossStateUntil = newGameTime + THOR_ISSEN_DASH_MS;
                }
              } else if (st === 'issen-dash') {
                // 一閃(高速移動): 終着点まで直進。当たり判定=もとの帯ではなく、この赤いライン上のみ(社長指示)。
                const fx = boss.aiFromX ?? bcx, fy = boss.aiFromY ?? bcy;
                const tx = boss.aiTargetX ?? bcx, ty = boss.aiTargetY ?? bcy;
                const t = Math.max(0, Math.min(1, 1 - ((boss.bossStateUntil ?? newGameTime) - newGameTime) / THOR_ISSEN_DASH_MS));
                patch.x = (fx + (tx - fx) * t) - boss.width / 2;
                patch.y = (fy + (ty - fy) * t) - boss.height / 2;
                let lux = tx - fx, luy = ty - fy;
                const lul = Math.hypot(lux, luy) || 1; lux /= lul; luy /= lul;
                const lineLen = Math.hypot(tx - fx, ty - fy);
                const tproj = Math.max(0, Math.min(lineLen, (pcx - fx) * lux + (pcy - fy) * luy));
                const cxp = fx + lux * tproj, cyp = fy + luy * tproj;
                const pr = Math.max(player.width, player.height) / 2;
                let countered = false;
                if (Math.hypot(pcx - cxp, pcy - cyp) <= THOR_ISSEN_HALF_WIDTH + pr) {
                  const cp = useGameStore.getState().player;
                  if (Date.now() <= cp.counterWindowEnd) {
                    thorCounterHit(cxp, cyp);
                    countered = true;
                  } else {
                    const died = damagePlayer(boss.damage, 'トールの一閃', cxp, cyp);
                    useGameStore.getState().spawnImageMark(cxp, cyp, 'zan', { scale: 1.0, duration: 1000 }); // 社長指示: 食らうと「斬」
                    if (died) triggerPlayerDeath(pcx, pcy);
                  }
                }
                if (!countered && newGameTime >= (boss.bossStateUntil ?? 0)) { patch.bossState = 'chase'; patch.bossNextActionAt = thorNextActionDelay(); }
              } else if (st === 'tsuki-windup') {
                // 突き: 1秒停止(社長指示)。線の予告は無し=素早い踏み込みそのものが合図。
                const { overlap, counterActive } = thorBodyOverlapNow();
                if (overlap && counterActive) {
                  thorCounterHit(bcx, bcy);
                } else if (newGameTime >= (boss.bossStateUntil ?? 0)) {
                  patch.bossState = 'tsuki';
                  patch.bossStateUntil = newGameTime + THOR_TSUKI_MS;
                  const ddx = pcx - bcx, ddy = pcy - bcy;
                  const ddl = Math.hypot(ddx, ddy) || 1;
                  patch.aiFromX = bcx; patch.aiFromY = bcy;
                  patch.aiTargetX = bcx + (ddx / ddl) * THOR_TSUKI_RANGE;
                  patch.aiTargetY = bcy + (ddy / ddl) * THOR_TSUKI_RANGE;
                  playSfx('thor-thrust');
                }
              } else if (st === 'tsuki') {
                // 突き(実行): 本体は動かず、ダッシュと同じ射程・幅(半分の幅)で武器の間合いだけが伸びる
                // (社長修正指示:「突っ込んでこないで。突くだけ」=harai同様に本体静止)。
                const fx = boss.aiFromX ?? bcx, fy = boss.aiFromY ?? bcy;
                const tx = boss.aiTargetX ?? bcx, ty = boss.aiTargetY ?? bcy;
                let lux = tx - fx, luy = ty - fy;
                const lul = Math.hypot(lux, luy) || 1; lux /= lul; luy /= lul;
                const lineLen = Math.hypot(tx - fx, ty - fy);
                const tproj = Math.max(0, Math.min(lineLen, (pcx - fx) * lux + (pcy - fy) * luy));
                const cxp = fx + lux * tproj, cyp = fy + luy * tproj;
                const pr = Math.max(player.width, player.height) / 2;
                let countered = false;
                if (Math.hypot(pcx - cxp, pcy - cyp) <= THOR_TSUKI_HALF_WIDTH + pr) {
                  const cp = useGameStore.getState().player;
                  if (Date.now() <= cp.counterWindowEnd) {
                    thorCounterHit(cxp, cyp);
                    countered = true;
                  } else {
                    const died = damagePlayer(boss.damage, 'トールの突き', cxp, cyp);
                    if (died) triggerPlayerDeath(pcx, pcy);
                  }
                }
                if (!countered && newGameTime >= (boss.bossStateUntil ?? 0)) { patch.bossState = 'chase'; patch.bossNextActionAt = thorNextActionDelay(); }
              } else if (st === 'harai-windup') {
                // 払い: 溜め中は本体静止(社長指示・立ち止まる)。ロック済みの並行ラインを予告表示(描画側)。
                const { overlap, counterActive } = thorBodyOverlapNow();
                if (overlap && counterActive) {
                  thorCounterHit(bcx, bcy);
                } else if (newGameTime >= (boss.bossStateUntil ?? 0)) {
                  patch.bossState = 'harai';
                  patch.bossStateUntil = newGameTime + THOR_HARAI_ACTIVE_MS;
                  playSfx('thor-sweep');
                }
              } else if (st === 'harai') {
                // 払い(実行): ロック済みの並行ライン上のみ判定(社長指示)。本体は移動しない(線=間合いの表現)。
                const fx = boss.aiFromX ?? bcx, fy = boss.aiFromY ?? bcy;
                const tx = boss.aiTargetX ?? bcx, ty = boss.aiTargetY ?? bcy;
                let lux = tx - fx, luy = ty - fy;
                const lul = Math.hypot(lux, luy) || 1; lux /= lul; luy /= lul;
                const lineLen = Math.hypot(tx - fx, ty - fy);
                const tproj = Math.max(0, Math.min(lineLen, (pcx - fx) * lux + (pcy - fy) * luy));
                const cxp = fx + lux * tproj, cyp = fy + luy * tproj;
                const pr = Math.max(player.width, player.height) / 2;
                let countered = false;
                if (Math.hypot(pcx - cxp, pcy - cyp) <= THOR_HARAI_HALF_WIDTH + pr) {
                  const cp = useGameStore.getState().player;
                  if (Date.now() <= cp.counterWindowEnd) {
                    thorCounterHit(cxp, cyp);
                    countered = true;
                  } else {
                    const died = damagePlayer(boss.damage, 'トールの払い', cxp, cyp);
                    if (died) triggerPlayerDeath(pcx, pcy);
                  }
                }
                if (!countered && newGameTime >= (boss.bossStateUntil ?? 0)) {
                  patch.bossState = 'chase';
                  patch.bossNextActionAt = thorNextActionDelay();
                  patch.bossCircleDir = 1; // 払い後は既定の時計回りへ復帰(社長指示)
                }
              } else if (st === 'jump-windup') {
                // ジャンプ攻撃の溜め(短め)。静止・カウンター可能(社長指示)。
                const { overlap, counterActive } = thorBodyOverlapNow();
                if (overlap && counterActive) {
                  thorCounterHit(bcx, bcy);
                } else if (newGameTime >= (boss.bossStateUntil ?? 0)) {
                  patch.bossState = 'jump-attack';
                  patch.bossStateUntil = newGameTime + THOR_JUMP_MS;
                  patch.aiFromX = bcx; patch.aiFromY = bcy;
                  patch.aiTargetX = pcx; patch.aiTargetY = pcy; // 着地点=溜め終了時のプレイヤー位置(ロック)
                }
              } else if (st === 'jump-attack') {
                // ジャンプ攻撃(実行): ハンターの速いジャンプ感でロック済みの着地点まで移動(社長指示)。
                const fx = boss.aiFromX ?? bcx, fy = boss.aiFromY ?? bcy;
                const tx = boss.aiTargetX ?? bcx, ty = boss.aiTargetY ?? bcy;
                const t = Math.max(0, Math.min(1, 1 - ((boss.bossStateUntil ?? newGameTime) - newGameTime) / THOR_JUMP_MS));
                patch.x = (fx + (tx - fx) * t) - boss.width / 2;
                patch.y = (fy + (ty - fy) * t) - boss.height / 2;
                if (newGameTime >= (boss.bossStateUntil ?? 0)) {
                  // 着地: 既存のpumpkinBlasts(着地爆発)パイプラインへ積む=カウンター/被弾処理を丸ごと再利用。
                  useGameStore.setState(state => ({
                    pumpkinBlasts: [...state.pumpkinBlasts, { x: tx, y: ty, radius: THOR_JUMP_RADIUS, damage: boss.damage, enemyId: boss.id }],
                  }));
                  patch.bossState = 'jump-recover';
                  patch.bossStateUntil = newGameTime + THOR_JUMP_RECOVER_MS;
                }
              } else if (st === 'jump-recover') {
                // 着地後の硬直。静止・カウンター可能。
                const { overlap, counterActive } = thorBodyOverlapNow();
                if (overlap && counterActive) {
                  thorCounterHit(bcx, bcy);
                } else if (newGameTime >= (boss.bossStateUntil ?? 0)) {
                  patch.bossState = 'chase';
                  patch.bossNextActionAt = thorNextActionDelay();
                }
              } else if (st === 'counter-leap') {
                // カウンター成立後、近接距離ギリギリ外までロック済みの後退先へ高速移動(社長指示)。
                const fx = boss.aiFromX ?? bcx, fy = boss.aiFromY ?? bcy;
                const tx = boss.aiTargetX ?? bcx, ty = boss.aiTargetY ?? bcy;
                const t = Math.max(0, Math.min(1, 1 - ((boss.bossStateUntil ?? newGameTime) - newGameTime) / THOR_COUNTER_LEAP_MS));
                patch.x = (fx + (tx - fx) * t) - boss.width / 2;
                patch.y = (fy + (ty - fy) * t) - boss.height / 2;
                bs.vx = 0; bs.vy = 0;
                if (newGameTime >= (boss.bossStateUntil ?? 0)) {
                  patch.bossState = 'chase';
                  patch.bossNextActionAt = thorNextActionDelay();
                }
              } else if (st === 'backstep') {
                // バックステップ: ロック済みの後方target地点へ短時間で移動(社長指示②「たまにバックステップで少し距離」)。
                // 攻撃サイクルとは独立の movement flourish なので bossNextActionAt はリセットしない
                // (既にスケジュール済みの次攻撃タイミングをそのまま維持=移動演出で攻撃頻度が変わらない)。
                const fx = boss.aiFromX ?? bcx, fy = boss.aiFromY ?? bcy;
                const tx = boss.aiTargetX ?? bcx, ty = boss.aiTargetY ?? bcy;
                const t = Math.max(0, Math.min(1, 1 - ((boss.bossStateUntil ?? newGameTime) - newGameTime) / THOR_BACKSTEP_MS));
                patch.x = (fx + (tx - fx) * t) - boss.width / 2;
                patch.y = (fy + (ty - fy) * t) - boss.height / 2;
                bs.vx = 0; bs.vy = 0;
                if (newGameTime >= (boss.bossStateUntil ?? 0)) {
                  patch.bossState = 'chase';
                }
              } else if (st === 'orbit-step') {
                // 旋回中のステップ: ロック済みの接線方向target地点へ短時間で移動(社長指示「たまに再度ステップで少し移動」)。
                const fx = boss.aiFromX ?? bcx, fy = boss.aiFromY ?? bcy;
                const tx = boss.aiTargetX ?? bcx, ty = boss.aiTargetY ?? bcy;
                const t = Math.max(0, Math.min(1, 1 - ((boss.bossStateUntil ?? newGameTime) - newGameTime) / THOR_ORBIT_STEP_MS));
                patch.x = (fx + (tx - fx) * t) - boss.width / 2;
                patch.y = (fy + (ty - fy) * t) - boss.height / 2;
                bs.vx = 0; bs.vy = 0;
                if (newGameTime >= (boss.bossStateUntil ?? 0)) {
                  patch.bossState = 'chase';
                }
              }
              } // end !frozen
            }

            // 裏ボスが障害物(木/街・雪プロップ)に触れたら破壊=消す(社長指示「ぶつかった時だけ消えるだけ」)。
            // ボスの当たり判定(帯AABB)の近傍だけ走査=有界。手続き生成なので破壊キーSetに入れるだけで描画も判定も同時に消える。
            // 生成関数は破壊済みキーを欠番にするので、ここに返る物は必ず「未破壊」=毎ヒットが新規破壊。
            // 爆破FX/SE/シェイクは使い回し(グレネード同系)を「スロットル」で間引いて発火(森突っ切りでも積み上げない)。
            if (!despawn) {
              const bx = patch.x ?? boss.x, by = patch.y ?? boss.y;
              const bAABB = { x: bx, y: by, width: boss.width, height: boss.height };
              const PAD = 48;
              let crushed = false, cxFx = 0, cyFx = 0;
              for (const t of treesInRegion(bx - PAD, by - PAD, bx + boss.width + PAD, by + boss.height + PAD)) {
                if (rectsOverlap(bAABB, trunkRect(t))) { markObstacleDestroyed(t.key); crushed = true; cxFx = t.footX; cyFx = t.footY; }
              }
              const farKey = useGameStore.getState().farBackdrop;
              for (const p of cityPropsInRegion(farKey, bx - PAD, by - PAD, bx + boss.width + PAD, by + boss.height + PAD)) {
                const r = cityPropRect(farKey, p);
                if (r && rectsOverlap(bAABB, r)) { markObstacleDestroyed(p.id); crushed = true; cxFx = p.footX; cyFx = p.footY; }
              }
              if (crushed && newGameTime - bs.lastCrushFxAt >= BOSS_CRUSH_FX_MS) {
                bs.lastCrushFxAt = newGameTime;
                spawnBurst(cxFx, cyFx, '#fbbf24', 6);                                   // 木片/破片(使い回し)
                spawnRing(cxFx, cyFx, 6, 40, 'rgba(251,146,60,0.86)', 3, 300);          // 衝撃リング(使い回し)
                useGameStore.getState().spawnGlow(cxFx, cyFx, 44, 'rgba(251,146,60,', 340); // 火光(プール済みスプライト=軽い)
                playSfx('bomb');                                                        // 爆破SE(使い回し)
                useGameStore.getState().triggerShake(BOSS_CRUSH_SHAKE_MS, BOSS_CRUSH_SHAKE_MAG); // 少し揺れる
              }
            }

            if (despawn) {
              ENEMY_REMOVE_CAUSE.set(boss.id, 'bossGone'); // 消失ログ用: 裏ボス退場(帰巣完了/深層離脱)
              useGameStore.setState({ enemies: useGameStore.getState().enemies.filter(e => e.id !== boss.id), bossChasing: false });
              bs.bossId = null; bs.spawned = false; bs.retreating = false;
            } else {
              if (Object.keys(patch).length) {
                useGameStore.setState(stt => ({ enemies: stt.enemies.map(e => e.id === boss.id ? { ...e, ...patch } : e) }));
              }
              if (useGameStore.getState().bossChasing !== chasing) useGameStore.setState({ bossChasing: chasing });
            }
          }
         } catch (err) {
          if (!bossCtrlErrLogged) { bossCtrlErrLogged = true; console.error('[hiddenBoss] controller error (suppressed after first):', err); }
         }
        }

        // --- ミゲル(ゲート2ボス・§5.21-追補8)専用ミニコントローラ ---
        // stage の hiddenBoss 設定(mimir/thor等)とは独立: ゲート2は fromEvent 経由で直接 addEnemy
        // 済みなので、上のブロック(bs.bossId による単一種の巣/帰巣/深層域退場ロジック)には乗せず、
        // 別の敵個体(miguel)を専用に見つけて動かす小さな兄弟ブロックとして実装する(社長「hiddenBoss
        // 未設定のステージでもゲート2ボスは動く必要がある」= hiddenBossが無い/別種でも独立して動く)。
        // 仕様: ゲート枠内側を反時計回り(CCW)に周回。プレイヤー追尾はしない。攻撃(横払いharai)中は
        // 静止。近接被弾で1秒間だけ周回速度2倍。攻撃選択pool=当面harai(狭)のみ(トールのharaiを流用)。
        if (!danceTest && !indoor && !labTheme && !useGameStore.getState().gameWon) {
         try {
          const miguel = useGameStore.getState().enemies.find(e => e.type === 'miguel' && e.bossState != null);
          if (miguel) {
            const pcx = player.x + player.width / 2, pcy = player.y + player.height / 2;
            const mcx = miguel.x + miguel.width / 2, mcy = miguel.y + miguel.height / 2;
            const bossMoveDt = deltaTime * MOVE_SPEED_MULT; // 通常敵と同じ移動テンポ(社長指示の裏ボス共通則)
            const mHomeX = miguel.homeX ?? mcx, mHomeY = miguel.homeY ?? mcy;
            const st = miguel.bossState ?? 'chase';
            const patch: Partial<typeof miguel> = {};

            // 「移動中、たまにゆっくり歩く」(仕様指示・トールのSLOWWALKと同型)。周回中(chase)のみ
            // ランダム間隔で減速ウィンドウを開始する。攻撃中は元々静止するため無関係。
            if (miguelSlowRef.current.nextAt === 0) {
              miguelSlowRef.current.nextAt = newGameTime + MIGUEL_SLOW_WALK_MIN_GAP_MS + Math.random() * (MIGUEL_SLOW_WALK_MAX_GAP_MS - MIGUEL_SLOW_WALK_MIN_GAP_MS);
            }
            if (st === 'chase' && newGameTime >= miguelSlowRef.current.nextAt) {
              miguelSlowRef.current.slowUntil = newGameTime + MIGUEL_SLOW_WALK_MS;
              miguelSlowRef.current.nextAt = newGameTime + MIGUEL_SLOW_WALK_MIN_GAP_MS + Math.random() * (MIGUEL_SLOW_WALK_MAX_GAP_MS - MIGUEL_SLOW_WALK_MIN_GAP_MS);
            }
            const slowWalkActive = newGameTime < miguelSlowRef.current.slowUntil;

            // 近接被弾で1秒間だけ周回速度2倍(仕様指示)。gun/爆発では発動しない
            // (meleeHitAt は gameStore.ts の近接ダメージ経路だけがスタンプする)。
            const meleeDashActive = newGameTime - (miguel.meleeHitAt ?? -Infinity) <= MIGUEL_MELEE_DASH_MS;
            const orbitSpeedMult = (meleeDashActive ? MIGUEL_MELEE_DASH_MULT : 1) * (slowWalkActive ? MIGUEL_SLOW_WALK_MULT : 1);
            // 周回半径=ゲート内側ギリギリ。halfSize=足元帯(判定)の高さ半分をクリアランスに使う。
            const halfSize = miguel.height / 2;
            const orbitRadius = GATE_ARENA_RADIUS - MIGUEL_ORBIT_MARGIN - halfSize;

            // 旋回運動(トールのthorOrbitMove相当だが、プレイヤーではなく固定の home 中心を回る・CCW固定)。
            const miguelOrbitMove = () => {
              const relX = mcx - mHomeX, relY = mcy - mHomeY;
              const curDist = Math.hypot(relX, relY) || 1;
              const curAngle = Math.atan2(relY, relX);
              const angularSpeed = (MIGUEL_ORBIT_SPEED * orbitSpeedMult) / orbitRadius;
              // Y-down画面座標では角度増加=視覚的に時計回り(トールの規約と同じ)。CCW=角度を減らす向き。
              const newAngle = curAngle - angularSpeed * bossMoveDt;
              const correctedDist = curDist + (orbitRadius - curDist) * Math.min(1, THOR_ORBIT_RADIUS_CORRECT * bossMoveDt);
              const ncx = mHomeX + Math.cos(newAngle) * correctedDist;
              const ncy = mHomeY + Math.sin(newAngle) * correctedDist;
              patch.x = ncx - miguel.width / 2;
              patch.y = ncy - miguel.height / 2;
            };

            // 次の攻撃選択までの間隔(叩き台=トールと同じ間隔レンジを流用・仕様指示)。
            const miguelNextActionDelay = () => newGameTime + THOR_ACTION_MIN_MS + Math.random() * (THOR_ACTION_MAX_MS - THOR_ACTION_MIN_MS);

            // カウンター成立時の共通処理(thorCounterHit相当を流用・仕様指示)。
            const miguelCounterHit = (hitX: number, hitY: number) => {
              const cp = useGameStore.getState().player;
              const pnow = Date.now();
              addMeleeFinishCombo(1);
              playSfx('counter');
              useGameStore.getState().spawnGlow(hitX, hitY, 95, 'rgba(56,189,248,', 360);
              useGameStore.getState().triggerHitImpact(COUNTER_HITSTOP_MS, COUNTER_SHAKE_MS, COUNTER_SHAKE_MAG, COUNTER_ZOOM_MAG);
              useGameStore.getState().markMeleeSwingFx();
              spawnRing(hitX, hitY, 14, 135, 'rgba(56,189,248,0.9)', 3, 360);
              spawnBurst(hitX, hitY, '#38bdf8', 14);
              useGameStore.getState().spawnCallout(hitX, hitY - 12, 'Counter!', '#e0f2ff', { bg: 0x2563eb, holdMs: MELEE_FINISH_SLOW_HOLD_MS, duration: MELEE_FINISH_SLOW_MS });
              useGameStore.setState(stt => ({ player: { ...stt.player, invulnerable: true, invulnerableTime: pnow, lastCounterSuccessTime: pnow } }));
              const counterBase = getActiveGun(cp)?.damage ?? 12;
              const critMult = skillCritMult(cp, BOSS_CRIT_DAMAGE_MULT);
              const dmg = Math.max(1, Math.round(counterBase * critMult * skillOutgoingDamageMult(cp) * (cp.equipBonus?.damageMult ?? 1)));
              damageEnemy(miguel.id, dmg, false, true);
              spawnDamageNumber(mcx, miguel.y, dmg, true);
              playSfx('headshot');
              spawnRing(hitX, hitY, 8, 46, 'rgba(253,224,71,0.95)', 3, 300);
              spawnBurst(hitX, hitY, '#fde047', 10);
              useGameStore.getState().spawnGlow(hitX, hitY, 34, 'rgba(253,224,71,', 240);
              const lx = mcx - pcx, ly = mcy - pcy;
              const ll = Math.hypot(lx, ly) || 1;
              patch.bossState = 'counter-leap';
              patch.bossStateUntil = newGameTime + THOR_COUNTER_LEAP_MS;
              patch.aiFromX = mcx; patch.aiFromY = mcy;
              patch.aiTargetX = pcx + (lx / ll) * orbitRadius;
              patch.aiTargetY = pcy + (ly / ll) * orbitRadius;
            };

            const miguelBodyOverlapNow = () => {
              const cp = useGameStore.getState().player;
              return {
                overlap: rectsOverlap({ x: miguel.x, y: miguel.y, width: miguel.width, height: miguel.height }, { x: cp.x, y: cp.y, width: cp.width, height: cp.height }),
                counterActive: Date.now() <= cp.counterWindowEnd,
              };
            };

            if (st === 'chase') {
              miguelOrbitMove(); // 攻撃中(windup/active)は呼ばない=立ち止まる(仕様指示)
              if (newGameTime >= (miguel.bossNextActionAt ?? 0)) {
                // 攻撃選択pool=当面harai(狭)のみ(仕様指示。攻撃2以降は追って追加)。
                patch.bossState = 'harai-windup';
                patch.bossStateUntil = newGameTime + MIGUEL_HARAI_WINDUP_MS;
                // プレイヤー中心・現在の接線と並行な赤ラインをロック(トールのharaiと同じ方式)。
                const rx = mcx - pcx, ry = mcy - pcy;
                const rl = Math.hypot(rx, ry) || 1;
                const tx0 = -ry / rl, ty0 = rx / rl;
                patch.aiFromX = pcx - tx0 * (MIGUEL_HARAI_RANGE / 2);
                patch.aiFromY = pcy - ty0 * (MIGUEL_HARAI_RANGE / 2);
                patch.aiTargetX = pcx + tx0 * (MIGUEL_HARAI_RANGE / 2);
                patch.aiTargetY = pcy + ty0 * (MIGUEL_HARAI_RANGE / 2);
              }
            } else if (st === 'harai-windup') {
              // 払い: 溜め中は本体静止(仕様指示)。カウンター可能。
              const { overlap, counterActive } = miguelBodyOverlapNow();
              if (overlap && counterActive) {
                miguelCounterHit(mcx, mcy);
              } else if (newGameTime >= (miguel.bossStateUntil ?? 0)) {
                patch.bossState = 'harai';
                patch.bossStateUntil = newGameTime + MIGUEL_HARAI_ACTIVE_MS;
                playSfx('thor-sweep');
              }
            } else if (st === 'harai' || st === 'tate') {
              // 払い/縦払い(実行): ロック済みのライン上のみ判定(トールと同じ点-線分距離判定)。
              // 横(harai)と縦(tate)はラインの向きが違うだけで当たり判定コードは共通(orientation非依存)。
              const fx = miguel.aiFromX ?? mcx, fy = miguel.aiFromY ?? mcy;
              const tx = miguel.aiTargetX ?? mcx, ty = miguel.aiTargetY ?? mcy;
              let lux = tx - fx, luy = ty - fy;
              const lul = Math.hypot(lux, luy) || 1; lux /= lul; luy /= lul;
              const lineLen = Math.hypot(tx - fx, ty - fy);
              const tproj = Math.max(0, Math.min(lineLen, (pcx - fx) * lux + (pcy - fy) * luy));
              const cxp = fx + lux * tproj, cyp = fy + luy * tproj;
              const pr = Math.max(player.width, player.height) / 2;
              let countered = false;
              if (Math.hypot(pcx - cxp, pcy - cyp) <= MIGUEL_HARAI_HALF_WIDTH + pr) {
                const cp = useGameStore.getState().player;
                if (Date.now() <= cp.counterWindowEnd) {
                  miguelCounterHit(cxp, cyp);
                  countered = true;
                } else {
                  const died = damagePlayer(miguel.damage, st === 'harai' ? 'ミゲルの払い' : 'ミゲルの縦払い', cxp, cyp);
                  if (died) triggerPlayerDeath(pcx, pcy);
                }
              }
              if (!countered && newGameTime >= (miguel.bossStateUntil ?? 0)) {
                if (st === 'harai') {
                  // 横払いが終わった瞬間に直接 tate へ(社長のタイミング訂正: 別の1秒溜めを挟まず、
                  // 共有の1回の溜めから計2発。ここでプレイヤー中心の縦ラインをその時点でロックする)。
                  patch.bossState = 'tate';
                  patch.bossStateUntil = newGameTime + MIGUEL_HARAI_ACTIVE_MS;
                  patch.aiFromX = pcx;
                  patch.aiFromY = pcy - MIGUEL_HARAI_RANGE / 2;
                  patch.aiTargetX = pcx;
                  patch.aiTargetY = pcy + MIGUEL_HARAI_RANGE / 2;
                  playSfx('thor-sweep');
                } else {
                  patch.bossState = 'chase';
                  patch.bossNextActionAt = miguelNextActionDelay();
                }
              }
            } else if (st === 'counter-leap') {
              // カウンター成立後、近接距離ギリギリ外までロック済みの後退先へ高速移動(トールと同じ)。
              const fx = miguel.aiFromX ?? mcx, fy = miguel.aiFromY ?? mcy;
              const tx = miguel.aiTargetX ?? mcx, ty = miguel.aiTargetY ?? mcy;
              const t = Math.max(0, Math.min(1, 1 - ((miguel.bossStateUntil ?? newGameTime) - newGameTime) / THOR_COUNTER_LEAP_MS));
              patch.x = (fx + (tx - fx) * t) - miguel.width / 2;
              patch.y = (fy + (ty - fy) * t) - miguel.height / 2;
              if (newGameTime >= (miguel.bossStateUntil ?? 0)) {
                patch.bossState = 'chase';
                patch.bossNextActionAt = miguelNextActionDelay();
              }
            } else {
              // 未知/旧ステート(初期スポーン直後を含む)は chase へフォールバックし必ず再開させる。
              patch.bossState = 'chase';
              patch.bossNextActionAt = miguelNextActionDelay();
            }

            if (Object.keys(patch).length) {
              useGameStore.setState(stt => ({ enemies: stt.enemies.map(e => e.id === miguel.id ? { ...e, ...patch } : e) }));
            }
          }
         } catch (err) {
          if (!miguelCtrlErrLogged) { miguelCtrlErrLogged = true; console.error('[miguel] controller error (suppressed after first):', err); }
         }
        }

        // Update player invulnerability
        if (player.invulnerable && Date.now() - player.invulnerableTime > INVULN_MS) {
          useGameStore.setState(state => ({
            player: {
              ...state.player,
              invulnerable: false
            }
          }));
        }

        // Move player based on input or swipe direction
        // 移動のみ MOVE_SPEED_MULT 倍速(演出/進行は等速のまま=deltaTimeを据え置き)。
        movePlayer(inputState, deltaTime * MOVE_SPEED_MULT);
        // スケーター新仕様: 旧「逆フリックで急停止バッシュ」は廃止。バッシュはダブルタップ乗車→指離しで
        // 投擲したスケボーがヒットした時に発動する(下の skateboard 衝突処理)。

        const huntingInputActive =
          useGameStore.getState().touchActive ||
          swipeDirection !== null ||
          inputState.up ||
          inputState.down ||
          inputState.left ||
          inputState.right;
        const huntingPlayer = useGameStore.getState().player;
        const huntingLevel = Math.max(0, Math.min(3, huntingPlayer.subWeaponLevels['striker-hunting'] ?? 0));
        if (
          huntingPlayer.subWeapons.includes('striker-hunting') &&
          !subWeaponBlockedByKatana(huntingPlayer, 'striker-hunting') &&
          huntingLevel > 0 &&
          huntingInputActive
        ) {
          const startedAt = huntingPlayer.huntingChargeStartedAt > 0
            ? huntingPlayer.huntingChargeStartedAt
            : newGameTime;
          updateHuntingCharge(
            startedAt,
            huntingPlayer.huntingCharged ||
              newGameTime - startedAt >= HUNTING_CHARGE_MS_BY_LEVEL[huntingLevel]
          );
        } else if (!huntingPlayer.huntingCharged && huntingPlayer.huntingChargeStartedAt !== 0) {
          updateHuntingCharge(0, false);
        }

        // 錬金術: 立ち止まり5秒で魔法陣完成→召喚。移動で中断、レア在席中は不可。被弾では中断しない。
        const alcStore = useGameStore.getState();
        const alcPlayer = alcStore.player;
        const alcLvl = Math.max(0, Math.min(3, alcPlayer.subWeaponLevels['alchemy'] ?? 0));
        const rareActive = alcStore.summons.some(s => s.kind === 'rare');
        const canChannel =
          alcPlayer.subWeapons.includes('alchemy') &&
          !subWeaponBlockedByKatana(alcPlayer, 'alchemy') &&
          alcLvl > 0 &&
          !alcPlayer.isMoving &&
          !rareActive;
        if (canChannel) {
          const started = (alcPlayer.alchemyChannelStartedAt ?? 0) > 0
            ? (alcPlayer.alchemyChannelStartedAt as number)
            : newGameTime;
          if ((alcPlayer.alchemyChannelStartedAt ?? 0) === 0) {
            useGameStore.getState().updateAlchemyChannel(started);
          }
          if (newGameTime - started >= ALCHEMY_CHANNEL_MS) {
            useGameStore.getState().summonAlchemy();
            useGameStore.getState().updateAlchemyChannel(0);
          }
          // 魔法陣演出は Pixi 側(syncAlchemyCircle)が足元の常設地面スプライトを
          // alpha=溜め進捗で連続フェード描画する(手続き的リングは廃止)。
          // TODO(錬金術): 被弾でチャネル中断するか(現状は中断しない)。
        } else if ((alcPlayer.alchemyChannelStartedAt ?? 0) !== 0) {
          useGameStore.getState().updateAlchemyChannel(0); // 移動/ブロック/レアで中断
        }

        // 四神舞(リズム): 立ち止まりでモード開始→タップ/フリック入力で戦う。store=判定、loop=実行。
        {
          const rs = useGameStore.getState();
          const rp = rs.player;
          const ownsRhythm = rp.subWeapons.includes('shijin') && !subWeaponBlockedByKatana(rp, 'shijin');
          if (!ownsRhythm) {
            if (rs.rhythm.active) useGameStore.getState().setRhythmActive(false);
            rhythmIdleStartRef.current = 0;
            rhythmMoveStartRef.current = 0;
          } else if (rp.isMoving) {
            // 動いている: 一定時間「歩き続けた」場合のみ終了。短いフリックのドラッグや
            // バッシュのスライド(~150ms)では抜けない。
            if (rhythmMoveStartRef.current === 0) rhythmMoveStartRef.current = newGameTime;
            rhythmIdleStartRef.current = 0;
            if (rs.rhythm.active && newGameTime - rhythmMoveStartRef.current >= RHYTHM_EXIT_MOVE_MS) {
              useGameStore.getState().setRhythmActive(false);
            }
          } else {
            // 停止中: 一定時間でモード開始。
            rhythmMoveStartRef.current = 0;
            if (rhythmIdleStartRef.current === 0) rhythmIdleStartRef.current = newGameTime;
            if (!rs.rhythm.active && newGameTime - rhythmIdleStartRef.current >= RHYTHM_ENTER_IDLE_MS) {
              // 四神舞レベルでBPM(=interval)が変わる。拍は固定 gameTime グリッドで合わせる(音楽同期はしない)。
              const lvl = Math.max(1, Math.min(3, rp.subWeaponLevels['shijin'] ?? 1));
              // 練習モードでは入力欄のサークル間隔(danceTestInterval)を優先(サークルへ連携)。
              const dti = useGameStore.getState().danceTestInterval;
              const interval = (danceTest && dti > 0) ? dti : rhythmIntervalForLevel(lvl);
              // サークル/拍グリッドは実時間(Date.now)基準。音楽も実時間で鳴るので、fps低下で gameTime が
              // 遅れても音楽からズレない(累積ドリフト対策)。レベル別オフセットで位相を合わせる。
              // 練習モードはリードを1拍に固定。LEAD(600ms)より速いテンポ(interval<600)だと
              // ceil(600/interval)が2拍以上になり、本譜前にサークルが複数回重なる→その分は
              // 自動タップ/JUST対象外でドラムが鳴らない(=最初のサークルが反応しない)不具合になるため。
              const leadBeats = danceTest ? 1 : Math.ceil(RHYTHM_LEAD_MS / interval);
              const firstBeatAt = Date.now() + leadBeats * interval + rhythmBeatOffsetForLevel(lvl);
              useGameStore.getState().setRhythmActive(true, firstBeatAt, interval);
              autoTapBeatRef.current = -1; // 自動タップの拍カウンタを開始時にリセット
              rhythmAnchoredRef.current = false; // 曲が鳴り出したら1回だけ位相合わせし直す
              rhythmResyncAtRef.current = 0;      // 定期リシンクの予約もリセット
              danceBeatScheduledIndexRef.current = -1; // B方式: メトロノームの予約状態もリセット
            }
          }

          if (useGameStore.getState().rhythm.active) {
            useGameStore.getState().tickRhythm();
            if (!BEAT_ENABLED) {
              // 旧方式(曲への自動アンカー同期)。?beat=0 の時だけ使う(切り分け用・削除しない)。
              // 自動アンカー(ダンス曲↔サークルの開始位相合わせ): ダンス曲は src 差し替え→load→play の
              // 可変レイテンシ後に鳴り出すため、開始時刻基準のグリッドだと一定オフセットでズレる。曲が
              // 実際に鳴り出した瞬間の currentTime からグリッド起点を「1回だけ」スナップして位相を合わせる
              // (毎フレーム同期はしない=ブルブル回避)。
              if (!rhythmAnchoredRef.current) {
                const rA = useGameStore.getState().rhythm;
                if (rA.interval > 0 && rA.expectBeat === 0) {
                  // 先頭ビートを消化する前(リードイン中)だけ補正する。
                  const anchor = getDanceBeatAnchorMs();
                  if (anchor != null) {
                    const lvl = Math.max(1, Math.min(3, useGameStore.getState().player.subWeaponLevels['shijin'] ?? 1));
                    // 曲のビート位相 = currentTime=0 の壁時計 + レベル別ダウンビート補正。
                    const gridBase = anchor + rhythmBeatOffsetForLevel(lvl);
                    // 元の firstBeatAt にいちばん近いビート境界へスナップ(リードはほぼ維持・位相だけ補正)。
                    let snapped = gridBase + Math.round((rA.firstBeatAt - gridBase) / rA.interval) * rA.interval;
                    // 既に過ぎ(かけ)ていたら、最初のサークルを取りこぼさないよう1拍ずつ未来へ送る。
                    while (snapped <= Date.now() + RHYTHM_SUCCESS_WINDOW_MS) snapped += rA.interval;
                    useGameStore.getState().setRhythmFirstBeat(snapped);
                    autoTapBeatRef.current = -1; // グリッド移動に合わせ自動タップの拍カウンタも再起
                    rhythmAnchoredRef.current = true;
                    rhythmResyncAtRef.current = Date.now() + RHYTHM_RESYNC_MS;
                  }
                } else if (rA.expectBeat > 0) {
                  // 先頭ビートを過ぎてしまった場合はスナップせず固定グリッドのまま継続(途中ジャンプ回避)。
                  rhythmAnchoredRef.current = true;
                  rhythmResyncAtRef.current = Date.now() + RHYTHM_RESYNC_MS;
                }
              } else if (Date.now() >= rhythmResyncAtRef.current) {
                // 定期リシンク(アンカー後): 曲の実再生位置から位相のズレを測り、閾値を超えた分だけ最小補正。
                // 数秒に1回・1拍未満の微調整のみなので軽く、毎フレーム同期のブルブルも起きない。
                rhythmResyncAtRef.current = Date.now() + RHYTHM_RESYNC_MS;
                const rR = useGameStore.getState().rhythm;
                const anchor = rR.interval > 0 ? getDanceBeatAnchorMs() : null;
                if (anchor != null) {
                  const lvl = Math.max(1, Math.min(3, useGameStore.getState().player.subWeaponLevels['shijin'] ?? 1));
                  const gridBase = anchor + rhythmBeatOffsetForLevel(lvl);
                  const iv = rR.interval;
                  let err = (((rR.firstBeatAt - gridBase) % iv) + iv) % iv; // [0, iv)
                  if (err > iv / 2) err -= iv;                              // [-iv/2, iv/2) 最寄りビートへの符号付きズレ
                  if (Math.abs(err) > RHYTHM_RESYNC_MIN_MS) {
                    useGameStore.getState().setRhythmFirstBeat(rR.firstBeatAt - err); // 位相だけ最小補正(拍indexは不変)
                  }
                }
              }
            } else {
              // B方式(社長決定 v0.25.1339): 曲には同期せず、リングのスケジュール(firstBeatAt/interval・
              // Date.now基準=judgeやサークルと同じ時計)から次の1拍だけを先読み予約する。
              // gameTime→ctx時刻の変換はscheduleDanceBeatKick内で毎回やり直す(ドリフト蓄積を避ける)。
              const rB = useGameStore.getState().rhythm;
              if (rB.interval > 0) {
                const next = nextBeatToSchedule({
                  nowMs: Date.now(),
                  firstBeatAtMs: rB.firstBeatAt,
                  intervalMs: rB.interval,
                  lastScheduledIndex: danceBeatScheduledIndexRef.current,
                  windowMs: DANCE_BEAT_SCHEDULE_WINDOW_MS,
                });
                if (next.shouldSchedule) {
                  scheduleDanceBeatKick(next.beatAtMs);
                  danceBeatScheduledIndexRef.current = next.beatIndex;
                }
              }
            }
            // 練習モードの自動タップ: 各拍(JUST)で1回だけ自動タップ→ドラムが拍に乗る(ズレ確認用)。
            if (danceTest && useGameStore.getState().danceTestAutoTap) {
              const rAT = useGameStore.getState().rhythm;
              if (rAT.interval > 0 && rAT.firstBeatAt > 0) {
                const bi = Math.floor((Date.now() - rAT.firstBeatAt) / rAT.interval);
                if (bi >= 0 && bi !== autoTapBeatRef.current) {
                  autoTapBeatRef.current = bi;
                  useGameStore.getState().rhythmInput('tap'); // JUST判定→pendingでキックが鳴る(自動タップも計測対象=間隔は~interval)
                }
              }
            }
            // ※毎フレームの位相再同期(resync)は廃止。音楽クロックの微ノイズを追いかけて
            //   サークルが微振動(ブルブル)するため、開始時に合わせた固定グリッドで一定に流す。
            // pending(タップ/フリック/四神技/全体フィニッシュ)を消化して実行。
            for (const pa of useGameStore.getState().drainRhythmPending()) {
              executeRhythmPending(pa);
            }
            // 白虎: 5秒間 0.5秒ごとに射程内の近い敵を1体斬る(最大10回)。毎フレーム探索しない。
            const rr = useGameStore.getState().rhythm;
            if (rr.byakkoUntil > newGameTime && newGameTime >= rr.byakkoNextAt && rr.byakkoHits < BYAKKO_MAX_HITS) {
              const bp = useGameStore.getState().player;
              const bcx = bp.x + bp.width / 2;
              const bcy = bp.y + bp.height / 2;
              const target = useGameStore.getState().enemies
                .filter(e => e.type !== 'reaper')
                .map(e => ({ e, d: Math.hypot(e.x + e.width / 2 - bcx, e.y + e.height / 2 - bcy) }))
                .filter(h => h.d <= BYAKKO_RANGE)
                .sort((a, b) => a.d - b.d)[0]?.e;
              if (target) {
                const ex = target.x + target.width / 2;
                const ey = target.y + target.height / 2;
                shijinHitEnemy(target.id, BYAKKO_DAMAGE, true);
                useGameStore.getState().spawnSlash(ex, ey, 'rgba(241,245,249,0.95)');
                spawnRing(ex, ey, 4, 22, 'rgba(226,232,240,0.7)', 2, 200);
                playSfx('slash-damage');
              }
              useGameStore.getState().advanceByakko();
            }
          }

          // ダンスタイムの音楽切替: リズムの active 変化に追従(中だけ pulse-grid、メインBGMはダック)。
          const danceNow = useGameStore.getState().rhythm.active;
          if (danceNow !== danceModeRef.current) {
            if (danceNow) {
              // 開始時は四神舞レベルのトラックへ切替(BPMと一致)。
              const lvl = Math.max(1, Math.min(3, useGameStore.getState().player.subWeaponLevels['shijin'] ?? 1));
              setDanceMode(true, lvl);
            } else {
              setDanceMode(false);
            }
            if (BEAT_ENABLED) setDanceBeatDuck(danceNow); // B方式: メトロノームが埋もれないよう曲を軽くダック
            danceModeRef.current = danceNow;
          }
        }

        // 追尾カメラ(描画のみ): 慣性追従 + 進行方向の余白(先読み) + 危険時タイト + 強制中心復帰。
        // 判定/スポーン/プロップ生成は実プレイヤー基準(baseCam)のまま=ゲーム性に影響なし。
        const pcCamX = player.x + player.width / 2;
        const pcCamY = player.y + player.height / 2;
        const baseCamX = pcCamX - gameBounds.width / 2;  // プレイヤーをちょうど中央に置くカメラ(先読み無し)
        // プレイヤーを中央より下へ(屋内/ラボは中央維持=スポーン補正と一致)。上(進行先)の視界を広げる。
        const camDownOff = (indoor || labTheme) ? 0 : gameBounds.height * CAMERA_DOWN_OFFSET_FRAC;
        const baseCamY = pcCamY - gameBounds.height / 2 - camDownOff;
        // 危険時(敵が近い): 追従をタイトにし先読みを切ってプレイヤーを中心寄りに(接近戦で安定)。
        const dangerR2 = CAMERA_DANGER_RADIUS * CAMERA_DANGER_RADIUS;
        const danger = enemies.some(e => {
          const dx = (e.x + e.width / 2) - pcCamX, dy = (e.y + e.height / 2) - pcCamY;
          return dx * dx + dy * dy < dangerR2;
        });
        // 進行方向の先読みオフセット(移動中=方向×最大 / 停止・危険時=0へ戻す)。
        const sp = Math.hypot(player.vx, player.vy);
        let offTx = 0, offTy = 0, offTau = CAMERA_RETURN_TAU;
        if (!danger && player.isMoving && sp > 0.001) {
          offTx = (player.vx / sp) * CAMERA_LOOKAHEAD_MAX;
          offTy = (player.vy / sp) * CAMERA_LOOKAHEAD_MAX;
          offTau = CAMERA_FOLLOW_TAU;
        }
        const ok = 1 - Math.exp(-baseDeltaTime / Math.max(0.001, offTau));
        const look = camLookAheadRef.current;
        look.x += (offTx - look.x) * ok;
        look.y += (offTy - look.y) * ok;
        const targetCameraX = baseCamX + look.x;
        const targetCameraY = baseCamY + look.y;
        // 指数追従(危険時はタイトな τ)。
        const followTau = Math.max(0.001, danger ? CAMERA_DANGER_TAU : CAMERA_FOLLOW_TAU);
        const prevCam = useGameStore.getState().camera;
        const fk = 1 - Math.exp(-baseDeltaTime / followTau);
        let camX = prevCam.x + (targetCameraX - prevCam.x) * fk;
        let camY = prevCam.y + (targetCameraY - prevCam.y) * fk;
        // 強制中心復帰: プレイヤーが画面中心から離れすぎたらクランプ(見失い防止)。
        const maxLag = gameBounds.width * CAMERA_CENTER_CLAMP_FRAC;
        const offX = (pcCamX - camX) - gameBounds.width / 2;
        const offY = (pcCamY - camY) - gameBounds.height / 2 - camDownOff; // 下げ量を基準に(=ずらした構図からのラグを測る)
        const offD = Math.hypot(offX, offY);
        if (offD > maxLag && maxLag > 0) { const s2 = 1 - maxLag / offD; camX += offX * s2; camY += offY * s2; }
        // 開始/復帰などで大きく離れていたら即スナップ。
        if (Math.hypot(baseCamX - camX, baseCamY - camY) > CAMERA_SNAP_DIST) {
          camX = baseCamX; camY = baseCamY; look.x = 0; look.y = 0;
        }
        // 屋内はカメラを「野外マージン込みの外周」にクランプ。壁の外に野外を設けたので、端でも
        // プレイヤーが画面中心を保てる(壁で進めなくてもカメラは野外側へ寄れる)。
        if (indoor) {
          const maxCamX = LAB_OUTER_BOUNDS.x + LAB_OUTER_BOUNDS.width - gameBounds.width;
          const maxCamY = LAB_OUTER_BOUNDS.y + LAB_OUTER_BOUNDS.height - gameBounds.height;
          camX = Math.max(LAB_OUTER_BOUNDS.x, Math.min(maxCamX, camX));
          camY = Math.max(LAB_OUTER_BOUNDS.y, Math.min(maxCamY, camY));
        }
        setCameraPosition(camX, camY);
        syncBreakableProps({ x: baseCamX, y: baseCamY }, gameBounds);
        
        // Complete any finished reload, then ensure the active gun is
        // shootable (reload it / swap off a fully-dry gun), then fire it.
        const reloadBeforeAutoSwitch = useGameStore.getState().player.reloadingWeaponId;
        tickReload();
        autoSwitchIfDry();
        const postReloadPlayer = useGameStore.getState().player;
        if (!reloadBeforeAutoSwitch && postReloadPlayer.reloadingWeaponId) {
          // リロードSEは武器のリロード時間ぶんだけ鳴らし、完了と同時に止める(社長指示。音源は長尺約7.6s)。
          const reloadingGun = getGuns(postReloadPlayer).find(w => w.id === postReloadPlayer.reloadingWeaponId);
          playSfx('reload', 1, reloadingGun ? effectiveReloadMs(reloadingGun, postReloadPlayer) : 1500);
        }
        // 刀装備中は銃の自動射撃を完全に止める(弾薬/リロード処理は通常どおり
        // 進むので、刀を外す実装が将来入っても副作用が残らない)。
        const katanaActive = isKatanaMode(postReloadPlayer);
        const activeGun = getActiveGun(postReloadPlayer);
        // PHILL銃は自動射撃しない(指離しの手動発砲のみ=firePhillShot)。
        if (activeGun && !katanaActive && activeGun.category !== 'phill') {
          const newProjectiles = fireWeapon(activeGun, postReloadPlayer, enemies);
          if (newProjectiles.length > 0) {
            // handgun系のうちマシンピストル(=サブマシンガン, handgun-t3)だけ専用音、それ以外(ハンドガン/二丁)はhandgun-fire。
            if (activeGun.category === 'handgun') playSfx(activeGun.key === SMG_WEAPON_KEY ? 'smg-fire' : 'handgun-fire');
            if (activeGun.category === 'shotgun') playSfx('shotgun-fire');
            // rifle系のうちグレネードランチャー(rifle-t3)だけ専用の発射音、それ以外(マグナム/スナイパー)はrifle-fire。
            if (activeGun.category === 'rifle') playSfx(activeGun.key === GRENADE_WEAPON_KEY ? 'grenade-launcher-fire' : 'rifle-fire');
            // Muzzle flash at the gun, pointed along the shot.
            if (MUZZLE_FLASH_ENABLED) {
              const md = newProjectiles[0].direction;
              const mpx = postReloadPlayer.x + postReloadPlayer.width / 2 + md.x * 18;
              const mpy = postReloadPlayer.y + postReloadPlayer.height / 2 + md.y * 18;
              useGameStore.getState().spawnGlow(
                mpx, mpy, activeGun.category === 'shotgun' ? 22 : 15, 'rgba(255,238,170,', 90
              );
            }
          }
          newProjectiles.forEach(proj => useGameStore.getState().addProjectile(proj));
        }

        // Katana auto-slash: the gun auto-fire idea in melee form. Targets the
        // nearest non-stunned enemy first (stunned fallback = finisher chance),
        // Hunting-Lv3-equivalent reach, one cut per interval. Guns and the
        // release knife sweep are disabled while the katana is owned.
        if (katanaActive) {
          if (gameTime < lastKatanaSlashRef.current) lastKatanaSlashRef.current = 0; // new run
          if (gameTime - lastKatanaSlashRef.current >= KATANA_SLASH_INTERVAL_MS) {
            const kp = useGameStore.getState().player;
            const kcx = kp.x + kp.width / 2;
            const kcy = kp.y + kp.height / 2;
            const kRange = katanaRange(kp);
            let best: { id: string; d2: number } | null = null;
            let bestStunned: { id: string; d2: number } | null = null;
            for (const e of useGameStore.getState().enemies) {
              if (e.type === 'reaper') continue;
              // 距離は enemyMeleeDist(裏ボスは帯AABBの最近点)。巨体ボスを中心基準にすると帯の端で
              // 「近づいても発動しない」狭い当たりになる(社長報告)。最近点なら表示枠=攻撃判定が一致する。
              const d = enemyMeleeDist(kcx, kcy, e);
              if (d > kRange) continue;
              const d2 = d * d;
              // 自動射撃と同じ優先順位: スタン中の敵は後回し(最後の手段)。
              const stunned = e.stunUntil !== undefined && gameTime < e.stunUntil;
              if (stunned) {
                if (!bestStunned || d2 < bestStunned.d2) bestStunned = { id: e.id, d2 };
              } else if (!best || d2 < best.d2) {
                best = { id: e.id, d2 };
              }
            }
            const target = best ?? bestStunned;
            if (target) {
              lastKatanaSlashRef.current = gameTime;
              // 近接フィニッシュは一閃のみ: オート斬撃はallowFinisher=false。
              const result = performKatanaStrike([target.id], 1, false);
              if (result.finish) playSfx('melee-finish');
              else if (result.hit) playSfx('slash-damage');
              if (result.killed > 0) playEnemyDeath();
            }
          }
        }

        // 刀装備中は他のサブウェポンを発動させない(許可制、現状すべて停止)。
        const subWeaponPlayer = useGameStore.getState().player;
        // 帰還サークル内では攻撃停止=設置/投擲系サブも発動しない(置き攻撃の出入りハメ防止)。
        const inReturnCircle = isInReturnCircle(subWeaponPlayer, useGameStore.getState().returnCircle);
        if (
          !inReturnCircle &&
          subWeaponPlayer.subWeapons.includes('heavy-grenade') &&
          !subWeaponBlockedByKatana(subWeaponPlayer, 'heavy-grenade') &&
          gameTime >= (subWeaponPlayer.subWeaponCooldowns['heavy-grenade'] ?? 0)
        ) {
          const level = Math.max(1, Math.min(3, subWeaponPlayer.subWeaponLevels['heavy-grenade'] ?? 1));
          const pcx = subWeaponPlayer.x + subWeaponPlayer.width / 2;
          const pcy = subWeaponPlayer.y + subWeaponPlayer.height / 2;
          const target = useGameStore.getState().enemies
            .filter(e => e.type !== 'reaper')
            .map(e => ({
              enemy: e,
              dist: Math.hypot(e.x + e.width / 2 - pcx, e.y + e.height / 2 - pcy)
            }))
            .sort((a, b) => a.dist - b.dist)[0]?.enemy;
          const aimX = target ? target.x + target.width / 2 - pcx : subWeaponPlayer.lastDirection?.x ?? 1;
          const aimY = target ? target.y + target.height / 2 - pcy : subWeaponPlayer.lastDirection?.y ?? 0;
          const mag = Math.max(0.001, Math.hypot(aimX, aimY));
          const baseDir = { x: aimX / mag, y: aimY / mag };
          const angles = GRENADE_SPREAD_BY_LEVEL[level] ?? GRENADE_SPREAD_BY_LEVEL[1];
          angles.forEach((angle, index) => {
            const ca = Math.cos(angle);
            const sa = Math.sin(angle);
            addProjectile({
              id: `proj-heavy-grenade-${Date.now()}-${index}`,
              x: pcx - 7,
              y: pcy - 7,
              width: 14,
              height: 14,
              speed: HEAVY_GRENADE_SPEED,
              damage: HEAVY_GRENADE_DAMAGE,
              direction: { x: baseDir.x * ca - baseDir.y * sa, y: baseDir.x * sa + baseDir.y * ca },
              weaponType: 'grenade',
              weaponKey: 'sub-heavy-grenade',
              duration: HEAVY_GRENADE_FUSE_MS,
              createdAt: Date.now(),
              passthrough: false,
              hitEnemies: [],
              hostile: false,
              reflected: false
            });
          });
          setSubWeaponCooldown('heavy-grenade', gameTime + HEAVY_GRENADE_COOLDOWN_MS);
        }

        if (
          !inReturnCircle &&
          subWeaponPlayer.subWeapons.includes('marksman-trap') &&
          !subWeaponBlockedByKatana(subWeaponPlayer, 'marksman-trap') &&
          gameTime >= (subWeaponPlayer.subWeaponCooldowns['marksman-trap'] ?? 0)
        ) {
          const level = Math.max(1, Math.min(3, subWeaponPlayer.subWeaponLevels['marksman-trap'] ?? 1));
          const pcx = subWeaponPlayer.x + subWeaponPlayer.width / 2;
          const pcy = subWeaponPlayer.y + subWeaponPlayer.height / 2;
          addProjectile({
            id: `proj-marksman-trap-${Date.now()}`,
            x: pcx - 8,
            y: pcy - 8,
            width: 16,
            height: 16,
            speed: 0,
            damage: 0,
            direction: { x: 0, y: 0 },
            weaponType: 'trap',
            weaponKey: 'sub-marksman-trap',
            duration: MARKSMAN_TRAP_DURATION_MS,
            createdAt: Date.now(),
            passthrough: false,
            hitEnemies: [],
            hostile: false,
            reflected: false,
            area: MARKSMAN_TRAP_RADIUS_BY_LEVEL[level],
            count: level
          });
          spawnRing(pcx, pcy, 4, MARKSMAN_TRAP_RADIUS_BY_LEVEL[level], 'rgba(56,189,248,0.46)', 2, 280);
          setSubWeaponCooldown('marksman-trap', gameTime + MARKSMAN_TRAP_COOLDOWN_MS);
        }

        if (
          subWeaponPlayer.subWeapons.includes('striker-quick-mag') &&
          !subWeaponBlockedByKatana(subWeaponPlayer, 'striker-quick-mag') &&
          gameTime >= (subWeaponPlayer.subWeaponCooldowns['striker-quick-mag'] ?? 0) &&
          !useGameStore.getState().pickups.some(p => p.type === 'quick-magazine')
        ) {
          const active = getActiveGun(subWeaponPlayer);
          const level = Math.max(1, Math.min(3, subWeaponPlayer.subWeaponLevels['striker-quick-mag'] ?? 1));
          const maxMag = active?.magSize != null ? active.magSize + subWeaponPlayer.magBonus : 0;
          const reserve = active?.ammoType === 'handgun'
            ? subWeaponPlayer.ammoHandgun
            : active?.ammoType === 'shotgun'
              ? subWeaponPlayer.ammoShotgun
              : active?.ammoType === 'rifle'
                ? subWeaponPlayer.ammoRifle
                : 0;
          if (active?.ammoType && (active.magazine ?? 0) < maxMag && reserve > 0) {
            const dir = subWeaponPlayer.lastDirection ?? { x: 1, y: 0 };
            const dirMag = Math.max(0.001, Math.hypot(dir.x, dir.y));
            const px = subWeaponPlayer.x + subWeaponPlayer.width / 2
              + (dir.x / dirMag) * STRIKER_QUICK_MAG_THROW_DISTANCE;
            const py = subWeaponPlayer.y + subWeaponPlayer.height / 2
              + (dir.y / dirMag) * STRIKER_QUICK_MAG_THROW_DISTANCE;
            const fromX = subWeaponPlayer.x + subWeaponPlayer.width / 2 - 8;
            const fromY = subWeaponPlayer.y + subWeaponPlayer.height / 2 - 8;
            addPickup({
              id: `pickup-quick-mag-${Date.now()}`,
              x: px - 8,
              y: py - 8,
              type: 'quick-magazine',
              value: 1,
              throwFromX: fromX,
              throwFromY: fromY,
              throwStartAt: Date.now(),
              throwDuration: STRIKER_QUICK_MAG_THROW_MS
            });
            spawnRing(fromX + 8, fromY + 8, 4, 18, 'rgba(203,213,225,0.72)', 2, 220);
            spawnRing(px, py, 4, 22, 'rgba(148,163,184,0.7)', 2, 260);
            spawnBurst(px, py, '#cbd5e1', 6);
            setSubWeaponCooldown(
              'striker-quick-mag',
              gameTime + STRIKER_QUICK_MAG_COOLDOWN_BY_LEVEL[level]
            );
          }
        }

        if (
          subWeaponPlayer.subWeapons.includes('dog') &&
          !subWeaponBlockedByKatana(subWeaponPlayer, 'dog')
        ) {
          const level = Math.max(1, Math.min(3, subWeaponPlayer.subWeaponLevels.dog ?? 1));
          const dogReadyAt = subWeaponPlayer.subWeaponCooldowns.dog ?? gameTime;
          const nowMs = Date.now();
          const activeFetch = dogFetchRef.current;

          if (activeFetch) {
            // 移動軌道上の敵を噛む: 現在のドッグ位置(出発→対象→プレイヤーへ戻る)を補間で求め、
            // 近接した未噛みの敵に小ダメージ+小ノックバック。
            {
              const t = Math.max(0, Math.min(1, (nowMs - activeFetch.startedAt) / DOG_FETCH_DURATION_MS));
              const outFrac = DOG_FETCH_PICKUP_MS / DOG_FETCH_DURATION_MS;
              const bstate = useGameStore.getState();
              const homeX = bstate.player.x + bstate.player.width / 2;
              const homeY = bstate.player.y + bstate.player.height / 2;
              let dogX: number, dogY: number;
              if (t <= outFrac) {
                const k = outFrac <= 0 ? 1 : t / outFrac;
                dogX = activeFetch.fromX + (activeFetch.targetX - activeFetch.fromX) * k;
                dogY = activeFetch.fromY + (activeFetch.targetY - activeFetch.fromY) * k;
              } else {
                const k = (t - outFrac) / Math.max(0.001, 1 - outFrac);
                dogX = activeFetch.targetX + (homeX - activeFetch.targetX) * k;
                dogY = activeFetch.targetY + (homeY - activeFetch.targetY) * k;
              }
              for (const enemy of bstate.enemies) {
                if (enemy.type === 'reaper') continue;
                if (activeFetch.bitten.has(enemy.id)) continue;
                const ex = enemy.x + enemy.width / 2;
                const ey = enemy.y + enemy.height / 2;
                if (Math.hypot(ex - dogX, ey - dogY) > DOG_BITE_RADIUS) continue;
                activeFetch.bitten.add(enemy.id);
                const killed = damageEnemy(enemy.id, DOG_BITE_DAMAGE);
                spawnDamageNumber(ex, enemy.y, DOG_BITE_DAMAGE, false);
                spawnBurst(ex, ey, '#cbd5e1', 4);
                if (!killed && enemy.type !== 'giantbat' && enemy.type !== 'pumpkin') {
                  const n = Math.max(0.001, Math.hypot(ex - dogX, ey - dogY));
                  useGameStore.getState().knockbackEnemy(enemy.id, (ex - dogX) / n, (ey - dogY) / n, DOG_BITE_KNOCKBACK_MULT);
                }
                if (killed) {
                  playEnemyDeath();
                  dropEnemyXp(enemy, ex, ey, 'pickup-xp-dog');
                }
              }
            }
            if (!activeFetch.collected && nowMs >= activeFetch.collectAt) {
              const state = useGameStore.getState();
              const eligiblePickups = state.pickups
                .filter(p => p.type !== 'health' || state.player.health < state.player.maxHealth)
                .filter(p => {
                  if (
                    p.throwStartAt !== undefined &&
                    p.throwDuration !== undefined &&
                    nowMs - p.throwStartAt < p.throwDuration
                  ) {
                    return false;
                  }
                  const px = p.x + 8;
                  const py = p.y + 8;
                  return Math.hypot(px - activeFetch.targetX, py - activeFetch.targetY) <= activeFetch.radius;
                });

              if (eligiblePickups.length > 0) {
                const hasAmmoPickup = eligiblePickups.some(p =>
                  p.type === 'ammo-handgun' ||
                  p.type === 'ammo-shotgun' ||
                  p.type === 'ammo-rifle'
                );
                const hasWeaponPickup = eligiblePickups.some(p =>
                  p.type === 'weapon-drop' ||
                  p.type === 'weapon-crate'
                );
                const hasHealthPickup = eligiblePickups.some(p => p.type === 'health');
                const hasBombPickup = eligiblePickups.some(p => p.type === 'bomb');

                if (hasAmmoPickup) playSfx('ammo-pickup');
                else if (hasWeaponPickup) playSfx('weapon-pickup');
                else if (hasHealthPickup) playSfx('eat');
                else if (hasBombPickup) playSfx('bomb');
                else playSfx('pickup');

                spawnRing(activeFetch.targetX, activeFetch.targetY, 5, activeFetch.radius, 'rgba(203,213,225,0.34)', 2, 240);
                eligiblePickups.slice(0, DOG_COLLECT_BURST_LIMIT).forEach(p => {
                  spawnBurst(p.x + 8, p.y + 8, '#cbd5e1', p.type === 'strap' ? 3 : 5);
                });
                eligiblePickups.forEach(p => collectPickup(p.id));
              }
              activeFetch.collected = true;
            }

            if (nowMs >= activeFetch.finishAt) {
              dogFetchRef.current = null;
              // スキル: ドッグラン = Lv1 CD半減 / Lv2-3 CD0。
              const dogRunLv = skillLevel(useGameStore.getState().player, 'dog-run');
              const dogCdMult = dogRunLv ? [1, 0.5, 0, 0][dogRunLv] : 1;
              setSubWeaponCooldown('dog', gameTime + DOG_PICKUP_COOLDOWN_BY_LEVEL[level] * dogCdMult);
            }
          } else if (gameTime >= dogReadyAt) {
            const state = useGameStore.getState();
            // スキル: ドッグラン = Lv3 で射程制限を解除(実質無限)。
            const targetRadius = skillLevel(state.player, 'dog-run') >= 3 ? Infinity : DOG_FETCH_TARGET_RADIUS_BY_LEVEL[level];
            const collectRadius = DOG_COLLECT_RADIUS_BY_LEVEL[level];
            const playerX = state.player.x + state.player.width / 2;
            const playerY = state.player.y + state.player.height / 2;
            const eligiblePickups = state.pickups
              // 目標アイテム(カードキー/武器箱/クリアアイテム)はドッグで遠隔回収させない(壁越し誤発火防止)。
              .filter(p => p.type !== 'card-key' && p.type !== 'weapon-crate' && p.type !== 'lab-clear-item')
              .filter(p => p.type !== 'health' || state.player.health < state.player.maxHealth)
              .filter(p => {
                if (
                  p.throwStartAt !== undefined &&
                  p.throwDuration !== undefined &&
                  nowMs - p.throwStartAt < p.throwDuration
                ) {
                  return false;
                }
                const px = p.x + 8;
                const py = p.y + 8;
                return Math.hypot(px - playerX, py - playerY) <= targetRadius;
              })
              .sort((a: Pickup, b: Pickup) => {
                const ax = a.x + 8 - playerX;
                const ay = a.y + 8 - playerY;
                const bx = b.x + 8 - playerX;
                const by = b.y + 8 - playerY;
                return ax * ax + ay * ay - (bx * bx + by * by);
              });

            const target = eligiblePickups[0];
            if (target) {
              const targetX = target.x + 8;
              const targetY = target.y + 8;
              dogFetchRef.current = {
                collectAt: nowMs + DOG_FETCH_PICKUP_MS,
                finishAt: nowMs + DOG_FETCH_DURATION_MS,
                startedAt: nowMs,
                fromX: playerX,
                fromY: playerY,
                targetX,
                targetY,
                radius: collectRadius,
                collected: false,
                bitten: new Set<string>(),
              };
              spawnEffect({
                kind: 'dogFetch',
                id: `fx-dog-fetch-${Math.floor(nowMs)}-${target.id}`,
                fromX: playerX,
                fromY: playerY,
                targetX,
                targetY,
                toX: playerX,
                toY: playerY,
                createdAt: nowMs,
                pickupAt: nowMs + DOG_FETCH_PICKUP_MS,
                duration: DOG_FETCH_DURATION_MS
              });
            } else {
              setSubWeaponCooldown('dog', gameTime + DOG_EMPTY_RETRY_MS);
            }
          }
        } else {
          dogFetchRef.current = null;
        }

        // Decoy: 10秒ごとに進行方向へ円盤を投げる。設置中は0.5秒ごとに射程内の
        // 最も近い敵弾を1発だけ迎撃する(高速弾の取りこぼしは許容)。
        if (
          !inReturnCircle &&
          subWeaponPlayer.subWeapons.includes('decoy') &&
          !subWeaponBlockedByKatana(subWeaponPlayer, 'decoy') &&
          gameTime >= (subWeaponPlayer.subWeaponCooldowns['decoy'] ?? 0)
        ) {
          const level = Math.max(1, Math.min(3, subWeaponPlayer.subWeaponLevels['decoy'] ?? 1));
          const dir = subWeaponPlayer.lastDirection ?? { x: 1, y: 0 };
          const dmag = Math.max(0.001, Math.hypot(dir.x, dir.y));
          const ux = dir.x / dmag;
          const uy = dir.y / dmag;
          const nowMs = Date.now();
          // 同時設置は1個: 既存のデコイがあれば消す。
          for (const d of useGameStore.getState().projectiles.filter(p => p.weaponType === 'decoy')) {
            removeProjectile(d.id);
            decoyPulseRef.current.delete(d.id);
          }
          const size = 16;
          const pcx = subWeaponPlayer.x + subWeaponPlayer.width / 2;
          const pcy = subWeaponPlayer.y + subWeaponPlayer.height / 2;
          const decoyId = `proj-decoy-${nowMs}`;
          addProjectile({
            id: decoyId,
            x: pcx - size / 2,
            y: pcy - size / 2,
            width: size,
            height: size,
            speed: DECOY_THROW_DISTANCE / (DECOY_THROW_MS / 1000),
            // Lv3 のみ消滅時に爆発。damage>0 を「消滅時に爆発する量」として流用(デコイは敵と衝突しない)。
            damage: level >= 3 ? DECOY_LV3_EXPLOSION_DAMAGE : 0,
            direction: { x: ux, y: uy },
            weaponType: 'decoy',
            weaponKey: 'sub-decoy',
            duration: DECOY_THROW_MS + DECOY_DURATION_BY_LEVEL[level],
            createdAt: nowMs,
            passthrough: false,
            hitEnemies: [],
            hostile: false,
            reflected: false,
            decoyLandAt: nowMs + DECOY_THROW_MS,
            area: DECOY_RANGE_BY_LEVEL[level], // 射程(Lv別。描画のサークル半径と共有)
          });
          // 初回迎撃は着地の0.5秒後。
          decoyPulseRef.current.set(decoyId, gameTime + DECOY_THROW_MS + DECOY_PULSE_MS);
          spawnRing(pcx, pcy, 4, 18, 'rgba(56,189,248,0.6)', 2, 220);
          setSubWeaponCooldown('decoy', gameTime + DECOY_COOLDOWN_MS);
        }

        // 設置型シールド: 5秒ごとに進行方向の反対側へ遮蔽壁を建てる。敵の通行を
        // 止め、敵弾を消し、味方弾は通す。設置間隔/持続は全Lv共通、Lvで耐久だけ上がる。
        if (
          !inReturnCircle &&
          subWeaponPlayer.subWeapons.includes('shield') &&
          !subWeaponBlockedByKatana(subWeaponPlayer, 'shield') &&
          gameTime >= (subWeaponPlayer.subWeaponCooldowns['shield'] ?? 0)
        ) {
          const level = Math.max(1, Math.min(3, subWeaponPlayer.subWeaponLevels['shield'] ?? 1));
          // 進行方向と反対(=外向き法線)。取れなければ最後の向き、それも無ければ下。
          const move = subWeaponPlayer.lastDirection ?? { x: 0, y: 1 };
          const mmag = Math.max(0.001, Math.hypot(move.x, move.y));
          let nx = -move.x / mmag;
          let ny = -move.y / mmag;
          // 法線を主軸へスナップ(4方向)。表裏と当たり判定を素直にするため。
          if (Math.abs(nx) >= Math.abs(ny)) { nx = Math.sign(nx) || 1; ny = 0; }
          else { nx = 0; ny = Math.sign(ny) || 1; }
          const pcx = subWeaponPlayer.x + subWeaponPlayer.width / 2;
          const pcy = subWeaponPlayer.y + subWeaponPlayer.height / 2;
          // 足元(下辺中央)。スプライトはここから上へ伸び、当たり判定は下部のみ。
          const footX = pcx + nx * SHIELD_PLACE_DISTANCE;
          const sideways = nx !== 0;
          // 左右向きは当たり/効果範囲(と絵)を少し下へずらす。
          const footY = pcy + ny * SHIELD_PLACE_DISTANCE + (sideways ? SHIELD_SIDE_DROP : 0);
          // 面(=遮断の広い面)は法線に直交させる。左右向き(法線が水平)なら面は縦(Y)、
          // 上下向きなら面は横(X)。奥行(SHIELD_FOOT_H)は常に法線方向の薄い側。
          const shieldW = sideways ? SHIELD_FOOT_H : SHIELD_FOOT_W;
          const shieldH = sideways ? SHIELD_FOOT_W : SHIELD_FOOT_H;
          const nowMs = Date.now();
          // 同時設置は1個: 既存のシールドがあれば消す(デコイと同じ流儀)。
          for (const s of useGameStore.getState().projectiles.filter(p => p.weaponType === 'shield')) {
            removeProjectile(s.id);
            for (const k of [...shieldHitRef.current.keys()]) {
              if (k.startsWith(`${s.id}:`)) shieldHitRef.current.delete(k);
            }
          }
          addProjectile({
            id: `proj-shield-${nowMs}`,
            x: footX - shieldW / 2,
            y: footY - shieldH,
            width: shieldW,
            height: shieldH,
            speed: 0,
            damage: 0,
            direction: { x: nx, y: ny }, // 外向き法線(=防ぐ向き、スプライト選択に使用)
            weaponType: 'shield',
            weaponKey: 'sub-shield',
            duration: SHIELD_DURATION_MS,
            createdAt: nowMs,
            passthrough: false,
            hitEnemies: [],
            hostile: false,
            reflected: false,
            // スキル: ナイト = 盾の最大HP ×1.5。
            shieldHp: Math.round(SHIELD_HP_BY_LEVEL[level] * skillSummonHpMult(useGameStore.getState().player)),
            shieldMaxHp: Math.round(SHIELD_HP_BY_LEVEL[level] * skillSummonHpMult(useGameStore.getState().player)),
          });
          // ガチャンッ!: 着地ダスト + 金属音(構えた感)。スプライト側で着地スラム。
          spawnRing(footX, footY, 6, 64, 'rgba(203,213,225,0.7)', 3, 260);
          playSfx('shield-deploy');
          setSubWeaponCooldown('shield', gameTime + SHIELD_COOLDOWN_MS);
        }

        // 自動タレット: 10秒ごとにプレイヤー少し前方へ設置。設置地点に留まりオート射撃。
        // 追従しない=移動すると置き去り。設置時は必ず前方集中モードで開始する。
        if (
          !inReturnCircle &&
          subWeaponPlayer.subWeapons.includes('turret') &&
          !subWeaponBlockedByKatana(subWeaponPlayer, 'turret') &&
          gameTime >= (subWeaponPlayer.subWeaponCooldowns['turret'] ?? 0)
        ) {
          const level = Math.max(1, Math.min(3, subWeaponPlayer.subWeaponLevels['turret'] ?? 1));
          const dir = subWeaponPlayer.lastDirection ?? { x: 1, y: 0 };
          const dmag = Math.max(0.001, Math.hypot(dir.x, dir.y));
          const ux = dir.x / dmag;
          const uy = dir.y / dmag;
          const nowMs = Date.now();
          // 同時設置は1個: 既存タレットがあれば消す(デコイ/シールドと同じ流儀)。
          for (const t of useGameStore.getState().projectiles.filter(p => p.weaponType === 'turret')) {
            removeProjectile(t.id);
            turretFireRef.current.delete(t.id);
          }
          const pcx = subWeaponPlayer.x + subWeaponPlayer.width / 2;
          const pcy = subWeaponPlayer.y + subWeaponPlayer.height / 2;
          // 足元(下辺中央)= プレイヤー中心から進行方向へ少し前方。設置物ルール(footRect)に合わせ
          // x,y は足元から当たり判定矩形を作る(下辺=足元)。
          const footX = pcx + ux * TURRET_PLACE_FORWARD;
          const footY = pcy + uy * TURRET_PLACE_FORWARD;
          addProjectile({
            id: `proj-turret-${nowMs}`,
            x: footX - TURRET_FOOT_W / 2,
            y: footY - TURRET_FOOT_H,
            width: TURRET_FOOT_W,
            height: TURRET_FOOT_H,
            speed: 0,
            damage: 0,
            direction: { x: ux, y: uy }, // 設置時の向き(前方集中モードの砲身方向)
            weaponType: 'turret',
            weaponKey: 'sub-turret',
            duration: TURRET_DURATION_BY_LEVEL[level],
            createdAt: nowMs,
            passthrough: false,
            hitEnemies: [],
            hostile: false,
            reflected: false,
            turretMode: 'forward', // 設置時は必ず前方集中モードで開始
          });
          // 設置演出: 軽い着地リング+小ダスト(短命・軽量)。
          spawnRing(footX, footY, 4, 26, 'rgba(148,163,184,0.7)', 2, 220);
          spawnBurst(footX, footY, '#94a3b8', 6);
          playSfx('shield-deploy');
          setSubWeaponCooldown('turret', gameTime + TURRET_COOLDOWN_MS);
        }

        // 発火ナイフ: クールダウンごとに最も近い敵1体へナイフを投擲(敵が居る時だけ)。
        if (
          !inReturnCircle &&
          subWeaponPlayer.subWeapons.includes('fire-knife') &&
          !subWeaponBlockedByKatana(subWeaponPlayer, 'fire-knife') &&
          gameTime >= (subWeaponPlayer.subWeaponCooldowns['fire-knife'] ?? 0)
        ) {
          const level = Math.max(1, Math.min(3, subWeaponPlayer.subWeaponLevels['fire-knife'] ?? 1));
          const pcx = subWeaponPlayer.x + subWeaponPlayer.width / 2;
          const pcy = subWeaponPlayer.y + subWeaponPlayer.height / 2;
          // ターゲット = プレイヤーに最も近い非リーパー敵(既存の自動射撃に準拠)。
          const target = useGameStore.getState().enemies
            .filter(e => e.type !== 'reaper')
            .map(e => ({ enemy: e, dist: Math.hypot(e.x + e.width / 2 - pcx, e.y + e.height / 2 - pcy) }))
            .sort((a, b) => a.dist - b.dist)[0]?.enemy;
          if (target) {
            const aimX = target.x + target.width / 2 - pcx;
            const aimY = target.y + target.height / 2 - pcy;
            const mag = Math.max(0.001, Math.hypot(aimX, aimY));
            addProjectile({
              id: `proj-fire-knife-${Date.now()}`,
              x: pcx - 7,
              y: pcy - 7,
              width: 14,
              height: 14,
              speed: FIRE_KNIFE_SPEED,
              damage: FIRE_KNIFE_HIT_DAMAGE,
              direction: { x: aimX / mag, y: aimY / mag },
              weaponType: 'fire-knife-projectile',
              weaponKey: 'sub-fire-knife',
              duration: FIRE_KNIFE_FLIGHT_MS, // 未命中ならこの寿命で消滅(外れ→消える)
              createdAt: Date.now(),
              passthrough: false,
              hitEnemies: [],
              hostile: false,
              reflected: false,
              area: FIRE_KNIFE_RADIUS_BY_LEVEL[level], // 爆発半径(命中後の爆発で参照)
            });
            playSfx('shot-damage');
            setSubWeaponCooldown('fire-knife', gameTime + FIRE_KNIFE_COOLDOWN_BY_LEVEL[level]);
          }
        }

        // ホーミング弾: 指を付けている間だけ、0.5秒に1体ずつロックを付与(PHILL風の頭上サークル)。
        // 優先順: 射程内の未ロック敵(近い順)→ 既ロック敵へ2ロック目(近い順)。同一敵最大2/総数Lv上限。
        // 発射は VirtualJoystick 指離し(fireHoming)。指を離す/CD中/帰還/未装備はロッククリア。
        // ロック状態は変化時のみ store を更新(per-frame write を最小化)。
        {
          const homingEquipped =
            subWeaponPlayer.subWeapons.includes('homing') &&
            !subWeaponBlockedByKatana(subWeaponPlayer, 'homing') &&
            !inReturnCircle;
          const homingReady = homingEquipped && gameTime >= (subWeaponPlayer.subWeaponCooldowns['homing'] ?? 0);
          const touching = useGameStore.getState().touchActive;
          let newLocks = homingLocksRef.current;
          if (homingReady && touching) {
            // 0.5秒ごとに1体ロックを追加。
            if (gameTime >= nextHomingLockRef.current) {
              nextHomingLockRef.current = gameTime + HOMING_LOCK_INTERVAL_MS;
              const level = Math.max(1, Math.min(3, subWeaponPlayer.subWeaponLevels['homing'] ?? 1));
              const maxLocks = HOMING_MAX_LOCKS_BY_LEVEL[level];
              const enemiesNow = useGameStore.getState().enemies;
              const aliveIds = new Set(enemiesNow.map(e => e.id));
              const locks = homingLocksRef.current.filter(id => aliveIds.has(id)); // 死亡した敵のロックは破棄
              if (locks.length < maxLocks) {
                const pcx = subWeaponPlayer.x + subWeaponPlayer.width / 2;
                const pcy = subWeaponPlayer.y + subWeaponPlayer.height / 2;
                const range2 = HOMING_RANGE * HOMING_RANGE;
                const inRange = enemiesNow
                  .filter(e => e.type !== 'reaper')
                  .map(e => ({ id: e.id, d2: (e.x + e.width / 2 - pcx) ** 2 + (e.y + e.height / 2 - pcy) ** 2 }))
                  .filter(o => o.d2 <= range2)
                  .sort((a, b) => a.d2 - b.d2);
                const count = (id: string) => locks.filter(l => l === id).length;
                // 未ロック敵を最優先、次に1ロック済み敵(2ロック目)。
                const firstLock = inRange.find(o => count(o.id) === 0);
                const next = firstLock ?? inRange.find(o => count(o.id) === 1);
                if (next) {
                  locks.push(next.id);
                  // 1段階目(白)/2段階目(赤)でSEを鳴らし分ける。
                  playSfx(firstLock ? 'homing-lock' : 'homing-lock2');
                }
              }
              newLocks = locks;
            }
          } else {
            // 指を離している/未準備: ロッククリアし、次回タッチで即1体目が付くようリセット。
            newLocks = [];
            nextHomingLockRef.current = 0;
          }
          const prev = homingLocksRef.current;
          if (newLocks.length !== prev.length || newLocks.some((id, i) => id !== prev[i])) {
            homingLocksRef.current = newLocks;
            useGameStore.getState().setHomingLocks(newLocks);
          }
        }

        // 分身(サブウェポン): 画面外で消滅(攻撃なし)、画面内なら1秒ごとの自動近接(5秒)を進める。
        {
          const clone = useGameStore.getState().shadowClone;
          if (clone) {
            const { camera, gameBounds } = useGameStore.getState();
            const fullyOff =
              clone.x + clone.width < camera.x ||
              clone.x > camera.x + gameBounds.width ||
              clone.y + clone.height < camera.y ||
              clone.y > camera.y + gameBounds.height;
            if (fullyOff) useGameStore.getState().expireShadowClone();
            else useGameStore.getState().tickShadowClone();
          }
        }

        // デコイの迎撃パルス(設置中、0.5秒ごとに1発)。毎フレーム判定ではなく
        // パルス方式。距離は二乗比較。高速弾の取りこぼしは許容(swept判定なし)。
        {
          const dstate = useGameStore.getState();
          const decoys = dstate.projectiles.filter(p => p.weaponType === 'decoy');
          if (decoys.length === 0) {
            if (decoyPulseRef.current.size > 0) decoyPulseRef.current.clear();
          } else {
            const liveIds = new Set(decoys.map(d => d.id));
            for (const id of [...decoyPulseRef.current.keys()]) {
              if (!liveIds.has(id)) decoyPulseRef.current.delete(id);
            }
            for (const decoy of decoys) {
              const nextPulse = decoyPulseRef.current.get(decoy.id) ?? (gameTime + DECOY_PULSE_MS);
              if (gameTime < nextPulse) {
                decoyPulseRef.current.set(decoy.id, nextPulse);
                continue;
              }
              decoyPulseRef.current.set(decoy.id, gameTime + DECOY_PULSE_MS);
              const dcx = decoy.x + decoy.width / 2;
              const dcy = decoy.y + decoy.height / 2;
              const decoyRange = decoy.area ?? 0; // Lv別射程(設置時に load 済み)
              let nearest: Projectile | null = null;
              let nearestD2 = decoyRange * decoyRange;
              for (const b of dstate.projectiles) {
                if (!b.hostile) continue; // 敵弾のみ。味方弾/プレイヤー弾には干渉しない。
                const bx = b.x + b.width / 2;
                const by = b.y + b.height / 2;
                const d2 = (bx - dcx) * (bx - dcx) + (by - dcy) * (by - dcy);
                if (d2 <= nearestD2) {
                  nearestD2 = d2;
                  nearest = b;
                }
              }
              if (nearest) {
                const bx = nearest.x + nearest.width / 2;
                const by = nearest.y + nearest.height / 2;
                // 短命のピクセルレーザー(デコイ→敵弾)。trail を流用。
                spawnEffect({
                  kind: 'trail',
                  id: `fx-decoy-laser-${Math.floor(Date.now())}-${nearest.id}`,
                  fromX: dcx,
                  fromY: dcy,
                  toX: bx,
                  toY: by,
                  color: 'rgba(125,211,252,0.95)',
                  createdAt: Date.now(),
                  duration: 320, // 見やすく延長(旧140msは短すぎた)
                });
                removeProjectile(nearest.id); // 敵弾を消すだけ(爆発・範囲なし)。
                playSfx('decoy-zap');         // 迎撃音(間引きあり)
              }
            }
          }
        }

        // Update enemies
        // 敵の移動のみ MOVE_SPEED_MULT 倍速(攻撃タイマー等はtimestamp基準で影響なし)。
        updateEnemies(deltaTime * MOVE_SPEED_MULT);

        // 敵のジャンプ攻撃(aiPhase 'jump')/ダッシュ攻撃(aiPhase 'charge')でも障害物を破壊(裏ボスと同仕様)。
        // 手続き生成なので破壊キーSetに入れるだけ=描画/判定とも同時に消える(軽い)。FXはスロットルで間引く。
        // labテーマは木なし・屋内は対象外。プレイヤー破壊は元々無いので敵の突進/着地時のみ。
        if (!indoor && !labTheme) {
          const crushFar = useGameStore.getState().farBackdrop;
          let crushedX = 0, crushedY = 0, crushedAny = false;
          for (const e of useGameStore.getState().enemies) {
            if (e.aiPhase !== 'jump' && e.aiPhase !== 'charge') continue;
            const PAD = 24;
            const eAABB = { x: e.x, y: e.y, width: e.width, height: e.height };
            for (const t of treesInRegion(e.x - PAD, e.y - PAD, e.x + e.width + PAD, e.y + e.height + PAD)) {
              if (rectsOverlap(eAABB, trunkRect(t))) { markObstacleDestroyed(t.key); crushedAny = true; crushedX = t.footX; crushedY = t.footY; }
            }
            for (const p of cityPropsInRegion(crushFar, e.x - PAD, e.y - PAD, e.x + e.width + PAD, e.y + e.height + PAD)) {
              const r = cityPropRect(crushFar, p);
              if (r && rectsOverlap(eAABB, r)) { markObstacleDestroyed(p.id); crushedAny = true; crushedX = p.footX; crushedY = p.footY; }
            }
          }
          if (crushedAny && newGameTime - enemyCrushFxRef.current >= BOSS_CRUSH_FX_MS) {
            enemyCrushFxRef.current = newGameTime;
            spawnBurst(crushedX, crushedY, '#fbbf24', 6);
            spawnRing(crushedX, crushedY, 6, 40, 'rgba(251,146,60,0.86)', 3, 300);
            useGameStore.getState().spawnGlow(crushedX, crushedY, 44, 'rgba(251,146,60,', 340);
            playSfx('bomb');
          }
        }

        // PACING_PUZZLE.md §5.18 M17: ⑤ジャンプ落下攻撃の爆風(pumpkinBlasts消化)。
        // src/utils/combatTick.ts へ切り出し(挙動不変・コード移動のみ)。
        applyPumpkinBlastDamage(combatEffects, combatTunables);

        // 設置シールドでジャンプ/ダッシュを防いだ瞬間の「ぶつかった感」: 接触点に火花バースト＋
        // 衝撃リング＋衝突音＋ごく短い画面揺れ。ジャンプ/ダッシュ共通(store が kind を付けて積む)。
        {
          const blocks = useGameStore.getState().shieldBlocks;
          if (blocks.length > 0) {
            playSfx('heavy-impact');
            for (const b of blocks) {
              spawnFlash('rgba(226,232,240,0.14)', 120);
              spawnRing(b.x, b.y, 8, 46, 'rgba(226,232,240,0.95)', 4, 260);   // 白い衝撃リング(金属で弾いた感)
              spawnRing(b.x, b.y, 4, 28, 'rgba(125,211,252,0.9)', 3, 220);    // 内側シアン
              spawnBurst(b.x, b.y, '#e2e8f0', 12);                            // 火花
              spawnBurst(b.x, b.y, '#7dd3fc', 6);
            }
            useGameStore.getState().triggerShake(SHIELD_BLOCK_SHAKE_MS, SHIELD_BLOCK_SHAKE_MAG);
            useGameStore.setState({ shieldBlocks: [] });
          }
        }

        // デコイ(着地後)は敵のみ通行不可。プレイヤーは通す。reaper は貫通。
        {
          const dnow = Date.now();
          const decoyBlocks = useGameStore.getState().projectiles
            .filter(p => p.weaponType === 'decoy' && dnow >= (p.decoyLandAt ?? 0))
            .map(d => ({
              x: d.x + d.width / 2 - DECOY_FOOT_W / 2,
              y: d.y + d.height / 2 - DECOY_FOOT_H / 2,
              width: DECOY_FOOT_W,
              height: DECOY_FOOT_H,
            }));
          if (decoyBlocks.length > 0) {
            const est = useGameStore.getState();
            let dmoved = false;
            const ne = est.enemies.map(enemy => {
              if (enemy.type === 'reaper') return enemy;
              const r = resolveAabb({ x: enemy.x, y: enemy.y, width: enemy.width, height: enemy.height }, decoyBlocks);
              if (r.x === enemy.x && r.y === enemy.y) return enemy;
              dmoved = true;
              return { ...enemy, x: r.x, y: r.y };
            });
            if (dmoved) useGameStore.setState({ enemies: ne });
          }
        }

        // 鞭ハリケーン: 発動中は毎フレーム(内部でスロットル)敵を鞭先端の根元へ吸引。
        useGameStore.getState().tickHurricane();

        // 錬金術: 召喚ユニットの追従/攻撃/レア吸引/消滅を毎フレーム更新。
        useGameStore.getState().updateSummons(deltaTime);

        // 自動タレット: 設置中は留まってオート射撃。前方集中=SMG相当の長射程直線、全方位=
        // ハンドガン相当の短射程ターゲット。低確率でグレネード弾。寿命終了で小爆発(範囲ダメージ)。
        // updateProjectiles の duration カリングより前に寿命を処理して爆発を出す。
        {
          const nowMs = Date.now();
          // 前方集中タレットの索敵スキャンで更新した向きを、描画(砲身の向き)へ反映するための一括書き込み。
          const turretAimWrites: { id: string; x: number; y: number }[] = [];
          // タレット発砲音の距離減衰用(社長指示): 護衛NPCと同じ npcSfxDistGain(タレット位置↔プレイヤー、画面外=無音)。
          const tGainState = useGameStore.getState();
          const tgPx = tGainState.player.x + tGainState.player.width / 2;
          const tgPy = tGainState.player.y + tGainState.player.height / 2;
          const tgCam = tGainState.camera;
          const tgGb = tGainState.gameBounds;
          for (const turret of useGameStore.getState().projectiles.filter(p => p.weaponType === 'turret')) {
            const tcx = turret.x + turret.width / 2;
            const tcy = turret.y + turret.height / 2;
            // --- 消滅時の小爆発(既存ヘビーグレネード爆発を流用、控えめ威力/範囲)。味方/プレイヤーは無傷。
            if (nowMs - turret.createdAt >= turret.duration) {
              removeProjectile(turret.id);
              turretFireRef.current.delete(turret.id);
              turretAimRef.current.delete(turret.id);
              playSfx('bomb');
              spawnRing(tcx, tcy, 8, TURRET_EXPLOSION_RADIUS, 'rgba(251,146,60,0.8)', 4, HEAVY_GRENADE_EXPLOSION_EFFECT_MS);
              spawnBurst(tcx, tcy, '#f97316', 16);
              useGameStore.getState().spawnGlow(tcx, tcy, 44, 'rgba(251,146,60,', HEAVY_GRENADE_EXPLOSION_EFFECT_MS);
              const tWalls = aoeWalls(tcx, tcy);
              for (const enemy of useGameStore.getState().enemies) {
                if (enemy.type === 'reaper') continue;
                const ex = enemy.x + enemy.width / 2;
                const ey = enemy.y + enemy.height / 2;
                const dist = Math.hypot(ex - tcx, ey - tcy);
                if (dist > TURRET_EXPLOSION_RADIUS) continue;
                if (tWalls.length > 0 && segmentBlocked(tcx, tcy, ex, ey, tWalls)) continue; // 壁越し不可
                const falloff = 1 - dist / TURRET_EXPLOSION_RADIUS;
                const dmg = Math.max(1, Math.round(TURRET_EXPLOSION_DAMAGE * (0.55 + falloff * 0.45)));
                const killed = damageEnemy(enemy.id, dmg, true); // 爆発=ボス系には非致死
                spawnDamageNumber(ex, enemy.y, dmg, false);
                if (killed) {
                  playEnemyDeath();
                  dropEnemyXp(enemy, ex, ey, `pickup-xp-turret-${nowMs}`);
                }
              }
              continue;
            }
            // --- オート射撃(モード別スロットル)+ 前方集中の索敵スキャン。
            const mode = turret.turretMode ?? 'forward';
            const interval = mode === 'omni' ? TURRET_OMNI_FIRE_MS : TURRET_FWD_FIRE_MS;
            const fireReady = gameTime >= (turretFireRef.current.get(turret.id) ?? 0);
            let dir: { x: number; y: number } | null = null;
            if (mode === 'omni') {
              if (!fireReady) continue;
              // 全方位: 射程内の最も近い敵を狙う(近い敵優先)。範囲内に敵がいなければ撃たない。
              const target = useGameStore.getState().enemies
                .filter(e => e.type !== 'reaper')
                .map(e => ({ e, d: Math.hypot(e.x + e.width / 2 - tcx, e.y + e.height / 2 - tcy) }))
                .filter(h => h.d <= TURRET_OMNI_RANGE)
                .sort((a, b) => a.d - b.d)[0]?.e;
              if (!target) continue;
              const ax = target.x + target.width / 2 - tcx;
              const ay = target.y + target.height / 2 - tcy;
              const am = Math.max(0.001, Math.hypot(ax, ay));
              dir = { x: ax / am, y: ay / am };
            } else {
              // 前方集中(連射): 現在の索敵向き(初期=設置向き)の射線帯に敵がいる時だけ撃つ。
              let aim = turretAimRef.current.get(turret.id);
              if (aim === undefined) {
                aim = Math.atan2(turret.direction.y, turret.direction.x);
                turretAimRef.current.set(turret.id, aim);
              }
              const fx = Math.cos(aim);
              const fy = Math.sin(aim);
              const hasFwdTarget = useGameStore.getState().enemies.some(e => {
                if (e.type === 'reaper') return false;
                const dx = e.x + e.width / 2 - tcx;
                const dy = e.y + e.height / 2 - tcy;
                const along = dx * fx + dy * fy;          // 前方への射影
                if (along <= 0 || along > TURRET_FWD_RANGE) return false;
                const perp = Math.abs(dx * fy - dy * fx); // 射線からの直交距離
                return perp <= TURRET_FWD_LINE_HALF_W;
              });
              if (!hasFwdTarget) {
                // 射程に敵なし: ゆっくり回転して索敵(発射しない)。向きを store へ反映し砲身を回す。
                const na = aim + TURRET_SCAN_SPEED * (deltaTime / 1000);
                turretAimRef.current.set(turret.id, na);
                turretAimWrites.push({ id: turret.id, x: Math.cos(na), y: Math.sin(na) });
                continue;
              }
              // 敵を捕捉: スキャン停止して現在の向きへ連射。
              if (!fireReady) continue;
              dir = { x: fx, y: fy };
            }
            if (!dir) continue;
            // 10%でグレネードランチャー弾(rifle-t3 と同じ直進・着弾爆発=GRENADE_WEAPON_KEY)、
            // それ以外は通常弾。手榴弾(heavy-grenade)とは別物: fuse転がしではなく直進ランチャー弾。
            // 全方位モードでもランチャー弾は現在のターゲット方向へ撃つ。
            if (Math.random() < TURRET_GRENADE_CHANCE) {
              addProjectile({
                id: `proj-turret-gl-${turret.id}-${nowMs}`,
                x: tcx - 7, y: tcy - 7, width: 14, height: 14,
                speed: TURRET_FWD_BULLET_SPEED, damage: TURRET_LAUNCHER_DAMAGE,
                direction: dir, weaponType: 'rifle', weaponKey: GRENADE_WEAPON_KEY,
                duration: 1400, createdAt: nowMs,
                passthrough: true, hitEnemies: [], hostile: false, reflected: false,
              });
              { const g = npcSfxDistGain(tcx, tcy, tgPx, tgPy, tgCam, tgGb); if (g > 0) playSfx('rifle-fire', g); }
            } else {
              const dmg = mode === 'omni' ? TURRET_OMNI_DAMAGE : TURRET_FWD_DAMAGE;
              const spd = mode === 'omni' ? TURRET_OMNI_BULLET_SPEED : TURRET_FWD_BULLET_SPEED;
              addProjectile({
                id: `proj-turret-b-${turret.id}-${nowMs}`,
                x: tcx - TURRET_BULLET_SIZE / 2, y: tcy - TURRET_BULLET_SIZE / 2,
                width: TURRET_BULLET_SIZE, height: TURRET_BULLET_SIZE,
                speed: spd, damage: dmg, direction: dir,
                weaponType: 'handgun', weaponKey: 'sub-turret',
                duration: 1400, createdAt: nowMs,
                passthrough: false, hitEnemies: [], hostile: false, reflected: false,
              });
              { const g = npcSfxDistGain(tcx, tcy, tgPx, tgPy, tgCam, tgGb); if (g > 0) playSfx('handgun-fire', g); }
            }
            turretFireRef.current.set(turret.id, gameTime + interval);
          }
          // 索敵スキャンで回した向きを描画へ反映(砲身が回る)。変化があった時だけ1回 set。
          if (turretAimWrites.length > 0) {
            const aimMap = new Map(turretAimWrites.map(w => [w.id, w]));
            useGameStore.setState(state => ({
              projectiles: state.projectiles.map(p =>
                aimMap.has(p.id)
                  ? { ...p, direction: { x: aimMap.get(p.id)!.x, y: aimMap.get(p.id)!.y } }
                  : p
              )
            }));
          }
        }

        // デコイ Lv3: 寿命切れ(自然消滅)時に小爆発(範囲ダメージ)。updateProjectiles の
        // duration カリングより前に処理して爆発を出す(タレットと同じ流儀)。damage>0=Lv3。
        // スローモーションは出さない(サブ武器爆発のルール)。reaper・味方・プレイヤーは無傷。
        {
          const nowMs = Date.now();
          for (const decoy of useGameStore.getState().projectiles.filter(
            p => p.weaponType === 'decoy' && p.damage > 0 && nowMs - p.createdAt >= p.duration
          )) {
            removeProjectile(decoy.id);
            decoyPulseRef.current.delete(decoy.id);
            const dcx = decoy.x + decoy.width / 2;
            const dcy = decoy.y + decoy.height / 2;
            playSfx('bomb');
            spawnRing(dcx, dcy, 8, DECOY_LV3_EXPLOSION_RADIUS, 'rgba(56,189,248,0.85)', 4, HEAVY_GRENADE_EXPLOSION_EFFECT_MS);
            spawnBurst(dcx, dcy, '#38bdf8', 16);
            useGameStore.getState().spawnGlow(dcx, dcy, 44, 'rgba(56,189,248,', HEAVY_GRENADE_EXPLOSION_EFFECT_MS);
            const dWalls = aoeWalls(dcx, dcy);
            for (const enemy of useGameStore.getState().enemies) {
              if (enemy.type === 'reaper') continue;
              const ex = enemy.x + enemy.width / 2;
              const ey = enemy.y + enemy.height / 2;
              const dist = Math.hypot(ex - dcx, ey - dcy);
              if (dist > DECOY_LV3_EXPLOSION_RADIUS) continue;
              if (dWalls.length > 0 && segmentBlocked(dcx, dcy, ex, ey, dWalls)) continue; // 壁越し不可
              const falloff = 1 - dist / DECOY_LV3_EXPLOSION_RADIUS;
              const dmg = Math.max(1, Math.round(decoy.damage * (0.55 + falloff * 0.45)));
              const killed = damageEnemy(enemy.id, dmg, true); // 爆発=ボス系には非致死
              spawnDamageNumber(ex, enemy.y, dmg, false);
              if (!killed && enemy.type !== 'giantbat' && enemy.type !== 'pumpkin') {
                const norm = Math.max(0.001, dist);
                useGameStore.getState().knockbackEnemy(
                  enemy.id,
                  (ex - dcx) / norm,
                  (ey - dcy) / norm,
                  DECOY_LV3_KNOCKBACK_MULT * (0.55 + falloff * 0.45)
                );
              }
              if (killed) {
                playEnemyDeath();
                dropEnemyXp(enemy, ex, ey, `pickup-xp-decoy-${nowMs}`);
              }
            }
          }
        }

        // Update projectiles
        updateProjectiles(deltaTime);

        const timedGrenades = useGameStore.getState().projectiles
          .filter(p => p.weaponType === 'grenade' && Date.now() - p.createdAt >= p.duration);
        for (const grenade of timedGrenades) {
          const gx = grenade.x + grenade.width / 2;
          const gy = grenade.y + grenade.height / 2;
          // スキル: ボマー = 手榴弾が起爆する前に一度だけ、周囲へ子グレネード3発を散布し
          // 親の信管を +1s 延長(再アームは1回のみ)。子は ×1/3 ダメージの小型手榴弾。
          // 周期/サブ武器の爆発なのでスロー無し(CLAUDE.md)。
          if (hasSkill(useGameStore.getState().player, 'bomber') && !grenade.bomberSpawned) {
            const nowB = Date.now();
            useGameStore.setState(state => ({
              projectiles: state.projectiles.map(p =>
                p.id === grenade.id ? { ...p, bomberSpawned: true, createdAt: nowB - p.duration + 1000 } : p
              ),
            }));
            for (let k = 0; k < 3; k++) {
              const ang = (Math.PI * 2 * k) / 3 + Math.random() * 0.5;
              addProjectile({
                id: `proj-bomber-mini-${grenade.id}-${nowB}-${k}`,
                x: gx - 5, y: gy - 5, width: 10, height: 10,
                speed: HEAVY_GRENADE_SPEED * 0.8,
                damage: HEAVY_GRENADE_DAMAGE / 3,
                direction: { x: Math.cos(ang), y: Math.sin(ang) },
                weaponType: 'grenade', weaponKey: 'sub-heavy-grenade',
                duration: 600, createdAt: nowB,
                passthrough: false, hitEnemies: [], hostile: false, reflected: false,
                bomberSpawned: true, // 子はこれ以上散布しない
                explodeRadius: HEAVY_GRENADE_RADIUS * 0.6, // 小ブラスト(下の爆発が blastR を参照)
              });
            }
            spawnBurst(gx, gy, '#fbbf24', 8);
            continue; // 親は +1s 後に通常どおり起爆する
          }
          removeProjectile(grenade.id);
          playSfx('bomb');
          // weaponType:'grenade' は手榴弾(heavy-grenade)専用。fuseで爆発し、半径66の小範囲。
          // グレネードランチャー(rifle-t3/タレットのランチャー弾)は別物で、着弾爆発の別経路で処理する。
          // スキル: エクスプローダー = 半径/ダメージ ×1.2(手榴弾も対象)。
          const grenadeExMult = skillExplosionMult(useGameStore.getState().player);
          // キャラ固有 ヘビーガンナー: 直近の同一攻撃2体以上ヒットで爆発範囲 ×1.1。
          const hgExMult = heavyGunnerExplosionMult(useGameStore.getState().player, gameTime);
          // 子グレネード(ボマー)は固有の半径/ダメージを持つ。未指定は通常の手榴弾値。
          const blastR = (grenade.explodeRadius ?? HEAVY_GRENADE_RADIUS) * grenadeExMult * hgExMult;
          let hgHitCount = 0;
          const grenadeBaseDamage = grenade.damage || HEAVY_GRENADE_DAMAGE;
          const fxMs = HEAVY_GRENADE_EXPLOSION_EFFECT_MS;
          spawnRing(gx, gy, 8, blastR, 'rgba(251,146,60,0.82)', 5, fxMs);
          spawnBurst(gx, gy, '#f97316', 20);
          spawnBurst(gx, gy, '#7f1d1d', 8);
          useGameStore.getState().spawnGlow(gx, gy, 50, 'rgba(251,146,60,', fxMs);
          const gWalls = aoeWalls(gx, gy);
          for (const enemy of useGameStore.getState().enemies) {
            if (enemy.type === 'reaper') continue;
            const ex = enemy.x + enemy.width / 2;
            const ey = enemy.y + enemy.height / 2;
            const dist = Math.hypot(ex - gx, ey - gy);
            if (dist > blastR) continue;
            if (gWalls.length > 0 && segmentBlocked(gx, gy, ex, ey, gWalls)) continue; // 壁越しには効かない
            const falloff = 1 - dist / blastR;
            const splashDamage = Math.max(1, Math.round(grenadeBaseDamage * grenadeExMult * (0.55 + falloff * 0.45)));
            const killed = damageEnemy(enemy.id, splashDamage, true); // 爆発=ボス系には非致死(社長指示)
            hgHitCount += 1;
            spawnDamageNumber(ex, enemy.y, splashDamage, false);
            spawnBurst(ex, ey, '#b91c1c', 4);
            if (
              !killed &&
              enemy.type !== 'giantbat' &&
              enemy.type !== 'pumpkin'
            ) {
              const norm = Math.max(0.001, dist);
              useGameStore.getState().knockbackEnemy(
                enemy.id,
                (ex - gx) / norm,
                (ey - gy) / norm,
                HEAVY_GRENADE_KNOCKBACK_MULT * (0.55 + falloff * 0.45)
              );
            }
            if (killed) {
              playEnemyDeath();
              dropEnemyXp(enemy, ex, ey, 'pickup-xp-heavy-grenade');
            }
          }
          useGameStore.getState().registerMultiHit(hgHitCount); // ヘビーガンナー: 2体以上で爆発範囲バフ
        }

        // 発火ナイフ: 飛行中は敵に当たると刺さり(単体ダメージ)、2秒後に刺さった位置で範囲爆発。
        // 刺さった後の追従は updateProjectiles 側(stuckToEnemyId)。ここでは命中判定と爆発を処理。
        {
          const fkState = useGameStore.getState();
          const knives = fkState.projectiles.filter(p => p.weaponType === 'fire-knife-projectile');
          for (const knife of knives) {
            // すでに刺さっている: 2秒経過で爆発。
            if (knife.stuckToEnemyId) {
              if (Date.now() < (knife.explodeAt ?? 0)) continue;
              const bx = knife.x + knife.width / 2;
              const by = knife.y + knife.height / 2;
              // 発火ナイフの爆発は「爆発扱い」: エクスプローダー(半径/ダメージ ×1.2/1.35/1.5)を乗せる(社長指示)。
              const fkExMult = skillExplosionMult(useGameStore.getState().player);
              // キャラ固有 ヘビーガンナー: 直近の同一攻撃2体以上ヒットで爆発範囲 ×1.1。
              const blastR = (knife.area ?? FIRE_KNIFE_RADIUS_BY_LEVEL[1]) * fkExMult * heavyGunnerExplosionMult(useGameStore.getState().player, gameTime);
              let fkHitCount = 0;
              removeProjectile(knife.id);
              playSfx('bomb');
              spawnRing(bx, by, 8, blastR, 'rgba(251,146,60,0.85)', 5, FIRE_KNIFE_EXPLOSION_EFFECT_MS);
              spawnBurst(bx, by, '#f97316', 18);
              spawnBurst(bx, by, '#7f1d1d', 8);
              useGameStore.getState().spawnGlow(bx, by, Math.round(blastR * 0.68), 'rgba(251,146,60,', FIRE_KNIFE_EXPLOSION_EFFECT_MS);
              const fkWalls = aoeWalls(bx, by);
              for (const enemy of useGameStore.getState().enemies) {
                if (enemy.type === 'reaper') continue;
                const ex = enemy.x + enemy.width / 2;
                const ey = enemy.y + enemy.height / 2;
                const dist = Math.hypot(ex - bx, ey - by);
                if (dist > blastR) continue;
                if (fkWalls.length > 0 && segmentBlocked(bx, by, ex, ey, fkWalls)) continue; // 壁越し不可
                const falloff = 1 - dist / blastR;
                const splashDamage = Math.max(1, Math.round(FIRE_KNIFE_EXPLOSION_DAMAGE * fkExMult * (0.55 + falloff * 0.45)));
                const killed = damageEnemy(enemy.id, splashDamage, true); // 爆発=ボス系には非致死
                fkHitCount += 1;
                spawnDamageNumber(ex, enemy.y, splashDamage, false);
                spawnBurst(ex, ey, '#b91c1c', 4);
                if (!killed && enemy.type !== 'giantbat' && enemy.type !== 'pumpkin') {
                  const norm = Math.max(0.001, dist);
                  useGameStore.getState().knockbackEnemy(enemy.id, (ex - bx) / norm, (ey - by) / norm, FIRE_KNIFE_KNOCKBACK_MULT * (0.55 + falloff * 0.45));
                }
                if (killed) {
                  playEnemyDeath();
                  dropEnemyXp(enemy, ex, ey, 'pickup-xp-fire-knife');
                }
              }
              useGameStore.getState().registerMultiHit(fkHitCount); // ヘビーガンナー: 2体以上で爆発範囲バフ
              continue;
            }
            // 飛行中: 非リーパー敵への命中判定(1体目に刺さる)。
            let hit: typeof fkState.enemies[number] | undefined;
            for (const e of fkState.enemies) {
              if (e.type === 'reaper') continue;
              if (checkCollision(knife, e)) { hit = e; break; }
            }
            if (hit) {
              const hx = hit.x + hit.width / 2;
              const hy = hit.y + hit.height / 2;
              const killed = damageEnemy(hit.id, knife.damage);
              spawnDamageNumber(hx, hit.y, knife.damage, false);
              spawnBurst(hx, hy, '#fb923c', 5); // 刺さった火花(軽量)
              playSfx('shot-damage');
              // 刺さる: 敵に追従し2秒後に爆発(敵が死んでも死亡地点で爆発)。
              useGameStore.getState().stickFireKnife(knife.id, hit.id, hx - knife.width / 2, hy - knife.height / 2, FIRE_KNIFE_FUSE_MS);
              if (killed) {
                playEnemyDeath();
                dropEnemyXp(hit, hx, hy, 'pickup-xp-fire-knife-hit');
              }
            }
          }
        }

        // ドローンブーメラン: 行き/戻りは貫通接触(近接同等)、停止中は0.25秒パルスで周囲に1/4ダメージ。
        // 移動/フェーズ遷移は updateProjectiles 側。ここはダメージと消滅のみ。敵弾/ヘイトには干渉しない。
        {
          const bs = useGameStore.getState();
          const booms = bs.projectiles.filter(p => p.weaponType === 'drone-boomerang-projectile');
          const liveBoomIds = new Set(booms.map(b => b.id));
          for (const id of [...boomPulseRef.current.keys()]) {
            if (!liveBoomIds.has(id)) boomPulseRef.current.delete(id);
          }
          for (const boom of booms) {
            if (boom.boomPhase === 'done') { removeProjectile(boom.id); boomPulseRef.current.delete(boom.id); continue; }
            const bx = boom.x + boom.width / 2;
            const by = boom.y + boom.height / 2;
            const phase = boom.boomPhase ?? 'out';
            if (phase === 'out' || phase === 'return') {
              // 貫通接触: 同一敵はこのフェーズで1回(hitEnemies)。行き/戻りで配列はリセット済み。
              for (const e of bs.enemies) {
                if (e.type === 'reaper') continue;
                if (boom.hitEnemies.includes(e.id)) continue;
                if (!checkCollision(boom, e)) continue;
                boom.hitEnemies.push(e.id); // store配列を直接更新(既存の貫通弾と同じ手法)
                const ex = e.x + e.width / 2, ey = e.y + e.height / 2;
                const killed = damageEnemy(e.id, boom.damage, true); // 爆発=ボス系には非致死
                spawnDamageNumber(ex, e.y, boom.damage, false);
                spawnBurst(ex, ey, '#a5f3fc', 4);
                if (killed) {
                  playEnemyDeath();
                  dropEnemyXp(e, ex, ey, `pickup-xp-boom-${Math.floor(Date.now())}`);
                }
              }
            } else if (phase === 'stop') {
              // 0.25秒ごとのパルス。範囲内の敵へ 1/4 ダメージ(同一敵は0.25秒間隔=パルス間隔)。
              const nextPulse = boomPulseRef.current.get(boom.id) ?? 0;
              if (gameTime >= nextPulse) {
                boomPulseRef.current.set(boom.id, gameTime + DRONE_BOOM_PULSE_MS);
                const r = boom.area ?? DRONE_BOOM_RADIUS;
                const dmg = Math.max(1, Math.round(boom.damage / DRONE_BOOM_STOP_DMG_DIV));
                const boomWalls = aoeWalls(bx, by);
                for (const e of bs.enemies) {
                  if (e.type === 'reaper') continue;
                  const ex = e.x + e.width / 2, ey = e.y + e.height / 2;
                  if (Math.hypot(ex - bx, ey - by) > r) continue;
                  if (boomWalls.length > 0 && segmentBlocked(bx, by, ex, ey, boomWalls)) continue; // 壁越し不可
                  const killed = damageEnemy(e.id, dmg, true); // 爆発=ボス系には非致死
                  spawnDamageNumber(ex, e.y, dmg, false);
                  if (killed) {
                    playEnemyDeath();
                    dropEnemyXp(e, ex, ey, `pickup-xp-boom-${Math.floor(Date.now())}`);
                  }
                }
              }
            }
          }
        }

        const armedTraps = useGameStore.getState().projectiles.filter(p => p.weaponType === 'trap');
        for (const trap of armedTraps) {
          const tx = trap.x + trap.width / 2;
          const ty = trap.y + trap.height / 2;
          const radius = trap.area ?? MARKSMAN_TRAP_RADIUS_BY_LEVEL[1];
          const maxTargets = Math.max(1, trap.count ?? 1);
          const alreadyHit = new Set(trap.hitEnemies);
          const remainingTargets = maxTargets - alreadyHit.size;
          if (remainingTargets <= 0) {
            removeProjectile(trap.id);
            continue;
          }
          const targets = useGameStore.getState().enemies
            .filter(enemy => enemy.type !== 'reaper')
            .filter(enemy => !alreadyHit.has(enemy.id))
            .map(enemy => ({
              enemy,
              dist: Math.hypot(enemy.x + enemy.width / 2 - tx, enemy.y + enemy.height / 2 - ty)
            }))
            .filter(hit => hit.dist <= radius)
            .sort((a, b) => a.dist - b.dist)
            .slice(0, remainingTargets);
          if (targets.length === 0) continue;
          spawnRing(tx, ty, 8, radius + 12, 'rgba(56,189,248,0.9)', 3, 360);
          spawnBurst(tx, ty, '#38bdf8', 14);
          useGameStore.getState().spawnGlow(tx, ty, radius + 28, 'rgba(56,189,248,', 320);
          targets.forEach(({ enemy }) => {
            const ex = enemy.x + enemy.width / 2;
            const ey = enemy.y + enemy.height / 2;
            rootEnemy(enemy.id, gameTime + MARKSMAN_TRAP_STUN_MS);
            spawnRing(ex, ey, 5, 28, 'rgba(125,211,252,0.86)', 2, 260);
          });
          const nextHitEnemies = [...trap.hitEnemies, ...targets.map(({ enemy }) => enemy.id)];
          if (nextHitEnemies.length >= maxTargets) {
            removeProjectile(trap.id);
          } else {
            useGameStore.setState(state => ({
              projectiles: state.projectiles.map(p =>
                p.id === trap.id ? { ...p, hitEnemies: nextHitEnemies } : p
              )
            }));
          }
        }

        // 設置型シールド処理: (1)敵の通行遮断+接触で耐久を削る、(2)敵弾の消去。
        // 味方弾/自弾は hostile でないので無視=貫通。プレイヤーは押し出し対象外=貫通。
        {
          let shields = useGameStore.getState().projectiles.filter(p => p.weaponType === 'shield');
          if (shields.length === 0) {
            if (shieldHitRef.current.size > 0) shieldHitRef.current.clear();
          } else {
            // バッシュで押し出されたシールドは、スライド終了時刻(shieldBreakAt)に強制破壊。
            const breakNow = Date.now();
            const breaking = shields.filter(s => s.shieldBreakAt !== undefined && breakNow >= s.shieldBreakAt);
            for (const s of breaking) {
              removeProjectile(s.id);
              for (const k of [...shieldHitRef.current.keys()]) {
                if (k.startsWith(`${s.id}:`)) shieldHitRef.current.delete(k);
              }
              const scx = s.x + s.width / 2;
              const scy = s.y + s.height / 2;
              spawnBurst(scx, scy, '#94a3b8', 14);
              spawnBurst(scx, scy, '#475569', 6);
              spawnRing(scx, scy, 4, Math.max(s.width, s.height), 'rgba(148,163,184,0.7)', 2, 260);
            }
            if (breaking.length > 0) shields = shields.filter(s => !breaking.includes(s));
            // 死んだシールドの debounce キーを掃除。
            const liveIds = new Set(shields.map(s => s.id));
            for (const k of [...shieldHitRef.current.keys()]) {
              if (!liveIds.has(k.slice(0, k.indexOf(':')))) shieldHitRef.current.delete(k);
            }
            const shieldRects = shields.map(s => ({ id: s.id, x: s.x, y: s.y, width: s.width, height: s.height }));
            const wallRects = shieldRects.map(s => ({ x: s.x, y: s.y, width: s.width, height: s.height }));
            const dmgByShield = new Map<string, number>();

            // (1) 敵: 通行遮断(押し出し)+接触で耐久-1(間隔制)+外向きノックバック。
            // reaper(終末個体)は貫通。knockbackEnemy は enemies を setState するため、
            // 押し出しの setState で上書きしないよう「あとでまとめて」適用する。
            const sstate = useGameStore.getState();
            let anyMoved = false;
            const toKnockback: { id: string; dx: number; dy: number }[] = [];
            const movedEnemies = sstate.enemies.map(enemy => {
              // 死神/裏ボスは物理ブロックされず「すり抜け」るが、接触ダメージ(表)は盾に与える。
              const passesThrough = enemy.type === 'reaper' || isHiddenBoss(enemy.type);
              const ebox = { x: enemy.x, y: enemy.y, width: enemy.width, height: enemy.height };
              let touched = false;
              for (const s of shieldRects) {
                if (rectsOverlap(ebox, s)) {
                  touched = true;
                  const key = `${s.id}:${enemy.id}`;
                  const allowed = shieldHitRef.current.get(key) ?? 0;
                  if (gameTime >= allowed) {
                    dmgByShield.set(s.id, (dmgByShield.get(s.id) ?? 0) + shieldContactDamage(enemy));
                    shieldHitRef.current.set(key, gameTime + SHIELD_HIT_INTERVAL_MS);
                    // ノックバック方向 = シールド中心→敵中心(来た方へ弾き返す)。
                    // 重い敵/ボス/すり抜け勢(giantbat/pumpkin/reaper/裏ボス)は弾かない。
                    if (!passesThrough && enemy.type !== 'giantbat' && enemy.type !== 'pumpkin') {
                      const ecx = enemy.x + enemy.width / 2;
                      const ecy = enemy.y + enemy.height / 2;
                      const scx = s.x + s.width / 2;
                      const scy = s.y + s.height / 2;
                      const nrm = Math.max(0.001, Math.hypot(ecx - scx, ecy - scy));
                      toKnockback.push({ id: enemy.id, dx: (ecx - scx) / nrm, dy: (ecy - scy) / nrm });
                    }
                  }
                }
              }
              if (!touched || passesThrough) return enemy; // すり抜け勢は押し戻さない
              const resolved = resolveAabb(ebox, wallRects);
              if (resolved.x === enemy.x && resolved.y === enemy.y) return enemy;
              anyMoved = true;
              return { ...enemy, x: resolved.x, y: resolved.y };
            });
            if (anyMoved) useGameStore.setState({ enemies: movedEnemies });
            for (const k of toKnockback) {
              useGameStore.getState().knockbackEnemy(k.id, k.dx, k.dy, SHIELD_KNOCKBACK_MULT);
            }

            // (2) 敵弾: シールドに重なったら消す(反射/誘導なし)。弾も耐久を1消費する。
            for (const b of useGameStore.getState().projectiles) {
              if (!b.hostile) continue;
              const bbox = { x: b.x, y: b.y, width: b.width, height: b.height };
              for (const s of shieldRects) {
                if (rectsOverlap(bbox, s)) {
                  removeProjectile(b.id);
                  dmgByShield.set(s.id, (dmgByShield.get(s.id) ?? 0) + shieldBulletDamage(b.ownerType));
                  spawnBurst(b.x + b.width / 2, b.y + b.height / 2, '#cbd5e1', 4);
                  break;
                }
              }
            }

            // 耐久反映: 0以下で倒れる演出を出して消す。残れば軽いヒット表現。
            if (dmgByShield.size > 0) {
              for (const s of shields) {
                const dealt = dmgByShield.get(s.id) ?? 0;
                if (dealt <= 0) continue;
                const scx = s.x + s.width / 2;
                const scy = s.y + s.height / 2;
                const nextHp = (s.shieldHp ?? 0) - dealt;
                if (nextHp <= 0) {
                  removeProjectile(s.id);
                  for (const k of [...shieldHitRef.current.keys()]) {
                    if (k.startsWith(`${s.id}:`)) shieldHitRef.current.delete(k);
                  }
                  spawnBurst(scx, scy, '#94a3b8', 12);
                  spawnRing(scx, scy, 4, Math.max(s.width, s.height), 'rgba(148,163,184,0.7)', 2, 260);
                } else {
                  const hitAt = Date.now();
                  useGameStore.setState(state => ({
                    projectiles: state.projectiles.map(p =>
                      p.id === s.id ? { ...p, shieldHp: nextHp, shieldHitAt: hitAt } : p // 被弾時刻=描画のシェイク/フラッシュ用
                    )
                  }));
                  spawnBurst(scx, scy, '#cbd5e1', 3);
                }
              }
            }
          }
        }

        // PACING_PUZZLE.md §5.18 M17: ②敵の発砲/③敵弾→プレイヤー命中(カウンター反射込み)。
        // src/utils/combatTick.ts へ切り出し(挙動不変・コード移動のみ)。now はこの後(プロップ衝突
        // 判定等)でも参照するため、切り出し後もここで捕捉したまま渡す(内部で取り直さない)。
        const now = Date.now();
        applyEnemyFire(now);
        applyEnemyProjectileHits(
          now, player,
          loopState.redNight?.phase === 'active' || RN_ENEMY_FORCE,
          loopState.screamerBuffUntil,
          loopState.gameTime,
          combatEffects, combatTunables,
        );

        // スケボー(投擲)の当たり: 通常弾ダメージではなく前方バッシュを出す専用処理。最初に当たった敵で発動し、
        // その板は消える。通常のダメージ衝突(下)に混ざらないよう、当たった板をここで先に取り除く。
        {
          const boards = useGameStore.getState().projectiles.filter(p => p.weaponType === 'skateboard');
          if (boards.length > 0) {
            const bEnemies = useGameStore.getState().enemies;
            const hitBoardIds = new Set<string>();
            for (const b of boards) {
              const hit = bEnemies.some(e => e.aiPhase !== 'jump' && checkCollision(b, e));
              if (hit) {
                hitBoardIds.add(b.id);
                useGameStore.getState().skaterBoardHit(b.x + b.width / 2, b.y + b.height / 2, b.direction.x, b.direction.y);
              }
            }
            if (hitBoardIds.size > 0) {
              useGameStore.setState(s => ({ projectiles: s.projectiles.filter(p => !hitBoardIds.has(p.id)) }));
            }
          }
        }

        // Check for collisions between projectiles and enemies. Read fresh
        // after updateProjectiles/updateEnemies so bullets fired or moved this
        // frame can actually hit.
        const collisionState = useGameStore.getState();
        const collisionProjectiles = collisionState.projectiles;
        const collisionEnemies = collisionState.enemies;
        const projectileEnemyCollisions = checkProjectileEnemyCollisions(collisionProjectiles, collisionEnemies);
        const projectileHitCountsByEnemy = new Map<string, number>();
        for (const { enemyId } of projectileEnemyCollisions) {
          projectileHitCountsByEnemy.set(enemyId, (projectileHitCountsByEnemy.get(enemyId) ?? 0) + 1);
        }
        // ショットガンのペレットが同一フレームに同じ敵へ何発当たったか(背中火のサイズ分岐に使用)。
        const shotgunPelletHitsByEnemy = new Map<string, number>();
        for (const { projectileId, enemyId } of projectileEnemyCollisions) {
          const p = collisionProjectiles.find(pp => pp.id === projectileId);
          if (p?.weaponType === 'shotgun') {
            shotgunPelletHitsByEnemy.set(enemyId, (shotgunPelletHitsByEnemy.get(enemyId) ?? 0) + 1);
          }
        }
        const projectilesRemovedThisFrame = new Set<string>();
        const grenadeExplodedThisFrame = new Set<string>();
        // 背中の火破裂は「敵1体につき1フレーム1本」+「直近 FIRE_JET_DEDUP_MS は1本」に間引く。ショットガン等の
        // 複数弾(=見た目は単発)は近距離だと同一フレーム、遠距離だと数フレームに分かれて命中するので両方で抑える。
        const fireJetEnemiesThisFrame = new Set<string>();
        const fireNowMs = Date.now();
        // 古い敵IDの掃除(過剰肥大化防止): 窓を十分過ぎたエントリは破棄。
        if (fireJetEnemyAtRef.current.size > 256) {
          for (const [k, t] of fireJetEnemyAtRef.current) {
            if (fireNowMs - t > FIRE_JET_DEDUP_MS * 4) fireJetEnemyAtRef.current.delete(k);
          }
        }
        
        projectileEnemyCollisions.forEach(({ projectileId, enemyId, damage, headshot }) => {
          const enemyForFx = collisionEnemies.find(e => e.id === enemyId);
          const projectile = collisionProjectiles.find(p => p.id === projectileId);

          // Apply the crit multiplier at hit time: bosses take 5× on a crit,
          // normal enemies 1.5×. `damage` is the projectile's base damage.
          const isBoss = enemyForFx ? isBossType(enemyForFx.type) : false;
          const trapCritBonus =
            enemyForFx?.rootUntil !== undefined &&
            gameTime < enemyForFx.rootUntil &&
            Math.random() < applyEnemyCritPenalty(MARKSMAN_TRAP_CRIT_BONUS, enemyForFx);
          // PACING_PUZZLE.md §5.6 M7: チャフ(バット/ゾンビ)の武器弱点=銃+10%。命中対象の型は
          // ヒット時点でしか分からない(発射時は未確定)ため、ここで対象別に追加ロールする。
          const weakCrit = WEAKCRIT_ENABLED && enemyForFx
            ? Math.random() < applyEnemyCritPenalty(weaknessCritBonus(enemyForFx.type, 'gun'), enemyForFx)
            : false;
          // PHILL銃の頭部命中は確定ヘッドショット=クリティカル扱い(×1.5＋気絶＋headshot SE＋金VFX)。
          const hitCrit = !!projectile?.crit || trapCritBonus || weakCrit || headshot === true;
          // スキル: クリティカルD上昇(+0.5) / バーサーカー(失HP%で全攻撃増) / スナイパー(停止敵・遠距離増)。
          const skillPlayer = collisionState.player;
          const critMult = hitCrit
            ? skillCritMult(skillPlayer, isBoss ? BOSS_CRIT_DAMAGE_MULT : CRIT_DAMAGE_MULT)
            : 1;
          // スキル: コンボマスターは「全攻撃」増加(ユーザー指定)。銃にもフィニッシュコンボ倍率を適用。
          const comboMasterMult = skillComboMasterMult(skillPlayer, gameTime, collisionState.meleeFinishComboCount, collisionState.meleeFinishComboUntil);
          // カウンター弾(反射弾)で一撃死するのはプラントだけ(社長指示)。それ以外は通常の反射ダメージで、
          // ボス含め普通に死にうる(社長指示で「プラント以外は死なない」protectionは廃止)。
          const plantCounterKill = !!projectile?.reflected && enemyForFx?.type === 'plant';
          const dmg = plantCounterKill
            ? (enemyForFx?.maxHealth ?? 1) + 1
            : damage * critMult * skillOutgoingDamageMult(skillPlayer) * sniperGunMult(skillPlayer, enemyForFx) * comboMasterMult;
          const enemyKilled = damageEnemy(enemyId, dmg, false, hitCrit);
          // 護衛NPCの弾の被弾音も、発砲音と同じ距離減衰をかける(遠いNPCの攻撃は被弾音も小さく/画面外は無音)。
          // プレイヤー自身の弾は等倍(gain=1)。
          let hitSfxGain = 1;
          if (projectile?.weaponKey === 'escort' && enemyForFx) {
            const hpl = collisionState.player;
            const hcam = useGameStore.getState().camera, hgb = useGameStore.getState().gameBounds;
            hitSfxGain = npcSfxDistGain(enemyForFx.x + enemyForFx.width / 2, enemyForFx.y + enemyForFx.height / 2, hpl.x + hpl.width / 2, hpl.y + hpl.height / 2, hcam, hgb);
          }
          playSfx(hitCrit ? 'headshot' : 'shot-damage', hitSfxGain);
          // 撃たれた対象の背中側(=弾の進行方向の出口)に「ドバッと火」破裂演出(2コマ立ち絵=プールsprite1枚で安い)。
          // 「敵1体につき直近 FIRE_JET_DEDUP_MS は1本」に間引く。ショットガン等の多弾(=見た目は単発)は近距離だと同一
          // フレーム、遠距離だと数フレームに分かれて命中するため、フレーム単位の間引きだけでは「2本生える」を防げない。
          const lastJetAt = fireJetEnemyAtRef.current.get(enemyId) ?? -Infinity;
          if (enemyForFx && projectile && !fireJetEnemiesThisFrame.has(enemyId) && fireNowMs - lastJetAt >= FIRE_JET_DEDUP_MS) {
            fireJetEnemiesThisFrame.add(enemyId);
            fireJetEnemyAtRef.current.set(enemyId, fireNowMs);
            const ecx = enemyForFx.x + enemyForFx.width / 2, ecy = enemyForFx.y + enemyForFx.height / 2;
            let dx = projectile.direction.x, dy = projectile.direction.y;
            const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
            const ox = ecx + dx * (enemyForFx.width * 0.42), oy = ecy + dy * (enemyForFx.height * 0.18);
            const ang = Math.atan2(dy, dx);
            const fireLen = hitFireLen(projectile.weaponType, shotgunPelletHitsByEnemy.get(enemyId) ?? 1); // 銃系統で大きさ可変(社長指示)
            useGameStore.getState().spawnFireJet(ox, oy, ang, fireLen);
            useGameStore.getState().spawnGlow(ox, oy, 20, 'rgba(251,146,60,', 150); // 根元の小グロー(プール済み=安い)
          }
          // NPCセリフ9: 護衛弾(weaponKey='escort')が敵を倒したら、撃破地点に最も近い護衛が反応(低頻度・CD)。
          if (enemyKilled && projectile?.weaponKey === 'escort' && enemyForFx) {
            useGameStore.getState().npcKillReact(enemyForFx.x + enemyForFx.width / 2, enemyForFx.y + enemyForFx.height / 2);
          } else if (enemyKilled && projectile && projectile.weaponKey !== 'escort') {
            // NPCセリフ10: プレイヤー弾の撃破を直近ウィンドウで数え、短時間に多数=無双で近くの護衛が称賛(CDのみ・頻繁)。
            const t = Date.now();
            const arr = playerKillTimesRef.current;
            arr.push(t);
            while (arr.length && t - arr[0] > PRAISE_WINDOW_MS) arr.shift();
            if (arr.length >= PRAISE_KILL_COUNT) {
              useGameStore.getState().npcPraiseReact();
              arr.length = 0; // 発火したら区切る(CDで頻度管理)
            }
          }

          // 裏ボス: カウンター弾(反射弾)を食らうと、プレイヤーの反対側 BOSS_COUNTER_WARP_DIST へワープ(社長指示)。
          // ワープ先でフラッシュ＋0.5秒フェードイン(reaperWarpAlpha を boss controller が駆動)。即死(ワーム)時は除外。
          if (projectile?.reflected && enemyForFx && isHiddenBoss(enemyForFx.type) && !enemyKilled
              && Date.now() >= bossRef.current.warpUntil) {
            const wpl = useGameStore.getState().player;
            const wpcx = wpl.x + wpl.width / 2, wpcy = wpl.y + wpl.height / 2;
            const bcx0 = enemyForFx.x + enemyForFx.width / 2, bcy0 = enemyForFx.y + enemyForFx.height / 2;
            let ux = bcx0 - wpcx, uy = bcy0 - wpcy;
            const um = Math.hypot(ux, uy) || 1;
            ux /= um; uy /= um; // プレイヤー→ボス現在地の向き
            // 反対側 = プレイヤーから -向き へ DIST。新しい中心→左上に変換。
            const ncx = wpcx - ux * BOSS_COUNTER_WARP_DIST, ncy = wpcy - uy * BOSS_COUNTER_WARP_DIST;
            const nx = ncx - enemyForFx.width / 2, ny = ncy - enemyForFx.height / 2;
            bossRef.current.warpUntil = Date.now() + BOSS_WARP_FADE_MS;
            bossRef.current.lastX = nx; bossRef.current.lastY = ny;
            useGameStore.setState(st => ({
              enemies: st.enemies.map(en => en.id === enemyForFx.id
                ? { ...en, x: nx, y: ny, reaperWarpAlpha: 0, knockbackUntil: 0 } : en),
            }));
            // ワープ先のフラッシュ演出。
            spawnFlash('rgba(199,210,254,0.18)', 160);
            useGameStore.getState().spawnGlow(ncx, ncy, 64, 'rgba(165,180,252,', 360);
            spawnRing(ncx, ncy, 8, 70, 'rgba(199,210,254,0.95)', 4, 320);
            spawnBurst(ncx, ncy, '#c7d2fe', 14);
            playSfx('counter');
          }

          if (enemyForFx) {
            const hitX = enemyForFx.x + enemyForFx.width / 2;
            const hitY = enemyForFx.y + enemyForFx.height / 2;
            // §5.23 M22 C1: 血しぶきの方向=弾の進行方向(出口側=貫通していく向き)。
            const bDirX = DIRFX_ENABLED && projectile ? projectile.direction.x : undefined;
            const bDirY = DIRFX_ENABLED && projectile ? projectile.direction.y : undefined;
            spawnBurst(hitX, hitY, '#b91c1c', hitCrit ? 8 : 5, bDirX, bDirY);
            spawnBurst(hitX, hitY, '#7f1d1d', hitCrit ? 4 : 2, bDirX, bDirY);
          }

          // Crit / headshot juice: gold shockwave + sparks + glow.
          if (hitCrit && enemyForFx) {
            const cex = enemyForFx.x + enemyForFx.width / 2;
            const cey = enemyForFx.y + enemyForFx.height / 2;
            spawnRing(cex, cey, 8, 46, 'rgba(253,224,71,0.95)', 3, 300);
            spawnBurst(cex, cey, '#fde047', 10);
            useGameStore.getState().spawnGlow(cex, cey, 34, 'rgba(253,224,71,', 240);
          }

          if (
            projectile?.weaponKey === GRENADE_WEAPON_KEY &&
            enemyForFx &&
            !grenadeExplodedThisFrame.has(projectileId)
          ) {
            grenadeExplodedThisFrame.add(projectileId);
            playSfx('bomb'); // グレネードランチャー着弾爆発音(手榴弾と統一)。
            // スキル: エクスプローダー = 爆発の半径/ダメージ ×1.2。
            // キャラ固有 ヘビーガンナー: 直近の同一攻撃2体以上ヒットで爆発範囲 ×1.1。
            const exMult = skillExplosionMult(skillPlayer);
            const exRadius = GRENADE_BLAST_RADIUS * exMult * heavyGunnerExplosionMult(skillPlayer, gameTime);
            let glHitCount = 1; // 直撃した敵を含む
            const blastX = enemyForFx.x + enemyForFx.width / 2;
            const blastY = enemyForFx.y + enemyForFx.height / 2;
            spawnRing(blastX, blastY, 10, exRadius, 'rgba(251,146,60,0.82)', 5, GRENADE_LAUNCHER_EXPLOSION_EFFECT_MS);
            spawnBurst(blastX, blastY, '#f97316', 24);
            spawnBurst(blastX, blastY, '#7f1d1d', 10);
            useGameStore.getState().spawnGlow(blastX, blastY, 58, 'rgba(251,146,60,', GRENADE_LAUNCHER_EXPLOSION_EFFECT_MS);

            const splashBase = dmg * GRENADE_BLAST_DAMAGE_MULT * exMult;
            const glWalls = aoeWalls(blastX, blastY);
            for (const splashEnemy of useGameStore.getState().enemies) {
              if (splashEnemy.id === enemyId || splashEnemy.type === 'reaper') continue;
              const sx = splashEnemy.x + splashEnemy.width / 2;
              const sy = splashEnemy.y + splashEnemy.height / 2;
              const dist = Math.hypot(sx - blastX, sy - blastY);
              if (dist > exRadius) continue;
              if (glWalls.length > 0 && segmentBlocked(blastX, blastY, sx, sy, glWalls)) continue; // 壁越し不可
              const falloff = 1 - dist / exRadius;
              const splashDamage = Math.max(1, Math.round(splashBase * (0.55 + falloff * 0.45)));
              const splashKilled = damageEnemy(splashEnemy.id, splashDamage, true); // 爆発=ボス系には非致死
              glHitCount += 1;
              spawnDamageNumber(sx, splashEnemy.y, splashDamage, hitCrit);
              spawnBurst(sx, sy, '#b91c1c', hitCrit ? 7 : 4);
              if (splashKilled) {
                playEnemyDeath();
                spawnBurst(sx, sy, '#dc2626', 12);
                useGameStore.getState().dropEnemyCurrency(splashEnemy, sx, sy);
                dropEnemyXp(splashEnemy, sx, sy, 'pickup-xp-grenade');
              }
            }
            useGameStore.getState().registerMultiHit(glHitCount); // ヘビーガンナー: 2体以上で爆発範囲バフ
          }

          // スキル弾: explodeOnHit(ファイアシューター/ボムカウンター)の小爆発。
          // 命中位置で爆発し、周囲の敵に dmg×explodeDamageMult を半径フォールオフで与える。
          // 周期/弾の爆発なのでスロー無し(CLAUDE.md)。
          if (projectile?.explodeOnHit && enemyForFx && !grenadeExplodedThisFrame.has(projectileId)) {
            grenadeExplodedThisFrame.add(projectileId);
            // ホーミング弾の着弾爆発音(グレネードランチャー/手榴弾と統一)。
            if (projectile.weaponType === 'homing-missile') playSfx('bomb');
            const exMult = skillExplosionMult(skillPlayer);
            // キャラ固有 ヘビーガンナー: 直近の同一攻撃2体以上ヒットで爆発範囲 ×1.1。
            const exRadius = (projectile.explodeRadius ?? HEAVY_GRENADE_RADIUS) * exMult * heavyGunnerExplosionMult(skillPlayer, gameTime);
            let exHitCount = 1; // 直撃した敵を含む
            const blastX = enemyForFx.x + enemyForFx.width / 2;
            const blastY = enemyForFx.y + enemyForFx.height / 2;
            spawnRing(blastX, blastY, 8, exRadius, 'rgba(251,146,60,0.8)', 5, HEAVY_GRENADE_EXPLOSION_EFFECT_MS);
            spawnBurst(blastX, blastY, '#f97316', 16);
            spawnBurst(blastX, blastY, '#7f1d1d', 6);
            useGameStore.getState().spawnGlow(blastX, blastY, 46, 'rgba(251,146,60,', HEAVY_GRENADE_EXPLOSION_EFFECT_MS);
            const splashBase = dmg * (projectile.explodeDamageMult ?? 1) * exMult;
            const exWalls = aoeWalls(blastX, blastY);
            for (const splashEnemy of useGameStore.getState().enemies) {
              if (splashEnemy.id === enemyId || splashEnemy.type === 'reaper') continue;
              const sx = splashEnemy.x + splashEnemy.width / 2;
              const sy = splashEnemy.y + splashEnemy.height / 2;
              const dist = Math.hypot(sx - blastX, sy - blastY);
              if (dist > exRadius) continue;
              if (exWalls.length > 0 && segmentBlocked(blastX, blastY, sx, sy, exWalls)) continue;
              const falloff = 1 - dist / exRadius;
              const splashDamage = Math.max(1, Math.round(splashBase * (0.55 + falloff * 0.45)));
              const splashKilled = damageEnemy(splashEnemy.id, splashDamage, true); // 爆発=ボス系には非致死
              exHitCount += 1;
              spawnDamageNumber(sx, splashEnemy.y, splashDamage, false);
              if (splashKilled) {
                playEnemyDeath();
                useGameStore.getState().dropEnemyCurrency(splashEnemy, sx, sy);
                dropEnemyXp(splashEnemy, sx, sy, 'pickup-xp-skillblast');
              }
            }
            useGameStore.getState().registerMultiHit(exHitCount); // ヘビーガンナー: 2体以上で爆発範囲バフ
            // スキル: ボマー = ホーミング弾命中時にも子グレネード3発を散布。
            if (hasSkill(skillPlayer, 'bomber') && projectile.weaponType === 'homing-missile' && !projectile.bomberSpawned) {
              const nowB = Date.now();
              useGameStore.setState(state => ({
                projectiles: state.projectiles.map(p =>
                  p.id === projectileId ? { ...p, bomberSpawned: true } : p
                ),
              }));
              for (let k = 0; k < 3; k++) {
                const ang = (Math.PI * 2 * k) / 3 + Math.random() * 0.5;
                addProjectile({
                  id: `proj-bomber-mini-${projectileId}-${nowB}-${k}`,
                  x: blastX - 5, y: blastY - 5, width: 10, height: 10,
                  speed: HEAVY_GRENADE_SPEED * 0.8,
                  damage: HEAVY_GRENADE_DAMAGE / 3,
                  direction: { x: Math.cos(ang), y: Math.sin(ang) },
                  weaponType: 'grenade', weaponKey: 'sub-heavy-grenade',
                  duration: 600, createdAt: nowB,
                  passthrough: false, hitEnemies: [], hostile: false, reflected: false,
                  bomberSpawned: true,
                  explodeRadius: HEAVY_GRENADE_RADIUS * 0.6,
                });
              }
              spawnBurst(blastX, blastY, '#fbbf24', 8);
            }
          }

          // スキル: リコシェ = 通常銃弾命中時に20%で最寄りの別の敵へ ×0.5 の跳弾を1発。
          // 二次跳弾は禁止(ricochet フラグ)。グレネード/反射弾/爆発弾/既跳弾は対象外。1バウンドで有界。
          const ricochetLv = skillLevel(skillPlayer, 'ricochet');
          if (
            projectile && enemyForFx && !projectile.ricochet && !projectile.reflected &&
            !projectile.explodeOnHit && projectile.weaponKey !== GRENADE_WEAPON_KEY &&
            ricochetLv && Math.random() < [0, 0.2, 0.3, 0.4][ricochetLv]
          ) {
            const ox = enemyForFx.x + enemyForFx.width / 2;
            const oy = enemyForFx.y + enemyForFx.height / 2;
            let target: typeof enemyForFx | undefined;
            let bestD2 = Infinity;
            for (const other of useGameStore.getState().enemies) {
              if (other.id === enemyId || other.type === 'reaper') continue;
              const d2 = (other.x + other.width / 2 - ox) ** 2 + (other.y + other.height / 2 - oy) ** 2;
              if (d2 < bestD2) { bestD2 = d2; target = other; }
            }
            if (target) {
              const tx = target.x + target.width / 2;
              const ty = target.y + target.height / 2;
              const rd = Math.max(0.001, Math.hypot(tx - ox, ty - oy));
              addProjectile({
                id: `proj-ricochet-${projectileId}-${Date.now()}`,
                x: ox - 4, y: oy - 4, width: 8, height: 8,
                speed: Math.max(420, projectile.speed),
                damage: projectile.damage * [0, 0.5, 0.6, 0.7][ricochetLv],
                direction: { x: (tx - ox) / rd, y: (ty - oy) / rd },
                weaponType: projectile.weaponType,
                weaponKey: projectile.weaponKey,
                duration: 900, createdAt: Date.now(),
                passthrough: false, hitEnemies: [], hostile: false, reflected: false,
                ricochet: true,
              });
              spawnBurst(ox, oy, '#fcd34d', 5);
            }
          }

          // Floating damage number at the enemy's body. Reflected bolts and
          // crits both render in the gold "big hit" color.
          if (enemyForFx) {
            spawnDamageNumber(
              enemyForFx.x + enemyForFx.width / 2,
              enemyForFx.y,
              dmg,
              !!projectile?.reflected || hitCrit
            );
          }

          // Light knockback on every connecting bullet — staggers normal
          // enemies along the shot line. Heavies/bosses are immovable so they
          // don't get shoved around by chip damage.
          if (
            !enemyKilled && enemyForFx && projectile &&
            enemyForFx.type !== 'reaper' && enemyForFx.type !== 'giantbat' &&
            enemyForFx.type !== 'pumpkin'
          ) {
            const hitCount = projectileHitCountsByEnemy.get(enemyId) ?? 1;
            const pelletKnockback = projectile.weaponType === 'shotgun' ? 1.35 : 1;
            // PHILL銃の胴体(非ヘッドショット)命中は通常の2倍ノックバック。
            const phillBody = projectile.weaponType === 'phill-bullet' && headshot !== true;
            const baseKb = Math.min(3, hitCount * pelletKnockback);
            useGameStore.getState().knockbackEnemy(
              enemyId,
              projectile.direction.x,
              projectile.direction.y,
              phillBody ? baseKb * 2 : baseKb
            );
          }

          // Crit that didn't outright kill → stun the target so it can be
          // executed with a melee finisher. Mark it with a brief yellow ring.
          if (hitCrit && !enemyKilled && enemyForFx) {
            // 気絶時間アップ(パッシブ): フィニッシュ受付時間を stunDurationMult 倍に。
            const stunMs = STUN_DURATION_MS * (useGameStore.getState().player.stunDurationMult ?? 1);
            useGameStore.getState().stunEnemy(enemyId, gameTime + stunMs);
            spawnRing(
              enemyForFx.x + enemyForFx.width / 2,
              enemyForFx.y + enemyForFx.height / 2,
              6, 30, 'rgba(250, 204, 21, 0.9)', 2, 260
            );
          }

          // Despawn rules:
          //  - piercing N rounds (revolver): pass through anything until they've
          //    struck pierce+1 enemies, regardless of kills.
          //  - unlimited passthrough (sniper/grenade): stop on a kill.
          //  - everything else: stop on first hit.
          if (projectile) {
            const removeIt =
              projectile.weaponKey === GRENADE_WEAPON_KEY
                ? true
                : projectile.pierce !== undefined
                ? projectile.hitEnemies.length > projectile.pierce
                : projectile.passthrough
                  ? enemyKilled
                  : true;
            if (removeIt) removeProjectile(projectileId);
            if (removeIt) projectilesRemovedThisFrame.add(projectileId);
          }

          // If enemy was killed, spawn pickups. VS-style drop table:
          //   - always an XP gem; its `value` becomes the gem tier.
          //   - rare chicken (HP), magnet, bomb. Elites/giantbats roll richer.
          if (enemyKilled) {
            // Random zombie grunt on a gun/projectile kill. Melee finishers use
            // kill.mp3 instead (wired via the counter result); bomb clears use
            // the bomb sound, so they don't double up here.
            playEnemyDeath();
            const enemy = collisionEnemies.find(e => e.id === enemyId);
            if (enemy) {
              // Death splash: red burst so kills read as blood/hit impact.
              const ex = enemy.x + enemy.width / 2;
              const ey = enemy.y + enemy.height / 2;
              const bloodCount = enemy.type === 'pumpkin' || enemy.type === 'giantbat' ? 30 : 16;
              // §5.23 M22 C1: 弾/接触キルの死亡血しぶきも弾の進行方向へ寄せる(弾が無い接触キル等はundefined=従来の全方位)。
              const kDirX = DIRFX_ENABLED && projectile ? projectile.direction.x : undefined;
              const kDirY = DIRFX_ENABLED && projectile ? projectile.direction.y : undefined;
              spawnBurst(
                ex,
                ey,
                '#dc2626',
                bloodCount,
                kDirX,
                kDirY
              );
              spawnBurst(ex, ey, '#7f1d1d', Math.max(6, Math.floor(bloodCount * 0.45)), kDirX, kDirY);
              spawnRing(ex, ey, 4, enemy.type === 'pumpkin' || enemy.type === 'giantbat' ? 38 : 24, 'rgba(185,28,28,0.72)', 3, 300);
              useGameStore.getState().dropEnemyCurrency(enemy, ex, ey);

              dropEnemyXp(enemy, ex, ey, 'pickup-xp');
              const isElite = enemy.type === 'pumpkin' || enemy.type === 'giantbat';
              if (isElite) {
                // Mid-boss drop — a weapon crate. Picking it up opens it and
                // rolls a new gun (category & tier weighted by run time).
                addPickup({
                  id: `pickup-crate-${enemy.id}`,
                  x: enemy.x + enemy.width / 2 - 8,
                  y: enemy.y + enemy.height / 2 - 8 - 18,
                  type: 'weapon-crate',
                  value: 0,
                  worldDrop: true
                });
                spawnRing(
                  enemy.x + enemy.width / 2,
                  enemy.y + enemy.height / 2,
                  10, 80, 'rgba(96,165,250,0.7)', 3, 500
                );
              }
              // Ammo resupply: every kill rolls an ammo drop at the start-screen
              // drop rate, so the slider governs the whole ammo economy. (Before,
              // only melee kills dropped — but the gun lands most killing blows,
              // so the rate felt far lower than set.) Active gun's family.
              // 弾薬ドロップ率アップ(パッシブ): 既定ドロップ率に ammoDropBonus を加算(0..1)。
              const gunKillDropRate = Math.max(0, Math.min(1,
                useGameStore.getState().meleeAmmoDropPercent / 100 + (useGameStore.getState().player.ammoDropBonus ?? 0) + (useGameStore.getState().player.equipBonus?.ammoDropBonus ?? 0)
              ));
              // 研究所(屋内)は通常ドロップ無し: PHILL弾は固定3箇所＋近接フィニッシュのみ。
              // ナイフマスターは弾薬ドロップ0%(社長指示)。
              if (!indoor && !hasSkill(player, 'knife-master') && Math.random() < gunKillDropRate) {
                const equippedAmmo = getActiveGun(player)?.ammoType;
                const owned = getGuns(player)
                  .map(w => w.ammoType)
                  .filter((t): t is AmmoType => !!t);
                // M5(§5.5・RE4式): 残弾割合が最小の弾種を落とす(同率は構え優先・phill対象外)。
                // ?ammosmart=0で従来(構え銃の弾種)へ。ドロップ率・供給量は不変=弾種の配分のみ。
                const smartType = AMMO_SMART_ENABLED
                  ? pickAmmoDropType(owned.map(t => ({ type: t, reserve: ammoPoolFor(player, t), max: AMMO_MAX[t] })), equippedAmmo)
                  : null;
                const dropType = smartType ?? equippedAmmo ?? owned[0];
                if (dropType) {
                  addPickup({
                    id: `pickup-ammo-${enemy.id}`,
                    x: enemy.x + enemy.width / 2 - 8 + 16,
                    y: enemy.y + enemy.height / 2 - 8,
                    type: `ammo-${dropType}` as 'ammo-handgun' | 'ammo-shotgun' | 'ammo-rifle',
                    value: 0,
                    worldDrop: true
                  });
                }
              }
              // Rare world weapon drop (~1%, elites a bit higher).
              if (Math.random() < (isElite ? 0.06 : 0.01)) {
                addPickup({
                  id: `pickup-weapon-${enemy.id}`,
                  x: enemy.x + enemy.width / 2 - 8,
                  y: enemy.y + enemy.height / 2 - 8 + 16,
                  type: 'weapon-drop',
                  value: 0,
                  weaponKey: rollWeaponKey(areaZoneIndexFor(Math.hypot(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2))),
                  worldDrop: true
                });
              }
              const chickenChance = isElite ? 0.35 : 0.015;
              const magnetChance = isElite ? 0.15 : 0.004;
              const bombChance = isElite ? 0.1 : 0.002;
              if (Math.random() < chickenChance) {
                addPickup({
                  id: `pickup-chicken-${enemy.id}`,
                  x: enemy.x + enemy.width / 2 - 8,
                  y: enemy.y + enemy.height / 2 - 8 + 18,
                  type: 'health',
                  value: 30,
                  worldDrop: true
                });
              }
              if (Math.random() < magnetChance) {
                addPickup({
                  id: `pickup-magnet-${enemy.id}`,
                  x: enemy.x + enemy.width / 2 - 8 + 14,
                  y: enemy.y + enemy.height / 2 - 8,
                  type: 'magnet',
                  value: 0
                });
              }
              if (!indoor && Math.random() < bombChance) { // 研究所(屋内)は爆弾を出さない(社長指示)
                addPickup({
                  id: `pickup-bomb-${enemy.id}`,
                  x: enemy.x + enemy.width / 2 - 8 - 14,
                  y: enemy.y + enemy.height / 2 - 8,
                  type: 'bomb',
                  value: 0
                });
              }
            }
          }
        });

        // Projectiles can also break small environmental props such as torches.
        const propProjectiles = useGameStore.getState().projectiles;
        const liveProps = useGameStore.getState().breakableProps;
        for (const projectile of propProjectiles) {
          if (projectilesRemovedThisFrame.has(projectile.id)) continue;
          if (projectile.hostile || projectile.createdAt > now) continue;
          // 松明(torch)は弾がすり抜ける(社長指示)=衝突/破壊対象から除外。他の小物(機雷/UVバー/卵等)は従来どおり。
          const hitProp = liveProps.find(prop => prop.type !== 'torch' && checkCollision(projectile, prop));
          if (!hitProp) continue;

          const broken = damageBreakableProp(hitProp.id, projectile.damage);
          removeProjectile(projectile.id);
          projectilesRemovedThisFrame.add(projectile.id);

          const fxX = hitProp.footX;
          const fxY = hitProp.footY - hitProp.height * 0.9;
          if (broken) {
            if (broken.type === 'mine') {
              spawnEggFluidSplash(fxX, fxY, 0.82);
            } else {
              const isUv = broken.type === 'uv-bar'; // UVバーは紫の破壊エフェクト
              spawnBurst(fxX, fxY, isUv ? '#a855f7' : '#f97316', 20);
              spawnBurst(fxX, fxY, isUv ? '#e9d5ff' : '#fde68a', 8);
              spawnRing(fxX, fxY, 6, 36, isUv ? 'rgba(168,85,247,0.86)' : 'rgba(251,146,60,0.86)', 3, 340);
              useGameStore.getState().spawnGlow(fxX, fxY, 48, isUv ? 'rgba(168,85,247,' : 'rgba(251,146,60,', 380);
              dropBreakablePropLoot(broken);
            }
          } else {
            spawnBurst(fxX, fxY, '#fbbf24', 5);
          }
        }

        // Insect eggs are passable traps: no loot, one hit to burst, but
        // stepping on one splashes corrosive green fluid and hurts the player.
        // The invulnerability window keeps a clustered patch from deleting the
        // whole HP bar at once.
        // PACING_PUZZLE.md §5.18 M17: ④地雷。src/utils/combatTick.ts へ切り出し(挙動不変)。
        applyMineDamage(combatEffects);
        
        // ワイヤーアンカーの毎フレーム処理。
        // フリックで刺す(triggerWireAnchor)→ 1秒後(wirePlantUntil)に startWireDash で高速移動開始 →
        // 移動中は無敵+敵すり抜け(すり抜けた敵へ近接小ダメージ)→ 着地点爆撃は Lv3 のみ(ダメージ付き)。
        {
          const wp = useGameStore.getState().player;
          const nowW = Date.now();
          const pcx = wp.x + wp.width / 2;
          const pcy = wp.y + wp.height / 2;
          const meleeDmg = (wp.weapons.find(w => w.isMelee)?.damage ?? 6);
          // 刺し待ち(1秒)が明けたら、その地点へ自動で高速移動を開始する。
          if (wp.wireAnchored && nowW >= wp.wirePlantUntil) {
            useGameStore.getState().startWireDash();
          }
          // ワイヤーダッシュ中: すり抜けた敵に攻撃(1ダッシュにつき敵1回)。
          // Lv1/2 = 近接小ダメージ。Lv3 = すり抜け攻撃が「爆発」化(通過した敵を中心に小範囲AoE・社長指示)。
          if (wp.wireDashUntil > 0 && nowW < wp.wireDashUntil) {
            if (wirePassHitRef.current.dash !== wp.wireDashUntil) {
              wirePassHitRef.current = { dash: wp.wireDashUntil, ids: new Set() };
            }
            const seen = wirePassHitRef.current.ids;
            const wireLvl = Math.max(1, Math.min(3, wp.subWeaponLevels['wire-anchor'] ?? 1));
            const passExplode = wireLvl >= 3;
            const dmg = passExplode ? meleeDmg * WIRE_BOMB_DAMAGE_MULT : meleeDmg * WIRE_PASS_DAMAGE_MULT;
            for (const e of useGameStore.getState().enemies) {
              if (seen.has(e.id)) continue;
              if (e.id === wp.wireSlamEnemyId) continue; // 大技の斬り下ろし対象は着地フィニッシュに残す(すり抜け小ダメージで先に倒さない)
              if (e.aiPhase === 'jump') continue; // 空中無敵は対象外
              if (!checkCollision(wp, e)) continue; // プレイヤーが重なった=すり抜け
              seen.add(e.id);
              const ecx = e.x + e.width / 2, ecy = e.y + e.height / 2;
              if (passExplode) {
                // すり抜け爆発: 通過した敵を中心に小範囲AoE。ボス系は非致死(爆発)。
                const aoe = useGameStore.getState().enemies.filter(o => {
                  if (o.aiPhase === 'jump') return false;
                  const ox = o.x + o.width / 2, oy = o.y + o.height / 2;
                  return Math.hypot(ox - ecx, oy - ecy) <= WIRE_PASS_BOMB_RADIUS + Math.max(o.width, o.height) / 2;
                });
                aoe.forEach(o => {
                  const oxc = o.x + o.width / 2, oyc = o.y + o.height / 2;
                  const killed = useGameStore.getState().damageEnemy(o.id, dmg, true); // 爆発=ボス非致死
                  spawnDamageNumber(oxc, o.y, dmg, true);
                  if (!killed && nowW >= (o.knockbackImmuneUntil ?? 0)) {
                    const kdx = oxc - ecx, kdy = oyc - ecy;
                    const kdd = Math.hypot(kdx, kdy) || 1;
                    useGameStore.setState({
                      enemies: useGameStore.getState().enemies.map(x => x.id === o.id ? {
                        ...x,
                        knockbackVx: (kdx / kdd) * WIRE_LAND_KNOCKBACK_SPEED,
                        knockbackVy: (kdy / kdd) * WIRE_LAND_KNOCKBACK_SPEED,
                        knockbackUntil: nowW + KNOCKBACK_DURATION,
                        knockbackImmuneUntil: nowW + KNOCKBACK_IMMUNE_MS,
                      } : x),
                    });
                  }
                });
                spawnRing(ecx, ecy, 8, WIRE_PASS_BOMB_RADIUS, 'rgba(147,197,253,0.9)', 4, 280);
                spawnBurst(ecx, ecy, '#93c5fd', 12);
                playSfx('bomb');
                continue;
              }
              const killed = useGameStore.getState().damageEnemy(e.id, dmg);
              spawnDamageNumber(ecx, e.y, dmg, false);
              useGameStore.getState().spawnSlash(ecx, ecy, 'rgba(186,230,253,0.95)');
              if (!killed && nowW >= (e.knockbackImmuneUntil ?? 0)) {
                const dx = ecx - pcx, dy = ecy - pcy;
                const dd = Math.hypot(dx, dy) || 1;
                useGameStore.setState({
                  enemies: useGameStore.getState().enemies.map(x => x.id === e.id ? {
                    ...x,
                    knockbackVx: (dx / dd) * WIRE_LAND_KNOCKBACK_SPEED,
                    knockbackVy: (dy / dd) * WIRE_LAND_KNOCKBACK_SPEED,
                    knockbackUntil: nowW + KNOCKBACK_DURATION,
                    knockbackImmuneUntil: nowW + KNOCKBACK_IMMUNE_MS,
                  } : x),
                });
              }
            }
          }
          // ワイヤーダッシュ着地: 到着フレームで1回だけ。爆撃(範囲ダメージ)は Lv3 のみ。
          // wireDashUntil は常に増加するタイムスタンプなので、処理済みの値を覚えて重複発火を防ぐ。
          if (wp.wireDashUntil > 0 && nowW >= wp.wireDashUntil && wireLandedDashRef.current !== wp.wireDashUntil) {
            wireLandedDashRef.current = wp.wireDashUntil;
            // 大技(敵に刺さって引き上げた)の着地: 斬り下ろし対象を「ぶった切る」。通常敵=即死フィニッシュ、
            // ボスは即死せず近接フィニッシュ相当(×5)ダメージ。垂直スラッシュ演出付き。続けて下の着地ノックバックも走る。
            if (wp.wireSlamEnemyId) {
              const tgt = useGameStore.getState().enemies.find(e => e.id === wp.wireSlamEnemyId);
              if (tgt && tgt.health > 0) {
                const tcx = tgt.x + tgt.width / 2, tcy = tgt.y + tgt.height / 2;
                if (isBossType(tgt.type)) {
                  const bdmg = Math.max(1, Math.round(meleeDmg * BOSS_MELEE_STUN_MULT));
                  // §5.21-追補4: フィニッシュ相当ダメージなのでviaMeleeFinish=true(finishKillOnlyボスの
                  // 通常許容と同じ。nonLethalBoss=trueで即死自体は元々しない)。
                  useGameStore.getState().damageEnemy(tgt.id, bdmg, true, false, true); // ボス非致死
                  spawnDamageNumber(tcx, tgt.y, bdmg, true);
                } else {
                  useGameStore.getState().damageEnemy(tgt.id, tgt.health + 1, false, false, true); // 即死フィニッシュ
                }
                useGameStore.getState().spawnSlash(tcx, tcy - 12, 'rgba(186,230,253,0.98)'); // 縦の斬り下ろし
                useGameStore.getState().spawnSlash(tcx, tcy + 12, 'rgba(147,197,253,0.9)');
                spawnBurst(tcx, tcy, '#bae6fd', 14);
                playSfx('slash-damage');
              }
              useGameStore.setState({ player: { ...useGameStore.getState().player, wireSlamEnemyId: '', wireSlamStart: 0 } });
            }
            const lvl = Math.max(1, Math.min(3, wp.subWeaponLevels['wire-anchor'] ?? 1));
            const explode = lvl >= 3;
            const dmg = meleeDmg * WIRE_BOMB_DAMAGE_MULT;
            // 着地は全Lvで周囲の敵を「強制ノックバック」(無敵無視で必ず弾く・社長指示)。
            // 直前のすり抜けで knockbackImmuneUntil が立つため、ゲートすると着地で弾かなくなっていた。
            // Lv3 はさらに範囲ダメージ(ボス系は非致死)。
            const kbSpeed = WIRE_LAND_KNOCKBACK_SPEED * (explode ? 1.5 : 1);
            const hits = useGameStore.getState().enemies.filter(e => {
              if (e.aiPhase === 'jump') return false; // 空中無敵は対象外
              const ecx = e.x + e.width / 2, ecy = e.y + e.height / 2;
              return Math.hypot(ecx - pcx, ecy - pcy) <= WIRE_BOMB_RADIUS + Math.max(e.width, e.height) / 2;
            });
            hits.forEach(e => {
              const ecx = e.x + e.width / 2, ecy = e.y + e.height / 2;
              const dx = ecx - pcx, dy = ecy - pcy;
              const dist = Math.hypot(dx, dy) || 1;
              const killed = explode ? useGameStore.getState().damageEnemy(e.id, dmg, true) : false;
              if (explode) spawnDamageNumber(ecx, e.y, dmg, true);
              if (!killed) {
                useGameStore.setState({
                  enemies: useGameStore.getState().enemies.map(x => x.id === e.id ? {
                    ...x,
                    knockbackVx: (dx / dist) * kbSpeed,
                    knockbackVy: (dy / dist) * kbSpeed,
                    knockbackUntil: nowW + KNOCKBACK_DURATION,
                    knockbackImmuneUntil: nowW + KNOCKBACK_IMMUNE_MS,
                  } : x),
                });
              }
            });
            if (explode) {
              spawnFlash('rgba(147,197,253,0.22)', 180);
              spawnRing(pcx, pcy, 10, WIRE_BOMB_RADIUS, 'rgba(147,197,253,0.95)', 5, 360);
              spawnBurst(pcx, pcy, '#93c5fd', 24);
              spawnBurst(pcx, pcy, '#dbeafe', 14);
              playSfx('bomb');
            } else {
              // Lv1/2: 範囲ダメージは無いが、着地の強制ノックバックは効く。リングは弾き範囲に合わせる。
              spawnRing(pcx, pcy, 10, WIRE_BOMB_RADIUS, 'rgba(147,197,253,0.7)', 3, 280);
              spawnBurst(pcx, pcy, '#93c5fd', 10);
              playSfx('melee');
            }
          }
        }

        // Check for collisions between player and enemies.
        // PACING_PUZZLE.md §5.18 M17: ①敵接触ダメージ(カウンター/パリィ丸ごと)。
        // src/utils/combatTick.ts へ切り出し(挙動不変・コード移動のみ)。
        applyContactDamage(
          gameTime,
          loopState.redNight?.phase === 'active' || RN_ENEMY_FORCE,
          loopState.screamerBuffUntil,
          combatEffects,
        );
        // ↓ 以降のピックアップ衝突判定が使う collPlayer(位置は上の接触判定と同じフレームで不変)。
        const collPlayer = useGameStore.getState().player;

        // 錬金術: 敵 ↔ 召喚(通常個体)の接触ダメージ。召喚は物理ブロックしない。
        // 被弾頻度の制限は damageSummon 側の無敵時間(プレイヤーと同じ INVULN_MS
        // 構造)に集約。同フレーム内の重複は 1 体 1 回(最大ダメージ)へ畳む。
        const liveSummonsForHit = useGameStore.getState().summons;
        if (liveSummonsForHit.length > 0) {
          const summonHits = checkEnemySummonCollisions(enemies, liveSummonsForHit);
          if (summonHits.length > 0) {
            const perSummon = new Map<string, number>();
            for (const h of summonHits) {
              perSummon.set(h.summonId, Math.max(perSummon.get(h.summonId) ?? 0, h.damage));
            }
            for (const [summonId, dmg] of perSummon) {
              const before = useGameStore.getState().summons.find(su => su.id === summonId);
              useGameStore.getState().damageSummon(summonId, dmg);
              // 実際にダメージが入った時(無敵中でない)だけ被弾バースト。シェイクは描画側が lastHit で出す。
              const after = useGameStore.getState().summons.find(su => su.id === summonId);
              if (before && after && after.health < before.health) {
                spawnBurst(after.x + after.width / 2, after.y + after.height / 2, '#bae6fd', 3);
              }
            }
          }
        }

        // Check for collisions between player and pickups.
        // 同上: ピックアップは本フレーム中に敵ドロップで増えるため、最新状態(getState)で判定する。
        const collPickups = useGameStore.getState().pickups;
        const pickupCollisions = checkPlayerPickupCollisions(collPlayer, collPickups);

        if (pickupCollisions.length > 0) {
          const collidedPickups = pickupCollisions
            .map(pickupId => collPickups.find(p => p.id === pickupId))
            .filter((pk): pk is NonNullable<typeof pk> => pk !== undefined);
          const hasAmmoPickup = collidedPickups.some(pk =>
            pk.type === 'ammo-handgun' ||
            pk.type === 'ammo-shotgun' ||
            pk.type === 'ammo-rifle' ||
            pk.type === 'ammo-phill'
          );
          const hasWeaponPickup = collidedPickups.some(pk =>
            pk.type === 'weapon-drop' ||
            pk.type === 'weapon-crate'
          );
          const hasHealthPickup = collidedPickups.some(pk => pk.type === 'health');
          const hasBombPickup = collidedPickups.some(pk => pk.type === 'bomb');
          const hasOtherPickup = collidedPickups.some(pk =>
            pk.type !== 'ammo-handgun' &&
            pk.type !== 'ammo-shotgun' &&
            pk.type !== 'ammo-rifle' &&
            pk.type !== 'ammo-phill' &&
            pk.type !== 'weapon-drop' &&
            pk.type !== 'weapon-crate' &&
            pk.type !== 'health' &&
            pk.type !== 'bomb'
          );
          if (hasOtherPickup) playSfx('pickup');
          if (hasAmmoPickup) playSfx('ammo-pickup');
          if (hasWeaponPickup) playSfx('weapon-pickup');
          if (hasHealthPickup) playSfx('eat');   // meat / health
          if (hasBombPickup) playSfx('bomb');

          pickupCollisions.forEach(pickupId => {
            const pk = collPickups.find(p => p.id === pickupId);
            if (pk) {
              // Pickup-specific feedback. Gems get a small color-coded
              // sparkle; heart/magnet/bomb get bolder bursts.
              switch (pk.type) {
                case 'experience': {
                  const color = pk.value >= 5 ? '#fecaca' : pk.value >= 2 ? '#a7f3d0' : '#bfdbfe';
                  const rgb = pk.value >= 5 ? '254,202,202' : pk.value >= 2 ? '167,243,208' : '191,219,254';
                  spawnBurst(pk.x + 8, pk.y + 8, color, pk.value >= 5 ? 10 : pk.value >= 2 ? 8 : 6);
                  spawnRing(pk.x + 8, pk.y + 8, 2, pk.value >= 5 ? 24 : 16, `rgba(${rgb},0.75)`, 2, 260);
                  useGameStore.getState().spawnGlow(pk.x + 8, pk.y + 8, pk.value >= 5 ? 24 : 16, `rgba(${rgb},`, 220);
                  break;
                }
                case 'health':
                  spawnBurst(pk.x + 8, pk.y + 8, '#fca5a5', 16);
                  spawnRing(
                    player.x + player.width / 2,
                    player.y + player.height / 2,
                    8, 36, 'rgba(248,113,113,0.7)', 3, 380
                  );
                  useGameStore.getState().spawnGlow(pk.x + 8, pk.y + 8, 30, 'rgba(248,113,113,', 280);
                  break;
                case 'magnet':
                  // Animate every gem flying to the player as a trail before
                  // they're swallowed in `collectPickup`.
                  useGameStore.getState().pickups
                    .filter(p => p.type === 'experience')
                    .forEach(g => {
                      spawnEffect({
                        kind: 'trail',
                        id: `fx-trail-${g.id}`,
                        fromX: g.x + 8, fromY: g.y + 8,
                        toX: player.x + player.width / 2,
                        toY: player.y + player.height / 2,
                        color: 'rgba(96,165,250,0.85)',
                        createdAt: Date.now(),
                        duration: 280
                      });
                    });
                  spawnRing(
                    player.x + player.width / 2,
                    player.y + player.height / 2,
                    8, 220, 'rgba(96,165,250,0.55)', 3, 320
                  );
                  useGameStore.getState().spawnGlow(pk.x + 8, pk.y + 8, 34, 'rgba(96,165,250,', 260);
                  break;
                case 'chest':
                  spawnFlash('rgba(252, 211, 77, 0.35)', 280);
                  spawnRing(
                    player.x + player.width / 2,
                    player.y + player.height / 2,
                    10, 140, 'rgba(252, 211, 77, 0.95)', 5, 460
                  );
                  spawnBurst(pk.x + 8, pk.y + 8, '#fde68a', 20);
                  break;
                case 'bomb':
                  spawnFlash('rgba(255,255,255,0.85)', 200);
                  spawnRing(
                    player.x + player.width / 2,
                    player.y + player.height / 2,
                    8, 700, 'rgba(253,224,71,0.85)', 6, 420
                  );
                  // Spawn a burst at every enemy slated to die
                  useGameStore.getState().enemies
                    .filter(e => e.type !== 'reaper')
                    .forEach(e => spawnBurst(
                      e.x + e.width / 2,
                      e.y + e.height / 2,
                      '#fde68a',
                      6
                    ));
                  break;
                case 'ammo-handgun':
                case 'ammo-shotgun':
                case 'ammo-rifle':
                  spawnBurst(pk.x + 8, pk.y + 8, '#fde68a', 10);
                  spawnRing(pk.x + 8, pk.y + 8, 3, 18, 'rgba(253,230,138,0.7)', 2, 280);
                  break;
                case 'weapon-drop':
                  spawnBurst(pk.x + 8, pk.y + 8, '#bfdbfe', 18);
                  useGameStore.getState().spawnGlow(pk.x + 8, pk.y + 8, 34, 'rgba(147,197,253,', 300);
                  spawnRing(
                    player.x + player.width / 2,
                    player.y + player.height / 2,
                    8, 60, 'rgba(147,197,253,0.85)', 3, 360
                  );
                  break;
                case 'weapon-crate':
                  spawnFlash('rgba(96,165,250,0.3)', 260);
                  spawnRing(
                    player.x + player.width / 2,
                    player.y + player.height / 2,
                    10, 120, 'rgba(96,165,250,0.9)', 5, 440
                  );
                  spawnBurst(pk.x + 8, pk.y + 8, '#bfdbfe', 18);
                  useGameStore.getState().spawnGlow(pk.x + 8, pk.y + 8, 42, 'rgba(191,219,254,', 340);
                  break;
                case 'quick-magazine':
                  playSfx('reload', 1, 800); // 即時リロードの流用: 長尺音源になったため800msで切る
                  spawnBurst(pk.x + 8, pk.y + 8, '#cbd5e1', 10);
                  spawnRing(pk.x + 8, pk.y + 8, 3, 22, 'rgba(203,213,225,0.76)', 2, 260);
                  useGameStore.getState().spawnGlow(pk.x + 8, pk.y + 8, 28, 'rgba(203,213,225,', 240);
                  break;
                case 'strap':
                  spawnBurst(pk.x + 8, pk.y + 8, '#e5e7eb', 3);
                  if (pk.value > 1) {
                    useGameStore.getState().spawnAmmoNumber(player.x + player.width / 2, player.y - 6, pk.value);
                  }
                  break;
                case 'treasure':
                  spawnBurst(pk.x + 8, pk.y + 8, '#facc15', 18);
                  spawnRing(pk.x + 8, pk.y + 8, 4, 34, 'rgba(250,204,21,0.82)', 3, 320);
                  useGameStore.getState().spawnGlow(pk.x + 8, pk.y + 8, 38, 'rgba(250,204,21,', 340);
                  break;
                case 'card-key':
                  // 屋内: カードキー取得 → ゴール部屋の扉を解錠。取得表示は武器などと同じ取得バナーUIに統一。
                  spawnFlash('rgba(56,189,248,0.28)', 240);
                  spawnRing(pk.x + 8, pk.y + 8, 6, 60, 'rgba(56,189,248,0.9)', 4, 380);
                  spawnBurst(pk.x + 8, pk.y + 8, '#67e8f9', 16);
                  useGameStore.getState().setHasCardKey(true);
                  useGameStore.getState().openLabDoor('goal');
                  useGameStore.setState({ lastWeaponGet: { name: 'カードキー', at: Date.now(), color: '#67e8f9', kind: 'weapon' } });
                  break;
                case 'lab-clear-item': {
                  // 研究所クリア条件アイテム: 拾うと勝利。到達演出(~1.5s)を挟んでイベント勝利へ。
                  const gw = useGameStore.getState();
                  if (gw.goalReachedAt === 0 && !gw.gameWon) {
                    useGameStore.setState({ goalReachedAt: Date.now() });
                    spawnFlash('rgba(255,255,255,0.28)', 420);
                    spawnRing(pk.x + 8, pk.y + 8, 6, 64, 'rgba(253,230,138,0.9)', 4, 420);
                    spawnBurst(pk.x + 8, pk.y + 8, '#fde68a', 20);
                    // 武器/トレジャー取得と同じ取得バナーUIで表示(専用 kind='data')。
                    useGameStore.setState({ lastWeaponGet: { name: '重要データ', at: Date.now(), color: '#fde68a', kind: 'data' } });
                  }
                  break;
                }
              }
            }
            collectPickup(pickupId);
          });
        }

        // 屋内ギミック: ボタン近接押下 → 武器庫扉解錠 / ゴール扉が開いた状態でゴール区画に入る → 演出 → 勝利。
        if (indoor) {
          const gs = useGameStore.getState();
          const gpcx = gs.player.x + gs.player.width / 2;
          const gpcy = gs.player.y + gs.player.height / 2;
          for (const btn of gs.labButtons) {
            if (btn.pressed) continue;
            const bdx = gpcx - btn.x, bdy = gpcy - btn.y;
            if (bdx * bdx + bdy * bdy <= btn.radius * btn.radius) {
              gs.pressLabButton(btn.id);
              playSfx('shield-deploy');
              spawnRing(btn.x, btn.y, 6, 70, 'rgba(96,165,250,0.9)', 4, 360);
              spawnBurst(btn.x, btn.y, '#bfdbfe', 14);
              useGameStore.getState().spawnCallout(btn.x, btn.y - 18, '武器庫の扉が開いた', '#bfdbfe');
            }
          }
          // クリア条件はゴール部屋のクリアアイテム拾得(上のピックアップ処理で goalReachedAt を設定)。
          // 到達演出後(~1.5s)にイベント勝利。
          if (gs.goalReachedAt > 0 && Date.now() - gs.goalReachedAt >= 1500 && !gs.gameWon) {
            useGameStore.getState().triggerEventVictory();
          }
        }

        // 研究所スキン(屋外)のクリア: 書類(重要データ=lab-clear-item)取得で goalReachedAt がセットされ、
        // 演出後(~1.5s)にイベント勝利。屋内ゴール演出と同じ流れを屋外でも回す。
        if (labTheme) {
          const gs = useGameStore.getState();
          if (gs.goalReachedAt > 0 && Date.now() - gs.goalReachedAt >= 1500 && !gs.gameWon) {
            useGameStore.getState().triggerEventVictory();
          }
        }

        // ドローンブーメランのCD明け: not-ready→ready の瞬間に カチッSE + 頭上マーク発火。
        {
          const hasBoom = player.subWeapons.includes('drone-boomerang');
          const ready = hasBoom && gameTime >= (player.subWeaponCooldowns['drone-boomerang'] ?? 0);
          if (ready && !boomReadyRef.current) {
            playSfx('reload', 1, 300); // 「カチッ」相当(reload流用)。長尺音源になったため300msで切る
            useGameStore.setState({ boomerangReadyFxAt: Date.now() });
          }
          boomReadyRef.current = ready;
        }
        // スキル: 弁慶のCD明け(再発動可)を not-ready→ready の瞬間に検出して
        // プレイヤー頭上に短い「閃き」フラッシュ(描画のみ・スロー無し・~0.6s)。
        {
          const hasBenkei = hasSkill(player, 'benkei');
          const benkeiReady = hasBenkei && gameTime >= player.benkeiCdUntil;
          if (benkeiReady && !benkeiReadyRef.current) {
            const bx = player.x + player.width / 2;
            const by = player.y - 18;
            spawnRing(bx, by, 6, 38, 'rgba(250,204,21,0.9)', 2, 600);
            useGameStore.getState().spawnGlow(bx, by, 30, 'rgba(250,204,21,', 600);
            useGameStore.getState().spawnCallout(bx, by - 8, '閃き', '#fde047');
          }
          benkeiReadyRef.current = benkeiReady;
        }
        // store が更新する FX タイムスタンプを検出して対応SEを鳴らす(盾バッシュ命中/鞭命中/鞭振り/アンカー打ち込み)。
        {
          const gs = useGameStore.getState();
          if (gs.bashHitFxAt > bashHitFxRef.current) { bashHitFxRef.current = gs.bashHitFxAt; playSfx('heavy-impact'); }
          // 救助NPC(shooter)の発砲音: サークル接近時のみ(誰かが撃ったら1フレーム1発)。
          if (gs.rescueShooterFxAt > rescueShootFxRef.current) {
            rescueShootFxRef.current = gs.rescueShooterFxAt;
            const rae = gs.activeEvent;
            if (rae && rae.kind === 'rescue') {
              const px = gs.player.x + gs.player.width / 2, py = gs.player.y + gs.player.height / 2;
              const audible = rae.radius + 320;
              if ((px - rae.x) ** 2 + (py - rae.y) ** 2 < audible * audible) playSfx('handgun-fire');
            }
          }
          if (gs.whipSwingFxAt > whipSwingFxRef.current) { whipSwingFxRef.current = gs.whipSwingFxAt; playSfx('whip-swing'); }
          if (gs.whipHitFxAt > whipHitFxRef.current) { whipHitFxRef.current = gs.whipHitFxAt; playSfx('whip-hit'); }
          if (gs.anchorPlantFxAt > anchorPlantFxRef.current) { anchorPlantFxRef.current = gs.anchorPlantFxAt; playSfx('anchor-plant'); }
          if (gs.anchorEnemyHitFxAt > anchorEnemyHitFxRef.current) { anchorEnemyHitFxRef.current = gs.anchorEnemyHitFxAt; playSfx('slash-damage'); } // アンカーが敵に当たった=近接命中音
          if (gs.boomerangThrowFxAt > boomThrowFxRef.current) { boomThrowFxRef.current = gs.boomerangThrowFxAt; playSfx('boomerang-throw'); }
          if (gs.summonFxAt > summonFxRef.current) { summonFxRef.current = gs.summonFxAt; playSfx('summon'); }
          // 叫喚型: 強化窓が開いた瞬間(screamerBuffUntil が増加)=溜め完了で叫喚SE。
          if (gs.screamerBuffUntil > screamerBuffFxRef.current) { screamerBuffFxRef.current = gs.screamerBuffUntil; playSfx('screamer-cry'); }
        }

        // 囲い系(閉じ込め)イベント中だけ通常スポーナ/演出波を止める。閉じ込めない救助(rescue)は通常通り湧かせる(社長指示)。
        const ae = useGameStore.getState().activeEvent;
        const confining = !!ae && ae.kind !== 'rescue';
        // ステップ②(難易度ディレクター): 屋外の「敵数の上限」をフェーズ駆動(フロア≈10〜天井20)にする。
        // カリング上限(enemyCap)と湧き上限(normalSpawnCap)の両方を同じ値で動かす(片方だけだと即カリングされる/枠が余る)。
        // 屋内/ラボは従来どおり固定上限。囲い/救助イベントの特別枠は維持。
        const curPhase = phaseAt(gameTime);
        // 難易度⑤(DirectorRank・社長合意): フェーズが切り替わった瞬間に、直前フェーズぶんの成績
        // (gameStats.damageTaken/enemiesKilled/player.level の差分とフェーズ終了時HP)から rank を
        // 更新する。1フェーズ目は比較対象が無いので rank=0(台本通り)のまま。今このフレームには
        // 反映しない=常に「次のフェーズだけ」に効かせる。
        const rankPhaseKey = `${curPhase.kind}${curPhase.index}`;
        const rankOutdoor = RANK_ENABLED && !labTheme && !indoor;
        if (rankOutdoor && rankRef.current.phaseKey !== rankPhaseKey) {
          if (rankRef.current.phaseKey !== '') {
            const rgs = useGameStore.getState();
            const perf = evaluatePhasePerformance({
              durationMs: Math.max(1, gameTime - rankRef.current.phaseStartMs),
              damageTaken: Math.max(0, rgs.gameStats.damageTaken - rankRef.current.startDamageTaken),
              hpFracEnd: rgs.player.maxHealth > 0 ? rgs.player.health / rgs.player.maxHealth : 0,
              kills: Math.max(0, rgs.gameStats.enemiesKilled - rankRef.current.startKills),
              levelGained: Math.max(0, rgs.player.level - rankRef.current.startLevel),
            });
            rankRef.current.rank = rankFromPerformance(perf);
            rankRef.current.lastPerf = perf; // バッチ4: 演目選択が使う連続スコア
          }
          const rgs2 = useGameStore.getState();
          rankRef.current.phaseKey = rankPhaseKey;
          rankRef.current.phaseStartMs = gameTime;
          rankRef.current.startDamageTaken = rgs2.gameStats.damageTaken;
          rankRef.current.startKills = rgs2.gameStats.enemiesKilled;
          rankRef.current.startLevel = rgs2.player.level;
        }
        // バッチ2(計測): フェーズが切り替わった瞬間に、直前フェーズ中の種別キル内訳を差分で取り、
        // デバッグ表示用に記録する(rankRefと同じフェーズ境界トリガー。挙動には一切影響しない=記録のみ)。
        // ?rank=0 とは独立(RANK_ENABLEDを跨がない)。
        if (!labTheme && !indoor && killPhaseRef.current.phaseKey !== rankPhaseKey) {
          const prevTotals = killPhaseRef.current.startTotals;
          const prevSpawns = killPhaseRef.current.startSpawns;
          if (prevTotals) {
            const nowTotals = getKillTotals();
            const nowSpawns = snapshotSpawns();
            const killsByBucket = {} as Record<KillBucket, number>;
            const spawnsByBucket = {} as Record<KillBucket, number>;
            (Object.keys(nowTotals.byBucket) as KillBucket[]).forEach(b => {
              killsByBucket[b] = Math.max(0, nowTotals.byBucket[b] - prevTotals.byBucket[b]);
              spawnsByBucket[b] = Math.max(0, nowSpawns[b] - (prevSpawns?.[b] ?? 0));
            });
            setPhaseKillDebug({ phaseKey: killPhaseRef.current.phaseKey, killsByBucket, spawnsByBucket, style: getCurrentStyle() });
          }
          // v0.25.1343: 生参照ではなくディープコピーを保存(参照のままだと差分が常に0=苦戦誤認の実バグ)。
          killPhaseRef.current = { phaseKey: rankPhaseKey, startTotals: snapshotKillTotals(), startSpawns: snapshotSpawns() };
        }
        // バッチ5: 山(緩明け)の台本選択。関所フェーズに入った瞬間だけ判定する(rankPhaseKeyと同じ境界)。
        // バッチ4の直下(lastGateFeaturedRefが実際に見せた台本のfeaturedを読めるように)より前、かつ
        // pressureOutdoorブロック(この少し下)がrungCeilingの計算に使うため、それより前に確定させる。
        if (GATE_PROGRAM_ENABLED && !labTheme && !indoor && curPhase.kind === 'gate' && gateProgramRef.current.phaseKey !== rankPhaseKey) {
          // バッチ5追補選出ルール(b): 直近の台本がイベント関所だったかを、上書きする前に読む。
          const lastWasEvent = gateProgramRef.current.lastId === 'gate-assault' || gateProgramRef.current.lastId === 'gate-boss-spike';
          const program = selectGateProgram({
            phaseMaxRung: curPhase.maxRung ?? 7,
            rank: rankRef.current.rank,
            style: getCurrentStyle(),
            lastProgramId: gateProgramRef.current.lastId,
            tieBreakRandom: Math.random(),
            gateIndex: curPhase.index - 1,
            lastWasEvent,
            pityBlocked: newGameTime < pityEventBlockUntilRef.current,
          });
          gateProgramRef.current = { phaseKey: rankPhaseKey, program, lastId: program.id };
          // バッチ5追補: イベント関所(gate-assault/gate-boss-spike)が選ばれたら、関所頭での発火を予約する。
          // 規模は既存のeventSizeMult(バッチ7で保留していた配線先)でrank/退屈シグナル/pity直後を反映。
          if (program.eventKind) {
            gateEventPendingRef.current = {
              eventKind: program.eventKind,
              phaseKey: rankPhaseKey,
              sizeMult: eventSizeMult({
                rank: rankRef.current.rank,
                boredomBonusValue: boredomBonus(upswingRef.current.boredMs, boredStartMsForAggro(currentStageAggro())),
                pityRecentlyActive: newGameTime < pityEventBlockUntilRef.current,
              }),
            };
          }
        }
        // バッチ4: 山→緩の演目選択。フェーズが切り替わった瞬間だけ判定する(rankPhaseKeyと同じ境界)。
        if (PROGRAM_ENABLED && !labTheme && !indoor) {
          if (curPhase.kind === 'gate') {
            // バッチ5が有効なら実際に表示中の台本のfeaturedを、無効/未選択ならPHASES固定シーンのfeaturedを使う。
            lastGateFeaturedRef.current = (GATE_PROGRAM_ENABLED && gateProgramRef.current.program) ? gateProgramRef.current.program.featured : curPhase.scene.featured;
          }
          if (curPhase.kind === 'buildup' && reliefProgramRef.current.phaseKey !== rankPhaseKey) {
            const debug = getPhaseKillDebug();
            let struggleType: EnemyType | null = null;
            if (debug && debug.phaseKey.startsWith('gate')) {
              let worst: EnemyType | null = null, worstKills = Infinity;
              for (const t of lastGateFeaturedRef.current) {
                const bucket = t as KillBucket;
                const kills = debug.killsByBucket[bucket] ?? 0;
                const spawns = debug.spawnsByBucket?.[bucket] ?? 0;
                // v0.25.1343: 出現していない型を「苦戦」と誤認しない(ゾーン天井でブロックされた
                // featuredが毎回キル0=苦戦扱いになり、回収の床経由で初心者ゾーンに問題児が
                // 逆流していた実バグの修正)。
                if (spawns >= STRUGGLE_MIN_SPAWNS && kills < STRUGGLE_KILL_MAX && kills < worstKills) { worst = t; worstKills = kills; }
              }
              struggleType = worst;
            }
            const totals = getKillTotals();
            const program = selectReliefProgram({
              gameTimeMs: gameTime,
              score: rankRef.current.lastPerf,
              lessonExperience: { werewolf: totals.byBucket.werewolf, pumpkin: totals.byBucket.pumpkin },
              struggleType,
              intro: curPhase.index === 1, // GAME_AUDIT #6: 導入buildupは必ず純休憩(講習にしない)
            });
            reliefProgramRef.current = { phaseKey: rankPhaseKey, program, lessonSpawned: false, recoverySpawned: 0 };
          }
        }
        // 関所(襲撃)告知(社長指定文言): 関所フェーズに入った瞬間「多数の変異体を検知」、
        // 生きて抜けた瞬間「襲撃を凌いだ」。表示は頭上の浮きテキストではなく、既存の左上イベント
        // バナー(eventBannerText=「危険変異体出現」等と同じUI)に統一(社長指示)。屋外のみ。
        // 最終フェーズ(gate9)は終わりが無いので生還側は出ない。
        // PACING_PUZZLE.md(v0.25.1374): パズル方式ON時は旧PHASES境界のバナーを止め、コマ境界
        // (通常⇄緩の切り替わり)側で出す(パズルの配線ブロック内)。?puzzle=0時は従来どおりここ。
        if (!PUZZLE_ENABLED && !labTheme && !indoor && gateCalloutRef.current !== rankPhaseKey) {
          const prevKey = gateCalloutRef.current;
          gateCalloutRef.current = rankPhaseKey;
          if (curPhase.kind === 'gate') {
            useGameStore.setState({ eventBannerText: '多数の変異体を検知', eventBannerUntil: gameTime + 3500 });
          } else if (prevKey.startsWith('gate')) {
            useGameStore.setState({ eventBannerText: '襲撃を凌いだ', eventBannerUntil: gameTime + 3500 });
            playSfx('gate-clear'); // 強襲突破ジングル(社長提供SE)
          }
        }
        // 紅き月(社長合意): 発生中はAIディレクター上の追加の盛りを止める(イベント自体がPEAK=二重に盛らない)。
        // DirectorRank(⑤)の上乗せを一時停止。③④は紅き月より前からの基準挙動なので触れない。
        const redNightActiveNow = useGameStore.getState().redNight?.phase === 'active';
        const rankAdj = (rankOutdoor && !redNightActiveNow) ? rankAdjustFor(rankRef.current.rank) : { escBoost: 0, countCapBonus: 0, rewardMult: 1, rareBoost: 0 };
        // HARVEST相当(buildupフェーズ=関所間の緩む区間)でだけ、rank に応じたEXP倍率を効かせる
        // (難関=gate/boss中は物資ではなく倍率で回すというCodex提案の切り分けを維持)。
        // バッチ4: 演目にxpBoostが立っている(HARVEST/回収)場合だけに絞る。講習/純休憩はブースト無し。
        const rankHarvestActive = curPhase.kind === 'buildup' &&
          (!PROGRAM_ENABLED || (reliefProgramRef.current.program?.xpBoost ?? true));
        setDirectorRankRewardMult(rankHarvestActive ? rankAdj.rewardMult : 1);
        // 憲法第1条(退屈シグナル→上振れ枠): Perf高×Intensity低の持続だけを見る独立ノブ(Rankとは別)。
        // 前フレームの directorRef.current.state を読む(relaxAdj/buildupAdjと同じ1フレーム遅延パターン)。
        // PACING_PUZZLE.md §2: 本方式ON時は「退屈上振れup+N」を停止(コマ内のチャフ増員が代替)。
        const upswingOutdoor = UPSWING_ENABLED && !labTheme && !indoor && !PUZZLE_ENABLED;
        if (upswingOutdoor) {
          upswingRef.current = stepBoredom(upswingRef.current, {
            performance: directorRef.current.state.performance,
            intensity: directorRef.current.state.intensity,
            dtMs: deltaTime * 1000,
            gameTimeMs: gameTime, // 実機フィードバック②: 開始90秒は退屈蓄積しない(BORED_RUN_GRACE_MS)
          });
        }
        // PACING_REDESIGN.mdバッチ6: 退屈発動までの時間をstageAggroで可変化(0.5=既定25000msに一致)。
        const upswingBonus = upswingOutdoor ? boredomBonus(upswingRef.current.boredMs, boredStartMsForAggro(currentStageAggro())) : 0;
        // PACING_REDESIGN.mdバッチ3.5-B(盤面在庫): 「今盤面に何がいるのか」を先に一度だけ計算し、
        // 以降の4箇所(関所の登り/配役投入/湧きテンポ/イベント発火ゲート)で使い回す(?debt=0で0固定
        // =従来挙動)。屋内/ラボは対象外(屋外の通常敵のみ集計)。
        const boardDebtNow = (DEBT_ENABLED && !labTheme && !indoor) ? debtFor(useGameStore.getState().enemies) : 0;
        boardDebtRef.current = boardDebtNow; // イベント発火ゲート側は次フレームでこの値を読む(1フレーム遅延)
        // PACING_REDESIGN.mdバッチ3(最小版): 山(関所)の連続圧力 gatePressure。方式確定(v0.25.1304・
        // Fableチャット決定): 緩(buildup/mowdown含む)フェーズは対象外(現行シーンのまま)、
        // 関所(gate)中だけ毎フレーム連続スカラーpressureを動かす。`?ladder=0`で無効化(難易度④の
        // 従来挙動に完全復帰)。テンポ/数への反映(sceneIntervalMult/dirCountCap)は後段(spawnBounds
        // 定義後)で行い、ここではpressureのステップと配役トリガーの検出だけを行う。
        // PACING_PUZZLE.md §2: 本方式ON時はgatePressureの配役・主題保証(M1)を停止する
        // (curPhase.kind==='gate'はboss中には成立しないため、ここでは!PUZZLE_ENABLEDだけで足りる)。
        const pressureOutdoor = LADDER_ENABLED && !labTheme && !indoor && curPhase.kind === 'gate' && !PUZZLE_ENABLED;
        if (pressureOutdoor) {
          if (gatePressureRef.current.key !== rankPhaseKey) {
            gatePressureRef.current.key = rankPhaseKey;
            gatePressureRef.current.state = createGatePressureState(startPressureForRank(rankRef.current.rank));
          }
          // バッチM1-C(主題保証): 関所に入った瞬間だけ、開始時点の出現数をディープコピーで固定する
          // (実装精度の規律3。生参照だとその後の出現も一緒に増えて差分が常に0になる)。
          if (featureGuaranteeRef.current.key !== rankPhaseKey) {
            featureGuaranteeRef.current = { key: rankPhaseKey, startedAt: gameTime, startSnapshot: snapshotSpawns(), satisfied: new Set() };
          }
          // 被弾インパルス検知(2秒以内2被弾、または1発でHP15%減)。AIディレクター本体のprevHpとは
          // 別管理(責務を混ぜない・専用の軽量ref)。
          const hp = player.health, maxHp = Math.max(1, player.maxHealth);
          if (pressureHitRef.current.prevHp < 0) pressureHitRef.current.prevHp = hp;
          const dropFrac = Math.max(0, pressureHitRef.current.prevHp - hp) / maxHp;
          if (dropFrac > 0) pressureHitRef.current.hitTimes.push(gameTime);
          pressureHitRef.current.hitTimes = pressureHitRef.current.hitTimes.filter(t => gameTime - t <= 2000);
          const hitImpulse = dropFrac >= 0.15 || pressureHitRef.current.hitTimes.length >= 2;
          pressureHitRef.current.prevHp = hp;

          const zoneCeiling = ceilingForZone(areaZoneIndexFor(Math.hypot(player.x + player.width / 2, player.y + player.height / 2)));
          // バッチ5: 台本選択が有効な間は、選ばれた台本自身のmaxRung(PHASESの値ではなく台本の値付け)を
          // pressure天井の元にする。台本未選択(初回フレームや?gateprogram=0)はPHASESのmaxRungへ従来どおり。
          const scriptMaxRung = (GATE_PROGRAM_ENABLED && gateProgramRef.current.program) ? gateProgramRef.current.program.maxRung : (curPhase.maxRung ?? 7);
          // バッチ6: ステージ難易度指数によるmaxRungクランプ(min(scriptMaxRung, 3+round(4*stageAggro)))。
          const effectiveMaxRung = Math.min(scriptMaxRung, gateMaxRungClampForAggro(currentStageAggro()));
          const rungCeiling = ceilingForMaxRung(effectiveMaxRung);
          const ceiling = Math.min(zoneCeiling, rungCeiling);

          // バッチM1-A: M1有効時はτ5秒固定(riseTauS省略=gatePressure.tsのUP_TAU_S=5にフォールバック)。
          // stageAggro(バッチ6)由来のτスケーリングはM1中は使わない(骨格差だけを比較する統制条件)。
          // `?m1=0`で従来どおりstageAggro駆動のτへ復帰する。
          // バッチM1-B: 同様にIntensityホールドも既定で撤廃、`?m1=0`だけ旧挙動(legacyIntensityHold)へ。
          const step = stepGatePressure(gatePressureRef.current.state, {
            msSinceLastHit: directorRef.current.state.sinceDamageMs,
            killRateEma: directorRef.current.state.killRateEma,
            hitImpulse,
            intensity: directorRef.current.state.intensity,
            ceiling,
            dtMs: deltaTime * 1000,
            boardDebt: boardDebtNow,
            riseTauS: M1_ENABLED ? undefined : riseTauSForAggro(currentStageAggro()),
            legacyIntensityHold: !M1_ENABLED,
          });
          gatePressureRef.current.state = step.state;
          gatePressureRef.current.ceiling = ceiling;
          gatePressureRef.current.castFirstNow = step.castFirstNow;
          gatePressureRef.current.castSecondNow = step.castSecondNow;
        } else {
          gatePressureRef.current.castFirstNow = false;
          gatePressureRef.current.castSecondNow = false;
          // GAME_AUDIT #5: 緩フェーズ中もprevHp/被弾履歴を追従させる。凍結したままだと緩中の被弾が
          // 次の関所の初フレームで偽の被弾インパルス(-0.15)として発火していた。
          pressureHitRef.current.prevHp = player.health;
          pressureHitRef.current.hitTimes = pressureHitRef.current.hitTimes.filter(t => gameTime - t <= 2000);
        }
        const pressureCapBonus = pressureOutdoor ? capBonusForPressure(gatePressureRef.current.state.pressure) : 0;
        // デバッグ表示用(社長指示: 今のrankを見えるようにしておく)。DirectorOverlay(?director=1)が読む。
        setDirectorRankDebug({
          rank: rankRef.current.rank,
          phaseKey: rankPhaseKey,
          escBoost: rankAdj.escBoost,
          countCapBonus: rankAdj.countCapBonus,
          rewardMult: rankAdj.rewardMult,
          harvestActive: rankHarvestActive && rankOutdoor,
          enabled: rankOutdoor,
          upswingBonus,
        });
        setGatePressureDebug(pressureOutdoor ? {
          pressure: gatePressureRef.current.state.pressure,
          ceiling: gatePressureRef.current.ceiling ?? 1,
          allowed: allowedProblemChildren(gatePressureRef.current.state.pressure, pressureCastRef.current.order ?? ['pumpkin', 'werewolf']),
        } : null);
        setReliefProgramDebug((PROGRAM_ENABLED && reliefProgramRef.current.program) ? {
          id: reliefProgramRef.current.program.id,
          lessonSpawned: reliefProgramRef.current.lessonSpawned,
        } : null);
        setGateProgramDebug((GATE_PROGRAM_ENABLED && gateProgramRef.current.program) ? {
          id: gateProgramRef.current.program.id,
          maxRung: gateProgramRef.current.program.maxRung,
        } : null);
        const dirCountCap = computeDirCountCap(gameTime, labTheme, indoor, MAX_ENEMIES, rankAdj, upswingBonus, pressureCapBonus);
        // PACING_PUZZLE.md §2/§3-C: 本方式ON時は間引き上限(culling)も本方式の上限(R1-R6=10/
        // R7=10..20成長)に揃える。旧来のdirCountCap(基本10近辺で頭打ち)のままだと、R7の20体成長を
        // 旧カリングが即座に間引き潰してしまう(1フレーム遅延で前フレームの値を読む・他の遅延
        // パターンと同じ許容範囲)。ボス中(puzzleActiveNow=false)は旧来どおりdirCountCapを使う。
        const enemyCap = computeEnemyCap(confining, ARENA_EVENT_CAP, ae, dirCountCap, RESCUE_ATTACKERS, puzzleActiveNow, puzzleClockRef.current);
        // 難易度⑥(ピンチ救済): 「低HP×敵が上限近くまで溜まっている」の持続を測り、松明ドロップの
        // 調整値をシングルトンへ publish(gameStore.dropBreakablePropLoot が読む)。ピンチでない時は
        // 既定値=従来と完全一致。敵の強さ/湧きには触れない(救済は補給側だけ)。
        // (実装: src/utils/directorTick.ts の runPityUpkeep へ移設。挙動は不変)。
        runPityUpkeep(
          { pinchRef, pityEventBlockUntilRef },
          { pityEnabled: PITY_ENABLED, player, enemyCap, deltaTime, gameTime }
        );

        // Continuous spawner — drip enemies onto the field from off-screen.
        // rescue 中はイベント攻撃者(fromEvent)を除いた通常敵の数で上限判定し、通常通りの密度を維持。
        const allEnemiesNow = useGameStore.getState().enemies;
        const enemyCountBeforeSpawn = allEnemiesNow.length;
        const fieldCount = ae ? allEnemiesNow.filter(e => !e.fromEvent).length : enemyCountBeforeSpawn;
        // 通常湧きは「裏ボスが画面内で追跡してきている間(bossChasing)」だけ止める(社長指摘: 出現中ずっと
        // 敵が沸かないのは寂しい)。画面外/帰巣中(=非追跡)は通常どおり湧かせる。追跡中は他敵が一斉逃走する演出と
        // 整合させ、湧きも止める。
        const bossChasingNow = useGameStore.getState().bossChasing;
        // 文脈ズーム用: プレイヤー近く(画面内相当の半径)にいる敵だけ数える。遠くの大型/多数では引かない(社長指示)。
        const zpcx = player.x + player.width / 2, zpcy = player.y + player.height / 2;
        const zoomNearR2 = Math.pow(Math.max(gameBounds.width, gameBounds.height) * 0.6, 2);
        const nearEnemies = allEnemiesNow.filter(e => {
          const dx = e.x + e.width / 2 - zpcx, dy = e.y + e.height / 2 - zpcy;
          return dx * dx + dy * dy <= zoomNearR2;
        });
        // プレイヤーのエリア(区域)index。区域別の出現可否(isValidForArea)判定に使う。
        const playerDepthDist = Math.hypot(player.x + player.width / 2, player.y + player.height / 2);
        const playerAreaIdx = areaZoneIndexFor(playerDepthDist);
        // 最深到達エリア(バッチ2計測)。屋外のみ、単調増加でstoreへ反映(リザルト表示用)。
        // 変化した時だけ set() する(1ランで最大4回・React再描画コストは無視できる)。
        if (!labTheme && !indoor && playerAreaIdx > maxAreaRef.current) {
          maxAreaRef.current = playerAreaIdx;
          useGameStore.setState(state => ({ gameStats: { ...state.gameStats, maxAreaReached: playerAreaIdx } }));
        }
        // PACING_PUZZLE.md §5.17 M14: このランの最深距離(自己最深比較・「あと◯m」用)。
        // refは毎フレーム追跡(軽い比較のみ)、store/localStorageへの反映は1秒間隔で間引く
        // (localStorage書き込みを毎フレームやると重い・自己ベスト表示は1秒程度の遅れは無害)。
        if (!labTheme && !indoor && WALL_ENABLED) {
          runDeepestDistRef.current = Math.max(runDeepestDistRef.current, playerDepthDist);
          if (gameTime - wallDepthSyncRef.current >= 1000) {
            wallDepthSyncRef.current = gameTime;
            syncWallDepth(runDeepestDistRef.current);
          }
        }
        // AIディレクター ステップB(社長合意の最初の実接続): ?directorApply=relax の時だけ、直前フレームで
        // 算出済みの DirectorState(macro)を読み、RELAX中だけ「escalationを止める/湧き間隔を伸ばす/湧き上限を
        // 下げる」を薄く掛ける。既存の敵を強制的に間引くカリング上限(enemyCap)には触れない=急に画面から
        // 消える演出を避ける。フラグ無し(既定)は基準点(b1eae30)と完全に同じ挙動。屋内/ラボは対象外。
        const directorApplyRelaxActive = DIRECTOR_APPLY_RELAX && !labTheme && !indoor;
        const relaxAdj = directorApplyRelaxActive ? relaxSpawnAdjust(directorRef.current.state.macro) : { escMult: 1, intervalMult: 1, capMult: 1 };
        // AIディレクター ステップC(社長合意): ?directorApply=buildup の時だけ、BUILD_UP中にPerformanceが
        // 高いほど escalation を少し上乗せする。レバーはescalationのみ(湧き間隔/上限には触れない・Bより
        // 慎重)。Performanceは「BuildUpを強める」だけに使う=Intensity/被弾側とは絶対に混ぜない。
        const directorApplyBuildupActive = DIRECTOR_APPLY_BUILDUP && !labTheme && !indoor;
        const buildupAdj = directorApplyBuildupActive
          ? buildupSpawnAdjust(directorRef.current.state.macro, directorRef.current.state.performance)
          : { escBoost: 0 };
        // 湧き上限はカリング上限(enemyCap=dirCountCap)と揃える(枠まで湧かせて超過ぶんはカリング)。屋外はディレクター駆動(フロア≈10〜天井20)。
        const normalSpawnCap = computeNormalSpawnCap(labTheme, MAX_ENEMIES, dirCountCap, relaxAdj.capMult);
        // 難易度③(戦力連動): 過剰育成(戦力マージン>1)なら escalation で強さ(色)/種類(重い型)を底上げ。
        // esc=0 は現状据え置き=順調/未育成は無変化。関所(gate)で強め・余裕(buildup)は弱め。?dda=0 で無効。屋内/ラボは対象外。
        const ddaActive = DDA_ENABLED && !labTheme && !indoor;
        const buildEsc = ddaActive
          ? spawnEscalation({
              level: player.level,
              weaponTierSum: player.weapons.reduce((s, w) => s + (w.tier ?? 1), 0),
              maxHealth: player.maxHealth,
              equippedCount: [player.equipment.body, player.equipment.arms, player.equipment.accessory].filter(Boolean).length,
              skillCount: player.skills.length,
            }, gameTime, curPhase.kind === 'gate')
          : 0;
        // 難易度④(関所ライブ補正): 関所中だけ、プレイヤーのHP推移を目標帯へ寄せる escalation 補正を平滑化して加える。
        // 楽勝なら足す(主)/苦しいなら緩める(弱め・下限あり)。余裕(buildup)/関所外は補正を0へ戻す(補正なし)。
        // PACING_REDESIGN.mdバッチ3: gatePressureが有効な関所中は④を停止する(二重ブレーキ/二重アクセル防止。
        // pressureが「どれだけ強めるか」の唯一の判定役になる)。
        {
          const smooth = 1 - Math.exp(-deltaTime / GATE_LIVE_TAU);
          if (ddaActive && curPhase.kind === 'gate' && !pressureOutdoor) {
            const hpFrac = player.maxHealth > 0 ? player.health / player.maxHealth : 0;
            const key = `gate${curPhase.index}`;
            if (gateRef.current.key !== key) { gateRef.current.key = key; gateRef.current.startHpFrac = hpFrac; gateRef.current.live = 0; }
            const phaseDur = curPhase.endMs - curPhase.startMs;
            const prog = Number.isFinite(phaseDur) ? (gameTime - curPhase.startMs) / Math.max(1, phaseDur) : 1;
            const desired = gateLiveCorrection(hpFrac, gateRef.current.startHpFrac, prog);
            gateRef.current.live += (desired - gateRef.current.live) * smooth;
          } else {
            gateRef.current.key = '';
            gateRef.current.live += (0 - gateRef.current.live) * smooth;
          }
        }
        const spawnEsc = Math.max(0, Math.min(1, buildEsc + (ddaActive ? gateRef.current.live : 0) + buildupAdj.escBoost + rankAdj.escBoost)) * relaxAdj.escMult;
        // バッチ4: buildup(緩)フェーズでは、台本固定のsceneAtではなく選定済みの演目(reliefProgramRef)を
        // 使う。講習は「1フェーズ合計1体・キル後は再投入しない」ので、主役を1体出した後は featured を
        // 空にして通常分布へ戻す(programオブジェクト自体はxpBoost/lessonPrimary判定に使うので複製で対応)。
        let effectiveProgram = reliefProgramRef.current.program;
        if (effectiveProgram && effectiveProgram.lessonPrimary && reliefProgramRef.current.lessonSpawned) {
          effectiveProgram = { ...effectiveProgram, featured: [], featuredFloor: false };
        }
        // v0.25.1343: 回収の主役も「弱め少数」の仕様どおり上限を設ける(フェーズ合計2体まで。
        // 従来は無制限補充で、床とあわせて問題児の実質常駐化を招いていた)。
        if (effectiveProgram && effectiveProgram.recoveryPrimary && reliefProgramRef.current.recoverySpawned >= 2) {
          effectiveProgram = { ...effectiveProgram, featured: [], featuredFloor: false };
        }
        // バッチ5: gate(山)フェーズでは、台本固定のsceneAtではなく選定済みの台本(gateProgramRef)を使う。
        const effectiveGateProgram = (GATE_PROGRAM_ENABLED && curPhase.kind === 'gate') ? gateProgramRef.current.program : null;
        // 沸きシーン(緩急の部品): 現在フェーズのシーンから「敵構成(featured)」と「沸きスピード(intervalMult)」を読む。
        // 屋内/ラボ/?scenes=0 は素の分布・等速(=従来挙動)。
        const scene = (SCENES_ENABLED && !labTheme && !indoor)
          ? (PROGRAM_ENABLED && curPhase.kind === 'buildup' && effectiveProgram ? effectiveProgram
            : effectiveGateProgram ?? sceneAt(gameTime))
          : null;
        const sceneFeatured = scene ? scene.featured : [];
        const sceneSuppressed = scene ? (scene.suppressed ?? []) : [];
        // PACING_REDESIGN.mdバッチ1.5: featuredのエリア床は講習/mowdownシーンのみ許可(関所シーンは
        // false=エリア規約に完全準拠。「チャフのための床」が問題児の裏口になる事故の再発防止)。
        const sceneFloorAllowed = scene ? (scene.featuredFloor ?? false) : false;
        // 憲法第2条注記(PACING_REDESIGN.md): パンプキン2体は出すタイミング+周囲の雑魚数によっては
        // 回避不能級。2体目がいる間は雑魚湧きテンポを一段緩める(問題児と数を同時に盛らない)。
        const PUMPKIN_PAIR_SPAWN_EASE = 1.3;
        const pumpkinPairActive = allEnemiesNow.filter(e => e.type === 'pumpkin').length >= 2;
        // バッチ3(最小版・第一レバー): 関所中はテンポをgatePressureが連続的に駆動する
        // (1.0→0.55の連続、段差なし)。シーン固定のintervalMultは関所以外(緩)でのみ使う。
        const baseIntervalMult = pressureOutdoor
          ? intervalMultForPressure(gatePressureRef.current.state.pressure)
          : (scene ? scene.intervalMult : 1);
        // バッチ3.5-B(盤面在庫): PUMPKIN_PAIR_SPAWN_EASEの一般化。固いのが盤面に溜まるほど注ぐ量が
        // 細る(debtTempoEaseMult: interval×(1+0.05×max(0,debt-8))、上限×1.6)。
        // GAME_AUDIT #4: 一般化=置き換えなので乗算で二重掛けせずmaxで合成する(パンプキン2体は
        // debt≈12→×1.2と1.3が重なって×1.56になっていた)。?debt=0時は従来のペア緩和のみが残る。
        const debtEaseMult = DEBT_ENABLED ? debtTempoEaseMult(boardDebtNow) : 1;
        const hardBoardEase = Math.max(debtEaseMult, pumpkinPairActive ? PUMPKIN_PAIR_SPAWN_EASE : 1);
        const sceneIntervalMult = baseIntervalMult * relaxAdj.intervalMult * hardBoardEase;
        // DISTRIBUTION_REDESIGN.md③: レアのシーン/Rank連動。山場(シーンrareMult≥1)でだけRankの
        // rareBoostで増幅する(緩=0/無双=0.5はそのまま=Rankが高くても休憩・無双の色は変えない)。
        const sceneRareBase = scene ? (scene.rareMult ?? 1) : 1;
        // バッチ3: pressure≥0.80でさらにレア演出を底上げ(rareMult×1.35相当)。
        const pressureRareBoost = pressureOutdoor && rareBoostActiveForPressure(gatePressureRef.current.state.pressure) ? 1.35 : 1;
        const sceneRareMult = (sceneRareBase >= 1 ? sceneRareBase * (1 + rankAdj.rareBoost) : sceneRareBase) * pressureRareBoost;
        // バッチ3: 関所中は「今許可されている問題児」以外を完全ブロック(重み0)。既存のシーン
        // featured/suppressedはそのまま(scene.featuredが持つ意図=何を強調したいかは尊重しつつ、
        // pressureがまだ許可していない型は上書きでブロックする)。緩フェーズ(pressure対象外)は
        // ブロック無し=従来どおり。
        const ALL_PROBLEM_CHILDREN: ProblemChild[] = ['plant', 'werewolf', 'pumpkin', 'screamer', 'ghost'];
        const sceneBlocked: EnemyType[] = pressureOutdoor
          ? ALL_PROBLEM_CHILDREN.filter(t => !allowedProblemChildren(gatePressureRef.current.state.pressure, pressureCastRef.current.order ?? ['pumpkin', 'werewolf']).includes(t))
          : [];
        // バッチ3.5-Bの追補(問題児リフラクトリ): 同型の問題児をキルしてから15秒は、通常湧き抽選でも
        // 再投入を禁止する(gatePressure配役側は下のpendingCast投入でも同じisInRefractoryを見る)。
        // screamer(専用ディレクター持ち)・ボス系は対象外(REFRACTORY_TYPESに含めない)。
        if (PROGRAM_ENABLED) {
          const REFRACTORY_TYPES: ProblemChild[] = ['plant', 'werewolf', 'pumpkin', 'ghost'];
          for (const t of REFRACTORY_TYPES) {
            if (!sceneBlocked.includes(t) && isInRefractory(getLastKillAt(t), gameTime)) sceneBlocked.push(t);
          }
        }
        // バッチ3.5-A(チャフ配合): シーンにmixが有る時だけ、関所中はgatePressureで連続シフトした
        // 配合を使う(緩フェーズ・関所外はシーンmixをそのまま)。mix未指定シーン(gate-chaos等)は
        // undefinedのまま=selectEnemyTypeは従来の重み計算を素通りする。
        const sceneMix = (MIX_ENABLED && scene?.mix)
          ? pickChaffMix(scene.mix, pressureOutdoor ? gatePressureRef.current.state.pressure : null)
          : undefined;
        // カメラ下げ分だけ縦スポーンバンドを上へずらす(屋外のみ)。上端に湧きが画面内で見えないように。
        const spawnViewOffsetY = (labTheme || indoor) ? 0 : gameBounds.height * CAMERA_DOWN_OFFSET_FRAC;
        // 文脈カメラズームで引いている分だけ、湧き位置を外へ広げる(引いても画面外に湧かせる・社長指示)。
        // カメラと同じ target を読む(視覚専用のズーム値ではなく target=純関数)。屋内/ラボは対象外。
        const czInvZoom = (labTheme || indoor) ? 1 : 1 / contextZoomTarget(nearEnemies.length, nearEnemies.some(e => isLargeForZoom(e.type)));
        const spawnBounds = czInvZoom > 1.0001
          ? { width: gameBounds.width * czInvZoom, height: gameBounds.height * czInvZoom }
          : gameBounds;
        // バッチ3(最小版・配役): pressureが0.50/0.65を新規に上向きに跨いだ瞬間、forcedTypeで
        // 1体だけ即座に投入する(L4DのTank/特殊感染者のような「ディレクターが意図した瞬間に落とす」演出)。
        // spawn CD(sceneIntervalMult)とは独立=通常湧きの間隔を消費しない。1体目のスタイルはラン内で
        // 最初に0.50を跨いだ時点で決め、以後ラン内固定。
        // バッチ3.5-B(盤面在庫): ①L4DのTank存命中ルール=同型が1体でも生存中は次を投入しない
        // (旧cap=2から変更・社長承認)②debtが高い間は投入を延期。パルス(castFirstNow/SecondNow)は
        // 一瞬しか立たないため、その場で投入できなければpendingCastへ保留し、条件が晴れるまで
        // 毎フレーム再チェックする(タイマー消費なし=「掃けたら発火」)。
        // GAME_AUDIT #2: 保留中の配役は関所(gate)の中でしか投入しない。関所を出たら破棄する
        // (延期されたパンプキン等が次の緩/ボス中に湧くのは憲法第5条「緩を荒らさない」違反)。
        // 次の関所はpressure登り直し=0.50/0.65跨ぎから配役もやり直し、が正。
        if (!pressureOutdoor && pressureCastRef.current.pendingCast) {
          pressureCastRef.current.pendingCast = null;
        }
        if (pressureOutdoor && !danceTest && !indoor && !confining) {
          if (gatePressureRef.current.castFirstNow || gatePressureRef.current.castSecondNow) {
            if (!pressureCastRef.current.order) {
              pressureCastRef.current.order = specialCastOrder(getCurrentStyle(), Math.random());
            }
            const order = pressureCastRef.current.order;
            const castType: ProblemChild = gatePressureRef.current.castFirstNow ? order[0] : order[1];
            pressureCastRef.current.pendingCast = castType;
          }
          const pending = pressureCastRef.current.pendingCast;
          if (pending) {
            const aliveOfType = useGameStore.getState().enemies.filter(e => e.type === pending).length;
            // ?debt=0 は完全復帰(旧cap=2・延期なし)。既定はTank存命中ルール(生存0体のみ)+debt延期。
            const aliveOk = DEBT_ENABLED ? aliveOfType === 0 : aliveOfType < 2;
            const debtOk = !DEBT_ENABLED || boardDebtNow <= CAST_DEBT_MAX;
            // 問題児リフラクトリ: 同型を倒した直後15秒はgatePressure配役でも再投入しない(社長報告対応)。
            const refractoryOk = !PROGRAM_ENABLED || !isInRefractory(getLastKillAt(pending), gameTime);
            if (aliveOk && debtOk && refractoryOk) {
              const castEnemy = generateEnemy(gameTime, player, spawnBounds, pending, player.lastDirection, spawnViewOffsetY, snowTheme, spawnEsc);
              addEnemy(castEnemy);
              pressureCastRef.current.pendingCast = null;
            }
          }
        }
        // バッチM1-C(主題保証・社長決定v0.25.1362): 関所開始から15秒経ってもその関所のfeatured問題児が
        // 当該関所内で1体も出現していなければ、pressure/boardDebtを無視して1体を確定投入する。
        // screamerは対象外(既存の専用ディレクターが独自にCD/同時数を管理しているため・
        // REFRACTORY_TYPESと同じ理由でここでも除外)。イベント関所(featured空)は自然に対象外。
        // `?m1=0`でこの保証自体を丸ごと無効化(旧挙動=保証なし)。
        if (M1_ENABLED && pressureOutdoor && !danceTest && !indoor && !confining && featureGuaranteeRef.current.startSnapshot) {
          const featured = effectiveGateProgram ? effectiveGateProgram.featured : curPhase.scene.featured;
          const isEventGate = effectiveGateProgram?.eventKind != null;
          const elapsedMs = gameTime - featureGuaranteeRef.current.startedAt;
          const startSnapshot = featureGuaranteeRef.current.startSnapshot;
          const nowSpawns = snapshotSpawns();
          for (const t of featured) {
            if (t === 'screamer') continue;
            const type = t as GuaranteeType;
            if (featureGuaranteeRef.current.satisfied.has(type)) continue;
            const aliveOfType = useGameStore.getState().enemies.filter(e => e.type === type).length;
            const guarantee = shouldGuaranteeSpawn({
              type,
              elapsedMs,
              spawnedCountForType: nowSpawns[type] - startSnapshot[type],
              area: playerAreaIdx,
              isEventGate,
              aliveOfType,
              lastKillAtMs: getLastKillAt(type),
              nowMs: gameTime,
            });
            if (guarantee) {
              const guaranteedEnemy = generateEnemy(gameTime, player, spawnBounds, type, player.lastDirection, spawnViewOffsetY, snowTheme, spawnEsc);
              addEnemy(guaranteedEnemy);
              featureGuaranteeRef.current.satisfied.add(type);
            }
          }
        }
        // PACING_PUZZLE.md §2: 本方式ON時(ボスフェーズ以外)は、通常湧きスポナーの型選択と上限を
        // 本方式(M2/M3)が供給する。旧経路(下のif全体)は二重湧きを避けるため丸ごとスキップする
        // (ボス中はpuzzleActiveNow=falseなので既存どおりここが動く)。
        if (
          !danceTest &&
          !indoor &&
          !confining &&
          !bossChasingNow && // 裏ボスが画面内で追跡中だけ通常湧きを止める(非追跡=画面外/帰巣中は湧く・社長指摘)
          !puzzleActiveNow &&
          fieldCount < normalSpawnCap &&
          timestamp - lastEnemySpawnRef.current > getEnemySpawnInterval(gameTime) * (labTheme ? LAB_SPAWN_INTERVAL_MULT : 1) * sceneIntervalMult
        ) {
          const spawnCount = Math.min(
            labTheme ? LAB_SPAWN_COUNT_MAX : getEnemySpawnCount(),
            normalSpawnCap - fieldCount
          );
          // 憲法第2条(PACING_REDESIGN.md): 問題児の同時数キャップ。犬2/弾2(既存済み)+パンプキン2/毒(ghost)1(新規)。
          let plantCount = useGameStore.getState().enemies
            .filter(e => e.type === 'plant').length;
          let wolfCount = useGameStore.getState().enemies
            .filter(e => e.type === 'werewolf').length;
          let pumpkinCount = useGameStore.getState().enemies
            .filter(e => e.type === 'pumpkin').length;
          let ghostCount = useGameStore.getState().enemies
            .filter(e => e.type === 'ghost').length;
          const overCap = (t: EnemyType): boolean =>
            (t === 'plant' && plantCount >= 2) ||
            (t === 'werewolf' && wolfCount >= 2) ||
            (t === 'pumpkin' && pumpkinCount >= 2) ||
            (t === 'ghost' && ghostCount >= 1);
          // 研究所スキン: 区画(LAB_ZONE)ごとの現在の敵数を集計(1区画 LAB_ENEMIES_PER_ZONE 体まで)。
          const labZoneCounts = new Map<string, number>();
          if (labTheme) {
            for (const e of useGameStore.getState().enemies) {
              const k = labZoneKey(e.x + e.width / 2, e.y + e.height / 2);
              labZoneCounts.set(k, (labZoneCounts.get(k) ?? 0) + 1);
            }
          }

          let spawnedThisTick = false; // 実際に1体でも配置できたか(ラボの棄却で空振りした時はCDを消費しない)
          for (let i = 0; i < spawnCount; i++) {
            // 研究所スキンは湧きをラボ用ゾンビ(Lv1/2/3)に固定。画面外ランダム配置は generateEnemy を流用。
            // 索敵仕様: 湧いた時点は休眠(dormant)。プレイヤーが aggroRange 内 かつ 壁越しでない(視界)時に起床。
            // (起床判定は updateEnemies の dormant ブロック: 距離 + segmentBlocked(wallRects))。
            if (labTheme) {
              const labEnemy = generateEnemy(gameTime, player, spawnBounds, selectLabEnemyType(gameTime), player.lastDirection);
              // 配置は generateEnemy の「固定ビュー矩形の外側 OFFSCREEN_SPAWN_MARGIN」スポーンをそのまま使う
              // (通常敵と統一・社長指示B)。旧: 半径(halfDiag+…)リング配置は廃止。
              const ecx = labEnemy.x + labEnemy.width / 2, ecy = labEnemy.y + labEnemy.height / 2;
              // スタート地点(原点)付近には湧かせない。
              if (Math.hypot(ecx, ecy) < LAB_START_SAFE_RADIUS) continue;
              // 1画面区画あたりの上限を超える区画には湧かせない。
              const zk = labZoneKey(ecx, ecy);
              if ((labZoneCounts.get(zk) ?? 0) >= LAB_ENEMIES_PER_ZONE) continue;
              labZoneCounts.set(zk, (labZoneCounts.get(zk) ?? 0) + 1);
              labEnemy.dormant = true;
              labEnemy.aggroRange = LAB_SPAWN_AGGRO_RANGE;
              labEnemy.vx = 0;
              labEnemy.vy = 0;
              addEnemy(labEnemy);
              spawnedThisTick = true;
              continue;
            }
            let enemy = generateEnemy(gameTime, player, spawnBounds, undefined, player.lastDirection, spawnViewOffsetY, snowTheme, spawnEsc, sceneFeatured, sceneSuppressed, sceneRareMult, sceneFloorAllowed, sceneBlocked, sceneMix);
            // 憲法第2条: 問題児(plant/werewolf/pumpkin/ghost)は同時数キャップを超えて湧かせない。
            // 台本セットピース/保証出現(forcedType指定)はここを通らない=脚本の見せ場はそのまま。
            if (overCap(enemy.type)) {
              let tries = 0;
              while (overCap(enemy.type) && tries < 8) {
                enemy = generateEnemy(gameTime, player, spawnBounds, undefined, player.lastDirection, spawnViewOffsetY, snowTheme, spawnEsc, sceneFeatured, sceneSuppressed, sceneRareMult, sceneFloorAllowed, sceneBlocked, sceneMix);
                tries++;
              }
              if (overCap(enemy.type)) {
                // 再抽選し切れなかった → skeletonへ強制(全キャップを素通りさせない安全網)。
                enemy = generateEnemy(gameTime, player, spawnBounds, 'skeleton', player.lastDirection, spawnViewOffsetY, snowTheme, spawnEsc, [], [], sceneRareMult);
              }
            }
            if (enemy.type === 'plant') plantCount += 1;
            if (enemy.type === 'werewolf') wolfCount += 1;
            if (enemy.type === 'pumpkin') pumpkinCount += 1;
            if (enemy.type === 'ghost') ghostCount += 1;
            // バッチ4(講習): 演目の主役(lessonPrimary)を1体出したら投入済みフラグを立てる
            // (1フェーズ合計1体・キル後は再投入しない=effectiveProgramが以後featuredを空にする)。
            if (PROGRAM_ENABLED && reliefProgramRef.current.program?.lessonPrimary === enemy.type) {
              reliefProgramRef.current.lessonSpawned = true;
            }
            // v0.25.1343: 回収の主役の投入数を数える(フェーズ合計2体でfeatured/floorを畳む)。
            if (PROGRAM_ENABLED && reliefProgramRef.current.program?.recoveryPrimary === enemy.type) {
              reliefProgramRef.current.recoverySpawned += 1;
            }
            addEnemy(enemy);
            spawnedThisTick = true;
          }

          // 実際に配置できた時だけクールダウンを消費。ラボで候補が安全圏/区画上限に棄却されて1体も
          // 置けなかった場合はCDを消費せず次フレームで再挑戦(=空振りでインターバルを丸ごと無駄にしない)。
          // 屋外は必ず1体置くので従来どおり毎回リセット=挙動不変。
          if (spawnedThisTick) lastEnemySpawnRef.current = timestamp;
        }
        // 保証出現(plant1分/犬3分・エリア不問)はPACING_REDESIGN.mdバッチ1.5で撤廃(社長決定)。
        // 「勉強させる回」の役割はバッチ4の講習演目(relief-pumpkin/relief-wolf、featuredFloor有効)が継承する。

        // PACING_PUZZLE.md バッチM4: 盤面構成パズル方式の配線。§2の停止/継続リストどおり、
        // 通常湧きスポナー(上のif全体)の代わりにここが型選択と上限を供給する。
        // ボス中(puzzleActiveNow=false)は何もしない=リフを一切触らない(査定・コマ進行を一時停止し、
        // ボス後に続きから再開する。§2「ボス中は査定・台本を停止、ボス後再開」)。
        // (実装: src/utils/directorTick.ts の runKomaBoardMaintenance へ移設。挙動は不変)。
        // PACING_PUZZLE.md §5.21-追補4: 追補3の「ゲート1中はchaff目標=ピーク・CD0を強制」は撤回済み
        // (gate1.ts参照)。ゲート1中もkomaは通常どおりディレクター駆動のまま=ここに特別分岐は無い。
        runKomaBoardMaintenance(
          { puzzleKomaRef, puzzleHitRef, puzzleClockRef, puzzleCdRef, puzzleSoftenRef, directorRef, namedFoeRef },
          {
            puzzleActiveNow, gameTime, deltaTime, player, playerAreaIdx, spawnBounds, spawnViewOffsetY, snowTheme, spawnEsc,
          }
        );

        // Air-dropped ammo supplies (#3). At an irregular cadence a resupply
        // crate appears at a random spot just off-screen, so the player has to
        // break position to go fetch it — guided there by the VS-style edge
        // arrow the renderer draws for worldDrop pickups. Capped so the field
        // never clutters with crates. gameTime-based so pauses don't cheat it.
        const MAX_WORLD_AMMO_DROPS = 1;
        const worldAmmoCount = pickups.filter(
          p => p.worldDrop &&
            (p.type === 'ammo-handgun' || p.type === 'ammo-shotgun' || p.type === 'ammo-rifle')
        ).length;
        if (nextAmmoDropDelayRef.current === 0) {
          nextAmmoDropDelayRef.current = 50000 + Math.random() * 10000; // first drop ~50-60s in
        }
        if (
          worldAmmoCount < MAX_WORLD_AMMO_DROPS &&
          !hasSkill(useGameStore.getState().player, 'knife-master') && // ナイフマスターは弾薬ドロップ0%(社長指示)
          gameTime - lastAmmoDropRef.current > nextAmmoDropDelayRef.current
        ) {
          // Place it just beyond the viewport at a random bearing from the
          // player so it's always off-screen (and within ~1.6 screens away).
          const angle = Math.random() * Math.PI * 2;
          const halfMax = Math.max(gameBounds.width, gameBounds.height) / 2;
          const dist = halfMax * (1.1 + Math.random() * 0.5);
          const px = player.x + player.width / 2 + Math.cos(angle) * dist;
          const py = player.y + player.height / 2 + Math.sin(angle) * dist;
          // Only drop ammo for gun families the player owns, weighted toward
          // the active gun so the trek usually pays off.
          const owned = getGuns(player)
            .map(w => w.ammoType)
            .filter((t): t is AmmoType => !!t);
          const equippedAmmo = getActiveGun(player)?.ammoType;
          const dropType =
            equippedAmmo && Math.random() < 0.7
              ? equippedAmmo
              : owned[Math.floor(Math.random() * owned.length)];
          addPickup({
            id: `pickup-airdrop-${Math.floor(gameTime)}-${Math.floor(Math.random() * 1e6)}`,
            x: px - 8,
            y: py - 8,
            type: `ammo-${dropType}` as 'ammo-handgun' | 'ammo-shotgun' | 'ammo-rifle',
            value: 0,
            worldDrop: true
          });
          spawnRing(px, py, 10, 70, 'rgba(252, 211, 77, 0.7)', 3, 520);
          lastAmmoDropRef.current = gameTime;
          nextAmmoDropDelayRef.current = 75000 + Math.random() * 30000; // 75-105s between drops
        }

        const playerCenterX = player.x + player.width / 2;
        const playerCenterY = player.y + player.height / 2;

        // 武器箱の補給(社長指示: 時間沸きを廃止し、出すタイミングをAI側で制御)。
        // 本数と「解禁時刻」は従来の3本/同時刻のまま(総量は変えない)。解禁後、実際に落とすのは
        //   (a) 穏やかな窓(台本のbuildup=関所間の緩む区間) … 補給は緩の時間に取らせる(Codex方針)
        //   (b) ピンチ救済(pity)が立ち上がっている      … 苦戦中の人には今すぐ武器を届ける
        //   (c) 解禁からCRATE_FORCE_AFTER_MSが経過        … 取りっぱぐれ防止の強制投下
        // のいずれか最初の瞬間。現行の台本では3本とも解禁がbuildup中なので既定の体感はほぼ従来どおり、
        // 解禁が関所に重なった時とピンチ時だけ挙動が変わる。
        const CRATE_UNLOCK_TIMES = [50000, 140000, 180000];
        const CRATE_FORCE_AFTER_MS = 60000;
        if (
          cratesDroppedRef.current < CRATE_UNLOCK_TIMES.length &&
          gameTime >= CRATE_UNLOCK_TIMES[cratesDroppedRef.current] &&
          (curPhase.kind === 'buildup' ||
            (PITY_ENABLED && pityLevel(pinchRef.current.pinchMs) > 0) ||
            gameTime >= CRATE_UNLOCK_TIMES[cratesDroppedRef.current] + CRATE_FORCE_AFTER_MS)
        ) {
          const angle = Math.random() * Math.PI * 2;
          const cx = player.x + player.width / 2 + Math.cos(angle) * 200;
          const cy = player.y + player.height / 2 + Math.sin(angle) * 200;
          addPickup({
            id: `pickup-crate-supply-${cratesDroppedRef.current}`,
            x: cx - 8,
            y: cy - 8,
            type: 'weapon-crate',
            value: 0,
            worldDrop: true
          });
          spawnRing(cx, cy, 10, 80, 'rgba(96,165,250,0.8)', 3, 520);
          cratesDroppedRef.current += 1;
        }

        // VS keeps gems around, but this Pixi/HD-2D scene pays for every
        // pickup. Keep important supplies indefinitely and trim only far XP
        // gems once the field grows past the perf guardrail.
        const currentPickupsForCap = useGameStore.getState().pickups;
        if (currentPickupsForCap.length > PICKUP_HARD_CAP) {
          const importantPickups = currentPickupsForCap.filter(p => p.type !== 'experience' && p.type !== 'strap');
          const keptStraps = currentPickupsForCap
            .filter(p => p.type === 'strap')
            .sort((a, b) => {
              const da = Math.hypot(a.x + 8 - playerCenterX, a.y + 8 - playerCenterY);
              const db = Math.hypot(b.x + 8 - playerCenterX, b.y + 8 - playerCenterY);
              return da - db;
            })
            .slice(0, STRAP_PICKUP_KEEP_COUNT);
          const keptXp = currentPickupsForCap
            .filter(p => p.type === 'experience')
            .sort((a, b) => {
              const da = Math.hypot(a.x + 8 - playerCenterX, a.y + 8 - playerCenterY);
              const db = Math.hypot(b.x + 8 - playerCenterX, b.y + 8 - playerCenterY);
              return da - db;
            })
            .slice(0, XP_PICKUP_KEEP_COUNT);
          useGameStore.setState({ pickups: [...importantPickups, ...keptStraps, ...keptXp] });
        }

        // Scripted wave/elite events (compressed 5-min schedule: early plant,
        // mid-boss spikes, the 7-strong onslaught, finale giantbat).
        // consumeDueWaves fires each event exactly once.
        // 研究所スキンは森系の演出波(plant/pumpkin/zombie/skeleton/werewolf)を出さない=
        // 湧きはラボ用ゾンビのみ。クリアボス(giantbat)は別経路(城ボス)で維持。
        if (SETPIECE_ENABLED && !danceTest && !indoor && !labTheme && !confining) {
          const waveEnemies = consumeDueWaves(
            gameTime,
            consumedWavesRef.current,
            player,
            gameBounds
          );
          waveEnemies.forEach(addEnemy);
        }

        // (実装: src/utils/directorTick.ts の runOffscreenRecycleAndCull へ移設。挙動は不変)。
        runOffscreenRecycleAndCull({
          labTheme, indoor, gameBounds, player, playerCenterX, playerCenterY, gameTime,
          spawnBounds, spawnViewOffsetY, snowTheme, spawnEsc, playerAreaIdx, enemyCap, puzzleActiveNow,
          labSpawnAggroRange: LAB_SPAWN_AGGRO_RANGE,
        });

        // Tick visual effects (particles drift, damage numbers float, etc.)
        updateEffects(deltaTime);

        // LEVEL UP 演出(スロー)が終わったら選択肢メニューを開く(社長指示: 先に演出→その後に選択)。
        {
          const introUntil = useGameStore.getState().levelUpIntroUntil;
          if (introUntil > 0 && Date.now() >= introUntil) {
            useGameStore.setState({ showUpgradeMenu: true, isPaused: true, levelUpIntroUntil: 0 });
          }
        }

        // 社長相談(v0.25.1499): ジャンプ着地/ダッシュの赤ライン当たり判定に阻まれて保留中だった
        // レベルアップを、抜けたタイミングで発動させる(gainExperience等のイベント駆動チェックだけでは
        // 「その後XPを得ない」ケースを取りこぼすため毎フレーム再チェックする)。
        {
          const s = useGameStore.getState();
          if (
            !s.rhythm.active && !s.showUpgradeMenu && s.levelUpIntroUntil === 0 &&
            s.player.experience >= s.player.experienceToNextLevel &&
            !isPlayerInAttackTelegraph(s.player, s.enemies, PUMPKIN_EXPLOSION_RADIUS)
          ) {
            useGameStore.getState().levelUp();
          }
        }

        // Detect level-up edge: golden ring around the player.
        const currentPlayer = useGameStore.getState().player;
        if (currentPlayer.level > prevLevelRef.current) {
          const cx = currentPlayer.x + currentPlayer.width / 2;
          const cy = currentPlayer.y + currentPlayer.height / 2;
          // より派手に(社長指示): 画面フラッシュを強め＋白い閃光リング追加＋発光を大きく。
          spawnFlash('rgba(253,224,71,0.42)', 420);
          spawnRing(
            cx,
            cy,
            8, 150, 'rgba(253,224,71,0.98)', 7, 720
          );
          spawnRing(
            cx,
            cy,
            2, 70, 'rgba(255,255,255,1)', 5, 420
          );
          spawnRing(
            cx,
            cy,
            30, 210, 'rgba(251,191,36,0.66)', 4, 900
          );
          spawnRing(
            cx,
            cy,
            60, 260, 'rgba(255,255,255,0.5)', 3, 700
          ); // 追加の外周閃光
          useGameStore.getState().spawnGlow(cx, cy, 130, 'rgba(253,224,71,', 620);
          spawnBurst(
            cx,
            cy,
            '#fde68a',
            56
          );
          spawnBurst(cx, cy, '#ffffff', 18);
          // 枠(黒フチ)廃止＝Counter/KILL と同じ両サイドフェードの色帯へ。黄色地・大きめ(社長指示)。
          useGameStore.getState().spawnCallout(cx, currentPlayer.y - 14, 'LEVEL UP!', '#fffbe6', { bg: 0xf59e0b, scale: 1.3 });
          playSfx('level-up'); // レベルアップSE(社長提供・レベルが上がった瞬間)
          prevLevelRef.current = currentPlayer.level;
        } else if (currentPlayer.level < prevLevelRef.current) {
          prevLevelRef.current = currentPlayer.level; // reset after game over
        }

        // Detect successful-counter edge: gold burst + ring(視覚のみ)。
        // 注: lastCounterSuccessTime は弾反射時のみ更新されるため、インパクト(ストップ/揺れ/寄り)は
        // reflect 経路側で一度だけ入れる(ここで重ねると二重発火になる)。
        if (currentPlayer.lastCounterSuccessTime > prevCounterSuccessRef.current) {
          spawnRing(
            currentPlayer.x + currentPlayer.width / 2,
            currentPlayer.y + currentPlayer.height / 2,
            12, 80, 'rgba(252,211,77,0.95)', 4, 420
          );
          spawnBurst(
            currentPlayer.x + currentPlayer.width / 2,
            currentPlayer.y + currentPlayer.height / 2,
            '#fcd34d',
            12
          );
          // スキル: ボムカウンター = カウンター成立の瞬間にもプレイヤー中心で爆発ダメージ。
          const bcLv2 = skillLevel(currentPlayer, 'bomb-counter');
          if (bcLv2) {
            const bcRadiusMult = [0, 1, 1.15, 1.3][bcLv2];
            const bcDmgMult = [0, 1, 1.25, 1.5][bcLv2];
            const bcx = currentPlayer.x + currentPlayer.width / 2;
            const bcy = currentPlayer.y + currentPlayer.height / 2;
            const exMult = skillExplosionMult(currentPlayer);
            const radius = GRENADE_BLAST_RADIUS * exMult * bcRadiusMult;
            const base = BOMB_COUNTER_BLAST_DAMAGE * exMult * bcDmgMult * (currentPlayer.equipBonus?.damageMult ?? 1);
            spawnRing(bcx, bcy, 10, radius, 'rgba(251,146,60,0.85)', 5, 380);
            spawnBurst(bcx, bcy, '#f97316', 20);
            spawnBurst(bcx, bcy, '#7f1d1d', 8);
            useGameStore.getState().spawnGlow(bcx, bcy, 58, 'rgba(251,146,60,', 380);
            playSfx('bomb');
            for (const e of useGameStore.getState().enemies) {
              if (e.type === 'reaper' || e.aiPhase === 'jump') continue; // reaper除外・空中無敵は対象外
              const ecx = e.x + e.width / 2, ecy = e.y + e.height / 2;
              const dist = Math.hypot(ecx - bcx, ecy - bcy);
              if (dist > radius) continue;
              const falloff = 1 - dist / radius;
              const dmg = Math.max(1, Math.round(base * (0.55 + falloff * 0.45)));
              damageEnemy(e.id, dmg, true); // 爆発=ボス系には非致死
              spawnDamageNumber(ecx, e.y, dmg, false);
            }
          }
          prevCounterSuccessRef.current = currentPlayer.lastCounterSuccessTime;
        }

        // Detect HP loss edge: red screen tint flash.
        if (prevHealthRef.current === 0) {
          prevHealthRef.current = currentPlayer.health;
        } else if (currentPlayer.health < prevHealthRef.current) {
          const lost = prevHealthRef.current - currentPlayer.health;
          if (lost > 0.5) {
            spawnFlash('rgba(220, 38, 38, 0.18)', 220);
          }
          prevHealthRef.current = currentPlayer.health;
        } else {
          prevHealthRef.current = currentPlayer.health;
        }

        // (実装: src/utils/directorTick.ts の runDirectorSignalStep へ移設。挙動は不変)。
        // ★信号算出そのものはゲーム挙動を一切変えない(読むだけ)。
        runDirectorSignalStep(
          { directorRef, hunterRef, gatePressureRef },
          { directorActive: DIRECTOR_ACTIVE, deltaTime, curPhaseKind: curPhase.kind, pressureOutdoor, playerAreaIdx, boardDebtNow, upswingBonus }
        );
      }

      // Request next frame
      frameRef.current = requestAnimationFrame(gameLoop);
     } catch (err) {
      // 例外でも次フレームを必ず予約=フリーズさせない。内容は ?debug=1 オーバーレイに出す(初回ログも)。
      const e = err as Error;
      const where = String(e?.stack ?? '').split('\n')[1]?.trim()?.slice(0, 90) ?? '';
      const msg = `${e?.name ?? 'Error'}: ${e?.message ?? err} @ ${where}`;
      if (!loopErrLogged) { loopErrLogged = true; console.error('[gameLoop] body error (loop kept alive):', err); }
      try { useGameStore.setState({ debugLoopError: msg }); } catch { /* ignore */ }
      frameRef.current = requestAnimationFrame(gameLoop);
     }
    };

    // Start game loop
    frameRef.current = requestAnimationFrame(gameLoop);
    
    // Cleanup
    return () => {
      cancelAnimationFrame(frameRef.current);
      setHurricaneRumble(false); // アンマウント時に鳴動を確実に停止
      setHeartbeatLoop(false); // 心音ループも確実に停止
      setPeakLayer(false); // PEAK重ねSEも確実に停止
      setDanceMode(false);       // ダンスタイム解除(メインBGMの音量を確実に戻す)
      setDanceBeatDuck(false);   // B方式のダックも確実に戻す
      danceModeRef.current = false;
    };
  }, [
    movePlayer,
    fireWeapons,
    updateEnemies,
    updateProjectiles,
    addEnemy,
    markCastleBossSpawned,
    addProjectile,
    setSubWeaponCooldown,
    performKatanaStrike,
    rootEnemy,
    updateHuntingCharge,
    damageEnemy,
    damagePlayer,
    removeProjectile,
    reflectProjectile,
    collectPickup,
    addPickup,
    dropEnemyXp,
    syncBreakableProps,
    damageBreakableProp,
    dropBreakablePropLoot,
    autoSwitchIfDry,
    tickReload,
    setGameTime,
    updateGameStats,
    setCameraPosition,
    addMeleeFinishCombo,
    spawnBurst,
    spawnDamageNumber,
    spawnRing,
    spawnFlash,
    spawnEffect,
    updateEffects,
    onGameOver,
    triggerPlayerDeath,
    spawnEggFluidSplash
  ]);
  
  return { fps };
};

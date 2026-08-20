import { useCallback, useEffect, useRef, useState } from 'react';
import { snapGlowRadius, GLOW_R_L, GLOW_R_M, GLOW_R_S, GLOW_R_XL, GLOW_R_XS, GLOW_R_XXL } from '../utils/glowTiers';
import { placeLabSpawn, isAwayFromLabGoal } from '../utils/labSpawn';
import { shouldShowPhillTutorial, shouldShowScoutTutorial } from '../utils/labTutorial';
import { shouldShowStage1Guide } from '../utils/stage1GuideTutorial';
// §6.24-UX(POI-UX): 寄り道POIの入手トースト/解放帯の文言(通信の文言は store 側が引く)。
import { poiUnlockBandText, POI_BAND_MS, POI_SKILL_NOTE, POI_LABEL } from '../utils/detourPoiUx';
import { shouldShowMoveTutorial, M0_MOVE_TUTORIAL_AT_MS, nextM0Beat, m0AdvanceLimit, M0_PRACTICE_COUNT, type M0Beat, type M0BeatDef } from '../utils/m0Tutorial';
import { GLEN_FINAL_LINE, GLEN_ROAR_LINE, isGlenBossSpawnReady } from '../utils/glenIntro';
import { loadSeenForGate, markTutorialSeen } from '../utils/tutorialArchive';
import { getTutorial, type TutorialId } from '../data/tutorials';
import { LAB_VISION_RANGE } from '../utils/labStealth';
import { LAB_CORRIDOR_Y_LIMIT_PX } from '../world/labWalls';
import {
  useGameStore,
  INVULN_MS,
  STUN_DURATION_MS,
  CRIT_DAMAGE_MULT,
  BOSS_CRIT_DAMAGE_MULT,
  isKatanaMode,
  subWeaponBlockedByKatana,
  katanaRange,
  KATANA_SLASH_INTERVAL_MS,
  KATANA_DASH_DISTANCE,
  KATANA_DASH_HIT_HALF_WIDTH,
  KATANA_DASH_SPEED,
  combatActorPlayer,
  setActorSubWeaponCooldown,
  huntingMeleeRadius,
  PLAYER_INTRO_MS,
  PLAYER_INTRO_HELI_FRAC,
  playerIntroOffset,
  playerIntroCamFollow,
  CAMERA_INTRO_LIFT_FRAC,
  INTRO_DIALOGUE_TRIGGER_T,
  INTRO_LAND_SHAKE_MS, INTRO_LAND_SHAKE_MAG, REAPER_SUMMON_SHAKE_MS, REAPER_SUMMON_SHAKE_MAG,
  COUNTER_HITSTOP_MS, COUNTER_SHAKE_MS, COUNTER_SHAKE_MAG, COUNTER_ZOOM_MAG, SHIJIN_TECH_SHAKE_MS, SHIJIN_TECH_SHAKE_MAG,
  COUNTER_WINDOW, // v0.25.2525: 守護霊の弾反射の窓(プレイヤーのcounterWindowEndと同じ定数)
  MELEE_SWING_SHAKE_MS, MELEE_SWING_SHAKE_MAG,
  SHIELD_BLOCK_SHAKE_MS, SHIELD_BLOCK_SHAKE_MAG,
  DRONE_BOOM_RADIUS, DRONE_BOOM_PULSE_MS, DRONE_BOOM_STOP_DMG_DIV, DRONE_BOOM_SPEED,
  CAMERA_FOLLOW_TAU, CAMERA_DANGER_TAU, CAMERA_RETURN_TAU, CAMERA_LOOKAHEAD_MAX,
  CAMERA_CENTER_CLAMP_FRAC, CAMERA_DANGER_RADIUS, CAMERA_SNAP_DIST, CAMERA_DOWN_OFFSET_FRAC, CORRIDOR_CAMERA_DOWN_FRAC,
  WIRE_LAND_KNOCKBACK_SPEED, WIRE_PASS_DAMAGE_MULT, WIRE_BOMB_RADIUS, WIRE_BOMB_DAMAGE_MULT, WIRE_PASS_BOMB_RADIUS,
  WIRE_HOP_ENABLED, WIRE_HOP_MARGIN,
  BOSS_MELEE_STUN_MULT,
  bossSlowMult,
  bossCritCdMult,
  KNOCKBACK_DURATION, KNOCKBACK_IMMUNE_MS, KNOCKBACK_SPEED,
  knockbackSpeedFor, BULLET_KNOCKBACK_SPEED, SKILL_BLAST_KB_PX, // 社長指示v0.25.3270: 反射神経/ボムカウンターの実距離50pxノックバック
  // v0.25.3300 覚醒(Lv3): ボムカウンターKB100px+1段パニッシュ / エクスプローダー爆発KB×1.5 /
  // オーバークロックproc時クイックリロード / シーカー半透明中の攻撃封印(覚醒で解除)。
  BOMB_COUNTER_AWAKEN_KB_PX, skillExplosionKbMult, overclockAwakenReloadPatch, isSeekerActive,
  counterMasterAwakenBuffPatch, // v0.25.3303 カウンターマスター覚醒(成立後3秒+30%)
  skillCritMult, skillOutgoingDamageMult, sniperGunMult, skillExplosionMult, hasSkill, skillLevel, skillComboMasterMult,
  // v0.25.2514(GHOST-BUILD-1): 近接/カウンター反撃の唯一の式(プレイヤーと守護霊で共有)。
  meleeSwingBaseDamage, meleeHitCritChance, counterReplyDamage,
  skillMagnetAmmoRangeMult, skillOverclockChance, skillCooldownMult, skillGoldRushMult, strikerMeleeMult,
  skillSummonHpMult, heavyGunnerExplosionMult, enemyDeathLabel, isGameTimeStopped, enemyMeleeDist,
  isAttackLocked, // v0.25.2589: 死亡モーション中/アテンション演出中は自動攻撃を止める共通ゲート
  ATTENTION_IN_MS, ATTENTION_HOLD_MS, ATTENTION_OUT_MS,
  ENEMY_REMOVE_CAUSE, BASE_CAPTURE_RADIUS, PRAISE_WINDOW_MS, PRAISE_KILL_COUNT,
  HUNTER_VISION_RANGE, HUNTER_LEAVE_FADE_MS, AMMO_MAX,
  MELEE_FINISH_SLOW_MS, MELEE_FINISH_SLOW_HOLD_MS, PUMPKIN_EXPLOSION_RADIUS, WALL_ENABLED,
  DEATH_ZOOM_MAG, DEATH_ZOOM_MS, DEATH_ZOOM_HOLD_MS, DEATH_SLOW_SCALE, // v0.25.2586: 死亡の寄り+スロー
  EVENT_QUEST_DWELL_MS, EVENT_QUEST_REWARD_GOLD,
  NPC_DIALOGUE_MS, NPC_DIALOGUE_GAP_MS,
  RN_ENEMY_FORCE,
  FIRST_AID_KIT_THROW_DAMAGE, MINE_DAMAGE, HEAL_FRACTION, QUICK_MAG_CRIT_WINDOW_MS,
  PHASER_INDEX, BASE_SOLDIER_COUNT,
  TUTORIAL_MOVE_X_MIN_PX,
  TUTORIAL_MOVE_Y_LIMIT_PX,
  M0_FORCED_CRIT_AT_HIT,
  M0_CONVO_ADVANCE_LIMIT_X,
  GIANT_SCRIPT_ENABLED,
  GLEN_SCRIPT_ENABLED, getGlenSimTrail, // v0.25.3028: パーツ破壊爆発(門番+sim軌跡の読み取り)
  SPAWN_CLAMP_ENABLED,
  SKATER_LOCK_ENABLED,
  RESCUE_ALLY_FLYIN_MS, RESCUE_ALLY_CROUCH_MS, RESCUE_ALLY_FLYOUT_MS, RESCUE_ALLY_HOP_PX,
  BOSS_TEST_RUN, // ボス戦テスト/ボスメーカー出撃か(チュートリアル抑止に使う)
  GLEN_NIHIL_SE_MS, // 虚無の三唱の専用SEを鳴らす長さ(技の定数から導出・v0.25.3143)
  SHOP_MEDKIT_COST, // SKILL_BUILD_REDESIGN.md §15-1(B0): ボット購買ポリシーの救急価格
  EQUIP_SHOP_COST_BY_TIER, // SKILL_BUILD_REDESIGN.md §18-1の7: ボット購買ポリシー②(装備区画)の価格表
  REFLECT_DAMAGE_MULTIPLIER, // v0.25.3665: 幻影の弾パリィ(打ち返し)=プレイヤーの打ち返しと同じ倍率規則
} from '../store/gameStore';
import { PVP_DAMAGE_SCALE } from '../utils/phantomScript'; // 対人1/10(社長裁定2026-08-20)
import { glenScriptApplies } from '../utils/giantScript';
import { glenPartCountFull, glenRemovedPartAnchors } from '../utils/glenChain';
import { GATE2_BOSS_TYPE_BY_STAGE } from '../config/gateBoss';
// BOSS_MAKER.md §20-7-b「ラッシュは1体」: 練習は ?nospawn=1 で全部止め、城ボス/ストーリーボスを
// 狙っている時だけこの判定が nospawn を上書きする。
import { practiceWantsCastleBoss, practiceForces, isPracticeRun, practiceWantsGlenForm2, practiceBossType } from '../utils/bossPractice';
import { reportSuppressedError } from '../utils/errorBeacon';
import { bossCutinPayload, glenForm2CutinPayload } from '../utils/attentionCutin'; // §6.36 ボス出現カットイン(オプトイン呼び出しのみ)
import { clampRectToPlayableArea } from '../world/playableArea';
import { clampRectInsideCircle } from '../world/arena'; // v0.25.2589: 囲いの拘束を守護霊にも掛ける(プレイヤーと同じ純関数)
import { computeWireHopLanding, targetHalfDiagonal } from '../utils/wireHop';
import { isPlayerInAttackTelegraph } from '../utils/levelUpGate';
import {
  detectWallBreach, isFirstWallBreach, isApproachingWall, markWallBreached, markSelfDeepest,
} from '../utils/wallProgress';
import { pickAmmoDropType } from '../utils/ammoDrop';
// マークスマンのトラップの捕獲判定(体が円に触れたら掛かる・社長裁定v0.25.2326「a」)。
import { selectTrapTargets } from '../utils/marksmanTrap';
import { ammoDirectorRate } from '../utils/ammoDirector';
import { shouldSpawnAirdrop } from '../utils/ammoAirdrop';
import {
  applyPumpkinBlastDamage, applyEnemyFire, applyEnemyProjectileHits, applyMineDamage, applyContactDamage,
  applyGlenFloorDamage, applyGhostAllyCapsuleHit, applyGhostBossParry,
  type CombatEffects, type CombatTunables,
} from '../utils/combatTick';
// SKILL_BUILD_REDESIGN.md §28(B7): 眠り9種の判定値・確率テーブル(純関数・rng注入でテスト済み)。
// vampire/gravity-shot/execution-shock/blood-treadsの判定はgameStore.ts側(damageEnemy/
// applyMeleeFinishSkillSpread/tickBloodSpikesという既存の合流点)に乗せてあるので、ここでは
// 弾(big-bullet相当)・命中(ice-shot/incendiary-round/echo-shot)・移動軌跡の設置口だけを使う。
import {
  iceShotSlowParams, ICE_SHOT_SHARD_COUNT, ICE_SHOT_SHARD_DMG_MULT, ICE_SHOT_BOSS_EFFECT_MULT,
  incendiaryBurnParams, INCENDIARY_FLOOR_CD_MS,
  rollEchoShot,
  BLOOD_TREADS_SPAWN_INTERVAL_MS,
  BOMB_COUNTER_SELF_BLAST_RADIUS_MULT, // §28-1: ボムカウンターの自機中心爆発を大爆発に(半径×1.8)
} from '../utils/skillEffectsB7';
// v0.25.2480(★未決1解消): 守護霊カウンターの請求(スイング側が積み、per-bossハンドラが消費)。
// GHOST_FX_SHAKE_ENABLED(ゴースト演出のシェイク一括ゲート+ズーム/停止/スロー禁止の掟)もここへ移設。
import {
  GHOST_FX_SHAKE_ENABLED, setGhostCounterClaim, consumeGhostCounterClaim, ghostCounterDamage,
  applyGhostCounterEffect, type GhostCounterFire,
} from '../utils/ghostCounter';
// v0.25.2514(GHOST-BUILD-1・§2.11 裁定1): 守護霊は「計測時ビルド」で戦う。ビルドの復元+倍率評価用の
// 疑似Player(既存のプレイヤー用純関数へそのまま渡す=式を複製しないための共通化)。
import { ghostBuildFor, ghostActorPlayer } from '../utils/ghostBuild';
import { ghostArrivalPoint, ghostDeparturePoint } from '../utils/ghostLifecycle';
// v0.25.2518(GHOST-KATANA-WIRE・裁定2「共有方式」): 刀のオート斬撃の標的選択と、
// 刀の一閃/ワイヤーのロコモーション上書き。どちらもプレイヤーと守護霊が同じ純関数を通る。
import { pickKatanaSlashTarget } from '../utils/katanaAuto';
import { pickSafeKatanaDashDirection } from '../utils/katanaLanding';
import { dashModeAt, dashOverride, dashStateOf, dashStep } from '../utils/dashLocomotion';
import { npcSfxDistGain } from '../utils/npcSfx'; // v0.25.2480: ローカル定義から移設(式は無変更)
import { weaknessCritBonus } from '../utils/weaknessCrit';
import { applyEnemyCritPenalty, projectileHitCritChance } from '../utils/critPenalty';
import { computeTimeSlowScale } from '../utils/timeSlowCurve';
import { isPixiRenderer } from '../config/renderer';
import { GAME_SPEED } from '../config/gameSpeed';
import { CASTLE_BOSS_MIN_TIME_MS } from '../config/castleBoss';
import { stageBossHealthFor, STAGE_BOSS_HEALTH_BY_STAGE, guardianPhantomHealth } from '../config/bossHealth';
// research/STAGE_DIFFICULTY.md(ステージ難度の階段): 小ボスのステージ固定割当と、ボス個別適用の係数。
import { BOUNTY_TYPE_BY_STAGE } from '../config/stageDifficulty';
import { stageBossDiffMults } from '../utils/stageDiffMults';
import { canForceGateBossNow, bossMakerBossType } from '../utils/bossTest';
import { runIdolTick, createIdolTickState, pickActiveIdol, idolPlaybackActive, clearIdolPlayback, type IdolSfx } from '../utils/idolTick';
import {
  runBountyTick, createBountyTickState, pickActiveBounty, bountyMaxHealth, BOUNTY_AGGRO_RANGE_DEFAULT,
  bountyPlaybackActive, clearBountyPlayback,
  bountySpawnBlocked, bountyNaturalSpawnReady, anyBountyEngaged,
  type BountySfx,
} from '../utils/bountyTick';
// research/GHOST_BOSS.md(守護霊ボス「幻影」): 頭脳(decideGhostの対プレイヤーアダプタ)+技の状態機械。
import {
  runPhantomTick, createPhantomTickState, pickActivePhantom, type PhantomSfx,
} from '../utils/phantomTick';
import { LAB_OUTER_BOUNDS, labBlockingWalls } from '../world/labMap';
import { labWallsInRegion, labPropsInRegion, wallRect, propRect } from '../world/labWalls';
import { segmentBlocked, type Rect } from '../world/obstacles';
import { treesInRegion, trunkRect } from '../world/trees'; // resolveTreeCollisionはv0.25.2469で不使用に(霊体すり抜け)
import { cityPropsInRegion, cityPropRect } from '../world/cityProps';
import { markObstacleDestroyed } from '../world/destructibles';
import { rollWeaponKey } from '../utils/weaponDrop';
import type { AmmoType, Pickup, Projectile, EnemyType, Player, ShadowCloneState, SubWeaponKey, Summon, SkillKey } from '../types/game';
import {
  checkCollision,
  enemyContactBox,
  checkProjectileEnemyCollisions,
  checkPlayerPickupCollisions,
  checkEnemySummonCollisions
} from '../utils/collisionUtils';
import { computeMolotovTick, MOLOTOV_FIRES_BY_LEVEL } from '../utils/molotov';
// ホーミング弾: ロック蓄積の1ステップ(プレイヤー/守護霊で共有)+守護霊の「押す時間」の解決。
import {
  stepHomingLocks, ghostHomingHoldMs, HOMING_MAX_LOCKS_BY_LEVEL, HOMING_LOCK_INTERVAL_MS,
} from '../utils/homing';
import { tickSensorMines, SENSOR_MINE_DAMAGE, SENSOR_MINE_RADIUS } from '../utils/sensorMine';
import { dueArmedEggs, eggsToChainArm, EGG_BLAST_RADIUS } from '../world/mines';
import {
  computeSupportSniperTick, computeSupportSniperEntry, pickSupportSniperSoldier,
  SUPPORT_SNIPER_CD_MS_BY_LEVEL, SUPPORT_SNIPER_SLIDE_IN_MS, SUPPORT_SNIPER_SLIDE_OUT_MS, SUPPORT_SNIPER_INSET,
} from '../utils/supportSniper';
import { activeFlareTargets, pruneFlares } from '../utils/flareGun';
import { buildBomberMinis, bomberMiniCount, rollBomberScatter } from '../utils/bomberScatter';
import { computeFirstAidKitTick, isFirstAidKitEmpty, createFirstAidKitState, type FirstAidKitAmmoType, type FirstAidKitState } from '../utils/firstAidKit';

// GHOST-SUBS-FINAL(v0.25.2563): 守護霊の救急鞄の初期在庫。**型はプレイヤーと同じ**FirstAidKitStateで、
// 弾薬(除外4=守護霊は弾薬を消費しない)と爆弾(§2.11追補3=世界へアイテムを撒かない)は
// 「最初から払い出し済み」にしてある=残る中身は自分への回復1つ(裁定「自前在庫1」)。
const GHOST_FIRST_AID_KIT_INITIAL: FirstAidKitState = {
  ...createFirstAidKitState(),
  ammoHandgunDispensed: true,
  ammoShotgunDispensed: true,
  ammoRifleDispensed: true,
  bombDispensed: true,
};
import { safeThrowDirection } from '../utils/throwDir';
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
  areaIndexForPos,
  AREA_THRESHOLDS,
  OFFSCREEN_SPAWN_MARGIN,
  isCorpse,
  isBountyType,
  isGate2AngelBoss, // v0.25.3567: ボスメーカーの部屋で天使に旋回中心(home)を置くため
  resistsChipKnockback,
  isGuardianPhantom // v0.25.3640: 幻影が弾いた弾の数字/SE抑止(成果物監査Q1-1)
} from '../utils/enemyUtils';
import { distToBandRect } from '../utils/geometry'; // v0.25.3496: 帯の判定=描いてある四角
import { projectileFlightMsTo } from '../utils/projectileOrigin'; // GHOST_BOSS.md v9: 弾の飛翔時間(距離÷速度)
import { TURRET_DURATION_BY_LEVEL, turretLevelFromDuration, turretFireIntervalMs, turretNextReadyAt } from '../utils/turretTuning';
import {
  isCounterablePhase, phaseJustChanged, BOSS_ALERT_SFX_KEY,
  MIMIR_SCRIPT_ENABLED, JORMUNGAND_SCRIPT_ENABLED, SKADI_SCRIPT_ENABLED, THOR_SCRIPT_ENABLED,
  isBossCounterableNowApprox, // 守護霊のカウンター演出判別(ghostDriverと同じ近似・演出のみ)
} from '../utils/bossScript';
import {
  mimirPhaseForHealth, pickMimirMove, type MimirMove,
} from '../utils/mimirScript';
// PACING_PUZZLE.md §6.33(LASER-TRACK): 追尾予告レーザーの純関数群+定数の正本。
// §6.38 B2b: RANGE/HALF_WIDTH/FIRE_MSもここが正本(旧private定数から移設・値/挙動は無改変)。
import {
  MIMIR_LASER_WINDUP_MS, MIMIR_LASER_BROKEN_MS, MIMIR_LASER_INTERRUPTED_CD_MS,
  MIMIR_LASER_RANGE, MIMIR_LASER_HALF_WIDTH, MIMIR_LASER_FIRE_MS,
  mimirLaserPhase, stepLaserAim, mimirTrackEnabled, canInterruptMimirLaser, mimirLaserTrackCaps, usesMimirLaser,
} from '../utils/mimirLaserTrack';
import {
  jormungandPhaseForHealth, pickJormungandMove, jormRadialSpinAngle, type JormungandMove,
} from '../utils/jormungandScript';
import {
  skadiPhaseForHealth, pickSkadiMove, type SkadiMove,
} from '../utils/skadiScript';
import { pickThorMove, thorPhaseForHealth } from '../utils/thorScript';
import { choreographyRecoverMs, planBossChoreography } from '../utils/bossChoreography';
import { bossNeutralDelayMs, bossRebuildIdForEnemy } from '../utils/bossRebuild';
import { labZoneKey, LAB_START_SAFE_RADIUS } from '../world/labWalls';
import { RESCUE_RADIUS, RESCUE_ATTACKERS } from '../world/rescue';
import { bossLairPos, poiSectorIndex } from '../world/pois';
import { POLICE_ARENA_RADIUS, isNearPolice, isPoliceRearmed, policeArenaCenter } from '../world/police';
import { POLICE_REWARD_SKILLS, SKILLS } from '../data/campaign';
import { ALCHEMY_CHANNEL_MS } from '../utils/summonUtils';
import { resolveAabb, rectsOverlap } from '../world/obstacles';
import { consumeDueWaves, newConsumedWaves } from '../utils/stageDirector';
import { phaseAt, sceneAt } from '../utils/difficultyDirector';
import { spawnEscalation, gateLiveCorrection, playerPower, expectedPower, powerMargin } from '../utils/difficultyScaler';
// SKILL_BUILD_REDESIGN.md §21(B5発注文): 枠光(視覚専用)の点灯窓の長さだけを共有する。
import { OVERCLOCK_LIGHT_MS } from '../utils/frameLight';
import { createDirectorState, relaxSpawnAdjust, buildupSpawnAdjust, relaxAppliesToKoma } from '../utils/aiDirector';
import { TORCH_RELAX_BONUS } from '../world/torches';
import { resetDirectorSamples, setDirectorPower } from '../utils/aiDirectorDebug';
import { evaluatePhasePerformance, rankFromPerformance, rankAdjustFor } from '../utils/directorRank';
import { setDirectorRankRewardMult, setDirectorRankDebug } from '../utils/directorRankState';
import { createPinchState, pityLevel } from '../utils/pityDirector';
import { createBoredomState, stepBoredom, boredomBonus } from '../utils/boredomDirector';
import { shouldFireBoredomArena, BOREDOM_ARENA_START_MS, BOREDOM_ARENA_CD_MS } from '../utils/boredomArena';
import {
  isHunterSafeBaseNearby, shouldTriggerViciousHunter, pickViciousSpawnPoint, VICIOUS_REARM_MS,
} from '../utils/viciousHunter';
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
  createRankPaceState,
  clampRank,
  type PuzzleClockState, type KomaAccumulatorState, type SoftenState, type RankDelta, type RankPaceState,
} from '../utils/rankAssessor';
import {
  ZERO_NUISANCE,
  selectPattern,
  nuisanceTarget,
  type FormationPattern, type NuisanceCounts, type KomaKind4, type ChaffRampState, type NuisanceType,
} from '../utils/scriptPuzzle';
import { shouldTriggerGate1, entersGate1Penalty, effectiveReaperRiskFloor } from '../utils/gate1';
import { shouldTriggerGate2 } from '../utils/gate2';
import {
  parseBotSkill, botSkillProfile, dodgeVector, dodgeToInput, dodgeOverridesAttack,
  createWarpTrackState, warpDodge, type BotSkill,
} from '../utils/botSkill';
import { parseBotObjective, planObjective, steerTo, HOLD_INPUT, type BotObjective } from '../utils/botObjective';
import { botObjectivePois } from '../utils/botObjectivePois'; // v0.25.3052 campaign: 寄り道POIの詰め替え(実機/ヘッドレス共有)
import {
  tickEngagementPhase, createEngagementTrackState, advanceOptionDetour,
} from '../utils/botEngagement';
import {
  decideBotInput, pickupSeekInput, torchForageInput, avoidMerchantZone, MERCHANT_AVOID_RADIUS,
  adjustBotForMines, createRusherTrackState,
  escapeIfStuck, createBotStuckState, // ★v0.25.3554: 詰まり脱出(全ペルソナ共通)
  separationAdjust, // ★v0.25.3557: 近接分離ステア(skilled/master・雑魚に体を擦らない)
  decideCounterReaction, createCounterThreatState, BOT_PERSONAS, type BotPersona,
} from '../utils/playtestBot';
import { pickUpgradeByPolicy, mulberry32 } from '../utils/botUpgradePolicy';
import {
  runAngelBossTick, tickAngelBossFires, tickAcrasielSpears, createAngelBossState,
  angelPlaybackActive, clearAngelPlayback, type AngelSfx,
} from '../utils/angelBossTick';
// ボスメーカー第4弾(BOSS_MAKER.md §6 フェーズ4・v0.25.3573): 裏ボス4体の可変テーブルと▸の要求箱。
// ★入れ子オブジェクトを参照で持つ=画面で動かした値がそのまま毎フレーム効く(スカラーの再exportは不可)。
import {
  HIDDEN_COMMON_TUNING as HB_C,
  HIDDEN_MIMIR_TUNING as HB_MI,
  HIDDEN_JORMUNGAND_TUNING as HB_JO,
  HIDDEN_SKADI_TUNING as HB_SK,
  HIDDEN_THOR_TUNING as HB_TH,
  HIDDEN_COMMON_TUNING_DEFAULTS,
} from '../utils/hiddenBossScript';
import {
  takeHiddenBossPlay, settleHiddenBossPlayback, hiddenBossPlaybackActive, clearHiddenBossPlayback,
  isHiddenControllerBoss, type HiddenMoveKey,
} from '../utils/hiddenBossPlayback';
import { setPuzzleDebug, getPuzzleDebug } from '../utils/puzzleState';
import {
  computeDirCountCap, computeEnemyCap, computeNormalSpawnCap,
  runPityUpkeep, runKomaBoardMaintenance, runOffscreenRecycleAndCull, runDirectorSignalStep,
  runGhostAndTraitsStep,
  // 賞金首(§6.38 B1.5-5)の出現バナー用。useGameLoop.ts側の同名ローカル定数(既存・別件・値は同じ3500)
  // と衝突するため別名でimportする(そちらを触るのは本発注の範囲外)。
  EVENT_BANNER_MS as BOUNTY_APPEAR_BANNER_MS,
} from '../utils/directorTick';
import { debtFor, debtTempoEaseMult, CAST_DEBT_MAX } from '../utils/boardDebt';
import { resetPityDrop } from '../utils/pityState';
import {
  getKillTotals, resetKillTelemetry, setPhaseKillDebug, resetPhaseKillDebug, getCurrentStyle, getLastKillAt,
  getPhaseKillDebug, snapshotKillTotals, snapshotSpawns
} from '../utils/killTelemetryState';
import { recordSubUse, recordOverclockProc, getBotTelemetry, classifyProjectileDamageChannel, recordCritHit } from '../utils/botTelemetry';
// SKILL_BUILD_REDESIGN.md §15(B0発注文): 計測台帳の最終記録(読むだけ)+ボット購買ポリシー(実機オートパイロット側)。
import { recordRunFinal, getRunTelemetrySnapshot } from '../utils/runTelemetry';
import { decideBotShopPurchase } from '../utils/botShopPolicy';
import { notifyCounterHit, notifyMoveCounter, recordShieldPlacement, recordPhillHeadshot, recordHomingHold } from '../utils/playerTraits'; // BOT_AND_GHOST.md G1/G4a(計測専用・挙動不変)
import { decideGhost, defaultGhostProfile, ghostLeashWarp, shouldGhostClaimSub, ghostIsMovingNow, type GhostProfile, type GhostMoveRoll } from '../utils/ghostDriver'; // BOT_AND_GHOST.md G2/G2.6/G4b
import { playerAsOwner, ghostAsOwner, ownerCenterX, ownerCenterY, ownerFootY, ownerGhostId, pickSubAimTarget, type SubWeaponOwner } from '../utils/subWeaponOwner'; // G2.6 オーナー抽象化+v0.25.2472 照準の合流点
import { refundCounterCooldown } from '../utils/counterMaster'; // counter-master v2(CD_REWORK.md 確定2)
import { applySubCooldownSkills } from '../utils/subCooldown'; // G2.6 CD正規化
import { resolveBossHateAim, resolveBossLockedHateAim, type HateSide } from '../utils/bossHate'; // BOT_AND_GHOST.md §2.8 G2.5
import { calculateResultScore } from '../utils/resultScoring';
import type { KillBucket } from '../utils/killTelemetry';
import { isInRefractory } from '../utils/killTelemetry';
import { selectReliefProgram, type ReliefProgram } from '../utils/reliefProgram';
import { setReliefProgramDebug } from '../utils/reliefProgramState';
import { selectGateProgram, type GateProgram, type GateProgramId } from '../utils/gateProgram';
import { setGateProgramDebug } from '../utils/gateProgramState';
import { stageAggroFor, riseTauSForAggro, boredStartMsForAggro, gateMaxRungClampForAggro, STAGE_AGGRO_DEFAULT } from '../utils/stageAggro';
import { getSelectedStageId, getWallMeta, setWallMeta, emptyGateMeta, recordChronicle, recordChronicleGlobalFirst, updateStoryFlags } from '../data/progress';
import { exposeKomaLog, logKomaSummary } from '../utils/komaLog';
// 二人組の確定会話(統合正本)と遭遇のみ設定。ストーリーボス(M7/EX)の終幕分岐はサブ3本完了を参照。
import {
  getEventQuestConfig, EVENT_QUEST_LINES_FORCED, EVENT_QUEST_ENCOUNTER_LINES,
  eventQuestSubAcceptLines, eventQuestSubCompleteLines,
} from '../utils/eventQuest';
import { subsAllCompletedFromMeta } from '../utils/storyProgress';
import { airHopEase01 } from '../utils/airHop';
import { recordHeartbeat, readHeapMB } from '../utils/crashDiagnostics';
import {
  aabbGapDistance, bossDistanceZoomTarget, contextZoomTarget, isLargeForZoom,
  ZOOM_MIN_ABS,
  springSmoothZoom, BOSS_DISTANCE_ZOOM_RETURN_TAU, zoomCameraDownFrac, bossCameraLeadY,
  bossWideShotZoom,
  bossCameraLeadX, // v0.25.3063: 横のボス先読み(社長裁定「2をまず揃える」)
} from '../utils/cameraZoom';
import { isGhostEligibleBoss,
  advanceBossDisengageGrace, bossEngagementDistancePx, isEngageableBoss, bossRetreatKeepRadiusPx,
  facilitiesLocked, // v0.25.3054: ボス戦中の施設ロック(発火ゲート)
  BOSS_LEASH_PX, // v0.25.3057: 全ボス共通の離脱距離(実距離1500px・社長裁定)
} from '../utils/bossEngagement';
import { isBossPostureBroken } from '../utils/bossPosture';
import { fireWeapon, buildSupportSniperShot, buildGhostGunShots, getActiveGun, getGuns, ammoPoolFor, effectiveMagSize, effectiveReloadMs, effectiveFireCooldown, beginWeaponReload, finishWeaponReload, refillWeaponMagazine, weaponAfterGunShot, RANGE_BY_CATEGORY, zoomedGunRange, isDirectGunWeaponKey, isGrenadeGunKey, GHOST_REFLECT_WEAPON_KEY } from '../utils/weaponUtils';
import { playSfx, playEnemyDeath, setHurricaneRumble, setHeartbeatLoop, setPeakLayer, setDanceMode, getDanceBeatAnchorMs, prepareDeepReverseBgm, enterDeepReverseBgm, exitDeepReverseBgm, releaseDeepReverseBgm, scheduleDanceBeatKick, scheduleDanceJustKick, setDanceBeatDuck, setCorridorRadioMix } from '../audio/audioManager';
import { nextBeatToSchedule } from '../utils/danceBeat';
import { labRadioMixT } from '../world/labRadioMix';
import { HEAVY_GRENADE_FUSE_MS, HEAVY_GRENADE_RADIUS, HEAVY_GRENADE_DAMAGE, HEAVY_GRENADE_SPEED } from '../utils/grenadeSpec';
import { stepFollowChain, FOLLOW_SPEED_MULT } from '../utils/companionFollow';
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
  SHIJIN_FINISH_BOSS_DAMAGE, SHIJIN_FINISH_SCREEN_MARGIN, DANCE_BEAT_MODE,
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
// 護衛NPC関連SEの距離減衰ゲイン npcSfxDistGain は src/utils/npcSfx.ts へ移設(v0.25.2480・式は無変更。
// 守護霊カウンターのSE減衰を angelBossTick/combatTick 側でも同じ式で使うため)。
// 同じ敵に対して背中火を出してから、この時間は新しい火を出さない(=多弾/連射の重複を1本に間引く)。
// ショットガンのペレットや跳弾が別方向から当たっても、最初の1本だけ残す→「2本/別方向に出る」を防ぐ。
const FIRE_JET_DEDUP_MS = 180;

// v0.25.3291: 旧'rifle-t3'(グレネードランチャー)は対物ライフル=非爆発へ入れ替え。タレット10%弾/
// 朱雀/爆撃が流用する「着弾爆発する弾」の名義はglauncher-t1(武器庫限定グレネードガン)へ移す。
const GRENADE_WEAPON_KEY = 'glauncher-t1';
const SMG_WEAPON_KEY = 'handgun-t3'; // マシンピストル(=サブマシンガン)。発射音を通常ハンドガンと分けるのに使用。
const PHILL_WEAPON_KEY = 'phill-revolver'; // 研究所リボルバー。守護霊のヘッドショット率再現(§2.11 裁定4)で参照。
const GRENADE_BLAST_RADIUS = 92;
const GRENADE_BLAST_DAMAGE_MULT = 0.62;
// スキル: ボムカウンター = カウンター成立の瞬間にもプレイヤー中心で爆発(反射弾の爆発に加えて)。
// 威力は反射神経の反撃爆発と同等のランチャー級フラット値(要実機調整)。
const BOMB_COUNTER_BLAST_DAMAGE = 60;
const HEAVY_GRENADE_COOLDOWN_MS = 5000;
// FUSE/RADIUS/DAMAGE/SPEED は grenadeSpec.ts(葉)へ移動(v0.25.3442: idolの手榴弾技が同じ値を読む)。
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
// ホーミング弾の定数(HOMING_RANGE/HOMING_MAX_LOCKS_BY_LEVEL/HOMING_LOCK_INTERVAL_MS)は
// v0.25.2563 で src/utils/homing.ts へ移設(値は不変・守護霊と共有するため)。範囲ダメージ+ノックバック+演出。投げ直し/
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
const SHIELD_FOOT_W = 108;                    // 左右配置の縦面の長さ(遮断/効果範囲)。左右は据え置き(社長指示は上下のみ)
// 上下配置の遮断面の横幅。素材shield-up/downの可視幅の画素実測=58px(表示高92px時)に一致させる
// (社長指示v0.25.2451「見た目以上に横幅に当たり判定があるのを見た目に揃えて」。旧: SHIELD_FOOT_W=108で約2倍だった)。
const SHIELD_FACE_W_UPDOWN = 58;
const SHIELD_FOOT_H = 16;                     // フットプリント奥行(下辺=足元、縦の厚み)
const SHIELD_SIDE_DROP = 18;                  // 左右向き時、当たり/効果範囲(と絵)を下へずらす量
const SHIELD_HIT_INTERVAL_MS = 400;          // 同一敵が連続で耐久を削る最短間隔
const SHIELD_KNOCKBACK_MULT = 1.4;           // 接触した敵を外向きへ弾く強さ(store側で≤3にクランプ)
// 自動タレット: 10秒ごとにプレイヤー少し前方へ設置する定点支援。設置地点に留まり一定時間
// オート射撃。デフォルト=前方集中(ティア3SMG=handgun-t3 相当/長射程の直線制圧)。叩くと
// 全方位(ハンドガン=handgun-t1 相当/短射程の周囲対応)へ切替。通常弾の代わりに低確率で
// グレネード弾(既存ヘビーグレネードを流用)。消滅時に小爆発。数値は実機調整前提(TODO)。
// 社長裁定v0.25.3482「秒数を変えようかな。15秒+たまに爆発が3 / 13秒が2 / 10秒が1」:
// Lv1=10秒 / Lv2=13秒 / Lv3=15秒。**Lv3だけ「たまに爆発」(グレネード弾10%)が付く**。
// 旧: 全Lv 15000で「Lv2/3はTODO(暫定据置)」=買っても何も強くならない状態だった。
// v0.25.3512: 持続時間・Lv判定・発射間隔の階段は `src/utils/turretTuning.ts` へ一本化した
// (3箇所に散らすと片方だけ直した時に静かにズレるため)。ここは再輸出のみ=既存の参照を壊さない。
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
// 救急鞄(first-aid-kit・通常サブウェポン): 中身(既存ammo-*/health/bombピックアップ)の払い出し条件
// 判定は純関数(src/utils/firstAidKit.ts)。ここは投擲アーク(quick-magazineと同じ流儀)の見た目のみ。
// 使い切った鞄本体の投擲(着弾で爆発範囲攻撃・社長決定v0.25.1657)は gameStore の thrownBags/tickThrownBags が処理
// (FIRST_AID_KIT_THROW_DAMAGE/KNOCKBACK_MULTはstore側からimport=着弾処理と発生元で値を1箇所に統一)。
const FIRST_AID_KIT_THROW_DISTANCE = 82;      // TODO(救急鞄): quick-magazineと同値。仮値
const FIRST_AID_KIT_THROW_MS = 360;           // TODO(救急鞄): quick-magazineと同値。仮値
// 救急鞄: アイテム飛び出しの寄り+スロー(社長指示v0.25.1657)。救急鞄を明示的にスロー対象へ指名=
// CLAUDE.md「サブウェポンはスロー禁止」の例外(明示指示あり)。全て叩き台=実機調整前提。
const FIRST_AID_POP_ZOOM_MAG = 0.4;           // 寄りの強さ(近接フィニッシュ1.0より控えめ)
const FIRST_AID_POP_ZOOM_MS = 460;            // 寄りの長さ
const FIRST_AID_POP_ZOOM_HOLD_MS = 120;       // 最大寄りの保持
const FIRST_AID_POP_SLOW_SCALE = 0.4;         // スロー倍率
const FIRST_AID_POP_SLOW_MS = 460;            // スローの長さ
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
const GATE_ARENA_RADIUS = 300;         // §5.21-追補7: ゲート2専用の広め半径(240→300・ゲート限定)。他イベント(horde/boss/egg)は ARENA_EVENT_RADIUS のまま。
// ゲート1専用半径(社長指示v0.25.3188「ゲート1の広さを1.5倍に」): 300→450。ゲート2は据え置き
// (ミゲルの周回半径250=GATE_ARENA_RADIUS基準の式が生きているため、共用のまま広げると巻き添えになる)。
// 拘束・縁湧き・脱走判定は activeEvent.radius(イベントに保存した値)を読むので、生成箇所だけで揃う。
const GATE1_ARENA_RADIUS = Math.round(GATE_ARENA_RADIUS * 1.5); // = 450
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
// 社長指示v0.25.3317: 紅き月は**7:00固定発動・毎ラン確定**(旧: 5〜9分ランダム判定×発生率30%を廃止)。
// 城ボス(5:00)後の延長帯に入った者への洗礼という位置づけ。条件(デンジャーゾーン以深/緩コマ/
// ボス・裏ボス中は延期)は従来どおり=満たすまで毎フレーム再判定で自然に遅延する。
const RED_NIGHT_FIRE_AT_MS = 360000; // 6:00(v8.3・社長裁定2026-08-15「紅き月を6分に」。旧7:00=賞金首2体目と重なるため移動)
// PACING_PUZZLE.md §5.21-追補3(社長決定v0.25.1546): 追補2の「円内10体burst配置(ambient)」は撤去。
// ゲート1の基本沸きは通常沸き(koma maintenance)の無限流入方式へ置き換え(permeable=trueで境界を
// 越えて流入)。§5.21-追補4(v0.25.1553): koma目標/CDをピーク・CD0に強制する分岐は撤回済み=
// ゲート1中もchaffは通常のディレクター駆動のまま(gate1.ts参照)。
const ARENA_HORDE_COUNT = 18;          // ゾンビ版の初期湧き数(cap 20 以内)
const ARENA_HORDE_DURATION_MS = 40000; // ゾンビ版の制限時間保険(段階スポーン約18秒化に合わせ30→40へ)。基本は全滅で終了

// --- 寄り道POI(PACING_PUZZLE.md §6.24 M48)の専用スキル3種 ------------------------------
// 爆撃(B): タレット/朱雀と同じ GRENADE_WEAPON_KEY 経路を発射元プレイヤーで再利用する(§6.24発注メモ2)。
const POI_BOMBING_INTERVAL_MS = 3000;  // §6.24 B: 3秒に1度
const POI_BOMBING_RANGE = 380;         // §6.24 B2: ALCHEMY_AGGRO_RANGE(ハンドガン距離)と同じ「近く」の基準
const POI_BOMBING_DAMAGE = 95;         // §6.24 B1: rifle-t3 の damage(weaponUtils.ts)をそのまま
// 防衛(C): 既存の orbit フィールド(gameStore.updateProjectiles・bibles用の汎用周回)へ乗せる。
const POI_GUARD_ORBIT_RADIUS = 100;    // §6.24 C1: DRONE_BOOM_DIST_BY_LEVEL[1]
const POI_GUARD_ORBIT_SPEED = DRONE_BOOM_SPEED / POI_GUARD_ORBIT_RADIUS; // §6.24 C2: 480px/s ÷ 半径 = 角速度(rad/s)
const POI_GUARD_DURATION_MS = 24 * 60 * 60 * 1000; // 実質無期限(このランが終わるまで消えない。durationカリングを回避するための大きい値)

// the ONE ストーリーボス(M7/EX): 導入(会話)明けにプレイヤーの前方(上)へ出現させる距離(px)。
// 画面内で「目の前に現れて即戦闘」になる近さ(統合正本10.2「いきなり出現。即戦闘開始」)。
const STORY_BOSS_SPAWN_DIST = 380;
// 洋館再訪: 保存槽(洋館=castleEvent位置)接近で［グレンの薬を使う］を出す距離(px)。
const MEDICINE_USE_RADIUS = 160;
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
// 訓練(M0)の教習ビート用の配置(TUTORIAL_STAGE.md「M0 チュートリアル進行案」)。
const M0_HUNTER_AHEAD_PX = 360;            // ハンターをプレイヤーの何px先に出すか(画面内に入る距離)
const M0_SHOOT_ROUNDS = 5;                 // 射撃教習で持たせる弾数(敵HPをこの弾数ちょうどに合わせる)
const M0_MEDIC_HEAL_DELAY_MS = 1000;       // 被弾から衛生兵の回復までの間(社長指示v0.25.2302「1秒後には回復」)
const M0_AREA_CEREMONY_DELAY_MS = 800;     // 区域の説明を閉じてから銘打ちを出すまでの一拍(社長指示v0.25.2305)
const M0_AMMO_AHEAD_PX = 140;              // 弾薬を何px先に置くか(追われながら通りがかりに拾える距離)
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
const HUNTER_BASE_SAFE_RADIUS = 150;       // 開放前を含む拠点へこの距離まで近づくとハンターが撤退
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
// ランク持ち越し=廃止(PACING_PUZZLE.md §7-11c(2)・決定済み仕様)。全ランR1固定スタート
// (createPuzzleClockStateの既定がそのままR1・minRank=1)。時間経過で上がる「床」は
// runKomaBoardMaintenance側(directorTick.ts)が毎tick rankFloorForElapsed で計算し、
// minRank/rank を継続的に更新する(ここでは初期化のみ)。
const seededPuzzleClockState = (): PuzzleClockState => createPuzzleClockState();

const commitRunEndProgress = (kind: 'death' | 'clear'): void => {
  const stageId = getSelectedStageId();
  if (!stageId) return;
  const wm = useGameStore.getState().wallMeta;
  if (kind === 'clear') {
    setWallMeta(stageId, wm);
    // 社長決定v0.25.2317: ゲートの恒久解除は廃止=毎ラン必ず復活させるため、ここでは何も永続しない
    // (旧: setGateMeta(stageId, gateMeta) でクリア済みを保存していた・§5.21「ゲートの恒久解除」)。
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
// デバッグ(社長試作v0.25.1861): ?nospawn=1 で敵の湧きを全て止める(パズル盤面/旧スポナー/叫喚/
// 囲い・関所/紅き夜/ハンター/死神/城ボス)。映像美の確認用に自由に歩き回るため。ゲーム/描画の他要素は不変。
const NOSPAWN = evParam('nospawn') === '1';
const CINE_TESTBED = evParam('cine') === '1'; // cine映像の実験台。stage-7で storyBoss(グレン)を出さない(社長v0.25.1879)。
// M26-L(PACING_PUZZLE.md §6.3): 実機オートパイロット。?bot=<persona> でヘッドレスボットの判断
// (decideBotInput)を実プレイの入力へ注入する。null(無指定)=完全無効・通常プレイは1バイトも挙動を変えない。
// 不正値は 'standard' へフォールバック。'rusher'(M19深層ラッシュ専用ペルソナ)も指定可。
const BOT_PARAM = evParam('bot');
const BOT_PERSONA: BotPersona | null = BOT_PARAM === null ? null
  : ((BOT_PERSONAS as string[]).includes(BOT_PARAM) || BOT_PARAM === 'rusher') ? BOT_PARAM as BotPersona : 'standard';
// v0.25.2338: 腕前の段階 ?botskill=novice|casual|skilled|master(既定 casual=従来の挙動と同値)。
// 反応速度・カウンター成功率・回避・標的選択・危険察知を段階でまとめて動かす。?bot 無しでは未使用。
const BOT_SKILL: BotSkill = parseBotSkill(evParam('botskill'));
// v0.25.2339: 目的(ゴール) ?botgoal=clear|score|hiddenBoss[:Lv]|hunt:<敵>|depth:<px>|kills:<n>|bases:<n>
// (既定 none=従来の挙動)。目的が無いと「上手さ」は最適化する対象を持たない、が社長の診断。
const BOT_GOAL: BotObjective = parseBotObjective(evParam('botgoal'));
// ★v0.25.3619(ガントレット実機ラン1回目の学び・TEST_HANDOFF results/20260819-1750): botgoal未指定=
// {kind:'none'}だとbotは湧き位置に留まり、離れて湧くボスと一生出会わない(21枠中20枠が未接敵
// タイムアウト・技の記録ゼロ)。ガントレット中は目的を「現在の枠のボスを狩る」に固定する。
const GAUNTLET_BOT_HUNT = evParam('gauntlet') === '1';
// BOT_AND_GHOST.md G2(デバッグ召喚): ?ghost=1 でボス交戦の立ち上がりにゴースト助っ人を自動召喚する。
// G3以降は装備スキル「守護霊」(guardian-spirit)でも同じ召喚が有効(ghostRunEnabled=directorTick側でOR)。
// このフラグは開発用として残す(装備なしでも従来どおり動く)。
const GHOST_DEBUG_ENABLED = evParam('ghost') === '1';
// GHOST_FX_SHAKE_ENABLED(ゴースト演出のシェイク一括ゲート+「ズーム/停止/スローは絶対に呼ばない」の掟)は
// src/utils/ghostCounter.ts へ移設(v0.25.2480・値/意味は無変更。angelBossTick等のゴースト分岐も同じゲートを見る)。
// 被弾音のスパム保険(v0.25.2480・★未決2解消): 実ダメージ自体は damageSummon の i-frame(INVULN_MS)で
// 間引かれるので通常はこの保険に当たらない。二重保険の最短間隔のみ定数化。
const GHOST_HURT_SFX_MIN_GAP_MS = 200;
// v0.25.2481: `?autotut=1`(自動テスト用・社長承認v0.25.2479「ではそれで」)= チュートリアル
// ポップアップ抑止(gameStore側v0.25.2474)に加え、レベルアップ/宝箱の選択画面もボットと同じ
// 純関数(pickUpgradeByPolicy・決定的乱数)で即自動選択する。テストランがgameTime凍結で止まる
// 事故の恒久策(ENGINEERING_NOTES「自動テストの地雷」)。無指定の通常プレイは1バイトも変えない。
const AUTOTUT = evParam('autotut') === '1';

// 天使(ゲート2ボス)コントローラの音注入(本体はangelBossTick.ts=M26 Step3で抽出。ヘッドレスはNOOP、実プレイはここ)。
const ANGEL_SFX: AngelSfx = {
  // gain(既定1=等倍)は守護霊カウンター(v0.25.2480)の距離減衰用。プレイヤー成立は従来どおり引数なし=等倍。
  counter: (gain = 1) => playSfx('counter', gain),
  reward: (gain = 1) => playSfx('headshot', gain),
  sweep: () => playSfx('thor-sweep'),
  // PACING_PUZZLE.md §6.28(バッチM53/M55/M57/M61/M62/M63): 予告SE(全技共通=hunter-alert流用・§6.26-9 #5)。
  alert: () => playSfx(BOSS_ALERT_SFX_KEY),
};
// idol(stage-2隠しボス)の音。予告SEは全ボス共通の hunter-alert 流用(§6.26-9 #5)。
const IDOL_SFX: IdolSfx = {
  alert: () => playSfx(BOSS_ALERT_SFX_KEY),
  counter: (gain = 1) => playSfx('counter', gain),
  reward: (gain = 1) => playSfx('headshot', gain),
};
// 賞金首(§6.38 B2a)の音。予兆SEは全ボス共通のhunter-alert流用(§6.26-9 #5)。fireはレーザー発射の
// 一撃SE(ミーミルと同じ'heavy-impact'流用=useGameLoop.tsのlaser-windup→laser-fire遷移箇所と同一)。
const BOUNTY_SFX: BountySfx = {
  alert: () => playSfx(BOSS_ALERT_SFX_KEY),
  fire: () => playSfx('heavy-impact'),
  counter: (gain = 1) => playSfx('counter', gain),
  reward: (gain = 1) => playSfx('headshot', gain),
};
// research/GHOST_BOSS.md v6(幻影): 音は既存の共通キーを流用する(専用素材は作らない=「ではない」条件)。
// 銃は**プレイヤーの自動発砲と同じ銃種別の写像**(v0.25.2479パリティの並びをそのまま使う)。
const PHANTOM_SFX: PhantomSfx = {
  // ★v0.25.3640(成果物監査B): swing は**振りの音**('melee'=プレイヤーのスイングと同じ)。
  // 旧 'slash-damage' は命中音なので、空振りでも当たった音が鳴っていた。
  swing: () => playSfx('melee'),
  // 銃種SEはプレイヤーの自動発砲(下の activeGun 分岐)と完全に同じ写像にする:
  // handgun でも SMG(handgun-t3=台帳の銃)は 'smg-fire'(同じ銃なのに音が違う、を禁止)。
  shot: (category: string, key: string) => playSfx(
    category === 'shotgun' ? 'shotgun-fire'
      : category === 'rifle' ? 'rifle-fire'
        : category === 'glauncher' ? 'grenade-launcher-fire'
          : key === SMG_WEAPON_KEY ? 'smg-fire' : 'handgun-fire',
  ),
  parry: () => playSfx('counter'),
  hurt: () => playSfx('player-damage'),
};
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
// 弾薬AIディレクター(v0.25.2170・社長決定・既定ON): キルドロップ基礎率(10%)を「全所持銃の弾備蓄の
// 枯渇度×敵の多さ」で最大20%まで底上げする(src/utils/ammoDirector.ts)。`?ammodir=0`で無効化。
// gameStore側の近接キル経路も同名パラメータを各自読む(既存のammosmart等と同じ流儀)。
const AMMO_DIRECTOR_ENABLED = evParam('ammodir') !== '0';
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
// ?setpiece=1 で従来台本に復帰(切り分け用)。城ボス(5分)は別経路なので影響なし。
const SETPIECE_ENABLED = evParam('setpiece') === '1';
// (DIRECTOR_NEAR_RADIUS は src/utils/directorTick.ts の runDirectorSignalStep へ移設)
// ステップB(社長合意の最初の実接続): ?directorApply=relax の時だけ、RELAX中の湧きを relaxSpawnAdjust で緩める。
// ステップC(社長合意): ?directorApply=buildup の時だけ、BUILD_UP中にPerformanceが高いほど escalation を
// 少しだけ上乗せする(buildupSpawnAdjust。レバーはescalationのみ=Bより慎重)。?directorApply=all で両方。
// 既定(フラグ無し)は基準点(commit b1eae30)と完全に同じ挙動。可視化(?director=1)とは独立に指定できる
// (適用だけ試したい/両方見ながら試したい、のどちらも出来るように)。
const DIRECTOR_APPLY_PARAM = evParam('directorApply');
// ★社長指示v0.25.3525「面白くするためには、きつい!という場面と、楽な場面がいくつか必要。
//   **まずリラックスはおこる様にして**」= RELAXの適用を**既定ON**にする(旧: ?directorApply=relax が必須)。
//   BUILD_UP側(アクセル)は指示が「まずリラックス」なので**既定OFFのまま**据え置く。
//   切り分け用に `?directorApply=off` で従来の基準点(両方OFF)へ戻せる。
const DIRECTOR_APPLY_RELAX = DIRECTOR_APPLY_PARAM !== 'off' && DIRECTOR_APPLY_PARAM !== 'buildup';
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
// PACING_PUZZLE.md §6.28-13 W7 / §6.28-21★3(バッチM52): カウンター(パリィ)作法の統一。
// 既定で有効=裏ボス3体(mimir/jormungand/skadi)も、トール/ミゲル/ラフィと同じく溜め(windup)中の
// 接触でカウンター可能になる(現状は不可=§6.28-1-3 欠陥7)。これは裏ボス3体の明確な弱体化
// (カウンターは5倍クリ+完全気絶カウントに乗る=bumpBossCrit相当)なので、
// `?bosscounter=0` で統一前(裏ボス3体はカウンター不可)へ完全フォールバックできる。
const BOSS_COUNTER_ENABLED = evParam('bosscounter') !== '0';
// PACING_PUZZLE.md §6.33(LASER-TRACK): 追尾予告レーザー(ミーミル試験導入)。`?mimirtrack=0` で
// v0.25.2935 の旧挙動(溜め開始で方向ロック・塗りなし・弱点なし・中断なし・発射中lerp追尾)へ完全復帰。
// フラグの正本は mimirLaserTrack.ts(中断判定・描画と同じ1本を見る=監査指摘1の是正)。
const MIMIR_TRACK_ENABLED = mimirTrackEnabled();
// PACING_PUZZLE.md §5.21-追補8: テスト用の統一起動フラグ。ラン開始直後、そのステージのゲート2ボス型を
// プレイヤー近くへ即force-spawnし、ゲート2と同じ初期化(bossState=chase/home=生成中心/fromEvent)で
// すぐ戦えるようにする(拘束サークルは省略=テスト用途)。既定OFF=通常挙動不変。将来ステージが増えたら
// このlookupに追加するだけで対応する(現状はstage-1=ミゲルのみ)。
const FORCE_GATEBOSS = evParam('gateboss') === '1';
// PACING_PUZZLE.md §6.28-0★/§6.28-21(バッチM52): stage-5/6/ex1にウリ/スリィエル/アクラシエルを
// 追加(旧: 定義漏れで`?? 'miguel'`へフォールバックしていた=段階設計上の逆行=★未決①、素材受領で解消)。
// `?? 'miguel'`のフォールバックは未定義ステージの保険として残す。
// 注意(★未決事項に記録済み): stage-ex1は`campaign.ts`で`storyBossOnly:true`のため、現状ゲート2自体が
// 発火しない(`gateFireOk`が`!storyBoss`を要求)。よってこのマッピング自体は正しいが、通常のゲート2
// 経路からは当面到達できない(`?gateboss=1`のforce-spawn経路でのみ確認できる)。仕様判断(storyBossOnly
// を変えるか等)はPACING_PUZZLE.mdの★未決事項へ記録し、ここでは配線のみ行う。
// 表の正本は `src/config/gateBoss.ts`(v0.25.2857・ボスラッシュと共有するため切り出した)。
// (WAVE_GRACE_MS は src/utils/directorTick.ts へ移設)
// ダンスビートB方式(社長決定 v0.25.1339・仕様はHANDOFF_DANCE_AUDIO.md末尾)。?beat=0で従来の
// (メトロノーム無し+曲への自動アンカー同期)挙動へ完全復帰(切り分け用)。
// URL読みは config/shijin の DANCE_BEAT_MODE に一本化(ジャスト吸着でgameStoreも同じ値を読むため)。
const BEAT_ENABLED = DANCE_BEAT_MODE;
const DANCE_BEAT_SCHEDULE_WINDOW_MS = 150; // 次の1拍をこの時間内に入ったら予約する(仕様:100〜200ms)

// --- 裏ボス(深層域の隠しボス: mimir/jormungand)コントローラ定数 ---
// 深層域(原点から 7500 以上=area 4)の「指定エリア」に近づくと1回だけ出現する。
const BOSS_SPAWN_DEPTH = evNum('bossdepth', 7800);   // この深度に到達で出現(area 4 の少し内側。巣が無いタイプ用の保険)
const BOSS_SPAWN_NEAR = 1500;                        // 巣(固定)へこの距離まで近づくと出現(=指定エリアに近づくと出現)
const BOSS_EXIT_DEPTH = AREA_THRESHOLDS[3] - BOSS_SPAWN_NEAR; // 深層境界7500から1500px戻るまで戦闘継続(旧7300=余白200px)
const BOSS_REGEN_PER_SEC = 10;                       // 画面外/帰巣中は毎秒この耐久値が回復(社長指示: 40→10)
const BOSS_SCREEN_MARGIN = 120;                      // 画面上の余白px。world側ではズーム倍率で逆換算する
// ★v0.25.3573(ボスメーカー第4弾・BOSS_MAKER.md §6 フェーズ4): 裏ボス4体の**技と動きの数値**は
// `src/utils/hiddenBossScript.ts` のテーブル(HB_C/HB_MI/HB_JO/HB_SK/HB_TH)へ移した。値は1つも
// 変えていない(既定値=移設前の実装値)。**スカラーの再exportは数値のコピーで画面から動かせない**
// (第1弾の教訓)ので、使用箇所は全てテーブル読みへ書き換えてある。
// ここに残っているのは「場と交戦の値」(出現/帰巣/画面余白)と**旧実装(?<boss>script=0)専用の抽選確率**だけ。
const SKADI_ATTACK_CHANCE = 0.5;     // 【旧挙動?skadiscript=0専用】氷攻撃を選ぶ確率
const BOSS_DASH_CHANCE = 0.1;        // 【旧挙動専用】「たまーーーに」=低確率
// ミーミル専用: 射撃方向に赤いラインを2秒溜め→その方向へ太いレーザーを発射(社長指示)。
const MIMIR_LASER_CHANCE = 0.34;                     // chase からの行動抽選でレーザーを選ぶ確率(ミーミルのみ)
// §6.33(LASER-TRACK・v0.25.2937): 溜め時間の正本は mimirLaserTrack.ts(3000ms)。溜め中の挙動は
// MIMIR_TRACK_ENABLED で分岐: 新=前段2700msが物理追尾+終段300msロック / 旧=開始時ロック(方向固定)。
const MIMIR_LASER_AIM_TRACK = 1.5;                   // 【旧挙動?mimirtrack=0専用】発射中の照準追尾レート(小さいほど遅い)
// MIMIR_LASER_FIRE_MS/RANGE/HALF_WIDTHはmimirLaserTrack.tsからimport(§6.38 B2b・旧private定数から移設)。
const BOSS_FADE_MS = 2600;                        // 討伐時のFF風フェードアウト時間(描画側で使用)
// 裏ボスが障害物を踏み潰した時の爆破FX/SE/シェイク。森を突っ切ると同時破壊が多発しうるので「スロットル」で
// 一定間隔に1回だけ発火=per-frame Graphics(リング/バースト)を積み上げない安全弁(負荷の主因は数×描画法)。
const BOSS_CRUSH_FX_MS = 130;                        // 爆破FX/SE/シェイクの最短間隔(=最大~7回/秒)
// v0.25.3028(社長指示「ボスが障害物破壊した時、大きめに爆発、画面揺れして欲しい」):
// 130ms/mag3の「少し揺れる」から一撃系(パンプキン着地mag9/盾バッシュmag10)に並ぶ強さへ。
const BOSS_CRUSH_SHAKE_MS = 260;
const BOSS_CRUSH_SHAKE_MAG = 8;
/** ボスの障害物破壊/連結パーツ破壊の共通爆発(2経路+パーツ破壊で同じ絵=取りこぼし防止)。
 * 判定ゼロの「派手さの絵」なので大きめに出す(CLAUDE.md「迷ったら派手側」)。 */
const spawnBossCrushExplosionFx = (x: number, y: number, primary = true): void => {
  const st = useGameStore.getState();
  st.spawnBurst(x, y, '#fbbf24', 24);                              // 破片(黄)
  st.spawnBurst(x, y, '#f97316', 12);                              // 破片(橙)
  st.spawnRing(x, y, 8, 120, 'rgba(255,255,255,0.9)', 4, 320);     // 衝撃リング(白・速い)
  st.spawnRing(x, y, 10, 190, 'rgba(251,146,60,0.8)', 4, 480);     // 衝撃リング(橙・大きく遅い)
  st.spawnGlow(x, y, GLOW_R_M, 'rgba(251,146,60,', 420);           // 火光(プール済み=軽い)
  if (primary) {                                                   // 同フレーム複数爆発時は揺れ/SEを1回に間引く
    st.triggerShake(BOSS_CRUSH_SHAKE_MS, BOSS_CRUSH_SHAKE_MAG);
    playSfx('bomb');
  }
};
const BOSS_SUMMON_AGGRO = 2000;                      // 裏ボスが召喚へ「吸い付く」最大距離(画面内の召喚は基本対象に)
const BOSS_WARP_FADE_MS = 500;                       // ワープ先での 0.5秒フェードインの長さ(発火経路はv0.25.2957で撤廃済み。コントローラ側のフェード復帰だけ残置)
// --- 裏ボス トール(ステージ5)専用の独自攻撃(社長指示 v0.25.1318〜) --------------------------
// 前提(社長指示): 弾は撃たない・ダッシュもしない(既存burst/radial/dash抽選から除外し、専用の
// 状態機械のみを回す)。すべての攻撃がカウンター可能(各attackの実行中にcounterWindowEndを判定)。
// 数値は「同じ射程/幅=ダッシュ」等の指示から妥当な値を採用(既存の裏ボスdashに可視ラインが無かった
// ため、werewolf系の突進テレグラフ(6px下地+2px芯)を「ダッシュのライン」の基準として2倍/等倍を適用)。
// 実機調整前提でDEVELOPMENT_LOG.mdに透明化して記録。
// 社長修正指示(v0.25.1321〜): 旋回距離=ハンドガンが届かないくらいの距離(RANGE_BY_CATEGORY.handgun
// 基準)へ変更(旧: 近接距離基準)。
// ★v0.25.3573: トールの数値も `utils/hiddenBossScript.ts` の HB_TH テーブルへ移設(値は不変)。
//   旋回距離の既定216は `RANGE_BY_CATEGORY.handgun(176) + 40`、接近/後退の43.5は
//   `PLAYER_BASE_SPEED(87) × 0.5` から来ている。テーブルは**storeを import しない葉**なので
//   数値を複製してあり、一致は `hiddenBossTuning.test.ts` が機械検査する。

// ゲート内側マージン。周回半径=GATE_ARENA_RADIUS-margin-帯高さ半分(足元帯=height/2)。
// margin=20・miguel.height=60 → 300-20-30=250(仕様の目安値と一致)。
// 「移動中、たまにゆっくり歩く」(社長指示・トールのSLOWWALKと同型)。
// 弾3連攻撃(社長指示v0.25.1616→v0.25.1618で調整)。周回しながら撃つ(=立ち止まらない・社長選択B)。
// 発射数/間隔は既存のボス弾定義に統一=BOSS_BURST_SHOTS(3)/BOSS_BURST_GAP_MS(0.5秒)を参照(独自定数を廃止)。
                                             // 「剣撃より頻度高め」=0.5超(弾6:斬り4)・叩き台/要調整



// PACING_PUZZLE.md §6.28-5/7/9/10(バッチM54/M56/M58/M59・ロットL3): 裏ボス4体(mimir/jormungand/
// skadi/thor)のソウル式化=硬直(recover)新設+新技+HP段階+分岐連携。giant(§6.26)/L2(§6.28-4〜19)と
// 同じ4チャンネル分解(windup/active/recover)を、既存の壁時計系ステート機械へ「追加」する形で乗せる。
// フォールバック: ?<boss>script=0 で個別に旧挙動(硬直なし・新技なし・帯ゲートなし)へ戻せる
// (L2/giantと同じ作法)。既定は有効。フラグ本体は src/utils/bossScript.ts からimport(pixiScene.ts
// 側の描画ゲート=HPバー色/テレグラフと単一の出所を共有するため。上のimport文を参照)。
// フェーズ移行の点滅(社長裁定6.26-9 #4の踏襲。HPバー色の変化に気づかせる一瞬の点滅。値=GIANT_PHASE_FLASH_MSと同一)。
const HIDDEN_BOSS_PHASE_FLASH_MS = 1200;

// v0.25.2609(ボス動き横断監査・バッチ2): 全ての硬直に**下限900ms(withRecoverFloor)**を敷いた。
// 本作の「近接1発」= カウンター1サイクル(COUNTER_WINDOW 400ms + COUNTER_COOLDOWN 420ms = 820ms)
// なので、硬直がそれ未満だと「硬直はあるがプレイヤーは1発も入れられない」=**休符が存在しない**。
// ER資料 §1-2(ミドラ=設計の見本)の「ほぼ全コンボ後に1〜2秒の確定パニッシュ窓」を本作へ換算した床。
// 定数の宣言側を包む形にしてあるので、元の数字は履歴として読めるまま・呼び出し箇所は無改変。
// ※城ボス(giantbat/グレン)は対象外: 既に900〜1080msで床を満たしており、Phase3の500ms床は
//   社長裁定(§6.28-21★2)で意図的に短くしたものなので上書きしない。
// 硬直(recover)の実効ms(§6.28-5/7/9・裏ボスは壁時計系=このmsがそのまま実効)。硬直中は完全静止+
// 青白tint(BOSS_RECOVER_TINT)+次技抽選なし(W6)。ボスごとに値が違う技はボス別定数を分ける。
// ★v0.25.3573: 硬直/新技の値も HB_MI / HB_JO / HB_SK / HB_TH テーブルへ移設(値は不変。
//   `withRecoverFloor()` は宣言側ごと移してあるので、元の数字も床の意味もテーブルで読める)。
// v0.25.2613(社長指示「ミーミルは直して / そして二度と起きない学習」): 92→216。
// 旧値は GRENADE_BLAST_RADIUS(=92・城ボス系の値)の流用だったが、ミーミルは当たり判定が
// 248×138(半幅124)なので**円が体の中に収まり構造的に当たらなかった**。値と不変条件は
// utils/bodyCenteredAoe.ts へ移設(足元の円AoEは体の外へ届くことをテストで機械検証する)。
import { MIMIR_BITE_RADIUS } from '../utils/bodyCenteredAoe';
// ★v0.25.3591(監査 research/COUNTER_REACH_AUDIT.md): カウンター成立域=赤い予告の図形。宣言表は1箇所。
import {
  counterReachShapeFor, inCounterReach,
  HIDDEN_COUNTER_WINDUP_STATES, HIDDEN_COUNTER_RECOVER_STATES, HIDDEN_COUNTER_ACTIVE_STATES,
} from '../utils/counterReach';


// PACING_PUZZLE.md §6.28-20(バッチM64): idol(stage-2隠しボス)。★未決(下記コメント参照)により
// campaign.tsのhiddenBoss機構は通常プレイでは`!labTheme`ゲートに阻まれて到達しない(useGameLoop.ts
// 側の既存テーマ判定=campaign.tsの再設計はしない)。実機/自動検証用に?idolnow=1で強制召喚できるように
// するだけに留める(fromEvent的な単発デバッグ召喚。giant/gatebossの?castlenow=1/?gateboss=1と同じ作法)。
const FORCE_IDOL = evParam('idolnow') === '1';
// PACING_PUZZLE.md §6.38 B1(賞金首): デバッグ出現専用(`?bountynow=1`+`?bountytype=ranged|melee|balance|maiko`)。
// §6.38 掲載裁定(B4): 練習出撃(変異体対策室)は`practiceForces('bountynow')`でこの経路へ相乗りする
// (下の使用箇所で`FORCE_BOUNTY || practiceForces('bountynow')`として読む。既存URL経路はそのまま)。
const FORCE_BOUNTY = evParam('bountynow') === '1';
// research/GHOST_BOSS.md(守護霊ボス「幻影」): デバッグ出現専用(`?phantomnow=1`)。
// 練習出撃(変異体対策室の「決闘」枠)は practiceForces('phantomnow') でこの経路へ相乗りする
// (=既存のURL経路はそのまま。賞金首と同じ4点セット: ①この定数 ②`||practiceForces` ③forceRef
//  ④gameTime巻き戻しでの再アーム)。
const FORCE_PHANTOM = evParam('phantomnow') === '1';
const FORCE_BOUNTY_TYPE = evParam('bountytype'); // 'ranged'|'melee'|'balance'|'maiko'|null(=ranged既定)
// ボスメーカー(BOSS_MAKER.md): 一騎打ちの部屋。`?nospawn=1` と併用して湧きを止める。
// **数値の受け渡しにURLは使わない**(社長明示「?パラメータは回りくどい」)。この1個は部屋への入口だけ。
const BOSS_MAKER = evParam('bossmaker') === '1';
// 部屋に出す1体(BOSS_MAKER.md §1-3 / v0.25.3558でフェーズ4=賞金首4種を追加)。既定=idol。
// これも「どの部屋を立てるか」の情報なので stage と同じ扱い(数値は相変わらずURLで渡さない)。
const BOSS_MAKER_BOSS = bossMakerBossType();
// ※敵モーション動物園はゲーム内モード(?zoo=1・v0.25.2900〜2902)を撤去し、独立ページ zoo.html へ
//   移行した(v0.25.2903・社長指示「ステージそのまま使うと色々と不都合が出てくる」)。
// idolのステータス(width/height/speed/health/damage)はenemyUtils.tsのENEMY_STATS.idolを唯一の出所とする
// (ここでは複製しない)。以下は台本(帯/技)のms・半径のみ。
// ★叩き台(設計書に実行秒数の列が無い・§6.28-14と同型の未決): ローリングの実行(移動)所要時間と距離。
// ★v0.25.3573: 裏ボスの共通テーブルの**既定値**(書き換わらない側)から読む。idolは自分の
// テーブル(idolScript.ts)を持つので、ボスメーカーで裏ボスの数字を動かしてもidolは動かない。
const IDOL_ACTION_MIN_MS = HIDDEN_COMMON_TUNING_DEFAULTS.actionMinMs; // 既存の一般行動ゲートを流用(新しい数字を発明しない)
// 弾の速度/ダメージは createEnemyProjectile が enemyUtils.ts の getEnemyFireProfile('idol') から
// 引く(既に裏ボス/天使共通の320/20が登録済み・§6.28-20★配線)。ここでは複製しない。

let bossCtrlErrLogged = false;                       // 裏ボス制御例外のログは初回だけ(毎フレーム出さない)
let idolCtrlErrLogged = false;                       // idol制御例外のログも初回だけ
let angelCtrlErrLogged = false;                      // 天使(ゲート2ボス)制御例外のログも初回だけ(本体はangelBossTick.ts)
let bountyCtrlErrLogged = false;                     // 賞金首(§6.38)制御例外のログも初回だけ(本体はbountyTick.ts)
let phantomCtrlErrLogged = false;                    // 守護霊ボス「幻影」制御例外のログも初回だけ(本体はphantomTick.ts)
let loopErrLogged = false;                           // ループ本体例外のログも初回だけ
/**
 * 上の「1回きり」フラグを**全部**再アームする(research/BOSS_GAUNTLET.md 検出器5)。
 * ★なぜ要るか: これらは**ページ寿命**のフラグなので、1タブで連続して何戦も回す(ボス・ガントレット)と
 * **2戦目以降の例外が丸ごと無音**になる。戦いの切れ目で呼んで、次の戦いの初発をまた拾えるようにする。
 * 握り潰し方(挙動)は変えない=通常プレイでは誰も呼ばないので従来どおり。
 */
export const rearmLoopErrorFlags = (): void => {
  bossCtrlErrLogged = false;
  idolCtrlErrLogged = false;
  angelCtrlErrLogged = false;
  bountyCtrlErrLogged = false;
  phantomCtrlErrLogged = false;
  loopErrLogged = false;
};
// (屋内の固定敵の「画面外」復帰余白 LAB_RETURN_HOME_MARGIN は src/utils/directorTick.ts へ移設)
const PICKUP_HARD_CAP = 120;
const XP_PICKUP_KEEP_COUNT = 82;
const STRAP_PICKUP_KEEP_COUNT = 60;
// 研究所スキンの湧き敵の索敵範囲(px)。この距離内 かつ 壁越しでない(視界)ときに休眠から起床。
// ラボ湧き敵の起床索敵範囲。150 では湧きリング(画面外~570-745px)より遥かに小さく休眠敵が永久に起きず
// 「敵が一切出ない」状態に、逆に 700 では湧いた瞬間に約7割が即起床して「すぐ見つかる」状態だった(社長報告)。
// 420=画面の半対角線弱(忍び寄れる挙動)を経て、社長指示v0.25.1754で視界300pxへ(より深く忍び寄れる)。
// リサイクル(~753)より十分小さいので少し近づけば確実に起きる(=敵切れにしない)。
const LAB_SPAWN_AGGRO_RANGE = LAB_VISION_RANGE; // 視界距離は labStealth.ts が単一の出どころ(v0.25.2237で300→200)
// 1画面区画あたりのラボ敵の上限(密度制御)。
const LAB_ENEMIES_PER_ZONE = 2;
// ラボの湧き間隔倍率(大きいほど間隔が空く=湧きすぎ防止)と、1回の湧き上限。
const LAB_SPAWN_INTERVAL_MULT = 2.4; // 1.6→2.4(間隔1.5倍=湧く数が2/3・社長指示v0.25.2243)
// ゴールと反対方向(原点を挟んで逆側)へ進んでいる間だけ、上の間引きを外して**元の量(3/3)**に戻す
// (社長指示v0.25.2248)。逆走は静かなご褒美ルートにしない=進むべき方向より濃い、という意図。
const LAB_SPAWN_INTERVAL_MULT_AWAY = 1.6; // v0.25.2243以前の値(=3/3の量)
const LAB_SPAWN_COUNT_MAX = 1;
// M2は上下からではなく左右のみから湧く(社長指示v0.25.2182)。Yは歩ける帯の中に限定
// (社長指示v0.25.2242)。位置の決定は src/utils/labSpawn.ts の placeLabSpawn に一本化した。
// v0.25.2587(社長指示「少し長めにスローで見せて 死んだとわかる感じに」): 820→1700(=DEATH_ZOOM_MSと同値)。
const PLAYER_DEATH_SLOW_MS = DEATH_ZOOM_MS;
// 死亡演出を見せ切ってからリザルトへ移るまで(旧1100ms=寄りのピーク中に画面が切り替わっていた)。
// 寄り/スローの全長(1700)+余韻300ms。立ち絵の保持/フェード(pixiScene)もこの中に収まる。
const PLAYER_DEATH_TO_RESULT_MS = DEATH_ZOOM_MS + 300;
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
  const flareReadyRef = useRef(true); // フレアガンのCD明け検出(同上・ブーメラン型の一瞬通知)
  const playerKillTimesRef = useRef<number[]>([]); // プレイヤーの撃破時刻(無双判定の直近ウィンドウ)
  const fireJetEnemyAtRef = useRef<Map<string, number>>(new Map()); // 敵ID→直近の背中火spawn時刻(ショットガン等の多弾を1本に間引く)
  // SKILL_BUILD_REDESIGN.md §28(B7)★未決: 延焼弾(incendiary-round)Lv2/3の炎床は「命中のたび」に
  // 無条件で置くと連射武器で無制限に湧く(CLAUDE.mdの負荷ルール=bounded/event-onlyに反する)。
  // 仕様に数値指定が無いため、fireJetEnemyAtRef等と同じ「直近spawn時刻を覚えて間引く」流儀の
  // 裏CD(INCENDIARY_FLOOR_CD_MS)で安全側に倒す。
  const incendiaryFloorNextAtRef = useRef(0);
  const benkeiReadyRef = useRef(true); // 弁慶: 再発動CD明け検出(false→true で「閃き」フラッシュ)
  const bashHitFxRef = useRef(0);    // 盾バッシュ命中SEの既再生タイムスタンプ
  const rescueShootFxRef = useRef(0); // 救助NPC射撃SEの既再生タイムスタンプ
  const rescueRespawnRef = useRef(0); // 救助イベント: 次の攻撃者復活の予定 gameTime(0=空き無し/未予約)
  const rescueFiredRef = useRef(false); // 救助イベントは1出撃で最大1回(社長指示)。発生済みなら以降の抽選から除外。
  // この出撃のステージid(§6.24-UX のPOIチュートリアル判定用)。localStorageを毎フレーム読まないよう
  // ラン中1回だけ読んでキャッシュする(新ランで null に戻す)。
  const runStageIdRef = useRef<string | null>(null);
  // チュートリアルのM0序盤会話(グレッグ/ジュン)を左上の通信キューへ積んだか(1出撃1回)。
  const tutorialConvoQueuedRef = useRef(false);
  // 訓練(M0)の教習ビート: この出撃で既に出したもの(TUTORIAL_STAGE.md「M0 チュートリアル進行案」)。
  // 判定は純関数 `nextM0Beat`(src/utils/m0Tutorial.ts)。ここは「呼んで、出して、記録する」だけ。
  const m0BeatsFiredRef = useRef<Set<M0Beat>>(new Set());
  // M0の強制回復(社長台本v0.25.2293「ダメージ受けたらジュンが治療します！と言って強制回復」)用の前フレームHP。
  const m0PrevHpRef = useRef(-1);
  // 衛生兵の回復が入る gameTime(0=待機なし)。被弾を見せてから救うための遅延。
  const m0HealAtRef = useRef(0);
  // delayMs 付きビートの「いつ出すか」(演出を見せ切ってから説明を出すための待ち)。
  const m0PendingRef = useRef<{ id: M0Beat; at: number } | null>(null);
  // 教習の「まだ出していない残り」(社長指示v0.25.2300「3体ずつ・一気に出さずに順番に」)。
  // 倒すたびに次を1体出す。全部倒し切るまで次のビートへ進ませない。
  const m0WaveRef = useRef<{ spawn: NonNullable<M0BeatDef['spawn']>; remaining: number } | null>(null);
  // 区域の銘打ち(踏破の演出)を**説明を読み終わるまで預かる**ための保管(社長指示v0.25.2305)。
  const m0WallHoldRef = useRef<{ zone: number; at: number } | null>(null);
  // 直前フレームの区域index(-1=未初期化)。増えた=区域を越えた、で銘打ちを予約する。
  const m0ZoneRef = useRef(-1);
  // 今の教習中にクリティカルが出たか(演習の1回目を見せてから説明するための合図)。ビート開始でリセット。
  const m0CritLandedRef = useRef(false);
  // 説明を後回しにしているビート(クリ教習)。最初のクリが出てから delayMs 後に出す。
  const m0LatePopupRef = useRef<{ id: TutorialId; delayMs: number; at: number } | null>(null);
  const whipHitFxRef = useRef(0);    // 鞭命中SE
  const whipSwingFxRef = useRef(0);  // 鞭振りSE
  const anchorPlantFxRef = useRef(0); // アンカー打ち込みSE(地面)
  const anchorEnemyHitFxRef = useRef(0); // アンカーが敵に当たった時のSE(近接命中音)
  const boomThrowFxRef = useRef(0);  // ブーメラン投擲SE
  const junkShotFxRef = useRef(0);   // ジャンクウェポン発砲SE(shotgun-fire)
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
  // §6.24 M48「爆撃」: 次回発射が可能な gameTime(ms)。射程内に敵が居ない間はCDを進めない(§6.24 B3)。
  const poiBombingRef = useRef(0);
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
    // 社長指示v0.25.2317: 「去っていった」アナウンスを索敵タイムアウトの立ち去りにも出す。ただし
    // プレイヤーが一度も気づいていない索敵個体の退場まで報せるとネタバレになるので、気づかせた
    // (「何かに見られている…」or「発見された！」を出した)出撃だけを対象にするためのフラグ。
    noticed: false,
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
  // 社長決定v0.25.1844: 開始ランク=そのステージの前ラン最終ランク−1(progress.tsに永続・下限R1)。
  const puzzleClockRef = useRef<PuzzleClockState>(seededPuzzleClockState());
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
    // 社長指示v0.25.1845: 「変異体が興奮し始めた」通信をこのコマで出したか(査定コマごとに1回)。
    excitedThisKoma: boolean;
    // ★v0.25.3546: ピークの「赤い個体1体」をこのコマで出したか。
    peakRedSpawned: boolean;
  }>({
    kind: 'relax', elapsedMs: 0, script: null, scriptSpawned: { ...ZERO_NUISANCE }, seenIds: new Set(),
    lastPatternId: null, acc: createKomaAccumulator(), provisionalDelta: null, pendingFinalDelta: null,
    chaffRamp: { target: 1, msSinceRampMs: 0 }, belowTargetMs: 0, excitedThisKoma: false, peakRedSpawned: false,
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
  // PACING_PUZZLE.md §6.27 バッチM50: 連続査定(窓/被弾ストリーク)+enemiesKilledのフレーム差分用の前回値。
  const rankPaceRef = useRef<{ state: RankPaceState; prevKills: number }>({ state: createRankPaceState(), prevKills: 0 });
  // BOT_AND_GHOST.md G2: 召喚中ゴーストのプロファイル(6ノブ)。召喚時にdirectorTick側が1回だけ書き込む。
  const ghostProfileRef = useRef<GhostProfile | null>(null);
  // v0.25.2480(★未決2解消): ゴースト被弾音のエッジ検知(damageSummonのlastHit打刻を見る)+最短間隔保険。
  const ghostHurtSfxRef = useRef<{ id: string; seen: number; playedAt: number }>({ id: '', seen: 0, playedAt: 0 });
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
  // M2「一度通った道にスポーンしない」(社長指示v0.25.2244): プレイヤーが到達したXの範囲。
  // 湧き/リサイクルはこの外側(=まだ行っていない側)にだけ配置する。出撃ごとにリセット。
  const labVisitedRef = useRef<{ minX: number; maxX: number } | null>(null);
  // M2のゴール(書類)が原点から見て左右どちらにあるか(-1/+1)。0=未取得。出撃ごとにピックアップから
  // 1回だけ拾って覚える(社長指示v0.25.2248「ゴールと反対方向に行くと湧きを元の量に戻す」の判定用)。
  const labGoalSideRef = useRef(0);
  // チュートリアルの表示済みid(社長指示v0.25.2251/2252)。localStorageが正だが、同じランで連続発火
  // しないようにrefでも1回に絞る(localStorageを毎フレーム読まないための番人でもある)。
  // **null = 未読込**。初回アクセス時に遅延で読む(下の seenTutorials())。
  // v0.25.2253修正: 以前は `new Set()` で初期化し、読み込みを「新ラン検出」ブロック(gameTimeの巻き戻し
  // =同一ページ読み込みでの2回目以降の出撃)だけに置いていた。そのため**ページを開いて最初の出撃**では
  // localStorage を一度も読まず、既読でもチュートリアルが再表示されていた(=「1度だけ」が効かない)。
  const tutorialSeenRef = useRef<Set<TutorialId> | null>(null);
  const seenTutorials = useCallback((): Set<TutorialId> => (tutorialSeenRef.current ??= loadSeenForGate()), []);
  // 表示と同時に「見た」を確定させる共通処理(資料室の一覧はこの記録を引く)。
  const showTutorialOnce = useCallback((id: TutorialId) => {
    // 社長報告v0.25.2852「(ボス戦モードで)チュートリアルとかも出てきちゃう」。
    // ボス戦テスト/ボスメーカーは**ボスと戦う所だけ**を見る場なので、チュートリアルは一切出さない。
    // ★`markTutorialSeen` より**前**で止めること: ここで既読にすると、本編で一度も見ていない
    //   チュートリアルがテスト出撃のせいで「見た」ことになり、二度と出なくなる。
    // 全チュートリアル(phill/scout/stage1-guide/move/M0の各拍)はこの1関数を通るので、ここが唯一の関所。
    if (BOSS_TEST_RUN || isPracticeRun()) return;
    const entry = getTutorial(id);
    if (!entry) return;
    seenTutorials().add(id);
    markTutorialSeen(id);
    useGameStore.getState().showTutorialPopup({
      title: entry.title, lines: entry.lines, art: entry.art, img: entry.img, slides: entry.slides,
    });
  }, [seenTutorials]);
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
  const redNightFiredRef = useRef(false); // 紅き夜は1ラン1回のみ。発火済みフラグ。
  const redNightFireAtRef = useRef(RED_NIGHT_FIRE_AT_MS); // 発火時刻(7:00固定・v0.25.3317)。
  const lastSeenGameTimeRef = useRef(0);
  // Air-dropped supply timer. Tracks the gameTime of the last map ammo drop
  // and the (randomized) wait until the next one, so resupply crates appear at
  // an irregular but bounded cadence.
  const lastAmmoDropRef = useRef(0);
  const nextAmmoDropDelayRef = useRef(0);
  // How many of the scripted supply weapon-crates have dropped this run.
  const cratesDroppedRef = useRef(0);
  const prevLevelRef = useRef(1);
  // SKILL_BUILD_REDESIGN.md §24: 直前に鳴らしたawakenCutinの参照(SEエッジ検出用・新規発火だけ拾う)。
  const prevAwakenCutinRef = useRef<{ skillKey: SkillKey; skillName: string; at: number } | null>(null);
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
  // G4a計測(v0.25.2563): ホーミングを押し始めた実時刻(ms・Date.now)。0=押していない。
  // 指を離した瞬間に「押していた時間」を playerTraits へ1回記録する(記録専用=挙動不変)。
  const homingHoldStartRef = useRef(0);
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
  // v0.25.2518(裁定2): 主語ごとに別レジスタ('player' / 守護霊のsummon.id)。
  const wireLandedDashRef = useRef<Record<string, number>>({});
  // ワイヤーダッシュ中に「通過した敵」へ自動近接する際、1ダッシュにつき敵1回だけ当てるための記録。
  const wirePassHitRef = useRef<Record<string, { dash: number; ids: Set<string> }>>({});
  // 守護霊のオート斬撃(刀)の最終発動 gameTime(プレイヤーの lastKatanaSlashRef と同型・主語別)。
  const ghostKatanaSlashRef = useRef<{ id: string; at: number }>({ id: '', at: 0 });
  // 前方集中(連射)タレットの索敵スキャン角(rad)。射程に敵がいない間ゆっくり回転する。
  const turretAimRef = useRef<Map<string, number>>(new Map());
  // 敵のジャンプ/ダッシュ攻撃でのオブジェクト破壊FXのスロットル時刻(gameTime)。破壊自体は毎回・FXのみ間引き。
  const enemyCrushFxRef = useRef<number>(0);
  // M51: ジャイアント新スクリプトの予告SE(全技共通=hunter-alert流用・社長裁定6.26-9 #5)。
  // 直前フレームのaiPhaseを覚えておき、5つの溜め(windup)ステートへ切り替わった瞬間だけ1回鳴らす。
  const giantWindupSfxRef = useRef<string | undefined>(undefined);
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
  // §6.37 v6: ボス交戦ズームのstore側推定(カメラ下げ連動用)。描画側(pixiScene)と同じ純関数
  // (bossDistanceZoomTarget/交戦半径)+同じバネ/時定数で追従した推定値。描画はstoreを読むだけ=逆流なし。
  // engaged はヒステリシス用(交戦中は離脱半径で判定=pixiの bossCameraEngaged と同じ作法)。
  const camBossZoomRef = useRef<{ z: number; v: number; engaged: boolean }>({ z: 1, v: 0, engaged: false });
  // §6.37 v7: ボス方向への縦カメラ先読み(世界px・正=北)。イージング済みの現在値をフレーム間で保持。
  const camBossLeadYRef = useRef<number>(0);
  // v0.25.3063: 横のボス先読み(世界px・正=東)。縦と同じ目標ライン式・同じ時定数(社長裁定「2をまず揃える」)。
  const camBossLeadXRef = useRef<number>(0);
  // ダンスタイムBGM切替の前回状態(リズムの active 変化を検出して setDanceMode する)。
  const danceModeRef = useRef<boolean>(false);
  // ステージ2(屋外ラボ廊下)BGMクロスフェード: 直前フレームがlab対象コマだったか。falseへ落ちた
  // 最初のフレームだけ setCorridorRadioMix(0) を1回呼んで止める(毎フレーム0を呼び続けない)。
  const labRadioActiveRef = useRef<boolean>(false);
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
  const bossRef = useRef<{ spawned: boolean; bossId: string | null; homeX: number; homeY: number; lastX: number; lastY: number; w: number; h: number; retreating: boolean; disengageSince: number | undefined; lastCrushFxAt: number; warpUntil: number; vx: number; vy: number; dashDirX: number; dashDirY: number; thorPrevHealth: number; thorRangedHits: number[]; thorNextBackstepAt: number; thorNextOrbitStepAt: number; thorNextSlowWalkAt: number; thorSlowWalkUntil: number; mimirAimVX: number; mimirAimVY: number; mimirLockSfxUntil: number; mimirBrokenSfxUntil: number }>(
    // mimirAimVX/VY=§6.33追尾照準の速度(dashDirX/Yと同じ「コントローラ内スクラッチ」扱い=storeへは
    // 位置aiTargetX/Yのみ書く)。mimirLockSfxUntil/mimirBrokenSfxUntil=ロックSE/中断SEの重複再生防止打刻。
    { spawned: false, bossId: null, homeX: 0, homeY: 0, lastX: 0, lastY: 0, w: 0, h: 0, retreating: false, disengageSince: undefined, lastCrushFxAt: 0, warpUntil: 0, vx: 0, vy: 0, dashDirX: 0, dashDirY: 0, thorPrevHealth: -1, thorRangedHits: [], thorNextBackstepAt: 0, thorNextOrbitStepAt: 0, thorNextSlowWalkAt: 0, thorSlowWalkUntil: 0, mimirAimVX: 0, mimirAimVY: 0, mimirLockSfxUntil: 0, mimirBrokenSfxUntil: 0 }
  );
  // ?gateboss=1 診断: ラン開始後に1回だけそのステージのゲート2ボスをforce-spawnしたかどうか。
  const gatebossForceRef = useRef(false);
  // ?idolnow=1 診断(§6.28-20・バッチM64): ラン開始後に1回だけidolをforce-spawnしたかどうか。
  const idolForceRef = useRef(false);
  // ?bountynow=1 診断(§6.38 B1): ラン開始後に1回だけ賞金首をforce-spawnしたかどうか。
  const bountyForceRef = useRef(false);
  // research/GHOST_BOSS.md: ?phantomnow=1 / 「決闘」枠のforce-spawnを1回だけにするフラグ。
  const phantomForceRef = useRef(false);
  // 幻影のラン内状態(頭脳の持ち越し/休み/踏み込みの焼き付け)。同時1体なので単一refでよい。
  const phantomStateRef = useRef(createPhantomTickState());
  // §6.38 B2a: 賞金首のラン内状態(照準速度/懲罰タイマ/コンボ進行/取り巻き召喚済みか)。
  // idolStateRefと同じ流儀(idolTick.tsを手本・bountyTick.ts参照)。同時1体なので単一refでよい。
  const bountyStateRef = useRef(createBountyTickState());
  // §6.38 v2 F(B4): 賞金首の自然湧き回数+CD(gameTime基準)。他producer(nextArenaAtRef等)と同じく
  // ephemeralなタイマー状態なのでrefに置く(rotationだけがstoreフィールド=ラン間で意味を持たない)。
  const bountyNaturalRef = useRef({ count: 0 }); // v8.3: 固定スケジュール化でCD(nextEligibleAt)廃止
  // 警察署アリーナ(§6.24 M48)の再発動ガード(社長報告v0.25.2389)。発動でfalse、警察署から
  // POLICE_REARM_RADIUS(360)より離れたらtrueへ戻る。失敗(時間切れ)直後はプレイヤーが必ず
  // 発動半径(240)の内側に居るため、これが無いと即再発動+円内クランプで抜け出せなくなる。
  const policeArmedRef = useRef(true);
  // ミゲル専用「たまにゆっくり歩く」タイマー(社長指示・トールのthorNextSlowWalkAt/thorSlowWalkUntil相当)。
  // ミゲルは bossRef を使わない独立ブロックのため専用の小さな ref を持つ。
  const bossMakerReadyRef = useRef(false); // ボスメーカーの相手を1回だけ出す
  const idolStateRef = useRef(createIdolTickState()); // idol(stage-2隠しボス)のラン内状態(バッチ3でidolTick.tsへ抽出)
  const angelStateRef = useRef(createAngelBossState()); // 天使(ゲート2ボス)3体のラン内状態(M26 Step3でangelBossTick.tsへ抽出)
  // ゲート戦闘中フラグ(activeGateRef)のstore反映用・直前値(変化時だけsetして毎フレームchurnを避ける)。
  const gateActivePrevRef = useRef(false);
  // ゲート2未クリア(=深層演出ロック)のstore反映用・直前値(同上)。
  const deepLockedPrevRef = useRef(false);
  // M26-L(§6.3): 実機オートパイロット(?bot)の状態。BOT_PERSONA=null時は全て不使用。
  const botTickRef = useRef(0);                            // decideBotInput用のtick連番
  const botRusherRef = useRef(createRusherTrackState());   // rusherペルソナの詰まり検知状態
  // ★v0.25.3554: 詰まり脱出の外部状態(全ペルソナ共通)。ラン単位に1つ・毎tick同じ参照を渡す。
  const botStuckRef = useRef(createBotStuckState());
  const botCounterThreatRef = useRef(createCounterThreatState()); // M37(§6.14): 人間反応カウンターの検知状態
  const botWarpRef = useRef(createWarpTrackState());       // M49-3(§6.25): ワープ(瞬間移動)追従の前tick位置
  const botEngagementRef = useRef(createEngagementTrackState()); // M49(§6.25改訂): 行動階層①⇄②の直近実績
  const botRandRef = useRef(mulberry32(1));                // レベルアップ自動選択の決定的乱数(シード固定=再現性)
  const botPausedSinceRef = useRef(0);                     // isPaused継続の詰み検知(Date.now基準)
  const botReportedRef = useRef(false);                    // [BOT_REPORT]を出したか(1ラン1回)
  // juice(flashy unified boss death): 直近に鳴らした bossCorpse.diedAt(0=未鳴動)。store の
  // bossCorpse は getsDramaticDeath 対象(ネームド/裏ボス/giantbat/hunter)討伐で共通に立つので、
  // ここで変化を検出して 'boss-death' SFX を1回だけ鳴らす(gameStore は playSfx を持てないため)。
  const bossCorpseSfxRef = useRef(0);
  // サブクエスト達成SE用: 直近に鳴らした subquestClearSeq(store側の通し番号)。
  // ★v0.25.3649(成果物監査・致命1): 初期値は0ではなく**マウント時の現在値**。Gameは出撃ごとに
  // 再マウントされ ref が作り直される一方、subquestClearSeq は resetGame で意図的に維持されるため、
  // 0初期化だと「セッション中に1件でも達成済み」なら次の出撃の頭で seq(>0)!==ref(0) が成立して
  // event-clear が誤爆していた(boss-death型と違い「ラン開始時に必ず偽」になる条件が無い)。
  const subquestClearSfxRef = useRef(useGameStore.getState().subquestClearSeq);
  // 城ボスのアテンション遅延: 出現エフェクト(リング/グロウ/バースト)が消えてからカメラアテンションを出す
  // (出現直後だと演出で本体がぼやける・社長指示)。{at,x,y}=発火予定gameTime と注目座標。0=予約なし。
  const castleAttnRef = useRef<{ at: number; x: number; y: number }>({ at: 0, x: 0, y: 0 });
  // §6.38 v9(完全コピー原則): 賞金首も城ボスと同じ「出現エフェクトが消えてからカメラアテンション
  // +カットイン」の並びにする(castleAttnRefと同型。null=予約なし)。
  const bountyAttnRef = useRef<{ at: number; x: number; y: number; cutin: ReturnType<typeof bossCutinPayload> } | null>(null);
  // §6.36(監査指摘1): カットイン付きattentionの保留箱。素のattention(ハンター/救援/死神等)が
  // 生きている間にボスが出ると、first-winsで後着のカットインが丸ごと消える(=「毎回出す」違反+
  // 出現アテンション自体の退行)。attention生存中は発火せずここへ置き、空いた最初のフレームで撃つ。
  const pendingCutinAttnRef = useRef<{ x: number; y: number; cutin: NonNullable<ReturnType<typeof bossCutinPayload>> } | null>(null);
  // v0.25.3028: グレン連結パーツの前フレーム本数(減少検知でパーツ破壊爆発を出す)。count=null は第一形態(パーツ未表示)。
  const glenPartsPrevRef = useRef<{ id: string; count: number | null } | null>(null);
  // v0.25.3038: ヒットストップ中のエフェクト実時間tick用の前フレーム時刻(0=非停止中)。
  const hitstopFxLastRef = useRef(0);
  // the ONE ストーリーボス(M7/EX)の進行: 出現済みか / 終幕(勝利化)予定時刻(0=未予約)。
  const storyBossSpawnedRef = useRef(false);
  const storyBossWinAtRef = useRef(0);
  const glenRoarQueuedRef = useRef(false); // M7: 咆哮を会話キューへ積んだか
  const glenRoarShownRef = useRef(false);  // M7: 咆哮が実際に表示されたか(表示終了後の出現ゲート)
  // 洋館再訪: 開始時に洋館(保存槽)へ一度だけカメラアテンションを出したか。
  const revisitAttnShownRef = useRef(false);
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
  // このランでゲート1(未確認境界)を「通過」したか(社長決定v0.25.1669: 凶悪ハンター解放はラン内スコープ=次ランで復活)。
  // gate1DoneThisRunRef(再発火防止)とは別軸: ①今ランのゲート1クリア ②恒久クリア済みで境界を通り抜け、のどちらでも立つ。
  const gate1PassedThisRunRef = useRef(false);

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

  // v0.25.2370: ?komalog=1 のとき、コンソールから読める窓口(window.__KOMA_LOG__)を1回だけ生やす。
  // 既定(パラメータ無し)では exposeKomaLog が即returnするので通常プレイに影響しない。
  useEffect(() => { exposeKomaLog(); }, []);

  useEffect(() => {
    benchmarkModeRef.current = Boolean(options.benchmarkMode);
  }, [options.benchmarkMode]);

  // M26-L(§6.3): ラン終了レポート。botモード時のみ・1ラン1回だけ console + window.__BOT_REPORT__ へ出す
  // (Playwright等の外部回収用)。新規集計は持たず、storeに既にある値だけで構成する(仕様どおり)。
  const emitBotReport = useCallback((outcome: 'death' | 'clear' | 'return') => {
    if (!BOT_PERSONA || botReportedRef.current) return;
    botReportedRef.current = true;
    const s = useGameStore.getState();
    // M35(§6.12): goldはgoldBalance読み(リザルト画面が加算する前=常に0)を廃止し、リザルト画面と同じ
    // 計算式(calculateResultScore+ゴールドラッシュ倍率=GameOverScreenのgoldEarnedと同値)を終了時点で評価。
    const botTele = getBotTelemetry();
    // SKILL_BUILD_REDESIGN.md §15-1(B0発注文)の6+§11-1 A-7: ラン終了時点の最終スナップショットを
    // runTelemetryへ記録し、既存の__BOT_REPORT__へそのまま埋め込む(新規の窓口を増やさない)。
    recordRunFinal({
      outcome,
      playerLevel: s.player.level,
      maxAreaReached: s.gameStats.maxAreaReached,
      runTimeMs: Math.round(s.gameTime),
    });
    const report = {
      persona: BOT_PERSONA,
      outcome,
      survivedMs: Math.round(s.gameTime),
      deathCause: outcome === 'death' ? (s.lastDamageSource || null) : null,
      kills: s.gameStats.enemiesKilled,
      playerLevel: s.player.level,
      maxDepthPx: Math.round(s.gameStats.maxDepthDist),
      maxAreaReached: s.gameStats.maxAreaReached,
      // M35: 計測拡張(サブ発動/オーバークロック/スクラップ収支/被ダメ/ラン獲得ゴールド)。
      subUses: botTele.subUses,
      overclockProcs: botTele.overclockProcs,
      scrapEarned: Math.round(s.gameStats.strapsCollected),
      scrapSpent: Math.round(s.gameStats.strapsSpent),
      damageTaken: Math.round(s.gameStats.damageTaken),
      goldEarned: Math.round(
        // ★v0.25.2768: スコア倍率の廃止に伴い ghostSummonedThisRun の受け渡しも撤去
        // (元々 goldEarned には効いていなかった=引数を揃えるためだけに渡していた)。
        calculateResultScore(s.gameStats, outcome === 'clear', s.stageTheme === 'lab', s.player.growthScoreMult ?? 1, s.player.stageScoreMult ?? 1).goldEarned
        * skillGoldRushMult(s.player)
      ),
      // M46(§6.21): 与ダメ/即死/近接ペース計測(gun/melee/otherチャネル・total=出力時に合算)。
      damageDealt: {
        gun: Math.round(botTele.damageDealt.gun),
        melee: Math.round(botTele.damageDealt.melee),
        other: Math.round(botTele.damageDealt.other),
        total: Math.round(botTele.damageDealt.gun + botTele.damageDealt.melee + botTele.damageDealt.other),
      },
      finisherKills: botTele.finisherKills,
      meleeSwings: botTele.meleeSwings,
      meleeHits: botTele.meleeHits,
      // PACING_PUZZLE.md §7-11c(4): クリ計測口(開発用。RNGクリ/確定クリ/総ヒット数を対ボス・対雑魚
      // 内訳付きで出す。挙動は一切変えない=数えるだけ)。elapsedSecはクリ/秒の算出用。
      critStats: { ...botTele.critStats, elapsedSec: Math.round(s.gameTime / 1000) },
      // SKILL_BUILD_REDESIGN.md §15-1(B0発注文): B0計測器の10出力(§12-2#6+§13-4)を丸ごと同梱。
      runTelemetry: getRunTelemetrySnapshot(),
    };
    console.log('[BOT_REPORT]', JSON.stringify(report));
    (window as unknown as Record<string, unknown>).__BOT_REPORT__ = report;
  }, []);

  const triggerPlayerDeath = useCallback((x: number, y: number) => {
    if (gameOverTriggeredRef.current) return;
    gameOverTriggeredRef.current = true;
    emitBotReport('death'); // M26-L: botモードなら死因つきレポートを先に確定(以降の後始末と独立)
    logKomaSummary();       // v0.25.2370: ?komalog=1 の時だけ、ランク較正用の要約をコンソールへ1回出す
    // PACING_PUZZLE.md §5.17 M14: 死亡確定時に最終同期(1秒間隔の間引きだと直近の数百msが漏れるため)。
    if (WALL_ENABLED) syncWallDepth(runDeepestDistRef.current);
    // §5.21 M20追補(v0.25.1534): 死亡は「記録」のみコミット(踏破フラグはコミットしない)。
    if (WALL_ENABLED) commitRunEndProgress('death');
    // ランク持ち越しは廃止(PACING_PUZZLE.md §7-11c(2))。旧: 死亡時に最終ランク-1を保存していた。
    setHurricaneRumble(false); // 死亡で鳴動を止める(ループが回り続けても残響しない)
    setHeartbeatLoop(false); // 心音ループも死亡で止める
    setPeakLayer(false); // PEAK重ねSEも死亡で止める
    playSfx('player-damage');
    spawnFlash('rgba(127, 29, 29, 0.48)', 520);
    spawnRing(x, y, 8, 118, 'rgba(220,38,38,0.9)', 7, 620);
    spawnRing(x, y, 24, 168, 'rgba(127,29,29,0.66)', 4, 760);
    useGameStore.getState().spawnGlow(x, y, GLOW_R_L, 'rgba(220,38,38,', PLAYER_DEATH_SLOW_MS);
    // v0.25.2586(社長指示「守護霊死んだときもカメラズーム スローしてほしい これプレイヤーも」):
    // 死亡スローは従来からあったが**寄りズームが無かった**ので追加。守護霊の死(gameStore.damageSummon)と
    // 同じ定数・同じ長さ=どちらの死も同じ絵になる。holdを付けてスローと同じhold-then-rampで戻る。
    // v0.25.2587: 尺を延長(DEATH_ZOOM_MS=1700/hold=1150)し、立ち絵の保持・リザルト遷移もそれに揃えた。
    useGameStore.getState().triggerZoom(DEATH_ZOOM_MAG, DEATH_ZOOM_MS, DEATH_ZOOM_HOLD_MS, x, y);
    useGameStore.getState().triggerTimeSlow(DEATH_SLOW_SCALE, PLAYER_DEATH_SLOW_MS, DEATH_ZOOM_HOLD_MS);
    spawnBurst(x, y, '#ef4444', 36);
    spawnBurst(x, y, '#7f1d1d', 22);
    // 死亡演出(寄り+スロー+血)を見せ切ってからゲームオーバー画面へ(v0.25.2587: 1100→PLAYER_DEATH_TO_RESULT_MS)。
    window.setTimeout(onGameOver, PLAYER_DEATH_TO_RESULT_MS);
  }, [onGameOver, spawnBurst, spawnFlash, spawnRing, emitBotReport]);

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
      // §6.10 M33②: skillOutgoingDamageMult(バーサーカー等)を四神の全技(この合流点)に乗算(四捨五入)。
      const outDamage = Math.max(1, Math.round(damage * skillOutgoingDamageMult(st.player)));
      const dmg = allowExecute && stunned && !boss ? Math.max(outDamage, e.health) : outDamage;
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
        if (e.type === 'reaper' && !e.reaperChaser) continue;
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
        // §6.10 M33④: エクスプローダーを朱雀爆発(半径+ダメージ)にも適用(ダメージ側は下のshijinHitEnemy呼び出しで乗算)。
        const szExMult = skillExplosionMult(useGameStore.getState().player);
        const blastR = GRENADE_BLAST_RADIUS * szExMult;
        const fxMs = GRENADE_LAUNCHER_EXPLOSION_EFFECT_MS;
        const targets = useGameStore.getState().enemies
          .filter(e => e.type !== 'reaper' || e.reaperChaser)
          .map(e => ({ e, d: Math.hypot(e.x + e.width / 2 - x, e.y + e.height / 2 - y) }))
          .sort((a, b) => a.d - b.d).slice(0, SUZAKU_MAX_TARGETS).map(h => h.e);
        spawnFlash('rgba(248,113,113,0.16)', 150);
        for (const t of targets) {
          const bx = t.x + t.width / 2;
          const by = t.y + t.height / 2;
          spawnRing(bx, by, 10, blastR, 'rgba(248,113,113,0.85)', 5, fxMs);
          spawnBurst(bx, by, '#f87171', 20);
          spawnBurst(bx, by, '#7f1d1d', 8);
          useGameStore.getState().spawnGlow(bx, by, GLOW_R_S, 'rgba(248,113,113,', fxMs);
          useGameStore.getState().spawnExplosionFx(bx, by, blastR); // v0.25.3283: 爆発flipbook(全爆発共通)
          for (const e of useGameStore.getState().enemies) {
            if (e.type === 'reaper' && !e.reaperChaser) continue;
            const dist = Math.hypot(e.x + e.width / 2 - bx, e.y + e.height / 2 - by);
            if (dist > blastR) continue;
            const falloff = 1 - dist / blastR;
            shijinHitEnemy(e.id, Math.max(1, Math.round(SUZAKU_BLAST_DAMAGE * szExMult * (0.55 + falloff * 0.45))), true);
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
      const b = st.gameBounds;
      const m = SHIJIN_FINISH_SCREEN_MARGIN;
      // 監査v0.25.3008: カメラ矩形→プレイヤー中心の同寸矩形へ。ズーム連動カメラ下げ(v2994〜)で
      // カメラが北を向くと、プレイヤーの足元〜南側の敵がフィニッシュ対象から漏れていた。
      const fpx = st.player.x + st.player.width / 2, fpy = st.player.y + st.player.height / 2;
      const onScreen = st.enemies.filter(e => {
        const ex = e.x + e.width / 2;
        const ey = e.y + e.height / 2;
        return Math.abs(ex - fpx) <= b.width / 2 + m && Math.abs(ey - fpy) <= b.height / 2 + m;
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
          if (e.type === 'reaper' && !e.reaperChaser) continue;
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
        // ジャスト吸着: 実行はdrainのatMsゲートで拍まで待たされているが、SEはさらにWebAudioの
        // 時刻指定でその拍へ正確に予約する(フレーム粒度の遅れも消してメトロノームと重ねる)。
        if (BEAT_ENABLED) scheduleDanceJustKick(pa.atMs ?? Date.now());
        else playSfx('dance-kick'); // ?beat=0(従来経路)は即時のまま
      } else if (pa.kind === 'flick') {
        // バッシュ(フリック): カウンター窓を開き、近接フィニッシュ可(execute=true)、
        // ノックバックは上限6(=距離2倍)で強く弾く。
        useGameStore.getState().openCounterWindow();
        const v = ARROW_VEC[pa.arrow];
        rhythmLineAttack(pcx, pcy, v.x, v.y, RHYTHM_FLICK_RANGE, RHYTHM_FLICK_HALF_W, RHYTHM_FLICK_DAMAGE, RHYTHM_FLICK_KNOCKBACK_MULT, true, RHYTHM_FLICK_KNOCKBACK_MAX);
        useGameStore.getState().spawnSlash(pcx + v.x * RHYTHM_FLICK_RANGE * 0.6, pcy + v.y * RHYTHM_FLICK_RANGE * 0.6, 'rgba(186,230,253,0.9)');
        // フリックの斬撃音(katana-dash)は無し。拍踏みのキックドラムのみ鳴らす(B方式はピッチ上げで差別化)。
        // ジャスト吸着: タップと同じくその拍の時刻へ予約(遅れた入力はクランプで即時)。
        if (BEAT_ENABLED) scheduleDanceJustKick(pa.atMs ?? Date.now());
        else playSfx('dance-kick');
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

      // ボス死亡attentionはこの直後から早期returnするため、崩壊SEの立ち上がりだけは停止判定より前で拾う。
      // 通常時は下のcorpse管理ブロックと同じrefで重複を防ぐ。
      {
        const corpse = useGameStore.getState().bossCorpse;
        if (corpse && corpse.diedAt !== bossCorpseSfxRef.current) {
          bossCorpseSfxRef.current = corpse.diedAt;
          playSfx('boss-death');
        }
      }

      // サブクエスト達成の告知SE(v0.25.3663: 社長提供の専用ジングル。旧: 'event-clear'の流用)。
      // gameStore は playSfx を import できないので、達成の通し番号の変化をここで拾って1回鳴らす
      // (boss-death と同じ型)。ゴールド付与とポップは store 側で済んでいる。
      {
        const seq = useGameStore.getState().subquestClearSeq;
        if (seq !== subquestClearSfxRef.current) {
          subquestClearSfxRef.current = seq;
          if (seq > 0) playSfx('subquest-clear');
        }
      }

      // --- アテンション・シネマティック(レスキュー/ジャイアント出現) ---
      // 現地へ高速パン→2-3秒ホールド→高速で戻る。その間は hitstop でシム/アニメ停止(時間停止)。
      // ここ(hitstop早期returnの前)でカメラだけ毎フレーム動かす。終了で解除し通常進行へ。
      {
        // §6.36(監査指摘1): 保留中のカットイン付きattentionを、attentionが空いた最初のフレームで撃つ。
        if (pendingCutinAttnRef.current && !useGameStore.getState().attention) {
          const p = pendingCutinAttnRef.current;
          pendingCutinAttnRef.current = null;
          useGameStore.getState().triggerAttention(p.x, p.y, p.cutin);
        }
        const att = useGameStore.getState().attention;
        // v0.25.2953(社長指示「ボスモードもボス消えるまでは終わらないで」): 練習ランの勝利は
        // **死亡アテンション(ストップ+崩壊)を見せ終えてから**確定する。attention が無い場合でも
        // 最低1.2秒は崩壊の絵を見せる(打刻は撃破の瞬間=gameStoreのdamage経路)。
        {
          const pw = useGameStore.getState().practiceWinPendingSince;
          // v0.25.2955: 崩壊(bossCorpse)が消えるまで待つ=「ボス消えるまでは終わらない」を崩壊延長後も維持。
          if (pw !== null && !att && !useGameStore.getState().bossCorpse
            && nowMs >= pw + 1200 && !useGameStore.getState().gameWon) {
            useGameStore.setState({ gameWon: true, practiceWinPendingSince: null });
          }
        }
        if (att) {
          const el = nowMs - att.startReal;
          // §6.36(v0.25.2958・社長指示で復帰): cutin付きattentionは hold と out の間に cutinMs
          // (カメラは注目点に静止のまま)を挟む。素のattention(cutinMs=0)は式が従来と完全一致。
          const cutinMs = att.cutinMs ?? 0;
          const attHoldMs = att.holdMs ?? ATTENTION_HOLD_MS; // cutin付きは半分(v0.25.2999・社長指示)
          if (el >= ATTENTION_IN_MS + attHoldMs + ATTENTION_OUT_MS + cutinMs) {
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
            } else if (el < ATTENTION_IN_MS + attHoldMs + cutinMs) {
              cx = focusX; cy = focusY;
            } else {
              const t = smooth((el - ATTENTION_IN_MS - attHoldMs - cutinMs) / ATTENTION_OUT_MS);
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
        // v0.25.3038(社長指示「消えていく時のエフェクトが止まったまま。光系のエフェクトは止めないで」):
        // 時間停止(討伐シネマ/アテンション/カウンター)中も視覚エフェクト(リング/グロー/フラッシュ/
        // 粒子)だけは実時間で進める=描画専用のstate(effects)のみ更新・シミュレーションは凍結のまま。
        const lastFx = hitstopFxLastRef.current || nowMs;
        hitstopFxLastRef.current = nowMs;
        updateEffects(Math.max(0, Math.min(0.05, (nowMs - lastFx) / 1000)));
        frameRef.current = requestAnimationFrame(gameLoop);
        return;
      }
      hitstopFxLastRef.current = 0;

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

      // ステージ2(屋外ラボ廊下)BGMクロスフェード(社長指示): ゴール資料と反対方面(=idolの居る方向)へ
      // 進むほど、中盤くらいに差し掛かったら通常BGMからオープニングの廊下BGMへ距離に比例して切り替わる。
      // 混ぜ具合はlabRadioMixT(純関数・src/world/labRadioMix.ts)。idolの座標はresetGameが1度だけ書いた
      // labRadioX(idolの敵オブジェクトは倒されると消えるため参照不可)。ステージ2以外では1度だけ0を渡して
      // 止める(毎フレーム0を呼び続けない=labRadioActiveRefで遷移だけ検出)。
      {
        const gs = useGameStore.getState();
        if (gs.stageTheme === 'lab' && !gs.indoorMode) {
          const t = labRadioMixT(gs.labRadioX, gs.player.x + gs.player.width / 2);
          setCorridorRadioMix(t);
          labRadioActiveRef.current = true;
        } else if (labRadioActiveRef.current) {
          setCorridorRadioMix(0);
          labRadioActiveRef.current = false;
        }
      }

      // Update FPS counter
      fpsCounterRef.current.frames++;
      if (timestamp - fpsCounterRef.current.lastCheck >= 1000) {
        setFps(fpsCounterRef.current.frames);
        fpsCounterRef.current.frames = 0;
        fpsCounterRef.current.lastCheck = timestamp;
      }
      
      // M26-L(§6.3): 実機オートパイロットのポーズ系処理。isPausedスキップより前に置く=UIで永久停止しない。
      // BOT_PERSONA=null(通常プレイ)ではこのブロックは丸ごと素通り(挙動不変)。
      if (BOT_PERSONA) {
        const bs = useGameStore.getState();
        // 武器商人ショップの自動購買→クローズ(依頼#3実測バグ・v0.25.1732の「開いたら閉じる」保険に、
        // SKILL_BUILD_REDESIGN.md §13-2(B0発注文)+設計チャットの追補+§18-1の7(B2)で「購買→閉じる」を
        // 追加)。決定的な純関数(botShopPolicy.ts)に判定を委ね、購入は正規の
        // buyShopItem()/buyEquipmentFromShop() 経由(telemetryは各アクション側で記録=二重記録しない)。
        // ②(装備区画)は1回の来訪で複数個買えるためcloseが返るまでループ(guardは安全上限)。
        // open→close自体は従来どおり同フレームで完結する(reopen遅延1.5s付きのcloseShop()は不変)。
        if (bs.showShopMenu) {
          for (let guard = 0; guard < 8; guard++) {
            const s = useGameStore.getState();
            const shopAction = decideBotShopPurchase({
              playerHealth: s.player.health, playerMaxHealth: s.player.maxHealth,
              straps: s.player.straps, medkitCost: SHOP_MEDKIT_COST,
              equipment: s.player.equipment, equipShopCostByTier: EQUIP_SHOP_COST_BY_TIER,
            });
            if (shopAction.kind === 'buy-medkit') { s.buyShopItem('medkit'); continue; }
            if (shopAction.kind === 'buy-equip') { s.buyEquipmentFromShop(shopAction.slot, shopAction.defId); continue; }
            break;
          }
          bs.closeShop();
        }
        // レベルアップの自動選択(ポリシーはヘッドレスStep1と共用の純関数・決定的乱数)。
        if (bs.showUpgradeMenu && bs.upgradeOptions.length > 0) {
          // M49-4(§6.25): 段階(skilled/master)は一様ランダムでなく greedy ポリシーで選ぶ
          // (novice/casualはupgradePolicy='random'=pickUpgradeと完全に同一結果=挙動不変)。
          bs.selectUpgrade(pickUpgradeByPolicy(
            bs.upgradeOptions, botRandRef.current, botSkillProfile(BOT_SKILL).upgradePolicy, bs.player, bs.runBuild.length));
        }
        // 終了レポート: 勝利/帰還(死亡は triggerPlayerDeath 側で発火)。
        if (bs.gameWon) { emitBotReport('clear'); logKomaSummary(); }
        else if (bs.gameReturned) emitBotReport('return');
        // 詰み検知の保険: isPaused が60秒続いたら警告して強制解除(ショップ等の想定外UI)。
        if (bs.isPaused) {
          if (botPausedSinceRef.current === 0) botPausedSinceRef.current = Date.now();
          else if (Date.now() - botPausedSinceRef.current > 60000) {
            console.warn('[BOT] paused >60s — force-closing menus');
            useGameStore.setState({ showShopMenu: false, showEventQuestMenu: false, showUpgradeMenu: false, isPaused: false });
            botPausedSinceRef.current = 0;
          }
        } else {
          botPausedSinceRef.current = 0;
        }
      }
      // v0.25.2481: ?autotut=1 の自動選択(BOT_PERSONA無しのテストラン用。BOT有りは上のブロックが
      // 同じ処理をするので二重に走らせない)。isPausedスキップより前=選択画面で永久停止しない。
      // ポリシーは greedy 固定(テストランのビルドが崩壊しないよう装備Tier優先で選ぶ)。
      if (AUTOTUT && !BOT_PERSONA) {
        const bs = useGameStore.getState();
        if (bs.showUpgradeMenu && bs.upgradeOptions.length > 0) {
          bs.selectUpgrade(pickUpgradeByPolicy(
            bs.upgradeOptions, botRandRef.current, 'greedy', bs.player, bs.runBuild.length));
        }
      }
      // Skip updates if game is paused. Read fresh from the store (not the
      // captured closure) so a level-up / pause takes effect immediately even
      // before React re-runs this effect with the new value.
      // 出撃ローディング中(rendererReady前)はシミュレーションも止める(v0.25.2122・社長報告
      // 「ローディング中に裏で敵が湧いて攻撃してる」)。rendererReadyはPixiStage側のフェイルセーフで
      // 必ず立つ=永久停止はない。canvasレンダラ(rendererReadyを使わない)は対象外。
      if (!useGameStore.getState().isPaused && !useGameStore.getState().backgrounded
          && (!isPixiRenderer() || useGameStore.getState().rendererReady)) {
        const loopState = useGameStore.getState();
        const {
          gameTime,
          player,
          enemies,
          pickups,
          inputState: touchInputState,
          swipeDirection,
          gameBounds,
        } = loopState;
        // M26-L(§6.3): botモードはヘッドレスボットの判断(decideBotInput)で入力をローカル差し替え
        // (storeへは書かない=タッチUI非干渉)。以降このtick内の inputState 参照は全てボット入力になる。
        // v0.25.2339/2340: 目的(ゴール)のプランは入力合成より先に立てる(囲い中は退避を止めるため)。
        // v0.25.3508: `kind==='none'` でも planObjective を通す。「デンジャーへ行くなら拠点を取る」
        // の関門(dangerBaseGatePlan)は目的の種類に関係なく効かせる必要があるため(社長指示)。
        // none の時に返るのは関門プランか NO_PLAN のどちらかで、それ以外の指示は出ない=従来どおり。
        // ★v0.25.3619: ガントレット中は枠のボスを狩る(practiceBossTypeが現在の枠の型)。
        const gauntletHuntType = GAUNTLET_BOT_HUNT ? practiceBossType() : null;
        const effectiveBotGoal: BotObjective = gauntletHuntType
          ? { kind: 'hunt', enemyType: gauntletHuntType }
          : BOT_GOAL;
        const botGoalPlan = BOT_PERSONA
          ? planObjective(effectiveBotGoal, {
              px: player.x + player.width / 2, py: player.y + player.height / 2,
              level: player.level, enemies, pickups,
              returnCircle: loopState.returnCircle
                ? { x: loopState.returnCircle.x, y: loopState.returnCircle.y, radius: loopState.returnCircle.radius }
                : null,
              castleEvent: loopState.castleEvent ?? null,
              finaleDefeated: loopState.finaleDefeated,
              hiddenBoss: loopState.hiddenBoss,
              hiddenBossLair: bossLairPos(loopState.hiddenBoss),
              hiddenBossDefeated: loopState.hiddenBossDefeated,
              baseSites: loopState.baseSites,
              enemiesKilled: loopState.gameStats.enemiesKilled,
              gameWon: loopState.gameWon,
              activeEvent: loopState.activeEvent
                ? { kind: loopState.activeEvent.kind, x: loopState.activeEvent.x, y: loopState.activeEvent.y, radius: loopState.activeEvent.radius }
                : null,
              // v0.25.3052 campaign: 寄り道POIと制圧サークル半径(campaign 以外の目的は読まない)。
              pois: botObjectivePois(loopState),
              scrap: player.straps,
              baseCaptureRadius: BASE_CAPTURE_RADIUS,
              escorts: loopState.escorts, // ★拠点を制圧するのは escort(付き添わないと前進しない)
            })
          : null;
        const botGunForRange = BOT_PERSONA ? getActiveGun(player) : undefined;
        const botDecision = BOT_PERSONA
          ? decideBotInput(BOT_PERSONA, player, enemies, gameTime, botTickRef.current++, 0,
              BOT_PERSONA === 'rusher' ? botRusherRef.current : undefined,
              botGunForRange && botGunForRange.category !== 'phill'
                ? RANGE_BY_CATEGORY[botGunForRange.category as keyof typeof RANGE_BY_CATEGORY]
                : undefined,
              undefined, BOT_SKILL, botGoalPlan?.pressAttack)
          : null;
        // M34(§6.11): 緑卵(地雷)を避ける/叩く(ボット入力のみの後段補正。?bot無しの通常プレイは不変)。
        // M38(§6.15): その手前に松明フォレージ(手空きのみ発火・拾い歩きの直後に合成・松明を割って
        // スクラップ供給を作る)を挟む。松明への進路上の緑卵は後段のadjustBotForMinesの回避/叩きが効く。
        const botMineAdj = botDecision
          ? (() => {
              // M39(§6.16): 商人ゾーンに用は作らない=拾い/松明の対象からゾーン内の物を除外し、
              // 移動もゾーンを避ける(ショップ誤オープン=依頼#3の商人停止の再発防止)。
              const bm = loopState.weaponMerchant;
              const outsideMerchantZone = (x: number, y: number): boolean =>
                Math.hypot(x - bm.x, y - bm.y) > MERCHANT_AVOID_RADIUS;
              const botMoveAfterPickup = pickupSeekInput(BOT_PERSONA as BotPersona, botDecision.input,
                player.x + player.width / 2, player.y + player.height / 2,
                pickups.filter(p => outsideMerchantZone(p.x + 8, p.y + 8)));
              const botTorchForage = torchForageInput(BOT_PERSONA as BotPersona, botMoveAfterPickup,
                player.x + player.width / 2, player.y + player.height / 2,
                loopState.breakableProps.filter(p => p.type === 'torch' && outsideMerchantZone(p.footX, p.footY)));
              const botAvoided = avoidMerchantZone(BOT_PERSONA as BotPersona, botTorchForage.input,
                player.x + player.width / 2, player.y + player.height / 2, bm);
              return adjustBotForMines(
                botAvoided,
                botDecision.wantsMelee || botTorchForage.wantsMelee,
                player.x + player.width / 2, player.y + player.height / 2,
                loopState.breakableProps.filter(p => p.type === 'mine'));
            })()
          : null;
        // M37(§6.14): 人間反応のカウンター(ジャンプ/突進/敵弾を反応遅延+試行確率でカウンター)。
        // 移動入力は変えない=既存のwantsMelee判断(mine叩き込み)とOR合成するだけ。?bot無しの
        // 通常プレイはBOT_PERSONA=nullなのでこのブロックごと素通り(挙動不変・負荷0)。
        // ★v0.25.3621(社長報告「この回も一度もカウンター出してない」の真因=時計の混在):
        // counterCooldownEnd は Date.now(エポックms)基準だが、ここは gameTime(ラン開始からのms)と
        // 比較させていた。**最初の一振りで counterCooldownEnd≈1.7e12 になった瞬間から
        // 「gameTime < CD」が永久に真**=以後カウンターが一生出ない(実機・ヘッドレス共通)。
        // 残りCDを実時計で取り、gameTimeの時計へ写して渡す(CD無しなら過去=素通り)。
        const botCounterCdOnGameClock = player.counterCooldownEnd - Date.now() + gameTime;
        const botWantsCounterReaction = botDecision
          ? decideCounterReaction(
              BOT_PERSONA as BotPersona, botCounterThreatRef.current,
              player.x + player.width / 2, player.y + player.height / 2,
              enemies, loopState.projectiles, gameTime, botCounterCdOnGameClock,
              Math.random, BOT_SKILL)
          : false;
        // M49-3(§6.25): ワープ(瞬間移動)追従。反応遅延はprofile.reactionMs(warpReact=falseの段=
        // novice/casualは検知のみで反応は常にnull=完全なno-op)。通常回避より優先(離れるのが最優先)。
        const botWarpVec = botMineAdj
          ? warpDodge(botSkillProfile(BOT_SKILL), botWarpRef.current, gameTime,
              player.x + player.width / 2, player.y + player.height / 2, enemies)
          : null;
        // v0.25.2338: 回避(避けられる攻撃は避ける)。移動系の合成の**最後**に置く=生存が最優先。
        // casual以下は dodgeVector が常に null を返すので、従来ランでは完全な no-op。
        // M49-1(§6.25): 接触脅威の判定に player.maxHealth を渡す(既定0=接触脅威は無視=不変)。
        const botDodge = botMineAdj
          ? dodgeVector(botSkillProfile(BOT_SKILL),
              player.x + player.width / 2, player.y + player.height / 2,
              enemies, loopState.projectiles, player.maxHealth)
          : null;
        // §6.25改訂 dodgeVsAttack: 回避と攻撃(近接/カウンター)が同tickで競合した時の優先度。
        // dodge==='none'のnovice/casualは常にfalse=既存の攻撃判断を一切変えない(no-op)。
        const botAttackSuppressedByDodge = dodgeOverridesAttack(botSkillProfile(BOT_SKILL), !!botDodge, Math.random);
        // M49(§6.25改訂): 行動階層①交戦⇄②前進。直近60秒の撃破/被弾のヒステリシスで切り替える
        // (BOT_GOAL='none'=目的なしの通常プレイ/デバッグボットでは botGoalPlan が無いため完全な
        // no-op)。ゲート/囲いイベント中(activeEvent)は②の一部として常に前進を許す(迂回しない)。
        const botEngagementPhase = botGoalPlan
          ? tickEngagementPhase(botEngagementRef.current, gameTime, player.level,
              loopState.gameStats.enemiesKilled, player.health)
          : 'engage';
        // ★v0.25.3625: ガントレット中は交戦⇄前進のヒステリシスを外し常に前進可(枠ボスへ必ず歩く)。
        const botAllowAdvance = !!loopState.activeEvent || botEngagementPhase === 'advance' || GAUNTLET_BOT_HUNT;
        // v0.25.2339: 目的(ゴール)への移動。優先順位は ワープ回避 > 通常回避 > 目的地 > 従来の合成入力。
        // BOT_GOAL='none'(既定)では planObjective が目的地を返さないので完全な no-op。
        // ③オプション: ②前進中(ゲート/囲い以外)に限り、経路上の至近ピックアップへだけ寄り道する
        // (独立した目的地にはしない=①②の従属物のまま)。
        const botObjSteer = (botMineAdj && botGoalPlan && botGoalPlan.travel && botAllowAdvance)
          ? ((!loopState.activeEvent
                ? advanceOptionDetour(player.x + player.width / 2, player.y + player.height / 2, pickups)
                : null)
              ?? steerTo(player.x + player.width / 2, player.y + player.height / 2, botGoalPlan.destination))
          : null;
        // v0.25.3052 campaign: 目的が「留まれ」と言っている間は移動入力を0にする。
        // 拠点(10秒)/POI(3秒)の滞在は「サークル内に居続ける」ことが条件だが、steerTo は到着圏内で
        // null を返し通常の徘徊入力へ落ちるため、これが無いと滞在が永久に貯まらない(依頼#6で実測)。
        // **回避より下**に置く=生存を犠牲にしてまで留まらない。hold 未指定の目的では完全な no-op。
        // v0.25.3064(社長承認): **目的地ステアにも地雷回避を掛ける**。
        // 旧構成では adjustBotForMines が最下段の「従来の合成入力」にしか掛かっておらず、
        // 目的地ステアが出ている間は一度も評価されなかった。地雷は80px以内で起爆準備→1.5秒後に
        // 半径80pxで爆発する(world/mines.ts)ので、**止まらず抜ければ当たらない**が、ボットは戦闘と
        // 回避で減速・停止する(実測 0〜87px/s。53px/s未満だと抜けきれない)ため踏み抜いていた。
        // 速度を上げるのではなく**そもそも起爆させない**方が確実なので、避け/叩きをここでも通す。
        const botObjSteerAdj = (botObjSteer && botMineAdj)
          ? adjustBotForMines(
              dodgeToInput(botObjSteer, 0.3), false,
              player.x + player.width / 2, player.y + player.height / 2,
              loopState.breakableProps.filter(p => p.type === 'mine'))
          : null;
        const inputStateRaw = botWarpVec ? dodgeToInput(botWarpVec)
          : botDodge ? dodgeToInput(botDodge)
          : (botGoalPlan && botGoalPlan.hold) ? HOLD_INPUT
          : botObjSteerAdj ? botObjSteerAdj.input
          : botObjSteer ? dodgeToInput(botObjSteer, 0.3)
          : (botMineAdj ? botMineAdj.input : touchInputState);
        // ★v0.25.3554(社長報告「木にひっかかるとずっと引っかかってる」): 詰まり脱出は**最終入力**へ
        // 掛ける。こうすると回避・目的地ステア・地雷回避のどの枝から来た入力でも等しく効く。
        // ボット無効時(BOT_PERSONA===null)は素通し=通常プレイは1バイトも変えない。
        // ★v0.25.3557: 分離ステア(近距離の敵全員から弱い反発)→詰まり脱出、の順で最終入力を調整。
        // 分離は方向の質、脱出は「動けているか」の保険なので、脱出を最後に置く。
        const inputState = BOT_PERSONA === null ? inputStateRaw
          : escapeIfStuck(
              separationAdjust(botSkillProfile(BOT_SKILL), inputStateRaw,
                player.x + player.width / 2, player.y + player.height / 2, enemies),
              botStuckRef.current,
              player.x + player.width / 2, player.y + player.height / 2);
        const danceTest = loopState.danceTestMode; // 仮: 練習モードは敵を一切スポーンしない
        const indoor = loopState.indoorMode;       // 屋内ステージ: 自動湧き/wave/城/死神を止め、固定敵のみ
        const labTheme = loopState.stageTheme === 'lab'; // 研究所スキン: 湧く敵をラボ用ゾンビのみにする
        // the ONE(統合正本M7/EX): ストーリーボス専用ラン=通常湧き/城ボス/ハンター/ゲート/紅き夜/死神/
        // 演出波を全停止(下の各ゲートに配線)し、専用コントローラ(会話→ボス→終幕→勝利)だけ動かす。
        const storyBoss = loopState.storyBossMode;
        // 洋館［SUB］再訪: 通常ステージと同様に敵が湧く(統合正本9.3)が、城ボス(M6ストーリーボス)だけは
        // 出さない(洋館=保存槽の目的地。ボス再戦は正史に無い)。
        const revisitRun = loopState.revisitMode;
        // ステージ4(雪原)/ステージ5(戦場): 新型 lich を湧きプールに含める(社長裁定2026-07-17:
        // ステージ5の10体目=フード亡霊をlich扱いで出す)。変数名は歴史的経緯(元は雪原限定)。
        const snowTheme = loopState.farBackdrop === 'snow' || loopState.farBackdrop === 'stage5';
        // チュートリアル: 敵の自動湧きを全停止(社長指示v0.25.1814「自動で敵沸かないようにして。
        // イベントでしか沸かせない予定」)。ストーリーボス専用ラン(storyBoss)と同じ止め方で、
        // 通常湧き/コマ盤面/囲い・関所発火/城ボス/ハンター/叫喚型/死神/紅き夜を全て止める。
        // (farBackdrop==='tutorial' をrun識別に使うのは setTreesDisabled と同じ既存慣例。)
        const tutorialStage = loopState.farBackdrop === 'tutorial';
        // 洋館(ステージ6)の走り込み入場中は敵を一切湧かせない(社長裁定v0.25.2789・案A)。
        // 走り込み中は isInputLocked(corridorRunInActive) で操作を奪っている一方、
        // isGameTimeStopped() には入らない=シミュレーションは走り続ける。さらに通路は
        // setCorridorSpawn(=敵が上から湧く)なので、上へ自動で走るプレイヤーが湧いた敵に
        // **避けられないまま**突っ込む。ヘリ入場のステージは introUntil で時間ごと止まるため
        // 起きない、この入場方式だけの穴(v0.25.2789)。
        // (変数名: 走り込みの解除は下の movePlayer 側=同フレームのもっと後ろで起きるため、
        //  湧きゲートはフレーム頭のスナップショットを見る。別名にして取り違えを防ぐ。)
        const runningIn = loopState.corridorRunInActive;
        // 以降の湧きゲートは NOSPAWN ではなく noSpawn を見る(?nospawn=1 と同じ止め方に相乗り)。
        // 練習ラン(ボスラッシュ)も湧きを全部止める=狙った1体だけ(社長「ラッシュは1体」)。
        const noSpawn = NOSPAWN || runningIn || isPracticeRun();

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
          thorOrbitDist: HB_TH.orbit.distPx,
          thorCounterLeapMs: HB_TH.counterLeapMs,
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
          // 会話があるミッションのみ(フリーミッション等=空なら会話自体発生しない)。
          // 時間停止VNボックス廃止(社長指示v0.25.1876「時間止める会話は全部排除・通常会話に統一」)。
          // 導入会話もチュートリアルと同方式で、通常会話(左上の通信=NpcDialogue・非停止)のキューへ直接積む。
          if (!introStateNow.introDialogueShown && rawIntroT >= INTRO_DIALOGUE_TRIGGER_T && introStateNow.introDialogueLines.length > 0) {
            useGameStore.setState(s2 => ({
              introDialogueShown: true, // 再積み防止
              npcDialogueQueue: [
                ...s2.npcDialogueQueue,
                ...s2.introDialogueLines
                  .filter(l => l.speaker && !l.speaker.startsWith('__'))
                  .map(l => ({ name: l.speaker as string, text: l.text })),
              ],
            }));
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

        // (時間停止VNボックス廃止・社長指示v0.25.1876: 会話は全て通常会話=非停止に統一したため、
        //  ここで sim を止めていた introDialogueActive の分岐は撤去。撤退セリフ等も通常会話キューへ。)

        // Update game time. realGameTime はポーズ中は止まるが slow-mo(timeScale)の影響を
        // 受けない「実効」時計(baseDeltaTime で進める)。スラッシャー追撃リングを slow-mo 中でも
        // 通常速度で刻むため(社長承認のA案)。
        const newGameTime = gameTime + deltaTime * 1000;
        const newRealGameTime = loopState.realGameTime + baseDeltaTime * 1000;
        setGameTime(newGameTime, newRealGameTime);
        useGameStore.getState().updateNpcDialogue(newGameTime); // NPCセリフの表示進行(時間停止なし)
        useGameStore.getState().updateMerchantDwell(deltaTime * 1000); // 商人サークル3秒滞在→話しかけ(社長指示v0.25.1842)
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
          redNightFireAtRef.current = RED_NIGHT_FIRE_AT_MS; // 新ランでも7:00固定(v0.25.3317)
          rescueFiredRef.current = false; // 救助イベントの「1出撃1回」フラグも新ランで戻す
          tutorialConvoQueuedRef.current = false; // チュートリアルM0序盤会話も新ランで再有効化
          runStageIdRef.current = null;          // ステージidのキャッシュも新ランで読み直す(§6.24-UX)
          m0BeatsFiredRef.current = new Set(); // M0の教習ビートも新ランで最初から(毎出撃で出す=社長指示v0.25.2266)
          m0PrevHpRef.current = -1;            // 強制回復の被弾検出も新ランでリセット
          m0HealAtRef.current = 0;             // 衛生兵の回復待ちも新ランでリセット
          m0PendingRef.current = null;         // 演出待ちも新ランでリセット
          m0WaveRef.current = null;            // 練習の残りも新ランでリセット
          m0WallHoldRef.current = null; // 銘打ちの予約も新ランでリセット
          m0ZoneRef.current = -1;       // 区域の追跡も新ランで初期化
          m0CritLandedRef.current = false;
          m0LatePopupRef.current = null;
          // ハンター変異体イベントも新ランで全リセット(回数/CD/状態機械/優勢判定の履歴)。
          hunterRef.current = { phase: 'idle', eventsThisRun: 0, nextEligibleAt: HUNTER_START_MS, spawnAt: 0, detectStartAt: 0, chaseStartAt: 0, reinforced: 0, primaryId: '', vicious: false, viciousRearmAt: 0, viciousPendingAt: 0, noticed: false };
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
          // バッチM2/M3/M4/M6も新ランでリセット(コマ=リラックス・湧きCD・被弾/緩め検知)。
          // ランクは持ち越し開始値(前ラン最終−1・社長決定v0.25.1844)から。
          puzzleClockRef.current = seededPuzzleClockState();
          // v0.25.2592(社長報告「ボスモードでランク1だったのに、死ぬ瞬間にランク6のアテンション。
          // でもリザルトはランク1」): **開始ランクを到達記録の初期値にする**。
          // 旧: resetGameが maxRankReached=1 で初期化し、以後 announceRankChange(=ランクが上がった
          // 瞬間)でしか更新しないため、**持ち越しで高ランクから始まったランはそこから上がらない限り
          // ずっと1のまま**表示されていた(実際のランクは6でも、HUD/リザルト/年表の見出しが1)。
          // 開始値で初期化すれば「そのランで最も高かったランク」の意味と一致する。
          {
            const startRank = puzzleClockRef.current.rank;
            useGameStore.setState(state => state.gameStats.maxRankReached >= startRank ? {} : ({
              gameStats: { ...state.gameStats, maxRankReached: startRank },
            }));
          }
          puzzleKomaRef.current = {
            kind: 'relax', elapsedMs: 0, script: null, scriptSpawned: { ...ZERO_NUISANCE }, seenIds: new Set(),
            lastPatternId: null, acc: createKomaAccumulator(), provisionalDelta: null, pendingFinalDelta: null,
            chaffRamp: { target: 1, msSinceRampMs: 0 }, belowTargetMs: 0, excitedThisKoma: false, peakRedSpawned: false,
          };
          puzzleSoftenRef.current = createSoftenState();
          puzzleCdRef.current = { lastBaseSpawnAt: 0, lastNuisanceSpawnAt: 0, lastSpecialSpawnAt: 0 };
          puzzleHitRef.current = { prevHp: -1, lastHitAt: -1e9 };
          rankPaceRef.current = { state: createRankPaceState(), prevKills: 0 }; // M50: 連続査定も新ランでリセット
          setPuzzleDebug(null);
          // バッチ2(計測)の種別キル集計も新ランでリセット(前ランの数字を引きずらない)。
          resetKillTelemetry();
          resetPhaseKillDebug();
          killPhaseRef.current = { phaseKey: '', startTotals: null, startSpawns: null };
          maxAreaRef.current = 0;
          labVisitedRef.current = null;
          labGoalSideRef.current = 0;
          // チュートリアルの表示済みは端末記憶(localStorage)が正。**出撃時に1回だけ読んで**refへ載せる
          // (毎フレームlocalStorageを読まないため)。以後このラン中は ref だけを見る。
          tutorialSeenRef.current = loadSeenForGate();
          wallWarnedRef.current = [false, false, false, false]; // M14の予告バンドも新ランで再アーム
          runDeepestDistRef.current = 0;
          wallDepthSyncRef.current = 0;
          gateCalloutRef.current = ''; // 関所コールアウトの前フェーズ記憶もリセット
          heliLandedRef.current = false; // ヘリ着陸SE/砂煙の1回フラグも新ランで戻す
          reaperRef.current = { risk: 0, lastPassAt: 0, passCount: 0, chaserId: null, chaserSpawnAt: 0, lastWarpAt: 0, lastTimeRollAt: 0, timeSpawned: false, warpAnimStartAt: 0, warpToX: 0, warpToY: 0, warpTeleported: false, defeatCount: 0 };
          bossRef.current = { spawned: false, bossId: null, homeX: 0, homeY: 0, lastX: 0, lastY: 0, w: 0, h: 0, retreating: false, disengageSince: undefined, lastCrushFxAt: 0, warpUntil: 0, vx: 0, vy: 0, dashDirX: 0, dashDirY: 0, thorPrevHealth: -1, thorRangedHits: [], thorNextBackstepAt: 0, thorNextOrbitStepAt: 0, thorNextSlowWalkAt: 0, thorSlowWalkUntil: 0, mimirAimVX: 0, mimirAimVY: 0, mimirLockSfxUntil: 0, mimirBrokenSfxUntil: 0 };
          gatebossForceRef.current = false; // ?gateboss=1 の force-spawn も新ランで再アーム
          idolForceRef.current = false; // ?idolnow=1 の force-spawn も新ランで再アーム
          bountyForceRef.current = false; // ?bountynow=1 の force-spawn も新ランで再アーム(§6.38 B1)
          phantomForceRef.current = false; // ?phantomnow=1 の force-spawn も新ランで再アーム(research/GHOST_BOSS.md)
          phantomStateRef.current = createPhantomTickState(); // 幻影のラン内状態も新ランでリセット
          bountyStateRef.current = createBountyTickState(); // 賞金首のラン内状態も新ランでリセット(§6.38 B2a)
          clearBountyPlayback(); // ボスメーカーの個別再生も新ランで解除(idolと同じ理由=v0.25.2625の教訓)
          bountyNaturalRef.current = { count: 0 }; // 自然湧きの回数も新ランでリセット(§6.38 B4/v8.3)
          policeArmedRef.current = true; // 警察署アリーナの再発動ガードも新ランで解除(§6.24 M48・v0.25.2389)
          bossMakerReadyRef.current = false;
          idolStateRef.current = createIdolTickState(); // idolのストリング/懲罰タイマも新ランでリセット
          clearIdolPlayback(); // ボスメーカーの個別再生も新ランで解除(createIdolTickStateに副作用を持たせない=v0.25.2625の教訓)
          angelStateRef.current = createAngelBossState(); // 天使(ゲート2ボス)状態も新ランでリセット(M26 Step3)
          clearAngelPlayback(); // ボスメーカーの個別再生も新ランで解除(createAngelBossStateに副作用を持たせない=v0.25.2625の教訓)
          clearHiddenBossPlayback(); // 裏ボス4体のボスメーカー個別再生も新ランで解除(同上・v0.25.3573)
          // M26-L: 実機オートパイロットの状態も新ランでリセット(tick連番/rusher詰まり検知/乱数/レポート済みフラグ)。
          botTickRef.current = 0;
          botRusherRef.current = createRusherTrackState();
          botStuckRef.current = createBotStuckState(); // ★v0.25.3554: 新ランでリセット
          botCounterThreatRef.current = createCounterThreatState(); // M37: 人間反応カウンターの検知状態も新ランでリセット
          botWarpRef.current = createWarpTrackState(); // M49-3: ワープ追従の前tick位置も新ランでリセット
          botEngagementRef.current = createEngagementTrackState(); // M49: 行動階層①⇄②の直近実績も新ランでリセット
          botRandRef.current = mulberry32(1);
          botReportedRef.current = false;
          botPausedSinceRef.current = 0;
          castleAttnRef.current = { at: 0, x: 0, y: 0 };
          suppCaptureCountRef.current = 0;
          areaZoneRef.current = -1; // 区域も再判定(リワインド/新ランで開始地点では出さない)
          zoneSfxPlayedRef.current = new Set(); // 到達SEの「今回のラン」判定も新ランでリセット
          areaSectorRef.current = -1; // 担当エリア進入セリフも再アーム
          // 社長決定v0.25.2317: ゲートは毎ラン必ず復活する(恒久解除の廃止)。よって永続メタは読まず、
          // 常に「未クリア」から開始する。ラン中のクリア済みフラグ(gateMetaRef)は同ラン内の再発火防止・
          // 到達判定・深層解禁のためにそのまま生きる(ラン終了で捨てられる)。
          gateMetaRef.current = emptyGateMeta();
          runEndCommittedRef.current = false; // 進捗コミット済みガードも新ランで再アーム
          gate1PenaltyActiveRef.current = false; // 未達ペナルティも新ランで再アーム
          activeGateRef.current = null;
          gate1PendingRef.current = false;
          gate2PendingRef.current = false;
          gate1DoneThisRunRef.current = false; // ラン内ガードも新ランで再アーム
          gate1PassedThisRunRef.current = false; // ゲート1通過(凶悪ハンター解放)も新ランでリセット=復活(社長決定v0.25.1669)
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
          storyBossSpawnedRef.current = false; // the ONE ストーリーボス進行も新ランで再アーム
          storyBossWinAtRef.current = 0;
          glenRoarQueuedRef.current = false;
          glenRoarShownRef.current = false;
          revisitAttnShownRef.current = false;
        }
        lastSeenGameTimeRef.current = newGameTime;

        // PACING_PUZZLE.md §2: 本方式が「稼働中」かどうか。ボスフェーズ(既存PHASESのboss)だけは
        // 骨格を残すため対象外(§2「7:00城ボス=既存PHASESのbossフェーズだけ残す」)。curPhaseは
        // まだこの位置では未計算(ずっと下の別ブロックで初めて求まる)ので、既存の他箇所と同じく
        // phaseAt()を軽量に再呼び出しする(同種の再計算は無視できるコスト・既存踏襲)。
        const puzzleActiveNow = PUZZLE_ENABLED && !labTheme && !indoor && !danceTest && !storyBoss && !tutorialStage && phaseAt(newGameTime).kind !== 'boss';
        // §5.21追補(社長報告v0.25.1848「ゲート1、クリアしなくても奥に行けちゃう」の修正):
        // ゲート(境界囲い1/2)の発火は地理トリガー(境界踏破)なので、コマ/フェーズ表とは無関係に働く。
        // 旧実装は puzzleActiveNow(=フェーズ表がboss扱いの7:00-7:30はfalse)でゲートしていたため、
        // その時間帯に境界を跨ぐと発火が丸ごと止まり素通りできた(実測再現)。城ボスは城の固定位置・
        // ゲートは境界=地理的に重ならないため、実戦闘との排他は不要。フェーズ条件だけ外した版を使う。
        const gateFireOk = PUZZLE_ENABLED && !labTheme && !indoor && !danceTest && !storyBoss && !tutorialStage;

        const castle = useGameStore.getState().castleEvent;
        // 城のフィナーレボス: 城に近づくと魔法陣の演出(錬金と同じ=magic-circle)で giantbat が出現(社長指示)。
        // 城は最初から固定設置。出現条件は「5分経過(時間)」のみ=その時刻に城の位置へ giantbat がポップ。
        // (社長指示: 接近不要。城マーカーはボス出現後に表示。?castlenow=1 は即時。)
        // 以前は制圧イベント中(ステージ1メイン)は出さない仕様だったが、社長指示で撤回=制圧中でも
        // 時間が来たら出現するように変更(拠点制圧の完了を待たない)。
        const castleBossReady = FORCE_CASTLE_BOSS || practiceForces('castlenow') || newGameTime >= CASTLE_BOSS_MIN_TIME_MS;
        // 洋館通路(corridorMode)は城なし(v0.25.2144・社長指示「城も出現しないで。時間で出るのは死神だけ」)
        // =5分の城ボス(giantbat)+バナーを出さない(城の実体もresetGameで遥か遠方に置いている)。
        // v0.25.3054: 別ボスと交戦中は城ボスの時間出現を先送り(出現アテンション/魔法陣がボス戦へ
        // 割り込まない)。時間条件は満ちたままなので、交戦解除(+復帰猶予)の直後に出現する。
        const castleSpawnLocked = (() => {
          const cgs = useGameStore.getState();
          return facilitiesLocked(cgs.bossFightNow, cgs.bossFightLastTrueAt, newGameTime);
        })();
        if (!danceTest && !indoor && !labTheme && !storyBoss && !tutorialStage && (!noSpawn || practiceWantsCastleBoss()) && !revisitRun && !useGameStore.getState().corridorMode && !castle.bossSpawned && castleBossReady && !castleSpawnLocked) {
          markCastleBossSpawned();
          useGameStore.setState({ eventBannerText: '危険変異体出現', eventBannerUntil: newGameTime + EVENT_BANNER_MS });
          const boss = spawnEnemyAt('giantbat', castle.x, castle.y, newGameTime);
          // PHILLガンはstage-2限定・弾薬有限のため火力基準から除外。通常ビルド基準でstage進行ごとに上げる。
          // research/STAGE_DIFFICULTY.md: 台帳のステージ階段に、育成への対抗であるステージ係数を重ねる
          // (役割が別=掛ける・社長裁定「案A」)。計測路(ボスメーカー/ガントレット)はヘルパが1.0を返す。
          {
            const cbMult = stageBossDiffMults();
            boss.health = boss.maxHealth = Math.round(stageBossHealthFor(getSelectedStageId()) * cbMult.hp);
            boss.damage = Math.round(boss.damage * cbMult.dmg);
          }
          // 出現直後は城で待機=プレイヤーが近づくまで向かってこない(社長指示)。aggroRange 内へ入ると起動。
          boss.dormant = true;
          boss.aggroRange = GIANT_AGGRO_RANGE;
          // リーシュで待機へ戻った時の帰り先(社長指示v0.25.2419「城にゆっくり戻ってほしい」)。
          // 出現地点=城なので、そのまま巣にする(裏ボスの homeX/homeY と同じ役割・同じフィールド)。
          boss.homeX = castle.x;
          boss.homeY = castle.y;
          boss.vx = 0;
          boss.vy = 0;
          addEnemy(boss);
          spawnFlash('rgba(127,29,29,0.28)', 420);
          spawnRing(castle.x, castle.y, 18, 170, 'rgba(239,68,68,0.9)', 7, 720);
          spawnRing(castle.x, castle.y, 42, 260, 'rgba(127,29,29,0.62)', 4, 920);
          useGameStore.getState().spawnGlow(castle.x, castle.y, GLOW_R_XXL, 'rgba(239,68,68,', 900);
          spawnBurst(castle.x, castle.y + 20, '#7f1d1d', 28);
          // アテンションは出現エフェクトが消えてから(=ぼやけ防止・社長指示)。下のディスパッチャが発火。
          castleAttnRef.current = { at: newGameTime + 950, x: castle.x, y: castle.y };
        }
        // 城ボスの遅延アテンション発火(出現演出が落ち着いてからカメラを寄せる)。
        if (castleAttnRef.current.at > 0 && newGameTime >= castleAttnRef.current.at && !useGameStore.getState().attention) {
          const { x, y } = castleAttnRef.current;
          castleAttnRef.current = { at: 0, x: 0, y: 0 };
          // §6.36: 城ボス出現カットイン。名前はステージ別台帳(bossCutin.ts)。台帳に無いステージ
          // (=実装してないボス)は undefined でカットイン無し=従来のattentionのみ。
          useGameStore.getState().triggerAttention(x, y, bossCutinPayload('giantbat', getSelectedStageId()));
          playSfx('boss-appear');
        }

        // --- the ONE ストーリーボス(M7=グレン巨大化 / EX=未確認変異体) ---
        // 統合正本M7/10章: storyBossOnly ステージは通常湧き・各種イベントを全停止(上下の各ゲート)し、
        // 「導入会話(M7・会話なし=EXは即)→ボス出現→撃破→終幕→勝利」だけで構成する。ボスは既存の
        // giantbat(城ボス)を流用(新規アート禁止=指示書1)。勝利は帰還サークルを経由せず直接 gameWon。
        if (storyBoss && !danceTest) {
          const sbs = useGameStore.getState();
          // 導入完了 = 登場演出(ヘリ=時間停止)が明けた瞬間。会話自体は通常会話キューで非停止再生する。
          const introDone = !isGameTimeStopped();
          const isM7 = getSelectedStageId() === 'stage-7';
          // M7初回: 最終行が表示に入ったら咆哮を末尾へ積む。既読後/リトライは会話データ自体が空なので省略する。
          const introSkipped = isM7 && sbs.introDialogueLines.length === 0;
          if (isM7 && !introSkipped && introDone && !glenRoarQueuedRef.current && !storyBossSpawnedRef.current
              && sbs.introDialogueShown && !sbs.npcDialogueQueue.some(l => l.text === GLEN_FINAL_LINE)) {
            glenRoarQueuedRef.current = true;
            // グレン巨大化の咆哮(確定台詞・指示書4.7)。立ち絵は変異後の頭部(社長指示v0.25.2073)。
            useGameStore.getState().enqueueNpcDialogue([{ name: 'グレン', text: GLEN_ROAR_LINE, portrait: 'グレン(変異)' }]);
          }
          // enqueue後の最新状態を見る。咆哮が表示された瞬間に既読を保存し、表示が終わるまではボスを出さない。
          const glenDialogue = useGameStore.getState();
          if (isM7 && glenDialogue.npcDialogue?.text === GLEN_ROAR_LINE && !glenRoarShownRef.current) {
            glenRoarShownRef.current = true;
            updateStoryFlags({ glenIntroSeen: true });
          }
          // EXは即出現。M7既読後も会話を省略して即出現。M7初回だけ咆哮の表示終了を待つ。
          const glenSpawnOk = !isM7 || isGlenBossSpawnReady({
            introSkipped,
            roarQueued: glenRoarQueuedRef.current,
            roarShown: glenRoarShownRef.current,
            currentText: glenDialogue.npcDialogue?.text ?? null,
            roarPending: glenDialogue.npcDialogueQueue.some(line => line.text === GLEN_ROAR_LINE),
          });
          // cine実験台(?cine=1 & stage-7)ではストーリーボス(グレン)を出さない=クリーンな映像確認(社長v0.25.1879)。
          // ?nospawn=1 でもストーリーボスを出さない(=イベント不発火。社長指示v0.25.1995・QAのクリーン撮影用)。
          const cineSuppress = CINE_TESTBED && getSelectedStageId() === 'stage-7';
          // v0.25.3203(社長報告「アクラシエル、技がすべて壊れてる…もうめちゃくちゃ」の主因):
          // アクラシエルのボスモードは stage-ex1(storyBossOnly)で ?gateboss=1 起動するため、
          // **ストーリーボス(未確認変異体=巨人)がアクラシエルと同時に湧いて**いた。
          // 3方向の赤ライン・予兆なしのダメージは同席した巨人の技。ゲート2練習(?gateboss=1)中は
          // ストーリーボスを出さない(通常のstage-ex1出撃は不変)。
          if (!storyBossSpawnedRef.current && introDone && glenSpawnOk && !cineSuppress && !FORCE_GATEBOSS && (!noSpawn || practiceWantsCastleBoss())) {
            storyBossSpawnedRef.current = true;
            const scx = player.x + player.width / 2;
            const scy = player.y + player.height / 2 - STORY_BOSS_SPAWN_DIST;
            const boss = spawnEnemyAt('giantbat', scx, scy, newGameTime);
            // M60(PACING_PUZZLE.md §6.28-11): この個体だけがPhase3/3連携/500ms硬直床の対象になる
            // 印(gameStore.ts側のゲート)。通常ステージ(1〜6)の城ボスはこの経路を通らないので
            // isStoryBossが付かない=無改変(受け入れ条件13「storyBossMode/getSelectedStageId()で分岐」)。
            const storyStageId = getSelectedStageId();
            boss.isStoryBoss = true;
            boss.storyBossVariant = storyStageId === 'stage-7' ? 'stage-7' : 'stage-ex1';
            // ★v0.25.3164(社長決定「ボスのHPは増やす台本を適用しよう」): ストーリーボスにも
            // ボスHPの台帳(config/bossHealth.ts)を適用する。
            // 旧: この経路は台帳を通らず、enemyUtils の素の値(500)×ENEMY_HP_MULT(5)=**2500**で戦っていた
            //     ——台帳には 'stage-7': 6000 と書いてあり「ラスボスへ適用する」とコメントまであるのに、
            //     適用しているのは**城ボスの出現経路だけ**だった(:2545)。ラスボスの1形態が
            //     ステージ1の城ボス(3500)より弱い状態。
            // ※台帳に**行がある stage だけ**適用する(stage-ex1 は行が無く、既定へフォールバックさせると
            //   誰も決めていない値になるので触らない=従来どおり2500)。
            // research/STAGE_DIFFICULTY.md: 城ボスと同じくステージ係数を重ねる(stage-7 / stage-ex1 は
            // 表未掲載=1.0なので実効は不変。適用点を城ボスと揃えて取りこぼしを作らないための配線)。
            {
              const sbMult = stageBossDiffMults();
              if (STAGE_BOSS_HEALTH_BY_STAGE[storyStageId] !== undefined) {
                boss.health = boss.maxHealth = Math.round(stageBossHealthFor(storyStageId) * sbMult.hp);
              }
              boss.damage = Math.round(boss.damage * sbMult.dmg);
            }
            // v0.25.3029(社長裁定「二体」): stage-7のグレンは形態フラグを持つ。通常は形態1から。
            // ボスモードの「グレン 第二形態」枠は**最初から形態2の個体**をフルHPでスポーン
            // (旧「HP60%から開始」は二体構成化で廃止)。
            if (storyStageId === 'stage-7') {
              boss.glenForm = practiceWantsGlenForm2() ? 2 : 1;
            }
            // M7(stage-7=グレン)のボスだけ当たり判定込みで2倍(社長指示v0.25.2000)。width/height=当たり判定なので
            // 2倍で見た目(=箱にcontainスケール)も当たり判定も同時に2倍。増分の半分だけ左上へ寄せて中心を維持。
            // EXボスは対象外(グレンのみ)。
            if (storyStageId === 'stage-7') {
              const owB = boss.width, ohB = boss.height;
              boss.width = owB * 2;
              boss.height = ohB * 2;
              boss.x -= owB / 2;
              boss.y -= ohB / 2;
            }
            boss.vx = 0;
            boss.vy = 0; // dormantにしない=出現した瞬間から戦闘(即戦闘・統合正本10.2)
            // v0.25.3032(社長報告「登場アテンション中にボスが技を発動しちゃってる」): 城ボスの
            // 技抽選ゲートは aiReadyAt(gameStore 9810)で、bossNextActionAt は裏ボス用=読まれない。
            // スポーンと同フレームに技を抽選→凍結で「予告を出したまま登場シーン」になっていた。
            // 抽選をアテンション明け+2秒(ゲーム時間)まで封じる。
            boss.aiReadyAt = newGameTime + 2000;
            addEnemy(boss);
            spawnFlash('rgba(127,29,29,0.28)', 420);
            spawnRing(scx, scy, 18, 170, 'rgba(239,68,68,0.9)', 7, 720);
            spawnRing(scx, scy, 42, 260, 'rgba(127,29,29,0.62)', 4, 920);
            useGameStore.getState().spawnGlow(scx, scy, GLOW_R_XXL, 'rgba(239,68,68,', 900);
            spawnBurst(scx, scy + 20, '#7f1d1d', 28);
            // §6.36: グレン(stage-7)は出現カットイン付き。EX(stage-ex1)は「未確認変異体」=名を
            // 出さない方針(統合正本10.3)なので台帳に無い=カットイン無し(従来のattentionのみ)。
            // 監査指摘1: attention生存中は保留箱へ(捨てない=「毎回出す」)。
            {
              const glenCutin = bossCutinPayload('giantbat', storyStageId);
              if (glenCutin && useGameStore.getState().attention) pendingCutinAttnRef.current = { x: scx, y: scy, cutin: glenCutin };
              else useGameStore.getState().triggerAttention(scx, scy, glenCutin);
            }
            playSfx('boss-appear');
            if (getSelectedStageId() !== 'stage-7') {
              // EX: ボス表示は「未確認変異体」のみ(PHILL/フィルの名は出さない=統合正本10.3・
              // 修正差分メモD-07で「異常変異体」から改称)。
              // (M7の咆哮は出現ゲート側で表示済み=v0.25.2076でここでのenqueueは廃止。)
              useGameStore.setState({ eventBannerText: '未確認変異体', eventBannerUntil: newGameTime + EVENT_BANNER_MS });
            }
          } else if (storyBossSpawnedRef.current && storyBossWinAtRef.current === 0) {
            // 撃破検知: 場から giantbat が消えたら終幕へ(storyBossランには他の giantbat 供給経路がない)。
            // 画面揺れ+背景で崩れる演出は triggerDramaticDeath(既存)が担う。
            // v0.25.3029(監査指摘・致命1): 形態2のスポーン予約中は「まだ戦闘中」=終幕にしない
            // (形態1討伐〜形態2出現の約5.2秒は盤上のgiantbatが0になるため)。EX(予約を張らない)は不変。
            const alive = sbs.enemies.some(e => e.type === 'giantbat') || sbs.glenForm2SpawnAt != null;
            if (!alive) {
              if (getSelectedStageId() === 'stage-7') {
                // 撃破後・共通/サブ3本完了分岐(統合正本M7撃破後・指示書4.8)。グレン「……」は削除しない。
                const lines: { name: string; text: string }[] = [{ name: 'ミラ', text: 'ありがとう……ありがとう……' }];
                if (subsAllCompletedFromMeta()) {
                  lines.push({ name: 'ミラ', text: 'グレンの薬を託すよ' }, { name: 'グレン', text: '……' });
                }
                useGameStore.getState().enqueueNpcDialogue(lines);
                storyBossWinAtRef.current = newGameTime + lines.length * (NPC_DIALOGUE_MS + NPC_DIALOGUE_GAP_MS) + 900;
              } else {
                // EX: 台詞・通信・正体表示なし、そのままクリア(統合正本10.4)。崩壊演出の余韻だけ置く。
                storyBossWinAtRef.current = newGameTime + 2600;
              }
            }
          }
          // v0.25.3029(社長裁定「二体」): 形態1の討伐アテンションが終わったら、同位置に第二形態を
          // フルHPの**新しい個体**としてスポーン(出現カットイン=変身後の絵・裁定2い)。
          // 先に予約をnullへ=同フレーム二重発火防止(監査指摘・致命5)。gameOver/gameWon中は湧かせない。
          {
            const pend = useGameStore.getState().glenForm2SpawnAt;
            if (pend && Date.now() >= pend.at && !useGameStore.getState().attention
                && useGameStore.getState().player.health > 0 && !useGameStore.getState().gameWon) {
              useGameStore.setState({ glenForm2SpawnAt: null });
              const e2 = spawnEnemyAt('giantbat', pend.x, pend.y, newGameTime);
              e2.isStoryBoss = true;
              e2.storyBossVariant = 'stage-7';
              e2.glenForm = 2;
              // v0.25.3164: 形態2も台帳のHPで出す(形態1と同額)。ここも台帳を通っていなかった。
              // v0.25.3677(検収監査): 形態1(2766)と同じくステージ係数ヘルパを通す。今日はS7=1.0で
              // 同値だが、台帳にS7の行が入った瞬間に形態1とだけズレる地雷を残さない。
              {
                const f2Mult = stageBossDiffMults();
                e2.health = e2.maxHealth = Math.round(stageBossHealthFor('stage-7') * f2Mult.hp);
                e2.damage = Math.round(e2.damage * f2Mult.dmg);
              }
              // 形態1と同じM7の2倍化(当たり判定込み・中心維持)。
              const ow2 = e2.width, oh2 = e2.height;
              e2.width = ow2 * 2; e2.height = oh2 * 2;
              e2.x = pend.x - e2.width / 2; e2.y = pend.y - e2.height / 2;
              // 移動可能帯へクランプ(CLAUDE.md必須・帯の端で死んだ場合に形態2が帯外=追えない、を防ぐ)。
              const placed2 = clampRectToPlayableArea(e2.x, e2.y, e2.width, e2.height, {
                farBackdrop: useGameStore.getState().farBackdrop,
                labTheme,
                corridorMode: useGameStore.getState().corridorMode,
                m0AdvanceLimitX: null,
                corridorRunInActive: false,
              });
              e2.x = placed2.x; e2.y = placed2.y;
              e2.vx = 0; e2.vy = 0;
              // v0.25.3032: 技抽選ゲートは aiReadyAt(bossNextActionAtは城ボスでは読まれない)。
              // 出現アテンション中に技の予告が出るのを防ぐ(形態1スポーンと同じ直し)。
              e2.aiReadyAt = newGameTime + 2000;
              e2.glenVolleyAt = newGameTime; // 胴体弾の種付け(初弾はCD後・監査指摘)
              addEnemy(e2);
              const c2x = e2.x + e2.width / 2, c2y = e2.y + e2.height / 2;
              useGameStore.getState().triggerAttention(c2x, c2y, glenForm2CutinPayload());
              playSfx('boss-appear');
              spawnFlash('rgba(127,29,29,0.28)', 420);
              spawnRing(c2x, c2y, 18, 170, 'rgba(239,68,68,0.9)', 7, 720);
              spawnRing(c2x, c2y, 42, 260, 'rgba(127,29,29,0.62)', 4, 920);
              useGameStore.getState().spawnGlow(c2x, c2y, GLOW_R_XXL, 'rgba(239,68,68,', 900);
              spawnBurst(c2x, c2y + 20, '#7f1d1d', 28);
            }
          }
          // 終幕の間が明けたら勝利(帰還サークルなしの直接クリア)。
          if (storyBossWinAtRef.current > 0 && newGameTime >= storyBossWinAtRef.current && !sbs.gameWon) {
            useGameStore.setState({ gameWon: true });
          }
        }

        // --- the ONE 洋館［SUB］再訪(統合正本9章) ---
        // 通常ステージと同様に敵が湧く中で洋館(=保存槽)へ向かい、接近すると［グレンの薬を使う］を表示。
        // 使用(useGlenMedicine)後は短い間を置いて勝利(成功/失敗の説明・演出は置かない)。
        if (revisitRun && !danceTest) {
          const rvs = useGameStore.getState();
          // 開始時に一度だけ洋館へカメラアテンション(目的地の提示。登場演出明け)。
          if (!revisitAttnShownRef.current && !isGameTimeStopped() && !rvs.attention) {
            revisitAttnShownRef.current = true;
            rvs.triggerAttention(rvs.castleEvent.x, rvs.castleEvent.y);
          }
          if (rvs.medicineUsedAt === 0) {
            const pcx = player.x + player.width / 2;
            const pcy = player.y + player.height / 2;
            const near = Math.hypot(rvs.castleEvent.x - pcx, rvs.castleEvent.y - pcy) <= MEDICINE_USE_RADIUS;
            if (near !== rvs.medicinePromptVisible) {
              useGameStore.setState({ medicinePromptVisible: near }); // 変化時のみ書く(購読者を毎フレ起こさない)
            }
          } else if (!rvs.gameWon && Date.now() - rvs.medicineUsedAt >= 1600) {
            useGameStore.setState({ gameWon: true });
          }
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
        if (!danceTest && !indoor && !labTheme && !storyBoss && !tutorialStage && !noSpawn) {
          // PACING_PUZZLE.md §5.21-追補5(社長決定v0.25.1555): ゲート発火待ちが立っていて、かつ城ボス
          // 以外のイベント(レスキュー/退屈囲い=kind 'rescue'|'horde')が進行中なら、それを強制解除して
          // ゲートを発火可能にする(「ゲート>他イベント」の優先を発火時に効かせる)。城ボスは PHASE
          // (kind==='boss' → puzzleActiveNow=false)なので、この分岐は城ボス中は走らず自然に defer する。
          // activeEvent の kind 'boss'(アリーナミニボス/ゲート2自身)は強制解除しない(=protect)。
          // 既にゲートがアクティブ(activeGateRef!=null)なら触らない(発火済みのゲートを消さない)。
          {
            const aePre = useGameStore.getState().activeEvent;
            if (gateFireOk && activeGateRef.current == null && aePre && aePre.kind !== 'boss') {
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
           if (gateFireOk && gate1Ready) {
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
              const dist = GATE1_ARENA_RADIUS * (0.4 + Math.random() * 0.52);
              return { x: gpcx + Math.cos(ang) * dist, y: gpcy + Math.sin(ang) * dist };
            };
            // 社長指示(v0.25.1523「やはり出れない囲いに」)でゲート1もハード(出られない)へ変更。
            // confinesPlayerを省略=既定true(既存の囲い共通の円内拘束をそのまま適用)。
            // §5.21-追補3(社長決定v0.25.1546): permeable=true でサークルを敵に"入り自由"にする
            // (囲い中「円外の敵は逃走モード」になる既存仕様v0.25.1261をゲート1だけ無効化=通常沸きの
            // chaffが境界を越えて円内へ流れ込めるようにする。gameStore.ts の arenaConfiningFlee 参照)。
            // 重要: beginArenaEvent は呼び出し時点で周辺の非固定敵を一掃するため、必ず「敵を配置する前」に
            // 呼ぶこと(逆順にすると配置直後の台本の敵まで一掃されてしまうバグを実機v0.25.1522で確認)。
            const gateEvent = { kind: 'horde' as const, x: gpcx, y: gpcy, radius: GATE1_ARENA_RADIUS, startedAt: newGameTime, endsAt: newGameTime + ARENA_HORDE_DURATION_MS, permeable: true };
            useGameStore.getState().beginArenaEvent(gateEvent);
            let gateSpawnedCount = 0;
            (Object.keys(counts) as NuisanceType[]).forEach(type => {
              const n = counts[type];
              for (let i = 0; i < n; i++) {
                const pos = placeGateRing();
                // §5.21-追補7(社長決定v0.25.1574): 全個体をレア相当(強制tier)で配置。
                // レア色倍率がそのまま強さになる=専用の×5倍加算(GATE1_FORMATION_STRENGTH_MULT)は廃止。
                // ★社長指示v0.25.3175「第一ゲートの敵は紫に降格で」: 'red'(攻×3/HP×5)→ 'purple'(攻×2/HP×3)。
                //   最初の関所が赤=最上位レアなのは重すぎる、という裁定(赤は以後の山に取っておく)。
                const e = spawnEnemyAtWithTier(type, pos.x - 20, pos.y - 20, newGameTime, 'purple');
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
            spawnRing(gpcx, gpcy, GATE1_ARENA_RADIUS * 0.2, GATE1_ARENA_RADIUS, gateRingColor, 6, 700);
            spawnRing(gpcx, gpcy, GATE1_ARENA_RADIUS, GATE1_ARENA_RADIUS + 30, gateRingColor, 3, 760);
            spawnFlash('rgba(88,28,135,0.24)', 360);
            useGameStore.getState().triggerShake(REAPER_SUMMON_SHAKE_MS, REAPER_SUMMON_SHAKE_MAG);
            useGameStore.getState().triggerTimeSlow(0.4, 520);
           } else if (gateFireOk && shouldTriggerGate2({
             enabled: GATE_ENABLED,
             wallIdx: gate2PendingRef.current ? 4 : null,
             gate2Cleared: gateMetaRef.current.gate2Cleared,
             activeEventActive: false,
           })) {
            // PACING_PUZZLE.md §5.21-追補8: 囲いゲート2(ハード=出られない)。ゲート2ボス=天使名の
            // 裏ボス勢1体目「ミゲル」(内部型'miguel')を配置する(旧: 城ボスgiantbatの仮流用。giantbatは
            // 城フィナーレボスとして別枠で存続=useGameLoop.ts:1638 の別スポーンは無変更)。confinesPlayer省略=既定true。
            // ゲート2の×5(GATE2_BOSS_STRENGTH_MULT)は適用しない。ENEMY_STATSへ入れた
            // bossHealth.tsのステージ別HPと与ダメ38を、そのまま実効値として使う。
            gate2PendingRef.current = false;
            const g2pcx = player.x + player.width / 2, g2pcy = player.y + player.height / 2;
            // 重要: beginArenaEvent は周辺の非固定敵を一掃するため、必ずボスを配置する前に呼ぶ
            // (gate1と同じ実機バグの教訓・裏ボス(isHiddenBoss)は除外リストに入っているため実害は無いが
            // 順序を揃えて統一する)。
            const gate2Event = { kind: 'boss' as const, x: g2pcx, y: g2pcy, radius: GATE_ARENA_RADIUS, startedAt: newGameTime, endsAt: newGameTime + GATE2_BOSS_DURATION_MS };
            useGameStore.getState().beginArenaEvent(gate2Event);
            const bx = g2pcx + Math.cos(-Math.PI / 2) * GATE_ARENA_RADIUS * 0.5;
            const by = g2pcy + Math.sin(-Math.PI / 2) * GATE_ARENA_RADIUS * 0.5;
            // ゲート2ボスはステージ別(stage-1=ミゲル / stage-3=ジブリル)。未定義ステージは従来どおりミゲル。
            const gate2BossType = GATE2_BOSS_TYPE_BY_STAGE[getSelectedStageId()] ?? 'miguel';
            const boss = spawnEnemyAt(gate2BossType, bx - 24, by - 24, newGameTime);
            // research/STAGE_DIFFICULTY.md: ステージ係数(計測路は1.0)。天使のスポーンは**2箇所**
            // (ここ=本編の自然発火 / 下の練習・デバッグ経路)なので両方に掛ける。
            {
              const g2Mult = stageBossDiffMults();
              boss.health = boss.maxHealth = Math.round(boss.health * g2Mult.hp);
              boss.damage = Math.round(boss.damage * g2Mult.dmg);
            }
            boss.fromEvent = true;
            // ミゲルは周回移動(bossState制御)なので dormant/aggroRange は使わない(giantbat流用時の名残)。
            boss.bossState = 'chase';
            boss.bossNextActionAt = newGameTime + 2000;
            boss.homeX = g2pcx; boss.homeY = g2pcy; // 周回の中心=ゲート中心
            addEnemy(boss);
            // §6.36: 天使ゲート2の出現カットイン(このattention自体が新設=約3.7秒の凍結演出が増える。
            // 社長報告に明記済み・不要なら外せる)。監査指摘1: attention生存中は保留箱へ。
            {
              const g2Cutin = bossCutinPayload(gate2BossType);
              if (g2Cutin && useGameStore.getState().attention) pendingCutinAttnRef.current = { x: bx, y: by, cutin: g2Cutin };
              else useGameStore.getState().triggerAttention(bx, by, g2Cutin);
            }
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
            // §6.38 v6 A-2(B4配線): 賞金首が場に居る間は囲い/レスキューを先送りする。
            // ★v0.25.3597(社長報告「小ボスと同時に何かの閉じ込めイベントも発動した」): 旧基準は
            // **交戦中(anyBountyEngaged)**だったが、3:00の賞金首は**dormantで湧く**(700〜1000px先で
            // 待機)ため、プレイヤーが起こすまで「非交戦」=この先送りが素通しだった。城ボスの同型穴
            // (v0.25.3549「湧いたが未交戦の窓」)と同じ構造。基準を**存命(dormant含む)**へ。
            // 賞金首側は元からactiveEvent中に湧かない(bountySpawnBlocked)ので、これで両向きに排他が閉じる。
            const bountyBlocksArena = useGameStore.getState().enemies.some(e => isBountyType(e.type));
            const gateEventReady = pendingGE != null && !useGameStore.getState().bossChasing && !hiddenBossAlive && hunterRef.current.phase === 'idle' && !redNightActiveNow && !bountyBlocksArena;
            const arenaReady = gateEventReady || ((FORCE_ARENA != null || newGameTime >= nextArenaAtRef.current) && !useGameStore.getState().bossChasing && !hiddenBossAlive && hunterRef.current.phase === 'idle' && arenaProducerOk && !bountyBlocksArena);
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
                // クリア告知(発生バナーと同じ機構)。horde=駆除成功 / boss=討伐成功 /
                // 警察署アリーナ(§6.24 M48)=専用の制圧完了文言。
                useGameStore.setState({
                  eventBannerText: ae.kind === 'boss' ? '討伐成功！' : ae.policeArena ? '警察署 制圧完了！' : '駆除成功！',
                  eventBannerUntil: newGameTime + EVENT_BANNER_MS,
                });
                playSfx('event-clear'); // 小イベント完了音(成功時のみ)
                // §6.24 M48 F1: 全滅クリアで専用スキルを1つランダム付与。**プレイ中のみ**
                // (社長指示v0.25.2451「プレイ中のみ付与」)。旧実装のgrantSkill(恒久所持=装備メニューに
                // 並ぶ+そのランでは発動しない)は真逆の挙動だったため、ラン内のplayer.skillsへ直接
                // 追加する形へ変更。resetGameで自然に消え、所持リスト/ガチャ/装備UIには一切出ない。
                if (ae.policeArena) {
                  const granted = POLICE_REWARD_SKILLS[Math.floor(Math.random() * POLICE_REWARD_SKILLS.length)];
                  useGameStore.setState(s => ({
                    player: s.player.skills.includes(granted) ? s.player : {
                      ...s.player,
                      skills: [...s.player.skills, granted],
                      skillLevels: { ...s.player.skillLevels, [granted]: 1 },
                    },
                    policeTaken: true, policeTakenAt: newGameTime,
                  }));
                  useGameStore.getState().spawnCallout(ae.x, ae.y - 40, `スキル「${SKILLS[granted].name}」発動！(この出撃のみ)`, '#7dd3fc');
                  // §6.24-UX 確定要件2: 現地の浮き文字(上)は残しつつ、**武器取得と同じトースト**でも
                  // 出す(スキル名+効果説明1行+「この出撃のみ」)。説明は既存のSKILLS定義を流用。
                  useGameStore.setState({
                    lastWeaponGet: {
                      name: SKILLS[granted].name, at: Date.now(), color: '#7dd3fc',
                      kind: 'poi-skill', desc: SKILLS[granted].desc, note: POI_SKILL_NOTE,
                    },
                  });
                  // §6.24-UX 確定要件3: 解放をゾーン到達と同型の帯(WallBand)で出す。
                  useGameStore.getState().triggerWallBand(poiUnlockBandText('police'), 'white', POI_BAND_MS);
                  // 歴史年表(社長裁定2026-07-31「初めて警察署を開放 ね」): POI開放は種別ごと
                  // ゲーム全体で初回のみ記録(拠点の「初めて拠点を開放」と同じ全体初回ガード)。
                  recordChronicleGlobalFirst(getSelectedStageId(), 'poi', 'police', `初めて${POI_LABEL.police}を開放`, true);
                }
                // PACING_PUZZLE.md §5.21 M20 stage③: 囲いゲート1クリア時の後処理。恒久解除+未達
                // ペナルティ解除+ハンター消滅+M14到達判定を遅延実行(未達で止めていた分をここで出す)。
                // §5.21 M20追補(社長報告v0.25.1534): 恒久解除/踏破フラグのlocalStorageコミットは
                // ここでは行わない(メモリ上のref/storeだけ更新)。確定コミットはラン終了時に
                // commitRunEndProgress('clear')が一括で行う(死亡で終えた場合はコミットされない=
                // v0.25.1517則「死亡は解除しない」を厳密に満たす)。
                if (activeGateRef.current === 1) {
                  gateMetaRef.current = { ...gateMetaRef.current, gate1Cleared: true };
                  gate1DoneThisRunRef.current = true; // §5.21-追補3: ラン内ガードも即立てる(全滅後の再湧き対策)
                  gate1PassedThisRunRef.current = true; // ゲート1通過=このランは凶悪ハンター解放(社長決定v0.25.1669)
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
                  // §5.21-追補9(社長指示v0.25.1655): 年表「未確認汚染エリアに到達」はゲート1クリア時に刻む
                  // (クロス時は gateBlocksThisWall で保留=倒すまで到達扱いにしない)。dedup=区域index。
                  recordChronicle(getSelectedStageId(), 'zone', '3', `${AREA_ZONE_NAMES[3]}に到達`);
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
                  // §5.21-追補9(社長指示v0.25.1655): 年表「深層域に到達」はゲート2ボス(ミゲル)討伐時に刻む
                  // (クロス時は gateBlocksThisWall で保留=倒すまで到達扱いにしない)。dedup=区域index。
                  recordChronicle(getSelectedStageId(), 'zone', '4', `${AREA_ZONE_NAMES[4]}に到達`);
                }
              } else {
                // PACING_PUZZLE.md §5.21-追補6(社長決定v0.25.1556): ゲート失敗(制限時間切れ・未クリア)=
                // プレイヤーをそのゲートの境界より内側(手前エリア)へ強制ノックバック。doneThisRunは立てない
                // ので、内側から再び境界を越えれば detectWallBreach が踏破を再検知しゲートが再発火する
                // (=リトライループ。死神ペナルティは使わない=追補5抑止+ゲート地形で事実上眠る)。
                // 社長指示v0.25.1848: 弾き出し先=「今のゲート円の外・かつスタート地点側」。
                // ゲート中心から原点方向へ「半径+マージン」離れた点へ強制移動(旧: 境界−400の同心円上=
                // ゲート円の内側に残ることがあった)。境界より内側にも自然に収まる(中心≒境界上のため)。
                const gcd = Math.hypot(ae.x, ae.y) || 1;
                const toOriginX = -ae.x / gcd, toOriginY = -ae.y / gcd;
                const pushDist = ae.radius + GATE_FAIL_KNOCKBACK_MARGIN;
                const nx = ae.x + toOriginX * pushDist, ny = ae.y + toOriginY * pushDist;
                useGameStore.setState(s => ({ player: { ...s.player, x: nx - s.player.width / 2, y: ny - s.player.height / 2 } }));
                areaZoneRef.current = areaZoneIndexFor(Math.hypot(nx, ny)); // prevZoneを内側へ=再クロスで踏破を再検知
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
        if (!danceTest && !indoor && !labTheme && !storyBoss && !tutorialStage && !noSpawn) {
          const rnGs = useGameStore.getState();
          const rn = rnGs.redNight;

          // 紅き夜は「デンジャーゾーン(区域index2=原点から3000px)以降」に居る時だけ発現(社長指示)。
          // 3分経過していても、それより内側の安全エリアでは発火しない=深入りした時に初めて発火。
          const rnDepth = Math.hypot(player.x + player.width / 2, player.y + player.height / 2);
          // バッチ7(憲法第5条): 囲い/ハンターと重ねない+ピンチ猶予、かつ緩フェーズ中にしか開始しない
          // (山=関所中に窓が開いても抽選を消費せず次の緩まで毎フレーム再判定=自然に遅延)。
          // ?events=0で本ゲートを無効化(従来どおり時間+デンジャーゾーンだけで判定)。
          // §6.38 v6 A-2(B4配線): 賞金首交戦中は紅き夜を先送りする(他の大イベントと同じ「重ねない」扱い)。
          const rnBigEventActive = !!(rnGs.activeEvent && rnGs.activeEvent.kind !== 'rescue') || hunterRef.current.phase !== 'idle'
            || anyBountyEngaged(rnGs.enemies, player, Date.now());
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
            // 社長指示v0.25.3317: 7:00固定・毎ラン確定(発生率の抽選は廃止)。条件が塞がっている間は
            // このelse-ifが通らない=満たした瞬間に発火する(自然遅延は従来どおり)。
            redNightFiredRef.current = true;
            rnGs.beginRedNightWarning(newGameTime);
            spawnFlash('rgba(120,0,0,0.18)', 380);
            playSfx('event-start');
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
                // 歴史年表: 拠点に入らず(=skipせず)紅き夜を最後まで凌いだら即載せ(社長決定v0.25.1628)。
                // skipRedNight(拠点でやり過ごし)側では記録しない=「越えた」のは生存タイムアウトのみ。
                recordChronicle(getSelectedStageId(), 'redNight', 'redNight', '紅き夜を越えた');
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
        // 終了アイテムは triggerEventVictory が直接サークルを出す)。通常ストーリーは地点内で離指確認、イベントは3秒滞在で帰還完了。
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

        // 病院(社長指示v0.25.2331): サークル内に3秒とどまるとワクチンを入手。入手した瞬間だけSEを鳴らす
        // (gameStore は playSfx を import できないので、taken の立ち上がりをここで監視する=bossCorpse と同じ流儀)。
        {
          const hosBefore = useGameStore.getState().hospitalTaken;
          useGameStore.getState().updateHospital(deltaTime);
          if (!hosBefore && useGameStore.getState().hospitalTaken) playSfx('weapon-pickup');
        }

        // 武器庫(PACING_PUZZLE.md §6.24 M48): サークル内に3秒とどまり、スクラップが足りていれば
        // Tier3装備を確定入手。入手した瞬間だけSEを鳴らす(病院と同じ流儀)。
        {
          const arBefore = useGameStore.getState().armoryTaken;
          useGameStore.getState().updateArmory(deltaTime);
          if (!arBefore && useGameStore.getState().armoryTaken) playSfx('weapon-pickup');
        }

        // 警察署アリーナ(§6.24 M48 F1): 近づくと既存の囲いイベント(horde)をそのまま発生させる。
        // 発生源が「プレイヤーがこの固定地点に近づいたか」だけの点が退屈アリーナ(boredomArena)と違う
        // (中心はプレイヤーの現在地ではなく警察署の位置に固定)。全滅クリアの報酬付与は下の
        // 「終了判定」ブロック(ae.policeArena)側で行う。
        if (!danceTest && !indoor && !labTheme && !storyBoss) {
          const pgs = useGameStore.getState();
          const ppos = pgs.police;
          if (ppos && !pgs.policeTaken && !pgs.activeEvent) {
            // 失敗後の再武装(v0.25.2389): 警察署から十分離れたら、また挑めるように戻す。
            // 「報酬を取り上げる」のではなく「一度出るまで掴まない」形にして無限ループだけを断つ。
            if (!policeArmedRef.current && isPoliceRearmed(player, ppos)) policeArmedRef.current = true;
            const hiddenBossAlivePolice = pgs.enemies.some(e => isHiddenBoss(e.type));
            // v0.25.3054(社長報告「ボス戦中に拠点発見すると閉じ込められて…ボスは去っていきバグる」):
            // 既存の除外は裏ボス(bossChasing/hiddenBossAlive)だけで、**城ボス等との交戦中が素通り**だった。
            // ボス交戦中(+復帰猶予)は発火させない(施設ロックfacilitiesLocked=商人/POIと同じ関所)。
            if (
              policeArmedRef.current &&
              isNearPolice(player, ppos) &&
              !pgs.bossChasing && !hiddenBossAlivePolice && hunterRef.current.phase === 'idle' &&
              !facilitiesLocked(pgs.bossFightNow, pgs.bossFightLastTrueAt, newGameTime)
            ) {
              // §7-16: アリーナの中心は建物の位置そのものではなく policeArenaCenter(建物の手前)。
              // isNearPolice/isPoliceRearmed と同じ基準点でクランプ・演出を揃える。
              const pCenter = policeArenaCenter(ppos);
              const peEvent = {
                kind: 'horde' as const, x: pCenter.x, y: pCenter.y, radius: POLICE_ARENA_RADIUS,
                startedAt: newGameTime, endsAt: newGameTime + ARENA_HORDE_DURATION_MS, policeArena: true,
              };
              useGameStore.getState().beginArenaEvent(peEvent);
              policeArmedRef.current = false; // 一度離れるまで再発動させない(v0.25.2389)
              hordeSpawnRef.current = { spawned: 0, nextAt: newGameTime, total: ARENA_HORDE_COUNT };
              useGameStore.setState({ eventBannerText: '警察署 制圧開始', eventBannerUntil: newGameTime + EVENT_BANNER_MS });
              // §6.24-UX 確定要件1: 「ここが何で・何をすれば・何が貰えるか」の通信を1ラン1回。
              // 発生バナー(上)は1枠しかないので、通信は左上の会話(NpcDialogue)側へ積む=両方残る。
              useGameStore.getState().showPoiIntel('police');
              playSfx('event-start');
              const peRingColor = 'rgba(96,165,250,0.9)'; // 警察=青
              spawnRing(pCenter.x, pCenter.y, POLICE_ARENA_RADIUS * 0.2, POLICE_ARENA_RADIUS, peRingColor, 6, 700);
              spawnRing(pCenter.x, pCenter.y, POLICE_ARENA_RADIUS, POLICE_ARENA_RADIUS + 30, peRingColor, 3, 760);
              spawnFlash('rgba(30,58,138,0.24)', 360);
              useGameStore.getState().triggerShake(REAPER_SUMMON_SHAKE_MS, REAPER_SUMMON_SHAKE_MAG);
              useGameStore.getState().triggerTimeSlow(0.4, 520);
            }
          }
        }

        // スキル「爆撃」(§6.24 M48・警察署アリーナ報酬): 3秒に1度、射程380px内の最も近い敵へ
        // グレネードランチャー弾(rifle-t3と同じ直進・着弾爆発)をプレイヤー自身から発射する。
        // 新規実装はほぼ不要: タレット/朱雀が既に使っている GRENADE_WEAPON_KEY 経路(useGameLoop
        // 内の着弾爆発ハンドラ)に発射元をプレイヤーへ差し替えて乗せるだけ(§6.24発注メモ2)。
        if (hasSkill(player, 'poi-bombing') && newGameTime >= poiBombingRef.current) {
          const bpcx = player.x + player.width / 2, bpcy = player.y + player.height / 2;
          const target = useGameStore.getState().enemies
            .filter(e => e.type !== 'reaper' || e.reaperChaser)
            .map(e => ({ e, d: Math.hypot(e.x + e.width / 2 - bpcx, e.y + e.height / 2 - bpcy) }))
            .filter(h => h.d <= POI_BOMBING_RANGE)
            .sort((a, b) => a.d - b.d)[0]?.e;
          // §6.24 B3: 射程内に敵がいなければ撃たない(CDは進めない=次に敵が入った瞬間に撃つ)。
          if (target) {
            poiBombingRef.current = newGameTime + POI_BOMBING_INTERVAL_MS;
            const tdx = target.x + target.width / 2 - bpcx, tdy = target.y + target.height / 2 - bpcy;
            const tm = Math.max(0.001, Math.hypot(tdx, tdy));
            const nowMsB = Date.now();
            addProjectile({
              id: `proj-poi-bomb-${nowMsB}`,
              x: bpcx - 7, y: bpcy - 7, width: 14, height: 14,
              speed: TURRET_FWD_BULLET_SPEED, damage: POI_BOMBING_DAMAGE,
              direction: { x: tdx / tm, y: tdy / tm },
              weaponType: 'rifle', weaponKey: GRENADE_WEAPON_KEY,
              duration: 1400, createdAt: nowMsB,
              passthrough: true, hitEnemies: [], hostile: false, reflected: false,
            });
            playSfx('grenade-launcher-fire');
          }
        }

        // スキル「防衛」(§6.24 M48・警察署アリーナ報酬): 装備中なら常時1本、プレイヤーの周りを
        // 周回するブーメラン(ドローンブーメランの色違い)を維持する。動き自体は既存の orbit
        // フィールド(gameStore.updateProjectiles・「bibles」用の汎用周回モーション)をそのまま流用
        // するので新規の移動コードは不要。ダメージパルス/弾消しは下のドローンブーメランのブロックで処理する。
        if (hasSkill(player, 'poi-guard') && !useGameStore.getState().projectiles.some(p => p.weaponKey === 'poi-guard')) {
          const gpcx = player.x + player.width / 2, gpcy = player.y + player.height / 2;
          addProjectile({
            id: `proj-poi-guard-${Date.now()}`,
            x: gpcx + POI_GUARD_ORBIT_RADIUS - 9, y: gpcy - 9, width: 18, height: 18,
            speed: 0, damage: 0, direction: { x: 1, y: 0 },
            weaponType: 'drone-boomerang-projectile', weaponKey: 'poi-guard',
            duration: POI_GUARD_DURATION_MS, createdAt: Date.now(),
            passthrough: true, hitEnemies: [], hostile: false, reflected: false,
            area: DRONE_BOOM_RADIUS, boomPhase: 'stop', // 'stop'=既存の周囲パルスダメージ経路に乗せる
            orbitRadius: POI_GUARD_ORBIT_RADIUS, orbitAngle: 0, orbitSpeed: POI_GUARD_ORBIT_SPEED,
          });
        }

        // §5.21 M20追補(v0.25.1534): クリア(gameWon=帰還完了/ゴール)or 撤退(gameReturned=商人「帰還」の
        // 任意撤収)のいずれかが確定したら、進捗(自己最深/ランク到達/踏破フラグ/ゲート恒久解除)を
        // 一括でlocalStorageへコミットする(1回のみ・runEndCommittedRefでガード)。
        if (WALL_ENABLED && !runEndCommittedRef.current) {
          const rs = useGameStore.getState();
          if (rs.gameWon || rs.gameReturned) {
            runEndCommittedRef.current = true;
            commitRunEndProgress('clear');
            // ランク持ち越しは廃止(PACING_PUZZLE.md §7-11c(2))。旧: クリア/撤退でも最終ランク-1を保存していた。
          }
        }

        // --- ハンター変異体イベント(専用コントローラ・社長指示) ---------------------
        // 屋内/練習モードでは出さない。出現〜索敵〜発見〜追跡〜撤退〜増援を状態機械で管理。
        // ステージ2(研究所スキン=labTheme)にも出さない(社長指示v0.25.1753。凶悪ハンター含む
        // コントローラごと停止=死神をlabで止めるのと同じ扱い)。ストーリーボス専用ラン(M7/EX)も出さない。
        if (!danceTest && !indoor && !labTheme && !storyBoss && !tutorialStage && !noSpawn) {
          const H = hunterRef.current;
          const hs = useGameStore.getState();
          const hpx = hs.player.x + hs.player.width / 2;
          const hpy = hs.player.y + hs.player.height / 2;
          const nearAnyBase = isHunterSafeBaseNearby(hpx, hpy, hs.baseSites, HUNTER_BASE_SAFE_RADIUS);

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
          const spawnBlocked = cinematic || !!hs.activeEvent || nearAnyBase;

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
            H.noticed = false; // 次の出撃のために「気づかれた」フラグを畳む(v0.25.2317)
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
              gate1PassedThisRun: gate1PassedThisRunRef.current, // このランでゲート1通過=停止・次ランで復活(社長決定v0.25.1669)
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
              // 監査v0.25.3008: カメラ矩形→プレイヤー中心(ズーム連動カメラ下げで南側が漏れて過少カウントに)。
              const hpcx = hs.player.x + hs.player.width / 2, hpcy = hs.player.y + hs.player.height / 2;
              const onscreen = hs.enemies.reduce((n, e) => {
                if (isBossType(e.type) || e.type === 'hunter') return n;
                const ex = e.x + e.width / 2, ey = e.y + e.height / 2;
                return (Math.abs(ex - hpcx) <= gameBounds.width / 2 && Math.abs(ey - hpcy) <= gameBounds.height / 2) ? n + 1 : n;
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
            if (!prim || cinematic || nearAnyBase) {
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
              // 社長指示v0.25.2317: 立ち去りもアナウンスする(従来は無言でフェードアウトしていた)。
              // ただし一度も気づかせていない索敵個体は報せない(存在自体のネタバレになるため)。
              if (H.noticed) {
                useGameStore.setState({ eventBannerText: 'ハンターが去っていった', eventBannerUntil: newGameTime + EVENT_BANNER_MS });
              }
            } else {
              const d = Math.hypot(hpx - (prim.x + prim.width / 2), hpy - (prim.y + prim.height / 2));
              if (d <= HUNTER_DETECT_RANGE) {
                H.spawnAt = newGameTime; // 索敵範囲にプレイヤーが入っている間は都度タイムアウトをリセット(社長指示)
                if (H.detectStartAt === 0) {
                  H.detectStartAt = newGameTime;
                  playSfx('hunter-alert'); // 視界に入った=見られている警告SE(社長提供)
                  // 検知=矢印を出す(被監視中の索敵個体に方角マーカー)。
                  useGameStore.setState(s => ({ enemies: s.enemies.map(e => e.id === H.primaryId ? { ...e, hunterAlerted: true } : e) }));
                  H.noticed = true; // 気づかせた=立ち去りもアナウンスしてよい出撃(v0.25.2317)
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
              // 撤退トリガ: 開放前を含む拠点へ逃げ込む / ボス・リーパー・演出が始まった / 追跡が上限を超えた(諦め)。
              const chasedOut = elapsed >= HUNTER_CHASE_MAX_MS; // kiteで永久追跡＆他イベント停止を防ぐ
              // M20追補(社長明確化v0.25.1534)「デンジャーを出る=手前へ戻る」: 凶悪ハンターはプレイヤーが
              // デンジャーより手前(area<2=r<3000)へ後退したら逃げ去る。前進(ゲート1方向)はゲート発生側で処理。
              const viciousRetreated = H.vicious && areaZoneIndexFor(Math.hypot(hpx, hpy)) < 2;
              if (nearAnyBase || retreatCinematic || chasedOut || viciousRetreated) {
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

        // --- サブクエスト hunter-survive の状態源(research/SUBQUESTS.md 致命2) --------------
        // ハンターの状態機械は**この hook の useRef** にしか無いので、store の軽量フィールド
        // `hunterChaseSince`(gameTime打刻)へ鏡映する。「追跡」= phase==='chase' のみ
        // (search=検知は含めない)。追跡が切れた/ハンターが消えた/プレイヤーが死んだ→null。
        // 書き込みは**変化した時だけ**(setHunterChaseSince が同値ならno-op)=毎フレームのset churn無し。
        // 上のハンターブロックはステージ条件でまるごと止まるが、その場合 phase は 'idle' のままなので
        // ここは null を維持する(=ハンターの出ないステージでは常に非追跡)。
        {
          const sqSt = useGameStore.getState();
          const chasing = hunterRef.current.phase === 'chase' && sqSt.player.health > 0;
          if (!chasing) {
            sqSt.setHunterChaseSince(null);
          } else {
            if (sqSt.hunterChaseSince === null) sqSt.setHunterChaseSince(newGameTime);
            useGameStore.getState().applySubquestHunterSurvive(newGameTime);
          }
        }

        // --- 変異体(叫喚型・screamer)ディレクター: 5分以降・同時1体・CDで何度でも(社長指示) ----------
        // 画面外に1体だけ出す。AIが距離を保ちつつ溜め→叫喚で画面内の通常敵を一時強化。溜め完了前に倒せば阻止。
        // PACING_PUZZLE.md(社長裁定v0.25.1378「1は一本化」): パズル方式ON時は本ディレクターを停止し、
        // 供給を特別枠(§4-A: エリア3〜・同時1・CD3秒)へ一本化する。?puzzle=0時のみ従来どおりここが動く。
        // 社長指示v0.25.2249「m2は叫び沸かないで」: 研究所スキン(M2)では叫喚型を出さない。
        // M2は puzzleActiveNow=false(1908行)なのでこのディレクターが動いていた=唯一の湧き経路。
        // 忍び込むステージで画面外から通常敵を一斉強化されるのは設計と噛み合わないため止める。
        if (!danceTest && !indoor && !labTheme && !puzzleActiveNow && !noSpawn) {
          const sS = useGameStore.getState();
          const aliveScreamer = sS.enemies.some(e => e.type === 'screamer');
          const sCinematic = sS.bossChasing || !!sS.attention || sS.redNight?.phase === 'active'
            || sS.enemies.some(e => e.type === 'giantbat' || e.type === 'reaper');
          // §6.38 v6 A-2(B4配線): 賞金首交戦中は叫喚型を先送りする。
          const sBlocked = sCinematic || !!sS.activeEvent || anyBountyEngaged(sS.enemies, player, Date.now());
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

        // §6.38 B4: 賞金首(BOUNTY)の出現位置・演出を、デバッグ経路(`?bountynow=1`)と自然湧きの
        // 両方から共用する唯一の関数(二重実装しない)。中身は旧デバッグ経路の実装をそのまま関数化した
        // だけ(§2「告知」=RESCUE式の距離700〜1000px+アテンション+紫サークル相当の出現バナー)。
        // §6.38 v9(完全コピー原則): 出現の並びを城ボス(2632-2664行)と揃える——
        // バナー→スポーン+魔法陣ほかの演出(城ボスと同じ機構)→エフェクトが落ち着いてからアテンション
        // +カットイン(下のディスパッチャが発火)。「パッと出さない」=城ボスが既に持つease/フェードを
        // そのまま流用する(慣性の絶対ルール)。
        const spawnBountyEncounter = (bType: EnemyType, atGameTime: number): void => {
          useGameStore.setState({ eventBannerText: '賞金首出現', eventBannerUntil: atGameTime + BOUNTY_APPEAR_BANNER_MS });
          const pcx1 = player.x + player.width / 2, pcy1 = player.y + player.height / 2;
          const bAng = Math.random() * Math.PI * 2;
          const bDist = 700 + Math.random() * 300; // 絶対700〜1000px(§2)
          const bx0 = pcx1 + Math.cos(bAng) * bDist, by0 = pcy1 + Math.sin(bAng) * bDist;
          const bountyE = spawnEnemyAt(bType, bx0 - 22, by0 - 22, atGameTime);
          const bClamped = clampRectToPlayableArea(bountyE.x, bountyE.y, bountyE.width, bountyE.height, {
            farBackdrop: useGameStore.getState().farBackdrop,
            labTheme,
            corridorMode: useGameStore.getState().corridorMode,
            m0AdvanceLimitX: useGameStore.getState().m0AdvanceLimitX,
            corridorRunInActive: useGameStore.getState().corridorRunInActive,
          });
          bountyE.x = bClamped.x; bountyE.y = bClamped.y;
          bountyE.dormant = true;
          bountyE.aggroRange = BOUNTY_AGGRO_RANGE_DEFAULT;
          bountyE.homeX = bountyE.x; bountyE.homeY = bountyE.y;
          const bArea = areaIndexForPos(bountyE.x + bountyE.width / 2, bountyE.y + bountyE.height / 2);
          // research/STAGE_DIFFICULTY.md: ステージ係数(計測路は1.0)。既存の bountyEffectiveValueMult とは
          // 乗算で重なる(どちらも「基準値2000への倍率」)。★攻撃係数で動くのは**接触ダメージだけ**——
          // 賞金首の技は bountyScript の専用定数で enemy.damage を通らない=据え置き。
          const bMult = stageBossDiffMults();
          const bHp = Math.round(bountyMaxHealth(bArea, atGameTime) * bMult.hp);
          bountyE.health = bHp; bountyE.maxHealth = bHp;
          bountyE.damage = Math.round(bountyE.damage * bMult.dmg);
          // 同時1体まで(§2)=既存の賞金首を消してから出す(idolの複数体対策と同じ作法)。
          useGameStore.setState(stt => ({ enemies: stt.enemies.filter(e => !isBountyType(e.type)) }));
          addEnemy(bountyE);
          // 出現演出=城ボスと同じ機構(魔法陣はpixiSceneがe.spawnedAt基準で描く。フラッシュ/リング/
          // グロウ/バーストは城ボス出現(2648-2652行)と同じ色・尺をそのまま流用=「同じ機構」)。
          spawnFlash('rgba(127,29,29,0.28)', 420);
          spawnRing(bx0, by0, 18, 170, 'rgba(239,68,68,0.9)', 7, 720);
          spawnRing(bx0, by0, 42, 260, 'rgba(127,29,29,0.62)', 4, 920);
          useGameStore.getState().spawnGlow(bx0, by0, GLOW_R_XXL, 'rgba(239,68,68,', 900);
          spawnBurst(bx0, by0 + 20, '#7f1d1d', 28);
          // アテンション+カットインは出現エフェクトが消えてから(城ボスと同じ950ms・下のディスパッチャが発火)。
          bountyAttnRef.current = { at: atGameTime + 950, x: bx0, y: by0, cutin: bossCutinPayload(bType) };
        };
        // 賞金首の遅延アテンション発火(出現演出が落ち着いてからカメラを寄せる。城ボスと同じ並び)。
        if (bountyAttnRef.current && newGameTime >= bountyAttnRef.current.at && !useGameStore.getState().attention) {
          const { x, y, cutin } = bountyAttnRef.current;
          bountyAttnRef.current = null;
          useGameStore.getState().triggerAttention(x, y, cutin);
          playSfx('boss-appear');
        }

        // --- 賞金首(BOUNTY)自然湧き(§6.38 §2「頻度」・v2 F・B4) ---------------------------------
        // イベントproducer(eventGateOk相当)への相乗り=抑止ゲート(bountySpawnBlocked)+緩コマ不可
        // (第5条「緩を荒らさない」)+専用の回数/CDゲート(bountyNaturalSpawnReady)。
        // ★research/STAGE_DIFFICULTY.md: 種別は**ステージ固定割当**(BOUNTY_TYPE_BY_STAGE)。旧4種ローテは撤去。
        // 台帳に行が無いステージ(stage-2/6/7 ほか)は**湧かせない**(社長裁定「小ボスは1 3 4 5だけ。
        // 6は小ボス無し」)。本編S6は既存の corridorMode ゲートで既に塞がっているので、この台帳ゲートが
        // 実際に効くのは**S6の再訪/フリー周回**。出現位置・演出はspawnBountyEncounter共用。
        if (!danceTest && !indoor && !storyBoss && !tutorialStage && !noSpawn) {
          const bgs = useGameStore.getState();
          const bountyAliveNow = bgs.enemies.some(e => isBountyType(e.type));
          const bHiddenBossAlive = bgs.enemies.some(e => isHiddenBoss(e.type));
          const bAreaForGate = areaIndexForPos(player.x + player.width / 2, player.y + player.height / 2);
          // ★v0.25.3549: 「交戦中」ではなく「場に居るか」。城ボスは5:00に城へ湧くので、プレイヤーが
          // 着くまで bossFightNow=false のままで、その窓に繰り越しの賞金首が入り込んでいた。
          // 賞金首自身は除く(isGhostEligibleBoss=交戦ボス−賞金首)=同時1体の制御は bountyAlive が担う。
          const bBossAlive = bgs.enemies.some(e => isGhostEligibleBoss(e.type));
          const bBlocked = bountySpawnBlocked({
            bossFightNow: bgs.bossFightNow,
            bossAlive: bBossAlive,
            activeEvent: !!bgs.activeEvent,
            hiddenBossAlive: bHiddenBossAlive,
            redNightActive: bgs.redNight?.phase === 'active',
            area: bAreaForGate,
            storyBossOnly: storyBoss,
            labTheme,
            corridorMode: bgs.corridorMode,
            tutorialStage,
          });
          // ★v0.25.3550(社長裁定「b」=時刻優先): **コマ判定は廃止**。
          // 旧「通常コマでだけ出す(第5条)」は固定スケジュール(3:00/7:00)と位相が噛み合わず、
          // **180秒はどの通常コマにも入らない**ため賞金首①が構造的に3:00へ出られなかった
          // (詳細は bountyTick.ts の BountyNaturalSpawnInput.calmOk のコメント)。
          // v8.3(社長裁定2026-08-15「3分と7分にして」): CD方式を廃止し固定スケジュール
          // (BOUNTY_NATURAL_SPAWN_AT_MS=[3:00,7:00])。n回目の解禁時刻はspawnCountで表を引く。
          const bReady = bountyNaturalSpawnReady({
            gameTime: newGameTime,
            spawnCount: bountyNaturalRef.current.count,
            bountyAlive: bountyAliveNow,
            spawnBlocked: bBlocked,
          });
          const bStageType = BOUNTY_TYPE_BY_STAGE[getSelectedStageId()];
          if (bReady && bStageType) {
            // B-4裁定: 出現した個体は討伐/退場を問わず回数を消費(=消費は出現の瞬間に確定)。
            bountyNaturalRef.current.count += 1;
            spawnBountyEncounter(bStageType, newGameTime);
          }
        }

        // M2(研究所)のチュートリアル2件(社長指示v0.25.2251)。判定は src/utils/labTutorial.ts の
        // 純関数、表示は既存の showTutorialPopup(ゲーム停止)を流用。**端末に1度だけ**記憶する。
        //  1) PHILL銃を入手した時 = 狙いの合わせ方 + ヘッドショット2種(通常/吸い付き)
        //  2) 初めて敵に近づいた時(**見つかる前**) = 索敵と遮蔽物
        // v0.25.2626(社長裁定「ださない」): **ボスメーカーの部屋ではチュートリアルを出さない。**
        // 数字を詰める部屋でポップアップに割り込まれると(ゲームが止まる)調整が途切れる。
        if (labTheme && !indoor && !useGameStore.getState().bossMaker.active) {
          const st = useGameStore.getState();
          const gate = {
            popupOpen: st.tutorialPopup !== null,
            menuOpen: st.showShopMenu || st.showUpgradeMenu,
          };
          if (shouldShowPhillTutorial({
            ...gate,
            seen: seenTutorials().has('phill'),
            hasPhillGun: st.player.weapons.some(w => !w.isMelee && w.category === 'phill'),
          })) {
            showTutorialOnce('phill');
          } else if (!seenTutorials().has('scout')) {
            // 休眠中の敵までの最短距離。起床済みの敵は「もう見つかっている」ので数えない。
            let nearestDormantDist: number | null = null;
            const pcx = st.player.x + st.player.width / 2, pcy = st.player.y + st.player.height / 2;
            for (const e of st.enemies) {
              if (!e.dormant) continue;
              const d = Math.hypot(e.x + e.width / 2 - pcx, e.y + e.height / 2 - pcy);
              if (nearestDormantDist === null || d < nearestDormantDist) nearestDormantDist = d;
            }
            if (shouldShowScoutTutorial({ ...gate, seen: seenTutorials().has('scout'), nearestDormantDist })) {
              showTutorialOnce('scout');
            }
          }
        }

        // ステージ1の横スライド式フィールドガイド。新IDで旧「寄り道」既読とは分離し、全員へ新版を1度だけ出す。
        // 出撃会話が終わった後の最初の安全な瞬間に表示し、ボスメーカーのstage-1土台では発火させない。
        if (!seenTutorials().has('stage1-guide') && !useGameStore.getState().bossMaker.active) {
          const st = useGameStore.getState();
          if (shouldShowStage1Guide({
            stageId: (runStageIdRef.current ??= getSelectedStageId()),
            seen: false,
            popupOpen: st.tutorialPopup !== null,
            menuOpen: st.showShopMenu || st.showUpgradeMenu,
            dialogueActive: st.npcDialogue !== null || st.npcDialogueQueue.length > 0,
            gameTimeMs: newGameTime,
          })) {
            showTutorialOnce('stage1-guide');
          }
        }

        // チュートリアル: 随行NPC(軍人→衛生兵)の追従チェーン(社長指示v0.25.1823「基本プレイヤーに
        // ついてくる。軍人、衛生兵の順番」)。escorts流用・拠点前進/射撃はupdateSuppression側で停止済み。
        if (tutorialStage) {
          const st = useGameStore.getState();
          // 練習用の敵を1体出す(台本のHP設定つき)。ウェーブの初回も補充も同じ規則で出す
          // ——ここを分けると「2体目以降だけHPが素のまま」という食い違いが生まれる。
          const spawnM0Practice = (spawn: NonNullable<M0BeatDef['spawn']>, cx: number, cy: number) => {
            const p = useGameStore.getState().player;
            const e = spawnEnemyAt(spawn.type, cx + spawn.dx, cy + spawn.dy, newGameTime);
            if (spawn.meleeHits) {
              // 「**近接◯発で落ちる**」体力を台本側で作る。近接教習は2発(=3発目のクリに届かせない)、
              // クリ/キル教習は4発(=3発目でクリが出て、その後に仕留められる)。
              const mw = p.weapons.find(w => w.isMelee);
              e.health = e.maxHealth = Math.max(1, mw?.damage ?? 20) * spawn.meleeHits;
            } else if (spawn.type === 'zombie') {
              // 射撃教習: 「持っている弾でちょうど落ちる」体力。
              const gun = p.weapons.find(w => !w.isMelee && w.ammoType);
              if (gun) e.health = e.maxHealth = Math.max(1, gun.damage) * M0_SHOOT_ROUNDS;
            }
            addEnemy(e);
          };
          // 操作説明ポップアップ「移動」(v0.25.1830〜)。
          // 判定は純関数 `shouldShowMoveTutorial`(テスト可能な形に切り出してある)。
          // **M0は毎出撃で出す**(社長指示v0.25.2266「m0はずっとチュートリアル出る」)。
          // v0.25.2264で端末既読ゲートを入れたのは取り違えで撤回した。M2の2件(1度だけ)とは仕様が違う。
          if (shouldShowMoveTutorial({
            shownThisRun: st.tutorialPopupShown, // **端末既読は見ない**=M0は毎出撃で出す(社長指示v0.25.2266)
            popupOpen: st.tutorialPopup !== null,
            menuOpen: st.showShopMenu || st.showUpgradeMenu,
            gameTimeMs: newGameTime,
          })) {
            showTutorialOnce('move');
          }
          // 訓練中は**死なない**(社長指示v0.25.2302)。ダメージ側は store が HP1 で踏みとどまらせる
          // (`damagePlayer`)。ここは**その1秒後に衛生兵が全快させる**台本。
          //  - **ハンター以降も止めない**。ハンターのジャンプ攻撃は一撃が重く、そこで死ぬと台本が
          //    最初からやり直しになる(社長報告「ハンターのジャンプ攻撃でゲームオーバーになっちゃう」)。
          //  - 「1秒後」は**被弾を見せてから**救うため。即全快だと何が起きたか分からない。
          {
            if (m0PrevHpRef.current < 0) m0PrevHpRef.current = st.player.health;
            else if (st.player.health < m0PrevHpRef.current && m0HealAtRef.current === 0) {
              m0HealAtRef.current = newGameTime + M0_MEDIC_HEAL_DELAY_MS;
              st.tryNpcLine('ジュン', 'm0-heal', '治療します！', 4000);
            }
            if (m0HealAtRef.current > 0 && newGameTime >= m0HealAtRef.current) {
              m0HealAtRef.current = 0;
              useGameStore.setState(s2 => ({ player: { ...s2.player, health: s2.player.maxHealth } }));
            }
            m0PrevHpRef.current = useGameStore.getState().player.health;
          }

          // 開幕会話が「積まれ、流れ終わった」か。M0の台本はここを起点に動く。
          const m0ConvoDone = tutorialConvoQueuedRef.current && st.npcDialogueQueue.length === 0 && st.npcDialogue === null;
          // 前線(=ここより先へ進めない透明壁)。2つの制限のうち手前を採る:
          //  ①会話中は区域境界(1500)の手前で止める(社長指示v0.25.2294)
          //  ②未発火ビートの関門(社長指示v0.25.2297「その前までしか移動できないダンジョン」)。
          //    これで「敵を倒した直後に次が始まる」のではなく、**次の場所まで歩く一拍**が必ず挟まる。
          {
            // 戦闘中(練習の敵が生きている/残っている)は壁を外す=練習中は自由に動ける。
            const waveActive = st.enemies.length > 0 || (m0WaveRef.current?.remaining ?? 0) > 0;
            const gateX = m0AdvanceLimit(m0BeatsFiredRef.current, waveActive);
            const convoCap = m0ConvoDone ? null : M0_CONVO_ADVANCE_LIMIT_X;
            const limit = gateX === null ? convoCap : (convoCap === null ? gateX : Math.min(gateX, convoCap));
            if (st.m0AdvanceLimitX !== limit) useGameStore.setState({ m0AdvanceLimitX: limit });
          }

          // 練習の補充: 台本で出した敵を倒したら、残りがある限り**次を1体だけ**出す
          // (社長指示v0.25.2300「一気に出さずに順番に」)。ポップアップ表示中は出さない
          // (説明を読んでいる裏で湧かせない)。
          if (m0WaveRef.current && m0WaveRef.current.remaining > 0 && st.enemies.length === 0 && !st.tutorialPopup) {
            const w = m0WaveRef.current;
            w.remaining -= 1;
            spawnM0Practice(w.spawn, st.player.x + st.player.width / 2, st.player.y + st.player.height / 2);
          }

          // 区域の銘打ち(「◯◯区域 —— 踏破」)を**M0では区域を越えるたびに毎回**出す。
          //  - 本編の踏破儀式は `isFirstWallBreach`=**端末で初回1回きり**(`wallMeta`は永続)なので、
          //    2回目以降の出撃では**そもそも発火しない**(社長報告v0.25.2310「エリア移動の演出出ない」/
          //    v0.25.2313「デンジャーゾーンの演出がない」)。M0は毎出撃で教習が出るステージなので、
          //    記録に関係なく**自前で出す**。`wallMeta`(記録側)は触らない=本編の「初回だけ」は不変。
          //  - **説明を読んでから**出す(社長指示v0.25.2305)。境界を越えた直後はポップアップで
          //    ゲームが止まる一方、銘打ちは**実時間の setTimeout(4秒)**で進むため、読んでいる間に
          //    終わってしまう。→ ポップアップが閉じるまで待ち、一拍おいてから出す。
          {
            const zoneNow = areaIndexForPos(st.player.x + st.player.width / 2, st.player.y + st.player.height / 2);
            if (m0ZoneRef.current < 0) m0ZoneRef.current = zoneNow; // 初期化(出撃直後の区域)
            else if (zoneNow > m0ZoneRef.current) {
              m0ZoneRef.current = zoneNow;
              m0WallHoldRef.current = { zone: zoneNow, at: 0 };
              useGameStore.setState({ wallEventQueue: [] }); // 初回出撃で自然発火した分は下ろす(二重に出さない)
            }
            const hold = m0WallHoldRef.current;
            if (hold && useGameStore.getState().tutorialPopup === null) {
              if (hold.at === 0) hold.at = newGameTime + M0_AREA_CEREMONY_DELAY_MS; // 説明を閉じた=一拍の起点
              else if (newGameTime >= hold.at) {
                const name = AREA_ZONE_NAMES[hold.zone] ?? AREA_ZONE_NAMES[AREA_ZONE_NAMES.length - 1];
                useGameStore.getState().enqueueWallEvent('depth', `${name} —— 踏破`, 'TRESPASS', '#bfe3ff');
                m0WallHoldRef.current = null;
              }
            }
          }

          // 演習中に強制クリが出たか(近接ヒット数が3の倍数へ到達=その一撃がクリだった)。
          if (st.m0CritDrill && st.m0MeleeHits > 0 && st.m0MeleeHits % M0_FORCED_CRIT_AT_HIT === 0) {
            m0CritLandedRef.current = true;
          }
          // 後回しにしていた説明(クリ教習)を、最初のクリの**演出が出てから**出す。
          {
            const late = m0LatePopupRef.current;
            if (late && m0CritLandedRef.current && st.tutorialPopup === null) {
              if (late.at === 0) late.at = newGameTime + late.delayMs;
              else if (newGameTime >= late.at) { showTutorialOnce(late.id); m0LatePopupRef.current = null; }
            }
          }

          // 教習ビート(TUTORIAL_STAGE.md「M0 チュートリアル進行案」・社長裁定v0.25.2286〜2291)。
          // 一本道で戻れないので「xを通過したら発火」で順序が保証される。判定は純関数 `nextM0Beat`。
          // 付随イベント=敵を1体だけ湧かせる(M0は自動湧きを全停止済み=v0.25.1814なので、
          // ここで出したものだけが出る)。ポップアップ表示中はゲームが止まるので、
          // **先に敵を置いてから説明を出す**=閉じた瞬間に実物が目の前に居る。
          {
            const beat = nextM0Beat({
              playerX: st.player.x + st.player.width / 2,
              playerLevel: st.player.level,
              popupOpen: st.tutorialPopup !== null,
              menuOpen: st.showShopMenu || st.showUpgradeMenu,
              // M0は自動湧きが無いので、生きている敵=台本で出した敵。
              convoDone: m0ConvoDone,
              scriptedEnemyAlive: st.enemies.length > 0,
              scriptedWaveRemaining: m0WaveRef.current?.remaining ?? 0,
              fired: m0BeatsFiredRef.current,
            });
            // 先に見せたい演出があるビート(区域の銘打ち等)は、条件成立から delayMs だけ待つ。
            // 待たずに出すと、ポップアップがゲームを止めている間に**実時間で進む演出**が
            // 終わってしまう(社長報告v0.25.2297「エリアタイトル表示が一瞬すぎて見えない」)。
            if (beat?.delayMs && m0PendingRef.current?.id !== beat.id) {
              m0PendingRef.current = { id: beat.id, at: newGameTime + beat.delayMs };
            }
            const pending = beat?.delayMs ? m0PendingRef.current : null;
            if (beat && (!pending || newGameTime >= pending.at)) {
              m0BeatsFiredRef.current.add(beat.id);
              const pcx = st.player.x + st.player.width / 2;
              const pcy = st.player.y + st.player.height / 2;
              // 解禁(社長指示v0.25.2293「解禁されるまで封印」)。近接はこのビートで初めて振れるようになる。
              if (beat.unlock === 'melee') {
                useGameStore.setState(s2 => ({ m0Unlocked: { ...s2.m0Unlocked, melee: true } }));
              }
              // 弾を拾う教習に来て初めて、ランダムな弾薬ドロップを解禁する(社長指示v0.25.2319)。
              if (beat.unlock === 'ammo') {
                useGameStore.setState(s2 => ({ m0Unlocked: { ...s2.m0Unlocked, ammo: true } }));
              }
              // クリティカル演習の入切。教習が変わるたびに**ヒット数を0へ戻す**=「3発ごと」が
              // 前の教習から持ち越されない(持ち越すと次の教習の1発目でいきなりクリが出る)。
              useGameStore.setState({ m0CritDrill: beat.critDrill === true, m0MeleeHits: 0 });
              m0CritLandedRef.current = false;
              // 掛け声(左上の通信)。**説明より先に、なぜ今それが要るのかを言う**。キュー直積みで順番を保証。
              if (beat.callouts?.length) {
                useGameStore.setState(s2 => ({
                  npcDialogueQueue: [...s2.npcDialogueQueue, ...beat.callouts!.map(c => ({ name: c.speaker, text: c.text }))],
                }));
              }
              if (beat.spawn) {
                // **一気に出さず1体ずつ**(社長指示v0.25.2300「3体ずつくらい倒させて練習させてあげる」)。
                // 残りは m0WaveRef に積み、倒されるたびに下の補充ブロックが次を1体出す。
                const total = beat.spawn.count ?? M0_PRACTICE_COUNT;
                m0WaveRef.current = { spawn: beat.spawn, remaining: total - 1 };
                spawnM0Practice(beat.spawn, pcx, pcy);
                // 射撃ビートは弾を「**練習ぶんをちょうど撃ち切る**」量に詰め直す(社長台本v0.25.2293)。
                // 偶然に頼らず、次が近接になる理由を台本側で作る。装填のみ・予備弾は0。1体あたり
                // `M0_SHOOT_ROUNDS` 発で落ちるHPにしてあるので、合計は「発数×体数」でちょうど尽きる。
                if (beat.id === 'shoot') {
                  const gun = st.player.weapons.find(w => !w.isMelee && w.ammoType);
                  if (gun) {
                    useGameStore.setState(s2 => ({
                      player: {
                        ...s2.player,
                        ammoHandgun: 0, ammoShotgun: 0, ammoRifle: 0,
                        weapons: s2.player.weapons.map(w => (w.id === gun.id ? { ...w, magazine: M0_SHOOT_ROUNDS * total } : w)),
                      },
                    }));
                  }
                }
              }
              if (beat.id === 'melee') {
                // 「弾切れ」を**確実に**作る(社長台本v0.25.2293「都合よく倒せて弾も切れる」)。
                // 散弾のように想定より早く倒せてしまう銃でも、ここで空にすることで台本が崩れない。
                useGameStore.setState(s2 => ({
                  player: {
                    ...s2.player,
                    ammoHandgun: 0, ammoShotgun: 0, ammoRifle: 0,
                    weapons: s2.player.weapons.map(w => (w.isMelee ? w : { ...w, magazine: 0 })),
                  },
                }));
              }
              if (beat.id === 'hunter') {
                // デンジャー入場(r>=3000)でハンターを**右上=通行できる最上**(縦の透明壁の上端)に出す
                // (社長指示v0.25.2287)。**そこを通らないと先へ行けない**配置で、縦の可動域(±100px)より
                // ジャンプ射程(500)の方がはるかに広いので、避けようがない=ほぼ確実に被弾する。
                // 索敵は飛ばして「見つかっている」状態から始める(既存の凶悪ハンターと同じ扱い)。
                const h = spawnEnemyAt('hunter', pcx + M0_HUNTER_AHEAD_PX - 28, -TUTORIAL_MOVE_Y_LIMIT_PX - 32, newGameTime);
                h.fixed = true;   // 屋外リサイクル/カリングの対象外=イベント側で寿命を持つ
                h.vx = 0; h.vy = 0;
                h.hunterAlerted = true;
                addEnemy(h);
              }
              if (beat.id === 'ammo') {
                // 追われながら拾わせる弾薬を1つだけ置く(社長指示v0.25.2286「5で弾補充」)。
                // 弾種は構えている銃に合わせる(クラスによって違うため決め打ちにしない)。
                const gun = st.player.weapons.find(w => !w.isMelee && w.ammoType);
                const at = gun?.ammoType;
                if (at === 'handgun' || at === 'shotgun' || at === 'rifle') {
                  st.addPickup({
                    id: `m0-ammo-${newGameTime}`,
                    x: pcx + M0_AMMO_AHEAD_PX, y: pcy - 8,
                    type: `ammo-${at}` as 'ammo-handgun' | 'ammo-shotgun' | 'ammo-rifle',
                    value: 0,
                  });
                }
              }
              // 説明を後回しにするビート(クリ教習)は、ここでは出さない=**先に演出を見せる**。
              if (beat.popupAfterCrit) m0LatePopupRef.current = { id: beat.tutorial, delayMs: beat.delayMs ?? 700, at: 0 };
              else showTutorialOnce(beat.tutorial);
            }
          }
          // 左壁(スタートから−100px)に突っ込んでいる間、軍人が窘める(社長指示v0.25.1829
          // 「軍人NPCが『そっちじゃないぞ。』という」)。カテゴリCD6秒=押し続けても連発しない。
          {
            const pcxNow = st.player.x + st.player.width / 2;
            if (st.player.isMoving && pcxNow <= TUTORIAL_MOVE_X_MIN_PX + 6) {
              // 話者=グレッグ(社長指示v0.25.1853。正史M0のキャスト確定に伴い仮名「軍人」を廃止。
              // NPC_PORTRAIT登録済み=会話の立ち絵も出る)。
              st.tryNpcLine('グレッグ', 'tutorial-left-wall', 'そっちじゃないぞ。', 6000);
            }
            // M0序盤会話(正史STORY_M0_M3.md・グレッグ2行→ジュン2行): 「移動」ポップアップを
            // 閉じた直後に、左上の通信(NpcDialogue=時間停止なし・軍人セリフと同じ枠)で1行ずつ流す
            // (社長指示v0.25.1838「時間を止めて会話するシーンは存在しません!左上の通信です」。
            // 旧v0.25.1837のVNボックス=startIntroDialogueは廃止)。キュー直積み=tryNpcLineの
            // 詰まり防止キャップ(3)を通さず4行を確実に順次再生。CD類にも触らない。
            // v0.25.2264: 旧条件は `st.tutorialPopupShown`(=移動ポップアップを出したか)だった。
            // 既読で出さない場合にこのフラグが立たず、**序盤会話が永久に流れなくなる**ため、
            // 「移動を出すタイミングを過ぎた かつ ポップアップが閉じている」に変更した(出ても出なくても成立)。
            if (!tutorialConvoQueuedRef.current && newGameTime >= M0_MOVE_TUTORIAL_AT_MS && !st.tutorialPopup && st.introDialogueLines.length > 0) {
              tutorialConvoQueuedRef.current = true;
              useGameStore.setState(s2 => ({
                npcDialogueQueue: [
                  ...s2.npcDialogueQueue,
                  ...s2.introDialogueLines
                    .filter(l => l.speaker && !l.speaker.startsWith('__'))
                    .map(l => ({ name: l.speaker as string, text: l.text })),
                ],
              }));
            }
          }
          // 敵が居る間は追従しない=**2人が前に出て撃つ**(updateSuppression のM0分岐が動かす)。
          // ここで追従チェーンも動かすと、前へ出た2人を毎フレーム引き戻して押し合いになる。
          if (st.escorts.length && st.enemies.length === 0) {
            const pcx0 = st.player.x + st.player.width / 2;
            const pcy0 = st.player.y + st.player.height / 2;
            const next = stepFollowChain({ x: pcx0, y: pcy0 }, st.escorts, deltaTime, st.player.speed * FOLLOW_SPEED_MULT);
            const changed = next.some((b, i) => {
              const a = st.escorts[i];
              return a.x !== b.x || a.y !== b.y || a.face !== b.face || (a.moving ?? false) !== (b.moving ?? false);
            });
            if (changed) {
              useGameStore.setState({
                escorts: st.escorts.map((e, i) => ({ ...e, x: next[i].x, y: next[i].y, face: next[i].face, moving: next[i].moving })),
              });
            }
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
          // ★社長指示v0.25.3618「拠点解放のSEを今のじゃなくて、エリア踏破と同じやつにして」:
          // base-capture → event-clear(エリア踏破の銘打ち・:4398 と同じ音)。素材base-captureは残置。
          if (cc > suppCaptureCountRef.current) playSfx('event-clear');
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
          } else if (activeGateRef.current !== null) {
            // 社長指示v0.25.1666「ゲートを超えない限りエリア切替を発動しない」: ゲート戦闘中は深層BGMの切替を凍結。
            // ゲート2の境界(=DEEP_BGM_D=7500)の上にアリーナが張られるため、戦闘中に境界を行き来すると深層BGMが
            // prep↔deep で行ったり来たりしていた(=「エリアが行ったり来たり」の正体)。ゲート中は現在フェーズを保持し、
            // ゲートを超えて(クリアして)から通常判定へ戻す。区域バナー/年表は既に activeGate 中スキップ済み。
          } else if (phase === 'shallow') {
            if (dist >= DEEP_BGM_D - 400) { prepareDeepReverseBgm(); deepBgmPhaseRef.current = 'prep'; }
          } else if (phase === 'prep') {
            // 社長報告v0.25.1670「ゲート2入った時、まだ深層域に入っちゃってる」: ゲート2は境界(7500)を跨いだ後に
            // 発火するため、跨いだ瞬間〜発火までの隙間で deep へ進んでいた(凍結v1666はその後の固定しかできない)。
            // → ゲート2を倒すまで(gate2Cleared=false)は deep へ進まない(prepで待機=先読みは維持)。
            const deepAllowed = !GATE_ENABLED || gateMetaRef.current.gate2Cleared;
            if (dist >= DEEP_BGM_D && deepAllowed) { enterDeepReverseBgm(); deepBgmPhaseRef.current = 'deep'; }
            else if (dist < DEEP_BGM_D - 600) { releaseDeepReverseBgm(); deepBgmPhaseRef.current = 'shallow'; }
          } else { // deep
            if (dist < DEEP_BGM_D - 200) { exitDeepReverseBgm(); deepBgmPhaseRef.current = 'prep'; }
          }
        }

        // ゲート戦闘中フラグをstoreへ反映(描画側=深層域セピアがゲート中はエリア切替を凍結するため・社長指示v0.25.1667)。
        // 変化時だけ set(毎フレームの set churn を避ける)。
        {
          const gateActiveNow = activeGateRef.current !== null;
          if (gateActiveNow !== gateActivePrevRef.current) {
            gateActivePrevRef.current = gateActiveNow;
            useGameStore.setState({ gateActive: gateActiveNow });
          }
          // ゲート2未クリアの間は深層演出(セピア)をロック(社長報告v0.25.1670)。クリアの瞬間に解除→演出が入る。
          const deepLockedNow = GATE_ENABLED && !gateMetaRef.current.gate2Cleared;
          if (deepLockedNow !== deepLockedPrevRef.current) {
            deepLockedPrevRef.current = deepLockedNow;
            useGameStore.setState({ deepZoneLocked: deepLockedNow });
          }
        }

        // --- 死神(深奥リスク)システム v1 ---
        // 原点(スタート/商人付近)から遠いほど死神が画面を横切り、深奥に長居すると完全出現して追跡する。
        // 横切り=無害な演出(reaperCross をセット→pixiScene が描画)、追跡=本物の reaper 敵。
        // 研究所スキンは「ラボ敵以外は沸かない」(社長指示)=死神も出さない。ストーリーボス専用ランも同様。
        // 洋館通路(corridorMode)の死神は v0.25.2144 で復活(社長指示「時間で出るのは死神だけ」=
        // v0.25.2130の「死神なし」裁定を撤回。ゴール設置済みなので時間切れの圧として死神を使う)。
        // 区域バナー/壁踏破/ゲート予約は下の内側ゲート(!corridorMode)が引き続きスキップする。
        if (!danceTest && !indoor && !labTheme && !storyBoss && !tutorialStage && !noSpawn) {
          const rs = reaperRef.current;
          const pcx = player.x + player.width / 2;
          const pcy = player.y + player.height / 2;
          const depth = REAPER_TEST ? REAPER_CONFIG.extremeDepthPx + 1 : Math.hypot(pcx, pcy);

          // --- エリア(区域)遷移バナー: 距離帯を跨いだら区域名を表示(イベント発生と同じUI) ---
          // ゾーン判定は ZONE_CHECK_INTERVAL フレームに1回(間引き)。
          // 洋館通路(corridorMode)はエリア構造なし(v0.25.2128・社長指示)=バナー/壁踏破/ゲート予約を丸ごとスキップ
          // (ステータス面はareaIndexForPosが未確認固定を返す)。
          if (!useGameStore.getState().corridorMode && zoneTickRef.current % ZONE_CHECK_INTERVAL === 0) {
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
                // §5.21-追補9(社長指示v0.25.1655「ゲート2のボスを倒すまでは深層域に到達したことに
                // しない=倒すまではエリア移動しない」): このクロスが未クリアのゲート(1=未確認汚染/
                // 2=深層)で塞がれる踏破なら、区域到達の告知・記録(バナー/年表/SE)を保留し、ゲート
                // クリア時(=ボス討伐後)にまとめて出す。判定は下の踏破(markWallBreached)側と同一条件で統一。
                const wallIdxCrossed = detectWallBreach(prevZone, zoneIdx);
                const gateBlocksThisWall = GATE_ENABLED && (
                  (wallIdxCrossed === 3 && !gateMetaRef.current.gate1Cleared) ||
                  (wallIdxCrossed === 4 && !gateMetaRef.current.gate2Cleared)
                );
                // 社長決定v0.25.1669: ゲート1が(恒久)クリア済みで境界(壁3)を素通りした場合も「このランで通過」と
                // みなす=凶悪ハンター解放(戦闘が無いランでも通過扱い)。未クリア時はゲートクリア側で立てる。
                if (wallIdxCrossed === 3 && !gateBlocksThisWall) {
                  gate1PassedThisRunRef.current = true;
                }
                if (!gateBlocksThisWall) {
                  useGameStore.setState({ eventBannerText: AREA_ZONE_NAMES[zoneIdx], eventBannerUntil: newGameTime + AREA_BANNER_MS });
                  // 歴史年表: より深い区域へ初めて到達したら即載せ(社長決定v0.25.1628)。dedup=区域index。
                  // 浅い側へ戻る移動(zoneIdx<prevZone)は「到達」ではないので記録しない。
                  if (zoneIdx > prevZone) {
                    recordChronicle(getSelectedStageId(), 'zone', String(zoneIdx), `${AREA_ZONE_NAMES[zoneIdx]}に到達`);
                  }
                  // 区域遷移音は「遠ざかる移動(外側=より深い区域へ)」のときだけ鳴らす。
                  // 外側から内側へ戻る(zoneIdx が小さくなる)ときは鳴らさない(社長指示)。
                  // 仕様変更(v0.25.1523): 1プレイ(1ラン)中1エリア1回まで(往復で同じ区域に再度届いても鳴らさない)。
                  if (zoneIdx > prevZone && !zoneSfxPlayedRef.current.has(zoneIdx)) {
                    zoneSfxPlayedRef.current.add(zoneIdx);
                    playSfx('event-start');
                  }
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
                  const wallIdx = wallIdxCrossed; // 上で算出済み(踏破先ゾーンindex or null)を共用
                  if (wallIdx) {
                    syncWallDepth(Math.hypot(pcx, pcy)); // 踏破の瞬間の距離も自己最深として反映
                    // gateBlocksThisWall は上(区域告知の保留判定)と同一=踏破儀式も同条件でガード。
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
              playSfx('reaper-pass'); // 短い不穏音(社長提供・v0.25.3665で専用アセット配置)
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

            // 時間による出現(社長指示): 15分経過後、20秒ごとに抽選。確率=10%+(15分以降の経過分×10%)で最大100%。
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

        // juice(flashy unified boss death): getsDramaticDeath 対象(ボス系/ネームド/クエスト対象)の
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
            if (Date.now() - corpse.diedAt >= (corpse.holdMs ?? 0) + BOSS_FADE_MS) useGameStore.setState({ bossCorpse: null }); // v0.25.2955: hold(無傷保持)の尺を足す
          }
        }

        // ?gateboss=1 診断(PACING_PUZZLE.md §5.21-追補8): ラン開始直後、そのステージのゲート2ボス型を
        // 実ゲート2と同じ形でforce-spawnして即テストできるようにする。将来ステージが増えたら
        // GATE2_BOSS_TYPE_BY_STAGE に足すだけで対応する。既定OFF=通常挙動不変。
        // 実機バグ修正(社長報告v0.25.1593「開始位置的にこっちが強制的に食らって即死」): 旧実装は
        // ボスをプレイヤーの真上(gcx-24,gcy-24)に出していた=接触ダメージ190で即死。実ゲート2と同じく
        // ①拘束サークル(beginArenaEvent)を張り ②ボスは周回半径ぶん離した位置(中心の上方)へ出す。
        // 実機バグ修正(社長報告v0.25.2610「すりぃえるのボスモード、強制的に上に歩かされて何もできない」):
        // 発火条件は bossTest.ts の純関数 canForceGateBossNow へ切り出した(理由と再発防止の掟は同ファイル)。
        // 要点だけ: **洋館(ステージ6)の走り込み入場が終わるまで待つ**。走り込み中は入力が奪われており、
        // そこへ拘束サークル+ボスを出すと「強制的に上へ歩かされながら殴られ続ける」状態になっていた。
        if (canForceGateBossNow({
          forceParamOn: FORCE_GATEBOSS || practiceForces('gateboss'),
          alreadySpawned: gatebossForceRef.current,
          danceTest, indoor, labTheme,
          corridorRunInActive: useGameStore.getState().corridorRunInActive,
          gameWon: useGameStore.getState().gameWon,
        })) {
          const gbType = GATE2_BOSS_TYPE_BY_STAGE[getSelectedStageId()];
          if (gbType) {
            gatebossForceRef.current = true;
            const gcx = player.x + player.width / 2;
            // ★v0.25.3195(社長報告「スリィエルのボスモード時、スタートの下に移動できないので実質半分
            // しか移動可能な部分がない」): 洋館通路(corridorMode)はスタート地点が移動可能帯の南端。
            // 中心をプレイヤー位置に置くとサークルの下半分が移動不能域に食い込む=実質半円になる。
            // ⇒ 通路では中心を**北へ radius ぶんずらして**、円全体が歩ける側に載るようにする
            //   (南端に少し余白 CORRIDOR_GATEBOSS_SOUTH_PX を残す=開始位置が円のふち)。他ステージは従来どおり。
            const CORRIDOR_GATEBOSS_SOUTH_PX = 60;
            const gcy = (player.y + player.height / 2)
              - (useGameStore.getState().corridorMode ? GATE_ARENA_RADIUS - CORRIDOR_GATEBOSS_SOUTH_PX : 0);
            // 拘束サークル=中心=プレイヤー開始位置(実ゲート2と同じ。プレイヤーは円内に留まりミゲルと戦える)。
            const gEvent = { kind: 'boss' as const, x: gcx, y: gcy, radius: GATE_ARENA_RADIUS, startedAt: newGameTime, endsAt: newGameTime + GATE2_BOSS_DURATION_MS };
            useGameStore.getState().beginArenaEvent(gEvent); // 敵一掃を含むのでボス配置の前に呼ぶ
            // ボスは中心の上方=周回半径ぶん離して出す(即接触死を防ぐ)。実ゲート2と同じ offset 式。
            const gbx = gcx + Math.cos(-Math.PI / 2) * GATE_ARENA_RADIUS * 0.5;
            const gby = gcy + Math.sin(-Math.PI / 2) * GATE_ARENA_RADIUS * 0.5;
            const gboss = spawnEnemyAt(gbType, gbx - 24, gby - 24, newGameTime);
            // research/STAGE_DIFFICULTY.md: 天使のスポーン2箇所目(練習/デバッグ)。実ゲート2と同じ係数を掛ける
            // (練習ランは枠のstageIdが getSelectedStageId から返る=実戦と同じ値になる)。
            {
              const gbMult = stageBossDiffMults();
              gboss.health = gboss.maxHealth = Math.round(gboss.health * gbMult.hp);
              gboss.damage = Math.round(gboss.damage * gbMult.dmg);
            }
            gboss.fromEvent = true; // ×5は掛けない=基本値(実ゲート2と揃える・社長指示v0.25.1595)
            gboss.bossState = 'chase';
            gboss.bossNextActionAt = newGameTime + 2000;
            gboss.homeX = gcx; gboss.homeY = gcy; // 周回の中心=ゲート中心
            addEnemy(gboss);
            // §6.36 監査指摘7: 練習/デバッグの強制ゲートボスも実ゲート2と同じ出現カットイン(体験を揃える)。
            useGameStore.getState().triggerAttention(gbx, gby, bossCutinPayload(gbType));
            activeGateRef.current = 2; // 実ゲート2相当(エリア判定OFF等)。テスト用途。
          }
        }

        // --- 裏ボス(深層域の隠しボス: ステージ1=ミーミル / ステージ3=ヨルムンガルド) ---
        // 仕様(社長指示): 深層域の指定エリアに近づくと1回だけ出現→「危険!直ちに避難を」。
        //  追跡/攻撃(3連発・全方位16発・たまにダッシュ)。ズーム後の画面外が3秒続くと巣へ戻りつつ回復。
        //  拡張した深層戦闘域を3秒出ると帰巣して退場。追いかけてくる間は他敵が一斉に逃げる。
        //  討伐で「<名前>討伐!」+FF風フェードアウト。移動/攻撃はこのコントローラが座標を直接書き込む。
        // ★v0.25.3573(ボスメーカー第4弾): 部屋(?bossmaker=1)では **store の hiddenBoss を立てない**
        // まま、このコントローラだけを回す。store へ書くと寄り道POIの「ボスの巣」マーカーや
        // ゲームオーバー画面の表記まで生えて §2-5「部屋にはプレイヤーとボスだけ」が壊れるため、
        // ここのローカル変数だけで補う(通常プレイでは BOSS_MAKER=false なので1バイトも変わらない)。
        const hiddenBoss = useGameStore.getState().hiddenBoss
          ?? (BOSS_MAKER && isHiddenControllerBoss(BOSS_MAKER_BOSS) ? BOSS_MAKER_BOSS : null);
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
              eventBannerText: `${enemyDeathLabel(hiddenBoss)}を討伐`,
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
            if (!bs.spawned && (FORCE_HIDDEN_BOSS || practiceForces('bossnow') || nearLair) && !useGameStore.getState().attention && !isGameTimeStopped()
                && !useGameStore.getState().activeEvent) { // 囲い系イベント中は裏ボスを出さない(重なると逃走で詰み=終わらない・社長報告)
              const e = spawnEnemyAt(hiddenBoss, 0, 0, newGameTime);
              // research/STAGE_DIFFICULTY.md: ステージ係数(裏ボスのスポーンはこの1箇所=自然/強制共通)。
              // 計測路(ボスメーカー/ガントレット)ではヘルパが1.0を返す。
              {
                const hbMult = stageBossDiffMults();
                e.health = e.maxHealth = Math.round(e.health * hbMult.hp);
                e.damage = Math.round(e.damage * hbMult.dmg);
              }
              let cx: number, cy: number;
              if (FORCE_HIDDEN_BOSS || practiceForces('bossnow')) {
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
              bs.spawned = true; bs.bossId = e.id; bs.retreating = false; bs.disengageSince = undefined;
              bs.homeX = e.x; bs.homeY = e.y; bs.lastX = e.x; bs.lastY = e.y; bs.w = e.width; bs.h = e.height;
              useGameStore.getState().triggerAttention(cx, cy, bossCutinPayload(e.type)); // §6.36 出現カットイン付き
              playSfx('boss-appear'); // 裏ボス出現アテンションSE(社長提供)
              useGameStore.setState({ eventBannerText: '危険!直ちに避難を', eventBannerUntil: newGameTime + 3000 });
              useGameStore.getState().triggerShake(REAPER_SUMMON_SHAKE_MS, REAPER_SUMMON_SHAKE_MAG);
              spawnFlash('rgba(120,20,40,0.30)', 360);
            }
          } else if (boss && (!useGameStore.getState().bossMaker.paused || hiddenBossPlaybackActive())) {
            // ボスメーカーの「停止」トグル: ボスの時間だけ止める(絵を止めて見たい時)。プレイヤーは
            // 動けるまま=当たり判定の位置関係を落ち着いて確かめられる。停止中でも「個別再生」の間だけは
            // 時間を進める(社長要望v0.25.2625)。★idol/賞金首/天使と同じ形(BOSS_MAKER.md §6-1)。
            // bossMaker.paused は部屋以外では常に false なので、通常プレイの挙動は変わらない。
            // ボスメーカー: 単独再生の立ち下がり(1)=**状態機械の前**。気絶/カウンター/割り込みで技が
            // 消された時の受け皿(これが無いと再生中フラグが立ちっぱなしになり ⏸ が二度と効かなくなる)。
            settleHiddenBossPlayback(boss.bossState);
            bs.lastX = boss.x; bs.lastY = boss.y; bs.w = boss.width; bs.h = boss.height;
            const gb = useGameStore.getState().gameBounds;
            const bcx = boss.x + boss.width / 2, bcy = boss.y + boss.height / 2;
            // ボス戦の実画角と同じ距離/体格プロファイルで可視矩形を拡張する。
            // 旧判定はズーム前の固定矩形だったため、0.58まで引いた時に「まだ見えているのに画面外」になっていた。
            // §6.37 v4-3(PACING_PUZZLE.md §6.37-3): stage-2(lab)/stage-6(洋館)はボス距離ズーム対象外。
            // pixiSceneのボスカメラループと同一条件でゲートする(判定と絵の不一致を作らない)。
            // 算出条件のみの変更=isPointInZoomedViewportの判定式そのものは不変(掟)。
            const bossZoomExcluded = labTheme || useGameStore.getState().corridorMode;
            const bossViewZoom = bossZoomExcluded ? 1 : bossDistanceZoomTarget(
              boss.type, aabbGapDistance(player, boss), boss.isStoryBoss === true,
              { dxCenter: bcx - (player.x + player.width / 2), dyCenter: bcy - (player.y + player.height / 2), viewport: gb },
            );
            // v0.25.3018(社長裁定・案A): 帰巣の圏内判定は**プレイヤー中心の一律距離**(正方形・
            // 半径=画面長辺の半分+余白・引きズームで1/z拡大)。旧カメラ窓基準(v3005の正方形化を含む)は、
            // カメラが北を向く構図(v2994〜)で北≈2400/横≈1400/南≈700pxと方向で距離感が激変していた
            // (社長報告「縦と横で戦線離脱の距離感全然違う」)。縦横南北すべて同じ距離で粘る。
            const keepR = bossRetreatKeepRadiusPx(gb, bossViewZoom);
            const kpcx = player.x + player.width / 2, kpcy = player.y + player.height / 2;
            const onScreen = Math.abs(bcx - kpcx) <= keepR && Math.abs(bcy - kpcy) <= keepR;
            const inDeep = FORCE_HIDDEN_BOSS || practiceForces('bossnow') || BOSS_MAKER || depth >= BOSS_EXIT_DEPTH; // テスト時/ボスメーカーの部屋は深層域判定を無視(浅い場所でも帰巣しない)
            // v0.25.2971(社長裁定・案A/テストチャット診断): 技の実行中も**離脱の時計は進める**。
            // v0.25.2962の「技中は時計停止」はボスが時間の6〜8割を技で過ごすため時計が実質永久停止し、
            // どれだけ逃げても帰巣しない真因になっていた(実測: 猶予1200msに対し最大到達567ms)。
            // v0.25.2962の本来の目的(消える技での誤警告)は**警告バナーの抑制だけ**で守る。
            // 誤帰巣の心配は実質ない: 帰巣には「画面外に1.2秒居続ける」が必要で、技の大半は
            // プレイヤーへ向かう=画面内に戻るため、成立するのは本当に逃げ切った時だけ。
            const bossInTechnique = boss.bossState !== undefined && boss.bossState !== 'chase' && boss.bossState !== 'return';
            // v0.25.3057(社長裁定「全ボス共通。ゲートは関係無いかもだが」): 城ボスと同じ
            // **実距離1500px(BOSS_LEASH_PX)**の離脱条件を裏ボス4体+トールにも追加(OR条件)。
            // 既存の「深層外へ出た/画面外に出た」も従来どおり生かす。ゲートボス(天使)・偶像は
            // 囲い/ラボ内の戦闘=1500pxが開かないため対象外(社長の言葉どおり)。
            const farFromPlayer = Math.hypot(bcx - kpcx, bcy - kpcy) > BOSS_LEASH_PX;
            const disengage = advanceBossDisengageGrace(!inDeep || !onScreen || farFromPlayer, bs.disengageSince, newGameTime);
            bs.disengageSince = disengage.since;
            if (disengage.started && !bossInTechnique) {
              useGameStore.setState({
                eventBannerText: '危険：ボスが戦闘域を離れようとしている',
                eventBannerUntil: newGameTime + 2000,
              });
            }
            const speed = boss.speed * bossSlowMult(boss, newGameTime); // クリ半減(v0.25.2422)
            // 裏ボスは updateEnemies を素通りするため、移動テンポ(ゲームスピード1.2倍)がここには自動で乗らない。
            // 通常敵と揃えるため、移動の位置更新/慣性は bossMoveDt(= deltaTime × MOVE_SPEED_MULT)を使う(社長指示)。
            // 回復(BOSS_REGEN)やタイマー等は素の deltaTime のまま(テンポの対象外)。
            const bossMoveDt = deltaTime * MOVE_SPEED_MULT;
            const fireBullet = (tx: number, ty: number) => addProjectile(createEnemyProjectile(boss, player, tx, ty));

            const patch: Partial<typeof boss> = {};
            let chasing = false;
            let despawn = false;

            // PACING_PUZZLE.md §6.28-5/7/9/10(バッチM54/M56/M58/M59): 裏ボス4体共通のHP段階トラッカー。
            // giantPhase(giant専用)とは別に既存の bossPhase(L2で新設・汎用)を流用する。フェーズ移行の
            // 瞬間だけ HIDDEN_BOSS_PHASE_FLASH_MS だけHPバーを点滅させる(社長裁定6.26-9 #4の踏襲)。
            // 該当ボスのスクリプトが無効(?<boss>script=0)の間は phase=1 固定=旧挙動(フェーズなし)。
            {
              const hpFrac0 = boss.maxHealth > 0 ? boss.health / boss.maxHealth : 1;
              let hiddenPhase: 1 | 2 | 3 = 1;
              if (boss.type === 'mimir' && MIMIR_SCRIPT_ENABLED) hiddenPhase = mimirPhaseForHealth(hpFrac0);
              else if (boss.type === 'jormungand' && JORMUNGAND_SCRIPT_ENABLED) hiddenPhase = jormungandPhaseForHealth(hpFrac0);
              else if (boss.type === 'skadi' && SKADI_SCRIPT_ENABLED) hiddenPhase = skadiPhaseForHealth(hpFrac0);
              else if (boss.type === 'thor' && THOR_SCRIPT_ENABLED) hiddenPhase = thorPhaseForHealth(hpFrac0);
              if (phaseJustChanged(boss.bossPhase, hiddenPhase)) {
                patch.bossPhaseFlashUntil = newGameTime + HIDDEN_BOSS_PHASE_FLASH_MS;
              }
              patch.bossPhase = hiddenPhase;
            }

            // トール専用: 弾を持たないため、画面外からの攻撃(この時点のonScreen=false)を連続で
            // 被弾したらジャンプ攻撃で間合いを詰める(社長修正指示)。他の裏ボスでは無害(参照されない)。
            if (boss.type === 'thor') {
              const prevHp = bs.thorPrevHealth;
              if (prevHp >= 0 && boss.health < prevHp && !onScreen) {
                bs.thorRangedHits.push(newGameTime);
              }
              bs.thorRangedHits = bs.thorRangedHits.filter(t => newGameTime - t <= HB_TH.jump.triggerWindowMs);
              bs.thorPrevHealth = boss.health;
            }

            if (disengage.ready && !inDeep) {
              // 拡張した深層戦闘域を3秒出た → 巣へ帰り、着いたら退場(討伐扱いにしない)。帰巣中も回復する。
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
            } else if (disengage.ready && !onScreen) {
              // ズーム後の実画面外が3秒継続: 巣へ戻りつつ毎秒10回復。追跡状態ではない。
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
              // ボスは updateEnemies を早期returnで素通りするため、ここで明示的に判定する。
              // 裏ボスの完全気絶(紫・5クリ)中は攻撃も移動も完全停止(通常の気絶=歩行半速のみ とは別・社長指示)。
              const bossFullStun = boss.bossFullStunUntil !== undefined && newGameTime < boss.bossFullStunUntil;
              const rootedNow = boss.rootUntil !== undefined && newGameTime < boss.rootUntil;
              // v0.25.3476(社長確定指示「ノックバックしたら技は中断」・方針1採用): 気絶(stunUntil)・
              // 浮き(liftUntil)・ノックバック(knockbackUntil)で止められている間も、紫(bossFullStun)
              // と同じく技を中断してchaseへ戻す(bountyTick.tsのisFrozenと同じ並びへ揃える)。
              // liftUntil/knockbackUntilはDate.now基準(bountyTick.tsの注記と同じ)。
              // stunUntilは直下のコメントの通り現状ほぼ常にbossFullStunUntilと同時に立つため実質no-op
              // だが、致命ダゼ(applyBrokenMeleeFatal)等の単独ケースに備えて明示的に含める。
              // v0.25.3491(★ボスの「止める効果」の作り直し・社長裁定済み): ★rootUntil(拘束)もこの
              // 技中断の輪に編入した。v0.25.3202〜3477はここから意図的に外していた
              // (マークスマン自動トラップはCDが無く毎フレーム再発火しうるため、含めると溜め技
              // 「SEは鳴ってるのに一切弾を打たない」事故が戻る=「行動は止めてよいが技は止まらない」)。
              // その後 rootEnemy 自体に汎用DR(evaluateBossStopDr・ノックバック/黄色クリの窓/罠の拘束/
              // 気絶を1カテゴリとして数える)が入り、「連射されても3回目以降は無効化される」が
              // 構造的に保証されたため、root を含めても「罠で永久に止まる」は再発しない(社長裁定済み)。
              const stunnedNow = boss.stunUntil !== undefined && newGameTime < boss.stunUntil;
              const liftedNow = boss.liftUntil !== undefined && Date.now() < boss.liftUntil;
              const kbStoppedNow = boss.knockbackUntil !== undefined && Date.now() < boss.knockbackUntil;
              const frozen = warping || bossFullStun || stunnedNow || liftedNow || kbStoppedNow || rootedNow;
              // v0.25.2895: 気絶中の歩行半減(旧walkMult/BOSS_STUN_SPEED_MULT)は死コードだったため削除。
              // 通常気絶(stunUntil)がボスに入る経路は既にbossSlowUntilへ置き換え済みで、唯一stunUntilを
              // 立てていた紫(完全気絶)はこの上のfrozenで先に全停止する——結果walkMultは常に1で、
              // 掛けても何も変わらない式だった(挙動不変)。
              // 追跡先=プレイヤー/召喚の「近い方」(社長指示)。通常敵と同じ resolveEnemyTarget で吸い付く。
              // フレアガン(§6.6 M29): 着弾中のフレアも疑似召喚として合流=ボスは既存の召喚ヘイト規則
              // (BOSS_SUMMON_AGGRO)のままフレアに吸い付く(新しい強制は足さない)。
              const bossFlareTargets = activeFlareTargets(useGameStore.getState().flareGunFlares, newGameTime);
              const chaseTgt = resolveEnemyTarget(
                boss, player,
                bossFlareTargets.length > 0 ? [...useGameStore.getState().summons, ...bossFlareTargets] : useGameStore.getState().summons,
                BOSS_SUMMON_AGGRO,
                false, newGameTime // v0.25.2490: 引数追加(裏ボスはisBossType=雑魚ヘイト規則の対象外・挙動不変)
              );
              // 攻撃の向きは通常召喚/フレアの移動挑発と分離し、プレイヤー対守護霊のG2.5ヘイトで決める。
              // 技開始時にsideを固定し、連射/設置/弱追尾中は同じ側の現在位置だけを追う。
              const lockAttackAim = () => {
                const aim = resolveBossHateAim(boss, { x: pcx, y: pcy }, useGameStore.getState().summons, newGameTime);
                patch.hateTarget = aim.side;
                return aim;
              };
              const lockedAttackAim = () => resolveBossLockedHateAim(
                boss,
                { x: pcx, y: pcy },
                useGameStore.getState().summons,
              );
              // 慣性付き移動: 目標方向の desired 速度へ現在速度を BOSS_TURN_RESPONSE で寄せて位置を更新
              // (急な方向転換がぬるっと効く=慣性)。最高速は spd*mult のまま不変。
              // spd省略時は自身のspeed(mimir/jormungand/skadi/通常敵の既定)。トールの接近だけ
              // 社長指示でTHOR_APPROACH_SPEED(プレイヤーの1/2速度)を明示的に渡す。
              // v0.25.3491: rootedNow は上の frozen 判定に編入済みのため、moveToward は
              // (frozenでない=root中でもない)時だけ呼ばれる。旧来ここにあった拘束時の早期return
              // (v0.25.3202)は frozen 側の分岐(bs.vx=bs.vy=0 & bossState='chase' 復帰)へ統合され
              // 到達不能になったため削除した(挙動は不変=frozen分岐が同じ結果を出す)。
              const moveToward = (mult: number, spd: number = speed) => {
                const dpx = chaseTgt.x - bcx, dpy = chaseTgt.y - bcy;
                const dl = Math.hypot(dpx, dpy) || 1;
                const desVx = (dpx / dl) * spd * mult;
                const desVy = (dpy / dl) * spd * mult;
                const k = Math.min(1, HB_C.turnResponse * bossMoveDt);
                bs.vx += (desVx - bs.vx) * k;
                bs.vy += (desVy - bs.vy) * k;
                patch.x = boss.x + bs.vx * bossMoveDt; patch.y = boss.y + bs.vy * bossMoveDt;
              };
              if (frozen) {
                bs.vx = 0; bs.vy = 0;
                // ★社長裁定v0.25.3497「ノックバックもだけど、技だけキャンセルされなければええで」:
                // **ノックバック"だけ"で止まっている間は技を中断しない**(v0.25.3476で紫と同じ扱いに
                // 揃えたのを取り消す)。代わりに技の時計を凍結ぶんだけ後ろへずらす=解除後に続きから。
                // 絶対時刻(bossStateUntil)のままだと解除の瞬間に期限切れ=stale windupが即着弾するため。
                // 移動は従来どおり止める(押されている間にチェイスで座標を上書きしない)。
                const kbOnlyStop = kbStoppedNow && !warping && !bossFullStun && !stunnedNow && !liftedNow && !rootedNow;
                if (kbOnlyStop) {
                  const kbDtMs = deltaTime * 1000;
                  if (boss.bossStateUntil !== undefined) patch.bossStateUntil = boss.bossStateUntil + kbDtMs;
                  patch.bossNextActionAt = (boss.bossNextActionAt ?? newGameTime) + kbDtMs;
                } else {
                  // 解除後はチェイスから再開。溜め/連射タイマーを巻き戻して「解除直後に溜め攻撃が暴発」を防ぎ、
                  // 進行中の連射残数もクリア(凍結をまたいで状態が漏れないように)。
                  patch.bossState = 'chase';
                  patch.bossNextActionAt = newGameTime + HB_C.actionMinMs;
                  patch.bossBurstLeft = 0;
                }
              } else {
              // 画面外/帰巣中は bossState='return' になる。チェイス状態機械に 'return' のケースが無いため、
              // 復帰時に 'return' のままだと どの分岐にも入らず=移動も状態遷移もせず永久に固まる(社長報告のバグ)。
              // チェイス復帰時は 'chase' として扱い、bossState も chase へ戻して必ず再開させる。
              if (boss.bossState === 'return') { patch.bossState = 'chase'; patch.bossNextActionAt = newGameTime + HB_C.actionMinMs; }
              const st = (boss.bossState == null || boss.bossState === 'return') ? 'chase' : boss.bossState;
              // CRIT-UNIFY §9.2: クリ窓(bossSlowUntil)中は次行動CDに×2。カウンター成立の直後に
              // 同フレームでこの関数を呼ぶ経路があるため、閉じ込めたstale boss(フレーム先頭のスナップ
              // ショット)ではなく、その時点の最新状態を読み直す(damageEnemyのcrit適用を取りこぼさない)。
              const freshBoss = () => useGameStore.getState().enemies.find(e => e.id === boss.id) ?? boss;
              const nextActionDelay = () => {
                const profileId = bossRebuildIdForEnemy(boss.type);
                const neutralMs = profileId
                  ? bossNeutralDelayMs(profileId, boss.bossPhase ?? 1)
                  : HB_C.actionMinMs + Math.random() * (HB_C.actionMaxMs - HB_C.actionMinMs);
                return newGameTime + neutralMs * bossCritCdMult(freshBoss(), newGameTime);
              };
              // --- トール(ステージ5)専用ヘルパー(社長指示・独自攻撃) ------------------------------
              // 旋回運動: 現在の相対位置から角度/半径を毎フレーム自己補正しながら回す(専用の角度状態を持たない)。
              // Y-down画面座標では atan2 の角度が増える向き=視覚的に時計回り(社長指示「時計回り」の既定 dir=1)。
              // 社長指示(v0.25.1334〜):「たまに2秒さらに1/2の速度で歩く」。今の移動速度(接近/後退/旋回の
              // どれでも)に一律で追加の減速を掛ける一時ウィンドウ。bs.thorSlowWalkUntilが未来の間だけ有効。
              const thorSlowMult = () => (newGameTime < (bs.thorSlowWalkUntil ?? 0) ? HB_TH.slowWalk.mult : 1);
              const thorOrbitMove = () => {
                const dir = boss.bossCircleDir ?? 1;
                const relX = bcx - chaseTgt.x, relY = bcy - chaseTgt.y;
                const curDist = Math.hypot(relX, relY) || 1;
                const slowMult = thorSlowMult();
                if (curDist < HB_TH.orbit.distPx) {
                  // 社長指示②: 旋回距離より近づかれたら、旋回せずプレイヤーの1/2速度で真っ直ぐ後ずさる。
                  const ux = relX / curDist, uy = relY / curDist; // 相手から離れる向き
                  patch.x = boss.x + ux * HB_TH.retreatSpeed * slowMult * bossMoveDt;
                  patch.y = boss.y + uy * HB_TH.retreatSpeed * slowMult * bossMoveDt;
                  bs.vx = 0; bs.vy = 0;
                  return;
                }
                const curAngle = Math.atan2(relY, relX);
                const angularSpeed = (speed * HB_TH.orbit.speedMult * slowMult) / HB_TH.orbit.distPx;
                const newAngle = curAngle + dir * angularSpeed * bossMoveDt;
                const correctedDist = curDist + (HB_TH.orbit.distPx - curDist) * Math.min(1, HB_TH.orbit.radiusCorrect * bossMoveDt);
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
                if (dist > HB_TH.orbit.distPx + HB_TH.orbit.approachSlack) moveToward(1, HB_TH.approachSpeed * thorSlowMult());
                else thorOrbitMove();
              };
              // 次の攻撃選択までの間隔。HPが低いほど短く=高頻度化(社長指示)。
              const thorNextActionDelay = () => {
                // 低HPだけ急に0.55倍へ跳ぶ旧式をやめ、台帳の3フェーズで段階的に密度を上げる。
                const neutralMs = bossNeutralDelayMs('thor', boss.bossPhase ?? 1);
                return newGameTime + neutralMs * bossCritCdMult(freshBoss(), newGameTime);
              };
              // カウンター成立時の共通処理(社長指示: すべての攻撃がカウンター可能)。通常カウンターと同じ
              // 演出(Counter!/ヒットインパクト/クリ反撃)を行い、近接距離ギリギリ外まで高速後退させる。
              const thorCounterHit = (hitX: number, hitY: number, ghost?: GhostCounterFire) => {
                patch.bossScriptQueue = [];
                if (ghost) {
                  // v0.25.2480(★未決1解消): 守護霊カウンター成立。プレイヤー専用の副作用(G1/G4a計測
                  // notify・コンボ・counter SE等倍・強glow95・triggerHitImpact(停止+ズーム)・
                  // markMeleeSwingFx・無敵/CDリファンド/lastCounterSuccessTime)はスキップし、共通ヘルパで
                  // 確定クリ(bumpBossCrit)+青/金FX+SE距離減衰だけ出す。ボスの反応(counter-leap)は
                  // 下の共通処理=プレイヤー成立と同一。
                  applyGhostCounterEffect(boss, hitX, hitY, ghost, (k, g) => playSfx(k, g));
                } else {
                // BOT_AND_GHOST.md G1(計測専用・挙動不変)。
                notifyCounterHit();
                notifyMoveCounter(); // G4a(§2.9・記録専用): 成立④=技への反応表へも通知
                const cp = useGameStore.getState().player;
                const pnow = Date.now();
                addMeleeFinishCombo(1);
                playSfx('counter');
                useGameStore.getState().spawnGlow(hitX, hitY, GLOW_R_L, 'rgba(56,189,248,', 360);
                useGameStore.getState().triggerHitImpact(COUNTER_HITSTOP_MS, COUNTER_SHAKE_MS, COUNTER_SHAKE_MAG, COUNTER_ZOOM_MAG);
                useGameStore.getState().markMeleeSwingFx(); // §5.22-追補(社長決定v0.25.1536): カウンターにも近接スイングを出す
                spawnRing(hitX, hitY, 14, 135, 'rgba(56,189,248,0.9)', 3, 360);
                spawnBurst(hitX, hitY, '#38bdf8', 14);
                useGameStore.getState().spawnCallout(hitX, hitY - 12, 'Counter!', '#e0f2ff', { bg: 0x2563eb, holdMs: MELEE_FINISH_SLOW_HOLD_MS, duration: MELEE_FINISH_SLOW_MS });
                // counter-master v2(CD_REWORK.md 確定2): カウンター成立時のみCDリファンド(未所持は無変換)。
                useGameStore.setState(stt => ({ player: {
                  ...stt.player, invulnerable: true, invulnerableTime: pnow, lastCounterSuccessTime: pnow,
                  counterCooldownEnd: refundCounterCooldown(stt.player.counterCooldownEnd, pnow, skillLevel(stt.player, 'counter-master')),
                  // 覚醒(Lv3・v0.25.3303): 成立後3秒間 全攻撃+30%(成立7箇所共通のパッチ)。
                  ...counterMasterAwakenBuffPatch(stt.player, stt.gameTime),
                } }));
                const counterBase = getActiveGun(cp)?.damage ?? 12;
                const dmg = counterReplyDamage(counterBase, cp, BOSS_CRIT_DAMAGE_MULT);
                // 社長指示: トールのカウンターは必ずクリティカル扱いにする(裏ボス完全気絶=bumpBossCritの
                // カウントに乗せる。他の裏ボス共通のパリィ演出は非crit踏襲のままここだけ変更)。
                damageEnemy(boss.id, dmg, false, true, false, 'other', 'player', 'counter');
                spawnDamageNumber(bcx, boss.y, dmg, true);
                playSfx('headshot');
                // 社長指示: 「これは普通のクリティカルです」= 通常のクリ演出(金の衝撃波+火花+発光。
                // 銃/近接クリの hitCrit juice と同じ見た目)もここに乗せる。青いCounter演出とは別レイヤーで
                // 重ねて出す=カウンター成立と同時に「クリティカルが乗った」ことが見た目でも分かるようにする。
                spawnRing(hitX, hitY, 8, 46, 'rgba(253,224,71,0.95)', 3, 300);
                spawnBurst(hitX, hitY, '#fde047', 10);
                useGameStore.getState().spawnGlow(hitX, hitY, 34, 'rgba(253,224,71,', 240);
                }
                const lx = bcx - pcx, ly = bcy - pcy;
                const ll = Math.hypot(lx, ly) || 1;
                patch.bossState = 'counter-leap';
                patch.bossStateUntil = newGameTime + HB_TH.counterLeapMs;
                patch.aiFromX = bcx; patch.aiFromY = bcy;
                patch.aiTargetX = pcx + (lx / ll) * HB_TH.orbit.distPx;
                patch.aiTargetY = pcy + (ly / ll) * HB_TH.orbit.distPx;
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
              // W7統一(PACING_PUZZLE.md §6.28-13/§6.28-21★3・バッチM52): 裏ボス3体(mimir/jormungand/
              // skadi)のカウンター成立処理。演出/反撃ダメージはthorCounterHitと同一だが、この3体は
              // 旋回運動を持たないため THOR_ORBIT_DIST 依存の後退ジャンプ(counter-leap)は行わず、
              // 即座に'chase'へ戻す(次アクションは少し間を空ける=通常のnextActionDelayと同じ式)。
              // `BOSS_COUNTER_ENABLED`(既定true・`?bosscounter=0`で無効)の時だけ各windup状態から呼ばれる
              // (呼び出し側でゲート済み=このヘルパ自体は常に定義するだけで無条件には呼ばない)。
              const hiddenBossCounterHit = (hitX: number, hitY: number, ghost?: GhostCounterFire) => {
                patch.bossScriptQueue = [];
                if (ghost) {
                  // v0.25.2480(★未決1解消): 守護霊カウンター成立(thorCounterHitのghost分岐と同じ扱い)。
                  applyGhostCounterEffect(boss, hitX, hitY, ghost, (k, g) => playSfx(k, g));
                } else {
                // BOT_AND_GHOST.md G1(計測専用・挙動不変)。
                notifyCounterHit();
                notifyMoveCounter(); // G4a(§2.9・記録専用): 成立⑤=技への反応表へも通知(G4b対象ボスは表キー未定義=現状no-op)
                const cp = useGameStore.getState().player;
                const pnow = Date.now();
                addMeleeFinishCombo(1);
                playSfx('counter');
                useGameStore.getState().spawnGlow(hitX, hitY, GLOW_R_L, 'rgba(56,189,248,', 360);
                useGameStore.getState().triggerHitImpact(COUNTER_HITSTOP_MS, COUNTER_SHAKE_MS, COUNTER_SHAKE_MAG, COUNTER_ZOOM_MAG);
                useGameStore.getState().markMeleeSwingFx();
                spawnRing(hitX, hitY, 14, 135, 'rgba(56,189,248,0.9)', 3, 360);
                spawnBurst(hitX, hitY, '#38bdf8', 14);
                useGameStore.getState().spawnCallout(hitX, hitY - 12, 'Counter!', '#e0f2ff', { bg: 0x2563eb, holdMs: MELEE_FINISH_SLOW_HOLD_MS, duration: MELEE_FINISH_SLOW_MS });
                // counter-master v2(CD_REWORK.md 確定2): カウンター成立時のみCDリファンド(未所持は無変換)。
                useGameStore.setState(stt => ({ player: {
                  ...stt.player, invulnerable: true, invulnerableTime: pnow, lastCounterSuccessTime: pnow,
                  counterCooldownEnd: refundCounterCooldown(stt.player.counterCooldownEnd, pnow, skillLevel(stt.player, 'counter-master')),
                  // 覚醒(Lv3・v0.25.3303): 成立後3秒間 全攻撃+30%(成立7箇所共通のパッチ)。
                  ...counterMasterAwakenBuffPatch(stt.player, stt.gameTime),
                } }));
                const counterBase = getActiveGun(cp)?.damage ?? 12;
                const dmg = counterReplyDamage(counterBase, cp, BOSS_CRIT_DAMAGE_MULT);
                damageEnemy(boss.id, dmg, false, true, false, 'other', 'player', 'counter');
                spawnDamageNumber(bcx, boss.y, dmg, true);
                playSfx('headshot');
                spawnRing(hitX, hitY, 8, 46, 'rgba(253,224,71,0.95)', 3, 300);
                spawnBurst(hitX, hitY, '#fde047', 10);
                useGameStore.getState().spawnGlow(hitX, hitY, 34, 'rgba(253,224,71,', 240);
                }
                // §6.33 案G(社長裁定): 新挙動のレーザー溜め中の体当てカウンター成立は、chaseではなく
                // 中断の正規フロー(laser-broken+中断CD)へ合流させる=近接ヒット中断と同じ扱い。
                // 「発射直前だけ阻止できる」の約束と農場防止(8000ms CD)がW7経由でも貫通する。
                if (MIMIR_TRACK_ENABLED && usesMimirLaser(boss.type) && st === 'laser-windup') {
                  patch.bossState = 'laser-broken';
                  patch.bossStateUntil = newGameTime + MIMIR_LASER_BROKEN_MS;
                  patch.mimirLaserReadyAt = newGameTime + MIMIR_LASER_INTERRUPTED_CD_MS;
                } else {
                  patch.bossState = 'chase';
                  patch.bossNextActionAt = nextActionDelay();
                }
                patch.bossBurstLeft = 0;
              };
              // PACING_PUZZLE.md §6.28-5/7/9(バッチM54/M56/M58): このボスのスクリプトが有効か
              // (?<boss>script=0で個別に旧挙動へ戻す・§6.28-12のフォールバック)。
              const hiddenScriptOn = (boss.type === 'mimir' && MIMIR_SCRIPT_ENABLED)
                || (boss.type === 'jormungand' && JORMUNGAND_SCRIPT_ENABLED)
                || (boss.type === 'skadi' && SKADI_SCRIPT_ENABLED);
              // 突進の狙い方向をwindup"開始"の瞬間にロックする共通ヘルパ(mimir/jormungand/skadi共通)。
              // §6.28-13受け入れ条件10(判定と同寸)のため: T1テレグラフをリード全域(3秒)で表示するには、
              // 表示開始時点で終点が確定していなければならない(掟W4=テルを出したら狙いをズラさない)。
              // 旧実装はwindup"終了"時に再照準していた(=このヘルパを呼ばない。dash-windup側で従来どおり
              // 再照準する)。ロック位置を前倒しするだけで、突進そのものの速度/最大時間/弱いホーミングは無改変。
              const beginHiddenDash = () => {
                const aim = lockAttackAim();
                const ddx0 = aim.x - bcx, ddy0 = aim.y - bcy;
                const ddl0 = Math.hypot(ddx0, ddy0) || 1;
                bs.dashDirX = ddx0 / ddl0; bs.dashDirY = ddy0 / ddl0;
                const travel = speed * HB_C.dash.speedMult * (HB_C.dash.ms / 1000);
                patch.bossState = 'dash-windup';
                patch.bossStateUntil = newGameTime + HB_C.dash.windup;
                patch.aiFromX = bcx; patch.aiFromY = bcy;
                patch.aiTargetX = bcx + bs.dashDirX * travel; patch.aiTargetY = bcy + bs.dashDirY * travel;
              };
              const beginMimirMove = (move: MimirMove) => {
                playSfx(BOSS_ALERT_SFX_KEY);
                if (move === 'bite') {
                  patch.bossState = 'bite-windup';
                  patch.bossStateUntil = newGameTime + HB_MI.bite.windup;
                } else if (move === 'laser') {
                  const aim = lockAttackAim();
                  patch.bossState = 'laser-windup';
                  patch.bossStateUntil = newGameTime + MIMIR_LASER_WINDUP_MS;
                  patch.aiFromX = bcx; patch.aiFromY = bcy;
                  patch.aiTargetX = aim.x; patch.aiTargetY = aim.y;
                  // §6.33: 追尾照準の初期状態=対象位置・速度0(立ち上がりの慣性はここから始まる)。
                  bs.mimirAimVX = 0; bs.mimirAimVY = 0;
                } else if (move === 'dash') {
                  beginHiddenDash();
                } else if (move === 'burst') {
                  lockAttackAim();
                  patch.bossState = 'aim-burst';
                  patch.bossStateUntil = newGameTime + HB_C.aimBurstMs;
                } else {
                  patch.bossState = 'aim-radial';
                  patch.bossStateUntil = newGameTime + HB_C.aimRadialMs;
                }
              };
              const beginJormungandMove = (move: JormungandMove) => {
                playSfx(BOSS_ALERT_SFX_KEY);
                if (move === 'coil') {
                  const aim = lockAttackAim();
                  patch.bossState = 'coil-windup';
                  patch.bossStateUntil = newGameTime + HB_JO.coil.windup;
                  const rx = bcx - aim.x, ry = bcy - aim.y;
                  const rl = Math.hypot(rx, ry) || 1;
                  const tx0 = -ry / rl, ty0 = rx / rl; // 接線(90度回転)の単位ベクトル=薙ぐ帯の向き(トール払いと同式)
                  patch.aiFromX = aim.x - tx0 * (HB_JO.coil.range / 2);
                  patch.aiFromY = aim.y - ty0 * (HB_JO.coil.range / 2);
                  patch.aiTargetX = aim.x + tx0 * (HB_JO.coil.range / 2);
                  patch.aiTargetY = aim.y + ty0 * (HB_JO.coil.range / 2);
                } else if (move === 'dash') {
                  beginHiddenDash();
                } else if (move === 'burst') {
                  lockAttackAim();
                  patch.bossState = 'aim-burst';
                  patch.bossStateUntil = newGameTime + HB_C.aimBurstMs;
                } else {
                  patch.bossState = 'aim-radial';
                  patch.bossStateUntil = newGameTime + HB_C.aimRadialMs;
                }
              };
              const beginSkadiMove = (move: SkadiMove) => {
                playSfx(BOSS_ALERT_SFX_KEY);
                if (move === 'ice') {
                  lockAttackAim();
                  patch.bossState = 'skadi-ice-windup';
                  patch.bossStateUntil = newGameTime + HB_SK.preWindup;
                } else if (move === 'blade') {
                  lockAttackAim();
                  patch.bossState = 'skadi-blade-windup';
                  patch.bossStateUntil = newGameTime + HB_SK.preWindup;
                  // v0.25.3078(社長指示): 溜めの頭で「これから飛ぶ本数」の氷刃が全方位へドバッと出る予兆。
                  useGameStore.getState().spawnFanBurst(bcx, bcy, 'skadi-ice-blade', HB_SK.blade.count);
                } else if (move === 'cage') {
                  lockAttackAim();
                  patch.bossState = 'cage-windup';
                  patch.bossStateUntil = newGameTime + HB_SK.cage.windup;
                } else if (move === 'dash') {
                  beginHiddenDash();
                } else if (move === 'burst') {
                  lockAttackAim();
                  patch.bossState = 'aim-burst';
                  patch.bossStateUntil = newGameTime + HB_C.aimBurstMs;
                } else {
                  patch.bossState = 'aim-radial';
                  patch.bossStateUntil = newGameTime + HB_C.aimRadialMs;
                }
              };
              // 弾3連/全方位/突進(burst/radial/dash)は3ボス共通の技名なので、硬直明けの連携判定も
              // 共通ヘルパへまとめる(justFinishedだけが違う)。呼び出し側は硬直の時間切れを確認済みで呼ぶこと。
              const hiddenRecoverAdvance = (_justFinished: string) => {
                const [next, ...rest] = boss.bossScriptQueue ?? [];
                patch.bossScriptQueue = rest;
                // §6.33-2-4: 中断CD中のレーザーは連携追撃(radial→laser)でも撃てない=不発でchaseへ。
                const laserOnCd = next === 'laser' && usesMimirLaser(boss.type)
                  && newGameTime < (boss.mimirLaserReadyAt ?? 0);
                if (laserOnCd) { patch.bossScriptQueue = []; patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(); } // 残りの連携ごと潰す(監査指摘11)
                else if (next && boss.type === 'mimir') beginMimirMove(next as MimirMove);
                else if (next && boss.type === 'jormungand') beginJormungandMove(next as JormungandMove);
                else if (next && boss.type === 'skadi') beginSkadiMove(next as SkadiMove);
                else { patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(); }
              };
              // トール: 一閃/突き/払いのwindup開始(方向ロック等)を1箇所へ集約し、確定済み台本からも呼ぶ。
              const beginThorMove = (move: 'issen' | 'tsuki' | 'harai') => {
                if (THOR_SCRIPT_ENABLED) playSfx(BOSS_ALERT_SFX_KEY);
                const aim = lockAttackAim();
                if (move === 'issen') {
                  patch.bossState = 'issen-windup';
                  patch.bossStateUntil = newGameTime + HB_TH.issen.windup;
                  const ddx0 = aim.x - bcx, ddy0 = aim.y - bcy;
                  const ddl0 = Math.hypot(ddx0, ddy0) || 1;
                  patch.aiFromX = bcx; patch.aiFromY = bcy;
                  patch.aiTargetX = bcx + (ddx0 / ddl0) * HB_TH.issen.range;
                  patch.aiTargetY = bcy + (ddy0 / ddl0) * HB_TH.issen.range;
                } else if (move === 'tsuki') {
                  patch.bossState = 'tsuki-windup';
                  patch.bossStateUntil = newGameTime + HB_TH.tsuki.windup;
                  patch.aiFromX = bcx; patch.aiFromY = bcy;
                  patch.aiTargetX = aim.x; patch.aiTargetY = aim.y;
                } else {
                  patch.bossState = 'harai-windup';
                  patch.bossStateUntil = newGameTime + HB_TH.harai.windup;
                  const rx = bcx - aim.x, ry = bcy - aim.y;
                  const rl = Math.hypot(rx, ry) || 1;
                  const tx0 = -ry / rl, ty0 = rx / rl;
                  patch.aiFromX = aim.x - tx0 * (HB_TH.harai.range / 2);
                  patch.aiFromY = aim.y - ty0 * (HB_TH.harai.range / 2);
                  patch.aiTargetX = aim.x + tx0 * (HB_TH.harai.range / 2);
                  patch.aiTargetY = aim.y + ty0 * (HB_TH.harai.range / 2);
                }
              };
              const thorRecoverAdvance = () => {
                const [next, ...rest] = boss.bossScriptQueue ?? [];
                patch.bossScriptQueue = rest;
                if (next === 'issen' || next === 'tsuki' || next === 'harai') beginThorMove(next);
                else { patch.bossState = 'chase'; patch.bossNextActionAt = thorNextActionDelay(); }
              };
              // トール: 飛び掛かりの開始。実戦(画面外から3回被弾)と ボスメーカーの▸が**同じ1本**を通る
              // ように chase 分岐から切り出した(掟: 遷移コードを複製しない)。発火条件(被弾カウント)は
              // 呼び出し側に残す=▸は条件をバイパスしてここを直接叩ける(部屋は訓練場)。
              const beginThorJump = () => {
                patch.bossState = 'jump-windup';
                patch.bossStateUntil = newGameTime + HB_TH.jump.windup;
                patch.bossScriptQueue = planBossChoreography('thor', 'jump', boss.bossPhase ?? 1).slice(1);
                // §6.28-10「ジャンプ着地円を溜め開始から出す」: 着地点は溜め"開始"の瞬間にロックする
                // (W1「予告図形はリード全域で出す」+受け入れ条件10「判定と同寸」のため)。
                if (THOR_SCRIPT_ENABLED) {
                  const aim = lockAttackAim();
                  patch.aiTargetX = aim.x; patch.aiTargetY = aim.y;
                }
              };
              // ボスメーカー ▸(BOSS_MAKER.md §6-1): 技を1つだけ再生する入口。**実戦の抽選と同じ begin* の束**
              // を通す(写さない)。連携の台本は積まない(=▸は1技だけを最後まで再生して chase へ戻る)。
              const startHiddenMove = (k: HiddenMoveKey): void => {
                patch.bossScriptQueue = [];
                switch (k) {
                  case 'mi-bite': beginMimirMove('bite'); break;
                  case 'mi-laser': beginMimirMove('laser'); break;
                  case 'mi-dash': beginMimirMove('dash'); break;
                  case 'mi-burst': beginMimirMove('burst'); break;
                  case 'mi-radial': beginMimirMove('radial'); break;
                  case 'jo-coil': beginJormungandMove('coil'); break;
                  case 'jo-dash': beginJormungandMove('dash'); break;
                  case 'jo-burst': beginJormungandMove('burst'); break;
                  case 'jo-radial': beginJormungandMove('radial'); break;
                  case 'sk-ice': beginSkadiMove('ice'); break;
                  case 'sk-blade': beginSkadiMove('blade'); break;
                  case 'sk-cage': beginSkadiMove('cage'); break;
                  case 'sk-dash': beginSkadiMove('dash'); break;
                  case 'sk-burst': beginSkadiMove('burst'); break;
                  case 'sk-radial': beginSkadiMove('radial'); break;
                  case 'th-issen': beginThorMove('issen'); break;
                  case 'th-tsuki': beginThorMove('tsuki'); break;
                  case 'th-harai': beginThorMove('harai'); break;
                  case 'th-jump': beginThorJump(); break;
                }
              };
              // W7の対象状態一覧(§6.28-13 #8/§6.28-21★3): 弾3連/全方位16発/ミーミルのレーザーの各windup
              // (静止/後退り)、および突進の実行中(active=その技の判定に委ねる=ここで直接カウンターを判定する)。
              // ロットL3(バッチM54/M56/M58)で硬直(recover)を新設したので、W7「硬直中の接触もカウンター可」に
              // 従い、新設した各recoverもここへ加える(§6.28-3 W7)。新規windup(噛みつき/うねり/氷結の檻)も同様。
              // ★v0.25.3591: 州リストは counterReach.ts へ移設(中身は同一)。理由は「テストできる場所へ
              // 置く」——このファイルはReactフックなのでユニットテストから読めず、**州リストと
              // カウンター成立域の宣言表の突き合わせ(新しい技の宣言漏れ検知)ができなかった**。
              const HIDDEN_BOSS_COUNTER_WINDUPS = HIDDEN_COUNTER_WINDUP_STATES;
              const HIDDEN_BOSS_COUNTER_RECOVERS = HIDDEN_COUNTER_RECOVER_STATES;
              // ★v0.25.3591(監査 B-2/B-3): 成立域は「赤い予告の図形」。噛みつき=自分中心円 r=216
              // (体は223×124=半幅124なので、**円の外周92pxのリングが丸ごと死角**だった)/
              // うねり=帯 310×40(帯はプレイヤーの位置に置かれるので、蛇の体に触れることはまず無い)。
              // どの州がどの図形かは counterReach.ts の宣言表が正本(全系統で1箇所・寸法はテーブル直読み)。
              const hiddenReachOverlapNow = () => {
                const cp = useGameStore.getState().player;
                return {
                  overlap: inCounterReach(
                    counterReachShapeFor(`hidden:${st}`, {
                      bcx, bcy, pcx, pcy,
                      aiFromX: boss.aiFromX, aiFromY: boss.aiFromY,
                      aiTargetX: boss.aiTargetX, aiTargetY: boss.aiTargetY,
                    }),
                    { x: cp.x, y: cp.y, width: cp.width, height: cp.height },
                    { x: boss.x, y: boss.y, width: boss.width, height: boss.height },
                  ),
                  counterActive: Date.now() <= cp.counterWindowEnd,
                };
              };
              const hiddenBossCounterableNow = BOSS_COUNTER_ENABLED && boss.type !== 'thor'
                && (isCounterablePhase(st, HIDDEN_BOSS_COUNTER_WINDUPS, HIDDEN_BOSS_COUNTER_RECOVERS)
                  || HIDDEN_COUNTER_ACTIVE_STATES.includes(st))
                // §6.33 案G(社長裁定): 新挙動のレーザー溜めは弱点窓(発射前900ms)の間だけ体当て
                // カウンター可(窓外3000ms全域で潰せた既存W7の穴を塞ぐ)。旧挙動(?mimirtrack=0)は従来どおり。
                && !(MIMIR_TRACK_ENABLED && usesMimirLaser(boss.type) && st === 'laser-windup'
                  && !canInterruptMimirLaser(boss.type, st, newGameTime, boss.bossStateUntil));
              let hiddenBossCountered = false;
              if (hiddenBossCounterableNow) {
                const { overlap, counterActive } = hiddenReachOverlapNow();
                if (overlap && counterActive) {
                  hiddenBossCounterHit(bcx, bcy);
                  hiddenBossCountered = true;
                }
              }
              // v0.25.2480(★未決1解消): 守護霊のカウンター請求(前フレームのcounterスイング)を
              // プレイヤーと同じper-bossハンドラで解決する。成立州はプレイヤーと同一:
              //  - トール: 溜め/硬直の8州(語尾-windup/-recover=プレイヤーの体当てカウンターと同じ州。
              //    実行中ライン(issen-dash等)は語尾に載らない=請求が積まれず対象外)。
              //  - 裏3体: hiddenBossCounterableNow(プレイヤーと同じ州リスト・?bosscounter=0ゲート込み)。
              // 同フレームにプレイヤーの成立(overlap&&窓)が立っている時はプレイヤー優先(体験を変えない)。
              let ghostCountered = false;
              if (!hiddenBossCountered) {
                const ghostCounterableNow = boss.type === 'thor'
                  ? isBossCounterableNowApprox(boss.aiPhase, st)
                  : hiddenBossCounterableNow;
                // プレイヤー成立の有無を見るだけの照会なので、**プレイヤーと同じ成立域**で引く
                // (トールは体の重なり / 裏3体は図形reach=v0.25.3591)。
                const { overlap: pOverlap, counterActive: pActive } = ghostCounterableNow
                  ? (boss.type === 'thor' ? thorBodyOverlapNow() : hiddenReachOverlapNow())
                  : { overlap: false, counterActive: false };
                if (ghostCounterableNow && !(pOverlap && pActive)) {
                  const gClaim = consumeGhostCounterClaim(boss.id, Date.now());
                  if (gClaim) {
                    const gcSt = useGameStore.getState();
                    const gFire: GhostCounterFire = {
                      claim: gClaim,
                      sfxGain: npcSfxDistGain(bcx, bcy, pcx, pcy, gcSt.camera, gcSt.gameBounds),
                    };
                    if (boss.type === 'thor') thorCounterHit(bcx, bcy, gFire);
                    else hiddenBossCounterHit(bcx, bcy, gFire);
                    ghostCountered = true;
                  }
                }
              }
              if (hiddenBossCountered || ghostCountered) {
                // カウンター成立: hiddenBossCounterHit/thorCounterHitが既にpatch(chase復帰/counter-leap)まで
                // 設定済みなので、通常の状態遷移(下のif/elseチェーン)はこのフレームだけ丸ごとスキップする。
              } else if (takeHiddenBossPlay(boss.type, startHiddenMove)) {
                // ボスメーカー ▸: 条件(距離帯/CD/抽選)をバイパスして技を1つ始める(部屋は訓練場)。
                // 通常プレイでは要求箱が常に null なのでここへは来ない。
              } else if (st === 'chase') {
                if (boss.type === 'thor') {
                  // 社長指示:「たまに2秒さらに1/2の速度で歩く」。クールダウンが明けたら新しい減速ウィンドウへ
                  // 突入(既に減速中は再抽選しない=毎フレーム延長し続けない)。
                  if (newGameTime >= (bs.thorNextSlowWalkAt ?? 0) && newGameTime >= (bs.thorSlowWalkUntil ?? 0)) {
                    bs.thorNextSlowWalkAt = newGameTime + HB_TH.slowWalk.minIntervalMs + Math.random() * (HB_TH.slowWalk.maxIntervalMs - HB_TH.slowWalk.minIntervalMs);
                    bs.thorSlowWalkUntil = newGameTime + HB_TH.slowWalk.ms;
                  }
                  thorMove();
                } else {
                  moveToward(1);
                }
                const thorDistToTgt = boss.type === 'thor' ? Math.hypot(chaseTgt.x - bcx, chaseTgt.y - bcy) : 0;
                if (boss.type === 'thor' && bs.thorRangedHits.length >= HB_TH.jump.triggerHits) {
                  // 遠距離からの連続被弾への対抗: 通常の間隔を待たず即ジャンプ攻撃で間合いを詰める(社長指示)。
                  bs.thorRangedHits = [];
                  beginThorJump(); // ★v0.25.3573: 中身は beginThorJump へ切り出し(▸と同じ1本)
                } else if (
                  boss.type === 'thor' &&
                  thorDistToTgt < HB_TH.orbit.distPx &&
                  newGameTime >= (bs.thorNextBackstepAt ?? 0)
                ) {
                  // 社長指示②: 「たまにバックステップで少し距離を取る」。近づかれている間、間隔を空けて発火。
                  bs.thorNextBackstepAt = newGameTime + HB_TH.backstep.minIntervalMs + Math.random() * (HB_TH.backstep.maxIntervalMs - HB_TH.backstep.minIntervalMs);
                  const rx = bcx - chaseTgt.x, ry = bcy - chaseTgt.y;
                  const rl = Math.hypot(rx, ry) || 1;
                  patch.bossState = 'backstep';
                  patch.bossStateUntil = newGameTime + HB_TH.backstep.ms;
                  patch.aiFromX = bcx; patch.aiFromY = bcy;
                  patch.aiTargetX = bcx + (rx / rl) * HB_TH.backstep.distPx;
                  patch.aiTargetY = bcy + (ry / rl) * HB_TH.backstep.distPx;
                  bs.vx = 0; bs.vy = 0;
                } else if (
                  boss.type === 'thor' &&
                  thorDistToTgt >= HB_TH.orbit.distPx &&
                  thorDistToTgt <= HB_TH.orbit.distPx + HB_TH.orbit.approachSlack &&
                  newGameTime >= (bs.thorNextOrbitStepAt ?? 0)
                ) {
                  // 社長指示: 旋回中(適正距離)にたまに接線方向へ少しだけ弾む「ステップ」を混ぜる(緩急)。
                  bs.thorNextOrbitStepAt = newGameTime + HB_TH.orbitStep.minIntervalMs + Math.random() * (HB_TH.orbitStep.maxIntervalMs - HB_TH.orbitStep.minIntervalMs);
                  const dir = boss.bossCircleDir ?? 1;
                  const rux = (bcx - chaseTgt.x) / (thorDistToTgt || 1), ruy = (bcy - chaseTgt.y) / (thorDistToTgt || 1);
                  const tux = -ruy * dir, tuy = rux * dir; // 接線方向(thorOrbitMoveと同じ向き規則)
                  patch.bossState = 'orbit-step';
                  patch.bossStateUntil = newGameTime + HB_TH.orbitStep.ms;
                  patch.aiFromX = bcx; patch.aiFromY = bcy;
                  patch.aiTargetX = bcx + tux * HB_TH.orbitStep.distPx;
                  patch.aiTargetY = bcy + tuy * HB_TH.orbitStep.distPx;
                  bs.vx = 0; bs.vy = 0;
                } else if (boss.type === 'thor') {
                  if (newGameTime >= (boss.bossNextActionAt ?? 0)) {
                    // トール専用: 弾もダッシュも使わない刀3種を距離帯の役割から選ぶ。
                    // 払いは250px以内、一閃は遠距離ほど重く、突きは中距離の主砲。
                    const dpx = chaseTgt.x - bcx, dpy = chaseTgt.y - bcy;
                    const distance = Math.hypot(dpx, dpy);
                    const pick = pickThorMove(distance, (boss.bossPhase ?? 1) as 1 | 2 | 3);
                    patch.bossScriptQueue = planBossChoreography('thor', pick, boss.bossPhase ?? 1).slice(1);
                    // §6.28-10行1〜3「+SE【新設】」: 予告SEを新設(図形/リード/硬直=既存値は無改変)。
                    // windup開始のセットアップ(方向ロック等)はbeginThorMoveへ集約(値は不変・純関数化のみ)。
                    beginThorMove(pick);
                  }
                } else if (newGameTime >= (boss.bossNextActionAt ?? 0)) {
                  // PACING_PUZZLE.md §6.28-5/7/9(バッチM54/M56/M58): 間合い+フェーズ+CD明けから技を選ぶ
                  // 判断はmimirScript.ts/jormungandScript.ts/skadiScript.tsの純関数へ委譲(実装精度の規律4)。
                  // ?<boss>script=0の間は旧挙動(帯ゲート無し・レーザー/氷は専用確率、残りはdash/burst/radial固定
                  // 3択)をそのまま実行する(§6.28-12のフォールバック契約)。
                  const dist = Math.hypot(chaseTgt.x - bcx, chaseTgt.y - bcy);
                  if (boss.type === 'mimir' && MIMIR_SCRIPT_ENABLED) {
                    const phase = (boss.bossPhase ?? 1) as 1 | 2;
                    const ready: Record<MimirMove, boolean> = {
                      bite: newGameTime >= (boss.mimirBiteReadyAt ?? 0),
                      // §6.33-2-4: 弱点窓で中断された時だけ8秒CD(通常成功時はreadyAt未設定=常にtrue)。
                      laser: newGameTime >= (boss.mimirLaserReadyAt ?? 0),
                      dash: true, burst: true, radial: true,
                    };
                    const move = pickMimirMove(dist, phase, ready);
                    if (move) {
                      patch.bossScriptQueue = planBossChoreography('mimir', move, phase).slice(1);
                      beginMimirMove(move);
                    }
                  } else if (boss.type === 'jormungand' && JORMUNGAND_SCRIPT_ENABLED) {
                    const phase = (boss.bossPhase ?? 1) as 1 | 2;
                    const ready: Record<JormungandMove, boolean> = {
                      radial: true, burst: true, dash: true, coil: newGameTime >= (boss.jormCoilReadyAt ?? 0),
                    };
                    const move = pickJormungandMove(dist, phase, ready);
                    if (move) {
                      patch.bossScriptQueue = planBossChoreography('jormungand', move, phase).slice(1);
                      beginJormungandMove(move);
                    }
                  } else if (boss.type === 'skadi' && SKADI_SCRIPT_ENABLED) {
                    const phase = (boss.bossPhase ?? 1) as 1 | 2 | 3;
                    const ready: Record<SkadiMove, boolean> = {
                      ice: true, blade: true, dash: true, burst: true, radial: true,
                      cage: newGameTime >= (boss.skadiCageReadyAt ?? 0),
                    };
                    const move = pickSkadiMove(dist, phase, ready);
                    if (move) {
                      patch.bossScriptQueue = planBossChoreography('skadi', move, phase).slice(1);
                      beginSkadiMove(move);
                    }
                  } else if (usesMimirLaser(boss.type) && Math.random() < MIMIR_LASER_CHANCE
                      && newGameTime >= (boss.mimirLaserReadyAt ?? 0)) { // §6.33-2-4: 中断CDはこの旧抽選経路にも効かせる(監査指摘10)
                    // 旧挙動(?mimirscript=0)。
                    const aim = lockAttackAim();
                    patch.bossState = 'laser-windup';
                    patch.bossStateUntil = newGameTime + MIMIR_LASER_WINDUP_MS;
                    patch.aiFromX = bcx; patch.aiFromY = bcy;       // ビーム原点(ロック)
                    patch.aiTargetX = aim.x; patch.aiTargetY = aim.y; // 射撃方向(ロック=溜め開始時のヘイト対象)
                    bs.mimirAimVX = 0; bs.mimirAimVY = 0;           // §6.33: 追尾照準の初期速度(スクリプト無効時も追尾は有効)
                  } else if (boss.type === 'skadi' && Math.random() < SKADI_ATTACK_CHANCE) {
                    // 旧挙動(?skadiscript=0)。スカジ専用の氷攻撃を「追加」抽選(氷塊バースト or 氷の刃)。
                    lockAttackAim();
                    if (Math.random() < 0.5) { patch.bossState = 'skadi-ice'; patch.bossBurstLeft = HB_SK.ice.count; patch.bossBurstNextAt = newGameTime; }
                    else { patch.bossState = 'skadi-blade'; patch.bossBurstLeft = HB_SK.blade.count; patch.bossBurstNextAt = newGameTime; }
                  } else {
                    // 旧挙動(共通): dash/aim-burst/aim-radialの固定3択(いずれかのボスがscript=0の時のフォールバック)。
                    const r = Math.random();
                    if (r < BOSS_DASH_CHANCE) { beginHiddenDash(); }
                    else if (r < BOSS_DASH_CHANCE + (1 - BOSS_DASH_CHANCE) / 2) { lockAttackAim(); patch.bossState = 'aim-burst'; patch.bossStateUntil = newGameTime + HB_C.aimBurstMs; }
                    else { patch.bossState = 'aim-radial'; patch.bossStateUntil = newGameTime + HB_C.aimRadialMs; }
                  }
                }
              } else if (st === 'aim-burst') {
                if (newGameTime >= (boss.bossStateUntil ?? 0)) {
                  patch.bossState = 'burst';
                  // ヨルムンガルド: 3発×5回。他の裏ボス: 従来の単発×3。
                  patch.bossBurstLeft = boss.type === 'jormungand' ? HB_JO.burst.volleys : HB_C.burstShots;
                  patch.bossBurstNextAt = newGameTime;
                }
              } else if (st === 'burst') {
                const left = boss.bossBurstLeft ?? 0;
                if (left > 0 && newGameTime >= (boss.bossBurstNextAt ?? 0)) {
                  const aimTgt = lockedAttackAim();
                  if (boss.type === 'jormungand') {
                    // 1回=固定したヘイト対象を追う軽い3-way扇(計3発)。
                    const ang = Math.atan2(aimTgt.y - bcy, aimTgt.x - bcx);
                    for (let k = -1; k <= 1; k++) {
                      const a = ang + k * HB_JO.burst.fanSpread;
                      fireBullet(bcx + Math.cos(a) * 100, bcy + Math.sin(a) * 100);
                    }
                  } else {
                    fireBullet(aimTgt.x, aimTgt.y);
                  }
                  patch.bossBurstLeft = left - 1;
                  patch.bossBurstNextAt = newGameTime + (boss.type === 'jormungand' ? HB_JO.burst.gapMs : HB_C.burstGapMs);
                  if (left - 1 <= 0) {
                    // §6.28-5/7/9: 硬直(反撃窓)を新設。旧挙動時は現行どおり即chase復帰。
                    if (hiddenScriptOn) {
                      const recMs = boss.type === 'jormungand' ? HB_JO.burst.recover : boss.type === 'skadi' ? HB_SK.burstRecover : HB_MI.burstRecover;
                      patch.bossState = 'burst-recover'; patch.bossStateUntil = newGameTime + choreographyRecoverMs(recMs, (boss.bossScriptQueue?.length ?? 0) > 0);
                    } else {
                      patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay();
                    }
                  }
                }
              } else if (st === 'aim-radial') {
                if (newGameTime >= (boss.bossStateUntil ?? 0)) {
                  if (boss.type === 'jormungand') {
                    // ヨルムンガルド: 全方位16発を0.3秒おきに8回。繰り返しは 'radial' 状態で回す。
                    patch.bossState = 'radial';
                    patch.bossBurstLeft = HB_JO.radial.volleys;
                    patch.bossBurstNextAt = newGameTime;
                  } else {
                    for (let i = 0; i < HB_C.radialCount; i++) {
                      const a = (Math.PI * 2 * i) / HB_C.radialCount;
                      fireBullet(bcx + Math.cos(a) * 100, bcy + Math.sin(a) * 100);
                    }
                    if (hiddenScriptOn) {
                      patch.bossState = 'radial-recover';
                      patch.bossStateUntil = newGameTime + choreographyRecoverMs(boss.type === 'skadi' ? HB_SK.radialRecover : HB_MI.radialRecover, (boss.bossScriptQueue?.length ?? 0) > 0);
                    } else {
                      patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay();
                    }
                  }
                }
              } else if (st === 'radial') {
                // ヨルムンガルド専用: 16発の全方位を JORM_RADIAL_GAP_MS おきに JORM_RADIAL_VOLLEYS 回。
                // 各回ごとに時計回りへ JORM_RADIAL_SPIN だけずらして螺旋状に撃つ(社長指示)。
                // §6.28-7「規則を読む」不変条件: 回転方向は常に時計回りで固定(jormRadialSpinAngleが構造的に保証)。
                const left = boss.bossBurstLeft ?? 0;
                if (left > 0 && newGameTime >= (boss.bossBurstNextAt ?? 0)) {
                  const vi = HB_JO.radial.volleys - left; // 0始まりの回数インデックス
                  for (let i = 0; i < HB_C.radialCount; i++) {
                    const a = (Math.PI * 2 * i) / HB_C.radialCount + jormRadialSpinAngle(vi, HB_JO.radial.spin); // 時計回り(画面y下)へ加算
                    fireBullet(bcx + Math.cos(a) * 100, bcy + Math.sin(a) * 100);
                  }
                  patch.bossBurstLeft = left - 1;
                  patch.bossBurstNextAt = newGameTime + HB_JO.radial.gapMs;
                  if (left - 1 <= 0) {
                    if (hiddenScriptOn) { patch.bossState = 'radial-recover'; patch.bossStateUntil = newGameTime + choreographyRecoverMs(HB_JO.radial.recover, (boss.bossScriptQueue?.length ?? 0) > 0); }
                    else { patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(); }
                  }
                }
              } else if (st === 'skadi-ice-windup') {
                // §6.28-9【新設】: 氷塊設置ループの直前に静止windupを挟む(T4フラッシュ+SEはここが担う)。
                if (newGameTime >= (boss.bossStateUntil ?? 0)) {
                  patch.bossState = 'skadi-ice';
                  patch.bossBurstLeft = HB_SK.ice.count;
                  patch.bossBurstNextAt = newGameTime;
                }
              } else if (st === 'skadi-blade-windup') {
                if (newGameTime >= (boss.bossStateUntil ?? 0)) {
                  patch.bossState = 'skadi-blade';
                  patch.bossBurstLeft = HB_SK.blade.count;
                  patch.bossBurstNextAt = newGameTime;
                }
              } else if (st === 'skadi-ice') {
                // スカジ: 固定ヘイト対象の足元へ氷塊マーカーを SKADI_ICE_GAP_MS おきに SKADI_ICE_COUNT 個設置。
                // 各マーカーは設置位置に固定で2秒テレグラフ後に起爆(動けば避けられる)。
                const left = boss.bossBurstLeft ?? 0;
                if (left > 0 && newGameTime >= (boss.bossBurstNextAt ?? 0)) {
                  const aimTgt = lockedAttackAim();
                  useGameStore.getState().spawnSkadiIce(aimTgt.x, aimTgt.y, newGameTime, newGameTime + HB_SK.ice.telegraphMs, boss.id);
                  patch.bossBurstLeft = left - 1;
                  patch.bossBurstNextAt = newGameTime + HB_SK.ice.gapMs;
                  if (left - 1 <= 0) {
                    if (SKADI_SCRIPT_ENABLED) { patch.bossState = 'skadi-ice-recover'; patch.bossStateUntil = newGameTime + choreographyRecoverMs(HB_SK.ice.recover, (boss.bossScriptQueue?.length ?? 0) > 0); }
                    else { patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(); }
                  }
                }
              } else if (st === 'skadi-blade') {
                // スカジ: 固定ヘイト対象の周辺ランダム位置に、設置時の対象方向を向いた氷刃を
                // SKADI_BLADE_GAP_MS おきに SKADI_BLADE_COUNT 個設置。各刃は設置1秒後にその向きへ高速発射。
                const left = boss.bossBurstLeft ?? 0;
                if (left > 0 && newGameTime >= (boss.bossBurstNextAt ?? 0)) {
                  const aimTgt = lockedAttackAim();
                  const a0 = Math.random() * Math.PI * 2;
                  const dist = HB_SK.blade.ringMin + Math.random() * (HB_SK.blade.ringMax - HB_SK.blade.ringMin);
                  const sx = aimTgt.x + Math.cos(a0) * dist, sy = aimTgt.y + Math.sin(a0) * dist;
                  const aim = Math.atan2(aimTgt.y - sy, aimTgt.x - sx); // 設置時のヘイト対象方向(以後固定)
                  useGameStore.getState().spawnSkadiBlade(sx, sy, aim, newGameTime + HB_SK.blade.delayMs, boss.id);
                  patch.bossBurstLeft = left - 1;
                  patch.bossBurstNextAt = newGameTime + HB_SK.blade.gapMs;
                  if (left - 1 <= 0) {
                    if (SKADI_SCRIPT_ENABLED) { patch.bossState = 'skadi-blade-recover'; patch.bossStateUntil = newGameTime + choreographyRecoverMs(HB_SK.blade.recover, (boss.bossScriptQueue?.length ?? 0) > 0); }
                    else { patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(); }
                  }
                }
              } else if (st === 'laser-windup') {
                // §6.33(LASER-TRACK): 溜め3秒(静止)。新挙動=前段2700msは照準が物理追尾(同速104.4+
                // 加速度上限=立ち上がり1秒)・終段300msはロック(完全固定+フラッシュSE)。
                // 旧挙動(?mimirtrack=0)=開始時に方向ロックしたまま待つだけ(v0.25.2935と同一)。
                const lwUntil = boss.bossStateUntil ?? 0;
                if (MIMIR_TRACK_ENABLED) {
                  if (mimirLaserPhase(newGameTime, lwUntil) === 'track') {
                    const aimTgt = lockedAttackAim();
                    // v0.25.2949: 速度ビルド(ランナー等)でも「走るだけで振り切れる」が起きないよう、
                    // 追尾キャップを対象の実効速度(player.speed×GAME_SPEED)へ比例スケールする。
                    const caps = mimirLaserTrackCaps((player.speed ?? 87) * GAME_SPEED);
                    // v0.25.2956: 進行度を渡す=じわじわ加速→進行30%で追い越し速度+振り切り往復→
                    // 残り600msで収束(mimirLaserTrack.tsの3ノブ)。
                    const lwProgress = Math.max(0, Math.min(1, 1 - (lwUntil - newGameTime) / MIMIR_LASER_WINDUP_MS));
                    const stepped = stepLaserAim(
                      { x: boss.aiTargetX ?? aimTgt.x, y: boss.aiTargetY ?? aimTgt.y, vx: bs.mimirAimVX, vy: bs.mimirAimVY },
                      aimTgt.x, aimTgt.y, deltaTime, caps.maxPxS, caps.accel, lwProgress,
                    );
                    patch.aiTargetX = stepped.x; patch.aiTargetY = stepped.y;
                    bs.mimirAimVX = stepped.vx; bs.mimirAimVY = stepped.vy;
                  } else if (bs.mimirLockSfxUntil !== lwUntil) {
                    // ロックの瞬間(1回だけ): 「今から動かない」の合図。描画側は残り時間で同じ瞬間を検出する。
                    bs.mimirLockSfxUntil = lwUntil;
                    playSfx(BOSS_ALERT_SFX_KEY);
                  }
                }
                if (newGameTime >= lwUntil) {
                  patch.bossState = 'laser-fire';
                  patch.bossStateUntil = newGameTime + MIMIR_LASER_FIRE_MS;
                  playSfx('heavy-impact'); // レーザー発射音(使い回し)
                  useGameStore.getState().triggerShake(MIMIR_LASER_FIRE_MS, HB_MI.laser.shakeMag); // 発射中ずっと揺れる
                }
              } else if (st === 'laser-broken') {
                // §6.33-2-2: 弱点窓で近接中断された(gameStore側でlaser-brokenへ遷移済み)。1700msの
                // パニッシュ窓=無行動。SEはここで1回だけ(gameStoreはplaySfxを持てないため)。
                if (bs.mimirBrokenSfxUntil !== (boss.bossStateUntil ?? 0)) {
                  bs.mimirBrokenSfxUntil = boss.bossStateUntil ?? 0;
                  playSfx('counter');
                }
                if (newGameTime >= (boss.bossStateUntil ?? 0)) {
                  patch.bossState = 'chase';
                  patch.bossNextActionAt = nextActionDelay();
                }
              } else if (st === 'laser-fire') {
                // 発射中: 新挙動=ロックした線のまま固定発射(§6.33 掟「ロック後は動かさない」を発射まで貫く)。
                // 旧挙動(?mimirtrack=0)=固定ヘイト対象をゆっくり追尾(注視点 aiTarget を低速 lerp)。
                // ビーム帯(線分±半太さ)に居れば継続ダメージ(damagePlayer が i-frame で間引く)。
                const aimTgt = lockedAttackAim();
                let nax = boss.aiTargetX ?? aimTgt.x, nay = boss.aiTargetY ?? aimTgt.y;
                if (!MIMIR_TRACK_ENABLED) {
                  const k = Math.min(1, MIMIR_LASER_AIM_TRACK * deltaTime);
                  nax = nax + (aimTgt.x - nax) * k;
                  nay = nay + (aimTgt.y - nay) * k;
                  patch.aiTargetX = nax; patch.aiTargetY = nay;
                }
                let ux = nax - bcx, uy = nay - bcy;
                const ul = Math.hypot(ux, uy) || 1; ux /= ul; uy /= ul;
                const ppx = player.x + player.width / 2, ppy = player.y + player.height / 2;
                const tproj = Math.max(0, Math.min(MIMIR_LASER_RANGE, (ppx - bcx) * ux + (ppy - bcy) * uy));
                const cxp = bcx + ux * tproj, cyp = bcy + uy * tproj;
                const pr = Math.max(player.width, player.height) / 2;
                if (Math.hypot(ppx - cxp, ppy - cyp) <= MIMIR_LASER_HALF_WIDTH + pr) {
                  const died = damagePlayer(HB_MI.laser.damage, 'ミーミルのレーザー', cxp, cyp, undefined, undefined, 'mimir-laser'); // G4a計測タグ(記録専用)
                  if (died) triggerPlayerDeath(ppx, ppy);
                }
                // G4b(§2.9): ビーム帯はゴースト(守護霊)にも当たる(同じ線分±半太さ・同じダメージ。
                // 継続ダメージの間引きはdamageSummonのi-frame=プレイヤーのdamagePlayer i-frameと同型)。
                applyGhostAllyCapsuleHit(bcx, bcy, bcx + ux * MIMIR_LASER_RANGE, bcy + uy * MIMIR_LASER_RANGE,
                  MIMIR_LASER_HALF_WIDTH, HB_MI.laser.damage, (x, y) => spawnBurst(x, y, '#bae6fd', 3), 'capsule:mimir-laser');
                if (newGameTime >= (boss.bossStateUntil ?? 0)) {
                  if (MIMIR_SCRIPT_ENABLED) { patch.bossState = 'laser-recover'; patch.bossStateUntil = newGameTime + choreographyRecoverMs(HB_MI.laser.recover, (boss.bossScriptQueue?.length ?? 0) > 0); }
                  else { patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(); }
                }
              } else if (st === 'dash-windup') {
                // 溜め中はゆっくり後退り(ターゲットから離れる)してから突進(社長指示)。
                {
                  const aimTgt = lockedAttackAim();
                  const bdx = bcx - aimTgt.x, bdy = bcy - aimTgt.y;
                  const bl = Math.hypot(bdx, bdy) || 1;
                  const back = speed * HB_C.dash.backstepMult * bossMoveDt;
                  patch.x = boss.x + (bdx / bl) * back; patch.y = boss.y + (bdy / bl) * back;
                }
                if (newGameTime >= (boss.bossStateUntil ?? 0)) {
                  patch.bossState = 'dash'; patch.bossStateUntil = newGameTime + HB_C.dash.ms;
                  if (!hiddenScriptOn) {
                    // 旧挙動: windup終了時に再照準(新スクリプト無効時のみ)。有効時はbeginHiddenDashが
                    // windup開始の瞬間に既にbs.dashDirXをロック済みなので、ここでは再照準しない(掟W4)。
                    const aimTgt = lockedAttackAim();
                    const ddx = aimTgt.x - bcx, ddy = aimTgt.y - bcy;
                    const ddl = Math.hypot(ddx, ddy) || 1;
                    bs.dashDirX = ddx / ddl; bs.dashDirY = ddy / ddl;
                  }
                }
              } else if (st === 'dash') {
                // ダッシュ攻撃: 基本は真っ直ぐ直進。毎フレームほんの少しだけ固定ヘイト対象へ寄せる(弱いホーミング)。
                const aimTgt = lockedAttackAim();
                const tdx = aimTgt.x - bcx, tdy = aimTgt.y - bcy;
                const tl = Math.hypot(tdx, tdy) || 1;
                const dx = bs.dashDirX + (tdx / tl) * HB_C.dash.homing;
                const dy = bs.dashDirY + (tdy / tl) * HB_C.dash.homing;
                const dnl = Math.hypot(dx, dy) || 1;
                bs.dashDirX = dx / dnl; bs.dashDirY = dy / dnl; // 向きを少しずつ更新(累積で緩く曲がる)
                const mv = speed * HB_C.dash.speedMult * bossMoveDt;
                patch.x = boss.x + bs.dashDirX * mv; patch.y = boss.y + bs.dashDirY * mv;
                bs.vx = bs.dashDirX * speed * HB_C.dash.speedMult; // 突進後のチェイスへ慣性を引き継ぐ
                bs.vy = bs.dashDirY * speed * HB_C.dash.speedMult;
                if (newGameTime >= (boss.bossStateUntil ?? 0)) {
                  if (hiddenScriptOn) { patch.bossState = 'dash-recover'; patch.bossStateUntil = newGameTime + choreographyRecoverMs(HB_C.dash.recover, (boss.bossScriptQueue?.length ?? 0) > 0); }
                  else { patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(); }
                }
              } else if (st === 'burst-recover') {
                if (newGameTime >= (boss.bossStateUntil ?? 0)) hiddenRecoverAdvance('burst');
              } else if (st === 'radial-recover') {
                if (newGameTime >= (boss.bossStateUntil ?? 0)) hiddenRecoverAdvance('radial');
              } else if (st === 'dash-recover') {
                if (newGameTime >= (boss.bossStateUntil ?? 0)) hiddenRecoverAdvance('dash');
              } else if (st === 'laser-recover') {
                if (newGameTime >= (boss.bossStateUntil ?? 0)) hiddenRecoverAdvance('laser');
              } else if (st === 'skadi-ice-recover') {
                if (newGameTime >= (boss.bossStateUntil ?? 0)) hiddenRecoverAdvance('ice');
              } else if (st === 'skadi-blade-recover') {
                if (newGameTime >= (boss.bossStateUntil ?? 0)) hiddenRecoverAdvance('blade');
              } else if (st === 'bite-windup') {
                // ミーミル「群体の噛みつき」(§6.28-5/§6.28-15): 本体直下の群体が一斉に噛む=1フレームで
                // 円AoE(giantの踏み鳴らしと同じ作法。既存pumpkinBlasts配管への相乗り)。
                if (newGameTime >= (boss.bossStateUntil ?? 0)) {
                  useGameStore.setState(state => ({
                    pumpkinBlasts: [...state.pumpkinBlasts, { x: bcx, y: bcy, radius: MIMIR_BITE_RADIUS, damage: boss.damage, enemyId: boss.id }],
                  }));
                  patch.bossState = 'bite-recover';
                  patch.bossStateUntil = newGameTime + choreographyRecoverMs(HB_MI.bite.recover, (boss.bossScriptQueue?.length ?? 0) > 0);
                }
              } else if (st === 'bite-recover') {
                if (newGameTime >= (boss.bossStateUntil ?? 0)) {
                  patch.mimirBiteReadyAt = newGameTime + HB_MI.bite.cdMs;
                  hiddenRecoverAdvance('bite');
                }
              } else if (st === 'coil-windup') {
                // ヨルムンガルド「うねり」(§6.28-7・近接専用・Phase2限定): giantの薙ぎ払いと同じ作法
                // (windup終了でカプセル判定を1件だけ積み、220msの'active'表示を経てrecoverへ)。
                if (newGameTime >= (boss.bossStateUntil ?? 0)) {
                  const sfx = boss.aiFromX ?? bcx, sfy = boss.aiFromY ?? bcy;
                  const stx = boss.aiTargetX ?? bcx, sty = boss.aiTargetY ?? bcy;
                  useGameStore.setState(state => ({
                    pumpkinBlasts: [...state.pumpkinBlasts, {
                      x: (sfx + stx) / 2, y: (sfy + sty) / 2, radius: HB_JO.coil.halfWidth,
                      damage: boss.damage, enemyId: boss.id,
                      capsule: { fx: sfx, fy: sfy, tx: stx, ty: sty, halfWidth: HB_JO.coil.halfWidth },
                    }],
                  }));
                  patch.bossState = 'coil'; patch.bossStateUntil = newGameTime + HB_JO.coil.active;
                }
              } else if (st === 'coil') {
                if (newGameTime >= (boss.bossStateUntil ?? 0)) {
                  patch.bossState = 'coil-recover'; patch.bossStateUntil = newGameTime + choreographyRecoverMs(HB_JO.coil.recover, (boss.bossScriptQueue?.length ?? 0) > 0);
                }
              } else if (st === 'coil-recover') {
                if (newGameTime >= (boss.bossStateUntil ?? 0)) {
                  patch.jormCoilReadyAt = newGameTime + HB_JO.coil.cdMs;
                  hiddenRecoverAdvance('coil');
                }
              } else if (st === 'cage-windup') {
                // スカジ「氷結の檻」(§6.28-9・全帯・Phase3限定): ジブリル聖別(JIBRIL_CONSECRATE_*)と同じ
                // 「N+1分割の1つを空ける」作法(固定ヘイト対象中心のリング・空ける向きは設置の瞬間に確定=掟W4)。
                if (newGameTime >= (boss.bossStateUntil ?? 0)) {
                  const aimTgt = lockedAttackAim();
                  const gapAngle = Math.random() * Math.PI * 2;
                  for (let i = 1; i <= HB_SK.cage.count; i++) {
                    const ang = gapAngle + (Math.PI * 2 / (HB_SK.cage.count + 1)) * i;
                    const ix = aimTgt.x + Math.cos(ang) * HB_SK.cage.ringRadius, iy = aimTgt.y + Math.sin(ang) * HB_SK.cage.ringRadius;
                    useGameStore.getState().spawnSkadiIce(ix, iy, newGameTime, newGameTime + HB_SK.ice.telegraphMs, boss.id);
                  }
                  patch.bossState = 'cage-recover';
                  patch.bossStateUntil = newGameTime + choreographyRecoverMs(HB_SK.cage.recover, (boss.bossScriptQueue?.length ?? 0) > 0);
                }
              } else if (st === 'cage-recover') {
                if (newGameTime >= (boss.bossStateUntil ?? 0)) {
                  patch.skadiCageReadyAt = newGameTime + HB_SK.cage.cdMs;
                  hiddenRecoverAdvance('cage');
                }
              } else if (st === 'issen-windup') {
                // 一閃: 3秒溜め・静止(赤い明滅は描画側=pixiSceneがbossStateを見て演出・社長指示)。
                // 方向は選択時(action-roll)に既にロック済み=溜め中は相手側を切り替えない(社長修正指示)。
                const { overlap, counterActive } = thorBodyOverlapNow();
                if (overlap && counterActive) {
                  thorCounterHit(bcx, bcy);
                } else if (newGameTime >= (boss.bossStateUntil ?? 0)) {
                  patch.bossState = 'issen-dash';
                  patch.bossStateUntil = newGameTime + HB_TH.issen.dashMs;
                }
              } else if (st === 'issen-dash') {
                // 一閃(高速移動): 終着点まで直進。当たり判定=もとの帯ではなく、この赤いライン上のみ(社長指示)。
                const fx = boss.aiFromX ?? bcx, fy = boss.aiFromY ?? bcy;
                const tx = boss.aiTargetX ?? bcx, ty = boss.aiTargetY ?? bcy;
                const t = Math.max(0, Math.min(1, 1 - ((boss.bossStateUntil ?? newGameTime) - newGameTime) / HB_TH.issen.dashMs));
                patch.x = (fx + (tx - fx) * t) - boss.width / 2;
                patch.y = (fy + (ty - fy) * t) - boss.height / 2;
                let lux = tx - fx, luy = ty - fy;
                const lul = Math.hypot(lux, luy) || 1; lux /= lul; luy /= lul;
                const lineLen = Math.hypot(tx - fx, ty - fy);
                const tproj = Math.max(0, Math.min(lineLen, (pcx - fx) * lux + (pcy - fy) * luy));
                const cxp = fx + lux * tproj, cyp = fy + luy * tproj;
                const pr = Math.max(player.width, player.height) / 2;
                let countered = false;
                if (distToBandRect({ x: pcx, y: pcy }, { x: fx, y: fy }, { x: tx, y: ty }, HB_TH.issen.halfWidth) <= pr) { // v0.25.3496: 描いてある四角
                  const cp = useGameStore.getState().player;
                  if (Date.now() <= cp.counterWindowEnd) {
                    thorCounterHit(cxp, cyp);
                    countered = true;
                  } else {
                    const died = damagePlayer(boss.damage, 'トールの一閃', cxp, cyp, undefined, undefined, 'thor-issen'); // G4a計測タグ(記録専用)
                    useGameStore.getState().spawnImageMark(cxp, cyp, 'zan', { scale: 1.0, duration: 1000 }); // 社長指示: 食らうと「斬」
                    if (died) triggerPlayerDeath(pcx, pcy);
                  }
                }
                // G4b(§2.9): 一閃はゴースト(守護霊)にも当たる(同じ線分カプセル・同じboss.damage・同じフレーム。
                // 連続ヒットはdamageSummonのi-frameが間引く。プレイヤー側の判定は上のブロックのまま1bit不変)。
                applyGhostAllyCapsuleHit(fx, fy, tx, ty, HB_TH.issen.halfWidth, boss.damage, (x, y) => spawnBurst(x, y, '#bae6fd', 3), 'capsule:thor-issen');
                if (!countered && newGameTime >= (boss.bossStateUntil ?? 0)) {
                  // §6.28-10「全技に硬直(recover)を新設」: 硬直900ms・青白tint(描画側)。既存のリード/
                  // 射程/半幅/カウンター等は無改変。?thorscript=0の間は現行どおり即chase復帰。
                  if (THOR_SCRIPT_ENABLED) { patch.bossState = 'issen-recover'; patch.bossStateUntil = newGameTime + choreographyRecoverMs(HB_TH.issen.recover, (boss.bossScriptQueue?.length ?? 0) > 0); }
                  else { patch.bossState = 'chase'; patch.bossNextActionAt = thorNextActionDelay(); }
                }
              } else if (st === 'tsuki-windup') {
                // 突き: 1秒停止(社長指示)。線の予告は無し=素早い踏み込みそのものが合図。
                // 社長指示v0.25.1621: 溜め中は狙い点(aiTarget)をプレイヤー速度の半分で固定ヘイト対象へ追従。
                // = 瞬間スナップをやめ、動けば狙いが遅れて外せる(実行時はこの遅延点へ突く)。
                const aimTgt = lockedAttackAim();
                const aimX = boss.aiTargetX ?? aimTgt.x, aimY = boss.aiTargetY ?? aimTgt.y;
                const adx = aimTgt.x - aimX, ady = aimTgt.y - aimY;
                const adl = Math.hypot(adx, ady);
                const trackStep = Math.min(adl, player.speed * HB_TH.tsuki.trackFrac * bossMoveDt);
                const naimX = adl > 0.001 ? aimX + (adx / adl) * trackStep : aimX;
                const naimY = adl > 0.001 ? aimY + (ady / adl) * trackStep : aimY;
                patch.aiTargetX = naimX; patch.aiTargetY = naimY; // 溜め中は遅延追従する狙い点を保持
                const { overlap, counterActive } = thorBodyOverlapNow();
                if (overlap && counterActive) {
                  thorCounterHit(bcx, bcy);
                } else if (newGameTime >= (boss.bossStateUntil ?? 0)) {
                  patch.bossState = 'tsuki';
                  patch.bossStateUntil = newGameTime + HB_TH.tsuki.ms;
                  // 突く方向=遅延した狙い点(naim)への向き。射程ぶん伸ばして突きラインを確定。
                  const ddx = naimX - bcx, ddy = naimY - bcy;
                  const ddl = Math.hypot(ddx, ddy) || 1;
                  patch.aiFromX = bcx; patch.aiFromY = bcy;
                  patch.aiTargetX = bcx + (ddx / ddl) * HB_TH.tsuki.range;
                  patch.aiTargetY = bcy + (ddy / ddl) * HB_TH.tsuki.range;
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
                if (Math.hypot(pcx - cxp, pcy - cyp) <= HB_TH.tsuki.halfWidth + pr) {
                  const cp = useGameStore.getState().player;
                  if (Date.now() <= cp.counterWindowEnd) {
                    thorCounterHit(cxp, cyp);
                    countered = true;
                  } else {
                    const died = damagePlayer(boss.damage, 'トールの突き', cxp, cyp, undefined, undefined, 'thor-tsuki'); // G4a計測タグ(記録専用)
                    if (died) triggerPlayerDeath(pcx, pcy);
                  }
                }
                // G4b(§2.9): 突きもゴーストに当たる(一閃と同じ作法)。
                applyGhostAllyCapsuleHit(fx, fy, tx, ty, HB_TH.tsuki.halfWidth, boss.damage, (x, y) => spawnBurst(x, y, '#bae6fd', 3), 'capsule:thor-tsuki');
                if (!countered && newGameTime >= (boss.bossStateUntil ?? 0)) {
                  if (THOR_SCRIPT_ENABLED) { patch.bossState = 'tsuki-recover'; patch.bossStateUntil = newGameTime + choreographyRecoverMs(HB_TH.tsuki.recover, (boss.bossScriptQueue?.length ?? 0) > 0); }
                  else { patch.bossState = 'chase'; patch.bossNextActionAt = thorNextActionDelay(); }
                }
              } else if (st === 'harai-windup') {
                // 払い: 溜め中は本体静止(社長指示・立ち止まる)。ロック済みの並行ラインを予告表示(描画側)。
                const { overlap, counterActive } = thorBodyOverlapNow();
                if (overlap && counterActive) {
                  thorCounterHit(bcx, bcy);
                } else if (newGameTime >= (boss.bossStateUntil ?? 0)) {
                  patch.bossState = 'harai';
                  patch.bossStateUntil = newGameTime + HB_TH.harai.active;
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
                if (distToBandRect({ x: pcx, y: pcy }, { x: fx, y: fy }, { x: tx, y: ty }, HB_TH.harai.halfWidth) <= pr) { // v0.25.3496: 描いてある四角
                  const cp = useGameStore.getState().player;
                  if (Date.now() <= cp.counterWindowEnd) {
                    thorCounterHit(cxp, cyp);
                    countered = true;
                  } else {
                    const died = damagePlayer(boss.damage, 'トールの払い', cxp, cyp, undefined, undefined, 'thor-harai'); // G4a計測タグ(記録専用)
                    if (died) triggerPlayerDeath(pcx, pcy);
                  }
                }
                // G4b(§2.9): 払いもゴーストに当たる(一閃と同じ作法)。
                applyGhostAllyCapsuleHit(fx, fy, tx, ty, HB_TH.harai.halfWidth, boss.damage, (x, y) => spawnBurst(x, y, '#bae6fd', 3), 'capsule:thor-harai');
                if (!countered && newGameTime >= (boss.bossStateUntil ?? 0)) {
                  patch.bossCircleDir = 1; // 払い後は既定の時計回りへ復帰(社長指示・据え置き)
                  if (THOR_SCRIPT_ENABLED) { patch.bossState = 'harai-recover'; patch.bossStateUntil = newGameTime + choreographyRecoverMs(HB_TH.harai.recover, (boss.bossScriptQueue?.length ?? 0) > 0); }
                  else { patch.bossState = 'chase'; patch.bossNextActionAt = thorNextActionDelay(); }
                }
              } else if (st === 'issen-recover') {
                // §6.28-10「分岐する連携」: 硬直明けに確率(Phase2=50%/Phase3=70%)で2発目。
                // 2発目の技は"その瞬間の距離"だけで決まる(プレイヤーが選ぶ・§6.28-10表)。硬直中も
                // カウンター可(W7)。
                const { overlap, counterActive } = thorBodyOverlapNow();
                if (overlap && counterActive) {
                  thorCounterHit(bcx, bcy);
                } else if (newGameTime >= (boss.bossStateUntil ?? 0)) {
                  thorRecoverAdvance();
                }
              } else if (st === 'tsuki-recover') {
                const { overlap, counterActive } = thorBodyOverlapNow();
                if (overlap && counterActive) {
                  thorCounterHit(bcx, bcy);
                } else if (newGameTime >= (boss.bossStateUntil ?? 0)) {
                  thorRecoverAdvance();
                }
              } else if (st === 'harai-recover') {
                const { overlap, counterActive } = thorBodyOverlapNow();
                if (overlap && counterActive) {
                  thorCounterHit(bcx, bcy);
                } else if (newGameTime >= (boss.bossStateUntil ?? 0)) {
                  thorRecoverAdvance();
                }
              } else if (st === 'jump-windup') {
                // ジャンプ攻撃の溜め(短め)。静止・カウンター可能(社長指示)。
                const { overlap, counterActive } = thorBodyOverlapNow();
                if (overlap && counterActive) {
                  thorCounterHit(bcx, bcy);
                } else if (newGameTime >= (boss.bossStateUntil ?? 0)) {
                  patch.bossState = 'jump-attack';
                  patch.bossStateUntil = newGameTime + HB_TH.jump.ms;
                  patch.aiFromX = bcx; patch.aiFromY = bcy;
                  // THOR_SCRIPT_ENABLED時は溜め開始時に既にaiTargetX/Yをロック済み(上のjump-windup突入時)
                  // なのでここでは再照準しない(掟W4)。無効時は現行どおり溜め終了時にロックする。
                  if (!THOR_SCRIPT_ENABLED) {
                    const aim = lockAttackAim();
                    patch.aiTargetX = aim.x; patch.aiTargetY = aim.y;
                  }
                }
              } else if (st === 'jump-attack') {
                // ジャンプ攻撃(実行): ハンターの速いジャンプ感でロック済みの着地点まで移動(社長指示)。
                const fx = boss.aiFromX ?? bcx, fy = boss.aiFromY ?? bcy;
                const tx = boss.aiTargetX ?? bcx, ty = boss.aiTargetY ?? bcy;
                const t = Math.max(0, Math.min(1, 1 - ((boss.bossStateUntil ?? newGameTime) - newGameTime) / HB_TH.jump.ms));
                // v0.25.3076(社長指示「滑空って全てのジャンプね」): 等速の線形補間をやめ、両端で
                // 速度も加速度も0になる曲線で運ぶ(着地時刻・着地点・着地爆発はすべて不変)。
                const tEs = airHopEase01(t);
                patch.x = (fx + (tx - fx) * tEs) - boss.width / 2;
                patch.y = (fy + (ty - fy) * tEs) - boss.height / 2;
                if (newGameTime >= (boss.bossStateUntil ?? 0)) {
                  // 着地: 既存のpumpkinBlasts(着地爆発)パイプラインへ積む=カウンター/被弾処理を丸ごと再利用。
                  useGameStore.setState(state => ({
                    pumpkinBlasts: [...state.pumpkinBlasts, { x: tx, y: ty, radius: HB_TH.jump.radius, damage: boss.damage, enemyId: boss.id, moveKey: 'thor-jump' }], // moveKey=G4a計測タグ(記録専用)
                  }));
                  patch.bossState = 'jump-recover';
                  patch.bossStateUntil = newGameTime + choreographyRecoverMs(HB_TH.jump.recover, (boss.bossScriptQueue?.length ?? 0) > 0);
                }
              } else if (st === 'jump-recover') {
                // 着地後の硬直。静止・カウンター可能。
                const { overlap, counterActive } = thorBodyOverlapNow();
                if (overlap && counterActive) {
                  thorCounterHit(bcx, bcy);
                } else if (newGameTime >= (boss.bossStateUntil ?? 0)) {
                  thorRecoverAdvance();
                }
              } else if (st === 'counter-leap') {
                // カウンター成立後、近接距離ギリギリ外までロック済みの後退先へ高速移動(社長指示)。
                const fx = boss.aiFromX ?? bcx, fy = boss.aiFromY ?? bcy;
                const tx = boss.aiTargetX ?? bcx, ty = boss.aiTargetY ?? bcy;
                const t = Math.max(0, Math.min(1, 1 - ((boss.bossStateUntil ?? newGameTime) - newGameTime) / HB_TH.counterLeapMs));
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
                const t = Math.max(0, Math.min(1, 1 - ((boss.bossStateUntil ?? newGameTime) - newGameTime) / HB_TH.backstep.ms));
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
                const t = Math.max(0, Math.min(1, 1 - ((boss.bossStateUntil ?? newGameTime) - newGameTime) / HB_TH.orbitStep.ms));
                patch.x = (fx + (tx - fx) * t) - boss.width / 2;
                patch.y = (fy + (ty - fy) * t) - boss.height / 2;
                bs.vx = 0; bs.vy = 0;
                if (newGameTime >= (boss.bossStateUntil ?? 0)) {
                  patch.bossState = 'chase';
                }
              }
              // ボスメーカー: 単独再生の立ち下がり(2)=**状態機械の直後**。技がchaseへ戻ったその
              // フレームで終える(停止中に「余分な1フレームだけ歩く」が起きない)。
              settleHiddenBossPlayback(patch.bossState ?? boss.bossState);
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
                spawnBossCrushExplosionFx(cxFx, cyFx); // v0.25.3028: 大きめの爆発+強い揺れ(社長指示)
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
          reportSuppressedError('hiddenBoss', err); // v0.25.3324: 実機で見えない握り潰し例外を左下に出す
         }
        }

        // --- idol(stage-2隠しボス)専用ブロック(PACING_PUZZLE.md §6.28-20・社長指示で配置確定 v0.25.2382) ---
        // campaign.tsのhiddenBoss機構(stage.hiddenBoss)には乗らない専用の独立した状態機械。
        // mimir/jormungand/skadi/thorとはbossRef(単一スロット)を共有しない(idolは「追跡ではなく
        // 常にプレイヤーから離れる」という別物の移動則を持つため)。
        // 実体は2経路: (1) gameStore.tsのresetGameが屋外ラボ廊下(labDoc=ゴール資料の位置)から
        // 原点対称に算出した座標(src/world/labIdolSpot.tsのlabIdolSpotForDoc)へ、他のガード
        // (mkGuard)と同じ作法(fixed:true/dormant:true/homeX・Y/aggroRange=LAB_VISION_RANGE)で
        // 固定敵として1体置く。isHiddenBoss型はupdateEnemiesの通常AI(起床処理含む)を素通りする
        // (gameStore.ts:7082)ため、dormant中の待機とaggroRange+視線での起床は下のブロック内で
        // 自前に行う(「探しに行った人だけが会う」=近づくまで何もしない、を担保する箇所)。
        // (2) ?idolnow=1 は実機/自動検証用の強制召喚(dormantを経由せず即chase開始。プレイヤー付近へ
        // 出す・giant/gatebossの?castlenow=1/?gateboss=1と同じ作法)。
        // 【教訓・旧v0.25.2381の反省】以前はこのifに`!indoor`を付けていたが、`indoor`(indoorMode)は
        // 現行キャンペーンのどのステージでもtrueにならない(campaign.ts:219「屋内迷路モードindoorは
        // 本作では不採用」)ため、`!indoor`は元から常にtrueで何も塞いでいなかった。よって今回この条件を
        // 外したこと自体は無害だが、それだけでは到達可能にはならない——本当に足りなかったのは、
        // idolを実際に使われる屋外ラボ経路(labDoc)側に湧かせる配線(上記(1))の方だった
        // (次に読む人が同じ回り道をしないための記録)。
        if (!danceTest && !useGameStore.getState().gameWon) {
         try {
          if ((FORCE_IDOL || practiceForces('idolnow')) && !idolForceRef.current) {
            idolForceRef.current = true;
            const pcx0 = player.x + player.width / 2, pcy0 = player.y + player.height / 2;
            const spawnAng = Math.random() * Math.PI * 2;
            const spawnDist = 320; // 遠帯(>340)のすぐ内側=aim/fanから体験できる初期距離
            const ix = pcx0 + Math.cos(spawnAng) * spawnDist, iy = pcy0 + Math.sin(spawnAng) * spawnDist;
            const idolE = spawnEnemyAt('idol', ix - 20, iy - 10, newGameTime);
            idolE.fromEvent = true; // ×5は掛けない(ゲート2ボスと同じ作法・社長指示v0.25.1595の踏襲)
            // v0.25.3677(検収監査): idolは裏ボス経路(4861)を通らない独立スポーンなので、ここにも
            // ステージ係数ヘルパを通す(今日はS2=1.0で同値・将来の「表示=実戦」ズレの予防)。
            {
              const idMult = stageBossDiffMults();
              idolE.health = Math.round(idolE.health * idMult.hp);
              idolE.maxHealth = Math.round(idolE.maxHealth * idMult.hp);
              idolE.damage = Math.round(idolE.damage * idMult.dmg);
            }
            idolE.bossState = 'chase';
            idolE.bossPhase = 1;
            idolE.bossNextActionAt = newGameTime + IDOL_ACTION_MIN_MS;
            // 設置時の向き(社長指示)をデバッグ召喚にも揃える: 出現位置とプレイヤーの左右関係だけで決める
            // (固定配置=src/world/labIdolSpot.tsのlabIdolSpotForDocと同じ「原点/プレイヤー側を向く」式)。
            idolE.idolFacingLeft = ix > pcx0;
            // v0.25.2614(社長報告「ボスモードだからかな？アイドル動かない」): 先に**盤面の既存アイドルを消す**。
            // ラボ資料のステージは resetGame が固定・休眠のアイドルを最奥に置くので、消さないと2体並び、
            // コントローラが遠くの休眠個体だけを拾って**近くの1体が誰にも動かされない**(pickActiveIdolの注記)。
            useGameStore.setState(stt => ({ enemies: stt.enemies.filter(e => e.type !== 'idol') }));
            addEnemy(idolE);
            useGameStore.getState().triggerAttention(ix, iy, bossCutinPayload('idol')); // §6.36 監査指摘7: 練習出撃も実戦と同じカットイン
          }
          // PACING_PUZZLE.md §6.38 B1(賞金首・B1.5で修正): デバッグ出現専用(`?bountynow=1`+`?bountytype=`)。
          // 位置=プレイヤーから絶対700〜1000px(§2)+clampRectToPlayableArea。dormant:true+aggroRange+
          // homeX/Y(=城ボスと同じdormant→交戦の経路)。HP=2000×スポーン時の実効難易度倍率(§3)。
          // 抑止ゲート(bountySpawnBlocked)はB4で配線=デバッグ出現はここを経由せず常に出す(検証を止めない)。
          // B1.5-3(重要): fromEvent=true を撤去(イベント終了一掃/救助の攻撃者カウント/NPC逃走・射撃対象/
          // 囲い円クランプへの混入原因だった。保護は既存のisEngageableBoss/isEnemyCapProtectedで足りる)。
          if ((FORCE_BOUNTY || practiceForces('bountynow')) && !bountyForceRef.current) {
            bountyForceRef.current = true;
            const bountyTypeOf = (raw: string | null): 'bounty-ranged' | 'bounty-melee' | 'bounty-balance' | 'bounty-maiko' => {
              if (raw === 'ranged') return 'bounty-ranged';
              if (raw === 'melee') return 'bounty-melee';
              if (raw === 'balance') return 'bounty-balance';
              if (raw === 'maiko') return 'bounty-maiko';
              // ★種別未指定(?bountynow=1のみ)は**選択ステージの台帳**を引く
              // (research/STAGE_DIFFICULTY.md=実戦と同じ割当で検証できる)。
              const byStage = BOUNTY_TYPE_BY_STAGE[getSelectedStageId()];
              if (byStage && isBountyType(byStage)) return byStage as 'bounty-ranged' | 'bounty-melee' | 'bounty-balance' | 'bounty-maiko';
              // 台帳に行が無いステージでは従来どおり4種からランダム(デバッグ用の自由度を残す・v0.25.3399
              // 社長報告「遠距離しか出てこない」=旧: ranged固定既定は誤解を生んだ)。
              const all = ['bounty-ranged', 'bounty-melee', 'bounty-balance', 'bounty-maiko'] as const;
              return all[Math.floor(Math.random() * all.length)];
            };
            // 練習枠(変異体対策室)が型を指定していればそれを優先する(既存URL経路?bountytype=は
            // 直リンク検証用にそのまま残す。practiceBossType()はactiveSlot.bossTypeを返す)。
            const practiceType = practiceBossType();
            const bType = (practiceType && isBountyType(practiceType)) ? practiceType : bountyTypeOf(FORCE_BOUNTY_TYPE);
            // §6.38 B4: 出現位置・演出はspawnBountyEncounter(自然湧きと共用・二重実装しない)。
            spawnBountyEncounter(bType, newGameTime);
          }
          // research/GHOST_BOSS.md(守護霊ボス「幻影」): デバッグ/練習「決闘」枠の強制出現。
          // 賞金首と同じ4点セットの②(`FORCE_PHANTOM || practiceForces('phantomnow')`)。
          // 休眠は使わない=即戦闘(一騎打ちの枠なので「探しに行く」段が無い)。出現演出は
          // pixiScene が e.spawnedAt 基準で描く(足元の簡易魔法陣+下から立ち上がるフェードイン)。
          if ((FORCE_PHANTOM || practiceForces('phantomnow')) && !phantomForceRef.current) {
            phantomForceRef.current = true;
            const gpName = enemyDeathLabel('guardian-phantom');
            useGameStore.setState({ eventBannerText: gpName, eventBannerUntil: newGameTime + BOUNTY_APPEAR_BANNER_MS });
            const gpPcx = player.x + player.width / 2, gpPcy = player.y + player.height / 2;
            // 距離は叩き台(実機調整前提): 画面内に収まり、出現演出が見える位置で正対させる。
            const gpAng = Math.random() * Math.PI * 2;
            const gpDist = 380 + Math.random() * 120;
            const gpX0 = gpPcx + Math.cos(gpAng) * gpDist, gpY0 = gpPcy + Math.sin(gpAng) * gpDist;
            const gpE = spawnEnemyAt('guardian-phantom', gpX0 - 20, gpY0 - 28, newGameTime);
            // research/GROWTH.md v4(社長裁定Q4「幻影も反映」): 幻影HP=**育成込みの初期プレイヤー**
            // (= player.ddaBaseHp。装備補正は含めない)。ENEMY_STATS の値は import 時評価の
            // プレースホルダなので、城ボスの stageBossHealthFor と同じ作法でここで必ず上書きする
            // (幻影のスポーンはこの1箇所だけ=渡し忘れが構造的に起きない)。
            gpE.health = gpE.maxHealth = guardianPhantomHealth(player.ddaBaseHp);
            // CLAUDE.md MUST: 湧き位置も「行ける帯」へクランプ(プレイヤーが追えない場所に置かない)。
            const gpClamped = clampRectToPlayableArea(gpE.x, gpE.y, gpE.width, gpE.height, {
              farBackdrop: useGameStore.getState().farBackdrop,
              labTheme,
              corridorMode: useGameStore.getState().corridorMode,
              m0AdvanceLimitX: useGameStore.getState().m0AdvanceLimitX,
              corridorRunInActive: useGameStore.getState().corridorRunInActive,
            });
            gpE.x = gpClamped.x; gpE.y = gpClamped.y;
            gpE.dormant = false;
            gpE.bossState = 'chase';
            gpE.homeX = gpE.x; gpE.homeY = gpE.y;
            // 同時1体まで(既存の幻影を消してから出す=idol/賞金首と同じ作法)。
            useGameStore.setState(stt => ({ enemies: stt.enemies.filter(e => e.type !== 'guardian-phantom') }));
            addEnemy(gpE);
            // 出現エフェクト(城ボス/賞金首と同じ機構を流用。色だけ幻影の暗い赤へ寄せる)。
            spawnFlash('rgba(60,10,20,0.26)', 420);
            spawnRing(gpX0, gpY0, 16, 150, 'rgba(239,68,68,0.85)', 6, 720);
            useGameStore.getState().spawnGlow(gpX0, gpY0, GLOW_R_XXL, 'rgba(239,68,68,', 900);
            spawnBurst(gpX0, gpY0 + 16, '#7f1d1d', 22);
            // アテンションは出現演出が落ち着いてから(城ボス/賞金首と同じ並び)。カットイン台帳には
            // 載せない(専用素材を作らない=設計書の「ではない」条件)ので payload は渡さない。
            bountyAttnRef.current = { at: newGameTime + 950, x: gpX0, y: gpY0, cutin: undefined };
          }
          // ボスメーカー(BOSS_MAKER.md): 一騎打ちの部屋を立てて相手を1体だけ出す。休眠は使わない(即戦闘)。
          if (BOSS_MAKER && !bossMakerReadyRef.current) {
            bossMakerReadyRef.current = true;
            useGameStore.getState().setBossMaker({ active: true });
            const mcx = player.x + player.width / 2, mcy = player.y + player.height / 2;
            const mk = spawnEnemyAt(BOSS_MAKER_BOSS, mcx - 20, mcy - 300, newGameTime);
            mk.fromEvent = true; mk.dormant = false; mk.fixed = false;
            mk.bossState = 'chase'; mk.bossPhase = 1;
            mk.bossNextActionAt = newGameTime + 800;
            // 天使6体(§6.28・v0.25.3567)は home を中心に旋回し、その周り(半径300)へ位置がクランプ
            // される。**homeX/homeY が未設定だと「自分の現在地=中心」になり毎フレーム自分から離れ
            // 続ける**(=猛烈にドリフトする)ので、実ゲート2と同じく中心を明示的に置く
            // (拘束サークルそのものは張らない=部屋はプレイヤーとボスだけ・§1-1)。
            if (isGate2AngelBoss(BOSS_MAKER_BOSS)) {
              mk.homeX = mcx; mk.homeY = mcy;
            }
            // 賞金首(§6.38)はHPが「基準値×実効難易度倍率」で後から決まる型なので、自然湧き
            // (spawnBountyEncounter)と同じ式をここでも通す。帰巣(リーシュ)の原点も置いておく。
            if (isBountyType(BOSS_MAKER_BOSS)) {
              const mkHp = bountyMaxHealth(areaIndexForPos(mk.x + mk.width / 2, mk.y + mk.height / 2), newGameTime);
              mk.health = mkHp; mk.maxHealth = mkHp;
              mk.homeX = mk.x; mk.homeY = mk.y;
              mk.aggroRange = BOUNTY_AGGRO_RANGE_DEFAULT;
            }
            // 裏ボス4体(§6.28-5/7/9/10・v0.25.3573)は専用コントローラ(このファイルの hiddenBoss
            // ブロック)が座標を直接書く型で、**そのコントローラは `bossRef` の1スロットで相手を掴む**。
            // 部屋では「深度で出現+拘束」の実戦経路を通らないので、掴み直す手掛かり(bossId/巣/寸法)を
            // ここで置く=単体スポーンのまま同じ状態機械が回る(拘束サークルもゴースト週間も張らない)。
            if (isHiddenControllerBoss(BOSS_MAKER_BOSS)) {
              mk.homeX = mk.x; mk.homeY = mk.y; // 帰巣先=その場(部屋では inDeep 扱いなので帰らない)
              const hbs = bossRef.current;
              hbs.spawned = true; hbs.bossId = mk.id; hbs.retreating = false; hbs.disengageSince = undefined;
              hbs.homeX = mk.x; hbs.homeY = mk.y; hbs.lastX = mk.x; hbs.lastY = mk.y;
              hbs.w = mk.width; hbs.h = mk.height;
              hbs.thorPrevHealth = mk.health; // 「画面外からの被弾」カウントの初期値(-1のままだと初回を取りこぼす)
            }
            addEnemy(mk);
          }
          const idol = pickActiveIdol(useGameStore.getState().enemies); // v0.25.2614: 起きている個体を優先(2体並んだ時の保険)
          if (idol) {
            const icx = idol.x + idol.width / 2, icy = idol.y + idol.height / 2;
            const pcx = player.x + player.width / 2, pcy = player.y + player.height / 2;
            if (idol.dormant) {
              // 索敵(近づくまで眠っている・§6.28-20の配置意図「探しに行った人だけが会う」の担保):
              // aggroRange(=ガードと同じLAB_VISION_RANGE)内 かつ 壁越しでない(視界)ならプレイヤーが
              // 近づいた=起床。gameStore.tsの updateEnemies dormantブロック(LAB_ENEMIESの起床=
              // 距離+segmentBlocked)と同じ作法だが、idolはisHiddenBoss型のため updateEnemies の
              // 起床処理を素通りする(gameStore.ts:7082)ので、ここで自前に行う(これが無いと
              // 「マップの反対側にいるのに撃ってくる」になる)。距離判定を先に済ませ、範囲内の時だけ
              // 壁クエリ(狭い範囲のみ)を行うので毎フレームの常時コストは二乗比較1回だけ。
              const ddx = pcx - icx, ddy = pcy - icy;
              const ar = idol.aggroRange ?? LAB_VISION_RANGE;
              const inRange = ddx * ddx + ddy * ddy <= ar * ar;
              let seen = false;
              if (inRange) {
                // idolの実体は屋外ラボ廊下(labTheme && !indoor)。labMap.ts屋内グリッド(indoor)は
                // 現行キャンペーンでは到達しないが、将来のため両方の壁ソースに対応しておく。
                const qMinX = Math.min(pcx, icx) - 50, qMaxX = Math.max(pcx, icx) + 50;
                const qMinY = Math.min(pcy, icy) - 50, qMaxY = Math.max(pcy, icy) + 50;
                const idolWalls = indoor
                  ? [...labBlockingWalls(loopState.labDoors.filter(d => d.open).map(d => d.id)), ...loopState.labProps.map(p => p.rect)]
                  : labTheme
                    ? [...labWallsInRegion(qMinX, qMinY, qMaxX, qMaxY).map(wallRect), ...labPropsInRegion(qMinX, qMinY, qMaxX, qMaxY).map(propRect)]
                    : [];
                seen = idolWalls.length === 0 || !segmentBlocked(pcx, pcy, icx, icy, idolWalls);
              }
              if (seen) {
                useGameStore.setState(stt => ({
                  enemies: stt.enemies.map(e => e.id === idol.id
                    ? { ...e, dormant: false, bossNextActionAt: newGameTime + IDOL_ACTION_MIN_MS }
                    : e),
                }));
                // §6.36: idol実戦出現(起床)カットイン(このattention自体が新設・社長報告に明記済み)。
                // 被弾起床(idolTick側)はカットイン無し=起床演出は「見つけた」側だけ(★設計書に明記・裁定待ち)。
                // 監査指摘1: attention生存中は保留箱へ。
                {
                  const idolCutin = bossCutinPayload('idol');
                  if (idolCutin && useGameStore.getState().attention) pendingCutinAttnRef.current = { x: icx, y: icy, cutin: idolCutin };
                  else useGameStore.getState().triggerAttention(icx, icy, idolCutin);
                }
              }
            } else {
              // 監査レポート§2(バッチ3・v0.25.2613): 状態機械は src/utils/idolTick.ts の純関数へ移設した
              // (angelBossTick.tsと同じ流儀・実装精度の規律4)。ヘッドレスの計測プローブから同じ1本を
              // 駆動できるので、受け入れ条件(技の配分/主戦帯の滞在/休符の割合)を実測で確認できる。
              // 起床のうち「被弾で起きる」は idolTick 側(社長裁定v0.25.2613)。距離+視線での起床は
              // 壁クエリが要るのでこのブロック(上)に残す。
              // ボスメーカーの「停止」トグル: ボスの時間だけ止める(絵を止めて見たい時)。
              // プレイヤーは動けるまま=当たり判定の位置関係を落ち着いて確かめられる。
              // 停止中でも「個別再生」の間だけは時間を進める(社長要望v0.25.2625)。
              // ポーズは入力ロック(isInputLocked)とは別系統なので、再生ボタンは常に効く。
              if (!useGameStore.getState().bossMaker.paused || idolPlaybackActive()) {
                runIdolTick(
                  idol, idolStateRef.current, newGameTime, deltaTime, MOVE_SPEED_MULT,
                  IDOL_SFX, BOSS_COUNTER_ENABLED, triggerPlayerDeath,
                );
              }
            }
          }
         } catch (err) {
          if (!idolCtrlErrLogged) { idolCtrlErrLogged = true; console.error('[idol] controller error (suppressed after first):', err); }
          reportSuppressedError('idol', err); // v0.25.3324: 同上
         }
        }

        // --- 天使(ゲート2ボス=ミゲル/ジブリル/ラフィ)コントローラ ---
        // M26 Step3(§6.2)で src/utils/angelBossTick.ts の純関数へ抽出(規律4・M17 combatTickと同じ流儀)。
        // 挙動・数値は抽出前と同一。ヘッドレス(playtestDriver)と共用。音はANGEL_SFXで注入(定義は本ファイル下部)。
        if (!danceTest && !indoor && !labTheme && !useGameStore.getState().gameWon) {
         try {
          // ボスメーカーの「停止」トグル: ボスの時間だけ止める(絵を止めて見たい時)。プレイヤーは
          // 動けるまま=当たり判定の位置関係を落ち着いて確かめられる。停止中でも「個別再生」の間だけは
          // 時間を進める(社長要望v0.25.2625)。★idol/賞金首と同じ形に揃える(v0.25.3567・BOSS_MAKER.md §6-1)。
          // bossMaker.paused は部屋以外では常に false なので、通常プレイの挙動は変わらない。
          if (!useGameStore.getState().bossMaker.paused || angelPlaybackActive()) {
            runAngelBossTick(angelStateRef.current, newGameTime, deltaTime, MOVE_SPEED_MULT, ANGEL_SFX, triggerPlayerDeath);
          }
         } catch (err) {
          if (!angelCtrlErrLogged) { angelCtrlErrLogged = true; console.error('[angel] controller error (suppressed after first):', err); }
          reportSuppressedError('angel', err); // v0.25.3324: 天使ボスの技全壊系(アクラシエル報告)の実例外源をここで捕まえる
         }
        }

        // --- 賞金首(BOUNTY・§6.38 B1)コントローラ ---
        // idolTick.tsを手本にした専用コントローラ(bountyTick.ts)。天使コントローラと同位置で呼ぶ
        // (更新順序上の位置以外に意味は無い=どちらも他の敵から独立した専用制御)。
        if (!danceTest && !useGameStore.getState().gameWon) {
         try {
          const activeBounty = pickActiveBounty(useGameStore.getState().enemies);
          // ボスメーカーの「停止」トグル: ボスの時間だけ止める(絵を止めて見たい時)。プレイヤーは
          // 動けるまま=当たり判定の位置関係を落ち着いて確かめられる。停止中でも「個別再生」の間だけは
          // 時間を進める(社長要望v0.25.2625)。★idolと同じ形に揃える(v0.25.3563・社長報告
          // 「ボスメーカーの上に並んでるメニュー群が効いてない」=ここにガードが無かったのが実体)。
          // bossMaker.paused は部屋以外では常に false なので、通常プレイの挙動は変わらない。
          if (activeBounty && (!useGameStore.getState().bossMaker.paused || bountyPlaybackActive())) {
            runBountyTick(
              activeBounty, bountyStateRef.current, newGameTime, deltaTime, MOVE_SPEED_MULT, Date.now(),
              BOUNTY_SFX, BOSS_COUNTER_ENABLED,
            );
          }
         } catch (err) {
          if (!bountyCtrlErrLogged) { bountyCtrlErrLogged = true; console.error('[bounty] controller error (suppressed after first):', err); }
          reportSuppressedError('bounty', err);
         }
        }

        // --- 守護霊ボス「幻影」(research/GHOST_BOSS.md)コントローラ ---
        // bountyTick と同位置・同じ作法(更新順序上の位置以外に意味は無い=他の敵から独立した専用制御)。
        // ★この1体を動かすのはここだけ(gameStore.updateEnemies は isGuardianPhantom で素通りする)。
        if (!danceTest && !useGameStore.getState().gameWon) {
         try {
          const activePhantom = pickActivePhantom(useGameStore.getState().enemies);
          // ボスメーカーの「停止」トグルは幻影では使わない(部屋に並べていない実験枠)が、
          // 停止中に1体だけ動き続けるのは事故のもとなので、他のボスと同じガードを通しておく。
          if (activePhantom && !useGameStore.getState().bossMaker.paused) {
            runPhantomTick(
              activePhantom, phantomStateRef.current, newGameTime, deltaTime, MOVE_SPEED_MULT, Date.now(),
              PHANTOM_SFX,
            );
          }
         } catch (err) {
          if (!phantomCtrlErrLogged) { phantomCtrlErrLogged = true; console.error('[phantom] controller error (suppressed after first):', err); }
          reportSuppressedError('phantom', err);
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
        // 洋館(ステージ6)開始の走り込み(v0.25.2110・ヘリ登場なし): 下(+y)開始のプレイヤーを
        // 到着点(y<=0)まで自動で上へ走らせる。実移動=歩行アニメ/護衛追走/カメラ追従は通常システム。
        // 入力はisInputLocked(corridorRunInActive)で遮断済み。安全弁: gameTime 6秒で強制解除。
        const corridorRunIn = useGameStore.getState().corridorRunInActive;
        movePlayer(corridorRunIn ? { up: true, down: false, left: false, right: false } : inputState, deltaTime * MOVE_SPEED_MULT);
        if (corridorRunIn) {
          const runSt = useGameStore.getState();
          if (runSt.player.y <= 0 || runSt.gameTime > 6000) runSt.clearCorridorRunIn();
        }
        // M26-L(§6.3): ボットの近接(指離しカウンター)/武器切替。ヘッドレス(playtestDriver)と同じ操作を実機で行う。
        // §6.25改訂: dodgeVsAttackが回避優先と判定した時は攻撃を抑制する(dodge='none'のnovice/casualは
        // botAttackSuppressedByDodgeが常にfalse=不変)。
        // v0.25.3064: 目的地ステア中に見つけた卵も叩く(botObjSteerAdj)。移動入力だけ差し替えて
        // 叩きを繋がないと、避けきれない至近の卵を割れないまま素通りして起爆させてしまう。
        // ★v0.25.3560: カウンター反応(botWantsCounterReaction)は**回避抑制の対象から外す**。
        // decideCounterReaction は返した瞬間に fired=true を立てるので、ここで抑制されると
        // その脅威へのカウンター機会は**永久に失われる**。masterは dodge:'all' で回避ベクトルが
        // ほぼ常時立つため、dodgeVsAttack=0.25 の抑制に25%の確率で食われ続けていた
        // (=「masterほどカウンターしない」の残り半分)。回避と防御反応は競合させない。
        if ((botMineAdj?.wantsMelee || botObjSteerAdj?.wantsMelee) && !botAttackSuppressedByDodge || botWantsCounterReaction) useGameStore.getState().triggerCounter(); // M34: 卵叩き / M37: 人間反応カウンター
        if (botDecision?.wantsWeaponSwitch) {
          const botPlayer = useGameStore.getState().player;
          const botGuns = getGuns(botPlayer);
          if (botGuns.length >= 2) {
            const botActive = getActiveGun(botPlayer);
            const botIdx = botActive ? botGuns.findIndex(g => g.id === botActive.id) : -1;
            useGameStore.getState().setActiveWeapon(botGuns[(botIdx + 1) % botGuns.length].id);
          }
        }
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
            // B方式: 拍(atMs)まで待ってから実行=ジャスト吸着(社長指示2026-08-20「無理やりちょうどの
            // タイミングでSEと動きを合わせる」)。早めの入力は攻撃の絵と音が拍ぴったりに出る。
            // 待ちの上限は成功窓(タップ±180ms/フリック+55ms)=知覚上は「入力→拍で発動」の型。
            for (const pa of useGameStore.getState().drainRhythmPending(BEAT_ENABLED ? Date.now() : undefined)) {
              executeRhythmPending(pa);
            }
            // 白虎: 5秒間 0.5秒ごとに射程内の近い敵を1体斬る(最大10回)。毎フレーム探索しない。
            const rr = useGameStore.getState().rhythm;
            if (rr.byakkoUntil > newGameTime && newGameTime >= rr.byakkoNextAt && rr.byakkoHits < BYAKKO_MAX_HITS) {
              const bp = useGameStore.getState().player;
              const bcx = bp.x + bp.width / 2;
              const bcy = bp.y + bp.height / 2;
              const target = useGameStore.getState().enemies
                .filter(e => e.type !== 'reaper' || e.reaperChaser)
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
              // ジャスト吸着の後始末: 拍待ちのまま消化されなかったpendingを捨てる(退出=320ms移動と
              // 吸着の最大待ち235msは近く、稀に取り残しが出る。残すと次のダンス開始時に古いタップが
              // 1発だけ発動する)。
              useGameStore.setState(s => (s.rhythm.pending.length > 0
                ? { rhythm: { ...s.rhythm, pending: [] } } : {}));
            }
            if (BEAT_ENABLED) setDanceBeatDuck(danceNow); // B方式: メトロノームが埋もれないよう曲を軽くダック
            danceModeRef.current = danceNow;
          }
        }

        // 追尾カメラ(描画のみ): 慣性追従 + 進行方向の余白(先読み) + 危険時タイト + 強制中心復帰。
        // 判定/スポーン/プロップ生成は実プレイヤー基準(baseCam)のまま=ゲーム性に影響なし。
        const pcCamX = player.x + player.width / 2;
        const pcCamY = player.y + player.height / 2;
        // v0.25.3063: +横のボス先読み(camBossLeadXRef)。値の適用は下(estimatorブロックの後)で行うが、
        // baseCamX自体は先読み無しの基準として残す(危険時の追従等は従来どおりこの基準系)。
        const baseCamX = pcCamX - gameBounds.width / 2;  // プレイヤーをちょうど中央に置くカメラ(先読み無し)
        // §6.37 v6(社長指示「ズームが引になったら上下の幅を揃える」): ボス交戦の引きズームをstore側でも
        // 推定し(描画と同じ純関数・同じ時定数)、下のカメラ下げ量をズームに連動して増やす。
        // 対象はボス交戦の引きのみ(群衆ズームには掛けない=通常戦闘の構図は従来どおり)。
        {
          const est = camBossZoomRef.current;
          let bossTargetNow: number | null = null;
          let bossNearD2 = Infinity, bossNearDy = 0; // §6.37 v7: 最近接ボスの縦中心差(縦カメラ先読み用)
          let bossNearDx = 0; // v0.25.3063: 横中心差(横カメラ先読み用・社長裁定「2をまず揃える」)
          if (!indoor && !labTheme && !useGameStore.getState().corridorMode) {
            for (const e of enemies) {
              if (!isEngageableBoss(e.type) || e.dormant === true || e.bossState === 'return') continue;
              const limit = bossEngagementDistancePx(e.type, est.engaged, e.isStoryBoss === true);
              const dx = e.x + e.width / 2 - pcCamX, dy = e.y + e.height / 2 - pcCamY;
              const d2 = dx * dx + dy * dy;
              if (d2 > limit * limit) continue;
              if (d2 < bossNearD2) { bossNearD2 = d2; bossNearDy = dy; bossNearDx = dx; }
              // v0.25.3021(社長スクショ「ボスが上に居るのにプレイヤー中心・下の余白が無駄」の真因):
              // 描画(pixiScene)と同じく**フレーミング項込み**で目標ズームを出す。ボスが画面端の外に
              // 遠い時は距離カーブでなくフレーミング項が実ズームを決めるため、ここに無いと推定だけ
              // 浅くなり、カメラ下げ(均衡)も北先読みも実画角に対して大幅に不足していた。
              const tDist = bossDistanceZoomTarget(e.type, aabbGapDistance(player, e), e.isStoryBoss === true,
                { dxCenter: dx, dyCenter: dy, viewport: gameBounds });
              // v0.25.3081: 描画側(pixiScene)と**同じ式**で技ドリブンの引きを掛ける(推定と実画角を割らない)。
              const tWide = bossWideShotZoom(e.type, e.bossState);
              const t = tWide != null ? Math.min(tDist, tWide) : tDist;
              bossTargetNow = bossTargetNow == null ? t : Math.min(bossTargetNow, t);
            }
          }
          est.engaged = bossTargetNow != null;
          // contextZoomTargetで包む(敵数0=群衆項1)=?zoomlock固定も描画と一貫する。
          const camZoomTarget = contextZoomTarget(0, false, bossTargetNow);
          // v0.25.3019(社長裁定「案2で少し慣性を入れたら?」): 交戦中は描画側と同じ臨界減衰バネで
          // 距離に直結+慣性。解除後の戻りは従来の1次(RETURN_TAU)のまま。速度は解除時に捨てる。
          if (est.engaged) {
            const sp = springSmoothZoom(est.z, est.v, camZoomTarget, baseDeltaTime);
            est.z = sp.z;
            est.v = sp.v;
          } else {
            est.z += (camZoomTarget - est.z)
              * (1 - Math.exp(-baseDeltaTime / BOSS_DISTANCE_ZOOM_RETURN_TAU));
            est.v = 0;
          }
          // ★v0.25.3170: いまの画角を store へ写す(銃の射程ゲートがワールド距離へ戻すのに使う)。
          // **毎フレーム書かない**——変化が 0.005 未満なら書かない(store の per-frame churn を作らない
          // ためのゲート。CLAUDE.md「React re-render discipline」)。
          if (Math.abs(useGameStore.getState().viewZoom - est.z) >= 0.005) {
            useGameStore.setState({ viewZoom: est.z });
          }
          // §6.37 v7(社長指示「左右みたいに上下もカメラを寄せて」): 縦のボス先読み。横(描画側の
          // bossViewBiasX=中心差の半分)と同じ狙いを、縦は**カメラ本体**で寄せる(描画側のパンだと
          // 床上端が地平線から剥がれて「上の地面切れ」が再発するため)。入り0.5s/戻り1.0s=横と同系。
          const wantLead = est.engaged ? bossCameraLeadY(bossNearDy, gameBounds.height, est.z) : 0;
          const lk = 1 - Math.exp(-baseDeltaTime / (est.engaged ? 0.5 : 1.0));
          camBossLeadYRef.current += (wantLead - camBossLeadYRef.current) * lk;
          // v0.25.3063(社長裁定「2をまず揃えるべきでは?」): 横のボス先読みも縦と同じ目標ライン式・
          // 同じ時定数でカメラ本体に掛ける(旧・描画側の横パンは退役=機構を1本化)。
          const wantLeadX = est.engaged ? bossCameraLeadX(bossNearDx, gameBounds.width, est.z) : 0;
          camBossLeadXRef.current += (wantLeadX - camBossLeadXRef.current) * lk;
        }
        // プレイヤーを中央より下へ(屋内/ラボは中央維持=スポーン補正と一致)。上(進行先)の視界を広げる。
        // 洋館通路は下げ量を増やす(v0.25.2148・社長指示「敵が出てきて見える位置をもう少し上に」)。
        // 引き(ボス交戦)中は zoomCameraDownFrac がさらに下げ、プレイヤーを「地平線と画面下端の中間」へ
        // 寄せる=上下の地面幅が揃う(§6.37 v6)。スポーン帯(spawnViewOffsetY)も同じ値を読む。
        // §6.37 v7: 実効の縦構図オフセット=均衡の下げ(camdown×ズーム連動)+ボス方向の縦先読み。
        // 正=カメラを北へ(プレイヤーが画面下へ)。クランプ(offY)もこの実効値を基準に測る。
        const camDownOff = ((indoor || labTheme) ? 0
          : gameBounds.height * zoomCameraDownFrac(
              useGameStore.getState().corridorMode ? CORRIDOR_CAMERA_DOWN_FRAC : CAMERA_DOWN_OFFSET_FRAC,
              camBossZoomRef.current.z))
          + camBossLeadYRef.current;
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
        const targetCameraX = baseCamX + look.x + camBossLeadXRef.current; // v0.25.3063: 横のボス先読み
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
        // チュートリアル: 縦はプレイヤー1:1追従(遅延・先読みなし)=プレイヤーの画面上の縦位置を完全固定
        // (社長指示v0.25.1827「上下移動で地面がぬるっと動く体験は残しつつ、プレイヤーは画面位置固定」)。
        // 背景レイヤー(遠景/岩帯/川/霧/ツララ)は画面固定なので構図は不変、動くのは地面と周囲の物だけ。
        // 上下±50px(store側の透明な壁)がその可動域。横は通常追従のまま。
        if (tutorialStage) {
          camY = baseCamY;
          look.y = 0;
        }
        // 洋館通路のカメラ(v0.25.2132・社長指示「プレイヤーカメラを固定に=試し」): 横固定(v0.25.2125)を
        // 撤去し、m0と同じプレイヤー追従(プレイヤー常時中央)へ。v0.25.2124の「四角い黒い切れ目」の正体は
        // 横シフト時に画面サイズしかない遠方フェード(floorDark/ceilDark)の縁が画面に入ることだったため、
        // corridorLayer側でbgと同じ横オーバースキャンを与えて根治(=固定カメラはもう不要)。
        // 戻す時はここに v0.25.2125 の2行(camX=-gameBounds.width/2 / look.x=0)を復活させる。
        // 屋内はカメラを「野外マージン込みの外周」にクランプ。壁の外に野外を設けたので、端でも
        // プレイヤーが画面中心を保てる(壁で進めなくてもカメラは野外側へ寄れる)。
        if (indoor) {
          const maxCamX = LAB_OUTER_BOUNDS.x + LAB_OUTER_BOUNDS.width - gameBounds.width;
          const maxCamY = LAB_OUTER_BOUNDS.y + LAB_OUTER_BOUNDS.height - gameBounds.height;
          camX = Math.max(LAB_OUTER_BOUNDS.x, Math.min(maxCamX, camX));
          camY = Math.max(LAB_OUTER_BOUNDS.y, Math.min(maxCamY, camY));
        }
        setCameraPosition(camX, camY);
        // 監査v0.25.3008: 松明/地雷の生成リージョンは**構図オフセット抜き**のプレイヤー中心カメラで渡す。
        // baseCamY はズーム連動カメラ下げ+縦先読み(最大~1000px)込みのため、そのまま渡すとリージョン
        // 南端がプレイヤーの手前まで縮み、足元の松明/緑卵が配列から落ちて消えることがあった。
        // ★v0.25.3595(社長指示「リラックス中は少し松明の出現率アップ」): RELAX中(収穫コマ除外=
        // v3548裁定と同じ物差し)だけ松明セルのしきい値を+0.08。松明の生成自体がlabTheme/屋内では
        // 元から止まっているので、ここではディレクター状態だけ見ればよい。
        const torchRelaxBonus = DIRECTOR_APPLY_RELAX
          && directorRef.current.state.macro === 'relax'
          && relaxAppliesToKoma(puzzleKomaRef.current.kind)
          ? TORCH_RELAX_BONUS : 0;
        syncBreakableProps({ x: baseCamX, y: pcCamY - gameBounds.height / 2 }, gameBounds, torchRelaxBonus);
        
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
        // MOVEMENT_REWORK.md 仕様2: スケーター乗車中は銃の自動発砲も封印(?skaterlock=0で復帰)。
        const skaterLocked = SKATER_LOCK_ENABLED && postReloadPlayer.skaterRiding;
        // v0.25.2589(社長指示): 死亡モーション中・アテンション演出中は攻撃しない(共通ゲート)。
        const attackLocked = isAttackLocked();
        // 社長指示v0.25.3300 シーカー仕様変更: 半透明中は攻撃できない(覚醒Lv3は半透明中も攻撃可)。
        const seekerLocked = isSeekerActive(postReloadPlayer, gameTime) && skillLevel(postReloadPlayer, 'seeker') < 3;
        // PHILL銃は自動射撃しない(指離しの手動発砲のみ=firePhillShot)。
        if (activeGun && !katanaActive && !skaterLocked && !attackLocked && !seekerLocked && activeGun.category !== 'phill') {
          const newProjectiles = fireWeapon(activeGun, postReloadPlayer, enemies);
          if (newProjectiles.length > 0) {
            // handgun系のうちマシンピストル(=サブマシンガン, handgun-t3)だけ専用音、それ以外(ハンドガン/二丁)はhandgun-fire。
            if (activeGun.category === 'handgun') playSfx(activeGun.key === SMG_WEAPON_KEY ? 'smg-fire' : 'handgun-fire');
            if (activeGun.category === 'shotgun') playSfx('shotgun-fire');
            // rifle系はrifle-fire(旧rifle-t3特例はv0.25.3291で廃止)。グレネードガン(glauncher)は専用の発射音。
            if (activeGun.category === 'rifle') playSfx('rifle-fire');
            if (activeGun.category === 'glauncher') playSfx('grenade-launcher-fire');
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
        if (katanaActive && !attackLocked) { // v0.25.2589: オート斬撃も死亡/アテンション中は止める
          if (gameTime < lastKatanaSlashRef.current) lastKatanaSlashRef.current = 0; // new run
          if (gameTime - lastKatanaSlashRef.current >= KATANA_SLASH_INTERVAL_MS) {
            const kp = useGameStore.getState().player;
            // 標的選択は src/utils/katanaAuto.ts の純関数へ抽出した(v0.25.2518・優先順位/射程の扱いは不変)。
            // 距離は enemyMeleeDist(裏ボスは帯AABBの最近点)。巨体ボスを中心基準にすると帯の端で
            // 「近づいても発動しない」狭い当たりになる(社長報告)。最近点なら表示枠=攻撃判定が一致する。
            // 守護霊のオート斬撃も**同じ関数**を通る(裁定2=共有方式)。
            const targetId = pickKatanaSlashTarget(
              kp.x + kp.width / 2, kp.y + kp.height / 2, katanaRange(kp),
              useGameStore.getState().enemies, gameTime, enemyMeleeDist,
            );
            if (targetId) {
              lastKatanaSlashRef.current = gameTime;
              // 近接フィニッシュは一閃のみ: オート斬撃はallowFinisher=false。
              const result = performKatanaStrike([targetId], 1, false);
              if (result.finish) playSfx('melee-finish');
              else if (result.hit) playSfx('slash-damage');
              if (result.killed > 0) playEnemyDeath();
            }
          }
        }

        // 刀装備中は他のサブウェポンを発動させない(許可制、現状すべて停止)。
        const subWeaponPlayer = useGameStore.getState().player;
        // MOVEMENT_REWORK.md 仕様2(社長確定v0.25.2442): スケーター乗車中のサブウェポン発動封印
        // (以下このブロック内の全サブ=heavy-grenade/marksman-trap/striker-quick-mag/
        // dog/decoy/shield/turret/molotov/support-sniper/first-aid-kit/fire-knife/homingロック取得が
        // 共通でこの1変数のnot判定を通る=「サブ発動入口」を1箇所で塞ぐ)。`?skaterlock=0`で復帰。
        // 社長指示v0.25.3318: 帰還サークル(ゴール)内の攻撃停止は撤廃(指離せば即ゴールなので不要)。
        const inReturnCircle = (SKATER_LOCK_ENABLED && subWeaponPlayer.skaterRiding);

        // G2.6(BOT_AND_GHOST.md §2.8): サブウェポン発動の入口はオーナー(座標・向き・受け手)に対して
        // 解決する。既定オーナー=プレイヤー(この場合、従来の挙動と1bitも変わらない)。ゴースト
        // (ghost-ally)が「次のサブ発動1回」を予約(ghostSubClaim)している間は、予約を消費できる種
        // (=入口を通すだけで自然に動く種: heavy-grenade/marksman-trap/decoy/shield/turret/fire-knife)が
        // ゴーストをオーナーとして発動する。CD・発動条件(装備/CD明け/帰還サークル/刀封印)は従来のまま
        // 共有の1本=「1つの財布」(ゴースト個別のCD/在庫は無い)。弾薬・スクラップ等の資源も消費しない
        // (上記6種は元々資源を使わない)。
        const playerOwner = playerAsOwner(subWeaponPlayer);
        const ghostAllyForSub = useGameStore.getState().summons.find(s => s.kind === 'ghost-ally');
        let subOwner: SubWeaponOwner = ghostAllyForSub?.ghostSubClaim ? ghostAsOwner(ghostAllyForSub) : playerOwner;
        // v0.25.2472: ゴースト発動時の照準先=紐付きボス(pickSubAimTargetがowner.kindを見るので、
        // プレイヤー発動時はこのidが渡っていても一切使われない=従来どおり最寄りの敵)。
        const ghostSubBossId = ghostAllyForSub?.ghostBossId;
        // 予約の消費: ゴーストがオーナーとして実際に1発撃った瞬間に予約を下ろし、使用時刻を打刻する。
        // 同一フレームで複数のサブが明けていても、ゴーストとして出るのは1発だけ(以降はプレイヤー)。
        // v0.25.2541: 実際に撃った主語(firedOwner)で判定する(ゴーストが予約中でもプレイヤーが
        // 撃った場合は予約を下ろさない=下の subSubject でフォールバックした時のため)。
        const consumeGhostSubClaim = (firedOwner: SubWeaponOwner) => {
          if (firedOwner.kind !== 'ghost-ally') return;
          const claimedId = firedOwner.summonId;
          subOwner = playerOwner;
          useGameStore.setState(st => ({
            summons: st.summons.map(s => s.id === claimedId
              ? { ...s, ghostSubClaim: false, ghostLastSubUseAt: Date.now() }
              : s),
          }));
        };
        // v0.25.2541(§2.11追補・発注A「サブCD帳簿の分離」): サブ1種ぶんの**主語**を決める。
        // 予約中のゴーストが「その種を自分のビルドに持っていて、自分のCD(自前帳簿)も明けている」
        // 時だけ主語=ゴースト。そうでなければ主語=プレイヤー(予約は残したまま、プレイヤーの
        // サブは従来どおり出る=ゴーストが持っていない種でプレイヤーの発動が止まる事故を作らない)。
        // 予約が無い間は常に {subWeaponPlayer, playerOwner} = 従来と1bit同じ。
        const subSubject = (key: SubWeaponKey): { actor: Player; owner: SubWeaponOwner } => {
          if (subOwner.kind === 'ghost-ally' && subOwner.summonId) {
            const ga = combatActorPlayer(subOwner.summonId);
            if (
              ga && ga.subWeapons.includes(key) &&
              !subWeaponBlockedByKatana(ga, key) &&
              gameTime >= (ga.subWeaponCooldowns[key] ?? 0)
            ) return { actor: ga, owner: subOwner };
          }
          return { actor: subWeaponPlayer, owner: playerOwner };
        };
        // v0.25.2480(★未決3解消): ゴースト発動サブの発動SE用の距離減衰(発音位置=設置/投擲点)。
        // プレイヤー発動のSEは従来どおり等倍のまま(この関数を通さない=1bit不変)。
        const subSfxGainAt = (x: number, y: number): number => {
          const s = useGameStore.getState();
          return npcSfxDistGain(x, y, s.player.x + s.player.width / 2, s.player.y + s.player.height / 2, s.camera, s.gameBounds);
        };
        const { actor: hgActor, owner: hgOwner } = subSubject('heavy-grenade');
        if (
          !inReturnCircle &&
          hgActor.subWeapons.includes('heavy-grenade') &&
          !subWeaponBlockedByKatana(hgActor, 'heavy-grenade') &&
          gameTime >= (hgActor.subWeaponCooldowns['heavy-grenade'] ?? 0)
        ) {
          const level = Math.max(1, Math.min(3, hgActor.subWeaponLevels['heavy-grenade'] ?? 1));
          // G2.6: 投擲位置/照準の起点はオーナー(既定=プレイヤー=従来と同値)。
          const pcx = ownerCenterX(hgOwner);
          const pcy = ownerCenterY(hgOwner);
          const ghostOwned = hgOwner.kind === 'ghost-ally';
          // v0.25.2472: ターゲット選択は照準の合流点(純関数)へ。プレイヤー=従来の最寄り非リーパー
          // (手順まで同一=挙動不変)/ゴースト=紐付きボス優先。
          const target = pickSubAimTarget(hgOwner, ghostSubBossId, useGameStore.getState().enemies);
          const aimX = target ? target.x + target.width / 2 - pcx : hgOwner.facing?.x ?? 1;
          const aimY = target ? target.y + target.height / 2 - pcy : hgOwner.facing?.y ?? 0;
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
              reflected: false,
              ownerGhost: ghostOwned ? true : undefined, // 視覚専用マーカー(青白tint)
            });
          });
          setActorSubWeaponCooldown(ownerGhostId(hgOwner), 'heavy-grenade', gameTime + HEAVY_GRENADE_COOLDOWN_MS);
          consumeGhostSubClaim(hgOwner); // G2.6: ゴースト予約で撃った場合のみ予約を下ろす(プレイヤー時はno-op)
        }

        const { actor: mtActor, owner: mtOwner } = subSubject('marksman-trap');
        if (
          !inReturnCircle &&
          mtActor.subWeapons.includes('marksman-trap') &&
          !subWeaponBlockedByKatana(mtActor, 'marksman-trap') &&
          gameTime >= (mtActor.subWeaponCooldowns['marksman-trap'] ?? 0)
        ) {
          const level = Math.max(1, Math.min(3, mtActor.subWeaponLevels['marksman-trap'] ?? 1));
          // G2.6: 設置位置はオーナー(既定=プレイヤー=従来と同値)。
          const pcx = ownerCenterX(mtOwner);
          const pcy = ownerCenterY(mtOwner);
          const ghostOwned = mtOwner.kind === 'ghost-ally';
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
            count: level,
            ownerGhost: ghostOwned ? true : undefined, // 視覚専用マーカー(青白tint)
          });
          spawnRing(pcx, pcy, 4, MARKSMAN_TRAP_RADIUS_BY_LEVEL[level],
            ghostOwned ? 'rgba(159,216,255,0.5)' : 'rgba(56,189,248,0.46)', 2, 280);
          setActorSubWeaponCooldown(ownerGhostId(mtOwner), 'marksman-trap', gameTime + MARKSMAN_TRAP_COOLDOWN_MS);
          consumeGhostSubClaim(mtOwner); // G2.6
        }

        // バグ修正(社長報告v0.25.2318「途中から出なくなる」・案B採用): 旧実装は発動条件に
        // 「場にマガジンが落ちていないこと」を課していたが、ピックアップには寿命が無く、
        // PICKUP_HARD_CAPの間引きも experience/strap しか消さない(quick-magazineは重要枠で
        // 無期限保持)ため、一度拾い損ねて置き去りにすると**そのランで二度と発動しない**状態に
        // なっていた(拾得は接触判定のみ・マグネットスキルは弾薬専用で効かない)。
        // → ガードを外し、投げ直す時に古いマガジンを消す方式へ。場には常に最新の1個だけ。
        if (
          subWeaponPlayer.subWeapons.includes('striker-quick-mag') &&
          !subWeaponBlockedByKatana(subWeaponPlayer, 'striker-quick-mag') &&
          gameTime >= (subWeaponPlayer.subWeaponCooldowns['striker-quick-mag'] ?? 0)
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
            // 投げ先=敵が少ない方面へ(社長指示v0.25.1606)。マガジンは拾って回収するので、
            // 進行方向ではなく「敵の薄い側」へ投げて安全に取りに行けるようにする。
            // G2.6: このブロックはプレイヤー本人分。守護霊は各自のマガジン不足時に自分で投げ、
            // ghostDriverの回収目標へ割り込んで自分の物だけを拾う(下の守護霊ブロック)。
            const dir = safeThrowDirection(
              ownerCenterX(playerOwner),
              ownerCenterY(playerOwner),
              useGameStore.getState().enemies,
              playerOwner.facing ?? { x: 1, y: 0 },
            );
            const dirMag = Math.max(0.001, Math.hypot(dir.x, dir.y));
            const px = ownerCenterX(playerOwner)
              + (dir.x / dirMag) * STRIKER_QUICK_MAG_THROW_DISTANCE;
            const py = ownerCenterY(playerOwner)
              + (dir.y / dirMag) * STRIKER_QUICK_MAG_THROW_DISTANCE;
            const fromX = ownerCenterX(playerOwner) - 8;
            const fromY = ownerCenterY(playerOwner) - 8;
            // 案B: 投げる直前に前回の置き去りマガジンを消す(場に残るのは常に最新の1個)。
            useGameStore.setState(s => (
              s.pickups.some(p => p.type === 'quick-magazine')
                ? { pickups: s.pickups.filter(p => p.type !== 'quick-magazine') }
                : {}
            ));
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
                if (enemy.type === 'reaper' && !enemy.reaperChaser) continue;
                if (activeFetch.bitten.has(enemy.id)) continue;
                const ex = enemy.x + enemy.width / 2;
                const ey = enemy.y + enemy.height / 2;
                if (Math.hypot(ex - dogX, ey - dogY) > DOG_BITE_RADIUS) continue;
                // §6.10 M33②: skillOutgoingDamageMult(バーサーカー等)を犬の噛みつきにも乗算(四捨五入)。
                activeFetch.bitten.add(enemy.id);
                const dogDmg = Math.max(1, Math.round(DOG_BITE_DAMAGE * skillOutgoingDamageMult(useGameStore.getState().player)));
                const killed = damageEnemy(enemy.id, dogDmg);
                spawnDamageNumber(ex, enemy.y, dogDmg, false);
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
                // クイックマガジンはドッグに拾わせない(社長指示v0.25.2409)。使うタイミングを
                // プレイヤーが選ぶ拾い物なので、ドッグが勝手に回収すると効果が空撃ちになる。
                .filter(p => p.type !== 'quick-magazine')
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
              // クイックマガジンも対象外(社長指示v0.25.2409)。**回収側(collectAt)だけでなくここでも外す**=
              // 外し忘れると「クイックマガジンへ走って行って何も拾わずCDだけ消費する」空振りになる。
              .filter(p => p.type !== 'card-key' && p.type !== 'weapon-crate' && p.type !== 'lab-clear-item' && p.type !== 'quick-magazine')
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
        const { actor: dcActor, owner: dcOwner } = subSubject('decoy');
        if (
          !inReturnCircle &&
          dcActor.subWeapons.includes('decoy') &&
          !subWeaponBlockedByKatana(dcActor, 'decoy') &&
          gameTime >= (dcActor.subWeaponCooldowns['decoy'] ?? 0)
        ) {
          const level = Math.max(1, Math.min(3, dcActor.subWeaponLevels['decoy'] ?? 1));
          // G2.6: 投擲位置/向きはオーナー(既定=プレイヤー=従来と同値)。
          const dir = dcOwner.facing ?? { x: 1, y: 0 };
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
          const pcx = ownerCenterX(dcOwner);
          const pcy = ownerCenterY(dcOwner);
          const ghostOwned = dcOwner.kind === 'ghost-ally';
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
            ownerGhost: ghostOwned ? true : undefined, // 視覚専用マーカー(青白tint)
          });
          // 初回迎撃は着地の0.5秒後。
          decoyPulseRef.current.set(decoyId, gameTime + DECOY_THROW_MS + DECOY_PULSE_MS);
          spawnRing(pcx, pcy, 4, 18, ghostOwned ? 'rgba(159,216,255,0.65)' : 'rgba(56,189,248,0.6)', 2, 220);
          setActorSubWeaponCooldown(ownerGhostId(dcOwner), 'decoy', gameTime + DECOY_COOLDOWN_MS);
          consumeGhostSubClaim(dcOwner); // G2.6
        }

        // 設置型シールド: 5秒ごとに進行方向の反対側へ遮蔽壁を建てる。敵の通行を
        // 止め、敵弾を消し、味方弾は通す。設置間隔/持続は全Lv共通、Lvで耐久だけ上がる。
        const { actor: shActor, owner: shOwner } = subSubject('shield');
        if (
          !inReturnCircle &&
          shActor.subWeapons.includes('shield') &&
          !subWeaponBlockedByKatana(shActor, 'shield') &&
          gameTime >= (shActor.subWeaponCooldowns['shield'] ?? 0)
        ) {
          const level = Math.max(1, Math.min(3, shActor.subWeaponLevels['shield'] ?? 1));
          // 進行方向と反対(=外向き法線)。取れなければ最後の向き、それも無ければ下。
          // G2.6: 設置位置/向きはオーナー(既定=プレイヤー=従来と同値。フォールバック{x:0,y:1}もそのまま)。
          const move = shOwner.facing ?? { x: 0, y: 1 };
          const mmag = Math.max(0.001, Math.hypot(move.x, move.y));
          let nx = -move.x / mmag;
          let ny = -move.y / mmag;
          // 法線を主軸へスナップ(4方向)。表裏と当たり判定を素直にするため。
          if (Math.abs(nx) >= Math.abs(ny)) { nx = Math.sign(nx) || 1; ny = 0; }
          else { nx = 0; ny = Math.sign(ny) || 1; }
          const pcx = ownerCenterX(shOwner);
          const pcy = ownerCenterY(shOwner);
          // 足元(下辺中央)。スプライトはここから上へ伸び、当たり判定は下部のみ。
          const footX = pcx + nx * SHIELD_PLACE_DISTANCE;
          const sideways = nx !== 0;
          // 左右向きは当たり/効果範囲(と絵)を少し下へずらす。
          const footY = pcy + ny * SHIELD_PLACE_DISTANCE + (sideways ? SHIELD_SIDE_DROP : 0);
          // 面(=遮断の広い面)は法線に直交させる。左右向き(法線が水平)なら面は縦(Y)、
          // 上下向きなら面は横(X)。奥行(SHIELD_FOOT_H)は常に法線方向の薄い側。
          const shieldW = sideways ? SHIELD_FOOT_H : SHIELD_FACE_W_UPDOWN; // 上下配置は絵の可視幅に一致(v0.25.2451)
          const shieldH = sideways ? SHIELD_FOOT_W : SHIELD_FOOT_H;
          const nowMs = Date.now();
          // 同時設置は1個: 既存のシールドがあれば消す(デコイと同じ流儀)。
          for (const s of useGameStore.getState().projectiles.filter(p => p.weaponType === 'shield')) {
            removeProjectile(s.id);
            for (const k of [...shieldHitRef.current.keys()]) {
              if (k.startsWith(`${s.id}:`)) shieldHitRef.current.delete(k);
            }
          }
          const ghostOwned = shOwner.kind === 'ghost-ally';
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
            ownerGhost: ghostOwned ? true : undefined, // 視覚専用マーカー(青白tint)
          });
          // ガチャンッ!: 着地ダスト + 金属音(構えた感)。スプライト側で着地スラム。
          spawnRing(footX, footY, 6, 64, ghostOwned ? 'rgba(159,216,255,0.7)' : 'rgba(203,213,225,0.7)', 3, 260);
          // v0.25.2480: ゴースト発動時のみ設置点で距離減衰(プレイヤー発動は従来どおり等倍)。
          const shieldGain = ghostOwned ? subSfxGainAt(footX, footY) : 1;
          if (shieldGain > 0) playSfx('shield-deploy', shieldGain);
          recordShieldPlacement(); // G4a(§2.9(3)・記録専用): shield設置1回の様式カウンタ
          setActorSubWeaponCooldown(ownerGhostId(shOwner), 'shield', gameTime + SHIELD_COOLDOWN_MS);
          consumeGhostSubClaim(shOwner); // G2.6
        }

        // 自動タレット: 10秒ごとにプレイヤー少し前方へ設置。設置地点に留まりオート射撃。
        // 追従しない=移動すると置き去り。設置時は必ず前方集中モードで開始する。
        const { actor: trActor, owner: trOwner } = subSubject('turret');
        if (
          !inReturnCircle &&
          trActor.subWeapons.includes('turret') &&
          !subWeaponBlockedByKatana(trActor, 'turret') &&
          gameTime >= (trActor.subWeaponCooldowns['turret'] ?? 0)
        ) {
          const level = Math.max(1, Math.min(3, trActor.subWeaponLevels['turret'] ?? 1));
          // G2.6: 設置位置/向きはオーナー(既定=プレイヤー=従来と同値)。
          const dir = trOwner.facing ?? { x: 1, y: 0 };
          const dmag = Math.max(0.001, Math.hypot(dir.x, dir.y));
          const ux = dir.x / dmag;
          const uy = dir.y / dmag;
          const nowMs = Date.now();
          // 同時設置は1個: 既存タレットがあれば消す(デコイ/シールドと同じ流儀)。
          for (const t of useGameStore.getState().projectiles.filter(p => p.weaponType === 'turret')) {
            removeProjectile(t.id);
            turretFireRef.current.delete(t.id);
          }
          const pcx = ownerCenterX(trOwner);
          const pcy = ownerCenterY(trOwner);
          // 足元(下辺中央)= プレイヤー中心から進行方向へ少し前方。設置物ルール(footRect)に合わせ
          // x,y は足元から当たり判定矩形を作る(下辺=足元)。
          const footX = pcx + ux * TURRET_PLACE_FORWARD;
          const footY = pcy + uy * TURRET_PLACE_FORWARD;
          const ghostOwned = trOwner.kind === 'ghost-ally';
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
            ownerGhost: ghostOwned ? true : undefined, // 視覚専用マーカー(青白tint)
          });
          // 設置演出: 軽い着地リング+小ダスト(短命・軽量)。
          spawnRing(footX, footY, 4, 26, ghostOwned ? 'rgba(159,216,255,0.7)' : 'rgba(148,163,184,0.7)', 2, 220);
          spawnBurst(footX, footY, ghostOwned ? '#9fd8ff' : '#94a3b8', 6);
          // v0.25.2480: ゴースト発動時のみ設置点で距離減衰(プレイヤー発動は従来どおり等倍)。
          const turretGain = ghostOwned ? subSfxGainAt(footX, footY) : 1;
          if (turretGain > 0) playSfx('shield-deploy', turretGain);
          // ★v0.25.3552(社長報告「CDがズルしてる。設置からのCDになってる」): CDは**タレットが
          // 消えてから**数える(= 設置時刻 + 寿命 + CD)。旧実装はCDが寿命と並走していたため、
          // Lv2/Lv3の長い寿命が毎回捨てられ、どのLvでも実効「10秒周期で常設」になっていた。
          // 式は turretTuning.ts(Lv差の唯一の出どころ)へ集約。
          setActorSubWeaponCooldown(ownerGhostId(trOwner), 'turret', turretNextReadyAt(gameTime, level));
          consumeGhostSubClaim(trOwner); // G2.6
        }

        // 火炎瓶(molotov): 10秒サイクルで、移動中のみ1秒に1個ずつ足元に火を設置(Lv別本数=3/5/7)。
        // 判定(いつ・何本)は純関数 computeMolotovTick(src/utils/molotov.ts)に閉じており、ここは
        // その結果を store へ書き込む(設置=spawnGroundFire/サイクル状態=setMolotovCycle/次CD=setSubWeaponCooldown)だけ。
        if (
          !inReturnCircle &&
          subWeaponPlayer.subWeapons.includes('molotov') &&
          !subWeaponBlockedByKatana(subWeaponPlayer, 'molotov')
        ) {
          const level = Math.max(1, Math.min(3, subWeaponPlayer.subWeaponLevels['molotov'] ?? 1));
          const molotovCycleNow = useGameStore.getState().molotovCycle;
          const molotovResult = computeMolotovTick({
            gameTime,
            isMoving: subWeaponPlayer.isMoving,
            cycle: molotovCycleNow,
            cooldownAt: subWeaponPlayer.subWeaponCooldowns['molotov'] ?? 0,
            maxFires: MOLOTOV_FIRES_BY_LEVEL[level],
          });
          if (molotovResult.cycle !== molotovCycleNow) {
            useGameStore.getState().setMolotovCycle(molotovResult.cycle);
          }
          if (molotovResult.cooldownAt !== null) {
            setSubWeaponCooldown('molotov', molotovResult.cooldownAt);
          }
          if (molotovResult.drop) {
            // G2.6: 入口はオーナー形だが、この種はプレイヤー固定(「本人が移動中のみ足元へ置く」設計で
            // 発動条件と設置位置が本人の移動に結合している)。ゴースト対応は★未決の未対応リスト。
            const footX = ownerCenterX(playerOwner);
            const footY = ownerFootY(playerOwner);
            useGameStore.getState().spawnGroundFire(footX, footY);
          }
        }

        // SKILL_BUILD_REDESIGN.md §28(B7) スキル: 血の履帯(blood-treads) = 移動軌跡に棘を残す
        // (幅24px・tick250ms・§16-5)。molotovと同じ「本人が移動中のみ足元へ置く」型(プレイヤー固定。
        // ゴースト対応は★未決)。★未決: 設置間隔は仕様に数値指定が無いため、tick(250ms)を流用して
        // 1本化した(BLOOD_TREADS_SPAWN_INTERVAL_MS)。
        if (!inReturnCircle && hasSkill(subWeaponPlayer, 'blood-treads') && subWeaponPlayer.isMoving) {
          if (gameTime >= subWeaponPlayer.bloodTreadNextAt) {
            const footX = ownerCenterX(playerOwner);
            const footY = ownerFootY(playerOwner);
            useGameStore.getState().spawnBloodSpike(footX, footY);
            useGameStore.setState(state => ({
              player: { ...state.player, bloodTreadNextAt: gameTime + BLOOD_TREADS_SPAWN_INTERVAL_MS },
            }));
          }
        }

        // 援護射撃(support-sniper): 移動中のみCDが進み、CD毎(Lv1=6s/Lv2=5s/Lv3=4s・v0.25.1726調整)にNPC1人が
        // 「狙う敵と反対側の画面縁」からスライドイン→プレイヤーと同性能のスナイパー弾(rifle-t2・
        // 既存プレイヤー弾パイプライン)を最寄り敵へ発射→向きを変えず後退して消える(PACING_PUZZLE.md §6.5 M28)。
        // CD進行/発射可否は純関数 computeSupportSniperTick、出現点は computeSupportSniperEntry
        // (src/utils/supportSniper.ts)。ここは結果の反映のみ。スローモーションは発生させない(CLAUDE.md)。
        if (
          !inReturnCircle &&
          subWeaponPlayer.subWeapons.includes('support-sniper') &&
          !subWeaponBlockedByKatana(subWeaponPlayer, 'support-sniper')
        ) {
          const ssLevel = Math.max(1, Math.min(3, subWeaponPlayer.subWeaponLevels['support-sniper'] ?? 1));
          const ssState = useGameStore.getState();
          // G2.6: 入口はオーナー形だが、この種はプレイヤー固定(専用タイマーが「プレイヤーの移動中のみ」
          // 進む+出現点の画面縁計算がプレイヤー画面基準)。ゴースト対応は★未決の未対応リスト。
          const ssPcx = ownerCenterX(playerOwner);
          const ssPcy = ownerCenterY(playerOwner);
          // 狙い=プレイヤーから一番近い敵(死神の非追跡個体=無敵の徘徊体は狙わない。手榴弾の照準と同じ除外)。
          let ssTarget: (typeof ssState.enemies)[number] | null = null;
          let ssBest = Infinity;
          for (const e of ssState.enemies) {
            if (e.type === 'reaper' && !e.reaperChaser) continue;
            const d = Math.hypot(e.x + e.width / 2 - ssPcx, e.y + e.height / 2 - ssPcy);
            if (d < ssBest) { ssBest = d; ssTarget = e; }
          }
          const ssTick = computeSupportSniperTick({
            deltaMs: deltaTime * 1000,
            isMoving: subWeaponPlayer.isMoving,
            // NPCは同時1人。前の演出が残っている間は「撃てない」扱い=満タン(0)保持で先送りし、
            // 空いたフレームで即発射する(発射扱いでCDを巻き戻さない)。
            hasEnemy: ssTarget !== null && !ssState.supportSniperNpc,
            cdRemainingMs: ssState.supportSniperCdMs,
            cooldownMs: SUPPORT_SNIPER_CD_MS_BY_LEVEL[ssLevel],
          });
          // スキル: オーバークロック = 発射時に20/25/30%でタイマー即満タン(CD式サブと同じ抽選・§6.8 M31)。
          // スキル: タイムキーパー(§6.10 M33⑥) = 専用タイマーのCD開始時にも skillCooldownMult(×0.9/0.8/0.7)を乗算
          // (他サブのsetSubWeaponCooldown合流点と同じ扱い)。
          let ssCdNext = ssTick.cdRemainingMs;
          if (ssTick.fire) {
            recordSubUse('support-sniper'); // M35: 専用タイマー式=手動合流点(CD開始=発動)。計測のみ
            // G2.6 CD正規化: 2スキルの適用は合流点と同じ共有純関数(挙動不変。発射時のcdRemainingMsは
            // 常に正なので抽選条件も従来の無条件抽選と等価)。
            const ssCd = applySubCooldownSkills(
              skillOverclockChance(subWeaponPlayer), skillCooldownMult(subWeaponPlayer), ssTick.cdRemainingMs);
            if (ssCd.overclockProc) {
              recordOverclockProc(); // M35: 援護射撃タイマー側の成立計測
              // §21(B5)枠光: 視覚のみ。専用タイマー式=手動合流点なので他2箇所と同じくここでも点ける。
              // 覚醒(Lv3・v0.25.3300): proc成立時に銃もクイックリロード(3地点共通の1本)。
              useGameStore.setState(s => ({ player: { ...s.player, overclockLightUntil: s.gameTime + OVERCLOCK_LIGHT_MS, ...overclockAwakenReloadPatch(s.player) } }));
            }
            ssCdNext = ssCd.deltaMs;
          }
          if (ssCdNext !== ssState.supportSniperCdMs) {
            useGameStore.getState().setSupportSniperCd(ssCdNext);
          }
          if (ssTick.fire && ssTarget && !ssState.supportSniperNpc) {
            // 監査v0.25.3008: カメラ矩形→プレイヤー中心の同寸矩形(ズーム連動カメラ下げで入場位置が北へずれるのを防ぐ)。
            const ssGb = ssState.gameBounds;
            const entry = computeSupportSniperEntry(
              ssTarget.x + ssTarget.width / 2, ssTarget.y + ssTarget.height / 2,
              ssPcx, ssPcy,
              { left: ssPcx - ssGb.width / 2, top: ssPcy - ssGb.height / 2, right: ssPcx + ssGb.width / 2, bottom: ssPcy + ssGb.height / 2 },
              (Math.random() - 0.5) * 0.24, // ±少しランダム(叩き台: 約±7°)
            );
            if (entry) {
              useGameStore.getState().setSupportSniperNpc({
                id: Date.now(),
                x: entry.x, y: entry.y,
                dirX: entry.dirX, dirY: entry.dirY,
                // 絵=「この出撃で護衛に出ていない軍人NPC」からランダム(§6.9 M32・社長訂正v0.25.1727:
                // プレイアブル4クラスではなくエドガー等の軍人)。フェイザーはレア枠のため既定プール外。
                soldierIndex: pickSupportSniperSoldier(
                  ssState.escorts.map(e => e.soldierIndex), BASE_SOLDIER_COUNT, PHASER_INDEX),
                spawnedAt: gameTime,
                firedAt: 0,
                targetEnemyId: ssTarget.id,
              });
            }
          }
        }
        // 援護射撃NPCの状態機械(スライドイン完了→発射/スライドアウト完了→消滅)。装備の有無に
        // 関わらず進める(発射待ちの間に装備が外れても演出は完走させる)。描画は pixiScene が直読み。
        {
          const ssNpc = useGameStore.getState().supportSniperNpc;
          if (ssNpc) {
            if (ssNpc.firedAt === 0 && gameTime >= ssNpc.spawnedAt + SUPPORT_SNIPER_SLIDE_IN_MS) {
              // 発射位置=スライドイン終点(縁の内側 SUPPORT_SNIPER_INSET)。銃口ぶん少し上から撃つ(見た目)。
              const fireX = ssNpc.x + ssNpc.dirX * SUPPORT_SNIPER_INSET;
              const fireY = ssNpc.y + ssNpc.dirY * SUPPORT_SNIPER_INSET;
              const muzzleY = fireY - 20;
              const stNow = useGameStore.getState();
              // v0.25.2563(GHOST-SUBS-FINAL): 呼んだ主語。守護霊が呼んだNPCなら弾の倍率評価も
              // 持ち替え基準点もその守護霊(疑似Player)。プレイヤーが呼んだ場合は従来と1bit同じ。
              const ssSubject = (ssNpc.ownerGhostId !== undefined
                ? combatActorPlayer(ssNpc.ownerGhostId)
                : null) ?? stNow.player;
              // 狙った敵の現在位置へ(発射までの250msで倒されていたら、その時点の最寄り敵へ持ち替え)。
              let tgt = stNow.enemies.find(e => e.id === ssNpc.targetEnemyId) ?? null;
              if (!tgt) {
                let best = Infinity;
                const pcx2 = ssSubject.x + ssSubject.width / 2;
                const pcy2 = ssSubject.y + ssSubject.height / 2;
                for (const e of stNow.enemies) {
                  if (e.type === 'reaper' && !e.reaperChaser) continue;
                  const d = Math.hypot(e.x + e.width / 2 - pcx2, e.y + e.height / 2 - pcy2);
                  if (d < best) { best = d; tgt = e; }
                }
              }
              let aimX = ssNpc.dirX, aimY = ssNpc.dirY; // 敵が全滅していたら向きのまま撃つ(害なし)
              if (tgt) {
                const tx = tgt.x + tgt.width / 2 - fireX;
                const ty = tgt.y + tgt.height / 2 - muzzleY;
                const tm = Math.max(0.001, Math.hypot(tx, ty));
                aimX = tx / tm; aimY = ty / tm;
              }
              addProjectile(buildSupportSniperShot(ssSubject, fireX, muzzleY, { x: aimX, y: aimY }, gameTime));
              // SE: プレイヤーのスナイパー発砲音(rifle-fire)を護衛NPCと同じ npcSfxDistGain で距離減衰。
              const ssPl = stNow.player;
              const g = npcSfxDistGain(
                fireX, fireY,
                ssPl.x + ssPl.width / 2, ssPl.y + ssPl.height / 2,
                stNow.camera, stNow.gameBounds,
              );
              if (g > 0) playSfx('rifle-fire', g);
              // マズルフラッシュ(プレイヤー射撃と同じ小グロー・イベント駆動=軽い。強glowではない)。
              useGameStore.getState().spawnGlow(fireX + aimX * 18, muzzleY + aimY * 18, 15, 'rgba(255,238,170,', 90);
              useGameStore.getState().setSupportSniperNpc({ ...ssNpc, firedAt: gameTime });
            } else if (ssNpc.firedAt > 0 && gameTime >= ssNpc.firedAt + SUPPORT_SNIPER_SLIDE_OUT_MS) {
              useGameStore.getState().setSupportSniperNpc(null);
            }
          }
        }

        // 救急鞄(first-aid-kit): レベルで開放される中身(Lv1=弾薬のみ/Lv2=+回復/Lv3=+爆弾)を、
        // 条件成立時に既存Pickup(ammo-*/health/bomb)として1回ずつ払い出す(quick-magazineと同じ
        // 短い投擲アークで足元付近に投げ、プレイヤーが拾うと既存の収集効果がそのまま適用される)。
        // 開放中の中身を全て払い出し終えたら、空の鞄を最寄りの敵へ投げる(5ダメージ+ノックバック、
        // 1ラン1回・使い切り)。判定(何を払い出すか/空になったか)は純関数
        // computeFirstAidKitTick/isFirstAidKitEmpty(src/utils/firstAidKit.ts)に閉じており、
        // ここはその結果を store(firstAidKitState)へ書き込み、addPickup/damageEnemyを呼ぶだけ。
        if (
          !inReturnCircle &&
          subWeaponPlayer.subWeapons.includes('first-aid-kit') &&
          !subWeaponBlockedByKatana(subWeaponPlayer, 'first-aid-kit')
        ) {
          const level = Math.max(1, Math.min(3, subWeaponPlayer.subWeaponLevels['first-aid-kit'] ?? 1));
          const ammoTypesUsed = Array.from(new Set(
            subWeaponPlayer.weapons
              .filter(w => !w.isMelee && (w.ammoType === 'handgun' || w.ammoType === 'shotgun' || w.ammoType === 'rifle'))
              .map(w => w.ammoType as FirstAidKitAmmoType)
          ));
          const kitStateNow = useGameStore.getState().firstAidKitState;
          // G2.6: 入口はオーナー形だが、この種はプレイヤー固定(1ラン1回の使い切り+中身の払い出し条件が
          // プレイヤーの弾薬/HPに結合)。ゴースト対応は★未決の未対応リスト。なお払い出された回復(health)の
          // 拾得は collectPickup の「1つの薬棚」でゴーストにも効く。
          const pcx = ownerCenterX(playerOwner);
          const pcy = ownerCenterY(playerOwner);

          // Lv3の爆弾条件でしか使わない値なので、該当しない時は画面内敵数の走査自体をしない。
          let onScreenEnemyCount = 0;
          if (level >= 3 && !kitStateNow.bombDispensed) {
            // 監査v0.25.3008: カメラ矩形→プレイヤー中心(ズーム連動カメラ下げで南側が漏れて過少カウントに)。
            const kpl = useGameStore.getState().player;
            const kpx = kpl.x + kpl.width / 2, kpy = kpl.y + kpl.height / 2;
            onScreenEnemyCount = useGameStore.getState().enemies.reduce((n, e) => {
              const ex = e.x + e.width / 2, ey = e.y + e.height / 2;
              return (Math.abs(ex - kpx) <= gameBounds.width / 2 && Math.abs(ey - kpy) <= gameBounds.height / 2) ? n + 1 : n;
            }, 0);
          }

          const kitResult = computeFirstAidKitTick({
            level,
            ammoTypesUsed,
            ammoHandgun: subWeaponPlayer.ammoHandgun,
            ammoShotgun: subWeaponPlayer.ammoShotgun,
            ammoRifle: subWeaponPlayer.ammoRifle,
            health: subWeaponPlayer.health,
            maxHealth: subWeaponPlayer.maxHealth,
            onScreenEnemyCount,
            state: kitStateNow,
          });

          if (kitResult.dispense) {
            recordSubUse('first-aid-kit'); // M35: CD無しサブの発動計測(払い出し1回=1発動・挙動不変)
            useGameStore.getState().setFirstAidKitState(kitResult.nextState);
            // 発動演出(社長指示v0.25.1656): 振り抜きポーズ+救急鞄を掲げる一拍(描画のみ・判定不変)。
            useGameStore.getState().markFirstAidPoseFx();
            // 飛び出しの一拍を強調(社長指示v0.25.1657): プレイヤー(掲げた鞄)へ寄り+スロー。
            // 救急鞄は社長が明示的にスロー対象へ指名=CLAUDE.mdのサブウェポン・スロー禁止の例外。
            useGameStore.getState().triggerZoom(FIRST_AID_POP_ZOOM_MAG, FIRST_AID_POP_ZOOM_MS, FIRST_AID_POP_ZOOM_HOLD_MS, pcx, pcy);
            useGameStore.getState().triggerTimeSlow(FIRST_AID_POP_SLOW_SCALE, FIRST_AID_POP_SLOW_MS);
            const dir = safeThrowDirection(
              pcx, pcy,
              useGameStore.getState().enemies,
              playerOwner.facing ?? { x: 1, y: 0 },
            );
            const dirMag = Math.max(0.001, Math.hypot(dir.x, dir.y));
            const px = pcx + (dir.x / dirMag) * FIRST_AID_KIT_THROW_DISTANCE;
            const py = pcy + (dir.y / dirMag) * FIRST_AID_KIT_THROW_DISTANCE;
            // アイテムは「掲げた鞄」から飛び出す見た目にするため、投擲の起点を上半身の高さへ上げる。
            const fromX = pcx - 8;
            const fromY = pcy - subWeaponPlayer.height * 0.5 - 8;
            addPickup({
              id: `pickup-first-aid-kit-${kitResult.dispense}-${Date.now()}`,
              x: px - 8,
              y: py - 8,
              type: kitResult.dispense,
              value: 0,
              throwFromX: fromX,
              throwFromY: fromY,
              throwStartAt: Date.now(),
              throwDuration: FIRST_AID_KIT_THROW_MS
            });
            spawnRing(fromX + 8, fromY + 8, 4, 18, 'rgba(226,232,240,0.72)', 2, 220);
            spawnRing(px, py, 4, 22, 'rgba(226,232,240,0.7)', 2, 260);
            spawnBurst(px, py, '#e2e8f0', 6);
          }

          // 中身を払い出し切っていたら(=鞄が空)、空の鞄を最寄りの敵へ投げる。ターゲットが画面に
          // 居ないフレームでは thrown を確定させず、敵が現れたフレームで改めて実行する。
          // 実際のダメージ/ノックバック/FX適用は着弾時(gameStore.tickThrownBags)。ここは投擲の
          // 発生(=飛んでいく鞄エンティティの生成)のみ。thrownはこの発生フレームで確定させる
          // (毎フレーム再トリガーしないよう、飛翔中に再度ここへ入らないようにするため)。
          const kitStateAfterDispense = kitResult.dispense ? kitResult.nextState : kitStateNow;
          if (!kitStateAfterDispense.thrown && isFirstAidKitEmpty(kitStateAfterDispense, level)) {
            const target = useGameStore.getState().enemies
              .filter(e => e.type !== 'reaper' || e.reaperChaser)
              .map(e => ({ enemy: e, dist: Math.hypot(e.x + e.width / 2 - pcx, e.y + e.height / 2 - pcy) }))
              .sort((a, b) => a.dist - b.dist)[0]?.enemy;
            if (target) {
              const tx = target.x + target.width / 2;
              const ty = target.y + target.height / 2;
              useGameStore.getState().spawnThrownBag(pcx, pcy, { id: target.id, x: tx, y: ty }, FIRST_AID_KIT_THROW_DAMAGE);
              useGameStore.getState().setFirstAidKitState({ ...kitStateAfterDispense, thrown: true });
            }
          }
        }

        // 発火ナイフ: クールダウンごとに最も近い敵1体へナイフを投擲(敵が居る時だけ)。
        const { actor: fkActor, owner: fkOwner } = subSubject('fire-knife');
        if (
          !inReturnCircle &&
          fkActor.subWeapons.includes('fire-knife') &&
          !subWeaponBlockedByKatana(fkActor, 'fire-knife') &&
          gameTime >= (fkActor.subWeaponCooldowns['fire-knife'] ?? 0)
        ) {
          const level = Math.max(1, Math.min(3, fkActor.subWeaponLevels['fire-knife'] ?? 1));
          // G2.6: 投擲位置/照準の起点はオーナー(既定=プレイヤー=従来と同値)。
          const pcx = ownerCenterX(fkOwner);
          const pcy = ownerCenterY(fkOwner);
          const ghostOwned = fkOwner.kind === 'ghost-ally';
          // v0.25.2472: ターゲット選択は照準の合流点(純関数)へ。プレイヤー=従来の最寄り非リーパー
          // (手順まで同一=挙動不変)/ゴースト=紐付きボス優先。
          const target = pickSubAimTarget(fkOwner, ghostSubBossId, useGameStore.getState().enemies);
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
              ownerGhost: ghostOwned ? true : undefined, // 視覚専用マーカー(青白tint)
            });
            // v0.25.2480: ゴースト発動時のみ投擲点(オーナー中心)で距離減衰(プレイヤー発動は従来どおり等倍)。
            const knifeGain = ghostOwned ? subSfxGainAt(pcx, pcy) : 1;
            if (knifeGain > 0) playSfx('shot-damage', knifeGain);
            setActorSubWeaponCooldown(ownerGhostId(fkOwner), 'fire-knife', gameTime + FIRE_KNIFE_COOLDOWN_BY_LEVEL[level]);
            consumeGhostSubClaim(fkOwner); // G2.6
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
            // G4a計測(v0.25.2563・社長裁定「ロックは秒数平均だけ持っておけば?」): 押し始めの打刻。
            // 記録専用=挙動には一切影響しない。
            if (homingHoldStartRef.current === 0) homingHoldStartRef.current = Date.now();
            // 0.5秒ごとに1体ロックを追加。
            if (gameTime >= nextHomingLockRef.current) {
              nextHomingLockRef.current = gameTime + HOMING_LOCK_INTERVAL_MS;
              const level = Math.max(1, Math.min(3, subWeaponPlayer.subWeaponLevels['homing'] ?? 1));
              // v0.25.2563: ロック蓄積は**守護霊と共有の純関数**(手順・優先順は旧インライン実装と同一)。
              const step = stepHomingLocks({
                locks: homingLocksRef.current,
                maxLocks: HOMING_MAX_LOCKS_BY_LEVEL[level],
                ownerCx: ownerCenterX(playerOwner),
                ownerCy: ownerCenterY(playerOwner),
                enemies: useGameStore.getState().enemies,
              });
              // 1段階目(白)/2段階目(赤)でSEを鳴らし分ける。
              if (step.added) playSfx(step.added === 'first' ? 'homing-lock' : 'homing-lock2');
              newLocks = step.locks;
            }
          } else {
            // G4a計測: 指を離した瞬間に「押していた時間」を1回だけ記録する(ロックが有る=発射が成立した時のみ。
            // 発射自体は VirtualJoystick の fireHoming が既に済ませており、この ref はまだ離す前のロックを持つ)。
            if (homingHoldStartRef.current !== 0) {
              if (homingLocksRef.current.length > 0) recordHomingHold(Date.now() - homingHoldStartRef.current);
              homingHoldStartRef.current = 0;
            }
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

        // ============================================================================================
        // GHOST-SUBS-FINAL(v0.25.2563 / research/GHOST_PARITY_LEDGER.md「構造ズレ組サブ6種の裁定」):
        // 「プレイヤー主語に直結していて写せていなかった」サブを、**主語(オーナー)引数化**で守護霊にも
        // 通す。プレイヤー側の式・定数・分岐は1文字も変えていない(上のブロック群は不変)。
        // 差分は除外1(演出=停止/スロー/ズームを出さない)/除外4(計測・弾薬・SE距離減衰)だけ。
        // ※犬(dog)は§2.11追補3「霊体は世界の物に触れない」と衝突するため**本バッチでは止めた**
        //   (台帳★未決に記載。裁定が出るまでプレイヤー専用のまま)。
        // ============================================================================================
        if (ghostAllyForSub) {
          const gSub = ghostAllyForSub;
          const nowMsFrame = Date.now();
          const gActor = combatActorPlayer(gSub.id); // 疑似Player(計測時ビルド+実体の座標/HP/自前CD帳簿)
          const gOwner = ghostAsOwner(gSub);
          const gcx = ownerCenterX(gOwner);
          const gcy = ownerCenterY(gOwner);
          const ghostOwnsSub = (key: SubWeaponKey): boolean =>
            !inReturnCircle && gActor !== null
            && gActor.subWeapons.includes(key) && !subWeaponBlockedByKatana(gActor, key);
          const ghostSubLevel = (key: SubWeaponKey): number =>
            Math.max(1, Math.min(3, gActor?.subWeaponLevels[key] ?? 1));
          const patchGhost = (patch: Partial<Summon>): void => {
            useGameStore.setState(st => ({
              summons: st.summons.map(s => s.id === gSub.id ? { ...s, ...patch } : s),
            }));
          };

          // ---- 火炎瓶(molotov): 「本人が移動中のみ足元へ1秒に1個」を主語ごとに ----
          // 判定は**プレイヤーと同じ純関数**(computeMolotovTick)。移動判定はゴーストの実移動
          // (オービット含む=ghostIsMoving)。サイクル状態とCDは自前の帳簿へ。
          if (ghostOwnsSub('molotov') && gActor) {
            const cycleNow = gSub.ghostMolotovCycle ?? null;
            const r = computeMolotovTick({
              gameTime,
              isMoving: gSub.ghostIsMoving ?? false,
              cycle: cycleNow,
              cooldownAt: gActor.subWeaponCooldowns['molotov'] ?? 0,
              maxFires: MOLOTOV_FIRES_BY_LEVEL[ghostSubLevel('molotov')],
            });
            if (r.cycle !== cycleNow) patchGhost({ ghostMolotovCycle: r.cycle });
            if (r.cooldownAt !== null) setActorSubWeaponCooldown(gSub.id, 'molotov', r.cooldownAt);
            if (r.drop) useGameStore.getState().spawnGroundFire(gcx, ownerFootY(gOwner), gSub.id);
          }

          // ---- 援護射撃(support-sniper): 「移動中のみ進むタイマー」を主語ごとに ----
          // CD進行/発射可否は**プレイヤーと同じ純関数**(computeSupportSniperTick)、出現点も同じ
          // (computeSupportSniperEntry)。狙いは他のゴーストサブと同じく紐付きボス優先。
          // NPC枠は世界の1枠のまま=埋まっている間は満タン保持で待つ(既存の待ち規則)。
          if (ghostOwnsSub('support-sniper') && gActor) {
            const lvl = ghostSubLevel('support-sniper');
            const cdMs = SUPPORT_SNIPER_CD_MS_BY_LEVEL[lvl];
            const ssState = useGameStore.getState();
            const target = pickSubAimTarget(gOwner, ghostSubBossId, ssState.enemies);
            const tick = computeSupportSniperTick({
              deltaMs: deltaTime * 1000,
              isMoving: gSub.ghostIsMoving ?? false,
              hasEnemy: target !== undefined && !ssState.supportSniperNpc,
              cdRemainingMs: gSub.ghostSupportSniperCdMs ?? cdMs,
              cooldownMs: cdMs,
            });
            let next = tick.cdRemainingMs;
            if (tick.fire) {
              // スキル(オーバークロック/タイムキーパー)はプレイヤーと同じ共有純関数を、**ゴースト自身の
              // ビルド**を主語に通す。計測(recordSubUse/recordOverclockProc)は除外4=積まない。
              next = applySubCooldownSkills(
                skillOverclockChance(gActor), skillCooldownMult(gActor), tick.cdRemainingMs).deltaMs;
            }
            if (next !== (gSub.ghostSupportSniperCdMs ?? cdMs)) patchGhost({ ghostSupportSniperCdMs: next });
            if (tick.fire && target && !ssState.supportSniperNpc) {
              // 監査v0.25.3008: カメラ矩形→プレイヤー中心の同寸矩形(上と同じ理由)。
              const spcl = ssState.player;
              const spcx = spcl.x + spcl.width / 2, spcy = spcl.y + spcl.height / 2;
              const entry = computeSupportSniperEntry(
                target.x + target.width / 2, target.y + target.height / 2,
                gcx, gcy,
                { left: spcx - gameBounds.width / 2, top: spcy - gameBounds.height / 2, right: spcx + gameBounds.width / 2, bottom: spcy + gameBounds.height / 2 },
                (Math.random() - 0.5) * 0.24,
              );
              if (entry) {
                useGameStore.getState().setSupportSniperNpc({
                  id: Date.now(),
                  x: entry.x, y: entry.y, dirX: entry.dirX, dirY: entry.dirY,
                  soldierIndex: pickSupportSniperSoldier(
                    ssState.escorts.map(e => e.soldierIndex), BASE_SOLDIER_COUNT, PHASER_INDEX),
                  spawnedAt: gameTime, firedAt: 0, targetEnemyId: target.id,
                  ownerGhostId: gSub.id, // 弾の倍率評価の主語=この守護霊
                });
              }
            }
          }

          // ---- 救急鞄(first-aid-kit): 自前在庫1・**自分のHPへ使う** ----
          // 裁定(2026-07-31)「各自が自分の鞄を1回使う。自前在庫1(Summonへ)・自分のHPへ使用。
          // 使用判断=HP閾値(叩き台50%)」。判断は**プレイヤーと同じ純関数**(computeFirstAidKitTick)で、
          // しきい値も同じ定数(FIRST_AID_KIT_HEAL_THRESHOLD_FRAC=最大HPの50%未満)。回復量は回復
          // ピックアップと同じ HEAL_FRACTION(最大HPの30%)=「1つの薬棚」の規則を共有する。
          // 弾薬(除外4=守護霊は弾薬を消費しない)と爆弾(§2.11追補3=世界へアイテムを撒かない)は
          // 守護霊の鞄には入っていない=**最初から払い出し済み**として初期化する(在庫1=回復のみ)。
          // 使い切ったら空鞄を最寄りの敵へ投げる=プレイヤーと同じ spawnThrownBag/同じダメージ定数。
          if (ghostOwnsSub('first-aid-kit') && gActor) {
            const lvl = ghostSubLevel('first-aid-kit');
            const kit = gSub.ghostFirstAidKit ?? GHOST_FIRST_AID_KIT_INITIAL;
            const r = computeFirstAidKitTick({
              level: lvl,
              ammoTypesUsed: [],           // 守護霊は弾薬を使わない(除外4)
              ammoHandgun: 0, ammoShotgun: 0, ammoRifle: 0,
              health: gSub.health, maxHealth: gSub.maxHealth,
              onScreenEnemyCount: 0,       // 爆弾は鞄に入っていない(上のコメント)
              state: kit,
            });
            if (r.dispense === 'health') {
              // 自分のHPへ(世界へ回復アイテムを撒かない=§2.11追補3)。式は既存のゴースト回復と同一。
              useGameStore.setState(st => ({
                summons: st.summons.map(s => s.id === gSub.id
                  ? {
                    ...s,
                    health: Math.min(s.health + Math.round(s.maxHealth * HEAL_FRACTION), s.maxHealth),
                    ghostFirstAidKit: r.nextState,
                  }
                  : s),
              }));
              // 演出: 除外1(ズーム/スロー)は出さない。リング+バーストとSE(距離減衰)だけ。
              spawnRing(gcx, gcy, 4, 30, 'rgba(226,232,240,0.75)', 2, 280);
              spawnBurst(gcx, gcy, '#e2e8f0', 8);
              const kitGain = subSfxGainAt(gcx, gcy);
              if (kitGain > 0) playSfx('eat', kitGain);
            } else if (r.dispense !== null) {
              patchGhost({ ghostFirstAidKit: r.nextState }); // 到達しない想定(在庫は回復1つ)だが状態は進める
            } else {
              const after = kit;
              if (!after.thrown && isFirstAidKitEmpty(after, lvl)) {
                const bagTarget = useGameStore.getState().enemies
                  .filter(e => e.type !== 'reaper' || e.reaperChaser)
                  .map(e => ({ enemy: e, dist: Math.hypot(e.x + e.width / 2 - gcx, e.y + e.height / 2 - gcy) }))
                  .sort((a, b) => a.dist - b.dist)[0]?.enemy;
                if (bagTarget) {
                  useGameStore.getState().spawnThrownBag(
                    gcx, gcy,
                    { id: bagTarget.id, x: bagTarget.x + bagTarget.width / 2, y: bagTarget.y + bagTarget.height / 2 },
                    FIRST_AID_KIT_THROW_DAMAGE,
                  );
                  patchGhost({ ghostFirstAidKit: { ...after, thrown: true } });
                }
              } else if (gSub.ghostFirstAidKit === undefined) {
                patchGhost({ ghostFirstAidKit: kit }); // 初期在庫を1回だけ書き込む
              }
            }
          }

          // ---- クイックマガジン(striker-quick-mag): 投げて**自分で**拾いに行く ----
          // 裁定「各自が投げて自分で拾いに行く/回収が行動に割り込むのは許容」。回収の移動目標は
          // ghostDriver(retrieveTarget)へ渡す。拾得は下のゴーストtickで自分の物だけを拾う。
          // リザーブ残量だけは除外4(霊体は在庫非消費)。マガジンには同じ空き/リロード状態があるため、
          // 回収時はプレイヤーと同じ共通装填式で即時装填する。
          {
            const { owner: qmOwner } = subSubject('striker-quick-mag');
            const qmGun = gActor ? getActiveGun(gActor) : undefined;
            const qmNeedsRounds = gActor !== null && !!qmGun?.ammoType
              && (qmGun.magazine ?? 0) < effectiveMagSize(qmGun, gActor);
            if (qmOwner.kind === 'ghost-ally' && qmOwner.summonId === gSub.id && ghostOwnsSub('striker-quick-mag') && gActor && qmNeedsRounds) {
              const lvl = ghostSubLevel('striker-quick-mag');
              // 投げ先=敵が少ない方面(プレイヤーと同じ safeThrowDirection・同じ距離)。
              const dir = safeThrowDirection(gcx, gcy, useGameStore.getState().enemies, gOwner.facing ?? { x: 1, y: 0 });
              const dirMag = Math.max(0.001, Math.hypot(dir.x, dir.y));
              const px = gcx + (dir.x / dirMag) * STRIKER_QUICK_MAG_THROW_DISTANCE;
              const py = gcy + (dir.y / dirMag) * STRIKER_QUICK_MAG_THROW_DISTANCE;
              // 投げ直す時は**自分の**古いマガジンだけ消す(プレイヤーの物には触れない=2人分が独立)。
              useGameStore.setState(s => (
                s.pickups.some(p => p.type === 'quick-magazine' && p.ownerGhostId === gSub.id)
                  ? { pickups: s.pickups.filter(p => !(p.type === 'quick-magazine' && p.ownerGhostId === gSub.id)) }
                  : {}
              ));
              addPickup({
                id: `pickup-quick-mag-${gSub.id}-${Date.now()}`,
                x: px - 8, y: py - 8,
                type: 'quick-magazine',
                value: 1,
                throwFromX: gcx - 8, throwFromY: gcy - 8,
                throwStartAt: Date.now(),
                throwDuration: STRIKER_QUICK_MAG_THROW_MS,
                ownerGhostId: gSub.id,
              });
              spawnRing(gcx, gcy, 4, 18, 'rgba(159,216,255,0.72)', 2, 220);
              spawnRing(px, py, 4, 22, 'rgba(159,216,255,0.7)', 2, 260);
              spawnBurst(px, py, '#9fd8ff', 6);
              setActorSubWeaponCooldown(gSub.id, 'striker-quick-mag', gameTime + STRIKER_QUICK_MAG_COOLDOWN_BY_LEVEL[lvl]);
              consumeGhostSubClaim(qmOwner);
            }
          }

          // ---- ホーミング(homing): 「押しっぱなし→離す」を模擬する ----
          // 押している間のロック蓄積は**プレイヤーと同じ純関数**(stepHomingLocks)。押し続ける時間は
          // 計測平均(G4a: homingHoldMsAvg)で、上限=ロック満タン到達時間・下限=最初のロック成立に
          // clamp(utils/homing.ghostHomingHoldMs)。計測が無ければ満タンで発射(フォールバック)。
          {
            const holding = gSub.ghostHomingHoldStartAt !== undefined;
            const { owner: hmOwner } = subSubject('homing');
            const canStart = hmOwner.kind === 'ghost-ally' && hmOwner.summonId === gSub.id;
            if (!holding) {
              if (canStart) patchGhost({ ghostHomingHoldStartAt: nowMsFrame, ghostHomingNextLockAt: 0, ghostHomingLocks: [] });
            } else if (!ghostOwnsSub('homing') || !gActor) {
              // 押している最中に条件が崩れた(装備喪失/刀モード/帰還サークル)=指を離すだけ(発射しない)。
              patchGhost({ ghostHomingHoldStartAt: undefined, ghostHomingNextLockAt: undefined, ghostHomingLocks: [] });
            } else {
              const lvl = ghostSubLevel('homing');
              const maxLocks = HOMING_MAX_LOCKS_BY_LEVEL[lvl];
              let locks = gSub.ghostHomingLocks ?? [];
              if (gameTime >= (gSub.ghostHomingNextLockAt ?? 0)) {
                const step = stepHomingLocks({
                  locks, maxLocks, ownerCx: gcx, ownerCy: gcy, enemies: useGameStore.getState().enemies,
                });
                locks = step.locks;
                patchGhost({ ghostHomingLocks: locks, ghostHomingNextLockAt: gameTime + HOMING_LOCK_INTERVAL_MS });
                if (step.added) {
                  const lockGain = subSfxGainAt(gcx, gcy); // 除外4: ゴースト起因SEは距離減衰
                  if (lockGain > 0) playSfx(step.added === 'first' ? 'homing-lock' : 'homing-lock2', lockGain);
                }
              }
              const holdMs = ghostHomingHoldMs(ghostProfileRef.current?.homingHoldMsAvg, maxLocks);
              if (locks.length > 0 && nowMsFrame - (gSub.ghostHomingHoldStartAt ?? nowMsFrame) >= holdMs) {
                useGameStore.getState().fireHoming(gSub.id); // ロック/押し状態のクリアとCDは共有の1本が行う
                const fireGain = subSfxGainAt(gcx, gcy);
                if (fireGain > 0) playSfx('shot-damage', fireGain);
                consumeGhostSubClaim(ghostAsOwner(gSub));
              }
            }
          }
        }

        // 分身(サブウェポン): 画面外で消滅(攻撃なし)、画面内なら1秒ごとの自動近接(5秒)を進める。
        // v0.25.2541(§2.11追補): **主語ごとに1回ずつ**回す(プレイヤーの枠=従来と同じ順序・同じ規則、
        // 守護霊の枠=同じ関数・同じしきい値。ゴースト用の別ルールは無い)。
        {
          const runCloneTick = (clone: ShadowCloneState | null | undefined, ghostId?: string) => {
            if (!clone) return;
            // 監査v0.25.3008: 旧「カメラ矩形」判定は、ズーム連動カメラ下げ(v2994〜)でカメラが
            // プレイヤーの北を向くと**プレイヤー位置すら矩形外**になり、分身が出した瞬間に消えていた。
            // プレイヤー中心の同寸矩形で判定する(意図=「画面から完全に出たら消す」は保たれる)。
            const { player: pl, gameBounds } = useGameStore.getState();
            const plcx = pl.x + pl.width / 2, plcy = pl.y + pl.height / 2;
            const fullyOff =
              clone.x + clone.width < plcx - gameBounds.width / 2 ||
              clone.x > plcx + gameBounds.width / 2 ||
              clone.y + clone.height < plcy - gameBounds.height / 2 ||
              clone.y > plcy + gameBounds.height / 2;
            if (fullyOff) useGameStore.getState().expireShadowClone(ghostId);
            else useGameStore.getState().tickShadowClone(ghostId);
          };
          runCloneTick(useGameStore.getState().shadowClone);
          const cloneGhost = useGameStore.getState().summons.find(s => s.kind === 'ghost-ally' && s.ghostShadowClone);
          if (cloneGhost) runCloneTick(cloneGhost.ghostShadowClone, cloneGhost.id);
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

        // スラッシャー先行入力の自動発動(v0.25.3254: CD中のタップを予約→CD明けにここで発動)。
        // 予約なしなら即return=実質ゼロコスト。
        useGameStore.getState().pumpSlasherQueuedTap();

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
            // M51: ジャイアント新スクリプトの飛び掛かり滞空(g-jump-air)/突進(g-dash-charge)も対象
            // (?giantscript=0時は'jump'/'charge'のまま=旧経路で既にヒットする)。
            if (e.aiPhase !== 'jump' && e.aiPhase !== 'charge' && e.aiPhase !== 'g-jump-air' && e.aiPhase !== 'g-dash-charge') continue;
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
            // v0.25.3028: 大きめの爆発+強い揺れ(社長指示)。旧: この経路だけ揺れ無しだった=統一。
            spawnBossCrushExplosionFx(crushedX, crushedY);
          }
        }

        // v0.25.3028(社長指示「第二形態のパーツ壊れた時も同じく(大きめに爆発+画面揺れ)」):
        // 連結パーツの本数が減った瞬間、消えたパーツの位置(胴体弾と同じsim側軌跡の近似)で爆発。
        // 複数同時に欠けた場合も爆発は各位置に出し、揺れ/SEは1フレーム1回に間引く。
        {
          const prevGp = glenPartsPrevRef.current;
          let glenSeen = false;
          for (const e of useGameStore.getState().enemies) {
            if (e.type !== 'giantbat' || !glenScriptApplies(e.isStoryBoss, e.storyBossVariant, GLEN_SCRIPT_ENABLED)) continue;
            glenSeen = true;
            const hpFrac = e.maxHealth > 0 ? e.health / e.maxHealth : 1;
            const count = e.glenForm === 2 ? glenPartCountFull(hpFrac) : null; // v0.25.3029: 二体構成でパーツは形態2のフルバー
            if (prevGp && prevGp.id === e.id && prevGp.count != null && count != null && count < prevGp.count) {
              const simTrail = getGlenSimTrail();
              const anchors = glenRemovedPartAnchors(
                e, simTrail && simTrail.id === e.id ? simTrail.trail : [], prevGp.count, count);
              anchors.forEach((a, i) => spawnBossCrushExplosionFx(a.x, a.y, i === 0));
            }
            glenPartsPrevRef.current = { id: e.id, count };
            break; // ストーリーボスは同時1体
          }
          if (!glenSeen && prevGp) glenPartsPrevRef.current = null;
        }

        // PACING_PUZZLE.md §5.18 M17: ⑤ジャンプ落下攻撃の爆風(pumpkinBlasts消化)。
        // src/utils/combatTick.ts へ切り出し(挙動不変・コード移動のみ)。
        applyPumpkinBlastDamage(combatEffects, combatTunables);

        // M67(PACING_PUZZLE.md §6.26-12): グレン(stage-7)専用「血の弧」が置く血溜まりの床の接触判定。
        // giantDelayedHitsにfloorUntil付きエントリが無ければ即return(通常城ボス/ex1/他ボスは常に
        // 空配列なので毎フレームの実コストはほぼゼロ)。
        applyGlenFloorDamage(combatEffects);

        // M51: ジャイアント新スクリプトの予告SE(全技共通=hunter-alert流用・社長裁定6.26-9 #5)。
        // 5つの溜め(windup)ステートへ切り替わった瞬間だけ1回鳴らす(前フレームとの比較=エッジ検知)。
        // M66(§6.26-11): stage-1/3/4/5の独自技/大技の「先頭の溜め」も同じ作法で追加(1技=1発。
        // bite/glide/quaddashの"hold"や"breath-windup"以外の中間フェーズは鳴らさない=連射しない)。
        // M67(§6.26-12): グレン(stage-7)専用4技も同じ作法。虚無の三唱(nihil)は3つの明示aiPhase
        // (chant1/2/3)を持つため、この文字列比較エッジ検知だけで学習点④「数える」の3回パルスが
        // 自動的に鳴る(追加のカウンタ実装が不要=既存の仕組みへただ乗り)。
        if (GIANT_SCRIPT_ENABLED) {
          const giant = useGameStore.getState().enemies.find(e => e.type === 'giantbat');
          const gPhase = giant?.aiPhase;
          const isGiantWindupNow = gPhase === 'g-stomp-windup' || gPhase === 'g-sweep-windup'
            || gPhase === 'g-jump-windup' || gPhase === 'g-dash-windup' || gPhase === 'g-bolt-windup'
            || gPhase === 'g-bite-windup' || gPhase === 'g-slam-windup' || gPhase === 'g-glide-windup'
            || gPhase === 'g-dive-windup' || gPhase === 'g-quad-windup' || gPhase === 'g-quad-breath-windup'
            || gPhase === 'g-nova-windup' || gPhase === 'g-wing-windup' || gPhase === 'g-sweepbeam-windup'
            || gPhase === 'g-talon-windup' || gPhase === 'g-boon-windup' || gPhase === 'g-reach-windup'
            || gPhase === 'g-tailslam-windup'
            || gPhase === 'g-nihil-chant1' || gPhase === 'g-nihil-chant2' || gPhase === 'g-nihil-chant3';
          if (isGiantWindupNow && giantWindupSfxRef.current !== gPhase) {
            playSfx('hunter-alert');
            // v0.25.3141(社長支給素材): 虚無の三唱(お墓技)だけ、専用SE(壊れたラジオ)を**下に敷く**。
            // ★1唱目だけで鳴らす(chant2/3では鳴らさない)——15.7秒の曲なので、詠唱ごとに鳴らすと
            //   3本重なって濁る。「どん!どん!どん!」(hunter-alert+画面揺れ+3段階の絵)は上の1行と
            //   既存の演出のままなので、社長指示「いまのどん!どん!どん!は残したい」を崩さない。
            // 尺の始末(技3.8秒 < 曲15.7秒)は audioManager 側の maxDurationMs/fadeOutMs が持つ
            // =B案「曲のまま鳴らして技が終わったらフェードアウト」。
            // 尺(GLEN_NIHIL_SE_MS)は**技の定数から導出**して渡す。audioManager側に直書きすると
            // 詠唱の長さを変えた時に「技はまだ続いているのにSEだけ先に消える」(v0.25.3143)。
            if (gPhase === 'g-nihil-chant1') playSfx('glen-nihil', 1, GLEN_NIHIL_SE_MS);
          }
          giantWindupSfxRef.current = isGiantWindupNow ? gPhase : undefined;
        }

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

        // BOT_AND_GHOST.md G2: ゴースト助っ人の移動/攻撃(召喚中のみ・毎フレーム。召喚は?ghost=1
        // またはスキル「守護霊」=G3)。
        // 召喚/解散/ボスHP倍率はdirectorTick.tsのrunGhostAndTraitsStepが担当し、ここは
        // 「もう場に居るゴースト1体」の意思決定(ghostDriver.ts)を実行に移すだけ。
        {
          const ghostNow = useGameStore.getState().summons.find(s => s.kind === 'ghost-ally');
          if (ghostNow) {
            if (ghostNow.ghostArrivalStartedAt !== undefined) {
              const pose = ghostArrivalPoint(
                ghostNow.ghostArrivalFromX ?? ghostNow.x,
                ghostNow.ghostArrivalFromY ?? ghostNow.y,
                ghostNow.ghostArrivalToX ?? ghostNow.x,
                ghostNow.ghostArrivalToY ?? ghostNow.y,
                newGameTime - ghostNow.ghostArrivalStartedAt,
                RESCUE_ALLY_FLYIN_MS,
              );
              useGameStore.setState(st => ({
                summons: st.summons.map(s => s.id === ghostNow.id ? {
                  ...s,
                  x: pose.x,
                  y: pose.y,
                  ...(pose.done ? {
                    ghostArrivalStartedAt: undefined,
                    ghostArrivalFromX: undefined,
                    ghostArrivalFromY: undefined,
                    ghostArrivalToX: undefined,
                    ghostArrivalToY: undefined,
                  } : {}),
                } : s),
              }));
            } else if (ghostNow.ghostDepartureStartedAt !== undefined) {
              const pose = ghostDeparturePoint(
                ghostNow.ghostDepartureFromX ?? ghostNow.x,
                ghostNow.ghostDepartureFromY ?? ghostNow.y,
                ghostNow.ghostDepartureToX ?? ghostNow.x,
                ghostNow.ghostDepartureToY ?? ghostNow.y,
                newGameTime - ghostNow.ghostDepartureStartedAt,
                RESCUE_ALLY_CROUCH_MS,
                RESCUE_ALLY_FLYOUT_MS,
                RESCUE_ALLY_HOP_PX,
              );
              if (pose.done) {
                useGameStore.setState(st => ({ summons: st.summons.filter(s => s.id !== ghostNow.id) }));
                ghostProfileRef.current = null;
              } else {
                useGameStore.setState(st => ({
                  summons: st.summons.map(s => s.id === ghostNow.id ? { ...s, x: pose.x, y: pose.y } : s),
                }));
              }
            } else {
            // 被弾音(社長裁定v0.25.2480=v0.25.2479★未決2解消。G4bの掟「被弾音は付けない」
            // (v0.25.2459)は本裁定で上書き): 全被弾経路(ボス技/敵弾/汎用接触)は damageSummon の
            // lastHit 打刻に合流するので、そのエッジ検知1箇所で player-damage SE を距離減衰付きで
            // 1回鳴らす(経路ごとの配線をしない)。実ダメージは i-frame(INVULN_MS)で間引かれるが、
            // 二重保険で最短 GHOST_HURT_SFX_MIN_GAP_MS も空ける。判定/ダメージ/挙動は不変(音のみ)。
            {
              const hs = ghostHurtSfxRef.current;
              const gLastHit = ghostNow.lastHit ?? 0;
              if (hs.id !== ghostNow.id) {
                hs.id = ghostNow.id; hs.seen = gLastHit; // 召喚直後の初期値を「既知」にして誤発火しない
              } else if (gLastHit > hs.seen) {
                hs.seen = gLastHit;
                const rtNow = Date.now();
                if (rtNow - hs.playedAt >= GHOST_HURT_SFX_MIN_GAP_MS) {
                  const hsState = useGameStore.getState();
                  const hGain = npcSfxDistGain(
                    ghostNow.x + ghostNow.width / 2, ghostNow.y + ghostNow.height / 2,
                    hsState.player.x + hsState.player.width / 2, hsState.player.y + hsState.player.height / 2,
                    hsState.camera, hsState.gameBounds,
                  );
                  if (hGain > 0) { playSfx('player-damage', hGain); hs.playedAt = rtNow; }
                }
              }
            }
            const gsPlayer = useGameStore.getState().player;
            const leash = ghostLeashWarp(ghostNow, gsPlayer);
            if (leash) {
              // 追従リーシュ: プレイヤーから離れすぎたら瞬時にワープ(霊体なので許される・演出は後回し)。
              useGameStore.setState(st => ({
                summons: st.summons.map(s => s.id === ghostNow.id ? { ...s, x: leash.x, y: leash.y } : s),
              }));
            } else {
              const boundBoss = useGameStore.getState().enemies.find(e => e.id === ghostNow.ghostBossId);
              // v0.25.2514(§2.11 裁定1「計測時のステータス・ビルドをそのまま」): 武器は**スナップショットの
              // ロードアウト**(旧: 召喚時のプレイヤーの現在装備を借用=廃止)。ビルドが無い旧プロファイルの
              // 時だけ従来のフォールバック(今の装備)になる=resolveGhostBuild側で解決。
              const ghostBuild = ghostBuildFor(ghostNow, gsPlayer);
              const nowMs = Date.now();
              let ghostWeapons = ghostNow.ghostWeapons ?? ghostBuild?.player.weapons ?? [];
              let gun = ghostBuild?.gun
                ? ghostWeapons.find(w => w.id === ghostBuild.gun?.id) ?? ghostBuild.gun
                : undefined;
              const meleeWeapon = ghostBuild?.melee;
              // v0.25.2830: Weapon[]/reloadEndsAt/reloadingWeaponIdもプレイヤーと同じ型・共通純関数で進める。
              // リザーブだけは従来の除外4(霊体の弾薬非消費)をInfinityで表現し、空マガジンは同じ容量・
              // 同じリロード時間で満タンへ戻る。これでラストマガジン/ゴーストシューターも同じ残弾を読む。
              const ghostOwnerWithWeaponState = (): Player => ghostBuild ? {
                ...ghostActorPlayer(ghostBuild, ghostNow),
                weapons: ghostWeapons,
                activeWeaponId: gun?.id ?? ghostBuild.player.activeWeaponId,
                reloadEndsAt: ghostNow.ghostReloadEndsAt ?? 0,
                reloadingWeaponId: ghostNow.ghostReloadingWeaponId ?? '',
                quickMagCritUntil: ghostNow.ghostQuickMagCritUntil ?? 0,
              } : gsPlayer;
              let ghostOwner = ghostOwnerWithWeaponState();
              let ghostReloadEndsAt = ghostOwner.reloadEndsAt;
              let ghostReloadingWeaponId = ghostOwner.reloadingWeaponId;
              let reloadStarted = false;
              if (gun) {
                const finished = finishWeaponReload(gun, ghostOwner, Number.POSITIVE_INFINITY, nowMs);
                if (finished) {
                  gun = finished.weapon;
                  ghostWeapons = ghostWeapons.map(w => w.id === gun?.id ? finished.weapon : w);
                  ghostReloadEndsAt = finished.reloadEndsAt;
                  ghostReloadingWeaponId = finished.reloadingWeaponId;
                  ghostOwner = { ...ghostOwner, weapons: ghostWeapons, reloadEndsAt: 0, reloadingWeaponId: '' };
                }
                if ((gun.magazine ?? 0) <= 0 && !ghostReloadingWeaponId) {
                  const started = beginWeaponReload(gun, ghostOwner, Number.POSITIVE_INFINITY, nowMs);
                  if (started) {
                    ghostReloadEndsAt = started.reloadEndsAt;
                    ghostReloadingWeaponId = started.reloadingWeaponId;
                    ghostOwner = { ...ghostOwner, ...started };
                    reloadStarted = true;
                  }
                }
              }
              // v0.25.2518(GHOST-KATANA-WIRE・裁定2 / 台帳§5): ビルド(計測時のsubWeapons)に katana または
              // murasame があれば、守護霊は**プレイヤーと同じ刀モード**で戦う。プレイヤーの刀モードは
              // 「銃の自動射撃とナイフ振りを封印し、オート斬撃(600ms)+一閃(フリック)で戦う」形なので、
              // その形をそのまま写す(判定・定数・式は共有関数側=ここに刀の数値は1つも書かない)。
              const ghostKatana = isKatanaMode(ghostOwner);
              const profile: GhostProfile = ghostProfileRef.current ?? defaultGhostProfile();
              // GHOST-SUBS-FINAL(v0.25.2563): 自分が投げたクイックマガジン(=自分の設置物。世界の
              // ドロップではないので§2.11追補3に抵触しない)。着地済みの物だけを回収目標にする。
              const ownMag = useGameStore.getState().pickups.find(p =>
                p.type === 'quick-magazine' && p.ownerGhostId === ghostNow.id
                && !(p.throwStartAt !== undefined && p.throwDuration !== undefined
                  && nowMs - p.throwStartAt < p.throwDuration));
              const ghostRetrieveTarget = ownMag ? { x: ownMag.x + 8, y: ownMag.y + 8 } : undefined;
              // G4b(§2.9(4)): 技への反応ロールの持ち越し(Summonのフラット3フィールド⇔GhostMoveRoll)。
              const prevMoveRoll: GhostMoveRoll | undefined =
                ghostNow.ghostMoveRollKey !== undefined && ghostNow.ghostMoveRollDecision !== undefined
                  ? { moveKey: ghostNow.ghostMoveRollKey, decision: ghostNow.ghostMoveRollDecision, rolledAtMs: ghostNow.ghostMoveRollAt ?? 0 }
                  : undefined;
              const decision = decideGhost({
                ghost: {
                  x: ghostNow.x, y: ghostNow.y, width: ghostNow.width, height: ghostNow.height,
                  maxHealth: ghostNow.maxHealth, // v0.25.2547: 接触脅威判定(危険な体当たりから離れる)用
                  facing: ghostNow.ghostFacing ?? 1,
                  lastShotAt: ghostNow.ghostLastShotAt ?? 0,
                  lastMeleeAt: ghostNow.ghostLastMeleeAt ?? 0,
                  counterPendingAt: ghostNow.ghostCounterPendingAt,
                  counterWillAttempt: ghostNow.ghostCounterWillAttempt,
                  // GHOST-COUNTER-PARITY: カウンター試行だけの周期(820ms)の起点を持ち越す。
                  lastCounterAttemptAt: ghostNow.ghostLastCounterAttemptAt,
                  moveRoll: prevMoveRoll,
                  // §2.12(1) 反応遅延 + GHOST-BULLET-TECH A: 危険エピソード(認知時刻+最後に見えた時刻)の
                  // 持ち越し(記憶が切れたらdecideGhostがundefinedを返す)。
                  dangerSeenAt: ghostNow.ghostDangerSeenAt,
                  dangerLastAt: ghostNow.ghostDangerLastAt,
                  orbitSign: ghostNow.ghostOrbitSign, // §2.12追補: オービット旋回方向の持ち越し
                  // GHOST-BULLET-TECH B: 「苦手」と出た弾技の弾を避けない期限の持ち越し。
                  tankedBulletKey: ghostNow.ghostTankedBulletKey,
                  tankedBulletUntil: ghostNow.ghostTankedBulletUntil,
                  // GHOST-CMD-2A(§2.18追補 隙コマンド): 自分のカウンター成立時刻(afterCounter文脈の
                  // 錨点)と、進行中の窓の文脈/モードの持ち越し。
                  lastCounterAtMs: ghostNow.ghostLastCounterAt,
                  punishContext: ghostNow.ghostPunishContext,
                  punishMode: ghostNow.ghostPunishMode,
                },
                player: { x: gsPlayer.x, y: gsPlayer.y, width: gsPlayer.width, height: gsPlayer.height },
                // v0.25.2470(社長裁定「雑魚は基本的に避けつつボスと戦う」): 全敵を渡す(雑魚回避の
                // 反発ベクトル用)。狙いは boundBossId でボスに束縛されたまま=雑魚には流れない。
                enemies: useGameStore.getState().enemies,
                boundBossId: ghostNow.ghostBossId, // v0.25.2469: ボス束縛を純関数側でも明示

                projectiles: useGameStore.getState().projectiles,
                // GHOST-SUBS-FINAL(v0.25.2563・裁定「クイマガ回収の割り込み=許容」): 自分が投げた
                // マガジンが場に残っていれば、それを拾いに行く(間合い管理より優先・危険回避には譲る)。
                // 飛翔中(着地前)は目標にしない=着地点で待たずに落ちる場所へ歩き出す形にする。
                retrieveTarget: ghostRetrieveTarget,
                // v0.25.2564(ボス体当たり対策): 近接/カウンター射程の物差し=プレイヤーと同じ
                // enemyMeleeDist(当たり判定帯のAABB最近点)を注入。巨体ボスの体内に立たなくても
                // 縁から74pxで近接/カウンターが成立する(旧: 中心間距離=パリティ写し損ね)。
                meleeDist: enemyMeleeDist,
                profile,
                weapon: {
                  gunDamage: gun?.damage ?? 0,
                  gunIntervalMs: gun ? effectiveFireCooldown(gun, ghostOwner) : 500,
                  // 刀モードは銃を撃たない(プレイヤーと同じ封印)ので射程0=意思決定側でも銃を選ばせない。
                  // v0.25.3170: 射程のズーム補正もプレイヤーと同じ1本(zoomedGunRange)を通す
                  // =引いている間だけ守護霊の射程だけが取り残される、を作らない(パリティ)。
                  gunRangePx: gun && !ghostKatana && !ghostReloadingWeaponId && (gun.magazine ?? 0) > 0
                    ? zoomedGunRange(RANGE_BY_CATEGORY[gun.category ?? 'handgun']) : 0,
                  meleeDamage: meleeWeapon?.damage ?? 6,
                },
                gameTime, nowMs,
              });

              // v0.25.2514(監査項目7): 被弾ノックバック中は自分の移動を止める(プレイヤーがKB中に入力を
              // 無視されるのと同じ。実際の弾かれ移動は updateSummons が減衰しながら消化する)。
              const kbLocked = nowMs < (ghostNow.knockbackUntil ?? 0);
              const step = kbLocked ? 0 : ghostNow.speed * deltaTime;
              // v0.25.2518(裁定2): 刀の一閃/ワイヤーのロコモーション上書きを**プレイヤーと同じ純関数**で
              // ゴースト実体のx/yへ乗せる。優先順(ワイヤー高速移動>ホップ>一閃>着地硬直)も
              // movePlayer と同一。被弾ノックバック中はプレイヤー同様KBが勝つ(kbLocked)。
              const gDashState = dashStateOf(ghostNow.ghostDash);
              const gDashMode = kbLocked ? null : dashModeAt(gDashState, nowMs);
              let nx: number;
              let ny: number;
              if (gDashMode !== null) {
                const gStep = dashStep(
                  dashOverride(
                    gDashState, gDashMode,
                    ghostNow.x + ghostNow.width / 2, ghostNow.y + ghostNow.height / 2,
                    KATANA_DASH_SPEED,
                  ),
                  deltaTime,
                );
                nx = ghostNow.x + gStep.dx;
                ny = ghostNow.y + gStep.dy;
              } else {
                nx = ghostNow.x + decision.moveX * step;
                ny = ghostNow.y + decision.moveY * step;
              }
              // v0.25.2469(社長指示): 霊体はオブジェクト(木・岩等)をすり抜ける。詰まって置き去りに
              // なる事故を根絶(リーシュワープ=瞬間追いつきの世界観とも整合)。判定はゴースト移動のみ=
              // 敵・プレイヤー・弾の衝突は不変。
              // v0.25.2589(社長報告「サークル系ボスと戦ってる時、守護霊はサークル無視して外で戦ってる。
              // さらに、そのままどっかいっちゃった」): **囲い(アリーナ)の拘束は守護霊にも掛ける**。
              // §2.11追補「守護霊は独立した2人目のプレイヤー」= プレイヤーが閉じ込められる円には
              // 守護霊も閉じ込められる。判定はプレイヤーと**同じ純関数**(clampRectInsideCircle)・同じ
              // 除外条件(rescue / confinesPlayer=false は拘束しない)。円外へ出る→リーシュ距離を超えて
              // ワープで戻る、の往復が「どっか行った」の正体でもある。
              const resolved = { x: nx, y: ny };
              {
                const ae = useGameStore.getState().activeEvent;
                if (ae && ae.kind !== 'rescue' && ae.confinesPlayer !== false) {
                  const c = clampRectInsideCircle(
                    { x: resolved.x, y: resolved.y, width: ghostNow.width, height: ghostNow.height },
                    { x: ae.x, y: ae.y, radius: ae.radius },
                  );
                  resolved.x = c.x; resolved.y = c.y;
                }
              }

              // G2.6(BOT_AND_GHOST.md §2.8): サブウェポン使用の予約。「CDが明けていて交戦中なら使う」の
              // 単純判断=交戦中(紐付いたボスが生きている)かつ頻度ノブ(subUsesPerMin)の間隔が空いたら
              // 「次のサブ発動1回」を予約する。実際の発動はサブ入口(自動発動ブロック)が次フレーム以降、
              // CDが明けた瞬間にオーナー=ゴーストで解決して予約を下ろす(CD・資源は共有=「1つの財布」)。
              const wantSubClaim = !!boundBoss && !ghostNow.ghostSubClaim &&
                shouldGhostClaimSub(ghostNow.ghostLastSubUseAt ?? 0, nowMs, profile.subUsesPerMin);

              useGameStore.setState(st => ({
                summons: st.summons.map(s => s.id === ghostNow.id ? {
                  ...s, x: resolved.x, y: resolved.y, ghostFacing: decision.facing,
                  ghostLastShotAt: decision.lastShotAt, ghostLastMeleeAt: decision.lastMeleeAt,
                  ghostWeapons,
                  ghostReloadEndsAt,
                  ghostReloadingWeaponId,
                  ghostCounterPendingAt: decision.counterPendingAt, ghostCounterWillAttempt: decision.counterWillAttempt,
                  // GHOST-COUNTER-PARITY: カウンター試行専用CDの起点を持ち越す(通常近接CDとは別枠)。
                  ghostLastCounterAttemptAt: decision.lastCounterAttemptAt,
                  // G4b: 技への反応ロールを持ち越す(技の解決=decideGhostがundefinedを返したらクリア)。
                  ghostMoveRollKey: decision.moveRoll?.moveKey,
                  ghostMoveRollDecision: decision.moveRoll?.decision,
                  ghostMoveRollAt: decision.moveRoll?.rolledAtMs,
                  ghostDangerSeenAt: decision.dangerSeenAt, // §2.12(1): 反応遅延の起点(記憶が切れたらundefined)
                  ghostDangerLastAt: decision.dangerLastAt, // GHOST-BULLET-TECH A: 記憶の失効起点
                  ghostOrbitSign: decision.orbitSign,       // §2.12追補: オービット旋回方向の持ち越し
                  ghostTankedBulletKey: decision.tankedBulletKey,     // GHOST-BULLET-TECH B: 避けない弾技
                  ghostTankedBulletUntil: decision.tankedBulletUntil,
                  // GHOST-CMD-2A: 隙の文脈/モードの持ち越し(窓が閉じたら両方undefined=通常へ戻る)。
                  ghostPunishContext: decision.punishContext,
                  ghostPunishMode: decision.punishMode,
                  // GHOST-SUBS-FINAL(v0.25.2563): 「移動中のみ」で動くサブ(火炎瓶/援護射撃)の主語判定。
                  // プレイヤーの isMoving と同じしきい値(最大速の15%超)。一閃/ワイヤーの高速移動中も移動扱い。
                  ghostIsMoving: gDashMode !== null
                    ? true
                    : !kbLocked && ghostIsMovingNow(decision.moveX, decision.moveY),
                  ...(wantSubClaim ? { ghostSubClaim: true } : {}),
                } : s),
              }));

              // GHOST-SUBS-FINAL: 自分が投げたクイックマガジンの回収(**自分の設置物だけ**。世界の
              // ドロップには触れない=§2.11追補3)。拾得判定はプレイヤーと同じ純関数
              // (checkPlayerPickupCollisions)へ、対象を自分のマガジン1個に絞って通す。
              // 効果=プレイヤーと同じ「即時装填+リロード解除+装填できた時だけクリ窓5秒」。
              if (ownMag) {
                const magBody = { ...ghostOwner, x: resolved.x, y: resolved.y, width: ghostNow.width, height: ghostNow.height };
                if (checkPlayerPickupCollisions(magBody, [ownMag]).length > 0) {
                  const filled = gun ? refillWeaponMagazine(gun, ghostOwner, Number.POSITIVE_INFINITY) : null;
                  if (filled && gun) {
                    gun = filled.weapon;
                    ghostWeapons = ghostWeapons.map(w => w.id === gun?.id ? filled.weapon : w);
                  }
                  ghostReloadEndsAt = 0;
                  ghostReloadingWeaponId = '';
                  ghostOwner = {
                    ...ghostOwner,
                    weapons: ghostWeapons,
                    reloadEndsAt: 0,
                    reloadingWeaponId: '',
                    ...(filled && filled.moved > 0 ? { quickMagCritUntil: gameTime + QUICK_MAG_CRIT_WINDOW_MS } : {}),
                  };
                  useGameStore.setState(st => ({
                    pickups: st.pickups.filter(p => p.id !== ownMag.id),
                    summons: st.summons.map(s => s.id === ghostNow.id
                      ? {
                          ...s,
                          ghostWeapons,
                          ghostReloadEndsAt: 0,
                          ghostReloadingWeaponId: '',
                          ...(filled && filled.moved > 0
                            ? { ghostQuickMagCritUntil: st.gameTime + QUICK_MAG_CRIT_WINDOW_MS }
                            : {}),
                        }
                      : s),
                  }));
                  const magCx = resolved.x + ghostNow.width / 2, magCy = resolved.y + ghostNow.height / 2;
                  spawnBurst(ownMag.x + 8, ownMag.y + 8, '#9fd8ff', 10);
                  spawnRing(ownMag.x + 8, ownMag.y + 8, 3, 22, 'rgba(159,216,255,0.76)', 2, 260);
                  const magGain = npcSfxDistGain(
                    magCx, magCy, gsPlayer.x + gsPlayer.width / 2, gsPlayer.y + gsPlayer.height / 2,
                    useGameStore.getState().camera, useGameStore.getState().gameBounds,
                  );
                  if (magGain > 0) playSfx('reload', magGain, 800); // プレイヤーの回収と同じ音(800msで切る)
                }
              }

              // ゴースト起因SEの距離減衰(社長指示: escortの前例=npcSfxDistGainを流用。遠いゴーストの
              // 音は小さく・画面外は無音。プレイヤー自身の攻撃音は従来どおり等倍で、この係数は使わない)。
              const gfxPcx = gsPlayer.x + gsPlayer.width / 2, gfxPcy = gsPlayer.y + gsPlayer.height / 2;
              const gfxCam = useGameStore.getState().camera, gfxGb = useGameStore.getState().gameBounds;
              if (reloadStarted && gun && ghostOwner.reloadingWeaponId) {
                const reloadGain = npcSfxDistGain(
                  resolved.x + ghostNow.width / 2, resolved.y + ghostNow.height / 2,
                  gfxPcx, gfxPcy, gfxCam, gfxGb,
                );
                if (reloadGain > 0) playSfx('reload', reloadGain, effectiveReloadMs(gun, ghostOwner));
              }
              // v0.25.2525(GHOST-REFLECT-MELEE-SUBS・発注A/C): ゴーストの近接スイング1回の共通後処理。
              //  ① 弾反射のカウンター窓を開く: プレイヤーのスイングが counterWindowEnd を開くのと
              //     **同じ定数(COUNTER_WINDOW)**で ghostCounterWindowEnd を打つ(反射の判定は
              //     combatTick.applyEnemyProjectileHits のゴースト分岐=プレイヤーと同じ1本)。
              //  ② 近接スイング相乗り型サブ(ドローンブーメラン/フレアガン/ジャンクウェポン)を
              //     プレイヤーと同じ条件・同じ効果で発動(共通ヘルパ=store.fireGhostMeleeSwingSubs)。
              //     SEはゴースト位置で距離減衰(除外4)。刀モード中は subWeaponBlockedByKatana が
              //     プレイヤーと同じく全サブを止めるので、一閃から呼んでも何も出ない(=同じ条件)。
              const onGhostMeleeSwing = (swingX: number, swingY: number): void => {
                useGameStore.setState(st => ({
                  summons: st.summons.map(s => s.id === ghostNow.id
                    ? { ...s, ghostCounterWindowEnd: nowMs + COUNTER_WINDOW }
                    : s),
                }));
                const subs = useGameStore.getState().fireGhostMeleeSwingSubs(ghostNow.id);
                if (subs.boomerang || subs.junk) {
                  const subGain = npcSfxDistGain(swingX, swingY, gfxPcx, gfxPcy, gfxCam, gfxGb);
                  if (subGain > 0) {
                    if (subs.boomerang) playSfx('boomerang-throw', subGain);
                    if (subs.junk) playSfx('shotgun-fire', subGain); // ジャンクウェポン=ショットガン発砲音
                  }
                }
              };
              if (decision.action === 'shoot' && boundBoss && gun && !ghostKatana) {
                // 銃 = **計測時ビルドのアクティブ銃**。マガジン/発射間隔/リロードはプレイヤーと同じ、
                // リザーブ弾だけはプレイヤーと完全分離して非消費(除外4)。
                // GHOST-GUN-PARITY: 飛翔特性(count発/拡散/PROJECTILE_SPEED_MULT/projectileSize/
                // passthrough・pierce)はプレイヤーのfireWeaponと同じ規則(buildGhostGunShots=共通ヘルパ)。
                // v0.25.2514(§2.11訂正): ダメージ倍率(スカベンジャー/アタックシューター/装備火力/
                // ラストマガジン)とクリ率(武器基礎+本体+装備+弁慶+ウォームアップ)も同じ共通ヘルパで
                // **計測時ビルドの疑似Player**から算出する。weaponKey='ghost-gun'固定(計測除外/
                // ヘイト分離)は不変。
                const gcx = resolved.x + ghostNow.width / 2, gcy = resolved.y + ghostNow.height / 2;
                const tcx = boundBoss.x + boundBoss.width / 2, tcy = boundBoss.y + boundBoss.height / 2;
                const gdx = tcx - gcx, gdy = tcy - gcy;
                const gdl = Math.hypot(gdx, gdy) || 1;
                // 裁定4(PHILL): PHILL銃を持っていたら、計測したヘッドショット率でこの1発を確定
                // ヘッドショット(=確定クリ)にする。ゴーストは部位狙いをしないので「率の再現」で写す。
                const ghostHeadshot = gun.key === PHILL_WEAPON_KEY
                  && (ghostBuild?.phillHeadshotRate ?? 0) > 0
                  && Math.random() < (ghostBuild?.phillHeadshotRate ?? 0);
                const ghostShots = buildGhostGunShots(
                  gun, gcx, gcy, { x: gdx / gdl, y: gdy / gdl }, nowMs, `proj-ghost-${ghostNow.id}`,
                  { player: ghostOwner, gameTime, headshot: ghostHeadshot },
                );
                for (const shot of ghostShots) addProjectile(shot);
                const firedGun = weaponAfterGunShot(gun, ghostOwner, nowMs);
                ghostWeapons = ghostWeapons.map(w => w.id === gun?.id ? firedGun : w);
                gun = firedGun;
                useGameStore.setState(st => ({
                  summons: st.summons.map(s => s.id === ghostNow.id ? { ...s, ghostWeapons } : s),
                }));
                // 発砲SE: プレイヤーと同じ銃種別の音(v0.25.2479パリティ。旧: 常にhandgun-fire)を
                // ゴースト位置で距離減衰。種別分岐はプレイヤー自動発砲(SMG/グレネードランチャー特例含む)と同一。
                const gGain = npcSfxDistGain(gcx, gcy, gfxPcx, gfxPcy, gfxCam, gfxGb);
                if (gGain > 0) {
                  playSfx(
                    gun.category === 'shotgun' ? 'shotgun-fire'
                      : gun.category === 'rifle' ? 'rifle-fire'
                        : gun.category === 'glauncher' ? 'grenade-launcher-fire'
                          : (gun.key === SMG_WEAPON_KEY ? 'smg-fire' : 'handgun-fire'),
                    gGain,
                  );
                }
              } else if (decision.action === 'melee' && boundBoss && ghostKatana) {
                // 刀モードの近接=**一閃(triggerKatanaDash)**。距離154px/180ms/×3/着地硬直200ms/
                // 経路判定/斬撃弧/血/ダメージ数字/気絶敵へのフィニッシュ一閃は、すべてプレイヤーと同じ
                // triggerKatanaDash → performKatanaStrike が出す(守護霊用の実装は書かない=裁定2)。
                // 村雨(CD無し連発)も hasMurasame の同じ分岐がそのまま効く。
                const btcx = boundBoss.x + boundBoss.width / 2;
                const bccy = boundBoss.y + boundBoss.height / 2;
                const gmcx = resolved.x + ghostNow.width / 2, gmcy = resolved.y + ghostNow.height / 2;
                // GHOST-COUNTER-PARITY(社長指示3): 「意図しないスイングで請求を積まない」——
                // ghostDriverが実際にカウンター狙いで振ったか(decision.meleeIsCounterAttempt)だけを見る。
                // 旧: isBossCounterableNowApprox(boss状態)を独立に再計算していたため、通常近接
                // (meleeBias抽選/punishRush)で振った時もボスが「成立しうる状態」なら真になり、
                // 意図と無関係に請求が積まれていた(実質600ms毎に必ず1回請求が飛ぶ状態)。
                const wasCounterMelee = decision.meleeIsCounterAttempt;
                const katanaState = useGameStore.getState();
                const katanaArena = katanaState.activeEvent && katanaState.activeEvent.kind !== 'rescue'
                  && katanaState.activeEvent.confinesPlayer !== false
                  ? {
                      x: katanaState.activeEvent.x,
                      y: katanaState.activeEvent.y,
                      radius: katanaState.activeEvent.radius,
                    }
                  : undefined;
                // 一閃中は無敵でも着地後に200msの硬直がある。従来は常にボス中心へ突っ込み、巨体の
                // 接触判定内へ着地して硬直中に自爆していた。斬撃が対象へ届く16方向を順に調べ、
                // 実際の敵接触矩形から16px以上離れた着地点だけを採用する。円形アリーナでは移動側と
                // 同じ円内クランプ後の地点で判定し、安全地点が無ければ今回は発動を見送る。
                const safeKatanaDir = pickSafeKatanaDashDirection({
                  startX: gmcx,
                  startY: gmcy,
                  actorWidth: ghostNow.width,
                  actorHeight: ghostNow.height,
                  dashDistance: KATANA_DASH_DISTANCE,
                  hitHalfWidth: KATANA_DASH_HIT_HALF_WIDTH,
                  target: {
                    id: boundBoss.id,
                    centerX: btcx,
                    centerY: bccy,
                    strikeWidth: boundBoss.width,
                  },
                  enemyRects: katanaState.enemies.map(enemy => ({ id: enemy.id, ...enemyContactBox(enemy) })),
                  arena: katanaArena,
                });
                const dashed = safeKatanaDir !== null
                  && katanaState.triggerKatanaDash(safeKatanaDir.x, safeKatanaDir.y, ghostNow.id);
                if (dashed) {
                  // 一閃も「近接スイング」=弾反射の窓を開き、相乗り型サブの入口も通す(v0.25.2525)。
                  onGhostMeleeSwing(gmcx, gmcy);
                  // 発動SEはプレイヤーのフリック(performFlickAction)と同じ 'katana-dash'。距離減衰のみ差分。
                  const kdGain = npcSfxDistGain(gmcx, gmcy, gfxPcx, gfxPcy, gfxCam, gfxGb);
                  if (kdGain > 0) playSfx('katana-dash', kdGain);
                  if (wasCounterMelee) {
                    // カウンター成立の請求は通常近接と同じ扱い(一閃も「近接スイング」なので窓を拾う)。
                    setGhostCounterClaim({
                      bossId: boundBoss.id, ghostX: gmcx, ghostY: gmcy,
                      dmg: ghostCounterDamage(gun?.damage, ghostOwner), atMs: nowMs,
                    });
                  } else if (GHOST_FX_SHAKE_ENABLED) {
                    useGameStore.getState().triggerShake(MELEE_SWING_SHAKE_MS, MELEE_SWING_SHAKE_MAG, btcx - gmcx, bccy - gmcy);
                  }
                }
              } else if (decision.action === 'melee' && boundBoss) {
                // 近接 = **計測時ビルドの近接武器**でスイング。channel=null(escortと同じ「プレイヤー起因
                // ではない」扱い=botTelemetryの近接/銃比率を汚さない)。
                // v0.25.2514(§2.11訂正): ダメージ/クリはプレイヤーの近接スイングと**同じ純関数**を通す
                // (meleeSwingBaseDamage/meleeHitCritChance/skillCritMult/skillOutgoingDamageMult=
                // ストライカー・装備火力・トラップ+10%・弱点+10%・弁慶・ウォームアップ・ナイフマスター・
                // クリティカルD上昇・バーサーカーが計測時ビルドで評価される)。主語は疑似Player(ghostOwner)。
                // クリ成立時のボス側効果(移動半減+CD2倍+紫蓄積=bumpBossCrit)は damageEnemy が中央適用する。
                // 近接コンボ倍率はゴーストが計数を持たないため中立(★未決: ゴースト側のコンボ計数)。
                const btcx = boundBoss.x + boundBoss.width / 2, btcy = boundBoss.y;
                const bccy = boundBoss.y + boundBoss.height / 2;
                const gmcx = resolved.x + ghostNow.width / 2, gmcy = resolved.y + ghostNow.height / 2;
                // v0.25.2525(発注A/C): このスイングで弾反射の窓を開き、相乗り型サブの入口も通す。
                onGhostMeleeSwing(gmcx, gmcy);
                // v0.25.2525(発注B・台帳§3-3): 気絶敵へのフィニッシュ(処刑)。プレイヤーのナイフ
                // スイングと**同じ裁定+同じ素ダメージ式**(applyGhostMeleeFinisher → resolveStunnedMeleeHit)。
                // 成立時はダメージ/金の数字/気絶解除/浮きまで共有アクション側で適用済み(クリ抽選は
                // 走らない=プレイヤーも気絶敵にはクリを振らないのと同じ)。null=気絶していない→従来経路。
                const ghostFinish = useGameStore.getState().applyGhostMeleeFinisher(ghostNow.id, boundBoss.id);
                const ghostMeleeCrit = ghostFinish === null
                  && Math.random() < meleeHitCritChance(meleeWeapon?.critChance ?? 0, ghostOwner, gameTime, boundBoss);
                const dmg = Math.max(1, Math.round(
                  meleeSwingBaseDamage(meleeWeapon, ghostOwner)
                  * (ghostMeleeCrit ? skillCritMult(ghostOwner, CRIT_DAMAGE_MULT) : 1)
                  * skillOutgoingDamageMult(ghostOwner),
                ));
                // このスイングがカウンター試行だったか(**演出の出し分け+請求を積むか、の両方に使用**)。
                // GHOST-COUNTER-PARITY(社長指示3): ボス状態の近似を独立に再計算するのをやめ、
                // ghostDriverが実際にカウンター狙いで振ったかどうか(decision.meleeIsCounterAttempt)を
                // そのまま見る。旧実装は「射程内かつボスが成立しうる状態」なら通常近接(meleeBias抽選)の
                // 振りにも真になっていたため、狙っていないスイングでも請求が積まれていた。
                const wasCounterMelee = decision.meleeIsCounterAttempt;
                // BOT_AND_GHOST.md §2.8 G2.5: ヘイト計測用にゴースト起因と明示する(damageChannelは
                // 従来どおりnull=botTelemetryのプレイヤー計測は汚さない・独立したパラメータ)。
                // フィニッシュ成立時はダメージ/数字を共有アクションが既に出しているので二重に出さない。
                const ghostMeleeKilled = ghostFinish
                  ? ghostFinish.killed
                  : damageEnemy(boundBoss.id, dmg, false, ghostMeleeCrit, false, null, 'ghost');
                if (!ghostFinish) spawnDamageNumber(btcx, btcy, dmg, ghostMeleeCrit);
                spawnBurst(btcx, bccy, (ghostMeleeCrit || ghostFinish !== null) ? '#fde047' : '#9fd8ff', 6);
                // v0.25.2479(プレイヤー近接ヒットとのパリティ=triggerCounterのslashAt処理と同型):
                // スラッシュ+近接の血飛沫。血はspawnMeleeBloodと同じ幾何を「ゴーストへ向かって」計算する
                // (spawnMeleeBloodは向き先がプレイヤー固定のため、同じ規則でspawnBloodを直接呼ぶ)。
                useGameStore.getState().spawnSlash(btcx, bccy);
                {
                  const bdx = gmcx - btcx, bdy = gmcy - bccy;
                  const bdl = Math.hypot(bdx, bdy) || 1;
                  const bux = bdx / bdl, buy = bdy / bdl;
                  useGameStore.getState().spawnBlood(
                    btcx + bux * boundBoss.width * 0.4, bccy + buy * boundBoss.width * 0.4,
                    Math.atan2(buy, bux), Math.max(96, boundBoss.width * 4.0),
                  );
                }
                // SE(escort前例の距離減衰): 振り音=ゴースト位置 / 被撃音=着弾(ボス)位置。
                // フィニッシュ成立時の被撃音は 'melee-finish'(ゴーストの刀フィニッシュと同じ流儀)。
                const swingGain = npcSfxDistGain(gmcx, gmcy, gfxPcx, gfxPcy, gfxCam, gfxGb);
                const meleeHitGain = npcSfxDistGain(btcx, bccy, gfxPcx, gfxPcy, gfxCam, gfxGb);
                if (swingGain > 0) playSfx('melee', swingGain);
                if (meleeHitGain > 0) playSfx(ghostFinish ? 'melee-finish' : 'slash-damage', meleeHitGain);
                if (wasCounterMelee) {
                  // v0.25.2480(社長裁定「1」=v0.25.2479★未決1解消): カウンター成立の効果は
                  // per-bossハンドラへ合流して本物化(パリィ=技の中断/反応遷移+確定クリ=bumpBossCrit)。
                  // ここでは請求(claim)を積むだけ。成立演出(青Counter!+金クリ層+counter/headshot SEの
                  // 距離減衰)もハンドラ側=成立が確定した時だけ出す(不成立の空振りに嘘のCounter!を
                  // 出さない=CLAUDE.md「判定を持つ絵は判定に揃える」)。通常近接ぶんのダメージ/斬撃/血/SEは
                  // 上の共通部で既に出ている=プレイヤーの「スイング(近接ダメージ)+成立(クリ反撃)」の
                  // 二段構造と同じ。ダメージ式はプレイヤーのカウンター反撃と**同じ純関数**
                  // (counterReplyDamage)で、基準銃=計測時ビルドのアクティブ銃・倍率=疑似Playerで評価
                  // (v0.25.2514で「スキル倍率なし=v0.25.2459方針」を撤去=§2.11訂正)。消費側: thor/裏3=
                  // hidden-bossブロック、idol=idolブロック、天使6=angelBossTick、城ボス系(giantbat)=
                  // combatTick.applyGhostBossParry。
                  setGhostCounterClaim({
                    bossId: boundBoss.id, ghostX: gmcx, ghostY: gmcy,
                    dmg: ghostCounterDamage(gun?.damage, ghostOwner), atMs: nowMs,
                  });
                } else if (GHOST_FX_SHAKE_ENABLED) {
                  // 通常ヒットのスイング揺れ(プレイヤーのtriggerCounter末尾と同型・方向=ゴースト→ボス)。
                  useGameStore.getState().triggerShake(MELEE_SWING_SHAKE_MS, MELEE_SWING_SHAKE_MAG, btcx - gmcx, bccy - gmcy);
                }
                // キラー側のキル音(プレイヤーの近接/弾キルと同じ流儀=inputActions/弾ヒット共通ブロックと同型)。
                // 敵側の死亡演出(血バースト/ボス死亡シーケンス/ドロップ)は既存経路が出す=ここでは重ねない。
                if (ghostMeleeKilled) playEnemyDeath();
              }

              // v0.25.2518(裁定2・台帳§5-2): 刀のオート斬撃。プレイヤーの自動斬撃と**同じ間隔
              // (KATANA_SLASH_INTERVAL_MS)・同じ標的選択(pickKatanaSlashTarget)・同じ判定/ダメージ
              // (performKatanaStrike)** を通す。ghostDriverの意思決定とは独立に回る(プレイヤー側も
              // 入力とは独立に回っているのと同型)。
              if (ghostKatana) {
                const gks = ghostKatanaSlashRef.current;
                // 別のゴーストに変わった/新しいラン(gameTime巻き戻り)ならレジスタを初期化。
                if (gks.id !== ghostNow.id || gameTime < gks.at) { gks.id = ghostNow.id; gks.at = 0; }
                if (gameTime - gks.at >= KATANA_SLASH_INTERVAL_MS) {
                  const kcx = resolved.x + ghostNow.width / 2, kcy = resolved.y + ghostNow.height / 2;
                  const kTargetId = pickKatanaSlashTarget(
                    kcx, kcy, katanaRange(ghostOwner),
                    useGameStore.getState().enemies, gameTime, enemyMeleeDist,
                  );
                  if (kTargetId) {
                    gks.at = gameTime;
                    // 近接フィニッシュは一閃のみ: オート斬撃はallowFinisher=false(プレイヤーと同じ)。
                    const kResult = useGameStore.getState().performKatanaStrike([kTargetId], 1, false, ghostNow.id);
                    const kGain = npcSfxDistGain(kcx, kcy, gfxPcx, gfxPcy, gfxCam, gfxGb);
                    if (kGain > 0) {
                      if (kResult.finish) playSfx('melee-finish', kGain);
                      else if (kResult.hit) playSfx('slash-damage', kGain);
                    }
                    if (kResult.killed > 0) playEnemyDeath();
                  }
                }
              }

              // v0.25.2518(裁定2・台帳§9-3): ワイヤーアンカー。発動の意思決定は既存のサブ予約
              // (ghostSubClaim=「CDが明けたら使う」)をそのまま使い、狙いは紐付きボス。
              // 刺し→スラム/プラント→高速移動→着地→ホップの一連は、プレイヤーと同じ状態機械
              // (triggerWireAnchor / startWireDash / runWireAnchorTick / startWireHop)が担う。
              // 上位のサブ発動入口(6種)が先に予約を消費するので、二重発動にはならない。
              if (ghostNow.ghostSubClaim && boundBoss && ghostOwner.subWeapons.includes('wire-anchor')) {
                const wcx = resolved.x + ghostNow.width / 2, wcy = resolved.y + ghostNow.height / 2;
                const wtx = boundBoss.x + boundBoss.width / 2 - wcx;
                const wty = boundBoss.y + boundBoss.height / 2 - wcy;
                if (useGameStore.getState().triggerWireAnchor(wtx, wty, ghostNow.id)) {
                  // 予約を下ろす(サブ入口の consumeGhostSubClaim と同じ形)。
                  useGameStore.setState(st => ({
                    summons: st.summons.map(s => s.id === ghostNow.id
                      ? { ...s, ghostSubClaim: false, ghostLastSubUseAt: nowMs }
                      : s),
                  }));
                }
              }
            }
            }
          }
        }

        // 火炎瓶(molotov): 設置済みの地面の火の寿命切れ回収 + 敵への接触DoTを毎フレーム更新
        // (設置自体は上の molotov ブロックが行う。ここは置いた後の面倒を見るだけ)。
        useGameStore.getState().tickGroundFires();
        // SKILL_BUILD_REDESIGN.md §28(B7): 延焼弾の燃焼DoT/血の履帯の棘/グラビティショットの
        // 爆縮吸引も同じ毎フレーム更新(設置・付与は各スキルの発火点=命中/キル/移動軌跡が行う。
        // ここは寿命切れ回収+ダメージ/吸引の消化のみ)。
        useGameStore.getState().tickBurningEnemies();
        useGameStore.getState().tickBloodSpikes();
        useGameStore.getState().tickGravityWells();

        // ジブリルのランタン火(紫の単発火): M26 Step3で angelBossTick.ts へ移設(挙動不変・ヘッドレス共用)。
        tickAngelBossFires(newGameTime, triggerPlayerDeath);
        // §6.28-19(バッチM63): アクラシエルの結晶の槍(設置→2秒後に一度だけ起爆)。
        tickAcrasielSpears(newGameTime, triggerPlayerDeath, ANGEL_SFX);

        // 二人組(クエストNPC)の滞在受領/納品(EVENT_QUEST_DESIGN.md・社長裁定v0.25.1686)。
        // サークル内3秒(EVENT_QUEST_DWELL_MS)=拠点解放と同じ進捗メーター(pixiSceneがdwellMsを描く)。
        //  ・available: 3秒で受領。強制(未納品・stage-1)→ネームド出現(acceptEventQuest内)、
        //    それ以外→サブ受注。台詞は種別で出し分け(★仮テキスト=会話は後で社長が詰める)。
        //  ・accepted: 目標達成(eventQuestKills>=Goal)後のみ、一度サークルを出てから再滞在3秒で納品=報酬。
        //  ・leftSinceAccept: 直前のやり取り以降に一度外へ出るまでメーターを進めない(即発火防止)。
        //  ・completed/gone: 何も起きない(二人は立ち姿のまま/次run以降は不出現)。
        if (!indoor && !labTheme) {
          const q = useGameStore.getState().eventQuestNpc;
          if (q.status === 'available' || q.status === 'accepted') {
            const qpcx = player.x + player.width / 2, qpcy = player.y + player.height / 2;
            const qdx = q.x - qpcx, qdy = q.y - qpcy;
            const inside = qdx * qdx + qdy * qdy <= q.radius * q.radius;
            if (!inside) {
              // サークル外: 「また来た」扱いに武装。滞在はリセット。
              if (!q.leftSinceAccept || q.dwellMs !== 0) {
                useGameStore.setState(s2 => ({ eventQuestNpc: { ...s2.eventQuestNpc, leftSinceAccept: true, dwellMs: 0 } }));
              }
            } else if (q.leftSinceAccept) {
              const qsNow = useGameStore.getState();
              const turnInReady = q.status === 'accepted' && qsNow.eventQuestKills >= qsNow.eventQuestGoalCount;
              if (q.status === 'available' || turnInReady) {
                const nd = q.dwellMs + deltaTime * 1000;
                const qStageId = getSelectedStageId();
                if (nd < EVENT_QUEST_DWELL_MS) {
                  useGameStore.setState(s2 => ({ eventQuestNpc: { ...s2.eventQuestNpc, dwellMs: nd } }));
                } else if (q.status === 'available') {
                  // M5(統合正本4.5)= 遭遇のみ: 確定会話を流して完了(受注・報酬なし)。
                  if (getEventQuestConfig(qStageId)?.encounterOnly) {
                    useGameStore.getState().completeEventEncounter();
                    useGameStore.getState().enqueueNpcDialogue(EVENT_QUEST_ENCOUNTER_LINES);
                    spawnRing(q.x, q.y - 22, 12, 62, 'rgba(96,165,250,0.82)', 3, 520);
                    useGameStore.getState().spawnGlow(q.x, q.y - 30, GLOW_R_M, 'rgba(96,165,250,', 520);
                    playSfx('event-start');
                  } else {
                    useGameStore.getState().acceptEventQuest();
                    const accepted = useGameStore.getState();
                    if (accepted.eventQuestNpc.status === 'accepted') {
                      // 会話=統合正本の確定稿(強制=M1初遭遇 / サブ=ステージ別の受注会話)。
                      accepted.enqueueNpcDialogue(
                        accepted.eventQuestActive === 'forced' ? EVENT_QUEST_LINES_FORCED : eventQuestSubAcceptLines(qStageId)
                      );
                      spawnRing(q.x, q.y - 22, 12, 62, 'rgba(96,165,250,0.82)', 3, 520);
                      accepted.spawnGlow(q.x, q.y - 30, GLOW_R_M, 'rgba(96,165,250,', 520);
                      accepted.spawnCallout(q.x, q.y - 76, 'QUEST', '#bfdbfe');
                      playSfx('event-start');
                    }
                  }
                } else {
                  // 納品。サブは完了会話(統合正本の確定稿)を流す(強制納品の会話は正本に無い=従来どおり無し)。
                  const wasSub = useGameStore.getState().eventQuestActive === 'sub';
                  useGameStore.getState().completeEventQuest();
                  if (wasSub) useGameStore.getState().enqueueNpcDialogue(eventQuestSubCompleteLines(qStageId));
                  spawnRing(q.x, q.y - 22, 12, 62, 'rgba(253,230,138,0.85)', 3, 520);
                  useGameStore.getState().spawnGlow(q.x, q.y - 30, GLOW_R_M, 'rgba(253,230,138,', 520);
                  // §6.10 M33⑪: ゴールドラッシュの獲得倍率を表示にも反映(付与額=completeEventQuestと同じ式)。
                  // research/GROWTH.md v4: 育成のゴールド倍率(焼き値)も同じ算出行に掛ける(表示=付与額)。
                  useGameStore.getState().spawnCallout(q.x, q.y - 76, `+${Math.round(EVENT_QUEST_REWARD_GOLD * skillGoldRushMult(useGameStore.getState().player) * useGameStore.getState().player.growthGoldMult)}G`, '#fde68a');
                  playSfx('event-clear');
                }
              }
            }
          }
        }

        // スキル 救難信号: 飛来中の援護アライの着弾ダメージ適用 + 寿命切れ回収(発生自体は
        // triggerCounter内のapplyRescueSignalProcが行う。ここは置いた後の面倒を見るだけ)。
        useGameStore.getState().tickRescueAllies();

        // 救急鞄(first-aid-kit): 投擲中の空鞄の着弾ダメージ適用 + 寿命切れ回収(発生自体は
        // 下のisFirstAidKitEmptyブロックがspawnThrownBagで行う。ここは置いた後の面倒を見るだけ)。
        useGameStore.getState().tickThrownBags();

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
              // §6.10 M33④: エクスプローダーをタレット消滅爆発(半径+ダメージ)にも適用。
              const tExMult = skillExplosionMult(useGameStore.getState().player);
              const tBlastR = TURRET_EXPLOSION_RADIUS * tExMult;
              // v0.25.2472: ゴースト発(ownerGhost)の消滅爆発FXは青白系(視覚のみ・判定/ダメージ不変)。
              if (turret.ownerGhost) {
                useGameStore.getState().spawnExplosionFx(tcx, tcy, tBlastR, 0x9fd8ff); // v0.25.3283: 爆発flipbook(ゴースト=青白)
                spawnRing(tcx, tcy, 8, tBlastR, 'rgba(159,216,255,0.8)', 4, HEAVY_GRENADE_EXPLOSION_EFFECT_MS);
                spawnBurst(tcx, tcy, '#9fd8ff', 16);
                useGameStore.getState().spawnGlow(tcx, tcy, GLOW_R_XS, 'rgba(159,216,255,', HEAVY_GRENADE_EXPLOSION_EFFECT_MS);
              } else {
                useGameStore.getState().spawnExplosionFx(tcx, tcy, tBlastR); // v0.25.3283: 爆発flipbook
                spawnRing(tcx, tcy, 8, tBlastR, 'rgba(251,146,60,0.8)', 4, HEAVY_GRENADE_EXPLOSION_EFFECT_MS);
                spawnBurst(tcx, tcy, '#f97316', 16);
                useGameStore.getState().spawnGlow(tcx, tcy, GLOW_R_XS, 'rgba(251,146,60,', HEAVY_GRENADE_EXPLOSION_EFFECT_MS);
              }
              const tWalls = aoeWalls(tcx, tcy);
              for (const enemy of useGameStore.getState().enemies) {
                if (enemy.type === 'reaper' && !enemy.reaperChaser) continue;
                const ex = enemy.x + enemy.width / 2;
                const ey = enemy.y + enemy.height / 2;
                const dist = Math.hypot(ex - tcx, ey - tcy);
                if (dist > tBlastR) continue;
                if (tWalls.length > 0 && segmentBlocked(tcx, tcy, ex, ey, tWalls)) continue; // 壁越し不可
                const falloff = 1 - dist / tBlastR;
                const dmg = Math.max(1, Math.round(TURRET_EXPLOSION_DAMAGE * tExMult * (0.55 + falloff * 0.45)));
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
            // v0.25.3512(社長指示「発射間隔もレベルで下げたい。いまの間隔をMAXとして、階段に」):
            // 現行値(前方130ms/全方位420ms)= Lv3。Lv1/Lv2 はそのぶん遅い。
            // Lvは**設置時に焼いた持続時間**から逆算する(後からLvを上げても既設のタレットは
            // 置いた時の性能のまま=v0.25.3482の作法をそのまま踏襲)。
            const turretLv = turretLevelFromDuration(turret.duration);
            const interval = turretFireIntervalMs(mode === 'omni' ? TURRET_OMNI_FIRE_MS : TURRET_FWD_FIRE_MS, turretLv);
            const fireReady = gameTime >= (turretFireRef.current.get(turret.id) ?? 0);
            let dir: { x: number; y: number } | null = null;
            if (mode === 'omni') {
              if (!fireReady) continue;
              // 全方位: 射程内の最も近い敵を狙う(近い敵優先)。範囲内に敵がいなければ撃たない。
              const target = useGameStore.getState().enemies
                .filter(e => e.type !== 'reaper' || e.reaperChaser)
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
                if (e.type === 'reaper' && !e.reaperChaser) return false;
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
            // ★Lv3だけ「たまに爆発」(社長裁定v0.25.3482)。**設置時の持続時間でLv3かを判定する**
            //   (プレイヤーが後からLvを上げても、置いた時のタレットは置いた時の性能のまま=自然)。
            const turretIsLv3 = turretLv === 3; // v0.25.3512: 上の turretLevelFromDuration と同じ1本の判定
            if (turretIsLv3 && Math.random() < TURRET_GRENADE_CHANCE) {
              addProjectile({
                id: `proj-turret-gl-${turret.id}-${nowMs}`,
                x: tcx - 7, y: tcy - 7, width: 14, height: 14,
                speed: TURRET_FWD_BULLET_SPEED, damage: TURRET_LAUNCHER_DAMAGE,
                direction: dir, weaponType: 'rifle', weaponKey: GRENADE_WEAPON_KEY,
                duration: 1400, createdAt: nowMs,
                passthrough: true, hitEnemies: [], hostile: false, reflected: false,
                ownerGhost: turret.ownerGhost, // 視覚専用: ゴースト設置タレットの弾も青白
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
                ownerGhost: turret.ownerGhost, // 視覚専用: ゴースト設置タレットの弾も青白
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
            // §6.10 M33④: エクスプローダーをデコイLv3消滅爆発(半径+ダメージ)にも適用。
            const dExMult = skillExplosionMult(useGameStore.getState().player);
            const dBlastR = DECOY_LV3_EXPLOSION_RADIUS * dExMult;
            // v0.25.2472: ゴースト発(ownerGhost)はシアン→青白へ(視覚のみ・判定/ダメージ不変)。
            if (decoy.ownerGhost) {
              useGameStore.getState().spawnExplosionFx(dcx, dcy, dBlastR, 0x9fd8ff); // v0.25.3283: 爆発flipbook(ゴースト=青白)
              spawnRing(dcx, dcy, 8, dBlastR, 'rgba(159,216,255,0.85)', 4, HEAVY_GRENADE_EXPLOSION_EFFECT_MS);
              spawnBurst(dcx, dcy, '#9fd8ff', 16);
              useGameStore.getState().spawnGlow(dcx, dcy, GLOW_R_XS, 'rgba(159,216,255,', HEAVY_GRENADE_EXPLOSION_EFFECT_MS);
            } else {
              useGameStore.getState().spawnExplosionFx(dcx, dcy, dBlastR); // v0.25.3283: 爆発flipbook
              spawnRing(dcx, dcy, 8, dBlastR, 'rgba(56,189,248,0.85)', 4, HEAVY_GRENADE_EXPLOSION_EFFECT_MS);
              spawnBurst(dcx, dcy, '#38bdf8', 16);
              useGameStore.getState().spawnGlow(dcx, dcy, GLOW_R_XS, 'rgba(56,189,248,', HEAVY_GRENADE_EXPLOSION_EFFECT_MS);
            }
            const dWalls = aoeWalls(dcx, dcy);
            for (const enemy of useGameStore.getState().enemies) {
              if (enemy.type === 'reaper' && !enemy.reaperChaser) continue;
              const ex = enemy.x + enemy.width / 2;
              const ey = enemy.y + enemy.height / 2;
              const dist = Math.hypot(ex - dcx, ey - dcy);
              if (dist > dBlastR) continue;
              if (dWalls.length > 0 && segmentBlocked(dcx, dcy, ex, ey, dWalls)) continue; // 壁越し不可
              const falloff = 1 - dist / dBlastR;
              const dmg = Math.max(1, Math.round(decoy.damage * dExMult * (0.55 + falloff * 0.45)));
              const killed = damageEnemy(enemy.id, dmg, true); // 爆発=ボス系には非致死
              spawnDamageNumber(ex, enemy.y, dmg, false);
              if (!killed && !resistsChipKnockback(enemy.type)) { // v0.25.3494(案A): 旧リストを一本化
                const norm = Math.max(0.001, dist);
                // エクスプローダー覚醒(Lv3・v0.25.3300): 爆発KB距離×1.5。
                const dKbEx = skillExplosionKbMult(useGameStore.getState().player);
                useGameStore.getState().knockbackEnemy(
                  enemy.id,
                  (ex - dcx) / norm,
                  (ey - dcy) / norm,
                  DECOY_LV3_KNOCKBACK_MULT * (0.55 + falloff * 0.45) * dKbEx,
                  3 * dKbEx
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
          // 社長指示v0.25.3442: idolの手榴弾技(hostile)=プレイヤーの手榴弾と同じ仕様の敵側爆発。
          // 半径66・減衰式(0.55+0.45×falloff)・壁越し不可は同じ。スキル倍率(エクスプローダー等)と
          // ボマー散布はプレイヤー側の道具なので通さない。判定=中心が赤円の内側(描画の赤円と厳密一致)。
          if (grenade.hostile) {
            removeProjectile(grenade.id);
            playSfx('bomb');
            spawnRing(gx, gy, 8, HEAVY_GRENADE_RADIUS, 'rgba(251,146,60,0.82)', 5, HEAVY_GRENADE_EXPLOSION_EFFECT_MS);
            spawnBurst(gx, gy, '#f97316', 20);
            spawnBurst(gx, gy, '#7f1d1d', 8);
            useGameStore.getState().spawnGlow(gx, gy, GLOW_R_S, 'rgba(251,146,60,', HEAVY_GRENADE_EXPLOSION_EFFECT_MS);
            useGameStore.getState().spawnExplosionFx(gx, gy, HEAVY_GRENADE_RADIUS);
            const hgPl = useGameStore.getState().player;
            const hgPx = hgPl.x + hgPl.width / 2, hgPy = hgPl.y + hgPl.height / 2;
            const hgDist = Math.hypot(hgPx - gx, hgPy - gy);
            const hgWalls = aoeWalls(gx, gy);
            if (hgDist <= HEAVY_GRENADE_RADIUS && !(hgWalls.length > 0 && segmentBlocked(gx, gy, hgPx, hgPy, hgWalls))) {
              const falloff = 1 - hgDist / HEAVY_GRENADE_RADIUS;
              const dmg = Math.max(1, Math.round(grenade.damage * (0.55 + falloff * 0.45)));
              const died = useGameStore.getState().damagePlayer(dmg, '偶像の手榴弾', gx, gy, undefined, undefined, 'idol-nade'); // G4a計測タグ(記録専用・v0.25.3607裁定)
              if (died) triggerPlayerDeath(hgPx, hgPy);
            }
            continue;
          }
          // スキル: ボマー = 手榴弾が起爆する前に一度だけ、周囲へ子グレネード3発を散布し
          // 親の信管を +1s 延長(再アームは1回のみ)。子は ×1/3 ダメージの小型手榴弾。
          // 周期/サブ武器の爆発なのでスロー無し(CLAUDE.md)。
          if (!grenade.bomberSpawned && rollBomberScatter(useGameStore.getState().player)) { // v0.25.3306: 確率発動(30/40/50%)
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
                ownerGhost: grenade.ownerGhost, // 視覚専用: 親がゴースト発ならば子も青白
              });
            }
            spawnBurst(gx, gy, grenade.ownerGhost ? '#9fd8ff' : '#fbbf24', 8);
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
          // §6.10 M33②: skillOutgoingDamageMult(バーサーカー等)を爆発ダメージにも乗算。
          const grenadeOutMult = skillOutgoingDamageMult(useGameStore.getState().player);
          // 子グレネード(ボマー)は固有の半径/ダメージを持つ。未指定は通常の手榴弾値。
          const blastR = (grenade.explodeRadius ?? HEAVY_GRENADE_RADIUS) * grenadeExMult * hgExMult;
          let hgHitCount = 0;
          const grenadeBaseDamage = grenade.damage || HEAVY_GRENADE_DAMAGE;
          const fxMs = HEAVY_GRENADE_EXPLOSION_EFFECT_MS;
          // v0.25.2472: ゴースト発(ownerGhost)の爆発FXは青白系へtint差し替え(視覚のみ・判定/ダメージ不変)。
          if (grenade.ownerGhost) {
            spawnRing(gx, gy, 8, blastR, 'rgba(159,216,255,0.82)', 5, fxMs);
            spawnBurst(gx, gy, '#9fd8ff', 20);
            spawnBurst(gx, gy, '#1e3a5f', 8);
            useGameStore.getState().spawnGlow(gx, gy, GLOW_R_S, 'rgba(159,216,255,', fxMs);
            useGameStore.getState().spawnExplosionFx(gx, gy, blastR, 0x9fd8ff); // v0.25.3283: 爆発flipbook(ゴースト=青白)
          } else {
            spawnRing(gx, gy, 8, blastR, 'rgba(251,146,60,0.82)', 5, fxMs);
            spawnBurst(gx, gy, '#f97316', 20);
            spawnBurst(gx, gy, '#7f1d1d', 8);
            useGameStore.getState().spawnGlow(gx, gy, GLOW_R_S, 'rgba(251,146,60,', fxMs);
            useGameStore.getState().spawnExplosionFx(gx, gy, blastR); // v0.25.3283: 爆発flipbook(全爆発共通)
          }
          const gWalls = aoeWalls(gx, gy);
          for (const enemy of useGameStore.getState().enemies) {
            if (enemy.type === 'reaper' && !enemy.reaperChaser) continue;
            const ex = enemy.x + enemy.width / 2;
            const ey = enemy.y + enemy.height / 2;
            const dist = Math.hypot(ex - gx, ey - gy);
            if (dist > blastR) continue;
            if (gWalls.length > 0 && segmentBlocked(gx, gy, ex, ey, gWalls)) continue; // 壁越しには効かない
            const falloff = 1 - dist / blastR;
            const splashDamage = Math.max(1, Math.round(grenadeBaseDamage * grenadeExMult * grenadeOutMult * (0.55 + falloff * 0.45)));
            const killed = damageEnemy(enemy.id, splashDamage, true); // 爆発=ボス系には非致死(社長指示)
            hgHitCount += 1;
            spawnDamageNumber(ex, enemy.y, splashDamage, false);
            spawnBurst(ex, ey, '#b91c1c', 4);
            if (
              !killed &&
              !resistsChipKnockback(enemy.type) // v0.25.3494(案A): 旧リストを一本化
            ) {
              const norm = Math.max(0.001, dist);
              // エクスプローダー覚醒(Lv3・v0.25.3300): 爆発KB距離×1.5(maxStrengthも同率で引き上げ)。
              const hgKbEx = skillExplosionKbMult(useGameStore.getState().player);
              useGameStore.getState().knockbackEnemy(
                enemy.id,
                (ex - gx) / norm,
                (ey - gy) / norm,
                HEAVY_GRENADE_KNOCKBACK_MULT * (0.55 + falloff * 0.45) * hgKbEx,
                3 * hgKbEx
              );
            }
            if (killed) {
              playEnemyDeath();
              dropEnemyXp(enemy, ex, ey, 'pickup-xp-heavy-grenade');
            }
          }
          useGameStore.getState().registerMultiHit(hgHitCount); // ヘビーガンナー: 2体以上で爆発範囲バフ
        }

        // 社長指示v0.25.3438: グレネードガンt1/t2=手榴弾と同様に転がって爆発(t3は従来の着弾爆発のまま)。
        // 爆発する道のり=t1:ショットガン距離(120px)/t2:ハンドガン距離(176px)。rollDetonatePxを持つ弾だけが
        // 対象(タレット/朱雀/爆撃がweaponKey='glauncher-t1'を名乗って流用する直進弾には付かない=従来どおり)。
        // 爆発の中身はグレネードガンの着弾爆発と同一(半径GRENADE_BLAST_RADIUS・×GRENADE_BLAST_DAMAGE_MULT・
        // エクスプローダー/ヘビーガンナー倍率・壁越し不可・ボマー散布・ボス非致死)。duration経過は信管代わりの
        // フォールバック起爆。※v0.25.3441「直撃を復活」: 転がり中に敵へ触れた弾は通常の弾衝突
        // (着弾爆発ハンドラ=直撃ダメージ+スプラッシュ)で爆発・除去されるので、ここへは来ない。
        const rollShells = useGameStore.getState().projectiles
          .filter(p => p.rollDetonatePx !== undefined && !p.hostile
            && ((p.traveledPx ?? 0) >= p.rollDetonatePx || Date.now() - p.createdAt >= p.duration));
        for (const shell of rollShells) {
          const sx = shell.x + shell.width / 2;
          const sy = shell.y + shell.height / 2;
          removeProjectile(shell.id);
          playSfx('bomb');
          const rsPlayer = useGameStore.getState().player;
          const exMult = skillExplosionMult(rsPlayer);
          const exRadius = GRENADE_BLAST_RADIUS * exMult * heavyGunnerExplosionMult(rsPlayer, gameTime);
          let glHitCount = 0;
          spawnRing(sx, sy, 10, exRadius, 'rgba(251,146,60,0.82)', 5, GRENADE_LAUNCHER_EXPLOSION_EFFECT_MS);
          spawnBurst(sx, sy, '#f97316', 24);
          spawnBurst(sx, sy, '#7f1d1d', 10);
          useGameStore.getState().spawnExplosionFx(sx, sy, exRadius);
          useGameStore.getState().spawnGlow(sx, sy, GLOW_R_S, 'rgba(251,146,60,', GRENADE_LAUNCHER_EXPLOSION_EFFECT_MS);
          const splashBase = shell.damage * GRENADE_BLAST_DAMAGE_MULT * exMult;
          const glWalls = aoeWalls(sx, sy);
          for (const splashEnemy of useGameStore.getState().enemies) {
            if (splashEnemy.type === 'reaper' && !splashEnemy.reaperChaser) continue;
            const ex = splashEnemy.x + splashEnemy.width / 2;
            const ey = splashEnemy.y + splashEnemy.height / 2;
            const dist = Math.hypot(ex - sx, ey - sy);
            if (dist > exRadius) continue;
            if (glWalls.length > 0 && segmentBlocked(sx, sy, ex, ey, glWalls)) continue; // 壁越し不可
            const falloff = 1 - dist / exRadius;
            const splashDamage = Math.max(1, Math.round(splashBase * (0.55 + falloff * 0.45)));
            const splashKilled = damageEnemy(splashEnemy.id, splashDamage, true); // 爆発=ボス系には非致死
            glHitCount += 1;
            spawnDamageNumber(ex, splashEnemy.y, splashDamage, false);
            spawnBurst(ex, ey, '#b91c1c', 4);
            if (splashKilled) {
              playEnemyDeath();
              spawnBurst(ex, ey, '#dc2626', 12);
              useGameStore.getState().dropEnemyCurrency(splashEnemy, ex, ey);
              dropEnemyXp(splashEnemy, ex, ey, 'pickup-xp-grenade');
            }
          }
          useGameStore.getState().registerMultiHit(glHitCount); // ヘビーガンナー: 2体以上で爆発範囲バフ
          // §6.10 M33③: ボマー = 転がり弾の爆発でも子グレネードを散布(着弾爆発と同じ扱い・再散布なし)。
          if (rollBomberScatter(rsPlayer)) {
            for (const mini of buildBomberMinis(sx, sy, `glroll-${shell.id}`, undefined, undefined, bomberMiniCount(rsPlayer))) addProjectile(mini);
            spawnBurst(sx, sy, '#fbbf24', 8);
          }
        }

        // センサー地雷(sensor-mine): 範囲(=爆発半径79)に敵が入ると2秒後に起爆(PACING_PUZZLE.md §6.4 M27)。
        // 感知/起爆の判定は純関数 tickSensorMines(src/utils/sensorMine.ts)、ここは結果の反映と爆発処理のみ。
        // 爆発は手榴弾と同じ経路(エクスプローダー倍率/ボマー子グレネード/減衰・ノックバック/ボス非致死/壁越し不可)。
        // 敵のみに反応・自傷なし。サブ武器の爆発なのでスローモーションは発生させない(CLAUDE.md)。
        {
          const smStore = useGameStore.getState();
          if (smStore.sensorMines.length > 0) {
            const smResult = tickSensorMines({
              mines: smStore.sensorMines,
              enemies: smStore.enemies.map(e => ({ x: e.x + e.width / 2, y: e.y + e.height / 2 })),
              gameTime,
            });
            if (smResult.changed) smStore.setSensorMines(smResult.mines);
            for (const mine of smResult.detonated) {
              // v0.25.2541(§2.11追補・発注C): 爆発の倍率評価の主語=**置いた本人**
              // (プレイヤー=従来どおり本人 / 守護霊=計測時ビルドの疑似Player)。ビルドが解決できない
              // 時だけ本人へフォールバック(ゴースト解散後に残った地雷が起爆する場合など)。
              const smGhostId = mine.ownerGhostId;
              const smActor = (smGhostId !== undefined ? combatActorPlayer(smGhostId) : null)
                ?? useGameStore.getState().player;
              const smIsGhost = smGhostId !== undefined;
              // スキル: ボマー = 起爆時にミニ手榴弾3個散布(手榴弾と同じ子グレネード処理。子は再散布しない)。
              if (rollBomberScatter(smActor)) { // v0.25.3306: 確率発動(30/40/50%)
                const nowB = Date.now();
                const smMiniN = bomberMiniCount(smActor); // ボマー覚醒(Lv3・v0.25.3300)=4つ
                for (let k = 0; k < smMiniN; k++) {
                  const ang = (Math.PI * 2 * k) / smMiniN + Math.random() * 0.5;
                  addProjectile({
                    id: `proj-bomber-mini-${mine.id}-${nowB}-${k}`,
                    x: mine.x - 5, y: mine.y - 5, width: 10, height: 10,
                    speed: HEAVY_GRENADE_SPEED * 0.8,
                    damage: HEAVY_GRENADE_DAMAGE / 3,
                    direction: { x: Math.cos(ang), y: Math.sin(ang) },
                    weaponType: 'grenade', weaponKey: 'sub-heavy-grenade',
                    duration: 600, createdAt: nowB,
                    passthrough: false, hitEnemies: [], hostile: false, reflected: false,
                    bomberSpawned: true, // 子はこれ以上散布しない
                    explodeRadius: HEAVY_GRENADE_RADIUS * 0.6,
                  });
                }
                spawnBurst(mine.x, mine.y, '#fbbf24', 8);
              }
              playSfx('bomb');
              // スキル: エクスプローダー = 半径/ダメージ倍率(手榴弾と同じ倍率経路)。
              // キャラ固有 ヘビーガンナー: 直近の同一攻撃2体以上ヒットで爆発範囲倍率(全爆発対象)。
              const smExMult = skillExplosionMult(smActor);
              const smHgMult = heavyGunnerExplosionMult(smActor, gameTime);
              // §6.10 M33②: skillOutgoingDamageMult(バーサーカー等)を爆発ダメージにも乗算。
              const smOutMult = skillOutgoingDamageMult(smActor);
              const smBlastR = SENSOR_MINE_RADIUS * smExMult * smHgMult;
              const smFxMs = HEAVY_GRENADE_EXPLOSION_EFFECT_MS;
              spawnRing(mine.x, mine.y, 8, smBlastR, 'rgba(251,146,60,0.82)', 5, smFxMs);
              spawnBurst(mine.x, mine.y, '#f97316', 20);
              spawnBurst(mine.x, mine.y, '#7f1d1d', 8);
              useGameStore.getState().spawnGlow(mine.x, mine.y, GLOW_R_S, 'rgba(251,146,60,', smFxMs);
              useGameStore.getState().spawnExplosionFx(mine.x, mine.y, smBlastR); // v0.25.3283: 爆発flipbook
              const smWalls = aoeWalls(mine.x, mine.y);
              let smHitCount = 0;
              for (const enemy of useGameStore.getState().enemies) {
                if (enemy.type === 'reaper' && !enemy.reaperChaser) continue;
                const ex = enemy.x + enemy.width / 2;
                const ey = enemy.y + enemy.height / 2;
                const dist = Math.hypot(ex - mine.x, ey - mine.y);
                if (dist > smBlastR) continue;
                if (smWalls.length > 0 && segmentBlocked(mine.x, mine.y, ex, ey, smWalls)) continue; // 壁越しには効かない
                const falloff = 1 - dist / smBlastR;
                const splashDamage = Math.max(1, Math.round(SENSOR_MINE_DAMAGE * smExMult * smOutMult * (0.55 + falloff * 0.45)));
                // 爆発=ボス系には非致死(手榴弾と同じ)。守護霊の地雷は帰属も守護霊
                // (damageChannel=null=除外4の計測分離 / hateSource='ghost')。プレイヤーは従来の既定と同値。
                const smKilled = smIsGhost
                  ? damageEnemy(enemy.id, splashDamage, true, false, false, null, 'ghost')
                  : damageEnemy(enemy.id, splashDamage, true);
                smHitCount += 1;
                spawnDamageNumber(ex, enemy.y, splashDamage, false);
                spawnBurst(ex, ey, '#b91c1c', 4);
                if (!smKilled && !resistsChipKnockback(enemy.type)) { // v0.25.3494(案A): 旧リストを一本化
                  const norm = Math.max(0.001, dist);
                  // エクスプローダー覚醒(Lv3・v0.25.3300): 爆発KB距離×1.5(主語=置いた本人)。
                  const smKbEx = skillExplosionKbMult(smActor);
                  useGameStore.getState().knockbackEnemy(
                    enemy.id,
                    (ex - mine.x) / norm,
                    (ey - mine.y) / norm,
                    HEAVY_GRENADE_KNOCKBACK_MULT * (0.55 + falloff * 0.45) * smKbEx,
                    3 * smKbEx
                  );
                }
                if (smKilled) {
                  playEnemyDeath();
                  dropEnemyXp(enemy, ex, ey, 'pickup-xp-sensor-mine');
                }
              }
              // ヘビーガンナー: 2体以上で爆発範囲バフ。**プレイヤー自身の地雷だけ**が本人のバフを積む
              // (守護霊の地雷でプレイヤーのバフ窓が伸びる=主語をまたぐ横取りになるため。N HITSの
              // 頭上バナーもプレイヤー位置に出る演出=除外1)。
              if (!smIsGhost) useGameStore.getState().registerMultiHit(smHitCount);
            }
          }
        }

        // フレアガン(flare-gun・§6.6 M29): 寿命切れ(着弾+3秒)のフレアを回収(判定=純関数 pruneFlares)。
        // 引き付け自体は updateEnemies/combatTick/ボス追跡が activeFlareTargets を合流して処理する。
        {
          const fgFlares = useGameStore.getState().flareGunFlares;
          if (fgFlares.length > 0) {
            const fgAlive = pruneFlares(fgFlares, gameTime);
            if (fgAlive !== fgFlares) useGameStore.getState().setFlareGunFlares(fgAlive);
          }
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
              // §6.10 M33②: skillOutgoingDamageMult(バーサーカー等)を爆発ダメージにも乗算。
              const fkOutMult = skillOutgoingDamageMult(useGameStore.getState().player);
              // キャラ固有 ヘビーガンナー: 直近の同一攻撃2体以上ヒットで爆発範囲 ×1.1。
              const blastR = (knife.area ?? FIRE_KNIFE_RADIUS_BY_LEVEL[1]) * fkExMult * heavyGunnerExplosionMult(useGameStore.getState().player, gameTime);
              let fkHitCount = 0;
              removeProjectile(knife.id);
              playSfx('bomb');
              // §6.10 M33③: ボマー = 発火ナイフの爆発でも子グレネード3個を散布(手榴弾と同一仕様・再散布なし)。
              if (rollBomberScatter(useGameStore.getState().player)) { // v0.25.3306: 確率発動(30/40/50%)
                // ボマー覚醒(Lv3・v0.25.3300)=4つ
                for (const mini of buildBomberMinis(bx, by, `fk-${knife.id}`, undefined, undefined, bomberMiniCount(useGameStore.getState().player))) {
                  addProjectile({ ...mini, ownerGhost: knife.ownerGhost }); // 視覚専用: ゴースト発は子も青白
                }
                spawnBurst(bx, by, knife.ownerGhost ? '#9fd8ff' : '#fbbf24', 8);
              }
              // v0.25.2472: ゴースト発(ownerGhost)の爆発FXは青白系(視覚のみ・判定/ダメージ不変)。
              if (knife.ownerGhost) {
                useGameStore.getState().spawnExplosionFx(bx, by, blastR, 0x9fd8ff); // v0.25.3283: 爆発flipbook(ゴースト=青白)
                spawnRing(bx, by, 8, blastR, 'rgba(159,216,255,0.85)', 5, FIRE_KNIFE_EXPLOSION_EFFECT_MS);
                spawnBurst(bx, by, '#9fd8ff', 18);
                spawnBurst(bx, by, '#1e3a5f', 8);
                useGameStore.getState().spawnGlow(bx, by, snapGlowRadius(blastR * 0.68), 'rgba(159,216,255,', FIRE_KNIFE_EXPLOSION_EFFECT_MS);
              } else {
                useGameStore.getState().spawnExplosionFx(bx, by, blastR); // v0.25.3283: 爆発flipbook
                spawnRing(bx, by, 8, blastR, 'rgba(251,146,60,0.85)', 5, FIRE_KNIFE_EXPLOSION_EFFECT_MS);
                spawnBurst(bx, by, '#f97316', 18);
                spawnBurst(bx, by, '#7f1d1d', 8);
                useGameStore.getState().spawnGlow(bx, by, snapGlowRadius(blastR * 0.68), 'rgba(251,146,60,', FIRE_KNIFE_EXPLOSION_EFFECT_MS);
              }
              const fkWalls = aoeWalls(bx, by);
              for (const enemy of useGameStore.getState().enemies) {
                if (enemy.type === 'reaper' && !enemy.reaperChaser) continue;
                const ex = enemy.x + enemy.width / 2;
                const ey = enemy.y + enemy.height / 2;
                const dist = Math.hypot(ex - bx, ey - by);
                if (dist > blastR) continue;
                if (fkWalls.length > 0 && segmentBlocked(bx, by, ex, ey, fkWalls)) continue; // 壁越し不可
                const falloff = 1 - dist / blastR;
                const splashDamage = Math.max(1, Math.round(FIRE_KNIFE_EXPLOSION_DAMAGE * fkExMult * fkOutMult * (0.55 + falloff * 0.45)));
                const killed = damageEnemy(enemy.id, splashDamage, true); // 爆発=ボス系には非致死
                fkHitCount += 1;
                spawnDamageNumber(ex, enemy.y, splashDamage, false);
                spawnBurst(ex, ey, '#b91c1c', 4);
                if (!killed && !resistsChipKnockback(enemy.type)) { // v0.25.3494(案A): 旧リストを一本化
                  const norm = Math.max(0.001, dist);
                  {
                    // エクスプローダー覚醒(Lv3・v0.25.3300): 爆発KB距離×1.5。
                    const fkKbEx = skillExplosionKbMult(useGameStore.getState().player);
                    useGameStore.getState().knockbackEnemy(enemy.id, (ex - bx) / norm, (ey - by) / norm, FIRE_KNIFE_KNOCKBACK_MULT * (0.55 + falloff * 0.45) * fkKbEx, 3 * fkKbEx);
                  }
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
              if (e.type === 'reaper' && !e.reaperChaser) continue;
              if (checkCollision(knife, e)) { hit = e; break; }
            }
            if (hit) {
              const hx = hit.x + hit.width / 2;
              const hy = hit.y + hit.height / 2;
              const killed = damageEnemy(hit.id, knife.damage);
              spawnDamageNumber(hx, hit.y, knife.damage, false);
              spawnBurst(hx, hy, knife.ownerGhost ? '#9fd8ff' : '#fb923c', 5); // 刺さった火花(軽量。ゴースト発は青白)
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
                if (e.type === 'reaper' && !e.reaperChaser) continue;
                if (boom.hitEnemies.includes(e.id)) continue;
                if (!checkCollision(boom, e)) continue;
                boom.hitEnemies.push(e.id); // store配列を直接更新(既存の貫通弾と同じ手法)
                const ex = e.x + e.width / 2, ey = e.y + e.height / 2;
                // §6.10 M33②: skillOutgoingDamageMult(バーサーカー等)をドローン往復の接触ダメージにも乗算。
                const boomDmg = Math.max(1, Math.round(boom.damage * skillOutgoingDamageMult(useGameStore.getState().player)));
                const killed = damageEnemy(e.id, boomDmg, true); // 爆発=ボス系には非致死
                spawnDamageNumber(ex, e.y, boomDmg, false);
                spawnBurst(ex, ey, '#a5f3fc', 4);
                if (killed) {
                  playEnemyDeath();
                  dropEnemyXp(e, ex, ey, `pickup-xp-boom-${Math.floor(Date.now())}`);
                }
              }
            } else if (phase === 'stop') {
              // §6.24 M48「防衛」: weaponKey='poi-guard' は常時周回する警察署アリーナ報酬のブーメラン。
              // 動き(orbitフィールド)は既存の bibles 用汎用周回モーションに乗せてあるので、ここでは
              // 「'stop'扱いの周囲パルスダメージ」+「弾もかき消す(投擲版には無い挙動)」だけを足す。
              const isGuardOrbit = boom.weaponKey === 'poi-guard';
              // 0.25秒ごとのパルス。範囲内の敵へ 1/4 ダメージ(同一敵は0.25秒間隔=パルス間隔)。
              const nextPulse = boomPulseRef.current.get(boom.id) ?? 0;
              if (gameTime >= nextPulse) {
                boomPulseRef.current.set(boom.id, gameTime + DRONE_BOOM_PULSE_MS);
                const pulsePlayer = useGameStore.getState().player;
                // §6.10 M33④: エクスプローダーをドローンパルスAoE(半径+ダメージ)にも適用。
                // §6.10 M33②: skillOutgoingDamageMult(バーサーカー等)をパルスダメージにも乗算。
                const pulseExMult = skillExplosionMult(pulsePlayer);
                const r = (boom.area ?? DRONE_BOOM_RADIUS) * pulseExMult;
                // §6.24 C3: 防衛は「近接の1/4」を都度参照する(投擲版は着弾時に固定したboom.damageを使う。
                // 防衛は出撃中ずっと生き続けるパッシブなので、近接強化に追従させるのが自然な解釈)。
                const baseDamage = isGuardOrbit
                  ? (pulsePlayer.weapons.find(w => w.isMelee)?.damage ?? 6) * strikerMeleeMult(pulsePlayer) * (pulsePlayer.equipBonus?.damageMult ?? 1)
                  : boom.damage;
                const dmg = Math.max(1, Math.round((baseDamage / DRONE_BOOM_STOP_DMG_DIV) * pulseExMult * skillOutgoingDamageMult(pulsePlayer)));
                const boomWalls = aoeWalls(bx, by);
                for (const e of bs.enemies) {
                  if (e.type === 'reaper' && !e.reaperChaser) continue;
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
              // §6.24 C5「防衛」: 弾もかき消す(ブーメラン本体の当たり半径=boom.area・投擲版には無い挙動)。
              if (isGuardOrbit) {
                const guardR2 = ((boom.area ?? DRONE_BOOM_RADIUS)) ** 2;
                for (const b of useGameStore.getState().projectiles) {
                  if (!b.hostile) continue;
                  const bpx = b.x + b.width / 2, bpy = b.y + b.height / 2;
                  if ((bpx - bx) ** 2 + (bpy - by) ** 2 > guardR2) continue;
                  removeProjectile(b.id);
                  spawnBurst(bpx, bpy, '#a5f3fc', 4);
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
          // 社長報告v0.25.2326(案A): 旧実装は**敵の中心**が半径内に入るまで反応せず、体が円に食い込んでも
          // 掛からなかった(見た目の円と食い違い・大型ほど目減り)。判定は marksmanTrap.ts の純関数へ
          // 切り出し、**体が円に触れたら捕獲**へ変更した。
          const targets = selectTrapTargets(
            useGameStore.getState().enemies, tx, ty, radius, remainingTargets, alreadyHit,
          ).map(enemy => ({ enemy }));
          if (targets.length === 0) continue;
          // v0.25.2472: ゴースト設置(ownerGhost)の捕獲FXはシアン→青白へ(視覚のみ・判定/捕縛不変)。
          if (trap.ownerGhost) {
            spawnRing(tx, ty, 8, radius + 12, 'rgba(159,216,255,0.9)', 3, 360);
            spawnBurst(tx, ty, '#9fd8ff', 14);
            useGameStore.getState().spawnGlow(tx, ty, radius + 28, 'rgba(159,216,255,', 320);
          } else {
            spawnRing(tx, ty, 8, radius + 12, 'rgba(56,189,248,0.9)', 3, 360);
            spawnBurst(tx, ty, '#38bdf8', 14);
            useGameStore.getState().spawnGlow(tx, ty, radius + 28, 'rgba(56,189,248,', 320);
          }
          targets.forEach(({ enemy }) => {
            const ex = enemy.x + enemy.width / 2;
            const ey = enemy.y + enemy.height / 2;
            rootEnemy(enemy.id, gameTime + MARKSMAN_TRAP_STUN_MS);
            spawnRing(ex, ey, 5, 28, trap.ownerGhost ? 'rgba(224,242,254,0.86)' : 'rgba(125,211,252,0.86)', 2, 260);
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
                // スケーターSE(v0.25.3302/3304・社長指示): 覚醒=爆発音(bomb)/非覚醒=バッシュの音
                // (heavy-impact=盾バッシュと同じ)。gameStoreはaudioManager非依存の方針のため、
                // SEは呼び出し側=ループが持つ(store側のbashHitFxAtは立てない=二重再生防止)。
                playSfx(skillLevel(useGameStore.getState().player, 'skater') >= 3 ? 'bomb' : 'heavy-impact');
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
          // CRIT-UNIFY §9.4: 着弾時ロール(トラップ+10%/弱点+10%)は「プレイヤー直接武器」の銃10種
          // (handgun/shotgun/rifle/phill)専用。escort/ghost-gun/タレット/ホーミング/跳弾/ジャンク等の
          // サブ・味方系projectileはこの2つのロール自体をスキップする(発生枠=銃器+近接系+分身)。
          const isDirectWeaponHit = isDirectGunWeaponKey(projectile?.weaponKey);
          // トラップ(root)中のクリ率+10%: ボスはクリペナルティ(-10%)と丁度相殺して実質0だったため、
          // ボスに限りペナルティを通さず既存値(MARKSMAN_TRAP_CRIT_BONUS=0.10)をそのまま適用
          // (社長指示v0.25.1688「ボスにはクリティカル率アップ(既存の値)」。ボス以外は従来どおり)。
          const trapCritBonus =
            isDirectWeaponHit &&
            enemyForFx !== undefined &&
            enemyForFx.rootUntil !== undefined &&
            gameTime < enemyForFx.rootUntil &&
            Math.random() < (isBoss ? MARKSMAN_TRAP_CRIT_BONUS : applyEnemyCritPenalty(MARKSMAN_TRAP_CRIT_BONUS, enemyForFx));
          // PACING_PUZZLE.md §5.6 M7: チャフ(バット/ゾンビ)の武器弱点=銃+10%。命中対象の型は
          // ヒット時点でしか分からない(発射時は未確定)ため、ここで対象別に追加ロールする。
          const weakCrit = WEAKCRIT_ENABLED && isDirectWeaponHit && enemyForFx
            ? Math.random() < applyEnemyCritPenalty(weaknessCritBonus(enemyForFx.type, 'gun'), enemyForFx)
            : false;
          // CRIT-UNIFY §9.1: 生成時boolean抽選(旧projectile.crit)を廃止。critChance(数値)を運び、
          // 命中時に対象別(ボスは半減+下限5%・通常敵はそのまま)でロールする。
          const baseCrit = enemyForFx
            ? Math.random() < projectileHitCritChance(projectile?.critChance ?? 0, enemyForFx)
            : false;
          // PHILL銃の頭部命中は確定ヘッドショット=クリティカル扱い(×1.5＋気絶＋headshot SE＋金VFX)。
          // 訓練(M0)の封印(社長指示v0.25.2293/2295): **教わるまでクリティカルは一切出さない**。
          // 実バグだった: 銃には「チャフ(バット/ゾンビ)の武器弱点=銃+10%」(§5.6 M7)があり、
          // 射撃教習の相手はゾンビなので**プレイヤーの銃が10%でクリしていた**。クリは×1.5なので
          // 「弾はちょうど倒せる分だけ」の台本も崩れる。味方(escort)の弾も同じ判定を通っていた。
          // また**ダメージ0の弾でクリ判定が走る意味は無い**(味方の演出射撃)ので、そこも落とす。
          const m0CritLocked = !collisionState.m0Unlocked.crit;
          // v0.25.2514(裁定4): 発射時に確定ヘッドショットと決まった弾(守護霊のPHILL再現)も
          // 「頭部命中」と同じ扱い=着弾ロールを通さずクリ確定にする。
          const headshotHit = headshot === true || projectile?.headshot === true;
          // 裁定4(PHILL・記録専用): プレイヤーのPHILL弾が頭部に当たった回数を計測(率は撃破セッション
          // 確定時にビルド写しへ焼かれ、守護霊がその確率でヘッドショットを再現する)。headshotは
          // weaponType==='phill-bullet'(=プレイヤーのPHILL)でしか立たない=守護霊の弾は数えない。
          if (headshot === true) recordPhillHeadshot();
          const hitCrit = (m0CritLocked || damage <= 0)
            ? false
            : (baseCrit || trapCritBonus || weakCrit || headshotHit);
          // スキル: クリティカルD上昇(+0.5) / バーサーカー(失HP%で全攻撃増) / スナイパー(停止敵・遠距離増)。
          const skillPlayer = collisionState.player;
          // §6.10 M33⑩(★8裁定): 護衛NPC弾(weaponKey='escort')はプレイヤーの攻撃ではないため、
          // プレイヤースキル倍率(skillCritMult/skillOutgoingDamageMult/sniperGunMult/skillComboMasterMult)を
          // 乗せない(クリ時は素のクリ倍率のみ)。タレット/ホーミング/ジャンク/援護射撃/跳弾/反射弾は
          // プレイヤー由来なので従来どおり(★9と整合)。
          const isEscortShot = projectile?.weaponKey === 'escort';
          // v0.25.2514(GHOST-BUILD-1・§2.11訂正): 守護霊の弾を isAllyOwnedShot から**撤去**した。
          // 旧実装(v0.25.2459方針)はescortと同枠で「プレイヤースキル倍率を乗せない」にしていたが、
          // 社長裁定「ステータス保存する意味ないやん」で廃止=守護霊は**計測時ビルドの倍率を全て乗せる**。
          // 倍率の主語(疑似Player)は ghostBuild(スナップショット)から作る=本人の現在ビルドではない。
          // escortは従来どおり倍率なしのまま(裁定は守護霊についてのみ)。
          // v0.25.2525(GHOST-REFLECT-MELEE-SUBS・台帳§4-1): 守護霊の**反射弾**('ghost-reflect')も
          // 同じ扱い=倍率の主語は疑似Player・計測除外・ヘイトは'ghost'(プレイヤーの反射弾は
          // weaponKeyを持たないので、この判定はプレイヤー側を1bitも変えない)。
          const isGhostShot = projectile?.weaponKey === 'ghost-gun' || projectile?.weaponKey === GHOST_REFLECT_WEAPON_KEY;
          const isAllyOwnedShot = isEscortShot;
          const ghostAllyForShot = isGhostShot ? collisionState.summons.find(s => s.kind === 'ghost-ally') : undefined;
          const ghostShotBuild = isGhostShot ? ghostBuildFor(ghostAllyForShot, skillPlayer) : null;
          // 倍率評価の主語: 守護霊弾=計測時ビルドの疑似Player(位置/HPは実体=距離依存のスナイパー倍率と
          // 失HP依存のバーサーカー倍率がゴースト基準になる。ゴースト解散後の在弾は最後のビルドで解決)。
          const shotOwner = ghostShotBuild
            ? (ghostAllyForShot ? ghostActorPlayer(ghostShotBuild, ghostAllyForShot) : ghostShotBuild.player)
            : skillPlayer;
          const directPlayerGun = !isGhostShot && !isEscortShot && isDirectGunWeaponKey(projectile?.weaponKey);
          const brokenDirectGun = directPlayerGun && !!enemyForFx && isBossPostureBroken(enemyForFx, gameTime);
          const critMult = hitCrit && !brokenDirectGun
            ? (isAllyOwnedShot
                ? (isBoss ? BOSS_CRIT_DAMAGE_MULT : CRIT_DAMAGE_MULT)
                : skillCritMult(shotOwner, isBoss ? BOSS_CRIT_DAMAGE_MULT : CRIT_DAMAGE_MULT))
            : 1;
          // スキル: コンボマスターは「全攻撃」増加(ユーザー指定)。銃にもフィニッシュコンボ倍率を適用。
          // 守護霊はフィニッシュコンボの計数を持たない(0/0=中立1。★未決: ゴースト側のコンボ計数)。
          const comboMasterMult = isGhostShot
            ? skillComboMasterMult(shotOwner, gameTime, 0, 0)
            : skillComboMasterMult(skillPlayer, gameTime, collisionState.meleeFinishComboCount, collisionState.meleeFinishComboUntil);
          // カウンター弾(反射弾)で一撃死するのはプラントだけ(社長指示)。それ以外は通常の反射ダメージで、
          // ボス含め普通に死にうる(社長指示で「プラント以外は死なない」protectionは廃止)。
          const plantCounterKill = !!projectile?.reflected && enemyForFx?.type === 'plant';
          // 社長指示v0.25.3300: 貫通全般は1体貫通するごとにダメージ-20%(乗算×0.8^n)。hitEnemiesは
          // 衝突検出時にpush済み(collisionUtils)なのでindexOf=「この敵より前に貫いた数」。
          // シャープシューター覚醒(Lv3)は減衰無効=スキルの貫通は100%ダメージに戻る。
          const pierceIndex = projectile ? Math.max(0, projectile.hitEnemies.indexOf(enemyId)) : 0;
          const pierceDecayMult = pierceIndex > 0 && skillLevel(shotOwner, 'sharpshooter') < 3
            ? Math.pow(0.8, pierceIndex)
            : 1;
          const dmg = plantCounterKill
            ? (enemyForFx?.maxHealth ?? 1) + 1
            : isAllyOwnedShot
              ? damage * critMult * pierceDecayMult
              : damage * critMult * pierceDecayMult * skillOutgoingDamageMult(shotOwner) * sniperGunMult(shotOwner, enemyForFx) * comboMasterMult;
          // §6.21 M46: gun/otherチャネル分類(護衛NPC弾はnull=計測除外)。純関数=classifyProjectileDamageChannel。
          const dmgChannel = classifyProjectileDamageChannel(projectile?.weaponType, projectile?.weaponKey);
          // BOT_AND_GHOST.md §2.8 G2.5: ゴースト銃弾(weaponKey='ghost-gun')と守護霊の反射弾
          // ('ghost-reflect'・v0.25.2525)だけヘイトの起因を'ghost'にする(escort等それ以外は既定
          // 'player'=「1つの財布」の側という扱い・本バッチのスコープ外)。
          const hateShotSource: HateSide = isGhostShot ? 'ghost' : 'player';
          // ★GHOST_BOSS.md v9(弾パリィ=反応時間モデル): 弾のゲートは damageEnemy の内側で呼ばれ、
          // 橋は弾を受け取らない。**飛翔時間はここで出して打撃種別と一緒に運ぶ**(距離÷速度なので
          // 時計を跨がない・スロー/ヒットストップの影響も受けない)。速度0や発射点=着弾点の弾は
          // 「瞬間着弾=見てから反応できない」側に出る(割り算の前で分岐済み)。
          const gpBulletSource = directPlayerGun
            ? {
              kind: 'bullet' as const,
              flightMs: projectile && enemyForFx
                ? projectileFlightMsTo(
                  projectile,
                  enemyForFx.x + enemyForFx.width / 2, enemyForFx.y + enemyForFx.height / 2,
                )
                : Number.POSITIVE_INFINITY,
            }
            : undefined;
          // v0.25.3219(社長指示): カウンターで打ち返した弾(reflected)の命中は体勢ゲージを少し削る。
          // SKILL_BUILD_REDESIGN.md §28(B7/§28-1): 弾幕の王が載せたpostureMult(既定1)をそのまま運ぶ。
          const enemyKilled = damageEnemy(
            enemyId, dmg, false, hitCrit, false, dmgChannel, hateShotSource,
            projectile?.reflected ? 'reflect' : directPlayerGun && hitCrit ? 'gun-crit' : null,
            projectile?.postureMult ?? 1,
            // ★v0.25.3665(社長指摘「鴉、銃の弾反撃しないよ?」): プレイヤーの直接銃弾は弾として
            // 幻影ゲートへ(=飛翔時間が反応速度以上なら counterChance 抽選で打ち返し対象)。
            // サブ・爆発・護衛/守護霊弾は従来どおり。
            gpBulletSource,
          );
          // ★v0.25.3640(成果物監査Q1-1): 幻影の被弾無敵が弾いた1発は、**数字もヒットSEも出さない**
          // (ゲートはHPを止めるが、数字/SEは呼び出し側=ここが出しているため、素通しだと
          // 「満額の数字が出るのにHPが減らない」偽演出がSMG連射で毎秒積み上がる)。
          // 弾いた事実は damageEnemy が同tickの gpBlockedAt/gpParriedAt 打刻で返す(白点滅は描画側)。
          const gpNow = !!enemyForFx && isGuardianPhantom(enemyForFx.type)
            ? (() => {
              const gst = useGameStore.getState();
              const cur = gst.enemies.find(x => x.id === enemyId);
              return {
                blocked: !!cur && (cur.gpBlockedAt === gst.gameTime || cur.gpParriedAt === gst.gameTime),
                bulletParried: !!cur && cur.gpBulletParriedAt === gst.gameTime,
              };
            })()
            : { blocked: false, bulletParried: false };
          const gpDeflectedShot = gpNow.blocked || gpNow.bulletParried;
          // ★v0.25.3665: 弾パリィ成立=**その弾を打ち返す**(プレイヤーのカウンター打ち返しの鏡:
          // 反転・敵対化・×REFLECT倍率・非貫通。ただし既に反射済みの弾はラリーでダメージが
          // 指数増殖しないよう倍率1で返す)。弾はこの後の消滅判定でも消さない。
          const gpBulletReflected = gpNow.bulletParried && !!projectile;
          if (gpBulletReflected && projectile && enemyForFx) {
            // 倍率=(打ち返し×10)×(対人1/10)=素の弾ダメージで返る。反射済みの弾はさらに1で
            // 返す(ラリーでダメージが指数増殖しない)。プレイヤー側の再打ち返し(×10)は既存のまま。
            useGameStore.getState().reflectProjectile(
              projectile.id, (projectile.reflected ? 1 : REFLECT_DAMAGE_MULTIPLIER) * PVP_DAMAGE_SCALE, undefined, true,
            );
            const gcx = enemyForFx.x + enemyForFx.width / 2, gcy = enemyForFx.y + enemyForFx.height / 2;
            playSfx('counter'); // プレイヤーの打ち返しと同じ音=同条件の文法
            // ★GHOST_BOSS.md v9 §3: 成立の絵は**プレイヤーのカウンター成立と同じ色文法**(青)+
            // 停止/揺れ/寄り。頻度の上限はパリィCD(1000ms)。弾かれた側=プレイヤーが得をする
            // 副作用(コンボ・無敵付与・CDリファンド・計測notify)は1つも呼ばない。
            spawnRing(gcx, gcy, 14, 135, 'rgba(56,189,248,0.9)', 3, 360);
            spawnBurst(gcx, gcy, '#38bdf8', 14);
            // glow も青文法の構成要素(検収監査v9指摘)。半径43=守護霊成立と同じ。
            useGameStore.getState().spawnGlow(gcx, gcy, 43, 'rgba(56,189,248,', 360);
            // 「Counter!」の文字も出す(社長裁定2026-08-20「幻影パリィにも文字出して」=v9未決の決着)。
            useGameStore.getState().spawnCallout(gcx, gcy - 12, 'Counter!', '#e0f2ff', { bg: 0x2563eb, holdMs: MELEE_FINISH_SLOW_HOLD_MS, duration: MELEE_FINISH_SLOW_MS });
            useGameStore.getState().triggerHitImpact(
              COUNTER_HITSTOP_MS, COUNTER_SHAKE_MS, COUNTER_SHAKE_MAG, COUNTER_ZOOM_MAG, gcx, gcy,
            );
          }
          // PACING_PUZZLE.md §7-11c(4): クリ計測口(挙動は変えない=数えるだけ)。護衛NPC/守護霊の弾は
          // プレイヤー起因ではないため除外(botTelemetryの他の計測=classifyProjectileDamageChannelと
          // 同じ除外方針)。headshotHit=PHILL頭部の確定クリ、それ以外のhitCrit成立はRNGクリ。
          if (!isGhostShot && !isEscortShot) {
            recordCritHit(hitCrit ? (headshotHit ? 'guaranteed' : 'rng') : 'none', isBoss);
          }
          // 護衛NPC/守護霊(ghost-gun・v0.25.2525で反射弾'ghost-reflect'も)の弾の被弾音も、発砲音と
          // 同じ距離減衰をかける(遠い味方の攻撃は被弾音も小さく/画面外は無音)。プレイヤー自身の弾は等倍(gain=1)。
          let hitSfxGain = 1;
          if ((projectile?.weaponKey === 'escort' || isGhostShot) && enemyForFx) {
            const hpl = collisionState.player;
            const hcam = useGameStore.getState().camera, hgb = useGameStore.getState().gameBounds;
            hitSfxGain = npcSfxDistGain(enemyForFx.x + enemyForFx.width / 2, enemyForFx.y + enemyForFx.height / 2, hpl.x + hpl.width / 2, hpl.y + hpl.height / 2, hcam, hgb);
          }
          if (!gpDeflectedShot) playSfx(hitCrit ? 'headshot' : 'shot-damage', hitSfxGain); // 幻影が弾いた弾は無音(v0.25.3640監査Q1-1)
          // 撃たれた対象の背中側(=弾の進行方向の出口)に「ドバッと火」破裂演出(2コマ立ち絵=プールsprite1枚で安い)。
          // 「敵1体につき直近 FIRE_JET_DEDUP_MS は1本」に間引く。ショットガン等の多弾(=見た目は単発)は近距離だと同一
          // フレーム、遠距離だと数フレームに分かれて命中するため、フレーム単位の間引きだけでは「2本生える」を防げない。
          const lastJetAt = fireJetEnemyAtRef.current.get(enemyId) ?? -Infinity;
          // 打ち返された弾は「当たっていない」ので火・血は出さない(v0.25.3665)。
          if (enemyForFx && projectile && !gpBulletReflected && !fireJetEnemiesThisFrame.has(enemyId) && fireNowMs - lastJetAt >= FIRE_JET_DEDUP_MS) {
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
            // 血飛沫(OP射撃シーンと同素材・3コマ100msずつ)。火の破裂と完全に同じ出口点(ox,oy)・
            // 同じ角度で噴く(社長指示v0.25.2024)。サイズは敵幅×4.0(最低96px・v0.25.2025でさらに2倍)。
            useGameStore.getState().spawnBlood(ox, oy, ang, Math.max(96, enemyForFx.width * 4.0));
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

          // v0.25.2957(社長指示「裏ボスのカウンター弾当たるとワープする仕様撤廃。もはや裏ボスにとって
          // カウンター弾は脅威ではない気がするので」): 反射弾ヒット時のワープ(プレイヤー反対側へ320px+
          // 0.5秒フェードイン)を撤去した。反射弾のダメージ自体は従来どおり通る。ワープの残骸として
          // bossRef.warpUntil / reaperWarpAlpha のフェード復帰(4520付近)は残っているが、この撤去で
          // warpUntil を立てる者が居なくなった=常に非ワープ。過去の除外(ミゲル/idolの絵消えバグ)ごと不要になった。

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
            isGrenadeGunKey(projectile?.weaponKey) && // v0.25.3290: rifle-t3+武器庫限定glauncher 3種
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
            useGameStore.getState().spawnExplosionFx(blastX, blastY, exRadius); // v0.25.3283: 爆発flipbook
            useGameStore.getState().spawnGlow(blastX, blastY, GLOW_R_S, 'rgba(251,146,60,', GRENADE_LAUNCHER_EXPLOSION_EFFECT_MS);

            const splashBase = dmg * GRENADE_BLAST_DAMAGE_MULT * exMult;
            const glWalls = aoeWalls(blastX, blastY);
            for (const splashEnemy of useGameStore.getState().enemies) {
              if (splashEnemy.id === enemyId || (splashEnemy.type === 'reaper' && !splashEnemy.reaperChaser)) continue;
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
            // §6.10 M33③: ボマー = グレネードランチャー弾(メインT3/タレットランチャー弾)の着弾爆発でも
            // 子グレネード3個を散布(手榴弾と同一仕様・再散布なし)。
            if (rollBomberScatter(skillPlayer)) { // v0.25.3306: 確率発動(30/40/50%)
              // ボマー覚醒(Lv3・v0.25.3300)=4つ
              for (const mini of buildBomberMinis(blastX, blastY, `gl-${projectileId}`, undefined, undefined, bomberMiniCount(skillPlayer))) addProjectile(mini);
              spawnBurst(blastX, blastY, '#fbbf24', 8);
            }
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
            // v0.25.2472: ゴースト発(ownerGhost=ゴースト設置タレットのランチャー弾のみ)は青白FX
            // (視覚のみ・判定/ダメージ不変。プレイヤーの弾はownerGhost未設定=従来色)。
            if (projectile.ownerGhost) {
              spawnRing(blastX, blastY, 8, exRadius, 'rgba(159,216,255,0.8)', 5, HEAVY_GRENADE_EXPLOSION_EFFECT_MS);
              spawnBurst(blastX, blastY, '#9fd8ff', 16);
              spawnBurst(blastX, blastY, '#1e3a5f', 6);
              useGameStore.getState().spawnExplosionFx(blastX, blastY, exRadius, 0x9fd8ff); // v0.25.3283: 爆発flipbook(ゴースト=青白)
              useGameStore.getState().spawnGlow(blastX, blastY, GLOW_R_XS, 'rgba(159,216,255,', HEAVY_GRENADE_EXPLOSION_EFFECT_MS);
            } else {
              spawnRing(blastX, blastY, 8, exRadius, 'rgba(251,146,60,0.8)', 5, HEAVY_GRENADE_EXPLOSION_EFFECT_MS);
              spawnBurst(blastX, blastY, '#f97316', 16);
              spawnBurst(blastX, blastY, '#7f1d1d', 6);
              useGameStore.getState().spawnGlow(blastX, blastY, GLOW_R_XS, 'rgba(251,146,60,', HEAVY_GRENADE_EXPLOSION_EFFECT_MS);
              useGameStore.getState().spawnExplosionFx(blastX, blastY, exRadius); // v0.25.3283: 爆発flipbook
            }
            const splashBase = dmg * (projectile.explodeDamageMult ?? 1) * exMult;
            const exWalls = aoeWalls(blastX, blastY);
            for (const splashEnemy of useGameStore.getState().enemies) {
              if (splashEnemy.id === enemyId || (splashEnemy.type === 'reaper' && !splashEnemy.reaperChaser)) continue;
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
            // 社長指示v0.25.3300 ボムカウンター覚醒(Lv3): 反射弾の爆発がノックバック実距離100pxを持ち、
            // 飛ばされた敵に1段パニッシュ効果が付く(パニッシャー未所持でも1次だけ巻き込む=
            // gameStore側のbombPunishUntilをmoversの資格に使う)。ボス系/重量級は従来どおり押さない。
            // エクスプローダー覚醒はこの爆発KBにも×1.5(距離)を乗せる。
            if (projectile.reflected && skillLevel(shotOwner, 'bomb-counter') >= 3) {
              const bpNow = Date.now();
              const bpSpeed = knockbackSpeedFor(BOMB_COUNTER_AWAKEN_KB_PX * skillExplosionKbMult(shotOwner), KNOCKBACK_DURATION);
              useGameStore.setState(state => ({
                enemies: state.enemies.map(en => {
                  if ((en.type === 'reaper' && !en.reaperChaser) || en.type === 'giantbat' || en.type === 'pumpkin') return en;
                  if (isBossType(en.type) || en.corpseUntil !== undefined || en.aiPhase === 'jump') return en;
                  const ecx = en.x + en.width / 2, ecy = en.y + en.height / 2;
                  const bd = Math.hypot(ecx - blastX, ecy - blastY);
                  if (bd > exRadius || bd < 0.001) return en;
                  if (exWalls.length > 0 && segmentBlocked(blastX, blastY, ecx, ecy, exWalls)) return en;
                  if (bpNow < (en.knockbackImmuneUntil ?? 0)) return en;
                  return {
                    ...en,
                    knockbackVx: ((ecx - blastX) / bd) * bpSpeed,
                    knockbackVy: ((ecy - blastY) / bd) * bpSpeed,
                    knockbackUntil: bpNow + KNOCKBACK_DURATION,
                    knockbackImmuneUntil: bpNow + KNOCKBACK_IMMUNE_MS,
                    bombPunishUntil: bpNow + KNOCKBACK_DURATION,
                  };
                }),
              }));
            }
            // スキル: ボマー = ホーミング弾命中時にも子グレネード3発を散布。
            if (projectile.weaponType === 'homing-missile' && !projectile.bomberSpawned && rollBomberScatter(skillPlayer)) { // v0.25.3306: 確率発動(30/40/50%)
              const nowB = Date.now();
              useGameStore.setState(state => ({
                projectiles: state.projectiles.map(p =>
                  p.id === projectileId ? { ...p, bomberSpawned: true } : p
                ),
              }));
              const homingMiniN = bomberMiniCount(skillPlayer); // ボマー覚醒(Lv3・v0.25.3300)=4つ
              for (let k = 0; k < homingMiniN; k++) {
                const ang = (Math.PI * 2 * k) / homingMiniN + Math.random() * 0.5;
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
          // 社長指示v0.25.3300 覚醒(Lv3): 跳弾からもう1回だけ抽選が入る(二次跳弾=ricochet2で打ち止め)。
          const ricochetLv = skillLevel(skillPlayer, 'ricochet');
          if (
            projectile && enemyForFx &&
            (!projectile.ricochet || (ricochetLv >= 3 && !projectile.ricochet2)) && !projectile.reflected &&
            !projectile.explodeOnHit && !isGrenadeGunKey(projectile.weaponKey) && // v0.25.3291: グレネード系全キー除外
            ricochetLv && Math.random() < [0, 0.2, 0.3, 0.4][ricochetLv]
          ) {
            const ox = enemyForFx.x + enemyForFx.width / 2;
            const oy = enemyForFx.y + enemyForFx.height / 2;
            let target: typeof enemyForFx | undefined;
            let bestD2 = Infinity;
            for (const other of useGameStore.getState().enemies) {
              if (other.id === enemyId || (other.type === 'reaper' && !other.reaperChaser)) continue;
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
                ...(projectile.ricochet ? { ricochet2: true } : {}), // 覚醒の二次跳弾=これ以上跳ねない
              });
              spawnBurst(ox, oy, '#fcd34d', 5);
            }
          }

          // SKILL_BUILD_REDESIGN.md §28(B7) スキル: エコーショット = クリ時50/75/100%(Lv)で同方向・
          // 同ダメの弾を複製して追加発射する。複製弾自身(echoed)は再複製しない(無限連鎖防止=
          // ricochetフラグと同じ役割)。反射弾/爆発弾/グレネードは対象外(跳弾と同じ除外方針)。
          const echoLv = skillLevel(skillPlayer, 'echo-shot');
          if (
            projectile && enemyForFx && hitCrit && !projectile.echoed && !projectile.reflected &&
            !projectile.explodeOnHit && !isGrenadeGunKey(projectile.weaponKey) && // v0.25.3291: グレネード系全キー除外
            echoLv && rollEchoShot(echoLv)
          ) {
            addProjectile({
              ...projectile,
              id: `proj-echo-${projectileId}-${Date.now()}`,
              createdAt: Date.now(),
              hitEnemies: [],
              echoed: true,
              // 社長指示v0.25.3300 エコーショット覚醒(Lv3): 複製弾に延焼を付与(延焼弾Lv1相当・命中側が適用)。
              ...(echoLv >= 3 ? { bonusIncendiary: true } : {}),
            });
            spawnBurst(enemyForFx.x + enemyForFx.width / 2, enemyForFx.y + enemyForFx.height / 2, '#67e8f9', 6);
          }

          // SKILL_BUILD_REDESIGN.md §28(B7) スキル: アイスショット = 命中した敵を鈍足化。
          // 社長裁定v0.25.3280: ボスも対象(強度のみ半分=ICE_SHOT_BOSS_EFFECT_MULT・時間はそのまま)。
          // 絵の分類②(氷片)/判定のみ(鈍足自体)。鈍足は通常敵=iceSlowMult(updateEnemies)・
          // ボス=bossSlowMult(全ボス移動経路の共通チョーク)が読む。
          const iceLv = skillLevel(skillPlayer, 'ice-shot');
          if (iceLv && enemyForFx && dmg > 0) {
            const iceSlow = iceShotSlowParams(iceLv);
            const icePct = isBossType(enemyForFx.type) ? iceSlow.pct * ICE_SHOT_BOSS_EFFECT_MULT : iceSlow.pct;
            const iceGameTime = gameTime;
            useGameStore.setState(state => ({
              enemies: state.enemies.map(e =>
                e.id === enemyId ? { ...e, iceSlowUntil: iceGameTime + iceSlow.ms, iceSlowPct: icePct } : e),
            }));
            // 社長指示v0.25.3277「アイスショットは発動したら氷のキラキラを(発動時だけね)」:
            // 鈍足が付いた瞬間だけ、氷色+白の小さな煌めきを一拍(分類②・既存粒子プールのみ)。
            const icx = enemyForFx.x + enemyForFx.width / 2, icy = enemyForFx.y + enemyForFx.height / 2;
            spawnBurst(icx, icy, '#bae6fd', 8);
            spawnBurst(icx, icy, '#f0f9ff', 4);
          }
          // アイスショット: キル時に氷片3個(直前ヒットのdmgの0.3倍)を放射状に飛ばす。
          // 社長指示v0.25.3301: 全Lv共通→**覚醒(Lv3)の効果**に変更。
          // 派手側(分類②)=既存の弾/バーストプールで安く描く(新規per-frame Graphicsなし)。
          if (iceLv >= 3 && enemyKilled && enemyForFx && !isBossType(enemyForFx.type)) {
            const shardDmg = Math.max(1, Math.round(dmg * ICE_SHOT_SHARD_DMG_MULT));
            const kx = enemyForFx.x + enemyForFx.width / 2, ky = enemyForFx.y + enemyForFx.height / 2;
            for (let k = 0; k < ICE_SHOT_SHARD_COUNT; k++) {
              const ang = (Math.PI * 2 * k) / ICE_SHOT_SHARD_COUNT + Math.random() * 0.5;
              addProjectile({
                id: `proj-iceshard-${enemyId}-${Date.now()}-${k}`,
                x: kx - 4, y: ky - 4, width: 8, height: 8,
                speed: 480,
                damage: shardDmg,
                direction: { x: Math.cos(ang), y: Math.sin(ang) },
                weaponType: 'handgun', weaponKey: 'skill-ice-shot',
                duration: 700, createdAt: Date.now(),
                passthrough: false, hitEnemies: [], hostile: false, reflected: false,
              });
            }
            spawnBurst(kx, ky, '#bae6fd', 14);
            spawnBurst(kx, ky, '#e0f2fe', 8);
            useGameStore.getState().spawnGlow(kx, ky, GLOW_R_S, 'rgba(125,211,252,', 260);
          }

          // SKILL_BUILD_REDESIGN.md §28(B7) スキル: 延焼弾 = 命中で燃焼(継続ダメージ)。Lv2から
          // 着弾地点に炎床(小=モロトフ資産流用)/Lv3は炎床(大)。炎床は「判定を持つ床」=分類①
          // (判定に絵を揃える・大きくしない=groundFires/molotovの資産に相乗りする・§28-2)。
          const incLv = skillLevel(skillPlayer, 'incendiary-round');
          // 社長指示v0.25.3300 覚醒の延焼付き弾(ラストマガジン=最後の1セット/エコーショット=複製弾):
          // 延焼弾Lv1相当の燃焼を付与。延焼弾も所持していればそちらのLvの燃焼が勝つ。炎床は延焼弾Lv2+のみ。
          const bonusBurn = !!projectile?.bonusIncendiary;
          if ((incLv || bonusBurn) && enemyForFx && dmg > 0) {
            const burn = incendiaryBurnParams(incLv > 0 ? incLv : 1);
            const incGameTime = gameTime;
            useGameStore.setState(state => ({
              enemies: state.enemies.map(e =>
                e.id === enemyId ? { ...e, burnUntil: incGameTime + burn.durationMs, burnDpsTick: burn.dps } : e),
            }));
            if (burn.floorRadius !== null && incGameTime >= incendiaryFloorNextAtRef.current) {
              incendiaryFloorNextAtRef.current = incGameTime + INCENDIARY_FLOOR_CD_MS;
              useGameStore.getState().spawnGroundFire(
                enemyForFx.x + enemyForFx.width / 2, enemyForFx.y + enemyForFx.height / 2,
                undefined, burn.floorRadius,
              );
            }
          }

          // Floating damage number at the enemy's body. Reflected bolts and
          // crits both render in the gold "big hit" color.
          // ダメージ0の弾(=味方の演出射撃)では数字を出さない。出すと敵の頭上に「0」が並んで
          // 援護が壊れて見える(社長指示v0.25.2293「味方は演出」の体裁を守る)。
          if (enemyForFx && dmg > 0 && !gpDeflectedShot) { // 幻影が弾いた弾は数字も出さない(v0.25.3640監査Q1-1)
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
          // v0.25.3494(社長裁定・案A): 型名のベタ書き(reaper/giantbat/pumpkin)をやめ
          // resistsChipKnockback へ一本化。旧リストは賞金首・裏ボスが編入される前のもので、
          // 実体は「城ボスだけ押されない」だった=小ボスが弾1発ごとに技を中断されていた。
          if (
            !enemyKilled && enemyForFx && projectile && dmg > 0 && // dmg 0(味方の演出射撃)は押さない=挙動に影響させない
            !resistsChipKnockback(enemyForFx.type)
          ) {
            const hitCount = projectileHitCountsByEnemy.get(enemyId) ?? 1;
            const pelletKnockback = projectile.weaponType === 'shotgun' ? 1.35 : 1;
            // PHILL銃の胴体(非ヘッドショット)命中は通常の2倍ノックバック。
            const phillBody = projectile.weaponType === 'phill-bullet' && headshot !== true;
            const baseKb = Math.min(3, hitCount * pelletKnockback);
            // 社長指示v0.25.3300 アタックシューター覚醒(Lv3): 銃弾のノックバックが近接と同じになる
            // (速度=KNOCKBACK_SPEED・免疫CD=KNOCKBACK_IMMUNE_MSも近接と同じ)。免疫CD中は従来の
            // 小突きノックバックに落とす(近接同様「CD中はKB無し」だと弾の手応えが消えるため)。
            const asAwakenKb = !isAllyOwnedShot && skillLevel(shotOwner, 'attack-shooter') >= 3
              && Date.now() >= (enemyForFx.knockbackImmuneUntil ?? 0);
            if (asAwakenKb) {
              const asNow = Date.now();
              const asDirX = projectile.direction.x, asDirY = projectile.direction.y;
              useGameStore.setState(state => ({
                enemies: state.enemies.map(en =>
                  en.id === enemyId && en.corpseUntil === undefined && asNow >= (en.knockbackImmuneUntil ?? 0)
                    ? {
                        ...en,
                        knockbackVx: asDirX * KNOCKBACK_SPEED,
                        knockbackVy: asDirY * KNOCKBACK_SPEED,
                        knockbackUntil: asNow + KNOCKBACK_DURATION,
                        knockbackImmuneUntil: asNow + KNOCKBACK_IMMUNE_MS,
                      }
                    : en),
              }));
            } else {
              useGameStore.getState().knockbackEnemy(
                enemyId,
                projectile.direction.x,
                projectile.direction.y,
                phillBody ? baseKb * 2 : baseKb
              );
            }
          }

          // Crit that didn't outright kill → stun the target so it can be
          // executed with a melee finisher. Mark it with a brief yellow ring.
          // CRIT-UNIFY §9.2: ボスは5秒完全停止(stunEnemy)にしない(v0.25.2422の変換漏れ=旧バグ)。
          // ボスの移動半減+CD2倍+紫蓄積はdamageEnemy側で既に中央適用済み(crit=hitCritを渡してある)。
          // 通常敵の気絶は不変(stunDurationMultを乗せた従来どおりの5秒スタン)。
          if (hitCrit && !enemyKilled && enemyForFx) {
            if (!isBoss) {
              // 気絶時間アップ(パッシブ): フィニッシュ受付時間を stunDurationMult 倍に。
              const stunMs = STUN_DURATION_MS * (useGameStore.getState().player.stunDurationMult ?? 1);
              useGameStore.getState().stunEnemy(enemyId, gameTime + stunMs);
            }
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
            const removeIt = gpBulletReflected
              ? false // ★v0.25.3665: 幻影が打ち返した弾は消さない(反転・敵対化してそのまま飛んでいく)
              : isGrenadeGunKey(projectile.weaponKey) // v0.25.3290: グレネード系銃の弾は着弾で必ず消える(爆発済み)
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
              const equippedAmmo = getActiveGun(player)?.ammoType;
              const owned = getGuns(player)
                .map(w => w.ammoType)
                .filter((t): t is AmmoType => !!t);
              // 弾薬AIディレクター(v0.25.2170): 「全所持銃の弾備蓄の枯渇度×敵の多さ」で基礎率を最大20%まで底上げ。
              // ?ammodir=0で無効化(常にmeleeAmmoDropPercentのまま)。
              // 弾薬ドロップ率アップ(パッシブ): 既定ドロップ率に ammoDropBonus を加算(0..1)。
              const dirPct = AMMO_DIRECTOR_ENABLED
                ? ammoDirectorRate(useGameStore.getState().meleeAmmoDropPercent, {
                    families: owned.filter(t => t !== 'phill').map(t => ({ reserve: ammoPoolFor(player, t), max: AMMO_MAX[t] })),
                    enemyCount: useGameStore.getState().enemies.length,
                  })
                : useGameStore.getState().meleeAmmoDropPercent;
              const gunKillDropRate = Math.max(0, Math.min(1,
                dirPct / 100 + (useGameStore.getState().player.ammoDropBonus ?? 0) + (useGameStore.getState().player.equipBonus?.ammoDropBonus ?? 0)
              ));
              // 研究所(屋内)は通常ドロップ無し: PHILL弾は固定3箇所＋近接フィニッシュのみ。
              // ナイフマスターは弾薬ドロップ0%(社長指示)。
              // M0(訓練)は弾を拾う教習まで抽選ドロップを封印(社長指示v0.25.2319・m0Unlocked.ammo)。
              if (
                !indoor && !hasSkill(player, 'knife-master')
                && useGameStore.getState().m0Unlocked.ammo
                && Math.random() < gunKillDropRate
              ) {
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
                  // v0.25.3291: 近接が当たった時は「装備tier+1」を落とす(rollWeaponKey側の新仕様)。
                  weaponKey: rollWeaponKey(
                    areaZoneIndexFor(Math.hypot(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2)),
                    useGameStore.getState().player.weapons.find(w => w.isMelee)?.tier ?? 1,
                    newGameTime, // v0.25.3328: Tier率も時間で迫る(8:00で最深部相当)
                  ),
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
        // PACING_PUZZLE.md §5.18 M17: ④地雷。src/utils/combatTick.ts へ切り出し。
        // 社長仕様v0.25.1846: 踏み=アーム(赤プクプク)のみ。ダメージは下の起爆ブロックが2秒後に適用。
        applyMineDamage(combatEffects);

        // 緑卵の起爆(社長仕様v0.25.1846「踏むと赤くプクプク→2秒後に爆発。範囲内の卵は連鎖起爆」)。
        // プレイヤー=従来値MINE_DAMAGE(34・無敵中は無効)/敵=同値を対称適用(社長「はい」・ボス系は
        // 手榴弾と同じ非致死)/範囲内の未アーム卵へ連鎖アーム(それぞれ2秒後に爆発)。壁遮蔽は
        // 半径80pxでは体感差が無いため見ない(センサー地雷との差=意図的な簡略)。
        {
          const egDue = dueArmedEggs(useGameStore.getState().breakableProps, newGameTime);
          if (egDue.length > 0) {
            const chainIds = new Set<string>();
            for (const egg of egDue) {
              const ex0 = egg.footX, ey0 = egg.footY - egg.height * 0.5;
              useGameStore.getState().damageBreakableProp(egg.id, 999); // 除去+destroyed登録(再生成防止)
              playSfx('bomb');
              spawnRing(ex0, ey0, 8, EGG_BLAST_RADIUS, 'rgba(248,113,113,0.85)', 4, 320);
              spawnBurst(ex0, ey0, '#ef4444', 14);
              spawnBurst(ex0, ey0, '#7f1d1d', 8);
              useGameStore.getState().spawnGlow(ex0, ey0, 42, 'rgba(248,113,113,', 300);
              // 社長指示v0.25.3444「(緑卵の)爆発エフェクトを前のヴィジュアルに戻して」: v3283で全爆発共通に
              // 乗せた爆発flipbook(spawnExplosionFx)を緑卵だけ外し、旧来のリング+バースト+グローへ戻す。
              const egP = useGameStore.getState().player;
              const egPcx = egP.x + egP.width / 2, egPcy = egP.y + egP.height / 2;
              const egPHalf = Math.max(egP.width, egP.height) / 2;
              if (Math.hypot(egPcx - ex0, egPcy - ey0) <= EGG_BLAST_RADIUS + egPHalf && !egP.invulnerable) {
                const egDied = useGameStore.getState().damagePlayer(MINE_DAMAGE, '地雷', ex0, ey0);
                playSfx('player-damage');
                spawnFlash('rgba(239,68,68,0.18)', 180);
                if (egDied) triggerPlayerDeath(egPcx, egPcy);
              }
              for (const enemy of useGameStore.getState().enemies) {
                if (enemy.type === 'reaper' && !enemy.reaperChaser) continue;
                const ecx = enemy.x + enemy.width / 2, ecy = enemy.y + enemy.height / 2;
                if (Math.hypot(ecx - ex0, ecy - ey0) > EGG_BLAST_RADIUS) continue;
                const egKilled = damageEnemy(enemy.id, MINE_DAMAGE, true);
                spawnDamageNumber(ecx, enemy.y, MINE_DAMAGE, false);
                spawnBurst(ecx, ecy, '#b91c1c', 4);
                if (egKilled) {
                  playEnemyDeath();
                  dropEnemyXp(enemy, ecx, ecy, 'pickup-xp-egg-blast');
                }
              }
              for (const c of eggsToChainArm(useGameStore.getState().breakableProps, egg.footX, egg.footY)) chainIds.add(c.id);
            }
            if (chainIds.size > 0) {
              useGameStore.setState(state => ({
                breakableProps: state.breakableProps.map(p => chainIds.has(p.id) ? { ...p, armedAt: newGameTime } : p),
              }));
            }
          }
        }

        // ワイヤーアンカーの毎フレーム処理。
        // フリックで刺す(triggerWireAnchor)→ 1秒後(wirePlantUntil)に startWireDash で高速移動開始 →
        // 移動中は無敵+敵すり抜け(すり抜けた敵へ近接小ダメージ)→ 着地点爆撃は Lv3 のみ(ダメージ付き)。
        //
        // v0.25.2518(research/GHOST_PARITY_LEDGER.md 裁定2「共有方式」): この状態機械の**主語を引数化**した
        // (wp=プレイヤー本体 or 守護霊の疑似Player / ghostId=守護霊のsummon.id)。守護霊用の簡易実装は
        // 作らず、無敵・硬直・離脱(ホップ)の防御規格まで同じ1本を通す。プレイヤー起因の挙動は不変
        // (ghostId未指定時は damageEnemy の既定引数も同値を明示で渡すだけ=1bitも変わらない)。
        const runWireAnchorTick = (wp: Player, ghostId?: string) => {
          const nowW = Date.now();
          const pcx = wp.x + wp.width / 2;
          const pcy = wp.y + wp.height / 2;
          const wireKey = ghostId ?? 'player'; // 着地/すり抜けの重複防止レジスタの引き当てキー
          // 除外4: ゴースト起因のSEは距離減衰(escortの前例=npcSfxDistGain)。プレイヤーは従来どおり等倍。
          const wireSfx = (key: 'bomb' | 'melee' | 'slash-damage', sx: number, sy: number) => {
            if (ghostId === undefined) { playSfx(key); return; }
            const ws = useGameStore.getState();
            const g = npcSfxDistGain(
              sx, sy, ws.player.x + ws.player.width / 2, ws.player.y + ws.player.height / 2, ws.camera, ws.gameBounds,
            );
            if (g > 0) playSfx(key, g);
          };
          // ゴースト起因は計測を汚さない(damageChannel=null)+ヘイトの起因を'ghost'にする
          // (既存のゴースト銃/近接と同じ分離方針)。プレイヤーは既定値と同値。
          const wireChannel: 'other' | null = ghostId === undefined ? 'other' : null;
          const wireHate = ghostId === undefined ? 'player' : 'ghost';
          // 斬り下ろし対象の後片付け(主語ごとに宛先が違うだけ)。
          const clearWireSlam = () => {
            if (ghostId === undefined) {
              useGameStore.setState({ player: { ...useGameStore.getState().player, wireSlamEnemyId: '', wireSlamStart: 0 } });
              return;
            }
            useGameStore.setState(s => ({
              summons: s.summons.map(x => x.id === ghostId
                ? { ...x, ghostDash: { ...dashStateOf(x.ghostDash), wireSlamEnemyId: '', wireSlamStart: 0 } }
                : x),
            }));
          };
          // §6.10 M33⑨: ダメージ基準を素のmelee.damageから meleeDamage(strikerMeleeMult×装備damageMult込み)へ
          // (他の近接派生=刀/鞭/分身/ドローンと同じ基準)。
          // §6.10 M33②: skillOutgoingDamageMult(バーサーカー等)もワイヤー(すり抜け/Lv3爆撃/大技)に乗算。
          const meleeDmg = (wp.weapons.find(w => w.isMelee)?.damage ?? 6) * strikerMeleeMult(wp) * (wp.equipBonus?.damageMult ?? 1) * skillOutgoingDamageMult(wp);
          // 刺し待ち(1秒)が明けたら、その地点へ自動で高速移動を開始する。
          if (wp.wireAnchored && nowW >= wp.wirePlantUntil) {
            useGameStore.getState().startWireDash(ghostId);
          }
          // ワイヤーダッシュ中: すり抜けた敵に攻撃(1ダッシュにつき敵1回)。
          // Lv1/2 = 近接小ダメージ。Lv3 = すり抜け攻撃が「爆発」化(通過した敵を中心に小範囲AoE・社長指示)。
          if (wp.wireDashUntil > 0 && nowW < wp.wireDashUntil) {
            if (wirePassHitRef.current[wireKey]?.dash !== wp.wireDashUntil) {
              wirePassHitRef.current[wireKey] = { dash: wp.wireDashUntil, ids: new Set() };
            }
            const seen = wirePassHitRef.current[wireKey].ids;
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
                useGameStore.getState().spawnExplosionFx(ecx, ecy, WIRE_PASS_BOMB_RADIUS); // v0.25.3283: 爆発flipbook
                aoe.forEach(o => {
                  const oxc = o.x + o.width / 2, oyc = o.y + o.height / 2;
                  const killed = useGameStore.getState().damageEnemy(o.id, dmg, true, false, false, wireChannel, wireHate); // 爆発=ボス非致死
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
                wireSfx('bomb', ecx, ecy);
                continue;
              }
              const killed = useGameStore.getState().damageEnemy(e.id, dmg, false, false, false, wireChannel, wireHate);
              spawnDamageNumber(ecx, e.y, dmg, false);
              useGameStore.getState().spawnSlash(ecx, ecy, 'rgba(186,230,253,0.95)');
              useGameStore.getState().spawnMeleeBlood(ecx, ecy, e.width); // 近接の血飛沫(v0.25.2026)
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
          if (wp.wireDashUntil > 0 && nowW >= wp.wireDashUntil && wireLandedDashRef.current[wireKey] !== wp.wireDashUntil) {
            wireLandedDashRef.current[wireKey] = wp.wireDashUntil;
            // 大技(敵に刺さって引き上げた)の着地: 斬り下ろし対象を「ぶった切る」。通常敵=即死フィニッシュ、
            // ボスは即死せず近接フィニッシュ相当(×5)ダメージ。垂直スラッシュ演出付き。続けて下の着地ノックバックも走る。
            // ホップ(DEVELOPMENT_LOG v0.25.2487): 斬り下ろし後もこの対象が生きていた(=実質ボス)場合の
            // みホップする。判定は「名前で判断せず、判定コードを確認」(CLAUDE.md)に合わせ、isBossType
            // 決め打ちではなくダメージ適用後の実health>0で見る(通常敵は即死フィニッシュなので必然的に対象外)。
            let wireHopTargetId = '';
            if (wp.wireSlamEnemyId) {
              const tgt = useGameStore.getState().enemies.find(e => e.id === wp.wireSlamEnemyId);
              if (tgt && tgt.health > 0) {
                const tcx = tgt.x + tgt.width / 2, tcy = tgt.y + tgt.height / 2;
                if (isBossType(tgt.type)) {
                  const bdmg = Math.max(1, Math.round(meleeDmg * BOSS_MELEE_STUN_MULT));
                  // §5.21-追補4: フィニッシュ相当ダメージなのでviaMeleeFinish=true
                  // (nonLethalBoss=trueで即死自体は元々しない)。
                  const postureFatal = wireHate === 'player' && isBossPostureBroken(tgt, gameTime);
                  const wireHitDamage = postureFatal ? meleeDmg : bdmg;
                  useGameStore.getState().damageEnemy(tgt.id, wireHitDamage, true, false, true, wireChannel, wireHate, wireHate === 'player' ? 'heavy' : null); // ボス非致死
                  spawnDamageNumber(tcx, tgt.y, wireHitDamage, true);
                } else {
                  useGameStore.getState().damageEnemy(tgt.id, tgt.health + 1, false, false, true, wireChannel, wireHate); // 即死フィニッシュ
                }
                useGameStore.getState().spawnSlash(tcx, tcy - 12, 'rgba(186,230,253,0.98)'); // 縦の斬り下ろし
                useGameStore.getState().spawnSlash(tcx, tcy + 12, 'rgba(147,197,253,0.9)');
                useGameStore.getState().spawnMeleeBlood(tcx, tcy, tgt.width); // 近接の血飛沫(v0.25.2026)
                spawnBurst(tcx, tcy, '#bae6fd', 14);
                wireSfx('slash-damage', tcx, tcy);
              }
              // ダメージ適用後の生存を再確認(通常敵はここで既にhealth<=0=対象外のまま)。
              const survivor = useGameStore.getState().enemies.find(e => e.id === wp.wireSlamEnemyId);
              if (WIRE_HOP_ENABLED && survivor && survivor.health > 0) wireHopTargetId = survivor.id;
              clearWireSlam();
            }
            const lvl = Math.max(1, Math.min(3, wp.subWeaponLevels['wire-anchor'] ?? 1));
            const explode = lvl >= 3;
            // §6.10 M33④: エクスプローダーをワイヤーLv3爆撃(半径+ダメージ)にも適用(Lv1/2の弾きのみは従来どおり)。
            const wireExMult = explode ? skillExplosionMult(wp) : 1;
            const wireBombR = WIRE_BOMB_RADIUS * wireExMult;
            const dmg = meleeDmg * WIRE_BOMB_DAMAGE_MULT * wireExMult;
            // 着地は全Lvで周囲の敵を「強制ノックバック」(無敵無視で必ず弾く・社長指示)。
            // 直前のすり抜けで knockbackImmuneUntil が立つため、ゲートすると着地で弾かなくなっていた。
            // Lv3 はさらに範囲ダメージ(ボス系は非致死)。
            // エクスプローダー覚醒(Lv3・v0.25.3300): 爆発KB距離×1.5(爆撃=explode時のみ。Lv1/2の弾きは対象外)。
            const kbSpeed = WIRE_LAND_KNOCKBACK_SPEED * (explode ? 1.5 * skillExplosionKbMult(wp) : 1);
            const hits = useGameStore.getState().enemies.filter(e => {
              if (e.aiPhase === 'jump') return false; // 空中無敵は対象外
              if (isCorpse(e)) return false; // KILL吹き飛び(死体・§26-2): 着地の強制ノックバック対象から除外
              const ecx = e.x + e.width / 2, ecy = e.y + e.height / 2;
              return Math.hypot(ecx - pcx, ecy - pcy) <= wireBombR + Math.max(e.width, e.height) / 2;
            });
            hits.forEach(e => {
              const ecx = e.x + e.width / 2, ecy = e.y + e.height / 2;
              const dx = ecx - pcx, dy = ecy - pcy;
              const dist = Math.hypot(dx, dy) || 1;
              const killed = explode ? useGameStore.getState().damageEnemy(e.id, dmg, true, false, false, wireChannel, wireHate) : false;
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
              spawnRing(pcx, pcy, 10, wireBombR, 'rgba(147,197,253,0.95)', 5, 360);
              spawnBurst(pcx, pcy, '#93c5fd', 24);
              spawnBurst(pcx, pcy, '#dbeafe', 14);
              wireSfx('bomb', pcx, pcy);
            } else {
              // Lv1/2: 範囲ダメージは無いが、着地の強制ノックバックは効く。リングは弾き範囲に合わせる。
              spawnRing(pcx, pcy, 10, WIRE_BOMB_RADIUS, 'rgba(147,197,253,0.7)', 3, 280);
              spawnBurst(pcx, pcy, '#93c5fd', 10);
              wireSfx('melee', pcx, pcy);
            }
            // スラム後ジャンプ離脱(ホップ): 上の着地処理(斬り下ろし/爆撃/強制ノックバック)を全部
            // 従来位置で終えた後、対象が生き残っていた時だけ開始する。wireDashUntil/wireAnchorXは
            // 触らないため、この着地処理が再発火することはない(startWireHopは専用フィールドのみ書く)。
            if (wireHopTargetId) {
              const hopTarget = useGameStore.getState().enemies.find(e => e.id === wireHopTargetId);
              if (hopTarget) {
                const landing = computeWireHopLanding({
                  targetCenterX: hopTarget.x + hopTarget.width / 2,
                  targetCenterY: hopTarget.y + hopTarget.height / 2,
                  targetHalfDiag: targetHalfDiagonal(hopTarget.width, hopTarget.height),
                  playerHalfWidth: wp.width / 2,
                  margin: WIRE_HOP_MARGIN,
                  fromX: wp.wireSlamFromX,
                  fromY: wp.wireSlamFromY,
                });
                useGameStore.getState().startWireHop(landing.x, landing.y, ghostId);
              }
            }
          }
        };
        // 主語ごとに1回ずつ回す。プレイヤーは従来と同じ位置・同じ順序。
        runWireAnchorTick(useGameStore.getState().player);
        // 守護霊(ビルドにwire-anchorを持つ時だけ実質動く。持たない/未使用なら全分岐が素通り)。
        {
          const wireGhost = useGameStore.getState().summons.find(s => s.kind === 'ghost-ally');
          if (wireGhost) {
            const wireGhostActor = combatActorPlayer(wireGhost.id);
            if (wireGhostActor) runWireAnchorTick(wireGhostActor, wireGhost.id);
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
        // v0.25.2480(★未決1解消): 城ボス系(giantbat=城ボス/グレン)の守護霊カウンター請求は、
        // per-bossの状態機械閉包を持たない(プレイヤー側=上のapplyContactDamage内dashParried)ため、
        // 同じフェーズ表・同じ中断/ノックバック変換の合流点(combatTick)で解決する。呼び出し位置は
        // applyContactDamageの直後=プレイヤーの接触カウンターが先に解決される(同フレーム競合は
        // プレイヤー優先・プレイヤーが弾いた後はaiPhase解除済みで請求は流れる)。
        {
          const gpNow = Date.now();
          const gpState = useGameStore.getState();
          const gpPcx = gpState.player.x + gpState.player.width / 2;
          const gpPcy = gpState.player.y + gpState.player.height / 2;
          applyGhostBossParry(gpNow, (k, g) => playSfx(k, g),
            (x, y) => npcSfxDistGain(x, y, gpPcx, gpPcy, gpState.camera, gpState.gameBounds));
        }
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
              // v0.25.2514(監査項目7): 被弾ノックバックの向き=ダメージ源(接触した敵)の中心。
              // 同フレームに複数体が触れている場合は最大ダメージを出した敵を源とする(perSummonの畳み込みと同じ基準)。
              const hitFrom = summonHits
                .filter(h => h.summonId === summonId)
                .reduce<{ enemyId: string; damage: number } | null>((best, h) => (best === null || h.damage > best.damage ? h : best), null);
              const fromEnemy = hitFrom ? enemies.find(e => e.id === hitFrom.enemyId) : undefined;
              useGameStore.getState().damageSummon(summonId, dmg,
                fromEnemy ? fromEnemy.x + fromEnemy.width / 2 : undefined,
                fromEnemy ? fromEnemy.y + fromEnemy.height / 2 : undefined,
                `contact:${fromEnemy?.type ?? 'unknown'}`);
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
        // スキル マグネット(§6.8 M31): 弾薬ピックアップのみ拾得範囲 ×1.1/1.2/1.3(Lv)。
        // v0.25.2563(§2.11追補3の裏返し): **守護霊が自分で投げた物**(ownerGhostId付き=クイック
        // マガジン)はプレイヤーの拾得対象から外す。世界のドロップではなく本人の設置物で、拾うのも本人
        // (守護霊は世界の物に触れない/プレイヤーは守護霊の物を取らない=2人分が独立)。
        // 守護霊が居ないランでは1件も該当しない=従来と1bit同じ。
        const collPickups = useGameStore.getState().pickups.filter(p => p.ownerGhostId === undefined);
        // マグネット仕様変更(v0.25.3300): 拡大対象=弾薬+コイン。覚醒(Lv3)=アイテム・経験値も。
        const pickupCollisions = checkPlayerPickupCollisions(collPlayer, collPickups, skillMagnetAmmoRangeMult(collPlayer), skillLevel(collPlayer, 'magnet') >= 3);

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
                case 'bounty-chest':
                  // §6.38 B3(社長裁定「金箱は閃光で」): 開き絵は作らず、白フラッシュ+バーストの
                  // 閃光だけで開封を表現する(秘密兵器箱の演出機構=リング/バースト/グローは流用しつつ、
                  // 色だけ武器箱の青ではなく白+金に差し替え)。
                  spawnFlash('rgba(255,255,255,0.8)', 260);
                  spawnRing(
                    player.x + player.width / 2,
                    player.y + player.height / 2,
                    10, 130, 'rgba(251,191,36,0.9)', 5, 460
                  );
                  spawnBurst(pk.x + 8, pk.y + 8, '#fef3c7', 22);
                  spawnBurst(pk.x + 8, pk.y + 8, '#fbbf24', 12);
                  useGameStore.getState().spawnGlow(pk.x + 8, pk.y + 8, 44, 'rgba(251,191,36,', 360);
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
        // フレアガンのCD明け: ブーメランと同型(サブウェポン共通の「明けた瞬間だけ一瞬通知」・社長指示v0.25.2155)。
        {
          const hasFlare = player.subWeapons.includes('flare-gun') && !subWeaponBlockedByKatana(player, 'flare-gun');
          const ready = hasFlare && gameTime >= (player.subWeaponCooldowns['flare-gun'] ?? 0);
          if (ready && !flareReadyRef.current) {
            playSfx('reload', 1, 300);
            useGameStore.setState({ flareReadyFxAt: Date.now() });
          }
          flareReadyRef.current = ready;
        }
        // スキル: 弁慶のCD明け(再発動可)を not-ready→ready の瞬間に検出して
        // プレイヤー頭上に短いフラッシュ(描画のみ・スロー無し・~0.6s)。
        // ★v0.25.3623(社長指示「弁慶アイコンに変えよう」): 旧「閃き」テキストcalloutを廃止し、
        // スキルシートの弁慶アイコンを頭上に出す(描画はpixiScene.updateBenkeiReadyMark・ブーメラン型)。
        {
          const hasBenkei = hasSkill(player, 'benkei');
          const benkeiReady = hasBenkei && gameTime >= player.benkeiCdUntil;
          if (benkeiReady && !benkeiReadyRef.current) {
            const bx = player.x + player.width / 2;
            const by = player.y - 18;
            spawnRing(bx, by, 6, 38, 'rgba(250,204,21,0.9)', 2, 600);
            useGameStore.getState().spawnGlow(bx, by, 30, 'rgba(250,204,21,', 600);
            useGameStore.setState({ benkeiReadyFxAt: Date.now() });
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
          if (gs.junkShotFxAt > junkShotFxRef.current) { junkShotFxRef.current = gs.junkShotFxAt; playSfx('shotgun-fire'); } // ジャンクウェポン=ショットガン発砲音(§6.7 M30)
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
        // 到達済みXの更新(M2のみ使用)。プレイヤーの現在Xで範囲を広げていく。
        if (labTheme) {
          const v = labVisitedRef.current;
          labVisitedRef.current = v
            ? { minX: Math.min(v.minX, player.x), maxX: Math.max(v.maxX, player.x) }
            : { minX: player.x, maxX: player.x };
          // ゴール(書類)の左右。出撃ごとに1回だけピックアップから拾って覚える(以後は再走査しない)。
          if (labGoalSideRef.current === 0) {
            const doc = useGameStore.getState().pickups.find(p => p.type === 'lab-clear-item');
            if (doc) labGoalSideRef.current = Math.sign(doc.x) || 1;
          }
        }
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
        // AIディレクター ステップB(★v0.25.3525で既定ONへ・社長指示「まずリラックスはおこる様にして」):
        // 直前フレームで算出済みの DirectorState(macro)を読み、RELAX中だけ「escalationを止める/
        // 湧き間隔を伸ばす(1.35倍)/湧き上限を下げる(0.85倍)」を薄く掛ける。既存の敵を強制的に間引く
        // カリング上限(enemyCap)には触れない=急に画面から消える演出を避ける。屋内/ラボは対象外。
        // `?directorApply=off` で従来の基準点(適用なし)へ戻せる。
        const directorApplyRelaxActive = DIRECTOR_APPLY_RELAX && !labTheme && !indoor;
        // ★v0.25.3548(社長裁定「収穫でリラックス効かせない」): 現在のコマ種別を渡す。
        // 収穫コマでは relaxSpawnAdjust が中立(全て1)を返す=台本の「稼ぐ40秒」をディレクターが緩めない。
        const relaxAdj = directorApplyRelaxActive
          ? relaxSpawnAdjust(directorRef.current.state.macro, puzzleKomaRef.current.kind)
          : { escMult: 1, intervalMult: 1, capMult: 1 };
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
        // B5(SKILL_BUILD_REDESIGN.md §21-1点2/§11-1 A-8): skillCountの入力をplayer.skills.length→
        // runBuild.lengthへ切替(係数もdifficultyScaler.ts側で1.0→0.5・cap+3.0へ切替済み)。
        const ddaActive = DDA_ENABLED && !labTheme && !indoor;
        const ddaInputs = {
          level: player.level,
          weaponTierSum: player.weapons.reduce((s, w) => s + (w.tier ?? 1), 0),
          maxHealth: player.maxHealth,
          // research/GROWTH.md v4(社長裁定Q3=A案): 参照HPは「そのランの profile.maxHp+育成HP加算」の
          // 焼き値。装備HPは基準に含めないので、装備の寄与は従来どおりPPに乗る。
          baseMaxHealth: player.ddaBaseHp,
          equippedCount: [player.equipment.body, player.equipment.arms, player.equipment.accessory].filter(Boolean).length,
          skillCount: useGameStore.getState().runBuild.length,
        };
        const buildEsc = ddaActive ? spawnEscalation(ddaInputs, gameTime, curPhase.kind === 'gate') : 0;
        // ★案0(社長指示v0.25.3530「まず案0」): **戦力マージンを画面に出す**。読むだけ=挙動は不変。
        // 難易度③は「実PP ÷ その時刻の期待PP」が1.1を超えた分だけ働くが、期待PPは1分あたり4.2ずつ
        // 上限なく伸びるのに実PPは5項目中3つに上限があるため、通常プレイ(5〜7分)では一度も
        // 立ち上がっていない疑いが強い。**較正されていない数字を実測せずにいじらない**ための計器。
        setDirectorPower({
          pp: playerPower(ddaInputs),
          expected: expectedPower(gameTime),
          margin: powerMargin(ddaInputs, gameTime),
          esc: buildEsc,
        });
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
        // 洋館通路はカメラ側の増量(CORRIDOR_CAMERA_DOWN_FRAC)と同値で連動(v0.25.2148・ズレると上端で湧きが見える)。
        // §6.37 v6/v7: 引き連動の増量分+縦のボス先読み(camBossLeadYRef)もカメラと**同じ値**で連動させる
        // (v2148の教訓のズーム版。カメラより多くずらすと下端で、少なくずらすと上端で、湧きが画面内に見える)。
        // 監査v0.25.3008: カメラ側(camDownOff)と**完全に同じ式**にする。旧実装は括弧の位置が違い、
        // lab/屋内では先読み項(camBossLeadYRef・屋内遷移後1〜2秒は減衰中で非0)が湧き帯に乗らず、
        // カメラだけずれる=v2148型の「上端で湧きが見える」が遷移直後に再現していた。
        const spawnViewOffsetY = ((labTheme || indoor) ? 0
          : gameBounds.height * zoomCameraDownFrac(
              useGameStore.getState().corridorMode ? CORRIDOR_CAMERA_DOWN_FRAC : CAMERA_DOWN_OFFSET_FRAC,
              camBossZoomRef.current.z))
          + camBossLeadYRef.current;
        // 文脈カメラズームで引いている分だけ、湧き位置を外へ広げる(引いても画面外に湧かせる・社長指示)。
        // ボス交戦域では距離によって最大0.58まで動くため最深値を安全側に採る。通常時は従来の純関数どおり。
        const bossCameraMayPull = allEnemiesNow.some(e => {
          if (!isEngageableBoss(e.type) || e.dormant === true) return false;
          const dx = e.x + e.width / 2 - zpcx, dy = e.y + e.height / 2 - zpcy;
          const bossCameraRange = bossEngagementDistancePx(e.type, true, e.isStoryBoss === true);
          return dx * dx + dy * dy <= bossCameraRange * bossCameraRange;
        });
        const spawnZoomTarget = bossCameraMayPull
          ? ZOOM_MIN_ABS
          : contextZoomTarget(nearEnemies.length, nearEnemies.some(e => isLargeForZoom(e.type)));
        const czInvZoom = (labTheme || indoor) ? 1 : 1 / spawnZoomTarget;
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
          !noSpawn && // ?nospawn=1 デバッグ: 旧スポナーも止める(社長試作v0.25.1861)
          !storyBoss && // ストーリーボス専用ラン(M7/EX)は通常湧きなし(統合正本10.3)
          !tutorialStage && // チュートリアルは自動湧きなし(イベント湧きのみ予定・社長指示)
          !confining &&
          !bossChasingNow && // 裏ボスが画面内で追跡中だけ通常湧きを止める(非追跡=画面外/帰巣中は湧く・社長指摘)
          !puzzleActiveNow &&
          fieldCount < normalSpawnCap &&
          timestamp - lastEnemySpawnRef.current > getEnemySpawnInterval(gameTime) * (
            labTheme
              // ゴールと逆側に居る間だけ間引きを外す(社長指示v0.25.2248)。
              ? (isAwayFromLabGoal(player.x, labGoalSideRef.current) ? LAB_SPAWN_INTERVAL_MULT_AWAY : LAB_SPAWN_INTERVAL_MULT)
              : 1
          ) * sceneIntervalMult
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
              // 湧き位置は画面外の左右のみに限定し、上下方向のオフスクリーン湧きは廃止する
              // (社長指示v0.25.2182「M2では敵が上下から湧かず、左右からのみ」)。
              // generateEnemy が選んだ上下辺の位置を破棄し、左右いずれかの画面外(OFFSCREEN_SPAWN_MARGIN
              // は通常敵と同じ値を流用)へ、Yはプレイヤー到達域(廊下帯)±LAB_SPAWN_Y_BAND_PX で置き直す。
              // 置き直しは placeLabSpawn(共有純関数)に一本化。Yは**歩ける帯の中**に限定する
              // (旧実装は player.y 基準 ±100 だったため、プレイヤーが帯の端にいると帯の外=行けない
              //  場所に湧いていた。社長指示v0.25.2242「自由移動範囲内でのみスポーン」)。
              // 既に居る敵の視界(中心+aggroRange)。この円の中には湧かせない(社長指示v0.25.2245)。
              const labVisionCircles = useGameStore.getState().enemies
                .filter(e => e.aggroRange !== undefined)
                .map(e => ({ x: e.x + e.width / 2, y: e.y + e.height / 2, r: e.aggroRange as number }));
              const placed = placeLabSpawn(
                player.x, spawnBounds.width / 2, OFFSCREEN_SPAWN_MARGIN,
                labEnemy.width, labEnemy.height, LAB_CORRIDOR_Y_LIMIT_PX,
                labVisitedRef.current, labVisionCircles,
              );
              if (!placed) continue; // 両側とも通った道=湧かせない(社長指示v0.25.2244)
              labEnemy.x = placed.x;
              labEnemy.y = placed.y;
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
            // 洋館通路(corridorMode): 移動不可エリアに敵を沸かせない(社長指示v0.25.2391「ステージ2に
            // 限らず」)。プレイヤー移動と同じ帯定義(clampRectToPlayableArea)へ寄せる。ここは通常湧き
            // だけが通る経路(ボス/固定/イベント敵はspawnEnemyAt直呼びで別経路=対象外)。
            // `?spawnclamp=0`で従来の挙動(帯の外にも湧きうる)へ戻せる。
            if (SPAWN_CLAMP_ENABLED && useGameStore.getState().corridorMode) {
              const placed = clampRectToPlayableArea(enemy.x, enemy.y, enemy.width, enemy.height, {
                farBackdrop: loopState.farBackdrop,
                labTheme,
                corridorMode: true,
                m0AdvanceLimitX: null,
                corridorRunInActive: useGameStore.getState().corridorRunInActive,
              });
              enemy.x = placed.x;
              enemy.y = placed.y;
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
        if (!noSpawn) runKomaBoardMaintenance( // ?nospawn=1 デバッグ: パズル盤面の湧きも止める(社長試作v0.25.1861)
          {
            puzzleKomaRef, puzzleHitRef, puzzleClockRef, puzzleCdRef, puzzleSoftenRef, directorRef, namedFoeRef,
            rankPaceRef,
          },
          {
            puzzleActiveNow, gameTime, deltaTime, player, playerAreaIdx, spawnBounds, spawnViewOffsetY, snowTheme, spawnEsc,
            // v0.25.3495(社長指示「リラックスさせて」): RELAXの湧きレバー2本(間隔/上限)を
            // 本方式のスポーナーへも渡す。?directorApply が無ければ relaxAdj は全て1=挙動不変。
            relaxIntervalMult: relaxAdj.intervalMult, relaxCapMult: relaxAdj.capMult,
          }
        );

        // BOT_AND_GHOST.md G1(計測)+G2(デバッグ召喚)。**puzzleActiveNow/NOSPAWNに関係なく毎tick呼ぶ**
        // (runKomaBoardMaintenanceはスケジュール上のボスフェーズ時間帯だと即returnするため、そちらへ
        // 相乗りさせると城ボス戦で1度も発火しない=directorTick.ts側のコメント参照)。
        runGhostAndTraitsStep(
          { ghostProfileRef },
          { gameTime, player, ghostDebugEnabled: GHOST_DEBUG_ENABLED },
        );

        // Air-dropped ammo supplies (#3). At an irregular cadence a resupply
        // crate appears at a random spot just off-screen, so the player has to
        // break position to go fetch it — guided there by the VS-style edge
        // arrow the renderer draws for worldDrop pickups. Capped so the field
        // never clutters with crates. gameTime-based so pauses don't cheat it.
        // 判定・配置ロジックは src/utils/ammoAirdrop.ts の純関数へ切り出し済み(v0.25.2172・
        // ヘッドレス側 playtestDriver.ts と共用。挙動保存=式・間隔・確率は全て従来と同一)。
        const worldAmmoCount = pickups.filter(
          p => p.worldDrop &&
            (p.type === 'ammo-handgun' || p.type === 'ammo-shotgun' || p.type === 'ammo-rifle')
        ).length;
        const airdropTick = shouldSpawnAirdrop({
          tutorialStage, // チュートリアルはアイテム(弾薬エアドロップ)も無し(社長指示v0.25.1818)
          knifeMaster: hasSkill(useGameStore.getState().player, 'knife-master'), // ナイフマスターは弾薬ドロップ0%(社長指示)
          gameTime,
          worldAmmoCount,
          lastAmmoDropAt: lastAmmoDropRef.current,
          nextAmmoDropDelayMs: nextAmmoDropDelayRef.current,
          playerX: player.x, playerY: player.y, playerWidth: player.width, playerHeight: player.height,
          boundsWidth: gameBounds.width, boundsHeight: gameBounds.height,
          ownedAmmoTypes: getGuns(player).map(w => w.ammoType).filter((t): t is AmmoType => !!t),
          equippedAmmo: getActiveGun(player)?.ammoType,
          rng: Math.random,
        });
        nextAmmoDropDelayRef.current = airdropTick.nextAmmoDropDelayMs;
        if (airdropTick.spawn) {
          const { x: px, y: py, ammoType: dropType } = airdropTick.spawn;
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
          !tutorialStage && // チュートリアルはアイテム(武器箱の定期投下)も無し(社長指示v0.25.1818)
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
        if (SETPIECE_ENABLED && !danceTest && !indoor && !labTheme && !storyBoss && !confining) {
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
          labVisited: labVisitedRef.current,
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
          useGameStore.getState().spawnGlow(cx, cy, GLOW_R_XL, 'rgba(253,224,71,', 620);
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

        // SKILL_BUILD_REDESIGN.md §24: 覚醒(スキルLv3到達)のSEエッジ検出。バースト(pixi)とHUD帯の
        // 発火/多重デバウンスはgameStore.selectUpgrade側(levelUp()のイントロ演出=triggerTimeSlow/
        // spawnRing/spawnGlow直呼びと同じ型・ヘッドレスで検証できる)で確定済み。ここは`awakenCutin`
        // (参照が変わる=新規発火の時だけ)を見てSEだけ鳴らす(gameStoreはaudioManagerに依存しない
        // 既存方針=playSfxを一切importしないため、SE再生はここが唯一の持ち場)。
        {
          const cutin = useGameStore.getState().awakenCutin;
          if (cutin && cutin !== prevAwakenCutinRef.current) {
            prevAwakenCutinRef.current = cutin;
            // SE: 専用素材が届くまで既存の最も派手な金系(MissionSelect.tsxのガチャ super 確定と
            // 同じ組み合わせ=heavy-impact本体+event-clearの号砲)を流用。差し替えは1行。
            playSfx('heavy-impact');
            playSfx('event-clear');
          }
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
          // SKILL_BUILD_REDESIGN.md §28-1(社長指示・全Lv): 自分中心爆発を大爆発に(半径×1.8=叩き台)。
          const bcLv2 = skillLevel(currentPlayer, 'bomb-counter');
          if (bcLv2) {
            const bcRadiusMult = [0, 1, 1.15, 1.3][bcLv2];
            const bcDmgMult = [0, 1, 1.25, 1.5][bcLv2];
            const bcx = currentPlayer.x + currentPlayer.width / 2;
            const bcy = currentPlayer.y + currentPlayer.height / 2;
            const exMult = skillExplosionMult(currentPlayer);
            const radius = GRENADE_BLAST_RADIUS * exMult * bcRadiusMult * BOMB_COUNTER_SELF_BLAST_RADIUS_MULT;
            // §6.10 M33②: skillOutgoingDamageMult(バーサーカー等)をボムカウンター爆発にも乗算。
            const base = BOMB_COUNTER_BLAST_DAMAGE * exMult * bcDmgMult * (currentPlayer.equipBonus?.damageMult ?? 1) * skillOutgoingDamageMult(currentPlayer);
            spawnRing(bcx, bcy, 10, radius, 'rgba(251,146,60,0.85)', 5, 380);
            spawnBurst(bcx, bcy, '#f97316', 20);
            spawnBurst(bcx, bcy, '#7f1d1d', 8);
            useGameStore.getState().spawnGlow(bcx, bcy, GLOW_R_S, 'rgba(251,146,60,', 380);
            useGameStore.getState().spawnExplosionFx(bcx, bcy, radius); // v0.25.3283: 爆発flipbook(全爆発共通)
            playSfx('bomb');
            // 社長指示v0.25.3270: 反射神経と揃えて実距離50pxノックバック(mult/maxStrength両方に同じ値=
            // 既定cap3で頭打ちになる罠を回避。v0.25.3257の教訓)。
            // 社長指示v0.25.3300 ボムカウンター覚醒(Lv3): KBが実距離100pxになり、飛ばされた敵に
            // 1段パニッシュ効果(bombPunishUntil)が付く。エクスプローダー覚醒はさらに距離×1.5。
            const bcAwaken = bcLv2 >= 3;
            const bcKbPx = (bcAwaken ? BOMB_COUNTER_AWAKEN_KB_PX : SKILL_BLAST_KB_PX) * skillExplosionKbMult(currentPlayer);
            const bcKbMult = knockbackSpeedFor(bcKbPx, KNOCKBACK_DURATION) / BULLET_KNOCKBACK_SPEED;
            const bcPunishIds: string[] = [];
            for (const e of useGameStore.getState().enemies) {
              if ((e.type === 'reaper' && !e.reaperChaser) || e.aiPhase === 'jump') continue; // 深奥チェイサーは対象・空中無敵は対象外
              const ecx = e.x + e.width / 2, ecy = e.y + e.height / 2;
              const dist = Math.hypot(ecx - bcx, ecy - bcy);
              if (dist > radius) continue;
              const falloff = 1 - dist / radius;
              const dmg = Math.max(1, Math.round(base * (0.55 + falloff * 0.45)));
              const killedE = damageEnemy(e.id, dmg, true); // 爆発=ボス系には非致死
              spawnDamageNumber(ecx, e.y, dmg, false);
              if (!killedE) {
                const nrm = Math.max(0.001, dist);
                useGameStore.getState().knockbackEnemy(e.id, (ecx - bcx) / nrm, (ecy - bcy) / nrm, bcKbMult, bcKbMult);
                // 覚醒: ボス/重量級以外に1段パニッシュ印(飛行中だけ巻き込み元になれる)。
                if (bcAwaken && !isBossType(e.type) && e.type !== 'giantbat' && e.type !== 'pumpkin') bcPunishIds.push(e.id);
              }
            }
            if (bcPunishIds.length > 0) {
              const bpUntil = Date.now() + KNOCKBACK_DURATION;
              const bpSet = new Set(bcPunishIds);
              useGameStore.setState(state => ({
                enemies: state.enemies.map(en => bpSet.has(en.id) ? { ...en, bombPunishUntil: bpUntil } : en),
              }));
            }
            // §6.10 M33③: ボマー = ボムカウンター爆発でも子グレネード3個を散布(手榴弾と同一仕様・再散布なし)。
            if (rollBomberScatter(currentPlayer)) { // v0.25.3306: 確率発動(30/40/50%)
              // ボマー覚醒(Lv3・v0.25.3300)=4つ
              for (const mini of buildBomberMinis(bcx, bcy, `bc-${currentPlayer.lastCounterSuccessTime}`, undefined, undefined, bomberMiniCount(currentPlayer))) addProjectile(mini);
              spawnBurst(bcx, bcy, '#fbbf24', 8);
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
      reportSuppressedError('loop', err); // v0.25.3324: 同上
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
    emitBotReport, // M26-L: botレポート(安定参照のuseCallback)
    showTutorialOnce, // v0.25.2252: チュートリアル表示(安定参照のuseCallback=再実行しない)
    seenTutorials,    // v0.25.2253: 既読の遅延読み込み(同上)
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

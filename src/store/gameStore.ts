import { create } from 'zustand';
import type { TutorialSlide } from '../data/tutorials';
import { isAvatarId, type AvatarId } from '../data/avatars';
import { snapGlowRadius, GLOW_R_L, GLOW_R_M, GLOW_R_S, GLOW_R_XL, GLOW_R_XS, GLOW_R_XXL } from '../utils/glowTiers';
import { AWAKEN_CUTIN_MS } from '../utils/awakenCutin'; // SKILL_BUILD_REDESIGN.md §24
import { generateEquipmentChoices, generateSkillUpgradeChoices, generateReplacementSkillOption, SCRAP_REWARD as LEVELUP_SCRAP_REWARD } from '../utils/upgradeUtils';
import { canAcquireRunSkill, rerollPrice, MAX_BANISH_PER_RUN, MAX_CARRY_SKILLS, type RunSkillDraftInput } from '../utils/runSkillDraft';
import { shouldEmitThrottled } from '../utils/emitThrottle';
import { airHopEase01, airHopEaseD01 } from '../utils/airHop';
import { bladeNativeAngle } from '../utils/bladeArt';
import { applyGhostBuildToPlayer, soloGhostRequested } from '../utils/soloGhost';
import { loadPlayerProfile } from '../utils/playerTraits';
import { runClocks, resetRunClocks } from '../utils/runClocks';
import type { EndingSoldier, EndingPhillState, EndingBomb, EndingBombTuning } from '../utils/endingScene'; // ENDING_SCENE.md 演出仕様v2/v3.1
import {
  createInitialEndingSoldiers, createInitialEndingPhill, stepEndingSoldier, stepEndingPhill,
  reenterEndingSoldierIfOffscreen,
  DEFAULT_ENDING_BOMB_TUNING, trySpawnEndingBomb, stepEndingBomb, blastEndingSoldiers,
} from '../utils/endingScene';
import {
  Player, Enemy, Projectile, Pickup, BreakableProp, GameStats,
  InputState, UpgradeOption, GameBounds, CharacterClass,
  VisualEffect, AmmoType, Direction, SubWeaponKey, SkillKey, CastleEvent, DifficultyRank, EnemyColorTier,
  WeaponMerchant, ShopItemKey, StageTheme, EventQuestNpc, Summon,
  RhythmState, RhythmArrow, ShijinGod, RhythmPending, IntroLine, LabDoor, LabButton, LabProp,
  ActiveEvent, ShadowCloneState, BaseSite, EscortSoldier, EnemyType, Weapon, RedNight, GroundFire, BossFire, RescueAlly, ThrownBag, AcrasielSpear,
  DashLocomotionState, EquipLoadout, EquipSlot, ConsumableKey,
  BloodSpike, GravityWell // SKILL_BUILD_REDESIGN.md §28(B7): 血の履帯/グラビティショットの状態
} from '../types/game';
import {
  MolotovCycleState, MOLOTOV_FIRE_LIFETIME_MS, MOLOTOV_DOT_INTERVAL_MS, MOLOTOV_DOT_DAMAGE, MOLOTOV_FIRE_RADIUS,
  MOLOTOV_IGNITE_BURN_MS,
  isEnemyInGroundFire,
} from '../utils/molotov';
// SKILL_BUILD_REDESIGN.md §28(B7): 眠り9種の判定叩き台(純関数群)。
import {
  BLOOD_TREADS_RADIUS_PX, BLOOD_TREADS_TICK_MS, bloodTreadsParams,
  GRAVITY_SHOT_PULL_SPEED, GRAVITY_SHOT_PULL_MS, rollGravityShotWell,
  GRAVITY_SHOT_BOSS_SLOW_MULT, GRAVITY_SHOT_BOSS_SLOW_REFRESH_MS,
  rollVampireHeal,
  INCENDIARY_BURN_TICK_MS,
  incendiaryBurnParams, // v0.25.3300 延焼弾覚醒(感染)の燃焼パラメータ
  iceShotSlowParams, ICE_SHOT_BOSS_EFFECT_MULT, // v0.25.3300 血の履帯覚醒(鈍足)=アイスLv1相当
  executionShockParams,
} from '../utils/skillEffectsB7';
import { FirstAidKitState, createFirstAidKitState } from '../utils/firstAidKit';
import { SensorMineState, placeSensorMine, SENSOR_MINE_CAP_BY_LEVEL, SENSOR_MINE_CHARGE_COOLDOWN_MS, sensorMineChargesReady, consumeSensorMineCharge } from '../utils/sensorMine';
import { SupportSniperNpcState, SUPPORT_SNIPER_CD_MS_BY_LEVEL } from '../utils/supportSniper';
import { FlareGunFlare, activeFlareTargets, FLARE_GUN_CD_MS_BY_LEVEL, FLARE_GUN_FLIGHT_MS, FLARE_GUN_DURATION_MS } from '../utils/flareGun';
import { computeJunkShot, JUNK_WEAPON_PELLETS } from '../utils/junkWeapon';
import { buildBomberMinis, bomberMiniCount, rollBomberScatter } from '../utils/bomberScatter';
import {
  recordSubUse, recordOverclockProc, resetBotTelemetry,
  recordDamageDealt, recordFinisherKill, recordMeleeSwing, recordCritHit,
} from '../utils/botTelemetry';
import {
  resetPlayerTraits,
  // G4a(BOT_AND_GHOST.md §2.9・記録専用): 技への反応表の被弾タグ+サブ様式カウンタ。挙動は一切変えない。
  notifyMoveDamage, recordWireAnchorUse, recordShieldBash, recordShieldBashDamage,
  // G5(BOT_AND_GHOST.md §2.10・記録専用): ボス撃破の通知。挙動は一切変えない(session=null時はno-op)。
  notifyBossClear,
  // 裁定4(§2.11・記録専用): PHILLの発射数(ヘッドショット数はuseGameLoopの着弾側でフックする)。
  recordPhillShot,
} from '../utils/playerTraits'; // BOT_AND_GHOST.md G1/G4a/G5
// §2.17(GHOST-DUO-RECORDS・記録専用): 同行撃破台帳の打刻。挙動は一切変えない(計測パスとは独立の
// 別モジュール。ソロラン=交戦時計が開いていない時はno-op)。
import { recordDuoBossClear, resetDuoRunRecords } from '../utils/duoRecords';
// v0.25.2577: 撃破タイムのボスごと交戦時計(ソロ/同行共有)のラン境界リセット。
import { resetBossClocks } from '../utils/bossClock';
// §2.18(GHOST-CMD-1): 技への反応の袋(境界ガード付き袋式)。寿命=ラン単位なのでresetGameでリセット。
import { resetGhostCommandBags } from '../utils/commandBag';
// GHOST-CMD-2A(§2.18追補): 隙コマンドの2モード袋(汎用)。同じくラン単位の寿命=resetGameでリセット。
import { resetModeBags } from '../utils/modeBag';
// v0.25.2514(§2.11 裁定1): 計測時ビルドの疑似Player(被ダメ補正の主語)。純関数・store非依存。
// v0.25.2553(§2.16 A): 同行守護霊の写し(撃破記録へ添える持ち主名+ビルド)。同じく純関数。
import { buildPseudoPlayer, findGhostAlly, ghostAllySnapshot, type GhostAllySnapshot } from '../utils/playerBuild';
import { clearGhostBuildCache, ghostBuildFor, ghostActorPlayer, actorBuildFor } from '../utils/ghostBuild'; // ラン境界でビルドのメモ化を捨てる / 守護霊の疑似Player(裁定1)
import { beginGhostOnlineRun, type GhostFeedbackTarget, type GhostSource } from '../utils/ghostOnline';
// 刀の一閃 / ワイヤーのロコモーション上書き(プレイヤーと守護霊で共有する状態機械・裁定2)。
import { dashModeAt, dashOverride, dashStateOf, emptyDashState } from '../utils/dashLocomotion';
import { applySubCooldownSkills } from '../utils/subCooldown'; // G2.6 CD正規化(BOT_AND_GHOST.md §2.8)
import { playerAsOwner, ghostAsOwner, ownerCenterX, ownerCenterY, ownerFootY, ownerGhostId, type SubWeaponOwner } from '../utils/subWeaponOwner'; // G2.6 オーナー抽象化
import { stepSpeedRamp, effectiveRampFrac, RAMP_FULL_MS } from '../utils/speedRamp'; // MOVEMENT_REWORK.md 仕様1
import { computeEffectiveMoveSpeed } from '../utils/playerMoveSpeed'; // PACING_PUZZLE.md §14-4-2(新死神・重大4/5)
import { knockbackCdReady } from '../utils/reaper2'; // PACING_PUZZLE.md §14-4-3(使者のKB特例=免疫CD無視)
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
  SHIJIN_SLIDE_DISTANCE, SHIJIN_SLIDE_MS, DANCE_BEAT_MODE
} from '../config/shijin';
import { getStartingWeapons, createWeapon, AMMO_FIELD, getActiveGun, getGuns, ammoPoolFor, isReloading, RANGE_BY_CATEGORY, buildJunkWeaponPellets, armoryGrantKeys, beginWeaponReload, finishWeaponReload, refillWeaponMagazine, berserkerAwakenFireRateMult, HANDCANNON_WEAPON_KEY, weaponDisplayName } from '../utils/weaponUtils';
import { resetHandcannonDecay } from '../utils/handcannonDecay'; // UNIQUE_WEAPONS.md §13-1
import { resolveSlotKeyNow } from '../utils/weaponSlot'; // UNIQUE_WEAPONS.md §4-1(生成点=grantWeapon入口の安全網/武器庫)
import { BOSS_UNLOCK } from '../data/weaponSlots'; // UNIQUE_WEAPONS.md §6(ボス撃破→ユニーク武器の恒久解放)
import { pickAmmoDropType } from '../utils/ammoDrop';
import { ammoDirectorRate } from '../utils/ammoDirector';
import { rescueSignalProcChance, selectRescueSignalTarget, pickRescueSignalAllyClass } from '../utils/rescueSignal';
import { evaluateLabLoseSight, LAB_VISION_RANGE } from '../utils/labStealth';
// distToSegment: M66(§6.26-11)の掃射/三連突進の吐息(回転帯)が毎フレーム自己検出するために使う純関数。
import { isPlayerInAttackTelegraph } from '../utils/levelUpGate';
import { distToBandRect } from '../utils/geometry'; // v0.25.3496: 帯の判定=描いてある四角
import { weaknessCritBonus } from '../utils/weaknessCrit';
import { applyEnemyCritPenalty } from '../utils/critPenalty';
import { BOSS_NEUTRAL_CASTLE_MS } from '../utils/bossRebuild'; // ★社長裁定2026-08-27: 城ボスの技間=2.5秒(v3952の+600/v3954の×2を上書き)
import { softCapCritChance } from '../utils/critSoftCap';
import { resetCritDecay } from '../utils/critDecay'; // ★§13-3e クリ減衰(社長裁定2026-08-26)
import {
  type NamedFoeMeta, NAMED_TREASURE_GOLD, rollNamedSpawnThisRun, decidePromotionOnDeath, sanitizeNamedFoe,
  NAMED_HP_MULT, NAMED_DMG_MULT, NAMED_SIZE_MULT, pickNamedEnemyName, normalizeNamedName,
} from '../utils/namedEnemy';
import {
  getEventQuestConfig, questNamedSpawnPos, pickQuestNamedType, questKillProgress,
  QUEST_NAMED_AGGRO_RANGE,
} from '../utils/eventQuest';
import { openCrate, rollTier23Gun } from '../utils/weaponDrop';
import { nextLevelThreshold, expNeededForLevels } from '../utils/levelCurve';
import { slasherLungePx } from '../utils/slasherLunge';
import { isBossType, isHiddenBoss, usesBossCrit, resistsChipKnockback, enemyRangeRect, getsDramaticDeath, getsDeathAttention, getEnemyColor, resolveEnemyTarget, spawnEnemyAt, areaIndexForPos, OFFSCREEN_RECYCLE_MARGIN, getEnemyBaseSpeed, setCorridorSpawn, createEnemyProjectile, isFinalBossKill, isCorpse, corpseEligible, isBountyType, isGuardianPhantom, isArenaSweepProtected, setStageDifficultyMults, isPumpkinTier, isBiteExemptType, isReaperFamily, isTerminalReaper, isHangedman, AREA_THRESHOLDS } from '../utils/enemyUtils';
// 二人組クエストv2(EVENT_QUEST_DESIGN.md §2-3・B2): 出現位置のジオメトリ(純関数)+賞金首の索敵圏既定値。
import { BOUNTY_AGGRO_RANGE_DEFAULT } from '../utils/bountyDims'; // ★葉から取る(bountyTick から直接取ると循環import=起動全損・v0.25.4097)
// research/AI_HUMANIZE.md B2 ★未決#14(社長裁定2026-09-02=(a)): 城ボス9州の予告寸法は葉モジュール
// episodeShape.ts(依存ゼロ)へ移した(手本=bountyDims.ts)。ghostDriver(再生側)がこの葉から直接
// importして「州→実図形」を組めるようにするため=数値の複製を防ぐ。値は不変・置き場所だけの移動。
import {
  GIANT_STOMP_RADIUS, GIANT_SWEEP_HALF_WIDTH, GIANT_SLAM_HALF_WIDTH, GIANT_GLIDE_HALF_WIDTH,
  GIANT_DIVE_RADIUS, GIANT_WING_RADIUS, GIANT_TRISHOT_HALF_WIDTH, GIANT_TRISHOT_LENGTH,
  GIANT_TRISHOT_SPREAD_RAD, GLEN_REACH_HALF_WIDTH, GLEN_TAILSLAM_HALF_WIDTH,
  episodeShapeFor,
} from '../utils/episodeShape';
export {
  GIANT_STOMP_RADIUS, GIANT_SWEEP_HALF_WIDTH, GIANT_SLAM_HALF_WIDTH, GIANT_GLIDE_HALF_WIDTH,
  GIANT_DIVE_RADIUS, GIANT_WING_RADIUS, GIANT_TRISHOT_HALF_WIDTH, GIANT_TRISHOT_LENGTH,
  GIANT_TRISHOT_SPREAD_RAD, GLEN_REACH_HALF_WIDTH, GLEN_TAILSLAM_HALF_WIDTH,
};
import { rescueSpawnCandidates } from '../utils/rescueQuestSpawn';
// research/STAGE_DIFFICULTY.md: ステージ難度の階段。係数の判断(計測路なら1.0)はこのヘルパ1本。
import { stageBossDiffMults } from '../utils/stageDiffMults';
// §6.38 B4(クリーンアップ): 実効難易度倍率の式はbountyValue.ts(依存ゼロに近い葉。詳細はファイル冒頭の
// コメント参照)へ一本化した。bountyTick.tsもここから同じ関数をimportする(=もう複製ではなく本物の
// 共有import。旧B3コメントの「bountyTick.tsを直接importすると循環」は解消していない=それは今も避け、
// 代わりにbountyTick.tsもgameStore.tsも共通の葉から取る形にした)。
import { escortAdvance } from '../utils/escortAdvance';
// BOT_AND_GHOST.md §2.8 G2.5(ヘイト)。
import { addHateDamage, isHateTrackedBossType, resolveBossHateAim, resolveBossLockedHateAim, type HateSide } from '../utils/bossHate';
// 敵同士の軽い押し合い(社長指示v0.25.2320)。updateEnemies の後処理で座標だけ微調整する純関数。
import { computeEnemySeparation } from '../utils/enemySeparation';
// M51: 城ボス「ジャイアント」新スクリプトの純関数(間合い/CD/HP段階から次の技を選ぶ・PACING_PUZZLE.md §6.26)。
import {
  giantPhaseForHealth, giantPhaseJustChanged, pickGiantMove, type GiantMove,
  giantPhaseForHealthStory, type GiantPhase,
  giantStageRangeMult,
  giantRestRawMs,
  // M66(PACING_PUZZLE.md §6.26-11): ステージ別 独自技/大技(stage-1/3/4/5限定)の純関数。
  pickGiantMoveWithStage, type GiantStageMoveId,
  GIANT_STAGE_UNIQUE_MOVE, GIANT_STAGE_ULT_MOVE,
  giantQuadDashComplete,
  // M67(PACING_PUZZLE.md §6.26-12): グレン(stage-7)専用の新技4つの純関数。
  pickGiantMoveWithGlen, glenScriptApplies, isGlenMoveId, type GlenMoveId, GLEN_NIHIL_CHANT_COUNT, giantStageMoveOfPhase, glenMoveOfPhase,
  GIANT_PHASE_HP_THRESHOLD, glenTriJumpPoints, GLEN_TRIJUMP_COUNT,
} from '../utils/giantScript';
// v0.25.3027: グレン第二形態の胴体弾(連結パーツからのV字斉射・社長裁定)。台帳と式は描画と共有。
import {
  pushGlenTrail, shouldGlenVolley, glenVolleyShots, glenTailReach, GLEN_VOLLEY_CD_MS,
  glenForm1TransitionReady, type GlenTrailPoint,
} from '../utils/glenChain';
import { choreographyRecoverMs, planBossChoreography } from '../utils/bossChoreography';
// ★近接スイング確定の打刻(1本の純関数)。research/THOR_ISSEN_REWORK.md §1-3。
import { stampMeleeSwingCommit } from '../utils/thorNihil';
// research/AI_HUMANIZE.md B1(コマ台帳・記録専用): giantbat系の州満了エッジに1行差す。
import { settleEpisode, type CounterReachShape } from '../utils/habitEpisode';
import { ZOOM_MIN_ABS } from '../utils/cameraZoom';
import { hunterWanderStep } from '../utils/hunterWander';
import {
  getSelectedStageId, getWallMeta, recordChronicle, recordChronicleGlobalFirst,
  getEventQuestMeta, setEventQuestMeta, markCastleBossCleared, syncQuestStageClear,
  updateStoryFlags, markMissionCleared,
  isKogarasuUnlocked, markKogarasuUnlocked, markWeaponUnlocked,
  getSelectedFreeMode,
  type WallMeta,
} from '../data/progress';
// 城ボスの個体名の正本(カットイン台帳)。死因・討伐バナー・年表など全UIが同じ名前を引く。
import { CASTLE_BOSS_NAME_BY_STAGE } from '../data/bossCutin';
// サブクエスト(research/SUBQUESTS.md): 台帳+純関数/保存。どちらも葉モジュール(storeを読まない)。
import { subquestsForStage } from '../data/subquests';
import {
  applySubquestEvent, refillStageSubquests, toRunEntries,
  getStageSubquestState, putStageSubquestState,
  type SubquestEvent, type SubquestKillEvent, type SubquestRunEntry, type SubquestActiveEntry,
} from '../utils/subquests';
import { sortWallEventsByPriority, type WallEventKind } from '../utils/wallProgress';
import type { KomaAssessmentInput } from '../utils/rankAssessor';
import { getDirectorRewardMult } from '../utils/directorRankState';
import { recordKill, recordSpawn } from '../utils/killTelemetryState';
import { drillerZoneFor, drillerCanThrust, isDrillerRetreating, isRetreatEligibleType, DRILLER_RETREAT_MS, DRILLER_RETREAT_SPEED_MULT } from '../utils/drillerAi';
import { loggerZoneFor, loggerCanSweep, loggerSweepBand, LOGGER_SWEEP_FORWARD_OFFSET } from '../utils/loggerAi'; // PACING_PUZZLE.md §14-2
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
import { setFlowersDisabled } from '../world/forestDecor';
import { bossTestGhostSkill, isBossMakerRun, getBossTestSkillInjection } from '../utils/bossTest';
// research/GROWTH.md v4(永続育成「強化」)。**効果値の純関数と保存は utils 側**(AMMO_MAX は
// 引数で渡す=utils→store の逆流を作らない)。計測路(ガントレット)の述語は依存ゼロの葉から読む。
import {
  PLAYER_UPGRADES_KEY, activeUpgradeLevel, effectiveAmmoMaxMap, emptyPlayerUpgrades,
  growthAttackMult, growthGoldMult, growthMaxHpBonus, growthScoreMult, growthXpMult, loadPlayerUpgrades, playerUpgradeCost,
  savePlayerUpgrades, type PlayerUpgradeState,
} from '../utils/playerUpgrades';
import { PLAYER_UPGRADE_MAX_LEVEL, type PlayerUpgradeId } from '../data/playerUpgrades';
import { isGauntletRun } from '../utils/gauntletMode';
// SKILL_BUILD_REDESIGN.md §15(B0発注文): 1ランぶんの計測台帳(読むだけ・挙動は変えない)。
import {
  resetRunTelemetry, recordBossEntry, recordUpgradeOffered, recordUpgradeSelected,
  recordKnifeTierFromBox, recordScrapIncome, recordScrapExpense, recordMerchantPurchase, recordDdaCoefficients,
  recordSlotFilled,
  type RunTelemetryEquipSnapshot, type RunTelemetryEquipSlotSnapshot,
} from '../utils/runTelemetry';
import { isPracticeRun, practiceBossType, GUARDIAN_PHANTOM_LABEL } from '../utils/bossPractice';
import { phantomDisplayLabel, getPhantomIdentity } from '../utils/phantomIdentity'; // SAME_ARENA O-5: 幻影の表示名はその回の人格 // BOSS_MAKER.md §20-7-c / research/GHOST_BOSS.md
// research/GHOST_BOSS.md v6: 幻影が受ける打撃の関所(被弾無敵+パリィ)。**7系統の全てがここを通る**。
import { phantomHitGate, playerIframeApplies, type PhantomDamageSource, type PhantomHitGateResult } from '../utils/phantomGate';
import { ensureProjectileOrigin } from '../utils/projectileOrigin';
import { GUARDIAN_PHANTOM_TUNING as GP_T, PVP_DAMAGE_SCALE } from '../utils/phantomScript';
import { isTrapDebuffed, trapGatedOverclockChance, trapGatedCooldownMult, TRAP_ROOT_CRIT_BONUS } from '../utils/trapDebuff';
import { strongestGuardian } from '../data/fixedGuardians';
// SKILL_BUILD_REDESIGN.md §21(B5発注文): 枠光(視覚専用)の点灯窓の長さだけを共有する。
import { OVERCLOCK_LIGHT_MS } from '../utils/frameLight';
import { BOSS_CUTIN_MS, shouldIgnoreAttention, type AttentionCutin } from '../utils/attentionCutin'; // §6.36 ボス出現カットイン
import { clearDestroyedObstacles } from '../world/destructibles';
import { resolveCityPropCollision } from '../world/cityProps';
import { hospitalPos as hospitalSpot, resolveHospitalCollision, isInHospitalCircle, tickHospitalDwell } from '../world/hospital';
import { detourAngleOffset } from '../world/detourPoi';
import { armoryPos as armorySpot, resolveArmoryCollision, isInArmoryCircle, tickArmoryDwell, ARMORY_SCRAP_COST } from '../world/armory';
import { policePos as policeSpot, resolvePoliceCollision } from '../world/police';
import { assignDetourSectors } from '../world/detourPoi';
import { bossSectorIndex, poiSectorIndex } from '../world/pois';
// PACING_PUZZLE.md §6.24-UX(POI-UX): 寄り道POIの通信/入手トースト/解放帯の文言とゲート(純関数)。
import {
  emptyPoiIntelShown, poiIntelLine, shouldShowPoiIntel, pickPoiIntelSpeaker,
  poiUnlockBandText, POI_BAND_MS, POI_VACCINE_NAME, POI_VACCINE_DESC, POI_LABEL, type PoiKind,
} from '../utils/detourPoiUx';
import { resolveTorchCollision, torchRect, torchesInRegion, setTorchesDisabled } from '../world/torches';
import { mineAmbushAround, mineRect, minesInRegion, pressureMinesNearPlayer, setMinesDisabled } from '../world/mines';
import type { MineAmbushAnchor } from '../world/mines';
import { PLAYER_PROFILES } from '../data/playerProfiles';
import { classSubWeaponFor, skillMaxLevel, rollGachaSkill, rollSkillLevel, SKILLS, gachaPullCost, GACHA_REFUND_BY_RARITY, REVISIT_MISSION_ID, POLICE_REWARD_SKILLS, ensureDefaultOwnedSkills, COMPANION_SKILL_KEYS, retiredSkillsRefundTotal } from '../data/campaign';
import { isExStageRun } from '../utils/exStage'; // PACING_PUZZLE.md §10-20: EX(stage-ex1)専用分岐の判定
import type { SkillRarity } from '../data/campaign';
import { CONSUMABLE_DURATION_MS } from '../data/consumables';
import { EQUIPMENT, equipmentById, equipmentDef, EQUIP_LINES_BY_SLOT, EQUIP_TIER_MAX, aggregateEquipBonus, equipMaxHealthOf, neutralEquipBonus, emptyEquipLoadout, merchantEquipStepForSlot } from '../data/equipment';
import { footRect, rectsOverlap, resolveAabb, segmentBlocked, type Rect } from '../world/obstacles';
import { pushShieldRect } from '../world/shieldPush'; // B6(盾押し・§6): 純関数(src/world/shieldPush.test.ts)
// ★噛みつき(PACING_PUZZLE §12)。プレイヤーが敵をすり抜けないようにするため、
// 「噛みつき側の敵か」と「足元の壁の箱」をここでも使う。
import { isBiteSubject, biteWallRect, isBiteWallOpen, bitePhaseOf, biteLungeFrac, biteSpecFor, isBiteInterruptedByMove } from '../utils/enemyBite';
import { isPassThroughPhase, isPassThroughBossState, createAvoidState, stepAvoid } from '../utils/enemyMotion';
import {
  advanceBossDisengageGrace, bossLeashDistancePx, isLeashableBoss, BOSS_DISENGAGE_GRACE_MS,
  bossEngagedNow, facilitiesLocked, isEngageableBoss,
  BOSS_LEASH_REGEN_PER_SEC, BOSS_LEASH_RETURN_SPEED_MULT,
} from '../utils/bossEngagement';
import {
  applyBossPostureDamage, applyBrokenGunReward, applyBrokenMeleeFatal, isBossPostureBroken,
  tickBossPosture, postureChipMult, keepBurstDelayedHits, type BossPostureImpact,
} from '../utils/bossPosture';
// ★SAME_ARENA §9(対人体勢システム・社長指示2026-08-26)。プレイヤーと幻影が対称に持つ隠し体勢。
import {
  chipPvpPosture, markPvpCritSlow, isPvpIncapacitated, isPvpFatalTarget,
  pvpFatalDamage, pvpAfterFatal, pvpMoveMult, type PvpImpact,
} from '../utils/pvpPosture';
// PACING_PUZZLE.md「★ボスの「止める効果」の作り直し」①逓減(DR)。「止める」効果
// (ノックバック/黄色クリの窓/罠の拘束/気絶)を1カテゴリに統合して数える単一の関門(bossStopDr.ts参照)。
import { evaluateBossStopDr } from '../utils/bossStopDr';
// PACING_PUZZLE.md §7-11c(3): 手動レール(実機テスト用ツマミ)。ドロップバイアス(弾/トレジャー)側の
// 掛け先はここから読む。スキル抽選側の掛け先はrunSkillDraft.ts(rail/railMultを引数で受け取る)。
import { parseRailKind, parseRailMult, railAmmoDropMult, railTreasureDropMult, type RailKind } from '../utils/railBias';
// PACING_PUZZLE.md §6.33(LASER-TRACK): ミーミルのレーザー弱点窓=近接ヒットで中断(近接3経路が呼ぶ)。
import {
  mimirLaserBreakOnMeleeHit,
  // v0.25.3145(社長指示「触手はミーミルレーザーと同じく切り返しで避ける」): 触手の溜め中の
  // 追尾照準は**レーザーと同じ物理**で動かす。数値・式をこちらへ複製しない(文法を1本に保つ)。
  stepLaserAim, glenReachTrackCaps, GLEN_REACH_OVERSHOOT, glenReachAimStart,
} from '../utils/mimirLaserTrack';
import { TELEGRAPH_TRACK_MS, stepTrackAim } from '../utils/telegraphTrack'; // §15追尾相パイロット(sweep限定)
import { enemyFootBox, enemyHeadY, enemyHitStrip } from '../pixi/renderSpec';
// 雑魚の個体差+役割(社長指示v0.25.3176・案4+案3)。向きと速さだけを曲げる純関数。
import { isChaffType, chaffTraits, chaffHeading, chaffSpeedMult } from '../utils/chaffMotion';
import { labWallsInRegion, labUvBarsInRegion, wallRect, labPropsInRegion, propRect, LAB_CORRIDOR_Y_LIMIT_PX as LAB_CORRIDOR_Y_LIMIT_FROM_WORLD } from '../world/labWalls';
import {
  clampRectToPlayableArea,
  clampCastleFightCrossing, // v0.25.3055: 城ボス戦の移動半径制限(研究対象の外縁まで)
  type PlayableAreaCtx,
  TUTORIAL_MOVE_Y_LIMIT_PX as TUTORIAL_MOVE_Y_LIMIT_PX_FROM_WORLD,
  TUTORIAL_MOVE_X_MIN_PX as TUTORIAL_MOVE_X_MIN_PX_FROM_WORLD,
  CORRIDOR_BOTTOM_LIMIT as CORRIDOR_BOTTOM_LIMIT_FROM_WORLD,
} from '../world/playableArea';
import { LAB_DOORS, LAB_BUTTON, LAB_ENEMIES, LAB_PLAYER_SPAWN, LAB_MERCHANT, LAB_CARD_KEY, LAB_WEAPON_CRATE, LAB_CLEAR_ITEM, LAB_UV_BARS, LAB_AMMO_PICKUPS, labBlockingWalls, generateLabProps } from '../world/labMap';
import { labIdolSpotForDoc, type LabIdolSpot } from '../world/labIdolSpot';
import { HUNTING_MELEE_RADIUS_BONUS_BY_LEVEL } from '../config/hunting';
import { GAME_SPEED } from '../config/gameSpeed';
import { stunnedMeleeOutcome, usesBossStunnedMelee, ELITE_MELEE_STUN_MULT, resolveStunnedMeleeHit, MELEE_STUN_LIFT_MS } from '../utils/meleeExecute';

// 四神舞(リズム)の初期状態。新規ラン/リセットで使い回す。
const initialRhythm = (): RhythmState => ({
  active: false, interval: RHYTHM_INTERVAL_MS, firstBeatAt: 0, expectBeat: 0, prompt: randomRhythmPrompt(), inputIndex: 0, inputArrows: [],
  godSuccess: 0, comboStage: 0, lastInputAt: 0, lastJudge: 'none', lastJudgeAt: 0, lastJudgeKind: 'none', lastJudgeArrow: null, judgeSeq: 0, lastTapAt: 0, lastFinishAt: 0, lastGod: null,
  invulnUntil: 0, byakkoUntil: 0, byakkoNextAt: 0, byakkoHits: 0, pending: [],
});

// RE-style ammo economy. Guns fire from a per-gun magazine and reload from
// these per-family RESERVE pools. The reserve starts large (you're well
// stocked) but ammo is hard to find, so the run is a slow drain on it.
export const AMMO_MAX: Record<AmmoType, number> = { handgun: 72, shotgun: 24, rifle: 36, phill: 48, glauncher: 36 }; // glauncher=★v0.25.4000で独立プール化(社長指示「グレランは弾を分けて」。旧v3290=rifle共用)
// PACING_PUZZLE.md §5.5 M5(RE4式弾ドロップ・既定ON): ?ammosmart=0で従来(構え銃の弾種)へ。
// useGameLoop側の銃キル経路と同名パラメータ(各自読む=既存camNum等と同じ流儀)。
const AMMO_SMART_ENABLED = typeof window === 'undefined' || new URLSearchParams(window.location.search).get('ammosmart') !== '0';
// 弾薬AIディレクター(v0.25.2170・社長決定・既定ON): キルドロップ基礎率(10%)を「全所持銃の弾備蓄の
// 枯渇度×敵の多さ」で最大20%まで底上げする(src/utils/ammoDirector.ts)。?ammodir=0で無効化(常に基礎率のまま)。
// useGameLoop側の銃キル経路も同名パラメータを各自読む(既存のammosmart等と同じ流儀)。
const AMMO_DIRECTOR_ENABLED = typeof window === 'undefined' || new URLSearchParams(window.location.search).get('ammodir') !== '0';
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
// 社長指示(v0.25.2391)「ステージ2に限らず、移動不可エリアにアイテムも敵も沸かないで」・既定ON。
// `?spawnclamp=0`で従来の挙動(帯の外にも沸ける)へ戻せる。プレイヤー移動側のクランプ自体は対象外
// (常に有効=変わらない)。addPickup(アイテム着地)と洋館通路(corridorMode)の通常敵湧きが読む。
export const SPAWN_CLAMP_ENABLED = typeof window === 'undefined' || new URLSearchParams(window.location.search).get('spawnclamp') !== '0';
// MOVEMENT_REWORK.md 仕様1(速度ボーナスのランプ+切り返しリセット・既定ON): `?speedramp=0`で
// 旧挙動(ボーナス即時全開)へ復帰。movePlayer側が effectiveRampFrac() 経由で参照する。
const SPEED_RAMP_ENABLED = typeof window === 'undefined' || new URLSearchParams(window.location.search).get('speedramp') !== '0';
// MOVEMENT_REWORK.md 仕様2(スケーター乗車中の攻撃封印・既定ON): `?skaterlock=0`で旧挙動(乗車中も
// 発砲/カウンター/サブウェポン発動が可能)へ復帰。triggerCounter(gameStore)とサブ発動/自動発砲の
// 入口(useGameLoop)が共通で読む。
export const SKATER_LOCK_ENABLED = typeof window === 'undefined' || new URLSearchParams(window.location.search).get('skaterlock') !== '0';
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
// 敵同士の軽い押し合い(社長指示v0.25.2320・既定ON)。`?enemysep=0`で従来(重なり放置)へ復帰。
// 判定は純関数(src/utils/enemySeparation.ts)。ここは有効/無効の入口だけ持つ(他フラグと同じ流儀)。
const ENEMY_SEPARATION_ENABLED = typeof window === 'undefined' || new URLSearchParams(window.location.search).get('enemysep') !== '0';
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
// ステージ7の開幕宝箱で与えるレベルアップ回数(社長指示v0.25.3137「3レベルアップ」)。
export const BOSS_START_CHEST_LEVELS = 3;
// 同・宝箱を置く位置(社長指示v0.25.3161「下のギリギリ画面外に設置(マークが出るくらいのとこ)」)。
// **プレイヤーの下=手前方向**へ、画面の下端をわずかに越えた所へ置く。
//   画面の下端まで = gameBounds.height / 2(カメラはプレイヤー中心)
//   そこへ BOSS_START_CHEST_BELOW_MARGIN_PX 足して**画面外**にする=最初は見えず、
//   画面端マーカーだけが出る(下の pixiScene 側で宝箱にもマーカーを出すようにした)。
// ※旧: 上へ96px(開幕でカメラ中央のすぐ上に見える)。
export const BOSS_START_CHEST_BELOW_MARGIN_PX = 60;
// 初期所持は上限を超えないようにする(shotgun は旧40→新上限18へ)。phill=母数(リザーブ)24スタート。
export const AMMO_INITIAL: Record<AmmoType, number> = { handgun: 60, shotgun: 18, rifle: 24, phill: 24, glauncher: 24 };
// How much a world/melee ammo pickup grants for each family (enemy drops, air
// drops, and the boxes melee kills now drop). Modest relative to the reserve
// cap — resupply is scarce。phill=1ピックアップ/購入で6発。
export const AMMO_PICKUP: Record<AmmoType, number> = { handgun: 40, shotgun: 10, rifle: 20, phill: 6, glauncher: 20 };

// Player-tunable melee ammo-drop rate (percent), set on the start screen and
// persisted across reloads. A melee kill drops ammo at this rate; a melee
// finisher rolls at 1.5× (capped at 100%). Counter (reflect) kills are separate.
// v0.25.2170: 弾薬AIディレクター制の基礎率(叩き台10%)。この上に ammoDirectorRate() が
// 「全所持銃の弾備蓄の枯渇度×敵の多さ」で最大20%まで底上げし、さらに装備/パッシブ加算と
// フィニッシャー1.5倍(既存)が乗る。
const AMMO_PICKUP_KEY = 'zombie:ammoPickupAmounts';
export const DEFAULT_MELEE_DROP_PCT = 10;
// PACING_PUZZLE.md §7-11c(3): `?rail=judge|elite|dps` + `?railmult=<倍率>`(既定1.5)。未指定=null=
// 完全に現行どおり(railAmmoDropMult/railTreasureDropMultが1を返す)。
const RAIL_KIND: RailKind | null = typeof window === 'undefined'
  ? null
  : parseRailKind(new URLSearchParams(window.location.search).get('rail'));
const RAIL_MULT: number = typeof window === 'undefined'
  ? 1.5
  : parseRailMult(new URLSearchParams(window.location.search).get('railmult'));
const CASTLE_MIN_DISTANCE = 900;
const CASTLE_MAX_DISTANCE = 1300;
// 建物1.5倍に合わせ足元判定も拡大(社長指示): 横×1.5 / 縦は上へ×1.2。
const CASTLE_COLLISION_W = 168; // 112 * 1.5
const CASTLE_COLLISION_H = 50;  // 42 * 1.2 ≈ 50
const CASTLE_FOOT_OFFSET_Y = 38;
const MERCHANT_INTERACT_RADIUS = 58;
const MERCHANT_REOPEN_DELAY_MS = 1500;
// 武器商人: サークル内に連続滞在でショップが開くまでの時間(社長指示v0.25.1842「サークルに3秒滞在で
// 話しかけれる」=旧・近接スイング開店を置換)。
// 社長指示v0.25.3326「武器商人開くの2秒に変更」: 3000→2000(商人のみ。帰還/クエスト円の3秒は不変)。
export const MERCHANT_TALK_DWELL_MS = 2000;
// EVENT_QUEST_DESIGN.md §2-14「★ワープの段を進める場所」(B2): 飛来の始点の距離としてuseGameLoopが
// importして流用する(値の複製を作らない=ARENA_EVENT_RADIUSと同じ扱い)。export化のみ・値は不変。
export const EVENT_NPC_MIN_DISTANCE = 460;
const EVENT_NPC_MAX_DISTANCE = 950;
const EVENT_NPC_INTERACT_RADIUS = 64;
export const SHOP_AMMO_COST = 10;
// 商人の弾薬販売量(v0.25.2168・社長指示「商人のライフルは15発に。ハンドガンは25発に」):
// ドロップ箱の取得量(ammoPickupAmounts: handgun40/rifle20等)とは別建てで、商人だけ少なめ。
// 未指定の弾種(shotgun/phill)は従来どおり箱と同量。
export const SHOP_AMMO_AMOUNTS: Partial<Record<AmmoType, number>> = { handgun: 25, rifle: 15 };
export const shopAmmoAmount = (type: AmmoType, pickupAmounts: Record<AmmoType, number>): number =>
  SHOP_AMMO_AMOUNTS[type] ?? pickupAmounts[type];
export const SHOP_DOG_COST = 100;
export const SHOP_CLASS_SKILL_COST = 100;
export const SHOP_MEDKIT_COST = 50;
export const SHOP_VACCINE_COST = 500;
export const SHOP_SUBWEAPON_SELL_VALUE = 100; // 商人: サブウェポン換金額(1個=100s)
// SKILL_BUILD_REDESIGN.md §18-1の2(商人の装備区画・価格表): Tier1→5。叩き台・B6計測で調整前提。
// 置き場は既存SHOP_*定数群(§16-9の5=台帳を2箇所に割らない=campaign.ts側には置かない)。
export const EQUIP_SHOP_COST_BY_TIER: readonly number[] = [40, 80, 120, 160, 200];
// PACING_PUZZLE.md §6.24 M48「使役」(D1): 通常敵を倒した時に仲間として復活させる確率。
export const POI_THRALL_CHANCE = 0.20;
// 救急セット: 最大HPの30%回復(社長指示・固定20から変更)。
// export(v0.25.2563): 守護霊の救急鞄も**同じ回復規則**を使う(§2.8「1つの薬棚」/ 値を複製しない)。
export const HEAL_FRACTION = 0.3;
// クイックマガジン回収で付くクリ率アップ窓(gameTime基準・ms)。プレイヤーの拾得(collectPickup)と
// 守護霊の自分のマガジン回収(useGameLoop)が**同じ値**を使う(v0.25.2563・値を複製しない)。
export const QUICK_MAG_CRIT_WINDOW_MS = 5000;
const SHOP_INTERACT_RING_MS = 360;
const STRONG_GLOW_RADIUS = 44;
const SMALL_GLOW_RADIUS_SCALE = 0.9;
const SMALL_GLOW_DURATION_SCALE = 0.82;
const SMALL_GLOW_MIN_DURATION_MS = 80;
// `finish` = a melee finisher executed a normal enemy, or finisher-grade
// damage landed on a stunned boss (drives the kill.mp3 sound).
// `killed` = how many enemies the swing killed (drives the zombie death grunt).
export type CounterTriggerResult = { swung: boolean; hit: boolean; finish: boolean; killed: number };

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
// ★v0.25.3608(社長指示「進軍NPCの歩行速度を20%アップ」): 旧=レスキューと同じ通常速(等倍)。
const ESCORT_SPEED = RESCUE_SURVIVOR_SPEED * 1.2; // 前進速度。画面内のときだけ前進。
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
// 実体は `src/world/playableArea.ts`(世界の形=「行ける場所」なので world 層が唯一の出どころ、
// LAB_CORRIDOR_Y_LIMIT_PX と同じ作法・v0.25.2391)。ここは従来の import 元を壊さないための再輸出。
export const TUTORIAL_MOVE_Y_LIMIT_PX = TUTORIAL_MOVE_Y_LIMIT_PX_FROM_WORLD; // v0.25.1828: 社長指示「100pxに増やします」で50→100
// 訓練(M0)の近接教習: 何発目のヒットを強制クリティカルにするか(社長台本v0.25.2293「近接3発で強制クリティカル」)。
export const M0_FORCED_CRIT_AT_HIT = 3;
// 開幕の会話が流れ終わるまで、ここより先へは進めない(区域境界1500の手前)。
export const M0_CONVO_ADVANCE_LIMIT_X = 1350;
// 訓練(M0)で敵が出ている間、随行NPCがプレイヤーより何px前へ出るか(社長指示v0.25.2294「2人が前に出て積極的に撃つ」)。
const M0_ESCORT_ADVANCE_PX = 110;
// チュートリアルの左端(プレイヤー中心xの下限=スタートから左100pxで透明な壁・社長指示v0.25.1829)。
// 実体は `src/world/playableArea.ts`(再輸出・v0.25.2391)。
export const TUTORIAL_MOVE_X_MIN_PX = TUTORIAL_MOVE_X_MIN_PX_FROM_WORLD;
// ステージ2(研究所・横長廊下)の上下固定(M0チュートリアルと同じクランプ方式・社長承認
// M2_LAB_CORRIDOR_SPEC.md v0.25.2175)。プレイヤー中心yを±この値に数値クランプ。X方向は無制限。
// 実体は `src/world/labWalls.ts`(世界の形なので world 層が唯一の出どころ)。ここは従来の import 元を
// 壊さないための再輸出(v0.25.2229で 100→200 に拡張。壁の配置も同じ値から導出される)。
export const LAB_CORRIDOR_Y_LIMIT_PX = LAB_CORRIDOR_Y_LIMIT_FROM_WORLD;
// M2(屋外)の道中に置くPHILLガンの弾(社長指示v0.25.2246)。**ゴールから見た**割合で位置を決める
// (0.3=ゴールの30%手前=スタートから70%地点 / 0.6=同60%手前=スタートから40%地点)。
// ゴール(書類)は毎回左右どちらかのランダムなXなので、弾の位置も出撃ごとに変わる。
export const LAB_AMMO_GOAL_FRACS = [0.3, 0.6];
const LAB_AMMO_JITTER_X = 400; // 位置の散らし幅(px)。毎回同じ場所にならないように
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
// ★v0.25.3989: アテンション(ボス出現カットイン)で通信を凍結した印。明けたエッジで表示中の行の
// 尺を張り直すための1bit(モジュール変数=保存不要の揮発でよい)。
let npcDialogueFrozeByAttention = false;
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

// PACING_PUZZLE.md §6.24-UX 確定要件1: 寄り道POIの進入/発動時の通信(1ラン1回/種)。
// **新しいUIは作らない**。既存の左上の会話(NpcDialogue)キューへ1行積む=長文が折り返せて、
// 同時に出る帯バナー(eventBanner)を潰さない(バナーは1枠しかないので上書きになる)。
// 話者はその方角を担当する護衛(既存の「担当NPCが喋る」慣例)。護衛が1人も居ない出撃
// (ストーリーボス等)だけは既存のバナー(=モデル無しの通信)へフォールバックする。
// 戻り値は set() にそのまま混ぜられるパッチ(既に出した種なら空=何もしない)。
const poiIntelPatch = (
  state: GameState,
  kind: PoiKind,
  pos: { x: number; y: number } | null,
): Partial<GameState> => {
  if (!pos || !shouldShowPoiIntel(state.poiIntelShown, kind)) return {};
  const shown = { ...state.poiIntelShown, [kind]: true };
  const text = poiIntelLine(kind);
  const speaker = pickPoiIntelSpeaker(state.escorts, poiSectorIndex(pos));
  const sol = speaker ? soldierByIndex(speaker.soldierIndex) : null;
  if (!sol) {
    return { poiIntelShown: shown, eventBannerText: text, eventBannerUntil: state.gameTime + 4000 };
  }
  // キュー直積み(tryNpcLine のCD/詰まり防止キャップを通さない)=1ラン1回の通信を取りこぼさない。
  return { poiIntelShown: shown, npcDialogueQueue: [...state.npcDialogueQueue, { name: sol.name, text }] };
};
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

// 帰還フェーズ: 通常ストーリーは地点内で離指確認、イベントは3秒滞在、洋館通路は5秒滞在で帰還完了。
const RETURN_CIRCLE_RADIUS = 95;        // 帰還サークル半径(円コリジョン)
export const RETURN_CIRCLE_HOLD_MS = 3000; // イベント帰還の滞在時間(描画の進捗にも使用)
// ステージ6(洋館通路)のゴール(社長指示v0.25.2132): 4000px付近のハッチ床の上で5秒滞在=ゴール(例のサークル)。
// 位置は床タイル境界(FLOOR_REPEAT=520)に揃えて8枚目[3640,4160)をハッチ床に差し替え→中心=3900
// (=「4000px付近」。境界を520の倍数に置くと通常床と紋様が継ぎ目なく繋がる)。前進=負方向。
// サークル位置の補正(社長指示v0.25.2140「扉の床と同じ位置に」): サークル=真上見下ろしの世界レイヤー/
// ハッチ=疑似3D床(corridorLayer)で投影が違うため、タイル中心3900に円を置くと到達時に円だけ上に見える。
// 「ハッチが画面中央(プレイヤーの真下)に見える」のは d=focal*(1/s-1)≒513px 手前に立った時
// (s=(0.5-horizonYr)/(footYr-horizonYr)≒0.45・corridorLayerのCFG連動)なので、円は 3900-513≒3390 に置く。
export const CORRIDOR_GOAL_Y = -3390;        // ゴールサークル中心のworld y(到達時にハッチと重なる補正済み。x=通路中央0)
export const CORRIDOR_RETURN_HOLD_MS = 5000; // 通路ゴールの滞在時間(社長指示「5秒停止」。イベント帰還の3秒は不変)
// 通路ゴールの「近づくとフェードイン」(社長指示v0.25.2151「透明にしておいて床に近づくとフェードイン
// 表示からのタイマー」): 存在(判定)は常時・表示は透明で、この距離まで近づくとrevealedAtを打刻。
// 描画はrevealedAt起点でフェードイン(pixiScene)。滞在タイマーはフェード完了(FADE_MS)後にのみ進む。
export const CORRIDOR_GOAL_REVEAL_DIST = 240; // フェード開始距離(world px・叩き台)
export const CORRIDOR_GOAL_FADE_MS = 600;     // フェードイン長(この後にタイマー始動)
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
  // v0.25.3983: 崩落した城は壁ではない(絵と判定の一致。プレイヤー/敵の両呼び出し元へここ1箇所で効く)。
  castle.collapsedAt !== undefined ? { x: rect.x, y: rect.y } : resolveAabb(rect, [castleRect(castle)]);

// ★城の崩壊(社長指示2026-08-27「城ボス倒したら、城も崩れて消えて。(カメラは向けなくていいので)
// 方角のマークも消えてね」): 城ボス=城の位置を巣(homeX/homeY)に持つ非ストーリーのgiantbat
// (イベント囲いのミニボスgiantbatは巣が囲い座標=対象外。グレンはisStoryBossで対象外)。
// 撃破の瞬間に collapsedAt(Date.now)を打刻する。効果は3つ——①描画(pixiScene.syncCastle)が
// 崩落(震え→加速沈下+フェード=慣性の掟)を再生して以後描かない ②壁判定(上のresolveCastleCollision/
// 弾の遮蔽)が消える ③方角マーカー(syncArrows)が消える。カメラは向けない(社長指示)。
// 呼び出し元=キル合流点の2本(damageEnemyのkill分岐/近接キルヘルパー)。
const collapseCastleOnBossDeath = (enemy: Enemy): void => {
  const st = useGameStore.getState();
  const castle = st.castleEvent;
  if (castle.collapsedAt !== undefined) return;
  if (enemy.type !== 'giantbat' || enemy.isStoryBoss) return;
  if (enemy.homeX !== castle.x || enemy.homeY !== castle.y) return;
  useGameStore.setState(s => ({ castleEvent: { ...s.castleEvent, collapsedAt: Date.now() } }));
  // 崩落開始の砂埃+地響き(②派手さの絵=判定なし。以後の砂埃の波はuseGameLoopが時刻で積む)。
  const fy = castleFootY(castle);
  st.spawnBurst(castle.x, fy, '#9ca3af', 24);
  st.spawnBurst(castle.x - 55, fy - 8, '#6b7280', 14);
  st.spawnBurst(castle.x + 55, fy - 8, '#6b7280', 14);
  st.spawnRing(castle.x, fy, 20, 230, 'rgba(148,163,184,0.75)', 6, 900);
  st.triggerShake(650, 5);
};
// 武器商人はスタート地点(原点)に常駐(社長指示)。各拠点中央の「武器庫」から遠隔利用もできる。
// 開始直後に誤発動しないよう、スポーン(原点)から少し上にずらして設置。
const createWeaponMerchant = (): WeaponMerchant => ({
  x: 0,
  y: -130,
  radius: MERCHANT_INTERACT_RADIUS,
});
// ステージ2(研究所・横長廊下)専用: 商人YはM2_LAB_CORRIDOR_SPEC.md ★未決2への社長承認で追加。
// 他ステージの createWeaponMerchant()(y:-130)は不変・labTheme時のみこの値で上書きする(Xは0のまま)。
// -130は±100クランプの外(到達不能)だったため、プレイヤーが実際に立てる範囲内([-100,100])の
// -60 を既定に採用(プレイヤーがy=-60に立てば距離0で会話圏(radius 58)へ確実に届く。
// 必要なら-50〜-70の範囲で再調整可)。
const LAB_MERCHANT_Y = -60;
const createEventQuestNpc = (): EventQuestNpc => {
  const angle = Math.random() * Math.PI * 2;
  const dist = EVENT_NPC_MIN_DISTANCE + Math.random() * (EVENT_NPC_MAX_DISTANCE - EVENT_NPC_MIN_DISTANCE);
  return {
    // v2(EVENT_QUEST_DESIGN.md §2-2B): 生成時のx/yは「まだ決まっていない値」。実際の出現位置は
    // 4:00の出現時にB2が§2-3の規則で上書きする(生成時の乱数配置は使わない)。
    x: Math.cos(angle) * dist,
    y: Math.sin(angle) * dist,
    radius: EVENT_NPC_INTERACT_RADIUS,
    // v2: 初期status='hidden'(旧'available'は退役。描画スイッチはstatusなのでこれが無いと
    // 0:00から二人が立ったままになる=syncEventQuestNpcのhidden早期returnと対の変更)。
    status: 'hidden',
    questIndex: 0,
    fadeStartedAt: 0,
    dwellMs: 0,
    leftSinceAccept: true, // 生成直後は「外に居た」扱い=初回はそのまま受領できる
    // v2で追加(§2-14「EventQuestNpcに足すフィールド」)。値はB2(飛び去り/飛来の配線)が書く。
    moveStartedAt: 0,
    moveFromX: 0,
    moveFromY: 0,
    moveToX: 0,
    moveToY: 0,
    movePhase: null,
    hopPx: 0,
    // 唯一の出どころはuseGameLoopが出現時に代入するARENA_EVENT_RADIUS(§2-14)。B1では未配線のため
    // プレースホルダの0(design backlog §2-16 (B)#8「triggerRadiusの初期値も未指定」)。
    triggerRadius: 0,
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
// (v0.25.2152) 弾ドロップ率のlocalStorage読込(loadMeleeDropPct)は廃止=常にDEFAULT_MELEE_DROP_PCT起動。
// UI撤去(社長指示)に伴い、端末に残った旧設定値が見えないまま効き続けるのを防ぐ。
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
      phill: clampAmmoPickupAmount(parsed.phill ?? AMMO_PICKUP.phill),
      glauncher: clampAmmoPickupAmount(parsed.glauncher ?? AMMO_PICKUP.glauncher)
    };
  } catch {
    return { ...AMMO_PICKUP };
  }
};

// 装備メニュー(サブ/スキル)の永続化。トップメニューで選んだ装備を localStorage に保存し、起動時に復元する。
const LOADOUT_SUBS_KEY = 'zombie:loadoutSubs';
// SKILL_BUILD_REDESIGN.md §20(B4): 旧キー。B1の暫定でpendingSkills(=同行者選択の入力)の保存先として
// 流用していた。B4でcompanionSkill専用キー(COMPANION_SKILL_KEY)へ正式移行。移行読み出し
// (loadCompanionSkill)のためだけにキー名を残す(新規書き込みはもうしない)。
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
// ★サブウェポンの陳列レベル購入(開発施設・20/50/100G)の永続化(社長指示v0.25.3187)。
// 旧: 開発施設のボタンは unlockedShopSkillCards(=**ラン内値**。resetGameが毎出撃上書き)へ書いており
// **購入が永続していなかった**。社長報告「サブウェポンが買ってないのに全種装備できちゃう」を機に、
// 購入を専用キーで永続化し、**装備メニューの装備条件(Lv1以上=購入済み)**として使う。
const SUB_SHELF_KEY = 'zombie:subShelfLevels';
const loadSubShelfLevels = (): Partial<Record<SubWeaponKey, number>> => {
  try { const r = localStorage.getItem(SUB_SHELF_KEY); const o = r ? JSON.parse(r) : {}; return (o && typeof o === 'object') ? o : {}; }
  catch { return {}; }
};
const saveSubShelfLevels = (m: Partial<Record<SubWeaponKey, number>>): void => {
  try { localStorage.setItem(SUB_SHELF_KEY, JSON.stringify(m)); } catch { /* ignore */ }
};

// ガチャの永続状態: スキル別「被り回数(dupeCount)」と「直近superからのpull数(pity)」。
const GACHA_DUPES_KEY = 'zombie:gachaDupeCounts';
const GACHA_PITY_KEY = 'zombie:gachaPitySinceSuper';
// 階段式価格(v0.25.2344)の段を決める**累計pull数**。セーブを跨いで階段が巻き戻らないよう永続。
const GACHA_PULLS_KEY = 'zombie:gachaPullsTotal';
const loadDupeCounts = (): Partial<Record<SkillKey, number>> => {
  try { const r = localStorage.getItem(GACHA_DUPES_KEY); const o = r ? JSON.parse(r) : {}; return (o && typeof o === 'object') ? o : {}; }
  catch { return {}; }
};
const saveDupeCounts = (m: Partial<Record<SkillKey, number>>): void => {
  try { localStorage.setItem(GACHA_DUPES_KEY, JSON.stringify(m)); } catch { /* ignore */ }
};
const GOLD_BALANCE_KEY = 'zombie:goldBalance';
// SKILL_BUILD_REDESIGN.md §23-2条件4: scrap-builder/warm-up退役の所持者一括返却(冪等・1回きり)。
// localStorageのフラグで二重実行を防ぐ(loadCompanionSkillの「一度だけ移行」と同じ作法)。返却額は
// retiredSkillsRefundTotal(ガチャの被り返金と同額)。store作成前(初期goldBalanceの算出時)に呼ぶため
// addGoldアクションは使わず、ここで直接 goldBalance の初期値へ合算する。
const RETIRED_SKILLS_REFUNDED_KEY = 'zombie:retiredSkillsRefunded';
const loadGoldBalanceWithRetiredRefund = (): number => {
  const raw = loadNumber(GOLD_BALANCE_KEY, 0);
  let refund = 0;
  try {
    if (localStorage.getItem(RETIRED_SKILLS_REFUNDED_KEY) !== '1') {
      refund = retiredSkillsRefundTotal(loadStringArray(OWNED_SKILLS_KEY) as SkillKey[]);
      localStorage.setItem(RETIRED_SKILLS_REFUNDED_KEY, '1'); // 先に立てる(次回ロードで再返却しない)
    }
  } catch { /* ignore */ }
  const next = raw + refund;
  if (refund > 0) saveNumber(GOLD_BALANCE_KEY, next);
  return next;
};
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

// アバターシステム(試験・第1弾)。選択中アバターid(または未装備=null)を1キーで永続(視覚のみ・
// resetGame では消さない=carriedEquipと違い「ラン単位の持ち越し」ではなく恒久設定)。
const AVATAR_KEY = 'zombie:avatar';
const loadAvatarId = (): AvatarId | null => {
  try { const r = localStorage.getItem(AVATAR_KEY); return isAvatarId(r) ? r : null; } catch { return null; }
};
const saveAvatarId = (id: AvatarId | null): void => {
  try {
    if (id) localStorage.setItem(AVATAR_KEY, id);
    else localStorage.removeItem(AVATAR_KEY);
  } catch { /* ignore */ }
};

// SKILL_BUILD_REDESIGN.md §20(B4発注文20-1点1/2): 同行者(守護霊系3種)の正式フィールド。
// B1まではpendingSkills(旧・出撃前スキル持ち込みUI用フィールド)を暫定で「同行者選択の入力」に
// 流用していた(MissionSelect.tsxのCOMPANION_SKILL_KEYS絞り込みコメント参照)。B4でここへ切り出す。
const COMPANION_SKILL_KEY = 'zombie:companionSkill';
const isCompanionSkillKey = (v: unknown): v is SkillKey =>
  typeof v === 'string' && (COMPANION_SKILL_KEYS as readonly string[]).includes(v);
const saveCompanionSkill = (key: SkillKey | null): void => {
  try {
    if (key) localStorage.setItem(COMPANION_SKILL_KEY, key);
    else localStorage.removeItem(COMPANION_SKILL_KEY);
  } catch { /* ignore */ }
};
// §20-1点2(移行)+実装精度の規律4(配線ロジックは純関数に切り出してテスト): 旧pendingSkills配列
// (守護霊系以外が混ざっていてもよい)から移行先の同行者キーを決める判定だけを純関数へ切り出す。
// 優先度はselectedGhostMode(ghostOnline.ts)と同じ(own>top>random)= 旧セーブで複数残っていても、
// 旧仕様が実際に効かせていたモードと同じ結果になる。該当なし(空/守護霊系以外のみ)はnull=無視。
export const migrateCompanionFromLegacy = (legacy: readonly SkillKey[]): SkillKey | null =>
  legacy.includes('guardian-spirit') ? 'guardian-spirit'
    : legacy.includes('ghost-slayer') ? 'ghost-slayer'
      : legacy.includes('ghost-helper') ? 'ghost-helper'
        : null;
// 新キーに値が無ければ旧キー(LOADOUT_SKILLS_KEY=旧pendingSkills保存先)を読み、移行先が決まれば
// 新キーへ書き移す(以後は新キーが正)。旧セーブでクラッシュ/消失は起きない(壊れた値は素通りせず無視)。
const loadCompanionSkill = (): SkillKey | null => {
  try {
    const raw = localStorage.getItem(COMPANION_SKILL_KEY);
    if (isCompanionSkillKey(raw)) return raw;
    const legacy = loadStringArray(LOADOUT_SKILLS_KEY) as SkillKey[];
    const migrated = migrateCompanionFromLegacy(legacy);
    if (migrated) saveCompanionSkill(migrated); // 一度だけ移行して新キーへ確定させる(以後は新キーが正)
    return migrated;
  } catch { return null; }
};

// 装備を該当スロットへ装着した新 Player を返す純関数(同スロットは置換=破棄)。最大体力の増減は
// player.maxHealth へベイクし、増分ぶんだけ現HPも底上げ(減少時は上限へクランプ)。
// selectUpgrade(装備取得)から使う。
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

// ★ダンスフロア(shijin)退役の一回きりマイグレーション(社長裁定2026-08-20「消そう。曲も削除で」)。
// RETIRED_SKILLS の返金(loadGoldBalanceWithRetiredRefund)と同じ作法: localStorageフラグで冪等化し、
// store作成前に走らせる(以降の loadSubShelfLevels()/goldBalance 読みは掃除済みの値を見る)。
//  ①陳列(purchasedSubLevels)から shijin を除去し、支払った累計G(20/50/100=v0.25.3185価格)を返金
//  ②保存済みの装備(pendingLoadout)からも除去(残すと resetGame のフィルタ頼みになる)
// 入手経路(開発施設リスト/装備メニュー)はUI側で RETIRED_SUB_WEAPONS をフィルタ=二度と買えない。
const RETIRED_SUBS_REFUNDED_KEY = 'zombie:retiredSubsRefunded';
const SHELF_COST_CUMULATIVE = [0, 20, 70, 170]; // index=陳列Lv。20G/50G/100Gの累計
const retireSubWeaponsOnce = (): void => {
  try {
    if (localStorage.getItem(RETIRED_SUBS_REFUNDED_KEY) === '1') return;
    localStorage.setItem(RETIRED_SUBS_REFUNDED_KEY, '1'); // 先に立てる(再実行しない)
    const shelf = loadSubShelfLevels();
    const lv = Math.max(0, Math.min(3, shelf['shijin'] ?? 0));
    if (lv > 0) {
      delete shelf['shijin'];
      saveSubShelfLevels(shelf);
      saveNumber(GOLD_BALANCE_KEY, loadNumber(GOLD_BALANCE_KEY, 0) + SHELF_COST_CUMULATIVE[lv]);
    }
    const subs = loadStringArray(LOADOUT_SUBS_KEY);
    if (subs.includes('shijin')) saveStringArray(LOADOUT_SUBS_KEY, subs.filter(k => k !== 'shijin'));
  } catch { /* ignore(localStorage無し環境=テスト等では何もしない) */ }
};
retireSubWeaponsOnce();

// PACING_PUZZLE.md §5.14 M13: 宿敵(ネームド)のメタ保存({型,名前,因縁回数}の1体分のみ・
// 新たに別の敵に殺されたら上書き)。goldBalance等と同じtry/catch guarded JSON永続化パターン。
const NAMED_FOE_KEY = 'zombie:namedFoe';
const loadNamedFoe = (): NamedFoeMeta | null => {
  try {
    const r = localStorage.getItem(NAMED_FOE_KEY);
    if (!r) return null;
    const o = JSON.parse(r);
    if (!o || typeof o !== 'object' || typeof o.type !== 'string' || typeof o.name !== 'string') return null;
    // v0.25.3694: 除外型(幻影等)が過去の穴で保存された端末の浄化(sanitizeNamedFoe)。
    return sanitizeNamedFoe({ type: o.type as EnemyType, name: o.name, grudge: typeof o.grudge === 'number' ? o.grudge : 0 });
  } catch { return null; }
};
const saveNamedFoe = (m: NamedFoeMeta | null): void => {
  try {
    if (m) localStorage.setItem(NAMED_FOE_KEY, JSON.stringify(m));
    else localStorage.removeItem(NAMED_FOE_KEY);
  } catch { /* ignore */ }
};

// Light knockback applied to a normal enemy each time a bullet connects.
// 社長指示v0.25.3443「打った時のノックバックも小さすぎて認識できない」: 43→86(旧64→43の2/3化を撤回して
// 2倍へ。単発≈12px移動=見て分かる叩き台)。knockbackEnemyの全発生源(銃/爆発/デコイ等)が同じ物差しで太る
// =「全体的に動きを大きく見せる」の一環。強すぎたら実機でこの1本を調整。
export const BULLET_KNOCKBACK_SPEED = 86;

// Crit → stun duration (gameTime ms). A stunned enemy is a finisher target.
export const STUN_DURATION_MS = 5000;
export const CRIT_DAMAGE_MULT = 1.5;
// Bosses use a beefier crit ruleset: gun crits hit 5×, and meleeing a stunned
// boss deals 5× melee damage (and shakes off the stun) instead of an instakill.
export const BOSS_CRIT_DAMAGE_MULT = 5;
export const BOSS_MELEE_STUN_MULT = 5;
// v0.25.2490(社長裁定・雑魚ヘイト): ゴースト起因ダメージを受けた雑魚がゴーストへ向く時間(gameTime ms)。
// 被弾のたびに更新。切れる/ゴースト消滅でプレイヤー狙いへ戻る(resolveEnemyTarget側)。実機調整前提の叩き台。
export const GHOST_MOB_HATE_MS = 5000;
/**
 * v0.25.2607(社長裁定): その敵をノックバックで押してよいか。
 * **ボスは通常の殴り/弾では押されない。押し道具(鞭・シールドバッシュ)を当てた時だけ押される。**
 * 通常敵は常に true(従来どおり)。押し道具側は knockbackUntil と同じ期限で knockbackShoveUntil を
 * 立てる=時刻で自然に切れるので解除処理は要らない。
 *
 * なぜ要るか(直した不格好さ2つ):
 *  ① 紫の完全気絶中、殴るたびに巨体がズルズル動く(気絶は技を解除する=「技の最中は押されない」
 *     ガードが外れ、押しが通っていた)。
 *  ② 天使がイベントのサークルから押し出され、次フレームの閉じ込めクランプに引き戻される綱引き
 *     =「押される→すぐ戻る」。押す力を消せば綱引き自体が起きない。
 *
 * v0.25.2895: isHiddenBossの早期returnをknockback適用の後ろへ移し、11体(裏ボス4/天使6/idol)にも
 * 押し道具が届くようになった(②の「天使が…」は元々ここに到達できず絵に描いた餅だった)。
 *
 * PACING_PUZZLE.md §14-4-2(新死神・新裁定2026-08-28): 死神本体は**押し道具を含め一切ノックバックしない**
 * (被弾はダメージFXのみ)。既存の「ボスは押し道具だけ効く」例外よりさらに強い免除なので、
 * isBossType分岐より先に判定する(KB免除の型=このcanShoveEnemyを唯一の適用チョーク点として流用)。
 */
export const canShoveEnemy = (
  enemy: Pick<Enemy, 'type' | 'knockbackShoveUntil' | 'reaperChaser'>,
  now: number,
): boolean => {
  if (isTerminalReaper(enemy)) return false;
  return !isBossType(enemy.type) || now < (enemy.knockbackShoveUntil ?? 0);
};

// ★ボスはクリティカルで「痺れない」(社長指示v0.25.2422)。代わりに一定時間**動きが半減**する。
// なぜ: 5秒の完全停止は、ソウル式の「技を読んで避ける」ボス戦を成立させなくする(止まっている相手に
// 読みは要らない)。半減なら、ボスは技を出し続ける=読みの練習台であり続けたまま、クリの手応えは残る。
// 既存の「5クリで完全気絶(紫)」(bumpBossCrit・裏ボス専用)は**別経路として据え置き**=フィニッシュ受付の
// 入口はそのまま。ここで消すのは「1クリごとの5秒スタン」だけ。
// v0.25.2603(社長裁定「黄色3秒 + 頻度を実際に半分へ」): 半減窓は**3秒**。
// 旧値は STUN_DURATION_MS(5000)=「旧スタンの長さをそのまま流用しただけ」で、半減用に選んだ値では
// なかった。紫の完全気絶(BOSS_FULLSTUN_MS=3000)と長さが揃い、「黄色3秒=半減 / 紫3秒=完全停止」と
// 読める。同時に入った critFlinchPatch(技と技の間のひるみ)で窓の中身が実際に効くようになったため、
// 長さは短くてよいという判断。
export const BOSS_CRIT_SLOW_MS = 3000;
export const BOSS_CRIT_SLOW_MULT = 0.5;            // 「動きが半減」(社長指示の文言そのまま)
/**
 * クリがボスに入った時の差分。**ボス以外には何もしない**(通常敵のスタンは完全に不変)。
 * 呼び出し側は「スタンを設定する代わりに」これを使う。
 */
// v0.25.3169: 対象は `isBossType` ではなく **`usesBossCrit`**(=isBossType から pumpkin /
// lab-zombie-3 を除いたもの)。この2体は紫にならないので「固まらない」だけを受けていた。理由は
// enemyUtils.ts の usesBossCrit のコメントに集約してある。
// v0.25.3491(★ボスの「止める効果」の作り直し・①逓減): 黄色クリの窓も「止める」カテゴリの一員
// (社長整理「黄色クリの窓と罠の拘束は同じ効果」)なので、bossCritSlowPatchが単一の出どころである
// ことを利用してここでDRを通す(呼び出し元=damageEnemy中央/近接4箇所とも無改修のまま恩恵を受ける)。
export const bossCritSlowPatch = (enemy: Enemy, gameTime: number): Partial<Enemy> | null => {
  if (!usesBossCrit(enemy.type)) return null;
  const dr = evaluateBossStopDr(enemy, Date.now());
  if (!dr.allowed) return { ...dr.patch }; // 完全耐性中/3回目: 半減窓は出さない(DR状態だけ進める)
  return { bossSlowUntil: gameTime + BOSS_CRIT_SLOW_MS * dr.durationMult, ...dr.patch };
};
// v0.25.3491: 近接4箇所(ナイフ/クローン/刀/鞭)専用の広い版。**これらの呼び出し元は元々
// 「bossCritSlowPatchがnullなら直書きで5秒スタン」という共通フォールバックを持っており、それは
// isBossTypeでありさえすれば usesBossCrit=false(pumpkin/lab-zombie-3)にも無条件に効いていた**
// (=元から「気絶」カテゴリでボスに掛かっていた効果。ここへDRを掛けるのは新しい効果の追加ではなく
// 既存の無制限スタンにDRを掛けるだけ)。damageEnemy中央(gun-crit等)はこの関数を使わない——
// pumpkin/lab-zombie-3はそちら側では意図的に「何も止めない」(旧バグ修正=銃はstunEnemyで5秒完全
// 停止させない、のまま。bossCritSlowPatchだけを呼ぶ=新しい効果を生やさない)。
export const bossCritStopPatch = (
  enemy: Enemy, gameTime: number, stunDurationMult: number,
): Partial<Enemy> | null => {
  if (!isBossType(enemy.type)) return null;
  if (usesBossCrit(enemy.type)) return bossCritSlowPatch(enemy, gameTime);
  const dr = evaluateBossStopDr(enemy, Date.now());
  if (!dr.allowed) return { ...dr.patch }; // 完全耐性中/3回目: 停止効果は出さない(DR状態だけ進める)
  return { stunUntil: gameTime + STUN_DURATION_MS * stunDurationMult * dr.durationMult, ...dr.patch };
};
/** ボスの移動速度に掛ける倍率(半減中なら0.5)。ボス以外・非半減中は1。 */
export const bossSlowMult = (enemy: Enemy, gameTime: number): number => {
  const crit = (enemy.bossSlowUntil !== undefined && gameTime < enemy.bossSlowUntil) ? BOSS_CRIT_SLOW_MULT : 1;
  // 社長指示v0.25.3280「グラヴィティはボスも減速させて」: 渦内のボスは移動半減。この関数は
  // 全ボス移動経路(城ボス/天使/追跡式の計13箇所)の共通チョークなので、ここに乗せれば全員に効く。
  // 重なった時は強い方だけ(乗算だと過剰)。CD2倍(bossCritCdMult)には乗せない。
  const grav = (enemy.gravitySlowUntil !== undefined && gameTime < enemy.gravitySlowUntil) ? GRAVITY_SHOT_BOSS_SLOW_MULT : 1;
  // 社長裁定v0.25.3280: アイスショットのボス解禁(強度半分は適用側でpctに掛けて書き込み済み)。
  // ボスだけここで読む(通常敵はiceSlowMult側=二重掛け防止でisBossTypeで排他)。
  const ice = (isBossType(enemy.type) && enemy.iceSlowUntil !== undefined && gameTime < enemy.iceSlowUntil)
    ? Math.max(0, 1 - (enemy.iceSlowPct ?? 0)) : 1;
  return Math.min(crit, grav, ice);
};

// CRIT-UNIFY §9.2(社長裁定・クリ再設計確定仕様): ①クリ効果=移動半減(上)+次行動CD2倍。
// 窓はbossSlowMultと同じ`bossSlowUntil`(=既存の半減窓・5秒)を共用する(新しいフィールドを増やさない)。
export const BOSS_CRIT_CD_MULT = 2; // 「攻撃間隔が2倍に」(社長裁定の文言そのまま)
/** ボスの「次行動までのCD」に掛ける倍率(クリ窓中なら2倍)。ボス以外・窓外は1=無改変。 */
export const bossCritCdMult = (enemy: Enemy, gameTime: number): number =>
  (usesBossCrit(enemy.type) && enemy.bossSlowUntil !== undefined && gameTime < enemy.bossSlowUntil) ? BOSS_CRIT_CD_MULT : 1;

// SKILL_BUILD_REDESIGN.md §28(B7): アイスショット(ice-shot)の鈍足。ボスは対象外(§28-2)。
// 移動速度に掛ける倍率(鈍足中なら1-iceSlowPct)。ボス・非鈍足中は1=無改変。
export const iceSlowMult = (enemy: Enemy, gameTime: number): number =>
  (!isBossType(enemy.type) && enemy.iceSlowUntil !== undefined && gameTime < enemy.iceSlowUntil)
    ? Math.max(0, 1 - (enemy.iceSlowPct ?? 0)) : 1;

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
  // v0.25.3170: 矩形の選び方は `enemyRangeRect`(enemyUtils)へ一本化=**銃と近接が同じ相手を測る**。
  const r = enemyRangeRect(e);
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
  // 社長指示v0.25.3300 ナイフマスター覚醒(Lv3): 近接範囲が常にハンティングと同じ間合いになる。
  // その場合ハンティング(溜め)はさらにそこから相対的に伸びる(ボーナスがもう1段乗る)。
  // 参照Lv=ハンティング所持ならそのLv、未所持はLv1相当(subWeaponLevels未設定→1)。
  const level = Math.max(1, Math.min(3, player.subWeaponLevels['striker-hunting'] ?? 1));
  const kmBase = skillLevel(player, 'knife-master') >= 3 ? HUNTING_MELEE_RADIUS_BONUS_BY_LEVEL[level] : 0;
  if (!player.huntingCharged) return MELEE_RADIUS + kmBase;
  return MELEE_RADIUS + kmBase + HUNTING_MELEE_RADIUS_BONUS_BY_LEVEL[level];
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

// Counter-on-release tuning. Any hostile attack/projectile that hits the player
// while the acceptance window is open is countered/reflected.
// ★v0.25.3943: COUNTER_WINDOW は「振り1サイクルの長さ」(前隙200+刃200)としてCD・演出の基準に残る。
// **受付窓そのものは COUNTER_ACCEPT_MS(下)に分離した**——長さの意味が別物になったため。
export const COUNTER_WINDOW = 400; // ms of one swing cycle (windup 200 + blade 200) — CD/演出の基準
/**
 * ★近接の前隙(社長裁定2026-08-24「近接前隙を200にして」・SAME_ARENA.md §7)。
 * 指を離した瞬間に**カウンター窓とCDは張る**が、**当たり判定はこの時間だけ遅れて出る**。
 * しゃがみの絵(`MELEE_POSE_READY_FRAC`)はこの数字から導く=**唯一の出どころ**。
 * 打ち合いは「後から振った方の窓が、先に振った方の斬撃を捕まえる」=後出しが勝つ。
 */
export const MELEE_WINDUP_MS = 200;
/**
 * ★カウンターの受付時間(社長裁定2026-08-26「せきろうにしようか」・隻狼型)。
 * **受付は「押した瞬間」から COUNTER_ACCEPT_MS だけ**(窓 = [押した瞬間, +300ms]・v0.25.3951で200→300へ延長)。
 * - 予告文法「赤が消え切った瞬間=当たり」と押す瞬間が一致する(目と指が同じ時刻を見る)。
 * - 早置きは**窓が先に切れて失敗**する=v0.25.3926の狙い(「先に振っておけば確実」潰し)は保たれる。
 * - 過去の裁定(事実): v0.25.3926(2026-08-25)は「刃が出ている200msだけ」=[+200,+400]のダクソ型
 *   だった。実機で「合わせるのが難しい」(予告の消え切りと押しどきが200〜400msズレる)ため隻狼型へ。
 * 隻狼の実数値: 発生0F・受付12F(0.2秒)=本値と同一。
 */
export const COUNTER_ACCEPT_MS = 300; // ms the acceptance window stays open FROM the trigger(社長裁定2026-08-26「300msに100延長で」。隻狼型導入時v0.25.3943は200=隻狼の12Fと同値だった=事実)
/**
 * ★カウンターが成立するか(唯一の判定・v0.25.3926で1本化)。
 */
// ★型はインラインのオブジェクト literal で書かない: `meleeSwingCommit.test.ts` の台帳スキャナが
// 「`counterWindowEnd:` を書いている場所」として数えてしまうため(Pickなら書き込みではないと分かる)。
export const isCounterActive = (
  p: Pick<Player, 'counterWindowStart' | 'counterWindowEnd'>, now: number,
): boolean => now >= p.counterWindowStart && now <= p.counterWindowEnd;
/**
 * ★近接の踏み込み(社長裁定2026-08-24・SAME_ARENA.md §7-4)。前隙の**頭**で `lastDirection` へ滑る。
 *
 * 狙い(社長の言葉): 「踏み込む(しゃがみ)を早めに着地させれば、自ずと回避にも使える様になる」。
 * 前隙200msの内訳が **0〜90ms=踏み込み(移動) → 90〜200ms=足を着いて振りかぶる → 200ms=斬る**
 * になり、**物理的に正しい順序**(踏み込んで、足を着いて、振る)になる。
 *
 * 速度域: 50px/90ms = 平均555px/s = 素の足(`PLAYER_BASE_SPEED`=87px/s)の**約6.4倍**=回避の速さ。
 * 刀の一閃(154px/180ms)より遅く短いので**一閃の格は保たれる**。
 * **無敵は付けない**(社長「無敵はつけない。すでにカウンターがあるので」)=「速く動いて避ける」であって
 * 「判定をすり抜ける」ではない。今日作った同条件の土俵を壊さない。
 * 向きは `lastDirection`=**近接を振る向きと同じ**。前進中は前へ・後退中は後ろへ踏み込む
 * (=引きながらの牽制)。**入力に対する結果が常に一定**——社長指摘「前に出るのか出ないのか
 * 分からない方が使いづらい」により、当初案の「敵がいる時だけ詰める」は取り下げた。
 */
/**
 * ★設置物の耐久値(社長指示2026-08-24「それぞれに耐久値設定して」)。
 *
 * **壊せるのは敵対側(幻影)が置いた物だけ**(社長「もちろん幻影のに決まってんだろ」)。
 * 自分の設置物は壊れない=誤爆で自分のタレットを壊す事故を作らない。
 *
 * 単位はダメージ。目安は**近接の素ダメージ**(ファイティングナイフ=22)で:
 *  - トラップ / 地雷 = **1撃**(仕掛け物は脆い。踏まずに処理できるのが遊びの主眼)
 *  - デコイ = **2撃**(囮なので少しだけ粘る)
 *  - タレット = **3撃**(居座って撃ち続ける=盤面でいちばん硬い)
 * **盾は対象外**——`SHIELD_HP_BY_LEVEL`(10/30/60)+接触ダメージという**独自の体系**を既に持っており、
 * ここへ混ぜると耐久の意味が二重になる(社長の「選り分け」で対象外に置いた物)。
 */
export const PLACED_DURABILITY = {
  'marksman-trap': 20,
  'sensor-mine': 20,
  decoy: 45,
  turret: 70,
} as const;

export const MELEE_LUNGE_PX = 30; // 社長調整2026-08-25(50→30)
export const MELEE_LUNGE_MS = 90;
/**
 * ★鞭の踏み込み距離(社長指示2026-08-24「鞭は踏み込み20で」)。
 * 鞭はリーチ150px(素の近接74pxの倍)なので、**そもそも踏み込む必要が薄い**。
 * 同じ50px踏み込むと「長物なのに毎回懐へ入る」ちぐはぐな動きになる=20pxに留める。
 */
export const WHIP_LUNGE_PX = 20;
/**
 * その主語の**踏み込み距離**。`meleeWindupMs` と同じ作法で、**武器ごとの値をここ1箇所に集める**
 * (踏み込みを測る側=プレイヤー/守護霊/幻影の3箇所が必ずこの関数を通る)。
 */
/**
 * ★近接の踏み込みを二値化(社長指示2026-08-28「立ちと歩きの時はその場で振り で(移動無し)、
 * 完全フリックしながらの離しで今の移動で。(中間が無くなるってこと)」・SAME_ARENA.md §7)。
 * 旧v0.25.3957の中間段(歩き=20px)は廃止=立ち/歩きは踏み込み0px(その場で振る)。
 * 「走り」の判定は現状維持の2本のOR(どちらも叩き台・実機で絞る):
 *  - スティックの傾きが強い(>=0.7)まま指を離した=タッチの走り
 *  - 実速度が自分の基礎速度の75%以上=キーボード/バフ/スケーター等(リロード減速中でも傾きで拾える)
 */
export const MELEE_RUN_STICK_MIN = 0.7;
export const MELEE_RUN_SPEED_FRAC = 0.75;
export const isRunningForMeleeLunge = (
  p: Pick<Player, 'vx' | 'vy' | 'speed'>,
  swipeDirection: { x: number; y: number } | null,
  swipeStrength: number,
): boolean =>
  (swipeDirection !== null && swipeStrength >= MELEE_RUN_STICK_MIN)
  || Math.hypot(p.vx, p.vy) >= p.speed * MELEE_RUN_SPEED_FRAC;
/**
 * running=false(止まり/歩き)は踏み込み0(その場で振る)。走りは従来の武器別距離。
 * 守護霊/幻影は接近から振る=常に「走り」扱いで従来どおり
 * (自分の傾き入力を持たないため。非対称が気になれば各自の実速度判定を配線する=保留)。
 */
export const meleeLungePx = (player: Player, running: boolean = true): number =>
  running ? (player.subWeapons.includes('whip') ? WHIP_LUNGE_PX : MELEE_LUNGE_PX) : 0;
/**
 * その主語(プレイヤー / 疑似Player)の**近接の前隙**。前隙を測る側は `MELEE_WINDUP_MS` を
 * 直接読まず**必ずこの関数を通す**——武器ごとに変えたくなった時、**ここ1箇所に分岐を足せば
 * 判定も絵も同時に追従する**(測る場所が散らばっていると、片方だけ直って嘘の絵になる)。
 *
 * **現在は全武器200ms**。一度 鞭だけ250msにしたが、**社長裁定2026-08-24「200でいこ」で撤回**
 * (鞭は `WHIP_DAMAGE_MULT`=0.25 の低ダメージ役なので、出まで遅くすると重くなり過ぎる)。
 * 刀の一閃(`triggerKatanaDash`)はこの経路を通らない=別建て(SAME_ARENA.md §7-2)。
 */
export const meleeWindupMs = (_player: Player): number => MELEE_WINDUP_MS;
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
// 社長指示v0.25.3270: 反射神経の反撃爆発・ボムカウンターのカウンター成立時自機中心爆発、
// 両方とも被弾した敵への実距離50pxノックバックで揃える(knockbackSpeedFor(50, KNOCKBACK_DURATION)相当)。
export const SKILL_BLAST_KB_PX = 50;
// ---- 社長指示v0.25.3300: 覚醒(Lv3)効果の定数群 ----
// ボムカウンター覚醒: 爆発ノックバックの実距離(通常時=SKILL_BLAST_KB_PX 50)。
export const BOMB_COUNTER_AWAKEN_KB_PX = 100;
// ナイト覚醒: 被ダメージ完全無効化の確率(社長「10%でもいいかも?バランス次第」=ここで調整)。
export const KNIGHT_AWAKEN_NULLIFY_CHANCE = 0.2;
// スケーター覚醒: 降車投擲の着弾バッシュが大爆発になる(範囲×1.8=「大爆発」の共通倍率)。
const SKATER_AWAKEN_BLAST_RADIUS_MULT = 1.8;
// クリティカルアップ覚醒: 既にクリで体勢が削れる命中(直撃銃クリ等)の削り量の倍率。
export const CRIT_UP_AWAKEN_POSTURE_MULT = 1.5;
// スナイパー覚醒: 距離ボーナスが従来の70%の距離で上限に到達する(100px条件なら70pxで達成)。
export const SNIPER_AWAKEN_DIST_FRAC = 0.7;
// エクスプローダー覚醒: 爆発系ノックバックの距離倍率。
export const EXPLODER_AWAKEN_KB_MULT = 1.5;
// コンボマスター覚醒: コンボが途切れても攻撃力を維持する時間(次のコンボ開始で自然リセット)。
export const COMBO_MASTER_AWAKEN_HOLD_MS = 20000;
// 救難信号覚醒: 着弾のたびに、さらに連続してもう1体現れる確率。
export const RESCUE_SIGNAL_AWAKEN_CHAIN_CHANCE = 0.2;
// ゴールドラッシュ覚醒: スクラップ取得量+50%。
export const GOLD_RUSH_AWAKEN_SCRAP_MULT = 1.5;
// 延焼弾覚醒: 感染判定の接触パッド(燃焼中の敵の判定箱をこの分だけ広げて接触を取る)。
const INCENDIARY_SPREAD_PAD_PX = 4;
// 延焼弾覚醒: 感染判定のスロットル打刻(gameTime基準。ランをまたいでも|差|で判定するので実害なし)。
let burnSpreadLastAt = 0;
// 吸血覚醒: 近接ヒット1スイングごとの回復(最大HP比)。
export const VAMPIRE_AWAKEN_MELEE_HEAL_FRAC = 0.01;
// ランナー覚醒: 加速中の被ダメージ20%軽減。「加速中」=速度ボーナスのランプが半分以上
// 立ち上がっている間(叩き台。RAMP_FULL_MS=1.5秒の半分=同方向へ0.75秒走り続けた状態)。
export const RUNNER_AWAKEN_DR_MULT = 0.8;
export const RUNNER_AWAKEN_RAMP_FRAC_MIN = 0.5;
export const runnerAwakenDamageMult = (player: Player): number =>
  skillLevel(player, 'runner') >= 3 &&
  Math.min(1, player.speedRampSustainMs / RAMP_FULL_MS) >= RUNNER_AWAKEN_RAMP_FRAC_MIN
    ? RUNNER_AWAKEN_DR_MULT
    : 1;
// エクスプローダー覚醒(Lv3)の爆発KB距離倍率(主語=その爆発の持ち主)。全爆発KB地点がこれを乗算する。
export const skillExplosionKbMult = (player: Player): number =>
  skillLevel(player, 'exploder') >= 3 ? EXPLODER_AWAKEN_KB_MULT : 1;
// スラッシャーのチェーン攻撃時の踏み込み。
// v0.25.3258「連続攻撃は20px前進(慣性入れて)」の固定20pxは、★v0.25.3540 社長発案の**自動追尾**へ
// 置き換えた。距離の式と上限は `src/utils/slasherLunge.ts`(純関数+テスト)に置いてある。
// パニッシャーの巻き込み判定の拡張幅(社長指示v0.25.3260「広めに」・叩き台)。
export const PUNISHER_HIT_PAD_PX = 16;
// パニッシャー巻き込み成立時の画面シェイク(社長指示v0.25.3265・描画のみ・叩き台)。
export const PUNISHER_TWO_BEAT_MS = 150; // 社長指示v0.25.3299「ダン!ダン!と二段当たってるのがわかる遅延」: 接触→パニッシャー発火までの一拍
export const PUNISHER_SHAKE_MS = 200;
export const PUNISHER_SHAKE_MAG = 4;
export const SLASHER_LUNGE_MS = 160;
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
// 実距離100px(社長指示v0.25.3270・knockbackSpeedFor(100,280)相当)。モジュール初期化順の都合で
// knockbackSpeedFor呼び出しはしない(この定数の定義が同関数の定義より前方にあるため)。
const SHIELD_BASH_KNOCKBACK_SPEED = 714;
// スケボー新仕様(社長指示): ダブルタップ乗車→指離しで投擲。1秒以上乗車で発動、未満は消えるだけ。
const SKATER_RIDE_MIN_MS = 1000;        // 投擲発動に必要な最低乗車時間(1秒)
const SKATEBOARD_SPEED = 900;           // 投擲したスケボーの飛翔速度(px/s・私案)
const SKATEBOARD_DURATION_MS = 700;     // 飛翔寿命(≒飛距離。私案)
const SKATEBOARD_SIZE = 40;             // スケボー弾の当たり/表示サイズ
const SKATEBOARD_BASH_RANGE = 140;      // ヒット時バッシュの範囲(半径・前方寄り)
// After being shoved by a melee counter, an enemy is immune to further melee
// knockback for this long (damage still lands) so it can't be locked forever.
export const KNOCKBACK_IMMUNE_MS = 1750;
// 社長報告v0.25.3474「自動タレット/tier3サブマシンガンの連射でボスが完全に動けなくなる」対策。
// v0.25.3477はここに固定CD(BOSS_KNOCKBACK_STOP_IMMUNE_MS=1200ms一律・canApplyKnockbackStop)を
// 応急実装していたが、v0.25.3491(★ボスの「止める効果」の作り直し・①逓減=社長裁定「1+2」)で
// 汎用DR(src/utils/bossStopDr.ts・evaluateBossStopDr)へ発展・置き換えた。「ノックバック/黄色
// クリの窓/罠の拘束/気絶」を1カテゴリとして数える都合上、この関数専用のCD機構は廃止し
// knockbackEnemy 側は evaluateBossStopDr を直接呼ぶ(定義はbossStopDr.ts参照)。
export const REFLECT_DAMAGE_MULTIPLIER = 10.0; // countered/reflected bullets hit 10× harder(社長指示で60→10)
export const REFLECT_SPEED_MULTIPLIER = 2.0; // カウンター反射弾の速度倍率(社長指示v0.25.1731で1.8→2.0)

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
// 一閃の移動速度(px/s)。距離/所要時間から導出した派生定数(値の意味は不変)。
// v0.25.2518: 守護霊にも同じロコモーションを効かせるため、インライン計算を1箇所へ寄せた。
export const KATANA_DASH_SPEED = KATANA_DASH_DISTANCE / (KATANA_DASH_MS / 1000);
// 一閃後のクールダウンは既存近接(カウンター)と同じ長さ。
export const KATANA_DASH_COOLDOWN_MS = COUNTER_WINDOW + COUNTER_COOLDOWN;
// 着地後の硬直(後隙)。刀・村雨共通。着地から この時間 は移動も次の一閃も不可。
export const KATANA_DASH_RECOVERY_MS = 200;
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
// スラム後ジャンプ離脱(ホップ・裁定: DEVELOPMENT_LOG v0.25.2487 / research/COUNTER_CRIT_LEDGER.md §8)。
// 斬り下ろし対象が生き残った(=実質ボス)場合だけ、既存の着地処理を全部終えた後に安全圏へ短くホップする
// (ボス密着着地→確定被弾の対策。通常敵スラムは即死するため対象外=1bit不変)。
export const WIRE_HOP_MS = 220;     // ホップ移動の所要時間(叩き台・実機調整前提)
export const WIRE_HOP_MARGIN = 24;  // 着地点=対象AABB外のマージン(叩き台・実機調整前提)
// 復帰フラグ: ?wirehop=0 で無効化(完全に従来挙動=スラム着地のみでホップしない)。
export const WIRE_HOP_ENABLED = typeof window === 'undefined' || new URLSearchParams(window.location.search).get('wirehop') !== '0';

// 敵タイプ → 死因表示用の日本語ラベル。
const ENEMY_DEATH_LABELS: Record<string, string> = {
  zombie: '変異体(徘徊型)',
  skeleton: '変異体(痩躯型)',
  ghost: '変異体(抱卵型)',
  bat: '吸血コウモリ',
  werewolf: '変異体(獣化型)',
  plant: '変異体(定着型)',
  pumpkin: '変異体(肥大型)',
  driller: '削岩型', // PACING_PUZZLE.md §9-2(社長指示 2026-08-20)
  logger: '伐採人', // PACING_PUZZLE.md §14-3裁定済み#1(社長指示2026-08-28)
  giantbat: '変異体(飛行型)',
  reaper: '死神',
  hangedman: '使者', // PACING_PUZZLE.md §14-4-3(死神の技「使者」が召喚する耐久武器)
  'lab-zombie-1': '研究施設の変異体(Lv1)',
  'lab-zombie-2': '研究施設の変異体(Lv2)',
  'lab-zombie-3': '研究施設の変異体(Lv3)',
  // UI名称統一バッチ(社長指示v0.25.3443「死因や資料室など他のUIも名前を揃える」): 固有名ボスの表示は
  // カットイン台帳(src/data/bossCutin.ts)の和名に統一(名前の正本は台帳1箇所)。
  // ※旧ローマ字表記(v0.25.3199 CODE削除後の素のローマ字)が焼き込まれた永続記録(年表等)は
  //   namedEnemy.ts の読み時正規化が和名へ変換する。宿敵32名(ギリシャ神話)はローマ字のまま=対象外。
  mimir: 'ミーミル',
  jormungand: 'ヨルムンガルド',
  skadi: 'スカジ',
  thor: 'トール',
  miguel: 'ミゲル',
  jibril: 'ジブリル',
  rafi: 'ラフィ',
  // PACING_PUZZLE.md §6.28-0★(バッチM52・ロットL1): ゲート2の天使ボス4〜6体目。
  uri: 'ウリ',
  suriel: 'スリィエル',
  acrasiel: 'アクラシエル',
  idol: '偶像',
  // PACING_PUZZLE.md §10-12#5(EXボス「フィル(変異体)」): 台帳(bossCutin.ts)と同名。
  phillboss: 'フィル(変異体)',
  hunter: '変異体(狩猟型)',
  screamer: '変異体(叫喚型)',
  // research/GHOST_BOSS.md(守護霊ボス「幻影」): 名前の出どころは1箇所(bossPractice の
  // GUARDIAN_PHANTOM_LABEL → 守護霊台帳 strongestGuardian().name)。人物名をここへ写経しない。
  'guardian-phantom': GUARDIAN_PHANTOM_LABEL,
  // 賞金首4種(名称統一バッチ・社長指示v0.25.3443): 台帳(bossCutin.ts)と同名。従来はフォールバック「変異体」に落ちていて
  // 死因・討伐バナー・被弾文言(「◯◯のレーザー」等)が個体名を出せていなかった。
  'bounty-ranged': 'バス停(変異)',
  'bounty-melee': '馬乗り(変異)',
  'bounty-balance': '鋏(変異)',
  'bounty-maiko': '舞妓(変異)',
};
// 社長指示v0.25.3451「なぜUIによって名前の出し方を変えるの?全部の箇所で統一に決まってる」:
// 城ボス(giantbat)もステージ別の台帳名(bossCutin=名前の正本)で表示する。死因・討伐バナー・歴史年表の
// 全てがこの1関数を通るので、ここ1箇所で全UIが揃う。台帳に無いステージ(stage-2/ex1等)は従来の
// 「変異体(飛行型)」へフォールバック(台帳の掟=新しい名前を発明しない)。
export const enemyDeathLabel = (type: string): string => {
  if (type === 'giantbat') {
    return CASTLE_BOSS_NAME_BY_STAGE[getSelectedStageId() ?? ''] ?? ENEMY_DEATH_LABELS.giantbat;
  }
  // ★research/SAME_ARENA.md O-5: 幻影は**その回の人格**の名前を出す(城ボスがステージで変わるのと
  // 同じ作法)。人格が未設定なら `phantomDisplayLabel()` が台帳の最強データへ落ちる=従来と1bit同じ。
  if (type === 'guardian-phantom') return phantomDisplayLabel();
  return ENEMY_DEATH_LABELS[type] ?? '変異体';
};

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
/**
 * ★しなり(スネア)の折れの強さ(社長指示2026-08-24「かなり強めに折れるくらいに入れたい」)。
 * 巻き・S字のコマを**射程より大きく**描く倍率。スネアは判定を持たない「派手さの絵」
 * (CLAUDE.md 2分類の②)なので、判定より外へはみ出してよい——むしろ等倍だと本体に隠れて
 * 「しなっていること」が伝わらない(踏み鳴らしの砂埃 DUST_STOMP_SCALE=2.2 と同じ理屈)。
 */
export const WHIP_SNARE_BEND_SCALE = 1.45;
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
export const alchemyLevel = (player: Player): number =>
  Math.max(1, Math.min(3, player.subWeaponLevels['alchemy'] ?? 1));
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
// 走り込みの標準速度ボーナス(MOVEMENT_REWORK.md 仕様1b・社長裁定2026-08-28
// 「今の1秒で速度10%アップを全員標準仕様に。マークスマンは20%アップに」)。
// 全クラス標準 ×1.1・マークスマン(mage)は標準の**置き換え**で ×1.2(積みではない)。
// 「効くまでの立ち上がり」は呼び出し側(movePlayer)が対象倍率の積 P に含めて共通ランプ
// (src/utils/speedRamp.ts・満額 RAMP_FULL_MS)へ渡すことで表現する。旧 marksmanSpeedMult
// (mageのみ×1.2・仕様1で個別条件をランプへ統合済み)の後継。marksmanMovingSince(連続移動の
// 開始時刻)はスケーターバッシュの発動条件と頭上マーク通知の debounce キーとして引き続き残置。
export const standardSpeedBonusMult = (player: Player): number =>
  player.characterClass === 'mage' ? 1.2 : 1.1;
// ヘビーガンナー: 同一攻撃で2体以上に当てた後3秒、すべての爆発範囲 ×1.1。
export const heavyGunnerExplosionMult = (player: Player, gameTime: number): number =>
  player.characterClass === 'warrior' && gameTime < player.heavyGunnerExpBuffUntil ? 1.1 : 1;

// --- 装備スキルの数値補正ヘルパ(effect層・全て純粋関数) -------------------
// ナイト: 被ダメ×0.8/0.7/0.6(Lv) / バーサーカー: 被ダメ×1.2(固定)。両立可(乗算)。
// §23: 消費カード「プロテクション」(被ダメ-30%・60秒)もここへ合流(damagePlayer/守護霊被弾の
// 唯一の出どころ=既存スキルと同じ合流点)。ゴースト(buildPseudoPlayer)へは持ち越さない
// (consumableProtectionUntilを0で渡すのでconsumableProtectionMultは自動的に中立になる)。
export const skillIncomingDamageMult = (player: Player, gameTime: number): number => {
  const kl = skillLevel(player, 'knight');
  return (kl ? [1, 0.8, 0.7, 0.6][kl] : 1) * (hasSkill(player, 'berserker') ? 1.2 : 1)
    * consumableProtectionMult(player, gameTime);
};
// 社長指示v0.25.3303 カウンターマスター覚醒(Lv3): カウンター成立直後3秒間、全攻撃力+30%。
// バフの付与=カウンター成立の全7箇所(refundCounterCooldownを呼ぶ場所)がplayerパッチに広げる。
export const COUNTER_MASTER_AWAKEN_BUFF_MS = 3000;
export const COUNTER_MASTER_AWAKEN_DMG_MULT = 1.3;
export const counterMasterAwakenBuffPatch = (player: Player, gameTime: number): Partial<Player> =>
  skillLevel(player, 'counter-master') >= 3
    ? { counterMasterBuffUntil: gameTime + COUNTER_MASTER_AWAKEN_BUFF_MS }
    : {};
// ★錬金術(社長指示v0.25.3612): 召喚獣1体につきプレイヤーの攻撃力+20%。
export const ALCHEMY_SUMMON_ATK_BONUS = 0.2;
// バーサーカー: 全攻撃 ×(1 + 失ったHP割合×係数[Lv1:1.0/Lv2:1.25/Lv3:1.5])。被ダメ×1.2は固定。
// カウンターマスター覚醒バフ(+30%)もこの「全攻撃」合流点に乗せる。gameTimeは20超の呼び出し箇所へ
// 引数を配る代わりにここでstoreから読む(実行時のみ呼ばれる関数。ヘッドレステストはstoreのgameTimeを設定する)。
// ★錬金術の召喚攻撃ボーナス(v0.25.3612)もこの合流点に乗せる: ×(1 + 0.2×生存召喚数)。
// 数えるのは召喚獣(kind normal/rare。使役ペット=persistentも召喚獣として数える)。
// 守護霊(ghost-ally)は同行者であって召喚獣ではないので数えない。
// ★永続育成の攻撃力(research/GROWTH.md v4)もこの合流点に乗せる: player の**焼き値**を読む
// (store の有効段数は読まない=守護霊の疑似Playerが同じ関数を通るため)。0段=1.0で無変化。
export const skillOutgoingDamageMult = (player: Player): number => {
  const summonN = useGameStore.getState().summons.reduce((n, s) => n + (s.kind !== 'ghost-ally' ? 1 : 0), 0);
  const alcMult = 1 + ALCHEMY_SUMMON_ATK_BONUS * summonN;
  const growthMult = player.growthAtkMult ?? 1;
  const cmMult = (player.counterMasterBuffUntil ?? 0) > useGameStore.getState().gameTime
    && skillLevel(player, 'counter-master') >= 3
    ? COUNTER_MASTER_AWAKEN_DMG_MULT
    : 1;
  const bl = skillLevel(player, 'berserker');
  if (!bl || player.maxHealth <= 0) return alcMult * cmMult * growthMult;
  const k = [0, 1, 1.25, 1.5][bl];
  return alcMult * cmMult * growthMult * (1 + Math.max(0, (player.maxHealth - player.health) / player.maxHealth) * k);
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
// 社長指示v0.25.3300 タイムキーパー覚醒(Lv3): 近接武器(カウンター)のクールダウンも-10%。
// 近接の再使用可能時刻(counterCooldownEnd)を張る全地点(通常スイング/刀/鞭/スラッシャー終了)が乗算する。
export const TIME_KEEPER_AWAKEN_MELEE_CD_MULT = 0.9;
export const meleeCooldownMult = (player: Player): number =>
  skillLevel(player, 'time-keeper') >= 3 ? TIME_KEEPER_AWAKEN_MELEE_CD_MULT : 1;
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
//  ・knife-master: **表示コンボ(meleeFinishCombo)を読む**(社長指示2026-08-29「通常攻撃でコンボになる」
//    =近接ヒットが表示コンボに加算されるようになったので専用台帳knifeCombo*は廃止・一本化)。
//    +2%/hit(上限+60%=×1.6。PACING_PUZZLE.md §6.22 M47仕様②の率・上限は不変)。
//  ・combo-master: フィニッシュコンボ(meleeFinishComboCount)生存中、+2%/combo(上限+50%)。
// どちらも非装備なら ×1。窓の有効判定は呼び出し側の gameTime に依存。
export const skillMeleeComboMult = (player: Player, gameTime: number, finishComboCount: number, finishComboUntil: number): number => {
  let mult = 1;
  const kl = skillLevel(player, 'knife-master');
  if (kl && gameTime < finishComboUntil) {
    const rate = [0, 0.02, 0.02, 0.04][kl]; // +2%/+2%/+4% per hit(不変)
    const cap = [0, 0.40, 0.50, 0.60][kl];  // 上限 +40%/+50%/+60%(§6.22 M47仕様②)
    mult *= 1 + Math.min(cap, finishComboCount * rate);
  }
  mult *= skillComboMasterMult(player, gameTime, finishComboCount, finishComboUntil);
  return mult;
};
// combo-master のダメージ倍率のみ(全攻撃=近接/銃に適用)。フィニッシュコンボ生存中 +2%/3%/4%/combo(上限+50%/60%/70%)。
// ※ knife-master は近接専用なので含めない。銃ヒット処理は本関数だけを使う。
export const skillComboMasterMult = (player: Player, gameTime: number, finishComboCount: number, finishComboUntil: number): number => {
  const cl = skillLevel(player, 'combo-master');
  if (!cl) return 1;
  // 社長指示v0.25.3300 覚醒(Lv3): コンボが途切れても20秒間は上がっていた攻撃力を維持する。
  // カウンタ(finishComboCount)は途切れても消えず「次のコンボ開始」で1から取り直される仕様なので、
  // 窓切れ後もカウンタをそのまま読めば「途切れた時点の攻撃力の維持」になり、再開時は自然にリセットされる。
  const withinWindow = finishComboUntil >= gameTime;
  const held = cl >= 3 && !withinWindow && finishComboUntil > 0 && gameTime < finishComboUntil + COMBO_MASTER_AWAKEN_HOLD_MS;
  if (!withinWindow && !held) return 1;
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
// ナイフマスター: 近接ヒットの「表示コンボへの加算数」(社長指示2026-08-29で共有コンボへ一本化)。
// そのスイングでフィニッシュが出た時はキル側の加算が立つので、二重取りしない(=0)。
export const knifeMasterHitComboGain = (
  player: Player,
  hitLanded: boolean,
  finishCountThisSwing: number,
): number => (hasSkill(player, 'knife-master') && hitLanded && finishCountThisSwing === 0 ? 1 : 0);
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
  // 社長指示v0.25.3300 スナイパー覚醒(Lv3): 距離条件が従来の70%の距離で到達(100px条件なら70pxで達成)。
  const awakenFrac = sl >= 3 ? SNIPER_AWAKEN_DIST_FRAC : 1;
  const distBonus = Math.min(distMax, (dist / (SNIPER_REF_DIST * 0.85 * awakenFrac)) * distMax);
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
// scrap-builder/warm-up(§23-1裁定・退役): 消費カードへ転生し、効果コードは削除した(所持者には
// 一括コイン返却=loadGoldBalanceWithRetiredRefund/store初期化を参照)。旧 skillScrapBuilderGainMult /
// WARM_UP_*定数・isWarmUpActive・skillWarmUpSpeedMult・skillWarmUpReloadMult・skillWarmUpCritBonus
// はここにあった(既存所持者にも二度と効果は発生しない。RUN_DRAFT_EXCLUDED_SKILLS/GACHA_EXCLUDED_SKILLS
// で取得経路も既に無い=§19-1点5)。

// --- 消費カード5種(§23・社長裁定2026-08-13「案B・30%60秒・あとは推薦で」) -----------------------
// ガチャ外・デッキ所持に依存しない=全プレイヤー共通。ノーマル枠を1つ占有し、取得で即発動・60秒で
// 自動失効(温存不可・延長なし)。台帳(名前/説明文)は data/consumables.ts、抽選・枠会計は
// utils/runSkillDraft.ts(consumableCandidates/canAcquireRarityのextraNormalOccupied)を参照。
// 数値は全て叩き台(実機調整前提・§23-1)。
export const CONSUMABLE_SCRAP_MULT = 1.5;       // スクラップブースト: スクラップ入手+50%
export const CONSUMABLE_ATTACK_MULT = 1.2;      // アタックドーピング: 攻撃力+20%
export const CONSUMABLE_SPEED_MULT = 1.15;      // スピードブースト: 移動速度+15%
export const CONSUMABLE_XP_MULT = 1.5;          // 経験値ブースト: 経験値×1.5
export const CONSUMABLE_PROTECTION_MULT = 0.7;  // プロテクション: 被ダメージ-30%(×0.7)

export const consumableScrapMult = (player: Player, gameTime: number): number =>
  player.consumableScrapUntil > gameTime ? CONSUMABLE_SCRAP_MULT : 1;
// §23実装スコープ(実装報告参照): 「攻撃力+20%」はアタックシューターと同じ合流点(銃の発射ダメージ=
// gunShotBaseDamage/フィル銃/援護狙撃)へ適用する。berserker(skillOutgoingDamageMult)の近接/爆発
// 系convergenceは呼び出し箇所が12箇所超と広く、既存スキル効果への波及リスクが高いためこのバッチの
// スコープ外とした(近接特化ビルドには本カードの効果が乗らない=既知の制約として報告に明記)。
export const consumableAttackMult = (player: Player, gameTime: number): number =>
  player.consumableAttackUntil > gameTime ? CONSUMABLE_ATTACK_MULT : 1;
export const consumableSpeedMult = (player: Player, gameTime: number): number =>
  player.consumableSpeedUntil > gameTime ? CONSUMABLE_SPEED_MULT : 1;
export const consumableXpMult = (player: Player, gameTime: number): number =>
  player.consumableXpUntil > gameTime ? CONSUMABLE_XP_MULT : 1;
export const consumableProtectionMult = (player: Player, gameTime: number): number =>
  player.consumableProtectionUntil > gameTime ? CONSUMABLE_PROTECTION_MULT : 1;

/** 現在アクティブな消費カードの数(=占有中のノーマル枠数。§23-2条件1の枠会計に渡す)。 */
export const activeConsumableCount = (player: Player, gameTime: number): number =>
  activeConsumableKeys(player, gameTime).length;

/** 現在アクティブな消費カードのキー一覧(draftRunSkillCards入力=同種の再提示を避ける・§23-1)。 */
export const activeConsumableKeys = (player: Player, gameTime: number): ConsumableKey[] => {
  const out: ConsumableKey[] = [];
  if (player.consumableScrapUntil > gameTime) out.push('scrap-boost');
  if (player.consumableAttackUntil > gameTime) out.push('attack-doping');
  if (player.consumableSpeedUntil > gameTime) out.push('speed-boost');
  if (player.consumableXpUntil > gameTime) out.push('xp-boost');
  if (player.consumableProtectionUntil > gameTime) out.push('protection');
  return out;
};

/** 消費カード取得: 即時発動(gameTime+60秒)。既に発動中でも常に60秒に固定(延長しない=温存不可の
 * 仕様どおり)。draftRunSkillCards側が同種発動中は再提示しないので通常は上書きにはならない。 */
export const applyConsumableCard = (player: Player, key: ConsumableKey, gameTime: number): Player => {
  const until = gameTime + CONSUMABLE_DURATION_MS;
  switch (key) {
    case 'scrap-boost': return { ...player, consumableScrapUntil: until };
    case 'attack-doping': return { ...player, consumableAttackUntil: until };
    case 'speed-boost': return { ...player, consumableSpeedUntil: until };
    case 'xp-boost': return { ...player, consumableXpUntil: until };
    case 'protection': return { ...player, consumableProtectionUntil: until };
  }
};

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
export const RESCUE_ALLY_HOP_PX = 48;      // 飛来/離脱ジャンプ弧の頂点の高さ(px・守護霊の帰還も共有)
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
// ENDING_SCENE.md 演出仕様v2 §9(叩き台): 常在兵士数。8→10(社長指示2026-08-29「少し兵士増やして」)。
// 実機調整用に?endsoldiers=で上書き。
export const ENDING_SOLDIER_COUNT = Math.max(0, Math.round(camNum('endsoldiers', 10)));
// §9: 初期配置の広がり(px)。出撃直後に画面外まで一様に散らす(1点に固まって見えないように・叩き台)。
export const ENDING_SOLDIER_SPAWN_RIGHT_X = camNum('endsoldx', 2600);
export const ENDING_SOLDIER_SPAWN_SPAN_X = camNum('endsoldspan', 2200);
// §9(監査B-1対応): 左画面外へ抜けた兵士を右から再投入する境界。「ズーム外周(=1/ZOOM_MIN_ABS)+
// マージン」で、最大まで引いた画面(?zoomlock=0.4)でも境界の外(見えない位置)で入れ替わるようにする
// (CLAUDE.md「ズーム引き考慮」)。
export const ENDING_SOLDIER_REENTRY_MARGIN_PX = camNum('endsoldmargin', 200);
export const ENDING_SOLDIER_REENTRY_JITTER_PX = camNum('endsoldjitter', 300);
// 爆撃(ENDING_SCENE.md 演出仕様v3.1・監査B-5のツマミ)。pixi側も同じ定数を読む(半径/表示の整合)。
export const ENDING_BOMB_ENABLED = camNum('endbomb', 1) !== 0;
const ENDING_BOMB_INTERVAL_CENTER = camNum('endbombint', 5250); // 間隔中心ms(±33%で散る)
export const ENDING_BOMB_TUNING: EndingBombTuning = {
  ...DEFAULT_ENDING_BOMB_TUNING,
  intervalMsMin: ENDING_BOMB_INTERVAL_CENTER * 0.67,
  intervalMsMax: ENDING_BOMB_INTERVAL_CENTER * 1.33,
  explosionRadiusPx: camNum('endbombr', DEFAULT_ENDING_BOMB_TUNING.explosionRadiusPx),
  knockRadiusPx: camNum('endbombkb', DEFAULT_ENDING_BOMB_TUNING.knockRadiusPx),
  fallHeightPx: camNum('endbombh', DEFAULT_ENDING_BOMB_TUNING.fallHeightPx),
  phillClearancePx: camNum('endbombclear', DEFAULT_ENDING_BOMB_TUNING.phillClearancePx),
};
export const CAMERA_FOLLOW_TAU = camNum('camtau', 0.16);          // 追従遅延(秒)。わずかな重さ。範囲0.08〜0.16
export const CAMERA_DANGER_TAU = camNum('camdanger', 0.08);       // 危険時(接近戦)の追従遅延(秒)。安定。範囲0.04〜0.08
export const CAMERA_RETURN_TAU = camNum('camret', 0.20);          // 停止時に先読みオフセットを戻す時定数(秒)。ピタ止まり回避。範囲0.12〜0.20
export const CAMERA_LOOKAHEAD_MAX = camNum('camlook', 40);        // 進行方向への最大オフセット(px)。進行方向に余白。範囲24〜40
export const CAMERA_CENTER_CLAMP_FRAC = camNum('camclamp', 0.07); // 強制中心復帰距離(画面幅比)。見失い防止。範囲0.05〜0.07
// プレイヤーを画面中央より下へずらす量(画面高比)。上方向(進行先)の視界を広げる(社長要望: 上の敵が見えない対策)。
// 屋内/ラボは0(中央維持)。スポーン側も同じ量だけ縦バンドを上へずらす(上端で湧きが画面内に出ないように)。
export const CAMERA_DOWN_OFFSET_FRAC = Math.max(0, Math.min(0.32, camNum('camdown', 0.08)));
// 洋館通路(corridorMode)専用のカメラ下げ量(v0.25.2148・社長指示「敵が上から出てきて見える位置を
// もう少し上に」): プレイヤーを画面のより下に置き、前方(奥)の視界を広げる=敵の入場ラインが
// 構図の上へ移る。スポーン帯補正(useGameLoopのspawnViewOffsetY)も同値で連動させること。
export const CORRIDOR_CAMERA_DOWN_FRAC = 0.16;
export const CAMERA_DANGER_RADIUS = 150;                          // この距離内に敵が居たら「危険時」とみなす(px)
export const CAMERA_SNAP_DIST = 600;                             // これ以上離れたら即スナップ(開始/復帰/瞬間移動対策)
// アテンション・シネマティック(レスキュー/ジャイアント出現): 現地へ高速パン→ホールド→高速で戻る。その間 時間停止。
// ★v0.25.3742(社長診断「アテンションのズレ=被写体深度(遠景)を考慮してない。プレイヤーの可視領域
// 内での真ん中に。敵が上に寄ってるのは遠景分を考慮してないから」): 画面上部は遠景帯(森/地平線)が
// 占めるため、実プレイ可視領域の中央は画面の幾何中央(50%)より下にある。アテンションの寄せ先は
// 対象を**画面高のこの割合**の位置に置く(0.5=旧来の幾何中央)。叩き台=実機で調整。
export const ATTENTION_FOCUS_Y_FRAC = 0.60;
export const ATTENTION_IN_MS = 360;   // 現地への高速パン(in)
export const ATTENTION_HOLD_MS = 1900; // 現地ホールド(社長指示で0.5秒短縮: 2400→1900)
export const ATTENTION_OUT_MS = 360;  // プレイヤーへ高速で戻る(out)
export const ATTENTION_TOTAL_MS = ATTENTION_IN_MS + ATTENTION_HOLD_MS + ATTENTION_OUT_MS;
// v0.25.2955: ボス討伐の崩壊尺(死亡アテンション後、時間停止のまま実時間でゆっくり崩す)。
// pixiScene.syncBossCorpse / useGameLoop の死体クリーンアップと同じ1本。
export const BOSS_CORPSE_CRUMBLE_MS = 2600;
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
// v0.25.2586(社長指示「守護霊死んだときもカメラズーム スローしてほしい これプレイヤーも」):
// 死亡の寄り。強さはKILLと同じ(1.0=2倍)・長さは死亡スロー(PLAYER_DEATH_SLOW_MS=820)と同期させ、
// holdはフィニッシュと同じカーブ(最大で保持してから戻る)。叩き台・実機調整前提。
// **キル演出のCD(JUICE_CD)は通さない**=死は稀で必ず見せたい瞬間なので毎回出す。
// v0.25.2587(社長指示「しゃがみ絵状態の…そこを少し長めにスローで見せて 死んだとわかる感じに。
// 今はズームされても一瞬でしかももう何もいなかった」): 尺を延長。旧820ms/hold560msでは
// ①ピークが一瞬 ②立ち絵が1秒で消え ③1.1秒でリザルトへ切替、と全部が短く重なって「何も見えない」だった。
export const DEATH_ZOOM_MAG = 1.0;
export const DEATH_ZOOM_MS = 1700;      // 寄り〜戻りの全長(スローと同値=一緒に戻る)
export const DEATH_ZOOM_HOLD_MS = 1150; // 最大寄り+最スローを保持する長さ(=「見せる」時間の本体)
export const DEATH_SLOW_SCALE = 0.22;   // 死亡スローの倍率(旧0.32よりさらに遅く=死が分かる)
export const MELEE_FINISH_ZOOM_MAG = 1.0;  // 近接フィニッシュ(KILL)の寄り(社長指示で2倍=+100%・旧1.5倍から改訂)
export const MELEE_FINISH_ZOOM_MS = 500;   // KILLだけ専用のズーム長さ(社長指示・スローとは非連動)
export const MELEE_FINISH_ZOOM_HOLD_MS = 400; // 上記のうち最大寄りを保持する長さ(比率80%はスローと同じ)
// KILLズームだけの連発防止CD(社長指示・v0.25.1495・10秒へ改訂v0.25.1497)。連続キル時、
// スロー/揺れ/ヒットストップは毎回発生するが、寄りズームだけはこのCD内なら発動しない
// (酔い防止・スロー等の演出は不変)。
export const MELEE_FINISH_ZOOM_CD_MS = 10000;
// ★KILL処刑演出v2(社長指示v0.25.3603「敵の首元に飛びついて掻っ切る→大量の血が上に飛び散る→
// もとにいた場所にジャンプして戻る(しゃがみ・慣性・斬撃を上手く見せて)」)。
// 発動は**寄りズームが入るフル演出(CD明け)の時だけ**(社長指示「ズームインが入るときだけ」)。
// 実時間ms。合計=hitstop(全停止)の長さ——この間、動くのはpixi側の実時間駆動FXだけ
// (社長指示「エフェクト中は時間ストップ(エフェクトは止めない)」)。数値は叩き台。
export const KILLFX_CROUCH_MS = 100;   // しゃがみ(タメ・沈み込み)(社長調整2026-08-28: 110→100)
// ★実機FB6(社長指示v0.25.3613「ダッシュはしゃがみの絵で近づき、そのまま立ち上がって斬撃」):
// 接近=**しゃがみ絵のままの低いダッシュ**(75ms・放物線なし)。FB5の「ジャンプ」は本裁定で更新
// (経緯は事実として記録: FB4=ダッシュ75→FB5=ジャンプ150→FB6=しゃがみダッシュ75)。
export const KILLFX_LEAP_MS = 50;      // 首元へしゃがみダッシュ(ease-out)(社長調整2026-08-28: 75→50)
// ★実機FB1(社長指示v0.25.3605): 貼り付き→噴出の間に「一拍」(しゃがみのまま溜める)。
export const KILLFX_HOLD_MS = 220;     // 首元で一拍(社長調整2026-08-28: 245→220。旧「斬撃時刻430不変」は本調整で430→370へ更新)
export const KILLFX_SLASH_MS = 170;    // 掻っ切り(斬撃→血しぶきの順・下のBLOOD_LAG)
export const KILLFX_RETURN_MS = 80;    // バックダッシュで戻る(社長調整2026-08-28: 95→80・放物線なし)
export const KILLFX_LAND_MS = 70;      // 滑り込み停止(スカッシュ)(社長調整2026-08-28: 90→70)
/** 斬撃時刻(演出開始からのms)。刀の一閃流用の斬撃はここで出る。 */
export const KILLFX_BURST_AT_MS = KILLFX_CROUCH_MS + KILLFX_LEAP_MS + KILLFX_HOLD_MS; // =370(社長調整2026-08-28)
/** 斬撃→血しぶき/SE/KILL!文字までの間(FB5「斬撃→血しぶき」の順序)。 */
export const KILLFX_BLOOD_LAG_MS = 90;
export const KILLFX_TOTAL_MS =
  KILLFX_BURST_AT_MS + KILLFX_SLASH_MS + KILLFX_RETURN_MS + KILLFX_LAND_MS; // =785
export const KILLFX_RELEASE_SLOW_MS = 300; // 停止明け: 0.2→等速へ戻す尾(時間にも慣性を付ける)
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
// ★社長指示v0.25.3618「プレイヤーの移動に少し慣性入れて。反転移動の切り返しがパッとじゃなく、
// ほんの少しだけ」: 旧0(完全即応)→60ms。切り返しの向き変えが1〜3フレームだけ「ぬるっと」滑る。
// 数値は叩き台(体感が重ければ0.04、軽ければ0.08方向へ)。スケーター乗車中の強慣性(1.2〜0.5s)は別系。
export const PLAYER_INERTIA_TAU = 0.06;
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
/** 城ボス専用。雑魚犬の速度を変えず、巨体の「溜め→爆発的な突進」だけを強める。 */
export const GIANT_CHARGE_SPEED_MULT = 4.4;
// ★ハンターの再設計(社長裁定v0.25.2429)「歩く距離を半分にして、ダッシュとジャンプの速度を上げる。
// つまり**技が出ると脅威だが、その前に逃げ切れる**」。
//
// 旧の問題(社長報告「ハンター逃げ切れないんだよね」): 歩き実効98.4px/s に対しプレイヤー104.4px/s=
// **ほぼ同速**なので、離れる前に必ずダッシュ間合いへ入られていた。歩きで詰められる限り、
// 「逃げる」という選択肢自体が存在しない。
//
// ★実装上の罠(重要): **ダッシュ速度は `enemy.speed` から計算されている**ので、歩きを半分にすると
// ダッシュも自動的に半分になる(社長の意図と正反対)。倍率で相殺した上に上乗せする必要がある。
// また旧実装は**ジャンプ倍率をダッシュ倍率から導出**していたため片方だけ動かせなかった。**2つに分離する。**
export const HUNTER_DASH_SPEED_MULT = 5;  // 旧2。歩きが半分になった分を相殺(×2.5)した上で更に上乗せ
// ジャンプ滞空時間を 1/この値 に短縮(=同距離を速く跳ぶ)。旧 4/3(滞空実効625ms) → 2(実効417ms)。
// 着地点は溜め開始でロック(不変)なので、速くなるほど「予告を読んで避ける」がシビアになる。
export const HUNTER_JUMP_SPEED_MULT = 2;
// ハンターのダッシュ発動距離(社長裁定(a)「発動間合いを広げる」)。歩きが遅くなったぶん、
// 遠くからでも突っ込めないと**技を出す機会すら無い「遅いだけの的」**になる。旧1000→1300。
// 逃げ切りの条件が「この距離の外へ出る」に一本化されて分かりやすくもなる。
export const HUNTER_DASH_RANGE = 1300;
// ダッシュ攻撃全般(通常より速い突進)の弱いホーミング量/frame。基本は直進、少しだけプレイヤーへ寄せる(社長指示)。
export const DASH_ATTACK_HOMING = 0.05;
// ダッシュ溜め中、ゆっくり後退り(プレイヤーから離れる)してから突進(社長指示)。通常速度に対する倍率。
export const DASH_WINDUP_BACKSTEP_MULT = 0.35;
export const WEREWOLF_CHARGE_MAX_MS = 2800; // 突進の最大時間(到達できなくても打ち切り)。距離2倍化に合わせ延長。
export const WEREWOLF_COOLDOWN_MS = 1200;  // 突進後、次の溜めまでの猶予(基本CD)
// ★社長指示2026-08-26「自転車、着地後1秒硬直」: 突進の終わり(到達/打ち切り/衝突)後、その場で1秒動けない
// (CDと並走する追加の硬直。werewolf本種のみ=lab-zombie-2/giantbat/hunterは対象外)。
export const WEREWOLF_DASH_RECOVER_MS = 1000;
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
export const PUMPKIN_RECOVER_MS = 1000;    // 着地後の停止(汎用: ハンター/ラボゾンビ3等)
// ★社長指示2026-08-26「パンプキン、着地後硬直2秒を追加」: パンプキン本種のみ着地硬直を2秒に。
// 他のジャンプ型(ハンター/ラボゾンビ3)は指示の対象外=従来の1秒のまま。描画(pixiScene の
// 着地スカッシュ起点)も同じ関数を引く=判定と絵の出どころを1本に保つ。
export const pumpkinRecoverMs = (type: Enemy['type']): number => (type === 'pumpkin' ? 2000 : PUMPKIN_RECOVER_MS);
export const PUMPKIN_COOLDOWN_MS = 800;    // 復帰後、次の溜めまでの猶予
export const PUMPKIN_JUMP_HEIGHT = 90;     // ジャンプの見た目の高さ(px・描画のみ)
export const PUMPKIN_LAND_SHAKE_MS = 220;  // 着地時の画面揺れ
export const PUMPKIN_LAND_SHAKE_MAG = 9;
// 設置シールドでジャンプ/ダッシュを弾いた瞬間の「ぶつかった感」用シェイク(着地より軽め)。
export const SHIELD_BLOCK_SHAKE_MS = 140;
export const SHIELD_BLOCK_SHAKE_MAG = 5;
// パンプキン(/lab-zombie-3)のジャンプ攻撃は着地時に爆発攻撃。範囲は狭め(半径px)。ダメージは各敵の damage。
// ★定義はbountyDims.ts(依存ゼロの葉)へ移動(v0.25.3390・循環import起動全損の修正)。値54は不変。
import { PUMPKIN_EXPLOSION_RADIUS } from '../utils/bountyDims';
export { PUMPKIN_EXPLOSION_RADIUS };

// PACING_PUZZLE.md §9-4(削岩型・driller): 突き(ヤリ攻撃)の溜め/判定/硬直/CD。間合い(接近/後退/構え)
// と発動距離は src/utils/drillerAi.ts(純関数・テスト済み)を見る。ここは gameStore 内でしか使わない
// 攻撃モーション寄りの値だけを持つ。値は全て叩き台(§9-6「バランスの最終値ではない」)。
// ★削岩型の突きの溜め(=予告)。社長指示で2回伸ばしている: 700 → 900(v0.25.3932)→ **1200**(v0.25.3936)。
// ★この値は `ENEMY_ATTACK_SPEED_MULT`(=GAME_SPEED・既定1.2)で**割られる**ので、
// **画面上の実効 = 指定値 ÷ 1.2**。583ms → 750ms → **1000ms**(社長指示2026-08-26「1000msで」)。
// 数字を動かす時は**実効で考える**こと(ここへ実効値をそのまま書くと1.2倍速く出てしまう)。
// 参考: カウンター可能な予告の下限は `MIN_COUNTER_TELEGRAPH_MS = 550`。
// 新しいカウンター規則(刃が出ている200msだけ成立=当たる200〜400ms前に振り始める)と
// 人の反応 `HUMAN_REACTION_MS = 250` を足すと 450〜650ms 要るので、実効1000msは十分な余裕がある。
export const DRILLER_THRUST_WINDUP_MS = 1200;  // 溜め(開始の瞬間に方向・帯をロック)= 実効1000ms
export const DRILLER_THRUST_ACTIVE_MS = 220;   // 突き判定の表示(1回だけカプセルを積む・実効180ms相当)
export const DRILLER_THRUST_RECOVER_MS = 400;  // 硬直
export const DRILLER_THRUST_CD_MS = 3500;      // 次の突きまでのCD(生値。atkUntil式でENEMY_ATTACK_SPEED_MULT除算)
export const DRILLER_THRUST_LENGTH = 200;      // 帯の長さ(px)=判定と同寸
export const DRILLER_THRUST_HALF_WIDTH = 12;   // 帯の半幅(px・細め)=判定と同寸

// PACING_PUZZLE.md §14-2(降格死神・伐採人=logger): §9(削岩型)の写し+差分4点のうちの②④。
// 薙ぎ払い(横方向)の溜め/判定/硬直/CD。間合い(接近/後退/構え)と発動距離は
// src/utils/loggerAi.ts(純関数・テスト済み)を見る。値は全て叩き台(§9-6/§14-2「バランスの最終値
// ではない」)。CD3.5秒は§14-2④の裁定どおりdrillerと同値。
// ★社長裁定2026-08-28(検収監査・PACING_PUZZLE.md §14-2④で確定): windup=1300ms
// (旧850=driller-thrust[実効1000ms=生1200]と大差なく「少し長め」が体感できなかったため引き上げ。
// 1300÷ENEMY_ATTACK_SPEED_MULT[既定1.2]≈実効1083ms=driller-thrustの実効1000msより長い=
// 「槍より少し長め」が成立)。硬直=1000ms(社長裁定「横払い後、硬直を1秒」。旧400=drillerと同値
// だったのを上書き=薙ぎの後は1秒の隙・カウンター/パニッシュの窓を広く取る)。
export const LOGGER_SWEEP_WINDUP_MS = 1300;   // 溜め(開始の瞬間に方向・帯をロック)= 実効約1083ms
export const LOGGER_SWEEP_ACTIVE_MS = 220;    // 薙ぎ判定の表示(1回だけカプセルを積む。driller-thrustと同値)
export const LOGGER_SWEEP_RECOVER_MS = 1000;  // 硬直(社長裁定2026-08-28「横払い後、硬直を1秒」)
export const LOGGER_SWEEP_CD_MS = 3500;       // 次の薙ぎ払いまでのCD(生値。§14-2④「同値」)
export const LOGGER_SWEEP_LENGTH = 220;       // 帯の全長(px)=判定と同寸(§14-2②「長さ220」)
export const LOGGER_SWEEP_HALF_WIDTH = 26;    // 帯の半幅(px)=判定と同寸(§14-2②「半幅26」)

// ==== M51: 城ボス「ジャイアント」新行動スクリプト(PACING_PUZZLE.md §6.26・裁定済み6.26-9) ====
// `?giantscript=0` で旧挙動(このセクションを使わず、上の GIANTBAT_*/WEREWOLF_*/PUMPKIN_* 経由の
// 従来スケジューラ)へ完全フォールバック(受け入れ条件11)。werewolf/pumpkin/lab-zombie-2/
// lab-zombie-3/hunter は元々このセクションを一切参照しない=無改変(受け入れ条件10)。
export const GIANT_SCRIPT_ENABLED = typeof window === 'undefined' || new URLSearchParams(window.location.search).get('giantscript') !== '0';
// 6.26-5「実装単位の注意」: 本セクションの *_MS は生値(コード上の定数)。実効(実時間) = 生値 / 1.2。
// 実効700ms→生840、実効900ms→生1080、のように 実効ms×ENEMY_ATTACK_SPEED_MULT(1.2) で書く。
// 踏み鳴らし(stomp・密着0〜140・全フェーズ)。
export const GIANT_STOMP_WINDUP_MS = 840;    // 実効700ms・完全静止(T7+T2+T4)
export const GIANT_STOMP_RECOVER_MS = 1080;  // 実効900ms・硬直=反撃窓
export const GIANT_STOMP_CD_MS = 6000;       // 実効5.0s
// v0.25.2578(社長指示「範囲狭すぎ…近接でもほぼない。少し広げた方がいい」)→v0.25.2579(社長指示
// 「ボスの当たり判定プラスアルファで設定した方がいい」): 実効半径は固定値でなく、windup開始時に
// **体の判定帯の半径+GIANT_STOMP_REACH_PX(縁からの届き)**で導出して gStompRadius へ確定する。
// 判定・赤円・レベルアップ保留・守護霊回避台帳は全て gStompRadius を読む=図形と判定はドリフトしない。
// 届き92の根拠: 近接の定位置=縁74px(MELEE_RADIUS)+プレイヤー半幅≈10 → 縁から≈84px。92=定位置+8px
// (叩き台・実機調整前提)。旧92(中心基準)は近接の標準立ち位置にすら届かない技だった。
export const GIANT_STOMP_REACH_PX = 92;
// フォールバック(gStompRadius未確定の描画/レベルアップ保留の近似用): giantbat標準体格での実効値
// (帯半幅≈38+届き92≈130)。実判定は常にgStompRadius側。
// GIANT_STOMP_RADIUS は episodeShape.ts(葉)へ移設(AI_HUMANIZE.md B2 ★未決#14=(a)。値は不変)。
// v0.25.3069(社長指示「震えながらしゃがみ込んで溜めて、発動の時に素早く小ジャンプして踏みつける」):
// 踏み鳴らしの**絵だけ**の3値(描画のみ・PUMPKIN_JUMP_HEIGHTと同じ扱い)。判定・半径・秒数・CDは不変。
// 溜め(GIANT_STOMP_WINDUP_MS)の**最後のGIANT_STOMP_HOP_MSだけ**を踏み切り〜着地に使い、
// **着地の瞬間 = 溜め終わり = 判定が出る瞬間**に揃える(絵と判定の瞬間を1つにする)。
export const GIANT_STOMP_HOP_MS = 216;       // 実効180ms・小ジャンプ(踏み切り→着地)の尺
export const GIANT_STOMP_HOP_PX = 34;        // 小ジャンプの見た目の高さ(飛び掛かりの90より明確に低い)
export const GIANT_STOMP_SHAKE_PX = 5;       // 溜め中の震え(横揺れ)の最大振幅。溜めが進むほど強くなる
// 薙ぎ払い(sweep・近140〜320・Phase2限定=新規解禁)。
export const GIANT_SWEEP_WINDUP_MS = 840;    // 実効700ms(T3+T4)
export const GIANT_SWEEP_ACTIVE_MS = 264;    // 実効220ms(THOR_HARAI_ACTIVE_MS相当)
export const GIANT_SWEEP_RECOVER_MS = 840;   // 実効700ms・硬直=反撃窓
export const GIANT_SWEEP_CD_MS = 7200;       // 実効6.0s
export const GIANT_SWEEP_RANGE = 310;        // = THOR_HARAI_RANGE(社長裁定6.26-9 #3をそのまま流用)
// GIANT_SWEEP_HALF_WIDTH は episodeShape.ts(葉)へ移設(AI_HUMANIZE.md B2 ★未決#14=(a)。値は不変)。
// 突進(dash・中〜遠320〜1000・既存を改訂)。最大突進時間/速度/CD/狙い点式は WEREWOLF_CHARGE_MAX_MS /
// GIANTBAT_DASH_CD_MS / werewolfExtraCd をそのまま流用=変更しない(6.26-6「現行不変」)。
export const GIANT_DASH_WINDUP_MS = 840;     // 実効700ms(旧500msから延長。WEREWOLF_WINDUP_MSとは別=giant専用・他型は無改変)
export const GIANT_DASH_RECOVER_MS = 1080;   // 実効900ms・硬直=反撃窓【新設・現状ゼロ】(社長裁定6.26-9 #2)
// 飛び掛かり(jump・近〜中140〜700・既存を改訂)。滞空時間(PUMPKIN_JUMP_MS)と着地AoE半径
// (PUMPKIN_EXPLOSION_RADIUS)はそのまま流用=変更しない(6.26-6「現行不変」)。
export const GIANT_JUMP_WINDUP_MS = 1200;    // 実効1000ms(旧crouch2500msから短縮)。溜め開始で着地点をロック(社長裁定6.26-9 #1)
// ★飛び掛かりの強化(社長裁定v0.25.2423「おすすめで調整して」)。実測の根拠:
//   リード(溜め1000ms+滞空833ms=1833ms)の間にプレイヤーは 104.4px/s × 1.833s = **191px** 動ける。
//   必要な回避距離は「半径+自機の半分」= 54+13 = 67px しかなく、**必要量の2.9倍**動けていた
//   (ステージ倍率を最大1.50にしても2.0倍)。だから「目視で余裕で避けれる」(社長報告)。
//   半径100・滞空500msにすると リード1500ms→156px / 必要113px = **余裕1.38倍**。stage-5(×1.30)で1.09倍。
// **溜め(1000ms)は据え置き**=予告を読む時間は1msも減らさず、逃げ切れる距離だけ削る。
// 定数を城ボス専用に新設しているのは、`PUMPKIN_EXPLOSION_RADIUS`/`PUMPKIN_JUMP_MS` が
// **雑魚のパンプキンと共用**だから(そのまま触ると雑魚まで強化されてしまう)。
export const GIANT_JUMP_RADIUS = 100;        // 着地AoE半径(旧: PUMPKIN_EXPLOSION_RADIUS=54 の流用)
export const GIANT_JUMP_AIR_MS = 384;        // 実効320ms。溜め後は巨体が一気に着地する。
// 飛び掛かりだけステージ倍率に上限を掛ける(社長裁定「(b) 1.30で頭打ち」)。
// stage-7/ex1 の 1.50 だと 必要163px vs 使える156px = **歩きでは逃げ切れない**ため。
export const GIANT_JUMP_STAGE_MULT_CAP = 1.30;
export const GIANT_JUMP_RECOVER_MS = 1320;   // 実効1100ms(旧833ms)
export const GIANT_JUMP_CD_MS = 4800;        // 実効4.0s。起点=硬直明け(旧GIANTBAT_JUMP_CD_MSは起点がcrouch開始=専用定数化)
// 咆哮弾(bolt・中320〜620・既存を改訂)。弾自体の性能(速度/サイズ/ダメージ)は
// getEnemyFireProfile('giantbat')をそのまま使う=変更しない(6.26-6「現行不変」)。
export const GIANT_BOLT_WINDUP_MS = 540;     // 実効450ms・完全静止【新設・現状ゼロ】(図形は出さずT4のみ)
export const GIANT_BOLT_RECOVER_MS = 360;    // 実効300ms
// ★咆哮弾を2パターンにする(社長裁定v0.25.2423「パターンがあった方がいいので、AとBを2パターンとして」)。
// 実測の根拠: 弾速300・距離400pxなら飛翔1.33秒=その間にプレイヤーは横へ116px動ける。必要な回避量は
// 弾14px+自機で約19px。**必要量の6倍**動けるので、狙い撃ち1発は原理的に当たらない(プラントの弾は
// 速230/ダメージ7なので、城ボスの弾は雑魚とほぼ同格だった)。
// 溜め(450ms)・硬直(300ms)・CDは**据え置き**=読みのリズムは変えず、当たり方だけを作る。
export const GIANT_BOLT_FAN_SHOTS = 3;            // A案: 扇の本数(Phase1)
export const GIANT_BOLT_FAN_SHOTS_PHASE2 = 5;     // Phase2で増やす(既存のフェーズの意味付けと揃える)
export const GIANT_BOLT_FAN_STEP_RAD = 12 * Math.PI / 180; // 隣の弾との角度差
export const GIANT_BOLT_FAN_SPEED = 380;          // A案だけ弾速も上げる(素の300→380)
export const GIANT_BOLT_BURST_SHOTS = 3;          // B案: 同方向への連射数
export const GIANT_BOLT_BURST_GAP_MS = 216;       // 実効180ms(生値=実効×ENEMY_ATTACK_SPEED_MULT)
// 銃口(社長指摘v0.25.3453「発射口と弾の位置が合ってない」): pixiScene の演出銃(fx/boss-gun-*)は
// 発射の瞬間ボス中心から狙い方向へ GUN_OUT_PX(=この値)だけ前進した位置で構え切る
// (pixiScene.ts の `GUN_OUT_PX` はこの値を読む=定義は1箇所)。弾の生成点も同じ値で前進させ、
// 「銃口の絵」と「弾が生まれる座標」を一致させる。速度・ダメージ・射程・タイミングは不変
// (狙い方向は据え置きで発射点だけ前へ寄せるため、着弾がわずかに早まる=idol/バス停と同じ扱い)。
export const GIANT_BOLT_MUZZLE_OUT_PX = 74;
export const GIANT_BOLT_CD_PHASE1_MS = 4200; // 実効3.5s
export const GIANT_BOLT_CD_PHASE2_MS = 3000; // 実効2.5s
// フェーズ移行(HP60%)の合図: HPバー色 Phase1=緑/Phase2=橙(0.3未満の赤は据え置き)+移行の瞬間だけ点滅
// (社長裁定6.26-9 #4)。点滅の継続時間(pixiScene.ts が now と比較する側の値)。
export const GIANT_PHASE_FLASH_MS = 1200;

// ==== M65: ステージ別の範囲/速度倍率(社長指示・PACING_PUZZLE.md §6.26に節追記予定) ====
// 「ステージ2から少しずつ踏み鳴らし/飛び掛かりの範囲を広げ、ダッシュも速くして難易度を上げる」
// 指示。対象は giantStageRangeMult() が掛ける3つ(stomp半径/jump着地半径/dash速度)だけで、
// 予告のリード(*_WINDUP_MS/*_RECOVER_MS/*_CD_MS)は1msも変えない。stage-1=1.00(実機合格済みの
// 基準・不変)。`?giantstage=0` で全ステージ1.00(=今日までの挙動)に戻す。
export const GIANT_STAGE_RANGE_ENABLED = typeof window === 'undefined' || new URLSearchParams(window.location.search).get('giantstage') !== '0';

// ==== M60: グレン(stage-7)/未確認変異体(stage-ex1)専用のPhase3拡張(PACING_PUZZLE.md §6.28-11) ====
// enemy.isStoryBoss===true の個体(=useGameLoop.tsのstoryBossスポーン経路でのみ立つ)だけに効く。
// 通常ステージ(1〜6)の城ボスはisStoryBossが付かないため、以下の値・分岐へは一切到達しない
// (受け入れ条件13「通常ステージのgiantbatは無改変」)。`?storybossscript=0` で本節だけ無効化でき、
// その場合storyBoss個体もPhase1/2のまま(=通常城ボスと同じ挙動)に戻る。
export const STORY_BOSS_SCRIPT_ENABLED = typeof window === 'undefined' || new URLSearchParams(window.location.search).get('storybossscript') !== '0';
// 硬直=500ms床(社長裁定6.28-21★2・§6.28-11 #5「500msを下限として全技を-400ms」)。
// 実効900→500(生600) / 実効700→500下限フロア(700-400=300<500なので床の500に張り付く・生600) /
// 実効1100→700(生840)。咆哮弾(小技)は床の対象外で無改変(GIANT_BOLT_RECOVER_MSのまま)。
export const GIANT_STOMP_RECOVER_PHASE3_MS = 600; // 実効500ms(900→500)
export const GIANT_SWEEP_RECOVER_PHASE3_MS = 600; // 実効500ms(700→300のはずが床500へ張り付く)
export const GIANT_DASH_RECOVER_PHASE3_MS = 600;  // 実効500ms(900→500)
export const GIANT_JUMP_RECOVER_PHASE3_MS = 840;  // 実効700ms(1100→700)
export const GIANT_BOLT_CD_PHASE3_MS = 2400;      // 実効2.0s(§6.28-11 #4「咆哮弾のCD Phase3=2.0s」)

// ==== M66: 城ボスのステージ別「独自技」(Phase1〜)+「大技」(Phase2=HP60%〜)(PACING_PUZZLE.md §6.26-11) ====
// 対象は城ボスが実際に出る4ステージだけ(stage-1/3/4/5)。stage-6/7/ex1には足さない
// (giantScript.tsのGIANT_STAGE_UNIQUE_MOVE/GIANT_STAGE_ULT_MOVEに定義が無いので自然にゲートされる)。
// `?giantunique=0` で本節を丸ごと無効化=today's 5技(M51〜M65)のみに戻る。既存5技の定数は1つも
// 変えていない(このブロックは全て新設の専用定数)。6.26-5「実装単位の注意」を継承: *_MSは生値
// (実効ms×1.2)、atkUntil()経由で使うこと。M65のステージ別倍率(giantStageRangeMult)はこの節の
// どの値にも掛けない(社長指示: 技自体がステージ固有・二重に効かせない)。
export const GIANT_UNIQUE_ENABLED = typeof window === 'undefined' || new URLSearchParams(window.location.search).get('giantunique') !== '0';

// --- stage-1: 噛みつき(bite・独自技・トレース元=カラミートの前脚踏み/腹潰し+固定遅延) ---
export const GIANT_BITE_WINDUP_MS = 840;   // 実効700ms・静止して帯(T3)を出す
export const GIANT_BITE_HOLD_MS = 420;     // 実効350ms(固定)・帯を出したまま静止して"溜める"=学習点
export const GIANT_BITE_ACTIVE_MS = 216;   // 実効180ms
export const GIANT_BITE_RECOVER_MS = 960;  // 実効800ms・硬直=反撃窓
export const GIANT_BITE_CD_MS = 7200;      // 実効6.0s
export const GIANT_BITE_LENGTH = 120;      // 前方の短い帯(足元の円=stompと区別)
export const GIANT_BITE_HALF_WIDTH = 50;

// --- stage-1: のしかかり(slam・大技・トレース元=Gaping Dragonの腹ばい) ---
export const GIANT_SLAM_WINDUP_MS = 1440;  // 実効1200ms・立ち上がって静止
export const GIANT_SLAM_ACTIVE_MS = 312;   // 実効260ms
export const GIANT_SLAM_RECOVER_MS = 1560; // 実効1300ms・全技中で最大の反撃窓=大技の報酬
export const GIANT_SLAM_CD_MS = 13200;     // 実効11.0s
export const GIANT_SLAM_LENGTH = 380;      // 大きな帯が前方へ伸びる
// GIANT_SLAM_HALF_WIDTH は episodeShape.ts(葉)へ移設(AI_HUMANIZE.md B2 ★未決#14=(a)。値は不変)。

// --- stage-3: 滑空薙ぎ(glide・独自技・トレース元=カラミートの飛び上がり→地面を放射状のブレス) ---
export const GIANT_GLIDE_WINDUP_MS = 1200;        // 実効1000ms・後ろへ跳び退がって溜める(T8backstep相当)
export const GIANT_GLIDE_ACTIVE_MS = 396;         // 実効330ms・本体が通過して薙ぐ(T3長い帯)。v0.25.3075: 旧228=190ms(速すぎて瞬間移動に見えた)
export const GIANT_GLIDE_SECOND_HIT_DELAY_MS = 300; // 実効250ms(固定)・滑空終了から二撃目まで=回避狩り
// v0.25.3075(社長指示「滑空はとにかくカクカクした動きを無くしたい。慣性の時間分、しゃがみや硬直時間を
// 減らしてもいい」): カクつきの原因は3つあった。①溜め中の後退りぶん下がった位置から、実行の瞬間に
// **予告線の始点へ前ワープ**していた ②移動が線形補間(等速)で、出だしと着地で速度が段差になっていた
// ③600pxを実効190msで飛ぶ=60fpsで約53px/フレームしか刻まれず「瞬間移動」に見えていた。
// ⇒ ①実位置から飛び出す(gGlideFromX/Y) ②両端で速度も加速度も0になる曲線(smootherstep)
//   ③実行時間を延ばす。延ばしたぶんは**硬直から差し引いて技全体の長さを据え置く**(社長許可)。
// ★当たり判定は不変: 滑空のダメージは溜め終わりに**カプセル1発**として確定済みで、飛んでいる間の
//   移動は完全に見た目だけ。だから移動を自由に変えても判定・予告線とはズレない。
export const GIANT_GLIDE_RECOVER_MS = 672;        // 実効560ms(旧840=700ms。実行を+140ms延ばしたぶんを硬直から返す)
export const GIANT_GLIDE_INERTIA_TAU = 0.28;      // 溜めの後退りの慣性(三連突進と同値=同じ「重さ」に揃える)
export const GIANT_GLIDE_SETTLE_FRAC = 0.3;       // 溜めの最後のこの割合で後退りを0へ収める(反転の角を消す)
export const GIANT_GLIDE_CD_MS = 10800;           // 実効9.0s
export const GIANT_GLIDE_LENGTH = 600;            // 長い帯(本体が通過する距離)
// GIANT_GLIDE_HALF_WIDTH は episodeShape.ts(葉)へ移設(AI_HUMANIZE.md B2 ★未決#14=(a)。値は不変)。
export const GIANT_GLIDE_SECOND_HIT_RADIUS = 150; // 滑空の終点に開くT2即時円

// --- stage-3: 急降下(dive・大技・トレース元=カラミートの飛翔→急降下) ---
export const GIANT_DIVE_WINDUP_MS = 1680;  // 実効1400ms・本体は画面外へ(無敵ではなく居ない)
export const GIANT_DIVE_RECOVER_MS = 1440; // 実効1200ms
export const GIANT_DIVE_CD_MS = 12000;     // 実効10.0s(社長指示2026-08-20「樹木管理員、大技のCDを10秒に」。旧14400=実効12.0s)
// GIANT_DIVE_RADIUS(地面のT5フェードイン円)は episodeShape.ts(葉)へ移設
// (AI_HUMANIZE.md B2 ★未決#14=(a)。値は不変)。
export const GIANT_DIVE_AWAY_OFFSET = 20000; // 画面外へ退避させる距離(描画/リサイクル判定の外)

// --- stage-4: 三連突進→氷の横薙ぎ(quaddash・独自技・トレース元=ヴォルドの3連突進→静止→氷の横薙ぎ) ---
export const GIANT_QUAD_DASH_WINDUP_MS = 840;    // 実効700ms/回(T1線+終点リング)。既存g-dashと同じ後退り(T8)
export const GIANT_QUAD_BREATH_WINDUP_MS = 1080; // 実効900ms・3回目の直後に必ず静止して溜める
export const GIANT_QUAD_BREATH_ACTIVE_MS = 840;  // 実効700ms・120°を回転して薙ぐ(T3帯)
export const GIANT_QUAD_RECOVER_MS = 1080;       // 実効900ms
// v0.25.3073(社長指示「城ボス4の避けれないダッシュに慣性を追加。滑ってる感じにしたい。(避けれる方はいらない)」):
// **三連突進(g-quad-*)だけ**、速度が目標速度へ即座に切り替わらず一次遅れで追従する=氷上を滑る挙動。
// カウンター可能な通常突進(g-dash-*)は**完全に据え置き**(社長の「避けれる方はいらない」)。
// 効き方: ①突進の出だしが「グッと乗ってから滑り出す」 ②追尾(DASH_ATTACK_HOMING)の曲がりが外へ膨らむ
// ③突進の終わりで急停止せず、次の溜めの後退りへ**流れながら**入る(=滑って止まる)。
// 最高速(GIANT_CHARGE_SPEED_MULT)・突進回数(3)・溜め/硬直/CD・当たり判定は一切不変。
// 3回目の後の「氷結の吐息」だけは仕様どおり完全静止させる(学習装置=必ず静止して溜める)。
export const GIANT_QUAD_INERTIA_TAU = 0.28; // 秒。大きいほどよく滑る(0=従来の即時追従)。v0.25.3075: 社長指示で0.14→倍
export const GIANT_QUAD_CD_MS = 14400;           // 実効12.0s
export const GIANT_QUAD_BREATH_LENGTH = GIANT_SWEEP_RANGE;     // 帯の寸法はsweepの流用(叩き台=設計書に寸法の明記なし)
export const GIANT_QUAD_BREATH_HALF_WIDTH = GIANT_SWEEP_HALF_WIDTH;
export const GIANT_QUAD_ICE_RADIUS = 90;                       // = SKADI_ICE_RADIUS(専用定数として新設・共有定数は書き換えない。SKADI_ICE_RADIUSは本ファイル後方で定義のため値のみ複製)
export const GIANT_QUAD_ICE_DELAY_MS = 2400;                   // 実効2.0s(スカジの氷テレグラフ=SKADI_ICE_TELEGRAPH_MSと同じ長さの叩き台)
// v0.25.3074(社長指示「サークル状に散らばってるキラキラが中心に凝縮されてキラキラ粉塵爆発!」):
// 遅延起爆の氷は**赤い予告円**(色の文法どおり)に戻し、氷らしさ=キラキラの動きで見せる。
// 予告の間はキラキラを**円周から中心へ半径を詰めながら**撒き(=凝縮して見える)、起爆の瞬間に散らす。
// キラキラは判定ゼロの派手枠②=円の半径・2秒・ダメージには一切触れない。
// v0.25.3077(社長指示「粉塵爆発わけわからん。キラキラしすぎ。ちゃんと分かる程度のキラキラで、
// 圧縮される時はキラキラが爆弾みたいに小さく凝縮され、爆発は飛び散る感じで」):
// ①量を大幅に減らす(旧: 110msごとに3粒×3氷=画面がキラキラで埋まっていた)。
// ②凝縮は**最後に一点へ集まって「爆弾」の玉になる**よう、半径の詰まり方を加速させる(二乗)。
//   終盤だけ粒を増やして密度を上げる=小さく固まって見える。
// ③爆発は円の内側を埋めるのではなく、**外へ飛び散る**(縁の外側までのリング状に散らす)。
const QUAD_ICE_GATHER_MS = 150;   // 凝縮キラキラの間引き(旧110)
const QUAD_ICE_GATHER_N = 1;      // 通常時の粒(氷1つあたり・旧3)
const QUAD_ICE_GATHER_TIGHT_N = 3;// 終盤(玉になる所)だけ増やして密度を出す
// v0.25.3078(社長指示「凝縮感が足りない。もっともっと小さく纏まってから爆発」):
// ①玉の段階を早める(0.72→0.5=残り半分は「もう固まっている」状態を見せる)
// ②玉の大きさを**半径比ではなく絶対px**で縛る(半径比だと氷が大きいほど玉も大きく=固まって見えない)。
const QUAD_ICE_TIGHT_FROM = 0.5;  // この進行度から「玉」段階
const QUAD_ICE_BALL_PX = 12;      // 玉の最大半径(px)。ここまで小さく纏めてから爆発させる
// v0.25.3079(社長指示「絵もギュッと」「爆発の一瞬前にピカッ!」):
const QUAD_ICE_SPARK_SCALE_MAX = 0.85; // 撒き始めの粒の大きさ
const QUAD_ICE_SPARK_SCALE_MIN = 0.28; // 凝縮しきった時の粒の大きさ
const QUAD_ICE_FLASH_LEAD_MS = 130;    // 爆発の何ms前に光らせるか
const QUAD_ICE_FLASH_R = 92;           // ピカッの光の半径
// 氷結波(大技)の予兆: キラキラが全方位からボスへ集まる(社長指示v0.25.3079)。
const NOVA_GATHER_MS = 55;             // 予兆キラキラの間引き(密度を出す)
const NOVA_GATHER_N = 4;               // 1回あたりの粒
const NOVA_MOTE_LIFE_MS = 420;         // 粒が外周から本体へ届くまでの時間(=飛ぶ速さを決める)
const NOVA_GATHER_LEAD_MS = 900;       // 発動の何ms前から集め始めるか(飛んで来る時間ぶん早める)
const NOVA_GATHER_R = 420;             // 集まり始める外周の半径
const QUAD_ICE_BURST_N = 10;      // 粉塵爆発の粒(氷1つあたり・旧16)
const QUAD_ICE_BURST_INNER = 0.55;// 爆発の粒を撒く輪の内側(半径比)
const QUAD_ICE_BURST_OUTER = 1.25;// 同・外側(判定より外へ出る=分類②の派手枠)
export const GIANT_QUAD_BREATH_SWEEP_RAD = (2 * Math.PI) / 3;  // 120°(sweepbeamと同値・独立定数として新設)

// --- stage-4: 氷結波(nova・大技・トレース元=フリーデ/ヴォルドの氷の波。内側が安全=逆張り) ---
export const GIANT_NOVA_WINDUP_MS = 1440;  // 実効1200ms・身を屈めて静止
export const GIANT_NOVA_ACTIVE_MS = 840;   // 実効700ms・半径60→400が広がる
export const GIANT_NOVA_RECOVER_MS = 1320; // 実効1100ms
export const GIANT_NOVA_CD_MS = 12000;     // 実効10.0s(社長指示2026-08-20「大技系は10秒CDを標準に」。旧13200=実効11.0s)
export const GIANT_NOVA_RADIUS_START = 60;
export const GIANT_NOVA_RADIUS_END = 400;
export const GIANT_NOVA_BAND_THICKNESS = GIANT_SWEEP_HALF_WIDTH; // 輪の判定幅(叩き台=sweepの半幅を流用)

// --- stage-5: 翼撃(wing・独自技・左右同時+固定遅延の三拍目=回避狩り) ---
// ★翼撃(wing)を**ステージ1の大技**へ作り替えた(社長指示v0.25.2863)。
// 旧: stage-5の固有技。前方に左右2枚の帯(開き36°)+一拍おいて中央の三拍目=**横回避を狩る**技。
// 新: 「片手が翼になっている」という設定に合わせ、**羽を頭上に広げて素早く360度ぶん回す**。
//     ⇒ 判定は**ボスを中心とした円**(社長裁定: 半径380=旧・叩きつけと同じ間合い)。
//     よけ方が「横へ回る」から「**範囲の外へ出る**」に変わるので、溜め・硬直・CDは
//     大技(旧・叩きつけ)の値をそのまま引き継ぐ=**避けきった見返りが全技中で最長**のまま。
// ※CLAUDE.md「危険を伝える絵は判定に揃える」: 見た目が360度なら判定も円にする(見た目だけ回さない)。
export const GIANT_WING_WINDUP_MS = 1440;       // 実効1200ms・羽を頭上に広げて静止
export const GIANT_WING_ACTIVE_MS = 312;        // 実効260ms・素早くぶん回す
export const GIANT_WING_RECOVER_MS = 1560;      // 実効1300ms・全技中で最大の反撃窓=大技の報酬
export const GIANT_WING_CD_MS = 12000;          // 実効10.0s(社長指示2026-08-20「大技系は10秒CDを標準に」。旧13200=実効11.0s)
// GIANT_WING_RADIUS は episodeShape.ts(葉)へ移設(AI_HUMANIZE.md B2 ★未決#14=(a)。値は不変)。

// ★三連射(trishot)= stage-5 の固有技(v0.25.2939・社長支給素材)。
// **判定と秒数は旧・翼撃(v0.25.2862以前)と同一**(社長「内容は変わらず」)。
// 左右2枚の帯が同時 → 一拍おいて中央の三拍目=**横へよけた先を狩る**。変わったのは絵だけで、
// 3方向それぞれに対応した銃が「シュッとフェードイン → バンと撃つ → 反動で後ろへ下がって
// フェードアウト」を各自のタイミングで行う(描画は pixiScene・判定はここ)。
export const GIANT_TRISHOT_WINDUP_MS = 1200;       // 実効1000ms
export const GIANT_TRISHOT_ACTIVE_MS = 264;        // 実効220ms
export const GIANT_TRISHOT_THIRD_DELAY_MS = 480;   // 実効400ms(固定)・実行から三拍目まで=回避狩り
export const GIANT_TRISHOT_RECOVER_MS = 960;       // 実効800ms
export const GIANT_TRISHOT_CD_MS = 10800;          // 実効9.0s
// GIANT_TRISHOT_LENGTH/GIANT_TRISHOT_HALF_WIDTH/GIANT_TRISHOT_SPREAD_RAD は
// episodeShape.ts(葉)へ移設(AI_HUMANIZE.md B2 ★未決#14=(a)。値は不変・上のimport/export参照)。

// --- stage-5: 掃射(sweepbeam・大技・トレース元=ダークイーター・ミディールのビーム薙ぎ) ---
export const GIANT_SWEEPBEAM_WINDUP_MS = 1560;  // 実効1300ms・頭を上げて溜める
export const GIANT_SWEEPBEAM_ACTIVE_MS = 1080;  // 実効900ms・120°を回転して薙ぐ
export const GIANT_SWEEPBEAM_RECOVER_MS = 1440; // 実効1200ms
export const GIANT_SWEEPBEAM_CD_MS = 12000;     // 実効10.0s(社長指示2026-08-20「大技系は10秒CDを標準に」。旧15600=実効13.0s)
export const GIANT_SWEEPBEAM_LENGTH = 700;
export const GIANT_SWEEPBEAM_HALF_WIDTH = 30;
// 懐(回転の中心付近)が安全=帯の始点を中心からこの分だけ前へ出す(ウリの内径修正=v0.25.2376の方式を
// 踏襲: ドーナツのくり抜きではなく、始点そのものを外へ出す通常カプセル。図形と判定が完全一致する)。
export const GIANT_SWEEPBEAM_INNER_RADIUS = 100; // 叩き台=設計書に寸法の明記なし(ウリのuriSweepInnerRadius140/90の中間帯)
export const GIANT_SWEEPBEAM_SWEEP_RAD = (2 * Math.PI) / 3; // 120°

// ==== M67: グレン(stage-7)専用の技セット(PACING_PUZZLE.md §6.26-12・社長指示「ステージ7は別格
// として技のバリエーションを組んで。ラスボスなので。しかもここは雑魚いないので。」) ====
// 対象はisStoryBoss===true && storyBossVariant==='stage-7'の個体だけ(giantScript.tsのglenScriptApplies
// が門番)。stage-ex1(未確認変異体)・通常ステージ(1〜6)の城ボスには一切効かない。既存5技
// (stomp/sweep/jump/dash/bolt)とM60のPhase3(3連携)は無改変のまま。`?glenscript=0`で本節を丸ごと
// 無効化=今日までのグレン(既存5技のみ)に戻る。実効ms→生値の変換は6.26-5と同じ×1.2。
export const GLEN_SCRIPT_ENABLED = typeof window === 'undefined' || new URLSearchParams(window.location.search).get('glenscript') !== '0';

// --- 血の爪痕(talon・Phase1〜・トレース元=Mohgの Bloodflame Talons) ---
// ★爪の振り速度2倍(社長指示v0.25.2885): 1080→540(実効900→450ms)。
// この定数は**爪が振り抜けるまでの時間そのもの**(絵は aiPhaseUntil を読んで扇45°をこの間に振り切る)
// なので、半分にすると振りが2倍速になる。予告の猶予も同じだけ短くなる=技全体が速い。
// **爆ぜるまでの遅延(GLEN_TALON_DETONATE_DELAY_MS)は別定数なので触っていない**(学習点①の間は保持)。
export const GLEN_TALON_WINDUP_MS = 540;            // 実効450ms・静止(3本の爪痕の狙いをロック)
export const GLEN_TALON_DETONATE_DELAY_MS = 1080;   // 実効900ms(固定)・置いた痕が爆ぜるまでの遅延(学習点①)
export const GLEN_TALON_RECOVER_MS = 960;           // 実効800ms
export const GLEN_TALON_CD_MS = 10800;              // 実効9.0s
export const GLEN_TALON_LENGTH = 280;               // 叩き台(設計書に寸法明記なし)。近〜中帯の帯として妥当な長さ
export const GLEN_TALON_HALF_WIDTH = 42;            // 叩き台(既存T3帯の標準的な半幅レンジ内)
export const GLEN_TALON_SPREAD_RAD = Math.PI / 8;   // 叩き台(22.5°)。3本を扇状に開く左右オフセット角

// --- 血の弧(boon・Phase1〜・トレース元=Mohgの Bloodboon) ---
export const GLEN_BOON_WINDUP_MS = 1200;            // 実効1000ms・静止
export const GLEN_BOON_DETONATE_DELAY_MS = 840;     // 実効700ms(固定)・置かれてから爆ぜるまでの遅延(学習点②)
export const GLEN_BOON_FLOOR_MS = 4800;             // 実効4000ms(固定)・爆ぜた後、床として残り続ける時間(学習点②)
export const GLEN_BOON_RECOVER_MS = 840;            // 実効700ms
export const GLEN_BOON_CD_MS = 13200;               // 実効11.0s
export const GLEN_BOON_COUNT = 5;                   // 設計書どおり固定5個
export const GLEN_BOON_RADIUS = 70;                 // 叩き台(設計書に寸法明記なし)
export const GLEN_BOON_ARC_RADIUS = 500;            // 叩き台。中〜遠帯(320〜900)の中間あたり
export const GLEN_BOON_ARC_SPREAD_RAD = Math.PI / 3; // 叩き台(60°)。5個を並べる弧の開き角


// --- 伸びる触手(reach・Phase1〜・社長裁定「見た目の間合いより遥かに遠くまで届く」) ---
// ★触手が伸びる速度3倍(社長指示v0.25.2885): 960→320(実効800→267ms)。
// 触手の伸長速度は `GLEN_REACH_LENGTH / (この値/ENEMY_ATTACK_SPEED_MULT)` で決まる(専用の速度定数は無い)。
// 900px を 267ms で伸び切る=約3375px/s。**当たり判定は伸び切った瞬間に全長900pxで1回出る**ので、
// 判定の出るタイミングもこの値と一致したまま3倍速くなる(絵と判定はズレない)。予告帯は従来どおり
// 1フレーム目から全長900pxで出るが、**見えてから当たるまでが1/3**になる。
// v0.25.3138 実効300→420ms / v0.25.3142 420→540ms / v0.25.3143 540→850ms(社長指示で段階的に延長)。
// ★v0.25.3145(社長指示「触手、**ミーミルレーザーと同じく切り返しで避ける**3連技に変更」):
//   **避け方の設計そのものを差し替えた**。
//   - 旧: 溜め開始で狙いを固定 ⇒ 避け方=「**帯の外まで走り抜ける**」。
//         この形は溜めの長さが足りないと**構造的に避けられない**(v3143でその穴を塞いだばかり)。
//   - 新: 溜め中ずっと**慣性を持った照準が追いかけてくる** ⇒ 避け方=「**切り返す(反転する)**」。
//         走り続けても追いつかれる/立ち止まりも捕まる。**反転だけが慣性で振り切れる**。
//   実装は `stepLaserAim`(mimirLaserTrack.ts)を**そのまま呼ぶ**=ミーミルのレーザーと同じ物理・
//   同じ「じわじわ加速→追い越して振り切れる」カーブ。数値をこちらへ複製しない(=文法が1本に保たれる)。
//   溜めは実効 **1500ms**: 照準の全反転にかかる慣性が約1.0秒なので、**それ以上の長さが要る**
//   (短いと反転する時間そのものが無く、新しい避け方が成立しない)。ミーミルの実測では
//   「発射600〜1800ms前の反転」が振り切れる窓なので、1500msなら**発射600ms前まで**が有効窓になる。
// v0.25.3157(社長案「遠くから離して、強めの慣性があれば、振り子の様になる」): 実効1500→**2600ms**。
// 振り子は**時間が要る**。掃引で「振り子になる×立ち止まり/走り続けは捕まる×切り返しで振り切れる
// ×その窓が広い」を全部満たす組を探し、この長さに落ち着いた(1500msでは1つも成立しない)。
// 実測(この設定): 振れ幅171px・照準が狙いを2回横切る・立ち止まり9px/走り続け22pxで捕まる
//                 ・切り返しは発動200〜1700ms前で振り切れる(**途切れの無い**1500msの窓)。
// ★もっと大きく振れる組(振れ幅421px)もあったが、**窓が飛び飛び**(直前は避けられ、中盤は捕まり、
//   序盤はまた避けられる)になった。**振れ幅より窓が連続していることを優先**する
//   ——避け方が読めないのは、地味なのより悪い。
export const GLEN_REACH_WINDUP_MS = 3120;           // 実効2600ms・静止(照準が振り子のように振れる)
export const GLEN_REACH_ACTIVE_MS = GIANT_SWEEP_ACTIVE_MS; // 叩き台=既存sweepの実行時間を流用(設計書に明記なし)
export const GLEN_REACH_RECOVER_MS = 840;           // 実効700ms
export const GLEN_REACH_CD_MS = 9600;               // 実効8.0s
// ★社長指示v0.25.3126「触手は**1秒置きにターゲティングしなおして発動3連発**」。
// ★v0.25.3143で「1秒置き」を**やめた**(社長指示。上のWINDUPのコメントが理由の正本)。
// 経緯: 社長指示v0.25.3126は「触手は**1秒置きに**ターゲティングしなおして3連発」だった。そのため
// v3138/v3142の延長では周期1.0秒を守り、伸ばした分を間から引いた(300/220/480 → 420/220/360 →
// 540/220/240)。しかしそれは**1発あたりの猶予を増やさない**操作で、避けられない状態が残った。
// ⇒ 社長裁定により**溜めを優先**。現在は 溜め850 + 実行220 + 間240 = **実効1.31秒周期**。
// 間(GAP)は触っていない=v3142の値のまま。ここを戻す(=480msへ)と1発ごとの呼吸は戻るが、
// 3連発全体が更に伸びる。**技のテンポの話なので社長判断**(勝手に動かさない)。
// ★社長決定v0.25.3158「このまま3連続」。振り子化(v0.25.3157)で1発2.6秒になり、3連発だと
// 技全体が**8.9秒**(従来5.6秒)になるが、**3発のまま**とする。私は2連発を推薦したが不採用。
// ⇒ **長さを理由にこの数を減らさないこと。** 学習点④「回数で読ませる」の一族でもある
//   (三連突進/虚無の三唱と同じく固定3=数えられる)。
export const GLEN_REACH_SHOTS = 3;                  // 何発撃つか(固定3=数えられる)
// ★社長指示v0.25.3159b「触手2.3秒のところで次の触手発動(つまり少し被る)」。
// 溜め(実効2600ms)より**短い**間隔なので、**前の触手がまだ溜めている間に次が生える**
// =同時に2本が存在する。1本ずつの状態機械では表現できないため、技の間だけ
// `enemy.gReachShots` で複数本を持ち回る形にした(v0.25.3159b)。
// 被り時間 = 2600 − 2300 = **300ms**。
export const GLEN_REACH_INTERVAL_MS = 2760;         // 実効2300ms(次の触手が生えるまで)
export const GLEN_REACH_GAP_MS = 288;               // 実効240ms(次の溜めまでの「間」。赤い帯は出ない)
export const GLEN_REACH_LENGTH = 900;               // 設計書どおり(長さ900)
// GLEN_REACH_HALF_WIDTH は episodeShape.ts(葉)へ移設(AI_HUMANIZE.md B2 ★未決#14=(a)。値は不変)。

// --- 虚無の三唱(nihil・大技・Phase2=HP60%〜・トレース元=Mohgの「ニヒル」の儀式) ---
// v0.25.3143(社長指示「お経技も溜めの間隔を少し長く」): 実効800ms → 950ms/唱。
// ★v0.25.3144(社長指示「お経もだよ。**逃げきれない**」): 950ms → **1300ms**/唱。
//   触手(reach)と**同じ構造的欠陥**が、こちらはもっと大きく開いていた:
//     円から出るのに必要な距離 = 半径260 + プレイヤーの半分14 = **274px**
//     素の足(PLAYER_BASE_SPEED=87px/s)で274px = **3149ms**かかる
//     反応(約250ms)込みの下限 = **約3400ms**(=3唱の合計で必要な長さ)
//     旧800ms×3=2400ms ⇒ 実移動2150ms=187px / 950ms×3=2850ms ⇒ 226px。
//     **どちらも274pxに届かない=反応時間ゼロでも逃げ切れない**(社長の報告と一致)。
//   1300ms×3=3900ms ⇒ 実移動3650ms=**317px** > 274px で、素の足のまま逃げ切れる(余裕16%)。
//   ※この技は避け方が「円の外へ出る」だけ・ダメージ99(瀕死)なので、**逃げ切れる長さは仕様の下限**。
//     短くしたい場合は時間ではなく**半径(GLEN_NIHIL_RADIUS)を縮める**のが対の手=社長判断。
// 唱と唱の間隔がそのまま「どん!」の間隔=**数える速さ**でもある。回数3は不変=乱数にしない。
// ★円が爆ぜるのは3唱ぶんの合計時間(giantDelayedHitsのfireAtがこの定数から導出)なので、
//   ここを変えれば**予告円の滞空時間も自動で伸びる**=絵と判定がズレることはない。
export const GLEN_NIHIL_CHANT_MS = 1560;            // 実効1300ms/唱×3(学習点④=固定3回・乱数にしない)
export const GLEN_NIHIL_RECOVER_MS = 1680;          // 実効1400ms(全技中最大)
export const GLEN_NIHIL_CD_MS = 19200;              // 実効16.0s
export const GLEN_NIHIL_RADIUS = 260;               // 設計書どおり(半径260)
// 社長指示v0.25.3126「三唱のダメージを100に」→ v0.25.3127「99で」(即死ではなく**瀕死**にする値)。
// 他の技(enemy.damage)より明確に重い=「3回数えて逃げる」を守らなかった時の代償(避け方は円の外へ出るだけ)。
export const GLEN_NIHIL_DAMAGE = 99;
// v0.25.3122(社長指示「赤い当たり判定全体に画像を三段階で表現。その度に画面大きく揺れる」):
// 1唱ごとの画面揺れ。**全技中で最大級**(飛び降り着地の15に並ぶ)=「数える3回」を体で分からせる。
export const GLEN_NIHIL_SHAKE_MS = 300;
export const GLEN_NIHIL_SHAKE_MAG = 15;
/**
 * 専用SE(壊れたラジオ・v0.25.3141)を鳴らす長さ=**技1回の実効尺**。
 * 素材は15.7秒の曲なので、この長さで切ってフェードアウトさせる(社長裁定B案)。
 *
 * ★**上の定数から導出する**こと(v0.25.3143): 最初は audioManager 側に 3800 と直書きしていたが、
 * その状態で詠唱の長さを変えると**技はまだ続いているのにSEだけ先に消える**(同じ値を2箇所に持つ型・
 * TEST_DESIGN.md 型A)。呼び出し側から `playSfx(key, 1, GLEN_NIHIL_SE_MS)` で渡して1本化する。
 */
export const GLEN_NIHIL_SE_MS = Math.round(
  (GLEN_NIHIL_CHANT_MS * GLEN_NIHIL_CHANT_COUNT + GLEN_NIHIL_RECOVER_MS) / ENEMY_ATTACK_SPEED_MULT,
);

// --- 連続ジャンプ(trijump・社長指示v0.25.2430「着地後すぐに次のジャンプを3回連続」) ---
// 設計(社長裁定「おすすめで」): **3点まとめて溜め開始でロック**して3つの赤い円を最初から全部見せる。
// = 追ってくるのではなく「見て全部避けるパズル」(§6.28-3「何が・どこには嘘をつかない」の遵守)。
// 回数は**3固定**(乱数にしない)=学習装置③「回数で読ませる」。三連突進/虚無の三唱と同じ一族。
export const GLEN_TRIJUMP_WINDUP_MS = 1200;   // 実効1000ms(大技のリード床)。ここで3円を出し切る
export const GLEN_TRIJUMP_AIR_MS = 336;       // 実効280ms/1跳び。着地したら「すぐ」次へ。
export const GLEN_TRIJUMP_RECOVER_MS = 1800;  // 実効1500ms=全技中で最大の反撃窓(虚無の三唱1400msより長い)
// ============================================================================================
// 跳ぶ技の台帳(v0.25.3086・TEST_DESIGN.md 型C「付け忘れ」+ 型A「値の二重管理」への対策)
// --------------------------------------------------------------------------------------------
// ★なぜ台帳にするか(実際の事故から):
//  ・型A: 城ボスの飛び掛かりは**滞空の絵だけ**別の定数(PUMPKIN_JUMP_MS=実効833ms)を読み、
//    実際の滞空は GIANT_JUMP_AIR_MS(実効320ms)だった。**まだ空中高くに居るのに着地**していた(v3077)。
//    「同じ意味の値(=この技の滞空時間)」が2箇所にあり、片方だけ直されたのが原因。
//  ・型C: グレンの連続ジャンプだけ**そもそも高さの計算が無く**、地面を滑っていた(v3077)。
//    「跳ぶ技の一覧」がどこにも無く、付け忘れても誰も気づけなかった。
// ⇒ **滞空時間と浮きの高さの出どころをこの表1つに集約**し、描画(pixiScene)はここから引く。
//    新しい跳ぶ技を足す時は**この表に1行足すだけ**で絵が付く=付け忘れが構造的に起きない。
//    テスト(airMoveLedger.test.ts)が表の自己整合と、事故そのものの回帰を見張る。
// ============================================================================================
export interface AirMoveSpec {
  /** 空中に居る間の aiPhase(この間だけ浮く)。 */
  phase: string;
  /** 滞空時間の生値(実効 = これ / ENEMY_ATTACK_SPEED_MULT)。**判定側と同じ定数を指す**こと。 */
  airMsRaw: number;
  /** 浮きの見た目の高さ(px)。 */
  hopPx: number;
  /** 事故調査で読む用の表示名。 */
  label: string;
}
export const AIR_MOVES: readonly AirMoveSpec[] = [
  { phase: 'jump', airMsRaw: PUMPKIN_JUMP_MS, hopPx: PUMPKIN_JUMP_HEIGHT, label: '汎用の飛び掛かり(パンプキン/ハンター/ラボゾンビ3)' },
  { phase: 'g-jump-air', airMsRaw: GIANT_JUMP_AIR_MS, hopPx: PUMPKIN_JUMP_HEIGHT, label: '城ボスの飛び掛かり' },
  { phase: 'g-trijump-air', airMsRaw: GLEN_TRIJUMP_AIR_MS, hopPx: PUMPKIN_JUMP_HEIGHT, label: 'グレンの連続ジャンプ' },
];
/** aiPhase から跳ぶ技を引く。表に無い=その技は跳んでいない(浮かせない)。 */
export const airMoveFor = (phase: string | undefined): AirMoveSpec | undefined =>
  phase === undefined ? undefined : AIR_MOVES.find(m => m.phase === phase);
// --- 第二形態の通常技: 尻尾の叩きつけ → 弾の連射(社長指示v0.25.3139) ---
// 「赤ライン予兆から発動」「尻尾の長さに連動」「(叩きつけ)からの弾連射(すでに出てる弾の機能を意図的に連射)」。
// ★射程は定数で持たない。`glenTailReach(enemy)` が唯一の出どころ=**見えている尻尾の長さがそのまま判定**。
// v0.25.3146: 実効700ms → **1050ms**。理由2つ:
//  ①社長指示「ちゃんと振り上げて叩きつける動作入れて」= 振り上げ→落とすの2挙動を見せる尺が要る。
//  ②回避可能性の走査(v0.25.3146)でこの技が**NG**と出た: 帯半幅46 ⇒ 抜けるのに 46+14=60px、
//    素の足87px/sで690ms + 反応250ms = **940msが下限**。700msでは反応込みで間に合わなかった。
//    1050msで余裕+12%。
export const GLEN_TAILSLAM_WINDUP_MS = 1260;   // 実効1050ms・赤ラインを出して尻尾を振り上げる
export const GLEN_TAILSLAM_ACTIVE_MS = 264;    // 実効220ms・叩きつけの瞬間(=GIANT_SWEEP_ACTIVE_MSと同値)
// v0.25.3149(社長指示「もっと勢いよく」): 叩きつけの瞬間の画面揺れ。虚無の三唱(15)ほどではないが
// 「重い物が地面を叩いた」と体で分かる強さ。踏み鳴らし系と同じ短さ(尾を引かせない)。
export const GLEN_TAILSLAM_SHAKE_MS = 260;
export const GLEN_TAILSLAM_SHAKE_MAG = 11;
// GLEN_TAILSLAM_HALF_WIDTH は episodeShape.ts(葉)へ移設(AI_HUMANIZE.md B2 ★未決#14=(a)。値は不変)。
// 叩きつけの直後に、**既にある胴体弾(glenVolleyShots)をそのまま連射**する。弾の性能・見た目・
// カウンター可否は1つも変えない=「すでに出てる弾の機能を意図的に連射」(社長の言葉どおり)。
export const GLEN_TAILSLAM_VOLLEYS = 3;        // 斉射の回数
export const GLEN_TAILSLAM_VOLLEY_GAP_MS = 360; // 実効300ms・斉射の間隔
export const GLEN_TAILSLAM_RECOVER_MS = 960;   // 実効800ms・硬直=反撃窓
export const GLEN_TAILSLAM_CD_MS = 8400;       // 実効7.0s(通常技なので大技より短い)
export const GLEN_TRIJUMP_CD_MS = 18000;      // 実効15.0s
export const GLEN_TRIJUMP_RADIUS = 110;       // 1跳びの着地AoE半径(城ボスの飛び掛かり100より少し大きい)

// 裏ボス スカジ専用の氷ハザード(社長指示)。判定はupdateEnemiesで、見た目はpixiScene。
// 氷塊の起爆・氷刃の命中はどちらも既存の爆発処理(pumpkinBlasts)へ ice:true で積み、青FXで消化する。
export const SKADI_ICE_RADIUS = 90;    // 氷塊破裂のAoE半径(2秒テレグラフなので少し大きめ)
export const SKADI_ICE_DAMAGE = 38;    // スカジ本体の damage と同じ(=爆発攻撃と一緒)
export const SKADI_BLADE_SPEED = 700;  // 氷刃の発射速度(px/s・通常弾320より速い)
export const SKADI_BLADE_DAMAGE = 20;  // 氷刃の命中ダメージ(ボス弾相当)
export const SKADI_BLADE_HIT = 18;     // 氷刃の命中半径(px)
export const SKADI_BLADE_LIFE_MS = 2500; // 発射後の寿命(ms)。これを過ぎると消滅
// v0.25.3071(社長指示「スカジの技にもこのキラキラを利用したい」): 城ボスの冷気ブレス/氷の三連突進と
// **同じ素材・同じ籠**(fx/breath-sparkle・quadBreathSparkles)を、スカジの氷技へ横展開する。
// 全て**判定ゼロの派手枠(分類②)**=氷塊のAoE半径・氷刃の当たり半径・秒数・ダメージは一切不変。
// 撒く数は上限で縛る(氷檻=8個同時起爆が最大のケース: 8×BURST_N)。
const SKADI_SPARKLE_BLADE_MS = 60;        // 氷刃の軌跡の間引き(ブレスと同値)
const SKADI_SPARKLE_BLADE_BACK_PX = 34;   // 刃の少し後ろへ置く(進行方向の逆)
const SKADI_SPARKLE_ICE_MS = 180;         // 氷塊テレグラフ中の「冷気が集まる」の間引き
const SKADI_SPARKLE_ICE_FROM = 0.4;       // テレグラフのこの割合を過ぎてから撒き始める(近づくほど濃く見せる)
const SKADI_SPARKLE_BURST_N = 4;          // 氷塊が砕ける瞬間に散らす数(1個あたり)
// gameTime基準の間引き時計。**resetGameで戻す**(v0.25.3070の「キラキラが消えた」と同型の事故を作らない)。
// v0.25.3084(テスト設計B): ラン内の時計は src/utils/runClocks.ts へ集約した(リセット漏れを
// 構造的に起こさないため)。新しい間引き時計をここに `let` で作らないこと。
let skadiHazardSeq = 0; // スカジ氷ハザードの一意id採番(プール/差分の安定キー)
let groundFireSeq = 0;  // 火炎瓶(molotov)の地面の火の一意id採番(プール/差分の安定キー)
let sensorMineSeq = 0;  // センサー地雷(sensor-mine)の一意id採番(プール/差分の安定キー)
let flareGunSeq = 0;    // フレアガン(flare-gun)のフレアの一意id採番(プール/差分の安定キー)
let bossFireSeq = 0;    // ジブリルのランタン火の一意id採番(プール/差分の安定キー)
let acrasielSpearSeq = 0; // §6.28-19: アクラシエルの結晶の槍の一意id採番(プール/差分の安定キー)
let bloodSpikeSeq = 0;  // SKILL_BUILD_REDESIGN.md §28(B7): 血の履帯(blood-treads)の棘の一意id採番
let gravityWellSeq = 0; // SKILL_BUILD_REDESIGN.md §28(B7): グラビティショット(gravity-shot)爆縮の一意id採番
// v0.25.3703(社長指示「グラビティショットはキル時じゃなくて、射撃ヒット時に確率にして」):
// ヒットはキルの数倍の頻度なので、渦のバラマキ防止に発動後は再抽選CD(実時間・叩き台=実機で調整)。
// Date.now()基準にするのはgameTimeがラン跨ぎで0へ戻る=保存値が未来になって永久に発動しない事故を避けるため。
const GRAVITY_SHOT_PROC_CD_MS = 2000;
let gravityShotNextRollAt = 0;
// v0.25.3027: グレン第二形態の胴体弾用・sim側の足元軌跡(描画のview.glenTrailとは別台帳。
// 監査指摘どおりresetGameで明示クリアし、個体idが変われば作り直す。ストーリーボスは同時1体)。
let glenSimTrail: { id: string; trail: GlenTrailPoint[] } | null = null;
const QUAD_SPARKLE_INTERVAL_MS = 60;
/** v0.25.3028: パーツ破壊爆発(useGameLoop側でFX/SE)用の読み取り専用アクセサ。書き込みは不可。 */
export const getGlenSimTrail = (): { id: string; trail: readonly GlenTrailPoint[] } | null => glenSimTrail;
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
// export: sim.test が「慣性が実際に配線されているか」を**定数を写経せずに**検証するため(v0.25.3863)。
export const inertiaAlpha = (deltaTime: number, tau: number): number =>
  tau <= 0 ? 1 : 1 - Math.exp(-deltaTime / tau);

// スコア集計用のエリート/ボス判定(gameplayの isBossType とは別。社長指示=elite:pumpkin / boss:giantbat のみ)。
// PACING_PUZZLE.md §9-7#1: driller はpumpkinと「同格」なのでisPumpkinTier経由でエリート計上を共有する。
const isScoreElite = (t: string): boolean => isPumpkinTier(t as EnemyType);
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
export const RELOAD_MOVE_SPEED_MULT = 1;
export const INVULN_MS = 1000; // 社長裁定v0.25.3599(700→1000。多段技の3発目再被弾・群れ削り対策)

/**
 * research/GHOST_BOSS.md v6: **幻影が受ける1発**を関所(phantomGate)へ通す薄い橋。
 *
 * ここが「呼び出し側が値を渡す」担当(葉は型以外を import しない):
 *  - 被弾無敵の長さ  = プレイヤーと同じ `INVULN_MS` を**直接参照**(写経しない)
 *  - パリィ成立率    = **その回の人格**の `counterChance`(=プレイヤーのカウンターの鏡・SAME_ARENA O-5)
 *  - パリィCD        = `phantomScript` の1箇所
 * **幻影以外の敵に対しては恒等**(通常敵のダメージ・副作用に1bitも影響しない)。
 */
const gatePhantomHit = (
  enemy: Enemy, amount: number, source: PhantomDamageSource | 'ranged', gameTime: number, rand?: () => number,
): PhantomHitGateResult => phantomHitGate({
  enemyType: enemy.type,
  amount, gameTime,
  // 弾だけは「飛翔時間つきの形」で来る(GHOST_BOSS.md v9)。ここで種別と飛翔時間へ開く。
  source: typeof source === 'string' ? source : 'bullet',
  flightMs: typeof source === 'string' ? undefined : source.flightMs,
  invulnMs: INVULN_MS,
  // 台帳読みは幻影の時だけ(通常敵のホットパスに台帳アクセスを持ち込まない)。
  // ★v0.25.3860(O-5の取りこぼし修正): **その回の人格**のパリィ率を使う。
  // O-5 で癖・ビルド・HP・名前は人格から取るようにしたが、**ここだけ台帳の最強データ(鴉)固定のまま
  // 残っていた**=「別人と戦っているのにパリィの上手さだけ鴉」という状態だった。
  // 人格が未設定(旧経路)なら従来どおり台帳へ落ちる=1bit不変。
  counterChance: isGuardianPhantom(enemy.type)
    ? (getPhantomIdentity()?.profile.counterChance ?? strongestGuardian().profile.counterChance)
    : 0,
  // ★同上(O-5の取りこぼし): 反応速度も**その回の人格**から。
  reactionMs: isGuardianPhantom(enemy.type)
    ? (getPhantomIdentity()?.profile.reactionMs ?? strongestGuardian().profile.reactionMs)
    : 0,
  parryCdMs: GP_T.parryCdMs,
  // 近接パリィの窓: **storeに入った**スイング打刻を起点に、プレイヤーと同じ長さだけ開く
  // (幻影tickのパッチ合成が同フレーム後段なら1フレーム(16ms)の取りこぼしが出るが許容=仕様)。
  gpSwingAt: enemy.gpSwingAt,
  swingWindowMs: COUNTER_WINDOW,
  // 対人ダメージ1/10(社長裁定2026-08-20「一旦」)。幻影以外は1=完全恒等。
  pvpDamageScale: isGuardianPhantom(enemy.type) ? PVP_DAMAGE_SCALE : 1,
  gpHitAt: enemy.gpHitAt,
  gpParryCdUntil: enemy.gpParryCdUntil,
  rand,
  // ★SAME_ARENA §9(対人体勢): 紫中はi-frame/パリィなしで素通し(「紫→致命」がパリィで潰れない)。
  incapacitated: isGuardianPhantom(enemy.type) && isPvpIncapacitated(enemy.pvpPosture, gameTime),
});

/**
 * ★SAME_ARENA §9(対人体勢): プレイヤー側の体勢を削るパッチ。**紫入りの瞬間**は、開いている
 * カウンター窓・前隙中の振り・被弾無敵を全て破棄する(§9「紫に入った瞬間に破棄」——
 * ボスの giantDelayedHits 破棄(v0.25.3037)と同型)。呼び出し側は set() で player へ合成するだけ。
 */
export const playerPvpChipPatch = (p: Player, impact: PvpImpact, gameTime: number): Partial<Player> => {
  const { next, broke } = chipPvpPosture(p.pvpPosture, impact, gameTime, postureChipMult());
  return broke
    ? { pvpPosture: next, counterWindowStart: 0, counterWindowEnd: 0, pendingSwingAt: 0, invulnerable: false }
    : { pvpPosture: next };
};
// テスト診断フラグ(依頼#7・v0.25.2546): ?ghostlog=1 で守護霊の被弾源タグをconsoleへ出す。
// 記録専用=判定・挙動・描画には一切影響しない(window不在のヘッドレステストでは常にfalse)。
export const GHOST_DMG_LOG_ENABLED =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('ghostlog') === '1';
// v0.25.2591: 画面表示用の被弾ログ(?ghostlog=1の時だけ溜まる)。storeのstateではなくモジュール変数に
// 持ち、表示側(GhostDamageLog)が自前の間隔で読む=毎フレームの購読・再レンダーを一切増やさない。
const GHOST_DMG_LOG_MAX = 14;
let ghostDmgLines: string[] = [];
export const ghostDamageLogLines = (): string[] => ghostDmgLines;
export const resetGhostDamageLog = (): void => { ghostDmgLines = []; };
// v0.25.3981(社長報告「どの技にも一度もカウンターを決めていない」の実測用): 被弾ログと同じ画面枠へ
// カウンター連鎖(監視/構え/成立/棄却)も書けるようにする汎用push。記録専用=判定・挙動・描画は不変。
// 書き込み元は useGameLoop(監視・構え)と ghostCounter.ts(成立・棄却)。?ghostlog=1 の時だけ呼ばれる。
export const ghostLogPush = (line: string): void => {
  console.log('[GHOSTLOG]', line);
  ghostDmgLines = [...ghostDmgLines, line].slice(-GHOST_DMG_LOG_MAX);
};
// v0.25.3958: ?kblog=1 の観測結果(敵の大移動/消失)を**画面に出す**ための行バッファ(スマホ実機では
// コンソールが見られないため・ghostlogと同型)。モジュール変数+表示側(KbLogOverlay)が1秒間隔で
// 読むだけ=毎フレームの購読・再レンダーを一切増やさない。書き込み元は useGameLoop の kblog 観測器。
const KB_LOG_MAX = 14;
let kbLogLines: string[] = [];
export const kbLogPush = (line: string): void => { kbLogLines = [...kbLogLines, line].slice(-KB_LOG_MAX); };
export const kbLogLinesGet = (): string[] => kbLogLines;
// v0.25.2599(社長報告「まだ守護霊だけ死に絵がない」): 守護霊が落ちた瞬間の「倒れた絵」を出すための
// **視覚専用の控え**。守護霊の実体は死亡と同時に summons から消える(damageSummonのfilter)ため、
// レンダラは state から倒れた姿を描けない=寄りズームの先に何も居ない状態だった。
// プレイヤー側は死んでも player が残るのでレンダラ内ラッチ(this.playerDeathAt)だけで足りるが、
// 守護霊は「死んだ」という事実を store しか知らないので、その1点だけをここへ置く。
// §2.11追補: 主語ごとの状態であって共有帳簿ではない。ルール(保持/フェード長=プレイヤーと同じ定数)は共有。
// 判定・ダメージ・挙動には一切使わない(レンダラが読むだけ)。
export interface GhostDeathPose {
  x: number; y: number; width: number; height: number; // 死亡フレームの矩形(足元=x+w/2, y+h)
  klass: string;   // ghostClass(倒れ絵=そのクラスの近接ポーズ-ready)
  facing: number;  // ghostFacing(-1=左)
  atMs: number;    // 死亡時刻(Date.now)。レンダラはこれが変わった時だけラッチし直す。
}
let ghostDeathPoseRec: GhostDeathPose | null = null;
export const ghostDeathPose = (): GhostDeathPose | null => ghostDeathPoseRec;
export const resetGhostDeathPose = (): void => { ghostDeathPoseRec = null; };
export const setGhostDeathPose = (p: GhostDeathPose): void => { ghostDeathPoseRec = p; };
// v0.25.2582(社長「ためしたい」=§2.11追補・除外1の試験改定): 守護霊起因でもズーム/スロー/ストップの
// 同梱演出(triggerFinishImpact/triggerHitImpact)を出す。CDはプレイヤーと**共有の1本**
// (lastKillZoomAt/JUICE_CD)=演出はカメラ=世界にひとつの資源なので、主語ごとに持たず連鎖スパムを
// CDで抑える。`?ghostzoom=0` で従来(除外1=守護霊はシェイクと文字のみ)へ完全復帰(A/B比較用)。
// 対象はキル・フィニッシュ・カウンター成立のみ(サブ起因のスロー禁止ルールはプレイヤー同様に維持)。
// v0.25.2588(社長裁定「食らうタイミングをカウンターと見ない修正」): 既定で**被弾=カウンター窓が閉じる**
// (他ゲーム標準の二値へ)。`?lastcounter=1` で旧挙動(被弾していてもカウンター成立)へ完全復帰。
// プレイヤー(damagePlayer)と守護霊(damageSummon)の**両方**に同じ規則を適用する(§2.11追補=同じ仕様)。
// v0.25.2589(社長指示「ボスモードではNPC出撃しないで」): ボス戦テスト出撃かどうか。
// タイトルの「ボス戦テスト」が付ける強制出現フラグ(utils/bossTest.FORCE_PARAMS と同じ4種)の
// いずれかが立っていれば真。判定はモジュールロード時に1回だけ(他のデバッグフラグと同じ作法)。
// v0.25.2628(社長「npcじゃま」): **ボスメーカーの部屋(bossmaker)も含める**。旧は4種だけを見ており、
// メーカーの部屋には護衛NPCが出撃していた(§1-1「敵は選んだボス1体だけ」に反する)。
export const BOSS_TEST_RUN =
  typeof window !== 'undefined'
  // v0.25.2858: ボスラッシュの練習ラン(`?practice=1`)も同じ扱い=チュートリアルも護衛NPCも出さない。
  && ['bossnow', 'idolnow', 'gateboss', 'castlenow', 'bossmaker', 'practice']
    .some(k => new URLSearchParams(window.location.search).get(k) === '1');
export const LATE_COUNTER_ENABLED =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('lastcounter') === '1';
export const GHOST_ZOOM_TRIAL_ENABLED =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('ghostzoom') !== '0';
// キャラ登場演出。2段構成:
//  フェーズA(ヘリ飛来): 超遠く・高くから小さく飛来し、降下しながら拡大して着地ダッシュの開始点へ。
//  フェーズB(ジャンプ着地): 従来のロックマン的ダッシュ着地(左から低く猛スピード→中央着地)。
// この間はゲーム進行/入力/敵スポーンを止め、カメラが追従/横断し、見た目は飛行する。
// 洋館(ステージ6)開始の走り込み距離(world px): プレイヤー+護衛を到着点のこの距離だけ下(手前)に置き、
// 自動で上へ走らせて入場する(v0.25.2110・ヘリ登場なし)。
export const CORRIDOR_RUNIN_DIST = 380;
// 洋館通路の下限(v0.25.2123・社長指示): スタート地点(y=0)からこの距離まで下がれる(それ以下へは行けない)。
// v0.25.2391: 「移動不可エリアにアイテムも敵も沸かないで」の社長指示により、通常湧きの敵にも
// clampRectToPlayableArea 経由でこの下限を適用するようにした(下記参照。固定/イベント/裏ボス等は対象外)。
// 実体は `src/world/playableArea.ts`(再輸出)。
export const CORRIDOR_BOTTOM_LIMIT = CORRIDOR_BOTTOM_LIMIT_FROM_WORLD;
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
// 1行の所要時間(オートタイプ+保持)。holdMs 指定行(無線の「間」等)はそれをそのまま使う。
// 表示側(IntroDialogue)と終了判定(useGameLoop)で必ず同じ値を使うため共通化する。
export const introLineMs = (l: IntroLine): number =>
  l.holdMs ?? (l.text.length * (INTRO_DIALOGUE_CHAR_MS + INTRO_DIALOGUE_READ_MS) + INTRO_DIALOGUE_LINE_HOLD_MS);
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
/**
 * v0.25.2589(社長指示「死にモーション中に攻撃できちゃうのやめたい。あとアテンション系のイベント中も
 * 攻撃できちゃう」): **攻撃だけ**を止めるゲート。isInputLocked(操作全般)は入力ハンドラ(ジョイスティック/
 * マウス)しか見ておらず、**自動射撃・オート斬撃・サブの自動発動はループ側で走り続けていた**ため、
 * 死亡モーション中(health<=0)やボス出現アテンション中も撃ち続けていた。
 * isInputLocked に加えて **attention(ボス出現等の演出中)** も攻撃禁止に含める。
 * ※移動はここでは止めない(isInputLockedの範囲は変えない=アテンション中に歩けるのは従来どおり)。
 */
export const isAttackLocked = (): boolean => {
  const s = useGameStore.getState();
  // v0.25.3318(社長指示): 帰還サークル(ゴール)の「敵が入れない+攻撃禁止」は撤廃。指を離せば
  // 即ゴールする現仕様では安全地帯ハメが成立しないため(旧v0.25.2589の対策はセットで不要になった)。
  return isInputLocked() || s.attention !== null;
};

export const isInputLocked = (): boolean => {
  const s = useGameStore.getState();
  // エンディング(仮組み)は「実際はプレイヤーもいない見せるだけのシーン」(裁定2026-08-28)。
  // プレイヤー実体=不可視のカメラ台車(ENDING_SCENE.md 演出仕様v2 §4)なので、corridorRunInActive
  // (自己解除する洋館の走り込み)とは別に、farBackdrop==='ending'の間は常時ロックする。
  // deliveryLocked(二人組クエストv2 §2-8・納品ロック): isPausedは使わない(会話が時間駆動で
  // isPaused中は進まず永久フリーズするため)。ここに足せば isAttackLocked も自動で伝播する。
  return s.isPaused || s.player.health <= 0 || s.corridorRunInActive || s.farBackdrop === 'ending' || isGameTimeStopped() || s.deliveryLocked;
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
// 社長指示v0.25.3277「武器箱が10%の確率で[秘密兵器箱]に変化」: 拾うと大表示+武器抽選3回+
// 赤経験値20個ばらまき(松明壊し=DROP_SCATTER_RADIUS 42より広く)。屋内(研究所)は武器が
// 出ない箱(トレジャー箱)なので対象外。
// ★v0.25.3559(社長裁定「5%にさげよう」): 0.10 → 0.05。率そのものは v0.25.3277 から不変だったが、
// パンプキンが台本の邪魔者枠で常連化して箱の数が約3倍(抽選13回/ラン前後)になり、秘密箱の実出現が
// 期待値1.3個/ランまで膨らんでいた(社長報告「その確率が異様に高い」)。5%で期待値≈0.65個/ランへ。
// ★v0.25.3644(社長裁定「いまの金箱の層は削除。この当たり箱を新金箱として統一。5%で箱が金箱として
// 登場。小ボスは確定ドロップ」): 旧「秘密兵器箱」を**金箱(bounty-chest)に改名・統一**。
// スポーン時に5%で武器箱→金箱へ変化(見た目=gold-chest素材)。賞金首は金箱を確定ドロップ(従来どおり)。
// 旧金箱の中身(トレジャー×2+スクラップ・rollBountyChestReward)は**削除**し、中身はこの当たり構成
// (武器抽選3回+赤経験値20個+スクラップ10倍)に一本化。
const GOLD_CRATE_RATE = 0.05;
const GOLD_CRATE_WEAPON_ROLLS = 3;
const GOLD_CRATE_XP_COUNT = 20;
const GOLD_CRATE_XP_VALUE = 5;            // value>=5 = 赤経験値(pixiSceneの色分けしきい値)
const GOLD_CRATE_XP_SCATTER_RADIUS = 150; // 松明(42)・武器箱スクラップ(92)より広く
const GOLD_CRATE_STRAP_MULT = 10;         // 社長指示v0.25.3282「(旧)秘密箱、スクラップも10倍で」
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
// ★ナイフマスター(社長指示2026-08-29「通常攻撃でコンボになるんじゃなかったっけ？そうして」
// 「窓が3秒に短縮。ただ、コンボマスターも取ると＋で延長」): 所持中は近接の通常ヒットも
// 表示コンボ(meleeFinishCombo)に加算される代わりに、コンボ窓が3秒へ締まる。
// コンボマスターの延長(+1.0/1.5/2.0s)と装備KILL猶予はその上に乗る(従来式のまま)。
const KNIFE_MASTER_COMBO_WINDOW_MS = 3000;
// フィニッシュコンボ窓(ms)。書き込み全箇所がこの1本を使う(旧: 4箇所にインライン式が散っていた)。
export const meleeFinishComboWindowMs = (player: Player): number =>
  ((hasSkill(player, 'knife-master') ? KNIFE_MASTER_COMBO_WINDOW_MS : MELEE_FINISH_COMBO_WINDOW_MS)
    + skillFinishComboWindowBonus(player)) * (player.equipBonus?.killGraceMult ?? 1);
const GRENADE_BOUNCE_DAMPING = 0.86;
const GRENADE_ROLL_DRAG = 1.45;

/**
 * 近接ヒットの実効クリ率(唯一の式・v0.25.2514で4箇所の同型コードから抽出=値は不変)。
 *  = min(1, 武器基礎 + 本体(レベルアップ)+ トラップ拘束(+10%)+ 弱点(近接+10%)
 *           + 弁慶 + ナイフマスター) に敵側クリペナルティを適用。
 * (旧ウォームアップ項は§23-1裁定で退役=削除済み)
 * ナイフ/分身/刀/鞭のスイングと**守護霊の近接スイング**が同じ1本を通る
 * (BOT_AND_GHOST.md §2.11補足「写すな、共通化しろ」=ゴースト用に式を複製しない)。
 */
export const meleeHitCritChance = (
  meleeCritChance: number,
  player: Player,
  gameTime: number,
  enemy: Enemy,
): number => {
  const trapCritBonus = enemy.rootUntil !== undefined && gameTime < enemy.rootUntil ? TRAP_ROOT_CRIT_BONUS : 0;
  const weakCritBonus = WEAKCRIT_ENABLED ? weaknessCritBonus(enemy.type, 'melee') : 0;
  // §13-3d(社長裁定2026-08-26): 積み上げの合計は**ハードキャップではなくソフトキャップ**を通す
  // (30%までは素通し=これまでと同じ・超えた分だけ鈍って50%へ漸近)。**敵補正はその後**に掛ける
  // =「雑魚補正(色階層)・ボス補正(×0.5+下限5%)」の意味は不変(社長質問2026-08-26への答え)。
  return applyEnemyCritPenalty(softCapCritChance(meleeCritChance + player.critChance + trapCritBonus + weakCritBonus + skillBenkeiCritBonus(player, gameTime) + skillKnifeMasterMeleeCrit(player)), enemy);
};

/**
 * 近接スイングの素ダメージ(唯一の式・v0.25.2514で5箇所の同型コードから抽出=値は不変)。
 *  = 武器damage(既定6) × ストライカー(キャラ固有・弾切れ時×1.5) × 装備(腕・火力系)ダメージ倍率
 * プレイヤーの近接と**守護霊の近接**が同じ1本を通る(§2.11補足「写すな、共通化しろ」)。
 */
export const meleeSwingBaseDamage = (melee: Weapon | undefined, player: Player): number =>
  (melee?.damage ?? 6) * strikerMeleeMult(player) * (player.equipBonus?.damageMult ?? 1);

/**
 * カウンター反撃(パリィ成立)のダメージ(唯一の式・v0.25.2514で6箇所の同型コードから抽出=値は不変)。
 *  = max(1, round(基準銃damage(既定12) × クリ倍率(スキル込み) × バーサーカー等 × 装備ダメージ倍率))
 * プレイヤーの全パリィ経路(弾反射/着地/突進/thor/裏3/idol/天使6)と**守護霊のカウンター反撃**
 * (ghostCounter.ghostCounterDamage)が同じ1本を通る(§2.11補足「写すな、共通化しろ」)。
 */
export const counterReplyDamage = (
  baseGunDamage: number | undefined,
  player: Player,
  critBase: number,
): number => Math.max(1, Math.round(
  (baseGunDamage ?? 12) * skillCritMult(player, critBase) * skillOutgoingDamageMult(player) * (player.equipBonus?.damageMult ?? 1),
));

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

// §6.38 B4(クリーンアップ): 実効難易度倍率の式はbountyValue.ts(葉)に一本化されている。
// ★v0.25.3644: 旧金箱の中身削除に伴い、gameStore側の別名(bountyChestValueMult)は撤去
// (賞金首本体の価値スケーリングは bountyTick が bountyEffectiveValueMult を直接使う=不変)。

// research/STAGE_DIFFICULTY.md(社長裁定2026-08-20「小ボスは1 3 4 5だけ。6は小ボス無し」):
// 旧「§6.38 v2 F(4種重複なしローテ・B4)」= 1ラン内で bounty-*4種を重複なく回す方式は**撤去**。
// 種別は**ステージ固定割当**(config/stageDifficulty.ts の BOUNTY_TYPE_BY_STAGE)へ移った
// ——store のラン内状態(旧 bountyRotation)は不要になったのでフィールドごと削除している。

// ★v0.25.3644(社長裁定): 旧金箱の中身(トレジャー×2+スクラップ・rollBountyChestReward /
// BountyChestReward / BOUNTY_CHEST_TREASURE_COUNT)は**削除**。金箱の中身は collectPickup の
// 'bounty-chest' ケース(旧・秘密兵器箱の当たり構成)に一本化。v0.25.2549〜の裁定
// 「金箱=換金の稼ぎ頭」はこの裁定で置き換え(事実として記録)。
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
// Pickup には width/height が無い(点+当たり判定は描画側で決め打ち)。pixiScene.ts の
// drawPickup が使う hitSize=16 と同じ既定値を採用する(=見た目の当たり判定と一致させる)。
const PICKUP_HIT_SIZE = 16;
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
// SKILL_BUILD_REDESIGN.md §15-1(B0発注文)+設計チャットの追補: ボス突入スナップショット用の
// 装備スロット→(Tier/系統/特殊フラグ)変換。読むだけ(挙動不変)。
const equipSlotTelemetrySnapshot = (id: string | null): RunTelemetryEquipSlotSnapshot => {
  const def = equipmentById(id);
  return def ? { tier: def.tier, line: def.line, special: def.special } : { tier: 0, line: null, special: false };
};
const equipTelemetrySnapshot = (loadout: EquipLoadout): RunTelemetryEquipSnapshot => ({
  body: equipSlotTelemetrySnapshot(loadout.body),
  arms: equipSlotTelemetrySnapshot(loadout.arms),
  accessory: equipSlotTelemetrySnapshot(loadout.accessory),
});
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
  // research/GROWTH.md v4: 育成のゴールド倍率(焼き値)も**この算出行**に掛ける(addGold側ではない=
  // 壁銘打ちの表示が同額のまま取り残されないように)。GoldRushと同じ作法=両方持てば重なる。
  const namedGold = Math.round(NAMED_TREASURE_GOLD * skillGoldRushMult(st.player) * st.player.growthGoldMult);
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
  get().spawnGlow(x, y, GLOW_R_XXL, 'rgba(255,215,0,', 620);
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

// 討伐で「FF風クランブル」統一演出(triggerDramaticDeath)を出す対象(getsDramaticDeath=ボス系/ネームド/
// クエスト対象)の、討伐後フェード表示の長さ(ms)。useGameLoop の BOSS_FADE_MS / pixiScene の
// syncBossCorpse 内 FADE_MS と同じ値で必ず揃える(3箇所で複製・pixiScene側の既存コメントと同じ運用)。
const DRAMATIC_DEATH_FADE_MS = 2600;

// spawnRing/spawnBurst の色パーサ(pixiScene.glowTint)は 'rgba(r,g,b,...)' 形式からしか tint を
// 抽出できない(hexは白 0xffffff にフォールバック)。getEnemyColor は hex を返すため、敵色で確実に
// 色付けしたいリングだけこの変換を通す(spawnBurst側は既存の全呼び出しと同じくhexそのまま=挙動不変)。
const hexToRgba = (hex: string, alpha: number): string => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
};

// 「flashy unified boss death」juice機能: ボス系/ネームド/クエスト対象の討伐に共通の
// 「FF風クランブル」演出を出す(getsDramaticDeath で判定・呼び出し元でガード済み)。
// 近接(grantMeleeKillRewards)・銃/接触/爆発(damageEnemy)の両キル経路から、対象を倒した時に1回だけ呼ぶ。
// SFXは含まない(gameStoreはplaySfxをimportできないため。useGameLoopがbossCorpse.diedAtの変化を監視して
// 'boss-death'を1回鳴らす)。HARD PERF CONSTRAINT: 強glow(spawnGlow大径)は使わない=pooled sprite
// (spawnRing/spawnBurst)とscreen-space spawnFlash/triggerShake/triggerTimeSlowのみ。
const triggerDramaticDeath = (get: () => GameState, enemy: Enemy, x: number, y: number): void => {
  // ★練習ラン(ボスラッシュ)は**狙った1体を倒したら終わり**(BOSS_MAKER.md §20-7-c)。
  // ゲート2/裏ボスは倒してもクリアにならない(帰還サークルは城ボス撃破が条件)ため、放っておくと
  // 「倒したのに終われない」=練習で一番使う導線が無い状態になる。勝ちにしてリザルトへ送る。
  // 進行の書き込みは practiceGuard(localStorage封じ)と App.handleVictory 側で止めてある。
  // v0.25.2953(社長指示「ボスモードも通常モードみたいにボス消えるまでは終わらないで」):
  // **即 gameWon にしない**。撃破の瞬間はここで実時刻を打刻するだけにして、useGameLoop が
  // 「死亡アテンション(ストップ+崩壊を見せる演出)が終わってから」gameWon を立てる。
  // v0.25.3029(社長裁定「二体」): グレン形態1の死は進行を確定させない(年表・クリアフラグとも
  // 形態2の討伐=isFinalBossKillでのみ書く)。
  const glenForm1Kill = enemy.type === 'giantbat' && enemy.glenForm === 1;
  // ★v0.25.3600(社長裁定「第一倒したら第二に移行」): 練習でも形態1の討伐は勝ちにしない
  // (下の予約で形態2が続くため。勝ちは形態2=glenForm1Killでない討伐で立つ)。
  if (isPracticeRun() && enemy.type === practiceBossType() && !glenForm1Kill) {
    useGameStore.setState({ practiceWinPendingSince: Date.now(), returnCircle: null });
  }
  // 歴史年表(chronicle): 各種ボス/ハンターの初回討伐を即載せ(社長決定v0.25.1628)。近接/銃 両キル経路が
  // この関数を通るのでここ1箇所で拾える。宿敵(isNamedのみ)はボス扱いにしない=年表に載せない。
  // research/GHOST_BOSS.md(幻影): **年表には載せない**(本編の相手ではない開発実験枠)。
  // 現状 isHiddenBoss/giantbat/hunter のどれにも当たらないので既に載らないが、明示で止めておく
  // (将来 isHiddenBoss 等の構成が変わった時に黙って混入しないための1行)。
  if (!glenForm1Kill && !isGuardianPhantom(enemy.type)
    && (isHiddenBoss(enemy.type) || enemy.type === 'giantbat' || enemy.type === 'hunter')) {
    // 年表フレーズ(社長指示v0.25.1658→1659で動詞は「討伐」に統一):
    //  ・城ボス(giantbat=各ステージのストーリーボス・固有名なし)→「ストーリーボスを討伐」。
    //  ・固有名持ち(天使/裏ボス)は「CODE:◯◯を討伐」(§6.20 M45)。「天使」等の種族接頭辞は
    //    付けない(社長指示v0.25.1756「天使 はいらない」)。
    //  ・ハンターは従来どおり種族ラベル「変異体(狩猟型)を討伐」。
    // §2.17(GHOST-DUO-RECORDS・社長2026-07-31「もちろん、年表は同行でも初のみね」): 「初回のみ」規則は
    // 従来のまま(recordChronicleのdedupキー不変)。その初回の撃破の瞬間に守護霊が同行していた場合のみ、
    // 行の文言へ同行者名を添える(叩き台「CODE:◯◯を討伐(◯◯と共闘)」)。2回目以降はdedupで弾かれるので
    // ソロ初回討伐の後に同行で倒しても行は増えない・変わらない。
    const chronicleAlly = ghostAllySnapshot(findGhostAlly(get().summons));
    // 社長指示v0.25.3451(名前の全箇所統一): 城ボスの年表特例「ストーリーボスを討伐」(v0.25.1658の文言・
    // 当時は固有名なし)を廃止し、全ボス共通で台帳名(enemyDeathLabelが城ボスをステージ別名に解決)へ。
    const phrase =
      `${enemyDeathLabel(enemy.type)}を討伐`
      + (chronicleAlly ? `(${chronicleAlly.name}と共闘)` : '');
    recordChronicle(
      getSelectedStageId(),
      enemy.type === 'hunter' ? 'hunter' : 'boss',
      enemy.type,
      phrase
    );
    // 城ボスクリアフラグ(EVENT_QUEST_DESIGN.md・社長裁定v0.25.1686 #4): 討伐の瞬間に永続記録し、
    // 「城ボスフラグ && 強制クエストフラグ」が揃えばそのステージをクリア扱い=次ステージ解放。
    // イベント産のgiantbat(fromEvent)はストーリーボスではないので除外(finaleDefeatedと同じ扱い)。
    if (isFinalBossKill(enemy)) {
      const qStageId = getSelectedStageId();
      markCastleBossCleared(qStageId);
      syncQuestStageClear(qStageId);
    }
  }
  // UNIQUE_WEAPONS.md §6(ユニーク武器の恒久解放): ボス撃破の確定処理でこのランのボスに紐づく
  // ユニーク武器を解放する。**どのボスが何を解放するかの表(BOSS_UNLOCK)は★未決 #U3 のため空**なので、
  // 現状はどのキーも undefined になり何も起きない。裁定が下りたら weaponSlots.ts の表に行を足すだけで動く。
  // キー形式は `type@stageId`(城ボスは全ステージ 'giantbat' 1種なのでステージで割る必要がある)。
  // ★練習ラン(ボスモード/ガントレット)では呼ばない: practiceGuard は localStorage の書き込みだけを
  // 飲んで読みは素通しするため、そのまま呼ぶと markWeaponUnlocked が毎回 true を返し
  // 「偽の解放」が練習のたびに起きる(小烏丸が持っているのと同じ穴を持ち込まない)。
  if (!isPracticeRun()) {
    const unlockKey = BOSS_UNLOCK[`${enemy.type}@${getSelectedStageId() ?? ''}`] ?? BOSS_UNLOCK[enemy.type];
    if (unlockKey && markWeaponUnlocked(unlockKey)) {
      useGameStore.setState({
        lastWeaponGet: {
          name: `${weaponDisplayName(unlockKey)} 解放`,
          at: Date.now(),
          color: '#facc15',
          kind: 'weapon',
          weaponKey: unlockKey
        }
      });
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
  // v0.25.2955(社長指示「崩れていくのがストップと画面エフェクトで全然見えない。カメラワークと
  // ストップとフラッシュが終わってから、ゲーム時間は止めたままゆっくり崩れ去っていく形にして」):
  // 死亡アテンションが付くボスは、アテンションの尺(in+hold+out)だけ死体を**無傷のまま保持**(holdMs)し、
  // カメラが戻った後に実時間でゆっくり崩す。その間 hitstop を崩壊時間ぶん延長=時間停止のまま見せる。
  // アテンションの無い相手(pumpkin/ネームド/クエスト対象)は従来どおり即崩壊(holdMs=0)。
  const bossDefeat = isBossType(enemy.type);
  // v0.25.3026(社長報告「フラッシュとか終わった後に崩れていって何も見えない」): 旧v2955は
  // カメラがプレイヤーへ戻ってから崩壊が始まる並びで、ズーム改修後は遠距離撃破が増えて
  // **戻った後のカメラから死体が画面外**=崩壊が見えなかった。崩壊は「パン到着+通常ホールド後」に
  // 開始し、アテンションのホールドを崩壊終了まで延長=**カメラが崩壊を見届けてから戻る**。
  // 総尺(時間停止)は従来と同じ IN+HOLD+CRUMBLE+OUT=約5.2秒。
  const corpseHoldMs = getsDeathAttention(enemy.type) ? ATTENTION_IN_MS + ATTENTION_HOLD_MS : 0;
  useGameStore.setState({
    // glenBoss2(v0.25.3029): 形態2の死体は変身後の絵で崩す(syncBossCorpseが読む)。
    bossCorpse: { type: enemy.type, x, y, w: enemy.width, h: enemy.height, diedAt: Date.now(), holdMs: corpseHoldMs, glenBoss2: enemy.type === 'giantbat' && enemy.glenForm === 2 },
    ...(bossDefeat ? {
      eventBannerText: `${enemyDeathLabel(enemy.type)}を討伐`,
      eventBannerUntil: get().gameTime + DRAMATIC_DEATH_FADE_MS,
    } : {}),
  });
  const tint = hexToRgba(getEnemyColor(enemy.type), 0.8);
  get().spawnFlash('rgba(255,255,255,0.32)', 260);         // 白い閃光(瞬間)
  get().spawnRing(x, y, 10, 200, 'rgba(255,255,255,0.9)', 4, 420);  // 衝撃波リング①(白・速い)
  get().spawnRing(x, y, 6, 260, tint, 3, 560);                       // 衝撃波リング②(敵色・遅れて大きく)
  get().spawnBurst(x, y, getEnemyColor(enemy.type), 26);             // 崩れ散る残骸
  get().triggerShake(DRAMATIC_DEATH_FADE_MS, 6);            // 長く低いシェイク(旧・裏ボス限定=5 よりわずかに強め)
  get().triggerTimeSlow(0.35, 520, 90);                     // 決着の一瞬をスロー
  // ★アテンション(時間停止+カメラ寄り)は `getsDeathAttention` が唯一の出どころ。
  // pumpkin は除外(v0.25.2879)——ウェーブで何度も倒す相手なので、毎回止まるとテンポが切れる。
  if (getsDeathAttention(enemy.type)) {
    // v0.25.3026: ホールドを崩壊時間ぶん延長して渡す=hitstopもtriggerAttention側で同尺になる
    // (旧v2955の「別途hitstopだけ延長」は廃止。カメラと時間停止の尺が1本化される)。
    get().triggerAttention(x, y, undefined, BOSS_CORPSE_CRUMBLE_MS);
  }
  // v0.25.3029(社長裁定「二体」): 形態1の討伐では、討伐アテンション(パン→ホールド→崩壊→戻り)が
  // 終わった時刻に**形態2を同位置へ湧かせる予約**を張る(消費はuseGameLoop)。
  // ★v0.25.3600(社長裁定「合体」): 練習ランでも張る(旧: 第二形態の独立枠があったため
  // 練習では張らなかった=!isPracticeRun()。枠の撤去に伴い本編と同じ流れへ)。
  // 二重呼び出し(近接/銃の両キル経路)対策で未予約の時だけ(監査指摘・致命5)。
  if (glenForm1Kill && !enemy.fromEvent && get().glenForm2SpawnAt == null) {
    useGameStore.setState({
      glenForm2SpawnAt: {
        at: Date.now() + ATTENTION_IN_MS + ATTENTION_HOLD_MS + BOSS_CORPSE_CRUMBLE_MS + ATTENTION_OUT_MS,
        x: enemy.x + enemy.width / 2,
        y: enemy.y + enemy.height / 2,
      },
    });
  }
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

// 社長指示v0.25.3325「処刑の発火地点は敵にして」: このスイングでフィニッシュした敵(最初の1体)の
// 中心座標。処刑(execution-shock)の爆発中心に使う。finisherが居なければnull。
const meleeFinisherAt = (
  killed: { enemy: Enemy; finisher: boolean }[]
): { x: number; y: number } | null => {
  const e = killed.find(k => k.finisher)?.enemy;
  return e ? { x: e.x + e.width / 2, y: e.y + e.height / 2 } : null;
};

// ---------------------------------------------------------------------------
// 主語(オーナー)の解決 — research/GHOST_PARITY_LEDGER.md 裁定2「共有方式」/
// BOT_AND_GHOST.md §2.11補足「写すな、共通化しろ」(v0.25.2518・GHOST-KATANA-WIRE)。
//
// 刀(一閃/オート斬撃)とワイヤーアンカーの状態機械は「プレイヤー=唯一の主語」で書かれていた。
// これを **1枚の疑似Player** で差し替える:
//   ghostId 未指定 → 本物のプレイヤー(=従来と1bitも変わらない既定)。
//   ghostId 指定   → 守護霊の疑似Player。中身は
//                    ①計測時ビルドのスキル/装備/クリ率/サブウェポン(GHOST-BUILD-1のghostBuild)
//                    ②ゴースト実体の座標・寸法・HP(ghostActorPlayer)
//                    ③ゴーストの刀/ワイヤー状態(Summon.ghostDash → DashLocomotionState)
//                   を1つのPlayerに着せたもの。これで既存コードの
//                   player.x / subWeapons / katanaDashUntil / wireDashUntil … の読みが全部そのまま通る。
// 書き込みだけは主語ごとに宛先が違うので setActorDashState で振り分ける。
// ---------------------------------------------------------------------------
/**
 * research/SAME_ARENA.md O-1: 幻影(`guardian-phantom`)を1枚の疑似Playerへ詰め替える。
 * 中身は守護霊とまったく同じ3つ: ①`Enemy.phantomBuild` のビルド(スキル/装備/クリ率/サブ)
 * ②**幻影実体**の座標・寸法・HP(距離依存のスナイパー倍率と失HP依存のバーサーカー倍率を
 * 幻影基準で評価するため) ③幻影自前のサブCD帳簿(別財布)。
 * ビルドが無い(=旧来の決闘)場合は **null** を返し、呼び出し側は従来経路へ落ちる。
 */
const phantomActorPlayerById = (actorId: string, st: GameState): Player | null => {
  const e = st.enemies.find(x => x.id === actorId && x.type === 'guardian-phantom');
  if (!e || !e.phantomBuild) return null;
  const build = actorBuildFor(e.id, e.phantomBuild, st.player);
  if (!build) return null;
  return {
    ...ghostActorPlayer(build, e),
    subWeaponCooldowns: e.phantomSubWeaponCooldowns ?? EMPTY_SUB_COOLDOWNS,
  };
};

export const combatActorPlayer = (actorId?: string): Player | null => {
  const st = useGameStore.getState();
  if (actorId === undefined) return st.player;
  const g = st.summons.find(s => s.id === actorId && s.kind === 'ghost-ally');
  // ★research/SAME_ARENA.md O-1: 守護霊で見つからなければ**幻影(Enemy)**として解決する。
  // 幻影は敵シャーシに乗っているが、`ghostActorPlayer` の第2引数は
  // `{x,y,width,height,health,maxHealth}` の**構造型**なので Enemy をそのまま渡せる
  // =新しい計算式を1本も書かずに「プレイヤーの形」へ詰め替えられる。
  if (!g) return phantomActorPlayerById(actorId, st);
  const build = ghostBuildFor(g, st.player);
  if (!build) return null;
  // §2.11追補(v0.25.2541・GHOST-SAME-SPEC): サブCDは**ゴースト自前の帳簿**を重ねる
  // (旧「1つの財布」=プレイヤーのsubWeaponCooldowns/strapsの重ねは廃止。守護霊は独立した
  // 2人目のプレイヤー=2人分のサブが独立に回る)。ビルドは召喚1体につき1件メモ化した写しなので、
  // ここで実体側の帳簿を重ねないとCD表が召喚時点で凍る(v0.25.2525の実バグと同型)。
  // undefined=空={} =全サブ即使用可(実プレイヤーが途中参戦した時と同じ)。
  return {
    ...ghostActorPlayer(build, g),
    ...dashStateOf(g.ghostDash),
    // v0.25.2830: 銃も「独立した2人目」の同じPlayer形へ重ねる。未発砲なら計測ビルドの満タン武器、
    // 以後はSummonに持つ同じWeapon[]/リロード状態が正本になる。
    weapons: g.ghostWeapons ?? build.player.weapons,
    activeWeaponId: build.player.activeWeaponId,
    reloadEndsAt: g.ghostReloadEndsAt ?? 0,
    reloadingWeaponId: g.ghostReloadingWeaponId ?? '',
    subWeaponCooldowns: g.ghostSubWeaponCooldowns ?? EMPTY_SUB_COOLDOWNS,
    // GHOST-SUBS-FINAL(v0.25.2563): 守護霊が**自分で**投げたクイックマガジンを回収して得たクリ窓。
    // GHOST-BUILD-1では「本人のバフ窓を二重取りしない」ため0へ中立化していた枠で、いま守護霊自身が
    // 同じ窓を持てるようになった(=同じ式(gunShotCritChance)がそのまま効く。中立化の意図は不変)。
    quickMagCritUntil: g.ghostQuickMagCritUntil ?? 0,
  };
};

// 空のCD帳簿(未使用のゴースト用)。毎回 {} を作ると疑似Playerの参照が毎フレーム変わるので固定する。
const EMPTY_SUB_COOLDOWNS: Partial<Record<SubWeaponKey, number>> = {};

/**
 * サブウェポンCDの書き込み(主語で宛先を振り分ける・setActorDashStateと同型)。
 * ghostId 未指定 → プレイヤーの帳簿(従来の setSubWeaponCooldown をそのまま呼ぶ=1bit不変)。
 * ghostId 指定   → そのゴースト自前の帳簿(Summon.ghostSubWeaponCooldowns)。
 *   CD補正(オーバークロック→タイムキーパー)は**プレイヤーと同じ純関数**を、ゴースト自身の
 *   ビルド(疑似Player)を主語に通す。計測(recordSubUse/recordOverclockProc)は除外4(運用系)= 積まない。
 */
export const setActorSubWeaponCooldown = (
  ghostId: string | undefined,
  key: SubWeaponKey,
  readyAt: number,
): void => {
  if (ghostId === undefined) {
    useGameStore.getState().setSubWeaponCooldown(key, readyAt);
    return;
  }
  const actor = combatActorPlayer(ghostId);
  if (!actor) return;
  const gameTime = useGameStore.getState().gameTime;
  const delta = readyAt - gameTime;
  // ★対人トラップ効果中は「CD短縮系も無効」(社長指示2026-08-25)。actor が幻影/守護霊の時は
  // `trapDebuffUntil` を持たない=常に素通し(対人のみ)。
  const cd = applySubCooldownSkills(
    trapGatedOverclockChance(actor, skillOverclockChance(actor)),
    trapGatedCooldownMult(actor, skillCooldownMult(actor)),
    delta,
  );
  if (cd.overclockProc) return; // 成立=CDを付けない(プレイヤーと同じ)
  const effReadyAt = cd.deltaMs === delta ? readyAt : gameTime + cd.deltaMs;
  const st = useGameStore.getState();
  if (st.summons.some(x => x.id === ghostId && x.kind === 'ghost-ally')) {
    useGameStore.setState(s => ({
      summons: s.summons.map(x => x.id === ghostId
        ? { ...x, ghostSubWeaponCooldowns: { ...(x.ghostSubWeaponCooldowns ?? {}), [key]: effReadyAt } }
        : x),
    }));
    return;
  }
  // ★research/SAME_ARENA.md O-1: 幻影(Enemy)の帳簿。宛先が違うだけで、上のCD補正
  // (オーバークロック→タイムキーパー)は**守護霊・プレイヤーと同じ純関数**を通っている。
  useGameStore.setState(s => ({
    enemies: s.enemies.map(x => x.id === ghostId && x.type === 'guardian-phantom'
      ? { ...x, phantomSubWeaponCooldowns: { ...(x.phantomSubWeaponCooldowns ?? {}), [key]: effReadyAt } }
      : x),
  }));
};

/** 刀/ワイヤー状態の書き込み(主語で宛先を振り分ける)。ghostExtra=ゴースト固有フィールドの同時更新。 */
const setActorDashState = (
  ghostId: string | undefined,
  patch: Partial<DashLocomotionState>,
  ghostExtra?: Partial<Summon>,
): void => {
  if (ghostId === undefined) {
    useGameStore.setState(s => ({ player: { ...s.player, ...patch } }));
    return;
  }
  useGameStore.setState(s => ({
    summons: s.summons.map(x => x.id === ghostId
      ? { ...x, ghostDash: { ...dashStateOf(x.ghostDash), ...patch }, ...(ghostExtra ?? {}) }
      : x),
  }));
};

// Shared per-kill rewards for melee-grade kills (the release counter swing and
// the katana strikes). Mirrors what the counter has always granted: XP pickup,
// enemy currency, ammo scavenge for the active gun family, boss weapon crates,
// and finisher juice. Extracted from triggerCounter so the katana reuses the
// exact same finisher judgement/演出 without duplicating reward rules.
// ───────────────────────────────────────────────────────────────────────────
// サブクエスト(research/SUBQUESTS.md)の進捗合流点。
//
// ★キル確定点は**2本**ある(v2監査・致命1)。`damageEnemy` のkill分岐(銃/接触/爆発/DoT)と、
//   `grantMeleeKillRewards`(カウンター/刀/鞭/分身/投擲スケボー=近接5経路の合流点)。
//   recordKill / 二人組の questKillProgress と**同じ両点配線**を踏襲する。片方だけに書くと
//   近接キルが丸ごと数えられない(このプロジェクトが繰り返している事故の型)。
// ★除外: ベンチ(benchmarkRun)と練習/ガントレット(isPracticeRun)。練習は practiceGuard が
//   保存を飲むが、**表示・付与も止める**(決闘のHUDと財布を汚さない)。
// ───────────────────────────────────────────────────────────────────────────

/** 敵1体からサブクエストのキルイベントを組み立てる(在中系のフラグはstateから)。 */
const subquestKillEventFrom = (st: GameState, enemy: Enemy): SubquestKillEvent => ({
  colorTier: enemy.colorTier,
  isNamed: !!enemy.isNamed,
  isBounty: isBountyType(enemy.type),
  isBoss: isBossType(enemy.type),
  labLevel: enemy.type === 'lab-zombie-1' ? 1 : enemy.type === 'lab-zombie-2' ? 2 : enemy.type === 'lab-zombie-3' ? 3 : undefined,
  hordeActive: st.activeEvent?.kind === 'horde',
  redNightActive: st.redNight?.phase === 'active',
});

/** イベント1件を active な枠(最大2)へ適用。達成したら即ゴールド付与+ポップ、そして cleared へ移す。 */
const applySubquestProgress = (get: () => GameState, ev: SubquestEvent): void => {
  const st = get();
  if (st.benchmarkRun || isPracticeRun()) return;
  if (st.subquests.length === 0) return;
  const active: SubquestActiveEntry[] = st.subquests
    .filter(r => !r.done)
    .map(r => ({ id: r.id, progress: r.progress }));
  if (active.length === 0) return;
  const res = applySubquestEvent(active, ev);
  if (!res.changed) return;

  // 表示行の更新: 並びは維持し、達成した行は done=true で**そのランでは残す**(空欄にしない)。
  const clearedIds = new Set(res.clearedNow.map(d => d.id));
  const nextProgress = new Map(res.active.map(e => [e.id, e.progress]));
  const rows: SubquestRunEntry[] = st.subquests.map(r => {
    if (r.done) return r;
    if (clearedIds.has(r.id)) return { ...r, progress: r.target, done: true };
    const p = nextProgress.get(r.id);
    return p === undefined || p === r.progress ? r : { ...r, progress: p };
  });

  // 保存(小15: マッチのたびに書く。数十バイト)。cleared は「報酬を出した」印=判定対象から外れる。
  const stageId = getSelectedStageId();
  const saved = getStageSubquestState(stageId);
  putStageSubquestState(stageId, {
    cleared: [...new Set([...saved.cleared, ...clearedIds])],
    active: res.active,
  });

  let gold = 0;
  for (const def of res.clearedNow) {
    // v3裁定Q3: 報酬にもゴールドラッシュを掛ける(台帳の20〜200Gは掛ける前の定義)。
    // research/GROWTH.md v4: 育成のゴールド倍率(焼き値)も同じ算出行に掛ける(リザルト記録・吹き出しも
    // この gold を読むので、addGold 側で掛けてはいけない)。
    gold += Math.max(1, Math.round(def.rewardGold * skillGoldRushMult(get().player) * get().player.growthGoldMult));
  }
  useGameStore.setState(state => ({
    subquests: rows,
    subquestGoldEarned: state.subquestGoldEarned + gold,
    subquestClearSeq: state.subquestClearSeq + res.clearedNow.length,
  }));
  if (gold > 0) {
    get().addGold(gold);
    const p = get().player;
    get().spawnCallout(p.x + p.width / 2, p.y - 26, `+${gold}G`, '#fbbf24', { scale: 1.1 });
  }
};

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
  // KILL吹き飛び(死体・SKILL_BUILD_REDESIGN.md §26-1): 近接全キル経路(triggerCounter/katana/
  // whip/shadowClone/skaterBoardHit)はこのヘルパーを通るので死体化もここ1箇所で拾える。呼び出し元の
  // set() は既にこの敵を state.enemies から外している(survivorsに積んでいない)ため、対象を選んで
  // 死体として書き戻す。attacker=このスイングの実行者(プレイヤー本体 or 守護霊の疑似Player)。
  const corpseAdds = killed
    .filter(k => corpseEligible(k.enemy))
    .map(k => buildCorpseFromKill(k.enemy, player));
  if (corpseAdds.length > 0) {
    useGameStore.setState(state => ({ enemies: [...state.enemies, ...corpseAdds] }));
  }
  for (const { enemy, finisher } of killed) {
    // ★v0.25.3965(実機kblog「消失 bounty-ranged cause=不明」の真相): 近接キルは全経路この
    // ヘルパーを通るのにタグが無く、近接で倒したボス級(死体化しない=即除去)が全部「不明」と
    // 出ていた(社長「賞金首なら倒したわ」で発覚)。死体化する通常敵は後のクランブルで再タグされる。
    tagRemove(enemy.id, 'kill'); // 消失ログ用: 近接撃破
    // PACING_REDESIGN.mdバッチ2(計測): 近接全経路のキルを種別+スタイル集計へ記録(挙動には影響しない)。
    // バッチ3.5-Bの追補: 型ごとの最終キル時刻も記録(問題児リフラクトリ判定用)。
    // PACING_PUZZLE.md §14-4-3(使者・hangedman): 計測(killTelemetry)の対象外(除外リスト)。
    if (!isHangedman(enemy.type)) recordKill(enemy.type, 'melee', get().gameTime);
    // BOT_AND_GHOST.md §2.10 G5: ボス撃破の通知(記録専用・挙動不変)。近接全経路(通常近接カウンター/
    // 刀/鞭/シールドバッシュ/投擲スケボー/分身)はこのヘルパーを通るのでここ1箇所で拾える
    // (gun/接触/爆発/DoT/カウンター等の非近接経路は damageEnemy 側で同様に通知)。
    // v0.25.2553(§2.16 A): 撃破の瞬間に召喚中の同行守護霊(居なければnull)を添えて記録する。
    // §2.17(GHOST-DUO-RECORDS): 同行枠の台帳へも同じ写しで打刻する。二枠は構造的に排他=
    // 同行ランはnotifyBossClearがno-op(session=null)/ソロランはrecordDuoBossClearがno-op(時計なし)。
    // v0.25.3029: グレン形態1の死は記録しない(giantbat@stage-7の撃破記録=形態2の討伐。
    // first-winsの台帳が形態1のタイムで確定してしまうのを防ぐ・監査指摘・致命3)。
    if (!(enemy.type === 'giantbat' && enemy.glenForm === 1)) {
      const allySnap = ghostAllySnapshot(findGhostAlly(get().summons));
      notifyBossClear(enemy.type, getSelectedStageId(), allySnap);
      recordDuoBossClear(enemy.type, getSelectedStageId(), allySnap);
    }
    // 二人組クエストのキル進捗(EVENT_QUEST_DESIGN.md)。近接全経路はここ1箇所で拾える。
    {
      const qs = useGameStore.getState();
      const qNext = questKillProgress(qs.eventQuestActive, qs.eventQuestGoalTier, qs.eventQuestKills, enemy);
      if (qNext !== null) useGameStore.setState({ eventQuestKills: qNext });
    }
    // v0.25.3983(社長指示): 城ボス撃破→城の崩壊(近接全経路の合流点=ここ1箇所で拾える)。
    collapseCastleOnBossDeath(enemy);
    // サブクエストのキル進捗(research/SUBQUESTS.md)。★近接キル確定点(2本のうちの1本)。
    applySubquestProgress(get, { type: 'kill', kill: subquestKillEventFrom(get(), enemy) });
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
    const ownedAmmoTypes = getGuns(player)
      .map(w => w.ammoType)
      .filter((t): t is AmmoType => !!t);
    // 弾薬AIディレクター(v0.25.2170): 「全所持銃の弾備蓄の枯渇度×敵の多さ」で基礎率を最大20%まで底上げ。
    // ?ammodir=0で無効化(常にmeleeAmmoDropPercentのまま)。
    // 弾薬ドロップ率アップ(パッシブ): 既定ドロップ率に ammoDropBonus を加算(0..1)。
    const dirPct = AMMO_DIRECTOR_ENABLED
      ? ammoDirectorRate(get().meleeAmmoDropPercent, {
          families: ownedAmmoTypes.filter(t => t !== 'phill').map(t => ({ reserve: ammoPoolFor(player, t), max: AMMO_MAX[t] })),
          enemyCount: get().enemies.length,
        })
      : get().meleeAmmoDropPercent;
    const baseRateRaw = Math.max(0, Math.min(1, dirPct / 100 + (player.ammoDropBonus ?? 0) + (player.equipBonus?.ammoDropBonus ?? 0)));
    // PACING_PUZZLE.md §7-11c(3): レール(judge/dps)のドロップバイアス=弾。既定(rail未指定)は
    // railAmmoDropMultが1を返すため無改変。近接キル全般(grantMeleeKillRewards)が唯一の掛け先。
    const baseRate = Math.max(0, Math.min(1, baseRateRaw * railAmmoDropMult(RAIL_KIND, RAIL_MULT)));
    const ammoChance = ammoChanceOverride !== undefined
      ? ammoChanceOverride
      : (finisher ? Math.min(1, baseRate * 1.5) : baseRate);
    // PACING_PUZZLE.md §5.5 M5(RE4式): 残弾割合が最小の弾種を落とす(同率は構え優先・phill対象外)。
    // ?ammosmart=0で従来(構え銃の弾種)へ。ドロップ率・供給量は不変=弾種の配分のみ。
    const smartType = AMMO_SMART_ENABLED
      ? pickAmmoDropType(ownedAmmoTypes.map(t => ({ type: t, reserve: ammoPoolFor(player, t), max: AMMO_MAX[t] })), gun?.ammoType)
      : null;
    const dropType = smartType ?? gun?.ammoType ?? ownedAmmoTypes[0];
    // ナイフマスターは弾薬ドロップ0%(何をしても。社長指示)。
    // M0(訓練)は弾を拾う教習まで抽選ドロップを封印(社長指示v0.25.2319・m0Unlocked.ammo)。
    if (dropType && !hasSkill(player, 'knife-master') && get().m0Unlocked.ammo && Math.random() < ammoChance) {
      get().addPickup({
        id: `pickup-ammo-melee-${enemy.id}`,
        x: ex - 8 + 14, y: ey - 8,
        type: `ammo-${dropType}` as `ammo-${AmmoType}`, // v0.25.4000: 5種目(glauncher)を落とせる嘘つきキャストを是正
        value: 0
      });
    }
    // Mid-boss killed in melee still drops its weapon crate (the gun-kill
    // path drops one too; bosses are usually finished with the counter).
    // PACING_PUZZLE.md §9-7#1(死亡FXの重さ・useGameLoop.ts:10740付近と対の近接経路):
    // driller はpumpkinと同格=isPumpkinTier経由でクレート/リング演出を共有する。
    if (isPumpkinTier(enemy.type) || enemy.type === 'giantbat') {
      get().addPickup({
        id: `pickup-crate-${enemy.id}`,
        x: ex - 8, y: ey - 8 - 18,
        type: 'weapon-crate',
        value: 0
      });
      get().spawnRing(ex, ey, 10, 80, 'rgba(96,165,250,0.7)', 3, 500);
    }
    // §6.38 B3(賞金首の金箱): 討伐で1個ドロップ(専用pickup)。中身はcollectPickup側で開封時に
    // 実効エリアrankから計算する(pickup生成=このaddPickup自体はvalue未使用=weapon-crateと同型)。
    if (isBountyType(enemy.type)) {
      get().addPickup({
        id: `pickup-bounty-chest-${enemy.id}`,
        x: ex - 8, y: ey - 8 - 18,
        type: 'bounty-chest',
        value: 0
      });
      get().spawnRing(ex, ey, 10, 90, 'rgba(251,191,36,0.75)', 3, 520);
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
        // ★KILL処刑演出v2発動中はここを出さない: 全停止中はstoreの粒子が凍るため、pixi側が
        // 実時間駆動の間欠泉を「掻っ切りの瞬間・全員一斉」で出す(二重噴出の防止)。
        const kfx = get().killFx;
        if (kfx && Date.now() - kfx.startAt < KILLFX_TOTAL_MS) return;
        get().spawnBlood(ex, ey, -Math.PI / 2 - 0.16, 260);
        get().spawnBlood(ex, ey, -Math.PI / 2 + 0.16, 260);
      }, MELEE_FINISH_ZOOM_MS - MELEE_FINISH_ZOOM_HOLD_MS);
      get().spawnRing(ex, ey, 10, 92, 'rgba(255,255,255,0.95)', 3, 280);
      get().spawnRing(ex, ey, 8, 64, 'rgba(252,211,77,0.95)', 4, 380);
      get().spawnRing(ex, ey, 4, 34, 'rgba(185,28,28,0.72)', 3, 320);
      get().spawnGlow(ex, ey, GLOW_R_S, 'rgba(253,224,71,', MELEE_FINISH_SLOW_MS); // KILLの光サークルを少し大きく(社長指示。46→58)
      // "Kill!" callout over the executed enemy's head. 刀の一閃は代わりに
      // 軌道中央へ「斬」を出すので、ここでは出さない。
      if (!suppressKillCallout) {
        // 表示時間・保持時間はスロー演出(MELEE_FINISH_SLOW_MS/HOLD_MS)と揃え、スローが一番遅い
        // 区間の間は文字も一番ハッキリ(満alpha)のまま保つ(社長指示)。
        // ★実機FB1(v0.25.3605): KILL処刑演出v2の発動時はここを出さない——storeのcalloutは全停止中に
        // 時計ごと凍るため、pixi側が実時間のKILL!文字を**噴出の瞬間**に出す(タイミングの一本化)。
        // killFxはこの関数の後(triggerFinishImpactの結果を見て)書かれるので、判定は0msの後回しで行う。
        setTimeout(() => {
          const kfx = get().killFx;
          if (kfx && Date.now() - kfx.startAt < KILLFX_TOTAL_MS) return;
          get().spawnCallout(ex, enemy.y - 6, 'Kill!', '#ffe4e6', {
            bg: 0x7a1322, holdMs: MELEE_FINISH_SLOW_HOLD_MS, duration: MELEE_FINISH_SLOW_MS,
          }); // 濃いワインレッド(社長指示)
        }, 0);
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

// 社長指示v0.25.3300 吸血覚醒(Lv3): 近接攻撃のヒットでも最大HPの1%回復。粒度は救難信号と同じ
// 「1スイング1回」(複数体を同時に斬っても1回)。吸収エフェクトは控えめ=drain1本を短めに流すだけで
// +数字のcalloutは出さない(キル時の既存演出との差別化)。
const applyVampireMeleeHeal = (
  get: () => GameState,
  player: Player,
  hitEnemyIds: string[],
  fallbackX: number,
  fallbackY: number,
) => {
  if (hitEnemyIds.length === 0) return;
  if (skillLevel(player, 'vampire') < 3) return;
  const heal = Math.max(1, Math.round(get().player.maxHealth * VAMPIRE_AWAKEN_MELEE_HEAL_FRAC));
  useGameStore.setState(state => ({
    player: { ...state.player, health: Math.min(state.player.maxHealth, state.player.health + heal) },
  }));
  const src = get().enemies.find(e => e.id === hitEnemyIds[0]);
  get().spawnEffect({
    kind: 'drain', id: `vamp-melee-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    fromX: src ? src.x + src.width / 2 : fallbackX, fromY: src ? src.y + src.height / 2 : fallbackY,
    createdAt: Date.now(), duration: 460,
  });
};

// スキル: リーパー(super) = 近接フィニッシュを決めた瞬間、その近接攻撃範囲(プレイヤー中心の
// 同じスイング範囲)内の敵全員にもフィニッシュ(即死)を波及。ボスは即死せず、近接フィニッシュ
// 相当ダメージ(スタン中ボスへの近接と同じ ×BOSS_MELEE_STUN_MULT)。reaper型(特殊敵)は対象外。
// SKILL_BUILD_REDESIGN.md §28(B7) スキル: 処刑の衝撃波(execution-shock、rare)も同じ合流点に乗せる
// (近接4武器=ナイフ/刀/鞭/分身の全経路がこの1関数を通るため=CLAUDE.md「同じ動作を持つ全員に付ける」)。
// 半径80/100/120(Lv)・近接表示ダメ(baseMeleeDamage)基準の30/40/50%・KB共通。
// 社長指示v0.25.3325「処刑の発火地点は敵にして」: 処刑の爆発中心は**フィニッシュした敵の位置**
// (finishAt)。リーパー波及の範囲判定は従来どおりスイング範囲=プレイヤー中心のまま(指示外は不変)。
// finisherOccurred=このスイングで finisher:true が1体でも出たか。範囲内のみで有界。
const applyMeleeFinishSkillSpread = (
  get: () => GameState,
  player: Player,
  finisherOccurred: boolean,
  pcx: number,
  pcy: number,
  range: number,
  baseMeleeDamage: number,
  finishAt?: { x: number; y: number } | null,
) => {
  if (!finisherOccurred) return;
  if (hasSkill(player, 'reaper')) {
    const r2 = range * range;
    for (const e of get().enemies) {
      if (isReaperFamily(e.type) && !isTerminalReaper(e)) continue; // 不倒の通常リーパーは対象外。深奥チェイサーは近接対象(ボス級)なので含める
      if (isCorpse(e)) continue; // KILL吹き飛び(死体・§26-2): 死体は対象選定から除外
      const ecx = e.x + e.width / 2;
      const ecy = e.y + e.height / 2;
      if ((ecx - pcx) ** 2 + (ecy - pcy) ** 2 > r2) continue;
      get().spawnSlash(ecx, ecy, 'rgba(168,85,247,0.95)');
      get().spawnMeleeBlood(ecx, ecy, e.width); // 近接の血飛沫=プレイヤーへ向かって飛ぶ(v0.25.2026)
      if (isBossType(e.type)) {
        // ボスは即死しない=近接フィニッシュ相当ダメージ(×5)。フィニッシュ波及なのでviaMeleeFinish=true
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
  }
  const shockLv = skillLevel(player, 'execution-shock');
  if (shockLv) {
    // 社長指示v0.25.3281「衝撃波が新しい要素になっちゃうので、爆発で揃えて」: 独自の"衝撃波"を
    // やめ、既存の**爆発**要素に統一。①絵=手榴弾の爆発FXと同じ組(橙リング幅5+橙バースト20+
    // 暗赤バースト8+橙グロー) ②判定=「全ての爆発」規約どおり skillExplosionMult を半径/ダメージ
    // に乗算(エクスプローダーが効く)。Lv別の基礎値(半径80/100/120・30/40/50%)は不変。
    const { radius: baseRadius, pct } = executionShockParams(shockLv);
    const exMult = skillExplosionMult(player);
    const radius = baseRadius * exMult;
    const dmg = Math.max(1, Math.round(baseMeleeDamage * pct * exMult));
    const r2 = radius * radius;
    // 社長指示v0.25.3325: 爆発中心=フィニッシュした敵の位置(複数同時フィニッシュ時は最初の1体。
    // 爆発は従来どおり1スイング1発=威力仕様不変)。座標が取れない経路は従来のプレイヤー中心へフォールバック。
    const fcx = finishAt?.x ?? pcx, fcy = finishAt?.y ?? pcy;
    get().spawnRing(fcx, fcy, 8, radius, 'rgba(251,146,60,0.82)', 5, 440);
    get().spawnBurst(fcx, fcy, '#f97316', 20);
    get().spawnBurst(fcx, fcy, '#7f1d1d', 8);
    get().spawnGlow(fcx, fcy, GLOW_R_S, 'rgba(251,146,60,', 440);
    get().spawnExplosionFx(fcx, fcy, radius); // v0.25.3283: 爆発flipbook(全爆発共通)
    for (const e of get().enemies) {
      if (isReaperFamily(e.type) && !isTerminalReaper(e)) continue;
      if (isCorpse(e)) continue; // KILL吹き飛び(死体・§26-2): 死体は対象外
      const ecx = e.x + e.width / 2;
      const ecy = e.y + e.height / 2;
      const dx = ecx - fcx, dy = ecy - fcy;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      const killedE = get().damageEnemy(e.id, dmg, true); // 爆風系と同じくボス系には非致死
      get().spawnDamageNumber(ecx, e.y, dmg, false);
      if (!killedE) {
        const dist = Math.max(0.001, Math.sqrt(d2));
        // KB共通(既定値=通常のノックバック)。エクスプローダー覚醒(Lv3)は爆発KB距離×1.5(v0.25.3300)。
        // 処刑(execution-shock)覚醒(Lv3・v0.25.3300): 巻き込んだ敵を強くノックバック
        // (実距離50px=反射神経/ボムカウンターと同じ「スキル爆発の強KB」規格)。
        const exKb = skillExplosionKbMult(player);
        const shockKb = shockLv >= 3
          ? knockbackSpeedFor(SKILL_BLAST_KB_PX, KNOCKBACK_DURATION) / BULLET_KNOCKBACK_SPEED
          : 1;
        get().knockbackEnemy(e.id, dx / dist, dy / dist, shockKb * exKb, Math.max(3, shockKb) * exKb);
      } else {
        get().spawnBurst(ecx, ecy, '#f97316', 10);
      }
    }
  }
};

// 体勢崩しへの致命は即死判定ではないが、手応えは既存KILLフィニッシュと完全に揃える。
const showBossFatalPresentation = (get: () => GameState, x: number, y: number, labelY: number) => {
  get().spawnBurst(x, y, '#dc2626', 30, 0, -1);
  get().spawnBurst(x, y, '#7f1d1d', 14, 0, -1);
  setTimeout(() => {
    get().spawnBlood(x, y, -Math.PI / 2 - 0.16, 260);
    get().spawnBlood(x, y, -Math.PI / 2 + 0.16, 260);
  }, MELEE_FINISH_ZOOM_MS - MELEE_FINISH_ZOOM_HOLD_MS);
  get().spawnRing(x, y, 10, 92, 'rgba(255,255,255,0.95)', 3, 280);
  get().spawnRing(x, y, 8, 64, 'rgba(252,211,77,0.95)', 4, 380);
  get().spawnRing(x, y, 4, 34, 'rgba(185,28,28,0.72)', 3, 320);
  get().spawnGlow(x, y, GLOW_R_S, 'rgba(253,224,71,', MELEE_FINISH_SLOW_MS);
  get().spawnCallout(x, labelY, 'Kill!', '#ffe4e6', {
    bg: 0x7a1322, holdMs: MELEE_FINISH_SLOW_HOLD_MS, duration: MELEE_FINISH_SLOW_MS,
  });
};

// ★社長指示2026-08-27「幻影戦での致命はちゃんと双方、KILL演出して。(ズームする方)」:
// **幻影→プレイヤー**の致命でも同じ演出を出すための出口(呼び出し元=phantomTickの致命ヒット)。
// 内容=プレイヤー→幻影の致命と同じ「Kill!の赤い層+CD無視の最大ズーム(triggerFinishImpact force)」。
// 跳びつき処刑アニメ(killFx)はプレイヤーが実行者の絵なので、受ける側では出さない(ズームする方のみ)。
export const showPvpFatalOnPlayerPresentation = (x: number, y: number, labelY: number): void => {
  const get = useGameStore.getState;
  showBossFatalPresentation(get, x, y, labelY);
  get().triggerFinishImpact(x, y, true);
};

// ★v0.25.3703(社長報告「パンプキンへの致命の一撃でKILL演出が出なかった。致命の一撃はCDないはず」):
// KILL処刑演出(首元へ跳びつき→掻っ切り→帰還)の発火を1本化。v0.25.3622「KILL演出を致命の一撃にも
// 流用」は**ナイフ経路だけ**に配線されており、①強個体(パンプキン等)の気絶中3×=E-1裁定の
// 「致命の一撃」 ②刀・鞭・ワイヤーの致命、が全て取りこぼされていた(「同じ動作を持つ全員に付ける」)。
// 呼び出し側はフル演出(triggerFinishImpactがtrueを返した時)だけ呼ぶ。?juice=0では出さない(従来どおり)。
const startKillFxCinematic = (
  get: () => GameState,
  prim: { cx: number; cy: number; w: number; h: number },
  victims: { x: number; y: number }[],
  pcx: number, pcy: number,
) => {
  if (!JUICE_ENABLED) return;
  useGameStore.setState({
    killFx: {
      ex: prim.cx, ey: prim.cy, ew: prim.w, eh: prim.h,
      px: pcx, py: pcy,
      startAt: Date.now(),
      victims,
    },
    hitstopUntil: Date.now() + KILLFX_TOTAL_MS,
  });
  get().triggerTimeSlow(0.2, KILLFX_TOTAL_MS + KILLFX_RELEASE_SLOW_MS, KILLFX_TOTAL_MS);
  // 首元への高速ダッシュ音(社長提供・v0.25.3665)。跳びつき開始=killFxセットと同時に1回。
  // 動的import=gameStoreはaudioManagerを静的importできない(循環)。
  void import('../audio/audioManager').then(m => m.playSfx('kill-dash'));
  // 斬撃の直後(BLOOD_LAG)にSE。血・KILL!文字と同期(v0.25.3605 FB1+FB5)。
  setTimeout(() => {
    const kfx = get().killFx;
    if (!kfx || Date.now() - kfx.startAt >= KILLFX_TOTAL_MS) return;
    void import('../audio/audioManager').then(m => {
      m.playSfx('heavy-impact');
      m.playSfx('slash-damage');
    });
  }, KILLFX_BURST_AT_MS + KILLFX_BLOOD_LAG_MS);
};

// スキル: カウンターマスター = カウンター成立スイングで、プレイヤー近傍(~MELEE_RADIUS*1.5)の敵を
// 2× KNOCKBACK_SPEED で弾く。近傍だけ走査(有界)。
const counterMasterKnockback = (get: () => GameState, pcx: number, pcy: number, kbScale = 2) => {
  const reach = MELEE_RADIUS * 1.5;
  const reach2 = reach * reach;
  for (const e of get().enemies) {
    if (isReaperFamily(e.type) && !isTerminalReaper(e)) continue; // 不倒の通常リーパーは対象外。深奥チェイサーはノックバック対象(ボス級・他の近接系と統一)
    if (isCorpse(e)) continue; // KILL吹き飛び(死体・§26-2): 死体の飛びを上書きしない
    const ecx = e.x + e.width / 2;
    const ecy = e.y + e.height / 2;
    const dx = ecx - pcx;
    const dy = ecy - pcy;
    const d2 = dx * dx + dy * dy;
    if (d2 > reach2) continue;
    const dist = Math.max(0.001, Math.sqrt(d2));
    // KNOCKBACK_SPEED の kbScale 倍相当(v0.25.3260: 底上げ(3259)も含めて社長指示で従来値へ戻し)。
    const mult = (KNOCKBACK_SPEED * kbScale) / BULLET_KNOCKBACK_SPEED;
    get().knockbackEnemy(e.id, dx / dist, dy / dist, mult, mult);
  }
};
// カウンターマスターのノックバック倍率(KNOCKBACK_SPEED 基準): Lv1 ×2 / Lv2 ×2.5 / Lv3 ×3。
const counterMasterKbScale = (player: Player): number => {
  const lv = skillLevel(player, 'counter-master');
  return lv ? [0, 2, 2.5, 3][lv] : 2;
};

// ---------------------------------------------------------------------------
// 近接スイング相乗り型サブウェポンの発動 — 唯一の出どころ(主語=オーナー引数)。
// research/GHOST_PARITY_LEDGER.md 発注C(v0.25.2525・GHOST-REFLECT-MELEE-SUBS)+BOT_AND_GHOST.md
// §2.8 G2.6(オーナー抽象化)/§2.11補足「写すな、共通化しろ」。
//
// プレイヤーの `triggerCounter`(指離しスイング)と**守護霊の近接スイング**(useGameLoopのゴースト
// 実行ブロック → `fireGhostMeleeSwingSubs`)が同じ3本を通る。呼び出し順(ブーメラン→フレア→ジャンク)も
// triggerCounter の並びのまま。actor=倍率/所持/Lvの主語(プレイヤー本人 or 疑似Player)、
// owner=座標/向きの主語(playerAsOwner / ghostAsOwner)。
// 差分は**除外4(運用系)だけ**:
//   ・SEのトリガ(boomerangThrowFxAt/junkShotFxAt=等倍で鳴る)はプレイヤーのみ。ゴーストは戻り値を見て
//     呼び出し側が距離減衰(npcSfxDistGain)付きで鳴らす。
//   ・ジャンクウェポンのスクラップ(=この武器の弾薬)は守護霊は消費しない=在庫ゲートも通さない
//     (ghost-gunが弾薬/リロードの概念を持たないのと同じ扱い)。ダメージはLv固定なので在庫非依存。
// ---------------------------------------------------------------------------

/** ドローンブーメラン(近接スイング入口・CD5秒)。発動したら true。 */
const fireDroneBoomerangOnSwing = (
  get: () => GameState, actor: Player, owner: SubWeaponOwner, gameTime: number, meleeDamage: number,
): boolean => {
  if (
    !actor.subWeapons.includes('drone-boomerang') ||
    subWeaponBlockedByKatana(actor, 'drone-boomerang') ||
    gameTime < (actor.subWeaponCooldowns['drone-boomerang'] ?? 0)
  ) return false;
  const ghostOwned = owner.kind === 'ghost-ally';
  const lvl = Math.max(1, Math.min(3, actor.subWeaponLevels['drone-boomerang'] ?? 1));
  // G2.6: 発射位置/向きはオーナー(既定=プレイヤー=従来と同値)。
  const boomCx = ownerCenterX(owner);
  const boomCy = ownerCenterY(owner);
  const dir = owner.facing ?? { x: 1, y: 0 };
  const dmag = Math.max(0.001, Math.hypot(dir.x, dir.y));
  get().addProjectile({
    id: `proj-drone-boom-${Date.now()}`,
    x: boomCx - 9, y: boomCy - 9, width: 18, height: 18,
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
    boomOriginX: boomCx,
    boomOriginY: boomCy,
    boomMaxDist: DRONE_BOOM_DIST_BY_LEVEL[lvl],
    boomStopMs: DRONE_BOOM_STOP_MS_BY_LEVEL[lvl],
    ...(ghostOwned ? { ownerGhost: true } : {}), // 既存のゴースト発動サブと同じ視覚専用マーカー(青白tint)
  });
  // v0.25.2541(§2.11追補): CDは**主語の帳簿**へ(プレイヤー=従来どおり/守護霊=自前帳簿)。
  setActorSubWeaponCooldown(ownerGhostId(owner), 'drone-boomerang', gameTime + DRONE_BOOM_COOLDOWN_MS);
  if (!ghostOwned) useGameStore.setState({ boomerangThrowFxAt: Date.now() }); // ブーメラン投擲音SEのトリガ
  return true;
};

/** フレアガン(近接スイング入口・CD=Lv別)。発動したら true。 */
const fireFlareGunOnSwing = (
  actor: Player, owner: SubWeaponOwner, gameTime: number,
): boolean => {
  if (
    !actor.subWeapons.includes('flare-gun') ||
    subWeaponBlockedByKatana(actor, 'flare-gun') ||
    gameTime < (actor.subWeaponCooldowns['flare-gun'] ?? 0)
  ) return false;
  const fgLevel = Math.max(1, Math.min(3, actor.subWeaponLevels['flare-gun'] ?? 1));
  // G2.6: 発射位置/向きはオーナー(既定=プレイヤー=従来と同値)。
  const fgCx = ownerCenterX(owner);
  const fgCy = ownerCenterY(owner);
  const fgDir = owner.facing ?? { x: 1, y: 0 };
  const fgMag = Math.max(0.001, Math.hypot(fgDir.x, fgDir.y));
  const fgDist = RANGE_BY_CATEGORY.handgun; // 「ハンドガン距離」=既存のハンドガン射程定数(§6.6 実装指定)
  const fgX = fgCx + (fgDir.x / fgMag) * fgDist;
  const fgY = fgCy + (fgDir.y / fgMag) * fgDist;
  useGameStore.setState(state => ({
    flareGunFlares: [...state.flareGunFlares, {
      id: `flare-${flareGunSeq++}`,
      fromX: fgCx, fromY: fgCy,
      x: fgX, y: fgY,
      firedAt: gameTime,
      landAt: gameTime + FLARE_GUN_FLIGHT_MS,
      until: gameTime + FLARE_GUN_FLIGHT_MS + FLARE_GUN_DURATION_MS,
    }],
  }));
  // v0.25.2541(§2.11追補): CDは**主語の帳簿**へ(プレイヤー=従来どおり/守護霊=自前帳簿)。
  setActorSubWeaponCooldown(ownerGhostId(owner), 'flare-gun', gameTime + FLARE_GUN_CD_MS_BY_LEVEL[fgLevel]);
  return true;
};

/** ジャンクウェポン(近接スイング入口・CDなし/スクラップ消費)。発射したら true。 */
const fireJunkWeaponOnSwing = (
  get: () => GameState, actor: Player, owner: SubWeaponOwner,
): boolean => {
  if (
    !actor.subWeapons.includes('junk-weapon') ||
    subWeaponBlockedByKatana(actor, 'junk-weapon')
  ) return false;
  const ghostOwned = owner.kind === 'ghost-ally';
  const jwLevel = Math.max(1, Math.min(3, actor.subWeaponLevels['junk-weapon'] ?? 1));
  // 除外4(弾薬非消費): 守護霊はスクラップを消費しない=在庫ゲート(0で不発)も通さない。
  // cost は下の「プレイヤーのみ消費」でしか使わないので Infinity 相当でも影響しない。
  const jwShot = computeJunkShot(jwLevel, ghostOwned ? Number.POSITIVE_INFINITY : actor.straps);
  if (!jwShot.fire) return false;
  // M35: CD無しサブの発動計測(手動合流点・挙動不変)。除外4(運用系)= **プレイヤーの発動だけ**積む
  // (v0.25.2541: 他の守護霊サブは setActorSubWeaponCooldown 経由で計測を通らないのに、ここだけ
  //  ゴーストぶんも数えていた取りこぼしを揃えた。recordWireAnchorUse の ghostId 分岐と同じ流儀)。
  if (!ghostOwned) recordSubUse('junk-weapon');
  // G2.6: 発射位置/向きはオーナー(既定=プレイヤー=従来と同値)。
  const jwDir = owner.facing ?? { x: 1, y: 0 };
  const jwMag = Math.max(0.001, Math.hypot(jwDir.x, jwDir.y));
  const pellets = buildJunkWeaponPellets(
    ownerCenterX(owner), ownerCenterY(owner),
    { x: jwDir.x / jwMag, y: jwDir.y / jwMag },
    jwShot.pelletDamage,
    JUNK_WEAPON_PELLETS
  );
  for (const p of pellets) get().addProjectile(ghostOwned ? { ...p, ownerGhost: true } : p);
  if (!ghostOwned) {
    useGameStore.setState(state => ({
      player: { ...state.player, straps: Math.max(0, state.player.straps - jwShot.cost) },
      gameStats: { ...state.gameStats, strapsSpent: state.gameStats.strapsSpent + jwShot.cost }, // 消費計上=ショップ購入と同じ経路
      junkShotFxAt: Date.now(), // 発砲SE(shotgun-fire)のトリガ(useGameLoopが再生)
    }));
  }
  return true;
};

// ---------------------------------------------------------------------------
// 分身(shadow-clone)の枠 — §2.11追補(v0.25.2541・GHOST-SAME-SPEC 発注B)。
// 旧: ストアのグローバル1枠(`shadowClone`)をプレイヤーと守護霊が取り合う設計だった。
// 新: **主語ごとに1枠**(プレイヤー=store.shadowClone / 守護霊=Summon.ghostShadowClone)。
// 型・寿命・攻撃間隔・CD・Lv別値は**同じ**(ゴースト専用の別モデルは作らない)。
// ---------------------------------------------------------------------------

/** 主語の分身枠を読む(ghostId 未指定=プレイヤー)。居なければ null。
 * ★O-3b-2(SAME_ARENA.md §3-d-4): ghostId が守護霊(summons)で見つからなければ**幻影(enemies)**
 * として解決する(setActorSubWeaponCooldownと同じ「守護霊→幻影」の順で宛先を解決する作法)。 */
export const shadowCloneOf = (state: GameState, ghostId?: string): ShadowCloneState | null => {
  if (ghostId === undefined) return state.shadowClone;
  const ghost = state.summons.find(s => s.id === ghostId && s.kind === 'ghost-ally');
  if (ghost) return ghost.ghostShadowClone ?? null;
  return state.enemies.find(e => e.id === ghostId && e.type === 'guardian-phantom')?.gpShadowClone ?? null;
};

/** 主語の分身枠へ書く(setActorDashStateと同型の宛先振り分け)。 */
const setActorShadowClone = (ghostId: string | undefined, clone: ShadowCloneState | null): void => {
  if (ghostId === undefined) {
    useGameStore.setState({ shadowClone: clone });
    return;
  }
  const st = useGameStore.getState();
  if (st.summons.some(x => x.id === ghostId && x.kind === 'ghost-ally')) {
    useGameStore.setState(s => ({
      summons: s.summons.map(x => x.id === ghostId ? { ...x, ghostShadowClone: clone ?? undefined } : x),
    }));
    return;
  }
  // ★O-3b-2: 守護霊で見つからなければ幻影(Enemy)の枠へ。
  useGameStore.setState(s => ({
    enemies: s.enemies.map(x => x.id === ghostId && x.type === 'guardian-phantom' ? { ...x, gpShadowClone: clone ?? undefined } : x),
  }));
};

/**
 * 分身(近接スイング入口)。READY(自分の枠が空 & 自分のCD明け)なら攻撃位置に1体生成する。
 * プレイヤーの `triggerCounter` と守護霊の `fireGhostMeleeSwingSubs` が**この1本**を通る
 * (相乗り型サブ3種と同じ形)。生成したら true。
 * ※ subWeaponBlockedByKatana はプレイヤー経路では常に false(刀モードは triggerCounter が
 *   手前で return する)= 相乗り型サブ3種と同じ扱い。守護霊の一閃から呼ばれた時に効く。
 * ★O-3b-2(SAME_ARENA.md §3-d-4): 幻影の近接スイング(phantomTick.runPhantomTick)からも
 * **この1本**を通す(export済み)。owner.kind==='phantom' でも分岐は増えない
 * (setActorShadowClone / ownerGhostId が宛先を吸収する)。
 */
export const spawnShadowCloneOnSwing = (
  get: () => GameState, actor: Player, owner: SubWeaponOwner, gameTime: number,
): boolean => {
  const ghostId = ownerGhostId(owner);
  if (
    !actor.subWeapons.includes('shadow-clone') ||
    subWeaponBlockedByKatana(actor, 'shadow-clone') ||
    shadowCloneOf(get(), ghostId) !== null ||
    gameTime < (actor.subWeaponCooldowns['shadow-clone'] ?? 0)
  ) return false;
  // 向き: プレイヤーは従来式(立ち絵の向き or 振り向き)。守護霊は実体の向き(ghostFacing)。
  const facingLeft = ghostId !== undefined
    ? (owner.facing?.x ?? 1) < 0
    : (actor.direction === 'left' || (owner.facing != null && owner.facing.x < 0));
  setActorShadowClone(ghostId, {
    x: owner.x, y: owner.y, width: owner.width, height: owner.height,
    // 絵=持ち主の写し(プレイヤー=本人のクラス / 守護霊=計測時ビルドのクラス。青白tintは描画側)。
    facingLeft, characterClass: actor.characterClass,
    spawnedAt: gameTime, attacksDone: 0, nextAttackAt: gameTime, // 生成直後の tick で1発目
  });
  get().spawnRing(ownerCenterX(owner), ownerCenterY(owner), 6, 44, 'rgba(203,213,225,0.6)', 3, 240); // 生成の控えめな白リング
  return true;
};

// ---------------------------------------------------------------------------
// センサー地雷(sensor-mine)の設置 — §2.11追補(v0.25.2541・GHOST-SAME-SPEC 発注C)。
// チャージ帳簿(=同時設置上限と同数・個別10秒回復)を**主語ごと**に持つ
// (プレイヤー=store.sensorMineCharges / 守護霊=Summon.ghostSensorMineCharges)。
// 盤面(store.sensorMines)は世界の設置物として1本のままだが、上限は主語ごとに数える
// (placeSensorMine が ownerGhostId 単位で最古置換する)。
// ---------------------------------------------------------------------------

/** 主語のチャージ帳簿を読む(ghostId 未指定=プレイヤー)。 */
const sensorMineChargesOf = (state: GameState, ghostId?: string): number[] => {
  if (ghostId === undefined) return state.sensorMineCharges;
  return state.summons.find(s => s.id === ghostId && s.kind === 'ghost-ally')?.ghostSensorMineCharges ?? [];
};

/**
 * センサー地雷(近接スイング入口)。準備完了チャージが1つ以上あれば足元に1個置く。
 * プレイヤーの `triggerCounter` と守護霊の `fireGhostMeleeSwingSubs` が**この1本**を通る。
 * 設置したら true。CD補正(オーバークロック→タイムキーパー)は主語自身のスキルで評価する。
 */
const placeSensorMineOnSwing = (
  get: () => GameState, actor: Player, owner: SubWeaponOwner, gameTime: number,
): boolean => {
  if (
    !actor.subWeapons.includes('sensor-mine') ||
    subWeaponBlockedByKatana(actor, 'sensor-mine')
  ) return false;
  const ghostId = ownerGhostId(owner);
  const smLevel = Math.max(1, Math.min(3, actor.subWeaponLevels['sensor-mine'] ?? 1));
  const smCap = SENSOR_MINE_CAP_BY_LEVEL[smLevel];
  if (sensorMineChargesReady(sensorMineChargesOf(get(), ghostId), gameTime, smCap) <= 0) return false;
  // G2.6: 設置位置はオーナーの足元(既定=プレイヤー=従来と同値)。
  const smFootX = ownerCenterX(owner);
  const smFootY = ownerFootY(owner);
  // §6.8 M31と同じ抽選=発動(設置)時。オーバークロック→タイムキーパーの適用は合流点と同じ
  // 共有純関数(G2.6 CD正規化・挙動不変。チャージ再充填CDは常に正なので抽選条件も従来と等価)。
  const smCd = applySubCooldownSkills(
    trapGatedOverclockChance(actor, skillOverclockChance(actor)),      // ★対人トラップ中は短縮無効
    trapGatedCooldownMult(actor, skillCooldownMult(actor)),
    SENSOR_MINE_CHARGE_COOLDOWN_MS,
  );
  const smDuration = smCd.deltaMs;
  const mine: SensorMineState = {
    id: `smine-${sensorMineSeq++}`, x: smFootX, y: smFootY, placedAt: gameTime, triggeredAt: 0,
    ...(ghostId !== undefined ? { ownerGhostId: ghostId } : {}),
  };
  useGameStore.setState(state => {
    const nextMines = placeSensorMine(state.sensorMines, mine, smCap);
    if (ghostId === undefined) {
      return {
        sensorMines: nextMines,
        sensorMineCharges: consumeSensorMineCharge(state.sensorMineCharges, gameTime, smCap, smDuration) ?? state.sensorMineCharges,
      };
    }
    return {
      sensorMines: nextMines,
      summons: state.summons.map(x => x.id === ghostId
        ? { ...x, ghostSensorMineCharges: consumeSensorMineCharge(x.ghostSensorMineCharges ?? [], gameTime, smCap, smDuration) ?? (x.ghostSensorMineCharges ?? []) }
        : x),
    };
  });
  get().spawnRing(smFootX, smFootY, 4, 20, 'rgba(148,163,184,0.6)', 2, 200); // 設置の小リング(軽量)
  // 除外4(運用系): 計測は**プレイヤーの設置だけ**積む(守護霊起因はテレメトリへ混ぜない)。
  if (ghostId === undefined) {
    recordSubUse('sensor-mine'); // M35計測: setSubWeaponCooldown経由をやめたため手動合流点
    if (smCd.overclockProc) {
      recordOverclockProc(); // §6.13: 成立=そのチャージを即再準備(smDuration=0で表現済み)
      // §21(B5)枠光: 視覚のみ。手動合流点なのでここでも点ける(setSubWeaponCooldown経由と同じ扱い)。
      // 覚醒(Lv3・v0.25.3300): proc成立時に銃もクイックリロード(3地点共通の1本)。
      useGameStore.setState(s => ({ player: { ...s.player, overclockLightUntil: s.gameTime + OVERCLOCK_LIGHT_MS, ...overclockAwakenReloadPatch(s.player) } }));
    }
  }
  return true;
};

// スキル: スラッシャー = 近接命中後、チェーン間CD0.5秒で連続して振れる(社長指示2026-08-13・
// SKILL_BUILD_REDESIGN.md §25。旧・タイミングリングのジャストタップ追撃は廃止)。
// 連数はレベル依存: Lv1=2回/Lv2=3回/Lv3=4回(初撃+追撃)。使い切ったら通常の近接CDへ戻る。
// ダメージは追撃ごとに ×2/3 減衰(1.0 / 0.667 / 0.444・旧仕様のまま維持)。
// Lv3の最終段(4段目)のみノックバック大(叩き台2倍)。それ以外の追撃は通常ノックバック。
export const SLASHER_CHAIN_CD_MS = 300; // チェーン攻撃間のクールダウン(社長指示v0.25.3254「0.3秒で」)
// ★v0.25.3616(実機FB「2撃目の配線が残って、1撃目のはずなのに2撃目が発動するときがある」):
// 旧2000ms(叩き台)は「別の敵へ移った後のタップ」まで追撃にしてしまう広さだった。チェーンは
// リズム良く繋いだ時だけ=CD明けから800msへ短縮(タップ間隔にして最大1.1秒)。
export const SLASHER_CHAIN_TIMEOUT_MS = 800;
export const SLASHER_MAX_HITS = 3;      // 追撃の最大連数(初撃を除く。Lvでmin適用)
export const SLASHER_MULTS = [1, 2 / 3, (2 / 3) * (2 / 3)]; // 各追撃のダメージ倍率
export const SLASHER_FINAL_KB_MULT = 2; // Lv3最終段のみ適用するノックバック倍率(叩き台)
export const SLASHER_FORCE_KB_PX = 25;  // 社長指示v0.25.3297: スラッシャーの強制ノックバック実距離(免疫CD無視)
// 返り値 null = 射程内に敵が居なかった(★v0.25.3616): チェーンを破棄し、呼び出し側は**通常経路へ
// 落とす**(このタップは追撃ではなく新しい初撃の候補になる。旧: 空振りでも連数を消費して
// チェーン演出だけ出ていた=「1撃目のはずなのに2撃目が発動」の一因)。
const applySlasherChainStrike = (
  get: () => GameState,
  player: Player,
  gameTime: number,
  realGameTime: number,
): CounterTriggerResult | null => {
  const step = player.slasherStrikeStep;
  // 連数の上限はレベル依存: Lv1 1連(追撃) / Lv2 2連 / Lv3 3連(=初撃と合わせて2/3/4回)。
  const slLv = skillLevel(player, 'slasher');
  const maxHits = slLv ? Math.min(SLASHER_MAX_HITS, slLv) : SLASHER_MAX_HITS;
  // 連数を使い切っていたら追撃なし(ここに来るのはチェーンCD明けのタップのみ=下のゲートで保証済みだが安全側)。
  if (step >= maxHits) {
    get().setSlasherCombo(0, 0);
    return { swung: false, hit: false, finish: false, killed: 0 };
  }
  get().markMeleeSwingFx(); // 追撃も近接スイングの二次モーション(踏み込み)を出す(描画のみ)
  get().commitMeleeSwing(); // ★近接スイング確定の打刻(5経路の1つ=スラッシャー追撃・§1-3)
  // §8裁定済み#16: 前隙が無い経路=打刻の呼び出し時刻がそのまま「押した瞬間」。
  get().noteMeleeSwingPressedAt(Date.now());
  const pcx = player.x + player.width / 2;
  const pcy = player.y + player.height / 2;
  // 追撃の射程は初撃時に記録した slasherReach を使う(ストライカーの溜めで伸びた射程が初撃で消費されても、
  // 追撃は伸びたまま=社長指示)。未記録(0)なら従来どおり現在の射程にフォールバック。
  const meleeRange = player.slasherReach > 0 ? player.slasherReach : huntingMeleeRadius(player);
  const melee = player.weapons.find(w => w.isMelee);
  const meleeDamage = meleeSwingBaseDamage(melee, player);
  const comboMult = skillMeleeComboMult(player, gameTime, get().meleeFinishComboCount, get().meleeFinishComboUntil);
  const dmg = meleeDamage * SLASHER_MULTS[step] * skillOutgoingDamageMult(player) * comboMult;
  const nextStep = step + 1;
  // Lv3(maxHits=3)の最終段(nextStep===maxHits=この一撃で使い切る)のみノックバック大。
  const isFinalBigKbStep = slLv === 3 && nextStep === maxHits;
  // 社長指示v0.25.3297「スラッシャーの時だけ25px強制ノックバック(CD無視)」: 実距離25px固定
  // (最終段はSLASHER_FINAL_KB_MULT倍=50px)。knockbackEnemyは免疫CDを見ない=連撃中も毎段飛ぶ。
  const kbMult = (knockbackSpeedFor(SLASHER_FORCE_KB_PX, KNOCKBACK_DURATION) / BULLET_KNOCKBACK_SPEED) * (isFinalBigKbStep ? SLASHER_FINAL_KB_MULT : 1);
  // ★v0.25.3399 社長指示「移動後に判定しないと絶対当たらない。敵は25動いてるのに」:
  // ★v0.25.3540 社長指示「追撃の範囲は、自分がいま立ってるところからの近接攻撃射程内。
  // じゃないと射程が嘘になるので」: **判定はいま立っている位置(pcx,pcy)から測る。**
  // これは v0.25.3399「移動後に判定しないと絶対当たらない。敵は25動いてるのに」の撤回
  // (事実として: v3399は判定基準を踏み込み後の位置=20px先へ動かしていた。結果、実効射程が
  //  踏み込みぶん伸びて**表示・体感の射程より遠くへ届く**=「射程が嘘」になっていた)。
  // v3399が解こうとしていた「押した敵に届かない」は、下の**自動追尾の踏み込み**が引き受ける
  // ——押した量ぶんだけ詰め直すので、次の一撃は再び「立っている位置の射程内」に敵が居る。
  let killed = 0;
  let hit = false;
  const hitIds: string[] = [];
  // 踏み込みの目標: 実際にノックバックした敵のうち**最寄り**(=いま切り結んでいる相手)。
  // 死んだ敵・押せなかった敵(ボス級)は目標にしない=v0.25.3400「KBしなかったら前進しない」を維持。
  let lungeTo: { dirX: number; dirY: number; dist: number } | null = null;
  // ★v0.25.3934(社長報告2026-08-26「スラッシャー、まだ2段目以降空振りできない時がある? cd?」):
  // 旧実装(v0.25.3616)は**射程内に誰も居なければ追撃そのものを出さず、チェーンを破棄して null**
  // を返していた。**原因はCDではなくこの門**——2段目以降だけ「空振りできない」状態だった。
  // v0.25.3931 で初撃の「命中しないとチェーンが始まらない」を外したので、**追撃側も揃える**:
  // 誰も居なくても**振る**(段を消費してチェーンは進む)。前隙200msが入った今、
  // 連撃の途中で相手が射程外へ出るのは普通に起きるため、そこで手が止まるのは操作として不自然。
  for (const e of get().enemies) {
    if (isReaperFamily(e.type) && !isTerminalReaper(e)) continue;
    if (isCorpse(e)) continue; // KILL吹き飛び(死体・§26-2): 死体は追撃対象から除外
    const ecx = e.x + e.width / 2;
    const ecy = e.y + e.height / 2;
    const dx = ecx - pcx, dy = ecy - pcy;
    // ★距離は初撃と同じ enemyMeleeDist(判定帯の最近点)で測る(v0.25.3398バグ修正)。
    // 旧: 中心距離のまま v0.25.3170 の一本化から取り残され、「初撃は届くのに追撃は身体の
    // 厚みぶん届かない」帯域が生まれていた=2撃目以降が系統的に空振り。
    const eDist = enemyMeleeDist(pcx, pcy, e);
    if (eDist > meleeRange) continue;
    hit = true;
    hitIds.push(e.id);
    // ★v0.25.3640(成果物監査A): スラッシャー追撃は**近接**なので、幻影ゲートへ 'melee' で通す
    // (パリィ抽選の対象になる)。無効化(無敵/パリィ)されたら数字・斬撃・血飛沫・KBを出さない
    // (「数字は出るのにHPが減らない」偽演出の禁止=監査Q1-1と同型)。幻影以外には従来と1bitも変わらない。
    const k = get().damageEnemy(e.id, dmg, false, false, false, 'other', 'player', null, 1, 'melee');
    const eAfter = get().enemies.find(x => x.id === e.id);
    const gpDeflected = isGuardianPhantom(e.type)
      && !!eAfter && (eAfter.gpBlockedAt === gameTime || eAfter.gpParriedAt === gameTime);
    if (gpDeflected) continue; // hit/hitIds は積み済み=チェーンの進行は従来どおり(空振り扱いにしない)
    // PACING_PUZZLE.md §9-4/§9-7#6(削岩型・近接被弾での離脱): スラッシャー追撃も近接武器の打撃。
    if (!k) get().applyDrillerRetreat(e.id);
    get().spawnDamageNumber(ecx, e.y, dmg, false);
    get().spawnSlash(ecx, ecy, 'rgba(190,242,100,0.95)');
    get().spawnMeleeBlood(ecx, ecy, e.width); // 近接の血飛沫(v0.25.2026)
    if (k) {
      killed += 1;
      get().spawnBurst(ecx, ecy, '#bef264', 10);
    } else {
      const d = Math.max(0.001, Math.hypot(dx, dy));
      // ★社長指示v0.25.3496「スラッシャーではボスはノックバックしないで」: 追撃のKBも通常敵限定。
      // (ボスへ効くと、下の「KBした時だけ踏み込む」判定も真になって前進してしまう=v0.25.3400の
      //  「KB無効の相手には前進しない」意図とも噛み合わない。)
      if (!resistsChipKnockback(e.type)) {
        get().knockbackEnemy(e.id, dx / d, dy / d, kbMult, kbMult); // 追撃が当たった敵のみノックバック(Lv3最終段のみ大)。maxStrengthも渡す(既定cap=3で頭打ちになる罠・v0.25.3257)
        if (lungeTo === null || eDist < lungeTo.dist) lungeTo = { dirX: dx / d, dirY: dy / d, dist: eDist };
      }
    }
  }
  // 一閃の絵は**判定と同じ円**(いま立っている位置・半径=meleeRange)に揃える。
  get().spawnRing(pcx, pcy, 6, meleeRange, 'rgba(190,242,100,0.5)', 3, 200);
  // ★v0.25.3540 社長発案「スラッシャーは射程内であれば、その敵から規定の距離(近接入る距離)まで
  // 自動追尾 であれば事故が減りそう」: 踏み込みを**定数(旧20px)から自動追尾へ**作り替える。
  //
  // なぜ: 旧実装は踏み込み20px固定なのに強制KBは25px(Lv3最終段50px)で、**数字が2本あった**。
  // 押し量を変えるたびにズレが再発する構造で、実際に毎撃5pxずつ相手が逃げていた(v0.25.3538の洗い出し)。
  // ⇒ 踏み込み距離を `いま押した後の距離 − 近接が入る距離` で毎回**算出**する。押し量がいくつでも
  //   (将来ノックバック減衰が入って変わっても)**常に近接が入る位置に着地する**=この事故の型が消える。
  // 「いま押した後の距離」は、この一撃で自分が与えた押し量が分かっているので予測できる
  //  (ノックバックは速度で280msかけて効くため、この瞬間の敵はまだ動いていない=実測では取れない)。
  // 慣性は従来どおり: 速度を与えて SLASHER_LUNGE_MS かけて減衰スライドする(瞬間移動しない)。
  // チェーンCD(300ms)>踏み込み(160ms)なので、次の一撃までに踏み込みは必ず終わる。
  {
    const nowMs = Date.now();
    if (lungeTo !== null) {
      // 押した量(実距離px)。Lv3最終段のみ SLASHER_FINAL_KB_MULT 倍。
      const pushedPx = SLASHER_FORCE_KB_PX * (isFinalBigKbStep ? SLASHER_FINAL_KB_MULT : 1);
      const lungePx = slasherLungePx(lungeTo.dist, pushedPx, meleeRange);
      const lx = lungeTo.dirX, ly = lungeTo.dirY;
      if (lungePx > 0.5) {
        const lungeSpeed = knockbackSpeedFor(lungePx, SLASHER_LUNGE_MS);
        useGameStore.setState(state => ({
          player: {
            ...state.player,
            knockbackVx: lx * lungeSpeed, knockbackVy: ly * lungeSpeed,
            knockbackUntil: nowMs + SLASHER_LUNGE_MS, knockbackMs: SLASHER_LUNGE_MS,
          },
        }));
      }
    }
  }
  // スキル: ナイフマスターのコンボ加算(§6.10 M33⑧: スラッシャー追撃のヒットでも貯める。倍率は既に乗っている)。
  // 2026-08-29一本化: 表示コンボ(meleeFinishCombo)へ直接加算(専用台帳knifeCombo*は廃止)。
  if (knifeMasterHitComboGain(player, hit, 0) > 0) {
    useGameStore.setState(state => {
      const next = state.meleeFinishComboUntil >= gameTime ? state.meleeFinishComboCount + 1 : 1;
      return {
        meleeFinishComboCount: next,
        meleeFinishComboUntil: gameTime + meleeFinishComboWindowMs(state.player),
        gameStats: { ...state.gameStats, maxCombo: Math.max(state.gameStats.maxCombo, next) },
      };
    });
  }
  if (nextStep < maxHits) {
    get().setSlasherCombo(realGameTime + SLASHER_CHAIN_CD_MS, nextStep); // 次のチェーンCDを開始
  } else {
    // 連数使い切り → この瞬間から通常の近接CD(COUNTER_WINDOW+COUNTER_COOLDOWN)へ復帰。
    useGameStore.setState(state => ({
      // タイムキーパー覚醒(Lv3・v0.25.3300): 近接CD-10%。
      player: { ...state.player, counterCooldownEnd: Date.now() + (COUNTER_WINDOW + COUNTER_COOLDOWN) * meleeCooldownMult(state.player) },
    }));
    get().setSlasherCombo(0, 0);
  }
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

// パンプキン着地爆発などの円形AoEイベント。M51で薙ぎ払い(ジャイアント新スクリプト)用に、円ではなく
// 直線+半幅のカプセル判定を積めるよう capsule を追加(既存呼び出し側は capsule 未指定=円のまま不変)。
// G4a追加: moveKey=この爆発がどの技のものか(BOT_AND_GHOST.md §2.9 技への反応表の計測タグ。**記録専用**=
// 判定・ダメージには一切使わず、combatTick.applyPumpkinBlastDamageがdamagePlayerのdamageSourceMoveへ
// 渡すだけ。未設定=従来どおりタグ無し)。
export interface PumpkinBlast {
  x: number; y: number; radius: number; damage: number; enemyId: string; ice?: boolean;
  capsule?: { fx: number; fy: number; tx: number; ty: number; halfWidth: number };
  moveKey?: string;
  /**
   * **この技だけの押し出し**(v0.25.2653・BOSS_MAKER.md §9-2)。未指定=全ゲーム共通の
   * `PLAYER_KNOCKBACK_SPEED/MS`(従来どおり)。「押しやる殴り」のように**技ごとに押す量を
   * 変えたい**時だけ積む側が指定する。距離は `knockbackSpeedFor` で距離から逆算する。
   */
  kbSpeed?: number;
  kbMs?: number;
  /**
   * ★v0.25.3591(社長指示「これ(骨刃)はカウンターしても体勢値は削るけど、ダメージは入らないように
   * して」/「同じく氷刃も」): この爆風をパリィした時の**反撃HPダメージを0**にする(体勢値・演出・
   * 中断・CDリファンドは通常どおり)。飛び道具として飛んでくる刃を弾いた時だけ立てる旗で、
   * ボス本体の技(薙ぎ・着地・踏み鳴らし等)のパリィは従来どおりダメージが入る。
   */
  parryNoDamage?: boolean;
}

/**
 * 「**この距離だけ押したい**」を初速へ直す(v0.25.2653)。
 * 吹き飛びの速度は持続時間で**1→0へ直線的に減衰**するので、進む距離は `初速 × 秒 ÷ 2`。
 * よって初速 = `距離 × 2 ÷ 秒`。**メーカーには距離(px)で出す**——「中距離まで押しやる」のような
 * 言い方は距離の話であって、速度×時間で考えるものではないため。
 */
export const knockbackSpeedFor = (distancePx: number, ms: number): number =>
  (Math.max(0, distancePx) * 2) / Math.max(0.001, ms / 1000);

// 社長指示v0.25.3300 オーバークロック覚醒(Lv3): リセット(proc)成立時に構えている銃も即クイックリロード
// (リザーブから瞬時に満タン装填。リロード中だったら完了扱いで解除)。リザーブが空なら何も起きない。
// 3つのproc地点(setSubWeaponCooldown合流点/センサー地雷/援護射撃タイマー)が全てこの1本を通す。
export const overclockAwakenReloadPatch = (p: Player): Partial<Player> => {
  if (skillLevel(p, 'overclock') < 3) return {};
  const gun = getActiveGun(p);
  if (!gun?.ammoType) return {};
  const field = AMMO_FIELD[gun.ammoType];
  const filled = refillWeaponMagazine(gun, p, p[field]);
  if (filled.moved <= 0) return {};
  return {
    weapons: p.weapons.map(w => (w.id === gun.id ? filled.weapon : w)),
    [field]: filled.reserve,
    ...(p.reloadingWeaponId === gun.id ? { reloadingWeaponId: '', reloadEndsAt: 0 } : {}),
  } as Partial<Player>;
};

// KILL吹き飛び(死体・SKILL_BUILD_REDESIGN.md §26-1): 死体が攻撃者→敵方向へ飛ぶ実距離(px)。
export const KILL_LAUNCH_DIST_PX = 50;
/**
 * ★死体の「潰れて消える」時間(社長指示2026-08-25「雑魚敵を倒した時、突然パっと消えちゃうので、
 * すこし吹っ飛んで潰れて消えるようにして」)。
 *
 * 直す前は **吹っ飛び(KNOCKBACK_DURATION=280ms)が終わった瞬間に配列から消える**だけで、
 * 描画側は死体かどうかを見ていなかった=**パッと消える**。吹っ飛びの後ろにこの尺を足し、
 * その間に**縦に潰れて横に広がりながら透明になる**(=地面に落ちて崩れる)。
 */
export const KILL_CORPSE_SQUASH_MS = 220;
/**
 * 死体の潰れ具合(描画のみ・判定には一切関与しない)。`corpseUntil` の手前
 * `KILL_CORPSE_SQUASH_MS` の区間だけ効く。慣性の掟: **出だしが速く、終わりでゆるむ**
 * (落ちて叩きつけられる動き=ease-out)。
 */
export const corpseSquashNow = (
  e: { corpseUntil?: number }, now: number,
): { sqX: number; sqY: number; alpha: number } => {
  // ★青く染めるのは**やめた**(社長裁定2026-08-26「敵倒した時の青くなるの、やはりやめる」)。
  // 残すのは**潰れ+フェード**だけ(v0.25.3930の形)。色には一切触らない。
  const until = e.corpseUntil ?? 0;
  const left = until - now;
  if (until <= 0 || left >= KILL_CORPSE_SQUASH_MS) return { sqX: 1, sqY: 1, alpha: 1 };
  const t = Math.max(0, Math.min(1, 1 - left / KILL_CORPSE_SQUASH_MS));
  const k = 1 - (1 - t) * (1 - t); // ease-out
  return { sqX: 1 + 0.45 * k, sqY: 1 - 0.85 * k, alpha: 1 - k };
};

/**
 * KILLされた通常敵を「死体」(corpseUntil付きEnemy)に変換する(§26-1)。攻撃者→敵の方向へ
 * KILL_LAUNCH_DIST_PXだけ実距離で吹き飛ぶノックバックを持たせ、KNOCKBACK_DURATION後に消える
 * 期限(corpseUntil)を立てる。aiPhase/stunUntilは解除する(死体はAI/攻撃状態機械から完全に除外
 * =updateEnemiesのKBスライド以外の全処理を通らない)。
 *
 * 呼び出し側が対象(ボス/ネームド/クエスト対象=getsDramaticDeath系)を`corpseEligible`で選別してから
 * 渡すこと——このヘルパー自身は判定しない(damageEnemyの銃/接触/爆発キルと、grantMeleeKillRewards
 * 経由の全近接キル経路(triggerCounter/katana/whip/shadowClone/skaterBoardHit)の2箇所が呼ぶ)。
 *
 * attacker位置: damageEnemyの汎用キル経路(銃/接触/爆発/DoT/リーパースキル等)は攻撃者を特定できる
 * 引数を持たないため、近似としてプレイヤー座標を渡す(★未決事項参照。守護霊/召喚起因のキルも同様)。
 * 近接キル経路(grantMeleeKillRewards)は実際の攻撃者(プレイヤー or 守護霊の疑似Player)を渡せる。
 */
export const buildCorpseFromKill = (
  enemy: Enemy,
  attacker: { x: number; y: number; width: number; height: number },
): Enemy => {
  const now = Date.now();
  const acx = attacker.x + attacker.width / 2;
  const acy = attacker.y + attacker.height / 2;
  const ecx = enemy.x + enemy.width / 2;
  const ecy = enemy.y + enemy.height / 2;
  const rawDx = ecx - acx;
  const rawDy = ecy - acy;
  const rawLen = Math.hypot(rawDx, rawDy);
  const dirX = rawLen > 0.001 ? rawDx / rawLen : 0;
  const dirY = rawLen > 0.001 ? rawDy / rawLen : -1;
  const speed = knockbackSpeedFor(KILL_LAUNCH_DIST_PX, KNOCKBACK_DURATION);
  return {
    ...enemy,
    health: 0,
    // ★吹っ飛び(KNOCKBACK_DURATION)の**後ろに潰れの尺を足す**(社長指示2026-08-25)。
    // 飛距離の積分は `knockbackUntil` を見ているので、ここを伸ばしても**飛び方は1bitも変わらない**。
    corpseUntil: now + KNOCKBACK_DURATION + KILL_CORPSE_SQUASH_MS,
    corpseStartX: enemy.x, // v0.25.3272: 実時間の解析積分用の発射起点(スロー中でも飛距離50pxを保証)
    corpseStartY: enemy.y,
    aiPhase: undefined,
    aiPhaseUntil: undefined,
    stunUntil: undefined,
    // ★v0.25.3925: 噛みつきの状態も落とす。残すと**死体が赤く点滅して噛む構えのポーズ**を取る
    // (描画は corpse を見ていない)=「予告は絶対に嘘をつかない」の破れ。判定側も corpse は
    // ループの手前で弾かれるので、消さないと永久に立ったままになる。
    biteAt: 0,
    biteDirX: undefined,
    biteDirY: undefined,
    knockbackVx: dirX * speed,
    knockbackVy: dirY * speed,
    knockbackUntil: now + KNOCKBACK_DURATION,
  };
};

interface TutorialPopupPayload {
  title: string;
  lines: string[];
  art?: 'move';
  img?: string;
  slides?: TutorialSlide[];
}

interface GameState {
  player: Player;
  enemies: Enemy[];
  // パンプキン着地爆発の発生イベント(その frame の着地点)。useGameLoop が消化(被弾判定+FX)して空に戻す。
  pumpkinBlasts: PumpkinBlast[];
  // 裏ボス スカジの氷ハザード。markers=足元の氷塊テレグラフ(赤サークル2秒→起爆)、blades=設置後に発射される氷刃。
  skadiIceMarkers: { id: string; x: number; y: number; bornAt: number; fireAt: number; enemyId: string }[];
  skadiIceBlades: { id: string; x: number; y: number; angle: number; launchAt: number; launched: boolean; vx: number; vy: number; expireAt: number; enemyId: string; visual?: 'ice' | 'bone' | 'feather' }[];
  // 火炎瓶(molotov)が設置した地面の火だまり。lifetime/DoTは tickGroundFires が処理、描画は pixiScene が直読み。
  groundFires: GroundFire[];
  // SKILL_BUILD_REDESIGN.md §28(B7): 血の履帯(blood-treads)の棘。lifetime/DoTは tickBloodSpikes が
  // 処理、描画は pixiScene が直読み(groundFiresと同じ流儀)。
  bloodSpikes: BloodSpike[];
  // SKILL_BUILD_REDESIGN.md §28(B7): グラビティショット(gravity-shot)のキル時爆縮。lifetime/吸引は
  // tickGravityWells が処理(判定なし=見た目のみ・分類②)。
  gravityWells: GravityWell[];
  // ジブリルのランタン攻撃の紫の単発火(プレイヤー被弾)。判定/寿命は useGameLoop、描画は pixiScene が直読み。
  bossFires: BossFire[];
  // §6.28-19(バッチM63): アクラシエルの結晶の槍(設置→2秒後に円形AoEへ一度だけ起爆)。
  // 判定/寿命は angelBossTick.ts(tickAcrasielSpears)、描画は pixiScene が直読み。
  acrasielSpears: AcrasielSpear[];
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
  // フレアガンのCD明け演出(頭上の小さな炎マーク・一瞬)の発火時刻(Date.now)。
  // サブウェポンのチャージ通知は全共通で「明けた瞬間だけ一瞬出る」ブーメラン型(社長指示v0.25.2155)。
  flareReadyFxAt: number;
  benkeiReadyFxAt: number; // 弁慶CD明けの頭上アイコン(v0.25.3623・旧「閃き」テキストの置換)
  // マークスマン(mage)の射程上昇が発動した瞬間の頭上マーク演出。fxAt=発火時刻(Date.now)、
  // fxShownFor=その演出を出した連続移動streak(=marksmanMovingSince)。streakごとに一度だけ出す。
  marksmanRangeFxAt: number;
  marksmanRangeFxShownFor: number;
  rescueShooterFxAt: number;  // 救助NPC(shooter)が発砲した時刻(Date.now)。サークル接近時のハンドガンSE用。
  // イベント発生告知バナー(コンボ表示の近く)。gameTime(ms)基準。HUDが gameTime<eventBannerUntil の間表示。
  eventBannerText: string;
  eventBannerUntil: number;
  // v0.25.3728(社長GO「バロメーターライン入れて」): 戦況ラインのHUDミラー。書くのはdirectorTickの
  // **変化時のみ**(コマ切替=約40秒に1回・ランク変化時)=毎フレーム再レンダーしない(CLAUDE.md規律)。
  hudDirector: { koma: 'relax' | 'harvest' | 'normal' | 'peak'; rank: number };
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
  // ── 二人組クエストv2(EVENT_QUEST_DESIGN.md §2-14「このランの状態フィールド」)。
  // 全部 store(useRefにしない=HUD/描画が読む・ラン跨ぎで消える必要がある)。resetGameで全部リセット。
  // 状態遷移そのものの書き手は useGameLoop の二人組ブロック1箇所(§2-2B)=B2以降で配線する。
  rescueClearedAt: number;      // レスキュー完了の打刻(0=未)
  rescueArenaStartedAt: number; // 囲いの発火打刻・後始末用(0=未)
  deliveryLocked: boolean;      // 納品ロック(既定false)
  castleAttnDoneAt: number;     // アテンション成立の打刻(0=未)
  rescueSpawnedAt: number;      // レスキュー地点の出現抽選を1度だけにする打刻(0=未抽選)
  basesEverCaptured: number;    // S5だけの先行条件のラッチ(単調・下げない。0=未)
  // ── サブクエスト(research/SUBQUESTS.md)。受注せず出撃時に2枠まで自動補充される小目標。
  // 二人組クエスト(上のeventQuest*)とは完全に別系統。HUDは右上のRescueQuestGoalPillと同じ縦積み。
  // subquests は**進捗が動いた時にだけ**書き換わる(毎フレームではない=React再描画規律を満たす)。
  subquests: SubquestRunEntry[];
  /** そのランでサブクエスト達成により付与済みのゴールド合計(倍率適用後・リザルト表示用)。 */
  subquestGoldEarned: number;
  /** 達成の通し番号。useGameLoop が変化を見て 'event-clear' を1回鳴らす(storeはplaySfx不可)。 */
  subquestClearSeq: number;
  /** ベンチマークラン(BENCH)か。補充・進捗・表示・ゴールド付与を全て止める。startGameが設定。 */
  benchmarkRun: boolean;
  /**
   * ハンターの追跡(useGameLoopの状態機械 phase==='chase')開始時刻の鏡映。**gameTime(ms)**。
   * 非chase/ハンター消滅/プレイヤー死亡で null。hunter-survive の「連続N秒」判定の唯一の出どころ。
   * ※時計の契約: gameTime とだけ比較する(Date.now系と混ぜない・ENGINEERING_NOTES「時計の混在」)。
   */
  hunterChaseSince: number | null;
  setBenchmarkRun: (benchmark: boolean) => void;
  /** 出撃時(resetGameの後)に呼ぶ。選択ステージの枠を2つまで補充して subquests へ載せる。 */
  refillSubquests: () => void;
  setHunterChaseSince: (t: number | null) => void;
  /** ハンター追跡中に毎フレーム呼ぶ(gameTime)。連続秒が1秒動いた時だけ書き込む。 */
  applySubquestHunterSurvive: (gameTime: number) => void;
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
  vaccinePurchased: boolean;
  // Flipped true only when the player completes the return circle (帰還完了) — the run is won.
  gameWon: boolean;
  // フィナーレボス(giantbat)を倒した=終了条件を満たした(まだ勝利ではない)。useGameLoop が帰還サークルを出す。
  finaleDefeated: boolean;
  // 通常ストーリーの帰還確認。帰還地点で操作を離した時だけ開く。
  storyReturnPromptVisible: boolean;
  // 制圧イベント: 4拠点(東西南北)。suppressionActive 時のみ有効(ステージ1メインミッション等)。
  baseSites: BaseSite[];
  escorts: EscortSoldier[];      // 護衛軍人NPC(4人・東西南北担当)。HPなし・前進&射撃&10秒占拠で解放。
  // エンディング(仮組み・ENDING_SCENE.md 演出仕様v2 §3): 専用配列。escortsに相乗りしない
  // (セリフ4関数はtutorialしか見ておらず、混ぜると名前付きNPCが喋る事故になるため)。
  endingSoldiers: EndingSoldier[];
  endingPhill: EndingPhillState | null; // フィル(=プレイヤー実体)の状態機械。null=エンディング外。
  endingBombs: EndingBomb[];         // 爆撃の弾(演出仕様v3.1。判定なし・観賞)
  endingBombNextAt: number;          // 次の投下を試みるgameTime(0=未初期化→updateEndingSceneが初回に設定)
  endingBombingEnabled: boolean;     // false=新規投下停止(v4055: フィナーレ発注時に下ろす。滞空弾は落ち切る)
  endingFinaleHitAt: number;         // フィナーレ直撃弾の着弾gameTime(0=未着弾)。EndingScreenがフラッシュ暗転に使う
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
  // revealedAt: 洋館通路ゴールの「近づくとフェードイン」打刻(gameTime)。undefined=まだ透明(通路のみ使用)。
  returnCircle: { x: number; y: number; radius: number; dwellMs: number; revealedAt?: number } | null;
  // ★v0.25.3743(社長指示): EX(フィル戦)勝利は帰還サークル無し=撃破イベント終了後に画面を
  // フェードアウトしてからエンディングへ。trueの間GameHUDが全画面黒フェードを掛ける(表示専用)。
  exOutroFading: boolean;
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
  tutorialPopup: TutorialPopupPayload | null;
  tutorialPopupShown: boolean; // このランで表示済みか(resetGameでリセット)
  // 訓練(M0)の**封印**(社長指示v0.25.2293「チュートリアルで解禁されるまで近接等は封印。
  // クリティカル等も出ない」)。教わっていない要素が先に暴発すると、説明と体験の順序が崩れる。
  // M0以外のステージでは常に全解禁(resetGame が farBackdrop を見て決める)。
  // ammo=**ランダムな弾薬ドロップ**の解禁(社長指示v0.25.2319)。弾を拾う教習(M0ビート'ammo')より前に
  // 偶然で弾が増えると「弾が尽きたから近接へ」という台本の筋が壊れるため、それまでは抽選ドロップを止める。
  // 台本が明示的に配置する弾(教習用の補充)はこのフラグを見ない=意図した供給だけが通る。
  m0Unlocked: { melee: boolean; crit: boolean; ammo: boolean };
  // 訓練(M0)で近接が当たった回数(このランのみ)。**3発目で強制クリティカル**→そのまま
  // 近接フィニッシュの教習へ繋げるための台本カウンタ(社長台本v0.25.2293)。
  m0MeleeHits: number;
  /**
   * クリティカル演習中か(社長指示v0.25.2314)。true の間は**近接3発ごとに必ずクリティカル**が出る。
   * クリ/キルの教習を**それぞれ3体ぶん練習させる**ために必要(1回だけの強制クリだと練習にならない)。
   */
  m0CritDrill: boolean;
  // 訓練(M0)で「ここより先へ進ませない」x(px)。null=制限なし。
  // 開幕の会話中に区域境界(1500)へ着いてしまうと、会話とエリア移動の演出が重なる
  // (社長指示v0.25.2294「まず会話中にエリア移動に到達しない様に、手前で制限」)。
  m0AdvanceLimitX: number | null;
  // ゲーム画面のキャプチャ提供者(PixiStageが登録)。ゲーム内では未使用(v0.25.1839でポップアップの
  // ライブ撮影を廃止)。手本GIF収録・デバッグ用ツールとして温存(ヘッドレス収録が st.captureFrame() を叩く)。
  captureFrame: (() => string | null) | null;
  setCaptureFrame: (fn: (() => string | null) | null) => void;
  showTutorialPopup: (p: TutorialPopupPayload) => void;
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
  // PACING_PUZZLE.md §6.24-UX 確定要件2: 寄り道POIの入手(警察署スキル/武器庫装備/病院ワクチン)も
  // **同じトースト枠**で出す(kind: 'poi-skill' | 'poi-equip' | 'poi-vaccine')。
  // desc=効果説明1行(スキルはSKILLSのdesc・装備はequipmentDescriptionを流用=文章を二重管理しない)。
  // note=但し書き(警察署スキルの「この出撃のみ」)。
  lastWeaponGet: {
    name: string; at: number; color?: string;
    kind?: 'weapon' | 'treasure' | 'data' | 'poi-skill' | 'poi-equip' | 'poi-vaccine';
    weaponKey?: string; treasureVariant?: number; desc?: string; note?: string;
  } | null;
  // Global hitstop: while Date.now() < hitstopUntil the simulation is frozen
  // (melee-finisher impact pause). 0 = running.
  hitstopUntil: number;
  // ★KILL処刑演出v2(社長指示v0.25.3603): フル演出(寄りズーム発火)のフィニッシュキルで1回
  // 書かれるイベント。描画はpixiScene(実時間駆動=hitstop中も動く・判定/座標は一切不変)。
  // 跳びつきを見せるのは primary(ex/ey…)の一体のみ。victims=同時に処刑された敵(primary含む)で、
  // 掻っ切りの瞬間に全員の位置から血が一斉に噴き上がる(社長指示「ほかに巻き込んだ敵は血だけ揃える」)。
  killFx: {
    ex: number; ey: number; ew: number; eh: number; // 跳びつく相手(処刑した敵)の中心と寸法
    px: number; py: number;                          // プレイヤー中心(発動時=戻り先の記録)
    startAt: number;                                 // 実時刻(Date.now)
    victims: { x: number; y: number }[];
  } | null;
  // ★PACING_PUZZLE.md §14-4-8/8b(神付き): 死神本体(isTerminalReaper)/使者(isHangedman)の接触予約。
  // 「①接触→②時間停止→③覆いかぶさり→④ダメージ確定→⑤時間再開」の②③をここに置く
  // (A-4=setTimeout禁止。applyContactDamage[combatTick.ts]が唯一の合流点として期限到来を見て解決する)。
  // 描画はpixiScene側が実時間(Date.now)チャンネルで読む(killFxと同じ型・hitstop凍結中も動く)。
  kamitsukiFx: {
    enemyId: string;
    ex: number; ey: number; ew: number; eh: number; // 触れた個体(発火時点)の中心と寸法
    px: number; py: number;                          // プレイヤー中心(発火時点)
    startAt: number;                                 // 実時刻(Date.now)=覆いかぶさり開始
    durationMs: number;                              // 覆い時間(?rp2kamims=)
    damage: number;                                  // 適用予定ダメージ(倍率込みの確定値)
    isHangedman: boolean;                            // KILL!演出分岐(§14-4-3の順序規定)
    deathLabel: string;                               // enemyDeathLabel(enemy.type)(発火時点で確定)
    moveKey?: string;                                 // contactDamageMoveKey(enemy)(G4a・記録専用)
    // ★確認検収(A-2r): counterCooldownEndは値そのものが「窓が開いた瞬間の起点」を持たない締切のみの
    // フィールドなので、シフトすべきか(=停止前から生きていた締切か/停止中に新規に立った締切か)を
    // 起点比較では判定できない。発火時点(=停止直前)のスナップショットをここへ持たせ、解決時に
    // 「値が変わっていなければ停止前からの締切」として比較する(combatTick.tsのresolveKamitsukiFx参照)。
    counterCooldownEndAtStart: number;
  } | null;
  // アテンション・シネマティック(レスキュー/ジャイアント出現): 現地へカメラパン→ホールド→戻る。
  // 駆動は実時間(startReal)。fromCam=開始時のカメラ(=戻り先)。null=非実行。
  attention: {
    x: number; y: number; startReal: number; fromCamX: number; fromCamY: number;
    /** §6.36 ボス出現カットイン。cutin有り=hold後にcutinMsだけカメラ静止のまま名前+絵をDOMで出す。 */
    cutin?: AttentionCutin; cutinMs?: number;
    /** このアテンションのホールド尺。未指定=ATTENTION_HOLD_MS。cutin付き(ボス紹介)は半分
     * (社長指示v0.25.2998「紹介の前の止まり、半分にして」)。 */
    holdMs?: number;
  } | null;
  // 練習ラン: 対象ボス撃破の実時刻(Date.now)。死亡アテンションを見せ終えてから useGameLoop が
  // gameWon を立てる(v0.25.2953)。null=保留なし。
  practiceWinPendingSince: number | null;
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
  // ★いまの画角(ボス交戦の引きズーム。1=等倍、小さいほど引き)。**描画からは書かない**——
  // useGameLoop が描画側と同じ純関数・同じ時定数で推定している値(camBossZoomRef)をここへ写すだけ。
  // 用途は「画面上の距離で決まっている値」をワールド距離へ戻すこと(v0.25.3170: 銃の射程ゲート)。
  // 判定に使うので**シミュレーション側が持つのが正**(PixiJSのworldGroup.scaleを読みに行かない)。
  viewZoom: number;
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
  fireHoming: (ghostId?: string) => void; // ghostId=守護霊の主語(未指定=プレイヤー=従来と1bit同じ)

  // 分身(サブウェポン)。生成中=ACTIVE、null=READY/COOLDOWN。レンダラが直読みして白黒で描く。
  // ※これは**プレイヤーの枠**。守護霊の枠は Summon.ghostShadowClone(§2.11追補=主語ごとに1枠)。
  // 下の3アクションは ghostId 未指定=プレイヤー(従来と完全同一)/指定=その守護霊の枠。
  shadowClone: ShadowCloneState | null;
  shadowCloneStrike: (clone: ShadowCloneState, ghostId?: string) => void; // 分身がその場で近接攻撃(プレイヤーの近接処理＋スキル効果を共用)
  tickShadowClone: (ghostId?: string) => void;           // 毎フレーム: 1秒ごとの自動攻撃と寿命(5秒)消滅を進める
  expireShadowClone: (ghostId?: string) => void;         // 分身を消滅させCD(3s)開始(寿命切れ/画面外)
  // ★O-3b-2(SAME_ARENA.md §3-d-4): 幻影の分身は enemies を攻撃する shadowCloneStrike を流用しない
  // (幻影自身が enemies の一員=自爆する。設置系で踏んだ事故と同型)。**標的=プレイヤー固定**の
  // 別経路(他の幻影サブ=ドッグ/タレット/地雷と同じ「フラットダメージ・クリ無し・iframeは通常どおり」)。
  phantomShadowCloneStrike: (clone: ShadowCloneState, phantomId: string) => void;

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
  spawnGroundFire: (x: number, y: number, ghostId?: string, radius?: number) => void; // 足元に火を1つ設置(molotovの投下。useGameLoopから呼ぶ。ghostId=置いた守護霊の主語・未指定=プレイヤー。radius=B7延焼弾Lv3の炎床(大)専用の半径上書き・未指定=molotov既定)
  tickGroundFires: () => void;                                 // 毎フレーム: 火の寿命切れ回収 + 敵への接触ダメージ(0.5秒スロットル)
  // SKILL_BUILD_REDESIGN.md §28(B7): 延焼弾(incendiary-round)の燃焼DoT。命中した敵個体が持つ
  // burnUntil/burnDpsTickを毎フレーム消化する(groundFiresとは別チャンネル=床ではなく敵に付く状態異常)。
  tickBurningEnemies: () => void;
  // SKILL_BUILD_REDESIGN.md §28(B7): 血の履帯(blood-treads)の棘。groundFireと同じ流儀。
  spawnBloodSpike: (x: number, y: number) => void;
  tickBloodSpikes: () => void;
  // SKILL_BUILD_REDESIGN.md §28(B7): グラビティショット(gravity-shot)のキル時爆縮(0.4s・引き寄せのみ・判定なし)。
  spawnGravityWell: (x: number, y: number, radius: number, durationMs?: number) => void; // durationMs=覚醒(Lv3)の2倍渦
  tickGravityWells: () => void;
  spawnBossFire: (x: number, y: number, spawnAt: number, activateAt: number, expireAt: number) => void; // ジブリルの紫の単発火を1つ設置(useGameLoopから呼ぶ)
  setBossFires: (fires: BossFire[]) => void;                   // ジブリル火の配列を差し替え(useGameLoopのtickが枝刈り/被弾処理後に反映)
  spawnAcrasielSpear: (x: number, y: number, angle: number, bornAt: number, fireAt: number, damage: number, enemyId: string) => void; // §6.28-19: 結晶の槍を1本設置(angelBossTick.tsから呼ぶ)
  setAcrasielSpears: (spears: AcrasielSpear[]) => void;         // §6.28-19: 槍配列を差し替え(tickAcrasielSpearsが起爆消化後に反映)

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
  // スケボー(新仕様): ダブルタップで乗車 / 指離しで降車(+1秒以上乗車なら進行方向へ投擲)。
  mountSkater: () => void;
  dismountSkater: () => void;
  // 投擲したスケボーが敵に当たった時の前方バッシュ(useGameLoop が衝突検出して呼ぶ)。
  skaterBoardHit: (x: number, y: number, dirX: number, dirY: number) => void;
  setSwipeDirection: (direction: { x: number; y: number } | null, strength?: number) => void;
  setMouseAim: (screen: { x: number; y: number } | null) => void;
  setTouchActive: (active: boolean) => void;
  setLastDirection: (direction: { x: number; y: number } | null) => void;
  damagePlayer: (amount: number, source?: string, fromX?: number, fromY?: number, damagerType?: EnemyType, damagerWasNamed?: boolean, damageSourceMove?: string) => boolean; // fromX/Y=被弾源(指定時、そこから離れる方向へプレイヤーをノックバック)。damagerType/damagerWasNamed=宿敵昇格判定用(§5.14 M13)。damageSourceMove=どのボス技の被弾か(G4a計測タグ・記録専用。既定undefined=従来どおり。hateSourceと同じ流儀)
  lastDamageSource: string; // 直近に被弾した原因ラベル(死因表示用)。被弾のたびに更新。
  gainExperience: (amount: number) => void;
  levelUp: () => void;
  /** @param swingStartAt 窓/CDの基準時刻(前隙の起点=指を離した時刻)。省略時は今。 */
  triggerCounter: (swingStartAt?: number) => CounterTriggerResult;
  /** ★前隙の起点。窓/CD/絵だけを打ち、判定は `MELEE_WINDUP_MS` 後に useGameLoop が解決する。 */
  beginMeleeSwing: () => boolean;
  // Katana actions. performKatanaStrike cuts the given enemies with katana
  // melee rules (crit, knockback, shared kill rewards). 近接フィニッシュは
  // 一閃のみ: allowFinisher は dash 経由でだけ true になる。
  // triggerKatanaDash starts the invulnerable dash and cuts along its path.
  // v0.25.2518(裁定2): 末尾の ghostId は**主語(オーナー)**。未指定=プレイヤー(従来と完全同一)。
  // 指定すると守護霊(kind='ghost-ally')が同じ状態機械・同じ定数・同じ式で刀/ワイヤーを使う。
  performKatanaStrike: (targetIds: string[], damageMult: number, allowFinisher: boolean, ghostId?: string) => { hit: boolean; finish: boolean; killed: number };
  triggerKatanaDash: (dirX: number, dirY: number, ghostId?: string) => boolean;
  // ワイヤーアンカー: フリックでフリック方向に刺す(true=発動)。1秒後に startWireDash で高速移動。
  triggerWireAnchor: (dirX: number, dirY: number, ghostId?: string) => boolean;
  startWireDash: (ghostId?: string) => void;
  // スラム後ジャンプ離脱(ホップ)開始。着地点(targetX/Y)は呼び出し側(useGameLoop)が
  // computeWireHopLanding(src/utils/wireHop.ts)で計算して渡す。
  startWireHop: (targetX: number, targetY: number, ghostId?: string) => void;
  // v0.25.2525(GHOST-REFLECT-MELEE-SUBS・発注B / 台帳§3-3・項目10): 守護霊の近接スイングが
  // **気絶した敵**に当たった時のフィニッシュ(処刑)。裁定はプレイヤーのナイフスイングと同じ純関数
  // (resolveStunnedMeleeHit)=ボス5×(完全気絶中のみ気絶維持)/強個体3×+気絶解除/それ以外は即時処刑。
  // 素ダメージも同じ式(meleeSwingBaseDamage)で主語=疑似Player。null=気絶していない
  // (呼び出し側は従来の通常スイング処理へ)。除外1: 停止/スロー/寄りズームは出さない(呼び出し側も
  // triggerFinishImpactを呼ばない)。除外4: 計測(recordFinisherKill/recordDamageDealt)は積まない。
  applyGhostMeleeFinisher: (ghostId: string, enemyId: string) => { kind: 'boss' | 'heavy' | 'execute'; dmg: number; killed: boolean } | null;
  // v0.25.2525(GHOST-REFLECT-MELEE-SUBS・発注C): 守護霊の近接スイングに相乗りするサブの発動入口。
  // プレイヤーの triggerCounter が通るのと**同じ3本の共通ヘルパ**(ドローンブーメラン/フレアガン/
  // ジャンクウェポン)を、主語(疑似Player+ghostAsOwner)だけ差し替えて同じ順序で呼ぶ。
  // 戻り値=実際に発動したか(呼び出し側が距離減衰SEを鳴らすため)。
  fireGhostMeleeSwingSubs: (ghostId: string) => { boomerang: boolean; flare: boolean; junk: boolean; clone: boolean; mine: boolean };
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
  // fromX/fromY=ダメージ源の位置(省略可)。守護霊(ghost-ally)の被弾ノックバックの向きに使う
  // (プレイヤーのdamagePlayerと同じ引数の意味・v0.25.2514 監査項目7)。
  // source=被弾源タグ(記録専用・?ghostlog=1のconsole出力にだけ使う。判定・挙動には一切影響しない)。
  damageSummon: (id: string, amount: number, fromX?: number, fromY?: number, source?: string) => void;

  // Weapon actions
  fireWeapons: (currentTime: number) => void;
  firePhillShot: () => void; // PHILL銃: 指離しで狙いサークル方向へ1発(手動)。
  selectUpgrade: (upgrade: UpgradeOption) => void;
  setSubWeaponCooldown: (key: SubWeaponKey, readyAt: number) => void;
  updateHuntingCharge: (startedAt: number, charged: boolean) => void;
  buyShopItem: (key: ShopItemKey, ammoType?: AmmoType) => boolean;
  buySkillCardFromShop: (key: SubWeaponKey) => boolean;
  // SKILL_BUILD_REDESIGN.md §13-1+§16-7+§18-1: 商人の装備区画(指名買いカタログ)。defIdは
  // merchantEquipStepForSlot(slot)が現在提示している候補と一致する時だけ購入が成立する
  // (UIの表示ズレ・古いdefIdでの誤購入を弾く=正規経路)。
  buyEquipmentFromShop: (slot: EquipSlot, defId: string) => boolean;
  sellSubWeapon: (key: SubWeaponKey) => boolean;
  closeShop: () => void;
  returnToBase: () => void;                              // 商人「帰還」=任意撤収(スコア計上・進行なし・装備持ち帰り)
  acceptEventQuest: () => void;
  completeEventQuest: () => void;
  
  // Enemy actions
  addEnemy: (enemy: Enemy) => void;
  removeEnemy: (id: string) => void;
  damageEnemy: (id: string, amount: number, nonLethalBoss?: boolean, crit?: boolean, viaMeleeFinish?: boolean, damageChannel?: 'gun' | 'other' | null, hateSource?: HateSide, postureImpact?: BossPostureImpact | null, postureImpactMult?: number, gpSource?: PhantomDamageSource | null) => boolean; // postureImpactMult: SKILL_BUILD_REDESIGN.md §28(B7/§28-1)弾幕の王の体勢削り倍率(既定1) / gpSource: 幻影ゲートの打撃種別の明示上書き(スラッシャー追撃=近接、銃弾=飛翔時間つきの形。null=従来の導出・v0.25.3640監査A)
  updateEnemies: (deltaTime: number) => void;
  // スカジ氷ハザードの設置(裏ボスコントローラから呼ぶ)。判定/移動は updateEnemies が回す。
  spawnSkadiIce: (x: number, y: number, bornAt: number, fireAt: number, enemyId: string) => void;
  spawnSkadiBlade: (x: number, y: number, angle: number, launchAt: number, enemyId: string, visual?: 'ice' | 'bone' | 'feather') => void; // visual='bone'=ラフィの骨刃(見た目のみ差し替え・判定/挙動はスカジ刃と同じ)
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
  // PACING_PUZZLE.md §9-4/§9-7#6(削岩型)+§14-2④(伐採人も共有): 近接武器の打撃を受けた瞬間に呼ぶ。
  // driller/logger以外は無害(no-op)。
  applyDrillerRetreat: (id: string) => void;
  openCounterWindow: () => void;
  setSlasherCombo: (readyAt: number, step: number) => void;
  pumpSlasherQueuedTap: () => void; // スラッシャー先行入力の自動発動(毎フレーム・useGameLoopから)
  markMeleeSwingFx: () => void; // 近接スイング演出の起点を更新(描画のみ)。追撃など別経路から呼ぶ。
  // ★近接スイング確定の専用打刻(player.meleeSwingCommitAt)。**近接を振った箇所だけ**が呼ぶ
  // (カウンター成立の演出/ショップ経路からは呼ばない)。トールの必中一閃の引き金がこれを読む。
  commitMeleeSwing: () => void;
  // ★research/AI_HUMANIZE.md §8 裁定済み#16(社長裁定2026-09-02=(a)): 「実際に押した時刻」の
  // 専用打刻(player.meleeSwingPressedAt)。commitMeleeSwing()の**直後**、同じ5経路すべてで呼ぶ。
  // 判定・請求には使わない=コマ記録(habitEpisode.ts)専用の入力。meleeSwingCommitAt自体は変えない。
  noteMeleeSwingPressedAt: (pressedAtMs: number) => void;
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
  /**
   * ★敵対側(幻影)の設置物へダメージ(社長指示2026-08-24「それぞれに耐久値設定して」)。
   * 近接スイングの合流点から1回だけ呼ぶ。壊した数を返す(SE/演出の出し分け用)。
   */
  damageHostilePlacements: (cx: number, cy: number, radius: number, damage: number) => number;
  updateProjectiles: (deltaTime: number) => void;
  stickFireKnife: (id: string, enemyId: string, x: number, y: number, fuseMs: number) => void; // 発火ナイフを敵に刺す(追従+遅延爆発)
  // weaponKey: 反射弾の帰属を差し替える(既定=元の弾のまま=プレイヤーの反射と1bit同値)。
  // v0.25.2525: 守護霊の反射だけ GHOST_REFLECT_WEAPON_KEY を渡す=計測除外/ヘイト='ghost'/
  // 倍率の主語=疑似Player(着弾側の解決は useGameLoop の弾ヒット処理)。
  reflectProjectile: (id: string, multiplier?: number, weaponKey?: string, asHostile?: boolean) => void;
  
  // Pickup actions
  addPickup: (pickup: Pickup) => void;
  removePickup: (id: string) => void;
  collectPickup: (id: string) => void;
  dropEnemyCurrency: (enemy: Enemy, x: number, y: number) => void;
  // 経験値オーブのドロップ(色付き個体は個数が増える)。value 省略時は enemy.experienceValue。
  dropEnemyXp: (enemy: Enemy, x: number, y: number, idPrefix: string, value?: number) => void;

  // Breakable props
  syncBreakableProps: (camera: { x: number; y: number }, bounds: GameBounds, torchBonusChance?: number) => void; // torchBonusChance=★v0.25.3595 RELAX中の松明ボーナス
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
  setAmmoPickupAmount: (type: AmmoType, amount: number) => void;
  setUnlockedShopSkillCard: (key: SubWeaponKey, level: number) => void;
  purchasedSubLevels: Partial<Record<SubWeaponKey, number>>; // 開発施設で購入した陳列Lv(永続)。装備条件=Lv1以上
  setPurchasedSubLevel: (key: SubWeaponKey, level: number) => void;
  // ── 永続育成「強化」(research/GROWTH.md v4)。購入(bought)と有効段数(active)の分離=メーター式。
  // **ここを読んでよいのは強化画面と resetGame だけ**(ラン中の参照は Player の焼き値)。
  playerUpgrades: PlayerUpgradeState;
  /** 1段購入(ゴールド消費・不可逆)。買えた=true。買った段はそのまま有効(active)にもなる。 */
  buyPlayerUpgrade: (id: PlayerUpgradeId) => boolean;
  /** 有効段数(メーター)を設定。0〜購入済み段数へクランプ。反映は次の出撃から。 */
  setPlayerUpgradeActive: (id: PlayerUpgradeId, active: number) => void;
  avatarId: AvatarId | null; // アバターシステム(試験・第1弾)。選択中のアバター(視覚のみ・永続・resetGameで消えない)
  setAvatarId: (id: AvatarId | null) => void;
  setStartWithTestStraps: (enabled: boolean) => void;
  setShowStatsOverlay: (enabled: boolean) => void;
  stampPlayerIntro: () => void; // 登場演出の開始(初フレームで終了時刻を確定)
  setRendererReady: (ready: boolean) => void; // レンダラ初フレーム表示の通知(PixiStage が初 render 後に true)
  setIntroDialogueLines: (lines: IntroLine[]) => void; // 出撃ごとの会話を設定(選択ミッション/フリー)
  pendingLoadout: SubWeaponKey[];                       // 装備メニューで選んだサブ(出撃時に resetGame が所持へ反映・永続)
  setPendingLoadout: (keys: SubWeaponKey[]) => void;
  // SKILL_BUILD_REDESIGN.md §1-3/§20(B4・同行者枠の正式化): 守護霊系3種(guardian-spirit/ghost-helper/
  // ghost-slayer)専用の単一選択枠。runBuild/レア度枠を消費しない・player.skillsにも入らない(§8点1・
  // 効果配線はdirectorTick.ts/ghostOnline.tsがこのフィールドを読む=player.skills経由の暗黙参照は廃止)。
  // B1まではpendingSkills(旧スキル持ち込みフィールド)をこの用途に暫定流用していた(置き換え済み)。
  companionSkill: SkillKey | null;                      // 同行者(守護霊/有志/猛者のいずれか1つ。永続)
  setCompanionSkill: (key: SkillKey | null) => void;
  ownedSkills: SkillKey[];                              // ガチャで解禁済みスキル(永続)。ラン中ドラフトの候補元。
  ownedSkillLevels: Partial<Record<SkillKey, number>>;  // 所持スキルのLv(ガチャ重複で上昇・永続)
  // SKILL_BUILD_REDESIGN.md §17(B1): ラン内ビルドの台帳(store・ラン内限定)。
  // 入るのはドラフト取得(新規カード)だけ=レア度枠(1/2/3)の対象そのもの。
  // 警察署報酬(poi-*)は player.skills には入るが runBuild には入れない(§8点1)。同行者(守護霊系)は
  // §20(B4)でcompanionSkill専用フィールドへ正式化済み=player.skillsにもrunBuildにも入らない。
  runBuild: SkillKey[];
  // ラン中にバニッシュ(除外)したスキル(最大2件・ラン終了でリセット)。
  vanishedSkills: SkillKey[];
  // レベルアップ画面でのリロール回数(ラン単位で累積・価格の階段に使う)。
  rerollsUsedThisRun: number;
  // Lv3(覚醒)到達フラグ+SE用フック(絵の実装はB7)。key→到達時刻(Date.now)。resetGameでリセット。
  skillAwakenAt: Partial<Record<SkillKey, number>>;
  // SKILL_BUILD_REDESIGN.md §24: 覚醒カットイン帯(DOM)の駆動イベント。単一オブジェクト(キューでは
  // ない)なので、表示中に新しい覚醒が起きても「1回に纏める」(古い表示が新しいatで上書きされるだけ・
  // 演出/SEは選択直後にset外で1回だけ発火。§24実装側のデバウンスと対で使う)。resetGameでnullへ。
  awakenCutin: { skillKey: SkillKey; skillName: string; at: number } | null;
  rerollUpgradeOptions: () => void;             // スクラップを払い、表示中の3枚を全引き直し(スクラップ択は残置)
  banishSkillFromRun: (key: SkillKey) => void;  // 無料・ラン中2回まで。そのスキルを以後の抽選から除外
  gachaDupeCounts: Partial<Record<SkillKey, number>>;   // ガチャのスキル別「被り回数」(Lv抽選表の参照・永続)
  gachaPitySinceSuper: number;                          // 直近superからのpull数(レア度ソフト天井・永続)
  gachaPullsTotal: number;                              // これまでに引いた累計回数(階段式価格の段・永続)
  grantSkill: (key: SkillKey) => void;                  // ガチャ当選で所持解禁(重複は無視)
  // SKILL_BUILD_REDESIGN.md §15-1(B0発注文)の9: ownedSkills/ownedSkillLevelsのヘッドレス上書き口。
  // 計測スクリプト(greedyボット30ラン等)がガチャを経由せず所持スキル/Lvを直接指定するための
  // テスト専用アクション(UIからは呼ばない・実プレイの挙動には一切関与しない)。
  setOwnedSkillsForTest: (skills: SkillKey[], levels: Partial<Record<SkillKey, number>>) => void;
  resetGachaProgress: () => void;                       // 開発用: ガチャ状態(所持/Lv/被り/pity/累計/金)を初手へ
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
  // BOT_AND_GHOST.md §2.7 制約2(G3): このランで守護霊(ゴースト)が一度でも実際に召喚されたか。
  // ラン内限定(resetGameでリセット)。directorTickの召喚成立箇所が打刻し、リザルトのスコア×0.5が見る。
  ghostSummonedThisRun: boolean;
  /** 実際に召喚された霊の出どころ。報酬倍率は装備ではなくこの値から決める。 */
  ghostSourceThisRun: GhostSource | null;
  /** オンライン霊または固定AIのいいね送信先。リザルト送信だけに使い、アルバムには保存しない。 */
  ghostFeedbackTargetThisRun: GhostFeedbackTarget | null;
  // BOT_AND_GHOST.md §2.15/§2.16 B: このランに同行した守護霊(持ち主名+ビルド写し)。召喚の瞬間に
  // 1回だけ書き、以後は不変(=リザルトが購読しても毎フレーム再描画にならない)。ラン単位=resetGameでnull。
  // 守護霊が死んで場から消えても残す(「このランに同行してくれた人」の記録なので)。
  ghostAlly: GhostAllySnapshot | null;
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
  // PACING_PUZZLE.md §10-20#3(c)/#4: EX(stage-ex1)専用「結界」(北)・「膜」(南)。値が非nullの間、
  // プレイヤーの移動クランプだけがその向きを止める(敵/湧きには適用しない=useGameLoopのEX専用3点
  // セットが書く。gate2Pending/activeEvent/beginArenaEventは一切使わない=既存gate2機構と無関係)。
  exBarrier: { northLockY: number | null; southLockY: number | null };
  // 洋館開始の走り込み(v0.25.2110・社長指示「ヘリ登場いらない。下から走り込んできて」):
  // resetGameがプレイヤー/護衛を下(+y)に置きtrueにする→useGameLoopが上へ自動走行させ、到着(y<=0)で解除。
  // trueの間はisInputLockedで操作を遮断(実移動なので歩行アニメ/護衛追走/カメラ追従は通常システムのまま)。
  corridorRunInActive: boolean;
  /**
   * ボスメーカー(BOSS_MAKER.md)。**開発用の一騎打ち部屋**の状態。本編では常に active:false。
   * ここに置くのは「毎フレームの描画/ロジックが読む」ものだけ(数値テーブル本体は bossTuning レジストリ)。
   */
  bossMaker: {
    active: boolean;      // 部屋に居るか(湧き停止・方眼・無敵などの傘)
    invincible: boolean;  // プレイヤーが死なない(既定ON・トグルで切れる)
    paused: boolean;      // ボスの時間を止める(絵を止めて見たい時)
    showHitbox: boolean;  // 当たり判定の可視化
    hideHud: boolean;     // ゲームHUD(レベル円/サブ武器/武器スロット等)を消す(既定ON・社長指示v0.25.2628)
  };
  setBossMaker: (patch: Partial<GameState['bossMaker']>) => void;
  clearCorridorRunIn: () => void;
  labDoors: LabDoor[];                                  // 可変ドア(解錠状態)
  labButtons: LabButton[];                              // ボタン(押下状態)
  labProps: LabProp[];                                  // 障害物プロップ(木の代わり・当たり判定あり)
  goalReachedAt: number;                                // ゴール到達時刻(0=未到達)。演出後に勝利
  pendingIndoor: boolean;                               // 出撃が屋内ステージか(startMission→resetGame で受け渡し)
  setPendingIndoor: (indoor: boolean) => void;
  // 社長指示v0.25.2462「ゲームオーバーでもう一度を押した時はスタート時の会話を飛ばす。m7は即ボス」。
  // ゲームオーバー画面の「もう一度プレイ」からの再出撃か(startGame→resetGame で受け渡し・consume式)。
  pendingRetryRun: boolean;
  setPendingRetryRun: (retry: boolean) => void;
  pendingStageTheme: StageTheme;                        // 出撃ステージの見た目テーマ(resetGame で stageTheme へ)
  setPendingStageTheme: (theme: StageTheme) => void;
  stageTheme: StageTheme;                               // この出撃の見た目テーマ('lab'=研究所スキン。描画/商人が参照)
  // ステージ2(屋外ラボ廊下)専用: idol(隠しボス=「ゴール資料の真逆位置」)のx座標。resetGame で
  // labIdolSpotForDoc(labDoc).x を1度だけ書く(他ステージ/未配置は null)。idolの敵オブジェクトは
  // 倒されると配列から消えるため参照できず、BGMクロスフェード(setCorridorRadioMix)の距離計算だけの
  // ためにこのフィールドで座標を持つ(PACING_PUZZLE.md §6.28-21)。
  labRadioX: number | null;
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
  // v0.25.3054(社長指示「ボス戦中は拠点とか城とか全部非表示。全て。解除でフェードイン」):
  // ボス交戦フラグ(bossEngagedNowのENTER900/EXIT1400ヒステリシス・updateEnemiesが毎tick更新)。
  // 施設(病院/武器庫/警察署/拠点/商人/城)の発火・滞在・当たり判定のゲートと、描画のフェードが読む。
  bossFightNow: boolean;
  bossFightLastTrueAt: number;                          // 最後に交戦中だったgameTime(解除後の復帰猶予=facilitiesLocked用)
  // v0.25.3055(社長指示「城ボス戦の時は移動できる距離を制限する。研究対象まで(デンジャーには
  // 入れない)。裏ボス:全域ok。ゲートボス:そもそもゲート内」): 城ボス(giantbat・非ストーリー)との
  // 交戦フラグ。プレイヤー移動の半径クランプ(clampCastleFightCrossing)と制限ラインの描画が読む。
  castleFightNow: boolean;
  bossCorpse: { type: EnemyType; x: number; y: number; w: number; h: number; diedAt: number; holdMs?: number; glenBoss2?: boolean } | null; // 討伐後のフェードアウト演出(描画のみが参照)。holdMs=無傷で保持する尺(死亡アテンション付きボスのみ>0)。glenBoss2=変身後の絵で崩す(v0.25.3029)
  // v0.25.3029(社長裁定「二体」): グレン形態1討伐後の形態2スポーン予約(at=実時刻・x/y=世界座標の中心)。
  glenForm2SpawnAt: { at: number; x: number; y: number } | null;
  hiddenBossDefeated: boolean;                          // 裏ボスを討伐済みか(方角矢印の表示打ち切り等に使用)
  // 病院(社長指示v0.25.2331): 通常ステージに1つ。未確認汚染の中間・裏ボスの反対方角。
  // 拠点を解放するとその方角の矢印が出る(裏ボスと同じ POI 仕組み)。3秒とどまるとワクチンを入手。
  hospital: { x: number; y: number } | null;            // この出撃の病院の位置(null=この出撃には無い)
  hospitalDwellMs: number;                              // サークル内の連続滞在時間(ms)。外れると0へ戻る
  hospitalTaken: boolean;                               // ワクチン入手済み(以後サークルも矢印も出さない)
  hospitalTakenAt: number;                              // 入手した gameTime(描画のフェードアウト用)
  updateHospital: (deltaTime: number) => void;          // 毎フレーム: サークル内滞在を計測し3秒でワクチン付与
  // PACING_PUZZLE.md §6.24 M48: 寄り道POI(病院の一般化)。武器庫=デンジャーゾーンの中間。
  // 拠点を解放するとその方角の矢印が出る(病院と同じ POI 仕組み)。3秒とどまり100スクラップを
  // 払うとTier3装備を確定入手。位置は毎ラン、裏ボス/病院/警察署と被らないセクターへランダムに割り当て。
  armory: { x: number; y: number } | null;              // この出撃の武器庫の位置(null=この出撃には無い)
  armoryDwellMs: number;                                // サークル内の連続滞在時間(ms)。外れると0へ戻る
  armoryTaken: boolean;                                 // Tier3装備入手済み(以後サークルも矢印も出さない)
  armoryTakenAt: number;                                // 入手した gameTime(描画のフェードアウト用)
  updateArmory: (deltaTime: number) => void;            // 毎フレーム: サークル内滞在を計測し3秒でスクラップ支払い判定
  // PACING_PUZZLE.md §6.24 M48: 寄り道POI(病院の一般化)。警察署=研究対象区域の中間。旧称「研究施設跡」
  // (社長指示v0.25.2352で改名・中身は不変)。近づくと囲いイベント(アリーナ)が発生し、全滅させると
  // 専用スキルを1つランダム入手する(POLICE_REWARD_SKILLSから抽選・useGameLoopが付与する)。
  police: { x: number; y: number } | null;              // この出撃の警察署の位置(null=この出撃には無い)
  policeTaken: boolean;                                 // 専用スキル入手済み(以後アリーナも矢印も出さない)
  policeTakenAt: number;                                // 入手した gameTime(描画のフェードアウト用)
  // §6.24-UX 確定要件1: 進入時の通信を出したか(1ラン1回/種)。resetGameで戻す。
  poiIntelShown: Record<PoiKind, boolean>;
  showPoiIntel: (kind: PoiKind) => void;                // 進入/発動時の通信を1回だけ出す(既存の左上会話/バナーを流用)
  kogarasuUnlockedThisRun: boolean;                     // このランでトール初回討伐=小烏丸を永続解禁したか(リザルトの解禁ポップアップ用)
  debugLoopError: string;                               // 診断: ゲームループ本体で投げられた例外の要約(?debug=1 表示)
  triggerEventVictory: () => void;                      // 終了アイテム/ゴール: 帰還サークルを出す(即勝利しない)
  beginReturnPhase: (originX: number, originY: number, avoidPlayer?: boolean) => void; // 帰還サークル出現
  updateReturnPhase: (deltaTime: number) => void;       // 毎フレーム: 帰還地点への進入/滞在を更新
  requestStoryReturnPrompt: () => boolean;              // 通常ストーリーの帰還地点内で操作を離したら確認を開く
  answerStoryReturnPrompt: (confirmed: boolean) => void;
  updateSuppression: (deltaTime: number) => { x: number; y: number }[]; // 毎フレーム: 制圧イベント。返り値=このフレームに護衛NPCが発砲した位置(NPC銃声の距離減衰再生用)
  // 毎フレーム: エンディング(仮組み)の兵士/フィルの状態機械を1歩進める(ENDING_SCENE.md 演出仕様v2)。
  // shots=このフレームに発砲した兵士の位置(SE距離減衰再生用)・phillVelMult=フィルの現在速度係数
  // (呼び出し側=useGameLoopがカメラ台車の合成入力にこの倍率を掛ける)。farBackdrop!=='ending'ならno-op。
  updateEndingScene: (deltaTime: number) => { shots: { x: number; y: number }[]; explosions: { x: number; y: number }[]; phillVelMult: number };
  // 爆撃の新規投下ON/OFF(滞空弾はどちらでも落ち切る=v4055で暗転前クリアは廃止)。
  setEndingBombing: (enabled: boolean) => void;
  // フィナーレ(v4055・社長指示「theONEのあと、爆撃がフィルに直撃した?!でフラッシュ暗転して終わり」):
  // 通常投下を止め、フィルの予測位置へ直撃弾(direct)を1発だけ落とす。着弾でendingFinaleHitAtが立つ。
  triggerEndingFinaleBomb: () => void;
  openLabDoor: (id: string) => void;                    // 指定ドアを解錠(open=true)
  pressLabButton: (id: string) => void;                 // ボタン押下→対応ドア解錠
  endIntroDialogue: () => void;   // 登場セリフ終了(ゲーム開始へ)
  setDanceTestMode: (enabled: boolean) => void;
  setDanceTestLevel: (level: number) => void;
  setDanceTestInterval: (ms: number) => void;
  setDanceTestAutoTap: (enabled: boolean) => void;
  setDanceForceJust: (enabled: boolean) => void;
  addMeleeFinishCombo: (amount?: number) => void;
  // 装備システム(裏側): 装備の着脱と持ち帰り。レベルアップ時の選択UIは別途接続する。
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
  /** nowMs を渡すと「拍(atMs)が来たものだけ」先頭から返す(ジャスト吸着)。省略=全部(?beat=0 の従来経路)。 */
  drainRhythmPending: (nowMs?: number) => RhythmPending[];
  setGameBounds: (bounds: GameBounds) => void;
  updateGameStats: (stats: Partial<GameStats>) => void;
  resetGame: (characterClass: string) => void;
  setCameraPosition: (x: number, y: number) => void;
  triggerAttention: (x: number, y: number, cutin?: AttentionCutin, extraHoldMs?: number) => void; // 現地へカメラアテンション(時間停止で高速パン→ホールド→戻る)。cutin指定=§6.36ボス出現カットイン付き。extraHoldMs=ホールド延長(討伐の崩壊見届け用)
  clearAttention: () => void;
  triggerTimeSlow: (scale: number, durationMs: number, holdMs?: number) => void; // holdMs=最も遅い倍率を保持する時間(既定0)
  triggerHitstop: (durationMs: number) => void; // 全停止の瞬間ストップ(カウンター/近接フィニッシュの衝撃)
  // targetX/Y(v0.25.2585・任意): 寄り先の世界座標。未指定=従来どおり画面中央(=カメラが追う
  // プレイヤー)へ寄る。**守護霊のカウンター成立**は成立位置を渡す(社長報告「カメラが当人に
  // 向いてない。プレイヤーのみになってる」)。プレイヤー側の呼び出しは未指定のまま=挙動不変。
  triggerHitImpact: (stopMs: number, shakeMs: number, shakeMag: number, zoomMag: number, targetX?: number, targetY?: number) => void; // ストップ→(後で)揺れ+寄り。ダンス中はストップ無しで即時
  // targetX/Y省略時は画面中央基準(カウンター等・従来どおり)。指定時はその世界座標点へ寄る(社長指示: KILLはキルされた対象へ)。
  // 近接フィニッシュ: ストップ+ズーム+スローを1拍エンベロープで発火(CD明けのみ・CD内は最低保証フラッシュのみ)。
  // forceMaximumZoom=true は致命の一撃専用。CDと進行中ズームを無視し、対象へ最大ズームを掛け直す。
  // 戻り値=そのキルでフル演出(CD明け)が出たか(呼び出し元が武器固有フラッシュを出すかの判断に使う)。
  triggerFinishImpact: (targetX?: number, targetY?: number, forceMaximumZoom?: boolean) => boolean;
  triggerZoom: (mag: number, durationMs: number, holdMs?: number, targetX?: number, targetY?: number) => void; // 近接フィニッシュ等のパンチズーム(描画のみ)
  // dirX/dirY(§5.23 M22 C1・任意・未正規化でよい): 指定時はシェイクをその方向へ寄せる。
  // 未指定/{0,0}/`?dirfx=0`は従来どおり等方のランダム揺れ。
  triggerShake: (durationMs: number, mag?: number, dirX?: number, dirY?: number) => void; // 行動別の画面シェイク(描画のみ)

  // Visual effects (renderer-only; no gameplay impact)
  spawnEffect: (effect: VisualEffect) => void;
  /** v0.25.3078: 本体から扇状(全方位)へ絵を撒き散らす予兆モーション。判定ゼロの派手枠②。 */
  spawnFanBurst: (x: number, y: number, texture: string, count: number, opts?: {
    speed?: number; scale?: number; durationMs?: number; spreadRad?: number; baseAngle?: number;
  }) => void;
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
  // 爆発の6コマflipbook(社長支給ドット素材v0.25.3283「爆発 全部用」)。x/y=爆心、radius=判定半径。
  spawnExplosionFx: (x: number, y: number, radius: number, tint?: number) => void;
  // noShadow(§24追加・既定false=挙動不変): trueで支配光(syncShadowsV9)への参加を断つ=見た目はそのまま。
  spawnGlow: (x: number, y: number, radius: number, color: string, duration?: number, noShadow?: boolean) => void;
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

// 「そこに立てるか」を解決する唯一の関数(社長指示v0.25.2424・D-4「壁/木/建物の中にアイテムが落ちる」)。
// プレイヤーの移動が使っている遮蔽物の連鎖を**そのまま**関数化したもので、アイテムの着地点も同じ関数を通す。
// **プレイヤーが立てない場所にはアイテムも落ちない**、という一文で説明できる状態にするのが目的。
// (同じ判定を2箇所に書くと必ず片方だけ古くなる——v0.25.2383/2387/2389 で3回起きた型。)
// §6.38 B1.5-4(賞金首): export化してbountyTick.tsのresolveBountyMove(下)からも再利用する
// (updateEnemiesのresolveMoveと同じ遮蔽物連鎖=城ボスと同じ「当たる」側)。
export const resolveOutOfSolids = (
  rect: { x: number; y: number; width: number; height: number },
  ctx: {
    labTheme: boolean; farBackdrop: string; solidProps: BreakableProp[];
    castleEvent: GameState['castleEvent'];
    hospital: GameState['hospital']; hospitalTaken: boolean;
    armory: GameState['armory']; armoryTaken: boolean;
    police: GameState['police']; policeTaken: boolean;
    // v0.25.3054(社長指示・監査指摘「絵だけ消すと見えない壁になる」): ボス戦中は施設(城/病院/
    // 武器庫/警察署)の当たり判定も消す=絵と判定を常に一致させる。木/松明/街プロップは施設では
    // ないので残す(消えるのは「ボス戦中に非表示になる施設」だけ)。
    facilitiesHidden?: boolean;
  },
): { x: number; y: number } => {
  const { labTheme } = ctx;
  const noFac = ctx.facilitiesHidden === true;
  const w = rect.width, h = rect.height;
  const treeResolved = labTheme ? { x: rect.x, y: rect.y } : resolveTreeCollision(rect);
  const torchResolved = resolveTorchCollision({ x: treeResolved.x, y: treeResolved.y, width: w, height: h }, ctx.solidProps);
  const castleResolved = (labTheme || ctx.farBackdrop === 'tutorial' || noFac) ? torchResolved
    : resolveCastleCollision({ x: torchResolved.x, y: torchResolved.y, width: w, height: h }, ctx.castleEvent);
  const cityPropResolved = !labTheme
    ? resolveCityPropCollision(ctx.farBackdrop, { x: castleResolved.x, y: castleResolved.y, width: w, height: h })
    : castleResolved;
  const hospitalResolved = noFac ? cityPropResolved : resolveHospitalCollision(
    { x: cityPropResolved.x, y: cityPropResolved.y, width: w, height: h }, ctx.hospital, ctx.hospitalTaken);
  const armoryResolved = noFac ? hospitalResolved : resolveArmoryCollision(
    { x: hospitalResolved.x, y: hospitalResolved.y, width: w, height: h }, ctx.armory, ctx.armoryTaken);
  const cityResolved = noFac ? armoryResolved : resolvePoliceCollision(
    { x: armoryResolved.x, y: armoryResolved.y, width: w, height: h }, ctx.police, ctx.policeTaken);
  if (!labTheme) return cityResolved;
  // 研究所スキン: 壁オブジェクト+遮蔽プロップ。近傍区画のみ問い合わせる(全区画走査を避ける)。
  const rgn = [cityResolved.x - 120, cityResolved.y - 120, cityResolved.x + w + 120, cityResolved.y + h + 120] as const;
  const walls = [...labWallsInRegion(...rgn).map(wallRect), ...labPropsInRegion(...rgn).map(propRect)];
  return resolveAabb({ x: cityResolved.x, y: cityResolved.y, width: w, height: h }, walls);
};

// PACING_PUZZLE.md §6.38 B1.5-4(賞金首): bountyTick.tsの追跡/帰巣移動に障害物衝突を通す
// (updateEnemiesのresolveMoveと同じ遮蔽物連鎖=木/松明/城/街プロップ/病院/武器庫/警察署に当たる。
// 城ボスと同じ「当たる」側)。判定はstore側(resolveOutOfSolids)に置き、bountyTick側は希望移動量
// (nx,ny)を渡すだけ=「判定はworld/store側に置く」掟。resetGameでのラン跨ぎリセットは不要
// (readのみ・状態を持たない純粋な変換)。
export const resolveBountyMove = (
  nx: number, ny: number, box: { width: number; height: number },
): { x: number; y: number } => {
  const s = useGameStore.getState();
  const labTheme = s.stageTheme === 'lab' && !s.indoorMode;
  return resolveOutOfSolids(
    { x: nx, y: ny, width: box.width, height: box.height },
    {
      labTheme,
      farBackdrop: s.farBackdrop,
      solidProps: s.breakableProps.filter(p => p.type !== 'mine' && p.type !== 'uv-bar'),
      castleEvent: s.castleEvent,
      hospital: s.hospital, hospitalTaken: s.hospitalTaken,
      armory: s.armory, armoryTaken: s.armoryTaken,
      police: s.police, policeTaken: s.policeTaken,
      facilitiesHidden: facilitiesLocked(s.bossFightNow, s.bossFightLastTrueAt, s.gameTime),
    },
  );
};

// EVENT_QUEST_DESIGN.md §2-3(二人組クエストv2・B2): レスキュー出現位置を決める。
// ジオメトリ(候補列)はsrc/utils/rescueQuestSpawn.tsの純関数に委ね、ここは
// 「立てる場所か」の判定(resolveBountyMove)と「諦める順序」の適用だけを行う(§2-14「★出現位置の
// 「立てるか」判定」「★候補が全滅した時に諦める順序」)。
// dirX/dirY/forwardDist/perpSign/ringStepは呼び出し側(useGameLoopの二人組ブロック)が引く
// (RESCUE_SPAWN_DIST_MIN/MAX・ARENA_EVENT_RADIUSはuseGameLoopのモジュールローカル定数のため。
// §2-14「★半径の唯一の出どころ」と同じ理由でexport化・移設はしない)。
export const spawnRescueQuestPoint = (
  dirX: number, dirY: number, forwardDist: number, perpSign: 1 | -1, ringStep: number,
): { x: number; y: number } => {
  const s = useGameStore.getState();
  const p = s.player;
  const px = p.x + p.width / 2, py = p.y + p.height / 2;
  const half = PLAYER_HITBOX / 2;

  const candidates = rescueSpawnCandidates({
    playerX: px, playerY: py, dirX, dirY, forwardDist, perpSign, perpOffset: 200, ringStep,
  });

  // 確定②-b(社長裁定2026-08-30): 他イベントの範囲(activeEventサークル・種別問わず + 賞金首の索敵圏)。
  const otherEventCircles: { x: number; y: number; radius: number }[] = [];
  if (s.activeEvent) otherEventCircles.push({ x: s.activeEvent.x, y: s.activeEvent.y, radius: s.activeEvent.radius });
  for (const e of s.enemies) {
    if (isBountyType(e.type) && !isCorpse(e)) {
      otherEventCircles.push({
        x: e.x + e.width / 2, y: e.y + e.height / 2,
        radius: e.aggroRange ?? BOUNTY_AGGRO_RANGE_DEFAULT,
      });
    }
  }
  // 確定②: 武器商人・拠点サークル(絵の重なりだけを避ける=resolveOutOfSolidsには入っていない)。
  const merchantBaseCircles: { x: number; y: number; radius: number }[] = [
    { x: s.weaponMerchant.x, y: s.weaponMerchant.y, radius: s.weaponMerchant.radius },
    ...s.baseSites.map(b => ({ x: b.x, y: b.y, radius: BASE_CAPTURE_RADIUS })),
  ];

  const inAnyCircle = (cx: number, cy: number, circles: { x: number; y: number; radius: number }[]): boolean =>
    circles.some(c => { const dx = cx - c.x, dy = cy - c.y; return dx * dx + dy * dy < c.radius * c.radius; });
  const originOk = (cx: number, cy: number): boolean => (cx * cx + cy * cy) < AREA_THRESHOLDS[1] * AREA_THRESHOLDS[1];
  const standable = (cx: number, cy: number): boolean => {
    const placed = resolveBountyMove(cx - half, cy - half, { width: PLAYER_HITBOX, height: PLAYER_HITBOX });
    return placed.x === cx - half && placed.y === cy - half;
  };

  // ★候補が全滅した時に諦める順序(§2-3): ①原点3000未満→②商人/拠点→②-b他イベント→の順に諦め、
  // ③resolveOutOfSolids(standable)は最後まで守る。どの段でも「出さない」は選ばない。
  const tryStage = (requireOrigin: boolean, requireMerchantBase: boolean, requireOtherEvent: boolean): { x: number; y: number } | null => {
    for (const c of candidates) {
      if (requireOrigin && !originOk(c.x, c.y)) continue;
      if (requireMerchantBase && inAnyCircle(c.x, c.y, merchantBaseCircles)) continue;
      if (requireOtherEvent && inAnyCircle(c.x, c.y, otherEventCircles)) continue;
      if (standable(c.x, c.y)) return { x: c.x, y: c.y };
    }
    return null;
  };

  let picked =
    tryStage(true, true, true) ??
    tryStage(false, true, true) ??
    tryStage(false, false, true) ??
    tryStage(false, false, false);

  if (!picked) {
    // 最終フォールバック(確定①の例外): 押し戻された座標をそのまま採る(collectPickupの着地点と同じ作法)。
    const c = candidates[0];
    const placed = resolveBountyMove(c.x - half, c.y - half, { width: PLAYER_HITBOX, height: PLAYER_HITBOX });
    picked = { x: placed.x + half, y: placed.y + half };
  }

  // 確定③: 着地点だけclampRectToPlayableAreaも通す(S1/S3/S4/S5ではno-op。他ステージへ流用された時の保険)。
  const clamped = clampRectToPlayableArea(picked.x - half, picked.y - half, PLAYER_HITBOX, PLAYER_HITBOX, shieldPlayableCtx());
  return { x: clamped.x + half, y: clamped.y + half };
};

// ★B6(盾押し機構・research/AI_HUMANIZE.md §6・裁定済み#8)。設置型シールドは物理オブジェクト
// (=誰が押していようと世界の壁と行ける帯には従う。守護霊自身が壁をすり抜ける[v0.25.2469]のとは別軸)。
// プレイヤー移動(movePlayer)と同じ2分岐(屋内=labMap壁+閉ドア/屋外=resolveOutOfSolids)を
// 1箇所に共有し、押し手(プレイヤー/守護霊/幻影)全員がこれを通る=「壁は世界に1つ」。
export const resolveShieldWalls = (candidate: Rect): { x: number; y: number } => {
  const s = useGameStore.getState();
  if (s.indoorMode) {
    const openIds = s.labDoors.filter(d => d.open).map(d => d.id);
    return resolveAabb(candidate, [...labBlockingWalls(openIds), ...s.labProps.map(p => p.rect)]);
  }
  return resolveOutOfSolids(candidate, {
    labTheme: s.stageTheme === 'lab',
    farBackdrop: s.farBackdrop,
    solidProps: s.breakableProps.filter(p => p.type !== 'mine' && p.type !== 'uv-bar'),
    castleEvent: s.castleEvent,
    hospital: s.hospital, hospitalTaken: s.hospitalTaken,
    armory: s.armory, armoryTaken: s.armoryTaken,
    police: s.police, policeTaken: s.policeTaken,
    facilitiesHidden: facilitiesLocked(s.bossFightNow, s.bossFightLastTrueAt, s.gameTime),
  });
};

// B6: `clampRectToPlayableArea` の文脈(プレイヤー移動・守護霊移動・phantomTick.playableCtxと同じ形)。
// ★検収是正(重大1・v0.25.3997): exStageは「プレイヤー専用」ではない——正本はplayableArea.tsの
// PlayableAreaCtx.exStageコメント「全アクター共通(§10-20#6=スリィエルの周回もこの拡幅を受ける
// 必要があるため)」で、実際プレイヤー移動クランプ(movePlayer内)も敵/湧きも同じ
// `state.corridorMode && isExStageRun()` を渡している(6262行目付近と同型)。盾だけここを渡さないと
// EX広間で盾のクランプだけ通常通路幅(±170)のまま据え置かれ、広間側(±340)へ出た瞬間に盾が
// 170へ強制スナップされる(最大130pxワープ)。exPlayerBarrier(結界の南北膜)は§10-20#4の規約どおり
// 「プレイヤーの移動クランプにのみ渡す」呼び出し側の作法なので、こちらは従来どおり盾へは渡さない
// (盾は結界の対象アクターではない=渡さなくても常に無効)。
export const shieldPlayableCtx = (): PlayableAreaCtx => {
  const s = useGameStore.getState();
  return {
    farBackdrop: s.farBackdrop,
    labTheme: s.stageTheme === 'lab' && !s.indoorMode,
    corridorMode: s.corridorMode,
    m0AdvanceLimitX: s.m0AdvanceLimitX,
    corridorRunInActive: s.corridorRunInActive,
    exStage: s.corridorMode && isExStageRun(),
  };
};

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
    counterWindowStart: 0,
    counterWindowEnd: 0,
    pendingSwingAt: 0,
    lungeVx: 0,
    lungeVy: 0,
    lungeUntil: 0,
    trapDebuffUntil: 0,
    counterCooldownEnd: 0,
    lastCounterSuccessTime: 0,
    ammoHandgun: AMMO_INITIAL.handgun,
    ammoShotgun: AMMO_INITIAL.shotgun,
    ammoRifle: AMMO_INITIAL.rifle,
    ammoPhill: AMMO_INITIAL.phill,
    ammoGlauncher: AMMO_INITIAL.glauncher, // ★v0.25.4000: 独立プール(社長指示「グレランは弾を分けて」)
    // 育成の焼き値(research/GROWTH.md v4)。ここは**出撃前のプレースホルダ**=常に0段相当。
    // 実際の焼き込みは resetGame(出撃時に1回)。
    growthAtkMult: 1,
    growthScoreMult: 1,
    stageScoreMult: 1,
    growthAmmoMax: { ...AMMO_MAX },
    growthGoldMult: 1,
    growthXpMult: 1,
    ddaBaseHp: PLAYER_BASE_HP,
    critChance: 0,
    quickMagCritUntil: 0,
    reloadEndsAt: 0,
    reloadingWeaponId: '',
    meleeSwingAt: 0,
    meleeSwingCommitAt: 0,
    meleeSwingPressedAt: 0,
    lastDamagedAtGame: 0,
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
    fireShooterCdUntil: 0, reflexCdUntil: 0, slasherChainReadyAt: 0, slasherStrikeStep: 0, slasherReach: 0, slasherQueuedTap: false,
    bloodTreadNextAt: 0, // SKILL_BUILD_REDESIGN.md §28(B7): 血の履帯(blood-treads)の次の棘設置可能gameTime
    scavengerBuffUntil: 0, marksmanMovingSince: 0, heavyGunnerExpBuffUntil: 0,
    speedRampSustainMs: 0, speedRampDirX: 0, speedRampDirY: 0,
    phillReticleDX: 0, phillReticleDY: 0, phillSnapEnemyId: null,
    benkeiBuffUntil: 0, benkeiCdUntil: 0, counterMasterBuffUntil: 0,
    seekerUntil: 0, seekerCdUntil: 0,
    consumableScrapUntil: 0, consumableAttackUntil: 0, consumableSpeedUntil: 0,
    consumableXpUntil: 0, consumableProtectionUntil: 0,
    overclockLightUntil: 0,
    huntingChargeStartedAt: 0,
    huntingCharged: false,
    // 刀の一閃/ワイヤーの状態は共通型(DashLocomotionState)の初期値=全ゼロ。値は従来と同一。
    ...emptyDashState(),
    shijinSlideUntil: 0,
    shijinSlideDirX: 0,
    shijinSlideDirY: 0,
    skaterStopUntil: 0,
    skaterRiding: false,
    skaterRideStartAt: 0,
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
  bloodSpikes: [],
  gravityWells: [],
  bossFires: [],
  acrasielSpears: [],
  gateActive: false,
  deepZoneLocked: false,
  rescueAllies: [],
  thrownBags: [],
  boomerangReadyFxAt: 0,
  flareReadyFxAt: 0,
  benkeiReadyFxAt: 0,
  marksmanRangeFxAt: 0,
  marksmanRangeFxShownFor: 0,
  rescueShooterFxAt: 0,
  eventBannerText: '',
  eventBannerUntil: 0,
  hudDirector: { koma: 'relax', rank: 1 },
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
  rescueClearedAt: 0,
  rescueArenaStartedAt: 0,
  deliveryLocked: false,
  castleAttnDoneAt: 0,
  rescueSpawnedAt: 0,
  basesEverCaptured: 0,
  subquests: [],
  subquestGoldEarned: 0,
  subquestClearSeq: 0,
  benchmarkRun: false,
  hunterChaseSince: null,
  gameTime: 0,
  realGameTime: 0,
  isPaused: false,
  showUpgradeMenu: false,
  levelUpIntroUntil: 0,
  showShopMenu: false,
  showEventQuestMenu: false,
  shopReopenAt: 0,
  vaccinePurchased: false,
  gameWon: false,
  finaleDefeated: false,
  storyReturnPromptVisible: false,
  baseSites: createBaseSites(),
  escorts: [],
  endingSoldiers: [],
  endingPhill: null,
  endingBombs: [],
  endingBombNextAt: 0,
  endingBombingEnabled: true,
  endingFinaleHitAt: 0,
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
  exOutroFading: false,
  gameReturned: false,
  meleeAmmoDropPercent: DEFAULT_MELEE_DROP_PCT, // v0.25.2152: UI撤去=コード既定で固定(適正値はテスト算出中)
  ammoPickupAmounts: loadAmmoPickupAmounts(),
  unlockedShopSkillCards: {},
  purchasedSubLevels: loadSubShelfLevels(),
  playerUpgrades: loadPlayerUpgrades(),
  avatarId: loadAvatarId(),
  pendingLoadout: loadStringArray(LOADOUT_SUBS_KEY) as SubWeaponKey[],
  // SKILL_BUILD_REDESIGN.md §20-1点2(移行): 新キー優先・無ければ旧pendingSkillsキーから守護霊系だけを
  // 拾う(loadCompanionSkill内でCOMPANION_SKILL_KEYS判定済みなので、poi-*等の紛れ込みは自然に弾かれる)。
  companionSkill: loadCompanionSkill(),
  // BOT_AND_GHOST.md G3: 守護霊(guardian-spirit)は最初から所持(社長指示)。新規セーブ・既存セーブとも
  // 読み込み時に無ければ追加するマイグレーション(ensureDefaultOwnedSkills)。
  ownedSkills: ensureDefaultOwnedSkills((loadStringArray(OWNED_SKILLS_KEY) as SkillKey[]).filter(k => !POLICE_REWARD_SKILLS.includes(k))),
  ownedSkillLevels: loadSkillLevels(),
  runBuild: [],           // resetGameで実出撃時に確定させる(初期値はSSR/未出撃時の安全値)
  vanishedSkills: [],
  rerollsUsedThisRun: 0,
  skillAwakenAt: {},
  awakenCutin: null,
  gachaDupeCounts: loadDupeCounts(),
  gachaPitySinceSuper: loadNumber(GACHA_PITY_KEY, 0),
  gachaPullsTotal: Math.max(0, Math.floor(loadNumber(GACHA_PULLS_KEY, 0))),
  goldBalance: loadGoldBalanceWithRetiredRefund(), // §23-2条件4: 退役スキル所持者への一括返却込み(冪等・1回きり)
  namedFoe: loadNamedFoe(),
  namedFoeRunEligible: false, // 実際の抽選はresetGame開始時(初回マウント時点ではまだラン開始前)
  namedFoeSpawnedThisRun: false,
  namedFoeResult: null,
  namedFoeRunResolved: false,
  lastDamagerType: null,
  lastDamagerWasNamed: false,
  ghostSummonedThisRun: false,
  ghostSourceThisRun: null,
  ghostFeedbackTargetThisRun: null,
  ghostAlly: null,
  wallMeta: getWallMeta(getSelectedStageId()), // 実際の再読込はresetGame開始時(ステージ切替に追従)
  wallBandText: '',
  wallBandUntil: 0,
  wallBandColor: 'white',
  wallEventQueue: [],
  wallEventSeq: 0,
  lastKomaAssessmentInput: null,
  indoorMode: false,
  corridorMode: false,
  exBarrier: { northLockY: null, southLockY: null },
  pendingCorridor: false,
  corridorRunInActive: false,
  bossMaker: { active: false, invincible: true, paused: false, showHitbox: false, hideHud: true },
  labDoors: [],
  labButtons: [],
  labProps: [],
  goalReachedAt: 0,
  lastDamageSource: '',
  pendingIndoor: false,
  pendingRetryRun: false,
  pendingStageTheme: 'forest',
  stageTheme: 'forest',
  labRadioX: null,
  pendingFarBackdrop: '',
  farBackdrop: '',
  pendingNearHorizon: '',
  nearHorizon: '',
  pendingHiddenBoss: null,
  hiddenBoss: null,
  bossChasing: false,
  bossFightNow: false,
  bossFightLastTrueAt: 0,
  castleFightNow: false,
  bossCorpse: null,
  glenForm2SpawnAt: null,
  hiddenBossDefeated: false,
  hospital: null,
  hospitalDwellMs: 0,
  hospitalTaken: false,
  hospitalTakenAt: 0,
  armory: null,
  armoryDwellMs: 0,
  armoryTaken: false,
  armoryTakenAt: 0,
  police: null,
  policeTaken: false,
  policeTakenAt: 0,
  poiIntelShown: emptyPoiIntelShown(),
  kogarasuUnlockedThisRun: false,
  debugLoopError: '',
  startWithTestStraps: false,
  showStatsOverlay: false,
  introUntil: 0,
  rendererReady: false,
  tutorialPopup: null,
  tutorialPopupShown: false,
  m0Unlocked: { melee: true, crit: true, ammo: true }, // 既定=全解禁。M0出撃時だけ resetGame が封印する
  m0MeleeHits: 0,
  m0CritDrill: false,
  m0AdvanceLimitX: null,
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
    hitsTaken: 0,
    minHpFrac: 1,
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
  killFx: null,
  kamitsukiFx: null,
  attention: null,
  practiceWinPendingSince: null,
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
  viewZoom: 1,
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
      // 強制移動(ロコモーション上書き)の優先順位・速度・目標ベクトルは
      // src/utils/dashLocomotion.ts の純関数へ抽出した(v0.25.2518・値/順序は不変)。
      // 優先順: ワイヤー高速移動 > スラム後ホップ > 一閃ダッシュ > 一閃着地硬直(停止)。
      // 守護霊(Summon.ghostDash)も**同じ関数**を通る=裁定2「共有方式」。
      const dashMode = dashModeAt(player, nowMs);
      const wireDashing = dashMode === 'wire-dash';
      const wireHopping = dashMode === 'wire-hop';
      const dashing = dashMode === 'katana-dash';
      const recovering = dashMode === 'katana-recovery';
      const dashOv = dashMode !== null
        ? dashOverride(player, dashMode, player.x + player.width / 2, player.y + player.height / 2, KATANA_DASH_SPEED)
        : null;
      // 四神舞フリックの盾バッシュ風スライド(入力を無視して固定方向へ短く滑る)。
      const sliding = dashMode === null && nowMs < player.shijinSlideUntil;
      // 速度ランプ(MOVEMENT_REWORK.md 仕様1・社長裁定v0.25.2442): 「プレイヤーの入力方向」だけを
      // 見て、同じ方向へ走り続けた時間で速度ボーナスを立ち上げる。ダッシュ/ワイヤー/被弾ノックバック等の
      // 強制移動による実座標の変化では判定しない(下のtx/tyとは別に、素の入力だけをここで取り出す)。
      let rampInX = 0;
      let rampInY = 0;
      if (swipeDirection) {
        rampInX = swipeDirection.x;
        rampInY = swipeDirection.y;
      } else {
        if (input.up) rampInY -= 1;
        if (input.down) rampInY += 1;
        if (input.left) rampInX -= 1;
        if (input.right) rampInX += 1;
      }
      const rampMoving = Math.hypot(rampInX, rampInY) > 0;
      const nextSpeedRamp = stepSpeedRamp(
        { sustainMs: player.speedRampSustainMs, lastDirX: player.speedRampDirX, lastDirY: player.speedRampDirY },
        { dtMs: deltaTime * 1000, moving: rampMoving, dirX: rampInX, dirY: rampInY },
      );
      const rampFrac = effectiveRampFrac(nextSpeedRamp, SPEED_RAMP_ENABLED);

      // ★対人トラップ効果中は「移動が等倍のみ」(社長指示2026-08-25・SAME_ARENA §3-g)。
      // かさまし%(ランナー/マークスマン/消費カード/装備)・スケーター×3・ダッシュ系
      // (一閃/ワイヤー/ホップ)・四神スライドを**まとめて素の足で頭打ち**にする。
      // 個別に潰さず1本の min で抑えるのは、①将来の移動手段が自動で入る ②「等倍のみ」という
      // 社長の言葉がそのままコードの形になる、の2点から(リロード中の減速など**素より遅い**ものは
      // min なのでそのまま残る)。
      const trapDebuffed = isTrapDebuffed(player, nowMs);
      // PACING_PUZZLE.md §14-4-2(新死神・着手前監査 重大4/5): 速度計算の合成そのものは
      // utils/playerMoveSpeed.ts の純関数へ切り出した(移設のみ・挙動は1bitも変えていない)。
      // コメント本文(スケーター/マークスマン/ランナー/消費カード/装備/トラップ頭打ち/PvP減速の
      // 経緯)はそちらへ移設済み。
      // スキル: スケーター = 通常歩行の移動速度 ×3(特殊ロコモーションは対象外)。
      // マークスマン/ランナー/消費カード/装備の移動速度倍率は「対象倍率の積 P」として
      // MOVEMENT_REWORK.md 仕様1のランプに乗る。基礎速度(player.speed)・RELOAD_MOVE_SPEED_MULT・
      // スケーター×3はランプ対象外(即応のまま)。
      const skaterActive = hasSkill(player, 'skater') && player.skaterRiding;
      const bonusMult = skillRunnerSpeedMult(player, reloading) * standardSpeedBonusMult(player)
        * consumableSpeedMult(player, state.gameTime) * (player.equipBonus?.moveSpeedMult ?? 1);
      const moveSpeed = computeEffectiveMoveSpeed({
        dashOverrideSpeed: dashOv ? dashOv.speed : null,
        slidingSpeed: sliding ? SHIJIN_SLIDE_DISTANCE / (SHIJIN_SLIDE_MS / 1000) : null,
        reloading,
        reloadMoveSpeedMult: RELOAD_MOVE_SPEED_MULT,
        playerSpeed: player.speed,
        skaterActive,
        bonusMult,
        rampFrac,
        trapDebuffed,
        // ★SAME_ARENA §9(対人体勢): クリ被弾の2/3減速(幻影と対称・移動速度のみ=攻撃CDは触らない)。
        pvpMult: pvpMoveMult(player.pvpPosture, state.gameTime),
      });

      // Target direction from swipe (touch) or keys.
      let tx = 0;
      let ty = 0;
      if (state.deliveryLocked) {
        // 二人組クエストv2 §2-8(納品ロック): 早期returnはしない(この関数はvx/vy/direction/
        // isMoving/aim/速度ランプまで毎フレーム書いており、returnすると走行アニメ・カメラズームが
        // 固定されたまま7〜10秒フリーズし、速度も1フレームで0=CLAUDE.md「慣性MUST」違反になる)。
        // 目標だけ0にし、swipeDirection/dashOverride(ワイヤー/一閃/ホップ)/スライドも無視する
        // (=強制移動の上書きも掛けない)。alpha=inertiaAlpha(dt, PLAYER_INERTIA_TAU)で自然に減速する。
        tx = 0;
        ty = 0;
      } else if (dashOv) {
        // ワイヤー高速移動/ホップは「毎フレーム目標へ向け直す」ホーミング(アンカー地点/着地点)、
        // 一閃は固定方向、着地硬直は(0,0)=停止。中身は dashLocomotion.dashOverride が持つ。
        tx = dashOv.tx;
        ty = dashOv.ty;
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
        swipeDirection && !wireDashing && !wireHopping && !dashing && !recovering && !sliding
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
      // ★踏み込み(SAME_ARENA.md §7-4)。**被弾ノックバックの方が強い**(殴られたら自分の踏み込みは
      // 上書きされる)。無敵は付いていないので、踏み込み中に当たれば普通に食らう=避けるのは腕。
      const lungeActive = !kbActive && kbNow < (player.lungeUntil ?? 0);
      // スケーター急停止中: 入力を無視して残速度を素早く減衰(tau=50ms)=ほんの少し慣性のある急停止。
      const skaterStopping = !kbActive && kbNow < player.skaterStopUntil;
      // ★SAME_ARENA §9(対人体勢): 紫(3秒)+致命後daze(2秒)中は入力を無視して残速度を減衰
      // (skaterStopUntilと同じ型=慣性MUSTに従い瞬間停止にしない)。被弾KBはそのまま食らう(上が優先)。
      const pvpFrozen = !kbActive && isPvpIncapacitated(player.pvpPosture, state.gameTime);
      let vx: number, vy: number;
      if (kbActive) {
        // 持続時間は**その吹き飛び自身の値**で割る(技ごとに変わるため。未指定=従来の共通値)。
        const decay = Math.max(0, (player.knockbackUntil! - kbNow) / (player.knockbackMs ?? PLAYER_KNOCKBACK_MS)); // 1→0
        vx = (player.knockbackVx ?? 0) * decay;
        vy = (player.knockbackVy ?? 0) * decay;
      } else if (lungeActive) {
        // 初速最大→線形に0(ノックバックと同じ形)。**回避に使うので出だしが最も速い**
        // ——加速から入ると避け始めが遅れて間に合わない(社長の狙い「早めに着地」)。
        const d = Math.max(0, (player.lungeUntil - kbNow) / MELEE_LUNGE_MS); // 1→0
        // ★踏み込みも「移動」なのでトラップ効果中は素の足で頭打ち(上の moveSpeed と同じ理屈)。
        // 被弾ノックバック(上の枝)は**掛けられている力**なので対象外=そのまま飛ぶ。
        const lungeCap = trapDebuffed
          ? Math.min(1, player.speed / Math.max(1, Math.hypot(player.lungeVx ?? 0, player.lungeVy ?? 0)))
          : 1;
        vx = (player.lungeVx ?? 0) * d * lungeCap;
        vy = (player.lungeVy ?? 0) * d * lungeCap;
      } else if (skaterStopping || pvpFrozen) {
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
        // 遮蔽物の連鎖(木/松明/城/街プロップ/病院/武器庫/警察署/ラボ壁)は resolveOutOfSolids に
        // 一本化した(v0.25.2424)。**アイテムの着地点も同じ関数を通す**ので、「プレイヤーが立てない
        // 場所にはアイテムも落ちない」が構造的に保証される。連鎖の順序・中身は移設前と1つも変えていない。
        const solidResolved = resolveOutOfSolids(candidate, {
          labTheme, farBackdrop: get().farBackdrop, solidProps, castleEvent,
          hospital: state.hospital, hospitalTaken: state.hospitalTaken,
          armory: state.armory, armoryTaken: state.armoryTaken,
          police: state.police, policeTaken: state.policeTaken,
          facilitiesHidden: facilitiesLocked(state.bossFightNow, state.bossFightLastTrueAt, state.gameTime), // v0.25.3054
        });
        newX = solidResolved.x;
        newY = solidResolved.y;
        // ★敵をすり抜けない(社長報告2026-08-25「敵をプレイヤーはすり抜けない。今回から
        // ダメージ食らわないのですり抜けるようになっちゃった」)。
        // 噛みつき化(PACING_PUZZLE §12)で通常敵の接触ダメージを外した結果、
        // **体で止められることも無くなり素通りできてしまった**——押し返していたのは
        // 被弾のノックバックだったため。壁と**同じ器**(resolveAabb)で塞ぐ。
        // 対象は噛みつき側の敵だけ(=接触ダメージを失った敵)。ボス・技中の敵は従来どおり
        // 接触ダメージで痛いので、体で塞ぐと二重に厳しくなるため入れない。
        // ★v0.25.3913(社長裁定): 塞ぐ箱は**敵の当たり判定ではなく、足元の小さな固定の箱**
        // (`biteWallRect`)。当たり判定そのもので塞ぐと、プレイヤーが攻撃の四角の中に
        // 立っていられず「ぶつかりに行かないと当たらない」状態になる(§12・enemyBite.ts に理由)。
        {
          const blockers: Rect[] = [];
          for (const en of state.enemies) {
            if (isCorpse(en)) continue;
            if (!isBiteSubject(en, isBiteExemptType)) continue;
            // ★噛みつきの踏み込み中は壁を開ける(社長裁定2026-08-25「この際、壁判定は通過可能になり、
            // 当たり判定の瞬間に被っていたらダメージ、壁判定に戻す」)。開けないと覆いかぶされない。
            if (isBiteWallOpen(en, state.gameTime)) continue;
            const eb = biteWallRect(en);
            // 遠い個体は捨てる(全個体との矩形解決を毎フレームやらない)。
            if (Math.abs(eb.x - newX) > 160 || Math.abs(eb.y - newY) > 160) continue;
            blockers.push({ x: eb.x, y: eb.y, width: eb.width, height: eb.height });
          }
          if (blockers.length > 0) {
            const r = resolveAabb({ x: newX, y: newY, width: player.width, height: player.height }, blockers);
            newX = r.x;
            newY = r.y;
          }
        }
        // 「プレイヤーが行ける帯」のクランプ(チュートリアル上下左右/ステージ2上下固定/洋館通路
        // 左右+下限)は src/world/playableArea.ts の clampRectToPlayableArea に一本化してある
        // (v0.25.2391・アイテム/敵の湧きクランプと同じ関数を見る=ズレ防止)。計算・適用順(tutorial→
        // lab→corridor)は元のインライン実装から1px も変えずに移設した。詳細な意図コメントは同ファイル参照。
        {
          // PACING_PUZZLE.md §10-20#2/#5〜#7: exStageはEX限定で北端クランプ+広間の横幅拡大を有効化
          // する(全アクター共有だが、他ステージ/M6ではisExStageRun()=falseなので無効=無変化)。
          // exPlayerBarrierは**プレイヤーの移動クランプにのみ**渡す(§10-20#4「敵/湧きには適用しない」)。
          const playableCtx: PlayableAreaCtx = {
            farBackdrop: get().farBackdrop,
            labTheme,
            corridorMode: state.corridorMode,
            m0AdvanceLimitX: get().m0AdvanceLimitX,
            corridorRunInActive: state.corridorRunInActive,
            exStage: state.corridorMode && isExStageRun(),
            exPlayerBarrier: state.exBarrier,
          };
          // v0.25.3498(社長指示「城と同じ壁の見せ方にして」): 移動前のxを渡すことで、M0の前進壁は
          // 「跨ぐ移動だけ止める」になる(戦闘中に前へ出た結果を、戦闘終了時にスナップで没収しない)。
          const clamped = clampRectToPlayableArea(newX, newY, player.width, player.height, playableCtx, player.x);
          newX = clamped.x;
          newY = clamped.y;
        }
      }
      // v0.25.3055(社長指示): 城ボス戦中はデンジャーゾーンに入れない(研究対象の外縁=原点から
      // 3000pxの円で「外向きに跨ぐ移動」だけを止める。既に外に居る場合はスナップさせない)。
      // 制限ラインの表示は描画側(pixiScene・線のみ/中は塗らない=社長指示)。
      if (state.castleFightNow) {
        const cOld = { x: player.x + player.width / 2, y: player.y + player.height / 2 };
        const cNew = clampCastleFightCrossing(cOld.x, cOld.y, newX + player.width / 2, newY + player.height / 2);
        newX = cNew.x - player.width / 2;
        newY = cNew.y - player.height / 2;
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
      // ★B6(盾押し機構・research/AI_HUMANIZE.md §6・裁定済み#8): 押せるのは所有者(=自分が
      // 置いた盾)だけ。動く盾は壁resolve+clampRectToPlayableAreaを通す(足基準)。敵は見ない=
      // 動いている盾は従来どおり敵を押し出す(ブルドーザー存続・社長裁定2026-08-28「そのブルド
      // ーザーってプレイヤーも可能?なら残して」。押し出し自体は既存の「設置型シールド処理」
      // [敵→盾の毎フレームresolveAabb・useGameLoop]がそのまま担当=ここでは何もしない)。押しは
      // shove補間(220ms)を使わず直接x/yを更新する(絵と判定の乖離防止・§6)。
      const pMoveDx = newX - player.x;
      const pMoveDy = newY - player.y;
      let pushedProjectiles: typeof state.projectiles | null = null;
      if (pMoveDx !== 0 || pMoveDy !== 0) {
        const playerRect = { x: newX, y: newY, width: player.width, height: player.height };
        for (const s of state.projectiles) {
          if (s.weaponType !== 'shield') continue;
          if (s.shieldOwnerKind !== 'player') continue; // 所有者以外は押せない
          if (!rectsOverlap(playerRect, { x: s.x, y: s.y, width: s.width, height: s.height })) continue;
          const candidate: Rect = { x: s.x + pMoveDx, y: s.y + pMoveDy, width: s.width, height: s.height };
          const wallResolved = resolveShieldWalls(candidate);
          const placed = pushShieldRect(
            { x: wallResolved.x, y: wallResolved.y, width: s.width, height: s.height },
            shieldPlayableCtx(),
            s.x,
          );
          pushedProjectiles = (pushedProjectiles ?? state.projectiles).map(pr =>
            pr.id === s.id ? { ...pr, x: placed.x, y: placed.y } : pr
          );
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
      // (スケーターバッシュの発動条件=SKATER_BASH_RUN_MS判定でも使う。速度倍率自体からは分離済み。)
      const marksmanMovingSince = isMoving ? (player.isMoving ? player.marksmanMovingSince : state.gameTime) : 0;
      // 速度上昇が発動した瞬間=共通ランプが満額(rampFrac>=1)に達したフレームで頭上マークを出す。
      // 旧・個別条件(2秒連続移動)は仕様1で共通ランプへ統合したため、フル判定もランプ側に合わせた。
      const marksmanRangeActive = player.characterClass === 'mage' && isMoving && rampFrac >= 1;
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
          if (isReaperFamily(e.type) && !isTerminalReaper(e)) continue;
          if (isCorpse(e)) continue; // KILL吹き飛び(死体・§26-2): PHILL手動照準のスナップ対象から除外
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
          // PACING_PUZZLE.md §14-4-2(新死神・重大4/5): 毎tickの実効移動速度(死神の技「使者」が読む)。
          effectiveMoveSpeed: moveSpeed,
          marksmanMovingSince,
          speedRampSustainMs: nextSpeedRamp.sustainMs,
          speedRampDirX: nextSpeedRamp.lastDirX,
          speedRampDirY: nextSpeedRamp.lastDirY,
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

  // スケボー(新仕様): ダブルタップで乗車。skater 未装備/既に乗車中は無視。
  mountSkater: () => {
    const { player, gameTime } = get();
    if (isPvpIncapacitated(player.pvpPosture, gameTime)) return; // ★SAME_ARENA §9(検収監査 重大①): 紫/daze中は乗車不可(白リスト)
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
      passthrough: false, hitEnemies: [], hostile: false, reflected: false, critChance: 0,
    });
    get().spawnBurst(pcx, pcy, '#facc15', 10);
  },
  // 投擲スケボーが敵に当たった時: 命中点まわりへ前方バッシュ(近接×SHIELD_BASH_DAMAGE_MULT＋強制ノックバック)。
  skaterBoardHit: (x, y, dirX, dirY) => {
    const player = get().player;
    const melee = player.weapons.find(w => w.isMelee);
    const meleeDamage = meleeSwingBaseDamage(melee, player);
    const now = Date.now();
    // 社長指示v0.25.3300/3302 スケーター覚醒(Lv3): 降車投擲の着弾が**爆発仕様**の大爆発になる。
    // 「全ての爆発」規約に載せる: 半径=×1.8×エクスプローダー×ヘビーガンナー / ダメージ=×エクスプローダー×
    // skillOutgoingDamageMult+距離減衰(0.55〜1.0) / 爆発flipbook / SE=呼び出し側(useGameLoop)がbomb。
    // 非覚醒は従来バッシュ(等倍・減衰なし)のまま。キル経路/強制ノックバック(押し道具)はバッシュの
    // アイデンティティとして両者共通で維持。
    const skAwaken = skillLevel(player, 'skater') >= 3;
    const skExMult = skAwaken ? skillExplosionMult(player) : 1;
    const dmg = meleeDamage * SHIELD_BASH_DAMAGE_MULT * skExMult * (skAwaken ? skillOutgoingDamageMult(player) : 1);
    const bashRange = SKATEBOARD_BASH_RANGE * (skAwaken ? SKATER_AWAKEN_BLAST_RADIUS_MULT * skExMult * heavyGunnerExplosionMult(player, get().gameTime) : 1);
    const r2 = bashRange * bashRange;
    const killedList: { enemy: Enemy; finisher: boolean }[] = [];
    const hitAt: { x: number; y: number }[] = [];
    let dealtSum = 0; // 覚醒=距離減衰で個別ダメージになるため合計を積む(計測/統計用)
    let gpPatch: Partial<Enemy> | null = null; // research/GHOST_BOSS.md v6: 幻影の i-frame 打刻(同時1体)
    set(s => {
      const out: Enemy[] = [];
      for (const enemy of s.enemies) {
        if (enemy.aiPhase === 'jump') { out.push(enemy); continue; }
        if (isReaperFamily(enemy.type) && !isTerminalReaper(enemy)) { out.push(enemy); continue; }
        if (isCorpse(enemy)) { out.push(enemy); continue; } // KILL吹き飛び(死体・§26-2): バッシュ対象から除外
        const ecx = enemy.x + enemy.width / 2, ecy = enemy.y + enemy.height / 2;
        const d2 = (ecx - x) * (ecx - x) + (ecy - y) * (ecy - y);
        if (d2 > r2) { out.push(enemy); continue; }
        // ★research/GHOST_BOSS.md v6(幻影の被弾ゲート・7系統⑥=スケボー)。バッシュも近接系=パリィ対象。
        let gpDmgScale = 1; // 対人1/10(社長裁定2026-08-20)。幻影以外は常に1=恒等。
        if (isGuardianPhantom(enemy.type)) {
          const gp = gatePhantomHit(enemy, 0, 'melee', s.gameTime);
          if (!gp.effects) { out.push({ ...enemy, ...gp.patch }); continue; }
          gpPatch = gp.patch;
          gpDmgScale = gp.damageScale;
        }
        hitAt.push({ x: ecx, y: enemy.y });
        // 覚醒: 爆発の距離減衰(中心1.0〜外周0.55)。非覚醒: 従来どおり等倍。
        const eDmg = (skAwaken
          ? Math.max(1, Math.round(dmg * (0.55 + (1 - Math.sqrt(d2) / bashRange) * 0.45)))
          : dmg) * gpDmgScale;
        dealtSum += eDmg;
        const nh = Math.max(0, enemy.health - eDmg);
        if (nh <= 0) { killedList.push({ enemy, finisher: false }); continue; }
        out.push({
          ...enemy, health: nh, lastHit: now, meleeAggro: true,
          knockbackVx: dirX * SHIELD_BASH_KNOCKBACK_SPEED, knockbackVy: dirY * SHIELD_BASH_KNOCKBACK_SPEED,
          knockbackUntil: now + KNOCKBACK_DURATION, knockbackImmuneUntil: now + KNOCKBACK_IMMUNE_MS,
          knockbackShoveUntil: now + KNOCKBACK_DURATION, // v0.25.2607: 押し道具=ボスにも効く
          ...(gpPatch ?? {}), // research/GHOST_BOSS.md v6: 幻影の i-frame 起点
        });
      }
      const bossKilled = killedList.some(k => isFinalBossKill(k.enemy));
      return {
        enemies: out,
        gameStats: {
          ...s.gameStats,
          enemiesKilled: s.gameStats.enemiesKilled + killedList.length,
          eliteKills: s.gameStats.eliteKills + killedList.reduce((n, k) => n + (isScoreElite(k.enemy.type) ? 1 : 0), 0),
          bossKills: s.gameStats.bossKills + killedList.reduce((n, k) => n + (isScoreBoss(k.enemy.type) ? 1 : 0), 0),
          damageDealt: s.gameStats.damageDealt + dealtSum,
        },
        finaleDefeated: s.finaleDefeated || bossKilled,
      };
    });
    // §6.21 M46: スキル(投擲スケボー着弾バッシュ)によるダメージ計測。channel='other'。
    if (hitAt.length > 0) recordDamageDealt('other', dealtSum);
    if (killedList.length > 0) grantMeleeKillRewards(get, killedList, player, getActiveGun(player));
    get().spawnRing(x, y, 8, bashRange, 'rgba(190,242,100,0.62)', 4, 260);
    get().spawnBurst(x, y, '#bef264', 14);
    if (skAwaken) {
      get().spawnExplosionFx(x, y, bashRange); // 覚醒: 爆発flipbook(全爆発共通・v0.25.3283系)
      get().registerMultiHit(hitAt.length);    // 爆発仕様: ヘビーガンナーの2体以上ヒット計上(M33⑤)
    }
    for (const h of hitAt) { get().spawnSlash(h.x, h.y, 'rgba(203,213,225,0.95)'); get().spawnMeleeBlood(h.x, h.y); } // 近接の血飛沫込み(v0.25.2026)
    // SE(v0.25.3304): bashHitFxAt(heavy-impact)は立てない——スケボーのSEは呼び出し側(useGameLoop)が
    // 覚醒=bomb/非覚醒=heavy-impactを着弾の瞬間に直接鳴らす(命中0でも板が当たった音は出す・二重再生防止)。
    if (hitAt.length > 0) { get().triggerHitImpact(HITSTOP_MS, SHIELD_BASH_SHAKE_MS, SHIELD_BASH_SHAKE_MAG, 0); }
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
  
  // ★近接の前隙の起点(社長裁定2026-08-24・SAME_ARENA.md §7)。
  // **指を離した瞬間にやること**=カウンター窓を開く / 近接CDを張る / スイング絵の起点を打つ /
  // 前隙の打刻。**判定は出さない**——useGameLoop が MELEE_WINDUP_MS 後に triggerCounter を呼ぶ。
  // 「守りは即応(窓は今すぐ開く) / 攻めは約束(斬撃は200ms後)」がこの分割の意味。
  // 刀・鞭・スラッシャーの分岐は triggerCounter の中にあるので、窓/CDの正確な値はそちらが
  // `swingAt` を基準に**張り直す**(ここで張るのは前隙中に守りが効くための暫定=同値かより短い)。
  beginMeleeSwing: () => {
    const now = Date.now();
    const p = get().player;
    if (isPvpIncapacitated(p.pvpPosture, get().gameTime)) return false; // ★SAME_ARENA §9: 紫/daze中は振れない(窓も開かない)
    // ★v0.25.4003(社長報告2026-08-28「スラッシャーが連撃うまくできない」): チェーン受付は
    // triggerCounter側(PC直呼び)にしか無く、タッチのタップは下の通常CD門(820ms)が先に飲むため、
    // チェーンCD(300ms)のリズムのタップが**予約もされずに捨てられていた**=タッチだけ連撃が
    // 構造的に一度も出ない(前隙リワーク2026-08-24以降の退行)。PCと同じ受付をここに移植する:
    // CD中=先行入力の予約(v3254) / 明けていれば即・追撃(前隙なし=PCと同じ) / 時間切れ=破棄して通常へ。
    if (hasSkill(p, 'slasher') && p.slasherChainReadyAt > 0) {
      const rgt = get().realGameTime;
      if (rgt >= p.slasherChainReadyAt + SLASHER_CHAIN_TIMEOUT_MS) {
        get().setSlasherCombo(0, 0); // 時間切れ=破棄して下の通常経路へ(このタップは新しい初撃の候補)
      } else if (rgt < p.slasherChainReadyAt) {
        set(state => ({ player: { ...state.player, slasherQueuedTap: true } }));
        return false; // チェーンCD中=予約のみ(発動はuseGameLoopのpumpSlasherQueuedTap)
      } else {
        const chained = applySlasherChainStrike(get, p, get().gameTime, rgt);
        if (chained) return true; // 追撃成立(空振りでも成立=v3934。窓・通常CD・前隙は開かない=PCのチェーン経路と同じ)
        // null=不発条件(紫中等)→下の通常経路へ落とす
      }
    }
    if (now < p.counterCooldownEnd) return false;
    if (p.pendingSwingAt > 0) return false; // 既に前隙中(二重に振らない)
    set(state => ({
      player: {
        ...state.player,
        pendingSwingAt: now,
        meleeSwingAt: now,
        counterWindowStart: now, // 隻狼型(v0.25.3943): 受付は押した瞬間から
        counterWindowEnd: now + COUNTER_ACCEPT_MS,
        counterCooldownEnd: now + (COUNTER_WINDOW + COUNTER_COOLDOWN) * meleeCooldownMult(state.player),
      },
    }));
    // ★踏み込み(社長裁定2026-08-24)。前隙の頭で `lastDirection` へ短く鋭く滑る。
    // 減衰は被弾ノックバックと**同じ器**を使う=壁と「行ける帯」のクランプを movePlayer 側で
    // 丸ごと共有できる(踏み込みは今日いちばん帯の穴を踏みやすい機能なので、自前で座標を書かず
    // 既存の共通経路へ載せる。v0.25.3875 の事故と同型を作らないため)。
    {
      const ld = p.lastDirection ?? { x: 1, y: 0 };
      const lm = Math.hypot(ld.x, ld.y);
      if (lm > 0.001) {
        // ★二段階の踏み込み(v0.25.3957): 指を離した瞬間の走り/歩きで距離を分ける。
        // swipeDirection/swipeStrength は release() が状態を消す**前**にここへ来る(VirtualJoystickの順序)。
        const runningNow = isRunningForMeleeLunge(p, get().swipeDirection, get().swipeStrength);
        const spd = knockbackSpeedFor(meleeLungePx(p, runningNow), MELEE_LUNGE_MS); // 武器別(走り: 鞭=20px/ナイフ=30px、立ち/歩き=0=その場で振る)
        set(state => ({ player: {
          ...state.player,
          lungeVx: (ld.x / lm) * spd,
          lungeVy: (ld.y / lm) * spd,
          lungeUntil: now + MELEE_LUNGE_MS,
        } }));
      }
    }
    // ★鞭のしなり(社長指示2026-08-24)。**前隙の頭で出す**のが肝——3コマ素材が
    // 「巻く→S字→伸び切る」なので、前隙の間にしなり、判定の瞬間に伸び切って打つ、が絵で成立する
    // (馬乗りには入っていたのにプレイヤーには入っていなかった)。判定は持たない=分類②の絵。
    if (p.subWeapons.includes('whip')) {
      const ld = p.lastDirection ?? { x: 1, y: 0 }; // 未設定=右向き(他の鞭経路と同じ既定)
      const lmag = Math.max(0.001, Math.hypot(ld.x, ld.y));
      get().spawnEffect({
        kind: 'whipsnare',
        id: `fx-whipsnare-${now}`,
        fromX: p.x + p.width / 2, fromY: p.y + p.height / 2,
        angle: Math.atan2(ld.y / lmag, ld.x / lmag),
        len: WHIP_LENGTH_BY_LEVEL[whipLevel(p)],
        createdAt: now,
        windupMs: meleeWindupMs(p),
        duration: meleeWindupMs(p) + WHIP_DRAW_MS,
      });
    }
    return true;
  },
  triggerCounter: (swingStartAt?: number) => {
    const now = Date.now();
    const {
      player, gameTime, realGameTime, enemies, projectiles,
      showShopMenu, showUpgradeMenu,
      shopReopenAt
    } = get();
    // 帰還サークル内の攻撃停止は撤廃(社長指示v0.25.3318: 指離せば即ゴールなので不要)。
    // MOVEMENT_REWORK.md 仕様2(社長確定v0.25.2442): スケーター乗車中は攻撃封印(例外なし)。
    // この早期returnで近接/カウンター/ここから発動する各種サブ(ドローンブーメラン/センサー地雷/
    // フレアガン/ジャンクウェポン)もまとめて止まる。降車は既存トグルのまま即時=「降りて即反撃」は成立。
    // 復帰フラグ `?skaterlock=0`。
    if (SKATER_LOCK_ENABLED && player.skaterRiding) return { swung: false, hit: false, finish: false, killed: 0 };
    // ★SAME_ARENA §9(対人体勢・v0.25.3970 検収監査 重大①): 紫/daze中は近接・カウンター・
    // この入口から出る全サブ(センサー地雷/フレアガン/ジャンク等)をまとめて止める。
    // beginMeleeSwing側のゲートだけではPC入力(performTapAction→直呼び)が素通りだった。
    if (isPvpIncapacitated(player.pvpPosture, gameTime)) return { swung: false, hit: false, finish: false, killed: 0 };
    // 社長指示v0.25.3300 シーカー仕様変更: 半透明中は攻撃できない(覚醒Lv3は半透明中も攻撃可)。
    if (isSeekerActive(player, gameTime) && skillLevel(player, 'seeker') < 3) return { swung: false, hit: false, finish: false, killed: 0 };
    // 訓練(M0)の封印(社長指示v0.25.2293): **近接チュートリアルで解禁されるまで振れない**。
    // 教わっていない技が先に暴発すると、説明と体験の順序が崩れる(=台本が成立しない)。
    if (!get().m0Unlocked.melee) return { swung: false, hit: false, finish: false, killed: 0 };
    // スキル スラッシャー: 使い切っていないチェーンが有効な間は、タップをチェーン継続へ回す
    // (通常CDより短い専用CD=SLASHER_CHAIN_CD_MSだけで消化。タイミング精度は問わない=CD明けなら即成立)。
    // チェーンCD中のタップは通常の近接CDと同じ「不発」扱い(連数は減らない・コンボは終わらない)。
    if (hasSkill(player, 'slasher') && player.slasherChainReadyAt > 0) {
      // 時間切れ(検収時追加・叩き台2秒): チェーンを放置したら破棄して通常の初撃に戻す。
      // これが無いと、初撃の数十秒後の次の一振りまで「2撃目」扱い=2/3減衰のままになってしまう
      // (旧リングの寿命~550msに相当する脱出口)。
      if (realGameTime >= player.slasherChainReadyAt + SLASHER_CHAIN_TIMEOUT_MS) {
        get().setSlasherCombo(0, 0); // 破棄して下の通常経路へ(通常CDは自然に明けている時間帯)
        set(state => ({ player: { ...state.player, slasherQueuedTap: false } }));
      } else if (realGameTime < player.slasherChainReadyAt) {
        // 先行入力バッファ(社長指示v0.25.3254): CD中のタップは捨てずに予約し、CD明けに自動発動する
        // (発動はuseGameLoopのpumpSlasherQueuedTap)。連数は減らない。
        set(state => ({ player: { ...state.player, slasherQueuedTap: true } }));
        return { swung: false, hit: false, finish: false, killed: 0 }; // チェーンCD中(予約済み)
      } else {
        const chained = applySlasherChainStrike(get, player, gameTime, realGameTime);
        // ★v0.25.3616: null=射程内に敵が居ない追撃(チェーンは破棄済み)。returnせず下の通常経路へ
        // 落とす=このタップは新しい初撃の候補になる(通常CDが明けていなければ従来どおり不発)。
        if (chained) return chained;
      }
    }
    // Respect cooldown — no swing, no knockback, no window.
    // ★前隙の解決(swingStartAt 指定)は**この門を通さない**: CDは `beginMeleeSwing` が
    // 指を離した瞬間に検査して張ってある。ここで再検査すると自分が張ったCDに引っかかって
    // 判定が永久に出ない(=近接が完全に死ぬ)。
    if (swingStartAt === undefined && now < player.counterCooldownEnd) {
      return { swung: false, hit: false, finish: false, killed: 0 };
    }

    // counter-master v2(CD_REWORK.md 確定2・v0.25.2450): 旧効果「カウンター窓延長(+120/180/250ms)」は
    // 廃止=窓は全員 COUNTER_WINDOW 固定。新効果は「カウンター成立時のみCDリファンド」で、成立箇所
    // (lastCounterSuccessTime打刻の7箇所)が refundCounterCooldown(src/utils/counterMaster.ts)を呼ぶ。
    // 素振り(不成立スイング)のCDはスキル有無に関わらず同一=素振りDPS不変。
    const counterWindowMs = COUNTER_WINDOW;
    // ★前隙(SAME_ARENA.md §7): 窓とCDは**指を離した瞬間**が基準。判定だけが200ms遅れて
    // ここへ来るので、`now`(=判定時刻)ではなく `swingAt`(=離した時刻)から張る。
    // これをしないと窓が200ms後ろへずれ、CDも1周期あたり200ms伸びてしまう(実質の弱体化)。
    // 演出の時刻(エフェクトのcreatedAt等)は従来どおり `now` のまま=絵は今この瞬間に出る。
    const swingAt = swingStartAt ?? now;

    // 近接スイングの揺れは「通常ヒット時のみ」(空振りは揺らさない/フィニッシュ・カウンターは
    // それぞれのインパクト演出に任せる)。判定が出揃う関数末尾で発火する(社長指示)。

    const melee = player.weapons.find(w => w.isMelee);
    const gun = getActiveGun(player); // finisher refunds into the active gun
    const meleeDamage = meleeSwingBaseDamage(melee, player); // キャラ固有: ストライカー弾切れ時×1.5 / 装備ダメージ倍率
    // ★処刑(気絶敵フィニッシュ/ボス5×/強個体3×)は skillOutgoingDamageMult を通らない経路なので、
    // 永続育成の攻撃力(research/GROWTH.md v4・社長裁定Q1)は**素ダメージへ前掛け**して渡す。
    // applyBrokenMeleeFatal は `baseDamage×5 + 報酬予算の残量` なので、前掛けにすると育成は
    // baseDamage 側にだけ乗る(報酬予算の残量は固定の設計値=育成で増やさない)。
    const meleeExecBase = meleeDamage * (player.growthAtkMult ?? 1);
    const pcx = player.x + player.width / 2;
    const pcy = player.y + player.height / 2;
    const meleeRange = huntingMeleeRadius(player);
    // 近接の壁越し不可(視線判定)。屋内=lab壁(閉ドア含む) / 屋外=近傍の木。分身の攻撃と共用。
    const meleeWalls: Rect[] = meleeWallsAround(get, pcx, pcy, meleeRange);

    // G2.6(BOT_AND_GHOST.md §2.8): サブウェポン発動の入口はオーナー(座標・向き・受け手)に対して
    // 解決する。近接スイング入口のサブ(ドローンブーメラン/センサー地雷/フレアガン/ジャンクウェポン/
    // 分身)のオーナーは「振った本人」=常にプレイヤー(値はpcx/pcy・lastDirectionと完全に同一=挙動不変)。
    // v0.25.2525(発注C): ゴーストの近接スイングも同じ3本(ブーメラン/フレア/ジャンク)を通るように
    // 共通ヘルパへ抽出した(主語=actor/owner引数。ここはオーナー=プレイヤー=従来と1bit同値)。
    const swingOwner = playerAsOwner(player);

    // ドローンブーメラン: 近接攻撃(このスイング)と同じ入力で発動(自動ではない)。5秒クールダウン中は不可。
    // ※発火経路を近接攻撃と統一(以前の「立ち止まり中」専用ゲートは廃止=近接と同ロジック)。
    fireDroneBoomerangOnSwing(get, player, swingOwner, gameTime, meleeDamage);

    // センサー地雷(sensor-mine): 近接攻撃(このスイング)と同じ入力で足元に1個設置
    // (§6.13 M36: グローバルCDではなくチャージ制。チャージ数=同時設置上限Lv1=3/Lv2=4/Lv3=5と同じ。
    // 設置=準備完了チャージを1消費、消費分は設置から10秒後に個別再準備。setSubWeaponCooldownを通らないため
    // タイムキーパー/オーバークロック/M35計測(recordSubUse・成立時recordOverclockProc)は援護射撃と同じ流儀で手動維持)。
    // 盤面上限=N(既存)。チャージがあっても盤面がN個埋まっていれば最古を置換(判定=純関数 placeSensorMine)。
    // 感知/起爆/爆発は useGameLoop 側。スロー演出は出さない(CLAUDE.md)。
    // v0.25.2541(発注C): 設置本体は共通ヘルパ(主語=actor/owner引数)。ここはオーナー=プレイヤー
    // =従来と1bit同値。守護霊は fireGhostMeleeSwingSubs から同じ1本を通る。
    placeSensorMineOnSwing(get, player, swingOwner, gameTime);

    // フレアガン(flare-gun): 近接攻撃時に進行方向(プレイヤーの向き)へ発射(CD=Lv1:5秒/Lv2:4秒/Lv3:3秒・
    // CD中のスイングでは出ない)。ダメージ無し。ハンドガン距離(RANGE_BY_CATEGORY.handgun)の地点に着弾し、
    // 着弾点が3秒間、召喚と同じ範囲(ALCHEMY_AGGRO_RANGE)の敵を引き付ける(疑似召喚として
    // resolveEnemyTarget へ合流=召喚と完全に同じ効き方。PACING_PUZZLE.md §6.6 M29)。スロー無し。
    fireFlareGunOnSwing(player, swingOwner, gameTime);

    // ジャンクウェポン(junk-weapon): 近接攻撃と同時にスイング方向へ散弾5発(ショットガンT1相当・CDなし。
    // PACING_PUZZLE.md §6.7 M30)。弾薬=スクラップ(1消費=3ダメージ・1発あたりLv1=1/Lv2=2/Lv3=3)。
    // 社長裁定v0.25.1693: スクラップ≥1なら常にフル5発発射・消費=min(フルコスト,所持全部)・ダメージはLv固定・
    // 0のみ不発。ショットガン弾薬は消費しない。判定=純関数 computeJunkShot(src/utils/junkWeapon.ts)。スロー無し。
    fireJunkWeaponOnSwing(get, player, swingOwner);

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
    // v0.25.3054(社長指示・監査指摘): ボス戦中(+復帰猶予)は開かない——ボス戦中は指を離し続ける
    // ため、拠点の近くで戦うと必ず踏んでいた(「閉じ込められて何もできず」の最有力経路)。
    if (!showShopMenu && !showUpgradeMenu && gameTime >= shopReopenAt && get().redNight?.phase !== 'active'
      && !facilitiesLocked(get().bossFightNow, get().bossFightLastTrueAt, gameTime)) {
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
            counterWindowStart: now, // 隻狼型(v0.25.3943)
            counterWindowEnd: now + COUNTER_ACCEPT_MS,
            counterCooldownEnd: now + COUNTER_WINDOW + COUNTER_COOLDOWN,
          },
        });
        get().spawnRing(b.x, b.y - 26, 12, 58, 'rgba(251,191,36,0.88)', 3, SHOP_INTERACT_RING_MS);
        get().spawnGlow(b.x, b.y - 28, GLOW_R_S, 'rgba(251,191,36,', SHOP_INTERACT_RING_MS);
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
      // タイムキーパー覚醒(Lv3・v0.25.3300): 近接CD-10%。
      const counterCd = hasMurasame(player) ? now : swingAt + (counterWindowMs + COUNTER_COOLDOWN) * meleeCooldownMult(player);
      set(state => ({
        player: {
          ...state.player,
          counterWindowStart: swingAt, // 隻狼型(v0.25.3943): 受付は押した瞬間から
          counterWindowEnd: swingAt + COUNTER_ACCEPT_MS,
          counterCooldownEnd: counterCd,
        }
      }));
      get().commitMeleeSwing(); // ★近接スイング確定の打刻(5経路の1つ=刀・§1-3)
      // §8裁定済み#16: swingAt=「指を離した瞬間」(前隙が有れば実測でそれだけ早い・無ければnowと同じ)。
      get().noteMeleeSwingPressedAt(swingAt);
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
          counterWindowStart: swingAt, // 隻狼型(v0.25.3943)
          counterWindowEnd: swingAt + COUNTER_ACCEPT_MS,
          // タイムキーパー覚醒(Lv3・v0.25.3300): 近接CD-10%。
          counterCooldownEnd: swingAt + (counterWindowMs + COUNTER_COOLDOWN + WHIP_COOLDOWN_EXTRA_MS) * meleeCooldownMult(player),
        }
      }));
      get().commitMeleeSwing(); // ★近接スイング確定の打刻(5経路の1つ=鞭・§1-3)
      get().noteMeleeSwingPressedAt(swingAt); // §8裁定済み#16(katana分岐と同じ理由)
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
        if (isReaperFamily(e.type) && !isTerminalReaper(e)) continue; // 深奥チェイサーは近接対象(ボス級)
        if (isCorpse(e)) continue; // KILL吹き飛び(死体・§26-2): 鞭の標的選定から除外
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
    const mimirLaserBreakHits: { x: number; y: number }[] = []; // §6.33: レーザー弱点窓を近接で中断した位置(カウンター成立FX用)
    const bossFatalHits: { x: number; y: number; labelY: number; w: number; h: number }[] = []; // w/h=killFx流用(v0.25.3622)
    const critStunAt: { x: number; y: number }[] = []; // 社長指示: 近接クリでも銃/刀と同じくスタン(黄色リング)を掛ける
    const slashAt: { x: number; y: number }[] = [];
    const meleeHitEnemyIds: string[] = []; // スキル 救難信号: このスイングでヒットした敵ID(発動判定/対象選定用)
    // ★スラッシャー実機FB(v0.25.3616「敵を2撃目追いかけてない」): 初撃も追撃と同じ自動追尾を持つ。
    // 初撃の強制KB(25px)で敵が射程の外縁へ出ると、2撃目が空振り→空振りでは追尾も発火しない=
    // チェーンが最初の一押しで死んでいた。押した敵(最寄り・非ボス)へ lunge する(追撃側v0.25.3540と同式)。
    let slasherLungeTo: { dirX: number; dirY: number; dist: number } | null = null;
    const meleeCritChance = melee?.critChance ?? 0;
    // 訓練(M0)の封印と台本(社長指示v0.25.2293)。**このスイング開始時点で固定**する
    // (敵ごとのループの中で判定すると、1スイングで複数体に当たった時に「3発目」が壊れる)。
    //  - `m0CritLocked` = クリティカルはまだ教わっていない → 確率クリを一切出さない。
    //  - `m0ForceCritNow` = **この一撃が近接3発目** → 強制クリティカル(そのままフィニッシュ教習へ繋ぐ)。
    const m0CritLocked = !get().m0Unlocked.crit;
    // 演習中は**3発ごとに必ず**クリ(1回きりではなく練習できる)。演習外の封印中は一切出さない。
    const m0ForceCritNow = m0CritLocked && get().m0CritDrill &&
      (get().m0MeleeHits + 1) % M0_FORCED_CRIT_AT_HIT === 0;
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
    // ★敵対側(幻影)の設置物を近接で壊す(社長指示2026-08-24「それぞれに耐久値設定して」)。
    // 近接スイングの合流点はここ1箇所なので、刀/鞭/ナイフのどれで振っても同じ1本を通る。
    // 自分の設置物は `hostile !== true` なので対象外(誤爆で自分のタレットを壊さない)。
    {
      const brokenPlaced = get().damageHostilePlacements(pcx, pcy, meleeRange, meleeDamage);
      if (brokenPlaced > 0) {
        // 壊した手応え(既存プールのみ・新規素材なし)。判定は上で済んでいるので絵だけ。
        get().spawnBurst(pcx, pcy, '#fbbf24', 10 * brokenPlaced);
        get().spawnRing(pcx, pcy, 6, 46, 'rgba(251,191,36,0.85)', 3, 300);
      }
    }
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
    // ★社長裁定2026-08-25(推薦を採用): **幻影の盾はバッシュで押せない**。
    // 押せると「敵の盾を奪って自分の武器にする」ことになり、耐久(PLACED_DURABILITY)を
    // 設定した意味が薄れる。敵対の盾は**近接で耐久を削って壊すだけ**。
    const shieldShoves = projectiles
      .filter(p => p.weaponType === 'shield' && p.hostile !== true)
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
        const rawEx = p.x + dux * SHIELD_BASH_SHOVE_DISTANCE;
        const rawEy = p.y + duy * SHIELD_BASH_SHOVE_DISTANCE;
        // ★検収監査・重大2(3経路のうちバッシュだけ壁resolve+帯クランプが素通しだった): 移動(プレイヤー
        // 押し)・守護霊/幻影押しと同じ壁resolve+clampRectToPlayableArea(足基準)をバッシュの飛び先にも
        // 通す。距離(SHIELD_BASH_SHOVE_DISTANCE)・演出・当たり判定(=下のswept/knockback)は不変
        // ——壁・行ける帯の外へ出そうになった時だけ、その手前に収まる。
        const bashWallResolved = resolveShieldWalls({ x: rawEx, y: rawEy, width: p.width, height: p.height });
        const bashClamped = pushShieldRect(
          { x: bashWallResolved.x, y: bashWallResolved.y, width: p.width, height: p.height },
          shieldPlayableCtx(),
          p.x,
        );
        const ex = bashClamped.x;
        const ey = bashClamped.y;
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
    // G4a(§2.9(3)・記録専用): 盾を押し出した瞬間=バッシュ1回(敵に当たらなくても「バッシュした」様式)。
    if (hasShieldShove) recordShieldBash(shieldShoves.length);
    let bashHitEnemy = false; // バッシュが敵に当たったか(ストップ用)
    // research/GHOST_BOSS.md v6: 幻影に**有効打**が入った時の打刻(同時1体なので1枠でよい)。
    let gpHitPatch: { id: string; patch: Partial<Enemy> } | null = null;

    for (const enemy of enemies) {
      if (isReaperFamily(enemy.type) && !isTerminalReaper(enemy)) { survivors.push(enemy); continue; } // 深奥チェイサーは近接対象(ボス級)
      if (isCorpse(enemy)) { survivors.push(enemy); continue; } // KILL吹き飛び(死体・§26-2): 近接カウンター対象から除外
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

      // ★research/GHOST_BOSS.md v6(幻影の被弾ゲート・7系統②=バッシュ/気絶フィニッシュ/通常近接の
      // 3枝まとめて)。**この位置**なのが肝: 無効化した打撃は slashAt / meleeHitEnemyIds /
      // meleeDamageNumbers に1つも積まず、lastHit も打たない(=ヒットストップ・チェーン・吸血・
      // 救難信号・戻り値 hit/finish/killed のどれにも数えない)。
      let gpDmgScale = 1; // 対人1/10(社長裁定2026-08-20)。幻影以外は常に1=恒等。
      if (isGuardianPhantom(enemy.type)) {
        const gp = gatePhantomHit(enemy, 0, 'melee', gameTime);
        if (!gp.effects) {
          // ★SAME_ARENA §9(対人体勢): 幻影のパリィ成立=プレイヤーが「カウンターを取られた」
          // =プレイヤーの体勢を counter(0.20)で削る(紫入り時の窓・前隙破棄は playerPvpChipPatch)。
          if (gp.parried) set(st => ({ player: { ...st.player, ...playerPvpChipPatch(st.player, 'counter', st.gameTime) } }));
          survivors.push({ ...enemy, ...gp.patch });
          continue;
        }
        gpHitPatch = { id: enemy.id, patch: gp.patch }; // 有効打=i-frame の起点を set() で合成する
        gpDmgScale = gp.damageScale;
      }

      // バッシュ: 近接ダメージ×3 + 押し出し方向への強ノックバック。フィニッシュ無し。
      if (bashShove) {
        bashHitEnemy = true; // 敵にヒット → 後でストップ
        slashAt.push({ x: ecx, y: ecy });
        meleeHitEnemyIds.push(enemy.id);
        let dmg = meleeDamage * SHIELD_BASH_DAMAGE_MULT * gpDmgScale;
        // ★SAME_ARENA §9(検収監査 重大③): バッシュも近接=致命+melee削りの対象(site1と同型)。
        let bashPvpPatch: Partial<Enemy> = {};
        if (isGuardianPhantom(enemy.type)) {
          if (isPvpFatalTarget(enemy.pvpPosture, gameTime)) {
            dmg = pvpFatalDamage(dmg, enemy.maxHealth);
            bashPvpPatch = { pvpPosture: pvpAfterFatal(enemy.pvpPosture, gameTime) };
            bossFatalHits.push({ x: ecx, y: ecy, labelY: enemy.y - 6, w: enemy.width, h: enemy.height });
            bossFinishHit = true; // ★社長指示2026-08-27「幻影戦の致命もKILL演出(ズーム)」: 対人致命もフル演出ゲートを開く
          } else {
            const r = chipPvpPosture(enemy.pvpPosture, 'melee', gameTime, postureChipMult());
            bashPvpPatch = r.broke
              ? { pvpPosture: r.next, gpPendingSwingAt: undefined, gpParriedAt: undefined }
              : { pvpPosture: r.next };
          }
        }
        recordShieldBashDamage(dmg); // G4a(§2.9(3)・記録専用): バッシュ与ダメの様式カウンタ
        meleeDamageNumbers.push({ x: ecx, y: enemy.y, value: dmg, crit: true });
        const newHealth = Math.max(0, enemy.health - dmg);
        if (newHealth <= 0) { killed.push({ enemy, finisher: false }); continue; }
        survivors.push({
          ...enemy,
          health: newHealth,
          lastHit: now,
          knockbackVx: bashShove.dux * SHIELD_BASH_KNOCKBACK_SPEED,
          knockbackVy: bashShove.duy * SHIELD_BASH_KNOCKBACK_SPEED,
          knockbackUntil: now + KNOCKBACK_DURATION,
          knockbackShoveUntil: now + KNOCKBACK_DURATION, // v0.25.2607: 押し道具=ボスにも効く
          knockbackImmuneUntil: now + KNOCKBACK_IMMUNE_MS,
          ...bashPvpPatch, // ★SAME_ARENA §9: 対人体勢
        });
        continue;
      }

      // Anything in reach gets cut — show a slash on it.
      slashAt.push({ x: ecx, y: ecy });
      meleeHitEnemyIds.push(enemy.id);
      // 気絶敵へのフィニッシュ裁定は resolveStunnedMeleeHit が唯一の出どころ
      // (v0.25.2525で抽出=**守護霊の近接スイングと共有**・値/条件は不変。ボス5×は
      // 完全気絶(紫)中のみ気絶維持 / 強個体はHP50%以上で3×+気絶解除 / それ以外は即時処刑)。
      const stunnedHit = resolveStunnedMeleeHit(enemy, meleeExecBase * gpDmgScale, gameTime, BOSS_MELEE_STUN_MULT);
      if (stunnedHit) {
        if (stunnedHit.kind === 'execute') {
          killed.push({ enemy, finisher: true }); // normal instant execute
          recordFinisherKill(); // §6.21 M46: 気絶中の敵への近接即死
          continue;
        }
        bossFinishHit = true;
        const fatal = stunnedHit.kind === 'boss' ? applyBrokenMeleeFatal(enemy, meleeExecBase * gpDmgScale, gameTime) : null;
        const dmg = fatal?.damage ?? stunnedHit.dmg;
        // ★v0.25.3703: 強個体(パンプキン等)の気絶中3×(heavy)も「致命の一撃」(E-1裁定
        // 「即死無しだよ。致命の一撃ではあるけど」)=ボス致命と同じ演出系へ載せる
        // (Kill!演出+CD無視の最大ズーム+KILL跳びつき)。旧: boss枝(紫中)のみで、
        // 社長報告「パンプキンへの致命の一撃でKILL演出が出なかった」の真因。
        if (fatal || stunnedHit.kind === 'heavy') bossFatalHits.push({ x: ecx, y: ecy, labelY: enemy.y - 6, w: enemy.width, h: enemy.height });
        meleeDamageNumbers.push({ x: ecx, y: enemy.y, value: dmg, crit: true });
        recordCritHit('guaranteed', stunnedHit.kind === 'boss'); // §7-11c(4): meleeExecuteの紫中フィニッシュ
        // §5.21-追補4: スタン中ボスへの5×近接(と強個体への3×)はボスにとっての「フィニッシュ」経路
        // そのもの(finisher:trueの即時処刑に相当)。
        const newHealth = Math.max(0, enemy.health - dmg);
        if (newHealth <= 0) {
          killed.push({ enemy, finisher: false });
        } else {
          survivors.push({
            ...enemy,
            health: newHealth,
            // §6.38 v7: keepStunは'boss'kindだけが持つ(賞金首もv7でisBossType編入され'boss'枝を
            // 通るため、FB4のkeepStun特例は'boss'枝1本に整理済み=meleeExecute.resolveStunnedMeleeHit参照)。
            stunUntil: stunnedHit.kind === 'boss' && stunnedHit.keepStun ? enemy.stunUntil : undefined,
            lastHit: now,
            liftUntil: now + MELEE_STUN_LIFT_MS,
            ...(fatal?.patch ?? {}),
          });
        }
        continue;
      }
      // Melee weapons carry a fixed crit chance (varies by weapon). A crit
      // multiplies the swing's damage and pops a gold number.
      // クリ率の合成(武器基礎+本体+トラップ拘束+10%+弱点+10%+弁慶+ウォームアップ+ナイフマスター)は
      // meleeHitCritChance が唯一の出どころ(v0.25.2514で抽出=守護霊の近接と共有・値は不変)。
      // 訓練(M0)の封印+台本(社長指示v0.25.2293): クリティカルは**教わるまで出ない**。
      // その代わり**近接3発目は必ずクリティカル**にして、そのまま近接フィニッシュの教習へ繋げる。
      // (m0CritLocked が false=通常ステージ/解禁後 なら、従来どおり確率で決まる。)
      const crit = m0CritLocked
        ? m0ForceCritNow
        : Math.random() < meleeHitCritChance(meleeCritChance, player, gameTime, enemy);
      // ★v0.25.3969: 対人スケール(gpDmgScale)を通常近接にも掛ける——gatePhantomHitの戻り値
      // damageScale は「自前のダメージ計算に掛けるため」に返っているのに、この枝だけ未適用だった
      // (気絶フィニッシュ枝は適用済み=幻影への通常近接だけ対人1/5が効いていない実バグ)。幻影以外は×1で恒等。
      let dmg = meleeDamage * (crit ? skillCritMult(player, CRIT_DAMAGE_MULT) : 1) * skillOutgoingDamageMult(player) * meleeComboMult * gpDmgScale;
      // ★SAME_ARENA §9(対人体勢): 紫中の幻影への近接=致命の一撃(×5+最大HP25%・裁定②)。
      // 紫でなければ melee(0.04)の削り+クリなら2/3減速。
      let pvpMeleePatch: Partial<Enemy> = {};
      if (isGuardianPhantom(enemy.type)) {
        if (isPvpFatalTarget(enemy.pvpPosture, gameTime)) {
          dmg = pvpFatalDamage(dmg, enemy.maxHealth);
          pvpMeleePatch = { pvpPosture: pvpAfterFatal(enemy.pvpPosture, gameTime) };
          bossFatalHits.push({ x: ecx, y: ecy, labelY: enemy.y - 6, w: enemy.width, h: enemy.height }); // 既存のKill!演出プールを流用(§9 UI最小)
          bossFinishHit = true; // ★社長指示2026-08-27「幻影戦の致命もKILL演出(ズーム)」: 旧実装はこの旗が立たずズームのゲート(finisherHit||bossFinishHit)を通らなかった
        } else {
          const r = chipPvpPosture(enemy.pvpPosture, 'melee', gameTime, postureChipMult());
          const ps = crit ? markPvpCritSlow(r.next, gameTime) : r.next;
          pvpMeleePatch = r.broke
            ? { pvpPosture: ps, gpPendingSwingAt: undefined, gpParriedAt: undefined } // 紫入り: 前隙・予約を破棄(§9)
            : { pvpPosture: ps };
        }
      }
      meleeDamageNumbers.push({ x: ecx, y: enemy.y, value: dmg, crit });
      recordCritHit(crit ? 'rng' : 'none', isBossType(enemy.type)); // §7-11c(4): 近接クリ計測口
      const newHealth = Math.max(0, enemy.health - dmg);
      if (newHealth <= 0) {
        killed.push({ enemy, finisher: false });
        continue;
      }
      // GAME_AUDIT #17(社長承認): プレイヤーが直接出したクリはすべて裏ボスの完全気絶カウントに
      // 乗せる(銃と同じbumpBossCrit=挙動統一)。裏ボス以外はnullで素通り。
      const bossBump = applyBossPostureDamage(enemy, 'melee', gameTime);
      if (bossBump?.triggered) bossFullStunHits.push({ x: ecx, y: ecy });
      // §6.33(LASER-TRACK): レーザー弱点窓の中断。'melee'体幹パッチを合成してから判定(二重取り防止)。
      const laserBreak = mimirLaserBreakOnMeleeHit({ ...enemy, ...(bossBump?.patch ?? {}) }, gameTime);
      if (laserBreak) mimirLaserBreakHits.push({ x: ecx, y: ecy });
      if (laserBreak?.postureTriggered) bossFullStunHits.push({ x: ecx, y: ecy });
      // 社長指示: 近接クリでも銃・刀と同じくスタンさせる(倒せなかった時のみ=フィニッシュ受付の入口)。
      // 気絶時間アップ(パッシブ)も銃と同じくstunDurationMultを掛ける。
      if (crit) critStunAt.push({ x: ecx, y: ecy });
      // ボスはスタンさせず半減(v0.25.2422)。通常敵は従来どおり。
      // v0.25.3491: isBossType(pumpkin/lab-zombie-3含む)はbossCritStopPatch側がDR込みで
      // stunUntil/bossSlowUntilのどちらかを決める。通常敵だけこの場の直書き5秒スタンを使う(不変)。
      const bossSlow = crit ? bossCritStopPatch(enemy, gameTime, player.stunDurationMult ?? 1) : null;
      const stunUntil = (crit && !bossSlow && !isBossType(enemy.type) && !isHangedman(enemy.type))
        ? gameTime + STUN_DURATION_MS * (player.stunDurationMult ?? 1)
        : enemy.stunUntil;
      // Knockback, unless this enemy was shoved recently (debounce to avoid
      // locking it in an infinite stagger). Damage still landed above.
      // 社長指示v0.25.3297「スラッシャーの時だけ25px強制ノックバック(CD無視)」: スラッシャー所持中の
      // 近接は免疫CD(1.75s)を無視して毎回、実距離25px固定で飛ばす(連撃の各段と初撃で手応えを揃える)。
      // ★社長指示v0.25.3496「スラッシャーではボスはノックバックしないで」: 強制KB(免疫CD無視)は
      // **通常敵限定**にする。ボス級に効いていると、免疫CDを無視して毎撃 knockbackUntil が立ち、
      // ボスの技が永久に中断される(=はめ)。ボスは従来の免疫CD付きルールへ落ちる。
      const slasherForce = skillLevel(player, 'slasher') > 0 && !resistsChipKnockback(enemy.type);
      // ★v0.25.3616: 初撃の自動追尾の目標(押した敵のうち最寄り。追撃側の lungeTo と同じ選び方)。
      if (slasherForce && (slasherLungeTo === null || dist < slasherLungeTo.dist)) {
        const dn = Math.max(0.001, Math.hypot(dx, dy));
        slasherLungeTo = { dirX: dx / dn, dirY: dy / dn, dist };
      }
      if (slasherForce || knockbackCdReady(enemy, now)) {
        // ★v0.25.3959(社長報告「近接当てると飛んでっちゃう」・?kblog=1実測「KB開始 bat 予定281567px」):
        // 方向の正規化は**中心差分の長さ**で割る。dist(enemyMeleeDist)はv0.25.3170から判定矩形の
        // 最近点距離=密着(中心が帯内)で0になり、dx/0.001×speedで数百万px/sのKBが出ていた。
        // falloff(減衰)は従来どおり判定距離distを使う(挙動不変)。
        const norm = Math.max(0.001, Math.hypot(dx, dy));
        const falloff = 1 - dist / meleeRange;
        const speed = slasherForce
          ? knockbackSpeedFor(SLASHER_FORCE_KB_PX, KNOCKBACK_DURATION)
          : KNOCKBACK_SPEED * (0.5 + falloff * 0.5); // v0.25.3260: 50px化(3257)を社長指示で撤回=従来値へ
        survivors.push({
          ...enemy,
          health: newHealth,
          lastHit: now,
          stunUntil,
          knockbackVx: (dx / norm) * speed,
          knockbackVy: (dy / norm) * speed,
          knockbackUntil: now + KNOCKBACK_DURATION,
          knockbackImmuneUntil: now + KNOCKBACK_IMMUNE_MS,
          ...(bossSlow ?? {}), // CRIT-UNIFY §9.2バグ修正: bossSlowUntil(半減)が計算のみで未適用だった漏れ
          ...(bossBump?.patch ?? {}), // GAME_AUDIT #17: 完全気絶カウント/発動を反映(最後に展開して優先)
          ...(laserBreak?.patch ?? {}), // §6.33: レーザー中断(laser-broken遷移+中断CD+体幹'counter')
          ...pvpMeleePatch, // ★SAME_ARENA §9: 対人体勢(melee削り/2/3減速/致命後daze)
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
          ...(bossSlow ?? {}), // CRIT-UNIFY §9.2バグ修正: 同上
          ...(bossBump?.patch ?? {}), // GAME_AUDIT #17
          ...(laserBreak?.patch ?? {}), // §6.33: レーザー中断
          ...pvpMeleePatch, // ★SAME_ARENA §9: 対人体勢(同上)
        });
      }
    }

    // A melee finisher (instant execute) triggers a brief full-game hitstop.
    const finisherHit = killed.some(k => k.finisher);
    const comboFinishCount = killed.filter(k => k.finisher).length + (bossFinishHit ? 1 : 0);
    const bossKilled = killed.some(k => isFinalBossKill(k.enemy));
    // スキル: ナイフマスター=近接ヒットも表示コンボに加算(2026-08-29一本化)。窓は共通ヘルパー
    // (ナイフマスター所持=3s・非所持=7s・コンボマスター延長・装備KILL猶予込み)。
    const meleeHitLanded = slashAt.length > 0;
    const comboGain = comboFinishCount + knifeMasterHitComboGain(player, meleeHitLanded, comboFinishCount);
    const finishWindowMs = meleeFinishComboWindowMs(player);
    // §6.21 M46: 近接カウンター振り(通常ナイフ)の計測。channel='melee'。1振り=1回(hitCount=命中数)。
    const meleeSwingDamage = meleeDamageNumbers.reduce((sum, n) => sum + n.value, 0);
    recordDamageDealt('melee', meleeSwingDamage);
    recordMeleeSwing(slashAt.length);
    set(state => ({
      // このスイングで近接ダメージを受けた敵(lastHit===now)に meleeAggro を付与(救助で以後プレイヤー狙い)。
      // §5.21-追補8: 同じ判定(このスイングで近接ダメージを受けた=lastHit===now)でミゲル(ゲート2ボス)
      // 専用の meleeHitAt もスタンプ(gun/爆発は damageEnemy 側の別経路なので対象外)。ミゲル以外は
      // 無害な余剰フィールド(useGameLoop のミゲル専用コントローラだけが参照)。
      enemies: survivors.map(e => {
        // research/GHOST_BOSS.md v6: 幻影の i-frame 打刻を合成する(有効打のときだけ)。
        const gp = gpHitPatch !== null && gpHitPatch.id === e.id ? gpHitPatch.patch : null;
        // PACING_PUZZLE.md §9-4/§9-7#6(削岩型・近接被弾での離脱): このスイングで近接ダメージを受けた
        // driller/logger に gameTime+2000 を書く(ナイフ/刀/鞭のスイング=この3関数+守護霊/分身は別途)。
        if (e.lastHit === now) return { ...e, meleeAggro: true, meleeHitAt: gameTime, ...(gp ?? {}), ...(isRetreatEligibleType(e.type) ? { drillerRetreatUntil: gameTime + DRILLER_RETREAT_MS } : {}) };
        return gp ? { ...e, ...gp } : e;
      }),
      gameStats: {
        ...state.gameStats,
        enemiesKilled: state.gameStats.enemiesKilled + killed.length,
        meleeFinishers: state.gameStats.meleeFinishers + killed.reduce((n, k) => n + (k.finisher ? 1 : 0), 0),
        eliteKills: state.gameStats.eliteKills + killed.reduce((n, k) => n + (isScoreElite(k.enemy.type) ? 1 : 0), 0),
        bossKills: state.gameStats.bossKills + killed.reduce((n, k) => n + (isScoreBoss(k.enemy.type) ? 1 : 0), 0),
        damageDealt: state.gameStats.damageDealt + meleeSwingDamage,
        maxCombo: comboGain > 0
          ? Math.max(
              state.gameStats.maxCombo,
              state.meleeFinishComboUntil >= gameTime
                ? state.meleeFinishComboCount + comboGain
                : comboGain
            )
          : state.gameStats.maxCombo
      },
      finaleDefeated: state.finaleDefeated || bossKilled,
      meleeFinishComboCount: comboGain > 0
        ? (state.meleeFinishComboUntil >= gameTime ? state.meleeFinishComboCount + comboGain : comboGain)
        : state.meleeFinishComboCount,
      meleeFinishComboUntil: comboGain > 0
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
        meleeSwingAt: swingAt, // 近接スイング演出の起点(描画のみ)。★前隙の起点=指を離した時刻に揃える(200ms後に絵を出し直さない)。
        // ★SAME_ARENA §9(検収監査 重大②): この振りの最中に紫へ入った(幻影のパリィ等)なら、
        // 破棄した窓をここで開き直さない(旧: 無条件書き=紫入り直後300ms弾パリィが生きていた)。
        counterWindowStart: isPvpIncapacitated(state.player.pvpPosture, state.gameTime) ? 0 : swingAt, // 隻狼型(v0.25.3943)
        counterWindowEnd: isPvpIncapacitated(state.player.pvpPosture, state.gameTime) ? 0 : swingAt + COUNTER_ACCEPT_MS,
        // タイムキーパー覚醒(Lv3・v0.25.3300): 近接CD-10%。
        counterCooldownEnd: swingAt + (counterWindowMs + COUNTER_COOLDOWN) * meleeCooldownMult(state.player),
        huntingCharged: false,
        huntingChargeStartedAt: 0,
        // スキル スラッシャー: この近接が命中(slashAt有)したらチェーンを開始(step=0・0.5秒後にチェーンCD明け)。
        // 命中しなければ非アクティブ(チェーン無し)。以後の追撃はチェーンCD明けのタップで出す。
        // ★v0.25.3931(社長指示2026-08-26「スラッシャーを空振りでも2発目以降振れるようにして」):
        // 旧実装は **命中(slashAt有)した時だけ**チェーンを開いていた=空振りすると2発目が出せなかった。
        // 前隙200msが入って「振ってから当たるまで」に間ができた今、初撃が外れるのは普通に起きるので、
        // **命中を条件にしない**(スキルを持っていて振ったなら連撃に入れる)。
        slasherChainReadyAt: hasSkill(state.player, 'slasher')
          ? state.realGameTime + SLASHER_CHAIN_CD_MS
          : 0,
        slasherStrikeStep: 0,
        // 追撃用に「初撃時点の射程」を記録(state.player は更新前=huntingCharged がまだ true なので溜め延長を含む)。
        slasherReach: hasSkill(state.player, 'slasher') ? huntingMeleeRadius(state.player) : 0,
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

    get().commitMeleeSwing(); // ★近接スイング確定の打刻(5経路の1つ=ナイフ・§1-3)
    get().noteMeleeSwingPressedAt(swingAt); // §8裁定済み#16(katana分岐と同じ理由)

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
      get().spawnGlow(p.x, p.y, GLOW_R_XL, 'rgba(168,85,247,', 620);
      get().spawnCallout(p.x, p.y - 24, 'BREAK!', '#d8b4fe', { bg: 0x6b21a8 });
    }
    // §6.33: レーザー中断=カウンター成立扱いの演出(hiddenBossCounterHitの意匠を踏襲。SEはuseGameLoopが
    // laser-broken遷移を検知して鳴らす=gameStoreはplaySfxを持てない)。
    for (const p of mimirLaserBreakHits) {
      get().triggerHitImpact(COUNTER_HITSTOP_MS, COUNTER_SHAKE_MS, COUNTER_SHAKE_MAG, COUNTER_ZOOM_MAG);
      get().spawnGlow(p.x, p.y, GLOW_R_L, 'rgba(56,189,248,', 360);
      get().spawnRing(p.x, p.y, 14, 135, 'rgba(56,189,248,0.9)', 3, 360);
      get().spawnBurst(p.x, p.y, '#38bdf8', 14);
      get().spawnCallout(p.x, p.y - 12, 'Counter!', '#e0f2ff', { bg: 0x2563eb });
    }
    for (const p of bossFatalHits) {
      showBossFatalPresentation(get, p.x, p.y, p.labelY);
    }

    // Per-kill rewards. Finishers grant bonus XP + gold VFX. EVERY melee kill
    // also DROPS an ammo box for the active gun's family — melee is the run's
    // main way to scavenge rounds, but you have to walk over the drop.
    grantMeleeKillRewards(get, killed, player, gun);
    if (finisherHit || bossFinishHit) {
      const [ztx, zty] = bossFatalHits[0]
        ? [bossFatalHits[0].x, bossFatalHits[0].y]
        : finishZoomTargetOf(killed);
      // M21(§5.22): フル演出(CD明け)の時だけ武器固有の黄フラッシュを重ねる。CD内は
      // triggerFinishImpact自身が出す最低保証フラッシュ(軽い白)だけになる=二重フラッシュを避ける。
      const fullCinematic = get().triggerFinishImpact(ztx, zty, bossFatalHits.length > 0);
      if (fullCinematic && killed.some(k => k.finisher)) {
        get().spawnFlash('rgba(253, 224, 71, 0.28)', 200);
      }
      {
        // ★KILL処刑演出v2(社長指示v0.25.3603): 寄りズームが入るフル演出の時だけ、首元へ跳びついて
        // 掻っ切る→血が一斉に噴き上がる→元の場所へ跳んで戻る(描画はpixiScene・実時間駆動)。
        // この間は全停止(hitstop)=「時間ストップ・エフェクトは止めない」。停止明けはスローの尾で
        // 等速へ戻す(時間にも慣性)。?juice=0(旧演出との比較モード)では出さない。
        // ★v0.25.3622(社長指示「このKILL演出の動きを致命の一撃にも流用。致命とKILL両方を巻き込んだ
        // 場合は、致命を優先」): 跳びつき先(primary)=致命の一撃のボスが最優先、無ければ処刑した
        // 雑魚の先頭。血の一斉噴出(victims)は処刑した雑魚+致命の全対象。旧「ボス致命は対象外」は撤回
        // (事実として: v3603では討伐演出との衝突を避けて外していた。本裁定で重ねて出す)。
        const finKills = killed.filter(k => k.finisher);
        const fatal = bossFatalHits[0];
        const prim = fatal
          ? { cx: fatal.x, cy: fatal.y, w: fatal.w, h: fatal.h }
          : finKills[0]
            ? { cx: finKills[0].enemy.x + finKills[0].enemy.width / 2, cy: finKills[0].enemy.y + finKills[0].enemy.height / 2, w: finKills[0].enemy.width, h: finKills[0].enemy.height }
            : null;
        // v0.25.3703: 発火の中身は startKillFxCinematic へ抽出(刀/鞭/ワイヤーの致命と共有)。挙動不変。
        if (fullCinematic && prim) {
          startKillFxCinematic(get, prim, [
            ...finKills.map(k => ({ x: k.enemy.x + k.enemy.width / 2, y: k.enemy.y + k.enemy.height / 2 })),
            ...bossFatalHits.map(p => ({ x: p.x, y: p.y })),
          ], pcx, pcy);
          // 斬撃の絵(横一文字)はpixi側drawKillFxSlashが一拍明けに出す(v0.25.3615 FB8)。
          // 斬撃SE(heavy-impact+slash-damage)はstartKillFxCinematic内(v0.25.3605 FB1+FB5)。
        }
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
    applyMeleeFinishSkillSpread(get, player, killed.some(k => k.finisher), pcx, pcy, meleeRange, meleeDamage, meleeFinisherAt(killed));
    // スキル: 救難信号(近接ヒット時、一定確率で味方が援護攻撃=必中・倍率1)。
    applyRescueSignalProc(get, player, meleeDamage, meleeHitEnemyIds, pcx, pcy);
    // 吸血覚醒(Lv3・v0.25.3300): 近接ヒットでも1%回復(1スイング1回・控えめdrain)。
    applyVampireMeleeHeal(get, player, meleeHitEnemyIds, pcx, pcy);
    get().registerMultiHit(slashAt.length); // キャラ固有 ヘビーガンナー: 近接が2体以上に当たれば爆発範囲バフ
    if (hasSkill(player, 'counter-master') && slashAt.length > 0) {
      counterMasterKnockback(get, pcx, pcy, counterMasterKbScale(player));
    }
    // スキル スラッシャーのチェーン開始はこの近接スイングの set()(player.slasherChainReadyAt)で行う。
    // 追撃自体は「チェーンCD明けのタップ」で applySlasherChainStrike が出す(自動ではない)。
    // ★v0.25.3616(実機FB「敵を2撃目追いかけてない」): 初撃にも追撃と同じ自動追尾(v0.25.3540)を付ける。
    // 初撃の強制KB(25px)で敵が射程外縁へ出る→2撃目空振り→空振りでは追尾が発火しない、の悪循環を
    // 初撃側の踏み込みで断つ(押した量ぶん詰め直す=次のタップは必ず射程内)。
    if (hasSkill(player, 'slasher') && slashAt.length > 0 && slasherLungeTo !== null) {
      const lungePx = slasherLungePx(slasherLungeTo.dist, SLASHER_FORCE_KB_PX, meleeRange);
      if (lungePx > 0.5) {
        const lungeSpeed = knockbackSpeedFor(lungePx, SLASHER_LUNGE_MS);
        const lTo = slasherLungeTo;
        set(state => ({
          player: {
            ...state.player,
            knockbackVx: lTo.dirX * lungeSpeed,
            knockbackVy: lTo.dirY * lungeSpeed,
            knockbackUntil: now + SLASHER_LUNGE_MS,
            knockbackMs: SLASHER_LUNGE_MS,
          },
        }));
      }
    }

    // 松明・卵などの小物破壊(共通ヘルパ。半径=メレー範囲の円)。
    const propHit = get().breakPropsAlong(pcx, pcy, 1, 0, 0, meleeRange, meleeDamage * 2.5);

    // 分身(サブウェポン): READY(分身なし＆CD明け)で近接攻撃すると、攻撃位置に分身を1体生成(固定)。
    // 以後は分身が自律的に1秒ごと×5秒の近接攻撃を繰り返す(tickShadowClone)。ここに到達するのは通常
    // ナイフのスイングのみ(刀/鞭モードは手前で return 済み)。生成中(ACTIVE)の再スイングは何もしない。
    // v0.25.2541(発注B): 生成本体は共通ヘルパ(主語=actor/owner引数)。ここはオーナー=プレイヤー
    // =従来と1bit同値(枠=store.shadowClone・絵=本人のクラス)。守護霊は fireGhostMeleeSwingSubs
    // から同じ1本を通り、自分の枠(Summon.ghostShadowClone)へ自分のクラス絵で出す。
    spawnShadowCloneOnSwing(get, player, swingOwner, gameTime);

    // 訓練(M0)の近接教習カウンタ(社長台本v0.25.2293)。**敵に当たったスイングだけ**数える
    // (空振り・小物破壊は数えない=「3発当てた」で強制クリティカルが来る体験にする)。
    // 強制クリティカルが出たスイングでクリティカルを解禁する=以後は通常どおり確率で出る。
    // 演習が続くよう、当たった回数だけ数える(クリを解禁して確率クリへ戻す、はしない)。
    if (m0CritLocked && slashAt.length > 0) set(st => ({ m0MeleeHits: st.m0MeleeHits + 1 }));

    return {
      swung: true,
      hit: slashAt.length > 0 || propHit || trapShoves.length > 0 || hasShieldShove,
      finish: finisherHit || bossFinishHit,
      killed: killed.length
    };
  },

  // 分身がその場(clone位置)で同方向に近接攻撃。攻撃範囲/当たり判定/ダメージ/クリティカルは
  // プレイヤーの近接スイングと同じ計算(専用倍率なし)。分身からの攻撃は再生成判定を持たない。
  // v0.25.2541(§2.11追補・発注B): 主語(ghostId 未指定=プレイヤー本体=従来と完全同一 /
  // 指定=守護霊の疑似Player=計測時ビルド+実体の座標/HP)。差分は除外1(演出)/除外4(計測)だけ。
  shadowCloneStrike: (clone, ghostId) => {
    const now = Date.now();
    const { gameTime, enemies } = get();
    const player = combatActorPlayer(ghostId);
    if (!player) return;
    const isGhost = ghostId !== undefined;
    const melee = player.weapons.find(w => w.isMelee);
    const gun = getActiveGun(player);
    const meleeDamage = meleeSwingBaseDamage(melee, player);
    // 処刑(ボス5×/強個体3×)は skillOutgoingDamageMult を通らないので、育成の攻撃力は素ダメージへ
    // 前掛けする(research/GROWTH.md v4・ナイフ/刀/鞭/守護霊と同じ扱い)。主語=分身の持ち主。
    const meleeExecBase = meleeDamage * (player.growthAtkMult ?? 1);
    const meleeCritChance = melee?.critChance ?? 0;
    // 守護霊はコンボ計数を持たないため中立(×1)=GHOST-BUILD-1 ★未決1・刀と同じ扱い。
    const meleeComboMult = skillMeleeComboMult(
      player, gameTime,
      isGhost ? 0 : get().meleeFinishComboCount,
      isGhost ? 0 : get().meleeFinishComboUntil,
    );
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
    const cloneDealt = new Map<string, number>(); // 敵ID→この一撃で入れた生ダメージ(守護霊のヘイト計上用)
    let bossFinishHit = false;
    // research/GHOST_BOSS.md v6: 幻影に**有効打**が入った時の打刻(同時1体なので1枠でよい)。
    let gpHitPatch: { id: string; patch: Partial<Enemy> } | null = null;

    for (const enemy of enemies) {
      if (isReaperFamily(enemy.type) && !isTerminalReaper(enemy)) { survivors.push(enemy); continue; }
      if (isCorpse(enemy)) { survivors.push(enemy); continue; } // KILL吹き飛び(死体・§26-2): 分身の攻撃対象から除外
      const ecx = enemy.x + enemy.width / 2;
      const ecy = enemy.y + enemy.height / 2;
      // ノックバック方向用の中心差分(分身中心→敵)。
      const dx = ecx - ccx;
      const dy = ecy - ccy;
      // 裏ボスのみ帯(AABB)の最近点基準で距離を測る(中心まで寄らず縁で当たる)。
      const dist = enemyMeleeDist(ccx, ccy, enemy);
      if (dist > meleeRange) { survivors.push(enemy); continue; }
      if (walls.length > 0 && segmentBlocked(ccx, ccy, ecx, ecy, walls)) { survivors.push(enemy); continue; }
      // ★research/GHOST_BOSS.md v6(幻影の被弾ゲート・7系統③=分身)。分身の近接もパリィ対象。
      let gpDmgScale = 1; // 対人1/10(社長裁定2026-08-20)。幻影以外は常に1=恒等。
      if (isGuardianPhantom(enemy.type)) {
        const gp = gatePhantomHit(enemy, 0, 'melee', gameTime);
        if (!gp.effects) { survivors.push({ ...enemy, ...gp.patch }); continue; }
        gpHitPatch = { id: enemy.id, patch: gp.patch };
        gpDmgScale = gp.damageScale;
      }
      slashAt.push({ x: ecx, y: ecy });
      cloneHitEnemyIds.push(enemy.id); // スキル 救難信号(§6.10 M33⑦): 分身のヒット敵ID(発動判定/対象選定用)
      const stunned = enemy.stunUntil !== undefined && gameTime < enemy.stunUntil
        && !isBossPostureBroken(enemy, gameTime);
      if (stunned) {
        // v0.25.3171(案A): 「ボスか否か」は usesBossStunnedMelee(=isBossTypeから強個体を除く)。
        if (usesBossStunnedMelee(enemy.type)) {
          bossFinishHit = true;
          const dmg = meleeExecBase * BOSS_MELEE_STUN_MULT;
          damageNumbers.push({ x: ecx, y: enemy.y, value: dmg, crit: true });
          if (!isGhost) recordCritHit('guaranteed', true); // §7-11c(4): meleeExecuteの紫中フィニッシュ(プレイヤー起因のみ)
          cloneDealt.set(enemy.id, (cloneDealt.get(enemy.id) ?? 0) + dmg);
          // §5.21-追補4: スタン中ボスへの5×近接=ボスのフィニッシュ経路そのものなのでclampしない。
          const nh = Math.max(0, enemy.health - dmg);
          if (nh <= 0) killed.push({ enemy, finisher: false });
          else survivors.push({ ...enemy, health: nh, stunUntil: undefined, lastHit: now, liftUntil: now + 420 });
          continue;
        }
        // §6.22 M47仕様①: 分身にもナイフと同じ強個体しきい値を適用(分身だけエリート消し可、を残さない)。
        if (stunnedMeleeOutcome(enemy) === 'heavy') {
          bossFinishHit = true;
          const dmg = meleeExecBase * ELITE_MELEE_STUN_MULT;
          damageNumbers.push({ x: ecx, y: enemy.y, value: dmg, crit: true });
          if (!isGhost) recordCritHit('guaranteed', false); // §7-11c(4): meleeExecuteの紫中フィニッシュ(強個体=非ボス扱い)
          cloneDealt.set(enemy.id, (cloneDealt.get(enemy.id) ?? 0) + dmg);
          const nh = Math.max(0, enemy.health - dmg);
          if (nh <= 0) killed.push({ enemy, finisher: false });
          else survivors.push({ ...enemy, health: nh, stunUntil: undefined, lastHit: now, liftUntil: now + 420 });
          continue;
        }
        killed.push({ enemy, finisher: true });
        continue;
      }
      const crit = Math.random() < meleeHitCritChance(meleeCritChance, player, gameTime, enemy);
      const dmg = meleeDamage * (crit ? skillCritMult(player, CRIT_DAMAGE_MULT) : 1) * skillOutgoingDamageMult(player) * meleeComboMult * gpDmgScale;
      damageNumbers.push({ x: ecx, y: enemy.y, value: dmg, crit });
      if (!isGhost) recordCritHit(crit ? 'rng' : 'none', isBossType(enemy.type)); // §7-11c(4): 近接クリ計測口
      cloneDealt.set(enemy.id, (cloneDealt.get(enemy.id) ?? 0) + dmg);
      const nh = Math.max(0, enemy.health - dmg);
      if (nh <= 0) { killed.push({ enemy, finisher: false }); continue; }
      if (crit) critStunAt.push({ x: ecx, y: ecy });
      // CRIT-UNIFY §9.4(現行漏れの解消): 分身のクリも銃/ナイフ/刀と同じく裏ボスの完全気絶カウントに乗せる。
      // v0.25.3491: bossCritSlowPatch→bossCritStopPatch(isBossType全体をDR込みで扱う。site1と同型)。
      const bossSlow = crit ? bossCritStopPatch(enemy, gameTime, player.stunDurationMult ?? 1) : null; // ボスは半減(v0.25.2422)
      const stunUntil = (crit && !bossSlow && !isBossType(enemy.type) && !isHangedman(enemy.type)) ? gameTime + STUN_DURATION_MS * (player.stunDurationMult ?? 1) : enemy.stunUntil;
      if (knockbackCdReady(enemy, now)) {
        // ★v0.25.3959: 本体の近接(site1)と同じ修正——方向の正規化は中心差分で(密着0割れKB対策)。
        const norm = Math.max(0.001, Math.hypot(dx, dy));
        const falloff = 1 - dist / meleeRange;
        const speed = KNOCKBACK_SPEED * (0.5 + falloff * 0.5); // v0.25.3260: 50px化(3257)を社長指示で撤回=従来値へ
        survivors.push({
          ...enemy, health: nh, lastHit: now, stunUntil,
          knockbackVx: (dx / norm) * speed, knockbackVy: (dy / norm) * speed,
          knockbackUntil: now + KNOCKBACK_DURATION, knockbackImmuneUntil: now + KNOCKBACK_IMMUNE_MS,
          ...(bossSlow ?? {}), // CRIT-UNIFY §9.2バグ修正: bossSlowUntil(半減)が計算のみで未適用だった漏れ
        });
      } else {
        survivors.push({ ...enemy, health: nh, lastHit: now, stunUntil, knockbackVx: 0, knockbackVy: 0, knockbackUntil: now + 100, ...(bossSlow ?? {}) });
      }
    }

    const finisherHit = killed.some(k => k.finisher);
    // スキル: ナイフマスターのコンボ加算(§6.10 M33⑧: 分身のヒットでも貯める。倍率は既に乗っている)。
    // 2026-08-29一本化: 表示コンボへ直接加算(守護霊の分身は除外=二重取り防止・GHOST-BUILD-1 ★未決1)。
    const cloneComboGain = isGhost ? 0 : knifeMasterHitComboGain(player, slashAt.length > 0, 0);
    // §6.21 M46: 分身(サブウェポン)によるダメージ計測。channel='other'(プレイヤー自身の近接カウンター
    // 振りではなくサブウェポンの自律攻撃のため。finisher即死もrecordFinisherKillの対象外=★未決事項参照)。
    const cloneStrikeDamage = damageNumbers.reduce((sum, n) => sum + n.value, 0);
    // 除外4(運用系): 守護霊起因はプレイヤーの計測(botTelemetry)に混ぜない(刀/近接と同じ分離方針)。
    if (!isGhost) recordDamageDealt('other', cloneStrikeDamage);
    set(state => ({
      // §5.21-追補8: 同じ判定(このスイングで近接ダメージを受けた=lastHit===now)でミゲル(ゲート2ボス)
      // 専用の meleeHitAt もスタンプ(gun/爆発は damageEnemy 側の別経路なので対象外)。ミゲル以外は
      // 無害な余剰フィールド(useGameLoop のミゲル専用コントローラだけが参照)。
      // v0.25.2541: 守護霊の分身のヒットは**ヘイトも守護霊**(damageEnemy(hateSource='ghost')と同じ
      // 2種の効き方=対象ボスのバケツ+雑魚のghostHateUntil。分身の近接は damageEnemy を通らない
      // 直接更新経路なので、プレイヤーの meleeAggro と同じ場所でここに書く)。
      enemies: survivors.map(e => e.lastHit === now
        ? {
          ...e,
          // research/GHOST_BOSS.md v6: 幻影の i-frame 打刻を合成する(有効打のときだけ)。
          ...(gpHitPatch !== null && gpHitPatch.id === e.id ? gpHitPatch.patch : {}),
          ...(isGhost
            ? {
              ...(isHateTrackedBossType(e.type) && (cloneDealt.get(e.id) ?? 0) > 0
                ? { hateGhostBuckets: addHateDamage(e.hateGhostBuckets, gameTime, cloneDealt.get(e.id) ?? 0) }
                : {}),
              ...(!isBossType(e.type) ? { ghostHateUntil: gameTime + GHOST_MOB_HATE_MS } : {}),
            }
            : { meleeAggro: true, meleeHitAt: gameTime }),
          // PACING_PUZZLE.md §9-4/§9-7#6(削岩型・§14-2④でloggerも共有): 守護霊(isGhost)/分身
          // どちらの近接武器打撃も対象(isGhost分岐の外=両方に効かせる)。
          ...(isRetreatEligibleType(e.type) ? { drillerRetreatUntil: gameTime + DRILLER_RETREAT_MS } : {}),
        }
        : e),
      gameStats: {
        ...state.gameStats,
        enemiesKilled: state.gameStats.enemiesKilled + killed.length,
        meleeFinishers: state.gameStats.meleeFinishers + killed.reduce((n, k) => n + (k.finisher ? 1 : 0), 0),
        eliteKills: state.gameStats.eliteKills + killed.reduce((n, k) => n + (isScoreElite(k.enemy.type) ? 1 : 0), 0),
        bossKills: state.gameStats.bossKills + killed.reduce((n, k) => n + (isScoreBoss(k.enemy.type) ? 1 : 0), 0),
        damageDealt: state.gameStats.damageDealt + cloneStrikeDamage,
        ...(cloneComboGain > 0
          ? { maxCombo: Math.max(state.gameStats.maxCombo, (state.meleeFinishComboUntil >= gameTime ? state.meleeFinishComboCount : 0) + cloneComboGain) }
          : {}),
      },
      // コンボは**プレイヤーの分身だけ**が書く(守護霊の分身で本人のコンボが伸びると二重取り)。
      ...(cloneComboGain > 0 ? {
        meleeFinishComboCount: (state.meleeFinishComboUntil >= gameTime ? state.meleeFinishComboCount : 0) + cloneComboGain,
        meleeFinishComboUntil: gameTime + meleeFinishComboWindowMs(state.player),
      } : {}),
      // hitstopはtriggerFinishImpact側でCD込みで一括管理(M21・§5.22)。ここでの個別設定は廃止。
    }));

    // 演出はプレイヤーの近接と同じ経路(スラッシュ/ダメージ数字/キル報酬)。分身位置にも一閃を出す。
    for (const s of slashAt) get().spawnSlash(s.x, s.y);
    for (const c of damageNumbers) get().spawnDamageNumber(c.x, c.y, c.value, c.crit);
    for (const c of critStunAt) get().spawnRing(c.x, c.y, 6, 30, 'rgba(250, 204, 21, 0.9)', 2, 260);
    // CRIT-UNIFY §9.4: 分身のクリで完全気絶が発動したら他の近接経路と同じ紫FX+STUN!コールアウト。
    grantMeleeKillRewards(get, killed, player, gun);
    get().spawnSlash(ccx, ccy, 'rgba(226,232,240,0.95)');
    get().spawnRing(ccx, ccy, 6, 40, 'rgba(203,213,225,0.7)', 3, 240);
    // 除外1(演出)→v0.25.2582試験改定: 守護霊起因でも停止/スロー/寄りズームを出す(?ghostzoom=0で従来へ)。
    if ((finisherHit || bossFinishHit) && (!isGhost || GHOST_ZOOM_TRIAL_ENABLED)) {
      const [ztx, zty] = finishZoomTargetOf(killed);
      get().triggerFinishImpact(ztx, zty);
    }
    // プレイヤーの装備スキル効果を分身の攻撃にも適用(リーパー波及/カウンターマスター/ヘビーガンナー)。
    applyMeleeFinishSkillSpread(get, player, finisherHit, ccx, ccy, meleeRange, meleeDamage, meleeFinisherAt(killed));
    // ヘビーガンナー: 2体以上ヒットで爆発範囲バフ。**プレイヤーの分身だけ**が本人のバフを積む
    // (守護霊の分身で本人のバフ窓が伸びる=主語をまたぐ横取り。N HITSバナーもプレイヤー頭上=除外1)。
    if (!isGhost) get().registerMultiHit(slashAt.length);
    if (hasSkill(player, 'counter-master') && slashAt.length > 0) counterMasterKnockback(get, ccx, ccy, counterMasterKbScale(player));
    // スキル: 救難信号(§6.10 M33⑦: 分身のヒットでも発動判定。基本近接/刀と同条件・索敵起点は分身中心)。
    applyRescueSignalProc(get, player, meleeDamage, cloneHitEnemyIds, ccx, ccy);
    // 吸血覚醒(Lv3・v0.25.3300): 分身の近接ヒットでも1%回復(同じ動作を持つ全員に付ける)。
    if (!isGhost) applyVampireMeleeHeal(get, player, cloneHitEnemyIds, ccx, ccy);
  },

  // ★O-3b-2(SAME_ARENA.md §3-d-4「そのままの仕様で」): 幻影の分身は enemies ではなく
  // **プレイヤーへ**近接する。宛先が「enemiesを走査する」既存 shadowCloneStrike のままだと、
  // 幻影自身が enemies の一員なので**自分だけが唯一の候補になる**(設置系で踏んだ自爆と同型)。
  // 器(生成/寿命/攻撃間隔/最大1体)は共通のまま、**当たり判定だけ**プレイヤー1点固定にする。
  // 紫の文法(SAME_ARENA §3-d-4「幻影のサブは紫の文法」)に合わせ、他の幻影サブ
  // (ドッグ/タレット/地雷)と同じ簡易ダメージ扱いにする: クリ無し・対人体勢チップ無し・
  // カウンター不可(判定自体が近接カウンターの窓を一切見ない)・i-frameは通常どおり
  // (damagePlayer へ damagerType を渡さない=近接i-frameバイパスの対象に**含めない**)。
  phantomShadowCloneStrike: (clone, phantomId) => {
    const st = get();
    const actor = combatActorPlayer(phantomId);
    if (!actor) return;
    const { player } = st;
    const ccx = clone.x + clone.width / 2;
    const ccy = clone.y + clone.height / 2;
    const pcx = player.x + player.width / 2;
    const pcy = player.y + player.height / 2;
    // 射程は**既存の分身と同じ式**(huntingMeleeRadius)。標的だけプレイヤー1点にする。
    const meleeRange = huntingMeleeRadius(actor);
    if (Math.hypot(pcx - ccx, pcy - ccy) > meleeRange) return;
    const walls = meleeWallsAround(get, ccx, ccy, meleeRange);
    if (walls.length > 0 && segmentBlocked(ccx, ccy, pcx, pcy, walls)) return;
    const melee = actor.weapons.find(w => w.isMelee);
    const base = meleeSwingBaseDamage(melee, actor);
    // O-2(写すな、共通化しろ): phantomAtkMults と同じ二重掛け防止——combatActorPlayer が返す
    // actor.growthAtkMult は記録スナップショットの値なので1へ潰し、**現在の育成**
    // (GROWTH.md v4「幻影も反映」)を呼び出し側の掛け算として別途乗せる。
    const outgoing = skillOutgoingDamageMult({ ...actor, growthAtkMult: 1 })
      * (actor.equipBonus?.damageMult ?? 1) * (player.growthAtkMult ?? 1);
    const dmg = Math.max(1, Math.round(base * outgoing * PVP_DAMAGE_SCALE));
    const hpBefore = player.health;
    get().damagePlayer(dmg, `${phantomDisplayLabel()}の分身`, ccx, ccy);
    const landed = get().player.health < hpBefore;
    // 紫(PHANTOM_SUB_TINT系)の斬撃+リング。着弾時のみバーストを足す(ドッグ被弾の前例と同型)。
    get().spawnSlash(ccx, ccy, 'rgba(192,132,252,0.95)');
    get().spawnRing(ccx, ccy, 6, 40, 'rgba(192,132,252,0.7)', 3, 240);
    if (landed) get().spawnBurst(pcx, pcy, '#c084fc', 6);
  },

  // 毎フレーム: 分身の自動近接(1秒ごと×最大5回)を進め、寿命(5秒)到達 or 回数上限で消滅。
  // v0.25.2541: 主語ごと(ghostId 未指定=プレイヤーの枠=従来と完全同一)。寿命・攻撃間隔・
  // 回数上限は同じ定数=ゴースト用の別ルールは無い。
  // ★O-3b-2: 主語が幻影(guardian-phantom)なら phantomShadowCloneStrike(標的=プレイヤー)を、
  // それ以外(プレイヤー/守護霊=従来)は shadowCloneStrike(標的=enemies)を呼ぶ。
  tickShadowClone: (ghostId) => {
    const clone = shadowCloneOf(get(), ghostId);
    if (!clone) return;
    const { gameTime } = get();
    if (clone.attacksDone >= SHADOW_CLONE_MAX_ATTACKS || gameTime >= clone.spawnedAt + SHADOW_CLONE_DURATION_MS) {
      get().expireShadowClone(ghostId);
      return;
    }
    if (gameTime >= clone.nextAttackAt) {
      const isPhantom = ghostId !== undefined && get().enemies.some(e => e.id === ghostId && e.type === 'guardian-phantom');
      if (isPhantom) get().phantomShadowCloneStrike(clone, ghostId as string);
      else get().shadowCloneStrike(clone, ghostId);
      const after = shadowCloneOf(get(), ghostId);
      if (after) {
        setActorShadowClone(ghostId, {
          ...after,
          attacksDone: after.attacksDone + 1,
          nextAttackAt: after.nextAttackAt + SHADOW_CLONE_ATTACK_INTERVAL_MS,
          swingAt: Date.now(), // 斬撃モーション(本体と同じナイフ振り)の起点(描画のみ)
        });
      }
    }
  },

  expireShadowClone: (ghostId) => {
    if (!shadowCloneOf(get(), ghostId)) return;
    // Lvは主語自身のビルド(プレイヤー=本人 / 守護霊=計測時ビルド)。CDも主語自身の帳簿へ。
    const actor = combatActorPlayer(ghostId);
    const level = Math.max(1, Math.min(3, (actor ?? get().player).subWeaponLevels['shadow-clone'] ?? 1));
    setActorShadowClone(ghostId, null);
    setActorSubWeaponCooldown(ghostId, 'shadow-clone', get().gameTime + SHADOW_CLONE_COOLDOWN_MS_BY_LEVEL[level]);
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

  spawnGroundFire: (x, y, ghostId, radius) => {
    set(state => ({
      groundFires: [...state.groundFires, {
        id: `gfire-${groundFireSeq++}`, x, y, createdAt: state.gameTime,
        // v0.25.2563: 置いた主語(未指定=プレイヤー=従来と1bit同じ)。
        ...(ghostId !== undefined ? { ownerGhostId: ghostId } : {}),
        // SKILL_BUILD_REDESIGN.md §28(B7): 延焼弾(incendiary-round)Lv3の炎床(大)専用の半径上書き。
        // 未指定=molotovの半径のまま(従来と1bit同じ)。
        ...(radius !== undefined ? { radius } : {}),
      }],
    }));
  },

  // ジブリルの紫の単発火を1つ設置(0.7秒予告→2秒有効)。判定/寿命/被弾処理は useGameLoop の tick が担う。
  spawnBossFire: (x, y, spawnAt, activateAt, expireAt) => {
    set(state => ({
      bossFires: [...state.bossFires, { id: `bfire-${bossFireSeq++}`, x, y, spawnAt, activateAt, expireAt }],
    }));
  },
  setBossFires: (fires) => set({ bossFires: fires }),

  // §6.28-19: 結晶の槍を1本設置(見た目のみ・非ダメージ)。2秒後に tickAcrasielSpears が円形AoEへ起爆する。
  spawnAcrasielSpear: (x, y, angle, bornAt, fireAt, damage, enemyId) => {
    set(state => ({
      acrasielSpears: [...state.acrasielSpears, { id: `aspear-${acrasielSpearSeq++}`, x, y, angle, bornAt, fireAt, damage, enemyId }],
    }));
  },
  setAcrasielSpears: (spears) => set({ acrasielSpears: spears }),

  // 毎フレーム: 寿命切れ(3秒)の火を回収し、生存中の火に重なっている敵へ0.5秒スロットルでDoT(5dmg)を与える。
  // プレイヤーは対象外(自分の火なので無敵=そもそも判定しない)。既存の damageEnemy を再利用するので
  // キル報酬/演出/統計は他の攻撃経路と同じに揃う(スロー演出は damageEnemy 側に無いのでここでも発生しない)。
  tickGroundFires: () => {
    const { groundFires, gameTime, enemies } = get();
    if (groundFires.length === 0) return;
    const aliveFires = groundFires.filter(f => gameTime < f.createdAt + MOLOTOV_FIRE_LIFETIME_MS);
    const hits: { id: string; x: number; y: number; dmg: number }[] = [];
    // v0.25.2563(§2.11追補): 倍率の主語は**置いた本人**(プレイヤー / 守護霊=計測時ビルドの疑似Player)。
    // 世界に置かれた火の配列は1本のまま(センサー地雷と同じ流儀)で、主語ごとに1パスずつ判定する。
    // 守護霊の火が1つも無い通常時は ownerIds=[undefined] の1パス=従来と完全に同じ計算。
    const ownerIds = [...new Set(aliveFires.map(f => f.ownerGhostId))];
    const alreadyHit = new Set<string>(); // 主語をまたいでも二重取りしない(既存の「重なっても1回」と同じ)
    for (const ownerId of ownerIds) {
      const subject = (ownerId === undefined ? get().player : combatActorPlayer(ownerId)) ?? get().player;
      const ownerFires = ownerIds.length === 1 ? aliveFires : aliveFires.filter(f => f.ownerGhostId === ownerId);
      if (ownerFires.length === 0) continue;
      // スキル: エクスプローダー(§6.10 M33④) = molotovの火も「全ての爆発」扱いで半径・ダメージ ×倍率。
      // スキル: バーサーカー等(§6.10 M33②) = skillOutgoingDamageMult をDoTダメージに乗算(四捨五入)。
      const gfExMult = skillExplosionMult(subject);
      const gfDotDmg = Math.max(1, Math.round(MOLOTOV_DOT_DAMAGE * gfExMult * skillOutgoingDamageMult(subject)));
      for (const e of enemies) {
        if (alreadyHit.has(e.id)) continue;
        if (gameTime - (e.lastFireHitAt ?? -Infinity) < MOLOTOV_DOT_INTERVAL_MS) continue;
        const ecx = e.x + e.width / 2;
        const ecy = e.y + e.height / 2;
        if (isEnemyInGroundFire(ecx, ecy, ownerFires, MOLOTOV_FIRE_RADIUS, gfExMult)) {
          alreadyHit.add(e.id);
          hits.push({ id: e.id, x: ecx, y: ecy, dmg: gfDotDmg });
        }
      }
    }
    if (aliveFires.length !== groundFires.length || hits.length > 0) {
      // 社長指示v0.25.3280「一度踏むと延焼にする」: 即時ダメージ(damageEnemy)を廃止し、触れた敵に
      // 延焼(burnUntil/burnDpsTick)を付ける。刻むのは既存のtickBurningEnemies(500ms)=赤点滅も
      // ダメージ数字もそちらが出す。既に強い延焼が付いていたら下書きしない(Math.max)。
      // 踏み続けている間はlastFireHitAtスロットル(500ms)ごとに窓が更新される=離れてから3秒燃える。
      set(state => ({
        groundFires: aliveFires,
        enemies: hits.length > 0
          ? state.enemies.map(e => {
              const h = hits.find(hh => hh.id === e.id);
              if (!h) return e;
              return {
                ...e,
                lastFireHitAt: gameTime,
                burnUntil: Math.max(e.burnUntil ?? 0, gameTime + MOLOTOV_IGNITE_BURN_MS),
                burnDpsTick: Math.max(e.burnDpsTick ?? 0, h.dmg),
              };
            })
          : state.enemies,
      }));
    }
  },

  // SKILL_BUILD_REDESIGN.md §28(B7) スキル: 延焼弾(incendiary-round)の燃焼DoT。命中した敵個体
  // (burnUntil/burnDpsTick)を250ms(INCENDIARY_BURN_TICK_MS=molotovのDOT_INTERVALと揃えた既存踏襲)
  // ごとに消化する。既存のdamageEnemyを再利用=キル報酬/演出/統計は他の攻撃経路と揃う。
  tickBurningEnemies: () => {
    const { enemies, gameTime } = get();
    // 社長指示v0.25.3300 延焼弾覚醒(Lv3): 延焼が敵同士の接触で移る(感染)。燃焼tickと同じ250ms間隔で
    // だけ判定する(燃焼中×全敵の走査をフレーム毎に回さない=有界)。感染は延焼弾Lvの燃焼を新規付与。
    const incLv = skillLevel(get().player, 'incendiary-round');
    if (incLv >= 3 && Math.abs(gameTime - burnSpreadLastAt) >= INCENDIARY_BURN_TICK_MS) {
      burnSpreadLastAt = gameTime;
      const burning = enemies.filter(e => e.burnUntil !== undefined && gameTime < e.burnUntil && !isCorpse(e));
      if (burning.length > 0) {
        const burn = incendiaryBurnParams(incLv);
        const infected: string[] = [];
        for (const t of enemies) {
          if (t.burnUntil !== undefined && gameTime < t.burnUntil) continue; // 既に燃えている
          if (isCorpse(t) || (isReaperFamily(t.type) && !isTerminalReaper(t))) continue;
          for (const b of burning) {
            if (b.id === t.id) continue;
            if (!rectsOverlap(
              { x: b.x - INCENDIARY_SPREAD_PAD_PX, y: b.y - INCENDIARY_SPREAD_PAD_PX, width: b.width + INCENDIARY_SPREAD_PAD_PX * 2, height: b.height + INCENDIARY_SPREAD_PAD_PX * 2 },
              t,
            )) continue;
            infected.push(t.id);
            break;
          }
        }
        if (infected.length > 0) {
          const iSet = new Set(infected);
          set(state => ({
            enemies: state.enemies.map(e => iSet.has(e.id) ? { ...e, burnUntil: gameTime + burn.durationMs, burnDpsTick: burn.dps } : e),
          }));
        }
      }
    }
    const hits: { id: string; x: number; y: number; dmg: number }[] = [];
    for (const e of enemies) {
      if (e.burnUntil === undefined || gameTime >= e.burnUntil) continue;
      if (gameTime - (e.lastBurnTickAt ?? -Infinity) < INCENDIARY_BURN_TICK_MS) continue;
      const dps = e.burnDpsTick ?? 0;
      if (dps <= 0) continue;
      hits.push({ id: e.id, x: e.x + e.width / 2, y: e.y, dmg: dps });
    }
    if (hits.length === 0) return;
    set(state => ({
      enemies: state.enemies.map(e => hits.some(h => h.id === e.id) ? { ...e, lastBurnTickAt: gameTime } : e),
    }));
    for (const h of hits) {
      get().damageEnemy(h.id, h.dmg);
      get().spawnDamageNumber(h.x, h.y, h.dmg);
    }
  },

  // SKILL_BUILD_REDESIGN.md §28(B7) スキル: 血の履帯(blood-treads) = 移動軌跡に棘を残す。
  // groundFires(molotov)と同じ「set()で置く→毎フレームtickで寿命切れ回収+DoT」の流儀。
  // 判定を持つ床=分類①(判定に絵を揃える・大きくしない・§28-2)。プレイヤー専用。
  spawnBloodSpike: (x, y) => {
    set(state => ({
      bloodSpikes: [...state.bloodSpikes, { id: `bspike-${bloodSpikeSeq++}`, x, y, createdAt: state.gameTime }],
    }));
  },
  tickBloodSpikes: () => {
    const { bloodSpikes, gameTime, enemies, player } = get();
    if (bloodSpikes.length === 0) return;
    const lv = skillLevel(player, 'blood-treads');
    const { durationMs, dps } = bloodTreadsParams(lv);
    const aliveSpikes = bloodSpikes.filter(s => gameTime < s.createdAt + durationMs);
    const hits: { id: string; x: number; y: number; dmg: number }[] = [];
    if (dps > 0 && aliveSpikes.length > 0) {
      const r2 = BLOOD_TREADS_RADIUS_PX * BLOOD_TREADS_RADIUS_PX;
      for (const e of enemies) {
        if (gameTime - (e.lastSpikeHitAt ?? -Infinity) < BLOOD_TREADS_TICK_MS) continue;
        const ecx = e.x + e.width / 2;
        const ecy = e.y + e.height / 2;
        let inSpike = false;
        for (const s of aliveSpikes) {
          const dx = ecx - s.x, dy = ecy - s.y;
          if (dx * dx + dy * dy <= r2) { inSpike = true; break; }
        }
        if (inSpike) hits.push({ id: e.id, x: ecx, y: ecy, dmg: dps });
      }
    }
    if (aliveSpikes.length !== bloodSpikes.length || hits.length > 0) {
      // 社長指示v0.25.3300 血の履帯覚醒(Lv3): 棘に触れた敵へ鈍足も付与(アイスショットLv1相当=
      // 40%×2秒・既存のiceSlowチャンネルへ合流。ボスはbossSlowMult側で効果半分の既存規格)。
      const spikeSlow = lv >= 3 ? iceShotSlowParams(1) : null;
      set(state => ({
        bloodSpikes: aliveSpikes,
        enemies: hits.length > 0
          ? state.enemies.map(e => hits.some(h => h.id === e.id)
              ? { ...e, lastSpikeHitAt: gameTime, ...(spikeSlow ? { iceSlowUntil: gameTime + spikeSlow.ms, iceSlowPct: isBossType(e.type) ? spikeSlow.pct * ICE_SHOT_BOSS_EFFECT_MULT : spikeSlow.pct } : {}) }
              : e)
          : state.enemies,
      }));
    }
    for (const h of hits) {
      get().damageEnemy(h.id, h.dmg);
      get().spawnDamageNumber(h.x, h.y, h.dmg);
    }
  },

  // SKILL_BUILD_REDESIGN.md §28(B7) スキル: グラビティショット(gravity-shot) = キル時に一定確率で
  // 爆縮(引き寄せ120px/s×0.4s)を発生させる。判定なし(ダメージ無し・純粋な引き寄せ)=絵は分類②
  // (派手に)。alchemyのレア吸引(summonUtils.ts)と同じknockbackVx/Vyベースの吸引を流用。
  spawnGravityWell: (x, y, radius, durationMs) => {
    set(state => ({
      gravityWells: [...state.gravityWells, { id: `gwell-${gravityWellSeq++}`, x, y, radius, createdAt: state.gameTime, ...(durationMs !== undefined ? { durationMs } : {}) }],
    }));
  },
  tickGravityWells: () => {
    const { gravityWells, gameTime, enemies } = get();
    if (gravityWells.length === 0) return;
    // 覚醒(Lv3・v0.25.3300)の渦は durationMs=2倍で置かれる(未指定=従来0.4s)。
    const aliveWells = gravityWells.filter(w => gameTime < w.createdAt + (w.durationMs ?? GRAVITY_SHOT_PULL_MS));
    if (aliveWells.length !== gravityWells.length) set({ gravityWells: aliveWells });
    if (aliveWells.length === 0) return;
    let changed = false;
    const nextEnemies = enemies.map(e => {
      if (isCorpse(e) || (isReaperFamily(e.type) && !isTerminalReaper(e))) return e;
      const ecx = e.x + e.width / 2, ecy = e.y + e.height / 2;
      let best: GravityWell | null = null;
      let bestD2 = Infinity;
      for (const w of aliveWells) {
        const dx = w.x - ecx, dy = w.y - ecy;
        const d2 = dx * dx + dy * dy;
        if (d2 <= w.radius * w.radius && d2 < bestD2) { bestD2 = d2; best = w; }
      }
      if (!best) return e;
      // 社長指示v0.25.3280: ボスは吸引の代わりに移動半減(bossSlowMultが読む窓を毎フレーム上書き。
      // 渦から出る/渦が消えると~150msで切れる)。吸引の書き込みはボスには元々効かない(押し道具ガード)
      // ので、ボスは減速だけにして意味の無いknockback書き換えをやめる。
      if (isBossType(e.type)) {
        changed = true;
        return { ...e, gravitySlowUntil: gameTime + GRAVITY_SHOT_BOSS_SLOW_REFRESH_MS };
      }
      const dist = Math.max(0.001, Math.sqrt(bestD2));
      changed = true;
      return {
        ...e,
        knockbackVx: ((best.x - ecx) / dist) * GRAVITY_SHOT_PULL_SPEED,
        knockbackVy: ((best.y - ecy) / dist) * GRAVITY_SHOT_PULL_SPEED,
        // 社長裁定v0.25.3279(案A): 旧+120msだと消費側の減衰(残り÷KNOCKBACK_DURATION)が常に
        // ×0.43掛かり、実効≈51px/s(仕様§16-5の120px/sと乖離)だった。毎フレーム書き直す前提で
        // フル窓を与えると減衰≈1=実効が仕様どおりになり、渦が消えた後は自然に減衰する尾が付く。
        // ★時計はDate.now(社長報告2026-08-29「引き寄せてる感じがしない。ほんと？」の真因):
        // knockbackUntil の消費側(updateEnemies)は Date.now 基準。ここだけ gameTime(数十万ms)で
        // 書いていたため常に「期限切れ」=吸引は一度も1pxも動いていなかった。
        knockbackUntil: Date.now() + KNOCKBACK_DURATION,
      };
    });
    if (changed) set({ enemies: nextEnemies });
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
      // 社長指示v0.25.3300 救難信号覚醒(Lv3): 着弾のたび、さらに20%の確率で連続してもう1体現れる
      // (成立が続く限り数珠つなぎ=各回20%の抽選。対象は従来と同じハンドガン射程内の生存敵)。
      const chainP = get().player;
      if (skillLevel(chainP, 'rescue-signal') >= 3 && Math.random() < RESCUE_SIGNAL_AWAKEN_CHAIN_CHANCE) {
        const pcx = chainP.x + chainP.width / 2, pcy = chainP.y + chainP.height / 2;
        const chainTarget = selectRescueSignalTarget(a.targetEnemyId, get().enemies, pcx, pcy, RANGE_BY_CATEGORY.handgun);
        if (chainTarget) {
          const klass = pickRescueSignalAllyClass(chainP.characterClass);
          const ld = chainP.lastDirection;
          const lm = ld ? Math.hypot(ld.x, ld.y) : 0;
          const dir = lm > 0.01 ? { x: ld!.x / lm, y: ld!.y / lm } : { x: 0, y: 1 };
          get().spawnRescueAlly(
            klass,
            pcx - dir.x * RESCUE_ALLY_SPAWN_DIST, pcy - dir.y * RESCUE_ALLY_SPAWN_DIST,
            { id: chainTarget.id, x: chainTarget.x + chainTarget.width / 2, y: chainTarget.y + chainTarget.height / 2, footY: chainTarget.y + chainTarget.height },
            a.damage,
          );
        }
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
      if (rollBomberScatter(get().player)) { // v0.25.3306: 確率発動(30/40/50%)
        // ボマー覚醒(Lv3・v0.25.3300): ミニ手榴弾4つ(通常3つ)。
        for (const mini of buildBomberMinis(cx, cy, `bag-${b.id}`, undefined, undefined, bomberMiniCount(get().player))) get().addProjectile(mini);
        get().spawnBurst(cx, cy, '#fbbf24', 8);
      }
      get().spawnRing(cx, cy, 12, radius, 'rgba(255,170,70,0.9)', 5, 400);
      get().spawnBurst(cx, cy, '#ffae46', 22);
      get().spawnGlow(cx, cy, snapGlowRadius(radius * 0.55), 'rgba(255,150,60,', 400); // ★段へ丸める(v0.25.2808)
      // 半径内の敵に falloff ダメージ+押し出し(中心=b.fromX/Yではなく着弾点基準)。
      for (const e of get().enemies) {
        if (isReaperFamily(e.type) && !isTerminalReaper(e)) continue;
        if (isCorpse(e)) continue; // KILL吹き飛び(死体・§26-2): 救急鞄爆発の対象から除外
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
        // PACING_PUZZLE.md §9-7#1(ノックバック免除): driller はpumpkinと同格=isPumpkinTier経由で共有。
        const knockbackImmune = e.type === 'giantbat' || isPumpkinTier(e.type)
          || isReaperFamily(e.type) || isHiddenBoss(e.type);
        if (!killed && !knockbackImmune) {
          const nrm = Math.max(0.001, dist);
          // エクスプローダー覚醒(Lv3): 爆発KB距離×1.5(v0.25.3300)。
          const bagKb = skillExplosionKbMult(get().player);
          get().knockbackEnemy(e.id, dx / nrm, dy / nrm, FIRST_AID_KIT_THROW_KNOCKBACK_MULT * bagKb, 3 * bagKb);
        }
        if (killed) {
          get().dropEnemyXp(e, ecx, ecy, `pickup-xp-first-aid-kit-${b.id}-${e.id}`);
        }
      }
    }
  },

  performKatanaStrike: (targetIds, damageMult, allowFinisher, ghostId) => {
    const now = Date.now();
    const { gameTime, enemies } = get();
    // v0.25.2518(裁定2): 主語(オーナー)。ghostId 未指定=プレイヤー本体(従来と完全同一)。
    // 指定時は守護霊の疑似Player=計測時ビルド(スキル/装備/クリ率/刀Lv)+ゴースト実体の座標/HP。
    const player = combatActorPlayer(ghostId);
    if (!player) return { hit: false, finish: false, killed: 0 };
    const isGhost = ghostId !== undefined;
    if (!isKatanaMode(player) || targetIds.length === 0) {
      return { hit: false, finish: false, killed: 0 };
    }

    const gun = getActiveGun(player); // ammo scavenge stays gun-family based
    const baseDamage = KATANA_DAMAGE_BY_LEVEL[katanaLevel(player)];
    // 処刑(ボス5×/強個体3×/致命の一撃)は skillOutgoingDamageMult を通らないので、育成の攻撃力は
    // 素ダメージへ前掛けする(research/GROWTH.md v4・ナイフ/分身/鞭/守護霊と同じ扱い)。
    const katanaExecBase = baseDamage * damageMult * (player.growthAtkMult ?? 1);
    const pcx = player.x + player.width / 2;
    const pcy = player.y + player.height / 2;
    // スキル: 近接コンボ倍率(ナイフマスター×コンボマスター)。
    // 守護霊はコンボ計数を持たないため中立(×1)にする=GHOST-BUILD-1の★未決1と同じ扱い
    // (本人のコンボをゴーストへ流すと二重取りになる)。プレイヤーは従来どおり店の計数を読む。
    const meleeComboMult = skillMeleeComboMult(
      player, gameTime,
      isGhost ? 0 : get().meleeFinishComboCount,
      isGhost ? 0 : get().meleeFinishComboUntil,
    );
    const killed: { enemy: Enemy; finisher: boolean }[] = [];
    let bossFinishHit = false;
    const survivors: Enemy[] = [];
    const damageNumbers: { x: number; y: number; value: number; crit: boolean }[] = [];
    const slashAt: { x: number; y: number }[] = [];
    const critStunAt: { x: number; y: number }[] = [];
    const katanaBossFullStunHits: { x: number; y: number }[] = []; // GAME_AUDIT #17: 刀クリで完全気絶が発動した位置
    const mimirLaserBreakHits: { x: number; y: number }[] = []; // §6.33: レーザー中断位置(カウンター成立FX用)
    const katanaBossFatalHits: { x: number; y: number; labelY: number; w: number; h: number }[] = []; // w/h=killFx流用(v0.25.3703)
    const katanaHitEnemyIds: string[] = []; // スキル 救難信号: 一閃(allowFinisher時)でヒットした敵ID(発動判定/対象選定用)
    // research/GHOST_BOSS.md v6: 幻影に**有効打**が入った時の打刻(同時1体なので1枠でよい)。
    let gpHitPatch: { id: string; patch: Partial<Enemy> } | null = null;

    for (const enemy of enemies) {
      // ジャンプ攻撃中(空中)はあらゆる近接の当たり判定を外す(=無敵。盾は敵AI側で別処理)。
      if (enemy.aiPhase === 'jump') { survivors.push(enemy); continue; }
      if (!targetIds.includes(enemy.id) || (isReaperFamily(enemy.type) && !isTerminalReaper(enemy)) || isCorpse(enemy)) {
        // KILL吹き飛び(死体・§26-2): 死体は標的から除外(targetIds選定側で既に除いてあるが二重ガード)
        survivors.push(enemy);
        continue;
      }
      const ecx = enemy.x + enemy.width / 2;
      const ecy = enemy.y + enemy.height / 2;
      // ★research/GHOST_BOSS.md v6(幻影の被弾ゲート・7系統④=刀)。オート斬撃も一閃もパリィ対象。
      let gpDmgScale = 1; // 対人1/10(社長裁定2026-08-20)。幻影以外は常に1=恒等。
      if (isGuardianPhantom(enemy.type)) {
        const gp = gatePhantomHit(enemy, 0, 'melee', gameTime);
        if (!gp.effects) {
          // ★SAME_ARENA §9: 幻影のパリィ成立=**プレイヤー本人**の刀だけ体勢counter削り(守護霊の刀は対象外)。
          if (gp.parried && !isGhost) set(st => ({ player: { ...st.player, ...playerPvpChipPatch(st.player, 'counter', st.gameTime) } }));
          survivors.push({ ...enemy, ...gp.patch }); continue;
        }
        gpHitPatch = { id: enemy.id, patch: gp.patch };
        gpDmgScale = gp.damageScale;
      }
      slashAt.push({ x: ecx, y: ecy });
      katanaHitEnemyIds.push(enemy.id);
      const stunned = enemy.stunUntil !== undefined && gameTime < enemy.stunUntil
        && !(isGhost && isBossPostureBroken(enemy, gameTime));
      // 近接フィニッシュ(スタン敵の即時処刑/ボス5×)は一閃ダッシュのみ。
      // オート斬撃(allowFinisher=false)はスタン敵にも通常ダメージだけ与え、
      // スタンは消さない(一閃で仕留める余地を残す)。
      if (stunned && allowFinisher) {
        // v0.25.3171(案A): 強個体(pumpkin/lab-zombie-3)はボス枝へ落とさない。
        if (usesBossStunnedMelee(enemy.type)) {
          // Same boss rule as the knife: 5× damage, no execute。ただし裏ボスの完全気絶(紫)中は
          // 気絶を解除せずタイマー切れまで5×を“し放題”(社長指示)。通常の気絶は従来どおり1発で解除。
          const fatal = !isGhost ? applyBrokenMeleeFatal(enemy, katanaExecBase * gpDmgScale, gameTime) : null;
          bossFinishHit = true;
          const dmg = fatal?.damage ?? katanaExecBase * gpDmgScale * BOSS_MELEE_STUN_MULT;
          if (fatal) katanaBossFatalHits.push({ x: ecx, y: ecy, labelY: enemy.y - 6, w: enemy.width, h: enemy.height });
          damageNumbers.push({ x: ecx, y: enemy.y, value: dmg, crit: true });
          if (!isGhost) recordCritHit('guaranteed', true); // §7-11c(4): meleeExecuteの紫中フィニッシュ(プレイヤー起因のみ)
          // §5.21-追補4: スタン中ボスへの5×一閃=ボスのフィニッシュ経路そのものなのでclampしない。
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
              ...(fatal?.patch ?? {}),
            });
          }
          continue;
        }
        // §6.22 M47仕様①: 強個体はHP50%以上だと即死せず近接ダメージ×3+気絶解除。
        if (stunnedMeleeOutcome(enemy) === 'heavy') {
          bossFinishHit = true;
          const dmg = katanaExecBase * gpDmgScale * ELITE_MELEE_STUN_MULT;
          // v0.25.3703: 強個体のheavy=致命の一撃(E-1)なので演出系(致命演出+CD無視+KILL跳びつき)へ載せる。
          if (!isGhost) katanaBossFatalHits.push({ x: ecx, y: ecy, labelY: enemy.y - 6, w: enemy.width, h: enemy.height });
          damageNumbers.push({ x: ecx, y: enemy.y, value: dmg, crit: true });
          if (!isGhost) recordCritHit('guaranteed', false); // §7-11c(4): meleeExecuteの紫中フィニッシュ(強個体=非ボス扱い)
          const newHealth = Math.max(0, enemy.health - dmg);
          if (newHealth <= 0) {
            killed.push({ enemy, finisher: false });
          } else {
            survivors.push({ ...enemy, health: newHealth, stunUntil: undefined, lastHit: now, liftUntil: now + 420 });
          }
          continue;
        }
        killed.push({ enemy, finisher: true }); // 通常ナイフと同じ即時フィニッシュ
        // §6.21 M46: 気絶中の敵への近接即死(刀)。除外4(運用系)= 守護霊起因はプレイヤーの計測に
        // 混ぜない(v0.25.2525で他の計測=recordDamageDealt/recordMeleeSwingと揃えた。プレイヤーは不変)。
        if (!isGhost) recordFinisherKill();
        continue;
      }
      // 刀のクリ率 = レベル別基礎(10/20/30%) + プレイヤーのレベルアップ クリティカル率アップ
      // + トラップ拘束 + 弱点(近接+10%) + 弁慶 + ウォームアップ + ナイフマスター
      // (合成はmeleeHitCritChanceが唯一の出どころ=v0.25.2514で抽出・値は不変)。
      const crit = Math.random() <
        meleeHitCritChance(KATANA_CRIT_CHANCE_BY_LEVEL[katanaLevel(player)], player, gameTime, enemy);
      // ダッシュの3倍は基礎値側に掛け、クリ倍率は既存近接どおり最後に掛ける
      // (既存ダメージ計算: dmg = base * (crit ? CRIT_DAMAGE_MULT : 1) に揃えた)。
      let dmg = baseDamage * damageMult * (crit ? skillCritMult(player, CRIT_DAMAGE_MULT) : 1) * skillOutgoingDamageMult(player) * meleeComboMult * gpDmgScale;
      // ★SAME_ARENA §9(検収監査 重大③): 刀にも致命(×5+最大HP25%)とmelee削り(site1と同型)。
      // 本人由来のみ=守護霊の刀(isGhost)は削らない・致命も出さない。
      let pvpMeleePatch: Partial<Enemy> = {};
      if (isGuardianPhantom(enemy.type) && !isGhost) {
        if (isPvpFatalTarget(enemy.pvpPosture, gameTime)) {
          dmg = pvpFatalDamage(dmg, enemy.maxHealth);
          pvpMeleePatch = { pvpPosture: pvpAfterFatal(enemy.pvpPosture, gameTime) };
          katanaBossFatalHits.push({ x: ecx, y: ecy, labelY: enemy.y - 6, w: enemy.width, h: enemy.height });
          bossFinishHit = true; // ★社長指示2026-08-27「幻影戦の致命もKILL演出(ズーム)」
        } else {
          const r = chipPvpPosture(enemy.pvpPosture, 'melee', gameTime, postureChipMult());
          const ps = crit ? markPvpCritSlow(r.next, gameTime) : r.next;
          pvpMeleePatch = r.broke
            ? { pvpPosture: ps, gpPendingSwingAt: undefined, gpParriedAt: undefined }
            : { pvpPosture: ps };
        }
      }
      damageNumbers.push({ x: ecx, y: enemy.y, value: dmg, crit });
      if (!isGhost) recordCritHit(crit ? 'rng' : 'none', isBossType(enemy.type)); // §7-11c(4): 近接クリ計測口
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
      // GAME_AUDIT #17(社長承認): 刀のクリも銃と同じく裏ボスの完全気絶カウントに乗せる。
      const bossBump = !isGhost ? applyBossPostureDamage(enemy, allowFinisher ? 'heavy' : 'melee', gameTime) : null;
      if (bossBump?.triggered) katanaBossFullStunHits.push({ x: ecx, y: ecy });
      // §6.33(LASER-TRACK): レーザー弱点窓の中断(プレイヤーの刀のみ=分身/守護霊は対象外)。
      const laserBreak = !isGhost ? mimirLaserBreakOnMeleeHit({ ...enemy, ...(bossBump?.patch ?? {}) }, gameTime) : null;
      if (laserBreak) mimirLaserBreakHits.push({ x: ecx, y: ecy });
      if (laserBreak?.postureTriggered) katanaBossFullStunHits.push({ x: ecx, y: ecy });
      // v0.25.3491: bossCritSlowPatch→bossCritStopPatch(isBossType全体をDR込みで扱う。site1と同型)。
      const bossSlow = critStun ? bossCritStopPatch(enemy, gameTime, player.stunDurationMult ?? 1) : null; // ボスは半減(v0.25.2422)
      // CRIT-UNIFY §9.2同梱修正: 刀のクリ気絶にだけstunDurationMult(気絶時間アップパッシブ)が
      // 乗っていなかった実装漏れを修正(ナイフ/鞭/分身は既に乗っている・銃も乗っている)。
      const newStunUntil = (critStun && !bossSlow && !isBossType(enemy.type) && !isHangedman(enemy.type)) ? gameTime + STUN_DURATION_MS * (player.stunDurationMult ?? 1) : enemy.stunUntil;
      const dx = ecx - pcx;
      const dy = ecy - pcy;
      const dist = Math.max(0.001, Math.hypot(dx, dy));
      if (!stunned && knockbackCdReady(enemy, now)) {
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
          ...(bossSlow ?? {}), // CRIT-UNIFY §9.2バグ修正: bossSlowUntil(半減)が計算のみで未適用だった漏れ
          ...(bossBump?.patch ?? {}), // GAME_AUDIT #17: 完全気絶カウント/発動を反映(最後に展開して優先)
          ...(laserBreak?.patch ?? {}), // §6.33: レーザー中断
          ...pvpMeleePatch, // ★SAME_ARENA §9: 対人体勢(刀のmelee削り/致命後daze)
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
          ...(bossSlow ?? {}), // CRIT-UNIFY §9.2バグ修正: 同上
          ...(bossBump?.patch ?? {}), // GAME_AUDIT #17
          ...(laserBreak?.patch ?? {}), // §6.33: レーザー中断
          ...pvpMeleePatch, // ★SAME_ARENA §9: 対人体勢(同上)
        });
      }
    }

    // フィニッシュ演出(ヒットストップ/フラッシュ/スロー)はこの呼び出しに対し
    // 1回だけ発火する。一閃で複数敵を同時フィニッシュしても多重発火しない。
    const finisherHit = killed.some(k => k.finisher);
    const comboFinishCount = killed.filter(k => k.finisher).length + (bossFinishHit ? 1 : 0);
    const bossKilled = killed.some(k => isFinalBossKill(k.enemy));
    // ナイフマスター(2026-08-29一本化): 通常ヒットも表示コンボへ(守護霊のスイングは除外)。
    const comboGain = comboFinishCount + (isGhost ? 0 : knifeMasterHitComboGain(player, slashAt.length > 0, comboFinishCount));
    const finishWindowMs = meleeFinishComboWindowMs(player);
    // §6.21 M46: 近接カウンター振り(刀のオート斬撃/一閃)の計測。channel='melee'。1呼び出し=1回(hitCount=命中数)。
    const katanaSwingDamage = damageNumbers.reduce((sum, n) => sum + n.value, 0);
    // 除外4(運用系): 守護霊起因はプレイヤーの計測(botTelemetry)に混ぜない
    // (既存の damageChannel=null / weaponKey='ghost-gun' と同じ分離方針)。
    if (!isGhost) {
      recordDamageDealt('melee', katanaSwingDamage);
      recordMeleeSwing(slashAt.length);
    }
    set(state => ({
      // このスイングで近接ダメージを受けた敵(lastHit===now)に meleeAggro を付与(救助で以後プレイヤー狙い)。
      // §5.21-追補8: 同じ判定(このスイングで近接ダメージを受けた=lastHit===now)でミゲル(ゲート2ボス)
      // 専用の meleeHitAt もスタンプ(gun/爆発は damageEnemy 側の別経路なので対象外)。ミゲル以外は
      // 無害な余剰フィールド(useGameLoop のミゲル専用コントローラだけが参照)。
      // research/GHOST_BOSS.md v6: 幻影の i-frame 打刻(gpHitPatch)を合成する(有効打のときだけ)。
      enemies: survivors.map(e => {
        const gp = gpHitPatch !== null && gpHitPatch.id === e.id ? gpHitPatch.patch : null;
        // PACING_PUZZLE.md §9-4/§9-7#6(削岩型・近接被弾での離脱): このスイングで近接ダメージを受けた
        // driller/logger に gameTime+2000 を書く(ナイフ/刀/鞭のスイング=この3関数+守護霊/分身は別途)。
        if (e.lastHit === now) return { ...e, meleeAggro: true, meleeHitAt: gameTime, ...(gp ?? {}), ...(isRetreatEligibleType(e.type) ? { drillerRetreatUntil: gameTime + DRILLER_RETREAT_MS } : {}) };
        return gp ? { ...e, ...gp } : e;
      }),
      gameStats: {
        ...state.gameStats,
        enemiesKilled: state.gameStats.enemiesKilled + killed.length,
        meleeFinishers: state.gameStats.meleeFinishers + killed.reduce((n, k) => n + (k.finisher ? 1 : 0), 0),
        eliteKills: state.gameStats.eliteKills + killed.reduce((n, k) => n + (isScoreElite(k.enemy.type) ? 1 : 0), 0),
        bossKills: state.gameStats.bossKills + killed.reduce((n, k) => n + (isScoreBoss(k.enemy.type) ? 1 : 0), 0),
        damageDealt: state.gameStats.damageDealt + katanaSwingDamage,
        maxCombo: (comboGain > 0 && !isGhost)
          ? Math.max(
              state.gameStats.maxCombo,
              state.meleeFinishComboUntil >= gameTime
                ? state.meleeFinishComboCount + comboGain
                : comboGain
            )
          : state.gameStats.maxCombo
      },
      finaleDefeated: state.finaleDefeated || bossKilled,
      // コンボ台帳(プレイヤーのフィニッシュコンボ/ナイフコンボ)は**プレイヤーのスイングだけ**が書く。
      // 守護霊のスイングで本人のコンボが伸びると「本人のコンボがゴーストにも乗る」二重取りになるため
      // (GHOST-BUILD-1 ★未決1と同じ扱い)。キル数/与ダメの集計は damageEnemy(ゴースト弾/近接も計上)と
      // 同じ扱いで積む=経路による食い違いを作らない。
      ...(isGhost ? {} : {
        meleeFinishComboCount: comboGain > 0
          ? (state.meleeFinishComboUntil >= gameTime ? state.meleeFinishComboCount + comboGain : comboGain)
          : state.meleeFinishComboCount,
        meleeFinishComboUntil: comboGain > 0
          ? gameTime + finishWindowMs
          : state.meleeFinishComboUntil,
        // hitstopはtriggerFinishImpact側でCD込みで一括管理(M21・§5.22)。ここでの個別設定は廃止。
      }),
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
      get().spawnGlow(p.x, p.y, GLOW_R_XL, 'rgba(168,85,247,', 620);
      get().spawnCallout(p.x, p.y - 24, 'BREAK!', '#d8b4fe', { bg: 0x6b21a8 });
    }
    // §6.33: レーザー中断=カウンター成立扱いの演出(ナイフ経路と同じ意匠。SEはuseGameLoop側)。
    for (const p of mimirLaserBreakHits) {
      get().triggerHitImpact(COUNTER_HITSTOP_MS, COUNTER_SHAKE_MS, COUNTER_SHAKE_MAG, COUNTER_ZOOM_MAG);
      get().spawnGlow(p.x, p.y, GLOW_R_L, 'rgba(56,189,248,', 360);
      get().spawnRing(p.x, p.y, 14, 135, 'rgba(56,189,248,0.9)', 3, 360);
      get().spawnBurst(p.x, p.y, '#38bdf8', 14);
      get().spawnCallout(p.x, p.y - 12, 'Counter!', '#e0f2ff', { bg: 0x2563eb });
    }
    for (const p of katanaBossFatalHits) {
      showBossFatalPresentation(get, p.x, p.y, p.labelY);
    }
    // 刀の一閃フィニッシュは「斬」コールアウトが主役なので、Kill! と既存の
    // 黄色フィニッシュフラッシュは出さない(暗転と斬は triggerKatanaDash 側で出す)。
    grantMeleeKillRewards(get, killed, player, gun, true);
    // 除外1(演出)→v0.25.2582試験改定: 守護霊起因でも出す(?ghostzoom=0で従来=除外1へ)。
    if ((finisherHit || bossFinishHit) && (!isGhost || GHOST_ZOOM_TRIAL_ENABLED)) {
      const [ztx, zty] = katanaBossFatalHits[0]
        ? [katanaBossFatalHits[0].x, katanaBossFatalHits[0].y]
        : finishZoomTargetOf(killed);
      const fullCinematic = get().triggerFinishImpact(ztx, zty, katanaBossFatalHits.length > 0); // 致命はCDを無視して必ず最大ズーム
      // v0.25.3703: 刀の致命にもKILL跳びつき(v3622の取りこぼし)。刀の**処刑(finisher)**は従来どおり
      // 「斬」演出が主役なので跳びつきは付けない=致命(katanaBossFatalHits)がある時だけ。プレイヤー起因のみ。
      const kFatal = katanaBossFatalHits[0];
      if (fullCinematic && kFatal && !isGhost) {
        startKillFxCinematic(get, { cx: kFatal.x, cy: kFatal.y, w: kFatal.w, h: kFatal.h },
          katanaBossFatalHits.map(p => ({ x: p.x, y: p.y })), pcx, pcy);
      }
    }
    // スキル: リーパー。刀の一閃フィニッシュ範囲(katanaRange)内の敵を全員フィニッシュ。
    applyMeleeFinishSkillSpread(get, player, killed.some(k => k.finisher), pcx, pcy, katanaRange(player), baseDamage * damageMult, meleeFinisherAt(killed));
    // スキル: 救難信号。刀装備時は通常近接の代わりに一閃(allowFinisher=trueのダッシュ斬り。
    // triggerKatanaDash経由のみ)がプレイヤーの「近接ヒット」に相当するため、ここで発動判定する。
    // オート斬撃(allowFinisher=false)は対象外(社長指示「一閃時」=ダッシュ斬りのみ)。
    // baseMeleeDamage = baseDamage*damageMult = このヒットがcrit/コンボ/skillOutgoingDamageMult抜きで
    // 計算した素ダメージ(通常近接のmeleeDamageと同じ「倍率1」の考え方)。
    if (allowFinisher) {
      applyRescueSignalProc(get, player, baseDamage * damageMult, katanaHitEnemyIds, pcx, pcy);
      // 吸血覚醒(Lv3・v0.25.3300): 刀のヒットでも1%回復。
      applyVampireMeleeHeal(get, player, katanaHitEnemyIds, pcx, pcy);
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
    const whipBossFullStunHits: { x: number; y: number }[] = []; // §9.4(v0.25.2502): 鞭クリで完全気絶が発動した位置(紫FX用)
    const mimirLaserBreakHits: { x: number; y: number }[] = []; // §6.33: レーザー中断位置(カウンター成立FX用)
    const whipBossFatalHits: { x: number; y: number; labelY: number; w: number; h: number }[] = []; // w/h=killFx流用(v0.25.3703)
    const whipHitEnemyIds: string[] = []; // スキル 救難信号(§6.10 M33⑦): 鞭のヒット敵ID(発動判定/対象選定用)
    // research/GHOST_BOSS.md v6: 幻影に**有効打**が入った時の打刻(同時1体なので1枠でよい)。
    let gpHitPatch: { id: string; patch: Partial<Enemy> } | null = null;
    let hits = 0;
    // スキル: 近接コンボ倍率(ナイフマスター×コンボマスター)。
    const meleeComboMult = skillMeleeComboMult(player, gameTime, get().meleeFinishComboCount, get().meleeFinishComboUntil);

    for (const enemy of enemies) {
      if (!targetIds.includes(enemy.id) || (isReaperFamily(enemy.type) && !isTerminalReaper(enemy)) || isCorpse(enemy)) {
        // KILL吹き飛び(死体・§26-2): 死体は標的から除外(targetIds選定側で既に除いてあるが二重ガード)
        survivors.push(enemy);
        continue;
      }
      // ★research/GHOST_BOSS.md v6(幻影の被弾ゲート・7系統⑤=鞭)。無効化した打撃は
      // hits にも slashAt にも積まない(戻り値 hit/hits がSEを鳴らす条件になっているため)。
      let gpDmgScale = 1; // 対人1/10(社長裁定2026-08-20)。幻影以外は常に1=恒等。
      if (isGuardianPhantom(enemy.type)) {
        const gp = gatePhantomHit(enemy, 0, 'melee', gameTime);
        if (!gp.effects) {
          // ★SAME_ARENA §9: 幻影のパリィ成立=鞭はプレイヤー本人の武器なので体勢counter削り。
          if (gp.parried) set(st => ({ player: { ...st.player, ...playerPvpChipPatch(st.player, 'counter', st.gameTime) } }));
          survivors.push({ ...enemy, ...gp.patch }); continue;
        }
        gpHitPatch = { id: enemy.id, patch: gp.patch };
        gpDmgScale = gp.damageScale;
      }
      hits++;
      whipHitEnemyIds.push(enemy.id);
      const ecx = enemy.x + enemy.width / 2;
      const ecy = enemy.y + enemy.height / 2;
      slashAt.push({ x: ecx, y: ecy });
      // 巻き込み中は通常倍率(1.0)、それ以外は鞭の低倍率(0.25)。
      const whipMult = inHurricane(ecx, ecy) ? 1 : WHIP_DAMAGE_MULT;
      // 処刑(ボス5×/強個体3×/致命の一撃)は skillOutgoingDamageMult を通らないので、育成の攻撃力は
      // 素ダメージへ前掛けする(research/GROWTH.md v4・ナイフ/分身/刀/守護霊と同じ扱い)。
      const whipExecBase = meleeBase * whipMult * (player.growthAtkMult ?? 1) * gpDmgScale;
      const stunned = enemy.stunUntil !== undefined && gameTime < enemy.stunUntil;
      if (stunned) {
        // 近接フィニッシュ: スタン敵は即時処刑(ボスは5×でスタン解除。§6.22 M47でネームド/questTarget/
        // pumpkin/lab-zombie-3はHP50%以上なら即死せず×3+気絶解除に変更=旧§5.21-追補7の「ネームドは
        // 通常敵扱い=即時処刑」を上書き)。
        // v0.25.3171(案A): 強個体(pumpkin/lab-zombie-3)はボス枝へ落とさない。
        if (usesBossStunnedMelee(enemy.type)) {
          bossFinishHit = true;
          const fatal = applyBrokenMeleeFatal(enemy, whipExecBase, gameTime);
          const dmg = fatal?.damage ?? whipExecBase * BOSS_MELEE_STUN_MULT;
          if (fatal) whipBossFatalHits.push({ x: ecx, y: ecy, labelY: enemy.y - 6, w: enemy.width, h: enemy.height });
          damageNumbers.push({ x: ecx, y: enemy.y, value: dmg, crit: true });
          recordCritHit('guaranteed', true); // §7-11c(4): meleeExecuteの紫中フィニッシュ
          // §5.21-追補4: スタン中ボスへの5×鞭打ち=ボスのフィニッシュ経路そのものなのでclampしない。
          const newHealth = Math.max(0, enemy.health - dmg);
          if (newHealth <= 0) killed.push({ enemy, finisher: false });
          else survivors.push({ ...enemy, health: newHealth, stunUntil: undefined, lastHit: now, liftUntil: now + 420, ...(fatal?.patch ?? {}) });
          continue;
        }
        // §6.22 M47仕様①: 強個体はHP50%以上だと即死せず近接ダメージ×3+気絶解除。
        if (stunnedMeleeOutcome(enemy) === 'heavy') {
          bossFinishHit = true;
          const dmg = whipExecBase * ELITE_MELEE_STUN_MULT;
          // v0.25.3703: 強個体のheavy=致命の一撃(E-1)なので演出系へ載せる(ナイフ/刀と同じ)。
          whipBossFatalHits.push({ x: ecx, y: ecy, labelY: enemy.y - 6, w: enemy.width, h: enemy.height });
          damageNumbers.push({ x: ecx, y: enemy.y, value: dmg, crit: true });
          recordCritHit('guaranteed', false); // §7-11c(4): meleeExecuteの紫中フィニッシュ(強個体=非ボス扱い)
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
      const crit = Math.random() < meleeHitCritChance(meleeCritChance, player, gameTime, enemy);
      let dmg = meleeBase * whipMult * (crit ? skillCritMult(player, CRIT_DAMAGE_MULT) : 1) * skillOutgoingDamageMult(player) * meleeComboMult * gpDmgScale;
      // ★SAME_ARENA §9(検収監査 重大③): 鞭にも致命(×5+最大HP25%)とmelee削り(site1と同型・鞭はプレイヤー本人のみの武器)。
      let pvpMeleePatch: Partial<Enemy> = {};
      if (isGuardianPhantom(enemy.type)) {
        if (isPvpFatalTarget(enemy.pvpPosture, gameTime)) {
          dmg = pvpFatalDamage(dmg, enemy.maxHealth);
          pvpMeleePatch = { pvpPosture: pvpAfterFatal(enemy.pvpPosture, gameTime) };
          whipBossFatalHits.push({ x: ecx, y: ecy, labelY: enemy.y - 6, w: enemy.width, h: enemy.height });
          bossFinishHit = true; // ★社長指示2026-08-27「幻影戦の致命もKILL演出(ズーム)」
        } else {
          const r = chipPvpPosture(enemy.pvpPosture, 'melee', gameTime, postureChipMult());
          const ps = crit ? markPvpCritSlow(r.next, gameTime) : r.next;
          pvpMeleePatch = r.broke
            ? { pvpPosture: ps, gpPendingSwingAt: undefined, gpParriedAt: undefined }
            : { pvpPosture: ps };
        }
      }
      damageNumbers.push({ x: ecx, y: enemy.y, value: dmg, crit });
      recordCritHit(crit ? 'rng' : 'none', isBossType(enemy.type)); // §7-11c(4): 近接クリ計測口
      const newHealth = Math.max(0, enemy.health - dmg);
      if (newHealth <= 0) { killed.push({ enemy, finisher: false }); continue; }
      if (crit) critStunAt.push({ x: ecx, y: ecy });
      // §9.4(v0.25.2502・CRIT-UNIFY★未決2の解消): 鞭のクリも紫カウントへ(発生枠=近接系共通。
      // ナイフ4737/刀5479/分身5076と同じ作法=GAME_AUDIT #17「プレイヤーが直接出したクリは全部乗せる」)。
      const bossBump = applyBossPostureDamage(enemy, 'melee', gameTime);
      if (bossBump?.triggered) whipBossFullStunHits.push({ x: ecx, y: ecy });
      // §6.33(LASER-TRACK): レーザー弱点窓の中断(鞭もプレイヤーの近接=対象)。
      const laserBreak = mimirLaserBreakOnMeleeHit({ ...enemy, ...(bossBump?.patch ?? {}) }, gameTime);
      if (laserBreak) mimirLaserBreakHits.push({ x: ecx, y: ecy });
      if (laserBreak?.postureTriggered) whipBossFullStunHits.push({ x: ecx, y: ecy });
      // 大ノックバック(通常の約3倍): 鞭の線に直交する向きへ、敵がいる側へ強く弾く=避難路。
      // 鞭は「必ずノックバック」: ノックバック無敵窓(knockbackImmuneUntil)を無視して毎回弾く。
      const side = ((ecx - pcx) * nx + (ecy - pcy) * ny) >= 0 ? 1 : -1;
      survivors.push({
        ...enemy,
        health: newHealth,
        lastHit: now,
        // ボスはスタンさせず半減(v0.25.2422)。v0.25.3491: bossCritSlowPatch→bossCritStopPatch
        // (isBossType全体をDR込みで扱う。nullは真の非ボスだけなので??の素通し先は不変)。
        // PACING_PUZZLE.md §14-4-3(使者・hangedman): 近接フィニッシュ即死の対象外(除外リスト)=
        // クリでも通常の5秒スタンへ入れない(体勢なし裁定と対で「止まらない」を貫く)。
        ...(crit && !isHangedman(enemy.type) ? (bossCritStopPatch(enemy, gameTime, player.stunDurationMult ?? 1) ?? { stunUntil: gameTime + STUN_DURATION_MS * (player.stunDurationMult ?? 1) }) : { stunUntil: enemy.stunUntil }),
        knockbackVx: side * nx * WHIP_KNOCKBACK_SPEED,
        knockbackVy: side * ny * WHIP_KNOCKBACK_SPEED,
        knockbackUntil: now + KNOCKBACK_DURATION,
        knockbackShoveUntil: now + KNOCKBACK_DURATION, // v0.25.2607: 押し道具=ボスにも効く
        knockbackImmuneUntil: now + KNOCKBACK_IMMUNE_MS,
        ...(bossBump?.patch ?? {}), // 紫カウント/発動を反映(最後に展開して優先=刀5490と同じ作法)
        ...(laserBreak?.patch ?? {}), // §6.33: レーザー中断
        ...pvpMeleePatch, // ★SAME_ARENA §9: 対人体勢(鞭のmelee削り/致命後daze)
      });
    }

    const finisherHit = killed.some(k => k.finisher);
    const comboFinishCount = killed.filter(k => k.finisher).length + (bossFinishHit ? 1 : 0);
    const bossKilled = killed.some(k => isFinalBossKill(k.enemy));
    // ナイフマスター(2026-08-29一本化): 通常ヒットも表示コンボへ。
    const comboGain = comboFinishCount + knifeMasterHitComboGain(player, slashAt.length > 0, comboFinishCount);
    const finishWindowMs = meleeFinishComboWindowMs(player);
    // §6.21 M46: 近接カウンター振り(鞭)の計測。channel='melee'。1振り=1回(hitCount=命中数)。
    const whipSwingDamage = damageNumbers.reduce((s, n) => s + n.value, 0);
    recordDamageDealt('melee', whipSwingDamage);
    recordMeleeSwing(slashAt.length);
    set(state => ({
      // このスイングで近接ダメージを受けた敵(lastHit===now)に meleeAggro を付与(救助で以後プレイヤー狙い)。
      // §5.21-追補8: 同じ判定(このスイングで近接ダメージを受けた=lastHit===now)でミゲル(ゲート2ボス)
      // 専用の meleeHitAt もスタンプ(gun/爆発は damageEnemy 側の別経路なので対象外)。ミゲル以外は
      // 無害な余剰フィールド(useGameLoop のミゲル専用コントローラだけが参照)。
      // research/GHOST_BOSS.md v6: 幻影の i-frame 打刻(gpHitPatch)を合成する(有効打のときだけ)。
      enemies: survivors.map(e => {
        const gp = gpHitPatch !== null && gpHitPatch.id === e.id ? gpHitPatch.patch : null;
        // PACING_PUZZLE.md §9-4/§9-7#6(削岩型・近接被弾での離脱): このスイングで近接ダメージを受けた
        // driller/logger に gameTime+2000 を書く(ナイフ/刀/鞭のスイング=この3関数+守護霊/分身は別途)。
        if (e.lastHit === now) return { ...e, meleeAggro: true, meleeHitAt: gameTime, ...(gp ?? {}), ...(isRetreatEligibleType(e.type) ? { drillerRetreatUntil: gameTime + DRILLER_RETREAT_MS } : {}) };
        return gp ? { ...e, ...gp } : e;
      }),
      gameStats: {
        ...state.gameStats,
        enemiesKilled: state.gameStats.enemiesKilled + killed.length,
        meleeFinishers: state.gameStats.meleeFinishers + killed.reduce((n, k) => n + (k.finisher ? 1 : 0), 0),
        eliteKills: state.gameStats.eliteKills + killed.reduce((n, k) => n + (isScoreElite(k.enemy.type) ? 1 : 0), 0),
        bossKills: state.gameStats.bossKills + killed.reduce((n, k) => n + (isScoreBoss(k.enemy.type) ? 1 : 0), 0),
        damageDealt: state.gameStats.damageDealt + whipSwingDamage,
        maxCombo: comboGain > 0
          ? Math.max(state.gameStats.maxCombo, state.meleeFinishComboUntil >= gameTime ? state.meleeFinishComboCount + comboGain : comboGain)
          : state.gameStats.maxCombo,
      },
      finaleDefeated: state.finaleDefeated || bossKilled,
      meleeFinishComboCount: comboGain > 0
        ? (state.meleeFinishComboUntil >= gameTime ? state.meleeFinishComboCount + comboGain : comboGain)
        : state.meleeFinishComboCount,
      meleeFinishComboUntil: comboGain > 0 ? gameTime + finishWindowMs : state.meleeFinishComboUntil,
      // hitstopはtriggerFinishImpact側でCD込みで一括管理(M21・§5.22)。ここでの個別設定は廃止。
    }));

    // 鞭の時は近接攻撃のクレスト(slashストリーク)表現は出さない。鞭自身のlashスプライトのみ。
    // 血飛沫は出す(社長指摘v0.25.2060: メイン近接3経路に未配線だった)。
    for (const s of slashAt) get().spawnMeleeBlood(s.x, s.y);
    for (const c of damageNumbers) get().spawnDamageNumber(c.x, c.y, c.value, c.crit);
    for (const c of critStunAt) get().spawnRing(c.x, c.y, 6, 30, 'rgba(250, 204, 21, 0.9)', 2, 260);
    // §9.4(v0.25.2502): 鞭クリの紫完全気絶FX(ナイフ4923/刀5573の紫リング+STUN!と同じ作法)。
    for (const p of whipBossFullStunHits) {
      get().spawnRing(p.x, p.y, 12, 210, 'rgba(168,85,247,0.85)', 5, 520);
      get().spawnRing(p.x, p.y, 6, 130, 'rgba(216,180,254,0.9)', 3, 360);
      get().spawnGlow(p.x, p.y, GLOW_R_XL, 'rgba(168,85,247,', 620);
      get().spawnCallout(p.x, p.y - 24, 'BREAK!', '#d8b4fe', { bg: 0x6b21a8 });
    }
    // §6.33: レーザー中断=カウンター成立扱いの演出(ナイフ経路と同じ意匠。SEはuseGameLoop側)。
    for (const p of mimirLaserBreakHits) {
      get().triggerHitImpact(COUNTER_HITSTOP_MS, COUNTER_SHAKE_MS, COUNTER_SHAKE_MAG, COUNTER_ZOOM_MAG);
      get().spawnGlow(p.x, p.y, GLOW_R_L, 'rgba(56,189,248,', 360);
      get().spawnRing(p.x, p.y, 14, 135, 'rgba(56,189,248,0.9)', 3, 360);
      get().spawnBurst(p.x, p.y, '#38bdf8', 14);
      get().spawnCallout(p.x, p.y - 12, 'Counter!', '#e0f2ff', { bg: 0x2563eb });
    }
    for (const p of whipBossFatalHits) {
      showBossFatalPresentation(get, p.x, p.y, p.labelY);
    }
    // 弾薬ドロップは鞭固定20%(弾切れ救済)。
    grantMeleeKillRewards(get, killed, player, gun, false, WHIP_AMMO_DROP_CHANCE);
    // スキル: 救難信号(§6.10 M33⑦: 鞭のヒットでも発動判定。基本近接/刀と同条件。アライの一撃は
    // 鞭の通常打撃基準=meleeBase×WHIP_DAMAGE_MULT を素通し)。
    applyRescueSignalProc(get, player, meleeBase * WHIP_DAMAGE_MULT, whipHitEnemyIds, pcx, pcy);
    // 吸血覚醒(Lv3・v0.25.3300): 鞭のヒットでも1%回復。
    applyVampireMeleeHeal(get, player, whipHitEnemyIds, pcx, pcy);
    if (finisherHit || bossFinishHit) {
      const [ztx, zty] = whipBossFatalHits[0]
        ? [whipBossFatalHits[0].x, whipBossFatalHits[0].y]
        : finishZoomTargetOf(killed);
      const fullCinematic = get().triggerFinishImpact(ztx, zty, whipBossFatalHits.length > 0); // 致命はCDを無視して必ず最大ズーム
      // v0.25.3703: 鞭の致命にもKILL跳びつき(v3622の取りこぼし)。処刑(finisher)は従来どおり=致命のみ。
      const wFatal = whipBossFatalHits[0];
      if (fullCinematic && wFatal) {
        startKillFxCinematic(get, { cx: wFatal.x, cy: wFatal.y, w: wFatal.w, h: wFatal.h },
          whipBossFatalHits.map(p => ({ x: p.x, y: p.y })), pcx, pcy);
      }
    }
    // スキル: リーパー。鞭フィニッシュ範囲(WHIP_LENGTH)内の敵を全員フィニッシュ。
    applyMeleeFinishSkillSpread(get, player, killed.some(k => k.finisher), pcx, pcy, WHIP_LENGTH_BY_LEVEL[1], meleeBase, meleeFinisherAt(killed));

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
      .filter(e => !isReaperFamily(e.type) || isTerminalReaper(e))
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
    // §6.24 M48「使役」: 警察署アリーナ報酬のペット(persistent:true)は錬金術の入れ替え枠に数えない
    // =錬金術を唱えても消えない(「死ぬまでついてくる」)。alchemy自身の3体上限/レア切替の挙動は不変。
    const persistentPets = summons.filter(s => s.persistent);
    if (Math.random() < ALCHEMY_RARE_CHANCE) {
      // レア: 既存の通常個体を全消去し、レア1体を召喚(枠を専有)。
      const rare = buildSummon(lvl, 'rare', sx, sy);
      set({ summons: [...persistentPets, rare] });
      get().spawnRing(sx, sy, 16, 120, 'rgba(125,211,252,0.85)', 3, 360);
      get().spawnGlow(sx, sy, GLOW_R_M, 'rgba(125,211,252,', 420);
      // 召喚完了演出(レアは強め): 暗転 + スロー + パーティクル(死神=黒も混ぜる)。
      get().triggerTimeSlow(0.3, 480);
      get().spawnFlash('rgba(0,0,0,0.5)', 260);
      get().spawnBurst(sx, sy, '#38bdf8', 34);
      get().spawnBurst(sx, sy, '#0a0a0a', 16);
      return;
    }
    // 通常: 最大3体、超えたら最古をFIFOで入れ替え。
    const normals = summons.filter(s => s.kind === 'normal' && !s.persistent).sort((a, b) => a.createdAt - b.createdAt);
    const kept = normals.length >= ALCHEMY_MAX_NORMAL
      ? normals.slice(normals.length - (ALCHEMY_MAX_NORMAL - 1))
      : normals;
    const unit = buildSummon(lvl, 'normal', sx, sy, skillSummonHpMult(player)); // スキル: ナイト=召喚HP×1.5
    set({ summons: [...persistentPets, ...kept, unit] });
    get().spawnGlow(sx, sy, GLOW_R_S, 'rgba(125,211,252,', 360);
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
      // BOT_AND_GHOST.md G2: ghost-ally(kind='ghost-ally')はここでは駆動しない(専用の
      // ghostDriver.ts + useGameLoop の専用ブロックが移動/攻撃を決める)。ここは素通し(このtickは
      // 何もしない)にして、錬金術召喚(normal/rare)の追従/接触ダメージAIに巻き込まれないようにする。
      // v0.25.2514(監査項目7): 例外として**被弾ノックバックの消化だけ**はここで行う(プレイヤーの
      // movePlayerと同式=残り時間で線形減衰する速度で滑る)。霊体はオブジェクトをすり抜ける仕様
      // (v0.25.2469)なので壁解決はしない。KB中はゴースト自身の移動を止める(=プレイヤーが被弾KB中に
      // 入力を無視されるのと同じ)——その判定はuseGameLoopのゴーストブロック側。
      if (s0.kind === 'ghost-ally') {
        const kbUntil = s0.knockbackUntil ?? 0;
        if (now < kbUntil) {
          const decay = Math.max(0, (kbUntil - now) / PLAYER_KNOCKBACK_MS); // 1→0
          nextSummons.push({
            ...s0,
            x: s0.x + (s0.knockbackVx ?? 0) * decay * deltaTime,
            y: s0.y + (s0.knockbackVy ?? 0) * decay * deltaTime,
          });
        } else {
          nextSummons.push(s0);
        }
        continue;
      }
      if (s0.kind === 'rare') {
        if (now >= (s0.expiresAt ?? 0)) continue; // 10秒で消滅
        // 吸引: レア中心へ PULL_RANGE 内の敵を最大N体寄せる(ダメージなし)。
        const rcx = s0.x + s0.width / 2;
        const rcy = s0.y + s0.height / 2;
        const pr2 = ALCHEMY_RARE_SUCTION_PULL_RANGE * ALCHEMY_RARE_SUCTION_PULL_RANGE;
        const inRange = enemiesNext
          .map((e, i) => ({ i, d2: (e.x + e.width / 2 - rcx) ** 2 + (e.y + e.height / 2 - rcy) ** 2, reaper: isReaperFamily(e.type) && !isTerminalReaper(e), corpse: isCorpse(e) }))
          .filter(o => !o.reaper && !o.corpse && o.d2 <= pr2) // KILL吹き飛び(死体・§26-2): 吸引対象から除外
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
            if (isReaperFamily(e.type) && !isTerminalReaper(e)) continue;
            if (isCorpse(e)) continue; // KILL吹き飛び(死体・§26-2): 死神オーラの対象から除外
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
      // §6.24 M48「使役」(D2): persistent(警察署アリーナ報酬のペット)は距離で消えない
      // (社長「死ぬまでついてくる」)。錬金術本来の召喚だけ距離消滅を適用する。
      if (!s0.persistent && Math.hypot(scx - pcx, scy - pcy) > ALCHEMY_DESPAWN_DIST) continue;
      let s = s0;
      // 攻撃: 近接間合いの最寄り敵に接触ダメージ(throttle)。
      // 賢者の石装備時は単体接触ではなく半径 SAGE_NORMAL_AOE_RADIUS の AoE。
      if (now - (s.lastContactAt ?? 0) >= ALCHEMY_ATTACK_INTERVAL_MS) {
        if (sage) {
          const aoe2 = SAGE_NORMAL_AOE_RADIUS * SAGE_NORMAL_AOE_RADIUS;
          let hitAny = false;
          for (const e of enemiesNext) {
            if (isReaperFamily(e.type) && !isTerminalReaper(e)) continue;
            if (isCorpse(e)) continue; // KILL吹き飛び(死体・§26-2): 賢者の石AoEの対象から除外
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
            if (isReaperFamily(e.type) && !isTerminalReaper(e)) continue;
            if (isCorpse(e)) continue; // KILL吹き飛び(死体・§26-2): 通常召喚の接触対象から除外
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

  damageSummon: (id, amount, fromX, fromY, source) => {
    const now = Date.now();
    const gtNow = get().gameTime; // ?ghostlog=1 の診断出力用(下)。read-onlyで挙動不変。
    // BOT_AND_GHOST.md G2: ghost-ally(kind='ghost-ally')もHP制なので normal と同じ被弾/消滅の枠へ
    // 含める(i-frame・health<=0で消滅=「ゴーストHP0で解散」の土台)。rareは対象外のまま(既存挙動不変)。
    const isHittable = (s: Summon): boolean => s.kind === 'normal' || s.kind === 'ghost-ally';
    const livePlayer = get().player;
    // v0.25.2586(社長指示): 守護霊が死んだ瞬間の位置(ズーム+スローの寄り先)。set外へ持ち出す
    // (演出はset内で呼ばない=updateArmory/updateHospitalと同じ「副作用は外」の作法)。
    let ghostDeathAt: { x: number; y: number } | null = null;
    set(state => ({
      summons: state.summons
        .map(s => {
          if (s.id !== id || !isHittable(s)) return s;
          // プレイヤーと同じ被弾構造: 直近被弾から INVULN_MS は無敵(i-frame)。
          // これで敵が何体群がっても 1 無敵窓につき被弾は 1 回に制限される
          // (旧: 敵×召喚ペアごとの throttle で敵数ぶん多重被弾していた)。
          if (now - s.lastHit < INVULN_MS) return s;
          // v0.25.2489(社長裁定「同じ仕様になってないのは漏れ」): カウンター成立の付与無敵
          // (プレイヤーのinvulnerable相当)。lastHitを打刻しない=被弾音/被弾フラッシュも出ない(無傷)。
          if (now < (s.ghostInvulnUntil ?? 0)) return s;
          // v0.25.2514(監査項目13・§2.11): 守護霊は被ダメ補正(ナイト×0.8/バーサーカー×1.2)も
          // プレイヤーと同じ純関数で受ける。主語は**計測時ビルド**の疑似Player(スキルはその撃破ランのもの)。
          // 錬金術召喚(kind='normal')は対象外=従来どおり素通し(パリティの対象は守護霊のみ)。
          const dealt = (s.kind === 'ghost-ally' && amount > 0)
            ? amount * skillIncomingDamageMult(buildPseudoPlayer(s.ghostBuild, livePlayer), gtNow)
            : amount;
          // v0.25.2514(監査項目7・§2.11): 被弾ノックバック。プレイヤーのdamagePlayerと同式
          // (ダメージ源から離れる向き × PLAYER_KNOCKBACK_SPEED を PLAYER_KNOCKBACK_MS かけて減衰)。
          // 消化は updateSummons(ghost-ally分岐)。被弾シェイクは出さない(裁定3=除外1の演出枠)。
          let kb: Partial<Summon> = {};
          if (s.kind === 'ghost-ally' && dealt > 0 && fromX !== undefined && fromY !== undefined) {
            const scx = s.x + s.width / 2, scy = s.y + s.height / 2;
            let dx = scx - fromX, dy = scy - fromY;
            const d = Math.hypot(dx, dy);
            if (d < 0.001) { dx = 0; dy = -1; } else { dx /= d; dy /= d; }
            kb = {
              knockbackVx: dx * PLAYER_KNOCKBACK_SPEED,
              knockbackVy: dy * PLAYER_KNOCKBACK_SPEED,
              knockbackUntil: now + PLAYER_KNOCKBACK_MS,
            };
          }
          // テスト診断(依頼#7・?ghostlog=1): 守護霊の被弾源の内訳をconsoleへ(記録専用・挙動不変)。
          // v0.25.2591(社長「logつけてやったけど、どうしたらいいの?」): スマホではコンソールが見えないので
          // **画面にも出す**(ghostDmgLog。表示はGhostDamageLogオーバーレイ)。被弾の瞬間だけ更新される
          // =毎フレームのstore書き込みではないので再レンダー規律に抵触しない。
          if (GHOST_DMG_LOG_ENABLED && s.kind === 'ghost-ally') {
            const line = `${Math.round(gtNow / 100) / 10}s ${source ?? 'untagged'} `
              + `dmg=${Math.round(dealt)} hp→${Math.round(s.health - dealt)}`;
            console.log('[GHOSTDMG]', line);
            ghostDmgLines = [...ghostDmgLines, line].slice(-GHOST_DMG_LOG_MAX);
          }
          // v0.25.2586: 守護霊がこの被弾で落ちる(HP0以下=下のfilterで消える)なら寄り先を控える。
          if (s.kind === 'ghost-ally' && s.health - dealt <= 0) {
            ghostDeathAt = { x: s.x + s.width / 2, y: s.y + s.height / 2 };
            // v0.25.2599: 倒れた絵(しゃがみ)を描くための控え。実体はこの直後のfilterで消えるので、
            // レンダラが必要とする分(矩形/クラス/向き/時刻)をここで写す。描画専用。
            setGhostDeathPose({
              x: s.x, y: s.y, width: s.width, height: s.height,
              klass: s.ghostClass ?? 'warrior', facing: s.ghostFacing === -1 ? -1 : 1, atMs: now,
            });
          }
          // v0.25.2588(社長裁定): 守護霊も**被弾したらカウンター窓を閉じる**(プレイヤーと同じ規則=
          // §2.11追補「同じ仕様」。守護霊の全成立経路も ghostCounterWindowEnd を読むのでここ1箇所で効く)。
          const counterClose = (dealt > 0 && !LATE_COUNTER_ENABLED) ? { ghostCounterWindowEnd: 0 } : {};
          return { ...s, health: s.health - dealt, lastHit: now, ...kb, ...counterClose };
        })
        .filter(s => !isHittable(s) || s.health > 0),
    }));
    // v0.25.2586(社長指示「守護霊死んだときもカメラズーム スローしてほしい」): 死んだ守護霊の位置へ
    // 寄る+スロー。プレイヤーの死亡演出(useGameLoop)と同じ定数・同じ長さで揃える(停止は入れない)。
    if (ghostDeathAt) {
      const at: { x: number; y: number } = ghostDeathAt;
      get().triggerZoom(DEATH_ZOOM_MAG, DEATH_ZOOM_MS, DEATH_ZOOM_HOLD_MS, at.x, at.y);
      get().triggerTimeSlow(DEATH_SLOW_SCALE, DEATH_ZOOM_MS, DEATH_ZOOM_HOLD_MS);
      // v0.25.2587(社長報告「ズームされても一瞬でしかももう何もいなかった」の守護霊側): 守護霊の実体は
      // この瞬間に summons から消える(上のfilter)ので、**寄った先に何も無い**状態だった。
      // 消滅の絵を置いて「死んだ」と分かるようにする。色は守護霊の青白(§2.11の霊体の統一色。
      // 霊が赤い血を流すのは世界観に合わないためプレイヤーの赤とは別色)。演出のみ=判定に影響なし。
      get().spawnRing(at.x, at.y, 8, 128, 'rgba(159,216,255,0.9)', 6, DEATH_ZOOM_HOLD_MS);
      get().spawnRing(at.x, at.y, 22, 176, 'rgba(96,165,250,0.6)', 4, DEATH_ZOOM_MS);
      get().spawnGlow(at.x, at.y, GLOW_R_L, 'rgba(159,216,255,', DEATH_ZOOM_MS);
      get().spawnBurst(at.x, at.y, '#9fd8ff', 30);
      get().spawnBurst(at.x, at.y, '#60a5fa', 18);
    }
  },

  triggerKatanaDash: (dirX, dirY, ghostId) => {
    const now = Date.now();
    // 敵・破壊オブジェクトはここでは読まない(★着地時に実経路で取り直す=SAME_ARENA.md §7-2)。
    const { isPaused } = get();
    // v0.25.2518(裁定2): 主語(オーナー)。未指定=プレイヤー本体(従来と完全同一)。
    const player = combatActorPlayer(ghostId);
    if (!player) return false;
    if (!isKatanaMode(player) || isPaused) return false;
    if (ghostId === undefined && isPvpIncapacitated(get().player.pvpPosture, get().gameTime)) return false; // ★SAME_ARENA §9: 紫/daze中
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

    // ★社長裁定2026-08-24(SAME_ARENA.md §7-2「一閃は着地後の判定」): **標的の選定を着地時に行う。**
    // 旧: 発動の瞬間に「**予定**経路(始点→始点+154px)」で標的を確定していた。これだと
    //  ①壁で止まっても予定どおり斬れる(見たまんまが当たり判定に反する)
    //  ②移動の180msぶん敵が動いても反映されない=**一閃をかわす手段が無い**
    // 新: 始点と向きだけを焼き、**着地した実位置**まで(=実際に通った経路)で取り直す。
    //  ⇒ 新しい数字を足さずに **KATANA_DASH_MS(180ms)がそのまま前隙**になる。
    // ※ダメージ適用が着地後なのは従来どおり(下の setTimeout。ヒットストップが移動窓を食う対策)。
    // 村雨はクールダウン無し: ダッシュ終了時刻をそのままCD終了にして実質0に。
    const cooldownEnd = mura ? now + KATANA_DASH_MS : now + KATANA_DASH_MS + KATANA_DASH_COOLDOWN_MS;
    // 状態機械そのもの(距離/所要時間/硬直/CD)は主語によらず同じ1組を書く。
    const dashPatch: Partial<DashLocomotionState> = {
      katanaDashUntil: now + KATANA_DASH_MS,
      // 着地(KATANA_DASH_MS後)からさらに KATANA_DASH_RECOVERY_MS は硬直。
      katanaRecoveryUntil: now + KATANA_DASH_MS + KATANA_DASH_RECOVERY_MS,
      katanaDashDirX: ux,
      katanaDashDirY: uy,
      katanaDashCooldownEnd: cooldownEnd,
    };
    if (ghostId === undefined) {
      set(state => ({
        player: {
          ...state.player,
          ...dashPatch,
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
      // ★近接スイング確定の打刻(5経路の1つ=刀/村雨のスワイプ一閃・§1-3)。
      // v0.25.3784(検収監査 中4): ここが抜けていたため、**刀装備のスワイプ一閃だけ**が
      // 紫円(無の境地)の中で安全に振れてしまっていた。§1-3の規則は「プレイヤーの近接スイングが
      // 確定する箇所**すべて**に打つ」。守護霊(ghostId あり)は対象外=プレイヤーの操作ではない。
      get().commitMeleeSwing();
      // §8裁定済み#16: 一閃は前隙が無い経路=打刻の呼び出し時刻(now)がそのまま「押した瞬間」。
      get().noteMeleeSwingPressedAt(now);
    } else {
      // 守護霊: 防御規格を同一にする。プレイヤーの「invulnerableTime を過去へずらす」逆算打刻は
      // 実効的に「now + KATANA_DASH_MS まで無敵」と同値なので、ゴースト専用の無敵窓
      // (ghostInvulnUntil = damageSummon が見る)へ同じ終了時刻を入れる。向きは ghostFacing。
      // (プレイヤーの counterCooldownEnd 延長に対応するフィールドはゴーストに無い=近接の間隔は
      //  ghostDriver の lastMeleeAt が持つ。一閃自体のCDは katanaDashCooldownEnd で共有済み。)
      setActorDashState(ghostId, dashPatch, {
        ghostInvulnUntil: Math.max(0, now + KATANA_DASH_MS),
        ghostFacing: ux >= 0 ? 1 : -1,
      });
    }

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
    setTimeout(() => {
        // 主語を着地時点で再解決する(run reset / 刀を外した / **守護霊が解散した** をここで弾く)。
        const striker = combatActorPlayer(ghostId);
        if (!striker || !isKatanaMode(striker)) return;
        // ★実際に通った経路(始点=発動位置 / 終点=着地した実位置)。壁で止まればここが短くなる。
        const endX = striker.x + striker.width / 2, endY = striker.y + striker.height / 2;
        const travel = Math.hypot(endX - pcx, endY - pcy);
        // 距離0(その場で止められた)なら斬らない。向きは焼いた ux/uy をそのまま使う
        // (実位置がわずかに横へずれても「振った向き」は変わらないため)。
        const targetIds: string[] = [];
        const propTargetIds: string[] = [];
        if (travel > 1) {
          for (const e of get().enemies) {
            if (isReaperFamily(e.type) && !isTerminalReaper(e)) continue;
            if (isCorpse(e)) continue; // KILL吹き飛び(死体・§26-2): 一閃ダッシュの標的選定から除外
            const ex = e.x + e.width / 2 - pcx;
            const ey = e.y + e.height / 2 - pcy;
            const along = ex * ux + ey * uy;
            if (along < -e.width / 2 || along > travel + e.width / 2) continue;
            const perp = Math.abs(ex * uy - ey * ux);
            if (perp <= KATANA_DASH_HIT_HALF_WIDTH + e.width / 2) targetIds.push(e.id);
          }
          for (const prop of get().breakableProps) {
            const ex = prop.footX - pcx;
            const ey = prop.footY - pcy;
            const along = ex * ux + ey * uy;
            if (along < -prop.width / 2 || along > travel + prop.width / 2) continue;
            const perp = Math.abs(ex * uy - ey * ux);
            if (perp <= KATANA_DASH_HIT_HALF_WIDTH + prop.width / 2) propTargetIds.push(prop.id);
          }
        }
        if (targetIds.length === 0 && propTargetIds.length === 0) return; // 空振り(=かわされた)
        // 「斬」を出す位置 = **実際に通った軌道**の真ん中。
        const zanX = pcx + ux * travel / 2;
        const zanY = pcy + uy * travel / 2;
        const result = targetIds.length > 0
          ? get().performKatanaStrike(targetIds, KATANA_DASH_DAMAGE_MULT, true, ghostId)
          : { finish: false };
        // 経路上の松明などを破壊(近接フィニッシュと同等の高ダメージ)。
        const propDamage = KATANA_DAMAGE_BY_LEVEL[katanaLevel(striker)] * KATANA_DASH_DAMAGE_MULT * 2.5;
        for (const id of propTargetIds) {
          const prop = get().breakableProps.find(p => p.id === id);
          if (!prop) continue;
          const broken = get().damageBreakableProp(id, propDamage);
          get().spawnSlash(prop.footX, prop.footY - prop.height * 0.8, 'rgba(221,238,255,0.95)');
          if (broken) {
            if (broken.type === 'mine') {
              get().spawnBurst(broken.footX, broken.footY - 8, '#84cc16', 30);
              get().spawnRing(broken.footX, broken.footY - 8, 5, 50, 'rgba(132,204,22,0.82)', 4, 320);
              get().spawnGlow(broken.footX, broken.footY - 8, GLOW_R_S, 'rgba(132,204,22,', 320);
            } else {
              get().spawnBurst(broken.footX, broken.footY - 18, '#f97316', 18);
              get().spawnRing(broken.footX, broken.footY - 18, 6, 34, 'rgba(251,146,60,0.8)', 3, 320);
              get().spawnGlow(broken.footX, broken.footY - 18, GLOW_R_XS, 'rgba(251,146,60,', 360);
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
    return true;
  },

  // ワイヤーアンカー: フリックでフリック方向(dir)に固定距離ワイヤーを刺す。1秒後(wirePlantUntil)に
  // ループ側が startWireDash を呼んで高速移動を開始する。発動できたら true。
  triggerWireAnchor: (dirX, dirY, ghostId) => {
    const now = Date.now();
    const { gameTime, isPaused } = get();
    // v0.25.2518(裁定2): 主語(オーナー)。未指定=プレイヤー本体(従来と完全同一)。
    const player = combatActorPlayer(ghostId);
    if (!player) return false;
    if (isPaused) return false;
    if (ghostId === undefined && isPvpIncapacitated(get().player.pvpPosture, gameTime)) return false; // ★SAME_ARENA §9: 紫/daze中
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
    // G2.6: 発動の入口はオーナー(座標)に対して解決する。ワイヤーの効果=オーナーの体の移動。
    // v0.25.2518(裁定2): オーナーは主語(プレイヤー or 守護霊)。疑似Playerが実体の座標を着ているので
    // 同じ playerAsOwner をそのまま通せる(=ゴースト用の座標解決を別に書かない)。
    const wireOwner = playerAsOwner(player);
    const pcx = ownerCenterX(wireOwner);
    const pcy = ownerCenterY(wireOwner);

    // フリック方向の直線上・射程内にいる最初の敵を探す = ワイヤーが刺さる敵。
    // 居れば「大技」(即・引き上げ→垂直斬り下ろし→着地ノックバック)。居なければ従来の地点プラント。
    let target: Enemy | null = null;
    {
      let bestProj = Infinity;
      for (const e of get().enemies) {
        if (e.aiPhase === 'jump') continue;           // 空中無敵は刺さらない
        if (isCorpse(e)) continue; // KILL吹き飛び(死体・§26-2): ワイヤーの刺さり先から除外
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
      // 除外4(運用系): 守護霊起因はプレイヤーの様式計測(G4a)へ混ぜない。
      if (ghostId === undefined) recordWireAnchorUse('slam'); // G4a(§2.9(3)・記録専用): スラム型(敵ヒット)の様式カウンタ
      const tcx = target.x + target.width / 2, tcy = target.y + target.height / 2;
      const ddist = Math.max(0.001, Math.hypot(tcx - pcx, tcy - pcy));
      const slamPatch: Partial<DashLocomotionState> = {
        wireAnchorX: tcx, wireAnchorY: tcy,        // 敵の真上(=敵中心)へ引き上げる
        wireAnchored: false, wirePlantUntil: 0,
        wireDashUntil: now + WIRE_SLAM_MS,         // 待ち無しで即発動
        wireDashSpeed: ddist / (WIRE_SLAM_MS / 1000),
        wireStuckEnemyId: '', wireStuckUntil: 0,
        wireSlamEnemyId: target!.id, wireSlamStart: now,
        // スラム後ジャンプ離脱(ホップ)用: 発動時のオーナー中心を保存(戻り方向の計算に使う)。
        wireSlamFromX: pcx, wireSlamFromY: pcy,
      };
      if (ghostId === undefined) {
        set(s => ({
          player: {
            ...s.player,
            ...slamPatch,
            invulnerable: true,                        // 空中は無敵(既存被弾無敵を流用)
            invulnerableTime: now - Math.max(0, INVULN_MS - WIRE_SLAM_MS),
          },
          anchorEnemyHitFxAt: now,                     // 命中SEのトリガ
        }));
      } else {
        // 守護霊も**同じ防御規格**: 空中は無敵(プレイヤーの逆算打刻と同じ「now+WIRE_SLAM_MSまで」)。
        // 守護霊速死の根治=ワイヤー中に殴られない規格がゴーストにも入る。
        setActorDashState(ghostId, slamPatch, { ghostInvulnUntil: now + WIRE_SLAM_MS });
        set({ anchorEnemyHitFxAt: now });              // 命中SEのトリガ(SE自体は共通経路)
      }
      get().spawnRing(tcx, tcy, 6, 26, 'rgba(186,230,253,0.9)', 2, 200);
      // v0.25.2541(§2.11追補): CDは主語の帳簿へ(プレイヤー=従来どおり/守護霊=自前帳簿)。
      setActorSubWeaponCooldown(ghostId, 'wire-anchor', gameTime + WIRE_SLAM_MS + WIRE_COOLDOWN_BY_LEVEL[lvl]);
      return true;
    }

    if (ghostId === undefined) recordWireAnchorUse('plant'); // G4a(§2.9(3)・記録専用): プラント型(空振り=地点打ち込み)の様式カウンタ
    const ax = pcx + ux * dist;
    const ay = pcy + uy * dist;
    setActorDashState(ghostId, {
      wireAnchorX: ax,
      wireAnchorY: ay,
      wireAnchored: true,
      wirePlantUntil: now + WIRE_PLANT_DELAY_MS, // この時刻に自動で高速移動開始
      wireDashUntil: 0,
      wireStuckEnemyId: '',
      wireStuckUntil: 0,
    });
    set({ anchorPlantFxAt: now }); // 打ち込み音SEのトリガ
    get().spawnRing(ax, ay, 6, 22, 'rgba(96,165,250,0.85)', 2, 220); // 刺さった地点の小ポップ
    // CD は刺した直後から「待ち1秒 + 移動 + 規定CD」分かけておく(待ち中の連射防止)。
    // v0.25.2541(§2.11追補): CDは主語の帳簿へ(プレイヤー=従来どおり/守護霊=自前帳簿)。
    setActorSubWeaponCooldown(ghostId, 'wire-anchor', gameTime + WIRE_PLANT_DELAY_MS + WIRE_DASH_MS + WIRE_COOLDOWN_BY_LEVEL[lvl]);
    return true;
  },

  // 刺してから1秒後に呼ばれ、アンカー地点へ高速移動を開始する。
  startWireDash: (ghostId) => {
    const now = Date.now();
    const player = combatActorPlayer(ghostId); // v0.25.2518(裁定2): 主語(未指定=プレイヤー)
    if (!player) return;
    if (!player.wireAnchored) return;
    const pcx = player.x + player.width / 2;
    const pcy = player.y + player.height / 2;
    const dist = Math.max(0.001, Math.hypot(player.wireAnchorX - pcx, player.wireAnchorY - pcy));
    const dashPatch: Partial<DashLocomotionState> = {
      wireDashUntil: now + WIRE_DASH_MS,
      wireDashSpeed: dist / (WIRE_DASH_MS / 1000),
      wireAnchored: false,
      wirePlantUntil: 0,
    };
    if (ghostId === undefined) {
      set(s => ({
        player: {
          ...s.player,
          ...dashPatch,
          // 移動中は無敵(既存の被弾無敵を流用。INVULN_MS の自動解除が移動終了とほぼ一致するよう開始時刻をずらす)。
          invulnerable: true,
          invulnerableTime: now - Math.max(0, INVULN_MS - WIRE_DASH_MS),
        }
      }));
    } else {
      // 守護霊も同じ防御規格(移動中は無敵・終了時刻はプレイヤーの逆算打刻と同値)。
      setActorDashState(ghostId, dashPatch, { ghostInvulnUntil: now + WIRE_DASH_MS });
    }
    get().spawnRing(player.wireAnchorX, player.wireAnchorY, 8, 30, 'rgba(96,165,250,0.8)', 2, 260);
  },

  // スラム後ジャンプ離脱(ホップ)。着地点(targetX/Y)は呼び出し側(useGameLoop)が
  // computeWireHopLanding(src/utils/wireHop.ts)で計算して渡す。startWireDashと同じ
  // 「移動中は無敵(逆算打刻)」パターンを流用。wireDashUntil/wireAnchorXは一切触らない
  // (既存のスラム/プラント着地処理を再発火させないための専用フィールド)。
  startWireHop: (targetX, targetY, ghostId) => {
    const now = Date.now();
    const player = combatActorPlayer(ghostId); // v0.25.2518(裁定2): 主語(未指定=プレイヤー)
    if (!player) return;
    const pcx = player.x + player.width / 2;
    const pcy = player.y + player.height / 2;
    const dist = Math.max(0.001, Math.hypot(targetX - pcx, targetY - pcy));
    const hopPatch: Partial<DashLocomotionState> = {
      wireHopTargetX: targetX,
      wireHopTargetY: targetY,
      wireHopUntil: now + WIRE_HOP_MS,
      wireHopSpeed: dist / (WIRE_HOP_MS / 1000),
    };
    if (ghostId === undefined) {
      set(s => ({
        player: {
          ...s.player,
          ...hopPatch,
          invulnerable: true,
          invulnerableTime: now - Math.max(0, INVULN_MS - WIRE_HOP_MS),
        }
      }));
    } else {
      // 離脱(ホップ)の無敵もプレイヤーと同一規格。守護霊がボス密着着地で確定被弾する事故も同時に消える。
      setActorDashState(ghostId, hopPatch, { ghostInvulnUntil: now + WIRE_HOP_MS });
    }
  },

  // v0.25.2525(GHOST-REFLECT-MELEE-SUBS・発注B / 台帳§3-3): 守護霊の気絶敵フィニッシュ。
  applyGhostMeleeFinisher: (ghostId, enemyId) => {
    const st = get();
    const enemy = st.enemies.find(e => e.id === enemyId);
    const actor = combatActorPlayer(ghostId); // 疑似Player(計測時ビルド+実体の座標/HP)
    if (!enemy || !actor) return null;
    const melee = actor.weapons.find(w => w.isMelee);
    // 裁定はプレイヤーのナイフスイングと同じ1本(値・条件・優先順はそのまま)。
    // 育成の攻撃力(research/GROWTH.md v4)はナイフと同じく**素ダメージへ前掛け**する。主語は疑似Player
    // =スナップショットに写した計測時の育成倍率(欠損=旧データは1.0)。
    const hit = resolveStunnedMeleeHit(
      enemy, meleeSwingBaseDamage(melee, actor) * (actor.growthAtkMult ?? 1), st.gameTime, BOSS_MELEE_STUN_MULT,
    );
    if (!hit) return null;
    const now = Date.now();
    // v0.25.2582(試験改定): 守護霊のフィニッシュにも停止+スロー+寄りズーム(プレイヤーの
    // triggerCounter側と同型・CDはtriggerFinishImpact内の共有1本=スパムしない)。?ghostzoom=0で従来へ。
    if (GHOST_ZOOM_TRIAL_ENABLED) {
      get().triggerFinishImpact(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2);
    }
    if (hit.kind === 'execute') {
      // 即時処刑(プレイヤーの killed{finisher:true} 相当)。viaMeleeFinish=true=§5.21-追補4の
      // 数字は出さない(プレイヤーの処刑と同じ)。
      const killed = get().damageEnemy(enemyId, enemy.health + 1, false, false, true, null, 'ghost');
      if (killed) {
        // 「Kill!」の文字はプレイヤーの処刑と同じ(社長裁定v0.25.2528「文字は出して欲しい」=
        // 除外1は停止/スロー/ズームの演出だけで、文字calloutは除外に含めない)。文言・色・表示時間は
        // プレイヤーのフィニッシュ(triggerFinishImpact内)と同一。停止/スロー/ズーム本体は出さない。
        get().spawnCallout(enemy.x + enemy.width / 2, enemy.y - 6, 'Kill!', '#ffe4e6', {
          bg: 0x7a1322, holdMs: MELEE_FINISH_SLOW_HOLD_MS, duration: MELEE_FINISH_SLOW_MS,
        });
      }
      return { kind: hit.kind, dmg: 0, killed };
    }
    const dmg = Math.max(1, Math.round(hit.dmg));
    const killed = get().damageEnemy(enemyId, dmg, false, false, true, null, 'ghost');
    get().spawnDamageNumber(enemy.x + enemy.width / 2, enemy.y, dmg, true); // 金の数字=プレイヤーのフィニッシュ打と同じ
    if (!killed) {
      // 倒しきれなかった時のパッチもプレイヤーと同じ(気絶解除=完全気絶中は維持 / 浮き420ms)。
      set(s => ({
        enemies: s.enemies.map(e => e.id === enemyId
          ? {
            ...e,
            // §6.38 v7: 守護霊の気絶敵フィニッシュもプレイヤーと同じ裁定(keepStunは'boss'kindのみ)。
            stunUntil: hit.kind === 'boss' && hit.keepStun ? e.stunUntil : undefined,
            liftUntil: now + MELEE_STUN_LIFT_MS,
          }
          : e),
      }));
    }
    return { kind: hit.kind, dmg, killed };
  },

  // v0.25.2525(GHOST-REFLECT-MELEE-SUBS・発注C / 台帳§7・項目11の前倒し分):
  // 守護霊の近接スイング(通常スイング/刀の一閃)を入口に、相乗り型サブをプレイヤーと同じ条件・
  // 同じ効果で発動する。式・定数は共有ヘルパ側。
  // 主語(倍率/所持/Lv)=計測時ビルドの疑似Player、狙い(座標/向き)=ゴースト実体。
  // v0.25.2541(§2.11追補・発注B/C): CDの帳簿は**主語ごと**(守護霊は自前=旧「1つの財布」を廃止)。
  // 相乗り型サブに **分身(shadow-clone)** と **センサー地雷(sensor-mine)** を追加=プレイヤーの
  // 近接スイング入口(triggerCounter)と同じ顔ぶれ・同じ順序になった(★未決2/★未決5の裁定を実装)。
  fireGhostMeleeSwingSubs: (ghostId) => {
    const none = { boomerang: false, flare: false, junk: false, clone: false, mine: false };
    const st = get();
    const ghost = st.summons.find(s => s.id === ghostId && s.kind === 'ghost-ally');
    const actor = combatActorPlayer(ghostId); // 疑似Player(ビルド+実体の座標/HP)。ビルド無し=null
    if (!ghost || !actor) return none;
    const owner: SubWeaponOwner = ghostAsOwner(ghost);
    const gameTime = st.gameTime;
    const melee = actor.weapons.find(w => w.isMelee);
    const meleeDamage = meleeSwingBaseDamage(melee, actor); // ブーメランの接触ダメージ=通常近接同等
    // 呼び出し順は triggerCounter と同じ(ブーメラン→地雷→フレア→ジャンク→分身)。
    const boomerang = fireDroneBoomerangOnSwing(get, actor, owner, gameTime, meleeDamage);
    const mine = placeSensorMineOnSwing(get, actor, owner, gameTime);
    const flare = fireFlareGunOnSwing(actor, owner, gameTime);
    const junk = fireJunkWeaponOnSwing(get, actor, owner);
    const clone = spawnShadowCloneOnSwing(get, actor, owner, gameTime);
    return { boomerang, flare, junk, clone, mine };
  },

  damagePlayer: (rawAmount, source, fromX, fromY, damagerType, damagerWasNamed, damageSourceMove) => {
    const { player } = get();

    // 二人組クエストv2 §2-8(納品ロック): 納品成立後は被弾を入口で無条件に棄却する。
    // invulnerable(INVULN_MS=1000)は自動失効するため使えない(会話は7〜10秒続く)。
    if (get().deliveryLocked) return false;

    // ★被弾無敵(i-frame)。**幻影の近接だけはこれを無視して通る**(社長裁定2026-08-24
    // 「無敵時間については、幻影側にプレイヤーも合わせて。これは幻影とプレイヤー間だけの制約のはず」)。
    // 幻影側は 2026-08-20 の裁定で既に「近接・近接カウンターは i-frame 無視」になっており、
    // プレイヤー側だけが除外していなかった=幻影の近接が銃の i-frame に吸われる非対称があった。
    // 規則の正本は phantomGate の1本(playerIframeApplies / iframeAppliesToSource)。
    // **通常の敵・環境ダメージには1bitも影響しない**(damagerType が幻影の時だけ門が開く)。
    if (player.invulnerable && playerIframeApplies(damagerType)) return false;

    // 社長指示v0.25.3300 ナイト覚醒(Lv3): 一定確率(KNIGHT_AWAKEN_NULLIFY_CHANCE=20%。
    // 社長「10%でもいいかも?バランス次第」)で被ダメージを完全無効化。盾色の小フラッシュだけ出す
    // (既存粒子プールのみ・判定は「無効化された」の1bit)。
    if (rawAmount > 0 && skillLevel(player, 'knight') >= 3 && Math.random() < KNIGHT_AWAKEN_NULLIFY_CHANCE) {
      const kcx = player.x + player.width / 2, kcy = player.y + player.height / 2;
      get().spawnRing(kcx, kcy, 10, 36, 'rgba(147,197,253,0.9)', 3, 260);
      get().spawnBurst(kcx, kcy, '#93c5fd', 6);
      return false;
    }

    // スキル: ナイト(×0.8)/バーサーカー(×1.2)/消費カード「プロテクション」(×0.7・§23) の被ダメ補正。
    // ランナー覚醒(Lv3・v0.25.3300): 加速中は×0.8。amount>0 のみ補正。
    const skilled = rawAmount > 0
      ? rawAmount * skillIncomingDamageMult(player, get().gameTime) * runnerAwakenDamageMult(player)
      : rawAmount;
    // 訓練(M0)は**死なない**(社長指示v0.25.2302「チュートリアルではHPは1になるけど死なない。
    // 衛生兵が1秒後には回復しちゃう」)。ハンターのジャンプ攻撃のような大ダメージでもHP1で踏みとどまる。
    // 教習の途中でゲームオーバーになると台本が最初からやり直しになり、教える順序が成立しない。
    // ※回復(衛生兵)は useGameLoop 側の台本が1秒後に行う。ここは「死なせない」だけ。
    // v0.25.2630(社長裁定「おねがい」): **ボスメーカーの無敵を訓練(M0)と別扱いにする。**
    //
    // 事故(社長報告「殴り、狙撃線は何も食らってない」): 当初は両方を同じ `noDeath` 機構
    // (=HP1で踏みとどまる)に載せていた。するとHPが1に達した瞬間から
    // `Math.max(0, player.health - 1)` が 0 になり、**以降どんな技を食らっても amount=0**。
    // ダメージ数字・シェイクは `amount > 0` を条件にしているので**全部止まる**。
    // しかも技によって見え方が割れた:
    //   ・**爆風経路の技** … `combatTick` が player-damage SE を**無条件**で鳴らす ⇒「点滅とSEはなる」
    //   ・**狙撃線** … `damagePlayer` を直接呼ぶだけでSEを鳴らさない ⇒ **本当に何も出ない**
    // 社長の「この二つは何もない」という観測はこの割れ方そのものだった。
    //
    // 直し方: メーカーの無敵は **HPを一切減らさない**代わりに **ダメージは満額で通す**
    // (=数字・フラッシュ・シェイク・被弾ノックバックが正しく出る)。
    // 「**当たったことが分かる**」がこの部屋の目的(BOSS_MAKER.md §1-2)なので、こちらが正しい。
    // 訓練(M0)の「HP1で踏みとどまる」は**従来どおり**(社長指示v0.25.2302・意図が別物)。
    const makerInvincible = get().bossMaker.active && get().bossMaker.invincible;
    const noDeath = get().farBackdrop === 'tutorial';
    const amount = noDeath && skilled > 0
      ? Math.min(skilled, Math.max(0, player.health - 1))
      : skilled;

    // G4a(BOT_AND_GHOST.md §2.9・記録専用): 技キー付きの実被弾を反応表へ通知する(ワクチン発動でも
    // 「その技を食らった」事実は同じなので、分岐より前のここで1回だけ)。挙動には一切影響しない。
    if (amount > 0 && damageSourceMove !== undefined) notifyMoveDamage(damageSourceMove);

    // メーカーの無敵中はHPを減らさないので構造的にも死なないが、明示しておく(ワクチン発動も抑止)。
    const wouldDie = !makerInvincible && player.health - amount <= 0;
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
      get().spawnGlow(cx, cy, GLOW_R_M, 'rgba(74,222,128,', 520);
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
      // v0.25.2630: メーカーの無敵は**HPを減らさない**。amount は満額のまま通してあるので、
      // ダメージ数字・フラッシュ・シェイク・ノックバックは通常どおり出る=「当たった」が必ず分かる。
      const newHealth = makerInvincible ? state.player.health : Math.max(0, state.player.health - amount);
      return {
        // 被弾総量(survivalScore用)。実ダメージ(amount>0)のみ加算。
        // ★v0.25.3555: あわせて**被弾回数**と**HP最低値**も記録する(AI実機テストの計器)。
        // HP最低値はここで採る=ダメージが入った直後が必ず最小値なので、毎フレーム走査は要らない。
        gameStats: amount > 0 ? {
          ...state.gameStats,
          damageTaken: state.gameStats.damageTaken + amount,
          hitsTaken: state.gameStats.hitsTaken + 1,
          minHpFrac: Math.min(
            state.gameStats.minHpFrac,
            state.player.maxHealth > 0 ? newHealth / state.player.maxHealth : 1,
          ),
        } : state.gameStats,
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
          // research/AI_HUMANIZE.md B1(§1-1 ctxHit・記録専用): 実ダメージ(amount>0)の瞬間だけ打刻。
          // gameTime系(判定・挙動には使わない=habitEpisode.tsの被弾コンテキスト判定専用)。
          lastDamagedAtGame: amount > 0 ? state.gameTime : state.player.lastDamagedAtGame,
          // v0.25.2588(社長裁定「食らうタイミングをカウンターと見ない修正」): **被弾したらカウンター窓を
          // 閉じる**。他ゲーム(Sekiro/ソウル系/アーカム)と同じ二値=「被弾した=弾き失敗」へ揃える。
          // 旧: 窓さえ開いていれば被弾していてもカウンターが成立し、「Counter!と出たのにHPが減る」
          // (=バグにしか見えない)状態だった。**窓を閉じる1箇所で全成立経路(7箇所)に効く**
          // ——どの経路も counterWindowEnd を読むため、判定コードには一切触らない。
          // `?lastcounter=1` で旧挙動(被弾していてもカウンター可)へ完全復帰(A/B比較用)。
          counterWindowEnd: (amount > 0 && !LATE_COUNTER_ENABLED) ? 0 : state.player.counterWindowEnd,
          knockbackVx: kbApply ? kbVx : state.player.knockbackVx,
          knockbackVy: kbApply ? kbVy : state.player.knockbackVy,
          knockbackUntil: kbApply ? kbNow + PLAYER_KNOCKBACK_MS : state.player.knockbackUntil,
          // ★持続時間も**必ず一緒に書く**(v0.25.2653)。技ごとの長い押し出しの直後に通常の被弾が
          // 来た時、ここを書かないと**前の技の持続時間で減衰が計算され**、初速が合わなくなる。
          knockbackMs: kbApply ? PLAYER_KNOCKBACK_MS : state.player.knockbackMs,
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
        get().spawnGlow(pcx, pcy, GLOW_R_S, 'rgba(56,189,248,', 360);
        get().spawnExplosionFx(pcx, pcy, radius); // v0.25.3283: 爆発flipbook(全爆発共通)
        // 社長指示v0.25.3270: ノックバックは実距離50px基準に統一(knockbackSpeedFor(50,280)/BULLET_KNOCKBACK_SPEED)。
        // エクスプローダー覚醒(Lv3): 爆発KB距離×1.5(v0.25.3300)。
        const kbMult = knockbackSpeedFor(SKILL_BLAST_KB_PX, KNOCKBACK_DURATION) / BULLET_KNOCKBACK_SPEED * skillExplosionKbMult(p);
        for (const e of get().enemies) {
          if (isReaperFamily(e.type) && !isTerminalReaper(e)) continue;
          if (isCorpse(e)) continue; // KILL吹き飛び(死体・§26-2): 反射神経の反撃爆発の対象から除外
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
    // PACING_PUZZLE.md §5.14 M13: 死亡時、殺した敵の型を宿敵へ昇格判定(城ボス/死神/裏ボス/幻影/
    // 紅き月個体/型不明は除外。自分の宿敵インスタンスに殺された場合は強化せず因縁+1のみ)。
    // ★練習ラン中は昇格しない(v0.25.3694): practiceGuardはlocalStorageを塞ぐが**メモリのstateは
    // 塞がない**。決闘で幻影に倒される→メモリの宿敵が幻影化→リロード無しで通常出撃→resetGameの
    // saveNamedFoe(carried)で**通常ラン側からディスクへ固定**、の抜け道で「通常プレイに鴉が乱入」が
    // 実際に起きた(社長報告2026-08-20)。練習は本編の状態を1bitも動かさない=メモリ側もここで塞ぐ。
    if (died && NAMED_ENEMY_ENABLED && !isPracticeRun()) {
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
    // 消費カード「経験値ブースト」(×1.5・60秒・§23)をここへ合流(経験値付与の唯一の出どころ)。
    // 育成「経験値効率」(社長指示v0.25.3679・+10%×5段)もここで掛ける(焼き値=次の出撃から)。
    const gained = amount * XP_GAIN_MULT * consumableXpMult(get().player, get().gameTime) * (get().player.growthXpMult ?? 1); // 全体調整: 経験値1/3
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
    // ★v0.25.3980(社長報告「いっきにレベルアップ(2個とか3個)したとき、パワーアップ画面が1回しか
    // 出ないかも」): **提示待ちの間(イントロ演出中/メニュー表示中)は次のlevelUp()を保留する**。
    // 旧: 同一フレームに複数の経験値が入る(まとめ拾い・マグネット等)と levelUp() が連打され、
    // upgradeOptions が上書きされて「レベルは複数上がるのに選べるのは1回」になっていた
    // (ボス開始チェストの実装コメントに同じ罠の記述あり=v0.25.3137)。繰り越したEXPは
    // 選択後の連鎖(selectUpgrade末尾)と毎フレーム再チェック(useGameLoop)が1回ずつ拾う=1レベル1提示。
    if (get().showUpgradeMenu || get().levelUpIntroUntil > 0) return;
    // Check if player should level up
    const { player, enemies } = get();
    if (player.experience >= player.experienceToNextLevel) {
      // 社長相談(v0.25.1499): ジャンプ着地/ダッシュの赤ライン当たり判定内にいる間は保留
      // (useGameLoopが毎フレーム再チェックして、抜けたタイミングで発動させる)。
      if (isPlayerInAttackTelegraph(player, enemies, PUMPKIN_EXPLOSION_RADIUS, GIANT_STOMP_RADIUS, GIANT_SWEEP_HALF_WIDTH)) return;
      get().levelUp();
    }
  },

  levelUp: () => {
    // SKILL_BUILD_REDESIGN.md §16-4/§17-1点5: M0(訓練)はスキル提示が成立しない(§2-4)ため、
    // 装備カードも廃止した後のスキル専業3択は必ず空になる。メニュー自体を出さず、自動で
    // スクラップ+50相当を付与する(無演出=下のFX/telemetryも呼ばない)。
    const isTutorialStage = get().farBackdrop === 'tutorial';
    set(state => {
      const { player } = state;
      // レベルアップ: 周辺の敵を強制ノックバック(2倍相当)。メニューで即ポーズするので velocity だと
      // 失効する → その場で位置を押し出す(木/小物の当たりは解決)。
      const pcx = player.x + player.width / 2;
      const pcy = player.y + player.height / 2;
      const solidPropsForShove = state.breakableProps.filter(pr => pr.type !== 'mine' && pr.type !== 'uv-bar');
      const shovedEnemies = state.enemies.map(e => {
        if (isReaperFamily(e.type)) return e;
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
      // v0.25.3137: 式は utils/levelCurve.ts へ移した(宝箱の「3レベルアップ」が同じ式を要るため。
      // 同じ値を2箇所に持たない=TEST_DESIGN.md 型Aの予防)。値・挙動は1ビットも変えていない。
      const newExpToNextLevel = nextLevelThreshold(newLevel, player.experienceToNextLevel);

      // Update max level in stats if needed
      const newMaxLevel = Math.max(state.gameStats.maxLevel, newLevel);

      if (isTutorialStage) {
        return {
          player: {
            ...player,
            level: newLevel,
            experienceToNextLevel: newExpToNextLevel,
            experience: Math.max(0, player.experience - player.experienceToNextLevel),
            straps: player.straps + LEVELUP_SCRAP_REWARD,
          },
          enemies: shovedEnemies,
          gameStats: { ...state.gameStats, maxLevel: newMaxLevel },
        };
      }

      // SKILL_BUILD_REDESIGN.md §12-1: レベルアップ=スキル専業3択(新規∪Lv+1)+常設スクラップ+50。
      // 装備カードは出さない(装備は商人=B2)。
      const draftInput: RunSkillDraftInput = {
        owned: state.ownedSkills,
        ownedLevels: state.ownedSkillLevels,
        runSkills: state.runBuild,
        runSkillLevels: player.skillLevels,
        playerLevel: newLevel,
        excluded: state.vanishedSkills,
        dogEquipped: player.subWeapons.includes('dog'),
        grenadeEquipped: player.subWeapons.includes('heavy-grenade'),
        glauncherOwned: player.weapons.some(w => !w.isMelee && w.category === 'glauncher'), // v0.25.3441: bomberの発動源に数える
        activeConsumables: activeConsumableKeys(player, state.gameTime), // §23-2条件1/条件3
      };
      const upgradeOptions = generateSkillUpgradeChoices(draftInput, 3, Math.random, RAIL_KIND, RAIL_MULT);

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
    if (isTutorialStage) {
      // §16-4/§17-1点5: 無演出。メニューを出していないのでtelemetryの「提示」にも数えない
      // (自動付与は選択行動ではないため)。スクラップ収支だけ流路別に記録する。
      recordScrapIncome('levelup', LEVELUP_SCRAP_REWARD);
      return;
    }
    // SKILL_BUILD_REDESIGN.md §15-1(B0発注文)の2: レベルアップ提示回数(ボス開始チェストの3連続も
    // levelUp()を3回通るので、この1箇所で自然に3回とも数えられる=§11-1 A-5の設計どおり)。
    recordUpgradeOffered();
    // 演出: 時間スロー＋押しのけリング＋キャラを派手に光らせる(社長指示)。メニューは intro 後に開く。
    get().triggerTimeSlow(0.25, LEVELUP_INTRO_MS);
    const lp = get().player;
    const cx = lp.x + lp.width / 2, cy = lp.y + lp.height / 2;
    get().spawnRing(cx, cy, 14, LEVELUP_KNOCKBACK_RADIUS, 'rgba(250,204,21,0.7)', 3, 260);
    // キャラを派手に: 大きく明るいグロー(芯=白＋金ハロー)を重ねがけ。
    get().spawnGlow(cx, cy, GLOW_R_XXL, 'rgba(253,224,71,', LEVELUP_INTRO_MS + 200);
    get().spawnGlow(cx, cy, GLOW_R_L, 'rgba(255,255,255,', LEVELUP_INTRO_MS);
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
    if (isPvpIncapacitated(player.pvpPosture, get().gameTime)) return; // ★SAME_ARENA §9(検収監査 重大①): 紫/daze中は撃てない
    // 社長指示v0.25.3300 シーカー仕様変更: 半透明中は攻撃できない(覚醒Lv3は可)。
    if (isSeekerActive(player, get().gameTime) && skillLevel(player, 'seeker') < 3) return;
    // 吸い付き中の敵(movePlayer が算出した phillSnapEnemyId)を発砲時点で確認。
    const snapEnemy = player.phillSnapEnemyId != null
      ? get().enemies.find(e => e.id === player.phillSnapEnemyId)
      : undefined;
    // 立ち止まりガード: スナップ中は移動中でも撃てる(離した瞬間=停止)。非スナップは従来どおり立ち止まり必須。
    if (player.isMoving && !snapEnemy) return;
    const now = Date.now();
    if (isReloading(player, weapon.id)) return;
    if ((weapon.magazine ?? 0) <= 0) { get().autoSwitchIfDry(); return; }
    // バーサーカー覚醒(Lv3・v0.25.3300): HP40%以下は連射+10%(通常射撃と同じ倍率をPHILLにも適用)。
    if (now - weapon.lastFired < (weapon.cooldown ?? 1000) / ((player.equipBonus?.fireRateMult ?? 1) * berserkerAwakenFireRateMult(player))) return;
    // GAME_AUDIT #10: 通常射撃(weaponUtils)と同じダメージ倍率を適用する。従来は連射装備だけ
    // 効いてダメージ装備・スキル・スカベンジャーが素通りだった(速くなるが強くならない非対称)。
    // スキル: ラストマガジン = 弾倉最後の1発 ×2.0/2.5/3.0(PHILLも対象・§6.8 M31)。
    // 消費カード「アタックドーピング」(+20%・60秒・§23)もアタックシューターと同じ合流点へ乗せる。
    const phillDamage = weapon.damage * scavengerGunMult(player, get().gameTime) * skillAttackShooterGunMult(player) * consumableAttackMult(player, get().gameTime) * (player.equipBonus?.damageMult ?? 1) * skillLastMagazineMult(player, weapon.magazine ?? 0);
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
        passthrough: false, hitEnemies: [], hostile: false, reflected: false, critChance: 0,
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
        passthrough: false, hitEnemies: [], hostile: false, reflected: false, critChance: 0,
      });
    }
    // 裁定4(§2.11・記録専用): PHILLの発射数を1つ数える(ヘッドショット数は着弾側=useGameLoopでフック)。
    // 率は撃破セッション確定時にビルド写しへ焼かれ、守護霊がその確率でヘッドショットを再現する。
    recordPhillShot();
    const nextMag = Math.max(0, (weapon.magazine ?? 0) - 1);
    set(state => ({ player: { ...state.player, weapons: state.player.weapons.map(w => w.id === weapon.id ? { ...w, lastFired: now, magazine: nextMag } : w) } }));
    if (nextMag <= 0) get().autoSwitchIfDry(); // 空なら既存経路でリロード
  },

  selectUpgrade: (upgrade) => {
    // SKILL_BUILD_REDESIGN.md §15-1(B0発注文)の2: 選択内訳counter。upgrade.typeは呼び出し引数から
    // 直接分かるのでset()の内部を読む必要がない(set()内は再入set禁止=telemetryは外側で呼ぶ)。
    recordUpgradeSelected(upgrade.type);
    if (upgrade.type === 'scrap') {
      // §15-1の4: レベルアップ③枠(常設スクラップ+50)の収入(下のset()内の'scrap'分岐と同じ式)。
      recordScrapIncome('levelup', upgrade.level > 0 ? upgrade.level : 50);
    }
    if (upgrade.type === 'skill' && upgrade.skillCardKind === 'new') {
      // §13-4/§17: 枠充足タイミング(この1枚でrunBuildが何枠目まで埋まったか)。
      recordSlotFilled(get().gameTime, get().player.level);
    }
    // SKILL_BUILD_REDESIGN.md §24: 覚醒(Lv3到達)演出のトリガー値。set()の内側で判定するawakenedと
    // 同じ条件をここへ写す場所は無い(set内のconstはコールバックローカル)ので、set()の中で拾って
    // このクロージャ変数へ書く(set後に発火する他のパターン=reaperDefeated/bossFullStunAt等と同型)。
    let awakenedFx: { key: SkillKey; skillName: string } | null = null;
    set(state => {
      const { player } = state;

      // SKILL_BUILD_REDESIGN.md §12-1/§17: スキル専業レベルアップの取得(新規取得 or Lv+1)。
      if (upgrade.type === 'skill' && upgrade.skillKey) {
        const key = upgrade.skillKey;
        const isNew = upgrade.skillCardKind === 'new';
        const nextLv = Math.max(1, Math.floor(upgrade.skillLv ?? 1));
        const prevLv = player.skillLevels[key] ?? 1;
        // canAcquireRunSkillが「枠判定の唯一の出どころ」(§2-1)。抽選側(draftRunSkillCards)も
        // 同じ関数の枠チェックを通っているが、取得の最終ゲートとしてここでも通す(二重の守り)。
        // §23-2条件1: アクティブな消費カードもノーマル枠の占有分としてここへ含める。
        const nextRunBuild = isNew && canAcquireRunSkill(state.runBuild, key, activeConsumableCount(player, state.gameTime))
          ? [...state.runBuild, key] : state.runBuild;
        const nextPlayerSkills = isNew && !player.skills.includes(key) ? [...player.skills, key] : player.skills;
        const nextSkillLevels = { ...player.skillLevels, [key]: nextLv };
        // §16-10 ★B: Lv3(覚醒)到達のフラグ+SE用フックのみ(演出はB7)。新規取得でいきなりLv3が
        // 出るケース(pity超レア等)は「覚醒」ではない=Lv+1でmaxへ到達した時だけ立てる。
        const awakened = !isNew && prevLv < skillMaxLevel(key) && nextLv >= skillMaxLevel(key);
        if (awakened) awakenedFx = { key, skillName: SKILLS[key].name }; // §24: set後にburst+帯を発火
        return {
          player: { ...player, skills: nextPlayerSkills, skillLevels: nextSkillLevels },
          runBuild: nextRunBuild,
          ...(awakened ? { skillAwakenAt: { ...state.skillAwakenAt, [key]: Date.now() } } : {}),
          showUpgradeMenu: false,
          isPaused: false,
        };
      }

      // SKILL_BUILD_REDESIGN.md §23: 消費カード(取得で即発動・60秒・温存不可)。
      if (upgrade.type === 'consumable' && upgrade.consumableKey) {
        return {
          player: applyConsumableCard(player, upgrade.consumableKey, state.gameTime),
          showUpgradeMenu: false,
          isPaused: false,
        };
      }

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
    // SKILL_BUILD_REDESIGN.md §24: 覚醒(Lv3到達)演出。set()の外=levelUp()のイントロ演出
    // (triggerTimeSlow/spawnRing/spawnGlow直呼び)と同じ型。視覚のみ・判定/速度/スロー無し
    // (§24-2条件2)。SEはaudioManager非依存を保つ既存方針のため鳴らさない(useGameLoopが
    // awakenCutinの変化を検知して鳴らす)。
    if (awakenedFx) {
      const prevCutin = get().awakenCutin;
      // 多重発火は1回に纏める(社長指示・理論上のリロール連打等): 直前のカットインがまだ
      // 表示中(AWAKEN_CUTIN_MS以内)なら、絵/帯を重ねて出さない。
      if (!prevCutin || Date.now() - prevCutin.at >= AWAKEN_CUTIN_MS) {
        const { key: awakenedKey, skillName } = awakenedFx;
        const ap = get().player;
        const acx = ap.x + ap.width / 2, acy = ap.y + ap.height / 2;
        // ①金の拡散リング3連(大きく・画面を覆う勢いでよい=派手さの絵・判定ゼロ)。
        get().spawnRing(acx, acy, 16, 190, 'rgba(253,224,71,0.95)', 5, 620);
        get().spawnRing(acx, acy, 16, 260, 'rgba(255,215,0,0.75)', 4, 760);
        get().spawnRing(acx, acy, 16, 330, 'rgba(255,236,153,0.55)', 3, 900);
        // 本体の強glow(強glowの「絵」は無料=惜しまない)。ただし投影影を落とすイベントライト
        // (支配光=pixiScene.tsのsyncShadowsV9)には乗せない=noShadow=trueで参加だけを断つ
        // (絵は変わらない・CLAUDE.mdの計測でコストの正体と確定した方だけを避ける)。
        get().spawnGlow(acx, acy, GLOW_R_XXL, 'rgba(253,224,71,', 700, true);
        get().spawnGlow(acx, acy, GLOW_R_L, 'rgba(255,255,255,', 500, true);
        // 金粒子の吹き上げ。
        get().spawnBurst(acx, acy, '#fde047', 40);
        get().spawnBurst(acx, acy, '#fff7cc', 20);
        // ②HUDカットイン帯(AwakenCutin.tsxが購読・約1.2秒・ゲームは止めない)。
        set({ awakenCutin: { skillKey: awakenedKey, skillName, at: Date.now() } });
      }
    }
    // バンクしたEXPがまだレベル分あれば、次のレベルアップ(メニュー)へ連鎖。ダンス中は保留のまま。
    if (!get().rhythm.active) {
      const { player: p, enemies } = get();
      // 社長相談(v0.25.1499): 赤ライン当たり判定内なら保留(useGameLoopが再チェック)。
      if (p.experience >= p.experienceToNextLevel && !isPlayerInAttackTelegraph(p, enemies, PUMPKIN_EXPLOSION_RADIUS, GIANT_STOMP_RADIUS, GIANT_SWEEP_HALF_WIDTH)) {
        get().levelUp();
      }
    }
  },

  // SKILL_BUILD_REDESIGN.md §16-10 ★C/§17: リロール(有料・表示中の3枚を全引き直し。常設スクラップ
  // 択は据え置き=そもそも生成対象に含めない)。価格は rerollsUsedThisRun(ラン単位で累積)から算出。
  rerollUpgradeOptions: () => {
    const state = get();
    if (!state.showUpgradeMenu) return;
    const price = rerollPrice(state.rerollsUsedThisRun);
    if (state.player.straps < price) return;
    const draftInput: RunSkillDraftInput = {
      owned: state.ownedSkills,
      ownedLevels: state.ownedSkillLevels,
      runSkills: state.runBuild,
      runSkillLevels: state.player.skillLevels,
      playerLevel: state.player.level,
      excluded: state.vanishedSkills,
      dogEquipped: state.player.subWeapons.includes('dog'),
      grenadeEquipped: state.player.subWeapons.includes('heavy-grenade'),
      glauncherOwned: state.player.weapons.some(w => !w.isMelee && w.category === 'glauncher'), // v0.25.3441
      activeConsumables: activeConsumableKeys(state.player, state.gameTime), // §23-2条件1/条件3
    };
    const nextOptions = generateSkillUpgradeChoices(draftInput, 3, Math.random, RAIL_KIND, RAIL_MULT);
    recordScrapExpense('reroll', price);
    set(s => ({
      player: { ...s.player, straps: s.player.straps - price },
      upgradeOptions: nextOptions,
      rerollsUsedThisRun: s.rerollsUsedThisRun + 1,
    }));
  },

  // SKILL_BUILD_REDESIGN.md §16-10 ★C/§17: バニッシュ(無料・ラン中2回まで)。そのスキルを以後の
  // 抽選から除外し、表示中のそのカードだけ1枚差し替える(他の2枚・常設スクラップ択は据え置き)。
  banishSkillFromRun: (key) => {
    const state = get();
    if (!state.showUpgradeMenu) return;
    if (state.vanishedSkills.includes(key)) return;
    if (state.vanishedSkills.length >= MAX_BANISH_PER_RUN) return;
    const nextVanished = [...state.vanishedSkills, key];
    const otherKeys = state.upgradeOptions
      .filter(o => o.type === 'skill' && o.skillKey !== key)
      .map(o => o.skillKey as SkillKey);
    // §23: 現在表示中の消費カードも「この1回のドラフト内で既出」として避ける(同じ3択内で重複しない)。
    const otherConsumables = state.upgradeOptions
      .filter(o => o.type === 'consumable')
      .map(o => o.consumableKey as ConsumableKey);
    const draftInput: RunSkillDraftInput = {
      owned: state.ownedSkills,
      ownedLevels: state.ownedSkillLevels,
      runSkills: state.runBuild,
      runSkillLevels: state.player.skillLevels,
      playerLevel: state.player.level,
      excluded: nextVanished,
      dogEquipped: state.player.subWeapons.includes('dog'),
      grenadeEquipped: state.player.subWeapons.includes('heavy-grenade'),
      glauncherOwned: state.player.weapons.some(w => !w.isMelee && w.category === 'glauncher'), // v0.25.3441
      activeConsumables: activeConsumableKeys(state.player, state.gameTime), // §23-2条件1/条件3
    };
    const replacement = generateReplacementSkillOption(draftInput, otherKeys, otherConsumables, Math.random, RAIL_KIND, RAIL_MULT);
    const nextOptions = state.upgradeOptions
      .filter(o => !(o.type === 'skill' && o.skillKey === key))
      .concat(replacement ? [replacement] : []);
    set({ vanishedSkills: nextVanished, upgradeOptions: nextOptions });
  },

  setSubWeaponCooldown: (key, readyAt) => {
    // M35(§6.12): ボット計測=サブウェポン発動回数(合流点)。overclock成立でCDが付かない場合も
    // 「発動」として数える=proc判定より前に記録。計測のみ=挙動不変。
    recordSubUse(key);
    set(state => {
      // スキル: オーバークロック(発動時20/25/30%でCD即リセット・§6.8 M31)→タイムキーパー
      // (残りΔ×0.9/0.8/0.7)の適用は共有純関数へ(G2.6 CD正規化・挙動不変。抽選はΔ>0の時だけ、
      // 成功=CDを設定しない(既存値は発動時点で既に明けている=即再使用可)。CD無しサブはここを
      // 通らない=自然に対象外)。sensor-mine/support-sniperの手動実装も同じ関数を通る。
      const delta = readyAt - state.gameTime;
      const cd = applySubCooldownSkills(
        trapGatedOverclockChance(state.player, skillOverclockChance(state.player)), // ★対人トラップ中は短縮無効
        trapGatedCooldownMult(state.player, skillCooldownMult(state.player)),
        delta,
      );
      if (cd.overclockProc) {
        recordOverclockProc(); // M35: 成立回数の計測のみ
        // §21(B5)枠光: 視覚のみ・判定/CDには不干渉(CDは元々「即再使用可」のまま=返り値以外は従来どおり)。
        // 覚醒(Lv3・v0.25.3300): proc成立時に銃もクイックリロード(3地点共通の1本)。
        return { player: { ...state.player, overclockLightUntil: state.gameTime + OVERCLOCK_LIGHT_MS, ...overclockAwakenReloadPatch(state.player) } };
      }
      // Δが無変換ならreadyAtをそのまま使う(gameTime+Δの再合成による浮動小数の揺れも入れない=従来と同一)。
      const effReadyAt = cd.deltaMs === delta ? readyAt : state.gameTime + cd.deltaMs;
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

  // v0.25.2563(GHOST-SUBS-FINAL): 主語引数化。ghostId 未指定=プレイヤー(従来と1bit同じ)。
  // 指定時は守護霊が「押していた指を離した」= 自分のロック(Summon.ghostHomingLocks)へ一斉発射する。
  // 弾・威力・CDの規則は**同じこの1本**(守護霊用の別実装は書かない)。
  fireHoming: (ghostId) => {
    const { homingLocks, enemies, gameTime } = get();
    const ghost = ghostId === undefined
      ? undefined
      : get().summons.find(s => s.id === ghostId && s.kind === 'ghost-ally');
    if (ghostId !== undefined && !ghost) return;
    const player = combatActorPlayer(ghostId);
    if (!player) return;
    const locks = ghost ? (ghost.ghostHomingLocks ?? []) : homingLocks;
    if (!player.subWeapons.includes('homing')) return;
    if (gameTime < (player.subWeaponCooldowns['homing'] ?? 0)) return;
    if (locks.length === 0) return;
    // G2.6: 発射位置はオーナー(プレイヤー=本人 / 守護霊=ゴースト実体)。
    const homingOwner = ghost ? ghostAsOwner(ghost) : playerAsOwner(player);
    const pcx = ownerCenterX(homingOwner);
    const pcy = ownerCenterY(homingOwner);
    const now = Date.now();
    const newProjectiles = locks
      .map((enemyId, i) => {
        const target = enemies.find(e => e.id === enemyId);
        if (!target) return null;
        const tx = target.x + target.width / 2;
        const ty = target.y + target.height / 2;
        const dist = Math.max(0.001, Math.hypot(tx - pcx, ty - pcy));
        return {
          id: ghost ? `proj-homing-${ghost.id}-${now}-${i}` : `proj-homing-${now}-${i}`,
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
          // 既存のゴースト発動サブと同じ視覚専用マーカー(青白tint)。判定/ダメージは不変。
          ...(ghost ? { ownerGhost: true } : {}),
        };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);
    if (newProjectiles.length === 0) return;
    if (ghost) {
      // 守護霊: 自分のロックだけを消す(プレイヤーのロック配列には触らない=2人分が独立)。
      set(state => ({
        projectiles: [...state.projectiles, ...newProjectiles.map(ensureProjectileOrigin)],
        summons: state.summons.map(s => s.id === ghost.id
          ? { ...s, ghostHomingLocks: [], ghostHomingHoldStartAt: undefined, ghostHomingNextLockAt: undefined }
          : s),
      }));
    } else {
      set(state => ({ projectiles: [...state.projectiles, ...newProjectiles.map(ensureProjectileOrigin)], homingLocks: [] }));
    }
    setActorSubWeaponCooldown(ghostId, 'homing', gameTime + HOMING_COOLDOWN_MS);
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
    // SKILL_BUILD_REDESIGN.md §15-1(B0発注文)の5: 商人購入ログ用の価格の控え(set()内は再入set禁止
    // なのでpost-setで記録する=既存のpumpkinLanded等と同じ作法)。
    let purchaseCost = 0;
    set(state => {
      const spend = (cost: number, playerPatch: Partial<Player>) => {
        if (state.player.straps < cost) return {};
        purchased = true;
        purchaseCost = cost;
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
        // 上限は育成の焼き値(research/GROWTH.md v4「弾数」)。0段=AMMO_MAX素値と同じ。
        if (state.player.ammoHandgun >= state.player.growthAmmoMax.handgun) return {}; // MAXなら購入不可
        return spend(SHOP_AMMO_COST, {
          ammoHandgun: Math.min(state.player.growthAmmoMax.handgun, state.player.ammoHandgun + shopAmmoAmount('handgun', state.ammoPickupAmounts))
        });
      }
      if (key === 'ammo-shotgun' || ammoType === 'shotgun') {
        // 上限は育成の焼き値(research/GROWTH.md v4「弾数」)。0段=AMMO_MAX素値と同じ。
        if (state.player.ammoShotgun >= state.player.growthAmmoMax.shotgun) return {}; // MAXなら購入不可
        return spend(SHOP_AMMO_COST, {
          ammoShotgun: Math.min(state.player.growthAmmoMax.shotgun, state.player.ammoShotgun + shopAmmoAmount('shotgun', state.ammoPickupAmounts))
        });
      }
      if (key === 'ammo-rifle' || ammoType === 'rifle') {
        // 上限は育成の焼き値(research/GROWTH.md v4「弾数」)。0段=AMMO_MAX素値と同じ。
        if (state.player.ammoRifle >= state.player.growthAmmoMax.rifle) return {}; // MAXなら購入不可
        return spend(SHOP_AMMO_COST, {
          ammoRifle: Math.min(state.player.growthAmmoMax.rifle, state.player.ammoRifle + shopAmmoAmount('rifle', state.ammoPickupAmounts))
        });
      }
      if (key === 'ammo-glauncher' || ammoType === 'glauncher') { // ★v0.25.4000: グレラン弾の独立販売
        // 上限は育成の焼き値(research/GROWTH.md v4「弾数」)。0段=AMMO_MAX素値と同じ。
        if (state.player.ammoGlauncher >= state.player.growthAmmoMax.glauncher) return {}; // MAXなら購入不可
        return spend(SHOP_AMMO_COST, {
          ammoGlauncher: Math.min(state.player.growthAmmoMax.glauncher, state.player.ammoGlauncher + shopAmmoAmount('glauncher', state.ammoPickupAmounts))
        });
      }
      if (key === 'ammo-phill' || ammoType === 'phill') { // 研究所: 商人はPHILL弾のみ販売
        // 上限は育成の焼き値(research/GROWTH.md v4「弾数」)。0段=AMMO_MAX素値と同じ。
        if (state.player.ammoPhill >= state.player.growthAmmoMax.phill) return {}; // MAXなら購入不可
        return spend(SHOP_AMMO_COST, {
          ammoPhill: Math.min(state.player.growthAmmoMax.phill, state.player.ammoPhill + shopAmmoAmount('phill', state.ammoPickupAmounts))
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
        const base = spend(SHOP_MEDKIT_COST, {
          health: Math.min(state.player.maxHealth, state.player.health + Math.round(state.player.maxHealth * HEAL_FRACTION))
        });
        // §2.11追補3(v0.25.2554): 回復の連動30%は入手経路によらず同じ扱い(拾い救急セットと同じ)。
        // 購入成立時のみ守護霊も自分の最大HPの30%回復。不成立/守護霊不在なら従来と完全同一。
        if (!('player' in base) || !state.summons.some(s => s.kind === 'ghost-ally')) return base;
        return {
          ...base,
          summons: state.summons.map(s => s.kind === 'ghost-ally'
            ? { ...s, health: Math.min(s.health + Math.round(s.maxHealth * HEAL_FRACTION), s.maxHealth) }
            : s),
        };
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
      // SKILL_BUILD_REDESIGN.md §15-1(B0発注文)の5: 商人購入ログ(品目/価格/残straps/時刻)。
      // 価格0(buy-phillの無料配布)も「購入」として記録する=挙動には影響しない読むだけの計測。
      recordMerchantPurchase(key, purchaseCost, p.straps, get().gameTime);
    }
    return purchased;
  },

  // SKILL_BUILD_REDESIGN.md §13-1+§16-7+§18-1: 商人の装備区画。棚は生成しない固定カタログ
  // (merchantEquipStepForSlot)なので、購入は「今そのスロットに出ている段だけ」を受け付ける。
  buyEquipmentFromShop: (slot, defId) => {
    let purchased = false;
    let purchaseCost = 0;
    set(state => {
      const step = merchantEquipStepForSlot(state.player.equipment, slot);
      if (step.kind === 'sold-out') return {}; // 特殊装備 or 最上段=売り切れ
      const def = step.kind === 'choose'
        ? step.options.find(o => o.id === defId)
        : (step.def.id === defId ? step.def : undefined);
      if (!def) return {}; // UIの表示と一致しない古いdefId=拒否
      const cost = EQUIP_SHOP_COST_BY_TIER[def.tier - 1];
      if (cost === undefined || state.player.straps < cost) return {};
      purchased = true;
      purchaseCost = cost;
      const nextPlayer = { ...equipDefOnPlayer(state.player, def.id), straps: state.player.straps - cost };
      return {
        player: nextPlayer,
        gameStats: { ...state.gameStats, strapsSpent: state.gameStats.strapsSpent + cost }
      };
    });

    if (purchased) {
      const p = get().player;
      get().spawnCallout(p.x + p.width / 2, p.y - 12, 'EQUIP', '#bfdbfe');
      // SKILL_BUILD_REDESIGN.md §15-1(B0発注文)の5と同じ購入ログ経路。品目はdefId(例: 'body-protection-3')。
      recordMerchantPurchase(defId, purchaseCost, p.straps, get().gameTime);
    }
    return purchased;
  },

  buySkillCardFromShop: (key) => {
    let purchased = false;
    // SKILL_BUILD_REDESIGN.md §15-1(B0発注文)の5: 商人購入ログ用の価格の控え(post-setで記録)。
    let purchaseCost = 0;
    set(state => {
      const unlockedLevel = Math.max(0, Math.min(3, state.unlockedShopSkillCards[key] ?? 0));
      const currentLevel = state.player.subWeaponLevels[key] ?? 0;
      if (unlockedLevel <= 0 || currentLevel >= unlockedLevel || currentLevel >= 3) return {};
      const cost = key === 'dog' ? SHOP_DOG_COST : key === 'katana' ? SHOP_KATANA_COST : key === 'whip' ? SHOP_WHIP_COST : key === 'alchemy' ? SHOP_ALCHEMY_COST : key === 'turret' ? SHOP_TURRET_COST : key === 'shijin' ? SHOP_SHIJIN_COST : key === 'sage-stone' ? SHOP_SAGE_STONE_COST : SHOP_CLASS_SKILL_COST;
      if (state.player.straps < cost) return {};
      purchased = true;
      purchaseCost = cost;
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
      // SKILL_BUILD_REDESIGN.md §15-1(B0発注文)の5: 商人購入ログ。
      recordMerchantPurchase(key, purchaseCost, p.straps, get().gameTime);
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

  // 武器商人: サークルに3秒連続滞在で話しかける(社長指示v0.25.1842・旧スイング開店を置換)。
  // useGameLoopがsim毎フレーム呼ぶ。紅き夜中は「やり過ごした」(旧スイング時の挙動を移植)。
  updateMerchantDwell: (deltaMs) => {
    const s = get();
    // v0.25.3054(社長指示): ボス戦中(+復帰猶予)は商人ロック=滞在が進まずショップが開かない。
    if (facilitiesLocked(s.bossFightNow, s.bossFightLastTrueAt, s.gameTime)) {
      if (s.merchantDwellMs !== 0) set({ merchantDwellMs: 0 });
      return;
    }
    const { weaponMerchant, player } = s;
    const pcx = player.x + player.width / 2;
    const pcy = player.y + player.height / 2;
    const mdx = weaponMerchant.x - pcx;
    const mdy = weaponMerchant.y - pcy;
    const inCircle = mdx * mdx + mdy * mdy <= weaponMerchant.radius * weaponMerchant.radius;
    // 二人組クエストv2 §2-8(納品ロック②): 帰還サークルと商人サークルが重なっていても、納品ロック中は
    // 滞在を積まない=ショップが開かない(何も失われない。ロック解除の直後はリザルトへ行くため)。
    if (!inCircle || s.showShopMenu || s.showUpgradeMenu || s.gameTime < s.shopReopenAt || s.deliveryLocked) {
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
    get().spawnGlow(weaponMerchant.x, weaponMerchant.y - 28, GLOW_R_S, 'rgba(251,191,36,', SHOP_INTERACT_RING_MS);
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
      eventQuestGoalTier: forcedPending ? null : cfg.sub.tier
    }));
  },

  completeEventQuest: () => {
    // 納品成立(EVENT_QUEST_DESIGN.md §2-8手順1・2・5 / §2-10): useGameLoopの二人組ブロックが
    // delivering の3秒滞在を満了させたフレームに呼ぶ(§2-2B 遷移5)。
    // v2(§2-10「delivered を書く場所は completeEventQuest の1箇所だけ」): v1の forced/sub
    // 2分岐(acceptEventQuest経由でしか到達しない死に経路)は廃止し、delivered の1本だけを書く。
    // S1/S3/S4/S5は同じ1本のクエストを回すので、ステージによって書き方を変える理由はもう無い。
    const stageId = getSelectedStageId();
    // 手順2(報酬付与口): 中身は★未決#7(社長裁定待ち)。裁定が出るまでは現行の
    // EVENT_QUEST_REWARD_GOLD=100を据え置く(★未決#7推薦(A)=体験を後退させない)。
    // スキル: ゴールドラッシュ(§6.10 M33⑪) = 永続ゴールド獲得 ×1.2/1.35/1.5(Lv・四捨五入)。
    // research/GROWTH.md v4: 育成のゴールド倍率(焼き値)も同じ算出行に掛ける(useGameLoop 側の
    // 吹き出し表示コピーも同じ式=表示と付与額を一致させる)。
    get().addGold(Math.round(EVENT_QUEST_REWARD_GOLD * skillGoldRushMult(get().player) * get().player.growthGoldMult));
    // 手順1(クリア記録・永続): delivered を唯一の書き手として立てる。
    const meta = getEventQuestMeta(stageId);
    setEventQuestMeta(stageId, { ...meta, delivered: true });
    // §2-10「syncQuestStageClearの呼び出し口を消さない」: 納品の瞬間にここで次ステージ解放を同期する
    // (リザルトを見る前でも記録される=受け入れ条件2)。
    syncQuestStageClear(stageId);
    set(state => ({
      eventQuestNpc: {
        ...state.eventQuestNpc,
        status: 'completed', // §2-2B 遷移5
        dwellMs: 0
      },
      eventQuestActive: null,
      eventQuestKills: 0,
      eventQuestGoalCount: 0,
      eventQuestGoalTier: null
    }));
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
  
  damageEnemy: (id, amount, _nonLethalBoss = false, crit = false, viaMeleeFinish = false, damageChannel = 'other', hateSource = 'player', postureImpact = null, postureImpactMult = 1, gpSource = null) => {
    let killed = false;
    let reaperDefeated: { x: number; y: number } | null = null; // 死神撃破=スキル「死神」を習得(社長指示)
    let bossFullStunAt: { x: number; y: number } | null = null; // 裏ボスが完全気絶(紫)に移行した位置(set後に紫FX)
    let bossFatalAt: { x: number; y: number; labelY: number; w: number; h: number } | null = null; // w/h=killFx流用(v0.25.3703)
    let namedFoeKilled: Enemy | null = null; // §5.14 M13: 宿敵討伐(set後にREVENGE演出+報酬)
    let deathPopAt: { ex: number; ey: number; fromX: number; fromY: number } | null = null; // §5.23 M22 A3(set後に発火)
    let dramaticDeathAt: { enemy: Enemy; x: number; y: number } | null = null; // juice: FF風クランブル(set後に発火)
    let bountyChestAt: { id: string; x: number; y: number } | null = null; // §6.38 B3: 賞金首討伐=金箱ドロップ(set後にaddPickup)
    let appliedDamage = 0; // §6.21 M46計測用: 実際に加算された生ダメージ(HP床クランプ前・紅き夜補正後=既存damageDealtと同値)
    let thrallCandidate: Enemy | null = null; // §6.24 M48「使役」: 倒した通常敵(20%抽選はset後に行う)
    let bossClearedType: EnemyType | null = null; // BOT_AND_GHOST.md §2.10 G5: 撃破ボスの型(set後にnotifyBossClear)
    // SKILL_BUILD_REDESIGN.md §28(B7): キルの瞬間に判定するスキル2種(poi-thrallと同じ「set()内で
    // 候補だけ拾い、実際の抽選/適用はset()の外側で行う」流儀)。
    let killedAt: { x: number; y: number } | null = null; // 吸血の発生位置(set後に判定)
    // v0.25.3703: グラビティショットはキル時→**射撃ヒット時**へ移設(社長指示)。ヒット位置をset内で拾い、
    // 抽選はset外(吸血と同じ流儀)。銃チャネル+プレイヤー起因+実ダメージ>0のみ。
    let gunHitAt: { x: number; y: number } | null = null;
    // サブクエスト(research/SUBQUESTS.md): ★キル確定点2本のうちの1本(銃/接触/爆発/DoT)。
    // 付与(ゴールド/ポップ/保存)は副作用なので set() の外側で行う=候補だけここで拾う。
    let subquestKilled: Enemy | null = null;

    set(state => {
      const { enemies, gameStats } = state;
      const enemy = enemies.find(e => e.id === id);

      if (!enemy) return { enemies };

      // KILL吹き飛び(死体・SKILL_BUILD_REDESIGN.md §26-2-3): 死体は既に死んでいる=早期return で
      // 二重キル/多重ダメージを禁止する(他の全フィールドも不変のまま)。
      if (isCorpse(enemy)) return { enemies };

      // ジャンプ攻撃で敵が空中(aiPhase==='jump')の間は無敵。被弾もヒット表示もしない。
      // 溜め(crouch)・着地後(recover)は通常どおり被弾する(空中だけ無敵)。
      if (enemy.aiPhase === 'jump') return { enemies };

      // ★research/GHOST_BOSS.md v6(幻影の被弾ゲート・7系統①): 適用順は**早期returnの直後・
      // 紫の報酬予算(applyBrokenGunReward/applyBrokenMeleeFatal)と紅き夜補正より前**
      // (0ダメージ化したヒットが報酬予算を食わないこと)。damageEnemy へ来るのは銃/サブ/爆発と
      // カウンター反撃(どちらもパリィ不可)、および gpSource で明示された近接経由
      // (スラッシャー追撃=パリィ可・v0.25.3640監査A)。
      // ★v0.25.3640(監査C): **0ダメージのヒットはゲートを通さない**(護衛NPCの演出射撃などの
      // 無害な弾が i-frame の起点(gpHitAt)を打ってしまう抜け道を塞ぐ。恒等で素通り)。
      const gpGate: PhantomHitGateResult = amount > 0
        ? gatePhantomHit(
          enemy, amount, postureImpact === 'counter' ? 'counter' : (gpSource ?? 'ranged'), state.gameTime,
        )
        : { damage: amount, effects: true, blocked: false, parried: false, patch: {}, damageScale: 1 };
      if (!gpGate.effects) {
        // 無効化: HPも lastHit も動かさない(通常の被弾フラッシュ・KB免疫・meleeAggroの起点を作らない)。
        // 絵は gpBlockedAt / gpParriedAt から描画側が別系統で出す。
        return { enemies: enemies.map(e => (e.id === id ? { ...e, ...gpGate.patch } : e)) };
      }

      // ★PVP(社長裁定2026-08-20「プレイヤー同士の戦いではダメージ1/10で一旦」): 以降のダメージは
      // ゲートの実効値(gpGate.damage=幻影なら×PVP_DAMAGE_SCALE・幻影以外は素のamountのまま)を使う。
      const gatedAmount = gpGate.damage;
      // 紫中の直接銃撃は通常クリ倍率と重ねず、この中央で×5相当まで報酬領域を消費する。
      const gunReward = damageChannel === 'gun' && hateSource === 'player'
        ? applyBrokenGunReward(enemy, gatedAmount, state.gameTime)
        : null;
      // ワイヤー等、中央経路へ来る直接近接フィニッシュも同じ致命裁定へ合流。
      // research/GROWTH.md v4: この経路へ来る amount(ワイヤーの meleeDmg)は呼び出し側で既に
      // skillOutgoingDamageMult(=育成込み)を通っている。**ここで再度掛けると二重適用**になるため
      // 掛けない(規約: 中央経路の直接近接フィニッシュは「育成込みの amount」を受け取る)。
      const meleeFatal = viaMeleeFinish && hateSource === 'player' && postureImpact === 'heavy'
        ? applyBrokenMeleeFatal(enemy, gatedAmount, state.gameTime)
        : null;
      // ★SAME_ARENA §9(検収監査 重大③): 中央経路を通る近接(gpSource='melee'=スラッシャー追撃等)も
      // 紫中の幻影には致命の一撃(×5+最大HP25%)。適用は下のpvpPatch(pvpAfterFatal)と対。
      const pvpFatal = gpSource === 'melee' && isGuardianPhantom(enemy.type) && hateSource === 'player'
        && isPvpFatalTarget(enemy.pvpPosture, state.gameTime)
        ? pvpFatalDamage(gatedAmount, enemy.maxHealth)
        : null;
      // ★社長指示2026-08-27「幻影戦での致命はちゃんと双方、KILL演出して」: 対人致命(pvpFatal=
      // スラッシャー追撃等の中央経路)もボス致命と同じフル演出(Kill!+CD無視の最大ズーム)へ載せる。
      if (meleeFatal || pvpFatal !== null) bossFatalAt = {
        x: enemy.x + enemy.width / 2,
        y: enemy.y + enemy.height / 2,
        labelY: enemy.y - 6,
        w: enemy.width, h: enemy.height,
      };
      const resolvedAmount = meleeFatal?.damage ?? pvpFatal ?? gunReward?.damage ?? gatedAmount;
      // 紅き夜中は敵HP実質2倍(プレイヤーダメージを半分に落とす)。
      const eff = (state.redNight?.phase === 'active' || RN_ENEMY_FORCE) ? Math.max(1, Math.floor(resolvedAmount / 2)) : resolvedAmount;
      appliedDamage = eff; // §6.21 M46計測用(set後にchannel別加算)
      const newHealth = Math.max(0, enemy.health - eff);
      // v0.25.3703: グラビティショットのヒット位置(銃チャネル+プレイヤー起因+実ダメージのみ)。
      if (damageChannel === 'gun' && hateSource === 'player' && eff > 0) {
        gunHitAt = { x: enemy.x + enemy.width / 2, y: enemy.y + enemy.height / 2 };
      }
      // nonLethalBoss: 廃止(v0.25.1571) 爆発もボスを倒せる。互換のため引数は残置
      // ★finishKillOnly(フィニッシュ以外では死なない)は v0.25.3329 で削除(未使用の死んだ旗・社長指示)。
      // 裏ボス: クリを規定回数当てると完全気絶(紫)。倒しきれなかったクリのみカウント。
      // 社長指示v0.25.3300 クリティカルアップ覚醒(Lv3): クリティカルで体勢(耐久値)も少し削れるようになる
      // (元々削れないクリ→'gun-crit'基準量で削る/既に削れるクリ→削り量×CRIT_UP_AWAKEN_POSTURE_MULT)。
      const critUpAwaken = crit && hateSource === 'player' && skillLevel(state.player, 'crit-up') >= 3;
      const baseImpact = postureImpact ?? ((crit && damageChannel === 'gun' && hateSource === 'player') ? 'gun-crit' : null);
      const resolvedImpact = baseImpact ?? (critUpAwaken ? 'gun-crit' : null);
      const critBump = (resolvedImpact && newHealth > 0)
        ? applyBossPostureDamage(enemy, resolvedImpact, state.gameTime,
            postureImpactMult * (critUpAwaken && baseImpact ? CRIT_UP_AWAKEN_POSTURE_MULT : 1))
        : null;
      if (critBump?.triggered) bossFullStunAt = { x: enemy.x + enemy.width / 2, y: enemy.y + enemy.height / 2 };
      // CRIT-UNIFY §9.2(中央適用): クリがボスに入った時の移動半減(bossSlowUntil)をここで一括適用する。
      // 呼び出し元(銃弾/per-bossカウンター/ゴーストカウンター等)はcrit=trueを渡すだけでよく、個別に
      // bossCritSlowPatchを呼ばなくてよい(旧: 銃はここが抜けてstunEnemyで5秒完全停止させていた=バグ)。
      // 近接系(ナイフ/刀/鞭/分身)はdamageEnemyを経由しないため、従来どおり呼び出し側で適用する
      // (二重適用にはならない=互いに排他の経路)。
      const bossSlow = (crit && newHealth > 0) ? bossCritSlowPatch(enemy, state.gameTime) : null;
      // BOT_AND_GHOST.md §2.8 G2.5(ヘイト): 対象ボス(giantbat/idol/天使6体)だけ、実際にHPへ入った
      // ダメージ(eff)を起因側(プレイヤー/ゴースト)のバケツへ積む。計測のみ=挙動を変えない
      // (読み出しは各ボスのwindupロック箇所=resolveBossHateAimのみ)。
      const hatePatch = (eff > 0 && isHateTrackedBossType(enemy.type))
        ? (hateSource === 'ghost'
            ? { hateGhostBuckets: addHateDamage(enemy.hateGhostBuckets, state.gameTime, eff) }
            : { hatePlayerBuckets: addHateDamage(enemy.hatePlayerBuckets, state.gameTime, eff) })
        : {};
      // v0.25.2490(社長裁定「守護霊に攻撃されたら守護霊に向く」): ゴースト起因ダメージを受けた
      // 雑魚(非ボス)はGHOST_MOB_HATE_MSの間ゴーストを狙う(被弾のたび更新)。ボスはG2.5バケツ側(上)。
      const mobHatePatch = (eff > 0 && hateSource === 'ghost' && !isBossType(enemy.type))
        ? { ghostHateUntil: state.gameTime + GHOST_MOB_HATE_MS }
        : {};
      // ★SAME_ARENA §9(対人体勢・v0.25.3969): 幻影の隠し体勢。プレイヤー本人起因の成立
      // (counter/gun-crit/reflect)だけが削り、クリ被弾で2/3減速3秒。melee 0.04と致命は
      // damageEnemyを通らない近接site1側(排他)。usesPostureSystem外なのでボスの紫系とは独立。
      let pvpPatch: Partial<Enemy> = {};
      if (isGuardianPhantom(enemy.type) && hateSource === 'player' && newHealth > 0) {
        if (pvpFatal !== null) {
          // 致命が刺さった: 紫解除+満タン+daze2秒+再ブレイクロック(近接site群と同じ後始末)。
          pvpPatch = { pvpPosture: pvpAfterFatal(enemy.pvpPosture, state.gameTime) };
        } else {
          let pvpState = enemy.pvpPosture;
          let pvpBroke = false;
          if (resolvedImpact === 'counter' || resolvedImpact === 'gun-crit' || resolvedImpact === 'reflect') {
            const r = chipPvpPosture(pvpState, resolvedImpact, state.gameTime, postureChipMult() * postureImpactMult);
            pvpState = r.next; pvpBroke = r.broke;
          } else if (gpSource === 'melee') {
            // 中央経路の近接(スラッシャー追撃等)= melee 0.04(検収監査 重大③)。
            const r = chipPvpPosture(pvpState, 'melee', state.gameTime, postureChipMult());
            pvpState = r.next; pvpBroke = r.broke;
          }
          // 紫入りの瞬間: 前隙中の振り・予約カウンターを破棄(§9「紫に入った瞬間に破棄」)。
          if (pvpBroke) pvpPatch = { gpPendingSwingAt: undefined, gpParriedAt: undefined };
          if (crit) pvpState = markPvpCritSlow(pvpState, state.gameTime);
          if (pvpState !== enemy.pvpPosture) pvpPatch = { ...pvpPatch, pvpPosture: pvpState };
        }
      }
      // v0.25.3986(描画専用打刻): カウンター成立の瞬間。全カウンター経路(9呼び出し元)がこの中央を
      // postureImpact='counter' で通る。pixiSceneのlatch系が「着弾前に中断された技の絵」の破棄に使う。
      const counteredPatch = postureImpact === 'counter' ? { lastCounteredAt: Date.now() } : {};
      const updatedEnemies = enemies.map(e =>
        e.id === id ? { ...e, health: newHealth, lastHit: Date.now(), ...(critBump?.patch ?? {}), ...(gunReward?.patch ?? {}), ...(meleeFatal?.patch ?? {}), ...(bossSlow ?? {}), ...hatePatch, ...mobHatePatch, ...gpGate.patch, ...pvpPatch, ...counteredPatch } : e
      );
      
      // Check if enemy was killed
      if (newHealth === 0) {
        killed = true;
        // v0.25.3029: グレン形態1は撃破記録に通知しない(melee経路と同じゲート・監査指摘)。
        bossClearedType = (enemy.type === 'giantbat' && enemy.glenForm === 1) ? null : enemy.type; // BOT_AND_GHOST.md §2.10 G5: 撃破通知用(set後にnotifyBossClear。非対象typeはnotifyBossClear内で無視)
        if (isReaperFamily(enemy.type)) reaperDefeated = { x: enemy.x + enemy.width / 2, y: enemy.y }; // 死神撃破→習得
        // SKILL_BUILD_REDESIGN.md §28(B7): 吸血/グラビティショットはキル全般が対象(仕様上ボス/宿敵の
        // 除外指定なし=poi-thrallと違い型を絞らない)。位置だけ拾い、抽選/適用はset()の外側で行う。
        killedAt = { x: enemy.x + enemy.width / 2, y: enemy.y + enemy.height / 2 };
        if (enemy.isNamed) namedFoeKilled = enemy; // §5.14 M13: 宿敵討伐
        // §6.24 M48「使役」: 通常敵(ボス/裏ボス/ネームド/エリートは対象外=D1)を倒した時だけ候補にする。
        // 実際の20%抽選/先着1体維持(D3)は set() の外側(post section)でownedの現在値を見て行う。
        // §6.38 v7(賞金首): 旧v6 A-5では`&& !isBountyType(enemy.type)`を個別に足していたが、
        // v7でisBossTypeへフル編入されたため`!isBossType(enemy.type)`だけで自動的に除外される
        // (重複登録の撤去。眷属化させない、という結論自体は不変)。
        if (hasSkill(state.player, 'poi-thrall') && !isBossType(enemy.type) && !enemy.isNamed && !enemy.questTarget) {
          thrallCandidate = enemy;
        }
        // juice: FF風クランブル統一演出(ネームド/裏ボス/giantbat/hunter討伐)。銃/接触/爆発キル経路。
        if (getsDramaticDeath(enemy)) dramaticDeathAt = { enemy, x: enemy.x + enemy.width / 2, y: enemy.y + enemy.height / 2 };
        // §6.38 B3(賞金首の金箱): 銃/接触/爆発/DoTキル経路もここ1箇所で拾える(近接経路は
        // grantMeleeKillRewards側で同様に付与=両経路とも「討伐で1個」を満たす)。
        if (isBountyType(enemy.type)) {
          bountyChestAt = { id: enemy.id, x: enemy.x + enemy.width / 2, y: enemy.y + enemy.height / 2 };
        }
        deathPopAt = {
          ex: enemy.x + enemy.width / 2, ey: enemy.y + enemy.height / 2,
          fromX: state.player.x + state.player.width / 2, fromY: state.player.y + state.player.height / 2,
        }; // §5.23 M22 A3: 銃/接触/爆発キルの死亡ポップ
        tagRemove(id, 'kill'); // 消失ログ用: 通常撃破
        // PACING_REDESIGN.mdバッチ2(計測): ガン/接触/爆発キルを種別+スタイル集計へ記録(挙動には影響しない)。
        // バッチ3.5-Bの追補: 型ごとの最終キル時刻も記録(問題児リフラクトリ判定用)。
        // PACING_PUZZLE.md §14-4-3(使者・hangedman): 計測(killTelemetry)の対象外(除外リスト)。
        if (!isHangedman(enemy.type)) recordKill(enemy.type, 'gun', state.gameTime);
        // 二人組クエストのキル進捗(EVENT_QUEST_DESIGN.md)。銃/接触/爆発キル経路。
        const questKillNext = questKillProgress(state.eventQuestActive, state.eventQuestGoalTier, state.eventQuestKills, enemy);
        subquestKilled = enemy; // サブクエストの進捗(付与はset後)

        // Update game stats
        // PACING_PUZZLE.md §14-4-3(使者・hangedman): スコア(討伐数)の対象外(除外リスト)。
        const newStats = isHangedman(enemy.type) ? gameStats : {
          ...gameStats,
          enemiesKilled: gameStats.enemiesKilled + 1,
          damageDealt: gameStats.damageDealt + eff,
          eliteKills: gameStats.eliteKills + (isScoreElite(enemy.type) ? 1 : 0), // 銃/弾でのpumpkin撃破も計上
          bossKills: gameStats.bossKills + (isScoreBoss(enemy.type) ? 1 : 0)     // 同 giantbat
        };

        // KILL吹き飛び(死体・§26-1): 通常敵(corpseEligible)は即消滅させず、攻撃者(近似=プレイヤー
        // 座標・★未決事項参照)→敵方向へ吹き飛ぶ死体として残す。ボス/ネームド/クエスト対象は
        // 従来どおり即除去(getsDramaticDeath/bossCorpse演出はそのまま・挙動不変)。
        // §6.38 B2b(持ち越し②): 賞金首の討伐でも退場時と同じく取り巻き(bountyEscortId一致)を
        // 一緒に片付ける(退場時のclearBountyEscortsと対=削除経路が2本に割れて片方だけ残る事故の防止)。
        if (!corpseEligible(enemy) && isBountyType(enemy.type)) {
          updatedEnemies.forEach(e => { if (e.bountyEscortId === id) tagRemove(e.id, 'bountyGone'); }); // 消失ログ用: 討伐に伴う取り巻き一掃(v0.25.3965)
        }
        const enemiesAfterKill = corpseEligible(enemy)
          ? updatedEnemies.map(e => e.id === id ? buildCorpseFromKill(e, state.player) : e)
          : updatedEnemies.filter(e => e.id !== id && !(isBountyType(enemy.type) && e.bountyEscortId === id));
        return {
          enemies: enemiesAfterKill,
          gameStats: newStats,
          ...(questKillNext !== null ? { eventQuestKills: questKillNext } : {}),
          // The giantbat is the run's finale boss — defeating it triggers the return phase.
          // ただし囲い系イベントのミニボス(fromEvent)は finale ではないので除外。即勝利せず帰還サークルへ。
          finaleDefeated: state.finaleDefeated || isFinalBossKill(enemy),
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

    // BOT_AND_GHOST.md §2.10 G5: ボス撃破の通知(記録専用・挙動不変)。gun/接触/爆発/DoT/カウンター等
    // damageEnemyを経由する全キル経路の合流点。notifyBossClear内でセッション無し/対象外typeはno-op。
    // v0.25.2553(§2.16 A): 撃破の瞬間に召喚中の同行守護霊(居なければnull)を添えて記録する。
    // §2.17(GHOST-DUO-RECORDS): 同行枠の台帳へも同じ写しで打刻(排他の理屈はgrantMeleeKillRewards側の
    // コメント参照)。
    if (bossClearedType) {
      const allySnap = ghostAllySnapshot(findGhostAlly(get().summons));
      notifyBossClear(bossClearedType, getSelectedStageId(), allySnap);
      recordDuoBossClear(bossClearedType, getSelectedStageId(), allySnap);
    }

    // サブクエストのキル進捗(research/SUBQUESTS.md)。★キル確定点2本のうちの1本(銃/接触/爆発/DoT)。
    // もう1本は grantMeleeKillRewards(近接5経路の合流点)。
    // ★決定(v0.25.3649・成果物監査小5の明文化): 護衛NPC・召喚(犬/タレット/デコイ)・守護霊のキルも
    // **数える**(hateSource/damageChannelで絞らない)。recordKill(スタイル集計)と同じ「全部数える」
    // =「普段のプレイの延長で達成」の共通方針どおり。※ボム(ロザリオ)の一括除去だけはこの関数を
    // 通らない別経路(collectPickup)=数えるかは社長裁定待ち(SUBQUESTS.md ★未決)。
    if (subquestKilled) {
      const ske = subquestKilled as Enemy;
      applySubquestProgress(get, { type: 'kill', kill: subquestKillEventFrom(get(), ske) });
      // v0.25.3983(社長指示): 城ボス撃破→城の崩壊(銃/接触/爆発/DoT経路。近接経路はgrantMeleeKillRewards側)。
      collapseCastleOnBossDeath(ske);
    }

    // 裏ボスが完全気絶(紫)に移行: 紫の衝撃リング＋発光＋コールアウトで知らせる。
    if (bossFullStunAt) {
      const p = bossFullStunAt as { x: number; y: number };
      get().spawnRing(p.x, p.y, 12, 210, 'rgba(168,85,247,0.85)', 5, 520);
      get().spawnRing(p.x, p.y, 6, 130, 'rgba(216,180,254,0.9)', 3, 360);
      get().spawnGlow(p.x, p.y, GLOW_R_XL, 'rgba(168,85,247,', 620);
      get().spawnCallout(p.x, p.y - 24, 'BREAK!', '#d8b4fe', { bg: 0x6b21a8 });
    }
    if (bossFatalAt) {
      const p = bossFatalAt as { x: number; y: number; labelY: number; w: number; h: number };
      showBossFatalPresentation(get, p.x, p.y, p.labelY);
      const fullCinematic = get().triggerFinishImpact(p.x, p.y, true); // ワイヤー等の致命もCDを無視して必ず最大ズーム
      // v0.25.3703: ワイヤー等の致命にもKILL跳びつき(v3622の取りこぼし)。
      if (fullCinematic) {
        const fp = get().player;
        startKillFxCinematic(get, { cx: p.x, cy: p.y, w: p.w, h: p.h }, [{ x: p.x, y: p.y }],
          fp.x + fp.width / 2, fp.y + fp.height / 2);
      }
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

    // §6.24 M48「使役」: 20%抽選(D1対象は set() 内で既に絞り込み済み)。既に1体いる時は抽選しない
    // =先着1体を維持(D3)。錬金術の召喚と同じ枠(state.summons)へ persistent:true で1体追加する
    // (updateSummons/summonAlchemyがALCHEMY_DESPAWN_DIST無視/FIFO対象外にpersistentを見る)。
    if (thrallCandidate) {
      const tc = thrallCandidate as Enemy;
      const alreadyHasThrall = get().summons.some(s => s.persistent);
      if (!alreadyHasThrall && Math.random() < POI_THRALL_CHANCE) {
        const tx = tc.x + tc.width / 2, ty = tc.y + tc.height / 2;
        const unit: Summon = { ...buildSummon(1, 'normal', tx, ty), persistent: true };
        set(state => ({ summons: [...state.summons, unit] }));
        get().spawnGlow(tx, ty, GLOW_R_S, 'rgba(56,189,248,', 360);
        get().spawnBurst(tx, ty, '#38bdf8', 18);
        get().spawnCallout(tx, ty - 20, '使役！', '#38bdf8');
      }
    }

    // SKILL_BUILD_REDESIGN.md §28(B7) スキル: 吸血 = キルで確定発動(100%・社長裁定v0.25.3603。
    // 旧: キルの20%・率固定)HP+2/+4/+6(Lv)。
    // 絵は分類②(派手側)。キル地点からプレイヤーへ血粒が吸い込まれるdrainエフェクト
    // (社長指示v0.25.3276「攻撃したときの血のエフェクトがプレイヤーに吸収されていくような」)。
    if (killedAt) {
      const vampLv = skillLevel(get().player, 'vampire');
      const heal = rollVampireHeal(vampLv);
      if (heal > 0) {
        set(state => ({
          player: { ...state.player, health: Math.min(state.player.maxHealth, state.player.health + heal) },
        }));
        const p = get().player;
        const src = killedAt as { x: number; y: number };
        get().spawnEffect({
          kind: 'drain', id: `vamp-drain-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          fromX: src.x, fromY: src.y, createdAt: Date.now(), duration: 620,
        });
        get().spawnCallout(p.x + p.width / 2, p.y - 20, `+${heal}`, '#f87171');
      }
    }

    // SKILL_BUILD_REDESIGN.md §28(B7) スキル: グラビティショット = **射撃ヒット時**の20/30/40%(Lv)で
    // 爆縮(社長指示v0.25.3703。旧: キル時)。確率表・渦の性能(引き寄せ120px/s×0.4s・半径100/120/140・
    // 覚醒Lv3=2倍長)は不変。ヒットはキルの数倍の頻度なので、発動後 GRAVITY_SHOT_PROC_CD_MS は
    // 再抽選しない(叩き台)。判定なし=絵は分類②(派手に・既存プールで)。
    if (gunHitAt && Date.now() >= gravityShotNextRollAt) {
      const gravLv = skillLevel(get().player, 'gravity-shot');
      const well = rollGravityShotWell(gravLv);
      if (well) {
        gravityShotNextRollAt = Date.now() + GRAVITY_SHOT_PROC_CD_MS;
        const p = gunHitAt as { x: number; y: number };
        // 覚醒(Lv3・v0.25.3300): 2倍の長さで引き寄せ続ける。
        get().spawnGravityWell(p.x, p.y, well.radius, gravLv >= 3 ? GRAVITY_SHOT_PULL_MS * 2 : undefined);
        get().spawnRing(p.x, p.y, 6, well.radius, 'rgba(168,85,247,0.75)', 3, 420);
        get().spawnBurst(p.x, p.y, '#a855f7', 16);
        get().spawnGlow(p.x, p.y, GLOW_R_M, 'rgba(168,85,247,', 420);
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

    // §6.38 B3(賞金首の金箱): 銃/接触/爆発/DoTキル経路。中身はcollectPickup側で開封時に計算する
    // (pickup生成=このaddPickup自体はvalue未使用=grantMeleeKillRewards側の近接経路と同型)。
    if (bountyChestAt) {
      const b = bountyChestAt as { id: string; x: number; y: number };
      get().addPickup({
        id: `pickup-bounty-chest-${b.id}`,
        x: b.x - 8, y: b.y - 8 - 18,
        type: 'bounty-chest',
        value: 0
      });
      get().spawnRing(b.x, b.y, 10, 90, 'rgba(251,191,36,0.75)', 3, 520);
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
    // ★v0.25.3989(社長報告「守護霊登場時のセリフと退場時のセリフが通信に出てこない」・実測で確定):
    // アテンション/カットイン(ボス出現演出)中は通信の時計を丸ごと凍結する。守護霊の登場セリフは
    // ボス交戦の立ち上がり=カットインと**同じ瞬間**に積まれ、表示2.8秒(NPC_DIALOGUE_MS)が
    // カットインの裏でまるごと過ぎていた(シミュ=gameTimeはアテンション中も走る)。凍結中は
    // 表示切替も期限切れもしない(set無し=再レンダー増なし)。明けたエッジで表示中の行の尺を
    // 張り直す=カットイン前に一瞬出た行も、明けてからフルに読める。
    if (s.attention !== null) { npcDialogueFrozeByAttention = true; return; }
    let cur = s.npcDialogue;
    let queue = s.npcDialogueQueue;
    let nextAt = s.npcDialogueNextAt;
    let changed = false;
    if (npcDialogueFrozeByAttention) {
      npcDialogueFrozeByAttention = false;
      if (cur) { cur = { ...cur, until: gameTime + NPC_DIALOGUE_MS }; changed = true; }
    }
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
    // v0.25.3122(社長指示「三唱のエフェクト変更…その度に画面大きく揺れる」): 唱が1つ進んだ瞬間を
    // 拾って set 後に大きく揺らす(set内でのネスト発火回避=pumpkinLandedと同じ作法)。
    // **絵の切り替えと同じ瞬間**に揺らすため、判定/演出の起点は唱の遷移そのものに置く。
    let glenNihilChanted = false;
    // v0.25.3149(社長指示「尻尾叩きつけるときもっと勢いよく」): 叩きつけた瞬間に画面を揺らす。
    let glenTailSlammed = false;
    // 着地爆発イベント(ice=スカジ氷=青FX・capsule=M51薙ぎ払い)。
    // ★**空から作らない**(v0.25.2629・社長報告「殴り、狙撃線は何も食らってない」の原因):
    // このローカル配列は最後に `return { ..., pumpkinBlasts }` で **state を丸ごと差し替える**。
    // 一方でボス専用コントローラ(useGameLoop の ミーミル/トール、angelBossTick の ラフィ、
    // idolTick の アイドル)は **updateEnemies より前**に `state.pumpkinBlasts` へ追記している。
    // 空から作ると**同じフレームのうちにそれが捨てられ、それらの技は一度も当たらない**。
    // よって**必ず既存 state を引き継いでから積む**。
    // (積み残しは起きない: 消費側 `combatTick.applyPumpkinBlastDamage` が同フレームの直後に
    //  全件処理して空にする。updateEnemies と消費の間に脱出経路は無い=useGameLoop 7209→7240。)
    const pumpkinBlasts: PumpkinBlast[] = [];
    const giantBoltFires: Enemy[] = []; // M51: ジャイアント新スクリプトの咆哮弾。set() 後に post-set で addProjectile する。
    // v0.25.3700(社長指示「ボスの技にも対応するSEを」): 発動の瞬間にプレイヤー近似SEを鳴らすための
    // post-setフラグ(set内は再入set禁止+audioManagerは静的importできない=pumpkinLanded/jump-landと同じ作法)。
    let giantNovaFired = false;      // g-nova発動 → skadi-ice(氷結波=氷の近似)
    let giantSweepbeamFired = false; // g-sweepbeam発動 → heavy-impact(ビーム発射=ミーミルレーザーと同じ流用)
    let giantBreathFired = false;    // g-quad-breath発動 → hurricane(ブレス=風の近似)
    // PACING_PUZZLE.md §9-4(削岩型): 突き発動の瞬間に thor-thrust(v3700の文法「突き=同じ動作は同じ音」)。
    let drillerThrustFired = false;
    let loggerSweepFired = false; // PACING_PUZZLE.md §14-2④: 発動音はdrillerと同系流用(thor-thrust)
    const glenVolleyFires: string[] = []; // v0.25.3027: グレン第二形態の胴体弾(パーツV字斉射)。post-set で発射。
    const shieldBlocks: { x: number; y: number; kind: 'jump' | 'dash' }[] = []; // シールドで防いだ瞬間の接触点(FX/SE用)
    const punisherHits: string[] = []; // パニッシャー: 巻き込んだ敵の id(set 後に近接半分ダメージを適用)
    const punisherContacts: { x: number; y: number }[] = []; // v0.25.3299: 一拍目(接触)のFX用座標
    let punisherDmg = 0;               // 近接ダメージの半分(set 内で算出)
    const layingEggs: BreakableProp[] = []; // 抱卵型(旧ghost)がこのフレームに設置する緑卵(mine)。set 内で breakableProps へマージ。
    const screamerActivatedAt: { x: number; y: number }[] = []; // 叫喚型がこのフレームに溜め完了=発動した位置(set 後に FX/SE/揺れ)。
    const screamerWindupAt: { x: number; y: number }[] = [];     // 叫喚型がこのフレームに溜め開始した位置(set 後に予兆FX)。
    const quadBreathSparkles: { x: number; y: number; scale?: number; life?: number; driftX?: number; driftY?: number; rot?: number }[] = [];
    // v0.25.3079: 爆発直前の「ピカッ」を出す位置(set後にspawnGlow。判定ゼロの派手枠)。
    const iceFlashAt: { x: number; y: number }[] = [];   // v0.25.3042: 冷気ブレス追従のキラキラ粉雪(社長支給素材・set後にspawnEffect)。v0.25.3049: 三連突進の軌跡も同じ籠で撒く。v0.25.3071: スカジの氷技(氷刃の軌跡/氷塊の冷気と砕け)も同じ籠。
    let bossLeashWarning = false;
    // SKILL_BUILD_REDESIGN.md §15-1(B0発注文): ボス交戦フラグの立ち上がり(false→true)を検知する
    // だけのフラグ(set()内は再入set禁止=既存のpumpkinLanded等と同じ作法。post-setでtelemetryへ記録)。
    let bossEntryDetected = false;
    set(state => {
      // ★上の注記のとおり、**このフレームに他所から積まれた判定を先に引き継ぐ**。
      // set の中で読む=引き継ぎ元は必ず最新の state(get()のタイミングずれを作らない)。
      pumpkinBlasts.push(...state.pumpkinBlasts);
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

      // 体勢回復/紫窓終了は専用AIから除外される裏ボスも含め、全ボスへ毎フレーム適用する。
      const postureUpdatedEnemies = enemies.map(enemy => {
        const patch = tickBossPosture(enemy, gameTime, deltaTime);
        return patch ? { ...enemy, ...patch } : enemy;
      });
      const updatedEnemies = postureUpdatedEnemies.map((enemy): Enemy => {
        // 裏ボス4体/天使6体/アイドル(=isHiddenBoss)は updateEnemies の追跡AIから除外。移動/攻撃/
        // 帰巣/再生は専用コントローラ(useGameLoop/angelBossTick/idolTick)が座標を直接書き込む
        // (死神と同じ方式)。v0.25.2895: 早期returnはノックバック適用ブロックの直後(liftUntilの
        // 手前)へ移動した。ここに置いたままだと押し道具(鞭・シールドバッシュ)がknockbackShoveUntil
        // を立てても、その先のノックバック適用ブロックへ一度も到達できず11体に1pxも効かなかった。
        // ハンター変異体・撤退中は通常追跡AIから除外。専用イベントコントローラ(useGameLoop)が
        // プレイヤーから離れる方向へ移動させ画面外で消す。索敵中(dormant)は下の dormant ブロックで静止。
        if (enemy.type === 'hunter' && enemy.hunterFleeing) return enemy;
        // 叫喚型の強化対象判定: 通常敵(ボス/screamer以外)だけ移動速度を×SCREAMER_BUFF_MULT。
        const screamSpeedMult = (screamActive && enemy.type !== 'screamer' && !isBossType(enemy.type)) ? SCREAMER_BUFF_MULT : 1;
        // ★ダッシュ/滞空中はオブジェクトを貫通(社長指示v0.25.2415)。突進や飛び掛かりは
        // 「赤い線/円の予告どおりに来る」のが読みの前提(§6.28-3)なので、途中の木やバスに
        // 引っかかって止まると**予告と実際が食い違う**=予告の意味が壊れる。
        // 貫通させるのは**敵自身の壁当たりだけ**で、プレイヤーへの当たり判定・ダメージは何も変えていない。
        // 帰還サークル/イベント囲いの拘束は「オブジェクト」ではなくゲームの境界なので下でそのまま効かせる。
        const passThrough = isPassThroughPhase(enemy.aiPhase) || isPassThroughBossState(enemy.bossState);
        // 衝突解決して移動先を返す(各AIで共用)。屋内は labMap の壁、屋外は木/松明+壁(研究所スキンは壁のみ)。
        const resolveMove = (nx: number, ny: number) => {
          let pos: { x: number; y: number };
          if (passThrough) {
            pos = { x: nx, y: ny };
          } else if (indoor) {
            pos = resolveAabb({ x: nx, y: ny, width: enemy.width, height: enemy.height }, indoorWalls);
          } else {
            const tr = labTheme ? { x: nx, y: ny } : resolveTreeCollision({ x: nx, y: ny, width: enemy.width, height: enemy.height });
            const torchR = resolveTorchCollision({ x: tr.x, y: tr.y, width: enemy.width, height: enemy.height }, solidProps);
            // 城(屋外・非ラボ)も敵にブロック(プレイヤーと同じ。従来は敵だけすり抜けていた)。
            // v0.25.3054: ボス戦中は城の判定も消す(プレイヤー側resolveOutOfSolidsと同じ・見えない壁を作らない)。
            const castleR = (labTheme || state.farBackdrop === 'tutorial'
              || facilitiesLocked(state.bossFightNow, state.bossFightLastTrueAt, gameTime))
              ? torchR : resolveCastleCollision({ x: torchR.x, y: torchR.y, width: enemy.width, height: enemy.height }, state.castleEvent);
            // ラボ壁＋ラボプロップ(研究所スキン)。labProps も敵に当たり判定(従来は壁のみ=プロップすり抜け)。
            const labRects = labTheme ? [...labWallRects, ...labPropRects] : labWallRects;
            const wallR = labRects.length
              ? resolveAabb({ x: castleR.x, y: castleR.y, width: enemy.width, height: enemy.height }, labRects)
              : castleR;
            // 街/雪原プロップ(バス/塔/トラック等)は敵にも当たり判定(プレイヤーと同じ)。森等カタログ無しは即return=no-op。
            const propR = resolveCityPropCollision(state.farBackdrop, { x: wallR.x, y: wallR.y, width: enemy.width, height: enemy.height });
            // 病院の土台は敵にも当たり判定(プレイヤーと同じ=すり抜け防止)。
            const hospitalR = resolveHospitalCollision(
              { x: propR.x, y: propR.y, width: enemy.width, height: enemy.height },
              state.hospital, state.hospitalTaken,
            );
            // §6.24 M48: 武器庫/警察署も同様に敵の当たり判定へ加える(プレイヤーと同じ規約)。
            const armoryR = resolveArmoryCollision(
              { x: hospitalR.x, y: hospitalR.y, width: enemy.width, height: enemy.height },
              state.armory, state.armoryTaken,
            );
            pos = resolvePoliceCollision(
              { x: armoryR.x, y: armoryR.y, width: enemy.width, height: enemy.height },
              state.police, state.policeTaken,
            );
          }
          // 帰還サークルの「敵を入れない」押し出しは撤廃(社長指示v0.25.3318: 指離せば即ゴールなので
          // セーフゾーンが不要になった。旧v0.25.2589の攻撃禁止側と同時に撤去)。
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
        // KILL吹き飛び(死体・SKILL_BUILD_REDESIGN.md §26-2-1): 死体はAI/移動/攻撃/索敵から完全に
        // 除外し、KBスライドだけを適用する(判定は他の全ブロックの手前=ここで確実に止める)。
        // KB終了後は位置を凍らせる(期限切れの除去はfinalEnemies側=このmapでは消さない)。
        if (isCorpse(enemy)) {
          if (enemy.knockbackUntil === undefined || now >= enemy.knockbackUntil) return enemy;
          // v0.25.3272(社長報告「KILL時のノックバックの方が短い」): 死体の飛びをdeltaTime積分から
          // **実時間の解析積分**へ変更。KILL!フィニッシュのスロー中はdeltaTimeが縮む一方で
          // knockbackUntilは実時間で燃えるため、飛距離がスロー倍率ぶん縮んでいた。
          // 起点(corpseStart)+方向×50px×ease-out進捗(線形減衰速度の積分=1-(1-t)^2)で描けば、
          // スローに関係なく必ず50px飛ぶ。ついでに「出始め一瞬・終わりゆるく」の慣性標準にも一致する。
          const t = Math.max(0, Math.min(1, 1 - (enemy.knockbackUntil - now) / KNOCKBACK_DURATION));
          const frac = 1 - (1 - t) * (1 - t);
          const kvx = enemy.knockbackVx ?? 0, kvy = enemy.knockbackVy ?? 0;
          const kvl = Math.hypot(kvx, kvy);
          if (kvl <= 0.001) return enemy;
          const sx = enemy.corpseStartX ?? enemy.x, sy = enemy.corpseStartY ?? enemy.y;
          const kb = resolveMove(
            sx + (kvx / kvl) * KILL_LAUNCH_DIST_PX * frac,
            sy + (kvy / kvl) * KILL_LAUNCH_DIST_PX * frac,
          );
          return { ...enemy, x: kb.x, y: kb.y };
        }
        // 攻撃モーションを「全う」するフェーズの扱い(社長指示・v0.25.3271裁定で更新):
        // ・どの敵も「攻撃モーションに入ったら(aiPhase あり=溜め/zpause/zrush/突進/ジャンプ等)技自体は
        //   やり切る」(中断しない=予告した攻撃は必ず実行される。掟W4は不変)。
        // ・v0.25.3271: ただし**位置はノックバックで滑る**(committed=空中ジャンプ・ダッシュ突進、だけは
        //   従来どおり滑らせない=軌道が壊れるため)。溜め・予備動作・硬直中の雑魚は押されると、
        //   ズレた位置から同じ技を実行する。旧仕様(inAttackMotion=aiPhaseありなら丸ごと滑らせない)は廃止。
        // ・例外として気絶(stun)/パリィは中断できる: stun は committed(空中ジャンプ/突進中)以外を解除、
        //   パリィは aiPhase を先に解除してから弾くのでこのガードに掛からない。
        // committed = 中断不可の実行中(空中ジャンプ・ダッシュ突進)。stun/lift もこの間は受け付けない。
        const committed = enemy.aiPhase === 'jump' || enemy.aiPhase === 'charge';
        // CRIT-UNIFY §9.2: 次行動CD専用のatkUntil。クリ窓中のボスは×2(bossCritCdMult)。
        // windup/active/recoverの各durationは従来のatkUntilのまま(予告のリード時間は変えない)。
        const atkCdUntil = (ms: number) => gameTime + (ms / ENEMY_ATTACK_SPEED_MULT) * bossCritCdMult(enemy, gameTime);
        /**
         * v0.25.2603(社長裁定「3秒 + 頻度を実際に半分へ」): クリ窓(黄色)中の**技と技の間のひるみ**。
         *
         * なぜ要るか(社長報告「黄色痺れ中、ボスの攻撃頻度変わらないんだけど?」): 城ボスの次の行動は
         * **技ごとの独立CD(5本+ステージ固有+グレン)**で決まる。よって「いま終わった技のCD」だけを×2に
         * しても、他の技が明けていれば**すぐ次を撃ってくる**=攻撃頻度が体感で変わらなかった。
         * (トール/裏ボス/天使/idolは次行動タイマーが1本なので×2がそのまま効いていた=城ボスだけの穴。)
         *
         * 直し方: 全体の仕切り `aiReadyAt` へ **(倍率-1)×いま終わった技のCD** を足す。
         *  - 窓の外(倍率1)は足す量が **0** = 今までと1バイトも同じ挙動。
         *  - 窓の中(倍率2)は「終わった技のCD1本ぶん」余分に待つ = 窓の間だけ本当に間隔が伸びる。
         * 物差しに既存のCD値を使うので新しい定数を増やさない(重い技のあとほど長く休む=自然)。
         * 実行中の技は中断しない(掟W4「予告を出したら必ず実行」)=ひるみは**技の間にだけ**入る。
         * 既存の `aiReadyAt`(パリィ直後の一時停止)は **Math.max で縮めない**。
         */
        const critFlinchPatch = (cdMs: number): Partial<Enemy> => {
          const mult = bossCritCdMult(enemy, gameTime);
          if (mult <= 1) return {};
          return { aiReadyAt: Math.max(enemy.aiReadyAt ?? 0, gameTime + (mult - 1) * (cdMs / ENEMY_ATTACK_SPEED_MULT)) };
        };

        // Knockback overrides chase AI: while it's active, slide outward
        // with linearly-decaying velocity instead of seeking the player.
        // v0.25.3271裁定: 攻撃モーション中(aiPhase あり)の雑魚も**位置はスライドする**
        // (technique自体は中断しない=やり切る。滑らせないのは committed=空中ジャンプ/ダッシュ突進だけ)。
        // v0.25.2607(社長裁定「2にしよう」): **ボスは通常の殴り/弾では押されない。押し道具(鞭・
        // シールドバッシュ)だけ効く。** 直した不格好さは2つ:
        //  ① 紫の完全気絶中、殴るたびに巨体がズルズル動く(気絶は技を解除する=下のcommittedガードが
        //     外れるので押しが通っていた)。
        //  ② 天使がイベントのサークルから押し出され、次フレームのクランプ(上のfromEvent閉じ込め)に
        //     引き戻される綱引き=「押される→すぐ戻る」。押す力を消せば綱引きも起きない。
        // 通常敵はこのガードと無関係=従来どおり全ての手段で押される。
        const bossShoveOk = canShoveEnemy(enemy, now);
        if (!committed && bossShoveOk && enemy.knockbackUntil && now < enemy.knockbackUntil) {
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
          const recycleZoomOverscan = (labTheme || indoor) ? 1 : 1 / ZOOM_MIN_ABS; // ★一番引いた時を基準に(v0.25.2412)
          const recycleHalfW = (state.gameBounds.width / 2) * recycleZoomOverscan + OFFSCREEN_RECYCLE_MARGIN;
          const recycleHalfH = (state.gameBounds.height / 2) * recycleZoomOverscan + OFFSCREEN_RECYCLE_MARGIN;
          const bufferX = enemy.width;  // 境界ぎりぎりではなく内側へ余裕を持って着地させる
          const bufferY = enemy.height;
          const kbCenterX = kb.x + enemy.width / 2;
          const kbCenterY = kb.y + enemy.height / 2;
          const clampedCenterX = Math.max(pcx - (recycleHalfW - bufferX), Math.min(pcx + (recycleHalfW - bufferX), kbCenterX));
          const clampedCenterY = Math.max(pcy - (recycleHalfH - bufferY), Math.min(pcy + (recycleHalfH - bufferY), kbCenterY));
          // ★v0.25.3875(社長報告2026-08-24「鞭で移動不可のほうにとんでって、そこから攻撃された」):
          // ここは**画面外リサイクル境界**しか見ておらず、**「行ける帯」(clampRectToPlayableArea)を
          // 通していなかった**。追跡AI側(このifブロックの外)は通しているので、**押し道具で飛ばした時
          // だけ**プレイヤーが入れない場所へ敵を置ける穴になっていた。鞭は WHIP_KNOCKBACK_SPEED=600
          // =通常の4.5倍なので、いちばん簡単にこの穴を踏む。
          // CLAUDE.md「アクターを新しく動かす時は、必ず clampRectToPlayableArea を通す」。
          const kbCtx: PlayableAreaCtx = {
            farBackdrop: state.farBackdrop, labTheme,
            corridorMode: state.corridorMode,
            m0AdvanceLimitX: state.m0AdvanceLimitX,
            corridorRunInActive: state.corridorRunInActive,
          };
          const kbPlaced = clampRectToPlayableArea(
            clampedCenterX - enemy.width / 2, clampedCenterY - enemy.height / 2,
            enemy.width, enemy.height, kbCtx, enemy.x,
          );
          return { ...enemy, x: kbPlaced.x, y: kbPlaced.y };
        }

        // v0.25.2895: 裏ボス4体/天使6体/アイドル(=isHiddenBoss)はここで抜ける。上のノックバック
        // 適用ブロックはbossShoveOk(canShoveEnemyのガード=押し道具だけ)を通ってから来るので、
        // ここより手前で抜けると押し道具が11体に永遠に届かない(直った不具合)。以降(liftUntil等の
        // 通常追跡AI)は従来どおり専用コントローラに任せて抜ける。
        // 注意: committed は aiPhase 基準なので、bossState系(裏ボス/天使/idol)の攻撃中は
        // このガードに掛からず、押し道具が攻撃中でも通る。押し道具は単発の意図的な技のため仕様として許容する。
        // §6.38 B1(賞金首): idol等と同じ「専用コントローラ(bountyTick.ts)で動く」型なので同様に抜ける。
        // research/GHOST_BOSS.md(幻影): 専用コントローラ(phantomTick.ts)だけが動かす=二重駆動の禁止。
        // ここを抜けないと、通常追跡AI(接近/接触)と phantomTick が同じフレームで座標を奪い合う。
        if (isHiddenBoss(enemy.type) || isBountyType(enemy.type) || isGuardianPhantom(enemy.type)) return enemy;

        // Bosses pop up briefly when they take melee finisher-grade damage;
        // while airborne they should read as caught, not still advancing.
        if (!committed && enemy.liftUntil !== undefined && now < enemy.liftUntil) {
          return { ...enemy, vx: 0, vy: 0 };
        }

        // Stun (from a crit) freezes the enemy in place — it's a sitting duck
        // for a melee finisher. gameTime-based so pauses don't cheat the timer.
        // v0.25.3037(社長裁定・案1「紫になったら全技キャンセル」): 紫(完全気絶)は committed
        // (空中ジャンプ/突進の実行中)でも中断してその場に着地させる。黄(通常スタン)は従来どおり
        // committed を完遂させる(挙動不変)。
        const purpleNow = enemy.bossFullStunUntil !== undefined && gameTime < enemy.bossFullStunUntil;
        if ((!committed || purpleNow) && enemy.stunUntil !== undefined && gameTime < enemy.stunUntil) {
          // 気絶したら、突進/ジャンプ等の特殊挙動(aiPhase)を必ずリセットして「着地・静止」させる。
          // パンプキンのジャンプ準備/ジャンプ中、werewolf の溜め/突進、今後の特殊敵も aiPhase 基準で同様にキャンセル。
          if (enemy.aiPhase !== undefined) {
            // ★中断でも技のCDを確定する(v0.25.3697・社長報告「樹木のCD12秒もあった?割と連発してきた」):
            // 従来この割り込みは aiPhase を解除するだけで、技ごとのCD(gStageReadyAt/gGlenReadyAt)は
            // **recover満了時にしか書かれなかった**。→カウンター/気絶で技を中断させるたびに、同じ大技が
            // 即座に再抽選対象へ戻る=体感「CDが無い連発」。中断も「1回使った」扱いでCDを書く。
            const stMv = giantStageMoveOfPhase(enemy.aiPhase);
            const glMv = glenMoveOfPhase(enemy.aiPhase);
            const stageCdMs: Record<GiantStageMoveId, number> = {
              bite: GIANT_BITE_CD_MS, slam: GIANT_SLAM_CD_MS, glide: GIANT_GLIDE_CD_MS,
              dive: GIANT_DIVE_CD_MS, quaddash: GIANT_QUAD_CD_MS, nova: GIANT_NOVA_CD_MS,
              wing: GIANT_WING_CD_MS, sweepbeam: GIANT_SWEEPBEAM_CD_MS, trishot: GIANT_TRISHOT_CD_MS,
            };
            const glenCdMs: Record<GlenMoveId, number> = {
              talon: GLEN_TALON_CD_MS, boon: GLEN_BOON_CD_MS, reach: GLEN_REACH_CD_MS,
              nihil: GLEN_NIHIL_CD_MS, trijump: GLEN_TRIJUMP_CD_MS, tailslam: GLEN_TAILSLAM_CD_MS,
            };
            return {
              ...enemy, vx: 0, vy: 0,
              ...(stMv ? { gStageReadyAt: { ...enemy.gStageReadyAt, [stMv]: atkCdUntil(stageCdMs[stMv]) } } : {}),
              ...(glMv ? { gGlenReadyAt: { ...enemy.gGlenReadyAt, [glMv]: atkCdUntil(glenCdMs[glMv]) } } : {}),
              // ★v0.25.4081(社長報告「まだ技エフェクトがカウンターで残ってる。例えば城5の3連打ち」):
              // 中断=技のキャンセルなのに、予約済みの未起爆遅延ヒット(三連射の三拍目・滑空二撃目等)は
              // 残っていた——しかも気絶中は消化ループ(下のgiantDelayedHitsブロック)がこの早期returnで
              // 届かないため、帯が凍って残り気絶明けに発火する。紫(v0.25.3037)と同じ規則で未起爆だけ
              // 破棄する(burst=床など世界に出た危険物は残す)。
              ...(enemy.giantDelayedHits !== undefined
                ? { giantDelayedHits: keepBurstDelayedHits(enemy.giantDelayedHits) }
                : {}),
              aiPhase: undefined, aiPhaseUntil: undefined, aiStartedAt: undefined,
              aiTargetX: undefined, aiTargetY: undefined, aiFromX: undefined, aiFromY: undefined,
              aiReadyAt: enemy.stunUntil + 300, // 気絶明け後しばらくは特殊行動を再発動しない
            };
          }
          return enemy;
        }

        // Trap root freezes movement only. It deliberately does not share the
        // crit stun state, so rooted enemies are not melee-finisher targets.
        // ★技の発動中はトラップの拘束をすり抜ける(社長報告v0.25.2421「トラップで敵の動きを止めると、
        // ジャンプとか技発動中におかしくなる」)。
        // 原因: この早期 return は**AI本体より手前**にあるので、拘束が乗ると座標だけでなく
        // **攻撃の状態機械ごと止まる**(aiPhase が進まない=溜めたまま固まる/飛んだまま着地しない)。
        // 技を出している最中(aiPhase あり)は拘束を無視し、状態機械を最後まで走らせて終わらせる。
        // トラップ自体の効果・時間は不変で、**攻撃を出し切ってから効く**ようになるだけ。
        if (enemy.rootUntil !== undefined && gameTime < enemy.rootUntil && !enemy.aiPhase) {
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
            // ★リーシュで待機に戻った城ボスは、待っている間じわじわ回復する(社長裁定v0.25.2418)。
            // ソウル系の標準は「離脱=全快リセット」だが、開けたフィールドの本作でそれをやると
            // うっかり離れただけで進捗が全部消えて理不尽。**じわじわ**なら、離脱の代償が
            // 「離れていた時間」に比例するので、削って逃げて回復して戻る消耗戦は成立しないまま、
            // 事故で全部消えることもない。
            // 速度は**裏ボスと同じ既存定数を流用**(BOSS_REGEN_PER_SEC=10/秒。社長が40→10へ調整済み)。
            // 新しい数字を発明しない=バランスの出どころを1つに保つ。
            // §6.38 B1.5-6(賞金首): isLeashableBossはSet化で賞金首4型も含む(bountyTick.tsが直接
            // bossLeashDistancePx等の同じ土管を読むため=D-3裁定)が、この城ボス専用インライン処理
            // 自体は**通らない**——賞金首はこのmapへ入る前(isHiddenBoss/isBountyTypeの早期return)で
            // 既に抜けている。ただし「isLeashableBossに載っている=いつかこの分岐へ来る」という誤解に
            // よる将来の事故を防ぐため、暗黙の早期returnに依存せずここでも明示的に除外しておく。
            if (isLeashableBoss(enemy.type) && !enemy.isStoryBoss && !isBountyType(enemy.type)) {
              // ★城へゆっくり歩いて帰る(社長指示v0.25.2419)。巣=出現地点(useGameLoopがhomeX/homeYを設定)。
              // 追跡時の速度のままだと「猛然と帰っていく」絵になるので半分にする。歩きなので障害物は
              // 通常どおり resolveMove で解決する(ダッシュではない=貫通しない)。
              const hx = enemy.homeX, hy = enemy.homeY;
              let hp = { x: enemy.x, y: enemy.y };
              if (hx !== undefined && hy !== undefined) {
                const dhx = hx - enemy.x, dhy = hy - enemy.y;
                const dl = Math.hypot(dhx, dhy);
                if (dl > 2) {
                  const mv = Math.min(enemy.speed * BOSS_LEASH_RETURN_SPEED_MULT * deltaTime, dl);
                  hp = resolveMove(enemy.x + (dhx / dl) * mv, enemy.y + (dhy / dl) * mv);
                }
              }
              // 帰巣中も回復する(裏ボスの帰巣と同じ扱い)。
              return {
                ...enemy, x: hp.x, y: hp.y, vx: 0, vy: 0,
                health: Math.min(enemy.maxHealth, enemy.health + BOSS_LEASH_REGEN_PER_SEC * deltaTime),
              };
            }
            return { ...enemy, vx: 0, vy: 0 };
          }
          return { ...enemy, dormant: false, vx: 0, vy: 0, bossLeashSince: undefined };
        }

        // ★リーシュ(社長裁定v0.25.2418): 起きている城ボスがプレイヤーから離れ切ったら、
        // **その場で待機(dormant)へ戻す**。旧挙動は汎用オフスクリーンリサイクルによる
        // 「HPを保ったまま画面外の別位置へ再配置」=社長が「ワープしてくる」と感じていたもの。
        //  ・テレポートが無くなる(見た目の不自然さが消える)
        //  ・追ってこない代わりに**待っているだけ**=離れて一方的に削るハメも成立しない
        //  ・`bossEngagedNow` が dormant を見ているので、**雑魚の湧きも自動で通常へ戻る**
        // 技の実行中(aiPhase あり)は待機に戻さない=攻撃を中断してその場で固まる事故を防ぐ。
        // ストーリーボス(stage-7グレン/ex1)は**リーシュしない**(社長指示v0.25.2420「実質逃げれない
        // ようにする」)。雑魚が出ないステージなので、待機に戻したら逃げ切りが成立してしまう。
        // 代わりに無限ジャンプ(giantScript.ts)で、どこまで逃げても飛んで追ってくる。
        // §6.38 B1.5-6(賞金首): 離脱警告バナー(下のbossLeashWarning=true)は「逃げてよい相手」の
        // 賞金首には出さない。isBountyTypeを明示的に除外する(暗黙の早期return依存をやめる=上と同じ理由)。
        if (isLeashableBoss(enemy.type) && !enemy.isStoryBoss && !isBountyType(enemy.type)) {
          const leashDistance = Math.hypot(pcx - (enemy.x + enemy.width / 2), pcy - (enemy.y + enemy.height / 2));
          const leashLimit = bossLeashDistancePx(enemy.type, false);
          // v0.25.3052(社長報告「滑空系でまだ『離脱しようとしている』が出るやつある」): 急降下
          // (g-dive-windup)は**技の仕様としてボス自身が場外へ退避する**ため、プレイヤーが逃げていなくても
          // 距離がリーシュ限界を超え、毎回「危険:ボスが戦闘域を離れようとしている」を誤発報していた。
          // ボスが自分の技で離れている間は離脱判定の対象外にする(範囲内扱い=予兆もリセット)。
          // 着地後(recover)は判定終点=プレイヤー近くに戻っているので対象はwindupだけでよい。
          const leashSelfExiled = enemy.aiPhase === 'g-dive-windup';
          const grace = advanceBossDisengageGrace(!leashSelfExiled && leashDistance > leashLimit, enemy.bossLeashSince, gameTime);
          if (grace.started) bossLeashWarning = true;
          if (grace.since !== enemy.bossLeashSince) enemy = { ...enemy, bossLeashSince: grace.since };
          // 技の実行中は台本を完走。範囲外3秒が経過済みなら、終了直後に待機へ戻る。
          if (grace.ready && !enemy.aiPhase) {
            return {
              ...enemy, dormant: true, vx: 0, vy: 0, bossLeashSince: undefined,
              aiPhaseUntil: undefined, aiStartedAt: undefined,
              aiTargetX: undefined, aiTargetY: undefined, aiFromX: undefined, aiFromY: undefined,
            };
          }
        }

        // ステージ2(研究所)の索敵解除(社長承認 M2_LAB_CORRIDOR_SPEC.md v0.25.2175「横長廊下+視線切り
        // ステルス」・純関数=labStealth.ts): 起床中のlab-zombieが「壁/什器で視線が遮られた」または
        // 「プレイヤーとの距離 > LAB_LOSE_SIGHT_RANGE(450px)」の状態が LAB_LOSE_SIGHT_MS(1000ms)継続
        // したら見失って再休眠。再発見は上のdormantブロック(視界300px+視線・不変)。ヒステリシス
        // (覚醒300px/見失い450px)があり点滅しない。ラボのlab-zombie限定=他ステージ・他の敵は不変。
        if (labTheme && enemy.type.startsWith('lab-zombie')) {
          const ecx3 = enemy.x + enemy.width / 2;
          const ecy3 = enemy.y + enemy.height / 2;
          const dist3 = Math.hypot(pcx - ecx3, pcy - ecy3);
          const blocked3 = losWalls.length > 0 && segmentBlocked(pcx, pcy, ecx3, ecy3, losWalls);
          const lose = evaluateLabLoseSight({ losBlocked: blocked3, distance: dist3, losLostSince: enemy.losLostSince, now: gameTime });
          if (lose.shouldDormant) {
            return {
              ...enemy, dormant: true, vx: 0, vy: 0,
              aiPhase: undefined, aiPhaseUntil: undefined, aiStartedAt: undefined,
              aiTargetX: undefined, aiTargetY: undefined, aiFromX: undefined, aiFromY: undefined,
              aiReadyAt: undefined, losLostSince: undefined,
            };
          }
          if (lose.losLostSince !== enemy.losLostSince) {
            enemy = { ...enemy, losLostSince: lose.losLostSince };
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

        // ==== M51: 城ボス「ジャイアント」新行動スクリプト(PACING_PUZZLE.md §6.26) ====
        // 有効時(既定)は giantbat の全フレームをここで処理して return する。よって下の isDashType /
        // パンプキン型ブロック / 旧専用スケジューラは giantbat に対しては(型は一致するがどの
        // aiPhase 文字列も一致しないため)完全に素通りするだけで実行されない=他タイプ
        // (werewolf/lab-zombie-2/pumpkin/lab-zombie-3/hunter)は無改変(受け入れ条件10)。
        // `?giantscript=0` で本ブロックごとスキップ=旧経路(isDashType等+専用スケジューラ)へ完全フォールバック。
        if (enemy.type === 'giantbat' && GIANT_SCRIPT_ENABLED) {
          const ecx = enemy.x + enemy.width / 2, ecy = enemy.y + enemy.height / 2;
          const dist = Math.hypot(pcx - ecx, pcy - ecy);
          // research/AI_HUMANIZE.md B1(コマ台帳・記録専用・挙動不変): giantbat系の州満了エッジ用ヘルパ。
          // liveShape省略=body-only(g-bolt-windupのみ。EPISODE_SHAPE_DECLが自動でbodyへ落とす)。
          const settleGiantHabit = (
            phaseState: string,
            opts?: { liveShape?: CounterReachShape; aiFromX?: number; aiFromY?: number; aiTargetX?: number; aiTargetY?: number },
          ): void => {
            settleEpisode({
              gameTime, enemyType: 'giantbat', state: phaseState,
              bcx: ecx, bcy: ecy, pcx, pcy,
              aiFromX: opts?.aiFromX ?? enemy.aiFromX, aiFromY: opts?.aiFromY ?? enemy.aiFromY,
              aiTargetX: opts?.aiTargetX ?? enemy.aiTargetX, aiTargetY: opts?.aiTargetY ?? enemy.aiTargetY,
              bossRect: { x: enemy.x, y: enemy.y, width: enemy.width, height: enemy.height },
              liveShape: opts?.liveShape,
              playerHealth: player.health, playerMaxHealth: player.maxHealth,
              lastDamagedAtGame: player.lastDamagedAtGame,
            });
          };
          // 連射/弱追尾中は技開始時に選んだ側だけを追う。ヘイト値の再評価は次の技開始まで行わない。
          const lockedHateAim = () => resolveBossLockedHateAim(enemy, { x: pcx, y: pcy }, summons);
          const healthFrac = enemy.maxHealth > 0 ? enemy.health / enemy.maxHealth : 1;
          // M60(§6.28-11): isStoryBossはグレン(stage-7)/未確認変異体(stage-ex1)としてスポーンされた
          // 個体だけに立つ(useGameLoop.ts)。通常城ボスはfalseのまま=giantPhaseForHealth(無改変)しか
          // 呼ばないので、Phase3・500ms床・3連携のどれにも一切到達しない(受け入れ条件13)。
          const isStoryBoss = enemy.isStoryBoss === true && STORY_BOSS_SCRIPT_ENABLED;
          const phase: GiantPhase = isStoryBoss ? giantPhaseForHealthStory(healthFrac) : giantPhaseForHealth(healthFrac);
          // M66(§6.26-11): 遅延起爆キューの処理(滑空の二撃目/翼撃の三拍目/三連突進の氷)。aiPhaseに
          // 関係なく毎フレーム判定する(recoverや次のwindup中でも起爆する=学習装置①「固定遅延」の本体。
          // 乱数を挟まない=fireAtは積んだ時点で確定済み)。isStoryBoss個体はGIANT_STAGE_UNIQUE_MOVE等に
          // 定義が無く新技を一切選ばないため、このキューは常に空のまま=無害。
          let giantDelayedHits = enemy.giantDelayedHits;
          // M67: isStoryBoss個体(Glen専用の血の弧=boon)はfloorUntil付きエントリをこのキューへ積みうる。
          // `?giantunique=0`(GIANT_UNIQUE_ENABLED=false)でもGlenの床が消化され続けるよう、isStoryBoss
          // 個体はGIANT_UNIQUE_ENABLEDの値に関係なく処理する(Glenは別の`?glenscript=0`で独立に制御される。
          // 通常城ボスの挙動=GIANT_UNIQUE_ENABLED経由のゲートは無改変)。
          if ((GIANT_UNIQUE_ENABLED || isStoryBoss) && giantDelayedHits && giantDelayedHits.length > 0) {
            // M67: burstは「既にこの一撃(pumpkinBlasts)を消化済みか」。floorUntil付き(boon)は爆発後も
            // 削除せず「床」として保持し続けるため、二重発火を防ぐ目印が要る(既存3用途はburst未設定の
            // ままなので、この判定を足しても挙動は完全に不変=即座にfireAt後フィルタで消える)。
            const dueHits = giantDelayedHits.filter(h => gameTime >= h.fireAt && !h.burst);
            if (dueHits.length > 0) {
              for (const h of dueHits) {
                // v0.25.3126: 遅延起爆ごとのダメージ上書き(未設定=従来どおり enemy.damage)。
                pumpkinBlasts.push({ x: h.x, y: h.y, radius: h.radius, damage: h.damage ?? enemy.damage, enemyId: enemy.id, ice: h.ice, capsule: h.capsule, moveKey: h.moveKey });
                // v0.25.3074(社長指示「キラキラ粉塵爆発!」): 氷が砕ける瞬間、凝縮しきったキラキラが
                // 一気に外へ散る。√乱数で円内に均等分布させる(中心に固まらない)。
                if (h.ice) {
                  // 「飛び散る」= 中を埋めるのではなく**外向きのリング**に置く(内側は空ける)。
                  for (let bi = 0; bi < QUAD_ICE_BURST_N; bi++) {
                    const ba = (bi / QUAD_ICE_BURST_N) * Math.PI * 2 + Math.random() * 0.5; // 均等+ゆらぎ
                    const br = h.radius * (QUAD_ICE_BURST_INNER
                      + (QUAD_ICE_BURST_OUTER - QUAD_ICE_BURST_INNER) * Math.random());
                    quadBreathSparkles.push({ x: h.x + Math.cos(ba) * br, y: h.y + Math.sin(ba) * br });
                  }
                }
              }
            }
            // v0.25.3074(社長指示「サークル状に散らばってるキラキラが中心に凝縮され」): 予告の間、
            // **撒く半径を円周から中心へ詰めていく**(残り時間に比例)。キラキラ自体は動かせないので、
            // 「出る位置がだんだん内側へ寄る」ことで凝縮に見せる。起爆の瞬間には半径ほぼ0=中心へ集まりきる。
            if (shouldEmitThrottled(gameTime, runClocks.iceGather, QUAD_ICE_GATHER_MS)) {
              runClocks.iceGather = gameTime;
              for (const h of giantDelayedHits) {
                if (!h.ice || h.burst) continue;
                const gt = Math.max(0, Math.min(1, (gameTime - h.bornAt) / Math.max(1, h.fireAt - h.bornAt)));
                // 半径の詰まり方を二乗にして、**終盤で一気に一点へ集まる**(=爆弾の玉になる)。
                // 三乗で詰めて**一気に一点へ**寄せる(社長「もっともっと小さく纏まってから爆発」)。
                const shrink = (1 - gt) * (1 - gt) * (1 - gt);
                const tight = gt >= QUAD_ICE_TIGHT_FROM;
                // 玉の段階は**絶対pxで**縛る=どの氷でも同じ小ささの塊になる。
                const ring = tight
                  ? Math.min(QUAD_ICE_BALL_PX, h.radius * shrink)
                  : h.radius * shrink;
                const n = tight ? QUAD_ICE_GATHER_TIGHT_N : QUAD_ICE_GATHER_N;
                // v0.25.3079(社長指示「絵もギュッとしてほしい。丸く小さくまとまる様に」):
                // 粒**そのもの**も凝縮に合わせて小さくする(位置だけ寄せても、大きい粒のままだと
                // 「小さく纏まった」に見えない)。玉の段階では寿命も短くして塊の輪郭を締める。
                const gScale = QUAD_ICE_SPARK_SCALE_MAX
                  + (QUAD_ICE_SPARK_SCALE_MIN - QUAD_ICE_SPARK_SCALE_MAX) * gt;
                for (let gi = 0; gi < n; gi++) {
                  const ga = Math.random() * Math.PI * 2;
                  // 玉の段階は面積で均す(√)=中心に偏らず**丸い塊**に見える。
                  const gr = tight ? ring * Math.sqrt(Math.random()) : ring * (0.8 + Math.random() * 0.35);
                  quadBreathSparkles.push({
                    x: h.x + Math.cos(ga) * gr, y: h.y + Math.sin(ga) * gr,
                    scale: gScale, life: tight ? 260 + Math.random() * 120 : undefined,
                  });
                }
              }
            }
            // ★爆発の一瞬前の「ピカッ」(社長指示v0.25.3079)。**毎フレーム**判定する
            // (キラキラの間引きの中に入れると、間引き間隔と前倒し時間の噛み合わせ次第で1度も
            //  発火しない=v0.25.3070「キラキラが消えた」と同型の取りこぼしになる)。
            // 1回だけ出す印(flashed)は、下の map で**新しいオブジェクトとして**立てる
            // (前フレームのstateを直接書き換えない=このプロジェクトの不変の作法)。
            const flashHits = giantDelayedHits.filter(h =>
              h.ice && !h.burst && !h.flashed && gameTime >= h.fireAt - QUAD_ICE_FLASH_LEAD_MS);
            for (const h of flashHits) iceFlashAt.push({ x: h.x, y: h.y });
            giantDelayedHits = giantDelayedHits
              .map(h => (dueHits.includes(h) ? { ...h, burst: true } : flashHits.includes(h) ? { ...h, flashed: true } : h))
              .filter(h => gameTime < (h.floorUntil ?? h.fireAt));
          }
          // v0.25.3027(社長裁定「体パーツから弾を両サイドに発射」): グレン第二形態の胴体弾。
          // 軌跡は第二形態中に毎tick記録し、**技の合間(aiPhase無し=追跡/歩行中)だけ**CDが満ちたら
          // 発射予約(裁定3「予告中は撃たない」)。発射はpost-set(giantBoltFiresと同じ作法)。
          // 変身直後は種付けのみ=初回はCD後(監査指摘: 変身フラッシュと16発の同時発火を避ける)。
          const glenVolley: { glenVolleyAt?: number } = {};
          // v0.25.3029(二体構成): 胴体弾はglenForm===2の個体だけ(旧: 同一個体のHP60%以下)。
          if (glenScriptApplies(enemy.isStoryBoss, enemy.storyBossVariant, GLEN_SCRIPT_ENABLED) && enemy.glenForm === 2) {
            if (glenSimTrail?.id !== enemy.id) glenSimTrail = { id: enemy.id, trail: [] };
            pushGlenTrail(glenSimTrail.trail, enemy.x + enemy.width / 2, enemy.y + enemy.height);
            if (enemy.glenVolleyAt == null) {
              glenVolley.glenVolleyAt = gameTime;
            } else if (shouldGlenVolley(true, enemy.aiPhase, enemy.glenVolleyAt, gameTime,
                GLEN_VOLLEY_CD_MS / ENEMY_ATTACK_SPEED_MULT)) {
              glenVolley.glenVolleyAt = gameTime;
              glenVolleyFires.push(enemy.id);
            }
          }
          const phaseFields = {
            giantPhase: phase,
            giantPhaseFlashUntil: giantPhaseJustChanged(enemy.giantPhase, phase) ? gameTime + GIANT_PHASE_FLASH_MS : enemy.giantPhaseFlashUntil,
            giantDelayedHits,
            ...glenVolley,
          };
          // M65(社長指示): ステージ別の範囲/速度倍率。stage-1=1.00(実機合格済みの基準・不変)。
          // stage-7/stage-ex1はstoryBossだけが到達するため、ステージIDだけで既にstoryBoss込みの値になる
          // (giantScript.ts参照)。`?giantstage=0`でGIANT_STAGE_RANGE_ENABLED=falseになり常に1.00。
          // M66: stageIdは新技の選択(pickGiantMoveWithStage)にもそのまま使い回す(M65の倍率とM66の
          // 新技には二重に効かせない=stageMultはM65の3値にしか掛けない・M66の新技へは掛けない)。
          const stageId = getSelectedStageId();
          const stageMult = giantStageRangeMult(stageId, GIANT_STAGE_RANGE_ENABLED);
          const giantRestMs = (rawMs: number): number => giantRestRawMs(stageId, rawMs);
          const scriptRestMs = (rawMs: number): number => choreographyRecoverMs(giantRestMs(rawMs), (enemy.bossScriptQueue?.length ?? 0) > 0);
          const stompRecoverMs = scriptRestMs(phase === 3 ? GIANT_STOMP_RECOVER_PHASE3_MS : GIANT_STOMP_RECOVER_MS);
          const sweepRecoverMs = scriptRestMs(phase === 3 ? GIANT_SWEEP_RECOVER_PHASE3_MS : GIANT_SWEEP_RECOVER_MS);
          const dashRecoverMs = scriptRestMs(phase === 3 ? GIANT_DASH_RECOVER_PHASE3_MS : GIANT_DASH_RECOVER_MS);
          const jumpRecoverMs = scriptRestMs(phase === 3 ? GIANT_JUMP_RECOVER_PHASE3_MS : GIANT_JUMP_RECOVER_MS);
          const boltRecoverMs = scriptRestMs(GIANT_BOLT_RECOVER_MS);
          const boltCdMs = phase === 3 ? GIANT_BOLT_CD_PHASE3_MS : phase === 2 ? GIANT_BOLT_CD_PHASE2_MS : GIANT_BOLT_CD_PHASE1_MS;

          // 技ごとの溜め開始パッチ(通常抽選/Phase2連携の両方から呼べる共通ヘルパ)。
          const beginGiantMove = (move: GiantMove): Partial<Enemy> => {
            switch (move) {
              case 'stomp': {
                // 実際に使う半径をステージ別倍率込みでここに確定して敵へ持たせる(M65)。判定
                // (下のg-stomp-windup完了時)・描画(pixiScene.ts)・レベルアップ保留判定
                // (isPlayerInAttackTelegraph)の3箇所が同じ値を読むので図形と判定がドリフトしない。
                // v0.25.2579(社長指示「ボスの当たり判定プラスアルファで設定した方がいい」): 固定値でなく
                // **体の判定帯の半径+GIANT_STOMP_REACH_PX(縁からの届き)**で導出。体格が変わっても
                // 近接の間合い(縁基準)と自動で整合する。
                const strip = enemyHitStrip(enemy);
                return {
                  aiPhase: 'g-stomp-windup', aiPhaseUntil: atkUntil(GIANT_STOMP_WINDUP_MS),
                  aiFromX: enemy.x, aiFromY: enemy.y, aiTargetX: ecx, aiTargetY: ecy, aiStartedAt: gameTime,
                  gStompRadius: (Math.max(strip.width, strip.height) / 2 + GIANT_STOMP_REACH_PX) * stageMult,
                };
              }
              case 'sweep': {
                // 向きは溜め開始時にロック(掟W4=テルを出したら必ず撃つ。トール払いと同じ作法)。
                // BOT_AND_GHOST.md §2.8 G2.5: 狙い点はpcx/pcyの代わりにヘイト対象の中心を読む。
                const aim = resolveBossHateAim(enemy, { x: pcx, y: pcy }, summons, gameTime);
                const ddl = Math.hypot(aim.x - ecx, aim.y - ecy) || 1;
                const dirx = (aim.x - ecx) / ddl, diry = (aim.y - ecy) / ddl;
                // §15パイロット(社長GO 2026-08-30「はい」): windupの前に追尾相(g-sweep-track)を挟む。
                // ?ttrack=0 なら track に一切入らない=従来と完全一致(§15-7条件4のロールバック)。
                if (TELEGRAPH_TRACK_MS > 0) {
                  return {
                    aiPhase: 'g-sweep-track', aiPhaseUntil: atkUntil(TELEGRAPH_TRACK_MS),
                    aiFromX: ecx, aiFromY: ecy,
                    aiTargetX: ecx + dirx * GIANT_SWEEP_RANGE, aiTargetY: ecy + diry * GIANT_SWEEP_RANGE,
                    gTrackAimX: aim.x, gTrackAimY: aim.y, gTrackVx: 0, gTrackVy: 0,
                    aiStartedAt: gameTime, hateTarget: aim.side,
                  };
                }
                return {
                  aiPhase: 'g-sweep-windup', aiPhaseUntil: atkUntil(GIANT_SWEEP_WINDUP_MS),
                  aiFromX: ecx, aiFromY: ecy,
                  aiTargetX: ecx + dirx * GIANT_SWEEP_RANGE, aiTargetY: ecy + diry * GIANT_SWEEP_RANGE,
                  aiStartedAt: gameTime, hateTarget: aim.side,
                };
              }
              case 'jump': {
                // 狙い点は溜め開始時にロック(社長裁定6.26-9 #1)。着地アークは着地円と同じ左上座標系。
                // 着地AoE半径もステージ別倍率込みでここに確定して敵へ持たせる(M65・stomp同様)。
                // ★着地点が当たり判定のあるオブジェクトの中なら横へ押し出す(社長指示v0.25.2415)。
                // プレイヤーが木/バス/建物に張り付いていると着地円が丸ごとオブジェクトの中に入り、
                // **赤い円の中に立てない=避けようがない/当たりようがない**という意味不明な絵になる。
                // 押し出しは resolveMove(敵の当たり判定を解決する唯一の関数)をそのまま使う=
                // 「同じ判定を2箇所に書かない」(この型の事故は v0.25.2383/2387/2389 で3回起きている)。
                // この時点の aiPhase はまだ溜め前=貫通しない経路なのできちんと解決される。
                // BOT_AND_GHOST.md §2.8 G2.5: 着地点=pcx/pcyの代わりにヘイト対象の中心を読む。
                const aim = resolveBossHateAim(enemy, { x: pcx, y: pcy }, summons, gameTime);
                const land = resolveMove(aim.x - enemy.width / 2, aim.y - enemy.height / 2);
                return {
                  aiPhase: 'g-jump-windup', aiPhaseUntil: atkUntil(GIANT_JUMP_WINDUP_MS),
                  aiFromX: enemy.x, aiFromY: enemy.y,
                  aiTargetX: land.x, aiTargetY: land.y, aiStartedAt: gameTime,
                  gJumpRadius: GIANT_JUMP_RADIUS * Math.min(stageMult, GIANT_JUMP_STAGE_MULT_CAP),
                  hateTarget: aim.side,
                };
              }
              case 'dash': {
                // 狙い点=固定ヘイト対象を挟んだ反対側(距離×2)。距離式は現行不変(6.26-6)。
                // BOT_AND_GHOST.md §2.8 G2.5: 狙い点はpcx/pcyの代わりにヘイト対象の中心を読む。
                const aim = resolveBossHateAim(enemy, { x: pcx, y: pcy }, summons, gameTime);
                return {
                  aiPhase: 'g-dash-windup', aiPhaseUntil: atkUntil(GIANT_DASH_WINDUP_MS),
                  aiFromX: enemy.x, aiFromY: enemy.y,
                  aiTargetX: 2 * aim.x - ecx, aiTargetY: 2 * aim.y - ecy, aiStartedAt: gameTime,
                  hateTarget: aim.side,
                };
              }
              case 'bolt':
              default: {
                const aim = resolveBossHateAim(enemy, { x: pcx, y: pcy }, summons, gameTime);
                return {
                  aiPhase: 'g-bolt-windup', aiPhaseUntil: atkUntil(GIANT_BOLT_WINDUP_MS),
                  aiFromX: enemy.x, aiFromY: enemy.y, aiStartedAt: gameTime,
                  // パターンは**溜め開始で抽選して固定**(掟W4=溜め中に中身が変わらない)。
                  gBoltPattern: Math.random() < 0.5 ? 'fan' : 'burst',
                  gBoltShot: undefined,
                  hateTarget: aim.side,
                };
              }
            }
          };

          // ==== M66(PACING_PUZZLE.md §6.26-11): ステージ別「独自技」(Phase1〜)+「大技」(Phase2〜) ====
          // stage-1/3/4/5だけが呼ぶ(pickGiantMoveWithStageがGIANT_STAGE_UNIQUE_MOVE/ULT_MOVEの表で
          // 既にゲート済みなので、default分岐からしか到達しない=beginGiantMoveと排他)。

          // 三連突進(quaddash)の1回ぶんの溜め開始。狙い点=固定ヘイト対象を挟んだ反対側(既存dashと同じ式・
          // M65の速度倍率は掛けない=新技への非適用指示)。往復するたび対象の現在地を再サンプルする
          // だけで「左右へ往復」を作る(固定の左右オフセットを発明しない=既存語彙の再利用)。
          // BOT_AND_GHOST.md §2.8 G2.5: 各leg(index)の開始=それぞれ独立した「狙いロック」なので、
          // legごとにヘイト対象を評価し直す(毎フレーム追尾ではなく、legの切り替わり=windup開始点のみ)。
          const beginQuadDash = (index: number): Partial<Enemy> => {
            const aim = resolveBossHateAim(enemy, { x: pcx, y: pcy }, summons, gameTime);
            return {
              aiPhase: 'g-quad-windup', aiPhaseUntil: atkUntil(GIANT_QUAD_DASH_WINDUP_MS),
              aiFromX: enemy.x, aiFromY: enemy.y,
              aiTargetX: 2 * aim.x - ecx, aiTargetY: 2 * aim.y - ecy, aiStartedAt: gameTime,
              gQuadIndex: index, hateTarget: aim.side,
            };
          };

          const beginGiantStageMove = (move: GiantStageMoveId): Partial<Enemy> => {
            // BOT_AND_GHOST.md §2.8 G2.5: この呼び出し=1回の「技の狙いロック」なので、ここで1回だけ
            // 評価する(pcx/pcyの代わりにヘイト対象の中心を読む)。quaddashはbeginQuadDashが自前で
            // legごとに再評価するのでここのaimは使わない。
            const aim = resolveBossHateAim(enemy, { x: pcx, y: pcy }, summons, gameTime);
            const lockDl = Math.hypot(aim.x - ecx, aim.y - ecy) || 1;
            const lockDirX = (aim.x - ecx) / lockDl, lockDirY = (aim.y - ecy) / lockDl;
            switch (move) {
              case 'bite':
                // 密着〜近(≤180)。前方の短い帯(足元の円=stompと図形で区別)。向きは溜め開始でロック。
                return {
                  aiPhase: 'g-bite-windup', aiPhaseUntil: atkUntil(GIANT_BITE_WINDUP_MS),
                  aiFromX: ecx, aiFromY: ecy,
                  aiTargetX: ecx + lockDirX * GIANT_BITE_LENGTH, aiTargetY: ecy + lockDirY * GIANT_BITE_LENGTH,
                  aiStartedAt: gameTime, hateTarget: aim.side,
                };
              case 'slam':
                // 近〜中(140〜420)。大きな帯が前方へ伸びる(bite同型・寸法違い)。
                return {
                  aiPhase: 'g-slam-windup', aiPhaseUntil: atkUntil(GIANT_SLAM_WINDUP_MS),
                  aiFromX: ecx, aiFromY: ecy,
                  aiTargetX: ecx + lockDirX * GIANT_SLAM_LENGTH, aiTargetY: ecy + lockDirY * GIANT_SLAM_LENGTH,
                  aiStartedAt: gameTime, hateTarget: aim.side,
                };
              case 'glide':
                // 中〜遠(320〜900)。後ろへ跳び退がって溜める(T8backstep)→本体が通過して薙ぐ。
                // aiFromX/Yは左上座標系(本体移動の補間元。jump-airと同じ流儀)。
                return {
                  aiPhase: 'g-glide-windup', aiPhaseUntil: atkUntil(GIANT_GLIDE_WINDUP_MS),
                  aiFromX: enemy.x, aiFromY: enemy.y,
                  aiTargetX: enemy.x + lockDirX * GIANT_GLIDE_LENGTH, aiTargetY: enemy.y + lockDirY * GIANT_GLIDE_LENGTH,
                  aiStartedAt: gameTime, hateTarget: aim.side,
                };
              case 'dive': {
                // 着地点は溜め開始でロック(既存jumpと同じ裁定・社長裁定6.26-9 #1の踏襲)。本体は
                // 「無敵ではなく居ない」=場外へ実座標を退避する(directorTick.tsのオフスクリーン
                // リサイクルはg-dive-windupを対象外として別途ガード済み)。
                // BOT_AND_GHOST.md §2.8 G2.5: 着地点=pcx/pcyの代わりにヘイト対象の中心(上のaim)。
                const landX = aim.x - enemy.width / 2, landY = aim.y - enemy.height / 2;
                return {
                  aiPhase: 'g-dive-windup', aiPhaseUntil: atkUntil(GIANT_DIVE_WINDUP_MS),
                  aiFromX: enemy.x, aiFromY: enemy.y,
                  aiTargetX: landX, aiTargetY: landY, aiStartedAt: gameTime,
                  x: -GIANT_DIVE_AWAY_OFFSET, y: -GIANT_DIVE_AWAY_OFFSET,
                  hateTarget: aim.side,
                };
              }
              case 'quaddash':
                return beginQuadDash(0);
              case 'nova':
                // 全帯。身を屈めて静止→輪が広がる(輪の中心=溜め開始時の自分の位置に固定)。プレイヤー
                // 方向を使わない技なのでhateTargetは書かない(直前の値=最後に狙いを判断した側を維持)。
                return {
                  aiPhase: 'g-nova-windup', aiPhaseUntil: atkUntil(GIANT_NOVA_WINDUP_MS),
                  aiFromX: ecx, aiFromY: ecy, aiStartedAt: gameTime,
                };
              case 'trishot':
                // 3方向。正面方向を溜め開始でロック(左右2枚+三拍目の中央、全て溜め開始時の向きを共有)。
                return {
                  aiPhase: 'g-trishot-windup', aiPhaseUntil: atkUntil(GIANT_TRISHOT_WINDUP_MS),
                  aiFromX: ecx, aiFromY: ecy,
                  aiTargetX: ecx + lockDirX * GIANT_TRISHOT_LENGTH, aiTargetY: ecy + lockDirY * GIANT_TRISHOT_LENGTH,
                  aiStartedAt: gameTime, hateTarget: aim.side,
                };
              case 'wing':
                // 360度なので**向きを持たない**(溜め開始時の自分の位置だけ固定する=novaと同じ扱い)。
                // hateTarget は書かない=直前の値(最後に狙いを判断した側)を維持する。
                return {
                  aiPhase: 'g-wing-windup', aiPhaseUntil: atkUntil(GIANT_WING_WINDUP_MS),
                  aiFromX: ecx, aiFromY: ecy, aiStartedAt: gameTime,
                };
              case 'sweepbeam':
              default:
                // 全帯。正面方向を溜め開始でロック(回転帯の中心角として使う)。
                return {
                  aiPhase: 'g-sweepbeam-windup', aiPhaseUntil: atkUntil(GIANT_SWEEPBEAM_WINDUP_MS),
                  aiFromX: ecx, aiFromY: ecy,
                  aiTargetX: ecx + lockDirX * GIANT_SWEEPBEAM_LENGTH, aiTargetY: ecy + lockDirY * GIANT_SWEEPBEAM_LENGTH,
                  aiStartedAt: gameTime, hateTarget: aim.side,
                };
            }
          };

          // ステージ固有技の共通後片付け(CD確定+aiPhase系フィールドの解除)。既存5技のGIANT_COMBO_*系
          // (=許可2組のみ・確率40%)はステージ固有技には適用しない(新規の連携表を作らない=覚えられる
          // 上限を超やさない・社長裁定6.26-9 #8の精神を継承)。recoverの後は必ずchase(抽選)へ戻る。
          const finishGiantStageMove = (moveId: GiantStageMoveId, cdMs: number): Partial<Enemy> => ({
            gStageReadyAt: { ...enemy.gStageReadyAt, [moveId]: atkCdUntil(cdMs) },
            ...critFlinchPatch(cdMs), // v0.25.2603: ステージ固有技も同じひるみ(窓外は空=無改変)
            aiReadyAt: Math.max(enemy.aiReadyAt ?? 0, gameTime + BOSS_NEUTRAL_CASTLE_MS), // ★社長裁定2026-08-27: 城ボス2.5秒(移動は従来どおり=追跡が動く)
            aiPhase: undefined, aiPhaseUntil: undefined, aiStartedAt: undefined,
            aiFromX: undefined, aiFromY: undefined, aiTargetX: undefined, aiTargetY: undefined,
            gQuadIndex: undefined, giantActiveHit: undefined,
          });

          // ==== M67(PACING_PUZZLE.md §6.26-12): グレン(stage-7)専用の新技4つ ====
          // 呼び出し元(下のdefault分岐)がglenScriptAppliesで既にstage-7のisStoryBoss個体だけに
          // 絞り込み済み(=stage-ex1/通常城ボスからは絶対に呼ばれない)。
          const beginGlenMove = (move: GlenMoveId): Partial<Enemy> => {
            // BOT_AND_GHOST.md §2.8 G2.5: この呼び出し=1回の「技の狙いロック」なので、ここで1回だけ
            // 評価する(pcx/pcyの代わりにヘイト対象の中心を読む)。全caseで共通に使い回す。
            const aim = resolveBossHateAim(enemy, { x: pcx, y: pcy }, summons, gameTime);
            const lockDl = Math.hypot(aim.x - ecx, aim.y - ecy) || 1;
            const lockDirX = (aim.x - ecx) / lockDl, lockDirY = (aim.y - ecy) / lockDl;
            switch (move) {
              case 'talon': {
                // 血の爪痕: 3本の爪痕(T3帯)を扇状に置く。学習点①=置いた瞬間は0ダメージ、固定900ms後に
                // 爆ぜる。giantDelayedHitsをwindup開始と同時に積む(bornAt=windup開始・fireAt=windup+
                // 固定遅延の合算)ことで、W1(予告はリード全域で可視)を1本の連続フェードインとして満たす。
                const cosS = Math.cos(GLEN_TALON_SPREAD_RAD), sinS = Math.sin(GLEN_TALON_SPREAD_RAD);
                const dirs: [number, number][] = [
                  [lockDirX * cosS - lockDirY * sinS, lockDirX * sinS + lockDirY * cosS], // 左
                  [lockDirX, lockDirY],                                                    // 中央
                  [lockDirX * cosS + lockDirY * sinS, -lockDirX * sinS + lockDirY * cosS], // 右
                ];
                const talonFireAt = atkUntil(GLEN_TALON_WINDUP_MS + GLEN_TALON_DETONATE_DELAY_MS);
                const marks = dirs.map(([dx, dy]) => {
                  const tx = ecx + dx * GLEN_TALON_LENGTH, ty = ecy + dy * GLEN_TALON_LENGTH;
                  return {
                    x: (ecx + tx) / 2, y: (ecy + ty) / 2, radius: GLEN_TALON_HALF_WIDTH,
                    bornAt: gameTime, fireAt: talonFireAt,
                    capsule: { fx: ecx, fy: ecy, tx, ty, halfWidth: GLEN_TALON_HALF_WIDTH },
                    moveKey: 'g-talon', // G4a計測タグ(記録専用)
                  };
                });
                return {
                  aiPhase: 'g-talon-windup', aiPhaseUntil: atkUntil(GLEN_TALON_WINDUP_MS),
                  aiFromX: ecx, aiFromY: ecy,
                  aiTargetX: ecx + lockDirX * GLEN_TALON_LENGTH, aiTargetY: ecy + lockDirY * GLEN_TALON_LENGTH,
                  aiStartedAt: gameTime, hateTarget: aim.side,
                  giantDelayedHits: [...(giantDelayedHits ?? []), ...marks],
                };
              }
              case 'boon': {
                // 血の弧: 水平の弧に沿ってT5遅延円を5つ置く。学習点②=固定700ms後に爆ぜ、その後
                // 固定4000msは床として残り続ける(floorUntil付き=combatTick.tsのapplyGlenFloorDamageが
                // 毎フレーム接触判定する。爆発自体=1回だけのpumpkinBlastsは既存の遅延キュー処理が担う)。
                const baseAngle = Math.atan2(lockDirY, lockDirX);
                const boonFireAt = atkUntil(GLEN_BOON_WINDUP_MS + GLEN_BOON_DETONATE_DELAY_MS);
                const boonFloorUntil = gameTime + (GLEN_BOON_WINDUP_MS + GLEN_BOON_DETONATE_DELAY_MS + GLEN_BOON_FLOOR_MS) / ENEMY_ATTACK_SPEED_MULT;
                const pools = Array.from({ length: GLEN_BOON_COUNT }, (_, i) => {
                  const f = GLEN_BOON_COUNT > 1 ? i / (GLEN_BOON_COUNT - 1) : 0.5;
                  const a = baseAngle - GLEN_BOON_ARC_SPREAD_RAD / 2 + GLEN_BOON_ARC_SPREAD_RAD * f;
                  return {
                    x: ecx + Math.cos(a) * GLEN_BOON_ARC_RADIUS, y: ecy + Math.sin(a) * GLEN_BOON_ARC_RADIUS,
                    radius: GLEN_BOON_RADIUS, bornAt: gameTime, fireAt: boonFireAt, floorUntil: boonFloorUntil,
                    moveKey: 'g-boon', // G4a計測タグ(記録専用)
                  };
                });
                return {
                  aiPhase: 'g-boon-windup', aiPhaseUntil: atkUntil(GLEN_BOON_WINDUP_MS),
                  aiFromX: ecx, aiFromY: ecy,
                  aiTargetX: ecx + lockDirX * GLEN_BOON_ARC_RADIUS, aiTargetY: ecy + lockDirY * GLEN_BOON_ARC_RADIUS,
                  aiStartedAt: gameTime, hateTarget: aim.side,
                  giantDelayedHits: [...(giantDelayedHits ?? []), ...pools],
                };
              }
              case 'reach': {
                // 伸びる触手: 細く長いT3帯(長さ900/半幅28)。溜めの間ずっと照準が振り子のように振れ、
                // 溜め終わりに1本ぶんのカプセルヒットを積む。v0.25.3159bから**複数本が同時に存在する**
                // (gReachShots)。aiPhaseUntil は「最初の1本が判定を出す時刻」で、以後は
                // g-reach-windup 側が gReachShots を見て技の終わりを決める。
                const st0 = glenReachAimStart(ecx, ecy, aim.x, aim.y, 0);
                return {
                  aiPhase: 'g-reach-windup', aiPhaseUntil: atkUntil(GLEN_REACH_WINDUP_MS),
                  aiFromX: ecx, aiFromY: ecy,
                  aiTargetX: ecx + lockDirX * GLEN_REACH_LENGTH, aiTargetY: ecy + lockDirY * GLEN_REACH_LENGTH,
                  aiStartedAt: gameTime, hateTarget: aim.side,
                  gReachIndex: 0, // 3連発の1発目(社長指示v0.25.3126)
                  // v0.25.3157: 照準は**狙いから横へ離した位置**・速度0で始まる=振り子の初期位置。
                  // ここが0だと振り子は始まらない(位置エネルギーが無い)。溜めの長さ・振り子モードと
                  // **3つセット**で成立している(どれか1つ欠けると掃引どおり破綻する)。
                  gReachShots: [{ t0: gameTime, ax: st0.x, ay: st0.y, avx: 0, avy: 0, idx: 0 }],
                };
              }
              case 'tailslam': {
                // v0.25.3139(社長指示): 尻尾の叩きつけ。**赤ライン予兆から発動**・**尻尾の長さに連動**。
                // 射程は `glenTailReach`(=胴体パーツの連結距離の末端)だけを読む。定数で持たないので
                // **見えている尻尾より長く殴る/短く殴る**が構造的に起きない(パーツが減れば射程も減る)。
                const tailLen = glenTailReach(enemy);
                return {
                  aiPhase: 'g-tailslam-windup', aiPhaseUntil: atkUntil(GLEN_TAILSLAM_WINDUP_MS),
                  aiFromX: ecx, aiFromY: ecy,
                  aiTargetX: ecx + lockDirX * tailLen, aiTargetY: ecy + lockDirY * tailLen,
                  aiStartedAt: gameTime, hateTarget: aim.side,
                };
              }
              case 'nihil':
              default:
                // 虚無の三唱: 3唱固定(学習点④=数える)。狙い点(固定ヘイト対象の足元)は1唱目の開始時に
                // ロックし、以後は動かさない(Mohgの「ニヒル」と同じ=3つの円は同じ場所に重なる)。
                // T5大円(半径260)は1件だけ積み、fireAt=3唱ぶんの合計時間(chant3終了と同時)に自動的に
                // 爆ぜる(床は残さない=nihilはfloorUntilを設定しない)。BOT_AND_GHOST.md §2.8 G2.5:
                // 狙い点=pcx/pcyの代わりにヘイト対象の中心(上のaim)。
                glenNihilChanted = true; // 1唱目=絵が出る瞬間
                return {
                  aiPhase: 'g-nihil-chant1', aiPhaseUntil: atkUntil(GLEN_NIHIL_CHANT_MS),
                  aiFromX: ecx, aiFromY: ecy, aiTargetX: aim.x, aiTargetY: aim.y, aiStartedAt: gameTime,
                  hateTarget: aim.side,
                  giantDelayedHits: [...(giantDelayedHits ?? []), {
                    x: aim.x, y: aim.y, radius: GLEN_NIHIL_RADIUS, bornAt: gameTime,
                    fireAt: atkUntil(GLEN_NIHIL_CHANT_MS * GLEN_NIHIL_CHANT_COUNT),
                    moveKey: 'g-nihil', // G4a計測タグ(記録専用)
                    damage: GLEN_NIHIL_DAMAGE, // 社長指示v0.25.3126「三唱のダメージを100に」
                  }],
                };
              case 'trijump': {
                // 連続ジャンプ: **3つの着地点を今この瞬間にまとめて確定**して持ち回る(以後不変)。
                // 座標の計算は純関数 glenTriJumpPoints に置いてある=**描画側も同じ関数を読む**ので、
                // 「赤い円の位置」と「爆ぜる位置」がズレようがない。BOT_AND_GHOST.md §2.8 G2.5:
                // 中心=pcx/pcyの代わりにヘイト対象の中心(上のaim)。
                const tri = glenTriJumpPoints(ecx, ecy, aim.x, aim.y, GLEN_TRIJUMP_RADIUS);
                return {
                  aiPhase: 'g-trijump-windup', aiPhaseUntil: atkUntil(GLEN_TRIJUMP_WINDUP_MS),
                  aiFromX: enemy.x, aiFromY: enemy.y, aiStartedAt: gameTime,
                  gTriJumpPts: tri.flatMap(p => [p.x, p.y]),
                  gTriJumpIdx: 0, hateTarget: aim.side,
                };
              }
            }
          };

          // グレン専用技の共通後片付け(finishGiantStageMoveと同じ作法。ステージ固有技のgStageReadyAtは
          // 一切書かず、別フィールドgGlenReadyAtへ分離=互いに独立)。連携表(GIANT_COMBO_*系)は適用しない
          // (覚えられる上限を超やさない=社長裁定6.26-9 #8の精神を継承)。
          const finishGlenMove = (moveId: GlenMoveId, cdMs: number): Partial<Enemy> => ({
            gGlenReadyAt: { ...enemy.gGlenReadyAt, [moveId]: atkCdUntil(cdMs) },
            ...critFlinchPatch(cdMs), // v0.25.2603: グレンの技も同じひるみ(窓外は空=無改変)
            aiReadyAt: Math.max(enemy.aiReadyAt ?? 0, gameTime + BOSS_NEUTRAL_CASTLE_MS), // ★社長裁定2026-08-27: 城ボス2.5秒(移動は従来どおり=追跡が動く)
            aiPhase: undefined, aiPhaseUntil: undefined, aiStartedAt: undefined,
            aiFromX: undefined, aiFromY: undefined, aiTargetX: undefined, aiTargetY: undefined,
            giantActiveHit: undefined,
          });

          switch (enemy.aiPhase) {
            case 'g-stomp-windup': {
              if (gameTime >= (enemy.aiPhaseUntil ?? 0)) {
                // 半径はwindup開始時にbeginGiantMove('stomp')が確定した値を読む(M65)。未設定
                // (=旧セーブ/フォールバック経路)なら無倍率の生半径。描画側(pixiScene.ts)も同じ値を読む。
                pumpkinBlasts.push({ x: ecx, y: ecy, radius: enemy.gStompRadius ?? GIANT_STOMP_RADIUS, damage: enemy.damage, enemyId: enemy.id, moveKey: 'g-stomp' });
                // 自分中心(軸退化=posB固定0・§1-2の bm-whip360/mk-spin/bite と同型)。
                // AI_HUMANIZE.md B2 ★未決#14=(a): 図形は葉モジュール episodeShape.ts の
                // episodeShapeFor へ1本化(記録側・再生側とも同じ関数=数値の複製なし)。
                settleGiantHabit('g-stomp-windup', {
                  aiFromX: ecx, aiFromY: ecy, aiTargetX: ecx, aiTargetY: ecy,
                  liveShape: episodeShapeFor('giantbat', 'g-stomp-windup', enemy) ?? undefined,
                });
                return { ...enemy, ...phaseFields, vx: 0, vy: 0, aiPhase: 'g-stomp-recover', aiPhaseUntil: atkUntil(stompRecoverMs) };
              }
              return { ...enemy, ...phaseFields, vx: 0, vy: 0 };
            }
            case 'g-sweep-track': {
              // §15追尾相パイロット(sweep限定・Q1=a「追いかけながら狙う」):
              // ①対象は技開始で固定(lockedHateAim=resolveBossLockedHateAim・既存の掟。監査A8)、位置は生を追う。
              // ②本体は通常速度で対象へ歩いて詰める(resolveMove=壁/木/城/行ける帯の解決を通る既存の1本)。
              // ③照準は stepLaserAim の慣性物理(振り切りなし・尺非依存=telegraphTrack.ts)。
              // ④帯(照準表示)=その瞬間の自分中心→照準方向×固定RANGE(帯長は潰さない=§15-3)。
              //   描画(pixiScene)と満了時の判定焼きは同じ aiFrom/aiTarget を読む=乖離しない。
              // ⑤満了=ロック: その瞬間の値で現行のwindupへ(ロック相=現行そのもの・ギリギリ感不変)。
              //   中断(気絶/紫)は既存の割り込みブロックが aiPhase を丸ごと消す=Q2=(a)現行踏襲。
              const tAim = lockedHateAim();
              const tCur = {
                x: enemy.gTrackAimX ?? tAim.x, y: enemy.gTrackAimY ?? tAim.y,
                vx: enemy.gTrackVx ?? 0, vy: enemy.gTrackVy ?? 0,
              };
              const tNext = stepTrackAim(tCur, tAim.x, tAim.y, deltaTime);
              const tcdx = tAim.x - ecx, tcdy = tAim.y - ecy;
              const tcdl = Math.hypot(tcdx, tcdy) || 1;
              const tStep = enemy.speed * deltaTime;
              const tMoved = resolveMove(enemy.x + (tcdx / tcdl) * tStep, enemy.y + (tcdy / tcdl) * tStep);
              const tmcx = tMoved.x + enemy.width / 2, tmcy = tMoved.y + enemy.height / 2;
              const ttdx = tNext.x - tmcx, ttdy = tNext.y - tmcy;
              const ttdl = Math.hypot(ttdx, ttdy) || 1;
              const tFields = {
                gTrackAimX: tNext.x, gTrackAimY: tNext.y, gTrackVx: tNext.vx, gTrackVy: tNext.vy,
                aiFromX: tmcx, aiFromY: tmcy,
                aiTargetX: tmcx + (ttdx / ttdl) * GIANT_SWEEP_RANGE, aiTargetY: tmcy + (ttdy / ttdl) * GIANT_SWEEP_RANGE,
              };
              if (gameTime >= (enemy.aiPhaseUntil ?? 0)) {
                return {
                  ...enemy, ...phaseFields, ...tFields, x: tMoved.x, y: tMoved.y, vx: 0, vy: 0,
                  aiPhase: 'g-sweep-windup', aiPhaseUntil: atkUntil(GIANT_SWEEP_WINDUP_MS),
                  aiStartedAt: gameTime, // ロック白フラッシュ(60ms)の起点(pixiScene)
                };
              }
              return {
                ...enemy, ...phaseFields, ...tFields, x: tMoved.x, y: tMoved.y,
                vx: (tcdx / tcdl) * enemy.speed, vy: (tcdy / tcdl) * enemy.speed,
              };
            }
            case 'g-sweep-windup': {
              if (gameTime >= (enemy.aiPhaseUntil ?? 0)) {
                // 実際の当たり判定はカプセル(THOR_HARAI_RANGE/HALF_WIDTH流用)。既存のpumpkinBlasts配管を
                // capsule付きで1件だけ積む(=1回だけ判定。220msの表示自体はg-sweep-active中の見た目のみ)。
                const sfx = enemy.aiFromX ?? ecx, sfy = enemy.aiFromY ?? ecy;
                const stx = enemy.aiTargetX ?? ecx, sty = enemy.aiTargetY ?? ecy;
                pumpkinBlasts.push({
                  x: (sfx + stx) / 2, y: (sfy + sty) / 2, radius: GIANT_SWEEP_HALF_WIDTH,
                  damage: enemy.damage, enemyId: enemy.id, moveKey: 'g-sweep',
                  capsule: { fx: sfx, fy: sfy, tx: stx, ty: sty, halfWidth: GIANT_SWEEP_HALF_WIDTH },
                });
                settleGiantHabit('g-sweep-windup', {
                  aiFromX: sfx, aiFromY: sfy, aiTargetX: stx, aiTargetY: sty,
                  liveShape: episodeShapeFor('giantbat', 'g-sweep-windup', enemy) ?? undefined,
                });
                return { ...enemy, ...phaseFields, vx: 0, vy: 0, aiPhase: 'g-sweep-active', aiPhaseUntil: atkUntil(GIANT_SWEEP_ACTIVE_MS) };
              }
              return { ...enemy, ...phaseFields, vx: 0, vy: 0 };
            }
            case 'g-sweep-active': {
              if (gameTime >= (enemy.aiPhaseUntil ?? 0)) {
                return { ...enemy, ...phaseFields, vx: 0, vy: 0, aiPhase: 'g-sweep-recover', aiPhaseUntil: atkUntil(sweepRecoverMs) };
              }
              return { ...enemy, ...phaseFields, vx: 0, vy: 0 };
            }
            case 'g-dash-windup': {
              if (gameTime >= (enemy.aiPhaseUntil ?? 0)) {
                return { ...enemy, ...phaseFields, vx: 0, vy: 0, aiPhase: 'g-dash-charge', aiPhaseUntil: atkUntil(WEREWOLF_CHARGE_MAX_MS) };
              }
              // 後退り(T8・既存と同じ式)。
              const aim = lockedHateAim();
              const bdx = ecx - aim.x, bdy = ecy - aim.y;
              const bl = Math.hypot(bdx, bdy) || 1;
              const back = enemy.speed * DASH_WINDUP_BACKSTEP_MULT * deltaTime;
              const bmoved = resolveMove(enemy.x + (bdx / bl) * back, enemy.y + (bdy / bl) * back);
              return {
                ...enemy, ...phaseFields, x: bmoved.x, y: bmoved.y,
                vx: (bdx / bl) * enemy.speed * DASH_WINDUP_BACKSTEP_MULT, vy: (bdy / bl) * enemy.speed * DASH_WINDUP_BACKSTEP_MULT,
              };
            }
            case 'g-dash-charge': {
              const tx = enemy.aiTargetX ?? pcx, ty = enemy.aiTargetY ?? pcy;
              const cdx = tx - ecx, cdy = ty - ecy;
              const cdist = Math.hypot(cdx, cdy);
              if (cdist < 12 || gameTime >= (enemy.aiPhaseUntil ?? 0)) {
                return { ...enemy, ...phaseFields, vx: 0, vy: 0, aiPhase: 'g-dash-recover', aiPhaseUntil: atkUntil(dashRecoverMs) };
              }
              const aim = lockedHateAim();
              const hpx = aim.x - ecx, hpy = aim.y - ecy;
              const hl = Math.hypot(hpx, hpy) || 1;
              let cdirx = cdx / cdist + (hpx / hl) * DASH_ATTACK_HOMING;
              let cdiry = cdy / cdist + (hpy / hl) * DASH_ATTACK_HOMING;
              const cdl = Math.hypot(cdirx, cdiry) || 1;
              cdirx /= cdl; cdiry /= cdl;
              const dashBase = getEnemyBaseSpeed('werewolf'); // 現行不変(6.26-6): giantbatの突進速度は犬と同じ基準
              // M65: ステージ別倍率は速度にだけ掛ける(WEREWOLF_CHARGE_SPEED_MULT自体は書き換えない=
              // werewolf/hunter/lab-zombie-2と共有している定数のため。狙い点・最大時間・CDは無改変)。
              const cs = dashBase * GIANT_CHARGE_SPEED_MULT * stageMult;
              const cvx = cdirx * cs, cvy = cdiry * cs;
              const rawX = enemy.x + cvx * deltaTime, rawY = enemy.y + cvy * deltaTime;
              const cmoved = resolveMove(rawX, rawY);
              const hitShield = shieldRects.length > 0 && shieldRects.some(s => rectsOverlap({ x: cmoved.x, y: cmoved.y, width: enemy.width, height: enemy.height }, s));
              const blocked = Math.abs(cmoved.x - rawX) > 0.5 || Math.abs(cmoved.y - rawY) > 0.5;
              if (hitShield || blocked) {
                if (hitShield) shieldBlocks.push({ x: cmoved.x + enemy.width / 2, y: cmoved.y + enemy.height / 2, kind: 'dash' });
                return { ...enemy, ...phaseFields, x: cmoved.x, y: cmoved.y, vx: 0, vy: 0, aiPhase: 'g-dash-recover', aiPhaseUntil: atkUntil(dashRecoverMs) };
              }
              return { ...enemy, ...phaseFields, vx: cvx, vy: cvy, x: cmoved.x, y: cmoved.y };
            }
            case 'g-jump-windup': {
              if (gameTime >= (enemy.aiPhaseUntil ?? 0)) {
                return { ...enemy, ...phaseFields, vx: 0, vy: 0, aiPhase: 'g-jump-air', aiStartedAt: gameTime, aiPhaseUntil: atkUntil(GIANT_JUMP_AIR_MS) };
              }
              return { ...enemy, ...phaseFields, vx: 0, vy: 0 };
            }
            case 'g-jump-air': {
              // 州の終了時刻と同じ城ボス専用値で補間する。旧実装はPUMPKIN_JUMP_MS(833ms実効)を
              // 読んでおり、aiPhaseUntil(500ms実効)と絵/移動が不一致で、飛び掛かりがもっさりしていた。
              const jt = Math.max(0, Math.min(1, (gameTime - (enemy.aiStartedAt ?? gameTime)) / (GIANT_JUMP_AIR_MS / ENEMY_ATTACK_SPEED_MULT)));
              const jfx = enemy.aiFromX ?? enemy.x, jfy = enemy.aiFromY ?? enemy.y;
              const jtx = enemy.aiTargetX ?? enemy.x, jty = enemy.aiTargetY ?? enemy.y;
              // v0.25.3076(社長指示「滑空って全てのジャンプね」): 等速の線形補間をやめ、
              // 両端で速度も加速度も0になる曲線で運ぶ(着地点・滞空時間・判定は不変)。
              const jEs = airHopEase01(jt);
              const jnx = jfx + (jtx - jfx) * jEs, jny = jfy + (jty - jfy) * jEs;
              const jDur = Math.max(0.001, GIANT_JUMP_AIR_MS / ENEMY_ATTACK_SPEED_MULT / 1000);
              const jDs = airHopEaseD01(jt);
              const jvx = ((jtx - jfx) * jDs) / jDur, jvy = ((jty - jfy) * jDs) / jDur;
              if (shieldRects.length > 0 && shieldRects.some(s => rectsOverlap({ x: jnx, y: jny, width: enemy.width, height: enemy.height }, s))) {
                shieldBlocks.push({ x: jnx + enemy.width / 2, y: jny + enemy.height / 2, kind: 'jump' });
                return { ...enemy, ...phaseFields, x: jnx, y: jny, vx: 0, vy: 0, aiPhase: 'g-jump-recover', aiStartedAt: gameTime, aiPhaseUntil: atkUntil(jumpRecoverMs) };
              }
              if (jt >= 1) {
                pumpkinLanded = true;
                // 半径はwindup開始時にbeginGiantMove('jump')が確定した値を読む(M65・stomp同様)。
                pumpkinBlasts.push({ x: jtx + enemy.width / 2, y: jty + enemy.height / 2, radius: enemy.gJumpRadius ?? GIANT_JUMP_RADIUS, damage: enemy.damage, enemyId: enemy.id, moveKey: 'g-jump' });
                return { ...enemy, ...phaseFields, x: jtx, y: jty, vx: 0, vy: 0, aiPhase: 'g-jump-recover', aiPhaseUntil: atkUntil(jumpRecoverMs) };
              }
              return { ...enemy, ...phaseFields, x: jnx, y: jny, vx: jvx, vy: jvy };
            }
            case 'g-bolt-windup': {
              if (gameTime >= (enemy.aiPhaseUntil ?? 0)) {
                giantBoltFires.push(enemy); // 発射自体はset後(post-set)に既存addProjectile経路で行う
                settleGiantHabit('g-bolt-windup'); // body-only(弾を撃つだけ=近接図形を持たない・§1-0③)
                // 扇(fan)は1回で撃ち切るのでそのまま硬直へ。連射(burst)は専用ステートで残りを撃つ。
                if ((enemy.gBoltPattern ?? 'fan') === 'burst') {
                  return {
                    ...enemy, ...phaseFields, vx: 0, vy: 0, aiPhase: 'g-bolt-burst',
                    gBoltShot: 1, aiPhaseUntil: atkUntil(GIANT_BOLT_BURST_GAP_MS), lastShot: now,
                  };
                }
                return { ...enemy, ...phaseFields, vx: 0, vy: 0, aiPhase: 'g-bolt-recover', aiPhaseUntil: atkUntil(boltRecoverMs), lastShot: now };
              }
              return { ...enemy, ...phaseFields, vx: 0, vy: 0 };
            }
            case 'g-bolt-burst': {
              // B案の連射: GIANT_BOLT_BURST_GAP_MS ごとに1発ずつ、合計 GIANT_BOLT_BURST_SHOTS 発。
              // 撃っている間も完全静止(掟W6)=横へ動けば全部避けられる「止まると死ぬ」圧の技。
              if (gameTime >= (enemy.aiPhaseUntil ?? 0)) {
                const shot = (enemy.gBoltShot ?? 1) + 1;
                giantBoltFires.push(enemy);
                if (shot >= GIANT_BOLT_BURST_SHOTS) {
                  // v0.25.3033(社長指示「通常弾の3連発の後にのみ触手攻撃の台本で」): グレンは
                  // 3連発の締めで触手(reach)を台本キューの先頭へ予約=次の行動が必ず触手になる。
                  // 抽選プール・連携表からは除外済みなので、発動経路はここだけ。
                  const glenReachNext = glenScriptApplies(enemy.isStoryBoss, enemy.storyBossVariant, GLEN_SCRIPT_ENABLED)
                    ? { bossScriptQueue: ['reach', ...(enemy.bossScriptQueue ?? [])] }
                    : {};
                  return {
                    ...enemy, ...phaseFields, vx: 0, vy: 0, aiPhase: 'g-bolt-recover',
                    aiPhaseUntil: atkUntil(boltRecoverMs), gBoltShot: undefined, lastShot: now,
                    ...glenReachNext,
                  };
                }
                return { ...enemy, ...phaseFields, vx: 0, vy: 0, gBoltShot: shot, aiPhaseUntil: atkUntil(GIANT_BOLT_BURST_GAP_MS), lastShot: now };
              }
              return { ...enemy, ...phaseFields, vx: 0, vy: 0 };
            }
            // --- 連続ジャンプ(グレン専用・v0.25.2430) ---
            case 'g-trijump-windup': {
              // 溜め中は完全静止(掟W6)。3つの赤い円は描画側が gTriJumpPts から出している。
              if (gameTime >= (enemy.aiPhaseUntil ?? 0)) {
                return { ...enemy, ...phaseFields, vx: 0, vy: 0, aiPhase: 'g-trijump-air', aiStartedAt: gameTime, aiPhaseUntil: atkUntil(GLEN_TRIJUMP_AIR_MS), gTriJumpIdx: 0 };
              }
              return { ...enemy, ...phaseFields, vx: 0, vy: 0 };
            }
            case 'g-trijump-air': {
              const pts = enemy.gTriJumpPts ?? [];
              const idx = enemy.gTriJumpIdx ?? 0;
              const tx = pts[idx * 2] ?? (enemy.x + enemy.width / 2);
              const ty = pts[idx * 2 + 1] ?? (enemy.y + enemy.height / 2);
              const fx0 = enemy.aiFromX ?? enemy.x, fy0 = enemy.aiFromY ?? enemy.y;
              const t = Math.max(0, Math.min(1, (gameTime - (enemy.aiStartedAt ?? gameTime)) / (GLEN_TRIJUMP_AIR_MS / ENEMY_ATTACK_SPEED_MULT)));
              // v0.25.3076: 連続ジャンプ3発も同じ曲線で運ぶ(着地点・回数・判定は不変)。
              const tEs = airHopEase01(t);
              const curX = fx0 + ((tx - enemy.width / 2) - fx0) * tEs;
              const curY = fy0 + ((ty - enemy.height / 2) - fy0) * tEs;
              const tDur = Math.max(0.001, GLEN_TRIJUMP_AIR_MS / ENEMY_ATTACK_SPEED_MULT / 1000);
              const tDs = airHopEaseD01(t);
              if (t >= 1) {
                pumpkinLanded = true;
                pumpkinBlasts.push({ x: tx, y: ty, radius: GLEN_TRIJUMP_RADIUS, damage: enemy.damage, enemyId: enemy.id, moveKey: 'g-trijump' });
                const next = idx + 1;
                if (next >= GLEN_TRIJUMP_COUNT) {
                  // 3発目の着地=最大の反撃窓へ。着地点の情報はここで捨てる(次の抽選に持ち越さない)。
                  return {
                    ...enemy, ...phaseFields, x: tx - enemy.width / 2, y: ty - enemy.height / 2, vx: 0, vy: 0,
                    aiPhase: 'g-trijump-recover', aiPhaseUntil: atkUntil(scriptRestMs(GLEN_TRIJUMP_RECOVER_MS)),
                    gTriJumpPts: undefined, gTriJumpIdx: undefined,
                  };
                }
                // **着地したら「すぐ」次の跳び**(社長指示)=間を空けない。起点だけ着地点へ更新する。
                return {
                  ...enemy, ...phaseFields, x: tx - enemy.width / 2, y: ty - enemy.height / 2, vx: 0, vy: 0,
                  aiFromX: tx - enemy.width / 2, aiFromY: ty - enemy.height / 2,
                  aiStartedAt: gameTime, aiPhaseUntil: atkUntil(GLEN_TRIJUMP_AIR_MS), gTriJumpIdx: next,
                };
              }
              return {
                ...enemy, ...phaseFields, x: curX, y: curY,
                vx: (((tx - enemy.width / 2) - fx0) * tDs) / tDur, vy: (((ty - enemy.height / 2) - fy0) * tDs) / tDur,
              };
            }
            case 'g-trijump-recover': {
              if (gameTime >= (enemy.aiPhaseUntil ?? 0)) {
                return { ...enemy, ...phaseFields, vx: 0, vy: 0, ...finishGlenMove('trijump', GLEN_TRIJUMP_CD_MS) };
              }
              return { ...enemy, ...phaseFields, vx: 0, vy: 0 };
            }
            case 'g-stomp-recover':
            case 'g-sweep-recover':
            case 'g-dash-recover':
            case 'g-jump-recover':
            case 'g-bolt-recover': {
              if (gameTime >= (enemy.aiPhaseUntil ?? 0)) {
                const justFinished: GiantMove =
                  enemy.aiPhase === 'g-stomp-recover' ? 'stomp' :
                  enemy.aiPhase === 'g-sweep-recover' ? 'sweep' :
                  enemy.aiPhase === 'g-dash-recover' ? 'dash' :
                  enemy.aiPhase === 'g-jump-recover' ? 'jump' : 'bolt';
                // v0.25.2603: ひるみの物差し=いま終わった技の生CD(倍率を掛ける前の値)。
                const finishedCdMs =
                  justFinished === 'stomp' ? GIANT_STOMP_CD_MS :
                  justFinished === 'sweep' ? GIANT_SWEEP_CD_MS :
                  justFinished === 'dash' ? GIANTBAT_DASH_CD_MS + werewolfExtraCd('giantbat') :
                  justFinished === 'jump' ? GIANT_JUMP_CD_MS : boltCdMs;
                const readyPatch: Partial<Enemy> = {
                  ...(justFinished === 'stomp' ? { gStompReadyAt: atkCdUntil(GIANT_STOMP_CD_MS) } :
                    justFinished === 'sweep' ? { gSweepReadyAt: atkCdUntil(GIANT_SWEEP_CD_MS) } :
                    justFinished === 'dash' ? { gDashReadyAt: atkCdUntil(GIANTBAT_DASH_CD_MS + werewolfExtraCd('giantbat')) } :
                    justFinished === 'jump' ? { gJumpReadyAt: atkCdUntil(GIANT_JUMP_CD_MS) } :
                    { gBoltReadyAt: atkCdUntil(boltCdMs) }),
                  ...critFlinchPatch(finishedCdMs), // クリ窓中だけ「技の間」を伸ばす(窓外は空=無改変)
                };
                return {
                  ...enemy, ...phaseFields, ...readyPatch, vx: 0, vy: 0,
                  // ★社長指示2026-08-26「技から次の技…間隔をあける」(v0.25.3952): 城ボスの次行動は技ごとの
                  // 独立CD制で全体の仕切りが無かった(v2603と同じ穴の平時版)。全体の仕切り aiReadyAt へ
                  // ★社長裁定2026-08-27: 城ボスの技間=2.5秒(critFlinchPatchのmaxが後勝ち)。
                  aiReadyAt: Math.max(enemy.aiReadyAt ?? 0, gameTime + BOSS_NEUTRAL_CASTLE_MS),
                  aiPhase: undefined, aiPhaseUntil: undefined, aiStartedAt: undefined,
                  aiFromX: undefined, aiFromY: undefined, aiTargetX: undefined, aiTargetY: undefined,
                  gStompRadius: undefined, gJumpRadius: undefined, // M65: 溜め開始で毎回上書きされるが後片付けとして明示的にクリア
                };
              }
              return { ...enemy, ...phaseFields, vx: 0, vy: 0 };
            }

            // ==== M66(§6.26-11): stage-1 噛みつき(bite・独自技) ====
            case 'g-bite-windup': {
              if (gameTime >= (enemy.aiPhaseUntil ?? 0)) {
                // 予告終わりで避けると早すぎて噛まれる=固定350msの"間"(学習点①)。図形(T3帯)は
                // 引き続き表示したまま静止する(掟W1)。
                return { ...enemy, ...phaseFields, vx: 0, vy: 0, aiPhase: 'g-bite-hold', aiPhaseUntil: atkUntil(GIANT_BITE_HOLD_MS) };
              }
              return { ...enemy, ...phaseFields, vx: 0, vy: 0 };
            }
            case 'g-bite-hold': {
              if (gameTime >= (enemy.aiPhaseUntil ?? 0)) {
                const bfx = enemy.aiFromX ?? ecx, bfy = enemy.aiFromY ?? ecy;
                const btx = enemy.aiTargetX ?? ecx, bty = enemy.aiTargetY ?? ecy;
                pumpkinBlasts.push({
                  x: (bfx + btx) / 2, y: (bfy + bty) / 2, radius: GIANT_BITE_HALF_WIDTH,
                  damage: enemy.damage, enemyId: enemy.id, moveKey: 'g-bite',
                  capsule: { fx: bfx, fy: bfy, tx: btx, ty: bty, halfWidth: GIANT_BITE_HALF_WIDTH },
                });
                return { ...enemy, ...phaseFields, vx: 0, vy: 0, aiPhase: 'g-bite-active', aiPhaseUntil: atkUntil(GIANT_BITE_ACTIVE_MS) };
              }
              return { ...enemy, ...phaseFields, vx: 0, vy: 0 };
            }
            case 'g-bite-active': {
              if (gameTime >= (enemy.aiPhaseUntil ?? 0)) {
                return { ...enemy, ...phaseFields, vx: 0, vy: 0, aiPhase: 'g-bite-recover', aiPhaseUntil: atkUntil(scriptRestMs(GIANT_BITE_RECOVER_MS)) };
              }
              return { ...enemy, ...phaseFields, vx: 0, vy: 0 };
            }
            case 'g-bite-recover': {
              if (gameTime >= (enemy.aiPhaseUntil ?? 0)) {
                return { ...enemy, ...phaseFields, vx: 0, vy: 0, ...finishGiantStageMove('bite', GIANT_BITE_CD_MS) };
              }
              return { ...enemy, ...phaseFields, vx: 0, vy: 0 };
            }

            // ==== M66: stage-1 のしかかり(slam・大技) ====
            case 'g-slam-windup': {
              if (gameTime >= (enemy.aiPhaseUntil ?? 0)) {
                const sfx = enemy.aiFromX ?? ecx, sfy = enemy.aiFromY ?? ecy;
                const stx = enemy.aiTargetX ?? ecx, sty = enemy.aiTargetY ?? ecy;
                pumpkinBlasts.push({
                  x: (sfx + stx) / 2, y: (sfy + sty) / 2, radius: GIANT_SLAM_HALF_WIDTH,
                  damage: enemy.damage, enemyId: enemy.id, moveKey: 'g-slam',
                  capsule: { fx: sfx, fy: sfy, tx: stx, ty: sty, halfWidth: GIANT_SLAM_HALF_WIDTH },
                });
                settleGiantHabit('g-slam-windup', {
                  aiFromX: sfx, aiFromY: sfy, aiTargetX: stx, aiTargetY: sty,
                  liveShape: episodeShapeFor('giantbat', 'g-slam-windup', enemy) ?? undefined,
                });
                return { ...enemy, ...phaseFields, vx: 0, vy: 0, aiPhase: 'g-slam-active', aiPhaseUntil: atkUntil(GIANT_SLAM_ACTIVE_MS) };
              }
              return { ...enemy, ...phaseFields, vx: 0, vy: 0 };
            }
            case 'g-slam-active': {
              if (gameTime >= (enemy.aiPhaseUntil ?? 0)) {
                // 全技中で最大の反撃窓(1300ms)=大技の報酬(社長裁定を継承した設計原則)。
                return { ...enemy, ...phaseFields, vx: 0, vy: 0, aiPhase: 'g-slam-recover', aiPhaseUntil: atkUntil(scriptRestMs(GIANT_SLAM_RECOVER_MS)) };
              }
              return { ...enemy, ...phaseFields, vx: 0, vy: 0 };
            }
            case 'g-slam-recover': {
              if (gameTime >= (enemy.aiPhaseUntil ?? 0)) {
                return { ...enemy, ...phaseFields, vx: 0, vy: 0, ...finishGiantStageMove('slam', GIANT_SLAM_CD_MS) };
              }
              return { ...enemy, ...phaseFields, vx: 0, vy: 0 };
            }

            // ==== M66: stage-3 滑空薙ぎ(glide・独自技) ====
            case 'g-glide-windup': {
              if (gameTime >= (enemy.aiPhaseUntil ?? 0)) {
                const gfx = enemy.aiFromX ?? enemy.x, gfy = enemy.aiFromY ?? enemy.y;
                const gtx = enemy.aiTargetX ?? enemy.x, gty = enemy.aiTargetY ?? enemy.y;
                pumpkinBlasts.push({
                  x: (gfx + gtx) / 2 + enemy.width / 2, y: (gfy + gty) / 2 + enemy.height / 2, radius: GIANT_GLIDE_HALF_WIDTH,
                  damage: enemy.damage, enemyId: enemy.id, moveKey: 'g-glide',
                  capsule: {
                    fx: gfx + enemy.width / 2, fy: gfy + enemy.height / 2,
                    tx: gtx + enemy.width / 2, ty: gty + enemy.height / 2, halfWidth: GIANT_GLIDE_HALF_WIDTH,
                  },
                });
                settleGiantHabit('g-glide-windup', {
                  aiFromX: gfx + enemy.width / 2, aiFromY: gfy + enemy.height / 2,
                  aiTargetX: gtx + enemy.width / 2, aiTargetY: gty + enemy.height / 2,
                  liveShape: episodeShapeFor('giantbat', 'g-glide-windup', enemy) ?? undefined,
                });
                // v0.25.3075: **実際に飛び出す位置**を焼く(予告線の始点aiFromではなく現在地)。
                // これが無いと、後退りぶん下がった位置から予告線の始点へ前ワープする=カクつきの主因。
                return {
                  ...enemy, ...phaseFields, vx: 0, vy: 0,
                  aiPhase: 'g-glide-active', aiPhaseUntil: atkUntil(GIANT_GLIDE_ACTIVE_MS), aiStartedAt: gameTime,
                  gGlideFromX: enemy.x, gGlideFromY: enemy.y,
                };
              }
              // 後ろへ跳び退がって溜める(T8backstep)。
              // v0.25.3075: 三連突進と同じ一次遅れ(慣性)にし、さらに**溜めの終盤で後退りを0へ収める**。
              // 等速で下がったまま実行へ移ると、その瞬間に速度が反転して角が立つ(カクつきの一因)。
              const aim = lockedHateAim();
              const bdx = ecx - aim.x, bdy = ecy - aim.y;
              const bl = Math.hypot(bdx, bdy) || 1;
              const wTotal = GIANT_GLIDE_WINDUP_MS / ENEMY_ATTACK_SPEED_MULT;
              const wRemain = Math.max(0, (enemy.aiPhaseUntil ?? gameTime) - gameTime);
              const settle = Math.max(0, Math.min(1, wRemain / Math.max(1, wTotal * GIANT_GLIDE_SETTLE_FRAC)));
              const backSpeed = enemy.speed * DASH_WINDUP_BACKSTEP_MULT * settle;
              const gk = 1 - Math.exp(-deltaTime / GIANT_GLIDE_INERTIA_TAU);
              const gbvx = (enemy.vx ?? 0) + ((bdx / bl) * backSpeed - (enemy.vx ?? 0)) * gk;
              const gbvy = (enemy.vy ?? 0) + ((bdy / bl) * backSpeed - (enemy.vy ?? 0)) * gk;
              const bmoved = resolveMove(enemy.x + gbvx * deltaTime, enemy.y + gbvy * deltaTime);
              return { ...enemy, ...phaseFields, x: bmoved.x, y: bmoved.y, vx: gbvx, vy: gbvy };
            }
            case 'g-glide-active': {
              // 本体が通過して薙ぐ(判定は既にwindup終わりで確定済みのカプセル1件・ここは移動のみ)。
              const durEff = GIANT_GLIDE_ACTIVE_MS / ENEMY_ATTACK_SPEED_MULT;
              const gt = Math.max(0, Math.min(1, (gameTime - (enemy.aiStartedAt ?? gameTime)) / durEff));
              const gfx = enemy.aiFromX ?? enemy.x, gfy = enemy.aiFromY ?? enemy.y;
              const gtx = enemy.aiTargetX ?? enemy.x, gty = enemy.aiTargetY ?? enemy.y;
              if (gt >= 1) {
                // 滑空の終点=二撃目の中心(回避狩り)。終了から250ms(固定)後に開くT2即時円。
                const hitX = gtx + enemy.width / 2, hitY = gty + enemy.height / 2;
                return {
                  ...enemy, ...phaseFields, x: gtx, y: gty, vx: 0, vy: 0,
                  aiPhase: 'g-glide-recover', aiPhaseUntil: atkUntil(scriptRestMs(GIANT_GLIDE_RECOVER_MS)),
                  giantDelayedHits: [...(giantDelayedHits ?? []), { x: hitX, y: hitY, radius: GIANT_GLIDE_SECOND_HIT_RADIUS, bornAt: gameTime, fireAt: atkUntil(GIANT_GLIDE_SECOND_HIT_DELAY_MS), moveKey: 'g-glide' }],
                };
              }
              // v0.25.3075: ①出発点は**実際に飛び出した位置**(gGlideFrom。無ければ従来どおりaiFrom)
              // ②等速の線形補間をやめ、**両端で速度も加速度も0になる曲線(smootherstep)**で運ぶ
              // =出だしと着地の角が消える。判定は溜め終わりに確定済みのカプセル1発なので影響なし。
              const sfx = enemy.gGlideFromX ?? gfx, sfy = enemy.gGlideFromY ?? gfy;
              const es = airHopEase01(gt);
              const gnx = sfx + (gtx - sfx) * es, gny = sfy + (gty - sfy) * es;
              // 速度も実際の移動に合わせて入れる(従来は0固定で、飛んでいる間ボスが進行方向を向かなかった)。
              const dEs = airHopEaseD01(gt);
              const durSec = Math.max(0.001, durEff / 1000);
              return {
                ...enemy, ...phaseFields, x: gnx, y: gny,
                vx: ((gtx - sfx) * dEs) / durSec, vy: ((gty - sfy) * dEs) / durSec,
              };
            }
            case 'g-glide-recover': {
              if (gameTime >= (enemy.aiPhaseUntil ?? 0)) {
                return { ...enemy, ...phaseFields, vx: 0, vy: 0, ...finishGiantStageMove('glide', GIANT_GLIDE_CD_MS) };
              }
              return { ...enemy, ...phaseFields, vx: 0, vy: 0 };
            }

            // ==== M66: stage-3 急降下(dive・大技) ====
            case 'g-dive-windup': {
              // 本体は既にbeginGiantStageMoveで場外へ退避済み(「無敵ではなく居ない」)。地面のT5円は
              // 描画側がaiTargetX/Yを直接参照する(本体の現在地とは無関係=世界座標で描ける)。
              if (gameTime >= (enemy.aiPhaseUntil ?? 0)) {
                const dtx = enemy.aiTargetX ?? enemy.x, dty = enemy.aiTargetY ?? enemy.y;
                pumpkinBlasts.push({ x: dtx + enemy.width / 2, y: dty + enemy.height / 2, radius: GIANT_DIVE_RADIUS, damage: enemy.damage, enemyId: enemy.id, moveKey: 'g-dive' });
                settleGiantHabit('g-dive-windup', {
                  liveShape: episodeShapeFor('giantbat', 'g-dive-windup', enemy) ?? undefined,
                });
                return { ...enemy, ...phaseFields, x: dtx, y: dty, vx: 0, vy: 0, aiPhase: 'g-dive-recover', aiPhaseUntil: atkUntil(scriptRestMs(GIANT_DIVE_RECOVER_MS)) };
              }
              return { ...enemy, ...phaseFields, vx: 0, vy: 0 };
            }
            case 'g-dive-recover': {
              if (gameTime >= (enemy.aiPhaseUntil ?? 0)) {
                return { ...enemy, ...phaseFields, vx: 0, vy: 0, ...finishGiantStageMove('dive', GIANT_DIVE_CD_MS) };
              }
              return { ...enemy, ...phaseFields, vx: 0, vy: 0 };
            }

            // ==== M66: stage-4 三連突進→氷の横薙ぎ(quaddash・独自技) ====
            case 'g-quad-windup': {
              if (gameTime >= (enemy.aiPhaseUntil ?? 0)) {
                return { ...enemy, ...phaseFields, vx: 0, vy: 0, aiPhase: 'g-quad-charge', aiPhaseUntil: atkUntil(WEREWOLF_CHARGE_MAX_MS) };
              }
              // 後退り(T8・既存ダッシュと同じ式)。
              // v0.25.3073: ここも一次遅れにする。前の突進の勢いが残ったまま溜めへ入るので、
              // **前へ流れながら向きを変えて後退りに移る**=「滑って止まる」が出る(通常突進は無改変)。
              const aim = lockedHateAim();
              const bdx = ecx - aim.x, bdy = ecy - aim.y;
              const bl = Math.hypot(bdx, bdy) || 1;
              const backSpeed = enemy.speed * DASH_WINDUP_BACKSTEP_MULT;
              const bk = 1 - Math.exp(-deltaTime / GIANT_QUAD_INERTIA_TAU);
              const bvx = (enemy.vx ?? 0) + ((bdx / bl) * backSpeed - (enemy.vx ?? 0)) * bk;
              const bvy = (enemy.vy ?? 0) + ((bdy / bl) * backSpeed - (enemy.vy ?? 0)) * bk;
              const bmoved = resolveMove(enemy.x + bvx * deltaTime, enemy.y + bvy * deltaTime);
              return { ...enemy, ...phaseFields, x: bmoved.x, y: bmoved.y, vx: bvx, vy: bvy };
            }
            case 'g-quad-charge': {
              const tx = enemy.aiTargetX ?? pcx, ty = enemy.aiTargetY ?? pcy;
              const cdx = tx - ecx, cdy = ty - ecy;
              const cdist = Math.hypot(cdx, cdy);
              const quadIndex = enemy.gQuadIndex ?? 0;
              // 3回目(index=2)を終えたら必ず静止して氷結の吐息へ(学習装置③=回数は常に3固定)。
              // 3回目未満なら次の突進へ即つなぐ(狙い点はその時点の固定ヘイト対象位置を再サンプル=
              // 既存dashと同じ式の反復。固定の左右オフセットは発明しない)。
              const onDashFinished = (): Partial<Enemy> => {
                if (!giantQuadDashComplete(quadIndex)) return beginQuadDash(quadIndex + 1);
                // BOT_AND_GHOST.md §2.8 G2.5: 氷結の横薙ぎへの切り替わり=新しい技の狙いロックなので
                // ここで評価する(pcx/pcyの代わりにヘイト対象の中心)。
                const aim = resolveBossHateAim(enemy, { x: pcx, y: pcy }, summons, gameTime);
                const ddl = Math.hypot(aim.x - ecx, aim.y - ecy) || 1;
                const dirx = (aim.x - ecx) / ddl, diry = (aim.y - ecy) / ddl;
                return {
                  aiPhase: 'g-quad-breath-windup', aiPhaseUntil: atkUntil(GIANT_QUAD_BREATH_WINDUP_MS),
                  aiFromX: ecx, aiFromY: ecy,
                  aiTargetX: ecx + dirx * GIANT_QUAD_BREATH_LENGTH, aiTargetY: ecy + diry * GIANT_QUAD_BREATH_LENGTH,
                  aiStartedAt: gameTime, hateTarget: aim.side,
                };
              };
              if (cdist < 12 || gameTime >= (enemy.aiPhaseUntil ?? 0)) {
                // v0.25.3073(慣性): 次の突進へつなぐ時は**速度を殺さない**=勢いを持ったまま次の溜めへ
                // 流れ込む(これが「滑ってる感じ」の主役)。3回目の後の氷結の吐息だけは仕様どおり
                // 完全静止させる(「3回目の直後に必ず静止して溜める」=学習装置)。
                const finish = onDashFinished();
                return finish.aiPhase === 'g-quad-breath-windup'
                  ? { ...enemy, ...phaseFields, vx: 0, vy: 0, ...finish }
                  : { ...enemy, ...phaseFields, ...finish };
              }
              const aim = lockedHateAim();
              const hpx = aim.x - ecx, hpy = aim.y - ecy;
              const hl = Math.hypot(hpx, hpy) || 1;
              let cdirx = cdx / cdist + (hpx / hl) * DASH_ATTACK_HOMING;
              let cdiry = cdy / cdist + (hpy / hl) * DASH_ATTACK_HOMING;
              const cdl = Math.hypot(cdirx, cdiry) || 1;
              cdirx /= cdl; cdiry /= cdl;
              const dashBase = getEnemyBaseSpeed('werewolf'); // 現行不変(基準は犬と同じ)。M65の倍率は新技には掛けない。
              const cs = dashBase * GIANT_CHARGE_SPEED_MULT;
              // v0.25.3073(社長指示「慣性を追加。滑ってる感じに」): 目標速度へ**一次遅れで追従**する。
              // 最高速(cs)は不変=遅くならない。出だしで乗るまでの間と、追尾で曲がる時に外へ膨らむ。
              const ck = 1 - Math.exp(-deltaTime / GIANT_QUAD_INERTIA_TAU);
              const cvx = (enemy.vx ?? 0) + (cdirx * cs - (enemy.vx ?? 0)) * ck;
              const cvy = (enemy.vy ?? 0) + (cdiry * cs - (enemy.vy ?? 0)) * ck;
              // キラキラの軌跡は**実際に滑っている向き**の後ろへ置く(狙いの向きではなく速度の向き)。
              const cvl = Math.hypot(cvx, cvy) || 1;
              const trailX = cvx / cvl, trailY = cvy / cvl;
              // v0.25.3049(社長指示「氷の三連突進はブレスと同じくキラキラのエフェクト付けて」):
              // 突進の軌跡の少し後ろへ粉雪のキラキラを間引きながら撒く(冷気ブレスv0.25.3042と同じ
              // 素材・同じ籠=判定ゼロの派手枠②。ブレスと突進は同時に走らないので時計も共用)。
              if (shouldEmitThrottled(gameTime, runClocks.quadSparkle, QUAD_SPARKLE_INTERVAL_MS)) {
                runClocks.quadSparkle = gameTime;
                for (let qi = 0; qi < 2; qi++) {
                  const qBack = Math.random() * 70;
                  quadBreathSparkles.push({
                    x: ecx - trailX * qBack + (Math.random() - 0.5) * 44,
                    y: ecy - trailY * qBack + (Math.random() - 0.5) * 44,
                  });
                }
              }
              const rawX = enemy.x + cvx * deltaTime, rawY = enemy.y + cvy * deltaTime;
              const cmoved = resolveMove(rawX, rawY);
              const hitShield = shieldRects.length > 0 && shieldRects.some(s => rectsOverlap({ x: cmoved.x, y: cmoved.y, width: enemy.width, height: enemy.height }, s));
              const blocked = Math.abs(cmoved.x - rawX) > 0.5 || Math.abs(cmoved.y - rawY) > 0.5;
              if (hitShield || blocked) {
                if (hitShield) {
                  // 社長指示v0.25.3294「盾で防いだ後、即次の技が飛んできて逆に危ない。強制的に一瞬
                  // 立ち止まらせるか」: 盾ブロック時は連続突進の続行(onDashFinished=即次の突進)を
                  // 打ち切り、通常の突進後と同じ隙(g-dash-recover)へ。壁ヒットは従来どおり連鎖続行。
                  shieldBlocks.push({ x: cmoved.x + enemy.width / 2, y: cmoved.y + enemy.height / 2, kind: 'dash' });
                  return { ...enemy, ...phaseFields, x: cmoved.x, y: cmoved.y, vx: 0, vy: 0, aiPhase: 'g-dash-recover', aiPhaseUntil: atkUntil(scriptRestMs(GIANT_DASH_RECOVER_MS)) };
                }
                return { ...enemy, ...phaseFields, x: cmoved.x, y: cmoved.y, vx: 0, vy: 0, ...onDashFinished() };
              }
              return { ...enemy, ...phaseFields, vx: cvx, vy: cvy, x: cmoved.x, y: cmoved.y };
            }
            case 'g-quad-breath-windup': {
              if (gameTime >= (enemy.aiPhaseUntil ?? 0)) {
                giantBreathFired = true; // v0.25.3700: 発動SE(post-setで鳴らす)
                return {
                  ...enemy, ...phaseFields, vx: 0, vy: 0,
                  aiPhase: 'g-quad-breath-active', aiPhaseUntil: atkUntil(GIANT_QUAD_BREATH_ACTIVE_MS),
                  aiStartedAt: gameTime, giantActiveHit: false,
                };
              }
              return { ...enemy, ...phaseFields, vx: 0, vy: 0 };
            }
            case 'g-quad-breath-active': {
              // 120°を700msかけて回転する帯(継続判定=毎フレーム自己検出し、命中したら1回だけ積む)。
              const bfx = enemy.aiFromX ?? ecx, bfy = enemy.aiFromY ?? ecy;
              const btx = enemy.aiTargetX ?? ecx, bty = enemy.aiTargetY ?? ecy;
              const baseAngle = Math.atan2(bty - bfy, btx - bfx);
              const durEff = GIANT_QUAD_BREATH_ACTIVE_MS / ENEMY_ATTACK_SPEED_MULT;
              const bt = Math.max(0, Math.min(1, (gameTime - (enemy.aiStartedAt ?? gameTime)) / durEff));
              const curAngle = baseAngle - GIANT_QUAD_BREATH_SWEEP_RAD / 2 + GIANT_QUAD_BREATH_SWEEP_RAD * bt;
              const farX = bfx + Math.cos(curAngle) * GIANT_QUAD_BREATH_LENGTH, farY = bfy + Math.sin(curAngle) * GIANT_QUAD_BREATH_LENGTH;
              // v0.25.3042(社長支給素材・指示「ブレスを追いかけるキラキラ空気。幾つか同時に表示させて、
              // 粉雪がぶわー!っと舞ってる演出に使う」): 薙ぎの現在角の少し後ろへ間引きながら散らす。
              // 判定ゼロの派手枠(分類②)=帯の判定・秒数は不変。発火はset後(quadBreathSparkles)。
              if (shouldEmitThrottled(gameTime, runClocks.quadSparkle, QUAD_SPARKLE_INTERVAL_MS)) {
                runClocks.quadSparkle = gameTime;
                for (let qi = 0; qi < 2; qi++) {
                  const qa = curAngle - Math.random() * 0.3; // 少し遅れて追いかける
                  const qr = 70 + Math.random() * (GIANT_QUAD_BREATH_LENGTH - 70);
                  quadBreathSparkles.push({ x: bfx + Math.cos(qa) * qr, y: bfy + Math.sin(qa) * qr });
                }
              }
              const playerR = Math.max(player.width, player.height) / 2;
              const hitNow = !enemy.giantActiveHit &&
                distToBandRect({ x: pcx, y: pcy }, { x: bfx, y: bfy }, { x: farX, y: farY }, GIANT_QUAD_BREATH_HALF_WIDTH) <= playerR;
              if (hitNow) pumpkinBlasts.push({ x: pcx, y: pcy, radius: playerR + 4, damage: enemy.damage, enemyId: enemy.id, moveKey: 'g-quad' });
              if (gameTime >= (enemy.aiPhaseUntil ?? 0)) {
                // 薙いだ跡に遅延起爆の氷を3つ(固定・学習装置①)。スカジの氷ハザード配管(pumpkinBlastsの
                // ice:true)を流用するが、専用のgiantDelayedHitsキュー(専用配列)で管理する
                // (skadiIceMarkersは流用しない=既存ボスの挙動に一切触れない・DEVELOPMENT_LOGの先例踏襲)。
                const iceFractions = [0.2, 0.5, 0.8];
                const newHits = iceFractions.map(f => {
                  const a = baseAngle - GIANT_QUAD_BREATH_SWEEP_RAD / 2 + GIANT_QUAD_BREATH_SWEEP_RAD * f;
                  return {
                    x: bfx + Math.cos(a) * GIANT_QUAD_BREATH_LENGTH * 0.7,
                    y: bfy + Math.sin(a) * GIANT_QUAD_BREATH_LENGTH * 0.7,
                    radius: GIANT_QUAD_ICE_RADIUS, bornAt: gameTime, fireAt: atkUntil(GIANT_QUAD_ICE_DELAY_MS), ice: true,
                    moveKey: 'g-quad', // G4a計測タグ(記録専用)
                  };
                });
                return {
                  ...enemy, ...phaseFields, vx: 0, vy: 0,
                  aiPhase: 'g-quad-recover', aiPhaseUntil: atkUntil(scriptRestMs(GIANT_QUAD_RECOVER_MS)),
                  giantDelayedHits: [...(giantDelayedHits ?? []), ...newHits],
                  giantActiveHit: hitNow ? true : enemy.giantActiveHit,
                };
              }
              return { ...enemy, ...phaseFields, vx: 0, vy: 0, giantActiveHit: hitNow ? true : enemy.giantActiveHit };
            }
            case 'g-quad-recover': {
              if (gameTime >= (enemy.aiPhaseUntil ?? 0)) {
                return { ...enemy, ...phaseFields, vx: 0, vy: 0, ...finishGiantStageMove('quaddash', GIANT_QUAD_CD_MS) };
              }
              return { ...enemy, ...phaseFields, vx: 0, vy: 0 };
            }

            // ==== M66: stage-4 氷結波(nova・大技) ====
            case 'g-nova-windup': {
              if (gameTime >= (enemy.aiPhaseUntil ?? 0)) {
                giantNovaFired = true; // v0.25.3700: 発動SE(post-setで鳴らす)
                return {
                  ...enemy, ...phaseFields, vx: 0, vy: 0,
                  aiPhase: 'g-nova-active', aiPhaseUntil: atkUntil(GIANT_NOVA_ACTIVE_MS),
                  aiStartedAt: gameTime, giantActiveHit: false,
                };
              }
              // v0.25.3079(社長指示「城4の大技(全方位)、予兆が欲しいので、キラキラが全方位から
              // ボスに集まる表現を短めに挟みたい」): 発動の NOVA_GATHER_LEAD_MS 前から、外周から
              // ボス本体へ**寄ってくる**キラキラを撒く。粒も寄るほど小さくする(氷塊の凝縮と同じ作法)。
              // 判定ゼロの派手枠②=氷結波の輪の半径・秒数・ダメージには一切触れない。
              {
                const nRemain = Math.max(0, (enemy.aiPhaseUntil ?? gameTime) - gameTime);
                if (nRemain <= NOVA_GATHER_LEAD_MS
                  && shouldEmitThrottled(gameTime, runClocks.novaGather, NOVA_GATHER_MS)) {
                  runClocks.novaGather = gameTime;
                  const nt = 1 - nRemain / NOVA_GATHER_LEAD_MS; // 0=集め始め 1=発動直前
                  // v0.25.3096(社長「もっと分かりやすく」): 出る位置を寄せるだけでは「集まる」が
                  // 読めなかった(粒はその場で消えるため)。**実際にボスへ向かって飛ばす**。
                  // 発生は常に外周(遠くから来る)にし、寿命の間にちょうど本体へ届く速さを与える。
                  for (let ni = 0; ni < NOVA_GATHER_N; ni++) {
                    const na = Math.random() * Math.PI * 2;                 // 全方位から
                    const r0 = NOVA_GATHER_R * (0.75 + Math.random() * 0.3); // 発生半径(遠く)
                    const lifeMs = NOVA_MOTE_LIFE_MS;
                    const sp = (r0 / lifeMs) * 1000;                        // 寿命でちょうど中心へ届く
                    quadBreathSparkles.push({
                      x: ecx + Math.cos(na) * r0, y: ecy + Math.sin(na) * r0,
                      // 内向き(ボスの方)へ飛ぶ。絵の向きも進行方向へ揃える=線に見えて追いやすい。
                      driftX: -Math.cos(na) * sp, driftY: -Math.sin(na) * sp, rot: na + Math.PI,
                      scale: QUAD_ICE_SPARK_SCALE_MAX
                        + (QUAD_ICE_SPARK_SCALE_MIN - QUAD_ICE_SPARK_SCALE_MAX) * nt,
                      life: lifeMs,
                    });
                  }
                }
                // 発動の一瞬前に「ピカッ」(社長指示「(上も)」)。**毎フレーム判定**し、専用の時計で
                // 1回だけに絞る(間引きの中に入れると発火し損ねる。上の氷塊と同じ理由)。
                if (nRemain <= QUAD_ICE_FLASH_LEAD_MS
                  && shouldEmitThrottled(gameTime, runClocks.novaFlash, GIANT_NOVA_WINDUP_MS / 2)) {
                  runClocks.novaFlash = gameTime;
                  iceFlashAt.push({ x: ecx, y: ecy });
                }
              }
              return { ...enemy, ...phaseFields, vx: 0, vy: 0 };
            }
            case 'g-nova-active': {
              // 半径60→400が広がる輪(継続判定)。判定はその瞬間の輪のみ=内側(既に通過した場所)は
              // 当たらない(全ボス共通の「離れれば安全」の逆張り=図形どおり)。
              const durEff = GIANT_NOVA_ACTIVE_MS / ENEMY_ATTACK_SPEED_MULT;
              const nt = Math.max(0, Math.min(1, (gameTime - (enemy.aiStartedAt ?? gameTime)) / durEff));
              const curR = GIANT_NOVA_RADIUS_START + (GIANT_NOVA_RADIUS_END - GIANT_NOVA_RADIUS_START) * nt;
              const playerR = Math.max(player.width, player.height) / 2;
              const pdist = Math.hypot(pcx - ecx, pcy - ecy);
              const hitNow = !enemy.giantActiveHit && Math.abs(pdist - curR) <= GIANT_NOVA_BAND_THICKNESS + playerR;
              if (hitNow) pumpkinBlasts.push({ x: pcx, y: pcy, radius: playerR + 4, damage: enemy.damage, enemyId: enemy.id, moveKey: 'g-nova' });
              if (gameTime >= (enemy.aiPhaseUntil ?? 0)) {
                return {
                  ...enemy, ...phaseFields, vx: 0, vy: 0,
                  aiPhase: 'g-nova-recover', aiPhaseUntil: atkUntil(scriptRestMs(GIANT_NOVA_RECOVER_MS)),
                  giantActiveHit: hitNow ? true : enemy.giantActiveHit,
                };
              }
              return { ...enemy, ...phaseFields, vx: 0, vy: 0, giantActiveHit: hitNow ? true : enemy.giantActiveHit };
            }
            case 'g-nova-recover': {
              if (gameTime >= (enemy.aiPhaseUntil ?? 0)) {
                return { ...enemy, ...phaseFields, vx: 0, vy: 0, ...finishGiantStageMove('nova', GIANT_NOVA_CD_MS) };
              }
              return { ...enemy, ...phaseFields, vx: 0, vy: 0 };
            }

            // ==== 三連射(trishot・ステージ5の固有技・v0.25.2939) ====
            // 判定は旧・翼撃と同一: 左右2枚の帯を同時に出し、三拍目(中央)を一拍おいて出す。
            case 'g-trishot-windup': {
              if (gameTime >= (enemy.aiPhaseUntil ?? 0)) {
                const tfx = enemy.aiFromX ?? ecx, tfy = enemy.aiFromY ?? ecy;
                const ttx = enemy.aiTargetX ?? ecx, tty = enemy.aiTargetY ?? ecy;
                const tdl = Math.hypot(ttx - tfx, tty - tfy) || 1;
                const tux = (ttx - tfx) / tdl, tuy = (tty - tfy) / tdl;
                const cosS = Math.cos(GIANT_TRISHOT_SPREAD_RAD), sinS = Math.sin(GIANT_TRISHOT_SPREAD_RAD);
                const leftX = tux * cosS - tuy * sinS, leftY = tux * sinS + tuy * cosS;
                const rightX = tux * cosS + tuy * sinS, rightY = -tux * sinS + tuy * cosS;
                const leftTx = tfx + leftX * GIANT_TRISHOT_LENGTH, leftTy = tfy + leftY * GIANT_TRISHOT_LENGTH;
                const rightTx = tfx + rightX * GIANT_TRISHOT_LENGTH, rightTy = tfy + rightY * GIANT_TRISHOT_LENGTH;
                pumpkinBlasts.push({
                  x: (tfx + leftTx) / 2, y: (tfy + leftTy) / 2, radius: GIANT_TRISHOT_HALF_WIDTH, damage: enemy.damage, enemyId: enemy.id, moveKey: 'g-trishot',
                  capsule: { fx: tfx, fy: tfy, tx: leftTx, ty: leftTy, halfWidth: GIANT_TRISHOT_HALF_WIDTH },
                });
                pumpkinBlasts.push({
                  x: (tfx + rightTx) / 2, y: (tfy + rightTy) / 2, radius: GIANT_TRISHOT_HALF_WIDTH, damage: enemy.damage, enemyId: enemy.id, moveKey: 'g-trishot',
                  capsule: { fx: tfx, fy: tfy, tx: rightTx, ty: rightTy, halfWidth: GIANT_TRISHOT_HALF_WIDTH },
                });
                settleGiantHabit('g-trishot-windup', {
                  aiFromX: tfx, aiFromY: tfy, aiTargetX: ttx, aiTargetY: tty,
                  liveShape: episodeShapeFor('giantbat', 'g-trishot-windup', enemy) ?? undefined,
                });
                return {
                  ...enemy, ...phaseFields, vx: 0, vy: 0,
                  aiPhase: 'g-trishot-active', aiPhaseUntil: atkUntil(GIANT_TRISHOT_ACTIVE_MS),
                  // 三拍目(中央=正面)は実行から400ms(固定)後=回避狩り。横がだめなら中央で逃げた先を取る。
                  giantDelayedHits: [...(giantDelayedHits ?? []), {
                    x: (tfx + ttx) / 2, y: (tfy + tty) / 2, radius: GIANT_TRISHOT_HALF_WIDTH, bornAt: gameTime, fireAt: atkUntil(GIANT_TRISHOT_THIRD_DELAY_MS),
                    capsule: { fx: tfx, fy: tfy, tx: ttx, ty: tty, halfWidth: GIANT_TRISHOT_HALF_WIDTH },
                    moveKey: 'g-trishot',
                  }],
                };
              }
              return { ...enemy, ...phaseFields, vx: 0, vy: 0 };
            }
            case 'g-trishot-active': {
              if (gameTime >= (enemy.aiPhaseUntil ?? 0)) {
                return { ...enemy, ...phaseFields, vx: 0, vy: 0, aiPhase: 'g-trishot-recover', aiPhaseUntil: atkUntil(giantRestMs(GIANT_TRISHOT_RECOVER_MS)) };
              }
              return { ...enemy, ...phaseFields, vx: 0, vy: 0 };
            }
            case 'g-trishot-recover': {
              if (gameTime >= (enemy.aiPhaseUntil ?? 0)) {
                return { ...enemy, ...phaseFields, vx: 0, vy: 0, ...finishGiantStageMove('trishot', GIANT_TRISHOT_CD_MS) };
              }
              return { ...enemy, ...phaseFields, vx: 0, vy: 0 };
            }
            // ==== 翼撃(wing・ステージ1の大技・v0.25.2863) ====
            case 'g-wing-windup': {
              if (gameTime >= (enemy.aiPhaseUntil ?? 0)) {
                // 羽を頭上に広げ切った瞬間に**素早く一周**する。判定は溜め開始位置を中心にした
                // 円1つ(=予告の赤い円とまったく同じ図形)。回転の途中経過は判定に出さない
                // ——「素早く」なので、途中で背後へ回り込んで避ける遊びは作らない(見た目と食い違う)。
                pumpkinBlasts.push({
                  x: enemy.aiFromX ?? ecx, y: enemy.aiFromY ?? ecy,
                  radius: GIANT_WING_RADIUS, damage: enemy.damage, enemyId: enemy.id, moveKey: 'g-wing',
                });
                // 自分中心(軸退化=posB固定0)。中心=溜め開始位置(aiFromX/Y)。
                settleGiantHabit('g-wing-windup', {
                  aiFromX: enemy.aiFromX ?? ecx, aiFromY: enemy.aiFromY ?? ecy,
                  aiTargetX: enemy.aiFromX ?? ecx, aiTargetY: enemy.aiFromY ?? ecy,
                  liveShape: episodeShapeFor('giantbat', 'g-wing-windup', enemy) ?? undefined,
                });
                return {
                  ...enemy, ...phaseFields, vx: 0, vy: 0,
                  aiPhase: 'g-wing-active', aiPhaseUntil: atkUntil(GIANT_WING_ACTIVE_MS),
                };
              }
              return { ...enemy, ...phaseFields, vx: 0, vy: 0 };
            }
            case 'g-wing-active': {
              if (gameTime >= (enemy.aiPhaseUntil ?? 0)) {
                return { ...enemy, ...phaseFields, vx: 0, vy: 0, aiPhase: 'g-wing-recover', aiPhaseUntil: atkUntil(scriptRestMs(GIANT_WING_RECOVER_MS)) };
              }
              return { ...enemy, ...phaseFields, vx: 0, vy: 0 };
            }
            case 'g-wing-recover': {
              if (gameTime >= (enemy.aiPhaseUntil ?? 0)) {
                return { ...enemy, ...phaseFields, vx: 0, vy: 0, ...finishGiantStageMove('wing', GIANT_WING_CD_MS) };
              }
              return { ...enemy, ...phaseFields, vx: 0, vy: 0 };
            }

            // ==== M66: stage-5 掃射(sweepbeam・大技) ====
            case 'g-sweepbeam-windup': {
              if (gameTime >= (enemy.aiPhaseUntil ?? 0)) {
                giantSweepbeamFired = true; // v0.25.3700: 発動SE(post-setで鳴らす)
                return {
                  ...enemy, ...phaseFields, vx: 0, vy: 0,
                  aiPhase: 'g-sweepbeam-active', aiPhaseUntil: atkUntil(GIANT_SWEEPBEAM_ACTIVE_MS),
                  aiStartedAt: gameTime, giantActiveHit: false,
                };
              }
              return { ...enemy, ...phaseFields, vx: 0, vy: 0 };
            }
            case 'g-sweepbeam-active': {
              // 細い帯(半幅30)が120°を900msかけて回転する(継続判定)。懐(回転の中心付近)が安全=
              // 帯の始点を中心からGIANT_SWEEPBEAM_INNER_RADIUSぶん前へ出した通常カプセル(ドーナツの
              // くり抜きではない=ウリの内径修正・v0.25.2376の方式を踏襲。図形と判定が完全一致する)。
              const sbfx = enemy.aiFromX ?? ecx, sbfy = enemy.aiFromY ?? ecy;
              const sbtx = enemy.aiTargetX ?? ecx, sbty = enemy.aiTargetY ?? ecy;
              const baseAngle = Math.atan2(sbty - sbfy, sbtx - sbfx);
              const durEff = GIANT_SWEEPBEAM_ACTIVE_MS / ENEMY_ATTACK_SPEED_MULT;
              const st = Math.max(0, Math.min(1, (gameTime - (enemy.aiStartedAt ?? gameTime)) / durEff));
              const curAngle = baseAngle - GIANT_SWEEPBEAM_SWEEP_RAD / 2 + GIANT_SWEEPBEAM_SWEEP_RAD * st;
              const nearX = sbfx + Math.cos(curAngle) * GIANT_SWEEPBEAM_INNER_RADIUS, nearY = sbfy + Math.sin(curAngle) * GIANT_SWEEPBEAM_INNER_RADIUS;
              const farX = sbfx + Math.cos(curAngle) * (GIANT_SWEEPBEAM_INNER_RADIUS + GIANT_SWEEPBEAM_LENGTH),
                farY = sbfy + Math.sin(curAngle) * (GIANT_SWEEPBEAM_INNER_RADIUS + GIANT_SWEEPBEAM_LENGTH);
              const playerR = Math.max(player.width, player.height) / 2;
              const hitNow = !enemy.giantActiveHit &&
                distToBandRect({ x: pcx, y: pcy }, { x: nearX, y: nearY }, { x: farX, y: farY }, GIANT_SWEEPBEAM_HALF_WIDTH) <= playerR;
              if (hitNow) pumpkinBlasts.push({ x: pcx, y: pcy, radius: playerR + 4, damage: enemy.damage, enemyId: enemy.id, moveKey: 'g-sweepbeam' });
              if (gameTime >= (enemy.aiPhaseUntil ?? 0)) {
                return {
                  ...enemy, ...phaseFields, vx: 0, vy: 0,
                  aiPhase: 'g-sweepbeam-recover', aiPhaseUntil: atkUntil(scriptRestMs(GIANT_SWEEPBEAM_RECOVER_MS)),
                  giantActiveHit: hitNow ? true : enemy.giantActiveHit,
                };
              }
              return { ...enemy, ...phaseFields, vx: 0, vy: 0, giantActiveHit: hitNow ? true : enemy.giantActiveHit };
            }
            case 'g-sweepbeam-recover': {
              if (gameTime >= (enemy.aiPhaseUntil ?? 0)) {
                return { ...enemy, ...phaseFields, vx: 0, vy: 0, ...finishGiantStageMove('sweepbeam', GIANT_SWEEPBEAM_CD_MS) };
              }
              return { ...enemy, ...phaseFields, vx: 0, vy: 0 };
            }

            // ==== M67(§6.26-12): stage-7限定「血の爪痕」(talon) ====
            case 'g-talon-windup': {
              // ダメージは既にbeginGlenMoveがgiantDelayedHitsへ積み済み(置いた瞬間0ダメージ・固定900ms後
              // に自動で爆ぜる)。ここではwindup自体の終わりでrecoverへ直結するだけ(activeは無い)。
              if (gameTime >= (enemy.aiPhaseUntil ?? 0)) {
                return { ...enemy, ...phaseFields, vx: 0, vy: 0, aiPhase: 'g-talon-recover', aiPhaseUntil: atkUntil(scriptRestMs(GLEN_TALON_RECOVER_MS)) };
              }
              return { ...enemy, ...phaseFields, vx: 0, vy: 0 };
            }
            case 'g-talon-recover': {
              if (gameTime >= (enemy.aiPhaseUntil ?? 0)) {
                return { ...enemy, ...phaseFields, vx: 0, vy: 0, ...finishGlenMove('talon', GLEN_TALON_CD_MS) };
              }
              return { ...enemy, ...phaseFields, vx: 0, vy: 0 };
            }

            // ==== M67: stage-7限定「血の弧」(boon) ====
            case 'g-boon-windup': {
              // 5個のT5円は既にbeginGlenMoveがgiantDelayedHitsへ積み済み(固定700ms後に爆ぜ、その後
              // floorUntilまで床として残る)。ここもactiveは無くrecoverへ直結する。
              if (gameTime >= (enemy.aiPhaseUntil ?? 0)) {
                return { ...enemy, ...phaseFields, vx: 0, vy: 0, aiPhase: 'g-boon-recover', aiPhaseUntil: atkUntil(scriptRestMs(GLEN_BOON_RECOVER_MS)) };
              }
              return { ...enemy, ...phaseFields, vx: 0, vy: 0 };
            }
            case 'g-boon-recover': {
              if (gameTime >= (enemy.aiPhaseUntil ?? 0)) {
                return { ...enemy, ...phaseFields, vx: 0, vy: 0, ...finishGlenMove('boon', GLEN_BOON_CD_MS) };
              }
              return { ...enemy, ...phaseFields, vx: 0, vy: 0 };
            }

            // ==== M67: stage-7限定「伸びる触手」(reach) ====
            case 'g-reach-windup': {
              // ★v0.25.3159b: このcaseは「触手の技that全体」を回す。**複数本が同時に存在する**ので、
              // 1本ずつ windup→active→recover と進む形をやめ、ここで全部の本を面倒見る。
              //   ①間隔(2.3秒)ごとに次の1本を生やす(最大 GLEN_REACH_SHOTS 本)
              //   ②溜め中の本は毎tick照準を進める(振り子)
              //   ③溜め(2.6秒)を過ぎた本は判定を1回積んで fired にする
              //   ④全部 fired になったら硬直へ
              const rEffWind = GLEN_REACH_WINDUP_MS / ENEMY_ATTACK_SPEED_MULT;
              const rEffGap = GLEN_REACH_INTERVAL_MS / ENEMY_ATTACK_SPEED_MULT;
              const rCaps = glenReachTrackCaps((player.speed ?? PLAYER_BASE_SPEED) * GAME_SPEED);
              const rAim = resolveBossHateAim(enemy, { x: pcx, y: pcy }, summons, gameTime);
              const shots = [...(enemy.gReachShots ?? [])];
              // ① 次の1本を生やす(前の本が生えてから rEffGap 経過・本数上限まで)
              const rLast = shots[shots.length - 1];
              if (shots.length < GLEN_REACH_SHOTS && rLast && gameTime - rLast.t0 >= rEffGap) {
                // ★本ごとに狙いを取り直す(社長指示v0.25.3126「ターゲティングしなおして」)。
                // 開始位置は左右交互=同じ動きに見えない。
                const stN = glenReachAimStart(ecx, ecy, rAim.x, rAim.y, shots.length);
                shots.push({ t0: gameTime, ax: stN.x, ay: stN.y, avx: 0, avy: 0, idx: shots.length });
              }
              // ②③ 各本を進める
              let rNewest: typeof shots[number] | undefined;
              // research/AI_HUMANIZE.md B1: 「最後に判定を積んだ本」の帯(=州が硬直へ落ちる瞬間の実図形。
              // ★検収是正(中2)の後もaiTarget表示用フォールバックとしてそのまま使う)。
              let rLastFiredTx: number | undefined, rLastFiredTy: number | undefined;
              for (let i = 0; i < shots.length; i++) {
                const sh = shots[i];
                if (sh.fired) continue;
                const age = gameTime - sh.t0;
                if (age >= rEffWind) {
                  // 溜め終わり=判定。帯は**その瞬間の照準の向き**へ長さ900(絵と判定は同じ値を読む)。
                  const ang = Math.atan2(sh.ay - ecy, sh.ax - ecx);
                  const tx = ecx + Math.cos(ang) * GLEN_REACH_LENGTH;
                  const ty = ecy + Math.sin(ang) * GLEN_REACH_LENGTH;
                  pumpkinBlasts.push({
                    x: (ecx + tx) / 2, y: (ecy + ty) / 2, radius: GLEN_REACH_HALF_WIDTH,
                    damage: enemy.damage, enemyId: enemy.id, moveKey: 'g-reach',
                    capsule: { fx: ecx, fy: ecy, tx, ty, halfWidth: GLEN_REACH_HALF_WIDTH },
                  });
                  // ★検収是正(中2): 判定を積んだ瞬間の帯(始点/終点)を本ごとに保持する
                  // (満了時に「最後の1本」だけでなく全本をsettleEpisodeへ渡すため)。
                  shots[i] = { ...sh, fired: true, fx: ecx, fy: ecy, tx, ty };
                  rLastFiredTx = tx; rLastFiredTy = ty;
                  continue;
                }
                const stp = stepLaserAim(
                  { x: sh.ax, y: sh.ay, vx: sh.avx, vy: sh.avy },
                  rAim.x, rAim.y, deltaTime, rCaps.maxPxS, rCaps.accel,
                  Math.max(0, Math.min(1, age / rEffWind)),
                  GLEN_REACH_OVERSHOOT,
                );
                shots[i] = { ...sh, ax: stp.x, ay: stp.y, avx: stp.vx, avy: stp.vy };
                rNewest = shots[i];
              }
              // ④ 全部撃ち終わったら硬直(=反撃窓)へ
              if (shots.length >= GLEN_REACH_SHOTS && shots.every(sh => sh.fired)) {
                // research/AI_HUMANIZE.md B1: 州の満了=最後に判定を積んだ本の帯で録る(無ければ
                // 既存のaiFrom/aiTarget=直前tickの表示用最新本にフォールバック・安全側)。
                const rft = rLastFiredTx ?? enemy.aiTargetX ?? ecx, rfy = rLastFiredTy ?? enemy.aiTargetY ?? ecy;
                // ★検収是正(中2): このサイクルで実際に張った全本(3本)をbandsへ列挙する(最寄りの1本で
                // 正規化・sub=帯index=habitPos側の既存仕様どおり)。1本も判定を積めていない異常系だけ
                // 従来のフォールバック帯(表示用の最新本)へ落とす(=episodeShapeForのg-reach-windup分岐と
                // 同じ規則。旧実装はここでbandsを自前で組んでいたが、AI_HUMANIZE.md B2 ★未決#14=(a)で
                // episodeShapeForへ1本化=数値の複製なし)。
                // episodeShapeFor の g-reach-windup 分岐は enemy.gReachShots を直接読むが、
                // この tick で発射した本(shots)はまだ enemy へ書き戻していない(下の return で
                // 初めて確定する)。スナップショットを合成して渡す(episodeShape.ts冒頭の注記どおり)。
                settleGiantHabit('g-reach-windup', {
                  aiFromX: ecx, aiFromY: ecy, aiTargetX: rft, aiTargetY: rfy,
                  liveShape: episodeShapeFor('giantbat', 'g-reach-windup', { ...enemy, gReachShots: shots }) ?? undefined,
                });
                return {
                  ...enemy, ...phaseFields, vx: 0, vy: 0, gReachShots: undefined,
                  aiPhase: 'g-reach-recover', aiPhaseUntil: atkUntil(scriptRestMs(GLEN_REACH_RECOVER_MS)),
                };
              }
              // aiFrom/aiTarget は**最新の1本**を写す(既存の描画・ゴースト・記録がここを読む)。
              const rShow = rNewest ?? shots.find(sh => !sh.fired);
              const rAng = rShow ? Math.atan2(rShow.ay - ecy, rShow.ax - ecx) : 0;
              return {
                ...enemy, ...phaseFields, vx: 0, vy: 0, gReachShots: shots,
                gReachIndex: shots.length - 1,
                aiFromX: ecx, aiFromY: ecy,
                ...(rShow ? {
                  aiTargetX: ecx + Math.cos(rAng) * GLEN_REACH_LENGTH,
                  aiTargetY: ecy + Math.sin(rAng) * GLEN_REACH_LENGTH,
                } : {}),
              };
            }
            case 'g-reach-recover': {
              if (gameTime >= (enemy.aiPhaseUntil ?? 0)) {
                const rIdx = enemy.gReachIndex ?? 0;
                if (rIdx + 1 < GLEN_REACH_SHOTS) {
                  // ★**ここで狙いを取り直す**(社長指示「1秒置きにターゲティングしなおして」)。
                  // 毎フレーム追尾ではなく、**次の溜めが始まる瞬間に1回だけ**評価する
                  // (掟W4=テルを出したら向きは変えない。三連突進のlegごとの再評価と同じ作法)。
                  const rAim = resolveBossHateAim(enemy, { x: pcx, y: pcy }, summons, gameTime);
                  const rdl = Math.hypot(rAim.x - ecx, rAim.y - ecy) || 1;
                  const rdx = (rAim.x - ecx) / rdl, rdy = (rAim.y - ecy) / rdl;
                  return {
                    ...enemy, ...phaseFields, vx: 0, vy: 0,
                    aiPhase: 'g-reach-windup', aiPhaseUntil: atkUntil(GLEN_REACH_WINDUP_MS),
                    aiFromX: ecx, aiFromY: ecy,
                    aiTargetX: ecx + rdx * GLEN_REACH_LENGTH, aiTargetY: ecy + rdy * GLEN_REACH_LENGTH,
                    aiStartedAt: gameTime, hateTarget: rAim.side, gReachIndex: rIdx + 1,
                    // 追尾照準も**発ごとに引き直す**(前の発の勢いを持ち越さない=3発とも同じ読みで避けられる)。
                    // 開始は発ごとに左右交互=3連発が「左から→右から→左から」で同じに見えない。
                    ...(() => { const st = glenReachAimStart(ecx, ecy, rAim.x, rAim.y, rIdx + 1);
                      return { gReachAimX: st.x, gReachAimY: st.y, gReachAimVX: 0, gReachAimVY: 0 }; })(),
                  };
                }
                return {
                  ...enemy, ...phaseFields, vx: 0, vy: 0, gReachIndex: undefined,
                  gReachAimX: undefined, gReachAimY: undefined, gReachAimVX: undefined, gReachAimVY: undefined,
                  ...finishGlenMove('reach', GLEN_REACH_CD_MS),
                };
              }
              return { ...enemy, ...phaseFields, vx: 0, vy: 0 };
            }

            // ==== v0.25.3139: 第二形態の通常技「尻尾の叩きつけ → 弾の連射」 ====
            case 'g-tailslam-windup': {
              if (gameTime >= (enemy.aiPhaseUntil ?? 0)) {
                // 叩きつけ=帯(カプセル)の一撃。**溜め開始で焼いた線と同じ寸法**をそのまま判定にする
                // (bite/slam/reachと同型=windup終わりにpumpkinBlastsへ1回だけ積む)。
                const tfx = enemy.aiFromX ?? ecx, tfy = enemy.aiFromY ?? ecy;
                const ttx = enemy.aiTargetX ?? ecx, tty = enemy.aiTargetY ?? ecy;
                pumpkinBlasts.push({
                  x: (tfx + ttx) / 2, y: (tfy + tty) / 2, radius: GLEN_TAILSLAM_HALF_WIDTH,
                  damage: enemy.damage, enemyId: enemy.id, moveKey: 'g-tailslam',
                  capsule: { fx: tfx, fy: tfy, tx: ttx, ty: tty, halfWidth: GLEN_TAILSLAM_HALF_WIDTH },
                });
                settleGiantHabit('g-tailslam-windup', {
                  aiFromX: tfx, aiFromY: tfy, aiTargetX: ttx, aiTargetY: tty,
                  liveShape: episodeShapeFor('giantbat', 'g-tailslam-windup', enemy) ?? undefined,
                });
                glenTailSlammed = true; // 叩きつけた瞬間(set後に画面を揺らす)
                return {
                  ...enemy, ...phaseFields, vx: 0, vy: 0,
                  aiPhase: 'g-tailslam-active', aiPhaseUntil: atkUntil(GLEN_TAILSLAM_ACTIVE_MS),
                };
              }
              return { ...enemy, ...phaseFields, vx: 0, vy: 0 };
            }
            case 'g-tailslam-active': {
              if (gameTime >= (enemy.aiPhaseUntil ?? 0)) {
                // 叩きつけ切ったら、そのまま**弾の連射**へ。1発目は即。
                return {
                  ...enemy, ...phaseFields, vx: 0, vy: 0,
                  aiPhase: 'g-tailslam-volley',
                  aiPhaseUntil: atkUntil(GLEN_TAILSLAM_VOLLEY_GAP_MS * GLEN_TAILSLAM_VOLLEYS),
                  gTailVolleyLeft: GLEN_TAILSLAM_VOLLEYS, gTailVolleyAt: gameTime,
                };
              }
              return { ...enemy, ...phaseFields, vx: 0, vy: 0 };
            }
            case 'g-tailslam-volley': {
              // ★「すでに出てる弾の機能を意図的に連射」(社長の言葉どおり): 胴体弾の斉射
              // (glenVolleyShots)を**そのまま**間隔をあけて撃つ。弾の性能・見た目・カウンター可否は
              // 1つも変えない=プレイヤーの読み(打ち返せる通常弾)が崩れない。
              // 実際の発射は set 後(glenVolleyFires)=既存の胴体弾と同じ経路に相乗りする。
              const tvLeft = enemy.gTailVolleyLeft ?? 0;
              if (tvLeft > 0 && gameTime >= (enemy.gTailVolleyAt ?? 0)) {
                glenVolleyFires.push(enemy.id);
                return {
                  ...enemy, ...phaseFields, vx: 0, vy: 0,
                  gTailVolleyLeft: tvLeft - 1,
                  gTailVolleyAt: gameTime + GLEN_TAILSLAM_VOLLEY_GAP_MS / ENEMY_ATTACK_SPEED_MULT,
                };
              }
              if (tvLeft <= 0) {
                return {
                  ...enemy, ...phaseFields, vx: 0, vy: 0,
                  aiPhase: 'g-tailslam-recover',
                  aiPhaseUntil: atkUntil(scriptRestMs(GLEN_TAILSLAM_RECOVER_MS)),
                  gTailVolleyLeft: undefined, gTailVolleyAt: undefined,
                };
              }
              return { ...enemy, ...phaseFields, vx: 0, vy: 0 };
            }
            case 'g-tailslam-recover': {
              if (gameTime >= (enemy.aiPhaseUntil ?? 0)) {
                return { ...enemy, ...phaseFields, vx: 0, vy: 0, ...finishGlenMove('tailslam', GLEN_TAILSLAM_CD_MS) };
              }
              return { ...enemy, ...phaseFields, vx: 0, vy: 0 };
            }

            // ==== M67: stage-7限定「虚無の三唱」(nihil・大技) ====
            case 'g-nihil-chant1': {
              if (gameTime >= (enemy.aiPhaseUntil ?? 0)) {
                glenNihilChanted = true; // 2唱目へ=絵が切り替わる瞬間(set後に画面を揺らす)
                return { ...enemy, ...phaseFields, vx: 0, vy: 0, aiPhase: 'g-nihil-chant2', aiPhaseUntil: atkUntil(GLEN_NIHIL_CHANT_MS) };
              }
              return { ...enemy, ...phaseFields, vx: 0, vy: 0 };
            }
            case 'g-nihil-chant2': {
              if (gameTime >= (enemy.aiPhaseUntil ?? 0)) {
                glenNihilChanted = true; // 3唱目へ=絵が切り替わる瞬間
                return { ...enemy, ...phaseFields, vx: 0, vy: 0, aiPhase: 'g-nihil-chant3', aiPhaseUntil: atkUntil(GLEN_NIHIL_CHANT_MS) };
              }
              return { ...enemy, ...phaseFields, vx: 0, vy: 0 };
            }
            case 'g-nihil-chant3': {
              // 3唱目終了=学習点④の本体。円自体はgiantDelayedHits側のfireAtが同じタイミングで独立に
              // 爆ぜる(このcaseはGlen自身のaiPhase遷移=recoverへ進むだけ)。
              if (gameTime >= (enemy.aiPhaseUntil ?? 0)) {
                return { ...enemy, ...phaseFields, vx: 0, vy: 0, aiPhase: 'g-nihil-recover', aiPhaseUntil: atkUntil(scriptRestMs(GLEN_NIHIL_RECOVER_MS)) };
              }
              return { ...enemy, ...phaseFields, vx: 0, vy: 0 };
            }
            case 'g-nihil-recover': {
              if (gameTime >= (enemy.aiPhaseUntil ?? 0)) {
                return { ...enemy, ...phaseFields, vx: 0, vy: 0, ...finishGlenMove('nihil', GLEN_NIHIL_CD_MS) };
              }
              return { ...enemy, ...phaseFields, vx: 0, vy: 0 };
            }

            default: {
              // 待機中(chase): 技を抽選する。全体クールダウン(aiReadyAt=パリィ直後の一時停止に流用)明け
              // かつ、各技の個別CD明けのものだけを候補にする(giantScript.tsのpickGiantMoveが距離ゾーン別の
              // 重み付き抽選=BOSS_RANGE_REWORK.md・社長裁定v0.25.2455)。
              if (gameTime >= (enemy.aiReadyAt ?? 0)) {
                const ready: Record<GiantMove, boolean> = {
                  stomp: gameTime >= (enemy.gStompReadyAt ?? 0),
                  sweep: gameTime >= (enemy.gSweepReadyAt ?? 0),
                  jump: gameTime >= (enemy.gJumpReadyAt ?? 0),
                  dash: gameTime >= (enemy.gDashReadyAt ?? 0),
                  bolt: gameTime >= (enemy.gBoltReadyAt ?? 0),
                };
                // M66(§6.26-11): stage-1/3/4/5だけ独自技(Phase1〜)/大技(Phase2〜)を候補へ足す
                // (pickGiantMoveWithStageがGIANT_STAGE_UNIQUE_MOVE/ULT_MOVEの表で既にゲート済み=
                // 他ステージ・storyBossでは実質pickGiantMoveと同じ結果になる)。`?giantunique=0`または
                // isStoryBoss個体は、既存のpickGiantMoveをそのまま呼ぶ経路にして今日までの挙動を
                // 1バイトも変えない(受け入れ条件=フォールバック)。
                if (GIANT_UNIQUE_ENABLED && !isStoryBoss) {
                  // v0.25.3046: Partial→全キー必須へ(trishot追加漏れで三連射が一度も出なかった再発防止。
                  // 今後GiantStageMoveIdへ技を足すと、ここに書くまで型エラーで止まる=機械化)。
                  const stageReady: Record<GiantStageMoveId, boolean> = {
                    bite: gameTime >= (enemy.gStageReadyAt?.bite ?? 0),
                    slam: gameTime >= (enemy.gStageReadyAt?.slam ?? 0),
                    glide: gameTime >= (enemy.gStageReadyAt?.glide ?? 0),
                    dive: gameTime >= (enemy.gStageReadyAt?.dive ?? 0),
                    quaddash: gameTime >= (enemy.gStageReadyAt?.quaddash ?? 0),
                    nova: gameTime >= (enemy.gStageReadyAt?.nova ?? 0),
                    wing: gameTime >= (enemy.gStageReadyAt?.wing ?? 0),
                    sweepbeam: gameTime >= (enemy.gStageReadyAt?.sweepbeam ?? 0),
                    // v0.25.3046(社長報告「バンバンバンってなる技、出ないんだけど?」の真因): v2939で
                    // stage-5固有技を wing→trishot に改名した際、このready表へキーを足し忘れていた。
                    // stageReady['trishot']がundefined→`?? false`で**恒久的に候補落ち**=一度も出ていなかった。
                    trishot: gameTime >= (enemy.gStageReadyAt?.trishot ?? 0),
                  };
                  const queued = enemy.bossScriptQueue?.[0];
                  const move = (queued as GiantMove | GiantStageMoveId | undefined) ?? pickGiantMoveWithStage(stageId, dist, phase, ready, stageReady);
                  if (move) {
                    const isStageMove = GIANT_STAGE_UNIQUE_MOVE[stageId] === move || GIANT_STAGE_ULT_MOVE[stageId] === move;
                    return {
                      ...enemy, ...phaseFields, vx: 0, vy: 0,
                      bossScriptQueue: queued ? (enemy.bossScriptQueue ?? []).slice(1) : planBossChoreography('giant', move, phase).slice(1),
                      ...(isStageMove ? beginGiantStageMove(move as GiantStageMoveId) : beginGiantMove(move as GiantMove)),
                    };
                  }
                } else if (glenScriptApplies(enemy.isStoryBoss, enemy.storyBossVariant, GLEN_SCRIPT_ENABLED)) {
                  // M67(§6.26-12): stage-7のグレンだけ(glenScriptAppliesが門番=通常城ボス/ex1は
                  // 絶対にここへ来ない)。既存5技(pickGiantMove/beginGiantMove)+専用4技の統合抽選。
                  // v0.25.3029(社長裁定1い): グレン専用の大技(虚無の三唱nihil/三連跳びtrijump)は
                  // **第二形態(glenForm===2)専属**。形態1は城ボス標準技+爪痕系(talon/boon/reach)まで
                  // =ready恒偽で抽選候補から外す(抽選ロジック自体は不変)。
                  const glenBigMoves = enemy.glenForm === 2;
                  const glenReady: Record<GlenMoveId, boolean> = {
                    talon: gameTime >= (enemy.gGlenReadyAt?.talon ?? 0),
                    boon: gameTime >= (enemy.gGlenReadyAt?.boon ?? 0),
                    // v0.25.3033(社長指示「通常弾の3連発の後にのみ触手攻撃。それ以外では出さない」):
                    // reach(触手)は抽選プールから恒久除外。発動経路はg-bolt-burst終端の台本予約のみ。
                    reach: false,
                    nihil: glenBigMoves && gameTime >= (enemy.gGlenReadyAt?.nihil ?? 0),
                    trijump: glenBigMoves && gameTime >= (enemy.gGlenReadyAt?.trijump ?? 0),
                    // v0.25.3139: 尻尾の叩きつけは**第二形態の通常技**(尻尾が生えている形態でしか成立しない)。
                    tailslam: glenBigMoves && gameTime >= (enemy.gGlenReadyAt?.tailslam ?? 0),
                  };
                  const queued = enemy.bossScriptQueue?.[0];
                  const move = (queued as GiantMove | GlenMoveId | undefined) ?? pickGiantMoveWithGlen(dist, phase, ready, glenReady);
                  if (move) {
                    // ★手書きの or 連鎖にしないこと(v0.25.3140の実バグ): tailslam を足した時に
                    // ここだけ書き忘れ、**抽選では当たっているのに beginGiantMove 側へ流れて握り潰され**、
                    // 「新技が一度も出ない」になった。判定は台帳(GLEN_MOVES)から導出する。
                    const isGlenMove = isGlenMoveId(move);
                    return {
                      ...enemy, ...phaseFields, vx: 0, vy: 0,
                      bossScriptQueue: queued ? (enemy.bossScriptQueue ?? []).slice(1) : planBossChoreography('glen', move, phase, { glenBigMoves }).slice(1),
                      ...(isGlenMove ? beginGlenMove(move as GlenMoveId) : beginGiantMove(move as GiantMove)),
                    };
                  }
                } else {
                  const queued = enemy.bossScriptQueue?.[0];
                  const move = (queued as GiantMove | undefined) ?? pickGiantMove(dist, phase, ready);
                  if (move) {
                    return {
                      ...enemy, ...phaseFields, vx: 0, vy: 0,
                      bossScriptQueue: queued ? (enemy.bossScriptQueue ?? []).slice(1) : planBossChoreography('giant', move, phase).slice(1),
                      ...beginGiantMove(move),
                    };
                  }
                }
              }
              // 何も抽選されなければ、フェーズ情報だけ更新してフォールスルー(通常チェイスへ・下の
              // isDashType/パンプキン型/旧スケジューラは phase文字列が一致せず無視されるので実質無害)。
              enemy = { ...enemy, ...phaseFields };
            }
          }
        }

        // ダッシュ(突進)AI: 溜め中に「赤ライン」で移動先(直線距離)を予告→確定した狙い点へ3倍速で直進(曲がらない)。
        // 犬型(werewolf)・研究所Lv2(lab-zombie-2)・ジャイアントバット共通。狙い点は溜め開始時に確定(=赤ラインの終点)。
        // 発動トリガーは werewolf/lab-zombie-2 は射程ベース、giantbat は専用スケジューラ(下)が起動する。
        const isDashType = enemy.type === 'werewolf' || enemy.type === 'lab-zombie-2' || enemy.type === 'giantbat' || enemy.type === 'hunter';
        if (isDashType) {
          const ecx = enemy.x + enemy.width / 2;
          const ecy = enemy.y + enemy.height / 2;
          const dist = Math.hypot(pcx - ecx, pcy - ecy);
          // ★社長指示2026-08-26「自転車、着地後1秒硬直」: 突進明けの硬直中はその場で停止(移動もチェイスもしない)。
          if (enemy.aiPhase === 'dash-recover') {
            if (gameTime >= (enemy.aiPhaseUntil ?? 0)) return { ...enemy, vx: 0, vy: 0, aiPhase: undefined };
            return { ...enemy, vx: 0, vy: 0 };
          }
          // 突進明けの遷移: werewolf本種のみ硬直(dash-recover)へ。他の犬型は従来どおり即チェイス復帰。
          const dashEndPatch: Partial<Enemy> = enemy.type === 'werewolf'
            ? { aiPhase: 'dash-recover', aiPhaseUntil: atkUntil(WEREWOLF_DASH_RECOVER_MS), aiStartedAt: gameTime }
            : { aiPhase: undefined };
          if (enemy.aiPhase === 'charge') {
            const tx = enemy.aiTargetX ?? pcx;
            const ty = enemy.aiTargetY ?? pcy;
            const cdx = tx - ecx, cdy = ty - ecy;
            const cdist = Math.hypot(cdx, cdy);
            if (cdist < 12 || gameTime >= (enemy.aiPhaseUntil ?? 0)) {
              return { ...enemy, vx: 0, vy: 0, ...dashEndPatch, aiReadyAt: atkCdUntil(WEREWOLF_COOLDOWN_MS + werewolfExtraCd(enemy.type)) };
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
            const cs = dashBase * WEREWOLF_CHARGE_SPEED_MULT * (enemy.type === 'hunter' ? HUNTER_DASH_SPEED_MULT : 1); // 3倍速(ハンターは更に×5・v0.25.2429)・ほぼ直進+弱ホーミング
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
              return { ...enemy, x: moved.x, y: moved.y, vx: 0, vy: 0, ...dashEndPatch, aiReadyAt: atkCdUntil(WEREWOLF_COOLDOWN_MS + werewolfExtraCd(enemy.type)) };
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
            // v0.25.3076(社長指示「滑空って全てのジャンプね」): 汎用ジャンプ(パンプキン/ハンター/
            // ラボゾンビ3)も同じ曲線で運ぶ。着地時刻・着地点・爆発判定はすべて不変。
            const gEs = airHopEase01(t);
            const nx = fx + (tx - fx) * gEs;
            const ny = fy + (ty - fy) * gEs;
            // 盾にぶつかったらジャンプ攻撃をキャンセルして、その場に落ちるだけ(爆発なし)。
            // 接触点を shieldBlocks に積んで、useGameLoop 側で衝突FX+SE を出す。描画は drawEnemy が
            // 空中→着地のホップ高を滑らかに 0 まで補間して「シームレスに落ちる」よう見せる(描画のみ)。
            if (shieldRects.length > 0 &&
                shieldRects.some(s => rectsOverlap({ x: nx, y: ny, width: enemy.width, height: enemy.height }, s))) {
              shieldBlocks.push({ x: nx + enemy.width / 2, y: ny + enemy.height / 2, kind: 'jump' });
              return { ...enemy, x: nx, y: ny, vx: 0, vy: 0, aiPhase: 'recover', aiStartedAt: gameTime, aiPhaseUntil: atkUntil(pumpkinRecoverMs(enemy.type)) };
            }
            if (t >= 1) {
              pumpkinLanded = true; // 着地 → set 後に画面揺れ
              // 着地爆発(範囲狭め)。被弾判定/FX は useGameLoop が pumpkinBlasts を消化して行う。
              pumpkinBlasts.push({ x: tx + enemy.width / 2, y: ty + enemy.height / 2, radius: PUMPKIN_EXPLOSION_RADIUS, damage: enemy.damage, enemyId: enemy.id });
              return { ...enemy, x: tx, y: ty, vx: 0, vy: 0, aiPhase: 'recover', aiPhaseUntil: atkUntil(pumpkinRecoverMs(enemy.type)) };
            }
            return { ...enemy, x: nx, y: ny, vx: 0, vy: 0 }; // 空中は障害物を飛び越える(衝突無視)
          }
          if (enemy.aiPhase === 'recover') {
            if (gameTime >= (enemy.aiPhaseUntil ?? 0)) {
              return { ...enemy, vx: 0, vy: 0, aiPhase: undefined, aiReadyAt: atkCdUntil(PUMPKIN_COOLDOWN_MS) };
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
        // M51: GIANT_SCRIPT_ENABLED(既定)の間、giantbat は上の新スクリプトブロックが毎フレーム必ず
        // return するのでここへは到達しない。`?giantscript=0` の時だけ giantbat もこの旧経路に戻る
        // (hunter は常にこの旧経路のまま=無改変)。
        if ((enemy.type === 'hunter' || (enemy.type === 'giantbat' && !GIANT_SCRIPT_ENABLED)) && !enemy.aiPhase) {
          // 出現直後は少し待ってから行動(即突進しない)。初回だけ初期CDをセット。
          if (enemy.gbDashReadyAt === undefined) {
            return { ...enemy, vx: 0, vy: 0, gbDashReadyAt: atkUntil(2000), gbJumpReadyAt: atkUntil(3500) };
          }
          const ecx = enemy.x + enemy.width / 2, ecy = enemy.y + enemy.height / 2;
          const dist = Math.hypot(pcx - ecx, pcy - ecy);
          const opts: ('dash' | 'jump')[] = [];
          // ダッシュ発動距離: ハンターは HUNTER_DASH_RANGE(=1300・社長裁定v0.25.2429(a))、他は従来1000。
          const dashRange = enemy.type === 'hunter' ? HUNTER_DASH_RANGE : 1000;
          if (gameTime >= (enemy.gbDashReadyAt ?? 0) && dist > 80 && dist < dashRange) opts.push('dash');
          // ジャンプ発動距離: ハンターは HUNTER_JUMP_RANGE(=500・社長指示)、他(giantbat)は従来700。
          const jumpRange = enemy.type === 'hunter' ? HUNTER_JUMP_RANGE : 700;
          if (gameTime >= (enemy.gbJumpReadyAt ?? 0) && dist > 40 && dist < jumpRange) opts.push('jump');
          if (opts.length > 0) {
            const pick = opts[Math.floor(Math.random() * opts.length)];
            const jitter = (ms: number) => ms * (0.8 + Math.random() * 0.4);
            if (pick === 'dash') {
              // 突進距離を2倍に(giantbat も同様にオーバーシュート)。
              // ダッシュ頻度を抑える(社長指示): 通常CD(±20%)にランダム追加CD(3〜10秒)を上乗せ=犬と同様。
              return { ...enemy, aiPhase: 'windup', aiPhaseUntil: atkUntil(WEREWOLF_WINDUP_MS), aiFromX: enemy.x, aiFromY: enemy.y, aiTargetX: 2 * pcx - (enemy.x + enemy.width / 2), aiTargetY: 2 * pcy - (enemy.y + enemy.height / 2), vx: 0, vy: 0, gbDashReadyAt: atkCdUntil(jitter(GIANTBAT_DASH_CD_MS) + (WEREWOLF_EXTRA_CD_MIN_MS + Math.random() * (WEREWOLF_EXTRA_CD_MAX_MS - WEREWOLF_EXTRA_CD_MIN_MS))) };
            }
            return { ...enemy, aiPhase: 'crouch', aiPhaseUntil: atkUntil(PUMPKIN_CROUCH_MS), vx: 0, vy: 0, gbJumpReadyAt: atkCdUntil(jitter(GIANTBAT_JUMP_CD_MS)) };
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
        // シーカー: プレイヤー半透明中は敵から狙われない(社長裁定v0.25.3268「シーカーはボスも対象」
        // =旧・ボス除外を撤去。ボスの技の照準・台本は各コントローラ側の判定=ここはチェイス/射撃の的のみ)。
        const playerHidden = isSeekerActive(player, gameTime);
        let tgt = resolveEnemyTarget(enemy, player, targetSummons, ALCHEMY_AGGRO_RANGE, playerHidden, gameTime); // v0.25.2490: 雑魚ヘイトのラッチ判定にgameTimeを渡す
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

        // ★噛みつきの踏み込み(社長裁定2026-08-25「30PX移動してくる」)。台本の間は通常の接近を止め、
        // **発火時に焼いた起点+向き**へ `biteLungeFrac`(溜めでじわり→噛みで伸び切る=慣性)で進む。
        // 追尾しない=横へ避けられる。壁(すり抜け防止)はこの間だけ開いている(上の movePlayer 側)。
        // ★技を出している敵のAIは**絶対に乗っ取らない**(v0.25.3924)。乗っ取ると着地爆発や
        // 踏み鳴らしの円(pumpkinBlasts への push)がこのフレームで実行されず、円の判定が消える。
        if (isBiteSubject(enemy, isBiteExemptType) && bitePhaseOf(enemy, gameTime) !== 'none'
          && !isBiteInterruptedByMove(enemy)) {
          // ★踏み込みは**相対移動**で書く(v0.25.3923・社長報告「一発で画面外に出ようとしている
          // みたいな警告が出る」「近接何回か振ってるとすごい吹っ飛ぶ」)。
          // ★真因: 旧実装は「発火時に焼いた起点 + 進捗」を**絶対座標で毎フレーム書いて**いた。
          // 敵の位置は**他の系も書く**(ノックバック/リーシュ/ボスの状態機械/イベントの再配置)ので、
          // 絶対座標で上書きすると**それらと殴り合い、片方の書き込み量がそのまま飛距離になる**。
          // 相対(このフレームぶんの増分だけ足す)にすれば、他の系と自然に合成されて暴れない。
          const lp = biteSpecFor(enemy.type).lungePx;
          const fNow = biteLungeFrac(enemy, gameTime);
          const fPrev = biteLungeFrac(enemy, gameTime - deltaTime * 1000);
          const step = lp * Math.max(0, fNow - fPrev);   // このフレームで進むぶんだけ
          const bmoved = resolveMove(
            enemy.x + (enemy.biteDirX ?? 0) * step,
            enemy.y + (enemy.biteDirY ?? 0) * step,
          );
          return { ...enemy, vx: 0, vy: 0, x: bmoved.x, y: bmoved.y };
        }

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
          // v0.25.3176(案4+案3): 個体差(±12%)と役割(直進/回り込み/遅れて来る)をゾンビにも掛ける。
          // フラフラ(既存)は**この上に**乗るので、蛇行の意図は変わらない。
          const zTraits = chaffTraits(enemy.id);
          const zSpeed = enemy.speed * ZOMBIE_SPEED_MULT * (phase === 'zrush' ? ZOMBIE_RUSH_SPEED_MULT : 1)
            * rnSpeedMult * screamSpeedMult * chaffSpeedMult(zTraits, distance) * iceSlowMult(enemy, gameTime);
          // フラフラ: 進行方向に直交する成分を時間で揺らす(個体ごとに位相をずらす)。
          let h = 0;
          for (let i = 0; i < enemy.id.length; i++) h = (h * 31 + enemy.id.charCodeAt(i)) | 0;
          const zHead = chaffHeading(dx / distance, dy / distance, zTraits, distance);
          const ux = zHead.x, uy = zHead.y;
          const wob = Math.sin(gameTime / 200 + (h % 628) / 100) * ZOMBIE_WOBBLE;
          const hx = ux + (-uy) * wob, hy = uy + ux * wob;
          const hl = Math.max(0.001, Math.hypot(hx, hy));
          const zvx = (hx / hl) * zSpeed, zvy = (hy / hl) * zSpeed;
          const zmoved = resolveMove(enemy.x + zvx * deltaTime, enemy.y + zvy * deltaTime);
          return { ...enemy, vx: zvx, vy: zvy, x: zmoved.x, y: zmoved.y, aiPhase: phase, aiPhaseUntil: phaseUntil };
        }

        // ボスのクリ半減(v0.25.2422)。ボス以外・非半減中は1なので通常敵の速度は完全に不変。
        const speed = (enemy.type === 'plant' ? enemy.speed * 0.25 : enemy.speed) * rnSpeedMult * screamSpeedMult
          * bossSlowMult(enemy, gameTime) * iceSlowMult(enemy, gameTime);
        let tvx = (dx / distance) * speed;
        let tvy = (dy / distance) * speed;
        // ★v0.25.3176(社長指示「雑魚敵の動きが単調」・案4+案3): チャフ(=ここを通るのは bat/skeleton。
        // zombie は上で早期returnしている)に**個体差**と**役割**を掛ける。役割は追尾の向きと速さを
        // 曲げるだけ=ターゲット選択・攻撃・判定は不変。回り込みの角度は距離とともに0へ収束する。
        if (isChaffType(enemy.type)) {
          const traits = chaffTraits(enemy.id);
          const head = chaffHeading(dx / distance, dy / distance, traits, distance);
          const chaffSpeed = speed * chaffSpeedMult(traits, distance);
          tvx = head.x * chaffSpeed;
          tvy = head.y * chaffSpeed;
        }
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
          // 洋館通路(corridorMode)は産卵しない(v0.25.2145・社長指示「緑卵も出現しないで」の保険。
          // 湧きプールからghost自体を外しているが、featured/forced経路で万一出ても卵は撒かせない)。
          if (!MINES_DISABLED && !state.corridorMode && gameTime >= nextLay) { // ?mine=0 診断: 抱卵型は卵を撒かない(通常敵として動くだけ)
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

        // PACING_PUZZLE.md §9-4(削岩型・driller): カイト(接近/後退/構え)+突き(ヤリ攻撃)+近接被弾での離脱。
        // 優先順(§9-8③・検収監査#2#3で確定): 気絶/浮き(手前のstunUntil/liftUntil早期return) >
        // 突きの**進行中**3州(ノックバックで中断しない=変位のみ重畳。※拘束(root)は v0.25.2421の
        // 一般則「aiPhase中はroot無効」により**3州中は効かない**——全敵共通の既存則をそのまま踏襲) >
        // 離脱(retreat・**新規の突き発動より優先**=「殴ったら離れる」が「殴ったら反撃」に化けないため) >
        // 突きの新規発動 > 通常移動(接近/後退/構え)。
        if (enemy.type === 'driller') {
          const ecx = enemy.x + enemy.width / 2, ecy = enemy.y + enemy.height / 2;
          // 検収監査#4(CLAUDE.mdの上下副作用チェック): 離れるAIは地平線の上(透明化ゾーン)や帯の外へ
          // 出やすい(隣のresolveMoveコメント「パンプキンが円の外=地平線の上へ出て見えなくなる」と同型)。
          // プレイヤーと同じ「行ける帯」の定義(clampRectToPlayableArea)で移動先をクランプする。
          const drillerClampMove = (mx: number, my: number): { x: number; y: number } => {
            const moved = resolveMove(mx, my);
            const ctx: PlayableAreaCtx = {
              farBackdrop: state.farBackdrop, labTheme,
              corridorMode: state.corridorMode,
              m0AdvanceLimitX: state.m0AdvanceLimitX,
              corridorRunInActive: state.corridorRunInActive,
            };
            return clampRectToPlayableArea(moved.x, moved.y, enemy.width, enemy.height, ctx, enemy.x);
          };
          // 突き3州: 進行中はここで完結させる(間合い/離脱の判定より優先)。
          if (enemy.aiPhase === 'driller-thrust-windup') {
            if (gameTime >= (enemy.aiPhaseUntil ?? 0)) {
              const tfx = enemy.aiFromX ?? ecx, tfy = enemy.aiFromY ?? ecy;
              const ttx = enemy.aiTargetX ?? ecx, tty = enemy.aiTargetY ?? ecy;
              // 分類①(危険を伝える絵)=判定と厳密一致。帯(pixiScene)と同寸(長さ200×半幅12)のカプセルを
              // activeへ移る瞬間に1回だけ積む(g-bite/g-slam等と同じ「windup末尾で1回積む」型)。
              pumpkinBlasts.push({
                x: (tfx + ttx) / 2, y: (tfy + tty) / 2, radius: DRILLER_THRUST_HALF_WIDTH,
                damage: enemy.damage, enemyId: enemy.id, moveKey: 'driller-thrust',
                capsule: { fx: tfx, fy: tfy, tx: ttx, ty: tty, halfWidth: DRILLER_THRUST_HALF_WIDTH },
              });
              drillerThrustFired = true; // post-set SE(thor-thrust)
              return { ...enemy, vx: 0, vy: 0, aiPhase: 'driller-thrust-active', aiPhaseUntil: atkUntil(DRILLER_THRUST_ACTIVE_MS) };
            }
            return { ...enemy, vx: 0, vy: 0 };
          }
          if (enemy.aiPhase === 'driller-thrust-active') {
            if (gameTime >= (enemy.aiPhaseUntil ?? 0)) {
              return { ...enemy, vx: 0, vy: 0, aiPhase: 'driller-thrust-recover', aiPhaseUntil: atkUntil(DRILLER_THRUST_RECOVER_MS) };
            }
            return { ...enemy, vx: 0, vy: 0 };
          }
          if (enemy.aiPhase === 'driller-thrust-recover') {
            if (gameTime >= (enemy.aiPhaseUntil ?? 0)) {
              return { ...enemy, vx: 0, vy: 0, aiPhase: undefined, aiPhaseUntil: 0, aiReadyAt: atkUntil(DRILLER_THRUST_CD_MS) };
            }
            return { ...enemy, vx: 0, vy: 0 };
          }
          // 発動判定(§9-4)は常にプレイヤー基準の距離で見る(社長の言葉「プレイヤーへ...ヤリ攻撃を
          // してくる」・離脱もプレイヤーの近接打撃が起点=どちらもtgt(召喚誘引)ではなくpcx/pcyで判定)。
          const pDx = pcx - ecx, pDy = pcy - ecy;
          const pDist = Math.hypot(pDx, pDy);
          // ★離脱は**新規の突き発動より先**に判定する(検収監査#2)。旧順序だと「近接で殴られた瞬間は
          // 必ず200px以内=CD明けなら突きを開始→1320msその場に静止」で、社長ゴール「1.5倍速で2秒間
          // 距離を離す」が実質1/3に削れていた(体験が「殴ったら反撃してくる」に化ける)。
          if (isDrillerRetreating(enemy.drillerRetreatUntil, gameTime)) {
            const rl = Math.max(0.001, pDist);
            const rtvx = -(pDx / rl) * speed * DRILLER_RETREAT_SPEED_MULT;
            const rtvy = -(pDy / rl) * speed * DRILLER_RETREAT_SPEED_MULT;
            const ra = inertiaAlpha(deltaTime, inertiaTauForSpeed(speed));
            const rvx = (enemy.vx ?? rtvx) + (rtvx - (enemy.vx ?? rtvx)) * ra;
            const rvy = (enemy.vy ?? rtvy) + (rtvy - (enemy.vy ?? rtvy)) * ra;
            const rmoved = drillerClampMove(enemy.x + rvx * deltaTime, enemy.y + rvy * deltaTime);
            return { ...enemy, vx: rvx, vy: rvy, x: rmoved.x, y: rmoved.y };
          }
          if (drillerCanThrust(pDist) && gameTime >= (enemy.aiReadyAt ?? 0)) {
            const pl = Math.max(0.001, pDist);
            const pux = pDx / pl, puy = pDy / pl;
            return {
              ...enemy, vx: 0, vy: 0,
              aiPhase: 'driller-thrust-windup', aiPhaseUntil: atkUntil(DRILLER_THRUST_WINDUP_MS),
              aiFromX: ecx, aiFromY: ecy,
              aiTargetX: ecx + pux * DRILLER_THRUST_LENGTH, aiTargetY: ecy + puy * DRILLER_THRUST_LENGTH,
            };
          }
          // 通常時: 間合い3分岐(接近/後退/構え)。移動対象は他の型と同じ tgt(召喚誘引込み)基準の
          // dx/dy/distance を使う(既存モブ移動の経路に乗せる=座標書き換えの新設をしない)。
          const zone = drillerZoneFor(distance);
          let dtvx = 0, dtvy = 0;
          if (zone === 'approach') { dtvx = (dx / distance) * speed; dtvy = (dy / distance) * speed; }
          else if (zone === 'backoff') { dtvx = -(dx / distance) * speed; dtvy = -(dy / distance) * speed; }
          const da = inertiaAlpha(deltaTime, inertiaTauForSpeed(speed));
          const dvx = (enemy.vx ?? dtvx) + (dtvx - (enemy.vx ?? dtvx)) * da;
          const dvy = (enemy.vy ?? dtvy) + (dtvy - (enemy.vy ?? dtvy)) * da;
          const dmoved = drillerClampMove(enemy.x + dvx * deltaTime, enemy.y + dvy * deltaTime);
          return { ...enemy, vx: dvx, vy: dvy, x: dmoved.x, y: dmoved.y };
        }

        // PACING_PUZZLE.md §14-2(降格死神・伐採人=logger): §9(削岩型)の写し+差分4点。土台(優先順・
        // clampRectToPlayableArea経由の移動・retreatが新規発動より優先等)はdrillerブロックと完全に同じ。
        // 差分は②間合い(110〜150px)③薙ぎ払い(帯の長軸がプレイヤー方向と直交)④予告尺(850ms)のみ。
        if (enemy.type === 'logger') {
          const ecx = enemy.x + enemy.width / 2, ecy = enemy.y + enemy.height / 2;
          // driller版と同じ理由(検収監査#4=CLAUDE.md上下副作用チェック)で行ける帯にクランプする。
          const loggerClampMove = (mx: number, my: number): { x: number; y: number } => {
            const moved = resolveMove(mx, my);
            const ctx: PlayableAreaCtx = {
              farBackdrop: state.farBackdrop, labTheme,
              corridorMode: state.corridorMode,
              m0AdvanceLimitX: state.m0AdvanceLimitX,
              corridorRunInActive: state.corridorRunInActive,
            };
            return clampRectToPlayableArea(moved.x, moved.y, enemy.width, enemy.height, ctx, enemy.x);
          };
          // 薙ぎ払い3州: 進行中はここで完結させる(間合い/離脱の判定より優先。driller-thrustと同じ型)。
          if (enemy.aiPhase === 'logger-sweep-windup') {
            if (gameTime >= (enemy.aiPhaseUntil ?? 0)) {
              const sfx = enemy.aiFromX ?? ecx, sfy = enemy.aiFromY ?? ecy;
              const stx = enemy.aiTargetX ?? ecx, sty = enemy.aiTargetY ?? ecy;
              // 分類①(危険を伝える絵)=判定と厳密一致。帯(pixiScene)と同寸(長さ220×半幅26)のカプセルを
              // activeへ移る瞬間に1回だけ積む(driller-thrust/g-bite/g-slamと同じ「windup末尾で1回積む」型)。
              pumpkinBlasts.push({
                x: (sfx + stx) / 2, y: (sfy + sty) / 2, radius: LOGGER_SWEEP_HALF_WIDTH,
                damage: enemy.damage, enemyId: enemy.id, moveKey: 'logger-sweep',
                capsule: { fx: sfx, fy: sfy, tx: stx, ty: sty, halfWidth: LOGGER_SWEEP_HALF_WIDTH },
              });
              loggerSweepFired = true; // post-set SE(thor-thrust=driller同系流用・§14-2④)
              return { ...enemy, vx: 0, vy: 0, aiPhase: 'logger-sweep-active', aiPhaseUntil: atkUntil(LOGGER_SWEEP_ACTIVE_MS) };
            }
            return { ...enemy, vx: 0, vy: 0 };
          }
          if (enemy.aiPhase === 'logger-sweep-active') {
            if (gameTime >= (enemy.aiPhaseUntil ?? 0)) {
              return { ...enemy, vx: 0, vy: 0, aiPhase: 'logger-sweep-recover', aiPhaseUntil: atkUntil(LOGGER_SWEEP_RECOVER_MS) };
            }
            return { ...enemy, vx: 0, vy: 0 };
          }
          if (enemy.aiPhase === 'logger-sweep-recover') {
            if (gameTime >= (enemy.aiPhaseUntil ?? 0)) {
              return { ...enemy, vx: 0, vy: 0, aiPhase: undefined, aiPhaseUntil: 0, aiReadyAt: atkUntil(LOGGER_SWEEP_CD_MS) };
            }
            return { ...enemy, vx: 0, vy: 0 };
          }
          // 発動判定は常にプレイヤー基準の距離で見る(driller-thrustと同じ理由=§9-4踏襲)。
          const pDx = pcx - ecx, pDy = pcy - ecy;
          const pDist = Math.hypot(pDx, pDy);
          // 離脱は新規の薙ぎ払い発動より先に判定する(driller版の検収監査#2をそのまま踏襲)。
          if (isDrillerRetreating(enemy.drillerRetreatUntil, gameTime)) {
            const rl = Math.max(0.001, pDist);
            const rtvx = -(pDx / rl) * speed * DRILLER_RETREAT_SPEED_MULT;
            const rtvy = -(pDy / rl) * speed * DRILLER_RETREAT_SPEED_MULT;
            const ra = inertiaAlpha(deltaTime, inertiaTauForSpeed(speed));
            const rvx = (enemy.vx ?? rtvx) + (rtvx - (enemy.vx ?? rtvx)) * ra;
            const rvy = (enemy.vy ?? rtvy) + (rtvy - (enemy.vy ?? rtvy)) * ra;
            const rmoved = loggerClampMove(enemy.x + rvx * deltaTime, enemy.y + rvy * deltaTime);
            return { ...enemy, vx: rvx, vy: rvy, x: rmoved.x, y: rmoved.y };
          }
          if (loggerCanSweep(pDist) && gameTime >= (enemy.aiReadyAt ?? 0)) {
            const pl = Math.max(0.001, pDist);
            const pux = pDx / pl, puy = pDy / pl;
            // §14-2②: 帯の長軸はプレイヤー方向と直交する(突きの型=同軸とは違う)。純関数化した
            // loggerSweepBand で両端を求め、そのままaiFrom/aiTargetへロックする(driller-thrustは
            // aiFrom=自分中心/aiTarget=突き先端だったが、loggerは帯の両端そのものを持たせる=
            // pixiSceneはdriller-thrustと同じ「aiFrom→aiTargetを結ぶ帯」を描くだけで済む)。
            const band = loggerSweepBand(ecx, ecy, pux, puy, LOGGER_SWEEP_FORWARD_OFFSET, LOGGER_SWEEP_LENGTH / 2);
            return {
              ...enemy, vx: 0, vy: 0,
              aiPhase: 'logger-sweep-windup', aiPhaseUntil: atkUntil(LOGGER_SWEEP_WINDUP_MS),
              aiFromX: band.fx, aiFromY: band.fy,
              aiTargetX: band.tx, aiTargetY: band.ty,
            };
          }
          // 通常時: 間合い3分岐(接近/後退/構え)。driller-thrustと同じくtgt(召喚誘引込み)基準の
          // dx/dy/distanceを使う(既存モブ移動の経路に乗せる=座標書き換えの新設をしない)。
          const zone = loggerZoneFor(distance);
          let ltvx = 0, ltvy = 0;
          if (zone === 'approach') { ltvx = (dx / distance) * speed; ltvy = (dy / distance) * speed; }
          else if (zone === 'backoff') { ltvx = -(dx / distance) * speed; ltvy = -(dy / distance) * speed; }
          const la = inertiaAlpha(deltaTime, inertiaTauForSpeed(speed));
          const lvx = (enemy.vx ?? ltvx) + (ltvx - (enemy.vx ?? ltvx)) * la;
          const lvy = (enemy.vy ?? ltvy) + (ltvy - (enemy.vy ?? ltvy)) * la;
          const lmoved = loggerClampMove(enemy.x + lvx * deltaTime, enemy.y + lvy * deltaTime);
          return { ...enemy, vx: lvx, vy: lvy, x: lmoved.x, y: lmoved.y };
        }

        // PACING_PUZZLE.md §14-4(補修バッチA-1・二重駆動の解消): 死神本体(isTerminalReaper)/
        // 使者(isHangedman)は専用ムーバ(useGameLoop.ts・stepReaperBody/使者の直進)が毎フレーム
        // 座標を直接書く。ここより手前(KB適用ブロック・isHiddenBoss等の早期return・liftUntil/
        // stunUntilの判定枝・dormant/leash等)は**素通しのまま**にし、ここでは「歩いて追う」汎用
        // チェイス(この下の既定コード=速度計算+慣性+resolveMove)だけをスキップする。
        // ★実測(検収監査): この早期returnが無いと、専用ムーバが書いた座標をこの下の汎用チェイスが
        // 同じフレームでさらに追加移動させ、本体は仕様の約2倍速・使者は約2.4倍速で寄っていた
        // (70px旋回が密着高速回転に化ける/詠唱静止・体勢崩れ停止が効かない、の全ての元凶)。
        if (isTerminalReaper(enemy) || isHangedman(enemy.type)) return enemy;

        // v0.25.3176(案4): 曲がる速さ(慣性tau)にも個体差を入れる。チャフの既存tauは0.30〜0.41sなので
        // ×0.75〜1.60 = **0.22〜0.65s** の幅になる=同じ型でも曲がり方が揃わない(壁で来なくなる)。
        const alpha = inertiaAlpha(deltaTime, inertiaTauForSpeed(speed)
          * (isChaffType(enemy.type) ? chaffTraits(enemy.id).turnTauMult : 1));
        const vx = (enemy.vx ?? tvx) + (tvx - (enemy.vx ?? tvx)) * alpha;
        const vy = (enemy.vy ?? tvy) + (tvy - (enemy.vy ?? tvy)) * alpha;

        // ★障害物にぶつかったら適当に避けて通る(社長指示v0.25.2415・「綿密に組まなくていい」)。
        // 進めない → 横へ避ける → そっちも駄目なら反対側 → それでも駄目なら諦めて突っ込み続ける。
        // 判定は純関数 stepAvoid(src/utils/enemyMotion.ts・テスト済み)。ここは配線だけ。
        // 追加コストは「詰まっている敵だけ resolveMove をもう1回」=通常時は完全に無料。
        const wantX = enemy.x + vx * deltaTime, wantY = enemy.y + vy * deltaTime;
        const moved0 = resolveMove(wantX, wantY);
        const sp0 = Math.hypot(vx, vy);
        const av = stepAvoid(enemy.avoid ?? createAvoidState(), {
          dtMs: deltaTime * 1000,
          wantDist: Math.hypot(wantX - enemy.x, wantY - enemy.y),
          movedDist: Math.hypot(moved0.x - enemy.x, moved0.y - enemy.y),
          dirX: sp0 > 0.001 ? vx / sp0 : 0,
          dirY: sp0 > 0.001 ? vy / sp0 : 0,
          rand: Math.random(),
        });
        const moved = av.state.dir !== 0
          ? resolveMove(enemy.x + av.moveX * sp0 * deltaTime, enemy.y + av.moveY * sp0 * deltaTime)
          : moved0;

        return { ...enemy, vx, vy, x: moved.x, y: moved.y, avoid: av.state };
      });

      // スキル: パニッシャー = ノックバック中の敵が他の敵に当たると巻き込む(同方向へ2倍ノックバック＋近接ダメージの半分)。
      // ただし「巻き込まれて」飛んだ敵(punisherHopped)は movers から除外=連鎖しない(1次まで・社長指示)。
      let finalEnemies = updatedEnemies;
      const punisherLv = skillLevel(player, 'punisher');
      // 社長指示v0.25.3300 ボムカウンター覚醒: 爆発で飛ばされた敵(bombPunishUntil)はパニッシャー未所持
      // でも1段だけ巻き込み元になる。二拍目(pending)の消化があるのでフラグ失効後も発火待ちが残る間は回す。
      const bombPunishActive = updatedEnemies.some(e =>
        (e.bombPunishUntil !== undefined && now < e.bombPunishUntil) || e.punisherPendingAt !== undefined);
      if (punisherLv || bombPunishActive) {
        const melee = player.weapons.find(w => w.isMelee);
        const punisherDmgMult = [0.5, 0.5, 0.7, 0.9][punisherLv]; // 未所持(ボムカウンター覚醒経由)はLv1相当の50%
        punisherDmg = Math.max(1, Math.round((melee?.damage ?? 6) * strikerMeleeMult(player) * punisherDmgMult));
        // 二拍目の発火(v0.25.3299): 一拍の遅延を消化した被害者へ、ダメージ(punisherHits)+
        // 継承ノックバックを適用する。
        // 社長指示v0.25.3300「覚醒(Lv3)すると2連まで巻き込める」: 巻き込まれて飛んだ敵(深度1)も、
        // 覚醒中はもう一度だけ巻き込み元になれる(深度2まで)。Lv1/2は従来どおり1次まで。
        const punisherChainMax = punisherLv >= 3 ? 2 : 1;
        let punisherBase = updatedEnemies;
        const punisherArmed = punisherBase.some(e => e.punisherPendingAt !== undefined && now >= e.punisherPendingAt);
        if (punisherArmed) {
          punisherBase = punisherBase.map(e => {
            if (e.punisherPendingAt === undefined || now < e.punisherPendingAt) return e;
            punisherHits.push(e.id);
            return {
              ...e,
              punisherPendingAt: undefined, punisherPendingVx: undefined, punisherPendingVy: undefined,
              knockbackVx: e.punisherPendingVx ?? 0,
              knockbackVy: e.punisherPendingVy ?? 0,
              knockbackUntil: now + KNOCKBACK_DURATION,
            };
          });
        }
        const movers = punisherBase.filter(e =>
          e.knockbackUntil !== undefined && now < e.knockbackUntil &&
          // パニッシャー未所持時はボムカウンター覚醒で飛ばされた敵(bombPunishUntil)だけが元になれる(1段)。
          (punisherLv > 0 || (e.bombPunishUntil !== undefined && now < e.bombPunishUntil)) &&
          (e.punisherHopDepth ?? 0) < punisherChainMax && // 覚醒=深度1(巻き込まれた敵)も1回だけ元になれる
          e.punisherPendingAt === undefined && // 一拍目のフリーズ中は元にならない(発火後の飛行中のみ)
          Math.hypot(e.knockbackVx ?? 0, e.knockbackVy ?? 0) > 30);
        finalEnemies = punisherBase.map(b => {
          const bKbActive = b.knockbackUntil !== undefined && now < b.knockbackUntil;
          // ボムカウンター覚醒の1段パニッシュ印は期限切れで掃除(比較は常にnow基準なので残っても無害だが明示)。
          const cleared0 = (b.bombPunishUntil !== undefined && now >= b.bombPunishUntil && !bKbActive)
            ? { ...b, bombPunishUntil: undefined } : b;
          // ノックバックが切れたら hop 印を解除(次に直接ノックバックされたら再び巻き込み元になれる)。
          const cleared = (cleared0.punisherHopped && !bKbActive && cleared0.punisherPendingAt === undefined)
            ? { ...cleared0, punisherHopped: false, punisherHopDepth: undefined } : cleared0;
          // KILL吹き飛び(死体・§26-1「死体自身は巻き込みの被害者にはならない」): bKbActive経由で
          // 飛行中は既に除外されるが、KB終了直後〜期限除去までの1フレームの隙間も塞ぐため明示ガード。
          if ((isReaperFamily(cleared.type) && !isTerminalReaper(cleared)) || bKbActive || isCorpse(cleared)) return cleared; // 不倒の通常リーパーは除外。深奥チェイサーは巻き込み対象(ボス級)。KB中(被弾側/連鎖元)は新規付与しない
          for (const a of movers) {
            if (a.id === cleared.id) continue;
            // v0.25.3260 社長指示「パニッシャー時のノックバック当たり判定は広めに」: 飛んでいる敵の
            // 判定箱をPUNISHER_HIT_PAD_PXずつ全周拡大して巻き込みを取りやすくする(叩き台16px)。
            if (!rectsOverlap(
              { x: a.x - PUNISHER_HIT_PAD_PX, y: a.y - PUNISHER_HIT_PAD_PX, width: a.width + PUNISHER_HIT_PAD_PX * 2, height: a.height + PUNISHER_HIT_PAD_PX * 2 },
              { x: cleared.x, y: cleared.y, width: cleared.width, height: cleared.height },
            )) continue;
            // 社長指示v0.25.3299「ダン!(発生源)…ダン!(パニッシャー)と二段当たってるのがわかる遅延」:
            // 接触の瞬間は**一拍だけその場で固まる**(KB上書き速度0=一拍目の衝撃)。150ms後に下の
            // pending発火パスがダメージ+継承ノックバック(v0.25.3297「同じだけ飛ぶ」)を適用する(二拍目)。
            punisherContacts.push({ x: cleared.x + cleared.width / 2, y: cleared.y + cleared.height / 2 });
            return {
              ...cleared,
              punisherHopped: true, // 巻き込まれ中の印(KB終了で解除)
              punisherHopDepth: (a.punisherHopDepth ?? 0) + 1, // 連鎖深度(覚醒時は2まで元になれる)
              punisherPendingAt: now + PUNISHER_TWO_BEAT_MS,
              punisherPendingVx: a.knockbackVx ?? 0,
              punisherPendingVy: a.knockbackVy ?? 0,
              knockbackVx: 0,
              knockbackVy: 0,
              knockbackUntil: now + PUNISHER_TWO_BEAT_MS,
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

      // 敵同士の軽い押し合い(社長指示v0.25.2320)。移動AIの結果が出揃った**後**に座標だけ微調整する
      // (速度/ターゲットは書き換えない=追跡・突進・ジャンプの意図は不変)。深く重なった時だけ、
      // 重なりの一部を毎フレーム緩やかに解いて「2体が完全に重なって1体に見える」状態を減らす。
      // 対象外(enemySeparation.ts): 裏ボス/ボス系(死神・ハンター含む)/fixed/dormant/ノックバック中。
      // 救助サークルの押し出しより後に置く=あちらの「円内に入れない」ハード制約を上書きしない。
      if (ENEMY_SEPARATION_ENABLED) {
        const sep = computeEnemySeparation(finalEnemies, deltaTime, now);
        if (sep.size > 0) {
          finalEnemies = finalEnemies.map(e => {
            const d = sep.get(e.id);
            return d ? { ...e, x: e.x + d.dx, y: e.y + d.dy } : e;
          });
        }
      }

      // --- スカジ氷ハザード(判定はここ・描画はpixiScene) ---
      // スカジ討伐(消滅)後は設置済みマーカー/飛行中の刃を消す(死んだボスの攻撃で被弾しない・社長指示)。
      const skadiAlive = state.enemies.some(e => e.type === 'skadi');
      // 氷塊マーカー: テレグラフ2秒経過(gameTime>=fireAt)で起爆=爆発処理へ ice:true で積む。
      // v0.25.3071(社長指示): 氷塊にもキラキラ(冷気)。テレグラフ後半で「冷気が集まり」、砕ける瞬間に散る。
      // 判定ゼロの派手枠②=半径・秒数・ダメージは不変。氷檻(cage)も同じspawnSkadiIce経由なので自動で乗る。
      const iceSparkleTick = shouldEmitThrottled(gameTime, runClocks.skadiIce, SKADI_SPARKLE_ICE_MS);
      if (iceSparkleTick) runClocks.skadiIce = gameTime;
      const skadiIceMarkers = !skadiAlive ? [] : state.skadiIceMarkers.filter(m => {
        if (gameTime >= m.fireAt) {
          pumpkinBlasts.push({ x: m.x, y: m.y, radius: SKADI_ICE_RADIUS, damage: SKADI_ICE_DAMAGE, enemyId: m.enemyId, ice: true });
          for (let i = 0; i < SKADI_SPARKLE_BURST_N; i++) {
            const sa = Math.random() * Math.PI * 2, sr = Math.random() * SKADI_ICE_RADIUS;
            quadBreathSparkles.push({ x: m.x + Math.cos(sa) * sr, y: m.y + Math.sin(sa) * sr });
          }
          return false;
        }
        if (iceSparkleTick) {
          const it = (gameTime - m.bornAt) / Math.max(1, m.fireAt - m.bornAt);
          if (it >= SKADI_SPARKLE_ICE_FROM) {
            const sa = Math.random() * Math.PI * 2, sr = SKADI_ICE_RADIUS * (0.35 + Math.random() * 0.65);
            quadBreathSparkles.push({ x: m.x + Math.cos(sa) * sr, y: m.y + Math.sin(sa) * sr });
          }
        }
        return true;
      });
      // 氷刃: launchAt で発射(向き固定の速度を付与)→以後は等速直進。プレイヤー命中で爆発処理へ積む。寿命で消滅。
      // カウンター対象(社長指示): カウンター窓中は近接半径内の氷刃を弾ける。速い氷刃を接触の一瞬で合わせるのは
      // 難しいので、窓中は能動的に半径内で弾く=パリィ用ブラストをプレイヤー中心(半径=meleeR)に積み、既存の
      // パリィ経路(無効化+Counter!+スカジへ反撃ダメージ)を再利用する。
      const pr = Math.max(player.width, player.height) / 2;
      const counterOpen = isCounterActive(player, now);
      const meleeR = huntingMeleeRadius(player);
      // ★v0.25.3591(社長指示「ラフィの骨刃は、ラフィ倒したら消えて」): 刃は**その持ち主が居る間だけ**
      // 生きている(旧: 骨刃は持ち主を見ておらず、ラフィ討伐後も飛び続けて当たっていた)。
      // ★PACING_PUZZLE.md §10-14#8(R8): 所有者判定を二値分岐(bone?rafi:skadi)から**enemyId基準へ
      // 一般化**した(旧実装のままだとskadi不在のEXでフィルの羽根散弾=visual:'feather'が発射直後に
      // 全消滅していた)。skadiIceBlades配列は複数ボスで共用しているが、判定は「その刃のenemyIdが
      // 今も盤面に居るか」の1本で足りる=visual種別を見る必要がそもそも無い。
      const blaOwnerIds = new Set(state.enemies.map(e => e.id));
      const activeBlades = state.skadiIceBlades.filter(b => blaOwnerIds.has(b.enemyId));
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
          // ★v0.25.3591(社長指示「これはカウンターしても体勢値は削るけど、ダメージは入らないように
          // して」/「同じく氷刃も」): 飛んでくる刃を弾いた時の**反撃HPダメージだけ0**にする
          // (体勢値・Counter!演出・無敵・CDリファンドは通常どおり=parryNoDamage)。
          // ice=true は青の起爆FX/skadi-ice SEを選ぶフラグ(既存のice/bone両方=true実装をそのまま維持)。
          // フィルの羽根散弾(visual:'feather')だけは新規なので氷のFXにしない(既定のオレンジ起爆へ)。
          const iceFx = b.visual !== 'feather';
          if (counterOpen && d <= meleeR) {
            // カウンター成立: プレイヤー中心(半径meleeR)のブラストでパリィ→消化側でカウンター扱いになる。
            pumpkinBlasts.push({ x: pcx, y: pcy, radius: meleeR, damage: SKADI_BLADE_DAMAGE, enemyId: b.enemyId, ice: iceFx, parryNoDamage: true });
            return false;
          }
          if (d <= SKADI_BLADE_HIT + pr) {
            pumpkinBlasts.push({ x: b.x, y: b.y, radius: SKADI_BLADE_HIT, damage: SKADI_BLADE_DAMAGE, enemyId: b.enemyId, ice: iceFx, parryNoDamage: true });
            return false;
          }
          return true;
        });
      // v0.25.3071(社長指示): 氷刃の軌跡にもキラキラ。**飛行中の刃の少し後ろ**へ間引きながら撒く
      // (冷気ブレス/三連突進の軌跡と同じ作法)。★ラフィの骨刃(visual:'bone')は同じ配列を共用しているが
      // 氷ではないので除外する(配列の共用に気づかず全部に撒くと、骨刃から粉雪が出る)。
      if (shouldEmitThrottled(gameTime, runClocks.skadiBlade, SKADI_SPARKLE_BLADE_MS)) {
        runClocks.skadiBlade = gameTime;
        for (const b of skadiIceBlades) {
          if (!b.launched || b.visual === 'bone') continue;
          const bl = Math.hypot(b.vx, b.vy) || 1;
          quadBreathSparkles.push({
            x: b.x - (b.vx / bl) * SKADI_SPARKLE_BLADE_BACK_PX + (Math.random() - 0.5) * 26,
            y: b.y - (b.vy / bl) * SKADI_SPARKLE_BLADE_BACK_PX + (Math.random() - 0.5) * 26,
          });
        }
      }

      // 抱卵型(旧ghost)が撒いた緑卵を breakableProps へ追加。同時上限 EGGCARRIER_MAX_EGGS(超過は古い順に破棄)。
      // 画面外の卵は syncBreakableProps のカメラ領域カリングで別途自然消滅する。
      let nextBreakables = breakableProps;
      if (layingEggs.length > 0) {
        const carriers = [...breakableProps.filter(p => p.id.startsWith('egg-gc-')), ...layingEggs];
        const others = breakableProps.filter(p => !p.id.startsWith('egg-gc-'));
        const capped = carriers.length > EGGCARRIER_MAX_EGGS ? carriers.slice(carriers.length - EGGCARRIER_MAX_EGGS) : carriers;
        nextBreakables = [...others, ...capped];
      }
      // KILL吹き飛び(死体・SKILL_BUILD_REDESIGN.md §26-2-1/26-2-4): 期限切れの死体を配列から除去。
      // 消失ログは'kill'(既にキル時点で打刻済みの理由の再掲=カリング'cap'等と混同しないように)。
      // 280msの一時滞留のみ=湧き上限/盤面不変条件への実害は無い(除去は必ずここ1箇所で行う)。
      if (finalEnemies.some(e => isCorpse(e) && now >= (e.corpseUntil ?? 0))) {
        finalEnemies = finalEnemies.filter(e => {
          if (isCorpse(e) && now >= (e.corpseUntil ?? 0)) { tagRemove(e.id, 'kill'); return false; }
          return true;
        });
      }
      // v0.25.3054: ボス交戦フラグ(施設ロック/描画フェードの正本)。ヒステリシスは
      // bossEngagedNow(ENTER900/EXIT1400)が持つ=前回値を渡すだけ。
      const bossFightNowNext = bossEngagedNow(finalEnemies, pcx, pcy, state.bossFightNow);
      // SKILL_BUILD_REDESIGN.md §15-1(B0発注文): 交戦フラグの立ち上がり(このtickで新たに交戦へ
      // 入った)=「ボス突入」の瞬間。post-setでtelemetryへ記録する(判定・挙動には一切使わない)。
      bossEntryDetected = !state.bossFightNow && bossFightNowNext;
      // v0.25.3055: 城ボス(giantbat・非ストーリー)だけの交戦フラグ(移動半径の制限用)。
      // ストーリーボス(stage-7グレン等)は専用ステージで区域構造が無いため対象外。
      const castleFightNowNext = bossEngagedNow(
        finalEnemies.filter(e => e.type === 'giantbat' && !e.isStoryBoss), pcx, pcy, state.castleFightNow);
      return {
        enemies: finalEnemies, breakableProps: nextBreakables, pumpkinBlasts, shieldBlocks, skadiIceMarkers, skadiIceBlades,
        bossFightNow: bossFightNowNext,
        bossFightLastTrueAt: bossFightNowNext ? gameTime : state.bossFightLastTrueAt,
        castleFightNow: castleFightNowNext,
        // v0.25.3053(社長指示「警告バグ他でも出ないか洗って」で発見): v0.25.2968で猶予を3000→1200msに
        // 短縮した際、バナーの「— 3秒」が置き去りになっていた(表示が嘘)。秒数は定数から導出=再ドリフト防止。
        ...(bossLeashWarning
          ? {
            eventBannerText: `危険：ボスが戦闘域を離れようとしている — ${BOSS_DISENGAGE_GRACE_MS / 1000}秒`,
            eventBannerUntil: gameTime + BOSS_DISENGAGE_GRACE_MS,
          }
          : {}),
        // 叫喚発動: 画面内の通常敵を SCREAMER_BUFF_MS の間 強化する窓を張る。
        ...(screamerActivatedAt.length > 0 ? { screamerBuffUntil: gameTime + SCREAMER_BUFF_MS } : {}),
      };
    });
    // SKILL_BUILD_REDESIGN.md §15-1(B0発注文)+設計チャットの追補: ボス突入スナップショット
    // (装備スキル/Lv/プレイヤーLv/装備スロット別Tier+系統+特殊フラグ/straps)。イベント時のみ
    // (per-frame走査ではない=この呼び出し自体が「交戦フラグが立った1フレーム」でしか起きない)。
    if (bossEntryDetected) {
      const bs = get();
      const engagedBoss = bs.enemies.find(e => isEngageableBoss(e.type) && e.dormant !== true) ?? null;
      recordBossEntry({
        bossType: engagedBoss ? engagedBoss.type : null,
        gameTimeMs: bs.gameTime,
        playerLevel: bs.player.level,
        skills: bs.player.skills,
        skillLevels: bs.player.skillLevels,
        equip: equipTelemetrySnapshot(bs.player.equipment),
        straps: bs.player.straps,
      });
    }
    if (pumpkinLanded) {
      get().triggerShake(PUMPKIN_LAND_SHAKE_MS, PUMPKIN_LAND_SHAKE_MAG);
      // 着地音(社長提供・v0.25.3665)。汎用jump(パンプキン/ハンター/ラボ3)と城ボスg-jumpの
      // 全着地がこのフラグに合流している=1箇所で全員に付く(「同じ動作を持つ全員に付ける」)。
      // 動的import=killFxのSEと同じ理由(gameStoreはaudioManagerを静的importできない・循環)。
      void import('../audio/audioManager').then(m => m.playSfx('jump-land'));
    }
    // 虚無の三唱: 1唱ごとに**大きく**揺らす(社長指示v0.25.3122)。全技中で最大級の振幅=
    // 「数える3回」を体で分からせる合図。判定・秒数・ダメージには一切関与しない(描画のみ)。
    if (glenNihilChanted) get().triggerShake(GLEN_NIHIL_SHAKE_MS, GLEN_NIHIL_SHAKE_MAG);
    if (glenTailSlammed) get().triggerShake(GLEN_TAILSLAM_SHAKE_MS, GLEN_TAILSLAM_SHAKE_MAG);
    // v0.25.3700(社長指示「ボスの技にも対応するSEを」): 城ボス技の発動音(プレイヤー近似の流用)。
    // 動的import=jump-landと同じ理由(gameStoreはaudioManagerを静的importできない・循環)。
    if (giantNovaFired || giantSweepbeamFired || giantBreathFired) {
      void import('../audio/audioManager').then(m => {
        if (giantNovaFired) m.playSfx('skadi-ice');       // 氷結波=氷の近似
        if (giantSweepbeamFired) m.playSfx('heavy-impact'); // ビーム発射=ミーミルレーザーと同じ流用
        if (giantBreathFired) m.playSfx('hurricane');      // 回転ブレス=風の近似
      });
    }
    // PACING_PUZZLE.md §9-4(削岩型・driller): 突き発動音。動的import=jump-landと同じ理由
    // (gameStoreはaudioManagerを静的importできない・循環)。予告SE(hunter-alert)は付けない(§9-4)。
    if (drillerThrustFired) {
      void import('../audio/audioManager').then(m => m.playSfx('thor-thrust'));
    }
    // PACING_PUZZLE.md §14-2④(伐採人・logger): 薙ぎ払い発動音。「SEはdrillerと同系の流用でよい」の
    // 裁定どおりdriller-thrustと同じthor-thrustを鳴らす。
    if (loggerSweepFired) {
      void import('../audio/audioManager').then(m => m.playSfx('thor-thrust'));
    }
    // v0.25.3699(社長指示「グレンの第二形態はHP半分で」): 形態1はHPを**半分まで削った時点**で
    // 第二形態へ移行する(旧v0.25.3600: HP0=撃破で移行)。移行の絵と流れは撃破時と完全に同じ
    // triggerDramaticDeath(崩壊アテンション→glenForm2SpawnAt予約→useGameLoopが形態2を湧かす)を
    // 流用し、本体はここで退場させる。キル経路(報酬・統計・撃破通知)は通さない=移行であって
    // 討伐ではない。一撃でHP0まで落ちた場合は従来どおりキル経路が同じ移行を行う
    // (両経路とも glenForm2SpawnAt==null ガードで二重予約はない)。
    const glenHalf = get().glenForm2SpawnAt == null
      ? get().enemies.find(e => glenForm1TransitionReady(e) && !isCorpse(e))
      : undefined;
    if (glenHalf) {
      useGameStore.setState(s => ({ enemies: s.enemies.filter(e => e.id !== glenHalf.id) }));
      triggerDramaticDeath(get, glenHalf,
        glenHalf.x + glenHalf.width / 2, glenHalf.y + glenHalf.height / 2);
    }
    // M51: ジャイアント新スクリプトの咆哮弾(set() 内は再入set禁止のため post-set で発射)。
    // 弾自体の性能(速度/サイズ/ダメージ)は getEnemyFireProfile('giantbat') のプロファイルを
    // createEnemyProjectile が使う=現行不変(6.26-6)。錬金術の召喚ターゲットも既存どおり考慮する。
    if (giantBoltFires.length > 0) {
      // v0.25.3700: 咆哮弾の発射音(プレイヤー銃近似・弾は全ボス共通の見た目=音も共通)。
      // 1発射イベント(この配列が積まれたフレーム)につき1回。連射(burst)は1発ずつ来るので発ごとに鳴る。
      void import('../audio/audioManager').then(m => m.playSfx('handgun-fire'));
      const bp = get().player;
      const bGameTime = get().gameTime;
      const bFlareTargets = activeFlareTargets(get().flareGunFlares, bGameTime);
      const bTargetSummons = bFlareTargets.length > 0 ? [...get().summons, ...bFlareTargets] : get().summons;
      for (const ge of giantBoltFires) {
        const liveGe = get().enemies.find(e => e.id === ge.id) ?? ge;
        const hidden = isSeekerActive(bp, bGameTime); // v0.25.3268: ボス除外を撤去(シーカーはボスも対象)
        // 通常召喚/フレアの既存挑発は維持し、どちらも選ばれなかった時だけG2.5の固定ヘイト側へ撃つ。
        const utilityTargets = bTargetSummons.filter(s => s.kind !== 'ghost-ally');
        const utilityTgt = resolveEnemyTarget(liveGe, bp, utilityTargets, ALCHEMY_AGGRO_RANGE, hidden, bGameTime);
        const hateTgt = resolveBossLockedHateAim(
          liveGe,
          { x: bp.x + bp.width / 2, y: bp.y + bp.height / 2 },
          get().summons,
        );
        const tgt = utilityTgt.isSummon ? utilityTgt : hateTgt;
        const bex = liveGe.x + liveGe.width / 2, bey = liveGe.y + liveGe.height / 2;
        if ((liveGe.gBoltPattern ?? 'fan') === 'burst') {
          // B案: 同じ方向へ1発ずつ(この関数は連射の1発ごとに呼ばれる)。弾速は素のまま=数で圧をかける。
          // 発射点=銃口(GIANT_BOLT_MUZZLE_OUT_PX・社長指摘v0.25.3453「発射口と弾の位置が合ってない」)。
          // 狙い方向(tgt)は不変=着弾位置・軌道は変わらず、発射点だけ演出銃の先端へ寄せる。
          const bd = Math.max(0.001, Math.hypot(tgt.x - bex, tgt.y - bey));
          const bux = (tgt.x - bex) / bd, buy = (tgt.y - bey) / bd;
          get().addProjectile(createEnemyProjectile(
            liveGe, bp, tgt.x, tgt.y,
            bex + bux * GIANT_BOLT_MUZZLE_OUT_PX, bey + buy * GIANT_BOLT_MUZZLE_OUT_PX,
          ));
        } else {
          // A案: 扇状に同時発射。**真っ直ぐ逃げても外側の弾に当たる**ので、横取りの位置取りが要る。
          // 本数はPhase2で増える(HPしきい値は既存の giantPhaseForHealth と同じ値を読む=二重定義しない)。
          const baseA = Math.atan2(tgt.y - bey, tgt.x - bex);
          const reach = Math.max(1, Math.hypot(tgt.x - bex, tgt.y - bey));
          const phase2 = liveGe.maxHealth > 0 && (liveGe.health / liveGe.maxHealth) <= GIANT_PHASE_HP_THRESHOLD;
          const shots = phase2 ? GIANT_BOLT_FAN_SHOTS_PHASE2 : GIANT_BOLT_FAN_SHOTS;
          for (let i = 0; i < shots; i++) {
            const a = baseA + (i - (shots - 1) / 2) * GIANT_BOLT_FAN_STEP_RAD;
            // 各挺(この扇の各弾)の銃口も同じ規約(演出銃3挺がそれぞれの向きで構え切る位置=発射点)。
            const proj = createEnemyProjectile(
              liveGe, bp, bex + Math.cos(a) * reach, bey + Math.sin(a) * reach,
              bex + Math.cos(a) * GIANT_BOLT_MUZZLE_OUT_PX, bey + Math.sin(a) * GIANT_BOLT_MUZZLE_OUT_PX,
            );
            proj.speed = GIANT_BOLT_FAN_SPEED;
            get().addProjectile(proj);
          }
        }
      }
    }
    // v0.25.3027(社長裁定): グレン第二形態の胴体弾。可視の胴体パーツ(尾を除く)から、列の進行方向
    // ±45°のV字へ各2発。無照準・通常弾(giantbat既定プロファイル=赤い二重丸・打ち返し可)。
    // 位置は世界座標の近似(裁定1a)・プレイヤー80px未満のパーツは撃たない(裁定2)。
    if (glenVolleyFires.length > 0 && glenSimTrail) {
      // v0.25.3700: 胴体弾(パーツV字斉射)の発射音。1斉射イベントにつき1回(同フレーム多発の重なり防止)。
      void import('../audio/audioManager').then(m => m.playSfx('handgun-fire'));
      const bp = get().player;
      const bpx = bp.x + bp.width / 2, bpy = bp.y + bp.height / 2;
      for (const gid of glenVolleyFires) {
        if (glenSimTrail.id !== gid) continue;
        const boss = get().enemies.find(e => e.id === gid);
        if (!boss) continue;
        for (const shot of glenVolleyShots(boss, glenSimTrail.trail, bpx, bpy)) {
          const proj = createEnemyProjectile(boss, bp, shot.tx, shot.ty, shot.ox, shot.oy);
          // 専用aiPhaseを持たない周期斉射のため生成時に技キーが付かない(監査指摘)。記録専用の後付け。
          proj.srcMoveKey = 'g-parts';
          get().addProjectile(proj);
        }
      }
    }
    // v0.25.3042: 冷気ブレス追従のキラキラ粉雪(社長支給 fx/breath-sparkle)。複数同時に散らして
    // 「ぶわー!」を作る。imageエフェクト=pop-in→保持→フェード(実時間・v3038で停止中も流れる)。
    // v0.25.3079(社長指示「爆発の一瞬前にピカッ!と光らせて」): 凝縮しきった一点/ボス本体で
    // 短く強く光らせる。判定ゼロ。画面全体のフラッシュは使わない(大技の閃光と紛れるため)。
    for (const f of iceFlashAt) {
      get().spawnGlow(f.x, f.y, QUAD_ICE_FLASH_R, 'rgba(224,247,255,', 180);
      get().spawnRing(f.x, f.y, 6, QUAD_ICE_FLASH_R * 0.7, 'rgba(255,255,255,0.95)', 3, 200);
    }
    if (quadBreathSparkles.length > 0) {
      const qNow = Date.now();
      for (const p of quadBreathSparkles) {
        get().spawnEffect({
          kind: 'image', id: `qbs-${qNow}-${(Math.random() * 1e6) | 0}`,
          x: p.x, y: p.y, createdAt: qNow, duration: p.life ?? (520 + Math.random() * 300),
          // v0.25.3079(社長指示「絵もギュッとしてほしい」): 粒ごとの大きさを撒く側で指定できる。
          // 未指定なら従来どおり(0.55〜1.0のランダム)。
          texture: 'fx/breath-sparkle', scale: p.scale ?? (0.55 + Math.random() * 0.45),
          // v0.25.3096: 粒ごとに**流れる向きと速さ**を持てる(未指定なら従来どおりその場)。
          rot: p.rot, driftX: p.driftX, driftY: p.driftY,
        });
      }
    }
    // 叫喚型の予兆(溜め開始): 2秒かけて広がるリング＋発光(優先処理を促すテレグラフ)。
    if (screamerWindupAt.length > 0) {
      const { x, y } = screamerWindupAt[0];
      get().spawnRing(x, y, 8, 130, 'rgba(190,242,100,0.5)', 3, SCREAMER_WINDUP_MS);
      get().spawnGlow(x, y, GLOW_R_M, 'rgba(163,230,53,', SCREAMER_WINDUP_MS);
    }
    // 叫喚発動: 強い衝撃リング＋発光＋コールアウト＋画面揺れ。「叫んだ」感を強めるため(社長指示)、
    // 外側にもう一段リング(遅れて届く音波のイメージ)＋画面全体がわずかに緑へ明滅するフラッシュを追加し、
    // 揺れも他の一撃系演出(パンプキン着地mag9/盾バッシュmag10)に並ぶ強さへ上げる(旧: 220ms/mag5)。
    if (screamerActivatedAt.length > 0) {
      const { x, y } = screamerActivatedAt[0];
      get().spawnRing(x, y, 10, 240, 'rgba(190,242,100,0.72)', 4, 480);
      get().spawnRing(x, y, 6, 150, 'rgba(255,255,255,0.85)', 3, 340);
      get().spawnRing(x, y, 20, 330, 'rgba(163,230,53,0.5)', 3, 620); // 一段外側=音波が遅れて届くイメージ
      get().spawnGlow(x, y, GLOW_R_XL, 'rgba(163,230,53,', 520);
      get().spawnCallout(x, y - 30, '叫喚!', '#bef264', { scale: 1.1 });
      get().spawnFlash('rgba(163,230,53,0.22)', 260); // 叫びが画面全体に響くイメージの淡い緑フラッシュ
      get().triggerShake(260, 10);
    }
    // パニッシャーの巻き込みダメージ(近接の半分)を正規経路で適用(死亡処理/演出込み)。
    // v0.25.3299 一拍目(接触)の小FX: ぶつかった衝撃の読み。二拍目(下)の大シェイク/数字と区別する。
    for (const c of punisherContacts) get().spawnBurst(c.x, c.y, '#fca5a5', 6);
    if (punisherHits.length > 0 && punisherDmg > 0) {
      // v0.25.3265 社長指示「パニッシュが起きたら画面揺れ」: 巻き込み成立の瞬間に短いシェイク
      // (描画のみ。同フレーム複数ヒットでも1回=triggerShakeは上書き式なので自然に纏まる)。
      get().triggerShake(PUNISHER_SHAKE_MS, PUNISHER_SHAKE_MAG);
      for (const id of punisherHits) {
        const e = get().enemies.find(en => en.id === id);
        if (!e) continue;
        get().damageEnemy(id, punisherDmg);
        get().spawnDamageNumber(e.x + e.width / 2, e.y, punisherDmg);
      }
    }
  },

  // v0.25.3491(★ボスの「止める効果」の作り直し・①逓減): 通常敵は現状維持(気絶は元々不変)。
  // ボスは「気絶」カテゴリとしてDRを通す(現状stunEnemyはボスへは一度も呼ばれていない=CRIT-UNIFY
  // §9.2でクリの気絶をbossSlowUntilへ置き換え済みのため無改修で挙動不変だが、将来ボスへ呼ばれても
  // 単独ロックが起きないよう関門だけ先に揃える=「1カテゴリに統合」の対象一覧どおり)。
  stunEnemy: (id, until) => {
    const now = Date.now();
    set(state => ({
      enemies: state.enemies.map(e => {
        if (e.id !== id) return e;
        if (!isBossType(e.type)) return { ...e, stunUntil: until };
        const dr = evaluateBossStopDr(e, now);
        if (!dr.allowed) return { ...e, ...dr.patch };
        const base = until - state.gameTime;
        return { ...e, stunUntil: state.gameTime + base * dr.durationMult, ...dr.patch };
      })
    }));
  },

  // v0.25.3491(★ボスの「止める効果」の作り直し・①逓減 #5): 罠の拘束もDRの対象に編入。
  // v0.25.3477で「罠で永久に止まる」再発を恐れて技の中断対象から除外していたが(useGameLoop.ts
  // 参照)、DRが入った今は連射されても3回目以降が無効化されるため構造的に永久ロックしない
  // (社長裁定済み)。通常敵は従来どおりCD無し。
  rootEnemy: (id, until) => {
    const now = Date.now();
    set(state => ({
      enemies: state.enemies.map(e => {
        if (e.id !== id) return e;
        if (!isBossType(e.type)) return { ...e, rootUntil: until, vx: 0, vy: 0 };
        const dr = evaluateBossStopDr(e, now);
        if (!dr.allowed) return { ...e, ...dr.patch }; // 完全耐性中: 拘束を適用しない(vx/vyも触らない)
        const base = until - state.gameTime;
        return { ...e, rootUntil: state.gameTime + base * dr.durationMult, vx: 0, vy: 0, ...dr.patch };
      })
    }));
  },

  // Light bullet knockback: nudge an enemy along the shot direction. Reuses the
  // same decay model as the melee shove (KNOCKBACK_DURATION) but at a much
  // lower speed so it only staggers, never launches.
  // v0.25.3491(★ボスの「止める効果」の作り直し・①逓減): v0.25.3476/3477の固定CD
  // (canApplyKnockbackStop/BOSS_KNOCKBACK_STOP_IMMUNE_MS=1200ms一律)を、汎用DR
  // (evaluateBossStopDr・bossStopDr.ts)へ発展させた。「ノックバック/黄色クリの窓/罠の拘束/気絶」を
  // 1カテゴリとして数えるため、この関数専用だった knockbackImmuneUntil への書き込みはやめ、
  // 共有のDR状態(bossStopDr*)だけを進める。
  knockbackEnemy: (id, dirX, dirY, multiplier = 1, maxStrength = 3) => {
    const now = Date.now();
    const strength = Math.max(0, Math.min(maxStrength, multiplier));
    set(state => ({
      // KILL吹き飛び(死体・§26-2): 死体の飛び方はKILL時に1回だけ決める(buildCorpseFromKill)。
      // 他の全ノックバック発生源(反射神経/救急鞄/ドッグ/しかりの汎用この関数の全呼び出し元)から
      // 死体を除外し、死体自身の吹き飛びを上書きさせない。
      enemies: state.enemies.map(e => {
        if (e.id !== id || isCorpse(e)) return e;
        if (!isBossType(e.type)) {
          // 通常敵はDR無し(手応えは意図的に強い仕様・不変)。
          return {
            ...e,
            knockbackVx: dirX * BULLET_KNOCKBACK_SPEED * strength,
            knockbackVy: dirY * BULLET_KNOCKBACK_SPEED * strength,
            knockbackUntil: now + KNOCKBACK_DURATION,
          };
        }
        const dr = evaluateBossStopDr(e, now);
        if (!dr.allowed) {
          // 完全耐性中/3回目: 「止め」(knockbackVx/Vy/knockbackUntil)を書かない=揺れ(lastHit由来)
          // は damageEnemy 側で別に出るので止まらないだけで被弾リアクションは消えない。
          return { ...e, ...dr.patch };
        }
        return {
          ...e,
          knockbackVx: dirX * BULLET_KNOCKBACK_SPEED * strength,
          knockbackVy: dirY * BULLET_KNOCKBACK_SPEED * strength,
          knockbackUntil: now + KNOCKBACK_DURATION * dr.durationMult,
          ...dr.patch,
        };
      })
    }));
  },

  // PACING_PUZZLE.md §9-4/§9-7#6(削岩型)+§14-2④(伐採人もこの機構を共有): 近接被弾で離脱(retreat)。
  // 呼び出し側(プレイヤー/守護霊/分身の近接武器の打撃=ナイフ・刀・鞭のスイング/近接フィニッシュ/
  // スラッシャー追撃)は全列挙して呼ぶ(銃・爆発・サブ武器・カウンター反撃・DoTは対象外=呼ばない)。
  // driller/logger以外はno-op(isRetreatEligibleType)。
  applyDrillerRetreat: (id) => {
    set(state => ({
      enemies: state.enemies.map(e =>
        (e.id === id && isRetreatEligibleType(e.type)) ? { ...e, drillerRetreatUntil: state.gameTime + DRILLER_RETREAT_MS } : e
      )
    }));
  },

  // 四神舞のタップ/フリックでカウンター(敵弾反射)窓を開く。窓が開いている間に当たった敵弾は
  // ループ側(useGameLoop)で反射される。クールダウンは見ない(ダンス中は拍ごとに自由に張れる)。
  openCounterWindow: () => {
    const now = Date.now();
    set(state => ({
      // 武器庫サークルのショップ等、振っていない経路。前隙が無いので即時に有効。
      player: { ...state.player, counterWindowStart: now, counterWindowEnd: now + COUNTER_WINDOW },
    }));
  },

  // スキル: スラッシャーのチェーン状態を設定(readyAt=0 でチェーン終了=通常CDへ復帰)。
  pumpSlasherQueuedTap: () => {
    // 先行入力の自動発動(社長指示v0.25.3254「0.3以内に次がタップされてれば自動発動」)。
    // useGameLoopが毎フレーム呼ぶ。予約なし/チェーン無し/CD中は即return=実質ゼロコスト。
    const s0 = get();
    const p = s0.player;
    if (isPvpIncapacitated(p.pvpPosture, s0.gameTime)) return; // ★SAME_ARENA §9(検収監査 重大①): 紫/daze中は先行入力の自動追撃も出ない(予約は保持=明けたら従来判定)
    if (!p.slasherQueuedTap || p.slasherChainReadyAt <= 0) return;
    if (s0.realGameTime < p.slasherChainReadyAt) return;
    set(state => ({ player: { ...state.player, slasherQueuedTap: false } }));
    if (s0.realGameTime >= p.slasherChainReadyAt + SLASHER_CHAIN_TIMEOUT_MS) {
      get().setSlasherCombo(0, 0); // 予約したまま長時間止まっていた(ポーズ等)場合は破棄
      return;
    }
    applySlasherChainStrike(get, get().player, s0.gameTime, s0.realGameTime);
  },
  setSlasherCombo: (readyAt, step) => {
    // readyAt=0(チェーン終了/破棄)の時は先行入力の予約も一緒に破棄する(持ち越さない)。
    set(state => ({ player: { ...state.player, slasherChainReadyAt: readyAt, slasherStrikeStep: step, ...(readyAt === 0 ? { slasherQueuedTap: false } : {}) } }));
  },

  markMeleeSwingFx: () => {
    set(state => ({ player: { ...state.player, meleeSwingAt: Date.now() } }));
  },

  // ★v0.25.3780(research/THOR_ISSEN_REWORK.md §1-3): 近接スイング確定の**専用打刻**。
  // 打刻を書くのは**この1本だけ**(中身は純関数 stampMeleeSwingCommit)。呼ぶのは
  // 「プレイヤーの近接スイングが確定した箇所」だけで、**カウンター成立の演出(markMeleeSwingFx)や
  // 武器庫サークルのショップ(counterWindowEnd)からは呼ばない**。
  // 将来ナイフ系の新武器/新しい振り方を足したら**そこにも呼ぶのが規則**
  // (呼び出し箇所の件数は src/utils/meleeSwingCommit.test.ts が固定していて、増減すると落ちる)。
  commitMeleeSwing: () => {
    set(state => ({ player: stampMeleeSwingCommit(state.player, Date.now()) }));
  },

  // research/AI_HUMANIZE.md §8 裁定済み#16(社長裁定2026-09-02=(a)): 「実際に押した時刻」の打刻。
  // 呼び出し側が経路ごとの実測値を渡す(打刻された時刻から後で推測しない=打刻する側が渡す)。
  noteMeleeSwingPressedAt: (pressedAtMs) => {
    set(state => ({ player: { ...state.player, meleeSwingPressedAt: pressedAtMs } }));
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
      // 洋館通路(corridorMode)は卵リングも出さない(v0.25.2145・社長指示「緑卵も出現しないで」)。
      const N = (MINES_DISABLED || state.corridorMode) ? 0 : EGG_RING_COUNT; // ?mine=0 診断: 卵リングイベントも0個(何も追加しない)
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
        if (isArenaSweepProtected(e)) return true;
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
        if (isArenaSweepProtected(e)) return true;
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
        type: 'strap', value: saved * 20, scrapSource: 'poi', // SKILL_BUILD_REDESIGN.md §13-3(B0): 救助イベント報酬
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
      // サブクエスト(research/SUBQUESTS.md): 救助成功の唯一の確定点。1出撃1回上限=累計で伸びる長期枠。
      applySubquestProgress(get, { type: 'rescue' });
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
      // 上限は育成の焼き値(research/GROWTH.md v4「弾数」)。0段=AMMO_MAX素値と同じ。
      const max = state.player.growthAmmoMax[type] ?? AMMO_MAX[type];
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
      // 発射点(originX/originY)は**ここで焼く**(GHOST_BOSS.md v9)。生成箇所は weaponUtils・
      // gameStore など散在していて静的に漏れを検出できないので、storeへの合流点で必ず補完する。
      projectiles: [...state.projectiles, ensureProjectileOrigin(projectile)]
    }));
  },
  
  // ★敵対側(幻影)の設置物を近接で壊す(社長指示2026-08-24)。
  // **自分の設置物は対象にしない**(社長「もちろん幻影のに決まってんだろ」)=判定は `hostile === true` の1本。
  // 盾は対象外(`shieldHp` という独自の耐久体系を既に持っているため。社長の選り分けで対象外)。
  // 地雷は projectiles ではなく `sensorMines` に居るので、同じ関数の中で両方を見る
  // (呼ぶ側が2種類の器を知らなくて済む=次に設置物が増えてもここだけ足せばよい)。
  damageHostilePlacements: (cx, cy, radius, damage) => {
    if (damage <= 0) return 0;
    let broken = 0;
    const hitsCircle = (x: number, y: number, w: number, h: number): boolean => {
      const nx = Math.max(x, Math.min(cx, x + w));
      const ny = Math.max(y, Math.min(cy, y + h));
      return Math.hypot(cx - nx, cy - ny) <= radius;
    };
    const now = Date.now();
    set(state => {
      const projectiles = state.projectiles.flatMap(p => {
        if (p.placedHp === undefined || p.hostile !== true) return [p];
        if (!hitsCircle(p.x, p.y, p.width, p.height)) return [p];
        const hp = p.placedHp - damage;
        if (hp <= 0) { broken += 1; return []; }
        return [{ ...p, placedHp: hp, placedHitAt: now }];
      });
      const sensorMines = state.sensorMines.filter(m => {
        if (m.hp === undefined || !m.hostile) return true;
        if (Math.hypot(cx - m.x, cy - m.y) > radius) return true;
        const hp = m.hp - damage;
        if (hp <= 0) { broken += 1; return false; }
        m.hp = hp;
        return true;
      });
      return { projectiles, sensorMines };
    });
    return broken;
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

  // asHostile=true は幻影の弾パリィ用(v0.25.3665): プレイヤーの弾を**敵対弾として**打ち返す
  // (プレイヤーのカウンター打ち返しの鏡。倍率・速度・非貫通は同じ規則=同条件)。既定は従来どおり。
  reflectProjectile: (id, multiplier = REFLECT_DAMAGE_MULTIPLIER, weaponKey, asHostile = false) => {
    set(state => ({
      projectiles: state.projectiles.map(p => {
        if (p.id !== id) return p;
        return {
          ...p,
          direction: { x: -p.direction.x, y: -p.direction.y },
          speed: p.speed * REFLECT_SPEED_MULTIPLIER,
          // 発射点を**反射点(今の位置)へ打ち直す**(GHOST_BOSS.md v9): 飛翔時間の判定が常に
          // 「直近の飛翔」になる=近距離のラリーは打ち返されない、が保たれる。
          originX: p.x,
          originY: p.y,
          damage: p.damage * multiplier,
          hostile: asHostile,
          reflected: true,
          // ★社長裁定2026-08-27「カウンター弾は再度カウンター不可にして」: 打ち返された弾は
          // noCounter=紫の文法(打ち返し合いのラリー廃止)。プレイヤー側の再反射はcombatTickの
          // !noCounterゲート、幻影側の弾パリィはuseGameLoopのgpBulletSourceゲート、守護霊の弾反射は
          // combatTickのゴースト分岐、の3経路すべてこの1旗で閉じる。
          noCounter: true,
          // ★SAME_ARENA §9(検収監査 軽⑧): クリ旗は反射で消す——幻影のクリ弾を打ち返し、さらに
          // 打ち返されて戻ってきた弾が「クリでもないのに2/3減速」を付けるラリー汚染を防ぐ。
          pvpCrit: undefined,
          // 反射した敵弾は貫通しない=最初に当たった1体で消える(社長指示)。以前は貫通(plow through)していた。
          passthrough: false,
          hitEnemies: [],
          createdAt: Date.now(),
          // v0.25.2525: 守護霊の反射だけ帰属キーを差し替える(未指定=従来どおり元の弾のキーのまま)。
          ...(weaponKey !== undefined ? { weaponKey } : {}),
        };
      })
    }));
  },
  
  updateProjectiles: (deltaTime) => {
    const currentTime = Date.now();

    set(state => {
      const { projectiles, player, gameBounds, breakableProps, castleEvent, enemies } = state;
      // 監査v0.25.3008: 弾のカリング半径は「一番引いた時(ZOOM_MIN_ABS)の可視域」を覆う値にする。
      // 旧値 max(W,H) は等倍前提で、ボス戦の最大引き(2.5倍)では画面内を飛ぶ弾が途中で消えていた
      // (CLAUDE.mdズーム掟のマージン基準に合わせる。弾数は有限で回転も速いため負荷影響は僅少)。
      const cullRadius = Math.max(gameBounds.width, gameBounds.height) / ZOOM_MIN_ABS;
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
        // v0.25.3054: ボス戦中は城の判定を弾も素通し(絵と判定の一致・見えない壁を作らない)。
        // v0.25.3983: 崩落した城も同じく弾を遮らない(壁判定の撤去と同じ理由)。
        return facilitiesLocked(state.bossFightNow, state.bossFightLastTrueAt, state.gameTime)
          || castleEvent.collapsedAt !== undefined
          ? [...trunks, ...torches]
          : [...trunks, ...torches, castleRect(castleEvent)];
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
          // 転がり弾(rollDetonatePx=グレネードガンt1/t2)も手榴弾同様、失効での黙殺はしない
          // (useGameLoop側が道のり到達 or duration経過で爆発させてから除去する)。
          if (currentTime - p.createdAt > p.duration && p.weaponType !== 'grenade' && p.rollDetonatePx === undefined) return false;
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
              // 画面外に出たらすぐ戻り動作へ切替(停止せず帰還)。
              // 監査v0.25.3008: 旧「カメラ矩形」はズーム連動カメラ下げ(v2994〜)でカメラがプレイヤーの
              // 北を向くと発射地点(プレイヤー周辺)すら矩形外になり、投げた瞬間に帰還していた。
              // プレイヤー中心の同寸矩形で判定する(意図=「画面から出たら帰還」は保たれる)。
              const bpcx = state.player.x + state.player.width / 2;
              const bpcy = state.player.y + state.player.height / 2;
              const offScreen = Math.abs(ncx - bpcx) > gameBounds.width / 2 || Math.abs(ncy - bpcy) > gameBounds.height / 2;
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
          // 手榴弾+転がり弾(グレネードガンt1/t2・rollDetonatePx持ち=v0.25.3438)は同じ転がり物理
          // (壁バウンド+指数減速+下限速度)。転がり弾は移動した道のりをtraveledPxへ累計し、
          // useGameLoop側が「道のり≥rollDetonatePx」で爆発させる(変位ではなく道のり=壁バウンドでも必ず届く)。
          if (p.weaponType === 'grenade' || p.rollDetonatePx !== undefined) {
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
              y: nextY,
              // 道のり累計: 転がり弾は爆発距離の判定に、手榴弾(weaponType'grenade')は転がり回転の描画に使う
              // (社長指示v0.25.3447「手榴弾も同じ仕様に=転がりと点滅」)。
              traveledPx: (p.traveledPx ?? 0) + Math.hypot(nextX - p.x, nextY - p.y)
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
    set(state => {
      // ★社長裁定v0.25.3644「いまの金箱の層は削除。この当たり箱を新金箱として統一。5%で箱が金箱として
      // 登場。小ボスは確定ドロップ」: 旧「秘密兵器箱」(見た目は普通の武器箱・開けて初めて判明)を廃し、
      // **スポーン時に5%で金箱(bounty-chest)へ変化**させる=フィールドで金色に見える。
      // 全スポーン経路の合流点=ここで一度だけ抽選。屋内(研究所)は武器の出ない固定箱なので対象外。
      // 賞金首討伐の確定ドロップは従来どおり直接 bounty-chest を積む(この抽選は通らない)。
      if (pickup.type === 'weapon-crate' && !state.indoorMode && Math.random() < GOLD_CRATE_RATE) {
        pickup = { ...pickup, type: 'bounty-chest' };
      }
      const scattered = pickupWithDropScatter(pickup);
      // 社長指示(v0.25.2391)「ステージ2に限らず、移動不可エリアにアイテムも敵も沸かないで」。
      // ドロップ散らばり(pickupWithDropScatter)の**後**に着地点だけを帯の内側へ寄せる(順序が
      // 逆だと意味が無い)。投擲アニメの始点(throwFromX/Y)は見た目の飛び元なので書き換えない。
      // 当たり判定サイズは不明なため既定16×16(pixiScene.tsのdrawPickup hitSizeと同じ既定値)。
      // `?spawnclamp=0`で従来の挙動(帯の外にも着地しうる)へ戻せる。
      const labTheme = state.stageTheme === 'lab';
      // PACING_PUZZLE.md §10-20#10: exStageのみ有効(北端クランプ+広間の横幅拡大)。exPlayerBarrier
      // は渡さない(§10-20#4「敵/湧きには適用しない」――アイテム設置もここでは"湧き"側の扱い)。
      // 撃破後の金箱は打刻フレームで結界を解除した**次フレーム以降**にaddPickupする(useGameLoop側)ので、
      // 仮にここへ結界を混ぜても実害は無いが、ctxを分ける原則(§10-20#4監査#7)どおり明示的に外す。
      let placed = SPAWN_CLAMP_ENABLED
        ? clampRectToPlayableArea(scattered.x, scattered.y, PICKUP_HIT_SIZE, PICKUP_HIT_SIZE, {
            farBackdrop: state.farBackdrop,
            labTheme,
            corridorMode: state.corridorMode,
            m0AdvanceLimitX: state.m0AdvanceLimitX,
            corridorRunInActive: state.corridorRunInActive,
            exStage: state.corridorMode && isExStageRun(),
          })
        : { x: scattered.x, y: scattered.y };
      // ★D-4(社長指示v0.25.2424)「壁・木・建物の"中"にアイテムが落ちる」の修正。
      // 上の clampRectToPlayableArea は「行ける帯」(左右/下限)のクランプであって、
      // **木や建物の中には落ちる**ままだった。プレイヤーの移動が使うのと**同じ関数**
      // (resolveOutOfSolids)を通して遮蔽物の外へ押し出す=「プレイヤーが立てない場所には
      // アイテムも落ちない」。押し出しは一番浅い向きなので、木の根元に落ちた弾薬は幹のすぐ横に出る。
      // `?spawnclamp=0` で従来どおり(帯も遮蔽物も無視)に戻る。
      if (SPAWN_CLAMP_ENABLED) {
        placed = resolveOutOfSolids(
          { x: placed.x, y: placed.y, width: PICKUP_HIT_SIZE, height: PICKUP_HIT_SIZE },
          {
            labTheme, farBackdrop: state.farBackdrop,
            solidProps: state.breakableProps.filter(pr => pr.type !== 'mine' && pr.type !== 'uv-bar'),
            castleEvent: state.castleEvent,
            hospital: state.hospital, hospitalTaken: state.hospitalTaken,
            armory: state.armory, armoryTaken: state.armoryTaken,
            police: state.police, policeTaken: state.policeTaken,
          },
        );
      }
      return { pickups: [...state.pickups, { ...scattered, x: placed.x, y: placed.y }] };
    });
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
    // PACING_PUZZLE.md §7-11c(3): レール(elite)のドロップバイアス=トレジャー。既定(rail未指定)は
    // railTreasureDropMultが1を返すため無改変。トレジャー抽選の唯一の出どころ(dropEnemyCurrency)に乗算。
    const treasureChance = Math.max(0, Math.min(1,
      treasureDropChance(enemy.difficultyRank) * railTreasureDropMult(RAIL_KIND, RAIL_MULT)));
    // チュートリアル(M0訓練)ではトレジャーを落とさない(社長指示v0.25.2428)。
    // 訓練は「操作を覚える場」で、持ち帰りの報酬を配る場ではない(スコア/ゴールドの導線が別物になる)。
    // 判定は既存の `farBackdrop === 'tutorial'`(城の当たり判定スキップ等と同じ signal)を流用する。
    const tutorialRun = get().farBackdrop === 'tutorial';
    if (!tutorialRun && treasureChance > 0 && Math.random() < treasureChance) {
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
        // G2.6「1つの薬棚」(BOT_AND_GHOST.md §2.8): ゴースト召喚中は場に居る両方の体に効く。
        // どちらが拾っても(プレイヤー接触/ドッグ回収とも)収集はこの1箇所へ合流するので、ここで
        // ゴースト(ghost-ally)にも同割合(自身の最大HPの30%)を回復する。ゴースト不在時は従来と完全に同一。
        set(state => ({
          player: {
            ...state.player,
            health: Math.min(state.player.health + Math.round(state.player.maxHealth * HEAL_FRACTION), state.player.maxHealth)
          },
          ...(state.summons.some(s => s.kind === 'ghost-ally') ? {
            summons: state.summons.map(s => s.kind === 'ghost-ally'
              ? { ...s, health: Math.min(s.health + Math.round(s.maxHealth * HEAL_FRACTION), s.maxHealth) }
              : s),
          } : {}),
        }));
        break;
      case 'strap': {
        // SKILL_BUILD_REDESIGN.md §13-3(B0発注文): 実際に加算されたstraps量をtelemetryへ流路別で
        // 記録する(set()内は再入set禁止なのでpost-setで呼ぶ=既存のpumpkinLanded等と同じ作法)。
        let strapGranted = 0;
        set(state => {
          // §6.10 M33⑪: ゴールドラッシュはin-runスクラップ拾得から撤去(永続ゴールド獲得へ移動)。
          // 旧スクラップビルダーの取得量+10/20/30%は§23-1裁定で退役=削除。消費カード「スクラップ
          // ブースト」(§23・+50%・60秒)がここへ合流する。
          // 社長指示v0.25.3300 ゴールドラッシュ覚醒(Lv3): スクラップ取得量も+50%。
          const goldRushScrapMult = skillLevel(state.player, 'gold-rush') >= 3 ? GOLD_RUSH_AWAKEN_SCRAP_MULT : 1;
          strapGranted = Math.max(1, Math.round(pickup.value * ((state.player.scrapMult ?? 1) + (state.player.equipBonus?.scrapBonus ?? 0)) * consumableScrapMult(state.player, state.gameTime) * goldRushScrapMult));
          return {
          player: {
            ...state.player,
            // スクラップ獲得数アップ(パッシブ): 取得量を scrapMult 倍に(+30%/回)。
            // スキル: スクラップビルダー = 取得量 ×1.1/1.2/1.3(Lv・§6.9 M32。四捨五入は既存のMath.round)。
            straps: state.player.straps + strapGranted
          },
          gameStats: {
            ...state.gameStats,
            strapsCollected: state.gameStats.strapsCollected + pickup.value
          }
          };
        });
        recordScrapIncome(pickup.scrapSource ?? 'other', strapGranted);
        break;
      }
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
        // ★v0.25.3137(社長指示): ステージ7の開幕宝箱は中身が違う=**tier2-3の銃1丁 + 3レベルアップ**。
        // 「3レベルアップ」は**レベルを直接3上げる**のではなく、**3回ぶんの経験値を足す**。
        // 理由: このゲームのレベルアップは「しきい値超え→1回上がる→メニューで1つ選ぶ→余剰は繰り越す」で
        // 回っており、levelUp() を3連打するとメニューの選択肢が上書きされて**選ばせるのが1回だけ**になる。
        // 経験値で押すと既存の流れがそのまま3回走る=**3回選べる**(社長の「3レベルアップ」の意味どおり)。
        if (pickup.chestKind === 'boss-start') {
          get().grantWeapon(rollTier23Gun());
          const bp = get().player;
          const add = expNeededForLevels(bp.experience, bp.experienceToNextLevel, bp.level, BOSS_START_CHEST_LEVELS);
          if (add > 0) get().gainExperience(add / XP_GAIN_MULT); // gainExperience 側の倍率を打ち消して実量で渡す
          break;
        }
        // Boss-drop treasure chest. Behaves like a level-up's upgrade menu
        // but without bumping the level or resetting XP. Player just gets
        // a free pick.
        // 二人組クエストv2 §2-8(納品ロック③): 納品ロック中は選択メニューを開かない(磁力で拾っても
        // isPausedを立てない=会話が止まらない)。この1回の選択は失われる(★未決#19・ブロッカーではない)。
        if (get().deliveryLocked) break;
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
      case 'ammo-phill':
      case 'ammo-glauncher': { // ★v0.25.4000: caseが無く拾っても弾が加算されていなかった(水色ドット問題の後段)
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
          // v0.25.3212(社長指示): ナイフ強化(旧レベルアップ3枠目)も武器箱から出る(25%・Tier5未満のみ)。
          // ★v0.25.3644: 旧「秘密兵器箱」の当たり分岐はここから**金箱(bounty-chest)ケースへ移設**。
          // 武器箱は常に1本(当たりはスポーン時に金箱へ変化済み)。
          {
            const pc = get().player;
            const meleeTier = pc.weapons.find(w => w.isMelee)?.tier ?? 1;
            const droppedKey = openCrate(areaIndexForPos(pc.x + pc.width / 2, pc.y + pc.height / 2), meleeTier, get().gameTime); // v0.25.3328: Tier率も時間で迫る
            get().grantWeapon(droppedKey);
            // SKILL_BUILD_REDESIGN.md §15-1(B0発注文)の3: 武器箱から出たのがナイフだった時だけ計測
            // (読むだけ・grantWeaponの挙動には触れない)。
            const droppedDef = createWeapon(droppedKey);
            if (droppedDef.isMelee) recordKnifeTierFromBox(droppedDef.tier ?? 1);
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
              scrapSource: 'box', // SKILL_BUILD_REDESIGN.md §13-3(B0): 武器箱由来
              scatterRadius: WEAPON_CRATE_SCATTER_RADIUS
            });
          });
        break;
      case 'bounty-chest': {
        // ★v0.25.3644(社長裁定「いまの金箱の層は削除。この当たり箱を新金箱として統一。5%で箱が
        // 金箱として登場。小ボスは確定ドロップ」): 金箱の中身=旧・秘密兵器箱の当たり構成に一本化。
        // ①武器抽選3回(エリア×時間のTier率) ②赤経験値20個ばらまき ③スクラップ10倍。
        // 旧中身(トレジャー×2+スクラップ・rollBountyChestReward)は削除。
        // 出どころは2つ: 武器箱スポーン時の5%変化(addPickup)/賞金首討伐の確定ドロップ。
        // 開封の白フラッシュ(useGameLoop側のFXスイッチ)は従来どおり+下の金リング(派手側に倒す)。
        for (let r = 0; r < GOLD_CRATE_WEAPON_ROLLS; r++) {
          const pc = get().player;
          const meleeTier = pc.weapons.find(w => w.isMelee)?.tier ?? 1;
          const droppedKey = openCrate(areaIndexForPos(pc.x + pc.width / 2, pc.y + pc.height / 2), meleeTier, get().gameTime);
          get().grantWeapon(droppedKey);
          const droppedDef = createWeapon(droppedKey);
          if (droppedDef.isMelee) recordKnifeTierFromBox(droppedDef.tier ?? 1); // §15-1(B0)の3(計測のみ)
        }
        get().triggerWallBand('金箱!!', 'gold', 2600);
        for (let i = 0; i < GOLD_CRATE_XP_COUNT; i++) {
          get().addPickup({
            id: `pickup-xp-gold-${pickup.id}-${i}`,
            x: pickup.x, y: pickup.y,
            type: 'experience', value: GOLD_CRATE_XP_VALUE,
            scatterRadius: GOLD_CRATE_XP_SCATTER_RADIUS,
          });
        }
        // 取得FX(分類②=派手側): 金の二重リング+大バースト+グロー(noShadow=投影影に参加させない)。
        get().spawnRing(pickup.x, pickup.y, 8, 170, 'rgba(251,191,36,0.9)', 4, 520);
        get().spawnRing(pickup.x, pickup.y, 8, 110, 'rgba(253,224,71,0.85)', 3, 380);
        get().spawnBurst(pickup.x, pickup.y, '#fbbf24', 32);
        get().spawnBurst(pickup.x, pickup.y, '#fef3c7', 14);
        get().spawnGlow(pickup.x, pickup.y, GLOW_R_M, 'rgba(251,191,36,', 520, true);
        strapDropValues((WEAPON_CRATE_STRAP_DROP_MIN + Math.floor(Math.random() * WEAPON_CRATE_STRAP_DROP_VARIANCE))
          * GOLD_CRATE_STRAP_MULT) // 社長指示v0.25.3282: スクラップ10倍
          .forEach((value, index) => {
            get().addPickup({
              id: `pickup-strap-gold-${pickup.id}-${index}`,
              x: pickup.x, y: pickup.y,
              type: 'strap',
              value,
              scrapSource: 'box',
              scatterRadius: WEAPON_CRATE_SCATTER_RADIUS,
            });
          });
        break;
      }
      case 'quick-magazine': {
        let movedAmount = 0;
        set(state => {
          const p = state.player;
          const active = getActiveGun(p);
          if (!active?.ammoType) return {};
          const field = AMMO_FIELD[active.ammoType];
          const filled = refillWeaponMagazine(active, p, p[field]);
          movedAmount = filled.moved;
          if (filled.moved <= 0) {
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
              [field]: filled.reserve,
              weapons: p.weapons.map(w =>
                w.id === active.id ? filled.weapon : w
              ),
              quickMagCritUntil: state.gameTime + QUICK_MAG_CRIT_WINDOW_MS,
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

  syncBreakableProps: (camera, bounds, torchBonusChance = 0) => {
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
        camera.y + bounds.height + pad,
        torchBonusChance, // ★v0.25.3595
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

      // ★v0.25.3595: RELAXボーナスで生えた松明は、RELAXが明けても**画面内では消さない**
      // (ボーナスしきい値から外れても、区域内に居る既存の松明プロップは保持=ポップアウト禁止。
      //  画面外へ出れば従来どおり区域ストリーミングで自然に落ちる。破壊済みは対象外)。
      for (const [pid, prop] of current) {
        if (!pid.startsWith('torch-') || prop.type !== 'torch') continue;
        if (state.destroyedBreakableProps[pid]) continue;
        if (next.some(n => n.id === pid)) continue;
        if (prop.footX >= camera.x - pad && prop.footX <= camera.x + bounds.width + pad
          && prop.footY >= camera.y - pad && prop.footY <= camera.y + bounds.height + pad) {
          next.push(prop);
        }
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
        // SKILL_BUILD_REDESIGN.md §13-3(B0)の流路タグ。松明(壊せる小物)は「箱」でも「POI」でもない
        // 探索ドロップなので'other'に分類する(叩き台=最終報告に明記のうえ検収者判断を仰ぐ)。
        scrapSource: 'other',
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
          type: `ammo-${dropType}` as `ammo-${AmmoType}`, // v0.25.4000: 5種目(glauncher)を落とせる嘘つきキャストを是正
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
        get().spawnGlow(broken.footX, broken.footY - 8, GLOW_R_S, 'rgba(132,204,22,', 320);
      } else {
        get().spawnBurst(broken.footX, broken.footY - 18, '#f97316', 18);
        get().spawnBurst(broken.footX, broken.footY - 18, '#fde68a', 8);
        get().spawnRing(broken.footX, broken.footY - 18, 6, 34, 'rgba(251,146,60,0.8)', 3, 320);
        get().spawnGlow(broken.footX, broken.footY - 18, GLOW_R_XS, 'rgba(251,146,60,', 360);
        get().dropBreakablePropLoot(broken);
      }
    }
    return hitAny;
  },

  // Equip a dropped/crate weapon into its slot. Auto-pick: a weapon only
  // replaces the current gun/melee if it is a higher tier (so a
  // stray T1 drop never downgrades a T3). Existing guns convert to ammo.
  grantWeapon: (key) => {
    // UNIQUE_WEAPONS.md §4-1: 主たる解決点は生成点(weaponDrop.ts / getStartingWeapons / 武器庫)側。
    // ここは冪等な安全網(resolveSlotKeyは冪等なので二重適用しても無害)——新しい入手経路を後から
    // 足した人が解決を忘れることへの保険。
    const weapon = createWeapon(resolveSlotKeyNow(key));
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
        // v0.25.3294(社長報告「武器箱が光るだけで何も起きない時がある」の正体): 近接の付与だけ
        // 取得トーストが無く、武器箱の25%ナイフ強化(v0.25.3212〜)が無言でHUD差し替えのみだった。
        // 銃と同じ取得表示を出す。
        return {
          player: { ...player, weapons },
          lastWeaponGet: {
            name: `${weaponTierLabel(weapon.tier)} ${weapon.name}`,
            at: Date.now(),
            color: weaponTierColor(weapon.tier),
            kind: 'weapon',
            weaponKey: weapon.key
          }
        };
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
            // 上限は育成の焼き値(glauncherキーも含む5キー全部を焼いてあるのでここで頭打ちにならない)。
            [ammoField]: Math.min(player.growthAmmoMax[ammoType] ?? AMMO_MAX[ammoType], player[ammoField] + amount)
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
      const benkeiProc = changed && hasSkill(state.player, 'benkei') && gt >= state.player.benkeiCdUntil;
      const benkei = benkeiProc
        ? { benkeiBuffUntil: gt + benkeiMs, benkeiCdUntil: gt + benkeiMs + 3000 }
        : {};
      // 社長指示v0.25.3300: 弁慶は切替先の弾倉が0でも弾が入った状態になる(全Lv=1発・覚醒Lv3=2発)。
      // 発動条件はcritバフと同じ(切替+CD明け)=切替連打での無限装填を防ぐ。リザーブは消費しない
      // (0の時の応急装填という趣旨・叩き台)。
      const benkeiRounds = skillLevel(state.player, 'benkei') >= 3 ? 2 : 1;
      const benkeiWeapons = benkeiProc && (target.magazine ?? 0) <= 0
        ? state.player.weapons.map(w => (w.id === id ? { ...w, magazine: benkeiRounds } : w))
        : null;
      return {
        player: {
          ...state.player,
          activeWeaponId: id,
          reloadingWeaponId: '',
          reloadEndsAt: 0,
          ...(benkeiWeapons ? { weapons: benkeiWeapons } : {}),
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
      if (isPvpIncapacitated(p.pvpPosture, state.gameTime)) return {}; // ★SAME_ARENA §9(検収監査 重大①): 紫/daze中はリロード開始不可(白リスト)
      const w = p.weapons.find(g => g.id === weaponId);
      if (!w || !w.ammoType) return {};
      const reload = beginWeaponReload(w, p, ammoPoolFor(p, w.ammoType));
      if (!reload) return {};
      return {
        player: {
          ...p,
          ...reload,
        }
      };
    });
  },

  // Complete a finished reload: move min(need, reserve) rounds from the reserve
  // pool into the gun's magazine. Called once per frame from the game loop.
  tickReload: () => {
    // UNIQUE_WEAPONS.md §13-1: ハンドキャノンの連続命中減衰は「リロード完了で全リセット」。
    // set()の外側で副作用(resetHandcannonDecay)を呼ぶため、候補だけここで拾う(他の同種フラグと同じ流儀)。
    let handcannonReloaded = false;
    set(state => {
      const p = state.player;
      if (!p.reloadingWeaponId || Date.now() < p.reloadEndsAt) return {};
      const w = p.weapons.find(g => g.id === p.reloadingWeaponId);
      if (!w || !w.ammoType) {
        return { player: { ...p, reloadingWeaponId: '', reloadEndsAt: 0 } };
      }
      const field = AMMO_FIELD[w.ammoType];
      const reload = finishWeaponReload(w, p, p[field]);
      if (!reload) return {};
      if (w.key === HANDCANNON_WEAPON_KEY) handcannonReloaded = true;
      return {
        player: {
          ...p,
          [field]: reload.reserve,
          weapons: p.weapons.map(g =>
            g.id === w.id ? reload.weapon : g
          ),
          reloadingWeaponId: reload.reloadingWeaponId,
          reloadEndsAt: reload.reloadEndsAt
        }
      };
    });
    if (handcannonReloaded) resetHandcannonDecay();
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

  setPurchasedSubLevel: (key, level) => {
    const nextLevel = Math.max(0, Math.min(3, Math.round(level)));
    set(state => {
      const next = { ...state.purchasedSubLevels };
      if (nextLevel <= 0) delete next[key]; else next[key] = nextLevel;
      saveSubShelfLevels(next);
      return { purchasedSubLevels: next };
    });
  },

  // ── 永続育成「強化」(research/GROWTH.md v4)。購入は不可逆(返金なし)・有効段数は次の出撃から反映。
  // 保存は進行名前空間(zombie.progress.playerUpgrades)。**ラン中の挙動はここを一切読まない**
  // (読むのは resetGame の焼き込みと強化画面だけ)。
  buyPlayerUpgrade: (id) => {
    const cur = get().playerUpgrades[id];
    if (!cur || cur.bought >= PLAYER_UPGRADE_MAX_LEVEL) return false;
    const cost = playerUpgradeCost(cur.bought);
    if (!get().spendGold(cost)) return false;
    const bought = cur.bought + 1;
    // 買った段はそのまま有効にする(メーターは「下げられる」ためのもの=買っても何も起きない状態は作らない)。
    const next: PlayerUpgradeState = { ...get().playerUpgrades, [id]: { bought, active: Math.min(bought, cur.active + 1) } };
    savePlayerUpgrades(next);
    set({ playerUpgrades: next });
    return true;
  },
  setPlayerUpgradeActive: (id, active) => {
    const cur = get().playerUpgrades[id];
    if (!cur) return;
    const clamped = Math.max(0, Math.min(cur.bought, Math.floor(active)));
    if (clamped === cur.active) return;
    const next: PlayerUpgradeState = { ...get().playerUpgrades, [id]: { ...cur, active: clamped } };
    savePlayerUpgrades(next);
    set({ playerUpgrades: next });
  },

  setAvatarId: (id) => {
    saveAvatarId(id);
    set({ avatarId: id });
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
    // v0.25.2474: `?autotut=1`(自動テスト用・社長合意v0.25.2472)= ポップアップを表示せず
    // 既読処理だけしてポーズしない。stage-2等で「ポップアップのポーズによりシミュが1フレームも
    // 進まず全てが動かないと誤判定」される事故の恒久策(ENGINEERING_NOTES「自動テストの地雷」参照)。
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('autotut') === '1') {
      set({ tutorialPopupShown: true });
      return;
    }
    // 二人組クエストv2 §2-8(納品ロック④): 納品ロック中は出さない=既読も付けない(次のランで出る)。
    if (get().deliveryLocked) return;
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

  setIntroDialogueLines: (lines) => {
    set({ introDialogueLines: lines });
  },

  setPendingLoadout: (keys) => {
    saveStringArray(LOADOUT_SUBS_KEY, keys);
    set({ pendingLoadout: keys });
  },
  setCompanionSkill: (key) => {
    const safe = isCompanionSkillKey(key) ? key : null;
    saveCompanionSkill(safe);
    set({ companionSkill: safe });
  },

  grantSkill: (key) => {
    const owned = get().ownedSkills;
    if (owned.includes(key)) return;
    const next = [...owned, key];
    saveStringArray(OWNED_SKILLS_KEY, next);
    set({ ownedSkills: next });
  },
  // SKILL_BUILD_REDESIGN.md §15-1(B0発注文)の9: ヘッドレス計測スクリプト専用の上書き口。
  // **意図的にlocalStorageへ永続化しない**(grantSkill等の実プレイ経路と違い、計測ラン限りの
  // in-memory上書き=実機の保存データを汚染しない)。呼んだ直後は resetGame を呼び直すこと
  // (companionSkill/ownedSkillLevelsを読むのはresetGameの出撃時点のみ)。
  setOwnedSkillsForTest: (skills, levels) => {
    set({ ownedSkills: [...skills], ownedSkillLevels: { ...levels } });
  },
  // 開発用: ガチャ関連の永続状態だけを初手へ戻す(社長指示v0.25.2347)。
  // **`resetProgress()`(進行リセット)はガチャ状態を消さない**ので、「初戦の稼ぎ20gで2回引ける」等の
  // **初回体験を実機で試す手段が無かった**。ステージ進行とは独立した別ボタンにしてある
  // (ガチャだけ見たい時にステージ解放まで巻き戻さない)。
  // 消すもの = 所持スキル / そのLv / 被り回数 / pity / **階段の累計pull数** / ゴールド残高 /
  //            装備中スキル(所持が消えるので一緒に外す)。
  resetGachaProgress: () => {
    // v0.25.3183(社長指示「ガチャリセットにサブウェポンもリセットを追加」): 装備メニューで
    // 選んだサブウェポン(LOADOUT_SUBS_KEY / pendingLoadout)も一緒に初手(未装備)へ戻す。
    // SKILL_BUILD_REDESIGN.md §20(B4): 装備中の同行者(companionSkill)も所持スキルの消去と一緒に外す
    // (LOADOUT_SKILLS_KEYは旧キーの残骸掃除。COMPANION_SKILL_KEYが正=新キー)。
    // research/GROWTH.md v4: 永続育成「強化」も同じゴールドで買うので、ガチャリセットの消去対象に含める
    // (残すと「Gは0なのに育成だけ残っている」状態になり、初回体験の確認にならない)。
    for (const k of [OWNED_SKILLS_KEY, OWNED_SKILL_LEVELS_KEY, GACHA_DUPES_KEY, GACHA_PITY_KEY,
      GACHA_PULLS_KEY, GOLD_BALANCE_KEY, LOADOUT_SKILLS_KEY, COMPANION_SKILL_KEY, LOADOUT_SUBS_KEY, SUB_SHELF_KEY,
      PLAYER_UPGRADES_KEY]) {
      try { localStorage.removeItem(k); } catch { /* ignore */ }
    }
    set({
      // 「初手」にも守護霊は入っている(G3: 最初から所持)ので、リセット後も欠けさせない。
      ownedSkills: ensureDefaultOwnedSkills([]), ownedSkillLevels: {}, gachaDupeCounts: {}, gachaPitySinceSuper: 0,
      gachaPullsTotal: 0, goldBalance: 0, companionSkill: null, pendingLoadout: [], purchasedSubLevels: {},
      playerUpgrades: emptyPlayerUpgrades(),
    });
  },
  // 強化訓練を1回引く(逐次)。レア度をpityから抽選→pity更新(super=リセット/他=+1)→
  // スキル別の被り回数でLv抽選→初取得は付与・既存超えで昇格・それ以外は返金→被り回数を更新。
  // 10連は本アクションを順番にN回呼ぶ(各回がget/setで最新stateを参照=スナップショット一括禁止)。
  pullGacha: () => {
    // 階段式価格(v0.25.2344): 単価は**累計pull数**で決まる。コスト0(無料)なら課金スキップ、
    // 有料なら残高を消費(不足で null=引かない)。
    const pullsTotal = get().gachaPullsTotal;
    const price = gachaPullCost(pullsTotal);
    if (price > 0 && !get().spendGold(price)) return null;
    // 支払いが通った時点で累計を進める(=次の1回から段が上がる)。昇格/返金の別とは無関係。
    const nextPullsTotal = pullsTotal + 1;
    saveNumber(GACHA_PULLS_KEY, nextPullsTotal);
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

    // Lv上限固定(reaper等=Lv1。bomberはv0.25.3305で覚醒対応=Lv3上限へ昇格済み)で既に所持 → 常に返金。
    if (maxLv === 1 && !firstAcquire) {
      const refund = GACHA_REFUND_BY_RARITY[rarity];
      saveNumber(GACHA_PITY_KEY, nextPity);
      set({ gachaPitySinceSuper: nextPity, gachaPullsTotal: nextPullsTotal });
      get().addGold(refund);
      return { key, rarity, rolledLevel: 1, newLevel: prevLevel, prevLevel, dupeCount, firstAcquire: false, promoted: false, refund };
    }

    // v0.25.3307: v3305の「初取得=Lv1固定」は指示の誤解釈だったため撤回(社長「ガチャって意味では無い。
    // ゲーム中の話」)。ガチャは従来どおり開始Lvを抽選する。※所持Lvはラン中の取得Lvには影響しなくなった
    // (runSkillDraft側=新規カードは常にLv1)。所持Lvの今後の用途は★裁定待ち。
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
    set({ ownedSkills: nextOwned, ownedSkillLevels: nextLevels, gachaDupeCounts: nextDupes, gachaPitySinceSuper: nextPity, gachaPullsTotal: nextPullsTotal });
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
  setPendingRetryRun: (retry) => {
    set({ pendingRetryRun: retry });
  },
  setPendingCorridor: (on) => {
    set({ pendingCorridor: on });
  },
  setBossMaker: (patch) => {
    set(state => ({ bossMaker: { ...state.bossMaker, ...patch } }));
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

  // ── サブクエスト(research/SUBQUESTS.md) ──────────────────────────────────
  setBenchmarkRun: (benchmark) => {
    set({ benchmarkRun: benchmark });
  },

  // 補充は**出撃時だけ**(ラン中は補充しない=裁定「次回プレイ時に補充」)。
  // 呼ぶ場所は startGame の `resetGame()` の**後**(中12: storeに持つ値がresetで消えるのを避ける)。
  // ステージは getSelectedStageId()(練習中は枠が正だが、練習では下のガードで補充自体しない)。
  refillSubquests: () => {
    if (get().benchmarkRun || isPracticeRun()) { set({ subquests: [] }); return; }
    const stageId = getSelectedStageId();
    const defs = subquestsForStage(stageId);
    if (defs.length === 0) { set({ subquests: [] }); return; } // 台帳が無いステージ=サブクエスト無し
    const next = refillStageSubquests(getStageSubquestState(stageId), stageId);
    putStageSubquestState(stageId, next);
    // プール全消化(active 0件)なら空配列=左右どちらにも何も出さない(中11)。
    set({ subquests: toRunEntries(next.active) });
  },

  setHunterChaseSince: (t) => {
    if (get().hunterChaseSince === t) return;
    set({ hunterChaseSince: t });
    // 追跡が切れた=連続秒のリセット(hunter-survive は「1回の追跡内で満たす」)。
    if (t === null) applySubquestProgress(get, { type: 'hunter-seconds', seconds: 0 });
  },

  applySubquestHunterSurvive: (gameTime) => {
    const since = get().hunterChaseSince;
    if (since === null) return;
    // 時計の契約: since も gameTime も **gameTime(ms)**。Date.now系と混ぜない。
    applySubquestProgress(get, { type: 'hunter-seconds', seconds: Math.max(0, (gameTime - since) / 1000) });
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

  // 毎フレーム: 帰還サークル内への進入/滞在を更新。通常ストーリーは離指確認、その他は従来の滞在完了。
  updateReturnPhase: (deltaTime) => {
    set(state => {
      const rc = state.returnCircle;
      if (!rc || state.gameWon) return {};
      const p = state.player;
      const px = p.x + p.width / 2;
      const py = p.y + p.height / 2;
      const dist = Math.hypot(rc.x - px, rc.y - py);
      const inside = dist <= rc.radius;
      // 通常ストーリーは自動帰還しない。進入状態だけ保持し、実際の確認は離指入力で開く。
      if (state.finaleDefeated && !state.corridorMode) {
        const dwellMs = inside ? 1 : 0;
        if (dwellMs === rc.dwellMs) return {};
        const justEntered = inside && rc.dwellMs === 0;
        return {
          returnCircle: { ...rc, dwellMs },
          ...(justEntered ? { projectiles: state.projectiles.filter(pr => !RETURN_CLEAR_WEAPON_TYPES.has(pr.weaponType)) } : {}),
        };
      }
      // 洋館通路のゴールは「近づくとフェードイン→表示が済んでからタイマー」(社長指示v0.25.2151)。
      // 表示前(未接近/フェード中)は滞在カウントを進めない。他ステージは従来どおり即カウント。
      if (state.corridorMode) {
        if (rc.revealedAt === undefined) {
          return dist <= CORRIDOR_GOAL_REVEAL_DIST
            ? { returnCircle: { ...rc, revealedAt: state.gameTime } }
            : {};
        }
        if (state.gameTime < rc.revealedAt + CORRIDOR_GOAL_FADE_MS) return {};
      }
      const dwellMs = inside ? rc.dwellMs + deltaTime * 1000 : 0;
      // 洋館通路のゴールは5秒(社長指示v0.25.2132)。イベント帰還の3秒は不変。
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

  requestStoryReturnPrompt: () => {
    const state = get();
    // ★社長指示2026-08-26「ステージ6のゴールは話したらすぐ帰還しますか?になるタイプに揃える」:
    // 旧: corridorMode を丸ごと除外=M6洋館通路のゴールは5秒ホールドのみだった。M6も通常ストーリーと
    // 同じ「サークル内で指を離す→即confirm」へ。EX(stage-ex1)はフィル戦→専用エンディングの流れなので
    // 従来どおり除外。M6のゴールはボス討伐条件が無い(finaleDefeated不要)ため、その条件はM6では免除。
    // ゴールがまだフェードイン中(revealedAt+CORRIDOR_GOAL_FADE_MS前)は滞在タイマーと同じく受け付けない。
    const m6CorridorGoal = state.corridorMode && !isExStageRun();
    const corridorGoalReady = !state.corridorMode
      || (m6CorridorGoal && state.returnCircle?.revealedAt !== undefined
        && state.gameTime >= state.returnCircle.revealedAt + CORRIDOR_GOAL_FADE_MS);
    // 二人組クエストv2 §2-8「素通り防止」: 離指は isAttackLocked() の判定より前に無条件で
    // 呼ばれるため、isInputLocked() に deliveryLocked を足しただけではここは塞げない
    // (VirtualJoystick.release のコメント「押しっぱなしからの指離しは素通りする」)。
    // 「納品が未成立の間ずっと」ではなく、deliveryLocked / warping / delivering の3項のORで
    // 塞ぐ(納品経路に一度も乗らないラン=?castlenow=1等では帰る手段を残す)。
    const questReturnBlocked = state.deliveryLocked
      || state.eventQuestNpc.status === 'warping'
      || state.eventQuestNpc.status === 'delivering';
    if (
      state.storyReturnPromptVisible || state.gameWon ||
      (!state.finaleDefeated && !m6CorridorGoal) ||
      (state.corridorMode && isExStageRun()) ||
      !corridorGoalReady ||
      !isInReturnCircle(state.player, state.returnCircle) ||
      questReturnBlocked
    ) return false;
    set({
      storyReturnPromptVisible: true,
      isPaused: true,
      touchActive: false,
      swipeDirection: null,
      swipeStrength: 1,
    });
    return true;
  },

  answerStoryReturnPrompt: (confirmed) => {
    const state = get();
    if (!state.storyReturnPromptVisible) return;
    if (confirmed) {
      set({
        storyReturnPromptVisible: false,
        isPaused: false,
        gameWon: true,
        returnCircle: null,
        eventBannerText: '帰還完了',
        eventBannerUntil: state.gameTime + 2000,
      });
      return;
    }
    set({ storyReturnPromptVisible: false, isPaused: false });
  },

  // 病院(社長指示v0.25.2331): サークル内滞在を計測。3秒でワクチン(死亡時に一度だけ復活)を1つ入手し、
  // 建物はフェードアウトして消える(そのランでは再取得できない)。判定の中身は world/hospital.ts の純関数。
  updateHospital: (deltaTime) => {
    // 歴史年表(社長裁定2026-07-31): POI開放は**種別ごとゲーム全体で初回のみ**。set外で記録する
    // (localStorage副作用をset内へ入れない=updateArmoryのgrantGunKeyと同じ持ち出しパターン)。
    let unlocked = false;
    set(state => {
      // v0.25.3054(社長指示): ボス戦中(+復帰猶予)は施設ロック=滞在も通信ポップも進めない。
      if (facilitiesLocked(state.bossFightNow, state.bossFightLastTrueAt, state.gameTime)) return {};
      const pos = state.hospital;
      if (!pos || state.hospitalTaken || state.gameWon) return {};
      const inside = isInHospitalCircle(state.player, pos);
      const { dwellMs, done } = tickHospitalDwell(state.hospitalDwellMs, inside, deltaTime * 1000);
      // §6.24-UX 確定要件1: サークルに入った瞬間、「ここが何で・何をすれば・何が貰えるか」を通信で1回。
      const justEntered = dwellMs > 0 && state.hospitalDwellMs <= 0;
      const intel = justEntered ? poiIntelPatch(state, 'hospital', pos) : {};
      if (done) {
        unlocked = true;
        return {
          ...intel,
          hospitalDwellMs: dwellMs,
          hospitalTaken: true,
          hospitalTakenAt: state.gameTime,
          player: { ...state.player, vaccineRevives: state.player.vaccineRevives + 1 },
          // §6.24-UX 確定要件2: 旧バナー「ワクチンを入手」→ 武器取得と同じトースト(効果説明つき)へ置換。
          lastWeaponGet: {
            name: POI_VACCINE_NAME, at: Date.now(), color: '#86efac',
            kind: 'poi-vaccine', desc: POI_VACCINE_DESC,
          },
          // §6.24-UX 確定要件3: 解放をゾーン到達と同型の帯(WallBand)で出す。
          wallBandText: poiUnlockBandText('hospital'),
          wallBandUntil: Date.now() + POI_BAND_MS,
          wallBandColor: 'white' as const,
        };
      }
      if (dwellMs === state.hospitalDwellMs) return intel; // 円外で0のまま=書き込み省略(毎フレのsetを避ける)
      return { ...intel, hospitalDwellMs: dwellMs };
    });
    if (unlocked) {
      recordChronicleGlobalFirst(getSelectedStageId(), 'poi', 'hospital', `初めて${POI_LABEL.hospital}を開放`, true);
    }
  },

  // 武器庫(PACING_PUZZLE.md §6.24 M48): サークル内滞在を計測。3秒到達時にスクラップが足りていれば
  // 100スクラップを払ってTier3装備(空きスロット優先/満杯なら最低Tierを置換)を確定入手し、建物は
  // フェードアウトして消える。**足りない場合は何も起きない**(既存のdwell挙動をそのまま流用=
  // サークルを出入りすれば再挑戦できる。新しい「不足時専用」の分岐は作らない)。
  // 判定の中身は world/armory.ts の純関数 + data/equipment.ts の rollEquipment/armoryTargetSlot。
  updateArmory: (deltaTime) => {
    // §6.24-W: 付与はset外のgrantWeapon(自前のsetを持つ)で行うため、選定結果をここへ持ち出す。
    let grantGunKey: string | null = null;
    // 歴史年表(社長裁定2026-07-31): POI開放は種別ごとゲーム全体で初回のみ(返金決着も「開放」に数える)。
    let unlocked = false;
    set(state => {
      // v0.25.3054(社長指示): ボス戦中(+復帰猶予)は施設ロック=滞在も通信ポップも進めない。
      if (facilitiesLocked(state.bossFightNow, state.bossFightLastTrueAt, state.gameTime)) return {};
      const pos = state.armory;
      if (!pos || state.armoryTaken || state.gameWon) return {};
      const inside = isInArmoryCircle(state.player, pos);
      const { dwellMs, done } = tickArmoryDwell(state.armoryDwellMs, inside, deltaTime * 1000);
      // ★社長報告v0.25.2425「サークル溜まっても何も起きない。おそらく金が足りないから?
      // これ足りないならサークル入ったときに『スクラップ100必要』とか言ってほしい」。
      // 旧実装は**足りない時に本当に何も起きない**(無言)ので、POIが壊れているようにしか見えなかった。
      // ①円に入った瞬間 ②溜め切った瞬間 の2回、不足していることと必要量/所持量を出す。
      const shortOnScrap = state.player.straps < ARMORY_SCRAP_COST;
      const justEntered = dwellMs > 0 && state.armoryDwellMs <= 0;
      // §6.24-UX 確定要件1(裁定a): サークルに入った瞬間、取引内容(スクラップいくらで何と交換か)を
      // 含む通信を1回。**不足時の警告バナーは従来どおり毎回出す**(別枠なので両立する)。
      const intel = justEntered ? poiIntelPatch(state, 'armory', pos) : {};
      if (shortOnScrap && (justEntered || done)) {
        return {
          ...intel,
          armoryDwellMs: dwellMs,
          eventBannerText: `武器庫: スクラップ${ARMORY_SCRAP_COST}が必要 (所持 ${Math.floor(state.player.straps)})`,
          eventBannerUntil: state.gameTime + 2200,
        };
      }
      if (done && state.player.straps >= ARMORY_SCRAP_COST) {
        // §6.24-W(社長裁定v0.25.2533「武器庫は武器にして。全部tier3だった場合は返金されて終わり」):
        // 報酬=Tier3の銃1挺確定。Tier3未満のカテゴリ(未所持含む)からランダムに1つ選び、
        // そのカテゴリのTier3を付与する。付与はset後の grantWeapon=既存規則(カテゴリごと1挺・
        // 高Tier優先)+武器取得トーストをそのまま通す(§6.24-UX要件2は武器取得UIそのもので満たす)。
        // 社長指示v0.25.3290: 付与候補=既存3カテゴリのTier3(従来)+グレネードガン(武器庫のみの
        // 排出元・1段ずつ昇格)。候補が空=全て最高位=返金(従来と同じ)。
        const upgradable = armoryGrantKeys(state.player.weapons);
        unlocked = true;
        if (upgradable.length === 0) {
          // 全カテゴリ最高位=「返金されて終わり」: スクラップを消費せず取引完了として武器庫は消える
          // (叩き台。残す運用にするなら armoryTaken を立てない形へ変更)。
          return {
            ...intel,
            armoryDwellMs: dwellMs,
            armoryTaken: true,
            armoryTakenAt: state.gameTime,
            eventBannerText: '武器庫: 既に全ての銃が最高位——スクラップは返金された',
            eventBannerUntil: state.gameTime + 2600,
            wallBandText: poiUnlockBandText('armory'),
            wallBandUntil: Date.now() + POI_BAND_MS,
            wallBandColor: 'white' as const,
          };
        }
        // UNIQUE_WEAPONS.md §4-1(生成点): 武器庫はここが「絵」を出さずgrantWeaponへ直結する経路
        // (地面ピックアップの絵が別に無い)ため解決はgrantWeapon入口の安全網でも足りるが、
        // §4-1の表どおりここでも解決しておく(冪等・二重適用は無害)。
        grantGunKey = resolveSlotKeyNow(upgradable[Math.floor(Math.random() * upgradable.length)]);
        return {
          ...intel,
          armoryDwellMs: dwellMs,
          armoryTaken: true,
          armoryTakenAt: state.gameTime,
          player: { ...state.player, straps: state.player.straps - ARMORY_SCRAP_COST },
          gameStats: { ...state.gameStats, strapsSpent: state.gameStats.strapsSpent + ARMORY_SCRAP_COST },
          // §6.24-UX 確定要件3: 解放をゾーン到達と同型の帯(WallBand)で出す。
          wallBandText: poiUnlockBandText('armory'),
          wallBandUntil: Date.now() + POI_BAND_MS,
          wallBandColor: 'white' as const,
        };
      }
      if (dwellMs === state.armoryDwellMs) return intel; // 円外で0のまま=書き込み省略(毎フレのsetを避ける)
      return { ...intel, armoryDwellMs: dwellMs };
    });
    // §6.24-W: Tier3銃の付与(grantWeaponが弾薬重複/アクティブ切替/武器トーストまで面倒を見る)。
    if (grantGunKey) get().grantWeapon(grantGunKey);
    if (unlocked) {
      recordChronicleGlobalFirst(getSelectedStageId(), 'poi', 'armory', `初めて${POI_LABEL.armory}を開放`, true);
    }
  },

  // §6.24-UX 確定要件1: 寄り道POIの進入/発動時の通信(1ラン1回/種)。病院/武器庫は各 update*
  // の中で同じ poiIntelPatch を混ぜているので、ここを呼ぶのは**警察署(アリーナ発動時=useGameLoop)**。
  showPoiIntel: (kind) => {
    set(state => {
      const pos = kind === 'police' ? state.police : kind === 'armory' ? state.armory : state.hospital;
      return poiIntelPatch(state, kind, pos);
    });
  },

  // 拠点候補地(仕様10): サークル内滞在を計測。10秒で制圧→武器商人がその地点へ移動し、元の商人地点は候補に戻る。
  updateSuppression: (deltaTime) => {
    // チュートリアル: 随行NPC(escorts流用)は拠点前進/制圧をしない(移動は通常 useGameLoop の
    // 追従チェーンが担当・社長指示v0.25.1823)。
    // **ただし敵が居る間だけは前に出て積極的に撃つ**(社長指示v0.25.2294)。
    // **ダメージは0=完全に演出**(社長指示v0.25.2293「味方は演出」)。プレイヤーが倒した実感を奪わない。
    if (get().farBackdrop === 'tutorial') {
      const st = get();
      if (!st.escorts.length || !st.enemies.length) return [];
      // **全員弾切れになったら味方も撃たない**(社長指示v0.25.2297「ここで全員弾切れ。撃たない」)。
      // プレイヤーの弾が尽きた=台本上「隊として弾切れ」なので、援護も止まって近接一本になる。
      const anyAmmo = st.player.weapons.some(w => !w.isMelee && w.ammoType &&
        ((w.magazine ?? 0) > 0 || ammoPoolFor(st.player, w.ammoType) > 0));
      if (!anyAmmo) {
        // **その場で足を止める**(社長指摘v0.25.2309「弾切れの時、軍人だけバタバタしてるのが気になる。
        // 足閉じてる絵で止めて」)。弾切れで援護をやめた後、敵が居る間は useGameLoop の追従チェーンも
        // 動かない(前に出た2人を引き戻さないため)ので、**誰も escorts を更新しない**。その結果
        // 最後に立っていた `moving: true` が残り続け、描画側(`esc.moving !== false`)が歩きアニメを
        // 回し続けていた=その場で足踏みして見えていた。
        if (st.escorts.some(e => e.moving)) set({ escorts: st.escorts.map(e => ({ ...e, moving: false })) });
        return [];
      }
      const p = st.player;
      const pcx = p.x + p.width / 2, pcy = p.y + p.height / 2;
      const now = st.gameTime;
      // 狙うのはプレイヤーに一番近い敵(台本で出す敵は基本1体)。
      let target: Enemy | undefined; let best = Infinity;
      for (const e of st.enemies) {
        const d2 = (e.x + e.width / 2 - pcx) ** 2 + (e.y + e.height / 2 - pcy) ** 2;
        if (d2 < best) { best = d2; target = e; }
      }
      if (!target) return [];
      const tx = target.x + target.width / 2, ty = target.y + target.height / 2;
      const fx = tx - pcx, fy = ty - pcy;
      const fl = Math.hypot(fx, fy) || 1;
      const shots: { x: number; y: number; dx: number; dy: number }[] = [];
      let changed = false;
      const nextEsc = st.escorts.map((esc, i) => {
        // **前に出る**: プレイヤーと敵の間、敵寄りに並ぶ(2人が横に開く)。
        const ax = pcx + (fx / fl) * (M0_ESCORT_ADVANCE_PX + i * 40);
        const ay = pcy + (fy / fl) * (M0_ESCORT_ADVANCE_PX + i * 40) + (i === 0 ? -24 : 24);
        const dx = ax - esc.x, dy = ay - esc.y;
        const dist = Math.hypot(dx, dy);
        let { x, y, fireAt, face } = esc;
        if (dist > 4) {
          const k = Math.min(1, (ESCORT_SPEED * deltaTime) / dist);
          x = esc.x + dx * k; y = esc.y + dy * k; changed = true;
        }
        if (now >= fireAt) {
          fireAt = now + ESCORT_FIRE_INTERVAL_MS;
          let sdx = tx - x, sdy = ty - y; const sl = Math.hypot(sdx, sdy) || 1; sdx /= sl; sdy /= sl;
          shots.push({ x, y, dx: sdx, dy: sdy });
          face = (sdx < 0 ? -1 : 1) as 1 | -1;
          changed = true;
        }
        return { ...esc, x, y, fireAt, face, moving: dist > 4 };
      });
      if (changed) set({ escorts: nextEsc });
      for (const sh of shots) {
        get().addProjectile({
          id: `proj-m0-escort-${Math.floor(now)}-${Math.random().toString(36).slice(2, 6)}`,
          x: sh.x - 4.5, y: sh.y - 30, width: 9, height: 9,
          speed: 680, damage: 0, // **0=演出のみ**。当たっても減らない(社長指示v0.25.2293)
          direction: { x: sh.dx, y: sh.dy },
          weaponType: 'handgun', weaponKey: 'escort',
          duration: 1200, createdAt: Date.now(),
          passthrough: false, hitEnemies: [], hostile: false, reflected: false, critChance: 0,
        });
      }
      return shots.map(sh => ({ x: sh.x, y: sh.y }));
    }
    const state = get();
    // 洋館通路(corridorMode): 横一列の隊形へ進みつつ通常拠点護衛と同じ四方位索敵を使う。
    // 前方=停止、左右=50%、後方=70%で全方位へ射撃。M0チュートリアルは上の別経路なので対象外。
    if (state.corridorMode) {
      const p = state.player;
      const pcx = p.x + p.width / 2;
      const pcy = p.y + p.height / 2;
      const now = state.gameTime;
      const detectRadius = huntingMeleeRadius(p) * ESCORT_DETECT_MULT;
      const shots: { x: number; y: number; dx: number; dy: number; soldierIndex: number }[] = [];
      const surroundEvents: { name: string; text: string }[] = [];
      const rescuedEvents: { name: string; text: string }[] = [];
      let escChanged = false;
      const nextEsc = state.escorts.map((esc, i) => {
        const targetX = pcx + (CORRIDOR_ESCORT_ROW_X[i % CORRIDOR_ESCORT_ROW_X.length] ?? 0);
        const targetY = pcy + 26; // プレイヤーのやや後ろの列
        const advance = escortAdvance(esc, { x: targetX, y: targetY }, state.enemies, {
          detectRadius,
          surroundRadius: SURROUND_RADIUS,
          surroundCount: SURROUND_COUNT,
          rescuedFree: RESCUED_FREE,
          strongNearEnter: MELEE_RADIUS * 1.5,
          strongNearExit: 150,
          now,
        });
        const sol = BASE_SOLDIERS[esc.soldierIndex % BASE_SOLDIERS.length];
        if (advance.surroundedNow) surroundEvents.push({ name: sol.name, text: pickNpcLine(esc.soldierIndex, 'surrounded', sol.surrounded) });
        if (advance.rescuedNow) rescuedEvents.push({ name: sol.name, text: pickNpcLine(esc.soldierIndex, 'rescued', sol.rescued) });

        const dx = targetX - esc.x, dy = targetY - esc.y;
        const dist = Math.hypot(dx, dy);
        let x = esc.x, y = esc.y, face = esc.face, fireAt = esc.fireAt;
        const moving = dist >= 3 && advance.speedMult > 0;
        if (moving) {
          const k = Math.min(1, (ESCORT_SPEED * advance.speedMult * deltaTime) / dist);
          x += dx * k;
          y += dy * k;
          if (Math.abs(dx) > 6) face = dx < 0 ? -1 : 1;
        }
        // 射撃は全方位。移動後の位置から撃ち、顔向きは射撃方向を優先する。
        if (advance.target && now >= fireAt) {
          fireAt = now + ESCORT_FIRE_INTERVAL_MS;
          const tx = advance.target.x + advance.target.width / 2, ty = advance.target.y + advance.target.height / 2;
          let shotDx = tx - x, shotDy = ty - y; const dl = Math.hypot(shotDx, shotDy) || 1; shotDx /= dl; shotDy /= dl;
          if (esc.soldierIndex === PHASER_INDEX) {
            const ox = -shotDy * PHASER_GUN_OFFSET, oy = shotDx * PHASER_GUN_OFFSET;
            shots.push({ x: x + ox, y: y + oy, dx: shotDx, dy: shotDy, soldierIndex: esc.soldierIndex });
            shots.push({ x: x - ox, y: y - oy, dx: shotDx, dy: shotDy, soldierIndex: esc.soldierIndex });
          } else {
            shots.push({ x, y, dx: shotDx, dy: shotDy, soldierIndex: esc.soldierIndex });
          }
          face = shotDx < 0 ? -1 : 1;
        }
        const next = {
          ...esc,
          x, y, face, fireAt, moving,
          advanceZone: advance.zone,
          advanceDirX: advance.advanceDirX,
          advanceDirY: advance.advanceDirY,
          advanceSpeedMult: advance.speedMult,
          advanceSpeedTarget: advance.speedTarget,
          advanceRampFrom: advance.advanceRampFrom,
          advanceRampAt: advance.advanceRampAt,
          strongNear: advance.strongNear,
          wasSurrounded: advance.wasSurrounded,
          helpRequested: advance.helpRequested,
          rescuedUntil: advance.rescuedUntil,
        };
        if (x !== esc.x || y !== esc.y || face !== esc.face || fireAt !== esc.fireAt || moving !== (esc.moving ?? false) ||
          advance.zone !== (esc.advanceZone ?? 'none') || advance.speedMult !== esc.advanceSpeedMult || advance.speedTarget !== esc.advanceSpeedTarget ||
          advance.advanceDirX !== esc.advanceDirX || advance.advanceDirY !== esc.advanceDirY || advance.advanceRampFrom !== esc.advanceRampFrom || advance.advanceRampAt !== esc.advanceRampAt ||
          advance.strongNear !== (esc.strongNear ?? false) || advance.wasSurrounded !== (esc.wasSurrounded ?? false) ||
          advance.helpRequested !== (esc.helpRequested ?? false) || advance.rescuedUntil !== (esc.rescuedUntil ?? 0)) escChanged = true;
        return next;
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
          passthrough: false, hitEnemies: [], hostile: false, reflected: false, critChance: 0,
        });
      }
      for (const ev of surroundEvents) {
        if (get().tryNpcLine(ev.name, 'surrounded', ev.text, SURROUND_CAT_CD_MS)) break;
      }
      for (const ev of rescuedEvents) {
        if (get().tryNpcLine(ev.name, 'rescued', ev.text, RESCUED_CAT_CD_MS)) break;
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

    // ── 護衛軍人NPC: 担当拠点へ四方位索敵しながら前進・射撃→サークル内10秒で解放。
    //    プレイヤーの画面外では前進停止・座標のみ保持。HPなし(被弾しても何も起きない=今回のコア)。
    const detectRadius = huntingMeleeRadius(p) * ESCORT_DETECT_MULT;
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
      const sol = BASE_SOLDIERS[esc.soldierIndex % BASE_SOLDIERS.length];
      // 制圧後は進軍目標がないため全方位を前方扱い。巡回中に背後だけ無視して進み続けない。
      const goal = base.status === 'captured' ? { x: esc.x, y: esc.y } : { x: base.x, y: base.y };
      const advance = escortAdvance(esc, goal, state.enemies, {
        detectRadius,
        surroundRadius: SURROUND_RADIUS,
        surroundCount: SURROUND_COUNT,
        rescuedFree: RESCUED_FREE,
        strongNearEnter: MELEE_RADIUS * 1.5,
        strongNearExit: 150,
        now,
      });
      if (advance.surroundedNow) npcSurroundEvents.push({ name: sol.name, text: pickNpcLine(esc.soldierIndex, 'surrounded', sol.surrounded) });
      if (advance.rescuedNow) npcRescuedEvents.push({ name: sol.name, text: pickNpcLine(esc.soldierIndex, 'rescued', sol.rescued) });
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
      if (base.status === 'captured') {
        // 制圧後: 円の縁を巡回(社長指示)。半径を patrolR へ寄せつつ角度を進める=滑らかに周回。
        const cx0 = x - base.x, cy0 = y - base.y;
        let ang = Math.atan2(cy0, cx0);
        if (!Number.isFinite(ang)) ang = 0;
        const patrolR = BASE_CAPTURE_RADIUS * ESCORT_PATROL_R;
        const curR = Math.hypot(cx0, cy0);
        const step = ESCORT_SPEED * advance.speedMult * deltaTime;
        const newR = curR + Math.sign(patrolR - curR) * Math.min(Math.abs(patrolR - curR), step);
        ang += (ESCORT_SPEED * advance.speedMult / Math.max(1, patrolR)) * deltaTime; // 時計回りに周回
        const nx = base.x + Math.cos(ang) * newR, ny = base.y + Math.sin(ang) * newR;
        if (advance.speedMult > 0) face = (nx - x) < 0 ? -1 : 1;
        x = nx; y = ny;
      } else {
        // 前方=停止、左右=50%、後方=70%。減速は即時、加速は1秒ランプ。
        const dx = base.x - x, dy = base.y - y; const d = Math.hypot(dx, dy);
        if (d > 2 && advance.speedMult > 0) { const mv = Math.min(ESCORT_SPEED * advance.speedMult * deltaTime, d); x += (dx / d) * mv; y += (dy / d) * mv; face = dx < 0 ? -1 : 1; }
      }
      // 射撃対象は全方位から最寄り。ジャンプ中だけ除外し、移動中も撃ち続ける。
      if (advance.target && now >= fireAt) {
        fireAt = now + ESCORT_FIRE_INTERVAL_MS;
        const tx = advance.target.x + advance.target.width / 2, ty = advance.target.y + advance.target.height / 2;
        let dx = tx - x, dy = ty - y; const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
        if (esc.soldierIndex === PHASER_INDEX) {
          const ox = -dy * PHASER_GUN_OFFSET, oy = dx * PHASER_GUN_OFFSET;
          escortShots.push({ x: x + ox, y: y + oy, dx, dy, soldierIndex: esc.soldierIndex });
          escortShots.push({ x: x - ox, y: y - oy, dx, dy, soldierIndex: esc.soldierIndex });
        } else {
          escortShots.push({ x, y, dx, dy, soldierIndex: esc.soldierIndex });
        }
        face = dx < 0 ? -1 : 1;
      }
      // (空に浮く件は位置を止めず、描画側で地平線フェード=透明化で対応。drawEscorts 参照)。
      // 滞在カウント/占拠は射撃・前進どちらの枝でも毎フレーム評価する(社長報告のバグ修正)。
      // 仕様「拠点内に10秒留まったら解放」: 敵を撃ちながらでも円内に留まっていればカウントを進める。
      // 円の外(まだ到達前/押し出された)では0にリセット。
      const inC = Math.hypot(x - base.x, y - base.y) <= BASE_CAPTURE_RADIUS;
      // v0.25.3054(社長指示・監査指摘): ボス戦中(+復帰猶予)は拠点確保を凍結——確保完了の
      // バナー/SE/商人移動/拠点ショップ有効化がボス戦の最中に発生しない(進捗は保持し、解除後に再開)。
      const capFrozen = facilitiesLocked(state.bossFightNow, state.bossFightLastTrueAt, state.gameTime);
      dwellMs = inC ? (capFrozen ? dwellMs : dwellMs + deltaTime * 1000) : 0;
      if (!capFrozen && inC && dwellMs >= BASE_CAPTURE_HOLD_MS && base.status === 'open' && !escortCaptures.has(base.id)) {
        escortCaptures.set(base.id, esc.soldierIndex);
      }
      if (x !== esc.x || y !== esc.y || fireAt !== esc.fireAt || dwellMs !== esc.dwellMs || face !== esc.face || companionMs !== (esc.companionMs ?? 0) ||
        advance.zone !== (esc.advanceZone ?? 'none') || advance.speedMult !== esc.advanceSpeedMult || advance.speedTarget !== esc.advanceSpeedTarget ||
        advance.advanceDirX !== esc.advanceDirX || advance.advanceDirY !== esc.advanceDirY || advance.advanceRampFrom !== esc.advanceRampFrom || advance.advanceRampAt !== esc.advanceRampAt ||
        advance.strongNear !== (esc.strongNear ?? false) || advance.wasSurrounded !== (esc.wasSurrounded ?? false) ||
        advance.helpRequested !== (esc.helpRequested ?? false) || advance.rescuedUntil !== (esc.rescuedUntil ?? 0)) escortsChanged = true;
      return {
        ...esc, x, y, fireAt, dwellMs, face, companionMs,
        advanceZone: advance.zone,
        advanceDirX: advance.advanceDirX,
        advanceDirY: advance.advanceDirY,
        advanceSpeedMult: advance.speedMult,
        advanceSpeedTarget: advance.speedTarget,
        advanceRampFrom: advance.advanceRampFrom,
        advanceRampAt: advance.advanceRampAt,
        strongNear: advance.strongNear,
        wasSurrounded: advance.wasSurrounded,
        helpRequested: advance.helpRequested,
        rescuedUntil: advance.rescuedUntil,
      };
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
      get().spawnGlow(c.x, c.y, GLOW_R_M, 'rgba(251,191,36,', 600);
      // 社長指示v0.25.3440「拠点占拠したら、アテンションイベントで教えて」: 現地へカメラアテンション
      // (時間停止で高速パン→ホールド→戻る)。バナー/SE/セリフは従来どおり併用。
      get().triggerAttention(c.x, c.y);
      // 拠点解放時セリフ(Critical): 時間停止なしのHUDセリフに置換(管理表 baseCaptured)。バナー/SEは併用。
      const sol = BASE_SOLDIERS[c.soldierIndex % BASE_SOLDIERS.length];
      get().tryNpcLine(sol.name, 'baseCaptured', pickNpcLine(c.soldierIndex, 'baseCaptured', sol.baseCaptured), BASE_CAPTURED_CAT_CD_MS);
      set({ eventBannerText: '拠点確保', eventBannerUntil: now + 2200 });
      // 歴史年表: 拠点解放は**ゲーム全体で初回のみ**「初めて拠点を開放」を載せる(社長裁定2026-07-31
      // 「初めて拠点を開放した のみ拠点系は記録」。旧: 各ステージ×4拠点で方位付きを毎回記録=廃止。
      // 既存セーブの旧形式エントリも「初回」と数える=recordChronicleGlobalFirstのkindガード)。
      recordChronicleGlobalFirst(getSelectedStageId(), 'base', c.id, '初めて拠点を開放');
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
        passthrough: false, hitEnemies: [], hostile: false, reflected: false, critChance: 0,
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

  // エンディング(仮組み・ENDING_SCENE.md 演出仕様v2)。兵士(§1/§7/§9)とフィル(§2/§4/§8)の状態機械を
  // 1歩進める純関数呼び出しをまとめただけ(判定は持たない=観賞シーン)。シミュレーションはここと
  // useGameLoop側のみで行い、pixiScene は結果を読んで描くだけ(CLAUDE.md「Rendering vs. game logic」)。
  updateEndingScene: (deltaTime) => {
    const state = get();
    if (state.farBackdrop !== 'ending') return { shots: [], explosions: [], phillVelMult: 1 };
    const dtMs = deltaTime * 1000;
    const now = state.gameTime;
    // 兵士: 状態機械を1歩進め、左画面外(ズーム外周+マージン)へ抜けたら右から再投入(§9・監査B-1)。
    const overscanHalfW = (state.gameBounds.width / 2) / ZOOM_MIN_ABS + ENDING_SOLDIER_REENTRY_MARGIN_PX;
    const leftBoundX = state.player.x - overscanHalfW;
    const rightEdgeX = state.player.x + overscanHalfW;
    const shots: { x: number; y: number }[] = [];
    let nextSoldiers = state.endingSoldiers.map(s => {
      const stepped = stepEndingSoldier(s, dtMs, now);
      if (stepped.lastShotAt === now && stepped.lastShotAt !== s.lastShotAt) shots.push({ x: stepped.x, y: stepped.y });
      return reenterEndingSoldierIfOffscreen(stepped, leftBoundX, rightEdgeX, ENDING_SOLDIER_REENTRY_JITTER_PX);
    });
    // 爆撃(演出仕様v3.1): 弾を進め、着弾フレームで兵士へノックバック適用+シェイク。SEはuseGameLoop側
    // (返り値explosions)。着弾点の選定はアンカー兵士方式(監査A-1/A-2=実効ズーム1の可視域内の兵士)。
    // ★弾のstepは常時(v4055): フィナーレの直撃弾は投下停止中(endingBombingEnabled=false)や
    // ?endbomb=0でも必ず落ち切る。ゲートが効くのは**新規のランダム投下だけ**。
    const explosions: { x: number; y: number }[] = [];
    let bombs = state.endingBombs;
    let bombNextAt = state.endingBombNextAt;
    let finaleHitAt = state.endingFinaleHitAt;
    if (bombs.length > 0) {
      const stepped: EndingBomb[] = [];
      for (const b of bombs) {
        const nb = stepEndingBomb(b, dtMs, ENDING_BOMB_TUNING);
        if (!nb) continue; // 爆発表示が終わった弾は除去
        if (nb.justExploded) {
          explosions.push({ x: nb.impactX, y: nb.impactY });
          nextSoldiers = blastEndingSoldiers(nextSoldiers, nb.impactX, nb.impactY, Math.random, ENDING_BOMB_TUNING);
          if (nb.direct) {
            finaleHitAt = now; // フィル直撃(v4055)。EndingScreenがこれを見てフラッシュ暗転へ
            get().triggerShake(700, 9); // 直撃はひときわ大きく
          } else {
            get().triggerShake(500, 6); // 「大きく爆発」(叩き台・被弾シェイクと同系)
          }
        }
        stepped.push(nb);
      }
      bombs = stepped;
    }
    if (ENDING_BOMB_ENABLED && state.endingBombingEnabled) {
      const t = ENDING_BOMB_TUNING;
      if (bombNextAt <= 0) bombNextAt = now + t.intervalMsMin + Math.random() * (t.intervalMsMax - t.intervalMsMin);
      if (now >= bombNextAt) {
        if (bombs.filter(b => b.phase === 'fall').length < t.maxAirborne) {
          const camCenterX = state.player.x + state.player.width / 2; // カメラ中心≒プレイヤー中心(横追従)
          const phillFootY = state.player.y + state.player.height;    // フィルの足元Y=兵士/着弾と同じ座標系
          const nb = trySpawnEndingBomb(
            `ending-bomb-${now}`, nextSoldiers, camCenterX, phillFootY, state.gameBounds.width / 2,
            Math.random, t,
          );
          if (nb) {
            bombs = [...bombs, nb];
            bombNextAt = now + t.intervalMsMin + Math.random() * (t.intervalMsMax - t.intervalMsMin);
          } else {
            bombNextAt = now + t.retryMs; // アンカー候補0人=見送り(監査A-2)
          }
        } else {
          bombNextAt = now + t.retryMs;
        }
      }
    }
    // フィル(=プレイヤー実体・不可視のカメラ台車): 次の倒れ兵士への接近/救護の状態機械(§4/§8)。
    // 位置はプレイヤーの中心Xを使う(足元Xだと幅ぶんズレる)。
    let phillVelMult = 1;
    const phill = state.endingPhill;
    const nextPhill = phill ? stepEndingPhill(phill, state.player.x + state.player.width / 2, dtMs) : null;
    if (nextPhill) phillVelMult = nextPhill.velMult;
    set({ endingSoldiers: nextSoldiers, endingPhill: nextPhill, endingBombs: bombs, endingBombNextAt: bombNextAt, endingFinaleHitAt: finaleHitAt });
    return { shots, explosions, phillVelMult };
  },

  setEndingBombing: (enabled) => {
    set({ endingBombingEnabled: enabled }); // 新規投下のみ制御(滞空弾は落ち切る=v4055)
  },

  triggerEndingFinaleBomb: () => {
    const state = get();
    if (state.farBackdrop !== 'ending') return;
    if (state.endingBombs.some(b => b.direct)) return; // 二重発注防止(冪等)
    const px = state.player.x + state.player.width / 2;
    const py = state.player.y + state.player.height; // 足元Y=兵士/着弾と同じ座標系
    // フィルの着弾時刻の予測位置(歩行中=camLeadPx×velMult先・救護停止中=現在地)。
    // 直撃演出なのでフィルラインのYクリアランスは通さない(trySpawnを使わず直に作る)。
    const vel = state.endingPhill?.velMult ?? 1;
    const bomb: EndingBomb = {
      id: 'ending-finale-bomb',
      impactX: px + ENDING_BOMB_TUNING.camLeadPx * vel,
      impactY: py,
      phase: 'fall', phaseMs: 0, justExploded: false, direct: true,
    };
    set(st => ({ endingBombingEnabled: false, endingBombs: [...st.endingBombs, bomb] }));
  },

  openLabDoor: (id) => {
    set(state => ({ labDoors: state.labDoors.map(d => d.id === id ? { ...d, open: true } : d) }));
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
        // 窓は共通ヘルパー(2026-08-29: ナイフマスター所持=3s・非所持=7s・combo-master延長・装備KILL猶予込み)
        meleeFinishComboUntil: state.gameTime + Math.round(meleeFinishComboWindowMs(state.player)),
        gameStats: {
          ...state.gameStats,
          maxCombo: Math.max(state.gameStats.maxCombo, nextCombo)
        }
      };
    });
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
      if (p.experience >= p.experienceToNextLevel && !isPlayerInAttackTelegraph(p, enemies, PUMPKIN_EXPLOSION_RADIUS, GIANT_STOMP_RADIUS, GIANT_SWEEP_HALF_WIDTH)) {
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
    // ジャスト吸着の拍時刻。★強制JUSTモード(danceForceJust)は拍から遠いタップも成功になるため、
    // beatTを付けると最大ほぼ1拍(500〜600ms)待たされる=検収監査Q2の指摘。force時は吸着なし(即時)。
    const snapAt = state.danceForceJust ? undefined : beatT;
    // ★SEの拍予約はここ(=入力の瞬間)で出す。drainのatMsゲートを通った後だと拍は常に過去=
    // クランプで即時になり予約が機能しない(検収監査Q1の指摘)。ここなら最大235ms先の未来へ
    // サンプル精度で予約でき、メトロノームのキックと重なって太い1発に聞こえる。遅れた入力は
    // playSfxAt側のクランプで即時。audioManagerは静的importできない(循環)ため動的import。
    // minIntervalMs(60ms)の重複抑止はこの経路に無いが、入力は RHYTHM_INPUT_DEBOUNCE_MS(90ms)で
    // 間引かれており(danceForceJust=拍外も成功のモードでも同じ)、60ms未満の連発は構造的に
    // 起きない=意図的に外している(検収監査Q3・根拠はデバウンス側に置く)。
    if (DANCE_BEAT_MODE) {
      const seAt = snapAt ?? gt;
      void import('../audio/audioManager').then(m => m.scheduleDanceJustKick(seAt));
    }
    if (!arrow) {
      newPending.push({ kind: 'tap', atMs: snapAt }); // タップ=周囲を軽く吹き飛ばし(実行は拍へ吸着)
    } else {
      newPending.push({ kind: 'flick', arrow, atMs: snapAt }); // フリック=方向攻撃(実行は拍へ吸着)
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

  drainRhythmPending: (nowMs) => {
    const p = get().rhythm.pending;
    if (p.length === 0) return [];
    // ジャスト吸着(社長指示2026-08-20): nowMs を渡された時は「拍の時刻(atMs)が来たものだけ」を
    // 先頭から取り出す。**最初のまだ来ていない項目で止める**(飛ばさない)——god/finish は atMs を
    // 持たず、直前の flick の実行に続いて出る約束なので、順序を崩すと技が入力より先に出る。
    // nowMs 省略(=?beat=0 の従来経路)は全部返す=従来挙動。
    let take = p.length;
    if (nowMs !== undefined) {
      take = 0;
      while (take < p.length) {
        const at = (p[take] as { atMs?: number }).atMs;
        if (at !== undefined && at > nowMs) break;
        take++;
      }
      if (take === 0) return [];
    }
    const due = p.slice(0, take);
    set(s => ({ rhythm: { ...s.rhythm, pending: s.rhythm.pending.slice(take) } }));
    return due;
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
    // v0.25.2476: 前ランのサブ様式集計(fold)+プロファイル保存の決算は、リザルト画面を閉じる操作
    // (GameOverScreenのsettlePendingTraits)へ移動した(社長裁定「今回のプレイを守護霊に反映しない」を
    // リザルトで選べるように)。ここでは呼ばない——リザルトを経由しなかったランの残骸は下の
    // resetPlayerTraits()が保留ごと破棄する(=破棄と同じ・安全側の仕様)。
    // M35(§6.12): ボット計測カウンタをラン開始でリセット(実機/ヘッドレス両ハーネス共通の合流点)。
    resetBotTelemetry();
    // SKILL_BUILD_REDESIGN.md §15(B0発注文): 1ランぶんの計測台帳もラン開始でリセット(同じ合流点)。
    resetRunTelemetry();
    // BOT_AND_GHOST.md G1: 前ランの未確定セッション(交戦中に終了した場合等)+未決算の保留バッファを
    // 持ち越さない。
    resetPlayerTraits();
    resetGhostDamageLog(); // v0.25.2591: 被弾ログ(?ghostlog=1の画面表示)は1ランごとに読めればよい
    resetGhostDeathPose(); // v0.25.2599: 前ランの倒れ絵を持ち越さない(描画専用の控え)
    glenSimTrail = null;   // v0.25.3027: グレン胴体弾の軌跡を持ち越さない(監査指摘)
    // v0.25.3084(テスト設計B): ラン内の時計は**この1行**で全部戻る。時計を足してもここは直さない
    // (=「足したがリセットを忘れた」が構造的に起きない。v0.25.3070「キラキラが消えた」の再発防止)。
    resetRunClocks();
    // §2.17(GHOST-DUO-RECORDS): 同行ランのフラグ+ラン内打刻ビューも持ち越さない
    // (台帳=localStorageは打刻の瞬間に確定済みなので触らない)。
    resetDuoRunRecords();
    // v0.25.2577: 撃破タイムのボスごと交戦時計(ソロ/同行共有)も持ち越さない。
    resetBossClocks();
    // §2.18(GHOST-CMD-1): 技への反応の袋もラン単位(ラン内は交戦を跨いで保持・ラン間は持ち越さない)。
    resetGhostCommandBags();
    // GHOST-CMD-2A(§2.18追補): 隙コマンドの2モード袋も同じ寿命規則(ラン内は保持・ラン間は持ち越さない)。
    resetModeBags();
    // v0.25.2514(GHOST-BUILD-1): 前ランのゴーストビルド(メモ化1件)も持ち越さない。
    clearGhostBuildCache();
    // G6: 1ランにつき1回だけ非同期取得。実プレイヤー候補が取れなければ召喚側で固定20人を使う。
    const testGhostSkill = bossTestGhostSkill();
    // SKILL_BUILD_REDESIGN.md §15-1の2(B0発注文): ボスメーカーの部屋(isBossMakerRun)に限り、
    // スキル/Lv/装備Tier/プレイヤーLvの注入口(bossTest.ts)を読む。
    const skillInjection = isBossMakerRun() ? getBossTestSkillInjection() : null;
    // SKILL_BUILD_REDESIGN.md §20(B4・配線全列挙): 同行者の選択元はcompanionSkill(正式フィールド・
    // §1-3)。ボスモードのURL注入(testGhostSkill=bossTestGhostSkill())が最優先
    // (bossTest.tsのBossTestSkillInjectionコメント「同行者あり/なしの切替は既存のghostModeを使う=
    // このAPIはプレイヤー本人ビルドだけを扱う」どおり=skillInjectionの有無に関係なくtestGhostSkillが
    // 効く。旧実装はskillInjection側でtestGhostSkillを無視していた=修正対象の黙って壊れる箇所)。
    // 永続保存はしない(下のset()でこのラン限りの実効値として上書きするだけ=装備メニューの選択を汚さない)。
    const selectedCompanionSkill: SkillKey | null = testGhostSkill ?? state.companionSkill;
    beginGhostOnlineRun(selectedCompanionSkill ? [selectedCompanionSkill] : [], getSelectedStageId());
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
      // SKILL_BUILD_REDESIGN.md §20(B4): このランの実効同行者(testGhostSkill優先・無ければ永続選択)を
      // 確定させる。directorTick.ts/ghostOnline.tsはこのフィールドだけを読む(player.skills経由の
      // 暗黙参照は廃止)。ここでの上書きはstate限定でlocalStorageへは書かない(setCompanionSkillと違う)。
      companionSkill: selectedCompanionSkill,
      // BOT_AND_GHOST.md G3: 守護霊の発動フラグ(スコア×0.5の根拠)はラン単位でリセット。
      ghostSummonedThisRun: false,
      ghostSourceThisRun: null,
      ghostFeedbackTargetThisRun: null,
      // §2.16 B: 同行守護霊のカード(リザルト表示用)もラン単位。
      ghostAlly: null,
      // PACING_PUZZLE.md §5.17 M14: ステージが変わっている可能性があるので、選択中ステージの壁メタを
      // 読み直す。演出キュー/帯はラン内限定なので新ランで必ずクリア。
      wallMeta: getWallMeta(getSelectedStageId()),
      wallBandText: '',
      wallBandUntil: 0,
      wallEventQueue: [],
      lastKomaAssessmentInput: null,
    });
    state.enemies.forEach(e => tagRemove(e.id, 'reset')); // 消失ログ用: リスタートで全敵クリア
    resetCritDecay(); // ★§13-3e クリ減衰の台帳を新ランでクリア(前ランの敵IDの記憶を持ち越さない)
    resetHandcannonDecay(); // UNIQUE_WEAPONS.md §13-1: ハンドキャノン減衰の台帳も新ランでクリア
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
    if (skillInjection) {
      // SKILL_BUILD_REDESIGN.md §15-1の2(B0発注文): 基礎装備のスロット別Tierを注入する。系統(line)は
      // 各スロットの先頭系統で固定(体=protection/腕=firepower/アクセ=crit。TTK計測は火力寄りを既定にする
      // 叩き台=bossTest.tsのBossTestSkillInjection.equipTierコメント参照)。持ち帰り(loadCarriedEquip)は
      // ボスメーカーの部屋では従来から不使用のため、ここでは触らない。
      (['body', 'arms', 'accessory'] as const).forEach(slot => {
        const tier = skillInjection.equipTier[slot];
        if (!tier || tier <= 0) return;
        const line = EQUIP_LINES_BY_SLOT[slot][0];
        const def = equipmentDef(slot, line, Math.min(EQUIP_TIER_MAX, tier));
        if (def) runLoadout[slot] = def.id;
      });
    } else {
      const carried = equipmentById(loadCarriedEquip());
      if (carried) runLoadout[carried.slot] = carried.id;
    }
    // 持ち帰りは run 開始で「銀行から引き出し」=永続キーを空に。再度貯めるのは帰還/クリア時のみ
    // (=途中離脱や死亡では失う。死亡時は damagePlayer でも明示クリア)。
    saveCarriedEquip(null);
    const runEquipBonus = aggregateEquipBonus(runLoadout);
    // ── 永続育成「強化」の焼き込み(research/GROWTH.md v4「★焼き込みの原則」) ──────────────────
    // 有効段数(store)を読むのは**ここだけ**。以降ラン中・リザルトは Player の焼き値だけを読むので、
    // 「メーター変更は次の出撃から」が機械的に保証される(守護霊の疑似Playerも同じ焼き値を通る)。
    // 計測路(ボスメーカー / ガントレット)は**0段として焼く**=TTK計測の基準が育成の進みでズレない。
    // 通常のボス練習(isPracticeRunだがガントレットでない)は乗る(プレイヤーの実力扱い)。
    const growthMeterless = isBossMakerRun() || isGauntletRun();
    const growthMeters = growthMeterless ? emptyPlayerUpgrades() : state.playerUpgrades;
    const growthHpBonus = growthMaxHpBonus(activeUpgradeLevel(growthMeters, 'health'));
    const bakedGrowthAtkMult = growthAttackMult(activeUpgradeLevel(growthMeters, 'attack'));
    // AmmoTypeの5キー全部(glauncherを含む)。素値は引数で渡す=utils側はAMMO_MAXをimportしない。
    const bakedGrowthAmmoMax = effectiveAmmoMaxMap(AMMO_MAX, activeUpgradeLevel(growthMeters, 'ammo'));
    const bakedGrowthGoldMult = growthGoldMult(activeUpgradeLevel(growthMeters, 'gold'));
    const bakedGrowthXpMult = growthXpMult(activeUpgradeLevel(growthMeters, 'xp'));
    // スコア倍率(社長裁定2026-08-20): メーター1本フルで−0.2・ゴールド系統は数えない。計測路は上と同じく0段=1.0。
    const bakedGrowthScoreMult = growthScoreMult(growthMeters);
    // ステージ難度のスコア倍率(社長指示2026-08-20「難易度補正の分、スコアにも。換金にも」):
    // 難度階段のHP係数をそのまま流用(S3=1.2〜S6=1.8・他/計測路は1.0=ヘルパが返す)。
    const bakedStageScoreMult = stageBossDiffMults().hp;
    // DDAの参照HP(社長裁定Q3=A案): profile.maxHp+育成HP加算。**装備HPは含めない**
    // (含めると現行PPに乗っている装備HP寄与が消える=裁定外の挙動変更になる)。
    const bakedDdaBaseHp = profile.maxHp + growthHpBonus;
    // 最大体力は装備分を加算してベイク(消費側を据え置きにするため)。育成の体力加算もここで1回だけ乗る。
    const maxHealth = profile.maxHp + equipMaxHealthOf(runLoadout) + growthHpBonus;
    // 固有スキル(クラス標準サブ武器)を最初から Lv1 所持で開始する。
    const innateSub = classSubWeaponFor(validClass);
    // SKILL_BUILD_REDESIGN.md §15-1の2(B0発注文)+§12-2#7: ボスメーカーの部屋はXPが入らないため
    // プレイヤーLvの注入が前提。levelUp()と同じ式(utils/levelCurve.ts)をLv1から反復適用して
    // experienceToNextLevelを算出する(カーブの式を複製しない=TEST_DESIGN.md 型Aの予防と同じ理由)。
    const runPlayerLevel = skillInjection && skillInjection.playerLevel > 1
      ? Math.floor(skillInjection.playerLevel) : 1;
    let runExpToNextLevel = 5; // Lv1の初期しきい値(通常出撃と同じ既定値)
    for (let lv = 2; lv <= runPlayerLevel; lv++) runExpToNextLevel = nextLevelThreshold(lv, runExpToNextLevel);

    set(state => {
      // 出撃時の所持サブ = クラス固有(デフォルト)サブは常に所持 + 装備選択で選んだサブ。
      // フリー/メイン/(将来の)サブクエスト共通の経路。固有サブが落ちないようにする(社長指示)。
      // 商人(unlockedShopSkillCards)とレベルアップ候補(generateUpgradeOptions)もこの所持サブに絞られる。
      // 装備サブは1つだけ採用(重複除去のうえ先頭1件)。クラス固有サブは別途常時所持。
      // v0.25.3187(社長報告「買ってないのに全種装備できちゃう」): 未購入(陳列Lv0)のサブは出撃時にも
      // 落とす(装備メニュー側のロックと二重の守り。古い保存が残っていても素通りさせない)。
      const loPurchased = state.pendingLoadout.filter(k => (state.purchasedSubLevels[k] ?? 0) >= 1);
      const loDedup = loPurchased.filter((k, i) => loPurchased.indexOf(k) === i).slice(0, 1);
      const runSubs: SubWeaponKey[] = state.danceTestMode
        ? ['shijin']
        // チュートリアル: 銃と近接以外は強制的に無し(社長指示v0.25.1825)=サブウェポン0
        // (クラス固有サブ・装備サブとも)。レベルアップ候補/商人陳列も所持サブ基準なので自動で絞られる。
        : state.pendingFarBackdrop === 'tutorial' ? []
        : Array.from(new Set<SubWeaponKey>([innateSub, ...loDedup]));
      // 装備スキル(出撃時に player.skills へ反映)。
      // SKILL_BUILD_REDESIGN.md §16-10 ★A(持ち込み廃止・確定=MAX_CARRY_SKILLS=0): 通常出撃は
      // ラン内ドラフトのみでruntime skillsを組む=開始0件。同行者(companionSkill/selectedCompanionSkill)
      // はプレイヤー本人の開始スキルには使わない(同行者はplayer.skillsに入らない=§1-3/§8点1・
      // §20-1点3の配線全列挙で確定)。ボスメーカーの注入(skillInjection)はプレイヤー本人ビルドの
      // 計測用測定路としてそのまま残す(§17-1点4。同行者とは別枠=bossTest.tsのコメントどおり)。
      const runSkills: SkillKey[] = state.danceTestMode
        ? []
        : skillInjection
          ? Array.from(new Set<SkillKey>(skillInjection.skills))
          // MAX_CARRY_SKILLS=0 なので常に空配列になる(定数を残すことで「復活可能な形」を保つ=
          // 将来MAX_CARRY_SKILLSを戻すだけでこの経路がそのまま生き返る)。持ち込み候補の出どころは
          // B1で既に0化済み(元pendingSkills)=companionSkillは同行者専用でここには混ぜない。
          : Array.from(new Set<SkillKey>()).slice(0, MAX_CARRY_SKILLS);
      // 装備スキルのLvは所持Lv(ownedSkillLevels)を反映(未設定=1、最大Lvでクランプ)。注入時は
      // skillInjection.skillLevelsを優先する(未指定キーはownedSkillLevelsへフォールバック)。
      const runSkillLevels: Partial<Record<SkillKey, number>> = Object.fromEntries(
        runSkills.map(k => [k, Math.max(1, Math.min(
          skillMaxLevel(k), skillInjection?.skillLevels[k] ?? state.ownedSkillLevels[k] ?? 1,
        ))])
      );
      // 旧スキル: スクラップビルダー(出撃開始時の初期スクラップ+50/100/150)は§23-1裁定で退役=削除。
      const runLevels: Partial<Record<SubWeaponKey, number>> = state.danceTestMode
        ? { shijin: state.danceTestLevel }
        : Object.fromEntries(runSubs.map(k => [k, 1])) as Partial<Record<SubWeaponKey, number>>;
      // 商人の陳列=この出撃のサブのみ。★上限は開発施設で買った陳列Lv(社長裁定v0.25.3189
      // 「スキル上限をGで買う形が正解」): **20G=装備権(Lv1) / 50G=ラン中Lv2まで / 100G=Lv3まで**。
      // 社長指示v0.25.3322「固定スキルと固定サブウェポンは最初から上限まで解放」:
      // **クラス固有(固定)サブは購入不要で常にLv3まで陳列**(自クラスの標準装備は経済の外)。
      // 装備選択サブ(他クラスの固定サブを借りる場合を含む)は従来どおり購入Lvが上限。
      // 賢者の石/村雨等のラン中解禁(maybeUnlock系)は従来どおりこの台帳へ後から追記される=不変。
      const runShopUnlocks: Partial<Record<SubWeaponKey, number>> = state.danceTestMode
        ? {}
        : Object.fromEntries(
            runSubs
              .map(k => [k, k === innateSub ? 3 : Math.min(3, state.purchasedSubLevels[k] ?? 0)] as const)
              .filter(([, lv]) => lv >= 1)
          ) as Partial<Record<SubWeaponKey, number>>;
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
      // ボスメーカーの部屋(BOSS_MAKER.md §1-1)は**壁なし・障害物なし・ボス1体だけ**。木が残っていると
      // 弾が木に当たって消える/ボスが引っかかる/方眼が読めない、で数字を詰める邪魔になる(社長指示v0.25.2628)。
      const bossMakerRoom = isBossMakerRun() && !state.danceTestMode;
      // エンディング(仮組み)も同じ扱い=見せるだけのステージに木/松明/緑卵は不要(ENDING_SCENE.md)。
      setTreesDisabled(farBackdrop === 'stage5' || farBackdrop === 'tutorial' || farBackdrop === 'ending' || corridorMode || bossMakerRoom);
      // チュートリアル: 松明(破壊可能プロップ=資材ドロップ源)も出さない(社長指示v0.25.1818
      // 「アイテムも通常NPCも何もかも無し。全てイベントで特別仕様のみ」)。
      setTorchesDisabled(farBackdrop === 'tutorial' || farBackdrop === 'ending' || corridorMode || bossMakerRoom);
      // チュートリアル: 緑卵(地雷)のワールド生成も出さない(社長指示v0.25.1820「緑卵も非表示」)。
      setMinesDisabled(farBackdrop === 'tutorial' || farBackdrop === 'ending' || corridorMode || bossMakerRoom);
      // 飾りの花(判定なし・だが128pxの大きな絵)も部屋では出さない=画面にはプレイヤーとボスだけ。
      setFlowersDisabled(bossMakerRoom);
      // 洋館通路の湧き方向ゲート(上=奥 主体・左右は湧かせない)。generateEnemy が参照(新規/リサイクル両方)。
      setCorridorSpawn(corridorMode);
      // research/STAGE_DIFFICULTY.md(ステージ難度の階段): 雑魚のHP/攻撃に掛かるステージ係数を
      // **出撃のたびに1回**セットする(木/通路ゲートと同じ作法)。全出撃(通常/練習/ガントレット/
      // ボスメーカー)がここを通るのでセット点はこの1箇所で足りる。計測路(ボスメーカー/ガントレット)は
      // ヘルパが1.0を返す=ボス側の個別適用と同じ判断を1本で共有する。
      {
        const stageDiff = stageBossDiffMults();
        setStageDifficultyMults(stageDiff.hp, stageDiff.dmg);
      }
      // 遠景森2(手前の帯)は forest/lab どちらでも有効(ダンステストのみ無効)。lab は機材シルエット帯。
      const nearHorizon = !state.danceTestMode ? state.pendingNearHorizon : '';
      // 裏ボス(深層域)。屋外(非ラボ/非屋内)・非ダンステストのときだけ有効。
      // 洋館通路(corridorMode)では裏ボス深層域を無効化(v0.25.2119): 通路は奥へ歩き続ける構造のため
      // 距離条件を必ず踏み、森用のデンジャーゾーン暗幕が通路背景を覆って画面が黒地化していた(社長報告)。
      const hiddenBoss = (!state.danceTestMode && !indoor && stageTheme === 'forest' && !corridorMode && !bossMakerRoom) ? state.pendingHiddenBoss : null;
      // PACING_PUZZLE.md §6.24 M48: 寄り道POI(病院/武器庫/警察署)は病院と同じ条件系(通常ステージ=
      // 屋外・森スキン・通路/ダンステストでない)にだけ立つ。3種の位置は、裏ボスのセクターを除いた
      // 残り3セクターへ毎ランランダムに割り当てる(assignDetourSectors。乱数はここで1度だけ引く=
      // hospital.ts/armory.ts/police.ts の各 *Pos はその結果を受け取るだけの純関数)。
      // エンディング(仮組み)は寄り道POI(病院/武器庫/警察署)も出さない=NPC0(ENDING_SCENE.md)。
      const detourVisible = !state.danceTestMode && !indoor && stageTheme === 'forest' && !corridorMode && !bossMakerRoom && farBackdrop !== 'ending';
      const detourSectors = detourVisible ? assignDetourSectors(bossSectorIndex(hiddenBoss)) : null;
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
            // 縦は上下固定クランプ後の廊下帯(±LAB_CORRIDOR_Y_LIMIT_PX=100)の到達圏に収める。
            // ガード配置(下)が labDoc.y ±70 でずらすため、その両端が±100に収まるよう ±30 に限定
            // (社長承認 M2_LAB_CORRIDOR_SPEC.md v0.25.2175。旧: -400+rand*800=±400)。
            const y = -30 + Math.random() * 60;
            return { x, y, side };
          })()
        : null;
      // PACING_PUZZLE.md §6.28-20(社長指示・v0.25.2382で再配置): idol(stage-2隠しボス)=
      // 「ゴール資料の真逆位置」。ステージ2の実体はこの屋外ラボ廊下(labDoc)であって、旧labMap.tsの
      // 屋内グリッドではない(indoorModeは現行キャンペーンのどのステージからも到達しないコードパス=
      // v0.25.2381の実装は場所選定を誤っていた。PACING_PUZZLE.md ★未決事項7-1参照)。
      // 廊下は原点(プレイヤーのスタート)を挟んで左右に伸びる1本道なので、資料の座標を原点に対して
      // 点対称にした位置がそのまま「反対方面の最奥」になる(labIdolSpotForDoc・純関数・テスト済み)。
      const labIdol: LabIdolSpot | null = labDoc ? labIdolSpotForDoc(labDoc) : null;
      // ガード(固定・休眠・aggroRange内で起床)。書類の手前(原点側)に密集配置。
      // 視界=LAB_VISION_RANGE(湧き敵と同じ単一の出どころ。v0.25.1754で300へ統一→v0.25.2237で2/3の200)。
      const mkGuard = (type: EnemyType, gx: number, gy: number): Enemy =>
        ({ ...spawnEnemyAt(type, gx, gy, 0), fixed: true, dormant: true, aggroRange: LAB_VISION_RANGE, vx: 0, vy: 0, homeX: gx, homeY: gy });
      // idolもガードと全く同じ作法(fixed/dormant/homeX・Y/aggroRange=LAB_VISION_RANGE=単一の出どころ)。
      // fromEvent=true でゲート2ボスと同じ作法にし強さ×5倍率を掛けない(社長指示v0.25.1595の踏襲・
      // ?idolnow=1の強制召喚と同じ初期化)。起床/移動/攻撃はuseGameLoop.tsのidol専用ブロックが担当
      // (updateEnemiesの通常AIはisHiddenBoss型を素通りするため、この配列に載せるだけでは動かない)。
      const mkIdol = (spot: LabIdolSpot): Enemy => ({
        ...spawnEnemyAt('idol', spot.x, spot.y, 0),
        fixed: true, dormant: true, aggroRange: LAB_VISION_RANGE, vx: 0, vy: 0,
        homeX: spot.x, homeY: spot.y,
        fromEvent: true,
        bossState: 'chase', bossPhase: 1,
        idolFacingLeft: spot.facingLeft, // 社長指示: 設置時はプレイヤー(原点)の方を向く
      });
      // 固定・休眠の敵を配置(距離カリング対象外=fixed)。aggroRange 内でプレイヤーが入ると起床。
      const runEnemies: Enemy[] = indoor
        ? LAB_ENEMIES.map(e => ({ ...spawnEnemyAt(e.type, e.x, e.y, 0), fixed: true, dormant: true, aggroRange: e.aggroRange, vx: 0, vy: 0, homeX: e.x, homeY: e.y }))
        : labDoc
          ? [
              mkGuard('lab-zombie-3', labDoc.x - labDoc.side * 170, labDoc.y),
              mkGuard('lab-zombie-2', labDoc.x - labDoc.side * 250, labDoc.y - 70),
              mkGuard('lab-zombie-1', labDoc.x - labDoc.side * 250, labDoc.y + 70),
              ...(labIdol ? [mkIdol(labIdol)] : []),
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
          ? [
              { id: 'lab-document', x: labDoc.x - 8, y: labDoc.y - 8, type: 'lab-clear-item' as const, value: 0 },
              // PHILLガンの弾を道中に2つ(社長指示v0.25.2246「ゴールからみて30%地点と60%地点にランダム設置」)。
              // 30%地点=ゴールから全体距離の30%手前(=スタートから70%)、60%地点も同様に逆算。
              // ランダム要素: X±LAB_AMMO_JITTER_X の散らし + Y は歩ける帯の中(拾いに行ける位置)。
              ...LAB_AMMO_GOAL_FRACS.map((frac, i) => {
                const x = labDoc.x * (1 - frac) + labDoc.side * (Math.random() * 2 - 1) * LAB_AMMO_JITTER_X;
                const y = (Math.random() * 2 - 1) * (LAB_CORRIDOR_Y_LIMIT_PX - 40);
                return { id: `lab-phill-${i}`, x: x - 8, y: y - 8, type: 'ammo-phill' as const, value: 0 };
              }),
            ]
          : [];
      // ★v0.25.3137(社長指示「ステージ7(ボスモードも)は、最初に宝箱が目の前に初期設置」):
      // ステージ7の出撃だけ、開幕でプレイヤーのすぐ前に宝箱を1個置く。
      // **ボスモード(練習ラン)も自動で入る**——練習の出撃も「stage-7へ出撃する」形で走るので、
      // ステージIDで判定すれば1つの条件で両方を満たす(練習かどうかを別途見に行かない=分岐を増やさない)。
      // 中身は宝箱の受け取り側(case 'chest')が持つ: tier2-3の銃1丁 + 3レベルアップ。
      if (getSelectedStageId() === 'stage-7') {
        // 社長指示v0.25.3298「ステージ7の宝箱廃止。代わりに秘密箱設置(グレネードも出ることになる)」:
        // ★v0.25.3644(金箱統一): 旧・秘密兵器箱(secret:true)は金箱(bounty-chest)へ改名・統一。
        // 中身は金箱の共通仕様(武器抽選3回=glauncher含む4カテゴリ+赤経験値20個+スクラップ10倍)。
        // 位置=従来どおり画面下ギリギリ外。確定設置なので5%抽選は通さず直接この型で置く。
        runPickups.push({
          id: 'stage7-start-chest',
          x: spawnTL.x,
          y: spawnTL.y + state.gameBounds.height / 2 + BOSS_START_CHEST_BELOW_MARGIN_PX,
          type: 'bounty-chest',
          value: 1,
        });
      }
      // PACING_PUZZLE.md §10-20#10(EX舞台の洋館通路化・金箱1個目「スタートの少し上に1つ」):
      // 走り込み入場(入力ロック自動前進380px)の終端(y<=0で解除)より奥(y≈-500)+中央から横に
      // 約80pxずらす=入場ロック中に踏んで自動取得になるのを防ぐ(★再監査#10)。stage-7の開始金箱
      // (resetGameの静的runPickups)と同じ機構=実行時addPickupではなくここで静的に置く。
      if (corridorMode && isExStageRun()) {
        runPickups.push({
          id: 'ex-start-chest',
          x: 80 - 8,
          y: -500 - 8,
          type: 'bounty-chest',
          value: 1,
        });
      }

      // 壁/UVバーは区画ごとに手続き生成(labWallsInRegion/labUvBarsInRegion)するので reset では持たない。
      // World is infinite; player starts at the origin and the camera
      // follows. No need to pre-center within bounds.
      // 護衛NPCの名簿は1度だけ作り、出撃セリフ(sortie)も同じロスターから選ぶ(フェイザー等のランダム名簿に追従)。
      // チュートリアル: 通常の護衛4人は出さず、随行NPC(軍人+衛生兵・追従)を出す(社長指示v0.25.1823)。
      // 出撃セリフ(sortieEsc)はチュートリアルでは使わない(セリフは全てイベントで特別に組む)。
      // storyBoss ステージ(M7=グレン戦/EX)は護衛NPCを出さない(社長指示v0.25.1876「M7はNPCいない予定」。
      // 拠点占拠の無いボス直行ステージなので護衛4人は元々そぐわない)。
      // v0.25.2589(社長指示「ボスモードではNPC出撃しないで」): ボス戦テスト出撃(強制出現フラグ付き)は
      // 護衛NPCを出さない。ボスと守護霊の挙動だけを見る場のため、NPCの射撃・セリフ・拠点占拠が混ざると
      // 観測が汚れる(storyBossステージが護衛を出さないのと同じ理由)。通常出撃には影響しない。
      // PACING_PUZZLE.md §10-20#1(★監査#1): corridor化だけではNPCは消えない(護衛4人の抑止は
      // pendingStoryBossのみ・EXはstoryBossOnlyを既に廃止済みでpendingStoryBossが立たない)。
      // EX専用分岐として明示的に除外する(社長裁定「景色全体が違う。NPCも居ちゃってる」)。
      // エンディング(仮組み)も護衛NPCを出さない=NPC0(見せるだけのステージ・ENDING_SCENE.md)。
      const escortRoster = (indoor || stageTheme === 'lab' || state.pendingStoryBoss || BOSS_TEST_RUN || isPracticeRun() || (corridorMode && isExStageRun()) || farBackdrop === 'ending') ? []
        : farBackdrop === 'tutorial' ? makeTutorialCompanions(spawnTL.x, spawnTL.y)
        : makeEscorts(spawnTL.x, spawnTL.y, corridorMode);
      const sortieEsc = (escortRoster.length && farBackdrop !== 'tutorial') ? escortRoster[Math.floor(Math.random() * escortRoster.length)] : null;
      const sortieSol = sortieEsc ? BASE_SOLDIERS[((sortieEsc.soldierIndex % BASE_SOLDIERS.length) + BASE_SOLDIERS.length) % BASE_SOLDIERS.length] : null;
      return {
        unlockedShopSkillCards: runShopUnlocks,
        indoorMode: indoor,
        corridorMode,
        exBarrier: { northLockY: null, southLockY: null }, // 新ランで必ず解除状態から始める
        stageTheme,
        labRadioX: labIdol?.x ?? null,
        farBackdrop,
        nearHorizon,
        hiddenBoss,
        bossChasing: false,
        bossFightNow: false,
        bossFightLastTrueAt: 0,
        castleFightNow: false,
        bossCorpse: null,
        glenForm2SpawnAt: null,
        hiddenBossDefeated: false,
        // 病院/武器庫/警察署は通常ステージ(屋外・森スキン・通路/ダンステストでない)にだけ立つ。
        // §6.24 M48: 位置はこのランで確定した detourSectors(裏ボスのセクターを避けた3割り当て)を使う。
        // v0.25.3187: 角度を±30°散らす(セクター中心=拠点の延長線上に並ぶのをやめる)。乱数はここで
        // 1度だけ引いて位置を確定(pois/矢印は store の実位置を読むので自動で一致する)。
        hospital: detourSectors ? hospitalSpot(detourSectors.hospital, detourAngleOffset(Math.random())) : null,
        hospitalDwellMs: 0,
        hospitalTaken: false,
        hospitalTakenAt: 0,
        armory: detourSectors ? armorySpot(detourSectors.armory, detourAngleOffset(Math.random())) : null,
        armoryDwellMs: 0,
        armoryTaken: false,
        armoryTakenAt: 0,
        police: detourSectors ? policeSpot(detourSectors.police, detourAngleOffset(Math.random())) : null,
        policeTaken: false,
        policeTakenAt: 0,
        poiIntelShown: emptyPoiIntelShown(), // §6.24-UX: 進入時の通信は「1ラン1回/種」=新ランで戻す

        kogarasuUnlockedThisRun: false,
        labDoors: runDoors,
        labButtons: runButtons,
        labProps: runProps,
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
        // v0.25.3082(社長指示「実機テストに、守護霊をソロで出撃させたい(強さをコピーして出撃)」):
        // ?sologhost=1 の時だけ、保存済みの守護霊ビルドを**そのまま**プレイヤーへ被せる。
        // 守護霊は召喚しない=「守護霊ではないけど同じ強さ」。未計測の端末は素通し(通常出撃)。
        player: applyGhostBuildToPlayer({
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
          level: runPlayerLevel,
          experienceToNextLevel: runExpToNextLevel,
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
          counterWindowStart: 0,
    counterWindowEnd: 0,
    pendingSwingAt: 0,
    lungeVx: 0,
    lungeVy: 0,
    lungeUntil: 0,
    trapDebuffUntil: 0,
          counterCooldownEnd: 0,
          lastCounterSuccessTime: 0,
          ammoHandgun: AMMO_INITIAL.handgun,
          ammoShotgun: AMMO_INITIAL.shotgun,
          ammoRifle: AMMO_INITIAL.rifle,
          ammoPhill: AMMO_INITIAL.phill,
          ammoGlauncher: AMMO_INITIAL.glauncher, // ★v0.25.4000: 独立プール(社長指示「グレランは弾を分けて」)
          // 育成の焼き値(上の「★焼き込みの原則」)。ラン中の参照先はここ。
          growthAtkMult: bakedGrowthAtkMult,
          growthScoreMult: bakedGrowthScoreMult,
          stageScoreMult: bakedStageScoreMult,
          growthAmmoMax: bakedGrowthAmmoMax,
          growthGoldMult: bakedGrowthGoldMult,
          growthXpMult: bakedGrowthXpMult,
          ddaBaseHp: bakedDdaBaseHp,
          critChance: 0,
          quickMagCritUntil: 0,
          reloadEndsAt: 0,
          reloadingWeaponId: '',
          meleeSwingAt: 0,
          meleeSwingCommitAt: 0,
          meleeSwingPressedAt: 0,
          lastDamagedAtGame: 0,
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
          fireShooterCdUntil: 0, reflexCdUntil: 0, slasherChainReadyAt: 0, slasherStrikeStep: 0, slasherReach: 0, slasherQueuedTap: false,
    bloodTreadNextAt: 0, // SKILL_BUILD_REDESIGN.md §28(B7): 血の履帯(blood-treads)の次の棘設置可能gameTime
    scavengerBuffUntil: 0, marksmanMovingSince: 0, heavyGunnerExpBuffUntil: 0,
    speedRampSustainMs: 0, speedRampDirX: 0, speedRampDirY: 0,
    phillReticleDX: 0, phillReticleDY: 0, phillSnapEnemyId: null,
          benkeiBuffUntil: 0, benkeiCdUntil: 0, counterMasterBuffUntil: 0,
          seekerUntil: 0, seekerCdUntil: 0,
          consumableScrapUntil: 0, consumableAttackUntil: 0, consumableSpeedUntil: 0,
          consumableXpUntil: 0, consumableProtectionUntil: 0,
          overclockLightUntil: 0,
          subWeaponLevels: runLevels,
          subWeaponCooldowns: {},
          huntingChargeStartedAt: 0,
          huntingCharged: false,
          // 刀の一閃/ワイヤーの状態(共通型)を全ゼロへ。値は従来と同一。
          ...emptyDashState(),
          shijinSlideUntil: 0,
          shijinSlideDirX: 0,
          shijinSlideDirY: 0,
          skaterStopUntil: 0,
          skaterRiding: false,
          skaterRideStartAt: 0,
          straps: state.startWithTestStraps ? 1000 : 0,
          vaccineRevives: 0,
          equipment: runLoadout,
          equipBonus: runEquipBonus
        }, soloGhostRequested() ? loadPlayerProfile()?.snapshot : undefined),
        // SKILL_BUILD_REDESIGN.md §17(B1): ラン内ビルド台帳+リロール/バニッシュ/覚醒フックを
        // ラン開始でリセット(§8点8「resetGameで必ずリセット」と同じ型=足し忘れ再発防止)。
        runBuild: [...runSkills],
        vanishedSkills: [],
        rerollsUsedThisRun: 0,
        skillAwakenAt: {},
        awakenCutin: null,
        // 登場演出をアーム(初フレームで終了時刻確定)。練習モードは演出なし。
        // チュートリアル(地下洞窟)もヘリ降下演出なし(社長指示v0.25.1818「何もかも無し。全てイベントで特別仕様のみ」)。
        // 洋館(corridorMode)はヘリ登場なし=走り込み入場(v0.25.2110・社長指示)。
        // リトライ(もう一度プレイ)のM7はヘリも無し=即ボス(社長指示v0.25.2462)。
        // エンディング(仮組み)もヘリ登場なし(ENDING_SCENE.md 演出仕様v2 §5)。
        introUntil: (state.danceTestMode || farBackdrop === 'tutorial' || farBackdrop === 'ending' || corridorMode
          || (state.pendingRetryRun && getSelectedStageId() === 'stage-7')) ? 0 : -1,
        corridorRunInActive: corridorMode,
        introDialogueActive: false,
        introDialogueStartedAt: 0,
        // リトライは「この登場のセリフは出さない」扱い=trueで再積みを防ぐ。M7ではこのフラグが
        // グレン咆哮(グガガガ)の出現ゲートの前提条件でもあるため、trueにしないとボスが永久に出ない。
        introDialogueShown: state.pendingRetryRun,
        pendingRetryRun: false, // consume(次の通常出撃へ持ち越さない)
        reaperCross: null,
        enemies: runEnemies,
        pickups: runPickups,
        projectiles: [],
        skadiIceMarkers: [],
        skadiIceBlades: [],
        homingLocks: [],
        shadowClone: null,
        groundFires: [],
        bloodSpikes: [],
        gravityWells: [],
        bossFires: [],
        acrasielSpears: [],
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
        hudDirector: { koma: 'relax', rank: 1 },
        // 屋内は指定がない限り「最初の部屋に武器商人のみ」。ボス部屋(城)/二人組(クエストNPC)は不在。
        // 城/死神/クエストの“発生”は useGameLoop 側で既に !indoor ゲート済み。商人は最初の部屋へ配置。
        // 洋館通路: 城なし(v0.25.2144・社長指示「城も出現しないで」)。遥か遠方に置く=描画カリング/
        // 衝突/接近系が全て自然に無効。5分の城ボスはuseGameLoop側でcorridorModeゲート
        // (bossSpawnedはfalseのまま=画面端マーカーも出ない)。
        castleEvent: corridorMode ? { x: 100000, y: 100000, bossSpawned: false } : createCastleEvent(),
        weaponMerchant: indoor
          ? { x: LAB_MERCHANT.x, y: LAB_MERCHANT.y, radius: MERCHANT_INTERACT_RADIUS }
          // チュートリアル: 商人も出さない(社長指示v0.25.1818)。不在状態が型に無いため到達不能座標へ
          // (描画は画面外カリング・interactは距離判定=radius 0 で成立しない)。
          // ボスメーカーの部屋も同じく商人を出さない(§1-1「部屋にはプレイヤーとボスだけ」・社長指示v0.25.2628)。
          // 既定配置(y:-130)は**ちょうど交戦距離**なので、居ると必ず視界に入って邪魔になる。
          // v0.25.3138(社長指示「ボスモードでは武器商人は設置しない」): 練習ラン(ボスモード)も同じ扱い。
          // ボスモードは「1体と戦うだけ」の場なので、開幕の視界に商人が居ると邪魔になる
          // (ボスメーカーの部屋と同じ理由)。到達不能座標=不在の作法もそのまま流用する。
          // PACING_PUZZLE.md §10-20#1(★監査#1): M6通路はcorridor化だけでは商人が消えない仕様
          // (corridor除外なし)。EXだけ専用分岐で除外する(社長裁定「NPCも居ちゃってる」・護衛と同じ理由)。
          // エンディング(観賞シーン)も商人なし(社長報告2026-08-29「エンディングに武器商人がいる」。
          // 既定配置 x:0,y:-130 は出撃地点の目の前=必ず視界に入っていた)。
          // ★storyBossステージ(M7=指定座標地点)も商人なし(社長報告2026-08-29「指定座標地点に
          // 武器商人がいる。いないはず」。M7は会話→ボス→勝利だけの一騎打ちステージ=通常湧き/
          // イベント全停止なのに、商人だけこの除外に入っていなかった。護衛NPC除外(escortRoster)と
          // 同じ pendingStoryBoss を見る)。
          : (farBackdrop === 'tutorial' || farBackdrop === 'ending' || state.pendingStoryBoss || bossMakerRoom || isPracticeRun() || (corridorMode && isExStageRun()))
            ? { x: 1e9, y: 1e9, radius: 0 }
            // 研究所(屋外・横長廊下)は上下固定クランプ(±100)の外(y:-130)に商人がいると一生話しかけ
            // られない(M2_LAB_CORRIDOR_SPEC.md ★未決2・社長承認で追加)。labThemeだけYを上書きし、
            // 他ステージの共通配置(y:-130)には触れない。
            : stageTheme === 'lab'
              ? { ...createWeaponMerchant(), y: LAB_MERCHANT_Y }
              : createWeaponMerchant(),
        // 二人組(クエストNPC): クエスト設定のあるステージ(1/3/4/5)のみ出現(社長裁定v0.25.1686 #6)。
        // サブ納品済みステージにも以後出現しない(そのプレイ中に消えないのは completeEventQuest 側)。
        // v2(EVENT_QUEST_DESIGN.md §2-1): 通常出撃のみに絞る。「このランでクエストが有効か」の
        // 唯一の出どころ=この qGone(以後は eventQuestNpc.status !== 'gone' の1本を読む・§2-1)。
        eventQuestNpc: (() => {
          const qCfg = getEventQuestConfig(getSelectedStageId());
          // ボスメーカーの部屋では二人組クエストNPCも出さない(社長指示v0.25.2628「npcじゃま」)。
          // ★社長指示2026-08-26「ボスモードに二人組がいるのはおかしい」: 練習ラン(ボスモード)も出さない
          // (商人のv3138と同じ扱い。ゲートにisPracticeRun()が漏れていた)。
          // v2 §2-1: ガントレット/EX/フリー(周回)/ベンチ/洋館通路/訓練M0/屋内・ラボ/再訪も追加で除外
          // (以前は4条件しか見ておらず、これらのランでも二人組が出てしまっていた)。
          const qGone = bossMakerRoom || isPracticeRun() || isGauntletRun() || isExStageRun()
            || getSelectedFreeMode() || state.benchmarkRun || corridorMode || indoor
            || stageTheme === 'lab' || farBackdrop === 'tutorial' || state.pendingRevisit
            // §2-10: 完了フラグは delivered 基準(旧 .sub は撤去)。
            || !qCfg || getEventQuestMeta(getSelectedStageId()).delivered;
          return qGone ? { ...createEventQuestNpc(), status: 'gone' as const } : createEventQuestNpc();
        })(),
        eventQuestActive: null,
        eventQuestKills: 0,
        eventQuestGoalCount: 0,
        eventQuestGoalTier: null,
        // 二人組クエストv2のこのラン状態フィールド(§2-14)。ラン跨ぎで残さない。
        rescueClearedAt: 0,
        rescueArenaStartedAt: 0,
        deliveryLocked: false,
        castleAttnDoneAt: 0,
        rescueSpawnedAt: 0,
        basesEverCaptured: 0,
        // サブクエスト: ラン内の表示/集計はここで空に戻す(補充は startGame が resetGame の**後**に呼ぶ)。
        // subquestClearSeq はセッション通しの通し番号なので**リセットしない**(0へ戻すと
        // useGameLoop側の「変化したら鳴らす」が出撃の瞬間に誤爆する)。
        subquests: [],
        subquestGoldEarned: 0,
        hunterChaseSince: null,
        gameTime: 0,
        realGameTime: 0,
        isPaused: false,
        showUpgradeMenu: false,
        showShopMenu: false,
        showEventQuestMenu: false,
        shopReopenAt: 0,
        merchantDwellMs: 0,
        vaccinePurchased: false,
        gameWon: false,
        finaleDefeated: false,
        storyReturnPromptVisible: false,
        // 洋館通路は拠点なし(v0.25.2128)。**訓練(M0)も拠点なし**(社長報告v0.25.2313
        // 「チュートリアルステージに拠点サークルぽいのがある、削除」)。制圧イベント自体は
        // v0.25.1818で止めていたが、**サークルの実体(baseSites)は作られたままで描画されていた**。
        baseSites: (corridorMode || farBackdrop === 'tutorial' || farBackdrop === 'ending') ? [] : createBaseSites(),
        // 護衛NPC: 屋外(非ラボ)のみ出撃地点に4人配置。屋内/ラボでは出さない。
        escorts: escortRoster,
        // エンディング(仮組み・ENDING_SCENE.md 演出仕様v2 §3/§9): 専用配列を新ランごとに初期化
        // (2周目に前回の兵士が残らないように)。escortsとは別配列(相乗りしない)。
        endingSoldiers: farBackdrop === 'ending'
          ? createInitialEndingSoldiers(ENDING_SOLDIER_COUNT, spawnTL.x + ENDING_SOLDIER_SPAWN_RIGHT_X, ENDING_SOLDIER_SPAWN_SPAN_X)
          : [],
        endingPhill: farBackdrop === 'ending' ? createInitialEndingPhill() : null,
        endingBombs: [],           // 爆撃(v3.1・監査B-2): 2周目に前回の弾を持ち越さない
        endingBombNextAt: 0,
        endingBombingEnabled: true,
        endingFinaleHitAt: 0,
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
        // updateReturnPhaseは returnCircle があれば毎フレーム動く=5秒滞在で任務達成(既存経路)。
        // 洋館通路(corridorMode)も同方式で常設(社長指示v0.25.2132): 4000px付近のハッチ床上・5秒滞在=ゴール。
        // 訓練(M0)のゴールサークルは**廃止**(社長指示v0.25.2302「チュートリアルのゴールが目的が
        // 変わって意味をなさないので削除」)。M0の終わりは終盤シーケンス(グレッグ死亡カットシーン →
        // フレアガン受領 → ランク1一巡のダンジョン → その先のゴール)で決まる。実装までM0は未完了のまま。
        // PACING_PUZZLE.md §10-20#8(★監査#5): EXはこの帰還サークルを生成しない(動線-3000→-5000で
        // 必ず踏み「帰還完了」誤クリアになるため)。EXの勝利はフィル撃破→フェード(§10-20#3(b)近傍の
        // useGameLoop EX専用ブロック)で直接確定する=帰還サークル自体が不要。
        returnCircle: (corridorMode && !isExStageRun())
            ? { x: 0, y: CORRIDOR_GOAL_Y, radius: RETURN_CIRCLE_RADIUS, dwellMs: 0 }
            : null,
        tutorialPopup: null,
        tutorialPopupShown: false,
        // 訓練(M0)は**教わるまで封印**(社長指示v0.25.2293)。近接もクリティカルも、その教習で解禁するまで出ない。
        // 他ステージは常に全解禁。
        m0Unlocked: farBackdrop === 'tutorial'
          ? { melee: false, crit: false, ammo: false }
          : { melee: true, crit: true, ammo: true },
        m0MeleeHits: 0,
        m0CritDrill: false,
        m0AdvanceLimitX: farBackdrop === 'tutorial' ? M0_CONVO_ADVANCE_LIMIT_X : null,
        gameReturned: false,
        exOutroFading: false, // ★v0.25.3743: EX勝利フェードの残留防止(次ランで黒画面のままになる事故)
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
          hitsTaken: 0,
          minHpFrac: 1,
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
  killFx: null,
  kamitsukiFx: null,
  attention: null,
  practiceWinPendingSince: null,
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
        viewZoom: 1,
        hurricane: null,
        summons: [],
        rescueSurvivors: [],
      };
    });
    // SKILL_BUILD_REDESIGN.md §15-1(B0発注文)+§13-4+§21-1(B5): DDA係数の新旧並記ログ。
    // B5でcountの入力を、実際にspawnEscalation()へ渡している値(runBuild.length)へ揃えた
    // (旧: player.skills.length=pre-B1の代用値)。出撃時点の1回だけ記録すれば足りる点は
    // 従来どおり(per-frame走査ではない)。
    recordDdaCoefficients(get().runBuild.length, get().gameTime);
  },

  setCameraPosition: (x, y) => {
    // Infinite world: the camera follows the player one-to-one with no clamp.
    set({ camera: { x, y } });
  },

  // 現地へカメラアテンション(時間停止)。fromCam=開始時カメラ(戻り先)。hitstop で全体凍結し、カメラだけ loop が動かす。
  // §6.36: cutin付きは hold の後に cutinMs(1100)だけカメラ静止のまま延長し、DOM(BossCutin.tsx)が
  // 名前+絵を出す。first-wins: attention生存中に新旧どちらかがcutin持ちなら後着を無視(純関数で判定)。
  // 素のattention同士は従来どおり上書き=挙動不変。
  triggerAttention: (x, y, cutin, extraHoldMs = 0) => {
    const prev = get().attention;
    if (shouldIgnoreAttention(prev !== null, !!prev?.cutin, !!cutin)) return;
    const cam = get().camera;
    // v0.25.2958(社長指示「やはり前のバージョンに戻して」): カットインは hold の後に cutinMs(1100)を
    // 挟む=in→hold→cutin→out。hitstop も延長する(v0.25.2956の「開始と同時」は撤回)。
    const cutinMs = cutin ? BOSS_CUTIN_MS : 0;
    // 社長指示(v0.25.2998→2999)「ボス出現アテンションの紹介前の止まり、半分にして」:
    // cutin付き(=ボス紹介)だけホールドを半分(1900→950ms)。素のattention(救援/討伐シネマ)は従来尺。
    // extraHoldMs(v0.25.3026): 討伐シネマが崩壊を見届けるための延長ぶん(下のdramaticDeath参照)。
    const holdMs = (cutin ? Math.round(ATTENTION_HOLD_MS / 2) : ATTENTION_HOLD_MS) + extraHoldMs;
    set({
      attention: { x, y, startReal: Date.now(), fromCamX: cam.x, fromCamY: cam.y, holdMs, ...(cutin ? { cutin, cutinMs } : {}) },
      hitstopUntil: Date.now() + ATTENTION_IN_MS + holdMs + ATTENTION_OUT_MS + cutinMs,
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

  triggerHitImpact: (stopMs, shakeMs, shakeMag, zoomMag, targetX, targetY) => {
    // カウンター/バッシュの衝撃: 寄りパンチズームは命中の瞬間に即(=早く寄る)。
    // ストップを入れ、揺れはストップ後に(止まりが揺れに埋もれないよう)。
    // ダンス中(四神舞)は gameTime を止めるとリズムが乱れるためストップ抜き=全て即時。
    // v0.25.2585: targetX/Y 指定時はその点へ寄る(守護霊のカウンター=成立位置)。未指定は従来どおり中央。
    get().triggerZoom(zoomMag, MELEE_FINISH_SLOW_MS, MELEE_FINISH_SLOW_HOLD_MS, targetX, targetY); // 即・寄り(スローと同期)
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

  triggerFinishImpact: (targetX, targetY, forceMaximumZoom = false) => {
    const now = Date.now();
    // 致命の一撃は通常KILLの10秒CDや、直前のズームの残り具合に左右されない。
    // 一度ズーム包絡を切ってから最大倍率を対象中心へ掛け直し、必ず「最大まで寄る1イベント」にする。
    const triggerMaximumZoom = (durationMs: number, holdMs: number) => {
      if (forceMaximumZoom) {
        set({
          zoomUntil: 0, zoomMag: 0, zoomStart: 0, zoomHoldMs: 0,
          zoomHasTarget: false, zoomTargetX: 0, zoomTargetY: 0,
        });
      }
      get().triggerZoom(MELEE_FINISH_ZOOM_MAG, durationMs, holdMs, targetX, targetY);
    };
    if (!JUICE_ENABLED) {
      // ?juice=0: このバッチ以前の演出へ完全復帰(A/B比較用)。ズームだけCD、スロー/揺れは毎回。
      // ただし致命の一撃だけは比較モードでも確定仕様を優先し、必ず最大ズームを出す。
      if (forceMaximumZoom || now - get().lastKillZoomAt >= MELEE_FINISH_ZOOM_CD_MS) {
        triggerMaximumZoom(MELEE_FINISH_ZOOM_MS, MELEE_FINISH_ZOOM_HOLD_MS);
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
    const fullCinematic = forceMaximumZoom || shouldFireFullJuiceCinematic(now, get().lastKillZoomAt, JUICE_CD_MS);
    if (fullCinematic) {
      set({ lastKillZoomAt: now });
      get().triggerHitstop(HITSTOP_MS); // KILLにもカウンターと同じフリーズを追加(旧仕様は素通りだった)
      // ズームをスローと同じ長さ/holdへ統一(旧仕様の専用MELEE_FINISH_ZOOM_MS/HOLD_MSは使わない)。
      triggerMaximumZoom(MELEE_FINISH_SLOW_MS, MELEE_FINISH_SLOW_HOLD_MS);
      get().triggerTimeSlow(0.2, MELEE_FINISH_SLOW_MS, MELEE_FINISH_SLOW_HOLD_MS);
      setTimeout(() => get().triggerShake(MELEE_FINISH_SHAKE_MS, MELEE_FINISH_SHAKE_MAG), HITSTOP_MS);
    } else if (JUICE_MIN_FLASH_ENABLED) {
      get().spawnFlash('rgba(255,255,255,0.22)', JUICE_MIN_FLASH_MS);
    }
    return fullCinematic;
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

  // v0.25.3078(社長指示「ラフィみたいな骨とか氷とか飛んでくるやつ、予兆が少し欲しいので、本体から
  // それらが扇状にドバッ!と全方位に(飛ぶ本数)飛んでいくモーション追加したい」):
  // **これから飛ぶ本数と同じ数**の絵を本体から全方位へ撒く。判定ゼロ(分類②の派手枠)=
  // 実際の攻撃の本数・向き・タイミング・ダメージには一切触れない「見せるだけ」の予兆。
  spawnFanBurst: (x, y, texture, count, opts) => {
    const n = Math.max(1, Math.floor(count));
    const speed = opts?.speed ?? 420;
    const spread = opts?.spreadRad ?? Math.PI * 2;   // 既定=全方位
    const base = opts?.baseAngle ?? 0;
    const now = Date.now();
    for (let i = 0; i < n; i++) {
      // 均等割り+わずかなゆらぎ(完全な等間隔は機械的に見える)。全方位のときは端を重ねない。
      const a = base + (spread >= Math.PI * 2 ? (i / n) * spread : (i / Math.max(1, n - 1) - 0.5) * spread)
        + (Math.random() - 0.5) * 0.18;
      get().spawnEffect({
        kind: 'image', id: `fanb-${now}-${i}-${(Math.random() * 1e6) | 0}`,
        x, y, createdAt: now, duration: opts?.durationMs ?? 380,
        texture, scale: opts?.scale ?? 0.5,
        // v0.25.3081(社長報告「横向きで飛んだりしてる」): 刃の絵は素材ごとに刃先の向きが違う。
        // 本物の刃と**同じ補正**を引いて、刃先を必ず進行方向へ向ける(値の出どころは bladeArt.ts 1箇所)。
        rot: a - bladeNativeAngle(texture),
        driftX: Math.cos(a) * speed, driftY: Math.sin(a) * speed,
      });
    }
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

  // 爆発の6コマflipbook(社長支給v0.25.3283「爆発 全部用」)。全ての爆発FXがこれを呼ぶ
  // (手榴弾/タレット/ドローン/地雷/ランチャー/ファイアシューター/ボムカウンター/反射神経/処刑の爆発/朱雀)。
  spawnExplosionFx: (x, y, radius, tint) => {
    get().spawnEffect({
      kind: 'explosion', id: `fx-expl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      x, y, radius, createdAt: Date.now(), duration: 460, tint,
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

  spawnGlow: (x, y, radius, color, duration = 320, noShadow = false) => {
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
        duration: tunedDuration,
        ...(noShadow ? { noShadow: true as const } : {}),
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

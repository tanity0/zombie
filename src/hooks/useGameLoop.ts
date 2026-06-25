import { useCallback, useEffect, useRef, useState } from 'react';
import {
  useGameStore,
  INVULN_MS,
  COUNTER_EXTEND_PER_HIT,
  STUN_DURATION_MS,
  CRIT_DAMAGE_MULT,
  BOSS_CRIT_DAMAGE_MULT,
  MINE_DAMAGE,
  isKatanaMode,
  subWeaponBlockedByKatana,
  katanaRange,
  KATANA_SLASH_INTERVAL_MS,
  huntingMeleeRadius,
  PLAYER_INTRO_MS,
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
  WIRE_LAND_KNOCKBACK_SPEED, WIRE_PASS_DAMAGE_MULT, WIRE_BOMB_RADIUS, WIRE_BOMB_DAMAGE_MULT,
  KNOCKBACK_DURATION, KNOCKBACK_IMMUNE_MS,
  COUNTER_KNOCKBACK_LAUNCH, COUNTER_KNOCKBACK_SPEED,
  PLAYER_KNOCKBACK_SPEED, PLAYER_KNOCKBACK_MS,
  skillCritMult, skillOutgoingDamageMult, sniperGunMult, skillExplosionMult, hasSkill, skillLevel, skillComboMasterMult,
  skillSummonHpMult, heavyGunnerExplosionMult, enemyDeathLabel, isInReturnCircle, isSeekerActive, isGameTimeStopped, enemyMeleeDist,
  ATTENTION_IN_MS, ATTENTION_HOLD_MS, ATTENTION_OUT_MS, ATTENTION_TOTAL_MS
} from '../store/gameStore';
import { isPixiRenderer } from '../config/renderer';
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
  checkPlayerEnemyCollisions,
  checkPlayerPickupCollisions,
  checkProjectilePlayerCollisions,
  checkEnemySummonCollisions
} from '../utils/collisionUtils';
import {
  createEnemyProjectile,
  generateEnemy,
  getEnemyFireProfile,
  getEnemySpawnCount,
  getEnemySpawnInterval,
  isBossType,
  isHiddenBoss,
  spawnEnemyAt,
  selectLabEnemyType,
  resolveEnemyTarget,
  SPAWN_OFFSCREEN_MARGIN_FRAC,
  AREA_MAX_ENEMIES,
  isValidForArea
} from '../utils/enemyUtils';
import { labZoneKey, LAB_START_SAFE_RADIUS } from '../world/labWalls';
import { RESCUE_RADIUS, RESCUE_ATTACKERS } from '../world/rescue';
import { bossLairPos } from '../world/pois';
import { ALCHEMY_CHANNEL_MS, ALCHEMY_AGGRO_RANGE } from '../utils/summonUtils';
import { resolveAabb, rectsOverlap } from '../world/obstacles';
import { consumeDueWaves, newConsumedWaves } from '../utils/stageDirector';
import { fireWeapon, getActiveGun, getGuns } from '../utils/weaponUtils';
import { playSfx, playEnemyDeath, setHurricaneRumble, setDanceMode, getDanceBeatAnchorMs, prepareDeepReverseBgm, enterDeepReverseBgm, exitDeepReverseBgm, releaseDeepReverseBgm } from '../audio/audioManager';
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

const GRENADE_WEAPON_KEY = 'rifle-t3';
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
const TURRET_FWD_FIRE_MS = 130;                         // 前方集中の発射間隔(handgun-t3 cooldown 相当)
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
// 保証出現(社長指示): 一定時間経過時に、その種類が1体もいなければ画面外に1体だけ出す(エリア不問・各1回)。
const PLANT_GUARANTEE_MS = 60000;      // プラント: 1分経過で保証出現
const WEREWOLF_GUARANTEE_MS = 180000;  // 犬(werewolf): 3分経過で保証出現
// ジャイアント(城ボス)出現後、近づくまで城で待機する索敵範囲(これより近づくと起動)。
const GIANT_AGGRO_RANGE = 380;
// イベント出現の敵(囲い系=プレイヤー狙い)も「近づくまで向かってこない」。プレイヤーの周囲に湧くので
// この範囲なら出現直後にプレイヤーが居れば即起動する(救助の対NPC攻撃者・卵=静止プロップは対象外)。
const EVENT_SPAWN_AGGRO_RANGE = 300;

// --- 囲い系イベント(小イベント=強制アリーナ戦/ミニボス戦) ---
const ARENA_EVENT_CAP = 20;            // イベント中の同時敵上限(通常10→20。終了で10へ戻す)
const ARENA_EVENT_RADIUS = 210;        // 囲い半径(閉じ込め円)
const ARENA_FIRE_AFTER_MS = 120000;    // 初回発火時刻(=ゲーム開始2分)
const ARENA_FIRE_INTERVAL_MS = 120000; // 以降の発火間隔(=2分ごと。社長指示)
const ARENA_HORDE_COUNT = 18;          // ゾンビ版の初期湧き数(cap 20 以内)
const ARENA_HORDE_DURATION_MS = 30000; // ゾンビ版の制限時間保険(基本は全滅で終了)
const ARENA_BOSS_ADDS = 4;             // ボス版の取り巻きゾンビ数
const ARENA_BOSS_DURATION_MS = 60000;  // ボス版の制限時間保険(基本は撃破で終了)
const ARENA_END_GRACE_MS = 600;        // 開始直後にイベント敵0で誤終了しないためのグレース
const EVENT_BANNER_MS = 3500;          // イベント発生告知バナーの表示時間(gameTime ms)
// エリア(区域)遷移バナー: 距離帯を跨いだら区域名をイベント発生と同じUIで表示(社長指示)。
const AREA_BANNER_MS = 2600;           // 区域遷移バナーの表示時間(2〜3秒)
const AREA_ZONE_NAMES = ['軍備配置区域', '研究対象区域', 'デンジャーゾーン', '未確認汚染エリア', '深層域'];
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
// 救助イベントの発火位置(プレイヤーからの距離)。スタート地点直下に出さず、少し離して端マーカーで誘導。
// 実機で位置を見ながら調整するため定数化(?rescuemin / ?rescuemax で上書き可)。
const evNum = (key: string, def: number): number => {
  const v = evParam(key); const n = v != null ? Number(v) : NaN;
  return Number.isFinite(n) ? n : def;
};
const RESCUE_SPAWN_DIST_MIN = evNum('rescuemin', 500);
const RESCUE_SPAWN_DIST_MAX = evNum('rescuemax', 1000);
const FORCE_CASTLE_BOSS = evParam('castlenow') === '1'; // 城ボス即時
const FORCE_HIDDEN_BOSS = evParam('bossnow') === '1';   // テスト: 裏ボスをプレイヤーの近く(画面外)へ即出現
const WAVE_GRACE_MS = 10000;
const ENEMY_RECYCLE_DISTANCE_MULT = 0.86;

// --- 裏ボス(深層域の隠しボス: mimir/jormungand)コントローラ定数 ---
// 深層域(原点から 7500 以上=area 4)の「指定エリア」に近づくと1回だけ出現する。
const BOSS_SPAWN_DEPTH = evNum('bossdepth', 7800);   // この深度に到達で出現(area 4 の少し内側。巣が無いタイプ用の保険)
const BOSS_SPAWN_NEAR = 1500;                        // 巣(固定)へこの距離まで近づくと出現(=指定エリアに近づくと出現)
const BOSS_EXIT_DEPTH = 7300;                        // この深度を下回ると深層域を出た=帰巣して退場(ヒステリシス)
const BOSS_REGEN_PER_SEC = 40;                       // 画面外/帰巣中は毎秒この耐久値が回復(社長指示)
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
const BOSS_DASH_WINDUP_MS = 3000;                    // たまに3秒立ち止まり(社長指示)
const BOSS_DASH_MS = 3000;                           // その後2倍速で3秒追跡(社長指示)
const BOSS_DASH_CHANCE = 0.1;                        // 「たまーーーに」=低確率
const BOSS_FADE_MS = 2600;                           // 討伐時のFF風フェードアウト時間(描画側で使用)
// 裏ボスが障害物を踏み潰した時の爆破FX/SE/シェイク。森を突っ切ると同時破壊が多発しうるので「スロットル」で
// 一定間隔に1回だけ発火=per-frame Graphics(リング/バースト)を積み上げない安全弁(負荷の主因は数×描画法)。
const BOSS_CRUSH_FX_MS = 130;                        // 爆破FX/SE/シェイクの最短間隔(=最大~7回/秒)
const BOSS_CRUSH_SHAKE_MS = 130;                     // 「少し揺れる」程度の短い画面シェイク
const BOSS_CRUSH_SHAKE_MAG = 3;                      // 弱め(死神召喚などより控えめ)
const BOSS_SUMMON_AGGRO = 2000;                      // 裏ボスが召喚へ「吸い付く」最大距離(画面内の召喚は基本対象に)
let bossCtrlErrLogged = false;                       // 裏ボス制御例外のログは初回だけ(毎フレーム出さない)
let loopErrLogged = false;                           // ループ本体例外のログも初回だけ
// 屋内の固定敵が「画面外」と見なされて最初の定位置へ戻るまでの余白(プレイヤー=画面中心基準)。
// 画面の半分+この余白を超えたら確実に画面外なので home へ復帰させる。
const LAB_RETURN_HOME_MARGIN = 140;
const PICKUP_HARD_CAP = 120;
const XP_PICKUP_KEEP_COUNT = 82;
const STRAP_PICKUP_KEEP_COUNT = 60;
const CASTLE_BOSS_MIN_TIME_MS = 5 * 60 * 1000; // ただし出現は5分経過後のみ(社長指示=接近＋時間の両方)。?castlenow=1 は無視。
// 研究所スキンの湧き敵の索敵範囲(px)。この距離内 かつ 壁越しでない(視界)ときに休眠から起床。
const LAB_SPAWN_AGGRO_RANGE = 150;
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
  // 保証出現(プラント1分/犬3分)の発火済みフラグ。新ランで false に戻す。
  const plantGuaranteedRef = useRef(false);
  const werewolfGuaranteedRef = useRef(false);
  const boomReadyRef = useRef(true); // ドローンブーメランのCD明け検出(false→true でカチッSE+頭上マーク)
  const benkeiReadyRef = useRef(true); // 弁慶: 再発動CD明け検出(false→true で「閃き」フラッシュ)
  const bashHitFxRef = useRef(0);    // 盾バッシュ命中SEの既再生タイムスタンプ
  const rescueShootFxRef = useRef(0); // 救助NPC射撃SEの既再生タイムスタンプ
  const rescueRespawnRef = useRef(0); // 救助イベント: 次の攻撃者復活の予定 gameTime(0=空き無し/未予約)
  const whipHitFxRef = useRef(0);    // 鞭命中SE
  const whipSwingFxRef = useRef(0);  // 鞭振りSE
  const anchorPlantFxRef = useRef(0); // アンカー打ち込みSE(地面)
  const anchorEnemyHitFxRef = useRef(0); // アンカーが敵に当たった時のSE(近接命中音)
  const boomThrowFxRef = useRef(0);  // ブーメラン投擲SE
  const summonFxRef = useRef(0);     // 召喚SE
  const fpsCounterRef = useRef({ frames: 0, lastCheck: 0 });
  const introWasActiveRef = useRef(false); // キャラ登場演出中フラグ(着地検出用)
  const introHoldSinceRef = useRef(0);     // レンダラ初フレーム待ちで登場演出を保持し始めた時刻(まっくら防止のフェイルセーフ用)
  // Scripted-wave consumption set; survives across frames within one run
  // and is reset whenever gameTime rolls back to ~0 (i.e. a fresh game).
  const consumedWavesRef = useRef(newConsumedWaves());
  const nextArenaAtRef = useRef(FORCE_ARENA != null ? 0 : ARENA_FIRE_AFTER_MS); // 次の囲い系イベント発火時刻(gameTime ms)。約2分ごと。
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
  // ドローンブーメラン停止中の周囲パルス: boomerang id -> 次パルスの gameTime(ms)。
  const boomPulseRef = useRef<Map<string, number>>(new Map());
  // ワイヤーダッシュ着地の近接攻撃を1ダッシュにつき1回だけ発火させるためのマーカー
  // (処理済みの wireDashUntil を覚える。常に増加するタイムスタンプなので衝突しない)。
  const wireLandedDashRef = useRef(0);
  // ワイヤーダッシュ中に「通過した敵」へ自動近接する際、1ダッシュにつき敵1回だけ当てるための記録。
  const wirePassHitRef = useRef<{ dash: number; ids: Set<string> }>({ dash: 0, ids: new Set() });
  // 前方集中(連射)タレットの索敵スキャン角(rad)。射程に敵がいない間ゆっくり回転する。
  const turretAimRef = useRef<Map<string, number>>(new Map());
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
  // 追尾カメラの進行方向先読みオフセット(px、描画のみ。フレーム間で保持)。
  const camLookAheadRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  // ダンスタイムBGM切替の前回状態(リズムの active 変化を検出して setDanceMode する)。
  const danceModeRef = useRef<boolean>(false);
  // 死神(深奥リスク)システムの内部状態。新しいランで rewind 検出時にリセット。
  const reaperRef = useRef<{ risk: number; lastPassAt: number; passCount: number; chaserId: string | null; chaserSpawnAt: number; lastWarpAt: number; lastTimeRollAt: number; timeSpawned: boolean; warpAnimStartAt: number; warpToX: number; warpToY: number; warpTeleported: boolean }>(
    { risk: 0, lastPassAt: 0, passCount: 0, chaserId: null, chaserSpawnAt: 0, lastWarpAt: 0, lastTimeRollAt: 0, timeSpawned: false, warpAnimStartAt: 0, warpToX: 0, warpToY: 0, warpTeleported: false }
  );
  // 裏ボス(mimir/jormungand)コントローラの状態。spawned=この出撃で出現済みか(1回だけ)、
  // bossId=現在の敵id、lastX/Y=死亡位置検出用の直近座標。
  const bossRef = useRef<{ spawned: boolean; bossId: string | null; homeX: number; homeY: number; lastX: number; lastY: number; w: number; h: number; retreating: boolean; lastCrushFxAt: number }>(
    { spawned: false, bossId: null, homeX: 0, homeY: 0, lastX: 0, lastY: 0, w: 0, h: 0, retreating: false, lastCrushFxAt: 0 }
  );
  // 城ボスのアテンション遅延: 出現エフェクト(リング/グロウ/バースト)が消えてからカメラアテンションを出す
  // (出現直後だと演出で本体がぼやける・社長指示)。{at,x,y}=発火予定gameTime と注目座標。0=予約なし。
  const castleAttnRef = useRef<{ at: number; x: number; y: number }>({ at: 0, x: 0, y: 0 });
  // 拠点制圧カウントの直近値(増加検出で開放SEを鳴らす)。
  const suppCaptureCountRef = useRef<number>(0);
  // 直近の区域インデックス(エリア遷移バナー用)。-1=未判定(開始/リワインド直後は黙って採用し、開始地点では出さない)。
  const areaZoneRef = useRef<number>(-1);
  // ゾーン判定の間引き用カウンタ + 深層域BGM(逆再生)の現フェーズ。
  const zoneTickRef = useRef<number>(0);
  const deepBgmPhaseRef = useRef<DeepBgmPhase>('shallow');

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
    setHurricaneRumble(false); // 死亡で鳴動を止める(ループが回り続けても残響しない)
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
        playSfx('dance-kick'); // ジャスト成功 → キックドラム(拍踏み)
      } else if (pa.kind === 'flick') {
        // バッシュ(フリック): カウンター窓を開き、近接フィニッシュ可(execute=true)、
        // ノックバックは上限6(=距離2倍)で強く弾く。
        useGameStore.getState().openCounterWindow();
        const v = ARROW_VEC[pa.arrow];
        rhythmLineAttack(pcx, pcy, v.x, v.y, RHYTHM_FLICK_RANGE, RHYTHM_FLICK_HALF_W, RHYTHM_FLICK_DAMAGE, RHYTHM_FLICK_KNOCKBACK_MULT, true, RHYTHM_FLICK_KNOCKBACK_MAX);
        useGameStore.getState().spawnSlash(pcx + v.x * RHYTHM_FLICK_RANGE * 0.6, pcy + v.y * RHYTHM_FLICK_RANGE * 0.6, 'rgba(186,230,253,0.9)');
        // フリックの斬撃音(katana-dash)は無し。拍踏みのキックドラムのみ鳴らす。
        playSfx('dance-kick'); // フリックのジャスト成功でもキックドラム(拍踏み)
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
      if (!useGameStore.getState().isPaused) {
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
        // 範囲攻撃(爆発)の壁ブロック用。爆心地周辺の壁を1回だけ取得 → 各敵へ視線判定。
        // 爆発は時々のイベント+敵数上限なので軽い。屋内=lab壁 / 屋外=近傍の木。
        const aoeWalls = (cx: number, cy: number): Rect[] => {
          if (indoor) return [...labBlockingWalls(loopState.labDoors.filter(d => d.open).map(d => d.id)), ...loopState.labProps.map(p => p.rect)];
          const pad = 200;
          return treesInRegion(cx - pad, cy - pad, cx + pad, cy + pad).map(trunkRect);
        };
        // スロー中は倍率を一定にせず、開始倍率→1.0 へ滑らかにランプ(満了で等速に切り替わる
        // 「ぶつ切り」を解消)。ヒットストップ(全停止)はループ先頭で別途処理済み。
        let timeScale = 1;
        if (nowMs < loopState.timeSlowUntil) {
          const span = Math.max(1, loopState.timeSlowUntil - loopState.timeSlowStart);
          const k = Math.max(0, Math.min(1, (nowMs - loopState.timeSlowStart) / span));
          const ease = k * k * (3 - 2 * k); // smoothstep
          timeScale = loopState.timeSlowScale + (1 - loopState.timeSlowScale) * ease;
        }
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
          // 着地! 衝撃演出(リング/バースト/フラッシュ/軽いシェイク)。
          introWasActiveRef.current = false;
          const pcx = player.x + player.width / 2;
          const pcy = player.y + player.height / 2;
          spawnRing(pcx, pcy + 6, 8, 78, 'rgba(255,255,255,0.7)', 4, 300);
          spawnRing(pcx, pcy + 6, 4, 46, 'rgba(186,230,253,0.85)', 3, 380);
          spawnBurst(pcx, pcy + 10, '#cbd5e1', 16);
          spawnFlash('rgba(255,255,255,0.12)', 130);
          useGameStore.getState().triggerShake(INTRO_LAND_SHAKE_MS, INTRO_LAND_SHAKE_MAG);
          playSfx('heli-land'); // ヘリ着地SE(社長提供)
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

        // Update game time
        const newGameTime = gameTime + deltaTime * 1000;
        setGameTime(newGameTime);
        updateGameStats({ timeAlive: gameTime / 1000 });

        // Detect a fresh run (gameTime rewound to ~0) and reset scripted
        // wave consumption so the same player can re-fight the schedule.
        if (newGameTime < lastSeenGameTimeRef.current) {
          consumedWavesRef.current = newConsumedWaves();
          lastAmmoDropRef.current = 0;
          nextAmmoDropDelayRef.current = 0;
          cratesDroppedRef.current = 0;
          nextArenaAtRef.current = FORCE_ARENA != null ? 0 : ARENA_FIRE_AFTER_MS;
          reaperRef.current = { risk: 0, lastPassAt: 0, passCount: 0, chaserId: null, chaserSpawnAt: 0, lastWarpAt: 0, lastTimeRollAt: 0, timeSpawned: false, warpAnimStartAt: 0, warpToX: 0, warpToY: 0, warpTeleported: false };
          bossRef.current = { spawned: false, bossId: null, homeX: 0, homeY: 0, lastX: 0, lastY: 0, w: 0, h: 0, retreating: false, lastCrushFxAt: 0 };
          castleAttnRef.current = { at: 0, x: 0, y: 0 };
          suppCaptureCountRef.current = 0;
          areaZoneRef.current = -1; // 区域も再判定(リワインド/新ランで開始地点では出さない)
          plantGuaranteedRef.current = false;    // 保証出現フラグも再アーム
          werewolfGuaranteedRef.current = false;
          deepBgmPhaseRef.current = 'shallow'; releaseDeepReverseBgm(); // 深層BGMも初期化
        }
        lastSeenGameTimeRef.current = newGameTime;

        const castle = useGameStore.getState().castleEvent;
        // 城のフィナーレボス: 城に近づくと魔法陣の演出(錬金と同じ=magic-circle)で giantbat が出現(社長指示)。
        // 城は最初から固定設置。出現条件は「5分経過(時間)」のみ=その時刻に城の位置へ giantbat がポップ。
        // (社長指示: 接近不要。城マーカーはボス出現後に表示。?castlenow=1 は即時。)
        // 制圧イベント中(ステージ1メイン)は giantbat フィナーレを出さない(制圧が主目的)。
        const castleBossReady = (FORCE_CASTLE_BOSS || newGameTime >= CASTLE_BOSS_MIN_TIME_MS) && !useGameStore.getState().suppressionActive;
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
        if (!danceTest && !indoor && !labTheme) {
          const ae = useGameStore.getState().activeEvent;
          if (!ae) {
            // 発火: activeEvent中でない・次回発火時刻に到達(=約2分ごと)。排他制御は activeEvent と nextArenaAtRef で担保。
            // ?arenanow 指定時は初回を即時(nextArenaAtRef=0 初期化)→以降も2分間隔。
            // 裏ボスが追いかけてきている間はイベントを発生させない(社長指示)。
            const arenaReady = (FORCE_ARENA != null || newGameTime >= nextArenaAtRef.current) && !useGameStore.getState().bossChasing;
            if (arenaReady) {
              nextArenaAtRef.current = newGameTime + ARENA_FIRE_INTERVAL_MS; // 次回は2分後
              const pcx = player.x + player.width / 2;
              const pcy = player.y + player.height / 2;
              const kind: 'horde' | 'boss' | 'rescue' | 'egg' =
                FORCE_ARENA === 'horde' ? 'horde'
                : FORCE_ARENA === 'boss' ? 'boss'
                : FORCE_ARENA === 'rescue' ? 'rescue'
                : FORCE_ARENA === 'egg' ? 'egg'
                : (['horde', 'boss', 'rescue', 'egg'] as const)[Math.floor(Math.random() * 4)];
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
                const types: EnemyType[] = ['zombie', 'skeleton', 'bat'];
                for (let i = 0; i < ARENA_HORDE_COUNT; i++) {
                  const t = types[Math.floor(Math.random() * types.length)];
                  const pos = placeInRing(0.4);
                  const e = spawnEnemyAt(t, pos.x - 16, pos.y - 16, newGameTime);
                  e.fromEvent = true;
                  e.dormant = true; e.aggroRange = EVENT_SPAWN_AGGRO_RANGE; e.vx = 0; e.vy = 0; // 近づくまで向かってこない
                  addEnemy(e);
                }
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
            // 終了判定: 全滅(イベント敵0・開始直後グレース後) or 制限時間切れ。
            const eventEnemies = useGameStore.getState().enemies.filter(e => e.fromEvent).length;
            const cleared = newGameTime - ae.startedAt > ARENA_END_GRACE_MS && eventEnemies === 0;
            const timedOut = newGameTime >= ae.endsAt;
            if (cleared || timedOut) {
              if (cleared) {
                // クリア告知(発生バナーと同じ機構)。horde=駆除成功 / boss=討伐成功。
                useGameStore.setState({
                  eventBannerText: ae.kind === 'boss' ? '討伐成功！' : '駆除成功！',
                  eventBannerUntil: newGameTime + EVENT_BANNER_MS,
                });
                playSfx('event-clear'); // 小イベント完了音(成功時のみ)
              }
              useGameStore.getState().endArenaEvent(); // 拘束解除＋取りこぼし撤去
              spawnRing(ae.x, ae.y, ae.radius, ae.radius * 0.15, 'rgba(148,163,184,0.7)', 4, 520);
              spawnFlash('rgba(255,255,255,0.10)', 200);
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

        // --- 拠点候補地(仕様10): サークル内10秒滞在で制圧→武器商人が移動 ---
        useGameStore.getState().updateSuppression(deltaTime);
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
          const dist = eligible ? Math.hypot(player.x + player.width / 2, player.y + player.height / 2) : 0;
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
              useGameStore.setState({ eventBannerText: AREA_ZONE_NAMES[zoneIdx], eventBannerUntil: newGameTime + AREA_BANNER_MS });
              // 区域遷移音は「遠ざかる移動(外側=より深い区域へ)」のときだけ鳴らす。
              // 外側から内側へ戻る(zoneIdx が小さくなる)ときは鳴らさない(社長指示)。
              if (zoneIdx > prevZone) playSfx('event-start');
            }
          }
          const liveEnemies = useGameStore.getState().enemies;
          const chaserAlive = rs.chaserId != null && liveEnemies.some(e => e.id === rs.chaserId);
          // 討伐/消滅 → クールダウン(リスク0へ。深奥に居続ければまた溜まる)。
          if (rs.chaserId != null && !chaserAlive) { rs.chaserId = null; rs.risk = 0; rs.timeSpawned = false; rs.warpAnimStartAt = 0; }

          if (!chaserAlive) {
            // リスク更新(深奥滞在で増加・深奥外で減少)。
            if (depth >= REAPER_CONFIG.extremeDepthPx) rs.risk += REAPER_CONFIG.riskGainPerSecExtreme * deltaTime;
            else if (depth >= REAPER_CONFIG.spawnRiskDepthPx) rs.risk += REAPER_CONFIG.riskGainPerSecDeep * deltaTime;
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
            if (newGameTime >= REAPER_CONFIG.timeStartMs
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
              useGameStore.getState().triggerShake(REAPER_SUMMON_SHAKE_MS, REAPER_SUMMON_SHAKE_MAG); // 死神召喚=強めの画面シェイク
              rs.chaserId = chaser.id;
              rs.chaserSpawnAt = newGameTime;
              rs.lastWarpAt = newGameTime;
              rs.warpAnimStartAt = 0; rs.warpTeleported = false;
              rs.risk = REAPER_CONFIG.riskMax;
              spawnFlash('rgba(10,10,16,0.30)', 360);
              // SFX(完全出現の短い警告音)は専用アセット待ち。
            }
          } else {
            // プレイヤーがスタート(原点)付近 homeRadiusPx 内へ戻れば死神は去る=逃げ切り。リスクは0へクールダウン。
            // ただし「時間による死神」(timeSpawned)は時間制限のデスなので原点に戻っても去らない(逃げ場なし)。
            if (!rs.timeSpawned && Math.hypot(pcx, pcy) < REAPER_CONFIG.homeRadiusPx) {
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
              // 新規ワープ開始(アニメ中は再トリガーしない)。出現直後の最初の1回まではアニメをスキップ。
              if (rs.warpAnimStartAt === 0 && newGameTime - rs.lastWarpAt >= REAPER_CONFIG.warpIntervalMs) {
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
              useGameStore.setState({
                enemies: useGameStore.getState().enemies.map(e =>
                  e.id === rs.chaserId
                    ? {
                        ...e,
                        ...(teleportNow ? { x: rs.warpToX - e.width / 2, y: rs.warpToY - e.height / 2, vx: 0, vy: 0 } : {}),
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
          if (bs.bossId && !boss && !bs.retreating) {
            useGameStore.setState({
              bossChasing: false,
              hiddenBossDefeated: true,
              bossCorpse: { type: hiddenBoss, x: bs.lastX, y: bs.lastY, w: bs.w, h: bs.h, diedAt: Date.now() },
              eventBannerText: `${enemyDeathLabel(hiddenBoss)}討伐!`,
              eventBannerUntil: newGameTime + 3600,
            });
            useGameStore.getState().triggerShake(BOSS_FADE_MS, 5); // ゴゴゴゴ…と長く低い地鳴り
            spawnFlash('rgba(255,255,255,0.25)', 320);
            playSfx('boss-death'); // 裏ボス討伐(消滅)SE。長尺なのでフェードアウト付き(社長提供)
            bs.bossId = null;
          }

          if (!bs.bossId) {
            // 討伐後のフェード期間が終わったら corpse を片付ける。
            const corpse = useGameStore.getState().bossCorpse;
            if (corpse && Date.now() - corpse.diedAt >= BOSS_FADE_MS) useGameStore.setState({ bossCorpse: null });
            if (useGameStore.getState().bossChasing) useGameStore.setState({ bossChasing: false });

            // 未出現で、固定の巣(指定エリア)へ近づいたら出現(この出撃で1回だけ)。アテンション中は重ねない。
            // 巣を持たないタイプ(将来用)は従来どおり深層域の深度到達でフォールバック出現。
            // テスト: ?bossnow=1 のときは巣に関係なく「プレイヤーの近く・画面外(進行方向)」へ即出現。
            const lair = bossLairPos(hiddenBoss);
            const nearLair = lair ? Math.hypot(pcx - lair.x, pcy - lair.y) <= BOSS_SPAWN_NEAR : depth >= BOSS_SPAWN_DEPTH;
            if (!bs.spawned && (FORCE_HIDDEN_BOSS || nearLair) && !useGameStore.getState().attention && !isGameTimeStopped()) {
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
            const fireBullet = (tx: number, ty: number) => addProjectile(createEnemyProjectile(boss, player, tx, ty));

            const patch: Partial<typeof boss> = {};
            let chasing = false;
            let despawn = false;

            if (!inDeep) {
              // 深層域を出た → 巣へ帰り、着いたら退場(討伐扱いにしない)。帰巣中も回復する。
              bs.retreating = true;
              const dhx = bs.homeX - boss.x, dhy = bs.homeY - boss.y;
              const dl = Math.hypot(dhx, dhy);
              if (dl < 10) { despawn = true; }
              else {
                const mv = Math.min(speed * deltaTime, dl);
                patch.x = boss.x + (dhx / dl) * mv; patch.y = boss.y + (dhy / dl) * mv;
                patch.health = Math.min(boss.maxHealth, boss.health + BOSS_REGEN_PER_SEC * deltaTime);
                patch.bossState = 'return';
              }
            } else if (!onScreen) {
              // 画面外: 巣(下の定位置)へ戻りつつ毎秒40回復。追跡状態ではない。
              bs.retreating = false;
              const dhx = bs.homeX - boss.x, dhy = bs.homeY - boss.y;
              const dl = Math.hypot(dhx, dhy);
              if (dl > 1) { const mv = Math.min(speed * deltaTime, dl); patch.x = boss.x + (dhx / dl) * mv; patch.y = boss.y + (dhy / dl) * mv; }
              patch.health = Math.min(boss.maxHealth, boss.health + BOSS_REGEN_PER_SEC * deltaTime);
              patch.bossState = 'return';
            } else {
              // 画面内 & 深層域 → 追跡 + 攻撃状態機械。
              bs.retreating = false;
              chasing = true;
              // トラップ(root)/気絶(stun)中は移動も攻撃も止める=トラップ/スタンが効く(社長報告)。
              // ボスは updateEnemies を早期returnで素通りするため、ここで明示的に判定する。
              const frozen = (boss.rootUntil !== undefined && newGameTime < boss.rootUntil)
                || (boss.stunUntil !== undefined && newGameTime < boss.stunUntil);
              if (frozen) {
                patch.bossState = 'chase'; // 解除後はチェイスから再開
              } else {
              const st = boss.bossState ?? 'chase';
              // 追跡先=プレイヤー/召喚の「近い方」(社長指示)。通常敵と同じ resolveEnemyTarget で吸い付く。
              const chaseTgt = resolveEnemyTarget(boss, player, useGameStore.getState().summons, BOSS_SUMMON_AGGRO);
              const moveToward = (mult: number) => {
                const dpx = chaseTgt.x - bcx, dpy = chaseTgt.y - bcy;
                const dl = Math.hypot(dpx, dpy) || 1;
                const mv = speed * mult * deltaTime;
                patch.x = boss.x + (dpx / dl) * mv; patch.y = boss.y + (dpy / dl) * mv;
              };
              const nextActionDelay = () => newGameTime + BOSS_ACTION_MIN_MS + Math.random() * (BOSS_ACTION_MAX_MS - BOSS_ACTION_MIN_MS);
              if (st === 'chase') {
                moveToward(1);
                if (newGameTime >= (boss.bossNextActionAt ?? 0)) {
                  const r = Math.random();
                  if (r < BOSS_DASH_CHANCE) { patch.bossState = 'dash-windup'; patch.bossStateUntil = newGameTime + BOSS_DASH_WINDUP_MS; }
                  else if (r < BOSS_DASH_CHANCE + (1 - BOSS_DASH_CHANCE) / 2) { patch.bossState = 'aim-burst'; patch.bossStateUntil = newGameTime + BOSS_AIM_BURST_MS; }
                  else { patch.bossState = 'aim-radial'; patch.bossStateUntil = newGameTime + BOSS_AIM_RADIAL_MS; }
                }
              } else if (st === 'aim-burst') {
                if (newGameTime >= (boss.bossStateUntil ?? 0)) { patch.bossState = 'burst'; patch.bossBurstLeft = BOSS_BURST_SHOTS; patch.bossBurstNextAt = newGameTime; }
              } else if (st === 'burst') {
                const left = boss.bossBurstLeft ?? 0;
                if (left > 0 && newGameTime >= (boss.bossBurstNextAt ?? 0)) {
                  fireBullet(pcx, pcy);
                  patch.bossBurstLeft = left - 1;
                  patch.bossBurstNextAt = newGameTime + BOSS_BURST_GAP_MS;
                  if (left - 1 <= 0) { patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(); }
                }
              } else if (st === 'aim-radial') {
                if (newGameTime >= (boss.bossStateUntil ?? 0)) {
                  for (let i = 0; i < BOSS_RADIAL_COUNT; i++) {
                    const a = (Math.PI * 2 * i) / BOSS_RADIAL_COUNT;
                    fireBullet(bcx + Math.cos(a) * 100, bcy + Math.sin(a) * 100);
                  }
                  patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay();
                }
              } else if (st === 'dash-windup') {
                if (newGameTime >= (boss.bossStateUntil ?? 0)) { patch.bossState = 'dash'; patch.bossStateUntil = newGameTime + BOSS_DASH_MS; }
              } else if (st === 'dash') {
                moveToward(BOSS_DASH_SPEED_MULT);
                if (newGameTime >= (boss.bossStateUntil ?? 0)) { patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(); }
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
        movePlayer(inputState, deltaTime);

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
            }
          }

          if (useGameStore.getState().rhythm.active) {
            useGameStore.getState().tickRhythm();
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
          playSfx('reload');
        }
        // 刀装備中は銃の自動射撃を完全に止める(弾薬/リロード処理は通常どおり
        // 進むので、刀を外す実装が将来入っても副作用が残らない)。
        const katanaActive = isKatanaMode(postReloadPlayer);
        const activeGun = getActiveGun(postReloadPlayer);
        // PHILL銃は自動射撃しない(指離しの手動発砲のみ=firePhillShot)。
        if (activeGun && !katanaActive && activeGun.category !== 'phill') {
          const newProjectiles = fireWeapon(activeGun, postReloadPlayer, enemies);
          if (newProjectiles.length > 0) {
            if (activeGun.category === 'handgun') playSfx('handgun-fire');
            if (activeGun.category === 'shotgun') playSfx('shotgun-fire');
            if (activeGun.category === 'rifle') playSfx('rifle-fire');
            // Muzzle flash at the gun, pointed along the shot.
            const md = newProjectiles[0].direction;
            const mpx = postReloadPlayer.x + postReloadPlayer.width / 2 + md.x * 18;
            const mpy = postReloadPlayer.y + postReloadPlayer.height / 2 + md.y * 18;
            useGameStore.getState().spawnGlow(
              mpx, mpy, activeGun.category === 'shotgun' ? 22 : 15, 'rgba(255,238,170,', 90
            );
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
        updateEnemies(deltaTime);

        // パンプキン(/lab-zombie-3)のジャンプ着地爆発(範囲狭め)。store が記録した着地点を消化し、
        // 爆発FXを出しつつ半径内ならプレイヤーへダメージ(無敵中は無効)。死亡時は通常の死亡演出へ。
        {
          const blasts = useGameStore.getState().pumpkinBlasts;
          if (blasts.length > 0) {
            playSfx('heavy-impact'); // ジャンプ攻撃の着地音
            const bp = useGameStore.getState().player;
            const bpcx = bp.x + bp.width / 2;
            const bpcy = bp.y + bp.height / 2;
            const counterActive = Date.now() <= bp.counterWindowEnd;
            const parriedEnemyIds: { id: string; bx: number; by: number }[] = [];
            for (const b of blasts) {
              spawnFlash('rgba(255,150,60,0.16)', 200);
              spawnRing(b.x, b.y, 6, b.radius, 'rgba(255,170,80,0.9)', 4, 300);
              spawnBurst(b.x, b.y, '#fb923c', 16);
              const pr = Math.max(bp.width, bp.height) / 2;
              if (Math.hypot(bpcx - b.x, bpcy - b.y) <= b.radius + pr) {
                if (counterActive) {
                  // カウンター成立は無敵中でも弾く(=確実にノックバック+クリ反撃)。
                  // ※以前は !invulnerable を前提にしていたため、被弾i-frame中だとパリィが
                  //   丸ごとスキップされ「カウンターしたのにノックバックしない」が起きていた。
                  parriedEnemyIds.push({ id: b.enemyId, bx: b.x, by: b.y });
                } else if (!bp.invulnerable) {
                  const blastEnemyType = useGameStore.getState().enemies.find(e => e.id === b.enemyId)?.type;
                  const died = damagePlayer(b.damage, `${enemyDeathLabel(blastEnemyType ?? '')}の落下攻撃`);
                  playSfx('player-damage');
                  // 弾き出し: 爆心から外向きにプレイヤーをノックバック。
                  const ddx = bpcx - b.x, ddy = bpcy - b.y;
                  const dd = Math.max(0.001, Math.hypot(ddx, ddy));
                  useGameStore.setState(st => ({ player: {
                    ...st.player,
                    knockbackVx: (ddx / dd) * PLAYER_KNOCKBACK_SPEED,
                    knockbackVy: (ddy / dd) * PLAYER_KNOCKBACK_SPEED,
                    knockbackUntil: Date.now() + PLAYER_KNOCKBACK_MS,
                  } }));
                  if (died) triggerPlayerDeath(bpcx, bpcy);
                }
              }
            }
            if (parriedEnemyIds.length > 0) {
              const pnow = Date.now();
              // 通常カウンター(弾反射)と同じ演出: 「Counter!」表示＋カウンターSE＋ヒットインパクト＋コンボ。
              addMeleeFinishCombo(1);
              playSfx('counter');
              useGameStore.getState().spawnGlow(bpcx, bpcy, 78, 'rgba(56,189,248,', 360);
              useGameStore.getState().triggerHitImpact(COUNTER_HITSTOP_MS, COUNTER_SHAKE_MS, COUNTER_SHAKE_MAG, COUNTER_ZOOM_MAG);
              spawnRing(bpcx, bpcy, 12, 110, 'rgba(56,189,248,0.9)', 3, 360);
              spawnBurst(bpcx, bpcy, '#38bdf8', 14);
              useGameStore.getState().spawnCallout(bpcx, bpcy - 12, 'Counter!', '#38bdf8');
              useGameStore.setState(st => ({
                // 弾いた直後は敵がプレイヤーに重なっている(着地)ので、通常接触ダメージで被弾しないよう
                // 短い無敵(i-frame)を付与。これで「カウンターしたのに被弾」を防ぐ。
                player: { ...st.player, invulnerable: true, invulnerableTime: pnow, lastCounterSuccessTime: pnow },
                enemies: st.enemies.map(e => {
                  const hit = parriedEnemyIds.find(p => p.id === e.id);
                  if (!hit) return e;
                  const ecx = e.x + e.width / 2, ecy = e.y + e.height / 2;
                  // ジャンプ攻撃はプレイヤーの位置めがけて着地する=敵中心がプレイヤー中心とほぼ重なり、
                  // 「プレイヤー→敵」方向だと向きが 0 に潰れてノックバックが効かない(社長報告のバグ)。
                  // 距離が小さいときは、敵がジャンプしてきた向き(aiFrom→着地点)の逆=「飛んできた方へ弾き返す」を使う。
                  let ndx = ecx - bpcx, ndy = ecy - bpcy;
                  let d = Math.hypot(ndx, ndy);
                  if (d < 12) {
                    const ox = e.x - (e.aiFromX ?? e.x), oy = e.y - (e.aiFromY ?? e.y);
                    const od = Math.hypot(ox, oy);
                    if (od > 0.001) { ndx = ox; ndy = oy; d = od; }
                    else { ndx = 0; ndy = -1; d = 1; } // それも潰れていれば上方へ弾く
                  }
                  const ux = ndx / d, uy = ndy / d;
                  return {
                    ...e,
                    // 突進パリィと同じく aiPhase を完全解除して弾き返す。'recover' のままだと
                    // ノックバックが乗らない(社長報告)ため undefined に統一+ai系をリセット。
                    aiPhase: undefined,
                    aiPhaseUntil: undefined, aiStartedAt: undefined,
                    aiTargetX: undefined, aiTargetY: undefined, aiFromX: undefined, aiFromY: undefined,
                    aiReadyAt: st.gameTime + 1200,
                    // 【ジャンプカウンターのノックバック不発の根治】
                    // ① 速度ノックバックは updateEnemies が「翌フレーム以降」に適用する=ジャンプ着地で
                    //    付与される stun/lift/recover に上書きされて「その場で痺れる」だけになっていた。
                    //    → ここで“即時に”位置を弾き飛ばす(COUNTER_KNOCKBACK_LAUNCH)。
                    // ② 凍結系(stun/lift/root)と ノックバック無敵窓を全解除して、続く速度スライドを
                    //    何にも邪魔させない。
                    x: e.x + ux * COUNTER_KNOCKBACK_LAUNCH,
                    y: e.y + uy * COUNTER_KNOCKBACK_LAUNCH,
                    vx: 0, vy: 0,
                    stunUntil: undefined, liftUntil: undefined, rootUntil: undefined,
                    knockbackImmuneUntil: 0,
                    knockbackVx: ux * COUNTER_KNOCKBACK_SPEED,
                    knockbackVy: uy * COUNTER_KNOCKBACK_SPEED,
                    knockbackUntil: pnow + KNOCKBACK_DURATION,
                  };
                }),
              }));
              // クリティカル反撃(ヘッドショット): 弾いたジャンプ敵へ。aiPhase 解除済みでダメージが通る。
              const cBase = getActiveGun(bp)?.damage ?? 12;
              for (const hit of parriedEnemyIds) {
                const e = useGameStore.getState().enemies.find(en => en.id === hit.id);
                if (!e) continue;
                const boss = isBossType(e.type);
                const critMult = skillCritMult(bp, boss ? BOSS_CRIT_DAMAGE_MULT : CRIT_DAMAGE_MULT);
                const dmg = Math.max(1, Math.round(cBase * critMult * skillOutgoingDamageMult(bp) * (bp.equipBonus?.damageMult ?? 1)));
                const ex = e.x + e.width / 2, ey = e.y + e.height / 2;
                damageEnemy(hit.id, dmg);
                spawnDamageNumber(ex, e.y, dmg, true);
                spawnRing(ex, ey, 8, 46, 'rgba(253,224,71,0.95)', 3, 300);
                spawnBurst(ex, ey, '#fde047', 10);
                useGameStore.getState().spawnGlow(ex, ey, 34, 'rgba(253,224,71,', 240);
              }
              playSfx('headshot');
            }
            useGameStore.setState({ pumpkinBlasts: [] });
          }
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

        // 自動タレット: 設置中は留まってオート射撃。前方集中=SMG相当の長射程直線、全方位=
        // ハンドガン相当の短射程ターゲット。低確率でグレネード弾。寿命終了で小爆発(範囲ダメージ)。
        // updateProjectiles の duration カリングより前に寿命を処理して爆発を出す。
        {
          const nowMs = Date.now();
          // 前方集中タレットの索敵スキャンで更新した向きを、描画(砲身の向き)へ反映するための一括書き込み。
          const turretAimWrites: { id: string; x: number; y: number }[] = [];
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
              playSfx('rifle-fire');
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
              playSfx('handgun-fire');
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

        // Every enemy that has a fire profile periodically lobs a hostile
        // projectile at the player. Each type has its own cadence/range
        // so grunts shoot rarely and ranged/boss shoot often. We read the
        // enemies/player fresh from the store here because updateEnemies
        // just mutated them — the React closure values are one frame
        // stale, and a stale `lastShot` would have us refire on enemies
        // that already shot earlier in this very frame.
        const now = Date.now();
        const liveEnemies = useGameStore.getState().enemies;
        const livePlayer = useGameStore.getState().player;
        const liveGameTime = useGameStore.getState().gameTime;
        const firedIds: string[] = [];
        const liveSummonsForFire = useGameStore.getState().summons;
        liveEnemies.forEach(enemy => {
          // 裏ボスの発砲(3連発/全方位16発)は専用コントローラが直接撃つので汎用ループからは除外。
          if (isHiddenBoss(enemy.type)) return;
          // Stunned enemies are frozen — they can't spit projectiles either.
          if (enemy.stunUntil !== undefined && liveGameTime < enemy.stunUntil) return;
          // 特殊行動中(ジャンプ/ダッシュの溜め・動作中)は発砲しない(giantbat の弾/ジャンプ/ダッシュを排他に)。
          if (enemy.aiPhase) return;
          const profile = getEnemyFireProfile(enemy);
          if (!profile) return;
          if (now - enemy.lastShot < profile.interval) return;
          // 錬金術: aggro内の通常召喚を撃つ。いなければ従来どおりプレイヤー。
          // シーカー: 半透明中は通常敵(ボス/死神/イベントボス級を除く)はプレイヤーを撃たない。
          const playerHidden = isSeekerActive(livePlayer, liveGameTime) && !isBossType(enemy.type);
          const tgt = resolveEnemyTarget(enemy, livePlayer, liveSummonsForFire, ALCHEMY_AGGRO_RANGE, playerHidden);
          if (tgt.hidden) return; // 標的なし=非発砲
          const dx = tgt.x - (enemy.x + enemy.width / 2);
          const dy = tgt.y - (enemy.y + enemy.height / 2);
          if (Math.hypot(dx, dy) > profile.range) return;

          addProjectile(createEnemyProjectile(enemy, livePlayer, tgt.x, tgt.y));
          firedIds.push(enemy.id);
        });
        if (firedIds.length > 0) {
          useGameStore.setState(state => ({
            enemies: state.enemies.map(e =>
              firedIds.includes(e.id) ? { ...e, lastShot: now } : e
            )
          }));
        }

        // Hostile projectiles vs player. If the counter window is currently
        // open (the player just lifted their finger / tapped Space), reflect
        // the bolt back at the firing enemy. Otherwise it does damage.
        const liveProjectiles = useGameStore.getState().projectiles;
        const incoming = checkProjectilePlayerCollisions(liveProjectiles, player);
        let reflectedAny = false;
        for (const proj of incoming) {
          const currentPlayer = useGameStore.getState().player;
          if (now <= currentPlayer.counterWindowEnd) {
            reflectProjectile(proj.id);
            // スキル: ボムカウンター = 反射弾がランチャー弾化し、命中で GRENADE_* 爆発。
            const bcLv = skillLevel(currentPlayer, 'bomb-counter');
            if (bcLv) {
              const bcRadiusMult = [0, 1, 1.15, 1.3][bcLv];
              const bcDmgMult = [0, 1, 1.25, 1.5][bcLv];
              useGameStore.setState(state => ({
                projectiles: state.projectiles.map(p =>
                  p.id === proj.id
                    ? { ...p, explodeOnHit: true, explodeRadius: GRENADE_BLAST_RADIUS * bcRadiusMult, explodeDamageMult: GRENADE_BLAST_DAMAGE_MULT * bcDmgMult }
                    : p
                ),
              }));
            }
            reflectedAny = true;
            // Each successful reflect refreshes the window so a barrage
            // can be turned back fully. The cooldown still gates a NEW
            // counter trigger once the chain finally lapses.
            useGameStore.setState(state => ({
              player: {
                ...state.player,
                counterWindowEnd: Math.max(
                  state.player.counterWindowEnd,
                  now + COUNTER_EXTEND_PER_HIT
                ),
                lastCounterSuccessTime: now
              }
            }));
          } else {
            const wasVulnerable = !useGameStore.getState().player.invulnerable;
            const playerDied = damagePlayer(proj.damage, '敵の飛び道具');
            if (wasVulnerable) {
              playSfx('player-damage');
              spawnFlash('rgba(239,68,68,0.22)', 200);
            }
            removeProjectile(proj.id);
            spawnBurst(
              player.x + player.width / 2,
              player.y + player.height / 2,
              '#ef4444',
              5
            );
            if (playerDied) {
              triggerPlayerDeath(
                player.x + player.width / 2,
                player.y + player.height / 2
              );
            }
          }
        }
        // "Counter!" only when a bullet was actually reflected (once per frame).
        if (reflectedAny) {
          addMeleeFinishCombo(1);
          playSfx('counter');
          const pcx = player.x + player.width / 2;
          const pcy = player.y + player.height / 2;
          useGameStore.getState().spawnGlow(pcx, pcy, 78, 'rgba(56,189,248,', COUNTER_REFLECT_SLOW_MS);
          // カウンター: ストップ→(後で)揺れ+寄りズーム(社長指示)。ダンス中はストップ抜きで即時。
          useGameStore.getState().triggerHitImpact(COUNTER_HITSTOP_MS, COUNTER_SHAKE_MS, COUNTER_SHAKE_MAG, COUNTER_ZOOM_MAG);
          spawnRing(pcx, pcy, 12, 110, 'rgba(56,189,248,0.9)', 3, COUNTER_REFLECT_SLOW_MS);
          spawnBurst(pcx, pcy, '#38bdf8', 14);
          useGameStore.getState().spawnCallout(pcx, pcy - 12, 'Counter!', '#38bdf8');
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
        const projectilesRemovedThisFrame = new Set<string>();
        const grenadeExplodedThisFrame = new Set<string>();
        
        projectileEnemyCollisions.forEach(({ projectileId, enemyId, damage, headshot }) => {
          const enemyForFx = collisionEnemies.find(e => e.id === enemyId);
          const projectile = collisionProjectiles.find(p => p.id === projectileId);

          // Apply the crit multiplier at hit time: bosses take 5× on a crit,
          // normal enemies 1.5×. `damage` is the projectile's base damage.
          const isBoss = enemyForFx ? isBossType(enemyForFx.type) : false;
          const trapCritBonus =
            enemyForFx?.rootUntil !== undefined &&
            gameTime < enemyForFx.rootUntil &&
            Math.random() < MARKSMAN_TRAP_CRIT_BONUS;
          // PHILL銃の頭部命中は確定ヘッドショット=クリティカル扱い(×1.5＋気絶＋headshot SE＋金VFX)。
          const hitCrit = !!projectile?.crit || trapCritBonus || headshot === true;
          // スキル: クリティカルD上昇(+0.5) / バーサーカー(失HP%で全攻撃増) / スナイパー(停止敵・遠距離増)。
          const skillPlayer = collisionState.player;
          const critMult = hitCrit
            ? skillCritMult(skillPlayer, isBoss ? BOSS_CRIT_DAMAGE_MULT : CRIT_DAMAGE_MULT)
            : 1;
          // スキル: コンボマスターは「全攻撃」増加(ユーザー指定)。銃にもフィニッシュコンボ倍率を適用。
          const comboMasterMult = skillComboMasterMult(skillPlayer, gameTime, collisionState.meleeFinishComboCount, collisionState.meleeFinishComboUntil);
          // ワーム(ヨルムンガルド)だけ「カウンター弾(反射弾)を食らうと一撃死」(社長指示)。他敵は通常の反射ダメージ。
          const wormCounterKill = !!projectile?.reflected && enemyForFx?.type === 'jormungand';
          const dmg = wormCounterKill
            ? (enemyForFx?.maxHealth ?? 1) + 1
            : damage * critMult * skillOutgoingDamageMult(skillPlayer) * sniperGunMult(skillPlayer, enemyForFx) * comboMasterMult;
          const enemyKilled = damageEnemy(enemyId, dmg);
          playSfx(hitCrit ? 'headshot' : 'shot-damage');

          if (enemyForFx) {
            const hitX = enemyForFx.x + enemyForFx.width / 2;
            const hitY = enemyForFx.y + enemyForFx.height / 2;
            spawnBurst(hitX, hitY, '#b91c1c', hitCrit ? 8 : 5);
            spawnBurst(hitX, hitY, '#7f1d1d', hitCrit ? 4 : 2);
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
              spawnBurst(
                ex,
                ey,
                '#dc2626',
                bloodCount
              );
              spawnBurst(ex, ey, '#7f1d1d', Math.max(6, Math.floor(bloodCount * 0.45)));
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
                const dropType = equippedAmmo ?? owned[0];
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
          const hitProp = liveProps.find(prop => checkCollision(projectile, prop));
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
        const currentPlayerForMine = useGameStore.getState().player;
        const mineHit = useGameStore.getState().breakableProps.find(prop =>
          prop.type === 'mine' && checkCollision(currentPlayerForMine, prop)
        );
        if (mineHit) {
          const broken = damageBreakableProp(mineHit.id, 999);
          const fxX = mineHit.footX;
          const fxY = mineHit.footY - mineHit.height * 0.5;
          spawnEggFluidSplash(fxX, fxY, 1.28);
          if (broken && !currentPlayerForMine.invulnerable) {
            const playerDied = damagePlayer(MINE_DAMAGE, '地雷');
            playSfx('bomb');
            spawnFlash('rgba(239,68,68,0.18)', 180);
            if (playerDied) {
              triggerPlayerDeath(
                currentPlayerForMine.x + currentPlayerForMine.width / 2,
                currentPlayerForMine.y + currentPlayerForMine.height / 2
              );
            }
          }
        }
        
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
          // ワイヤーダッシュ中: すり抜けた敵に近接小ダメージ(1ダッシュにつき敵1回)。
          if (wp.wireDashUntil > 0 && nowW < wp.wireDashUntil) {
            if (wirePassHitRef.current.dash !== wp.wireDashUntil) {
              wirePassHitRef.current = { dash: wp.wireDashUntil, ids: new Set() };
            }
            const seen = wirePassHitRef.current.ids;
            const dmg = meleeDmg * WIRE_PASS_DAMAGE_MULT; // 小ダメージ
            for (const e of useGameStore.getState().enemies) {
              if (seen.has(e.id)) continue;
              if (e.aiPhase === 'jump') continue; // 空中無敵は対象外
              if (!checkCollision(wp, e)) continue; // プレイヤーが重なった=すり抜け
              seen.add(e.id);
              const ecx = e.x + e.width / 2, ecy = e.y + e.height / 2;
              const killed = useGameStore.getState().damageEnemy(e.id, dmg);
              spawnDamageNumber(ecx, e.y, dmg, false);
              spawnSlash(ecx, ecy, 'rgba(186,230,253,0.95)');
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
            const lvl = Math.max(1, Math.min(3, wp.subWeaponLevels['wire-anchor'] ?? 1));
            if (lvl >= 3) {
              // 着地点爆撃: 周囲へ範囲ダメージ + ノックバック + 爆発演出。
              const dmg = meleeDmg * WIRE_BOMB_DAMAGE_MULT;
              const hits = useGameStore.getState().enemies.filter(e => {
                const ecx = e.x + e.width / 2, ecy = e.y + e.height / 2;
                return Math.hypot(ecx - pcx, ecy - pcy) <= WIRE_BOMB_RADIUS + Math.max(e.width, e.height) / 2;
              });
              hits.forEach(e => {
                const ecx = e.x + e.width / 2, ecy = e.y + e.height / 2;
                const dx = ecx - pcx, dy = ecy - pcy;
                const dist = Math.hypot(dx, dy) || 1;
                const killed = useGameStore.getState().damageEnemy(e.id, dmg, true); // 爆発(ワイヤー爆弾)=ボス系には非致死
                spawnDamageNumber(ecx, e.y, dmg, true);
                if (!killed && nowW >= (e.knockbackImmuneUntil ?? 0)) {
                  useGameStore.setState({
                    enemies: useGameStore.getState().enemies.map(x => x.id === e.id ? {
                      ...x,
                      knockbackVx: (dx / dist) * WIRE_LAND_KNOCKBACK_SPEED * 1.5,
                      knockbackVy: (dy / dist) * WIRE_LAND_KNOCKBACK_SPEED * 1.5,
                      knockbackUntil: nowW + KNOCKBACK_DURATION,
                      knockbackImmuneUntil: nowW + KNOCKBACK_IMMUNE_MS,
                    } : x),
                  });
                }
              });
              spawnFlash('rgba(147,197,253,0.22)', 180);
              spawnRing(pcx, pcy, 10, WIRE_BOMB_RADIUS, 'rgba(147,197,253,0.95)', 5, 360);
              spawnBurst(pcx, pcy, '#93c5fd', 24);
              spawnBurst(pcx, pcy, '#dbeafe', 14);
              playSfx('bomb');
            } else {
              // Lv1/2: 着地は軽い演出のみ(範囲ダメージなし)。
              spawnRing(pcx, pcy, 8, 36, 'rgba(147,197,253,0.8)', 3, 260);
              spawnBurst(pcx, pcy, '#93c5fd', 8);
              playSfx('melee');
            }
          }
        }

        // Check for collisions between player and enemies.
        // フレーム先頭スナップショット(player/enemies)は movePlayer / updateEnemies 後に
        // 古い座標になるため、接触判定は最新状態(getState)で行う。移動後の位置で当たり/
        // カウンター/ダッシュ弾きを正しく解決する。
        const collState = useGameStore.getState();
        const collPlayer = collState.player;
        const collEnemies = collState.enemies;
        const playerEnemyCollisions = checkPlayerEnemyCollisions(collPlayer, collEnemies);
        // ワイヤーアンカーの高速移動中/敵吸着コンボ中は敵接触ダメージを無効化(敵弾は別経路でそのまま当たる)。
        const wpImmune = collPlayer;
        const wireDashingNow = Date.now() < wpImmune.wireDashUntil || !!wpImmune.wireStuckEnemyId;
        // 突進(ダッシュ)カウンター: 突進中(aiPhase==='charge')の敵にカウンター窓中で接触すると弾く
        // (無傷＋敵へのダメージ無し＋2倍ノックバックで突進中断)。ジャンプ着地と同じ「弾き」挙動。
        const counterActiveNow = Date.now() <= wpImmune.counterWindowEnd;
        const dashParried: string[] = [];

        playerEnemyCollisions.forEach(enemy => {
          if (wireDashingNow) return;
          // ジャンプ攻撃で敵が空中(aiPhase==='jump')の間はプレイヤーは被弾しない。
          // カウンター窓中ならカウンター成立=クリティカル反撃(ヘッドショット)を返す。
          if (enemy.aiPhase === 'jump') {
            if (counterActiveNow) dashParried.push(enemy.id);
            return;
          }
          // 突進(charge)/ジャンプの着地硬直(recover)/溜め(crouch)も、カウンター窓中は弾く。
          // パンプキンは空中で重なる窓が一瞬→着地直後は recover で「その場硬直(痺れ)」になり拾えなかったため、
          // recover/crouch も対象にして広い猶予で確実にノックバック+クリ反撃する。
          if ((enemy.aiPhase === 'charge' || enemy.aiPhase === 'recover' || enemy.aiPhase === 'crouch') && counterActiveNow) {
            dashParried.push(enemy.id);
            return;
          }
          // 気絶中(フィニッシュ受付)の敵に触れても被弾しない。
          // ただしカウンター窓中ならパリィ=弾き返す。カウンターの近接スイングがジャンプ敵を
          // クリ気絶させると aiPhase が undefined にリセットされ、recover/charge 判定を抜けて
          // ノックバックしなくなるため、気絶敵もカウンター中は dashParried で確実に弾く。
          if (enemy.stunUntil !== undefined && gameTime < enemy.stunUntil) {
            if (counterActiveNow) dashParried.push(enemy.id);
            return;
          }
          const damageWasApplied = !collPlayer.invulnerable;
          const playerDied = damagePlayer(enemy.damage, enemyDeathLabel(enemy.type));
          if (damageWasApplied) {
            playSfx('player-damage');
            spawnFlash('rgba(239,68,68,0.22)', 200);
            spawnBurst(
              collPlayer.x + collPlayer.width / 2,
              collPlayer.y + collPlayer.height / 2,
              '#ef4444',
              6
            );
          }
          if (playerDied) {
            triggerPlayerDeath(
              collPlayer.x + collPlayer.width / 2,
              collPlayer.y + collPlayer.height / 2
            );
          }
        });
        if (dashParried.length > 0) {
          const pnow = Date.now();
          const ppx = collPlayer.x + collPlayer.width / 2, ppy = collPlayer.y + collPlayer.height / 2;
          // 通常カウンターと同じ演出: 「Counter!」表示＋カウンターSE＋ヒットインパクト＋コンボ。
          addMeleeFinishCombo(1);
          playSfx('counter');
          useGameStore.getState().spawnGlow(ppx, ppy, 78, 'rgba(56,189,248,', 360);
          useGameStore.getState().triggerHitImpact(COUNTER_HITSTOP_MS, COUNTER_SHAKE_MS, COUNTER_SHAKE_MAG, COUNTER_ZOOM_MAG);
          spawnRing(ppx, ppy, 12, 110, 'rgba(56,189,248,0.9)', 3, 360);
          spawnBurst(ppx, ppy, '#38bdf8', 14);
          useGameStore.getState().spawnCallout(ppx, ppy - 12, 'Counter!', '#38bdf8');
          useGameStore.setState(st => ({
            // 弾いた直後は突進してきた敵が重なっているので、短い無敵で次フレームの接触被弾を防ぐ。
            player: { ...st.player, invulnerable: true, invulnerableTime: pnow, lastCounterSuccessTime: pnow },
            enemies: st.enemies.map(e => {
              if (!dashParried.includes(e.id)) return e;
              const ecx = e.x + e.width / 2, ecy = e.y + e.height / 2;
              // ジャンプ同様、突進中の敵はプレイヤーに重なって向きが潰れることがある。
              // 距離が小さいときは突進してきた向き(aiFrom→現在)の逆=「来た方へ弾き返す」を使う。
              let ndx = ecx - ppx, ndy = ecy - ppy;
              let d = Math.hypot(ndx, ndy);
              if (d < 12) {
                const ox = e.x - (e.aiFromX ?? e.x), oy = e.y - (e.aiFromY ?? e.y);
                const od = Math.hypot(ox, oy);
                if (od > 0.001) { ndx = ox; ndy = oy; d = od; }
                else { ndx = 0; ndy = -1; d = 1; }
              }
              const ux = ndx / d, uy = ndy / d;
              return {
                ...e,
                aiPhase: undefined, // 突進/ジャンプ中断
                aiPhaseUntil: undefined, aiStartedAt: undefined,
                aiTargetX: undefined, aiTargetY: undefined, aiFromX: undefined, aiFromY: undefined,
                aiReadyAt: st.gameTime + 1200, // 少し間を空ける(giantbat は gbDashReadyAt 側で管理)
                // 即時に弾き飛ばし+凍結系/ノックバック無敵を全解除(ジャンプカウンターと同根の対策)。
                x: e.x + ux * COUNTER_KNOCKBACK_LAUNCH,
                y: e.y + uy * COUNTER_KNOCKBACK_LAUNCH,
                vx: 0, vy: 0,
                stunUntil: undefined, liftUntil: undefined, rootUntil: undefined,
                knockbackImmuneUntil: 0,
                knockbackVx: ux * COUNTER_KNOCKBACK_SPEED,
                knockbackVy: uy * COUNTER_KNOCKBACK_SPEED,
                knockbackUntil: pnow + KNOCKBACK_DURATION,
              };
            }),
          }));
          // クリティカル反撃(ヘッドショット): aiPhase を解除済みなのでダメージが通る(ジャンプ中無敵を回避)。
          // 威力は装備中の銃ダメージ基準 × クリ倍率(通常×1.5 / ボス×5)× スキル/装備補正。
          const counterBase = getActiveGun(collPlayer)?.damage ?? 12;
          let counterKill = false;
          for (const eid of dashParried) {
            const e = useGameStore.getState().enemies.find(en => en.id === eid);
            if (!e) continue;
            const boss = isBossType(e.type);
            const critMult = skillCritMult(collPlayer, boss ? BOSS_CRIT_DAMAGE_MULT : CRIT_DAMAGE_MULT);
            const dmg = Math.max(1, Math.round(counterBase * critMult * skillOutgoingDamageMult(collPlayer) * (collPlayer.equipBonus?.damageMult ?? 1)));
            const ex = e.x + e.width / 2, ey = e.y + e.height / 2;
            counterKill = damageEnemy(eid, dmg) || counterKill;
            spawnDamageNumber(ex, e.y, dmg, true); // 金色クリ表示
            spawnRing(ex, ey, 8, 46, 'rgba(253,224,71,0.95)', 3, 300);
            spawnBurst(ex, ey, '#fde047', 10);
            useGameStore.getState().spawnGlow(ex, ey, 34, 'rgba(253,224,71,', 240);
          }
          playSfx('headshot'); // ヘッドショット反撃音(Counter SE と重ねる)
          void counterKill;
        }

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
                  playSfx('reload');
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
            playSfx('reload'); // 「カチッ」相当(音源のある reload を流用。ui-select は音源未定義で無音だった)
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
        }

        // 囲い系(閉じ込め)イベント中だけ通常スポーナ/演出波を止める。閉じ込めない救助(rescue)は通常通り湧かせる(社長指示)。
        const ae = useGameStore.getState().activeEvent;
        const confining = !!ae && ae.kind !== 'rescue';
        const enemyCap = confining ? ARENA_EVENT_CAP : (ae ? MAX_ENEMIES + RESCUE_ATTACKERS : MAX_ENEMIES);

        // Continuous spawner — drip enemies onto the field from off-screen.
        // rescue 中はイベント攻撃者(fromEvent)を除いた通常敵の数で上限判定し、通常通りの密度を維持。
        const allEnemiesNow = useGameStore.getState().enemies;
        const enemyCountBeforeSpawn = allEnemiesNow.length;
        const fieldCount = ae ? allEnemiesNow.filter(e => !e.fromEvent).length : enemyCountBeforeSpawn;
        // エリアごとの敵最大数(社長指定: 5/7/10/10/10)。屋外(非ラボ)の通常湧きに適用。ラボは従来の上限。
        const playerAreaIdx = areaZoneIndexFor(Math.hypot(player.x + player.width / 2, player.y + player.height / 2));
        const normalSpawnCap = labTheme ? MAX_ENEMIES : AREA_MAX_ENEMIES[playerAreaIdx];
        // カメラ下げ分だけ縦スポーンバンドを上へずらす(屋外のみ)。上端に湧きが画面内で見えないように。
        const spawnViewOffsetY = (labTheme || indoor) ? 0 : gameBounds.height * CAMERA_DOWN_OFFSET_FRAC;
        if (
          !danceTest &&
          !indoor &&
          !confining &&
          fieldCount < normalSpawnCap &&
          timestamp - lastEnemySpawnRef.current > getEnemySpawnInterval(gameTime) * (labTheme ? LAB_SPAWN_INTERVAL_MULT : 1)
        ) {
          const spawnCount = Math.min(
            labTheme ? LAB_SPAWN_COUNT_MAX : getEnemySpawnCount(),
            normalSpawnCap - fieldCount
          );
          let plantCount = useGameStore.getState().enemies
            .filter(e => e.type === 'plant').length;
          // 研究所スキン: 区画(LAB_ZONE)ごとの現在の敵数を集計(1区画 LAB_ENEMIES_PER_ZONE 体まで)。
          const labZoneCounts = new Map<string, number>();
          if (labTheme) {
            for (const e of useGameStore.getState().enemies) {
              const k = labZoneKey(e.x + e.width / 2, e.y + e.height / 2);
              labZoneCounts.set(k, (labZoneCounts.get(k) ?? 0) + 1);
            }
          }

          for (let i = 0; i < spawnCount; i++) {
            // 研究所スキンは湧きをラボ用ゾンビ(Lv1/2/3)に固定。画面外ランダム配置は generateEnemy を流用。
            // 索敵仕様: 湧いた時点は休眠(dormant)。プレイヤーが aggroRange 内 かつ 壁越しでない(視界)時に起床。
            // (起床判定は updateEnemies の dormant ブロック: 距離 + segmentBlocked(wallRects))。
            if (labTheme) {
              const labEnemy = generateEnemy(gameTime, player, gameBounds, selectLabEnemyType(gameTime), player.lastDirection);
              // 画面外の遠くにリング配置(=急に画面内に湧いて見えないように)。距離は画面サイズ比例:
              // 可視半対角線(=どの角度でも画面端の外)+ 画面端外マージン + 少しランダム。
              const ang = Math.random() * Math.PI * 2;
              const maxDim = Math.max(gameBounds.width, gameBounds.height);
              const halfDiag = Math.hypot(gameBounds.width, gameBounds.height) / 2;
              const dist = halfDiag + maxDim * SPAWN_OFFSCREEN_MARGIN_FRAC + Math.random() * (maxDim * 0.2);
              const pcx0 = player.x + player.width / 2, pcy0 = player.y + player.height / 2;
              labEnemy.x = pcx0 + Math.cos(ang) * dist - labEnemy.width / 2;
              labEnemy.y = pcy0 + Math.sin(ang) * dist - labEnemy.height / 2;
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
              continue;
            }
            let enemy = generateEnemy(gameTime, player, gameBounds, undefined, player.lastDirection, spawnViewOffsetY, snowTheme);
            // Hard cap of 2 live ranged plants — re-roll a plant pick into
            // something else once the field already has two, so ranged pressure
            // never piles up past "annoying".
            if (enemy.type === 'plant' && plantCount >= 2) {
              let tries = 0;
              while (enemy.type === 'plant' && tries < 6) {
                enemy = generateEnemy(gameTime, player, gameBounds, undefined, player.lastDirection, spawnViewOffsetY, snowTheme);
                tries++;
              }
              if (enemy.type === 'plant') {
                enemy = generateEnemy(gameTime, player, gameBounds, 'skeleton', player.lastDirection, spawnViewOffsetY);
              }
            }
            if (enemy.type === 'plant') plantCount += 1;
            addEnemy(enemy);
          }

          lastEnemySpawnRef.current = timestamp;
        }

        // 保証出現(社長指示): プラントは1分・犬(werewolf)は3分を過ぎた時点で、その種類が1体もいなければ
        // エリア不問で画面外に1体だけ出す。各ラン1回のみ(refフラグ)。森ステージ専用(ラボ/屋内/ダンス/囲い中は除外)。
        if (!danceTest && !indoor && !labTheme && !confining) {
          if (!plantGuaranteedRef.current && gameTime >= PLANT_GUARANTEE_MS) {
            plantGuaranteedRef.current = true;
            if (!useGameStore.getState().enemies.some(e => e.type === 'plant')) {
              addEnemy(generateEnemy(gameTime, player, gameBounds, 'plant', player.lastDirection, spawnViewOffsetY, snowTheme));
            }
          }
          if (!werewolfGuaranteedRef.current && gameTime >= WEREWOLF_GUARANTEE_MS) {
            werewolfGuaranteedRef.current = true;
            if (!useGameStore.getState().enemies.some(e => e.type === 'werewolf')) {
              addEnemy(generateEnemy(gameTime, player, gameBounds, 'werewolf', player.lastDirection, spawnViewOffsetY, snowTheme));
            }
          }
        }

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

        // Scripted supply crates — three guaranteed weapon crates spread across
        // the run (on top of the crate every mid-boss drops). Placed near the
        // player so they're easy to grab while the action stays hot.
        const CRATE_DROP_TIMES = [50000, 140000, 180000];
        if (
          cratesDroppedRef.current < CRATE_DROP_TIMES.length &&
          gameTime >= CRATE_DROP_TIMES[cratesDroppedRef.current]
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
        if (!danceTest && !indoor && !labTheme && !confining) {
          const waveEnemies = consumeDueWaves(
            gameTime,
            consumedWavesRef.current,
            player,
            gameBounds
          );
          waveEnemies.forEach(addEnemy);
        }

        // VS-style recycling: when an enemy drifts far beyond the viewport,
        // bring it back just outside the current screen instead of letting the
        // simulation spend time on a distant actor. Boss-class enemies keep
        // their HP/type/state; regular enemies are refreshed into the current
        // spawn pool while reusing the same renderer id.
        const currentEnemiesForRecycle = useGameStore.getState().enemies;
        const recycleDistance = Math.max(gameBounds.width, gameBounds.height) * ENEMY_RECYCLE_DISTANCE_MULT;
        let recycledAnyEnemy = false;
        const recycledEnemies = currentEnemiesForRecycle.map(enemy => {
          // 裏ボスは距離リサイクル(ワープ先回り)対象外。専用コントローラが帰巣/再生を独自に管理する。
          if (isHiddenBoss(enemy.type)) return enemy;
          // 囲い系イベントの敵は円内に留めるため距離リサイクル対象外(画面外送りしない)。
          if (enemy.fromEvent) return enemy;
          // 休眠中(未起動)の敵は「近づくまで向かってこない」設計。距離リサイクルで先回り(ワープ)させない
          // =城ボス等は起動するまで定位置で待機。一度起動(dormant解除)すれば以降は通常どおりリサイクルされる(社長指示)。
          if (enemy.dormant) return enemy;
          const enemyCenterX = enemy.x + enemy.width / 2;
          const enemyCenterY = enemy.y + enemy.height / 2;
          const distFromPlayer = Math.hypot(enemyCenterX - playerCenterX, enemyCenterY - playerCenterY);
          const waveProtected = enemy.isWave && gameTime - (enemy.spawnedAt ?? 0) < WAVE_GRACE_MS;
          // 固定敵(屋内の配置敵)は距離リサイクル対象外=常駐。ただし「画面外に出たら最初の
          // 定位置へ戻して再休眠」する(社長指示)。プレイヤーは常に画面中心なので、画面の半分+
          // 余白を超えたら画面外と判定。
          if (enemy.fixed) {
            if (
              indoor && !enemy.dormant &&
              enemy.homeX !== undefined && enemy.homeY !== undefined &&
              (Math.abs(enemyCenterX - playerCenterX) > gameBounds.width / 2 + LAB_RETURN_HOME_MARGIN ||
               Math.abs(enemyCenterY - playerCenterY) > gameBounds.height / 2 + LAB_RETURN_HOME_MARGIN)
            ) {
              recycledAnyEnemy = true;
              return {
                ...enemy,
                x: enemy.homeX, y: enemy.homeY, vx: 0, vy: 0,
                dormant: true,
                aiPhase: undefined, aiPhaseUntil: undefined, aiStartedAt: undefined,
                aiTargetX: undefined, aiTargetY: undefined, aiFromX: undefined, aiFromY: undefined,
                aiReadyAt: undefined,
                knockbackUntil: undefined, knockbackVx: undefined, knockbackVy: undefined,
              };
            }
            return enemy;
          }
          // エリア外追跡バグ修正: 現在エリアで weight=0 の敵タイプは画面内でも回収して差し替える。
          // ただし生成直後(5s猶予)・ウェーブ保護・ボス系は除外。
          const preserveEnemyState = enemy.type === 'reaper' || isBossType(enemy.type);
          const aliveMs = gameTime - (enemy.spawnedAt ?? 0);
          const areaInvalid = !preserveEnemyState && !enemy.isWave && !enemy.fromEvent
            && aliveMs > 5000
            && !isValidForArea(enemy.type, playerAreaIdx);
          if ((distFromPlayer <= recycleDistance && !areaInvalid) || waveProtected) return enemy;
          // 研究所スキンはリサイクル先もラボ用ゾンビに固定(森敵を出さない)。
          const recycleType = preserveEnemyState ? enemy.type : (labTheme ? selectLabEnemyType(gameTime) : undefined);
          const replacement = generateEnemy(
            gameTime,
            player,
            gameBounds,
            recycleType,
            player.lastDirection,
            0,
            snowTheme
          );
          recycledAnyEnemy = true;

          if (preserveEnemyState) {
            return {
              ...enemy,
              x: replacement.x,
              y: replacement.y,
              vx: undefined,
              vy: undefined,
              knockbackUntil: undefined,
              knockbackVx: undefined,
              knockbackVy: undefined,
              spawnedAt: gameTime
            };
          }

          return {
            ...replacement,
            id: enemy.id,
            // ラボはリサイクル個体も索敵仕様(休眠+半径)で再配置。
            ...(labTheme ? { dormant: true, aggroRange: LAB_SPAWN_AGGRO_RANGE, vx: 0, vy: 0 } : {})
          };
        });
        if (recycledAnyEnemy) {
          useGameStore.setState({ enemies: recycledEnemies });
        }

        // RE-style density: a hard cap of ~10 concurrent enemies. Set-piece
        // elites are never culled, and scripted-wave enemies get a 10-second
        // grace period before they're eligible (otherwise a boss wave gets
        // deleted the instant it spawns under the low cap).
        const currentEnemiesForCap = useGameStore.getState().enemies;
        if (currentEnemiesForCap.length > enemyCap) {
          const isProtected = (e: typeof currentEnemiesForCap[number]) =>
            e.fixed || // 屋内ステージの固定配置敵は数が多くてもカリングしない(遠い敵が消えない)
            e.fromEvent || // 囲い系イベントの敵は終了判定に必要なのでカリングしない
            e.type === 'reaper' || e.type === 'giantbat' || e.type === 'pumpkin' ||
            (e.isWave && gameTime - (e.spawnedAt ?? 0) < WAVE_GRACE_MS);
          const cullable = [...currentEnemiesForCap]
            .filter(e => !isProtected(e))
            .sort((a, b) => {
              const distA = Math.hypot(a.x - player.x, a.y - player.y);
              const distB = Math.hypot(b.x - player.x, b.y - player.y);
              return distB - distA;
            });

          const toRemoveIds = new Set(
            cullable
              .slice(0, currentEnemiesForCap.length - enemyCap)
              .map(enemy => enemy.id)
          );
          if (toRemoveIds.size > 0) {
            useGameStore.setState({
              enemies: currentEnemiesForCap.filter(enemy => !toRemoveIds.has(enemy.id))
            });
          }
        }

        // Tick visual effects (particles drift, damage numbers float, etc.)
        updateEffects(deltaTime);

        // Detect level-up edge: golden ring around the player.
        const currentPlayer = useGameStore.getState().player;
        if (currentPlayer.level > prevLevelRef.current) {
          const cx = currentPlayer.x + currentPlayer.width / 2;
          const cy = currentPlayer.y + currentPlayer.height / 2;
          spawnFlash('rgba(253,224,71,0.28)', 320);
          spawnRing(
            cx,
            cy,
            8, 126, 'rgba(253,224,71,0.95)', 6, 680
          );
          spawnRing(
            cx,
            cy,
            2, 54, 'rgba(255,255,255,0.95)', 4, 360
          );
          spawnRing(
            cx,
            cy,
            36, 170, 'rgba(251,191,36,0.62)', 3, 820
          );
          useGameStore.getState().spawnGlow(cx, cy, 82, 'rgba(253,224,71,', 520);
          spawnBurst(
            cx,
            cy,
            '#fde68a',
            44
          );
          spawnBurst(cx, cy, '#ffffff', 12);
          useGameStore.getState().spawnCallout(cx, currentPlayer.y - 14, 'LEVEL UP!', '#fde68a');
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
      setDanceMode(false);       // ダンスタイム解除(メインBGMの音量を確実に戻す)
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

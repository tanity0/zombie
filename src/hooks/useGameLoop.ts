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
  huntingMeleeRadius
} from '../store/gameStore';
import { rollWeaponKey } from '../utils/weaponDrop';
import type { AmmoType, Pickup, Projectile } from '../types/game';
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
  spawnEnemyAt,
  resolveEnemyTarget
} from '../utils/enemyUtils';
import { ALCHEMY_CHANNEL_MS, ALCHEMY_AGGRO_RANGE } from '../utils/summonUtils';
import { resolveAabb, rectsOverlap } from '../world/obstacles';
import { consumeDueWaves, newConsumedWaves } from '../utils/stageDirector';
import { fireWeapon, getActiveGun, getGuns } from '../utils/weaponUtils';
import { playSfx, playEnemyDeath, setHurricaneRumble, getMusicTimeMs, setDanceMode } from '../audio/audioManager';
import { HUNTING_CHARGE_MS_BY_LEVEL } from '../config/hunting';
import {
  RHYTHM_ENTER_IDLE_MS, RHYTHM_EXIT_MOVE_MS, RHYTHM_INTERVAL_MS, RHYTHM_LEAD_MS, RHYTHM_MUSIC_OFFSET_MS,
  RHYTHM_TAP_DAMAGE, RHYTHM_TAP_KNOCKBACK_MULT,
  RHYTHM_FLICK_RANGE, RHYTHM_FLICK_HALF_W, RHYTHM_FLICK_DAMAGE, RHYTHM_FLICK_KNOCKBACK_MULT,
  SUZAKU_MAX_TARGETS, SUZAKU_BLAST_RADIUS, SUZAKU_BLAST_DAMAGE,
  GENBU_LINE_LENGTH, GENBU_LINE_HALF_W, GENBU_DAMAGE,
  SEIRYU_LINE_LENGTH, SEIRYU_LINE_HALF_W, SEIRYU_DAMAGE,
  BYAKKO_RANGE, BYAKKO_DAMAGE, BYAKKO_MAX_HITS,
  SHIJIN_FINISH_BOSS_DAMAGE, SHIJIN_FINISH_SCREEN_MARGIN,
} from '../config/shijin';
import type { RhythmArrow, RhythmPending, ShijinGod } from '../types/game';

const GRENADE_WEAPON_KEY = 'rifle-t3';
const GRENADE_BLAST_RADIUS = 92;
const GRENADE_BLAST_DAMAGE_MULT = 0.62;
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
const MARKSMAN_TRAP_RADIUS_BY_LEVEL = [0, 34, 42, 50];
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
// 設置型シールド: 進行方向の反対側に建てる遮蔽壁。敵の通行を止め、敵弾を消す
// (味方弾は貫通)。設置間隔/持続は全Lv共通、レベルで耐久だけ上がる。各値は独立に
// 調整できるよう分離(座標=PLACE_DISTANCE / 形=LENGTH,THICKNESS / 耐久=HP_BY_LEVEL)。
const SHIELD_COOLDOWN_MS = 5000;             // 設置間隔(全Lv共通)
const SHIELD_DURATION_MS = 5000;             // 持続(全Lv共通)。duration 自動カリングで消滅
const SHIELD_HP_BY_LEVEL = [0, 10, 30, 60];  // 耐久(Lv1/2/3)。敵接触1回・敵弾1発=各1消費
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
const TURRET_DURATION_BY_LEVEL = [0, 5000, 5000, 5000]; // 持続: Lv1=5s確定。Lv2/3はTODO(未確定→暫定5s据置)
const TURRET_FOOT_W = 30;                               // 当たり判定幅(叩く判定/設置足元)
const TURRET_FOOT_H = 18;                               // 当たり判定奥行(下辺=足元)
const TURRET_PLACE_FORWARD = 24;                        // プレイヤー中心から進行方向へ置く距離
const TURRET_FWD_FIRE_MS = 130;                         // 前方集中の発射間隔(handgun-t3 cooldown 相当)
const TURRET_FWD_DAMAGE = 7;                            // 前方集中の弾ダメージ(handgun-t3 相当)
const TURRET_FWD_BULLET_SPEED = 560 * 1.5;             // handgun-t3 projectileSpeed × PROJECTILE_SPEED_MULT(1.5)
const TURRET_FWD_RANGE = 420;                           // 前方集中の射程(長射程)。TODO: 実機調整
const TURRET_FWD_LINE_HALF_W = 60;                      // 前方制圧の射線帯の半幅(この帯内の敵がいる時だけ撃つ)
const TURRET_OMNI_FIRE_MS = 420;                        // 全方位の発射間隔(handgun-t1 cooldown 相当)
const TURRET_OMNI_DAMAGE = 9;                           // 全方位の弾ダメージ(handgun-t1 相当)
const TURRET_OMNI_BULLET_SPEED = 520 * 1.5;            // handgun-t1 projectileSpeed × PROJECTILE_SPEED_MULT(1.5)
const TURRET_OMNI_RANGE = 200;                          // 全方位の射程(短射程)。TODO: 実機調整
const TURRET_BULLET_SIZE = 7;
const TURRET_GRENADE_CHANCE = 0.10;                     // 通常弾の代わりにグレネード弾を撃つ確率(全モード共通)
const TURRET_EXPLOSION_RADIUS = 64;                     // 消滅時の小爆発・範囲。TODO: 実機調整(既存爆発演出を流用)
const TURRET_EXPLOSION_DAMAGE = 36;                     // 消滅時の小爆発・威力。TODO: 実機調整
const GRENADE_SPREAD_BY_LEVEL: Record<number, number[]> = {
  1: [0],
  2: [-0.9, 0.9],
  3: [0, (Math.PI * 2) / 3, -(Math.PI * 2) / 3]
};
const MAX_ENEMIES = 10;
const WAVE_GRACE_MS = 10000;
const ENEMY_RECYCLE_DISTANCE_MULT = 0.86;
const PICKUP_HARD_CAP = 120;
const XP_PICKUP_KEEP_COUNT = 82;
const STRAP_PICKUP_KEEP_COUNT = 60;
const CASTLE_BOSS_SPAWN_MS = 5 * 60 * 1000;
const PLAYER_DEATH_SLOW_MS = 820;
const CASTLE_SPAWN_SLOW_MS = 900;
const HEAVY_GRENADE_EXPLOSION_EFFECT_MS = 440;
const COUNTER_REFLECT_SLOW_MS = 560;
const GRENADE_LAUNCHER_EXPLOSION_EFFECT_MS = 440;

type DogFetchJob = {
  collectAt: number;
  finishAt: number;
  targetX: number;
  targetY: number;
  radius: number;
  collected: boolean;
};

export const useGameLoop = (onGameOver: () => void, options: { benchmarkMode?: boolean } = {}) => {
  const [fps, setFps] = useState(0);
  const benchmarkModeRef = useRef(Boolean(options.benchmarkMode));
  const frameRef = useRef(0);
  const lastFrameTimeRef = useRef(0);
  const lastEnemySpawnRef = useRef(0);
  const fpsCounterRef = useRef({ frames: 0, lastCheck: 0 });
  // Scripted-wave consumption set; survives across frames within one run
  // and is reset whenever gameTime rolls back to ~0 (i.e. a fresh game).
  const consumedWavesRef = useRef(newConsumedWaves());
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
  // Decoy next-pulse time per decoy id (gameTime ms, so it pauses with the game).
  const decoyPulseRef = useRef<Map<string, number>>(new Map());
  // Shield contact debounce: next-allowed durability-hit time (gameTime ms) per
  // `${shieldId}:${enemyId}`, so each enemy only chips a shield once per interval.
  const shieldHitRef = useRef<Map<string, number>>(new Map());
  // 自動タレットの発射スロットル: タレットid -> 次に撃てる gameTime(ms)。
  const turretFireRef = useRef<Map<string, number>>(new Map());
  // 四神舞(リズム): 停止が続いた gameTime の起点(0=未停止)。RHYTHM_ENTER_IDLE_MS でモード開始。
  const rhythmIdleStartRef = useRef<number>(0);
  // 四神舞: 動き出した gameTime の起点(0=停止中)。RHYTHM_EXIT_MOVE_MS 動き続けた時だけ終了
  // (フリックのドラッグやバッシュのスライド程度では抜けない)。
  const rhythmMoveStartRef = useRef<number>(0);
  // ダンスタイムBGM切替の前回状態(リズムの active 変化を検出して setDanceMode する)。
  const danceModeRef = useRef<boolean>(false);
  
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
    window.setTimeout(onGameOver, 650);
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
        addPickup({ id: `pickup-xp-shijin-${enemyId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, x: ex - 8, y: ey - 8, type: 'experience', value: e.experienceValue });
      } else {
        spawnDamageNumber(ex, e.y, Math.round(dmg), stunned);
      }
      return killed;
    };
    // 直線(帯)攻撃: 起点から(dx,dy)方向 length まで、半幅 halfW の帯に入る敵へ。
    const rhythmLineAttack = (cx: number, cy: number, dx: number, dy: number, length: number, halfW: number, damage: number, kbMult: number, execute: boolean) => {
      for (const e of useGameStore.getState().enemies) {
        if (e.type === 'reaper') continue;
        const rx = e.x + e.width / 2 - cx;
        const ry = e.y + e.height / 2 - cy;
        const along = rx * dx + ry * dy;
        if (along < 0 || along > length) continue;
        const perp = Math.abs(rx * dy - ry * dx);
        if (perp > halfW + e.width / 2) continue;
        shijinHitEnemy(e.id, damage, execute);
        if (kbMult > 0) useGameStore.getState().knockbackEnemy(e.id, dx, dy, kbMult);
      }
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
      if (god === 'suzaku') {
        // 朱雀: 近場最大3体をグレネード相当で爆破(範囲ダメージ・フォールオフ)。
        const targets = useGameStore.getState().enemies
          .filter(e => e.type !== 'reaper')
          .map(e => ({ e, d: Math.hypot(e.x + e.width / 2 - x, e.y + e.height / 2 - y) }))
          .sort((a, b) => a.d - b.d).slice(0, SUZAKU_MAX_TARGETS).map(h => h.e);
        spawnFlash('rgba(248,113,113,0.16)', 150);
        for (const t of targets) {
          const bx = t.x + t.width / 2;
          const by = t.y + t.height / 2;
          spawnRing(bx, by, 8, SUZAKU_BLAST_RADIUS, 'rgba(248,113,113,0.85)', 4, 360);
          spawnBurst(bx, by, '#f87171', 14);
          spawnBurst(bx, by, '#7f1d1d', 6);
          useGameStore.getState().spawnGlow(bx, by, 46, 'rgba(248,113,113,', 360);
          for (const e of useGameStore.getState().enemies) {
            if (e.type === 'reaper') continue;
            const dist = Math.hypot(e.x + e.width / 2 - bx, e.y + e.height / 2 - by);
            if (dist > SUZAKU_BLAST_RADIUS) continue;
            const falloff = 1 - dist / SUZAKU_BLAST_RADIUS;
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
        playSfx('melee');
      } else if (pa.kind === 'flick') {
        const v = ARROW_VEC[pa.arrow];
        rhythmLineAttack(pcx, pcy, v.x, v.y, RHYTHM_FLICK_RANGE, RHYTHM_FLICK_HALF_W, RHYTHM_FLICK_DAMAGE, RHYTHM_FLICK_KNOCKBACK_MULT, false);
        useGameStore.getState().spawnSlash(pcx + v.x * RHYTHM_FLICK_RANGE * 0.6, pcy + v.y * RHYTHM_FLICK_RANGE * 0.6, 'rgba(186,230,253,0.9)');
        playSfx('katana-dash');
      } else if (pa.kind === 'god') {
        fireShijinGod(pa.god, pa.x, pa.y);
      } else if (pa.kind === 'finish') {
        shijinWholeScreenFinish();
      }
    };

    const gameLoop = (timestamp: number) => {
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
      if (nowMs < useGameStore.getState().hitstopUntil) {
        frameRef.current = requestAnimationFrame(gameLoop);
        return;
      }

      // ハリケーン鳴動「ゴゴゴゴ」: 発動中(かつ非ポーズ)だけループ。毎フレーム現状態で
      // 駆動。idempotent なので遷移時のみ start/stop する。
      setHurricaneRumble(
        !useGameStore.getState().isPaused && !!useGameStore.getState().hurricane
      );

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
        const timeScale = nowMs < loopState.timeSlowUntil ? loopState.timeSlowScale : 1;
        const deltaTime = baseDeltaTime * timeScale;

        if (benchmarkModeRef.current) {
          const targetCameraX = player.x - gameBounds.width / 2 + player.width / 2;
          const targetCameraY = player.y - gameBounds.height / 2 + player.height / 2;
          setCameraPosition(targetCameraX, targetCameraY);
          updateEffects(deltaTime);
          frameRef.current = requestAnimationFrame(gameLoop);
          return;
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
        }
        lastSeenGameTimeRef.current = newGameTime;

        const castle = useGameStore.getState().castleEvent;
        if (!castle.bossSpawned && newGameTime >= CASTLE_BOSS_SPAWN_MS) {
          markCastleBossSpawned();
          const boss = spawnEnemyAt('giantbat', castle.x, castle.y, newGameTime);
          addEnemy(boss);
          spawnFlash('rgba(127,29,29,0.28)', 420);
          spawnRing(castle.x, castle.y, 18, 170, 'rgba(239,68,68,0.9)', 7, 720);
          spawnRing(castle.x, castle.y, 42, 260, 'rgba(127,29,29,0.62)', 4, 920);
          useGameStore.getState().spawnGlow(castle.x, castle.y, 150, 'rgba(239,68,68,', 900);
          useGameStore.getState().triggerTimeSlow(0.36, CASTLE_SPAWN_SLOW_MS);
          spawnBurst(castle.x, castle.y + 20, '#7f1d1d', 28);
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
              // ダンストラックを先頭から再生開始(=拍頭が今)。最初のジャストは LEAD 以上先の拍に置く。
              // 以降は resyncRhythm が音楽の再生位置へ位相を再同期し続ける。
              const firstBeatAt = newGameTime + Math.ceil(RHYTHM_LEAD_MS / RHYTHM_INTERVAL_MS) * RHYTHM_INTERVAL_MS + RHYTHM_MUSIC_OFFSET_MS;
              useGameStore.getState().setRhythmActive(true, firstBeatAt);
            }
          }

          if (useGameStore.getState().rhythm.active) {
            useGameStore.getState().tickRhythm();
            // BGM(ダンストラック)の再生位置にビート位相を再同期(ドリフト対策)。
            const musicMs = getMusicTimeMs();
            if (musicMs !== null) useGameStore.getState().resyncRhythm(musicMs);
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
            setDanceMode(danceNow);
            danceModeRef.current = danceNow;
          }
        }

        // Infinite-world camera: center the player exactly.
        const targetCameraX = player.x - gameBounds.width / 2 + player.width / 2;
        const targetCameraY = player.y - gameBounds.height / 2 + player.height / 2;
        setCameraPosition(targetCameraX, targetCameraY);
        syncBreakableProps({ x: targetCameraX, y: targetCameraY }, gameBounds);
        
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
        if (activeGun && !katanaActive) {
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
              const dx = e.x + e.width / 2 - kcx;
              const dy = e.y + e.height / 2 - kcy;
              const d2 = dx * dx + dy * dy;
              if (d2 > kRange * kRange) continue;
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
        if (
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
              setSubWeaponCooldown('dog', gameTime + DOG_PICKUP_COOLDOWN_BY_LEVEL[level]);
            }
          } else if (gameTime >= dogReadyAt) {
            const state = useGameStore.getState();
            const targetRadius = DOG_FETCH_TARGET_RADIUS_BY_LEVEL[level];
            const collectRadius = DOG_COLLECT_RADIUS_BY_LEVEL[level];
            const playerX = state.player.x + state.player.width / 2;
            const playerY = state.player.y + state.player.height / 2;
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
                targetX,
                targetY,
                radius: collectRadius,
                collected: false,
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
            damage: 0,
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
            shieldHp: SHIELD_HP_BY_LEVEL[level],
            shieldMaxHp: SHIELD_HP_BY_LEVEL[level],
          });
          // ガチャンッ!: 着地ダスト + 金属音(構えた感)。スプライト側で着地スラム。
          spawnRing(footX, footY, 6, 64, 'rgba(203,213,225,0.7)', 3, 260);
          playSfx('shield-deploy');
          setSubWeaponCooldown('shield', gameTime + SHIELD_COOLDOWN_MS);
        }

        // 自動タレット: 10秒ごとにプレイヤー少し前方へ設置。設置地点に留まりオート射撃。
        // 追従しない=移動すると置き去り。設置時は必ず前方集中モードで開始する。
        if (
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
          for (const turret of useGameStore.getState().projectiles.filter(p => p.weaponType === 'turret')) {
            const tcx = turret.x + turret.width / 2;
            const tcy = turret.y + turret.height / 2;
            // --- 消滅時の小爆発(既存ヘビーグレネード爆発を流用、控えめ威力/範囲)。味方/プレイヤーは無傷。
            if (nowMs - turret.createdAt >= turret.duration) {
              removeProjectile(turret.id);
              turretFireRef.current.delete(turret.id);
              playSfx('bomb');
              spawnRing(tcx, tcy, 8, TURRET_EXPLOSION_RADIUS, 'rgba(251,146,60,0.8)', 4, HEAVY_GRENADE_EXPLOSION_EFFECT_MS);
              spawnBurst(tcx, tcy, '#f97316', 16);
              useGameStore.getState().spawnGlow(tcx, tcy, 44, 'rgba(251,146,60,', HEAVY_GRENADE_EXPLOSION_EFFECT_MS);
              for (const enemy of useGameStore.getState().enemies) {
                if (enemy.type === 'reaper') continue;
                const ex = enemy.x + enemy.width / 2;
                const ey = enemy.y + enemy.height / 2;
                const dist = Math.hypot(ex - tcx, ey - tcy);
                if (dist > TURRET_EXPLOSION_RADIUS) continue;
                const falloff = 1 - dist / TURRET_EXPLOSION_RADIUS;
                const dmg = Math.max(1, Math.round(TURRET_EXPLOSION_DAMAGE * (0.55 + falloff * 0.45)));
                const killed = damageEnemy(enemy.id, dmg);
                spawnDamageNumber(ex, enemy.y, dmg, false);
                if (killed) {
                  playEnemyDeath();
                  addPickup({
                    id: `pickup-xp-turret-${enemy.id}-${nowMs}`,
                    x: ex - 8,
                    y: ey - 8,
                    type: 'experience',
                    value: enemy.experienceValue
                  });
                }
              }
              continue;
            }
            // --- オート射撃(モード別スロットル)。
            const mode = turret.turretMode ?? 'forward';
            const interval = mode === 'omni' ? TURRET_OMNI_FIRE_MS : TURRET_FWD_FIRE_MS;
            if (gameTime < (turretFireRef.current.get(turret.id) ?? 0)) continue;
            let dir: { x: number; y: number } | null = null;
            if (mode === 'omni') {
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
              // 前方集中: 設置時の向きへ直線射撃。前方の射線帯に敵がいる時だけ撃つ(空撃ち抑制)。
              const fx = turret.direction.x;
              const fy = turret.direction.y;
              const hasFwdTarget = useGameStore.getState().enemies.some(e => {
                if (e.type === 'reaper') return false;
                const dx = e.x + e.width / 2 - tcx;
                const dy = e.y + e.height / 2 - tcy;
                const along = dx * fx + dy * fy;          // 前方への射影
                if (along <= 0 || along > TURRET_FWD_RANGE) return false;
                const perp = Math.abs(dx * fy - dy * fx); // 射線からの直交距離
                return perp <= TURRET_FWD_LINE_HALF_W;
              });
              if (!hasFwdTarget) continue;
              dir = { x: fx, y: fy };
            }
            if (!dir) continue;
            // 10%でグレネード弾(既存ヘビーグレネードを流用=fuseで爆発)、それ以外は通常弾。
            // 全方位モードでもグレネード弾は現在のターゲット方向へ撃つ。
            if (Math.random() < TURRET_GRENADE_CHANCE) {
              addProjectile({
                id: `proj-turret-gr-${turret.id}-${nowMs}`,
                x: tcx - 7, y: tcy - 7, width: 14, height: 14,
                speed: HEAVY_GRENADE_SPEED, damage: HEAVY_GRENADE_DAMAGE,
                direction: dir, weaponType: 'grenade', weaponKey: 'sub-turret-grenade',
                duration: HEAVY_GRENADE_FUSE_MS, createdAt: nowMs,
                passthrough: false, hitEnemies: [], hostile: false, reflected: false,
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
        }

        // Update projectiles
        updateProjectiles(deltaTime);

        const timedGrenades = useGameStore.getState().projectiles
          .filter(p => p.weaponType === 'grenade' && Date.now() - p.createdAt >= p.duration);
        for (const grenade of timedGrenades) {
          const gx = grenade.x + grenade.width / 2;
          const gy = grenade.y + grenade.height / 2;
          removeProjectile(grenade.id);
          playSfx('bomb');
          spawnRing(gx, gy, 8, HEAVY_GRENADE_RADIUS, 'rgba(251,146,60,0.82)', 4, HEAVY_GRENADE_EXPLOSION_EFFECT_MS);
          spawnBurst(gx, gy, '#f97316', 20);
          spawnBurst(gx, gy, '#7f1d1d', 8);
          useGameStore.getState().spawnGlow(gx, gy, 50, 'rgba(251,146,60,', HEAVY_GRENADE_EXPLOSION_EFFECT_MS);
          for (const enemy of useGameStore.getState().enemies) {
            if (enemy.type === 'reaper') continue;
            const ex = enemy.x + enemy.width / 2;
            const ey = enemy.y + enemy.height / 2;
            const dist = Math.hypot(ex - gx, ey - gy);
            if (dist > HEAVY_GRENADE_RADIUS) continue;
            const falloff = 1 - dist / HEAVY_GRENADE_RADIUS;
            const splashDamage = Math.max(1, Math.round(HEAVY_GRENADE_DAMAGE * (0.55 + falloff * 0.45)));
            const killed = damageEnemy(enemy.id, splashDamage);
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
              addPickup({
                id: `pickup-xp-heavy-grenade-${enemy.id}`,
                x: ex - 8,
                y: ey - 8,
                type: 'experience',
                value: enemy.experienceValue
              });
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
              if (enemy.type === 'reaper') return enemy;
              const ebox = { x: enemy.x, y: enemy.y, width: enemy.width, height: enemy.height };
              let touched = false;
              for (const s of shieldRects) {
                if (rectsOverlap(ebox, s)) {
                  touched = true;
                  const key = `${s.id}:${enemy.id}`;
                  const allowed = shieldHitRef.current.get(key) ?? 0;
                  if (gameTime >= allowed) {
                    dmgByShield.set(s.id, (dmgByShield.get(s.id) ?? 0) + 1);
                    shieldHitRef.current.set(key, gameTime + SHIELD_HIT_INTERVAL_MS);
                    // ノックバック方向 = シールド中心→敵中心(来た方へ弾き返す)。
                    // 重い敵/ボス(giantbat/pumpkin)は既存仕様に合わせて弾かない。
                    if (enemy.type !== 'giantbat' && enemy.type !== 'pumpkin') {
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
              if (!touched) return enemy;
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
                  dmgByShield.set(s.id, (dmgByShield.get(s.id) ?? 0) + 1);
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
                  useGameStore.setState(state => ({
                    projectiles: state.projectiles.map(p =>
                      p.id === s.id ? { ...p, shieldHp: nextHp } : p
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
          // Stunned enemies are frozen — they can't spit projectiles either.
          if (enemy.stunUntil !== undefined && liveGameTime < enemy.stunUntil) return;
          const profile = getEnemyFireProfile(enemy);
          if (!profile) return;
          if (now - enemy.lastShot < profile.interval) return;
          // 錬金術: aggro内の通常召喚を撃つ。いなければ従来どおりプレイヤー。
          const tgt = resolveEnemyTarget(enemy, livePlayer, liveSummonsForFire, ALCHEMY_AGGRO_RANGE);
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
            const playerDied = damagePlayer(proj.damage);
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
          useGameStore.getState().triggerTimeSlow(0.34, COUNTER_REFLECT_SLOW_MS);
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
        
        projectileEnemyCollisions.forEach(({ projectileId, enemyId, damage }) => {
          const enemyForFx = collisionEnemies.find(e => e.id === enemyId);
          const projectile = collisionProjectiles.find(p => p.id === projectileId);

          // Apply the crit multiplier at hit time: bosses take 5× on a crit,
          // normal enemies 1.5×. `damage` is the projectile's base damage.
          const isBoss = enemyForFx ? isBossType(enemyForFx.type) : false;
          const trapCritBonus =
            enemyForFx?.rootUntil !== undefined &&
            gameTime < enemyForFx.rootUntil &&
            Math.random() < MARKSMAN_TRAP_CRIT_BONUS;
          const hitCrit = !!projectile?.crit || trapCritBonus;
          const critMult = hitCrit
            ? (isBoss ? BOSS_CRIT_DAMAGE_MULT : CRIT_DAMAGE_MULT)
            : 1;
          const dmg = damage * critMult;
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
            const blastX = enemyForFx.x + enemyForFx.width / 2;
            const blastY = enemyForFx.y + enemyForFx.height / 2;
            spawnRing(blastX, blastY, 10, GRENADE_BLAST_RADIUS, 'rgba(251,146,60,0.82)', 5, GRENADE_LAUNCHER_EXPLOSION_EFFECT_MS);
            spawnBurst(blastX, blastY, '#f97316', 24);
            spawnBurst(blastX, blastY, '#7f1d1d', 10);
            useGameStore.getState().spawnGlow(blastX, blastY, 58, 'rgba(251,146,60,', GRENADE_LAUNCHER_EXPLOSION_EFFECT_MS);

            const splashBase = dmg * GRENADE_BLAST_DAMAGE_MULT;
            for (const splashEnemy of useGameStore.getState().enemies) {
              if (splashEnemy.id === enemyId || splashEnemy.type === 'reaper') continue;
              const sx = splashEnemy.x + splashEnemy.width / 2;
              const sy = splashEnemy.y + splashEnemy.height / 2;
              const dist = Math.hypot(sx - blastX, sy - blastY);
              if (dist > GRENADE_BLAST_RADIUS) continue;
              const falloff = 1 - dist / GRENADE_BLAST_RADIUS;
              const splashDamage = Math.max(1, Math.round(splashBase * (0.55 + falloff * 0.45)));
              const splashKilled = damageEnemy(splashEnemy.id, splashDamage);
              spawnDamageNumber(sx, splashEnemy.y, splashDamage, hitCrit);
              spawnBurst(sx, sy, '#b91c1c', hitCrit ? 7 : 4);
              if (splashKilled) {
                playEnemyDeath();
                spawnBurst(sx, sy, '#dc2626', 12);
                useGameStore.getState().dropEnemyCurrency(splashEnemy, sx, sy);
                addPickup({
                  id: `pickup-xp-grenade-${splashEnemy.id}`,
                  x: sx - 8,
                  y: sy - 8,
                  type: 'experience',
                  value: splashEnemy.experienceValue
                });
              }
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
            useGameStore.getState().knockbackEnemy(
              enemyId,
              projectile.direction.x,
              projectile.direction.y,
              Math.min(3, hitCount * pelletKnockback)
            );
          }

          // Crit that didn't outright kill → stun the target so it can be
          // executed with a melee finisher. Mark it with a brief yellow ring.
          if (hitCrit && !enemyKilled && enemyForFx) {
            useGameStore.getState().stunEnemy(enemyId, gameTime + STUN_DURATION_MS);
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

              addPickup({
                id: `pickup-xp-${enemy.id}`,
                x: enemy.x + enemy.width / 2 - 8,
                y: enemy.y + enemy.height / 2 - 8,
                type: 'experience',
                value: enemy.experienceValue
              });
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
              const gunKillDropRate = useGameStore.getState().meleeAmmoDropPercent / 100;
              if (Math.random() < gunKillDropRate) {
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
                  weaponKey: rollWeaponKey(gameTime),
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
              if (Math.random() < bombChance) {
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
              spawnBurst(fxX, fxY, '#f97316', 20);
              spawnBurst(fxX, fxY, '#fde68a', 8);
              spawnRing(fxX, fxY, 6, 36, 'rgba(251,146,60,0.86)', 3, 340);
              useGameStore.getState().spawnGlow(fxX, fxY, 48, 'rgba(251,146,60,', 380);
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
            const playerDied = damagePlayer(MINE_DAMAGE);
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
        
        // Check for collisions between player and enemies
        const playerEnemyCollisions = checkPlayerEnemyCollisions(player, enemies);
        
        playerEnemyCollisions.forEach(enemy => {
          const damageWasApplied = !player.invulnerable;
          const playerDied = damagePlayer(enemy.damage);
          if (damageWasApplied) {
            playSfx('player-damage');
            spawnFlash('rgba(239,68,68,0.22)', 200);
            spawnBurst(
              player.x + player.width / 2,
              player.y + player.height / 2,
              '#ef4444',
              6
            );
          }
          if (playerDied) {
            triggerPlayerDeath(
              player.x + player.width / 2,
              player.y + player.height / 2
            );
          }
        });

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
              useGameStore.getState().damageSummon(summonId, dmg);
            }
          }
        }

        // Check for collisions between player and pickups
        const pickupCollisions = checkPlayerPickupCollisions(player, pickups);

        if (pickupCollisions.length > 0) {
          const collidedPickups = pickupCollisions
            .map(pickupId => pickups.find(p => p.id === pickupId))
            .filter((pk): pk is NonNullable<typeof pk> => pk !== undefined);
          const hasAmmoPickup = collidedPickups.some(pk =>
            pk.type === 'ammo-handgun' ||
            pk.type === 'ammo-shotgun' ||
            pk.type === 'ammo-rifle'
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
            const pk = pickups.find(p => p.id === pickupId);
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
              }
            }
            collectPickup(pickupId);
          });
        }
        
        // Continuous spawner — drip enemies onto the field from off-screen.
        const enemyCountBeforeSpawn = useGameStore.getState().enemies.length;
        if (
          enemyCountBeforeSpawn < MAX_ENEMIES &&
          timestamp - lastEnemySpawnRef.current > getEnemySpawnInterval(gameTime)
        ) {
          const spawnCount = Math.min(
            getEnemySpawnCount(gameTime),
            MAX_ENEMIES - enemyCountBeforeSpawn
          );
          let plantCount = useGameStore.getState().enemies
            .filter(e => e.type === 'plant').length;

          for (let i = 0; i < spawnCount; i++) {
            let enemy = generateEnemy(gameTime, player, gameBounds, undefined, player.lastDirection);
            // Hard cap of 2 live ranged plants — re-roll a plant pick into
            // something else once the field already has two, so ranged pressure
            // never piles up past "annoying".
            if (enemy.type === 'plant' && plantCount >= 2) {
              let tries = 0;
              while (enemy.type === 'plant' && tries < 6) {
                enemy = generateEnemy(gameTime, player, gameBounds, undefined, player.lastDirection);
                tries++;
              }
              if (enemy.type === 'plant') {
                enemy = generateEnemy(gameTime, player, gameBounds, 'skeleton', player.lastDirection);
              }
            }
            if (enemy.type === 'plant') plantCount += 1;
            addEnemy(enemy);
          }

          lastEnemySpawnRef.current = timestamp;
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
        const waveEnemies = consumeDueWaves(
          gameTime,
          consumedWavesRef.current,
          player,
          gameBounds
        );
        waveEnemies.forEach(addEnemy);

        // VS-style recycling: when an enemy drifts far beyond the viewport,
        // bring it back just outside the current screen instead of letting the
        // simulation spend time on a distant actor. Boss-class enemies keep
        // their HP/type/state; regular enemies are refreshed into the current
        // spawn pool while reusing the same renderer id.
        const currentEnemiesForRecycle = useGameStore.getState().enemies;
        const recycleDistance = Math.max(gameBounds.width, gameBounds.height) * ENEMY_RECYCLE_DISTANCE_MULT;
        let recycledAnyEnemy = false;
        const recycledEnemies = currentEnemiesForRecycle.map(enemy => {
          const enemyCenterX = enemy.x + enemy.width / 2;
          const enemyCenterY = enemy.y + enemy.height / 2;
          const distFromPlayer = Math.hypot(enemyCenterX - playerCenterX, enemyCenterY - playerCenterY);
          const waveProtected = enemy.isWave && gameTime - (enemy.spawnedAt ?? 0) < WAVE_GRACE_MS;
          if (distFromPlayer <= recycleDistance || waveProtected) return enemy;

          const preserveEnemyState = enemy.type === 'reaper' || isBossType(enemy.type);
          const replacement = generateEnemy(
            gameTime,
            player,
            gameBounds,
            preserveEnemyState ? enemy.type : undefined,
            player.lastDirection
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
            id: enemy.id
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
        if (currentEnemiesForCap.length > MAX_ENEMIES) {
          const isProtected = (e: typeof currentEnemiesForCap[number]) =>
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
              .slice(0, currentEnemiesForCap.length - MAX_ENEMIES)
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

        // Detect successful-counter edge: gold burst + ring.
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

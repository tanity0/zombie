// M26 Step3(PACING_PUZZLE.md §6.2): 天使(ゲート2ボス=ミゲル/ジブリル/ラフィ)コントローラの純関数抽出。
// useGameLoop.ts に直書きされていた3つの専用ミニコントローラを、実プレイ(useGameLoop)と
// ヘッドレス(playtestDriver)の両方から呼べる形へ移設(実装精度の規律4/ M17 combatTick と同じ流儀)。
// - シミュレーション(移動・攻撃判定・ダメージ・弾/火/骨刃の生成・カウンター報酬)はここで store を直接叩く。
// - 音(playSfx)だけ AngelSfx コールバックで注入(audioManagerはヘッドレスでimportしない縛りのため)。
//   視覚エフェクト(リング等)は store のプールAPI=ヘッドレスでも無害なので直接呼ぶ。
// - 挙動・数値は移設時点の useGameLoop 実装と同一(変更なし)。定数もここへ移設。
import type { Enemy } from '../types/game';
import {
  useGameStore, skillCritMult, skillOutgoingDamageMult, enemyDeathLabel,
  BOSS_CRIT_DAMAGE_MULT, COUNTER_HITSTOP_MS, COUNTER_SHAKE_MS, COUNTER_SHAKE_MAG, COUNTER_ZOOM_MAG,
  MELEE_FINISH_SLOW_MS, MELEE_FINISH_SLOW_HOLD_MS,
} from '../store/gameStore';
import { getActiveGun } from './weaponUtils';
import { createEnemyProjectile, isGate2AngelBoss } from './enemyUtils';
import { rectsOverlap } from '../world/obstacles';

// --- 音の注入(ヘッドレスはNOOP) -------------------------------------------
export interface AngelSfx {
  counter: () => void;  // カウンター成立(playSfx('counter'))
  reward: () => void;   // 反撃ヒット(playSfx('headshot'))
  sweep: () => void;    // 払い/縦払い実行(playSfx('thor-sweep'))
}
export const NOOP_ANGEL_SFX: AngelSfx = { counter: () => {}, reward: () => {}, sweep: () => {} };

// --- 定数(useGameLoop.tsから移設。トール側のレガシー定数と同値のものは同値コメントで同期義務) ---
const GATE_ARENA_RADIUS = 300;          // ゲートアリーナ半径(useGameLoop.tsと同値)
const BOSS_ACTION_MIN_MS = 2600;        // 完全気絶明けの次アクション先送り(同値)
const ANGEL_ACTION_MIN_MS = 2200;       // 攻撃選択インターバル最短(=THOR_ACTION_MIN_MS)
const ANGEL_ACTION_MAX_MS = 4200;       // 同・最長(=THOR_ACTION_MAX_MS)
const ANGEL_COUNTER_LEAP_MS = 260;      // カウンター後退ジャンプ(=THOR_COUNTER_LEAP_MS)
const ORBIT_RADIUS_CORRECT = 4;         // 半径補正の寄せ係数(=THOR_ORBIT_RADIUS_CORRECT)
const BOSS_BURST_SHOTS = 3;             // 弾3連(同値)
const BOSS_BURST_GAP_MS = 500;          // 0.5秒間隔(同値)
const HARAI_TRIGGER_DIST = 250;         // 斬り系を出せる距離(同値)
// ミゲル
const MIGUEL_HARAI_WINDUP_MS = 1000;
const MIGUEL_HARAI_RANGE = 190;
const MIGUEL_HARAI_HALF_WIDTH = 40;
const MIGUEL_HARAI_ACTIVE_MS = 220;
const MIGUEL_ORBIT_MARGIN = 20;
const MIGUEL_ORBIT_SPEED = 70;
const MIGUEL_MELEE_DASH_MS = 1000;
const MIGUEL_MELEE_DASH_MULT = 2;
const MIGUEL_SLOW_WALK_MS = 1500;
const MIGUEL_SLOW_WALK_MULT = 0.4;
const MIGUEL_SLOW_WALK_MIN_GAP_MS = 4000;
const MIGUEL_SLOW_WALK_MAX_GAP_MS = 9000;
const MIGUEL_VOLLEY_CHANCE = 0.6;
// ジブリル(社長指示v0.25.1663)
const JIBRIL_RETREAT_SPEED = 55;
const JIBRIL_RETREAT_FAST_MULT = 1.7;
const JIBRIL_HITS_FASTER = 3;
const JIBRIL_HITS_WARP = 10;
const JIBRIL_HANDGUN_DIST = 300;
const JIBRIL_SNIPE_SHOTS = 3;
const JIBRIL_SNIPE_GAP_MS = 1000;
const JIBRIL_SNIPE_SPEED_MULT = 2;
const JIBRIL_CLOSE_SHOTS = 5;
const JIBRIL_LANTERN_CHANCE = 0.4;
const JIBRIL_LANTERN_MS = 5000;
const JIBRIL_FIRE_GAP_MS = 700;
const JIBRIL_FIRE_TELEGRAPH_MS = 700;
const JIBRIL_FIRE_LIFE_MS = 2000;
const JIBRIL_FIRE_DAMAGE = 30;
const JIBRIL_FIRE_RADIUS = 22;
// ラフィ(社長指示v0.25.1665)
const RAFI_CHASE_SPEED = 62;
const RAFI_HANDGUN_DIST = 300;
const RAFI_STEP_MIN_GAP_MS = 1800;
const RAFI_STEP_MAX_GAP_MS = 3600;
const RAFI_STEP_MS = 220;
const RAFI_STEP_SPEED = 360;
const RAFI_BONE_COUNT = 7;
const RAFI_BONE_GAP_MS = 600;
const RAFI_JUMP_MAX_REJUMPS = 2;
const RAFI_JUMP_WINDUP_MS = 700;        // =THOR_JUMP_WINDUP_MS(同値)
const RAFI_JUMP_MS = 620;               // =THOR_JUMP_MS(同値)
const RAFI_JUMP_RADIUS = 70;            // =THOR_JUMP_RADIUS(同値)
const RAFI_JUMP_RECOVER_MS = 900;       // =THOR_JUMP_RECOVER_MS(同値)
const SKADI_BLADE_RING_MIN = 100;       // 骨刃の設置リング(スカジと同値)
const SKADI_BLADE_RING_MAX = 180;
const SKADI_BLADE_DELAY_MS = 1000;

// --- ラン単位の状態(useGameLoopの各refの移設。両呼び出し側がラン開始時に作り直す) ---
export interface AngelBossState {
  miguelSlow: { slowUntil: number; nextAt: number };
  miguelVolley: { nextShotAt: number; shots: number };
  jibril: { hits: number; lastHitSeen: number; lastWarpHits: number; volleyMode: 'snipe' | 'close'; shots: number; nextShotAt: number; nextFireAt: number };
  rafi: { rejumps: number; boneLeft: number; boneNextAt: number; nextStepAt: number; stepUntil: number; stepDx: number; stepDy: number };
}
export const createAngelBossState = (): AngelBossState => ({
  miguelSlow: { slowUntil: 0, nextAt: 0 },
  miguelVolley: { nextShotAt: 0, shots: 0 },
  jibril: { hits: 0, lastHitSeen: 0, lastWarpHits: 0, volleyMode: 'snipe', shots: 0, nextShotAt: 0, nextFireAt: 0 },
  rafi: { rejumps: 0, boneLeft: 0, boneNextAt: 0, nextStepAt: 0, stepUntil: 0, stepDx: 0, stepDy: 0 },
});

// カウンター成立の共通処理(旧miguelCounterHit/rafiCounterHit)。演出+プレイヤー無敵+反撃ダメージ。
// 後退(counter-leap)は呼び出し側がpatchで行う(ミゲルのみ)。
const angelCounterHit = (boss: Enemy, bcx: number, hitX: number, hitY: number, sfx: AngelSfx): void => {
  const st = useGameStore.getState();
  const cp = st.player;
  const pnow = Date.now();
  st.addMeleeFinishCombo(1);
  sfx.counter();
  st.spawnGlow(hitX, hitY, 95, 'rgba(56,189,248,', 360);
  st.triggerHitImpact(COUNTER_HITSTOP_MS, COUNTER_SHAKE_MS, COUNTER_SHAKE_MAG, COUNTER_ZOOM_MAG);
  st.markMeleeSwingFx();
  st.spawnRing(hitX, hitY, 14, 135, 'rgba(56,189,248,0.9)', 3, 360);
  st.spawnBurst(hitX, hitY, '#38bdf8', 14);
  st.spawnCallout(hitX, hitY - 12, 'Counter!', '#e0f2ff', { bg: 0x2563eb, holdMs: MELEE_FINISH_SLOW_HOLD_MS, duration: MELEE_FINISH_SLOW_MS });
  useGameStore.setState(stt => ({ player: { ...stt.player, invulnerable: true, invulnerableTime: pnow, lastCounterSuccessTime: pnow } }));
  const counterBase = getActiveGun(cp)?.damage ?? 12;
  const critMult = skillCritMult(cp, BOSS_CRIT_DAMAGE_MULT);
  const dmg = Math.max(1, Math.round(counterBase * critMult * skillOutgoingDamageMult(cp) * (cp.equipBonus?.damageMult ?? 1)));
  useGameStore.getState().damageEnemy(boss.id, dmg, false, true);
  useGameStore.getState().spawnDamageNumber(bcx, boss.y, dmg, true);
  sfx.reward();
  useGameStore.getState().spawnRing(hitX, hitY, 8, 46, 'rgba(253,224,71,0.95)', 3, 300);
  useGameStore.getState().spawnBurst(hitX, hitY, '#fde047', 10);
  useGameStore.getState().spawnGlow(hitX, hitY, 34, 'rgba(253,224,71,', 240);
};

const bodyOverlapNow = (boss: Enemy): { overlap: boolean; counterActive: boolean } => {
  const cp = useGameStore.getState().player;
  return {
    overlap: rectsOverlap({ x: boss.x, y: boss.y, width: boss.width, height: boss.height }, { x: cp.x, y: cp.y, width: cp.width, height: cp.height }),
    counterActive: Date.now() <= cp.counterWindowEnd,
  };
};

const nextActionDelay = (t: number): number => t + ANGEL_ACTION_MIN_MS + Math.random() * (ANGEL_ACTION_MAX_MS - ANGEL_ACTION_MIN_MS);

const applyPatch = (id: string, patch: Partial<Enemy>): void => {
  if (Object.keys(patch).length) {
    useGameStore.setState(stt => ({ enemies: stt.enemies.map(e => e.id === id ? { ...e, ...patch } : e) }));
  }
};

// --- ミゲル(旧useGameLoopミゲル専用ブロックの移設・挙動不変) ---------------------------------
export const runMiguelTick = (
  miguel: Enemy, s: AngelBossState, newGameTime: number, deltaTime: number, moveSpeedMult: number,
  sfx: AngelSfx, onPlayerDeath: (x: number, y: number) => void,
): void => {
  const store = useGameStore.getState();
  const player = store.player;
  const pcx = player.x + player.width / 2, pcy = player.y + player.height / 2;
  const mcx = miguel.x + miguel.width / 2, mcy = miguel.y + miguel.height / 2;
  const bossMoveDt = deltaTime * moveSpeedMult;
  const mHomeX = miguel.homeX ?? mcx, mHomeY = miguel.homeY ?? mcy;
  const st = miguel.bossState ?? 'chase';
  const patch: Partial<Enemy> = {};

  // 「移動中、たまにゆっくり歩く」(トールのSLOWWALKと同型)。
  if (s.miguelSlow.nextAt === 0) {
    s.miguelSlow.nextAt = newGameTime + MIGUEL_SLOW_WALK_MIN_GAP_MS + Math.random() * (MIGUEL_SLOW_WALK_MAX_GAP_MS - MIGUEL_SLOW_WALK_MIN_GAP_MS);
  }
  if (st === 'chase' && newGameTime >= s.miguelSlow.nextAt) {
    s.miguelSlow.slowUntil = newGameTime + MIGUEL_SLOW_WALK_MS;
    s.miguelSlow.nextAt = newGameTime + MIGUEL_SLOW_WALK_MIN_GAP_MS + Math.random() * (MIGUEL_SLOW_WALK_MAX_GAP_MS - MIGUEL_SLOW_WALK_MIN_GAP_MS);
  }
  const slowWalkActive = newGameTime < s.miguelSlow.slowUntil;
  const meleeDashActive = newGameTime - (miguel.meleeHitAt ?? -Infinity) <= MIGUEL_MELEE_DASH_MS;
  const orbitSpeedMult = (meleeDashActive ? MIGUEL_MELEE_DASH_MULT : 1) * (slowWalkActive ? MIGUEL_SLOW_WALK_MULT : 1);
  const halfSize = miguel.height / 2;
  const orbitRadius = GATE_ARENA_RADIUS - MIGUEL_ORBIT_MARGIN - halfSize;

  // 旋回運動(固定のhome中心をCCWで回る)。
  const miguelOrbitMove = (): void => {
    const relX = mcx - mHomeX, relY = mcy - mHomeY;
    const curDist = Math.hypot(relX, relY) || 1;
    const curAngle = Math.atan2(relY, relX);
    const angularSpeed = (MIGUEL_ORBIT_SPEED * orbitSpeedMult) / orbitRadius;
    const newAngle = curAngle - angularSpeed * bossMoveDt; // CCW=角度を減らす向き(Y-down)
    const correctedDist = curDist + (orbitRadius - curDist) * Math.min(1, ORBIT_RADIUS_CORRECT * bossMoveDt);
    patch.x = mHomeX + Math.cos(newAngle) * correctedDist - miguel.width / 2;
    patch.y = mHomeY + Math.sin(newAngle) * correctedDist - miguel.height / 2;
  };

  const miguelCounterHit = (hitX: number, hitY: number): void => {
    angelCounterHit(miguel, mcx, hitX, hitY, sfx);
    const lx = mcx - pcx, ly = mcy - pcy;
    const ll = Math.hypot(lx, ly) || 1;
    patch.bossState = 'counter-leap';
    patch.bossStateUntil = newGameTime + ANGEL_COUNTER_LEAP_MS;
    patch.aiFromX = mcx; patch.aiFromY = mcy;
    patch.aiTargetX = pcx + (lx / ll) * orbitRadius;
    patch.aiTargetY = pcy + (ly / ll) * orbitRadius;
  };

  const miguelFullStun = miguel.bossFullStunUntil !== undefined && newGameTime < miguel.bossFullStunUntil;
  if (miguelFullStun) {
    patch.bossState = 'chase';
    patch.bossNextActionAt = newGameTime + BOSS_ACTION_MIN_MS;
  } else if (st === 'chase') {
    miguelOrbitMove();
    if (newGameTime >= (miguel.bossNextActionAt ?? 0)) {
      const canHarai = Math.hypot(pcx - mcx, pcy - mcy) <= HARAI_TRIGGER_DIST;
      if (!canHarai || Math.random() < MIGUEL_VOLLEY_CHANCE) {
        patch.bossState = 'volley';
        patch.bossStateUntil = newGameTime + BOSS_BURST_SHOTS * BOSS_BURST_GAP_MS;
        s.miguelVolley.nextShotAt = newGameTime; s.miguelVolley.shots = 0;
      } else {
        patch.bossState = 'harai-windup';
        patch.bossStateUntil = newGameTime + MIGUEL_HARAI_WINDUP_MS;
        const rx = mcx - pcx, ry = mcy - pcy;
        const rl = Math.hypot(rx, ry) || 1;
        const tx0 = -ry / rl, ty0 = rx / rl;
        patch.aiFromX = pcx - tx0 * (MIGUEL_HARAI_RANGE / 2);
        patch.aiFromY = pcy - ty0 * (MIGUEL_HARAI_RANGE / 2);
        patch.aiTargetX = pcx + tx0 * (MIGUEL_HARAI_RANGE / 2);
        patch.aiTargetY = pcy + ty0 * (MIGUEL_HARAI_RANGE / 2);
      }
    }
  } else if (st === 'harai-windup' || st === 'tate-windup') {
    // 溜め: 本体静止・カウンター可能。溜め終了で実行へ。
    const { overlap, counterActive } = bodyOverlapNow(miguel);
    if (overlap && counterActive) {
      miguelCounterHit(mcx, mcy);
    } else if (newGameTime >= (miguel.bossStateUntil ?? 0)) {
      patch.bossState = st === 'harai-windup' ? 'harai' : 'tate';
      patch.bossStateUntil = newGameTime + MIGUEL_HARAI_ACTIVE_MS;
      sfx.sweep();
    }
  } else if (st === 'harai' || st === 'tate') {
    // 実行: ロック済みライン上のみ判定(点-線分距離のカプセル)。
    const fx0 = miguel.aiFromX ?? mcx, fy0 = miguel.aiFromY ?? mcy;
    const tx0 = miguel.aiTargetX ?? mcx, ty0 = miguel.aiTargetY ?? mcy;
    let lux = tx0 - fx0, luy = ty0 - fy0;
    const lul = Math.hypot(lux, luy) || 1; lux /= lul; luy /= lul;
    const lineLen = Math.hypot(tx0 - fx0, ty0 - fy0);
    const tproj = Math.max(0, Math.min(lineLen, (pcx - fx0) * lux + (pcy - fy0) * luy));
    const cxp = fx0 + lux * tproj, cyp = fy0 + luy * tproj;
    const pr = Math.max(player.width, player.height) / 2;
    let countered = false;
    if (Math.hypot(pcx - cxp, pcy - cyp) <= MIGUEL_HARAI_HALF_WIDTH + pr) {
      const cp = useGameStore.getState().player;
      if (Date.now() <= cp.counterWindowEnd) {
        miguelCounterHit(cxp, cyp);
        countered = true;
      } else {
        const died = useGameStore.getState().damagePlayer(miguel.damage, `${enemyDeathLabel(miguel.type)}の${st === 'harai' ? '払い' : '縦払い'}`, cxp, cyp);
        if (died) onPlayerDeath(pcx, pcy);
      }
    }
    if (!countered && newGameTime >= (miguel.bossStateUntil ?? 0)) {
      if (st === 'harai') {
        patch.bossState = 'tate-windup';
        patch.bossStateUntil = newGameTime + MIGUEL_HARAI_WINDUP_MS;
        patch.aiFromX = pcx;
        patch.aiFromY = pcy - MIGUEL_HARAI_RANGE / 2;
        patch.aiTargetX = pcx;
        patch.aiTargetY = pcy + MIGUEL_HARAI_RANGE / 2;
      } else {
        patch.bossState = 'chase';
        patch.bossNextActionAt = nextActionDelay(newGameTime);
      }
    }
  } else if (st === 'volley') {
    miguelOrbitMove();
    if (s.miguelVolley.shots < BOSS_BURST_SHOTS && newGameTime >= s.miguelVolley.nextShotAt) {
      useGameStore.getState().addProjectile(createEnemyProjectile(miguel, player));
      s.miguelVolley.shots += 1;
      s.miguelVolley.nextShotAt = newGameTime + BOSS_BURST_GAP_MS;
    }
    if (newGameTime >= (miguel.bossStateUntil ?? 0)) {
      patch.bossState = 'chase';
      patch.bossNextActionAt = nextActionDelay(newGameTime);
    }
  } else if (st === 'counter-leap') {
    const fx0 = miguel.aiFromX ?? mcx, fy0 = miguel.aiFromY ?? mcy;
    const tx0 = miguel.aiTargetX ?? mcx, ty0 = miguel.aiTargetY ?? mcy;
    const t = Math.max(0, Math.min(1, 1 - ((miguel.bossStateUntil ?? newGameTime) - newGameTime) / ANGEL_COUNTER_LEAP_MS));
    patch.x = (fx0 + (tx0 - fx0) * t) - miguel.width / 2;
    patch.y = (fy0 + (ty0 - fy0) * t) - miguel.height / 2;
    if (newGameTime >= (miguel.bossStateUntil ?? 0)) {
      patch.bossState = 'chase';
      patch.bossNextActionAt = nextActionDelay(newGameTime);
    }
  } else {
    patch.bossState = 'chase';
    patch.bossNextActionAt = nextActionDelay(newGameTime);
  }

  applyPatch(miguel.id, patch);
};

// --- ジブリル(旧useGameLoopジブリル専用ブロックの移設・挙動不変) ------------------------------
export const runJibrilTick = (
  jibril: Enemy, s: AngelBossState, newGameTime: number, deltaTime: number, moveSpeedMult: number,
  sfx: AngelSfx,
): void => {
  const store = useGameStore.getState();
  const player = store.player;
  const pcx = player.x + player.width / 2, pcy = player.y + player.height / 2;
  const jcx = jibril.x + jibril.width / 2, jcy = jibril.y + jibril.height / 2;
  const bossMoveDt = deltaTime * moveSpeedMult;
  const jHomeX = jibril.homeX ?? jcx, jHomeY = jibril.homeY ?? jcy;
  const maxR = GATE_ARENA_RADIUS - MIGUEL_ORBIT_MARGIN - jibril.height / 2;
  const st = jibril.bossState ?? 'chase';
  const patch: Partial<Enemy> = {};
  const jr = s.jibril;
  void sfx; // ジブリルは現状専用SEなし(将来のランタンSE等の置き場)

  // 被弾カウント(lastHitの変化=1被弾として近似)。
  if (jibril.lastHit && jibril.lastHit !== jr.lastHitSeen) {
    jr.hits += 1;
    jr.lastHitSeen = jibril.lastHit;
  }
  const retreatMove = (): void => {
    const ax = jcx - pcx, ay = jcy - pcy;
    const al = Math.hypot(ax, ay) || 1;
    const spd = JIBRIL_RETREAT_SPEED * (jr.hits >= JIBRIL_HITS_FASTER ? JIBRIL_RETREAT_FAST_MULT : 1);
    let nx = jcx + (ax / al) * spd * bossMoveDt;
    let ny = jcy + (ay / al) * spd * bossMoveDt;
    const rx = nx - jHomeX, ry = ny - jHomeY;
    const rl = Math.hypot(rx, ry);
    if (rl > maxR) { nx = jHomeX + (rx / rl) * maxR; ny = jHomeY + (ry / rl) * maxR; }
    patch.x = nx - jibril.width / 2;
    patch.y = ny - jibril.height / 2;
  };

  const jibrilFull = jibril.bossFullStunUntil !== undefined && newGameTime < jibril.bossFullStunUntil;
  if (jr.hits - jr.lastWarpHits >= JIBRIL_HITS_WARP) {
    // 10発ごと: ゲート中心を挟んでプレイヤーの反対側(アリーナ縁)へワープ。
    jr.lastWarpHits = jr.hits;
    const dx = jHomeX - pcx, dy = jHomeY - pcy;
    const dl = Math.hypot(dx, dy) || 1;
    const wx = jHomeX + (dx / dl) * maxR, wy = jHomeY + (dy / dl) * maxR;
    useGameStore.getState().spawnRing(jcx, jcy, 8, 60, 'rgba(168,85,247,0.8)', 3, 300);
    patch.x = wx - jibril.width / 2;
    patch.y = wy - jibril.height / 2;
    useGameStore.getState().spawnRing(wx, wy, 8, 70, 'rgba(168,85,247,0.9)', 3, 340);
    useGameStore.getState().spawnFlash('rgba(88,28,135,0.20)', 240);
    patch.bossState = 'chase';
    patch.bossNextActionAt = newGameTime + BOSS_ACTION_MIN_MS;
  } else if (jibrilFull) {
    patch.bossState = 'chase';
    patch.bossNextActionAt = newGameTime + BOSS_ACTION_MIN_MS;
  } else if (st === 'chase') {
    retreatMove();
    if (newGameTime >= (jibril.bossNextActionAt ?? 0)) {
      if (Math.random() < JIBRIL_LANTERN_CHANCE) {
        patch.bossState = 'lantern';
        patch.bossStateUntil = newGameTime + JIBRIL_LANTERN_MS;
        jr.nextFireAt = newGameTime;
      } else {
        const dist = Math.hypot(pcx - jcx, pcy - jcy);
        jr.volleyMode = dist <= JIBRIL_HANDGUN_DIST ? 'close' : 'snipe';
        jr.shots = 0;
        jr.nextShotAt = newGameTime;
        const shots = jr.volleyMode === 'close' ? JIBRIL_CLOSE_SHOTS : JIBRIL_SNIPE_SHOTS;
        const gap = jr.volleyMode === 'close' ? BOSS_BURST_GAP_MS : JIBRIL_SNIPE_GAP_MS;
        patch.bossState = 'volley';
        patch.bossStateUntil = newGameTime + shots * gap + 200;
      }
    }
  } else if (st === 'volley') {
    retreatMove();
    const shots = jr.volleyMode === 'close' ? JIBRIL_CLOSE_SHOTS : JIBRIL_SNIPE_SHOTS;
    const gap = jr.volleyMode === 'close' ? BOSS_BURST_GAP_MS : JIBRIL_SNIPE_GAP_MS;
    if (jr.shots < shots && newGameTime >= jr.nextShotAt) {
      const proj = createEnemyProjectile(jibril, player);
      if (jr.volleyMode === 'snipe') proj.speed *= JIBRIL_SNIPE_SPEED_MULT;
      useGameStore.getState().addProjectile(proj);
      jr.shots += 1;
      jr.nextShotAt = newGameTime + gap;
    }
    if (jr.shots >= shots && newGameTime >= (jibril.bossStateUntil ?? 0)) {
      patch.bossState = 'chase';
      patch.bossNextActionAt = nextActionDelay(newGameTime);
    }
  } else if (st === 'lantern') {
    retreatMove();
    if (newGameTime >= jr.nextFireAt) {
      const fpx = pcx, fpy = player.y + player.height;
      useGameStore.getState().spawnBossFire(fpx, fpy, newGameTime, newGameTime + JIBRIL_FIRE_TELEGRAPH_MS, newGameTime + JIBRIL_FIRE_TELEGRAPH_MS + JIBRIL_FIRE_LIFE_MS);
      jr.nextFireAt = newGameTime + JIBRIL_FIRE_GAP_MS;
    }
    if (newGameTime >= (jibril.bossStateUntil ?? 0)) {
      patch.bossState = 'chase';
      patch.bossNextActionAt = nextActionDelay(newGameTime);
    }
  } else {
    patch.bossState = 'chase';
    patch.bossNextActionAt = newGameTime + BOSS_ACTION_MIN_MS;
  }

  applyPatch(jibril.id, patch);
};

// --- ラフィ(旧useGameLoopラフィ専用ブロックの移設・挙動不変) ---------------------------------
export const runRafiTick = (
  rafi: Enemy, s: AngelBossState, newGameTime: number, deltaTime: number, moveSpeedMult: number,
  sfx: AngelSfx,
): void => {
  const store = useGameStore.getState();
  const player = store.player;
  const pcx = player.x + player.width / 2, pcy = player.y + player.height / 2;
  const rcx = rafi.x + rafi.width / 2, rcy = rafi.y + rafi.height / 2;
  const bossMoveDt = deltaTime * moveSpeedMult;
  const rHomeX = rafi.homeX ?? rcx, rHomeY = rafi.homeY ?? rcy;
  const maxR = GATE_ARENA_RADIUS - MIGUEL_ORBIT_MARGIN - rafi.height / 2;
  const st = rafi.bossState ?? 'chase';
  const patch: Partial<Enemy> = {};
  const rr = s.rafi;

  const clampArena = (nx: number, ny: number): { x: number; y: number } => {
    const dx = nx - rHomeX, dy = ny - rHomeY;
    const dl = Math.hypot(dx, dy);
    if (dl > maxR) return { x: rHomeX + (dx / dl) * maxR, y: rHomeY + (dy / dl) * maxR };
    return { x: nx, y: ny };
  };
  const chaseMove = (spd: number): void => {
    const dx = pcx - rcx, dy = pcy - rcy;
    const dl = Math.hypot(dx, dy) || 1;
    const c = clampArena(rcx + (dx / dl) * spd * bossMoveDt, rcy + (dy / dl) * spd * bossMoveDt);
    patch.x = c.x - rafi.width / 2; patch.y = c.y - rafi.height / 2;
  };

  const rafiCounterHit = (hx: number, hy: number): void => angelCounterHit(rafi, rcx, hx, hy, sfx);

  const rafiFull = rafi.bossFullStunUntil !== undefined && newGameTime < rafi.bossFullStunUntil;
  if (rafiFull) {
    patch.bossState = 'chase'; patch.bossNextActionAt = newGameTime + BOSS_ACTION_MIN_MS;
  } else if (st === 'chase') {
    if (newGameTime < rr.stepUntil) {
      const c = clampArena(rcx + rr.stepDx * RAFI_STEP_SPEED * bossMoveDt, rcy + rr.stepDy * RAFI_STEP_SPEED * bossMoveDt);
      patch.x = c.x - rafi.width / 2; patch.y = c.y - rafi.height / 2;
    } else if (rr.nextStepAt !== 0 && newGameTime >= rr.nextStepAt) {
      const dx = pcx - rcx, dy = pcy - rcy; const dl = Math.hypot(dx, dy) || 1;
      const side = Math.random() < 0.5 ? 1 : -1;
      rr.stepDx = (-dy / dl) * side; rr.stepDy = (dx / dl) * side;
      rr.stepUntil = newGameTime + RAFI_STEP_MS;
      rr.nextStepAt = newGameTime + RAFI_STEP_MS + RAFI_STEP_MIN_GAP_MS + Math.random() * (RAFI_STEP_MAX_GAP_MS - RAFI_STEP_MIN_GAP_MS);
    } else {
      if (rr.nextStepAt === 0) rr.nextStepAt = newGameTime + RAFI_STEP_MIN_GAP_MS + Math.random() * (RAFI_STEP_MAX_GAP_MS - RAFI_STEP_MIN_GAP_MS);
      chaseMove(RAFI_CHASE_SPEED);
    }
    if (newGameTime >= rr.stepUntil && newGameTime >= (rafi.bossNextActionAt ?? 0)) {
      const dist = Math.hypot(pcx - rcx, pcy - rcy);
      rr.rejumps = 0;
      if (dist <= RAFI_HANDGUN_DIST) {
        patch.bossState = 'bone';
        rr.boneLeft = RAFI_BONE_COUNT; rr.boneNextAt = newGameTime;
      } else {
        patch.bossState = 'jump-windup';
        patch.bossStateUntil = newGameTime + RAFI_JUMP_WINDUP_MS;
      }
    }
  } else if (st === 'bone') {
    if (rr.boneLeft > 0 && newGameTime >= rr.boneNextAt) {
      const a0 = Math.random() * Math.PI * 2;
      const dist = SKADI_BLADE_RING_MIN + Math.random() * (SKADI_BLADE_RING_MAX - SKADI_BLADE_RING_MIN);
      const sx = pcx + Math.cos(a0) * dist, sy = pcy + Math.sin(a0) * dist;
      const aim = Math.atan2(pcy - sy, pcx - sx);
      useGameStore.getState().spawnSkadiBlade(sx, sy, aim, newGameTime + SKADI_BLADE_DELAY_MS, rafi.id, 'bone');
      rr.boneLeft -= 1;
      rr.boneNextAt = newGameTime + RAFI_BONE_GAP_MS;
    }
    if (rr.boneLeft <= 0) {
      patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime);
    }
  } else if (st === 'jump-windup') {
    const { overlap, counterActive } = bodyOverlapNow(rafi);
    if (overlap && counterActive) {
      rafiCounterHit(rcx, rcy);
      if (rr.rejumps < RAFI_JUMP_MAX_REJUMPS) {
        rr.rejumps += 1;
        patch.bossState = 'jump-windup';
        patch.bossStateUntil = newGameTime + RAFI_JUMP_WINDUP_MS;
      } else {
        patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime);
      }
    } else if (newGameTime >= (rafi.bossStateUntil ?? 0)) {
      patch.bossState = 'jump-attack';
      patch.bossStateUntil = newGameTime + RAFI_JUMP_MS;
      patch.aiFromX = rcx; patch.aiFromY = rcy;
      patch.aiTargetX = pcx; patch.aiTargetY = pcy;
    }
  } else if (st === 'jump-attack') {
    const fx0 = rafi.aiFromX ?? rcx, fy0 = rafi.aiFromY ?? rcy;
    const tx0 = rafi.aiTargetX ?? rcx, ty0 = rafi.aiTargetY ?? rcy;
    const t = Math.max(0, Math.min(1, 1 - ((rafi.bossStateUntil ?? newGameTime) - newGameTime) / RAFI_JUMP_MS));
    patch.x = (fx0 + (tx0 - fx0) * t) - rafi.width / 2;
    patch.y = (fy0 + (ty0 - fy0) * t) - rafi.height / 2;
    if (newGameTime >= (rafi.bossStateUntil ?? 0)) {
      useGameStore.setState(state => ({
        pumpkinBlasts: [...state.pumpkinBlasts, { x: tx0, y: ty0, radius: RAFI_JUMP_RADIUS, damage: rafi.damage, enemyId: rafi.id }],
      }));
      patch.bossState = 'jump-recover';
      patch.bossStateUntil = newGameTime + RAFI_JUMP_RECOVER_MS;
    }
  } else if (st === 'jump-recover') {
    const { overlap, counterActive } = bodyOverlapNow(rafi);
    if (overlap && counterActive) {
      rafiCounterHit(rcx, rcy);
      patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime);
    } else if (newGameTime >= (rafi.bossStateUntil ?? 0)) {
      patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime);
    }
  } else {
    patch.bossState = 'chase'; patch.bossNextActionAt = newGameTime + BOSS_ACTION_MIN_MS;
  }

  applyPatch(rafi.id, patch);
};

// --- ディスパッチャ(両呼び出し側の入口) -----------------------------------------------------
export const runAngelBossTick = (
  s: AngelBossState, newGameTime: number, deltaTime: number, moveSpeedMult: number,
  sfx: AngelSfx, onPlayerDeath: (x: number, y: number) => void,
): void => {
  const angel = useGameStore.getState().enemies.find(e => isGate2AngelBoss(e.type) && e.bossState != null);
  if (!angel) return;
  if (angel.type === 'miguel') runMiguelTick(angel, s, newGameTime, deltaTime, moveSpeedMult, sfx, onPlayerDeath);
  else if (angel.type === 'jibril') runJibrilTick(angel, s, newGameTime, deltaTime, moveSpeedMult, sfx);
  else if (angel.type === 'rafi') runRafiTick(angel, s, newGameTime, deltaTime, moveSpeedMult, sfx);
};

// --- ジブリルのランタン火(bossFires)のtick(旧useGameLoop v0.25.1664ブロックの移設・挙動不変) ---
// 寿命切れ回収+有効化後のプレイヤー接触判定。触れると30固定ダメージでその火は消える(単発)。
// 1フレーム1ヒット制限(重なり火の多重ダメージ/i-frame無視を防ぐ)。
export const tickAngelBossFires = (newGameTime: number, onPlayerDeath: (x: number, y: number) => void): void => {
  const bf = useGameStore.getState().bossFires;
  if (bf.length === 0) return;
  const pl = useGameStore.getState().player;
  const plcx = pl.x + pl.width / 2, plcy = pl.y + pl.height / 2;
  const hitR = JIBRIL_FIRE_RADIUS + Math.min(pl.width, pl.height) / 2;
  let died = false;
  let struck = false;
  const survivors: typeof bf = [];
  for (const f of bf) {
    if (newGameTime >= f.expireAt) continue;
    const active = newGameTime >= f.activateAt;
    if (active && !pl.invulnerable && !died && !struck && Math.hypot(plcx - f.x, plcy - f.y) <= hitR) {
      struck = true;
      const d = useGameStore.getState().damagePlayer(JIBRIL_FIRE_DAMAGE, 'ジブリルのランタン火', f.x, f.y);
      if (d) { died = true; onPlayerDeath(plcx, plcy); }
      continue;
    }
    survivors.push(f);
  }
  if (survivors.length !== bf.length) useGameStore.getState().setBossFires(survivors);
};

// 監査レポート§2(バッチ3・v0.25.2613): idol(stage-2隠しボス)のコントローラ。
// useGameLoop.ts に直書きされていた状態機械を、実プレイとヘッドレス(計測プローブ)の両方から
// 呼べる純関数へ移設した(angelBossTick.ts と同じ流儀・実装精度の規律4)。
// - シミュレーション(移動・攻撃判定・弾/帯の生成・カウンター報酬)はここで store を直接叩く。
// - 音(playSfx)と死亡通知だけコールバックで注入(audioManagerはヘッドレスでimportしない縛り)。
//
// 状態文法(監査レポート§3-1): NEUTRAL(主戦帯を維持) → STRING(連段) → REST(休符) → NEUTRAL。
// 懲罰(PUNISH)は中立中いつでも割り込む。**休符は必ず入る**(プレイヤーのターンを消さない)。
import type { Enemy } from '../types/game';
import {
  useGameStore, counterReplyDamage, skillLevel, BOSS_CRIT_DAMAGE_MULT,
  COUNTER_HITSTOP_MS, COUNTER_SHAKE_MS, COUNTER_SHAKE_MAG, COUNTER_ZOOM_MAG,
  MELEE_FINISH_SLOW_MS, MELEE_FINISH_SLOW_HOLD_MS, bossCritCdMult, enemyDeathLabel,
} from '../store/gameStore';
import { getActiveGun } from './weaponUtils';
import { createEnemyProjectile } from './enemyUtils';
import { rectsOverlap } from '../world/obstacles';
import { distToSegment } from './levelUpGate';
import { isCounterablePhase, phaseJustChanged } from './bossScript';
import { neutralVerb, pickStringScript, restMsFor, punishTrigger, type NeutralVerb } from './bossSkeleton';
import { resolveBossHateAim } from './bossHate';
import { notifyCounterHit, notifyMoveCounter } from './playerTraits';
import { refundCounterCooldown } from './counterMaster';
import { consumeGhostCounterClaim, applyGhostCounterEffect, type GhostCounterFire } from './ghostCounter';
import { npcSfxDistGain } from './npcSfx';
import {
  IDOL_STRINGS, IDOL_STRING_LEN, IDOL_REST, IDOL_PUNISH, IDOL_NEUTRAL_BAND, IDOL_VERB_SPEED_MULT,
  IDOL_TIMING, IDOL_ROLL_DIST, IDOL_PUNCH_RANGE, IDOL_PUNCH_HALF_WIDTH,
  IDOL_SNIPE_RANGE, IDOL_SNIPE_HALF_WIDTH, IDOL_FAN_SPREAD_STEP,
  IDOL_ORB_SPEED, IDOL_ORB_TURN_RATE, IDOL_SAME_ANGLE_DEG, IDOL_WAVE_DELAY_MS,
  IDOL_NEUTRAL_MIN_MS, IDOL_NEUTRAL_MAX_MS,
  idolZone, idolPhaseForHealth, idolFanCount, idolOrbCount, idolWaveActive, type IdolMove,
} from './idolScript';

export interface IdolSfx {
  alert: () => void;
  counter: (gain?: number) => void;
  reward: (gain?: number) => void;
}
export const NOOP_IDOL_SFX: IdolSfx = { alert: () => {}, counter: () => {}, reward: () => {} };

/** ラン単位の状態(useGameLoop / プローブがラン開始時に作り直す)。 */
export interface IdolTickState {
  seq: IdolMove[];        // 進行中のストリング(空=中立)
  step: number;           // 次に出す段のindex
  strafeDir: 1 | -1;      // 並走の向き
  wavePending: boolean;   // Phase2の第二波が未発火か
  farSince: number; meleeSince: number; angleSince: number; lastAngle: number;
  orbIds: string[];       // 追尾弾(毎フレーム旋回させる対象)
}
export const createIdolTickState = (): IdolTickState => ({
  seq: [], step: 0, strafeDir: 1, wavePending: false,
  farSince: 0, meleeSince: 0, angleSince: 0, lastAngle: 0, orbIds: [],
});

const ORB_ID_PREFIX = 'proj-idolorb-';
const WINDUP_STATES = ['idol-aim-windup', 'idol-fan-windup', 'idol-roll-windup', 'idol-punch-windup', 'idol-snipe-windup', 'idol-orb-windup'];
const RECOVER_STATES = ['idol-aim-recover', 'idol-fan-recover', 'idol-roll-recover', 'idol-punch-recover', 'idol-snipe-recover', 'idol-orb-recover'];
export const IDOL_WINDUP_STATES: readonly string[] = WINDUP_STATES;
export const IDOL_RECOVER_STATES: readonly string[] = RECOVER_STATES;
/** 休符(REST)の州。W6と同じ「完全静止+青白tint+次技抽選なし」だが、**カウンターは通る**。 */
export const IDOL_REST_STATE = 'idol-rest';

type BossStateName = NonNullable<Enemy['bossState']>;
const windupState = (m: IdolMove): BossStateName => `idol-${m}-windup` as BossStateName;
const recoverState = (m: IdolMove): BossStateName => `idol-${m}-recover` as BossStateName;

export const runIdolTick = (
  idol: Enemy,
  s: IdolTickState,
  newGameTime: number,
  deltaTime: number,
  moveSpeedMult: number,
  sfx: IdolSfx,
  counterEnabled: boolean,
  onPlayerDeath: (x: number, y: number) => void,
): void => {
  const store = useGameStore.getState();
  const player = store.player;
  const pcx = player.x + player.width / 2, pcy = player.y + player.height / 2;
  const icx = idol.x + idol.width / 2, icy = idol.y + idol.height / 2;
  const dt = deltaTime * moveSpeedMult;
  const dist = Math.hypot(pcx - icx, pcy - icy);
  const zone = idolZone(dist);
  const patch: Partial<Enemy> = {};

  // ---- 起床(社長裁定v0.25.2613): 距離200px+視線 に加えて**被弾でも起きる** ----------------------
  // 「探しに行った人だけが会う」意図(§6.28-20)は壊れない: 撃てている=既に見つけているため。
  // 感知範囲(aggroRange=200)は据え置き。起床の距離/視線判定は呼び出し側が持つ(壁クエリが要るため)。
  if (idol.dormant) {
    if (idol.lastHit !== undefined && idol.lastHit > 0) {
      useGameStore.setState(st => ({
        enemies: st.enemies.map(e => e.id === idol.id
          ? { ...e, dormant: false, bossState: 'chase', bossNextActionAt: newGameTime + 400 } : e),
      }));
    }
    return;
  }

  const hpFrac = idol.maxHealth > 0 ? idol.health / idol.maxHealth : 1;
  const phase = idolPhaseForHealth(hpFrac);
  if (phaseJustChanged(idol.bossPhase, phase)) patch.bossPhaseFlashUntil = newGameTime + 1200;
  patch.bossPhase = phase;
  const st = idol.bossState ?? 'chase';
  const fresh = (): Enemy => useGameStore.getState().enemies.find(e => e.id === idol.id) ?? idol;
  const hateAim = () => resolveBossHateAim(idol, { x: pcx, y: pcy }, useGameStore.getState().summons, newGameTime);

  // ---- 追尾弾の旋回(毎フレーム・上限3発=負荷1/10) ---------------------------------------------
  // 速度155 > プレイヤー104.4 なので走っても振り切れない。**旋回速度1.5rad/sは有限**なので、
  // 密着して小さく回れば内側に入って外せる=「近づくほど安全」の主題そのもの(詰めた側の報酬)。
  if (s.orbIds.length > 0) {
    const live = new Set(useGameStore.getState().projectiles.map(p => p.id));
    s.orbIds = s.orbIds.filter(id => live.has(id));
    if (s.orbIds.length > 0) {
      const ids = new Set(s.orbIds);
      useGameStore.setState(state => ({
        projectiles: state.projectiles.map(p => {
          if (!ids.has(p.id)) return p;
          const cur = Math.atan2(p.direction.y, p.direction.x);
          const want = Math.atan2(pcy - (p.y + p.height / 2), pcx - (p.x + p.width / 2));
          let d = want - cur;
          while (d > Math.PI) d -= Math.PI * 2;
          while (d < -Math.PI) d += Math.PI * 2;
          const step = Math.max(-IDOL_ORB_TURN_RATE * dt, Math.min(IDOL_ORB_TURN_RATE * dt, d));
          const a = cur + step;
          return { ...p, direction: { x: Math.cos(a), y: Math.sin(a) } };
        }),
      }));
    }
  }

  // ---- カウンター(W7: windup中/硬直中/休符中の接触=可) -----------------------------------------
  const counterHit = (hx: number, hy: number, ghost?: GhostCounterFire): void => {
    if (ghost) {
      applyGhostCounterEffect(idol, hx, hy, ghost, (k, g) => (k === 'counter' ? sfx.counter(g) : sfx.reward(g)));
    } else {
      notifyCounterHit();
      notifyMoveCounter();
      const cp = useGameStore.getState().player;
      const pnow = Date.now();
      const g = useGameStore.getState();
      g.addMeleeFinishCombo(1);
      sfx.counter();
      g.spawnGlow(hx, hy, 95, 'rgba(56,189,248,', 360);
      g.triggerHitImpact(COUNTER_HITSTOP_MS, COUNTER_SHAKE_MS, COUNTER_SHAKE_MAG, COUNTER_ZOOM_MAG);
      g.markMeleeSwingFx();
      g.spawnRing(hx, hy, 14, 135, 'rgba(56,189,248,0.9)', 3, 360);
      g.spawnBurst(hx, hy, '#38bdf8', 14);
      g.spawnCallout(hx, hy - 12, 'Counter!', '#e0f2ff', { bg: 0x2563eb, holdMs: MELEE_FINISH_SLOW_HOLD_MS, duration: MELEE_FINISH_SLOW_MS });
      useGameStore.setState(stt => ({ player: {
        ...stt.player, invulnerable: true, invulnerableTime: pnow, lastCounterSuccessTime: pnow,
        counterCooldownEnd: refundCounterCooldown(stt.player.counterCooldownEnd, pnow, skillLevel(stt.player, 'counter-master')),
      } }));
      const dmg = counterReplyDamage(getActiveGun(cp)?.damage ?? 12, cp, BOSS_CRIT_DAMAGE_MULT);
      useGameStore.getState().damageEnemy(idol.id, dmg, false, true);
      useGameStore.getState().spawnDamageNumber(icx, idol.y, dmg, true);
      sfx.reward();
      useGameStore.getState().spawnRing(hx, hy, 8, 46, 'rgba(253,224,71,0.95)', 3, 300);
      useGameStore.getState().spawnBurst(hx, hy, '#fde047', 10);
      useGameStore.getState().spawnGlow(hx, hy, 34, 'rgba(253,224,71,', 240);
    }
    // カウンターはストリングを断ち切る=プレイヤーの勝ち。休符へ入れて必ずターンを渡す。
    s.seq = []; s.step = 0; s.wavePending = false;
    patch.bossState = IDOL_REST_STATE;
    patch.bossStateUntil = newGameTime + restMsFor(phase, IDOL_REST) * bossCritCdMult(fresh(), newGameTime);
  };

  const counterableNow = counterEnabled
    && (isCounterablePhase(st, WINDUP_STATES, RECOVER_STATES) || st === IDOL_REST_STATE);
  let countered = false;
  if (counterableNow) {
    const cp = useGameStore.getState().player;
    const overlap = rectsOverlap({ x: idol.x, y: idol.y, width: idol.width, height: idol.height },
      { x: cp.x, y: cp.y, width: cp.width, height: cp.height });
    if (overlap && Date.now() <= cp.counterWindowEnd) { counterHit(icx, icy); countered = true; }
    else {
      const claim = consumeGhostCounterClaim(idol.id, Date.now());
      if (claim) {
        const g = useGameStore.getState();
        counterHit(icx, icy, { claim, sfxGain: npcSfxDistGain(icx, icy, pcx, pcy, g.camera, g.gameBounds) });
        countered = true;
      }
    }
  }

  // ---- 技の開始(ストリングの1段を出す) --------------------------------------------------------
  const beginMove = (m: IdolMove): void => {
    sfx.alert();
    s.wavePending = idolWaveActive(m, phase);
    patch.bossState = windupState(m);
    patch.bossStateUntil = newGameTime + IDOL_TIMING[m].windup;
    if (m === 'snipe') {
      // 掟W4: 溜め開始で線をロック(テルを出したら必ず撃つ)。図形=判定=描画が同じ2点を読む。
      const aim = hateAim();
      const dl = Math.hypot(aim.x - icx, aim.y - icy) || 1;
      patch.aiFromX = icx; patch.aiFromY = icy;
      patch.aiTargetX = icx + ((aim.x - icx) / dl) * IDOL_SNIPE_RANGE;
      patch.aiTargetY = icy + ((aim.y - icy) / dl) * IDOL_SNIPE_RANGE;
      patch.hateTarget = aim.side;
    } else if (m === 'roll') {
      const aim = hateAim();
      const dl = Math.hypot(icx - aim.x, icy - aim.y) || 1;
      patch.aiFromX = icx; patch.aiFromY = icy;
      patch.aiTargetX = icx + ((icx - aim.x) / dl) * IDOL_ROLL_DIST;
      patch.aiTargetY = icy + ((icy - aim.y) / dl) * IDOL_ROLL_DIST;
      patch.hateTarget = aim.side;
    }
  };

  /** 段が1つ終わった: 第二波→次の段→休符 の順で決める。 */
  const afterMove = (m: IdolMove): void => {
    if (s.wavePending) {
      // ★Phase2の第二波(ER §2-15 約束の王ラダーンP2): 同じ技をもう一度、短い予告で。
      // **同じ予告図形/同じ判定を再利用する**ので「赤いのに当たらない/赤くないのに当たる」が起きない。
      s.wavePending = false;
      sfx.alert();
      patch.bossState = windupState(m);
      patch.bossStateUntil = newGameTime + IDOL_WAVE_DELAY_MS;
      return;
    }
    if (s.step < s.seq.length) { beginMove(s.seq[s.step++]); return; }
    // ストリング終端=休符(必ず入る)。
    s.seq = []; s.step = 0;
    patch.bossState = IDOL_REST_STATE;
    patch.bossStateUntil = newGameTime + restMsFor(phase, IDOL_REST) * bossCritCdMult(fresh(), newGameTime);
  };

  const toRecover = (m: IdolMove): void => {
    patch.bossState = recoverState(m);
    patch.bossStateUntil = newGameTime + IDOL_TIMING[m].recover;
  };

  const fire = (tx: number, ty: number): void =>
    useGameStore.getState().addProjectile(createEnemyProjectile(idol, player, tx, ty));

  const hitCapsule = (fx: number, fy: number, tx: number, ty: number, halfW: number): void => {
    useGameStore.setState(state => ({
      pumpkinBlasts: [...state.pumpkinBlasts, {
        x: (fx + tx) / 2, y: (fy + ty) / 2, radius: halfW, damage: idol.damage, enemyId: idol.id,
        capsule: { fx, fy, tx, ty, halfWidth: halfW },
      }],
    }));
  };

  // ---- 状態機械 -------------------------------------------------------------------------------
  if (countered) {
    // カウンター成立フレームは遷移をスキップ(counterHitが休符まで設定済み)。
  } else if (st === 'chase') {
    // === NEUTRAL: 主戦帯を維持する(監査レポート§2-5の移動語彙4つ) ===
    const verb: NeutralVerb = neutralVerb(dist, IDOL_NEUTRAL_BAND, false);
    const spd = idol.speed * IDOL_VERB_SPEED_MULT[verb] * dt;
    const ux = dist > 0.001 ? (pcx - icx) / dist : 0, uy = dist > 0.001 ? (pcy - icy) / dist : 0;
    if (verb === 'close') { patch.x = idol.x + ux * spd; patch.y = idol.y + uy * spd; }
    else if (verb === 'retreat') { patch.x = idol.x - ux * spd; patch.y = idol.y - uy * spd; }
    else { patch.x = idol.x + (-uy * s.strafeDir) * spd; patch.y = idol.y + (ux * s.strafeDir) * spd; }

    // 懲罰シグナルの積み上げ(ER原則⑤)。
    const stepMs = deltaTime * 1000;
    s.farSince = dist > IDOL_NEUTRAL_BAND.max ? s.farSince + stepMs : 0;
    s.meleeSince = zone === 'melee' ? s.meleeSince + stepMs : 0;
    const ang = Math.atan2(pcy - icy, pcx - icx);
    let dAng = Math.abs(ang - s.lastAngle);
    while (dAng > Math.PI) dAng = Math.abs(dAng - Math.PI * 2);
    s.angleSince = dAng <= (IDOL_SAME_ANGLE_DEG * Math.PI) / 180 ? s.angleSince + stepMs : 0;
    s.lastAngle = ang;

    if (newGameTime >= (idol.bossNextActionAt ?? 0)) {
      const pun = punishTrigger({ farMs: s.farSince, meleeMs: s.meleeSince, sameAngleMs: s.angleSince }, IDOL_PUNISH);
      if (pun.flipStrafe) { s.strafeDir = (s.strafeDir === 1 ? -1 : 1); s.angleSince = 0; }
      if (pun.move) {
        s.farSince = 0; s.meleeSince = 0;
        s.seq = []; s.step = 0;
        beginMove(pun.move);
      } else {
        const ready: Record<IdolMove, boolean> = { aim: true, fan: true, roll: true, punch: true, snipe: true, orb: true };
        const seq = pickStringScript(IDOL_STRINGS, zone, phase, IDOL_STRING_LEN, ready);
        if (seq) { s.seq = seq; s.step = 0; beginMove(s.seq[s.step++]); }
      }
    }
  } else if (st === IDOL_REST_STATE) {
    // === REST: 完全静止。ここだけがプレイヤーのターン(0にはしない) ===
    if (newGameTime >= (idol.bossStateUntil ?? 0)) {
      // 休符明けは**中立へ戻る**。ここで主戦帯まで歩き直す時間を必ず取る(ER原則③)。
      patch.bossState = 'chase';
      patch.bossNextActionAt = newGameTime + IDOL_NEUTRAL_MIN_MS + Math.random() * (IDOL_NEUTRAL_MAX_MS - IDOL_NEUTRAL_MIN_MS);
    }
  } else if (st === 'idol-aim-windup') {
    if (newGameTime >= (idol.bossStateUntil ?? 0)) {
      const aim = hateAim();
      fire(aim.x, aim.y);
      patch.hateTarget = aim.side;
      toRecover('aim');
    }
  } else if (st === 'idol-fan-windup') {
    if (newGameTime >= (idol.bossStateUntil ?? 0)) {
      const aim = hateAim();
      patch.hateTarget = aim.side;
      const count = idolFanCount(phase);
      const ang = Math.atan2(aim.y - icy, aim.x - icx);
      const half = (count - 1) / 2;
      for (let k = 0; k < count; k++) {
        const a = ang + (k - half) * IDOL_FAN_SPREAD_STEP;
        fire(icx + Math.cos(a) * 100, icy + Math.sin(a) * 100);
      }
      toRecover('fan');
    }
  } else if (st === 'idol-orb-windup') {
    if (newGameTime >= (idol.bossStateUntil ?? 0)) {
      const aim = hateAim();
      patch.hateTarget = aim.side;
      const n = idolOrbCount(phase);
      const base = Math.atan2(aim.y - icy, aim.x - icx);
      const ids: string[] = [];
      for (let k = 0; k < n; k++) {
        const a = base + (k - (n - 1) / 2) * 0.5; // 少し散らして出す(全弾が同じ線に乗らない)
        const p = createEnemyProjectile(idol, player, icx + Math.cos(a) * 100, icy + Math.sin(a) * 100);
        p.id = `${ORB_ID_PREFIX}${idol.id}-${newGameTime}-${k}`;
        p.speed = IDOL_ORB_SPEED;
        useGameStore.getState().addProjectile(p);
        ids.push(p.id);
      }
      s.orbIds = [...s.orbIds, ...ids];
      toRecover('orb');
    }
  } else if (st === 'idol-snipe-windup') {
    if (newGameTime >= (idol.bossStateUntil ?? 0)) {
      patch.bossState = 'idol-snipe';
      patch.bossStateUntil = newGameTime + IDOL_TIMING.snipe.active;
    }
  } else if (st === 'idol-snipe') {
    // ロック済みの線上のみ判定(点-線分距離のカプセル)。図形=判定=描画が同じ2点を読む。
    const fx = idol.aiFromX ?? icx, fy = idol.aiFromY ?? icy;
    const tx = idol.aiTargetX ?? icx, ty = idol.aiTargetY ?? icy;
    const pr = Math.max(player.width, player.height) / 2;
    if (distToSegment({ x: pcx, y: pcy }, { x: fx, y: fy }, { x: tx, y: ty }) <= IDOL_SNIPE_HALF_WIDTH + pr) {
      const died = useGameStore.getState().damagePlayer(idol.damage, `${enemyDeathLabel(idol.type)}の狙撃`, pcx, pcy);
      if (died) onPlayerDeath(pcx, pcy);
    }
    if (newGameTime >= (idol.bossStateUntil ?? 0)) toRecover('snipe');
  } else if (st === 'idol-punch-windup') {
    if (newGameTime >= (idol.bossStateUntil ?? 0)) {
      const aim = hateAim();
      patch.hateTarget = aim.side;
      const ang = Math.atan2(aim.y - icy, aim.x - icx);
      hitCapsule(icx, icy, icx + Math.cos(ang) * IDOL_PUNCH_RANGE, icy + Math.sin(ang) * IDOL_PUNCH_RANGE, IDOL_PUNCH_HALF_WIDTH);
      toRecover('punch');
    }
  } else if (st === 'idol-roll-windup') {
    if (newGameTime >= (idol.bossStateUntil ?? 0)) {
      patch.bossState = 'idol-roll';
      patch.bossStateUntil = newGameTime + IDOL_TIMING.roll.active;
    }
  } else if (st === 'idol-roll') {
    // §6.28-20「無敵は付けない」=詰めた側の報酬。i-frame等は一切付与しない。
    const fx = idol.aiFromX ?? icx, fy = idol.aiFromY ?? icy;
    const tx = idol.aiTargetX ?? icx, ty = idol.aiTargetY ?? icy;
    const t = Math.max(0, Math.min(1, 1 - ((idol.bossStateUntil ?? newGameTime) - newGameTime) / IDOL_TIMING.roll.active));
    patch.x = (fx + (tx - fx) * t) - idol.width / 2;
    patch.y = (fy + (ty - fy) * t) - idol.height / 2;
    if (newGameTime >= (idol.bossStateUntil ?? 0)) toRecover('roll');
  } else if (RECOVER_STATES.includes(st)) {
    // W6: 硬直中は完全静止+青白tint(描画側)+次技抽選なし。硬直明けに第二波/次段/休符を決める。
    if (newGameTime >= (idol.bossStateUntil ?? 0)) {
      const m = st.slice('idol-'.length, st.length - '-recover'.length) as IdolMove;
      afterMove(m);
    }
  } else {
    patch.bossState = 'chase';
    patch.bossNextActionAt = newGameTime;
  }

  if (Object.keys(patch).length) {
    useGameStore.setState(stt => ({ enemies: stt.enemies.map(e => (e.id === idol.id ? { ...e, ...patch } : e)) }));
  }
};

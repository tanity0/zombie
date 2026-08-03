// 監査レポート§2(バッチ3・v0.25.2613): idol(stage-2隠しボス)のコントローラ。
// useGameLoop.ts に直書きされていた状態機械を、実プレイとヘッドレス(計測プローブ)の両方から
// 呼べる純関数へ移設した(angelBossTick.ts と同じ流儀・実装精度の規律4)。
// - シミュレーション(移動・攻撃判定・弾/帯の生成・カウンター報酬)はここで store を直接叩く。
// - 音(playSfx)と死亡通知だけコールバックで注入(audioManagerはヘッドレスでimportしない縛り)。
//
// 状態文法(監査レポート§3-1): NEUTRAL(主戦帯を維持) → STRING(連段) → REST(休符) → NEUTRAL。
// 懲罰(PUNISH)は中立中いつでも割り込む。**休符は必ず入る**(プレイヤーのターンを消さない)。
import type { Enemy } from '../types/game';
import { GLOW_R_L } from './glowTiers';
import {
  useGameStore, counterReplyDamage, skillLevel, BOSS_CRIT_DAMAGE_MULT,
  COUNTER_HITSTOP_MS, COUNTER_SHAKE_MS, COUNTER_SHAKE_MAG, COUNTER_ZOOM_MAG,
  MELEE_FINISH_SLOW_MS, MELEE_FINISH_SLOW_HOLD_MS, bossCritCdMult, enemyDeathLabel,
  knockbackSpeedFor,
} from '../store/gameStore';
import { getActiveGun } from './weaponUtils';
import { createEnemyProjectile } from './enemyUtils';
import { rectsOverlap } from '../world/obstacles';
// v0.25.2617(社長報告「m2は移動できる範囲が限られてるのに、ボスだけその外に移動してる」):
// プレイヤーの移動クランプと**同じ純関数**を使う。`playableArea.ts` は「行ける帯」の唯一の出どころで、
// プレイヤー移動・湧き制限・帯の外の減光が全てここから導かれている。ボスだけがこれを通っていなかった。
import { clampRectToPlayableArea, type PlayableAreaCtx } from '../world/playableArea';
import { distToSegment } from './levelUpGate';
import { isCounterablePhase, phaseJustChanged } from './bossScript';
import { neutralVerb, pickStringScript, restMsFor, punishTrigger, type NeutralVerb } from './bossSkeleton';
import { resolveBossHateAim } from './bossHate';
import { notifyCounterHit, notifyMoveCounter } from './playerTraits';
import { refundCounterCooldown } from './counterMaster';
import { consumeGhostCounterClaim, applyGhostCounterEffect, type GhostCounterFire } from './ghostCounter';
import { npcSfxDistGain } from './npcSfx';
import {
  IDOL_TUNING, IDOL_STRING_LEN, IDOL_REST, IDOL_PUNISH, IDOL_NEUTRAL_BAND,
  IDOL_VERB_SPEED_MULT, IDOL_TIMING, IDOL_MOVES_ALL, IDOL_ORB_SPREAD_RAD,
  idolZone, idolPhaseForHealth, idolFanCount, idolOrbCount, idolWaveActive,
  idolStrings, idolShot, idolShotFireMs, idolMoveTiming, isIdolShot,
  type IdolMove, type IdolShotSlot, type IdolShotSpec,
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
  /**
   * 誘導弾(毎フレーム旋回させる対象)。**旋回速度は毎フレーム引き直す**ので、
   * ここには「どの技から出た弾か」だけを持つ(メーカーで旋回速度を変えると飛行中の弾にも効く)。
   */
  homing: { id: string; move: IdolMove }[];
  // ---- 射撃部品の連射(v0.25.2638) ----
  shotSlot: IdolShotSlot | null;  // いま撃っている枠
  shotWavesLeft: number;          // 残りの斉射数
  shotNextAt: number;             // 次の斉射の時刻(gameTime)
  shotAngle: number;              // aimMode=1(予告開始で固定)のロック角
  shotWaveIdx: number;            // 何斉射目か(waveTurnDeg の回転に使う)
  // ---- 偏差撃ち(aimMode=2)のためのプレイヤー速度 ----
  lastPx: number; lastPy: number; playerVx: number; playerVy: number;
}
/**
 * ★**副作用を持たせてはいけない**(v0.25.2625の実バグ)。
 * 呼び出し側は `useRef(createIdolTickState())` の形で使うが、**`useRef` の引数は毎レンダー評価される**
 * (refが初回の値を保持するだけで、式そのものは毎回走る)。ここに `clearIdolPlayback()` を仕込んだところ、
 * パネルが再描画するたびに再生要求が消え、**▶を押しても技が1フレームで止まる**症状になった。
 * 「新ランで再生状態も消す」のは**リセット地点(useGameLoop)で明示的に呼ぶ**こと。
 */
export const createIdolTickState = (): IdolTickState => ({
  seq: [], step: 0, strafeDir: 1, wavePending: false,
  farSince: 0, meleeSince: 0, angleSince: 0, lastAngle: 0, homing: [],
  shotSlot: null, shotWavesLeft: 0, shotNextAt: 0, shotAngle: 0, shotWaveIdx: 0,
  lastPx: 0, lastPy: 0, playerVx: 0, playerVy: 0,
});

// ============================================================================================
// ボスメーカーの「個別再生」(BOSS_MAKER.md・社長要望v0.25.2625)
// > 停止中は技、動きごとに再生ボタンで個々に再生できる様にしたい
//
// 押した技を**即座に開始**する。CD・距離帯・ストリングの抽選は**全部バイパス**する
// (「いま見たい技を見る」ための道具なので、条件が揃うまで待たせない)。
//
// 置き場所: パネル(React)は `IdolTickState` の実体を持てない(useGameLoopのrefの中)ので、
// **モジュール変数の要求箱**を経由する。tickが毎フレーム先頭で1回だけ引き取る。
// 掟: 強制発動の前に**進行中のストリング・第二波の予約・懲罰シグナルを必ずリセット**する
// (中途半端な状態が残ると以後の挙動が「たまに変」になり、原因究明が地獄になる)。
// ============================================================================================
interface IdolPlayRequest { move?: IdolMove; verb?: NeutralVerb | null; solo: boolean; loop: boolean }
let pendingPlay: IdolPlayRequest | null = null;
/** 単独再生の実行中(=停止中でも tick を進めてよい)。硬直明けに false へ戻る。 */
let soloActive = false;
/** 維持中の移動語彙(null=通常の中立判断)。技の抽選は止める=その動きだけを見るため。 */
let verbHold: NeutralVerb | null = null;
/** ループ再生中の技(null=1回で止まる)。 */
let loopMove: IdolMove | null = null;

/** 技を1つだけ再生する。solo=停止中でもこの技が終わるまで進めて、終わったらまた止まる。 */
export const requestIdolMovePlay = (move: IdolMove, opts?: { solo?: boolean; loop?: boolean }): void => {
  // ループ中の技をもう一度押したら**停止**(移動語彙の▶と同じトグルの作法)。
  // ループのON/OFFトグルは「次に押す再生」に効くだけなので、走っているループを止める手段がここに要る。
  if (loopMove === move) { pendingPlay = { verb: null, solo: false, loop: false }; return; }
  pendingPlay = { move, solo: opts?.solo ?? false, loop: opts?.loop ?? false };
};
/** 移動語彙を維持する(同じものを再度指定 or null で解除)。終わりが無いので押し続ける形。 */
export const requestIdolVerbPlay = (verb: NeutralVerb | null): void => {
  pendingPlay = { verb: verbHold === verb ? null : verb, solo: false, loop: false };
};
/** 停止中でも tick を回す必要があるか(useGameLoop のポーズ判定が読む)。 */
export const idolPlaybackActive = (): boolean => soloActive || verbHold !== null || pendingPlay !== null;
/** 画面表示用(どの語彙を維持中か・どの技をループ中か)。 */
export const getIdolPlayback = (): { verb: NeutralVerb | null; loop: IdolMove | null } => ({ verb: verbHold, loop: loopMove });
export const clearIdolPlayback = (): void => { pendingPlay = null; soloActive = false; verbHold = null; loopMove = null; };

const ORB_ID_PREFIX = 'proj-idolorb-';
const SHOT_ID_PREFIX = 'proj-idolshot-';
/** aimMode=1(予告開始で固定)のロック線の長さ(px)。判定は弾が持つので**描画の都合だけ**の値。 */
const SHOT_LOCK_VIS_RANGE = 900;
// **技の一覧から機械的に組む**(v0.25.2638)。手書きの配列は射撃枠を足した時に必ず取りこぼす
// ——予告中にカウンターが通らない/硬直の青白tintが出ない、という形で静かに壊れる。
const WINDUP_STATES = IDOL_MOVES_ALL.map(m => `idol-${m}-windup`);
const RECOVER_STATES = IDOL_MOVES_ALL.map(m => `idol-${m}-recover`);
export const IDOL_WINDUP_STATES: readonly string[] = WINDUP_STATES;
export const IDOL_RECOVER_STATES: readonly string[] = RECOVER_STATES;
/** 休符(REST)の州。W6と同じ「完全静止+青白tint+次技抽選なし」だが、**カウンターは通る**。 */
export const IDOL_REST_STATE = 'idol-rest';
/** 連射中(斉射と斉射の間)。予告は終わっているので**カウンターは通らない**(snipeのactiveと同じ扱い)。 */
const FIRE_SUFFIX = '-fire';
/**
 * 射撃部品の連射州の一覧。**外へ公開する**——予告台帳(ghostTelegraph)の網羅テストは
 * ソースの文字列リテラルを走査するが、ここは関数で州名を組んでいるので走査では見えない。
 * 「実装が持っている州の正本」をエクスポートして、台帳側がそれと突き合わせる形にする。
 */
export const IDOL_FIRE_STATES: readonly string[] =
  IDOL_MOVES_ALL.filter(isIdolShot).map(m => `idol-${m}${FIRE_SUFFIX}`);

type BossStateName = NonNullable<Enemy['bossState']>;
const windupState = (m: IdolMove): BossStateName => `idol-${m}-windup` as BossStateName;
const recoverState = (m: IdolMove): BossStateName => `idol-${m}-recover` as BossStateName;
const fireState = (m: IdolShotSlot): BossStateName => `idol-${m}${FIRE_SUFFIX}` as BossStateName;
/** 状態名から技名を取り出す(`idol-s3-windup` → `s3`)。 */
const moveOfState = (st: string, suffix: string): IdolMove =>
  st.slice('idol-'.length, st.length - suffix.length) as IdolMove;

/**
 * 実際に制御すべきアイドル1体を選ぶ(純関数)。v0.25.2614・社長報告「ボスモードだからかな？アイドル動かない」。
 *
 * 事故: ラボ資料のステージでは `resetGame` が**固定・休眠のアイドル**を最奥に置く。そこへ `?idolnow=1`
 * が**2体目**をプレイヤーの近くへ強制召喚するので、盤面にアイドルが2体並ぶ。コントローラは
 * `enemies.find(e => e.type === 'idol')` で**配列の先頭1体しか見ていなかった**ため、先に置かれた
 * 遠くの休眠個体が拾われ、起床判定に落ちて `runIdolTick` が一度も呼ばれない
 * ⇒ **プレイヤーの隣にいる2体目が誰にも動かされず、完全に静止する。**
 *
 * 対策は2段構え(どちらか片方でも症状は消えるが、両方やって再発の芽を摘む):
 *  1. 強制召喚の側で**既存のアイドルを消してから**出す(=盤面のアイドルは常に1体・呼び出し側)。
 *  2. ここで**起きている個体を優先**して選ぶ(万一2体並んでも、動く方が確実に制御される)。
 */
export const pickActiveIdol = (enemies: readonly Enemy[]): Enemy | undefined => {
  let dormantOne: Enemy | undefined;
  for (const e of enemies) {
    if (e.type !== 'idol') continue;
    if (!e.dormant) return e;          // 起きている個体が最優先
    dormantOne ??= e;                   // 休眠しかいなければ先頭の1体(=従来どおり起床判定に回す)
  }
  return dormantOne;
};

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

  // v0.25.2624(社長報告「反撃してワープするとかならず消える」)の**保険**。
  // 本体の修正は useGameLoop 側(アイドルを汎用ボスのカウンターワープから除外)だが、
  // 汎用側が alpha を 0 にする経路は他にも増えうる。**専用コントローラで動く以上、
  // 自分の見た目を1へ戻す責務は自分にある**ので、消えたままにならないようここでも戻す。
  // (描画は container.alpha に使われる値。ゲーム判定には一切影響しない。)
  if ((idol.reaperWarpAlpha ?? 1) < 1) patch.reaperWarpAlpha = 1;

  const hpFrac = idol.maxHealth > 0 ? idol.health / idol.maxHealth : 1;
  const phase = idolPhaseForHealth(hpFrac);
  if (phaseJustChanged(idol.bossPhase, phase)) patch.bossPhaseFlashUntil = newGameTime + 1200;
  patch.bossPhase = phase;
  const st = idol.bossState ?? 'chase';
  const fresh = (): Enemy => useGameStore.getState().enemies.find(e => e.id === idol.id) ?? idol;
  const hateAim = () => resolveBossHateAim(idol, { x: pcx, y: pcy }, useGameStore.getState().summons, newGameTime);

  // ---- プレイヤーの速度(偏差撃ち aimMode=2 のため・v0.25.2638) --------------------------------
  // store はプレイヤー速度を持たないので、**前フレームとの差**から出す。dt=0のフレームでは更新しない
  // (0除算で速度が爆発し、偏差が画面外を狙う)。
  if (deltaTime > 0.0001) {
    s.playerVx = (pcx - s.lastPx) / deltaTime;
    s.playerVy = (pcy - s.lastPy) / deltaTime;
  }
  s.lastPx = pcx; s.lastPy = pcy;

  // ---- 誘導弾の旋回(毎フレーム・上限3発=負荷1/10) ---------------------------------------------
  // 速度155 > プレイヤー104.4 なので走っても振り切れない。**旋回速度1.5rad/sは有限**なので、
  // 密着して小さく回れば内側に入って外せる=「近づくほど安全」の主題そのもの(詰めた側の報酬)。
  // v0.25.2638: 射撃部品の誘導弾も同じ経路へ乗せる。旋回速度は**技ごと**に引く。
  if (s.homing.length > 0) {
    const live = new Set(useGameStore.getState().projectiles.map(p => p.id));
    s.homing = s.homing.filter(h => live.has(h.id));
    if (s.homing.length > 0) {
      const rate = new Map<string, number>();
      for (const h of s.homing) {
        rate.set(h.id, isIdolShot(h.move)
          ? (idolShot(h.move).homingDeg * Math.PI) / 180
          : IDOL_TUNING.shape.orbTurnRate);
      }
      useGameStore.setState(state => ({
        projectiles: state.projectiles.map(p => {
          const turn = rate.get(p.id);
          if (turn === undefined) return p;
          const cur = Math.atan2(p.direction.y, p.direction.x);
          const want = Math.atan2(pcy - (p.y + p.height / 2), pcx - (p.x + p.width / 2));
          let d = want - cur;
          while (d > Math.PI) d -= Math.PI * 2;
          while (d < -Math.PI) d += Math.PI * 2;
          const step = Math.max(-turn * dt, Math.min(turn * dt, d));
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
      g.spawnGlow(hx, hy, GLOW_R_L, 'rgba(56,189,248,', 360);
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
    patch.bossStateUntil = newGameTime + idolMoveTiming(m).windup;
    if (isIdolShot(m)) {
      // 射撃部品(v0.25.2638)。狙いの決め方が「予告開始で固定」なら**ここで線をロック**する
      // =掟W4(テルを出したら必ずその向きへ撃つ)。描画側は同じ2点を読むので赤い線と一致する。
      const sp = idolShot(m);
      s.shotSlot = m;
      s.shotWaveIdx = 0;
      if (Math.round(sp.aimMode) === 1) {
        const aim = hateAim();
        s.shotAngle = Math.atan2(aim.y - icy, aim.x - icx);
        patch.aiFromX = icx; patch.aiFromY = icy;
        patch.aiTargetX = icx + Math.cos(s.shotAngle) * SHOT_LOCK_VIS_RANGE;
        patch.aiTargetY = icy + Math.sin(s.shotAngle) * SHOT_LOCK_VIS_RANGE;
        patch.hateTarget = aim.side;
      }
    } else if (m === 'snipe') {
      // 掟W4: 溜め開始で線をロック(テルを出したら必ず撃つ)。図形=判定=描画が同じ2点を読む。
      const aim = hateAim();
      const dl = Math.hypot(aim.x - icx, aim.y - icy) || 1;
      patch.aiFromX = icx; patch.aiFromY = icy;
      patch.aiTargetX = icx + ((aim.x - icx) / dl) * IDOL_TUNING.shape.snipeRange;
      patch.aiTargetY = icy + ((aim.y - icy) / dl) * IDOL_TUNING.shape.snipeRange;
      patch.hateTarget = aim.side;
    } else if (m === 'roll') {
      const aim = hateAim();
      const dl = Math.hypot(icx - aim.x, icy - aim.y) || 1;
      patch.aiFromX = icx; patch.aiFromY = icy;
      patch.aiTargetX = icx + ((icx - aim.x) / dl) * IDOL_TUNING.shape.rollDist;
      patch.aiTargetY = icy + ((icy - aim.y) / dl) * IDOL_TUNING.shape.rollDist;
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
      patch.bossStateUntil = newGameTime + IDOL_TUNING.waveDelayMs;
      return;
    }
    // ボスメーカーの単独再生: この技だけを見せる約束なので、ストリングへは続けない。
    if (soloActive) {
      if (loopMove !== null) { beginMove(loopMove); return; } // ループ再生(同じ技を繰り返す)
      soloActive = false;
      s.seq = []; s.step = 0;
      patch.bossState = 'chase';
      patch.bossNextActionAt = newGameTime + IDOL_TUNING.neutral.minMs;
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
    patch.bossStateUntil = newGameTime + idolMoveTiming(m).recover;
  };

  /**
   * 弾を1発撃つ。**弾の性能は技ごと**(社長指示v0.25.2628「弾速度とか個別にしないと」)。
   * `createEnemyProjectile` は size から x/y を逆算する(中心合わせ)ので、**生成時に渡す**
   * ——生成後に上書きすると位置がズレる。
   */
  const fire = (move: 'aim' | 'fan', tx: number, ty: number): void =>
    useGameStore.getState().addProjectile(
      createEnemyProjectile(idol, player, tx, ty, undefined, undefined, IDOL_TUNING.bullet[move]),
    );

  /**
   * 射撃部品の狙う向き(rad)。**3つの決め方**(`aimMode`):
   *  - 0 追従: 撃つ瞬間のプレイヤーへ(既存の aim/fan と同じ)
   *  - 1 固定: 予告の開始でロック済み(`s.shotAngle`)=**歩いて避けられる**
   *  - 2 偏差: プレイヤーの移動先を読む。弾の到達時間ぶんだけ先へ置く=**まっすぐ走り続けると当たる**
   *
   * ★2は「読めなさ」ではなく「読み合い」を作るための物(社長方針: MAXは密度で作る)。
   * 止まる/曲がるで外れる=プレイヤー側に必ず答えがある。
   */
  const shotAimAngle = (sp: IdolShotSpec): number => {
    const mode = Math.round(sp.aimMode);
    if (mode === 1) return s.shotAngle;
    const aim = hateAim();
    if (mode !== 2) return Math.atan2(aim.y - icy, aim.x - icx);
    const spd = Math.max(1, sp.speed);
    let tx = aim.x, ty = aim.y;
    // 到達時間→予測位置→到達時間、の2回で十分収束する(弾速がプレイヤー速度より十分速いため)。
    for (let i = 0; i < 2; i++) {
      const t = Math.hypot(tx - icx, ty - icy) / spd;
      tx = aim.x + s.playerVx * t;
      ty = aim.y + s.playerVy * t;
    }
    return Math.atan2(ty - icy, tx - icx);
  };

  /**
   * 射撃部品の1斉射。`count` 本を `spreadDeg` ずつ開いて撃つ。誘導があれば旋回リストへ登録する。
   * `createEnemyProjectile` は size から x/y を逆算するので**生成時にプロファイルを渡す**
   * (生成後に上書きすると弾の位置がズレる=BOSS_MAKER.md §2-4)。
   */
  const fireShotVolley = (slot: IdolShotSlot, waveIdx: number): void => {
    const sp = idolShot(slot);
    const n = Math.max(1, Math.round(sp.count));
    const base = shotAimAngle(sp) + (waveIdx * sp.waveTurnDeg * Math.PI) / 180;
    const spread = (sp.spreadDeg * Math.PI) / 180;
    const half = (n - 1) / 2;
    const profile = { speed: sp.speed, damage: sp.damage, size: sp.size };
    const homing = sp.homingDeg > 0;
    for (let k = 0; k < n; k++) {
      const a = base + (k - half) * spread;
      const p = createEnemyProjectile(
        idol, player, icx + Math.cos(a) * 100, icy + Math.sin(a) * 100, undefined, undefined, profile,
      );
      if (homing) {
        p.id = `${SHOT_ID_PREFIX}${idol.id}-${slot}-${newGameTime}-${waveIdx}-${k}`;
        s.homing.push({ id: p.id, move: slot });
      }
      useGameStore.getState().addProjectile(p);
    }
  };

  /** 射撃の予告が終わった: 1斉射目を撃ち、連射があれば連射州へ、無ければ硬直へ。 */
  const startShotFire = (slot: IdolShotSlot): void => {
    const sp = idolShot(slot);
    s.shotSlot = slot;
    s.shotWaveIdx = 0;
    fireShotVolley(slot, 0);
    const waves = Math.max(1, Math.round(sp.waves));
    if (waves <= 1) { toRecover(slot); return; }
    s.shotWavesLeft = waves - 1;
    s.shotNextAt = newGameTime + Math.max(0, sp.intervalMs);
    patch.bossState = fireState(slot);
    patch.bossStateUntil = newGameTime + idolShotFireMs(sp);
  };

  /**
   * 帯(カプセル)の当たり判定を1件積む。**ダメージは技ごと**(社長報告v0.25.2629)。
   * 旧は `idol.damage`(=接触ダメージの流用)で、技ごとに変えられなかった。
   */
  const hitCapsule = (
    fx: number, fy: number, tx: number, ty: number, halfW: number, damage: number,
    // v0.25.2653: **押し出しも技ごと**(社長要望「押しやる殴り」)。距離(px)で受けて初速へ直す。
    knockback?: { distPx: number; ms: number },
  ): void => {
    useGameStore.setState(state => ({
      pumpkinBlasts: [...state.pumpkinBlasts, {
        x: (fx + tx) / 2, y: (fy + ty) / 2, radius: halfW, damage, enemyId: idol.id,
        capsule: { fx, fy, tx, ty, halfWidth: halfW },
        ...(knockback ? { kbSpeed: knockbackSpeedFor(knockback.distPx, knockback.ms), kbMs: knockback.ms } : {}),
      }],
    }));
  };

  // ---- 状態機械 -------------------------------------------------------------------------------
  // ---- ボスメーカー: 要求箱の引き取り(毎フレーム先頭で1回) --------------------------------------
  let forcedThisFrame = false;
  if (pendingPlay !== null) {
    const req = pendingPlay;
    pendingPlay = null;
    if (req.verb !== undefined) {
      // 移動語彙の維持/解除。技は出さない=その動きだけを見る。
      verbHold = req.verb;
      soloActive = false; loopMove = null;
      s.seq = []; s.step = 0; s.wavePending = false;
      s.farSince = 0; s.meleeSince = 0; s.angleSince = 0;
      patch.bossState = 'chase';
      // 維持中は抽選しない。**解除した時は通常の中立へ必ず戻す**——ここを MAX のままにすると
      // 「再生をやめたのにボスが二度と技を出さない」状態で置き去りになる(実機で踏んだ)。
      patch.bossNextActionAt = verbHold !== null
        ? Number.MAX_SAFE_INTEGER
        : newGameTime + IDOL_TUNING.neutral.minMs;
      forcedThisFrame = true;
    } else if (req.move) {
      // 掟: 中途半端な状態を持ち越さない(ストリング/第二波/懲罰シグナルを全部リセットしてから始める)。
      s.seq = []; s.step = 0; s.wavePending = false;
      s.farSince = 0; s.meleeSince = 0; s.angleSince = 0;
      s.homing = []; s.shotWavesLeft = 0; s.shotSlot = null;
      verbHold = null;
      soloActive = req.solo;
      loopMove = req.loop ? req.move : null;
      beginMove(req.move); // CD・距離帯・抽選を全部バイパスして即開始
      forcedThisFrame = true;
    }
  }

  if (forcedThisFrame) {
    // ボスメーカーの強制発動フレーム: 上で patch を組み終えているので通常遷移はスキップ。
  } else if (countered) {
    // カウンター成立フレームは遷移をスキップ(counterHitが休符まで設定済み)。
  } else if (st === 'chase') {
    // === NEUTRAL: 主戦帯を維持する(監査レポート§2-5の移動語彙4つ) ===
    // ボスメーカーで語彙を維持中はそれを使う(通常は距離から判断)。
    const verb: NeutralVerb = verbHold ?? neutralVerb(dist, IDOL_NEUTRAL_BAND, false);
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
    s.angleSince = dAng <= (IDOL_TUNING.sameAngleDeg * Math.PI) / 180 ? s.angleSince + stepMs : 0;
    s.lastAngle = ang;

    if (verbHold === null && newGameTime >= (idol.bossNextActionAt ?? 0)) {
      const pun = punishTrigger({ farMs: s.farSince, meleeMs: s.meleeSince, sameAngleMs: s.angleSince }, IDOL_PUNISH);
      if (pun.flipStrafe) { s.strafeDir = (s.strafeDir === 1 ? -1 : 1); s.angleSince = 0; }
      if (pun.move) {
        s.farSince = 0; s.meleeSince = 0;
        s.seq = []; s.step = 0;
        beginMove(pun.move);
      } else {
        // CDの概念はまだ無い(全技いつでも使える)。**技の一覧から機械的に組む**ので
        // 射撃枠を足しても取りこぼさない。
        const ready = Object.fromEntries(IDOL_MOVES_ALL.map(m => [m, true])) as Record<IdolMove, boolean>;
        const seq = pickStringScript(idolStrings(), zone, phase, IDOL_STRING_LEN, ready);
        if (seq) { s.seq = seq; s.step = 0; beginMove(s.seq[s.step++]); }
      }
    }
  } else if (st === IDOL_REST_STATE) {
    // === REST: 完全静止。ここだけがプレイヤーのターン(0にはしない) ===
    if (newGameTime >= (idol.bossStateUntil ?? 0)) {
      // 休符明けは**中立へ戻る**。ここで主戦帯まで歩き直す時間を必ず取る(ER原則③)。
      patch.bossState = 'chase';
      patch.bossNextActionAt = newGameTime + IDOL_TUNING.neutral.minMs + Math.random() * (IDOL_TUNING.neutral.maxMs - IDOL_TUNING.neutral.minMs);
    }
  } else if (st === 'idol-aim-windup') {
    if (newGameTime >= (idol.bossStateUntil ?? 0)) {
      const aim = hateAim();
      fire('aim', aim.x, aim.y);
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
        const a = ang + (k - half) * IDOL_TUNING.shape.fanSpreadStep;
        fire('fan', icx + Math.cos(a) * 100, icy + Math.sin(a) * 100);
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
        const a = base + (k - (n - 1) / 2) * IDOL_ORB_SPREAD_RAD; // 少し散らして出す(全弾が同じ線に乗らない)
        // 追尾弾も**技ごとの弾**として生成時に渡す(size は x/y の逆算に使うので後から書けない)。
        // 速度は既存パス `shape.orbSpeed` が正(値を二重に持たない・社長指示v0.25.2628)。
        const p = createEnemyProjectile(
          idol, player, icx + Math.cos(a) * 100, icy + Math.sin(a) * 100, undefined, undefined,
          { speed: IDOL_TUNING.shape.orbSpeed, damage: IDOL_TUNING.bullet.orb.damage, size: IDOL_TUNING.bullet.orb.size },
        );
        p.id = `${ORB_ID_PREFIX}${idol.id}-${newGameTime}-${k}`;
        useGameStore.getState().addProjectile(p);
        ids.push(p.id);
      }
      for (const id of ids) s.homing.push({ id, move: 'orb' });
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
    if (distToSegment({ x: pcx, y: pcy }, { x: fx, y: fy }, { x: tx, y: ty }) <= IDOL_TUNING.shape.snipeHalfWidth + pr) {
      const died = useGameStore.getState().damagePlayer(IDOL_TUNING.moveDamage.snipe, `${enemyDeathLabel(idol.type)}の狙撃`, pcx, pcy);
      if (died) onPlayerDeath(pcx, pcy);
    }
    if (newGameTime >= (idol.bossStateUntil ?? 0)) toRecover('snipe');
  } else if (st === 'idol-punch-windup') {
    if (newGameTime >= (idol.bossStateUntil ?? 0)) {
      const aim = hateAim();
      patch.hateTarget = aim.side;
      const ang = Math.atan2(aim.y - icy, aim.x - icx);
      hitCapsule(
        icx, icy,
        icx + Math.cos(ang) * IDOL_TUNING.shape.punchRange, icy + Math.sin(ang) * IDOL_TUNING.shape.punchRange,
        IDOL_TUNING.shape.punchHalfWidth, IDOL_TUNING.moveDamage.punch,
        IDOL_TUNING.moveKnockback.punch,
      );
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
  } else if (st.endsWith('-windup') && isIdolShot(moveOfState(st, '-windup'))) {
    // === 射撃部品の予告明け(v0.25.2638) ===
    if (newGameTime >= (idol.bossStateUntil ?? 0)) {
      const slot = moveOfState(st, '-windup') as IdolShotSlot;
      patch.hateTarget = hateAim().side;
      startShotFire(slot);
    }
  } else if (st.endsWith(FIRE_SUFFIX)) {
    // === 射撃部品の連射中: 間隔ごとに次の斉射を出す ===
    // **1フレームに複数斉射が溜まっても撃ち切る**(低フレームレートで弾数が減らない=数字どおり出る)。
    const slot = moveOfState(st, FIRE_SUFFIX) as IdolShotSlot;
    const sp = idolShot(slot);
    const interval = Math.max(1, sp.intervalMs);
    while (s.shotWavesLeft > 0 && newGameTime >= s.shotNextAt) {
      s.shotWaveIdx += 1;
      fireShotVolley(slot, s.shotWaveIdx);
      s.shotWavesLeft -= 1;
      s.shotNextAt += interval;
    }
    if (s.shotWavesLeft <= 0 || newGameTime >= (idol.bossStateUntil ?? 0)) toRecover(slot);
  } else if (RECOVER_STATES.includes(st)) {
    // W6: 硬直中は完全静止+青白tint(描画側)+次技抽選なし。硬直明けに第二波/次段/休符を決める。
    if (newGameTime >= (idol.bossStateUntil ?? 0)) {
      afterMove(moveOfState(st, '-recover'));
    }
  } else {
    patch.bossState = 'chase';
    patch.bossNextActionAt = newGameTime;
  }

  // v0.25.2617: **プレイヤーが行けない場所へボスを出さない**(社長報告「m2は移動できる範囲が
  // 限られてるのに、ボスだけその外に移動してる」)。中立の移動語彙(close/retreat/strafe)も
  // 離脱ローリングも生の座標を書いていたため、ステージ2の廊下帯(|中心Y| ≤ 200)を平気で越えていた。
  // プレイヤーは `clampRectToPlayableArea` を通っているので、**同じ純関数を同じように通す**
  // =「行ける帯」の定義が1本のまま(片方だけ直すとズレる、と playableArea.ts に明記されている)。
  // 追いかけられない相手は戦えない=理不尽なので、帯の外へは出さない。
  if (patch.x !== undefined || patch.y !== undefined) {
    const st0 = useGameStore.getState();
    const ctx: PlayableAreaCtx = {
      farBackdrop: st0.farBackdrop,
      labTheme: st0.stageTheme === 'lab' && !st0.indoorMode,
      corridorMode: st0.corridorMode,
      m0AdvanceLimitX: st0.m0AdvanceLimitX,
      corridorRunInActive: st0.corridorRunInActive,
    };
    const c = clampRectToPlayableArea(
      patch.x ?? idol.x, patch.y ?? idol.y, idol.width, idol.height, ctx,
    );
    patch.x = c.x; patch.y = c.y;
  }

  if (Object.keys(patch).length) {
    useGameStore.setState(stt => ({ enemies: stt.enemies.map(e => (e.id === idol.id ? { ...e, ...patch } : e)) }));
  }
};

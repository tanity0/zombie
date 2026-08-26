// 監査レポート§2(バッチ3・v0.25.2613): idol(stage-2隠しボス)のコントローラ。
// useGameLoop.ts に直書きされていた状態機械を、実プレイとヘッドレス(計測プローブ)の両方から
// 呼べる純関数へ移設した(angelBossTick.ts と同じ流儀・実装精度の規律4)。
// - シミュレーション(移動・攻撃判定・弾/帯の生成・カウンター報酬)はここで store を直接叩く。
// - 音(playSfx)と死亡通知だけコールバックで注入(audioManagerはヘッドレスでimportしない縛り)。
//
// 状態文法(監査レポート§3-1): NEUTRAL(主戦帯を維持) → STRING(連段) → REST(休符) → NEUTRAL。
// 懲罰(PUNISH)は中立中いつでも割り込む。**休符は必ず入る**(プレイヤーのターンを消さない)。
import type { Enemy } from '../types/game';
// ★カウンター憲法(v0.25.3947): 面成立の専用関数 counterHit の削除に伴い、それ専用だった import
// (GLOW_R_L / counterReplyDamage / クリ・演出定数 / getActiveGun / recordCritHit / refundCounterCooldown)を整理。
import {
  useGameStore, bossCritCdMult, bossSlowMult, enemyDeathLabel,
  knockbackSpeedFor } from '../store/gameStore';
import { createEnemyProjectile } from './enemyUtils';
// v0.25.2617(社長報告「m2は移動できる範囲が限られてるのに、ボスだけその外に移動してる」):
// プレイヤーの移動クランプと**同じ純関数**を使う。`playableArea.ts` は「行ける帯」の唯一の出どころで、
// プレイヤー移動・湧き制限・帯の外の減光が全てここから導かれている。ボスだけがこれを通っていなかった。
import { clampRectToPlayableArea, type PlayableAreaCtx } from '../world/playableArea';
import { distToBandRect } from './geometry'; // v0.25.3496: 帯の判定=描いてある四角
import { phaseJustChanged } from './bossScript';
import { neutralVerb, pickStringScript, restMsFor, punishTrigger, advanceLingerMs, type NeutralVerb } from './bossSkeleton';
import { resolveBossHateAim, resolveBossLockedHateAim, type HateSide } from './bossHate';
import {
  IDOL_TUNING, IDOL_STRING_LEN, IDOL_REST, IDOL_PUNISH, IDOL_NEUTRAL_BAND,
  IDOL_VERB_SPEED_MULT, IDOL_TIMING, IDOL_MOVES_ALL, IDOL_ORB_SPREAD_RAD,
  idolZone, idolPhaseForHealth, idolFanCount, idolOrbCount, idolWaveActive,
  idolStrings, idolShot, idolShotFireMs, idolMoveTiming, isIdolShot, idolGunMuzzle,
  type IdolMove, type IdolShotSlot, type IdolShotSpec,
} from './idolScript';
import { HEAVY_GRENADE_FUSE_MS, HEAVY_GRENADE_DAMAGE, HEAVY_GRENADE_SPEED } from './grenadeSpec';

export interface IdolSfx {
  alert: () => void;
  counter: (gain?: number) => void;
  reward: (gain?: number) => void;
  // v0.25.3700(社長指示・プレイヤー近似流用): 技SEの追加分。全て () => void。
  shot: () => void;
  snipe: () => void;
  throwNade: () => void;
}
export const NOOP_IDOL_SFX: IdolSfx = {
  alert: () => {}, counter: () => {}, reward: () => {},
  shot: () => {}, snipe: () => {}, throwNade: () => {},
};

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
  homing: { id: string; move: IdolMove; side: HateSide }[];
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
  _counterEnabled: boolean, // ★カウンター憲法(v0.25.3947)で面成立が消えたため未使用(呼び出し側の形は変えない)
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
  /**
   * ★紫の完全気絶(ポスチャーブレイク)中か。**攻撃も移動も完全停止**する(社長指示v0.25.2892)。
   *
   * 他のボスは全員これを見ているのに、アイドルだけ抜けていた(v0.25.2613で状態機械を
   * useGameLoop からこのファイルへ移設した時に落ちた)。結果、**リティクルは紫になるのに
   * 弾を撃ち続ける**状態だった。出どころを揃える:
   *   ・裏ボス4体 = useGameLoop の `frozen`(bossFullStun 込み)で状態機械ごとスキップ
   *   ・天使6体   = angelBossTick の各tick先頭で `chase` へ戻す
   *   ・アイドル  = ここ(同じ形)
   * `bossFullStunUntil` は gameStore の紫発火が `stunUntil` と同時に打つ単一の出どころ。
   */
  const fullStun = idol.bossFullStunUntil !== undefined && newGameTime < idol.bossFullStunUntil;
  /**
   * トラップ拘束(rootUntil)中か。angelBossTick.ts(社長裁定v0.25.1690「トラップ中は他のボスと
   * 揃えて停止」・v0.25.1688の移動半減から改訂)と同じ掟: **攻撃の実行中(chase以外)は完走させ、
   * chase(移動/次攻撃の起点)だけを凍結する**——tickを丸ごと止めると時計だけ先へ進み、
   * root明けにツイーンが瞬間完了=テレポートに見えるため。他のボスは全員これを見ているのに、
   * アイドルだけ抜けていた(fullStunと同じ経緯・v0.25.2895)。
   */
  const rooted = idol.rootUntil !== undefined && newGameTime < idol.rootUntil;
  const fresh = (): Enemy => useGameStore.getState().enemies.find(e => e.id === idol.id) ?? idol;
  const hateAim = () => resolveBossHateAim(idol, { x: pcx, y: pcy }, useGameStore.getState().summons, newGameTime);
  const lockedHateAim = (side: HateSide = patch.hateTarget ?? idol.hateTarget ?? 'player') =>
    resolveBossLockedHateAim({ ...idol, hateTarget: side }, { x: pcx, y: pcy }, useGameStore.getState().summons);

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
      const rate = new Map<string, { turn: number; side: HateSide }>();
      for (const h of s.homing) {
        rate.set(h.id, {
          turn: isIdolShot(h.move)
            ? (idolShot(h.move).homingDeg * Math.PI) / 180
            : IDOL_TUNING.shape.orbTurnRate,
          side: h.side,
        });
      }
      useGameStore.setState(state => ({
        projectiles: state.projectiles.map(p => {
          const homing = rate.get(p.id);
          if (homing === undefined) return p;
          const target = lockedHateAim(homing.side);
          const cur = Math.atan2(p.direction.y, p.direction.x);
          const want = Math.atan2(target.y - (p.y + p.height / 2), target.x - (p.x + p.width / 2));
          let d = want - cur;
          while (d > Math.PI) d -= Math.PI * 2;
          while (d < -Math.PI) d += Math.PI * 2;
          const step = Math.max(-homing.turn * dt, Math.min(homing.turn * dt, d));
          const a = cur + step;
          return { ...p, direction: { x: Math.cos(a), y: Math.sin(a) } };
        }),
      }));
    }
  }

  // ★カウンター憲法(社長裁定2026-08-26「攻撃判定と窓が重なった時だけがカウンター成立」・v0.25.3947):
  // 偶像の面成立(全windup/全recover/**待機idol-rest**)を丸ごと除去した——どれも攻撃判定ゼロの成立
  // だった(W7の横展開は本憲法が上書き)。偶像への対処=拳のストリングは hitCapsule 爆風パリィ
  // (判定の瞬間)・弾は反射・全技回避可、が従来どおり残る。守護霊のカウンター請求も同基準で消える。
  const countered = false;

  // 社長指示v0.25.3439: 銃技(aim/fan/snipe/orb/射撃部品)の起点=立ち絵で銃がある高さの、狙う側の
  // 絵の端(idolGunMuzzle・idolScript)。発射・ロック2点・予告線・武器絵が全て同じ純関数を読む。
  const gunMuzzleFor = (aimX: number): { x: number; y: number } =>
    idolGunMuzzle(icx, idol.y + idol.height, aimX - icx);

  // ---- 技の開始(ストリングの1段を出す) --------------------------------------------------------
  const beginMove = (m: IdolMove): void => {
    sfx.alert();
    s.wavePending = idolWaveActive(m, phase);
    patch.bossState = windupState(m);
    patch.bossStateUntil = newGameTime + idolMoveTiming(m).windup;
    if (isIdolShot(m)) {
      const aim = hateAim();
      patch.hateTarget = aim.side;
      // 射撃部品(v0.25.2638)。狙いの決め方が「予告開始で固定」なら**ここで線をロック**する
      // =掟W4(テルを出したら必ずその向きへ撃つ)。描画側は同じ2点を読むので赤い線と一致する。
      const sp = idolShot(m);
      s.shotSlot = m;
      s.shotWaveIdx = 0;
      if (Math.round(sp.aimMode) === 1) {
        // 社長指示v0.25.3439: 起点=銃口(立ち絵の銃の高さ×狙う側の端)。ロックの2点ごと銃口基準にする。
        const mz = gunMuzzleFor(aim.x);
        s.shotAngle = Math.atan2(aim.y - mz.y, aim.x - mz.x);
        patch.aiFromX = mz.x; patch.aiFromY = mz.y;
        patch.aiTargetX = mz.x + Math.cos(s.shotAngle) * SHOT_LOCK_VIS_RANGE;
        patch.aiTargetY = mz.y + Math.sin(s.shotAngle) * SHOT_LOCK_VIS_RANGE;
      }
    } else if (m === 'snipe') {
      // 掟W4: 溜め開始で線をロック(テルを出したら必ず撃つ)。図形=判定=描画が同じ2点を読む。
      // 社長指示v0.25.3439: 起点=銃口。
      const aim = hateAim();
      const mz = gunMuzzleFor(aim.x);
      const dl = Math.hypot(aim.x - mz.x, aim.y - mz.y) || 1;
      patch.aiFromX = mz.x; patch.aiFromY = mz.y;
      patch.aiTargetX = mz.x + ((aim.x - mz.x) / dl) * IDOL_TUNING.shape.snipeRange;
      patch.aiTargetY = mz.y + ((aim.y - mz.y) / dl) * IDOL_TUNING.shape.snipeRange;
      patch.hateTarget = aim.side;
    } else if (m === 'roll' || m === 'nade') {
      // nade(v0.25.3444・社長指示「バックロールしながら手榴弾を投げる」)もrollと同じ後方ロックを取る
      // (距離=shape.rollDist・同じ動作は同じ数字)。投擲は溜め明け(idol-nade開始の瞬間)に行う。
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
  const fire = (move: 'aim' | 'fan', tx: number, ty: number, ox?: number, oy?: number): void =>
    useGameStore.getState().addProjectile(
      // ox/oy=銃口(社長指示v0.25.3439)。スリィエルの環と同じoriginオーバーライドを使う。
      createEnemyProjectile(idol, player, tx, ty, ox, oy, IDOL_TUNING.bullet[move]),
    );

  /**
   * 射撃部品の狙う向き(rad)。**3つの決め方**(`aimMode`):
   *  - 0 追従: 撃つ瞬間の固定ヘイト対象へ(技の途中で対象側は切り替えない)
   *  - 1 固定: 予告の開始でロック済み(`s.shotAngle`)=**歩いて避けられる**
   *  - 2 偏差: 固定ヘイト対象の移動先を読む。弾の到達時間ぶんだけ先へ置く=**まっすぐ走り続けると当たる**
   *
   * ★2は「読めなさ」ではなく「読み合い」を作るための物(社長方針: MAXは密度で作る)。
   * 止まる/曲がるで外れる=プレイヤー側に必ず答えがある。
   */
  const shotAimAngle = (sp: IdolShotSpec, mzx: number, mzy: number): number => {
    const mode = Math.round(sp.aimMode);
    if (mode === 1) return s.shotAngle;
    const aim = lockedHateAim();
    if (mode !== 2) return Math.atan2(aim.y - mzy, aim.x - mzx);
    const spd = Math.max(1, sp.speed);
    let tx = aim.x, ty = aim.y;
    const ghost = aim.side === 'ghost'
      ? useGameStore.getState().summons.find(su => su.kind === 'ghost-ally' && su.ghostBossId === idol.id)
      : undefined;
    const targetVx = aim.side === 'ghost' ? (ghost?.vx ?? 0) : s.playerVx;
    const targetVy = aim.side === 'ghost' ? (ghost?.vy ?? 0) : s.playerVy;
    // 到達時間→予測位置→到達時間、の2回で十分収束する(弾速がプレイヤー速度より十分速いため)。
    // 距離・角度とも銃口(mzx/mzy)基準(社長指示v0.25.3439)。
    for (let i = 0; i < 2; i++) {
      const t = Math.hypot(tx - mzx, ty - mzy) / spd;
      tx = aim.x + targetVx * t;
      ty = aim.y + targetVy * t;
    }
    return Math.atan2(ty - mzy, tx - mzx);
  };

  /**
   * 射撃部品の1斉射。`count` 本を `spreadDeg` ずつ開いて撃つ。誘導があれば旋回リストへ登録する。
   * `createEnemyProjectile` は size から x/y を逆算するので**生成時にプロファイルを渡す**
   * (生成後に上書きすると弾の位置がズレる=BOSS_MAKER.md §2-4)。
   */
  const fireShotVolley = (slot: IdolShotSlot, waveIdx: number): void => {
    const sp = idolShot(slot);
    const n = Math.max(1, Math.round(sp.count));
    // 起点=銃口(社長指示v0.25.3439)。固定(aimMode=1)は溜め開始でロックした2点の始点(=その時の銃口)を
    // そのまま使う=予告の赤い線と発射点が厳密一致。追従/偏差は今の狙い側の銃口を毎斉射取り直す。
    const mz = Math.round(sp.aimMode) === 1 && idol.aiFromX !== undefined && idol.aiFromY !== undefined
      ? { x: idol.aiFromX, y: idol.aiFromY }
      : gunMuzzleFor(lockedHateAim().x);
    const base = shotAimAngle(sp, mz.x, mz.y) + (waveIdx * sp.waveTurnDeg * Math.PI) / 180;
    const spread = (sp.spreadDeg * Math.PI) / 180;
    const half = (n - 1) / 2;
    const profile = { speed: sp.speed, damage: sp.damage, size: sp.size };
    const homing = sp.homingDeg > 0;
    for (let k = 0; k < n; k++) {
      const a = base + (k - half) * spread;
      const p = createEnemyProjectile(
        idol, player, mz.x + Math.cos(a) * 100, mz.y + Math.sin(a) * 100, mz.x, mz.y, profile,
      );
      if (homing) {
        p.id = `${SHOT_ID_PREFIX}${idol.id}-${slot}-${newGameTime}-${waveIdx}-${k}`;
        s.homing.push({ id: p.id, move: slot, side: patch.hateTarget ?? idol.hateTarget ?? 'player' });
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

  if (fullStun) {
    // ★紫の完全気絶: 状態機械を丸ごとスキップ=技も弾も出ない・座標も書かない(=移動しない)。
    // 解除後はチェイスから再開する。**持ち越しを全部捨てる**のは裏ボスが `bossBurstLeft` を
    // クリアしているのと同じ理由——残しておくと、解除直後に「止まっていた分の連射/次の段」が
    // まとめて暴発する(s.shotNextAt は既に過去になっている)。
    // ★`s.homing`(発射済みの誘導弾の旋回)は消さない。既に飛んでいる弾は他のボスでも飛び続ける
    // =「撃った後の弾」は気絶で消える物ではない。
    patch.bossState = 'chase';
    patch.bossNextActionAt = newGameTime + IDOL_TUNING.neutral.minMs;
    s.seq = []; s.step = 0; s.wavePending = false;
    s.shotWavesLeft = 0; s.shotSlot = null;
  } else if (rooted && st === 'chase') {
    // トラップ拘束中(chaseのみ凍結): 移動も新規攻撃も出さない。patchには何も積まず、
    // そのまま末尾のクランプ/setStateへ抜ける。fullStunと違い連射持ち越しの暴発経路は無いので
    // (rootは移動と新規攻撃を止めるだけ)、s.seq等のリセットは不要。
  } else if (forcedThisFrame) {
    // ボスメーカーの強制発動フレーム: 上で patch を組み終えているので通常遷移はスキップ。
  } else if (countered) {
    // カウンター成立フレームは遷移をスキップ(counterHitが休符まで設定済み)。
  } else if (st === 'chase') {
    // === NEUTRAL: 主戦帯を維持する(監査レポート§2-5の移動語彙4つ) ===
    // ボスメーカーで語彙を維持中はそれを使う(通常は距離から判断)。
    const verb: NeutralVerb = verbHold ?? neutralVerb(dist, IDOL_NEUTRAL_BAND, false);
    // ボスのクリ半減(社長指示v0.25.2422)。裏ボス/天使は移動の入口で掛けているのに、
    // アイドルだけ抜けていた(v0.25.2895)。CD×2(bossCritCdMult)は別経路で既に効いている。
    const spd = idol.speed * IDOL_VERB_SPEED_MULT[verb] * dt * bossSlowMult(idol, newGameTime);
    const ux = dist > 0.001 ? (pcx - icx) / dist : 0, uy = dist > 0.001 ? (pcy - icy) / dist : 0;
    if (verb === 'close') { patch.x = idol.x + ux * spd; patch.y = idol.y + uy * spd; }
    else if (verb === 'retreat') { patch.x = idol.x - ux * spd; patch.y = idol.y - uy * spd; }
    else { patch.x = idol.x + (-uy * s.strafeDir) * spd; patch.y = idol.y + (ux * s.strafeDir) * spd; }

    // 懲罰シグナルの積み上げ(ER原則⑤・§6.38 B0で純関数抽出=advanceLingerMs)。
    const stepMs = deltaTime * 1000;
    s.farSince = advanceLingerMs(s.farSince, dist > IDOL_NEUTRAL_BAND.max, stepMs);
    s.meleeSince = advanceLingerMs(s.meleeSince, zone === 'melee', stepMs);
    const ang = Math.atan2(pcy - icy, pcx - icx);
    let dAng = Math.abs(ang - s.lastAngle);
    while (dAng > Math.PI) dAng = Math.abs(dAng - Math.PI * 2);
    s.angleSince = advanceLingerMs(s.angleSince, dAng <= (IDOL_TUNING.sameAngleDeg * Math.PI) / 180, stepMs);
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
      const mz = gunMuzzleFor(aim.x); // 社長指示v0.25.3439: 起点=銃口
      fire('aim', aim.x, aim.y, mz.x, mz.y);
      sfx.shot(); // v0.25.3700: 技SE(社長指示・プレイヤー近似流用)
      patch.hateTarget = aim.side;
      toRecover('aim');
    }
  } else if (st === 'idol-fan-windup') {
    if (newGameTime >= (idol.bossStateUntil ?? 0)) {
      const aim = hateAim();
      patch.hateTarget = aim.side;
      const count = idolFanCount(phase);
      const mz = gunMuzzleFor(aim.x); // 社長指示v0.25.3439: 起点=銃口(角度も銃口から取る)
      const ang = Math.atan2(aim.y - mz.y, aim.x - mz.x);
      const half = (count - 1) / 2;
      for (let k = 0; k < count; k++) {
        const a = ang + (k - half) * IDOL_TUNING.shape.fanSpreadStep;
        fire('fan', mz.x + Math.cos(a) * 100, mz.y + Math.sin(a) * 100, mz.x, mz.y);
      }
      sfx.shot(); // v0.25.3700: 技SE(社長指示・プレイヤー近似流用・1回の発射イベントにつき1回)
      toRecover('fan');
    }
  } else if (st === 'idol-orb-windup') {
    if (newGameTime >= (idol.bossStateUntil ?? 0)) {
      const aim = hateAim();
      patch.hateTarget = aim.side;
      const n = idolOrbCount(phase);
      const mz = gunMuzzleFor(aim.x); // 社長指示v0.25.3439: 起点=銃口
      const base = Math.atan2(aim.y - mz.y, aim.x - mz.x);
      const ids: string[] = [];
      for (let k = 0; k < n; k++) {
        const a = base + (k - (n - 1) / 2) * IDOL_ORB_SPREAD_RAD; // 少し散らして出す(全弾が同じ線に乗らない)
        // 追尾弾も**技ごとの弾**として生成時に渡す(size は x/y の逆算に使うので後から書けない)。
        // 速度は既存パス `shape.orbSpeed` が正(値を二重に持たない・社長指示v0.25.2628)。
        const p = createEnemyProjectile(
          idol, player, mz.x + Math.cos(a) * 100, mz.y + Math.sin(a) * 100, mz.x, mz.y,
          { speed: IDOL_TUNING.shape.orbSpeed, damage: IDOL_TUNING.bullet.orb.damage, size: IDOL_TUNING.bullet.orb.size },
        );
        p.id = `${ORB_ID_PREFIX}${idol.id}-${newGameTime}-${k}`;
        useGameStore.getState().addProjectile(p);
        ids.push(p.id);
      }
      for (const id of ids) s.homing.push({ id, move: 'orb', side: aim.side });
      sfx.shot(); // v0.25.3700: 技SE(社長指示・プレイヤー近似流用・1回の発射イベントにつき1回)
      toRecover('orb');
    }
  } else if (st === 'idol-nade-windup') {
    // 手榴弾(社長指示v0.25.3442「プレイヤーの手榴弾と同じ仕様」→v0.25.3444「バックロールしながら投げる」):
    // 溜め明けの瞬間にプレイヤー方向へ投げ、同時に後方ロール('idol-nade'=rollと同じ移動)へ入る。
    // 転がり(壁バウンド+減速)はgameStoreのgrenade物理、信管2秒の爆発(半径66・プレイヤーへ)は
    // useGameLoopのhostile分岐が担う。接触ダメージ無し=判定は爆発の赤円のみ(collisionUtilsで除外)。
    if (newGameTime >= (idol.bossStateUntil ?? 0)) {
      const aim = hateAim();
      const ndx = aim.x - icx, ndy = aim.y - icy;
      const ndl = Math.hypot(ndx, ndy) || 1;
      useGameStore.getState().addProjectile({
        id: `proj-idol-nade-${idol.id}-${Math.floor(newGameTime)}`,
        x: icx - 7, y: icy - 7, width: 14, height: 14,
        speed: HEAVY_GRENADE_SPEED, damage: HEAVY_GRENADE_DAMAGE,
        direction: { x: ndx / ndl, y: ndy / ndl },
        weaponType: 'grenade', weaponKey: 'idol-heavy-grenade',
        duration: HEAVY_GRENADE_FUSE_MS, createdAt: Date.now(),
        passthrough: false, hitEnemies: [], hostile: true, reflected: false,
      });
      sfx.throwNade(); // v0.25.3700: 技SE(社長指示・プレイヤー近似流用)
      patch.hateTarget = aim.side;
      patch.bossState = 'idol-nade';
      patch.bossStateUntil = newGameTime + IDOL_TIMING.nade.active;
    }
  } else if (st === 'idol-nade') {
    // 後方ロール(rollと同じ・aiFrom→aiTargetをactiveで等分。無敵なし=rollと同じ掟)。
    const fx = idol.aiFromX ?? icx, fy = idol.aiFromY ?? icy;
    const tx = idol.aiTargetX ?? icx, ty = idol.aiTargetY ?? icy;
    const t = Math.max(0, Math.min(1, 1 - ((idol.bossStateUntil ?? newGameTime) - newGameTime) / IDOL_TIMING.nade.active));
    patch.x = (fx + (tx - fx) * t) - idol.width / 2;
    patch.y = (fy + (ty - fy) * t) - idol.height / 2;
    if (newGameTime >= (idol.bossStateUntil ?? 0)) toRecover('nade');
  } else if (st === 'idol-snipe-windup') {
    if (newGameTime >= (idol.bossStateUntil ?? 0)) {
      patch.bossState = 'idol-snipe';
      patch.bossStateUntil = newGameTime + IDOL_TIMING.snipe.active;
      sfx.snipe(); // v0.25.3700: 技SE(社長指示・プレイヤー近似流用)
    }
  } else if (st === 'idol-snipe') {
    // ロック済みの線上のみ判定(点-線分距離のカプセル)。図形=判定=描画が同じ2点を読む。
    const fx = idol.aiFromX ?? icx, fy = idol.aiFromY ?? icy;
    const tx = idol.aiTargetX ?? icx, ty = idol.aiTargetY ?? icy;
    const pr = Math.max(player.width, player.height) / 2;
    if (distToBandRect({ x: pcx, y: pcy }, { x: fx, y: fy }, { x: tx, y: ty }, IDOL_TUNING.shape.snipeHalfWidth) <= pr) {
      const died = useGameStore.getState().damagePlayer(IDOL_TUNING.moveDamage.snipe, `${enemyDeathLabel(idol.type)}の狙撃`, pcx, pcy, undefined, undefined, 'idol-snipe'); // G4a計測タグ(記録専用)
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

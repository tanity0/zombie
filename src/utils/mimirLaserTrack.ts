// PACING_PUZZLE.md §6.33「LASER-TRACK」: 追尾予告型レーザー(ミーミル試験導入)の純関数群。
// レンダラ非依存・store非依存(useGameLoop.ts / gameStore.ts / pixiScene.ts から import される)。
// 数値の根拠は §6.33-2(基準系=bossTelegraph.ts からの導出)を参照。
//
// 型の要旨(§6.33-1・社長裁定=案F v0.25.2941、慣性強化=社長実機指示 v0.25.2946): windup 3000ms の
// うち前段2750msは照準が「速度・加速度を持つ物理追尾」でヘイト対象を追う(最高速=歩速の1.5倍=
// 走り続けても・ジグザグでも追いつかれる)。ただし加速度上限による強い慣性(全反転1.0秒)があり、
// **発射600〜1800ms前の反転(切り返し)だけが照準を振り切れる**(実測: それより早い反転は再捕捉され、
// 遅い反転は間に合わない=マタドール)。終段250msでロック(以後発射終了まで固定)。
// 発射前900msは弱点露出=近接ヒットで中断できる。
import type { Enemy, EnemyType } from '../types/game';
import { applyBossPostureDamage } from './bossPosture';
import { telegraphProgress01 } from './bossTelegraph';

/**
 * §6.33のキルスイッチ(?mimirtrack=0)の唯一の出どころ。useGameLoop/pixiScene/中断判定が全員これを見る
 * (監査指摘1: 中断だけゲート漏れで「光っていないのに中断が起きる」半端状態になっていた)。
 * headless(テスト/ボット)では window が無い=既定ON。
 */
export const mimirTrackEnabled = (): boolean =>
  typeof window === 'undefined' || new URLSearchParams(window.location.search).get('mimirtrack') !== '0';

/**
 * PACING_PUZZLE.md §6.38 B0(先行抽出バッチ): 「ミーミル型レーザーを使う型」の集合。
 * 直書きの `type === 'mimir'` のうち**レーザーの判定・描画・中断だけ**をここへ寄せる
 * (mimirScript のフェーズ管理・スコア系・噛みつき/突進等の他技は対象外=挙動不変)。
 * 当面は mimir のみ(§6.38 B2で賞金首・遠距離型が輸入予定だが、B0では型集合を用意するだけで
 * 追加はしない=挙動不変)。
 */
const MIMIR_LASER_TYPES = new Set<EnemyType>(['mimir']);
export const usesMimirLaser = (type: string): boolean => MIMIR_LASER_TYPES.has(type as EnemyType);

/** レーザー溜め時間(ms)。useGameLoop.ts の状態機械もこの値を使う(単位は実効ms=壁時計系)。 */
export const MIMIR_LASER_WINDUP_MS = 3000;
/** 照準の最高速(px/s)。= 歩速104.4×1.5(v0.25.2946: 慣性を強めた分、捕捉力で補う)。 */
export const MIMIR_LASER_TRACK_MAX_PX_S = 156.6;
/** 照準の加速度上限(px/s^2)。= 歩速×3(社長実機指示v0.25.2946「慣性弱すぎ。最高速の時、反対に
 * レバー入れたら範囲外に出るくらい」→ ×5から強化)。全反転1.0秒の慣性。
 * 実測掃引: 反転が効く窓=発射600〜1800ms前(振り切り幅 最大75px)。走り続け/ジグザグ(0.8s周期)/
 * 立ち止まりは全て捕捉(31〜45px<48)。それより早い反転も再捕捉(2200ms前=44.7px)。 */
export const MIMIR_LASER_TRACK_ACCEL = 313.2;
/** 照準が対象に重なった時の保持デッドゾーン(px)。到着後の微振動(オーバーシュート往復)止め。 */
export const MIMIR_LASER_AIM_DEADZONE_PX = 6;
/** ロック段の長さ(ms)。< 脱出必要460ms((半太さ34+自機半径14)/104.4)=見てからでは間に合わない。
 * v0.25.2946: 300→250。v0.25.2949: 250→**150**(社長実機報告「発射前の硬直があるから歩いて避けられる」
 * =ロック中の無料移動をさらに削る。速度ビルドのプレイヤーでも歩き逃げが成立しない水準)。 */
export const MIMIR_LASER_LOCK_MS = 150;
/** 弱点露出窓(発射前ms)。≥ 近接1サイクル820ms(COUNTER_WINDOW+COUNTER_COOLDOWN)=必ず1振り入る。 */
export const MIMIR_LASER_WEAK_MS = 900;
/** 中断硬直(ms)。= BOSS_STRING_REST_MS(連携終端の休符=2発ぶんのパニッシュ窓)。 */
export const MIMIR_LASER_BROKEN_MS = 1700;
/** 中断された時だけレーザーへ課すCD(ms)。密着で撃たせて殴り続ける農場の防止。通常成功時はCDなし。 */
export const MIMIR_LASER_INTERRUPTED_CD_MS = 8000;

export type MimirLaserPhase = 'track' | 'lock';

/** windup中の照準フェーズ。残り時間がロック段に入ったら'lock'(以後照準を動かさない)。 */
export const mimirLaserPhase = (nowMs: number, untilMs: number | undefined): MimirLaserPhase =>
  untilMs !== undefined && untilMs - nowMs <= MIMIR_LASER_LOCK_MS ? 'lock' : 'track';

/** カラオケ塗りの進行0..1。windup全体(3000ms)に張る=**塗り完了の瞬間=発射の瞬間**(§6.33-1)。 */
export const mimirLaserFill01 = (nowMs: number, untilMs: number | undefined): number =>
  untilMs === undefined ? 0 : telegraphProgress01(nowMs, untilMs - MIMIR_LASER_WINDUP_MS, untilMs);

export interface MimirLaserAim { x: number; y: number; vx: number; vy: number }

/**
 * 照準の1tick更新(seek+arrive)。「望みの速度」=対象方向×min(最高速, √(2·加速度·距離))で、
 * 現在速度との差を加速度上限で詰める。√項は到着減速(オーバーシュート振動の防止)。
 * 速度を持つ=方向転換に慣性ぶんの遅れが出る(プレイヤーの切り返しで振り切れる=§6.33-1-2 答え2)。
 * 乱数なし=決定的。dtSec は秒。
 */
// v0.25.2956(社長指示「じわじわ加速して、残り7割を切ったあたりでプレイヤーを追い越す速度で一瞬
// 通り過ぎ、慣性を体験させておきたい。車のメーターみたいに振り切ってる感じ。ギリギリで切り返すと
// 避けれる塩梅」)の3ノブ:
/** じわじわ加速: 進行0→この進行までに最高速が RAMP_MIN×→RAMP_MAX× へ立ち上がる。 */
export const MIMIR_LASER_RAMP_END_PROGRESS = 0.3;
export const MIMIR_LASER_RAMP_MIN = 0.45;  // 開始時: 歩速の約0.7倍=明確に「じわじわ」
export const MIMIR_LASER_RAMP_MAX = 1.2;   // 進行30%以降: 素の最高速×1.2=歩速の1.8倍で「追い越す」
/** 振り切り窓(進行)。この間は到着減速を切り、針が対象を通り過ぎて往復する(メーターの振り切れ)。
 * 窓の終わり(残り600ms)からは減速を戻して収束=「走り続けは捕まる」の憲法を守る。
 * ギリギリの切り返し(発射600〜1800ms前の反転)は従来どおり慣性で振り切れる。 */
export const MIMIR_LASER_OVERSHOOT_FROM = 0.3;
export const MIMIR_LASER_OVERSHOOT_TO = 0.5;
/** 振り切り中の突っ込み速度の床(最高速に対する割合)。1.0=完全ノーブレーキ。 */
export const MIMIR_LASER_OVERSHOOT_FLOOR = 0.75;

/** 振り切り(オーバーシュート)の設定。技ごとに変えられるよう stepLaserAim の引数にしてある。 */
export interface OvershootConfig {
  from: number; to: number; floor: number;
  /**
   * ★true = 振り子(v0.25.3157・社長案「遠くから離して、強めの慣性があれば、振り子の様になる」)。
   * 窓の中では**遠ざかっている間も到着減速を切る**。
   *
   * 既定(false)の挙動は「対象へ向かっている間だけ減速を切る」で、遠ざかり始めた瞬間に
   * √(2ad) の到着減速が効く=**臨界制動**。つまり **既定では構造的に振動しない**
   * (実測: 開始角/溜め/速度/加速度/窓を1152通り掃引して、**1つも振り子にならなかった**)。
   * 振り子が要る技はこれを true にして、遠くから始める(=位置エネルギーを与える)。
   * ※窓を抜けたら通常の到着減速へ戻るので、**発動までに必ず収束する**(狙いが運にならない)。
   */
  swing?: boolean;
}
const MIMIR_OVERSHOOT: OvershootConfig = {
  from: MIMIR_LASER_OVERSHOOT_FROM, to: MIMIR_LASER_OVERSHOOT_TO, floor: MIMIR_LASER_OVERSHOOT_FLOOR,
};

/**
 * グレンの触手(reach)の振り切り設定(社長指示v0.25.3153「もっと追い越す動きが必要。
 * 追い越してくれないと避けれない」)。
 *
 * ミーミル(0.30〜0.50・床0.75)より**窓を広く・後ろまで・床を高く**する:
 *   - 窓を後ろへ伸ばす(→0.78)ことで、**発動が近い時間帯でも針が通り過ぎている**
 *     =切り返した時に「追い越して置いていかれる」が実際に起きる。
 *   - 床0.92=ほぼノーブレーキ。減速せずに突っ込むので**はっきり通り過ぎる**。
 * ★窓の終わり(0.78)以降は通常の減速へ戻す=**立ち止まりは最後に捕まる**の憲法を守る
 *   (最後まで振り切り続けると「棒立ちが安全」になり、技の意味が消える)。
 *   実効1500msの溜めなら、最後の約330msで収束する。
 */
export const GLEN_REACH_OVERSHOOT: OvershootConfig = { from: 0, to: 0.8, floor: 0.92, swing: true };

/**
 * 触手の照準の**開始位置**(社長案v0.25.3157「遠くから離して、強めの慣性があれば、振り子の様になる」)。
 * ボスを中心に、狙いから **GLEN_REACH_START_OFFSET_RAD** だけ横へ回した位置(距離は同じ)から始める。
 * = 振り子に**位置エネルギー**を与える役。ここが0だと振り子は始まらない(その場から動かない)。
 *
 * ★左右は**発ごとに交互**(乱数なし)=3連発が「左から→右から→左から」で同じに見えない。
 * ※v0.25.3155で一度この案を実装して掃引で全滅させているが、**あれは振り子モードが無い状態**
 *   だった(到着減速で振動が殺されるため、開始をずらしても"遅れて寄るだけ"になり追尾が弱るだけ)。
 *   振り子モード(swing)+長い溜めと**セット**でないと成立しない。3つで1つの設計。
 */
export const GLEN_REACH_START_OFFSET_RAD = 0.35; // 約20°

export const glenReachAimStart = (
  bossX: number, bossY: number, targetX: number, targetY: number, shotIndex: number,
): { x: number; y: number } => {
  const dx = targetX - bossX, dy = targetY - bossY;
  const dist = Math.hypot(dx, dy);
  if (dist < 1e-6) return { x: targetX, y: targetY };
  const side = shotIndex % 2 === 0 ? 1 : -1;
  const ang = Math.atan2(dy, dx) + GLEN_REACH_START_OFFSET_RAD * side;
  return { x: bossX + Math.cos(ang) * dist, y: bossY + Math.sin(ang) * dist };
};

// ── 触手の見た目について(v0.25.3156・社長実機判断で**不採用**になった案の記録) ──────────
// v0.25.3154「ぶるーんぶるーん」= 帯の角度にサイン波を足す
// v0.25.3155「離れた所からスタート」= 帯の開始角を台本で閉じる
// どちらも**照準は動かさず帯の角度だけを飾る**実装で、社長の実機判断は
// **「ちがう。慣性がわざとらしい」=不採用**。両方削除した。
//
// ★教訓: **物理で動いていない飾りは、大きく動かすほど嘘に見える。**
//   慣性の見え方は追尾の数値(最高速・加速度)だけで作ること。見た目の層で誤魔化さない。
//   ※「見た目の層で解くのが正しい」とv0.25.3155のログに書いたが、**それは間違いだった**
//     (実機で見れば一発で分かる類の誤り)。この行を残しておくので、同じ案を再提案しないこと。

export const stepLaserAim = (
  aim: MimirLaserAim, tgtX: number, tgtY: number, dtSec: number,
  maxPxS: number = MIMIR_LASER_TRACK_MAX_PX_S, accel: number = MIMIR_LASER_TRACK_ACCEL,
  progress01 = 1,
  os: OvershootConfig = MIMIR_OVERSHOOT,
): MimirLaserAim => {
  const dx = tgtX - aim.x, dy = tgtY - aim.y;
  const dist = Math.hypot(dx, dy);
  const speed = Math.hypot(aim.vx, aim.vy);
  // じわじわ加速: 進行で最高速の係数を立ち上げる。
  const ramp = MIMIR_LASER_RAMP_MIN
    + (MIMIR_LASER_RAMP_MAX - MIMIR_LASER_RAMP_MIN) * Math.min(1, Math.max(0, progress01) / MIMIR_LASER_RAMP_END_PROGRESS);
  const maxEff = maxPxS * ramp;
  // 加速度にも同じランプを掛ける: 最高速だけ上げると慣性エネルギー(v²/2a)が増え、中間の反転まで
  // 振り切れて「早すぎる反転は再捕捉」の憲法が壊れる(実測掃引: 1600/2000ms前が75/57px逃げ)。
  // 速度と旋回力を同率で上げれば旋回時間が保存され、逃げ窓はギリギリ(終盤)だけに残る。
  const accelEff = accel * ramp;
  const overshoot = progress01 >= os.from && progress01 < os.to;
  // 到着済み(デッドゾーン内・ほぼ静止)なら保持=対象が動き出すまで静かに張り付く。
  // 振り切り窓中は保持しない(通り過ぎるのが仕様)。
  if (!overshoot && dist <= MIMIR_LASER_AIM_DEADZONE_PX && speed <= accelEff * dtSec) {
    return { x: aim.x, y: aim.y, vx: 0, vy: 0 };
  }
  // 振り切り窓: **対象へ向かっている間だけ**到着減速(√2ad)を切る=全速で突っ込み慣性で一瞬
  // 通り過ぎる(社長指示「追い越す速度で一瞬通り過ぎ」)。通り過ぎて遠ざかり始めたら通常の減速で
  // 戻る(=針は一往復して収束。無限往復にしない——うろつき/中間反転で永遠に暴れて
  // 「ちょっと動いたぐらいじゃ当たる」の憲法が壊れるのを防ぐ・実測掃引で確認)。
  const closing = (aim.vx * dx + aim.vy * dy) >= 0;
  // 振り切り中の突っ込み速度は最高速の75%を床にする(完全ノーブレーキだと、スパイク中の反転まで
  // 振り切れて逃げ穴になる。75%でも針は対象を約25px通り過ぎ=「一瞬追い越す」は見える)。
  // ★振り子モード: **速度を目標に合わせるのをやめ、対象へ一定の力で引かれるだけ**にする。
  // 既存の制御は「望みの速度」を作って差を詰める形(=ステアリング)で、これは遠ざかる時に必ず
  // ブレーキが掛かる=**構造的に振動しない**。振り子は「力で引かれて、行き過ぎて、戻る」なので、
  // 速度目標を捨てて加速度だけを与える必要がある。
  if (overshoot && os.swing === true) {
    const inv0 = dist > 1e-6 ? 1 / dist : 0;
    let vx0 = aim.vx + dx * inv0 * accelEff * dtSec;
    let vy0 = aim.vy + dy * inv0 * accelEff * dtSec;
    const sp0 = Math.hypot(vx0, vy0);
    if (sp0 > maxEff) { const k0 = maxEff / sp0; vx0 *= k0; vy0 *= k0; }
    return { x: aim.x + vx0 * dtSec, y: aim.y + vy0 * dtSec, vx: vx0, vy: vy0 };
  }
  const desiredSpeed = overshoot && closing
    ? Math.min(maxEff, Math.max(maxEff * os.floor, Math.sqrt(2 * accelEff * dist)))
    : Math.min(maxEff, Math.sqrt(2 * accelEff * dist));
  const inv = dist > 1e-6 ? 1 / dist : 0;
  const dvx = dx * inv * desiredSpeed - aim.vx;
  const dvy = dy * inv * desiredSpeed - aim.vy;
  const dvl = Math.hypot(dvx, dvy);
  const maxDv = accelEff * dtSec;
  const k = dvl > maxDv ? maxDv / dvl : 1;
  const vx = aim.vx + dvx * k;
  const vy = aim.vy + dvy * k;
  return { x: aim.x + vx * dtSec, y: aim.y + vy * dtSec, vx, vy };
};

/**
 * 追尾キャップのプレイヤー速度スケール(v0.25.2949)。基準系(歩速104.4)より速いビルド(ランナー等)は
 * 素の定数だと「走るだけで振り切れて」しまう(社長実機報告「全然歩いてて避けられちゃう」の一因)。
 * 実効歩速に**同じ比率**(最高速×1.5/加速×3)を掛けて追尾を追随させる=どのビルドでも
 * 「走り続けは捕まる・反転だけが振り切れる」の文法を保つ。基準速以下では素の定数のまま。
 */
export const mimirLaserTrackCaps = (playerEffSpeedPxS: number): { maxPxS: number; accel: number } => {
  const v = Math.max(104.4, Number.isFinite(playerEffSpeedPxS) ? playerEffSpeedPxS : 104.4);
  return { maxPxS: v * 1.5, accel: v * 3 };
};

/**
 * グレンの触手(reach)の追尾キャップ(社長指示v0.25.3152「触手の速度あげて慣性もっと強められる?」)。
 *
 * ★**ミーミルと別の関数にしてある理由**: `mimirLaserTrackCaps` をそのまま強くすると
 * **ミーミルのレーザーまで変わる**。あちらは実測掃引で「反転が効く窓=発射600〜1800ms前」を
 * 作り込んである(v0.25.2946/2949)ので、触手の都合で動かしてはいけない。
 * **物理(stepLaserAim)は共有・キャップだけ技ごと**、が正しい分け方。
 *
 * ミーミルとの違い(倍率で書いてあるので、プレイヤーがどんな速度ビルドでも比率が保たれる):
 *   最高速  ×1.5 → **×1.9**  = 走って逃げても**より速く追いつかれる**
 *   加速度  ×3.0 → **×2.4**  = 曲がりにくい=**慣性が強い**
 * 全反転にかかる時間 = 2×最高速/加速度 で、ミーミル 1.00秒 → 触手 **1.58秒**。
 * ⇒ 「走り続けは捕まる」が強くなり、同時に「切り返しだけが振り切れる」も強くなる
 *    (=社長の狙いどおり、避け方が**切り返し一択**に寄る)。
 * ※溜め(GLEN_REACH_WINDUP_MS 実効1500ms)より全反転が長いのは**意図的**。
 *   溜めの中で振り切るには「全部反転し切る」必要はなく、**帯の半幅ぶん(42px)ズレれば足りる**。
 */
// v0.25.3157: 振り子にするため作り直した(掃引で成立した組)。速度も引く力も上がっているが、
// 「慣性が弱くなった」わけではない——**振り子の見え方は振れ幅と周期で決まる**(下の掟を参照)。
export const GLEN_REACH_TRACK_MAX_MULT = 2.8;
export const GLEN_REACH_TRACK_ACCEL_MULT = 4.5;
export const glenReachTrackCaps = (playerEffSpeedPxS: number): { maxPxS: number; accel: number } => {
  const v = Math.max(104.4, Number.isFinite(playerEffSpeedPxS) ? playerEffSpeedPxS : 104.4);
  return { maxPxS: v * GLEN_REACH_TRACK_MAX_MULT, accel: v * GLEN_REACH_TRACK_ACCEL_MULT };
};

/** 中断可能か=laser-windup中かつ発射前WEAK_MS以内(弱点露出窓)。窓外・発射後はfalse。 */
export const canInterruptMimirLaser = (
  type: string,
  bossState: string | undefined,
  nowMs: number,
  untilMs: number | undefined,
): boolean =>
  usesMimirLaser(type)
  && bossState === 'laser-windup'
  && untilMs !== undefined
  && untilMs - nowMs > 0
  && untilMs - nowMs <= MIMIR_LASER_WEAK_MS;

/**
 * 近接ヒットによる中断(§6.33-2-2/2-4)。窓外は null。
 * - 中断の成立(laser-broken 1700ms・連携クリア・中断CD)は体幹の状態と無関係に必ず起こる。
 * - 体幹0.20('counter')は applyBossPostureDamage に委譲。再ブレイクロック中等の null でも中断は成立。
 * - フルブレイクが立った場合(postureTriggered)はフルブレイク優先(スタンの方が長く止まるだけ)。
 * 呼び出し側の掟: enemy には同じヒットで先に適用した体幹パッチ('melee'等)を合成してから渡すこと
 * (体幹の二重取り・巻き戻しを防ぐ)。
 */
export const mimirLaserBreakOnMeleeHit = (
  enemy: Enemy,
  gameTime: number,
): { patch: Partial<Enemy>; postureTriggered: boolean } | null => {
  if (!mimirTrackEnabled()) return null; // ?mimirtrack=0: 弱点窓ごと無効=v0.25.2935へ完全復帰
  if (!canInterruptMimirLaser(enemy.type, enemy.bossState, gameTime, enemy.bossStateUntil)) return null;
  const posture = applyBossPostureDamage(enemy, 'counter', gameTime);
  return {
    patch: {
      bossState: 'laser-broken',
      bossStateUntil: gameTime + MIMIR_LASER_BROKEN_MS,
      bossScriptQueue: [],
      mimirLaserReadyAt: gameTime + MIMIR_LASER_INTERRUPTED_CD_MS,
      ...(posture?.patch ?? {}),
    },
    postureTriggered: posture?.triggered ?? false,
  };
};

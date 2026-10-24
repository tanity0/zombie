// ★ハンターの武器=棺桶(社長支給2026-09-18「棺桶の武器(太い方が先端)/ 2枚目が振ったエフェクト。
// 左から右に斬撃、真ん中行もその続きの斬撃。一番下の行が棺桶を振り抜いた後の、地面にドカン!っていう
// 余韻エフェクト / ジャンプと、突進どちらもこれを振る、でいいんじゃないかと」)。
//
// ★何を決める葉か: **既存の技の尺の上に乗る絵だけ**。判定・ダメージ・射程・尺は1msも触らない。
// ハンターの2つの技(`aiPhase === 'jump'` の着地 / `aiPhase === 'charge'` の突進)は
// **どちらも `aiPhaseUntil` が「決まる時刻」**なので、そこを 0 とした時計で絵を送る。
//
// ★上下は**画面の縦で固定**(重力)。狙いで動かすのは左右の鏡だけ——クリエイティブ監査2026-09-18 #3
// (バットのランタンで踏んだ穴)と同じ轍を踏まない。
//
// ★慣性(MUST): 重い得物なので**振り上げは遅く長く・振り下ろしは短く速く**、
// 叩きつけた後は**減衰する揺れ**で止まる。
import type { Enemy } from '../types/game';
import { frameByHold, holdTotalMs, holdLeadMs } from './fxFrameClock';

/** この敵が棺桶を振るか。 */
export const COFFIN_TYPES: readonly string[] = ['hunter'];
export const usesHunterCoffin = (e: Pick<Enemy, 'type'>): boolean => COFFIN_TYPES.includes(e.type);

/** 棺桶を振る技(社長指示「ジャンプと、突進どちらもこれを振る」)。 */
export const COFFIN_PHASES: readonly string[] = ['jump', 'charge'];
export const coffinPhaseNow = (e: Pick<Enemy, 'aiPhase'>): boolean =>
  e.aiPhase !== undefined && COFFIN_PHASES.includes(e.aiPhase);

// ---------------------------------------------------------------------------------------------
// 武器スプライト
// ---------------------------------------------------------------------------------------------
/** 見かけの長さ(px)。巨体の得物なので大きく。 */
export const COFFIN_LEN_PX = 210;
/** 柄(回転の軸)=**細い方**。社長「太い方が先端」なので、細い側を持つ。 */
export const COFFIN_GRIP_X = 0.03;
export const COFFIN_GRIP_Y = 0.5;
/** 素材の中で「柄→先端」が向いている角度。細い左→太い右=**真右**。 */
export const COFFIN_INTRINSIC_ANGLE = 0;

const D2R = Math.PI / 180;
/** 担いだ位置(振り上げる前)。背中側の斜め上。 */
export const COFFIN_REST_DEG = 200;
/** 振り上げ切った所=頭の真上より少し背中側。 */
export const COFFIN_BACK_DEG = 250;
/** 叩きつけ切った所=進行方向の斜め下。 */
export const COFFIN_DOWN_DEG = 20;
/** 振り上げに掛ける時間(ms・決まる時刻から遡って)。重い得物なので長い。 */
export const COFFIN_RAISE_MS = 460;
/** 振り下ろしに掛ける時間(ms)。短く速い。 */
export const COFFIN_SLAM_MS = 150;
/** 叩きつけた後の揺れ(ms)。 */
export const COFFIN_SETTLE_MS = 260;
export const COFFIN_SETTLE_DEG = 16;

const easeOut = (t: number): number => 1 - (1 - t) ** 3;
const easeIn = (t: number): number => t * t * t;

export interface CoffinPose { angle: number; alpha: number }

/**
 * 棺桶の姿勢。`sinceImpactMs` は**決まる瞬間(着地/突進の終わり)を0**とした経過(前は負)。
 * `s` は右向き=+1 / 左向き=-1。角度は**画面の縦で固定**し、左右だけ鏡にする。
 */
export const coffinPose = (sinceImpactMs: number, s: number): CoffinPose | null => {
  if (sinceImpactMs < -(COFFIN_RAISE_MS + COFFIN_SLAM_MS)) return null;
  if (sinceImpactMs > COFFIN_SETTLE_MS) return null;
  const sg = s >= 0 ? 1 : -1;
  const at = (deg: number): number => (90 + sg * (deg - 90)) * D2R;
  const rest = at(COFFIN_REST_DEG), back = at(COFFIN_BACK_DEG), down = at(COFFIN_DOWN_DEG);
  if (sinceImpactMs <= -COFFIN_SLAM_MS) {
    const t = 1 - (-sinceImpactMs - COFFIN_SLAM_MS) / COFFIN_RAISE_MS;  // 0→1で担ぎ→振り上げ
    return { angle: rest + (back - rest) * easeOut(Math.max(0, Math.min(1, t))), alpha: 1 };
  }
  if (sinceImpactMs <= 0) {
    const t = 1 + sinceImpactMs / COFFIN_SLAM_MS;                        // 0→1で振り下ろし
    return { angle: back + (down - back) * easeIn(t), alpha: 1 };
  }
  const t = sinceImpactMs / COFFIN_SETTLE_MS;
  const damp = Math.exp(-3.2 * t);
  const wobble = COFFIN_SETTLE_DEG * D2R * damp * Math.sin(2 * Math.PI * 2 * t);
  return { angle: down - sg * wobble, alpha: 1 };
};

// ---------------------------------------------------------------------------------------------
// 斬撃(10コマ=シートの1行目+2行目の通し)
// ---------------------------------------------------------------------------------------------
export const COFFIN_SWING_FRAMES = 10;
/** **決まる瞬間に出るコマ**=振り抜き切った最後のコマ。 */
export const COFFIN_SWING_IMPACT_FRAME = 9;
/** 各コマの尺(ms)。手前は詰めて、最後の1枚を長く見せる(等間隔にしない)。 */
export const COFFIN_SWING_HOLD_MS: readonly number[] =
  [18, 18, 18, 18, 18, 20, 22, 24, 28, 90];
/** 最後のコマを抜くフェード(ms)。 */
export const COFFIN_SWING_FADE_MS = 70;
export const COFFIN_SWING_REF_W = 307;
/** 斬撃の見かけの横幅(px)。②派手さの絵なので判定より大きく。 */
export const COFFIN_SWING_W_PX = 300;

export const coffinSwingFrame = (sinceImpactMs: number): number | null =>
  frameByHold(sinceImpactMs, COFFIN_SWING_HOLD_MS, COFFIN_SWING_IMPACT_FRAME);

export const coffinSwingAlpha = (sinceImpactMs: number): number => {
  const tail = holdTotalMs(COFFIN_SWING_HOLD_MS) - holdLeadMs(COFFIN_SWING_HOLD_MS, COFFIN_SWING_IMPACT_FRAME);
  const left = tail - sinceImpactMs;
  if (left <= 0) return 0;
  if (left >= COFFIN_SWING_FADE_MS) return 1;
  const t = left / COFFIN_SWING_FADE_MS;
  return t * t;
};

// ---------------------------------------------------------------------------------------------
// 地面の「ドカン!」(5コマ=シートの3行目)
// ---------------------------------------------------------------------------------------------
export const COFFIN_SLAM_FRAMES = 5;
/** **先頭が決まる瞬間**(素材が「一番大きい→散る」の順で描かれている)。 */
export const COFFIN_SLAM_IMPACT_FRAME = 0;
/** 各コマの尺(ms)。散るほど遅くする。 */
export const COFFIN_SLAM_HOLD_MS: readonly number[] = [80, 70, 80, 95, 120];
export const COFFIN_SLAM_REF_W = 307;
/** 地面の余韻の見かけの横幅(px)。 */
export const COFFIN_SLAM_W_PX = 280;

export const coffinSlamFrame = (sinceImpactMs: number): number | null =>
  frameByHold(sinceImpactMs, COFFIN_SLAM_HOLD_MS, COFFIN_SLAM_IMPACT_FRAME);

/** 絵が流れ切るまでの長さ(ms・ラッチの寿命に使う)。 */
export const coffinTotalMs = (): number => Math.max(
  holdTotalMs(COFFIN_SWING_HOLD_MS) - holdLeadMs(COFFIN_SWING_HOLD_MS, COFFIN_SWING_IMPACT_FRAME),
  holdTotalMs(COFFIN_SLAM_HOLD_MS), COFFIN_SETTLE_MS,
);
/** 絵が出始めるまでの先行(ms・ラッチを何ms前から armed にするかの目安)。 */
export const coffinLeadMs = (): number => Math.max(
  holdLeadMs(COFFIN_SWING_HOLD_MS, COFFIN_SWING_IMPACT_FRAME), COFFIN_RAISE_MS + COFFIN_SLAM_MS,
);

// =============================================================================================
// ★突進は「振り」ではなく **頭上で振り回しながら走る**(社長指示2026-09-18
// 「突進は振りをやめて、棺桶を頭上で振り回しながら突進に変更」)
// =============================================================================================
//
// ★慣性(MUST・CLAUDE.md「常時回転する装飾等も、物理の中にいるなら動き始め・動き終わりに加減速が
// あるはず」): **回し始めは加速・終いは減速**。等速で始まって瞬間停止する回転は作らない。
//
// ★`jump`(叩きつけ)とは**別の絵**になる: 突進中は斬撃10コマも地面5コマも出さない
// (社長「振りをやめて」)。出るのは**棺桶そのものが頭上を回る**ことだけ。

/** 全速時の回転(回/秒)。**大きく見せる**(小さくて認識できない動きは演出が存在しないのと同じ)。 */
export const COFFIN_SPIN_REV_PER_SEC = 1.4;
/** 回し始めの加速(ms)。 */
export const COFFIN_SPIN_UP_MS = 260;
/** 走り終わりの減速(ms)。残りがこれを切ったら緩めていく。 */
export const COFFIN_SPIN_DOWN_MS = 320;
/** 走りが切れた後、回りながら消えるまで(ms)。 */
export const COFFIN_SPIN_TAIL_MS = 260;
/** 頭上に掲げる高さ(箱の高さに対する割合・足元から上へ)。 */
export const COFFIN_SPIN_UP_FRAC = 1.12;
/** 突進中の棺桶の長さ(px)。振り回すので少し短く持つ。 */
export const COFFIN_SPIN_LEN_PX = 180;

/**
 * 突進中の**累積回転数**(回)。`sinceMs`=走り始めからの経過 / `remainMs`=走り終わりまでの残り
 * (走りが切れた後は 0) / `tailMs`=切れてからの経過。
 *
 * ★**単調増加**であること(戻ると絵が巻き戻る)。立ち上がりは二乗で加速、終いは残りの二乗で減速、
 * 切れた後は尻すぼみに足す——どの区間でも瞬間速度は 0 以上に保たれる。
 */
export const coffinSpinRevs = (sinceMs: number, remainMs: number, tailMs = 0): number => {
  const R = COFFIN_SPIN_REV_PER_SEC / 1000;      // 回/ms
  const U = COFFIN_SPIN_UP_MS, D = COFFIN_SPIN_DOWN_MS, T = COFFIN_SPIN_TAIL_MS;
  const s = Math.max(0, sinceMs);
  const up = Math.min(s, U);
  let revs = R * up * up * up / (3 * U * U);     // 立ち上がりの積分(rate = R*(t/U)^2)
  revs += R * Math.max(0, s - U);                // 定速ぶん
  if (remainMs < D) {                            // 終いの減速ぶんを差し引く(rate = R*(remain/D)^2)
    const rm = Math.max(0, remainMs);
    revs -= R * ((D - rm) - (D * D * D - rm * rm * rm) / (3 * D * D));
  }
  if (tailMs > 0) {                              // 切れた後も尻すぼみに回ってから止まる
    const t = Math.min(1, tailMs / T);
    revs += R * T / 3 * (1 - (1 - t) ** 3);
  }
  return revs;
};

/**
 * ★**「回し終わってから何ms経ったか」**(社長報告2026-09-22「**ハンターがダッシュした後、
 * 頭上を周る棺桶が消えない**」・v0.25.4571)。
 *
 * ★**実バグの形**: 描画側は「尻尾の経過」を**ラッチの窓の終わり**(`t0 + dur − TAIL`)から数えていた。
 * 突進の長さは可変なのでラッチの窓は **60秒**の安全枠を取っており、結果 **尻尾が始まるのは
 * 突進開始から59.7秒後**——つまり**突進が終わっても棺桶が約1分回り続けていた**。
 * ⇒ 数える起点は窓の終わりではなく、**「走りが切れた瞬間」**(`offAtMs`)。
 *
 * @param nowMs   いまの実時計(ラッチと同じ時計)
 * @param offAtMs 走りが切れた瞬間。走っている間は `undefined`
 * @param armed   まだ走っているか
 * @returns 尻尾の経過ms / **null = もう出さない**(呼び手はラッチを捨ててよい)
 */
export const coffinSpinTailAt = (
  nowMs: number, offAtMs: number | undefined, armed: boolean,
): number | null => {
  if (armed) return 0;                       // 走っている間は尻尾ゼロ(減速は remainMs 側が持つ)
  if (offAtMs === undefined) return null;    // 切れた時刻が焼けていない=描く根拠が無い
  const tail = nowMs - offAtMs;
  if (tail >= COFFIN_SPIN_TAIL_MS) return null;
  return Math.max(0, tail);
};

export interface CoffinSpinPose { angle: number; alpha: number; upFrac: number }

/**
 * 突進中の棺桶の姿勢。回転の軸は**柄**(頭上の手)なので、棺桶は手を中心に大きな円を描く。
 * 左向きは回転の向きも鏡にする(`s`)。
 */
export const coffinSpinPose = (
  sinceMs: number, remainMs: number, tailMs: number, s: number,
): CoffinSpinPose | null => {
  if (sinceMs < 0) return null;
  if (tailMs >= COFFIN_SPIN_TAIL_MS) return null;
  const sg = s >= 0 ? 1 : -1;
  const revs = coffinSpinRevs(sinceMs, remainMs, tailMs);
  // 出は下から持ち上げる代わりに、**回し始めのフェード**で置く(パッと出さない)。
  const rise = Math.min(1, sinceMs / 140);
  const fall = tailMs > 0 ? 1 - (tailMs / COFFIN_SPIN_TAIL_MS) ** 2 : 1;
  return { angle: sg * revs * 2 * Math.PI, alpha: Math.max(0, rise * fall), upFrac: COFFIN_SPIN_UP_FRAC };
};

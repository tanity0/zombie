// ★被弾反撃(research/HIT_RETALIATION.md・社長指示2026-10-09)の純関数。
// 食らった直後の短い窓の中で、食らった相手の方へ「はじく」と、被ダメはそのまま・相手に近接の倍を返す。
// ここは状態を持たない計算だけ(store が呼ぶ・テストで固定する)。gameStore を import しない(循環を作らない)。
import type { Enemy } from '../types/game';
import { isCorpse, isReaperFamily, isTerminalReaper, isUntouchable } from './enemyUtils';

/** 受付の長さ(ms)。ヒットストップが明けてから数える(社長「そだね」2026-10-09・当たった瞬間から 370〜490ms)。 */
export const RETALIATE_WINDOW_MS = 300;
/** 相手の体の縁までこの距離(px)以内なら成立(入力の瞬間に測る)。 */
export const RETALIATE_REACH_PX = 260;
/** 入力の向きと「プレイヤー→相手」の向きがこの角度(度)以内で成立。 */
export const RETALIATE_ANGLE_DEG = 45;
/** 最終ダメージの倍率(社長「近接の倍」)。 */
export const RETALIATE_DAMAGE_MULT = 2;
/** 飛び込みの長さ(ms)。踏み込みの器(lungeVx/lungeUntil)を使うが、尺は近接の踏み込み(90ms)より少し長い。 */
export const RETALIATE_LUNGE_MS = 120;
/** パッド: スティックが「直近この時間内にデッドゾーン内だった」状態から倒れた時を、ニュートラルからの入力とみなす。 */
export const RETALIATE_PAD_NEUTRAL_MS = 150;

/** 窓の記録(store.hitRetaliation)。時計は Date.now(ヒットストップ・吹き飛びと同じ)。 */
export interface HitRetaliationWindow {
  /** 反撃の相手(敵の個体id)。 */
  fromId: string;
  /** 窓が開いた時刻=被弾の瞬間。 */
  openedAt: number;
  /** 窓が閉じる時刻=ヒットストップの明け+RETALIATE_WINDOW_MS。 */
  closesAt: number;
  /** 窓を開いた時点のヒットストップの明け。反撃で「その被弾のストップだけ」を打ち切るために持つ(別の演出のストップは切らない)。 */
  stopUntil: number;
  /** 被弾の瞬間の「プレイヤー→相手」の向き(知らせの帯を出す方向。反撃の向き判定には使わない=入力の瞬間に測り直す)。 */
  dirX: number;
  dirY: number;
}

/** 窓の閉じる時刻: ヒットストップが明けてから RETALIATE_WINDOW_MS。 */
export const retaliationClosesAt = (now: number, hitstopUntil: number): number =>
  Math.max(now, hitstopUntil) + RETALIATE_WINDOW_MS;

/** 被弾の瞬間に窓を作る。向きが取れない(重なっている)時は真上。 */
export const makeRetaliationWindow = (
  fromId: string, now: number, hitstopUntil: number, dirX: number, dirY: number,
): HitRetaliationWindow => {
  const m = Math.hypot(dirX, dirY);
  return {
    fromId, openedAt: now, closesAt: retaliationClosesAt(now, hitstopUntil), stopUntil: Math.max(now, hitstopUntil),
    dirX: m > 0.001 ? dirX / m : 0, dirY: m > 0.001 ? dirY / m : -1,
  };
};

/** 窓が開いているか(閉じる時刻の ms ちょうどは閉じている)。 */
export const isRetaliationWindowOpen = (win: HitRetaliationWindow | null | undefined, now: number): boolean =>
  !!win && now >= win.openedAt && now < win.closesAt;

/**
 * 入力の向きと「プレイヤー→相手」の向きの角度が maxDeg 以内か。
 * どちらかがゼロベクトル(向きが無い)なら不成立。
 */
export const retaliationAngleOk = (
  inX: number, inY: number, toX: number, toY: number, maxDeg: number = RETALIATE_ANGLE_DEG,
): boolean => {
  const a = Math.hypot(inX, inY), b = Math.hypot(toX, toY);
  if (!(a > 0.0001) || !(b > 0.0001)) return false;
  const cos = (inX * toX + inY * toY) / (a * b);
  return cos >= Math.cos((maxDeg * Math.PI) / 180);
};

/**
 * 反撃の相手として今も有効か(入力の瞬間・着地の瞬間に呼ぶ)。
 * 生きている・死体でない・眠っていない・横切りの死神でない・空中(跳び)でない・触れられない状態でない、かつ
 * 体の縁までの距離(distPx=近接と同じ `enemyMeleeDist`)が reachPx 以内。=「普通の近接で斬れる敵」の条件に揃える。
 */
export const isRetaliateTargetEligible = (
  e: Pick<Enemy, 'health' | 'corpseUntil' | 'dormant' | 'type' | 'reaperChaser' | 'aiPhase' | 'bossState'>,
  distPx: number,
  reachPx: number = RETALIATE_REACH_PX,
): boolean => {
  if (!(e.health > 0) || isCorpse(e) || e.dormant === true) return false;
  if (isReaperFamily(e.type) && !isTerminalReaper(e)) return false; // 横切りの死神(深奥チェイサーだけが近接の対象)
  if (e.aiPhase === 'jump' || isUntouchable(e)) return false;
  return distPx <= reachPx;
};

/** 反撃の入力を受け付けない状態(従来の入力経路へ落とす)。窓自体は開く=入力の瞬間に判定する。 */
export interface RetaliationBlockState {
  inputLocked: boolean;      // 会話・一時停止・死亡・時間停止
  attention: boolean;        // アテンション演出中
  meleeLocked: boolean;      // 訓練(M0)で近接が未解禁
  skaterRiding: boolean;     // スケボー乗車中(攻撃封印)
  rhythm: boolean;           // 四神舞のリズム中
  pvpIncapacitated: boolean; // 対人の紫/気絶中
  seekerBlocked: boolean;    // シーカーの半透明中(近接が封じられている間)
}
export const isRetaliationBlocked = (s: RetaliationBlockState): boolean =>
  s.inputLocked || s.attention || s.meleeLocked || s.skaterRiding || s.rhythm || s.pvpIncapacitated || s.seekerBlocked;

// ---------------------------------------------------------------------------------------------
// コントローラー: 「ニュートラルからの入力」(社長「コントローラーはニュートラルからの入力」)
// ---------------------------------------------------------------------------------------------
// スティックが直近 RETALIATE_PAD_NEUTRAL_MS 以内にデッドゾーン内だった状態から、外へ倒れている間だけ「入力」を返す。
// 倒しっぱなしで歩いている時(ニュートラルが無い)は返さない=歩きながら敵へ向かうだけでは暴発しない。
// ★左から右へ一気に倒した時も取りこぼさない: 1フレームで中心を飛び越えて逆向きへ振れた時(前の向きと内積が負)は、
//   その瞬間に中心を通ったものとして扱う(60fpsでは中心の標本がちょうど無いことがある)。
export interface PadNeutralTracker {
  /** 最後にデッドゾーン内(または中心を跨いだ)時刻。-Infinity=まだ無い。 */
  lastNeutralAt: number;
  prevOutside: boolean;
  prevX: number;
  prevY: number;
}
export const createPadNeutralTracker = (): PadNeutralTracker =>
  ({ lastNeutralAt: -Infinity, prevOutside: false, prevX: 0, prevY: 0 });

/**
 * 1フレーム進める。戻り値 push=ニュートラルからの入力として使える今の向き(単位ベクトル)。無ければ null。
 * tracker を直接書き換える(毎フレームの割り当てを避ける)。
 */
export const stepPadNeutral = (
  t: PadNeutralTracker, ax: number, ay: number, nowMs: number, dead: number,
): { x: number; y: number } | null => {
  const m = Math.hypot(ax, ay);
  const outside = m > dead;
  if (!outside) {
    t.lastNeutralAt = nowMs;
    t.prevOutside = false;
    return null;
  }
  const ux = ax / m, uy = ay / m;
  if (t.prevOutside && ux * t.prevX + uy * t.prevY < 0) t.lastNeutralAt = nowMs; // 中心を跨いで逆へ振れた
  t.prevOutside = true;
  t.prevX = ux; t.prevY = uy;
  return nowMs - t.lastNeutralAt <= RETALIATE_PAD_NEUTRAL_MS ? { x: ux, y: uy } : null;
};

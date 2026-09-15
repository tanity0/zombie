// research/AI_HUMANIZE.md B3(§4「慣性(B3の新設作業)」・CLAUDE.md「動きの絶対ルール: 慣性」MUST)。
// 守護霊/幻影の移動を「速度ベクトルを状態として持つ」形にする純関数。イージングは既存の
// `inertiaAlpha`(gameStore.ts・照準/移動ランプで既に使われている式)をそのまま再利用する
// (§0-3実測主義=新しい物理式を発明しない)。オーバーシュートは目標速度→現在速度への遅延そのものから
// 自然に出る(専用の定数・乱数は使わない=目標が消えても残速度で流れる)。
import { inertiaAlpha } from '../store/gameStore';

/** 加減速の時定数(秒)。叩き台=150〜250msの中央値200ms(§4「慣性…加減速150〜250ms・ease」)。 */
export const MOTION_RAMP_TAU_SEC = 0.2;

/** 到達判定のデッドバンド(px)。叩き台=±6px(§4「目標点周りの毎tick反転ジッタの防止」)。 */
export const MOTION_DEADBAND_PX = 6;

export interface VelocityState { vx: number; vy: number }

/**
 * 現在速度(prev)を目標速度(targetVx,targetVy)へイーズで近づける(1tick分)。
 * tau<=0なら即時(inertiaAlphaの規約どおり)。目標が0(方向入力なし)でも同じ式で減速する
 * =急停止ではなく残速度で流れてから止まる(オーバーシュートの土台)。
 */
export const rampVelocity = (
  prev: VelocityState, targetVx: number, targetVy: number, deltaTime: number, tauSec: number = MOTION_RAMP_TAU_SEC,
): VelocityState => {
  const a = inertiaAlpha(deltaTime, tauSec);
  return { vx: prev.vx + (targetVx - prev.vx) * a, vy: prev.vy + (targetVy - prev.vy) * a };
};

/**
 * 点(dx,dy)がデッドバンド内かどうか(±6px・叩き台)。目標点への接近判定に使う
 * (例: 自分の落し物を拾いに行く・帰還ポイントへ寄る、等の「点」目標のみ。距離帯[preferredDist±band]の
 * ような「帯」判定には使わない=既存のGHOST_MOVE_BAND_PX=40pxのままでよい)。
 */
export const withinDeadband = (dx: number, dy: number, deadbandPx: number = MOTION_DEADBAND_PX): boolean =>
  Math.hypot(dx, dy) <= deadbandPx;

/**
 * ★B3検収(中6): 停止判定閾値(px/s)。gameStore.sniperGunMultの`stopped`判定
 * (`Math.hypot(enemy.vx,enemy.vy) < 4`)と**同じ値の意図的な複製**(motionRampはstore非依存を保つため
 * importしない=循環回避)。値がズレるとスナイパー「停止敵」ボーナスの発火タイミングだけがズレる。
 */
export const STOP_SNAP_PX_PER_SEC = 4;

/**
 * ランプ後の速度が停止判定閾値未満まで減衰していたら、厳密に(0,0)へスナップする。
 * `rampVelocity`は目標0への収束が漸近的(理論上ちょうど0にはならない)——旧実装(B3以前)は
 * `decision.moveX/Y===0`で**瞬間的に**vx=vy=0にしていたため、スナイパーの「停止敵」ボーナス判定
 * (上のSTOP_SNAP_PX_PER_SEC未満)はその瞬間に揃っていた。閾値を跨いだtickで即0スナップすることで、
 * ブール判定(停止か否か)自体は既にそのtickで真になっている状態を厳密な0で確定させ、以降の
 * 描画/他ロジックが減衰の長い尾(残ジッタ)を拾わないようにする(§4検収・中6)。
 */
export const snapStoppedVelocity = (v: VelocityState): VelocityState =>
  Math.hypot(v.vx, v.vy) < STOP_SNAP_PX_PER_SEC ? { vx: 0, vy: 0 } : v;

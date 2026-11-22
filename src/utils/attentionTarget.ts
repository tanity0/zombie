// 遅れて出すアテンション(ボス・賞金首・幻影の出現の紹介など)の「寄り先」を、写す相手から出し直す純関数。
//
// 不具合(社長実機・ステージ1の2周目): 賞金首の出現で、出た瞬間の位置を控えて 950ms 後(他のアテンションや店の画面で
// さらに遅れることがある)にその控えた座標へ寄せていたため、その間に相手が動く・消えると「写すべき物の無い場所」へ寄った。
// 直し方: 控えるのは座標ではなく**相手の id**。発火の瞬間に今の位置から寄り先を出し直し、相手がいなければ出さない。
// 寄って止まっている間に相手が動いたら、寄り先が慣性つきで付いて行く(followAttentionFocus)。
// ★レンダラ非依存(描画は attention.x/y を読むだけ)。尺・カットイン・時間停止・カメラの動き方には触らない。

import type { Enemy } from '../types/game';
import { bossArtCenter } from '../pixi/renderSpec';

/**
 * 寄り先の取り方。元の計算と同じ式を選ぶ。
 * - 'art'    = 絵の中心(bossArtCenter・ボス級の出現の紹介)
 * - 'center' = 帯(判定の箱)の中心
 */
export type AttentionFocusKind = 'art' | 'center';

export interface AttentionTarget { id: string; focus: AttentionFocusKind }

type TargetEnemy = Pick<Enemy, 'id' | 'type' | 'x' | 'y' | 'width' | 'height' | 'health'>;

/** 相手の今の寄り先。 */
export const attentionFocusOf = (e: Pick<Enemy, 'type' | 'x' | 'y' | 'width' | 'height'>, focus: AttentionFocusKind): { x: number; y: number } =>
  focus === 'art' ? bossArtCenter(e) : { x: e.x + e.width / 2, y: e.y + e.height / 2 };

/** 写す相手(生きている)を探す。いない・倒れた → null。 */
export const findAttentionTarget = <E extends TargetEnemy>(enemies: readonly E[], id: string): E | null => {
  for (const e of enemies) if (e.id === id) return e.health > 0 ? e : null;
  return null;
};

/**
 * 遅れて出すアテンションの寄り先を、発火の瞬間に出し直す。相手がいなければ null(=アテンションを出さない)。
 */
export const resolveDeferredAttentionFocus = (
  enemies: readonly TargetEnemy[], target: AttentionTarget,
): { x: number; y: number } | null => {
  const e = findAttentionTarget(enemies, target.id);
  return e ? attentionFocusOf(e, target.focus) : null;
};

/** 寄り先が相手へ付いて行く速さ(指数の時定数・ms)。パッと跳ばない程度に遅く、離されない程度に速い(叩き台)。 */
export const ATTENTION_FOLLOW_TAU_MS = 120;
/** これより近ければ動かさない(store を毎フレーム書き換えない)。 */
export const ATTENTION_FOLLOW_EPS = 0.25;

/**
 * 寄り先 cur を相手の今の位置 goal へ、慣性つき(指数の追従=近づくほど減速)で dtMs ぶん寄せる。
 * 近ければ null(=書き換え不要)。
 */
export const followAttentionFocus = (
  cur: { x: number; y: number }, goal: { x: number; y: number }, dtMs: number, tauMs: number = ATTENTION_FOLLOW_TAU_MS,
): { x: number; y: number } | null => {
  const dx = goal.x - cur.x, dy = goal.y - cur.y;
  if (Math.abs(dx) <= ATTENTION_FOLLOW_EPS && Math.abs(dy) <= ATTENTION_FOLLOW_EPS) return null;
  const k = 1 - Math.exp(-Math.max(0, dtMs) / Math.max(1, tauMs));
  if (k <= 0) return null;
  return { x: cur.x + dx * k, y: cur.y + dy * k };
};

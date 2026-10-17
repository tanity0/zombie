// ★ゴールに入ったら爆弾で一掃(research/THEONE_ROUND2.md §7・社長 2026-10-17)。
// 社長の言葉:「ゴール入ってクリアイベント始まったら爆弾で雑魚一掃。効かない敵はノックバックで遠くへ」。
// 何を倒し、何を吹き飛ばすかだけを決める純関数(実行=gameStore の goalWipe・演出=useGameLoop)。
// - 倒す=雑魚(ボス級の表に入っていない敵)。クエストの討伐対象は残す(倒すことが条件のため)。
// - 吹き飛ばす=それ以外(強個体・ボス級・英雄など=爆弾が効かない敵)。中心から外向きへ。
// - 対象は中心から GOAL_WIPE_RADIUS 以内(画面の外の敵には手を出さない)。死体・倒れている敵は見ない。
import type { Enemy, EnemyType } from '../types/game';

export const GOAL_WIPE_RADIUS = 900;        // 一掃の届く距離(スマホの画面の対角の半分より少し外まで)
export const GOAL_WIPE_PUSH_SPEED = 4200;   // 吹き飛ばしの初速(px/s)=中心の真横。遠いほど弱く(端で半分)。ノックバックは減速するので近くでおよそ 600px 飛ぶ
export const GOAL_WIPE_CHARGE_MS = 260;     // 爆発までの溜め(減光+ロック音)
export const GOAL_WIPE_WAVE_PX_PER_MS = 1.4; // 衝撃の波が外へ進む速さ=倒れる/飛ぶのは波が届いた時(端の 900px まで約 0.64 秒)

export interface GoalWipePlan {
  kill: string[];
  push: { id: string; vx: number; vy: number }[];
}

export const planGoalWipe = (
  enemies: readonly Pick<Enemy, 'id' | 'type' | 'x' | 'y' | 'width' | 'height' | 'health' | 'questTarget'>[],
  cx: number, cy: number,
  isBossType: (t: EnemyType) => boolean,
  isOut: (e: Pick<Enemy, 'id'>) => boolean, // 死体・触れない状態(昇天中の英雄など)の判定は呼び手が渡す
  reach = GOAL_WIPE_RADIUS,                 // 衝撃の波が今届いている距離(波の外の敵は次のフレーム以降)
  done: ReadonlySet<string> = new Set(),    // もう波を受けた敵(二度当てない)
): GoalWipePlan => {
  const plan: GoalWipePlan = { kill: [], push: [] };
  for (const e of enemies) {
    if (done.has(e.id) || e.health <= 0 || isOut(e)) continue;
    const ex = e.x + e.width / 2, ey = e.y + e.height / 2;
    const dx = ex - cx, dy = ey - cy;
    const d = Math.hypot(dx, dy);
    if (d > Math.min(reach, GOAL_WIPE_RADIUS)) continue;
    if (!isBossType(e.type) && !e.questTarget) { plan.kill.push(e.id); continue; }
    // 真上に重なっている時は向きが定まらないので上へ(ゼロ除算で「その場」にしない)。
    const ux = d > 1 ? dx / d : 0, uy = d > 1 ? dy / d : -1;
    const sp = GOAL_WIPE_PUSH_SPEED * (1 - 0.5 * Math.min(1, d / GOAL_WIPE_RADIUS)); // 近いほど強く(検収クリエイティブ監査 #2)
    plan.push.push({ id: e.id, vx: ux * sp, vy: uy * sp });
  }
  return plan;
};

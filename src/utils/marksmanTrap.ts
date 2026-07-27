// マークスマンのトラップ(sub-weapon 'marksman-trap')の捕獲判定。
//
// 社長報告v0.25.2326「サークルの範囲の敵にちゃんと反応してる? 範囲が狭い気がする」の対応(案A採用)。
// 旧実装は**敵の中心**が半径内に入るまで反応しなかったため、体が円にはっきり食い込んでいても
// 掛からず、見た目の円と挙動が食い違っていた。目減りは敵の幅の半分ぶん=大型ほど大きい
// (ゾンビ幅30で-15px / パンプキン40で-20px / ジャイアントバット60で-30px。Lv1の半径50に対して最大-60%)。
// → **体が円に触れたら掛かる**(中心距離 - 敵の半幅 <= 半径)へ変更し、見た目と一致させる。
// 既存の近接判定(enemyMeleeDist がボスでは矩形の最近点を使う)と同じ思想。
//
// レンダラ非依存の純関数(src/utils)=ヘッドレスでユニットテスト可能。
import type { Enemy } from '../types/game';

/** トラップ中心から敵の「体の縁」までの距離。負なら中心が既に円の内側。 */
export const trapEdgeDistance = (trapCx: number, trapCy: number, enemy: Enemy): number =>
  Math.hypot(enemy.x + enemy.width / 2 - trapCx, enemy.y + enemy.height / 2 - trapCy) - enemy.width / 2;

/** 体が円に触れているか(=捕獲対象か)。 */
export const trapReachesEnemy = (trapCx: number, trapCy: number, radius: number, enemy: Enemy): boolean =>
  trapEdgeDistance(trapCx, trapCy, enemy) <= radius;

/**
 * このトラップがこのフレームに捕獲する敵を選ぶ。
 * - 既に捕獲済み(hitEnemies)は除く
 * - 不倒の通常リーパーは対象外(深奥チェイサーは対象=既存の全経路と同じ規約)
 * - 体が円に触れているものだけ
 * - **体の縁が近い順**に並べ、残り捕獲枠(remaining)まで取る
 */
export const selectTrapTargets = (
  enemies: readonly Enemy[],
  trapCx: number,
  trapCy: number,
  radius: number,
  remaining: number,
  alreadyHit: ReadonlySet<string>,
): Enemy[] => {
  if (remaining <= 0) return [];
  return enemies
    .filter(e => e.type !== 'reaper' || e.reaperChaser)
    .filter(e => !alreadyHit.has(e.id))
    .map(e => ({ e, edge: trapEdgeDistance(trapCx, trapCy, e) }))
    .filter(h => h.edge <= radius)
    .sort((a, b) => a.edge - b.edge)
    .slice(0, remaining)
    .map(h => h.e);
};

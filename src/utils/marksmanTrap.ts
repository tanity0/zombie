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
import { enemyRangeRect, isBossType, isCorpse, isReaperFamily, isTerminalReaper } from './enemyUtils';

/** トラップ中心から敵の「体の縁」までの距離。負なら中心が既に円の内側。
 * v0.25.3202(社長報告「トラップが密着してなくても関係なく必中になってる」): ボス系は幅/2の円近似を
 * やめ、**当たり判定矩形(enemyRangeRect)の最近点**までの距離にする。巨体(例: ヨルムンガルド)は
 * 幅/2が150px超になり、円近似では離れていても常に「触れている」扱い=事実上の必中だった。
 * 近接/銃の射程と同じ「測る相手は判定矩形」(v0.25.3170)へ揃える。通常敵は従来どおり(挙動不変)。 */
export const trapEdgeDistance = (trapCx: number, trapCy: number, enemy: Enemy): number => {
  if (isBossType(enemy.type)) {
    const r = enemyRangeRect(enemy);
    const nx = Math.max(r.x, Math.min(trapCx, r.x + r.width));
    const ny = Math.max(r.y, Math.min(trapCy, r.y + r.height));
    return Math.hypot(trapCx - nx, trapCy - ny);
  }
  return Math.hypot(enemy.x + enemy.width / 2 - trapCx, enemy.y + enemy.height / 2 - trapCy) - enemy.width / 2;
};

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
    .filter(e => !isReaperFamily(e.type) || isTerminalReaper(e))
    .filter(e => !isCorpse(e)) // KILL吹き飛び(死体・SKILL_BUILD_REDESIGN.md §26-2): 捕獲対象から除外
    .filter(e => !alreadyHit.has(e.id))
    .map(e => ({ e, edge: trapEdgeDistance(trapCx, trapCy, e) }))
    .filter(h => h.edge <= radius)
    .sort((a, b) => a.edge - b.edge)
    .slice(0, remaining)
    .map(h => h.e);
};

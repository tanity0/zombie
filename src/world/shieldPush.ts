// B6(盾押し機構・research/AI_HUMANIZE.md §6・裁定済み#8「社長裁定2026-08-28」)。
//
// 社長の言葉:「プレイヤーが取りうる行動はできるだけ実装してさせないと意味がないので、
// 盾が押せないのはおかしい」。
//
// ## 何をするファイルか
// 設置型シールド(weaponType==='shield')を、所有者(プレイヤー/守護霊/幻影)が接触したまま
// 動いた時に押す/設置位置を是正するための**純関数**(renderer-agnostic・store非依存)。
// 「写しの口」を最初から共有ロジックにする(CLAUDE.md「アクター…判定はworld/store側に置く」)。
//
// ## 呼び出し側の責務(このファイルはここを持たない)
//  - 世界の壁(木/城/街プロップ/施設/lab壁等)の解決 — 各アクターの移動処理が既に持っている
//    ものを再利用する(プレイヤー=movePlayer、守護霊/幻影=各自のtick)。CLAUDE.mdの通り
//    「壁 / 衝突判定は game logic 側」に置き、ここは resolveAabb 済みの矩形を受け取るだけ。
//  - 所有者判定(`shieldOwnerKind`/`shieldOwnerId`)・接触判定(rectsOverlap)・敵ブロッカーの
//    列挙(死体/すり抜け敵を除く)は呼び出し側。
//
// ## このファイルが持つもの
//  1. `pushShieldRect`  : 動く盾 = 壁解決済みの候補矩形を、敵ブロッカーで resolveAabb
//     (=動いている盾は敵を押し出さない。押し先で重なるなら手前で止まる=ブルドーザー禁止)
//     → clampRectToPlayableArea(prevXあり=「移動」として跨ぎ扱い)。
//  2. `clampShieldPlacementRect` : 設置(配置)のクランプ。敵は見ない(押し出し概念が無い)・
//     prevX無し=アイテム/敵の湧きと同じ「その場に寄せる」スナップ(§6「設置位置も同時に是正」)。

import { resolveAabb, type Rect } from './obstacles';
import { clampRectToPlayableArea, type PlayableAreaCtx } from './playableArea';

/**
 * 動く盾の最終位置を返す(壁は解決済みの`wallResolved`を受け取る・敵ブロッカー+行ける帯はここで解決)。
 * @param wallResolved 世界の壁(木/城/lab壁等)を解決した後の候補矩形(w/hは盾のサイズ)。
 * @param blockingEnemies 押し出してはいけない敵のAABB(死体・すり抜け敵は呼び出し側で除外済み)。
 * @param ctx `clampRectToPlayableArea`と同じプレイヤブルエリア文脈。
 * @param prevX 押される前(=このフレーム開始時点)の盾の左上x。「移動」としてM0前進壁等の
 *   跨ぎ判定に使う(prevXが無いと配置と同じスナップになってしまうため必須)。
 */
export const pushShieldRect = (
  wallResolved: Rect,
  blockingEnemies: Rect[],
  ctx: PlayableAreaCtx,
  prevX: number,
): { x: number; y: number } => {
  const enemyResolved = blockingEnemies.length > 0
    ? resolveAabb(wallResolved, blockingEnemies)
    : { x: wallResolved.x, y: wallResolved.y };
  return clampRectToPlayableArea(enemyResolved.x, enemyResolved.y, wallResolved.width, wallResolved.height, ctx, prevX);
};

/**
 * 設置(配置)位置のクランプ。壁は解決済みの`wallResolved`を受け取り、行ける帯へ寄せるだけ
 * (敵は見ない=配置に「押し出し」の概念は無い。prevXも渡さない=湧き/配置と同じスナップ)。
 */
export const clampShieldPlacementRect = (
  wallResolved: Rect,
  ctx: PlayableAreaCtx,
): { x: number; y: number } =>
  clampRectToPlayableArea(wallResolved.x, wallResolved.y, wallResolved.width, wallResolved.height, ctx);

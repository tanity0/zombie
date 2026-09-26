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
//  - 所有者判定(`shieldOwnerKind`/`shieldOwnerId`)・接触判定(rectsOverlap)は呼び出し側。
//
// ## このファイルが持つもの
//  1. `pushShieldRect`  : 動く盾 = 壁解決済みの候補矩形を clampRectToPlayableArea(prevXあり=
//     「移動」として跨ぎ扱い)へ通すだけ。**敵は見ない**——動いている盾は従来どおり敵を押し出す
//     (社長裁定2026-08-28「そのブルドーザーってプレイヤーも可能?なら残して」=ブルドーザーは
//     存続。押し出し自体は既存の「設置型シールド処理」(敵→盾の毎フレームresolveAabb)がやる。
//     v0.25.3996で一時入れた「敵の手前で止まる」はv0.25.3997で撤回)。
//  2. `clampShieldPlacementRect` : 設置(配置)のクランプ。敵は見ない(押し出し概念が無い)。
//     `prevX` は任意——渡せば「配置も広義の移動」としてM0前進壁の跨ぎ判定に使う(検収監査・中4。
//     設置直後に前進壁のスナップで戦闘中の前進を没収しない=v3498と同じ趣旨)。渡さなければ
//     湧きと同じ「その場に寄せる」スナップになる。
//
// ## クランプの基準(検収監査・中3)
// 盾は背の高い/横に薄い矩形。`clampRectToPlayableArea` は矩形の**中心**を帯の判定基準にする
// (CLAUDE.mdの他アクターと共通の関数なので、この関数自体は変更しない)。盾はCLAUDE.mdの
// 足規約(衝突矩形の**下辺**=足)で扱うオブジェクトなので、中心基準のままだと帯の端で
// 最大 height/2 ぶんずれる(実測36px)。ここでは呼び出し側で「足を中心に見立てた高さ0の
// 代表矩形」を作ってクランプし、結果を実寸へ戻す(=足が帯の内側に収まることを保証する)。
// 横方向(x)は代表矩形でも実寸の width をそのまま使うので影響なし。

import { type Rect } from './obstacles';
import { clampRectToPlayableArea, type PlayableAreaCtx } from './playableArea';

/**
 * 盾の実寸矩形(top-left基準)を、足(下辺=y+height)基準でクランプする。
 * 内部で高さ0の代表矩形(y=足のy)を`clampRectToPlayableArea`へ渡し、結果を実寸のyへ戻す。
 * xはwidthをそのまま使うため実寸と同じ扱い(横方向に「足」概念は無い)。
 */
const clampShieldRectByFoot = (
  r: Rect, ctx: PlayableAreaCtx, prevX?: number,
): { x: number; y: number } => {
  const footY = r.y + r.height;
  const rep = clampRectToPlayableArea(r.x, footY, r.width, 0, ctx, prevX);
  return { x: rep.x, y: rep.y - r.height };
};

/**
 * 動く盾の最終位置を返す(壁は解決済みの`wallResolved`を受け取る・行ける帯はここで解決)。
 * 敵は見ない=動いている盾は敵を押し出す(既存の盾→敵の毎フレーム処理がそのまま担当。
 * ブルドーザー存続・社長裁定2026-08-28)。
 * @param wallResolved 世界の壁(木/城/lab壁等)を解決した後の候補矩形(w/hは盾のサイズ)。
 * @param ctx `clampRectToPlayableArea`と同じプレイヤブルエリア文脈。
 * @param prevX 押される前(=このフレーム開始時点)の盾の左上x。「移動」としてM0前進壁等の
 *   跨ぎ判定に使う(prevXが無いと配置と同じスナップになってしまうため必須)。
 */
export const pushShieldRect = (
  wallResolved: Rect,
  ctx: PlayableAreaCtx,
  prevX: number,
): { x: number; y: number } => clampShieldRectByFoot(wallResolved, ctx, prevX);

/**
 * 設置(配置)位置のクランプ。壁は解決済みの`wallResolved`を受け取り、行ける帯へ寄せるだけ
 * (敵は見ない=配置に「押し出し」の概念は無い)。
 * @param prevX 任意。渡すと「配置も移動の一種」としてM0前進壁の跨ぎ判定を適用する(検収監査・
 *   中4=戦闘中に前進した結果を、盾の設置スナップで没収しない・v3498と同じ趣旨)。省略時は
 *   従来どおり湧き/配置と同じ「その場に寄せる」スナップ。
 */
export const clampShieldPlacementRect = (
  wallResolved: Rect,
  ctx: PlayableAreaCtx,
  prevX?: number,
): { x: number; y: number } => clampShieldRectByFoot(wallResolved, ctx, prevX);

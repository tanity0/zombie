// ★「なぜこの敵は技に入らないのか」を1語で返す(社長の実機診断用・?debug=1 に出す)。
//
// 経緯: 社長の実機で「**何かの拍子に台本が動かなくなって、ただ寄ってくるだけになる**」が出たが、
// 設計チャットは**6条件で再現できなかった**(撃たれ続ける/クリ連打/プレイヤー移動/距離5種/敵2〜10体/
// カウンター連打)。**社長の環境でしか出ない**ので、**その場で理由が読める道具**が要る。
//
// ★状態を並べるだけにしない。 状態の羅列は「読む側が推理する」道具で、実機の小さい画面では使えない。
// **どのゲートで弾かれているかを1語で出す**——そして **`OK` が出ているのに技に入らない個体が居たら、
// それが探しているもの**。この1語のために作る。
//
// ★判定は**本物の述語を呼ぶ**(自作の式を並べない)。式が本物とズレたら、この道具は嘘をつく。
import type { Enemy } from '../types/game';
import { canStartBite, isBiteInterruptedByMove } from './enemyBite';
import { isEnemyAttacking } from './combatFeel';

export type IdleReason =
  | 'ACT'      // いま技を出している(止まっていない)
  | 'STUN'     // 気絶中(クリティカル/崩れ)
  | 'ROOT'     // 罠などの拘束中
  | 'LIFT'     // 近接フィニッシュの浮き中
  | 'DORM'     // まだ起きていない(dormant)
  | 'KB'       // ノックバック中
  | 'HITSTUN'  // 被弾硬直中
  | 'CD'       // 技後CD / 噛みつきの硬直
  | 'SLOT'     // 枠(同時に構えられる2体)が取れていない
  | 'FAR'      // 発火距離の外
  | 'PHASE'    // 他の相の最中で弾かれている
  | 'OK';      // ★入れるのに入っていない=本物の不具合

/**
 * @param slotGranted この個体が枠を持っているか(`deriveChaffMoveGrants` の結果。未使用の型は true を渡す)
 * @param bandOuterPx この型が技に入れる最大距離(これより遠ければ FAR)
 */
export const enemyIdleReason = (
  e: Enemy,
  distToPlayerPx: number,
  gameTime: number,
  nowMs: number,
  slotGranted: boolean,
  bandOuterPx: number,
): IdleReason => {
  if (isEnemyAttacking(e, gameTime)) return 'ACT';
  // ★2026-09-19: 実機の1枚が `STUN` を出したのに**残り時間が空**で、原因が
  // 気絶/拘束/浮き/眠りのどれか分からなかった。**4つに割って1語で読めるようにする。**
  // (この割りが無ければ `liftUntil` の時計違い=真因に辿り着けなかった。)
  if (e.dormant === true) return 'DORM';
  if (e.liftUntil !== undefined && nowMs < e.liftUntil) return 'LIFT';
  if (e.rootUntil !== undefined && gameTime < e.rootUntil) return 'ROOT';
  if (e.stunUntil !== undefined && gameTime < e.stunUntil) return 'STUN';
  if (e.knockbackUntil !== undefined && nowMs < e.knockbackUntil) return 'KB';
  if (e.hitStunUntil !== undefined && nowMs < e.hitStunUntil) return 'HITSTUN';
  if (e.chaffMoveCdUntil !== undefined && gameTime < e.chaffMoveCdUntil) return 'CD';
  if (gameTime < (e.biteReadyAt ?? 0)) return 'CD';
  if (e.aiReadyAt !== undefined && gameTime < e.aiReadyAt) return 'CD';
  if (distToPlayerPx > bandOuterPx) return 'FAR';
  if (!slotGranted) return 'SLOT';
  if (isBiteInterruptedByMove(e)) return 'PHASE';
  if (!canStartBite(e, gameTime, nowMs)) return 'PHASE';
  return 'OK';
};

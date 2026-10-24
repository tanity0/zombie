// ★★赤い予告の4つの掟(CLAUDE.md・社長指示2026-09-18)への是正のうち、城ボス(ジャイアント/
// クアッド/グレン)の分。PACING_PUZZLE.md §18-1 C-2「氷結波」・C-8「氷の横薙ぎの実行相」。
//
// レンダラ非依存の葉(pixiScene.ts から読む)。**判定は1つも変えていない**——ここが決めるのは
// 「赤をどの位相で流すか」だけで、半径・帯の寸法・尺は呼び出し側(=判定と同じ定数)が渡す。
import { loopSweepProg } from './circleSweep';

/** 溜めの進行(0→1・1=技の発生)。全サイト共通の式 `1 −(残り)÷(溜めの実効長)`。 */
const windupProg01 = (remainMs: number, windupMs: number): number =>
  Math.max(0, Math.min(1, 1 - remainMs / Math.max(1, windupMs)));

/**
 * ★C-8: **薙ぎ払い系(帯が回転する持続判定技)の窓**。
 *
 * 城ボスにはこの形の技が**双子**である——「掃射」(`g-sweepbeam`)と「氷の横薙ぎ」(`g-quad-breath`)。
 * どちらも 溜め(扇を先出し)→ 実行(その瞬間の細い帯が回転して薙ぐ・**毎フレーム判定が生きている**)。
 * v0.25.4456以前は**掃射にだけ**実行相の周回窓が付いていて、氷の横薙ぎは
 * `drawGiantCapsuleZone(..., prog省略)` = **窓なしの静的な帯**だった(横展開漏れ)。
 *
 * ⇒ **双子は同じ式**。溜めは 0→1(消え切り=実行開始)、実行相は周期ループ(§11-4)。
 */
export const giantSweepWindowProg = (
  inWindup: boolean, remainMs: number, windupEffMs: number, activeEffMs: number,
): number => (inWindup ? windupProg01(remainMs, windupEffMs) : loopSweepProg(activeEffMs, remainMs));

/**
 * ★C-2: 「氷結波」(`g-nova`)の溜めの流星。
 *
 * v0.25.4456以前は**輪郭2本を描くだけ**(塗りも流れも無い)=掟①違反だった。
 * 塗り(流星)を掛けるのは**開始半径の輪**——氷結波が最初に当たるのはそこで、実行相は
 * そこから外へ広がる。到達半径まで塗ると「赤いのに当たらない」(内側=通過済みは当たらない)になる。
 *
 * 返り値 `null` = 溜めではない(赤い流星は出さない)。
 */
export const giantNovaWindupProg = (
  phase: string, remainMs: number, windupEffMs: number,
): number | null =>
  phase === 'g-nova-windup' ? windupProg01(remainMs, windupEffMs) : null;

// 叫喚の叫び(社長支給2026-09-23)のコマ選び。**純関数だけ**=ヘッドレスで検査できる。
//
// ★区間は1つ(`aiPhase==='scream'`=溜め2秒)なので、3区間の核(`sheetSections`)の
//   **最後の区間だけを使う**形で呼ぶ。こうすると「出し切ったら null(=立ち絵へ戻す)」という
//   既に検査済みの振る舞いをそのまま借りられる(同じ穴を2つ持たない)。
// ★**尺は持たない**。進み具合は呼び手が判定側の時計から出す(CLAUDE.md「絵の尺と相の尺を
//   別々に持たない」——v0.25.4608 で3件直した型)。
import { sectionFrame } from './sheetSections';

export const enemyScreamFrame = (frames: number, prog: number): number | null =>
  (frames > 1 ? sectionFrame([0, 0, frames], 2, prog) : null);

/** 出し切った後に留めたいコマ(=最後のコマ)。 */
export const enemyScreamLastFrame = (frames: number): number => Math.max(0, frames - 1);

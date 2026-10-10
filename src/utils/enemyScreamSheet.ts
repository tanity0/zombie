// 叫喚の叫び(社長支給2026-09-23)のコマ選び。**純関数だけ**=ヘッドレスで検査できる。
//
// ★区間は1つ(`aiPhase==='scream'`=溜め2秒)なので、3区間の核(`sheetSections`)の
//   **最後の区間だけを使う**形で呼ぶ。こうすると「出し切ったら null(=立ち絵へ戻す)」という
//   既に検査済みの振る舞いをそのまま借りられる(同じ穴を2つ持たない)。
// ★**尺は持たない**。進み具合は呼び手が判定側の時計から出す(CLAUDE.md「絵の尺と相の尺を
//   別々に持たない」——v0.25.4608 で3件直した型)。
import { sectionFrame } from './sheetSections';
import { counterRewindFrame } from './counterRewind';

export const enemyScreamFrame = (frames: number, prog: number): number | null =>
  (frames > 1 ? sectionFrame([0, 0, frames], 2, prog) : null);

/** 出し切った後に留めたいコマ(=最後のコマ)。 */
export const enemyScreamLastFrame = (frames: number): number => Math.max(0, frames - 1);

/**
 * ★叫び終わりの**戻り**(社長裁定2026-09-23「a」)。
 *
 * なぜ要るか: 支給のシートは**前かがみで終わる**(絵の高さ 110)。立ち絵は真っ直ぐ(128)なので、
 * 発動の瞬間に**背丈が16%跳ねる**。戻りのコマは支給に含まれていないので、
 * **最後のコマから0コマ目へ逆再生して戻す**(絵を足さずに戻れる)。
 *
 * ★**等速で戻さない**(CLAUDE.md 慣性MUST)。巻き戻しの位相はカウンターと**同じ関数**を借りる
 *   ——出だしが速く、終わりで収まる(叫び切った体が脱力して戻る動き)。
 * @param sinceEndMs 叫びが発動してからの経過(ゲーム内時刻)。
 * @returns コマ番号。戻り切ったら `null`(=立ち絵/歩きへ返す)。
 */
export const SCREAM_RELEASE_MS = 300;

export const enemyScreamReleaseFrame = (
  frames: number, sinceEndMs: number, durMs: number = SCREAM_RELEASE_MS,
): number | null => (frames > 1 ? counterRewindFrame(frames - 1, sinceEndMs, durMs) : null);

// スキル発動の表示(社長指示2026-11-01「スキル発動時は通信欄下に表示したい」→「効いた瞬間に新しく出す」)。
// 純関数だけ(store も React も読まない)。並べ方・間引き・消える時刻をここで決め、store と表示が同じ物を読む。
import type { SkillKey } from '../types/game';

/** 1行が出ている長さ(ms・実時間)。 */
export const SKILL_PROC_SHOW_MS = 2400;
/** 同じスキルを続けて出さない間隔(ms・実時間)。跳弾・吸血のように何度も効く物で行が埋まらないように。 */
export const SKILL_PROC_REPEAT_MS = 6000;
/** 同時に出す行の上限(新しい物を残す)。 */
export const SKILL_PROC_MAX_ROWS = 3;

export interface SkillProcEntry { id: number; key: SkillKey; at: number }

/**
 * 発動を1つ足した後の並び。同じスキルが SKILL_PROC_REPEAT_MS 以内に出ていれば null(=何も変えない)。
 * 消えた行(SKILL_PROC_SHOW_MS 経過)は落とし、上限を超えたら古い方から落とす。並びは古い→新しい(上→下)。
 */
export const pushSkillProc = (
  feed: readonly SkillProcEntry[], lastAt: Readonly<Partial<Record<SkillKey, number>>>, key: SkillKey, now: number, id: number,
): { feed: SkillProcEntry[]; lastAt: Partial<Record<SkillKey, number>> } | null => {
  const prev = lastAt[key];
  if (prev !== undefined && now - prev < SKILL_PROC_REPEAT_MS) return null;
  const alive = feed.filter(e => now - e.at < SKILL_PROC_SHOW_MS);
  const next = [...alive, { id, key, at: now }].slice(-SKILL_PROC_MAX_ROWS);
  return { feed: next, lastAt: { ...lastAt, [key]: now } };
};

/** 次に行が消える時刻(表示側の再描画の目覚まし)。行が無ければ null。 */
export const nextSkillProcExpiry = (feed: readonly SkillProcEntry[]): number | null =>
  feed.length ? Math.min(...feed.map(e => e.at + SKILL_PROC_SHOW_MS)) : null;

// スキル発動の表示(社長指示2026-11-01「スキル発動時は通信欄下に表示したい」→「効いた瞬間に新しく出す」)。
// 純関数だけ(store も React も読まない)。並べ方・数え方・消える時刻をここで決め、store と表示が同じ物を読む。
// 時刻はすべて実時間(Date.now)。一時停止の間は store が shiftSkillProcFeed で止めていた分だけ先送りする。
import type { SkillKey } from '../types/game';

/** 1行が出ている長さ(ms)。同じスキルがまた効くと、その時からこの長さに延びる。 */
export const SKILL_PROC_SHOW_MS = 2400;
/** 消える動き(左へ引っ込みながら行の高さを畳む)の尺。出ている長さの最後のこの部分。 */
export const SKILL_PROC_EXIT_MS = 320;
/** 同時に出す行の上限。超えたら一番古い行を消える動きへ回す(パッとは消さない)。 */
export const SKILL_PROC_MAX_ROWS = 3;
/** 同じ瞬間(この間隔以内)に効いた行どうしは、入ってくる時刻をこれだけずらす。 */
export const SKILL_PROC_STAGGER_MS = 80;

/**
 * 表示するスキル=確率で起きるものだけ(社長指示2026-11-02「確実に発動するタイプは表示しない。吸血とか」)。
 * 条件を満たせば必ず起きるもの(吸血・死神・処刑・縮地・カウンターマスター・反射神経・グラビティショット・
 * パニッシャー・弁慶・弾幕の王・ボムカウンター・ラストマガジン)は出さない。新しく確率のスキルへ表示を足す時はここへ足す。
 */
export const SKILL_PROC_CHANCE_KEYS: ReadonlySet<SkillKey> = new Set<SkillKey>([
  'overclock', 'ricochet', 'echo-shot', 'rescue-signal', 'bomber', 'seeker', 'poi-thrall', 'ghost-shooter', 'fire-shooter',
]);
export const isSkillProcShown = (key: SkillKey): boolean => SKILL_PROC_CHANCE_KEYS.has(key);

export interface SkillProcEntry {
  id: number;
  key: SkillKey;
  /** 行が入ってきた時刻。 */
  at: number;
  /** 消え終わる時刻(消える動きはこの SKILL_PROC_EXIT_MS 前から)。 */
  until: number;
  /** 入ってくる動きの遅れ(同時に効いた行の時間差)。 */
  delay: number;
  /** この行が出ている間に効いた回数(2以上で「×N」)。 */
  hits: number;
}

/** 行が今出ているか。 */
export const skillProcAlive = (e: SkillProcEntry, now: number): boolean => now < e.until;
/** 行が消える動きに入っているか。 */
export const skillProcLeaving = (e: SkillProcEntry, now: number): boolean => now >= e.until - SKILL_PROC_EXIT_MS;

/**
 * 発動を1つ足した後の並び(古い→新しい=上→下)。
 * - 同じスキルの行がまだ出ていれば、行は増やさずに数を+1して出ている長さを延ばす(効くたびに見える)。
 * - 新しい行を足して上限を超えたら、一番古い(まだ消え始めていない)行を今から消える動きへ回す。
 * - 消え終わった行は落とす。
 */
export const pushSkillProc = (
  feed: readonly SkillProcEntry[], key: SkillKey, now: number, id: number,
): SkillProcEntry[] => {
  const alive = feed.filter(e => skillProcAlive(e, now));
  const same = alive.find(e => e.key === key && !skillProcLeaving(e, now));
  if (same) return alive.map(e => (e === same ? { ...e, hits: e.hits + 1, until: now + SKILL_PROC_SHOW_MS } : e));
  const last = alive[alive.length - 1];
  const delay = last && now - last.at < SKILL_PROC_STAGGER_MS ? last.delay + SKILL_PROC_STAGGER_MS : 0;
  const next = [...alive, { id, key, at: now, until: now + delay + SKILL_PROC_SHOW_MS, delay, hits: 1 }];
  const staying = next.filter(e => !skillProcLeaving(e, now));
  if (staying.length > SKILL_PROC_MAX_ROWS) {
    const oldest = staying[0];
    return next.map(e => (e === oldest ? { ...e, until: now + SKILL_PROC_EXIT_MS } : e));
  }
  return next;
};

/** 一時停止していた分(ms)だけ、全部の行の時刻を先送りする(止めている間に流れて消えない)。 */
export const shiftSkillProc = (feed: readonly SkillProcEntry[], ms: number): SkillProcEntry[] =>
  feed.map(e => ({ ...e, at: e.at + ms, until: e.until + ms }));

/** 次に表示を描き直す時刻(どれかの行が消える動きに入る/消え終わる)。行が無ければ null。 */
export const nextSkillProcWake = (feed: readonly SkillProcEntry[], now: number): number | null => {
  let t: number | null = null;
  for (const e of feed) {
    for (const c of [e.until - SKILL_PROC_EXIT_MS, e.until]) if (c > now && (t === null || c < t)) t = c;
  }
  return t;
};

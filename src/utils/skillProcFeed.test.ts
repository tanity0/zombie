import { describe, it, expect } from 'vitest';
import { pushSkillProc, nextSkillProcExpiry, SKILL_PROC_SHOW_MS, SKILL_PROC_REPEAT_MS, SKILL_PROC_MAX_ROWS } from './skillProcFeed';

describe('スキル発動の表示の並び', () => {
  it('足すと下(末尾)に並ぶ', () => {
    const a = pushSkillProc([], {}, 'ricochet', 1000, 1)!;
    const b = pushSkillProc(a.feed, a.lastAt, 'vampire', 1100, 2)!;
    expect(b.feed.map(e => e.key)).toEqual(['ricochet', 'vampire']);
  });
  it('同じスキルは間隔の間は出さない。間隔が明けたらまた出る', () => {
    const a = pushSkillProc([], {}, 'ricochet', 1000, 1)!;
    expect(pushSkillProc(a.feed, a.lastAt, 'ricochet', 1000 + SKILL_PROC_REPEAT_MS - 1, 2)).toBeNull();
    expect(pushSkillProc(a.feed, a.lastAt, 'ricochet', 1000 + SKILL_PROC_REPEAT_MS, 2)).not.toBeNull();
  });
  it('上限を超えたら古い方から落ち、出し終わった行も落ちる', () => {
    let s = { feed: [] as ReturnType<typeof pushSkillProc> extends infer R ? R extends { feed: infer F } ? F : never : never, lastAt: {} };
    const keys = ['ricochet', 'vampire', 'reflex', 'bomber'] as const;
    keys.forEach((k, i) => { s = pushSkillProc(s.feed, s.lastAt, k, 1000 + i * 10, i)!; });
    expect(s.feed.length).toBe(SKILL_PROC_MAX_ROWS);
    expect(s.feed[0].key).toBe('vampire');
    const later = pushSkillProc(s.feed, s.lastAt, 'seeker', 1000 + SKILL_PROC_SHOW_MS + 100, 9)!;
    expect(later.feed.map(e => e.key)).toEqual(['seeker']);
  });
  it('次に消える時刻=一番古い行の出し終わり', () => {
    expect(nextSkillProcExpiry([])).toBeNull();
    expect(nextSkillProcExpiry([{ id: 1, key: 'reflex', at: 500 }, { id: 2, key: 'bomber', at: 700 }])).toBe(500 + SKILL_PROC_SHOW_MS);
  });
});

import { describe, it, expect } from 'vitest';
import {
  pushSkillProc, shiftSkillProc, nextSkillProcWake, skillProcAlive, skillProcLeaving,
  SKILL_PROC_SHOW_MS, SKILL_PROC_EXIT_MS, SKILL_PROC_MAX_ROWS, SKILL_PROC_STAGGER_MS, type SkillProcEntry,
} from './skillProcFeed';

describe('スキル発動の表示の並び', () => {
  it('足すと下(末尾)に並ぶ', () => {
    const f = pushSkillProc(pushSkillProc([], 'ricochet', 1000, 1), 'vampire', 1500, 2);
    expect(f.map(e => e.key)).toEqual(['ricochet', 'vampire']);
  });
  it('同じスキルがまた効くと、行は増えずに数が増え、出ている長さが延びる', () => {
    const a = pushSkillProc([], 'ricochet', 1000, 1);
    const b = pushSkillProc(a, 'ricochet', 2000, 2);
    expect(b.length).toBe(1);
    expect(b[0].hits).toBe(2);
    expect(b[0].until).toBe(2000 + SKILL_PROC_SHOW_MS);
  });
  it('同じ瞬間に効いた行は、入ってくる時刻をずらす', () => {
    const f = pushSkillProc(pushSkillProc([], 'ricochet', 1000, 1), 'vampire', 1000 + SKILL_PROC_STAGGER_MS - 1, 2);
    expect(f[1].delay).toBe(SKILL_PROC_STAGGER_MS);
  });
  it('上限を超えたら一番古い行はパッと消えず、今から消える動きに入る', () => {
    let f: SkillProcEntry[] = [];
    (['ricochet', 'vampire', 'reflex'] as const).forEach((k, i) => { f = pushSkillProc(f, k, 1000 + i * 200, i); });
    f = pushSkillProc(f, 'bomber', 1700, 9);
    expect(f.length).toBe(SKILL_PROC_MAX_ROWS + 1);
    expect(skillProcLeaving(f[0], 1700)).toBe(true);
    expect(skillProcAlive(f[0], 1700 + SKILL_PROC_EXIT_MS)).toBe(false);
    expect(f.slice(1).every(e => !skillProcLeaving(e, 1700))).toBe(true);
  });
  it('一時停止していた分だけ先送りされる', () => {
    const f = shiftSkillProc(pushSkillProc([], 'reflex', 1000, 1), 5000);
    expect(f[0].until).toBe(1000 + 5000 + SKILL_PROC_SHOW_MS);
  });
  it('次に描き直す時刻=消える動きに入る時刻/消え終わる時刻のうち一番近い物', () => {
    const f = pushSkillProc([], 'reflex', 1000, 1);
    expect(nextSkillProcWake(f, 1000)).toBe(1000 + SKILL_PROC_SHOW_MS - SKILL_PROC_EXIT_MS);
    expect(nextSkillProcWake(f, 1000 + SKILL_PROC_SHOW_MS - SKILL_PROC_EXIT_MS)).toBe(1000 + SKILL_PROC_SHOW_MS);
    expect(nextSkillProcWake([], 0)).toBeNull();
  });
});

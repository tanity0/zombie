import { describe, it, expect } from 'vitest';
import {
  pushSkillProc, shiftSkillProc, nextSkillProcWake, skillProcAlive, skillProcLeaving,
  SKILL_PROC_SHOW_MS, SKILL_PROC_EXIT_MS, SKILL_PROC_MAX_ROWS, SKILL_PROC_STAGGER_MS, TECH_SECRET_SHOW_MS, isTechProcKey, newestSkillProcId, type SkillProcEntry,
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
    (['ricochet', 'vampire', 'reflex', 'seeker'] as const).forEach((k, i) => { f = pushSkillProc(f, k, 1000 + i * 150, i); });
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

describe('表示するのは確率で起きるスキルだけ(社長指示2026-11-02)', () => {
  it('吸血など確実に起きるものは出さず、確率のものは出す', async () => {
    const { isSkillProcShown } = await import('./skillProcFeed');
    for (const k of ['vampire', 'reaper', 'execution-shock', 'shukuchi', 'counter-master', 'reflex', 'gravity-shot', 'punisher', 'benkei', 'barrage-king', 'bomb-counter', 'last-magazine'] as const) {
      expect(isSkillProcShown(k), k).toBe(false);
    }
    for (const k of ['overclock', 'ricochet', 'echo-shot', 'rescue-signal', 'bomber', 'seeker', 'poi-thrall', 'ghost-shooter', 'fire-shooter'] as const) {
      expect(isSkillProcShown(k), k).toBe(true);
    }
  });
});

describe('格闘の技の行(スキルと同じ並びに積む)', () => {
  it('同じ技を続けて出すと、1行のまま数が増える(飛び蹴りの連続)', () => {
    let f = pushSkillProc([], 'tech:kick', 1000, 1);
    f = pushSkillProc(f, 'tech:kick', 1300, 2);
    f = pushSkillProc(f, 'tech:kick', 1700, 3);
    expect(f.length).toBe(1);
    expect(f[0].hits).toBe(3);
    expect(f[0].until).toBe(1700 + SKILL_PROC_SHOW_MS);
  });
  it('別の技を挟むと、同じ技でも新しい行になる(出した順が読める)', () => {
    let f = pushSkillProc([], 'tech:kick', 1000, 1);
    f = pushSkillProc(f, 'tech:stomp', 1400, 2);
    f = pushSkillProc(f, 'tech:kick', 1800, 3);
    expect(f.map(e => e.key)).toEqual(['tech:kick', 'tech:stomp', 'tech:kick']);
    expect(f.every(e => e.hits === 1)).toBe(true);
  });
  it('スキルも技も同じ扱い: 合わせて上限を超えたら、一番古い行が押し出される(社長裁定2026-11-11)', () => {
    let f = pushSkillProc([], 'ricochet', 1000, 1);
    f = pushSkillProc(f, 'tech:kick', 1200, 2);
    f = pushSkillProc(f, 'tech:stomp', 1400, 3);
    f = pushSkillProc(f, 'tech:kiko', 1600, 4);
    expect(f.filter(e => !skillProcLeaving(e, 1600)).length).toBe(SKILL_PROC_MAX_ROWS); // ちょうど上限=まだ押し出さない
    f = pushSkillProc(f, 'tech:guard', 1800, 5);
    expect(skillProcLeaving(f[0], 1800)).toBe(true); // 一番古い行(スキルでも)が消える動きへ
    expect(f.filter(e => !skillProcLeaving(e, 1800)).map(e => e.key)).toEqual(['tech:kick', 'tech:stomp', 'tech:kiko', 'tech:guard']);
  });
  it('間にスキルの行が挟まっても、技どうしの順番だけを見てまとめる', () => {
    let f = pushSkillProc([], 'tech:kick', 1000, 1);
    f = pushSkillProc(f, 'overclock', 1300, 2);
    f = pushSkillProc(f, 'tech:kick', 1300, 3);
    expect(f.map(e => e.key)).toEqual(['tech:kick', 'overclock']);
    expect(f[0].hits).toBe(2);
  });
  it('消え始めた技の行にはまとめない(新しい行を足す)', () => {
    let f = pushSkillProc([], 'tech:kiko', 1000, 1);
    const late = 1000 + SKILL_PROC_SHOW_MS - SKILL_PROC_EXIT_MS + 1;
    f = pushSkillProc(f, 'tech:kiko', late, 2);
    expect(f.length).toBe(2);
    expect(f[1].hits).toBe(1);
  });
  it('スキルの行のまとめ方は今までどおり(間に別の行があっても同じスキルは1行)', () => {
    let f = pushSkillProc([], 'ricochet', 1000, 1);
    f = pushSkillProc(f, 'tech:kick', 1200, 2);
    f = pushSkillProc(f, 'ricochet', 1400, 3);
    expect(f.map(e => e.key)).toEqual(['ricochet', 'tech:kick']);
    expect(f[0].hits).toBe(2);
  });
  it('いま出した技の行が「一番新しい行」: 後からスキルの行が足されても、同じ技をもう一度出せばその行が新しい', () => {
    let f = pushSkillProc([], 'tech:kick', 1000, 1);
    f = pushSkillProc(f, 'overclock', 1000, 2); // 技の行の後に、返ってきた行
    expect(newestSkillProcId(f)).toBe(2);
    f = pushSkillProc(f, 'tech:kick', 1400, 3); // 同じ行にまとまる(行は増えない)
    expect(f.length).toBe(2);
    expect(newestSkillProcId(f)).toBe(1);
    expect(newestSkillProcId([])).toBeNull();
  });
  it('一時停止の先送りは「最後に効いた時刻」も一緒に送る', () => {
    const f = shiftSkillProc(pushSkillProc([], 'tech:kick', 1000, 1), 500);
    expect(f[0].lastAt).toBe(1500);
  });
  it('秘奥義の行は他より長く残る', () => {
    const f = pushSkillProc([], 'tech:secret', 1000, 1);
    expect(f[0].until).toBe(1000 + TECH_SECRET_SHOW_MS);
    expect(TECH_SECRET_SHOW_MS).toBeGreaterThan(SKILL_PROC_SHOW_MS);
  });
  it('技の鍵とスキルの鍵は見分けられる', () => {
    expect(isTechProcKey('tech:guard')).toBe(true);
    expect(isTechProcKey('ricochet')).toBe(false);
  });
});

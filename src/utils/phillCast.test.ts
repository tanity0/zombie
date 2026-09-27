// ★フィルの「演出1」(魔法の詠唱)の送り。社長支給2026-09-27「最後数コマだけピンポンして(余韻)」。
import { describe, it, expect } from 'vitest';
import { ENEMY_FRAME_OFFSETS, PHILL_CAST_SHEET, PHILL_CAST_SHEETS, phillCastFrame, phillCastTech, phillCastSpecFor, phillReleaseFrame } from './enemySheets';

describe('フィルの演出1(魔法の詠唱)', () => {
  it('0→15 を一方向に流し、その後は 11〜15 を往復する(継ぎ目で同じコマが2回続かない)', () => {
    const seq = Array.from({ length: 32 }, (_, s) => phillCastFrame(s * 100 + 1, 100));
    expect(seq.slice(0, 16)).toEqual(Array.from({ length: 16 }, (_, i) => i));
    expect(seq.slice(16, 28)).toEqual([14, 13, 12, 11, 12, 13, 14, 15, 14, 13, 12, 11]);
    for (let i = 1; i < seq.length; i++) expect(seq[i]).not.toBe(seq[i - 1]);
    for (const f of seq) { expect(f).toBeGreaterThanOrEqual(0); expect(f).toBeLessThan(PHILL_CAST_SHEET.frames); }
    for (const f of seq.slice(16)) expect(f).toBeGreaterThanOrEqual(PHILL_CAST_SHEET.loopFrom);
  });
  it('経過が負・非数なら先頭コマ', () => {
    expect(phillCastFrame(-50, 75)).toBe(0);
    expect(phillCastFrame(Number.NaN, 75)).toBe(0);
  });
  it('演出1の技は空から来る魔法4つ(社長選択)。★裁きの光は檻(cage)の州で動くので cage も演出1', () => {
    for (const st of ['phill-lightrain-windup', 'phill-meteor-active', 'phill-summon-windup', 'phill-cage-windup', 'phill-cage-recover']) {
      expect(phillCastSpecFor(st)?.spec.name, st).toBe('phill-cast1');
    }
    for (const st of ['phill-wingslash-active', 'phill-dive-windup', 'chase', undefined]) {
      expect(phillCastTech(st), String(st)).toBeNull();
    }
  });
});

describe('フィルの演出2(手を前に出す)', () => {
  const SP = PHILL_CAST_SHEETS[1];
  it('手の先から前へ飛ばす技(槍の扇・羽根撃ち・金の輪・輪投げ)で使う', () => {
    for (const st of ['phill-lancefan-windup', 'phill-feathershot-recover', 'phill-goldring-active', 'phill-ringtoss-out']) {
      expect(phillCastSpecFor(st)?.spec.name, st).toBe('phill-cast2');
    }
  });
  it('溜めの間は 0〜11 を割り付け、12 以降(放つ姿)は出さない', () => {
    const seen = new Set<number>();
    for (let p = 0; p < 1; p += 0.01) seen.add(phillReleaseFrame(SP, p, 0, 90));
    expect(Math.min(...seen)).toBe(0);
    expect(Math.max(...seen)).toBe(SP.loopFrom - 1);
  });
  it('★発動と同時に 12(放つ姿)→ 以後は 12〜15 を往復', () => {
    expect(phillReleaseFrame(SP, null, 0, 90)).toBe(SP.loopFrom);
    const seq = Array.from({ length: 13 }, (_, s) => phillReleaseFrame(SP, null, s * 90 + 1, 90));
    expect(seq).toEqual([12, 13, 14, 15, 14, 13, 12, 13, 14, 15, 14, 13, 12]);
  });
  it('2枚とも同じ立ち絵・同じ背丈合わせ・16コマ', () => {
    for (const c of PHILL_CAST_SHEETS) { expect(c.idle).toBe('phill'); expect(c.bodyH).toBe(187); expect(c.frames).toBe(16); }
    expect(PHILL_CAST_SHEET.name).toBe('phill-cast1');
  });
});

describe('★体(胴)基準のずらし(フィル・社長指示2026-09-27)', () => {
  it('表のシートはコマ数と同じ長さ', () => {
    const frames: Record<string, number> = { 'phill-idle': 14, 'phill-cast1': 16, 'phill-cast2': 16 };
    for (const [name, offs] of Object.entries(ENEMY_FRAME_OFFSETS)) expect(offs.length, name).toBe(frames[name]);
  });
  it('基準(待機0コマ目)はずらさない', () => {
    expect(ENEMY_FRAME_OFFSETS['phill-idle'][0]).toEqual([0, 0]);
  });
});

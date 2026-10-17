// ★ジブリルの「振る」「投げる」のシート(社長支給2026-09-29)。州→コマの割り付け。
import { describe, it, expect } from 'vitest';
import angelTickSrc from './angelBossTick.ts?raw';
import { BOSS_PHASE_SHEETS, ENEMY_FRAME_OFFSETS, bossPhaseFor, bossPhaseFrame, idleSheetName } from './enemySheets';
import { ANGEL_JIBRIL_TUNING as JB } from './angelScript';

const THROW = ['lance-windup', 'lance-recover', 'lantern-windup', 'lantern', 'lantern-recover'];
const SWING = ['volley-windup', 'volley', 'volley-recover', 'consecrate-windup', 'consecrate-recover', 'warp-windup', 'warp-recover'];
const RELEASE = 6; // 投げるシートで「ランタンが手を離れる」コマ

describe('ジブリルのシート', () => {
  it('技の州は全部どちらかのシートを持つ(ランタンレーザー・ランタン爆弾=投げる / それ以外=振る)', () => {
    for (const st of THROW) expect(bossPhaseFor('jibril', st)?.spec.name, st).toBe('jibril-throw');
    for (const st of SWING) expect(bossPhaseFor('jibril', st)?.spec.name, st).toBe('jibril-swing');
    for (const st of ['chase', undefined]) expect(bossPhaseFor('jibril', st), String(st)).toBeNull();
  });
  it('表の州名はジブリルの台本に実在する', () => {
    for (const spec of BOSS_PHASE_SHEETS.filter(s => s.idle === 'jibril')) for (const ph of spec.phases) {
      expect(angelTickSrc.includes(`'${ph.state}'`), ph.state).toBe(true);
    }
  });
  it('コマは範囲内・胴のずらしはコマ数ぶん', () => {
    for (const spec of BOSS_PHASE_SHEETS.filter(s => s.idle === 'jibril')) {
      expect(ENEMY_FRAME_OFFSETS[spec.name]?.length, spec.name).toBe(spec.frames);
      for (const ph of spec.phases) for (const f of [...ph.seq, ...(ph.finale ?? [])]) {
        expect(f).toBeGreaterThanOrEqual(0); expect(f).toBeLessThan(spec.frames);
      }
    }
    expect(ENEMY_FRAME_OFFSETS[idleSheetName('jibril')]?.length).toBe(16);
  });
  it('★放つコマ(6)は、ランタン/火が実際に出る瞬間に毎回出る(周期と回数は台本の数字と同じ)', () => {
    const lance = bossPhaseFor('jibril', 'lance-windup')!.phase;
    expect(lance.periodMs).toBe(JB.lance.intervalMs);
    expect(lance.cycles).toBe(JB.lance.count);
    for (let i = 0; i < JB.lance.count; i++) expect(bossPhaseFrame(lance, 0, i * JB.lance.intervalMs + 1, 90), `lance ${i}`).toBe(RELEASE);
    // 3本目を放った後は空の手(10)で止まる(待ちが長くても再び掴まない)。
    expect(bossPhaseFrame(lance, 0, 7900, 90)).toBe(10);

    const bomb = bossPhaseFor('jibril', 'lantern')!.phase;
    expect(bomb.periodMs).toBe(JB.lantern.fireGapMs);
    // 州の長さの中で置かれる火の数=回数(0, gap, 2gap, … < ms)。
    expect(bomb.cycles).toBe(Math.ceil(JB.lantern.ms / JB.lantern.fireGapMs));
    for (let i = 0; i < bomb.cycles!; i++) expect(bossPhaseFrame(bomb, 0, i * JB.lantern.fireGapMs + 1, 90), `bomb ${i}`).toBe(RELEASE);
    // 放つコマの直前は振りかぶり(5)=溜めの終わりから放つ瞬間まで途切れない。
    const wind = bossPhaseFor('jibril', 'lantern-windup')!.phase;
    expect(bossPhaseFrame(wind, 0.999, 0, 90)).toBe(5);
    expect(bossPhaseFrame(bomb, 0, JB.lantern.fireGapMs - 1, 90)).toBe(5);
  });
});

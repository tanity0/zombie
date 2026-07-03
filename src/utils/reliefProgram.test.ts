import { describe, it, expect } from 'vitest';
import { selectReliefProgram, RELIEF_LATE_GAME_MS, type ReliefProgramInput } from './reliefProgram';

const base: ReliefProgramInput = {
  gameTimeMs: 60000,
  score: 0.7,
  lessonExperience: { werewolf: 0, pumpkin: 0 },
  struggleType: null,
};

describe('selectReliefProgram (PACING_REDESIGN.mdバッチ4)', () => {
  it('picks relax when the gate score was bad (<0.4)', () => {
    const p = selectReliefProgram({ ...base, score: 0.39 });
    expect(p.id).toBe('relax');
  });

  it('intro buildup always gets relax, even when a lesson would otherwise be picked (GAME_AUDIT #6)', () => {
    const p = selectReliefProgram({ ...base, intro: true, score: 0.7, lessonExperience: { werewolf: 0, pumpkin: 0 } });
    expect(p.id).toBe('relax');
  });

  it('picks lesson-wolf in the early window when werewolf experience is low', () => {
    const p = selectReliefProgram({ ...base, gameTimeMs: 60000, score: 0.7, lessonExperience: { werewolf: 0, pumpkin: 5 } });
    expect(p.id).toBe('lesson-wolf');
    expect(p.lessonPrimary).toBe('werewolf');
  });

  it('falls through to lesson-pumpkin once werewolf experience is sufficient', () => {
    const p = selectReliefProgram({ ...base, lessonExperience: { werewolf: 5, pumpkin: 0 } });
    expect(p.id).toBe('lesson-pumpkin');
    expect(p.lessonPrimary).toBe('pumpkin');
  });

  it('does not pick a lesson outside the early window (>=4min), even with low experience', () => {
    const p = selectReliefProgram({ ...base, gameTimeMs: 4 * 60 * 1000, lessonExperience: { werewolf: 0, pumpkin: 0 } });
    expect(p.id).not.toBe('lesson-wolf');
    expect(p.id).not.toBe('lesson-pumpkin');
  });

  it('picks recovery when there is a struggle type and lesson experience is sufficient', () => {
    const p = selectReliefProgram({ ...base, lessonExperience: { werewolf: 5, pumpkin: 5 }, struggleType: 'plant' });
    expect(p.id).toBe('recovery');
    expect(p.recoveryPrimary).toBe('plant');
  });

  it('defaults to harvest when nothing else applies', () => {
    const p = selectReliefProgram({ ...base, lessonExperience: { werewolf: 5, pumpkin: 5 }, struggleType: null });
    expect(p.id).toBe('harvest');
    expect(p.xpBoost).toBe(true);
  });

  it('late game (>=7:00): forces harvest regardless of lesson/recovery eligibility', () => {
    const p = selectReliefProgram({
      ...base, gameTimeMs: RELIEF_LATE_GAME_MS, score: 0.9,
      lessonExperience: { werewolf: 0, pumpkin: 0 }, struggleType: 'pumpkin',
    });
    expect(p.id).toBe('harvest');
  });

  it('late game: only relax when score is truly bad (<0.25); 0.3 still gets harvest', () => {
    expect(selectReliefProgram({ ...base, gameTimeMs: RELIEF_LATE_GAME_MS, score: 0.24 }).id).toBe('relax');
    expect(selectReliefProgram({ ...base, gameTimeMs: RELIEF_LATE_GAME_MS, score: 0.3 }).id).toBe('harvest');
  });

  it('relax/harvest carry the documented xpBoost flags (等倍 vs 倍率適用)', () => {
    expect(RELIEF_LATE_GAME_MS).toBe(7 * 60 * 1000);
    expect(selectReliefProgram({ ...base, score: 0.1 }).xpBoost).toBe(false); // relax
  });
});

describe('selectReliefProgram — PACING_V2.mdバッチR4-A(緩の演目ローテ)', () => {
  const noConditional: ReliefProgramInput = { ...base, lessonExperience: { werewolf: 5, pumpkin: 5 }, struggleType: null };

  it('回収/講習どちらも不適格なら、直前がharvestの時は純休憩を選ぶ(直前禁止)', () => {
    const p = selectReliefProgram({ ...noConditional, lastProgramId: 'harvest' });
    expect(p.id).toBe('relax');
  });

  it('回収/講習どちらも不適格なら、直前がrelaxの時はHARVESTを選ぶ(直前禁止)', () => {
    const p = selectReliefProgram({ ...noConditional, lastProgramId: 'relax' });
    expect(p.id).toBe('harvest');
  });

  it('直前情報が無ければ既定どおりHARVEST(初回は從来と同じ挙動)', () => {
    const p = selectReliefProgram({ ...noConditional, lastProgramId: null });
    expect(p.id).toBe('harvest');
  });

  it('直前が講習/回収系(relax/harvest以外)なら、交互判定には影響せず既定のHARVESTになる', () => {
    const p = selectReliefProgram({ ...noConditional, lastProgramId: 'lesson-wolf' });
    expect(p.id).toBe('harvest');
  });

  it('回収/講習が適格な間は交互ロジックより優先される(既存条件を維持)', () => {
    const lesson = selectReliefProgram({ ...base, lessonExperience: { werewolf: 0, pumpkin: 5 }, lastProgramId: 'harvest' });
    expect(lesson.id).toBe('lesson-wolf');
    const recovery = selectReliefProgram({ ...noConditional, struggleType: 'plant', lastProgramId: 'harvest' });
    expect(recovery.id).toBe('recovery');
  });

  it('終盤(7:00以降)も、成績が最悪でない限り交互ロジックが働く(講習/回収は従来どおり選ばれない)', () => {
    const afterHarvest = selectReliefProgram({ ...noConditional, gameTimeMs: RELIEF_LATE_GAME_MS, score: 0.9, lastProgramId: 'harvest' });
    expect(afterHarvest.id).toBe('relax');
    const afterRelax = selectReliefProgram({ ...noConditional, gameTimeMs: RELIEF_LATE_GAME_MS, score: 0.9, lastProgramId: 'relax' });
    expect(afterRelax.id).toBe('harvest');
  });

  it('深入りの立て直しコマ(7:30-8:30)は純休憩固定(成績・直前・回収適格に関わらず)', () => {
    const p1 = selectReliefProgram({ ...noConditional, gameTimeMs: 450_000, score: 0.99, lastProgramId: 'relax', struggleType: 'pumpkin' });
    expect(p1.id).toBe('relax');
    const p2 = selectReliefProgram({ ...noConditional, gameTimeMs: 509_999, score: 0.99, lastProgramId: 'relax' });
    expect(p2.id).toBe('relax');
  });

  it('立て直しコマの窓を外れれば(8:30以降)既存どおりの終盤ロジックに戻る', () => {
    const p = selectReliefProgram({ ...noConditional, gameTimeMs: 510_000, score: 0.9, lastProgramId: 'relax' });
    expect(p.id).toBe('harvest');
  });
});

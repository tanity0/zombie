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

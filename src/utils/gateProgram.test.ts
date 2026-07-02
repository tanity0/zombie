import { describe, it, expect } from 'vitest';
import { selectGateProgram, gateJudgmentProgram, type GateProgramInput } from './gateProgram';

const base: GateProgramInput = {
  phaseMaxRung: 7,
  rank: 1,
  style: 'バランス',
  lastProgramId: null,
  tieBreakRandom: 0.5,
};

describe('selectGateProgram (PACING_REDESIGN.mdバッチ5)', () => {
  it('maxRung=3では数の関所しか適格でない(rankに関わらず)', () => {
    expect(selectGateProgram({ ...base, phaseMaxRung: 3, rank: 0 }).id).toBe('gate-number');
    expect(selectGateProgram({ ...base, phaseMaxRung: 3, rank: 2 }).id).toBe('gate-number');
  });

  it('rank2は適格な中で最も難しい台本(maxRungが最大)を選ぶ', () => {
    expect(selectGateProgram({ ...base, phaseMaxRung: 4, rank: 2 }).id).toBe('gate-lineofsight');
    expect(selectGateProgram({ ...base, phaseMaxRung: 7, rank: 2 }).id).toBe('gate-ambush');
  });

  it('rank0は適格な中で最も優しい台本(maxRungが最小)を選ぶ', () => {
    expect(selectGateProgram({ ...base, phaseMaxRung: 7, rank: 0 }).id).toBe('gate-number');
  });

  it('直近に見せた台本は、他に選択肢があれば除外する', () => {
    const p = selectGateProgram({ ...base, phaseMaxRung: 4, rank: 0, lastProgramId: 'gate-number' });
    expect(p.id).toBe('gate-lineofsight');
  });

  it('直近に見せた台本しか適格でない場合は、除外せずそのまま返す(空にしない)', () => {
    const p = selectGateProgram({ ...base, phaseMaxRung: 3, rank: 0, lastProgramId: 'gate-number' });
    expect(p.id).toBe('gate-number');
  });

  it('7:00以降の延長関所(maxRung7)ではすべての台本が適格になる', () => {
    const p = selectGateProgram({ ...base, phaseMaxRung: 7, rank: 2, lastProgramId: 'gate-triple' });
    expect(p.id).toBe('gate-ambush');
  });

  it('rank1はtieBreakRandomで適格プール内のどれかを選ぶ(範囲内)', () => {
    const ids = new Set(['gate-number', 'gate-lineofsight', 'gate-judgment', 'gate-triple', 'gate-ambush']);
    const p = selectGateProgram({ ...base, phaseMaxRung: 7, rank: 1, tieBreakRandom: 0.99 });
    expect(ids.has(p.id)).toBe(true);
  });
});

describe('gateJudgmentProgram (判断の関所の主役選び)', () => {
  it('近接スタイルは犬(werewolf)を優先する', () => {
    expect(gateJudgmentProgram('近接', 0.9).judgmentPrimary).toBe('werewolf');
  });

  it('遠距離スタイルはパンプキンを優先する', () => {
    expect(gateJudgmentProgram('遠距離', 0.1).judgmentPrimary).toBe('pumpkin');
  });

  it('バランス型はtieBreakRandomで決める', () => {
    expect(gateJudgmentProgram('バランス', 0.1).judgmentPrimary).toBe('werewolf');
    expect(gateJudgmentProgram('バランス', 0.9).judgmentPrimary).toBe('pumpkin');
  });

  it('featuredにplantを含む(弾のレイヤーは常に乗る)', () => {
    expect(gateJudgmentProgram('近接', 0.5).featured).toContain('plant');
  });
});

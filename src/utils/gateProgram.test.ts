import { describe, it, expect } from 'vitest';
import { selectGateProgram, gateJudgmentProgram, type GateProgramInput } from './gateProgram';

// gateIndex=0/lastWasEvent=false/pityBlocked=falseがデフォルト=イベント関所は選出ルール(a)で
// 除外される(既存テストの期待値を変えないため。イベント関所自体のテストは末尾で個別に書く)。
const base: GateProgramInput = {
  phaseMaxRung: 7,
  rank: 1,
  style: 'バランス',
  lastProgramId: null,
  tieBreakRandom: 0.5,
  gateIndex: 0,
  lastWasEvent: false,
  pityBlocked: false,
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

describe('selectGateProgram のイベント関所選出ルール(バッチ5追補)', () => {
  it('(a) 最初の2関所(gateIndex 0,1)ではイベント関所を選ばない', () => {
    const p0 = selectGateProgram({ ...base, gateIndex: 0, phaseMaxRung: 5, rank: 2 });
    const p1 = selectGateProgram({ ...base, gateIndex: 1, phaseMaxRung: 5, rank: 2 });
    expect(p0.eventKind).toBeUndefined();
    expect(p1.eventKind).toBeUndefined();
  });

  it('gateIndex>=2かつ条件が揃えば、rank2でイベント関所(最も難しい適格台本)が選ばれ得る', () => {
    const p = selectGateProgram({ ...base, gateIndex: 2, phaseMaxRung: 5, rank: 2 });
    expect(p.id).toBe('gate-boss-spike');
  });

  it('(b) 直近がイベント関所なら連続で選ばない', () => {
    const p = selectGateProgram({ ...base, gateIndex: 2, phaseMaxRung: 5, rank: 2, lastWasEvent: true });
    expect(p.eventKind).toBeUndefined();
  });

  it('(c) pity発動中/解除後10秒のスロットではイベント関所を選ばない', () => {
    const p = selectGateProgram({ ...base, gateIndex: 2, phaseMaxRung: 5, rank: 2, pityBlocked: true });
    expect(p.eventKind).toBeUndefined();
  });

  it('通常台本の直近除外ロジックはイベント関所選出可否とは独立に働く(lastProgramIdはeventKindなし台本を指す)', () => {
    const p = selectGateProgram({ ...base, gateIndex: 2, phaseMaxRung: 5, rank: 0, lastProgramId: 'gate-number' });
    expect(p.id).not.toBe('gate-number');
  });
});

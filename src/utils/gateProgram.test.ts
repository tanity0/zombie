import { describe, it, expect } from 'vitest';
import { selectGateProgram, selectGateProgramLegacy, gateJudgmentProgram, GATE_PROGRAM_TAGS, type GateProgramInput, type GateProgramInputLegacy, type GateProgramId } from './gateProgram';

// gateIndex=0/lastWasEvent=false/pityBlocked=falseがデフォルト=イベント関所は選出ルール(a)で
// 除外される(既存テストの期待値を変えないため。イベント関所自体のテストは末尾で個別に書く)。
const legacyBase: GateProgramInputLegacy = {
  phaseMaxRung: 7,
  rank: 1,
  style: 'バランス',
  lastProgramId: null,
  tieBreakRandom: 0.5,
  gateIndex: 0,
  lastWasEvent: false,
  pityBlocked: false,
};

describe('selectGateProgramLegacy (PACING_REDESIGN.mdバッチ5・?v2=0の復帰先)', () => {
  it('maxRung=3では数の関所しか適格でない(rankに関わらず)', () => {
    expect(selectGateProgramLegacy({ ...legacyBase, phaseMaxRung: 3, rank: 0 }).id).toBe('gate-number');
    expect(selectGateProgramLegacy({ ...legacyBase, phaseMaxRung: 3, rank: 2 }).id).toBe('gate-number');
  });

  it('rank2は適格な中で最も難しい台本(maxRungが最大)を選ぶ', () => {
    expect(selectGateProgramLegacy({ ...legacyBase, phaseMaxRung: 4, rank: 2 }).id).toBe('gate-lineofsight');
    expect(selectGateProgramLegacy({ ...legacyBase, phaseMaxRung: 7, rank: 2 }).id).toBe('gate-ambush');
  });

  it('rank0は適格な中で最も優しい台本(maxRungが最小)を選ぶ', () => {
    expect(selectGateProgramLegacy({ ...legacyBase, phaseMaxRung: 7, rank: 0 }).id).toBe('gate-number');
  });

  it('直近に見せた台本は、他に選択肢があれば除外する', () => {
    const p = selectGateProgramLegacy({ ...legacyBase, phaseMaxRung: 4, rank: 0, lastProgramId: 'gate-number' });
    expect(p.id).toBe('gate-lineofsight');
  });

  it('直近に見せた台本しか適格でない場合は、除外せずそのまま返す(空にしない)', () => {
    const p = selectGateProgramLegacy({ ...legacyBase, phaseMaxRung: 3, rank: 0, lastProgramId: 'gate-number' });
    expect(p.id).toBe('gate-number');
  });

  it('7:00以降の延長関所(maxRung7)ではすべての台本が適格になる', () => {
    const p = selectGateProgramLegacy({ ...legacyBase, phaseMaxRung: 7, rank: 2, lastProgramId: 'gate-triple' });
    expect(p.id).toBe('gate-ambush');
  });

  it('rank1はtieBreakRandomで適格プール内のどれかを選ぶ(範囲内)', () => {
    const ids = new Set(['gate-number', 'gate-lineofsight', 'gate-judgment', 'gate-triple', 'gate-ambush']);
    const p = selectGateProgramLegacy({ ...legacyBase, phaseMaxRung: 7, rank: 1, tieBreakRandom: 0.99 });
    expect(ids.has(p.id)).toBe(true);
  });

  describe('イベント関所選出ルール(バッチ5追補)', () => {
    it('(a) 最初の2関所(gateIndex 0,1)ではイベント関所を選ばない', () => {
      const p0 = selectGateProgramLegacy({ ...legacyBase, gateIndex: 0, phaseMaxRung: 5, rank: 2 });
      const p1 = selectGateProgramLegacy({ ...legacyBase, gateIndex: 1, phaseMaxRung: 5, rank: 2 });
      expect(p0.eventKind).toBeUndefined();
      expect(p1.eventKind).toBeUndefined();
    });

    it('gateIndex>=2かつ条件が揃えば、rank2でイベント関所(最も難しい適格台本)が選ばれ得る', () => {
      const p = selectGateProgramLegacy({ ...legacyBase, gateIndex: 2, phaseMaxRung: 5, rank: 2 });
      expect(p.id).toBe('gate-boss-spike');
    });

    it('(b) 直近がイベント関所なら連続で選ばない', () => {
      const p = selectGateProgramLegacy({ ...legacyBase, gateIndex: 2, phaseMaxRung: 5, rank: 2, lastWasEvent: true });
      expect(p.eventKind).toBeUndefined();
    });

    it('(c) pity発動中/解除後10秒のスロットではイベント関所を選ばない', () => {
      const p = selectGateProgramLegacy({ ...legacyBase, gateIndex: 2, phaseMaxRung: 5, rank: 2, pityBlocked: true });
      expect(p.eventKind).toBeUndefined();
    });

    it('通常台本の直近除外ロジックはイベント関所選出可否とは独立に働く(lastProgramIdはeventKindなし台本を指す)', () => {
      const p = selectGateProgramLegacy({ ...legacyBase, gateIndex: 2, phaseMaxRung: 5, rank: 0, lastProgramId: 'gate-number' });
      expect(p.id).not.toBe('gate-number');
    });
  });
});

// PACING_V2.mdバッチR1-A/B/C: 新選択(時間解禁+未見優先+直前禁止+一様タイブレーク。rankは不使用)。
// 全数検証(100ラン×関所列のシミュレーション)は gateRotation.test.ts が担う。ここは単体の境界値検証。
const base: GateProgramInput = {
  gameTime: 0,
  style: 'バランス',
  lastProgramId: null,
  tieBreakRandom: 0.5,
  gateIndex: 0,
  lastWasEvent: false,
  pityBlocked: false,
  seenProgramIds: new Set(),
};

describe('selectGateProgram (PACING_V2.mdバッチR1: 台本ローテーション)', () => {
  it('gameTime=0では時間解禁済みの数/射線しか適格でない(rankという概念自体が無い)', () => {
    const ids = new Set(['gate-number', 'gate-lineofsight']);
    for (const t of [0, 0.25, 0.5, 0.75, 0.999]) {
      expect(ids.has(selectGateProgram({ ...base, tieBreakRandom: t }).id)).toBe(true);
    }
  });

  it('未見優先: 既に見せた台本があり、未見の選択肢が残っていれば必ず未見側を選ぶ', () => {
    const seen = new Set<GateProgramId>(['gate-number']);
    for (const t of [0, 0.1, 0.5, 0.9, 0.999]) {
      const p = selectGateProgram({ ...base, tieBreakRandom: t, seenProgramIds: seen });
      expect(p.id).toBe('gate-lineofsight');
    }
  });

  it('全部見た後は直前除外の範囲でtieBreakRandomにより一様に選び直す(空にしない)', () => {
    const seen = new Set(['gate-number', 'gate-lineofsight'] as const);
    const p = selectGateProgram({ ...base, seenProgramIds: seen, lastProgramId: 'gate-number' });
    expect(p.id).toBe('gate-lineofsight'); // pool=[gate-number,gate-lineofsight]→lastId除外で残り1つ
  });

  it('時間解禁(unlockMs)前の台本は選ばれない: 判断(2:00)は1:59では出ない・2:00ちょうどで解禁', () => {
    const seen = new Set(['gate-number', 'gate-lineofsight'] as const); // 判断以外は既知にして未見優先の影響を消す
    const before = selectGateProgram({ ...base, gameTime: 119999, seenProgramIds: seen, lastProgramId: 'gate-lineofsight' });
    expect(before.id).not.toBe('gate-judgment');
    const after = selectGateProgram({ ...base, gameTime: 120000, seenProgramIds: seen, lastProgramId: 'gate-lineofsight' });
    expect(after.id).toBe('gate-judgment'); // 未見はjudgmentのみになる
  });

  it('直前に見せた台本は、他に選択肢があれば連続で選ばれない', () => {
    for (const t of [0, 0.3, 0.6, 0.99]) {
      const p = selectGateProgram({ ...base, tieBreakRandom: t, lastProgramId: 'gate-number' });
      expect(p.id).not.toBe('gate-number');
    }
  });

  it('7:00以降は不意打ち(gate-ambush)も適格プールに入る', () => {
    const seen = new Set(['gate-number', 'gate-lineofsight', 'gate-judgment', 'gate-triple'] as const);
    const p = selectGateProgram({ ...base, gameTime: 7 * 60 * 1000, seenProgramIds: seen, lastProgramId: 'gate-triple' });
    expect(p.id).toBe('gate-ambush');
  });

  describe('イベント関所選出ルール(バッチ5追補・R1でも維持)', () => {
    it('(a) 最初の2関所(gateIndex 0,1)ではイベント関所を選ばない', () => {
      const p0 = selectGateProgram({ ...base, gateIndex: 0, gameTime: 5 * 60 * 1000 });
      const p1 = selectGateProgram({ ...base, gateIndex: 1, gameTime: 5 * 60 * 1000 });
      expect(p0.eventKind).toBeUndefined();
      expect(p1.eventKind).toBeUndefined();
    });

    it('(b) 直近がイベント関所なら連続で選ばない', () => {
      const seen = new Set(['gate-number', 'gate-lineofsight', 'gate-judgment', 'gate-triple', 'gate-boss-spike'] as const);
      const p = selectGateProgram({ ...base, gateIndex: 2, gameTime: 5 * 60 * 1000, seenProgramIds: seen, lastWasEvent: true, lastProgramId: 'gate-boss-spike' });
      expect(p.eventKind).toBeUndefined();
    });

    it('(c) pity発動中/解除後10秒のスロットではイベント関所を選ばない', () => {
      const p = selectGateProgram({ ...base, gateIndex: 2, gameTime: 5 * 60 * 1000, pityBlocked: true });
      expect(p.eventKind).toBeUndefined();
    });
  });

  describe('§4 非類似優先(PACING_V2.md v0.26.12・社長指示1「できるだけ似ていないものを次に」)', () => {
    const ALL_SEEN = new Set<GateProgramId>(['gate-number', 'gate-lineofsight', 'gate-judgment', 'gate-triple', 'gate-ambush', 'gate-assault', 'gate-boss-spike']);
    const lateBase: GateProgramInput = { ...base, gameTime: 8 * 60 * 1000, gateIndex: 5, seenProgramIds: ALL_SEEN };

    it('GATE_PROGRAM_TAGSは全7台本ぶん定義されている', () => {
      for (const id of ALL_SEEN) expect(GATE_PROGRAM_TAGS[id]?.length, id).toBeGreaterThan(0);
    });

    it('三択(featured/ranged/combo)の後は、タグを共有しない{数, 襲撃}だけが候補になる', () => {
      expect(selectGateProgram({ ...lateBase, lastProgramId: 'gate-triple', tieBreakRandom: 0 }).id).toBe('gate-number');
      expect(selectGateProgram({ ...lateBase, lastProgramId: 'gate-triple', tieBreakRandom: 0.99 }).id).toBe('gate-assault');
    });

    it('射線(ranged)の後は、rangedを持たない{数, 襲撃, スパイク}だけが候補になる', () => {
      const picked = new Set<string>();
      for (const t of [0, 0.34, 0.67, 0.99]) {
        picked.add(selectGateProgram({ ...lateBase, lastProgramId: 'gate-lineofsight', tieBreakRandom: t }).id);
      }
      expect([...picked].sort()).toEqual(['gate-assault', 'gate-boss-spike', 'gate-number']);
    });

    it('不意打ち(最高段)の後は、タグを共有しない{数, 襲撃}へ必ず離れる(社長指示2: 最高段に居座らない)', () => {
      expect(selectGateProgram({ ...lateBase, lastProgramId: 'gate-ambush', tieBreakRandom: 0 }).id).toBe('gate-number');
      expect(selectGateProgram({ ...lateBase, lastProgramId: 'gate-ambush', tieBreakRandom: 0.99 }).id).toBe('gate-assault');
    });

    it('未見優先の後に適用される: 未見が1つならその1つが選ばれる(非類似で空にしない)', () => {
      const seen = new Set<GateProgramId>(['gate-number', 'gate-lineofsight']);
      const p = selectGateProgram({ ...base, gameTime: 2 * 60 * 1000, seenProgramIds: seen, lastProgramId: 'gate-lineofsight' });
      expect(p.id).toBe('gate-judgment'); // 判断はrangedを共有(類似1)だが、未見が1つしか無いので選ばれる
    });
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

// PACING_V2.mdバッチR1受け入れ条件: 台本ローテーション(unlockMs時間解禁+未見優先+直前禁止+
// rank不使用の一様タイブレーク)を、統計ではなく全数(100ラン×関所列)でシミュレーションし、
// 以下を検証する:
//   (i)   直前台本が連続0回
//   (ii)  未見が残る限り未見が選ばれる
//   (iii) unlockMs前の台本が選ばれない
//   (iv)  十分な関所数で全メニューが出現する
//
// 検証の independence を保つため、適格プールは実装(gateProgram.ts)を呼ばずに仕様書の記述から
// 独立に再実装した参照モデル(referencePool)で再計算し、selectGateProgram()の返り値がその
// 参照プールのメンバーであることを突き合わせる。
import { describe, it, expect } from 'vitest';
import { selectGateProgram, type GateProgramId } from './gateProgram';

const ALL_IDS: GateProgramId[] = [
  'gate-number', 'gate-lineofsight', 'gate-judgment', 'gate-triple', 'gate-ambush', 'gate-assault', 'gate-boss-spike',
];
const EVENT_IDS = new Set<GateProgramId>(['gate-assault', 'gate-boss-spike']);

// PACING_V2.md R1-Aの時間解禁表(仕様書の記述をそのまま数値化。gateProgram.tsの値と一致するはず)。
const REFERENCE_UNLOCK_MS: Record<GateProgramId, number> = {
  'gate-number': 0,
  'gate-lineofsight': 0,
  'gate-judgment': 2 * 60 * 1000,
  'gate-assault': 3 * 60 * 1000,
  'gate-triple': 4 * 60 * 1000,
  'gate-boss-spike': 4 * 60 * 1000,
  'gate-ambush': 7 * 60 * 1000,
};

interface ReferenceState {
  gameTime: number;
  gateIndex: number;
  lastWasEvent: boolean;
  lastProgramId: GateProgramId | null;
  pityBlocked: boolean;
  seen: ReadonlySet<GateProgramId>;
}

// R1-Bの選出ステップ1〜3(タイブレークを除く「プールの絞り込み」まで)を独立に再実装した参照モデル。
const referencePool = (s: ReferenceState): GateProgramId[] => {
  const eligible = ALL_IDS.filter(id => s.gameTime >= REFERENCE_UNLOCK_MS[id]);
  const eventGateOk = s.gateIndex >= 2 && !s.lastWasEvent && !s.pityBlocked;
  let pool = eventGateOk ? eligible : eligible.filter(id => !EVENT_IDS.has(id));
  if (pool.length === 0) pool = eligible.filter(id => !EVENT_IDS.has(id));
  if (s.lastProgramId && pool.length > 1) {
    const filtered = pool.filter(id => id !== s.lastProgramId);
    if (filtered.length > 0) pool = filtered;
  }
  const unseen = pool.filter(id => !s.seen.has(id));
  return unseen.length > 0 ? unseen : pool;
};

// シード固定の決定的PRNG(mulberry32)。テストの再現性のためMath.randomは使わない。
const mulberry32 = (seed: number) => () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const RUNS = 100;
const GATES_PER_RUN = 20; // gameTimeは1関所あたり60秒進める想定(0分→19分まで。7:00の不意打ち解禁を十分カバー)。

describe('台本ローテーション 全数シミュレーション(PACING_V2.md R1受け入れ条件)', () => {
  it(`(i)(ii)(iii) ${RUNS}ラン×${GATES_PER_RUN}関所を全数検証: 直前非連続/未見優先/時間解禁の3条件を毎回満たす`, () => {
    const rng = mulberry32(20260703);
    for (let run = 0; run < RUNS; run++) {
      const seen = new Set<GateProgramId>();
      let lastProgramId: GateProgramId | null = null;
      let lastWasEvent = false;
      for (let gate = 0; gate < GATES_PER_RUN; gate++) {
        const gameTime = gate * 60 * 1000;
        const seenBefore = new Set(seen);
        const refPool = referencePool({ gameTime, gateIndex: gate, lastWasEvent, lastProgramId, pityBlocked: false, seen: seenBefore });

        const program = selectGateProgram({
          gameTime,
          style: 'バランス',
          lastProgramId,
          tieBreakRandom: rng(),
          gateIndex: gate,
          lastWasEvent,
          pityBlocked: false,
          seenProgramIds: seenBefore,
        });

        // (iii) unlockMs前の台本は選ばれない(返り値自身のunlockMsフィールドで直接確認)。
        expect(program.unlockMs, `run${run} gate${gate}: unlockMs violated by ${program.id}`).toBeLessThanOrEqual(gameTime);
        // 参照モデルの適格プールに実装の選択結果が含まれること(=時間解禁/イベント選出ルール/直前禁止/未見優先の
        // 絞り込みロジックが仕様どおり一致していることの突き合わせ)。
        expect(refPool, `run${run} gate${gate}: ${program.id} not in reference pool ${JSON.stringify(refPool)}`).toContain(program.id);
        // (i) 直前台本が連続で選ばれない(参照プールは事前にlastProgramIdを除外しているため上のcontainsで
        // 間接的に保証されるが、意図を明示するため直接も確認する)。
        if (lastProgramId !== null) {
          expect(program.id, `run${run} gate${gate}: consecutive repeat of ${lastProgramId}`).not.toBe(lastProgramId);
        }
        // (ii) 未見の選択肢が参照プール中に残っていれば、選ばれたのはその未見側であること。
        const unseenInRefPool = refPool.filter(id => !seenBefore.has(id));
        if (unseenInRefPool.length > 0) {
          expect(seenBefore.has(program.id), `run${run} gate${gate}: picked already-seen ${program.id} while unseen options ${unseenInRefPool} remained`).toBe(false);
        }

        seen.add(program.id);
        lastWasEvent = program.eventKind !== undefined;
        lastProgramId = program.id;
      }
    }
  });

  it(`(iv) 十分な関所数(${GATES_PER_RUN})が経過すれば全7メニューが出現する`, () => {
    const rng = mulberry32(1234567);
    for (let run = 0; run < RUNS; run++) {
      const seen = new Set<GateProgramId>();
      let lastProgramId: GateProgramId | null = null;
      let lastWasEvent = false;
      for (let gate = 0; gate < GATES_PER_RUN; gate++) {
        const gameTime = gate * 60 * 1000;
        const program = selectGateProgram({
          gameTime,
          style: 'バランス',
          lastProgramId,
          tieBreakRandom: rng(),
          gateIndex: gate,
          lastWasEvent,
          pityBlocked: false,
          seenProgramIds: seen,
        });
        seen.add(program.id);
        lastWasEvent = program.eventKind !== undefined;
        lastProgramId = program.id;
      }
      expect(seen.size, `run${run}: only saw ${[...seen]}`).toBe(ALL_IDS.length);
    }
  });
});

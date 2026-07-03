// PACING_V2.mdバッチR1受け入れ条件+§4(v0.26.12): 台本ローテーション(unlockMs時間解禁+未見優先+
// 直前禁止+非類似優先+rank不使用の一様タイブレーク)を、統計ではなく全数(100ラン×関所列)で
// シミュレーションし、以下を検証する:
//   (i)   直前台本が連続0回
//   (ii)  未見が残る限り未見が選ばれる
//   (iii) unlockMs前の台本が選ばれない
//   (iv)  十分な関所数で全メニューが出現する
//   (v)   §4(社長指示1): 選ばれた台本は「直前台本との類似度が最小」の候補である
//   (vi)  §4(社長指示2): 不意打ち(最高段)解禁後も最高段のみに収束しない(下段の台本が出続ける)
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

// PACING_V2.md§4のテーマタグ表(仕様書の記述をそのまま複製。gateProgram.tsの値と一致するはず)。
const REFERENCE_TAGS: Record<GateProgramId, readonly string[]> = {
  'gate-number': ['swarm'],
  'gate-lineofsight': ['ranged'],
  'gate-judgment': ['featured', 'ranged'],
  'gate-triple': ['featured', 'ranged', 'combo'],
  'gate-ambush': ['featured', 'ranged', 'combo', 'surprise'],
  'gate-assault': ['event', 'swarm'],
  'gate-boss-spike': ['event', 'featured'],
};
const refSimilarity = (a: GateProgramId, b: GateProgramId): number =>
  REFERENCE_TAGS[a].filter(t => REFERENCE_TAGS[b].includes(t)).length;

interface ReferenceState {
  gameTime: number;
  gateIndex: number;
  lastWasEvent: boolean;
  lastProgramId: GateProgramId | null;
  pityBlocked: boolean;
  seen: ReadonlySet<GateProgramId>;
}

// R1-Bの選出ステップ1〜3+§4の非類似優先(タイブレークを除く「プールの絞り込み」まで)を
// 独立に再実装した参照モデル。
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
  if (unseen.length > 0) pool = unseen;
  // §4(v0.26.12): 直前台本とのタグ類似度が最小の候補だけに絞る。
  if (s.lastProgramId && pool.length > 1) {
    const last = s.lastProgramId;
    const minSim = Math.min(...pool.map(id => refSimilarity(id, last)));
    pool = pool.filter(id => refSimilarity(id, last) === minSim);
  }
  return pool;
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
  it(`(i)(ii)(iii)(v) ${RUNS}ラン×${GATES_PER_RUN}関所を全数検証: 直前非連続/未見優先/時間解禁/非類似優先を毎回満たす`, () => {
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
        // (v) §4非類似優先: 参照プールは類似度最小の候補のみを含む(=containsで間接保証)が、
        // 意図を明示するため「直前とのタグ共有数が参照プール全体の最小値と一致する」ことも直接確認する。
        if (lastProgramId !== null) {
          const simOfPick = refSimilarity(program.id, lastProgramId);
          for (const id of refPool) {
            expect(simOfPick, `run${run} gate${gate}: picked ${program.id}(sim${simOfPick}) but ${id} is less similar`).toBeLessThanOrEqual(refSimilarity(id, lastProgramId));
          }
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

  it('(vi) §4(社長指示2): 不意打ち(最高段rung7)解禁後(7:00以降)も最高段のみに収束しない=下段の台本が出続ける', () => {
    const rng = mulberry32(777);
    for (let run = 0; run < RUNS; run++) {
      const seen = new Set<GateProgramId>();
      let lastProgramId: GateProgramId | null = null;
      let lastWasEvent = false;
      let lateGates = 0, lateNonAmbush = 0;
      for (let gate = 0; gate < GATES_PER_RUN; gate++) {
        const gameTime = gate * 60 * 1000;
        const program = selectGateProgram({
          gameTime, style: 'バランス', lastProgramId, tieBreakRandom: rng(),
          gateIndex: gate, lastWasEvent, pityBlocked: false, seenProgramIds: seen,
        });
        if (gameTime >= 7 * 60 * 1000) {
          lateGates++;
          if (program.id !== 'gate-ambush') lateNonAmbush++;
        }
        seen.add(program.id);
        lastWasEvent = program.eventKind !== undefined;
        lastProgramId = program.id;
      }
      // 直前禁止+非類似優先により、7:00以降の関所の過半は最高段(不意打ち)以外の台本になる。
      expect(lateGates).toBeGreaterThan(0);
      expect(lateNonAmbush, `run${run}: ambush dominated the late game`).toBeGreaterThanOrEqual(Math.ceil(lateGates / 2));
    }
  });
});

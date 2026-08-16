// PACING_PUZZLE.md §6.38 v10「バス停の中立射撃に緩急」の純関数ユニットテスト。
// bountyShots.ts単体(store/レンダラ非依存)を対象にする。配線側(tickRanged)の統合検証は
// bountyTick.test.tsの「バス停(bounty-ranged) — 中立射撃の型3種(§6.38 v10)」節で行う。
import { describe, it, expect } from 'vitest';
import {
  pickBrCloseMove, BR_PUSH_CD_MS, BR_CLOSE_ROLL_WEIGHT, BR_CLOSE_PUSH_WEIGHT,
  pickBrShotPattern, brShotCount, brCycleDurationMs,
  brChargeWindupSpeedMult, brChargeRecoverSpeedMult,
  BR_SHOT_UNIT_MS, BR_BURST_SHOT_COUNT, BR_BURST_INTERVAL_MS,
  BR_FAN_SHOT_COUNT, BR_FAN_SPREAD_DEG, BR_FAN_ANGLE_OFFSETS_DEG,
  BR_CHARGE_SHOT_COUNT, BR_CHARGE_WINDUP_MS, BR_CHARGE_SPEED_MULT, BR_CHARGE_RECOVER_MS,
  type BrShotPattern,
} from './bountyShots';

/** 決定的PRNG(mulberry32)。Math.randomだとテストが毎回変わるため統計テストはこれで固定する。 */
const mulberry32 = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

describe('定数(§6.38 v10の値をそのまま機械化)', () => {
  it('BR_SHOT_UNIT_MS=1100(旧BR_SHOT_INTERVAL_MSの改名・#11・値は不変)', () => {
    expect(BR_SHOT_UNIT_MS).toBe(1100);
  });
  it('burst=200ms間隔で3発(#1)', () => {
    expect(BR_BURST_SHOT_COUNT).toBe(3);
    expect(BR_BURST_INTERVAL_MS).toBe(200);
  });
  it('fan=同時3発・±12°(#1)', () => {
    expect(BR_FAN_SHOT_COUNT).toBe(3);
    expect(BR_FAN_SPREAD_DEG).toBe(12);
    expect(BR_FAN_ANGLE_OFFSETS_DEG).toEqual([-12, 0, 12]);
  });
  it('charge=350ms溜め→1発・弾速1.5倍・溜め350+発射後750=1100(#1/#3)', () => {
    expect(BR_CHARGE_SHOT_COUNT).toBe(1);
    expect(BR_CHARGE_WINDUP_MS).toBe(350);
    expect(BR_CHARGE_SPEED_MULT).toBe(1.5);
    expect(BR_CHARGE_RECOVER_MS).toBe(750);
    expect(BR_CHARGE_WINDUP_MS + BR_CHARGE_RECOVER_MS).toBe(BR_SHOT_UNIT_MS);
  });
});

describe('brShotCount / brCycleDurationMs(#3: サイクル長=弾数×BR_SHOT_UNIT_MS)', () => {
  it('burst/fan=3発=3300ms・charge=1発=1100ms', () => {
    expect(brShotCount('burst')).toBe(3);
    expect(brShotCount('fan')).toBe(3);
    expect(brShotCount('charge')).toBe(1);
    expect(brCycleDurationMs('burst')).toBe(3300);
    expect(brCycleDurationMs('fan')).toBe(3300);
    expect(brCycleDurationMs('charge')).toBe(1100);
  });
});

describe('pickBrShotPattern(#2: 等確率・直前と同じ型は引かない・fanが弾かれたら残り2型から)', () => {
  it('直前と同じ型を絶対に返さない(全prev×全allowFanの組み合わせ・1000回ずつ)', () => {
    const rand = mulberry32(1);
    const prevs: (BrShotPattern | null)[] = [null, 'burst', 'fan', 'charge'];
    for (const prev of prevs) {
      for (const allowFan of [true, false]) {
        for (let i = 0; i < 1000; i++) {
          const picked = pickBrShotPattern(rand, prev, allowFan);
          if (prev !== null) expect(picked).not.toBe(prev);
          if (!allowFan) expect(picked).not.toBe('fan');
        }
      }
    }
  });

  it('allowFan=falseの時はburst/charge以外を返さない', () => {
    const rand = mulberry32(2);
    for (let i = 0; i < 500; i++) {
      const picked = pickBrShotPattern(rand, null, false);
      expect(['burst', 'charge']).toContain(picked);
    }
  });

  it('候補が1件しかない時(prev=burst かつ allowFan=false)は常にchargeを返す', () => {
    const rand = mulberry32(3);
    for (let i = 0; i < 100; i++) {
      expect(pickBrShotPattern(rand, 'burst', false)).toBe('charge');
    }
  });

  it('★受け入れ条件「3型すべて出る」: prev=null・allowFan=trueで3型全てが十分な回数出る', () => {
    const rand = mulberry32(4);
    const counts: Record<BrShotPattern, number> = { burst: 0, fan: 0, charge: 0 };
    let prev: BrShotPattern | null = null;
    for (let i = 0; i < 3000; i++) {
      const picked = pickBrShotPattern(rand, prev, true);
      counts[picked]++;
      prev = picked;
    }
    // 対称な3状態マルコフ連鎖(直前を除いた2択を等確率)の定常分布は一様(1/3ずつ)。
    // 3000回で各型おおよそ1000回・統計的なブレを見込んで800〜1200の範囲を確認する。
    expect(counts.burst).toBeGreaterThan(800);
    expect(counts.burst).toBeLessThan(1200);
    expect(counts.fan).toBeGreaterThan(800);
    expect(counts.fan).toBeLessThan(1200);
    expect(counts.charge).toBeGreaterThan(800);
    expect(counts.charge).toBeLessThan(1200);
  });

  it('★受け入れ条件「1分あたり54.5発±1」の土台検算: 平均サイクル長2566.7ms・平均弾数2.333発', () => {
    // §6.38 v10 #3のコメント計算をそのままシミュレートして機械化する
    // (割り込みなしの中立のみ=このpick+brCycleDurationMs+brShotCountの合成が唯一の発射源)。
    const rand = mulberry32(5);
    let prev: BrShotPattern | null = null;
    let totalMs = 0;
    let totalShots = 0;
    const cycles = 20000;
    for (let i = 0; i < cycles; i++) {
      const pattern = pickBrShotPattern(rand, prev, true);
      totalMs += brCycleDurationMs(pattern);
      totalShots += brShotCount(pattern);
      prev = pattern;
    }
    const shotsPerMinute = (totalShots / totalMs) * 60000;
    expect(shotsPerMinute).toBeGreaterThan(53.5);
    expect(shotsPerMinute).toBeLessThan(55.5);
  });
});

describe('brChargeWindupSpeedMult / brChargeRecoverSpeedMult(慣性・瞬間停止禁止=CLAUDE.md MUST)', () => {
  it('windup: progress0で1(通常速度)・progress1で0(停止)・単調減少', () => {
    expect(brChargeWindupSpeedMult(0)).toBe(1);
    expect(brChargeWindupSpeedMult(1)).toBe(0);
    expect(brChargeWindupSpeedMult(0.5)).toBeCloseTo(0.25, 10); // (1-0.5)^2
    expect(brChargeWindupSpeedMult(0.25)).toBeGreaterThan(brChargeWindupSpeedMult(0.75));
  });
  it('recover: progress0で0(静止)・progress1で1(通常速度)・単調増加', () => {
    expect(brChargeRecoverSpeedMult(0)).toBe(0);
    expect(brChargeRecoverSpeedMult(1)).toBe(1);
    expect(brChargeRecoverSpeedMult(0.5)).toBeCloseTo(0.25, 10); // 0.5^2
    expect(brChargeRecoverSpeedMult(0.75)).toBeGreaterThan(brChargeRecoverSpeedMult(0.25));
  });
  it('windup終端(progress=1→0)とrecover始端(progress=0→0)が連続する=瞬間停止しない(値がジャンプしない)', () => {
    expect(brChargeWindupSpeedMult(1)).toBe(brChargeRecoverSpeedMult(0));
  });
  it('範囲外の入力はクランプされる(0未満→0扱い・1超→1扱い)', () => {
    expect(brChargeWindupSpeedMult(-1)).toBe(1);
    expect(brChargeWindupSpeedMult(2)).toBe(0);
    expect(brChargeRecoverSpeedMult(-1)).toBe(0);
    expect(brChargeRecoverSpeedMult(2)).toBe(1);
  });
});

// ★v0.25.3517(社長指示「近接も重み変えて / 押しのけしか出ないせいで、倒すのが簡単になってる」)。
// 旧: 密着すると押しのけがCDなしで100%返り、読む対象が1つしか無かった。
describe('pickBrCloseMove(近距離の技選択)', () => {
  const R = (v: number) => () => v;

  it('両方CD明けなら重みどおりに割れる(ロール台本60 / 押しのけ40)', () => {
    const total = BR_CLOSE_ROLL_WEIGHT + BR_CLOSE_PUSH_WEIGHT;
    expect(pickBrCloseMove(R(0), true, true)).toBe('roll');
    expect(pickBrCloseMove(R((BR_CLOSE_ROLL_WEIGHT - 1) / total), true, true)).toBe('roll');
    expect(pickBrCloseMove(R((BR_CLOSE_ROLL_WEIGHT + 1) / total), true, true)).toBe('push');
    expect(pickBrCloseMove(R(0.999), true, true)).toBe('push');
  });

  it('★押しのけの方が重みは軽い=密着の主役は「読む価値のある台本」側(この修正の狙い)', () => {
    expect(BR_CLOSE_ROLL_WEIGHT).toBeGreaterThan(BR_CLOSE_PUSH_WEIGHT);
  });

  it('片方だけCD明けならそれが必ず出る(重みに関係なく)', () => {
    for (const r of [0, 0.5, 0.999]) {
      expect(pickBrCloseMove(R(r), true, false)).toBe('roll');
      expect(pickBrCloseMove(R(r), false, true)).toBe('push');
    }
  });

  it('★両方CD中はnull=技を出さない(呼び出し側は中立の射撃サイクルへ落ちる)', () => {
    expect(pickBrCloseMove(R(0), false, false)).toBeNull();
    expect(pickBrCloseMove(R(0.999), false, false)).toBeNull();
  });

  it('rand()が1に極めて近くてもnullを返さない(端の保険)', () => {
    expect(pickBrCloseMove(R(1 - Number.EPSILON), true, true)).not.toBeNull();
  });

  it('押しのけにCDがある(0だと密着=押しのけの1本道に戻る)', () => {
    expect(BR_PUSH_CD_MS).toBeGreaterThan(0);
  });
});

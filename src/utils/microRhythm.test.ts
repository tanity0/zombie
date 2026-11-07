// research/AI_HUMANIZE.md B3(§4マイクロリズムの録り)。純関数のユニットテスト。
import { describe, it, expect } from 'vitest';
import {
  createMicroRhythmState, stepMicroRhythm, foldMicroRhythm, blendMicroRhythm,
  octantOf, blendBin3, blendHistDist,
  STILL_SHORT_MS, STILL_MID_MS, HIT_REACT_WINDOW_MS, DECISION_DWELL_MS,
  type MicroRhythmTickInput,
} from './microRhythm';

const baseInput = (overrides: Partial<MicroRhythmTickInput> = {}): MicroRhythmTickInput => ({
  gameTime: 0,
  isMoving: true,
  lastDirection: { x: 1, y: 0 },
  swungThisTick: false,
  boss: null,
  pcx: 0, pcy: 0,
  prevPcx: null, prevPcy: null,
  dtMs: 16,
  justDamaged: false,
  ...overrides,
});

describe('octantOf', () => {
  it('無視できる大きさは null', () => {
    expect(octantOf(0, 0)).toBeNull();
    expect(octantOf(0.001, 0.001)).toBeNull();
  });
  it('右向きは0、上向きは8方向のどれか(規約は内部一貫していればよい=変化検知だけ検証)', () => {
    const right = octantOf(1, 0);
    const up = octantOf(0, -1);
    expect(right).not.toBeNull();
    expect(up).not.toBeNull();
    expect(right).not.toBe(up);
  });
  it('8方向量子化=45度以内は同じoctant', () => {
    expect(octantOf(1, 0)).toBe(octantOf(1, 0.1));
  });
});

describe('①止まりの長さ', () => {
  it('移動→静止→移動の1エピソードを長さビンへ積む', () => {
    const st = createMicroRhythmState();
    stepMicroRhythm(st, baseInput({ gameTime: 0, isMoving: true }));
    stepMicroRhythm(st, baseInput({ gameTime: 100, isMoving: false })); // 静止開始
    stepMicroRhythm(st, baseInput({ gameTime: 450, isMoving: true })); // 350ms止まった→midビン
    const sample = foldMicroRhythm(st);
    expect(sample.stillness?.n).toBe(1);
    expect(sample.stillness?.rate1).toBe(1); // bin1=mid
  });
  it('短い止まり(<200ms)はbin0', () => {
    const st = createMicroRhythmState();
    stepMicroRhythm(st, baseInput({ gameTime: 0, isMoving: true }));
    stepMicroRhythm(st, baseInput({ gameTime: 100, isMoving: false }));
    stepMicroRhythm(st, baseInput({ gameTime: 100 + STILL_SHORT_MS - 10, isMoving: true }));
    const sample = foldMicroRhythm(st);
    expect(sample.stillness?.rate0).toBe(1);
  });
  it('長い止まり(>=600ms)はbin2(=1-rate0-rate1)', () => {
    const st = createMicroRhythmState();
    stepMicroRhythm(st, baseInput({ gameTime: 0, isMoving: true }));
    stepMicroRhythm(st, baseInput({ gameTime: 100, isMoving: false }));
    stepMicroRhythm(st, baseInput({ gameTime: 100 + STILL_MID_MS + 10, isMoving: true }));
    const sample = foldMicroRhythm(st);
    expect(sample.stillness?.rate0).toBe(0);
    expect(sample.stillness?.rate1).toBe(0);
  });
});

describe('②攻撃間隔の揺らぎ', () => {
  it('2回目の振りから間隔が積まれる(初回は基準点のみ)', () => {
    const st = createMicroRhythmState();
    stepMicroRhythm(st, baseInput({ gameTime: 0, swungThisTick: true }));
    stepMicroRhythm(st, baseInput({ gameTime: 300, swungThisTick: true })); // 300ms=密
    const sample = foldMicroRhythm(st);
    expect(sample.swingInterval?.n).toBe(1);
    expect(sample.swingInterval?.rate0).toBe(1);
  });
});

describe('④回り方の利き', () => {
  it('ボス中心の周りを時計回り/反時計回りで一貫して分類する', () => {
    const st = createMicroRhythmState();
    const boss = { bcx: 0, bcy: 0 };
    // 右側(100,0)から上方向(0,-1)へ動く=反時計方向 or 時計方向のどちらかに一貫して分類される。
    stepMicroRhythm(st, baseInput({
      gameTime: 0, boss, pcx: 100, pcy: 0, prevPcx: null, prevPcy: null, dtMs: 16,
    }));
    stepMicroRhythm(st, baseInput({
      gameTime: 16, boss, pcx: 100, pcy: -50, prevPcx: 100, prevPcy: 0, dtMs: 16,
    }));
    const sample = foldMicroRhythm(st);
    expect(sample.orbit?.n).toBe(1);
    expect(sample.orbit?.rightRate === 0 || sample.orbit?.rightRate === 1).toBe(true);
  });
  it('放射方向だけの移動(接線成分が薄い)は数えない', () => {
    const st = createMicroRhythmState();
    const boss = { bcx: 0, bcy: 0 };
    stepMicroRhythm(st, baseInput({ gameTime: 0, boss, pcx: 100, pcy: 0 }));
    // まっすぐボスへ近づく=放射方向のみ
    stepMicroRhythm(st, baseInput({ gameTime: 16, boss, pcx: 50, pcy: 0, prevPcx: 100, prevPcy: 0, dtMs: 16 }));
    const sample = foldMicroRhythm(st);
    expect(sample.orbit).toBeUndefined();
  });
});

describe('⑥被弾直後の反応', () => {
  it('被弾直後1秒に振ったら「殴り返す」', () => {
    const st = createMicroRhythmState();
    const boss = { bcx: 500, bcy: 0 };
    stepMicroRhythm(st, baseInput({ gameTime: 0, boss, justDamaged: true }));
    stepMicroRhythm(st, baseInput({ gameTime: 300, boss, swungThisTick: true }));
    stepMicroRhythm(st, baseInput({ gameTime: HIT_REACT_WINDOW_MS + 1, boss }));
    const sample = foldMicroRhythm(st);
    expect(sample.hitReact?.n).toBe(1);
    // rate0=下がる, rate1=固まる, 残り=殴り返す(counter)
    expect(sample.hitReact?.rate0).toBe(0);
    expect(sample.hitReact?.rate1).toBe(0);
  });
  it('被弾直後1秒でボスから大きく離れたら「下がる」', () => {
    const st = createMicroRhythmState();
    const boss = { bcx: 0, bcy: 0 };
    stepMicroRhythm(st, baseInput({ gameTime: 0, boss, pcx: 100, pcy: 0, justDamaged: true }));
    stepMicroRhythm(st, baseInput({ gameTime: 300, boss, pcx: 300, pcy: 0 })); // 大きく離れた
    stepMicroRhythm(st, baseInput({ gameTime: HIT_REACT_WINDOW_MS + 1, boss, pcx: 300, pcy: 0 }));
    const sample = foldMicroRhythm(st);
    expect(sample.hitReact?.rate0).toBe(1);
  });
});

describe('⑧判断の間隔', () => {
  it('120ms以上安定した方向変化だけを「判断」と数える', () => {
    const st = createMicroRhythmState();
    stepMicroRhythm(st, baseInput({ gameTime: 0, lastDirection: { x: 1, y: 0 } }));
    // 確定させる(最初の確定はn=0のまま=基準点)
    stepMicroRhythm(st, baseInput({ gameTime: DECISION_DWELL_MS, lastDirection: { x: 1, y: 0 } }));
    // 指の震え(60ms未満で戻る)は数えない
    stepMicroRhythm(st, baseInput({ gameTime: DECISION_DWELL_MS + 10, lastDirection: { x: 0, y: 1 } }));
    stepMicroRhythm(st, baseInput({ gameTime: DECISION_DWELL_MS + 40, lastDirection: { x: 1, y: 0 } }));
    let sample = foldMicroRhythm(st);
    expect(sample.decisionInterval).toBeUndefined();
    // 120ms以上継続する方向変化=1回の判断として積む
    stepMicroRhythm(st, baseInput({ gameTime: DECISION_DWELL_MS + 200, lastDirection: { x: -1, y: 0 } }));
    stepMicroRhythm(st, baseInput({ gameTime: DECISION_DWELL_MS + 200 + DECISION_DWELL_MS, lastDirection: { x: -1, y: 0 } }));
    sample = foldMicroRhythm(st);
    expect(sample.decisionInterval?.n).toBe(1);
  });
});

describe('blend/fold: 欠損は前回値を保つ', () => {
  it('サンプル無し(undefined)はprevをそのまま返す', () => {
    expect(blendBin3(undefined, undefined, 0.3)).toBeUndefined();
    const prev = { n: 5, rate0: 0.5, rate1: 0.3 };
    expect(blendBin3(prev, undefined, 0.3)).toBe(prev);
  });
  it('blendHistDistは要素ごとにEMA・nは累計', () => {
    const prev = { n: 4, rates: [1, 0, 0] };
    const sample = { n: 1, rates: [0, 1, 0] };
    const merged = blendHistDist(prev, sample, 0.5);
    expect(merged?.n).toBe(5);
    expect(merged?.rates[0]).toBeCloseTo(0.5);
    expect(merged?.rates[1]).toBeCloseTo(0.5);
  });
  it('blendMicroRhythmはサンプル自体がundefinedならprevをそのまま返す', () => {
    expect(blendMicroRhythm(undefined, undefined, 0.3)).toBeUndefined();
  });
  it('全項目が空のサンプルはundefinedを返す(キー自体を生やさない)', () => {
    const merged = blendMicroRhythm(undefined, {}, 0.3);
    expect(merged).toBeUndefined();
  });
});

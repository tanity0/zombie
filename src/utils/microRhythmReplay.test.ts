// research/AI_HUMANIZE.md B3(§4「写す」側)。専用乱数流・バケット→値・合成既定分布の純関数テスト。
import { describe, it, expect } from 'vitest';
import {
  hashSeed, microRandAt, createMicroRandCursor,
  pickBin3, pickHistBucket,
  sampleOrbitSign, synthesizeMicroRhythm,
  DIST_BUCKET_PX, DIST_BUCKET_COUNT,
} from './microRhythmReplay';
import type { MicroBin3Dist, MicroHistDist } from './microRhythm';

describe('専用乱数流', () => {
  it('同じ(seed,drawIndex)は常に同じ値を返す(決定的)', () => {
    const seed = hashSeed('summon-123');
    expect(microRandAt(seed, 0)).toBe(microRandAt(seed, 0));
    expect(microRandAt(seed, 1)).toBe(microRandAt(seed, 1));
  });
  it('drawIndexが違えば(通常は)別の値になる', () => {
    const seed = hashSeed('summon-123');
    expect(microRandAt(seed, 0)).not.toBe(microRandAt(seed, 1));
  });
  it('idが違えばシードも違う(=別の乱数列)', () => {
    expect(hashSeed('a')).not.toBe(hashSeed('b'));
  });
  it('カーソルはdrawごとにindexを進め、nextIndex()で次tickへ持ち越せる', () => {
    const seed = hashSeed('x');
    const c1 = createMicroRandCursor(seed, 0);
    const v1 = c1.rand();
    const v2 = c1.rand();
    expect(c1.nextIndex()).toBe(2);
    const c2 = createMicroRandCursor(seed, 2);
    // 続きから引いた3回目の値は、最初のカーソルで3回引いた時の3回目と一致する。
    const c3 = createMicroRandCursor(seed, 0);
    c3.rand(); c3.rand();
    expect(c2.rand()).toBe(c3.rand());
    expect(v1).not.toBe(v2);
  });
});

describe('pickBin3', () => {
  const dist: MicroBin3Dist = { n: 10, rate0: 0.3, rate1: 0.3 }; // rate2=0.4
  it('欠損はfallbackBin', () => {
    expect(pickBin3(undefined, () => 0.5, 2)).toBe(2);
  });
  it('境界どおりにbinを割り当てる', () => {
    expect(pickBin3(dist, () => 0.1)).toBe(0); // <0.3
    expect(pickBin3(dist, () => 0.4)).toBe(1); // <0.6
    expect(pickBin3(dist, () => 0.9)).toBe(2); // 残り
  });
});

describe('pickHistBucket', () => {
  it('欠損/合計0はnull', () => {
    expect(pickHistBucket(undefined, () => 0.5)).toBeNull();
    expect(pickHistBucket({ n: 1, rates: new Array(DIST_BUCKET_COUNT).fill(0) }, () => 0.5)).toBeNull();
  });
  it('重みに応じたバケットを引く', () => {
    const dist: MicroHistDist = { n: 10, rates: [1, 0, 0] };
    expect(pickHistBucket(dist, () => 0.5)).toBe(0);
  });
});

describe('sampleOrbitSign', () => {
  it('欠損は五分五分(rand<0.5で+1)', () => {
    expect(sampleOrbitSign(undefined, () => 0.4)).toBe(1);
    expect(sampleOrbitSign(undefined, () => 0.6)).toBe(-1);
  });
  it('rightRate=1なら常に+1', () => {
    expect(sampleOrbitSign({ n: 10, rightRate: 1 }, () => 0.99)).toBe(1);
  });
});

describe('合成既定分布(synthesizeMicroRhythm)の決定性', () => {
  it('同じスカラーからは常に同じ分布が出る', () => {
    const a = synthesizeMicroRhythm(0.4, 5, 200);
    const b = synthesizeMicroRhythm(0.4, 5, 200);
    expect(a).toEqual(b);
  });
  it('全項目が埋まる(欠損なし)', () => {
    const p = synthesizeMicroRhythm(0.35, 3, 180);
    expect(p.stillness).toBeDefined();
    expect(p.swingInterval).toBeDefined();
    expect(p.distDist).toBeDefined();
    expect(p.pinchDistDist).toBeDefined();
    expect(p.orbit).toBeDefined();
    expect(p.hitReact).toBeDefined();
    expect(p.punishRecoverSpeed).toBeDefined();
    expect(p.decisionInterval).toBeDefined();
  });
  it('間合いの分布はpreferredDistの周辺に山を持つ(合計はほぼ1)', () => {
    const p = synthesizeMicroRhythm(0.35, 3, 200);
    const sum = p.distDist!.rates.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 5);
    const centerIdx = Math.round(200 / DIST_BUCKET_PX);
    expect(p.distDist!.rates[centerIdx]).toBeGreaterThan(0);
  });
});

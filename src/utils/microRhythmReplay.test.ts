// research/AI_HUMANIZE.md B3(§4「写す」側)。専用乱数流・バケット→値・合成既定分布の純関数テスト。
import { describe, it, expect } from 'vitest';
import {
  hashSeed, microRandAt, createMicroRandCursor,
  pickBin3, pickHistBucket,
  sampleOrbitSign, synthesizeMicroRhythm,
  DIST_BUCKET_PX, DIST_BUCKET_COUNT,
  PUNISH_FAST_MS, PUNISH_NORMAL_MS,
  meanStillMs, stillStartChance,
} from './microRhythmReplay';
import type { MicroBin3Dist, MicroHistDist } from './microRhythm';
import { STILL_MID_MS, STILL_SHORT_MS } from './microRhythm';
// ★検収是正(中5): 録り側(playerTraits.ts)/共有(punishWindow.ts)の複製定数との一致を機械検査する
// (bossTelegraph.test.ts「基準系の複製がズレていないこと」と同型の前例)。
import { DIST_BUCKET_PX as TRAIT_DIST_BUCKET_PX, DIST_BUCKET_COUNT as TRAIT_DIST_BUCKET_COUNT } from './playerTraits';
import { PUNISH_SPEED_FAST_MS, PUNISH_SPEED_NORMAL_MS } from './punishWindow';

describe('複製定数がズレていないこと(中5)', () => {
  it('DIST_BUCKET_PX/COUNT: playerTraits(録り)とmicroRhythmReplay(写し)が一致', () => {
    expect(DIST_BUCKET_PX).toBe(TRAIT_DIST_BUCKET_PX);
    expect(DIST_BUCKET_COUNT).toBe(TRAIT_DIST_BUCKET_COUNT);
  });
  it('PUNISH_FAST_MS/NORMAL_MS: punishWindow(録り)とmicroRhythmReplay(写し)が一致', () => {
    expect(PUNISH_FAST_MS).toBe(PUNISH_SPEED_FAST_MS);
    expect(PUNISH_NORMAL_MS).toBe(PUNISH_SPEED_NORMAL_MS);
  });
});

// ★B3検収(重大1): 占有率保存の逆算式(meanStillMs/stillStartChance)そのものの単体テスト。
describe('meanStillMs', () => {
  it('bin0(short)のみなら期待値はSTILL_SHORT_MS/2(一様分布の中点)', () => {
    expect(meanStillMs({ n: 10, rate0: 1, rate1: 0 })).toBeCloseTo(STILL_SHORT_MS / 2, 6);
  });
  it('bin2(long)のみなら期待値はSTILL_MID_MS*1.5(sampleStillMsのlong範囲と同じ中点)', () => {
    expect(meanStillMs({ n: 10, rate0: 0, rate1: 0 })).toBeCloseTo(STILL_MID_MS * 1.5, 6);
  });
  it('欠損(undefined/n<=0)はSTILL_MID_MSへフォールバック', () => {
    expect(meanStillMs(undefined)).toBe(STILL_MID_MS);
    expect(meanStillMs({ n: 0, rate0: 1, rate1: 0 })).toBe(STILL_MID_MS);
  });
});

describe('stillStartChance(①占有率保存の逆算式)', () => {
  it('targetOcc→1で開始確率→0(=止まらない)', () => {
    expect(stillStartChance(0.999999, 900, 1000 / 60)).toBeLessThan(0.001);
  });
  it('targetOcc→0で開始確率→1(=毎tick止まる)', () => {
    expect(stillStartChance(0.000001, 900, 1000 / 60)).toBeGreaterThan(0.999);
  });
  it('targetOcc=1は0を返す(境界)', () => {
    expect(stillStartChance(1, 900, 1000 / 60)).toBe(0);
  });
  it('導出式どおりに占有率を再現する(解析的な検算): p→動いている区間の平均長Ta→再構成した占有率がtargetOccと一致', () => {
    const dt = 1000 / 60;
    for (const [occ, ts] of [[0.6, 300], [0.325, 100], [0.825, 900]] as const) {
      const p = stillStartChance(occ, ts, dt);
      const ta = (dt * (1 - p)) / p; // 幾何分布の失敗回数期待値×dt(逆算の定義どおり)
      const reconstructedOcc = ta / (ta + ts);
      expect(reconstructedOcc).toBeCloseTo(occ, 5);
    }
  });
});

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

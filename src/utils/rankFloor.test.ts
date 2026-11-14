import { describe, expect, it } from 'vitest';
import { RANK_FLOOR_CAP, rankFloorIntervalMs, rankFloorForElapsed, parseRankFloorPaceMult } from './rankFloor';

describe('rankFloorIntervalMs(案A・PACING_PUZZLE.md §7-11c(2))', () => {
  it('掲載ステージの間隔(分→ms)', () => {
    expect(rankFloorIntervalMs('stage-1')).toBeCloseTo(3.5 * 60000, 6);
    expect(rankFloorIntervalMs('stage-3')).toBeCloseTo(2.8 * 60000, 6);
    expect(rankFloorIntervalMs('stage-4')).toBeCloseTo(2.1 * 60000, 6);
    expect(rankFloorIntervalMs('stage-5')).toBeCloseTo(1.68 * 60000, 6);
    expect(rankFloorIntervalMs('stage-6')).toBeCloseTo(1.4 * 60000, 6);
  });
  it('未掲載ステージ(stage-2/stage-7/チュートリアル/EX/未指定)はInfinity=床なし', () => {
    for (const id of ['stage-2', 'stage-7', 'stage-tutorial', 'stage-ex1', '', 'unknown']) {
      expect(rankFloorIntervalMs(id), id).toBe(Infinity);
    }
  });
});

describe('rankFloorForElapsed', () => {
  it('t=0は常にR1', () => {
    expect(rankFloorForElapsed('stage-1', 0)).toBe(1);
    expect(rankFloorForElapsed('stage-6', 0)).toBe(1);
  });
  it('stage-6(1.4分間隔・延長計画2026-10-12)は1.4分ごとに1段上がり、上限R5で頭打ち', () => {
    const iv = 1.4 * 60_000;
    expect(rankFloorForElapsed('stage-6', iv - 1)).toBe(1);
    expect(rankFloorForElapsed('stage-6', iv)).toBe(2);
    expect(rankFloorForElapsed('stage-6', iv * 2)).toBe(3);
    expect(rankFloorForElapsed('stage-6', iv * 3)).toBe(4);
    expect(rankFloorForElapsed('stage-6', iv * 4)).toBe(5);
    expect(rankFloorForElapsed('stage-6', iv * 4 + 1)).toBe(5); // 上限R5=RANK_FLOOR_CAP
    expect(rankFloorForElapsed('stage-6', 10_000_000)).toBe(RANK_FLOOR_CAP);
  });
  it('stage-1(3.5分間隔・延長計画2026-10-12)の刻み', () => {
    const min = 60_000;
    expect(rankFloorForElapsed('stage-1', 3.5 * min - 1)).toBe(1);
    expect(rankFloorForElapsed('stage-1', 3.5 * min)).toBe(2);
    expect(rankFloorForElapsed('stage-1', 7 * min)).toBe(3);
  });
  it('★延長計画の不変条件: 城ボスの時点(7:00)の床ランクは、旧(5:00・旧間隔)と同じ', () => {
    const min = 60_000;
    const old: Record<string, number> = { 'stage-1': 2.5, 'stage-3': 2.0, 'stage-4': 1.5, 'stage-5': 1.2, 'stage-6': 1.0 };
    for (const [id, oldMin] of Object.entries(old)) {
      const oldAtBoss = Math.min(RANK_FLOOR_CAP, 1 + Math.floor((5 * min) / (oldMin * min)));
      expect(rankFloorForElapsed(id, 7 * min), id).toBe(oldAtBoss);
    }
  });
  it('未掲載ステージは経過時間に関わらず常にR1', () => {
    expect(rankFloorForElapsed('stage-2', 10_000_000)).toBe(1);
    expect(rankFloorForElapsed('stage-tutorial', 10_000_000)).toBe(1);
  });
  it('?rankfloorpace倍率: 大きいほど間隔が伸びる(床の上昇が遅くなる)', () => {
    const iv = 1.4 * 60_000;
    expect(rankFloorForElapsed('stage-6', iv, 2)).toBe(1);   // 2倍=2倍待たないと上がらない
    expect(rankFloorForElapsed('stage-6', iv * 2, 2)).toBe(2);
    expect(rankFloorForElapsed('stage-6', iv, 0.5)).toBe(3); // 0.5倍=半分の時間で同じ段数
  });
  it('paceMultの異常値(0以下・NaN)は既定1へフォールバック', () => {
    const iv = 1.4 * 60_000;
    expect(rankFloorForElapsed('stage-6', iv, 0)).toBe(2);
    expect(rankFloorForElapsed('stage-6', iv, -3)).toBe(2);
    expect(rankFloorForElapsed('stage-6', iv, NaN)).toBe(2);
  });
});

describe('parseRankFloorPaceMult', () => {
  it('正の数値はそのまま', () => {
    expect(parseRankFloorPaceMult('2')).toBe(2);
    expect(parseRankFloorPaceMult('0.5')).toBe(0.5);
  });
  it('空/null/undefined/0以下/NaNは既定1', () => {
    expect(parseRankFloorPaceMult(null)).toBe(1);
    expect(parseRankFloorPaceMult(undefined)).toBe(1);
    expect(parseRankFloorPaceMult('')).toBe(1);
    expect(parseRankFloorPaceMult('0')).toBe(1);
    expect(parseRankFloorPaceMult('-1')).toBe(1);
    expect(parseRankFloorPaceMult('junk')).toBe(1);
  });
});

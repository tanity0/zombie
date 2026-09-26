import { describe, expect, it } from 'vitest';
import { RANK_FLOOR_CAP, rankFloorIntervalMs, rankFloorForElapsed, parseRankFloorPaceMult } from './rankFloor';

describe('rankFloorIntervalMs(案A・PACING_PUZZLE.md §7-11c(2))', () => {
  it('掲載ステージの間隔(分→ms)', () => {
    expect(rankFloorIntervalMs('stage-1')).toBe(2.5 * 60000);
    expect(rankFloorIntervalMs('stage-3')).toBe(2.0 * 60000);
    expect(rankFloorIntervalMs('stage-4')).toBe(1.5 * 60000);
    expect(rankFloorIntervalMs('stage-5')).toBe(1.2 * 60000);
    expect(rankFloorIntervalMs('stage-6')).toBe(1.0 * 60000);
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
  it('stage-6(1分間隔)は1分ごとに1段上がり、上限R5で頭打ち', () => {
    expect(rankFloorForElapsed('stage-6', 59_999)).toBe(1);
    expect(rankFloorForElapsed('stage-6', 60_000)).toBe(2);
    expect(rankFloorForElapsed('stage-6', 120_000)).toBe(3);
    expect(rankFloorForElapsed('stage-6', 180_000)).toBe(4);
    expect(rankFloorForElapsed('stage-6', 240_000)).toBe(5);
    expect(rankFloorForElapsed('stage-6', 240_001)).toBe(5); // 上限R5=RANK_FLOOR_CAP
    expect(rankFloorForElapsed('stage-6', 10_000_000)).toBe(RANK_FLOOR_CAP);
  });
  it('stage-1(2.5分間隔)の刻み', () => {
    const min = 60_000;
    expect(rankFloorForElapsed('stage-1', 2.5 * min - 1)).toBe(1);
    expect(rankFloorForElapsed('stage-1', 2.5 * min)).toBe(2);
    expect(rankFloorForElapsed('stage-1', 5 * min)).toBe(3);
  });
  it('未掲載ステージは経過時間に関わらず常にR1', () => {
    expect(rankFloorForElapsed('stage-2', 10_000_000)).toBe(1);
    expect(rankFloorForElapsed('stage-tutorial', 10_000_000)).toBe(1);
  });
  it('?rankfloorpace倍率: 大きいほど間隔が伸びる(床の上昇が遅くなる)', () => {
    expect(rankFloorForElapsed('stage-6', 60_000, 2)).toBe(1);   // 2倍=2分待たないと上がらない
    expect(rankFloorForElapsed('stage-6', 120_000, 2)).toBe(2);
    expect(rankFloorForElapsed('stage-6', 60_000, 0.5)).toBe(3); // 0.5倍=半分の時間で同じ段数
  });
  it('paceMultの異常値(0以下・NaN)は既定1へフォールバック', () => {
    expect(rankFloorForElapsed('stage-6', 60_000, 0)).toBe(2);
    expect(rankFloorForElapsed('stage-6', 60_000, -3)).toBe(2);
    expect(rankFloorForElapsed('stage-6', 60_000, NaN)).toBe(2);
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

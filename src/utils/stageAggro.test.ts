import { describe, it, expect } from 'vitest';
import { stageAggroFor, riseTauSForAggro, boredStartMsForAggro, gateMaxRungClampForAggro, STAGE_AGGRO_DEFAULT } from './stageAggro';

describe('stageAggroFor (PACING_REDESIGN.mdバッチ6)', () => {
  it('明示表どおりの値を返す', () => {
    expect(stageAggroFor('stage-1')).toBe(0.0);
    expect(stageAggroFor('stage-3')).toBe(0.35);
    expect(stageAggroFor('stage-4')).toBe(0.6);
    expect(stageAggroFor('stage-5')).toBe(0.8);
    expect(stageAggroFor('stage-6')).toBe(1.0);
  });
  it('終盤/クリア後コンテンツ(stage-7/EX)はstage-6と同じ上限を継続する', () => {
    expect(stageAggroFor('stage-7')).toBe(1.0);
    expect(stageAggroFor('stage-ex1')).toBe(1.0);
    expect(stageAggroFor('stage-ex2')).toBe(1.0);
  });
  it('未選択/フリー/ベンチ/未知idは中立値(=バッチ6導入前の固定値と完全一致)', () => {
    expect(stageAggroFor('')).toBe(STAGE_AGGRO_DEFAULT);
    expect(stageAggroFor(undefined)).toBe(STAGE_AGGRO_DEFAULT);
    expect(stageAggroFor(null)).toBe(STAGE_AGGRO_DEFAULT);
    expect(stageAggroFor('stage-2')).toBe(STAGE_AGGRO_DEFAULT); // labは呼び出し側で既に対象外
    expect(stageAggroFor('nonexistent')).toBe(STAGE_AGGRO_DEFAULT);
  });
});

describe('riseTauSForAggro', () => {
  it('中立値0.5でバッチ3既定の8sに一致する(no-op)', () => {
    expect(riseTauSForAggro(0.5)).toBe(8);
  });
  it('stageAggro=0で最も遅い(10s)/1で最も速い(6s)', () => {
    expect(riseTauSForAggro(0)).toBe(10);
    expect(riseTauSForAggro(1)).toBe(6);
  });
  it('0..1の範囲外はクランプする', () => {
    expect(riseTauSForAggro(-1)).toBe(10);
    expect(riseTauSForAggro(2)).toBe(6);
  });
});

describe('boredStartMsForAggro', () => {
  it('中立値0.5で既定の25000msに一致する(no-op)', () => {
    expect(boredStartMsForAggro(0.5)).toBe(25000);
  });
  it('stageAggro=0で最も遅い(30000ms)/1で最も速い(20000ms)', () => {
    expect(boredStartMsForAggro(0)).toBe(30000);
    expect(boredStartMsForAggro(1)).toBe(20000);
  });
});

describe('gateMaxRungClampForAggro', () => {
  it('stageAggro=0で3(数の関所のみ)/1で7(全段解禁)', () => {
    expect(gateMaxRungClampForAggro(0)).toBe(3);
    expect(gateMaxRungClampForAggro(1)).toBe(7);
  });
  it('stageAggro=0.5で5(仕様例と一致)', () => {
    expect(gateMaxRungClampForAggro(0.5)).toBe(5);
  });
  it('仕様の式どおりstage-1(aggro=0.0)は3を返す(仕様文中の「最大段4まで」注記との食い違いはPACING_REDESIGN.mdの★未決事項へ記載)', () => {
    expect(gateMaxRungClampForAggro(0.0)).toBe(3);
  });
});

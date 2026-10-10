import { describe, it, expect } from 'vitest';
import {
  softCapCritChance,
  orCombineChance,
  CRIT_SOFT_CAP_KNEE,
  CRIT_SOFT_CAP_CEIL,
} from './critSoftCap';

describe('softCapCritChance (PACING_PUZZLE §13-3d)', () => {
  it('KNEE(30%)までは素通し=序盤・中盤は1ptも変わらない', () => {
    for (const s of [0, 0.05, 0.10, 0.18, 0.27, CRIT_SOFT_CAP_KNEE]) {
      expect(softCapCritChance(s)).toBeCloseTo(s, 10);
    }
  });

  it('CEIL(50%)へは漸近するだけで到達しない=「100%クリ」が消える', () => {
    // 実在しうる積み上げ(最大でも合計1.04=銃の上限+一時バフ)を大きく超える2.0まで見る。
    // ※これより先は倍精度の丸めでちょうど0.50になる(数学的には到達しない)ので、
    //   到達しないことの検査は「起こりうる範囲」で行い、全域では ≤ を保証する。
    for (const s of [0.6, 0.8, 1.0, 1.5, 2.0]) {
      expect(softCapCritChance(s)).toBeLessThan(CRIT_SOFT_CAP_CEIL);
    }
    for (const s of [10, 100]) {
      expect(softCapCritChance(s)).toBeLessThanOrEqual(CRIT_SOFT_CAP_CEIL);
    }
  });

  // ★これが「嘘にならない」の機械化(社長指摘2026-08-26)。装備・スキルの説明文はクリ率を数値で
  // 明示しているので、どこまで積んでも「+X%」が実効を1ptも動かさない状態を作ってはいけない。
  it('どの積み上げ量でも、足した分は必ず実効を押し上げる(死に効果を作らない)', () => {
    for (let s = 0; s <= 1.5; s += 0.01) {
      expect(softCapCritChance(s + 0.01)).toBeGreaterThan(softCapCritChance(s));
    }
  });

  it('単調増加・非負', () => {
    let prev = -1;
    for (let s = 0; s <= 3; s += 0.005) {
      const v = softCapCritChance(s);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeGreaterThan(prev);
      prev = v;
    }
    expect(softCapCritChance(-1)).toBe(0);
  });

  it('設計書§13-3dの表と一致する(上限ビルドの着地)', () => {
    expect(softCapCritChance(0.68)).toBeCloseTo(0.470, 3); // 近接: T4+パッシブcap+ナイフマスターLv3
    expect(softCapCritChance(0.93)).toBeCloseTo(0.491, 3); // 近接: 同上・対スケルトン(弱点+25%)
    expect(softCapCritChance(0.79)).toBeCloseTo(0.483, 3); // 銃: ライフルT3+パッシブcap+装備cap
    expect(softCapCritChance(1.04)).toBeCloseTo(0.495, 3); // 銃: 同上+クイックマガジン+弁慶
  });
});

describe('orCombineChance', () => {
  it('独立ロールのOR(どちらか当たる)と数学的に同じ', () => {
    for (const [a, b] of [[0.2, 0.1], [0.79, 0.2], [0, 0.1], [0.5, 0]] as const) {
      expect(orCombineChance(a, b)).toBeCloseTo(1 - (1 - a) * (1 - b), 12);
    }
  });

  it('片方が0なら他方そのまま=トラップ/弱点が無い時に確率が動かない', () => {
    expect(orCombineChance(0.26, 0)).toBeCloseTo(0.26, 12);
    expect(orCombineChance(0, 0)).toBe(0);
  });
});

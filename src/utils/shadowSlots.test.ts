import { describe, it, expect } from 'vitest';
import {
  smoothstep01, glowFalloff, glowLenMult, glowScore,
  explosionSilAlpha, ambientSilAlpha, pickExplSlot, rankFade, shouldFreezeGeom,
  SHADOW_GLOW_MIN_DIST_PX, SHADOW_EVICT_ALPHA_MAX, SHADOW_AMB_WASH, SHADOW_GLOW_LEN_CAP,
  type ExplSlotView,
} from './shadowSlots';

const WEIGHT = 2.2;   // SHADOW_GLOW_WEIGHT
const STRETCH = 0.9;  // SHADOW_GLOW_STRETCH

describe('smoothstep01', () => {
  it('端で 0 と 1、中点で 0.5', () => {
    expect(smoothstep01(10, 20, 5)).toBe(0);
    expect(smoothstep01(10, 20, 10)).toBe(0);
    expect(smoothstep01(10, 20, 15)).toBeCloseTo(0.5, 6);
    expect(smoothstep01(10, 20, 20)).toBe(1);
    expect(smoothstep01(10, 20, 99)).toBe(1);
  });
  it('幅ゼロでも NaN を出さない', () => {
    expect(smoothstep01(10, 10, 9)).toBe(0);
    expect(smoothstep01(10, 10, 10)).toBe(1);
  });
});

describe('glowFalloff: 幾何に使う減衰(明るさは入らない)', () => {
  it('届く距離の外は 0', () => {
    expect(glowFalloff(200, 100)).toBe(0);
    expect(glowFalloff(100, 100)).toBe(0);
  });
  it('reach が 0 以下でも NaN を出さない', () => {
    expect(glowFalloff(10, 0)).toBe(0);
    expect(glowFalloff(10, -5)).toBe(0);
  });
  it('★近接ガードは二値ではなくランプ(1フレームで影が裏返らない)', () => {
    const reach = 1000;
    const a = glowFalloff(SHADOW_GLOW_MIN_DIST_PX - 1, reach);
    const b = glowFalloff(SHADOW_GLOW_MIN_DIST_PX + 1, reach);
    const c = glowFalloff(SHADOW_GLOW_MIN_DIST_PX * 2, reach);
    expect(a).toBe(0);                 // 24px 未満は完全に抑制
    expect(b).toBeGreaterThan(0);
    expect(b).toBeLessThan(c);         // 24→48 の間で滑らかに立ち上がる
    // v11 の二値判定なら b はいきなり c と同じ値になっていた(=丸ごと入れ替わる)
    expect(b).toBeLessThan(c * 0.2);
  });
  it('十分遠ざかれば近接ガードは効かず、距離に対して単調に減る', () => {
    const reach = 1000;
    let prev = Infinity;
    for (let d = 100; d < 1000; d += 50) {
      const v = glowFalloff(d, reach);
      expect(v).toBeLessThan(prev);
      prev = v;
    }
  });
});

describe('glowLenMult: 伸び(位置だけで決まる)', () => {
  it('★明るさを渡す口が無い=光が暗くなっても影は縮まない', () => {
    // falloff が同じなら life に関係なく同じ長さ(引数に life が無いこと自体が仕様)
    expect(glowLenMult(0.5, WEIGHT, STRETCH)).toBe(glowLenMult(0.5, WEIGHT, STRETCH));
  });
  it('falloff=0 で等倍', () => {
    expect(glowLenMult(0, WEIGHT, STRETCH)).toBe(1);
  });
  it('★上限は 2.8倍(v9 と一致する)', () => {
    expect(glowLenMult(1, WEIGHT, STRETCH)).toBeCloseTo(1 + STRETCH * SHADOW_GLOW_LEN_CAP, 6);
    expect(glowLenMult(1, WEIGHT, STRETCH)).toBeCloseTo(2.8, 6);
    expect(glowLenMult(99, WEIGHT, STRETCH)).toBeCloseTo(2.8, 6); // どれだけ近くても 2.8 を超えない
  });
  it('falloff に対して単調に増える', () => {
    let prev = -Infinity;
    for (let f = 0; f <= 0.9; f += 0.1) {
      const v = glowLenMult(f, WEIGHT, STRETCH);
      expect(v).toBeGreaterThan(prev);
      prev = v;
    }
  });
});

describe('濃さ', () => {
  it('爆発シルエットαは falloff×life に比例', () => {
    expect(explosionSilAlpha(0.46, 0.5, 0.5)).toBeCloseTo(0.46 * 0.25, 6);
    expect(explosionSilAlpha(0.46, 1, 1)).toBeCloseTo(0.46, 6);
  });
  it('life は 0..1 でクランプ(壊れた値で濃くならない)', () => {
    expect(glowScore(1, 5)).toBe(1);
    expect(glowScore(1, -3)).toBe(0);
  });
  it('★Σ=0.5 で環境光の影が消える(WASH=2.0)', () => {
    expect(ambientSilAlpha(0.46, 0)).toBeCloseTo(0.46, 6);
    expect(ambientSilAlpha(0.46, 0.25)).toBeCloseTo(0.46 * 0.5, 6);
    expect(ambientSilAlpha(0.46, 0.5)).toBe(0);
    expect(ambientSilAlpha(0.46, 1)).toBe(0);
    expect(SHADOW_AMB_WASH).toBe(2.0);
  });
  it('Σ が範囲外でも負のαにならない', () => {
    expect(ambientSilAlpha(0.46, 99)).toBe(0);
    expect(ambientSilAlpha(0.46, -1)).toBeCloseTo(0.46, 6);
  });
});

describe('pickExplSlot: 爆発スロットの取り合い', () => {
  const empty: ExplSlotView[] = [
    { lightId: null, score: 0, alpha: 0 },
    { lightId: null, score: 0, alpha: 0 },
  ];

  it('空きがあれば入る(若い方から)', () => {
    expect(pickExplSlot(empty, 'g1', 0.5)).toEqual({ kind: 'take', slot: 0 });
    expect(pickExplSlot([{ lightId: 'a', score: 0.9, alpha: 0.4 }, { lightId: null, score: 0, alpha: 0 }], 'g1', 0.1))
      .toEqual({ kind: 'take', slot: 1 });
  });

  it('既に居るなら keep(毎フレーム更新するだけ)', () => {
    const slots: ExplSlotView[] = [{ lightId: 'a', score: 0.9, alpha: 0.4 }, { lightId: 'b', score: 0.2, alpha: 0.1 }];
    expect(pickExplSlot(slots, 'b', 0.15)).toEqual({ kind: 'keep', slot: 1 });
  });

  it('★新参が最小なら入らない(遠方の弱い爆発が足元の濃い影を叩き出せない)', () => {
    const slots: ExplSlotView[] = [{ lightId: 'a', score: 0.9, alpha: 0.4 }, { lightId: 'b', score: 0.5, alpha: 0.3 }];
    expect(pickExplSlot(slots, 'c', 0.4)).toEqual({ kind: 'reject' });
    expect(pickExplSlot(slots, 'c', 0.5)).toEqual({ kind: 'reject' }); // 同点も入らない
  });

  it('★見えている影は追い出さない(αが閾値超えなら reject)', () => {
    const slots: ExplSlotView[] = [
      { lightId: 'a', score: 0.9, alpha: 0.4 },
      { lightId: 'b', score: 0.1, alpha: SHADOW_EVICT_ALPHA_MAX + 0.01 },
    ];
    expect(pickExplSlot(slots, 'c', 0.8)).toEqual({ kind: 'reject' });
  });

  it('消えかけの影(α≦閾値)なら、より強い新参が押し出せる', () => {
    const slots: ExplSlotView[] = [
      { lightId: 'a', score: 0.9, alpha: 0.4 },
      { lightId: 'b', score: 0.1, alpha: SHADOW_EVICT_ALPHA_MAX },
    ];
    expect(pickExplSlot(slots, 'c', 0.8)).toEqual({ kind: 'evict', slot: 1 });
  });

  it('★3つ目の濃い爆発が同時に来ても「出ないだけ」でポップは起きない', () => {
    const slots: ExplSlotView[] = [
      { lightId: 'a', score: 0.9, alpha: 0.45 },
      { lightId: 'b', score: 0.8, alpha: 0.40 },
    ];
    // 一番強くても、見えている影は追い出さない ⇒ reject(既存の2本はそのまま生き続ける)
    expect(pickExplSlot(slots, 'c', 0.95)).toEqual({ kind: 'reject' });
  });

  it('スロットが無ければ reject(0除算・undefined 参照を出さない)', () => {
    expect(pickExplSlot([], 'g1', 1)).toEqual({ kind: 'reject' });
  });
});

describe('rankFade: 枠の境界を明滅させない', () => {
  it('枠内の上位はフル、枠外は 0', () => {
    expect(rankFade(0, 10)).toBe(1);
    expect(rankFade(7, 10)).toBe(1);
    expect(rankFade(10, 10)).toBe(0);
    expect(rankFade(99, 10)).toBe(0);
  });
  it('★下位20%は線形に落ちる(切り落とさない)', () => {
    // budget=10 → solid=8。rank 8 で 1、rank 10 で 0 へ線形
    expect(rankFade(8, 10)).toBeCloseTo(1, 6);
    expect(rankFade(9, 10)).toBeCloseTo(0.5, 6);
  });
  it('順位に対して単調に減る', () => {
    let prev = Infinity;
    for (let r = 0; r <= 12; r++) {
      const v = rankFade(r, 10);
      expect(v).toBeLessThanOrEqual(prev);
      prev = v;
    }
  });
  it('枠が 0 以下なら 0', () => {
    expect(rankFade(0, 0)).toBe(0);
    expect(rankFade(0, -1)).toBe(0);
  });
});

describe('shouldFreezeGeom: 圏外で幾何を凍結する', () => {
  it('圏内なら凍結しない=毎フレーム再計算(物体が動けば影も動く)', () => {
    expect(shouldFreezeGeom(50, 100, false)).toBe(false);
    expect(shouldFreezeGeom(100, 100, false)).toBe(false); // 境界は圏内扱い
  });
  it('圏外へ出たら凍結する', () => {
    expect(shouldFreezeGeom(101, 100, false)).toBe(true);
  });
  it('★一度凍結したら圏内へ戻っても解除しない(幾何が飛ばない)', () => {
    expect(shouldFreezeGeom(10, 100, true)).toBe(true);
  });
});

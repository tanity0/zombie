import { describe, it, expect } from 'vitest';
import { ammoDirectorRate } from './ammoDirector';

describe('ammoDirectorRate (v0.25.2170・弾薬AIディレクター)', () => {
  it('備蓄満タン(ratio≥0.5)なら常にbasePct(枯渇度0)', () => {
    const input = { families: [{ reserve: 40, max: 72 }, { reserve: 20, max: 24 }], enemyCount: 30 };
    // ratio = 60/96 ≈ 0.625 ≥ 0.5 → 敵の多さに関わらずbasePctのまま
    expect(ammoDirectorRate(10, input)).toBe(10);
  });

  it('枯渇(ratio≤0.15)+敵25以上でちょうど上限20', () => {
    const input = { families: [{ reserve: 10.8, max: 72 }, { reserve: 0, max: 24 }], enemyCount: 25 };
    // ratio = 10.8/96 = 0.1125 ≤ 0.15 → 枯渇度1、敵25 → 圧力1
    expect(ammoDirectorRate(10, input)).toBeCloseTo(20, 5);
  });

  it('枯渇+敵0で basePct+(20-base)*0.35(圧力フロア)', () => {
    const input = { families: [{ reserve: 0, max: 72 }], enemyCount: 0 };
    // ratio = 0 ≤ 0.15 → 枯渇度1、敵0 → 圧力0 → フロアの0.35だけ効く
    expect(ammoDirectorRate(10, input)).toBeCloseTo(10 + (20 - 10) * 0.35, 5);
  });

  it('families空でbasePctをそのまま返す', () => {
    expect(ammoDirectorRate(10, { families: [], enemyCount: 30 })).toBe(10);
  });

  it('備蓄率が単調に減るほど底上げ率は単調に増える', () => {
    const enemyCount = 30; // 圧力1で固定
    const ratios = [0.5, 0.4, 0.3, 0.2, 0.15, 0.05];
    const rates = ratios.map(ratio =>
      ammoDirectorRate(10, { families: [{ reserve: ratio * 100, max: 100 }], enemyCount })
    );
    for (let i = 1; i < rates.length; i++) {
      expect(rates[i]).toBeGreaterThanOrEqual(rates[i - 1]);
    }
    expect(rates[rates.length - 1]).toBeGreaterThan(rates[0]);
  });
});

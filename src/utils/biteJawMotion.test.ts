import { describe, it, expect } from 'vitest';
import { biteJawFrame, BITE_HOLD_FRAC, BITE_GAPE_OVERSHOOT, BITE_REBOUND_OPEN } from './biteJawMotion';

// 社長指示v0.25.3468「ブルブル顎が震えて、一気にガツンと噛んで、噛んだ時は反動で少し浮いてまた閉じる」
// を不変条件として固定する(数値の微調整は自由・**動きの構造**が壊れないことを見張る)。
describe('噛みつきの顎モーション', () => {
  it('溜めの大半は「開いたままキープ」(ジワジワ閉じない)', () => {
    for (const u of [0, 0.2, 0.5, 0.8, BITE_HOLD_FRAC - 0.01]) {
      expect(biteJawFrame(u, 0).open).toBe(1);
    }
  });

  it('噛む直前は溜めで**さらに開く**(全開を超える)', () => {
    const t = BITE_HOLD_FRAC + (1 - BITE_HOLD_FRAC) * 0.3;
    expect(biteJawFrame(t, 0).open).toBeGreaterThan(1);
    expect(biteJawFrame(t, 0).open).toBeLessThanOrEqual(BITE_GAPE_OVERSHOOT);
  });

  it('閉じは一瞬=溜めの最後の短い区間で0まで落ちる', () => {
    const closeStart = BITE_HOLD_FRAC + (1 - BITE_HOLD_FRAC) * 0.35;
    expect(biteJawFrame(closeStart, 0).open).toBeGreaterThan(1);
    expect(biteJawFrame(0.999, 0).open).toBeLessThan(0.05);
  });

  it('閉じは加速する(等速で閉じない=後半ほど速い)', () => {
    const a = BITE_HOLD_FRAC + (1 - BITE_HOLD_FRAC) * 0.5;
    const b = BITE_HOLD_FRAC + (1 - BITE_HOLD_FRAC) * 0.7;
    const c = BITE_HOLD_FRAC + (1 - BITE_HOLD_FRAC) * 0.9;
    const d1 = biteJawFrame(a, 0).open - biteJawFrame(b, 0).open; // 前半の変化量
    const d2 = biteJawFrame(b, 0).open - biteJawFrame(c, 0).open; // 後半の変化量
    expect(d2).toBeGreaterThan(d1);
  });

  it('噛んだ後は反動で開き直し、頂点を過ぎたら減衰して閉じる', () => {
    const peak = biteJawFrame(1, 0.22).open;
    expect(peak).toBeCloseTo(BITE_REBOUND_OPEN, 5);
    expect(biteJawFrame(1, 0.05).open).toBeLessThan(peak);   // 立ち上がり途中
    expect(biteJawFrame(1, 0.6).open).toBeLessThan(peak);    // 減衰中
    expect(biteJawFrame(1, 1).open).toBeCloseTo(0, 5);       // 収まる
  });

  it('噛んだ瞬間に浮いて、すぐ戻る(浮きっぱなしにしない)', () => {
    expect(biteJawFrame(1, 0).liftPx).toBeGreaterThan(0);
    expect(biteJawFrame(1, 0.3).liftPx).toBeLessThan(biteJawFrame(1, 0).liftPx);
    expect(biteJawFrame(1, 0.6).liftPx).toBe(0);
    expect(biteJawFrame(0.5, 0).liftPx).toBe(0); // 噛む前は浮かない
  });

  it('範囲外の入力でも壊れない(クランプ)', () => {
    expect(biteJawFrame(-1, 0).open).toBe(1);
    expect(biteJawFrame(2, 2).open).toBeCloseTo(0, 5);
  });
});

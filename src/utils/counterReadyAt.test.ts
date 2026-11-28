import { describe, it, expect } from 'vitest';
import { counterReadyAt, counterRingFade, COUNTER_RING_FADE_MS } from './counterReadyAt';
import { whipComboCounterPlan, WHIP_COMBO_RESET_MS } from './whipCombo';
import { knifeComboCounterPlan, KNIFE_COMBO_RESET_MS } from './knifeCombo';

describe('counterReadyAt', () => {
  const p = { counterCooldownEnd: 1500, whipCounterReadyAt: 2740, knifeCounterReadyAt: 2520 };
  it('鞭=段の間隔とカウンター待ちの遅い方', () => {
    expect(counterReadyAt(p, 'whip')).toBe(2740);
    expect(counterReadyAt({ ...p, whipCounterReadyAt: 1000 }, 'whip')).toBe(1500);
    expect(counterReadyAt({ counterCooldownEnd: 1500 }, 'whip')).toBe(1500);
  });
  it('ナイフ=段の間隔とカウンター待ちの遅い方', () => {
    expect(counterReadyAt(p, 'knife')).toBe(2520);
    expect(counterReadyAt({ counterCooldownEnd: 1500 }, 'knife')).toBe(1500);
  });
  it('それ以外=今まで通り counterCooldownEnd', () => {
    expect(counterReadyAt(p, 'other')).toBe(1500);
  });
  it('鞭: 1段目で止めた=振り+戻り+CD / 3段振った=3段目+CD(連撃中は後ろへずれる)', () => {
    const cd = 1040;
    const s1 = whipComboCounterPlan(1, 0, 0, false, cd);
    expect(counterReadyAt({ counterCooldownEnd: 500, whipCounterReadyAt: s1.readyAt }, 'whip')).toBe(WHIP_COMBO_RESET_MS + cd);
    const s2 = whipComboCounterPlan(2, 500, s1.readyAt, s1.comboCounter, cd);
    expect(s2.readyAt).toBe(500 + WHIP_COMBO_RESET_MS + cd);
    const s3 = whipComboCounterPlan(3, 1000, s2.readyAt, s2.comboCounter, cd);
    expect(counterReadyAt({ counterCooldownEnd: 2000, whipCounterReadyAt: s3.readyAt }, 'whip')).toBe(1000 + cd);
  });
  it('ナイフ: 同じ規則', () => {
    const cd = 820;
    const s1 = knifeComboCounterPlan(1, 0, 0, false, cd);
    expect(counterReadyAt({ counterCooldownEnd: 500, knifeCounterReadyAt: s1.readyAt }, 'knife')).toBe(KNIFE_COMBO_RESET_MS + cd);
  });
});

describe('counterRingFade', () => {
  it('待ちの間は1・終わりの FADE_MS で0へ・使える時刻で0', () => {
    expect(counterRingFade(1000, 0)).toBe(1);
    expect(counterRingFade(1000, 1000 - COUNTER_RING_FADE_MS)).toBe(1);
    const mid = counterRingFade(1000, 1000 - COUNTER_RING_FADE_MS / 2);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    expect(counterRingFade(1000, 1000)).toBe(0);
    expect(counterRingFade(1000, 1200)).toBe(0);
  });
});

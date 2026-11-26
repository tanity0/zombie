// 鞭の3連撃のカウンター: 1段目だけ・クールダウンは連撃の終わりから(社長指示2026-11-26「カウンターは一撃目のみで、クールダウンは連撃終わりからです」)。
import { describe, it, expect } from 'vitest';
import { whipComboCounterPlan, whipComboCounterCut, whipComboEndAt, WHIP_COMBO_RESET_MS, WHIP_COMBO_INTERVAL_MS } from './whipCombo';

const CD = 1040;
const I = WHIP_COMBO_INTERVAL_MS;

describe('whipComboCounterPlan', () => {
  it('1段目だけ窓を開く(2・3段目は開かない)', () => {
    const a = whipComboCounterPlan(1, 1000, 0, false, CD);
    expect(a.open).toBe(true);
    expect(a.comboCounter).toBe(true);
    const b = whipComboCounterPlan(2, 1000 + I, a.readyAt, a.comboCounter, CD);
    expect(b.open).toBe(false);
    const c = whipComboCounterPlan(3, 1000 + 2 * I, b.readyAt, b.comboCounter, CD);
    expect(c.open).toBe(false);
    // 3段目で連撃が終わる=その時点からクールダウン
    expect(c.readyAt).toBe(1000 + 2 * I + CD);
  });
  it('3段目の後、クールダウン明けまで次の1段目は開かない(明ければ開く)', () => {
    const c = whipComboCounterPlan(3, 2000, 0, true, CD);
    const early = whipComboCounterPlan(1, 2000 + I, c.readyAt, c.comboCounter, CD);
    expect(early.open).toBe(false);
    expect(early.comboCounter).toBe(false);
    expect(early.readyAt).toBe(c.readyAt); // 窓を開けなかった連撃はクールダウンを動かさない
    expect(whipComboCounterPlan(1, 2000 + CD, c.readyAt, false, CD).open).toBe(true);
  });
  it('途中で止めた時は、1段目へ戻る時点からクールダウン', () => {
    const a = whipComboCounterPlan(1, 1000, 0, false, CD);
    expect(a.readyAt).toBe(1000 + WHIP_COMBO_RESET_MS + CD);
    const b = whipComboCounterPlan(2, 1000 + I, a.readyAt, true, CD);
    expect(b.readyAt).toBe(1000 + I + WHIP_COMBO_RESET_MS + CD);
    expect(whipComboEndAt(2, 1000 + I)).toBe(1000 + I + WHIP_COMBO_RESET_MS);
  });
  it('連撃が切れた(掴んだ等)時は、その時点から(窓を開いた連撃だけ)', () => {
    expect(whipComboCounterCut(5000, 9999, true, CD)).toEqual({ comboCounter: false, readyAt: 5000 + CD });
    expect(whipComboCounterCut(5000, 1234, false, CD)).toEqual({ comboCounter: false, readyAt: 1234 });
  });
});

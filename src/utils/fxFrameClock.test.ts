import { describe, it, expect } from 'vitest';
import { frameByHold, holdTotalMs, holdLeadMs, frameWithWindupHold } from './fxFrameClock';

const HOLD = [10, 20, 30, 40, 50];   // 5コマ
const IMPACT = 2;                    // 3コマ目が当たる瞬間

describe('コマ送りの時計', () => {
  it('★当たる瞬間にちょうど impactFrame へ切り替わる', () => {
    expect(frameByHold(0, HOLD, IMPACT)).toBe(IMPACT);
    expect(frameByHold(-1, HOLD, IMPACT)).toBe(IMPACT - 1);
  });

  it('先頭より前・流し切った後は出さない', () => {
    const lead = holdLeadMs(HOLD, IMPACT);
    expect(lead).toBe(30);
    expect(frameByHold(-lead, HOLD, IMPACT)).toBe(0);
    expect(frameByHold(-lead - 1, HOLD, IMPACT)).toBeNull();
    expect(frameByHold(holdTotalMs(HOLD) - lead, HOLD, IMPACT)).toBeNull();
    expect(frameByHold(holdTotalMs(HOLD) - lead - 1, HOLD, IMPACT)).toBe(HOLD.length - 1);
  });

  it('★コマは戻らない(単調)', () => {
    const lead = holdLeadMs(HOLD, IMPACT);
    let prev = -1;
    for (let t = -lead; t < holdTotalMs(HOLD) - lead; t += 1) {
      const f = frameByHold(t, HOLD, IMPACT)!;
      expect(f).toBeGreaterThanOrEqual(prev);
      prev = f;
    }
    expect(prev).toBe(HOLD.length - 1);
  });

  it('尺の表どおりに切り替わる(境界)', () => {
    const lead = holdLeadMs(HOLD, IMPACT);
    expect(frameByHold(-lead + 9, HOLD, IMPACT)).toBe(0);
    expect(frameByHold(-lead + 10, HOLD, IMPACT)).toBe(1);
  });
});

// ★PACING_PUZZLE.md §16-E(社長指示2026-09-19「武器を構えて一瞬止まる」)。
describe('★構え(溜めのあいだ0コマ目で静止・溜め明けは送り元に丸投げ)', () => {
  const WINDUP_MS = 300;
  // 送り元(frameByHold)を直接使う=「溜め明けの送りが1ミリも変わらない」を実際に同じ関数で保証する。
  const frameFn = (sinceImpactMs: number) => frameByHold(sinceImpactMs, HOLD, IMPACT);

  it('溜めが始まった同じフレーム(0ms)から0コマ目', () => {
    // sinceImpactMsは「まだ攻撃が発動していない」ほど大きく負にしておく(溜め開始直後は
    // 当たりまでまだ遠い=frameFnを直接呼べばnullになる値)。
    expect(frameWithWindupHold(0, WINDUP_MS, -9999, frameFn)).toBe(0);
  });

  it('溜めのあいだ(< windupMs)は0コマ目のまま動かない', () => {
    expect(frameWithWindupHold(1, WINDUP_MS, -9999, frameFn)).toBe(0);
    expect(frameWithWindupHold(150, WINDUP_MS, -9999, frameFn)).toBe(0);
    expect(frameWithWindupHold(WINDUP_MS - 1, WINDUP_MS, -9999, frameFn)).toBe(0);
  });

  it('まだ発火していない(sinceWindupMs<0)は出さない', () => {
    expect(frameWithWindupHold(-1, WINDUP_MS, -9999, frameFn)).toBeNull();
  });

  it('★溜め明け(>= windupMs)からは`frameFn`(=既存のframeByHold呼び出し)の結果そのまま' +
    '(命中基準の送りを1ミリも変えない)', () => {
    for (const sinceImpactMs of [-999, -50, -1, 0, 1, 50, 999]) {
      const sinceWindupMs = WINDUP_MS + 1234; // 十分に溜め明け
      expect(frameWithWindupHold(sinceWindupMs, WINDUP_MS, sinceImpactMs, frameFn))
        .toBe(frameFn(sinceImpactMs));
    }
  });

  it('境界: sinceWindupMs===windupMsはもう「溜め明け」側(0コマ目固定ではない)', () => {
    // frameFnがこの時刻でnullを返す設定(まだ描き始めていない)なら、結果もnullになる
    // (=0コマ目に固定されたままにはならない)ことで境界を確認する。
    expect(frameWithWindupHold(WINDUP_MS, WINDUP_MS, -9999, frameFn)).toBeNull();
  });
});

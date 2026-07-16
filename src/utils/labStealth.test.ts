import { describe, it, expect } from 'vitest';
import { tickLabDeaggro, LAB_DEAGGRO_DIST, LAB_DEAGGRO_MS } from './labStealth';

const far = (LAB_DEAGGRO_DIST + 10) ** 2;
const near = (LAB_DEAGGRO_DIST - 10) ** 2;

describe('tickLabDeaggro (ステージ2の索敵解除・社長指示v0.25.1757)', () => {
  it('解除距離450px・猶予3秒(叩き台)', () => {
    expect(LAB_DEAGGRO_DIST).toBe(450);
    expect(LAB_DEAGGRO_MS).toBe(3000);
  });

  it('範囲内なら何も起きない(開始時刻もリセット)', () => {
    const t = tickLabDeaggro(10000, near, 5000);
    expect(t.outSince).toBeUndefined();
    expect(t.deaggro).toBe(false);
  });

  it('範囲外に出た最初のtickで開始時刻が付き、猶予中は諦めない', () => {
    const t0 = tickLabDeaggro(10000, far, undefined);
    expect(t0.outSince).toBe(10000);
    expect(t0.deaggro).toBe(false);
    const t1 = tickLabDeaggro(10000 + LAB_DEAGGRO_MS - 1, far, t0.outSince);
    expect(t1.deaggro).toBe(false);
  });

  it('範囲外が猶予時間続いたら諦める(deaggro=true)', () => {
    const t = tickLabDeaggro(10000 + LAB_DEAGGRO_MS, far, 10000);
    expect(t.deaggro).toBe(true);
  });

  it('途中で範囲内に戻るとカウントが振り出しに戻る', () => {
    const back = tickLabDeaggro(12000, near, 10000);
    expect(back.outSince).toBeUndefined();
    const again = tickLabDeaggro(13000, far, back.outSince);
    expect(again.outSince).toBe(13000);
    expect(again.deaggro).toBe(false);
  });
});

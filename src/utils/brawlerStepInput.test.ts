// 格闘のステップの PC 入力(research/BRAWLER.md §12-3): 同じ方向キーの素早い2度押し。
import { describe, it, expect } from 'vitest';
import { stepKeyDown, stepKeyUp, STEP_KEY_DOUBLETAP_MS, STEP_KEY_TAP_MAX_MS } from './brawlerStepInput';

describe('ステップの2度押し(PC)', () => {
  const press = (st: ReturnType<typeof stepKeyDown>['state'] | null, dir: string, down: number, up: number) => {
    const d = stepKeyDown(st, dir, down);
    return { step: d.step, state: stepKeyUp(d.state, dir, up, d.step) };
  };
  it('同じ向きを短く押して離し、すぐもう一度押す=ステップ', () => {
    const a = press(null, 'right', 0, 80);
    expect(a.step).toBe(false);
    expect(stepKeyDown(a.state, 'right', 80 + STEP_KEY_DOUBLETAP_MS).step).toBe(true);
    expect(stepKeyDown(a.state, 'right', 80 + STEP_KEY_DOUBLETAP_MS + 1).step).toBe(false);
  });
  it('違う向き・長押しの後・3度目は出さない', () => {
    const a = press(null, 'right', 0, 80);
    expect(stepKeyDown(a.state, 'left', 150).step).toBe(false);
    const long = press(null, 'right', 0, STEP_KEY_TAP_MAX_MS + 10);
    expect(stepKeyDown(long.state, 'right', STEP_KEY_TAP_MAX_MS + 50).step).toBe(false);
    const b = press(a.state, 'right', 150, 200); // 2回目=ステップ
    expect(b.step).toBe(true);
    expect(stepKeyDown(b.state, 'right', 260).step).toBe(false); // 3回目はステップにしない
  });
});

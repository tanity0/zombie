// 格闘のステップの PC 入力(research/BRAWLER.md §12-3): 同じ方向キーの素早い2度押し。
import { describe, it, expect } from 'vitest';
import {
  stepKeyDown, stepKeyUp, STEP_KEY_DOUBLETAP_MS, STEP_KEY_TAP_MAX_MS,
  detectStickReversalFromSamples, STEP_REVERSAL_RELEASE_MAX_MS, type StickSample,
  createPadReversalTracker, stepPadReversal, PAD_STEP_HOLD_MAX_MS,
} from './brawlerStepInput';
import { detectFlickFromSamples } from './brawler';

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

// ---------------------------------------------------------------------------------------------
// スマホ: 一方へ振ってすぐ反対へ切り返して離す(research/BRAWLER.md §12-3b)
// ---------------------------------------------------------------------------------------------
/** 点 (x,y) を ms かけて 8ms 刻みで (tx,ty) へ動かした軌跡を足す(等速)。 */
const swipe = (out: StickSample[], tx: number, ty: number, ms: number): StickSample[] => {
  const s = out[out.length - 1];
  const n = Math.max(1, Math.round(ms / 8));
  for (let k = 1; k <= n; k++) out.push({ x: s.x + ((tx - s.x) * k) / n, y: s.y + ((ty - s.y) * k) / n, t: s.t + (ms * k) / n });
  return out;
};
const hold = (out: StickSample[], ms: number): StickSample[] => {
  const s = out[out.length - 1];
  for (let k = 1; k <= Math.round(ms / 16); k++) out.push({ x: s.x, y: s.y, t: s.t + k * 16 });
  return out;
};
const lastT = (a: StickSample[]) => a[a.length - 1].t;

describe('ステップの切り返し(スマホ)', () => {
  it('右へ振って、すぐ左へ切り返して離す=左へステップ(向き=切り返した先)', () => {
    const a = swipe(swipe(hold([{ x: 0, y: 0, t: 0 }], 200), 40, 0, 70), -10, 0, 80);
    const r = detectStickReversalFromSamples(a, lastT(a) + 10);
    expect(r).not.toBeNull();
    expect(r!.x).toBeCloseTo(-1);
    expect(r!.y).toBeCloseTo(0);
  });
  it('上へ振って下へ切り返す=下へ。斜めでも切り返した先の向き', () => {
    const a = swipe(swipe([{ x: 0, y: 0, t: 0 }], 0, -40, 70), 0, 10, 80);
    const r = detectStickReversalFromSamples(a, lastT(a));
    expect(r!.y).toBeCloseTo(1);
    const b = swipe(swipe([{ x: 0, y: 0, t: 0 }], -30, -30, 70), 10, 10, 80);
    const q = detectStickReversalFromSamples(b, lastT(b));
    expect(q!.x).toBeCloseTo(Math.SQRT1_2);
    expect(q!.y).toBeCloseTo(Math.SQRT1_2);
  });
  it('スティックを倒したまま歩いていて、反対へ切り返して離す=成立(切り返しの前に止まっていてもよい)', () => {
    const a = swipe(swipe(hold(swipe([{ x: 0, y: 0, t: 0 }], -40, 0, 300), 400), 20, 0, 70), -30, 0, 80);
    expect(detectStickReversalFromSamples(a, lastT(a))!.x).toBeCloseTo(-1);
  });
  it('ゆっくり行ったり来たり歩くのは成立しない', () => {
    const a = swipe(swipe(swipe([{ x: 0, y: 0, t: 0 }], 50, 0, 400), -50, 0, 500), 30, 0, 400);
    expect(detectStickReversalFromSamples(a, lastT(a))).toBeNull();
    // 片方だけ速くても成立しない(ゆっくり振ってから速く戻す=ただのフリック)
    const b = swipe(swipe([{ x: 0, y: 0, t: 0 }], 40, 0, 400), -10, 0, 60);
    expect(detectStickReversalFromSamples(b, lastT(b))).toBeNull();
  });
  it('ただの1方向のフリックは成立しない(今どおり技)', () => {
    const a = swipe(hold([{ x: 0, y: 0, t: 0 }], 200), 60, 0, 60);
    expect(detectStickReversalFromSamples(a, lastT(a))).toBeNull();
    const b = swipe([{ x: 0, y: 0, t: 0 }], 60, 0, 60);
    expect(detectStickReversalFromSamples(b, lastT(b))).toBeNull();
    expect(detectFlickFromSamples(b, 120, 20, 0.9)).not.toBeNull(); // 同じ軌跡はフリック(技)になる
  });
  it('振りが小さい・角度が浅い(右→上)は成立しない', () => {
    const small = swipe(swipe([{ x: 0, y: 0, t: 0 }], 12, 0, 40), 0, 0, 40);
    expect(detectStickReversalFromSamples(small, lastT(small))).toBeNull();
    const right = swipe(swipe([{ x: 0, y: 0, t: 0 }], 40, 0, 70), 40, -40, 70);
    expect(detectStickReversalFromSamples(right, lastT(right))).toBeNull();
  });
  it('切り返した後に止めてから離したのは成立しない', () => {
    const a = swipe(swipe([{ x: 0, y: 0, t: 0 }], 40, 0, 70), -10, 0, 80);
    expect(detectStickReversalFromSamples(a, lastT(a) + STEP_REVERSAL_RELEASE_MAX_MS)).not.toBeNull();
    expect(detectStickReversalFromSamples(a, lastT(a) + STEP_REVERSAL_RELEASE_MAX_MS + 1)).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------
// パッド: 一方へ倒す→すぐ反対へ倒す→中立へ戻す(§12-3b)
// ---------------------------------------------------------------------------------------------
describe('ステップの切り返し(パッド)', () => {
  const DEAD = 0.2;
  /** [ax, ay, ms] の並びを 16ms 刻みで流し、成立した向きを全部返す。 */
  const run = (seq: readonly (readonly [number, number, number])[]) => {
    const tr = createPadReversalTracker();
    const out: { x: number; y: number; t: number }[] = [];
    let t = 0;
    for (const [ax, ay, ms] of seq) {
      for (let k = 0; k < Math.max(1, Math.round(ms / 16)); k++) {
        t += 16;
        const r = stepPadReversal(tr, ax, ay, t, DEAD);
        if (r) out.push({ ...r, t });
      }
    }
    return out;
  };
  it('右へ倒す→すぐ左へ倒す→中立=左へ1回(途中で中立を通ってもよい)', () => {
    const r = run([[0, 0, 48], [1, 0, 96], [0, 0, 16], [-1, 0, 96], [0, 0, 80]]);
    expect(r.length).toBe(1);
    expect(r[0].x).toBeCloseTo(-1);
  });
  it('中立を通らずに反対へ(1フレームで弾く)のも成立・向きは反対へ倒した先', () => {
    const r = run([[0, -1, 80], [0, 1, 80], [0, 0, 32]]);
    expect(r.length).toBe(1);
    expect(r[0].y).toBeCloseTo(1);
  });
  it('歩きの往復(長く倒してから反対へ長く倒す)では出ない', () => {
    expect(run([[1, 0, 600], [-1, 0, 600], [0, 0, 100]]).length).toBe(0);
    expect(run([[1, 0, 80], [-1, 0, PAD_STEP_HOLD_MAX_MS + 100], [0, 0, 100]]).length).toBe(0);
  });
  it('間が空いた往復・反対へ倒したまま止めてから戻す・1方向だけは出ない', () => {
    expect(run([[1, 0, 80], [0, 0, 300], [-1, 0, 80], [0, 0, 100]]).length).toBe(0);
    expect(run([[1, 0, 80], [-1, 0, 80], [-0.4, 0, 200], [0, 0, 100]]).length).toBe(0);
    expect(run([[1, 0, 80], [0, 0, 100], [1, 0, 80], [0, 0, 100]]).length).toBe(0);
    expect(run([[1, 0, 80], [0, 1, 80], [0, 0, 100]]).length).toBe(0); // 直角は反対ではない
  });
  it('同じ切り返しで2回は出さない', () => {
    expect(run([[1, 0, 80], [-1, 0, 80], [0, 0, 300]]).length).toBe(1);
  });
});

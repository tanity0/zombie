// ★敵の浮く動作の見た目の直し(社長承認2026-11-14「敵の浮く動作がまだ少しぎごちない」③〜⑥・utils/enemyAirPose)。描画だけが読む純関数。
import { describe, it, expect } from 'vitest';
import { brawlerShakeWave, flinchContinueFromMs, airSwellPivotShiftPx, walkMotionGateStep, BRAWLER_SHAKE_PERIOD_MS } from './enemyAirPose';

const FL_MS = 280, RISE = 0.18;
/** pixiScene の hitFlinchPose の深さ(0..1)と同じ式。 */
const depth = (since: number) => {
  const t = since / FL_MS;
  if (t < 0 || t >= 1) return 0;
  return t < RISE ? 1 - (1 - t / RISE) ** 2 : (1 + Math.cos(((t - RISE) / (1 - RISE)) * Math.PI)) / 2;
};

describe('⑤ 止めの震え(実時間の sin)', () => {
  it('始まりは 0・振れ幅は旧の山から山(1.6×包絡)と同じ・終わりは 0 へ寄る', () => {
    expect(brawlerShakeWave(150, 0)).toBeCloseTo(0, 9);
    let lo = 0, hi = 0;
    for (let t = 0; t < BRAWLER_SHAKE_PERIOD_MS; t += 0.5) { const v = brawlerShakeWave(1000, t); lo = Math.min(lo, v); hi = Math.max(hi, v); }
    expect(hi - lo).toBeCloseTo(4.5 * 1.6, 1);
    expect(Math.abs(brawlerShakeWave(1, 40))).toBeLessThan(0.1);
    expect(brawlerShakeWave(0, 40)).toBe(0);
  });
  it('60fps の1フレームの跳びは旧の矩形波(最大 4.5×1.6=7.2px)より小さい', () => {
    let maxJump = 0;
    for (let t0 = 0; t0 < 40; t0 += 1.3) {
      for (let k = 1; k < 10; k++) {
        const a = brawlerShakeWave(200 - (t0 + (k - 1) * 16.67), t0 + (k - 1) * 16.67);
        const b = brawlerShakeWave(200 - (t0 + k * 16.67), t0 + k * 16.67);
        maxJump = Math.max(maxJump, Math.abs(b - a));
      }
    }
    expect(maxJump).toBeLessThan(7.2 * 0.75);
  });
});

describe('③ 拾い直しののけぞり(今の姿勢から続ける)', () => {
  it('出の途中・頂点はそのまま続ける', () => {
    expect(flinchContinueFromMs(20, FL_MS, RISE)).toBe(20);
    expect(flinchContinueFromMs(FL_MS * RISE, FL_MS, RISE)).toBeCloseTo(FL_MS * RISE, 9);
  });
  it('戻りの途中なら同じ深さの出の点から上がり直す(深さが1フレームで跳ばない)', () => {
    for (const prev of [70, 120, 180, 250]) {
      const s0 = flinchContinueFromMs(prev, FL_MS, RISE);
      expect(s0).toBeLessThanOrEqual(FL_MS * RISE);
      expect(depth(s0)).toBeCloseTo(depth(prev), 6);
    }
  });
  it('のけぞりが出ていなければ 0 から(今どおり)', () => {
    expect(flinchContinueFromMs(0, FL_MS, RISE)).toBe(0);
    expect(flinchContinueFromMs(FL_MS, FL_MS, RISE)).toBe(0);
    expect(flinchContinueFromMs(-5, FL_MS, RISE)).toBe(0);
  });
});

describe('④ 空中の膨らみの支点(体の中ほど)', () => {
  it('増えた高さの半分だけ下げる・膨らんでいなければ 0・足は地面より下へ出ない(今の浮きの高さまで)', () => {
    expect(airSwellPivotShiftPx(1, 100, 50)).toBe(0);
    expect(airSwellPivotShiftPx(1.4, 100, 50)).toBeCloseTo(20, 9);
    expect(airSwellPivotShiftPx(1.4, 100, 12)).toBe(12);
    expect(airSwellPivotShiftPx(1.4, 100, -3)).toBe(0);
  });
});

describe('⑥ 押し/浮きの間の歩きの揺れ', () => {
  it('押し/浮きで 0 へ・明けで 1 へ、時間で追う(1フレームで切れない)', () => {
    let g = walkMotionGateStep(undefined, false, 16);
    expect(g).toBe(1);
    g = walkMotionGateStep(g, true, 16.67);
    expect(g).toBeGreaterThan(0.5); expect(g).toBeLessThan(1);
    for (let i = 0; i < 40; i++) g = walkMotionGateStep(g, true, 16.67);
    expect(g).toBe(0);
    g = walkMotionGateStep(g, false, 16.67);
    expect(g).toBeGreaterThan(0); expect(g).toBeLessThan(0.5);
    expect(walkMotionGateStep(undefined, true, 16)).toBe(0);
  });
});

import { describe, it, expect } from 'vitest';
import {
  skaterPressResult, shouldMountBrawlerSkaterTouch, shouldMountBrawlerSkaterPc,
  BRAWLER_SKATER_HOLD_MS, BRAWLER_SKATER_MOVE_PX, BRAWLER_SKATER_SETTLE_MS, BRAWLER_SKATER_SETTLE_PX, SKATER_MOUNT_DOUBLETAP_MS,
} from './brawlerSkaterMount';
import { detectFlickFromSamples } from './brawler';
import { detectStickReversalFromSamples, STEP_REVERSAL_RELEASE_MAX_MS } from './brawlerStepInput';
import { KATANA_FLICK_WINDOW_MS, KATANA_FLICK_MIN_DIST, KATANA_FLICK_MIN_SPEED } from '../store/gameStore';

type S = { x: number; y: number; t: number };
/** (x0,y0)@t0 → (x1,y1)@t1 を step ms おきの点にする(t0 は含めない)。 */
const line = (x0: number, y0: number, t0: number, x1: number, y1: number, t1: number, step = 8): S[] => {
  const out: S[] = [];
  for (let t = t0 + step; t <= t1; t += step) {
    const k = Math.min(1, (t - t0) / (t1 - t0));
    out.push({ x: x0 + (x1 - x0) * k, y: y0 + (y1 - y0) * k, t });
  }
  if (out.length === 0 || out[out.length - 1].t !== t1) out.push({ x: x1, y: y1, t: t1 });
  return out;
};
const O = { x: 100, y: 100 };
/** 押下(t=0)から release までの間、2ms おきに「いま乗るか」を見て、一度でも乗ったら true(本番は 30ms おき+指の移動ごと)。 */
const everMounts = (samples: S[], releaseAt: number): boolean => {
  for (let now = 0; now <= releaseAt; now += 2) {
    const seen = samples.filter(s => s.t <= now);
    if (shouldMountBrawlerSkaterTouch(seen, O, 0, now)) return true;
  }
  return false;
};
const flickAt = (samples: S[]) => detectFlickFromSamples(samples, KATANA_FLICK_WINDOW_MS, KATANA_FLICK_MIN_DIST, KATANA_FLICK_MIN_SPEED);

describe('2度押しの判定(押した瞬間)', () => {
  it('格闘以外は今までどおり、押した瞬間に乗る', () => {
    expect(skaterPressResult({ lastWasTap: true, sinceLastUpMs: 100, retaliationOpen: false, brawler: false })).toBe('mount');
    expect(skaterPressResult({ lastWasTap: true, sinceLastUpMs: SKATER_MOUNT_DOUBLETAP_MS, retaliationOpen: false, brawler: false })).toBe('mount');
  });
  it('格闘中は押した瞬間には乗らず、構えるだけ', () => {
    expect(skaterPressResult({ lastWasTap: true, sinceLastUpMs: 100, retaliationOpen: false, brawler: true })).toBe('arm');
  });
  it('2度押しでない・間が空いた・反撃の窓の中は、格闘でも格闘以外でも乗らない', () => {
    for (const brawler of [false, true]) {
      expect(skaterPressResult({ lastWasTap: false, sinceLastUpMs: 100, retaliationOpen: false, brawler })).toBe('none');
      expect(skaterPressResult({ lastWasTap: true, sinceLastUpMs: SKATER_MOUNT_DOUBLETAP_MS + 1, retaliationOpen: false, brawler })).toBe('none');
      expect(skaterPressResult({ lastWasTap: true, sinceLastUpMs: 100, retaliationOpen: true, brawler })).toBe('none');
    }
  });
});

describe('タッチ・格闘中: 2回目を押したまま動かすと乗る', () => {
  it('しきい値はフリックの判定と矛盾しない(窓=フリックの窓・距離=フリックの最短距離)', () => {
    expect(BRAWLER_SKATER_SETTLE_MS).toBe(KATANA_FLICK_WINDOW_MS);
    expect(BRAWLER_SKATER_SETTLE_PX).toBe(KATANA_FLICK_MIN_DIST);
    expect(BRAWLER_SKATER_MOVE_PX).toBeGreaterThanOrEqual(KATANA_FLICK_MIN_DIST);
    expect(BRAWLER_SKATER_SETTLE_MS).toBeGreaterThanOrEqual(STEP_REVERSAL_RELEASE_MAX_MS);
  });
  it('押して40px引いて押さえたまま=乗る(押し始めから HOLD 経つまでは乗らない)', () => {
    const s: S[] = [{ ...O, t: 0 }, ...line(O.x, O.y, 0, O.x + 40, O.y, 80)];
    expect(shouldMountBrawlerSkaterTouch(s, O, 0, BRAWLER_SKATER_HOLD_MS - 1)).toBe(false);
    expect(shouldMountBrawlerSkaterTouch(s, O, 0, BRAWLER_SKATER_HOLD_MS)).toBe(true);
  });
  it('ゆっくり引き続けている(歩きの操作)=乗る', () => {
    const s: S[] = [{ ...O, t: 0 }, ...line(O.x, O.y, 0, O.x + 50, O.y, 500)];
    expect(shouldMountBrawlerSkaterTouch(s.filter(p => p.t <= 300), O, 0, 300)).toBe(true);
  });
  it('フリック(素早く払って離す)では乗らない。離した時はフリックとして成立する', () => {
    const s: S[] = [{ ...O, t: 0 }, ...line(O.x, O.y, 0, O.x + 60, O.y, 60)];
    expect(everMounts(s, 70)).toBe(false);
    expect(flickAt(s)).not.toBeNull();
  });
  it('押さえて待ってからのフリックでも、払いの最中は乗らない。離した時はフリックとして成立する', () => {
    const s: S[] = [{ ...O, t: 0 }, { ...O, t: 300 }, ...line(O.x, O.y, 300, O.x, O.y - 70, 370)];
    expect(everMounts(s, 380)).toBe(false);
    expect(flickAt(s)).not.toBeNull();
  });
  it('ステップ(振って切り返して離す)では乗らない。離した時はステップとして成立する', () => {
    const s: S[] = [{ ...O, t: 0 }, { ...O, t: 260 }, ...line(O.x, O.y, 260, O.x + 40, O.y, 320), ...line(O.x + 40, O.y, 320, O.x - 30, O.y, 400)];
    const releaseAt = 440;
    expect(everMounts(s, releaseAt)).toBe(false);
    expect(detectStickReversalFromSamples(s, releaseAt)).not.toBeNull();
  });
  it('抉り打ちの長押し(押したまま動かさない・指の揺れ程度)では乗らない', () => {
    const s: S[] = [{ ...O, t: 0 }, { x: O.x + 3, y: O.y - 2, t: 200 }, { x: O.x - 2, y: O.y + 4, t: 600 }];
    expect(everMounts(s, 1200)).toBe(false);
  });
  it('タップ(通常攻撃の連打)の短い押下では乗らない', () => {
    const s: S[] = [{ ...O, t: 0 }, ...line(O.x, O.y, 0, O.x + 30, O.y, 150)];
    expect(everMounts(s, BRAWLER_SKATER_HOLD_MS - 10)).toBe(false);
  });
});

describe('PC・パッド・格闘中: 2回目を押したまま移動の入力で乗る', () => {
  it('押し続けて HOLD を越え、移動の入力がある=乗る', () => {
    expect(shouldMountBrawlerSkaterPc(0, BRAWLER_SKATER_HOLD_MS, true)).toBe(true);
  });
  it('移動の入力が無い(抉り打ちの長押し)=乗らない', () => {
    expect(shouldMountBrawlerSkaterPc(0, 2000, false)).toBe(false);
  });
  it('移動キーを押しながらの短い押下(連打)=乗らない', () => {
    expect(shouldMountBrawlerSkaterPc(0, BRAWLER_SKATER_HOLD_MS - 1, true)).toBe(false);
  });
});

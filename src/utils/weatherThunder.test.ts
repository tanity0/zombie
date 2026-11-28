import { describe, expect, it } from 'vitest';
import {
  planThunderStrike, thunderNextGapMs, thunderFlash, thunderBoltAlpha, thunderBoltShape, thunderDurationMs, thunderSoundCue, thunderRng,
  THUNDER_GAP_MS_MIN, THUNDER_GAP_MS_MAX, THUNDER_RISE_MS,
} from './weatherThunder';

describe('雨の場面の雷(演出だけ)', () => {
  it('間隔は 8〜20秒で不規則・連続しない', () => {
    expect(thunderNextGapMs(() => 0)).toBe(THUNDER_GAP_MS_MIN);
    expect(thunderNextGapMs(() => 0.999)).toBeLessThanOrEqual(THUNDER_GAP_MS_MAX);
    expect(THUNDER_GAP_MS_MIN).toBeGreaterThan(thunderDurationMs(planThunderStrike(() => 0.999)) * 3);
  });

  it('稲光は 2〜3回明滅し、最後が一番明るく、パッと点かず滑らかに消える', () => {
    const r = thunderRng(42);
    for (let k = 0; k < 50; k++) {
      const s = planThunderStrike(r);
      expect(s.pulses.length).toBeGreaterThanOrEqual(2);
      expect(s.pulses.length).toBeLessThanOrEqual(3);
      const last = s.pulses[s.pulses.length - 1];
      for (const p of s.pulses) expect(p.peak).toBeLessThanOrEqual(last.peak + 1e-9);
      expect(thunderFlash(0, s)).toBe(0); // 立ち上がりがある
      expect(thunderFlash(THUNDER_RISE_MS, s)).toBeGreaterThan(0.1);
      const end = thunderDurationMs(s);
      expect(thunderFlash(end, s)).toBe(0);
      // 明滅: 最初の明滅の山の後、次の明滅の前に一度暗くなる
      const p1 = s.pulses[1];
      const dip = thunderFlash(p1.at - 1, s), peak0 = thunderFlash(THUNDER_RISE_MS, s);
      expect(dip).toBeLessThan(peak0);
      // 終わりへ跳ばない(16ms ごとの差が小さい)
      let prev = thunderFlash(last.at + THUNDER_RISE_MS, s);
      for (let t = last.at + THUNDER_RISE_MS + 16; t <= end; t += 16) {
        const v = thunderFlash(t, s);
        expect(Math.abs(v - prev)).toBeLessThan(0.2);
        prev = v;
      }
      expect(thunderFlash(t0(s), s)).toBeLessThanOrEqual(1);
    }
  });

  it('稲妻の筋は稲光より先に抜ける・筋が無い雷では 0', () => {
    const s = planThunderStrike(thunderRng(7));
    s.bolt = true;
    const last = s.pulses[s.pulses.length - 1];
    const t = last.at + THUNDER_RISE_MS + last.tau * 2;
    expect(thunderBoltAlpha(t, s) / Math.max(1e-6, thunderBoltAlpha(last.at + THUNDER_RISE_MS, s)))
      .toBeLessThan(thunderFlash(t, s) / thunderFlash(last.at + THUNDER_RISE_MS, s));
    expect(thunderBoltAlpha(t, { ...s, bolt: false })).toBe(0);
  });

  it('稲妻の形: 上から下へ落ち、同じ種なら同じ形', () => {
    const a = thunderBoltShape(123, 200, 10, 300, 430), b = thunderBoltShape(123, 200, 10, 300, 430);
    expect(a).toEqual(b);
    expect(a.main[1]).toBe(10);
    for (let i = 3; i < a.main.length; i += 2) expect(a.main[i]).toBeGreaterThanOrEqual(a.main[i - 2]);
    expect(a.main[a.main.length - 1]).toBeLessThanOrEqual(300);
  });

  it('雷鳴: 遠いほど遅く・小さく・低く・こもる', () => {
    const base = planThunderStrike(() => 0.5);
    const near = thunderSoundCue({ ...base, dist: 0 }, () => 0.5), far = thunderSoundCue({ ...base, dist: 1 }, () => 0.5);
    expect(far.delayMs).toBeGreaterThan(near.delayMs + 1500);
    expect(far.gain).toBeLessThan(near.gain);
    expect(far.rate).toBeLessThan(near.rate);
    expect(far.lowpassHz).toBeLessThan(near.lowpassHz);
    const lo = thunderSoundCue(base, () => 0), hi = thunderSoundCue(base, () => 0.999);
    expect(hi.rate).toBeGreaterThan(lo.rate); // 毎回少し音程が揺れる
  });
});

const t0 = (s: ReturnType<typeof planThunderStrike>) => s.pulses[s.pulses.length - 1].at + THUNDER_RISE_MS;

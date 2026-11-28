import { describe, it, expect } from 'vitest';
import {
  MOON_SHAFT_SPECS, MOON_SHAFT_PERIOD, layoutMoonShafts, moonShaftLightAt, moonShaftPolys, moonShaftAlong, moonShaftAcross,
  moonShaftWidthFrac, moonShaftTexel, moonPoolStrip, moonPoolTexel, moonDustActiveFrac, moonDustTwinkle, moonDustFarFade,
  MOON_DUST_WET_FRAC,
} from './moonShafts';
import { shaftLightAt, RAIN_INTENSITY_LOW_MAX, RAIN_INTENSITY_HIGH_MIN, S1N_MOON_SHAFT_MULT, WET_MOON_SHAFT_MULT } from './weatherWet';

describe('月明りの筋(ステージ1の森の夜)', () => {
  it('不揃い: 間隔・幅・濃さ・傾きがどれも揃っていない(等間隔の縞にしない)', () => {
    const offs = MOON_SHAFT_SPECS.map(s => s.off).sort((a, b) => a - b);
    const gaps = offs.map((o, i) => (i + 1 < offs.length ? offs[i + 1] : offs[0] + 1) - o);
    expect(Math.max(...gaps) / Math.min(...gaps)).toBeGreaterThan(2);
    const ws = MOON_SHAFT_SPECS.map(s => s.w);
    expect(Math.max(...ws) / Math.min(...ws)).toBeGreaterThan(2.5);
    expect(new Set(MOON_SHAFT_SPECS.map(s => s.a)).size).toBe(MOON_SHAFT_SPECS.length);
    expect(new Set(MOON_SHAFT_SPECS.map(s => s.tilt)).size).toBeGreaterThan(2);
    expect(Math.max(...MOON_SHAFT_SPECS.map(s => s.a))).toBe(1);
  });
  it('本数は控えめ(1画面あたり3本未満)・周期は画面より長い(同じ並びの繰り返しが1画面に入らない)', () => {
    expect(MOON_SHAFT_PERIOD).toBeGreaterThan(1.5);
    expect(MOON_SHAFT_SPECS.length / MOON_SHAFT_PERIOD).toBeLessThan(3);
  });
  it('並べ方は決まっている(同じ寸法なら同じ並び)・左右に1周期ずつ余分に置く', () => {
    const a = layoutMoonShafts(430, 932), b = layoutMoonShafts(430, 932);
    expect(a).toEqual(b);
    expect(a.period).toBeCloseTo(430 * MOON_SHAFT_PERIOD);
    expect(Math.min(...a.shafts.map(s => s.x))).toBeLessThan(-a.period * 0.9); // 1周期ぶん左へ流しても画面の左端まで埋まる
    expect(Math.max(...a.shafts.map(s => s.x))).toBeGreaterThan(430);
  });
  it('長さ方向: 空の側は細く淡く・中ほどで明るく・地面側の端で消える', () => {
    expect(moonShaftAlong(0)).toBe(0);
    expect(moonShaftAlong(1)).toBe(0);
    expect(moonShaftAlong(0.05)).toBeLessThan(0.1);
    expect(moonShaftAlong(0.4)).toBeCloseTo(1, 5);
    expect(moonShaftAlong(0.95)).toBeLessThan(0.05);
    expect(moonShaftWidthFrac(0)).toBeLessThan(0.5);
    expect(moonShaftWidthFrac(1)).toBeCloseTo(1, 6);
    for (let v = 0.05; v < 1; v += 0.05) expect(moonShaftWidthFrac(v)).toBeGreaterThan(moonShaftWidthFrac(v - 0.05));
  });
  it('横方向: 芯が最も明るく、縁へ滑らかに消える(縁に段がない=隣り合う画素の差が小さい)', () => {
    expect(moonShaftAcross(0)).toBe(1);
    expect(moonShaftAcross(1)).toBe(0);
    expect(moonShaftAcross(0.95)).toBeLessThan(0.01);
    let prev = moonShaftTexel(0, 100, 96, 256, 0.3);
    let maxStep = 0;
    for (let px = 1; px < 96; px++) {
      const t = moonShaftTexel(px, 100, 96, 256, 0.3);
      maxStep = Math.max(maxStep, Math.abs(t - prev));
      prev = t;
    }
    expect(maxStep).toBeLessThan(0.12);
    expect(moonShaftTexel(0, 100, 96, 256, 0.3)).toBe(0);
    expect(moonShaftTexel(95, 100, 96, 256, 0.3)).toBe(0);
  });
  it('筋の明るさの読み取り: 芯で強く、外では0・塗りと同じ分布', () => {
    const { shafts } = layoutMoonShafts(430, 932);
    const s = shafts.find(q => q.a === 1)!;
    const v = 0.4;
    const cx = s.x + s.dx * v, cy = s.y + s.dy * v;
    expect(moonShaftLightAt(cx, cy, [s])).toBeCloseTo(1, 2);
    expect(moonShaftLightAt(cx + s.w, cy, [s])).toBe(0);
    expect(moonShaftLightAt(cx + s.w * 0.15, cy, [s])).toBeLessThan(moonShaftLightAt(cx, cy, [s]));
    expect(moonShaftLightAt(s.x, s.y - 10, [s])).toBe(0);
  });
  it('地面の溜まり・水たまりの縁が読む形は筋の芯の線に乗る(従来の形式のまま)', () => {
    const { shafts } = layoutMoonShafts(430, 932);
    const polys = moonShaftPolys(shafts);
    expect(polys.length).toBe(shafts.length);
    const s = shafts[1], q = polys[1];
    const cx = s.x + s.dx * 0.6, cy = s.y + s.dy * 0.6;
    expect(shaftLightAt(cx, cy, [q])).toBeGreaterThan(0.9);
    expect(q.y2).toBeGreaterThan(s.y + s.dy); // 筋が消えた先も溜まりは続く
  });
  it('溜まりの帯: 地面の上端から下端まで・芯の線に沿う・絵は上端で 0 から立ち上がり縁は滑らか', () => {
    const { shafts } = layoutMoonShafts(430, 932);
    const s = shafts[1];
    const st = moonPoolStrip(s, 250, 932)!;
    expect(st.y).toBe(250);
    expect(st.y + st.dy).toBeCloseTo(932, 6);
    expect(st.x).toBeCloseTo(s.x + (250 - s.y) * (s.dx / s.dy), 6);
    expect(moonPoolStrip(s, 2000, 2400)).toBeNull();
    expect(moonPoolTexel(32, 0, 64, 128, 0.22)).toBeLessThan(0.05);
    expect(moonPoolTexel(32, 100, 64, 128, 0.22)).toBeGreaterThan(0.95);
    expect(moonPoolTexel(0, 100, 64, 128, 0.22)).toBeLessThan(0.01);
  });
  it('強さは落ち着かせた(晴れの夜 1.6・雨上がりも旧値より下)', () => {
    expect(S1N_MOON_SHAFT_MULT).toBeCloseTo(1.6, 6);
    expect(WET_MOON_SHAFT_MULT).toBeGreaterThan(1);
    expect(WET_MOON_SHAFT_MULT).toBeLessThan(1.7);
  });
});

describe('筋の中の塵', () => {
  it('晴れの夜は全部・雨上がりは減らし、本降りではさらに減る(0 にはしない)', () => {
    expect(moonDustActiveFrac(false, 99)).toBe(1);
    expect(moonDustActiveFrac(true, RAIN_INTENSITY_LOW_MAX)).toBeCloseTo(MOON_DUST_WET_FRAC, 6);
    const heavy = moonDustActiveFrac(true, RAIN_INTENSITY_HIGH_MIN);
    expect(heavy).toBeLessThan(MOON_DUST_WET_FRAC * 0.5);
    expect(heavy).toBeGreaterThan(0);
  });
  it('きらめきは決まった範囲で滑らかに動く', () => {
    let prev = moonDustTwinkle(0, 0.4);
    for (let t = 16; t < 20000; t += 16) {
      const k = moonDustTwinkle(t, 0.4);
      expect(k).toBeGreaterThanOrEqual(0.55 - 1e-9);
      expect(k).toBeLessThanOrEqual(1 + 1e-9);
      expect(Math.abs(k - prev)).toBeLessThan(0.02);
      prev = k;
    }
  });
  it('奥(地面の上端)では出ず、手前へ向けて立ち上がる', () => {
    expect(moonDustFarFade(250, 250, 932)).toBe(0);
    expect(moonDustFarFade(250 + 682 * 0.22, 250, 932)).toBeCloseTo(1, 6);
    expect(moonDustFarFade(600, 250, 932)).toBe(1);
  });
});

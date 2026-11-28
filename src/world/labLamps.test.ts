// ステージ2(研究所)の非常灯の並びと個体差(research/LAB_DARKNESS.md §8・§11)。
import { describe, it, expect } from 'vitest';
import {
  LAB_LAMP_SPACING_PX, LAB_LAMP_ALWAYS_ON_K, LAB_LAMP_AUTHORED_K, LAB_LAMP_DIM_MIN, LAB_LAMP_DIM_MAX, LAB_LAMP_DEAD_SPUTTER_LEVEL,
  labLampNearestX, labLampKind, labLampLevel, labLampBase, labLampScale,
} from './labLamps';
import { CRAWLER_START_DIST_PX } from './labCrawler';

describe('非常灯の並び', () => {
  it('いちばん近い灯りの x は間隔の整数倍', () => {
    expect(labLampNearestX(900)).toBe(2 * LAB_LAMP_SPACING_PX);
    expect(labLampNearestX(-900)).toBe(-2 * LAB_LAMP_SPACING_PX);
    expect(labLampNearestX(219)).toBe(0);
    expect(labLampNearestX(221)).toBe(LAB_LAMP_SPACING_PX);
  });
});

describe('非常灯の個体差', () => {
  const ks = Array.from({ length: 601 }, (_, i) => i - 300);
  const far = ks.filter(k => Math.abs(k) > LAB_LAMP_AUTHORED_K);
  it('スタート地点と、塊が眠る灯りは必ず健康で全開(闇の中でも眠っている塊が見える)', () => {
    for (const k of LAB_LAMP_ALWAYS_ON_K) { expect(labLampKind(k)).toBe('ok'); expect(labLampLevel(k, 12345)).toBe(1); expect(labLampScale(k)).toBe(1); }
    const crawlerK = CRAWLER_START_DIST_PX / LAB_LAMP_SPACING_PX;
    expect(Number.isInteger(crawlerK)).toBe(true);
    expect(LAB_LAMP_ALWAYS_ON_K).toContain(crawlerK);
    expect(LAB_LAMP_ALWAYS_ON_K).toContain(-crawlerK); // アイドルが左の出撃
  });
  it('スタートの近くは手で決めた並び(左右とも): 健康・健康・健康(塊)・ちらつく・切れている・健康=最初の闇は塊の灯りを過ぎた先', () => {
    for (const sgn of [1, -1]) {
      expect([1, 2, 3, 4, 5].map(k => labLampKind(sgn * k))).toEqual(['ok', 'ok', 'flicker', 'dead', 'ok']);
    }
  });
  it('その先は区切りごとの調子: 健康が多数・切れた灯りは3つ続かない・たまに2つ続く・健康だけが6つ以上続く区間がある', () => {
    const kinds = ks.map(labLampKind);
    for (let i = 2; i < kinds.length; i++) expect(kinds[i] === 'dead' && kinds[i - 1] === 'dead' && kinds[i - 2] === 'dead').toBe(false);
    expect(kinds.some((v, i) => i > 0 && v === 'dead' && kinds[i - 1] === 'dead')).toBe(true);
    let run = 0, best = 0; for (const v of kinds) { run = v === 'ok' ? run + 1 : 0; best = Math.max(best, run); }
    expect(best).toBeGreaterThanOrEqual(6);
    const count = (x: string) => far.filter(k => labLampKind(k) === x).length;
    expect(count('ok')).toBeGreaterThan(far.length * 0.6);
    for (const x of ['dead', 'flicker', 'dim']) { expect(count(x)).toBeGreaterThan(far.length * 0.03); expect(count(x)).toBeLessThan(far.length * 0.2); }
    // 切れた灯りの隣には、ちらつく灯りが居る(故障は塊で来る)
    for (const k of far) if (labLampKind(k) === 'dead') expect(['flicker', 'dead'].includes(labLampKind(k - 1)) || ['flicker', 'dead'].includes(labLampKind(k + 1))).toBe(true);
  });
  it('番号で決まる(何度呼んでも同じ)。暗い灯りは明るさと届く広さがばらつく・健康な灯りにも僅かな差', () => {
    expect(ks.map(labLampKind)).toEqual(ks.map(labLampKind));
    const dims = far.filter(k => labLampKind(k) === 'dim');
    for (const k of dims) {
      expect(labLampBase(k)).toBeGreaterThanOrEqual(LAB_LAMP_DIM_MIN); expect(labLampBase(k)).toBeLessThanOrEqual(LAB_LAMP_DIM_MAX);
      expect(labLampScale(k)).toBeGreaterThanOrEqual(0.75); expect(labLampScale(k)).toBeLessThanOrEqual(0.9);
      expect(labLampLevel(k, 0)).toBe(labLampBase(k)); expect(labLampLevel(k, 7777)).toBe(labLampBase(k));
    }
    expect(new Set(dims.map(k => labLampBase(k).toFixed(2))).size).toBeGreaterThan(3);
    const oks = far.filter(k => labLampKind(k) === 'ok');
    for (const k of oks) { expect(labLampBase(k)).toBeGreaterThanOrEqual(0.9); expect(labLampBase(k)).toBeLessThanOrEqual(1); expect(labLampScale(k)).toBe(1); }
  });
  it('ちらつく灯り: 点いている時間の方が長い・パチッと消える(0まで落ちる)・しばらく大人しい時と続けて落ちる時がある', () => {
    const fl = far.find(k => labLampKind(k) === 'flicker')!;
    const step = 20, N = 30000; // 10分ぶん
    const lv = Array.from({ length: N }, (_, i) => labLampLevel(fl, i * step));
    expect(lv.every(v => v >= 0 && v <= 1)).toBe(true);
    const off = lv.filter(v => v < 0.05).length, on = lv.filter(v => v > 0.85).length;
    expect(off).toBeGreaterThan(N * 0.01); expect(on).toBeGreaterThan(N * 0.7);
    // 10秒ごとの窓で「落ちた時間」を数える: 1回も落ちない窓と、何度も落ちる窓の両方がある(一様な雑音ではない)
    const win = 500, per = Array.from({ length: N / win }, (_, w) => lv.slice(w * win, (w + 1) * win).filter(v => v < 0.05).length);
    expect(per.some(n => n === 0)).toBe(true);
    expect(per.some(n => n >= 10)).toBe(true);
    expect(labLampLevel(fl, 1000)).toBe(labLampLevel(fl, 1000));
  });
  it('切れた灯り: ふだんは0。たまに弱く点きかけて落ちる(強くは点かない)', () => {
    const dead = far.find(k => labLampKind(k) === 'dead')!;
    expect(labLampBase(dead)).toBe(0);
    const step = 20, N = 30000;
    const lv = Array.from({ length: N }, (_, i) => labLampLevel(dead, i * step));
    expect(Math.max(...lv)).toBeLessThanOrEqual(LAB_LAMP_DEAD_SPUTTER_LEVEL + 1e-9);
    const lit = lv.filter(v => v > 0.05).length;
    expect(lit).toBeGreaterThan(0); expect(lit).toBeLessThan(N * 0.06); // ほとんどの時間は真っ暗
  });
});

import { describe, it, expect } from 'vitest';
import { pickArrowRainCenter, planArrowRain, arrowRainHits, arrowRainLevel, reaimArrow, ARROW_RAIN_SEEK_PX, ARROW_RAIN_ZONE_PX, ARROW_RAIN_SPAN_MS, ARROW_RAIN_FALL_MS, ARROW_RAIN_COUNT_BY_LEVEL, ARROW_RAIN_CD_MS_BY_LEVEL } from './arrowRain';

describe('矢の雨(ARROW_RAIN.md)', () => {
  it('レベルの表: 12/18/26本・9/8/7秒', () => {
    expect([1, 2, 3].map(l => ARROW_RAIN_COUNT_BY_LEVEL[l])).toEqual([12, 18, 26]);
    expect([1, 2, 3].map(l => ARROW_RAIN_CD_MS_BY_LEVEL[l])).toEqual([9000, 8000, 7000]);
    expect(arrowRainLevel(undefined)).toBe(1);
    expect(arrowRainLevel(9)).toBe(3);
  });
  it('的は範囲内で一番固まっている所。範囲外しかいなければ撃たない', () => {
    const lone = { id: 'a', x: 100, y: 0 };
    const pack = [{ id: 'b', x: 300, y: 0 }, { id: 'c', x: 320, y: 10 }, { id: 'd', x: 310, y: -20 }];
    expect(pickArrowRainCenter(0, 0, [lone, ...pack])!.x).toBeGreaterThanOrEqual(300);
    expect(pickArrowRainCenter(0, 0, [{ id: 'far', x: ARROW_RAIN_SEEK_PX + 10, y: 0 }])).toBeNull();
  });
  it('落ち始めは SPAN の間にばらけ、刺さるのは落ち始め+FALL。弦の音は3本だけ', () => {
    const arrows = planArrowRain({ x: 0, y: 0 }, [{ id: 'e', x: 20, y: 0 }], 26, 1000, -50, 0, Math.random);
    expect(arrows).toHaveLength(26);
    for (const a of arrows) {
      expect(a.bornAt).toBeGreaterThanOrEqual(1000);
      expect(a.bornAt).toBeLessThanOrEqual(1000 + ARROW_RAIN_SPAN_MS);
      expect(a.landAt - a.bornAt).toBeCloseTo(ARROW_RAIN_FALL_MS, 6);
      if (!a.targetId) expect(Math.hypot(a.x, a.y)).toBeLessThanOrEqual(ARROW_RAIN_ZONE_PX + 0.001);
    }
    expect(arrows.filter(a => a.sfx)).toHaveLength(3);
  });
  it('歩いてくる敵にも、狙った矢の過半が当たる(落ち始めまで狙い直す・体の矩形で判定)', () => {
    // 3体のゾンビ(幅30×高さ60)が左へ毎秒80pxで歩く。足元を狙う。
    const zs = [0, 1, 2].map(i => ({ id: `z${i}`, x0: 300 + i * 40, y: 100 + i * 20 }));
    const at = (t: number) => zs.map(z => ({ id: z.id, x: z.x0 - 80 * (t / 1000) - 15, y: z.y - 60, width: 30, height: 60 }));
    const foot = (t: number) => (id: string) => { const b = at(t).find(q => q.id === id)!; return { x: b.x + 15, y: b.y + 60 }; };
    let arrows = planArrowRain({ x: 315, y: 120 }, zs.map(z => ({ id: z.id, ...foot(0)(z.id) })), 26, 0, 0, 0, Math.random);
    let aimed = 0, hitAimed = 0;
    for (let t = 0; t <= ARROW_RAIN_SPAN_MS + ARROW_RAIN_FALL_MS; t += 16) {
      arrows = arrows.map(a => reaimArrow(a, t, foot(t)));
      for (const a of arrows) if (a.landAt > t - 16 && a.landAt <= t && a.targetId) {
        aimed++;
        if (arrowRainHits(a, at(t)).length > 0) hitAimed++;
      }
    }
    expect(aimed).toBeGreaterThan(5);
    expect(hitAimed / aimed).toBeGreaterThan(0.5);
  });
  it('背の高い敵(ボス)も足元に刺さった矢で当たる', () => {
    expect(arrowRainHits({ x: 100, y: 300 }, [{ id: 'boss', x: 50, y: 60, width: 100, height: 240 }])).toEqual(['boss']);
  });
});

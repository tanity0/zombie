import { describe, expect, it } from 'vitest';
import { STAGE1_CASTLE_CENTER_FRAC, stage1CastleLayout } from './stage1CastleLayout';

// pixiScene の式をなぞる(farH=min(h*0.38, max(168, h*0.26))・倍率=画面幅/(1800/2)・castleY=100)
const farHFor = (h: number) => Math.min(h * 0.38, Math.max(168, h * 0.26));
const input = (w: number, h: number) => ({ screenW: w, screenH: h, farH: farHFor(h), drawnH: 506 * (w / 900), castleY: 100 });

describe('stage1CastleLayout', () => {
  it('縦長(スマホ)は従来どおり: 底=farH+castleY・高さ=絵1枚', () => {
    for (const [w, h] of [[430, 932], [375, 667]]) {
      const i = input(w, h);
      expect(stage1CastleLayout(i)).toEqual({ bottomY: i.farH + 100, height: i.drawnH });
    }
  });

  it('横長(PC): 底は従来の位置のまま・城の中心が遠景の帯の上下中央に来る', () => {
    for (const [w, h] of [[960, 540], [1280, 720], [1920, 1080]]) {
      const i = input(w, h);
      const r = stage1CastleLayout(i);
      expect(r.bottomY).toBe(i.farH + 100);
      expect(r.height).toBeLessThanOrEqual(i.drawnH);
      const top = r.bottomY - r.height;
      expect(top + STAGE1_CASTLE_CENTER_FRAC * i.drawnH).toBeCloseTo(i.farH / 2, 6);
    }
  });

  it('横長でも絵が既に下がり切っている(城が帯より下)なら上げない', () => {
    const i = { screenW: 500, screenH: 400, farH: 300, drawnH: 100, castleY: 100 };
    expect(stage1CastleLayout(i)).toEqual({ bottomY: 400, height: 100 });
  });
});

import { describe, it, expect } from 'vitest';
import { slideOutOfRects } from './hudAvoidRects';

describe('縁の矢印が会話窓を避ける slideOutOfRects', () => {
  const W = 1280, H = 720, mx = 26, mt = 154, mb = 30;
  const box = { left: 380, top: 600, right: 900, bottom: 692 }; // 横長の会話窓(画面の下の中央)
  it('下の縁の点は横へ(近い側の外へ)ずらす', () => {
    const q = slideOutOfRects(500, H - mb, [box], 18, mx, W - mx, mt, H - mb);
    expect(q).toEqual({ x: 380 - 18, y: H - mb });
    const q2 = slideOutOfRects(850, H - mb, [box], 18, mx, W - mx, mt, H - mb);
    expect(q2).toEqual({ x: 900 + 18, y: H - mb });
  });
  it('左右の縁の点は縦へずらす', () => {
    const left = { left: 0, top: 160, right: 300, bottom: 260 }; // 縦持ちの左上の会話窓
    const q = slideOutOfRects(mx, 200, [left], 18, mx, 405 - mx, mt, 878 - mb);
    expect(q.x).toBe(mx);
    expect(q.y).toBe(260 + 18); // 上の外(142)は縁の帯(上の HUD の余白 154)より上=反対側の下へ
  });
  it('窓の外の点・窓が無い時は元のまま', () => {
    expect(slideOutOfRects(100, H - mb, [box], 18, mx, W - mx, mt, H - mb)).toEqual({ x: 100, y: H - mb });
    expect(slideOutOfRects(500, H - mb, [], 18, mx, W - mx, mt, H - mb)).toEqual({ x: 500, y: H - mb });
  });
});

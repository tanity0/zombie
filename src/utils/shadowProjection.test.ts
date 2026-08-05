import { describe, expect, it } from 'vitest';
import { horizontalShadowCorners } from './shadowProjection';

describe('案C: シルエット影の根元と先端を全部水平にする', () => {
  it('斜めの光でも根元と先端の幅方向は画面水平のまま', () => {
    const q = horizontalShadowCorners(100, 200, 0.8, -0.6, 50, 20, 30, 0, 1);
    expect(q.c0.y).toBe(q.c1.y);
    expect(q.c2.y).toBe(q.c3.y);
    expect(q.c0.y).toBe(170);
    expect(q.c2.y).toBe(200);
    expect(Math.abs(q.c0.x - q.c1.x)).toBe(60);
    expect(Math.abs(q.c2.x - q.c3.x)).toBe(40);
  });

  it('光が反対へ回ると先端だけ反対へ伸び、底辺は同じ場所に残る', () => {
    const right = horizontalShadowCorners(100, 200, 1, 0.25, 40, 20, 30, 0, 1);
    const left = horizontalShadowCorners(100, 200, -1, 0.25, 40, 20, 30, 0, 1);
    expect((right.c0.x + right.c1.x) / 2).toBe(140);
    expect((left.c0.x + left.c1.x) / 2).toBe(60);
    expect(right.c2).toEqual(left.c2);
    expect(right.c3).toEqual(left.c3);
  });

  it('真横の光では伸び影が水平線へ潰れ、接地点はずれない', () => {
    const q = horizontalShadowCorners(100, 200, 1, 0, 80, 20, 30, 0, 1);
    expect([q.c0.y, q.c1.y, q.c2.y, q.c3.y]).toEqual([200, 200, 200, 200]);
    expect(q.c2).toEqual({ x: 80, y: 200 });
    expect(q.c3).toEqual({ x: 120, y: 200 });
  });

  it('素材の反転はUVの左右だけを交換し、水平骨格は変えない', () => {
    const normal = horizontalShadowCorners(0, 0, 0.5, 0.5, 40, 10, 15, 4, 1);
    const flipped = horizontalShadowCorners(0, 0, 0.5, 0.5, 40, 10, 15, 4, -1);
    expect(flipped.c0).toEqual(normal.c1);
    expect(flipped.c1).toEqual(normal.c0);
    expect(flipped.c2).toEqual(normal.c3);
    expect(flipped.c3).toEqual(normal.c2);
  });
});


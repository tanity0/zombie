import { describe, it, expect } from 'vitest';
import { projectCorridorPillars, CORRIDOR_CFG } from './corridorProjection';

// ステージ6(洋館)通路の疑似投影の不変条件(v0.25.2077)。
const W = 430, H = 932;

describe('projectCorridorPillars (洋館通路の1/z投影)', () => {
  it('片側count本×左右=2×count個を返す', () => {
    expect(projectCorridorPillars(0, W, H)).toHaveLength(CORRIDOR_CFG.count * 2);
  });

  it('奥→手前の描画順(depth降順)', () => {
    const ps = projectCorridorPillars(123, W, H);
    for (let i = 1; i < ps.length; i++) expect(ps[i - 1].depth).toBeGreaterThanOrEqual(ps[i].depth);
  });

  it('手前(depth小)ほど大きく・下に・外側に描かれる', () => {
    const ps = projectCorridorPillars(0, W, H).filter(p => p.side === 1);
    const far = ps[0], near = ps[ps.length - 1];
    expect(near.h).toBeGreaterThan(far.h);
    expect(near.y).toBeGreaterThan(far.y);
    expect(near.x).toBeGreaterThan(far.x); // 右側: 手前ほど右(外)へ
  });

  it('一周(spacing×count)進むと同じ配置に戻る=無限ループ', () => {
    const loop = CORRIDOR_CFG.spacing * CORRIDOR_CFG.count;
    const a = projectCorridorPillars(200, W, H);
    const b = projectCorridorPillars(200 + loop, W, H);
    expect(b).toEqual(a);
  });

  it('前進すると柱の depth が減る(奥から手前へ流れる)', () => {
    const key = (p: { side: number; depth: number }) => p.side;
    const a = projectCorridorPillars(0, W, H).filter(p => key(p) === 1);
    const b = projectCorridorPillars(100, W, H).filter(p => key(p) === 1);
    // 同じ柱(index対応が回るので集合で比較): 全depthの合計は一定だが、個々は100ずつ手前へ寄る(mod)。
    const shifted = a.map(p => (p.depth - 100 + CORRIDOR_CFG.spacing * CORRIDOR_CFG.count) % (CORRIDOR_CFG.spacing * CORRIDOR_CFG.count)).sort((x, y) => x - y);
    const bd = b.map(p => p.depth).sort((x, y) => x - y);
    bd.forEach((d, i) => expect(d).toBeCloseTo(shifted[i], 6));
  });
});

import { describe, it, expect } from 'vitest';
import {
  beamTipLayout, beamTipCells, beamTipParticles, beamTipSegments, beamTipSeed, beamTipEventCount,
  BEAM_TIP_HALO_ALPHA, BEAM_TIP_CORE_ALPHA, BEAM_TIP_PARTICLE_MAX, BEAM_TIP_HALO_PARTICLE_MUL, BEAM_TIP_CORE_PARTICLE_CAP,
  type BeamTipInput, type BeamTipOrigin,
} from './beamTip';

// 金環の値(半幅7: 帯=7×2.6・芯=7×0.7・濃さ0.5/0.95・1ドット3px)。
const GOLD: BeamTipInput = {
  len: 420, haloW: 7 * 2.6, coreW: 7 * 0.7, haloAlpha: 0.5, coreAlpha: 0.95,
  dot: 3, time: 12345, seed: beamTipSeed('gold-ring-1'), placement: 'inside',
};
const STILL: BeamTipOrigin = { ax: 100, ay: 200, ux: 1, uy: 0, len: 420 };
const still = () => STILL;

describe('beamTip', () => {
  it('段の幅と濃さは根元から先へ単調に落ち、最後は1ドット・最後の2段は点線', () => {
    for (const W of [18.2, 4.9, 30, 60, 3]) {
      for (const seed of [1, 2, 3, 77]) {
        const segs = beamTipSegments(100, 150, W, 3, 1, BEAM_TIP_HALO_ALPHA, seed, 1);
        expect(segs.length).toBeGreaterThan(0);
        for (let j = 1; j < segs.length; j++) {
          expect(segs[j].w).toBeLessThanOrEqual(segs[j - 1].w);
          expect(segs[j].alpha).toBeLessThan(segs[j - 1].alpha);
          expect(segs[j].s0).toBeCloseTo(segs[j - 1].s1, 6);
        }
        for (const g of segs) expect(Math.abs(g.off) + g.w / 2).toBeLessThanOrEqual(W / 2 + 1e-6); // 帯の外へ出ない
        expect(segs[segs.length - 1].w).toBe(Math.min(3, W));
        expect(segs[segs.length - 1].s1).toBe(150);
        expect(segs[segs.length - 1].dither).toBe(true);
        expect(segs[0].dither).toBe(false);
      }
    }
    const wide = beamTipSegments(0, 90, 30, 3, 1, BEAM_TIP_HALO_ALPHA, 5, 1).map(g => g.w);
    expect(wide).toEqual([30, 21, 12, 3]);
  });

  it('段は上下対称にならない光線が在る(中心が射線からずれる)', () => {
    let shifted = 0;
    for (let seed = 0; seed < 40; seed++) {
      if (beamTipSegments(0, 90, 30, 3, 1, BEAM_TIP_HALO_ALPHA, seed, 1).some(g => g.off !== 0)) shifted++;
    }
    expect(shifted).toBeGreaterThan(10);
  });

  it('水平の光線は1列1枚の階段(高さ=段の幅)で、格子に乗る', () => {
    const lay = beamTipLayout({ ...GOLD, time: 0 });
    const solid = lay.halo.filter(g => !g.dither);
    const cells = beamTipCells(99, 201.5, 1, 0, solid, 3, 999);
    for (const c of cells) {
      expect(c.x % 3).toBe(0);
      expect(c.y % 3).toBe(0);
    }
    const hs = new Set(cells.map(c => c.h));
    for (const g of solid) expect(hs.has(g.w)).toBe(true);
    // 点線の段はドットが1つおきに抜ける
    const dith = lay.halo.filter(g => g.dither);
    const dc = beamTipCells(99, 201.5, 1, 0, dith, 3, 999);
    for (const c of dc) expect(((c.x / 3 + c.y / 3) & 1)).toBe(0);
  });

  it('粒は生まれた瞬間、伸びていた先端の1ドットの位置で本体の段と同じ濃さ(フェードの出だしなし)', () => {
    const seen = new Set<number>();
    for (let t = 0; t < 4000; t += 23) {
      for (const p of beamTipParticles({ ...GOLD, time: t }, still)) {
        if (seen.has(p.bornAt)) continue;
        seen.add(p.bornAt);
        const at = beamTipParticles({ ...GOLD, time: p.bornAt }, still).filter(q => q.bornAt === p.bornAt);
        expect(at.length).toBeGreaterThan(0);
        const lay = beamTipLayout({ ...GOLD, time: p.bornAt });
        const sx = STILL.ax + lay.tipEnd; // 伸びていた1ドットは [tipEnd, tipEnd+1ドット]
        for (const q of at) {
          expect(q.u).toBe(0);
          expect(q.alpha).toBeCloseTo(q.core ? Math.min(BEAM_TIP_CORE_PARTICLE_CAP, GOLD.coreAlpha * BEAM_TIP_CORE_ALPHA[3]) : GOLD.haloAlpha * BEAM_TIP_HALO_PARTICLE_MUL, 6);
          expect(q.x).toBeGreaterThanOrEqual(sx - q.size);
          expect(q.x).toBeLessThanOrEqual(sx + 3);
        }
      }
    }
    expect(seen.size).toBeGreaterThan(20);
  });

  it('粒の濃さ: 帯の色は帯の濃さ×0.9まで・芯の色は0.7まで・数は上限以内', () => {
    for (let t = 0; t < 4000; t += 17) {
      const ps = beamTipParticles({ ...GOLD, time: t }, still);
      expect(ps.length).toBeLessThanOrEqual(BEAM_TIP_PARTICLE_MAX);
      for (const p of ps) expect(p.alpha).toBeLessThanOrEqual(p.core ? BEAM_TIP_CORE_PARTICLE_CAP : GOLD.haloAlpha * 0.9 + 1e-9);
    }
  });

  it('粒は生まれた時の向きで飛ぶ(後で射線が動いても、飛んでいる粒の世界座標は変わらない)', () => {
    const T = 3000;
    const turned: BeamTipOrigin = { ax: 400, ay: -50, ux: 0, uy: 1, len: 300 };
    const a = beamTipParticles({ ...GOLD, time: T }, still);
    // 時刻 T-120 以降に光線が振られた: それより前に生まれた粒は同じ所に居る
    const b = beamTipParticles({ ...GOLD, time: T }, t => (t < T - 120 ? STILL : turned));
    const old = a.filter(p => p.bornAt < T - 120);
    expect(old.length).toBeGreaterThan(0);
    for (const p of old) expect(b.some(q => q.bornAt === p.bornAt && q.x === p.x && q.y === p.y && q.alpha === p.alpha)).toBe(true);
  });

  it('同じ入力なら同じ出力・時刻を進めると粒が流れる', () => {
    expect(beamTipParticles(GOLD, still)).toEqual(beamTipParticles({ ...GOLD }, still));
    expect(beamTipLayout(GOLD)).toEqual(beamTipLayout({ ...GOLD }));
    const xs = new Set<number>();
    for (let t = 0; t < 2000; t += 40) {
      const ps = beamTipParticles({ ...GOLD, time: t }, still);
      xs.add(Math.round(ps.reduce((s, p) => s + p.x, 0) / Math.max(1, ps.length)));
    }
    expect(xs.size).toBeGreaterThan(10);
  });

  it('粒の出ない回(間)が数百msに1回くらい在る', () => {
    const seed = GOLD.seed;
    let zeros = 0;
    for (let c = 0; c < 100; c++) if (beamTipEventCount(seed, c) === 0) zeros++;
    expect(zeros).toBeGreaterThan(5);
    expect(zeros).toBeLessThan(40);
  });

  it('光線が出る前(since より前)に生まれた粒は出さない', () => {
    expect(beamTipParticles({ ...GOLD, time: 3000 }, still, BEAM_TIP_PARTICLE_MAX, 3000)).toEqual([]);
    for (const p of beamTipParticles({ ...GOLD, time: 3000 }, still, BEAM_TIP_PARTICLE_MAX, 2800)) expect(p.bornAt).toBeGreaterThanOrEqual(2800);
  });

  it('濃さの係数が0なら全部消える', () => {
    const z = { ...GOLD, haloAlpha: 0, coreAlpha: 0 };
    const lay = beamTipLayout(z);
    expect(lay.halo).toEqual([]);
    expect(lay.core).toEqual([]);
    expect(beamTipParticles(z, still)).toEqual([]);
  });
});

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

  // ---- 敵の光線('outside')・旗・上限(社長 2026-11-12「他のレーザー系も統一で」→ 判定の外に赤/紫のベタ面を作らない) ----
  const MIMIR: BeamTipInput = {
    len: 600, haloW: 68, coreW: 34, haloAlpha: 0.45, coreAlpha: 0.85, dot: 3, time: 5000, seed: beamTipSeed('mimir:laser'),
    placement: 'outside', bigParticles: false,
  };
  const SNIPE: BeamTipInput = { ...MIMIR, haloW: 80, coreW: 4, haloAlpha: 0.35, coreAlpha: 0.9, seed: beamTipSeed('b:snipe'), narrowBand: true };
  const THIN: BeamTipInput = { ...MIMIR, haloW: 8, coreW: 3, haloAlpha: 0.75, coreAlpha: 1, seed: 3 };
  const OUTS = [MIMIR, SNIPE, THIN];

  it("'outside': 判定の端より内側には何も足さない・外の帯は全部点線・幅は帯の60%(狭い帯は40%)以下・濃さは本体の0.5以下", () => {
    for (const base of OUTS) {
      for (let t = 0; t < 3000; t += 31) {
        const lay = beamTipLayout({ ...base, time: t });
        expect(lay.halo.length).toBeGreaterThan(0);
        for (const g of [...lay.halo, ...lay.core]) expect(g.s0).toBeGreaterThanOrEqual(base.len);
        for (const g of lay.halo) {
          expect(g.dither).toBe(true); // 抜けの無い帯の段は外に無い
          expect(g.w).toBeLessThanOrEqual(base.haloW * (base.narrowBand ? 0.4 : 0.6) + 1e-9);
          expect(g.alpha).toBeLessThanOrEqual(base.haloAlpha * 0.5 + 1e-9);
          expect(Math.abs(g.off) + g.w / 2).toBeLessThanOrEqual(base.haloW * (base.narrowBand ? 0.4 : 0.6) / 2 + 1e-9);
        }
        // 抜けの無い物は芯だけ(2ドット以下の細い線が、端から4ドットまで)
        for (const g of lay.core) {
          expect(g.w).toBeLessThanOrEqual(6);
          expect(g.s1 - base.len).toBeLessThanOrEqual(12);
        }
      }
    }
  });

  it("'outside': 外へ出る長さの上限(帯=帯の幅×0.5 と 30px の小さい方・粒=その1.5倍)", () => {
    for (const base of OUTS) {
      const lim = Math.max(6, Math.min(base.haloW * 0.5, 30));
      for (let t = 0; t < 4000; t += 13) {
        for (const ang of [0, 0.7, Math.PI / 2, 2.4]) {
          const ux = Math.cos(ang), uy = Math.sin(ang);
          const inp = { ...base, time: t };
          const lay = beamTipLayout(inp);
          for (const g of lay.halo) expect(g.s1 - base.len).toBeLessThanOrEqual(lim);
          const o: BeamTipOrigin = { ax: 50, ay: -80, ux, uy, len: base.len };
          const reach = Math.max(lim * 1.5, lay.tipEnd - base.len + 6);
          for (const c of beamTipCells(o.ax, o.ay, ux, uy, [...lay.halo, ...lay.core], 3, 999, 0.7)) {
            const along = (c.x + c.w / 2 - o.ax) * ux + (c.y + c.h / 2 - o.ay) * uy;
            expect(along).toBeGreaterThanOrEqual(base.len - 3 * 1.5);
          }
          for (const p of beamTipParticles(inp, () => o)) {
            const along = (p.x + p.size / 2 - o.ax) * ux + (p.y + p.size / 2 - o.ay) * uy;
            expect(along).toBeGreaterThan(base.len);
            expect(along - base.len).toBeLessThanOrEqual(reach + 3);
            expect(p.size).toBe(3); // 敵の光線は1ドットの粒だけ
          }
        }
      }
    }
    // 太い帯ほど相対的に短い: ミーミル(幅68)も30pxで止まる
    const m = beamTipLayout(MIMIR);
    expect(m.halo[m.halo.length - 1].s1 - MIMIR.len).toBe(30);
  });

  it('粒の上限を下げると、その数までしか出ない', () => {
    let maxSeen = 0;
    for (let t = 0; t < 6000; t += 11) {
      const n = beamTipParticles({ ...MIMIR, time: t }, () => ({ ax: 0, ay: 0, ux: 1, uy: 0, len: 600 }), 8).length;
      expect(n).toBeLessThanOrEqual(8);
      maxSeen = Math.max(maxSeen, n);
    }
    expect(maxSeen).toBe(8);
  });

  it('先端を出さない旗で何も出ない', () => {
    const h = { ...MIMIR, hidden: true };
    const lay = beamTipLayout(h);
    expect(lay.halo).toEqual([]);
    expect(lay.core).toEqual([]);
    expect(beamTipParticles(h, still)).toEqual([]);
    expect(beamTipParticles({ ...GOLD, hidden: true }, still)).toEqual([]);
  });

  it('金環の段は v0.25.5526 と同じ(敵の光線の追加で変わらない)', () => {
    const lay = beamTipLayout({ ...GOLD, time: 0 });
    expect([lay.haloBodyLen, lay.coreBodyLen, lay.tipEnd]).toEqual([375, 397.5, 426]);
    expect(lay.halo.map(g => [g.s0, g.s1, g.w, g.off])).toEqual([[375, 390, 18, 0], [390, 399, 12, -3], [399, 417, 6, -3], [417, 420, 3, -3]]);
    expect(lay.core.map(g => [g.s0, g.s1, g.w, g.off])).toEqual([[397.5, 412.5, 7 * 0.7, 0], [412.5, 421.5, 3, 0], [421.5, 426, 3, 0]]);
  });

  it('太い光線の刻み(0.7ドット)でも斜めに穴が空かない(1段目の帯の中のドットが全部埋まる)', () => {
    const seg = [{ s0: 600, s1: 660, w: 30, off: 0, alpha: 1, dither: false }];
    for (const ang of [0.3, 0.785, 1.1, 2.0]) {
      const ux = Math.cos(ang), uy = Math.sin(ang);
      const cells = beamTipCells(0, 0, ux, uy, seg, 3, 9999, 0.7);
      const on = new Set<string>();
      for (const c of cells) for (let y = c.y; y < c.y + c.h; y += 3) on.add(`${c.x / 3},${y / 3}`);
      // 帯の中心線から十分内側(1ドット以上内)のドットは必ず埋まる
      for (let s = 606; s < 654; s += 1) for (let l = -10; l <= 10; l += 1) {
        const gx = Math.floor((ux * s - uy * l) / 3), gy = Math.floor((uy * s + ux * l) / 3);
        expect(on.has(`${gx},${gy}`)).toBe(true);
      }
    }
  });
});

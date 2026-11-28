import { describe, it, expect } from 'vitest';
import {
  buildProjTable, makeProjFrame, project, unproject, projDisplayToScreen, projG, projGInv,
  projLocalYOfWorld, projWorldYOfLocal, projScaleAtLocal, projTOfL, projRefLocalY, projAttentionRef,
  visibleWorldQuad, groundStripTile, groundVsObjectDiff, groundSlipBound, projDistanceFade, southCullWorldY,
  visibleWorldBands, projScreenRowsL, projBoxOnScreen, projScreenOutside, projectInto, makeProjPoint,
  projTableKey, projScaleYNearAt, projConvAt, projScaleYAt, updateProjTable, projTableScaleY, type ProjTable,
  type GroundPerspectiveParams, type ProjFrame, type ProjFrameInput,
} from './perspectiveProjection';
import { zoomCameraDownFrac } from './cameraZoom';

// pixiScene の既定値(GROUND_TILE_SCALE_X=0.82 / g3dfar=0.10 / g3dc=1 / g3d=1 / gfar=0.055 / near=0.82 / gcurve=2.6)
const P: GroundPerspectiveParams = {
  tileScaleX: 0.82, trapFar: 0.10, trapCurve: 1, trapezoid: 1,
  farScale: 0.055, nearScale: 0.82, curve: 2.6,
};
// 縦持ちの1例(論理 430×900・farH 234・主人公の高さ 28・camdown 0.08)
const SW = 430, SH = 900, FAR_H = 234, PH = 28, CAMDOWN = 0.08;
const STRIP_H = (SH - FAR_H) / 72;
const TABLE = buildProjTable(P, STRIP_H, 180);
const L_REF_1 = projRefLocalY(SH, zoomCameraDownFrac(CAMDOWN, 1), PH, FAR_H);
const T_STD = projTOfL(L_REF_1, STRIP_H);

// 再現できる乱数
const rng = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};

/** ズーム z のカメラ(②: ℓ_ref をズームの定位置へ運ぶ)と worldGroup の変換(引き=farH 支点・寄り=中央支点)。 */
const frameAt = (z: number, camX: number, camY: number, extra: Partial<ProjFrameInput> = {}, zref: 1 | 2 = 2): ProjFrame => {
  const lRef = projRefLocalY(SH, zoomCameraDownFrac(CAMDOWN, zref === 2 ? z : 1), PH, FAR_H);
  const pivotY = z < 1 ? FAR_H : SH / 2;
  return makeProjFrame({
    table: TABLE, camX, camY, farH: FAR_H, screenW: SW, screenH: SH,
    wRef: camY + FAR_H + lRef, lRef, tStd: T_STD,
    wgScale: z, wgX: (SW / 2) * (1 - z), wgY: pivotY * (1 - z),
    ...extra,
  });
};

describe('表 G(ℓ)=∫dℓ/scaleY', () => {
  it('単調増加・逆が往復する(表の中と外)', () => {
    let prev = -Infinity;
    for (let l = -300; l <= TABLE.lMax + 500; l += 3.7) {
      const g = projG(TABLE, l);
      expect(g).toBeGreaterThan(prev);
      prev = g;
      expect(projGInv(TABLE, g)).toBeCloseTo(l, 8);
    }
  });
  it('1,440 点(180本×8)', () => {
    expect(TABLE.n).toBe(1440);
  });
});

describe('基準行で恒等(受け入れ条件3)', () => {
  const r = rng(7);
  for (let k = 0; k < 40; k++) {
    const z = [1, 0.85, 0.7, 0.4, 1.3][k % 5];
    const camX = (r() - 0.5) * 20000, camY = (r() - 0.5) * 20000;
    it(`z=${z} cam=(${camX.toFixed(0)},${camY.toFixed(0)})`, () => {
      const f = frameAt(z, camX, camY);
      const wx = camX + r() * SW;
      const p = project(f, wx, f.wRef);
      expect(p.x).toBeCloseTo(wx, 6);
      expect(p.y).toBeCloseTo(f.wRef, 6);
      expect(p.s).toBeCloseTo(1, 6);
      expect(p.l).toBeCloseTo(f.lRef, 6);
    });
  }
  it('ズーム1の ℓ_ref は 302 付近(t≈0.46・設計書の1例)', () => {
    expect(L_REF_1).toBeCloseTo(900 * 0.58 + 14 - 234, 9);
    expect(T_STD).toBeGreaterThan(0.44);
    expect(T_STD).toBeLessThan(0.48);
  });
});

describe('?projzref の2つの経路', () => {
  it('②(既定): 引き 0.7/0.4 で ℓ_ref が深くなり、その行で恒等', () => {
    const f1 = frameAt(1, 0, 0), f7 = frameAt(0.7, 0, 0), f4 = frameAt(0.4, 0, 0);
    expect(f7.lRef).toBeGreaterThan(f1.lRef);
    expect(f4.lRef).toBeGreaterThan(f7.lRef);
    for (const f of [f7, f4]) {
      const p = project(f, 123, f.wRef);
      expect(p.s).toBeCloseTo(1, 9);
      expect(p.y).toBeCloseTo(f.wRef, 9);
    }
  });
  it('①(控え): ℓ_ref はズームに依らずズーム1の値のまま', () => {
    for (const z of [1, 0.7, 0.4]) expect(frameAt(z, 0, 0, {}, 1).lRef).toBeCloseTo(L_REF_1, 9);
  });
  it('②で ℓ_ref が動いても表は作り直さない(同じ表で恒等)', () => {
    const f = frameAt(0.55, 10, 20);
    expect(f.table).toBe(TABLE);
  });
});

describe('アテンション中の組 (W_refAtt, ℓ_refAtt)', () => {
  const r = rng(11);
  for (let k = 0; k < 30; k++) {
    const env = r();
    it(`包絡線 ${env.toFixed(3)} で注目点へ運んだ行で恒等`, () => {
      const base = frameAt(1, 500, -3000);
      const attY = base.wRef + (r() - 0.6) * 400;
      const att = projAttentionRef(base.wRef, attY, env, base.camY, base.farH);
      const f = frameAt(1, 500, -3000, { wRef: att.wRef, lRef: att.lRef });
      expect(att.lRef).toBeCloseTo(att.wRef - base.camY - base.farH, 9);
      const p = project(f, 777, att.wRef);
      expect(p.s).toBeCloseTo(1, 6);
      expect(p.y).toBeCloseTo(att.wRef, 6);
      expect(p.x).toBeCloseTo(777, 6);
    });
  }
  it('包絡線 1 で基準点=注目点', () => {
    const att = projAttentionRef(100, 400, 1, 0, FAR_H);
    expect(att.wRef).toBe(400);
  });
});

describe('単調性(北ほど上・北ほど小さい)', () => {
  it('world Y が増えるほど表示Y・倍率が増える', () => {
    for (const z of [1, 0.7, 0.4]) {
      const f = frameAt(z, 0, 0);
      let prevY = -Infinity, prevS = -Infinity;
      for (let wy = f.wRef - 3000; wy <= f.wRef + 400; wy += 5) {
        const p = project(f, 0, wy);
        expect(p.y).toBeGreaterThan(prevY);
        expect(p.s).toBeGreaterThanOrEqual(prevS);
        prevY = p.y; prevS = p.s;
      }
    }
  });
});

describe('北の切り・南の延長(§1-6・§10 B1)', () => {
  it('地平線より北は定義域の外(alpha 0)', () => {
    const f = frameAt(1, 0, 0);
    const horizonW = projWorldYOfLocal(f, 0);
    const p = project(f, 0, horizonW - 50);
    expect(p.inDomain).toBe(false);
    expect(p.alpha).toBe(0);
    expect(project(f, 0, horizonW + 1).inDomain).toBe(true);
  });
  it('ズーム1の地平線は主人公(基準行)から北 約630 world px', () => {
    const f = frameAt(1, 0, 0);
    const d = f.wRef - projWorldYOfLocal(f, 0);
    expect(d).toBeGreaterThan(560);
    expect(d).toBeLessThan(700);
  });
  it('南は帯の範囲の外へ延長した値を返す(描かないを返さない・発散しない・逆転しない)', () => {
    const f = frameAt(0.4, 0, 0);
    let prev = -Infinity;
    for (let wy = f.wRef; wy < f.wRef + 5000; wy += 25) {
      const p = project(f, 50, wy);
      expect(p.inDomain).toBe(true);
      expect(p.alpha).toBe(1);
      expect(Number.isFinite(p.y) && Number.isFinite(p.s)).toBe(true);
      expect(p.y).toBeGreaterThan(prev);
      prev = p.y;
    }
  });
  it('描く距離のフェード(1,200→1,500 で 1→0)', () => {
    expect(projDistanceFade(1000, 1200, 1500)).toBe(1);
    expect(projDistanceFade(1350, 1200, 1500)).toBeCloseTo(0.5, 9);
    expect(projDistanceFade(1600, 1200, 1500)).toBe(0);
    expect(projDistanceFade(99999, 0, 0)).toBe(1);
    // 始まりも終わりもなだらか(両端で傾き0・単調に減る)
    const e = 1e-3;
    expect((1 - projDistanceFade(1200 + e, 1200, 1500)) / e).toBeLessThan(1e-3);
    expect(projDistanceFade(1500 - e, 1200, 1500) / e).toBeLessThan(1e-3);
    let prevF = 1;
    for (let d = 1200; d <= 1500; d += 5) { const v = projDistanceFade(d, 1200, 1500); expect(v).toBeLessThanOrEqual(prevF + 1e-12); prevF = v; }
    const f = frameAt(0.4, 0, 0, { farRefY: 0, farStart: 1200, farEnd: 1500 });
    expect(project(f, 0, -1600).alpha).toBe(0);
  });
});

describe('投影と逆投影の往復(誤差 1e-6)', () => {
  const r = rng(3);
  it('ズーム・支点・パン・揺れ・アテンションの組・?projzref=1/2 を乱数で振る', () => {
    for (let k = 0; k < 400; k++) {
      const z = 0.4 + r() * 1.2;
      const zref = (k % 2 === 0 ? 2 : 1) as 1 | 2;
      const camX = (r() - 0.5) * 1e5, camY = (r() - 0.5) * 1e5;
      let f = frameAt(z, camX, camY, { wgX: (r() - 0.5) * 300, wgY: (r() - 0.5) * 300, shakeX: (r() - 0.5) * 10, shakeY: (r() - 0.5) * 10 }, zref);
      if (k % 3 === 0) {
        const att = projAttentionRef(f.wRef, f.wRef + (r() - 0.5) * 300, r(), camY, FAR_H);
        f = makeProjFrame({ ...f, wRef: att.wRef, lRef: att.lRef });
      }
      const wx = camX + (r() - 0.5) * 2000;
      const wy = f.wRef + (r() - 0.7) * 500;
      const p = project(f, wx, wy);
      if (!p.inDomain) continue;
      const sc = projDisplayToScreen(f, p.x, p.y);
      const back = unproject(f, sc.x, sc.y);
      expect(Math.abs(back.x - wx)).toBeLessThan(1e-6 * Math.max(1, Math.abs(wx)));
      expect(Math.abs(back.y - wy)).toBeLessThan(1e-6 * Math.max(1, Math.abs(wy)));
    }
  });
});

describe('可視域の台形(visibleWorldQuad)', () => {
  it('北に広く・奥ほど左右に広い。上の辺は地平線/描く距離の上限で切る', () => {
    const f = frameAt(1, 0, 0);
    const q = visibleWorldQuad(f);
    expect(q.tr.x - q.tl.x).toBeGreaterThan(q.br.x - q.bl.x);
    expect(q.tl.y).toBeCloseTo(projWorldYOfLocal(f, 0), 6); // ズーム1は画面上端が地平線より上 → 地平線で切る
    const f4 = frameAt(0.4, 0, 0, { farRefY: 0, farStart: 1200, farEnd: 1500 });
    const q4 = visibleWorldQuad(f4);
    expect(q4.tl.y).toBeCloseTo(-1500, 4);
  });
  it('画面の四隅の点は台形の中(逆投影と一致)', () => {
    const f = frameAt(0.7, 300, 400);
    const q = visibleWorldQuad(f);
    const b = unproject(f, 0, SH);
    expect(q.bl.x).toBeCloseTo(b.x, 6);
    expect(q.bl.y).toBeCloseTo(b.y, 6);
  });
});

describe('地面の模様と物の投影の位置の差(受け入れ条件2・§1-1b の表)', () => {
  it('基準行・ズーム・カメラを乱数で振っても上限の範囲(72本・中央標本)', () => {
    const r = rng(19);
    for (let k = 0; k < 2000; k++) {
      const z = [1, 0.85, 0.7, 0.4][k % 4];
      const f = frameAt(z, (r() - 0.5) * 1e5, (r() - 0.5) * 1e5);
      const wx = f.cxw + (r() - 0.5) * 2000;
      const wy = f.wRef + (r() - 0.8) * 1500;
      const lObj = projLocalYOfWorld(f, wy);
      if (lObj < 0 || lObj > TABLE.lMax) continue;
      const d = groundVsObjectDiff(f, wx, wy);
      const bound = groundSlipBound(d.t, d.x, P);
      expect(Math.abs(d.dx)).toBeLessThanOrEqual(bound * 1.05 + 1e-6);
      expect(Math.abs(d.dy)).toBeLessThan(0.1);
    }
  });
  it('設計書の表: t≈0.46 x=215 で 2.7px 前後', () => {
    expect(groundSlipBound(0.46, 215, P)).toBeGreaterThan(2.4);
    expect(groundSlipBound(0.46, 215, P)).toBeLessThan(3.0);
  });
});

describe('地面の帯(絶対値・中央標本)', () => {
  it('基準行がズーム1の定位置にある時は tileScale が今の式(中央の t)と同じ', () => {
    const f = frameAt(1, 0, 0);
    for (const i of [0, 10, 33, 71, 120]) {
      const tc = projTOfL((i + 0.5) * STRIP_H, STRIP_H);
      const g = groundStripTile(f, i, 256, 256, SW * 2.5);
      expect(g.tileScaleX).toBeCloseTo(0.82 * (0.10 + 0.90 * tc), 9);
      expect(g.tileScaleY).toBeCloseTo(0.055 + 0.765 * Math.pow(tc, 2.6), 9);
    }
  });
  it('カメラが止まったまま基準行だけ動いても、同じ world 点の地面の模様と物は一緒に動く(帯の中央で差0)', () => {
    const r = rng(5);
    for (let k = 0; k < 200; k++) {
      const f = frameAt(0.4 + r() * 0.6, 100, 200);
      const i = Math.floor(r() * 150);
      const g = groundStripTile(f, i, 256, 200, SW * 2.5);
      const p = project(f, f.cxw, g.wc);
      expect(p.l).toBeCloseTo(g.lc, 6); // 帯の中央の world 点は物の投影でも帯の中央に写る
    }
  });
  it('引き ②で ℓ_ref が深くなると模様が細かくなる(conv(ズーム1の ℓ_ref)/conv(今の ℓ_ref) 倍)', () => {
    const f1 = frameAt(1, 0, 0), f4 = frameAt(0.4, 0, 0);
    const a = groundStripTile(f1, 40, 256, 256, 1000), b = groundStripTile(f4, 40, 256, 256, 1000);
    expect(b.tileScaleX / a.tileScaleX).toBeCloseTo(f1.convRef / f4.convRef, 9);
    expect(b.tileScaleX).toBeLessThan(a.tileScaleX);
  });
});

describe('南のカリングの余白(作る物4)', () => {
  it('絵の高さが大きいほど南へ広がる・帯の範囲の外へは延ばさない', () => {
    const f = frameAt(1, 0, 0);
    const lb = SH - FAR_H;
    const y0 = southCullWorldY(f, 0, lb), y1 = southCullWorldY(f, 200, lb), y2 = southCullWorldY(f, 600, lb);
    expect(y1).toBeGreaterThanOrEqual(y0);
    expect(y2).toBeGreaterThanOrEqual(y1);
    expect(y2).toBeLessThanOrEqual(projWorldYOfLocal(f, TABLE.lMax) + 1e-6);
    expect(projScaleAtLocal(f, lb)).toBeGreaterThan(1);
  });
});

describe('傾きのツマミ(?gfar・?gcurve・?g3d・?g3dfar・?g3dc)を変えても成り立つ', () => {
  const variants: GroundPerspectiveParams[] = [
    { ...P, farScale: 0.04 },
    { ...P, curve: 3.2 },
    { ...P, curve: 2.0, farScale: 0.09 },
    { ...P, trapFar: 0.05 },
    { ...P, trapFar: 0.3, trapCurve: 1.4 },
    { ...P, trapezoid: 0.5 },
    { ...P, trapezoid: 0 },
  ];
  const r = rng(29);
  for (const pv of variants) {
    it(`${JSON.stringify(pv)}`, () => {
      const tb = buildProjTable(pv, STRIP_H, 180);
      for (let k = 0; k < 60; k++) {
        const z = [1, 0.7, 0.4][k % 3];
        const camX = (r() - 0.5) * 1e4, camY = (r() - 0.5) * 1e4;
        const lRef = projRefLocalY(SH, zoomCameraDownFrac(CAMDOWN, z), PH, FAR_H);
        const f = makeProjFrame({
          table: tb, camX, camY, farH: FAR_H, screenW: SW, screenH: SH, wRef: camY + FAR_H + lRef, lRef, tStd: T_STD,
          wgScale: z, wgX: (SW / 2) * (1 - z), wgY: (z < 1 ? FAR_H : SH / 2) * (1 - z),
        });
        // 基準行で恒等
        const wx = camX + r() * SW;
        const p0 = project(f, wx, f.wRef);
        expect(p0.x).toBeCloseTo(wx, 6);
        expect(p0.y).toBeCloseTo(f.wRef, 6);
        expect(p0.s).toBeCloseTo(1, 6);
        // 地面の模様と物の位置が一致(上限の範囲)
        const wy = f.wRef + (r() - 0.8) * 1200;
        const l = projLocalYOfWorld(f, wy);
        if (l < 0 || l > tb.lMax) continue;
        const d = groundVsObjectDiff(f, f.cxw + (r() - 0.5) * 2000, wy);
        expect(Math.abs(d.dx)).toBeLessThanOrEqual(groundSlipBound(d.t, d.x, pv) * 1.05 + 1e-6);
        expect(Math.abs(d.dy)).toBeLessThan(0.1);
      }
    });
  }
  it('値が違えば表の鍵が変わる(作り直しの条件)', () => {
    expect(buildProjTable({ ...P, curve: 3 }, STRIP_H, 180).key).not.toBe(TABLE.key);
    expect(buildProjTable({ ...P }, STRIP_H, 180).key).toBe(TABLE.key);
  });
});

describe('見える範囲の切り方(監査 A1)', () => {
  it('帯は北ほど左右に広く、画面に掛かる物は必ずどこかの帯に入る', () => {
    const f = frameAt(1, 0, 0);
    const bands: { left: number; top: number; right: number; bottom: number }[] = [];
    const rows = projScreenRowsL(f);
    const n = visibleWorldBands(f, Math.max(0, rows.top), rows.bottom, 8, 0, bands);
    expect(n).toBe(8);
    for (let i = 1; i < n; i++) expect(bands[i].right - bands[i].left).toBeLessThanOrEqual(bands[i - 1].right - bands[i - 1].left + 1e-6);
    const sp = makeProjPoint();
    const r = rng(41);
    for (let k = 0; k < 500; k++) {
      const wx = (r() - 0.5) * 4000, wy = f.wRef + (r() - 0.8) * 900;
      const on = projBoxOnScreen(f, wx, wy, 0, 0, 0.5, 0, sp);
      if (!on) continue;
      expect(bands.some(b => wx >= b.left && wx <= b.right && wy >= b.top - 1e-6 && wy <= b.bottom + 1e-6)).toBe(true);
    }
  });
  it('画面の外の足元は箱が掛からない・画面外への距離は表示px', () => {
    const f = frameAt(1, 0, 0);
    const sp = makeProjPoint();
    expect(projBoxOnScreen(f, f.cxw, f.wRef, 40, 80, 0.5, 0, sp)).toBe(true);
    expect(projBoxOnScreen(f, f.cxw + 5000, f.wRef, 40, 80, 0.5, 0, sp)).toBe(false);
    expect(projScreenOutside(f, f.cxw, f.wRef, sp)).toBe(0);
    expect(projScreenOutside(f, f.cxw + 1000, f.wRef, sp)).toBeCloseTo(1000 - SW / 2, 6);
  });
  it('projectInto は project と同じ値を入れ物へ書く', () => {
    const f = frameAt(0.7, 12, 34);
    const a = project(f, 100, f.wRef - 200);
    const b = projectInto(f, 100, f.wRef - 200, makeProjPoint());
    expect(b).toEqual(a);
  });
});

describe('手前の地面の伸びを抑える案(?proj=1 の既定 ON・?projnear=0 で旧い伸び方=比較用)', () => {
  // 主人公の行=基準行で抑える表
  const mk = (z: number, camX: number, camY: number) => {
    const base = frameAt(z, camX, camY);
    const near = buildProjTable(P, STRIP_H, 180, 72, 8, base.lRef);
    return { base, near: makeProjFrame({ ...base, table: near }) };
  };
  it('抑えない時(既定)の表は今と同じ(key も同じ)', () => {
    expect(TABLE.lNear).toBeNaN();
    expect(TABLE.kc).toBe(-1);
    expect(TABLE.key).toBe(projTableKey(P, STRIP_H, 180, 72, 8));
  });
  for (const z of [1, 0.7, 0.4, 1.3]) {
    it(`基準行より北は1ビットも変わらない(G・投影・倍率・地面の帯): z=${z}`, () => {
      const { base, near } = mk(z, 1234.5, -987.25);
      expect(near.gRef).toBe(base.gRef);
      expect(near.syRef).toBe(base.syRef);
      expect(near.convRef).toBe(base.convRef);
      expect(near.syStd).toBe(base.syStd);
      for (let l = -50; l <= base.lRef; l += 0.37) {
        expect(projG(near.table, l)).toBe(projG(base.table, l));
        expect(projWorldYOfLocal(near, l)).toBe(projWorldYOfLocal(base, l));
      }
      for (let wy = base.wRef - 3000; wy <= base.wRef; wy += 1.7) {
        const a = project(base, base.cxw + 150, wy), b = project(near, near.cxw + 150, wy);
        expect(b.y).toBe(a.y); expect(b.x).toBe(a.x); expect(b.s).toBe(a.s);
      }
      // 地面の帯: 下端が基準行より北の帯は同じ値
      for (let i = 0; (i + 1) * STRIP_H <= base.lRef; i++) {
        const a = groundStripTile(base, i, 256, 256, SW * 2.5), b = groundStripTile(near, i, 256, 256, SW * 2.5);
        expect(b).toEqual(a);
      }
    });
    it(`基準行より南: 縦の伸び ≤ 横の倍率(地面の円の縦/横 ≤ 1)・今は縦長: z=${z}`, () => {
      const { base, near } = mk(z, 0, 0);
      let baseMax = 0;
      for (let l = base.lRef + 1; l < base.table.lMax; l += 3) {
        const t = projTOfL(l, STRIP_H);
        const sAt = projConvAt(t, P) / base.convRef;
        const vNear = projScaleYNearAt(l, STRIP_H, 72, P, near.table.lNear) / near.syRef;
        const vBase = projScaleYAt(t, P) / base.syRef;
        expect(vNear / sAt).toBeLessThanOrEqual(1 + 1e-9);
        baseMax = Math.max(baseMax, vBase / sAt);
      }
      expect(baseMax).toBeGreaterThan(1.2);
    });
    it(`抑えた表も単調で逆が往復する・物と地面が滑らない: z=${z}`, () => {
      const { near } = mk(z, 300, 200);
      let prev = -Infinity;
      for (let l = -200; l <= near.table.lMax + 300; l += 0.91) {
        const g = projG(near.table, l);
        expect(g).toBeGreaterThan(prev);
        prev = g;
        expect(projGInv(near.table, g)).toBeCloseTo(l, 7);
      }
      for (let wy = near.wRef - 400; wy < near.wRef + 600; wy += 13) {
        const d = groundVsObjectDiff(near, near.cxw + 120, wy);
        expect(Math.abs(d.dy)).toBeLessThan(0.1);
      }
    });
  }
});

describe('手前を抑える案: 基準行の傾き syRef(監査 B-2)', () => {
  for (const z of [1, 0.7, 0.4, 1.3]) {
    it(`syRef は表の値 projTableScaleY(table, ℓ_ref) と同じ・ℓ_near===ℓ_ref なら抑えない値: z=${z}`, () => {
      const base = frameAt(z, 10, 20);
      const near = buildProjTable(P, STRIP_H, 180, 72, 8, base.lRef);
      const f = makeProjFrame({ ...base, table: near });
      expect(near.lNear).toBe(f.lRef); // ℓ_near===ℓ_ref(pixiScene が組で渡す)
      expect(f.syRef).toBe(projTableScaleY(near, f.lRef));
      expect(f.syRef).toBe(projScaleYAt(projTOfL(f.lRef, STRIP_H), P));
      expect(base.syRef).toBe(projTableScaleY(TABLE, base.lRef));
    });
  }
});

/** 表が同じ値か(g は1ビット単位)。 */
const expectSameTable = (a: ProjTable, b: ProjTable) => {
  expect(a.n).toBe(b.n);
  expect(a.step).toBe(b.step);
  expect(a.kc).toBe(b.kc);
  expect(a.gOrig).toBe(b.gOrig);
  expect(a.gNear).toBe(b.gNear);
  expect(Object.is(a.lNear, b.lNear)).toBe(true);
  expect(a.key).toBe(b.key);
  for (let k = 0; k <= a.n; k++) if (a.g[k] !== b.g[k]) expect(`g[${k}]=${a.g[k]}`).toBe(`g[${k}]=${b.g[k]}`);
};

describe('表の更新 updateProjTable(監査 B-1: 北を使い回して南だけ積み直す)', () => {
  it('同じ引数なら作り直さない(同じ物を返す)', () => {
    const t0 = buildProjTable(P, STRIP_H, 180, 72, 8, 300);
    expect(updateProjTable(t0, P, STRIP_H, 180, 72, 8, 300)).toBe(t0);
    const t1 = buildProjTable(P, STRIP_H, 180, 72, 8);
    expect(updateProjTable(t1, P, STRIP_H, 180, 72, 8, NaN)).toBe(t1);
  });
  it('ℓ_near が動く列(ボス戦の引き・アテンション・範囲の外・抑えない⇄抑える)で、毎回 buildProjTable と1ビットも違わない', () => {
    const seq = [NaN, 420, 421.3, 500, 380.25, 120, 0, -40, 9e3, TABLE.lMax, TABLE.lMax + 5, 0.5 * STRIP_H / 8, NaN, 333, 333, 610.7];
    // ボス戦の引き: ズーム 1→0.4 で ℓ_ref が毎フレーム動く
    for (let i = 0; i <= 30; i++) seq.push(projRefLocalY(SH, zoomCameraDownFrac(CAMDOWN, 1 - 0.6 * i / 30), PH, FAR_H));
    // アテンション: ℓ_refAtt が北へ運ばれて戻る
    for (let i = 0; i <= 20; i++) {
      const env = i <= 10 ? i / 10 : (20 - i) / 10;
      seq.push(projAttentionRef(FAR_H + L_REF_1, FAR_H + 80, env, 0, FAR_H).lRef);
    }
    let cur: ProjTable | null = null;
    let partial = 0;
    for (const ln of seq) {
      const fresh = buildProjTable(P, STRIP_H, 180, 72, 8, ln);
      const prevRef: ProjTable | null = cur;
      cur = updateProjTable(cur, P, STRIP_H, 180, 72, 8, ln);
      expectSameTable(cur, fresh);
      if (prevRef && cur !== prevRef && cur.builtPts < cur.n) partial++;
    }
    expect(partial).toBeGreaterThan(30); // 北を使い回した回が大半
  });
  it('南だけ積み直す: 積み直した点の数は ℓ_near の南の分だけ・配列は使い回す', () => {
    const t0 = buildProjTable(P, STRIP_H, 180, 72, 8, 500);
    const g0 = t0.g;
    const t1 = updateProjTable(t0, P, STRIP_H, 180, 72, 8, 520);
    expect(t1.g).toBe(g0);
    expect(t1.builtPts).toBe(t1.n - Math.floor(500 / t1.step));
  });
  it('帯の引数が変わったら全部作り直す(key も変わる)', () => {
    const t0 = buildProjTable(P, STRIP_H, 180, 72, 8, 400);
    const P2 = { ...P, curve: 2.2 };
    const t1 = updateProjTable(t0, P2, STRIP_H, 180, 72, 8, 400);
    expect(t1.key).not.toBe(t0.key);
    expect(t1.builtPts).toBe(t1.n);
    expectSameTable(t1, buildProjTable(P2, STRIP_H, 180, 72, 8, 400));
    const t2 = updateProjTable(t1, P2, STRIP_H * 1.1, 180, 72, 8, 400);
    expectSameTable(t2, buildProjTable(P2, STRIP_H * 1.1, 180, 72, 8, 400));
    const t3 = updateProjTable(t2, P2, STRIP_H * 1.1, 200, 72, 8, 400);
    expect(t3.n).toBe(1600);
    expectSameTable(t3, buildProjTable(P2, STRIP_H * 1.1, 200, 72, 8, 400));
  });
  it('表の key は ℓ_near が変わると変わる(抑えない表とも違う)', () => {
    const a = buildProjTable(P, STRIP_H, 180, 72, 8, 400), b = buildProjTable(P, STRIP_H, 180, 72, 8, 401);
    expect(a.key).not.toBe(b.key);
    expect(a.key).not.toBe(TABLE.key);
    expect(updateProjTable(a, P, STRIP_H, 180, 72, 8, 401).key).toBe(b.key);
  });
});

describe('手前を抑える案の場面(監査 B-3)', () => {
  interface Scene { name: string; sw: number; sh: number; farH: number; z: number; att?: { attDy: number; env: number }; lNear?: (lRef: number, lMax: number) => number }
  const scenes: Scene[] = [
    { name: 'スマホ z=1', sw: SW, sh: SH, farH: FAR_H, z: 1 },
    { name: 'スマホ ズーム 0.4 の ℓ_ref', sw: SW, sh: SH, farH: FAR_H, z: 0.4 },
    { name: 'アテンション中(ℓ_refAtt が北へ)', sw: SW, sh: SH, farH: FAR_H, z: 1, att: { attDy: -260, env: 0.7 } },
    { name: 'アテンション中・ズーム 0.4', sw: SW, sh: SH, farH: FAR_H, z: 0.4, att: { attDy: -400, env: 1 } },
    { name: 'PC 1280×720 z=1', sw: 1280, sh: 720, farH: 180, z: 1 },
    { name: 'PC 1280×720 ズーム 0.4', sw: 1280, sh: 720, farH: 180, z: 0.4 },
    { name: 'PC 1280×720 アテンション中', sw: 1280, sh: 720, farH: 180, z: 1, att: { attDy: -200, env: 0.5 } },
  ];
  const build = (sc: Scene, camX: number, camY: number) => {
    const stripH = (sc.sh - sc.farH) / 72;
    const plain = buildProjTable(P, stripH, 180);
    let lRef = projRefLocalY(sc.sh, zoomCameraDownFrac(CAMDOWN, sc.z), PH, sc.farH);
    let wRef = camY + sc.farH + lRef;
    if (sc.att) { const r = projAttentionRef(wRef, wRef + sc.att.attDy, sc.att.env, camY, sc.farH); wRef = r.wRef; lRef = r.lRef; }
    const lRef1 = projRefLocalY(sc.sh, zoomCameraDownFrac(CAMDOWN, 1), PH, sc.farH);
    const pivotY = sc.z < 1 ? sc.farH : sc.sh / 2;
    const inp: ProjFrameInput = {
      table: plain, camX, camY, farH: sc.farH, screenW: sc.sw, screenH: sc.sh, wRef, lRef, tStd: projTOfL(lRef1, stripH),
      wgScale: sc.z, wgX: (sc.sw / 2) * (1 - sc.z), wgY: pivotY * (1 - sc.z),
    };
    const near = buildProjTable(P, stripH, 180, 72, 8, lRef);
    return { stripH, base: makeProjFrame(inp), near: makeProjFrame({ ...inp, table: near }) };
  };
  for (const sc of scenes) {
    it(`${sc.name}: 北は1ビットも変わらない・南は縦/横 ≤ 1・単調で逆が往復する`, () => {
      const { stripH, base, near } = build(sc, 77, -310);
      expect(near.table.lNear).toBe(near.lRef);
      expect(near.syRef).toBe(base.syRef);
      expect(near.gRef).toBe(base.gRef);
      for (let wy = base.wRef - 2500; wy <= base.wRef; wy += 3.1) {
        const a = project(base, base.cxw - 220, wy), b = project(near, near.cxw - 220, wy);
        expect(b.y).toBe(a.y); expect(b.x).toBe(a.x); expect(b.s).toBe(a.s);
      }
      for (let l = Math.max(0, near.lRef) + 1; l < near.table.lMax; l += 5) {
        const sAt = projConvAt(projTOfL(l, stripH), P) / near.convRef;
        expect(projTableScaleY(near.table, l) / near.syRef / sAt).toBeLessThanOrEqual(1 + 1e-9);
      }
      let prev = -Infinity;
      for (let l = -150; l <= near.table.lMax + 200; l += 1.3) {
        const g = projG(near.table, l);
        expect(g).toBeGreaterThan(prev);
        prev = g;
        expect(projGInv(near.table, g)).toBeCloseTo(l, 7);
      }
    });
  }
  it('lNear<0(基準行が地平線より北): 定義域(ℓ≥0)は全部抑えた側・有限で単調・逆が往復する', () => {
    const t = buildProjTable(P, STRIP_H, 180, 72, 8, -60);
    expect(t.kc).toBe(-1);
    for (let l = 0; l < t.lMax; l += 7) {
      expect(projTableScaleY(t, l)).toBeLessThanOrEqual(projScaleYAt(projTOfL(l, STRIP_H), P));
    }
    let prev = -Infinity;
    for (let l = -300; l <= t.lMax + 300; l += 2.3) {
      const g = projG(t, l);
      expect(Number.isFinite(g)).toBe(true);
      expect(g).toBeGreaterThan(prev);
      prev = g;
      expect(projGInv(t, g)).toBeCloseTo(l, 7);
    }
    const f = makeProjFrame({ ...frameAt(1, 0, 0), table: t, lRef: -60, wRef: FAR_H - 60 });
    expect(f.syRef).toBe(projTableScaleY(t, -60));
    expect(Number.isFinite(f.syRef) && f.syRef > 0).toBe(true);
  });
  it('lNear>lMax(基準行が表の南の外): 表の中は抑えない表と同じ', () => {
    const t = buildProjTable(P, STRIP_H, 180, 72, 8, TABLE.lMax + 120);
    expect(t.kc).toBe(-1);
    for (let k = 0; k <= t.n; k++) expect(t.g[k]).toBe(TABLE.g[k]);
    for (let l = -100; l <= TABLE.lMax + 100; l += 3.3) expect(projG(t, l)).toBe(projG(TABLE, l));
  });
});

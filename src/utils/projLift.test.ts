import { describe, it, expect } from 'vitest';
import {
  buildProjTable, makeProjFrame, projRefLocalY, projTOfL, projectInto, makeProjPoint, projScaleAtLocal, projScreenRowsL,
  type GroundPerspectiveParams, type ProjFrame,
} from './perspectiveProjection';
import { zoomCameraDownFrac } from './cameraZoom';
import { projLiftInto } from './projShape';
import {
  PROJ_LIFT_MODE, PROJ_LIFT_ROWS, projLiftScale, projLiftFixDy, projLiftTermsFixDy, projLiftPartMul, projGroundOffsetFix,
  projSkyStartH, projSkyTopY, projLiftOutside, projHelperSimilar, projLiftPointInto, makeProjLiftPoint, projLiftRowNeedsFix,
  projLiftRowCountsUnfixed, type ProjLiftRow,
} from './projLift';

// research/PERSPECTIVE_PROJECTION.md §3-8i 作る物11(段階5「高さ」の純関数)。手前を抑える案 ON の表(lNear=ℓ_ref)で回す(3-8j の13)。

const P: GroundPerspectiveParams = {
  tileScaleX: 0.82, trapFar: 0.10, trapCurve: 1, trapezoid: 1,
  farScale: 0.055, nearScale: 0.82, curve: 2.6,
};
const CAMDOWN = 0.08, PH = 28;
interface Scr { w: number; h: number; farH: number }
const SCREENS: Scr[] = [{ w: 430, h: 932, farH: 234 }, { w: 1280, h: 720, farH: 180 }];

const frameAt = (sc: Scr, z: number, camX: number, camY: number, att = 0): ProjFrame => {
  const stripH = (sc.h - sc.farH) / 72;
  const lRef0 = projRefLocalY(sc.h, zoomCameraDownFrac(CAMDOWN, z), PH, sc.farH);
  const lRef1 = projRefLocalY(sc.h, zoomCameraDownFrac(CAMDOWN, 1), PH, sc.farH);
  const lRef = lRef0 + att;
  const table = buildProjTable(P, stripH, 180, undefined, undefined, lRef); // 手前を抑える案 ON
  const pivotY = z < 1 ? sc.farH : sc.h / 2;
  return makeProjFrame({
    table, camX, camY, farH: sc.farH, screenW: sc.w, screenH: sc.h,
    wRef: camY + sc.farH + lRef, lRef, tStd: projTOfL(lRef1, table.stripH),
    wgScale: z, wgX: (sc.w / 2) * (1 - z), wgY: pivotY * (1 - z),
  });
};
const rng = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

const FRAMES: ProjFrame[] = [];
/** ズーム1・アテンション無しの基準行(§3-8b の試算の条件)。引き・アテンションの枠では北の B と A の大小が帯の端で入れ替わる(控えの案の性質)。 */
const NORMAL_LREF = new Map<number, number>(SCREENS.map((sc) => [sc.h, projRefLocalY(sc.h, zoomCameraDownFrac(CAMDOWN, 1), PH, sc.farH)]));
for (const sc of SCREENS) for (const z of [1, 0.7, 0.4]) for (const att of [0, -60, 40]) FRAMES.push(frameAt(sc, z, 120, 800, att));

describe('段階5「高さ」: projLiftScale(★#6)', () => {
  it('★#6 は A(裁定)', () => { expect(PROJ_LIFT_MODE).toBe('A'); });
  it('基準行で 1(A・B とも・誤差 1e-6)', () => {
    for (const f of FRAMES) {
      expect(projLiftScale(f, f.lRef, 'A')).toBeCloseTo(1, 6);
      expect(projLiftScale(f, f.lRef, 'B')).toBeCloseTo(1, 6);
    }
  });
  // 北で A 以下は、§3-8b の試算の条件(ズーム1・アテンション無し・体の倍率 s ≥ 0.4=北 400px まで)で確かめる(地平線の際は B の方が大きい=控えの案の性質)。
  it('A は s と一致・B は南で A と一致・北(s≥0.4)で A 以下・どちらも単調', () => {
    for (const f of FRAMES) {
      let prevA = -Infinity, prevB = -Infinity;
      for (let l = 0; l <= f.lRef + 400; l += 3) {
        const a = projLiftScale(f, l, 'A'), b = projLiftScale(f, l, 'B');
        expect(a).toBeCloseTo(projScaleAtLocal(f, l), 9);
        if (l > f.lRef + 1e-6) expect(Math.abs(b - a)).toBeLessThan(2e-3 * Math.max(1, a));
        else if (a >= 0.4 && f.wgScale === 1 && Math.abs(f.lRef - NORMAL_LREF.get(f.screenH)!) < 1e-9) expect(b).toBeLessThanOrEqual(a + 1e-9);
        expect(a).toBeGreaterThanOrEqual(prevA - 1e-12);
        expect(b).toBeGreaterThanOrEqual(prevB - 1e-12);
        prevA = a; prevB = b;
      }
    }
  });
});

describe('段階5: projLiftInto と持ち上げた点', () => {
  it('h=0 で projectInto と一致・往復(持ち上げた点から h·σ を戻すと P)', () => {
    const r = rng(7);
    const o = { x: 0, y: 0, s: 1 }, q = makeProjPoint(), lp = makeProjLiftPoint();
    for (const f of FRAMES) {
      for (let i = 0; i < 40; i++) {
        const wx = f.camX + r() * f.screenW, wy = f.camY + f.farH + 20 + r() * 600, h = r() * 200;
        projLiftInto(f, wx, wy, 0, o); projectInto(f, wx, wy, q);
        expect(o.x).toBeCloseTo(q.x, 9); expect(o.y).toBeCloseTo(q.y, 9);
        projLiftInto(f, wx, wy, h, o);
        const sig = projLiftScale(f, Math.max(0, q.l));
        expect(o.y + h * sig).toBeCloseTo(q.y, 9);
        projLiftPointInto(f, wx, wy, h, lp);
        expect(lp.y).toBeCloseTo(o.y, 9); expect(lp.sigma).toBeCloseTo(sig, 12);
      }
    }
  });
});

describe('段階5: 高さの割り戻し(3-8e)', () => {
  it('m·h + 割り戻し = σ·h(m=k・k·d・1・s の全部)', () => {
    const r = rng(11);
    for (let i = 0; i < 200; i++) {
      const s = 0.3 + r() * 1.5, d = 0.55 + r() * 1.3, k = s / d, sig = s, h = r() * 150;
      for (const m of [k, k * d, 1, s]) expect(m * h - projLiftFixDy(h, m, sig) - sig * h).toBeCloseTo(-0, 9); // 画面の持ち上がり(上=正)
      // 項ごと: drawn=δ·h。body(m=k·δ)・hudNoH(m=δ)・hudWithH(m=s·δ) で σ·h に揃う。
      for (const delta of [1, d]) {
        const drawn = [delta * h], dl = [delta];
        expect(k * drawn[0] - projLiftTermsFixDy('body', k, s, sig, drawn, dl, 1)).toBeCloseTo(sig * h, 9);
        expect(drawn[0] - projLiftTermsFixDy('hudNoH', k, s, sig, drawn, dl, 1)).toBeCloseTo(sig * h, 9);
        expect(s * drawn[0] - projLiftTermsFixDy('hudWithH', k, s, sig, drawn, dl, 1)).toBeCloseTo(sig * h, 9);
        expect(projLiftTermsFixDy('ground', k, s, sig, drawn, dl, 1)).toBe(0);
      }
    }
  });
  it('A では δ=d の後掛けの項と前掛けの頭上の物(m=s)は割り戻しが0', () => {
    const s = 0.7, d = 0.8, k = s / d;
    expect(projLiftTermsFixDy('body', k, s, s, [d * 40], [d], 1)).toBeCloseTo(0, 12);
    expect(projLiftTermsFixDy('hudWithH', k, s, s, [40], [1], 1)).toBeCloseTo(0, 12);
    expect(projLiftPartMul('streak', k, s, s, 1)).toBe(k);
  });
  it('地面の成分の直し: 後掛けの後の点が 投影(F + g) と一致', () => {
    const r = rng(13);
    const p = makeProjPoint(), q = makeProjPoint(), o = { x: 0, y: 0 };
    for (const f of FRAMES) {
      for (let i = 0; i < 20; i++) {
        const fx = f.camX + r() * f.screenW, fy = f.camY + f.farH + 40 + r() * 500, gx = (r() - 0.5) * 30, gy = (r() - 0.5) * 30, d = 0.6 + r();
        projectInto(f, fx, fy, p);
        const k = p.s / d;
        projGroundOffsetFix(f, fx, fy, gx, gy, k, o);
        projectInto(f, fx + gx, fy + gy, q);
        expect(p.x + k * gx + o.x).toBeCloseTo(q.x, 9);
        expect(p.y + k * gy + o.y).toBeCloseTo(q.y, 9);
      }
    }
  });
});

describe('段階5: 空とつながる物(★#33=A)', () => {
  it('projSkyStartH の起点は、乱数の枠(基準行・ズーム 1.0/0.7/0.4・アテンション・縦持ちと PC)で画面の上端より上', () => {
    const r = rng(17);
    const lp = makeProjLiftPoint();
    for (const f of FRAMES) {
      const top = f.camY + f.farH + projScreenRowsL(f).top;
      for (let i = 0; i < 30; i++) {
        const gx = f.camX + r() * f.screenW, gy = f.camY + f.farH + 10 + r() * 700, m = 80 + r() * 140;
        const h0 = projSkyStartH(f, gx, gy, m);
        projLiftPointInto(f, gx, gy, h0, lp);
        if (h0 > 0) { expect(lp.y).toBeLessThan(top + 1e-6); expect(lp.y).toBeCloseTo(projSkyTopY(f, m), 6); }
      }
    }
  });
});

describe('段階5: 間引き(3-8h の4)', () => {
  it('G が画面の下の外でも、持ち上げた点が画面の中なら外さない', () => {
    for (const f of FRAMES) {
      const rows = projScreenRowsL(f);
      // 画面の下端より少し下の行の地面の点(world)を探す
      let gy = f.camY + f.farH + rows.bottom;
      for (let it = 0; it < 60; it++) {
        const q = projectInto(f, f.cxw, gy, makeProjPoint());
        if (q.l > rows.bottom + 30) break;
        gy += 10;
      }
      expect(projLiftOutside(f, f.cxw, gy, 0, 4, 0)).toBe(true);
      expect(projLiftOutside(f, f.cxw, gy, 400, 4, 0)).toBe(false);
    }
  });
});

describe('段階5: ヘリの相似(★#35 の推薦 A)', () => {
  it('G で恒等(P_G)・s_G=1 かつ P_G=G の点では今の点と一致', () => {
    const o = { x: 0, y: 0, s: 1 }, q = makeProjPoint();
    for (const f of FRAMES) {
      const gx = f.camX + 100, gy = f.wRef;
      projHelperSimilar(f, gx, gy, gx, gy, o); projectInto(f, gx, gy, q);
      expect(o.x).toBeCloseTo(q.x, 9); expect(o.y).toBeCloseTo(q.y, 9);
      // 基準行・画面中央の列: s_G=1・P_G=G → 今の点そのもの
      projHelperSimilar(f, f.cxw, f.wRef, f.cxw + 37, f.wRef - 220, o);
      expect(o.s).toBeCloseTo(1, 6);
      expect(o.x).toBeCloseTo(f.cxw + 37, 4); expect(o.y).toBeCloseTo(f.wRef - 220, 4);
    }
  });
});

describe('段階5: 台帳 PROJ_LIFT_ROWS(3-8d)', () => {
  const rows = PROJ_LIFT_ROWS as Record<string, ProjLiftRow>;
  it('Z1〜Z58 の57行(Z37=再掲は入れない)', () => {
    const keys = Object.keys(rows);
    expect(keys.length).toBe(57);
    expect(keys).not.toContain('Z37');
    for (let i = 1; i <= 58; i++) if (i !== 37) expect(keys).toContain(`Z${i}`);
  });
  it('直す行は41・型ごとの数が台帳と同じ', () => {
    const count = (t: string) => Object.values(rows).filter((r) => r.types.includes(t as never)).length;
    expect(Object.values(rows).filter(projLiftRowNeedsFix).length).toBe(41);
    expect(count('split')).toBe(29); expect(count('fused')).toBe(5); expect(count('sky')).toBe(7); expect(count('scale')).toBe(2);
    expect(count('done')).toBe(13); expect(count('ground')).toBe(5); expect(count('dead')).toBe(1); expect(count('material')).toBe(1);
  });
  it('s5 unfixed が数える行は空と拡を含まない', () => {
    for (const [k, r] of Object.entries(rows)) {
      if (projLiftRowCountsUnfixed(r)) expect(r.types.some((t) => t === 'sky' || t === 'scale'), k).toBe(false);
    }
    expect(projLiftRowCountsUnfixed(rows.Z19)).toBe(false);
    expect(projLiftRowCountsUnfixed(rows.Z10)).toBe(true);
  });
});

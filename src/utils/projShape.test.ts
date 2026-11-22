import { describe, it, expect } from 'vitest';
import {
  buildProjTable, makeProjFrame, projRefLocalY, projTOfL, projectInto, makeProjPoint, projLocalYOfWorld,
  type GroundPerspectiveParams, type ProjFrame,
} from './perspectiveProjection';
import { zoomCameraDownFrac } from './cameraZoom';
import {
  ProjPathOut, projPathInto, projCircleInto, projEllipseInto, projArcInto, projSectorInto, projAnnulusInto,
  projAnnulusAnglesFor, projAnnulusRingInto, projQuadStripInto, projRectFrameInto, projGridInto, projGridSample,
  projGridIndices, projLiftInto, projTeleFadeY, projShapeOutside, projTeleLineScale, projVertexInto, projPointInPath,
  projDistToSeg, projCircleBaseEdges, PROJ_GRID_VERTS, PROJ_TELE_LINE_MODE,
} from './projShape';

// research/PERSPECTIVE_PROJECTION.md §3-6k 受け入れ条件2・3(純関数の分): 投影後の予告の形と、投影した判定の形が一致する。

const P: GroundPerspectiveParams = {
  tileScaleX: 0.82, trapFar: 0.10, trapCurve: 1, trapezoid: 1,
  farScale: 0.055, nearScale: 0.82, curve: 2.6,
};
const CAMDOWN = 0.08, PH = 28;

interface Scr { w: number; h: number; farH: number }
const SCREENS: Scr[] = [{ w: 430, h: 932, farH: 234 }, { w: 1280, h: 720, farH: 180 }];
const tables = new Map<Scr, ReturnType<typeof buildProjTable>>();
const tableFor = (s: Scr) => {
  let t = tables.get(s);
  if (!t) { t = buildProjTable(P, (s.h - s.farH) / 72, 180); tables.set(s, t); }
  return t;
};

const rng = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};

/** ズーム z・カメラ・アテンションの組(env 0..1 で基準点を attDy だけ運ぶ)。 */
const frameAt = (sc: Scr, z: number, camX: number, camY: number, att = 0): ProjFrame => {
  const TABLE = tableFor(sc);
  const lRef0 = projRefLocalY(sc.h, zoomCameraDownFrac(CAMDOWN, z), PH, sc.farH);
  const lRef1 = projRefLocalY(sc.h, zoomCameraDownFrac(CAMDOWN, 1), PH, sc.farH);
  const lRef = lRef0 + att; // アテンションの組(W_refAtt, ℓ_refAtt): 基準点と基準行を一緒に動かす
  const pivotY = z < 1 ? sc.farH : sc.h / 2;
  return makeProjFrame({
    table: TABLE, camX, camY, farH: sc.farH, screenW: sc.w, screenH: sc.h,
    wRef: camY + sc.farH + lRef, lRef, tStd: projTOfL(lRef1, TABLE.stripH),
    wgScale: z, wgX: (sc.w / 2) * (1 - z), wgY: pivotY * (1 - z),
  });
};

const sp = makeProjPoint();
const V = { x: 0, y: 0, s: 1, a: 1, sx: 0, sy: 0 };
/** world 点 → 画面px(地平線より北は ℓ=0 へ寄せる=部品と同じ)。 */
const scr = (f: ProjFrame, wx: number, wy: number) => {
  projVertexInto(f, wx, wy, V);
  return { x: V.sx, y: V.sy, inDomain: V.a > 0 || projLocalYOfWorld(f, wy) >= 0 };
};
const onScreen = (f: ProjFrame, x: number, y: number) => x >= 0 && x <= f.screenW && y >= 0 && y <= f.screenH;

/** out の輪郭(全部)の辺と、画面px の点の最短距離。 */
const distToPath = (f: ProjFrame, out: ProjPathOut, x: number, y: number, closed = true): number => {
  const z = f.wgScale;
  let best = Infinity;
  for (let c = 0; c < out.cn; c++) {
    const s = out.contourStart(c), e = out.contourEnd(c);
    const last = closed ? e : e - 1;
    for (let i = s; i < last; i++) {
      const j = i + 1 < e ? i + 1 : s;
      const ax = f.wgX + z * (out.xy[i * 2] - f.camX + f.shakeX), ay = f.wgY + z * (out.xy[i * 2 + 1] - f.camY + f.shakeY);
      const bx = f.wgX + z * (out.xy[j * 2] - f.camX + f.shakeX), by = f.wgY + z * (out.xy[j * 2 + 1] - f.camY + f.shakeY);
      best = Math.min(best, projDistToSeg(x, y, ax, ay, bx, by));
    }
  }
  return best;
};

/** 点が out の内か(画面px で受け、表示座標へ戻して数える)。 */
const insideScr = (f: ProjFrame, out: ProjPathOut, x: number, y: number) => {
  const z = f.wgScale;
  return projPointInPath(out, (x - f.wgX) / z + f.camX - f.shakeX, (y - f.wgY) / z + f.camY - f.shakeY);
};

/** 乱数の場面(画面・ズーム・アテンション・カメラ)と、形の中心(北の地平線際〜南の画面下端の外)。 */
const scene = (r: () => number, k: number) => {
  const sc = SCREENS[k % 2];
  const z = [1, 0.7, 0.4][k % 3];
  const att = k % 4 === 3 ? (r() - 0.5) * 200 : 0;
  const camX = (r() - 0.5) * 8000, camY = (r() - 0.5) * 8000;
  const f = frameAt(sc, z, camX, camY, att);
  // 中心の行: 画面の上端の少し北〜下端の少し南(ℓ で選んで world へ戻す)
  const lTop = (0 - f.wgY) / z - f.farH, lBot = (sc.h - f.wgY) / z - f.farH;
  const l = Math.max(2, lTop) + r() * (lBot + 80 - Math.max(2, lTop));
  const sx = r() * sc.w;
  const dx = (sx - f.wgX) / z + f.camX;
  // ℓ → world Y / 表示x → world X
  let wy = f.wRef;
  for (let it = 0; it < 60; it++) { const ll = projLocalYOfWorld(f, wy); wy += (l - ll) * 0.9; }
  projectInto(f, f.cxw, wy, sp);
  const wx = f.cxw + (dx - f.cxw) / sp.s;
  return { f, wx, wy };
};

const DENSE = 64;

describe('projShape: 形の縁の頂点列と判定の境界(受け入れ条件2・1.0 画面px 以下)', () => {
  it('円(半径 10〜4,500)', () => {
    const r = rng(11);
    const out = new ProjPathOut();
    let worst = 0;
    for (let k = 0; k < 90; k++) {
      const { f, wx, wy } = scene(r, k);
      const rad = k % 9 === 0 ? 1500 + r() * 3000 : 10 + r() * 600;
      out.reset();
      projCircleInto(f, wx, wy, rad, 0.5, out);
      const n = projCircleBaseEdges(rad) * DENSE;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const px = wx + Math.cos(a) * rad, py = wy + Math.sin(a) * rad;
        if (projLocalYOfWorld(f, py) < 0) continue; // 地平線より北は寄せる(別のテスト)
        const p = scr(f, px, py);
        if (!onScreen(f, p.x, p.y)) continue;
        worst = Math.max(worst, distToPath(f, out, p.x, p.y));
      }
    }
    expect(worst).toBeLessThanOrEqual(1.0);
  });

  it('楕円(回転つき)・弧・扇', () => {
    const r = rng(23);
    const out = new ProjPathOut();
    let worst = 0;
    for (let k = 0; k < 60; k++) {
      const { f, wx, wy } = scene(r, k);
      const rx = 20 + r() * 300, ry = 10 + r() * 200, rot = r() * Math.PI;
      out.reset();
      projEllipseInto(f, wx, wy, rx, ry, rot, 0.5, out);
      for (let i = 0; i < 2000; i++) {
        const t = (i / 2000) * Math.PI * 2;
        const ex = rx * Math.cos(t), ey = ry * Math.sin(t);
        const px = wx + ex * Math.cos(rot) - ey * Math.sin(rot), py = wy + ex * Math.sin(rot) + ey * Math.cos(rot);
        if (projLocalYOfWorld(f, py) < 0) continue;
        const p = scr(f, px, py);
        if (!onScreen(f, p.x, p.y)) continue;
        worst = Math.max(worst, distToPath(f, out, p.x, p.y));
      }
      // 弧
      const a0 = r() * Math.PI * 2, a1 = a0 + 0.3 + r() * 4;
      const rad = 30 + r() * 500;
      out.reset();
      projArcInto(f, wx, wy, rad, a0, a1, 0.5, out);
      for (let i = 0; i <= 1000; i++) {
        const a = a0 + ((a1 - a0) * i) / 1000;
        const px = wx + Math.cos(a) * rad, py = wy + Math.sin(a) * rad;
        if (projLocalYOfWorld(f, py) < 0) continue;
        const p = scr(f, px, py);
        if (!onScreen(f, p.x, p.y)) continue;
        worst = Math.max(worst, distToPath(f, out, p.x, p.y, false));
      }
      // 扇の縁(弧と2本の半径)
      out.reset();
      projSectorInto(f, wx, wy, rad, a0, Math.min(a1, a0 + Math.PI * 1.5), 0.5, out);
      const a1s = Math.min(a1, a0 + Math.PI * 1.5);
      for (let i = 0; i <= 600; i++) {
        const u = i / 600;
        const pts: [number, number][] = [
          [wx + Math.cos(a0) * rad * u, wy + Math.sin(a0) * rad * u],
          [wx + Math.cos(a1s) * rad * u, wy + Math.sin(a1s) * rad * u],
          [wx + Math.cos(a0 + (a1s - a0) * u) * rad, wy + Math.sin(a0 + (a1s - a0) * u) * rad],
        ];
        for (const [px, py] of pts) {
          if (projLocalYOfWorld(f, py) < 0) continue;
          const p = scr(f, px, py);
          if (!onScreen(f, p.x, p.y)) continue;
          worst = Math.max(worst, distToPath(f, out, p.x, p.y));
        }
      }
    }
    expect(worst).toBeLessThanOrEqual(1.0);
  });

  it('帯(四角の帯・1スライス・長さ 20〜1,500・向き)と線と矩形の枠', () => {
    const r = rng(37);
    const out = new ProjPathOut();
    let worst = 0;
    for (let k = 0; k < 80; k++) {
      const { f, wx, wy } = scene(r, k);
      const len = 20 + r() * 1480, ang = r() * Math.PI * 2, hw = 6 + r() * 80;
      const tx = wx + Math.cos(ang) * len, ty = wy + Math.sin(ang) * len;
      const s0 = k % 2 ? 0 : r() * 0.5, s1 = k % 2 ? 1 : s0 + 0.03 + r() * 0.4;
      out.reset();
      projQuadStripInto(f, wx, wy, tx, ty, hw, s0, s1, s0 === 0, s1 >= 1, 0.5, out);
      // 4隅(projQuadStripInto と同じ式)の各辺を密に
      const ux = Math.cos(ang), uy = Math.sin(ang), nx = -uy, ny = ux;
      const bc = s0 === 0 ? hw : 0, fc = s1 >= 1 ? hw : 0;
      const ax = wx + (tx - wx) * s0, ay = wy + (ty - wy) * s0, bx = wx + (tx - wx) * s1, by = wy + (ty - wy) * s1;
      const q = [
        [ax - ux * bc + nx * hw, ay - uy * bc + ny * hw], [bx + ux * fc + nx * hw, by + uy * fc + ny * hw],
        [bx + ux * fc - nx * hw, by + uy * fc - ny * hw], [ax - ux * bc - nx * hw, ay - uy * bc - ny * hw],
      ];
      for (let e = 0; e < 4; e++) {
        const [x0, y0] = q[e], [x1, y1] = q[(e + 1) % 4];
        for (let i = 0; i <= 400; i++) {
          const px = x0 + (x1 - x0) * (i / 400), py = y0 + (y1 - y0) * (i / 400);
          if (projLocalYOfWorld(f, py) < 0) continue;
          const p = scr(f, px, py);
          if (!onScreen(f, p.x, p.y)) continue;
          worst = Math.max(worst, distToPath(f, out, p.x, p.y));
        }
      }
      // 線(折れ線)
      out.reset();
      const line = [wx, wy, tx, ty, tx + 80, ty - 120];
      projPathInto(f, line, false, 0.5, out);
      for (let e = 0; e < 2; e++) {
        const x0 = line[e * 2], y0 = line[e * 2 + 1], x1 = line[e * 2 + 2], y1 = line[e * 2 + 3];
        for (let i = 0; i <= 400; i++) {
          const px = x0 + (x1 - x0) * (i / 400), py = y0 + (y1 - y0) * (i / 400);
          if (projLocalYOfWorld(f, py) < 0) continue;
          const p = scr(f, px, py);
          if (!onScreen(f, p.x, p.y)) continue;
          worst = Math.max(worst, distToPath(f, out, p.x, p.y, false));
        }
      }
      // 矩形の枠(外の矩形の縁)
      out.reset();
      const rect = { x: wx - 60, y: wy - 40, w: 120 + r() * 200, h: 80 + r() * 100 };
      const ro = 20 + r() * 60;
      projRectFrameInto(f, rect, ro * 0.5, ro, 0.5, out);
      const ox0 = rect.x - ro, oy0 = rect.y - ro, ox1 = rect.x + rect.w + ro, oy1 = rect.y + rect.h + ro;
      for (const [x0, y0, x1, y1] of [[ox0, oy0, ox1, oy0], [ox1, oy0, ox1, oy1], [ox1, oy1, ox0, oy1], [ox0, oy1, ox0, oy0]]) {
        for (let i = 0; i <= 300; i++) {
          const px = x0 + (x1 - x0) * (i / 300), py = y0 + (y1 - y0) * (i / 300);
          if (projLocalYOfWorld(f, py) < 0) continue;
          const p = scr(f, px, py);
          if (!onScreen(f, p.x, p.y)) continue;
          worst = Math.max(worst, distToPath(f, out, p.x, p.y));
        }
      }
    }
    expect(worst).toBeLessThanOrEqual(1.0);
  });

  it('環・環状の扇(外周と内周)', () => {
    const r = rng(53);
    const out = new ProjPathOut();
    let worst = 0;
    for (let k = 0; k < 60; k++) {
      const { f, wx, wy } = scene(r, k);
      const r1 = 40 + r() * 500, r0 = r1 * (0.3 + r() * 0.6);
      const full = k % 2 === 0;
      const a0 = full ? 0 : r() * Math.PI * 2, a1 = full ? Math.PI * 2 : a0 + 0.5 + r() * 3;
      out.reset();
      projAnnulusInto(f, wx, wy, r0, r1, full ? undefined : a0, full ? undefined : a1, 0.5, out);
      for (const rad of [r0, r1]) {
        for (let i = 0; i <= 2000; i++) {
          const a = a0 + ((a1 - a0) * i) / 2000;
          const px = wx + Math.cos(a) * rad, py = wy + Math.sin(a) * rad;
          if (projLocalYOfWorld(f, py) < 0) continue;
          const p = scr(f, px, py);
          if (!onScreen(f, p.x, p.y)) continue;
          worst = Math.max(worst, distToPath(f, out, p.x, p.y));
        }
      }
    }
    // 内周は外周の角の並びを共有する=内周の弦の誤差は外周より小さい
    expect(worst).toBeLessThanOrEqual(1.0);
  });
});

describe('projShape: 内外が入れ替わらない(受け入れ条件2)', () => {
  it('円・環・扇・帯(カプセル)・矩形', () => {
    const r = rng(71);
    const out = new ProjPathOut();
    let checked = 0, wrong = 0;
    for (let k = 0; k < 60; k++) {
      const { f, wx, wy } = scene(r, k);
      const rad = 30 + r() * 400;
      const kind = k % 5;
      out.reset();
      const len = 60 + r() * 600, ang = r() * Math.PI * 2, hw = 10 + r() * 60;
      const tx = wx + Math.cos(ang) * len, ty = wy + Math.sin(ang) * len;
      const a0 = r() * Math.PI * 2, a1 = a0 + 0.6 + r() * 2.5;
      const rect = { x: wx - 50, y: wy - 30, w: 100 + r() * 100, h: 60 + r() * 80 };
      if (kind === 0) projCircleInto(f, wx, wy, rad, 0.5, out);
      else if (kind === 1) projAnnulusInto(f, wx, wy, rad * 0.5, rad, undefined, undefined, 0.5, out);
      else if (kind === 2) projSectorInto(f, wx, wy, rad, a0, a1, 0.5, out);
      else if (kind === 3) projQuadStripInto(f, wx, wy, tx, ty, hw, 0, 1, true, true, 0.5, out);
      else projPathInto(f, [rect.x, rect.y, rect.x + rect.w, rect.y, rect.x + rect.w, rect.y + rect.h, rect.x, rect.y + rect.h], true, 0.5, out);
      for (let i = 0; i < 400; i++) {
        const px = wx + (r() - 0.5) * 2.4 * Math.max(rad, len + hw), py = wy + (r() - 0.5) * 2.4 * Math.max(rad, len + hw);
        if (projLocalYOfWorld(f, py) < 1) continue;
        const p = scr(f, px, py);
        if (!onScreen(f, p.x, p.y)) continue;
        if (distToPath(f, out, p.x, p.y) <= 1) continue; // 境界から 1 画面px 以内は除く
        const d = Math.hypot(px - wx, py - wy);
        let a = Math.atan2(py - wy, px - wx) - a0;
        a = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        let worldIn: boolean;
        if (kind === 0) worldIn = d <= rad;
        else if (kind === 1) worldIn = d <= rad && d >= rad * 0.5;
        else if (kind === 2) worldIn = d <= rad && a <= a1 - a0;
        else if (kind === 3) {
          // 描く形は判定のカプセルを囲む四角(§10 B26)。カプセルの内は必ず内、四角の外は必ず外。
          const inCaps = projDistToSeg(px, py, wx, wy, tx, ty) <= hw;
          const ux = Math.cos(ang), uy = Math.sin(ang);
          const along = (px - wx) * ux + (py - wy) * uy, side = Math.abs(-(px - wx) * uy + (py - wy) * ux);
          const inQuad = along >= -hw && along <= len + hw && side <= hw;
          const pIn = insideScr(f, out, p.x, p.y);
          checked++;
          if ((inCaps && !pIn) || (!inQuad && pIn)) wrong++;
          continue;
        } else worldIn = px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h;
        checked++;
        if (worldIn !== insideScr(f, out, p.x, p.y)) wrong++;
      }
    }
    expect(checked).toBeGreaterThan(2000);
    expect(wrong).toBe(0);
  });

  it('同心の環の角の並びを共有すると、隣どうしの頂点が一致する(継ぎ目なし)', () => {
    const f = frameAt(SCREENS[0], 1, 0, 0);
    const n = projAnnulusAnglesFor(f, f.cxw + 100, f.wRef - 60, 300, undefined, undefined, 0.5);
    const a = new ProjPathOut(), b = new ProjPathOut();
    projAnnulusRingInto(f, f.cxw + 100, f.wRef - 60, 100, 200, n, true, a);
    projAnnulusRingInto(f, f.cxw + 100, f.wRef - 60, 200, 300, n, true, b);
    // a の外周(各輪郭の前半)と b の内周(後半を逆順)が同じ点
    const s = a.contourStart(0), e = a.contourEnd(0);
    const half = (e - s) / 2;
    const bs = b.contourStart(0), be = b.contourEnd(0);
    for (let i = 0; i < half; i++) {
      const ax = a.xy[(s + i) * 2], ay = a.xy[(s + i) * 2 + 1];
      const bi = be - 1 - i;
      expect(b.xy[bi * 2]).toBeCloseTo(ax, 9);
      expect(b.xy[bi * 2 + 1]).toBeCloseTo(ay, 9);
    }
    expect(be - bs).toBe(e - s);
  });
});

describe('projShape: 地平線より北・分け方', () => {
  it('地平線より北の頂点は ℓ=0(地平線の線)に寄る=地平線より上に出ない', () => {
    const f = frameAt(SCREENS[0], 0.4, 0, 0);
    const out = new ProjPathOut();
    const wyH = f.wRef - 5000; // 十分北
    projCircleInto(f, f.cxw, wyH, 800, 0.5, out);
    for (let i = 0; i < out.n; i++) expect(out.xy[i * 2 + 1]).toBeGreaterThanOrEqual(f.camY + f.farH - 1e-6);
  });

  it('小さな円・遠い円は底の24辺のまま(画面の外の辺は分けない)', () => {
    const f = frameAt(SCREENS[0], 1, 0, 0);
    const out = new ProjPathOut();
    projCircleInto(f, f.cxw + 20000, f.wRef, 100, 0.5, out);
    expect(out.n).toBe(24);
    out.reset();
    projCircleInto(f, f.cxw, f.wRef, 150, 0.5, out);
    expect(out.n).toBeGreaterThan(24);
    expect(out.n).toBeLessThanOrEqual(24 * 32);
  });

  it('作り置きの配列: 同じ形を2回描いても長さが増えない', () => {
    const f = frameAt(SCREENS[1], 1, 0, 0);
    const out = new ProjPathOut();
    projCircleInto(f, f.cxw, f.wRef, 200, 0.5, out);
    const cap = out.xy.length;
    out.reset();
    projCircleInto(f, f.cxw, f.wRef, 200, 0.5, out);
    expect(out.xy.length).toBe(cap);
  });
});

describe('projShape: 焼き素材の格子メッシュ(受け入れ条件2・1 画面px 以下)', () => {
  it('回転していない四角(輪の素材の外周の円)', () => {
    const r = rng(91);
    const pos = new Float32Array(PROJ_GRID_VERTS * 2), uv = new Float32Array(PROJ_GRID_VERTS * 2);
    let worst = 0;
    for (let k = 0; k < 60; k++) {
      const { f, wx, wy } = scene(r, k);
      const rad = 30 + r() * 270;
      const res = projGridInto(f, { cx: wx, cy: wy, w: rad * 2, h: rad * 2, rot: 0 }, 12, 24, 32, pos, uv);
      for (let i = 0; i < 400; i++) {
        const a = (i / 400) * Math.PI * 2;
        const u = 0.5 + 0.5 * Math.cos(a), v = 0.5 + 0.5 * Math.sin(a);
        const px = wx + Math.cos(a) * rad, py = wy + Math.sin(a) * rad;
        if (projLocalYOfWorld(f, py) < 0) continue;
        const t = scr(f, px, py);
        if (!onScreen(f, t.x, t.y)) continue;
        const m = projGridSample(pos, uv, res, u, v);
        const z = f.wgScale;
        const mx = f.wgX + z * (m.x - f.camX), my = f.wgY + z * (m.y - f.camY);
        worst = Math.max(worst, Math.hypot(mx - t.x, my - t.y));
      }
    }
    expect(worst).toBeLessThanOrEqual(1.0);
  });

  it('回転している四角(帯に沿う絵)', () => {
    const r = rng(97);
    const pos = new Float32Array(PROJ_GRID_VERTS * 2), uv = new Float32Array(PROJ_GRID_VERTS * 2);
    let worst = 0, cases = 0;
    for (let k = 0; k < 40; k++) {
      const { f, wx, wy } = scene(r, k);
      const w = 60 + r() * 600, h = 20 + r() * 80, rot = 0.2 + r() * 2.5;
      // 回転した四角は画面の下の外へ掛かると、南の延長(数十 px で数倍に膨らむ範囲)のマスを 32×32 では割り切れない
      // (回転していない四角は画面で切るので起きない)。この試験は四角の4隅が画面に入る場面だけで測る(報告の(B)に記録)。
      let inside = true;
      for (const [qu, qv] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const lx = (qu - 0.5) * w, ly = (qv - 0.5) * h;
        const c = scr(f, wx + lx * Math.cos(rot) - ly * Math.sin(rot), wy + lx * Math.sin(rot) + ly * Math.cos(rot));
        if (!onScreen(f, c.x, c.y)) inside = false;
      }
      if (!inside) continue;
      cases++;
      const res = projGridInto(f, { cx: wx, cy: wy, w, h, rot }, 12, 24, 32, pos, uv);
      for (let i = 0; i < 300; i++) {
        const u = r(), v = r();
        const lx = (u - 0.5) * w, ly = (v - 0.5) * h;
        const px = wx + lx * Math.cos(rot) - ly * Math.sin(rot), py = wy + lx * Math.sin(rot) + ly * Math.cos(rot);
        if (projLocalYOfWorld(f, py) < 0) continue;
        const t = scr(f, px, py);
        if (!onScreen(f, t.x, t.y)) continue;
        const m = projGridSample(pos, uv, res, u, v);
        const z = f.wgScale;
        const e = Math.hypot(f.wgX + z * (m.x - f.camX) - t.x, f.wgY + z * (m.y - f.camY) - t.y);
        worst = Math.max(worst, e);
      }
    }
    expect(cases).toBeGreaterThan(8);
    expect(worst).toBeLessThanOrEqual(1.0);
  });

  it('添字は 32×32 マス・使わない頂点は最後の列/行に潰れる', () => {
    expect(projGridIndices().length).toBe(32 * 32 * 6);
    const f = frameAt(SCREENS[0], 1, 0, 0);
    const pos = new Float32Array(PROJ_GRID_VERTS * 2), uv = new Float32Array(PROJ_GRID_VERTS * 2);
    const res = projGridInto(f, { cx: f.cxw, cy: f.wRef, w: 30, h: 30, rot: 0 }, 12, 24, 32, pos, uv);
    expect(res.nx).toBeLessThan(32);
    const W = 33;
    const last = (res.ny * W + res.nx) * 2;
    expect(pos[(32 * W + 32) * 2]).toBe(pos[last]);
    expect(uv[(32 * W + 32) * 2]).toBe(1);
  });
});

describe('projShape: 線の太さ・高さ・濃さ・間引き', () => {
  it('★#23「予告の線の太さと遠近」: 既定は A(太さは画面の上で今のまま)', () => {
    expect(PROJ_TELE_LINE_MODE).toBe('A');
    expect(projTeleLineScale(0.42)).toBe(1);
    expect(projTeleLineScale(0.42, 'B')).toBeCloseTo(0.42, 9);
    expect(projTeleLineScale(0.25, 'C')).toBeCloseTo(0.5, 9);
  });

  it('高さ: 投影(gx, gy) − (0, h·s)', () => {
    const f = frameAt(SCREENS[0], 1, 0, 0);
    const o = { x: 0, y: 0, s: 1 };
    projLiftInto(f, f.cxw + 50, f.wRef - 100, 40, o);
    const p = projectInto(f, f.cxw + 50, f.wRef - 100, makeProjPoint());
    expect(o.x).toBeCloseTo(p.x, 9);
    expect(o.y).toBeCloseTo(p.y - 40 * p.s, 9);
  });

  it('予告の濃さの行: 範囲に足元を寄せた点の投影後のY', () => {
    const f = frameAt(SCREENS[0], 1, 0, 0);
    const o = { y: 0, a: 0 };
    const foot = f.wRef;
    projTeleFadeY(f, foot - 300, foot - 100, foot, o);
    expect(o.y).toBeCloseTo(projectInto(f, f.cxw, foot - 100, makeProjPoint()).y, 9);
    projTeleFadeY(f, foot - 300, foot + 100, foot, o);
    expect(o.y).toBeCloseTo(projectInto(f, f.cxw, foot, makeProjPoint()).y, 9);
    expect(projTeleFadeY(f, 1, 0, foot, o)).toBeNull();
  });

  it('間引き: 北の地面に見えている円は描く/画面の外の円は描かない', () => {
    const f = frameAt(SCREENS[0], 1, 0, 0);
    expect(projShapeOutside(f, f.cxw, f.wRef - 500, 60, 40)).toBe(false);
    expect(projShapeOutside(f, f.cxw + 9000, f.wRef, 60, 40)).toBe(true);
    expect(projShapeOutside(f, f.cxw, f.wRef + 4000, 60, 40)).toBe(true);
  });
});

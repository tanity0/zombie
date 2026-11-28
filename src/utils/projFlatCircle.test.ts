// 投影の段階4: 円は「真円を倒した」形(社長 2026-11-24「やはり真円にしたい」・research/PERSPECTIVE_PROJECTION.md §3-6 冒頭)。
// 中心を投影し、中心の s で大きさを掛け、縦は中心の行の縦の詰めで一様に潰した楕円(上下左右対称)。手前を抑える案(projnear)の既定の表で回す。
import { describe, it, expect } from 'vitest';
import { makeProjPoint, projectInto, projLocalYOfWorld, unproject, type ProjFrame } from './perspectiveProjection';
import { projFrameBase, projGameZoomPlacement, projGroundPersp, PROJ_GAME_OVERSCAN, type ProjFrameBaseParams } from './projGameView';
import { makeProjFrame } from './perspectiveProjection';
import { farBackdropHeightFor } from './spawnRefill';
import {
  ProjPathOut, projFlatCircleInto, projFlatEllipseInto, projFlatArcInto, projFlatSectorInto, projFlatAnnulusInto,
  projFlatAnnulusAnglesFor, projFlatAnnulusRingInto, projFlatCoreInto, makeProjFlatOut, projFlatCircleDev, projEllipseInto,
  projGridFlatInto, PROJ_GRID_VERTS,
} from './projShape';
import { projFlatInto, projFxScale } from './projFx';

const PH = 28;
interface Scr { name: string; W: number; H: number }
const SCREENS: Scr[] = [{ name: 'スマホ 430×932', W: 430, H: 932 }, { name: 'PC 1280×720', W: 1280, H: 720 }];

const frameFor = (sc: Scr, z: number, camX = 0, camY = 0): ProjFrame => {
  const farH = farBackdropHeightFor(sc.H);
  const p: ProjFrameBaseParams = {
    persp: projGroundPersp(), camX, camY, screenW: sc.W, screenH: sc.H, farH, viewH: sc.H, playerH: PH,
    playerFootY: camY + sc.H * 0.58 + PH / 2, camZoom: z, camDown: 0.08, zref: 2, near: true, att: null,
    farStart: 1200, farEnd: 1500, overscan: PROJ_GAME_OVERSCAN,
  };
  const { input } = projFrameBase(null, p);
  return makeProjFrame({ ...input, ...projGameZoomPlacement(z, sc.W, sc.H, farH), shakeX: 0, shakeY: 0 });
};
/** 主人公の行・北300px・南の行(画面の下端から 80 画面px 上の行)の world Y。 */
const rowsOf = (f: ProjFrame) => {
  const south = unproject(f, f.screenW / 2, f.screenH - 80).y;
  return [
    { name: '主人公の行', wy: f.wRef },
    { name: '北300px', wy: f.wRef - 300 },
    { name: '南の行', wy: south },
  ];
};

describe('真円を倒した楕円(projFlat*)', () => {
  it('上下左右対称の楕円・横=s・縦=横×縦の詰め(縦は横を超えない)', () => {
    for (const sc of SCREENS) for (const z of [1, 0.4]) {
      const f = frameFor(sc, z);
      for (const row of rowsOf(f)) {
        const fl = projFlatCoreInto(f, f.cxw + 40, row.wy, makeProjFlatOut());
        expect(fl.kx).toBeCloseTo(fl.s, 12);
        expect(fl.ky).toBeLessThanOrEqual(fl.kx + 1e-12);
        const out = new ProjPathOut();
        projFlatCircleInto(f, f.cxw + 40, row.wy, 100, 0.5, out);
        // 頂点を中心から見て (dx,dy) → 楕円の式で 1
        let maxX = 0, maxY = 0, minX = 0, minY = 0;
        for (let i = 0; i < out.n; i++) {
          const dx = out.xy[i * 2] - fl.x, dy = out.xy[i * 2 + 1] - fl.y;
          expect(Math.abs((dx / (fl.kx * 100)) ** 2 + (dy / (fl.ky * 100)) ** 2 - 1)).toBeLessThan(1e-9);
          maxX = Math.max(maxX, dx); minX = Math.min(minX, dx); maxY = Math.max(maxY, dy); minY = Math.min(minY, dy);
        }
        expect(maxX + minX).toBeCloseTo(0, 6); // 左右対称
        expect(maxY + minY).toBeCloseTo(0, 6); // 上下対称(卵形にならない)
      }
    }
  });

  it('段階3の閃光の輪(CR-3)・★#30 の地面の絵と同じ1本: projFlatInto は projFlatCoreInto に k(既定 s_fx)を渡した値', () => {
    const f = frameFor(SCREENS[0], 1);
    const a = projFlatInto(f, f.cxw, f.wRef - 120, makeProjFlatOut());
    const b = projFlatCoreInto(f, f.cxw, f.wRef - 120, makeProjFlatOut(), projFxScale(a.s));
    expect(a).toEqual(b);
    // CR-3 の旧い式(±2 の差・縦は横を超えない)と同じ値
    const P = makeProjPoint();
    const q = projectInto(f, f.cxw, f.wRef - 120, P);
    const qs = q.s;
    const ya = projectInto(f, f.cxw, f.wRef - 122, makeProjPoint()).y, yb = projectInto(f, f.cxw, f.wRef - 118, makeProjPoint()).y;
    const c = projFlatCoreInto(f, f.cxw, f.wRef - 120, makeProjFlatOut(), qs * 1.3);
    expect(c.kx).toBe(qs * 1.3);
    expect(c.ky).toBe(qs * 1.3 * Math.min(1, Math.max(0, (yb - ya) / 4) / qs));
  });

  it('中心が地平線より北の円は今の頂点ごとの投影のまま', () => {
    const f = frameFor(SCREENS[0], 1);
    let wy = f.wRef;
    while (projLocalYOfWorld(f, wy) >= 0) wy -= 50;
    const a = new ProjPathOut(), b = new ProjPathOut();
    projFlatEllipseInto(f, f.cxw, wy - 10, 800, 800, 0, 0.5, a);
    projEllipseInto(f, f.cxw, wy - 10, 800, 800, 0, 0.5, b);
    expect(a.xy.slice(0, a.n * 2)).toEqual(b.xy.slice(0, b.n * 2));
  });

  it('地平線より上へ出る所は地平線の線に寄せる(空へ描かない)', () => {
    const f = frameFor(SCREENS[0], 0.4);
    const out = new ProjPathOut();
    projFlatCircleInto(f, f.cxw, f.wRef - 300, 4000, 0.5, out);
    for (let i = 0; i < out.n; i++) expect(out.xy[i * 2 + 1]).toBeGreaterThanOrEqual(f.camY + f.farH - 1e-9);
  });

  it('弧・扇・環は同じ楕円の上(半径 r の頂点は楕円の式で 1)・扇の向きは world の角のまま', () => {
    const f = frameFor(SCREENS[1], 1);
    const cx = f.cxw - 60, cy = f.wRef + 40, r = 150;
    const fl = projFlatCoreInto(f, cx, cy, makeProjFlatOut());
    const onEllipse = (x: number, y: number) => ((x - fl.x) / (fl.kx * r)) ** 2 + ((y - fl.y) / (fl.ky * r)) ** 2;
    const arc = new ProjPathOut(); projFlatArcInto(f, cx, cy, r, 0.3, 2.1, 0.5, arc);
    for (let i = 0; i < arc.n; i++) expect(Math.abs(onEllipse(arc.xy[i * 2], arc.xy[i * 2 + 1]) - 1)).toBeLessThan(1e-9);
    // 扇(南東向き 0〜π/2): 弧の頂点は中心より右下
    const sec = new ProjPathOut(); projFlatSectorInto(f, cx, cy, r, 0, Math.PI / 2, 0.5, sec);
    for (let i = 1; i < sec.n - 1; i++) { expect(sec.xy[i * 2]).toBeGreaterThanOrEqual(fl.x - 1e-9); expect(sec.xy[i * 2 + 1]).toBeGreaterThanOrEqual(fl.y - 1e-9); }
    const ann = new ProjPathOut(); projFlatAnnulusInto(f, cx, cy, 80, r, undefined, undefined, 0.5, ann);
    expect(ann.cn).toBe(2);
    // 同心の環は角の並びを共有(継ぎ目なし)
    const n = projFlatAnnulusAnglesFor(f, cx, cy, 300, undefined, undefined, 0.5, 100);
    const a = new ProjPathOut(), b = new ProjPathOut();
    projFlatAnnulusRingInto(f, cx, cy, 100, 200, n, true, a);
    projFlatAnnulusRingInto(f, cx, cy, 200, 300, n, true, b);
    const half = Math.max(1, Math.floor((n - 1) / 2));
    // a の外周(半径 200)の最初の点 = b の内周(半径 200)の最後の点
    expect(a.xy[0]).toBeCloseTo(b.xy[(half * 2 + 1) * 2], 9);
  });

  it('円の絵の格子メッシュ: 4隅が楕円の写し(1×1 マス)', () => {
    const f = frameFor(SCREENS[0], 1);
    const pos = new Float32Array(PROJ_GRID_VERTS * 2), uv = new Float32Array(PROJ_GRID_VERTS * 2);
    const res = projGridFlatInto(f, { cx: f.cxw, cy: f.wRef, w: 200, h: 200, rot: 0 }, 12, 24, 32, pos, uv);
    expect(res.nx).toBe(1);
    const fl = projFlatCoreInto(f, f.cxw, f.wRef, makeProjFlatOut());
    expect(pos[0]).toBeCloseTo(fl.x - fl.kx * 100, 3);
    expect(pos[1]).toBeCloseTo(fl.y - fl.ky * 100, 3);
  });

  it('計器 circle dev: 厳密な投影とのずれの表(スマホ/PC・ズーム 1.0/0.4・3つの行・半径 100/200/400)', () => {
    const lines: string[] = [];
    for (const sc of SCREENS) for (const z of [1, 0.4]) {
      const f = frameFor(sc, z);
      for (const row of rowsOf(f)) {
        const cells = [100, 200, 400].map((r) => {
          const d = projFlatCircleDev(f, f.cxw, row.wy, r, 128);
          const all = projFlatCircleDev(f, f.cxw, row.wy, r, 128, false);
          expect(Number.isFinite(d.max)).toBe(true);
          expect(d.max).toBeGreaterThanOrEqual(Math.max(d.inner, d.outer) - 1e-9);
          expect(all.max).toBeGreaterThanOrEqual(d.max - 1e-9);
          return `r${r}: 画面内${d.max.toFixed(1)}(内${d.inner.toFixed(1)}/外${d.outer.toFixed(1)})・全周${all.max.toFixed(1)}`;
        });
        lines.push(`${sc.name} z=${z} ${row.name}: ${cells.join('  ')}`);
      }
    }
    console.log(['circle dev(画面px)', ...lines].join('\n'));
  });
});

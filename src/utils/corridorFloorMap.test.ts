// 段階8 洋館の床の写像(research/PERSPECTIVE_PROJECTION.md §3-10c・§3-10i 作る物9)。
import { describe, it, expect } from 'vitest';
import {
  corridorFloorFrame, corridorFloorTravel, corridorFloorU0, corridorFloorUAtLocal, corridorDarkMul,
  CORRIDOR_FLOOR_CFG, CORRIDOR_FLOOR_REPEAT, CORRIDOR_GOAL_TILE_START, CORRIDOR_PILLAR_WORLD_X, type CorridorFloorFrameInput,
} from './corridorFloorMap';
import {
  projectInto, makeProjPoint, unproject, projLocalYOfWorld, projWorldYOfLocal, projScaleAtLocal, projRowKx, projUnprojectLMin,
  projUnprojectInto, makeProjUnprojectOut, visibleWorldQuad, visibleWorldBands, southCullWorldY, projDisplayToScreen,
  buildProjTable, makeProjFrame, projRefLocalY, projTOfL,
} from './perspectiveProjection';
import { projAimFrameScalars, projAimFrameFrom } from './projAimSnap';
import { projVertexInto, projFlatCoreInto, makeProjFlatOut } from './projShape';
import { CORRIDOR_GOAL_Y } from '../store/gameStore';

const inputFor = (W: number, H: number, camY: number, extra: Partial<CorridorFloorFrameInput> = {}): CorridorFloorFrameInput => ({
  camX: -W / 2, camY, screenW: W, screenH: H, viewH: H, corridorW: Math.min(W, 405), playerH: 28, camDown: 0.16, camZ: 1,
  fadeTopFrac: 0.14, fadePx: 80, ...extra,
});
const SCREENS: [number, number][] = [[405, 878], [1280, 720], [430, 932]];

describe('洋館の枠(kind=corridor)', () => {
  for (const [W, H] of SCREENS) {
    const f = corridorFloorFrame(inputFor(W, H, -1200));
    const m = f.m7!;
    it(`${W}×${H}: 基準点で s=1・行=W_ref の画面Y(主人公の足元)`, () => {
      const p = projectInto(f, 0, f.wRef, makeProjPoint());
      expect(p.s).toBeCloseTo(1, 12);
      expect(p.y).toBeCloseTo(f.wRef, 9); // y_disp = W_ref(基準点は動かない)
      expect(f.kind).toBe('corridor');
      expect(f.noHorizonFade).toBe(true);
      expect(f.cxw).toBe(0);
      // 主人公の足元の行 = 画面の H·(0.5+0.16) + 14
      expect(f.wRef - f.camY).toBeCloseTo(H * 0.66 + 14, 9);
    });
    it(`${W}×${H}: 往復 unproject(projectInto(p)) = p(定義域の中・1e-6)`, () => {
      const pt = makeProjPoint();
      for (let k = 0; k < 200; k++) {
        const wx = -170 + (k % 17) * 20, wy = f.wRef - 470 + k * 3.3;
        const p = projectInto(f, wx, wy, pt);
        const sc = projDisplayToScreen(f, p.x, p.y);
        const u = unproject(f, sc.x, sc.y);
        expect(u.x).toBeCloseTo(wx, 6);
        expect(u.y).toBeCloseTo(wy, 6);
      }
    });
    it(`${W}×${H}: 床の行の式(CorridorLayer.updateFloor の写し)と projectInto の行が一致・横は床の幅に乗る`, () => {
      const pt = makeProjPoint();
      for (let k = 0; k < 60; k++) {
        const wy = f.wRef - 400 + k * 9;
        const p = projectInto(f, CORRIDOR_PILLAR_WORLD_X, wy, pt);
        const yScreen = p.y - f.camY; // 床はズームしない(枠もズーム1)
        const s = Math.max(0.02, (yScreen - m.hY) / m.denom);
        const d = CORRIDOR_FLOOR_CFG.focal * (1 / s - 1);
        expect(d).toBeCloseTo(m.dRef + (f.wRef - wy), 6);
        // 柱の world の x は床の半幅の端(W·aisleHalfXr·s)
        expect(p.x).toBeCloseTo(m.W * CORRIDOR_FLOOR_CFG.aisleHalfXr * s, 6);
        expect(p.kx).toBeCloseTo(projRowKx(f, p.l), 12);
      }
    });
    it(`${W}×${H}: 床の前進量 travel' で模様の行 u が world の点ごとに時間で一定(u = U0 − y)`, () => {
      for (const camY of [-1200, -1500.5, -3000, -200]) {
        const g = corridorFloorFrame(inputFor(W, H, camY));
        const tr = corridorFloorTravel(g, CORRIDOR_GOAL_Y);
        for (const wy of [-800, -1300, -2000, -3390]) {
          const l = projLocalYOfWorld(g, wy);
          if (l > g.m7!.lMax || l / g.m7!.denom < 0.02) continue;
          expect(corridorFloorUAtLocal(g, l, tr)).toBeCloseTo(corridorFloorU0(CORRIDOR_GOAL_Y) - wy, 6);
        }
      }
    });
    it(`${W}×${H}: ハッチの中心(u=GOAL_TILE_START+REPEAT/2)と帰還の円の中心が同じ行`, () => {
      const g = corridorFloorFrame(inputFor(W, H, CORRIDOR_GOAL_Y - H * 0.6));
      const tr = corridorFloorTravel(g, CORRIDOR_GOAL_Y);
      const uH = CORRIDOR_GOAL_TILE_START + CORRIDOR_FLOOR_REPEAT / 2;
      const dH = uH - tr;
      const yH = g.m7!.hY + g.m7!.denom * (g.m7!.focal / (g.m7!.focal + dH));
      const p = projectInto(g, 0, CORRIDOR_GOAL_Y, makeProjPoint());
      expect(p.y - g.camY).toBeCloseTo(yH, 6);
    });
    it(`${W}×${H}: 南の頭打ち d ≥ −0.6·focal で発散しない・単調・NaN が出ない`, () => {
      let prevL = -Infinity;
      for (let wy = f.wRef - 3000; wy < f.wRef + 3000; wy += 7.1) {
        const l = projLocalYOfWorld(f, wy);
        expect(Number.isFinite(l)).toBe(true);
        expect(l).toBeGreaterThan(prevL);
        prevL = l;
        const s = projScaleAtLocal(f, l);
        expect(s).toBeLessThanOrEqual(m.s7Max / m.sRef + 1e-12);
        expect(projWorldYOfLocal(f, l)).toBeCloseTo(wy, 5);
      }
      const q = visibleWorldQuad(f);
      for (const v of [q.tl.x, q.tl.y, q.br.x, q.br.y, q.rect.left, q.rect.right, q.rect.top, q.rect.bottom]) expect(Number.isFinite(v)).toBe(true);
      const bands: { left: number; top: number; right: number; bottom: number }[] = [];
      const n = visibleWorldBands(f, 100, 600, 6, 0, bands);
      for (let i = 0; i < n; i++) for (const v of Object.values(bands[i])) expect(Number.isFinite(v)).toBe(true);
      expect(Number.isFinite(southCullWorldY(f, 120, H - m.hY))).toBe(true);
      const lMin = projUnprojectLMin(f);
      expect(lMin).toBeCloseTo(projLocalYOfWorld(f, f.farRefY - f.farEnd), 9);
      const uo = projUnprojectInto(f, W / 2, 0, lMin, makeProjUnprojectOut());
      expect(uo.clamped).toBe(true);
      expect(Number.isFinite(uo.x) && Number.isFinite(uo.y)).toBe(true);
      const vtx = { x: 0, y: 0, s: 0, a: 0, sx: 0, sy: 0, l: 0 };
      projVertexInto(f, 120, f.wRef - 200, vtx);
      expect(Number.isFinite(vtx.x) && Number.isFinite(vtx.sx)).toBe(true);
      const fl = projFlatCoreInto(f, 0, f.wRef, makeProjFlatOut());
      // 床に寝た円: 主人公の行で縦横比 ≈ 縦の流れ/横の広がり(0.68/1.66 ≈ 0.41・3-10d)
      expect(fl.r).toBeGreaterThan(0.2);
      expect(fl.r).toBeLessThan(0.7);
    });
    it(`${W}×${H}: 物のフェードの線は world の今の線(camera.y + 0.14H)・80px`, () => {
      const p = makeProjPoint();
      expect(projectInto(f, 0, f.camY + H * 0.14 + 80, p).alpha).toBe(1);
      expect(projectInto(f, 0, f.camY + H * 0.14, p).alpha).toBe(0);
      expect(projectInto(f, 0, f.camY + H * 0.14 - 50, p).alpha).toBe(0);
      // 消失点(hY)より上には描かれない
      expect(projectInto(f, 0, f.camY - 5000, p).y - f.camY).toBeGreaterThanOrEqual(m.hY);
    });
  }
  it('縦持ち 405×878: 主人公の行で横 1.66・縦 0.68(試算 §3-10a)', () => {
    const f = corridorFloorFrame(inputFor(405, 878, 0));
    const l = projLocalYOfWorld(f, f.wRef);
    expect(projRowKx(f, l)).toBeCloseTo(1.66, 2);
    const dy = projLocalYOfWorld(f, f.wRef + 0.5) - projLocalYOfWorld(f, f.wRef - 0.5);
    expect(dy).toBeCloseTo(0.68, 2);
    expect(f.m7!.sRef).toBeCloseTo(0.780, 3);
  });
  it('アテンションは基準点と基準行を組で運ぶ', () => {
    const f0 = corridorFloorFrame(inputFor(405, 878, 0));
    const f1 = corridorFloorFrame(inputFor(405, 878, 0, { att: { y: f0.wRef - 300, env: 1 } }));
    expect(f1.wRef).toBeCloseTo(f0.wRef - 300, 9);
    expect(projectInto(f1, 0, f1.wRef, makeProjPoint()).s).toBeCloseTo(1, 12);
  });
  it('照準の吸い付きの写しは洋館の枠を種類のまま組み直す(カメラの縦の移動を足す)', () => {
    const f = corridorFloorFrame(inputFor(405, 878, -1000));
    const sc = projAimFrameScalars(f);
    const g = projAimFrameFrom(sc, f.camX, f.camY + 40);
    expect(g.kind).toBe('corridor');
    const a = projectInto(f, 30, -900, makeProjPoint()), b = projectInto(g, 30, -900 + 40, makeProjPoint());
    expect(b.y - g.camY).toBeCloseTo(a.y - f.camY, 9);
    expect(b.x).toBeCloseTo(a.x, 9);
  });
  it('★#47 の暗さ: 主人公の行で 1・奥ほど暗く・上限1', () => {
    const f = corridorFloorFrame(inputFor(405, 878, 0));
    expect(corridorDarkMul(f, f.lRef)).toBeCloseTo(1, 12);
    expect(corridorDarkMul(f, f.lRef * 0.5)).toBeLessThan(1);
    expect(corridorDarkMul(f, f.lRef * 2)).toBe(1);
    // フェードの線の行で明るさ約 0.53(3-10m ★#47)
    const lFade = projLocalYOfWorld(f, f.camY + 878 * 0.14 + 80);
    expect(corridorDarkMul(f, lFade)).toBeGreaterThan(0.4);
    expect(corridorDarkMul(f, lFade)).toBeLessThan(0.7);
  });
});

describe('研究所の枠(ground・farH 0.30H のまま・下げ量 0)', () => {
  it('地平線の行(ℓ=0)が画面の farH の行と一致(奥の壁の足元と投影の床の端が揃う)・主人公の足元で s=1', () => {
    const H = 878, farH = Math.round(H * 0.3), PH = 28;
    const P = { tileScaleX: 0.82, trapFar: 0.10, trapCurve: 1, trapezoid: 1, farScale: 0.055, nearScale: 0.82, curve: 2.6 };
    const stripH = (H - farH) / 72;
    const lRef = projRefLocalY(H, 0, PH, farH);
    const tb = buildProjTable(P, stripH, 180, 72, 8, lRef);
    const camY = -H / 2 - PH / 2;
    const f = makeProjFrame({ table: tb, camX: 0, camY, farH, screenW: 405, screenH: H, wRef: camY + farH + lRef, lRef, tStd: projTOfL(lRef, stripH) });
    const p = makeProjPoint();
    const wy0 = projWorldYOfLocal(f, 0);
    expect(projectInto(f, 0, wy0, p).y - f.camY).toBeCloseTo(farH, 9);
    // 主人公の中心 = 画面の 0.5H(下げ量 0)・足元で s=1
    const foot = camY + H / 2 + PH / 2;
    expect(projectInto(f, 0, foot, p).s).toBeCloseTo(1, 9);
    expect(projectInto(f, 0, foot, p).y - f.camY).toBeCloseTo(H / 2 + PH / 2, 9);
  });
});

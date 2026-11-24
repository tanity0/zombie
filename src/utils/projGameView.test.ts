// 段階6「逆向きの計算と画面の端」の純関数(research/PERSPECTIVE_PROJECTION.md §3-9i 作る物1/3/11・§3-9o)。
// 手前を抑える案 ON(既定)の表で回す。
import { describe, it, expect } from 'vitest';
import {
  makeProjFrame, makeProjPoint, makeProjUnprojectOut, projectInto, projDisplayToScreen, projLocalYOfWorld, projUnprojectInto,
  projUnprojectLMin, unproject, projArrowTargetInto, projWorldYOfLocal, projWorldToScreenInto, type GroundPerspectiveParams,
} from './perspectiveProjection';
import {
  projFrameBase, projGameFrame, projGameViewContains, projGameViewBands, projGameViewRect, projGameEdgePoint, projGameBoxOnScreen,
  projGameZoomPlacement, projGameVisibleRows, projGameRowSpan, projGameSpawnRect, projGameRecycleRect, projFadeInAlpha, projFadeInBrightness, PROJ_FADE_IN_DARK, PROJ_FADE_MS,
  PROJ_GAME_OVERSCAN, PROJ_REF_PHONE_H, PROJ_REF_PHONE_W, PROJ_SPAWN_LONG_EXTRA_PX, type ProjFrameBaseParams,
} from './projGameView';
import { horizonForestFootLocalY, horizonFadeAlphaAt, horizonForestHeightFor, horizonForestYFor, type HorizonForestInput } from './horizonForestLine';
import { farBackdropHeightFor } from './spawnRefill';
import { ZOOM_MIN_ABS } from './cameraZoom';
import { setViewProjection, screenToCameraLocal, setViewTransform } from './viewTransform';
import { isPointInZoomedViewport } from './cameraZoom';

const P: GroundPerspectiveParams = {
  tileScaleX: 0.82, trapFar: 0.10, trapCurve: 1, trapezoid: 1,
  farScale: 0.055, nearScale: 0.82, curve: 2.6,
};
const PH = 28;
const rng = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};

interface Scene { W: number; H: number }
const SCENES: Scene[] = [{ W: 405, H: 878 }, { W: 405, H: 720 }, { W: 1280, H: 720 }, { W: 1152, H: 720 }];

const baseParams = (sc: Scene, camX: number, camY: number, z: number, att: { y: number; env: number } | null = null): ProjFrameBaseParams => {
  const farH = farBackdropHeightFor(sc.H);
  return {
    persp: P, camX, camY, screenW: sc.W, screenH: sc.H, farH, viewH: sc.H, playerH: PH,
    playerFootY: camY + sc.H * 0.58 + PH / 2, camZoom: z, camDown: 0.08, zref: 2, near: true, att,
    farStart: 1200, farEnd: 1500, overscan: PROJ_GAME_OVERSCAN,
  };
};
const hzInput = (sc: Scene): HorizonForestInput => ({
  screenH: sc.H, farH: farBackdropHeightFor(sc.H), farKey: 'forest', stage5: false, lab: false, upPx: 60,
});
const view = (sc: Scene, camX: number, camY: number, z: number, att: { y: number; env: number } | null = null) =>
  projGameFrame(null, baseParams(sc, camX, camY, z, att), z, horizonForestFootLocalY(hzInput(sc)), 120);

describe('作る物1: 逆投影の守り projUnprojectInto(★#39 裁定 A)', () => {
  for (const sc of SCENES) for (const z of [1, 0.7, 0.4]) {
    it(`${sc.W}×${sc.H} z=${z}: 定義域の中は unproject と同じで、往復が 1e-6 で戻る`, () => {
      const gv = view(sc, 100, -300, z);
      const f = gv.f;
      const lMin = projUnprojectLMin(f);
      const out = makeProjUnprojectOut();
      const r = rng(3);
      const pp = makeProjPoint();
      const sp = { x: 0, y: 0 };
      let tested = 0;
      for (let k = 0; k < 200; k++) {
        const sx = r() * sc.W, sy = r() * sc.H;
        projUnprojectInto(f, sx, sy, lMin, out);
        if (out.clamped) continue;
        tested++;
        const u = unproject(f, sx, sy);
        expect(out.x).toBeCloseTo(u.x, 6);
        expect(out.y).toBeCloseTo(u.y, 6);
        projWorldToScreenInto(f, out.x, out.y, pp, sp);
        expect(Math.abs(sp.x - sx)).toBeLessThan(1e-6);
        expect(Math.abs(sp.y - sy)).toBeLessThan(1e-6);
      }
      expect(tested).toBeGreaterThan(50);
    });
    it(`${sc.W}×${sc.H} z=${z}: ℓ_min より上は ℓ_min の行の点になり、横が発散しない`, () => {
      const f = view(sc, 0, 0, z).f;
      const lMin = projUnprojectLMin(f);
      const out = makeProjUnprojectOut();
      const yMin = projWorldYOfLocal(f, lMin);
      for (const sy of [-200, 0, 3, 10]) for (const sx of [0, 20, sc.W / 2, sc.W - 1]) {
        projUnprojectInto(f, sx, sy, lMin, out);
        if (!out.clamped) continue;
        expect(out.l).toBe(lMin);
        expect(out.y).toBeCloseTo(yMin, 9);
        expect(Number.isFinite(out.x)).toBe(true);
        // 描く距離の上限より奥へ行かない(★#39: ℓ_min = max(帯1本, 描く距離の上限の行))
        expect(f.farRefY - out.y).toBeLessThanOrEqual(f.farEnd + 1e-6);
        expect(Math.abs(out.x - f.cxw)).toBeLessThan(20000);
      }
    });
  }
  it('引き0.4 で ℓ_min は描く距離の上限の行(帯1本より奥)', () => {
    const f = view(SCENES[0], 0, 0, 0.4).f;
    expect(projUnprojectLMin(f)).toBeGreaterThan(f.table.stripH);
    expect(projUnprojectLMin(f)).toBeCloseTo(projLocalYOfWorld(f, f.farRefY - f.farEnd), 9);
  });
});

describe('作る物2: マウスの照準の配線(viewTransform)', () => {
  it('枠が無い時(?proj=0)は今の式', () => {
    setViewProjection(null);
    setViewTransform(0.8, 10, 20);
    expect(screenToCameraLocal(100, 200)).toEqual({ x: (100 - 10) / 0.8, y: (200 - 20) / 0.8 });
    setViewTransform(1, 0, 0);
  });
  it('枠がある時は逆投影した地面の点 − 枠のカメラ・揺れを入れない(ケ10)', () => {
    const sc = SCENES[2];
    const f0 = view(sc, 50, -100, 1).f;
    const f = makeProjFrame({ ...f0, shakeX: 7, shakeY: -5 });
    setViewProjection(f);
    const v = screenToCameraLocal(640, 500);
    const u = unproject(f0, 640, 500);
    expect(v.x).toBeCloseTo(u.x - f0.camX, 6);
    expect(v.y).toBeCloseTo(u.y - f0.camY, 6);
    setViewProjection(null);
  });
});

describe('作る物3: 組み立て projFrameBase は描画と同じ式', () => {
  it('アテンションの組 (W_ref, ℓ_ref) と z の写し', () => {
    const sc = SCENES[0];
    const p = baseParams(sc, 0, 0, 1, { y: -200, env: 0.5 });
    const { input } = projFrameBase(null, p);
    expect(input.lRef).toBeCloseTo(input.wRef - p.camY - p.farH, 9);
    const wg = projGameZoomPlacement(0.7, sc.W, sc.H, p.farH);
    expect(wg.wgX).toBeCloseTo((sc.W / 2) * 0.3, 9);
    expect(wg.wgY).toBeCloseTo(p.farH * 0.3, 9);
    const wg2 = projGameZoomPlacement(1.2, sc.W, sc.H, p.farH);
    expect(wg2.wgY).toBeCloseTo((sc.H / 2) * -0.2, 9);
  });
});

describe('作る物3: projGameViewContains(★#38=A)', () => {
  for (const sc of SCENES) for (const z of [1, 0.7, 0.4]) for (const att of [null, { y: -150, env: 0.6 }]) {
    it(`${sc.W}×${sc.H} z=${z} att=${att ? 'on' : 'off'}: 投影した点が画面の中・濃さ 0.5 以上と一致`, () => {
      const gv = view(sc, 30, -400, z, att);
      const f = gv.f;
      const r = rng(11);
      const pp = makeProjPoint();
      let inside = 0;
      for (let k = 0; k < 400; k++) {
        // 半分は画面の周りの点を逆投影した world 点(境目の近く)・半分は広く振った world 点。
        let x: number, y: number;
        if (k % 2 === 0) {
          const u = unproject(f, (r() * 1.4 - 0.2) * sc.W, (r() * 1.4 - 0.2) * sc.H);
          x = u.x; y = u.y;
        } else {
          x = f.cxw + (r() - 0.5) * 4000;
          y = f.farRefY + (r() - 0.8) * 3000;
        }
        const p = projectInto(f, x, y, pp);
        const s = projDisplayToScreen(f, p.x, p.y);
        const hz = horizonFadeAlphaAt(p.y - f.camY, gv.horizonLocal, f.wgScale, gv.fadePx);
        const want = p.inDomain && p.alpha >= 0.5 && hz >= 0.5 && s.x >= 0 && s.x <= sc.W && s.y >= 0 && s.y <= sc.H;
        expect(projGameViewContains(gv, x, y)).toBe(want);
        if (want) inside++;
      }
      expect(inside).toBeGreaterThan(5);
    });
  }
  it('地平線より北・描く距離の先は false', () => {
    const gv = view(SCENES[0], 0, 0, 0.4);
    const f = gv.f;
    expect(projGameViewContains(gv, f.cxw, projWorldYOfLocal(f, -5))).toBe(false);
    expect(projGameViewContains(gv, f.cxw, f.farRefY - f.farEnd - 10)).toBe(false);
  });
  it('縦持ちズーム1: 主人公の行の画面の外(囲む長方形の中)は false', () => {
    const gv = view(SCENES[0], 0, 0, 1);
    const f = gv.f;
    const span = projGameRowSpan(gv, f.lRef);
    expect(projGameViewContains(gv, span.right + 30, span.y)).toBe(false);
    expect(projGameViewRect(gv).right).toBeGreaterThan(span.right + 30);
  });
});

describe('作る物3: 置く範囲・箱・縁の点', () => {
  it('帯の中の点は北の端の行で見える(帯の北の端の左右の内側)', () => {
    const gv = view(SCENES[0], 0, 0, 1);
    const out: { left: number; top: number; right: number; bottom: number }[] = [];
    const n = projGameViewBands(gv, 6, 0, out);
    expect(n).toBe(6);
    for (let i = 0; i < n; i++) {
      const b = out[i];
      expect(b.bottom).toBeGreaterThan(b.top);
      const cx = (b.left + b.right) / 2;
      expect(projGameViewContains(gv, cx, (b.top + b.bottom) / 2, 1)).toBe(true);
    }
    const rows = projGameVisibleRows(gv);
    expect(rows.lBot).toBeGreaterThan(rows.lTop);
  });
  it('箱: 足元が画面の下の外でも絵の上端が掛かれば true', () => {
    const gv = view(SCENES[0], 0, 0, 1);
    const f = gv.f;
    const yBelow = projWorldYOfLocal(f, (f.screenH - f.wgY) / f.wgScale - f.farH + 10);
    expect(projGameViewContains(gv, f.cxw, yBelow)).toBe(false);
    expect(projGameBoxOnScreen(gv, f.cxw, yBelow, 40, 120)).toBe(true);
  });
  it('縁の点は画面の外の最初の点(その手前は中)', () => {
    const gv = view(SCENES[2], 0, 0, 1);
    const f = gv.f;
    const fy = f.farRefY - PH / 2;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, -1], [0, 1], [0.7, -0.7]]) {
      const e = projGameEdgePoint(gv, f.cxw, fy, dx, dy);
      expect(projGameViewContains(gv, e.x, e.y)).toBe(false);
      const m = Math.hypot(dx, dy);
      expect(projGameViewContains(gv, e.x - dx / m * 2, e.y - dy / m * 2)).toBe(true);
    }
  });
});

describe('作る物6: 地平線より北の矢印の先(★#42 A)', () => {
  it('北の対象は ℓ_min の行で切った点、南の対象は対象の画面点', () => {
    const f = view(SCENES[0], 0, 0, 1).f;
    const lMin = projUnprojectLMin(f);
    const pp = makeProjPoint();
    const o = { x: 0, y: 0 };
    const px = f.cxw, py = f.farRefY;
    expect(projArrowTargetInto(f, px, py, px + 900, py - 5000, lMin, pp, o)).toBe(true);
    const yCut = projWorldYOfLocal(f, lMin);
    const want = projDisplayToScreen(f, projectInto(f, px + 900 * ((yCut - py) / (-5000)), yCut, pp).x, projectInto(f, px, yCut, pp).y);
    expect(o.x).toBeCloseTo(want.x, 6);
    expect(o.y).toBeCloseTo(want.y, 6);
    expect(projArrowTargetInto(f, px, py, px + 50, py + 100, lMin, pp, o)).toBe(false);
  });
});

describe('森の足元の行(utils/horizonForestLine)', () => {
  it('ステージ5・チュートリアル・北部・研究所の式', () => {
    const base: HorizonForestInput = { screenH: 878, farH: 228, farKey: 'forest', stage5: false, lab: false, upPx: 0 };
    const h = horizonForestHeightFor(base);
    expect(h).toBeCloseTo(Math.min(185, Math.max(120, 878 * 0.22)) * 1.5, 9);
    expect(horizonForestYFor(base, h)).toBeCloseTo(228 - h * 0.18 - 100, 9);
    expect(horizonForestHeightFor({ ...base, stage5: true })).toBe(130);
    expect(horizonForestYFor({ ...base, stage5: true }, 130)).toBe(228 + 20 - 130);
    expect(horizonForestFootLocalY({ ...base, stage5: true })).toBe(228 + 20);
    expect(horizonForestYFor({ ...base, lab: true }, h) - horizonForestYFor(base, h)).toBeCloseTo(20, 9);
    expect(horizonForestYFor({ ...base, upPx: 60 }, h) - horizonForestYFor(base, h)).toBeCloseTo(-60, 9);
  });
});

describe('★#36 湧く範囲・★#37 回収の範囲(3-9o ア・ウ)', () => {
  const M = 140;
  it('縦持ちは今の矩形の半幅・半高のまま(E は上下の辺だけ)', () => {
    for (const [W, H] of [[405, 878], [405, 720], [405, 847]]) for (const z of [1, 0.7, ZOOM_MIN_ABS]) {
      const r = projGameSpawnRect(W, H, z);
      expect(r.halfW).toBeCloseTo(W / 2 / z, 9);
      expect(r.halfH).toBeCloseTo(H / 2 / z, 9);
      expect(r.padX).toBe(0);
      expect(r.padY).toBe(PROJ_SPAWN_LONG_EXTRA_PX);
    }
  });
  it('横長は基準のスマホを倒した大きさ(左右 = 439/z + 204)', () => {
    for (const [W, H] of [[1280, 720], [1152, 720]]) for (const z of [1, 0.7, ZOOM_MIN_ABS]) {
      const r = projGameSpawnRect(W, H, z);
      expect(r.halfW + M + r.padX).toBeCloseTo(439 / z + 204, 9);
      expect(r.halfH + M + r.padY).toBeCloseTo(202.5 / z + 140, 9);
    }
    expect(projGameSpawnRect(1280, 720, 1).halfW + M + PROJ_SPAWN_LONG_EXTRA_PX).toBeGreaterThan(640);
  });
  it('湧く範囲 ⊂ 回収の範囲(z∈[ZOOM_MIN_ABS, 1]・縦持ちと横長・背の高い箱でも)', () => {
    const ART_H = 400;
    for (const [W, H] of [[405, 720], [405, 847], [405, 878], [1280, 720], [1152, 720]]) {
      for (let z = ZOOM_MIN_ABS; z <= 1.0001; z += 0.05) {
        const r = projGameSpawnRect(W, H, z);
        const rc = projGameRecycleRect(W, H, 0, 0, 240);
        const ex = r.halfW + M + r.padX, ey = r.halfH + M + r.padY;
        expect(ex).toBeLessThan(rc.right);
        expect(-ex).toBeGreaterThan(rc.left);
        expect(ey).toBeLessThan(rc.bottom);
        expect(-ey).toBeGreaterThan(rc.top); // 上の辺の敵の左上(箱は下へ伸びる=中心はさらに内側)
        expect(ey + ART_H / 2).toBeLessThan(rc.bottom + ART_H);
      }
    }
  });
  it('回収の範囲: 縦持ちは今の矩形+上下 E・横長は 1401.5 × 746', () => {
    const p = projGameRecycleRect(405, 878, 0, 0, 240);
    expect(p.right).toBeCloseTo(405 / 2 / ZOOM_MIN_ABS + 240, 9);
    expect(p.bottom).toBeCloseTo(878 / 2 / ZOOM_MIN_ABS + 240 + 64, 9);
    const l = projGameRecycleRect(1280, 720, 0, 0, 240);
    expect(l.right).toBeCloseTo(PROJ_REF_PHONE_H / 2 / ZOOM_MIN_ABS + 240 + 64, 9);
    expect(l.right).toBeCloseTo(1401.5, 9);
    expect(l.bottom).toBeCloseTo(PROJ_REF_PHONE_W / 2 / ZOOM_MIN_ABS + 240, 9);
    expect(l.bottom).toBeCloseTo(746.25, 9);
  });
});

describe('湧きのフェードイン projFadeInAlpha(3-9o イ)', () => {
  it('0→1 の単調・900ms で 1・経過 0 以下は 0', () => {
    let prev = -1;
    for (let t = -100; t <= PROJ_FADE_MS + 100; t += 10) {
      const a = projFadeInAlpha(t);
      expect(a).toBeGreaterThanOrEqual(prev);
      prev = a;
    }
    expect(projFadeInAlpha(0)).toBe(0);
    expect(projFadeInAlpha(PROJ_FADE_MS)).toBe(1);
    // 加減速(慣性): 出だしと終わりの傾きが中ほどより小さい
    const d0 = projFadeInAlpha(30) - projFadeInAlpha(0);
    const dm = projFadeInAlpha(315) - projFadeInAlpha(285);
    expect(d0).toBeLessThan(dm);
    const d1 = projFadeInAlpha(PROJ_FADE_MS) - projFadeInAlpha(PROJ_FADE_MS - 30);
    expect(d1).toBeLessThan(dm);
  });
  it('明るさは不透明度より遅れて戻る(前半は暗い輪郭・後半で色が乗る)・単調・尺で 1', () => {
    let prev = 0;
    for (let t = 0; t <= PROJ_FADE_MS; t += 10) { const b = projFadeInBrightness(t); expect(b).toBeGreaterThanOrEqual(prev - 1e-12); prev = b; }
    expect(projFadeInBrightness(0)).toBeCloseTo(PROJ_FADE_IN_DARK, 9);
    expect(projFadeInBrightness(PROJ_FADE_MS)).toBe(1);
    // 不透明度が半分を越えた時刻でも、明るさはまだ半分に届かない
    let tHalf = 0; while (projFadeInAlpha(tHalf) < 0.5) tHalf++;
    expect(projFadeInBrightness(tHalf)).toBeLessThan(0.5);
  });
});

describe('旗 false の枝(?proj=0)は今の関数', () => {
  it('isPointInZoomedViewport はそのまま(ゲームの画面は null)', async () => {
    const mod = await import('./projGameView');
    expect(mod.getProjGameView()).toBeNull();
    expect(isPointInZoomedViewport(10, 10, { x: 0, y: 0 }, { width: 100, height: 100 }, 1)).toBe(true);
  });
});

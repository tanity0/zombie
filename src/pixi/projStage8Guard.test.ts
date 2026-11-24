// 段階8「研究所と洋館の通路」のソースの番人テスト(research/PERSPECTIVE_PROJECTION.md §3-10i 作る物8 の①〜⑩・§3-4 の2 の流儀)。
// ① ground の枠の数値が段階8の前の式と1ビットも同じ(テストの中に写した今の式と比べる)。
// ②〜⑩ ソースの形(研究所の枝・奥の壁/屋内の控え/予告の時刻/洋館の床の描き方に差分が無い・utils が PixiJS を読まない・
//   窓口の外で cxw を読む所・帯の模様は ground だけ・★#47 はツマミの中だけ・照準の門)。
import { describe, it, expect } from 'vitest';
import {
  buildProjTable, makeProjFrame, projectInto, makeProjPoint, projG, projGInv, projConvAt, projTOfL, projScaleYNearAt,
  projLocalYOfWorld, projWorldYOfLocal, projScaleAtLocal, projRowKx, unproject, visibleWorldQuad, visibleWorldBands,
  southCullWorldY, projUnprojectLMin, projUnprojectInto, makeProjUnprojectOut, projRefLocalY,
  type GroundPerspectiveParams, type ProjFrame,
} from '../utils/perspectiveProjection';
import { projVertexInto, projFlatCoreInto, makeProjFlatOut } from '../utils/projShape';
import { projLiftScale } from '../utils/projLift';
import { projAimFrameScalars, projAimFrameFrom } from '../utils/projAimSnap';
import { projCamDownFracFor, projFrameBase, projGroundPersp, projAimAllowed, type ProjFrameBaseParams } from '../utils/projGameView';
import { zoomCameraDownFrac } from '../utils/cameraZoom';

const RAW = import.meta.glob([
  './pixiScene.ts', './corridorLayer.ts', '../utils/corridorFloorMap.ts', '../utils/perspectiveProjection.ts', '../utils/projShape.ts',
  '../utils/projGameView.ts', '../utils/projFx.ts', '../utils/projAimSnap.ts', '../utils/projLift.ts', '../utils/*.ts', './*.ts',
], { eager: true, import: 'default', query: '?raw' }) as Record<string, string>;
const src = (k: string): string => {
  const s = RAW[k];
  if (typeof s !== 'string') throw new Error(`not loaded: ${k}`);
  return s;
};
const PIXI = src('./pixiScene.ts');
const fnv = (s: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16);
};
/** クラスのメソッドの本体(次のメソッドの頭の手前まで)。 */
const methodBody = (text: string, name: string): string => {
  const L = text.split('\n');
  const re = new RegExp(`^ {2}(?:private |protected |public )?${name}\\s*\\(`);
  const i = L.findIndex((l) => re.test(l));
  if (i < 0) throw new Error(`method not found: ${name}`);
  let j = i + 1;
  while (j < L.length && !/^ {2}(?:private |protected |public )?(?:async )?[A-Za-z0-9_]+\s*(?:<[^>]*>)?\(/.test(L[j]) && !/^}/.test(L[j])) j++;
  return L.slice(i, j).join('\n');
};

// ---- ① ground の枠は1ビットも変わらない ----
const P: GroundPerspectiveParams = { tileScaleX: 0.82, trapFar: 0.10, trapCurve: 1, trapezoid: 1, farScale: 0.055, nearScale: 0.82, curve: 2.6 };
const SW = 405, SH = 878, FAR_H = 228, PH = 28;
const STRIP_H = (SH - FAR_H) / 72;
const TABLE = buildProjTable(P, STRIP_H, 180, 72, 8, projRefLocalY(SH, 0.08, PH, FAR_H));
const frameAt = (z: number, camX: number, camY: number): ProjFrame => {
  const lRef = projRefLocalY(SH, zoomCameraDownFrac(0.08, z), PH, FAR_H);
  const pivotY = z < 1 ? FAR_H : SH / 2;
  return makeProjFrame({
    table: TABLE, camX, camY, farH: FAR_H, screenW: SW, screenH: SH, wRef: camY + FAR_H + lRef, lRef,
    tStd: projTOfL(projRefLocalY(SH, 0.08, PH, FAR_H), STRIP_H), wgScale: z, wgX: (SW / 2) * (1 - z), wgY: pivotY * (1 - z),
    shakeX: 1.5, shakeY: -2, farRefY: camY + FAR_H + lRef, farStart: 1200, farEnd: 1500,
  });
};
// 段階8の前の式(写し)
const oldL = (f: ProjFrame, wy: number) => projGInv(f.table, f.gRef + (wy - f.wRef) / f.syRef);
const oldW = (f: ProjFrame, l: number) => f.wRef + f.syRef * (projG(f.table, l) - f.gRef);
const oldS = (f: ProjFrame, l: number) => projConvAt(projTOfL(l, f.table.stripH, f.table.refCount), f.table.p) / f.convRef;

describe('① ground の枠(屋外・研究所)は段階8の前の式と1ビットも同じ', () => {
  const frames = [frameAt(1, 100, -300), frameAt(0.7, -900, 400), frameAt(0.4, 30, 50), frameAt(1.3, 7000, -1200)];
  it('makeProjFrame の枠の種類は ground・洋館の値は持たない', () => {
    for (const f of frames) { expect(f.kind).toBe('ground'); expect(f.m7).toBeNull(); expect(f.noHorizonFade).toBe(false); }
  });
  it('窓口の 10 関数・projRowKx・projVertexInto・projFlatCoreInto・projLift の出力が前の式と同じ', () => {
    const pt = makeProjPoint(), uo = makeProjUnprojectOut(), vtx = { x: 0, y: 0, s: 0, a: 0, sx: 0, sy: 0, l: 0 }, fl = makeProjFlatOut();
    for (const f of frames) {
      for (let k = 0; k < 120; k++) {
        const wx = f.camX - 600 + k * 17.3, wy = f.camY - 400 + k * 13.7;
        const l = oldL(f, wy);
        expect(projLocalYOfWorld(f, wy)).toBe(l);
        expect(projWorldYOfLocal(f, l)).toBe(oldW(f, l));
        expect(projScaleAtLocal(f, l)).toBe(oldS(f, l));
        expect(projRowKx(f, l)).toBe(oldS(f, l));
        const p = projectInto(f, wx, wy, pt);
        expect(p.x).toBe(f.cxw + oldS(f, l) * (wx - f.cxw));
        expect(p.kx).toBe(p.s);
        projVertexInto(f, wx, wy, vtx);
        const lv = l >= 0 ? l : 0;
        expect(vtx.x).toBe(f.cxw + oldS(f, lv) * (wx - f.cxw));
        expect(projLiftScale(f, Math.max(0, l))).toBe(oldS(f, Math.max(0, l)));
        const tb = f.table, l0 = Math.max(0, l);
        expect(projLiftScale(f, l0, 'B')).toBe(
          projScaleYNearAt(l0, tb.stripH, tb.refCount, tb.p, f.lRef) / Math.max(1e-9, projScaleYNearAt(f.lRef, tb.stripH, tb.refCount, tb.p, f.lRef)));
        projFlatCoreInto(f, wx, wy, fl);
        expect(fl.kx).toBe(p.s);
        const sx = 3 + k * 3.1, sy = 20 + k * 7.1;
        const u = unproject(f, sx, sy);
        const sc = f.wgScale, dx = (sx - f.wgX) / sc + f.camX - f.shakeX, dy = (sy - f.wgY) / sc + f.camY - f.shakeY;
        const ul = dy - f.camY - f.farH;
        expect(u.x).toBe(f.cxw + (dx - f.cxw) / Math.max(1e-6, oldS(f, ul)));
        const lMin = projUnprojectLMin(f);
        expect(lMin).toBe(Math.max(f.table.stripH, oldL(f, f.farRefY - f.farEnd)));
        projUnprojectInto(f, sx, sy, lMin, uo);
        const lu = ul >= lMin ? ul : lMin;
        expect(uo.x).toBe(f.cxw + (dx - f.cxw) / Math.max(1e-6, oldS(f, lu)));
      }
      const q = visibleWorldQuad(f);
      expect(Number.isFinite(q.rect.left) && Number.isFinite(q.rect.right)).toBe(true);
      const bands: { left: number; top: number; right: number; bottom: number }[] = [];
      const n = visibleWorldBands(f, 10, 500, 6, 20, bands);
      const sc = f.wgScale, dxL = (0 - f.wgX) / sc + f.camX - f.shakeX;
      for (let i = 0; i < n; i++) {
        const l0 = 10 + (490 * i) / 6;
        expect(bands[i].left).toBe(f.cxw + (dxL - f.cxw) / Math.max(1e-6, oldS(f, l0)) - 20);
      }
      expect(Number.isFinite(southCullWorldY(f, 120, 700))).toBe(true);
    }
  });
  it('projFrameBase の下げ量: 省略=今の式・projCamDownFracFor の屋外=同じ値・研究所は字の 0', () => {
    const base: ProjFrameBaseParams = {
      persp: projGroundPersp(), camX: 0, camY: -400, screenW: SW, screenH: SH, farH: FAR_H, viewH: SH, playerH: PH, playerFootY: 0,
      camZoom: 0.6, camDown: 0.08, zref: 2, near: true, att: null, farStart: 1200, farEnd: 1500, overscan: 2.5,
    };
    const a = projFrameBase(null, base).input;
    expect(a.lRef).toBe(projRefLocalY(SH, zoomCameraDownFrac(0.08, 0.6), PH, FAR_H));
    const out = projFrameBase(null, { ...base, downFracAt: (z) => projCamDownFracFor('outdoor', z, 0.08, 0.16) }).input;
    expect(out.lRef).toBe(a.lRef);
    const lab = projFrameBase(null, { ...base, farH: 263, downFracAt: (z) => projCamDownFracFor('lab', z, 0.08, 0.16) }).input;
    expect(lab.lRef).toBe(projRefLocalY(SH, 0, PH, 263));
  });
  it('projCamDownFracFor: 屋外・洋館は今の値、研究所・屋内は 0(useGameLoop のカメラと同じ)', () => {
    for (const z of [1, 0.85, 0.6, 0.4]) {
      expect(projCamDownFracFor('outdoor', z, 0.08, 0.16)).toBe(zoomCameraDownFrac(0.08, z));
      expect(projCamDownFracFor('corridor', z, 0.08, 0.16)).toBe(zoomCameraDownFrac(0.16, z));
      expect(projCamDownFracFor('lab', z, 0.08, 0.16)).toBe(0);
      expect(projCamDownFracFor('indoor', z, 0.08, 0.16)).toBe(0);
    }
  });
  it('照準の吸い付きの写しは ground の枠を今どおり組み直す(kind を持つ)', () => {
    const f = frameAt(1, 10, -200);
    const sc = projAimFrameScalars(f);
    expect(sc.kind).toBe('ground');
    const g = projAimFrameFrom(sc);
    expect(g.kind).toBe('ground');
    expect(projLocalYOfWorld(g, -150)).toBe(projLocalYOfWorld(f, -150));
  });
});

describe('② 研究所だけの関数に ?proj=1 の枝・奥の壁の関数は差分なし(★#49)', () => {
  it('U10〜U20 の関数に枠の枝がある', () => {
    for (const name of ['syncLabWalls', 'syncLabProps', 'tickLabObstacleCrumble', 'labObstacleViewBounds', 'syncLabCrawler',
      'updateLabVisionCones', 'updateLabDarkLights', 'updateLabPitch', 'updateLabOutsideDim']) {
      expect(/projFrame|projWorldToUi|projLoose|\bpf\b|pfO|pfL|pfV/.test(methodBody(PIXI, name)), name).toBe(true);
    }
  });
  it('奥の壁(遠景の組)の関数は段階8の前と同じ本文', () => {
    const want: Record<string, string> = {
      updateLabFarWindow: '325b8394', layoutFarBackdrop: '96e356a9', layoutNearHorizon: '2ad5715d', updateLabFarWindowZombies: 'daa4438d',
      updateLabFarRoomLight: '4d30ad0e', updateLabFarEmergency: '5fdacfc0', updateLabFarFront: '322fd45a',
    };
    for (const [n, h] of Object.entries(want)) expect(fnv(methodBody(PIXI, n)), n).toBe(h);
  });
});

describe('③ 屋内の控え(labProjectFootY・LAB_WALL_DEPTH・?labpersp)は差分なし', () => {
  it('行が段階8の前と同じ', () => {
    expect(fnv(methodBody(PIXI, 'labProjectFootY'))).toBe('8f0658e5');
    const lines = PIXI.split('\n').filter((l) => /LAB_WALL_DEPTH|labpersp|LAB_PERSP\b|labProjectFootY/.test(l)).join('\n');
    expect(fnv(lines)).toBe('c46621ba');
  });
});

describe('④ 予告の時刻(meteorPhase を使う所)は差分なし', () => {
  it('pixiScene の meteorPhase の行が段階8の前と同じ', () => {
    expect(fnv(PIXI.split('\n').filter((l) => /meteorPhase/.test(l)).join('\n'))).toBe('c953acb1');
  });
});

describe('⑤ 洋館の床・壁の描き方(corridorLayer)は差分なし(裁定 B)', () => {
  it('updateFloor 等の本文が段階8の前と同じ', () => {
    const CL = src('./corridorLayer.ts');
    const want: Record<string, string> = {
      updateFloor: '975f5215', updateGoalFloor: '7a9988d8', updateCeiling: 'b83bdd34', updatePillars: 'fdb03aee',
      updateWallLamps: '8ceb0b55', updateBack: '59f0378a',
    };
    for (const [n, h] of Object.entries(want)) expect(fnv(methodBody(CL, n)), n).toBe(h);
  });
});

describe('⑥ utils/corridorFloorMap.ts は PixiJS を読まない', () => {
  it('pixi.js・src/pixi を import しない', () => {
    const t = src('../utils/corridorFloorMap.ts');
    expect(/from ['"]pixi\.js['"]/.test(t)).toBe(false);
    expect(/from ['"]\.\.\/pixi\//.test(t)).toBe(false);
  });
});

describe('⑦ 窓口の外で f.cxw を読む所は一覧と同じ(横は projRowAffine / projRowKx を読む)', () => {
  it('一覧', () => {
    const hits: string[] = [];
    for (const [k, t] of Object.entries(RAW)) {
      if (k.endsWith('.test.ts') || k.endsWith('perspectiveProjection.ts') || k.endsWith('corridorFloorMap.ts')) continue;
      t.split('\n').forEach((l) => {
        if (/^\s*(\/\/|\*)/.test(l)) return;
        if (/\bf\.cxw\b|\bpf\.cxw\b|\bgv\.f\.cxw\b|\bpfO\.cxw\b|\bpfL\.cxw\b/.test(l)) hits.push(`${k.replace(/^.*\//, '')}: ${l.trim().slice(0, 60)}`);
      });
    }
    // 中心の列 c(=cxw)として読むだけの所か、横の倍率を kx / projRowKx で取る所(=洋館で物と同じ式)。
    // pixiScene の段階1の滑りの計器(3行)は地面の帯の計器=洋館では slipAt が null を返して呼ばれない。新しく増えたら落ちる。
    expect(hits.length).toBe(KNOWN_CXW_READERS);
  });
});
/**
 * 段階8の着手後に数えた、窓口の外で f.cxw を読む行の数: pixiScene 8(段階1の滑りの計器 3・s8 lab の計器 1・projSnowVanish の消失点の列 1・
 * 非常灯の列の範囲 1(kx で戻す)・帯の外の影の縁 2)・projGameView 2(projRowKx)・projShape 5(kx)・projFx 1(中心の点)。
 */
const KNOWN_CXW_READERS = 16;

describe('⑧ 地面の帯の模様と計器は ground の枠だけ', () => {
  it('groundStripTile・groundVsObjectDiff を呼ぶ所の手前に kind の枝', () => {
    const L = PIXI.split('\n');
    L.forEach((l, i) => {
      if (!/groundStripTile\(|groundVsObjectDiff\(/.test(l) || /^\s*(\/\/|\*)/.test(l) || /^import|^\s+groundStripTile, /.test(l)) return;
      const win = L.slice(Math.max(0, i - 25), i + 1).join('\n');
      expect(/kind === 'ground'|kind !== 'ground'/.test(win), `${i + 1}: ${l.trim()}`).toBe(true);
    });
  });
});

describe('⑨ ★#47(洋館の奥の闇を物に掛ける)は既定 OFF のツマミの中だけ', () => {
  it('corridorDarkMul を呼ぶのは PROJ_CORR_DARK を見る関数だけ・ツマミは既定 false', () => {
    expect(PIXI).toContain("const PROJ_CORR_DARK = PROJ_ON && tsBool('corrdark', false);");
    const L = PIXI.split('\n');
    const calls = L.map((l, i) => (/corridorDarkMul\(/.test(l) && !/^import/.test(l) ? i : -1)).filter((i) => i >= 0);
    expect(calls.length).toBe(1);
    expect(methodBody(PIXI, 'projCorrDarkPass')).toContain("if (!PROJ_CORR_DARK || !f || f.kind !== 'corridor') return;");
  });
});

describe('⑩ setViewProjection( は照準の門(aimOK)を通る', () => {
  it('呼び出しは門の1か所・★#46=A で研究所・洋館も開ける', () => {
    const calls = PIXI.split('\n').filter((l) => /setViewProjection\(/.test(l) && !/^\s*(\/\/|\*)/.test(l) && !/^import/.test(l));
    expect(calls).toEqual(['    setViewProjection(aimOK ? this.projFrame : null);']);
    expect(PIXI).toContain('const aimOK = this.projFrame !== null && projAimAllowed(this.projSceneOf(s));');
    expect(projAimAllowed('outdoor')).toBe(true);
    expect(projAimAllowed('lab')).toBe(true);
    expect(projAimAllowed('corridor')).toBe(true);
    expect(projAimAllowed('indoor')).toBe(false);
    expect(projAimAllowed(null)).toBe(false);
  });
});

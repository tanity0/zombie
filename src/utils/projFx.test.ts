import { describe, it, expect } from 'vitest';
import {
  buildProjTable, makeProjFrame, projRefLocalY, projTOfL, projectInto, makeProjPoint, projLocalYOfWorld, projScreenRowsL,
  visibleWorldBands, type GroundPerspectiveParams, type ProjFrame,
} from './perspectiveProjection';
import { zoomCameraDownFrac } from './cameraZoom';
import {
  PROJ_FX_MIN_S, PROJ_FX_DISC_MAX_S, PROJ_FX_SOFT_DISC_MAX_S, projBulletForm, projFxScale, projFxRingRadiusMul, projBulletScale, PROJ_BULLET_MIN_PX, projLineWidth, projDirInto, makeProjDirOut,
  projFloorAnchorInto, projNumberAnchorInto, PROJ_NUMBER_LIFT_H0, projAmbientRegion, projAmbientCount, PROJ_FX_ROWS, PROJ_FX_KINDS, projFxK,
  PROJ_FX_SIZE_MODE, PROJ_BULLET_SIZE_MODE, PROJ_NUMBER_SIZE_MODE,
  projFlatInto, makeProjFlatOut, projSnowCounts, projSnowLeanVx, PROJ_SNOW_TOTAL_CAP, PROJ_SNOW_LAYERS,
} from './projFx';

// research/PERSPECTIVE_PROJECTION.md §3-7l 作る物10(純関数のテスト)。手前の伸びを抑える案が既定ON の表で回す(3-7i)。

const P: GroundPerspectiveParams = {
  tileScaleX: 0.82, trapFar: 0.10, trapCurve: 1, trapezoid: 1,
  farScale: 0.055, nearScale: 0.82, curve: 2.6,
};
const CAMDOWN = 0.08, PH = 28;
interface Scr { w: number; h: number; farH: number }
const SCREENS: Scr[] = [{ w: 430, h: 932, farH: 234 }, { w: 1280, h: 720, farH: 180 }];

/** 手前を抑える案(ℓ_near=ℓ_ref)の表で作る frame。 */
const frameAt = (sc: Scr, z: number, camX: number, camY: number, farEnd = 1500): ProjFrame => {
  const stripH = (sc.h - sc.farH) / 72;
  const lRef0 = projRefLocalY(sc.h, zoomCameraDownFrac(CAMDOWN, z), PH, sc.farH);
  const lRef1 = projRefLocalY(sc.h, zoomCameraDownFrac(CAMDOWN, 1), PH, sc.farH);
  const table = buildProjTable(P, stripH, 180, 72, 8, lRef0);
  const pivotY = z < 1 ? sc.farH : sc.h / 2;
  const wRef = camY + sc.farH + lRef0;
  return makeProjFrame({
    table, camX, camY, farH: sc.farH, screenW: sc.w, screenH: sc.h,
    wRef, lRef: lRef0, tStd: projTOfL(lRef1, table.stripH),
    wgScale: z, wgX: (sc.w / 2) * (1 - z), wgY: pivotY * (1 - z),
    farRefY: wRef, farStart: farEnd * 0.8, farEnd,
  });
};
const FRAMES = SCREENS.flatMap((sc) => [1, 0.7, 0.4].map((z) => ({ sc, z, f: frameAt(sc, z, 1000, 2000) })));
const sp = makeProjPoint();

describe('projFx: 倍率(★#24・★#28・★#25)', () => {
  it('裁定どおりの既定(★#24=B・★#28=B・★#25=A)', () => {
    expect(PROJ_FX_SIZE_MODE).toBe('B');
    expect(PROJ_BULLET_SIZE_MODE).toBe('B');
    expect(PROJ_NUMBER_SIZE_MODE).toBe('A');
    expect(PROJ_FX_MIN_S).toBe(0.6);
    expect(PROJ_BULLET_MIN_PX).toBe(6);
  });
  it('projFxScale: ★#24=B の式 max(s, 0.6)・南は s のまま(全体の天井なし=監査2巡目 A-1)・単調', () => {
    let prev = -Infinity;
    expect(PROJ_FX_DISC_MAX_S).toBeLessThan(PROJ_FX_SOFT_DISC_MAX_S);
    for (let s = 0; s <= 3; s += 0.01) {
      const v = projFxScale(s);
      expect(v).toBeCloseTo(s >= PROJ_FX_MIN_S ? s : PROJ_FX_MIN_S, 12);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
  it('倍率の関数は濃さを返さない(数1つだけ=濃さの掛け率を持たない)', () => {
    expect(typeof projFxScale(0.2)).toBe('number');
    expect(typeof projBulletScale(0.2, 10)).toBe('number');
    expect(typeof projLineWidth(2, 0.2, 0.4)).toBe('number');
  });
  it('閃光の輪の半径の倍率: 下限に当たる所で s_fx/s>1・当たらない所で 1', () => {
    expect(projFxRingRadiusMul(0.3)).toBeGreaterThan(1);
    expect(projFxRingRadiusMul(0.3)).toBeCloseTo(PROJ_FX_MIN_S / 0.3, 12);
    expect(projFxRingRadiusMul(0.9)).toBeCloseTo(1, 12);
    expect(projFxRingRadiusMul(1.2)).toBeCloseTo(1, 12);
    expect(projFxRingRadiusMul(1.6)).toBeCloseTo(1, 12); // 南は s のまま=閃光の輪が判定と一致する輪の内側に入らない(監査2巡目 A-1)
  });
  it('projBulletScale: 下限を下回らず、ズームの値に依らない(表示座標の値)', () => {
    for (const d of [4, 6, 8, 12, 20, 40]) {
      for (let s = 0.05; s < 2.5; s += 0.05) {
        const k = projBulletScale(s, d);
        expect(k * d).toBeGreaterThanOrEqual(Math.min(PROJ_BULLET_MIN_PX, d) - 1e-9);
        expect(k).toBeGreaterThanOrEqual(s - 1e-12);
        if (s * d >= PROJ_BULLET_MIN_PX) expect(k).toBeCloseTo(s, 12);
      }
    }
    // 下限より小さい弾は今の大きさまで(投影で今より大きくしない)
    expect(projBulletScale(0.1, 4)).toBeCloseTo(1, 12);
  });
  it('projLineWidth: 今の太さ×k・ズーム後の画面で 1px を下回らない・今より太くしない', () => {
    for (const z of [1, 0.7, 0.4]) {
      for (const base of [0.5, 1, 2.5, 6]) {
        for (let k = 0.05; k < 2.5; k += 0.05) {
          const w = projLineWidth(base, k, z);
          expect(w).toBeGreaterThanOrEqual(base * k - 1e-12);
          expect(w * z).toBeGreaterThanOrEqual(Math.min(base * z, 1) - 1e-9);
          if (base * k * z >= 1) expect(w).toBeCloseTo(base * k, 12);
        }
      }
    }
  });
  it('projFxK: s・fx・hud', () => {
    expect(projFxK('s', 0.3)).toBeCloseTo(0.3, 12);
    expect(projFxK('fx', 0.3)).toBeCloseTo(0.6, 12);
    expect(projFxK('hud', 0.3)).toBe(1);
  });
});

describe('projFx: 向(projDirInto)', () => {
  it('回転が東西南北・斜めの向きで投影した2点の角度と一致し、ε→0 で長さの倍率が収束する', () => {
    const out = makeProjDirOut();
    for (const { f } of FRAMES) {
      for (const wy of [f.wRef - 400, f.wRef - 150, f.wRef, f.wRef + 120]) {
        if (projLocalYOfWorld(f, wy) < 2) continue;
        for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
          const ax = Math.cos(a), ay = Math.sin(a), wx = f.cxw + 120;
          projDirInto(f, wx, wy, ax, ay, 8, 1, out);
          const p = projectInto(f, wx, wy, makeProjPoint()), q = projectInto(f, wx + ax * 8, wy + ay * 8, makeProjPoint());
          expect(Math.abs(Math.atan2(Math.sin(out.rot - Math.atan2(q.y - p.y, q.x - p.x)), Math.cos(out.rot - Math.atan2(q.y - p.y, q.x - p.x))))).toBeLessThan(1e-9);
          const l1 = projDirInto(f, wx, wy, ax, ay, 1, 1, out).len;
          const l01 = projDirInto(f, wx, wy, ax, ay, 0.1, 1, out).len;
          const l001 = projDirInto(f, wx, wy, ax, ay, 0.01, 1, out).len;
          // 表は区分線形(ε が表の刻みより小さいと折れ目の片側の傾き)=収束は 1% 以内で見る
          expect(Math.abs(l01 - l001)).toBeLessThan(0.01 * Math.max(1e-6, l1));
          expect(Math.abs(l1 - l001)).toBeLessThan(0.02 * Math.max(1e-6, l1));
        }
      }
    }
  });
  it('長さと幅の比は k に依らず投影の比のまま(北で太く短く崩れない)', () => {
    const out = makeProjDirOut();
    const f = FRAMES[0].f;
    const wy = f.wRef - 350;
    for (const a of [0, Math.PI / 2, Math.PI / 3]) {
      const r1 = projDirInto(f, f.cxw, wy, Math.cos(a), Math.sin(a), 8, projFxScale(0.3), out);
      const ratio1 = r1.len / r1.wid;
      const r2 = projDirInto(f, f.cxw, wy, Math.cos(a), Math.sin(a), 8, 0.3, out);
      expect(r2.len / r2.wid).toBeCloseTo(ratio1, 9);
    }
  });
  it('横向きの長さの倍率=k(横は s で縮むので (s·ε/ε)×(k/s)=k)', () => {
    const out = makeProjDirOut();
    const f = FRAMES[0].f;
    const r = projDirInto(f, f.cxw, f.wRef - 200, 1, 0, 8, 0.6, out);
    expect(r.len).toBeCloseTo(0.6, 6);
    expect(r.wid).toBe(0.6);
  });
});

describe('projFx: 付け根の高さ(床・数字)', () => {
  it('projNumberAnchorInto: 基準行(s=1)で今の点と一致(誤差 1e-6)', () => {
    for (const { f } of FRAMES) {
      const h0 = PROJ_NUMBER_LIFT_H0;
      const wx = f.cxw + 90, wy = f.wRef - h0; // 地面の点 G=(wx, wy+h0) が基準行
      const o = projNumberAnchorInto(f, wx, wy, h0, { x: 0, y: 0, s: 0 });
      expect(o.s).toBeCloseTo(1, 6);
      expect(Math.abs(o.x - wx)).toBeLessThan(1e-6);
      expect(Math.abs(o.y - wy)).toBeLessThan(1e-6);
    }
  });
  it('projFloorAnchorInto: 床の上の粒(高さ0)は床の点の投影と一致', () => {
    for (const { f } of FRAMES) {
      for (const fy of [f.wRef - 300, f.wRef, f.wRef + 100]) {
        const o = projFloorAnchorInto(f, f.cxw + 40, fy, fy, { x: 0, y: 0, s: 0 });
        const p = projectInto(f, f.cxw + 40, fy, sp);
        if (p.l < 0) continue;
        expect(o.x).toBeCloseTo(p.x, 9);
        expect(o.y).toBeCloseTo(p.y, 9);
      }
    }
  });
});

describe('projFx: 漂う粒(★#26=B)', () => {
  it('projAmbientRegion が visibleWorldBands の全部の帯を囲み、北が描く距離の上限を超えない', () => {
    for (const { f } of FRAMES) {
      const r = projAmbientRegion(f, 0, { left: 0, top: 0, right: 0, bottom: 0 });
      const rows = projScreenRowsL(f);
      let lTop = Math.max(0, rows.top);
      lTop = Math.max(lTop, projLocalYOfWorld(f, f.farRefY - f.farEnd));
      const bands: { left: number; top: number; right: number; bottom: number }[] = [];
      const n = visibleWorldBands(f, lTop, rows.bottom, 16, 0, bands);
      for (let i = 0; i < n; i++) {
        expect(bands[i].left).toBeGreaterThanOrEqual(r.left - 1e-6);
        expect(bands[i].right).toBeLessThanOrEqual(r.right + 1e-6);
        expect(bands[i].top).toBeGreaterThanOrEqual(r.top - 1e-6);
        expect(bands[i].bottom).toBeLessThanOrEqual(r.bottom + 1e-6);
      }
      expect(r.top).toBeGreaterThanOrEqual(f.farRefY - f.farEnd - 1e-6);
    }
  });
  it('projAmbientRegion: 帯が0本でも NaN/Infinity を返さない(監査 B-4)', () => {
    const { f } = FRAMES[0];
    // 地面が画面に映らない枠(描く距離の上限を基準行の手前に)=帯が0本
    const g = { ...f, farEnd: 1e-6, farStart: 0, farRefY: f.farRefY + 1e7 };
    const r = projAmbientRegion(g, 10, { left: 0, top: 0, right: 0, bottom: 0 });
    for (const v of [r.left, r.top, r.right, r.bottom]) expect(Number.isFinite(v)).toBe(true);
    expect((r.right - r.left) * (r.bottom - r.top)).toBeGreaterThanOrEqual(0);
  });
  it('projAmbientCount: 面積の比で増やし、上限2倍・減らさない', () => {
    expect(projAmbientCount(40, 0.5)).toBe(40);
    expect(projAmbientCount(40, 1.5)).toBe(60);
    expect(projAmbientCount(40, 5)).toBe(80);
    expect(projAmbientCount(40, NaN)).toBe(40);
  });
});

describe('projFx: 地面に付いた物を寝かせる(★#30)', () => {
  const o = makeProjFlatOut();
  it('閃光の輪と同じ潰し方: 横=s_fx・縦=横×縦の詰め/s・縦は横を超えない', () => {
    for (const { f } of FRAMES) {
      for (const dy of [-600, -300, -100, 0, 80, 200]) {
        const wx = 1000 + 215, wy = 2000 + f.screenH * 0.6 + dy;
        const p = projectInto(f, wx, wy, sp);
        if (!p.inDomain || p.s <= 0) continue;
        projFlatInto(f, wx, wy, o);
        expect(o.x).toBeCloseTo(p.x, 9);
        expect(o.y).toBeCloseTo(p.y, 9);
        expect(o.kx).toBeCloseTo(projFxScale(p.s), 12);
        expect(o.ky).toBeLessThanOrEqual(o.kx + 1e-12);
        expect(o.ky).toBeGreaterThanOrEqual(0);
        expect(o.kx).toBeGreaterThanOrEqual(PROJ_FX_MIN_S - 1e-12);
        expect(o.kx).toBeGreaterThanOrEqual(p.s - 1e-12); // 南も s を下回らない(全体の天井なし)
        expect(o.ky).toBeCloseTo(o.kx * o.r, 12);
        // 閃光の輪(drawRingSprite の ?proj=1)の式と同じ: kx = s × s_fx/s
        expect(o.kx).toBeCloseTo(p.s * projFxRingRadiusMul(p.s), 9);
      }
    }
  });
  it('k を渡すとその値(縦の比は同じ)', () => {
    const { f } = FRAMES[0];
    const wx = 1100, wy = 2000 + f.screenH * 0.7;
    projFlatInto(f, wx, wy, o);
    const r = o.r;
    projFlatInto(f, wx, wy, o, 0.37);
    expect(o.kx).toBe(0.37);
    expect(o.ky).toBeCloseTo(0.37 * r, 12);
  });
});

describe('projFx: 雪の奥行きの3層(★#31)', () => {
  it('総数は今の雪の2倍まで・吹雪で手前の層が増える', () => {
    for (const mid of [0, 1, 40, 180, 333]) {
      for (const b of [0, 0.5, 1, 3, NaN]) {
        const c = projSnowCounts(mid, b);
        expect(mid + c.far + c.near).toBeLessThanOrEqual(Math.floor(mid * PROJ_SNOW_TOTAL_CAP) + 1e-9);
        expect(c.far).toBeGreaterThanOrEqual(0);
        expect(c.near).toBeGreaterThanOrEqual(0);
      }
      if (mid >= 40) {
        expect(projSnowCounts(mid, 1).near).toBeGreaterThan(projSnowCounts(mid, 0).near);
        expect(projSnowCounts(mid, 0).far).toBeGreaterThan(projSnowCounts(mid, 0).near); // 奥=密・手前=まばら
      }
    }
    expect(projSnowCounts(180, 1)).toEqual({ far: 120, near: 60 });
  });
  it('層の並び: 手前ほど大きく速い・奥ほど小さく遅い', () => {
    const { near, far } = PROJ_SNOW_LAYERS;
    expect(near.sizeMin).toBeGreaterThan(far.sizeMax);
    expect(near.fall).toBeGreaterThan(1);
    expect(far.fall).toBeLessThan(1);
    expect(far.alphaMax).toBeLessThan(1);
  });
  it('落ちる向きは消失点の側へ(左の粒は左へ・右の粒は右へ・真下の粒と消失点より上は寄せない)', () => {
    expect(projSnowLeanVx(100, 500, 200, 100, 100, 0.2)).toBeLessThan(0);
    expect(projSnowLeanVx(300, 500, 200, 100, 100, 0.2)).toBeGreaterThan(0);
    expect(projSnowLeanVx(200, 500, 200, 100, 100, 0.2)).toBe(0);
    expect(projSnowLeanVx(100, 50, 200, 100, 100, 0.2)).toBe(0);
    expect(projSnowLeanVx(100, 500, 200, 100, 100, 0)).toBeCloseTo(0, 12);
    expect(Math.abs(projSnowLeanVx(-5000, 102, 200, 100, 100, 0.2))).toBeLessThanOrEqual(1.5 * 100 * 0.2 + 1e-9);
  });
});

describe('projFx: 台帳', () => {
  it('kind → 行 ID は全部台帳に在る・flash は外', () => {
    for (const id of Object.values(PROJ_FX_KINDS)) expect(PROJ_FX_ROWS[id], id).toBeDefined();
    expect(PROJ_FX_ROWS[PROJ_FX_KINDS.flash].type).toBe('exempt');
  });
  it('分類1(判定を持つ物)は k=s か形・弾は bullet', () => {
    expect(PROJ_FX_ROWS['A10'].k).toBe('s');
    expect(PROJ_FX_ROWS['A15.path'].k).toBe('s');
    expect(PROJ_FX_ROWS['B1.round'].k).toBe('bullet');
    expect(PROJ_FX_ROWS['A17.judge'].k).toBe('none');
    expect(PROJ_FX_ROWS['A1'].k).toBe('hud');
    // 監査2巡目 A-2・A-5: 爆発の絵(幅=判定の直径×1.1)と盾の壁は判定に揃える
    expect(PROJ_FX_ROWS['A18'].k).toBe('s');
    expect(PROJ_FX_ROWS['B1.wall'].k).toBe('s');
    // 監査 A-3: 判定を持つ衛星弾・放った弾・塊弾は弾の倍率、焦げ・土埃・湯気・火の粉は派手さ
    expect(PROJ_FX_ROWS['B10.bullet'].k).toBe('bullet');
    expect(PROJ_FX_ROWS['B10.fx'].k).toBe('fx');
  });
  it('★#30: 地面に接する物は形(寝かせる)・宙にある物は点のまま', () => {
    for (const id of ['A14.stain', 'A16.floor', 'B10.ground', 'D9.ground', 'D10', 'E1', 'E2', 'G5.ripple', 'D2.land', 'D2.frost', 'F2.foot', 'F2.refl', 'C10.puff'] as const) {
      expect(PROJ_FX_ROWS[id].type, id).toBe('shape');
      expect(PROJ_FX_ROWS[id].k, id).toBe('fxFlat');
    }
    for (const id of ['A14.drop', 'A13', 'A16', 'G2'] as const) expect(PROJ_FX_ROWS[id].type, id).not.toBe('shape');
  });
  it('弾の形は弾の種類の表で決める(監査 A-4・3-7d)', () => {
    expect(projBulletForm({ weaponType: 'enemy_bolt', rocketArt: false, arrowArt: false })).toBe('round');
    expect(projBulletForm({ weaponType: 'phill-bullet', rocketArt: false, arrowArt: false })).toBe('round');
    expect(projBulletForm({ weaponType: 'homing-missile', rocketArt: false, arrowArt: false })).toBe('round');
    expect(projBulletForm({ weaponType: 'grenade', rocketArt: false, arrowArt: false })).toBe('round');
    expect(projBulletForm({ weaponType: 'handgun', rocketArt: false, arrowArt: false })).toBe('x');
    expect(projBulletForm({ weaponType: 'rifle', rocketArt: false, arrowArt: false })).toBe('x');
    expect(projBulletForm({ weaponType: 'rifle', rocketArt: false, arrowArt: true })).toBe('x');
    expect(projBulletForm({ weaponType: 'rocket', rocketArt: true, arrowArt: false })).toBe('y');
    // 監査2巡目 A-5: 盾=判定を持つ壁(長手=ローカルの y)・罠/デコイ/タレット=丸い装置
    expect(projBulletForm({ weaponType: 'shield', rocketArt: false, arrowArt: false })).toBe('y');
    for (const w of ['trap', 'decoy', 'turret']) expect(projBulletForm({ weaponType: w, rocketArt: false, arrowArt: false })).toBe('round');
  });
});

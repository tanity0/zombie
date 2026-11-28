import { describe, expect, it } from 'vitest';
import {
  stage3DaylightActive, buildStage3GradeMatrix, buildStage3SkyMatrix, stage3FogTint, layoutSunShafts, sunPos,
  sunShaftShade, shaftShadeAt, gustLevel, gustTarget, dappleSway, bandBlobs, canopyBlobs, hazeAcross, hazeAlong,
  S3D_SHAFT_SPECS, S3D_SHADE_SLOT_MS, S3D_SHADE_DEPTH, S3D_SHADE_MS_MIN, S3D_SHADE_MS_MAX, S3D_GLARE_CORE_SIZE, S3D_SUN_Y_S,
  S3D_GLARE_HALO_SIZE, S3D_HAZE_LEFT, S3D_HAZE_RIGHT, S3D_SHADE_DARK_MIN, S3D_SHADE_DARK_MAX, S3D_BLOB_ANGLE,
  S3D_BLOB_ANGLE_JITTER, S3D_GUST_PX_MAX, S3D_BAND_ALPHA, S3D_CANOPY, S3D_SKY_MATRIX, type Stage3DaylightCtx,
} from './stage3Daylight';
import { applyColorMatrix } from './weatherWet';
import { stage5BattleActive } from './stage5Battlefield';
import { moonShaftLightAt } from './moonShafts';

const ID = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];
const base: Stage3DaylightCtx = { stageId: 'stage-3', indoor: false, corridor: false, farKey: 'city' };
const SCREENS = [[430, 932], [375, 667], [1280, 720], [1920, 1080]] as const;

describe('ステージ3(昼の廃都)の光と影: 効く所', () => {
  it('ステージ3の外(遠景=city)だけで効く', () => {
    expect(stage3DaylightActive(base)).toBe(true);
  });
  it('他のステージでは一切効かない(遠景が city でも=エンディング等)', () => {
    for (const stageId of ['stage-0', 'stage-1', 'stage-2', 'stage-4', 'stage-5', 'stage-6', 'stage-7', 'tutorial', 'ending', '']) {
      expect(stage3DaylightActive({ ...base, stageId })).toBe(false);
    }
  });
  it('屋内・廊下・他の遠景(エンディングの昼を含む)では効かない', () => {
    expect(stage3DaylightActive({ ...base, indoor: true })).toBe(false);
    expect(stage3DaylightActive({ ...base, corridor: true })).toBe(false);
    for (const farKey of ['forest', 'snow', 'stage5', 'ending', 'lab', 'mansion', null]) expect(stage3DaylightActive({ ...base, farKey })).toBe(false);
  });
  it('ステージ5の戦場とは同時に効かない', () => {
    expect(stage5BattleActive({ stageId: 'stage-3', indoor: false, corridor: false, farKey: 'city', daylight: true })).toBe(false);
  });
});

describe('効き具合 0 は厳密にそのまま', () => {
  it('色行列(世界・空)は単位行列', () => {
    expect(buildStage3GradeMatrix(0)).toEqual(ID);
    expect(buildStage3SkyMatrix(0)).toEqual(ID);
  });
  it('霧の色はそのまま', () => {
    for (const c of [0xffffff, 0x9ecad4, 0x123456]) expect(stage3FogTint(c, 0)).toBe(c);
  });
});

describe('日なたと日陰(スプリットトーン)', () => {
  const m = buildStage3GradeMatrix(1);
  const gray = (v: number) => applyColorMatrix(m, v, v, v);
  it('暗部〜中間は青へ(青>赤)・明部だけ金へ(赤>青)', () => {
    for (const v of [0.02, 0.1, 0.25, 0.4]) { const [r, , b] = gray(v); expect(b).toBeGreaterThan(r); }
    for (const v of [0.6, 0.8, 1]) { const [r, , b] = gray(v); expect(r).toBeGreaterThan(b); }
  });
  it('黒く潰さない: 暗い灰色(0.1)の明るさが元より下がり過ぎない', () => {
    const [r, g, b] = gray(0.1);
    expect(0.299 * r + 0.587 * g + 0.114 * b).toBeGreaterThan(0.085);
    expect(Math.min(r, g, b)).toBeGreaterThan(0.07);
  });
  it('明部の金は控えめ(白の赤は 1.12 未満・白の青は 0.9 より上)', () => {
    const [r, , b] = gray(1);
    expect(r).toBeLessThan(1.12);
    expect(b).toBeGreaterThan(0.9);
  });
  it('緑の彩度が上がる・灰色の緑は変わらない', () => {
    const grass = [0.35, 0.5, 0.25] as const;
    const [r, g, b] = applyColorMatrix(m, ...grass);
    expect(g - (r + b) / 2).toBeGreaterThan(grass[1] - (grass[0] + grass[2]) / 2);
    const noBoost = applyColorMatrix(m, 0.5, 0.5, 0.5)[1];
    const boostOnly = m[5] + m[6] + m[7];
    expect(noBoost).toBeCloseTo(0.5 * boostOnly + m[9], 6);
  });
  it('効き具合の途中は連続(1フレームで跳ばない)', () => {
    let prev = buildStage3GradeMatrix(0);
    for (let i = 1; i <= 60; i++) {
      const cur = buildStage3GradeMatrix(i / 60);
      for (let j = 0; j < 20; j++) expect(Math.abs(cur[j] - prev[j])).toBeLessThan(0.02);
      prev = cur;
    }
  });
});

describe('空と遠くのかすみ', () => {
  it('空の青は 1 以上(青空を消さない)', () => {
    expect(S3D_SKY_MATRIX[12]).toBeGreaterThanOrEqual(1);
    const [, , b] = applyColorMatrix(buildStage3SkyMatrix(1), 0.3, 0.5, 0.9);
    expect(b).toBeGreaterThanOrEqual(0.9);
  });
  it('霧のシートの色は弱い寒色寄り(青が赤より残る)', () => {
    const t = stage3FogTint(0xd0d0d0, 1);
    expect(t & 255).toBeGreaterThanOrEqual((t >> 16) & 255);
  });
  it('地平の帯は左(太陽の側)で強く右で弱い・真ん中が濃く上下へ消える', () => {
    expect(hazeAcross(0)).toBeCloseTo(S3D_HAZE_LEFT, 6);
    expect(hazeAcross(1)).toBeCloseTo(S3D_HAZE_RIGHT, 6);
    for (let u = 0.05; u <= 1; u += 0.05) expect(hazeAcross(u)).toBeLessThanOrEqual(hazeAcross(u - 0.05) + 1e-9);
    expect(hazeAlong(0.5)).toBeCloseTo(1, 6);
    expect(hazeAlong(0)).toBe(0);
    expect(hazeAlong(1)).toBe(0);
  });
});

describe('太陽', () => {
  it('画面の上端の外・体力の玉より右(縦で幅の0.35〜0.45)', () => {
    for (const [w, h] of SCREENS) {
      const p = sunPos(w, h), s = Math.min(w, h);
      expect(p.x).toBeGreaterThan(100);
      expect(p.y).toBeLessThanOrEqual(-0.05 * s);
      expect(p.y).toBeGreaterThanOrEqual(-0.1 * s);
      if (h > w) { expect(p.x / w).toBeGreaterThanOrEqual(0.35); expect(p.x / w).toBeLessThanOrEqual(0.45); }
    }
  });
  it('光の玉の芯は画面に出ない(芯の半径 < 太陽の高さ)・にじみは 0.8〜1.0', () => {
    expect(S3D_GLARE_CORE_SIZE / 2).toBeLessThan(S3D_SUN_Y_S);
    expect(S3D_GLARE_HALO_SIZE).toBeGreaterThanOrEqual(0.8);
    expect(S3D_GLARE_HALO_SIZE).toBeLessThanOrEqual(1.0);
  });
});

describe('太陽の光の筋', () => {
  it('3〜4本・主役(太い)は1〜2本・角度の間隔は不揃い', () => {
    expect(S3D_SHAFT_SPECS.length).toBeGreaterThanOrEqual(3);
    expect(S3D_SHAFT_SPECS.length).toBeLessThanOrEqual(4);
    const maxW = Math.max(...S3D_SHAFT_SPECS.map(s => s.w));
    const thick = S3D_SHAFT_SPECS.filter(s => s.w >= maxW * 0.4).length;
    expect(thick).toBeGreaterThanOrEqual(1);
    expect(thick).toBeLessThanOrEqual(2);
    const angs = [...S3D_SHAFT_SPECS].map(s => s.ang).sort((a, b) => a - b);
    const gaps = angs.slice(1).map((a, i) => a - angs[i]);
    expect(new Set(gaps).size).toBe(gaps.length);
  });
  for (const [w, h] of SCREENS) {
    it(`光の山は左上〜中段左・主人公(画面の真ん中)には集めない(${w}×${h})`, () => {
      const shafts = layoutSunShafts(w, h, 0);
      const at = (fx: number, fy: number) => moonShaftLightAt(w * fx, h * fy, shafts);
      // 主人公の周り(画面の真ん中・やや下)は弱い
      let center = 0;
      for (const fx of [0.45, 0.5, 0.55]) for (const fy of [0.5, 0.56, 0.62]) center = Math.max(center, at(fx, fy));
      expect(center).toBeLessThan(0.15);
      // 左上〜中段左のどこかは強い
      let left = 0;
      for (let fx = 0.02; fx <= 0.4; fx += 0.04) for (let fy = 0.05; fy <= 0.5; fy += 0.04) left = Math.max(left, at(fx, fy));
      expect(left).toBeGreaterThan(0.5);
    });
  }
  it('普段は一定。翳りは不規則な間隔で1本だけ・0.6〜1秒・70%まで・滑らか', () => {
    const starts: number[] = [];
    for (let k = 0; k < 200; k++) {
      const e = shaftShadeAt(k);
      if (!e) continue;
      expect(e.dur).toBeGreaterThanOrEqual(S3D_SHADE_MS_MIN);
      expect(e.dur).toBeLessThanOrEqual(S3D_SHADE_MS_MAX);
      expect(e.start).toBeGreaterThanOrEqual(k * S3D_SHADE_SLOT_MS);
      expect(e.start + e.dur).toBeLessThanOrEqual((k + 1) * S3D_SHADE_SLOT_MS);
      starts.push(e.start);
    }
    const gaps = starts.slice(1).map((s, i) => s - starts[i]);
    expect(Math.min(...gaps)).toBeLessThan(5000);
    expect(Math.max(...gaps)).toBeGreaterThan(12000);
    for (let t = 0; t < 120000; t += 16) {
      let dimmed = 0;
      for (let i = 0; i < S3D_SHAFT_SPECS.length; i++) {
        const v = sunShaftShade(i, t);
        expect(v).toBeGreaterThanOrEqual(S3D_SHADE_DEPTH - 1e-9);
        expect(v).toBeLessThanOrEqual(1);
        expect(Math.abs(v - sunShaftShade(i, t + 16))).toBeLessThan(0.03);
        if (v < 1) dimmed++;
      }
      expect(dimmed).toBeLessThanOrEqual(1);
    }
  });
});

describe('木漏れ日', () => {
  it('斑は決め打ち・暗さは 0.75〜0.85・細長さと向きは斑ごとに違う(±25°)', () => {
    for (const set of [bandBlobs(256, 256, 11), canopyBlobs(128, 101)]) {
      const ratios = new Set<number>(), rots = new Set<number>();
      for (const b of set.shade) {
        expect(b.dark).toBeGreaterThanOrEqual(S3D_SHADE_DARK_MIN);
        expect(b.dark).toBeLessThanOrEqual(S3D_SHADE_DARK_MAX);
      }
      for (const b of [...set.shade, ...set.spots]) {
        const r = b.rx / b.ry;
        expect(r).toBeGreaterThanOrEqual(1 - 1e-9);
        expect(r).toBeLessThanOrEqual(2.2 + 1e-9);
        expect(Math.abs(b.rot - S3D_BLOB_ANGLE)).toBeLessThanOrEqual(S3D_BLOB_ANGLE_JITTER + 1e-9);
        ratios.add(Math.round(r * 100)); rots.add(Math.round(b.rot * 100));
      }
      expect(ratios.size).toBeGreaterThan(5);
      expect(rots.size).toBeGreaterThan(5);
      // 小さく硬い斑と大きく柔らかい斑が混ざる
      expect(set.shade.some(b => b.soft < 0.4)).toBe(true);
      expect(set.shade.some(b => b.soft > 0.6)).toBe(true);
    }
    expect(bandBlobs(256, 256, 11)).toEqual(bandBlobs(256, 256, 11));
  });
  it('縁の帯の影は縁に寄る(縁に近い半分に多い)', () => {
    const { shade } = bandBlobs(256, 256, 11);
    expect(shade.filter(b => b.y < 128).length).toBeGreaterThan(shade.length * 0.65);
  });
  it('乗算の濃さは 0.4〜0.5', () => {
    for (const a of [S3D_BAND_ALPHA, S3D_CANOPY.alpha]) { expect(a).toBeGreaterThanOrEqual(0.4); expect(a).toBeLessThanOrEqual(0.5); }
  });
  it('流れない: 無風の区切りでは動かない。突風の時だけ 2〜10px・滑らか', () => {
    let calm = 0, gust = 0;
    for (let k = 0; k < 200; k++) {
      if (gustTarget(k) === 0) calm++;
      else gust++;
    }
    expect(calm).toBeGreaterThan(40);
    expect(gust).toBeGreaterThan(40);
    let maxAmp = 0;
    let prev = dappleSway(0);
    for (let t = 16; t < 200000; t += 16) {
      const g = gustLevel(t);
      const s = dappleSway(t);
      if (g === 0) { expect(s.x).toBe(0); expect(s.y).toBe(0); }
      maxAmp = Math.max(maxAmp, Math.hypot(s.x, s.y));
      expect(Math.hypot(s.x - prev.x, s.y - prev.y)).toBeLessThan(0.6);
      prev = s;
    }
    expect(maxAmp).toBeGreaterThan(5);
    expect(maxAmp).toBeLessThanOrEqual(S3D_GUST_PX_MAX * 1.1);
  });
});

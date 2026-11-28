// 作戦室の地図のボスの顔の札(どのステージか)の、当たり・開閉・置き場所。
import { describe, it, expect } from 'vitest';
import { pickMapFace, nextOpenMapFace, placeMapSpotTag, mapTagLeadLine, estimateTagTextWidth, type MapFaceHit } from './mapFaceTag';
import { layoutMapFaces, type MapBossFace } from './sortieMapBosses';
import { OPS_MAP_H, OPS_MAP_PLACES, OPS_MAP_W } from '../data/opsMapPlaces';

const faces: MapFaceHit[] = [{ key: 'a', x: 100, y: 100 }, { key: 'b', x: 210, y: 100 }];

describe('当たり', () => {
  it('見た目の丸より大きい正方形で当たる', () => {
    expect(pickMapFace(faces, 100 + 79, 100 - 79, 80)).toBe('b'); // a の当たりの隅だが b の方が近い
    expect(pickMapFace(faces, 100 - 79, 100 + 79, 80)).toBe('a');
    expect(pickMapFace(faces, 100 - 81, 100, 80)).toBeNull();
  });
  it('当たりが重なる所は中心が近い方', () => {
    expect(pickMapFace(faces, 154, 100, 80)).toBe('a');
    expect(pickMapFace(faces, 156, 100, 80)).toBe('b');
  });
});

describe('開閉', () => {
  it('同じ顔をもう一度で閉じる・別の顔で切り替え・何も無い所で閉じる', () => {
    expect(nextOpenMapFace(null, faces, 100, 100, 80, null)).toBe('a');
    expect(nextOpenMapFace('a', faces, 100, 100, 80, null)).toBeNull();
    expect(nextOpenMapFace('a', faces, 210, 100, 80, null)).toBe('b');
    expect(nextOpenMapFace('a', faces, 900, 900, 80, null)).toBeNull();
    expect(nextOpenMapFace(null, faces, 900, 900, 80, null)).toBeNull();
  });
  it('開いている札そのものを押したら、下に隣の顔があっても閉じる', () => {
    expect(nextOpenMapFace('a', faces, 210, 100, 80, { l: 150, t: 60, w: 200, h: 80 })).toBeNull();
  });
});

describe('札の置き場所(場所=列ごとに1つ)', () => {
  const base = { markHalf: 17, reachUp: 69, reachDown: 56, w: 300, h: 75, gap: 20, mapW: 1816, mapH: 866, margin: 10 };
  it('列が点の下なら、場所の点の真上', () => {
    const p = placeMapSpotTag({ ...base, at: [900, 400], rowL: 700, rowR: 1200, rowY: 490, below: true });
    expect(p).toEqual({ l: 750, t: 400 - 17 - 20 - 75, w: 300, h: 75, below: false });
  });
  it('列が点の上なら、列の中心の真上(上の刻みの先から間を空けて)', () => {
    const p = placeMapSpotTag({ ...base, at: [900, 500], rowL: 700, rowR: 1300, rowY: 400, below: false });
    expect(p.l).toBe(1000 - 150);
    expect(p.t + p.h).toBe(400 - 69 - 20);
    expect(p.below).toBe(false);
  });
  it('上端で上に入らない時は、列と点の両方より下', () => {
    const p = placeMapSpotTag({ ...base, at: [900, 60], rowL: 700, rowR: 1200, rowY: 150, below: true });
    expect(p.below).toBe(true);
    expect(p.t).toBe(150 + 56 + 20);
  });
  it('右端・左端に近い場所は内へ寄せる', () => {
    expect(placeMapSpotTag({ ...base, at: [1800, 400], rowL: 1500, rowR: 1816, rowY: 490, below: true }).l + 300).toBe(1816 - 10);
    expect(placeMapSpotTag({ ...base, at: [5, 400], rowL: 0, rowR: 300, rowY: 490, below: true }).l).toBe(10);
  });
  it('引き線: 根元は顔の真上の刻みの先、先は札の下辺(札を寄せても根元は動かない)', () => {
    const tag = { l: 1506, t: 200, w: 300, h: 75, below: false };
    expect(mapTagLeadLine(1780, 400, 69, 56, tag, 15)).toEqual({ x1: 1780, y1: 331, x2: 1780, y2: 275 });
    expect(mapTagLeadLine(1300, 400, 69, 56, tag, 15)).toEqual({ x1: 1300, y1: 331, x2: 1521, y2: 275 });
    expect(mapTagLeadLine(1600, 100, 69, 56, { ...tag, t: 180, below: true }, 15)).toEqual({ x1: 1600, y1: 156, x2: 1600, y2: 180 });
  });
  it('文字の幅: 全角は字の大きさ・半角は細い', () => {
    expect(estimateTagTextWidth('洞窟地帯', 50)).toBe(200);
    expect(estimateTagTextWidth('EX 洋館', 50, 3)).toBeCloseTo(3 * 31 + 2 * 50 + 4 * 3);
  });
  it('実際の地図の全地点で、札が地図の中に収まり、印・顔の列に被らない側(上)に出る', () => {
    const U = 5, D = 20 * U, R = D / 2, RIM = R + 1.1 * U;
    const ids = Object.keys(OPS_MAP_PLACES);
    const list: MapBossFace[] = ids.flatMap(id => [0, 1, 2, 3].map(i => ({ key: `${id}-${i}`, stageId: id, sprite: 'mimir' })));
    const spots = layoutMapFaces(list, id => { const at = OPS_MAP_PLACES[id]; return at ? [at[0] * OPS_MAP_W, at[1] * OPS_MAP_H] as const : undefined; },
      { diameter: D, gap: 2.5 * U, offset: 6 * U, mapW: OPS_MAP_W, mapH: OPS_MAP_H, moreW: 11 * U, markHalf: 3.4 * U });
    for (const s of spots) {
      const w = estimateTagTextWidth('PHILL再生医療研究所', 10 * U, 1.2 * U) + 6 * U;
      const p = placeMapSpotTag({ at: s.at, markHalf: 3.4 * U, rowL: s.faces[0].x - RIM, rowR: s.faces[s.faces.length - 1].x + RIM, rowY: s.faces[0].y, below: s.below,
        reachUp: RIM + 1.6 * U, reachDown: RIM, w, h: 15 * U, gap: 4 * U, mapW: OPS_MAP_W, mapH: OPS_MAP_H, margin: 2 * U });
      expect(p.l).toBeGreaterThanOrEqual(0); expect(p.l + p.w).toBeLessThanOrEqual(OPS_MAP_W);
      expect(p.t).toBeGreaterThanOrEqual(0); expect(p.t + p.h).toBeLessThanOrEqual(OPS_MAP_H);
      for (const f of s.faces) {
        const ln = mapTagLeadLine(f.x, f.y, RIM + 1.6 * U, RIM, p, 3 * U);
        expect(p.below ? ln.y2 >= ln.y1 : ln.y2 <= ln.y1).toBe(true);
      }
    }
  });
});

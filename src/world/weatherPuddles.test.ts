import { describe, it, expect, afterEach } from 'vitest';
import {
  puddlesInRegion, isInPuddle, puddleAt, PUDDLE_SAFE_RADIUS, PUDDLE_TREE_CLEAR, PUDDLE_TORCH_CLEAR, PUDDLE_BASE_PAD,
  PUDDLE_ART_SIZE, PUDDLE_VARIANTS, PUDDLE_ART_SCALE,
  PUDDLE_TREE_ART_HALF_W, PUDDLE_TREE_ART_H, PUDDLE_FLOWER_ART_ASPECT, puddleTreeArt, PUDDLE_WATER_ONLY_RATE, ellipseHitsPropArt,
} from './weatherPuddles';
import { forestFlowersInRegion, FLOWER_DISPLAY_H } from './forestDecor';
import { treesInRegion } from './trees';
import { torchesInRegion } from './torches';
import { setPoiClearings, isInPoiClearing } from './poiClearings';
import { setHandPlacedAnchors, beginPropPlacementSortie } from './propPlacement';
import { STAGE1_TREE_SKIN } from './artRects';

const R = [-3000, -3000, 3000, 3000] as const;

describe('weatherPuddles(雨上がりの水たまり配置)', () => {
  afterEach(() => { setPoiClearings([]); setHandPlacedAnchors([]); });

  it('決まった乱数: 同じ範囲は毎回同じ配置', () => {
    const a = puddlesInRegion(...R);
    const b = puddlesInRegion(...R);
    expect(a.length).toBeGreaterThan(20);
    expect(b).toEqual(a);
  });

  it('範囲を変えても同じ場所の水たまりは同じ(区画で決まる)', () => {
    const big = new Map(puddlesInRegion(...R).map(p => [p.id, p]));
    for (const p of puddlesInRegion(-600, -600, 600, 600)) {
      const q = big.get(p.id);
      if (q) expect(q).toEqual(p);
    }
  });

  it('出撃地点の周りは空いている', () => {
    for (const p of puddlesInRegion(...R)) expect(Math.hypot(p.x, p.y)).toBeGreaterThanOrEqual(PUDDLE_SAFE_RADIUS);
  });

  it('木と松明の足元を避ける', () => {
    for (const p of puddlesInRegion(...R)) {
      for (const t of treesInRegion(p.x - 300, p.y - 300, p.x + 300, p.y + 300)) {
        expect(Math.hypot(t.footX - p.x, (t.footY - p.y) * 1.6)).toBeGreaterThanOrEqual(p.rx + PUDDLE_TREE_CLEAR * t.scale);
      }
      for (const t of torchesInRegion(p.x - 300, p.y - 300, p.x + 300, p.y + 300)) {
        expect(Math.hypot(t.footX - p.x, (t.footY - p.y) * 1.6)).toBeGreaterThanOrEqual(p.rx + PUDDLE_TORCH_CLEAR);
      }
    }
  });

  it('拠点の円とPOIの空き地を避ける', () => {
    const bases = [{ x: 900, y: 400, r: 130 }, { x: -1200, y: -800, r: 130 }];
    const poi = { x: 1500, y: -1400 };
    setPoiClearings([poi]);
    setHandPlacedAnchors(bases.map(b => ({ kind: 'circle' as const, ...b }))); // 拠点の円は手置きの物として渡す(§3 で一本化)
    const list = puddlesInRegion(...R);
    for (const p of list) {
      for (const b of bases) expect(Math.hypot(b.x - p.x, b.y - p.y)).toBeGreaterThanOrEqual(b.r + PUDDLE_BASE_PAD + p.rx);
      expect(isInPoiClearing(p.x, p.y)).toBe(false);
    }
    // 拠点を渡さない時より増えない(避けている証拠は上の距離の検査)。木を2倍にした(2026-11-22)後は、拠点の周りがもともと
    // 大きな木の絵で埋まって水たまりが置けず、渡しても渡さなくても同数になる区画がある=「減る」ではなく「増えない」で見る。
    setPoiClearings([]);
    setHandPlacedAnchors([]);
    expect(list.length).toBeLessThanOrEqual(puddlesInRegion(...R).length);
  });

  it('楕円の大きさは絵の寸法×倍率から出る', () => {
    for (const p of puddlesInRegion(...R)) {
      expect(PUDDLE_VARIANTS).toContain(p.variant);
      const art = PUDDLE_ART_SIZE[p.variant];
      expect(p.rx).toBeCloseTo((art.w / 2) * PUDDLE_ART_SCALE * p.scale, 6);
      expect(p.ry).toBeCloseTo((art.h / 2) * PUDDLE_ART_SCALE * p.scale, 6);
      expect(p.debris.length).toBeLessThanOrEqual(2);
    }
  });

  it('踏んだ判定: 中心は中、楕円の外は外', () => {
    const p = { x: 100, y: 50, rx: 40, ry: 20 };
    expect(isInPuddle(p, 100, 50)).toBe(true);
    expect(isInPuddle(p, 100 + 30, 50)).toBe(true);
    expect(isInPuddle(p, 100 + 35, 50)).toBe(false);
    expect(isInPuddle(p, 100, 50 + 17)).toBe(false);
    expect(puddleAt([p], 100, 50)).toBe(p);
    expect(puddleAt([p], 0, 0)).toBeNull();
  });

  // 木の絵の種類ごと: 枯れ木('')と、ステージ1/7 の葉付きの3本(大きい・足元が絵の中心からずれる)。
  for (const skin of ['', STAGE1_TREE_SKIN]) {
    it(`木の絵(足元から上へ立つ幹・根・枝)の範囲に水たまりが掛からない(木の絵: ${skin || '枯れ木'})`, () => {
      beginPropPlacementSortie('', skin);
      try {
        const list = puddlesInRegion(...R);
        expect(list.length).toBeGreaterThan(20);
        for (const p of list) {
          for (const t of treesInRegion(p.x - 600, p.y - 600, p.x + 600, p.y + 600)) {
            const a = puddleTreeArt(t);
            expect(ellipseHitsPropArt(p.x, p.y, p.rx, p.ry, a.cx, a.bottom, a.halfW, a.h)).toBe(false);
            // 素朴な確認: 木の絵の真上(幹の根元〜枝葉)に水たまりの中心は無い
            expect(Math.abs(p.x - a.cx) < a.halfW && p.y < a.bottom && p.y > a.bottom - a.h).toBe(false);
          }
        }
      } finally {
        beginPropPlacementSortie('');
      }
    });
  }

  it('枯れ木の絵の範囲(定数)は木の絵の台帳と同じ寸法', () => {
    const a = puddleTreeArt({ footX: 0, footY: 0, scale: 1, variant: 0 }, '');
    expect(Math.ceil(a.halfW)).toBe(PUDDLE_TREE_ART_HALF_W);
    expect(Math.ceil(a.h)).toBe(PUDDLE_TREE_ART_H);
    expect(a.cx).toBe(0);
    expect(a.bottom).toBe(0);
  });

  it('ステージ1の花の絵の範囲に水たまりが掛からない(花の足元に重ならない)', () => {
    const list = puddlesInRegion(...R);
    let checked = 0;
    for (const p of list) {
      for (const f of forestFlowersInRegion('stage-1', p.x - 600, p.y - 600, p.x + 600, p.y + 600)) {
        const fh = FLOWER_DISPLAY_H * f.scale;
        expect(ellipseHitsPropArt(p.x, p.y, p.rx, p.ry, f.footX, f.footY, fh * PUDDLE_FLOWER_ART_ASPECT * 0.5, fh)).toBe(false);
        expect(isInPuddle(p, f.footX, f.footY)).toBe(false);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(50);
  });

  it('絵の範囲の判定: 足元の真上は掛かる・離れた所は掛からない', () => {
    expect(ellipseHitsPropArt(0, -60, 40, 20, 0, 0, 60, 133)).toBe(true); // 幹の途中
    expect(ellipseHitsPropArt(0, 10, 40, 20, 0, 0, 60, 133)).toBe(true);  // 足元のすぐ手前
    expect(ellipseHitsPropArt(400, 0, 40, 20, 0, 0, 60, 133)).toBe(false);
    expect(ellipseHitsPropArt(0, 200, 40, 20, 0, 0, 60, 133)).toBe(false);
  });

  it('水面だけの薄い膜が決まった割合で混ざる(縁も小物も無い・毎回同じ)', () => {
    const a = puddlesInRegion(...R);
    const wo = a.filter(p => p.waterOnly);
    expect(wo.length).toBeGreaterThan(a.length * (PUDDLE_WATER_ONLY_RATE - 0.12));
    expect(wo.length).toBeLessThan(a.length * (PUDDLE_WATER_ONLY_RATE + 0.12));
    for (const p of wo) expect(p.debris).toEqual([]);
    expect(puddlesInRegion(...R).filter(p => p.waterOnly).map(p => p.id)).toEqual(wo.map(p => p.id));
    // 縁が無いぶん、踏んだ判定は楕円の内側 90% まで
    const q = { x: 0, y: 0, rx: 40, ry: 20, waterOnly: true };
    expect(isInPuddle(q, 34, 0)).toBe(true);
    expect(isInPuddle({ ...q, waterOnly: false }, 34, 0)).toBe(false);
  });
});

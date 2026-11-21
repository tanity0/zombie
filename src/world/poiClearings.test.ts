import { afterEach, describe, expect, it } from 'vitest';
import { setPoiClearings, isInPoiClearing, POI_CLEARING_FRONT, POI_CLEARING_HALF_W } from './poiClearings';
import { treesInRegion } from './trees';
import { torchesInRegion } from './torches';
import { forestFlowersInRegion } from './forestDecor';

// 社長指示2026-11-03「祠含めてPOIの目の前は空き地で」。
describe('POIの前の空き地', () => {
  afterEach(() => setPoiClearings([]));

  it('正面と左右は空き地・奥や遠くは空き地ではない', () => {
    setPoiClearings([{ x: 5000, y: 3000 }, null]);
    expect(isInPoiClearing(5000, 3000 + POI_CLEARING_FRONT - 1)).toBe(true);
    expect(isInPoiClearing(5000 + POI_CLEARING_HALF_W - 1, 3010)).toBe(true);
    expect(isInPoiClearing(5000, 3000 - 200)).toBe(false);
    expect(isInPoiClearing(5000, 3000 + POI_CLEARING_FRONT + 20)).toBe(false);
    expect(isInPoiClearing(5000 + POI_CLEARING_HALF_W + 20, 3010)).toBe(false);
  });

  it('空き地の中には木・松明・花が生えない(描画と当たり判定が同じ生成を使う)', () => {
    // 広く見て、空き地が無ければ中に何かある配置を選ぶ(決定的散布なので一度見つければ固定)。
    let found: { x: number; y: number } | null = null;
    for (let gx = 0; gx < 40 && !found; gx++) {
      const c = { x: 2000 + gx * 700, y: 3000 };
      const b2 = [c.x - POI_CLEARING_HALF_W, c.y, c.x + POI_CLEARING_HALF_W, c.y + POI_CLEARING_FRONT];
      const any = treesInRegion(b2[0] - 300, b2[1] - 300, b2[2] + 300, b2[3] + 300).some(t => t.footX >= b2[0] && t.footX <= b2[2] && t.footY >= b2[1] && t.footY <= b2[3]);
      if (any) found = c;
    }
    expect(found).not.toBeNull();
    setPoiClearings([found!]);
    const b = [found!.x - POI_CLEARING_HALF_W, found!.y, found!.x + POI_CLEARING_HALF_W, found!.y + POI_CLEARING_FRONT] as const;
    const inside = (p: { footX: number; footY: number }) => p.footX >= b[0] && p.footX <= b[2] && p.footY >= b[1] && p.footY <= b[3];
    expect(treesInRegion(b[0] - 300, b[1] - 300, b[2] + 300, b[3] + 300).some(inside)).toBe(false);
    expect(torchesInRegion(b[0] - 500, b[1] - 500, b[2] + 500, b[3] + 500).some(inside)).toBe(false);
    expect(forestFlowersInRegion('stage-1', b[0] - 400, b[1] - 400, b[2] + 400, b[3] + 400).some(inside)).toBe(false);
  });
});

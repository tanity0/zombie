import { describe, it, expect } from 'vitest';
import { screenToCameraLocal } from './viewTransform';

describe('画面→ワールドの変換(PC のマウス照準)', () => {
  it('等倍では従来どおり(画面座標そのまま)', () => {
    expect(screenToCameraLocal(300, 200, { zoom: 1, offX: 0, offY: 0 })).toEqual({ x: 300, y: 200 });
  });
  it('拡大と位置を戻す(worldGroup: 画面 = ローカル×zoom + off の逆)', () => {
    const t = { zoom: 1.25, offX: 640 * (1 - 1.25), offY: 360 * (1 - 1.25) };
    const local = { x: 500, y: 100 };
    const sx = local.x * t.zoom + t.offX, sy = local.y * t.zoom + t.offY;
    const back = screenToCameraLocal(sx, sy, t);
    expect(back.x).toBeCloseTo(local.x, 6);
    expect(back.y).toBeCloseTo(local.y, 6);
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { resetRunRoute, recordRoutePoint, currentRoute, ROUTE_SAMPLE_MS, ROUTE_JUMP_PX, ROUTE_RAW_CAP } from './runRoutes';

describe('今回の出撃で歩いた道(THEONE_ROUND2 §2-6)', () => {
  beforeEach(() => resetRunRoute());

  it('間隔と移動量の条件を満たした時だけ記録する', () => {
    expect(recordRoutePoint(0, 0, 0)).toBe(true);
    expect(recordRoutePoint(ROUTE_SAMPLE_MS - 1, 500, 0)).toBe(false); // 早すぎ
    expect(recordRoutePoint(ROUTE_SAMPLE_MS, 10, 0)).toBe(false);       // 動いていない
    expect(recordRoutePoint(ROUTE_SAMPLE_MS * 2, 200, 0)).toBe(true);
    expect(currentRoute()).toEqual([[[0, 0], [200, 0]]]);
  });

  it('素早い移動(瞬間移動)の所で線が切れる', () => {
    recordRoutePoint(0, 0, 0); recordRoutePoint(ROUTE_SAMPLE_MS, 200, 0);
    recordRoutePoint(ROUTE_SAMPLE_MS * 2, 200 + ROUTE_JUMP_PX + 10, 0); recordRoutePoint(ROUTE_SAMPLE_MS * 3, 1600, 300);
    expect(currentRoute()).toEqual([[[0, 0], [200, 0]], [[1410, 0], [1600, 300]]]);
  });

  it('上限に当たっても記録は続き、最後の点は今の位置', () => {
    for (let i = 0; i <= ROUTE_RAW_CAP + 10; i++) recordRoutePoint(i * ROUTE_SAMPLE_MS, i * 50, 0);
    const pts = currentRoute().flat();
    expect(pts.length).toBeLessThanOrEqual(ROUTE_RAW_CAP);
    expect(pts[pts.length - 1]).toEqual([(ROUTE_RAW_CAP + 10) * 50, 0]);
  });

  it('次の出撃で記録は空', () => {
    recordRoutePoint(0, 0, 0); recordRoutePoint(ROUTE_SAMPLE_MS, 300, 0);
    resetRunRoute();
    expect(currentRoute()).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import { pickSafeKatanaDashDirection } from './katanaLanding';

const common = {
  startX: -20,
  startY: 0,
  actorWidth: 20,
  actorHeight: 20,
  dashDistance: 154,
  hitHalfWidth: 26,
};

describe('守護霊一閃の安全な着地点', () => {
  it('正面着地が安全なら対象へ真っ直ぐ一閃する', () => {
    const dir = pickSafeKatanaDashDirection({
      ...common,
      target: { id: 'boss', centerX: 60, centerY: 0, strikeWidth: 40 },
      enemyRects: [{ id: 'boss', x: 40, y: -20, width: 40, height: 40 }],
    });
    expect(dir).not.toBeNull();
    expect(dir!.x).toBeCloseTo(1, 6);
    expect(dir!.y).toBeCloseTo(0, 6);
  });

  it('正面が巨体の内側なら、斬撃を当てられる安全な斜め着地へ変える', () => {
    const dir = pickSafeKatanaDashDirection({
      ...common,
      target: { id: 'boss', centerX: 110, centerY: 0, strikeWidth: 220 },
      enemyRects: [{ id: 'boss', x: 0, y: -60, width: 220, height: 120 }],
    });
    expect(dir).not.toBeNull();
    expect(Math.abs(dir!.y)).toBeGreaterThan(0.5);
    const landingX = common.startX + dir!.x * common.dashDistance;
    const landingY = common.startY + dir!.y * common.dashDistance;
    expect(landingX < -16 || landingX > 236 || landingY < -76 || landingY > 76).toBe(true);
  });

  it('候補の着地点がすべて敵判定内なら発動を見送る', () => {
    const dir = pickSafeKatanaDashDirection({
      ...common,
      target: { id: 'boss', centerX: 60, centerY: 0, strikeWidth: 40 },
      enemyRects: [
        { id: 'boss', x: 40, y: -20, width: 40, height: 40 },
        { id: 'surround', x: -220, y: -220, width: 440, height: 440 },
      ],
    });
    expect(dir).toBeNull();
  });

  it('円形アリーナでは、円内へクランプされた実着地点で安全性を見る', () => {
    const dir = pickSafeKatanaDashDirection({
      ...common,
      target: { id: 'boss', centerX: 60, centerY: 0, strikeWidth: 40 },
      enemyRects: [
        { id: 'boss', x: 40, y: -20, width: 40, height: 40 },
        // 正面終点は本来x=134だが、半径80の円でx=70へ戻され、この敵へ重なる。
        { id: 'edge-enemy', x: 60, y: -20, width: 30, height: 40 },
      ],
      arena: { x: 0, y: 0, radius: 80 },
    });
    expect(dir).toBeNull();
  });
});

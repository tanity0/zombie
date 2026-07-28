// 警察署(PACING_PUZZLE.md §6.24 M48。旧称「研究施設跡」)の純関数。アリーナ方式(dwellなし)
// なので、位置/距離の不変条件と「近づいた判定(isNearPolice)」を重点的に見る。
import { describe, it, expect } from 'vitest';
import {
  POLICE_DIST, POLICE_ARENA_RADIUS, POLICE_HITBOX_W, POLICE_HITBOX_H,
  policePos, policeRect, resolvePoliceCollision, isNearPolice,
} from './police';
import { AREA_THRESHOLDS } from '../utils/enemyUtils';
import { detourPosForSector } from './detourPoi';
import { poiSectorIndex } from './pois';

describe('policePos(研究対象区域の中間・§6.24)', () => {
  it('距離は研究対象区域の中間(2250)', () => {
    expect(POLICE_DIST).toBe((AREA_THRESHOLDS[0] + AREA_THRESHOLDS[1]) / 2);
    expect(POLICE_DIST).toBe(2250);
    for (const sector of [0, 1, 2, 3]) {
      expect(Math.hypot(policePos(sector).x, policePos(sector).y)).toBeCloseTo(POLICE_DIST, 6);
    }
  });

  it('detourPoi.ts の detourPosForSector(police, sector) と一致する', () => {
    for (const sector of [0, 1, 2, 3]) {
      const p = policePos(sector);
      const expected = detourPosForSector('police', sector);
      expect(p.x).toBeCloseTo(expected.x, 6);
      expect(p.y).toBeCloseTo(expected.y, 6);
    }
  });

  it('割り当てられたセクターに属する(=矢印の解放判定と実体が一致する)', () => {
    for (const sector of [0, 1, 2, 3]) expect(poiSectorIndex(policePos(sector))).toBe(sector);
  });
});

describe('POLICE_ARENA_RADIUS(§6.24 F1: 既存の囲いイベント半径=240をそのまま流用)', () => {
  it('240', () => {
    expect(POLICE_ARENA_RADIUS).toBe(240);
  });
});

describe('policeRect / resolvePoliceCollision(足元基準の矩形)', () => {
  it('当たり判定の下端=足元(obstacles.ts の規約)', () => {
    const r = policeRect({ x: 100, y: 200 });
    expect(r.y + r.height).toBeCloseTo(200, 6);
    expect(r.x + r.width / 2).toBeCloseTo(100, 6);
    expect(r.width).toBe(POLICE_HITBOX_W);
    expect(r.height).toBe(POLICE_HITBOX_H);
  });

  it('土台に潜り込んだ矩形は押し出される', () => {
    const pos = { x: 0, y: 0 };
    const inside = { x: -10, y: -50, width: 28, height: 28 };
    const out = resolvePoliceCollision(inside, pos, false);
    expect(out.x !== inside.x || out.y !== inside.y).toBe(true);
  });

  it('入手後(taken)/位置なし(null)は素通りする', () => {
    const inside = { x: -10, y: -50, width: 28, height: 28 };
    expect(resolvePoliceCollision(inside, { x: 0, y: 0 }, true)).toEqual({ x: inside.x, y: inside.y });
    expect(resolvePoliceCollision(inside, null, false)).toEqual({ x: inside.x, y: inside.y });
  });
});

describe('isNearPolice(近づいたらアリーナ発生・サークル/滞在は使わない)', () => {
  const pos = { x: 1500, y: -700 };
  const player = (cx: number, cy: number) => ({ x: cx - 14, y: cy - 14, width: 28, height: 28 });

  it('半径内なら true / 外なら false(境界は含む)', () => {
    expect(isNearPolice(player(pos.x, pos.y), pos)).toBe(true);
    expect(isNearPolice(player(pos.x + POLICE_ARENA_RADIUS, pos.y), pos)).toBe(true);
    expect(isNearPolice(player(pos.x + POLICE_ARENA_RADIUS + 1, pos.y), pos)).toBe(false);
  });

  it('警察署が無い出撃(null)は常に false', () => {
    expect(isNearPolice(player(0, 0), null)).toBe(false);
  });

  it('半径を明示指定できる(既定=POLICE_ARENA_RADIUS)', () => {
    expect(isNearPolice(player(pos.x + 50, pos.y), pos, 50)).toBe(true);
    expect(isNearPolice(player(pos.x + 51, pos.y), pos, 50)).toBe(false);
  });
});

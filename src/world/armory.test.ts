// 武器庫(PACING_PUZZLE.md §6.24 M48)の純関数。病院と同じ枠組みの流用なので、位置/距離の
// 不変条件と、病院と違うところ(スクラップ支払いの入り口=dwell完了フラグ)だけを重点的に見る。
import { describe, it, expect } from 'vitest';
import {
  ARMORY_DIST, ARMORY_CIRCLE_RADIUS, ARMORY_DWELL_MS, ARMORY_HITBOX_W, ARMORY_HITBOX_H, ARMORY_SCRAP_COST,
  armoryPos, armoryRect, resolveArmoryCollision, isInArmoryCircle, tickArmoryDwell,
} from './armory';
import { AREA_THRESHOLDS } from '../utils/enemyUtils';
import { detourPosForSector } from './detourPoi';
import { poiSectorIndex } from './pois';

const player = (cx: number, cy: number) => ({ x: cx - 14, y: cy - 14, width: 28, height: 28 });

describe('armoryPos(デンジャーゾーンの中間・§6.24)', () => {
  it('距離はデンジャーゾーンの中間(4000)', () => {
    expect(ARMORY_DIST).toBe((AREA_THRESHOLDS[1] + AREA_THRESHOLDS[2]) / 2);
    expect(ARMORY_DIST).toBe(4000);
    for (const sector of [0, 1, 2, 3]) {
      expect(Math.hypot(armoryPos(sector).x, armoryPos(sector).y)).toBeCloseTo(ARMORY_DIST, 6);
    }
  });

  it('detourPoi.ts の detourPosForSector(armory, sector) と一致する', () => {
    for (const sector of [0, 1, 2, 3]) {
      const p = armoryPos(sector);
      const expected = detourPosForSector('armory', sector);
      expect(p.x).toBeCloseTo(expected.x, 6);
      expect(p.y).toBeCloseTo(expected.y, 6);
    }
  });

  it('割り当てられたセクターに属する(=矢印の解放判定と実体が一致する)', () => {
    for (const sector of [0, 1, 2, 3]) expect(poiSectorIndex(armoryPos(sector))).toBe(sector);
  });
});

describe('ARMORY_SCRAP_COST(§6.24 E1)', () => {
  it('100スクラップ(社長裁定v0.25.2350の200→社長指示v0.25.2425で100・v0.25.3173で再確認)', () => {
    expect(ARMORY_SCRAP_COST).toBe(100);
  });
});

describe('armoryRect / resolveArmoryCollision(足元基準の矩形)', () => {
  it('当たり判定の下端=足元(obstacles.ts の規約)', () => {
    const r = armoryRect({ x: 100, y: 200 });
    expect(r.y + r.height).toBeCloseTo(200, 6);
    expect(r.x + r.width / 2).toBeCloseTo(100, 6);
    expect(r.width).toBe(ARMORY_HITBOX_W);
    expect(r.height).toBe(ARMORY_HITBOX_H);
  });

  it('土台に潜り込んだ矩形は押し出される', () => {
    const pos = { x: 0, y: 0 };
    const inside = { x: -10, y: -50, width: 28, height: 28 };
    const out = resolveArmoryCollision(inside, pos, false);
    expect(out.x !== inside.x || out.y !== inside.y).toBe(true);
  });

  it('入手後(taken)/位置なし(null)は素通りする', () => {
    const inside = { x: -10, y: -50, width: 28, height: 28 };
    expect(resolveArmoryCollision(inside, { x: 0, y: 0 }, true)).toEqual({ x: inside.x, y: inside.y });
    expect(resolveArmoryCollision(inside, null, false)).toEqual({ x: inside.x, y: inside.y });
  });
});

describe('isInArmoryCircle(病院と同じ半径95・§6.24 A4)', () => {
  const pos = { x: -2000, y: 800 };
  it('中心が半径内なら true / 外なら false(境界は含む)', () => {
    expect(ARMORY_CIRCLE_RADIUS).toBe(95);
    expect(isInArmoryCircle(player(pos.x, pos.y), pos)).toBe(true);
    expect(isInArmoryCircle(player(pos.x + ARMORY_CIRCLE_RADIUS, pos.y), pos)).toBe(true);
    expect(isInArmoryCircle(player(pos.x + ARMORY_CIRCLE_RADIUS + 1, pos.y), pos)).toBe(false);
  });
  it('武器庫が無い出撃(null)は常に false', () => {
    expect(isInArmoryCircle(player(0, 0), null)).toBe(false);
  });
});

describe('tickArmoryDwell(3秒滞在・病院と同じ流儀)', () => {
  it('サークル内なら加算し、3秒でちょうど1回だけ done が立つ', () => {
    let dwell = 0, dones = 0;
    for (let i = 0; i < 100; i++) {
      const r = tickArmoryDwell(dwell, true, 100);
      dwell = r.dwellMs;
      if (r.done) dones++;
    }
    expect(dwell).toBe(ARMORY_DWELL_MS);
    expect(dones).toBe(1); // 到達フレームだけ=スクラップ不足時の判定側が多重発火しない
  });

  it('円から出たら0へ戻る(やり直し)', () => {
    expect(tickArmoryDwell(1500, false, 16)).toEqual({ dwellMs: 0, done: false });
  });

  it('3秒を超えて溜まらない(上限でクランプ)。スクラップ不足で入手できなかった場合も再発火は円の出入りが必要', () => {
    expect(tickArmoryDwell(ARMORY_DWELL_MS, true, 1000).dwellMs).toBe(ARMORY_DWELL_MS);
    expect(tickArmoryDwell(ARMORY_DWELL_MS, true, 1000).done).toBe(false);
  });
});

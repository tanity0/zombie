// 警察署(PACING_PUZZLE.md §6.24 M48。旧称「研究施設跡」)の純関数。アリーナ方式(dwellなし)
// なので、位置/距離の不変条件と「近づいた判定(isNearPolice)」を重点的に見る。
import { describe, it, expect } from 'vitest';
import {
  POLICE_DIST, POLICE_ARENA_RADIUS, POLICE_HITBOX_W, POLICE_HITBOX_H, POLICE_REARM_RADIUS,
  policePos, policeRect, resolvePoliceCollision, isNearPolice, isPoliceRearmed,
} from './police';
import { AREA_THRESHOLDS } from '../utils/enemyUtils';
import { detourPosForSector } from './detourPoi';
import { poiSectorIndex } from './pois';

describe('policePos(研究対象区域の中間・§6.24)', () => {
  // v0.25.3172(社長指示「警察署はデンジャーに寄せる」): 拠点(3200)より内側にあると
  // 「矢印が出た瞬間に来た道を戻らされる」ため、デンジャーゾーンの手前寄りへ移した。
  it('距離はデンジャーゾーンの手前寄り(3500)=拠点(3200)より外', () => {
    expect(POLICE_DIST).toBe(AREA_THRESHOLDS[1] + (AREA_THRESHOLDS[2] - AREA_THRESHOLDS[1]) * 0.25);
    expect(POLICE_DIST).toBe(3500);
    expect(POLICE_DIST).toBeGreaterThan(3200); // BASE_SITE_RADIUS
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

// 社長報告v0.25.2389「失敗すると位置がずれて再発動して抜け出せない」の回帰テスト。
// 原因は発動しきい値=アリーナ半径(240)で、アリーナ中はプレイヤーが円の内側へクランプされるため、
// 時間切れの瞬間プレイヤーは必ず発動半径の内側に居る=即再発動→クランプ、の無限ループだった。
describe('isPoliceRearmed(失敗後の再武装=ヒステリシス・v0.25.2389)', () => {
  const pos = policePos(0);
  const player = (x: number, y: number) => ({ x: x - 12, y: y - 12, width: 24, height: 24 });

  // ★これが壊れると「抜け出せない」バグが再発する。しきい値の大小関係そのものが不変条件。
  it('再武装の距離は発動の距離より必ず外側にある(ヒステリシス)', () => {
    expect(POLICE_REARM_RADIUS).toBeGreaterThan(POLICE_ARENA_RADIUS);
  });

  it('アリーナ内(=失敗直後に必ず居る位置)では再武装しない', () => {
    expect(isPoliceRearmed(player(pos.x, pos.y), pos)).toBe(false);
    expect(isPoliceRearmed(player(pos.x + POLICE_ARENA_RADIUS, pos.y), pos)).toBe(false);
  });

  it('発動半径の外へ出ただけでは再武装しない(すぐ掴み直さない)', () => {
    expect(isPoliceRearmed(player(pos.x + POLICE_ARENA_RADIUS + 1, pos.y), pos)).toBe(false);
  });

  it('再武装の距離まで離れたら、また挑める(報酬を取り上げない)', () => {
    expect(isPoliceRearmed(player(pos.x + POLICE_REARM_RADIUS + 1, pos.y), pos)).toBe(true);
  });

  it('警察署が無い出撃(null)は常に再武装済み扱い(発動側の判定で弾かれる)', () => {
    expect(isPoliceRearmed(player(0, 0), null)).toBe(true);
  });
});

// 社長報告v0.25.2389「建物が大半を占めてて邪魔」の回帰テスト。
// 警察署だけは**アリーナの中で戦う**ため、建物の当たり判定がそのまま戦闘スペースを削る。
describe('建物の大きさ(アリーナとの比率・v0.25.2389)', () => {
  it('当たり判定の幅がアリーナの直径の1/3を超えない(囲まれても回り込める)', () => {
    expect(POLICE_HITBOX_W / (POLICE_ARENA_RADIUS * 2)).toBeLessThanOrEqual(1 / 3);
  });
});

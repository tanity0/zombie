// research/LIBERTY_HORDE.md: 解放軍群(変異)の純関数のテスト。
import { describe, it, expect } from 'vitest';
import { libVolleyArrows, LIB_VOLLEY_ARROWS, LIB_VOLLEY_NEAR, LIB_VOLLEY_NEAR_SPREAD_PX, LIB_VOLLEY_SPAN_MS, LIB_ARROW_WINDUP_MS, libFlagFan, edgeDistToRectPt, LIB_FLAG_RADIUS, LIB_FLAG_TRIGGER_PX, libRetreatDir, LIB_RETREAT_RANGE_PX, libPatrolRadius, trailPointAt, maleBatId, ringPointBehind, hordeJitter, LIB_JITTER_PX, LIB_ESCORTS, LIB_TRAIL_MAX, LIB_TRAIL_STEP_PX, LIB_SLOT_GAP_PX } from './libertyScript';
import { variantTextureName } from './enemyVariant';
import { countsTowardEnemyCap, isBossType } from './enemyUtils';

describe('解放軍群(変異)', () => {
  it('周回の半径=深層域に(デンジャーゾーンの幅の半分)入った所=12750', () => {
    expect(libPatrolRadius([2250, 4500, 7500, 11250])).toBe(12750);
  });
  it('後ろに5体', () => {
    expect(LIB_ESCORTS).toBe(5);
    expect(LIB_TRAIL_MAX * LIB_TRAIL_STEP_PX).toBeGreaterThanOrEqual((LIB_ESCORTS + 1) * LIB_SLOT_GAP_PX);
  });
  it('足跡を新しい側からたどる(足りなければ同じ向きへ延ばす)', () => {
    const trail = [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 40, y: 0 }];
    const head = { x: 60, y: 0 };
    expect(trailPointAt(trail, head, 30)).toEqual({ x: 30, y: 0 });
    expect(trailPointAt(trail, head, 100)).toEqual({ x: -40, y: 0 });
    const p = trailPointAt([], head, 50);
    expect(Math.hypot(p.x - head.x, p.y - head.y)).toBeCloseTo(50, 6);
  });
  it('バット男は必ず男の見た目', () => {
    for (let i = 0; i < 50; i++) expect(variantTextureName('bat', maleBatId(`e-${i}-${i * 7}`))).toBe('bat-male');
  });
  it('出現時の仮の足跡は旗手の後ろ(反時計回りに進む=角度が減るので、後ろは角度が増える側)', () => {
    const R = 12750;
    const p = ringPointBehind(0, R, 56);
    expect(Math.atan2(p.y, p.x)).toBeGreaterThan(0);
    expect(Math.hypot(p.x, p.y)).toBeCloseTo(R, 6);
  });
  it('列の癖は個体ごとに決まっていて、幅の中に収まる', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 40; i++) {
      const j = hordeJitter(`e-${i}`);
      expect(hordeJitter(`e-${i}`)).toEqual(j);
      expect(Math.abs(j.gap)).toBeLessThanOrEqual(LIB_JITTER_PX);
      expect(Math.abs(j.lat)).toBeLessThanOrEqual(LIB_JITTER_PX);
      seen.add(Math.round(j.gap));
    }
    expect(seen.size).toBeGreaterThan(5);
  });
  it('体の縁から100px以内に来たら、プレイヤーの反対側へ離れる', () => {
    const rect = { x: 0, y: 0, width: 110, height: 60 };
    expect(libRetreatDir(rect, 55, 60 + LIB_RETREAT_RANGE_PX + 1, LIB_RETREAT_RANGE_PX)).toBeNull();
    const d = libRetreatDir(rect, 55, 60 + LIB_RETREAT_RANGE_PX - 1, LIB_RETREAT_RANGE_PX)!;
    expect(d.x).toBeCloseTo(0); expect(d.y).toBeCloseTo(-1);
    const left = libRetreatDir(rect, -50, 30, LIB_RETREAT_RANGE_PX)!;
    expect(left.x).toBeCloseTo(1);
  });
  it('旗振りの扇は、振り始める距離の相手に必ず届く(赤いのに当たらない、を作らない)', () => {
    const rect = { x: 0, y: 0, width: 110, height: 60 };
    // 縁から120の点のうち、体の中心からいちばん遠いのは角の斜め外。そこまで扇の半径が届くこと。
    const corner = { x: 110 + LIB_FLAG_TRIGGER_PX / Math.SQRT2, y: 60 + LIB_FLAG_TRIGGER_PX / Math.SQRT2 };
    expect(edgeDistToRectPt(rect, corner.x, corner.y)).toBeCloseTo(LIB_FLAG_TRIGGER_PX, 6);
    expect(Math.hypot(corner.x - 55, corner.y - 30)).toBeLessThanOrEqual(LIB_FLAG_RADIUS);
    const f = libFlagFan(rect, 55, 200);
    expect(f.angle).toBeCloseTo(Math.PI / 2);
  });
  it('矢の雨: 画面いっぱい+相手の近く・矢ごとに予告と刺さる時刻を持つ', () => {
    let seed = 1;
    const rng = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const b = { left: 0, right: 1000, top: 0, bottom: 2000 };
    const arrows = libVolleyArrows(b, { x: 500, y: 1000 }, 10_000, rng);
    expect(arrows.length).toBe(LIB_VOLLEY_ARROWS);
    const near = arrows.filter(a => Math.hypot(a.x - 500, a.y - 1000) <= LIB_VOLLEY_NEAR_SPREAD_PX + 1e-6);
    expect(near.length).toBeGreaterThanOrEqual(LIB_VOLLEY_NEAR);
    for (const a of arrows) {
      expect(a.bornAt).toBeGreaterThanOrEqual(10_000);
      expect(a.bornAt).toBeLessThanOrEqual(10_000 + LIB_VOLLEY_SPAN_MS);
      expect(a.fireAt - a.bornAt).toBe(LIB_ARROW_WINDUP_MS);
    }
    for (let i = 1; i < arrows.length; i++) expect(arrows[i].bornAt).toBeGreaterThanOrEqual(arrows[i - 1].bornAt);
    expect(new Set(arrows.map(a => a.fireAt)).size).toBeGreaterThan(10); // 一斉ではなくばらけて刺さる
  });
  it('旗手と取り巻きは盤面の上限に数えない。旗手はボス級', () => {
    expect(countsTowardEnemyCap({ type: 'mutant-liberty' })).toBe(false);
    expect(countsTowardEnemyCap({ type: 'bat', hordeLeaderId: 'x' })).toBe(false);
    expect(countsTowardEnemyCap({ type: 'bat' })).toBe(true);
    expect(isBossType('mutant-liberty')).toBe(true);
  });
});

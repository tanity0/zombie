import { describe, it, expect } from 'vitest';
import type { Enemy } from '../types/game';
import {
  hasShotRecoil, shotRecoilStrength, addShotHit, shotHitVector, stampShotHits, newRecoilBody, kickRecoil, pushRecoilForce,
  advanceRecoil, recoilOffset, recoilParts, SHOT_RECOIL_IDOL, SHOT_RECOIL_CRAWLER, SHOT_RECOIL_STRENGTH_MAX, SHOT_FORCE_HOLD_MS,
  SHOT_TREMBLE_IDOL_GUN,
  type RecoilSpec, type RecoilBody, type ShotHitAcc,
} from './shotRecoil';

const enemy = (over: Partial<Enemy>): Enemy => ({
  id: 'e', x: 0, y: 0, width: 20, height: 20, vx: 0, vy: 0, speed: 0, health: 10, maxHealth: 10, damage: 0,
  type: 'zombie', experienceValue: 0, lastHit: 0, lastShot: 0, ...over,
} as Enemy);

const T0 = 100000;
/** 16ms刻みで回し、shots(時刻→衝撃x)/forces(時刻→力x)を入れながら各コマの押しを返す。stopUntil=ヒットストップの明け(相対ms)。 */
const run = (
  spec: RecoilSpec, untilMs: number, shots: Array<{ at: number; ix: number }>,
  opts: { forces?: Array<{ at: number; fx: number }>; stopUntil?: number } = {},
): { t: number; x: number; bodyX: number }[] => {
  let b: RecoilBody = advanceRecoil(newRecoilBody(spec), spec, T0);
  const out: { t: number; x: number; bodyX: number }[] = [];
  let si = 0, fi = 0;
  const forces = opts.forces ?? [];
  for (let t = 0; t <= untilMs; t += 16) {
    while (si < shots.length && shots[si].at <= t) {
      b = kickRecoil(b, T0 + shots[si].at, shots[si].ix, 0, 1, opts.stopUntil !== undefined ? T0 + opts.stopUntil : 0); si++;
    }
    while (fi < forces.length && forces[fi].at <= t) { b = pushRecoilForce(b, T0 + forces[fi].at, forces[fi].fx, 0); fi++; }
    b = advanceRecoil(b, spec, T0 + t);
    const p = recoilParts(b, spec);
    out.push({ t, x: p.x, bodyX: p.bodyX });
  }
  return out;
};
const handgun = shotRecoilStrength(9);
const maxAbs = (xs: { x: number }[]) => Math.max(...xs.map(p => Math.abs(p.x)));

describe('shotRecoil: 撃たれた時の押し戻し(アイドル・変異塊)', () => {
  it('対象はアイドルと変異塊の代理だけ(他の敵に漏らさない)', () => {
    expect(hasShotRecoil('idol')).toBe(true);
    expect(hasShotRecoil('lab-crawler')).toBe(true);
    expect(hasShotRecoil('zombie')).toBe(false);
    expect(hasShotRecoil('thor')).toBe(false);
  });

  it('強さは押し戻し専用の曲線(√(ダメージ/14)・上限3): 重い1発ほど大きい・怯みの上限1で頭打ちしない', () => {
    expect(shotRecoilStrength(14)).toBeCloseTo(1, 6);
    expect(shotRecoilStrength(56)).toBeCloseTo(2, 6);
    expect(shotRecoilStrength(100)).toBeGreaterThan(2.5);
    expect(shotRecoilStrength(10000)).toBe(SHOT_RECOIL_STRENGTH_MAX);
    expect(shotRecoilStrength(undefined)).toBe(0);
  });

  it('集計: 同じ処理の粒はダメージを足してから曲線に通す(粒の数で得をしない)・逆向きは打ち消す・当たった点を持つ', () => {
    const acc = new Map<string, ShotHitAcc>();
    for (let i = 0; i < 5; i++) addShotHit(acc, 'a', 1, 0, 6, false, { x: 10 + i, y: 20 });
    const v = shotHitVector(acc.get('a')!);
    expect(v.x).toBeCloseTo(shotRecoilStrength(30), 6);
    expect(acc.get('a')).toMatchObject({ px: 14, py: 20 });
    const both = new Map<string, ShotHitAcc>();
    addShotHit(both, 'b', 1, 0, 9); addShotHit(both, 'b', -1, 0, 9);
    expect(Math.hypot(shotHitVector(both.get('b')!).x, shotHitVector(both.get('b')!).y)).toBeLessThan(1e-9);
  });

  it('アイドル: 1発で鋭く押され、行き過ぎなしで硬く止まる(慣性)・狙撃は拳銃より明らかに大きく持っていかれる', () => {
    const xs = run(SHOT_RECOIL_IDOL, 600, [{ at: 0, ix: handgun }]);
    const peak = Math.max(...xs.map(p => p.x));
    const peakT = xs.find(p => p.x === peak)!.t;
    expect(peak).toBeGreaterThan(SHOT_RECOIL_IDOL.modes[0].peakPx * handgun * 0.8);
    expect(peakT).toBeLessThanOrEqual(64);
    expect(Math.min(...xs.map(p => p.x))).toBeGreaterThan(-0.05);
    expect(xs.find(p => p.t === 304)!.x).toBeLessThan(peak * 0.1);
    for (let i = 1; i < xs.length; i++) {
      const d = xs[i].x - xs[i - 1].x;
      expect(Math.abs(d)).toBeLessThan(peak * 0.9);
      if (xs[i].t > peakT) expect(-d).toBeLessThan(peak * 0.34);
    }
    const sniper = Math.max(...run(SHOT_RECOIL_IDOL, 600, [{ at: 0, ix: shotRecoilStrength(100) }]).map(p => p.x));
    expect(sniper).toBeGreaterThan(peak * 2.4);
    expect(sniper).toBeLessThanOrEqual(SHOT_RECOIL_IDOL.maxPx);
  });

  it('変異塊: 動き出しに質量の遅れ・1発では数px・戻りで前へのめる', () => {
    const xs = run(SHOT_RECOIL_CRAWLER, 1500, [{ at: 0, ix: handgun }]);
    expect(Math.abs(xs.find(p => p.t === 32)!.x)).toBeLessThan(0.01);
    const peak = Math.max(...xs.map(p => p.x));
    expect(peak).toBeGreaterThan(1.5);
    expect(peak).toBeLessThan(8);
    expect(Math.min(...xs.filter(p => p.t > 300).map(p => p.x))).toBeLessThan(-0.1);
    expect(Math.abs(xs[xs.length - 1].x)).toBeLessThan(0.5);
  });

  it('連射: 反応が消えない・押しは積もるが上限を超えない', () => {
    for (const spec of [SHOT_RECOIL_IDOL, SHOT_RECOIL_CRAWLER]) {
      const xs = run(spec, 4000, Array.from({ length: 40 }, (_, i) => ({ at: i * 100, ix: handgun })));
      expect(maxAbs(xs)).toBeLessThanOrEqual(spec.maxPx + 1e-9);
      const late = xs.filter(p => p.t >= 3000 && p.t < 3900).map(p => p.x);
      expect(Math.min(...late)).toBeGreaterThan(0.5);
      expect(Math.max(...late) - Math.min(...late)).toBeGreaterThan(0.3);
    }
    const single = Math.max(...run(SHOT_RECOIL_CRAWLER, 1500, [{ at: 0, ix: handgun }]).map(p => p.x));
    const burst = run(SHOT_RECOIL_CRAWLER, 3000, Array.from({ length: 25 }, (_, i) => ({ at: i * 100, ix: handgun })));
    expect(Math.max(...burst.map(p => p.x))).toBeGreaterThan(single * 2.5);
    const heavy = run(SHOT_RECOIL_CRAWLER, 3000, Array.from({ length: 30 }, (_, i) => ({ at: i * 80, ix: 3 })));
    expect(maxAbs(heavy)).toBeLessThanOrEqual(SHOT_RECOIL_CRAWLER.maxPx + 1e-9);
  });

  it('左右から交互に撃たれても暴れない(逆向きの衝撃は打ち消し合う)', () => {
    for (const spec of [SHOT_RECOIL_IDOL, SHOT_RECOIL_CRAWLER]) {
      const single = maxAbs(run(spec, 1500, [{ at: 0, ix: handgun }]));
      const alt = run(spec, 3000, Array.from({ length: 30 }, (_, i) => ({ at: i * 50, ix: i % 2 === 0 ? handgun : -handgun })));
      expect(maxAbs(alt)).toBeLessThan(single * 1.2);
    }
  });

  it('継続(火炎など)=押し続ける力: 当たっている間は下がって居座り(はっきり見える量)、細かく震え、止んだら戻る', () => {
    const fx = shotRecoilStrength(6); // 火炎の1脈くらい
    for (const spec of [SHOT_RECOIL_IDOL, SHOT_RECOIL_CRAWLER]) {
      const forces = Array.from({ length: 15 }, (_, i) => ({ at: i * 100, fx })); // 1.5秒浴びる
      const xs = run(spec, 4000, [], { forces });
      const during = xs.filter(p => p.t >= 900 && p.t <= 1500).map(p => p.x);
      expect(Math.min(...during)).toBeGreaterThan(spec.forcePx * fx * 0.6);  // 居座る
      expect(Math.max(...during) - Math.min(...during)).toBeGreaterThan(0.2); // 震えが乗る
      expect(maxAbs(xs)).toBeLessThanOrEqual(spec.maxPx + 1e-9);
      expect(Math.abs(xs[xs.length - 1].x)).toBeLessThan(1);                  // 止んだら戻る
    }
    // 力が切れる期限: 最後の脈から SHOT_FORCE_HOLD_MS
    let b = advanceRecoil(newRecoilBody(SHOT_RECOIL_IDOL), SHOT_RECOIL_IDOL, T0);
    b = pushRecoilForce(b, T0, 1, 0);
    expect(b.fUntil).toBe(T0 + SHOT_FORCE_HOLD_MS);
    expect(pushRecoilForce(b, T0 - 50, 1, 0)).toBe(b);
  });

  it('ヒットストップの間は体に乗せず、明けてから押しが出る(明けに飛ばない=慣性のまま)', () => {
    const xs = run(SHOT_RECOIL_IDOL, 800, [{ at: 0, ix: handgun }], { stopUntil: 200 });
    expect(maxAbs(xs.filter(p => p.t <= 192))).toBeLessThan(0.01);
    const peak = Math.max(...xs.map(p => p.x));
    expect(peak).toBeGreaterThan(SHOT_RECOIL_IDOL.modes[0].peakPx * handgun * 0.8);
    for (let i = 1; i < xs.length; i++) expect(Math.abs(xs[i].x - xs[i - 1].x)).toBeLessThan(peak * 0.9);
  });

  it('影用の「体ごと下がる」成分は遅いばねだけ(速い身震いは入らない)', () => {
    const xs = run(SHOT_RECOIL_CRAWLER, 400, [{ at: 0, ix: handgun }]);
    const p = xs.find(q => q.t === 96)!;
    expect(Math.abs(p.bodyX)).toBeLessThan(Math.abs(p.x));
    const idol = run(SHOT_RECOIL_IDOL, 200, [{ at: 0, ix: handgun }]).find(q => q.t === 48)!;
    expect(idol.bodyX).toBeCloseTo(idol.x, 6);
  });

  it('同じ打刻は2度取り込まない・止まっていた後は静止から始める', () => {
    let b = advanceRecoil(newRecoilBody(SHOT_RECOIL_IDOL), SHOT_RECOIL_IDOL, 1000);
    b = kickRecoil(b, 1000, 1, 0);
    expect(kickRecoil(b, 1000, 1, 0)).toBe(b);
    expect(kickRecoil(b, undefined, 1, 0)).toBe(b);
    b = advanceRecoil(b, SHOT_RECOIL_IDOL, 1040);
    expect(recoilOffset(b, SHOT_RECOIL_IDOL).x).toBeGreaterThan(1);
    b = advanceRecoil(b, SHOT_RECOIL_IDOL, 5000);
    expect(recoilOffset(b, SHOT_RECOIL_IDOL)).toEqual({ x: 0, y: 0 });
  });

  it('打刻: 対象の型で、この処理で実際に被弾した敵だけ・1発は衝撃と当たった点、継続は力として書く', () => {
    const idol = enemy({ id: 'i', type: 'idol', lastHit: 5000 });
    const proxy = enemy({ id: 'lab-crawler', type: 'lab-crawler', lastHit: 5001 });
    const zombie = enemy({ id: 'z', type: 'zombie', lastHit: 5000 });
    const blocked = enemy({ id: 'b', type: 'idol', lastHit: 100 });
    const list = [idol, proxy, zombie, blocked];
    const hits = new Map<string, ShotHitAcc>();
    addShotHit(hits, 'i', 1, 0, 14, false, { x: 3, y: 4 });
    addShotHit(hits, 'lab-crawler', -1, 0, 9, true);
    addShotHit(hits, 'z', 1, 0, 9);
    addShotHit(hits, 'b', 1, 0, 9);
    const out = stampShotHits(list, hits, 4990);
    expect(out[0]).toMatchObject({ shotHitAt: 5000, shotHitPx: 3, shotHitPy: 4 });
    expect(out[0].shotImpX).toBeCloseTo(1, 6);
    expect(out[1]).toMatchObject({ shotForceAt: 5001 });
    expect(out[1].shotForceX).toBeCloseTo(-shotRecoilStrength(9), 6);
    expect(out[1].shotHitAt).toBeUndefined();
    expect(out[2]).toBe(zombie);
    expect(out[3]).toBe(blocked);
    expect(stampShotHits(out, hits, 4990)).toBe(out);
    expect(stampShotHits(list, new Map(), 0)).toBe(list);
  });

  it('変異塊の古い怯みは、同じ1発の衝撃の速い身震いにだけ組み込む(体ごと下がる成分・影は変わらない)', () => {
    let a = advanceRecoil(newRecoilBody(SHOT_RECOIL_CRAWLER), SHOT_RECOIL_CRAWLER, T0);
    let b = a;
    a = kickRecoil(a, T0, handgun, 0);
    b = kickRecoil(b, T0, handgun, 0, 1, 0, 5, 0);
    let peakA = 0, peakB = 0;
    for (let t = 16; t <= 400; t += 16) {
      a = advanceRecoil(a, SHOT_RECOIL_CRAWLER, T0 + t);
      b = advanceRecoil(b, SHOT_RECOIL_CRAWLER, T0 + t);
      const pa = recoilParts(a, SHOT_RECOIL_CRAWLER), pb = recoilParts(b, SHOT_RECOIL_CRAWLER);
      peakA = Math.max(peakA, pa.x); peakB = Math.max(peakB, pb.x);
      expect(pb.bodyX).toBeCloseTo(pa.bodyX, 1); // 影の成分はほぼ同じ(上限の縮めの差だけ)
    }
    expect(peakB - peakA).toBeGreaterThan(3);   // 組み込んだ怯みのぶん、最初の身震いが大きい
    expect(peakB - peakA).toBeLessThan(6);
  });

  it('赤い線の溜め中の銃の身震い: 撃たれた瞬間に立ち上がり、1〜2pxの間で揺れて収まる(上限2px)', () => {
    const xs = run(SHOT_TREMBLE_IDOL_GUN, 600, [{ at: 0, ix: shotRecoilStrength(100) }]);
    const peak = maxAbs(xs);
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(SHOT_TREMBLE_IDOL_GUN.maxPx);
    expect(Math.min(...xs.map(p => p.x))).toBeLessThan(-0.2); // 行き来する(身震い)
    expect(maxAbs(xs.filter(p => p.t >= 300))).toBeLessThan(0.1);
    const small = maxAbs(run(SHOT_TREMBLE_IDOL_GUN, 300, [{ at: 0, ix: handgun }]));
    expect(small).toBeGreaterThan(0.8);
  });
});

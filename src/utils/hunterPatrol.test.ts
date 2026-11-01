import { describe, it, expect } from 'vitest';
import {
  hunterOpenSectors, nextOpenSectorEntryAngle, hunterPatrolSpawnPoint, sectorOfPos, ringPoint, hunterWarpAlpha,
  HUNTER_WARP_FADE_MS, HUNTER_PATROL_SPAWN_MIN_DIST,
  hunterRushActive, hunterRushNext, HUNTER_RUSH_BAND_MARGIN, HUNTER_RUSH_SPEED, HUNTER_PATROL_SPEED,
} from './hunterPatrol';

/** 決まった並びの乱数(テストを確率で落とさない)。 */
const seeded = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

const base = (i: number, captured: boolean) => ({ x: Math.cos((i * Math.PI) / 2) * 3000, y: Math.sin((i * Math.PI) / 2) * 3000, status: captured ? 'captured' : 'open' });

describe('ハンターの巡回: 区画', () => {
  it('拠点が解放済みの方角は巡回しない', () => {
    const open = hunterOpenSectors([base(0, false), base(1, true), base(2, false), base(3, true)]);
    expect([...open].sort()).toEqual([0, 2]);
  });
  it('次の未解放の区画は、角度が増える向き(画面で時計回り)に数える。解放済みは飛ばす', () => {
    const open = new Set([0, 3]);
    const a = nextOpenSectorEntryAngle(0, open)!;
    // 区画0の次(角度が増える向き)は区画1・2(解放済み)→区画3
    expect(sectorOfPos(ringPoint(a, 6000).x, ringPoint(a, 6000).y)).toBe(3);
    // 入り口=区画の下の境界の少し内側(この先、角度が増えて区画の中を進む)
    expect(sectorOfPos(ringPoint(a - 0.2, 6000).x, ringPoint(a - 0.2, 6000).y)).not.toBe(3);
    expect(sectorOfPos(ringPoint(a + 0.6, 6000).x, ringPoint(a + 0.6, 6000).y)).toBe(3);
  });
  it('置く点は毎回ばらける(未解放の区画の中のどこからでも始まる)', () => {
    const secs = new Set<number>();
    const angs: number[] = [];
    for (let n = 0; n < 200; n++) { const p = hunterPatrolSpawnPoint(new Set([0, 1, 2, 3]), { x: 0, y: 0 }, 6000, seeded(n * 7 + 3))!; secs.add(sectorOfPos(p.x, p.y)); angs.push(p.angle); }
    expect(secs.size).toBe(4);
    expect(new Set(angs.map(a => Math.round(a * 10))).size).toBeGreaterThan(40);
  });
  it('全部解放済みなら行き先は無い', () => {
    expect(nextOpenSectorEntryAngle(1, new Set())).toBeNull();
    expect(hunterPatrolSpawnPoint(new Set(), { x: 0, y: 0 }, 6000, Math.random)).toBeNull();
  });
  it('置く点は未解放の区画の輪の上・プレイヤーから離れた所', () => {
    for (let n = 0; n < 50; n++) {
      const p = hunterPatrolSpawnPoint(new Set([1, 3]), { x: 0, y: 5800 }, 6000, seeded(n + 1))!;
      expect(Math.hypot(p.x, p.y)).toBeCloseTo(6000);
      expect([1, 3]).toContain(sectorOfPos(p.x, p.y));
      expect(Math.hypot(p.x, p.y - 5800)).toBeGreaterThanOrEqual(HUNTER_PATROL_SPAWN_MIN_DIST);
    }
  });
});

describe('ハンターの巡回: ワープ(パッと消えない)', () => {
  it('消える側は1→0へ、現れる側は0→1へ滑らかに', () => {
    expect(hunterWarpAlpha(100, 100, undefined)).toBe(1);
    expect(hunterWarpAlpha(100 + HUNTER_WARP_FADE_MS / 2, 100, undefined)).toBeCloseTo(0.5);
    expect(hunterWarpAlpha(100 + HUNTER_WARP_FADE_MS, 100, undefined)).toBe(0);
    expect(hunterWarpAlpha(500, 100, 500)).toBe(0);
    expect(hunterWarpAlpha(500 + HUNTER_WARP_FADE_MS, 100, 500)).toBe(1);
    expect(hunterWarpAlpha(0, undefined, undefined)).toBe(1);
  });
});

// 社長指示2026-11-01「ハンター、拠点解放前だと、デンジャーゾーンに入るとすごいスピードでこちらにデンジャーゾーンから出ない範囲で
// (つまりX軸主体で)向かってくる」。
describe('ハンターの急接近(拠点解放前・デンジャーゾーン)', () => {
  const rIn = 4500, rOut = 7500, lo = rIn + HUNTER_RUSH_BAND_MARGIN, hi = rOut - HUNTER_RUSH_BAND_MARGIN;
  it('拠点0でデンジャーゾーンより奥にいる時だけ。拠点を1つでも解放した/手前にいる時はしない', () => {
    expect(hunterRushActive(0, 4600, rIn)).toBe(true);
    expect(hunterRushActive(0, 9000, rIn)).toBe(true);
    expect(hunterRushActive(0, 4400, rIn)).toBe(false);
    expect(hunterRushActive(1, 6000, rIn)).toBe(false);
  });
  it('巡回よりずっと速い', () => expect(HUNTER_RUSH_SPEED).toBeGreaterThanOrEqual(HUNTER_PATROL_SPEED * 2.5));
  it('反対側にいても帯から出ずに弧で回ってくる(輪の内側を横切らない)', () => {
    let x = 6000, y = 0; // 右
    const px = -6000, py = 300; // 左(わずかに下=時計回りの方が近い)
    for (let i = 0; i < 400; i++) {
      const n = hunterRushNext(x, y, px, py, rIn, rOut, 240);
      const r = Math.hypot(n.x, n.y);
      expect(r).toBeGreaterThanOrEqual(lo - 1e-6);
      expect(r).toBeLessThanOrEqual(hi + 1e-6);
      x = n.x; y = n.y;
    }
    expect(Math.hypot(x - px, y - py)).toBeLessThan(5); // 着いた
  });
  it('近い側の回り方で向かう', () => {
    const n = hunterRushNext(6000, 0, 0, 6000, rIn, rOut, 240); // プレイヤーは角度+90°
    expect(Math.atan2(n.y, n.x)).toBeGreaterThan(0);
    const m = hunterRushNext(6000, 0, 0, -6000, rIn, rOut, 240); // −90°
    expect(Math.atan2(m.y, m.x)).toBeLessThan(0);
  });
  it('遠い間は帯に沿って横へ走る(奥行きの寄せは角度の残りに比例=ほぼ動かない)', () => {
    const n = hunterRushNext(6000, 0, -4700, 100, rIn, rOut, 240); // 反対側の手前寄り
    // 1歩(240px)のうち奥行きへの寄せは1割未満=横(帯の向き)が主。
    expect(Math.abs(Math.hypot(n.x, n.y) - 6000)).toBeLessThan(240 * 0.1);
  });
  it('プレイヤーが帯の奥(外)にいる時は帯の外縁で止まる', () => {
    let x = 6000, y = 0;
    for (let i = 0; i < 200; i++) { const n = hunterRushNext(x, y, 9500, 200, rIn, rOut, 240); x = n.x; y = n.y; }
    expect(Math.hypot(x, y)).toBeCloseTo(hi, 3);
  });
});

// research/BRAWLER_PHANTOM.md §14: 拳鬼の縮地(社長指示2026-11-10「拳鬼はカウンターすると縮地で距離を一気に詰めてくる。(ただし無限にワープはしない)」)。
import { describe, expect, it } from 'vitest';
import {
  KENKI_SHUKUCHI_COOLDOWN_MS, KENKI_SHUKUCHI_RANGE_PX, KENKI_SHUKUCHI_STANDOFF_PX,
  kenkiNewCounter, kenkiShukuchiCandidates, kenkiShukuchiPick, kenkiShukuchiReadyAt, kenkiShukuchiShouldFire,
} from './kenkiShukuchi';
import { SHUKUCHI_LEVELS } from './shukuchi';
import { BRAWLER_STANDOFF_PX } from './brawler';

const T = 100_000;
const base = { counterAt: T, lastSeenCounterAt: 0, t: T, readyAt: 0, edgeDist: 300, reach: 74, secretActive: false };
const player = { x: 0, y: 0, width: 30, height: 30 };
const edgeTo = (c: { x: number; y: number }) => {
  const nx = Math.max(player.x, Math.min(c.x, player.x + player.width)), ny = Math.max(player.y, Math.min(c.y, player.y + player.height));
  return Math.hypot(c.x - nx, c.y - ny);
};

describe('きっかけ', () => {
  it('新しいカウンターが成立し・届く距離より遠い時だけ', () => {
    expect(kenkiShukuchiShouldFire(base)).toBe(true);
    expect(kenkiShukuchiShouldFire({ ...base, edgeDist: 74 })).toBe(false); // 届く距離の内=詰めない
    expect(kenkiShukuchiShouldFire({ ...base, counterAt: undefined })).toBe(false);
    expect(kenkiShukuchiShouldFire({ ...base, secretActive: true })).toBe(false);
  });
  it('1回のカウンターで1回まで(見たカウンターでは二度と出ない)', () => {
    expect(kenkiNewCounter(T, 0)).toBe(true);
    expect(kenkiNewCounter(T, T)).toBe(false);
    expect(kenkiShukuchiShouldFire({ ...base, lastSeenCounterAt: T })).toBe(false);
  });
  it('縮地の後4秒はしない(クールダウン=台帳の定数)', () => {
    expect(KENKI_SHUKUCHI_COOLDOWN_MS).toBe(4000);
    const ready = kenkiShukuchiReadyAt(T);
    expect(kenkiShukuchiShouldFire({ ...base, counterAt: T + 3999, lastSeenCounterAt: T, t: T + 3999, readyAt: ready })).toBe(false);
    expect(kenkiShukuchiShouldFire({ ...base, counterAt: T + 4000, lastSeenCounterAt: T, t: T + 4000, readyAt: ready })).toBe(true);
  });
});

describe('行き先と届く距離', () => {
  it('届く距離はプレイヤーの縮地 Lv1 と同じ400px・立ち位置は格闘の詰めと同じ', () => {
    expect(KENKI_SHUKUCHI_RANGE_PX).toBe(SHUKUCHI_LEVELS[0].rangePx);
    expect(KENKI_SHUKUCHI_RANGE_PX).toBe(400);
    expect(KENKI_SHUKUCHI_STANDOFF_PX).toBe(BRAWLER_STANDOFF_PX);
  });
  it('近い時(400px以内)はプレイヤーの正面のすぐ手前(来た側・箱の縁どうしが立ち位置の距離=体が重ならない)へ', () => {
    const from = { x: 15 + 250, y: 15 };
    const c = kenkiShukuchiCandidates(from, player, 20)[0];
    expect(edgeTo(c)).toBeCloseTo(KENKI_SHUKUCHI_STANDOFF_PX + 20, 5);
    expect(c.x).toBeGreaterThan(player.x + player.width); // 来た側(右)
    expect(c.y).toBeCloseTo(15, 5);
  });
  it('遠い時は400px分だけ詰める', () => {
    const from = { x: 15 + 900, y: 15 };
    const c = kenkiShukuchiCandidates(from, player, 20)[0];
    expect(Math.hypot(c.x - from.x, c.y - from.y)).toBeCloseTo(400, 5);
    expect(c.x).toBeLessThan(from.x);
  });
  it('どの候補も一度に400pxより遠くへは行かない', () => {
    for (const from of [{ x: 2000, y: 500 }, { x: -700, y: -50 }, { x: 15, y: 900 }]) {
      for (const c of kenkiShukuchiCandidates(from, player, 20)) expect(Math.hypot(c.x - from.x, c.y - from.y)).toBeLessThanOrEqual(400 + 1e-6);
    }
  });
  it('立てない所(壁・建物・行ける帯の外=寄せると動く所)には降りず次の向きを試す。どこも立てなければ縮地しない', () => {
    const cands = kenkiShukuchiCandidates({ x: 265, y: 15 }, player, 20);
    const size = { width: 40, height: 56 };
    // 1番目の候補だけ壁の中(寄せると押し出される)。
    const first = { x: cands[0].x - 20, y: cands[0].y - 28 };
    const resolve = (x: number, y: number) => (Math.abs(x - first.x) < 0.5 && Math.abs(y - first.y) < 0.5 ? { x: x + 30, y } : { x, y });
    const pick = kenkiShukuchiPick(cands, size, resolve)!;
    expect(pick).toEqual({ x: cands[1].x - 20, y: cands[1].y - 28 });
    expect(kenkiShukuchiPick(cands, size, (x, y) => ({ x: x + 50, y }))).toBeNull();
  });
});

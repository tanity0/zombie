// research/NEW_GUNS.md §2(塊弾)の純関数。§7-1「ゆっくり進んで触れている敵に当たり続け、壁・ボスで止まり、最後は縮んで消える」。
import { describe, it, expect } from 'vitest';
import {
  BLOB_RADIUS_PX, BLOB_SPEED_PX_PER_SEC, BLOB_TICK_MS, BLOB_LIFE_MS, BLOB_FADE_MS, BLOB_NUMBER_BATCH_MS,
  createBlobShot, stepBlobShot, isBlobExpired, isBlobFading, blobVisualScale, blobPushOut, circleOverlapsRect,
  accumulateBlobNumber, blobReachPx, BLOB_TICK_DAMAGE, type BlobNumberLedger, type BlobStepEnemy,
} from './blobShot';

const never = (): boolean => false;
const all = (): boolean => true;
const enemy = (id: string, cx: number, cy: number, w = 20, h = 20): BlobStepEnemy => ({ id, x: cx - w / 2, y: cy - h / 2, width: w, height: h });

const run = (ms: number, step: (gt: number, dt: number) => void, start = 0): void => {
  for (let t = start; t < start + ms; t += 16) step(t + 16, 0.016);
};

describe('進み方', () => {
  it('秒速110でゆっくり進む(撃ち出しの慣性ぶん少しだけ先へ・1秒で110〜125px)', () => {
    let b = createBlobShot('b', 0, 0, 1, 0, 0, 12);
    run(1000, (gt, dt) => { b = stepBlobShot(b, dt, gt, [], never, all).blob; });
    expect(b.x).toBeGreaterThan(BLOB_SPEED_PX_PER_SEC);
    expect(b.x).toBeLessThan(BLOB_SPEED_PX_PER_SEC + 15);
    expect(b.y).toBeCloseTo(0);
  });
  it('壁に当たったらそこで止まり、以後は動かない', () => {
    let b = createBlobShot('b', 0, 0, 1, 0, 0, 12);
    const wallX = 60;
    const blocked = (r: { x: number; width: number }): boolean => r.x + r.width > wallX;
    let stoppedSeen = 0;
    run(2000, (gt, dt) => {
      const r = stepBlobShot(b, dt, gt, [], blocked, all);
      if (r.stoppedNow) stoppedSeen++;
      b = r.blob;
    });
    expect(stoppedSeen).toBe(1);
    expect(b.stoppedAt).toBeDefined();
    expect(b.x + BLOB_RADIUS_PX).toBeLessThanOrEqual(wallX);
  });
  it('押せない敵(ボス・強個体)に当たったら止まる', () => {
    let b = createBlobShot('b', 0, 0, 1, 0, 0, 12);
    const heavy = enemy('boss', 100, 0, 40, 40);
    run(2000, (gt, dt) => { b = stepBlobShot(b, dt, gt, [heavy], never, () => false).blob; });
    expect(b.stoppedAt).toBeDefined();
    expect(circleOverlapsRect(b.x, b.y, BLOB_RADIUS_PX, heavy)).toBe(false);
  });
  it('押せる敵は押しのける(進む向きへ押し出す量が出る)', () => {
    const b = createBlobShot('b', 0, 0, 1, 0, 0, 12);
    const r = stepBlobShot(b, 0.016, 16, [enemy('z', 20, 0)], never, all);
    expect(r.blob.stoppedAt).toBeUndefined();
    const p = r.pushes.find(x => x.id === 'z');
    expect(p).toBeDefined();
    expect(p!.dx).toBeGreaterThan(0);
  });
  it('中心が矩形に埋まっていても押し出す向きが決まる', () => {
    const p = blobPushOut(0, 0, BLOB_RADIUS_PX, { x: -5, y: -5, width: 10, height: 10 }, 1, 0);
    expect(p).not.toBeNull();
    expect(Math.hypot(p!.dx, p!.dy)).toBeGreaterThan(BLOB_RADIUS_PX);
  });
});

describe('ダメージの周期と寿命', () => {
  it('触れている敵に200msごと(最初は触れた瞬間)。寿命4秒の最後の0.4秒は当たらない', () => {
    let b = createBlobShot('b', 0, 0, 1, 0, 0, 12);
    b = { ...b, stoppedAt: 0 }; // その場に止まっている塊で数える
    const e = enemy('z', 10, 0);
    let hits = 0;
    let lastHitAt = -1;
    for (let gt = 0; gt < BLOB_LIFE_MS; gt += 4) {
      const r = stepBlobShot(b, 0.004, gt, [e], never, () => false);
      if (r.hitIds.includes('z')) { hits++; lastHitAt = gt; }
      b = r.blob;
    }
    const activeMs = BLOB_LIFE_MS - BLOB_FADE_MS;
    expect(hits).toBe(Math.ceil(activeMs / BLOB_TICK_MS));
    expect(lastHitAt).toBeLessThan(activeMs);
    expect(isBlobFading(b, activeMs)).toBe(true);
    expect(isBlobExpired(b, BLOB_LIFE_MS)).toBe(true);
  });
  it('出る時は膨らみ、最後は縮んで消える(大きさ0へ)', () => {
    const b = createBlobShot('b', 0, 0, 1, 0, 0, 12);
    expect(blobVisualScale(b, 0)).toBeLessThan(blobVisualScale(b, 300));
    expect(blobVisualScale(b, 1000)).toBeCloseTo(1);
    expect(blobVisualScale(b, BLOB_LIFE_MS - BLOB_FADE_MS / 2)).toBeLessThan(1);
    expect(blobVisualScale(b, BLOB_LIFE_MS)).toBeCloseTo(0);
  });
});

describe('ダメージの数字は同じ敵に600msごと', () => {
  it('最初は即出し、以後は600msぶんまとめて出す', () => {
    const ledger: BlobNumberLedger = new Map();
    expect(accumulateBlobNumber(ledger, 'z', 12, 0)).toBe(12);
    expect(accumulateBlobNumber(ledger, 'z', 12, 200)).toBeNull();
    expect(accumulateBlobNumber(ledger, 'z', 12, 400)).toBeNull();
    expect(accumulateBlobNumber(ledger, 'z', 12, BLOB_NUMBER_BATCH_MS)).toBe(36);
    expect(accumulateBlobNumber(ledger, 'y', 5, BLOB_NUMBER_BATCH_MS)).toBe(5); // 敵ごとに別
  });
  it('品質監査2巡目#3: 1回9.5でも数字は整数・端数は持ち越して合計は実ダメージと一致', () => {
    expect(BLOB_TICK_DAMAGE).toBe(9.5);
    const ledger: BlobNumberLedger = new Map();
    let shownSum = 0, realSum = 0;
    for (let t = 0; t <= 6000; t += 200) {
      realSum += BLOB_TICK_DAMAGE;
      const v = accumulateBlobNumber(ledger, 'z', BLOB_TICK_DAMAGE, t);
      if (v !== null) { expect(Number.isInteger(v)).toBe(true); shownSum += v; }
    }
    expect(Math.abs(realSum - shownSum)).toBeLessThan(BLOB_TICK_DAMAGE * 3 + 1); // 最後のまとめ前の残りだけ
  });
});

describe('品質監査#1/#10: 接して止まる・当たりと絵の大きさを揃える', () => {
  it('30fps(dt50ms)でも、押せない敵に接する位置まで詰めて止まり、止まった後も200msごとに必ず当たる', () => {
    let b = createBlobShot('b', 0, 0, 1, 0, 0, 10);
    const heavy = enemy('boss', 150, 0, 40, 60);
    let gt = 0;
    let stoppedAt = -1;
    const hitTimes: number[] = [];
    for (let i = 0; i < 70; i++) {
      gt += 50;
      const r = stepBlobShot(b, 0.05, gt, [heavy], never, () => false);
      b = r.blob;
      if (r.stoppedNow) stoppedAt = gt;
      if (stoppedAt >= 0 && r.hitIds.includes('boss')) hitTimes.push(gt);
    }
    expect(stoppedAt).toBeGreaterThan(0);
    // 接している: 円と矩形の隙間は「触れている」の余白より小さい。
    const qx = Math.max(heavy.x, Math.min(b.x, heavy.x + heavy.width));
    expect(qx - b.x).toBeLessThanOrEqual(BLOB_RADIUS_PX + 2);
    expect(circleOverlapsRect(b.x, b.y, BLOB_RADIUS_PX, heavy)).toBe(false);
    // 止まってから消え始めるまで、200msごと(=50msの4フレームごと)に途切れず当たる。
    const activeEnd = BLOB_LIFE_MS - BLOB_FADE_MS;
    const expected = Math.floor((activeEnd - stoppedAt) / BLOB_TICK_MS);
    expect(hitTimes.length).toBeGreaterThanOrEqual(expected);
    for (let i = 1; i < hitTimes.length; i++) expect(hitTimes[i] - hitTimes[i - 1]).toBeLessThanOrEqual(BLOB_TICK_MS + 50);
  });
  it('出てすぐ(180ms)は当たりも絵と同じく小さい', () => {
    const b = createBlobShot('b', 0, 0, 1, 0, 0, 10);
    // 半径26なら当たる距離だが、出た瞬間の小さい塊には当たらない。
    const r = stepBlobShot(b, 0, 0, [enemy('z', 30, 0, 10, 10)], never, all);
    expect(r.hitIds).toEqual([]);
  });
  it('消える0.4秒は、押しのけも止まる判定もしない', () => {
    const b = { ...createBlobShot('b', 0, 0, 1, 0, 0, 10), nextTickAt: 1e9 };
    const gt = BLOB_LIFE_MS - BLOB_FADE_MS + 50;
    const r = stepBlobShot(b, 0.016, gt, [enemy('z', 5, 0), enemy('boss', 8, 0)], () => true, e => e.id === 'z');
    expect(r.pushes).toEqual([]);
    expect(r.stoppedNow).toBe(false);
  });
});

describe('品質監査#3: 射程=消え始めるまでに進める道のり(約404px)', () => {
  it('blobReachPx は約404px', () => {
    expect(blobReachPx()).toBeGreaterThan(400);
    expect(blobReachPx()).toBeLessThan(408);
  });
});

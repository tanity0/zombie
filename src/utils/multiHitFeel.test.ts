import { describe, it, expect } from 'vitest';
import {
  multiHitFeel, multiHitStopExtendPatch, multiHitFxSpot, multiHitStagger, multiHitSfxLayers, multiHitReleaseDelay, multiHitBurstRings, multiHitLinePath, multiHitArcPath,
  MULTI_HIT_STOP_MAX_MS, MULTI_HIT_STAGGER_MS, MULTI_HIT_FLASH_MAX, MULTI_HIT_SFX_MAX, MULTI_HIT_RELEASE_MAX_MS,
} from './multiHitFeel';

describe('multiHitFeel(まとめて当てた時の手応え)', () => {
  it('n=0/1 は全部0(=今と同じ)', () => {
    for (const n of [0, 1, -3, NaN]) {
      expect(multiHitFeel(n)).toEqual({ extraStopMs: 0, shakeMs: 0, shakeMag: 0, staggerFx: false, bigFx: false, hugeFx: false });
    }
  });
  it('止めは2体目から1体ごとに+20ms・n>=4 で+60ms頭打ち', () => {
    expect(multiHitFeel(2).extraStopMs).toBe(20);
    expect(multiHitFeel(3).extraStopMs).toBe(40);
    expect(multiHitFeel(4).extraStopMs).toBe(60);
    expect(multiHitFeel(9).extraStopMs).toBe(MULTI_HIT_STOP_MAX_MS);
  });
  it('揺れは n>=2 で足す・長さ 60+40×(n−1)・強さ 2+2×(n−1)・(n−1)は3で頭打ち', () => {
    expect(multiHitFeel(2)).toMatchObject({ shakeMs: 100, shakeMag: 4 });
    expect(multiHitFeel(3)).toMatchObject({ shakeMs: 140, shakeMag: 6 });
    expect(multiHitFeel(4)).toMatchObject({ shakeMs: 180, shakeMag: 8 });
    expect(multiHitFeel(12)).toMatchObject({ shakeMs: 180, shakeMag: 8 });
  });
  it('1体ごとの閃きは n>=2・止めの明けの輪は n>=3・ご褒美は n>=5 から', () => {
    expect(multiHitFeel(2)).toMatchObject({ staggerFx: true, bigFx: false, hugeFx: false });
    expect(multiHitFeel(3)).toMatchObject({ staggerFx: true, bigFx: true, hugeFx: false });
    expect(multiHitFeel(4)).toMatchObject({ bigFx: true, hugeFx: false });
    expect(multiHitFeel(5)).toMatchObject({ bigFx: true, hugeFx: true });
  });
  it('数が多いほど弱くならない(単調)', () => {
    for (let n = 1; n < 10; n++) {
      const a = multiHitFeel(n), b = multiHitFeel(n + 1);
      expect(b.extraStopMs).toBeGreaterThanOrEqual(a.extraStopMs);
      expect(b.shakeMs).toBeGreaterThanOrEqual(a.shakeMs);
      expect(b.shakeMag).toBeGreaterThanOrEqual(a.shakeMag);
    }
  });
});

describe('multiHitStopExtendPatch(当たった敵の止めを延ばす)', () => {
  const now = 1000;
  it('止まっていない敵には新しく止めを作らない', () => {
    expect(multiHitStopExtendPatch({}, now, 40)).toBeNull();
    expect(multiHitStopExtendPatch({ hitStunUntil: now }, now, 40)).toBeNull();
    expect(multiHitStopExtendPatch({ hitStunUntil: now - 5 }, now, 40)).toBeNull();
  });
  it('延ばす長さ0なら書かない(n=1 は今と同じ)', () => {
    expect(multiHitStopExtendPatch({ hitStunUntil: now + 100 }, now, 0)).toBeNull();
  });
  it('止めだけ延ばす(押しが無い)', () => {
    expect(multiHitStopExtendPatch({ hitStunUntil: now + 100 }, now, 40)).toEqual({ hitStunUntil: now + 140 });
  });
  it('押しの残りは同じだけ後ろへずらす(押しの距離は変えない)', () => {
    expect(multiHitStopExtendPatch({ hitStunUntil: now + 100, knockbackUntil: now + 380 }, now, 40))
      .toEqual({ hitStunUntil: now + 140, knockbackUntil: now + 420 });
  });
  it('止めの長さを覚えている押しの印も一緒にずらす', () => {
    expect(multiHitStopExtendPatch({ hitStunUntil: now + 100, knockbackUntil: now + 380, knockbackStopFor: now + 380 }, now, 60))
      .toEqual({ hitStunUntil: now + 160, knockbackUntil: now + 440, knockbackStopFor: now + 440 });
  });
  it('終わった押しは触らない', () => {
    expect(multiHitStopExtendPatch({ hitStunUntil: now + 100, knockbackUntil: now - 1 }, now, 20)).toEqual({ hitStunUntil: now + 120 });
  });
});

describe('multiHitStagger(1体ごとの閃きの順番)', () => {
  it('プレイヤーに近い順に 20ms ずつずらす', () => {
    const r = multiHitStagger([{ x: 300, y: 0, id: 'c' }, { x: 100, y: 0, id: 'a' }, { x: 200, y: 0, id: 'b' }], { x: 0, y: 0 });
    expect(r.map(q => q.p.id)).toEqual(['a', 'b', 'c']);
    expect(r.map(q => q.delayMs)).toEqual([0, MULTI_HIT_STAGGER_MS, 2 * MULTI_HIT_STAGGER_MS]);
  });
  it('上限より多い当たりは後ろを出さない', () => {
    const pts = Array.from({ length: 20 }, (_, i) => ({ x: i * 10, y: 0 }));
    expect(multiHitStagger(pts, { x: 0, y: 0 })).toHaveLength(MULTI_HIT_FLASH_MAX);
  });
});

describe('multiHitSfxLayers(ずらして鳴らす命中音)', () => {
  it('n<=1 は空(=今と同じ)', () => {
    expect(multiHitSfxLayers(1, 1, 1)).toEqual([]);
    expect(multiHitSfxLayers(0, 1, 1)).toEqual([]);
  });
  it('2発目から当たった数だけ・上限5発(1発目を含む)・後ろほど遅く小さく高い', () => {
    expect(multiHitSfxLayers(3, 1, 1)).toHaveLength(2);
    const l = multiHitSfxLayers(12, 1, 1);
    expect(l).toHaveLength(MULTI_HIT_SFX_MAX - 1);
    for (let i = 1; i < l.length; i++) {
      expect(l[i].delayMs).toBeGreaterThan(l[i - 1].delayMs);
      expect(l[i].gain).toBeLessThan(l[i - 1].gain);
      expect(l[i].rate).toBeGreaterThan(l[i - 1].rate);
    }
    expect(l[0].delayMs).toBe(MULTI_HIT_STAGGER_MS);
    expect(l.every(x => x.gain > 0)).toBe(true);
  });
});

describe('multiHitReleaseDelay(止めの明けの時刻)', () => {
  it('止まっている敵の明けの一番遅いもの', () => {
    expect(multiHitReleaseDelay([1100, 1140, undefined, 900], 1000, 40)).toBe(140);
  });
  it('止まっている敵が居なければ上乗せの長さ', () => {
    expect(multiHitReleaseDelay([undefined, 900], 1000, 40)).toBe(40);
  });
  it('長すぎる止めは上限で切る', () => {
    expect(multiHitReleaseDelay([5000], 1000, 40)).toBe(MULTI_HIT_RELEASE_MAX_MS);
  });
});

describe('multiHitBurstRings(弾ける輪の組)', () => {
  it('1本目は太く速く明るい・2本目は遅れて外へ薄く・5体以上は3本目がさらに遅れて外へ', () => {
    const a = multiHitBurstRings(200, false);
    expect(a).toHaveLength(2);
    expect(a[1].delayMs).toBeGreaterThan(a[0].delayMs);
    expect(a[1].end).toBeGreaterThan(a[0].end);
    expect(a[1].alpha).toBeLessThan(a[0].alpha);
    const b = multiHitBurstRings(200, true);
    expect(b).toHaveLength(3);
    expect(b[2].delayMs).toBeGreaterThan(b[1].delayMs);
    expect(b[2].end).toBeGreaterThan(b[1].end);
  });
  it('倍率で外へ大きく(格闘)', () => {
    expect(multiHitBurstRings(200, false, 1.35)[1].end).toBeCloseTo(multiHitBurstRings(200, false)[1].end * 1.35);
  });
});

describe('multiHitArcPath(鞭の弧に沿った粒)', () => {
  it('自分から見た当たりの弧に沿って並べ、なぞる順に遅れる', () => {
    const a = multiHitArcPath([{ x: 100, y: -100 }, { x: 100, y: 100 }], { x: 0, y: 0 }, 5, 70, 0);
    expect(a).toHaveLength(5);
    expect(a[0].delayMs).toBe(0);
    expect(a[4].delayMs).toBe(70);
    for (const p of a) expect(Math.hypot(p.x, p.y)).toBeCloseTo(Math.hypot(100, 100));
    expect(a[0].ang).toBeCloseTo(-Math.PI / 4);
    expect(a[4].ang).toBeCloseTo(Math.PI / 4);
  });
  it('真後ろをまたぐ弧でも短い側でつなぐ', () => {
    const a = multiHitArcPath([{ x: -100, y: -10 }, { x: -100, y: 10 }], { x: 0, y: 0 }, 3, 70, 0);
    for (const p of a) expect(p.x).toBeLessThan(0);
  });
  it('空なら出さない', () => { expect(multiHitArcPath([], { x: 0, y: 0 }, 5)).toEqual([]); });
});

describe('multiHitLinePath(刀の白い筋の通り道)', () => {
  it('振った向きへ並べて最初から最後まで', () => {
    expect(multiHitLinePath([{ x: 300, y: 10 }, { x: 0, y: 0 }, { x: 150, y: 5 }], 1, 0)).toEqual({ x0: 0, y0: 0, x1: 300, y1: 10 });
  });
  it('重なった当たりは向きに沿って前後へ伸ばす', () => {
    const p = multiHitLinePath([{ x: 10, y: 10 }, { x: 10, y: 10 }], 0, 1, 100)!;
    expect(p).toEqual({ x0: 10, y0: -40, x1: 10, y1: 60 });
  });
});

describe('multiHitFxSpot(弾ける輪の置き場所)', () => {
  it('空なら出さない', () => { expect(multiHitFxSpot([])).toBeNull(); });
  it('重心に置き、当たりの広がりに比例して大きくなる', () => {
    const s = multiHitFxSpot([{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 100, y: 0 }])!;
    expect(s.x).toBeCloseTo(100);
    expect(s.y).toBeCloseTo(0);
    const narrow = multiHitFxSpot([{ x: 90, y: 0 }, { x: 110, y: 0 }, { x: 100, y: 0 }])!;
    expect(s.r).toBeGreaterThan(narrow.r + 80);
  });
  it('3体と5体で大きさの差が見える(同じ広がりでも)', () => {
    const three = multiHitFxSpot([{ x: -60, y: 0 }, { x: 60, y: 0 }, { x: 0, y: 0 }])!;
    const five = multiHitFxSpot([{ x: -60, y: 0 }, { x: 60, y: 0 }, { x: 0, y: 0 }, { x: -30, y: 0 }, { x: 30, y: 0 }])!;
    expect(five.r - three.r).toBeGreaterThanOrEqual(30);
  });
});

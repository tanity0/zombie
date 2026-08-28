import { describe, it, expect } from 'vitest';
import {
  stepReaperBody, encircleRadiusPx, encirclePoints, corridorEncirclePoints,
  stepServantPopulation, knockbackCdReady,
} from './reaper2';

describe('stepReaperBody — 直進+70px旋回(PACING_PUZZLE.md §14-4-2)', () => {
  it('縁距離より遠ければプレイヤーへ直進する', () => {
    const r = stepReaperBody(0, 0, 100, 0, 10, 5, 70);
    expect(r.orbiting).toBe(false);
    expect(r.x).toBeCloseTo(10, 6);
    expect(r.y).toBeCloseTo(0, 6);
  });

  it('縁距離ちょうど/内側では旋回に切り替わり、プレイヤーからの距離(半径)を保つ', () => {
    // 半径70の位置からスタート
    const r = stepReaperBody(70, 0, 0, 0, 999 /* 直進なら大きく飛ぶはずが旋回では効かない */, 10, 70);
    expect(r.orbiting).toBe(true);
    const distAfter = Math.hypot(r.x - 0, r.y - 0);
    expect(distAfter).toBeCloseTo(70, 6); // 半径不変
    // 旋回で位置は変わる(その場に留まらない)
    expect(Math.hypot(r.x - 70, r.y - 0)).toBeGreaterThan(0.01);
  });

  it('プレイヤーとの距離が0でも直進枝は例外を投げない(現在地に留まる)', () => {
    const r = stepReaperBody(5, 5, 5, 5, 10, 5, 0);
    expect(Number.isFinite(r.x)).toBe(true);
    expect(Number.isFinite(r.y)).toBe(true);
  });

  it('直進のstepPxが0なら位置は動かない', () => {
    const r = stepReaperBody(0, 0, 100, 0, 0, 5, 70);
    expect(r.x).toBeCloseTo(0, 6);
    expect(r.y).toBeCloseTo(0, 6);
  });
});

describe('encircleRadiusPx — 囲み半径(中8/中9・ズームで割る)', () => {
  it('ズーム1.0なら画面対角の半分+margin', () => {
    const r = encircleRadiusPx(800, 600, 1, 50);
    expect(r).toBeCloseTo(Math.hypot(400, 300) + 50, 6);
  });

  it('ズームを引く(小さい値)ほど半径は大きくなる=最大引きでも画面外を保証', () => {
    const zoomedOut = encircleRadiusPx(800, 600, 0.4, 50);
    const normal = encircleRadiusPx(800, 600, 1, 50);
    expect(zoomedOut).toBeGreaterThan(normal);
  });
});

describe('encirclePoints — 均等配置(§14-4-3叩き台)', () => {
  it('n体を円周上に均等配置し、全点がプレイヤー中心から半径distanceにある', () => {
    const pts = encirclePoints(5, 100, 200, 300);
    expect(pts).toHaveLength(5);
    for (const p of pts) {
      expect(Math.hypot(p.x - 100, p.y - 200)).toBeCloseTo(300, 6);
    }
  });

  it('0体は空配列(落ちない)', () => {
    expect(encirclePoints(0, 0, 0, 100)).toEqual([]);
  });

  it('1体は起点角の位置に1つだけ', () => {
    const pts = encirclePoints(1, 0, 0, 10, 0);
    expect(pts).toHaveLength(1);
    expect(pts[0].x).toBeCloseTo(10, 6);
    expect(pts[0].y).toBeCloseTo(0, 6);
  });
});

describe('corridorEncirclePoints — 廊下縮退(左右2点)', () => {
  it('左右2点のみ返す', () => {
    const pts = corridorEncirclePoints(50, 50, 200);
    expect(pts).toEqual([{ x: -150, y: 50 }, { x: 250, y: 50 }]);
  });
});

describe('stepServantPopulation — 10秒毎+1・上限まで', () => {
  it('interval未満なら増えない', () => {
    const r = stepServantPopulation({ count: 1, lastAddAt: 1000 }, 5000, 10000, 5);
    expect(r).toEqual({ count: 1, lastAddAt: 1000, added: false });
  });

  it('interval経過で+1', () => {
    const r = stepServantPopulation({ count: 1, lastAddAt: 1000 }, 11000, 10000, 5);
    expect(r).toEqual({ count: 2, lastAddAt: 11000, added: true });
  });

  it('上限に達したら増えない(interval経過でも)', () => {
    const r = stepServantPopulation({ count: 5, lastAddAt: 1000 }, 99999, 10000, 5);
    expect(r).toEqual({ count: 5, lastAddAt: 1000, added: false });
  });

  it('死亡で数が減った後、次のinterval到達で埋まっていく(即補充の歩進)', () => {
    let s = { count: 3, lastAddAt: 0 }; // 1体死んで5→3(呼び出し側がcountを引いた想定)
    s = stepServantPopulation(s, 10000, 10000, 5);
    expect(s).toMatchObject({ count: 4, added: true });
    s = stepServantPopulation(s, 20000, 10000, 5);
    expect(s).toMatchObject({ count: 5, added: true });
    s = stepServantPopulation(s, 30000, 10000, 5);
    expect(s).toMatchObject({ count: 5, added: false }); // 上限で頭打ち
  });
});

describe('knockbackCdReady — hangedmanのKB特例(裁定済み#6/#8)', () => {
  it('hangedmanは免疫CD中でも常にtrue(全ヒットが積む)', () => {
    expect(knockbackCdReady({ type: 'hangedman', knockbackImmuneUntil: 999999 }, 0)).toBe(true);
  });

  it('他タイプは従来どおり免疫CDを見る', () => {
    expect(knockbackCdReady({ type: 'zombie', knockbackImmuneUntil: 1000 }, 500)).toBe(false);
    expect(knockbackCdReady({ type: 'zombie', knockbackImmuneUntil: 1000 }, 1500)).toBe(true);
  });

  it('knockbackImmuneUntil未指定は0扱い=常にCD明け', () => {
    expect(knockbackCdReady({ type: 'zombie' }, 0)).toBe(true);
  });
});

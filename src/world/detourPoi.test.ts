// 寄り道POI(PACING_PUZZLE.md §6.24 M48)の配置ロジック。不変条件(発注メモ4)を機械化する:
// 「3種+裏ボスが4セクターに1つずつ(重複なし・空きなし)」「裏ボスのセクターは動かない」
// 「距離は必ず区域の中点」「3種とも毎ラン必ず出る(抽選しない)」。
import { describe, it, expect } from 'vitest';
import { AREA_THRESHOLDS } from '../utils/enemyUtils';
import {
  DETOUR_DIST, detourPosForSector, assignDetourSectors, sectorAngle,
} from './detourPoi';
import { POI_SECTORS, sectorIndexForAngle } from './pois';

// 決定的な乱数列を注入するためのヘルパー(Fisher-Yatesの各引きを固定値で消費する)。
const seq = (...values: number[]) => {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
};

describe('DETOUR_DIST(距離=区域の中点で固定)', () => {
  // v0.25.3172/3173(社長決定): 3種ともデンジャーゾーン(3000〜5000)の中へ。帯を4等分して 25/50/75%。
  it('★3種ともデンジャーゾーンの中に入る(拠点3200の外・帯からはみ出さない)', () => {
    const lo = AREA_THRESHOLDS[1], hi = AREA_THRESHOLDS[2];
    for (const kind of ['police', 'armory', 'hospital'] as const) {
      expect(DETOUR_DIST[kind], kind).toBeGreaterThan(3200); // BASE_SITE_RADIUS=矢印を出す拠点
      expect(DETOUR_DIST[kind], kind).toBeGreaterThan(lo);
      expect(DETOUR_DIST[kind], kind).toBeLessThan(hi);
    }
  });

  it('警察署3500 < 武器庫4000 < 病院4500(価値の並び=帯の中の順・固定)', () => {
    const lo = AREA_THRESHOLDS[1], span = AREA_THRESHOLDS[2] - AREA_THRESHOLDS[1];
    expect(DETOUR_DIST.police).toBe(lo + span * 0.25);
    expect(DETOUR_DIST.armory).toBe(lo + span * 0.50);
    expect(DETOUR_DIST.hospital).toBe(lo + span * 0.75);
    expect(DETOUR_DIST.police).toBeLessThan(DETOUR_DIST.armory);
    expect(DETOUR_DIST.armory).toBeLessThan(DETOUR_DIST.hospital);
  });
});

// atan2 の値域(-π, π]に正規化(sectorAngle は 0..2π 側で返るため、比較前に合わせる)。
const normalizeAngle = (a: number): number => {
  let n = a;
  while (n > Math.PI) n -= Math.PI * 2;
  while (n <= -Math.PI) n += Math.PI * 2;
  return n;
};

describe('detourPosForSector(セクター中心の角度・kind別の固定距離)', () => {
  it('距離はkindごとのDETOUR_DISTと一致し、角度はセクター中心と一致する(=拠点と同じ方角)', () => {
    for (const kind of ['police', 'armory', 'hospital'] as const) {
      for (let sector = 0; sector < POI_SECTORS; sector++) {
        const p = detourPosForSector(kind, sector);
        expect(Math.hypot(p.x, p.y)).toBeCloseTo(DETOUR_DIST[kind], 6);
        // sectorIndexForAngleの逆変換が一致=このPOIは自分自身のセクターに属する(往復判定が一致)。
        expect(sectorIndexForAngle(Math.atan2(p.y, p.x))).toBe(sector);
        expect(Math.atan2(p.y, p.x)).toBeCloseTo(normalizeAngle(sectorAngle(sector)), 6);
      }
    }
  });
});

describe('assignDetourSectors(不変条件・発注メモ4)', () => {
  it('裏ボス有り: 3種+裏ボスが4セクターに1つずつ(重複なし・空きなし)', () => {
    for (let bossSector = 0; bossSector < POI_SECTORS; bossSector++) {
      const a = assignDetourSectors(bossSector, seq(0.9, 0.9, 0.9));
      const used = [a.police, a.armory, a.hospital];
      expect(new Set([...used, bossSector]).size).toBe(4); // 重複なし・裏ボスとも被らない
      for (const s of used) expect(s).not.toBe(bossSector); // 裏ボスのセクターは動かない/割り当てない
      for (const s of used) expect(s).toBeGreaterThanOrEqual(0);
      for (const s of used) expect(s).toBeLessThan(POI_SECTORS);
    }
  });

  it('裏ボス無し(null): 3種は残り4セクターのうち3つに必ず出る(抽選しない=3つとも値を持つ)', () => {
    const a = assignDetourSectors(null, seq(0.1, 0.4, 0.6, 0.2));
    expect(a.police).not.toBeUndefined();
    expect(a.armory).not.toBeUndefined();
    expect(a.hospital).not.toBeUndefined();
    const used = [a.police, a.armory, a.hospital];
    expect(new Set(used).size).toBe(3); // 重複なし
  });

  it('乱数源を変えると割り当てが変わりうる(=位置はランダム。呼び出しごとに固定はしない)', () => {
    const a = assignDetourSectors(0, seq(0.9, 0.9, 0.9));
    const b = assignDetourSectors(0, seq(0.1, 0.1, 0.1));
    // 少なくとも1つの役割で結果が変わることを期待(完全一致だとテストが弱い証拠になる)。
    const changed = a.police !== b.police || a.armory !== b.armory || a.hospital !== b.hospital;
    expect(changed).toBe(true);
  });

  it('既定の乱数源(Math.random)でも呼べる(=呼び出し側は rand を省略できる)', () => {
    const a = assignDetourSectors(2);
    const used = [a.police, a.armory, a.hospital];
    expect(new Set(used).size).toBe(3);
    for (const s of used) expect(s).not.toBe(2);
  });
});

describe('POI_SECTORS(4方角=4枠・§6.24 A2)', () => {
  it('4方角=4枠', () => {
    expect(POI_SECTORS).toBe(4);
  });
});

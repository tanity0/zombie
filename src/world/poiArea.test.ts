// 画面の目印の整理(社長「推薦で」2026-10-25): 遠くの目的地の矢印は今いるエリアの物だけ。
import { describe, it, expect } from 'vitest';
import { playerAreaSector, isPoiInPlayerArea, poiSectorIndex, bossLairPos, AREA_START_RADIUS_PX, AREA_HYSTERESIS_RAD } from './pois';

const at = (deg: number, r: number) => ({ x: Math.cos((deg * Math.PI) / 180) * r, y: Math.sin((deg * Math.PI) / 180) * r });
const R = AREA_START_RADIUS_PX * 3;

describe('今いるエリア', () => {
  it('東西南北のどの方角にいるか(拠点のセクターと同じ割り当て)', () => {
    expect(playerAreaSector(at(0, R).x, at(0, R).y, null)).toBe(0);
    expect(playerAreaSector(at(90, R).x, at(90, R).y, null)).toBe(1);
    expect(playerAreaSector(at(180, R).x, at(180, R).y, null)).toBe(2);
    expect(playerAreaSector(at(-90, R).x, at(-90, R).y, null)).toBe(3);
  });
  it('境目(45°)を少し越えてもちらつかない=前のエリアのまま。大きく越えたら切り替わる', () => {
    const edge = 45 + (AREA_HYSTERESIS_RAD * 180) / Math.PI / 2;
    expect(playerAreaSector(at(edge, R).x, at(edge, R).y, 0)).toBe(0);
    expect(playerAreaSector(at(edge, R).x, at(edge, R).y, 1)).toBe(1);
    expect(playerAreaSector(at(60, R).x, at(60, R).y, 0)).toBe(1);
  });
  it('スタート地点の近くは方角が定まらないので直前のエリアを引き継ぐ(初めは無し)', () => {
    expect(playerAreaSector(10, 10, null)).toBeNull();
    expect(playerAreaSector(10, 10, 2)).toBe(2);
  });
});

describe('遠くの目的地の矢印は今いるエリアの物だけ', () => {
  it('裏ボスの巣(西)は西のエリアにいる時だけ', () => {
    const lair = bossLairPos('mimir')!;
    expect(poiSectorIndex(lair)).toBe(2);
    expect(isPoiInPlayerArea(lair, 2)).toBe(true);
    expect(isPoiInPlayerArea(lair, 0)).toBe(false);
    expect(isPoiInPlayerArea(lair, null)).toBe(false);
  });
});

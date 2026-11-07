import { describe, it, expect } from 'vitest';
import { AREA_THRESHOLDS, AREA_ZONE_NAMES, areaIndexForDist, setAreaDistanceScale, AREA_THRESHOLDS_BASE } from './enemyUtils';
import { BOUNTY_SPAWN_Y_ABS_PX, BOUNTY_SPAWN_X_ABS_LIMIT_PX } from './bountyTick';

/**
 * ★区域境界の一本化(v0.25.4450)の再発防止。
 *
 * 世界の距離スケール(×1.5・v0.25.4293)で境界が動いた時、**境界の数字を写していた側だけが
 * 取り残された**。当時これを捕まえるテストは1本も無く(332件が全部緑のまま)、
 * 区域バナー・囲いゲート①②・凶悪ハンター・紅き夜・リザルトの最深到達・深層BGM・退色グレード・
 * 賞金首の湧きが、揃って「ひとつ内側」で動いていた。
 * ⇒ **「距離から区域を引く道は1本だけ」**と**「帯の中の位置は帯から導出する」**を機械で固定する。
 */
describe('区域境界は1本の正本から引く', () => {
  it('区域の数と名前の数が合っている', () => {
    expect(AREA_ZONE_NAMES.length).toBe(AREA_THRESHOLDS.length + 1);
  });

  it('★境界そのものは外側の区域に属する(">=" で判定している)', () => {
    AREA_THRESHOLDS.forEach((t, i) => {
      expect(areaIndexForDist(t)).toBe(i + 1);
      expect(areaIndexForDist(t - 1)).toBe(i);
    });
  });

  it('★世界スケールの切替(訓練M0)でも同じ関数が追従する=境界を写した実装が無い', () => {
    try {
      setAreaDistanceScale(false);
      AREA_THRESHOLDS_BASE.forEach((t, i) => {
        expect(areaIndexForDist(t)).toBe(i + 1);
        expect(areaIndexForDist(t - 1)).toBe(i);
      });
    } finally {
      setAreaDistanceScale(true);
    }
  });

  it('区域は原点から外へ単調に上がる', () => {
    let prev = -1;
    for (let d = 0; d <= AREA_THRESHOLDS[AREA_THRESHOLDS.length - 1] + 5000; d += 250) {
      const i = areaIndexForDist(d);
      expect(i).toBeGreaterThanOrEqual(prev);
      prev = i;
    }
  });
});

describe('賞金首の湧きは研究領域の帯から導出する', () => {
  it('★y は帯の真ん中(内縁でも外縁でもない)', () => {
    const inner = AREA_THRESHOLDS[0], outer = AREA_THRESHOLDS[1];
    expect(BOUNTY_SPAWN_Y_ABS_PX).toBeGreaterThan(inner + (outer - inner) * 0.4);
    expect(BOUNTY_SPAWN_Y_ABS_PX).toBeLessThan(inner + (outer - inner) * 0.6);
  });

  it('★x を上限まで振っても研究領域(area 1)から出ない', () => {
    const r = Math.hypot(BOUNTY_SPAWN_X_ABS_LIMIT_PX, BOUNTY_SPAWN_Y_ABS_PX);
    expect(areaIndexForDist(r)).toBe(1);
  });

  it('★活動限界(巣から1200px)でも未確認汚染エリアへ届かない', () => {
    const r = Math.hypot(BOUNTY_SPAWN_X_ABS_LIMIT_PX, BOUNTY_SPAWN_Y_ABS_PX);
    expect(areaIndexForDist(r + 1200)).toBeLessThan(3);
  });
});

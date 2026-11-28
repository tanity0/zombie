// 2026-11-26(社長「はい」=ボス戦のカメラは詰めたまま、銃の射程だけを詰める前の画角で決める)。
import { describe, it, expect, afterEach } from 'vitest';
import { useGameStore } from '../store/gameStore';
import { zoomedGunRange, gunRangeZoomOf, RANGE_BY_CATEGORY } from './weaponUtils';
import {
  bossDistanceZoomTarget, BOSS_LEGACY_FRAMING_TUNING, BOSS_ZOOM_PROFILES, bossZoomClassFor,
} from './cameraZoom';
import type { EnemyType } from '../types/game';

// 詰める前(2026-11-26 以前)の bossDistanceZoomTarget を手で書き下したもの(横の端=0.28・余白40・帯0.45・距離1200・絵の端まで全部)。
const smooth01 = (r: number) => { const t = Math.max(0, Math.min(1, r)); return t * t * (3 - 2 * t); };
const oldTarget = (type: EnemyType, gap: number, dx: number, dy: number, halfW: number, vp: { width: number; height: number }) => {
  const p = BOSS_ZOOM_PROFILES[bossZoomClassFor(type, false)];
  const anchor = gap <= 180 ? p.near : p.near + (p.far - p.near) * Math.min(1, (gap - 180) / (1200 - 180));
  const farDx = Math.abs(dx) + halfW;
  const hardX = Math.max(0.01, 0.72 * vp.width - 40) / Math.max(1, farDx);
  if (gap <= 180) return Math.max(p.far, Math.min(anchor, hardX));
  const needY = Math.max(0.01, (vp.height * 0.45) / 2 - 40) / Math.max(1, Math.abs(dy));
  const frame = Math.min(hardX, needY);
  const w = smooth01((gap - 180) / (500 - 180));
  const blended = anchor + (Math.min(anchor, frame) - anchor) * w;
  return Math.max(p.far, Math.min(blended, hardX));
};

describe('★銃の射程はボス戦中、詰める前の画角で決める(2026-11-26)', () => {
  const phone = { width: 405, height: 878 };
  afterEach(() => useGameStore.setState({ viewZoom: 1, gunRangeZoom: null }));

  const cases: Array<{ name: string; type: EnemyType; gap: number; halfW: number }> = [
    { name: 'ミーミル(絵の半幅203)', type: 'mimir', gap: 200, halfW: 203 },
    { name: 'トール(絵の半幅140)', type: 'thor', gap: 300 - (140 + 28) / 2, halfW: 140 },
  ];
  for (const c of cases) {
    it(`スマホ・真横300の${c.name}: 射程の画角=詰める前と一致、カメラ(今の画角)より引いている`, () => {
      const fr = { dxCenter: 300, dyCenter: 0, viewport: phone, halfW: c.halfW, artHalfW: c.halfW };
      const legacy = bossDistanceZoomTarget(c.type, c.gap, false, fr, BOSS_LEGACY_FRAMING_TUNING);
      const before = oldTarget(c.type, c.gap, 300, 0, c.halfW, phone);
      expect(legacy).toBeCloseTo(before, 9);
      const cam = bossDistanceZoomTarget(c.type, c.gap, false, fr);
      expect(cam).toBeGreaterThan(legacy); // カメラは詰めた(寄った)まま
      // 射程: カメラの画角(viewZoom)が寄っても、gunRangeZoom(詰める前)で決まる=前と同じ値
      useGameStore.setState({ viewZoom: cam, gunRangeZoom: legacy });
      const hg = zoomedGunRange(RANGE_BY_CATEGORY.handgun);
      expect(hg).toBeCloseTo(RANGE_BY_CATEGORY.handgun / Math.min(1, before), 6);
      expect(hg).toBeGreaterThan(RANGE_BY_CATEGORY.handgun / cam + 1); // 詰めた画角のままより長い
    });
  }

  it('ミーミルの試算: ハンドガン 約340px(詰める前)を保つ', () => {
    const fr = { dxCenter: 300, dyCenter: 0, viewport: phone, halfW: 203 };
    const legacy = bossDistanceZoomTarget('mimir', 200, false, fr, BOSS_LEGACY_FRAMING_TUNING);
    useGameStore.setState({ viewZoom: 0.75, gunRangeZoom: legacy });
    expect(zoomedGunRange(RANGE_BY_CATEGORY.handgun)).toBeGreaterThan(330);
    expect(zoomedGunRange(RANGE_BY_CATEGORY.handgun)).toBeLessThan(370);
  });

  it('ボス戦以外(gunRangeZoom=null)は viewZoom そのまま=従来と1bit同値', () => {
    for (const z of [1, 0.8, 0.55, 0.4]) {
      useGameStore.setState({ viewZoom: z, gunRangeZoom: null });
      expect(gunRangeZoomOf(useGameStore.getState())).toBe(z);
      expect(zoomedGunRange(170)).toBe(170 / z);
    }
  });
});

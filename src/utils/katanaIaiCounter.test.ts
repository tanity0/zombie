// 居合一閃(research/KATANA_TSUBAME.md §5・5-5 が正)の純関数。
import { describe, it, expect } from 'vitest';
import {
  rayRectEntryDist, iaiWarpPlan, iaiStrikeLength, iaiWalkBack, iaiCounterRoute, pickIaiSubject, iaiClosedWindowEnd,
  iaiAfterimageAlpha, iaiSlowLostMs, iaiReleaseAt, isIaiHolding, iaiStanceWindowEnd, isIaiRunSubject, KATANA_IAI_WARP_GAP_PX, KATANA_IAI_WARP_MAX_PX, KATANA_IAI_PASS_MARGIN_PX, KATANA_IAI_AFTERIMAGE_MS,
  type IaiRouteInput,
} from './katanaIaiCounter';

const box = (cx: number, cy: number, w: number, h: number) => ({ x: cx - w / 2, y: cy - h / 2, width: w, height: h });

describe('rayRectEntryDist', () => {
  it('右の箱の左の縁までの距離', () => {
    expect(rayRectEntryDist({ x: 0, y: 0 }, 1, 0, box(100, 0, 40, 40))).toBeCloseTo(80);
  });
  it('中に居れば0・外れれば Infinity', () => {
    expect(rayRectEntryDist({ x: 100, y: 0 }, 1, 0, box(100, 0, 40, 40))).toBe(0);
    expect(rayRectEntryDist({ x: 0, y: 0 }, -1, 0, box(100, 0, 40, 40))).toBe(Infinity);
    expect(rayRectEntryDist({ x: 0, y: 100 }, 1, 0, box(100, 0, 40, 40))).toBe(Infinity);
  });
  it('斜め', () => {
    const d = rayRectEntryDist({ x: 0, y: 0 }, Math.SQRT1_2, Math.SQRT1_2, box(100, 100, 40, 40));
    expect(d).toBeCloseTo(80 * Math.SQRT2);
  });
});

describe('iaiWarpPlan(ワープ先=自分→主の中心の線上・体の縁から24px手前・上限300px)', () => {
  it('縁から24px手前の線上', () => {
    const p = iaiWarpPlan({ x: 0, y: 0 }, box(200, 0, 40, 40))!;
    expect(p.x).toBeCloseTo(180 - KATANA_IAI_WARP_GAP_PX);
    expect(p.y).toBeCloseTo(0);
    expect(p.ux).toBeCloseTo(1); expect(p.uy).toBeCloseTo(0);
    expect(p.dist).toBeCloseTo(156);
  });
  it('上(画面の奥)へも同じ線の上', () => {
    const p = iaiWarpPlan({ x: 0, y: 0 }, box(0, -200, 40, 40))!;
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(-(180 - KATANA_IAI_WARP_GAP_PX));
    expect(p.uy).toBeCloseTo(-1);
  });
  it('既に間合いの内なら動かない', () => {
    const p = iaiWarpPlan({ x: 0, y: 0 }, box(30, 0, 40, 40))!;
    expect(p.dist).toBe(0);
    expect(p.x).toBe(0); expect(p.y).toBe(0);
  });
  it('上限ちょうどは出る・超えると null(今のカウンター)', () => {
    const edge = KATANA_IAI_WARP_MAX_PX + KATANA_IAI_WARP_GAP_PX;
    expect(iaiWarpPlan({ x: 0, y: 0 }, box(edge + 20, 0, 40, 40))).not.toBeNull();
    expect(iaiWarpPlan({ x: 0, y: 0 }, box(edge + 21, 0, 40, 40))).toBeNull();
  });
  it('中心が重なっていれば fallback の向き・動かない', () => {
    const p = iaiWarpPlan({ x: 50, y: 50 }, box(50, 50, 40, 40), { x: 0, y: 2 })!;
    expect(p.dist).toBe(0);
    expect(p.ux).toBeCloseTo(0); expect(p.uy).toBeCloseTo(1);
  });
});

describe('iaiStrikeLength(抜ける道=max(一閃の距離, 体の幅+48))', () => {
  it('小さい敵は一閃の距離', () => { expect(iaiStrikeLength(154, 30)).toBe(154); });
  it('大きいボスは体の幅+48', () => { expect(iaiStrikeLength(154, 200)).toBe(200 + KATANA_IAI_PASS_MARGIN_PX); });
  it('ワープ先(縁の24px手前)から幅いっぱいの体を抜け切る', () => {
    for (const w of [20, 60, 120, 240, 400]) {
      const len = iaiStrikeLength(154, w);
      expect(len).toBeGreaterThan(KATANA_IAI_WARP_GAP_PX + w); // 体の後ろの縁を越える
    }
  });
});

describe('iaiWalkBack(行けない所なら線の上を自分の側へ戻って一番近い行ける所)', () => {
  it('ワープ先が立てればそのまま', () => {
    expect(iaiWalkBack({ x: 0, y: 0 }, { x: 100, y: 0 }, () => true)).toEqual({ x: 100, y: 0 });
  });
  it('壁(x>=60 は立てない)なら自分の側の一番近い所', () => {
    const r = iaiWalkBack({ x: 0, y: 0 }, { x: 100, y: 0 }, x => x < 60, 4);
    expect(r.x).toBeLessThan(60);
    expect(r.x).toBeGreaterThanOrEqual(56);
    expect(r.y).toBe(0);
  });
  it('どこも立てなければ自分の位置(動かない)', () => {
    expect(iaiWalkBack({ x: 3, y: 4 }, { x: 100, y: 0 }, () => false)).toEqual({ x: 3, y: 4 });
  });
});

describe('iaiCounterRoute(置き換えの振り分け)', () => {
  const ok: IaiRouteInput = { katanaPlayer: true, windowOpen: true, hasSubject: true, subjectTouchable: true, withinWarpRange: true, blocked: false };
  it('全部揃えば居合一閃', () => { expect(iaiCounterRoute(ok)).toBe('iai'); });
  it.each([
    ['刀でない(ナイフ・鞭・格闘・守護霊)', { katanaPlayer: false }],
    ['窓が閉じている(2回目)', { windowOpen: false }],
    ['主の居ない弾き(弾・矢の雨・刃のパリィ)', { hasSubject: false }],
    ['触れない主(空中・isUntouchable)', { subjectTouchable: false }],
    ['遠すぎる主', { withinWarpRange: false }],
    ['殺陣の最中・行動不能', { blocked: true }],
  ] as const)('%s は今のカウンター', (_l, over) => {
    expect(iaiCounterRoute({ ...ok, ...over })).toBe('normal');
  });
});

describe('pickIaiSubject(同時に複数なら一番近い主)', () => {
  it('一番近い', () => {
    const a = { id: 'a', ...box(200, 0, 20, 20) }, b = { id: 'b', ...box(60, 0, 20, 20) }, c = { id: 'c', ...box(0, 120, 20, 20) };
    expect(pickIaiSubject([a, b, c], { x: 0, y: 0 })?.id).toBe('b');
    expect(pickIaiSubject([], { x: 0, y: 0 })).toBeNull();
  });
});

describe('iaiClosedWindowEnd(出た瞬間に窓を閉じる)', () => {
  it('今より前へ・既に閉じていれば触らない', () => {
    expect(iaiClosedWindowEnd(1500, 1000)).toBe(999);
    expect(iaiClosedWindowEnd(800, 1000)).toBe(800);
  });
});

describe('iaiAfterimageAlpha(残像は一瞬・減速しながら消える)', () => {
  it('出た瞬間が一番濃く、尺で0', () => {
    expect(iaiAfterimageAlpha(1000, 1000)).toBe(1);
    expect(iaiAfterimageAlpha(1000, 1000 + KATANA_IAI_AFTERIMAGE_MS)).toBe(0);
    expect(iaiAfterimageAlpha(undefined, 1000)).toBe(0);
    const a1 = iaiAfterimageAlpha(1000, 1040), a2 = iaiAfterimageAlpha(1000, 1080), a3 = iaiAfterimageAlpha(1000, 1120);
    expect(a1).toBeGreaterThan(a2); expect(a2).toBeGreaterThan(a3);
    expect(a1 - a2).toBeGreaterThan(a2 - a3); // 減速(落ち方が緩む)
  });
});

describe('iaiSlowLostMs(スローで進まなかった実時間)', () => {
  it('等速なら0・0.2倍なら進んだゲーム内の時間の4倍', () => {
    expect(iaiSlowLostMs(0.016, 1)).toBe(0);
    expect(iaiSlowLostMs(0.002, 0.2)).toBeCloseTo(8);
    expect(iaiSlowLostMs(0.01, 0)).toBe(0);
  });
});

describe('居合一閃の溜め(Counter! の演出が終わるまで構えたまま)', () => {
  it('放つ時刻=成立の時刻+吹き出しと寄りの長い方', () => {
    expect(iaiReleaseAt(1000, 700, 320)).toBe(1700);
    expect(iaiReleaseAt(1000, 200, 320)).toBe(1320);
    expect(iaiReleaseAt(1000, -5, -5)).toBe(1000); // 負の長さは0
  });
  it('溜めの最中=放つ時刻の手前まで', () => {
    expect(isIaiHolding({ iaiHoldUntil: 1700 }, 1699)).toBe(true);
    expect(isIaiHolding({ iaiHoldUntil: 1700 }, 1700)).toBe(false);
    expect(isIaiHolding({}, 0)).toBe(false);
  });
  it('構えの絵の終わり=窓と溜めの遅い方。この窓より前の溜めは見ない', () => {
    expect(iaiStanceWindowEnd(1000, 1099, 1700)).toBe(1700); // 成立で窓は閉じても、放つまで構える
    expect(iaiStanceWindowEnd(1000, 1300, undefined)).toBe(1300);
    expect(iaiStanceWindowEnd(5000, 5300, 1700)).toBe(5300); // 前の溜め(新しい窓より前)は効かない
  });
  it('溜めの間も、貫く主は「走っている居合一閃の主」と同じに扱う', () => {
    expect(isIaiRunSubject({ iaiHoldTargetId: 'z', iaiHoldUntil: 1700 }, 'z', 1500)).toBe(true);
    expect(isIaiRunSubject({ iaiHoldTargetId: 'z', iaiHoldUntil: 1700 }, 'y', 1500)).toBe(false);
    expect(isIaiRunSubject({ iaiHoldTargetId: 'z', iaiHoldUntil: 1700 }, 'z', 1700)).toBe(false);
    expect(isIaiRunSubject({ iaiWarpTargetId: 'z', iaiRunUntil: 2000 }, 'z', 1900)).toBe(true);
  });
});

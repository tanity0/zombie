import { describe, it, expect } from 'vitest';
import {
  poiTouchStarts, poiTouchMayFire, poiTouchFlashAlpha, poiTouchStallMult, poiTouchPushPx, poiTouchCamPx, poiTouchPitchJitter,
  POI_TOUCH_FLASH_PEAK, POI_TOUCH_FLASH_MS, POI_TOUCH_STALL_MS, POI_TOUCH_PUSH_PX, POI_TOUCH_CAM_PX, POI_TOUCH_CAM_IN_MS, POI_TOUCH_CAM_OUT_MS,
  POI_TOUCH_PUSH_IN_MS, POI_TOUCH_PUSH_OUT_MS, POI_TOUCH_SOUND,
} from './poiTouch';

describe('poiTouchStarts(触れ始めの検出)', () => {
  it('離れていた→触れた で1回だけ出る', () => {
    expect(poiTouchStarts([], ['armory']).started).toEqual(['armory']);
  });
  it('触れ続けている間は出ない', () => {
    expect(poiTouchStarts(['armory'], ['armory']).started).toEqual([]);
  });
  it('離れてまた触れたら、また出る', () => {
    const a = poiTouchStarts(['armory'], []);
    expect(a.started).toEqual([]);
    expect(a.next).toEqual([]);
    expect(poiTouchStarts(a.next, ['armory']).started).toEqual(['armory']);
  });
  it('複数同時でも別々に数え、重複は1つにまとめる', () => {
    const r = poiTouchStarts(['hospital'], ['hospital', 'shrine-body', 'shrine-body']);
    expect(r.started).toEqual(['shrine-body']);
    expect(r.next).toEqual(['hospital', 'shrine-body']);
  });
});

describe('poiTouchMayFire(触れ直しの間隔)', () => {
  it('初回は出る', () => { expect(poiTouchMayFire(undefined, 1000, 0)).toBe(true); });
  it('離れて800ms未満かつ16px未満は出ない', () => {
    expect(poiTouchMayFire({ endAt: 1000, x: 100 }, 1500, 105)).toBe(false);
  });
  it('800ms以上たてば出る', () => { expect(poiTouchMayFire({ endAt: 1000, x: 100 }, 1800, 100)).toBe(true); });
  it('16px以上離れていれば出る(左右どちらでも)', () => {
    expect(poiTouchMayFire({ endAt: 1000, x: 100 }, 1100, 116)).toBe(true);
    expect(poiTouchMayFire({ endAt: 1000, x: 100 }, 1100, 84)).toBe(true);
    expect(poiTouchMayFire({ endAt: 1000, x: 100 }, 1100, 115)).toBe(false);
  });
});

describe('手応えの時間包絡(建物は動かさない)', () => {
  it('光: 頂点は 0.25〜0.4、単調に抜けて110msで0', () => {
    expect(POI_TOUCH_FLASH_PEAK).toBeGreaterThanOrEqual(0.25);
    expect(POI_TOUCH_FLASH_PEAK).toBeLessThanOrEqual(0.4);
    expect(poiTouchFlashAlpha(0)).toBeCloseTo(POI_TOUCH_FLASH_PEAK, 5);
    let prev = 1;
    for (let t = 0; t <= POI_TOUCH_FLASH_MS; t += 5) { const f = poiTouchFlashAlpha(t); expect(f).toBeLessThanOrEqual(prev); prev = f; }
    expect(poiTouchFlashAlpha(POI_TOUCH_FLASH_MS)).toBe(0);
  });
  it('つっかえ: 80〜120msの間に速度倍率が滑らかに落ちて戻る(最小は0近く・両端は1)', () => {
    expect(POI_TOUCH_STALL_MS).toBeGreaterThanOrEqual(80);
    expect(POI_TOUCH_STALL_MS).toBeLessThanOrEqual(120);
    expect(poiTouchStallMult(0)).toBeCloseTo(1, 5);
    expect(poiTouchStallMult(POI_TOUCH_STALL_MS / 2)).toBeLessThan(0.15);
    expect(poiTouchStallMult(POI_TOUCH_STALL_MS)).toBe(1);
    for (let t = 0; t < POI_TOUCH_STALL_MS; t++) expect(Math.abs(poiTouchStallMult(t + 1) - poiTouchStallMult(t))).toBeLessThan(0.1);
  });
  it('押し戻し: 2〜4px、0から入り戻り切って0。急に跳ばない', () => {
    expect(POI_TOUCH_PUSH_PX).toBeGreaterThanOrEqual(2);
    expect(POI_TOUCH_PUSH_PX).toBeLessThanOrEqual(4);
    expect(poiTouchPushPx(0)).toBe(0);
    expect(poiTouchPushPx(POI_TOUCH_PUSH_IN_MS)).toBeCloseTo(POI_TOUCH_PUSH_PX, 5);
    const total = POI_TOUCH_PUSH_IN_MS + POI_TOUCH_PUSH_OUT_MS;
    expect(poiTouchPushPx(total)).toBe(0);
    for (let t = 0; t < total; t++) expect(Math.abs(poiTouchPushPx(t + 1) - poiTouchPushPx(t))).toBeLessThan(0.2);
  });
  it('カメラ: 0→3〜4px を70〜90msで加速して入り、200〜250msで減速して戻る', () => {
    expect(POI_TOUCH_CAM_PX).toBeGreaterThanOrEqual(3);
    expect(POI_TOUCH_CAM_PX).toBeLessThanOrEqual(4);
    expect(POI_TOUCH_CAM_IN_MS).toBeGreaterThanOrEqual(70);
    expect(POI_TOUCH_CAM_IN_MS).toBeLessThanOrEqual(90);
    expect(POI_TOUCH_CAM_OUT_MS).toBeGreaterThanOrEqual(200);
    expect(POI_TOUCH_CAM_OUT_MS).toBeLessThanOrEqual(250);
    expect(poiTouchCamPx(0)).toBe(0);
    // 入りは加速(前半の進みが後半より小さい)
    expect(poiTouchCamPx(POI_TOUCH_CAM_IN_MS / 2)).toBeLessThan(POI_TOUCH_CAM_PX / 2);
    expect(poiTouchCamPx(POI_TOUCH_CAM_IN_MS)).toBeCloseTo(POI_TOUCH_CAM_PX, 5);
    // 戻りは減速(戻りの前半で半分以上戻る)
    expect(poiTouchCamPx(POI_TOUCH_CAM_IN_MS + POI_TOUCH_CAM_OUT_MS / 2)).toBeLessThan(POI_TOUCH_CAM_PX / 2);
    expect(poiTouchCamPx(POI_TOUCH_CAM_IN_MS + POI_TOUCH_CAM_OUT_MS)).toBe(0);
  });
  it('負・終了後は0', () => {
    expect(poiTouchFlashAlpha(-5)).toBe(0);
    expect(poiTouchPushPx(9999)).toBe(0);
    expect(poiTouchCamPx(-1)).toBe(0);
  });
});

describe('音と揺らぎ', () => {
  it('ピッチ揺らぎは ±5% の範囲', () => {
    expect(poiTouchPitchJitter(0)).toBeCloseTo(0.95, 5);
    expect(poiTouchPitchJitter(1)).toBeCloseTo(1.05, 5);
  });
  it('全種に音が当てられている(祠は遅いピッチ)', () => {
    for (const id of ['hospital', 'armory', 'police', 'shrine-body', 'shrine-arms', 'shrine-accessory'] as const) expect(POI_TOUCH_SOUND[id].gain).toBeGreaterThan(0);
    expect(POI_TOUCH_SOUND['shrine-body'].rate).toBeLessThan(0.7);
  });
});

import { describe, it, expect } from 'vitest';
import {
  poiTouchStarts, poiTouchMayFire, poiTouchFlashAlpha, poiTouchStallMult, poiTouchPushPx, poiTouchCamPx, poiTouchPitchJitter,
  POI_TOUCH_FLASH_PEAK, POI_TOUCH_FLASH_MS, POI_TOUCH_STALL_MS, POI_TOUCH_PUSH_PX, POI_TOUCH_CAM_PX, POI_TOUCH_CAM_IN_MS, POI_TOUCH_CAM_OUT_MS,
  POI_TOUCH_PUSH_IN_MS, POI_TOUCH_PUSH_OUT_MS, POI_TOUCH_SOUND, POI_TOUCH_HOLD_MS, POI_TOUCH_RELEASE_MS, poiTouchHolding,
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
  // 社長の実機報告「つっかかりがゼロ」(2026-11-13): 止め(全方向0)→ease で戻る。2回目以降は半分。
  it('つっかえ: 触れた瞬間から止め(倍率0)、その後 ease で1へ戻る。全体は止め+戻り', () => {
    expect(POI_TOUCH_HOLD_MS).toBe(120);
    expect(POI_TOUCH_RELEASE_MS).toBe(120);
    expect(POI_TOUCH_STALL_MS).toBe(POI_TOUCH_HOLD_MS + POI_TOUCH_RELEASE_MS);
    for (let t = 0; t < POI_TOUCH_HOLD_MS; t += 10) {
      expect(poiTouchStallMult(t)).toBe(0);
      expect(poiTouchHolding(t)).toBe(true);
    }
    expect(poiTouchHolding(POI_TOUCH_HOLD_MS)).toBe(false);
    // 戻りは加速→減速(真ん中で半分・前半は半分未満)
    expect(poiTouchStallMult(POI_TOUCH_HOLD_MS + POI_TOUCH_RELEASE_MS / 2)).toBeCloseTo(0.5, 5);
    expect(poiTouchStallMult(POI_TOUCH_HOLD_MS + POI_TOUCH_RELEASE_MS / 4)).toBeLessThan(0.25);
    let prev = 0;
    for (let t = POI_TOUCH_HOLD_MS; t <= POI_TOUCH_STALL_MS; t++) {
      const m = poiTouchStallMult(t);
      expect(m).toBeGreaterThanOrEqual(prev);
      expect(m - prev).toBeLessThan(0.02);
      prev = m;
    }
    expect(poiTouchStallMult(POI_TOUCH_STALL_MS)).toBe(1);
    expect(poiTouchStallMult(-1)).toBe(1);
  });
  it('つっかえ(2回目以降): 止めも戻りも半分', () => {
    expect(poiTouchHolding(POI_TOUCH_HOLD_MS / 2 - 1, true)).toBe(true);
    expect(poiTouchHolding(POI_TOUCH_HOLD_MS / 2, true)).toBe(false);
    expect(poiTouchStallMult(POI_TOUCH_HOLD_MS / 2 - 1, true)).toBe(0);
    expect(poiTouchStallMult(POI_TOUCH_STALL_MS / 2, true)).toBe(1);
  });
  it('押し戻し: 9px、ease-out で出て ease-in で戻る(合計220ms程度)。急に跳ばない。2回目以降は半分', () => {
    expect(POI_TOUCH_PUSH_PX).toBe(9);
    const total = POI_TOUCH_PUSH_IN_MS + POI_TOUCH_PUSH_OUT_MS;
    expect(total).toBeGreaterThanOrEqual(200);
    expect(total).toBeLessThanOrEqual(240);
    expect(poiTouchPushPx(0)).toBe(0);
    // 出は減速(前半で半分以上出る)
    expect(poiTouchPushPx(POI_TOUCH_PUSH_IN_MS / 2)).toBeGreaterThan(POI_TOUCH_PUSH_PX / 2);
    expect(poiTouchPushPx(POI_TOUCH_PUSH_IN_MS)).toBeCloseTo(POI_TOUCH_PUSH_PX, 5);
    // 戻りは加速(戻りの前半では半分も戻らない)
    expect(poiTouchPushPx(POI_TOUCH_PUSH_IN_MS + POI_TOUCH_PUSH_OUT_MS / 2)).toBeGreaterThan(POI_TOUCH_PUSH_PX / 2);
    expect(poiTouchPushPx(total)).toBe(0);
    for (let t = 0; t < total; t++) expect(Math.abs(poiTouchPushPx(t + 1) - poiTouchPushPx(t))).toBeLessThan(0.45);
    expect(poiTouchPushPx(POI_TOUCH_PUSH_IN_MS, true)).toBeCloseTo(POI_TOUCH_PUSH_PX / 2, 5);
  });
  it('カメラ: 0→8px を70〜90msで加速して入り、200〜250msで減速して戻る。2回目以降は半分', () => {
    expect(POI_TOUCH_CAM_PX).toBe(8);
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
    expect(poiTouchCamPx(POI_TOUCH_CAM_IN_MS, true)).toBeCloseTo(POI_TOUCH_CAM_PX / 2, 5);
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

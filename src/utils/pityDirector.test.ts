import { describe, it, expect } from 'vitest';
import {
  createPinchState, stepPinch, pityLevel, pityDropTuning,
  BASE_DROP_TUNING, PINCH_MIN_MS, PINCH_FULL_MS,
} from './pityDirector';

const PINCHED = { hpFrac: 0.2, enemyCount: 15, enemyCap: 16, dtMs: 1000 };
const SAFE = { hpFrac: 0.9, enemyCount: 3, enemyCap: 16, dtMs: 1000 };

describe('pityDirector', () => {
  describe('stepPinch', () => {
    it('accumulates while pinched (low HP AND enemies near cap)', () => {
      let s = createPinchState();
      s = stepPinch(s, PINCHED);
      expect(s.pinchMs).toBe(1000);
    });

    it('requires BOTH conditions — low HP alone or crowd alone does not count', () => {
      let s = createPinchState();
      s = stepPinch(s, { ...PINCHED, enemyCount: 3 });   // 低HPだが敵は少ない
      expect(s.pinchMs).toBe(0);
      s = stepPinch(s, { ...PINCHED, hpFrac: 0.9 });     // 敵は多いがHPは十分
      expect(s.pinchMs).toBe(0);
    });

    it('decays faster than it accumulates once the pinch ends', () => {
      let s = createPinchState();
      for (let i = 0; i < 9; i++) s = stepPinch(s, PINCHED); // 9s 蓄積
      s = stepPinch(s, SAFE); // 1s 安全 → 3s ぶん減衰
      expect(s.pinchMs).toBe(6000);
    });

    it('caps accumulation at PINCH_FULL_MS and never goes below 0', () => {
      let s = createPinchState();
      for (let i = 0; i < 60; i++) s = stepPinch(s, PINCHED);
      expect(s.pinchMs).toBe(PINCH_FULL_MS);
      for (let i = 0; i < 60; i++) s = stepPinch(s, SAFE);
      expect(s.pinchMs).toBe(0);
    });
  });

  describe('pityLevel', () => {
    it('stays 0 until PINCH_MIN_MS (a moment of pain does not trigger rescue)', () => {
      expect(pityLevel(0)).toBe(0);
      expect(pityLevel(PINCH_MIN_MS)).toBe(0);
    });

    it('reaches 1 at PINCH_FULL_MS', () => {
      expect(pityLevel(PINCH_FULL_MS)).toBe(1);
      expect(pityLevel(PINCH_FULL_MS + 5000)).toBe(1);
    });
  });

  describe('pityDropTuning', () => {
    it('level 0 equals the legacy torch-drop constants exactly (no behavior change)', () => {
      expect(pityDropTuning(0)).toEqual(BASE_DROP_TUNING);
      expect(BASE_DROP_TUNING).toEqual({ dropChance: 0.42, ammoT: 0.5, healthT: 0.75, bombT: 0.9 });
    });

    it('full pity raises drop chance and shifts the mix toward health/bomb', () => {
      const full = pityDropTuning(1);
      expect(full.dropChance).toBeGreaterThan(BASE_DROP_TUNING.dropChance);
      expect(full.ammoT).toBeLessThan(BASE_DROP_TUNING.ammoT);             // 弾薬の取り分は減る
      expect(full.healthT - full.ammoT)                                     // 回復の取り分は増える
        .toBeGreaterThan(BASE_DROP_TUNING.healthT - BASE_DROP_TUNING.ammoT);
      expect(full.bombT - full.healthT)                                     // 爆弾の取り分も増える
        .toBeGreaterThan(BASE_DROP_TUNING.bombT - BASE_DROP_TUNING.healthT);
    });

    it('thresholds stay ordered and within [0,1] at any level', () => {
      for (const lvl of [0, 0.25, 0.5, 0.75, 1]) {
        const t = pityDropTuning(lvl);
        expect(t.ammoT).toBeGreaterThan(0);
        expect(t.ammoT).toBeLessThan(t.healthT);
        expect(t.healthT).toBeLessThan(t.bombT);
        expect(t.bombT).toBeLessThanOrEqual(1);
        expect(t.dropChance).toBeLessThanOrEqual(0.8);
      }
    });
  });
});

// 変異体対策室の開幕の設備(大型武器庫=金箱+その下の武器商人)の置き場所。社長指示2026-11-20。
import { describe, it, expect } from 'vitest';
import {
  planPracticeFacilities, PRACTICE_CHEST_SIZE, PRACTICE_MERCHANT_BELOW_CHEST_PX, PRACTICE_FACILITY_MIN_GAP_PX,
  PRACTICE_MERCHANT_FOOT_W, PRACTICE_MERCHANT_FOOT_H,
} from './practiceFacilities';
import { isRectInPlayableArea, type PlayableAreaCtx } from '../world/playableArea';
import { BOSS_START_CHEST_BELOW_MARGIN_PX } from '../store/gameStore';

/** 商人のサークルの半径(gameStore の MERCHANT_INTERACT_RADIUS・非公開なので値を写す)。 */
const MERCHANT_INTERACT_RADIUS = 58;

const ctxOf = (o: Partial<PlayableAreaCtx> = {}): PlayableAreaCtx => ({
  farBackdrop: '', labTheme: false, corridorMode: false, m0AdvanceLimitX: null, corridorRunInActive: false, ...o,
});
const SPAWN = { x: 0, y: 0 };
const H = 932;
const inBand = (p: { chest: { x: number; y: number }; merchant: { x: number; y: number } }, ctx: PlayableAreaCtx) => {
  expect(isRectInPlayableArea(p.chest.x, p.chest.y, PRACTICE_CHEST_SIZE, PRACTICE_CHEST_SIZE, ctx)).toBe(true);
  expect(isRectInPlayableArea(p.merchant.x - PRACTICE_MERCHANT_FOOT_W / 2, p.merchant.y - PRACTICE_MERCHANT_FOOT_H, PRACTICE_MERCHANT_FOOT_W, PRACTICE_MERCHANT_FOOT_H, ctx)).toBe(true);
};

describe('練習ランの大型武器庫と武器商人の置き場所', () => {
  it('野外: 金箱はステージ7と同じ所(真下・画面の下端の少し外)、商人はその真下', () => {
    const ctx = ctxOf();
    const p = planPracticeFacilities(SPAWN, H, BOSS_START_CHEST_BELOW_MARGIN_PX, ctx);
    expect(p.chest).toEqual({ x: SPAWN.x, y: SPAWN.y + H / 2 + BOSS_START_CHEST_BELOW_MARGIN_PX });
    const cx = p.chest.x + PRACTICE_CHEST_SIZE / 2, cy = p.chest.y + PRACTICE_CHEST_SIZE / 2;
    expect(p.merchant.x).toBeCloseTo(cx, 5);
    expect(p.merchant.y).toBeCloseTo(cy + PRACTICE_MERCHANT_BELOW_CHEST_PX, 5);
    expect(p.merchant.y).toBeGreaterThan(p.chest.y); // 商人は下(南)
    inBand(p, ctx);
  });

  it('商人のサークルは金箱に掛からない', () => {
    for (const ctx of [ctxOf(), ctxOf({ farBackdrop: 'city' }), ctxOf({ labTheme: true }), ctxOf({ corridorMode: true })]) {
      const p = planPracticeFacilities(SPAWN, H, BOSS_START_CHEST_BELOW_MARGIN_PX, ctx);
      const d = Math.hypot(p.merchant.x - (p.chest.x + 8), p.merchant.y - (p.chest.y + 8));
      expect(d, JSON.stringify(ctx)).toBeGreaterThan(MERCHANT_INTERACT_RADIUS + PRACTICE_CHEST_SIZE);
      inBand(p, ctx);
    }
  });

  it('研究所(上下が狭い帯): 帯の内側に収め、真下に並ばない時は横にずらして間を空ける', () => {
    const ctx = ctxOf({ labTheme: true });
    const p = planPracticeFacilities(SPAWN, H, BOSS_START_CHEST_BELOW_MARGIN_PX, ctx);
    inBand(p, ctx);
    expect(Math.hypot(p.merchant.x - (p.chest.x + 8), p.merchant.y - (p.chest.y + 8))).toBeGreaterThanOrEqual(PRACTICE_FACILITY_MIN_GAP_PX);
    expect(p.merchant.y).toBeGreaterThanOrEqual(p.chest.y); // 下へ寄せられるだけ寄せる
  });

  it('洋館の通路: 走り込みの道(真下)に置かない=着いた所の左右', () => {
    const ctx = ctxOf({ corridorMode: true });
    const p = planPracticeFacilities({ x: 0, y: 380 }, H, BOSS_START_CHEST_BELOW_MARGIN_PX, ctx);
    inBand(p, ctx);
    expect(p.chest.x + PRACTICE_CHEST_SIZE).toBeLessThan(-40);
    expect(p.merchant.x).toBeGreaterThan(40);
  });

  it('障害物(木・残骸)に重なる時は近くの空いた所へずらす', () => {
    const ctx = ctxOf();
    const free = planPracticeFacilities(SPAWN, H, BOSS_START_CHEST_BELOW_MARGIN_PX, ctx);
    // 本来の金箱と商人の場所だけを塞ぐ
    const blocked = (x: number, y: number) =>
      (Math.abs(x - free.chest.x) < 1 && Math.abs(y - free.chest.y) < 1)
      || (Math.abs(x + PRACTICE_MERCHANT_FOOT_W / 2 - free.merchant.x) < 1 && Math.abs(y + PRACTICE_MERCHANT_FOOT_H - free.merchant.y) < 1);
    const p = planPracticeFacilities(SPAWN, H, BOSS_START_CHEST_BELOW_MARGIN_PX, ctx, blocked);
    expect(p.chest).not.toEqual(free.chest);
    expect(p.merchant).not.toEqual(free.merchant);
    expect(Math.hypot(p.chest.x - free.chest.x, p.chest.y - free.chest.y)).toBeLessThanOrEqual(130);
    inBand(p, ctx);
  });
});

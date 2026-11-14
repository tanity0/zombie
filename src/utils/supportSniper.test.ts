import { describe, it, expect } from 'vitest';
import {
  computeSupportSniperTick, computeSupportSniperEntry, computeSupportSniperFarCorner, pickSupportSniperSoldier,
  SUPPORT_SNIPER_CD_MS_BY_LEVEL,
} from './supportSniper';

describe('pickSupportSniperSoldier (登場NPC=非出撃の軍人・社長訂正v0.25.1727)', () => {
  it('護衛に出ている軍人とフェイザー(レア枠)は選ばれない', () => {
    for (let r = 0; r < 20; r++) {
      const picked = pickSupportSniperSoldier([0, 2, 4, 6], 8, 7, () => r / 20);
      expect([1, 3, 5]).toContain(picked);
    }
  });
  it('フェイザーが護衛に差し込まれた回も、残りの非出撃軍人から選ぶ', () => {
    for (let r = 0; r < 20; r++) {
      const picked = pickSupportSniperSoldier([0, 1, 2, 7], 8, 7, () => r / 20);
      expect([3, 4, 5, 6]).toContain(picked);
    }
  });
  it('保険: プールが空になる異常系でも例外なく名簿内indexを返す', () => {
    const picked = pickSupportSniperSoldier([0, 1, 2, 3, 4, 5, 6, 7], 8, 7, () => 0.5);
    expect(picked).toBeGreaterThanOrEqual(0);
    expect(picked).toBeLessThan(8);
  });
});

describe('computeSupportSniperTick', () => {
  it('レベル別CD=6/5/4秒(SUPPORT_SNIPER_CD_MS_BY_LEVEL・社長指定v0.25.1726)', () => {
    expect(SUPPORT_SNIPER_CD_MS_BY_LEVEL[1]).toBe(6000);
    expect(SUPPORT_SNIPER_CD_MS_BY_LEVEL[2]).toBe(5000);
    expect(SUPPORT_SNIPER_CD_MS_BY_LEVEL[3]).toBe(4000);
  });

  it('停止中はCDが進まない(保持・リセットしない)', () => {
    const res = computeSupportSniperTick({
      deltaMs: 1000, isMoving: false, hasEnemy: true, cdRemainingMs: 3000, cooldownMs: 5000,
    });
    expect(res.cdRemainingMs).toBe(3000);
    expect(res.fire).toBe(false);
  });

  it('移動中はCDが減る', () => {
    const res = computeSupportSniperTick({
      deltaMs: 16, isMoving: true, hasEnemy: true, cdRemainingMs: 3000, cooldownMs: 5000,
    });
    expect(res.cdRemainingMs).toBe(2984);
    expect(res.fire).toBe(false);
  });

  it('CDが尽きて敵がいれば発射し、CDをレベル別値へリセット', () => {
    const res = computeSupportSniperTick({
      deltaMs: 100, isMoving: true, hasEnemy: true, cdRemainingMs: 50, cooldownMs: 5000,
    });
    expect(res.fire).toBe(true);
    expect(res.cdRemainingMs).toBe(5000);
  });

  it('敵がいない時は撃たず満タン(0)のまま保持→移動中に敵が現れたら即発射', () => {
    const idle = computeSupportSniperTick({
      deltaMs: 500, isMoving: true, hasEnemy: false, cdRemainingMs: 0, cooldownMs: 5000,
    });
    expect(idle.fire).toBe(false);
    expect(idle.cdRemainingMs).toBe(0);
    const appear = computeSupportSniperTick({
      deltaMs: 16, isMoving: true, hasEnemy: true, cdRemainingMs: 0, cooldownMs: 5000,
    });
    expect(appear.fire).toBe(true);
  });

  it('停止中は満タンでも撃たない(移動中のみ発射)', () => {
    const res = computeSupportSniperTick({
      deltaMs: 16, isMoving: false, hasEnemy: true, cdRemainingMs: 0, cooldownMs: 5000,
    });
    expect(res.fire).toBe(false);
    expect(res.cdRemainingMs).toBe(0);
  });

  it('レベルアップでCDが縮んだら残りを新CDへクランプ(装備直後の初期値5000→Lv3の3000等)', () => {
    const res = computeSupportSniperTick({
      deltaMs: 0, isMoving: false, hasEnemy: false, cdRemainingMs: 5000, cooldownMs: 3000,
    });
    expect(res.cdRemainingMs).toBe(3000);
  });
});

describe('computeSupportSniperEntry', () => {
  const view = { left: 0, top: 0, right: 800, bottom: 600 };

  it('敵が左にいればプレイヤーの右側の縁に出る(敵→プレイヤーの延長線)', () => {
    const e = computeSupportSniperEntry(100, 300, 400, 300, view);
    expect(e).not.toBeNull();
    expect(e!.x).toBe(800);       // 右縁
    expect(e!.y).toBeCloseTo(300);
    // NPCの向き=敵の方向(左)
    expect(e!.dirX).toBeCloseTo(-1);
    expect(e!.dirY).toBeCloseTo(0);
  });

  it('敵が下にいれば上縁に出る', () => {
    const e = computeSupportSniperEntry(400, 500, 400, 300, view);
    expect(e).not.toBeNull();
    expect(e!.y).toBe(0);         // 上縁
    expect(e!.x).toBeCloseTo(400);
    expect(e!.dirY).toBeCloseTo(1); // 向きは下(敵の方)
  });

  it('斜めでも交点は必ず矩形の縁上に載る', () => {
    const e = computeSupportSniperEntry(100, 100, 400, 300, view)!;
    const onEdge =
      Math.abs(e.x - view.left) < 1e-6 || Math.abs(e.x - view.right) < 1e-6 ||
      Math.abs(e.y - view.top) < 1e-6 || Math.abs(e.y - view.bottom) < 1e-6;
    expect(onEdge).toBe(true);
    // 縁の点は矩形の範囲内
    expect(e.x).toBeGreaterThanOrEqual(view.left);
    expect(e.x).toBeLessThanOrEqual(view.right);
    expect(e.y).toBeGreaterThanOrEqual(view.top);
    expect(e.y).toBeLessThanOrEqual(view.bottom);
  });

  it('jitterRad で射線が回転する(±少しランダムの注入点)', () => {
    const straight = computeSupportSniperEntry(100, 300, 400, 300, view, 0)!;
    const jittered = computeSupportSniperEntry(100, 300, 400, 300, view, 0.15)!;
    expect(jittered.y).not.toBeCloseTo(straight.y);
  });

  it('敵とプレイヤーが同座標(縮退)でも null にせず下方向へ逃がす', () => {
    const e = computeSupportSniperEntry(400, 300, 400, 300, view);
    expect(e).not.toBeNull();
    expect(e!.y).toBe(600); // 下縁
  });
});

// ★O-3b-2(research/SAME_ARENA.md §3-d-4): 幻影版の出現点=「プレイヤーから一番遠い隅」。
describe('computeSupportSniperFarCorner(幻影版・社長裁定「一番遠い隅から」)', () => {
  const view = { left: 0, top: 0, right: 800, bottom: 600 };

  it('プレイヤーが左上寄りなら、一番遠い隅=右下', () => {
    const c = computeSupportSniperFarCorner(100, 100, view);
    expect(c.x).toBe(800);
    expect(c.y).toBe(600);
  });

  it('プレイヤーが右下寄りなら、一番遠い隅=左上', () => {
    const c = computeSupportSniperFarCorner(700, 500, view);
    expect(c.x).toBe(0);
    expect(c.y).toBe(0);
  });

  it('向き(dirX/dirY)は隅からプレイヤーへの単位ベクトル', () => {
    const c = computeSupportSniperFarCorner(700, 500, view);
    // 隅(0,0)→プレイヤー(700,500)の方向
    const len = Math.hypot(700 - 0, 500 - 0);
    expect(c.dirX).toBeCloseTo(700 / len);
    expect(c.dirY).toBeCloseTo(500 / len);
  });

  it('4隅のどれかに厳密に一致する(中間点を作らない)', () => {
    const c = computeSupportSniperFarCorner(250, 550, view);
    const onCorner =
      (c.x === view.left || c.x === view.right) && (c.y === view.top || c.y === view.bottom);
    expect(onCorner).toBe(true);
  });
});

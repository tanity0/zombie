// B6(盾押し機構・research/AI_HUMANIZE.md §6・裁定済み#8)の受け入れ条件(§7-9)を固定する。
//  ①壁・行ける帯の外へ盾が出ない(クランプテスト)
//  ②動く盾が敵を押し出さない(ブルドーザー禁止=敵の座標が変わらない・盾が手前で止まる)
//  ③押し操作をしない場合の挙動が現行とビット同一(=dx/dyが無ければ何もしない起点)
//  ④所有者以外は押せない(=呼び出し側のshieldOwnerKind分岐。ここでは純関数の入出力を固定)
import { describe, it, expect } from 'vitest';
import { pushShieldRect, clampShieldPlacementRect } from './shieldPush';
import type { Rect } from './obstacles';
import type { PlayableAreaCtx } from './playableArea';

const NONE_CTX: PlayableAreaCtx = {
  farBackdrop: 'forest', labTheme: false, corridorMode: false,
  m0AdvanceLimitX: null, corridorRunInActive: false,
};

const SHIELD: Rect = { x: 100, y: 100, width: 40, height: 20 };

describe('pushShieldRect(①クランプ: 行ける帯の外へ出ない)', () => {
  const ctx: PlayableAreaCtx = { ...NONE_CTX, farBackdrop: 'tutorial' };

  it('帯の中に収まる押しはそのまま通す', () => {
    // 帯は中心yで±100(TUTORIAL_MOVE_Y_LIMIT_PX)。高さ20の矩形はy=-10で中心0=帯の中心。
    const wallResolved: Rect = { ...SHIELD, x: 120, y: -10 };
    const r = pushShieldRect(wallResolved, [], ctx, SHIELD.x);
    expect(r).toEqual({ x: 120, y: -10 });
  });

  it('帯の外へ出る押しは内側へ寄る(はみ出さない)', () => {
    // チュートリアルの上限= -TUTORIAL_MOVE_Y_LIMIT_PX(-100)。大きく外へ押しても中心はその線で止まる。
    const wallResolved: Rect = { ...SHIELD, x: 100, y: -9999 };
    const r = pushShieldRect(wallResolved, [], ctx, SHIELD.y);
    expect(r.y + SHIELD.height / 2).toBeCloseTo(-100);
    expect(r.y).toBeGreaterThan(-9999);
  });
});

describe('pushShieldRect(②ブルドーザー禁止: 動く盾は敵を押し出さない)', () => {
  it('押し先に敵が重なるなら、その手前で止まる(敵の座標は呼び出し側で不変=このrectは敵の位置を書き換えない)', () => {
    // 盾(x=300,y=100,w=40,h=20・右端=340)を敵に小さくめり込ませる(x方向の重なりを最小=
    // 最小侵入軸のresolveAabbが確実にx軸で解決するよう、y方向は盾の高さぶんフルに重ねておく)。
    const enemy: Rect = { x: 330, y: 90, width: 30, height: 40 }; // overlapX=10 < overlapY=20
    const wallResolved: Rect = { ...SHIELD, x: 300, y: 100 };
    const r = pushShieldRect(wallResolved, [enemy], NONE_CTX, SHIELD.x);
    // resolveAabbは重なりを解消する方向(=手前)へ押し戻す。敵の左端(330)より内側で止まる。
    expect(r.x + SHIELD.width).toBeLessThanOrEqual(enemy.x + 0.001);
    expect(r.y).toBe(100); // 解決はx軸のみ(overlapXが最小侵入)=yは動かない
    // 敵の矩形そのものはこの関数の戻り値に含まれない=呼び出し側が敵配列を書き換えていないことの
    // 型的な裏付け(pushShieldRectは盾の{x,y}以外を返さない)。
    expect(Object.keys(r)).toEqual(['x', 'y']);
  });

  it('敵ブロッカーが無ければ候補位置をそのまま通す', () => {
    const wallResolved: Rect = { ...SHIELD, x: 300, y: 100 };
    const r = pushShieldRect(wallResolved, [], NONE_CTX, SHIELD.x);
    expect(r).toEqual({ x: 300, y: 100 });
  });

  it('敵に触れていない押しは影響を受けない', () => {
    const farEnemy: Rect = { x: 900, y: 900, width: 30, height: 30 };
    const wallResolved: Rect = { ...SHIELD, x: 130, y: 100 };
    const r = pushShieldRect(wallResolved, [farEnemy], NONE_CTX, SHIELD.x);
    expect(r).toEqual({ x: 130, y: 100 });
  });
});

describe('pushShieldRect(③無入力=不変の起点)', () => {
  it('候補位置=現在位置(dx/dy相当ゼロ)なら座標は変わらない', () => {
    const wallResolved: Rect = { ...SHIELD };
    const r = pushShieldRect(wallResolved, [], NONE_CTX, SHIELD.x);
    expect(r).toEqual({ x: SHIELD.x, y: SHIELD.y });
  });
});

describe('clampShieldPlacementRect(設置位置も同じクランプを掛ける)', () => {
  it('帯の中の設置はそのまま', () => {
    const ctx: PlayableAreaCtx = { ...NONE_CTX, farBackdrop: 'tutorial' };
    const inBand: Rect = { ...SHIELD, y: -10 }; // 中心y=0=帯(±100)の中
    const r = clampShieldPlacementRect(inBand, ctx);
    expect(r).toEqual({ x: inBand.x, y: inBand.y });
  });

  it('帯の外への設置は内側へスナップする(既存の穴=設置時は壁・帯を見ていなかった、の是正)', () => {
    const ctx: PlayableAreaCtx = { ...NONE_CTX, farBackdrop: 'tutorial' };
    const outside: Rect = { ...SHIELD, y: -9999 };
    const r = clampShieldPlacementRect(outside, ctx);
    expect(r.y + SHIELD.height / 2).toBeCloseTo(-100);
  });

  it('制限の無いステージでは無変化', () => {
    const r = clampShieldPlacementRect(SHIELD, NONE_CTX);
    expect(r).toEqual({ x: SHIELD.x, y: SHIELD.y });
  });
});

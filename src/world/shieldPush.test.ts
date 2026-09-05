// B6(盾押し機構・research/AI_HUMANIZE.md §6・裁定済み#8)の受け入れ条件(§7-9・検収是正版)を固定する。
//  ①壁・行ける帯の外へ盾が出ない(クランプテスト)
//  ②動く盾は敵を押し出す(ブルドーザー存続・社長裁定2026-08-28=v0.25.3996の「敵の手前で止まる」は撤回)
//  ③押し操作をしない場合の挙動が現行とビット同一(=候補位置が現在位置なら何もしない起点)
//  ④クランプは盾の足(下辺)基準(検収監査・中3=帯の端で中心基準だと最大height/2ずれる)
//  ⑤設置クランプはprevXを渡せばM0前進壁の跨ぎ判定に乗る(検収監査・中4)
import { describe, it, expect } from 'vitest';
import { pushShieldRect, clampShieldPlacementRect } from './shieldPush';
import type { Rect } from './obstacles';
import type { PlayableAreaCtx } from './playableArea';
import { LAB_CORRIDOR_Y_LIMIT_PX } from './labWalls';

const NONE_CTX: PlayableAreaCtx = {
  farBackdrop: 'forest', labTheme: false, corridorMode: false,
  m0AdvanceLimitX: null, corridorRunInActive: false,
};

const SHIELD: Rect = { x: 100, y: 100, width: 40, height: 20 };

describe('pushShieldRect(①クランプ: 行ける帯の外へ出ない)', () => {
  const ctx: PlayableAreaCtx = { ...NONE_CTX, farBackdrop: 'tutorial' };

  it('帯の中に収まる押しはそのまま通す', () => {
    // 帯は中心yで±100(TUTORIAL_MOVE_Y_LIMIT_PX)。足(下辺)基準なので、足=y+heightが帯の中心(0)に
    // 来るy=-height(=-20)を使う。
    const wallResolved: Rect = { ...SHIELD, x: 120, y: -SHIELD.height };
    const r = pushShieldRect(wallResolved, ctx, SHIELD.x);
    expect(r).toEqual({ x: 120, y: -SHIELD.height });
  });

  it('帯の外へ出る押しは内側へ寄る(はみ出さない・足が帯の内側に入る)', () => {
    // チュートリアルの上限= -TUTORIAL_MOVE_Y_LIMIT_PX(-100)。大きく外へ押しても足はその線で止まる。
    const wallResolved: Rect = { ...SHIELD, x: 100, y: -9999 };
    const r = pushShieldRect(wallResolved, ctx, SHIELD.x);
    expect(r.y + SHIELD.height).toBeCloseTo(-100); // 足=y+height
    expect(r.y).toBeGreaterThan(-9999);
  });
});

describe('pushShieldRect(②ブルドーザー存続: 敵ブロッカーの概念が無い=純関数は敵を受け取らない)', () => {
  it('候補位置(壁解決済み)をそのまま通す。動く盾が敵を押し出す処理は呼び出し側[既存の盾→敵毎フレーム処理]の役目', () => {
    // pushShieldRectのシグネチャに敵配列が無いこと自体が「ブルドーザー禁止(手前で止まる)を撤回した」
    // ことの型的な裏付け(v0.25.3996は3引数目に blockingEnemies を取っていた)。
    const wallResolved: Rect = { ...SHIELD, x: 300, y: 100 };
    const r = pushShieldRect(wallResolved, NONE_CTX, SHIELD.x);
    expect(r).toEqual({ x: 300, y: 100 });
  });

  it('制限の無いステージでは壁解決済みの候補をそのまま通す(敵の位置に関知しない)', () => {
    const wallResolved: Rect = { ...SHIELD, x: 130, y: 100 };
    const r = pushShieldRect(wallResolved, NONE_CTX, SHIELD.x);
    expect(r).toEqual({ x: 130, y: 100 });
  });
});

describe('pushShieldRect(③無入力=不変の起点)', () => {
  it('候補位置=現在位置(dx/dy相当ゼロ)なら座標は変わらない', () => {
    const wallResolved: Rect = { ...SHIELD };
    const r = pushShieldRect(wallResolved, NONE_CTX, SHIELD.x);
    expect(r).toEqual({ x: SHIELD.x, y: SHIELD.y });
  });
});

describe('pushShieldRect(④足基準クランプ: 帯の上端で盾がずれない)', () => {
  it('ステージ2(lab)の上端: 足(下辺)がLAB_CORRIDOR_Y_LIMIT_PXで止まる(中心ではない)', () => {
    const ctx: PlayableAreaCtx = { ...NONE_CTX, labTheme: true };
    const wallResolved: Rect = { ...SHIELD, x: 100, y: -9999 };
    const r = pushShieldRect(wallResolved, ctx, SHIELD.x);
    // 足基準: 下辺(y+height)がちょうど上限線(-LAB_CORRIDOR_Y_LIMIT_PX)で止まる。
    expect(r.y + SHIELD.height).toBeCloseTo(-LAB_CORRIDOR_Y_LIMIT_PX);
    // 中心基準(検収前の実装)だったなら、中心(y+height/2)が上限線に来ていたはず=
    // 足はさらに height/2 だけ外側(絶対値が大きい側)に出ていた。足基準の実装では、逆に
    // 中心は上限線より height/2 ぶん内側(下=絶対値が大きい側)にある。旧・中心基準への
    // 回帰(=中心が上限線ちょうどに来る)を検知する。
    expect(r.y + SHIELD.height / 2).toBeCloseTo(-LAB_CORRIDOR_Y_LIMIT_PX - SHIELD.height / 2);
  });
});

describe('clampShieldPlacementRect(設置位置も同じクランプを掛ける・足基準)', () => {
  it('帯の中の設置はそのまま(足が帯の中心)', () => {
    const ctx: PlayableAreaCtx = { ...NONE_CTX, farBackdrop: 'tutorial' };
    const inBand: Rect = { ...SHIELD, y: -SHIELD.height }; // 足(y+height)=0=帯(±100)の中心
    const r = clampShieldPlacementRect(inBand, ctx);
    expect(r).toEqual({ x: inBand.x, y: inBand.y });
  });

  it('帯の外への設置は内側へスナップする(既存の穴=設置時は壁・帯を見ていなかった、の是正)', () => {
    const ctx: PlayableAreaCtx = { ...NONE_CTX, farBackdrop: 'tutorial' };
    const outside: Rect = { ...SHIELD, y: -9999 };
    const r = clampShieldPlacementRect(outside, ctx);
    expect(r.y + SHIELD.height).toBeCloseTo(-100); // 足基準
  });

  it('制限の無いステージでは無変化', () => {
    const r = clampShieldPlacementRect(SHIELD, NONE_CTX);
    expect(r).toEqual({ x: SHIELD.x, y: SHIELD.y });
  });

  it('⑤prevXを渡すと配置もM0前進壁の跨ぎ判定に乗る(検収監査・中4)', () => {
    // M0前進壁: m0AdvanceLimitXの手前(x=800)。プレイヤーが既に壁より先(prevX=900)に居るなら、
    // 壁の内側へスナップしない(v3498と同じ「跨ぐ移動だけ止める」)。
    const ctx: PlayableAreaCtx = { ...NONE_CTX, farBackdrop: 'tutorial', m0AdvanceLimitX: 800 };
    const beyondWall: Rect = { ...SHIELD, x: 900, y: -SHIELD.height };
    // prevXなし(従来のスナップ): 壁の内側へ寄せられる。
    const snapped = clampShieldPlacementRect(beyondWall, ctx);
    expect(snapped.x).toBeLessThan(900);
    // prevX=プレイヤーの現在x(既に壁より先)を渡すと、没収されない。
    const notConfiscated = clampShieldPlacementRect(beyondWall, ctx, 900);
    expect(notConfiscated.x).toBe(900);
  });
});

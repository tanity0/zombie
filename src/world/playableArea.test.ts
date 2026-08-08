// 「プレイヤーが行ける帯」の唯一の正本(clampRectToPlayableArea)の不変条件。
// 社長指示「ステージ2に限らず、移動不可エリアにアイテムも敵も沸かないで」対応(v0.25.2391)。
// この関数は src/store/gameStore.ts のプレイヤー移動クランプと完全に同じ計算を行う想定なので、
// ここでは「帯の外→内側へ寄る」「帯の中→そのまま」「制限が無いステージ→無変化」
// 「corridorRunInActiveの例外」を固定する。数値自体はプレイヤー移動側から複製した既存の定数
// (TUTORIAL_MOVE_Y_LIMIT_PX等)をそのまま使う=ズレが起きたらこのテストが落ちる。
import { describe, it, expect } from 'vitest';
import {
  clampRectToPlayableArea, isRectInPlayableArea,
  clampCastleFightCrossing, CASTLE_FIGHT_MAX_DIST,
  TUTORIAL_MOVE_Y_LIMIT_PX, TUTORIAL_MOVE_X_MIN_PX, CORRIDOR_BOTTOM_LIMIT,
  type PlayableAreaCtx,
} from './playableArea';
import { LAB_CORRIDOR_Y_LIMIT_PX } from './labWalls';
import { CORRIDOR_LATERAL_CLAMP } from '../utils/corridorProjection';

const NONE_CTX: PlayableAreaCtx = {
  farBackdrop: 'forest', labTheme: false, corridorMode: false,
  m0AdvanceLimitX: null, corridorRunInActive: false,
};

describe('clampRectToPlayableArea(制限の無いステージ)', () => {
  it('何も変わらない(通常ステージはそのまま)', () => {
    const r = clampRectToPlayableArea(9999, -9999, 30, 30, NONE_CTX);
    expect(r).toEqual({ x: 9999, y: -9999 });
    expect(isRectInPlayableArea(9999, -9999, 30, 30, NONE_CTX)).toBe(true);
  });
});

describe('clampRectToPlayableArea(M0/tutorial)', () => {
  const ctx: PlayableAreaCtx = { ...NONE_CTX, farBackdrop: 'tutorial' };
  const w = 30, h = 40;

  it('帯の中はそのまま', () => {
    const r = clampRectToPlayableArea(200, -20, w, h, ctx);
    expect(r).toEqual({ x: 200, y: -20 });
    expect(isRectInPlayableArea(200, -20, w, h, ctx)).toBe(true);
  });

  it('yが帯の外(上)なら内側へ寄る', () => {
    const r = clampRectToPlayableArea(200, -9999, w, h, ctx);
    // 中心y = r.y + h/2 が -TUTORIAL_MOVE_Y_LIMIT_PX に一致する(上限で止まる)
    expect(r.y + h / 2).toBeCloseTo(-TUTORIAL_MOVE_Y_LIMIT_PX);
    expect(isRectInPlayableArea(200, -9999, w, h, ctx)).toBe(false);
  });

  it('yが帯の外(下)なら内側へ寄る', () => {
    const r = clampRectToPlayableArea(200, 9999, w, h, ctx);
    expect(r.y + h / 2).toBeCloseTo(TUTORIAL_MOVE_Y_LIMIT_PX);
  });

  it('xが左端(TUTORIAL_MOVE_X_MIN_PX)より左なら内側へ寄る', () => {
    const r = clampRectToPlayableArea(-9999, 0, w, h, ctx);
    expect(r.x + w / 2).toBeCloseTo(TUTORIAL_MOVE_X_MIN_PX);
  });

  it('右は無制限(m0AdvanceLimitXが無い間)', () => {
    const r = clampRectToPlayableArea(999999, 0, w, h, ctx);
    expect(r.x).toBe(999999);
  });

  it('m0AdvanceLimitXが有れば、それ以上右へは行けない', () => {
    const limited: PlayableAreaCtx = { ...ctx, m0AdvanceLimitX: 500 };
    const r = clampRectToPlayableArea(999999, 0, w, h, limited);
    expect(r.x + w / 2).toBeCloseTo(500);
  });
});

describe('clampRectToPlayableArea(ステージ2/labTheme)', () => {
  const ctx: PlayableAreaCtx = { ...NONE_CTX, labTheme: true };
  const w = 30, h = 40;

  it('帯の中はそのまま', () => {
    const r = clampRectToPlayableArea(5000, 10, w, h, ctx);
    expect(r).toEqual({ x: 5000, y: 10 });
  });

  it('yが帯の外なら内側へ寄る。xは無制限', () => {
    const r = clampRectToPlayableArea(99999, 99999, w, h, ctx);
    expect(r.x).toBe(99999); // Xは無制限
    expect(r.y + h / 2).toBeCloseTo(LAB_CORRIDOR_Y_LIMIT_PX);
  });

  it('yが帯の外(上)なら内側へ寄る', () => {
    const r = clampRectToPlayableArea(0, -99999, w, h, ctx);
    expect(r.y + h / 2).toBeCloseTo(-LAB_CORRIDOR_Y_LIMIT_PX);
  });
});

describe('clampRectToPlayableArea(ステージ6/corridorMode)', () => {
  const ctx: PlayableAreaCtx = { ...NONE_CTX, corridorMode: true };
  const w = 30, h = 40;

  it('帯の中はそのまま', () => {
    const r = clampRectToPlayableArea(0, -100, w, h, ctx);
    expect(r).toEqual({ x: 0, y: -100 });
  });

  it('xが左右の柱ラインの外なら内側へ寄る', () => {
    const r = clampRectToPlayableArea(99999, -100, w, h, ctx);
    expect(r.x + w / 2).toBeCloseTo(CORRIDOR_LATERAL_CLAMP);
    const l = clampRectToPlayableArea(-99999, -100, w, h, ctx);
    expect(l.x + w / 2).toBeCloseTo(-CORRIDOR_LATERAL_CLAMP);
  });

  it('yの下限(CORRIDOR_BOTTOM_LIMIT)を超えたら内側へ寄る(通常時)', () => {
    const r = clampRectToPlayableArea(0, 99999, w, h, ctx);
    expect(r.y).toBe(CORRIDOR_BOTTOM_LIMIT);
  });

  it('yの上方向(奥)は無制限', () => {
    const r = clampRectToPlayableArea(0, -99999, w, h, ctx);
    expect(r.y).toBe(-99999);
  });

  it('corridorRunInActive中は下限の例外(クランプしない)', () => {
    const runIn: PlayableAreaCtx = { ...ctx, corridorRunInActive: true };
    const r = clampRectToPlayableArea(0, 99999, w, h, runIn);
    expect(r.y).toBe(99999); // 下限を適用しない
  });
});

// v0.25.3055(社長指示): 城ボス戦中はデンジャーゾーンに入れない(研究対象の外縁=3000でクランプ)。
import { AREA_THRESHOLDS } from '../utils/enemyUtils';
describe('clampCastleFightCrossing(城ボス戦の移動制限)', () => {
  it('上限は研究対象区域の外縁(AREA_THRESHOLDS[1])と同値', () => {
    expect(CASTLE_FIGHT_MAX_DIST).toBe(AREA_THRESHOLDS[1]);
  });
  it('内側の移動は素通し', () => {
    expect(clampCastleFightCrossing(0, 0, 100, 200)).toEqual({ x: 100, y: 200 });
  });
  it('内→外へ跨ぐ移動は制限ラインへクランプ(方向は保存)', () => {
    const c = clampCastleFightCrossing(2990, 0, 3100, 0);
    expect(Math.hypot(c.x, c.y)).toBeCloseTo(CASTLE_FIGHT_MAX_DIST, 6);
    expect(c.y).toBeCloseTo(0, 6);
  });
  it('既に外に居る場合はスナップさせない(交戦開始時点で外だった時の瞬間移動を作らない)', () => {
    expect(clampCastleFightCrossing(3500, 0, 3400, 0)).toEqual({ x: 3400, y: 0 });
  });
});

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
  TUTORIAL_MOVE_Y_LIMIT_PX, TUTORIAL_MOVE_X_MIN_PX, CORRIDOR_BOTTOM_LIMIT, M0_ADVANCE_EDGE_EPS,
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

  // ★不具合報告 TEST_HANDOFF/results/20260816-tutorial-warp.md(社長「攻撃喰らうとワープする/
  // スタートに戻される」)の回帰。前進壁は**戦闘中だけ外れる**設計なので、戦闘中に壁より先へ
  // 進んだ状態で敵が全滅すると、スナップ実装のままだと壁の位置へ瞬間移動で引き戻されていた。
  // 社長指示「城と同じ壁の見せ方にして」= 跨ぐ移動だけ止める / 既に先に居るならスナップしない。
  describe('M0の前進壁: 跨ぐ移動だけ止める(社長指示v0.25.3498)', () => {
    const limited: PlayableAreaCtx = { ...ctx, m0AdvanceLimitX: 500 };
    const wall = 500 - w / 2; // top-left基準の壁位置

    it('★壁より先に居るなら引き戻さない(戦闘中に前へ出た結果を没収しない)', () => {
      const prev = wall + 300; // 戦闘中に壁の300px先まで進んでいた
      expect(clampRectToPlayableArea(prev, 0, w, h, limited, prev).x).toBe(prev);
      // そのまま更に前へ進むのも自由(城ボス戦=clampCastleFightCrossingと同じ扱い)。
      expect(clampRectToPlayableArea(prev + 50, 0, w, h, limited, prev).x).toBe(prev + 50);
      // 戻る方向も自由。
      expect(clampRectToPlayableArea(prev - 50, 0, w, h, limited, prev).x).toBe(prev - 50);
    });

    it('壁より手前から前へ跨ごうとする移動は従来どおり止める(壁の役目は保つ)', () => {
      const prev = wall - 100;
      expect(clampRectToPlayableArea(999999, 0, w, h, limited, prev).x).toBeCloseTo(wall);
      expect(clampRectToPlayableArea(wall + 10, 0, w, h, limited, prev).x).toBeCloseTo(wall);
    });

    it('境界ちょうどに載っている時は「内側」扱い=押し続けても越えられない(城のEPSと同じ理由)', () => {
      expect(clampRectToPlayableArea(wall + 5, 0, w, h, limited, wall).x).toBeCloseTo(wall);
      expect(clampRectToPlayableArea(wall + 5, 0, w, h, limited, wall + M0_ADVANCE_EDGE_EPS).x).toBeCloseTo(wall);
    });

    it('prevXを渡さない呼び出し(=アイテム/敵の湧き)は従来どおりスナップする(挙動不変)', () => {
      expect(clampRectToPlayableArea(999999, 0, w, h, limited).x).toBeCloseTo(wall);
    });

    it('前進壁以外(上下・左端)はprevXを渡しても従来どおりクランプする', () => {
      const far = wall + 300;
      const r = clampRectToPlayableArea(far, 9999, w, h, limited, far);
      expect(r.x).toBe(far);                                   // 前進壁は素通し
      expect(r.y + h / 2).toBeCloseTo(TUTORIAL_MOVE_Y_LIMIT_PX); // 上下は効いたまま
      const l = clampRectToPlayableArea(-99999, 0, w, h, limited, far);
      expect(l.x + w / 2).toBeCloseTo(TUTORIAL_MOVE_X_MIN_PX);   // 左端も効いたまま
    });
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
  it('内→外へ跨ぐ移動は制限ラインの厳密内側(limit-1)へクランプ(方向は保存)', () => {
    const c = clampCastleFightCrossing(2990, 0, 3100, 0);
    expect(Math.hypot(c.x, c.y)).toBeCloseTo(CASTLE_FIGHT_MAX_DIST - 1, 6);
    expect(c.y).toBeCloseTo(0, 6);
  });
  it('境界ちょうど(浮動小数点で僅かに外)からの外向き移動も引き戻す(v0.25.3058の穴ふさぎ)', () => {
    const c = clampCastleFightCrossing(CASTLE_FIGHT_MAX_DIST + 0.0001, 0, CASTLE_FIGHT_MAX_DIST + 5, 0);
    expect(Math.hypot(c.x, c.y)).toBeCloseTo(CASTLE_FIGHT_MAX_DIST - 1, 6);
  });
  it('既に大きく外に居る場合はスナップさせない(交戦開始時点で外だった時の瞬間移動を作らない)', () => {
    expect(clampCastleFightCrossing(3500, 0, 3400, 0)).toEqual({ x: 3400, y: 0 });
  });
});

// PACING_PUZZLE.md §10-20#2/#3(c)/#4/#5〜#7: EX(stage-ex1)専用の拡張。exStage/exPlayerBarrierを
// 省略した既存の呼び出しは1バイトも挙動が変わらないこと(M6回帰防止)も併せて固定する。
import { EX_NORTH_LIMIT_Y, EX_HALL_LATERAL_CLAMP, EX_SURIEL_NORTH_LOCK_Y, EX_SURIEL_SOUTH_LOCK_Y } from './exHall';
describe('clampRectToPlayableArea(EX専用拡張・exStage省略時はM6と無変化)', () => {
  const corridorCtx: PlayableAreaCtx = { ...NONE_CTX, corridorMode: true };
  const w = 30, h = 40;

  it('exStageを渡さなければ従来のCORRIDOR_LATERAL_CLAMPのまま(M6は無変化)', () => {
    const r = clampRectToPlayableArea(9999, -3000, w, h, corridorCtx);
    expect(r.x).toBe(CORRIDOR_LATERAL_CLAMP - w / 2);
    expect(r.y).toBe(-3000); // 北端クランプも掛からない
  });

  it('exStage=trueだと北端(EX_NORTH_LIMIT_Y)より奥へは進めない', () => {
    const ctx: PlayableAreaCtx = { ...corridorCtx, exStage: true, corridorRunInActive: true };
    const r = clampRectToPlayableArea(0, EX_NORTH_LIMIT_Y - 500, w, h, ctx);
    expect(r.y).toBe(EX_NORTH_LIMIT_Y);
  });

  it('exStage=trueだと広間の内部(スリィエル広間中心)で横クランプがEX_HALL_LATERAL_CLAMPまで広がる', () => {
    const ctx: PlayableAreaCtx = { ...corridorCtx, exStage: true, corridorRunInActive: true };
    const r = clampRectToPlayableArea(9999, -3000, w, h, ctx);
    expect(r.x).toBe(EX_HALL_LATERAL_CLAMP - w / 2);
  });

  it('exStage=trueでも通常通路区間(広間の外)は従来幅のまま', () => {
    const ctx: PlayableAreaCtx = { ...corridorCtx, exStage: true, corridorRunInActive: true };
    const r = clampRectToPlayableArea(9999, 0, w, h, ctx);
    expect(r.x).toBe(CORRIDOR_LATERAL_CLAMP - w / 2);
  });

  it('exPlayerBarrier省略時は結界の影響を受けない(敵/湧き側の呼び出しを想定)', () => {
    const ctx: PlayableAreaCtx = { ...corridorCtx, exStage: true, corridorRunInActive: true };
    const r = clampRectToPlayableArea(0, -3900, w, h, ctx); // 北端より手前だが北結界ラインより奥
    expect(r.y).toBe(-3900);
  });

  it('exPlayerBarrier.northLockYがあると結界より奥へ進めない(プレイヤー専用)', () => {
    const ctx: PlayableAreaCtx = {
      ...corridorCtx, exStage: true, corridorRunInActive: true,
      exPlayerBarrier: { northLockY: EX_SURIEL_NORTH_LOCK_Y, southLockY: null },
    };
    const r = clampRectToPlayableArea(0, -3900, w, h, ctx);
    expect(r.y).toBe(EX_SURIEL_NORTH_LOCK_Y);
  });

  it('exPlayerBarrier.southLockYがあると膜より手前(南)へ戻れない(退路封鎖)', () => {
    const ctx: PlayableAreaCtx = {
      ...corridorCtx, exStage: true, corridorRunInActive: true,
      exPlayerBarrier: { northLockY: null, southLockY: EX_SURIEL_SOUTH_LOCK_Y },
    };
    const r = clampRectToPlayableArea(0, -2000, w, h, ctx);
    expect(r.y).toBe(EX_SURIEL_SOUTH_LOCK_Y);
  });

  it('結界の内側に居る移動はそのまま(南北とも)', () => {
    const ctx: PlayableAreaCtx = {
      ...corridorCtx, exStage: true, corridorRunInActive: true,
      exPlayerBarrier: { northLockY: EX_SURIEL_NORTH_LOCK_Y, southLockY: EX_SURIEL_SOUTH_LOCK_Y },
    };
    const r = clampRectToPlayableArea(0, -3000, w, h, ctx);
    expect(r.y).toBe(-3000);
  });
});

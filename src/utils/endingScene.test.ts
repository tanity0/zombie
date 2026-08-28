import { describe, it, expect } from 'vitest';
import {
  DEFAULT_ENDING_SOLDIER_TUNING, DEFAULT_ENDING_PHILL_TUNING,
  spawnEndingSoldier, stepEndingSoldier, reenterEndingSoldierIfOffscreen, createInitialEndingSoldiers,
  fallenSoldierAt, nextFallenSoldierAfter, fallenSoldiersInRange,
  createInitialEndingPhill, stepEndingPhill,
} from './endingScene';

// 決定的な擬似乱数(テスト用)。0..1を固定シーケンスで返す。
const seqRand = (values: number[]): (() => number) => {
  let i = 0;
  return () => values[i++ % values.length];
};

describe('endingScene — 兵士の状態機械(ENDING_SCENE.md 演出仕様v2 §1/§7/§9)', () => {
  it('spawnEndingSoldierはphase=walk・velMult=1で始まり、値がtuningの範囲内に収まる', () => {
    const rand = seqRand([0.5]);
    const s = spawnEndingSoldier('a', 1000, rand, DEFAULT_ENDING_SOLDIER_TUNING);
    expect(s.phase).toBe('walk');
    expect(s.velMult).toBe(1);
    expect(s.speed).toBeGreaterThanOrEqual(DEFAULT_ENDING_SOLDIER_TUNING.speedMin);
    expect(s.speed).toBeLessThanOrEqual(DEFAULT_ENDING_SOLDIER_TUNING.speedMax);
    expect(Math.abs(s.y)).toBeLessThanOrEqual(DEFAULT_ENDING_SOLDIER_TUNING.bandHalfPx);
  });

  it('walk中は右→左(-x方向)に個体速度で進む', () => {
    const rand = seqRand([0.5]);
    let s = spawnEndingSoldier('a', 1000, rand, DEFAULT_ENDING_SOLDIER_TUNING);
    const x0 = s.x;
    s = stepEndingSoldier(s, 100, 100, DEFAULT_ENDING_SOLDIER_TUNING, rand);
    expect(s.x).toBeLessThan(x0); // 左へ動いた
    expect(s.phase).toBe('walk');
  });

  it('歩行区間(walkLegMs)を超えるとdecelへ、その後stopped→fire→accel→walkへ一巡する', () => {
    const rand = seqRand([0, 0.5, 1, 0.3, 0.7]);
    let s = spawnEndingSoldier('a', 1000, rand, DEFAULT_ENDING_SOLDIER_TUNING);
    s = { ...s, walkLegMs: 500 }; // 歩行区間を短く固定してテストを速くする
    // walk中: まだ歩行区間内
    s = stepEndingSoldier(s, 400, 400, DEFAULT_ENDING_SOLDIER_TUNING, rand);
    expect(s.phase).toBe('walk');
    // 歩行区間を超える
    s = stepEndingSoldier(s, 200, 600, DEFAULT_ENDING_SOLDIER_TUNING, rand);
    expect(s.phase).toBe('decel');
    // decelのease(既定200ms)を使い切るとstoppedへ、velMult=0
    s = stepEndingSoldier(s, 250, 850, DEFAULT_ENDING_SOLDIER_TUNING, rand);
    expect(s.phase).toBe('stopped');
    expect(s.velMult).toBe(0);
    expect(s.stopDurationMs).toBeGreaterThanOrEqual(DEFAULT_ENDING_SOLDIER_TUNING.stopMsMin);
    expect(s.stopDurationMs).toBeLessThanOrEqual(DEFAULT_ENDING_SOLDIER_TUNING.stopMsMax);
    // stopped区間を使い切るとfireへ切り替わる(この1tickでは発砲ロジックはまだ回らない=shotsFired0)
    s = stepEndingSoldier(s, s.stopDurationMs + 10, 2000, DEFAULT_ENDING_SOLDIER_TUNING, rand);
    expect(s.phase).toBe('fire');
    expect(s.shotsPlanned).toBeGreaterThanOrEqual(1);
    expect(s.shotsPlanned).toBeLessThanOrEqual(3);
    expect(s.shotsFired).toBe(0);
    // fireフェーズの次tickでnextShotAtMs=0なので即1発目(1発目が遅れて出るのはNG=CLAUDE.md「小さくて見えない」の運動版)
    s = stepEndingSoldier(s, 16, 2016, DEFAULT_ENDING_SOLDIER_TUNING, rand);
    expect(s.shotsFired).toBeGreaterThanOrEqual(1);
    expect(s.lastShotAt).toBe(2016);
    const planned = s.shotsPlanned;
    // 発砲間隔(300ms)を全部進めて撃ち切る
    for (let i = 0; i < planned + 1 && s.phase === 'fire'; i++) {
      s = stepEndingSoldier(s, DEFAULT_ENDING_SOLDIER_TUNING.shotIntervalMs, 3000 + i * 300, DEFAULT_ENDING_SOLDIER_TUNING, rand);
    }
    expect(s.phase).toBe('accel');
    expect(s.shotsFired).toBe(planned);
    // accelのeaseを使い切るとwalkへ戻り、velMult=1・新しいwalkLegMsを持つ
    s = stepEndingSoldier(s, DEFAULT_ENDING_SOLDIER_TUNING.easeMs + 10, 9999, DEFAULT_ENDING_SOLDIER_TUNING, rand);
    expect(s.phase).toBe('walk');
    expect(s.velMult).toBe(1);
    expect(s.walkLegMs).toBeGreaterThanOrEqual(DEFAULT_ENDING_SOLDIER_TUNING.walkMsMin);
  });

  it('decel/accel中はvelMultが1→0/0→1へ単調に(慣性=瞬間停止しない・CLAUDE.md MUST)', () => {
    const rand = seqRand([0.5]);
    let s = spawnEndingSoldier('a', 1000, rand, DEFAULT_ENDING_SOLDIER_TUNING);
    s = { ...s, phase: 'decel', phaseMs: 0, velMult: 1, walkLegMs: 0 };
    const half = DEFAULT_ENDING_SOLDIER_TUNING.easeMs / 2;
    s = stepEndingSoldier(s, half, half, DEFAULT_ENDING_SOLDIER_TUNING, rand);
    expect(s.velMult).toBeGreaterThan(0);
    expect(s.velMult).toBeLessThan(1);
  });

  it('createInitialEndingSoldiersは指定人数を一意なidで作る', () => {
    const rand = seqRand([0.1, 0.4, 0.9, 0.2]);
    const arr = createInitialEndingSoldiers(7, 2000, 1500, rand, DEFAULT_ENDING_SOLDIER_TUNING);
    expect(arr).toHaveLength(7);
    expect(new Set(arr.map(s => s.id)).size).toBe(7);
  });

  it('左境界を割ると右から再投入され、phaseがwalkに戻る(プール・§9)', () => {
    const rand = seqRand([0.5]);
    let s = spawnEndingSoldier('a', -500, rand, DEFAULT_ENDING_SOLDIER_TUNING);
    s = { ...s, phase: 'fire', velMult: 0 }; // 再投入前は任意フェーズでも良いことの確認を兼ねる
    const reentered = reenterEndingSoldierIfOffscreen(s, -400, 3000, 200, rand, DEFAULT_ENDING_SOLDIER_TUNING);
    expect(reentered.phase).toBe('walk');
    expect(reentered.x).toBeGreaterThanOrEqual(3000);
    expect(reentered.id).toBe('a');
  });

  it('左境界の内側にいる兵士はそのまま(無変更)', () => {
    const rand = seqRand([0.5]);
    const s = spawnEndingSoldier('a', 100, rand, DEFAULT_ENDING_SOLDIER_TUNING);
    const result = reenterEndingSoldierIfOffscreen(s, -400, 3000, 200, rand, DEFAULT_ENDING_SOLDIER_TUNING);
    expect(result).toBe(s); // 同一参照(無変更)
  });
});

describe('endingScene — 倒れ兵士の配置(§8・ワールド固定)', () => {
  it('900〜1400pxの間隔に収まる(隣接indexの差)', () => {
    for (let i = 0; i < 200; i++) {
      const a = fallenSoldierAt(i);
      const b = fallenSoldierAt(i + 1);
      const gap = b.x - a.x;
      expect(gap).toBeGreaterThanOrEqual(900);
      expect(gap).toBeLessThanOrEqual(1400);
    }
  });

  it('xについて単調増加', () => {
    let prev = -Infinity;
    for (let i = 0; i < 200; i++) {
      const spot = fallenSoldierAt(i);
      expect(spot.x).toBeGreaterThan(prev);
      prev = spot.x;
    }
  });

  it('nextFallenSoldierAfterはafterIndexより後ろ・fromX以降の最初の1体を返す', () => {
    const spot = nextFallenSoldierAfter(2, 5000);
    expect(spot.index).toBeGreaterThan(2);
    expect(spot.x).toBeGreaterThanOrEqual(5000);
  });

  it('fallenSoldiersInRangeは範囲内のみ返し、順序はindex昇順', () => {
    const spots = fallenSoldiersInRange(0, 6000);
    expect(spots.length).toBeGreaterThan(0);
    for (const s of spots) {
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.x).toBeLessThanOrEqual(6000);
    }
    for (let i = 1; i < spots.length; i++) expect(spots[i].index).toBeGreaterThan(spots[i - 1].index);
  });
});

describe('endingScene — フィルの救護状態機械(§2/§4/§8)', () => {
  it('createInitialEndingPhillはphase=walk・velMult=1で始まる', () => {
    const s = createInitialEndingPhill();
    expect(s.phase).toBe('walk');
    expect(s.velMult).toBe(1);
    expect(s.lastHealedIndex).toBe(-1);
    expect(s.targetIndex).toBeNull();
  });

  it('倒れ兵士に近づくとapproachDecelへ入り、停止点(手前stopOffsetPx)でvelMultが0近くまで下がる', () => {
    let s = createInitialEndingPhill();
    const target = fallenSoldierAt(0);
    const stopX = target.x - DEFAULT_ENDING_PHILL_TUNING.stopOffsetPx;
    // approachTriggerPxの少し外側から1歩で入る
    let playerX = stopX - DEFAULT_ENDING_PHILL_TUNING.approachTriggerPx + 1;
    s = stepEndingPhill(s, playerX, 16, DEFAULT_ENDING_PHILL_TUNING);
    expect(s.phase).toBe('approachDecel');
    expect(s.targetIndex).toBe(0);
    // 停止点ぎりぎりまで進める(プレイヤーの実移動はstore/useGameLoop側が担うので、テストでは
    // playerXを外から与えて状態機械の反応だけを見る)。
    playerX = stopX - 1;
    s = stepEndingPhill(s, playerX, 16, DEFAULT_ENDING_PHILL_TUNING);
    expect(s.phase).toBe('healForward');
    expect(s.velMult).toBe(0);
  });

  it('healForward→healHold→healReverse→accel→walkと一巡し、lastHealedIndexが更新される', () => {
    let s: ReturnType<typeof createInitialEndingPhill> = { ...createInitialEndingPhill(), phase: 'healForward', phaseMs: 0, targetIndex: 3, frame: 0 };
    const t = DEFAULT_ENDING_PHILL_TUNING;
    // healForward: 5コマぶん進める(片道)
    s = stepEndingPhill(s, 0, t.healFrameMs * 5, t);
    expect(s.phase).toBe('healHold');
    expect(s.frame).toBe(5);
    // healHold: 保持ぶん進める
    s = stepEndingPhill(s, 0, t.healHoldMs, t);
    expect(s.phase).toBe('healReverse');
    // healReverse: 5コマぶん逆再生
    s = stepEndingPhill(s, 0, t.healFrameMs * 5, t);
    expect(s.phase).toBe('accel');
    expect(s.lastHealedIndex).toBe(3);
    expect(s.targetIndex).toBeNull();
    // accel: easeを使い切るとwalkへ、velMult=1
    s = stepEndingPhill(s, 0, t.accelMs + 10, t);
    expect(s.phase).toBe('walk');
    expect(s.velMult).toBe(1);
  });

  it('healForward中はvelMult=0(停止して救護動作に専念=判定なしの観賞シーン)', () => {
    let s: ReturnType<typeof createInitialEndingPhill> = { ...createInitialEndingPhill(), phase: 'healForward', phaseMs: 0, targetIndex: 0 };
    s = stepEndingPhill(s, 0, 50, DEFAULT_ENDING_PHILL_TUNING);
    expect(s.velMult).toBe(0);
  });
});

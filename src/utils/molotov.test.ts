import { describe, it, expect } from 'vitest';
import { computeMolotovTick, isEnemyInGroundFire, MolotovCycleState } from './molotov';

describe('computeMolotovTick', () => {
  it('クールダウン明け(cooldownAt到達)でアイドルから新サイクルを開始し、次回CDを cycleMs 後に確定する', () => {
    const result = computeMolotovTick({
      gameTime: 1000,
      isMoving: false,
      cycle: null,
      cooldownAt: 1000,
      maxFires: 3,
      cycleMs: 10000,
      dropIntervalMs: 1000,
    });
    expect(result.cycle).toEqual({ droppedCount: 0, nextDropAt: 1000 });
    expect(result.cooldownAt).toBe(11000); // 開始時刻(1000)基準で+10000
    expect(result.drop).toBe(false); // このフレームはまだ移動していない
  });

  it('クールダウン未到達ならアイドルのまま(サイクル開始しない)', () => {
    const result = computeMolotovTick({
      gameTime: 500,
      isMoving: true,
      cycle: null,
      cooldownAt: 1000,
      maxFires: 3,
    });
    expect(result.cycle).toBeNull();
    expect(result.cooldownAt).toBeNull();
    expect(result.drop).toBe(false);
  });

  it('移動中かつ投下間隔到達で1個落とし、droppedCountを進める', () => {
    const cycle: MolotovCycleState = { droppedCount: 0, nextDropAt: 1000 };
    const result = computeMolotovTick({
      gameTime: 1000,
      isMoving: true,
      cycle,
      cooldownAt: 0,
      maxFires: 3,
      dropIntervalMs: 1000,
    });
    expect(result.drop).toBe(true);
    expect(result.cycle).toEqual({ droppedCount: 1, nextDropAt: 2000 });
    expect(result.cooldownAt).toBeNull(); // サイクル継続中は次回CDを変更しない
  });

  it('停止中(isMoving=false)は投下間隔到達済みでも落とさず待つ', () => {
    const cycle: MolotovCycleState = { droppedCount: 0, nextDropAt: 1000 };
    const result = computeMolotovTick({
      gameTime: 5000, // 間隔をとっくに過ぎていても
      isMoving: false,
      cycle,
      cooldownAt: 0,
      maxFires: 3,
    });
    expect(result.drop).toBe(false);
    expect(result.cycle).toBe(cycle); // 状態は変化しない(同一参照=無駄な書き込みを避ける)
  });

  it('最後の1個(N本目)を落とすとサイクルはnullになる(=アイドルへ)', () => {
    const cycle: MolotovCycleState = { droppedCount: 2, nextDropAt: 3000 };
    const result = computeMolotovTick({
      gameTime: 3000,
      isMoving: true,
      cycle,
      cooldownAt: 0,
      maxFires: 3,
    });
    expect(result.drop).toBe(true);
    expect(result.cycle).toBeNull();
  });

  it('Lv別本数(N=3/5/7)ぶん移動し続けると、ちょうどN回落として(10秒を待たず)投下完了する', () => {
    let cycle: MolotovCycleState | null = null;
    let cooldownAt = 0;
    let drops = 0;
    // 1個目の開始(t=0)から1秒おきに移動し続ける。cycleがnullに戻った時点(=投下完了)で止め、
    // 次サイクルの開始(cooldownAt明け)分は数えない。
    for (let t = 0; t < 10000; t += 1000) {
      const result = computeMolotovTick({
        gameTime: t,
        isMoving: true,
        cycle,
        cooldownAt,
        maxFires: 7, // Lv3
      });
      cycle = result.cycle;
      if (result.cooldownAt !== null) cooldownAt = result.cooldownAt;
      if (result.drop) drops++;
      if (drops > 0 && cycle === null) break; // 投下完了(N本目)で打ち切り
    }
    expect(drops).toBe(7);
    expect(cycle).toBeNull(); // 7本落としたら投下完了(10秒経過を待たずアイドルへ)
    expect(cooldownAt).toBe(10000); // 次サイクルの開始は「開始時刻(0)+10秒」= 10000(投下完了を待たない)
  });

  it('10秒経過ちょうどで次のクールダウンが明ける(cooldownAtに到達)', () => {
    const result = computeMolotovTick({
      gameTime: 11000,
      isMoving: false,
      cycle: null,
      cooldownAt: 11000,
      maxFires: 3,
    });
    expect(result.cooldownAt).toBe(21000);
  });
});

describe('isEnemyInGroundFire', () => {
  const fires = [{ x: 100, y: 100 }, { x: 300, y: 300 }];

  it('火の中心から半径内なら true', () => {
    expect(isEnemyInGroundFire(110, 100, fires, 22)).toBe(true);
  });

  it('半径ちょうど(境界)は含む', () => {
    expect(isEnemyInGroundFire(122, 100, fires, 22)).toBe(true);
  });

  it('半径外なら false', () => {
    expect(isEnemyInGroundFire(200, 200, fires, 22)).toBe(false);
  });

  it('複数の火のいずれか1つに重なっていれば true(2個目の火で判定)', () => {
    expect(isEnemyInGroundFire(305, 300, fires, 22)).toBe(true);
  });

  it('火が無ければ常に false', () => {
    expect(isEnemyInGroundFire(100, 100, [], 22)).toBe(false);
  });
});

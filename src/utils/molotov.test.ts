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

import {
  MOLOTOV_FIRE_RADIUS, MOLOTOV_FIRE_LIFETIME_MS, MOLOTOV_SPREAD_GROW_MS, MOLOTOV_SPREAD_SHRINK_MS,
  MOLOTOV_SPREAD_RADIUS_BY_LEVEL, molotovSpreadRadiusForLevel, molotovSpreadRadiusAt, groundFireRadiusAt,
  groundFiresWithLiveRadius, molotovChildFlameLayout, molotovChildFlameScale,
} from './molotov';

describe('火炎瓶の延焼の広がり(MOLOTOV_SPREAD.md)', () => {
  it('レベルの半径は 小35 / 中60 / 大90', () => {
    expect([1, 2, 3].map(molotovSpreadRadiusForLevel)).toEqual([35, 60, 90]);
    expect(MOLOTOV_SPREAD_RADIUS_BY_LEVEL.slice(1)).toEqual([35, 60, 90]);
    expect(molotovSpreadRadiusForLevel(0)).toBe(35);
    expect(molotovSpreadRadiusForLevel(9)).toBe(90);
  });

  it('置いた瞬間は火元の半径、0.6秒で広がり切る(ease-out=前半で大きく進む)', () => {
    const R = 125;
    expect(molotovSpreadRadiusAt(R, 0)).toBe(MOLOTOV_FIRE_RADIUS);
    expect(molotovSpreadRadiusAt(R, MOLOTOV_SPREAD_GROW_MS)).toBeCloseTo(R, 6);
    expect(molotovSpreadRadiusAt(R, 1500)).toBeCloseTo(R, 6);
    const half = molotovSpreadRadiusAt(R, MOLOTOV_SPREAD_GROW_MS / 2);
    expect(half).toBeGreaterThan((MOLOTOV_FIRE_RADIUS + R) / 2); // ease-out
    let prev = 0;
    for (let t = 0; t <= MOLOTOV_SPREAD_GROW_MS; t += 50) {
      const r = molotovSpreadRadiusAt(R, t);
      expect(r).toBeGreaterThanOrEqual(prev);
      prev = r;
    }
  });

  it('寿命の終わりに外側から火元の半径へ縮み、寿命が来たら0(寿命は3秒のまま)', () => {
    const R = 90;
    const shrinkStart = MOLOTOV_FIRE_LIFETIME_MS - MOLOTOV_SPREAD_SHRINK_MS;
    expect(molotovSpreadRadiusAt(R, shrinkStart)).toBeCloseTo(R, 6);
    let prev = Infinity;
    for (let t = shrinkStart; t < MOLOTOV_FIRE_LIFETIME_MS; t += 50) {
      const r = molotovSpreadRadiusAt(R, t);
      expect(r).toBeLessThanOrEqual(prev);
      expect(r).toBeGreaterThanOrEqual(MOLOTOV_FIRE_RADIUS);
      prev = r;
    }
    expect(molotovSpreadRadiusAt(R, MOLOTOV_FIRE_LIFETIME_MS - 1)).toBeLessThan(MOLOTOV_FIRE_RADIUS + 1);
    expect(molotovSpreadRadiusAt(R, MOLOTOV_FIRE_LIFETIME_MS)).toBe(0);
    expect(molotovSpreadRadiusAt(R, -1)).toBe(0);
  });

  it('当たり=灯っている半径: 広がる前の外側の敵は燃えず、広がった後は燃える。広がらない火(延焼弾)は従来の半径のまま', () => {
    const fire = { x: 0, y: 0, createdAt: 1000, spreadRadius: 125 };
    const at = (t: number) => groundFiresWithLiveRadius([fire], t);
    expect(isEnemyInGroundFire(100, 0, at(1000))).toBe(false);  // 置いた瞬間(22px)
    expect(isEnemyInGroundFire(20, 0, at(1000))).toBe(true);
    expect(isEnemyInGroundFire(100, 0, at(1000 + MOLOTOV_SPREAD_GROW_MS))).toBe(true);
    expect(isEnemyInGroundFire(124, 0, at(2000))).toBe(true);
    expect(isEnemyInGroundFire(127, 0, at(2000))).toBe(false);
    expect(isEnemyInGroundFire(100, 0, at(1000 + MOLOTOV_FIRE_LIFETIME_MS - 20))).toBe(false); // 縮んだ後
    // 倍率(エクスプローダー)は灯っている半径に掛かる
    expect(isEnemyInGroundFire(150, 0, at(2000), MOLOTOV_FIRE_RADIUS, 1.25)).toBe(true);
    // 広がらない火: 半径固定(radius 指定はそのまま・未指定は22)
    expect(groundFireRadiusAt({ createdAt: 0 }, 2000)).toBe(MOLOTOV_FIRE_RADIUS);
    expect(groundFireRadiusAt({ createdAt: 0, radius: 40 }, 100)).toBe(40);
  });

  it('子の火: Lv1は内側の輪だけ・半径が大きいほど数が増え、全部が当たりの円の内側にあり、灯っている間だけ見える', () => {
    const counts = [35, 60, 90].map(R => molotovChildFlameLayout(R, 3.3).length);
    expect(counts[0]).toBeGreaterThan(0);
    expect(counts[1]).toBeGreaterThan(counts[0]);
    expect(counts[2]).toBeGreaterThan(counts[1]);
    for (const R of [35, 60, 90]) {
      const kids = molotovChildFlameLayout(R, 7.7);
      for (const k of kids) {
        expect(Math.hypot(k.dx, k.dy)).toBeLessThanOrEqual(R);
        // 見えている間(scale>0)は、その子の位置が当たりの円の内側
        for (let t = 0; t < MOLOTOV_FIRE_LIFETIME_MS; t += 25) {
          if (molotovChildFlameScale(k, t) > 0) expect(k.dist).toBeLessThanOrEqual(molotovSpreadRadiusAt(R, t) + 1e-6);
        }
        expect(molotovChildFlameScale(k, MOLOTOV_FIRE_LIFETIME_MS)).toBe(0);
      }
      // 内側→外側の順に灯る
      const sorted = [...kids].sort((a, b) => a.dist - b.dist);
      for (let i = 1; i < sorted.length; i++) expect(sorted[i].lightAt).toBeGreaterThanOrEqual(sorted[i - 1].lightAt);
      // 機械的な等間隔にしない(距離にばらつき)
      const ds = kids.map(k => k.dist);
      expect(new Set(ds.map(d => d.toFixed(2))).size).toBeGreaterThan(1);
    }
  });
});

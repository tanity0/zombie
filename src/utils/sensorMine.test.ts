import { describe, it, expect } from 'vitest';
import {
  placeSensorMine, tickSensorMines,
  SENSOR_MINE_CAP_BY_LEVEL, SENSOR_MINE_RADIUS, SENSOR_MINE_FUSE_MS, SENSOR_MINE_COOLDOWN_MS,
  SensorMineState,
} from './sensorMine';

const mine = (id: string, placedAt: number, x = 0, y = 0, triggeredAt = 0): SensorMineState =>
  ({ id, x, y, placedAt, triggeredAt });

describe('placeSensorMine', () => {
  it('上限未満なら末尾に追加する(既存はそのまま)', () => {
    const next = placeSensorMine([mine('a', 100)], mine('b', 200), 3);
    expect(next.map(m => m.id)).toEqual(['a', 'b']);
  });

  it('上限到達中は最古(placedAt最小)を消して置き直す(§6.4)', () => {
    const mines = [mine('a', 100), mine('b', 200), mine('c', 300)];
    const next = placeSensorMine(mines, mine('d', 400), 3);
    expect(next.map(m => m.id)).toEqual(['b', 'c', 'd']);
  });

  it('同時刻(placedAt同値)なら配列で先のものを最古として置換する', () => {
    const mines = [mine('a', 100), mine('b', 100), mine('c', 300)];
    const next = placeSensorMine(mines, mine('d', 400), 3);
    expect(next.map(m => m.id)).toEqual(['b', 'c', 'd']);
  });

  it('設置CD=10秒(§6.10 M33①・社長指示。適用はtriggerCounterのsetSubWeaponCooldown経由)', () => {
    expect(SENSOR_MINE_COOLDOWN_MS).toBe(10000);
  });

  it('レベル別上限=3/4/5(SENSOR_MINE_CAP_BY_LEVEL)', () => {
    expect(SENSOR_MINE_CAP_BY_LEVEL[1]).toBe(3);
    expect(SENSOR_MINE_CAP_BY_LEVEL[2]).toBe(4);
    expect(SENSOR_MINE_CAP_BY_LEVEL[3]).toBe(5);
    // Lv2: 4個目までは置換なしで並ぶ
    let mines: SensorMineState[] = [];
    for (let i = 0; i < 4; i++) mines = placeSensorMine(mines, mine(`m${i}`, i * 100), SENSOR_MINE_CAP_BY_LEVEL[2]);
    expect(mines).toHaveLength(4);
    expect(mines[0].id).toBe('m0');
    // 5個目で最古が消える
    mines = placeSensorMine(mines, mine('m4', 400), SENSOR_MINE_CAP_BY_LEVEL[2]);
    expect(mines).toHaveLength(4);
    expect(mines.map(m => m.id)).toEqual(['m1', 'm2', 'm3', 'm4']);
  });

  it('元の配列は破壊しない(純関数)', () => {
    const mines = [mine('a', 100)];
    placeSensorMine(mines, mine('b', 200), 1);
    expect(mines.map(m => m.id)).toEqual(['a']);
  });
});

describe('tickSensorMines', () => {
  it('敵がセンサー範囲(=爆発半径79)に入った待機地雷は triggeredAt が付く', () => {
    const res = tickSensorMines({
      mines: [mine('a', 0, 0, 0)],
      enemies: [{ x: SENSOR_MINE_RADIUS - 1, y: 0 }],
      gameTime: 5000,
    });
    expect(res.changed).toBe(true);
    expect(res.detonated).toHaveLength(0);
    expect(res.mines[0].triggeredAt).toBe(5000);
  });

  it('範囲外の敵では感知しない(境界: 距離=半径ちょうどは感知)', () => {
    const outside = tickSensorMines({
      mines: [mine('a', 0, 0, 0)],
      enemies: [{ x: SENSOR_MINE_RADIUS + 1, y: 0 }],
      gameTime: 5000,
    });
    expect(outside.changed).toBe(false);
    expect(outside.mines[0].triggeredAt).toBe(0);
    const edge = tickSensorMines({
      mines: [mine('a', 0, 0, 0)],
      enemies: [{ x: SENSOR_MINE_RADIUS, y: 0 }],
      gameTime: 5000,
    });
    expect(edge.mines[0].triggeredAt).toBe(5000);
  });

  it('感知済みの地雷は敵が離れても解除されず、2秒(SENSOR_MINE_FUSE_MS)経過で起爆リストへ移る', () => {
    const armed = mine('a', 0, 0, 0, 5000);
    // 敵が離れた直後(まだ2秒経っていない): 保持されたまま
    const holding = tickSensorMines({ mines: [armed], enemies: [], gameTime: 5000 + SENSOR_MINE_FUSE_MS - 1 });
    expect(holding.changed).toBe(false);
    expect(holding.mines).toHaveLength(1);
    expect(holding.detonated).toHaveLength(0);
    // 2秒経過: 起爆
    const boom = tickSensorMines({ mines: [armed], enemies: [], gameTime: 5000 + SENSOR_MINE_FUSE_MS });
    expect(boom.changed).toBe(true);
    expect(boom.mines).toHaveLength(0);
    expect(boom.detonated.map(m => m.id)).toEqual(['a']);
  });

  it('待機・感知・起爆が混在しても正しく仕分けする', () => {
    const mines = [
      mine('idle', 0, 1000, 0),         // 敵が遠い→待機のまま
      mine('sense', 0, 0, 0),           // 敵が範囲内→感知
      mine('boom', 0, 2000, 0, 1000),   // 感知済み+2秒経過→起爆
    ];
    const res = tickSensorMines({ mines, enemies: [{ x: 10, y: 0 }], gameTime: 1000 + SENSOR_MINE_FUSE_MS });
    expect(res.changed).toBe(true);
    expect(res.detonated.map(m => m.id)).toEqual(['boom']);
    expect(res.mines.map(m => m.id)).toEqual(['idle', 'sense']);
    expect(res.mines.find(m => m.id === 'idle')!.triggeredAt).toBe(0);
    expect(res.mines.find(m => m.id === 'sense')!.triggeredAt).toBe(1000 + SENSOR_MINE_FUSE_MS);
  });

  it('地雷なしなら変化なし(changed=false)', () => {
    const res = tickSensorMines({ mines: [], enemies: [{ x: 0, y: 0 }], gameTime: 100 });
    expect(res.changed).toBe(false);
    expect(res.mines).toHaveLength(0);
    expect(res.detonated).toHaveLength(0);
  });
});

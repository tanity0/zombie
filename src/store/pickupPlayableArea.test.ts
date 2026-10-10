// addPickup が「プレイヤーが行ける帯」の外に着地させないことの配線テスト。
// 社長指示「ステージ2に限らず、移動不可エリアにアイテムも敵も沸かないで」対応(v0.25.2391)。
// クランプの計算自体は src/world/playableArea.test.ts が固定するので、ここでは
// addPickup がその関数を正しい引数(散らばり後の着地点・当たり判定16×16)で呼んでいること、
// throwFromX/Y(投擲アニメの始点)を書き換えないことだけを確認する。
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore, TUTORIAL_MOVE_Y_LIMIT_PX, TUTORIAL_MOVE_X_MIN_PX, LAB_CORRIDOR_Y_LIMIT_PX } from './gameStore';
import { CORRIDOR_LATERAL_CLAMP } from '../utils/corridorProjection';
import type { Pickup } from '../types/game';

const PICKUP_HIT_SIZE = 16; // gameStore.ts の PICKUP_HIT_SIZE と同値(モジュール非公開なので複製)

const resetPlayableFlags = () => {
  useGameStore.setState({
    pickups: [],
    farBackdrop: '',
    stageTheme: 'forest',
    corridorMode: false,
    corridorRunInActive: false,
    m0AdvanceLimitX: null,
  });
};

describe('addPickup(移動不可エリアへ着地させない)', () => {
  beforeEach(() => {
    resetPlayableFlags();
  });

  it('制限の無いステージでは遠くの座標もそのまま(worldDropで散らばりを止めて検証)', () => {
    useGameStore.getState().addPickup({ id: 'p1', type: 'treasure', x: 9999, y: -9999, value: 1, worldDrop: true } as Pickup);
    const p = useGameStore.getState().pickups.find(p => p.id === 'p1')!;
    expect(p.x).toBe(9999);
    expect(p.y).toBe(-9999);
  });

  it('洋館通路(corridorMode): 帯の外のxは内側へ寄る', () => {
    useGameStore.setState({ corridorMode: true });
    useGameStore.getState().addPickup({ id: 'p2', type: 'treasure', x: 99999, y: 0, value: 1, worldDrop: true } as Pickup);
    const p = useGameStore.getState().pickups.find(p => p.id === 'p2')!;
    expect(p.x + PICKUP_HIT_SIZE / 2).toBeCloseTo(CORRIDOR_LATERAL_CLAMP);
  });

  it('洋館通路(corridorMode): 下限を超えるyは内側へ寄る(走り込み中でなければ)', () => {
    useGameStore.setState({ corridorMode: true, corridorRunInActive: false });
    useGameStore.getState().addPickup({ id: 'p3', type: 'treasure', x: 0, y: 99999, value: 1, worldDrop: true } as Pickup);
    const p = useGameStore.getState().pickups.find(p => p.id === 'p3')!;
    expect(p.y).toBeLessThan(99999);
  });

  it('M0(訓練): 帯の外のy/xは内側へ寄る', () => {
    useGameStore.setState({ farBackdrop: 'tutorial' });
    useGameStore.getState().addPickup({ id: 'p4', type: 'ammo-handgun', x: -9999, y: 9999, value: 0, worldDrop: true } as Pickup);
    const p = useGameStore.getState().pickups.find(p => p.id === 'p4')!;
    expect(p.x + PICKUP_HIT_SIZE / 2).toBeCloseTo(TUTORIAL_MOVE_X_MIN_PX);
    expect(p.y + PICKUP_HIT_SIZE / 2).toBeCloseTo(TUTORIAL_MOVE_Y_LIMIT_PX);
  });

  it('ステージ2(labTheme): 帯の外のyは内側へ寄る。xは無制限', () => {
    useGameStore.setState({ stageTheme: 'lab' });
    useGameStore.getState().addPickup({ id: 'p5', type: 'ammo-rifle', x: 12345, y: -9999, value: 0, worldDrop: true } as Pickup);
    const p = useGameStore.getState().pickups.find(p => p.id === 'p5')!;
    expect(p.x).toBe(12345); // X無制限
    expect(p.y + PICKUP_HIT_SIZE / 2).toBeCloseTo(-LAB_CORRIDOR_Y_LIMIT_PX);
  });

  it('throwFromX/Y(投擲アニメの始点)は書き換えない。着地点だけ寄る', () => {
    useGameStore.setState({ corridorMode: true });
    useGameStore.getState().addPickup({
      id: 'p6', type: 'ammo-shotgun', x: 99999, y: 0, value: 0,
      throwFromX: 5, throwFromY: 5, throwStartAt: Date.now(), throwDuration: 300,
    } as Pickup);
    const p = useGameStore.getState().pickups.find(p => p.id === 'p6')!;
    expect(p.throwFromX).toBe(5);
    expect(p.throwFromY).toBe(5);
    expect(p.x + PICKUP_HIT_SIZE / 2).toBeCloseTo(CORRIDOR_LATERAL_CLAMP);
  });
});

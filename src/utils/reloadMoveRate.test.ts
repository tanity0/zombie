// リロードの歩き/立ち止まり補正(歩く=通常の1.2倍の時間 / 止まる=通常の1/1.2の時間)。
import { describe, it, expect, afterEach, vi } from 'vitest';
import { advanceReloadEnd, reloadRateFor, RELOAD_MOVE_TIME_MULT } from './weaponUtils';
import { useGameStore } from '../store/gameStore';

/** 実時間 dt 刻みで、終わるまでの実時間を数える(reloadEndsAt の判定と同じ now<endsAt)。 */
const simulate = (totalMs: number, dt: number, movingAt: (t: number) => boolean): number => {
  let now = 0;
  let endsAt = totalMs;
  while (now < endsAt) {
    now += dt;
    endsAt = advanceReloadEnd(endsAt, now, dt, reloadRateFor(movingAt(now)));
  }
  return now;
};

describe('reloadRateFor', () => {
  it('歩く=1/1.2、止まる=1.2', () => {
    expect(reloadRateFor(true)).toBeCloseTo(1 / 1.2, 12);
    expect(reloadRateFor(false)).toBeCloseTo(1.2, 12);
    expect(RELOAD_MOVE_TIME_MULT).toBe(1.2);
  });
});

describe('advanceReloadEnd', () => {
  it('ずっと歩いている: 通常の1.2倍の時間で終わる', () => {
    expect(simulate(1200, 1, () => true)).toBeCloseTo(1440, -1);
  });
  it('ずっと止まっている: 通常の1/1.2の時間で終わる', () => {
    expect(simulate(1200, 1, () => false)).toBeCloseTo(1000, -1);
  });
  it('フレーム刻みが粗くても総時間は同じ(16ms刻み)', () => {
    expect(Math.abs(simulate(1200, 16, () => true) - 1440)).toBeLessThanOrEqual(16);
    expect(Math.abs(simulate(1200, 16, () => false) - 1000)).toBeLessThanOrEqual(16);
  });
  it('途中で止まる: その瞬間から残りが早く減る(連続)', () => {
    // 600ms 歩く(通常で500ms分進む)→残り通常700ms を止まって 700/1.2≈583ms
    expect(simulate(1200, 1, t => t <= 600)).toBeCloseTo(600 + 700 / 1.2, -1);
  });
  it('途中で歩き出す: その瞬間から残りが遅く減る', () => {
    // 600ms 止まる(通常で720ms分)→残り通常480ms を歩いて 480×1.2=576ms
    expect(simulate(1200, 1, t => t > 600)).toBeCloseTo(600 + 480 * 1.2, -1);
  });
  it('rate=1 ならずれない(締切そのまま)', () => {
    expect(advanceReloadEnd(5000, 1000, 16, 1)).toBe(5000);
  });
  it('終わっている/リロードしていない/dt<=0 は触らない', () => {
    expect(advanceReloadEnd(0, 1000, 16, 1.2)).toBe(0);
    expect(advanceReloadEnd(900, 1000, 16, 1 / 1.2)).toBe(900);
    expect(advanceReloadEnd(5000, 1000, 0, 1.2)).toBe(5000);
    expect(advanceReloadEnd(5000, 1000, -5, 1.2)).toBe(5000);
  });
  it('早める時は now より前へ行かない', () => {
    expect(advanceReloadEnd(1001, 1000, 50, 1.2)).toBe(1000);
  });
  it('進捗(通常の時間で進んだ量)は逆戻りしない', () => {
    const total = 1200;
    let now = 0;
    let endsAt = total;
    let prev = 0;
    for (let i = 0; i < 200 && now < endsAt; i++) {
      now += 16;
      endsAt = advanceReloadEnd(endsAt, now, 16, reloadRateFor(i % 20 < 10));
      const progress = Math.max(0, Math.min(1, 1 - (endsAt - now) / total));
      expect(progress).toBeGreaterThanOrEqual(prev);
      prev = progress;
    }
  });
});

describe('store.applyReloadMoveRate', () => {
  afterEach(() => vi.useRealTimers());

  it('リロード中のプレイヤーの締切を isMoving に応じてずらす', () => {
    vi.useFakeTimers();
    vi.setSystemTime(100000);
    const st = () => useGameStore.getState();
    useGameStore.setState(s => ({ player: { ...s.player, reloadingWeaponId: 'test-gun', reloadEndsAt: 101000, isMoving: true } }));
    st().applyReloadMoveRate(100);
    expect(st().player.reloadEndsAt).toBeCloseTo(101000 + 100 * (1 - 1 / 1.2), 6);

    useGameStore.setState(s => ({ player: { ...s.player, reloadEndsAt: 101000, isMoving: false } }));
    st().applyReloadMoveRate(100);
    expect(st().player.reloadEndsAt).toBeCloseTo(101000 - 20, 6);
  });

  it('リロードしていない時は何もしない', () => {
    const st = () => useGameStore.getState();
    useGameStore.setState(s => ({ player: { ...s.player, reloadingWeaponId: '', reloadEndsAt: 0 } }));
    const before = st().player;
    st().applyReloadMoveRate(100);
    expect(st().player).toBe(before);
  });
});

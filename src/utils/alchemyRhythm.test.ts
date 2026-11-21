import { describe, it, expect } from 'vitest';
import {
  newAlchemyRhythm, advanceAlchemyRhythm, tapAlchemyRhythm, alchemyChannelDurationMs, alchemyChannelEndAt,
  alchemyRareChance, alchemyRingProgress, type AlchemyRhythmState,
  ALCHEMY_RHYTHM_TRAVEL_MS, ALCHEMY_RHYTHM_WINDOW_MS, ALCHEMY_RHYTHM_CUT_MS, ALCHEMY_RHYTHM_CONSUME_MS,
} from './alchemyRhythm';
import { ALCHEMY_CHANNEL_MS, ALCHEMY_RARE_CHANCE } from './summonUtils';
import { useGameStore } from '../store/gameStore';

const T0 = 10_000;
/** 溜めの終わりまで dt 刻みで進め、tapAt(到着時刻→タップ時刻)でタップする。 */
const run = (tapAt: (arriveAt: number, k: number) => number | null, dt = 4): AlchemyRhythmState => {
  let r = newAlchemyRhythm(T0);
  const tapped = new Set<number>();
  for (let t = T0; t < alchemyChannelEndAt(r); t += dt) {
    r = advanceAlchemyRhythm(r, t);
    r.rings.forEach((g, k) => {
      const at = tapAt(g.arriveAt, k);
      if (at !== null && !tapped.has(k) && t >= at) { tapped.add(k); r = tapAlchemyRhythm(r, t).state; }
    });
  }
  return r;
};

describe('錬金術のリズム: サークルの予定', () => {
  it('何もしなければ 1秒ごとに出て 1秒で着く(溜めの後に着くものは出ない)', () => {
    const r = run(() => null);
    expect(r.rings.map(g => g.arriveAt - T0)).toEqual([1000, 2000, 3000, 4000]);
    expect(r.rings.map(g => g.arriveAt - g.spawnAt)).toEqual([1000, 1000, 1000, 1000]);
    expect(r.rings.every(g => g.result === 'miss')).toBe(true);
    expect(alchemyChannelDurationMs(r)).toBe(ALCHEMY_CHANNEL_MS);
    expect(r.hits).toBe(0);
  });
  it('成功すると溜めが 0.5秒縮み、次の到着が 0.5秒早まる(続けると詰まる)', () => {
    const r = run(a => a);
    expect(r.rings.map(g => g.arriveAt - T0)).toEqual([1000, 1500, 2000, 2500]);
    expect(r.hits).toBe(4);
    expect(alchemyChannelDurationMs(r)).toBe(ALCHEMY_CHANNEL_MS - 4 * ALCHEMY_RHYTHM_CUT_MS);
  });
  it('遅めの成功(次がもう飛んでいる)でも次の到着を前倒しする・二重には前倒ししない', () => {
    let r = newAlchemyRhythm(T0);
    r = advanceAlchemyRhythm(r, T0 + 1000 + 60); // 1つ目の到着を過ぎた=2つ目が出ている
    expect(r.rings).toHaveLength(2);
    expect(r.rings[1].arriveAt - T0).toBe(2000);
    r = tapAlchemyRhythm(r, T0 + 1000 + 60).state;
    expect(r.rings[0].result).toBe('hit');
    expect(r.rings[1].arriveAt - T0).toBe(1500);
    r = advanceAlchemyRhythm(r, T0 + 1100);
    expect(r.rings[1].arriveAt - T0).toBe(1500);
  });
  it('早めの成功(次がまだ出ていない)は次が出る時に前倒しする', () => {
    let r = newAlchemyRhythm(T0);
    r = tapAlchemyRhythm(r, T0 + 1000 - 100).state;
    expect(r.rings[0].result).toBe('hit');
    r = advanceAlchemyRhythm(r, T0 + 1000);
    expect(r.rings[1].arriveAt - T0).toBe(1500);
  });
});

describe('錬金術のリズム: 判定', () => {
  it('到着の ±120ms は成功・その外は外れ・ずっと手前は何もしない', () => {
    const a = T0 + ALCHEMY_RHYTHM_TRAVEL_MS;
    const r0 = newAlchemyRhythm(T0);
    expect(tapAlchemyRhythm(r0, a + ALCHEMY_RHYTHM_WINDOW_MS).result).toBe('hit');
    expect(tapAlchemyRhythm(r0, a - ALCHEMY_RHYTHM_WINDOW_MS).result).toBe('hit');
    expect(tapAlchemyRhythm(r0, a - ALCHEMY_RHYTHM_WINDOW_MS - 1).result).toBe('miss');
    expect(tapAlchemyRhythm(r0, a - ALCHEMY_RHYTHM_CONSUME_MS - 1).result).toBe('none');
  });
  it('1つのサークルに判定は1回(外したら同じサークルは拾えない)', () => {
    const a = T0 + ALCHEMY_RHYTHM_TRAVEL_MS;
    let r = newAlchemyRhythm(T0);
    r = tapAlchemyRhythm(r, a - 200).state;
    expect(r.rings[0].result).toBe('miss');
    const again = tapAlchemyRhythm(r, a);
    expect(again.result).toBe('none');
    expect(again.state.hits).toBe(0);
  });
  it('外れ・無入力では溜めも次のサークルも変わらない', () => {
    const r = run((a, k) => (k === 1 ? a - 200 : null));
    expect(alchemyChannelDurationMs(r)).toBe(ALCHEMY_CHANNEL_MS);
    expect(r.rings.map(g => g.arriveAt - T0)).toEqual([1000, 2000, 3000, 4000]);
  });
  it('変化が無いフレームは同じ参照を返す', () => {
    const r = newAlchemyRhythm(T0);
    expect(advanceAlchemyRhythm(r, T0 + 10)).toBe(r);
  });
});

describe('錬金術のリズム: レア確率', () => {
  it('成功1回ごとに +3ポイント(外れで減らない)', () => {
    expect(alchemyRareChance(0)).toBeCloseTo(ALCHEMY_RARE_CHANCE, 10);
    expect(alchemyRareChance(0)).toBeCloseTo(0.10, 10);
    expect(alchemyRareChance(2)).toBeCloseTo(0.16, 10);
    expect(alchemyRareChance(4)).toBeCloseTo(0.22, 10);
    const someMiss = run((a, k) => (k === 0 ? a : k === 1 ? a - 200 : a));
    expect(alchemyRareChance(someMiss.hits)).toBeCloseTo(0.10 + 0.03 * someMiss.hits, 10);
    expect(someMiss.hits).toBeGreaterThanOrEqual(2);
  });
});

describe('錬金術のリズム: 描画の進み', () => {
  it('加速して寄る(前半より後半が大きく進む)・判定済みは出さない', () => {
    const g = newAlchemyRhythm(T0).rings[0];
    const p1 = alchemyRingProgress(g, T0 + 250)!, p2 = alchemyRingProgress(g, T0 + 500)!, p3 = alchemyRingProgress(g, T0 + 750)!;
    expect(p2 - p1).toBeLessThan(p3 - p2);
    expect(alchemyRingProgress(g, T0 + 1000)).toBe(1);
    expect(alchemyRingProgress({ ...g, result: 'hit' }, T0 + 500)).toBeNull();
  });
});

describe('錬金術のリズム: store の配線', () => {
  it('溜めの開始でリズムを作り、到着のタップで成功・溜めが縮む / 溜めていない時のタップは使わない', () => {
    useGameStore.getState().resetGame('warrior');
    expect(useGameStore.getState().alchemyRhythmTap()).toBe(false);
    const gt = 20_000;
    useGameStore.setState({ gameTime: gt });
    useGameStore.getState().updateAlchemyChannel(gt - ALCHEMY_RHYTHM_TRAVEL_MS + 30);
    expect(useGameStore.getState().player.alchemyRhythm?.hits).toBe(0);
    expect(useGameStore.getState().alchemyRhythmTap()).toBe(true);
    const r = useGameStore.getState().player.alchemyRhythm!;
    expect(r.hits).toBe(1);
    expect(alchemyChannelDurationMs(r)).toBe(ALCHEMY_CHANNEL_MS - ALCHEMY_RHYTHM_CUT_MS);
    useGameStore.getState().updateAlchemyChannel(0);
    expect(useGameStore.getState().player.alchemyRhythm).toBeUndefined();
  });
});

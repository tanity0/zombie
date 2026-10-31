// UNIQUE_WEAPONS.md §17-6b P3/P5: 幻影の炎・延焼を受けるプレイヤー側の**配線**テスト。
// 持続ダメージ(damagePlayer の opts.dot)は HP だけを減らし、怯み・ストップ・揺れ・全体の被弾無敵を起こさない。
// 間引きは「その幻影ごとの被弾無敵」=1秒に1回まで。延焼は500msごとに刻み、燃え尽きたら欄を消す。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useGameStore, INVULN_MS } from './gameStore';
import { tickPlayerFlamerBurn } from '../utils/phantomTick';

let now = 5_000_000;
const st = () => useGameStore.getState();
const dot = (amount: number, src = 'ph-1') => st().damagePlayer(
  amount, 'test', undefined, undefined, undefined, undefined, undefined, src, undefined, undefined, { dot: true },
);

beforeEach(() => {
  now = 5_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
  st().resetGame('warrior');
  useGameStore.setState(s => ({
    gameTime: 100_000, shakeUntil: 0, hitstopUntil: 0,
    player: { ...s.player, health: 500, maxHealth: 500, invulnerable: false, lastHurtAt: undefined, iframeBySource: {} },
  }));
});
afterEach(() => { vi.restoreAllMocks(); });

describe('持続ダメージ(damagePlayer opts.dot)', () => {
  it('HPは減るが、怯み・ストップ・揺れ・全体の被弾無敵は起きない', () => {
    dot(3);
    const p = st().player;
    expect(p.health).toBe(497);
    expect(p.lastHurtAt).toBeUndefined();
    expect(p.invulnerable).toBe(false);
    expect(st().hitstopUntil).toBe(0);
    expect(st().shakeUntil).toBe(0);
  });

  it('同じ相手からは被弾無敵の間(1秒)は通らず、明けたら通る。別の相手は通る', () => {
    dot(3);
    now += 500; dot(3);
    expect(st().player.health).toBe(497);
    dot(3, 'ph-2');
    expect(st().player.health).toBe(494);
    now += INVULN_MS; dot(3);
    expect(st().player.health).toBe(491);
  });
});

describe('プレイヤーの延焼(tickPlayerFlamerBurn)', () => {
  it('500msごとに刻み、燃え尽きたら欄を消す', () => {
    useGameStore.setState(s => ({ player: { ...s.player, burnUntil: 101_200, burnDpsTick: 1, burnSourceId: 'ph-1' } }));
    tickPlayerFlamerBurn();
    expect(st().player.health).toBe(499);
    useGameStore.setState({ gameTime: 100_300 }); now += 300;
    tickPlayerFlamerBurn();
    expect(st().player.health).toBe(499); // 500ms 経っていない
    useGameStore.setState({ gameTime: 100_600 }); now += 1100; // 被弾無敵も明けている
    tickPlayerFlamerBurn();
    expect(st().player.health).toBe(498);
    useGameStore.setState({ gameTime: 101_200 });
    tickPlayerFlamerBurn();
    expect(st().player.burnUntil).toBeUndefined();
    expect(st().player.burnSourceId).toBeUndefined();
  });
});

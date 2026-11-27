// 一閃の通り道の途中の止め(utils/katanaDashHold・社長指示2026-11-27「一閃でストップしてないように見える。真ん中あたりで一瞬止めて欲しい」)をストアを動かして固める。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useGameStore, KATANA_DASH_MS, KATANA_DASH_DISTANCE, INVULN_MS } from './gameStore';
import type { Enemy, EnemyType } from '../types/game';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { KATANA_DASH_HIT_HOLD_MS } from '../utils/katanaDashHold';
import { isFlickFollowupOpen } from '../utils/flickFollowup';

let now = 18_000_000;
const NO = { up: false, down: false, left: false, right: false } as never;
const center = () => { const p = useGameStore.getState().player; return { x: p.x + p.width / 2, y: p.y + p.height / 2 }; };
const place = (type: EnemyType, dx: number, dy: number, id: string): Enemy => {
  const c = center();
  const e = spawnEnemyAt(type, 0, 0, useGameStore.getState().gameTime);
  return { ...e, x: c.x + dx - e.width / 2, y: c.y + dy - e.height / 2, id, health: 99999, maxHealth: 99999, dormant: false } as Enemy;
};
const en = (id: string) => useGameStore.getState().enemies.find(e => e.id === id)!;
const st = () => useGameStore.getState();
const step = (ms = 10) => {
  now += ms;
  useGameStore.setState(s => ({ gameTime: s.gameTime + ms }));
  vi.advanceTimersByTime(ms);
  st().movePlayer(NO, ms / 1000);
  st().updateEnemies(ms / 1000);
};

beforeEach(() => {
  now = 18_000_000;
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
  st().resetGame('warrior');
  useGameStore.setState(s => ({
    enemies: [], breakableProps: [], m0Unlocked: { ...s.m0Unlocked, melee: true, crit: false },
    player: { ...s.player, x: -3000, y: 9000, subWeapons: ['katana'], subWeaponLevels: { katana: 1 }, lastDirection: { x: 1, y: 0 }, invulnerable: false, health: 9999, maxHealth: 9999 },
  }));
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

/** 一閃を出して、着地の当たりが出るまで 10ms おきに見る。 */
const dashAndWatch = (withEnemy: boolean) => {
  if (withEnemy) useGameStore.setState({ enemies: [place('zombie', 70, 30, 'z')] });
  const origin = center();
  expect(st().triggerKatanaDash(1, 0)).toBe(true);
  const xs: number[] = [];
  let hitAt = -1, stunAt = -1, stunAtHit: number | undefined;
  for (let t = 0; t < KATANA_DASH_MS + 400; t += 10) {
    step(10);
    xs.push(center().x - origin.x);
    if (withEnemy && stunAt < 0 && (en('z').hitStunUntil ?? 0) > now) stunAt = now;
    if (withEnemy && hitAt < 0 && en('z').health < 99999) { hitAt = now; stunAtHit = en('z').hitStunUntil; }
  }
  return { origin, xs, hitAt, stunAt, stunAtHit, hold: st().player.katanaDashHold! };
};

describe('一閃の通り道の途中の止め', () => {
  it('敵の中心を通る所で止まり、止めた分だけ着地が遅れる(走る距離は同じ)・止めの間は当たった敵も止まって震える', () => {
    const start = now;
    const r = dashAndWatch(true);

    expect(r.hold.enemyId).toBe('z');
    expect(r.hold.ms).toBe(KATANA_DASH_HIT_HOLD_MS);
    // 止めた位置=敵の中心(1フレームの走りぶん以内)。
    const holdX = r.xs[Math.round((r.hold.at! - start) / 10) - 1];
    expect(Math.abs(holdX - 70)).toBeLessThan(KATANA_DASH_DISTANCE / KATANA_DASH_MS * 10 + 1);
    // 止めの間は体が動かない。
    const i0 = Math.round((r.hold.at! - start) / 10);
    for (let i = i0; i < i0 + Math.floor(KATANA_DASH_HIT_HOLD_MS / 10) - 1; i++) expect(r.xs[i]).toBeCloseTo(holdX, 6);
    // 当たった敵も止まる(止めの間・ダメージはまだ)。
    expect(r.stunAt).toBeGreaterThan(0);
    expect(r.stunAt).toBeLessThan(r.hitAt);
    // 着地の当たりは止めた分だけ後ろ。
    expect(r.hitAt - start).toBeGreaterThanOrEqual(KATANA_DASH_MS + KATANA_DASH_HIT_HOLD_MS);
    // 燕返しの受付は着地の当たりの瞬間から丸ごと開く。
    const w = st().tsubameWindow!;
    expect(w).not.toBeNull();
    expect(w.hitAt).toBe(r.hitAt);
    expect(isFlickFollowupOpen(w, r.hitAt + 290)).toBe(true);
    // 走った距離は敵の居ない一閃と同じ。
    const hitDist = r.xs[r.xs.length - 1];
    st().resetGame('warrior');
    useGameStore.setState(s => ({
      enemies: [], breakableProps: [],
      player: { ...s.player, x: -3000, y: 9000, subWeapons: ['katana'], subWeaponLevels: { katana: 1 }, lastDirection: { x: 1, y: 0 }, invulnerable: false, health: 9999, maxHealth: 9999 },
    }));
    const w2 = dashAndWatch(false);
    expect(Math.abs(hitDist - w2.xs[w2.xs.length - 1])).toBeLessThan(KATANA_DASH_DISTANCE / KATANA_DASH_MS * 10 + 1);
  });
  it('着地の当たりの止めは今どおり掛かる(途中の止めで消されない)', () => {
    const r = dashAndWatch(true);
    expect(r.hitAt).toBeGreaterThan(0);
    // 着地の当たりの瞬間に新しく書かれた止め(途中の止めの明けより後まで)。
    expect(r.stunAtHit ?? 0).toBeGreaterThan(r.hitAt);
  });
  it('空振り: 止めない(社長指示2026-11-27「空振りは止めない」)=走りの間は毎フレーム前へ進む', () => {
    const r = dashAndWatch(false);
    expect(r.hold.at).toBeUndefined();
    expect(r.hold.ms).toBeUndefined();
    const runFrames = Math.floor(KATANA_DASH_MS / 10) - 1;
    for (let i = 1; i < runFrames; i++) expect(r.xs[i]).toBeGreaterThan(r.xs[i - 1]);
  });
  it('走りの間の無敵は止めた分も続く', () => {
    useGameStore.setState({ enemies: [place('zombie', 70, 30, 'z')] });
    st().triggerKatanaDash(1, 0);
    let checked = 0;
    for (let t = 0; t < KATANA_DASH_MS + 300; t += 10) {
      step(10);
      const p = st().player;
      if (now < p.katanaDashUntil) { expect(p.invulnerable).toBe(true); expect(now - p.invulnerableTime).toBeLessThan(INVULN_MS); checked++; }
    }
    expect(checked).toBeGreaterThan(Math.floor((KATANA_DASH_MS + KATANA_DASH_HIT_HOLD_MS) / 10) - 2);
  });
});

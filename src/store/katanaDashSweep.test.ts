// 刀の一閃の2つの不具合の修正を固める(社長指示2026-11-07「一閃側をむしろ直せるとこ直す」・research/BRAWLER.md §9-36)。
//  (a) 速い刻みで木の幹を素通りしていた → 1回6px以下に刻んで壁・木を解く(格闘の速い踏み込みと同じ関数)。
//  (b) 被弾無敵の途中で一閃を出すと無敵が縮んでいた → 既に長い無敵が残っていれば縮めない(縮地と同じ)。
// それ以外(距離・速さ・時間・硬直)は変えていない=幹の無い所では今までどおり154px進む。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useGameStore, INVULN_MS, KATANA_DASH_DISTANCE, KATANA_DASH_MS } from './gameStore';
import { treesInRegion, trunkRect } from '../world/trees';

let now = 7_000_000;
const NO_INPUT = { up: false, down: false, left: false, right: false } as never;
beforeEach(() => { now = 7_000_000; vi.spyOn(Date, 'now').mockImplementation(() => now); vi.spyOn(Math, 'random').mockReturnValue(0.99); });
afterEach(() => { vi.restoreAllMocks(); });

const setup = (pos: { x: number; y: number } | null, dir: { x: number; y: number }) => {
  useGameStore.getState().resetGame('warrior');
  useGameStore.setState(s => ({
    enemies: [], m0Unlocked: { ...s.m0Unlocked, melee: true, crit: true },
    player: { ...s.player, subWeapons: ['katana'], subWeaponLevels: { katana: 1 }, ...(pos ?? {}), lastDirection: dir, invulnerable: false },
  }));
};
const run = (stepMs: number, total = 600) => {
  const end = now + total;
  while (now < end) {
    now += stepMs;
    useGameStore.setState(s => ({ gameTime: s.gameTime + stepMs }));
    useGameStore.getState().movePlayer(NO_INPUT, stepMs / 1000);
  }
};

describe('刀の一閃は木の幹を素通りしない', () => {
  const r = trunkRect(treesInRegion(1000, 1000, 6000, 6000)[0]);
  for (const step of [10, 17, 33]) {
    it(`幹の真上から下向き(${step}ms 刻み)`, () => {
      const p0 = useGameStore.getState().player;
      setup({ x: r.x + r.width / 2 - p0.width / 2, y: r.y - 60 - p0.height }, { x: 0, y: 1 });
      expect(useGameStore.getState().triggerKatanaDash(0, 1)).toBe(true);
      run(step);
      const p = useGameStore.getState().player;
      expect(p.y + p.height).toBeLessThanOrEqual(r.y + 0.5);
    });
    it(`幹の横から(${step}ms 刻み)`, () => {
      const p0 = useGameStore.getState().player;
      setup({ x: r.x - 60 - p0.width, y: r.y + r.height - p0.height }, { x: 1, y: 0 });
      expect(useGameStore.getState().triggerKatanaDash(1, 0)).toBe(true);
      run(step);
      const p = useGameStore.getState().player;
      expect(p.x + p.width).toBeLessThanOrEqual(r.x + 0.5);
    });
  }
  it('幹の無い所では今までどおりの距離を進む', () => {
    setup({ x: -3000, y: 9000 }, { x: 1, y: 0 });
    const x0 = useGameStore.getState().player.x;
    expect(useGameStore.getState().triggerKatanaDash(1, 0)).toBe(true);
    run(10, KATANA_DASH_MS + 300);
    const moved = useGameStore.getState().player.x - x0;
    expect(Math.abs(moved - KATANA_DASH_DISTANCE)).toBeLessThan(KATANA_DASH_DISTANCE * 0.08);
  });
});

describe('刀の一閃は被弾無敵を縮めない', () => {
  it('被弾の無敵の途中で一閃を出しても、無敵は被弾から本来の長さまで続く', () => {
    setup(null, { x: 1, y: 0 });
    useGameStore.setState(s => ({ player: { ...s.player, invulnerable: true, invulnerableTime: now } }));
    const hurtAt = now;
    now += 100;
    expect(useGameStore.getState().triggerKatanaDash(1, 0)).toBe(true);
    const p = useGameStore.getState().player;
    expect(p.invulnerableTime + INVULN_MS).toBeGreaterThanOrEqual(hurtAt + INVULN_MS);
  });
  it('無敵でない時は今までどおり、一閃の間だけ無敵', () => {
    setup(null, { x: 1, y: 0 });
    expect(useGameStore.getState().triggerKatanaDash(1, 0)).toBe(true);
    const p = useGameStore.getState().player;
    expect(p.invulnerable).toBe(true);
    expect(p.invulnerableTime + INVULN_MS).toBe(now + KATANA_DASH_MS);
  });
});

// ★判定時置換ミラー(社長裁定2026-08-27・GHOST_PARITY_LEDGER.md ★仕様v2 §成立地点3・監査L4):
// 賞金首の守護霊カウンター=「プレイヤーと同じ成立域(inCounterReach)×守護霊の体×窓」の再評価と、
// 同フレームのプレイヤー優先(二重成立しない)の回帰テスト。
// 作法は bountyTick.test.ts の技状態機械テストと同じ(resetGame→盤面→runBountyTickを回す)。
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../store/gameStore';
import { runBountyTick, createBountyTickState } from './bountyTick';
import { BOUNTY_MELEE_TUNING as BM_T } from './bountyScript';
import { spawnEnemyAt } from './enemyUtils';
import { setTreesDisabled } from '../world/trees';
import { setTorchesDisabled } from '../world/torches';
import { setGhostCounterClaim, peekGhostCounterClaim, clearGhostCounterClaim } from './ghostCounter';
import type { Summon } from '../types/game';

const START_GT = 10_000_000;

describe('賞金首×守護霊: 判定時置換ミラー(成立域×窓・プレイヤー優先)', () => {
  beforeEach(() => {
    setTreesDisabled(true);
    setTorchesDisabled(true);
    useGameStore.getState().resetGame('assault');
    clearGhostCounterClaim();
  });

  /** 馬乗り(bounty-melee)を360度ムチ(bm-whip360=ACTIVE成立州・円=whip360.radius)の最中で用意する。 */
  const setup = (ghostOffset: { x: number; y: number } | null, playerCounters: boolean) => {
    const e = spawnEnemyAt('bounty-melee', 2000, 2000, START_GT);
    e.dormant = false;
    e.homeX = e.x; e.homeY = e.y;
    e.lastHit = START_GT;
    e.bossState = 'bm-whip360';
    e.bossStateUntil = START_GT + 400;
    const bcx = e.x + e.width / 2, bcy = e.y + e.height / 2;
    const now = Date.now();
    const ghost: Summon | null = ghostOffset === null ? null : {
      id: 'ghost-test', x: bcx + ghostOffset.x, y: bcy + ghostOffset.y, width: 24, height: 24, speed: 200,
      health: 100, maxHealth: 100, damage: 0, kind: 'ghost-ally', reusedType: 'zombie', level: 1,
      createdAt: now, lastHit: 0, ghostBossId: e.id,
      ghostCounterWindowEnd: now + 300, // 窓=振り始め+300ms(開いている)
    };
    useGameStore.setState(s => ({
      enemies: [e],
      summons: ghost ? [ghost] : [],
      player: {
        ...s.player,
        // プレイヤー優先テストでは円の中+窓開放。それ以外は円の遥か外。
        x: playerCounters ? bcx + 40 : bcx + 3000,
        y: playerCounters ? bcy : bcy + 3000,
        health: 9999, maxHealth: 9999,
        counterWindowStart: playerCounters ? now - 10 : 0,
        counterWindowEnd: playerCounters ? now + 200 : 0,
      },
    }));
    if (ghost) {
      setGhostCounterClaim({
        bossId: e.id, ghostX: ghost.x + 12, ghostY: ghost.y + 12, dmg: 60, atMs: now,
      });
    }
    const s = createBountyTickState();
    const step = (): void => {
      const gt = START_GT + 16;
      useGameStore.setState({ gameTime: gt });
      const cur = useGameStore.getState().enemies.find(x => x.id === e.id);
      if (cur) runBountyTick(cur, s, gt, 0.016, 1, gt);
    };
    return { id: e.id, step };
  };

  it('守護霊が成立域(ムチの円)の中+窓が開いている → 置換成立(技中断=chase・請求消費・確定クリ)', () => {
    const inRadius = Math.max(0, BM_T.whip360.radius - 30);
    const { id, step } = setup({ x: inRadius - 12, y: -12 }, false);
    const hpBefore = useGameStore.getState().enemies.find(x => x.id === id)!.health;
    step();
    const after = useGameStore.getState().enemies.find(x => x.id === id)!;
    expect(after.bossState).toBe('chase');            // 技中断(プレイヤー成立と同じ)
    expect(after.health).toBeLessThan(hpBefore);      // 確定クリ(applyGhostCounterEffect)
    expect(peekGhostCounterClaim(Date.now())).toBeNull(); // 1成立1消費
  });

  it('守護霊が成立域の外 → 成立しない(請求は消費されず残る=面成立の復活防止)', () => {
    const { id, step } = setup({ x: BM_T.whip360.radius + 500, y: 0 }, false);
    const hpBefore = useGameStore.getState().enemies.find(x => x.id === id)!.health;
    step();
    const after = useGameStore.getState().enemies.find(x => x.id === id)!;
    expect(after.health).toBe(hpBefore);
    expect(peekGhostCounterClaim(Date.now())).not.toBeNull(); // 位置ゲートは成立域の再評価が担う
  });

  it('同フレームにプレイヤーが成立 → プレイヤー優先(守護霊の請求は消費されない=二重成立しない)', () => {
    const inRadius = Math.max(0, BM_T.whip360.radius - 30);
    const { id, step } = setup({ x: inRadius - 12, y: -12 }, true);
    step();
    const after = useGameStore.getState().enemies.find(x => x.id === id)!;
    expect(after.bossState).toBe('chase');                    // プレイヤー成立で技中断
    expect(peekGhostCounterClaim(Date.now())).not.toBeNull(); // 守護霊の請求は未消費(優先規則)
  });
});

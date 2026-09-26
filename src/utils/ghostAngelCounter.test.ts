// ★写し修正(社長裁定2026-08-27「はい」・GHOST_PARITY_LEDGER.md ★仕様 重4の解消):
// 天使の振り技(判定時置換)の守護霊分岐=「プレイヤーと同じ振りの図形×守護霊の窓」の回帰テスト。
// 旧実装は消費側が「体の重なり」だけで、縁74pxで待つ守護霊は振り技を実質一度も取れなかった。
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../store/gameStore';
import { runAngelBossTick, createAngelBossState, NOOP_ANGEL_SFX } from './angelBossTick';
import { spawnEnemyAt } from './enemyUtils';
import { setGhostCounterClaim, peekGhostCounterClaim, clearGhostCounterClaim } from './ghostCounter';
import type { Summon } from '../types/game';

describe('天使(ウリ)の大薙ぎ×守護霊: 振りの帯で判定時置換(プレイヤー優先)', () => {
  beforeEach(() => {
    useGameStore.getState().resetGame('assault');
    clearGhostCounterClaim();
  });

  /** ウリを大薙ぎ(sweep)実行中で用意し、帯を(0,-300)→(200,-300)の水平線に固定する。 */
  const setup = (ghostOnBand: boolean, playerCounters: boolean) => {
    const e = spawnEnemyAt('uri', 0, -300, 0);
    e.fromEvent = true; e.dormant = false; e.fixed = false;
    e.bossPhase = 1; e.homeX = 0; e.homeY = 0;
    e.health = 99999; e.maxHealth = 99999;
    e.bossState = 'sweep';
    e.bossStateUntil = 1000;
    e.aiFromX = 0; e.aiFromY = -300; e.aiTargetX = 200; e.aiTargetY = -300;
    const now = Date.now();
    const ghost: Summon = {
      id: 'ghost-test', width: 24, height: 24, speed: 200,
      // 帯の上(100,-300)か、帯から遠い(100, 500)か。
      x: 100 - 12, y: (ghostOnBand ? -300 : 500) - 12,
      health: 100, maxHealth: 100, damage: 0, kind: 'ghost-ally', reusedType: 'zombie', level: 1,
      createdAt: now, lastHit: 0, ghostBossId: e.id,
      ghostCounterWindowEnd: now + 300,
    };
    useGameStore.setState(s => ({
      enemies: [e], projectiles: [], pumpkinBlasts: [], bossFires: [], acrasielSpears: [],
      summons: [ghost],
      player: {
        ...s.player,
        // プレイヤー優先テストでは帯上(50,-300)+窓開放。それ以外は帯の遥か外。
        x: (playerCounters ? 50 : 2000) - s.player.width / 2,
        y: (playerCounters ? -300 : 2000) - s.player.height / 2,
        health: 9999, maxHealth: 9999,
        counterWindowStart: playerCounters ? now - 10 : 0,
        counterWindowEnd: playerCounters ? now + 200 : 0,
      },
    }));
    setGhostCounterClaim({ bossId: e.id, ghostX: 100, ghostY: -300, dmg: 60, atMs: now });
    const st = createAngelBossState();
    const step = (): void => {
      useGameStore.setState({ gameTime: 16 });
      runAngelBossTick(st, 16, 0.016, 1, NOOP_ANGEL_SFX, () => {});
    };
    return { id: e.id, step };
  };

  it('守護霊が帯の中+窓が開いている → 置換成立(技中断=chase・請求消費・確定クリ)', () => {
    const { id, step } = setup(true, false);
    const hpBefore = useGameStore.getState().enemies.find(x => x.id === id)!.health;
    step();
    const after = useGameStore.getState().enemies.find(x => x.id === id)!;
    expect(after.bossState).toBe('chase');
    expect(after.health).toBeLessThan(hpBefore);
    expect(peekGhostCounterClaim(Date.now())).toBeNull();
  });

  it('守護霊が帯の外 → 成立しない(請求は残る=位置は振りの図形が真実)', () => {
    const { id, step } = setup(false, false);
    step();
    expect(useGameStore.getState().enemies.find(x => x.id === id)!.bossState).toBe('sweep');
    expect(peekGhostCounterClaim(Date.now())).not.toBeNull();
  });

  it('同フレームにプレイヤーが成立 → プレイヤー優先(守護霊の請求は消費されない)', () => {
    const { id, step } = setup(true, true);
    step();
    const after = useGameStore.getState().enemies.find(x => x.id === id)!;
    expect(after.bossState).toBe('chase'); // プレイヤー成立で技中断
    expect(peekGhostCounterClaim(Date.now())).not.toBeNull(); // 守護霊は未消費
  });
});

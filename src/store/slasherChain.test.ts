// スラッシャー(0.3秒チェーン追撃)の距離規約の不変条件。
// v0.25.3398 バグ修正の再発防止: 追撃の射程は初撃と同じ enemyMeleeDist(判定帯の最近点)で測る。
// 旧実装は中心距離のままで、「初撃は届くのに追撃は敵の身体の厚みぶん届かない」帯域が存在し、
// 追撃ごとの強制KB25pxがその帯域へ敵を押し出すため2撃目以降が系統的に空振りしていた
// (社長報告2026-08-15「振りは出ているのに当たっていなさそう」)。
import { describe, it, expect, vi } from 'vitest';
import { useGameStore, SLASHER_CHAIN_CD_MS, MELEE_RADIUS, enemyMeleeDist } from './gameStore';
import { spawnEnemyAt } from '../utils/enemyUtils';

const setupSlasherRun = () => {
  useGameStore.getState().resetGame('warrior');
  useGameStore.setState(s => ({
    m0Unlocked: { melee: true, crit: true, ammo: true },
    player: {
      ...s.player,
      skills: [...s.player.skills, 'slasher'],
      skillLevels: { ...(s.player.skillLevels ?? {}), slasher: 3 },
    },
  }));
};

describe('スラッシャーのチェーン追撃(距離規約)', () => {
  it('初撃が届く相手(帯の縁は射程内・中心は射程外)にはチェーン追撃も届く', () => {
    let now = 1_000_000;
    const spy = vi.spyOn(Date, 'now').mockImplementation(() => now);
    setupSlasherRun();
    const p = useGameStore.getState().player;
    const pcx = p.x + p.width / 2, pcy = p.y + p.height / 2;

    // 大型敵(werewolf)を「帯の縁までは射程内・中心までは射程外」の帯域に置く。
    const z = spawnEnemyAt('werewolf', 0, 0, useGameStore.getState().gameTime);
    z.health = 100000; z.maxHealth = 100000;
    // 中心距離 = MELEE_RADIUS + 10(旧実装なら追撃が届かない位置)。
    z.x = pcx + MELEE_RADIUS + 10 - z.width / 2;
    z.y = pcy - z.height / 2;
    useGameStore.setState({ enemies: [z] });
    const id = useGameStore.getState().enemies[0].id;
    const e0 = useGameStore.getState().enemies[0];
    // 前提の自己検証: 帯の縁は射程内(=初撃が当たる位置)・中心は射程外。
    expect(enemyMeleeDist(pcx, pcy, e0)).toBeLessThanOrEqual(MELEE_RADIUS);
    expect(Math.hypot(e0.x + e0.width / 2 - pcx, e0.y + e0.height / 2 - pcy)).toBeGreaterThan(MELEE_RADIUS);

    const hp = () => useGameStore.getState().enemies.find(e => e.id === id)!.health;
    const hp0 = hp();
    const first = useGameStore.getState().triggerCounter();
    expect(first.hit).toBe(true);
    expect(hp()).toBeLessThan(hp0); // 初撃ヒット

    // チェーンCD明けに追撃(敵はKBで動くので同じ帯域位置へ戻して距離条件だけを検証する)。
    const ready = useGameStore.getState().player.slasherChainReadyAt;
    expect(ready).toBeGreaterThan(0);
    now += SLASHER_CHAIN_CD_MS + 50;
    useGameStore.setState(s => ({ realGameTime: ready + 10, gameTime: s.gameTime + SLASHER_CHAIN_CD_MS + 50 }));
    useGameStore.setState(s => ({
      enemies: s.enemies.map(x => x.id === id
        ? { ...x, x: pcx + MELEE_RADIUS + 10 - x.width / 2, y: pcy - x.height / 2, knockbackVx: 0, knockbackVy: 0, knockbackUntil: 0 }
        : x),
    }));
    const before = hp();
    const chain = useGameStore.getState().triggerCounter();
    expect(chain.swung).toBe(true);
    expect(chain.hit).toBe(true); // ★旧実装はここで false(中心距離が射程外)
    expect(before - hp()).toBeGreaterThan(0); // 追撃のダメージが実際に入る
    spy.mockRestore();
  });

  it('チェーン3段が全段ダメージを与える(近距離・減衰2/3ずつ)', () => {
    let now = 2_000_000;
    const spy = vi.spyOn(Date, 'now').mockImplementation(() => now);
    setupSlasherRun();
    const p = useGameStore.getState().player;
    const pcx = p.x + p.width / 2, pcy = p.y + p.height / 2;
    const z = spawnEnemyAt('zombie', 0, 0, useGameStore.getState().gameTime);
    z.health = 100000; z.maxHealth = 100000;
    z.x = pcx + 40 - z.width / 2; z.y = pcy - z.height / 2;
    useGameStore.setState({ enemies: [z] });
    const id = useGameStore.getState().enemies[0].id;
    const hp = () => useGameStore.getState().enemies.find(e => e.id === id)!.health;

    expect(useGameStore.getState().triggerCounter().hit).toBe(true);
    const damages: number[] = [];
    for (let step = 1; step <= 3; step++) {
      const ready = useGameStore.getState().player.slasherChainReadyAt;
      expect(ready).toBeGreaterThan(0);
      now += SLASHER_CHAIN_CD_MS + 50;
      useGameStore.setState(s => ({ realGameTime: ready + 10, gameTime: s.gameTime + SLASHER_CHAIN_CD_MS + 50 }));
      useGameStore.setState(s => ({
        enemies: s.enemies.map(x => x.id === id
          ? { ...x, x: pcx + 40 - x.width / 2, y: pcy - x.height / 2, knockbackVx: 0, knockbackVy: 0, knockbackUntil: 0 }
          : x),
      }));
      const before = hp();
      const r = useGameStore.getState().triggerCounter();
      expect(r.hit).toBe(true);
      damages.push(before - hp());
    }
    // 減衰: 各段が前段の2/3(SLASHER_MULTS)。値そのものではなく比率で固定(バランス調整耐性)。
    expect(damages[0]).toBeGreaterThan(0);
    expect(damages[1] / damages[0]).toBeCloseTo(2 / 3, 2);
    expect(damages[2] / damages[1]).toBeCloseTo(2 / 3, 2);
    spy.mockRestore();
  });
});

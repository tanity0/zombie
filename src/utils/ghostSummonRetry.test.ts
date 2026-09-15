// ★v0.25.3972(社長報告「アイドルに守護霊出てこない」): 召喚機会の食い潰し再現と再試行の回帰テスト。
// 旧実装は「交戦の立ち上がりエッジ1tick」だけが召喚機会で、そのtickに前のボスの守護霊が退場アニメ中
// (summonsに残存)だと機会が消え、その交戦では二度と召喚されなかった。ghostSummonedOnce旗+毎tick
// 再試行でボス連戦でも必ず出ることを固定する。
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../store/gameStore';
import { runGhostAndTraitsStep } from './directorTick';
import { spawnEnemyAt } from './enemyUtils';
import { setTreesDisabled } from '../world/trees';
import { setTorchesDisabled } from '../world/torches';

const step = () => {
  const s = useGameStore.getState();
  runGhostAndTraitsStep(
    { ghostProfileRef: { current: null } },
    { gameTime: s.gameTime, player: s.player, ghostDebugEnabled: true },
  );
};

describe('守護霊召喚のエッジ食い潰し対策(ghostSummonedOnce+毎tick再試行)', () => {
  beforeEach(() => {
    setTreesDisabled(true); setTorchesDisabled(true);
    useGameStore.getState().resetGame('assault');
    // モジュール状態(ghostBossEngagePrev)を敵ゼロの1stepで false へ収束させる。
    useGameStore.setState({ enemies: [], summons: [] });
    step();
  });

  it('前のボスの守護霊が退場中でも、次のボス(idol)へ退場完了後に召喚される', () => {
    const p = useGameStore.getState().player;
    // 1) ボスA(mimir)と交戦→召喚。
    const bossA = spawnEnemyAt('mimir', p.x + 300, p.y, useGameStore.getState().gameTime);
    useGameStore.setState(s => ({ enemies: [bossA], gameTime: s.gameTime + 100 }));
    step();
    expect(useGameStore.getState().summons.some(s => s.kind === 'ghost-ally')).toBe(true);
    // 2) ボスAが消え、同じ窓で idol が現れる(交戦は途切れない=risingが来ない)。
    //    既存の守護霊は退場開始するがまだ summons に残っている=旧実装ならここで機会が消える。
    const idol = spawnEnemyAt('idol', p.x + 300, p.y, useGameStore.getState().gameTime);
    idol.bossState = 'chase';
    useGameStore.setState(s => ({ enemies: [idol], gameTime: s.gameTime + 100 }));
    step(); // 退場開始+同時1体ルールで召喚保留
    expect(useGameStore.getState().enemies.find(e => e.id === idol.id)?.ghostSummonedOnce).not.toBe(true);
    // 3) 退場が完了して summons から消えた後のtick: エッジは来ないが再試行で召喚される。
    useGameStore.setState(s => ({ summons: [], gameTime: s.gameTime + 100 }));
    step();
    const ghost = useGameStore.getState().summons.find(s => s.kind === 'ghost-ally');
    expect(ghost).toBeDefined();
    expect(ghost?.ghostBossId).toBe(idol.id);
  });

  it('同じ個体へは再召喚しない(ghostSummonedOnce=既存意図の保存)', () => {
    const p = useGameStore.getState().player;
    const idol = spawnEnemyAt('idol', p.x + 300, p.y, useGameStore.getState().gameTime);
    idol.bossState = 'chase';
    useGameStore.setState(s => ({ enemies: [idol], gameTime: s.gameTime + 100 }));
    step();
    expect(useGameStore.getState().summons.some(s => s.kind === 'ghost-ally')).toBe(true);
    expect(useGameStore.getState().enemies.find(e => e.id === idol.id)?.ghostSummonedOnce).toBe(true);
    // 守護霊が倒れた(summonsから消えた)後も、同じ個体には出し直さない。
    useGameStore.setState(s => ({ summons: [], gameTime: s.gameTime + 100 }));
    step();
    expect(useGameStore.getState().summons.some(s => s.kind === 'ghost-ally')).toBe(false);
  });
});

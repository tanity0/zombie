// 社長指示2026-10-05「仲間は敵の方を向いて噛む」: 通常召喚が噛んだ時、噛んだ敵の中心xを覚える(描画はその方を向く)。
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../store/gameStore';
import { buildSummon } from './summonUtils';
import { spawnEnemyAt } from './enemyUtils';
import { setTreesDisabled } from '../world/trees';

beforeEach(() => { setTreesDisabled(true); useGameStore.getState().resetGame('warrior'); });

describe('召喚の噛む向き', () => {
  it('噛んだ敵の中心xを覚える(左の敵を噛めば左)', () => {
    const p = useGameStore.getState().player;
    const sx = p.x + 60, sy = p.y;
    const summon = buildSummon(1, 'normal', sx, sy);
    const scx = summon.x + summon.width / 2, scy = summon.y + summon.height / 2;
    const e = spawnEnemyAt('zombie', 0, 0, 0);
    e.x = scx - 30 - e.width / 2; e.y = scy - e.height / 2; // 召喚の左30px
    useGameStore.setState({ summons: [summon], enemies: [e] });
    useGameStore.getState().updateSummons(0.016);
    const s = useGameStore.getState().summons.find(q => q.id === summon.id)!;
    expect(s.lastContactAt).toBeDefined();
    expect(s.biteTargetX).toBeDefined();
    expect(s.biteTargetX!).toBeLessThan(s.x + s.width / 2);
  });
  it('噛む相手がいなければ覚えない', () => {
    const p = useGameStore.getState().player;
    const summon = buildSummon(1, 'normal', p.x + 60, p.y);
    useGameStore.setState({ summons: [summon], enemies: [] });
    useGameStore.getState().updateSummons(0.016);
    expect(useGameStore.getState().summons.find(q => q.id === summon.id)!.biteTargetX).toBeUndefined();
  });
});

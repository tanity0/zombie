// research/BRAWLER.md §12-3c(社長指示2026-11-10「あと格闘は攻撃食らっても技ポイント貯まる にしよう」):
// プレイヤーの格闘は、体力が減る被弾で技ポイント+1(当てた時と同じ量・上限まで)。0ダメージ・持続ダメージでは貯まらない。
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from './gameStore';
import { initialBrawlerState, brawlerPointCap } from '../utils/brawler';
import { setTreesDisabled } from '../world/trees';
import { setTorchesDisabled } from '../world/torches';

const points = (): number => useGameStore.getState().player.brawler?.points ?? -1;
const arm = (o: { brawler: boolean; points?: number }) => useGameStore.setState(s => ({
  player: {
    ...s.player, health: 500, maxHealth: 500, invulnerable: false, invulnerableTime: 0, iframeBySource: {},
    subWeapons: o.brawler ? ['brawler'] : [], subWeaponLevels: { ...s.player.subWeaponLevels, brawler: 1 },
    brawler: { ...initialBrawlerState(), points: o.points ?? 0 },
  },
}));

describe('格闘: 食らっても技ポイントが貯まる', () => {
  beforeEach(() => {
    setTreesDisabled(true); setTorchesDisabled(true);
    useGameStore.getState().resetGame('rogue');
  });
  it('体力が減る被弾で+1', () => {
    arm({ brawler: true });
    useGameStore.getState().damagePlayer(10, 'test');
    expect(useGameStore.getState().player.health).toBeLessThan(500);
    expect(points()).toBe(1);
  });
  it('上限で止まる(当てた時と同じ上限)', () => {
    const cap = brawlerPointCap(1);
    arm({ brawler: true, points: cap });
    useGameStore.getState().damagePlayer(10, 'test');
    expect(points()).toBe(cap);
  });
  it('被弾無敵で弾いた(0ダメージ)・持続ダメージでは貯まらない', () => {
    arm({ brawler: true });
    useGameStore.getState().damagePlayer(10, 'test');
    expect(points()).toBe(1);
    useGameStore.getState().damagePlayer(10, 'test'); // 直後=被弾無敵
    expect(points()).toBe(1);
    arm({ brawler: true });
    useGameStore.getState().damagePlayer(5, 'burn', undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, { dot: true });
    expect(points()).toBe(0);
  });
  it('格闘を持っていなければ貯まらない', () => {
    arm({ brawler: false });
    useGameStore.getState().damagePlayer(10, 'test');
    expect(useGameStore.getState().player.health).toBeLessThan(500);
    expect(points()).toBe(0);
  });
});

// ★技の無敵(abilityInvulnUntil)を、カウンター成立・リズムの開始・秘奥義の出始めにも付けた(社長裁定2026-11-12「はい」)。
// どれも今の被弾の無敵(invulnerable)と同じ長さ。無敵の間は sourceId 付きの攻撃(噛みつき・掴み)も受けない・明けたら当たる。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useGameStore, INVULN_MS } from './gameStore';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { applyContactDamage, NOOP_COMBAT_EFFECTS } from '../utils/combatTick';
import { biteSpecFor } from '../utils/enemyBite';
import { setTreesDisabled } from '../world/trees';
import { setTorchesDisabled } from '../world/torches';
import { setBrawlerTempoAll } from '../utils/brawlerCombo';
import { BRAWLER_SECRET_IGNITE_MS } from '../utils/brawler';

setBrawlerTempoAll(1.0);

let now = 7_000_000;
const START_GT = 10_000_000;
const ORIGIN = 50_000;
beforeEach(() => {
  now = 7_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
  setTreesDisabled(true); setTorchesDisabled(true);
});
afterEach(() => { vi.restoreAllMocks(); });

let biteN = 0;
/** sourceId 付きの噛みつき(毎回別の敵=被弾の無敵には弾かれない)。減ったHPを返す。 */
const bite = (): number => {
  const p = useGameStore.getState().player;
  const hp = p.health;
  const id = `b${++biteN}`;
  useGameStore.getState().damagePlayer(10, '噛みつき', p.x + p.width / 2 + 20, p.y + p.height / 2, undefined, undefined, undefined, id, id);
  return hp - useGameStore.getState().player.health;
};

describe('技の無敵: カウンター成立・リズム・秘奥義の出始め', () => {
  it('カウンター成立(噛みつきを赤カウンター)の1秒は sourceId 付きで0ダメージ・明けたら当たる', () => {
    useGameStore.getState().resetGame('assault');
    const e = { ...spawnEnemyAt('bat', 0, 0, START_GT), aiPhase: 'b-grab', chaffMove: 'bat-grab' } as ReturnType<typeof spawnEnemyAt>;
    e.x = ORIGIN - e.width / 2; e.y = ORIGIN - e.height / 2;
    const spec = biteSpecFor('bat', 'bat-grab');
    useGameStore.setState(s => ({
      enemies: [{ ...e, biteAt: START_GT - (spec.windupMs + spec.biteMs) }], gameTime: START_GT,
      player: {
        ...s.player, x: ORIGIN - s.player.width / 2, y: ORIGIN - s.player.height / 2, health: 9999, maxHealth: 9999,
        invulnerable: false, invulnerableTime: 0, counterWindowStart: now, counterWindowEnd: now + 500,
      },
    }));
    applyContactDamage(START_GT, false, 0, NOOP_COMBAT_EFFECTS);
    const p = useGameStore.getState().player;
    expect(p.lastCounterSuccessTime).toBe(now);
    expect(p.invulnerableTime).toBe(now); // 点滅を止める例外(lastCounterSuccessTime===invulnerableTime)はそのまま
    expect(p.abilityInvulnUntil).toBe(now + INVULN_MS);
    now += INVULN_MS - 10;
    expect(bite()).toBe(0);
    now += 20;
    expect(bite()).toBeGreaterThan(0);
  });
  it('リズムの開始の無敵(INVULN_MS)', () => {
    useGameStore.getState().resetGame('warrior');
    useGameStore.setState(s => ({ player: { ...s.player, health: 100, maxHealth: 100, invulnerable: false, invulnerableTime: 0 } }));
    useGameStore.getState().setRhythmActive(true);
    expect(useGameStore.getState().player.abilityInvulnUntil).toBe(now + INVULN_MS);
    now += INVULN_MS - 10;
    expect(bite()).toBe(0);
    now += 20;
    expect(bite()).toBeGreaterThan(0);
  });
  it('秘奥義の出始め(起動の間)の無敵', () => {
    useGameStore.getState().resetGame('warrior');
    useGameStore.setState(s => ({
      enemies: [], m0Unlocked: { ...s.m0Unlocked, melee: true, crit: true },
      player: { ...s.player, health: 9999, maxHealth: 9999, invulnerable: false, invulnerableTime: 0, subWeapons: ['brawler'], subWeaponLevels: { brawler: 3 }, lastDirection: { x: 1, y: 0 } },
    }));
    // 秘奥義の締めの直前(↑を待つ所)の状態を置いて、↑で起動する
    useGameStore.getState().brawlerPress();
    for (let i = 0; i < 200 && useGameStore.getState().player.brawler!.phase !== 'idle'; i++) {
      now += 10; useGameStore.setState(st => ({ gameTime: st.gameTime + 10 })); useGameStore.getState().tickBrawler();
    }
    const gt = useGameStore.getState().gameTime;
    useGameStore.setState(st => ({ player: { ...st.player, brawler: { ...st.player.brawler!, points: 20, secretProgress: 3, secretLastEndAt: gt } } }));
    expect(useGameStore.getState().brawlerTech(0, -1)).toBe(true);
    expect(useGameStore.getState().player.brawler!.secret?.phase).toBe('ignite');
    expect(useGameStore.getState().player.abilityInvulnUntil).toBe(now + BRAWLER_SECRET_IGNITE_MS);
    now += BRAWLER_SECRET_IGNITE_MS - 10;
    expect(bite()).toBe(0);
    now += 20;
    expect(bite()).toBeGreaterThan(0);
  });
});

// ★接触ダメージ0の敵に重なっても「被弾」にしない(社長報告2026-11-12「プラントがダメージ演出が延々と出てくる 画面赤くなる」)。
// 接触の合流点(combatTick.applyContactDamage)で、その時点のダメージが0以下の接触は damagePlayer を呼ばない
// (被弾の音・赤いフラッシュ・赤い粒・前のめり・被弾無敵の書き換え・押し・被弾反撃の窓を何も起こさない)。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useGameStore } from './gameStore';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { applyContactDamage, NOOP_COMBAT_EFFECTS, type CombatEffects } from '../utils/combatTick';
import { setTreesDisabled } from '../world/trees';
import { setTorchesDisabled } from '../world/torches';
import type { EnemyType } from '../types/game';

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

/** 被弾の演出を数えるだけの fx(NOOP と参照が違う=実演出ありの経路として走る)。 */
const countingFx = () => {
  const c = { sfx: 0, flash: 0, burst: 0 };
  const fx: CombatEffects = {
    ...NOOP_COMBAT_EFFECTS,
    playSfx: (k: string) => { if (k === 'player-damage') c.sfx++; },
    spawnFlash: () => { c.flash++; },
    spawnBurst: () => { c.burst++; },
  };
  return { fx, c };
};

/** プレイヤーを敵に重ねて、16msずつ ms だけ接触の解決を回す。 */
const overlapFor = (type: EnemyType, ms: number, patch: Record<string, unknown> = {}) => {
  useGameStore.getState().resetGame('assault');
  const e = { ...spawnEnemyAt(type, 0, 0, START_GT), ...patch } as ReturnType<typeof spawnEnemyAt>;
  e.x = ORIGIN - e.width / 2; e.y = ORIGIN - e.height / 2;
  useGameStore.setState(s => ({
    enemies: [e], gameTime: START_GT,
    player: { ...s.player, x: ORIGIN - s.player.width / 2, y: ORIGIN - s.player.height / 2, health: 9999, maxHealth: 9999, invulnerable: false, invulnerableTime: 0 },
  }));
  const spy = vi.spyOn(useGameStore.getState(), 'damagePlayer');
  const { fx, c } = countingFx();
  let gt = START_GT;
  for (let t = 0; t < ms; t += 16) {
    now += 16; gt += 16;
    useGameStore.setState({ gameTime: gt });
    applyContactDamage(gt, false, 0, fx);
  }
  return { spy, c, enemyId: e.id };
};

describe('接触ダメージ0の敵と重なっても被弾にしない', () => {
  it('プラントに3秒重なっても damagePlayer は呼ばれず、被弾の演出も出ない', () => {
    const { spy, c } = overlapFor('plant', 3000);
    expect(spy).not.toHaveBeenCalled();
    expect(c).toEqual({ sfx: 0, flash: 0, burst: 0 });
    const p = useGameStore.getState().player;
    expect(p.health).toBe(9999);
    expect(p.invulnerableTime).toBe(0); // 被弾無敵の時計を書き換えない
    expect(useGameStore.getState().hitRetaliation ?? null).toBeFalsy(); // 被弾反撃の窓を開かない
  });
  it('普通の雑魚(突進中=接触ダメージが生きている)との接触は今どおり当たる', () => {
    const { spy, c } = overlapFor('zombie', 100, { aiPhase: 'charge', aiPhaseUntil: START_GT + 5000 });
    expect(spy).toHaveBeenCalled();
    expect(spy.mock.calls[0][0]).toBeGreaterThan(0);
    expect(c.sfx).toBeGreaterThan(0);
    expect(c.flash).toBeGreaterThan(0);
    expect(useGameStore.getState().player.health).toBeLessThan(9999);
  });
});

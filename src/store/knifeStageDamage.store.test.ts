// ★ナイフの3連撃の段ごとのダメージの倍率(社長裁定2026-11-27・utils/knifeCombo knifeStageDamageMult)。
// 実際のストア(triggerCounter=PC/ボットの直呼び)で 1→2→3段目を振り、当たりのダメージ=振りの素ダメージ×段の倍率・数字も掛けた後の値・止めの重さは素のまま、を固定する。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useGameStore, meleeSwingBaseDamage } from './gameStore';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { knifeStageDamageMult, KNIFE_COMBO_INTERVAL_MS } from '../utils/knifeCombo';
import type { Enemy } from '../types/game';

let now = 31_000_000;
const st = () => useGameStore.getState();
const center = () => { const p = st().player; return { x: p.x + p.width / 2, y: p.y + p.height / 2 }; };
const place = (id: string): Enemy => {
  const c = center();
  const e = spawnEnemyAt('zombie', 0, 0, st().gameTime);
  return { ...e, x: c.x + 40 - e.width / 2, y: c.y - e.height / 2, health: 999999, maxHealth: 999999, id, dormant: false } as Enemy;
};
const hp = (id: string) => st().enemies.find(e => e.id === id)!.health;
const lastNumber = () => { const n = st().effects.filter(x => x.kind === 'damageNumber'); return n[n.length - 1]; };
/** 1振り(段の間隔が明けた所で振る=段は 1→2→3 と進む)。毎回、素の敵へ戻してから当てる(空中の倍率などを混ぜない)。 */
const swing = (): { dmg: number; stage: number } => {
  useGameStore.setState(s => ({ enemies: [{ ...place('z'), health: s.enemies[0]?.health ?? 999999 }], player: { ...s.player, counterCooldownEnd: 0, pendingSwingAt: 0 } }));
  const h0 = hp('z');
  expect(st().triggerCounter().hit).toBe(true);
  return { dmg: h0 - hp('z'), stage: st().player.knifeComboStage ?? 0 };
};

beforeEach(() => {
  now = 31_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.spyOn(Math, 'random').mockReturnValue(0.99); // クリを出さない
  st().resetGame('warrior');
  useGameStore.setState(s => ({
    m0Unlocked: { ...s.m0Unlocked, melee: true, crit: false }, breakableProps: [],
    player: { ...s.player, health: 99999, maxHealth: 99999, counterCooldownEnd: 0, pendingSwingAt: 0, lastDirection: { x: 1, y: 0 } },
  }));
});
afterEach(() => { vi.restoreAllMocks(); });

describe('ナイフの3連撃: 段ごとのダメージの倍率', () => {
  it('1〜3段目の当たり=振りの素ダメージ×段の倍率(0.55 / 0.55 / 0.88)・次の1段目は 0.55 に戻る', () => {
    const p = st().player;
    const base = meleeSwingBaseDamage(p.weapons.find(w => w.isMelee), p);
    expect(base).toBeGreaterThan(0);
    const out: { dmg: number; stage: number }[] = [];
    for (let i = 0; i < 4; i++) {
      out.push(swing());
      now += KNIFE_COMBO_INTERVAL_MS;
    }
    expect(out.map(o => o.stage)).toEqual([1, 2, 3, 1]);
    for (const o of out) expect(o.dmg).toBeCloseTo(base * knifeStageDamageMult(o.stage), 6);
    expect(out[2].dmg / out[0].dmg).toBeCloseTo(0.88 / 0.55, 6); // 締めが重い
  });
  it('ダメージの数字は掛けた後の値(切り上げ)', () => {
    const p = st().player;
    const base = meleeSwingBaseDamage(p.weapons.find(w => w.isMelee), p);
    swing();
    expect(lastNumber().value).toBe(Math.max(1, Math.ceil(base * knifeStageDamageMult(1))));
  });
  it('止め・のけぞりの重さ(lastHitDmg)は段の倍率を掛ける前の値のまま', () => {
    const p = st().player;
    const base = meleeSwingBaseDamage(p.weapons.find(w => w.isMelee), p);
    for (let i = 0; i < 3; i++) {
      const { stage } = swing();
      expect(st().enemies.find(e => e.id === 'z')!.lastHitDmg).toBeCloseTo(base, 6);
      expect(stage).toBe(i + 1);
      now += KNIFE_COMBO_INTERVAL_MS;
    }
  });
});

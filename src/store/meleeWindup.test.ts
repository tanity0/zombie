// ★近接の前隙(社長裁定2026-08-24「近接前隙を200にして」・research/SAME_ARENA.md §7)の不変条件。
//
// 守るのは4つ。どれも壊れると「近接が死ぬ」か「絵が嘘をつく」に直結する:
//  ① 指を離した瞬間に**カウンター窓とCDは開く**(守りは即応)。判定だけが遅れる。
//  ② 前隙の間は**ダメージが出ない**(攻めは約束)。
//  ③ 前隙の解決は**自分が張ったCDに引っかからない**(引っかかると判定が永久に出ない)。
//  ④ 窓とCDの終了時刻は**指を離した時刻**が基準(解決時刻を基準にすると1周期200ms伸びる=弱体化)。
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore, MELEE_WINDUP_MS, WHIP_WINDUP_MS, meleeWindupMs, COUNTER_WINDOW, COUNTER_COOLDOWN } from './gameStore';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { setTreesDisabled } from '../world/trees';
import { setTorchesDisabled } from '../world/torches';

const ORIGIN = 50_000;

/** プレイヤーの目の前に雑魚を1体置く(近接が必ず届く距離)。 */
const setup = (): { id: string } => {
  const p = useGameStore.getState().player;
  const e = spawnEnemyAt('zombie', ORIGIN + 20, ORIGIN, useGameStore.getState().gameTime);
  e.health = 9999; e.maxHealth = 9999;
  useGameStore.setState(s => ({
    enemies: [e],
    player: { ...s.player, x: ORIGIN, y: ORIGIN, health: 9999, maxHealth: 9999,
      counterWindowEnd: 0, counterCooldownEnd: 0, pendingSwingAt: 0, invulnerable: false },
  }));
  void p;
  return { id: e.id };
};

describe('★近接の前隙(SAME_ARENA.md §7)', () => {
  beforeEach(() => {
    setTreesDisabled(true); setTorchesDisabled(true);
    useGameStore.getState().resetGame('assault');
  });

  it('①②: 指を離した瞬間に窓とCDが開き、判定はまだ出ない', () => {
    const { id } = setup();
    const hpBefore = useGameStore.getState().enemies.find(e => e.id === id)!.health;
    const t0 = Date.now();
    expect(useGameStore.getState().beginMeleeSwing()).toBe(true);
    const p = useGameStore.getState().player;
    // ① 窓は今すぐ開く(守りは即応)。
    expect(p.counterWindowEnd).toBeGreaterThanOrEqual(t0 + COUNTER_WINDOW - 50);
    expect(p.counterCooldownEnd).toBeGreaterThan(t0);
    expect(p.pendingSwingAt).toBeGreaterThan(0);
    // ② まだ誰も斬れていない(攻めは約束)。
    expect(useGameStore.getState().enemies.find(e => e.id === id)!.health).toBe(hpBefore);
  });

  it('②: 前隙中は二度振れない(連打で判定を前倒しできない)', () => {
    setup();
    expect(useGameStore.getState().beginMeleeSwing()).toBe(true);
    expect(useGameStore.getState().beginMeleeSwing()).toBe(false);
  });

  it('③: 前隙の解決は自分が張ったCDに阻まれない(阻まれると近接が永久に出ない)', () => {
    const { id } = setup();
    useGameStore.getState().beginMeleeSwing();
    const pendAt = useGameStore.getState().player.pendingSwingAt;
    // 解決時刻(= pendAt + 前隙)は、自分で張ったCDの真っ只中にある。
    expect(pendAt + MELEE_WINDUP_MS).toBeLessThan(useGameStore.getState().player.counterCooldownEnd);
    const hpBefore = useGameStore.getState().enemies.find(e => e.id === id)!.health;
    const r = useGameStore.getState().triggerCounter(pendAt);
    expect(r.swung).toBe(true);
    expect(useGameStore.getState().enemies.find(e => e.id === id)!.health).toBeLessThan(hpBefore);
  });

  it('④: 窓・CDの終了時刻は「指を離した時刻」が基準(解決で後ろへずれない)', () => {
    setup();
    useGameStore.getState().beginMeleeSwing();
    const pendAt = useGameStore.getState().player.pendingSwingAt;
    useGameStore.getState().triggerCounter(pendAt);
    const p = useGameStore.getState().player;
    expect(p.counterWindowEnd).toBe(pendAt + COUNTER_WINDOW);
    expect(p.counterCooldownEnd).toBe(pendAt + COUNTER_WINDOW + COUNTER_COOLDOWN);
    // 絵の起点も前隙の起点に揃っている(200ms後に振り直さない)。
    expect(p.meleeSwingAt).toBe(pendAt);
  });

  it('前隙は200ms(社長裁定)。この値がしゃがみ絵の長さの唯一の出どころ', () => {
    expect(MELEE_WINDUP_MS).toBe(200);
  });

  // ★社長指示2026-08-24「鞭は250くらいにしたい」。武器ごとの値は meleeWindupMs に集約する
  // (前隙を測る側が MELEE_WINDUP_MS を直読みすると、鞭だけ絵と判定がズレる)。
  it('鞭は250ms・それ以外は200ms(武器ごとの前隙は1つの関数に集約)', () => {
    const p = useGameStore.getState().player;
    expect(meleeWindupMs({ ...p, subWeapons: [] })).toBe(MELEE_WINDUP_MS);
    expect(meleeWindupMs({ ...p, subWeapons: ['whip'] })).toBe(WHIP_WINDUP_MS);
    expect(WHIP_WINDUP_MS).toBe(250);
    expect(WHIP_WINDUP_MS).toBeGreaterThan(MELEE_WINDUP_MS); // リーチと引き換えに出が遅い
  });
});

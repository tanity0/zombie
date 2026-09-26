// ★社長指示2026-08-24「デコイやトラップ、自動タレットなど…設置系全て」→「それぞれに耐久値設定して」。
// 壊せるのは**敵対側(幻影)が置いた物だけ**(社長「もちろん幻影のに決まってんだろ」)。
//
// ここで固定する不変条件は3つ。どれも壊れると事故が静かに起きる:
//  ① 自分の設置物は近接で壊れない(誤爆で自分のタレットを失わない)
//  ② 敵対側の設置物は耐久ぶん殴れば壊れる
//  ③ 耐久台帳の並び(トラップ/地雷=1撃・デコイ=2撃・タレット=3撃)が崩れていない
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore, PLACED_DURABILITY } from './gameStore';
import { setTreesDisabled } from '../world/trees';
import { setTorchesDisabled } from '../world/torches';

const ORIGIN = 50_000;

const placeTurret = (hostile: boolean): string => {
  const id = `test-turret-${hostile ? 'h' : 'p'}`;
  useGameStore.setState(s => ({
    player: { ...s.player, x: ORIGIN, y: ORIGIN },
    projectiles: [...s.projectiles, {
      id, x: ORIGIN, y: ORIGIN, width: 16, height: 16, speed: 0, damage: 0,
      direction: { x: 0, y: 0 }, weaponType: 'turret', createdAt: Date.now(), duration: 10_000,
      passthrough: false, hitEnemies: [], hostile, reflected: false,
      placedHp: PLACED_DURABILITY.turret, placedMaxHp: PLACED_DURABILITY.turret,
    }],
  }));
  return id;
};
const alive = (id: string) => useGameStore.getState().projectiles.some(p => p.id === id);

describe('★設置物の耐久(社長指示2026-08-24)', () => {
  beforeEach(() => {
    setTreesDisabled(true); setTorchesDisabled(true);
    useGameStore.getState().resetGame('assault');
  });

  it('①自分の設置物は壊れない(hostile でない物は対象外)', () => {
    const id = placeTurret(false);
    // 耐久を大きく超えるダメージを至近で入れても消えない。
    useGameStore.getState().damageHostilePlacements(ORIGIN, ORIGIN, 200, PLACED_DURABILITY.turret * 10);
    expect(alive(id)).toBe(true);
  });

  it('②敵対側(幻影)の設置物は耐久ぶんで壊れる', () => {
    const id = placeTurret(true);
    // 耐久より小さい一撃では壊れない=「耐久値」が効いている(即死フラグではない)。
    const broke1 = useGameStore.getState().damageHostilePlacements(ORIGIN, ORIGIN, 200, PLACED_DURABILITY.turret - 1);
    expect(broke1).toBe(0);
    expect(alive(id)).toBe(true);
    const broke2 = useGameStore.getState().damageHostilePlacements(ORIGIN, ORIGIN, 200, 1);
    expect(broke2).toBe(1);
    expect(alive(id)).toBe(false);
  });

  it('②-b 射程の外にある物は壊れない', () => {
    const id = placeTurret(true);
    useGameStore.getState().damageHostilePlacements(ORIGIN + 5000, ORIGIN, 50, 9999);
    expect(alive(id)).toBe(true);
  });

  it('③耐久の並び: トラップ=地雷 < デコイ < タレット(仕掛けは脆く、居座る火力ほど硬い)', () => {
    expect(PLACED_DURABILITY['marksman-trap']).toBe(PLACED_DURABILITY['sensor-mine']);
    expect(PLACED_DURABILITY['marksman-trap']).toBeLessThan(PLACED_DURABILITY.decoy);
    expect(PLACED_DURABILITY.decoy).toBeLessThan(PLACED_DURABILITY.turret);
  });
});

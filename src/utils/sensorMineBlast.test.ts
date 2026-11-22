// research/TELEGRAPH_FIXES.md I01: 予告の円(m.blastR)と起爆の半径は同じ式 sensorMineBlastRadius を通る。
import { describe, it, expect } from 'vitest';
import { sensorMineBlastRadius, SENSOR_MINE_RADIUS } from './sensorMine';
import { useGameStore, skillExplosionMult, heavyGunnerExplosionMult } from '../store/gameStore';

describe('sensorMineBlastRadius(I01)', () => {
  it('倍率1なら SENSOR_MINE_RADIUS そのもの', () => {
    expect(sensorMineBlastRadius(1, 1)).toBe(SENSOR_MINE_RADIUS);
  });
  it('同じ主語・同じ時刻の倍率なら、起爆の式(半径×エクスプローダー×ヘビーガンナー)と一致', () => {
    const base = useGameStore.getState().player;
    const actor = { ...base, characterClass: 'warrior' as const, heavyGunnerExpBuffUntil: 5000 };
    for (const t of [0, 4999, 5000, 9000]) {
      const ex = skillExplosionMult(actor), hg = heavyGunnerExplosionMult(actor, t);
      expect(sensorMineBlastRadius(ex, hg)).toBeCloseTo(SENSOR_MINE_RADIUS * ex * hg, 9);
    }
    expect(heavyGunnerExplosionMult(actor, 0)).toBe(1.1);
    expect(sensorMineBlastRadius(1.5, 1.1)).toBeCloseTo(SENSOR_MINE_RADIUS * 1.65, 9);
  });
});

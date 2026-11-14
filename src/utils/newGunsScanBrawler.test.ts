// 社長指示2026-11-09「銃、スキャンセンサーだけは動く様にしたい」: 格闘中は銃を止めるが、スキャンセンサーだけは動く。刀の間は今どおり止める。
import { describe, it, expect } from 'vitest';
import { useGameStore } from '../store/gameStore';
import { gunLocked } from './newGunsTick';

const playerWith = (subs: string[]) => {
  useGameStore.getState().resetGame('warrior');
  const p = useGameStore.getState().player;
  return { ...p, subWeapons: subs as typeof p.subWeapons, health: 100 };
};

describe('格闘中でもスキャンセンサーだけは動く', () => {
  it('格闘: 普通の銃は止まる・スキャンセンサー(meleeOk)は動く', () => {
    const p = playerWith(['brawler']);
    expect(gunLocked(p, 1000, false)).toBe(true);
    expect(gunLocked(p, 1000, false, true)).toBe(false);
  });
  it('刀: スキャンセンサーも今どおり止まる', () => {
    const p = playerWith(['katana']);
    expect(gunLocked(p, 1000, false, true)).toBe(true);
  });
  it('近接専用でない時は今どおり動く', () => {
    const p = playerWith([]);
    expect(gunLocked(p, 1000, false)).toBe(false);
    expect(gunLocked(p, 1000, false, true)).toBe(false);
  });
});

import { subWeaponBlockedByKatana, dropBrawlerConflicts } from '../store/gameStore';
describe('格闘中もサブウェポンは止めない(社長指示2026-11-09「銃はとめるけど、サブウェポンは止めないよ」)', () => {
  it('格闘中の手榴弾・罠・タレットは止まらない', () => {
    const p = playerWith(['brawler', 'heavy-grenade', 'marksman-trap', 'turret']);
    for (const k of ['heavy-grenade', 'marksman-trap', 'turret', 'brawler'] as const) expect(subWeaponBlockedByKatana(p, k)).toBe(false);
  });
  it('刀は今どおり他を止める', () => {
    const p = playerWith(['katana', 'heavy-grenade']);
    expect(subWeaponBlockedByKatana(p, 'heavy-grenade')).toBe(true);
  });
  it('一緒に持てないのは刀・村雨・鞭だけ', () => {
    expect(dropBrawlerConflicts(['katana', 'whip', 'turret'], 'brawler')).toEqual(['turret']);
    expect(dropBrawlerConflicts(['brawler', 'turret'], 'whip')).toEqual(['turret']);
    expect(dropBrawlerConflicts(['brawler', 'turret'], 'decoy')).toEqual(['brawler', 'turret']);
  });
});

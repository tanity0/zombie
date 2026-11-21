import { describe, it, expect } from 'vitest';
import { useGameStore } from './gameStore';
import { RAILGUN_WEAPON_KEY } from '../utils/weaponUtils';

// 社長指示2026-09-13「オートと手動のCDは分けて」: レールガンの手動射撃(fireRailgunShot)は
// オートの lastFired を読まず・書かず、manualLastFired だけで間隔を数える。残弾は共有。
const equipRailgun = () => {
  useGameStore.getState().resetGame('warrior');
  useGameStore.getState().grantWeapon(RAILGUN_WEAPON_KEY);
  const st = useGameStore.getState();
  const gun = st.player.weapons.find(w => w.key === RAILGUN_WEAPON_KEY)!;
  expect(gun).toBeDefined();
  useGameStore.setState(s => ({
    player: { ...s.player, activeWeaponId: gun.id, isMoving: false, aimX: 1, aimY: 0, phillSnapEnemyId: null },
    projectiles: [],
  }));
  return gun.id;
};
const gunNow = (id: string) => useGameStore.getState().player.weapons.find(w => w.id === id)!;

describe('レールガン: 手動射撃のCDはオートと独立(社長指示2026-09-13)', () => {
  it('オートが直前に撃っていても(lastFired=今)手動は撃てる。手動は lastFired を書かず manualLastFired を書く', () => {
    const id = equipRailgun();
    const now = Date.now();
    useGameStore.setState(s => ({ player: { ...s.player, weapons: s.player.weapons.map(w => w.id === id ? { ...w, lastFired: now, manualLastFired: undefined } : w) } }));
    const magBefore = gunNow(id).magazine ?? 0;
    useGameStore.getState().fireRailgunShot();
    const g = gunNow(id);
    expect(useGameStore.getState().projectiles.some(p => p.weaponKey === RAILGUN_WEAPON_KEY && p.headshotEligible)).toBe(true);
    expect(g.lastFired).toBe(now);                 // オートの時計は触らない
    expect(g.manualLastFired ?? 0).toBeGreaterThanOrEqual(now); // 手動の時計だけ進む
    expect(g.magazine).toBe(magBefore - 1);        // 残弾は共有
  });

  it('手動の直後は手動が撃てない(manualLastFired で塞ぐ)が、lastFired は古いままなのでオート側は妨げない', () => {
    const id = equipRailgun();
    useGameStore.setState(s => ({ player: { ...s.player, weapons: s.player.weapons.map(w => w.id === id ? { ...w, lastFired: 0, manualLastFired: undefined } : w) } }));
    useGameStore.getState().fireRailgunShot();
    const n1 = useGameStore.getState().projectiles.length;
    useGameStore.getState().fireRailgunShot(); // CD内=撃てない
    expect(useGameStore.getState().projectiles.length).toBe(n1);
    expect(gunNow(id).lastFired).toBe(0);
  });
});

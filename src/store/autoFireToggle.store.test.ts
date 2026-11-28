// 装備中の銃の枠タップ=銃の装備を外す(社長指示2026-11-27・utils/autoFireToggle)の配線をストアで固定する。
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from './gameStore';
import { createWeapon } from '../utils/weaponUtils';

const twoGuns = () => {
  const a = { ...createWeapon('handgun-t1'), magazine: 5 };
  const b = { ...createWeapon('shotgun-t1'), magazine: 3 };
  useGameStore.setState(st => ({
    player: { ...st.player, weapons: [a, b, ...st.player.weapons.filter(w => w.isMelee)], activeWeaponId: a.id },
  }));
  return { a, b };
};

describe('tapGunSlot(銃の装備を外す/装備し直す)', () => {
  beforeEach(() => { useGameStore.getState().resetGame('warrior'); });

  it('出撃時は装備した状態', () => {
    expect(useGameStore.getState().autoFireOff).toBe(false);
  });
  it('装備中の銃をタップで外す、もう一度でその銃を装備', () => {
    const { a } = twoGuns();
    useGameStore.getState().tapGunSlot(a.id);
    expect(useGameStore.getState().autoFireOff).toBe(true);
    expect(useGameStore.getState().player.activeWeaponId).toBe(a.id);
    useGameStore.getState().tapGunSlot(a.id);
    expect(useGameStore.getState().autoFireOff).toBe(false);
    expect(useGameStore.getState().player.activeWeaponId).toBe(a.id);
  });
  it('外している間に別の銃をタップするとその銃を装備', () => {
    const { a, b } = twoGuns();
    useGameStore.getState().tapGunSlot(a.id);
    useGameStore.getState().tapGunSlot(b.id);
    expect(useGameStore.getState().autoFireOff).toBe(false);
    expect(useGameStore.getState().player.activeWeaponId).toBe(b.id);
  });
  it('ほかの経路の持ち替え(PCのホイール等=setActiveWeapon)でも装備した状態に戻る', () => {
    const { a, b } = twoGuns();
    useGameStore.getState().tapGunSlot(a.id);
    useGameStore.getState().setActiveWeapon(b.id);
    expect(useGameStore.getState().autoFireOff).toBe(false);
  });
  it('外している間は弾切れの自動リロード/持ち替えで勝手に装備し直さない', () => {
    const { a, b } = twoGuns();
    useGameStore.setState(st => ({
      player: { ...st.player, weapons: st.player.weapons.map(w => (w.id === a.id ? { ...w, magazine: 0 } : w)), ammoHandgun: 0 },
    }));
    useGameStore.getState().tapGunSlot(a.id);
    useGameStore.getState().autoSwitchIfDry();
    const st = useGameStore.getState();
    expect(st.autoFireOff).toBe(true);
    expect(st.player.activeWeaponId).toBe(a.id);
    expect(st.player.reloadingWeaponId).toBe('');
    // 装備し直せば今どおり(弾切れなら撃てる銃へ持ち替え)。
    useGameStore.getState().tapGunSlot(a.id);
    useGameStore.getState().autoSwitchIfDry();
    expect(useGameStore.getState().player.activeWeaponId).toBe(b.id);
  });
  it('resetGame で装備した状態に戻る', () => {
    const { a } = twoGuns();
    useGameStore.getState().tapGunSlot(a.id);
    useGameStore.getState().resetGame('warrior');
    expect(useGameStore.getState().autoFireOff).toBe(false);
  });
});

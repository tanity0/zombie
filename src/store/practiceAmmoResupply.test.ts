// 変異体対策室(練習ラン)の弾の補給の配線テスト。練習ランで弾0→弾の拾い物が1つ増える/本編では増えない。
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useGameStore } from './gameStore';
import { beginPracticeRun, endPracticeRun, PRACTICE_SLOTS } from '../utils/bossPractice';
import { createWeapon } from '../utils/weaponUtils';
import { renderedViewRect } from '../utils/spawnRefill';

const setup = (): void => {
  const st = useGameStore.getState();
  const h = { ...createWeapon('handgun-t1'), magazine: 0 };
  useGameStore.setState({
    pickups: [], breakableProps: [], farBackdrop: '', stageTheme: 'forest', indoorMode: false,
    corridorMode: false, corridorRunInActive: false, m0AdvanceLimitX: null,
    camera: { x: 0, y: 0 }, gameBounds: { width: 800, height: 600 }, viewZoom: 1, gameTime: 5000,
    player: { ...st.player, x: 384, y: 284, width: 32, height: 32, weapons: [h], activeWeaponId: h.id, ammoHandgun: 0, ammoShotgun: 0, ammoRifle: 0, ammoPhill: 0, ammoGlauncher: 0 },
  });
};
const ammoPickups = () => useGameStore.getState().pickups.filter(p => p.type.startsWith('ammo-'));

describe('practiceAmmoResupplyTick', () => {
  beforeEach(() => {
    useGameStore.getState().resetGame('soldier');
    setup();
  });
  afterEach(() => { endPracticeRun(); });

  it('本編では弾0でも何も落ちない', () => {
    useGameStore.getState().practiceAmmoResupplyTick();
    expect(ammoPickups()).toHaveLength(0);
  });

  it('練習ランで弾0→その種類の弾が画面内に1つ・続けて呼んでも増えない', () => {
    beginPracticeRun(PRACTICE_SLOTS[0], { stageId: 'stage-1', mission: 'revisit', free: true });
    const s = useGameStore.getState();
    s.practiceAmmoResupplyTick();
    s.practiceAmmoResupplyTick();
    useGameStore.setState({ gameTime: 9000 }); // 確かめ直しの後も場にあるので増えない
    useGameStore.getState().practiceAmmoResupplyTick();
    const a = ammoPickups();
    expect(a).toHaveLength(1);
    expect(a[0].type).toBe('ammo-handgun');
    const st = useGameStore.getState();
    const vb = renderedViewRect(st.camera.x, st.camera.y, st.gameBounds.width, st.gameBounds.height, st.viewZoom);
    expect(a[0].x).toBeGreaterThanOrEqual(vb.left);
    expect(a[0].x).toBeLessThanOrEqual(vb.right);
    expect(a[0].y).toBeGreaterThan(vb.horizonY);
    expect(a[0].y).toBeLessThanOrEqual(vb.bottom);
  });

  it('拾って撃ち切ったら、また落ちる', () => {
    beginPracticeRun(PRACTICE_SLOTS[0], { stageId: 'stage-1', mission: 'revisit', free: true });
    useGameStore.getState().practiceAmmoResupplyTick();
    const first = ammoPickups()[0];
    useGameStore.getState().collectPickup(first.id);
    expect(useGameStore.getState().player.ammoHandgun).toBeGreaterThan(0);
    useGameStore.getState().practiceAmmoResupplyTick(); // 弾があるので落ちない
    expect(ammoPickups()).toHaveLength(0);
    useGameStore.setState(s => ({ player: { ...s.player, ammoHandgun: 0 } })); // 撃ち切った
    useGameStore.getState().practiceAmmoResupplyTick();
    expect(ammoPickups()).toHaveLength(1);
  });

  it('無限弾の銃では何も落ちない', () => {
    beginPracticeRun(PRACTICE_SLOTS[0], { stageId: 'stage-1', mission: 'revisit', free: true });
    useGameStore.setState(s => ({ player: { ...s.player, weapons: s.player.weapons.map(w => ({ ...w, infiniteAmmo: true as const })) } }));
    useGameStore.getState().practiceAmmoResupplyTick();
    expect(ammoPickups()).toHaveLength(0);
  });
});

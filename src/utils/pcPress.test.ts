import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../audio/audioManager', () => ({ playSfx: vi.fn() }));
import { useGameStore } from '../store/gameStore';
import { pcPressDown, pcPressUp, resetPcPressForTest, isPcPressing, markPcFlick } from './pcPress';

// research/PC_SUPPORT.md §11-1: PC の「指」(マウス左・Space/J・パッドA)。タッチの指置き/指離しと同じ行為を呼ぶ。
describe('PC の指(pcPress)', () => {
  let swing: ReturnType<typeof vi.fn>, homing: ReturnType<typeof vi.fn>, mount: ReturnType<typeof vi.fn>, dismount: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    resetPcPressForTest();
    swing = vi.fn(() => true); homing = vi.fn(); mount = vi.fn(); dismount = vi.fn();
    useGameStore.setState({
      isPaused: false, touchActive: false, mouseAim: null,
      beginMeleeSwing: swing, fireHoming: homing, mountSkater: mount, dismountSkater: dismount,
      requestStoryReturnPrompt: () => false,
      fireSignalLauncher: vi.fn(), fireRailgunShot: vi.fn(), detonateAlchemyStones: vi.fn(), firePhillShot: vi.fn(),
    } as never);
  });
  it('押している間は指が置かれ(touchActive)、離すと近接とホーミングが出る', () => {
    pcPressDown('mouse');
    expect(useGameStore.getState().touchActive).toBe(true);
    expect(swing).not.toHaveBeenCalled();
    pcPressUp('mouse', true);
    expect(useGameStore.getState().touchActive).toBe(false);
    expect(swing).toHaveBeenCalledTimes(1);
    expect(homing).toHaveBeenCalledTimes(1);
    expect(dismount).toHaveBeenCalledTimes(1);
  });
  it('指は1本: 別の入口を同時に押しても二重に撃たない(押した入口だけが離せる)', () => {
    pcPressDown('key');
    pcPressDown('pad');
    pcPressUp('pad', true);
    expect(swing).not.toHaveBeenCalled();
    expect(isPcPressing()).toBe(true);
    pcPressUp('key', true);
    expect(swing).toHaveBeenCalledTimes(1);
  });
  it('押下が受理されなかった(一時停止中)時は、離しても何も出ない', () => {
    useGameStore.setState({ isPaused: true } as never);
    pcPressDown('key');
    useGameStore.setState({ isPaused: false } as never);
    pcPressUp('key', true);
    expect(swing).not.toHaveBeenCalled();
  });
  it('撃たずに離す(窓が裏へ行った等)は何も出さず、2度押しの記録も残さない', () => {
    pcPressDown('mouse');
    pcPressUp('any', false);
    expect(swing).not.toHaveBeenCalled();
    pcPressDown('mouse');
    expect(mount).not.toHaveBeenCalled();
  });
  it('短く押して離し、すぐもう一度押す=スケボーに乗る', () => {
    pcPressDown('mouse');
    pcPressUp('mouse', true);
    pcPressDown('mouse');
    expect(mount).toHaveBeenCalledTimes(1);
  });
  it('離した時の順はタッチの指離しと同じ(PHILL→シグナル→レールガン→錬金砲→ホーミング→近接→降車)', () => {
    const order: string[] = [];
    const rec = (n: string) => vi.fn(() => { order.push(n); return true; });
    useGameStore.setState({
      fireSignalLauncher: rec('signal'), fireRailgunShot: rec('rail'), detonateAlchemyStones: rec('alch'),
      fireHoming: rec('homing'), beginMeleeSwing: rec('melee'), dismountSkater: rec('dismount'),
    } as never);
    pcPressDown('key');
    pcPressUp('key', true);
    expect(order).toEqual(['signal', 'rail', 'alch', 'homing', 'melee', 'dismount']);
  });
  it('マウスの向きは照準を持つ銃の時だけ効く。近接の振りは歩いた向きのまま(社長指示2026-10-05)', () => {
    const setDir = vi.fn();
    const walked = { x: 0, y: 1 };
    const base = { x: 100, y: 100, width: 20, height: 20, lastDirection: walked };
    // 近接だけ(銃を構えていない): カーソルが右にあっても向きを書き換えない
    useGameStore.setState({ mouseAim: { x: 400, y: 110 }, camera: { x: 0, y: 0 }, setLastDirection: setDir,
      rhythm: { active: false }, player: { ...base, weapons: [{ id: 'k', key: 'knife-t1' }], activeWeaponId: 'k' } } as never);
    pcPressDown('mouse'); pcPressUp('mouse', true);
    expect(setDir).not.toHaveBeenCalled();
    expect(swing).toHaveBeenCalledTimes(1);
    // PHILL を構えている: カーソルの方へ向く
    useGameStore.setState({ player: { ...base, weapons: [{ id: 'p', key: 'phill-revolver', category: 'gun' }], activeWeaponId: 'p' } } as never);
    pcPressDown('mouse'); pcPressUp('mouse', true);
    expect(setDir).toHaveBeenCalledTimes(1);
    expect(setDir.mock.calls[0][0].x).toBeGreaterThan(0.99);
  });
  it('四神舞: 押している間にフリックを出したら、離してもタップにしない', () => {
    const rhythmInput = vi.fn();
    useGameStore.setState({ rhythm: { ...useGameStore.getState().rhythm, active: true }, rhythmInput } as never);
    pcPressDown('mouse');
    markPcFlick();
    pcPressUp('mouse', true);
    expect(rhythmInput).not.toHaveBeenCalled();
    pcPressDown('mouse');
    pcPressUp('mouse', true);
    expect(rhythmInput).toHaveBeenCalledWith('tap');
    useGameStore.setState({ rhythm: { ...useGameStore.getState().rhythm, active: false } } as never);
  });
});

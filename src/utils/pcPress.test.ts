import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../audio/audioManager', () => ({ playSfx: vi.fn() }));
import { useGameStore } from '../store/gameStore';
import { pcPressDown, pcPressUp, resetPcPressForTest, isPcPressing } from './pcPress';

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
});

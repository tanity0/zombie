import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
vi.mock('../audio/audioManager', () => ({ playSfx: vi.fn() }));
import { useGameStore } from '../store/gameStore';
import { pcPressDown, pcPressUp, resetPcPressForTest, isPcPressing, markPcFlick, pollBrawlerSkaterForTest } from './pcPress';

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
  // 被弾反撃の窓(research/HIT_RETALIATION.md)の中の押し直しはスケボーに乗らない(タッチの VirtualJoystick と同じ・検収監査 A-1)。
  const openWindow = () => { const now = Date.now(); return { fromId: 'e', openedAt: now - 10, closesAt: now + 10_000, stopUntil: now, dirX: 1, dirY: 0 }; };
  it('反撃の窓が開いている間の押し直しは、2度押しでもスケボーに乗らない', () => {
    pcPressDown('mouse');
    pcPressUp('mouse', true);
    useGameStore.setState({ hitRetaliation: openWindow() } as never);
    pcPressDown('mouse');
    expect(mount).not.toHaveBeenCalled();
    pcPressUp('mouse', true);
    useGameStore.setState({ hitRetaliation: null } as never);
  });
  it('反撃の窓の間の短い押しは、次の押下の2度押しに数えない', () => {
    useGameStore.setState({ hitRetaliation: openWindow() } as never);
    pcPressDown('key');
    pcPressUp('key', true);
    useGameStore.setState({ hitRetaliation: null } as never);
    pcPressDown('key');
    expect(mount).not.toHaveBeenCalled();
    pcPressUp('key', true);
  });
  it('窓が閉じていれば、従来どおり2度押しで乗る', () => {
    useGameStore.setState({ hitRetaliation: null } as never);
    pcPressDown('pad');
    pcPressUp('pad', true);
    pcPressDown('pad');
    expect(mount).toHaveBeenCalledTimes(1);
  });
  // 洋館の再訪: 保存槽の［投与する］が出ている間、主ボタンの離し=投与(攻撃は出さない)。キー・パッドだけでも秘密任務を終えられる。
  it('［投与する］が出ている間は、離すと投与して攻撃は出さない(マウス・キー・パッド共通)', () => {
    for (const src of ['mouse', 'key', 'pad'] as const) {
      const use = vi.fn();
      swing.mockClear(); homing.mockClear();
      useGameStore.setState({ medicinePromptVisible: true, useGlenMedicine: use } as never);
      pcPressDown(src);
      expect(use).not.toHaveBeenCalled(); // 押した瞬間ではなく、離した時(ボタンのクリックと同じ)
      pcPressUp(src, true);
      expect(use).toHaveBeenCalledTimes(1);
      expect(swing).not.toHaveBeenCalled();
      expect(homing).not.toHaveBeenCalled();
    }
    useGameStore.setState({ medicinePromptVisible: false } as never);
  });
  it('［投与する］が出ていても、撃たずに離す(窓が裏へ行った等)では投与しない', () => {
    const use = vi.fn();
    useGameStore.setState({ medicinePromptVisible: true, useGlenMedicine: use } as never);
    pcPressDown('mouse');
    pcPressUp('any', false);
    expect(use).not.toHaveBeenCalled();
    useGameStore.setState({ medicinePromptVisible: false } as never);
  });
});

// research/ALCHEMY_RHYTHM.md + 社長指示2026-11-20「錬金術、ちゃんと近接も発動できるようにして」:
// 溜めの間の押下はリズムを判定し(押した瞬間)、離しの近接・スケボーの2度押しは今までどおり出る。
describe('PC の指: 錬金術の溜め中', () => {
  let swing: ReturnType<typeof vi.fn>, mount: ReturnType<typeof vi.fn>;
  beforeEach(async () => {
    resetPcPressForTest();
    swing = vi.fn(() => true); mount = vi.fn();
    const { newAlchemyRhythm, ALCHEMY_RHYTHM_TRAVEL_MS } = await import('./alchemyRhythm');
    const gt = 30_000;
    const started = gt - ALCHEMY_RHYTHM_TRAVEL_MS; // 1つ目の輪がちょうど着く瞬間
    useGameStore.setState(s => ({
      isPaused: false, touchActive: false, mouseAim: null, gameTime: gt,
      beginMeleeSwing: swing, fireHoming: vi.fn(), mountSkater: mount, dismountSkater: vi.fn(),
      requestStoryReturnPrompt: () => false,
      fireSignalLauncher: vi.fn(), fireRailgunShot: vi.fn(), detonateAlchemyStones: vi.fn(), firePhillShot: vi.fn(),
      player: { ...s.player, alchemyChannelStartedAt: started, alchemyRhythm: newAlchemyRhythm(started) },
    }) as never);
  });
  it('到着に合わせた押下はリズムの成功になり、離せば近接も出る', () => {
    pcPressDown('mouse');
    expect(useGameStore.getState().player.alchemyRhythm?.hits).toBe(1);
    expect(swing).not.toHaveBeenCalled();
    pcPressUp('mouse', true);
    expect(swing).toHaveBeenCalledTimes(1);
  });
  it('溜め中でもスケボーの2度押しは今までどおり数える', () => {
    pcPressDown('mouse');
    pcPressUp('mouse', true);
    pcPressDown('mouse');
    expect(mount).toHaveBeenCalledTimes(1);
  });
});

// ★格闘中のスケボー(社長指示2026-11-28「2回目を押しながら移動したら、じゃない?」): 2回目を押した瞬間には乗らず、押したまま移動の入力で乗る。
describe('PC の指: 格闘中のスケボー', () => {
  let mount: ReturnType<typeof vi.fn>, clock = 0;
  const noMove = { up: false, down: false, left: false, right: false };
  beforeEach(() => {
    resetPcPressForTest();
    clock = 10_000;
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
    mount = vi.fn();
    useGameStore.setState(s => ({
      isPaused: false, touchActive: false, mouseAim: null, hitRetaliation: null, swipeDirection: null,
      inputState: { ...s.inputState, ...noMove },
      beginMeleeSwing: vi.fn(() => true), fireHoming: vi.fn(), mountSkater: mount, dismountSkater: vi.fn(),
      brawlerGougePress: vi.fn(), brawlerGougeRelease: vi.fn(() => 'normal'), brawlerGougeClear: vi.fn(),
      requestStoryReturnPrompt: () => false,
      fireSignalLauncher: vi.fn(), fireRailgunShot: vi.fn(), detonateAlchemyStones: vi.fn(), firePhillShot: vi.fn(),
      player: { ...s.player, subWeapons: ['brawler'], alchemyChannelStartedAt: undefined, alchemyRhythm: undefined },
    }) as never);
  });
  afterEach(() => { resetPcPressForTest(); vi.restoreAllMocks(); });
  const doubleTap = () => { pcPressDown('mouse'); clock += 80; pcPressUp('mouse', true); clock += 100; pcPressDown('mouse'); };
  it('2回目を押した瞬間には乗らない', () => {
    doubleTap();
    expect(mount).not.toHaveBeenCalled();
    pcPressUp('mouse', true);
  });
  it('2回目を押したまま移動キーを押して、押下が短いタップを越えたら乗る', () => {
    doubleTap();
    useGameStore.setState(s => ({ inputState: { ...s.inputState, right: true } }) as never);
    clock += 100; pollBrawlerSkaterForTest();
    expect(mount).not.toHaveBeenCalled(); // まだ短い押下(連打の押下では乗らない)
    clock += 150; useGameStore.setState({ gameTime: 1 } as never); // store が動けば自動で判定する
    expect(mount).toHaveBeenCalledTimes(1);
    pcPressUp('mouse', true);
  });
  it('パッドのスティック(swipeDirection)でも乗る', () => {
    pcPressDown('pad'); clock += 80; pcPressUp('pad', true); clock += 100; pcPressDown('pad');
    clock += 300;
    useGameStore.setState({ swipeDirection: { x: 1, y: 0 } } as never);
    expect(mount).toHaveBeenCalledTimes(1);
    pcPressUp('pad', true);
  });
  it('押したまま動かさない(抉り打ちの長押し)では乗らない', () => {
    doubleTap();
    clock += 1000; pollBrawlerSkaterForTest();
    expect(mount).not.toHaveBeenCalled();
    pcPressUp('mouse', true);
  });
  it('離した後に移動キーを押しても乗らない(構えは離しで外れる)', () => {
    doubleTap();
    pcPressUp('mouse', true);
    clock += 300;
    useGameStore.setState(s => ({ inputState: { ...s.inputState, right: true } }) as never);
    pollBrawlerSkaterForTest();
    expect(mount).not.toHaveBeenCalled();
  });
});

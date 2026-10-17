// ファストトラベル(research/FAST_TRAVEL.md)の配線テスト: ショップが開いている時だけ・行き先へ立つ・ショップが閉じてすぐには開かない。
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore, travelDestinationsOf, ARMORY_RADIUS } from './gameStore';
import { setTreesDisabled } from '../world/trees';
import { setTorchesDisabled } from '../world/torches';

const center = () => { const p = useGameStore.getState().player; return { x: p.x + p.width / 2, y: p.y + p.height / 2 }; };
const put = (x: number, y: number) => useGameStore.setState(s => ({ player: { ...s.player, x: x - s.player.width / 2, y: y - s.player.height / 2 } }));

beforeEach(() => {
  setTreesDisabled(true); setTorchesDisabled(true);
  useGameStore.getState().resetGame('assault');
  useGameStore.setState(s => ({
    merchantHidden: false, enemies: [],
    baseSites: s.baseSites.map(b => (b.id === 'base-0' || b.id === 'base-2' ? { ...b, status: 'captured' } : b)),
  }));
});

describe('ファストトラベル', () => {
  it('行き先=武器商人+解放済みの拠点', () => {
    put(4800, 20);
    expect(travelDestinationsOf(useGameStore.getState()).map(d => d.id)).toEqual(['merchant', 'base-0', 'base-2']);
  });
  it('ショップが閉じている時は動かない', () => {
    put(4800, 20);
    expect(useGameStore.getState().fastTravelTo('base-2')).toBe(false);
    expect(center().x).toBeCloseTo(4800, 0);
  });
  it('開いている時: 行き先(武器庫の円の外・拠点の円の中)に立ち、ショップが閉じる', () => {
    put(4800, 20);
    useGameStore.setState({ showShopMenu: true, isPaused: true });
    const gt = useGameStore.getState().gameTime;
    expect(useGameStore.getState().fastTravelTo('base-2')).toBe(true);
    const s = useGameStore.getState();
    expect(s.showShopMenu).toBe(false);
    expect(s.isPaused).toBe(false);
    expect(s.shopReopenAt).toBeGreaterThan(gt);
    const c = center();
    const d = Math.hypot(c.x - -4800, c.y - 0);
    expect(d).toBeGreaterThan(ARMORY_RADIUS);
    expect(d).toBeLessThan(130);
  });
  it('今いる場所・未解放の拠点へは行けない', () => {
    put(4800, 20);
    useGameStore.setState({ showShopMenu: true, isPaused: true });
    expect(useGameStore.getState().fastTravelTo('base-0')).toBe(false);
    expect(useGameStore.getState().fastTravelTo('base-1')).toBe(false);
    expect(useGameStore.getState().showShopMenu).toBe(true);
  });
});

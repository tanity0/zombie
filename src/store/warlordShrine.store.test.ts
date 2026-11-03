// 武将の祠(research/POI_TOUCH_SHRINE.md §2/§3)。
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from './gameStore';
import { shrineCircleCenter, SHRINE_DWELL_MS, SHRINE_DIST } from '../world/warlordShrine';
import { hasFullWarlordSet } from '../data/equipment';
import { poiSectorIndex } from '../world/pois';

const at = (x: number, y: number) => useGameStore.setState(s => ({ player: { ...s.player, x: x - s.player.width / 2, y: y - s.player.height / 2 } }));
const step = (ms: number) => { for (let t = 0; t < ms; t += 50) useGameStore.getState().updateShrines(0.05); };

beforeEach(() => {
  useGameStore.getState().resetGame('warrior');
  useGameStore.setState({ bossFightNow: false, bossFightLastTrueAt: -1e9, gameTime: 100000 });
});

describe('武将の祠', () => {
  it('寄り道が立つ出撃では3つ置かれ、寄り道と同じ3セクター・部位ごとの距離', () => {
    const s = useGameStore.getState();
    if (!s.hospital) return; // 寄り道の無い出撃(テスト環境の既定ステージ次第)なら祠も無い
    expect(s.shrines.length).toBe(3);
    const detour = new Set([s.hospital, s.armory!, s.police!].map(p => poiSectorIndex(p)));
    for (const sh of s.shrines) {
      expect(detour.has(poiSectorIndex(sh))).toBe(true);
      expect(Math.hypot(sh.x, sh.y)).toBeCloseTo(SHRINE_DIST[sh.slot], 3);
    }
  });
  it('円に3秒で、その部位が武将装備になり祠は取った扱い。3つ揃うと武将セット', () => {
    useGameStore.setState({ shrines: [
      { slot: 'body', x: 9000, y: 0 }, { slot: 'arms', x: 0, y: 9000 }, { slot: 'accessory', x: -9000, y: 0 },
    ] });
    for (const slot of ['body', 'arms', 'accessory'] as const) {
      const sh = useGameStore.getState().shrines.find(x => x.slot === slot)!;
      const c = shrineCircleCenter(sh);
      at(c.x, c.y);
      step(SHRINE_DWELL_MS - 200);
      expect(useGameStore.getState().player.equipment[slot]).not.toBe(`special-${slot}`);
      step(400);
      expect(useGameStore.getState().player.equipment[slot]).toBe(`special-${slot}`);
      expect(useGameStore.getState().shrines.find(x => x.slot === slot)!.takenAt).toBeDefined();
    }
    expect(hasFullWarlordSet(useGameStore.getState().player.equipment)).toBe(true);
  });
  it('円を出ると溜めは0へ戻る。ボス戦中は進まない', () => {
    useGameStore.setState({ shrines: [{ slot: 'body', x: 9000, y: 0 }] });
    const c = shrineCircleCenter({ x: 9000, y: 0 });
    at(c.x, c.y); step(1500);
    at(c.x + 500, c.y); step(100);
    expect(useGameStore.getState().shrineDwell.ms).toBe(0);
    at(c.x, c.y);
    useGameStore.setState({ bossFightNow: true, bossFightLastTrueAt: 100000 });
    step(4000);
    expect(useGameStore.getState().player.equipment.body).not.toBe('special-body');
  });
});

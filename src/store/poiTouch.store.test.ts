// 社長指示2026-11-02「poi全部、オブジェクトの絵に下から触れると発動」(research/POI_TOUCH_SHRINE.md §1)。
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from './gameStore';
import { hospitalRect, hospitalCircleCenter } from '../world/hospital';
import { armoryRect, ARMORY_SCRAP_COST } from '../world/armory';

const pos = { x: 4000, y: 300 };
const putPlayerAt = (x: number, y: number) =>
  useGameStore.setState(s => ({ player: { ...s.player, x, y } }));
const belowOf = (r: { x: number; y: number; width: number; height: number }) => ({ x: r.x + r.width / 2 - 14, y: r.y + r.height });

beforeEach(() => {
  useGameStore.getState().resetGame('warrior');
  useGameStore.setState({ bossFightNow: false, bossFightLastTrueAt: -1e9, gameTime: 100000 });
});

describe('廃病院: 入口に触れた瞬間にワクチン(旧: 円に3秒)', () => {
  it('旧サークルの中に居ても触れていなければ何も起きない。触れた瞬間に入手', () => {
    useGameStore.setState({ hospital: pos, hospitalTaken: false });
    const c = hospitalCircleCenter(pos);
    putPlayerAt(c.x - 14, c.y - 14);
    for (let i = 0; i < 400; i++) useGameStore.getState().updateHospital(1 / 60);
    expect(useGameStore.getState().hospitalTaken).toBe(false);
    const b = belowOf(hospitalRect(pos));
    putPlayerAt(b.x, b.y);
    const v0 = useGameStore.getState().player.vaccineRevives;
    useGameStore.getState().updateHospital(1 / 60);
    expect(useGameStore.getState().hospitalTaken).toBe(true);
    expect(useGameStore.getState().player.vaccineRevives).toBe(v0 + 1);
  });
});

describe('武器庫: 入口に触れている間に取引', () => {
  it('スクラップが足りれば触れた瞬間に払って消える。足りなければ消えない', () => {
    useGameStore.setState({ armory: pos, armoryTaken: false });
    const b = belowOf(armoryRect(pos));
    useGameStore.setState(s => ({ player: { ...s.player, straps: 0 } }));
    putPlayerAt(b.x, b.y);
    useGameStore.getState().updateArmory(1 / 60);
    expect(useGameStore.getState().armoryTaken).toBe(false);
    useGameStore.setState(s => ({ player: { ...s.player, straps: ARMORY_SCRAP_COST + 5 } }));
    useGameStore.getState().updateArmory(1 / 60); // 触れ続けている間に足りるようになれば取引(触り直し不要)
    expect(useGameStore.getState().armoryTaken).toBe(true);
    expect(useGameStore.getState().player.straps).toBe(5);
  });
});

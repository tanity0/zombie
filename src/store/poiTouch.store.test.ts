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

// 社長の実機報告「つっかかりがゼロ」(2026-11-13): 触れ始めの瞬間に移動が全方向とも短く止まり、ease で元の速さへ戻る。位置は押し戻さない。
describe('POIに触れた瞬間のつっかえ(移動)', () => {
  const RIGHT = { up: false, down: false, left: false, right: true } as never;
  const DIAG = { up: true, down: false, left: true, right: false } as never;
  const open = () => useGameStore.setState({ hospital: null, armory: null, police: null, shrines: [] } as never);
  const walk = (input: never, frames: number) => { for (let i = 0; i < frames; i++) useGameStore.getState().movePlayer(input, 0.016); };

  it('触れた直後の数十msは横入力・斜め入力でもほぼ動かない(止まっている状態からは1pxも動かない)', () => {
    open();
    putPlayerAt(1000, 400);
    useGameStore.setState(s => ({ player: { ...s.player, vx: 0, vy: 0 } }));
    useGameStore.setState({ poiTouchLastAt: Date.now() - 5, poiTouchLastLight: false });
    walk(RIGHT, 3); // 約50ms
    expect(useGameStore.getState().player.x).toBe(1000);
    walk(DIAG, 2);
    const p = useGameStore.getState().player;
    expect(p.x).toBe(1000);
    expect(p.y).toBe(400);
  });

  it('歩いている最中に触れても、止めの間に速さがほぼ0まで抜ける', () => {
    open();
    putPlayerAt(1000, 400);
    walk(RIGHT, 20);
    const v0 = useGameStore.getState().player.vx;
    expect(v0).toBeGreaterThan(50);
    useGameStore.setState({ poiTouchLastAt: Date.now(), poiTouchLastLight: false });
    walk(RIGHT, 5); // 約80ms
    expect(Math.abs(useGameStore.getState().player.vx)).toBeLessThan(v0 * 0.1);
  });

  it('240ms後は元の速さで歩く(触れていない時と同じ)', () => {
    open();
    putPlayerAt(1000, 400);
    walk(RIGHT, 30);
    const base = useGameStore.getState().player.vx;
    putPlayerAt(1000, 400);
    useGameStore.setState(s => ({ player: { ...s.player, vx: 0, vy: 0 } }));
    useGameStore.setState({ poiTouchLastAt: Date.now() - 245, poiTouchLastLight: false });
    walk(RIGHT, 30);
    expect(useGameStore.getState().player.vx).toBeCloseTo(base, 3);
  });

  it('2回目以降(軽い版)は止めが半分: 70ms後には動き出している', () => {
    open();
    putPlayerAt(1000, 400);
    useGameStore.setState(s => ({ player: { ...s.player, vx: 0, vy: 0 } }));
    useGameStore.setState({ poiTouchLastAt: Date.now() - 70, poiTouchLastLight: true });
    walk(RIGHT, 2);
    expect(useGameStore.getState().player.x).toBeGreaterThan(1000);
  });

  it('firePoiTouch は発火時刻と軽い版かを記録する(位置は動かさない)', () => {
    useGameStore.setState({ hospital: pos, hospitalTaken: false });
    putPlayerAt(1000, 400);
    useGameStore.getState().firePoiTouch('hospital', { light: true });
    const s = useGameStore.getState();
    expect(s.poiTouchLastLight).toBe(true);
    expect(Date.now() - s.poiTouchLastAt).toBeLessThan(50);
    expect(s.player.x).toBe(1000);
    expect(s.player.y).toBe(400);
  });
});

// research/ESCORT_FOLLOW.md(拠点を開けた軍人が、その担当区域の中だけついてくる)の配線テスト。
// 純関数の値そのもの=utils/escortFollow.test.ts。ここは gameStore の護衛ブロックを実際に回して、
// 状態の優先順位・画面の内外で同じ動き・区域を出た時の見送りと帰り・倒れ中の除外・未解放の軍人の不変を確かめる。
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useGameStore } from './gameStore';
import { setTreesDisabled } from '../world/trees';
import { setTorchesDisabled } from '../world/torches';
import { FOLLOW_SEE_OFF_MS } from '../utils/escortFollow';
import type { EscortSoldier } from '../types/game';

const GT = 10_000_000;
const esc0 = (): EscortSoldier => useGameStore.getState().escorts[0];

let gt = GT;
const tick = (n = 1, dt = 1 / 60) => {
  for (let k = 0; k < n; k++) {
    gt += dt * 1000;
    useGameStore.getState().setGameTime(gt);
    useGameStore.getState().updateSuppression(dt);
  }
};
/** プレイヤーを (x,y)(中心)へ置き、カメラも中心に合わせる(軍人は画面内)。 */
const putPlayer = (x: number, y: number, cam = true) => useGameStore.setState(s => ({
  player: { ...s.player, x: x - s.player.width / 2, y: y - s.player.height / 2, vx: 0, vy: 0, lastDirection: { x: 1, y: 0 } },
  ...(cam ? { camera: { x: x - 215, y: y - 466 } } : {}),
}));

/** base-0(東・原点から4800px)を解放済み/未解放にし、軍人0を (ex,ey) に置く。プレイヤーは (px,py)。残り3人は遠くへ。 */
const setup = (o: { captured: boolean; ex: number; ey: number; px: number; py: number; over?: Partial<EscortSoldier>; cam?: boolean }) => {
  gt = GT;
  useGameStore.getState().resetGame('assault');
  useGameStore.setState(s => ({
    gameTime: GT, gameBounds: { width: 430, height: 932 }, viewZoom: 1,
    enemies: [], projectiles: [], pumpkinBlasts: [],
    player: { ...s.player, health: 9999, maxHealth: 120, // 120×0.6=72=軍人の最大体力(出撃中もプレイヤーに比例する)
      invulnerable: false, invulnerableTime: 0 },
    baseSites: s.baseSites.map(b => (b.id === 'base-0' ? { ...b, status: o.captured ? 'captured' : 'open' } : b)),
    escorts: s.escorts.map((e, i) => (i === 0
      ? { ...e, x: o.ex, y: o.ey, face: 1, health: 72, maxHealth: 72, ...o.over }
      : { ...e, x: 30_000 + i * 500, y: 30_000 })),
  }));
  putPlayer(o.px, o.py, o.cam ?? true);
};

beforeEach(() => { setTreesDisabled(true); setTorchesDisabled(true); });

describe('ついてくる(受け入れ条件1・8・11)', () => {
  it('東の拠点を解放済みで、プレイヤーが東の区域に居ると、軍人はついてきて後ろ斜めで止まる(止まったら止めコマ)', () => {
    setup({ captured: true, ex: 3000, ey: 200, px: 3500, py: 0 });
    tick(1);
    expect(esc0().followState).toBe('follow');
    tick(60 * 12);
    const e = esc0();
    expect(e.followState).toBe('follow');
    const dx = e.x - 3500, dy = e.y - (useGameStore.getState().player.y + useGameStore.getState().player.height);
    const d = Math.hypot(dx, dy);
    expect(d).toBeGreaterThan(55); expect(d).toBeLessThan(95);   // 個体の間隔(60〜90)の近く
    expect(dx).toBeLessThan(0);                                   // プレイヤーの向き(東)の後ろ側
    expect(e.moving).toBe(false);                                 // 止まったら歩行アニメも止まる
    expect(e.followSpeed ?? 0).toBe(0);
  });
  it('プレイヤーが動くと追い、プレイヤーを追い越さない', () => {
    setup({ captured: true, ex: 3300, ey: 0, px: 3500, py: 0 });
    tick(30);
    for (let k = 0; k < 600; k++) {
      const px = 3500 + k * 1.5; // 90px/s で東へ
      putPlayer(px, 0);
      tick(1);
      expect(esc0().x).toBeLessThan(px + 1);
    }
    expect(esc0().moving).toBe(true);
    expect(esc0().x).toBeGreaterThan(3500 + 600 * 1.5 - 250);
  });
  it('ついてき始めた時、並走の台詞を1回(解放の直後は出さない)', () => {
    for (const [capturedAt, expectCalls] of [[undefined, 1], [GT, 0]] as const) {
      setup({ captured: true, ex: 3000, ey: 0, px: 3500, py: 0, over: { capturedAt } });
      const spy = vi.fn(() => true);
      useGameStore.setState({ tryNpcLine: spy });
      tick(120);
      const companion = (spy.mock.calls as unknown as unknown[][]).filter(c => c[1] === 'companion');
      expect(companion.length).toBe(expectCalls);
      if (expectCalls) expect(companion[0][4]).toBe('escort-0');
    }
  });
});

describe('区域を出る(受け入れ条件2・9)', () => {
  it('プレイヤーが北の区域へ移ると、東の軍人は止まって0.6秒見送ってから拠点へ歩いて帰り、縁の巡回に戻る', () => {
    setup({ captured: true, ex: 3000, ey: 0, px: 3500, py: 0 });
    tick(60 * 6);
    const before = esc0();
    expect(before.followState).toBe('follow');
    putPlayer(0, -3500);           // 北の区域
    tick(1);
    expect(esc0().followState).toBe('return');
    const startX = esc0().x;
    // 見送りの間(0.6秒)に止まる
    tick(Math.round((FOLLOW_SEE_OFF_MS / 1000) * 60) - 2);
    const mid = esc0();
    expect(mid.followState).toBe('return');
    expect(mid.moving).toBe(false);
    expect(Math.abs(mid.x - startX)).toBeLessThan(40);   // 少し滑って止まっただけ
    // 見送りが明けたら拠点(東・x=4800)へ向かう
    const baseX = useGameStore.getState().baseSites[0].x;
    tick(60 * 3);
    expect(esc0().x).toBeGreaterThan(mid.x + 60);
    expect(esc0().moving).toBe(true);
    // 拠点の円に着いたら状態が消える
    tick(60 * 40);
    expect(esc0().followState).toBeUndefined();
    expect(Math.hypot(esc0().x - baseX, esc0().y - useGameStore.getState().baseSites[0].y)).toBeLessThan(200);
  });
  it('帰る途中でプレイヤーが区域へ戻ったら、またついてくる', () => {
    setup({ captured: true, ex: 3000, ey: 0, px: 3500, py: 0 });
    tick(60 * 4);
    putPlayer(0, -3500);
    tick(60 * 2);
    expect(esc0().followState).toBe('return');
    putPlayer(3600, 0);
    tick(2);
    expect(esc0().followState).toBe('follow');
  });
});

describe('対象外・優先順位(受け入れ条件4・5・6)', () => {
  it('スタート地点の近くでは、どの軍人もついてこない', () => {
    setup({ captured: true, ex: 600, ey: 0, px: 300, py: 0 });
    tick(120);
    expect(esc0().followState).not.toBe('follow'); // ついてこない(拠点の外に居るので拠点へ帰る=検収R2 A-1)
  });
  it('未解放の拠点の軍人は今までどおり拠点へ前進する(ついてこない)', () => {
    setup({ captured: false, ex: 3000, ey: 0, px: 3500, py: 0 });
    tick(120);
    expect(esc0().followState).toBeUndefined();
    expect(esc0().x).toBeGreaterThan(3000);   // 拠点(x=4800)へ前進
  });
  it('倒れている軍人はついてこない。起き上がったら区域の中なら またついてくる', () => {
    setup({ captured: true, ex: 3000, ey: 0, px: 3500, py: 0, over: { downedAt: GT, health: 0 } });
    tick(120);
    expect(esc0().followState).toBeUndefined();
    expect(esc0().x).toBeLessThan(3010);
    // プレイヤーが起こす(半径内に2秒)
    putPlayer(esc0().x + 20, esc0().y - 14);
    tick(60 * 3);
    expect(esc0().downedAt).toBeUndefined();
    tick(60 * 2);
    expect(esc0().followState).toBe('follow');
  });
  it('ウェルカムの待機中はついてこない(待機が優先)', () => {
    setup({ captured: true, ex: 3000, ey: 0, px: 3500, py: 0 });
    useGameStore.setState({ activeEvent: { kind: 'welcome' } as never });
    const x0 = esc0().x;
    tick(120);
    expect(esc0().followState).toBeUndefined();
    expect(esc0().x).toBe(x0);
  });
});

describe('画面の内外で同じ速さ(受け入れ条件8)', () => {
  it('同じ状況なら、画面内でも画面外でも同じ位置・同じ速さで動く(escortOffscreenStep の1/5は使わない)', () => {
    const run = (visible: boolean) => {
      setup({ captured: true, ex: 3000, ey: 0, px: 3500, py: 0, cam: false });
      // 軍人がカメラに入る/入らない: カメラをプレイヤー周りに置く(軍人は500px離れた所)か、遠くへ置く
      useGameStore.setState({ camera: visible ? { x: 3250 - 215, y: -466 } : { x: -40000, y: -40000 } });
      tick(60 * 3);
      return { x: esc0().x, y: esc0().y, sp: esc0().followSpeed };
    };
    const a = run(true), b = run(false);
    expect(b.x).toBeCloseTo(a.x, 6);
    expect(b.y).toBeCloseTo(a.y, 6);
    expect(a.x).toBeGreaterThan(3000 + 100); // 3秒で十分に進んだ(1/5の速さではない)
  });
});

describe('回復(受け入れ条件10)', () => {
  it('ついてくる間、直近の被弾から8秒たつまで回復せず、それ以降ゆっくり戻る。帰る間は回復しない', () => {
    setup({ captured: true, ex: 3430, ey: 0, px: 3500, py: 0, over: { health: 30, maxHealth: 72, lastHitAt: GT } });
    tick(60 * 7);
    expect(esc0().health).toBe(30);
    tick(60 * 3);
    expect(esc0().health).toBeGreaterThan(30);
    const h = esc0().health!;
    expect(h).toBeLessThan(30 + 72 * 0.03 * 3.1);
    putPlayer(0, -3500);
    tick(60 * 2);
    expect(esc0().followState).toBe('return');
    expect(esc0().health).toBeCloseTo(h, 6);
  });
});

describe('被弾の滑りを跨いでも、ついてくる/帰るは続く(検収R2 A-1/A-2)', () => {
  it('ついてくる最中に1発もらっても、滑りの後もついてくる・「ついてき始めた」台詞は出ない', () => {
    setup({ captured: true, ex: 3000, ey: 200, px: 3500, py: 0 });
    tick(60);
    expect(esc0().followState).toBe('follow');
    useGameStore.setState({ npcDialogueQueue: [], npcSpokeAt: {}, npcCatAt: {} });
    useGameStore.getState().damageEscort(esc0().id, 1, esc0().x + 30, esc0().y);
    tick(40); // 滑り(約300ms)を跨ぐ
    expect(esc0().followState).toBe('follow');
    expect(useGameStore.getState().npcDialogueQueue.length).toBe(0);
  });
});

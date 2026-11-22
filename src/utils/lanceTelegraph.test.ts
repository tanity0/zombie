// research/TELEGRAPH_FIXES.md E03: ジブリルのランスの帯の進行は、毎フレーム今の位置から引き直した
// 残り時間(lanceRemainingMs)で決まり、発射の tick より前は <1・単調・発射の tick で 1(光条の枝の最後のコマ)。
// sim の lance 州の動き(旋回・縁で止まる・発射条件)を同じ規則で回し、描画側の進行の式を当てる。
import { describe, it, expect } from 'vitest';
import { lanceRemainingMs } from './angelBossTick';
import { ANGEL_JIBRIL_TUNING as JB_T } from './angelScript';

const R = 300; // GATE_ARENA_RADIUS(angelBossTick と同値)
const DT = 1000 / 60;

type Lantern = { x: number; y: number; dir: number; bornAt: number; firedAt?: number };

/** sim(tickJibril の lance 州)の1本ぶんを回し、描画側の進行(単調化つき)を毎フレーム記録する。 */
const run = (opts: {
  x0: number; y0: number; dir: number; target: (t: number) => { x: number; y: number };
  stateUntil: number; bornAt?: number;
}) => {
  const home = { x: 0, y: 0 };
  const L: Lantern = { x: opts.x0, y: opts.y0, dir: opts.dir, bornAt: opts.bornAt ?? 0 };
  const progs: number[] = [];
  let pmax = 0;
  for (let t = L.bornAt + DT; t < L.bornAt + 20000; t += DT) {
    // --- sim ---
    const capHit = t >= opts.stateUntil;
    const tg = opts.target(t);
    let dAng = Math.atan2(tg.y - L.y, tg.x - L.x) - L.dir;
    while (dAng > Math.PI) dAng -= Math.PI * 2;
    while (dAng < -Math.PI) dAng += Math.PI * 2;
    const maxTurn = JB_T.lance.turnRate * (DT / 1000);
    L.dir += Math.max(-maxTurn, Math.min(maxTurn, dAng));
    let nx = L.x + Math.cos(L.dir) * JB_T.lance.lanternSpeed * (DT / 1000);
    let ny = L.y + Math.sin(L.dir) * JB_T.lance.lanternSpeed * (DT / 1000);
    const rd = Math.hypot(nx, ny);
    const atRim = rd >= R;
    if (atRim) { nx = (nx / rd) * R; ny = (ny / rd) * R; }
    L.x = nx; L.y = ny;
    if ((atRim && t - L.bornAt >= JB_T.lance.minWindup) || capHit) { L.firedAt = t; break; }
    // --- 描画(飛行中のフレーム) ---
    const el = t - L.bornAt;
    const left = lanceRemainingMs(L, home, t, opts.stateUntil);
    const raw = el + left > 0 ? el / (el + left) : 1;
    pmax = Math.max(pmax, Math.min(1, Math.max(0, raw)));
    progs.push(pmax);
  }
  // 発射の tick は光条の枝で prog=1 を1回描く(pixiScene の lanceProgMax の控え)。
  if (L.firedAt !== undefined) progs.push(1);
  return { progs, fired: L.firedAt !== undefined };
};

const assertMeteor = (r: { progs: number[]; fired: boolean }) => {
  expect(r.fired).toBe(true);
  const before = r.progs.slice(0, -1);
  for (const p of before) expect(p).toBeLessThan(1);
  for (let i = 1; i < r.progs.length; i++) expect(r.progs[i]).toBeGreaterThanOrEqual(r.progs[i - 1]);
  expect(r.progs[r.progs.length - 1]).toBe(1);
};

describe('E03 ランスの帯の進行(lanceRemainingMs)', () => {
  it('直進: 縁に着いて撃つ tick で1、それより前は<1・単調', () => {
    assertMeteor(run({ x0: 0, y0: 0, dir: 0, target: () => ({ x: 1000, y: 0 }), stateUntil: 8000 }));
  });
  it('旋回: プレイヤーへ曲がり続けても、消え切る前に撃たない', () => {
    assertMeteor(run({ x0: 0, y0: 0, dir: 0, target: (t) => ({ x: 200 * Math.cos(t / 400), y: 200 * Math.sin(t / 400) }), stateUntil: 8000 }));
  });
  it('縁を滑る: 縁に着いても minWindup 前は撃たない間も<1', () => {
    assertMeteor(run({ x0: 290, y0: 0, dir: 0, target: () => ({ x: 0, y: 1000 }), stateUntil: 8000 }));
  });
  it('capHit(安全上限での一斉発射): 州の上限で1', () => {
    // 内側をぐるぐる回り縁に着かない → 上限で撃つ。
    assertMeteor(run({ x0: 0, y0: 0, dir: 0, target: (t) => ({ x: 60 * Math.cos(t / 120), y: 60 * Math.sin(t / 120) }), stateUntil: 1500 }));
  });
  it('縁に居れば距離0=残りは minWindup の残りか州の上限だけ', () => {
    const L = { x: R, y: 0, dir: Math.PI, bornAt: 0 };
    expect(lanceRemainingMs(L, { x: 0, y: 0 }, 100, 8000)).toBeCloseTo(JB_T.lance.minWindup - 100, 6);
    expect(lanceRemainingMs(L, { x: 0, y: 0 }, 1000, 8000)).toBe(0);
    expect(lanceRemainingMs({ x: 0, y: 0, dir: 0, bornAt: 0 }, { x: 0, y: 0 }, 500, 600)).toBe(100);
  });
});

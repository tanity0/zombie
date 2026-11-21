import { describe, expect, it } from 'vitest';
import {
  INTRO_TUNNEL_END_MS, INTRO_TUNNEL_INTERVAL_MS, INTRO_TUNNEL_LIFE_MS, INTRO_TUNNEL_MASTER_IN_MS,
  INTRO_TUNNEL_MAX_COPIES, INTRO_TUNNEL_MAX_SCALE, INTRO_TUNNEL_SPAWNS, INTRO_TUNNEL_SPAWN_END_MS,
  introTunnelCopies, introTunnelPose,
} from './introFrameTunnel';
import { PLAYER_INTRO_HELI_MS, PLAYER_INTRO_MS } from '../store/gameStore';

const aliveAt = (ms: number) => INTRO_TUNNEL_SPAWNS.filter(s => s.at <= ms && ms - s.at < s.life).length;

describe('枠のトンネル(登場のヘリ飛来の間)', () => {
  it('1枚は長く(約0.8秒)、発生は間引いて(約0.25秒ごと)、等間隔に流れる', () => {
    expect(INTRO_TUNNEL_LIFE_MS).toBeGreaterThanOrEqual(700);
    expect(INTRO_TUNNEL_LIFE_MS).toBeLessThanOrEqual(900);
    expect(INTRO_TUNNEL_INTERVAL_MS).toBeGreaterThanOrEqual(220);
    expect(INTRO_TUNNEL_INTERVAL_MS).toBeLessThanOrEqual(300);
    const gaps = INTRO_TUNNEL_SPAWNS.slice(1).map((s, i) => s.at - INTRO_TUNNEL_SPAWNS[i].at);
    for (const g of gaps) expect(g).toBe(INTRO_TUNNEL_INTERVAL_MS);
    for (const s of INTRO_TUNNEL_SPAWNS) expect(s.life).toBe(INTRO_TUNNEL_LIFE_MS);
  });
  it('発生している間は常に2〜3枚が重なっている(途切れない)', () => {
    for (let ms = 0; ms < INTRO_TUNNEL_SPAWN_END_MS; ms += 5) {
      const n = aliveAt(ms);
      expect(n).toBeGreaterThanOrEqual(2);
      expect(n).toBeLessThanOrEqual(3);
      expect(introTunnelCopies(ms).length).toBe(n);
    }
  });
  it('同時に生きている複製は上限以内(プールが足りる)', () => {
    for (let ms = -1000; ms < INTRO_TUNNEL_END_MS + 100; ms += 5) expect(aliveAt(ms)).toBeLessThanOrEqual(INTRO_TUNNEL_MAX_COPIES);
  });
  it('着地が近づいたら発生を止め、最後の1枚が抜け切って終わる(登場演出の中で)', () => {
    const last = INTRO_TUNNEL_SPAWNS[INTRO_TUNNEL_SPAWNS.length - 1];
    expect(last.at).toBeLessThan(INTRO_TUNNEL_SPAWN_END_MS);
    expect(INTRO_TUNNEL_SPAWN_END_MS).toBeLessThan(PLAYER_INTRO_HELI_MS);
    expect(INTRO_TUNNEL_END_MS).toBe(last.at + last.life);
    expect(INTRO_TUNNEL_END_MS).toBeLessThan(PLAYER_INTRO_MS);
    expect(introTunnelCopies(INTRO_TUNNEL_END_MS)).toEqual([]);
    expect(introTunnelCopies(-1)).toEqual([]);
    // 収束: 発生停止の後、枚数は減る一方
    let prev = Infinity;
    for (let ms = INTRO_TUNNEL_SPAWN_END_MS; ms < INTRO_TUNNEL_END_MS; ms += 5) { const n = aliveAt(ms); expect(n).toBeLessThanOrEqual(prev); prev = n; }
  });
  it('拡大は単調に増え、加速する(遠近: 近づくほど速い)。1→画面の外へ抜ける倍率まで', () => {
    expect(introTunnelPose(0).scale).toBe(1);
    expect(introTunnelPose(1).scale).toBeCloseTo(INTRO_TUNNEL_MAX_SCALE, 9);
    expect(INTRO_TUNNEL_MAX_SCALE).toBeGreaterThanOrEqual(4);
    const sc = (u: number) => introTunnelPose(u).scale;
    let prevS = 0; let prevD = 0;
    for (let i = 1; i <= 100; i++) {
      const s = sc(i / 100);
      const d = s - sc((i - 1) / 100);
      expect(s).toBeGreaterThan(prevS);
      expect(d).toBeGreaterThan(prevD); // 増分が毎段増える=加速
      prevS = s; prevD = d;
    }
    expect(sc(0.5)).toBeLessThan(2); // 前半はゆっくり
  });
  it('濃さはゆっくり入り(パッと出さない)、途中で落ちず、最後だけ消える', () => {
    const a = (u: number) => introTunnelPose(u).alpha;
    expect(a(0)).toBe(0);
    expect(a(1)).toBe(0);
    expect(a(0.05)).toBeLessThan(0.15); // ゆっくり入る
    for (let i = 1; i <= 100; i++) {
      const u = i / 100;
      if (u <= 0.3) expect(a(u)).toBeGreaterThanOrEqual(a(u - 0.01)); // 入りは単調に増える
      else if (u <= 0.84) expect(a(u)).toBeCloseTo(a(0.3), 9); // 抜ける直前まで保つ
      else expect(a(u)).toBeLessThanOrEqual(a(u - 0.01)); // 最後だけ消す
    }
    expect(a(0.6)).toBeGreaterThan(0.9);
    // 保っている間に上下の岩が画面の外へ抜ける(最終の半分を超える拡大まで濃いまま)
    expect(introTunnelPose(0.84).scale).toBeGreaterThan(INTRO_TUNNEL_MAX_SCALE * 0.5);
  });
  it('頭でパッと出さない(全体の入り)、入った後は常にどれか1枚は濃い', () => {
    expect(Math.max(0, ...introTunnelCopies(0).map(c => c.alpha))).toBe(0);
    for (let ms = INTRO_TUNNEL_MASTER_IN_MS; ms < INTRO_TUNNEL_SPAWN_END_MS; ms += 5) {
      expect(Math.max(...introTunnelCopies(ms).map(c => c.alpha))).toBeGreaterThan(0.6);
    }
  });
  it('返す順は新しい順(小さい=奥が先)', () => {
    const c = introTunnelCopies(600);
    expect(c.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < c.length; i++) expect(c[i].scale).toBeGreaterThan(c[i - 1].scale);
  });
});

describe('枠のトンネル: ズームしつつ左右に開く', () => {
  it('開く量は0から1へ、加減速つきで単調に増える', () => {
    expect(introTunnelPose(0).open).toBe(0);
    expect(introTunnelPose(1).open).toBe(1);
    let prev = -1;
    for (let u = 0; u <= 1.0001; u += 0.05) { const o = introTunnelPose(u).open; expect(o).toBeGreaterThanOrEqual(prev); prev = o; }
    expect(introTunnelPose(0.05).open).toBeLessThan(0.05); // 動き始めはゆっくり
  });
  it('内側の縁(拡大後の幅×(1−開く量))は後半で外へ引いていき、最後は画面の外', () => {
    const inner = (u: number) => { const p = introTunnelPose(u); return p.scale * (1 - p.open); };
    expect(inner(1)).toBeCloseTo(0, 6);
    for (let u = 0.5; u < 1; u += 0.05) expect(inner(u + 0.05)).toBeLessThan(inner(u));
  });
});

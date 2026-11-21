import { describe, expect, it } from 'vitest';
import {
  INTRO_TUNNEL_END_MS, INTRO_TUNNEL_MAX_COPIES, INTRO_TUNNEL_SPAWNS, INTRO_TUNNEL_SPAWN_END_MS,
  introTunnelCopies, introTunnelPose,
} from './introFrameTunnel';
import { PLAYER_INTRO_HELI_MS, PLAYER_INTRO_MS } from '../store/gameStore';

describe('枠のトンネル(登場のヘリ飛来の間)', () => {
  it('序盤は高速で繰り返し、ヘリが着く頃に間隔を広げて収束する', () => {
    const gaps = INTRO_TUNNEL_SPAWNS.slice(1).map((s, i) => s.at - INTRO_TUNNEL_SPAWNS[i].at);
    expect(gaps[0]).toBeLessThanOrEqual(150);
    for (let i = 1; i < gaps.length; i++) expect(gaps[i]).toBeGreaterThanOrEqual(gaps[i - 1] - 1e-9);
    expect(gaps[gaps.length - 1]).toBeGreaterThan(gaps[0] * 2);
    expect(INTRO_TUNNEL_SPAWNS.length).toBeGreaterThanOrEqual(12);
  });
  it('新しい複製はヘリの着地より前で止まり、最後の1枚も登場演出の中で消え切る', () => {
    expect(INTRO_TUNNEL_SPAWNS[INTRO_TUNNEL_SPAWNS.length - 1].at).toBeLessThan(PLAYER_INTRO_HELI_MS);
    expect(INTRO_TUNNEL_SPAWN_END_MS).toBeLessThanOrEqual(PLAYER_INTRO_HELI_MS);
    expect(INTRO_TUNNEL_END_MS).toBeLessThan(PLAYER_INTRO_MS);
    expect(introTunnelCopies(INTRO_TUNNEL_END_MS)).toEqual([]);
    expect(introTunnelCopies(-1)).toEqual([]);
  });
  it('同時に生きている複製は上限以内(プールが足りる)', () => {
    for (let ms = 0; ms < INTRO_TUNNEL_END_MS; ms += 5) {
      const alive = INTRO_TUNNEL_SPAWNS.filter(s => s.at <= ms && ms - s.at < s.life).length;
      expect(alive).toBeLessThanOrEqual(INTRO_TUNNEL_MAX_COPIES);
    }
  });
  it('1枚は濃さ0から出て(パッと出さない)、加速しながら拡大し、消え切る', () => {
    expect(introTunnelPose(0, 2.8).alpha).toBe(0);
    expect(introTunnelPose(0, 2.8).scale).toBe(1);
    expect(introTunnelPose(1, 2.8).alpha).toBe(0);
    expect(introTunnelPose(1, 2.8).scale).toBeCloseTo(2.8, 9);
    const sc = (u: number) => introTunnelPose(u, 2.8).scale;
    expect(sc(0.9) - sc(0.8)).toBeGreaterThan(sc(0.2) - sc(0.1)); // 加速
    expect(Math.max(...[0.05, 0.1, 0.15, 0.2].map(u => introTunnelPose(u, 2.8).alpha))).toBeGreaterThan(0.6);
  });
  it('返す順は新しい順(小さい=奥が先)', () => {
    const c = introTunnelCopies(600);
    expect(c.length).toBeGreaterThan(2);
    for (let i = 1; i < c.length; i++) expect(c[i].scale).toBeGreaterThanOrEqual(c[i - 1].scale);
  });
});

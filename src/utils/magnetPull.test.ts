import { describe, it, expect } from 'vitest';
import { stepMagnetPull, magnetPullSpeedAt, MAGNET_PULL_EDGE_SPEED, MAGNET_PULL_CORE_SPEED } from './magnetPull';
import type { Pickup } from '../types/game';

const pk = (id: string, type: Pickup['type'], x: number, y: number, extra: Partial<Pickup> = {}): Pickup =>
  ({ id, type, x, y, value: 1, ...extra } as Pickup);
// 自機の中心 (0,0)。拾い物の中心=x+8,y+8 なので x=dist-8,y=-8 → 中心(dist,0)=距離 dist。
const at = (id: string, type: Pickup['type'], dist: number, extra: Partial<Pickup> = {}) => pk(id, type, dist - 8, -8, extra);

describe('マグネットの吸い寄せ(utils/magnetPull・社長裁定2026-09-13 案A)', () => {
  it('半径内の弾薬は自機へ近づき、行き過ぎない', () => {
    const r = stepMagnetPull([at('a', 'ammo-rifle', 100)], 0, 0, 130, false, 0.1, 0);
    expect(r.moved).toBe(true);
    const cx = r.pickups[0].x + 8;
    expect(cx).toBeLessThan(100);
    expect(cx).toBeGreaterThan(0);
    const r2 = stepMagnetPull([at('a', 'ammo-rifle', 100)], 0, 0, 130, false, 10, 0);
    expect(r2.pickups[0].x + 8).toBeCloseTo(0, 5);
  });
  it('半径の外は動かない(参照もそのまま)', () => {
    const list = [at('a', 'ammo-rifle', 200)];
    const r = stepMagnetPull(list, 0, 0, 130, false, 0.1, 0);
    expect(r.moved).toBe(false);
    expect(r.pickups).toBe(list);
  });
  it('箱・任務品・守護霊の私物・投擲中の物は半径内でも動かない', () => {
    const list = [
      at('crate', 'weapon-crate', 50), at('chest', 'chest', 50), at('gold', 'bounty-chest', 50), at('key', 'card-key', 50),
      at('ghost', 'ammo-rifle', 50, { ownerGhostId: 'g1' } as Partial<Pickup>),
      at('fly', 'strap', 50, { throwStartAt: 0, throwDuration: 500 }),
    ];
    const r = stepMagnetPull(list, 0, 0, 130, true, 0.1, 100);
    expect(r.moved).toBe(false);
  });
  it('経験値・回復は覚醒(Lv3)の時だけ動く。コインは常に動く', () => {
    const list = [at('xp', 'experience', 60), at('hp', 'health', 60), at('coin', 'strap', 60)];
    const noAwaken = stepMagnetPull(list, 0, 0, 130, false, 0.1, 0);
    expect(noAwaken.pickups.find(p => p.id === 'xp')!.x).toBe(list[0].x);
    expect(noAwaken.pickups.find(p => p.id === 'hp')!.x).toBe(list[1].x);
    expect(noAwaken.pickups.find(p => p.id === 'coin')!.x).not.toBe(list[2].x);
    const awaken = stepMagnetPull(list, 0, 0, 130, true, 0.1, 0);
    expect(awaken.pickups.find(p => p.id === 'xp')!.x).not.toBe(list[0].x);
    expect(awaken.pickups.find(p => p.id === 'hp')!.x).not.toBe(list[1].x);
  });
  it('慣性: 縁では遅く、近づくほど速い(単調増加・端の値は定数どおり)', () => {
    expect(magnetPullSpeedAt(130, 130)).toBeCloseTo(MAGNET_PULL_EDGE_SPEED);
    expect(magnetPullSpeedAt(0, 130)).toBeCloseTo(MAGNET_PULL_CORE_SPEED);
    let prev = magnetPullSpeedAt(130, 130);
    for (let d = 120; d >= 0; d -= 10) { const v = magnetPullSpeedAt(d, 130); expect(v).toBeGreaterThan(prev); prev = v; }
  });
  it('半径0(未取得)は何もしない', () => {
    const list = [at('a', 'ammo-rifle', 10)];
    expect(stepMagnetPull(list, 0, 0, 0, false, 0.1, 0).moved).toBe(false);
  });
});

import { describe, it, expect } from 'vitest';
import type { Enemy } from '../types/game';
import { pickKatanaSlashTarget } from './katanaAuto';

// 刀のオート斬撃の標的選択(プレイヤー/守護霊で共有)。
// 距離関数は注入(本番は gameStore.enemyMeleeDist=裏ボスは帯AABBの最近点)なので、
// ここでは中心間距離のテスト用実装を渡す。
const centerDist = (px: number, py: number, e: Enemy): number =>
  Math.hypot(e.x + e.width / 2 - px, e.y + e.height / 2 - py);

const mob = (id: string, x: number, over: Partial<Enemy> = {}): Enemy => ({
  id, type: 'zombie', x, y: 0, width: 10, height: 10,
  health: 10, maxHealth: 10, speed: 10, damage: 1, experienceValue: 1,
  ...over,
} as unknown as Enemy);

describe('pickKatanaSlashTarget', () => {
  it('射程内で最も近い敵を選ぶ', () => {
    const target = pickKatanaSlashTarget(0, 5, 80, [mob('far', 60), mob('near', 20)], 0, centerDist);
    expect(target).toBe('near');
  });

  it('射程外(リーチ超え)は選ばない', () => {
    expect(pickKatanaSlashTarget(0, 5, 80, [mob('out', 200)], 0, centerDist)).toBeNull();
    expect(pickKatanaSlashTarget(0, 5, 80, [], 0, centerDist)).toBeNull();
  });

  it('スタン中の敵は後回し(自動射撃と同じ優先順位=一閃のフィニッシュ余地を残す)', () => {
    const enemies = [mob('stunned', 10, { stunUntil: 5000 }), mob('awake', 50)];
    expect(pickKatanaSlashTarget(0, 5, 80, enemies, 1000, centerDist)).toBe('awake');
    // 非スタンが射程内に居なければ最後の手段としてスタン敵を選ぶ
    expect(pickKatanaSlashTarget(0, 5, 80, [enemies[0]], 1000, centerDist)).toBe('stunned');
    // スタンが切れていれば通常扱い(近い方が勝つ)
    expect(pickKatanaSlashTarget(0, 5, 80, enemies, 6000, centerDist)).toBe('stunned');
  });

  it('通常リーパー(不倒)は対象外・チェイサーは対象', () => {
    expect(pickKatanaSlashTarget(0, 5, 80, [mob('r', 10, { type: 'reaper' })], 0, centerDist)).toBeNull();
    expect(pickKatanaSlashTarget(0, 5, 80, [mob('rc', 10, { type: 'reaper', reaperChaser: true })], 0, centerDist)).toBe('rc');
  });

  it('リーチが伸びる(刀Lv)ほど遠い敵まで拾える=Lv別リーチが効く形になっている', () => {
    const enemies = [mob('e', 95)];
    expect(pickKatanaSlashTarget(0, 5, 76, enemies, 0, centerDist)).toBeNull();  // Lv1=76
    expect(pickKatanaSlashTarget(0, 5, 110, enemies, 0, centerDist)).toBe('e');  // Lv3=110
  });
});

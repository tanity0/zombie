// ボス交戦判定の不変条件(社長裁定v0.25.2412)。ここが崩れると「ボス戦なのに雑魚が湧く」
// または「ボスが居ないのに常時リラックス=ペーシング設計が丸ごと死ぬ」のどちらかになる。
import { describe, it, expect } from 'vitest';
import { bossEngagedNow, isEngageableBoss } from './bossEngagement';
import type { Enemy, EnemyType } from '../types/game';

const foe = (type: EnemyType, over: Partial<Enemy> = {}): Enemy => ({
  id: `e-${type}-${over.id ?? ''}`, type, x: 0, y: 0, width: 32, height: 32,
  health: 100, maxHealth: 100, speed: 50, damage: 10, lastShot: 0, lastHit: 0,
  ...over,
} as Enemy);

describe('bossEngagement', () => {
  it('待機中(dormant)の城ボスは交戦中ではない', () => {
    // 城ボスは出現直後は城で待機する。近づく前から湧きを落としたら、到達前の道中が丸ごと緩くなる。
    expect(bossEngagedNow([foe('giantbat', { dormant: true })])).toBe(false);
  });

  it('起きた城ボスは交戦中(=これが「交戦をはじめた」の信号)', () => {
    expect(bossEngagedNow([foe('giantbat', { dormant: false })])).toBe(true);
    expect(bossEngagedNow([foe('giantbat')])).toBe(true); // dormant 未設定=起きている
  });

  it('裏ボス・ゲート2ボス・idol も交戦中として扱う(社長裁定③「全ボスで」)', () => {
    for (const t of ['mimir', 'jormungand', 'skadi', 'thor',
      'miguel', 'jibril', 'rafi', 'uri', 'suriel', 'acrasiel', 'idol'] as EnemyType[]) {
      expect(bossEngagedNow([foe(t)])).toBe(true);
    }
  });

  // ★ここが一番大事。死神は「ボス戦」ではなく深層の追跡ギミックで、居る時間が長い。
  // 対象に入れると深層の湧きが常時リラックスへ落ちてペーシング設計(§6.27)が壊れる。
  it('死神とハンターは対象外(isBossType を流用してはいけない)', () => {
    expect(isEngageableBoss('reaper')).toBe(false);
    expect(isEngageableBoss('hunter')).toBe(false);
    expect(bossEngagedNow([foe('reaper'), foe('hunter')])).toBe(false);
  });

  it('雑魚だけの盤面は交戦中ではない', () => {
    expect(bossEngagedNow([foe('zombie'), foe('bat'), foe('skeleton'), foe('plant')])).toBe(false);
    expect(bossEngagedNow([])).toBe(false);
  });

  it('雑魚に混ざっていてもボスが1体起きていれば交戦中', () => {
    expect(bossEngagedNow([foe('zombie'), foe('thor'), foe('bat')])).toBe(true);
  });
});

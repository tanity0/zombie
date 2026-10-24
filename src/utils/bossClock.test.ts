// v0.25.2577(社長裁定「現状維持でいいんだけど、ボスごとのタイムにはしたいな」): 撃破タイムの
// ボスごと交戦時計。起点=交戦開始(定義は従来どおり)・時計だけスロット単位。
import { describe, it, expect, beforeEach } from 'vitest';
import { tickBossClocks, bossClockDurationMs, closeBossClock, resetBossClocks } from './bossClock';
import { bossEngagementDistancePx, engagedBossSlotKeys } from './bossEngagement';
import type { Enemy, EnemyType } from '../types/game';

beforeEach(() => resetBossClocks());

const keys = (...k: string[]): ReadonlySet<string> => new Set(k);

describe('bossClock: ボスごとの交戦時計', () => {
  it('交戦開始で時計が開き、tickごとに撃破タイムが伸びる', () => {
    tickBossClocks(keys('thor'), 1_000);
    tickBossClocks(keys('thor'), 46_000);
    expect(bossClockDurationMs('thor')).toBe(45_000);
  });

  it('連戦: 後から交戦に入ったボスは自分の交戦開始から数える(旧: 1体目の開始から数える欠陥)', () => {
    tickBossClocks(keys('mimir'), 0);
    tickBossClocks(keys('mimir', 'thor'), 60_000); // 60秒後にthorが乱入(交戦は途切れない)
    tickBossClocks(keys('mimir', 'thor'), 70_000);
    expect(bossClockDurationMs('mimir')).toBe(70_000); // 1体目は自分の開始から
    expect(bossClockDurationMs('thor')).toBe(10_000);  // 2体目も**自分の**開始から(旧実装なら70_000)
  });

  it('交戦解除(キー集合から消えた)で時計は閉じ、再交戦は新しい開始から', () => {
    tickBossClocks(keys('thor'), 0);
    tickBossClocks(keys(), 30_000); // 離脱
    expect(bossClockDurationMs('thor')).toBeNull();
    tickBossClocks(keys('thor'), 100_000);
    tickBossClocks(keys('thor'), 110_000);
    expect(bossClockDurationMs('thor')).toBe(10_000);
  });

  it('closeBossClock: 明示的に閉じられる(同行台帳の打刻後dedup用)', () => {
    tickBossClocks(keys('thor'), 0);
    closeBossClock('thor');
    expect(bossClockDurationMs('thor')).toBeNull();
  });

  it('resetBossClocks: 全時計を捨てる(ラン境界)', () => {
    tickBossClocks(keys('thor', 'mimir'), 0);
    resetBossClocks();
    expect(bossClockDurationMs('thor')).toBeNull();
    expect(bossClockDurationMs('mimir')).toBeNull();
  });
});

// ---- engagedBossSlotKeys(bossEngagement.ts): スロット単位の交戦判定 -----------------------------
const mkBoss = (type: EnemyType, x: number, over: Partial<Enemy> = {}): Enemy => ({
  id: `e-${type}-${x}`, x, y: 0, width: 40, height: 40, speed: 0,
  health: 100, maxHealth: 100, damage: 10, type, experienceValue: 0,
  lastHit: 0, lastShot: 0,
  ...over,
} as unknown as Enemy);

const slotKeyOf = (t: EnemyType): string => String(t);

describe('engagedBossSlotKeys: ボスごとENTER/EXITヒステリシス', () => {
  it('ズーム換算後のENTER以内で交戦・以遠は非交戦', () => {
    const near = mkBoss('thor', bossEngagementDistancePx('thor', false) - 100);
    const far = mkBoss('mimir', bossEngagementDistancePx('mimir', false) + 200);
    const got = engagedBossSlotKeys([near, far], 0, 20, new Set(), slotKeyOf);
    expect(got.has('thor')).toBe(true);
    expect(got.has('mimir')).toBe(false);
  });

  it('ヒステリシス: 交戦中(prevに在る)のボスだけズーム換算後のEXITまで交戦が続く', () => {
    const between = mkBoss('thor', (bossEngagementDistancePx('thor', false) + bossEngagementDistancePx('thor', true)) / 2);
    expect(engagedBossSlotKeys([between], 0, 20, new Set(), slotKeyOf).has('thor')).toBe(false);
    expect(engagedBossSlotKeys([between], 0, 20, new Set(['thor']), slotKeyOf).has('thor')).toBe(true);
  });

  it('待機中(dormant)と非交戦対象(雑魚)は数えない', () => {
    const sleeping = mkBoss('giantbat', 100, { dormant: true });
    const mob = mkBoss('zombie', 100);
    expect(engagedBossSlotKeys([sleeping, mob], 0, 20, new Set(), slotKeyOf).size).toBe(0);
  });
});

import { describe, it, expect } from 'vitest';
import {
  acrasielPhaseForHealth, acrasielSpikeGapCount, pickSpikeGapMask, isSpikeGapSector,
  pickAcrasielMove, pickAcrasielCombo, ACRASIEL_SECTOR_COUNT, planAcrasielPattern,
} from './acrasielScript';

describe('acrasielPhaseForHealth (§6.28-19: 60%/30%の3段)', () => {
  it('phase transitions at the documented thresholds', () => {
    expect(acrasielPhaseForHealth(1)).toBe(1);
    expect(acrasielPhaseForHealth(0.6)).toBe(2);
    expect(acrasielPhaseForHealth(0.3)).toBe(3);
    expect(acrasielPhaseForHealth(0)).toBe(3);
  });
});

describe('acrasielSpikeGapCount', () => {
  it('2 gaps in phase1, 1 gap from phase2 onward', () => {
    expect(acrasielSpikeGapCount(1)).toBe(2);
    expect(acrasielSpikeGapCount(2)).toBe(1);
    expect(acrasielSpikeGapCount(3)).toBe(1);
  });
});

describe('pickSpikeGapMask / isSpikeGapSector', () => {
  it('selects the requested number of distinct sectors', () => {
    const mask = pickSpikeGapMask(2, () => 0);
    let count = 0;
    for (let i = 0; i < ACRASIEL_SECTOR_COUNT; i++) if (isSpikeGapSector(mask, i)) count++;
    expect(count).toBe(2);
  });
  it('is deterministic given an injected rand', () => {
    const a = pickSpikeGapMask(1, () => 0);
    const b = pickSpikeGapMask(1, () => 0);
    expect(a).toBe(b);
  });
  it('clamps gapCount to the sector count', () => {
    const mask = pickSpikeGapMask(99, () => 0);
    let count = 0;
    for (let i = 0; i < ACRASIEL_SECTOR_COUNT; i++) if (isSpikeGapSector(mask, i)) count++;
    expect(count).toBe(ACRASIEL_SECTOR_COUNT);
  });
});

describe('pickAcrasielMove', () => {
  it('距離帯の重みから5技を選び、密着ではburst、遠距離ではspearを生かす', () => {
    expect(pickAcrasielMove(60, 1, () => 0)).toBe('spike');
    expect(pickAcrasielMove(60, 1, () => 0.99)).toBe('gaze');
    const nearPicks = Array.from({ length: 100 }, (_, i) => pickAcrasielMove(60, 1, () => i / 100));
    const farPicks = Array.from({ length: 100 }, (_, i) => pickAcrasielMove(900, 1, () => i / 100));
    expect(nearPicks).toContain('burst');
    expect(farPicks).toContain('spear');
  });
});

describe('pickAcrasielCombo (§6.28-19 Phase3: spike→spear同時)', () => {
  it('only fires in phase 3', () => {
    expect(pickAcrasielCombo('spike', 1, () => 0)).toBeNull();
    expect(pickAcrasielCombo('spike', 2, () => 0)).toBeNull();
  });
  it('fires deterministically (100%) in phase 3', () => {
    expect(pickAcrasielCombo('spike', 3, () => 0.999)).toBe('spear');
    expect(pickAcrasielCombo('spear', 3, () => 0.999)).toBe('warp');
  });
  it('no followup defined for other moves', () => {
    expect(pickAcrasielCombo('gaze', 3, () => 0)).toBeNull();
  });
});

// ★§6.28-19の主題を守る網(v0.25.4197)。再構築(v0.25.4196)で空きの向きがプレイヤー正面へ
// 固定され、「その場に立っていれば当たらない」状態になっていた。同じ壊し方を機械で捕まえる。
describe('planAcrasielPattern — ★空きは毎回変わる(主題)', () => {
  const plan = (rand: () => number) => planAcrasielPattern(0, 0, 1, 0, 210, 6, rand);

  it('向きは注入した乱数だけで決まる(プレイヤー位置を引数に取らない)', () => {
    expect(plan(() => 0).rotation).toBeCloseTo(0, 6);
    expect(plan(() => 0.5).rotation).toBeCloseTo(Math.PI, 6);
  });

  it('空きセクターが特定の1つに固定されない(8方向へ散る)', () => {
    const seen = new Set<number>();
    let seed = 12345;
    const nextRand = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    for (let i = 0; i < 400; i++) {
      const p = planAcrasielPattern(0, 0, 2, 0, 210, 6, nextRand);
      for (let s2 = 0; s2 < ACRASIEL_SECTOR_COUNT; s2++) if (isSpikeGapSector(p.gapMask, s2)) seen.add(s2);
    }
    // phase2 は空き1つ。400回まわして8方向すべてが少なくとも1回は空きになること。
    expect(seen.size).toBe(ACRASIEL_SECTOR_COUNT);
  });

  it('phase1 は空きが2つ・phase2以降は1つ(acrasielSpikeGapCountと一致)', () => {
    const count = (mask: number) => {
      let n = 0;
      for (let s2 = 0; s2 < ACRASIEL_SECTOR_COUNT; s2++) if (isSpikeGapSector(mask, s2)) n++;
      return n;
    };
    let seed = 777;
    const nextRand = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    expect(count(planAcrasielPattern(0, 0, 1, 0, 210, 6, nextRand).gapMask)).toBe(acrasielSpikeGapCount(1));
    expect(count(planAcrasielPattern(0, 0, 2, 0, 210, 6, nextRand).gapMask)).toBe(acrasielSpikeGapCount(2));
    expect(count(planAcrasielPattern(0, 0, 3, 0, 210, 6, nextRand).gapMask)).toBe(acrasielSpikeGapCount(3));
  });
});

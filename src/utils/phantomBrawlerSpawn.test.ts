// research/BRAWLER_PHANTOM.md §6: 拳鬼の本編の出現(純関数)。
import { describe, expect, it } from 'vitest';
import {
  PHANTOM_BRAWLER_CHANCE, PHANTOM_BRAWLER_STAGES, PHANTOM_BRAWLER_WINDOW_MAX_MS, PHANTOM_BRAWLER_WINDOW_MIN_MS,
  PHANTOM_BRAWLER_DIST_MIN_PX, PHANTOM_BRAWLER_DIST_MAX_PX,
  createPhantomBrawlerPlan, phantomBrawlerSceneBlocked, phantomBrawlerSpawnOffset, phantomBrawlerSpawnStep,
  phantomBrawlerStageEligible, rollPhantomBrawlerRun, type PhantomBrawlerScene,
} from './phantomBrawlerSpawn';

const seq = (...v: number[]) => { let i = 0; return () => v[Math.min(i++, v.length - 1)]; };
const CLEAR: PhantomBrawlerScene = { otherBossEngaged: false, bossChasing: false, redNightActive: false, activeEvent: false, indoor: false, returnCircle: false };

describe('拳鬼の出現: ステージ', () => {
  it('ステージ1・3・4・5だけ', () => {
    expect([...PHANTOM_BRAWLER_STAGES]).toEqual(['stage-1', 'stage-3', 'stage-4', 'stage-5']);
    for (const st of ['stage-2', 'stage-6', 'stage-7', 'stage-ex1', 'stage-0', '']) expect(phantomBrawlerStageEligible(st, true)).toBe(false);
  });
  it('ステージ1は城のボスを一度倒した後から(3・4・5は条件なし)', () => {
    expect(phantomBrawlerStageEligible('stage-1', false)).toBe(false);
    expect(phantomBrawlerStageEligible('stage-1', true)).toBe(true);
    for (const st of ['stage-3', 'stage-4', 'stage-5']) expect(phantomBrawlerStageEligible(st, false)).toBe(true);
  });
});

describe('拳鬼の出現: 抽選', () => {
  const base = { stageId: 'stage-3', stage1CastleCleared: false, practiceOrTest: false };
  it('25%: 1回目の乱数が確率未満なら出る・以上なら出ない', () => {
    expect(PHANTOM_BRAWLER_CHANCE).toBe(0.25);
    expect(rollPhantomBrawlerRun(base, seq(0.2499, 0))).not.toBeNull();
    expect(rollPhantomBrawlerRun(base, seq(0.25, 0))).toBeNull();
  });
  it('出る時刻は60〜240秒の窓', () => {
    expect(rollPhantomBrawlerRun(base, seq(0, 0))).toBe(PHANTOM_BRAWLER_WINDOW_MIN_MS);
    expect(rollPhantomBrawlerRun(base, seq(0, 0.999999999))).toBe(PHANTOM_BRAWLER_WINDOW_MAX_MS);
    expect(PHANTOM_BRAWLER_WINDOW_MIN_MS).toBe(60_000);
    expect(PHANTOM_BRAWLER_WINDOW_MAX_MS).toBe(240_000);
  });
  it('練習ラン・テストでは出ない/対象外のステージでは出ない/ステージ1は城のボスの後', () => {
    expect(rollPhantomBrawlerRun({ ...base, practiceOrTest: true }, seq(0, 0))).toBeNull();
    expect(rollPhantomBrawlerRun({ ...base, stageId: 'stage-2' }, seq(0, 0))).toBeNull();
    expect(rollPhantomBrawlerRun({ ...base, stageId: 'stage-1' }, seq(0, 0))).toBeNull();
    expect(rollPhantomBrawlerRun({ ...base, stageId: 'stage-1', stage1CastleCleared: true }, seq(0, 0))).not.toBeNull();
  });
  it('おかしな乱数でも落ちない', () => {
    expect(() => rollPhantomBrawlerRun(base, () => NaN)).not.toThrow();
  });
});

describe('拳鬼の出現: 1出撃に1回・場面', () => {
  it('時刻前は出ない・時刻が来たら出る・出た後は出ない', () => {
    const plan = { ...createPhantomBrawlerPlan(), rolled: true, at: 70_000 };
    expect(phantomBrawlerSpawnStep(plan, 69_999, CLEAR, false, false)).toBe('none');
    expect(phantomBrawlerSpawnStep(plan, 70_000, CLEAR, false, false)).toBe('spawn');
    expect(phantomBrawlerSpawnStep({ ...plan, done: true }, 80_000, CLEAR, false, false)).toBe('none');
  });
  it('出ない出撃(at=null)・未抽選は何もしない', () => {
    expect(phantomBrawlerSpawnStep({ ...createPhantomBrawlerPlan(), rolled: true }, 999_999, CLEAR, false, false)).toBe('none');
    expect(phantomBrawlerSpawnStep(createPhantomBrawlerPlan(), 999_999, CLEAR, false, false)).toBe('none');
  });
  it('塞がった場面・幻影が既に居る・アテンション中は見直し(retry)', () => {
    const plan = { ...createPhantomBrawlerPlan(), rolled: true, at: 0 };
    for (const k of Object.keys(CLEAR) as (keyof PhantomBrawlerScene)[]) {
      expect(phantomBrawlerSpawnStep(plan, 1, { ...CLEAR, [k]: true }, false, false)).toBe('retry');
      expect(phantomBrawlerSceneBlocked({ ...CLEAR, [k]: true })).toBe(true);
    }
    expect(phantomBrawlerSceneBlocked(CLEAR)).toBe(false);
    expect(phantomBrawlerSpawnStep(plan, 1, CLEAR, true, false)).toBe('retry'); // 汎用の幻影と重ねない
    expect(phantomBrawlerSpawnStep(plan, 1, CLEAR, false, true)).toBe('retry');
    expect(phantomBrawlerSpawnStep({ ...plan, nextCheckAt: 10 }, 5, CLEAR, false, false)).toBe('none');
  });
  it('出る距離は380〜500px', () => {
    for (const [a, b] of [[0, 0], [0.5, 0.999999], [0.25, 0.5]] as const) {
      const o = phantomBrawlerSpawnOffset(seq(a, b));
      const d = Math.hypot(o.dx, o.dy);
      expect(d).toBeGreaterThanOrEqual(PHANTOM_BRAWLER_DIST_MIN_PX - 1e-6);
      expect(d).toBeLessThanOrEqual(PHANTOM_BRAWLER_DIST_MAX_PX + 1e-6);
    }
  });
});

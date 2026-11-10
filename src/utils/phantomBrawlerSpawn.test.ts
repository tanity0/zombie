// research/BRAWLER_PHANTOM.md §6: 拳鬼の本編の出現(純関数)。
import { describe, expect, it } from 'vitest';
import {
  PHANTOM_BRAWLER_STAGES, PHANTOM_BRAWLER_DIST_MIN_PX, PHANTOM_BRAWLER_DIST_MAX_PX,
  kenkiPatrolStep, phantomBrawlerSceneBlocked, phantomBrawlerSpawnOffset, phantomBrawlerStageEligible, rollRunPatrolSlot,
  type PhantomBrawlerScene,
} from './phantomBrawlerSpawn';
import { HERO_PATROL_STAGES } from './heroScript';

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

// 社長指示2026-11-10「出現は徘徊の枠で、亡霊か宇宙飛行が出てる時は出ない。この3人の中で抽選」
describe('拳鬼の出現: 徘徊の枠の抽選(亡霊・宇宙飛行群・拳鬼から1人)', () => {
  const PICK = [0, 0.4, 0.7]; // 2回目の乱数: 3人なら astro / wraith / brawler
  it('拳鬼の出るステージ=徘徊の枠のステージ(ずれが無い)', () => {
    expect([...PHANTOM_BRAWLER_STAGES]).toEqual([...HERO_PATROL_STAGES]);
  });
  it('枠の中では3人から1人だけ(ステージ3・4・5/ステージ1は城のボスの後)', () => {
    for (const stageId of ['stage-3', 'stage-4', 'stage-5']) {
      expect(PICK.map(r => rollRunPatrolSlot({ stageId, stage1CastleCleared: false }, seq(0, r)))).toEqual(['astro', 'wraith', 'brawler']);
    }
    expect(PICK.map(r => rollRunPatrolSlot({ stageId: 'stage-1', stage1CastleCleared: true }, seq(0, r)))).toEqual(['astro', 'wraith', 'brawler']);
  });
  it('ステージ1で城のボスを倒していない時は拳鬼を抜く(2人から)', () => {
    for (let r = 0; r < 1; r += 0.01) expect(rollRunPatrolSlot({ stageId: 'stage-1', stage1CastleCleared: false }, seq(0, r))).not.toBe('brawler');
    expect(rollRunPatrolSlot({ stageId: 'stage-1', stage1CastleCleared: false }, seq(0, 0.7))).toBe('wraith');
  });
  it('枠の外のステージでは誰も出ない(拳鬼も)', () => {
    for (const stageId of ['stage-2', 'stage-6', 'stage-7', 'stage-ex1', 'stage-0', '']) {
      for (const r of PICK) expect(rollRunPatrolSlot({ stageId, stage1CastleCleared: true }, seq(0, r))).toBe('none');
    }
  });
  it('枠が開かない時(20%の外)は誰も出ない', () => {
    expect(rollRunPatrolSlot({ stageId: 'stage-3', stage1CastleCleared: true }, seq(0.2, 0.7))).toBe('none');
  });
});

describe('拳鬼の出現: 遠くに出した後の名乗りと退散', () => {
  const base = { onScreen: false, introduced: false, blocked: false, attention: false };
  it('遠くでまだ会っていない間は、塞がった場面でも消さない(出撃の頭の出来事で消えない)', () => {
    expect(kenkiPatrolStep({ ...base, blocked: true })).toBe('none');
    expect(kenkiPatrolStep(base)).toBe('none');
  });
  it('画面に入った最初のフレームで名乗る(アテンション中は待つ・名乗るのは1回)', () => {
    expect(kenkiPatrolStep({ ...base, onScreen: true })).toBe('intro');
    expect(kenkiPatrolStep({ ...base, onScreen: true, attention: true })).toBe('none');
    expect(kenkiPatrolStep({ ...base, onScreen: true, introduced: true })).toBe('none');
  });
  it('塞がった場面で、画面に入っている/名乗った後なら退散(名乗らずに消える)', () => {
    expect(kenkiPatrolStep({ ...base, onScreen: true, blocked: true })).toBe('retreat');
    expect(kenkiPatrolStep({ ...base, introduced: true, blocked: true })).toBe('retreat');
  });
});

describe('拳鬼の出現: 場面・距離', () => {
  it('塞がった場面(退散する場面)', () => {
    for (const k of Object.keys(CLEAR) as (keyof PhantomBrawlerScene)[]) {
      expect(phantomBrawlerSceneBlocked({ ...CLEAR, [k]: true })).toBe(true);
    }
    expect(phantomBrawlerSceneBlocked(CLEAR)).toBe(false);
  });
  it('確認用の強制出現の距離は380〜500px', () => {
    for (const [a, b] of [[0, 0], [0.5, 0.999999], [0.25, 0.5]] as const) {
      const o = phantomBrawlerSpawnOffset(seq(a, b));
      const d = Math.hypot(o.dx, o.dy);
      expect(d).toBeGreaterThanOrEqual(PHANTOM_BRAWLER_DIST_MIN_PX - 1e-6);
      expect(d).toBeLessThanOrEqual(PHANTOM_BRAWLER_DIST_MAX_PX + 1e-6);
    }
  });
});

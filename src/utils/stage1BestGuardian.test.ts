import { describe, expect, it } from 'vitest';
import {
  guardianBoundKindOfType, hasFixedBossRanking, isStage1FirstGuardianSummon, pickStage1BestGuardian, stage1BestFixedGuardian, stage1BestGuardianSlots,
} from './stage1BestGuardian';
import { FIXED_GUARDIANS, fixedGuardianLeadersForBoss, strongestGuardian } from '../data/fixedGuardians';
import { isGhostEligibleBoss } from './bossEngagement';
import { bossStyleSlotKey } from './ghostSlot';

const base = { firstLoop: false, locked: true, seen: false, queued: false, bossMaker: false };

describe('ステージ1の最初の守護霊=猛者のボス別1位(どの召喚が対象か)', () => {
  it('区分: 賞金首/城ボス(giantbat)/その他', () => {
    expect(guardianBoundKindOfType('bounty-melee')).toBe('bounty');
    expect(guardianBoundKindOfType('bounty-maiko')).toBe('bounty');
    expect(guardianBoundKindOfType('giantbat')).toBe('castle');
    expect(guardianBoundKindOfType('thor')).toBe('other');
  });

  it('1周目: 賞金首への最初の召喚だけ(積み済み=2回目以降は通常)。城ボス・その他は対象外', () => {
    const loop1 = { ...base, firstLoop: true };
    expect(isStage1FirstGuardianSummon({ ...loop1, bossType: 'bounty-ranged' })).toBe(true);
    expect(isStage1FirstGuardianSummon({ ...loop1, queued: true, bossType: 'bounty-ranged' })).toBe(false);
    expect(isStage1FirstGuardianSummon({ ...loop1, bossType: 'giantbat' })).toBe(false);
    expect(isStage1FirstGuardianSummon({ ...loop1, bossType: 'thor' })).toBe(false);
    // 1周目は端末の既読に関係なく対象(チュートリアルと同じ)。
    expect(isStage1FirstGuardianSummon({ ...loop1, seen: true, bossType: 'bounty-ranged' })).toBe(true);
  });

  it('2周目以降: ロック中で未読の時、最初の賞金首か城ボスへの召喚', () => {
    expect(isStage1FirstGuardianSummon({ ...base, bossType: 'bounty-balance' })).toBe(true);
    expect(isStage1FirstGuardianSummon({ ...base, bossType: 'giantbat' })).toBe(true);
    expect(isStage1FirstGuardianSummon({ ...base, bossType: 'mimir' })).toBe(false);
    expect(isStage1FirstGuardianSummon({ ...base, seen: true, bossType: 'giantbat' })).toBe(false);
    // ロックが外れた(ステージ1クリア後)出撃・ボスメーカーでは対象外=通常どおり。
    expect(isStage1FirstGuardianSummon({ ...base, locked: false, bossType: 'giantbat' })).toBe(false);
    expect(isStage1FirstGuardianSummon({ ...base, bossMaker: true, bossType: 'giantbat' })).toBe(false);
  });

  it('先に取っておくオンラインのスロットは城ボスと賞金首4型(どれもオンラインのスロットを持つ)', () => {
    const slots = stage1BestGuardianSlots('stage-1');
    expect(slots).toEqual(['giantbat@stage-1', 'bounty-ranged', 'bounty-melee', 'bounty-balance', 'bounty-maiko']);
    expect(slots.length).toBe(new Set(slots).size);
    for (const t of ['giantbat', 'bounty-ranged', 'bounty-melee', 'bounty-balance', 'bounty-maiko'] as const) {
      expect(isGhostEligibleBoss(t), t).toBe(true);
    }
  });

  it('固定の先人守護霊のボス別の順位: 城ボスはある・賞金首は無い(守護霊部屋の並びに無い)', () => {
    expect(hasFixedBossRanking('giantbat@stage-1')).toBe(true);
    expect(hasFixedBossRanking('bounty-melee')).toBe(false);
  });
});

describe('ステージ1の最初の守護霊=猛者のボス別1位(誰を呼ぶか)', () => {
  const castleSlot = bossStyleSlotKey('giantbat', 'stage-1');
  const fixedTop = fixedGuardianLeadersForBoss(castleSlot)[0];

  it('固定の1位: 城ボスはボス別上位の先頭(=score最大)、賞金首は最強の1体', () => {
    const leaders = fixedGuardianLeadersForBoss(castleSlot);
    expect(Math.max(...leaders.map(g => g.performance.score))).toBe(fixedTop.performance.score);
    expect(stage1BestFixedGuardian(castleSlot, true).id).toBe(fixedTop.id);
    expect(stage1BestFixedGuardian(bossStyleSlotKey('bounty-melee', 'stage-1'), false).id).toBe(strongestGuardian().id);
    // 最強の1体は20体全体の score 最上位(同点なら名指しの1体)。
    expect(strongestGuardian().performance.score).toBe(Math.max(...FIXED_GUARDIANS.map(g => g.performance.score)));
  });

  it('オンラインが無い(オフライン・同意なし・候補0・賞金首)なら固定の1位', () => {
    expect(pickStage1BestGuardian({ slotKey: castleSlot, hasBossRanking: true, online: null }))
      .toEqual({ kind: 'fixed', guardian: fixedTop });
    expect(pickStage1BestGuardian({ slotKey: 'bounty-melee', hasBossRanking: false, online: null }))
      .toEqual({ kind: 'fixed', guardian: strongestGuardian() });
  });

  it('オンラインの1位が取れていれば、評点が固定の1位より低くても必ずオンライン(比べない)', () => {
    const s = fixedTop.performance.score;
    for (const online of [{ id: 'r', perf: s + 1 }, { id: 'r', perf: s }, { id: 'r', perf: s - 1000 }, { id: 'r', perf: null }]) {
      expect(pickStage1BestGuardian({ slotKey: castleSlot, hasBossRanking: true, online })).toEqual({ kind: 'remote', candidate: online });
    }
    // 賞金首(ボス別の順位なし)でも同じ。
    const weak = { id: 'r', perf: strongestGuardian().performance.score - 1000 };
    expect(pickStage1BestGuardian({ slotKey: 'bounty-melee', hasBossRanking: false, online: weak })).toEqual({ kind: 'remote', candidate: weak });
  });

  it('毎回同じ相手(抽選しない)', () => {
    const a = pickStage1BestGuardian({ slotKey: castleSlot, hasBossRanking: true, online: null });
    const b = pickStage1BestGuardian({ slotKey: castleSlot, hasBossRanking: true, online: null });
    expect(a).toEqual(b);
  });
});

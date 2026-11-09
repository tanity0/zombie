// 格闘×スキル(research/BRAWLER.md §15)の純関数。格闘以外の経路が今までどおりであることもここで固定する。
import { describe, it, expect } from 'vitest';
import {
  stunnedFinishDamage, counterMasterBlowFires, BRAWLER_FINISHER_MOVES, brawlerHitHealAllowed, isBrawlerSecretMove,
  brawlerTimeKeeperDiscount, brawlerOverclockRefunds, BRAWLER_OVERCLOCK_REFUND_CHANCE, brawlerJustWindowMs,
} from './brawlerSkills';
import { BRAWLER_TECHS, brawlerTechCost, brawlerCanPay, brawlerIsJustGuard, BRAWLER_JUST_MS, initialBrawlerState } from './brawler';
import { playerSuperArmorActive } from './superArmor';
import { newSkillCandidates, type RunSkillDraftInput } from './runSkillDraft';
import type { BrawlerTechKind } from './brawlerTypes';

describe('1. 処刑系: 段の倍率は5倍の部分だけ・報酬予算には掛けない', () => {
  it('格闘: どの段で決めても報酬は満額・5倍の部分だけ段の倍率', () => {
    const base5 = 10 * 5, reward = 2500;
    expect(stunnedFinishDamage(base5, reward, 0.3, 1)).toBeCloseTo(50 * 0.3 + 2500, 10);
    expect(stunnedFinishDamage(base5, reward, 1.6, 1)).toBeCloseTo(50 * 1.6 + 2500, 10);
    // 1段目と5段目の差は5倍の部分だけ(旧: 報酬ごと縮んで 762 / 5段目は 4064 のように振れた)
    expect(stunnedFinishDamage(base5, reward, 1.6, 1) - stunnedFinishDamage(base5, reward, 0.3, 1)).toBeCloseTo(50 * 1.3, 10);
  });
  it('格闘以外(rewardMult=mult)は今までどおり報酬ごと掛ける', () => {
    expect(stunnedFinishDamage(50, 2500, 2, 2)).toBe((50 + 2500) * 2);
  });
  it('強個体の3倍(報酬なし)・印の倍率', () => {
    expect(stunnedFinishDamage(30, 0, 0.8, 1, 2)).toBeCloseTo(30 * 0.8 * 2, 10);
  });
});

describe('2. カウンターマスターの吹き飛ばし', () => {
  it('格闘以外は毎回(move の有無を問わない)', () => {
    expect(counterMasterBlowFires(false, undefined)).toBe(true);
    expect(counterMasterBlowFires(false, 's1')).toBe(true);
  });
  it('格闘は締めの当たりだけ', () => {
    for (const m of ['s1', 's2', 's3', 's4', 'kick1', 'kick2', 'kiko', 'secret'] as const) expect(counterMasterBlowFires(true, m)).toBe(false);
    for (const m of ['s5', 'kick3', 'stomp', 'secret-land'] as const) expect(counterMasterBlowFires(true, m)).toBe(true);
    expect(counterMasterBlowFires(true, undefined)).toBe(false);
    expect(BRAWLER_FINISHER_MOVES).toHaveLength(4);
  });
});

describe('3. 当たるたびの回復: 秘奥義の中だけ1回', () => {
  it('秘奥義の9連撃・締めは回復済みなら出さない・通常の段と格闘以外は毎回', () => {
    expect(isBrawlerSecretMove('secret')).toBe(true);
    expect(isBrawlerSecretMove('secret-land')).toBe(true);
    expect(isBrawlerSecretMove('s5')).toBe(false);
    expect(brawlerHitHealAllowed('secret', false)).toBe(true);
    expect(brawlerHitHealAllowed('secret', true)).toBe(false);
    expect(brawlerHitHealAllowed('secret-land', true)).toBe(false);
    expect(brawlerHitHealAllowed('s1', true)).toBe(true);
    expect(brawlerHitHealAllowed(undefined, true)).toBe(true);
  });
});

describe('5. タイムキーパー/オーバークロック', () => {
  const costs = (lv: number): Record<BrawlerTechKind, number> => ({
    guard: brawlerTechCost('guard', false, brawlerTimeKeeperDiscount('guard', lv)),
    stomp: brawlerTechCost('stomp', false, brawlerTimeKeeperDiscount('stomp', lv)),
    kiko: brawlerTechCost('kiko', false, brawlerTimeKeeperDiscount('kiko', lv)),
    kick: brawlerTechCost('kick', false, brawlerTimeKeeperDiscount('kick', lv)),
  });
  it('値段の高い技から1ポイントずつ安くなる(Lv1: 大踏み潰し / Lv2: +構え / Lv3: +気功)・飛び蹴りは1のまま', () => {
    expect(costs(0)).toEqual({ stomp: 5, guard: 3, kiko: 2, kick: 1 });
    expect(costs(1)).toEqual({ stomp: 4, guard: 3, kiko: 2, kick: 1 });
    expect(costs(2)).toEqual({ stomp: 4, guard: 2, kiko: 2, kick: 1 });
    expect(costs(3)).toEqual({ stomp: 4, guard: 2, kiko: 1, kick: 1 });
    const sum = (lv: number) => Object.values(costs(lv)).reduce((a, b) => a + b, 0);
    expect([0, 1, 2, 3].map(sum)).toEqual([11, 10, 9, 8]);
  });
  it('持っていない(Lv0)・範囲外のLvでも壊れない。割引なしの値段は台帳のまま。覚醒中は0のまま', () => {
    expect(brawlerTimeKeeperDiscount('stomp', 0)).toBe(0);
    expect(brawlerTimeKeeperDiscount('stomp', 9)).toBe(brawlerTimeKeeperDiscount('stomp', 3));
    for (const k of Object.keys(BRAWLER_TECHS) as BrawlerTechKind[]) expect(brawlerTechCost(k)).toBe(BRAWLER_TECHS[k].cost);
    expect(brawlerTechCost('stomp', true, 1)).toBe(0);
  });
  it('払えるかは割引後の値段で見る', () => {
    const s = { ...initialBrawlerState(), points: 4 };
    expect(brawlerCanPay(s, 'stomp')).toBe(false);
    expect(brawlerCanPay(s, 'stomp', false, 1)).toBe(true);
  });
  it('オーバークロック: 確率はサブウェポンのCDと同じ 20/25/30%・払っていない(0)ときは返さない', () => {
    expect(BRAWLER_OVERCLOCK_REFUND_CHANCE).toEqual([0, 0.2, 0.25, 0.3]);
    expect(brawlerOverclockRefunds(3, 1, () => 0.19)).toBe(true);
    expect(brawlerOverclockRefunds(3, 1, () => 0.21)).toBe(false);
    expect(brawlerOverclockRefunds(3, 3, () => 0.29)).toBe(true);
    expect(brawlerOverclockRefunds(0, 3, () => 0)).toBe(false); // 覚醒中の0ポイント
    expect(brawlerOverclockRefunds(3, 0, () => 0)).toBe(false);
  });
});

describe('8. ジャスト構えの窓は強化「カウンター受付」の延びぶんだけ延びる', () => {
  it('延びなし=120ms(今まで)・延びあり=足し算', () => {
    expect(brawlerJustWindowMs(0)).toBe(BRAWLER_JUST_MS);
    expect(brawlerJustWindowMs(80)).toBe(BRAWLER_JUST_MS + 80);
    const g = { guardSince: 1000, guardUntil: 2000 };
    expect(brawlerIsJustGuard(g, 1000 + 150)).toBe(false);
    expect(brawlerIsJustGuard(g, 1000 + 150, brawlerJustWindowMs(80))).toBe(true);
    expect(brawlerIsJustGuard(g, 1000 + 120)).toBe(true); // 既定は今までどおり
  });
});

describe('7. スーパーアーマーLv3: 格闘の段・技の間は振っている扱い', () => {
  const base: Record<string, unknown> = { skills: ['super-armor'], skillLevels: { 'super-armor': 3 } };
  it('格闘の動作中(idle でない)は大きな被弾でも働く・idle なら働かない・格闘でない時は今までどおり', () => {
    const idle = { ...base, brawler: initialBrawlerState() };
    const acting = { ...base, brawler: { ...initialBrawlerState(), phase: 'attack' as const, stage: 2 } };
    const tech = { ...base, brawler: { ...initialBrawlerState(), phase: 'tech' as const } };
    expect(playerSuperArmorActive(idle as never, 999, 1000, 1000, 300)).toBe(false);
    expect(playerSuperArmorActive(acting as never, 999, 1000, 1000, 300)).toBe(true);
    expect(playerSuperArmorActive(tech as never, 999, 1000, 1000, 300)).toBe(true);
    expect(playerSuperArmorActive(base as never, 999, 1000, 1000, 300)).toBe(false);
  });
  it('Lv1/Lv2 には効かない(Lv3 のみ)', () => {
    const lv2 = { skills: ['super-armor'], skillLevels: { 'super-armor': 2 }, brawler: { ...initialBrawlerState(), phase: 'attack' as const } } as never;
    expect(playerSuperArmorActive(lv2, 999, 1000, 1000, 300)).toBe(false);
  });
});

describe('4/6. ドラフト: 格闘の出撃', () => {
  const input = (over: Partial<RunSkillDraftInput>): RunSkillDraftInput => ({
    owned: ['exploder', 'bomber', 'slasher', 'shukuchi', 'berserker'], ownedLevels: {}, runSkills: [], runSkillLevels: {}, playerLevel: 5, ...over,
  } as RunSkillDraftInput);
  it('格闘を持つ出撃: エクスプローダー/ボマーが並び、スラッシャー/縮地は外れる', () => {
    const c = newSkillCandidates(input({ brawlerEquipped: true }));
    expect(c).toContain('exploder'); expect(c).toContain('bomber');
    expect(c).not.toContain('slasher'); expect(c).not.toContain('shukuchi'); expect(c).toContain('berserker');
  });
  it('格闘を持たない出撃は今までどおり(爆発源が無ければ並ばず、スラッシャー/縮地は並ぶ)', () => {
    const c = newSkillCandidates(input({}));
    expect(c).not.toContain('exploder'); expect(c).not.toContain('bomber');
    expect(c).toContain('slasher'); expect(c).toContain('shukuchi');
  });
});

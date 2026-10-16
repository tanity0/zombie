// B12 スーパーアーマー(research/THEONE_ROUND2.md §4)の純関数テスト。配線(両経路で knockback が変わらない等)は
// src/store/superArmor.store.test.ts。
import { describe, it, expect } from 'vitest';
import {
  playerSuperArmorActive, isPlayerMeleeSwinging, superArmorSkillLevel, superArmorSquashY,
  SUPER_ARMOR_POSE_DELAY_MS, SUPER_ARMOR_SINK_MS, SUPER_ARMOR_RECOVER_MS, SUPER_ARMOR_SQUASH_Y,
} from './superArmor';

const SWING = 368;
const NOW = 1_000_000;
const GT = 50_000;
const withSkill = (lv: number, extra: Record<string, unknown> = {}) =>
  ({ skills: ['super-armor'], skillLevels: { 'super-armor': lv }, ...extra });
const active = (p: Parameters<typeof playerSuperArmorActive>[0], dmg: number, nowMs = NOW, gt = GT) =>
  playerSuperArmorActive(p, dmg, nowMs, gt, SWING);

describe('スキルのレベル別しきい値(8/16/24 の境界)', () => {
  it('Lv1: 8 までアーマー・9 で従来どおり吹き飛ぶ', () => {
    expect(active(withSkill(1), 8)).toBe(true);
    expect(active(withSkill(1), 8.0001)).toBe(false);
    expect(active(withSkill(1), 9)).toBe(false);
  });
  it('Lv2: 16 まで・17 で吹き飛ぶ', () => {
    expect(active(withSkill(2), 16)).toBe(true);
    expect(active(withSkill(2), 17)).toBe(false);
  });
  it('Lv3: 24 まで・25 で吹き飛ぶ(近接を振っていなければ)', () => {
    expect(active(withSkill(3), 24)).toBe(true);
    expect(active(withSkill(3), 25)).toBe(false);
  });
  it('スキル無し・覚醒なしは常に偽', () => {
    expect(active({ skills: [] }, 1)).toBe(false);
    expect(active({}, 1)).toBe(false);
  });
  it('レベル未記録(skillLevels 欠け)は Lv1 扱い', () => {
    expect(superArmorSkillLevel({ skills: ['super-armor'] })).toBe(1);
    expect(active({ skills: ['super-armor'] }, 8)).toBe(true);
    expect(active({ skills: ['super-armor'] }, 9)).toBe(false);
  });
});

describe('Lv3 かつ近接を振っている間は量を問わず(Lv1/Lv2 では効かない)', () => {
  it('前隙(pendingSwingAt>0)', () => {
    expect(active(withSkill(3, { pendingSwingAt: NOW - 50 }), 74)).toBe(true);
    expect(active(withSkill(2, { pendingSwingAt: NOW - 50 }), 74)).toBe(false);
  });
  it('振り全体(meleeSwingAt から swingMs の内・境界は未満)', () => {
    expect(active(withSkill(3, { meleeSwingAt: NOW - (SWING - 1) }), 74)).toBe(true);
    expect(active(withSkill(3, { meleeSwingAt: NOW - SWING }), 74)).toBe(false);
    expect(active(withSkill(3, { meleeSwingAt: 0 }), 74)).toBe(false);
  });
  it('刀の一閃(ダッシュ中)・縮地のワープ斬撃・被弾反撃の飛び込みも「振り」', () => {
    expect(isPlayerMeleeSwinging({ katanaDashUntil: NOW + 10 }, NOW, SWING)).toBe(true);
    expect(isPlayerMeleeSwinging({ katanaDashUntil: NOW }, NOW, SWING)).toBe(false);
    expect(isPlayerMeleeSwinging({ shukuchiStriking: true }, NOW, SWING)).toBe(true);
    expect(isPlayerMeleeSwinging({ shukuchiStrikeAt: NOW + 5 }, NOW, SWING)).toBe(true);
    expect(isPlayerMeleeSwinging({ retaliateStrikeAt: NOW + 5 }, NOW, SWING)).toBe(true);
    expect(isPlayerMeleeSwinging({}, NOW, SWING)).toBe(false);
  });
});

describe('血の覚醒中はスキルが無くても真', () => {
  it('覚醒中(bloodAwakenUntil > gameTime)は量を問わず真・終われば偽', () => {
    expect(active({ bloodAwakenUntil: GT + 1 }, 9999)).toBe(true);
    expect(active({ bloodAwakenUntil: GT }, 9999)).toBe(false);
    expect(active({ bloodAwakenUntil: 0 }, 9999)).toBe(false);
  });
});

describe('踏ん張りの絵(superArmorSquashY)', () => {
  it('+200ms より前と、戻り切った後は 1(変化なし)', () => {
    expect(superArmorSquashY(0)).toBe(1);
    expect(superArmorSquashY(SUPER_ARMOR_POSE_DELAY_MS - 1)).toBe(1);
    expect(superArmorSquashY(SUPER_ARMOR_POSE_DELAY_MS + SUPER_ARMOR_SINK_MS + SUPER_ARMOR_RECOVER_MS)).toBe(1);
  });
  it('底は 0.94・沈み込みは瞬間ではない(入りに加減速がある)', () => {
    const t0 = SUPER_ARMOR_POSE_DELAY_MS;
    expect(superArmorSquashY(t0)).toBe(1); // 入りの瞬間はまだ潰れていない
    expect(superArmorSquashY(t0 + SUPER_ARMOR_SINK_MS)).toBeCloseTo(SUPER_ARMOR_SQUASH_Y);
    const mid = superArmorSquashY(t0 + SUPER_ARMOR_SINK_MS / 2);
    expect(mid).toBeLessThan(1);
    expect(mid).toBeGreaterThan(SUPER_ARMOR_SQUASH_Y);
  });
  it('戻りは ease-out(180ms)で単調に 1 へ', () => {
    let prev = SUPER_ARMOR_SQUASH_Y;
    const start = SUPER_ARMOR_POSE_DELAY_MS + SUPER_ARMOR_SINK_MS;
    for (let t = 0; t <= SUPER_ARMOR_RECOVER_MS; t += 10) {
      const v = superArmorSquashY(start + t);
      expect(v).toBeGreaterThanOrEqual(prev - 1e-12);
      expect(v).toBeLessThanOrEqual(1);
      prev = v;
    }
    // ease-out: 前半で半分以上戻る
    expect(superArmorSquashY(start + SUPER_ARMOR_RECOVER_MS / 2)).toBeGreaterThan((1 + SUPER_ARMOR_SQUASH_Y) / 2);
  });
  it('縦は 0.94 より潰れない(白い縁・赤などは別物)', () => {
    for (let t = 0; t < 600; t += 5) expect(superArmorSquashY(t)).toBeGreaterThanOrEqual(SUPER_ARMOR_SQUASH_Y - 1e-12);
  });
});

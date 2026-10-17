// B12 スーパーアーマー(research/THEONE_ROUND2.md §4)の純関数テスト。配線(両経路で knockback が変わらない等)は
// src/store/superArmor.store.test.ts。
import { describe, it, expect } from 'vitest';
import {
  playerSuperArmorActive, isPlayerMeleeSwinging, superArmorSkillLevel, superArmorSquashY, superArmorSquashX, superArmorLeanRad,
  SUPER_ARMOR_POSE_DELAY_MS, SUPER_ARMOR_SINK_MS, SUPER_ARMOR_HOLD_MS, SUPER_ARMOR_RECOVER_MS, SUPER_ARMOR_SQUASH_Y,
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

describe('踏ん張りの絵(superArmorSquashY / SquashX / LeanRad)', () => {
  const END = SUPER_ARMOR_POSE_DELAY_MS + SUPER_ARMOR_RECOVER_MS;
  it('被弾の前(負)と、戻り切った後は変化なし', () => {
    expect(superArmorSquashY(-5)).toBe(1);
    expect(superArmorSquashY(0)).toBe(1);
    expect(superArmorSquashY(END)).toBe(1);
    expect(superArmorSquashY(END + 500)).toBe(1);
    expect(superArmorSquashX(END)).toBe(1);
  });
  it('時間割: 沈みは被弾と同時に始まり(ヒットストップの中)、底で止まり、その後に戻る', () => {
    expect(SUPER_ARMOR_POSE_DELAY_MS).toBe(SUPER_ARMOR_SINK_MS + SUPER_ARMOR_HOLD_MS); // 戻り始めの遅れ=沈み+底の止まり
    // 衝撃と同時=最初の数 ms で既に沈み始めている(旧は +200ms まで 1 のままだった)
    expect(superArmorSquashY(10)).toBeLessThan(1);
    // 沈み 50ms で底
    expect(superArmorSquashY(SUPER_ARMOR_SINK_MS)).toBeCloseTo(SUPER_ARMOR_SQUASH_Y);
  });
  it('底は 0.89 で 70ms 止まる(耐えている間)・戻りの直前まで底のまま', () => {
    expect(SUPER_ARMOR_SQUASH_Y).toBe(0.89);
    expect(SUPER_ARMOR_HOLD_MS).toBe(70);
    for (let t = SUPER_ARMOR_SINK_MS; t < SUPER_ARMOR_POSE_DELAY_MS; t += 5) {
      expect(superArmorSquashY(t)).toBeCloseTo(SUPER_ARMOR_SQUASH_Y, 10);
    }
    // 戻りが始まったら底より上
    expect(superArmorSquashY(SUPER_ARMOR_POSE_DELAY_MS + 10)).toBeGreaterThan(SUPER_ARMOR_SQUASH_Y);
  });
  it('沈みは瞬間ではない(入りに加減速がある・ease-out)', () => {
    const mid = superArmorSquashY(SUPER_ARMOR_SINK_MS / 2);
    expect(mid).toBeLessThan(1);
    expect(mid).toBeGreaterThan(SUPER_ARMOR_SQUASH_Y);
    // ease-out: 前半で半分以上沈む
    expect(mid).toBeLessThan((1 + SUPER_ARMOR_SQUASH_Y) / 2);
  });
  it('戻りは ease-out(180ms)で単調に 1 へ', () => {
    let prev = SUPER_ARMOR_SQUASH_Y;
    for (let t = 0; t <= SUPER_ARMOR_RECOVER_MS; t += 10) {
      const v = superArmorSquashY(SUPER_ARMOR_POSE_DELAY_MS + t);
      expect(v).toBeGreaterThanOrEqual(prev - 1e-12);
      expect(v).toBeLessThanOrEqual(1);
      prev = v;
    }
    expect(superArmorSquashY(SUPER_ARMOR_POSE_DELAY_MS + SUPER_ARMOR_RECOVER_MS / 2)).toBeGreaterThan((1 + SUPER_ARMOR_SQUASH_Y) / 2);
  });
  it('縦は 0.89 より潰れない', () => {
    for (let t = -10; t < 600; t += 5) expect(superArmorSquashY(t)).toBeGreaterThanOrEqual(SUPER_ARMOR_SQUASH_Y - 1e-12);
  });
  it('縦に沈めば横に広がる(底で +3%・縦と同じ深さに比例)', () => {
    expect(superArmorSquashX(SUPER_ARMOR_SINK_MS)).toBeCloseTo(1.03);
    for (let t = 0; t < END; t += 7) {
      const y = superArmorSquashY(t), x = superArmorSquashX(t);
      expect(x).toBeGreaterThanOrEqual(1 - 1e-12);
      expect(x).toBeLessThanOrEqual(1.03 + 1e-12);
      // 沈みと広がりは連動(縦が潰れた割合 × 0.03/0.11 = 横の広がり)
      expect(x - 1).toBeCloseTo(((1 - y) / (1 - SUPER_ARMOR_SQUASH_Y)) * 0.03, 10);
    }
  });
  it('攻撃の来た側へ傾ぐ(3〜5°・攻撃源は -dirX 側・深さに比例して起き上がる)', () => {
    const deg = (rad: number) => (rad * 180) / Math.PI;
    // 攻撃が左から来た=体は +x へ弾かれる向き(dirX=+1) → 頭は左(負の回転)へ傾ぐ
    const l = superArmorLeanRad(SUPER_ARMOR_SINK_MS, 1);
    expect(l).toBeLessThan(0);
    expect(Math.abs(deg(l))).toBeGreaterThanOrEqual(3);
    expect(Math.abs(deg(l))).toBeLessThanOrEqual(5);
    expect(superArmorLeanRad(SUPER_ARMOR_SINK_MS, -1)).toBeCloseTo(-l); // 右から来たら逆
    expect(superArmorLeanRad(SUPER_ARMOR_SINK_MS, 0)).toBeCloseTo(0);   // 真上下からは傾かない
    expect(superArmorLeanRad(END, 1)).toBeCloseTo(0);                    // 戻り切れば起きている
    expect(superArmorLeanRad(SUPER_ARMOR_SINK_MS, 5)).toBeCloseTo(l);    // dirX は -1..1 に丸める
    expect(superArmorLeanRad(SUPER_ARMOR_SINK_MS, NaN)).toBe(-0);
  });
});

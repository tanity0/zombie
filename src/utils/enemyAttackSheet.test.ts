// ★攻撃モーション(社長支給2026-09-20「武器を振り下ろす絵」)の機械化。
// 描画側はテストしない(CLAUDE.md)——**いつどのコマを出すか**の純関数だけを固定する。
import { describe, it, expect } from 'vitest';
import {
  enemyAttackFrame, enemyAttackFrameFor, attackFrameSpans, ATTACK_SETTLE_MS,
} from './enemyAttackSheet';
import { attackSheetFrames, attackSheetName, ENEMY_ATTACK_SHEETS, attackImpactFrame } from './enemySheets';
import { biteSpecFor, BAT_WINDUP_STILL_MS } from './enemyBite';
import { ENEMY_VARIANT_SETS } from './enemyVariant';
import type { Enemy } from '../types/game';

const FR = ENEMY_ATTACK_SHEETS['bat-female'];
const SPEC = biteSpecFor('bat', 'bat-grab');
const W = SPEC.windupMs, B = SPEC.biteMs;
const HIT = W + B;                       // ★命中が解決する瞬間
const IMP = attackImpactFrame('bat-female');   // 当たるコマ(既定=末尾から2コマ目)
const FR_M = ENEMY_ATTACK_SHEETS['bat-male'];
const IMP_M = attackImpactFrame('bat-male');

describe('★表', () => {
  it('シート名は<立ち絵名>-attack', () => expect(attackSheetName('bat-female')).toBe('bat-female-attack'));
  it('★表に載る立ち絵は実在する変種の絵であること(名前を間違えると一生出ない)', () => {
    const all = new Set(Object.values(ENEMY_VARIANT_SETS).flat());
    for (const n of Object.keys(ENEMY_ATTACK_SHEETS)) expect(all.has(n), n).toBe(true);
  });
  it('表に無い絵は0コマ', () => expect(attackSheetFrames('zombie-common')).toBe(0));
  it('★当たるコマの既定は「末尾から2コマ目」(最後は振り抜き)', () => {
    expect(IMP).toBe(FR - 2);
    expect(IMP_M).toBe(FR_M - 2);
  });
});

describe('★★掟③「消え切る時刻 = 当たる時刻」', () => {
  it('★振り下ろしのコマ(4)は、命中が解決する瞬間にちょうど終わる', () => {
    expect(enemyAttackFrame(FR, HIT - 1, W, B)).toBe(4);
    expect(enemyAttackFrame(FR, HIT, W, B)).toBe(5);     // 解決した瞬間から振り抜きへ
  });
  it('★命中の前に振り下ろし切っていない(「下りているのにまだ当たらない」を作らない)', () => {
    const spans = attackFrameSpans(FR, IMP, W, B, ATTACK_SETTLE_MS);
    const slam = spans.find(s => s.frame === 4)!;
    const hold = spans.find(s => s.frame === 3)!;
    expect(slam.untilMs).toBe(HIT);
    // 振り下ろしの窓は振りの一部でしかない=頭上の溜めが大半を持つ(読ませる時間)。
    expect(slam.untilMs - hold.untilMs).toBeLessThan(B * 0.5);
    expect(slam.untilMs - hold.untilMs).toBeGreaterThan(0);
  });
});

describe('★★掟③: コマ数が違うシートでも成り立つ(男=7コマ)', () => {
  it('男も「振りのコマは命中の瞬間に終わる」', () => {
    expect(enemyAttackFrame(FR_M, HIT - 1, W, B, ATTACK_SETTLE_MS, IMP_M)).toBe(IMP_M);
    expect(enemyAttackFrame(FR_M, HIT, W, B, ATTACK_SETTLE_MS, IMP_M)).toBe(IMP_M + 1);
  });
  it('男も構えで止まり、溜め明けに振り上げ切っている', () => {
    expect(enemyAttackFrame(FR_M, 0, W, B, ATTACK_SETTLE_MS, IMP_M)).toBe(0);
    expect(enemyAttackFrame(FR_M, W - 1, W, B, ATTACK_SETTLE_MS, IMP_M)).toBe(IMP_M - 2);
    expect(enemyAttackFrame(FR_M, W, W, B, ATTACK_SETTLE_MS, IMP_M)).toBe(IMP_M - 1);
  });
  it('男も余韻を過ぎたら null / コマ番号は範囲内', () => {
    expect(enemyAttackFrame(FR_M, HIT + ATTACK_SETTLE_MS, W, B, ATTACK_SETTLE_MS, IMP_M)).toBeNull();
    for (let t = 0; t < HIT + ATTACK_SETTLE_MS; t += 3) {
      const i = enemyAttackFrame(FR_M, t, W, B, ATTACK_SETTLE_MS, IMP_M);
      if (i !== null) { expect(i).toBeGreaterThanOrEqual(0); expect(i).toBeLessThan(FR_M); }
    }
  });
  it('★全コマが一度は出る(どのコマも飛ばさない)', () => {
    for (const [frames, imp] of [[FR, IMP], [FR_M, IMP_M]] as const) {
      const seen = new Set<number>();
      for (let t = 0; t < HIT + ATTACK_SETTLE_MS; t += 1) {
        const i = enemyAttackFrame(frames, t, W, B, ATTACK_SETTLE_MS, imp);
        if (i !== null) seen.add(i);
      }
      expect(seen.size, `${frames}コマ`).toBe(frames);
    }
  });
});

describe('★コマの並びと尺', () => {
  it('溜めの頭は「構え」で止まる(§16-E と同じ長さを引く)', () => {
    expect(enemyAttackFrame(FR, 0, W, B)).toBe(0);
    expect(enemyAttackFrame(FR, BAT_WINDUP_STILL_MS - 1, W, B)).toBe(0);
    expect(enemyAttackFrame(FR, BAT_WINDUP_STILL_MS + 1, W, B)).toBe(1);
  });
  it('溜めが明ける時刻に、振り上げ切っている(2コマ目の終わり=windup)', () => {
    expect(enemyAttackFrame(FR, W - 1, W, B)).toBe(2);
    expect(enemyAttackFrame(FR, W, W, B)).toBe(3);
  });
  it('★余韻を過ぎたら null(=歩き/立ち絵へ戻る)', () => {
    expect(enemyAttackFrame(FR, HIT + ATTACK_SETTLE_MS - 1, W, B)).toBe(5);
    expect(enemyAttackFrame(FR, HIT + ATTACK_SETTLE_MS, W, B)).toBeNull();
  });
  it('技を出していなければ null', () => {
    expect(enemyAttackFrame(FR, -1, W, B)).toBeNull();
    expect(enemyAttackFrameFor({ type: 'bat', biteAt: 0 } as Enemy, FR, 1000)).toBeNull();
  });
  it('★★コマ尺が等間隔でない(機械的に等間隔=AIっぽさ、を作らない)', () => {
    const spans = attackFrameSpans(FR, IMP, W, B, ATTACK_SETTLE_MS);
    const holds = spans.map((s, i) => s.untilMs - (i ? spans[i - 1].untilMs : 0));
    expect(new Set(holds.map(h => Math.round(h))).size).toBeGreaterThan(3);
    // 振り下ろし(4)が一番短い=一番速い。
    expect(holds[4]).toBe(Math.min(...holds));
  });
  it('コマ番号はシートの範囲に収まる', () => {
    for (let t = 0; t < HIT + ATTACK_SETTLE_MS; t += 3) {
      const i = enemyAttackFrame(FR, t, W, B);
      if (i !== null) { expect(i).toBeGreaterThanOrEqual(0); expect(i).toBeLessThan(FR); }
    }
  });
  it('尺から計算している(尺が変われば区切りも動く=数字の手写しをしていない)', () => {
    const a = attackFrameSpans(FR, IMP, W, B, ATTACK_SETTLE_MS);
    const b = attackFrameSpans(FR, IMP, W * 2, B * 2, ATTACK_SETTLE_MS);
    expect(b.find(s => s.frame === 4)!.untilMs).toBe((W + B) * 2);
    expect(a.find(s => s.frame === 4)!.untilMs).not.toBe(b.find(s => s.frame === 4)!.untilMs);
  });
});

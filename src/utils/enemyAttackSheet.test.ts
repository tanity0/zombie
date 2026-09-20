// ★攻撃モーション(社長支給2026-09-20「武器を振り下ろす絵」)の機械化。
// 描画側はテストしない(CLAUDE.md)——**いつどのコマを出すか**の純関数だけを固定する。
import { describe, it, expect } from 'vitest';
import {
  enemyAttackFrame, enemyAttackFrameFor, attackFrameSpans, attackSheetFrames, attackSheetName,
  ENEMY_ATTACK_SHEETS, ATTACK_SETTLE_MS,
} from './enemyAttackSheet';
import { biteSpecFor, BAT_WINDUP_STILL_MS } from './enemyBite';
import { ENEMY_VARIANT_SETS } from './enemyVariant';
import type { Enemy } from '../types/game';

const FR = ENEMY_ATTACK_SHEETS['bat-female'];
const SPEC = biteSpecFor('bat', 'bat-grab');
const W = SPEC.windupMs, B = SPEC.biteMs;
const HIT = W + B;                       // ★命中が解決する瞬間

describe('★表', () => {
  it('シート名は<立ち絵名>-attack', () => expect(attackSheetName('bat-female')).toBe('bat-female-attack'));
  it('★表に載る立ち絵は実在する変種の絵であること(名前を間違えると一生出ない)', () => {
    const all = new Set(Object.values(ENEMY_VARIANT_SETS).flat());
    for (const n of Object.keys(ENEMY_ATTACK_SHEETS)) expect(all.has(n), n).toBe(true);
  });
  it('表に無い絵は0コマ', () => expect(attackSheetFrames('bat-male')).toBe(0));
});

describe('★★掟③「消え切る時刻 = 当たる時刻」', () => {
  it('★振り下ろしのコマ(4)は、命中が解決する瞬間にちょうど終わる', () => {
    expect(enemyAttackFrame(FR, HIT - 1, W, B)).toBe(4);
    expect(enemyAttackFrame(FR, HIT, W, B)).toBe(5);     // 解決した瞬間から振り抜きへ
  });
  it('★命中の前に振り下ろし切っていない(「下りているのにまだ当たらない」を作らない)', () => {
    const spans = attackFrameSpans(W, B, ATTACK_SETTLE_MS);
    const slam = spans.find(s => s.frame === 4)!;
    const hold = spans.find(s => s.frame === 3)!;
    expect(slam.untilMs).toBe(HIT);
    // 振り下ろしの窓は振りの一部でしかない=頭上の溜めが大半を持つ(読ませる時間)。
    expect(slam.untilMs - hold.untilMs).toBeLessThan(B * 0.5);
    expect(slam.untilMs - hold.untilMs).toBeGreaterThan(0);
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
    const spans = attackFrameSpans(W, B, ATTACK_SETTLE_MS);
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
    const a = attackFrameSpans(W, B, ATTACK_SETTLE_MS);
    const b = attackFrameSpans(W * 2, B * 2, ATTACK_SETTLE_MS);
    expect(b.find(s => s.frame === 4)!.untilMs).toBe((W + B) * 2);
    expect(a.find(s => s.frame === 4)!.untilMs).not.toBe(b.find(s => s.frame === 4)!.untilMs);
  });
});

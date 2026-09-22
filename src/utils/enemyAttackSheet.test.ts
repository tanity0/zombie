// ★攻撃モーション(社長支給2026-09-20「武器を振り下ろす絵」)の機械化。
// 描画側はテストしない(CLAUDE.md)——**いつどのコマを出すか**の純関数だけを固定する。
import { describe, it, expect } from 'vitest';
import {
  enemyAttackFrame, enemyAttackFrameFor, attackFrameSpans, ATTACK_SETTLE_MS, attackStillMs,
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
// 骸骨(女)= 9コマで**当たるコマだけ既定から外した**唯一の絵(振り下ろし6・戻り7,8)。
const FR_SF = ENEMY_ATTACK_SHEETS['skeleton-female'];
const IMP_SF = attackImpactFrame('skeleton-female');
const SPEC_S = biteSpecFor('skeleton');
// ゾンビ = 11コマ・**戻りが3コマ**(8,9,10)。溜めが600msと長い型でも拍が壊れないことを見る。
const FR_Z = ENEMY_ATTACK_SHEETS['zombie-common'];
const IMP_Z = attackImpactFrame('zombie-common');
const SPEC_Z = biteSpecFor('zombie');
const W_Z = SPEC_Z.windupMs, B_Z = SPEC_Z.biteMs;
const HIT_Z = W_Z + B_Z;
const W_S = SPEC_S.windupMs, B_S = SPEC_S.biteMs;
const HIT_S = W_S + B_S;

describe('★表', () => {
  it('シート名は<立ち絵名>-attack', () => expect(attackSheetName('bat-female')).toBe('bat-female-attack'));
  // ★**この検査は `enemySheetFiles.test.ts`(PNGが実在するか)へ移した**(v0.25.4563)。
  // 変種の表(`ENEMY_VARIANT_SETS`)は**男女2種などを持つ敵だけ**の表で、ハンターのように
  // 変種を持たない敵は載っていない=**正しい名前でも落ちる**。しかも**シート側のファイル名を
  // 1バイトも見ていなかった**ので、「名前を間違えると一生出ない」を捕まえられていなかった。

  // ★**名前を手書きしない**(素材が届くたびに落ちる。同じ壊れ方が5回目=ゾンビの噛みつき v0.25.4549)。
  it('表に無い絵は0コマ(表から導出する)', () => {
    const rest = Object.values(ENEMY_VARIANT_SETS).flat().filter(n => !(n in ENEMY_ATTACK_SHEETS));
    expect(rest.length, 'まだ攻撃シートの無い絵が1枚も無いなら、この検査は何も言っていない').toBeGreaterThan(0);
    for (const n of rest) expect(attackSheetFrames(n), n).toBe(0);
    expect(attackSheetFrames('この名前は存在しない')).toBe(0);
  });
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

describe('★★掟③: 当たるコマを既定から外しても成り立つ(骸骨の女=9コマ・振り下ろしは6)', () => {
  it('表の指定がそのまま効いている(既定の7ではない)', () => {
    expect(IMP_SF).toBe(6);
    expect(IMP_SF).not.toBe(FR_SF - 2);
  });
  it('★振り下ろしのコマは、命中が解決する瞬間にちょうど終わる', () => {
    expect(enemyAttackFrame(FR_SF, HIT_S - 1, W_S, B_S, ATTACK_SETTLE_MS, IMP_SF)).toBe(IMP_SF);
    expect(enemyAttackFrame(FR_SF, HIT_S, W_S, B_S, ATTACK_SETTLE_MS, IMP_SF)).toBe(IMP_SF + 1);
  });
  it('★戻りが2コマとも出る(当たった後に振り抜きが2コマある切り方)', () => {
    const seen = new Set<number>();
    for (let t = HIT_S; t < HIT_S + ATTACK_SETTLE_MS; t += 2) {
      const i = enemyAttackFrame(FR_SF, t, W_S, B_S, ATTACK_SETTLE_MS, IMP_SF);
      if (i !== null) seen.add(i);
    }
    expect(seen.has(7)).toBe(true);
    expect(seen.has(8)).toBe(true);
  });
  it('溜め明けには振り上げ切っている(5コマ目)', () => {
    expect(enemyAttackFrame(FR_SF, 0, W_S, B_S, ATTACK_SETTLE_MS, IMP_SF)).toBe(0);
    expect(enemyAttackFrame(FR_SF, W_S, W_S, B_S, ATTACK_SETTLE_MS, IMP_SF)).toBe(IMP_SF - 1);
  });
});

describe('★★掟③: 戻りが3コマでも成り立つ(ゾンビ=11コマ・噛むのは7)', () => {
  it('表の指定がそのまま効いている(既定の9ではない)', () => {
    expect(IMP_Z).toBe(7);
    expect(IMP_Z).not.toBe(FR_Z - 2);
  });
  it('★噛みつくコマは、命中が解決する瞬間にちょうど終わる', () => {
    expect(enemyAttackFrame(FR_Z, HIT_Z - 1, W_Z, B_Z, ATTACK_SETTLE_MS, IMP_Z)).toBe(IMP_Z);
    expect(enemyAttackFrame(FR_Z, HIT_Z, W_Z, B_Z, ATTACK_SETTLE_MS, IMP_Z)).toBe(IMP_Z + 1);
  });
  it('溜め明け(600ms)には伸び切っている(6コマ目)', () => {
    expect(enemyAttackFrame(FR_Z, 0, W_Z, B_Z, ATTACK_SETTLE_MS, IMP_Z)).toBe(0);
    expect(enemyAttackFrame(FR_Z, W_Z, W_Z, B_Z, ATTACK_SETTLE_MS, IMP_Z)).toBe(IMP_Z - 1);
  });
  it('★戻りの3コマ(8,9,10)が全部出る', () => {
    const seen = new Set<number>();
    for (let t = HIT_Z; t < HIT_Z + ATTACK_SETTLE_MS; t += 2) {
      const i = enemyAttackFrame(FR_Z, t, W_Z, B_Z, ATTACK_SETTLE_MS, IMP_Z);
      if (i !== null) seen.add(i);
    }
    for (const k of [8, 9, 10]) expect(seen.has(k), `コマ${k}`).toBe(true);
  });
  it('余韻を過ぎたら null(=歩き/立ち絵へ戻る)', () => {
    expect(enemyAttackFrame(FR_Z, HIT_Z + ATTACK_SETTLE_MS, W_Z, B_Z, ATTACK_SETTLE_MS, IMP_Z)).toBeNull();
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

// ★★社長報告2026-09-22「skeleton、攻撃の時、引っ掻きのモーション流れてる?」。
// 構えで止まる長さを**一律250ms**にしていたため、溜め300msの骸骨では**振り上げに50msしか残らず**、
// 5コマが1コマ10ms(60fpsで0.6フレーム)になって**3コマ飛んでいた**。
// 止まりを「溜め − 踏み込み」にして直した。**噛みの時刻は1msも動かしていない。**
describe('★★★どのシートも、画面で全コマが出る(コマ飛びを作らない)', () => {
  const TYPE: Record<string, Enemy['type']> = {
    'bat-female': 'bat', 'bat-male': 'bat',
    'skeleton-male': 'skeleton', 'skeleton-female': 'skeleton', 'zombie-common': 'zombie',
  };

  it('60fpsで1周ぶん見て、出ないコマが1枚も無い', () => {
    for (const key of Object.keys(ENEMY_ATTACK_SHEETS)) {
      const frames = ENEMY_ATTACK_SHEETS[key];
      const impact = attackImpactFrame(key);
      const type = TYPE[key];
      expect(type, `${key} の型が表に無い`).toBeDefined();
      const spec = biteSpecFor(type, type === 'bat' ? 'bat-grab' : undefined);
      const still = attackStillMs(spec.windupMs, spec.lungeMs);
      const seen = new Set<number>();
      for (let t = 0; t <= spec.windupMs + spec.biteMs + ATTACK_SETTLE_MS; t += 1000 / 60) {
        const f = enemyAttackFrame(frames, t, spec.windupMs, spec.biteMs, ATTACK_SETTLE_MS, impact, still);
        if (f !== null) seen.add(f);
      }
      expect(seen.size, `${key}: 出たコマ ${[...seen].sort((a, b) => a - b).join(',')} / ${frames}`).toBe(frames);
    }
  });

  it('★構えの止まりは「溜め − 踏み込み」。踏み込みが溜めを使い切る型だけコウモリの値', () => {
    expect(attackStillMs(300, 180)).toBe(120);            // 骸骨
    expect(attackStillMs(600, 300)).toBe(300);            // ゾンビ
    expect(attackStillMs(400, undefined)).toBe(BAT_WINDUP_STILL_MS);  // コウモリ(踏み込み=溜め)
    expect(attackStillMs(400, 400)).toBe(BAT_WINDUP_STILL_MS);
    expect(attackStillMs(100, undefined)).toBe(100);      // 溜めより長い止まりは作らない
  });

  it('★★噛みの時刻は止まりの長さに影響されない(掟③)', () => {
    for (const still of [60, 120, 250, 400]) {
      const frames = 9, impact = 7, W = 300, B = 200;
      expect(enemyAttackFrame(frames, W + B - 1, W, B, ATTACK_SETTLE_MS, impact, still)).toBe(impact);
      expect(enemyAttackFrame(frames, W + B, W, B, ATTACK_SETTLE_MS, impact, still)).toBe(impact + 1);
    }
  });
});

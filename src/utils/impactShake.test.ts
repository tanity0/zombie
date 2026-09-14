import { describe, it, expect } from 'vitest';
import {
  impactBase, impactRateMult, impactDamageOf, impactShakeFor, mergeImpactEntries, strongestImpact,
  IMPACT_BASE_MAX, IMPACT_HARD_MAX, IMPACT_RATE_REF_MS, IMPACT_MULT, IMPACT_FINISH_MAX, IMPACT_MELEE_MIN,
} from './impactShake';

describe('揺れの整理(research/SHAKE_UNIFY.md・社長承認2026-09-14)', () => {
  it('1層目: √ダメージで単調に増え、天井 BASE_MAX は150ダメ以上でしか着かない', () => {
    expect(impactBase(0)).toBe(0);
    expect(impactBase(7)).toBeLessThan(impactBase(12));
    expect(impactBase(12)).toBeLessThan(impactBase(52));
    expect(impactBase(52)).toBeLessThan(impactBase(140));
    expect(impactBase(140)).toBeLessThan(IMPACT_BASE_MAX); // 擲弾Ⅲ1体=天井の手前
    expect(impactBase(160)).toBe(IMPACT_BASE_MAX);
    expect(impactBase(-5)).toBe(0);
  });
  it('土台: 間隔が REF より短い源だけ絞る(マシンピストル100ms=1/3・ハンドガン420ms=等倍・未指定=等倍)', () => {
    expect(impactRateMult(100)).toBeCloseTo(100 / IMPACT_RATE_REF_MS, 9);
    expect(impactRateMult(420)).toBe(1);
    expect(impactRateMult(undefined)).toBe(1);
    expect(impactRateMult(0)).toBe(1);
  });
  it('ダメージの定義: 実効を残HPで切り(過剰分は数えない)、クリ倍率を外す', () => {
    expect(impactDamageOf(275, 1)).toBe(1);        // 残HP1にロケット275
    expect(impactDamageOf(30, 100, 1.5)).toBe(20); // クリ後30=クリ前20
    expect(impactDamageOf(30, 100)).toBe(30);
    expect(impactDamageOf(-3, 100)).toBe(0);
  });
  it('2層目: 倍率は掛け合わせ、HARD_MAX で止まる。被弾(16)より必ず小さい', () => {
    const rail = impactShakeFor(87);
    const railCrit = impactShakeFor(87, { crit: true });
    const railCritKill = impactShakeFor(87, { crit: true, kill: true });
    expect(railCrit.mag).toBeCloseTo(rail.mag * IMPACT_MULT.crit.mag, 9);
    expect(railCritKill.mag).toBe(IMPACT_HARD_MAX); // 6.1×1.6×1.3=12.7→11
    expect(IMPACT_HARD_MAX).toBeLessThan(16);
    expect(impactShakeFor(1000, { crit: true, kill: true, explosion: true }).mag).toBe(IMPACT_HARD_MAX);
  });
  it('社長裁定2026-09-14: 処刑(finish)だけ天井が高い(14)が被弾16は超えない。近接の床(minMag)は弱い一振りを持ち上げ、強い一振りには効かない', () => {
    expect(impactShakeFor(200, { finish: true }).mag).toBe(IMPACT_FINISH_MAX);
    expect(IMPACT_FINISH_MAX).toBeGreaterThan(IMPACT_HARD_MAX);
    expect(IMPACT_FINISH_MAX).toBeLessThan(16);
    const weak = strongestImpact(mergeImpactEntries([{ source: 'melee', damage: 12, flags: {}, x: 0, y: 0, minMag: IMPACT_MELEE_MIN }]));
    expect(weak?.mag).toBe(IMPACT_MELEE_MIN);
    const strong = strongestImpact(mergeImpactEntries([{ source: 'melee', damage: 60, flags: {}, x: 0, y: 0, minMag: IMPACT_MELEE_MIN }]));
    expect(strong?.mag).toBeCloseTo(impactShakeFor(60).mag, 9);
    expect(strongestImpact(mergeImpactEntries([{ source: 'melee', damage: 0, flags: {}, x: 0, y: 0, minMag: IMPACT_MELEE_MIN }]))).toBeNull();
  });
  it('長さは振幅に従い、性格はフラグの長さ倍率で残る(クリ=短く・爆発=長く)', () => {
    const plain = impactShakeFor(52);
    expect(impactShakeFor(52, { crit: true }).ms).toBeLessThan(plain.ms);
    expect(impactShakeFor(52, { explosion: true }).ms).toBeGreaterThan(plain.ms);
    expect(impactShakeFor(140).ms).toBeGreaterThan(impactShakeFor(7).ms);
    expect(plain.ms).toBeGreaterThanOrEqual(90);
    expect(impactShakeFor(7, { crit: true }, 100).ms).toBeGreaterThanOrEqual(90); // 最短の床(3コマのチラつきを出さない)
  });
  it('連射: マシンピストル1発(7・100ms)の揺れはハンドガン1発(9・420ms)よりはっきり小さい', () => {
    expect(impactShakeFor(7, {}, 100).mag).toBeLessThan(impactShakeFor(9, {}, 420).mag * 0.5);
  });
  it('事象の合算: 同じ source は合計・フラグは和・位置は平均。別 source は別事象', () => {
    const ev = mergeImpactEntries([
      { source: 'expl-1', damage: 40, flags: {}, x: 0, y: 0 },
      { source: 'expl-1', damage: 60, flags: { kill: true }, x: 10, y: 20 },
      { source: 'melee', damage: 12, flags: { crit: true }, x: 5, y: 5 },
    ]);
    expect(ev.length).toBe(2);
    const e1 = ev.find(e => e.source === 'expl-1')!;
    expect(e1.damage).toBe(100);
    expect(e1.flags.kill).toBe(true);
    expect(e1.x).toBe(5); expect(e1.y).toBe(10); expect(e1.count).toBe(2);
  });
  it('複数事象の重なりは強い方優先(合算しない)。全部0なら null', () => {
    const r = strongestImpact(mergeImpactEntries([
      { source: 'a', damage: 12, flags: {}, x: 1, y: 1 },
      { source: 'b', damage: 140, flags: { explosion: true }, x: 2, y: 2, away: false },
    ]));
    expect(r?.x).toBe(2);
    expect(r?.mag).toBeCloseTo(impactShakeFor(140, { explosion: true }).mag, 9);
    expect(strongestImpact(mergeImpactEntries([{ source: 'z', damage: 0, flags: {}, x: 0, y: 0 }]))).toBeNull();
  });
});

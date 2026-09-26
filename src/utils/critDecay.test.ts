// ★銃クリ減衰(§13-3e・社長裁定2026-08-26)の不変条件。
import { describe, it, expect, beforeEach } from 'vitest';
import {
  critDecayOnHit, resetCritDecay, peekCritDecay,
  CRIT_DECAY_STEP, CRIT_DECAY_WINDOW_MS, CRIT_DECAY_MAX, CRIT_DECAY_FLOOR,
} from './critDecay';

const K = 'p:enemy-1';

describe('critDecayOnHit(命中ベース+0.5秒窓・敵毎・武器切替でリセット)', () => {
  beforeEach(() => resetCritDecay());

  it('初手はフル(減衰なし)=「初手の手触りは良く」', () => {
    expect(critDecayOnHit(K, 'handgun-t3', 1000, 0.05)).toBe(0.05);
  });

  it('同じ窓の中の連打は積まない・窓を跨ぐと−1%(連射でも最速−2%/秒)', () => {
    critDecayOnHit(K, 'handgun-t3', 1000, 0.05);
    expect(critDecayOnHit(K, 'handgun-t3', 1100, 0.05)).toBe(0.05);          // 同じ窓=フルのまま
    expect(critDecayOnHit(K, 'handgun-t3', 1000 + CRIT_DECAY_WINDOW_MS, 0.05))
      .toBeCloseTo(0.05 - CRIT_DECAY_STEP, 6);                               // 窓跨ぎ=−1%
  });

  it('マシンピストル(5%)は2秒で下限1%へ・下限より下がらない', () => {
    let t = 0;
    let last = 0.05;
    for (let i = 0; i < 60; i++) { last = critDecayOnHit(K, 'handgun-t3', t, 0.05); t += 100; } // 6秒連射
    expect(last).toBe(CRIT_DECAY_FLOOR);
    expect(peekCritDecay(K)).toBeLessThanOrEqual(CRIT_DECAY_MAX);
  });

  it('最大減衰は−10%(高クリ武器は性格が残る)', () => {
    let t = 0;
    let last = 0.26;
    for (let i = 0; i < 200; i++) { last = critDecayOnHit(K, 'x', t, 0.26); t += 100; }
    expect(last).toBeCloseTo(0.26 - CRIT_DECAY_MAX, 6);
  });

  it('発射間隔が窓以上の銃(マグナム等)は回復が追いつき減衰しない', () => {
    let t = 0;
    let last = 0.20;
    for (let i = 0; i < 20; i++) { last = critDecayOnHit(K, 'rifle-t1', t, 0.20); t += 800; }
    expect(last).toBe(0.20);
    expect(peekCritDecay(K)).toBe(0);
  });

  it('撃つのをやめると+1%/0.5秒で回復する', () => {
    let t = 0;
    for (let i = 0; i < 30; i++) { critDecayOnHit(K, 'g', t, 0.13); t += 100; } // 3秒連射=−5%前後
    const before = peekCritDecay(K);
    expect(before).toBeGreaterThanOrEqual(0.05);
    // 1.5秒休む=+3%戻る(次の命中時にまとめて)。
    critDecayOnHit(K, 'g', t + 1500, 0.13);
    expect(peekCritDecay(K)).toBeCloseTo(Math.max(0, before - 3 * CRIT_DECAY_STEP), 6);
  });

  it('武器を切り替えるとフルに戻る(スイッチの有用性)', () => {
    let t = 0;
    for (let i = 0; i < 30; i++) { critDecayOnHit(K, 'handgun-t2', t, 0.13); t += 100; }
    expect(peekCritDecay(K)).toBeGreaterThan(0);
    expect(critDecayOnHit(K, 'shotgun-t3', t, 0.11)).toBe(0.11); // 切替初手=フル
    expect(peekCritDecay(K)).toBe(0);
  });

  it('敵毎に独立(相手を変えればフル・戻れば残っている)', () => {
    let t = 0;
    for (let i = 0; i < 30; i++) { critDecayOnHit('p:e1', 'g', t, 0.13); t += 100; }
    const e1 = peekCritDecay('p:e1');
    expect(e1).toBeGreaterThan(0);
    expect(critDecayOnHit('p:e2', 'g', t, 0.13)).toBe(0.13); // 別個体=フル
    expect(peekCritDecay('p:e1')).toBe(e1);                  // e1の記憶は残る
  });

  it('元のクリ率が下限未満(PHILL=0%)なら触らない=減衰で上がらない', () => {
    let t = 0;
    for (let i = 0; i < 30; i++) { critDecayOnHit(K, 'phill-revolver', t, 0); t += 100; }
    expect(critDecayOnHit(K, 'phill-revolver', t, 0)).toBe(0);
  });
});

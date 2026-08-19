// research/GHOST_BOSS.md(守護霊ボス「幻影」)の純関数と、配線の不変条件を機械で固定する。
//
// ここで守りたいのは「実装が動くか」ではなく、**設計の意図が壊れていないか**:
//  ① 技の選び方が距離の表どおりか(近=近接 / 中=一閃or銃 / 遠=銃)
//  ② 動きに慣性があるか(等速で始まって瞬間停止しない)
//  ③ 台帳のデータが本当に効いているか(間合い・反応・銃の基礎値が守護霊台帳から来ている)
//  ④ 州名が命名規約どおりで、カウンター成立域の宣言と食い違わないか
import { describe, it, expect } from 'vitest';
import {
  pickPhantomMove, ISSEN_MID_CHANCE, phantomEase, phantomIssenOffsetPx, phantomProfile, phantomShotDamage,
  createPhantomTickState, pickActivePhantom,
  GUARDIAN_PHANTOM_WINDUP_STATES, GUARDIAN_PHANTOM_RECOVER_STATES, GUARDIAN_PHANTOM_TYPE,
} from './phantomTick';
import { GUARDIAN_PHANTOM_TUNING as GP_T } from './phantomScript';
import { counterReachKindFor } from './counterReach';
import { parseMovePhase, isNeutralMoveState } from './moveCancelGuard';
import { strongestGuardian } from '../data/fixedGuardians';
import { createWeapon } from './weaponUtils';
import type { Enemy } from '../types/game';

describe('① 技の選び方(設計書の距離の表)', () => {
  const pref = 95; // 台帳(鴉)の preferredDist と同じ桁の値

  it('近(preferredDist以内)は必ず近接', () => {
    for (const intent of ['melee', 'shoot'] as const) {
      expect(pickPhantomMove(0, pref, intent)).toBe('gp-melee');
      expect(pickPhantomMove(pref, pref, intent)).toBe('gp-melee');
    }
  });

  // ★v0.25.3632(成果物監査・重大1の機械化): 旧仕様「中距離は intent==='melee' でだけ一閃」は、
  // decideGhost の melee 意図が縁距離74px以内(=近接帯の中)でしか立たないため**空集合**で、
  // 一閃が一度も発動しなかった。中距離は抽選(ISSEN_MID_CHANCE)で一閃の入口が実在することを固定する。
  it('中(一閃の射程内)は抽選: 乱数が閾値未満なら一閃 / 以上なら銃撃(近接意図なら確定一閃)', () => {
    const mid = (pref + GP_T.issen.reach) / 2;
    expect(pickPhantomMove(mid, pref, 'melee', 0.99)).toBe('gp-issen'); // 意図があれば確定
    expect(pickPhantomMove(mid, pref, 'shoot', 0.0)).toBe('gp-issen'); // 抽選当たり
    expect(pickPhantomMove(mid, pref, 'shoot', ISSEN_MID_CHANCE)).toBe('gp-shot'); // 抽選はずれ
    expect(pickPhantomMove(mid, pref, 'shoot', 0.99)).toBe('gp-shot');
  });

  it('★【不変条件】一閃の入口が実在する(抽選確率が0になっていない)', () => {
    expect(ISSEN_MID_CHANCE).toBeGreaterThan(0);
  });

  it('遠(一閃の射程外)は必ず銃撃', () => {
    for (const intent of ['melee', 'shoot'] as const) {
      expect(pickPhantomMove(GP_T.issen.reach + 1, pref, intent)).toBe('gp-shot');
      expect(pickPhantomMove(5000, pref, intent)).toBe('gp-shot');
    }
  });
});

describe('② 慣性(CLAUDE.md MUST: 加減速のない動きは禁止)', () => {
  it('イーズは 0→1 で単調増加し、両端の速度が 0(等速で始まらない/瞬間停止しない)', () => {
    expect(phantomEase(0)).toBe(0);
    expect(phantomEase(1)).toBe(1);
    let prev = -1;
    for (let i = 0; i <= 20; i++) {
      const v = phantomEase(i / 20);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
    // 両端の傾き ≈ 0(=加速して始まり、減速して終わる)。中央の傾きより明確に小さいこと。
    const d = 0.02;
    const slopeStart = (phantomEase(d) - phantomEase(0)) / d;
    const slopeEnd = (phantomEase(1) - phantomEase(1 - d)) / d;
    const slopeMid = (phantomEase(0.5 + d) - phantomEase(0.5 - d)) / (2 * d);
    expect(slopeStart).toBeLessThan(slopeMid * 0.3);
    expect(slopeEnd).toBeLessThan(slopeMid * 0.3);
  });

  it('一閃の踏み込みは帯の中に収まる(斬り抜けて相手の向こうへワープしない)', () => {
    expect(phantomIssenOffsetPx(0)).toBe(0);
    expect(phantomIssenOffsetPx(1)).toBeCloseTo(GP_T.issen.reach * GP_T.issenTravelFrac, 6);
    expect(phantomIssenOffsetPx(1)).toBeLessThan(GP_T.issen.reach);
  });
});

describe('③ 台帳のデータが効いている(数値を発明していない)', () => {
  it('頭脳へ渡すプロファイルは守護霊台帳の最強データそのもの', () => {
    const src = strongestGuardian().profile;
    const p = phantomProfile();
    expect(p.preferredDist).toBe(src.preferredDist);
    expect(p.counterChance).toBe(src.counterChance);
    expect(p.reactionMs).toBe(src.reactionMs);
    expect(p.meleeBias).toBe(src.meleeBias);
    expect(p.mobility).toBe(src.mobility);
    expect(p.stationaryFrac).toBe(src.stationaryFrac);
    expect(p.approachPerMin).toBe(src.approachPerMin);
  });

  it('銃撃のダメージは台帳の装備銃の基礎値から導出(下限あり)', () => {
    const key = strongestGuardian().profile.snapshot!.activeGunKey!;
    const base = createWeapon(key).damage;
    expect(phantomShotDamage()).toBe(Math.max(GP_T.shot.damageFloor, Math.round(base)));
    expect(phantomShotDamage()).toBeGreaterThanOrEqual(GP_T.shot.damageFloor);
  });
});

describe('④ 州名と成立域の宣言', () => {
  it('全ての州が命名規約(-windup / -active / -recover)に乗る=moveCancelGuardが読める', () => {
    for (const st of [...GUARDIAN_PHANTOM_WINDUP_STATES, ...GUARDIAN_PHANTOM_RECOVER_STATES]) {
      expect(isNeutralMoveState(st), st).toBe(false);
      const ref = parseMovePhase(st);
      expect(ref, st).not.toBeNull();
      expect(ref!.move.startsWith('gp-'), st).toBe(true);
    }
  });

  it('溜めは帯(=赤い予告の図形)で成立し、硬直は体の重なりで成立する', () => {
    for (const st of GUARDIAN_PHANTOM_WINDUP_STATES) {
      expect(counterReachKindFor(`gp:${st}`), st).toBe('band');
    }
    for (const st of GUARDIAN_PHANTOM_RECOVER_STATES) {
      expect(counterReachKindFor(`gp:${st}`), st).toBe('body');
    }
  });

  it('銃撃はカウンター可能州に載せない(弾は既存の打ち返し文法で返す)', () => {
    const all = [...GUARDIAN_PHANTOM_WINDUP_STATES, ...GUARDIAN_PHANTOM_RECOVER_STATES];
    expect(all.some(s => s.startsWith('gp-shot'))).toBe(false);
  });
});

describe('⑤ ラン内状態と個体の拾い方', () => {
  const fake = (type: Enemy['type'], id: string): Enemy => ({
    id, x: 0, y: 0, width: 10, height: 10, speed: 0, health: 1, maxHealth: 1,
    damage: 0, type, experienceValue: 0, lastHit: 0, lastShot: 0,
  });

  it('新しいラン内状態は「まだ誰も制御していない」から始まる', () => {
    const s = createPhantomTickState();
    expect(s.activeId).toBeNull();
    expect(s.nextMoveAt).toBe(0); // 初回は休みなしで動ける
    expect(s.shotsRemaining).toBe(0);
  });

  it('盤面から幻影だけを拾う(他のボス/雑魚は拾わない)', () => {
    expect(pickActivePhantom([fake('zombie', 'a'), fake('giantbat', 'b')])).toBeUndefined();
    const gp = fake(GUARDIAN_PHANTOM_TYPE, 'gp');
    expect(pickActivePhantom([fake('zombie', 'a'), gp])?.id).toBe('gp');
  });
});

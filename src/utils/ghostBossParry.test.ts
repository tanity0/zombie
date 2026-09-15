// v0.25.2480(DEVELOPMENT_LOG v0.25.2479★未決1解消): 城ボス系の守護霊カウンター合流で切り出した
// 2つの純ヘルパの検証。
//  - isDashParryCounterPhase: プレイヤーの接触パリィ(combatTick.applyContactDamage内dashParried)の
//    対象フェーズ表と同一であること(特に giantbat の windup を含めない=W4「予告を出したら必ず実行」)。
//  - dashParriedEnemyPatch: 中断+攻め手から弾き飛ばすノックバック変換(プレイヤー経路から切り出し・挙動同一)。
import { describe, it, expect } from 'vitest';
import { isDashParryCounterPhase, dashParriedEnemyPatch } from './combatTick';
import {
  COUNTER_KNOCKBACK_LAUNCH, COUNTER_KNOCKBACK_SPEED, KNOCKBACK_DURATION,
} from '../store/gameStore';
import type { Enemy } from '../types/game';

const enemy = (over: Partial<Enemy> = {}): Enemy =>
  ({ id: 'e1', type: 'giantbat', x: 100, y: 100, width: 40, height: 40, health: 100, ...over } as unknown as Enemy);

describe('isDashParryCounterPhase: プレイヤーのdashParried対象フェーズ表と同一', () => {
  // ★カウンター憲法(社長裁定2026-08-26・v0.25.3947)「攻撃判定と窓が重なった時だけがカウンター成立」:
  // 接触パリィは**接触ダメージが生きている突進の走りだけ**。空中(被弾しない=判定ゼロ)・
  // recover/crouch(接触ダメージなし)・全g-*-recoverは対象外になった(W7/v3050/v2601/v3052は憲法が上書き)。
  it('接触ダメージが生きている突進の走り(charge / g-dash-charge)だけがパリィ対象', () => {
    expect(isDashParryCounterPhase({ type: 'pumpkin', aiPhase: 'charge' })).toBe(true);
    expect(isDashParryCounterPhase({ type: 'giantbat', aiPhase: 'g-dash-charge' })).toBe(true);
  });
  it('憲法: recover/crouch/空中(jump/g-jump-air/g-trijump-air/g-glide-active)は判定ゼロ=対象外', () => {
    for (const ph of ['recover', 'crouch', 'jump', 'g-jump-air'] as Enemy['aiPhase'][]) {
      expect(isDashParryCounterPhase({ type: 'pumpkin', aiPhase: ph })).toBe(false);
    }
    expect(isDashParryCounterPhase({ type: 'giantbat', aiPhase: 'g-trijump-air' })).toBe(false);
    expect(isDashParryCounterPhase({ type: 'giantbat', aiPhase: 'g-glide-active' })).toBe(false);
  });
  it('憲法: 城ボスの全硬直(g-*-recover)と実行中でも判定の無い薙ぎ(g-sweep-active)は対象外', () => {
    for (const ph of [
      'g-sweep-active',
      'g-stomp-recover', 'g-sweep-recover', 'g-dash-recover', 'g-jump-recover', 'g-bolt-recover',
      'g-bite-recover', 'g-slam-recover', 'g-wing-recover', 'g-glide-recover', 'g-dive-recover',
      'g-quad-recover', 'g-nova-recover', 'g-trishot-recover', 'g-sweepbeam-recover',
      'g-trijump-recover', 'g-talon-recover', 'g-boon-recover', 'g-reach-recover', 'g-nihil-recover',
    ] as Enemy['aiPhase'][]) {
      expect(isDashParryCounterPhase({ type: 'giantbat', aiPhase: ph })).toBe(false);
    }
  });
  it('giantbatのwindupは対象外(W4「予告を出したら必ず実行させる」を守護霊も破らない)', () => {
    for (const ph of ['g-stomp-windup', 'g-sweep-windup', 'g-dash-windup', 'g-jump-windup', 'g-bolt-windup'] as Enemy['aiPhase'][]) {
      expect(isDashParryCounterPhase({ type: 'giantbat', aiPhase: ph })).toBe(false);
    }
  });
  it('giantbat以外はg-*固有フェーズでパリィ対象にならない/フェーズ無しは対象外', () => {
    expect(isDashParryCounterPhase({ type: 'pumpkin', aiPhase: 'g-dash-charge' })).toBe(false);
    expect(isDashParryCounterPhase({ type: 'giantbat', aiPhase: undefined })).toBe(false);
  });
  it('三連突進(g-quad-charge)はカウンター不可の技(社長裁定v0.25.3049・予告は紫)——表に加えない', () => {
    expect(isDashParryCounterPhase({ type: 'giantbat', aiPhase: 'g-quad-charge' })).toBe(false);
  });
});

describe('dashParriedEnemyPatch: 技の中断+攻め手から弾き飛ばす変換', () => {
  it('技の状態を全解除し、攻め手の反対向きへ弾き飛ばす(aiReadyAt=gameTime+1200)', () => {
    const e = enemy({ aiPhase: 'charge', aiPhaseUntil: 999, aiTargetX: 1, aiFromX: 2, stunUntil: 500 } as Partial<Enemy>);
    // 攻め手=敵中心(120,120)の左(20,120)→ 右(+x)へ弾く。
    const r = dashParriedEnemyPatch(e, 20, 120, 5000, 3000);
    expect(r.aiPhase).toBeUndefined();
    expect(r.aiPhaseUntil).toBeUndefined();
    expect(r.aiTargetX).toBeUndefined();
    expect(r.aiFromX).toBeUndefined();
    expect(r.stunUntil).toBeUndefined();
    expect(r.aiReadyAt).toBe(3000 + 1200);
    expect(r.x).toBeCloseTo(100 + COUNTER_KNOCKBACK_LAUNCH, 6);
    expect(r.y).toBeCloseTo(100, 6);
    expect(r.knockbackVx).toBeCloseTo(COUNTER_KNOCKBACK_SPEED, 6);
    expect(r.knockbackVy).toBeCloseTo(0, 6);
    expect(r.knockbackUntil).toBe(5000 + KNOCKBACK_DURATION);
    expect(r.knockbackImmuneUntil).toBe(0);
  });
  it('攻め手と重なっている(距離<12)時は突進してきた向きの逆=aiFrom→現在の向きへ弾く', () => {
    // aiFrom(40,100)→現在(100,100)=+x向きに突進してきた → +xへ弾き返す。
    const e = enemy({ aiFromX: 40, aiFromY: 100 } as Partial<Enemy>); // e.x-aiFromX=+60 → +x
    const r = dashParriedEnemyPatch(e, 120, 120, 5000, 3000); // 攻め手=敵中心と同座標(d=0<12)
    expect(r.x).toBeCloseTo(100 + COUNTER_KNOCKBACK_LAUNCH, 6);
    expect(r.knockbackVx).toBeCloseTo(COUNTER_KNOCKBACK_SPEED, 6);
  });
});

// v0.25.3145(社長指示「尻尾攻撃、カウンターで中断しないで」): 尻尾の叩きつけ→弾の連射は
// 「叩きつけたら必ず撃ち切る」1つの技。カウンターは**成立するが技は止めない**。
describe('dashParriedEnemyPatch: 中断しない技(尻尾の叩きつけ→弾連射)', () => {
  const TAILSLAM = ['g-tailslam-windup', 'g-tailslam-active', 'g-tailslam-volley', 'g-tailslam-recover'];
  it('尻尾の全フェーズで技の状態を1つも消さない(残りの連射が出る)', () => {
    for (const ph of TAILSLAM as Enemy['aiPhase'][]) {
      const e = enemy({ aiPhase: ph, aiPhaseUntil: 999, aiTargetX: 1, aiTargetY: 2, aiFromX: 3, aiFromY: 4, aiStartedAt: 7 } as Partial<Enemy>);
      const r = dashParriedEnemyPatch(e, 20, 120, 5000, 3000);
      expect(r.aiPhase).toBe(ph);
      expect(r.aiPhaseUntil).toBe(999);
      expect(r.aiStartedAt).toBe(7);
      // 帯の座標(=判定の正本)も残す。消すと予告と判定がズレる。
      expect([r.aiFromX, r.aiFromY, r.aiTargetX, r.aiTargetY]).toEqual([3, 4, 1, 2]);
    }
  });
  it('カウンターの報酬(弾き飛ばし)は従来どおり入る=「技を止めない」だけの免除', () => {
    const e = enemy({ aiPhase: 'g-tailslam-volley' } as Partial<Enemy>);
    const r = dashParriedEnemyPatch(e, 20, 120, 5000, 3000);
    expect(r.x).toBeCloseTo(100 + COUNTER_KNOCKBACK_LAUNCH, 6); // 攻め手の反対(+x)へ
    expect(r.knockbackUntil).toBe(5000 + KNOCKBACK_DURATION);
    expect(r.knockbackVx).toBeCloseTo(COUNTER_KNOCKBACK_SPEED, 6);
  });
  it('他の技は従来どおり中断される(免除は尻尾だけ)', () => {
    for (const ph of ['g-reach-recover', 'g-talon-recover', 'charge'] as Enemy['aiPhase'][]) {
      expect(dashParriedEnemyPatch(enemy({ aiPhase: ph } as Partial<Enemy>), 20, 120, 5000, 3000).aiPhase).toBeUndefined();
    }
  });
});

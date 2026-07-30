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
  it('汎用フェーズ(charge/recover/crouch/jump/g-jump-air)は型を問わずパリィ対象', () => {
    for (const ph of ['charge', 'recover', 'crouch', 'jump', 'g-jump-air'] as Enemy['aiPhase'][]) {
      expect(isDashParryCounterPhase({ type: 'pumpkin', aiPhase: ph })).toBe(true);
    }
  });
  it('giantbat固有は実行中2種+硬直5種のみ(M51受け入れ条件5)', () => {
    for (const ph of ['g-dash-charge', 'g-sweep-active', 'g-stomp-recover', 'g-sweep-recover', 'g-dash-recover', 'g-jump-recover', 'g-bolt-recover'] as Enemy['aiPhase'][]) {
      expect(isDashParryCounterPhase({ type: 'giantbat', aiPhase: ph })).toBe(true);
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

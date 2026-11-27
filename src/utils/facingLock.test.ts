import { describe, it, expect } from 'vitest';
import { facingLockedAfterAttack, type FacingLockAfterAttackInput } from './facingLock';
import { emptyDashState } from './dashLocomotion';
import { MELEE_RECOVER_MS } from './meleeRecover';
import { MELEE_AFTER_STOP_RAMP_MS, type MeleeAfterWeapon } from './meleeAfterMove';
import { KNIFE_COMBO_FINISH_RECOVERY_MS } from './knifeCombo';
import { WHIP_COMBO_FINISH_STOP_MS, WHIP_COMBO_FINISH_RECOVERY_MS } from './whipCombo';

const SWING = 368; // PLAYER_MELEE_SWING_MS
const END = 400 + MELEE_RECOVER_MS; // COUNTER_WINDOW + MELEE_RECOVER_MS
const T0 = 100000;

const input = (weapon: MeleeAfterWeapon, since: number, stage = 1, over: Partial<FacingLockAfterAttackInput> = {}): FacingLockAfterAttackInput => ({
  weapon, nowMs: T0 + since, swingStartAt: T0, swingCycleMs: SWING, recoverEndMs: END,
  whipComboStage: weapon === 'whip' ? stage : 0, whipComboAt: weapon === 'whip' ? T0 : 0,
  knifeComboStage: weapon === 'knife' ? stage : 0, knifeComboAt: weapon === 'knife' ? T0 : 0,
  dash: emptyDashState(), tsubameCrouchUntil: 0, shijinSlideUntil: 0,
  ...over,
});

describe('facingLockedAfterAttack(攻撃の後で止まっている間は向きを変えない)', () => {
  it('ナイフ1・2段目: 振りの後の硬直(止まり)の間だけ止める・明けて動き出したら向ける', () => {
    for (const stage of [1, 2]) {
      expect(facingLockedAfterAttack(input('knife', SWING, stage))).toBe(true);
      expect(facingLockedAfterAttack(input('knife', END - 1, stage))).toBe(true);
      expect(facingLockedAfterAttack(input('knife', END + MELEE_AFTER_STOP_RAMP_MS / 2, stage))).toBe(false);
      expect(facingLockedAfterAttack(input('knife', END + MELEE_AFTER_STOP_RAMP_MS + 1, stage))).toBe(false);
    }
  });
  it('ナイフ3段目: 後の隙の間ずっと止める', () => {
    for (let t = 0; t < KNIFE_COMBO_FINISH_RECOVERY_MS; t += 50) expect(facingLockedAfterAttack(input('knife', t, 3))).toBe(true);
    expect(facingLockedAfterAttack(input('knife', KNIFE_COMBO_FINISH_RECOVERY_MS + 30, 3, { swingStartAt: 0 }))).toBe(false);
  });
  it('鞭: 3段目の後の隙の前半(止まり)だけ止める・後半の戻り(動ける)と振りの後の重い硬直(動ける)は止めない', () => {
    expect(facingLockedAfterAttack(input('whip', 10, 3, { swingStartAt: 0 }))).toBe(true);
    expect(facingLockedAfterAttack(input('whip', WHIP_COMBO_FINISH_STOP_MS, 3, { swingStartAt: 0 }))).toBe(true);
    expect(facingLockedAfterAttack(input('whip', WHIP_COMBO_FINISH_STOP_MS + 50, 3, { swingStartAt: 0 }))).toBe(false);
    expect(facingLockedAfterAttack(input('whip', WHIP_COMBO_FINISH_RECOVERY_MS + 10, 3, { swingStartAt: 0 }))).toBe(false);
    expect(facingLockedAfterAttack(input('whip', SWING + 20, 1))).toBe(false); // 1段目の後=重いが動ける
  });
  it('刀・格闘: 振りの後の重い硬直(動ける)は止めない', () => {
    expect(facingLockedAfterAttack(input('katana', SWING + 20))).toBe(false);
    expect(facingLockedAfterAttack(input('brawler', SWING + 20))).toBe(false);
  });
  it('刀の着地の硬直(居合一閃の溜め・殺陣も同じ欄)は止める・明けたら止めない', () => {
    const dash = { ...emptyDashState(), katanaRecoveryUntil: T0 + 200 };
    expect(facingLockedAfterAttack(input('katana', 100, 1, { swingStartAt: 0, dash }))).toBe(true);
    expect(facingLockedAfterAttack(input('katana', 200, 1, { swingStartAt: 0, dash }))).toBe(false);
  });
  it('一閃の走りの間は止めない・燕返しのしゃがみの間は止める', () => {
    const dash = { ...emptyDashState(), katanaDashUntil: T0 + 300, katanaRecoveryUntil: T0 + 500 };
    expect(facingLockedAfterAttack(input('katana', 100, 1, { swingStartAt: 0, dash }))).toBe(false);
    expect(facingLockedAfterAttack(input('katana', 100, 1, { swingStartAt: 0, dash, tsubameCrouchUntil: T0 + 300 }))).toBe(true);
  });
  it('ワイヤーの走り・四神舞の滑りの間は止めない(硬直の倍率が掛からない)', () => {
    const wire = { ...emptyDashState(), wireDashUntil: T0 + 2000 };
    expect(facingLockedAfterAttack(input('knife', SWING + 20, 1, { dash: wire }))).toBe(false);
    expect(facingLockedAfterAttack(input('knife', SWING + 20, 1, { shijinSlideUntil: T0 + 2000 }))).toBe(false);
  });
  it('何も振っていなければ止めない', () => {
    expect(facingLockedAfterAttack(input('knife', 5000, 0, { swingStartAt: 0, knifeComboAt: 0 }))).toBe(false);
  });
});

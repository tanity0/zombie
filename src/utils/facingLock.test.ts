import { describe, it, expect } from 'vitest';
import { facingLockedAfterAttack, facingHoldActive, holdFacingInput, swingStartFacing, heldFacingAfterTick, aimForSwingFacing, type FacingLockAfterAttackInput } from './facingLock';
import { emptyDashState } from './dashLocomotion';
import { MELEE_RECOVER_MS } from './meleeRecover';
import { MELEE_AFTER_STOP_RAMP_MS, type MeleeAfterWeapon } from './meleeAfterMove';
import { KNIFE_COMBO_FINISH_RECOVERY_MS } from './knifeCombo';
import { WHIP_COMBO_FINISH_STOP_MS, WHIP_COMBO_FINISH_RECOVERY_MS } from './whipCombo';

const SWING = 368; // PLAYER_MELEE_SWING_MS
const END = 400 + MELEE_RECOVER_MS; // COUNTER_WINDOW + MELEE_RECOVER_MS
const T0 = 100000;
const KEND = 500; // ★ナイフの1・2段目の後の止まりが明ける時刻(社長裁定2026-11-27)

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
      expect(facingLockedAfterAttack(input('knife', KEND - 1, stage))).toBe(true);
      expect(facingLockedAfterAttack(input('knife', KEND + MELEE_AFTER_STOP_RAMP_MS / 2, stage))).toBe(false);
      expect(facingLockedAfterAttack(input('knife', KEND + MELEE_AFTER_STOP_RAMP_MS + 1, stage))).toBe(false);
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

describe('止まり中に入れた向きを覚えて次の振りの振り始めでその向きへ振る(社長裁定2026-11-27)', () => {
  it('覚える間=振りの最中か攻撃の後の止まり中', () => {
    expect(facingHoldActive(T0, T0 + 10, SWING, false)).toBe(true);
    expect(facingHoldActive(T0, T0 + SWING - 1, SWING, false)).toBe(true);
    expect(facingHoldActive(T0, T0 + SWING, SWING, false)).toBe(false);
    expect(facingHoldActive(T0, T0 + SWING + 50, SWING, true)).toBe(true);
    expect(facingHoldActive(0, T0, SWING, false)).toBe(false);
    expect(facingHoldActive(undefined, T0, SWING, false)).toBe(false);
  });
  it('入れた向きを覚える・指を離した(向き無し)は前の覚えを残す', () => {
    const left = { x: -1, y: 0 };
    expect(holdFacingInput(undefined, left)).toEqual(left);
    expect(holdFacingInput(left, null)).toEqual(left);
    expect(holdFacingInput(left, { x: 0, y: 0 })).toEqual(left);
    expect(holdFacingInput(left, { x: 0, y: 1 })).toEqual({ x: 0, y: 1 });
  });
  it('振り始め: 覚える間に覚えた向きがあればその向き・無ければ今の向き', () => {
    const right = { x: 1, y: 0 }, left = { x: -1, y: 0 };
    expect(swingStartFacing(right, left, true)).toEqual(left);
    expect(swingStartFacing(right, undefined, true)).toBe(right);
    expect(swingStartFacing(right, left, false)).toBe(right); // 明けた後は今どおり
  });
  it('向き直した時の照準: 長さはそのまま・向きだけ合わせる(照準が無ければそのまま)', () => {
    const a = aimForSwingFacing(0.6, 0, { x: -1, y: 0 });
    expect(a.aimX).toBeCloseTo(-0.6); expect(a.aimY).toBeCloseTo(0);
    expect(aimForSwingFacing(0, 0, { x: -1, y: 0 })).toEqual({ aimX: 0, aimY: 0 });
  });
  it('覚える間が明けたら捨てる', () => {
    const left = { x: -1, y: 0 };
    expect(heldFacingAfterTick(left, true)).toBe(left);
    expect(heldFacingAfterTick(left, false)).toBeUndefined();
  });
  it('ナイフ1段目を右へ振った止まり中(368〜500ms)に左を入れる→2段目(400ms)は左へ振る', () => {
    let held = holdFacingInput(undefined, { x: -1, y: 0 }); // 止まり中に左
    const at = 380;
    const active = facingHoldActive(T0, T0 + at, SWING, facingLockedAfterAttack(input('knife', at, 1)));
    expect(active).toBe(true);
    held = heldFacingAfterTick(held, active);
    const swing2 = 400;
    const active2 = facingHoldActive(T0, T0 + swing2, SWING, facingLockedAfterAttack(input('knife', swing2, 1)));
    expect(swingStartFacing({ x: 1, y: 0 }, held, active2)).toEqual({ x: -1, y: 0 });
  });
});

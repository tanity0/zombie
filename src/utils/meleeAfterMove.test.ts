import { describe, it, expect } from 'vitest';
import { meleeAfterMoveMult, meleeAfterMoveMultLegacy, MELEE_AFTER_STOP_RAMP_MS, MELEE_AFTER_STOP_END_MS, type MeleeAfterMoveInput, type MeleeAfterWeapon } from './meleeAfterMove';
import { MELEE_RECOVER_MS } from './meleeRecover';
import { KNIFE_COMBO_FINISH_RECOVERY_MS } from './knifeCombo';

const SWING = 368; // PLAYER_MELEE_SWING_MS
const END = 400 + MELEE_RECOVER_MS; // COUNTER_WINDOW + MELEE_RECOVER_MS
const T0 = 100000;
const KEND = 500; // ★ナイフの1・2段目の後の止まりが明ける時刻(社長裁定2026-11-27・旧 END=640)

const input = (weapon: MeleeAfterWeapon, since: number, stage: number, over: Partial<MeleeAfterMoveInput> = {}): MeleeAfterMoveInput => ({
  weapon, nowMs: T0 + since, swingStartAt: T0, swingCycleMs: SWING, recoverEndMs: END,
  whipComboStage: weapon === 'whip' ? stage : 0, whipComboAt: weapon === 'whip' ? T0 : 0,
  knifeComboStage: weapon === 'knife' ? stage : 0, knifeComboAt: weapon === 'knife' ? T0 : 0,
  ...over,
});

describe('meleeAfterMoveMult(攻撃後の歩く速さ・ナイフは重い区間を止める)', () => {
  it('ナイフの止まりが明ける時刻は振り始めから0.5秒(社長裁定2026-11-27)', () => {
    expect(MELEE_AFTER_STOP_END_MS.knife).toBe(KEND);
    expect(MELEE_AFTER_STOP_END_MS.whip).toBeUndefined();
    expect(MELEE_AFTER_STOP_END_MS.katana).toBeUndefined();
    expect(MELEE_AFTER_STOP_END_MS.brawler).toBeUndefined();
  });

  it('ナイフ1・2段目: 振りの絵の間は1・硬直の間は0・振り始めから0.5秒で明ける・後ろに立ち上がり', () => {
    for (const stage of [1, 2]) {
      expect(meleeAfterMoveMult(input('knife', SWING - 1, stage))).toBe(1);
      expect(meleeAfterMoveMult(input('knife', SWING, stage))).toBe(0);
      expect(meleeAfterMoveMult(input('knife', KEND - 1, stage))).toBe(0);
      expect(meleeAfterMoveMult(input('knife', KEND + 1, stage))).toBeGreaterThan(0);
      // 今の作りではこの区間は 0〜1 の間(重い)
      const legacy = meleeAfterMoveMultLegacy(input('knife', SWING + 50, stage));
      expect(legacy).toBeGreaterThan(0);
      expect(legacy).toBeLessThan(1);
      const mid = meleeAfterMoveMult(input('knife', KEND + MELEE_AFTER_STOP_RAMP_MS / 2, stage));
      expect(mid).toBeGreaterThan(0);
      expect(mid).toBeLessThan(1);
      expect(meleeAfterMoveMult(input('knife', KEND + MELEE_AFTER_STOP_RAMP_MS, stage))).toBe(1);
    }
  });

  it('ナイフ3段目: 隙の終わりまで全部0(後半の戻りも0)・明けの後ろに立ち上がり', () => {
    for (let t = 0; t < KNIFE_COMBO_FINISH_RECOVERY_MS; t += 16) {
      expect(meleeAfterMoveMult(input('knife', t, 3))).toBe(0);
    }
    const end = KNIFE_COMBO_FINISH_RECOVERY_MS;
    expect(meleeAfterMoveMult(input('knife', end, 3))).toBe(0);
    expect(meleeAfterMoveMult(input('knife', end + 20, 3))).toBeGreaterThan(0);
    expect(meleeAfterMoveMult(input('knife', end + MELEE_AFTER_STOP_RAMP_MS, 3))).toBe(1);
  });

  it('ナイフの立ち上がりは単調に増え、加減速つき(出だしと終わりが緩い)', () => {
    let prev = -1;
    const vals: number[] = [];
    for (let t = 0; t <= MELEE_AFTER_STOP_RAMP_MS; t += 10) {
      const v = meleeAfterMoveMult(input('knife', KEND + t, 1));
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v; vals.push(v);
    }
    expect(vals[1] - vals[0]).toBeLessThan(vals[5] - vals[4]); // 加速
    expect(vals[10] - vals[9]).toBeLessThan(vals[5] - vals[4]); // 減速
  });

  it('ナイフ以外(鞭・刀・格闘)は今と同じ値', () => {
    for (const weapon of ['whip', 'katana', 'brawler'] as const) {
      for (const stage of [1, 2, 3]) {
        for (let t = -50; t <= 1300; t += 8) {
          const i = input(weapon, t, stage);
          expect(meleeAfterMoveMult(i)).toBe(meleeAfterMoveMultLegacy(i));
        }
      }
    }
  });

  it('まだ振っていない時は全武器で1', () => {
    for (const weapon of ['knife', 'whip', 'katana', 'brawler'] as const) {
      expect(meleeAfterMoveMult(input(weapon, 0, 0, { swingStartAt: 0, whipComboAt: 0, knifeComboAt: 0 }))).toBe(1);
    }
  });
});

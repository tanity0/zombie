// ★近接を振った「あと」の歩く速さ(社長指示2026-11-26「全ての攻撃後の動きが重くなるところ、完全に止めてみて。
// あ、いったんナイフだけでいいや。それでよければ全てに広げる」)。判定だけを置く純関数。
//  - 今の作り: 振りの絵が終わってから硬直(×MELEE_RECOVER_SPEED_MULT=重いが動ける)・3段目の後の隙(前半0→後半で1へ戻る)。
//    これらを重なる所は遅い方で合わせたものが「攻撃後の歩く速さ」(gameStore の meleeRecoverMult)。
//  - 「止める」武器(MELEE_AFTER_STOP_WEAPONS)では、0と1の間になる区間(=重くなる区間)を全部 0(完全に止まる)にする。
//    明ける時刻は今の各区間の終わりのまま(延ばさない・縮めない)。明けた後ろに短い立ち上がり(MELEE_AFTER_STOP_RAMP_MS・加減速つき)を付ける=
//    0→1 へ跳ばない(慣性MUST)。
//  - それ以外の武器は今と同じ値(1bitも変えない)。全武器へ広げる時は MELEE_AFTER_STOP_WEAPONS に足すだけ。
//  - ダッシュ系・スライドには掛からない(utils/playerMoveSpeed の meleeRecoverMult と同じ枝に乗る=今どおり)。
import { meleeRecoverSpeedMult } from './meleeRecover';
import { whipComboFinishMoveMult, WHIP_COMBO_FINISH_RECOVERY_MS } from './whipCombo';
import { knifeComboFinishMoveMult, KNIFE_COMBO_FINISH_RECOVERY_MS } from './knifeCombo';

/** 近接の種類(プレイヤーの今の近接)。 */
export type MeleeAfterWeapon = 'knife' | 'whip' | 'katana' | 'brawler';

/** 攻撃後の重くなる区間を「完全に止まる」にする武器(社長指示2026-11-26: いったんナイフだけ)。 */
export const MELEE_AFTER_STOP_WEAPONS: readonly MeleeAfterWeapon[] = ['knife'];

/** 止まる区間が明けてからの立ち上がり(ms・加減速つき=smoothstep)。明ける時刻の後ろへ付ける。 */
export const MELEE_AFTER_STOP_RAMP_MS = 100;

export interface MeleeAfterMoveInput {
  weapon: MeleeAfterWeapon;
  nowMs: number;
  /** 直近の振りの起点(`player.meleeSwingAt`)。 */
  swingStartAt: number | undefined;
  /** 硬直が開く時刻=振り始めからの経過(プレイヤー=PLAYER_MELEE_SWING_MS)。 */
  swingCycleMs: number;
  /** 硬直が明ける時刻=振り始めからの経過(プレイヤー=COUNTER_WINDOW + MELEE_RECOVER_MS)。 */
  recoverEndMs: number;
  whipComboStage: number | undefined;
  whipComboAt: number | undefined;
  knifeComboStage: number | undefined;
  knifeComboAt: number | undefined;
}

/** 区間 [startMs, endMs) は 0・明けてから rampMs で加減速つきに 1 へ・それ以外は 1。since は区間の起点からの経過。 */
const stopRegionMult = (sinceMs: number, startMs: number, endMs: number, rampMs: number): number => {
  if (!(sinceMs >= startMs)) return 1;
  if (sinceMs < endMs) return 0;
  const u = (sinceMs - endMs) / Math.max(1, rampMs);
  if (u >= 1) return 1;
  return u * u * (3 - 2 * u);
};

/** 今の作り(重いが動ける)の攻撃後の歩く速さ。止めない武器はこれをそのまま使う。 */
export const meleeAfterMoveMultLegacy = (i: MeleeAfterMoveInput): number => Math.min(
  meleeRecoverSpeedMult(i.swingStartAt, i.nowMs, i.swingCycleMs, i.recoverEndMs),
  whipComboFinishMoveMult(i.whipComboStage, i.whipComboAt, i.nowMs),
  knifeComboFinishMoveMult(i.knifeComboStage, i.knifeComboAt, i.nowMs),
);

/** 攻撃後の歩く速さの倍率(1=影響なし)。止める武器=重くなる区間を 0 に・明けの後ろへ短い立ち上がり。それ以外=今と同じ値。 */
export const meleeAfterMoveMult = (i: MeleeAfterMoveInput): number => {
  if (!MELEE_AFTER_STOP_WEAPONS.includes(i.weapon)) return meleeAfterMoveMultLegacy(i);
  const ramp = MELEE_AFTER_STOP_RAMP_MS;
  // 振りの後の硬直: 振りの絵が終わる時刻 → 硬直が明ける時刻。
  const swingAt = i.swingStartAt ?? 0;
  const a = swingAt > 0 ? stopRegionMult(i.nowMs - swingAt, i.swingCycleMs, i.recoverEndMs, ramp) : 1;
  // 3段目の後の隙: 3段目を振った時刻 → 隙の終わり(前半の0も後半の戻りも全部 0)。
  const wAt = i.whipComboAt ?? 0;
  const w = i.whipComboStage === 3 && wAt > 0 ? stopRegionMult(i.nowMs - wAt, 0, WHIP_COMBO_FINISH_RECOVERY_MS, ramp) : 1;
  const kAt = i.knifeComboAt ?? 0;
  const k = i.knifeComboStage === 3 && kAt > 0 ? stopRegionMult(i.nowMs - kAt, 0, KNIFE_COMBO_FINISH_RECOVERY_MS, ramp) : 1;
  return Math.min(a, w, k);
};

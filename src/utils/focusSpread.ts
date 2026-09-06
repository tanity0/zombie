// UNIQUE_WEAPONS.md §16-2「収束型ショットガン」(shotgun-t1-focus・バッチB): 命中した射撃ごとに
// 散り角が1段階狭まる(初期1.30rad→-0.18/命中→下限0.36)。2.5秒当てないと初期へリセット。
// 純関数のみ(副作用なし)=ヘッドレスでユニットテスト可能(CLAUDE.md「実装精度の規律」4)。
//
// 状態はWeapon本体(focusSpreadRad/focusSpreadLastHitAt)に持つ(dualRangeGun.tsのdualRangeModeと
// 同じ作法)。ラン開始・武器切替・死亡は全て createWeapon() で新しいWeaponオブジェクトを作る経路を
// 通るため、この2フィールドは自然にundefinedへ戻る(=別モジュール台帳のような明示リセット呼び出しは不要)。

export const FOCUS_SPREAD_INITIAL_RAD = 1.30;
export const FOCUS_SPREAD_STEP_RAD = 0.18;
export const FOCUS_SPREAD_FLOOR_RAD = 0.36;
export const FOCUS_SPREAD_RESET_MS = 2500;

/**
 * この発射で使う散り角。直近の命中から FOCUS_SPREAD_RESET_MS 以上経っていれば
 * (一度も命中していない場合を含む)初期値へリセットする。
 */
export const resolveFocusSpreadRad = (
  currentRad: number | undefined,
  lastHitAt: number | undefined,
  now: number,
): number => {
  if (currentRad === undefined || lastHitAt === undefined || now - lastHitAt > FOCUS_SPREAD_RESET_MS) {
    return FOCUS_SPREAD_INITIAL_RAD;
  }
  return currentRad;
};

/** 命中1回ぶんの狭まり(下限クランプ)。 */
export const narrowFocusSpreadRad = (currentRad: number): number =>
  Math.max(FOCUS_SPREAD_FLOOR_RAD, currentRad - FOCUS_SPREAD_STEP_RAD);

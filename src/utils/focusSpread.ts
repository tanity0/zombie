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

/**
 * ★狭まる単位は「1トリガー」であって「1ペレット」ではない(社長仕様
 * 「敵に**命中した射撃ごとに**1段階ずつ集弾率が上昇」)。
 *
 * このショットガンは1トリガーで5ペレット出るので、ペレット単位で狭めると
 * **1トリガーで 1.30 → 0.40、2トリガー目で下限0.36** に達し、
 * 「連続命中するほど収束していく」という武器の芯が消える(実測: 段数は5.22しかない)。
 * ⇒ **同じトリガーの2発目以降は狭めない**。トリガーの同一性は弾の `createdAt`
 * (1トリガーで生成した全ペレットが同じ値を持つ)で見る。
 *
 * 変化が無い時は `null` を返す=**呼び出し側は store を書かない**
 * (ペレットごとの `setState` は購読者を毎命中で起こすため。CLAUDE.md「per-frame set() churn」)。
 */
export interface FocusSpreadState {
  focusSpreadRad?: number;
  focusSpreadLastHitAt?: number;
  focusSpreadLastTriggerAt?: number;
}

export const focusSpreadAfterHit = (
  w: FocusSpreadState,
  triggerAt: number,
  now: number,
): Required<FocusSpreadState> | null => {
  // 同じトリガーの2発目以降=何もしない(狭まりも打刻も1トリガー1回)。
  if (w.focusSpreadLastTriggerAt === triggerAt) return null;
  // この発射で実際に使った散り角(2.5秒切れていれば初期値)から1段階狭める。
  const used = resolveFocusSpreadRad(w.focusSpreadRad, w.focusSpreadLastHitAt, now);
  return {
    focusSpreadRad: narrowFocusSpreadRad(used),
    focusSpreadLastHitAt: now,
    focusSpreadLastTriggerAt: triggerAt,
  };
};

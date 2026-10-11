// 進軍NPCの近接(ナイフ)(research/ESCORT_MELEE.md・社長「進軍NPC8体も近接攻撃する様にできる？ 装備はtiar1のナイフ 近接中は、銃を撃たない」→「はい」2026-10-11)。
// 「斬るか撃つか」「いつ振り始め、いつ当たるか」をここ1本で決める(通常ルートと洋館通路ルートの2か所が同じ関数を呼ぶ=片方だけの取りこぼしを作らない)。
// 数値はプレイヤーの tier1 ナイフと同じ(knife-t1: 8・クリ5%)、周期はプレイヤーの1振り(溜め200→刃200→間420)。
// renderer 非依存(PixiJS を import しない)。描画は EscortSoldier の melee* を読むだけ。
import type { EscortSoldier } from '../types/game';

// knife-t1 の値(weaponUtils の CATALOG と同じ。一致はテストで固定=片方だけ変えると落ちる)。
export const ESCORT_KNIFE_DAMAGE = 8;
export const ESCORT_KNIFE_CRIT = 0.05;
/** 間合いに入る距離(敵の当たり判定の最近点まで)= プレイヤーの近接の間合い(MELEE_RADIUS)。 */
export const ESCORT_MELEE_ENTER_PX = 74;
/** 間合いから出る距離(入るより広い=境目でちらつかない)。 */
export const ESCORT_MELEE_EXIT_PX = 94;
export const ESCORT_MELEE_WINDUP_MS = 200; // 溜め(刃を引く)
export const ESCORT_MELEE_BLADE_MS = 200;  // 刃(振り抜く)。当たるのは刃の出だし=溜め明け
export const ESCORT_MELEE_CYCLE_MS = 820;  // 次の振りまで(溜め+刃+間420)
/** 当たる扇の半角(狙った敵の方向 ±70°)。プレイヤーの全周の薙ぎより狭い=1人の兵士の一振り。 */
export const ESCORT_MELEE_ARC_HALF_RAD = (70 * Math.PI) / 180;
/** 構えに入った最初の振りを人ごとにずらす刻み(名簿の番号%4 × これ)。 */
export const ESCORT_MELEE_PHASE_STEP_MS = 70;
/** 軍人の「胸の高さ」(足元 y からの上げ)。射撃の発射点と同じ高さで測る。 */
export const ESCORT_CHEST_UP_PX = 30;

export type EscortMeleeFields = Pick<EscortSoldier, 'knifeMode' | 'knifeSwingAt' | 'knifeNextAt' | 'knifeDirX' | 'knifeDirY' | 'knifeHitDone'>;

export interface EscortMeleeStep {
  /** 近接の構え中(=銃は撃たない)。 */
  mode: boolean;
  /** このフレームに当たる(溜めが明けた)。当てる向きは patch.knifeDirX/Y。 */
  hitNow: boolean;
  /** このフレームに振り始めた(音の合図)。 */
  swingStarted: boolean;
  patch: EscortMeleeFields;
}

/**
 * 1フレーム進める。targetDist=狙っている敵(advance.target)の当たり判定の最近点までの距離(居なければ null)、
 * targetDir=その敵への単位ベクトル、canAct=倒れていない・被弾の滑りでない・撃つ手が止まっていない。
 * 振っている最中(溜め+刃)は、敵が間合いを出ても最後まで振り切る(途中で銃へ戻らない)。
 */
export const stepEscortMelee = (
  esc: EscortMeleeFields, targetDist: number | null, targetDir: { x: number; y: number } | null, now: number, canAct: boolean,
  /** 構えに入った最初の振りを遅らせる量(ms)。人ごとにずらして、同じ敵に付いた軍人が同じ拍子で振らないように(見た目・監査)。 */
  enterDelayMs = 0,
): EscortMeleeStep => {
  const swingAt = esc.knifeSwingAt ?? -Infinity;
  const swinging = now < swingAt + ESCORT_MELEE_WINDUP_MS + ESCORT_MELEE_BLADE_MS;
  const reach = esc.knifeMode ? ESCORT_MELEE_EXIT_PX : ESCORT_MELEE_ENTER_PX;
  const inRange = targetDist !== null && targetDist <= reach;
  const patch: EscortMeleeFields = {
    knifeMode: esc.knifeMode, knifeSwingAt: esc.knifeSwingAt, knifeNextAt: esc.knifeNextAt,
    knifeDirX: esc.knifeDirX, knifeDirY: esc.knifeDirY, knifeHitDone: esc.knifeHitDone,
  };
  let swingStarted = false;
  // 構えに入った瞬間(前のフレームは構えていない)は、最初の振りを人ごとの量だけ遅らせる。
  if (!esc.knifeMode && inRange && enterDelayMs > 0) patch.knifeNextAt = Math.max(esc.knifeNextAt ?? 0, now + enterDelayMs);
  // 振り始め: 間合いの中・動ける・前の振りの周期が明けた。
  if (canAct && inRange && targetDir && now >= (patch.knifeNextAt ?? 0) && !swinging) {
    patch.knifeSwingAt = now;
    patch.knifeNextAt = now + ESCORT_MELEE_CYCLE_MS;
    patch.knifeDirX = targetDir.x;
    patch.knifeDirY = targetDir.y;
    patch.knifeHitDone = false;
    swingStarted = true;
  }
  const sAt = patch.knifeSwingAt ?? -Infinity;
  const nowSwinging = now < sAt + ESCORT_MELEE_WINDUP_MS + ESCORT_MELEE_BLADE_MS;
  // 当たり: 溜めが明けた最初のフレームに1回だけ。倒れた/滑った時は当てない(振りはそのまま消える)。
  let hitNow = false;
  if (patch.knifeHitDone === false && now >= sAt + ESCORT_MELEE_WINDUP_MS) {
    patch.knifeHitDone = true;
    hitNow = canAct;
  }
  patch.knifeMode = inRange || nowSwinging;
  return { mode: patch.knifeMode, hitNow, swingStarted, patch };
};

/** その敵(中心の向き)が、振った向きの扇の中か。 */
export const inEscortMeleeArc = (dirX: number, dirY: number, toX: number, toY: number): boolean => {
  const l = Math.hypot(toX, toY);
  if (l < 1e-6) return true; // 重なっている=当たる
  const cos = (dirX * toX + dirY * toY) / l;
  return cos >= Math.cos(ESCORT_MELEE_ARC_HALF_RAD);
};

/** クリティカルの抽選込みのダメージ(プレイヤーと同じ倍率)。 */
export const escortKnifeHit = (rand: () => number, critMult: number): { damage: number; crit: boolean } => {
  const crit = rand() < ESCORT_KNIFE_CRIT;
  return { damage: crit ? Math.round(ESCORT_KNIFE_DAMAGE * critMult) : ESCORT_KNIFE_DAMAGE, crit };
};

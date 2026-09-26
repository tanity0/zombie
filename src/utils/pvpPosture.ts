// ★対人の体勢システム(SAME_ARENA.md §9・社長指示2026-08-26)。
//
// 社長の言葉:
//   「プレイヤーも幻影も、クリティカルで移動速度2/3に。また、見えない値で体勢値を持ち、ボスと同じ値で、
//    紫になると３秒動けなくなり、その状態で近接を食らうと致命の一撃。」
//   「(いまのところ実質、幻影との闘いでしか使われない値。)」
// 裁定3件(2026-08-26): ①幻影の近接クリ新設(対称) ②致命=×5+最大HP25% ③対人はクリ率のボス補正を外す。
//
// 「ボスと同じ値」= bossPosture.ts の既存定数(最大100・削り率・回復8秒/3%毎秒・ラチェット・
// 再ブレイクロック6秒・daze2秒)を流用。対人専用は「減速2/3」(ボスは1/2)と「紫3秒」(ボスは5秒)だけ。
// 全時刻は gameTime 基準(ポーズで止まる)。純関数のみ=ヘッドレステスト可。適用点:
//   幻影側: phantomTick(凍結/削り/致命) + damageEnemy(銃クリ/反射の削り) + 近接site1(melee削り/致命)
//   プレイヤー側: movePlayer(減速/紫の入力無視) + 入力アクション(紫中は振れない) + useGameLoopのtick
import type { PvpPostureState } from '../types/game';
import {
  BOSS_POSTURE_RECOVERY_DELAY_MS, BOSS_POSTURE_RECOVERY_PER_SEC,
  BOSS_POSTURE_REBREAK_LOCK_MS, BOSS_FATAL_DAZE_MS,
} from './bossPosture';

export const PVP_POSTURE_MAX = 100;      // ボスの既定値と同値
export const PVP_BREAK_MS = 3000;        // 紫=3秒(社長指示。ボスの5秒より短い対人専用値)
export const PVP_SLOW_MULT = 2 / 3;      // クリ被弾の移動減速(社長指示。ボスは0.5)
export const PVP_SLOW_MS = 3000;         // 減速窓(ボスのBOSS_CRIT_SLOW_MSと同値)
export const PVP_FATAL_MULT = 5;         // 致命の一撃=近接×5(裁定②・ボスと同型)
export const PVP_FATAL_HP_RATIO = 0.25;  // +被害者の最大HP25%(裁定②)
export const PVP_FATAL_DAZE_MS = BOSS_FATAL_DAZE_MS;        // 致命後2秒停止(ボスと同値)
export const PVP_REBREAK_LOCK_MS = BOSS_POSTURE_REBREAK_LOCK_MS; // 6秒(ボスと同値)

export type PvpImpact = 'counter' | 'melee' | 'gun-crit' | 'reflect';
// ボスの IMPACT_RATIO と同値(§9: この4種のみ。heavyは対人に発生源が無い)。
export const PVP_IMPACT_RATIO: Record<PvpImpact, number> = {
  counter: 0.20, melee: 0.04, 'gun-crit': 0.05, reflect: 0.05,
};

export const freshPvpPosture = (): PvpPostureState => ({
  posture: PVP_POSTURE_MAX, recoveryCap: PVP_POSTURE_MAX, lastChipAt: -Infinity,
});

/** 行動不能中か(紫3秒+致命後daze2秒の両方を覆う=移動/攻撃/カウンター/パリィ全部止める判定)。 */
export const isPvpIncapacitated = (s: PvpPostureState | undefined, gameTime: number): boolean =>
  s !== undefined && s.breakUntil !== undefined && gameTime < s.breakUntil;

/** 致命の一撃の対象か(=紫そのもの。致命後のdaze中(posture>0)は対象外=致命の連鎖はしない)。 */
export const isPvpFatalTarget = (s: PvpPostureState | undefined, gameTime: number): boolean =>
  isPvpIncapacitated(s, gameTime) && s !== undefined && s.posture <= 0;

/** クリ被弾の移動倍率(2/3)。減速していなければ1。 */
export const pvpMoveMult = (s: PvpPostureState | undefined, gameTime: number): number =>
  s !== undefined && s.slowUntil !== undefined && gameTime < s.slowUntil ? PVP_SLOW_MULT : 1;

/** クリを受けた: 2/3減速の窓を張り直す(体勢は削らない=削りはimpact経由)。 */
export const markPvpCritSlow = (s: PvpPostureState | undefined, gameTime: number): PvpPostureState => ({
  ...(s ?? freshPvpPosture()),
  slowUntil: gameTime + PVP_SLOW_MS,
});

/**
 * 体勢を削る(ボスの applyBossPostureDamage と同じ骨格: ラチェット/ロック/0で紫)。
 * @returns next=新しい状態 / broke=この削りで紫に入った(入った瞬間の後始末=窓・前隙・予約の破棄は呼び出し側)
 */
export const chipPvpPosture = (
  s: PvpPostureState | undefined, impact: PvpImpact, gameTime: number, chipMult = 1,
): { next: PvpPostureState; broke: boolean } => {
  const cur = s ?? freshPvpPosture();
  if (isPvpIncapacitated(cur, gameTime)) return { next: cur, broke: false };
  if (cur.lockUntil !== undefined && gameTime < cur.lockUntil) return { next: cur, broke: false };
  const before = Math.max(0, Math.min(PVP_POSTURE_MAX, cur.posture));
  const after = Math.max(0, before - PVP_POSTURE_MAX * PVP_IMPACT_RATIO[impact] * chipMult);
  let recoveryCap = cur.recoveryCap;
  for (const checkpoint of [0.75, 0.50, 0.25]) {
    const value = PVP_POSTURE_MAX * checkpoint;
    if (before > value && after <= value) recoveryCap = Math.min(recoveryCap, value);
  }
  if (after > 0) {
    return { next: { ...cur, posture: after, recoveryCap, lastChipAt: gameTime }, broke: false };
  }
  const breakUntil = gameTime + PVP_BREAK_MS;
  return {
    next: {
      ...cur, posture: 0, recoveryCap: 0, lastChipAt: gameTime,
      breakUntil, lockUntil: breakUntil + PVP_REBREAK_LOCK_MS,
    },
    broke: true,
  };
};

/**
 * 毎フレームの経過(ボスの tickBossPosture と同じ骨格): 紫明け=満タンへ・回復=8秒後に3%/s(上限=ラチェット)。
 * 変化が無ければ null(set()の無駄打ちを避ける)。
 */
export const tickPvpPosture = (
  s: PvpPostureState | undefined, gameTime: number, deltaTime: number,
): PvpPostureState | null => {
  if (s === undefined) return null;
  if (s.breakUntil !== undefined) {
    if (gameTime < s.breakUntil) return null;
    return { ...s, posture: PVP_POSTURE_MAX, recoveryCap: PVP_POSTURE_MAX, breakUntil: undefined };
  }
  if (s.posture >= PVP_POSTURE_MAX || gameTime < s.lastChipAt + BOSS_POSTURE_RECOVERY_DELAY_MS) return null;
  const next = Math.min(s.recoveryCap, s.posture + PVP_POSTURE_MAX * BOSS_POSTURE_RECOVERY_PER_SEC * deltaTime);
  return next === s.posture ? null : { ...s, posture: next };
};

/** 致命の一撃のダメージ(裁定②: ×5+被害者の最大HP25%)。対人スケールは base 側で織り込み済みの前提。 */
export const pvpFatalDamage = (baseMeleeDamage: number, victimMaxHp: number): number =>
  baseMeleeDamage * PVP_FATAL_MULT + victimMaxHp * PVP_FATAL_HP_RATIO;

/** 致命が命中した後の被害者の状態: 紫解除(満タン)+daze2秒+再ブレイクロック(ボスのapplyBrokenMeleeFatalと同型)。 */
export const pvpAfterFatal = (s: PvpPostureState | undefined, gameTime: number): PvpPostureState => ({
  ...(s ?? freshPvpPosture()),
  posture: PVP_POSTURE_MAX, recoveryCap: PVP_POSTURE_MAX, lastChipAt: gameTime,
  breakUntil: gameTime + PVP_FATAL_DAZE_MS, // posture>0なのでisPvpFatalTargetは偽=致命は連鎖しない
  lockUntil: gameTime + PVP_FATAL_DAZE_MS + PVP_REBREAK_LOCK_MS,
});

// ★薙ぎ払いの絵(社長支給2026-09-22「**伐採人の薙払いの時のモーション**」)。PixiJS非依存の純関数。
//
// ★**跳ぶ技(`enemyJumpSheet`)と同じ核**(`sheetSections`)を使う。違うのは**区間の名前と時計**だけ:
//   跳ぶ = しゃがむ / 滞空 / 着地   ←→   薙ぎ = 溜め / 薙ぎ / 戻り
//
// ★★**尺は自分で持たない**。溜め・薙ぎ・戻りの時計は**判定側(store)が既に持っている**
// (`LOGGER_SWEEP_WINDUP_MS` / `_ACTIVE_MS` / `_RECOVER_MS`)ので、**その進み具合(0..1)を
// 受け取ってコマ番号へ写すだけ**にする。
//
// ★★**掟③(消え切る時刻 = 当たる時刻)がここでは「区間の境目」になる。**
// 薙ぎの当たり(カプセル)は**溜めの末尾で1回だけ積まれる**(`gameStore` の `logger-sweep-windup` →
// `-active` の遷移)。だから **「溜めの最後のコマが終わる瞬間 = 当たる瞬間 = 薙ぎの先頭コマが出る瞬間」**。
// ⇒ **刃が地を噛むコマ(火花)は「薙ぎ」区間の先頭に置く**。溜め側へ入れると、
//    **火花が出ているのにまだ当たらない**という嘘になる。
//
// ★**位相は線形**(加減速は絵の側に描かれている)。

import { sectionFrame, sectionLastFrame, sectionsTotal, type SectionCounts } from './sheetSections';

/** 1枚のシートを3区間へ割る。合計がコマ数と一致すること。 */
export interface SweepSplit {
  /** 溜め(構えて止まる)。先頭から。**この区間が終わる瞬間に当たる。** */
  windup: number;
  /** 薙ぎ(刃が走っている判定の窓)。**先頭コマ=当たった瞬間。** */
  active: number;
  /** 戻り(硬直=反撃の窓)。末尾まで。 */
  recover: number;
}

const counts = (s: SweepSplit): SectionCounts => [s.windup, s.active, s.recover];

export const sweepSplitFrames = (s: SweepSplit): number => sectionsTotal(counts(s));

export type SweepPhase = 'windup' | 'active' | 'recover';

/** store の `aiPhase` → 区間。表に無い `aiPhase` は `null`(=この絵を出さない)。 */
export const LOGGER_SWEEP_PHASES: Readonly<Record<string, SweepPhase>> = {
  'logger-sweep-windup': 'windup',
  'logger-sweep-active': 'active',
  'logger-sweep-recover': 'recover',
};

export const sweepPhaseOf = (aiPhase: string | undefined): SweepPhase | null =>
  (aiPhase !== undefined && LOGGER_SWEEP_PHASES[aiPhase]) || null;

/**
 * コマ番号を返す。`null` = このシートを出さない(立ち絵/歩きへ戻す)。
 * @param prog その区間の進み具合 0..1。**戻りだけは 1 を超えたら `null`**(=硬直明け)。
 */
export const enemySweepFrame = (
  split: SweepSplit, phase: SweepPhase, prog: number,
): number | null =>
  sectionFrame(counts(split), phase === 'windup' ? 0 : phase === 'active' ? 1 : 2, prog);

/** ★当たる瞬間に出る最初のコマ(=薙ぎ区間の先頭)。検査が掟③を押さえるのに使う。 */
export const sweepImpactFrame = (split: SweepSplit): number => split.windup;

/** ★溜めの最後のコマ(=当たる直前に見えている姿)。 */
export const sweepWindupLastFrame = (split: SweepSplit): number => sectionLastFrame(counts(split), 0);

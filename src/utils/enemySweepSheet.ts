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

/**
 * ★**削岩型の突きも同じ3相**(社長支給2026-09-24「削岩機の突きのアニメーション」)。
 * 溜めてドリルを引き込む → 突き出す → 出し切った姿で硬直、と**薙ぎと同じ形**なので
 * **新しい仕組みを作らない**(区間の割り方も尺の読み方もそのまま借りる)。名前だけ違う。
 */
export const DRILLER_THRUST_PHASES: Readonly<Record<string, SweepPhase>> = {
  'driller-thrust-windup': 'windup',
  'driller-thrust-active': 'active',
  'driller-thrust-recover': 'recover',
};

const THREE_PHASE_TECH: Readonly<Record<string, SweepPhase>> = {
  ...LOGGER_SWEEP_PHASES, ...DRILLER_THRUST_PHASES,
};

export const sweepPhaseOf = (aiPhase: string | undefined): SweepPhase | null =>
  (aiPhase !== undefined && THREE_PHASE_TECH[aiPhase]) || null;

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

/**
 * ★薙ぎの帯が横向きにどちらへ抜けるか(社長裁定2026-09-23「薙の向きは推薦で」)。
 * `+1`=右へ抜ける / `-1`=左へ / `0`=横成分が小さく判断しない(=従来どおり移動方向に任せる)。
 *
 * なぜ要るか: 薙ぎのシートは**常に同じ向き**(伐採人なら左→右)に描かれているのに、
 * 当たる帯の始点→終点は**プレイヤーの位置で入れ替わる**。薙ぎの最中は本体が動かない(vx≈0)ので、
 * 向きを移動方向から決めている今の配線では**帯と絵が逆を向く**ことが起きる
 * ——「見たまんまが当たり判定」(攻撃ヴィジュアルの2分類①)が崩れる。
 *
 * ★焼き付けた座標(`aiFromX`/`aiTargetX`)から読む。判定の正本と同じ出どころなので、絵と判定がズレない。
 */
export const sweepBandDirX = (
  fromX: number | undefined, toX: number | undefined, deadzonePx = 8,
): -1 | 0 | 1 => {
  if (fromX === undefined || toX === undefined) return 0;
  const d = toX - fromX;
  // 不感帯は**含めて**判断しない(=8pxちょうどは0)。真上/真下へ薙ぐ技で向きが揺れないように。
  if (!Number.isFinite(d) || Math.abs(d) <= deadzonePx) return 0;
  return d > 0 ? 1 : -1;
};

/**
 * ★薙ぎ中のミラー(社長報告2026-09-23「武器の進行方向と逆に振ってる」)。
 *
 * **「絵の振り抜き方向」を「帯の向き」へ揃える**ための倍率を返す(体の向きでは決めない)。
 * 武器スプライトは帯(`aiFrom`→`aiTarget`)の上を進むので、絵の振りが帯と逆だと
 * **逆に振っているように見える**(判定は帯のまま=「見たまんまが当たり判定」が崩れる)。
 *
 * 不変条件: 戻り値を `m` とすると **`swingDir * m === bandDir`**
 * (=画面上で絵が振る向き == 帯の向き)。`enemySweepSheet.test.ts` が見張る。
 *
 * @param bandDir  帯の向き(`sweepBandDirX` の戻り。0=判定できない)
 * @param swingDir 絵の素の振り抜き方向(`sweepSwingDir`)
 * @param fallback 帯の向きが読めない時に保つ今の向き
 */
export const sweepFaceMulFor = (bandDir: -1 | 0 | 1, swingDir: 1 | -1, fallback: number): number =>
  bandDir === 0 ? fallback : (bandDir > 0 ? swingDir : -swingDir as 1 | -1);

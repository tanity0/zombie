// PACING_PUZZLE.md §6.28-8 バッチM57: ラフィ(stage-4 ゲート2)の技選択=純関数。
// レンダラ非依存・store非依存(angelBossTick.ts からのみ import される。giantScript.tsと同じ流儀)。
// 数値の根拠は PACING_PUZZLE.md §6.28-8 を参照。
// ==== v0.25.2609(ボス動き横断監査・バッチ1「死に技の解放」) ====================================
// 旧実装は距離ハードゲート(bone ≤300 / jump >300 / sweep はPhase2かつ≤200)。
// ヘッドレス実走180秒×3ペルソナの実測: **Phase1は bone 100%(jumpは0回)**。
//   - 原因: ラフィの中立はプレイヤーへ接近するので距離が300pxを超えず、jump(>300)が
//     実戦の間合いで一度も適格にならない。ゲート2アリーナの最大分離565pxに対して
//     「300px超でしか跳ばない」は、詰めてくるボスの条件としては成立していなかった。
// 対策: 城ボス裁定(BOSS_RANGE_REWORK.md v0.25.2455)の「ゾーン×重み表」を適用。
import { pickComboFollowup, pickWeightedMove, bossZoneForDistance, type BossMoveWeights } from './bossScript';

export type RafiMove = 'bone' | 'jump' | 'sweep';

export const RAFI_PHASE_HP_THRESHOLD = 0.6;
export const RAFI_COMBO_CHANCE = 0.65; // Phase2は骨刃→跳躍→薙ぎの最大3段。各段で抽選する。

// ==== 3技×距離ゾーンの重み表(v0.25.2609) ====================================================
// 是正の狙い:
//   - jump を全ゾーンで出す(密着15/近25/中45/遠75)。§6.28-8の主題は「骨刃が残る間に本体が
//     跳んでくる=**二正面**」であり、跳ぶこと自体が主題の半分。旧ゲート(>300限定)はその主題を
//     実戦で一度も成立させていなかった。遠ほど重い=追いつき技としての役割は維持(城ボス準拠)。
//   - bone は全ゾーンの主砲として維持(密着45/近45/中40/遠25)。
//   - sweep はPhase2解禁のまま(下の rafiMoveWeight のフェーズ制約)。密着40/近30/中15=密着の答え。
// ※ラフィは技が3つしか無いため、Phase1の密着は bone75% / jump25% の2本立てが上限になる。
//   技数そのものを増やすのは作り込み(バッチ3以降)の仕事なのでここではやらない。
export const RAFI_MOVE_WEIGHTS: BossMoveWeights<RafiMove> = {
  bone:  { melee: 45, near: 45, mid: 40, far: 25 },
  jump:  { melee: 15, near: 25, mid: 45, far: 75 },
  sweep: { melee: 40, near: 30, mid: 15, far: 0 },
};

/** 技×距離×フェーズ→実効重み。sweepはPhase2で解禁(§6.28-8 #4・従来どおり)。 */
export const rafiMoveWeight = (
  move: RafiMove,
  distance: number,
  phase: 1 | 2,
  weights: BossMoveWeights<RafiMove> = RAFI_MOVE_WEIGHTS,
): number => {
  if (move === 'sweep' && phase < 2) return 0;
  return weights[move][bossZoneForDistance(distance)];
};

/** 各技の適格判定=「現在ゾーンの実効重み>0」(旧ハードゲートの後継)。 */
export const rafiMoveEligible = (move: RafiMove, distance: number, phase: 1 | 2): boolean =>
  rafiMoveWeight(move, distance, phase) > 0;

const ALL_MOVES: RafiMove[] = ['bone', 'jump', 'sweep'];

/**
 * CD明けかつ現在ゾーンの重み>0の技から重み比例で1つ。該当無しはnull。
 * sweepReady: 薙ぎ専用CD(rSweepReadyAt)明けか(骨刃/飛び掛かりは一般行動ゲートのみで足りる)。
 */
export const pickRafiMove = (
  distance: number,
  phase: 1 | 2,
  sweepReady: boolean,
  rand: () => number = Math.random,
): RafiMove | null => pickWeightedMove(
  ALL_MOVES,
  m => rafiMoveWeight(m, distance, phase),
  { bone: true, jump: true, sweep: sweepReady },
  rand,
);

// 再構築: Phase2は骨刃→飛び掛かり→薙ぎの最大3段。各リンク65%で、薙ぎ後は必ず終わる。
export const RAFI_COMBO_FOLLOWUP: Partial<Record<RafiMove, RafiMove>> = { bone: 'jump', jump: 'sweep' };

// 連携時の飛び掛かりは、通常抽選の間合いゲート(>300px)を適用しない(★未決事項に記録)。
// 骨刃は≤300pxで発生するため、通常ゲートのままだと「骨刃の直後に距離が開いていない限り連携が
// 出ない」=設計意図(「骨刃が残る間に本体が跳んでくる=二正面」)とほぼ両立しなくなる。骨刃終了直後は
// 常に連携対象として扱う(気絶/プレイヤー死亡等の停止条件は呼び出し側=angelBossTick.tsが別途見る)。
export const pickRafiCombo = (
  justFinished: RafiMove,
  phase: 1 | 2,
  rand: () => number = Math.random,
): RafiMove | null => {
  if (phase !== 2) return null;
  return pickComboFollowup(justFinished, RAFI_COMBO_FOLLOWUP, RAFI_COMBO_CHANCE, () => true, rand);
};

// ★コマ送りの時計(依存ゼロの葉)。
//
// ★何のためか: 社長支給のコマ割り素材を「**当たる瞬間**を基準に」送るための共通部品。
// 赤い予告の掟③「消え切る時刻=当たる時刻」と同じ発想で、**当たる瞬間に出るコマを決めてから**
// 前後へ尺を配る。等間隔にしないのは、クリエイティブ監査2026-09-18 #5
// 「一番大きいコマが33msしか出ない/機械的な等間隔は人の手のタイミングではない」の是正。
//
// 使う側は「コマごとの尺の表」と「当たる瞬間に出るコマの番号」を持つだけでよい。

/** 尺の表の合計(ms)。 */
export const holdTotalMs = (holdMs: readonly number[]): number =>
  holdMs.reduce((a, b) => a + b, 0);

/** 当たる瞬間より前に出ている長さ(ms)=先頭コマの頭から当たる瞬間まで。 */
export const holdLeadMs = (holdMs: readonly number[], impactFrame: number): number =>
  holdMs.slice(0, impactFrame).reduce((a, b) => a + b, 0);

/**
 * コマ番号を出す。`sinceImpactMs` は**当たる瞬間を0**とした経過(前は負)。
 * 範囲の外(まだ出ない/流し切った)は null。
 *
 * ★`impactFrame` の頭がちょうど `sinceImpactMs === 0` に来る=**当たる瞬間にそのコマへ切り替わる**。
 */
export const frameByHold = (
  sinceImpactMs: number, holdMs: readonly number[], impactFrame: number,
): number | null => {
  const t = sinceImpactMs + holdLeadMs(holdMs, impactFrame);
  if (t < 0) return null;
  let acc = 0;
  for (let i = 0; i < holdMs.length; i++) {
    acc += holdMs[i];
    if (t < acc) return i;
  }
  return null;
};

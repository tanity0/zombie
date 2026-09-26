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

/**
 * ★構え(PACING_PUZZLE.md §16-E・社長指示2026-09-19「武器を構えて一瞬止まる、を雑魚モーションには
 * 差し込んでみよう。牙なら牙の1コマ目で」)。
 *
 * **溜めが始まった同じフレーム(`sinceWindupMs === 0`)から0コマ目を出し、溜めのあいだ(`< windupMs`)は
 * 0コマ目で静止**する。**溜め明けからは渡された `frameFn`(=各シートの既存の `frameByHold` 呼び出し)を
 * そのまま呼ぶ**——命中基準の送りは1ミリも変えない(掟③「消え切る=当たる」を壊さないため。
 * 既存のテスト済み関数へ委譲することで、その保証を計算の重複なしに得る)。
 */
export const frameWithWindupHold = (
  sinceWindupMs: number, windupMs: number,
  sinceImpactMs: number, frameFn: (sinceImpactMs: number) => number | null,
): number | null => {
  if (sinceWindupMs < 0) return null;          // まだ発火していない
  if (sinceWindupMs < windupMs) return 0;       // 構え=0コマ目で静止
  return frameFn(sinceImpactMs);
};

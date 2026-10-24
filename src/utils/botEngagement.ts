// M49(§6.25【改訂v0.25.2358】): 行動階層 ―― ①交戦(さばく) → ②前進(奥へ・ゲート通過を含む) →
// ③オプション(拾う/松明を壊す)。社長指示「これがAIの背骨」。
//
// 設計の要点(botObjective.ts の目的層と組み合わせて使う):
// - botObjective.ts の各目的(depth/clear/…)は「今どこへ向かうか」を決めるだけで、
//   その destination へ**常に**進む(travel=true)と、道中の敵を無視して逃げ回るだけの
//   AIになる(実測 novice 51/casual 8/skilled 15/master 10 の逆転の主因)。
// - この層は「直近の実績(撃破数/被弾数)を持て余したか」で ①(engage=その場で戦う)/
//   ②(advance=objective の destination へ進む)を切り替えるヒステリシスを提供する。
// - **③を独立した目的にしない**: advanceOptionDetour は「advance 中に限り、経路上の至近
//   (OPTION_DETOUR_DIST以内)のピックアップにだけ寄り道させる」ための小さな上書きで、
//   目的地そのものを書き換えない(=①②の従属物であり続ける)。
// - **ゲートは②の一部(迂回しない)**: 呼び出し側は activeEvent(囲い/関所)が立っている間は
//   フェーズに関係なく travel を許すこと(この層はその判断に関与しない=常に allowAdvance扱い)。
// - 純関数+外部状態(既存 RusherTrackState/CounterThreatState と同じ流儀)。store/React非依存。

export type EngagementPhase = 'engage' | 'advance';

/** ①⇄②切り替えの外部状態。ラン単位で1つ保持し、毎tick同じ参照を渡すこと。 */
export interface EngagementTrackState {
  phase: EngagementPhase;
  killTimes: number[]; // 直近の撃破が起きた gameTime(ms)。ENGAGEMENT_WINDOW_MS より古いものは間引く
  hitTimes: number[];  // 直近の被弾が起きた gameTime(ms)。同上
  lastKills: number | null;  // 前tickの gameStats.enemiesKilled(delta検知用)
  lastHealth: number | null; // 前tickの player.health(delta検知用)
}

export const createEngagementTrackState = (): EngagementTrackState => ({
  phase: 'engage', killTimes: [], hitTimes: [], lastKills: null, lastHealth: null,
});

// ★叩き台(PACING_PUZZLE.md §6.25改訂の表そのまま・実測で調整前提。設計チャットが後日 rankProbe で検証)。
export const ENGAGEMENT_WINDOW_MS = 60_000;
export const ADVANCE_MIN_KILLS = 20; // K: ①→②に必要な直近60秒の撃破数
export const ADVANCE_MAX_HITS = 1;   // H: ①→②に許される直近60秒の被弾数
export const RETREAT_MIN_HITS = 3;   // H2: ②→①に戻す被弾数(H2>H=ヒステリシス。戻る条件を緩く)
export const RETREAT_MIN_KILLS = 8;  // K2: これ未満の撃破数なら②→①に戻す(K2<K=ヒステリシス)
/** レベルがこれ未満なら必ず①(初手から突っ込んで死なないための絶対の床)。 */
export const ENGAGE_LEVEL_FLOOR = 5;

const pruneOld = (arr: number[], gameTime: number): void => {
  const cutoff = gameTime - ENGAGEMENT_WINDOW_MS;
  while (arr.length > 0 && arr[0] < cutoff) arr.shift();
};

/**
 * 直近の実績(前tickからの gameStats.enemiesKilled / player.health の差分)を取り込み、
 * ①(engage)⇄②(advance)を判定して返す(state を書き換える)。
 * 呼び出し側は**毎tick1回**呼ぶこと。`kills`/`health` は「このtick開始時点」の値でよい
 * (前tickまでの結果との差分を見るだけなので、1tick遅れても実害はない)。
 */
export const tickEngagementPhase = (
  state: EngagementTrackState,
  gameTime: number,
  level: number,
  kills: number,
  health: number,
): EngagementPhase => {
  if (state.lastKills !== null && kills > state.lastKills) {
    for (let i = 0; i < kills - state.lastKills; i++) state.killTimes.push(gameTime);
  }
  if (state.lastHealth !== null && health < state.lastHealth) {
    state.hitTimes.push(gameTime); // 被弾は「回数」で数える(HP量ではない・撃破数と同じ単位に揃える)
  }
  state.lastKills = kills;
  state.lastHealth = health;
  pruneOld(state.killTimes, gameTime);
  pruneOld(state.hitTimes, gameTime);

  if (level < ENGAGE_LEVEL_FLOOR) {
    state.phase = 'engage'; // 絶対の床: 低レベル帯は撃破/被弾の実績に関係なく必ず①
    return state.phase;
  }

  const recentKills = state.killTimes.length;
  const recentHits = state.hitTimes.length;
  if (state.phase === 'engage') {
    if (recentKills >= ADVANCE_MIN_KILLS && recentHits <= ADVANCE_MAX_HITS) state.phase = 'advance';
  } else {
    if (recentHits >= RETREAT_MIN_HITS || recentKills < RETREAT_MIN_KILLS) state.phase = 'engage';
  }
  return state.phase;
};

/**
 * ①②の経路上でだけ寄り道して拾う「③オプション」。**独立した目的地にはしない**——
 * 呼び出し側が advance(②)の目的地ステアの代わりにこれを試し、null なら本来の目的地へ進む、
 * という優先順位で使うこと(=①②が主・③は従属)。
 * 既存 pickupSeekInput/torchForageInput の既定探索半径(240px)と同水準の値を流用(§6.15の慣例)。
 */
export const OPTION_DETOUR_DIST = 240;

export const advanceOptionDetour = (
  pcx: number, pcy: number,
  pickups: readonly { x: number; y: number }[],
  maxDist = OPTION_DETOUR_DIST,
): { x: number; y: number } | null => {
  let bestX = 0, bestY = 0, bestD = maxDist;
  for (const p of pickups) {
    const d = Math.hypot(p.x + 8 - pcx, p.y + 8 - pcy); // ピックアップは16px角=中心へ+8(既存慣例と同じ)
    if (d < bestD) { bestD = d; bestX = p.x + 8; bestY = p.y + 8; }
  }
  if (bestD >= maxDist) return null;
  const n = Math.max(0.001, bestD);
  return { x: (bestX - pcx) / n, y: (bestY - pcy) / n };
};

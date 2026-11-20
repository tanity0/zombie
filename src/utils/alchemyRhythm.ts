// 錬金術の溜めのリズム(research/ALCHEMY_RHYTHM.md・社長指示2026-11-20)。
// 「錬金術発動中(ためてるとき)、サークルが1秒ごとに1秒かけてリズムみたいに流れてきて、タイミングよくタップすると、
//  錬金貯め時間が0.5秒短縮。その分、次のサークルも早くなる(つまり0.5秒)」
// +「成功1回ごとに、その完成のハンター(レア)確率 +3ポイント」(社長指示2026-11-20)。
//
// ★store が持つ状態と時刻の計算だけを置く葉(PixiJS非依存)。時計はゲーム内時刻(`gameTime`=溜めの開始と同じ)。
// - サークル k+1 は**サークル k の到着時刻に出る**(何も無ければ 1秒ごとに出て 1秒で着く)。
// - サークル k を成功すると、溜めの残りが 0.5秒縮み、**サークル k+1 の到着が 0.5秒早まる**
//   (まだ出ていなければ出た時に、もう出ていれば飛行中に前倒し)。成功が続くとリズムが前へ詰まる。
// - 溜めが終わる時刻より後に着くサークルは出さない。
// - 1つのサークルに判定は1回。到着の手前 `ALCHEMY_RHYTHM_CONSUME_MS` より前のタップは何もしない(無視)。
//   その内側で ±`ALCHEMY_RHYTHM_WINDOW_MS` を外したタップは、そのサークルの「外れ」として消費する(連打で拾えないように)。
//   外れ・無入力は何も起きない(溜めは普通に進む)。
import { ALCHEMY_CHANNEL_MS, ALCHEMY_RARE_CHANCE } from './summonUtils';

export const ALCHEMY_RHYTHM_TRAVEL_MS = 1000;   // 出てから着くまで
export const ALCHEMY_RHYTHM_WINDOW_MS = 120;    // 到着の前後この内のタップ=成功(叩き台)
export const ALCHEMY_RHYTHM_CUT_MS = 500;       // 成功1回で縮む溜めの残り・次のサークルの前倒し
export const ALCHEMY_RHYTHM_CONSUME_MS = 350;   // 到着のこれより手前のタップは判定しない(無視)
export const ALCHEMY_RHYTHM_RARE_BONUS = 0.03;  // 成功1回ごとのレア(ハンター)確率の上乗せ

export interface AlchemyRhythmRing {
  spawnAt: number;
  arriveAt: number;
  /** 前のサークルの成功で到着を前倒し済みか(二重に前倒ししない)。 */
  pulled: boolean;
  result?: 'hit' | 'miss';
  /** 判定した時刻(成功の弾けの起点)。 */
  judgedAt?: number;
}

export interface AlchemyRhythmState {
  startedAt: number;
  /** 成功で縮んだ溜めの合計。 */
  cutMs: number;
  hits: number;
  rings: AlchemyRhythmRing[];
  /** 直近の成功の時刻(魔法陣の脈・音の起点)。 */
  lastHitAt?: number;
}

export const newAlchemyRhythm = (startedAt: number): AlchemyRhythmState => ({
  startedAt, cutMs: 0, hits: 0,
  rings: [{ spawnAt: startedAt, arriveAt: startedAt + ALCHEMY_RHYTHM_TRAVEL_MS, pulled: false }],
});

/** 今の溜めの長さ(成功で縮む)。 */
export const alchemyChannelDurationMs = (r: AlchemyRhythmState | undefined): number =>
  ALCHEMY_CHANNEL_MS - (r?.cutMs ?? 0);

/** 溜めが終わる時刻。 */
export const alchemyChannelEndAt = (r: AlchemyRhythmState): number => r.startedAt + alchemyChannelDurationMs(r);

/** その完成のレア(ハンター)確率。成功1回ごとに +3ポイント(外れで減らさない)。 */
export const alchemyRareChance = (hits: number): number =>
  ALCHEMY_RARE_CHANCE + ALCHEMY_RHYTHM_RARE_BONUS * Math.max(0, Math.floor(hits));

/**
 * 時刻を進める: 次のサークルを出す(前のサークルの到着時刻が来たら)・判定窓を過ぎたサークルを外れにする。
 * 何も変わらなければ同じ参照を返す(store の無駄な書き込みを避ける)。
 */
export const advanceAlchemyRhythm = (r: AlchemyRhythmState, gameTime: number): AlchemyRhythmState => {
  let rings = r.rings;
  let changed = false;
  // 外れ(窓を過ぎた)
  if (rings.some(g => g.result === undefined && gameTime > g.arriveAt + ALCHEMY_RHYTHM_WINDOW_MS)) {
    rings = rings.map(g => (g.result === undefined && gameTime > g.arriveAt + ALCHEMY_RHYTHM_WINDOW_MS)
      ? { ...g, result: 'miss' as const, judgedAt: g.arriveAt + ALCHEMY_RHYTHM_WINDOW_MS } : g);
    changed = true;
  }
  // 次のサークル(1フレームで複数ぶん進んでも追いつく)
  for (let guard = 0; guard < 16; guard++) {
    const last = rings[rings.length - 1];
    if (!last) break;
    const spawnAt = last.arriveAt; // 前のサークルが着いた瞬間に次が出る(何も無ければ 1秒ごと)
    if (gameTime < spawnAt) break;
    const pulled = last.result === 'hit';
    const arriveAt = spawnAt + ALCHEMY_RHYTHM_TRAVEL_MS - (pulled ? ALCHEMY_RHYTHM_CUT_MS : 0);
    if (arriveAt >= alchemyChannelEndAt({ ...r, rings })) break; // 溜めが終わった後に着くサークルは出さない
    rings = [...rings, { spawnAt, arriveAt, pulled }];
    changed = true;
  }
  return changed ? { ...r, rings } : r;
};

/** タップの判定。`result`: 'hit'=成功 / 'miss'=そのサークルの外れとして消費 / 'none'=何もしない。 */
export const tapAlchemyRhythm = (
  r: AlchemyRhythmState, gameTime: number,
): { state: AlchemyRhythmState; result: 'hit' | 'miss' | 'none' } => {
  const i = r.rings.findIndex(g => g.result === undefined && gameTime <= g.arriveAt + ALCHEMY_RHYTHM_WINDOW_MS);
  if (i < 0) return { state: r, result: 'none' };
  const g = r.rings[i];
  if (gameTime < g.arriveAt - ALCHEMY_RHYTHM_CONSUME_MS) return { state: r, result: 'none' };
  if (Math.abs(gameTime - g.arriveAt) > ALCHEMY_RHYTHM_WINDOW_MS) {
    const rings = r.rings.slice();
    rings[i] = { ...g, result: 'miss', judgedAt: gameTime };
    return { state: { ...r, rings }, result: 'miss' };
  }
  const rings = r.rings.slice();
  rings[i] = { ...g, result: 'hit', judgedAt: gameTime };
  // 次のサークルが既に飛んでいれば、その到着を前倒しする(まだなら advance が出す時に前倒しする)。
  const n = rings[i + 1];
  if (n && !n.pulled && n.result === undefined) rings[i + 1] = { ...n, arriveAt: n.arriveAt - ALCHEMY_RHYTHM_CUT_MS, pulled: true };
  return {
    state: { ...r, rings, hits: r.hits + 1, cutMs: r.cutMs + ALCHEMY_RHYTHM_CUT_MS, lastHitAt: gameTime },
    result: 'hit',
  };
};

/** 描画用: サークルの飛行の進み(0..1・加速して寄る=ease-in)。出ていない/判定済みは null。 */
export const alchemyRingProgress = (g: AlchemyRhythmRing, gameTime: number): number | null => {
  if (g.result !== undefined || gameTime < g.spawnAt) return null;
  const span = Math.max(1, g.arriveAt - g.spawnAt);
  const p = Math.min(1, (gameTime - g.spawnAt) / span);
  return p * p;
};

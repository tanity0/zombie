// ★格闘のステップの入力(research/BRAWLER.md §12-3・§12-3b)。PC=同じ方向キーの素早い2度押し(下の stepKey*)。
// スマホ・パッド=一方へ振ってすぐ反対へ切り返して離す(ファイルの後半)。
// 数値はタッチの2連タップ(スケボーの判定と同じ値=VirtualJoystick の SKATER_* / pcPress の PC_SKATER_*)に揃える。
export const STEP_KEY_DOUBLETAP_MS = 300; // 1回目の離し→2回目の押下 までの許容間隔
export const STEP_KEY_TAP_MAX_MS = 220;   // 1回目を「短い押し」とみなす最大の押下時間

export interface StepKeyState { dir: string; downAt: number; upAt: number; wasTap: boolean }
/** 方向キーを押した(押しっぱなしの repeat は呼ばない)。2度押しなら true(=ステップ)。state は呼び手が持つ。 */
export const stepKeyDown = (st: StepKeyState | null, dir: string, now: number): { state: StepKeyState; step: boolean } => {
  const step = !!st && st.dir === dir && st.wasTap && st.upAt >= st.downAt && now - st.upAt <= STEP_KEY_DOUBLETAP_MS;
  // 押している間は upAt=-1(離した時に stepKeyUp が書く)。ステップになった押下は離しても「短い押し」にしない=3度押しで2回出さない。
  return { state: { dir, downAt: now, upAt: -1, wasTap: false }, step };
};
/** 方向キーを離した。 */
export const stepKeyUp = (st: StepKeyState | null, dir: string, now: number, stepped: boolean): StepKeyState | null => {
  if (!st || st.dir !== dir) return st;
  return { ...st, upAt: now, wasTap: !stepped && now - st.downAt < STEP_KEY_TAP_MAX_MS };
};

// ---------------------------------------------------------------------------------------------
// ★スマホ・パッドのステップ(research/BRAWLER.md §12-3b・社長指示2026-11-10「一度反対に振ってからすぐに反対にレバーを切って離すとステップ」)
// 一方へ振る(1本目の振り)→ すぐ反対へ切り返す(2本目の振り)→ 離す(パッドは中立へ戻す)。向き=切り返した先(2本目の振りの向き)。
// 値は叩き台(実機で絞る)。
// ---------------------------------------------------------------------------------------------
/** 1本の振りに掛けてよい最長の時間(ms)。これより遅い振りは歩きの往復とみなす。 */
export const STEP_REVERSAL_LEG_MAX_MS = 180;
/** 1本の振りの最短の距離(px・タッチ)。フリックの最短距離(20px)と同じ。 */
export const STEP_REVERSAL_MIN_DIST = 20;
/** 1本の振りの最低の速さ(px/ms・タッチ)。切り返しの所で一度減速するので、フリック(0.9)より低め。 */
export const STEP_REVERSAL_MIN_SPEED = 0.5;
/** 2本の振りがなす角の下限=cos の上限(-0.5=120°以上・真反対に近いほど cos は -1)。 */
export const STEP_REVERSAL_MAX_COS = -0.5;
/** 2本目の振りの終わり→指離し(パッド=中立へ戻す)までの最長の間(ms)。切り返した後に止めてから離したのは成立しない。 */
export const STEP_REVERSAL_RELEASE_MAX_MS = 80;

export interface StickSample { x: number; y: number; t: number }
export interface StickReversalOpts { legMaxMs: number; minDist: number; minSpeed: number; maxCos: number; releaseMaxMs: number }
export const STEP_REVERSAL_TOUCH: StickReversalOpts = {
  legMaxMs: STEP_REVERSAL_LEG_MAX_MS, minDist: STEP_REVERSAL_MIN_DIST, minSpeed: STEP_REVERSAL_MIN_SPEED,
  maxCos: STEP_REVERSAL_MAX_COS, releaseMaxMs: STEP_REVERSAL_RELEASE_MAX_MS,
};

/**
 * 指離しの直前の軌跡が「一方へ振る→すぐ反対へ切り返す」か(utils/brawler の detectFlickFromSamples と同じ型の純関数)。
 * samples=指の位置の並び(古い順)・releaseAt=指を離した時刻(samples と同じ時計)。成立なら切り返した先の向き(長さ1)、不成立は null。
 * 式: 最後の点 L の手前の点 P を切り返しの点の候補にとり、
 *   2本目の振り P→L: 時間 ≤ legMaxMs・距離 ≥ minDist・速さ ≥ minSpeed
 *   1本目の振り S→P: S は P の手前 legMaxMs 以内で P から一番遠い点(同じ遠さなら新しい方)・距離 ≥ minDist・速さ ≥ minSpeed
 *   2本のなす角: cos(S→P, P→L) ≤ maxCos(=ほぼ反対)
 * を満たす P のうち、2本目の振りが一番長いものの向きを返す。L から指離しまでが releaseMaxMs を超えたら不成立。
 */
export const detectStickReversalFromSamples = (
  samples: readonly StickSample[], releaseAt: number, o: StickReversalOpts = STEP_REVERSAL_TOUCH,
): { x: number; y: number } | null => {
  if (samples.length < 3) return null;
  const last = samples[samples.length - 1];
  if (releaseAt - last.t > o.releaseMaxMs) return null;
  let best: { x: number; y: number } | null = null;
  let bestLen = 0;
  for (let i = samples.length - 2; i >= 1; i--) {
    const p = samples[i];
    const dt2 = last.t - p.t;
    if (dt2 > o.legMaxMs) break;
    const l2x = last.x - p.x, l2y = last.y - p.y;
    const d2 = Math.hypot(l2x, l2y);
    if (d2 < o.minDist || d2 / Math.max(1, dt2) < o.minSpeed || d2 <= bestLen) continue;
    let sx = 0, sy = 0, st = 0, d1 = 0;
    for (let j = i - 1; j >= 0; j--) {
      const q = samples[j];
      if (p.t - q.t > o.legMaxMs) break;
      const d = Math.hypot(p.x - q.x, p.y - q.y);
      if (d > d1) { d1 = d; sx = q.x; sy = q.y; st = q.t; }
    }
    if (d1 < o.minDist || d1 / Math.max(1, p.t - st) < o.minSpeed) continue;
    const cos = ((p.x - sx) * l2x + (p.y - sy) * l2y) / (d1 * d2);
    if (cos > o.maxCos) continue;
    best = { x: l2x / d2, y: l2y / d2 };
    bestLen = d2;
  }
  return best;
};

/** パッド: 「倒した」とみなす強さ(左スティックの長さ)。 */
export const PAD_STEP_PUSH_ON = 0.6;
/** パッド: 1回の倒しを続けてよい最長の時間(ms)。これより長く倒したままなら歩きとみなす。 */
export const PAD_STEP_HOLD_MAX_MS = 220;
/** パッド: 1回目の倒しの終わり→2回目の倒しの始まりの最長の間(ms)=「すぐ反対へ」。 */
export const PAD_STEP_GAP_MAX_MS = 120;
/** パッド: 2回目の倒しの終わり→中立へ戻すまでの最長の間(ms)。 */
export const PAD_STEP_RELEASE_MAX_MS = 100;

interface PadPush { x: number; y: number; m: number; startAt: number; endAt: number }
export interface PadReversalTracker { cur: PadPush | null; prev: PadPush | null; last: PadPush | null }
export const createPadReversalTracker = (): PadReversalTracker => ({ cur: null, prev: null, last: null });

/**
 * パッドの左スティックを1フレームぶん進める(§12-3b)。「一方へ倒す→すぐ反対へ倒す→中立へ戻す」が成立したフレームだけ
 * 切り返した先の向き(長さ1)を返す。tracker は呼び手が持つ(書き換える)。
 * 倒し=長さ PAD_STEP_PUSH_ON 以上が続いた区間(向き=その区間で一番強く倒した時の向き)。倒したまま反対側へ弾いたらそこで区切る。
 * 成立: 直前の2回の倒しが ①どちらも PAD_STEP_HOLD_MAX_MS 以内 ②間が PAD_STEP_GAP_MAX_MS 以内 ③なす角 cos ≤ STEP_REVERSAL_MAX_COS
 *       ④2回目の終わりから PAD_STEP_RELEASE_MAX_MS 以内に中立(デッドゾーンの内側)へ戻った。
 */
export const stepPadReversal = (tr: PadReversalTracker, ax: number, ay: number, now: number, dead: number): { x: number; y: number } | null => {
  const m = Math.hypot(ax, ay);
  if (m >= PAD_STEP_PUSH_ON) {
    // 倒したまま反対側へ弾いた(中立を通らない)=そこで倒しを区切る。
    if (tr.cur && tr.cur.x * (ax / m) + tr.cur.y * (ay / m) <= STEP_REVERSAL_MAX_COS) { tr.prev = tr.last; tr.last = tr.cur; tr.cur = null; }
    if (!tr.cur) tr.cur = { x: ax / m, y: ay / m, m, startAt: now, endAt: now };
    else {
      tr.cur.endAt = now;
      if (m > tr.cur.m) { tr.cur.x = ax / m; tr.cur.y = ay / m; tr.cur.m = m; }
    }
    return null;
  }
  if (tr.cur) { tr.prev = tr.last; tr.last = tr.cur; tr.cur = null; }
  if (m > dead) return null;
  // 中立。反対へ倒し直す途中で中立を1〜2フレーム通るので、ここでは履歴を消さない(古い倒しは時間の条件で落ちる)。
  const a = tr.prev, b = tr.last;
  if (!a || !b) return null;
  if (a.endAt - a.startAt > PAD_STEP_HOLD_MAX_MS || b.endAt - b.startAt > PAD_STEP_HOLD_MAX_MS) return null;
  if (b.startAt - a.endAt > PAD_STEP_GAP_MAX_MS) return null;
  if (now - b.endAt > PAD_STEP_RELEASE_MAX_MS) return null;
  if (a.x * b.x + a.y * b.y > STEP_REVERSAL_MAX_COS) return null;
  tr.prev = null; tr.last = null; // 成立した2回は使い切る(同じ切り返しで2回出さない)
  return { x: b.x, y: b.y };
};

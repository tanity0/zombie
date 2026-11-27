// ★刀の一閃の「通り道の途中の止め」(社長指示2026-11-27「一閃でストップしてないように見える。真ん中あたりで一瞬止めて欲しい」)。
// 一閃(居合一閃も)で走っている途中、通り道で最初に当たる敵の体の中心を通る瞬間に、走りを一瞬止める(体・斬撃の筋が止まる)。
// 走りの時計を止め、止めた分だけ走り終わり(着地・硬直・敵の体で止めない間)を後ろへ延ばす=走る距離は変えない。
// 通り道に敵が居ない(空振り)時は、通り道の真ん中で空振りの決めの間(MELEE_WHIFF_HOLD_MS)だけ止める。
// 当たりの処理(ダメージ・切り傷・殺陣・燕返しの受付)は今のまま着地の後にまとめて出す(止めは体と絵と当たった敵の止め・震えだけ)。
// store/PixiJS 非依存の純関数(movePlayer・守護霊の移動・pixi の筋の絵が読む)。
import { MELEE_WHIFF_HOLD_MS, KATANA_SELF_STOP_MS } from './meleeHitstopTiming';
import { applyHitstopK } from './hitShake';

/** 一閃の通り道の止め(1回の一閃に1回だけ)。at が入ったら止めは決まっている(at..at+ms の間は走らない)。 */
export interface KatanaDashHold {
  /** この一閃を出した時刻(Date.now)=どの一閃の止めかの名札。 */
  startAt: number;
  /** 走り始めの体の中心。 */
  fromX: number; fromY: number;
  /** 走る向き(単位ベクトル)。 */
  ux: number; uy: number;
  /** 走る予定の距離(px)。真ん中=total/2。 */
  total: number;
  /** 敵の中心を通った時の止めの長さ(ms)。 */
  hitMs: number;
  /** 空振りの時の止めの長さ(ms)。 */
  whiffMs: number;
  /** 一閃の筋の絵(trail)の id=止めの時刻を書き込む先。 */
  trailId?: string;
  /** 止めが始まった時刻(Date.now)。未設定=まだ止めていない。 */
  at?: number;
  /** 止めの長さ(ms)。at と一緒に入る。 */
  ms?: number;
  /** 止めた敵(空振りの止めは未設定)。 */
  enemyId?: string;
  /**
   * ★燕返し(社長指示2026-11-27「燕返しもストップして」・research/KATANA_TSUBAME.md §1): 体は動かない=「元の位置へ逆向きに走った」と仮定した
   * 通り道の時計で止める。入っていたら仮定の走る時間(ms)=通り道の位置は体ではなく時計から出す(katanaDashVirtualAlong)。一閃・居合一閃は未設定。
   */
  runMs?: number;
  /** ★居合一閃(カウンターの一閃)の止めか。決まった一撃として、貫いた敵での止め・震え・閃光を通常の一閃より一段強くする(store が読む)。 */
  iai?: boolean;
}

/** 一閃の通り道の止めの長さ(ms)= v0.25.5860 の刀の自分の止め×一閃の係数(1.3)。 */
export const KATANA_DASH_HIT_HOLD_MS = applyHitstopK(KATANA_SELF_STOP_MS, 'finisher');
/**
 * ★居合一閃の、貫いた敵での止め(ms)= 一閃の止めの2倍(社長「なんか素っ気ない」=カウンターが決まった一撃は通常の一閃より一段強く見せる・叩き台)。
 * 空振りの止めは一閃と同じ(居合一閃は必ず主に当たる)。
 */
export const KATANA_IAI_PASS_HOLD_MS = KATANA_DASH_HIT_HOLD_MS * 2;
/** 居合一閃の、貫いた敵の震え(止めより長く・大きく)。lenMul=止めの長さに対する震えの長さ・ampMul=震えの幅(一閃=1・1)。 */
export const KATANA_IAI_PASS_SHAKE = { lenMul: 1.5, ampMul: 1.8 } as const;
/** 空振りの一閃の真ん中の止め(ms)= 空振りの決めの間と同じ。 */
export const KATANA_DASH_WHIFF_HOLD_MS = MELEE_WHIFF_HOLD_MS;
/** 殺陣の各発の筋の止め(ms・短め=刀の自分の止めの半分・叩き台)。殺陣は 90ms おきに次の発が出るので、それより短くする。 */
export const SATSUJIN_STRIKE_HOLD_MS = Math.round(KATANA_SELF_STOP_MS * 0.5);

/** 止めの器を作る(一閃を出した瞬間)。 */
export const makeKatanaDashHold = (
  startAt: number, from: { x: number; y: number }, ux: number, uy: number, total: number, trailId?: string,
  hitMs = KATANA_DASH_HIT_HOLD_MS, whiffMs = KATANA_DASH_WHIFF_HOLD_MS,
): KatanaDashHold => ({ startAt, fromX: from.x, fromY: from.y, ux, uy, total, hitMs, whiffMs, ...(trailId !== undefined ? { trailId } : {}) });

/** 燕返しの止めの器(体は動かない・仮定の通り道を runMs で走る)。 */
export const makeTsubameDashHold = (
  startAt: number, from: { x: number; y: number }, ux: number, uy: number, total: number, runMs: number, trailId?: string,
): KatanaDashHold => ({ ...makeKatanaDashHold(startAt, from, ux, uy, total, trailId), runMs: Math.max(1, runMs) });

/**
 * 燕返しの仮定の通り道で、nowMs までに進んだ距離(px)。走りの時計=出してからの経過から止めの間を引いた分(止めの間は進まない)。
 * 同じ速さで total を runMs で走る(0..total に収める)。runMs が無い(一閃)時は 0。
 */
export const katanaDashVirtualAlong = (h: KatanaDashHold, nowMs: number): number => {
  if (h.runMs === undefined) return 0;
  let run = nowMs - h.startAt;
  if (h.at !== undefined) run -= Math.max(0, Math.min(nowMs, h.at + (h.ms ?? 0)) - Math.max(h.startAt, h.at));
  return h.total * Math.max(0, Math.min(1, run / h.runMs));
};

/** 走り始めから、通り道に沿って進んだ距離(px)。 */
export const katanaDashAlong = (h: Pick<KatanaDashHold, 'fromX' | 'fromY' | 'ux' | 'uy'>, cx: number, cy: number): number =>
  (cx - h.fromX) * h.ux + (cy - h.fromY) * h.uy;

/** 通り道の帯の中に居る敵の候補(呼び手が帯の幅と「斬れる敵か」で選んだ物)。along=敵の中心の通り道に沿った位置・halfW=体の幅の半分。 */
export interface KatanaDashHoldCand { id: string; along: number; halfW: number }

/**
 * このフレームの走り(before → after・通り道に沿った位置)で止めを始めるか。
 *  - 敵の中心を通った(中心の位置が after+半フレーム以下・走り始めの位置より体の半分以上後ろではない)→ その中で一番手前の敵で 'hit'。
 *    半フレーム先まで見る=止める位置のずれは最大で半フレームの走り(次のフレームで行き過ぎるより、こちらで止めた方が中心に近い時はここで止める)。
 *  - 通らずに真ん中を越えた時、真ん中より先(予定の距離+体の半分まで)に敵が居なければ 'whiff'(居れば、その敵を通るまで待つ)。
 *  - もう止めた・前へ進んでいない → null。
 */
export const pickKatanaDashHold = (
  h: KatanaDashHold, before: number, after: number, cands: readonly KatanaDashHoldCand[],
): { kind: 'hit'; enemyId: string; ms: number } | { kind: 'whiff'; ms: number } | null => {
  if (h.at !== undefined || !(after > before)) return null;
  const reach = after + (after - before) / 2;
  let best: KatanaDashHoldCand | null = null;
  for (const c of cands) {
    if (c.along < -c.halfW || c.along > reach || c.along > h.total + c.halfW) continue;
    if (!best || c.along < best.along) best = c;
  }
  if (best) return { kind: 'hit', enemyId: best.id, ms: h.hitMs };
  const mid = h.total / 2;
  if (before < mid && reach >= mid && !cands.some(c => c.along > reach && c.along <= h.total + c.halfW)) return { kind: 'whiff', ms: h.whiffMs };
  return null;
};

/** 止めの間か(この間は走らない)。 */
export const katanaDashHeld = (h: KatanaDashHold | undefined, nowMs: number): boolean =>
  !!h && h.at !== undefined && nowMs >= h.at && nowMs < h.at + (h.ms ?? 0);

/** 止めを始めた器(at・ms・敵)。 */
export const firedKatanaDashHold = (h: KatanaDashHold, nowMs: number, ms: number, enemyId?: string): KatanaDashHold =>
  ({ ...h, at: nowMs, ms, ...(enemyId !== undefined ? { enemyId } : {}) });

/**
 * 止めた分だけ走り終わりを後ろへ延ばす(走りの時計を止める=走る時間の合計は変わらない=距離は変わらない)。
 * 走り(katanaDashUntil)・着地の硬直(katanaRecoveryUntil)・居合一閃の「敵の体で止めない間」(iaiRunUntil・走っている時だけ)・
 * 燕返しのしゃがみ(tsubameCrouchUntil・しゃがんでいる時だけ)を同じだけ。
 */
export const katanaDashHoldExtend = <T extends { katanaDashUntil: number; katanaRecoveryUntil: number; iaiRunUntil?: number; tsubameCrouchUntil?: number }>(
  st: T, nowMs: number, ms: number,
): Pick<T, 'katanaDashUntil' | 'katanaRecoveryUntil'> & { iaiRunUntil?: number; tsubameCrouchUntil?: number } => ({
  katanaDashUntil: st.katanaDashUntil + ms,
  katanaRecoveryUntil: st.katanaRecoveryUntil + ms,
  ...(st.iaiRunUntil !== undefined && nowMs < st.iaiRunUntil ? { iaiRunUntil: st.iaiRunUntil + ms } : {}),
  ...(st.tsubameCrouchUntil !== undefined && nowMs < st.tsubameCrouchUntil ? { tsubameCrouchUntil: st.tsubameCrouchUntil + ms } : {}),
});

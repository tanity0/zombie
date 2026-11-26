// ★ナイフ(近接)の3連撃(社長指示2026-11-26「ナイフは標準で3回振りにする。0.5秒。で、モーションは2段目を1段目で振り上げたところからの、
// 振り下ろしにする。3段目は再度振り上げ。どれも少し踏み込み。」)。鞭の3連撃(utils/whipCombo)と同じ作り。判定だけを置く純関数。数値は叩き台。
//  - タップ(近接の入力)ごとに 1→2→3→1… と1段ずつ進む。最後の振りから RESET_MS タップが無ければ1段目へ戻る。
//  - 段と段の間は最短 INTERVAL_MS(それより早いタップは1つだけ先行入力として持ち、間隔が明けたら出す)。3段目の後は隙(FINISH_RECOVERY_MS)。
//  - カウンター窓は1段目だけ・カウンターのクールダウンは連撃の終わりから(鞭と同じ規則)。
//  - 絵: 1段目=振り上げ(下から上へ斬り上げ) / 2段目=1段目で振り上げた所からの振り下ろし / 3段目=再び振り上げ。どの段も少し踏み込む。
import { comboFinishMoveMult } from './whipCombo';

/** 段と段の間の最短(ms)。 */
export const KNIFE_COMBO_INTERVAL_MS = 500;
/** 最後の振りからこれだけタップが無ければ1段目へ戻る(ms)。 */
export const KNIFE_COMBO_RESET_MS = 900;
/** 先行入力を持っておく長さの上限(ms)。 */
export const KNIFE_COMBO_QUEUE_MAX_MS = 600;
/** 3段目を振ってから次の振り(1段目)が出せるまで(ms)。★1.0秒=普通の段の間の倍(社長承認2026-11-26・旧 600・鞭と共通)。 */
export const KNIFE_COMBO_FINISH_RECOVERY_MS = 1000;
/** 3段目の後の隙の体の姿勢: 振り抜いた所で粘る長さ(ms・隙 1.0秒に合わせて 120→200)。 */
export const KNIFE_COMBO_FINISH_HOLD_MS = 200;
/** ★3段目の後の隙の前半(社長指示2026-11-26「隙の半分は立ち止まっててほしい」): 3段目を振った時刻からこの間、歩く速さ 0(ms=隙の半分・鞭と共通)。そこから隙の終わりまでに慣性つきで戻る。 */
export const KNIFE_COMBO_FINISH_STOP_MS = KNIFE_COMBO_FINISH_RECOVERY_MS / 2;
/** 段ごとの踏み込み(体の幅に対する割合)。立ち・歩きの振りでも少し前へ出る(走りの踏み込みの方が大きければそちら)。 */
export const KNIFE_COMBO_STEP_FRAC = 0.3;

export type KnifeComboStage = 1 | 2 | 3;

/** ナイフ: 最後に振った段・時刻から、今の歩く速さの倍率(鞭の whipComboFinishMoveMult と同じ形)。3段目以外は 1。 */
export const knifeComboFinishMoveMult = (stage: number | undefined, comboAt: number | undefined, nowMs: number): number =>
  stage === 3 && (comboAt ?? 0) > 0 ? comboFinishMoveMult(nowMs - (comboAt as number), KNIFE_COMBO_FINISH_STOP_MS, KNIFE_COMBO_FINISH_RECOVERY_MS) : 1;

/** 次の段。prev=前の段(0=まだ振っていない)・lastAt=前の振りの時刻・now=今(同じ時計)。 */
export const knifeComboNextStage = (prev: number, lastAt: number, now: number): KnifeComboStage => {
  if (!(prev >= 1 && prev <= 3) || !(now - lastAt <= KNIFE_COMBO_RESET_MS)) return 1;
  return ((prev % 3) + 1) as KnifeComboStage;
};
/** この段を振った後、次の振りが出せるまで(ms・近接CDの短縮を掛ける前)。 */
export const knifeComboGapMs = (stage: number): number => (stage === 3 ? KNIFE_COMBO_FINISH_RECOVERY_MS : KNIFE_COMBO_INTERVAL_MS);
/** タップを今すぐ振るか・予約するか・捨てるか(3段目の前隙中と3段目の後の隙の間は捨てる)。 */
export const knifeComboTapAction = (now: number, cdEnd: number, pending: boolean, prevStage = 0): 'swing' | 'queue' | 'drop' => {
  if (!pending && now >= cdEnd) return 'swing';
  return prevStage === 3 ? 'drop' : 'queue';
};
/** 予約を出すか(間隔が明けて前隙中でない・予約が古すぎない)。 */
export const knifeComboQueuedAction = (now: number, queuedAt: number, cdEnd: number, pending: boolean): 'fire' | 'wait' | 'drop' => {
  if (now - queuedAt > KNIFE_COMBO_QUEUE_MAX_MS) return 'drop';
  return !pending && now >= cdEnd ? 'fire' : 'wait';
};
/** 連撃が終わる時刻(この段を最後に止まった場合)。3段目=その振り・1/2段目=戻る時間の後。 */
export const knifeComboEndAt = (stage: number, swingAt: number): number =>
  stage === 3 ? swingAt : swingAt + KNIFE_COMBO_RESET_MS;
export interface KnifeComboCounterPlan { open: boolean; comboCounter: boolean; readyAt: number }
/** 振りごとのカウンターの可否とクールダウン(鞭の whipComboCounterPlan と同じ規則)。 */
export const knifeComboCounterPlan = (stage: number, swingAt: number, readyAt: number, comboCounter: boolean, cdMs: number): KnifeComboCounterPlan => {
  const open = stage === 1 && swingAt >= readyAt;
  const inCombo = stage === 1 ? open : comboCounter;
  return { open, comboCounter: inCombo, readyAt: inCombo ? knifeComboEndAt(stage, swingAt) + cdMs : readyAt };
};
/** 振りの向き: +1=振り上げ(1・3段目) / -1=振り下ろし(2段目)。 */
export const knifeComboSwingDir = (stage: number): 1 | -1 => (stage === 2 ? -1 : 1);
/** 段の踏み込みの距離(px)。runPx=走りの踏み込み(0=立ち・歩き)。 */
export const knifeComboStepPx = (bodyWidth: number, runPx: number): number => Math.max(runPx, bodyWidth * KNIFE_COMBO_STEP_FRAC);

/**
 * 体の動きの進み具合(描画だけ)。since=振り始めからの ms・windowMs=いつもの振りの表示の長さ。
 * 返り値 t=0..1(いつもの振りの式に渡す進み・0.5=踏み込みの頂点)・active=体の動きを出すか。
 * 1・2段目=いつもどおり(t=since/windowMs)。3段目=頂点(t=0.5)まではいつもどおり、そこで粘ってから、隙が明けるまでに減速してゆっくり戻る。
 */
export const knifeComboBodyT = (since: number, windowMs: number, stage: number): { t: number; active: boolean } => {
  if (!(since >= 0) || !(windowMs > 0)) return { t: 0, active: false };
  if (stage !== 3) return since < windowMs ? { t: since / windowMs, active: true } : { t: 1, active: false };
  const peakMs = windowMs / 2;
  if (since < peakMs) return { t: since / windowMs, active: true };
  const total = Math.max(windowMs, KNIFE_COMBO_FINISH_RECOVERY_MS);
  const hold = Math.min(KNIFE_COMBO_FINISH_HOLD_MS, Math.max(0, total - peakMs) / 2);
  if (since < peakMs + hold) return { t: 0.5, active: true };
  const rest = Math.max(1, total - peakMs - hold);
  const u = (since - peakMs - hold) / rest;
  if (u >= 1) return { t: 1, active: false };
  const e = 1 - (1 - u) * (1 - u); // 減速して戻る(慣性)
  return { t: 0.5 + 0.5 * e, active: true };
};

/** 体の振りの姿勢が立ち姿へ戻る時刻(振り始めからの ms・knifeComboBodyT の active が切れる所)。3段目=隙が明けるまで・1/2段目=いつもの振りの表示の長さ。 */
export const knifeComboBodyEndMs = (windowMs: number, stage: number): number =>
  stage === 3 ? Math.max(windowMs, KNIFE_COMBO_FINISH_RECOVERY_MS) : windowMs;
/** 手のナイフの絵が引く長さ(ms)。体が立ち姿へ戻り切る時刻に消え切る。 */
export const KNIFE_COMBO_WPN_FADE_MS = 80;
/**
 * ★手のナイフの絵の濃さ(社長指示2026-11-26「ナイフは最後まで表示しといて欲しい」・描画だけ)。
 * 体の振りの姿勢が続く間(1/2段目=振りの表示の終わり・3段目=隙が明けて立ち姿に戻るまで)は 1。終わり際の FADE_MS で加減速つきに 0 へ(パッと消さない)。
 */
export const knifeComboWpnAlpha = (since: number, windowMs: number, stage: number): number => {
  if (!(since >= 0)) return 0;
  const end = knifeComboBodyEndMs(windowMs, stage);
  if (since >= end) return 0;
  const fade = Math.min(KNIFE_COMBO_WPN_FADE_MS, end / 2);
  if (since <= end - fade) return 1;
  const f = (since - (end - fade)) / fade;
  return 1 - f * f * (3 - 2 * f);
};

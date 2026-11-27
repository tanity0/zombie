// ★鞭の3連撃(社長指示2026-11-26「鞭は少し仕様変える。タップで0.3秒間隔で3連撃。絵は左右に振りつつ正面を。で、2-3とクリティカル率が上がる。
// 1-2撃目は敵は吹き飛ばず、ストップ弱浮き」+「タップごとに1発」)。判定だけを置く純関数(store にも描画にも依存しない)。数値は叩き台。
//  - タップ(近接の入力)ごとに 1→2→3→1… と1段ずつ進む。最後の振りから RESET_MS タップが無ければ1段目へ戻る。
//  - 段と段の間は最短 INTERVAL_MS(それより早いタップは1つだけ先行入力として持ち、間隔が明けたら出す)。
//  - 絵: 1段目=右から / 2段目=左から / 3段目=もう一度右から一番大きく(判定は今の振りの帯=狙いの向きのまま・whipComboFromSide)。

import { stretchStopMs } from './meleeHitstopTiming';
import { applyHitstopK, comboStageMoveKind } from './hitShake';

/** 段と段の間の最短(ms)。★社長指示2026-11-26「鞭の連撃、0.5秒間隔にして」(旧 300)。 */
export const WHIP_COMBO_INTERVAL_MS = 500;
/** 最後の振りからこれだけタップが無ければ1段目へ戻る(ms)。 */
export const WHIP_COMBO_RESET_MS = 900;
/** 先行入力を持っておく長さの上限(ms)。これより古い予約は捨てる(ポーズ等で残らない)。 */
export const WHIP_COMBO_QUEUE_MAX_MS = 600;
/** 段ごとの会心率の上乗せ(1段目・2段目・3段目)。今の会心率に足す。 */
export const WHIP_COMBO_CRIT_BONUS: readonly [number, number, number] = [0, 0.15, 0.3];
/** 払いの振れ幅(rad・1段目と2段目)。鞭の向きはこの分だけ横から入り、当たる瞬間に狙いの向きでまっすぐ伸び切る。 */
export const WHIP_COMBO_SWEEP_RAD = 1.1;

export type WhipComboStage = 1 | 2 | 3;

/** 次の段。prev=前の段(0=まだ振っていない)・lastAt=前の振りの時刻・now=今(同じ時計)。 */
export const whipComboNextStage = (prev: number, lastAt: number, now: number): WhipComboStage => {
  if (!(prev >= 1 && prev <= 3) || !(now - lastAt <= WHIP_COMBO_RESET_MS)) return 1;
  return ((prev % 3) + 1) as WhipComboStage;
};
/** 段の会心率の上乗せ。 */
export const whipComboCritBonus = (stage: number): number =>
  stage === 2 ? WHIP_COMBO_CRIT_BONUS[1] : stage === 3 ? WHIP_COMBO_CRIT_BONUS[2] : WHIP_COMBO_CRIT_BONUS[0];
/** 1段目・2段目=当たった敵は吹き飛ばない(押しなし・短い止めと弱い浮き)。3段目=今の押し。 */
export const whipComboLight = (stage: number): boolean => stage === 1 || stage === 2;
/**
 * ★3連撃の振りが来る側(画面の向き・単位ベクトル・狙いの向きに直交)。社長指示2026-11-26「鞭が右左右では無い時がかなりある」:
 * 1段目=右から・2段目=左から・3段目=もう一度右から(一番大きく)。縄はこの側へ振りかぶり、この側で折れてから狙いの向きへ伸び切る。
 * 「右」の決め方(どの向きでも交互が読めるように画面で決める): 狙いに直交する2つの向きのうち、画面の右(x+)を優先し、次に手前(画面の下=y+)を優先した側。
 *  - 上下の狙い=画面の右から/左から・左右の狙い=手前から/奥から・斜め=右寄りの側から/左寄りの側から。
 * aimAngle=狙いの向き(rad・画面の y は下が正)。
 */
export const whipComboFromSide = (stage: number, aimAngle: number): { x: number; y: number } => {
  const nx = -Math.sin(aimAngle), ny = Math.cos(aimAngle);
  const right = nx + 0.5 * ny >= 0 ? 1 : -1;
  const k = stage === 2 ? -right : right;
  return { x: nx * k, y: ny * k };
};
/**
 * 払いの向きの符号(+1=画面で時計回りに払う=先端が (-sin, cos) の向きへ動く)。先端は振りが来る側(whipComboFromSide)から反対側へ動く:
 * 1段目=右→左・2段目=左→右。3段目は 0(当たりの筋は狙いの向きのまま)。aimAngle=狙いの向き(rad・画面の y は下が正)。
 */
export const whipComboSweepSign = (stage: number, aimAngle: number): 1 | -1 | 0 => {
  if (stage !== 1 && stage !== 2) return 0;
  const f = whipComboFromSide(stage, aimAngle);
  return f.x * -Math.sin(aimAngle) + f.y * Math.cos(aimAngle) > 0 ? -1 : 1;
};
/**
 * ★3段目の後の隙(社長指示2026-11-26「3連撃の最後はきちんと隙つくって」)。3段目を振ってから次の振り(1段目)が出せるまで(ms)。
 * ★1.0秒=普通の段の間の倍(社長承認2026-11-26・旧 600)。1段目へ戻る時間(WHIP_COMBO_RESET_MS=0.9秒)より長い=隙が明けた時には1段目に戻っている。
 * 段の間隔(WHIP_COMBO_INTERVAL_MS)と同じく振った時刻から数える・近接CDの短縮は掛かる。この間のタップは予約しない(捨てる)。
 */
export const WHIP_COMBO_FINISH_RECOVERY_MS = 1000;
/** ★3段目の後の隙の前半(社長指示2026-11-26「隙の半分は立ち止まっててほしい」): 3段目を振った時刻からこの間、歩く速さ 0(完全に止まる・ms=隙の半分)。 */
export const WHIP_COMBO_FINISH_STOP_MS = WHIP_COMBO_FINISH_RECOVERY_MS / 2;
/**
 * 3段目の後の歩く速さの倍率(1=いつもどおり)。sinceMs=3段目を振ってからの ms。
 * stopMs までは 0(立ち止まる)、そこから endMs(隙の終わり)までに加減速つき(smoothstep)で 1 へ戻す=パッと動き出さない(慣性)。
 * ダッシュ系・スライドには掛からない(utils/playerMoveSpeed の meleeRecoverMult と同じ枝に乗る)。
 */
export const comboFinishMoveMult = (sinceMs: number, stopMs: number, endMs: number): number => {
  if (!(sinceMs >= 0) || sinceMs >= endMs) return 1;
  if (sinceMs <= stopMs) return 0;
  const u = (sinceMs - stopMs) / Math.max(1, endMs - stopMs);
  return u * u * (3 - 2 * u);
};
/** 鞭: 最後に振った段・時刻から、今の歩く速さの倍率。3段目以外は 1。 */
export const whipComboFinishMoveMult = (stage: number | undefined, comboAt: number | undefined, nowMs: number): number =>
  stage === 3 && (comboAt ?? 0) > 0 ? comboFinishMoveMult(nowMs - (comboAt as number), WHIP_COMBO_FINISH_STOP_MS, WHIP_COMBO_FINISH_RECOVERY_MS) : 1;
/** この段を振った後、次の振りが出せるまで(ms・近接CDの短縮を掛ける前)。3段目=隙・1/2段目=段の間隔。 */
export const whipComboGapMs = (stage: number): number => (stage === 3 ? WHIP_COMBO_FINISH_RECOVERY_MS : WHIP_COMBO_INTERVAL_MS);
/** 3段目の後の隙の体の姿勢: 振り抜いた底で粘る長さ(ms・隙 1.0秒に合わせて 120→200)。残りの隙(隙−前隙−粘り)でゆっくり立ち姿へ戻る。 */
export const WHIP_COMBO_FINISH_HOLD_MS = 200;
/**
 * 体の姿勢の戻り(utils/whipSwingMotion の whipBodyPose に渡す recoverMs/holdMs)。null=今の戻りのまま(1・2段目)。
 * 3段目=隙が明けるまでに立ち姿へ戻り切る(粘り WHIP_COMBO_FINISH_HOLD_MS+戻り=隙−前隙)。
 */
export const whipComboBodyRecover = (stage: number, windupMs: number): { recoverMs: number; holdMs: number } | null => {
  if (stage !== 3) return null;
  const rest = Math.max(0, WHIP_COMBO_FINISH_RECOVERY_MS - Math.max(0, windupMs));
  const holdMs = Math.min(WHIP_COMBO_FINISH_HOLD_MS, rest / 2);
  return { recoverMs: Math.max(1, rest - holdMs), holdMs };
};
/**
 * タップを今すぐ振れるか、予約するか、捨てるか。cdEnd=次の振りが出せる時刻・pending=前隙中か・prevStage=最後に振った段。
 * 3段目の前隙中と3段目の後の隙の間は捨てる(予約して隙明けに出すと隙にならない)。
 */
export const whipComboTapAction = (now: number, cdEnd: number, pending: boolean, prevStage = 0): 'swing' | 'queue' | 'drop' => {
  if (!pending && now >= cdEnd) return 'swing';
  return prevStage === 3 ? 'drop' : 'queue';
};
/** 予約を出すか(間隔が明けて前隙中でない・予約が古すぎない)。古すぎれば 'drop'。 */
export const whipComboQueuedAction = (now: number, queuedAt: number, cdEnd: number, pending: boolean): 'fire' | 'wait' | 'drop' => {
  if (now - queuedAt > WHIP_COMBO_QUEUE_MAX_MS) return 'drop';
  return !pending && now >= cdEnd ? 'fire' : 'wait';
};

/**
 * ★段ごとの打撃の手応え(社長指示2026-11-26「打撃感が気持ち良くなる様にして」)。全部同じ強さにしない: 1段目=軽く速い・2段目=少し重い・3段目=一番重い。
 * stopMs=当たった敵だけの止め(上乗せ・ms)・shakeMs/shakeMag=画面の揺れ(0=揺らさない)・burst=弾けの粒の数・ringR=輪の半径(0=無し)・glow=光の大きさの段(0..2)。
 * streak=鞭の進む向き(払いの向き)へ走る細い筋の段(0=無し・1=細く長く速い・2=太く短い)・finish=足元の砂埃と踏み込みの粒で締める(3段目)。
 * 音: hitRate/hitVol=鞭の命中音の高さと大きさ・heavyVol=重い命中音を重ねる大きさ(0=重ねない)・heavyRate=その高さ。会心は CRIT の分だけ上乗せ。
 * (見え方の監査 A6「3段の差が既存の白い命中の光に埋もれる」: 白い光は残し、差を足す側で大きくする。)
 */
export interface WhipComboFeel {
  /** ★selfStopMs=自分の振りの絵(体の姿勢・縄)を止める長さ(ms・描画だけ・社長指示2026-11-27「鞭にもナイフと同じ自分の止め」)。 */
  stopMs: number; selfStopMs: number; shakeMs: number; shakeMag: number; burst: number; ringR: number; glow: 0 | 1 | 2;
  streak: 0 | 1 | 2; finish: boolean;
  hitRate: number; hitVol: number; heavyVol: number; heavyRate: number;
}
export const WHIP_COMBO_FEEL: Readonly<Record<WhipComboStage, WhipComboFeel>> = {
  1: { stopMs: 55, selfStopMs: 45, shakeMs: 0, shakeMag: 0, burst: 7, ringR: 0, glow: 0, streak: 1, finish: false, hitRate: 1.22, hitVol: 0.7, heavyVol: 0, heavyRate: 1 },
  2: { stopMs: 70, selfStopMs: 60, shakeMs: 110, shakeMag: 4, burst: 10, ringR: 46, glow: 1, streak: 2, finish: false, hitRate: 1.04, hitVol: 0.85, heavyVol: 0.35, heavyRate: 1.25 },
  3: { stopMs: 150, selfStopMs: 120, shakeMs: 280, shakeMag: 12, burst: 24, ringR: 120, glow: 2, streak: 0, finish: true, hitRate: 0.82, hitVol: 1, heavyVol: 0.95, heavyRate: 0.84 },
};
/** 会心の上乗せ: 止め +ms・揺れ +ms/+強さ・金の光と輪。 */
export const WHIP_COMBO_CRIT_STOP_MS = 45;
export const WHIP_COMBO_CRIT_SHAKE_MS = 80;
export const WHIP_COMBO_CRIT_SHAKE_MAG = 3;
/** 連打で同じ音が機械的に並ばないよう音の高さを揺らす幅(±割合)。r=0..1 の乱数。 */
export const WHIP_COMBO_PITCH_JITTER = 0.05;
export const whipComboPitch = (base: number, r: number): number => base * (1 + WHIP_COMBO_PITCH_JITTER * (2 * r - 1));
/** 段の手応え。 */
export const whipComboFeel = (stage: number): WhipComboFeel => WHIP_COMBO_FEEL[(stage === 2 || stage === 3 ? stage : 1) as WhipComboStage];
/** 会心の時の自分の振りの止めの上乗せ(ms・ナイフの KNIFE_COMBO_CRIT_SELF_STOP_MS と同じ)。 */
export const WHIP_COMBO_CRIT_SELF_STOP_MS = 30;
/**
 * 当たった敵の止め(ms)・自分の振りの止め(ms)。会心の上乗せ込み。
 * ★段の値 ×MELEE_HITSTOP_STRETCH(社長指示2026-11-27「もう少し止めてもいい気がする」・叩き台・旧 ×1)。会心の上乗せは今のまま足す。
 */
export const whipComboHitStop = (stage: number, crit: boolean, tipHit = false): { enemyMs: number; selfMs: number } => {
  const f = whipComboFeel(stage);
  // ★技の係数(research/HITSTOP.md §2-5・§6): ×MELEE_HITSTOP_STRETCH の後に段の係数(1段目 0.8 / 2段目 1.0 / 3段目 1.3)。
  //   先端でボスを打った当たり(tipHit=既存の先端の判定 isWhipTipHit)は段に依らず 1.6。会心の上乗せはその後。
  const kind = tipHit ? 'whipTip' : comboStageMoveKind(stage);
  return {
    enemyMs: applyHitstopK(stretchStopMs(f.stopMs), kind, crit ? WHIP_COMBO_CRIT_STOP_MS : 0),
    selfMs: applyHitstopK(stretchStopMs(f.selfStopMs), kind, crit ? WHIP_COMBO_CRIT_SELF_STOP_MS : 0),
  };
};

/**
 * ★カウンターは3連撃の1段目だけ・クールダウンは連撃の終わりから(社長指示2026-11-26「カウンターは一撃目のみで、クールダウンは連撃終わりからです」)。
 *  - カウンター窓(弾の打ち返し・カウンターの判定)を開くのは1段目の振りだけ。2・3段目の振りでは開かない(鞭の打撃は出る)。
 *  - 1段目で窓を開いた連撃は、終わった時点から cdMs のクールダウン(readyAt=次の1段目で窓を開ける時刻)。
 *    「連撃の終わり」=3段目の振り、または途中で止めて1段目へ戻る時(最後の振りから WHIP_COMBO_RESET_MS)。
 *    連撃が続く間は振るたびに終わりを打ち直す(続けば後ろへ・3段目で確定)。
 *  - 窓を開けなかった連撃(クールダウン中に始めた連撃)は readyAt を動かさない。
 *  - 段の間隔・予約・戻る時間(振りそのものの速さ)はここでは扱わない(counterCooldownEnd=段の間隔のまま)。
 */
export interface WhipComboCounterPlan {
  /** この振りでカウンター窓を開くか。 */
  open: boolean;
  /** 今の連撃が1段目で窓を開いたか(2・3段目へ持ち越す)。 */
  comboCounter: boolean;
  /** 次の1段目で窓を開ける時刻(同じ時計)。 */
  readyAt: number;
}
/** 連撃が終わる時刻(この段を最後に止まった場合)。3段目=その振り・1/2段目=戻る時間の後。 */
export const whipComboEndAt = (stage: number, swingAt: number): number =>
  stage === 3 ? swingAt : swingAt + WHIP_COMBO_RESET_MS;
/** 振りごとのカウンターの可否とクールダウン。stage=この振りの段・readyAt/comboCounter=振る前の値・cdMs=クールダウンの長さ(近接CDの短縮を掛けた後)。 */
export const whipComboCounterPlan = (stage: number, swingAt: number, readyAt: number, comboCounter: boolean, cdMs: number): WhipComboCounterPlan => {
  const open = stage === 1 && swingAt >= readyAt;
  const inCombo = stage === 1 ? open : comboCounter;
  return { open, comboCounter: inCombo, readyAt: inCombo ? whipComboEndAt(stage, swingAt) + cdMs : readyAt };
};
/** 連撃が途中で切れた(掴んだ等で段が1段目へ戻された)時: 窓を開いた連撃なら、今(endAt)から cdMs。 */
export const whipComboCounterCut = (endAt: number, readyAt: number, comboCounter: boolean, cdMs: number): { comboCounter: false; readyAt: number } =>
  ({ comboCounter: false, readyAt: comboCounter ? endAt + cdMs : readyAt });

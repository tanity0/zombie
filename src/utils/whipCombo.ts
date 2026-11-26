// ★鞭の3連撃(社長指示2026-11-26「鞭は少し仕様変える。タップで0.3秒間隔で3連撃。絵は左右に振りつつ正面を。で、2-3とクリティカル率が上がる。
// 1-2撃目は敵は吹き飛ばず、ストップ弱浮き」+「タップごとに1発」)。判定だけを置く純関数(store にも描画にも依存しない)。数値は叩き台。
//  - タップ(近接の入力)ごとに 1→2→3→1… と1段ずつ進む。最後の振りから RESET_MS タップが無ければ1段目へ戻る。
//  - 段と段の間は最短 INTERVAL_MS(それより早いタップは1つだけ先行入力として持ち、間隔が明けたら出す)。
//  - 絵: 1段目=左から右へ払う / 2段目=右から左へ払う / 3段目=正面へまっすぐ打ち込む(判定は今の振りの帯=狙いの向きのまま)。

/** 段と段の間の最短(ms)。 */
export const WHIP_COMBO_INTERVAL_MS = 300;
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
 * 払いの向きの符号(+1=画面で時計回りに払う)。1段目は画面の左→右、2段目は右→左。3段目は 0(まっすぐ)。
 * 狙いが上下寄り(|sin|>0.35)の時は、先端が画面の左→右へ動く向き。ほぼ真横の時は、1段目=上から下(右向き=時計回り・左向き=反時計回り)。
 * aimAngle=狙いの向き(rad・画面の y は下が正)。
 */
export const whipComboSweepSign = (stage: number, aimAngle: number): 1 | -1 | 0 => {
  if (stage !== 1 && stage !== 2) return 0;
  const sn = Math.sin(aimAngle), cs = Math.cos(aimAngle);
  // 時計回り(角度が増える)の時の先端の横の速さ ∝ -sin(aim)。左→右(横の速さ>0)にしたい=sin<0 なら時計回り。
  const first: 1 | -1 = sn > 0.35 ? -1 : sn < -0.35 ? 1 : cs >= 0 ? 1 : -1;
  return stage === 1 ? first : (first === 1 ? -1 : 1);
};
/** タップを今すぐ振れるか、予約するか。cdEnd=段の間隔が明ける時刻・pending=前隙中か。 */
export const whipComboTapAction = (now: number, cdEnd: number, pending: boolean): 'swing' | 'queue' =>
  !pending && now >= cdEnd ? 'swing' : 'queue';
/** 予約を出すか(間隔が明けて前隙中でない・予約が古すぎない)。古すぎれば 'drop'。 */
export const whipComboQueuedAction = (now: number, queuedAt: number, cdEnd: number, pending: boolean): 'fire' | 'wait' | 'drop' => {
  if (now - queuedAt > WHIP_COMBO_QUEUE_MAX_MS) return 'drop';
  return !pending && now >= cdEnd ? 'fire' : 'wait';
};

/**
 * ★段ごとの打撃の手応え(社長指示2026-11-26「打撃感が気持ち良くなる様にして」)。全部同じ強さにしない: 1段目=軽く速い・2段目=少し重い・3段目=一番重い。
 * stopMs=当たった敵だけの止め(上乗せ・ms)・shakeMs/shakeMag=画面の揺れ(0=揺らさない)・burst=弾けの粒の数・ringR=輪の半径(0=無し)・glow=光の大きさの段(0..2)。
 * 音: hitRate/hitVol=鞭の命中音の高さと大きさ・heavyVol=重い命中音を重ねる大きさ(0=重ねない)・heavyRate=その高さ。会心は CRIT の分だけ上乗せ。
 */
export interface WhipComboFeel {
  stopMs: number; shakeMs: number; shakeMag: number; burst: number; ringR: number; glow: 0 | 1 | 2;
  hitRate: number; hitVol: number; heavyVol: number; heavyRate: number;
}
export const WHIP_COMBO_FEEL: Readonly<Record<WhipComboStage, WhipComboFeel>> = {
  1: { stopMs: 35, shakeMs: 0, shakeMag: 0, burst: 6, ringR: 0, glow: 0, hitRate: 1.22, hitVol: 0.7, heavyVol: 0, heavyRate: 1 },
  2: { stopMs: 60, shakeMs: 90, shakeMag: 3, burst: 10, ringR: 40, glow: 1, hitRate: 1.04, hitVol: 0.85, heavyVol: 0.35, heavyRate: 1.25 },
  3: { stopMs: 110, shakeMs: 200, shakeMag: 8, burst: 18, ringR: 78, glow: 2, hitRate: 0.82, hitVol: 1, heavyVol: 0.85, heavyRate: 0.88 },
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

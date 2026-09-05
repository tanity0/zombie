// PACING_PUZZLE.md §14-2(降格死神「伐採人」= §9削岩型の写し+差分4点・社長指示2026-08-28)。
// レンダラ非依存の純関数群=ヘッドレスでユニットテスト可能(CLAUDE.md 実装精度の規律4)。
//
// 土台(カイトAI/近接被弾での離脱/同格湧き分け)は§9をそのまま流用するため drillerAi.ts に置いた
// ままにする(resolvePumpkinTier/isRetreatEligibleType/isKiteMidAttackPhase/DRILLER_RETREAT_*/
// isDrillerRetreating)。ここに置くのは伐採人固有の差分4点のうち数値化できる2つ(②間合い ③薙ぎの帯)
// だけ(①絵・④予告尺はpixiScene/gameStoreの定数)。

// §14-2③: 好みの間合い(px)=「槍より少し近い位置」。150px超=接近 / 110px未満=後退 /
// 帯内(110〜150)=構え(移動を止める)。driller(140〜190)の写しで数値だけ差分(叩き台)。
export const LOGGER_APPROACH_DIST = 150;
export const LOGGER_BACKOFF_DIST = 110;

export type LoggerZone = 'approach' | 'backoff' | 'hold';

/** §14-2③: 間合い判定(通常時=薙ぎ払い3州でも離脱でもない時の移動方向)。driller版と同じ形。 */
export const loggerZoneFor = (distance: number): LoggerZone => {
  if (distance > LOGGER_APPROACH_DIST) return 'approach';
  if (distance < LOGGER_BACKOFF_DIST) return 'backoff';
  return 'hold';
};

// 薙ぎ払いの発動距離(この距離以内かつCD満了で発動)。driller方式(好み帯の上限+10)を踏襲した叩き台。
export const LOGGER_SWEEP_RANGE = 160;

/** §14-2②: 薙ぎ払い発動条件(距離のみ。CD満了は呼び出し側=aiReadyAtで見る)。 */
export const loggerCanSweep = (distance: number): boolean => distance <= LOGGER_SWEEP_RANGE;

// §14-2②: 薙ぎ払いの帯を体の前方どれだけ離れた位置に置くか(px)。好み間合い(110〜150)の中央=
// 発動しうる距離帯のおおよそ中心に帯を置く(叩き台。実機で社長が調整する前提)。
export const LOGGER_SWEEP_FORWARD_OFFSET = (LOGGER_APPROACH_DIST + LOGGER_BACKOFF_DIST) / 2;

/** §14-2②: 薙ぎ払いの帯(横長のカプセル)の両端を求める純関数。
 * 「自分の前方をプレイヤー方向へ向けた横長帯」=帯の中心はプレイヤー方向へ forwardOffset だけ
 * 進んだ点、帯の長軸(halfLength分の両端)はプレイヤー方向と直交する(ミゲル/ウリの払いの雑魚版=
 * 突き(driller-thrust。長軸がプレイヤー方向と同じ)とはここが違う)。
 * pux/puy はプレイヤー方向の単位ベクトル(呼び出し側でロック済みの値を渡す)。
 */
export const loggerSweepBand = (
  ecx: number, ecy: number,
  pux: number, puy: number,
  forwardOffset: number = LOGGER_SWEEP_FORWARD_OFFSET,
  halfLength: number = 110, // §14-2②「長さ220」の半分
): { fx: number; fy: number; tx: number; ty: number } => {
  const centerX = ecx + pux * forwardOffset;
  const centerY = ecy + puy * forwardOffset;
  // プレイヤー方向(pux,puy)と直交する単位ベクトル。
  const perpX = -puy, perpY = pux;
  return {
    fx: centerX - perpX * halfLength, fy: centerY - perpY * halfLength,
    tx: centerX + perpX * halfLength, ty: centerY + perpY * halfLength,
  };
};

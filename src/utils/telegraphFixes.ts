// research/TELEGRAPH_FIXES.md(予告の直し)で描画側が使う位相の純関数。描画(pixiScene)は読むだけ。
// 掟(CLAUDE.md ★★赤い予告の4つの掟): ②出る時刻=溜め開始(prog=0) ③消え切る時刻=当たる時刻(prog=1)。
// 位相そのもの(描き/消し)は telegraphStyle.meteorPhase / bandSweep が持つ。ここは「進行 prog を
// どの時刻から引くか」だけを判定側と同じ定数・同じ時計で決める。

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/** 残り時間から引く溜めの進行(E21 凝視の射線など): 溜め開始で0、溜めの満了(=撃つ瞬間)で1。 */
export const windupProgFromRemain = (remainMs: number, windupMs: number): number =>
  clamp01(1 - remainMs / Math.max(1, windupMs));

/** 経過時間から引く溜めの進行(C04 ミーミルの車輪 tW/windupMs など)。 */
export const windupProgFromElapsed = (elapsedMs: number, windupMs: number): number =>
  clamp01(elapsedMs / Math.max(1, windupMs));

/** N06 緑卵のアームの瞬間の「ピピッ」: 1回の点灯の長さ(ms・叩き台)。 */
export const EGG_ARM_BLINK_ON_MS = 90;
/** N06 1回目と2回目の点灯の間(ms・叩き台)。 */
export const EGG_ARM_BLINK_GAP_MS = 70;
/** N06 点滅の回数。 */
export const EGG_ARM_BLINK_COUNT = 2;
/** N06 点滅の全体の尺(=2回の点灯+間1つ)。 */
export const EGG_ARM_BLINK_TOTAL_MS =
  EGG_ARM_BLINK_ON_MS * EGG_ARM_BLINK_COUNT + EGG_ARM_BLINK_GAP_MS * (EGG_ARM_BLINK_COUNT - 1);
/** N06 1回の点灯のうち、立ち上がりに使う割合(残りが消え際)。 */
const EGG_ARM_BLINK_RISE_FRAC = 0.3;

/**
 * N06 緑卵のアームの瞬間に、爆発の範囲を円の線だけで2回「ピピッ」と点す濃さ(0..1)。
 * アーム(armedAt)からの経過 ms を渡す。アーム前(負)・点滅の後は 0。
 * 1回の点灯は「短い立ち上がり(easeOut)→消え際(easeIn で減速しながら0へ)」=パッと点いてパッと消えない(慣性)。
 */
export const eggArmBlinkAlpha = (elapsedMs: number): number => {
  if (!(elapsedMs >= 0) || elapsedMs >= EGG_ARM_BLINK_TOTAL_MS) return 0;
  const period = EGG_ARM_BLINK_ON_MS + EGG_ARM_BLINK_GAP_MS;
  const t = elapsedMs % period;
  if (t >= EGG_ARM_BLINK_ON_MS) return 0;
  const u = t / EGG_ARM_BLINK_ON_MS;
  if (u < EGG_ARM_BLINK_RISE_FRAC) {
    const r = u / EGG_ARM_BLINK_RISE_FRAC;
    return 1 - (1 - r) * (1 - r);
  }
  const f = 1 - (u - EGG_ARM_BLINK_RISE_FRAC) / (1 - EGG_ARM_BLINK_RISE_FRAC); // 1→0
  return f * f;
};

/**
 * N12 幻影のタレットの爆発の円の進行。sim は `nowMs − createdAt >= duration` で爆ぜる(Date.now の時計)ので
 * 同じ時計の `nowMs` を渡す。寿命の最後の `telegraphMs` の間だけ 0→1、それより前は null(描かない)。
 */
export const phantomTurretBlastProg = (
  createdAt: number, duration: number, nowMs: number, telegraphMs: number,
): number | null => {
  const endAt = createdAt + duration;
  const startAt = endAt - telegraphMs;
  if (nowMs < startAt) return null;
  return clamp01(1 - (endAt - nowMs) / Math.max(1, telegraphMs));
};

/**
 * E05b ジブリルのランタン火の起動後の紫の縁の濃さ(持続する床=当たり得る間ずっと在る④)。
 * 起動(activateAt)から `expireAt` まで在り、最後の `fadeMs` だけ easeIn で薄めて `expireAt` でちょうど0。
 * 起動前・満了後は 0。
 */
export const bossFireRimAlpha = (
  activateAt: number, expireAt: number, gameTime: number, fadeMs: number,
): number => {
  if (gameTime < activateAt || gameTime >= expireAt) return 0;
  const left = expireAt - gameTime;
  if (left >= fadeMs) return 1;
  const u = clamp01(left / Math.max(1, fadeMs)); // 1→0
  return u * u; // 終わりへ向かって減速して消える(慣性)
};

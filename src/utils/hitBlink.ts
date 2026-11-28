// 社長指示2026-10-16「(ドット絵のエフェクトに点滅を入れると少しリッチになる)ゾンビでやってみて」。
// 「点滅」= 出た瞬間に真っ白へ飛ばし、少し置いてもう一度だけ明るく戻す。絵を足さず tint/alpha だけで作る(負荷0)。
// まずゾンビだけ(試し)。採否は社長が実機で決める。純関数(テスト対象)。

/** 点滅を掛ける敵の型(試しの範囲)。 */
export const HIT_BLINK_TYPES = new Set<string>(['zombie']);

/**
 * 被弾の白フラッシュの強さ(0..1)を「2回点滅」にする。
 *  0〜60ms   : 1.0(全面白)
 *  60〜100ms : 0(素の絵に戻る=暗い1コマ)
 *  100〜150ms: 0.85(もう一度光る)
 *  150〜220ms: 0.85→0 へ減衰
 * 旧(他の型)は 170ms の線形減衰。
 */
export const HIT_BLINK_TOTAL_MS = 220;
export const hitBlinkStrength = (sinceMs: number): number => {
  if (sinceMs < 0) return 0;
  if (sinceMs < 60) return 1;
  if (sinceMs < 100) return 0;
  if (sinceMs < 150) return 0.85;
  if (sinceMs < HIT_BLINK_TOTAL_MS) return 0.85 * (1 - (sinceMs - 150) / (HIT_BLINK_TOTAL_MS - 150));
  return 0;
};

/**
 * 血しぶき(粒)の「白へ飛ぶ」量(0..1)。t=寿命の進み(0..1)、ageMs=経過ms。
 *  出た瞬間 0〜70ms: 1(真っ白)→ 以降は色に戻る
 *  寿命の 42〜50%: もう一度だけ 0.7 で明るく(点滅)
 */
export const bloodFlashStrength = (ageMs: number, t: number): number => {
  if (ageMs < 0) return 0;
  if (ageMs < 70) return 1;
  if (t >= 0.42 && t < 0.5) return 0.7;
  return 0;
};

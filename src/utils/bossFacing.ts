/**
 * ★裏ボスの向き(社長指示2026-09-29「**ボスも全部ミラー**」)。
 * 手で描いたコマ(待機/技のシート)を持つ裏ボスは、**狙う相手の居る側を向く**。
 * - 雑魚(`drawEnemy` の汎用経路)は「進む向き」で決めるが、裏ボスは場の縁を回る(ミゲル)・後退しながら撃つ
 *   (ジブリル)ので、進む向きで決めると**半周ごとに振り向く/背を向けたまま撃つ**。相手の側で決める。
 * - 相手がほぼ真上/真下(横の差が `deadzonePx` 未満)なら**今の向きのまま**(その場でパタパタしない)。
 * 描画だけが読む純関数(判定・技の向き・弾の方向は1つも変えない)。
 */
export const bossFaceWant = (cur: 1 | -1, bossCx: number, targetX: number, deadzonePx = 24): 1 | -1 => {
  const dx = targetX - bossCx;
  if (!Number.isFinite(dx) || Math.abs(dx) < deadzonePx) return cur;
  return dx > 0 ? 1 : -1;
};

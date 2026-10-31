/**
 * ★裏ボスの向き(社長指示2026-09-29「**ボスも全部ミラー**」)。
 * 手で描いたコマ(待機/技のシート)を持つ裏ボスは、**狙う相手の居る側を向く**。
 * - 雑魚(`drawEnemy` の汎用経路)は「進む向き」で決めるが、裏ボスは場の縁を回る(ミゲル)・後退しながら撃つ
 *   (ジブリル)ので、進む向きで決めると**半周ごとに振り向く/背を向けたまま撃つ**。相手の側で決める。
 * - 相手がほぼ真上/真下(横の差が `deadzonePx` 未満)なら**今の向きのまま**(その場でパタパタしない)。
 * 描画だけが読む純関数(判定・技の向き・弾の方向は1つも変えない)。
 */
/**
 * ★振り向かない幅(片側・px)。体の幅に比例させる(社長報告2026-10-06「ボスが範囲に入った時に右向いたり左向いたりを
 * 高速で繰り返す」。確認=ミーミル・英雄)。旧=固定24px(ミーミルの体は約250px)/英雄は8px で、相手が体の真上・真下に
 * 居ると少し動くだけで左右が入れ替わり、そのたびに振り向いていた。体の幅の35%(最低24px)まで相手が回り込んだら振り向く。
 */
export const BOSS_FACE_DEADZONE_FRAC = 0.35;
export const bossFaceDeadzonePx = (bodyWidth: number): number => Math.max(24, bodyWidth * BOSS_FACE_DEADZONE_FRAC);
/** 一度振り向いたら、次に振り向けるまでの最短の間(ms)。境目の上で相手が揺れても連続で裏返らない。 */
export const BOSS_TURN_MIN_MS = 450;

export const bossFaceWant = (cur: 1 | -1, bossCx: number, targetX: number, deadzonePx = 24): 1 | -1 => {
  const dx = targetX - bossCx;
  if (!Number.isFinite(dx) || Math.abs(dx) < deadzonePx) return cur;
  return dx > 0 ? 1 : -1;
};

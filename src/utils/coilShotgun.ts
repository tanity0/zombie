// UNIQUE_WEAPONS.md §16-2(バッチC-2「コイルショットガン」shotgun-t2-coil・2026-09-07 C-2検収A-1で確定)。
// 「散弾が一度外へ広がってから狙点へ再収束する」を、弾1発ごとの**中心線からの横ズレ(px)**として表す
// 純関数。gameStore.ts の弾移動tickが毎フレーム呼ぶ(判定・見た目どちらにも影響する=移動そのもの)。
//
// ★検収A-1の経緯: 旧実装は「角度」を振って420msで元の拡散角へ戻していた。だが角度を戻しても
// 外へ振れていた間の**横ズレが位置に積み上がる**ため、最終軌道は既定と平行に外へずれた直線=
// 「常に広いだけのSG」になってしまった(狭角SGとの違いが消える)。
// ⇒ 角度ではなく「中心線からの横ズレ」を直接与える。lateral(t) は t=0 と t=T で必ず0になる
// (=元の直進位置へ戻る)ので、位置の積み上がりが起きない。
//
// 慣性(CLAUDE.md「動きの絶対ルール」)は sin カーブそのものが担う: t=0で速度0→中央で最大→Tで
// 速度0。等速で折れ曲がる動きにはならない。
export const COIL_CONVERGE_PX = 140; // ショットガンの射程=「当たる距離で収束が完了する」
export const COIL_AMPLITUDE_PX = 44; // 最外側ペレットの横ズレ最大値(±px)

/**
 * 収束時間T(ms)。弾速(px/s)から導く(弾速を変えても収束"点"=COIL_CONVERGE_PXが動かない)。
 * 弾速が0以下なら収束しようがない(0を返す=常に横ズレ0=直進)。
 */
export const coilConvergeMs = (speedPxPerSec: number): number =>
  speedPxPerSec > 0 ? (COIL_CONVERGE_PX / speedPxPerSec) * 1000 : 0;

/**
 * ペレットiごとの振幅(px)。count発を ±COIL_AMPLITUDE_PX の範囲へ等間隔に割り振る
 * (9発なら -44,-33,-22,-11,0,11,22,33,44)。count<=1なら振幅0(広がりようがない)。
 */
export const coilPelletAmplitudePx = (index: number, count: number): number => {
  if (count <= 1) return 0;
  return -COIL_AMPLITUDE_PX + (2 * COIL_AMPLITUDE_PX * index) / (count - 1);
};

/**
 * 経過時間(elapsedMs)ぶんの中心線からの横ズレ(px)。
 * lateral(t) = amplitudePx × sin(π × min(t/convergeMs, 1))
 * t=0 と t=convergeMs(=T)で必ず0(要件)。convergeMs<=0なら常に0(収束時間が求まらない=直進)。
 */
export const coilLateralOffsetPx = (
  amplitudePx: number,
  elapsedMs: number,
  convergeMs: number,
): number => {
  if (convergeMs <= 0 || elapsedMs <= 0) return 0;
  const t = Math.min(elapsedMs / convergeMs, 1);
  return amplitudePx * Math.sin(Math.PI * t);
};

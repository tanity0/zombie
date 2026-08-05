/** 敵の剣スプライトだけに使う、判定非依存の大振りモーション。 */
export type SwordSwingStyle = 'wide' | 'overhead' | 'draw' | 'thrust';

export interface SwordSwingPose {
  /** 攻撃方向へ足す剣角度(rad)。 */
  angleOffset: number;
  /** 柄を攻撃方向へ動かす距離(px)。 */
  pushPx: number;
  /** 振りの中腹だけ少し大きく見せる倍率。 */
  scaleMult: number;
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const smooth = (v: number): number => {
  const t = clamp01(v);
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * wideは200度、overheadは160度、居合は190度を明確に振り切る。
 * thrustだけは角度を固定し、引いた柄を50px押し出す。
 */
export const swordSwingPose = (style: SwordSwingStyle, progress: number): SwordSwingPose => {
  const t = smooth(progress);
  if (style === 'thrust') {
    return { angleOffset: 0, pushPx: lerp(-14, 36, t), scaleMult: 1 };
  }
  const [start, end] = style === 'wide'
    ? [-140 * Math.PI / 180, 60 * Math.PI / 180]
    : style === 'overhead'
      ? [-110 * Math.PI / 180, 50 * Math.PI / 180]
      : [160 * Math.PI / 180, -30 * Math.PI / 180];
  return {
    angleOffset: lerp(start, end, t),
    pushPx: Math.sin(Math.PI * t) * 10,
    scaleMult: 1 + Math.sin(Math.PI * t) * 0.08,
  };
};


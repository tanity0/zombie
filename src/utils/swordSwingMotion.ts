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

/** 剣の出現・退場だけを馴染ませる短い時間。攻撃モーションの尺には影響しない。 */
export const SWORD_VISIBILITY_FADE_MS = 90;

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const smooth = (v: number): number => {
  const t = clamp01(v);
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const swordFadeInAlpha = (elapsedMs: number): number => smooth(elapsedMs / SWORD_VISIBILITY_FADE_MS);
export const swordFadeOutAlpha = (remainingMs: number): number => smooth(remainingMs / SWORD_VISIBILITY_FADE_MS);

/**
 * 攻撃判定として固定された始点→終点から、剣の基準角を決める。
 * 手元や現在の標的位置を混ぜないことで、構え・実行・残心を同じ向きへ揃える。
 */
export const swordAttackAngle = (
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  fallbackAngle = 0,
): number => {
  const dx = toX - fromX;
  const dy = toY - fromY;
  return Math.hypot(dx, dy) > 0.001 ? Math.atan2(dy, dx) : fallbackAngle;
};

export type SwordCompletionPhase = 'ready' | 'swing' | 'fade' | 'done';

/** カウンターでAI州が消えても、焼き付けた剣アニメだけを最後まで進めるための純粋な時計。 */
export const swordCompletionFrame = (
  elapsedMs: number,
  toImpactMs: number,
  swingMs: number,
): { phase: SwordCompletionPhase; progress: number; alpha: number } => {
  const elapsed = Math.max(0, elapsedMs);
  const ready = Math.max(0, toImpactMs);
  const swing = Math.max(1, swingMs);
  if (elapsed < ready) {
    return { phase: 'ready', progress: ready > 0 ? clamp01(elapsed / ready) : 1, alpha: swordFadeInAlpha(elapsed) };
  }
  if (elapsed < ready + swing) {
    return { phase: 'swing', progress: clamp01((elapsed - ready) / swing), alpha: 1 };
  }
  const fadeElapsed = elapsed - ready - swing;
  if (fadeElapsed < SWORD_VISIBILITY_FADE_MS) {
    return {
      phase: 'fade',
      progress: 1,
      alpha: swordFadeOutAlpha(SWORD_VISIBILITY_FADE_MS - fadeElapsed),
    };
  }
  return { phase: 'done', progress: 1, alpha: 0 };
};

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
    // ★柄の押し出し(社長指示v0.25.3524「本体と剣**も**踏み込みたい」): 10→34px。
    // 本体の踏み込み(swordLunge.ts)と対で「剣も前へ出る」ぶん。sin山なので**振りの頭で0・
    // 中腹で最大・振り切りで0**=加減速が入っている(慣性の掟)。判定には一切影響しない絵だけの値。
    // 小さいと動きが読めない(CLAUDE.md「動きは大きく」)ので、まず大きめに置いて実機で絞る。
    pushPx: Math.sin(Math.PI * t) * 34,
    scaleMult: 1 + Math.sin(Math.PI * t) * 0.08,
  };
};

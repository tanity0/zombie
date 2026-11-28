// ボスの顔(頭だけ丸く切り抜いた小さな絵)の共通部品。作戦室の地図(DsStoryMap)と一時停止の地図(PauseMap)が同じ文法で描く
// (research/SORTIE_MAP_BOSS_ICONS.md §5)。頭の中心・半径は data/bossHeadCrops.ts、絵は sprites/ の1枚(spritePath)。
// 描くだけ(SVG の部品)。並べ方・何を出すかは呼び出し側が決める。
import React from 'react';
import { spritePath } from '../utils/spriteLoader';
import type { BossHeadCrop } from '../data/bossHeadCrops';

/** 縁の外の弧と刻みの色: ステージ固定のボス=冷たい灰 / 徘徊の枠=暗い血の赤。 */
export const BOSS_FACE_RIM = '#b9c2cc', BOSS_FACE_RIM_PATROL = '#a3262b';

/** 外の弧: 右下を約70°欠く(角度は SVG の向き=右が0°・下回り)。 */
export const bossFaceRimArc = (x: number, y: number, rimR: number): string => {
  const a0 = (100 * Math.PI) / 180, a1 = (390 * Math.PI) / 180;
  return `M${x + rimR * Math.cos(a0)},${y + rimR * Math.sin(a0)} A${rimR},${rimR} 0 1 1 ${x + rimR * Math.cos(a1)},${y + rimR * Math.sin(a1)}`;
};

/**
 * 顔に使う defs(明るさの持ち上げ `${idBase}-lift`・縁の内側の光 `${idBase}-glow`)。
 * children は2つの間に入る(作戦室の地図の札のにじみ等、同じ defs に置きたい物)。
 */
export const BossFaceDefs: React.FC<{ idBase: string; children?: React.ReactNode }> = ({ idBase, children }) => (
  <defs>
    <filter id={`${idBase}-lift`} colorInterpolationFilters="sRGB">
      <feComponentTransfer>
        <feFuncR type="gamma" amplitude={1} exponent={0.8} offset={0} />
        <feFuncG type="gamma" amplitude={1} exponent={0.8} offset={0} />
        <feFuncB type="gamma" amplitude={1} exponent={0.8} offset={0} />
      </feComponentTransfer>
      <feComponentTransfer>
        <feFuncR type="linear" slope={1.14} intercept={-0.04} />
        <feFuncG type="linear" slope={1.14} intercept={-0.04} />
        <feFuncB type="linear" slope={1.14} intercept={-0.04} />
      </feComponentTransfer>
    </filter>
    {children}
    <radialGradient id={`${idBase}-glow`}>
      <stop offset="0.68" stopColor="#ffecd2" stopOpacity={0} />
      <stop offset="1" stopColor="#ffecd2" stopOpacity={0.26} />
    </radialGradient>
  </defs>
);

/**
 * 顔そのもの: 地の丸 → 頭を丸で切った絵(明るさを持ち上げる) → 縁の内側の光 → 細い暗い縁。
 * 外の弧と刻みは呼び出し側(色・太さ・明滅が地図ごとに違う)。
 */
export const BossHeadFace: React.FC<{ idBase: string; clipId: string; x: number; y: number; r: number; sprite: string; crop: BossHeadCrop }> = ({ idBase, clipId, x, y, r, sprite, crop }) => {
  const k = r / (crop.r * crop.h);
  return (
    <>
      <clipPath id={clipId}><circle cx={x} cy={y} r={r} /></clipPath>
      <circle cx={x} cy={y} r={r} fill="#14131a" />
      <image href={spritePath(sprite)} x={x - crop.u * crop.w * k} y={y - crop.v * crop.h * k}
        width={crop.w * k} height={crop.h * k} clipPath={`url(#${clipId})`} preserveAspectRatio="none" filter={`url(#${idBase}-lift)`} />
      <circle cx={x} cy={y} r={r} fill={`url(#${idBase}-glow)`} />
      <circle cx={x} cy={y} r={r} fill="none" stroke="rgba(7,6,13,0.9)" strokeWidth={2.2} vectorEffect="non-scaling-stroke" />
    </>
  );
};

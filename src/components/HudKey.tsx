// ゲーム中のボタン札(research/PC_SUPPORT.md §14)。字(またはマウス・三本線の絵)を1つ描くだけ。置き場所は呼ぶ側が style で決める。
// act=その札の操作。押している間(html.hk-<act>)だけ札が沈む(hudKey.css)。
import React from 'react';
import './hudKey.css';
import type { HudHintStyle, HudGlyph, HudPressName } from '../utils/hudHints';

// マウスの絵(8×11・線1px): 外形+押すボタンの側を上半分まるごと塗る(左右の差が1x でも読めるように・検収監査)。
const Mouse = ({ side }: { side: 'l' | 'r' }) => (
  <svg width="8" height="11" viewBox="0 0 8 11" aria-hidden="true" shapeRendering="crispEdges">
    <rect x="0.5" y="0.5" width="7" height="10" rx="3" fill="none" stroke="currentColor" strokeWidth="1" />
    <rect x={side === 'r' ? 4 : 1} y="1" width="3" height="4" fill="currentColor" />
    <line x1="4" y1="0.5" x2="4" y2="5" stroke="currentColor" strokeWidth="1" />
    <line x1="0.5" y1="5.5" x2="7.5" y2="5.5" stroke="currentColor" strokeWidth="1" />
  </svg>
);
// 三本線(パッドの一時停止。Xbox の Menu も PS の Options も実物は三本線)。
const Menu = () => (
  <svg width="7" height="6" viewBox="0 0 7 6" aria-hidden="true">
    <path d="M0 0.5H7M0 3H7M0 5.5H7" stroke="currentColor" strokeWidth="1" />
  </svg>
);

export const HudKey: React.FC<{ glyph: HudGlyph; hint: HudHintStyle; act?: HudPressName; style?: React.CSSProperties; className?: string; children?: React.ReactNode }> = ({ glyph, hint, act, style, className, children }) => {
  if (glyph === null) return null;
  return (
    <span className={`hud-key${className ? ` ${className}` : ''}`} data-style={hint} data-act={act} style={style} aria-hidden="true">
      {children}
      {glyph === 'rmb' ? <Mouse side="r" /> : glyph === 'lmb' ? <Mouse side="l" /> : glyph === 'menu' ? <Menu /> : glyph}
    </span>
  );
};

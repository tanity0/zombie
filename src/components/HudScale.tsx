import React, { createContext, useContext } from 'react';

// ★PC版の HUD・ゲーム中のメニューの大きさ(research/PC_SUPPORT.md 段3)。
// PC の横長ではゲーム画面が「枠の高さ/720」倍に拡大されるのに、DOM の HUD は端末pxのまま=相対的に小さく四隅に散っていた。
// 枠の高さに合わせて HUD をまとめて拡大する(スマホは倍率1=この包みを作らない=DOM も見え方も従来どおり)。
// 包みは transform を持つので、中の `fixed` はこの包み(=ゲームの枠)基準になる=横長の帯の上まで広がらない。
// ★規約: **包みの中で vw/vh/dvh/svh(窓の単位)を素で使わない**。窓の単位は包みの拡大と二重に効き、上限が枠より大きくなって
//   メニューが切れる/ボタンが押せない(品質監査 A-1〜A-5)。使う時は calc(○vw / var(--hud-s, 1)) と倍率で割る(スマホは --hud-s 未定義=1)。

const HudScaleContext = createContext(1);
export const HudScaleProvider = HudScaleContext.Provider;
/** 横長(PC)の並べ方か。HUD の置き直し(武器の列を右下へ・会話を下へ 等)に使う。 */
const HudLandscapeContext = createContext(false);
export const HudLandscapeProvider = HudLandscapeContext.Provider;
// eslint-disable-next-line react-refresh/only-export-components
export const useHudLandscape = (): boolean => useContext(HudLandscapeContext);

/**
 * 子を HUD の倍率で拡大して、ゲームの枠いっぱいに置く。倍率1なら何も包まない。z=元の重なり順。
 * interactive=画面全体を覆うメニュー(一時停止等): 包みが押下を受ける(pointer-events は子へ継がれるため、
 * HUD のように「下のマウス操作へ素通しする」包みにすると、メニューのボタンが押せなくなる)。
 */
export const HudScale: React.FC<{ z: number; interactive?: boolean; children: React.ReactNode }> = ({ z, interactive, children }) => {
  const s = useContext(HudScaleContext);
  if (s === 1) return <>{children}</>;
  return (
    <div
      className={`absolute ${interactive ? 'pointer-events-auto' : 'pointer-events-none'}`}
      // --hud-s: 包みの中で vw/vh を使う所は calc(○vw / var(--hud-s, 1)) と書く(拡大で二重に効かないように=クリエイティブ監査 #7)。
      style={{ left: 0, top: 0, width: `${100 / s}%`, height: `${100 / s}%`, transform: `scale(${s})`, transformOrigin: '0 0', zIndex: z, ['--hud-s' as string]: s } as React.CSSProperties}
    >
      {children}
    </div>
  );
};

import React, { createContext, useContext, useState } from 'react';

// ★PC版の HUD・ゲーム中のメニューの大きさ(research/PC_SUPPORT.md 段3)。
// PC の横長ではゲーム画面が「枠の高さ/720」倍に拡大されるのに、DOM の HUD は端末pxのまま=相対的に小さく四隅に散っていた。
// 枠の高さに合わせて HUD をまとめて拡大する(スマホは倍率1=この包みを作らない=DOM も見え方も従来どおり)。
// 包みは transform を持つので、中の `fixed` はこの包み(=ゲームの枠)基準になる=横長の帯の上まで広がらない。
// ★規約: **包みの中で vw/vh/dvh/svh(窓の単位)を素で使わない**。窓の単位は包みの拡大と二重に効き、上限が枠より大きくなって
//   メニューが切れる/ボタンが押せない(品質監査 A-1〜A-5)。使う時は calc(○vw / var(--hud-s, 1)) と倍率で割る(スマホは --hud-s 未定義=1)。

const HudScaleContext = createContext(1);
export const HudScaleProvider = HudScaleContext.Provider;
/** いまの HUD の倍率(包みの外=1)。canvas の解像度を倍率に合わせる所が使う。 */
// eslint-disable-next-line react-refresh/only-export-components
export const useHudScale = (): number => useContext(HudScaleContext);
/** 横長(PC)の並べ方か。HUD の置き直し(武器の列を右下へ・会話を下へ 等)に使う。 */
const HudLandscapeContext = createContext(false);
export const HudLandscapeProvider = HudLandscapeContext.Provider;
// eslint-disable-next-line react-refresh/only-export-components
export const useHudLandscape = (): boolean => useContext(HudLandscapeContext);

/** 包みの中へ出すポータルの置き場(包みの外=document.body)。body へ出すと拡大の外に出て PC でスマホ寸法のまま(段3-2 品質監査 A-2)。 */
const HudPortalContext = createContext<HTMLElement | null>(null);
// eslint-disable-next-line react-refresh/only-export-components
export const useHudPortalRoot = (): HTMLElement => useContext(HudPortalContext) ?? document.body;

/**
 * 子を HUD の倍率で拡大して、ゲームの枠いっぱいに置く。倍率1なら箱を作らない(display:contents=スマホの並びは従来どおり)。z=元の重なり順。
 * ★要素の型は倍率に依らず常に同じ div(段3-2 品質監査 A-1): 倍率1↔1.25 を跨ぐ窓のリサイズで Fragment↔div を入れ替えると、
 *   子が丸ごと作り直され、結果画面のゴールドが二重に入る/メニューがホームへ戻る。
 * interactive=画面全体を覆うメニュー(一時停止等): 包みが押下を受ける(pointer-events は子へ継がれるため、
 * HUD のように「下のマウス操作へ素通しする」包みにすると、メニューのボタンが押せなくなる)。
 */
export const HudScale: React.FC<{ z: number; interactive?: boolean; children: React.ReactNode }> = ({ z, interactive, children }) => {
  const s = useContext(HudScaleContext);
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const scaled = s !== 1;
  return (
    <div
      ref={setEl}
      className={scaled ? `absolute ${interactive ? 'pointer-events-auto' : 'pointer-events-none'}` : undefined}
      // --hud-s: 包みの中で vw/vh を使う所は calc(○vw / var(--hud-s, 1)) と書く(拡大で二重に効かないように=クリエイティブ監査 #7)。
      style={scaled
        ? { left: 0, top: 0, width: `${100 / s}%`, height: `${100 / s}%`, transform: `scale(${s})`, transformOrigin: '0 0', zIndex: z, ['--hud-s' as string]: s } as React.CSSProperties
        : { display: 'contents' }}
    >
      <HudPortalContext.Provider value={scaled ? el : null}>{children}</HudPortalContext.Provider>
    </div>
  );
};

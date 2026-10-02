import React, { createContext, useContext } from 'react';

// ★PC版の HUD・ゲーム中のメニューの大きさ(research/PC_SUPPORT.md 段3)。
// PC の横長ではゲーム画面が「枠の高さ/720」倍に拡大されるのに、DOM の HUD は端末pxのまま=相対的に小さく四隅に散っていた。
// 枠の高さに合わせて HUD をまとめて拡大する(スマホは倍率1=この包みを作らない=DOM も見え方も従来どおり)。
// 包みは transform を持つので、中の `fixed` はこの包み(=ゲームの枠)基準になる=横長の帯の上まで広がらない。

const HudScaleContext = createContext(1);
export const HudScaleProvider = HudScaleContext.Provider;

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
      style={{ left: 0, top: 0, width: `${100 / s}%`, height: `${100 / s}%`, transform: `scale(${s})`, transformOrigin: '0 0', zIndex: z }}
    >
      {children}
    </div>
  );
};

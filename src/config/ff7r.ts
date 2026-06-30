import type { CSSProperties } from 'react';

// FF7リメイク風UIの共通スタイル定数(社長指示・カラーは紫)。
// 肝: パネルは片側 or 両サイドへフェードして半透明 / 線は極細(1px)紫。
// アクセント紫 = violet ~ rgba(168,85,247)。

export const FF7R_ACCENT = 'rgba(168,85,247,'; // 末尾にalphaを付けて使う

// パネル背景(右へフェード)。シンプルに、左端の細い紫ライン1本だけ(上下枠は足さない)。
export const ff7rPanelRight: CSSProperties = {
  background: 'linear-gradient(95deg, rgba(9,8,14,0.95) 0%, rgba(9,8,14,0.86) 50%, rgba(9,8,14,0.42) 100%)',
  borderLeft: '1px solid rgba(168,85,247,0.75)',
};

// パネル背景(両サイドへフェード=中央が一番濃い)。枠線は足さない。
export const ff7rPanelBoth: CSSProperties = {
  background: 'linear-gradient(90deg, rgba(9,8,14,0.20) 0%, rgba(9,8,14,0.92) 35%, rgba(9,8,14,0.92) 65%, rgba(9,8,14,0.20) 100%)',
};

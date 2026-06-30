import type { CSSProperties } from 'react';

// FF7リメイク風UIの共通スタイル定数(社長指示・カラーは紫)。
// 肝: パネルは片側 or 両サイドへフェードして半透明 / 線は極細(1px)紫。
// アクセント紫 = violet ~ rgba(168,85,247)。

export const FF7R_ACCENT = 'rgba(168,85,247,'; // 末尾にalphaを付けて使う

// パネル背景(右へフェード)。左に紫アクセントバー＋上下の極細ヘアライン。
export const ff7rPanelRight: CSSProperties = {
  background: 'linear-gradient(95deg, rgba(9,8,14,0.95) 0%, rgba(9,8,14,0.86) 50%, rgba(9,8,14,0.42) 100%)',
  borderLeft: '2px solid rgba(168,85,247,0.85)',
  borderTop: '1px solid rgba(168,85,247,0.16)',
  borderBottom: '1px solid rgba(168,85,247,0.16)',
};

// パネル背景(両サイドへフェード=中央が一番濃い)。中央上下に細い紫ライン。
export const ff7rPanelBoth: CSSProperties = {
  background: 'linear-gradient(90deg, rgba(9,8,14,0.30) 0%, rgba(9,8,14,0.92) 35%, rgba(9,8,14,0.92) 65%, rgba(9,8,14,0.30) 100%)',
  borderTop: '1px solid rgba(168,85,247,0.22)',
  borderBottom: '1px solid rgba(168,85,247,0.22)',
};

// 見出し用: 小さめ＋細い紫下線。
export const ff7rHeading: CSSProperties = { borderBottom: '1px solid rgba(168,85,247,0.6)' };

import React from 'react';

// FF7リメイク風UIの共通ボタン(社長指示・カラーは紫)。斜め(skew)は使わず、四角いまま
// 「両サイドへフェード」or「右だけフェード」する半透明＋紫の細線。選択/ホバーで紫が少し強まる。

interface Ff7rButtonProps {
  children: React.ReactNode;
  onClick?: (e: React.MouseEvent) => void;
  className?: string;            // 外側の幅/余白など
  paddingY?: string;             // 既定 0.7rem
  active?: boolean;              // 選択中(ハイライト常時)
  ariaLabel?: string;
  emphasis?: boolean;            // 主要アクション=紫を少し濃く
  fade?: 'both' | 'right';       // フェード方向(既定 right)
}

export const Ff7rButton: React.FC<Ff7rButtonProps> = ({
  children, onClick, className = '', paddingY = '0.7rem', active = false, ariaLabel, emphasis = false, fade = 'right',
}) => {
  const edge = emphasis ? 0.9 : 0.6;
  const base = fade === 'both'
    ? 'linear-gradient(90deg, rgba(22,13,36,0.10) 0%, rgba(22,13,36,0.82) 32%, rgba(22,13,36,0.82) 68%, rgba(22,13,36,0.10) 100%)'
    : 'linear-gradient(95deg, rgba(22,13,36,0.85) 0%, rgba(22,13,36,0.5) 60%, rgba(22,13,36,0.10) 100%)';
  const borders: React.CSSProperties = fade === 'both'
    ? { borderTop: `1px solid rgba(168,85,247,${edge})`, borderBottom: `1px solid rgba(168,85,247,${edge})` }
    : { borderLeft: `2px solid rgba(168,85,247,${edge})`, borderTop: '1px solid rgba(168,85,247,0.18)', borderBottom: '1px solid rgba(168,85,247,0.18)' };
  const hi = fade === 'both'
    ? 'linear-gradient(90deg, transparent 0%, rgba(168,85,247,0.22) 35%, rgba(168,85,247,0.22) 65%, transparent 100%)'
    : 'linear-gradient(95deg, rgba(168,85,247,0.28) 0%, transparent 70%)';
  return (
    <button onClick={onClick} aria-label={ariaLabel} className={`group relative block overflow-hidden ${className}`}>
      <span className="relative block" style={{ paddingTop: paddingY, paddingBottom: paddingY, background: base, ...borders }}>
        {/* ホバー/選択で紫が少し強まる(フェード方向に沿った発色)。斜めは使わない。 */}
        <span
          className={`absolute inset-0 transition-opacity duration-150 group-hover:opacity-100 group-active:opacity-100 ${active ? 'opacity-100' : 'opacity-0'}`}
          style={{ background: hi }}
        />
        <span className="relative z-10 block px-4 text-center text-[14px] font-bold tracking-[0.22em] text-white">
          {children}
        </span>
      </span>
    </button>
  );
};

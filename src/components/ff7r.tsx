import React from 'react';

// FF7リメイク風UIの共通ボタン(社長指示・カラーは紫)。スタイル定数は config/ff7r.ts。
// ボタンは片側ナナメ(skew)＋hover/active/選択で紫の帯が左から差し込む。文字は白、枠は紫。

interface Ff7rButtonProps {
  children: React.ReactNode;
  onClick?: (e: React.MouseEvent) => void;
  className?: string;      // 外側の幅/余白など
  paddingY?: string;       // 既定 0.7rem
  active?: boolean;        // 選択中(帯を常時表示)
  ariaLabel?: string;
  emphasis?: boolean;      // 主要アクション=ベース塗りを少し濃く
}

export const Ff7rButton: React.FC<Ff7rButtonProps> = ({ children, onClick, className = '', paddingY = '0.7rem', active = false, ariaLabel, emphasis = false }) => (
  <button onClick={onClick} className={`group relative block overflow-hidden ${className}`} aria-label={ariaLabel}>
    <span
      className="relative block"
      style={{
        paddingTop: paddingY,
        paddingBottom: paddingY,
        transform: 'skewX(-12deg)',
        background: emphasis
          ? 'linear-gradient(95deg, rgba(168,85,247,0.22), rgba(168,85,247,0.04))'
          : 'linear-gradient(95deg, rgba(168,85,247,0.12), rgba(168,85,247,0.01))',
        border: '1px solid rgba(168,85,247,0.55)',
      }}
    >
      {/* 左から差し込む紫の選択帯 */}
      <span
        className={`absolute inset-0 transition-transform duration-200 ease-out group-hover:translate-x-0 group-active:translate-x-0 ${active ? 'translate-x-0' : '-translate-x-full'}`}
        style={{ background: 'linear-gradient(95deg, rgba(168,85,247,0.55), rgba(168,85,247,0.12))' }}
      />
      <span className="relative z-10 block px-4 text-center text-[14px] font-bold tracking-[0.22em] text-white" style={{ transform: 'skewX(12deg)' }}>
        {children}
      </span>
    </span>
  </button>
);

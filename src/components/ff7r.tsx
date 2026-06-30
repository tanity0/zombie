import React from 'react';

// FF7リメイク風UIの共通ボタン(社長指示・カラーは紫)。斜め(skew)は使わない。
// 背景だけでなく「枠線(上下のライン)もフェードする」よう、border ではなくグラデーションの細線を重ねる。
//  - fade='both': 上下ラインは両端→透明、左右の縦枠は無し(中央が濃い)
//  - fade='right': 上下ラインは右へ→透明、左端に紫アクセントバー(縦)

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
  const line = `rgba(168,85,247,${edge})`;
  const base = fade === 'both'
    ? 'linear-gradient(90deg, rgba(22,13,36,0.10) 0%, rgba(22,13,36,0.82) 32%, rgba(22,13,36,0.82) 68%, rgba(22,13,36,0.10) 100%)'
    : 'linear-gradient(95deg, rgba(22,13,36,0.85) 0%, rgba(22,13,36,0.5) 60%, rgba(22,13,36,0.10) 100%)';
  // 上下ラインのグラデ(=枠線もフェード)。
  const lineGrad = fade === 'both'
    ? `linear-gradient(90deg, transparent 0%, ${line} 28%, ${line} 72%, transparent 100%)`
    : `linear-gradient(90deg, ${line} 0%, ${line} 45%, transparent 100%)`;
  const hi = fade === 'both'
    ? 'linear-gradient(90deg, transparent 0%, rgba(168,85,247,0.22) 35%, rgba(168,85,247,0.22) 65%, transparent 100%)'
    : 'linear-gradient(95deg, rgba(168,85,247,0.28) 0%, transparent 70%)';
  return (
    <button onClick={onClick} aria-label={ariaLabel} className={`group relative block overflow-hidden ${className}`}>
      <span className="relative block" style={{ paddingTop: paddingY, paddingBottom: paddingY, background: base }}>
        {/* ホバー/選択でフェード方向に沿って紫が少し発色 */}
        <span
          className={`absolute inset-0 transition-opacity duration-150 group-hover:opacity-100 group-active:opacity-100 ${active ? 'opacity-100' : 'opacity-0'}`}
          style={{ background: hi }}
        />
        {/* 上下の枠線(フェードする細線) */}
        <span className="absolute left-0 right-0 top-0 h-px" style={{ background: lineGrad }} />
        <span className="absolute left-0 right-0 bottom-0 h-px" style={{ background: lineGrad }} />
        {/* 右フェードのときだけ左端に紫の縦アクセントバー */}
        {fade === 'right' && <span className="absolute left-0 top-0 bottom-0 w-[2px]" style={{ background: line }} />}
        <span className="relative z-10 block px-4 text-center text-[14px] font-bold tracking-[0.22em] text-white">
          {children}
        </span>
      </span>
    </button>
  );
};

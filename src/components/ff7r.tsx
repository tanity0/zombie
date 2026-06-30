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
  // シンプルに: フェードした面＋(右のみ)左端1pxの細い紫ライン1本だけ。枠線は足さない。
  // 端は透明(フェードアウト)・中央は軽め。紫の発色(=以前は選択時だけだった明るさ)を「常時=ノーマル基準」に
  // ベイクする(社長指示)。押下時はさらにほんの少しだけ明るくする程度。
  const dark = fade === 'both'
    ? 'linear-gradient(90deg, rgba(24,15,38,0.04) 0%, rgba(24,15,38,0.58) 32%, rgba(24,15,38,0.58) 68%, rgba(24,15,38,0.04) 100%)'
    : 'linear-gradient(95deg, rgba(24,15,38,0.58) 0%, rgba(24,15,38,0.34) 60%, rgba(24,15,38,0.04) 100%)';
  const hi = fade === 'both'
    ? 'linear-gradient(90deg, transparent 0%, rgba(168,85,247,0.20) 35%, rgba(168,85,247,0.20) 65%, transparent 100%)'
    : 'linear-gradient(95deg, rgba(168,85,247,0.26) 0%, transparent 70%)';
  const base = `${hi}, ${dark}`; // 紫発色を常時ベイク=ノーマルが既に「選択時の明るさ」
  return (
    <button onClick={onClick} aria-label={ariaLabel} className={`group relative block overflow-hidden ${className}`}>
      <span className="relative block" style={{ paddingTop: paddingY, paddingBottom: paddingY, background: base }}>
        {/* 押下/選択時のごく僅かな明るさ足し(基準はノーマルで既に明るい) */}
        <span
          className={`absolute inset-0 transition-opacity duration-150 group-hover:opacity-100 group-active:opacity-100 ${active ? 'opacity-100' : 'opacity-0'}`}
          style={{ background: 'rgba(255,255,255,0.06)' }}
        />
        {fade === 'right' && <span className="absolute left-0 top-0 bottom-0 w-px" style={{ background: `rgba(168,85,247,${emphasis ? 0.8 : 0.55})` }} />}
        <span className="relative z-10 block px-4 text-center text-[14px] font-bold tracking-[0.22em] text-white">
          {children}
        </span>
      </span>
    </button>
  );
};

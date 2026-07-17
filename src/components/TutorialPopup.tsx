// チュートリアルの操作説明ポップアップ(v0.25.1830・社長「よくあるポップアップでスクショがあって、
// 操作方法を説明してくれるやつ」の試作)。更新情報ダイアログと同じFF7R風パネル+Ff7rButton。
// 挿絵(art)は現状インラインSVG('move'=ドラッグ移動の図解)。実スクショ画像に差し替える場合は
// art部を <img> に置き換えるだけの構造にしてある。表示中はゲーム停止(showTutorialPopupがisPaused=true)。
import React from 'react';
import { useGameStore } from '../store/gameStore';
import { Ff7rButton } from './ff7r';

const PANEL_STYLE: React.CSSProperties = {
  background: 'linear-gradient(95deg, rgba(9,8,14,0.82) 0%, rgba(9,8,14,0.72) 50%, rgba(9,8,14,0.5) 100%)',
  borderLeft: '1px solid rgba(168,85,247,0.75)',
};

// 挿絵: ドラッグ移動の図解(指の軌跡+キャラの移動方向)。素材レス=インラインSVG。
const MoveArt: React.FC = () => (
  <svg viewBox="0 0 320 150" className="h-auto w-full">
    <rect x="0" y="0" width="320" height="150" fill="rgba(88,60,140,0.10)" />
    <rect x="0.5" y="0.5" width="319" height="149" fill="none" stroke="rgba(168,85,247,0.28)" />
    {/* キャラ(簡略) */}
    <circle cx="110" cy="62" r="10" fill="rgba(233,213,255,0.85)" />
    <rect x="102" y="72" width="16" height="22" rx="4" fill="rgba(233,213,255,0.7)" />
    {/* 進行方向の矢印 */}
    <line x1="132" y1="80" x2="196" y2="80" stroke="rgba(74,222,128,0.9)" strokeWidth="4" strokeLinecap="round" />
    <polygon points="212,80 192,70 192,90" fill="rgba(74,222,128,0.9)" />
    {/* 指のドラッグ軌跡(点線)+タッチ円 */}
    <path d="M 228 118 Q 252 108 272 92" fill="none" stroke="rgba(216,180,254,0.75)" strokeWidth="3" strokeDasharray="2 7" strokeLinecap="round" />
    <circle cx="228" cy="118" r="13" fill="none" stroke="rgba(216,180,254,0.9)" strokeWidth="2.5" />
    <circle cx="228" cy="118" r="5" fill="rgba(216,180,254,0.9)" />
  </svg>
);

const TutorialPopup: React.FC = () => {
  const popup = useGameStore(s => s.tutorialPopup); // ポップアップ本体のみ購読(開閉時だけ再描画)
  const close = useGameStore(s => s.closeTutorialPopup);
  if (!popup) return null;
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 px-6 py-8">
      <div className="relative flex w-full max-w-sm flex-col overflow-hidden" style={PANEL_STYLE}>
        <div className="px-5 pt-5 pb-3 text-white/85" style={{ fontFamily: '"Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif' }}>
          <h2 className="pb-1 text-[13px] font-bold tracking-[0.18em] text-white" style={{ borderBottom: '1px solid rgba(168,85,247,0.6)' }}>
            {popup.title}
          </h2>
          {popup.art === 'move' && (
            <div className="mt-4">
              <MoveArt />
            </div>
          )}
          <ul className="mt-4 space-y-2 text-[12.5px] leading-relaxed text-white/80">
            {popup.lines.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </div>
        <div className="px-4 pb-4 pt-2">
          <Ff7rButton onClick={close} className="w-full" ariaLabel="OK" emphasis>
            OK
          </Ff7rButton>
        </div>
      </div>
    </div>
  );
};

export default TutorialPopup;

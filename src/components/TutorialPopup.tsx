// チュートリアルの操作説明ポップアップ(v0.25.1830・社長「よくあるポップアップでスクショがあって、
// 操作方法を説明してくれるやつ」の試作)。更新情報ダイアログと同じFF7R風パネル+Ff7rButton。
// 挿絵(art)は現状インラインSVG('move'=ドラッグ移動の図解)。実スクショ画像に差し替える場合は
// art部を <img> に置き換えるだけの構造にしてある。表示中はゲーム停止(showTutorialPopupがisPaused=true)。
import React from 'react';
import { useGameStore } from '../store/gameStore';
import { ASSET_VERSION } from '../config/assetVersion';
import { isVideoAsset } from '../data/tutorials';
import { Ff7rButton } from './ff7r';

const PANEL_STYLE: React.CSSProperties = {
  background: 'linear-gradient(95deg, rgba(9,8,14,0.82) 0%, rgba(9,8,14,0.72) 50%, rgba(9,8,14,0.5) 100%)',
  borderLeft: '1px solid rgba(168,85,247,0.75)',
};

// 注釈(移動): 進行矢印+指のドラッグ軌跡。実画面スクショの上に重ねる(bg=なし)。
// shotが無い時のフォールバック(単体表示)では薄い下地を敷く。
const MoveArt: React.FC<{ overlay?: boolean }> = ({ overlay }) => (
  <svg viewBox="0 0 320 150" className={overlay ? 'pointer-events-none absolute inset-0 h-full w-full' : 'h-auto w-full'} preserveAspectRatio={overlay ? 'none' : undefined}>
    {!overlay && <rect x="0" y="0" width="320" height="150" fill="rgba(88,60,140,0.10)" />}
    {!overlay && (
      <>
        {/* キャラ(簡略・フォールバック時のみ。スクショ時は実プレイヤーが写っている) */}
        <circle cx="110" cy="62" r="10" fill="rgba(233,213,255,0.85)" />
        <rect x="102" y="72" width="16" height="22" rx="4" fill="rgba(233,213,255,0.7)" />
      </>
    )}
    {/* 進行方向の矢印 */}
    <line x1="132" y1="80" x2="196" y2="80" stroke="rgba(74,222,128,0.95)" strokeWidth="5" strokeLinecap="round" />
    <polygon points="214,80 193,69 193,91" fill="rgba(74,222,128,0.95)" />
    {/* 指のドラッグ軌跡(点線)+タッチ円 */}
    <path d="M 228 118 Q 252 108 272 92" fill="none" stroke="rgba(233,213,255,0.9)" strokeWidth="3.5" strokeDasharray="2 7" strokeLinecap="round" />
    <circle cx="228" cy="118" r="13" fill="none" stroke="rgba(233,213,255,0.95)" strokeWidth="2.5" />
    <circle cx="228" cy="118" r="5" fill="rgba(233,213,255,0.95)" />
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
          {popup.img ? (
            // 事前収録の手本アセット(静止画/GIFアニメ/**動画**・プレイヤー中心に切り出し済み)。
            // 社長決定v0.25.1839「やる前に手本を見せる」=挿絵は収録素材で統一(ライブ撮影は廃止)。
            // v0.25.2262: 長い手本(20秒級)はGIFだと数MBになるため mp4 も置けるようにした。
            // 同じ尺ならGIFの半分以下で、しかも30fpsのまま出せる。拡張子で自動的に切り替わる。
            <div className="relative mt-4 aspect-[16/10] w-full overflow-hidden" style={{ border: '1px solid rgba(168,85,247,0.4)' }}>
              {isVideoAsset(popup.img) ? (
                // iOSで確実にインライン自動再生させるための3点セット: muted / playsInline / autoPlay。
                <video
                  src={`${import.meta.env.BASE_URL}${popup.img}?v=${encodeURIComponent(ASSET_VERSION)}`}
                  className="absolute inset-0 h-full w-full object-cover"
                  autoPlay loop muted playsInline preload="auto"
                />
              ) : (
                <img src={`${import.meta.env.BASE_URL}${popup.img}?v=${encodeURIComponent(ASSET_VERSION)}`} alt="" className="absolute inset-0 h-full w-full object-cover" />
              )}
              {popup.art === 'move' && <MoveArt overlay />}
            </div>
          ) : popup.art === 'move' ? (
            <div className="mt-4">
              <MoveArt />
            </div>
          ) : null}
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

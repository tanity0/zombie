// チュートリアルの操作説明ポップアップ(v0.25.1830・社長「よくあるポップアップでスクショがあって、
// 操作方法を説明してくれるやつ」の試作)。更新情報ダイアログと同じFF7R風パネル+Ff7rButton。
// 挿絵(art)は現状インラインSVG('move'=ドラッグ移動の図解)。実スクショ画像に差し替える場合は
// art部を <img> に置き換えるだけの構造にしてある。表示中はゲーム停止(showTutorialPopupがisPaused=true)。
import React, { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import type { TutorialSlide } from '../data/tutorials';
import TutorialMedia from './TutorialMedia';
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

const SlideMedia: React.FC<{ slide: TutorialSlide }> = ({ slide }) => {
  if (slide.img) {
    return (
      <div className="relative mt-4 aspect-[16/10] w-full overflow-hidden" style={{ border: '1px solid rgba(168,85,247,0.4)' }}>
        <TutorialMedia src={slide.img} className="absolute inset-0 h-full w-full object-cover" />
        {slide.art === 'move' && <MoveArt overlay />}
      </div>
    );
  }
  if (slide.art === 'move') return <div className="mt-4"><MoveArt /></div>;
  if (!slide.mediaPending) return null;
  return (
    <div
      className="relative mt-4 flex aspect-[16/10] w-full items-center justify-center overflow-hidden"
      style={{
        border: '1px solid rgba(168,85,247,0.28)',
        background: 'radial-gradient(circle at 50% 45%, rgba(168,85,247,0.16), rgba(10,8,16,0.78) 65%)',
      }}
    >
      <div className="absolute inset-x-[12%] top-1/2 h-px bg-purple-200/10" />
      <div className="absolute inset-y-[18%] left-1/2 w-px bg-purple-200/10" />
      <div className="relative text-center">
        <div className="text-[9px] font-semibold tracking-[0.28em] text-purple-200/35">VIDEO GUIDE</div>
        <div className="mt-1 text-[10px] text-white/30">映像素材 準備中</div>
      </div>
    </div>
  );
};

const TutorialPopup: React.FC = () => {
  const popup = useGameStore(s => s.tutorialPopup); // ポップアップ本体のみ購読(開閉時だけ再描画)
  const close = useGameStore(s => s.closeTutorialPopup);
  const [page, setPage] = useState(0);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => { setPage(0); }, [popup]);
  if (!popup) return null;

  const slides: TutorialSlide[] = popup.slides?.length
    ? popup.slides
    : [{ title: popup.title, lines: popup.lines, art: popup.art, img: popup.img }];
  const multiple = slides.length > 1;
  const last = page === slides.length - 1;
  const go = (next: number) => setPage(Math.max(0, Math.min(slides.length - 1, next)));

  const finishSwipe = (endX: number) => {
    const startX = touchStartX.current;
    touchStartX.current = null;
    if (startX === null || Math.abs(endX - startX) < 42) return;
    go(endX < startX ? page + 1 : page - 1);
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 px-6 py-8">
      <div className="relative flex max-h-[calc(100svh-40px)] w-full max-w-sm flex-col overflow-hidden" style={PANEL_STYLE}>
        <div className="px-5 pt-5 text-white/85" style={{ fontFamily: '"Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif' }}>
          {multiple && (
            <div className="flex items-center justify-between border-b border-purple-300/35 pb-1.5">
              <span className="text-[9px] font-semibold tracking-[0.22em] text-purple-200/55">{popup.title}</span>
              <span className="text-[10px] tabular-nums text-white/35">{page + 1} / {slides.length}</span>
            </div>
          )}
        </div>

        <div
          className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain touch-pan-y"
          onTouchStart={event => { touchStartX.current = event.touches[0]?.clientX ?? null; }}
          onTouchEnd={event => finishSwipe(event.changedTouches[0]?.clientX ?? 0)}
        >
          <div
            className="flex items-stretch transition-transform duration-300 ease-out"
            style={{ transform: `translate3d(-${page * 100}%, 0, 0)` }}
            aria-live="polite"
          >
            {slides.map((slide, index) => (
              <article key={`${slide.title}:${index}`} className="min-w-full px-5 pb-3 pt-3">
                <h2 className="text-[15px] font-bold tracking-[0.14em] text-white">
                  {slide.title}
                </h2>
                <SlideMedia slide={slide} />
                <div className="mt-4 space-y-2 text-[12.5px] leading-[1.75] text-white/80">
                  {slide.lines.map((line, lineIndex) => <p key={lineIndex}>{line}</p>)}
                </div>
              </article>
            ))}
          </div>
        </div>

        {multiple && (
          <div className="flex items-center justify-center gap-2 px-4 pb-1 pt-2" aria-label="チュートリアルページ">
            {slides.map((slide, index) => (
              <button
                type="button"
                key={slide.title}
                onClick={() => go(index)}
                aria-label={`${index + 1}ページ目 ${slide.title}`}
                aria-current={page === index ? 'step' : undefined}
                className={`h-1.5 transition-[width,background-color] duration-200 ${page === index ? 'w-6 bg-purple-200/80' : 'w-2 bg-white/15'}`}
              />
            ))}
          </div>
        )}

        <div className={`grid gap-2 px-4 pb-4 pt-2 ${multiple ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {multiple && (
            page > 0
              ? <Ff7rButton onClick={() => go(page - 1)} className="w-full" ariaLabel="前のページ">戻る</Ff7rButton>
              : <div aria-hidden="true" />
          )}
          <Ff7rButton
            onClick={() => { if (multiple && !last) go(page + 1); else close(); }}
            className="w-full"
            ariaLabel={multiple && !last ? '次のページ' : 'チュートリアルを閉じる'}
            emphasis
          >
            {multiple && !last ? '次へ' : multiple ? 'はじめる' : 'OK'}
          </Ff7rButton>
        </div>
      </div>
    </div>
  );
};

export default TutorialPopup;

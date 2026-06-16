import React, { useState, useRef } from 'react';

interface TitleScreenProps {
  onStart: () => void; // 最初のユーザー操作: BGM解禁(タップ直後に呼ぶ)
  onDone: () => void;  // ゆっくり暗転し切ったらメニューへ
}

// ローディング後のタイトル画面。背景は the ONE。タップ(=最初のユーザー操作)で BGM 解禁し、
// その後ゆっくり暗転(LOADING表示)してからメニューへ。Webの自動再生制限の最初の1タップをここで取得する。
const TitleScreen: React.FC<TitleScreenProps> = ({ onStart, onDone }) => {
  const [leaving, setLeaving] = useState(false);
  const doneRef = useRef(false);

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  };

  const begin = () => {
    if (leaving) return;
    setLeaving(true);
    onStart(); // タップの瞬間にBGM解禁
    window.setTimeout(finish, 1600); // transitionend が来ない環境のフォールバック
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); begin(); }
  };

  return (
    <div
      onClick={begin}
      onKeyDown={handleKey}
      role="button"
      tabIndex={0}
      aria-label="タップして開始"
      className="relative h-full w-full overflow-hidden bg-[#06070d] cursor-pointer select-none outline-none"
      style={{
        backgroundImage: `url(${import.meta.env.BASE_URL}backgrounds/title-the-one.png)`,
        backgroundSize: 'cover',
        backgroundPosition: 'center'
      }}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-black/5 via-transparent to-black/60" />
      <div
        className="absolute inset-x-0 flex flex-col items-center"
        style={{ bottom: 'max(calc(env(safe-area-inset-bottom) + 12%), 13%)' }}
      >
        <span
          className={`text-3xl font-semibold tracking-[0.45em] text-white/90 drop-shadow-[0_2px_10px_rgba(0,0,0,0.7)] ${leaving ? 'opacity-0 transition-opacity duration-500' : 'animate-pulse'}`}
        >
          START
        </span>
        {!leaving && <span className="mt-3 text-[11px] tracking-[0.3em] text-white/45">画面をタップして開始</span>}
      </div>

      {/* ゆっくり暗転 → LOADING → メニューへ */}
      <div
        className="pointer-events-none absolute inset-0 flex items-end justify-center bg-black ease-in"
        style={{ opacity: leaving ? 1 : 0, transition: 'opacity 1400ms ease-in' }}
        onTransitionEnd={(e) => { if (e.propertyName === 'opacity' && leaving) finish(); }}
      >
        <span
          className="mb-16 text-[11px] tracking-[0.34em] text-white/45"
          style={{ opacity: leaving ? 1 : 0, transition: 'opacity 700ms ease-in 300ms' }}
        >
          LOADING…
        </span>
      </div>
    </div>
  );
};

export default TitleScreen;

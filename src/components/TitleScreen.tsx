import React from 'react';

interface TitleScreenProps {
  onStart: () => void;
}

// ローディング後のタイトル画面。背景は the ONE。タップ(=最初のユーザー操作)で BGM 解禁してメニューへ。
// Webの自動再生制限により、この最初の1タップが入るまで音は鳴らせないため、ここで START 待機する。
const TitleScreen: React.FC<TitleScreenProps> = ({ onStart }) => {
  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onStart(); }
  };
  return (
    <div
      onClick={onStart}
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
        <span className="animate-pulse text-3xl font-semibold tracking-[0.45em] text-white/90 drop-shadow-[0_2px_10px_rgba(0,0,0,0.7)]">
          START
        </span>
        <span className="mt-3 text-[11px] tracking-[0.3em] text-white/45">画面をタップして開始</span>
      </div>
    </div>
  );
};

export default TitleScreen;

import React, { useState, useRef } from 'react';

interface TitleScreenProps {
  onStart: () => void; // 最初のユーザー操作: BGM解禁(タップ直後に呼ぶ)
  onDone: () => void;  // 暗転し切ったらメニューへ
}

// ローディング後のタイトル(the ONE)。流れ: STARTタップ → 音楽再生＆ローディング処理 → ゆっくり暗転 → セレクト。
// Webの自動再生制限の最初の1タップをここで取得する。
const TitleScreen: React.FC<TitleScreenProps> = ({ onStart, onDone }) => {
  const [phase, setPhase] = useState<'idle' | 'loading' | 'blackout'>('idle');
  const doneRef = useRef(false);

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  };

  const begin = () => {
    if (phase !== 'idle') return;
    onStart();                                       // タップ瞬間にBGM解禁＆再生
    setPhase('loading');                             // ローディング処理(表示)
    window.setTimeout(() => setPhase('blackout'), 1000); // → ゆっくり暗転へ
    window.setTimeout(finish, 2100);                 // フォールバック(暗転完了でメニュー)
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

      {phase === 'idle' && (
        <div
          className="absolute inset-x-0 flex flex-col items-center"
          style={{ bottom: 'max(calc(env(safe-area-inset-bottom) + 12%), 13%)' }}
        >
          <span className="animate-pulse text-3xl font-semibold tracking-[0.45em] text-white/90 drop-shadow-[0_2px_10px_rgba(0,0,0,0.7)]">
            START
          </span>
          <span className="mt-3 text-[11px] tracking-[0.3em] text-white/45">画面をタップして開始</span>
        </div>
      )}

      {/* ローディング処理(タップ後に表示) */}
      {phase !== 'idle' && (
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-[18%]">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-white/20 border-t-white/75" />
          <span className="mt-4 text-[11px] tracking-[0.34em] text-white/55">LOADING…</span>
        </div>
      )}

      {/* ゆっくり暗転 → 完了でメニューへ */}
      <div
        className="pointer-events-none absolute inset-0 bg-black"
        style={{ opacity: phase === 'blackout' ? 1 : 0, transition: 'opacity 1000ms ease-in' }}
        onTransitionEnd={(e) => { if (e.propertyName === 'opacity' && phase === 'blackout') finish(); }}
      />
    </div>
  );
};

export default TitleScreen;

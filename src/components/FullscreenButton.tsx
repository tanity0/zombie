import React, { useState, useEffect } from 'react';

interface FullscreenButtonProps {
  target: React.RefObject<HTMLDivElement>;
}

const FullscreenButton: React.FC<FullscreenButtonProps> = ({ target }) => {
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Update fullscreen state when it changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      // Enter fullscreen
      if (target.current && target.current.requestFullscreen) {
        target.current.requestFullscreen().catch(err => {
          console.error(`フルスクリーンエラー: ${err.message}`);
        });
      }
    } else {
      // Exit fullscreen
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  return (
    <button
      onClick={toggleFullscreen}
      className="fixed z-20 glass-panel rounded-full text-white/80 p-2"
      style={{
        top: 'calc(max(env(safe-area-inset-top), 8px) + 56px)',
        right: 'max(env(safe-area-inset-right), 12px)'
      }}
      aria-label={isFullscreen ? "フルスクリーン終了" : "フルスクリーン"}
    >
      {isFullscreen ? (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 3v4a1 1 0 0 1-1 1H3"></path>
          <path d="M21 8h-4a1 1 0 0 1-1-1V3"></path>
          <path d="M3 16h4a1 1 0 0 1 1 1v4"></path>
          <path d="M16 21v-4a1 1 0 0 1 1-1h4"></path>
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 3 21 3 21 9"></polyline>
          <polyline points="9 21 3 21 3 15"></polyline>
          <line x1="21" y1="3" x2="14" y2="10"></line>
          <line x1="3" y1="21" x2="10" y2="14"></line>
        </svg>
      )}
    </button>
  );
};

export default FullscreenButton;
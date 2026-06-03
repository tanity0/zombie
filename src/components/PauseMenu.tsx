import React, { useEffect } from 'react';
import { useGameStore } from '../store/gameStore';

interface PauseMenuProps {
  onResume: () => void;
  onQuit: () => void;
}

const PauseMenu: React.FC<PauseMenuProps> = ({ onResume, onQuit }) => {
  // Ensure pause menu handles events correctly
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'p') {
        onResume();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onResume]);

  // Stop any existing touch events from propagating to the game
  const preventTouchEvent = (e: React.TouchEvent) => {
    e.stopPropagation();
  };

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center px-6"
      style={{ background: 'rgba(11, 11, 18, 0.6)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)' }}
      onTouchStart={preventTouchEvent}
      onTouchMove={preventTouchEvent}
      onTouchEnd={preventTouchEvent}
    >
      <div className="glass-panel rounded-3xl w-full max-w-sm overflow-hidden">
        <div className="px-5 pt-5 pb-3 text-center">
          <h2 className="text-xl font-semibold tracking-tight text-white">一時停止</h2>
        </div>
        <div className="px-5 pb-5 flex flex-col gap-2">
          <button
            onClick={onResume}
            className="w-full py-3 rounded-2xl text-base font-semibold text-white"
            style={{
              background: 'linear-gradient(180deg, rgba(96, 165, 250, 0.95), rgba(59, 130, 246, 0.95))',
              boxShadow: '0 8px 24px rgba(59, 130, 246, 0.35)'
            }}
          >
            続ける
          </button>
          <button
            onClick={onQuit}
            className="w-full py-3 rounded-2xl text-base font-semibold text-white/90 bg-white/10 border border-white/10"
          >
            メニューに戻る
          </button>
          <p className="mt-1 text-[11px] text-white/50 text-center">
            ESC / P キーでも再開できます
          </p>
        </div>
      </div>
    </div>
  );
};

export default PauseMenu;
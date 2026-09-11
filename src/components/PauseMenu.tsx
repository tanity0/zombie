import React, { useEffect } from 'react';
import { playSfx } from '../audio/audioManager';
import { Ff7rButton } from './ff7r';

interface PauseMenuProps {
  onResume: () => void;
  onQuit: () => void;
}

// キーボード案内は、キーボードのある端末だけに出す(縦持ちスマホに「ESC / P」を出さない)。
const hasFinePointer = (): boolean => {
  try { return typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches; } catch { return false; }
};

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
      className="fixed inset-0 z-50 flex items-center justify-center px-6"
      style={{ background: 'rgba(11, 11, 18, 0.6)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)' }}
      onTouchStart={preventTouchEvent}
      onTouchMove={preventTouchEvent}
      onTouchEnd={preventTouchEvent}
    >
      <div className="glass-panel command-panel rounded-none w-full max-w-sm overflow-hidden">
        <div className="px-5 pt-5 pb-3 text-center">
          <h2 className="text-xl font-semibold tracking-tight text-white">一時停止</h2>
        </div>
        <div className="px-5 pb-5 flex flex-col gap-2">
          <Ff7rButton onClick={() => { playSfx('ui-select'); onResume(); }} className="w-full" emphasis fade="both" paddingY="0.8rem">
            続ける
          </Ff7rButton>
          <Ff7rButton onClick={() => { playSfx('ui-select'); onQuit(); }} className="w-full" fade="both" paddingY="0.8rem">
            メニューに戻る
          </Ff7rButton>
          {hasFinePointer() && <p className="mt-1 text-[11px] text-white/50 text-center">
            ESC / P でも再開
          </p>}
        </div>
      </div>
    </div>
  );
};

export default PauseMenu;

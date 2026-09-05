import React, { useCallback, useEffect } from 'react';
import { playSfx } from '../audio/audioManager';
import { useGameStore } from '../store/gameStore';
import { Ff7rButton } from './ff7r';

const StoryReturnPrompt: React.FC = () => {
  const visible = useGameStore(state => state.storyReturnPromptVisible);
  const answer = useGameStore(state => state.answerStoryReturnPrompt);

  const choose = useCallback((confirmed: boolean) => {
    playSfx('ui-select');
    answer(confirmed);
  }, [answer]);

  useEffect(() => {
    if (!visible) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        choose(true);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        choose(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [visible, choose]);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center px-6"
      style={{ background: 'rgba(11, 11, 18, 0.6)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)' }}
      onPointerDown={event => event.stopPropagation()}
      onPointerUp={event => event.stopPropagation()}
    >
      <div className="glass-panel w-full max-w-sm overflow-hidden rounded-none">
        <div className="px-5 pb-4 pt-6 text-center">
          <h2 className="text-xl font-semibold tracking-tight text-white">帰還しますか？</h2>
        </div>
        <div className="flex flex-col gap-2 px-5 pb-5">
          <Ff7rButton onClick={() => choose(true)} className="w-full" emphasis fade="both" paddingY="0.8rem">
            はい
          </Ff7rButton>
          <Ff7rButton onClick={() => choose(false)} className="w-full" fade="both" paddingY="0.8rem">
            いいえ
          </Ff7rButton>
        </div>
      </div>
    </div>
  );
};

export default StoryReturnPrompt;

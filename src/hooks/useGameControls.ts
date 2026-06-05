import { useEffect } from 'react';
import { playSfx, playEnemyDeath } from '../audio/audioManager';
import { useGameStore } from '../store/gameStore';

// Keyboard fallback — the game is touch-first now, but we keep WASD/arrow
// movement and Space-to-counter so the game is still playable on a laptop.
const isCounterKey = (key: string) => {
  const k = key.toLowerCase();
  return k === ' ' || k === 'spacebar' || k === 'space' || k === 'j';
};

export const useGameControls = () => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const { key } = e;
      const inputState = { ...useGameStore.getState().inputState };

      switch (key.toLowerCase()) {
        case 'w':
        case 'arrowup':
          inputState.up = true;
          break;
        case 's':
        case 'arrowdown':
          inputState.down = true;
          break;
        case 'a':
        case 'arrowleft':
          inputState.left = true;
          break;
        case 'd':
        case 'arrowright':
          inputState.right = true;
          break;
      }

      if (isCounterKey(key)) {
        e.preventDefault();
        // First press only — auto-repeat shouldn't keep refiring the counter
        if (!e.repeat) {
          const counter = useGameStore.getState().triggerCounter();
          if (counter.swung) playSfx('melee');
          if (counter.finish) playSfx('melee-finish');
          else if (counter.hit) playSfx('slash-damage');
          if (counter.killed > 0) playEnemyDeath(); // slain enemies grunt
        }
      }

      useGameStore.setState({ inputState });
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const { key } = e;
      const inputState = { ...useGameStore.getState().inputState };

      switch (key.toLowerCase()) {
        case 'w':
        case 'arrowup':
          inputState.up = false;
          break;
        case 's':
        case 'arrowdown':
          inputState.down = false;
          break;
        case 'a':
        case 'arrowleft':
          inputState.left = false;
          break;
        case 'd':
        case 'arrowright':
          inputState.right = false;
          break;
      }

      useGameStore.setState({ inputState });
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);
};

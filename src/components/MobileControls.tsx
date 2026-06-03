import React from 'react';
import { useGameStore } from '../store/gameStore';

// One-handed touch model: the joystick covers the whole screen and releasing
// the finger triggers the counter, so there's no need for a dedicated guard
// button anymore. This component is now just the small pause pill.
const MobileControls: React.FC = () => {
  const handlePause = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    useGameStore.setState(state => ({ isPaused: !state.isPaused }));
  };

  return (
    <div
      className="absolute right-0 bottom-0 z-30"
      style={{
        paddingRight: 'max(env(safe-area-inset-right), 16px)',
        paddingBottom: 'max(env(safe-area-inset-bottom), 24px)'
      }}
    >
      <button
        type="button"
        className="w-10 h-10 rounded-full glass-panel text-white text-xs font-semibold flex items-center justify-center"
        onPointerDown={handlePause}
        aria-label="ポーズ"
      >
        II
      </button>
    </div>
  );
};

export default MobileControls;

import React from 'react';
import { useGameStore } from '../store/gameStore';
import { HudKey } from './HudKey'; // ゲーム中のボタン札(research/PC_SUPPORT.md §14)
import { useHudHintStyle, hudGlyph } from '../utils/hudHints';
import { useHudLandscape } from './HudScale';

// One-handed touch model: the joystick covers the whole screen and releasing
// the finger triggers the counter, so there's no need for a dedicated guard
// button anymore. This component is now just the small pause pill.
const MobileControls: React.FC = () => {
  const hint = useHudHintStyle(useHudLandscape()); // スマホ(縦)=null=札も包みも描かない
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
      {(() => {
        const btn = (
          <button
            type="button"
            className="w-10 h-10 rounded-full glass-panel text-white text-xs font-semibold flex items-center justify-center"
            onPointerDown={handlePause}
            aria-label="ポーズ"
          >
            II
          </button>
        );
        // 札(§14): 一時停止=Esc / 三本線。ボタンの下に4px 離して浮かせる(他の札と同じ「物から離して置く」語彙)。
        return hint ? (
          <div className="relative">
            {btn}
            <HudKey key={hint} hint={hint} act="pause" glyph={hudGlyph(hint, 'pause', false)} style={{ left: '50%', top: 'calc(100% + 4px)', transform: 'translateX(-50%)' }} />
          </div>
        ) : btn;
      })()}
    </div>
  );
};

export default MobileControls;

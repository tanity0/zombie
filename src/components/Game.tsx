import React, { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import GameCanvas from './GameCanvas';
import PixiStage from '../pixi/PixiStage';
import { isPixiRenderer } from '../config/renderer';
import GameHUD from './GameHUD';
import UpgradeMenu from './UpgradeMenu';
import PauseMenu from './PauseMenu';
import MobileControls from './MobileControls';
import VirtualJoystick from './VirtualJoystick';
import FullscreenButton from './FullscreenButton';
import { useGameLoop } from '../hooks/useGameLoop';
import { useGameControls } from '../hooks/useGameControls';

interface GameProps {
  onGameOver: () => void;
  onVictory: () => void;
}

const Game: React.FC<GameProps> = ({ onGameOver, onVictory }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [windowSize, setWindowSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [isTouch, setIsTouch] = useState(
    typeof window !== 'undefined' &&
      ('ontouchstart' in window || navigator.maxTouchPoints > 0)
  );

  const isPaused = useGameStore(state => state.isPaused);
  const showUpgradeMenu = useGameStore(state => state.showUpgradeMenu);
  const [showUpgradeOverlay, setShowUpgradeOverlay] = useState(false);
  const gameWon = useGameStore(state => state.gameWon);
  const player = useGameStore(state => state.player);
  const setGameBounds = useGameStore(state => state.setGameBounds);
  const setPaused = useGameStore(state => state.setPaused);

  // Set up game controls
  useGameControls();

  // Start game loop
  const { fps } = useGameLoop(onGameOver);

  // Detect touch capability (re-checks if device profile changes mid-session)
  useEffect(() => {
    const check = () => {
      setIsTouch('ontouchstart' in window || navigator.maxTouchPoints > 0);
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  
  // Update window size and game bounds on resize or fullscreen change
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const { width, height } = containerRef.current.getBoundingClientRect();
        setWindowSize({ width, height });
        setGameBounds({ width, height });
      } else {
        const width = window.innerWidth;
        const height = window.innerHeight;
        setWindowSize({ width, height });
        setGameBounds({ width, height });
      }
    };
    
    updateSize();
    
    window.addEventListener('resize', updateSize);
    document.addEventListener('fullscreenchange', updateSize);
    
    return () => {
      window.removeEventListener('resize', updateSize);
      document.removeEventListener('fullscreenchange', updateSize);
    };
  }, [setGameBounds]);
  
  // Check if player is dead
  useEffect(() => {
    if (player.health <= 0) {
      onGameOver();
    }
  }, [player.health, onGameOver]);

  // Win the run the moment the finale boss is defeated.
  useEffect(() => {
    if (gameWon) {
      onVictory();
    }
  }, [gameWon, onVictory]);
  
  // Handle keyboard pause toggle
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'p') {
        if (!showUpgradeMenu) {
          setPaused(!isPaused);
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPaused, setPaused, showUpgradeMenu]);

  useEffect(() => {
    if (!showUpgradeMenu) {
      setShowUpgradeOverlay(false);
      return;
    }
    const timer = window.setTimeout(() => setShowUpgradeOverlay(true), 450);
    return () => window.clearTimeout(timer);
  }, [showUpgradeMenu]);
  
  // Prevent text selection from long-press, but DON'T preventDefault on
  // touchstart at the container level — doing so suppresses iOS Safari's
  // synthesized click events, which breaks taps on UI buttons (e.g. the
  // upgrade menu). Page scrolling is already disabled via
  // `touch-action: none` in the global CSS.
  
  return (
    <div 
      ref={containerRef} 
      className="relative w-full h-full bg-gray-900"
      style={{ 
        touchAction: 'none',
        overflow: 'hidden'
      }}
    >
      {/* World view: PixiJS (?renderer=pixi) or the original Canvas2D
          renderer (default). The React HUD below overlays either one. */}
      {isPixiRenderer() ? (
        <PixiStage width={windowSize.width} height={windowSize.height} />
      ) : (
        <GameCanvas width={windowSize.width} height={windowSize.height} />
      )}

      {/* Joystick zone covers the whole screen for one-handed play; place
          it BEFORE the HUD/buttons so those render on top and stay tappable. */}
      {isTouch && <VirtualJoystick />}

      <GameHUD fps={fps} />
      <FullscreenButton target={containerRef} />
      {isTouch && <MobileControls />}
      
      {isPaused && !showUpgradeMenu && (
        <PauseMenu onResume={() => setPaused(false)} onQuit={onGameOver} />
      )}
      
      {showUpgradeOverlay && (
        <UpgradeMenu />
      )}

      {/* In-play version marker (bottom-left): same source as the title's
          top-right badge (__APP_VERSION__ = package.json version) so the
          number always matches. Visible during on-device testing where the
          title screen isn't. Also shows the active renderer. */}
      <div
        style={{
          position: 'absolute',
          left: 4,
          bottom: 2,
          fontSize: 9,
          lineHeight: 1.2,
          color: 'rgba(255,255,255,0.45)',
          fontFamily: 'monospace',
          pointerEvents: 'none',
          zIndex: 50
        }}
      >
        {isPixiRenderer() ? 'pixi' : 'canvas'} · v{__APP_VERSION__}
      </div>
    </div>
  );
};

export default Game;

import React, { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import GameCanvas from './GameCanvas';
import PixiStage from '../pixi/PixiStage';
import { isPixiRenderer, getAppliedResolution } from '../config/renderer';
import { getTexture } from '../pixi/pixiTextures';
import GameHUD from './GameHUD';
import PerfOverlay from './PerfOverlay';
import DebugOverlay from './DebugOverlay';
import DirectorOverlay from './DirectorOverlay';
import StatsHud from './StatsHud';
import DanceTapMeter from './DanceTapMeter';
import WallBand from './WallBand';
import WallInscription from './WallInscription';
import UpgradeMenu from './UpgradeMenu';
import PauseMenu from './PauseMenu';
import ShopMenu from './ShopMenu';
import IntroDialogue from './IntroDialogue';
import MobileControls from './MobileControls';
import VirtualJoystick from './VirtualJoystick';
import MouseControls from './MouseControls';
import BenchmarkOverlay, { type BenchmarkResult } from './BenchmarkOverlay';
import { useGameLoop } from '../hooks/useGameLoop';
import { useGameControls } from '../hooks/useGameControls';
import { computeViewport } from '../utils/viewport';

interface GameProps {
  onGameOver: () => void;
  onVictory: () => void;
  onReturn?: () => void;
  benchmarkMode?: boolean;
  onBenchmarkComplete?: (result: BenchmarkResult) => void;
}

const Game: React.FC<GameProps> = ({
  onGameOver,
  onVictory,
  onReturn,
  benchmarkMode = false,
  onBenchmarkComplete
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [windowSize, setWindowSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [isTouch, setIsTouch] = useState(
    typeof window !== 'undefined' &&
      ('ontouchstart' in window || navigator.maxTouchPoints > 0)
  );

  const isPaused = useGameStore(state => state.isPaused);
  const showStatsOverlay = useGameStore(state => state.showStatsOverlay);
  // 凍結診断オンスクリーン表示(?debug=1)。
  const debugOverlay = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === '1';
  // AIディレクター(ステップA)可視化(?director=1)。読むだけ=ゲーム挙動には影響しない。
  const directorOverlay = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('director') === '1';
  const showUpgradeMenu = useGameStore(state => state.showUpgradeMenu);
  const showShopMenu = useGameStore(state => state.showShopMenu);
  const showEventQuestMenu = useGameStore(state => state.showEventQuestMenu);
  const [showUpgradeOverlay, setShowUpgradeOverlay] = useState(false);
  const gameWon = useGameStore(state => state.gameWon);
  const gameReturned = useGameStore(state => state.gameReturned);
  // 死亡判定に使うのは health だけ。player 全体を購読すると移動で毎フレーム再描画され、子(HUD/Stage)へ波及する。
  const playerHealth = useGameStore(state => state.player.health);
  const setGameBounds = useGameStore(state => state.setGameBounds);
  const setPaused = useGameStore(state => state.setPaused);

  // Set up game controls
  useGameControls();

  // Start game loop
  const { fps } = useGameLoop(onGameOver, { benchmarkMode });

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
      const r = containerRef.current?.getBoundingClientRect();
      const width = r ? r.width : window.innerWidth;
      const height = r ? r.height : window.innerHeight;
      setWindowSize({ width, height });                 // 端末px(レンダラ/PixiStage 用)
      // 画面外判定(スポーン/カリング/画面端マーカー)は固定ビューの論理寸法で統一=機種で挙動が変わらない。
      const vp = computeViewport(width, height);
      setGameBounds({ width: vp.logicalW, height: vp.logicalH });
    };
    
    updateSize();

    // モバイルは回転直後の innerWidth/Height(=getBoundingClientRect)が確定前で古い値を返すことがある。
    // 縦↔横の切替後にレイアウトが崩れる(床が画面を占拠する)ため、回転時は即時＋遅延で再計測して確実に追従。
    const timers: number[] = [];
    const updateSizeSoon = () => {
      updateSize();
      timers.push(window.setTimeout(updateSize, 250));
      timers.push(window.setTimeout(updateSize, 600));
    };

    window.addEventListener('resize', updateSize);
    window.addEventListener('orientationchange', updateSizeSoon);
    document.addEventListener('fullscreenchange', updateSize);

    return () => {
      timers.forEach(id => clearTimeout(id));
      window.removeEventListener('resize', updateSize);
      window.removeEventListener('orientationchange', updateSizeSoon);
      document.removeEventListener('fullscreenchange', updateSize);
    };
  }, [setGameBounds]);
  
  // Check if player is dead
  useEffect(() => {
    if (playerHealth <= 0) {
      const timer = window.setTimeout(onGameOver, 700);
      return () => window.clearTimeout(timer);
    }
  }, [playerHealth, onGameOver]);

  // Win the run the moment the finale boss is defeated.
  useEffect(() => {
    if (gameWon) {
      onVictory();
    }
  }, [gameWon, onVictory]);

  // 商人「帰還」で任意撤収したらリザルト(撤収)へ。
  useEffect(() => {
    if (gameReturned) {
      onReturn?.();
    }
  }, [gameReturned, onReturn]);
  
  // Handle keyboard pause toggle
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'p') {
        if (!showUpgradeMenu && !showShopMenu && !showEventQuestMenu) {
          setPaused(!isPaused);
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPaused, setPaused, showEventQuestMenu, showShopMenu, showUpgradeMenu]);

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
      {/* PC(非タッチ): マウス照準 + 左クリック=タップ / 右クリック=フリック。HUDより手前(z低)に置く。 */}
      {!isTouch && <MouseControls />}

      <GameHUD />
      {/* PACING_PUZZLE.md §5.17 M14: 到達譜=二軸の壁の演出(中格=帯/大格=銘打ち)。 */}
      <WallBand />
      <WallInscription />
      {/* 撃破/DMG/SCRAP + FPS/負荷表示は TOP画面のトグルで有り/無し(既定=無し)。 */}
      {showStatsOverlay && <StatsHud />}
      {showStatsOverlay && <PerfOverlay fps={fps} />}
      {debugOverlay && <DebugOverlay />}
      {directorOverlay && <DirectorOverlay />}
      <DanceTapMeter />{/* テスト用タップms計測(?dev=0で非表示・ダンス中のみ) */}
      {benchmarkMode && (
        <div
          className="pointer-events-none absolute left-2 top-[calc(max(env(safe-area-inset-top),8px)+94px)] z-50 rounded-md border border-cyan-200/35 bg-cyan-950/55 px-2 py-1 text-[10px] font-bold tracking-widest text-cyan-100 shadow-lg backdrop-blur-sm"
          style={{ fontFamily: 'monospace' }}
        >
          BENCH MODE
        </div>
      )}
      {benchmarkMode && onBenchmarkComplete && (
        <BenchmarkOverlay fps={fps} onComplete={onBenchmarkComplete} />
      )}
      {isTouch && <MobileControls />}
      
      {isPaused && !showUpgradeMenu && !showShopMenu && !showEventQuestMenu && (
        <PauseMenu onResume={() => setPaused(false)} onQuit={onGameOver} />
      )}
      
      {showUpgradeOverlay && (
        <UpgradeMenu />
      )}

      {showShopMenu && (
        <ShopMenu />
      )}

      {/* 二人組(クエストNPC)の会話ポップアップは廃止(社長指示v0.25.1681)。
          受領=会話サークル3秒滞在(拠点解放式メーター)+左上NPC会話へ移行。 */}

      {/* 登場時のセリフ(時間停止・オートタイプ)。表示中だけ自前 raf で更新。 */}
      <IntroDialogue />

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
        {' · '}floor:{getTexture('lab-floor/lab-floor-stage2') ? 'S' : '-'}{getTexture('lab-floor/lab-floor-ground') ? 'G' : '-'}{getTexture('lab-floor/lab-floor-clean') ? 'C' : '-'}
        {' · '}res:{getAppliedResolution() || '?'}/{typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : '?'}
      </div>
    </div>
  );
};

export default Game;

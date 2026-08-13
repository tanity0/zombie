import React, { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import GameCanvas from './GameCanvas';
import PixiStage from '../pixi/PixiStage';
import { isPixiRenderer, getAppliedResolution } from '../config/renderer';
import { getAssistLightDebug } from '../pixi/pixiScene';
import { getTexture } from '../pixi/pixiTextures';
import GameHUD from './GameHUD';
import PerfOverlay from './PerfOverlay';
import DebugOverlay from './DebugOverlay';
import GhostDamageLog from './GhostDamageLog';
import DirectorOverlay from './DirectorOverlay';
import StatsHud from './StatsHud';
import ConsumableHud from './ConsumableHud';
import DanceTapMeter from './DanceTapMeter';
import WallBand from './WallBand';
import AwakenCutin from './AwakenCutin'; // SKILL_BUILD_REDESIGN.md §24: 覚醒カットイン帯(非ブロッキング)
import WallInscription from './WallInscription';
import UpgradeMenu from './UpgradeMenu';
import PauseMenu from './PauseMenu';
import StoryReturnPrompt from './StoryReturnPrompt';
import TutorialPopup from './TutorialPopup';
import BossCutin from './BossCutin';
import ShopMenu from './ShopMenu';
import IntroDialogue from './IntroDialogue';
import MobileControls from './MobileControls';
import VirtualJoystick from './VirtualJoystick';
import MouseControls from './MouseControls';
import BenchmarkOverlay, { type BenchmarkResult } from './BenchmarkOverlay';
import { useGameLoop } from '../hooks/useGameLoop';
import { useGameControls } from '../hooks/useGameControls';
import { computeViewport } from '../utils/viewport';
import { playSfx } from '../audio/audioManager';

// the ONE 洋館［SUB］再訪(統合正本9.3): 保存槽(洋館)接近中だけ出す操作表示［投与する］。
// 購読は boolean 1個(medicinePromptVisible・変化時のみ書かれる)=React再レンダ規律準拠の孤立小コンポーネント。
const MedicinePrompt: React.FC = () => {
  const visible = useGameStore(s => s.medicinePromptVisible);
  if (!visible) return null;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        playSfx('ui-select');
        useGameStore.getState().useGlenMedicine();
      }}
      className="absolute left-1/2 z-40 -translate-x-1/2 rounded-none border border-amber-300/60 bg-black/70 px-5 py-3 text-[14px] font-bold tracking-wide text-amber-100 shadow-lg backdrop-blur-sm active:bg-black/85"
      style={{ bottom: 'max(calc(env(safe-area-inset-bottom) + 132px), 148px)' }}
    >
      ［投与する］
    </button>
  );
};

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
  // WebGLコンテキストロスト時の再構築世代(v0.25.2160): PixiStageがロストを通知したらkeyを変えて
  // 再マウント=レンダラ/シーン/テクスチャを作り直す。シミュ状態はstoreにあるためゲームは続きから。
  const [pixiEpoch, setPixiEpoch] = useState(0);
  const [isTouch, setIsTouch] = useState(
    typeof window !== 'undefined' &&
      ('ontouchstart' in window || navigator.maxTouchPoints > 0)
  );

  const isPaused = useGameStore(state => state.isPaused);
  const tutorialPopupOpen = useGameStore(state => state.tutorialPopup !== null); // boolean派生=開閉時のみ再描画
  const showStatsOverlay = useGameStore(state => state.showStatsOverlay);
  // ボスメーカーの部屋ではゲームHUDを消す(社長指示v0.25.2628「重なって邪魔」)。
  // レベル円/サブ武器欄/武器スロット/スコアは調整に不要。**派生boolean購読**なので
  // 毎フレーム再描画しない(CLAUDE.md React再描画の規律)。ライブ表示はメーカー側に残る。
  const makerHideHud = useGameStore(state => state.bossMaker.active && state.bossMaker.hideHud);
  // 凍結診断オンスクリーン表示(?debug=1)。
  const debugOverlay = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === '1';
  // AIディレクター(ステップA)可視化(?director=1)。読むだけ=ゲーム挙動には影響しない。
  const directorOverlay = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('director') === '1';
  const showUpgradeMenu = useGameStore(state => state.showUpgradeMenu);
  const showShopMenu = useGameStore(state => state.showShopMenu);
  const showEventQuestMenu = useGameStore(state => state.showEventQuestMenu);
  const storyReturnPromptVisible = useGameStore(state => state.storyReturnPromptVisible);
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
        if (!showUpgradeMenu && !showShopMenu && !showEventQuestMenu && !storyReturnPromptVisible) {
          setPaused(!isPaused);
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPaused, setPaused, showEventQuestMenu, showShopMenu, showUpgradeMenu, storyReturnPromptVisible]);

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
        <PixiStage
          key={pixiEpoch}
          width={windowSize.width}
          height={windowSize.height}
          onContextLost={() => setPixiEpoch(e => e + 1)}
        />
      ) : (
        <GameCanvas width={windowSize.width} height={windowSize.height} />
      )}

      {/* Joystick zone covers the whole screen for one-handed play; place
          it BEFORE the HUD/buttons so those render on top and stay tappable. */}
      {isTouch && <VirtualJoystick />}
      {/* PC(非タッチ): マウス照準 + 左クリック=タップ / 右クリック=フリック。HUDより手前(z低)に置く。 */}
      {!isTouch && <MouseControls />}

      {!makerHideHud && <GameHUD />}
      {/* SKILL_BUILD_REDESIGN.md §23-2条件5: 消費カード発動中は残秒を常時表示(統計トグルとは独立)。 */}
      {!makerHideHud && <ConsumableHud />}
      {/* PACING_PUZZLE.md §5.17 M14: 到達譜=二軸の壁の演出(中格=帯/大格=銘打ち)。 */}
      <WallBand />
      <WallInscription />
      {/* SKILL_BUILD_REDESIGN.md §24: スキル覚醒(Lv3到達)のカットイン帯。ゲームは止めない。 */}
      <AwakenCutin />
      {/* 撃破/DMG/SCRAP + FPS/負荷表示は TOP画面のトグルで有り/無し(既定=無し)。 */}
      {showStatsOverlay && <StatsHud />}
      {showStatsOverlay && <PerfOverlay fps={fps} />}
      {debugOverlay && <DebugOverlay />}
      <GhostDamageLog />{/* v0.25.2591: ?ghostlog=1 の被弾ログを画面に出す(スマホでコンソールが見られないため) */}
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
      {isTouch && !makerHideHud && <MobileControls />}
      
      {/* §6.36 ボス出現カットイン(HUDより最前面・cutin窓の1.1秒だけ) */}
      <BossCutin />

      {/* チュートリアルの操作説明ポップアップ(表示中はisPaused=trueだがPauseMenuは出さない=ポップアップ優先) */}
      <TutorialPopup />
      {isPaused && !tutorialPopupOpen && !showUpgradeMenu && !showShopMenu && !showEventQuestMenu && !storyReturnPromptVisible && (
        <PauseMenu onResume={() => setPaused(false)} onQuit={onGameOver} />
      )}

      <StoryReturnPrompt />
      
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

      {/* 洋館再訪: 保存槽接近中の［投与する］(統合正本9.3・修正差分メモD-09)。 */}
      <MedicinePrompt />

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
        {typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('lightdbg') === '1' && <LightDebug />}
      </div>
    </div>
  );
};

/**
 * ★v0.25.2780: 補助光の連動(周りの明るさでプレイヤー光を引く)の実測値を出す。`?lightdbg=1` の時だけ。
 * 社長「何も変わってない?」に目視で答えられず推測でチューニングしかけたので、**数字を出す**。
 * ★React再描画規律(CLAUDE.md): stateを持たず、**refのtextContentを rAF で書き換えるだけ**。
 * 毎フレーム更新でも React は1度も再描画しない。
 */
const LightDebug: React.FC = () => {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const d = getAssistLightDebug();
      if (ref.current) ref.current.textContent = ` · light:${d.b.toFixed(2)} punch:${d.punch.toFixed(2)} mult:${d.mult.toFixed(2)} n:${d.lights}`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <span ref={ref} />;
};

export default Game;

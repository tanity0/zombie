import React, { useEffect, useRef, useState } from 'react';
import Game from './components/Game';
import MainMenu from './components/MainMenu';
import GameOverScreen from './components/GameOverScreen';
import LoadingScreen from './components/LoadingScreen';
import type { BenchmarkResult } from './components/BenchmarkOverlay';
import { CharacterClass, GameState } from './types/game';
import { useGameStore } from './store/gameStore';
import { setBgmActive, preloadAllAudio, unlockDanceAudio } from './audio/audioManager';
import { ensureTextures } from './pixi/pixiTextures';

const LOADING_MIN_MS = 650;

function App() {
  const [gameState, setGameState] = useState<GameState>('loading'); // 起動時ローディングから開始
  const [benchmarkMode, setBenchmarkMode] = useState(false);
  const [benchmarkResult, setBenchmarkResult] = useState<BenchmarkResult | null>(null);
  const preloadPromiseRef = useRef<Promise<void> | null>(null);
  const pendingBenchmarkRef = useRef(false);
  const resetGame = useGameStore(state => state.resetGame);
  const gameStats = useGameStore(state => state.gameStats);

  useEffect(() => {
    // 起動時に必要な素材を全てダウンロードし切ってからメニューへ(テクスチャ + 音声/BGM/ダンス/SFX)。
    const boot = async () => {
      const started = performance.now();
      const tex = ensureTextures().catch(() => {});
      preloadPromiseRef.current = tex;
      await Promise.all([tex, preloadAllAudio()]);
      const remaining = LOADING_MIN_MS - (performance.now() - started);
      if (remaining > 0) await new Promise(resolve => window.setTimeout(resolve, remaining));
      setGameState('menu');
    };
    void boot();
  }, []);

  useEffect(() => {
    void setBgmActive(gameState === 'playing');
  }, [gameState]);
  
  const startGame = async (characterClass: string, benchmark = false) => {
    // Web/iOS Safari BGM unlock workaround. Remove for native-app audio.
    unlockDanceAudio();
    const validClass = ['warrior', 'mage', 'rogue', 'necromancer'].includes(characterClass)
      ? characterClass as CharacterClass
      : 'warrior';

    pendingBenchmarkRef.current = benchmark;
    setBenchmarkMode(benchmark);
    setBenchmarkResult(null);
    // 素材は起動時にDL済み。テクスチャだけ念のため確実化(通常は即時)。ローディング画面は挟まない。
    await (preloadPromiseRef.current ?? ensureTextures().catch(() => {}));
    resetGame(validClass);
    setBenchmarkMode(pendingBenchmarkRef.current);
    setGameState('playing');
  };

  const handleGameOver = () => {
    setGameState('gameOver');
  };

  const handleVictory = () => {
    setGameState('victory');
  };

  const returnToMenu = () => {
    setBenchmarkMode(false);
    setBenchmarkResult(null);
    setGameState('menu');
  };

  const handleBenchmarkComplete = (result: BenchmarkResult) => {
    setBenchmarkResult(result);
    setBenchmarkMode(false);
    setGameState('gameOver');
  };

  return (
    <div className="w-full h-full bg-gray-900 text-white">
      {gameState === 'menu' && (
        <MainMenu
          onStartGame={(characterClass) => startGame(characterClass, false)}
          onStartBenchmark={(characterClass) => startGame(characterClass, true)}
        />
      )}

      {gameState === 'loading' && <LoadingScreen startup />}
      
      {gameState === 'playing' && (
        <Game
          onGameOver={handleGameOver}
          onVictory={handleVictory}
          benchmarkMode={benchmarkMode}
          onBenchmarkComplete={handleBenchmarkComplete}
        />
      )}

      {(gameState === 'gameOver' || gameState === 'victory') && (
        <GameOverScreen
          won={gameState === 'victory'}
          stats={gameStats}
          benchmarkResult={benchmarkResult}
          onReturnToMenu={returnToMenu}
          onPlayAgain={() => startGame(useGameStore.getState().characterClass)}
        />
      )}
    </div>
  );
}

export default App;

import React, { useEffect, useRef, useState } from 'react';
import Game from './components/Game';
import MainMenu from './components/MainMenu';
import GameOverScreen from './components/GameOverScreen';
import LoadingScreen from './components/LoadingScreen';
import type { BenchmarkResult } from './components/BenchmarkOverlay';
import { CharacterClass, GameState } from './types/game';
import { useGameStore } from './store/gameStore';
import { setBgmActive, preloadAllAudio } from './audio/audioManager';
import { ensureTextures } from './pixi/pixiTextures';

const LOADING_MIN_MS = 650;

function App() {
  const [gameState, setGameState] = useState<GameState>('menu');
  const [loadingClass, setLoadingClass] = useState<CharacterClass>('warrior');
  const [benchmarkMode, setBenchmarkMode] = useState(false);
  const [benchmarkResult, setBenchmarkResult] = useState<BenchmarkResult | null>(null);
  const preloadPromiseRef = useRef<Promise<void> | null>(null);
  const pendingBenchmarkRef = useRef(false);
  const resetGame = useGameStore(state => state.resetGame);
  const gameStats = useGameStore(state => state.gameStats);

  useEffect(() => {
    // 起動時に必要な素材を全て先読み(テクスチャ + 音声/BGM/ダンストラック/SFX)。再生はしない。
    preloadPromiseRef.current = ensureTextures().catch(() => {});
    preloadAllAudio();
  }, []);

  useEffect(() => {
    void setBgmActive(gameState === 'playing');
  }, [gameState]);
  
  const startGame = async (characterClass: string, benchmark = false) => {
    const validClass = ['warrior', 'mage', 'rogue', 'necromancer'].includes(characterClass)
      ? characterClass as CharacterClass
      : 'warrior';

    setLoadingClass(validClass);
    pendingBenchmarkRef.current = benchmark;
    setBenchmarkMode(benchmark);
    setBenchmarkResult(null);
    setGameState('loading');

    const startedAt = performance.now();
    const preloadPromise = preloadPromiseRef.current ?? ensureTextures().catch(() => {});
    preloadPromiseRef.current = preloadPromise;
    await Promise.all([
      preloadPromise,
      new Promise(resolve => window.setTimeout(resolve, LOADING_MIN_MS)),
    ]);
    const remaining = LOADING_MIN_MS - (performance.now() - startedAt);
    if (remaining > 0) {
      await new Promise(resolve => window.setTimeout(resolve, remaining));
    }

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

      {gameState === 'loading' && (
        <LoadingScreen characterClass={loadingClass} benchmarkMode={benchmarkMode} />
      )}
      
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

import React, { useEffect, useState } from 'react';
import Game from './components/Game';
import MainMenu from './components/MainMenu';
import GameOverScreen from './components/GameOverScreen';
import LoadingScreen from './components/LoadingScreen';
import { CharacterClass, GameState } from './types/game';
import { useGameStore } from './store/gameStore';
import { setBgmActive } from './audio/audioManager';
import { ensureTextures } from './pixi/pixiTextures';

const LOADING_MIN_MS = 650;

function App() {
  const [gameState, setGameState] = useState<GameState>('menu');
  const [loadingClass, setLoadingClass] = useState<CharacterClass>('warrior');
  const resetGame = useGameStore(state => state.resetGame);
  const gameStats = useGameStore(state => state.gameStats);

  useEffect(() => {
    void setBgmActive(gameState === 'playing');
  }, [gameState]);
  
  const startGame = async (characterClass: string) => {
    const validClass = ['warrior', 'mage', 'rogue', 'necromancer'].includes(characterClass)
      ? characterClass as CharacterClass
      : 'warrior';

    setLoadingClass(validClass);
    setGameState('loading');

    const startedAt = performance.now();
    await Promise.all([
      ensureTextures().catch(() => {}),
      new Promise(resolve => window.setTimeout(resolve, LOADING_MIN_MS)),
    ]);
    const remaining = LOADING_MIN_MS - (performance.now() - startedAt);
    if (remaining > 0) {
      await new Promise(resolve => window.setTimeout(resolve, remaining));
    }

    resetGame(validClass);
    setGameState('playing');
  };

  const handleGameOver = () => {
    setGameState('gameOver');
  };

  const handleVictory = () => {
    setGameState('victory');
  };

  const returnToMenu = () => {
    setGameState('menu');
  };

  return (
    <div className="w-full h-full bg-gray-900 text-white">
      {gameState === 'menu' && (
        <MainMenu onStartGame={startGame} />
      )}

      {gameState === 'loading' && (
        <LoadingScreen characterClass={loadingClass} />
      )}
      
      {gameState === 'playing' && (
        <Game onGameOver={handleGameOver} onVictory={handleVictory} />
      )}

      {(gameState === 'gameOver' || gameState === 'victory') && (
        <GameOverScreen
          won={gameState === 'victory'}
          stats={gameStats}
          onReturnToMenu={returnToMenu}
          onPlayAgain={() => startGame(useGameStore.getState().characterClass)}
        />
      )}
    </div>
  );
}

export default App;

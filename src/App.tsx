import React, { useState } from 'react';
import Game from './components/Game';
import MainMenu from './components/MainMenu';
import GameOverScreen from './components/GameOverScreen';
import { GameState } from './types/game';
import { useGameStore } from './store/gameStore';

function App() {
  const [gameState, setGameState] = useState<GameState>('menu');
  const resetGame = useGameStore(state => state.resetGame);
  const gameStats = useGameStore(state => state.gameStats);
  
  const startGame = (characterClass: string) => {
    resetGame(characterClass);
    setGameState('playing');
  };

  const handleGameOver = () => {
    setGameState('gameOver');
  };

  const returnToMenu = () => {
    setGameState('menu');
  };

  return (
    <div className="w-full h-full bg-gray-900 text-white">
      {gameState === 'menu' && (
        <MainMenu onStartGame={startGame} />
      )}
      
      {gameState === 'playing' && (
        <Game onGameOver={handleGameOver} />
      )}
      
      {gameState === 'gameOver' && (
        <GameOverScreen 
          stats={gameStats}
          onReturnToMenu={returnToMenu}
          onPlayAgain={() => startGame(useGameStore.getState().characterClass)}
        />
      )}
    </div>
  );
}

export default App;